/* ===================================================================
   APPLICATION SCRIPT — see clearly labelled sections below:
     1. CONFIG & CONSTANTS
     2. TIME UTILITIES (London civil time / UTC / BST handling)
     3. ASTRONOMY MODULE (wraps Astronomy Engine)
     4. FORMAT HELPERS
     5. SCENE MODULE (Three.js — Trafalgar Square construction)
     6. STARFIELD MODULE (seeded decorative stars)
     7. MOON PHASE PANEL (2D canvas illustration)
     8. CAMERA / KEYBOARD CONTROLS
     9. UI WIRING
    10. MAIN LOOP & INITIALISATION / SELF-TESTS
   =================================================================== */
'use strict';

/* =====================================================================
   1. CONFIG & CONSTANTS
   ===================================================================== */
const CONFIG = Object.freeze({
  lat: 51.508045,
  lon: -0.128217,      // negative = west, matches Astronomy Engine convention
  elevationM: 25,
  sceneUnitsPerMetre: 1,     // 1 Three.js unit = 1 metre
  celestialDistance: 620,    // units — fixed "dome" distance for Sun/Moon placement
  starDistance: 900,
  seed: 20260730,            // fixed seed for decorative star field
});

const SUN_RADIUS_KM = 695700.0;
const MOON_RADIUS_KM = 1737.4;
const KM_PER_AU = 149597870.7;

const COMPASS_16 = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

function compassDirection(azDeg){
  const idx = Math.round(((azDeg % 360) + 360) % 360 / 22.5) % 16;
  return COMPASS_16[idx];
}

function deg2rad(d){ return d * Math.PI/180; }
function rad2deg(r){ return r * 180/Math.PI; }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

/* Simple deterministic PRNG (mulberry32) so the decorative star field
   is fixed and does not reshuffle on reload. */
function mulberry32(seed){
  return function(){
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* =====================================================================
   2. TIME UTILITIES
   London civil time (GMT/BST) handling using the Intl API, since the
   JS engine's local timezone cannot be assumed to be Europe/London.
   ===================================================================== */
const LONDON_TZ = 'Europe/London';

const londonPartsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: LONDON_TZ, hour12:false,
  year:'numeric', month:'2-digit', day:'2-digit',
  hour:'2-digit', minute:'2-digit', second:'2-digit'
});

const londonTzNameFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: LONDON_TZ, hour12:false, hour:'2-digit', minute:'2-digit',
  timeZoneName:'short'
});

/** Returns {year,month,day,hour,minute,second} of a JS Date as seen in London. */
function londonParts(utcDate){
  const parts = londonPartsFormatter.formatToParts(utcDate);
  const p = {};
  for(const part of parts){ if(part.type !== 'literal') p[part.type] = parseInt(part.value,10); }
  return p;
}

/** Returns the current UTC offset of London (in minutes, e.g. +60 during BST) at a given instant. */
function londonOffsetMinutes(utcDate){
  const p = londonParts(utcDate);
  const asIfUTC = Date.UTC(p.year, p.month-1, p.day, p.hour, p.minute, p.second);
  return Math.round((asIfUTC - utcDate.getTime()) / 60000);
}

function isBST(utcDate){ return londonOffsetMinutes(utcDate) !== 0; }

/** Converts civil-London wall-clock components (as typed by a user) into the
    correct absolute UTC instant, correctly resolving GMT/BST. Uses a fixed-point
    iteration since the offset itself depends on the (unknown) UTC instant. */
function londonWallClockToUTC(year, month, day, hour, minute, second){
  second = second || 0;
  let guessUTC = Date.UTC(year, month-1, day, hour, minute, second);
  for(let i=0;i<3;i++){
    const offset = londonOffsetMinutes(new Date(guessUTC));
    const candidate = Date.UTC(year, month-1, day, hour, minute, second) - offset*60000;
    if(candidate === guessUTC) { guessUTC = candidate; break; }
    guessUTC = candidate;
  }
  return new Date(guessUTC);
}

function pad2(n){ return String(n).padStart(2,'0'); }

/** Formats a UTC Date for the datetime-local <input> in the currently selected
    display zone (London civil or UTC), as YYYY-MM-DDTHH:MM:SS */
function formatForDateTimeInput(utcDate, useLondon){
  if(useLondon){
    const p = londonParts(utcDate);
    return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`;
  } else {
    return `${utcDate.getUTCFullYear()}-${pad2(utcDate.getUTCMonth()+1)}-${pad2(utcDate.getUTCDate())}T`+
           `${pad2(utcDate.getUTCHours())}:${pad2(utcDate.getUTCMinutes())}:${pad2(utcDate.getUTCSeconds())}`;
}
}

/** Parses the value of a datetime-local input (assumed to represent either
    London civil time or UTC, per the current toggle) into an absolute UTC Date. */
function parseDateTimeInput(value, useLondon){
  // value like "2026-07-30T14:05:00" (seconds optional)
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if(!m) return null;
  const [ , y, mo, d, h, mi, s ] = m.map(Number);
  if(useLondon){
    return londonWallClockToUTC(y, mo, d, h, mi, s||0);
  } else {
    return new Date(Date.UTC(y, mo-1, d, h, mi, s||0));
  }
}

function formatLondonDateLong(utcDate){
  const p = londonParts(utcDate);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const weekday = new Intl.DateTimeFormat('en-GB', {timeZone:LONDON_TZ, weekday:'long'}).format(utcDate);
  return `${weekday} ${p.day} ${months[p.month-1]} ${p.year}`;
}

function formatUtcDateLong(utcDate){
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const weekday = new Intl.DateTimeFormat('en-GB', {timeZone:'UTC', weekday:'long'}).format(utcDate);
  return `${weekday} ${utcDate.getUTCDate()} ${months[utcDate.getUTCMonth()]} ${utcDate.getUTCFullYear()}`;
}

/* =====================================================================
   3. ASTRONOMY MODULE
   Wraps Astronomy Engine (cosinekitty/astronomy, v2.1.19) to produce a
   single, UI-ready data object for the Sun and Moon at a given instant.
   ===================================================================== */
const Astro = (function(){
  const A = window.Astronomy;
  let observer = null;
  let ready = false;
  let initError = null;

  function init(){
    try{
      if(!A) throw new Error('Astronomy Engine did not load.');
      observer = new A.Observer(CONFIG.lat, CONFIG.lon, CONFIG.elevationM);
      ready = true;
    }catch(e){
      initError = e;
      ready = false;
    }
    return ready;
  }

  function angularDiameterDeg(radiusKm, distanceAU){
    const distKm = distanceAU * KM_PER_AU;
    return rad2deg(2 * Math.asin(clamp(radiusKm/distKm, -1, 1)));
  }

  /** Core per-body computation: equatorial (of-date & J2000), horizontal
      (refracted), distance and angular diameter. */
  function bodyPosition(bodyName, date){
    const body = A.Body[bodyName];
    const eqOfDate = A.Equator(body, date, observer, true, true);
    const eqJ2000  = A.Equator(body, date, observer, false, true);
    const hor      = A.Horizon(date, observer, eqOfDate.ra, eqOfDate.dec, 'normal');
    const horTrue  = A.Horizon(date, observer, eqOfDate.ra, eqOfDate.dec, null);
    const radiusKm = bodyName === 'Sun' ? SUN_RADIUS_KM : MOON_RADIUS_KM;
    return {
      raOfDate: eqOfDate.ra, decOfDate: eqOfDate.dec,
      raJ2000: eqJ2000.ra, decJ2000: eqJ2000.dec,
      distAU: eqOfDate.dist,
      azimuth: hor.azimuth,
      altitude: hor.altitude,           // refraction-corrected ("refracted altitude")
      trueAltitude: horTrue.altitude,   // geometric, no refraction — used to decide horizon crossing
      angularDiameterDeg: angularDiameterDeg(radiusKm, eqOfDate.dist),
    };
  }

  /** Next rise / upper culmination / set for a body, searched forward from `date`. */
  function events(bodyName, date){
    const body = A.Body[bodyName];
    const out = { rise:null, culm:null, set:null };
    try{
      const rise = A.SearchRiseSet(body, observer, +1, date, 366);
      out.rise = rise ? rise.date : null;
    }catch(e){ /* leave null */ }
    try{
      const set = A.SearchRiseSet(body, observer, -1, date, 366);
      out.set = set ? set.date : null;
    }catch(e){ /* leave null */ }
    try{
      const hourAngleResult = A.SearchHourAngle(body, observer, 0, date);
      if(hourAngleResult){
        out.culm = { time: hourAngleResult.time.date, altitude: hourAngleResult.hor.altitude, azimuth: hourAngleResult.hor.azimuth };
      }
    }catch(e){ /* leave null */ }
    return out;
  }

  /** Moon-specific: phase angle / illuminated fraction / bright-limb geometry. */
  function moonPhaseInfo(date){
    const elong = A.MoonPhase(date);                 // 0=new,90=1Q,180=full,270=3Q
    const illum = A.Illumination(A.Body.Moon, date);  // .phase_fraction
    // Meeus (48.5): position angle of the midpoint of the bright limb, measured
    // from celestial north, going east — computed from of-date equatorial coords.
    const sunEq  = A.Equator(A.Body.Sun,  date, observer, true, true);
    const moonEq = A.Equator(A.Body.Moon, date, observer, true, true);
    const ra_s = deg2rad(sunEq.ra*15), dec_s = deg2rad(sunEq.dec);
    const ra_m = deg2rad(moonEq.ra*15), dec_m = deg2rad(moonEq.dec);
    const dRa = ra_s - ra_m;
    const chi = Math.atan2(
      Math.cos(dec_s) * Math.sin(dRa),
      Math.sin(dec_s) * Math.cos(dec_m) - Math.cos(dec_s) * Math.sin(dec_m) * Math.cos(dRa)
    );
    // Parallactic angle q, to rotate from equatorial-north reference to the
    // observer's local zenith reference (how the crescent actually looks tilted
    // in the sky, not just relative to celestial north).
    const gast = A.SiderealTime(date); // hours
    const lst = gast + CONFIG.lon/15;
    const ha = deg2rad((lst*15) - moonEq.ra*15);
    const lat = deg2rad(CONFIG.lat);
    const q = Math.atan2(Math.sin(ha), Math.tan(lat)*Math.cos(dec_m) - Math.sin(dec_m)*Math.cos(ha));
    const brightLimbFromZenith = chi - q; // radians, measured from "up" (zenith direction) clockwise

    let phaseName;
    const frac = illum.phase_fraction;
    const waxing = ((elong + 360) % 360) < 180;
    if(elong < 1 || elong > 359) phaseName = 'New Moon';
    else if(Math.abs(elong-90) < 1) phaseName = 'First Quarter';
    else if(Math.abs(elong-180) < 1) phaseName = 'Full Moon';
    else if(Math.abs(elong-270) < 1) phaseName = 'Last Quarter';
    else if(elong < 90) phaseName = 'Waxing Crescent';
    else if(elong < 180) phaseName = 'Waxing Gibbous';
    else if(elong < 270) phaseName = 'Waning Gibbous';
    else phaseName = 'Waning Crescent';

    return {
      elongationDeg: elong,
      illuminatedFraction: frac,
      phaseName, waxing,
      brightLimbAngleFromZenith: brightLimbFromZenith, // radians
      brightLimbAngleFromNorth: chi,
      parallacticAngle: q,
    };
  }

  function sunAltitudeAt(date){
    const eq = A.Equator(A.Body.Sun, date, observer, true, true);
    const hor = A.Horizon(date, observer, eq.ra, eq.dec, null);
    return hor.altitude;
  }

  /** Full snapshot used to drive the whole UI + scene for a given instant. */
  function compute(date){
    const sun = bodyPosition('Sun', date);
    const moon = bodyPosition('Moon', date);
    const sunEvents = events('Sun', date);
    const moonEvents = events('Moon', date);
    const phase = moonPhaseInfo(date);
    return { date, sun, moon, sunEvents, moonEvents, phase };
  }

  return { init, get ready(){ return ready; }, get error(){ return initError; }, get observer(){ return observer; }, compute, sunAltitudeAt };
})();

/* =====================================================================
   4. FORMAT HELPERS
   ===================================================================== */
function fmtDeg(d, dp=1){ return `${d.toFixed(dp)}°`; }

function fmtAzimuth(az){ return `${az.toFixed(1)}° ${compassDirection(az)}`; }

function fmtAltitude(alt){
  const sign = alt >= 0 ? '+' : '';
  return `${sign}${alt.toFixed(2)}°`;
}

/** Right ascension in hours -> "HHh MMm SSs" */
function fmtRA(hours){
  let h = ((hours % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h-hh)*60);
  const ss = (((h-hh)*60)-mm)*60;
  return `${pad2(hh)}h ${pad2(mm)}m ${ss.toFixed(1).padStart(4,'0')}s`;
}

/** Declination in degrees -> "+DD° MM' SS.s"" */
function fmtDec(deg){
  const sign = deg < 0 ? '-' : '+';
  const a = Math.abs(deg);
  const dd = Math.floor(a);
  const mm = Math.floor((a-dd)*60);
  const ss = (((a-dd)*60)-mm)*60;
  return `${sign}${pad2(dd)}° ${pad2(mm)}' ${ss.toFixed(1).padStart(4,'0')}"`;
}

function fmtDistanceAU(distAU, isMoon){
  if(isMoon){
    const km = distAU*KM_PER_AU;
    return `${km.toLocaleString('en-GB',{maximumFractionDigits:0})} km`;
  }
  return `${distAU.toFixed(5)} AU (${(distAU*KM_PER_AU/1e6).toFixed(2)} million km)`;
}

function fmtAngularDiameter(deg){
  const arcmin = deg*60;
  const arcsec = deg*3600;
  if(arcmin >= 1) return `${arcmin.toFixed(2)}′ (${(deg).toFixed(4)}°)`;
  return `${arcsec.toFixed(1)}″`;
}

function fmtTimeOnly(date, useLondon){
  if(useLondon){
    const p = londonParts(date);
    return `${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`;
  }
  return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`;
}

function fmtEventTime(date, useLondon){
  if(!date) return 'not in next 24 h period searched';
  const dayStr = useLondon ? formatLondonDateLong(date) : formatUtcDateLong(date);
  return `${fmtTimeOnly(date, useLondon)} · ${dayStr}`;
}

function fmtCulmination(culm, useLondon){
  if(!culm) return { time:'—', alt:'—', dir:'—' };
  return {
    time: fmtEventTime(culm.time, useLondon),
    alt: fmtAltitude(culm.altitude),
    dir: `${culm.azimuth.toFixed(1)}° ${compassDirection(culm.azimuth)}`
  };
}

function dataItem(k, v, full){
  return `<div class="data-item${full?' full':''}"><span class="k">${k}</span><span class="v">${v}</span></div>`;
}

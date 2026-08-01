const loadingCard = document.querySelector('#hqLoading .hq-loading-card');
const loadingTitle = loadingCard?.querySelector('strong');
const loadingDetail = loadingCard?.querySelector('span');

const setStage = (name, message) => {
  window.__cpBootstrapStage = name;
  console.info('[London 3D]', name, message || '');
  if (loadingDetail && message) loadingDetail.textContent = message;
};

const showFatalError = error => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  window.__cpBootstrapError = message;
  console.error('[London 3D startup failure]', error);
  if (loadingTitle) loadingTitle.textContent = 'Unable to start London 3D';
  if (loadingDetail) loadingDetail.textContent = `${message} · Press Ctrl+F5 to retry.`;
  if (loadingCard) loadingCard.style.borderColor = 'rgba(255,120,120,.65)';
};

window.addEventListener('error', event => {
  if (!window.__cpModelReady) showFatalError(event.error || event.message);
});
window.addEventListener('unhandledrejection', event => {
  if (!window.__cpModelReady) showFatalError(event.reason);
});

const bytesToResponse = (bytes, contentType) => {
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'no-store'
    }
  });
};

const gunzipIfNeeded = async bytes => {
  if (!(bytes[0] === 0x1f && bytes[1] === 0x8b)) return bytes;
  if (!('DecompressionStream' in window)) {
    throw new Error('This browser cannot decompress the London 3D files. Please use a current Chrome, Edge, Firefox or Safari browser.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const nativeFetch = window.fetch.bind(window);

try {
  setStage('bootstrap-v383', 'Bootstrap 3.8.3 active · aligning the celestial coordinate frame…');

  window.fetch = async (input, init) => {
    const requested = typeof input === 'string' ? input : (input && input.url) || '';
    if (/trafalgar-square-stable-v38\.glb(?:[?#]|$)/.test(requested)) {
      setStage('model-download', 'Downloading the Trafalgar Square model…');
      const modelUrl = new URL('./models/trafalgar-square-stable-v38.glb.gz?build=383-20260801', location.href);
      const response = await nativeFetch(modelUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Trafalgar model download failed (${response.status})`);
      const raw = new Uint8Array(await response.arrayBuffer());
      setStage('model-decompression', `Preparing the Trafalgar Square model · ${(raw.byteLength / 1048576).toFixed(1)} MB received…`);
      const model = await gunzipIfNeeded(raw);
      if (model.byteLength < 12 || model[0] !== 0x67 || model[1] !== 0x6c || model[2] !== 0x54 || model[3] !== 0x46) {
        throw new Error('The downloaded Trafalgar model is not a valid GLB file');
      }
      setStage('model-parsing', `Building the 3D world · ${(model.byteLength / 1048576).toFixed(1)} MB model…`);
      return bytesToResponse(model, 'model/gltf-binary');
    }
    return nativeFetch(input, init);
  };

  setStage('application-download', 'Downloading the London 3D application…');
  const appUrl = new URL('./assets/cubic-postcode-beacon-react-timeline-v38.js.gz?build=383-20260801', location.href);
  const appResponse = await nativeFetch(appUrl, { cache: 'no-store' });
  if (!appResponse.ok) throw new Error(`Application download failed (${appResponse.status})`);
  const appRaw = new Uint8Array(await appResponse.arrayBuffer());
  setStage('application-decompression', `Preparing the application · ${(appRaw.byteLength / 1024).toFixed(0)} KB received…`);
  const appBytes = await gunzipIfNeeded(appRaw);
  let source = new TextDecoder('utf-8', { fatal: true }).decode(appBytes);
  if (!source.includes('Cubic Postcode Celestial Beacon React V3.8')) {
    throw new Error('The downloaded application bundle failed its integrity check');
  }

  // The detailed Trafalgar GLB uses +X=east and -Z=north. The original
  // astronomy mapping incorrectly treated +Z as north, mirroring every
  // celestial bearing across the east-west axis. Correct the shared Sun/Moon
  // horizontal-to-world transform before executing the self-contained bundle.
  const directionOld = 'function CpDir(e,t){let n=e*Math.PI/180,r=t*Math.PI/180,i=Math.cos(r);return new U(i*Math.sin(n),Math.sin(r),i*Math.cos(n)).normalize()}';
  const directionNew = 'function CpDir(e,t){let n=e*Math.PI/180,r=t*Math.PI/180,i=Math.cos(r);return new U(i*Math.sin(n),Math.sin(r),-i*Math.cos(n)).normalize()}';
  if (!source.includes(directionOld)) {
    throw new Error('The celestial direction signature was not found in the London 3D application');
  }
  source = source.replace(directionOld, directionNew);
  window.__cpCelestialFrame = { east: '+X', north: '-Z', version: '3.8.3' };

  setStage('application-execution', 'Starting the geographically aligned React 3D application…');
  (0, eval)(`${source}\n//# sourceURL=london3d-v383-runtime.js`);
  setStage('application-running', 'Application started · waiting for the 3D model…');

  const startedAt = performance.now();
  const watchdog = setInterval(() => {
    if (window.__cpModelReady) {
      clearInterval(watchdog);
      setStage('ready', 'London 3D is ready.');
      return;
    }
    if (performance.now() - startedAt > 90000) {
      clearInterval(watchdog);
      showFatalError(new Error(`The application started, but the model did not finish loading. Last stage: ${window.__cpBootstrapStage || 'unknown'}`));
    }
  }, 500);
} catch (error) {
  showFatalError(error);
}

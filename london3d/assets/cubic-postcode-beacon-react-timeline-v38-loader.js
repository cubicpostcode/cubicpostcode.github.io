const response = await fetch('./cubic-postcode-beacon-react-timeline-v38.js.gz', { cache: 'force-cache' });
if (!response.ok) throw new Error(`Unable to load the application bundle (${response.status})`);
if (!response.body) throw new Error('The application bundle response has no readable stream.');
if (!('DecompressionStream' in window)) throw new Error('This browser cannot decompress the application bundle. Please use a current Chromium, Firefox, or Safari browser.');
const source = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).text();
const objectUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
try { await import(objectUrl); } finally { URL.revokeObjectURL(objectUrl); }

const parts = [
  './app-v38-b64x-00.txt',
  './app-v38-b64x-01.txt',
  './app-v38-b64x-02.txt',
  './app-v38-b64x-03.txt',
  './app-v38-b64x-04.txt',
  './app-v38-b64x-05.txt',
  './app-v38-b64x-06.txt',
  './app-v38-b64x-07.txt',
  './app-v38-b64x-08.txt'
];
const b64 = (await Promise.all(parts.map(async url => {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Unable to load application bundle part ${url} (${response.status})`);
  return response.text();
}))).join('');
const binary = atob(b64);
const bytes = new Uint8Array(binary.length);
for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
if (!('DecompressionStream' in window)) throw new Error('This browser cannot decompress the application bundle. Please use a current browser.');
const source = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
const objectUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
try { await import(objectUrl); } finally { URL.revokeObjectURL(objectUrl); }

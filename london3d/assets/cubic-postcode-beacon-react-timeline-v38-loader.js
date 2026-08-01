const showFatalError = error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('London 3D startup failure:', error);
  const card = document.querySelector('#hqLoading .hq-loading-card');
  if (!card) return;
  const title = card.querySelector('strong');
  const detail = card.querySelector('span');
  if (title) title.textContent = 'Unable to start London 3D';
  if (detail) detail.textContent = `${message} · Press Ctrl+F5 to retry.`;
  card.style.borderColor = 'rgba(255,120,120,.55)';
};

window.addEventListener('error', event => {
  if (!window.__cpModelReady) showFatalError(event.error || event.message);
});
window.addEventListener('unhandledrejection', event => {
  if (!window.__cpModelReady) showFatalError(event.reason);
});

const gunzipIfNeeded = async bytes => {
  if (!(bytes[0] === 0x1f && bytes[1] === 0x8b)) return bytes;
  if (!('DecompressionStream' in window)) {
    throw new Error('This browser cannot decompress the London 3D files. Please use a current Chrome, Edge, Firefox, or Safari browser.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

try {
  // Replace the original model interceptor with one that works whether GitHub
  // serves the .gz bytes compressed or transparently decompresses them.
  const previousFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const requested = typeof input === 'string' ? input : (input && input.url) || '';
    if (/trafalgar-square-stable-v38\.glb(?:[?#]|$)/.test(requested)) {
      const compressedUrl = new URL('./models/trafalgar-square-stable-v38.glb.gz?v=384', location.href);
      const response = await previousFetch(compressedUrl, { ...init, cache: 'no-store' });
      if (!response.ok) throw new Error(`Unable to load the Trafalgar Square model (${response.status})`);
      const encoded = new Uint8Array(await response.arrayBuffer());
      const model = await gunzipIfNeeded(encoded);
      const headers = new Headers();
      headers.set('Content-Type', 'model/gltf-binary');
      headers.set('Content-Length', String(model.byteLength));
      return new Response(model, { status: 200, headers });
    }
    return previousFetch(input, init);
  };

  const response = await fetch('./cubic-postcode-beacon-react-timeline-v38.js.gz?v=384', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load the London 3D application (${response.status})`);
  const encoded = new Uint8Array(await response.arrayBuffer());
  const scriptBytes = await gunzipIfNeeded(encoded);
  const source = new TextDecoder('utf-8').decode(scriptBytes);

  // The production bundle is self-contained. Executing it as a classic script
  // avoids blob-module restrictions and preserves document-relative model URLs.
  new Function(`${source}\n//# sourceURL=london3d-v38-application.js`)();
  window.__cpApplicationLoaded = true;
} catch (error) {
  showFatalError(error);
}

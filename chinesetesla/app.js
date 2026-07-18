/* Chinese Tesla static runtime loader. */
(async () => {
  const list = document.getElementById('sentence-list');
  try {
    if (!('DecompressionStream' in globalThis)) {
      throw new Error('This browser is too old to run the sentence engine.');
    }
    const names = ['app-1.txt', 'app-2.txt', 'app-3.txt', 'app-4.txt'];
    const parts = await Promise.all(names.map(async (name) => {
      const response = await fetch(name, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Could not load ${name}.`);
      return response.text();
    }));
    const encoded = parts.join('').replace(/\s+/g, '');
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const source = await new Response(stream).text();
    new Function(source)();
  } catch (error) {
    console.error(error);
    if (list) {
      list.innerHTML = '<p class="noscript">The sentence engine could not start. Please refresh in a current version of Chrome, Safari, Edge or Firefox.</p>';
    }
  }
})();

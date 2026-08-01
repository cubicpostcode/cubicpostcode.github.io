const parts = [
  './cubic-postcode-beacon-react-timeline-v38.part00.txt',
  './cubic-postcode-beacon-react-timeline-v38.part01.txt',
  './cubic-postcode-beacon-react-timeline-v38.part02.txt',
  './cubic-postcode-beacon-react-timeline-v38.part03.txt',
  './cubic-postcode-beacon-react-timeline-v38.part04.txt',
  './cubic-postcode-beacon-react-timeline-v38.part05.txt',
  './cubic-postcode-beacon-react-timeline-v38.part06.txt',
  './cubic-postcode-beacon-react-timeline-v38.part07.txt'
];
const source = (await Promise.all(parts.map(async url => {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Unable to load application bundle part ${url} (${response.status})`);
  return response.text();
}))).join('');
const objectUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
try {
  await import(objectUrl);
} finally {
  URL.revokeObjectURL(objectUrl);
}

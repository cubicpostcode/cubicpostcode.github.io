(() => {
  'use strict';

  const VERSION = '20260718-rebuild-4';
  const DATA_FILES = [
    ...Array.from({ length: 6 }, (_, i) => `data/corpus-${String(i + 1).padStart(2, '0')}.json?v=${VERSION}`),
    `data/corpus-07a.json?v=${VERSION}`,
    `data/corpus-07b.json?v=${VERSION}`,
    `data/corpus-08a.json?v=${VERSION}`,
    `data/corpus-08b.json?v=${VERSION}`
  ];
  const COLORS = ['#1565c0', '#7b1fa2', '#00897b', '#ef6c00', '#c62828', '#2e7d32', '#6a1b9a', '#0277bd'];
  const BATCH_SIZE = 50;
  const RECENT_LIMIT = 250;

  const $ = (selector) => document.querySelector(selector);
  const list = $('#sentence-list');
  const template = $('#sentence-template');
  const countElement = $('#visible-count');
  const shuffleButton = $('#shuffle-button');
  const speedButton = $('#speed-button');
  const legendButton = $('#legend-button');
  const legend = $('#legend');
  const sentinel = $('#load-sentinel');

  let tokenDictionary = [];
  let corpus = [];
  let ordered = [];
  let shown = 0;
  let slowAudio = false;
  let observer = null;

  const punctuation = (kind) => kind === 'q' ? '？' : '。';
  const englishPunctuation = (kind) => kind === 'q' ? '?' : '.';

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function sentenceTokens(item) {
    return item[1].map((tokenIndex) => tokenDictionary[tokenIndex]);
  }

  function sentenceText(item) {
    return sentenceTokens(item).map((token) => token[0]).join('') + punctuation(item[0]);
  }

  function sentenceId(item) {
    const text = sentenceText(item);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function readRecent() {
    try {
      const value = JSON.parse(localStorage.getItem('ct-recent-v3') || '[]');
      return Array.isArray(value) ? value.slice(0, RECENT_LIMIT) : [];
    } catch {
      return [];
    }
  }

  function saveRecent(items) {
    try {
      localStorage.setItem('ct-recent-v3', JSON.stringify(items.slice(0, RECENT_LIMIT).map(sentenceId)));
    } catch {
      // The app remains fully functional when local storage is unavailable.
    }
  }

  function smartShuffle(items) {
    const recent = new Set(readRecent());
    const questions = [];
    const statements = [];

    for (const item of items) {
      (item[0] === 'q' ? questions : statements).push(item);
    }

    shuffle(questions);
    shuffle(statements);
    questions.sort((a, b) => Number(recent.has(sentenceId(a))) - Number(recent.has(sentenceId(b))));
    statements.sort((a, b) => Number(recent.has(sentenceId(a))) - Number(recent.has(sentenceId(b))));

    const result = [];
    while (questions.length || statements.length) {
      const block = [];
      block.push(...questions.splice(0, 10), ...statements.splice(0, 10));
      shuffle(block);
      result.push(...block);
    }
    return result;
  }

  function makeToken(token, originalIndex, lineType, firstEnglish) {
    const [zh, py, en, role] = token;
    const text = lineType === 'zh' ? zh : lineType === 'py' ? py : en;
    if (!text) return null;

    const span = document.createElement('span');
    span.className = `token role-${role || 'other'}`;
    span.style.setProperty('--token-color', COLORS[originalIndex % COLORS.length]);
    span.textContent = lineType === 'en' && firstEnglish
      ? text.replace(/^([a-zà-öø-ÿ])/, (letter) => letter.toUpperCase())
      : text;
    return span;
  }

  function paintLine(line, item, lineType) {
    const tokens = sentenceTokens(item);
    const order = lineType === 'en' ? item[2] : tokens.map((_, index) => index);
    let firstEnglish = true;

    for (const originalIndex of order) {
      const span = makeToken(tokens[originalIndex], originalIndex, lineType, firstEnglish);
      if (!span) continue;
      line.append(span);
      if (lineType === 'en') firstEnglish = false;
    }
  }

  function appendPunctuation(line, mark) {
    const span = document.createElement('span');
    span.className = 'punctuation';
    span.textContent = mark;
    line.append(span);
  }

  function chooseMandarinVoice() {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    return voices.find((voice) => /^zh[-_]CN$/i.test(voice.lang))
      || voices.find((voice) => /^zh/i.test(voice.lang))
      || null;
  }

  function speak(item, button) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(sentenceTokens(item).map((token) => token[0]).join(''));
    utterance.lang = 'zh-CN';
    utterance.rate = slowAudio ? 0.58 : 0.86;
    utterance.voice = chooseMandarinVoice();

    button.classList.add('is-speaking');
    const finish = () => button.classList.remove('is-speaking');
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }

  function renderBatch(size = BATCH_SIZE) {
    if (!ordered.length) return;
    const fragment = document.createDocumentFragment();

    for (let count = 0; count < size && shown < ordered.length; count += 1, shown += 1) {
      const item = ordered[shown];
      const node = template.content.firstElementChild.cloneNode(true);
      const mandarin = node.querySelector('.mandarin-line');
      const pinyin = node.querySelector('.pinyin-line');
      const english = node.querySelector('.english-line');
      const audioButton = node.querySelector('.speak-button');

      node.dataset.kind = item[0] === 'q' ? 'question' : 'statement';
      node.querySelector('.card-number').textContent = String(shown + 1).padStart(5, '0');

      paintLine(mandarin, item, 'zh');
      paintLine(pinyin, item, 'py');
      paintLine(english, item, 'en');
      appendPunctuation(mandarin, punctuation(item[0]));
      appendPunctuation(english, englishPunctuation(item[0]));

      const play = () => speak(item, audioButton);
      mandarin.addEventListener('click', play);
      audioButton.addEventListener('click', play);
      node.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          play();
        }
      });

      fragment.append(node);
    }

    list.append(fragment);
    countElement.textContent = shown.toLocaleString('en-GB');
    if (shown >= ordered.length) observer?.disconnect();
  }

  function resetOrder({ scroll = false } = {}) {
    window.speechSynthesis?.cancel?.();
    ordered = smartShuffle(corpus);
    list.textContent = '';
    shown = 0;
    renderBatch();
    saveRecent(ordered.slice(0, RECENT_LIMIT));

    if (scroll) {
      window.scrollTo({ top: Math.max(0, list.offsetTop - 150), behavior: 'smooth' });
    }

    observer?.disconnect();
    observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) renderBatch();
    }, { rootMargin: '800px' });
    observer.observe(sentinel);
  }

  function showError(error) {
    console.error(error);
    list.innerHTML = '<p class="noscript">The rebuilt sentence collection could not load. Please refresh the page in a current browser.</p>';
    sentinel.hidden = true;
  }

  async function loadCorpus() {
    list.innerHTML = '<p class="loading-message">Loading the rebuilt 10,000-sentence collection…</p>';
    if (typeof globalThis.DecompressionStream !== 'function') {
      throw new Error('This browser does not support the static corpus decompressor.');
    }

    const parts = await Promise.all(DATA_FILES.map(async (url) => {
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Could not load ${url}`);
      return response.json();
    }));

    if (parts.length !== DATA_FILES.length || parts.some((part) => part.format !== 'chinese-tesla-corpus-v2' || part.compression !== 'gzip' || part.encoding !== 'base64' || typeof part.data !== 'string')) {
      throw new Error('Corpus package validation failed.');
    }

    const encoded = parts.map((part) => part.data).join('');
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new globalThis.DecompressionStream('gzip'));
    const compact = JSON.parse(await new Response(stream).text());

    tokenDictionary = compact.t;
    const loaded = compact.s;
    if (tokenDictionary.length !== 907) throw new Error(`Token dictionary validation failed: ${tokenDictionary.length}`);
    if (loaded.length !== 10000) throw new Error(`Expected 10,000 cards, received ${loaded.length}`);
    if (loaded.filter((item) => item[0] === 'q').length !== 5000) throw new Error('Question balance validation failed');

    corpus = loaded;
    list.textContent = '';
    resetOrder();
  }

  shuffleButton.addEventListener('click', () => resetOrder({ scroll: true }));
  speedButton.addEventListener('click', () => {
    slowAudio = !slowAudio;
    speedButton.setAttribute('aria-pressed', String(slowAudio));
    speedButton.innerHTML = `<span aria-hidden="true">◔</span> ${slowAudio ? 'Slow' : 'Normal'} audio`;
  });
  legendButton.addEventListener('click', () => {
    const opening = legend.hidden;
    legend.hidden = !opening;
    legendButton.setAttribute('aria-expanded', String(opening));
  });

  loadCorpus().catch(showError);
})();

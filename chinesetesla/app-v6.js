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
  const AUTOPLAY_PAUSE_MS = 950;

  // Browsers do not expose voice gender. These name hints let us make a
  // best-effort 50/50 choice when the operating system supplies identifiable
  // Mandarin voices; otherwise we still vary randomly between all available voices.
  const FEMALE_VOICE_HINTS = [
    'female', 'woman', 'ting-ting', 'tingting', 'huihui', 'yaoyao',
    'xiaoxiao', 'xiaoyi', 'xiaohan', 'xiaomeng', 'xiaomo', 'xiaorui',
    'xiaoshuang', 'xiaoxuan', 'xiaoyan', 'xiaozhen', 'xiaobei', 'xiaoni',
    'xiaoqiu', 'meijia', 'mei-jia', 'sin-ji', 'sinji', 'hsiaochen',
    'hsiao-chen', 'lili', '婷婷', '慧慧', '瑶瑶', '晓晓', '晓伊', '晓涵',
    '晓梦', '晓墨', '晓睿', '晓双', '晓萱', '晓颜', '晓甄', '美佳'
  ];
  const MALE_VOICE_HINTS = [
    'male', 'man', 'kangkang', 'yunxi', 'yunyang', 'yunjian', 'yunhao',
    'yunfeng', 'yunze', 'yunxia', 'yunye', 'li-mu', 'limu', 'yu-shu',
    'yushu', 'zhiwei', 'qiang', '康康', '云希', '云扬', '云健', '云皓',
    '云枫', '云泽', '云夏', '云野', '李穆', '余书', '志伟', '强'
  ];

  const $ = (selector) => document.querySelector(selector);
  const list = $('#sentence-list');
  const template = $('#sentence-template');
  const countElement = $('#visible-count');
  const autoplayButton = $('#autoplay-button');
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

  let autoplayOn = false;
  let autoplayIndex = 0;
  let autoplaySession = 0;
  let autoplayTimer = null;
  let activeAutoplayCard = null;

  let speechRun = 0;
  let speechWatchdog = null;
  let currentSpeakingButton = null;
  let voicePool = { all: [], female: [], male: [], unknown: [] };
  let lastVoiceKey = '';

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

  function spokenText(item) {
    return sentenceTokens(item).map((token) => token[0]).join('');
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

  function voiceKey(voice) {
    return voice?.voiceURI || `${voice?.name || ''}|${voice?.lang || ''}`;
  }

  function normalizedVoiceLabel(voice) {
    return `${voice?.name || ''} ${voice?.voiceURI || ''}`.toLowerCase();
  }

  function isMandarinVoice(voice) {
    const lang = String(voice?.lang || '').replace('_', '-').toLowerCase();
    const label = normalizedVoiceLabel(voice);
    if (/cantonese|hong\s*kong|\byue\b|粤|粵/.test(label)) return false;
    if (/^zh-(hk|mo)\b/.test(lang)) return false;
    return /^zh(?:$|-(cn|tw|sg)\b)/.test(lang)
      || /mandarin|putonghua|普通话|普通話|国语|國語/.test(label);
  }

  function classifyVoice(voice) {
    const label = normalizedVoiceLabel(voice);
    if (FEMALE_VOICE_HINTS.some((hint) => label.includes(hint))) return 'female';
    if (MALE_VOICE_HINTS.some((hint) => label.includes(hint))) return 'male';
    return 'unknown';
  }

  function refreshVoicePool() {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    const all = voices.filter(isMandarinVoice);
    const female = [];
    const male = [];
    const unknown = [];

    for (const voice of all) {
      const group = classifyVoice(voice);
      if (group === 'female') female.push(voice);
      else if (group === 'male') male.push(voice);
      else unknown.push(voice);
    }

    voicePool = { all, female, male, unknown };
    return voicePool;
  }

  function randomVoice(voices) {
    if (!voices.length) return null;
    const alternatives = voices.length > 1
      ? voices.filter((voice) => voiceKey(voice) !== lastVoiceKey)
      : voices;
    const candidates = alternatives.length ? alternatives : voices;
    const voice = candidates[Math.floor(Math.random() * candidates.length)];
    lastVoiceKey = voiceKey(voice);
    return voice;
  }

  function chooseMandarinVoice() {
    const pool = refreshVoicePool();

    // True 50/50 group selection when both recognisable groups exist.
    if (pool.female.length && pool.male.length) {
      return randomVoice(Math.random() < 0.5 ? pool.female : pool.male);
    }

    // On devices whose voice names do not reveal gender, vary voices anyway
    // and avoid immediately repeating the same one whenever possible.
    return randomVoice(pool.all);
  }

  function initialiseVoices() {
    refreshVoicePool();
    if (!window.speechSynthesis) return;
    if (typeof window.speechSynthesis.addEventListener === 'function') {
      window.speechSynthesis.addEventListener('voiceschanged', refreshVoicePool);
    } else {
      window.speechSynthesis.onvoiceschanged = refreshVoicePool;
    }
  }

  function cancelSpeech() {
    speechRun += 1;
    window.clearTimeout(speechWatchdog);
    speechWatchdog = null;
    currentSpeakingButton?.classList.remove('is-speaking');
    currentSpeakingButton = null;
    window.speechSynthesis?.cancel?.();
  }

  function speak(item, button, onComplete = null) {
    cancelSpeech();
    const run = speechRun;
    const text = spokenText(item);
    const estimatedDuration = Math.max(1600, text.length * (slowAudio ? 700 : 470));
    let finished = false;

    const finish = () => {
      if (finished || run !== speechRun) return;
      finished = true;
      window.clearTimeout(speechWatchdog);
      speechWatchdog = null;
      button?.classList.remove('is-speaking');
      if (currentSpeakingButton === button) currentSpeakingButton = null;
      onComplete?.();
    };

    currentSpeakingButton = button;
    button?.classList.add('is-speaking');

    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance !== 'function') {
      speechWatchdog = window.setTimeout(finish, estimatedDuration);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = slowAudio ? 0.58 : 0.86;
    utterance.voice = chooseMandarinVoice();
    utterance.onend = finish;
    utterance.onerror = finish;
    speechWatchdog = window.setTimeout(finish, estimatedDuration + 2200);
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
      node.dataset.index = String(shown);
      node.querySelector('.card-number').textContent = String(shown + 1).padStart(5, '0');

      paintLine(mandarin, item, 'zh');
      paintLine(pinyin, item, 'py');
      paintLine(english, item, 'en');
      appendPunctuation(mandarin, punctuation(item[0]));
      appendPunctuation(english, englishPunctuation(item[0]));

      const play = () => {
        if (autoplayOn) stopAutoplay();
        speak(item, audioButton);
      };
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

  function clearAutoplayCard() {
    activeAutoplayCard?.classList.remove('is-autoplaying');
    activeAutoplayCard = null;
  }

  function updateAutoplayButton() {
    autoplayButton.setAttribute('aria-pressed', String(autoplayOn));
    autoplayButton.innerHTML = autoplayOn
      ? '<span aria-hidden="true">■</span> Play: on'
      : '<span aria-hidden="true">▶</span> Play: off';
    document.body.classList.toggle('autoplay-on', autoplayOn);
  }

  function findVisibleStartIndex() {
    const cards = [...list.querySelectorAll('.sentence-card')];
    if (!cards.length) return 0;
    const controlBottom = document.querySelector('.control-shell')?.getBoundingClientRect().bottom || 0;
    const viewportTarget = Math.max(controlBottom + 24, window.innerHeight * 0.28);
    let closest = cards[0];
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      if (rect.bottom <= controlBottom) continue;
      const distance = Math.abs((rect.top + rect.height / 2) - viewportTarget);
      if (distance < closestDistance) {
        closest = card;
        closestDistance = distance;
      }
    }
    return Number(closest.dataset.index || 0);
  }

  function autoplayStep(session) {
    if (!autoplayOn || session !== autoplaySession || !ordered.length) return;

    if (autoplayIndex >= ordered.length) {
      resetOrder({ keepAutoplay: true });
      autoplayIndex = 0;
    }

    while (autoplayIndex >= shown && shown < ordered.length) renderBatch();
    if (autoplayIndex + 12 >= shown && shown < ordered.length) renderBatch();

    const card = list.querySelector(`.sentence-card[data-index="${autoplayIndex}"]`);
    const item = ordered[autoplayIndex];
    if (!card || !item) {
      autoplayTimer = window.setTimeout(() => autoplayStep(session), 150);
      return;
    }

    clearAutoplayCard();
    activeAutoplayCard = card;
    card.classList.add('is-autoplaying');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const audioButton = card.querySelector('.speak-button');
    speak(item, audioButton, () => {
      if (!autoplayOn || session !== autoplaySession) return;
      autoplayTimer = window.setTimeout(() => {
        autoplayIndex += 1;
        autoplayStep(session);
      }, AUTOPLAY_PAUSE_MS);
    });
  }

  function startAutoplay() {
    if (autoplayOn || !ordered.length) return;
    autoplayOn = true;
    autoplaySession += 1;
    autoplayIndex = findVisibleStartIndex();
    updateAutoplayButton();
    autoplayStep(autoplaySession);
  }

  function stopAutoplay() {
    if (!autoplayOn && !activeAutoplayCard) return;
    autoplayOn = false;
    autoplaySession += 1;
    window.clearTimeout(autoplayTimer);
    autoplayTimer = null;
    cancelSpeech();
    clearAutoplayCard();
    updateAutoplayButton();
  }

  function resetOrder({ scroll = false, keepAutoplay = false } = {}) {
    if (!keepAutoplay) stopAutoplay();
    cancelSpeech();
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
    stopAutoplay();
    list.innerHTML = '<p class="noscript">The rebuilt sentence collection could not load. Please refresh the page in a current browser.</p>';
    sentinel.hidden = true;
    autoplayButton.disabled = true;
  }

  async function loadCorpus() {
    list.innerHTML = '<p class="loading-message">Loading the rebuilt 10,000-sentence collection…</p>';
    autoplayButton.disabled = true;
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
    autoplayButton.disabled = false;
  }

  autoplayButton.addEventListener('click', () => autoplayOn ? stopAutoplay() : startAutoplay());
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

  initialiseVoices();
  updateAutoplayButton();
  loadCorpus().catch(showError);
})();

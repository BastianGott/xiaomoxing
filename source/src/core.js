/* ============================================================
   小模型 · Tiny Model — core: data, storage, FSRS-5, audio, pinyin
   ============================================================ */
'use strict';

const DATA = /*__DATA__*/null;

// word IDs are locked across versions (saved progress is keyed by them); gaps are tombstones
const WORDS = DATA.words.map((w, id) => w ? { id, h: w[0], p: w[1], m: w[2], l: w[3], s: w[4], u: w[5], o: w[6] }
                                          : { id, h: '', p: '', m: '', l: -1, s: [], u: null, o: null });
const SENTS = DATA.sents.map(([w, z, s, en], id) => ({ id, w, z, s, en, key: z.join('') }));
const SENT_BY_KEY = Object.fromEntries(SENTS.map(s => [s.key, s]));
const NOTES = DATA.notes;
const NOTE_BY_ID = Object.fromEntries(NOTES.map(n => [n.id, n]));
const CORE_ORDER = WORDS.filter(w => w.l > 0).sort((a, b) => a.o - b.o).map(w => w.id);   // learning order
const WORD_RANK = {}; CORE_ORDER.forEach((id, i) => WORD_RANK[id] = i);
/* chat words: spoken reactions, mood particles, fillers, slang + high-frequency function words (spoken.tsv) */
const SPOKEN_LV = 7;            // level of spoken words that are not in the HSK lists
const SPOKEN = (DATA.spoken || []).map(([id, kind, note, isNew], rank) => ({ id, kind, note, isNew: !!isNew, rank }));
const SPOKEN_BY_ID = Object.fromEntries(SPOKEN.map(x => [x.id, x]));
const KIND_LABEL = {
  react: ['口语', 'spoken reaction'], particle: ['语气词', 'mood particle'], func: ['虚词', 'function word'], filler: ['口语', 'filler word'],
  spoken: ['口语', 'everyday spoken'], slang: ['俚语', 'slang'], vulgar: ['粗口', 'vulgar · close friends only'],
};
const CHAT_RETENTION = 0.95;    // chat words get extra reviews
const SENTS_BY_WORD = {};
SENTS.forEach(s => s.w.forEach(id => { if (id >= 0) (SENTS_BY_WORD[id] = SENTS_BY_WORD[id] || []).push(s.id); }));

/* ---------- small utils ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt1 = x => (Math.round(x * 10) / 10).toString();
function fmtIvl(days) {
  if (days < 1) return '<1d';
  if (days < 30) return Math.round(days) + 'd';
  if (days < 365) return fmt1(days / 30) + 'mo';
  return fmt1(days / 365) + 'y';
}
function fmtTime(ms) { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function sample(probs) { let r = Math.random(), acc = 0; for (let i = 0; i < probs.length; i++) { acc += probs[i]; if (r < acc) return i; } return probs.length - 1; }
function softmax(logits, T) { const z = logits.map(l => l / Math.max(T, 1e-3)); const m = Math.max(...z); const e = z.map(v => Math.exp(v - m)); const s = e.reduce((a, b) => a + b, 0); return e.map(v => v / s); }

/* ---------- days (Anki-style 4 am rollover) ---------- */
const DAY_MS = 864e5;
function dayIndex(ts = Date.now()) {
  const d = new Date(ts - 4 * 3600e3);
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60e3) / DAY_MS);
}
function dayLabel(di) { const d = new Date(di * DAY_MS); return d.toISOString().slice(0, 10); }

/* ---------- persistence ---------- */
const SAVE_KEY = 'xiaomoxing.save.v1';
function freshState() {
  return {
    v: 1, created: Date.now(), modelName: 'Basti-0.1B',
    settings: {
      newPerDay: 10, retention: 0.9, targetMin: 10, temperature: 1.0, voice: '', rate: 0.85,
      autoplay: true, font: 'kai', theme: 'dark', cardStyle: 'game', aiTerms: true, sfx: true, pinyinHint: false,
      newSentPerDay: 5, sentInput: 'tiles', newIdiomPerDay: 1, idiomEvery: 3, catchUp: true,
      newDlgPerDay: 3, chatPerEpoch: 3, chatBoost: true,
    },
    cards: {},           // wordId -> card
    scards: {},          // sentence key (its hanzi) -> card
    icards: {},          // idiom (chengyu) -> card
    dcards: {},          // dialogue key (its turns' hanzi joined by ｜) -> card
    iorder: [],          // idioms pushed to the front of the queue
    order: [],           // wordIds pushed to the front of the new queue
    xp: 0, lastLevel: 1,
    notesRead: {}, quiz: {},
    epochs: [],          // {day, loss, acc, n, nNew, xp, ms}
    days: {},            // dayIndex -> {rev, new, xp, ms}
    games: {},           // name -> {plays, best}
    quantBits: 16,
    lastBackup: Date.now(),
    news: { chat: Date.now() },   // update notes already seen (a fresh model needs no "what's new")
  };
}
let S = loadState();
function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const st = JSON.parse(raw);
      const preChat = !('dcards' in st);            // save from before the chat update: show what's new once
      const f = freshState();
      if (preChat) f.news = { chat: 0 };
      st.settings = Object.assign(f.settings, st.settings || {});
      for (const k of Object.keys(f)) if (!(k in st)) st[k] = f[k];
      return st;
    }
  } catch (e) { console.warn('load failed', e); }
  return freshState();
}
let saveWarned = false;
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); }
  catch (e) { if (!saveWarned) { saveWarned = true; toast('Browser storage unavailable: use Settings → Export to keep progress.', 'warn'); } }
}
function today() { return dayIndex(); }
function dayStats(di = today()) { return S.days[di] || (S.days[di] = { rev: 0, new: 0, xp: 0, ms: 0 }); }

/* ---------- FSRS-5 ---------- */
const FSRS = (() => {
  const w = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
             1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
  const DECAY = -0.5, FACTOR = 19 / 81;
  const R = (t, s) => Math.pow(1 + FACTOR * t / s, DECAY);
  const D0 = g => clamp(w[4] - Math.exp(w[5] * (g - 1)) + 1, 1, 10);
  const nextD = (d, g) => {
    const dd = -w[6] * (g - 3);
    const d1 = d + dd * (10 - d) / 9;
    return clamp(w[7] * D0(4) + (1 - w[7]) * d1, 1, 10);
  };
  const succS = (d, s, r, g) => s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) *
    (Math.exp(w[10] * (1 - r)) - 1) * (g === 2 ? w[15] : 1) * (g === 4 ? w[16] : 1));
  const failS = (d, s, r) => Math.min(s, w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r)));
  const shortS = (s, g) => s * Math.exp(w[17] * (g - 3 + w[18]));
  const ivlFor = (s, ret) => s / FACTOR * (Math.pow(ret, 1 / DECAY) - 1);

  /** returns a new memory state {s,d} for grade g (1..4) */
  function next(card, g, now) {
    if (!card || card.st === 0 || !card.s) return { s: w[g - 1], d: D0(g) };
    const sameDay = dayIndex(card.last) === dayIndex(now);
    const t = Math.max(0, (now - card.last) / DAY_MS);
    let s;
    if (sameDay) s = shortS(card.s, g);
    else { const r = R(t, card.s); s = g === 1 ? failS(card.d, card.s, r) : succS(card.d, card.s, r, g); }
    return { s: clamp(s, 0.01, 36500), d: nextD(card.d, g) };
  }
  function intervalDays(s, ret, fuzz = true) {
    let i = ivlFor(s, ret);
    if (fuzz && i >= 3) i *= rand(0.95, 1.05);
    return clamp(Math.round(i), 1, 36500);
  }
  function retrievability(card, now = Date.now()) {
    if (!card || card.st === 0) return 0;
    return R(Math.max(0, (now - card.last) / DAY_MS), card.s);
  }
  return { next, intervalDays, retrievability, ivlFor, R, w };
})();

function getCard(id) { return S.cards[id]; }
/** desired retention for a word: chat words (spoken.tsv) get extra reviews when the boost is on */
function retFor(id) { return S.settings.chatBoost && SPOKEN_BY_ID[id] ? Math.max(S.settings.retention, CHAT_RETENTION) : S.settings.retention; }
function ensureCard(id) { return S.cards[id] || (S.cards[id] = { st: 0, s: 0, d: 0, due: 0, last: 0, reps: 0, lapses: 0 }); }
/** apply a grade to a card object (word or sentence); returns interval days */
function gradeCard(c, g, now = Date.now(), ret = S.settings.retention) {
  const wasNew = c.st === 0;
  const sameDay = !wasNew && dayIndex(c.last) === dayIndex(now);
  const m = FSRS.next(c, g, now);
  if (!wasNew && !sameDay && g === 1) c.lapses++;
  c.s = m.s; c.d = m.d; c.st = 2; c.reps++; c.last = now;
  if (wasNew) c.first = now;
  const ivl = g === 1 ? 1 : FSRS.intervalDays(c.s, ret);
  c.due = dayIndex(now) + ivl;
  if (c.lapses >= 6) c.leech = true;
  return ivl;
}
function applyGrade(id, g, now = Date.now()) { return gradeCard(ensureCard(id), g, now, retFor(id)); }
function previewFor(c, now = Date.now(), ret = S.settings.retention) {
  c = c || { st: 0 };
  return [1, 2, 3, 4].map(g => g === 1 ? 1 : FSRS.intervalDays(FSRS.next(c, g, now).s, ret, false));
}
function previewIntervals(id, now = Date.now()) { return previewFor(getCard(id), now, retFor(id)); }
const isSeen = id => { const c = S.cards[id]; return !!(c && c.st > 0); };
const isSusp = id => { const c = S.cards[id]; return !!(c && c.susp); };
function seenIds() { return Object.keys(S.cards).map(Number).filter(isSeen); }
function matureCount() { return seenIds().filter(id => S.cards[id].s >= 21).length; }
function dueIds(di = today()) {
  return seenIds().filter(id => { const c = S.cards[id]; return !c.susp && c.due <= di; })
    .sort((a, b) => S.cards[a].due - S.cards[b].due || FSRS.retrievability(S.cards[a]) - FSRS.retrievability(S.cards[b]));
}
function unlockedNoteIds() { const lv = levelInfo().level; return NOTES.filter(n => n.lv <= lv).map(n => n.id); }
function newQueue(limit) {
  const unlocked = new Set(unlockedNoteIds());
  const out = [];
  const ok = id => !out.includes(id) && !isSeen(id) && !isSusp(id);
  for (const id of S.order) { if (out.length >= limit) break; if (ok(id)) out.push(id); }
  // at most one AI term per epoch, once its note is unlocked and the basics are in place
  let ai = null;
  if (S.settings.aiTerms && seenIds().length >= 25) {
    const w = WORDS.find(w => w.l === 0 && unlocked.has(w.u) && ok(w.id));
    if (w) ai = w.id;
  }
  // chat words: a few spoken words / particles / function words per epoch, in spoken.tsv order
  const chat = [];
  const nChat = Math.min(S.settings.chatPerEpoch || 0, Math.max(0, limit - out.length - (ai != null ? 1 : 0)));
  for (const x of SPOKEN) { if (chat.length >= nChat) break; if (ok(x.id)) chat.push(x.id); }
  const coreLimit = limit - chat.length - (ai != null && limit >= 3 ? 1 : 0);
  const core = [];
  for (const id of CORE_ORDER) { if (out.length + core.length >= coreLimit) break; if (ok(id) && !chat.includes(id)) core.push(id); }
  // spread the chat words through the core words: core, chat, core, core, chat, …
  const gap = chat.length ? Math.max(1, Math.floor(core.length / chat.length)) : 0;
  let ci = 0;
  core.forEach((id, k) => { out.push(id); if (ci < chat.length && (k + 1) % gap === 0) out.push(chat[ci++]); });
  while (ci < chat.length) out.push(chat[ci++]);
  if (ai != null && out.length < limit) out.push(ai);
  return out;
}
/* ---------- catch-up mode: new cards adapt to the review backlog ----------
   After a break, reviews pile up. New material is throttled until the pile shrinks:
   backlog <= 0.6 x epoch capacity -> full new cards, >= 2 x capacity -> review-only, linear in between.
   Like learning-rate warm-up after resuming training: consolidate known data before new tokens. */
function reviewCap() { return Math.max(30, Math.round((S.settings.targetMin || 10) * 6.5)); }   // word reviews per epoch
function backlogInfo() {
  const dw = dueIds().length, ds = dueSentKeys().length, dd = typeof dueDlgKeys === 'function' ? dueDlgKeys().length : 0;
  const cap = reviewCap();
  const B = dw + 0.5 * ds + 0.5 * dd;
  const lo = 0.6 * cap, hi = 2 * cap;
  let f = B <= lo ? 1 : B >= hi ? 0 : 1 - (B - lo) / (hi - lo);
  if (S.settings.catchUp === false) f = 1;
  return { dw, ds, dd, B: Math.round(B), cap, lo, hi, f, active: f < 1 };
}
function catchUpFactor() { return backlogInfo().f; }
function newLeftToday() {
  const ds = dayStats();
  const budget = Math.floor(S.settings.newPerDay * catchUpFactor()) + (ds.bonusNew || 0);
  return Math.max(0, budget - ds.new);
}

/* ---------- sentence cards ---------- */
const sentWordIds = s => [...new Set(s.w.filter(w => w >= 0))];
const sentUnknown = s => sentWordIds(s).filter(id => !isSeen(id));
const sentEligible = s => sentUnknown(s).length === 0 && !sentWordIds(s).some(isSusp);
const sentGate = s => Math.max(...sentWordIds(s).map(id => WORD_RANK[id] ?? 5000));
function ensureSCard(key) { return S.scards[key] || (S.scards[key] = { st: 0, s: 0, d: 0, due: 0, last: 0, reps: 0, lapses: 0 }); }
const isSentSeen = key => { const c = S.scards[key]; return !!(c && c.st > 0); };
function applySentGrade(key, g, now = Date.now()) { return gradeCard(ensureSCard(key), g, now); }
function dueSentKeys(di = today()) {
  return Object.keys(S.scards).filter(k => { const c = S.scards[k], s = SENT_BY_KEY[k]; return s && c.st > 0 && !c.susp && c.due <= di && !sentWordIds(s).some(isSusp); })
    .sort((a, b) => S.scards[a].due - S.scards[b].due || FSRS.retrievability(S.scards[a]) - FSRS.retrievability(S.scards[b]));
}
function newSentKeys(limit) {
  if (limit <= 0) return [];
  return SENTS.filter(s => !isSentSeen(s.key) && sentEligible(s) && s.w.filter(w => w >= 0).length >= 2)
    .map(s => [sentGate(s) + s.z.length * 0.8 + Math.random() * 12, s.key]).sort((a, b) => a[0] - b[0]).slice(0, limit).map(x => x[1]);
}
function newSentLeftToday() { return Math.max(0, Math.floor(S.settings.newSentPerDay * catchUpFactor()) + (dayStats().bonusSent || 0) - (dayStats().sNew || 0)); }
function sentSeenCount() { return Object.values(S.scards).filter(c => c.st > 0).length; }
function eligibleSentCount() { return SENTS.filter(sentEligible).length; }

/* ---------- levels ---------- */
const xpFor = L => Math.round(200 * Math.pow(L - 1, 1.45));
const MODELS = [
  ['Bigram', '1948'], ['Trigram', '1980s'], ['Word2Vec', '2013'], ['RNN LM', '2010'], ['LSTM', '2014'],
  ['Seq2Seq', '2014'], ['Seq2Seq + Attention', '2015'], ['Transformer', '2017'], ['BERT-base', '2018'],
  ['GPT-1', '2018'], ['GPT-2 small', '2019'], ['GPT-2 XL', '2019'], ['T5', '2019'], ['GPT-3', '2020'],
  ['Chinchilla', '2022'], ['LLaMA-7B', '2023'], ['Llama-2-13B', '2023'], ['Mistral-7B', '2023'],
  ['Mixtral 8×7B', '2023'], ['Llama-3-70B', '2024'], ['Qwen-72B', '2024'], ['DeepSeek-V3', '2024'],
];
function levelInfo(xp = S.xp) {
  let L = 1; while (xp >= xpFor(L + 1)) L++;
  const lo = xpFor(L), hi = xpFor(L + 1);
  const m = MODELS[Math.min(L - 1, MODELS.length - 1)];
  const name = L <= MODELS.length ? m[0] : `Frontier v${L - MODELS.length}`;
  return { level: L, frac: (xp - lo) / (hi - lo), toNext: hi - xp, name, year: L <= MODELS.length ? m[1] : 'future' };
}
function paramsLabel() {
  // playful "parameter count": grows with what you actually remember
  const p = seenIds().reduce((a, id) => a + Math.min(S.cards[id].s, 365), 0) * 1.3e6 + seenIds().length * 2e6;
  if (p <= 0) return '0';
  if (p < 1e6) return (p / 1e3).toFixed(0) + 'K';
  if (p < 1e9) return (p / 1e6).toFixed(p < 1e7 ? 1 : 0) + 'M';
  return (p / 1e9).toFixed(2) + 'B';
}

/* ---------- pinyin helpers ---------- */
const TONE_MARKS = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', v: 'ǖǘǚǜ' };
const MARK_TO = {};
for (const [b, m] of Object.entries(TONE_MARKS)) [...m].forEach((ch, i) => MARK_TO[ch] = [b, i + 1]);
function plainSyl(s) { // tone-marked -> [letters(v for ü), tone]
  let out = '', tone = 5;
  for (const ch of s.toLowerCase()) {
    if (MARK_TO[ch]) { out += MARK_TO[ch][0]; tone = MARK_TO[ch][1]; }
    else if (ch === 'ü') out += 'v';
    else out += ch;
  }
  return [out, tone];
}
function stripTones(s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ü/g, 'u').toLowerCase(); }
function numericPinyin(w) { return w.s.map(([syl, t]) => plainSyl(syl)[0] + (t === 5 ? '' : t)).join(' '); }
function toneSpan(text, t) { return `<span class="t${t}">${esc(text)}</span>`; }
function pinyinHTML(syls) { return syls.map(([syl, t]) => toneSpan(syl, t)).join(''); }
function hanziHTML(w) {
  const chars = [...w.h];
  const s = w.s;
  return chars.map((c, i) => toneSpan(c, (s[Math.min(i, s.length - 1)] || ['', 5])[1])).join('');
}
function sentenceHTML(sent, highlightId = -1, withPinyin = true) {
  return `<div class="sent">${sent.z.map((tok, i) => {
    const wid = sent.w[i], syl = sent.s[i];
    if (wid < 0) return `<span class="tok punct"><span class="tz">${esc(tok)}</span>${withPinyin ? '<span class="tp">&nbsp;</span>' : ''}</span>`;
    const chars = [...tok];
    const zh = chars.map((c, k) => toneSpan(c, (syl[Math.min(k, syl.length - 1)] || ['', 5])[1])).join('');
    return `<span class="tok${wid === highlightId ? ' hl' : ''}" data-wid="${wid}"><span class="tz">${zh}</span>${withPinyin ? `<span class="tp">${pinyinHTML(syl)}</span>` : ''}</span>`;
  }).join('')}</div>`;
}
function sentText(sent) { return sent.z.join(''); }

/** check typed pinyin against word; returns 'ok' | 'tones' | 'wrong' */
function checkPinyin(input, w) {
  const target = w.s.map(([syl, t]) => { const [p] = plainSyl(syl); return { p, t }; });
  const T = target.map(x => x.p).join('');
  let U = '', tonesAt = {}; // letter index (last letter before digit) -> tone
  const src = input.toLowerCase().replace(/u:/g, 'v').replace(/ü/g, 'v');
  for (const ch of src) {
    if (/[1-5]/.test(ch)) { if (U.length) tonesAt[U.length - 1] = +ch; continue; }
    if (/[0]/.test(ch)) { if (U.length) tonesAt[U.length - 1] = 5; continue; }
    if (MARK_TO[ch]) { U += MARK_TO[ch][0]; tonesAt['m' + (U.length - 1)] = MARK_TO[ch][1]; continue; }
    if (/[a-z]/.test(ch)) U += ch;
  }
  if (U !== T) return 'wrong';
  let pos = 0, allOk = true;
  for (const syl of target) {
    const a = pos, b = pos + syl.p.length; pos = b;
    let ut = 5;
    for (let k = a; k < b; k++) { if (tonesAt[k]) ut = tonesAt[k]; if (tonesAt['m' + k]) ut = tonesAt['m' + k]; }
    if (syl.t === 5) continue;            // neutral: lenient
    if (ut !== syl.t) allOk = false;
  }
  return allOk ? 'ok' : 'tones';
}

/* ---------- TTS ---------- */
const TTS = (() => {
  let voices = [], ready = false;
  const has = () => 'speechSynthesis' in window;
  function load() {
    if (!has()) return;
    voices = speechSynthesis.getVoices().filter(v => /^zh/i.test(v.lang) || /chinese|普通话|中文/i.test(v.name));
    // prefer mainland Mandarin, natural voices first
    const score = v => (/zh[-_]CN/i.test(v.lang) ? 10 : /zh[-_](TW|HK)/i.test(v.lang) ? -5 : 0) +
      (/natural|xiaoxiao|yunxi|neural/i.test(v.name) ? 5 : 0) + (/google/i.test(v.name) ? 3 : 0);
    voices.sort((a, b) => score(b) - score(a));
    ready = true;
  }
  if (has()) { load(); speechSynthesis.onvoiceschanged = () => { load(); document.dispatchEvent(new Event('voices')); }; }
  function voice() { return voices.find(v => v.voiceURI === S.settings.voice) || voices[0]; }
  function speak(text, rate) {
    if (!has() || !text) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = voice(); if (v) u.voice = v;
      u.lang = v ? v.lang : 'zh-CN';
      u.rate = rate || S.settings.rate;
      speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  }
  /** a second voice for the other speaker in a dialogue (Edge: Xiaoxiao / Yunxi), else a higher pitch */
  function voiceB() { const a = voice(); return voices.find(v => v !== a && /zh[-_]CN/i.test(v.lang)) || voices.find(v => v !== a) || a; }
  function speakTurns(texts, rate) {
    if (!has() || !texts || !texts.length) return;
    try {
      speechSynthesis.cancel();
      texts.forEach((text, i) => {
        const u = new SpeechSynthesisUtterance(text);
        const v = i % 2 ? voiceB() : voice();
        if (v) u.voice = v;
        u.lang = v ? v.lang : 'zh-CN';
        u.rate = rate || S.settings.rate;
        if (i % 2 && v === voice()) u.pitch = 1.3;
        speechSynthesis.speak(u);
      });
    } catch (e) { /* ignore */ }
  }
  return { speak, speakTurns, list: () => voices, available: () => has() && voices.length > 0, ready: () => ready };
})();

/* ---------- sound effects (WebAudio, tiny) ---------- */
const SFX = (() => {
  let ctx = null;
  function tone(freq, dur, type = 'sine', vol = 0.06, delay = 0) {
    if (!S.settings.sfx) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0, ctx.currentTime + delay);
      g.gain.linearRampToValueAtTime(vol, ctx.currentTime + delay + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + dur);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + delay); o.stop(ctx.currentTime + delay + dur + 0.02);
    } catch (e) { /* ignore */ }
  }
  return {
    good: () => { tone(660, 0.12); tone(990, 0.16, 'sine', 0.05, 0.07); },
    bad: () => { tone(220, 0.18, 'triangle', 0.07); },
    level: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.06, i * 0.09)); },
    tick: () => tone(1200, 0.03, 'square', 0.02),
  };
})();

/* ---------- XP ---------- */
function addXP(n, why) {
  if (!n) return;
  const before = levelInfo().level;
  S.xp = Math.max(0, S.xp + Math.round(n));
  dayStats().xp += Math.round(n);
  if (typeof onXP === 'function') onXP(Math.round(n), why);
  const after = levelInfo().level;
  if (after > before) { S.lastLevel = after; if (typeof onLevelUp === 'function') onLevelUp(before, after); }
}

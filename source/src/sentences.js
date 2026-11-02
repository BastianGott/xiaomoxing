/* ============================================================
   Sentence training: FSRS sentence cards inside epochs + Sentence Gym
   Modes: build (tiles / IME typing), translate, listen (no characters),
          dictation (no characters), listen & translate (no characters)
   ============================================================ */

const SMODE_LABEL = {
  build: ['build', '造句 zàojù'],
  trans: ['translate', '翻译 fānyì'],
  listen: ['listen · no characters', '听力 tīnglì'],
  dict: ['dictation · no characters', '听写 tīngxiě'],
  ltrans: ['listen & translate · no characters', '听译 tīngyì'],
};
const AUDIO_MODES = ['listen', 'dict', 'ltrans'];
const isHanChar = c => /[\u4e00-\u9fff]/.test(c);

function chooseSentMode(item) {
  const tts = TTS.available();
  if (item.forceMode) return (!tts && AUDIO_MODES.includes(item.forceMode)) ? 'trans' : item.forceMode;
  const c = S.scards[item.key];
  const s = c && c.st ? c.s : 0;
  let w;
  if (item.first || !c || !c.st) w = { trans: .45, build: .4, listen: .15 };
  else if (item.kind === 'slearn') w = { build: .4, listen: .35, dict: .25 };
  else if (s < 4) w = { build: .35, trans: .25, listen: .25, dict: .15 };
  else if (s < 15) w = { trans: .25, dict: .3, listen: .2, build: .15, ltrans: .1 };
  else w = { ltrans: .35, dict: .3, trans: .15, build: .2 };
  if (!tts) AUDIO_MODES.forEach(m => delete w[m]);
  if (c && c.lm && w[c.lm] && Object.keys(w).length > 1) w[c.lm] *= 0.3;   // vary the drill
  const keys = Object.keys(w), tot = keys.reduce((a, k) => a + w[k], 0);
  return keys[sample(keys.map(k => w[k] / tot))];
}

/* ---------- small renderers ---------- */
function zhPlainHTML(s, unknown = []) {
  return s.z.map((t, i) => {
    const wid = s.w[i];
    if (wid < 0) return `<span class="muted">${esc(t)}</span>`;
    return unknown.includes(wid) ? `<span class="unkw" title="new word: deduce it from context">${esc(t)}</span>` : esc(t);
  }).join('');
}
function sentPinyinHTML(s) { return s.z.map((t, i) => s.w[i] < 0 ? '' : pinyinHTML(s.s[i])).filter(Boolean).join(' '); }
function glossHTML(s, unknown = []) {
  return `<div class="gloss">${sentWordIds(s).map(id => {
    const w = WORDS[id], unk = unknown.includes(id);
    return `<button class="gl ${unk ? 'unk' : ''}" data-word="${id}" title="open word"><span class="hzo">${hanziHTML(w)}</span><span class="glp">${pinyinHTML(w.s)}</span><span class="glm">${esc(w.m)}</span>${unk ? '<span class="pill gold">new</span>' : ''}</button>`;
  }).join('')}</div>`;
}
function diffHTML(s, tokOk) {
  return `<div class="sent">${s.z.map((t, i) => {
    if (s.w[i] < 0) return `<span class="tok punct"><span class="tz">${esc(t)}</span><span class="tp">&nbsp;</span></span>`;
    const ok = tokOk[i];
    return `<span class="tok ${ok ? 'dok' : 'dbad'}"><span class="tz">${esc(t)}</span><span class="tp">${pinyinHTML(s.s[i])}</span></span>`;
  }).join('')}</div>`;
}
function audioButtons(txt, big = true) {
  return big
    ? `<button class="speak huge" data-say="${esc(txt)}" title="Replay (R)">${ICON_SPEAK}</button><div class="row" style="justify-content:center"><button class="btn small ghost" data-slow="${esc(txt)}" title="Slow (S)">🐢 slow</button></div>`
    : `<div class="row" style="justify-content:center;gap:6px;margin-top:6px">${speakBtn(txt)}<button class="btn small ghost" data-slow="${esc(txt)}">🐢 slow</button></div>`;
}
function sentMemLine(key) {
  const c = S.scards[key];
  if (!c || !c.st) return 'new sentence';
  return `stability ${fmtIvl(c.s)} · difficulty ${c.d.toFixed(1)} · recall ${(FSRS.retrievability(c) * 100).toFixed(0)}% · reviews ${c.reps}`;
}

/* ---------- answer checking (LCS alignment) ---------- */
function lcsAlign(U, T) {
  const n = U.length, m = T.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++)
    dp[i][j] = U[i - 1] === T[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const tMatched = new Array(m).fill(false);
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (U[i - 1] === T[j - 1]) { tMatched[j - 1] = true; i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--; else j--;
  }
  return { len: dp[n][m], tMatched };
}
/** compare typed input (Chinese characters or pinyin) with a sentence */
function checkSentenceInput(input, s) {
  const raw = input.trim();
  const toks = s.z.map((t, i) => ({ t, i, w: s.w[i] })).filter(x => x.w >= 0);
  const T = [], tokOf = [];
  let kind, U, hasTone = false;
  if ([...raw].some(isHanChar)) {
    kind = 'hanzi';
    U = [...raw].filter(isHanChar);
    toks.forEach(x => [...x.t].forEach(c => { T.push(c); tokOf.push(x.i); }));
  } else {
    kind = 'pinyin';
    U = [];
    for (const ch of raw.toLowerCase().replace(/u:/g, 'v').replace(/ü/g, 'v')) {
      if (MARK_TO[ch]) { U.push(MARK_TO[ch][0]); hasTone = true; }
      else if (/[0-5]/.test(ch)) hasTone = true;
      else if (/[a-z]/.test(ch)) U.push(ch);
    }
    toks.forEach(x => s.s[x.i].forEach(([syl]) => [...plainSyl(syl)[0]].forEach(c => { T.push(c); tokOf.push(x.i); })));
  }
  const { len, tMatched } = lcsAlign(U, T);
  const ratio = U.length + T.length ? 2 * len / (U.length + T.length) : 0;
  const tokOk = {};
  toks.forEach(x => { tokOk[x.i] = true; });
  tMatched.forEach((ok, k) => { if (!ok) tokOk[tokOf[k]] = false; });
  let tones = null;
  if (kind === 'pinyin') {
    if (!hasTone) tones = 'none';
    else if (ratio === 1) tones = checkPinyin(raw, { s: toks.flatMap(x => s.s[x.i]) }) === 'ok' ? 'ok' : 'off';
  }
  return { kind, ratio, tokOk, tones };
}
function suggestionFromCheck(r) {
  if (r.ratio === 1) return r.tones === 'off' ? 2 : 3;
  return r.ratio >= 0.8 ? 2 : 1;
}
function checkVerdict(r) {
  const pct = Math.round(r.ratio * 100);
  if (r.ratio === 1) {
    if (r.kind === 'hanzi') return ['ok', 'Perfect! 完全正确'];
    if (r.tones === 'ok') return ['ok', 'Perfect, tones included!'];
    if (r.tones === 'off') return ['meh', 'Letters right, some tones off'];
    return ['ok', 'Correct! (add tone numbers next time for the full workout)'];
  }
  return r.ratio >= 0.8 ? ['meh', `Almost: ${pct}% match`] : ['bad', `${pct}% match. Compare below`];
}

/* ---------- listen options ---------- */
function listenOptions(s) {
  const len = s.z.length;
  const pool = SENTS.filter(x => x.key !== s.key && x.en !== s.en && Math.abs(x.z.length - len) <= 3);
  const known = pool.filter(sentEligible);
  const src = known.length >= 6 ? known : pool;
  return shuffle([s, ...shuffle(src).slice(0, 3)]);
}

/* ---------- the card ---------- */
function showSentence(item) {
  const s = SENT_BY_KEY[item.key];
  if (!s) return nextItem();
  const mode = chooseSentMode(item);
  const stage = $('#stage');
  const txt = sentText(s);
  const unknown = item.stretch ? sentUnknown(s) : [];
  const st = { answered: false, sug: 3, lock: 0, hint: false };
  const ml = SMODE_LABEL[mode];
  const tags = [item.first ? '<span style="color:var(--jade)">new sentence</span>' : '', item.kind === 'slearn' ? '<span style="color:var(--jade)">learning</span>' : '',
    SESS.gym ? 'gym' : ''].filter(Boolean).join(' · ');
  const head = `<div class="mode">sentence · ${ml[0]} · <span class="zh">${ml[1]}</span>${tags ? ' · ' + tags : ''}</div>`;
  let body = '', opts = [];
  if (mode === 'build') {
    const typing = S.settings.sentInput === 'type';
    body = `<div class="prompt-en">${esc(s.en)}</div>
      ${typing ? `<input class="typein wide han-in" id="sin" lang="zh-CN" placeholder="type it in Chinese (IME) or pinyin" autocomplete="off" autocapitalize="off" spellcheck="false"><div class="verdict" id="verdict"></div>`
               : `<div class="decout" id="decout"></div><div class="tiles" id="tiles"></div>`}
      <div class="row" style="justify-content:center;margin-top:10px"><button class="lnk" id="swapin">${typing ? '🧩 use word tiles instead' : '⌨ type it instead (Chinese keyboard or pinyin)'}</button></div>`;
  } else if (mode === 'trans') {
    body = `<div class="zhsent">${zhPlainHTML(s, unknown)}</div><div id="pyhint" class="pyhint"></div>
      ${unknown.length ? '<div class="faint" style="font-size:12px">dotted = a word you haven\'t learned yet. Guess it from context!</div>' : ''}
      <input class="typein wide" id="ein" lang="en" placeholder="your translation (optional), Enter to check" autocomplete="off">
      <div class="row" style="justify-content:center;margin-top:10px"><button class="btn small ghost" id="hintbtn">Show pinyin</button><button class="btn small" id="revbtn">Reveal <kbd>Enter</kbd></button></div>`;
  } else if (mode === 'listen') {
    opts = listenOptions(s);
    body = `${audioButtons(txt)}<div class="muted" style="margin-top:6px">What does it mean?</div>
      <div class="opts one">${opts.map((o, i) => `<button class="opt" data-i="${i}"><span class="k">${i + 1}</span><span>${esc(o.en)}</span></button>`).join('')}</div>`;
  } else if (mode === 'dict') {
    body = `${audioButtons(txt)}<input class="typein wide han-in" id="sin" lang="zh-CN" placeholder="type what you hear: pinyin (tones optional) or Chinese" autocomplete="off" autocapitalize="off" spellcheck="false">
      <div class="faint" style="font-size:12px;margin-top:6px">Enter on an empty box replays · Shift+Enter plays slowly</div><div class="verdict" id="verdict"></div>`;
  } else if (mode === 'ltrans') {
    body = `${audioButtons(txt)}<div class="muted" style="margin-top:6px">Translate what you hear</div>
      <input class="typein wide" id="ein" lang="en" placeholder="your translation (optional), Enter to reveal" autocomplete="off">
      <div class="row" style="justify-content:center;margin-top:10px"><button class="btn small" id="revbtn">Reveal <kbd>Enter</kbd></button></div>`;
  }
  const hints = {
    build: S.settings.sentInput === 'type' ? '<span><kbd>Enter</kbd> check</span>' : '<span><kbd>1</kbd>–<kbd>9</kbd> pick tiles</span><span><kbd>R</kbd> audio hint</span>',
    trans: '<span><kbd>Enter</kbd> reveal</span>',
    listen: '<span><kbd>1</kbd>–<kbd>4</kbd> answer</span><span><kbd>R</kbd> replay</span><span><kbd>S</kbd> slow</span>',
    dict: '<span><kbd>Enter</kbd> check · empty <kbd>Enter</kbd> replays · <kbd>Shift</kbd>+<kbd>Enter</kbd> slow</span>',
    ltrans: '<span><kbd>Enter</kbd> reveal</span><span>🔊 / 🐢 buttons replay</span>',
  }[mode];
  stage.innerHTML = `<div class="card qcard pop">${head}${body}<div id="reveal"></div></div><div class="grades hidden" id="grades"></div>
    <div class="hint" id="qhint">${hints}<span><kbd>Esc</kbd> end</span></div>`;
  bindCommon(stage);
  const say = slow => TTS.speak(txt, slow ? S.settings.rate * 0.6 : undefined);
  if (AUDIO_MODES.includes(mode)) setTimeout(() => say(false), 250);
  const focusIn = $('#sin') || $('#ein'); if (focusIn) setTimeout(() => focusIn.focus(), 40);

  /* -- reveal + grading -- */
  function reveal(sug, msgHTML = '') {
    if (st.answered) return;
    st.answered = true; st.sug = sug; st.lock = Date.now() + 300;
    if (sug >= 3) SFX.good(); else if (sug === 1) SFX.bad();
    $$('input', stage).forEach(i => i.disabled = true);
    ['#tiles', '#swapin', '#hintbtn', '#revbtn'].forEach(sel => { const el = $(sel, stage); if (el) el.style.display = 'none'; });
    const r = $('#reveal');
    r.innerHTML = `<div class="reveal">${msgHTML}${msgHTML.includes('class="sent"') ? '' : sentenceHTML(s)}
      <div class="en-big">${esc(s.en)}</div>${audioButtons(txt, false)}${glossHTML(s, unknown)}
      <div class="memline">${SESS.practice ? 'practice: your schedule is not changed' : sentMemLine(item.key)}</div></div>`;
    bindCommon(r);
    if (S.settings.autoplay && !AUDIO_MODES.includes(mode)) say(false);
    renderGrades();
    $('#qhint').innerHTML = '<span><kbd>Space</kbd> accept suggestion</span><span><kbd>1</kbd> Again <kbd>2</kbd> Hard <kbd>3</kbd> Good <kbd>4</kbd> Easy</span><span><kbd>R</kbd> audio</span>';
  }
  function renderGrades() {
    const g = $('#grades'); g.classList.remove('hidden');
    const iv = SESS.practice ? null : previewFor(S.scards[item.key]);
    g.innerHTML = ['Again', 'Hard', 'Good', 'Easy'].map((n, i) => `<button class="grade g${i + 1} ${st.sug === i + 1 ? 'sug' : ''}" data-g="${i + 1}">
      <span class="gn">${n}</span><span class="gi">${iv ? (i === 0 ? 'relearn' : fmtIvl(iv[i])) : 'practice'}</span><span class="gk">${i + 1}</span></button>`).join('');
    $$('.grade', g).forEach(b => b.addEventListener('click', () => grade(+b.dataset.g)));
  }
  function grade(g) { if (!st.answered || Date.now() < st.lock) return; finishSentence(item, g, mode); }

  /* -- mode wiring -- */
  let tilesKey = null;
  if (mode === 'build' && S.settings.sentInput !== 'type') tilesKey = setupTiles();
  function setupTiles() {
    const gold = s.z.map((t, i) => ({ t, w: s.w[i] })).filter(x => x.w >= 0);
    const inSent = new Set(gold.map(g => g.w));
    const dist = pickDistinct(seenIds().filter(id => !inSent.has(id) && !gold.some(g => g.t === WORDS[id].h) && WORDS[id].l > 0), gold.length <= 3 ? 1 : 2);
    const tiles = shuffle([...gold.map(g => ({ t: g.t })), ...dist.map(id => ({ t: WORDS[id].h }))]);
    const used = new Set();
    let pos = 0, errs = 0;
    function draw() {
      let html = '', gi = 0;
      for (let i = 0; i < s.z.length; i++) {
        if (s.w[i] < 0) { if (gi > 0 && gi <= pos) html += `<span class="tokd" style="background:none;color:var(--muted)">${esc(s.z[i])}</span>`; continue; }
        if (gi < pos) html += `<span class="tokd">${esc(s.z[i])}</span>`;
        gi++;
      }
      $('#decout').innerHTML = html + (pos < gold.length ? '<span class="cursor"></span>' : '');
      $('#tiles').innerHTML = tiles.map((t, i) => `<button class="tile ${used.has(i) ? 'used' : ''}" data-ti="${i}"><span class="k">${i + 1}</span>${esc(t.t)}</button>`).join('');
      $$('[data-ti]', stage).forEach(b => b.addEventListener('click', () => choose(+b.dataset.ti)));
    }
    function choose(i) {
      if (st.answered || pos >= gold.length || used.has(i)) return;
      if (tiles[i].t === gold[pos].t) {
        used.add(i); pos++; SFX.tick(); draw();
        if (pos === gold.length) {
          const sug = errs === 0 && !st.hint ? 3 : errs <= 1 ? 2 : 1;
          reveal(sug, `<div class="verdict ${errs ? (errs > 1 ? 'bad' : 'meh') : 'ok'}">${errs ? `${errs} wrong pick${errs > 1 ? 's' : ''}` : 'Built it! 很好'}</div>`);
        }
      } else {
        errs++; SFX.bad();
        const b = $(`[data-ti="${i}"]`, stage); b.classList.remove('err'); void b.offsetWidth; b.classList.add('err');
      }
    }
    draw();
    return choose;
  }
  const sw = $('#swapin');
  if (sw) sw.addEventListener('click', () => { S.settings.sentInput = S.settings.sentInput === 'type' ? 'tiles' : 'type'; save(); showSentence(Object.assign({}, item, { forceMode: 'build' })); });

  function submitTyped() {
    const inp = $('#sin'); if (!inp || st.answered) return;
    const v = inp.value.trim();
    if (!v) { if (mode === 'dict') say(false); return; }
    const r = checkSentenceInput(v, s);
    const [cls, msg] = checkVerdict(r);
    inp.classList.add(cls === 'ok' ? 'ok' : cls === 'meh' ? 'meh' : 'bad');
    reveal(suggestionFromCheck(r), `<div class="verdict ${cls}">${esc(msg)}</div><div class="faint" style="font-size:12px">you typed: <span class="${r.kind === 'hanzi' ? 'han' : 'mono'}">${esc(v)}</span> · green = matched, red = missed</div>${diffHTML(s, r.tokOk)}`);
  }
  function revealTranslation() {
    if (st.answered) return;
    const e = $('#ein'), typed = e ? e.value.trim() : '';
    reveal(st.hint ? 2 : 3, typed ? `<div class="yours">your translation: <b>${esc(typed)}</b><div class="faint" style="font-size:12px">compare with the reference below, then rate yourself honestly</div></div>` : '');
  }
  const sin = $('#sin');
  if (sin) sin.addEventListener('keydown', e => {
    if (e.isComposing || e.keyCode === 229) return;                 // IME is composing: let it finish
    if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation();
      if (st.answered) return grade(st.sug);
      if (e.shiftKey && mode === 'dict') return say(true);
      submitTyped();
    }
  });
  const ein = $('#ein');
  if (ein) ein.addEventListener('keydown', e => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (st.answered) grade(st.sug); else revealTranslation(); }
  });
  const showPinyin = () => { if (st.answered || st.hint) return; st.hint = true; $('#pyhint').innerHTML = sentPinyinHTML(s); };
  $('#hintbtn') && $('#hintbtn').addEventListener('click', showPinyin);
  $('#revbtn') && $('#revbtn').addEventListener('click', revealTranslation);
  function chooseOpt(i) {
    if (st.answered || !opts[i]) return;
    const right = opts[i].key === s.key;
    $$('.opt', stage).forEach((b, j) => { b.disabled = true; b.classList.add(opts[j].key === s.key ? 'right' : j === i ? 'wrong' : 'dim'); });
    reveal(right ? 3 : 1);
  }
  $$('.opt', stage).forEach(b => b.addEventListener('click', () => chooseOpt(+b.dataset.i)));

  KEYH = e => {
    const k = e.key, inInput = e.target && e.target.tagName === 'INPUT' && !e.target.disabled;
    if (k === 'Escape') { endEpoch(true); return true; }
    if (inInput) return false;
    if (k === 'r' || k === 'R') { if (mode === 'build' && !st.answered) st.hint = true; say(false); return true; }
    if ((k === 's' || k === 'S') && (AUDIO_MODES.includes(mode) || st.answered)) { say(true); return true; }
    if (st.answered) {
      if (/^[1-4]$/.test(k)) { grade(+k); return true; }
      if (k === ' ' || k === 'Enter') { grade(st.sug); return true; }
      return false;
    }
    if (mode === 'listen' && /^[1-4]$/.test(k)) { chooseOpt(+k - 1); return true; }
    if (tilesKey && /^[1-9]$/.test(k)) { tilesKey(+k - 1); return true; }
    if ((mode === 'trans' || mode === 'ltrans') && (k === ' ' || k === 'Enter')) { revealTranslation(); return true; }
    if (mode === 'trans' && (k === 'p' || k === 'P')) { showPinyin(); return true; }
    return false;
  };
}

function finishSentence(item, g, mode) {
  const key = item.key;
  SESS.done++;
  SESS.grades.push(g);
  (SESS.sents[key] = SESS.sents[key] || []).push(g);
  if (!SESS.practice) {
    const wasNew = !isSentSeen(key);
    applySentGrade(key, g);
    S.scards[key].lm = mode;
    const ds = dayStats();
    if (wasNew) { ds.sNew = (ds.sNew || 0) + 1; SESS.nSentNew++; }
    else if (item.kind === 'srev') ds.rev++;
    addXP([0, 3, 8, 14, 16][g], 'sentence');
    if (item.first && g < 4) SESS.learn.push({ key, kind: 'slearn', at: SESS.step + 6, tries: 1 });
    else if (item.kind === 'slearn' && g === 1 && item.tries < 3) SESS.learn.push({ key, kind: 'slearn', at: SESS.step + 5, tries: item.tries + 1 });
    else if (item.kind === 'srev' && g === 1) SESS.learn.push({ key, kind: 'slearn', at: SESS.step + 6, tries: 1 });
  } else {
    addXP([0, 2, 5, 8, 9][g], 'gym');
    if (g === 1 && !item.retry) SESS.main.splice(Math.min(3, SESS.main.length), 0, Object.assign({}, item, { retry: true, forceMode: item.forceMode }));
  }
  save();
  flushLevelUps(nextItem);
}

/* ---------- mixing sentence cards into an epoch ---------- */
function mixSentences(main, sdue, snew) {
  const out = main.slice();
  const insertSpread = (items, from) => {
    if (!items.length) return;
    const span = Math.max(1, out.length - from);
    items.forEach((it, k) => {
      const pos = Math.min(out.length, from + Math.round((k + 1) * span / (items.length + 1)) + k);
      out.splice(pos, 0, it);
    });
  };
  insertSpread(sdue, Math.min(3, out.length));
  insertSpread(snew, Math.floor(out.length / 2));
  return out;
}

/* ---------- Sentence Gym ---------- */
const GYM_MODES = [['mixed', 'Mixed', '混合'], ['build', 'Build', '造句'], ['trans', 'Translate', '翻译'], ['listen', 'Listen', '听力'], ['dict', 'Dictation', '听写'], ['ltrans', 'Listen & translate', '听译']];
function gymPool(stretch) {
  if (stretch) {
    const one = SENTS.filter(s => { const u = sentUnknown(s); return u.length === 1 && WORDS[u[0]].l > 0 && sentWordIds(s).length >= 3; });
    if (one.length >= 5) return one;
  }
  return SENTS.filter(s => sentEligible(s) && s.w.filter(w => w >= 0).length >= 2);
}
function gymModal() {
  const tts = TTS.available();
  const eligible = gymPool(false).length, stretchN = SENTS.filter(s => sentUnknown(s).length === 1).length;
  let mode = 'mixed', stretch = false, n = 10;
  const m = modal(`<h2>Sentence gym · 练习 <span class="muted" style="font-weight:400;font-size:15px">liànxí</span></h2>
    <p class="muted" style="margin-top:0">Free practice with sentences made of words you know (${eligible} available right now). Your schedule is not touched.</p>
    <h3>Drill</h3><div class="games" id="gmodes">${GYM_MODES.map(([k, l, z]) => `<button class="gamebtn ${k === mode ? 'on' : ''}" data-m="${k}" ${!tts && AUDIO_MODES.includes(k) ? 'disabled title="needs a Chinese voice"' : ''}><div class="gz">${z}</div><div class="gt">${l}</div></button>`).join('')}</div>
    <label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer;margin:6px 0 4px"><input type="checkbox" id="gstretch" style="margin-top:4px;accent-color:var(--accent)"> <span><b>Stretch</b>: one unknown word per sentence, guess it from context (${stretchN} sentences)</span></label>
    <div class="row" style="margin-top:12px"><span class="muted">Sentences:</span>${[10, 20, 30].map(x => `<button class="btn small ${x === n ? 'primary' : ''}" data-n="${x}">${x}</button>`).join('')}<span class="spacer"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="gstart">Start <kbd style="color:inherit;background:transparent;border-color:rgba(255,255,255,.4)">Enter</kbd></button></div>`,
    null, { noEnter: true, keys: (e, close) => { if (e.key === 'Enter') { close(); startGym(mode, stretch, n); return true; } return false; } });
  $$('[data-m]', m.bg).forEach(b => b.addEventListener('click', () => { mode = b.dataset.m; $$('[data-m]', m.bg).forEach(x => x.classList.toggle('on', x === b)); }));
  $$('[data-n]', m.bg).forEach(b => b.addEventListener('click', () => { n = +b.dataset.n; $$('[data-n]', m.bg).forEach(x => x.classList.toggle('primary', x === b)); }));
  $('#gstretch', m.bg).addEventListener('change', e => { stretch = e.target.checked; });
  $('#gstart', m.bg).addEventListener('click', () => { m.close(); startGym(mode, stretch, n); });
}
function startGym(mode = 'mixed', stretch = false, n = 10) {
  if (SESS) endEpoch(true, true);
  const pool = gymPool(stretch);
  if (pool.length < 2) { toast('Learn a few more words first: sentences unlock once you know all their words.'); return; }
  // prefer sentences you haven't drilled much: unseen or weakly remembered first
  const score = s => { const c = S.scards[s.key]; return (c && c.st ? FSRS.retrievability(c) : 0.4) + Math.random() * 0.6; };
  const picks = pool.map(s => [score(s), s]).sort((a, b) => a[0] - b[0]).slice(0, n).map(x => x[1]);
  const items = shuffle(picks).map(s => ({ key: s.key, kind: 'gym', forceMode: mode === 'mixed' ? null : mode, stretch: stretch && sentUnknown(s).length > 0 }));
  SESS = {
    start: Date.now(), main: items, learn: [], step: 0, done: 0, grades: [], xp: 0, nNew: 0, nSentNew: 0, words: {}, sents: {},
    practice: true, gym: true, sinceGame: 0, nextGameAt: 99, lastGame: null, games: 0, epochNo: S.epochs.length + 1,
  };
  VIEW = 'session'; renderTop();
  $('#main').innerHTML = `<div class="sessbar" id="sessbar"></div><div class="stage" id="stage"></div>`;
  nextItem();
}

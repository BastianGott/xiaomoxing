/* ============================================================
   Chengyu (成语): rare FSRS idiom cards + the "Idiom" mini-game (masked LM by hand)
   ============================================================ */

const IDIOMS = (DATA.idioms || []).map(([h, s, lit, m, story, tag, ai], id) => ({ id, h, s, lit, m, story, tag, ai }));
const IDIOM_BY_KEY = Object.fromEntries(IDIOMS.map(x => [x.h, x]));
const IDIOM_MIN_VOCAB = 40;          // idiom cards start once the basics are in place

/* ---------- scheduling ---------- */
function ensureICard(key) { return S.icards[key] || (S.icards[key] = { st: 0, s: 0, d: 0, due: 0, last: 0, reps: 0, lapses: 0 }); }
const isIdiomSeen = key => { const c = S.icards[key]; return !!(c && c.st > 0); };
function idiomSeenCount() { return Object.values(S.icards).filter(c => c.st > 0).length; }
function dueIdiomKeys(di = today()) {
  return Object.keys(S.icards).filter(k => { const c = S.icards[k]; return IDIOM_BY_KEY[k] && c.st > 0 && !c.susp && c.due <= di; })
    .sort((a, b) => S.icards[a].due - S.icards[b].due);
}
function newIdiomKeys(limit) {
  if (limit <= 0 || seenIds().length < IDIOM_MIN_VOCAB) return [];
  const order = [...(S.iorder || []), ...IDIOMS.map(x => x.h)];
  const out = [];
  for (const k of order) { if (out.length >= limit) break; if (IDIOM_BY_KEY[k] && !isIdiomSeen(k) && !out.includes(k) && !(S.icards[k] && S.icards[k].susp)) out.push(k); }
  return out;
}
// idioms are a side dish: one new idiom every N days (Settings: off / weekly / every 3 days / daily)
function lastIdiomIntroDay() {
  let m = -1e9;
  for (const c of Object.values(S.icards)) { const t = c.first || (c.st > 0 ? c.last : 0); if (t) m = Math.max(m, dayIndex(t)); }
  return m;
}
function newIdiomLeftToday() {
  const every = +S.settings.idiomEvery || 0;
  if (!every || (dayStats().iNew || 0) > 0 || catchUpFactor() < 1) return 0;
  return today() - lastIdiomIntroDay() >= every ? 1 : 0;
}
function mixIdioms(main, idue, inew) {
  const out = main.slice();
  const put = (it, frac) => out.splice(Math.min(out.length, Math.max(1, Math.round(out.length * frac))), 0, it);
  idue.forEach((it, k) => put(it, (k + 1) / (idue.length + 1)));
  inew.forEach((it, k) => put(it, 0.35 + 0.3 * (k + 1) / (inew.length + 1)));
  return out;
}

/* ---------- renderers ---------- */
function idiomCharsHTML(x, opts = {}) {
  // characters with tone colors and the literal gloss underneath; opts.mask = index to hide
  return `<div class="idchars">${[...x.h].map((c, i) => {
    const [syl, t] = x.s[i];
    const hidden = opts.mask === i;
    return `<div class="idc ${hidden ? 'mask' : ''}"><div class="idz ${opts.plain ? '' : 't' + t}">${hidden ? '?' : esc(c)}</div>
      ${opts.pinyin === false ? '' : `<div class="idp">${hidden ? '·' : toneSpan(syl, t)}</div>`}
      ${opts.lit === false ? '' : `<div class="idl">${hidden ? '' : esc(x.lit[i])}</div>`}</div>`;
  }).join('')}</div>`;
}
function idiomInfoHTML(x, withChars = true) {
  return `${withChars ? idiomCharsHTML(x) : ''}
    <div class="row" style="justify-content:center;gap:6px;margin:4px 0">${speakBtn(x.h)}<button class="btn small ghost" data-slow="${esc(x.h)}">🐢 slow</button></div>
    <div class="mean" style="font-weight:600">${esc(x.m)}</div>
    ${x.story ? `<div class="idstory">📜 ${esc(x.story)}</div>` : ''}
    ${x.ai ? `<div class="idstory ai">🤖 ${esc(x.ai)}</div>` : ''}`;
}
function idiomMemLine(key) {
  const c = S.icards[key];
  if (!c || !c.st) return 'new idiom';
  return `stability ${fmtIvl(c.s)} · difficulty ${c.d.toFixed(1)} · recall ${(FSRS.retrievability(c) * 100).toFixed(0)}% · reviews ${c.reps}`;
}
function otherIdioms(x, n, filter = () => true) {
  const known = IDIOMS.filter(y => y.h !== x.h && isIdiomSeen(y.h) && filter(y));
  const rest = IDIOMS.filter(y => y.h !== x.h && !isIdiomSeen(y.h) && filter(y));
  return shuffle([...shuffle(known).slice(0, n), ...shuffle(rest)]).slice(0, n);
}
function maskChoices(x, pos) {
  const right = x.h[pos];
  const pool = [...new Set(IDIOMS.filter(y => y.h !== x.h).flatMap(y => [...y.h]))].filter(c => c !== right && !x.h.includes(c));
  return shuffle([right, ...shuffle(pool).slice(0, 3)]);
}
function pickMaskPos(x) {
  const chars = [...x.h];
  const cand = chars.map((c, i) => i).filter(i => chars.filter(c => c === chars[i]).length === 1);   // avoid repeated chars (马马虎虎)
  return pick(cand.length ? cand : [0, 1, 2, 3]);
}

/* ---------- idiom cards in the epoch ---------- */
function showIdiomIntro(item) {
  const x = IDIOM_BY_KEY[item.ikey];
  const stage = $('#stage');
  stage.innerHTML = `<div class="card qcard pop">
    <div class="newbadge"><span class="pill gold">new idiom</span></div>
    <div class="mode">idiom · 成语 chéngyǔ</div>
    ${idiomInfoHTML(x)}
    <div class="hint"><span><kbd>Space</kbd> got it</span><span><kbd>R</kbd> replay</span><span><kbd>K</kbd> I already know this</span></div>
    <div class="row" style="justify-content:center;margin-top:14px"><button class="btn ghost small" id="iknown">I already know this</button><button class="btn primary" id="igot">Got it →</button></div>
  </div>`;
  bindCommon(stage);
  if (S.settings.autoplay) setTimeout(() => TTS.speak(x.h), 150);
  const got = () => {
    if (!SESS.practice) { ensureICard(x.h); const ds = dayStats(); ds.iNew = (ds.iNew || 0) + 1; SESS.nIdiomNew++; }
    SESS.learn.push({ ikey: x.h, kind: 'ilearn', first: true, at: SESS.step + 4, tries: 0 });
    addXP(4, 'idiom'); save(); flushLevelUps(nextItem);
  };
  const known = () => {
    const c = ensureICard(x.h); Object.assign(c, { st: 2, s: 30, d: 3, last: Date.now(), reps: 1, due: today() + randInt(14, 35), known: true });
    const ds = dayStats(); ds.iNew = (ds.iNew || 0) + 1;
    addXP(2, 'idiom'); save(); toast(`Marked <span class="han">${esc(x.h)}</span> as known`); flushLevelUps(nextItem);
  };
  $('#igot').addEventListener('click', got);
  $('#iknown').addEventListener('click', known);
  KEYH = e => {
    if (e.key === ' ' || e.key === 'Enter') { got(); return true; }
    if (e.key === 'r' || e.key === 'R') { TTS.speak(x.h); return true; }
    if (e.key === 'k' || e.key === 'K') { known(); return true; }
    if (e.key === 'Escape') { endEpoch(true); return true; }
    return false;
  };
}
const IMODE_LABEL = { mean: ['meaning', '意思 yìsi'], fill: ['fill the [MASK]', '填空 tiánkòng'], recall: ['recall', '回忆 huíyì'], hear: ['listen · no characters', '听 tīng'] };
function chooseIdiomMode(item) {
  if (item.first) return 'mean';
  const tts = TTS.available();
  if (item.kind === 'ilearn') return pick(['fill', 'recall']);
  const c = S.icards[item.ikey]; const s = c && c.st ? c.s : 0;
  let w = s < 7 ? { mean: .35, fill: .35, recall: .3 } : { fill: .3, recall: .3, hear: .25, mean: .15 };
  if (!tts) delete w.hear;
  const keys = Object.keys(w), tot = keys.reduce((a, k) => a + w[k], 0);
  return keys[sample(keys.map(k => w[k] / tot))];
}
function showIdiomQuiz(item) {
  const x = IDIOM_BY_KEY[item.ikey];
  if (!x) return nextItem();
  const mode = chooseIdiomMode(item);
  const stage = $('#stage');
  const st = { answered: false, sug: 3, lock: 0 };
  const ml = IMODE_LABEL[mode];
  let prompt = '', opts = [], optHTML;
  if (mode === 'mean' || mode === 'hear') {
    opts = shuffle([x, ...otherIdioms(x, 3)]);
    optHTML = (o, i) => `<button class="opt" data-i="${i}"><span class="k">${i + 1}</span><span>${esc(o.m)}</span></button>`;
    prompt = mode === 'mean' ? `<div class="hz md">${esc(x.h)}</div>`
      : `<button class="speak huge" data-say="${esc(x.h)}">${ICON_SPEAK}</button><div class="row" style="justify-content:center"><button class="btn small ghost" data-slow="${esc(x.h)}">🐢 slow</button></div>`;
    prompt += '<div class="muted">What does it mean?</div>';
  } else if (mode === 'recall') {
    opts = shuffle([x, ...otherIdioms(x, 3)]);
    optHTML = (o, i) => `<button class="opt" data-i="${i}"><span class="k">${i + 1}</span><span class="hzo">${esc(o.h)}</span></button>`;
    prompt = `<div class="prompt-en">${esc(x.m)}</div><div class="muted">Which idiom?</div>`;
  } else {
    const pos = pickMaskPos(x);
    opts = maskChoices(x, pos).map(c => ({ c, right: c === x.h[pos] }));
    optHTML = (o, i) => `<button class="opt" data-i="${i}"><span class="k">${i + 1}</span><span class="hzo">${esc(o.c)}</span></button>`;
    prompt = `<div class="prompt-en" style="font-size:22px">${esc(x.m)}</div>${idiomCharsHTML(x, { mask: pos, lit: false, plain: true })}<div class="muted">Fill in the [MASK]</div>`;
  }
  stage.innerHTML = `<div class="card qcard pop"><div class="mode">idiom · ${ml[0]} · <span class="zh">${ml[1]}</span>${item.kind === 'ilearn' ? ' · <span style="color:var(--jade)">learning</span>' : ''}</div>
    ${prompt}<div class="opts">${opts.map(optHTML).join('')}</div><div id="reveal"></div></div><div class="grades hidden" id="grades"></div>
    <div class="hint" id="qhint"><span><kbd>1</kbd>–<kbd>4</kbd> answer</span><span><kbd>R</kbd> audio</span><span><kbd>Esc</kbd> end</span></div>`;
  bindCommon(stage);
  if (mode === 'hear') setTimeout(() => TTS.speak(x.h), 200);
  const isRight = o => mode === 'fill' ? o.right : o.h === x.h;
  function choose(i) {
    if (st.answered || !opts[i]) return;
    const right = isRight(opts[i]);
    $$('.opt', stage).forEach((b, j) => { b.disabled = true; b.classList.add(isRight(opts[j]) ? 'right' : j === i ? 'wrong' : 'dim'); });
    st.answered = true; st.sug = right ? 3 : 1; st.lock = Date.now() + 300;
    right ? SFX.good() : SFX.bad();
    const r = $('#reveal');
    r.innerHTML = `<div class="reveal">${idiomInfoHTML(x)}<div class="memline">${idiomMemLine(x.h)}</div></div>`;
    bindCommon(r);
    if (S.settings.autoplay && mode !== 'hear') TTS.speak(x.h);
    const g = $('#grades'); g.classList.remove('hidden');
    const iv = previewFor(S.icards[x.h]);
    g.innerHTML = ['Again', 'Hard', 'Good', 'Easy'].map((n, k) => `<button class="grade g${k + 1} ${st.sug === k + 1 ? 'sug' : ''}" data-g="${k + 1}"><span class="gn">${n}</span><span class="gi">${k === 0 ? 'relearn' : fmtIvl(iv[k])}</span><span class="gk">${k + 1}</span></button>`).join('');
    $$('.grade', g).forEach(b => b.addEventListener('click', () => grade(+b.dataset.g)));
    $('#qhint').innerHTML = '<span><kbd>Space</kbd> accept suggestion</span><span><kbd>1</kbd> Again <kbd>2</kbd> Hard <kbd>3</kbd> Good <kbd>4</kbd> Easy</span>';
  }
  function grade(g) { if (!st.answered || Date.now() < st.lock) return; finishIdiom(item, g, mode); }
  $$('.opt', stage).forEach(b => b.addEventListener('click', () => choose(+b.dataset.i)));
  KEYH = e => {
    const k = e.key;
    if (k === 'Escape') { endEpoch(true); return true; }
    if (k === 'r' || k === 'R') { TTS.speak(x.h); return true; }
    if (!st.answered) { if (/^[1-4]$/.test(k)) { choose(+k - 1); return true; } return false; }
    if (/^[1-4]$/.test(k)) { grade(+k); return true; }
    if (k === ' ' || k === 'Enter') { grade(st.sug); return true; }
    return false;
  };
}
function finishIdiom(item, g, mode) {
  const key = item.ikey;
  SESS.done++;
  SESS.grades.push(g);
  (SESS.idioms[key] = SESS.idioms[key] || []).push(g);
  if (!SESS.practice) {
    gradeCard(ensureICard(key), g);
    S.icards[key].lm = mode;
    if (item.kind === 'irev') dayStats().rev++;
    addXP([0, 3, 8, 14, 16][g], 'idiom');
    if (item.first && g < 4) SESS.learn.push({ ikey: key, kind: 'ilearn', at: SESS.step + 5, tries: 1 });
    else if (item.kind === 'ilearn' && g === 1 && item.tries < 3) SESS.learn.push({ ikey: key, kind: 'ilearn', at: SESS.step + 4, tries: item.tries + 1 });
    else if (item.kind === 'irev' && g === 1) SESS.learn.push({ ikey: key, kind: 'ilearn', at: SESS.step + 5, tries: 1 });
  }
  save();
  flushLevelUps(nextItem);
}

/* ---------- detail modal + collection ---------- */
function openIdiom(key) {
  const x = IDIOM_BY_KEY[key]; if (!x) return;
  const c = S.icards[key];
  const m = modal(`<div class="row"><span class="mode">idiom · 成语 chéngyǔ</span><span class="spacer"></span><span class="pill">${esc(x.tag)}</span></div>
    <div style="text-align:center">${idiomInfoHTML(x)}<div class="memline">${idiomMemLine(key)}</div></div>
    <div class="row" style="margin-top:16px">${!c || !c.st ? '<button class="btn" id="inext">Learn next</button>' : ''}<span class="spacer"></span><button class="btn" data-close>Close</button></div>`,
    () => { if (VIEW === 'lab') renderLab($('#main')); });
  const b = $('#inext', m.bg);
  if (b) b.addEventListener('click', () => { S.iorder = [key, ...(S.iorder || []).filter(k => k !== key)]; save(); toast(`<span class="han">${esc(x.h)}</span> is the next idiom card`); m.close(); });
}
function idiomCollectionHTML() {
  return `<div class="row" style="margin-top:26px"><h3 style="margin:0">Idiom collection · 成语</h3><span class="spacer"></span><span class="muted" style="font-size:13px">${idiomSeenCount()}/${IDIOMS.length} learned${seenIds().length < IDIOM_MIN_VOCAB ? ` · idiom cards start at ${IDIOM_MIN_VOCAB} words` : ''}</span></div>
    <div class="idgrid">${IDIOMS.map(x => { const seen = isIdiomSeen(x.h);
      return `<button class="idcard ${seen ? 'seen' : ''}" data-idiom="${esc(x.h)}" title="${esc(x.m)}"><span class="han">${esc(x.h)}</span><span class="faint" style="font-size:11px">${seen ? esc(x.m) : x.s.map(y => y[0]).join(' ')}</span></button>`; }).join('')}</div>`;
}

/* ---------- mini-game: Idiom (masked LM by hand) ---------- */
GAMES.idiom = {
  title: 'Idiom', zh: '成语', note: null, learn: 'mlm', logit: 0.1,
  desc: 'Chengyu as masked language modeling: fill the [MASK], order the tokens, guess the meaning.',
  available: () => IDIOMS.length >= 8,
  start: gameIdiom,
};
function gameIdiom(el, done) {
  const seen = shuffle(IDIOMS.filter(x => isIdiomSeen(x.h))).slice(0, 3);
  const fresh = shuffle(IDIOMS.filter(x => !isIdiomSeen(x.h)).slice(0, 10));
  const items = shuffle([...seen, ...fresh].slice(0, 6));
  const types = shuffle(['fill', 'fill', 'mean', 'mean', 'order', 'order']);
  let idx = 0, xp = 0, correct = 0;
  function play() {
    const x = items[idx], type = types[idx];
    let answered = false;
    const head = `<div class="explain">Idiom ${idx + 1}/${items.length} · ${type === 'fill' ? '<b>Masked LM</b>: one token is hidden. Context from both sides tells you which it is (that\'s how BERT is trained).' : type === 'order' ? '<b>Autoregressive</b>: generate the four tokens in the right order.' : '<b>Meaning</b>: the literal reading is a hint, the real meaning is figurative.'}</div>`;
    const after = (ok, extra = '') => {
      answered = true;
      const tl = $('#idtiles'); if (tl) tl.style.display = 'none';
      if (ok) { correct++; SFX.good(); } else SFX.bad();
      $('#idres').innerHTML = `<div class="reveal" style="text-align:center">${extra}${idiomInfoHTML(x, type !== 'mean')}
        <div class="row" style="justify-content:center;margin-top:12px"><button class="btn primary" id="idnext">${idx + 1 < items.length ? 'Next idiom' : 'Finish'} <kbd style="color:inherit;background:transparent;border-color:rgba(255,255,255,.4)">Enter</kbd></button></div></div>`;
      bindCommon($('#idres'));
      TTS.speak(x.h);
      $('#idnext').addEventListener('click', next);
    };
    if (type === 'fill' || type === 'mean') {
      let opts, optHTML, prompt;
      if (type === 'fill') {
        const pos = pickMaskPos(x);
        opts = maskChoices(x, pos).map(c => ({ c, right: c === x.h[pos] }));
        optHTML = (o, i) => `<button class="opt" data-i="${i}"><span class="k">${i + 1}</span><span class="hzo">${esc(o.c)}</span></button>`;
        prompt = `<div class="prompt-en" style="font-size:22px;text-align:center">${esc(x.m)}</div>${idiomCharsHTML(x, { mask: pos })}`;
      } else {
        opts = shuffle([x, ...otherIdioms(x, 3)]).map(o => ({ m: o.m, right: o.h === x.h }));
        optHTML = (o, i) => `<button class="opt" data-i="${i}"><span class="k">${i + 1}</span><span>${esc(o.m)}</span></button>`;
        prompt = idiomCharsHTML(x);
      }
      el.innerHTML = `${head}<div style="text-align:center">${prompt}</div><div class="opts">${opts.map(optHTML).join('')}</div><div id="idres"></div>`;
      const choose = i => {
        if (answered || !opts[i]) return;
        $$('.opt', el).forEach((b, j) => { b.disabled = true; b.classList.add(opts[j].right ? 'right' : j === i ? 'wrong' : 'dim'); });
        if (opts[i].right) xp += 6;
        after(opts[i].right);
      };
      $$('.opt', el).forEach(b => b.addEventListener('click', () => choose(+b.dataset.i)));
      KEYH = e => {
        if (answered) { if (e.key === 'Enter' || e.key === ' ') { next(); return true; } return false; }
        if (/^[1-4]$/.test(e.key)) { choose(+e.key - 1); return true; }
        if (e.key === 'r' || e.key === 'R') { TTS.speak(x.h); return true; }
        return false;
      };
    } else {
      const chars = [...x.h];
      const tiles = shuffle(chars.map((c, i) => ({ c, i })));
      const used = new Set(); let pos = 0, errs = 0;
      const draw = () => {
        $('#idout').innerHTML = chars.slice(0, pos).map(c => `<span class="tokd">${esc(c)}</span>`).join('') + (pos < 4 ? '<span class="cursor"></span>' : '');
        $('#idtiles').innerHTML = tiles.map((t, k) => `<button class="tile ${used.has(k) ? 'used' : ''}" data-ti="${k}" data-c="${esc(t.c)}"><span class="k">${k + 1}</span>${esc(t.c)}<span class="tg">${esc(x.lit[t.i])}</span></button>`).join('');
        $$('[data-ti]', el).forEach(b => b.addEventListener('click', () => choose(+b.dataset.ti)));
      };
      const choose = k => {
        if (answered || used.has(k)) return;
        if (tiles[k].c === chars[pos]) {
          used.add(k); pos++; SFX.tick(); draw();
          if (pos === 4) { xp += Math.max(1, 6 - 2 * errs); after(errs === 0, `<div class="verdict ${errs ? 'meh' : 'ok'}">${errs ? errs + ' wrong pick' + (errs > 1 ? 's' : '') : 'Perfect order!'}</div>`); }
        } else { errs++; SFX.bad(); const b = $(`[data-ti="${k}"]`, el); b.classList.remove('err'); void b.offsetWidth; b.classList.add('err'); }
      };
      el.innerHTML = `${head}<div class="prompt-en" style="font-size:22px;text-align:center">${esc(x.m)}</div>
        <div class="decout" id="idout"></div><div class="tiles" id="idtiles"></div><div id="idres"></div>`;
      draw();
      KEYH = e => {
        if (answered) { if (e.key === 'Enter' || e.key === ' ') { next(); return true; } return false; }
        if (/^[1-4]$/.test(e.key)) { choose(+e.key - 1); return true; }
        return false;
      };
    }
  }
  function next() { idx++; if (idx < items.length) play(); else end(); }
  function end() {
    KEYH = null;
    el.innerHTML = `<div class="explain">Chengyu are four fixed tokens, so they have almost zero perplexity once you know them: see three characters and the fourth is nearly certain. That's exactly the signal a <b>masked language model</b> learns from. Idioms you meet here also come back as occasional idiom cards in your epochs.</div>`;
    done({ xp: Math.max(4, xp), score: Math.round(100 * correct / items.length), summary: `${correct}/${items.length} correct` });
  }
  play();
}

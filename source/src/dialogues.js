/* ============================================================
   Chat fine-tuning: dialogue cards (FSRS) + Chat gym, the Particles mini-game,
   usage notes for chat words (reactions, mood particles, fillers, slang, function words)
   ============================================================ */

const DLGS = (DATA.dlgs || []).map(([cat, turns], id) => {
  const t = turns.map(([w, z, s, en, spk]) => ({ w, z, s, en, spk, key: z.join('') }));
  return { id, cat, t, key: t.map(x => x.key).join('｜') };
});
const DLG_BY_KEY = Object.fromEntries(DLGS.map(d => [d.key, d]));
const DLGS_BY_WORD = {};
DLGS.forEach(d => new Set(d.t.flatMap(x => x.w.filter(w => w >= 0))).forEach(id => (DLGS_BY_WORD[id] = DLGS_BY_WORD[id] || []).push(d.id)));
const PARTICLE_GLOSS = { 吗: 'yes/no question', 吧: 'suggestion · "…right?"', 呢: '"and you?" · ongoing', 啊: 'feeling · warmth', 嘛: 'obviously · come on', 啦: 'cheerful 了 + 啊', 呀: 'soft 啊', 了: 'done · new situation' };
const PART_WRONG = { 啊: ['吗', '吧', '呢'], 吧: ['吗', '呢', '啊'], 呢: ['吗', '吧'], 吗: ['吧', '呢', '啦'], 嘛: ['吗', '吧', '呢'], 啦: ['吗', '呢', '吧'], 呀: ['吗', '吧'] };
const PITEMS = (DATA.parts || []).map(([w, z, s, blanks, wrong, sit, ex], id) => ({ id, w, z, s, blanks, wrong, sit, ex, ans: z[blanks[0]] }));
const asTurn = ([w, z, s], spk = 'A', en = '') => ({ w, z, s, en, spk, key: z.join('') });
const CONTRASTS = (DATA.contrast || []).map(([label, items, ex], id) => ({ id, label, ex, items: items.map(([w, z, s, m]) => Object.assign(asTurn([w, z, s]), { m })) }));
const ECHO = (DATA.echo || []).map(([q, opts, intent, ex], id) => ({ id, q: asTurn(q, 'A'), ans: asTurn(opts[0], 'B'), wrong: opts.slice(1).map(o => asTurn(o, 'B')), intent, ex }));

/* ---------- chat words: labels + usage notes ---------- */
function kindPill(id) {
  const x = SPOKEN_BY_ID[id]; if (!x) return '';
  const [zh, en] = KIND_LABEL[x.kind];
  const cls = x.kind === 'vulgar' ? 'warn' : x.kind === 'slang' ? 'gold' : 'blue';
  return `<span class="pill ${cls}" title="chat word${S.settings.chatBoost ? ': trained at ' + Math.round(CHAT_RETENTION * 100) + '% retention for extra reviews' : ''}">💬 ${zh} · ${en}</span>`;
}
/** usage text: runs of Chinese become clickable audio */
function noteHTML(text) {
  return esc(text).replace(/[一-鿿][一-鿿，。？！、…]*/g, m => `<span class="han say" data-say="${m}" title="play">${m}</span>`);
}
function usageHTML(id, small = false) {
  const x = SPOKEN_BY_ID[id]; if (!x) return '';
  return `<div class="usage ${small ? 'small' : ''} k-${x.kind}"><div class="un">💬 ${noteHTML(x.note)}</div></div>`;
}

/* ---------- scheduling ---------- */
function ensureDCard(key) { return S.dcards[key] || (S.dcards[key] = { st: 0, s: 0, d: 0, due: 0, last: 0, reps: 0, lapses: 0 }); }
const isDlgSeen = key => { const c = S.dcards[key]; return !!(c && c.st > 0); };
const dlgWordIds = d => [...new Set(d.t.flatMap(x => x.w.filter(w => w >= 0)))];
const dlgEligible = d => dlgWordIds(d).every(id => isSeen(id) && !isSusp(id));
function dlgSeenCount() { return Object.values(S.dcards).filter(c => c.st > 0).length; }
function eligibleDlgCount() { return DLGS.filter(dlgEligible).length; }
function dueDlgKeys(di = today()) {
  return Object.keys(S.dcards).filter(k => { const c = S.dcards[k], d = DLG_BY_KEY[k]; return d && c.st > 0 && !c.susp && c.due <= di && !dlgWordIds(d).some(isSusp); })
    .sort((a, b) => S.dcards[a].due - S.dcards[b].due || FSRS.retrievability(S.dcards[a]) - FSRS.retrievability(S.dcards[b]));
}
/** new dialogues: all words known; dialogues with freshly learned chat words come first */
function newDlgKeys(limit) {
  if (limit <= 0) return [];
  const fresh = id => { const c = S.cards[id]; return c && c.first && Date.now() - c.first < 7 * DAY_MS; };
  return DLGS.filter(d => !isDlgSeen(d.key) && dlgEligible(d) && !(S.dcards[d.key] && S.dcards[d.key].susp))
    .map(d => { const ws = dlgWordIds(d); const chat = ws.filter(id => SPOKEN_BY_ID[id]);
      return [d.t.reduce((a, x) => a + x.z.length, 0) * 0.5 - chat.length * 2 - chat.filter(fresh).length * 4 + Math.random() * 6, d.key]; })
    .sort((a, b) => a[0] - b[0]).slice(0, limit).map(x => x[1]);
}
function newDlgLeftToday() { return Math.max(0, Math.floor((S.settings.newDlgPerDay || 0) * catchUpFactor()) - (dayStats().dNew || 0)); }
function mixDialogues(main, ddue, dnew) {
  const out = main.slice();
  const put = (it, frac) => out.splice(Math.min(out.length, Math.max(1, Math.round(out.length * frac))), 0, it);
  ddue.forEach((it, k) => put(it, (k + 1) / (ddue.length + 1)));
  dnew.forEach((it, k) => put(it, 0.25 + 0.6 * (k + 1) / (dnew.length + 1)));
  return out;
}
function dlgMemLine(key) {
  const c = S.dcards[key];
  if (!c || !c.st) return 'new dialogue';
  return `stability ${fmtIvl(c.s)} · difficulty ${c.d.toFixed(1)} · recall ${(FSRS.retrievability(c) * 100).toFixed(0)}% · reviews ${c.reps}`;
}

/* ---------- rendering ---------- */
const turnTexts = d => d.t.map(x => x.key);
const sayTurnsAttr = d => esc(turnTexts(d).join('｜'));
/** one chat bubble. o: {pinyin, mask:Set of token idx, hidden, en, hl, cls} */
function bubbleHTML(turn, o = {}) {
  const side = turn.spk === 'A' ? 'a' : 'b';
  let inner;
  if (o.hidden) inner = '<div class="btxt dots">…</div>';
  else if (o.pinyin) {
    const s = o.mask && o.mask.size ? { w: turn.w.map((w, i) => o.mask.has(i) ? -1 : w), z: turn.z.map((z, i) => o.mask.has(i) ? '＿' : z), s: turn.s } : turn;
    inner = sentenceHTML(s, o.hl == null ? -1 : o.hl, true);
  } else inner = `<div class="btxt han">${turn.z.map((z, i) => o.mask && o.mask.has(i) ? '<span class="pmask">＿</span>' : esc(z)).join('')}</div>`;
  return `<div class="bub ${side} ${o.cls || ''}"><span class="who">${turn.spk}</span><div class="bbody">${inner}${o.en ? `<div class="ben">${esc(turn.en)}</div>` : ''}</div></div>`;
}
function chatHTML(d, o = {}) {
  return `<div class="chat ${o.small ? 'small' : ''}">${d.t.map((t, i) => bubbleHTML(t, {
    pinyin: o.pinyin, en: o.en, hl: o.hl, hidden: o.hideLast && i === d.t.length - 1, mask: o.slot && o.slot[0] === i ? o.slot[1] : null,
  })).join('')}</div>`;
}
/** a dialogue as the example on a chat word's card */
function dlgExampleHTML(id, small = false) {
  const ids = DLGS_BY_WORD[id] || [];
  if (!ids.length) return '';
  const scored = ids.map(i => { const d = DLGS[i]; const unk = dlgWordIds(d).filter(w => w !== id && !isSeen(w)).length; return [unk * 10 + d.t.reduce((a, x) => a + x.z.length, 0) + Math.random() * 3, d]; });
  scored.sort((a, b) => a[0] - b[0]);
  const d = scored[0][1];
  return `<div class="exbox chatex ${small ? 'small' : ''}" data-turns="${sayTurnsAttr(d)}" title="Click to hear the exchange">${chatHTML(d, { pinyin: true, en: true, hl: id, small: true })}</div>`;
}
/** particle slot: the last mood particle in the dialogue (all its copies in that turn are masked) */
function particleSlot(d) {
  for (let ti = d.t.length - 1; ti >= 0; ti--) {
    const t = d.t[ti];
    for (let k = t.z.length - 1; k >= 0; k--) if (PART_WRONG[t.z[k]] && t.w[k] >= 0) {
      const p = t.z[k];
      return [ti, new Set(t.z.map((z, i) => z === p ? i : -1).filter(i => i >= 0)), p];
    }
  }
  return null;
}
function replyOptions(d) {
  const last = d.t[d.t.length - 1];
  const pool = DLGS.filter(x => x.cat !== d.cat && x.key !== d.key).map(x => x.t[x.t.length - 1])
    .filter(t => t.key !== last.key && t.en !== last.en && Math.abs(t.z.length - last.z.length) <= 5);
  const known = pool.filter(t => t.w.every(w => w < 0 || isSeen(w)));
  const src = known.length >= 6 ? known : pool;
  const picked = [];
  for (const t of shuffle(src)) { if (picked.length >= 3) break; if (!picked.some(p => p.key === t.key || p.en === t.en)) picked.push(t); }
  return shuffle([last, ...picked]);
}

/* ---------- the dialogue card ---------- */
const DMODE_LABEL = {
  read: ['read the chat', '对话 duìhuà'], reply: ['pick the reply', '回复 huífù'],
  listen: ['listen · no characters', '听 tīng'], particle: ['mood particle', '语气词 yǔqìcí'],
};
function chooseDlgMode(item, d) {
  const tts = TTS.available(), slot = particleSlot(d);
  if (item.forceMode && (item.forceMode !== 'listen' || tts) && (item.forceMode !== 'particle' || slot)) return item.forceMode;
  const c = S.dcards[item.dkey];
  const s = c && c.st ? c.s : 0;
  if (item.first || ((!c || !c.st) && !SESS.practice)) return 'read';
  let w;
  if (item.kind === 'dlearn') w = { reply: .6, particle: .4 };
  else if (s < 4) w = { reply: .45, particle: .25, read: .15, listen: .15 };
  else if (s < 15) w = { reply: .35, listen: .3, particle: .2, read: .15 };
  else w = { listen: .45, reply: .35, particle: .2 };
  if (!slot) delete w.particle;
  if (!tts) delete w.listen;
  if (c && c.lm && w[c.lm] && Object.keys(w).length > 1) w[c.lm] *= 0.3;
  const keys = Object.keys(w), tot = keys.reduce((a, k) => a + w[k], 0);
  return keys[sample(keys.map(k => w[k] / tot))];
}
function showDialogue(item) {
  const d = DLG_BY_KEY[item.dkey];
  if (!d) return nextItem();
  const mode = chooseDlgMode(item, d);
  const stage = $('#stage');
  const st = { answered: false, sug: 3, lock: 0, pinyin: false };
  const ml = DMODE_LABEL[mode];
  const last = d.t[d.t.length - 1];
  const slot = mode === 'particle' ? particleSlot(d) : null;
  const tags = [item.first ? '<span style="color:var(--jade)">new dialogue</span>' : '', item.kind === 'dlearn' ? '<span style="color:var(--jade)">learning</span>' : '', SESS.gym ? 'chat gym' : ''].filter(Boolean).join(' · ');
  const head = `<div class="mode">chat · ${ml[0]} · <span class="zh">${ml[1]}</span>${tags ? ' · ' + tags : ''}</div>`;
  let opts = [];
  const say = slow => TTS.speakTurns(turnTexts(d), slow ? S.settings.rate * 0.65 : undefined);
  function promptHTML() {
    if (mode === 'read') return `${chatHTML(d, { pinyin: st.pinyin })}<div class="muted" style="margin-top:6px">What are they saying? Work it out from the words you know.</div>`;
    if (mode === 'reply') return `${chatHTML(d, { pinyin: st.pinyin, hideLast: true })}<div class="muted" style="margin-top:6px">How does ${last.spk} reply?</div>`;
    if (mode === 'particle') return `${chatHTML(d, { pinyin: st.pinyin, slot })}<div class="muted" style="margin-top:6px">${esc(d.t[slot[0]].spk)} means: <b>${esc(d.t[slot[0]].en)}</b> · which particle?</div>`;
    return `<button class="speak huge" data-turns="${sayTurnsAttr(d)}" title="Replay (R)">${ICON_SPEAK}</button><div class="row" style="justify-content:center"><button class="btn small ghost" id="dslow" title="Slow (S)">🐢 slow</button></div>
      <div class="muted" style="margin-top:6px">Two people talking. What does ${last.spk} answer?</div>`;
  }
  if (mode === 'reply') opts = replyOptions(d).map(t => ({ t, right: t.key === last.key }));
  if (mode === 'listen') opts = replyOptions(d).map(t => ({ t, right: t.key === last.key }));
  if (mode === 'particle') opts = shuffle([slot[2], ...shuffle(PART_WRONG[slot[2]]).slice(0, 3)]).map(p => ({ p, right: p === slot[2] }));
  const optHTML = (o, i) => mode === 'reply'
    ? `<button class="opt" data-i="${i}"><span class="k">${i + 1}</span><span class="optzh"><span class="han">${esc(o.t.key)}</span>${st.pinyin ? `<span class="optpy">${sentPinyinHTML(o.t)}</span>` : ''}</span></button>`
    : mode === 'listen' ? `<button class="opt" data-i="${i}"><span class="k">${i + 1}</span><span>${esc(o.t.en)}</span></button>`
    : `<button class="opt" data-i="${i}"><span class="k">${i + 1}</span><span class="hzo">${esc(o.p)}</span><span class="muted" style="font-size:12px">${esc(PARTICLE_GLOSS[o.p] || '')}</span></button>`;
  const hint = {
    read: '<span><kbd>Enter</kbd> reveal</span><span><kbd>P</kbd> pinyin</span><span><kbd>R</kbd> audio</span>',
    reply: '<span><kbd>1</kbd>–<kbd>4</kbd> answer</span><span><kbd>P</kbd> pinyin</span>',
    particle: '<span><kbd>1</kbd>–<kbd>4</kbd> answer</span><span><kbd>P</kbd> pinyin</span>',
    listen: '<span><kbd>1</kbd>–<kbd>4</kbd> answer</span><span><kbd>R</kbd> replay</span><span><kbd>S</kbd> slow</span>',
  }[mode];
  function draw() {
    stage.innerHTML = `<div class="card qcard pop">${head}<div id="dprompt">${promptHTML()}</div>
      ${opts.length ? `<div class="opts ${mode === 'particle' ? '' : 'one'}" id="dopts">${opts.map(optHTML).join('')}</div>` : ''}
      ${mode === 'read' ? '<div class="row" style="justify-content:center;margin-top:12px"><button class="btn small ghost" id="dpy">Show pinyin</button><button class="btn small" id="drev">Reveal <kbd>Enter</kbd></button></div>' : ''}
      ${mode !== 'listen' && mode !== 'read' ? '<div class="row" style="justify-content:center;margin-top:10px"><button class="lnk" id="dpy">show pinyin</button></div>' : ''}
      <div id="reveal"></div></div><div class="grades hidden" id="grades"></div>
      <div class="hint" id="qhint">${hint}<span><kbd>Esc</kbd> end</span></div>`;
    bindCommon(stage);
    $$('.opt', stage).forEach(b => b.addEventListener('click', () => choose(+b.dataset.i)));
    const py = $('#dpy'); if (py) py.addEventListener('click', togglePinyin);
    const rv = $('#drev'); if (rv) rv.addEventListener('click', () => reveal(st.pinyin ? 2 : 3));
    const sl = $('#dslow'); if (sl) sl.addEventListener('click', e => { e.stopPropagation(); say(true); });
  }
  function togglePinyin() {
    if (st.answered || mode === 'listen') return;
    st.pinyin = !st.pinyin;
    $('#dprompt').innerHTML = promptHTML(); bindCommon($('#dprompt'));
    if (mode === 'reply') { $('#dopts').innerHTML = opts.map(optHTML).join(''); $$('.opt', stage).forEach(b => b.addEventListener('click', () => choose(+b.dataset.i))); }
    const py = $('#dpy'); if (py) py.textContent = st.pinyin ? 'hide pinyin' : (mode === 'read' ? 'Show pinyin' : 'show pinyin');
  }
  draw();
  if (mode === 'listen') setTimeout(() => say(false), 250);
  else if (S.settings.autoplay && mode === 'read') setTimeout(() => say(false), 250);

  function reveal(sug, msg = '') {
    if (st.answered) return;
    st.answered = true; st.sug = sug; st.lock = Date.now() + 300;
    if (mode !== 'read') { if (sug >= 3) SFX.good(); else SFX.bad(); }
    ['#drev', '#dpy'].forEach(sel => { const el = $(sel, stage); if (el) el.style.display = 'none'; });
    // usage notes: the masked particle first, then reactions/particles/fillers before plain function words
    const kOrder = { particle: 0, react: 0, filler: 1, spoken: 1, slang: 1, vulgar: 1, func: 2 };
    const maskedId = slot ? d.t[slot[0]].w[[...slot[1]][0]] : -1;
    const chatWords = dlgWordIds(d).filter(id => SPOKEN_BY_ID[id])
      .sort((a, b) => (a === maskedId ? -1 : 0) - (b === maskedId ? -1 : 0) || kOrder[SPOKEN_BY_ID[a].kind] - kOrder[SPOKEN_BY_ID[b].kind]).slice(0, 2);
    $('#reveal').innerHTML = `<div class="reveal">${msg}<div class="exbox chatex" data-turns="${sayTurnsAttr(d)}" title="Click to hear">${chatHTML(d, { pinyin: true, en: true })}</div>
      ${glossHTML({ w: d.t.flatMap(x => x.w) })}
      ${chatWords.map(id => `<div class="usage small"><span class="han" style="font-size:18px">${esc(WORDS[id].h)}</span> ${noteHTML(SPOKEN_BY_ID[id].note)}</div>`).join('')}
      <div class="memline">${SESS.practice ? 'practice: your schedule is not changed' : dlgMemLine(item.dkey)}</div></div>`;
    bindCommon($('#reveal'));
    if (mode !== 'listen' && S.settings.autoplay) say(false);
    const g = $('#grades'); g.classList.remove('hidden');
    const iv = SESS.practice ? null : previewFor(S.dcards[item.dkey]);
    g.innerHTML = ['Again', 'Hard', 'Good', 'Easy'].map((n, k) => `<button class="grade g${k + 1} ${st.sug === k + 1 ? 'sug' : ''}" data-g="${k + 1}"><span class="gn">${n}</span><span class="gi">${iv ? (k === 0 ? 'relearn' : fmtIvl(iv[k])) : 'practice'}</span><span class="gk">${k + 1}</span></button>`).join('');
    $$('.grade', g).forEach(b => b.addEventListener('click', () => grade(+b.dataset.g)));
    $('#qhint').innerHTML = '<span><kbd>Space</kbd> accept suggestion</span><span><kbd>1</kbd> Again <kbd>2</kbd> Hard <kbd>3</kbd> Good <kbd>4</kbd> Easy</span><span><kbd>R</kbd> audio</span>';
  }
  function choose(i) {
    if (st.answered || !opts[i]) return;
    const right = opts[i].right;
    $$('.opt', stage).forEach((b, j) => { b.disabled = true; b.classList.add(opts[j].right ? 'right' : j === i ? 'wrong' : 'dim'); });
    if (!right && mode !== 'particle') $$('.opt', stage)[i].insertAdjacentHTML('beforeend', `<span class="muted" style="margin-left:auto;font-size:12px;text-align:right">${mode === 'reply' ? esc(opts[i].t.en) : esc(opts[i].t.key)}</span>`);
    reveal(right ? (st.pinyin && mode !== 'particle' ? 2 : 3) : 1, right ? '' : `<div class="verdict bad">${mode === 'particle' ? `${esc(opts[i].p)} would mean: ${esc(PARTICLE_GLOSS[opts[i].p])}. Here ${esc(slot[2])} fits.` : 'Not the natural reply here.'}</div>`);
  }
  function grade(g) { if (!st.answered || Date.now() < st.lock) return; finishDialogue(item, g, mode); }

  KEYH = e => {
    const k = e.key;
    if (k === 'Escape') { endEpoch(true); return true; }
    if (k === 'r' || k === 'R') { say(false); return true; }
    if (k === 's' || k === 'S') { say(true); return true; }
    if (st.answered) {
      if (/^[1-4]$/.test(k)) { grade(+k); return true; }
      if (k === ' ' || k === 'Enter') { grade(st.sug); return true; }
      return false;
    }
    if (k === 'p' || k === 'P') { togglePinyin(); return true; }
    if (mode === 'read' && (k === ' ' || k === 'Enter')) { reveal(st.pinyin ? 2 : 3); return true; }
    if (opts.length && /^[1-4]$/.test(k)) { choose(+k - 1); return true; }
    return false;
  };
}
function finishDialogue(item, g, mode) {
  const key = item.dkey;
  SESS.done++;
  SESS.grades.push(g);
  (SESS.dlgs[key] = SESS.dlgs[key] || []).push(g);
  if (!SESS.practice) {
    const wasNew = !isDlgSeen(key);
    gradeCard(ensureDCard(key), g);
    S.dcards[key].lm = mode;
    const ds = dayStats();
    if (wasNew) { ds.dNew = (ds.dNew || 0) + 1; SESS.nDlgNew = (SESS.nDlgNew || 0) + 1; }
    else if (item.kind === 'drev') ds.rev++;
    addXP([0, 3, 8, 12, 14][g], 'dialogue');
    if (item.first && g < 4) SESS.learn.push({ dkey: key, kind: 'dlearn', at: SESS.step + 5, tries: 1 });
    else if (item.kind === 'dlearn' && g === 1 && item.tries < 3) SESS.learn.push({ dkey: key, kind: 'dlearn', at: SESS.step + 4, tries: item.tries + 1 });
    else if (item.kind === 'drev' && g === 1) SESS.learn.push({ dkey: key, kind: 'dlearn', at: SESS.step + 5, tries: 1 });
  } else {
    addXP([0, 2, 5, 8, 9][g], 'chat gym');
    if (g === 1 && !item.retry) SESS.main.splice(Math.min(3, SESS.main.length), 0, Object.assign({}, item, { retry: true, forceMode: null }));
  }
  save();
  flushLevelUps(nextItem);
}

/* ---------- Chat gym ---------- */
function startChatGym(n = 10) {
  if (SESS) endEpoch(true, true);
  const pool = DLGS.filter(dlgEligible);
  if (pool.length < 2) { toast('Learn a few more words first: dialogues unlock once you know all their words. Chat words come in every epoch.'); return; }
  const score = d => { const c = S.dcards[d.key]; return (c && c.st ? FSRS.retrievability(c) : 0.4) + Math.random() * 0.6; };
  const picks = pool.map(d => [score(d), d]).sort((a, b) => a[0] - b[0]).slice(0, n).map(x => x[1]);
  const items = shuffle(picks).map(d => ({ dkey: d.key, kind: 'dgym' }));
  SESS = {
    start: Date.now(), main: items, learn: [], step: 0, done: 0, grades: [], xp: 0, nNew: 0, nSentNew: 0, words: {}, sents: {}, idioms: {}, dlgs: {},
    practice: true, gym: true, chat: true, sinceGame: 0, nextGameAt: 99, lastGame: null, games: 0, epochNo: S.epochs.length + 1,
  };
  VIEW = 'session'; renderTop();
  $('#main').innerHTML = `<div class="sessbar" id="sessbar"></div><div class="stage" id="stage"></div>`;
  nextItem();
}

/* ---------- Chat phrasebook (Lab) ---------- */
function phrasebookHTML() {
  const groups = [['react', 'Reactions · 口语'], ['particle', 'Mood particles · 语气词'], ['filler', 'Fillers · 口语'], ['func', 'Function words · 虚词'], ['spoken', 'Everyday words · 口语'], ['slang', 'Slang · 俚语'], ['vulgar', 'Vulgar · 粗口']];
  const learned = SPOKEN.filter(x => isSeen(x.id)).length;
  return `<div class="row" style="margin-top:26px"><h3 style="margin:0">Chat phrasebook · 口语</h3><span class="spacer"></span><span class="muted" style="font-size:13px">${learned}/${SPOKEN.length} chat words learned · ${dlgSeenCount()}/${DLGS.length} dialogues</span></div>
    <p class="muted" style="font-size:13px;margin:4px 0 0">How people actually talk. These words come ${S.settings.chatPerEpoch || 0} per epoch (Settings) and get extra reviews. Click one for its usage note.</p>
    ${groups.map(([k, label]) => { const xs = SPOKEN.filter(x => x.kind === k); if (!xs.length) return '';
      return `<div class="faint" style="font-size:12px;margin:12px 0 0;text-transform:uppercase;letter-spacing:1px">${label}</div><div class="idgrid">${xs.map(x => { const w = WORDS[x.id], seen = isSeen(x.id);
        return `<button class="idcard ${seen ? 'seen' : ''}" data-word="${x.id}" title="${esc(w.m)}"><span class="han">${esc(w.h)}</span><span class="faint" style="font-size:11px">${esc(w.p)} · ${esc(w.m)}</span></button>`; }).join('')}</div>`; }).join('')}`;
}

/* ---------- mini-game: Particles (tone tokens) + contrast sets ---------- */
const unknownIn = ws => ws.filter(id => id >= 0 && !isSeen(id)).length;
function particlePool() { return PITEMS.filter(p => p.w.every((id, i) => id < 0 || p.blanks.includes(i) || isSeen(id))); }
function contrastPool() { return CONTRASTS.filter(c => unknownIn([...new Set(c.items.flatMap(x => x.w))]) <= 1); }
GAMES.particles = {
  title: 'Particles', zh: '语气词', note: null, learn: 'sft', logit: 0.6,
  desc: 'Same words, different tone: pick the mood particle (吧 啊 呢 吗 嘛 啦), and match contrast sets like 我吃了 / 我在吃 / 我不吃 / 我没吃.',
  available: () => particlePool().length >= 4,
  start: gameParticles,
};
function gameParticles(el, done) {
  const pool = shuffle(particlePool());
  const cs = shuffle(contrastPool());
  const nFill = cs.length ? 4 : 6;
  const fills = [], per = {};
  for (const p of pool) { if (fills.length >= nFill) break; if ((per[p.ans] || 0) >= 2) continue; fills.push(p); per[p.ans] = (per[p.ans] || 0) + 1; }
  for (const p of pool) { if (fills.length >= nFill) break; if (!fills.includes(p)) fills.push(p); }
  const rounds = fills.map(p => ({ type: 'fill', p }));
  if (cs.length) rounds.splice(Math.min(2, rounds.length), 0, { type: 'contrast', c: cs[0] });
  let idx = 0, xp = 0, correct = 0, total = 0;
  const nextBtn = (id, label) => `<button class="btn primary" id="${id}">${label} <kbd style="color:inherit;background:transparent;border-color:rgba(255,255,255,.4)">Enter</kbd></button>`;
  function play() { const r = rounds[idx]; if (r.type === 'fill') playFill(r.p); else playContrast(r.c); }
  function playFill(p) {
    const opts = shuffle([p.ans, ...p.wrong]);
    let answered = false;
    const blank = new Set(p.blanks);
    el.innerHTML = `<div class="explain">Round ${idx + 1}/${rounds.length}. In chat fine-tuning a model learns not just <i>what</i> to reply but <b>how it sounds</b>. Chinese packs tone into tiny particles at the end of a sentence. <kbd>1</kbd>–<kbd>${opts.length}</kbd> pick.</div>
      <div style="text-align:center"><div class="prompt-en" style="font-size:20px;margin:10px 0 8px">${esc(p.sit)}</div>
      <div class="zhsent" style="font-size:40px;margin:8px 0">${p.z.map((z, i) => blank.has(i) ? '<span class="pmask">＿</span>' : esc(z)).join('')}</div></div>
      <div class="opts">${opts.map((o, i) => `<button class="opt" data-i="${i}"><span class="k">${i + 1}</span><span class="hzo">${esc(o)}</span><span class="muted" style="font-size:12px">${esc(PARTICLE_GLOSS[o] || '')}</span></button>`).join('')}</div>
      <div id="pres"></div>`;
    const choose = i => {
      if (answered) return; answered = true; total++;
      const right = opts[i] === p.ans;
      $$('.opt', el).forEach((b, j) => { b.disabled = true; b.classList.add(opts[j] === p.ans ? 'right' : j === i ? 'wrong' : 'dim'); });
      if (right) { correct++; xp += 5; SFX.good(); } else SFX.bad();
      const txt = p.z.join('');
      $('#pres').innerHTML = `<div class="reveal" style="text-align:center">${sentenceHTML(p)}<div class="usage small" style="margin:8px auto 0">${right ? '' : `<b>${esc(opts[i])}</b> = ${esc(PARTICLE_GLOSS[opts[i]] || '')}. `}${noteHTML(p.ex)}</div>
        <div class="row" style="justify-content:center;margin-top:10px">${speakBtn(txt)}${nextBtn('pnext', idx + 1 < rounds.length ? 'Next' : 'Finish')}</div></div>`;
      bindCommon($('#pres'));
      TTS.speak(txt);
      $('#pnext').addEventListener('click', next);
    };
    $$('.opt', el).forEach(b => b.addEventListener('click', () => choose(+b.dataset.i)));
    KEYH = e => {
      if (answered) { if (e.key === 'Enter' || e.key === ' ') { next(); return true; } if (e.key === 'r' || e.key === 'R') { TTS.speak(p.z.join('')); return true; } return false; }
      if (/^[1-4]$/.test(e.key) && +e.key <= opts.length) { choose(+e.key - 1); return true; }
      return false;
    };
  }
  /** four sentences that differ by one small word: match each meaning */
  function playContrast(c) {
    const sents = shuffle(c.items), asks = shuffle(c.items);
    const solved = new Set();
    let k = 0, answered = false;
    function draw() {
      const ask = asks[k];
      el.innerHTML = `<div class="explain">Round ${idx + 1}/${rounds.length} · <b>contrast set</b> (${k + 1}/4). Four sentences that differ by one small word. Which one means…</div>
        <div class="prompt-en" style="font-size:22px;text-align:center;margin:10px 0 6px">${esc(ask.m)}</div>
        <div class="opts one">${sents.map((x, i) => `<button class="opt ${solved.has(x.key) ? 'solved' : ''}" data-i="${i}"><span class="k">${i + 1}</span><span class="optzh"><span class="han">${esc(x.key)}</span>${solved.has(x.key) ? `<span class="optpy">${sentPinyinHTML(x)} · <span class="muted">${esc(x.m)}</span></span>` : ''}</span></button>`).join('')}</div>
        <div id="pres"></div>`;
      $$('.opt', el).forEach(b => b.addEventListener('click', () => choose(+b.dataset.i)));
      answered = false;
    }
    function choose(i) {
      if (answered) return; answered = true; total++;
      const ask = asks[k], right = sents[i].key === ask.key;
      solved.add(ask.key);
      $$('.opt', el).forEach((b, j) => { b.disabled = true; if (sents[j].key === ask.key) b.classList.add('right'); else if (j === i) b.classList.add('wrong'); });
      if (right) { correct++; xp += 3; SFX.good(); } else SFX.bad();
      TTS.speak(ask.key);
      const last = k === 3;
      $('#pres').innerHTML = `<div class="reveal" style="text-align:center">${sentenceHTML(ask)}<div class="muted">${esc(ask.m)}</div>
        ${last ? `<div class="ctable">${c.items.map(x => `<div class="crow" data-say="${esc(x.key)}"><span class="han">${esc(x.key)}</span><span>${sentPinyinHTML(x)}</span><span class="muted">${esc(x.m)}</span></div>`).join('')}</div><div class="usage small" style="margin:8px auto 0">${noteHTML(c.ex)}</div>` : ''}
        <div class="row" style="justify-content:center;margin-top:10px">${nextBtn('pnext', last ? (idx + 1 < rounds.length ? 'Next round' : 'Finish') : 'Next')}</div></div>`;
      bindCommon($('#pres'));
      $('#pnext').addEventListener('click', go2);
    }
    function go2() { if (!answered) return; if (k < 3) { k++; draw(); } else next(); }
    draw();
    KEYH = e => {
      if (answered) { if (e.key === 'Enter' || e.key === ' ') { go2(); return true; } if (e.key === 'r' || e.key === 'R') { TTS.speak(asks[k].key); return true; } return false; }
      if (/^[1-4]$/.test(e.key)) { choose(+e.key - 1); return true; }
      return false;
    };
  }
  function next() { idx++; if (idx < rounds.length) play(); else end(); }
  function end() {
    KEYH = null;
    el.innerHTML = `<div class="explain">Same tokens, different particle, different reply: 好啊 (happy yes), 好吧 (reluctant OK), 好的 (will do). A pretrained model knows the words; <b>chat fine-tuning</b> teaches it which continuation fits the conversation, including the tone. Your dialogue cards train exactly that.</div>`;
    done({ xp: Math.max(4, xp), score: Math.round(100 * correct / Math.max(1, total)), summary: `${correct}/${total} right` });
  }
  play();
}

/* ---------- mini-game: Echo (yes/no by copying the verb) ---------- */
function echoPool() { return ECHO.filter(x => unknownIn(x.q.w) === 0 && unknownIn([...new Set([x.ans, ...x.wrong].flatMap(t => t.w))]) <= 1); }
GAMES.echo = {
  title: 'Echo', zh: '回答', note: null, learn: 'induction', logit: 0.5,
  desc: 'Chinese has no all-purpose "yes": answer by repeating the verb (喜欢！ 去！ 有啊！), and pick 不 or 没 for "no".',
  available: () => echoPool().length >= 4,
  start: gameEcho,
};
function gameEcho(el, done) {
  const pool = shuffle(echoPool());
  const items = [], seenQ = new Set();
  for (const x of pool) { if (items.length >= 6) break; if (seenQ.has(x.q.key)) continue; items.push(x); seenQ.add(x.q.key); }
  for (const x of pool) { if (items.length >= 6) break; if (!items.includes(x)) items.push(x); }
  let idx = 0, xp = 0, correct = 0;
  function play() {
    const x = items[idx];
    const opts = shuffle([x.ans, ...x.wrong]);
    let answered = false;
    el.innerHTML = `<div class="explain">Question ${idx + 1}/${items.length}. Chinese has no all-purpose "yes" or "no": you <b>copy the verb</b> from the question, the way a transformer's induction heads copy tokens from the prompt. <kbd>1</kbd>–<kbd>${opts.length}</kbd> pick.</div>
      <div style="text-align:center"><span class="pill gold" style="font-size:14px">${esc(x.intent)}</span></div>
      <div class="chat" data-turns="${esc(x.q.key)}">${bubbleHTML(x.q)}${bubbleHTML(x.ans, { hidden: true })}</div>
      <div class="opts one">${opts.map((o, i) => `<button class="opt" data-i="${i}"><span class="k">${i + 1}</span><span class="optzh"><span class="han">${esc(o.key)}</span></span></button>`).join('')}</div>
      <div id="eres"></div>`;
    bindCommon(el);
    setTimeout(() => TTS.speak(x.q.key), 200);
    const choose = i => {
      if (answered) return; answered = true;
      const right = opts[i] === x.ans;
      $$('.opt', el).forEach((b, j) => { b.disabled = true; b.classList.add(opts[j] === x.ans ? 'right' : j === i ? 'wrong' : 'dim'); });
      if (right) { correct++; xp += 5; SFX.good(); } else SFX.bad();
      $('#eres').innerHTML = `<div class="reveal"><div class="exbox chatex" data-turns="${esc(x.q.key + '｜' + x.ans.key)}">${'<div class="chat small">' + bubbleHTML(x.q, { pinyin: true }) + bubbleHTML(x.ans, { pinyin: true }) + '</div>'}</div>
        <div class="usage small">${right ? '' : `<b>${esc(opts[i].key)}</b> doesn't fit here. `}${noteHTML(x.ex)}</div>
        <div class="row" style="justify-content:center;margin-top:10px"><button class="btn primary" id="enext">${idx + 1 < items.length ? 'Next' : 'Finish'} <kbd style="color:inherit;background:transparent;border-color:rgba(255,255,255,.4)">Enter</kbd></button></div></div>`;
      bindCommon($('#eres'));
      TTS.speakTurns([x.q.key, x.ans.key]);
      $('#enext').addEventListener('click', next);
    };
    $$('.opt', el).forEach(b => b.addEventListener('click', () => choose(+b.dataset.i)));
    KEYH = e => {
      if (answered) { if (e.key === 'Enter' || e.key === ' ') { next(); return true; } return false; }
      if (e.key === 'r' || e.key === 'R') { TTS.speak(x.q.key); return true; }
      if (/^[1-4]$/.test(e.key) && +e.key <= opts.length) { choose(+e.key - 1); return true; }
      return false;
    };
  }
  function next() { idx++; if (idx < items.length) play(); else end(); }
  function end() {
    KEYH = null;
    el.innerHTML = `<div class="explain">你喜欢吗？ → 喜欢！ · 你有吗？ → 没有。 · 你吃了吗？ → 还没。 Answers reuse the verb from the question, and the "no" depends on it: 不 for wants, habits and the future, 没 for 有 and for things that didn't happen. Copying from context is also one of the first tricks a transformer learns (see the note on <b>induction heads</b>).</div>`;
    done({ xp: Math.max(4, xp), score: Math.round(100 * correct / items.length), summary: `${correct}/${items.length} natural answers` });
  }
  play();
}

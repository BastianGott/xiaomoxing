/* ============================================================
   UI shell, dashboard, epoch (session) engine, cards
   ============================================================ */

let VIEW = 'home';
let KEYH = null;            // active keyboard handler (e) => bool
let SESS = null;            // running epoch
const ICON_SPEAK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>';

function applyTheme() {
  const r = document.documentElement;
  let th = S.settings.theme;
  if (th === 'auto') th = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  r.dataset.theme = th;
  r.dataset.font = S.settings.font;
}

/* ---------- toasts, floats, modals ---------- */
function toast(msg, cls = '') {
  const box = $('#toasts'); if (!box) return;
  const t = document.createElement('div'); t.className = 'toast ' + cls; t.innerHTML = msg;
  box.appendChild(t); setTimeout(() => t.remove(), 3200);
}
let lastMouse = { x: innerWidth / 2, y: innerHeight / 2 };
document.addEventListener('mousemove', e => { lastMouse = { x: e.clientX, y: e.clientY }; });
function onXP(n) {
  if (SESS) SESS.xp += n;
  const f = document.createElement('div'); f.className = 'xpfloat'; f.textContent = (n > 0 ? '+' : '') + n + ' XP';
  const anchor = $('.qcard') || $('.gamecard');
  const r = anchor ? anchor.getBoundingClientRect() : { right: lastMouse.x, top: lastMouse.y };
  f.style.left = (r.right - 70) + 'px'; f.style.top = (r.top + 10) + 'px';
  document.body.appendChild(f); setTimeout(() => f.remove(), 1000);
  renderTop();
}
let pendingLevelUps = [];
function onLevelUp(from, to) { pendingLevelUps.push([from, to]); }
function flushLevelUps(after) {
  if (!pendingLevelUps.length) return after && after();
  const from = pendingLevelUps[0][0], to = pendingLevelUps[pendingLevelUps.length - 1][1];
  pendingLevelUps = [];
  SFX.level();
  const li = levelInfo();
  const newNotes = NOTES.filter(n => n.lv > from && n.lv <= to);
  const newGames = Object.entries(GAMES).filter(([k, g]) => g.note && NOTE_BY_ID[g.note].lv > from && NOTE_BY_ID[g.note].lv <= to);
  modal(`<div class="levelup" style="text-align:center">
      <div class="mode">level up · 升级 shēngjí</div>
      <div class="big" style="margin:14px 0 6px">Lv ${to}</div>
      <div style="font-size:18px;font-weight:700">${esc(li.name)} <span class="muted" style="font-weight:400">· ${li.year}</span></div>
      <p class="muted">Your model grew. ${paramsLabel()} parameters of Chinese, and counting.</p>
    </div>
    ${newNotes.length ? `<h3 style="margin-top:16px">Research unlocked</h3><div class="notes">${newNotes.map(noteCardHTML).join('')}</div>` : ''}
    ${newGames.length ? `<h3 style="margin-top:16px">Mini-game unlocked</h3><div class="row">${newGames.map(([k, g]) => `<span class="pill gold">${esc(g.title)} · ${g.zh}</span>`).join('')}</div>` : ''}
    <div class="row" style="margin-top:20px"><span class="spacer"></span><button class="btn primary" data-close>Continue <kbd>Enter</kbd></button></div>`,
    after);
}
let modalStack = [];
function modal(html, onClose, opts = {}) {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal pop">${html}</div>`;
  document.body.appendChild(bg);
  const prevKey = KEYH;
  const close = () => {
    bg.remove(); modalStack = modalStack.filter(m => m !== entry); KEYH = prevKey;
    if (onClose) onClose();
  };
  const entry = { bg, close };
  modalStack.push(entry);
  bg.addEventListener('click', e => {
    if (e.target === bg && !opts.sticky) close();
    const c = e.target.closest('[data-close]'); if (c) close();
  });
  KEYH = e => {
    if (opts.keys && opts.keys(e, close)) return true;
    if (e.key === 'Escape' || (e.key === 'Enter' && !opts.noEnter && !(e.target && e.target.tagName === 'INPUT'))) { close(); return true; }
    return true; // swallow
  };
  bindCommon(bg);
  return entry;
}
function bindCommon(root) {
  $$('[data-say]', root).forEach(el => el.addEventListener('click', e => { e.stopPropagation(); TTS.speak(el.dataset.say); }));
  $$('[data-slow]', root).forEach(el => el.addEventListener('click', e => { e.stopPropagation(); TTS.speak(el.dataset.slow, S.settings.rate * 0.6); }));
  $$('[data-turns]', root).forEach(el => el.addEventListener('click', e => { if (e.target.closest('[data-say],[data-word]') && e.target.closest('[data-say],[data-word]') !== el) return; e.stopPropagation(); TTS.speakTurns(el.dataset.turns.split('｜')); }));
  $$('[data-note]', root).forEach(el => el.addEventListener('click', e => { e.stopPropagation(); if (!el.classList.contains('locked')) openNote(el.dataset.note); }));
  $$('[data-word]', root).forEach(el => el.addEventListener('click', e => { e.stopPropagation(); openWord(+el.dataset.word); }));
  $$('[data-idiom]', root).forEach(el => el.addEventListener('click', e => { e.stopPropagation(); openIdiom(el.dataset.idiom); }));
}
function speakBtn(text, cls = '') { return `<button class="speak ${cls}" data-say="${esc(text)}" title="Play audio (R)">${ICON_SPEAK}</button>`; }

/* ---------- shell ---------- */
function renderTop() {
  const li = levelInfo();
  const el = $('#topstats'); if (!el) return;
  el.innerHTML = `
    <span class="hide-sm">vocab <b>${seenIds().length}</b></span>
    <span class="hide-sm">streak <b>${streak()}</b>d</span>
    <span class="lvchip" title="${li.toNext} XP to next level">Lv <b>${li.level}</b><span class="xpbar"><i style="width:${(li.frac * 100).toFixed(1)}%"></i></span></span>`;
  $$('.nav button').forEach(b => b.classList.toggle('on', b.dataset.go === VIEW || (VIEW === 'session' && b.dataset.go === 'home')));
}
function streak() {
  let d = today(), n = 0;
  if (!(S.days[d] && S.days[d].rev + S.days[d].new > 0)) d--;
  while (S.days[d] && S.days[d].rev + S.days[d].new > 0) { n++; d--; }
  return n;
}
function go(view) {
  if (SESS) endEpoch(true, true);
  VIEW = view; KEYH = null;
  window.scrollTo(0, 0);
  const m = $('#main');
  ({ home: renderHome, dict: renderDict, lab: renderLab, stats: renderStats, settings: renderSettings }[view] || renderHome)(m);
  renderTop();
}

/* ---------- dashboard ---------- */
const ARCH = {
  decode: [['Greedy', 'greedy'], ['Temperature', 'temperature'], ['Top-k / top-p', 'topkp'], ['Beam search', 'beam'], ['Penalties', 'penalty']],
  out: [['Softmax', 'softmax'], ['Cross-entropy', 'loss']],
  stack: [['Self-attention', 'attention'], ['Multi-head', 'multihead'], ['RoPE', 'rope'], ['Induction heads', 'induction'], ['FFN', 'ffn'], ['Residual + Norm', 'residual'], ['MoE', 'moe']],
  input: [['Tokens', 'tokens'], ['BPE tokenizer', 'bpe'], ['Embedding', 'embed']],
  infer: [['INT8', 'quant'], ['INT4 groups', 'int4'], ['GPTQ', 'gptq'], ['AWQ', 'awq'], ['KV cache', 'kvcache'], ['Speculative', 'specdec'], ['Pruning', 'prune']],
  train: [['Next-token', 'nexttoken'], ['Masked LM', 'mlm'], ['Chat SFT', 'sft'], ['AdamW', 'training'], ['FSRS', 'fsrs'], ['LoRA', 'lora'], ['RLHF / DPO', 'rlhf'], ['Distillation', 'distill'], ['Scaling laws', 'scaling'], ['FlashAttention', 'context'], ['Hyperparams', 'hparams']],
};
function archBlocks(list) {
  const lv = levelInfo().level;
  return list.map(([label, id]) => {
    const n = NOTE_BY_ID[id]; const on = n.lv <= lv; const isNew = on && !S.notesRead[id];
    return `<button class="blk ${on ? 'on' : ''} ${isNew ? 'new' : ''}" data-arch="${id}" title="${on ? esc(n.title) : 'Unlocks at Lv ' + n.lv}">${on ? esc(label) : `${esc(label)} <span style="opacity:.7">· Lv ${n.lv}</span>`}</button>`;
  }).join('');
}
function estMinutes(nDue, nNew) { return Math.max(1, Math.round((nDue * 9 + nNew * 45) / 60 + 1.5)); }
function renderHome(m) {
  const li = levelInfo();
  const bl = backlogInfo();
  const dueAll = dueIds().length, due = S.settings.catchUp === false ? dueAll : Math.min(dueAll, bl.cap), nNew = Math.min(newLeftToday(), newQueue(99).length);
  const sDue = dueSentKeys().length, sNew = newSentKeys(newSentLeftToday()).length, sAvail = eligibleSentCount();
  const iDue = dueIdiomKeys().length, iNew = newIdiomKeys(newIdiomLeftToday()).length;
  const dDue = dueDlgKeys().length, dNew = newDlgKeys(newDlgLeftToday()).length, dAvail = eligibleDlgCount();
  const ds = dayStats();
  const last = S.epochs[S.epochs.length - 1];
  const nothing = !due && !nNew && !sDue && !sNew && !iDue && !iNew && !dDue && !dNew;
  const doneToday = ds.rev + ds.new > 0 && nothing;
  const needBackup = seenIds().length > 20 && Date.now() - (S.lastBackup || 0) > 7 * DAY_MS;
  m.innerHTML = `
    ${needBackup ? `<div class="card" style="margin-bottom:16px;border-color:var(--gold)"><div class="row"><span>💾 Progress lives in this browser only. Export a backup once in a while.</span><span class="spacer"></span><button class="btn small" id="bk">Export now</button></div></div>` : ''}
    ${bl.active ? `<div class="card catchup" style="margin-bottom:16px">
      <div class="row" style="align-items:flex-start;gap:14px"><div style="font-size:26px">🔁</div><div style="flex:1">
        <div style="font-weight:700">Catch-up mode · ${bl.dw} word reviews waiting${bl.ds + bl.dd ? ` (+${bl.ds + bl.dd} sentences &amp; chats)` : ''}</div>
        <div class="muted" style="font-size:14px;margin-top:2px">After a break, the model warms up on what it already knows before taking new tokens. Each epoch reviews up to ${bl.cap} words, most-forgotten first.
        New words today: <b>${Math.floor(S.settings.newPerDay * bl.f)}</b> of ${S.settings.newPerDay}. More unlock automatically as the pile shrinks${bl.f === 0 ? ' (review-only for now)' : ''}.</div>
        <div class="bar" style="margin-top:10px"><i style="width:${(100 * Math.max(0, Math.min(1, 1 - (bl.B - bl.lo) / (bl.hi - bl.lo)))).toFixed(1)}%;background:var(--jade)"></i></div>
        <div class="faint" style="font-size:12px;margin-top:4px">new-word budget ${Math.round(bl.f * 100)}% · full again below ~${Math.round(bl.lo)} reviews waiting</div>
      </div></div></div>` : ''}
    <div class="hero">
      <div class="card epochcard">
        <div class="bigzh">训练</div>
        <div class="mode" style="justify-content:flex-start">epoch ${S.epochs.length + 1} · 训练 xùnliàn</div>
        <h1 style="margin-top:8px">${doneToday ? 'Today\'s training is done 🎉' : 'Ready to train'}</h1>
        <div class="sub">${doneToday ? 'Come back tomorrow, or squeeze in extra training below.' : `About ${estMinutes(due + sDue * 2.5 + dDue * 2, nNew + sNew * 0.6 + dNew * 0.5)} min of training, plus mini-games.`}</div>
        <div class="duebox">
          <div class="stat"><span class="v" style="color:var(--gold)">${due}</span><span class="k">due reviews</span>${dueAll > due ? `<span class="s">this epoch · ${dueAll} waiting</span>` : ''}</div>
          <div class="stat"><span class="v" style="color:var(--jade)">${nNew}</span><span class="k">new words</span></div>
          <div class="stat"><span class="v" style="color:var(--blue)">${sDue + sNew + dDue + dNew}</span><span class="k">sentences &amp; chats</span><span class="s">${sDue + sNew} sent. · ${dDue + dNew} 对话${iDue + iNew ? ` · +${iDue + iNew} 成语` : ''}</span></div>
          <div class="stat"><span class="v">${ds.rev + ds.new + (ds.sNew || 0)}</span><span class="k">done today</span></div>
        </div>
        <div class="row">
          <button class="btn primary big" id="start" ${nothing ? 'disabled' : ''}>▶ Start epoch <kbd style="margin-left:6px;color:inherit;background:transparent;border-color:rgba(255,255,255,.4)">Enter</kbd></button>
          ${nothing ? `<button class="btn" id="more">+5 new words</button><button class="btn" id="cram">Fine-tune weak words</button>` : ''}
          ${!nothing && bl.active ? `<button class="btn" id="more" title="Override catch-up mode for today">+5 new words anyway</button>` : ''}
          <button class="btn" id="gymbtn" title="${sAvail} sentences use only words you know">Sentence gym</button>
          <button class="btn" id="chatgym" title="${dAvail} dialogues use only words you know">Chat gym</button>
        </div>
      </div>
      <div class="card">
        <div class="row" style="align-items:flex-start">
          <div style="flex:1">
            <div class="mode" style="justify-content:flex-start">your model · 模型 móxíng</div>
            <input class="modelname" id="mname" value="${esc(S.modelName)}" spellcheck="false" style="font-size:22px;font-weight:700;margin-top:6px">
            <div class="muted" style="margin-top:4px">Lv ${li.level} · ${esc(li.name)} (${li.year}) · <span class="mono">${paramsLabel()}</span> params</div>
          </div>
        </div>
        <div class="bar" style="margin:14px 0 4px"><i style="width:${(li.frac * 100).toFixed(1)}%;background:linear-gradient(90deg,var(--accent),var(--gold))"></i></div>
        <div class="faint" style="font-size:12px">${li.toNext} XP to Lv ${li.level + 1}</div>
        <div class="grid g3" style="margin-top:16px">
          <div class="stat"><span class="v">${seenIds().length}</span><span class="k">vocab</span><span class="s">of ${CORE_ORDER.length}</span></div>
          <div class="stat"><span class="v">${matureCount()}</span><span class="k">mature</span><span class="s">S ≥ 21 days</span></div>
          <div class="stat"><span class="v">${last ? fmt1(last.loss) : '–'}</span><span class="k">last loss</span><span class="s">${last ? 'PPL ' + fmt1(Math.exp(last.loss)) : 'train first'}</span></div>
        </div>
        ${S.epochs.length > 1 ? `<svg class="spark" viewBox="0 0 300 60" preserveAspectRatio="none">${sparkPath(S.epochs.slice(-30).map(e => e.loss))}</svg>` : ''}
      </div>
    </div>
    <div class="card">
      <div class="row" style="margin-bottom:10px"><h3 style="margin:0">Architecture · what your model has learned</h3><span class="spacer"></span><span class="faint" style="font-size:12px">click a block to read its research note</span></div>
      <div class="grid" style="grid-template-columns:1.4fr 1fr;gap:18px">
        <div class="arch">
          <div class="lbl">decoding</div><div class="lane">${archBlocks(ARCH.decode)}</div>
          <div class="lbl">output</div><div class="lane">${archBlocks(ARCH.out)}</div>
          <div class="stack" data-n="× ${Math.max(1, li.level * 2)} layers"><div class="lane">${archBlocks(ARCH.stack)}</div></div>
          <div class="lbl">input</div><div class="lane">${archBlocks(ARCH.input)}</div>
        </div>
        <div class="arch">
          <div class="lbl">inference &amp; compression</div><div class="lane">${archBlocks(ARCH.infer)}</div>
          <div class="lbl">training</div><div class="lane">${archBlocks(ARCH.train)}</div>
        </div>
      </div>
    </div>`;
  $('#start') && $('#start').addEventListener('click', () => startEpoch());
  $('#more') && $('#more').addEventListener('click', () => { dayStats().bonusNew = (dayStats().bonusNew || 0) + 5; save(); startEpoch(); });
  $('#cram') && $('#cram').addEventListener('click', () => startEpoch({ practice: true }));
  $('#gymbtn').addEventListener('click', () => gymModal());
  $('#chatgym').addEventListener('click', () => startChatGym());
  $('#bk') && $('#bk').addEventListener('click', exportSave);
  const mn = $('#mname'); mn.addEventListener('change', () => { S.modelName = mn.value.trim() || 'Tiny-0.1B'; save(); });
  $$('[data-arch]').forEach(b => b.addEventListener('click', () => { const n = NOTE_BY_ID[b.dataset.arch]; if (n.lv <= levelInfo().level) openNote(n.id); else toast(`🔒 “${esc(n.title)}” unlocks at Lv ${n.lv}`); }));
  KEYH = e => { if (e.key === 'Enter' && e.target.tagName !== 'INPUT') { const b = $('#start'); if (b && !b.disabled) { startEpoch(); return true; } } return false; };
  if (!S.welcomed) welcome();
  else if (S.news && S.news.chat === 0) whatsNewChat();
}
function whatsNewChat() {
  S.news = Object.assign(S.news || {}, { chat: Date.now() }); save();
  modal(`<div class="mode" style="justify-content:flex-start">update · 新功能 xīn gōngnéng</div>
    <h2 style="margin-top:6px">Chat fine-tuning 💬</h2>
    <p>Your model knows textbook sentences. Now it learns how people actually talk.</p>
    <ul style="padding-left:18px;line-height:1.7">
      <li><b>Chat words</b>: reactions like <span class="han">对对对 · 好的好的 · 是的是的 · 嗯嗯 · 没事 · 算了</span>, mood particles <span class="han">啊 吧 呢 嘛 啦</span>, fillers like <span class="han">那个… 就是…</span> and slang (<span class="han">我去, 牛</span>, and yes, <span class="han">卧槽</span>, labeled as vulgar). ${S.settings.chatPerEpoch} per epoch, each with a usage note.</li>
      <li>Chat words and key function words (<span class="han">也 就 还 都 又 才 再 了</span>) get <b>extra reviews</b>: they're scheduled for 95% retention instead of ${Math.round(S.settings.retention * 100)}%.</li>
      <li><b>Dialogue cards</b>: short two-person chats made only of words you know. Read the chat, pick the natural reply, choose the right particle, or listen with no characters. ${S.settings.newDlgPerDay} new per day.</li>
      <li><b>Chat gym</b> on the dashboard, the <b>Particles</b> mini-game, a <b>chat phrasebook</b> in the Lab, and a research note on chat fine-tuning (SFT).</li>
    </ul>
    <p class="muted" style="font-size:13px">All of this can be tuned in Settings.</p>
    <div class="row" style="margin-top:14px"><span class="spacer"></span><button class="btn primary" data-close>Let's chat <kbd>Enter</kbd></button></div>`, () => go('home'));
}
function sparkPath(vals) {
  if (vals.length < 2) return '';
  const lo = Math.min(...vals) * 0.9, hi = Math.max(...vals) * 1.05 || 1;
  const pts = vals.map((v, i) => [i / (vals.length - 1) * 300, 56 - (v - lo) / (hi - lo || 1) * 50]);
  return `<path d="M${pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' L')}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>
    <circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="3" fill="var(--accent)"/>`;
}
function welcome() {
  S.welcomed = true; save();
  modal(`<h2><span class="han" style="color:var(--accent);font-size:30px">小模型</span> Tiny Model</h2>
    <p>You're a freshly initialized language model. Your training data: <b>Chinese</b>.</p>
    <ul style="padding-left:18px;line-height:1.7">
      <li>Each session is an <b>epoch</b>: due reviews + a few new words, about 10 minutes.</li>
      <li>Words are scheduled with <b>FSRS</b> (the algorithm Anki offers): rate <b>Again / Hard / Good / Easy</b> and the interval adapts to your memory.</li>
      <li>Words come in frequency order: a curated starter set, then HSK 1 → 4 (~1100 words). The <b>Dictionary</b> tab has all of them.</li>
      <li>Once you know every word of a sentence, it becomes a <b>sentence card</b>: build it, translate it, or hear it with no characters on screen and pick its meaning or type it (pinyin or Chinese keyboard). The <b>Sentence gym</b> is free practice.</li>
      <li>Once you know 40 words, an occasional <b>成语 idiom card</b> appears (1 new every 3 days by default), each with its literal meaning and the story behind it.</li>
      <li><b>Chat words</b> (对对对, 好的, 嗯, 吧, 啊…) and <b>dialogue cards</b> teach how people actually talk: everyday reactions, mood particles and fillers.</li>
      <li>Mini-games (tokenizer, decoder, tones, particles…) pop up between cards and teach how LLMs work.</li>
      <li>Level up to unlock <b>research notes</b> and new model components.</li>
    </ul>
    <p class="muted">Keyboard first: <kbd>1</kbd>–<kbd>4</kbd> answer &amp; grade, <kbd>Space</kbd> accept, <kbd>R</kbd> replay audio, <kbd>Esc</kbd> end epoch.</p>
    <div class="row" style="margin-top:6px">${speakBtn('你好！我是小模型。')}<span class="muted">Test audio: you should hear “你好！我是小模型。”</span></div>
    ${TTS.available() ? '' : `<p style="color:var(--gold)">No Chinese voice found yet. In Windows: Settings → Time &amp; language → Speech → Add voices → Chinese (Simplified). Microsoft Edge also ships natural online Chinese voices.</p>`}
    <div class="row" style="margin-top:18px"><span class="spacer"></span><button class="btn primary" data-close>Initialize weights <kbd>Enter</kbd></button></div>`);
}

/* ---------- epoch engine ---------- */
function startEpoch(opts = {}) {
  const practice = !!opts.practice;
  let main = [];
  if (practice) {
    const ids = seenIds().filter(id => !isSusp(id))
      .sort((a, b) => (S.cards[b].leech ? 1 : 0) - (S.cards[a].leech ? 1 : 0) || FSRS.retrievability(S.cards[a]) - FSRS.retrievability(S.cards[b]))
      .slice(0, 15);
    if (!ids.length) { toast('Nothing to fine-tune yet. Learn some words first.'); return; }
    main = shuffle(ids).map(id => ({ id, kind: 'rev' }));
  } else {
    // reviews: capped per epoch so a backlog becomes several normal-sized epochs; with a backlog, most-forgotten first
    const bl = backlogInfo();
    const cap = bl.cap;
    let due = dueIds();
    if (S.settings.catchUp !== false && due.length > cap) due = due.sort((a, b) => FSRS.retrievability(S.cards[a]) - FSRS.retrievability(S.cards[b])).slice(0, cap);
    main = due.map(id => ({ id, kind: 'rev' }));
    // new words don't go into the queue: they wait in a pool and are let in one at a time (see nextItem)
    var newPool = newQueue(newLeftToday());
    // sentence cards: only sentences whose words are all known before this epoch starts
    const sdue = dueSentKeys().slice(0, bl.active ? Math.round(cap * 0.3) : 80).map(key => ({ key, kind: 'srev' }));
    const snew = newSentKeys(newSentLeftToday()).map(key => ({ key, kind: 'snew', first: true }));
    main = mixSentences(main, sdue, snew);
    // idiom cards: a rare side dish (1 new every few days, at most 3 reviews per epoch)
    const idue = dueIdiomKeys().slice(0, 3).map(ikey => ({ ikey, kind: 'irev' }));
    const inew = newIdiomKeys(newIdiomLeftToday()).map(ikey => ({ ikey, kind: 'inew' }));
    main = mixIdioms(main, idue, inew);
    // dialogue cards (chat fine-tuning): only dialogues whose words are all known before the epoch starts
    const ddue = dueDlgKeys().slice(0, bl.active ? Math.round(cap * 0.2) : 40).map(dkey => ({ dkey, kind: 'drev' }));
    const dnew = newDlgKeys(newDlgLeftToday()).map(dkey => ({ dkey, kind: 'dnew', first: true }));
    main = mixDialogues(main, ddue, dnew);
    if (!main.length && !newPool.length) { toast('Nothing due. Add new words or fine-tune.'); return; }
  }
  const nReviews = main.length;
  const pool = typeof newPool !== 'undefined' ? newPool : [];
  SESS = {
    newPool: pool, newStart: pool.length, sinceNew: 0, newPaused: false, pausedOnce: false,
    warmup: Math.min(12, Math.round(nReviews * 0.25)), newGap: pool.length ? Math.max(1, Math.min(4, Math.floor(Math.max(0, nReviews - Math.min(12, Math.round(nReviews * 0.25))) / (pool.length + 1)))) : 0,
    catchUp: !practice && backlogInfo().active,
    start: Date.now(), main, learn: [], step: 0, total: main.length + main.filter(x => x.kind === 'new').length * 2,
    done: 0, grades: [], xp: 0, nNew: 0, nSentNew: 0, nIdiomNew: 0, nDlgNew: 0, words: {}, sents: {}, idioms: {}, dlgs: {}, practice, sinceGame: 0, nextGameAt: randInt(5, 8), lastGame: null, games: 0,
    epochNo: S.epochs.length + 1,
  };
  VIEW = 'session'; renderTop();
  $('#main').innerHTML = `<div class="sessbar" id="sessbar"></div><div class="stage" id="stage"></div>`;
  nextItem();
}
function sessBar() {
  if (!SESS) return;
  const el = $('#sessbar'); if (!el) return;
  const el2 = Date.now() - SESS.start;
  const remaining = SESS.main.length + SESS.learn.length;
  const pct = SESS.done / Math.max(1, SESS.done + remaining + SESS.main.filter(x => x.kind === 'new').length + (SESS.newPool ? SESS.newPool.length * 3 : 0));
  const loss = SESS.grades.length ? epochLoss(SESS.grades) : null;
  el.innerHTML = `<span>${SESS.gym ? (SESS.chat ? 'chat gym' : 'sentence gym') : SESS.practice ? 'fine-tune' : 'epoch ' + SESS.epochNo + (SESS.catchUp ? ' · catch-up' : '')}</span>
    <div class="prog"><i style="width:${(pct * 100).toFixed(1)}%"></i></div>
    <span>step <b>${SESS.done}</b></span>
    <span>loss <b>${loss == null ? '–' : loss.toFixed(2)}</b></span>
    <span><b id="sesstime">${fmtTime(el2)}</b> / ${S.settings.targetMin}:00</span>
    <span>+<b>${SESS.xp}</b> XP</span>
    <button class="btn small ghost" id="endbtn" title="End epoch (Esc)">End</button>`;
  $('#endbtn').addEventListener('click', () => endEpoch(true));
}
setInterval(() => { if (SESS && VIEW === 'session' && !IME.composing) { const b = $('#sesstime'); if (b) b.textContent = fmtTime(Date.now() - SESS.start); } }, 1000);

const PGRADE = { 1: 0.15, 2: 0.55, 3: 0.85, 4: 0.95 };
function epochLoss(gs) { return gs.reduce((a, g) => a - Math.log(PGRADE[g]), 0) / gs.length; }

function plannerLogits() {
  const opts = [['cards', 1.5]];
  for (const [k, g] of Object.entries(GAMES)) {
    if (!gameUnlocked(k) || !g.available()) continue;
    opts.push([k, g.logit - (SESS && SESS.lastGame === k ? 1.2 : 0)]);
  }
  return opts;
}
/* Gradual new words inside an epoch: warm up on reviews first, never juggle more than 3 fresh words,
   spread the rest through the epoch, and hold new words back while you're failing a lot. */
function freshInLearning() { return SESS.learn.filter(x => x.kind === 'learn' && x.id != null && !x.relearn).length; }
// review outcomes of this epoch (1 = forgotten), recorded when the next card is requested
function trackReview() {
  const c = SESS.cur; SESS.cur = null;
  if (!c || c.relearn || !/^(rev|srev|drev|irev)$/.test(c.kind) || SESS.grades.length <= SESS.curG) return;
  (SESS.revWin = SESS.revWin || []).push(SESS.grades[SESS.grades.length - 1] === 1 ? 1 : 0);
  if (SESS.revWin.length > 10) SESS.revWin.shift();
}
function struggling() {
  const w = SESS.revWin || [];
  const revFail = w.length >= 6 ? w.reduce((a, b) => a + b, 0) / w.length : 0;
  const g = SESS.grades.slice(-8), allFail = g.length >= 6 ? g.filter(x => x === 1).length / g.length : 0;
  return SESS.newPaused ? (revFail > 0.2 || allFail >= 0.35) : (revFail >= 0.4 || allFail >= 0.5);
}
function shouldIntroduceNew() {
  const P = SESS.newPool;
  if (!P || !P.length) return false;
  const wasPaused = SESS.newPaused;
  SESS.newPaused = struggling();
  if (SESS.newPaused && !wasPaused && !SESS.pausedOnce) { SESS.pausedOnce = true; toast('Loss is spiking: holding new words back until your answers settle.'); }
  if (SESS.newPaused) return false;
  if (freshInLearning() >= 3) return false;
  if (SESS.done < SESS.warmup) return false;
  if ((SESS.sinceNew || 0) < SESS.newGap && SESS.main.length) return false;
  return true;
}
function nextItem() {
  if (!SESS) return;
  trackReview();
  // planner: maybe a mini-game
  if (!SESS.practice && SESS.sinceGame >= SESS.nextGameAt && (SESS.main.length + SESS.learn.length) > 2) {
    const opts = plannerLogits();
    if (opts.length > 1) {
      const p = softmax(opts.map(o => o[1]), S.settings.temperature);
      const k = opts[sample(p)][0];
      if (k !== 'cards') { SESS.sinceGame = 0; SESS.nextGameAt = randInt(6, 10); SESS.lastGame = k; return runGame(k, true); }
      SESS.nextGameAt = SESS.sinceGame + 4;
    }
  }
  SESS.step++;
  let item = null;
  const li = SESS.learn.findIndex(x => x.at <= SESS.step);
  if (li >= 0) item = SESS.learn.splice(li, 1)[0];
  else if (shouldIntroduceNew()) item = { id: SESS.newPool.shift(), kind: 'new' };
  else if (SESS.main.length) item = SESS.main.shift();
  else if (SESS.learn.length) { SESS.learn.sort((a, b) => a.at - b.at); item = SESS.learn.shift(); }
  else if (SESS.newPool && SESS.newPool.length && !SESS.newPaused) item = { id: SESS.newPool.shift(), kind: 'new' };
  if (!item) return endEpoch(false);
  SESS.cur = item; SESS.curG = SESS.grades.length;
  if (item.kind === 'new') SESS.sinceNew = 0; else SESS.sinceNew = (SESS.sinceNew || 0) + 1;
  SESS.sinceGame++;
  sessBar();
  if (item.ikey) (item.kind === 'inew' ? showIdiomIntro : showIdiomQuiz)(item);
  else if (item.dkey) showDialogue(item);
  else if (item.key) showSentence(item);
  else if (item.kind === 'new') showIntro(item); else showQuiz(item);
}

/* ---------- intro (teach) card ---------- */
function exampleFor(id) {
  const ids = SENTS_BY_WORD[id] || [];
  if (!ids.length) return null;
  const scored = ids.map(sid => { const s = SENTS[sid]; const unk = s.w.filter(w => w >= 0 && w !== id && !isSeen(w)).length; return [unk * 10 + s.z.length + Math.random() * 3, s]; });
  scored.sort((a, b) => a[0] - b[0]);
  return scored[0][1];
}
function exampleHTML(id, small = false) {
  if (SPOKEN_BY_ID[id]) { const h = dlgExampleHTML(id, small); if (h) return h; }     // chat words: show them in a dialogue
  const ex = exampleFor(id); if (!ex) return '';
  return `<div class="exbox ${small ? 'small' : ''}" data-say="${esc(sentText(ex))}" title="Click to hear">${sentenceHTML(ex, id)}<div class="en">${esc(ex.en)}</div></div>`;
}
function wordInfoHTML(w, big = true, showHz = true) {
  return `${showHz ? `<div class="hz ${big ? '' : 'md'}">${hanziHTML(w)}</div>` : ''}
    <div class="py">${pinyinHTML(w.s)} ${speakBtn(w.h)}</div>
    <div class="mean">${esc(w.m)}</div>`;
}
function levelTag(w) {
  if (w.l === 0) return '<span class="pill accent">AI term</span>';
  if (w.l === SPOKEN_LV) return kindPill(w.id) || '<span class="pill">口语</span>';
  return `<span class="pill">HSK ${w.l}</span>${SPOKEN_BY_ID[w.id] ? kindPill(w.id) : ''}`;
}
function showIntro(item) {
  const w = WORDS[item.id];
  const stage = $('#stage');
  const rank = CORE_ORDER.indexOf(w.id);
  stage.innerHTML = `<div class="card qcard pop">
    <div class="newbadge"><span class="pill jade">new token</span></div>
    <div class="mode">new word · 新词 xīncí</div>
    ${wordInfoHTML(w)}
    <div class="row" style="justify-content:center;margin-top:6px">${levelTag(w)}${SPOKEN_BY_ID[w.id] ? `<span class="pill">chat word #${SPOKEN_BY_ID[w.id].rank + 1}</span>` : rank >= 0 ? `<span class="pill">#${rank + 1} in learning order</span>` : ''}${w.s.some(x => x[1] === 3) && w.s.filter(x => x[1] === 3).length > 1 ? '<span class="pill gold" title="Two 3rd tones in a row: the first is spoken as 2nd tone">3-3 sandhi</span>' : ''}</div>
    ${usageHTML(w.id)}
    ${exampleHTML(w.id)}
    <div class="hint"><span><kbd>Space</kbd> got it</span><span><kbd>R</kbd> replay</span><span><kbd>K</kbd> I already know this</span></div>
    <div class="row" style="justify-content:center;margin-top:14px"><button class="btn ghost small" id="known">I already know this</button><button class="btn primary" id="gotit">Got it →</button></div>
  </div>`;
  bindCommon(stage);
  if (S.settings.autoplay) setTimeout(() => TTS.speak(w.h), 150);
  const got = () => {
    if (!SESS.practice) { ensureCard(w.id); dayStats().new++; SESS.nNew++; }
    SESS.learn.push({ id: w.id, kind: 'learn', first: true, at: SESS.step + 3, tries: 0 });
    addXP(4, 'new'); save(); flushLevelUps(nextItem);
  };
  const known = () => {
    const c = ensureCard(w.id); c.st = 2; c.s = 30; c.d = 3; c.last = Date.now(); c.reps = 1; c.due = today() + randInt(14, 35); c.known = true;
    addXP(2, 'known'); save(); toast(`Marked <span class="han">${esc(w.h)}</span> as known`); flushLevelUps(nextItem);
  };
  $('#gotit').addEventListener('click', got);
  $('#known').addEventListener('click', known);
  KEYH = e => {
    if (e.key === ' ' || e.key === 'Enter') { got(); return true; }
    if (e.key === 'r' || e.key === 'R') { TTS.speak(w.h); return true; }
    if (e.key === 'k' || e.key === 'K') { known(); return true; }
    if (e.key === 'Escape') { endEpoch(true); return true; }
    return false;
  };
}

/* ---------- quiz ---------- */
function glosses(w) { return w.m.toLowerCase().replace(/\(.*?\)/g, '').split(/[;,/]/).map(s => s.trim().replace(/^to /, '')).filter(Boolean); }
function conflicts(a, b) {
  if (a.h === b.h || a.p === b.p) return true;
  const ga = glosses(a), gb = glosses(b);
  return ga.some(x => gb.includes(x));
}
function distractors(id, n = 3) {
  const w = WORDS[id];
  let pool = seenIds().filter(x => x !== id && !isSusp(x));
  if (pool.length < 15) {
    const extra = CORE_ORDER.slice(0, Math.max(40, CORE_ORDER.indexOf(id) + 25));
    pool = pool.concat(extra.filter(x => x !== id && !pool.includes(x)));
  }
  const cand = pool.map(x => WORDS[x]).filter(x => !conflicts(w, x));
  const score = x => (x.h.length === w.h.length ? 2 : 0) + (x.l === w.l ? 1 : 0) + ([...x.h].some(c => w.h.includes(c)) ? 1.5 : 0) + Math.random() * 2.5;
  const ranked = cand.map(x => [score(x), x]).sort((a, b) => b[0] - a[0]).slice(0, n * 3).map(r => r[1]);
  return shuffle(ranked).slice(0, n);
}
function chooseMode(item) {
  const tts = TTS.available();
  if (S.settings.cardStyle === 'classic') return 'flip';
  if (item.first) return 'read';
  if (item.kind === 'learn') return pick(tts ? ['listen', 'hear', 'prod'] : ['prod', 'pyread']);
  const c = getCard(item.id); const s = c ? c.s : 0;
  let wts;
  if (s < 2) wts = { read: .5, hear: .15, listen: .15, prod: .2 };
  else if (s < 7) wts = { read: .25, hear: .2, listen: .2, prod: .35 };
  else if (s < 21) wts = { read: .1, hear: .2, listen: .15, prod: .25, type: .3 };
  else wts = { hear: .2, listen: .1, prod: .15, type: .3, flip: .25 };
  if (!tts) { wts.pyread = (wts.listen || 0) + (wts.hear || 0); delete wts.listen; delete wts.hear; }
  const keys = Object.keys(wts), tot = keys.reduce((a, k) => a + wts[k], 0);
  return keys[sample(keys.map(k => wts[k] / tot))];
}
const MODE_LABEL = {
  read: ['read', '阅读 yuèdú'], listen: ['listen', '听力 tīnglì'], hear: ['listen · no characters', '听 tīng'], prod: ['recall', '回忆 huíyì'],
  pyread: ['pinyin', '拼音 pīnyīn'], type: ['type pinyin', '打字 dǎzì'], flip: ['classic', '卡片 kǎpiàn'],
};
function showQuiz(item) {
  const w = WORDS[item.id];
  const mode = chooseMode(item);
  const stage = $('#stage');
  const t0 = Date.now();
  const st = { answered: false, correct: null, sug: 3, lock: 0, knew: false };
  const ml = MODE_LABEL[mode];
  const head = `<div class="mode">${ml[0]} · <span class="zh">${ml[1]}</span>${item.kind === 'learn' ? ' · <span style="color:var(--jade)">learning</span>' : ''}${SESS.practice ? ' · fine-tune' : ''}</div>`;
  let body = '', opts = [];
  if (['read', 'listen', 'hear', 'prod', 'pyread'].includes(mode)) {
    opts = shuffle([w, ...distractors(w.id, 3)]);
    const optHTML = (o, i) => (mode === 'read' || mode === 'hear')
      ? `<button class="opt" data-i="${i}"><span class="k">${i + 1}</span><span>${esc(o.m)}</span></button>`
      : `<button class="opt" data-i="${i}"><span class="k">${i + 1}</span><span class="hzo">${esc(o.h)}</span></button>`;
    let prompt = '';
    if (mode === 'read') prompt = `<div class="hz">${esc(w.h)}</div>${S.settings.pinyinHint ? `<div class="py">${pinyinHTML(w.s)}</div>` : ''}`;
    if (mode === 'listen') prompt = `<button class="speak huge" data-say="${esc(w.h)}">${ICON_SPEAK}</button><div class="muted">Which word did you hear?</div>`;
    if (mode === 'hear') prompt = `<button class="speak huge" data-say="${esc(w.h)}">${ICON_SPEAK}</button><div class="row" style="justify-content:center"><button class="btn small ghost" data-slow="${esc(w.h)}">🐢 slow</button></div><div class="muted">What does it mean?</div>`;
    if (mode === 'prod') prompt = `<div class="prompt-en">${esc(w.m)}</div><div class="muted">Pick the Chinese word</div>`;
    if (mode === 'pyread') prompt = `<div class="py" style="font-size:40px;margin:26px 0 8px">${pinyinHTML(w.s)}</div><div class="muted">Which characters?</div>`;
    body = `${prompt}<div class="opts">${opts.map(optHTML).join('')}</div>`;
  } else if (mode === 'type') {
    body = `<div class="hz">${esc(w.h)}</div><div class="muted">${esc(w.m)}</div>
      <input class="typein" id="typein" placeholder="pinyin + tone numbers: ni3 hao3 (ü = v)" autocomplete="off" autocapitalize="off" spellcheck="false" lang="en">
      <div class="verdict" id="verdict"></div>`;
  } else if (mode === 'flip') {
    body = `<div class="hz">${esc(w.h)}</div><div class="muted" id="fliphint" style="margin-top:20px">Recall pinyin and meaning, then reveal. <kbd>Space</kbd></div>`;
  }
  stage.innerHTML = `<div class="card qcard pop">${head}${body}<div id="reveal"></div></div><div class="grades hidden" id="grades"></div>
    <div class="hint" id="qhint">${mode === 'type' ? '<span><kbd>Enter</kbd> check</span>' : mode === 'flip' ? '<span><kbd>Space</kbd> reveal</span>' : '<span><kbd>1</kbd>–<kbd>4</kbd> answer</span>'}<span><kbd>R</kbd> audio</span><span><kbd>Esc</kbd> end epoch</span></div>`;
  bindCommon(stage);
  if (mode === 'listen' || mode === 'hear' || (S.settings.autoplay && mode === 'pyread')) setTimeout(() => TTS.speak(w.h), 200);
  if (mode === 'type') setTimeout(() => $('#typein').focus(), 30);

  function reveal(correct, extraMsg = '') {
    st.answered = true; st.correct = correct; st.lock = Date.now() + 250;
    const dt = (Date.now() - t0) / 1000;
    st.sug = correct === false ? 1 : correct === 'meh' ? 2 : dt > 12 ? 2 : 3;
    if (correct === true) SFX.good(); else if (correct === false) SFX.bad();
    const r = $('#reveal');
    const hzShown = ['read', 'type', 'flip'].includes(mode);
    if (hzShown) { const hz = $('.qcard > .hz'); if (hz) hz.innerHTML = hanziHTML(w); }
    r.innerHTML = `<div class="reveal">${extraMsg}${wordInfoHTML(w, false, !hzShown)}${usageHTML(w.id, true)}${exampleHTML(w.id, true)}
      <div class="memline">${memLine(w.id)}</div>
      ${correct === false ? `<button class="lnk" id="knew">I actually knew it (misclick)</button>` : ''}</div>`;
    bindCommon(r);
    if (S.settings.autoplay && mode !== 'listen' && mode !== 'hear') TTS.speak(w.h);
    const k = $('#knew'); if (k) k.addEventListener('click', () => { st.knew = true; st.sug = 3; k.remove(); renderGrades(); });
    renderGrades();
    $('#qhint').innerHTML = `<span><kbd>Space</kbd> accept suggestion</span><span><kbd>1</kbd> Again <kbd>2</kbd> Hard <kbd>3</kbd> Good <kbd>4</kbd> Easy</span><span><kbd>R</kbd> audio</span>`;
  }
  function renderGrades() {
    const g = $('#grades'); g.classList.remove('hidden');
    const iv = SESS.practice ? [0, 0, 0, 0] : previewIntervals(w.id);
    const names = ['Again', 'Hard', 'Good', 'Easy'];
    const locked = st.correct === false && !st.knew;
    g.innerHTML = names.map((n, i) => `<button class="grade g${i + 1} ${st.sug === i + 1 ? 'sug' : ''}" data-g="${i + 1}" ${locked && i > 0 ? 'disabled' : ''}>
      <span class="gn">${n}</span><span class="gi">${SESS.practice ? 'practice' : i === 0 ? 'relearn' : fmtIvl(iv[i])}</span><span class="gk">${i + 1}</span></button>`).join('');
    $$('.grade', g).forEach(b => b.addEventListener('click', () => grade(+b.dataset.g)));
  }
  function grade(g) {
    if (!st.answered || Date.now() < st.lock) return;
    if (st.correct === false && !st.knew && g > 1) return;
    finishCard(item, g, mode);
  }
  function choose(i) {
    if (st.answered) return;
    const o = opts[i]; if (!o) return;
    const right = o.id === w.id;
    $$('.opt', stage).forEach((b, j) => { b.disabled = true; b.classList.add(opts[j].id === w.id ? 'right' : j === i ? 'wrong' : 'dim'); });
    if (!right) {
      // show what the wrong pick was, to learn from it
      $$('.opt', stage)[i].insertAdjacentHTML('beforeend', `<span class="muted" style="margin-left:auto;font-size:12px">${(mode === 'read' || mode === 'hear') ? esc(o.h) + ' ' + esc(o.p) : esc(o.p) + ' · ' + esc(o.m)}</span>`);
    }
    reveal(right);
  }
  $$('.opt', stage).forEach(b => b.addEventListener('click', () => choose(+b.dataset.i)));
  function checkType() {
    const inp = $('#typein'); if (st.answered) return;
    const v = inp.value.trim(); if (!v) return;
    const res = checkPinyin(v, w);
    inp.disabled = true;
    inp.classList.add(res === 'ok' ? 'ok' : res === 'tones' ? 'meh' : 'bad');
    const vd = $('#verdict');
    vd.className = 'verdict ' + (res === 'ok' ? 'ok' : res === 'tones' ? 'meh' : 'bad');
    vd.textContent = res === 'ok' ? 'Correct!' : res === 'tones' ? `Letters right, tones off → ${numericPinyin(w)}` : `Not quite → ${numericPinyin(w)}`;
    reveal(res === 'ok' ? true : res === 'tones' ? 'meh' : false);
  }
  if (mode === 'type') $('#typein').addEventListener('keydown', e => { if (e.isComposing || e.keyCode === 229) return; if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (!st.answered) checkType(); else grade(st.sug); } });
  function flip() { if (st.answered) return; $('#fliphint') && $('#fliphint').remove(); reveal(null); st.sug = 3; renderGrades(); }

  KEYH = e => {
    const k = e.key;
    if (k === 'Escape') { endEpoch(true); return true; }
    if (k === 'r' || k === 'R') { if (e.target.tagName === 'INPUT') return false; TTS.speak(w.h); return true; }
    if (!st.answered) {
      if (mode === 'flip' && (k === ' ' || k === 'Enter')) { flip(); return true; }
      if (opts.length && /^[1-4]$/.test(k)) { choose(+k - 1); return true; }
      return false;
    }
    if (e.target.tagName === 'INPUT' && k !== 'Enter') return false;
    if (/^[1-4]$/.test(k)) { grade(+k); return true; }
    if (k === ' ' || k === 'Enter') { grade(st.sug); return true; }
    return false;
  };
}
function memLine(id) {
  const c = getCard(id);
  if (!c || c.st === 0) return 'new card';
  const R = FSRS.retrievability(c);
  return `stability ${fmtIvl(c.s)} · difficulty ${c.d.toFixed(1)} · recall ${(R * 100).toFixed(0)}% · reviews ${c.reps}${c.lapses ? ' · lapses ' + c.lapses : ''}${c.leech ? ' · 🩹 leech' : ''}${retFor(id) > S.settings.retention ? ` · 💬 target ${Math.round(retFor(id) * 100)}%` : ''}`;
}
function finishCard(item, g, mode) {
  const id = item.id;
  SESS.done++;
  SESS.grades.push(g);
  SESS.words[id] = SESS.words[id] || [];
  SESS.words[id].push(g);
  if (!SESS.practice) {
    applyGrade(id, g);
    if (item.kind === 'rev' && !item.relearn) dayStats().rev++;
    addXP([0, 2, 6, 10, 12][g], 'card');
    // learning steps
    if (item.first && g < 4) SESS.learn.push({ id, kind: 'learn', at: SESS.step + 5, tries: 1 });
    else if (item.kind === 'learn' && g === 1 && item.tries < 4) SESS.learn.push({ id, kind: 'learn', at: SESS.step + 4, tries: item.tries + 1 });
    else if (item.kind === 'rev' && g === 1) SESS.learn.push({ id, kind: 'learn', at: SESS.step + 5, tries: 1, relearn: true });
  } else {
    addXP([0, 1, 3, 5, 6][g], 'practice');
    if (g === 1 && !item.retry) SESS.main.splice(Math.min(4, SESS.main.length), 0, { id, kind: 'rev', retry: true });
  }
  save();
  flushLevelUps(nextItem);
}

/* ---------- end of epoch ---------- */
function endEpoch(early, silent = false) {
  if (!SESS) return;
  const sess = SESS; SESS = null;
  // words that were introduced but never quizzed go back to the new queue
  for (const it of sess.learn) if (it.first && S.cards[it.id] && S.cards[it.id].st === 0) {
    delete S.cards[it.id]; if (!sess.practice) { dayStats().new = Math.max(0, dayStats().new - 1); sess.nNew = Math.max(0, sess.nNew - 1); }
  }
  for (const it of sess.learn) if (it.first && it.ikey && S.icards[it.ikey] && S.icards[it.ikey].st === 0) {
    delete S.icards[it.ikey]; const ds = dayStats(); ds.iNew = Math.max(0, (ds.iNew || 0) - 1); sess.nIdiomNew = Math.max(0, (sess.nIdiomNew || 0) - 1);
  }
  const ms = Date.now() - sess.start;
  dayStats().ms += ms;
  let rec = null;
  if (sess.grades.length && !sess.practice) {
    const firsts = [...Object.values(sess.words), ...Object.values(sess.sents || {}), ...Object.values(sess.idioms || {}), ...Object.values(sess.dlgs || {})].map(a => a[0]);
    rec = { day: today(), t: sess.start, ms, n: sess.grades.length, nNew: sess.nNew, nSent: sess.nSentNew || 0, nDlg: sess.nDlgNew || 0, acc: firsts.length ? firsts.filter(g => g > 1).length / firsts.length : 0, loss: epochLoss(sess.grades), xp: sess.xp };
    S.epochs.push(rec);
  }
  save();
  if (window.speechSynthesis) speechSynthesis.cancel();
  if (silent) { if (rec) toast(`Epoch saved · loss ${rec.loss.toFixed(2)}`); return; }
  if (!sess.grades.length && !sess.games) { go('home'); return; }
  showSummary(sess, rec, early, ms);
}
function showSummary(sess, rec, early, ms) {
  VIEW = 'summary'; renderTop();
  const words = Object.entries(sess.words);
  const sents = Object.entries(sess.sents || {});
  const idioms = Object.entries(sess.idioms || {});
  const dlgs = Object.entries(sess.dlgs || {});
  const loss = sess.grades.length ? epochLoss(sess.grades) : 0;
  const firsts = [...words, ...sents, ...idioms, ...dlgs].map(([, a]) => a[0]);
  const acc = firsts.length ? firsts.filter(g => g > 1).length / firsts.length : 0;
  const minutes = ms / 60000;
  const under = minutes < S.settings.targetMin;
  const gnames = ['', 'Again', 'Hard', 'Good', 'Easy'];
  $('#main').innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="mode" style="justify-content:flex-start">${sess.gym ? (sess.chat ? 'chat gym' : 'sentence gym') : sess.practice ? 'fine-tune complete' : `epoch ${sess.epochNo} ${early ? 'stopped' : 'complete'}`} · 完成 wánchéng</div>
      <h1 style="margin:8px 0 16px">${sess.gym ? 'Gym session done' : early ? 'Checkpoint saved' : 'Epoch complete'} ✓</h1>
      <div class="grid g4">
        <div class="stat"><span class="v">${loss ? loss.toFixed(3) : '–'}</span><span class="k">train loss</span><span class="s">perplexity ${loss ? fmt1(Math.exp(loss)) : '–'}</span></div>
        <div class="stat"><span class="v">${(acc * 100).toFixed(0)}%</span><span class="k">first-try accuracy</span><span class="s">${words.length} words · ${sents.length} sentences${dlgs.length ? ` · ${dlgs.length} chats` : ''}</span></div>
        <div class="stat"><span class="v">${sess.nNew}${sess.nSentNew ? ` <span style="font-size:15px" class="muted">+${sess.nSentNew} sent.</span>` : ''}</span><span class="k">new tokens</span><span class="s">vocab now ${seenIds().length} · ${sentSeenCount()} sentences</span></div>
        <div class="stat"><span class="v" style="color:var(--gold)">+${sess.xp}</span><span class="k">xp</span><span class="s">${fmtTime(ms)} trained</span></div>
      </div>
      ${S.epochs.length > 1 ? `<h3 style="margin-top:22px">Loss curve</h3>${lossChart(S.epochs.slice(-40))}` : ''}
      <div class="row" style="margin-top:18px">
        <button class="btn primary" id="home">Back to dashboard <kbd style="color:inherit;background:transparent;border-color:rgba(255,255,255,.4)">Enter</kbd></button>
        <button class="btn" id="more5">+5 new words</button>
        <button class="btn" id="cram">Fine-tune weak words</button>
        <button class="btn" id="gym">Sentence gym</button>
        <button class="btn" id="cgym">Chat gym</button>
        <button class="btn" id="mg">Play a mini-game</button>
        ${under && !sess.practice ? `<span class="muted" style="font-size:13px">${Math.ceil(S.settings.targetMin - minutes)} min left of your ${S.settings.targetMin}-minute goal</span>` : ''}
        ${sess.newPool && sess.newPool.length && !sess.practice ? `<span class="muted" style="font-size:13px">${sess.newPool.length} new word${sess.newPool.length > 1 ? 's' : ''} held back for the next epoch, so you could consolidate.</span>` : ''}
      </div>
    </div>
    ${words.length ? `<div class="card"><h3>Tokens this epoch</h3><table><tbody>${words.map(([id, gs]) => {
      const w = WORDS[id];
      return `<tr class="rowc" data-word="${id}"><td><span class="hzo">${hanziHTML(w)}</span></td><td>${pinyinHTML(w.s)}</td><td>${esc(w.m)}</td>
        <td>${gs.map(g => `<span class="grade-dot" style="color:${['', 'var(--bad)', 'var(--gold)', 'var(--good)', 'var(--blue)'][g]}" title="${gnames[g]}">●</span>`).join(' ')}</td>
        <td class="mono faint" style="font-size:12px">${getCard(id) && getCard(id).st ? 'next in ' + fmtIvl(getCard(id).due - today()) : ''}</td></tr>`;
    }).join('')}</tbody></table></div>` : ''}
    ${sents.length ? `<div class="card" style="margin-top:16px"><h3>Sentences this epoch</h3><table><tbody>${sents.map(([key, gs]) => {
      const st = SENT_BY_KEY[key]; if (!st) return '';
      const c = S.scards[key];
      return `<tr class="rowc" data-say="${esc(sentText(st))}" title="click to hear"><td><span class="han" style="font-size:20px">${esc(sentText(st))}</span></td><td class="muted">${esc(st.en)}</td>
        <td>${gs.map(g => `<span style="color:${['', 'var(--bad)', 'var(--gold)', 'var(--good)', 'var(--blue)'][g]}" title="${gnames[g]}">●</span>`).join(' ')}</td>
        <td class="mono faint" style="font-size:12px">${!sess.practice && c && c.st ? 'next in ' + fmtIvl(c.due - today()) : ''}</td></tr>`;
    }).join('')}</tbody></table></div>` : ''}
    ${idioms.length ? `<div class="card" style="margin-top:16px"><h3>Idioms this epoch</h3><table><tbody>${idioms.map(([key, gs]) => {
      const x = IDIOM_BY_KEY[key]; if (!x) return '';
      const c = S.icards[key];
      return `<tr class="rowc" data-idiom="${esc(key)}"><td><span class="han" style="font-size:22px">${esc(x.h)}</span></td><td>${pinyinHTML(x.s)}</td><td class="muted">${esc(x.m)}</td>
        <td>${gs.map(g => `<span style="color:${['', 'var(--bad)', 'var(--gold)', 'var(--good)', 'var(--blue)'][g]}" title="${gnames[g]}">●</span>`).join(' ')}</td>
        <td class="mono faint" style="font-size:12px">${c && c.st ? 'next in ' + fmtIvl(c.due - today()) : ''}</td></tr>`;
    }).join('')}</tbody></table></div>` : ''}
    ${dlgs.length ? `<div class="card" style="margin-top:16px"><h3>Dialogues this epoch</h3><table><tbody>${dlgs.map(([key, gs]) => {
      const d = DLG_BY_KEY[key]; if (!d) return '';
      const c = S.dcards[key];
      return `<tr class="rowc" data-turns="${sayTurnsAttr(d)}" title="click to hear"><td><span class="han" style="font-size:19px">${d.t.map(t => esc(t.key)).join('<span class="faint"> → </span>')}</span></td><td class="muted">${d.t.map(t => esc(t.en)).join(' → ')}</td>
        <td>${gs.map(g => `<span style="color:${['', 'var(--bad)', 'var(--gold)', 'var(--good)', 'var(--blue)'][g]}" title="${gnames[g]}">●</span>`).join(' ')}</td>
        <td class="mono faint" style="font-size:12px">${!sess.practice && c && c.st ? 'next in ' + fmtIvl(c.due - today()) : ''}</td></tr>`;
    }).join('')}</tbody></table></div>` : ''}`;
  bindCommon($('#main'));
  $('#home').addEventListener('click', () => go('home'));
  $('#gym').addEventListener('click', () => gymModal());
  $('#cgym').addEventListener('click', () => startChatGym());
  $('#more5').addEventListener('click', () => { dayStats().bonusNew = (dayStats().bonusNew || 0) + 5; save(); startEpoch(); });
  $('#cram').addEventListener('click', () => startEpoch({ practice: true }));
  $('#mg').addEventListener('click', () => pickGameModal());
  KEYH = e => { if (e.key === 'Enter' || e.key === 'Escape') { go('home'); return true; } return false; };
  flushLevelUps();
}
function lossChart(eps) {
  const W = 900, H = 170, P = 30;
  const vals = eps.map(e => e.loss);
  const hi = Math.max(...vals, 0.5) * 1.1, lo = 0;
  const x = i => P + i / Math.max(1, vals.length - 1) * (W - P * 2);
  const y = v => H - P + 8 - (v - lo) / (hi - lo) * (H - P * 2);
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const ticks = [0, hi / 2, hi].map(v => `<text x="2" y="${y(v) + 3}">${v.toFixed(2)}</text><line x1="${P}" x2="${W - P}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-dasharray="3 4"/>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${ticks}
    <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.5" vector-effect="non-scaling-stroke"/>
    ${vals.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="var(--accent)"><title>epoch ${S.epochs.length - vals.length + i + 1}: loss ${v.toFixed(3)} · PPL ${Math.exp(v).toFixed(2)}</title></circle>`).join('')}
    <text x="${W - P}" y="${H - 4}" text-anchor="end">epochs →</text></svg>`;
}

/* ---------- keyboard & text entry ---------- */
// Text fields must always receive typing, including Chinese IME composition:
//  - never run shortcuts while an IME is composing or while focus is in a field (except Esc / Enter)
//  - stray typing (focus lost to a button or the page) is redirected into the card's field
//  - buttons inside a card with a field don't take focus away from it
const IME = { composing: false };
document.addEventListener('compositionstart', () => { IME.composing = true; }, true);
document.addEventListener('compositionend', () => { IME.composing = false; }, true);
function stageInput() {
  if (VIEW !== 'session' && VIEW !== 'game') return null;
  const el = $('#stage input.typein:not([disabled])');
  return el && el.offsetParent !== null ? el : null;
}
function focusStageInput() {
  const el = stageInput();
  if (!el || document.activeElement === el || modalStack.length) return false;
  el.focus();
  return true;
}
const isEditable = t => !!t && !t.disabled && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const editable = isEditable(e.target);
  if (e.isComposing || e.keyCode === 229 || e.key === 'Process' || IME.composing) {
    if (!editable) focusStageInput();
    return;
  }
  if (editable && e.key !== 'Escape' && e.key !== 'Enter') return;
  if (!editable && (e.key.length === 1 || e.key === 'Backspace') && e.key !== ' ' && focusStageInput()) return;
  if (KEYH && KEYH(e)) { e.preventDefault(); return; }
});
document.addEventListener('mousedown', e => {
  const b = e.target.closest && e.target.closest('#stage button, #stage .exbox, #stage .tok');
  if (b && stageInput()) e.preventDefault();          // keep the caret in the field
}, true);
document.addEventListener('click', e => {
  if (!e.target.closest || e.target.closest('button, input, a, select, label, .modal-bg')) return;
  if (e.target.closest('#stage .qcard, #stage .gamecard') && !String(window.getSelection && window.getSelection())) focusStageInput();
});

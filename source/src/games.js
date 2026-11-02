/* ============================================================
   Mini-games: Attention, Tokenizer, Quantize, Decoder
   ============================================================ */

function playableSents(minTok = 2, maxChars = 18) {
  return SENTS.filter(s => s.w.every(w => w < 0 || isSeen(w)) && s.w.filter(w => w >= 0).length >= minTok && sentText(s).length <= maxChars);
}
function weakSeen(n, filter = () => true) {
  const ids = seenIds().filter(id => !isSusp(id) && filter(WORDS[id]));
  ids.sort((a, b) => FSRS.retrievability(S.cards[a]) - FSRS.retrievability(S.cards[b]));
  return shuffle(ids.slice(0, Math.max(n * 3, 12))).slice(0, n);
}
function pickDistinct(ids, n) {
  const out = [];
  for (const id of shuffle(ids)) { if (out.length >= n) break; if (out.every(o => !conflicts(WORDS[o], WORDS[id]))) out.push(id); }
  return out;
}

const GAMES = {
  attention: {
    title: 'Attention', zh: '注意力', note: null, learn: 'attention', logit: 0.6,
    desc: 'Match queries (汉字) to keys: meaning head, then pinyin head.',
    available: () => seenIds().filter(id => !isSusp(id)).length >= 5,
    start: gameAttention,
  },
  tokenizer: {
    title: 'Tokenizer', zh: '分词器', note: 'bpe', learn: 'bpe', logit: 0.7,
    desc: 'Chinese has no spaces. Place the token boundaries.',
    available: () => playableSents(2, 20).length >= 1,
    start: gameTokenizer,
  },
  quantize: {
    title: 'Quantize', zh: '量化', note: 'quant', learn: 'quant', logit: 0.6,
    desc: 'Squeeze continuous pitch into 4 tones + neutral.',
    available: () => seenIds().length >= 4,
    start: gameQuantize,
  },
  decoder: {
    title: 'Decoder', zh: '解码', note: 'greedy', learn: 'greedy', logit: 0.7,
    desc: 'Generate a Chinese sentence one token at a time.',
    available: () => playableSents(3, 22).length >= 1,
    start: gameDecoder,
  },
};
function gameUnlocked(k) { const n = GAMES[k].note; return !n || NOTE_BY_ID[n].lv <= levelInfo().level; }

function runGame(key, inSession) {
  const g = GAMES[key];
  if (!inSession) { VIEW = 'game'; renderTop(); $('#main').innerHTML = '<div class="stage" id="stage"></div>'; }
  else sessBar();
  const stage = $('#stage');
  const learnNote = g.learn && NOTE_BY_ID[g.learn].lv <= levelInfo().level ? g.learn : null;
  stage.innerHTML = `<div class="gamehead pop"><span class="pill gold">mini-game</span><span class="title">${esc(g.title)}</span><span class="zh">${g.zh}</span>
      <span class="spacer"></span>${learnNote ? `<button class="btn small ghost" data-note="${learnNote}">How LLMs do it</button>` : ''}<button class="btn small ghost" id="gskip">Skip</button></div>
    <div class="card gamecard pop" id="gbody"></div>`;
  bindCommon(stage);
  let finished = false;
  const finish = res => {
    if (finished) return; finished = true;
    const rec = S.games[key] || (S.games[key] = { plays: 0, best: 0 });
    rec.plays++; rec.best = Math.max(rec.best, res.score || 0);
    if (inSession && SESS) SESS.games++;
    addXP(res.xp, 'game'); save();
    const body = $('#gbody');
    body.insertAdjacentHTML('beforeend', `<div class="reveal row" style="margin-top:16px"><span class="pill gold">+${res.xp} XP</span><span class="muted">${res.summary || ''}</span><span class="spacer"></span>
      ${inSession ? '' : '<button class="btn" id="gagain">Play again</button>'}<button class="btn primary" id="gnext">${inSession ? 'Back to training' : 'Done'} <kbd style="color:inherit;background:transparent;border-color:rgba(255,255,255,.4)">Enter</kbd></button></div>`);
    const cont = () => flushLevelUps(() => { if (inSession) nextItem(); else go('lab'); });
    $('#gnext').addEventListener('click', cont);
    $('#gagain') && $('#gagain').addEventListener('click', () => runGame(key, false));
    KEYH = e => { if (e.key === 'Enter' || e.key === ' ') { cont(); return true; } if (e.key === 'Escape') { inSession ? endEpoch(true) : go('lab'); return true; } return false; };
  };
  $('#gskip').addEventListener('click', () => { finished = true; if (inSession) nextItem(); else go('lab'); });
  g.start($('#gbody'), finish);
}
function pickGameModal() {
  const avail = Object.entries(GAMES).filter(([k, g]) => gameUnlocked(k) && g.available());
  if (!avail.length) { toast('No mini-games available yet. Learn a few more words.'); return; }
  const m = modal(`<h2>Pick a mini-game</h2><div class="games">${avail.map(([k, g]) => `<button class="gamebtn" data-g="${k}"><div class="gz">${g.zh}</div><div class="gt">${esc(g.title)}</div><div class="muted" style="font-size:12px">${esc(g.desc)}</div></button>`).join('')}</div>`);
  $$('[data-g]', m.bg).forEach(b => b.addEventListener('click', () => { m.close(); runGame(b.dataset.g, false); }));
}

/* ---------- 1. Attention ---------- */
function gameAttention(el, done) {
  const heads = ['meaning', 'pinyin'];
  let round = 0, mistakes = 0, pairs = 0;
  const t0 = Date.now();
  const heatmaps = [];
  function play() {
    const head = heads[round];
    const ids = pickDistinct(weakSeen(12), 5);
    const keys = shuffle(ids);
    const A = ids.map(() => keys.map(() => 0));
    const matched = new Set();
    let sel = null; // {side:'q'|'k', i}
    el.innerHTML = `<div class="explain">Head ${round + 1}/2 · <b>${head}</b>. Each query (汉字) must attend to the key that matches its ${head}. Click a query, then its key. <kbd>1</kbd>–<kbd>5</kbd> queries, <kbd>6</kbd>–<kbd>0</kbd> keys.</div>
      <div class="attn" id="attn"><svg id="attnsvg"></svg>
        <div class="col">${ids.map((id, i) => `<button class="it" data-q="${i}"><span class="k mono faint">${i + 1}</span><span class="hzo">${esc(WORDS[id].h)}</span></button>`).join('')}</div>
        <div class="col">${keys.map((id, j) => `<button class="it" data-k="${j}"><span class="k mono faint">${(j + 6) % 10}</span><span>${head === 'meaning' ? esc(WORDS[id].m) : `<span style="font-size:20px">${esc(WORDS[id].p)}</span>`}</span></button>`).join('')}</div>
      </div>`;
    const qs = $$('[data-q]', el), ks = $$('[data-k]', el);
    function line(i, j) {
      const box = $('#attn').getBoundingClientRect();
      const a = qs[i].getBoundingClientRect(), b = ks[j].getBoundingClientRect();
      const x1 = a.right - box.left, y1 = a.top + a.height / 2 - box.top, x2 = b.left - box.left, y2 = b.top + b.height / 2 - box.top;
      const t = WORDS[ids[i]].s[0][1];
      $('#attnsvg').insertAdjacentHTML('beforeend', `<path d="M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}" stroke="var(--t${t})" stroke-width="3" fill="none" opacity=".85"/>`);
    }
    function trySel(side, i) {
      if (side === 'q' && matched.has(i)) return;
      if (side === 'k' && [...matched].some(q => keys.indexOf(ids[q]) === i)) return;
      if (!sel || sel.side === side) {
        sel = { side, i };
        qs.forEach((b, x) => b.classList.toggle('sel', side === 'q' && x === i));
        ks.forEach((b, x) => b.classList.toggle('sel', side === 'k' && x === i));
        if (side === 'q') TTS.speak(WORDS[ids[i]].h);
        return;
      }
      const qi = side === 'q' ? i : sel.i, kj = side === 'k' ? i : sel.i;
      sel = null; qs.forEach(b => b.classList.remove('sel')); ks.forEach(b => b.classList.remove('sel'));
      if (keys[kj] === ids[qi]) {
        A[qi][kj] += 3; matched.add(qi); pairs++;
        qs[qi].classList.add('done'); ks[kj].classList.add('done');
        line(qi, kj); SFX.good();
        if (side === 'k') TTS.speak(WORDS[ids[qi]].h);
        if (matched.size === ids.length) setTimeout(endRound, 450);
      } else {
        A[qi][kj] += 1; mistakes++; SFX.bad();
        [qs[qi], ks[kj]].forEach(b => { b.classList.remove('err'); void b.offsetWidth; b.classList.add('err'); });
      }
    }
    qs.forEach((b, i) => b.addEventListener('click', () => trySel('q', i)));
    ks.forEach((b, j) => b.addEventListener('click', () => trySel('k', j)));
    KEYH = e => {
      if (/^[1-5]$/.test(e.key)) { trySel('q', +e.key - 1); return true; }
      if (/^[6-90]$/.test(e.key)) { trySel('k', (+e.key + 4) % 10); return true; }
      return false;
    };
    function endRound() {
      // reorder columns so that the ideal attention pattern is diagonal
      const order = ids.map(id => keys.indexOf(id));
      heatmaps.push({ head, ids, M: A.map(row => { const r = order.map(j => row[j]); const s = r.reduce((a, b) => a + b, 0) || 1; return r.map(v => v / s); }) });
      round++;
      if (round < heads.length) play(); else finish();
    }
  }
  function finish() {
    const secs = (Date.now() - t0) / 1000;
    const xp = Math.max(5, Math.round(pairs * 3 - mistakes * 2 + Math.max(0, 20 - secs / 6)));
    el.innerHTML = `<div class="explain">Your attention weights, row-normalized. A perfect head puts all weight on the diagonal: each query attends to exactly one key. Off-diagonal mass = confusion.</div>
      <div class="row" style="justify-content:center;gap:40px">${heatmaps.map(h => `<div><div class="mode">${h.head} head</div>
        <div class="heat" style="grid-template-columns:repeat(${h.ids.length + 1},34px)"><div class="lab"></div>${h.ids.map(id => `<div class="lab">${esc(WORDS[id].h[0])}</div>`).join('')}
        ${h.M.map((row, i) => `<div class="lab">${esc(WORDS[h.ids[i]].h[0])}</div>${row.map((v, j) => `<div style="background:color-mix(in srgb, ${i === j ? 'var(--jade)' : 'var(--bad)'} ${Math.round(v * 100)}%, var(--card2))">${v > 0 ? v.toFixed(1) : ''}</div>`).join('')}`).join('')}</div></div>`).join('')}</div>
      <p class="muted" style="text-align:center;font-size:13px">softmax(QKᵀ/√d) does this for every token pair, in every head, in every layer.</p>`;
    KEYH = null;
    done({ xp, score: Math.round(100 * pairs / (pairs + mistakes)), summary: `${pairs} pairs · ${mistakes} mistakes · ${Math.round(secs)}s` });
  }
  play();
}

/* ---------- 2. Tokenizer ---------- */
function gameTokenizer(el, done) {
  const pool = playableSents(2, 20);
  const sents = shuffle(pool).sort((a, b) => sentText(b).length - sentText(a).length).slice(0, Math.min(6, pool.length));
  const chosen = shuffle(sents).slice(0, Math.min(3, sents.length));
  let idx = 0, xp = 0, f1sum = 0;
  function play() {
    const s = chosen[idx];
    const chars = []; // {c, tok, punct}
    s.z.forEach((t, ti) => [...t].forEach(c => chars.push({ c, tok: ti, punct: s.w[ti] < 0 })));
    const gaps = [];  // between chars[i] and chars[i+1]
    for (let i = 0; i < chars.length - 1; i++) {
      const fixed = chars[i].punct || chars[i + 1].punct;
      gaps.push({ gold: chars[i].tok !== chars[i + 1].tok, on: false, fixed });
    }
    const clickable = gaps.map((g, i) => g.fixed ? -1 : i).filter(i => i >= 0);
    let cur = 0, submitted = false;
    function render() {
      el.innerHTML = `<div class="explain">Sentence ${idx + 1}/${chosen.length}. Chinese is written without spaces, so splitting it into words is the first job of any NLP pipeline. Click between characters to place <b>token boundaries</b>. <kbd>←</kbd><kbd>→</kbd> move, <kbd>Space</kbd> toggle, <kbd>Enter</kbd> submit.</div>
        <div class="seg">${chars.map((ch, i) => `<span class="ch ${ch.punct ? 'muted' : ''}">${esc(ch.c)}</span>${i < gaps.length ? `<span class="gap ${gapCls(i)}" data-gap="${i}"></span>` : ''}`).join('')}</div>
        <div id="segres"></div>
        ${submitted ? '' : '<div class="row" style="justify-content:center;margin-top:12px"><button class="btn" data-say="' + esc(sentText(s)) + '">🔊 Hear it</button><button class="btn primary" id="segsub">Submit tokens</button></div>'}`;
      bindCommon(el);
      $$('[data-gap]', el).forEach(g => g.addEventListener('click', () => toggle(+g.dataset.gap)));
      $('#segsub') && $('#segsub').addEventListener('click', submit);
    }
    function gapCls(i) {
      const g = gaps[i];
      if (g.fixed) return 'fixed';
      if (submitted) return g.gold && g.on ? 'ok' : g.gold ? 'miss' : g.on ? 'extra' : '';
      return (g.on ? 'on ' : '') + (clickable[cur] === i ? 'cur' : '');
    }
    function toggle(i) { if (submitted || gaps[i].fixed) return; gaps[i].on = !gaps[i].on; cur = clickable.indexOf(i); SFX.tick(); render(); }
    function submit() {
      if (submitted) return;
      submitted = true;
      let tp = 0, fp = 0, fn = 0;
      gaps.forEach(g => { if (g.fixed) return; if (g.gold && g.on) tp++; else if (g.on) fp++; else if (g.gold) fn++; });
      const prec = tp + fp ? tp / (tp + fp) : 1, rec = tp + fn ? tp / (tp + fn) : 1;
      const f1 = prec + rec ? 2 * prec * rec / (prec + rec) : 0;
      f1sum += f1;
      const gained = Math.round(10 * f1) + (f1 === 1 ? 4 : 0); xp += gained;
      f1 === 1 ? SFX.good() : SFX.bad();
      render();
      const nUser = gaps.filter(g => !g.fixed && g.on).length + 1, nGold = s.w.filter(w => w >= 0).length;
      $('#segres').innerHTML = `<div class="reveal">${sentenceHTML(s)}<div class="muted">${esc(s.en)}</div>
        <div class="row" style="justify-content:center;margin-top:10px"><span class="pill ${f1 === 1 ? 'jade' : 'gold'}">boundary F1 ${f1.toFixed(2)}</span><span class="pill">precision ${prec.toFixed(2)}</span><span class="pill">recall ${rec.toFixed(2)}</span>
        <span class="faint" style="font-size:12px">green = correct · dashed = missed · red = extra</span></div>
        <div class="row" style="justify-content:center;margin-top:12px"><button class="btn primary" id="segnext">${idx + 1 < chosen.length ? 'Next sentence' : 'Finish'} <kbd style="color:inherit;background:transparent;border-color:rgba(255,255,255,.4)">Enter</kbd></button></div></div>`;
      bindCommon($('#segres'));
      TTS.speak(sentText(s));
      $('#segnext').addEventListener('click', next);
    }
    function next() { idx++; if (idx < chosen.length) play(); else end(); }
    render();
    KEYH = e => {
      if (submitted) { if (e.key === 'Enter' || e.key === ' ') { next(); return true; } return false; }
      if (e.key === 'ArrowRight') { cur = Math.min(clickable.length - 1, cur + 1); render(); return true; }
      if (e.key === 'ArrowLeft') { cur = Math.max(0, cur - 1); render(); return true; }
      if (e.key === ' ') { if (clickable.length) toggle(clickable[cur]); return true; }
      if (e.key === 'Enter') { submit(); return true; }
      if (e.key === 'r' || e.key === 'R') { TTS.speak(sentText(s)); return true; }
      return false;
    };
  }
  function end() {
    KEYH = null;
    el.innerHTML = `<div class="explain">LLM tokenizers don't segment by meaning: BPE merges whatever byte pairs are frequent, so a Chinese character is often one token and rare ones get split into byte pieces. Word segmentation like you just did is what classic Chinese NLP (and your brain) relies on.</div>`;
    done({ xp: Math.max(4, xp), score: Math.round(100 * f1sum / chosen.length), summary: `mean F1 ${(f1sum / chosen.length).toFixed(2)} over ${chosen.length} sentences` });
  }
  play();
}

/* ---------- 3. Quantize (tones) ---------- */
const CONTOUR = { 1: [[0, 5], [1, 5]], 2: [[0, 3], [1, 5]], 3: [[0, 2.2], [0.5, 1], [1, 4]], 4: [[0, 5], [1, 1]], 5: [[0.3, 3], [0.7, 2.6]] };
function contourSVG(syls, guesses) {
  const W = 520, H = 130, pad = 18, n = syls.length, sw = (W - pad * 2) / n;
  const y = v => H - 14 - (v - 1) / 4 * (H - 34);
  let svg = [1, 2, 3, 4, 5].map(l => `<line x1="${pad}" x2="${W - pad}" y1="${y(l)}" y2="${y(l)}" stroke="var(--line)" stroke-dasharray="2 5"/><text x="2" y="${y(l) + 3}" font-size="9" fill="var(--faint)" font-family="monospace">${l}</text>`).join('');
  syls.forEach(([syl, t], i) => {
    const x0 = pad + i * sw + 10, x1 = pad + (i + 1) * sw - 10;
    const pts = CONTOUR[t].map(([u, v]) => [x0 + u * (x1 - x0), y(v)]);
    // quadratic Bézier that passes through the middle point at t = 0.5 (the dip of tone 3)
    const d = pts.length === 3 ? `M${pts[0]} Q${2 * pts[1][0] - (pts[0][0] + pts[2][0]) / 2},${2 * pts[1][1] - (pts[0][1] + pts[2][1]) / 2} ${pts[2]}` : `M${pts[0]} L${pts[1]}`;
    svg += `<path d="${d}" stroke="var(--t${t})" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    // quantized dots: the level each contour point snaps to
    svg += CONTOUR[t].map(([u, v]) => `<circle cx="${x0 + u * (x1 - x0)}" cy="${y(Math.round(v))}" r="3.5" fill="var(--text)" opacity=".6"/>`).join('');
    svg += `<text x="${(x0 + x1) / 2}" y="${H - 1}" text-anchor="middle" font-size="12" fill="var(--t${t})">${esc(syl)} · ${t === 5 ? 'neutral' : 'tone ' + t}</text>`;
  });
  return `<svg class="contour" viewBox="0 0 ${W} ${H}">${svg}</svg>`;
}
function gameQuantize(el, done) {
  const hasTTS = TTS.available();
  const pool = seenIds().filter(id => !isSusp(id));
  const multi = shuffle(pool.filter(id => WORDS[id].s.length > 1)), single = shuffle(pool.filter(id => WORDS[id].s.length === 1));
  const wantMulti = S.quantBits < 16 ? 5 : 3;
  const items = shuffle([...multi.slice(0, wantMulti), ...single].slice(0, 8).concat(multi.slice(wantMulti)).slice(0, 8));
  let idx = 0, xp = 0, streak = 0, correctN = 0;
  if (!hasTTS) S.quantBits = 16;
  function play() {
    const w = WORDS[items[idx]];
    const bits = S.quantBits;
    const guesses = w.s.map(() => 0);
    let submitted = false, played = 0;
    const bases = w.s.map(([syl]) => plainSyl(syl)[0].replace(/v/g, 'ü'));
    function render() {
      el.innerHTML = `<div class="qbits">${[16, 8, 4].map(b => `<span class="${b === bits ? 'on' : ''}">${b === 16 ? 'FP16' : 'INT' + b}</span>`).join('')}</div>
        <div class="explain">Word ${idx + 1}/${items.length}. Pitch is continuous; Mandarin <b>quantizes</b> it into 4 tones + neutral. ${bits === 16 ? 'FP16: characters, pinyin and audio.' : bits === 8 ? 'INT8: no characters. Audio + letters only.' : 'INT4: audio plays once. Max compression, ×2 XP.'} Streak of 4 lowers the bit-width; a miss raises it. Type tones with <kbd>1</kbd>–<kbd>5</kbd>.</div>
        <div style="text-align:center">
          ${bits === 16 || !hasTTS ? `<div class="hz md">${esc(w.h)}</div>` : ''}
          ${hasTTS ? `<button class="speak ${bits === 16 ? '' : 'huge'}" id="qplay">${ICON_SPEAK}</button>` : ''}
          <div class="sylrow">${bases.map((b, i) => `<div class="sylbox"><span class="base">${esc(b)}</span><div class="tonebtns">${[1, 2, 3, 4, 5].map(t => `<button data-s="${i}" data-t="${t}" class="${tbCls(i, t)}">${t === 5 ? '·' : t}</button>`).join('')}</div></div>`).join('')}</div>
          <div id="qres"></div>
        </div>`;
      $$('[data-t]', el).forEach(b => b.addEventListener('click', () => setTone(+b.dataset.s, +b.dataset.t)));
      const p = $('#qplay'); if (p) p.addEventListener('click', playAudio);
    }
    function tbCls(i, t) {
      if (!submitted) return guesses[i] === t ? 'on' : '';
      const want = w.s[i][1];
      if (t === want) return 'ok';
      if (t === guesses[i]) return 'bad';
      return '';
    }
    function playAudio() { if (bits === 4 && played >= 1 && !submitted) return; played++; TTS.speak(w.h, S.settings.rate * 0.9); }
    function setTone(i, t) { if (submitted) return; guesses[i] = t; render(); if (guesses.every(g => g)) setTimeout(submit, 250); }
    function okAt(i) {
      const want = w.s[i][1], g = guesses[i];
      if (want === 5) return true;                       // neutral: lenient
      if (g === want) return true;
      // 3-3 sandhi: a 3rd tone before another 3rd tone is spoken as 2nd
      if (want === 3 && g === 2 && w.s[i + 1] && w.s[i + 1][1] === 3) return true;
      return false;
    }
    function submit() {
      if (submitted) return;
      submitted = true;
      const ok = w.s.every((_, i) => okAt(i));
      const mult = bits === 16 ? 1 : bits === 8 ? 1.5 : 2;
      let note = '';
      if (ok) { correctN++; streak++; xp += Math.round(4 * mult); SFX.good(); if (streak >= 4 && S.quantBits > 4) { S.quantBits /= 2; streak = 0; note = `<span class="pill accent">quantized to INT${S.quantBits}!</span>`; } }
      else { streak = 0; SFX.bad(); if (S.quantBits < 16) { S.quantBits *= 2; note = `<span class="pill">precision restored to ${S.quantBits === 16 ? 'FP16' : 'INT' + S.quantBits}</span>`; } }
      render();
      const sandhi = w.s.some((x, i) => x[1] === 3 && w.s[i + 1] && w.s[i + 1][1] === 3);
      const topHz = $('.gamecard .hz'); if (topHz) topHz.innerHTML = hanziHTML(w);
      $('#qres').innerHTML = `<div class="reveal">${topHz ? '' : `<div class="hz md">${hanziHTML(w)}</div>`}<div class="py">${pinyinHTML(w.s)}</div><div class="muted">${esc(w.m)}</div>
        ${contourSVG(w.s, guesses)}
        <div class="row" style="justify-content:center;margin-top:6px"><span class="pill ${ok ? 'jade' : 'gold'}">${ok ? 'correct' : 'quantization error'}</span>${note}${sandhi ? '<span class="pill gold">3-3 sandhi: first 3rd tone sounds like 2nd</span>' : ''}</div>
        <div class="row" style="justify-content:center;margin-top:12px"><button class="btn primary" id="qnext">${idx + 1 < items.length ? 'Next' : 'Finish'} <kbd style="color:inherit;background:transparent;border-color:rgba(255,255,255,.4)">Enter</kbd></button></div></div>`;
      $('#qnext').addEventListener('click', next);
      TTS.speak(w.h);
    }
    function next() { idx++; if (idx < items.length) play(); else end(); }
    render();
    if (hasTTS) setTimeout(playAudio, 250);
    KEYH = e => {
      if (submitted) { if (e.key === 'Enter' || e.key === ' ') { next(); return true; } return false; }
      if (/^[1-5]$/.test(e.key)) { const i = guesses.findIndex(g => !g); if (i >= 0) setTone(i, +e.key); return true; }
      if (e.key === 'Backspace') { for (let i = guesses.length - 1; i >= 0; i--) if (guesses[i]) { guesses[i] = 0; break; } render(); return true; }
      if (e.key === 'r' || e.key === 'R') { playAudio(); return true; }
      if (e.key === 'Enter' && guesses.every(g => g)) { submit(); return true; }
      return false;
    };
  }
  function end() {
    KEYH = null; save();
    el.innerHTML = `<div class="explain">Real quantization works the same way: map a continuous value to the nearest of a few levels with a scale factor, q = round(x/s). Fewer levels → smaller model, more rounding error. GPTQ and AWQ are clever ways to decide <i>where</i> that error can go.</div>`;
    done({ xp: Math.max(3, xp), score: Math.round(100 * correctN / items.length), summary: `${correctN}/${items.length} correct · now at ${S.quantBits === 16 ? 'FP16' : 'INT' + S.quantBits}` });
  }
  play();
}

/* ---------- 4. Decoder ---------- */
function gameDecoder(el, done) {
  const pool = playableSents(3, 22);
  const chosen = shuffle(pool).slice(0, Math.min(4, pool.length));
  let idx = 0, xp = 0, totalErr = 0, nllSum = 0, tokSum = 0;
  function play() {
    const s = chosen[idx];
    const gold = s.z.map((t, i) => ({ t, w: s.w[i] })).filter(x => x.w >= 0);
    const inSent = new Set(gold.map(g => g.w));
    const nd = gold.length <= 3 ? 1 : 2;
    const dist = pickDistinct(seenIds().filter(id => !inSent.has(id) && !gold.some(g => g.t === WORDS[id].h)), nd);
    const tiles = shuffle([...gold.map((g, i) => ({ t: g.t, w: g.w, gi: i })), ...dist.map(id => ({ t: WORDS[id].h, w: id, gi: -1 }))]);
    let pos = 0, nll = 0, errs = 0, hint = false;
    const used = new Set();
    function outHTML() {
      // generated tokens so far; punctuation appears once every word before it is generated
      let html = '', gi = 0;
      for (let i = 0; i < s.z.length; i++) {
        if (s.w[i] < 0) { if (gi > 0 && gi <= pos) html += `<span class="tokd" style="background:none;color:var(--muted)">${esc(s.z[i])}</span>`; continue; }
        if (gi < pos) html += `<span class="tokd">${esc(s.z[i])}</span>`;
        gi++;
      }
      return html + (pos < gold.length ? '<span class="cursor"></span>' : '');
    }
    function render() {
      el.innerHTML = `<div class="explain">Sentence ${idx + 1}/${chosen.length}. You are the decoder: generate the translation <b>autoregressively</b>, one token at a time, left to right. A correct token costs −log 0.9 ≈ 0.11 nats; a wrong one costs −log 0.05 ≈ 3.0. <kbd>1</kbd>–<kbd>9</kbd> pick, <kbd>R</kbd> audio hint (+0.5).</div>
        <div class="prompt-en" style="text-align:center;margin:12px 0 4px">${esc(s.en)}</div>
        <div class="decout" id="decout">${outHTML()}</div>
        <div class="tiles">${tiles.map((t, i) => `<button class="tile ${used.has(i) ? 'used' : ''}" data-ti="${i}"><span class="k">${i + 1}</span>${esc(t.t)}</button>`).join('')}</div>
        <div class="row" style="justify-content:center;margin-top:12px"><span class="nll">NLL ${nll.toFixed(2)} · step ${pos}/${gold.length}</span></div>
        <div id="decres"></div>`;
      $$('[data-ti]', el).forEach(b => b.addEventListener('click', () => choose(+b.dataset.ti)));
    }
    function choose(i) {
      if (pos >= gold.length || used.has(i)) return;
      const t = tiles[i];
      if (t.t === gold[pos].t) {
        used.add(i); pos++; nll += -Math.log(0.9); SFX.tick();
        render();
        if (pos === gold.length) finishSent();
      } else {
        const later = gold.slice(pos + 1).some(g => g.t === t.t);
        nll += later ? -Math.log(0.2) : -Math.log(0.05); errs++; SFX.bad();
        render();
        const b = $(`[data-ti="${i}"]`, el); b.classList.add('err');
        if (later) toast('Right token, wrong position: order matters (RoPE!)');
      }
    }
    function finishSent() {
      const ppl = Math.exp(nll / gold.length);
      nllSum += nll; tokSum += gold.length; totalErr += errs;
      const gained = Math.max(2, 12 - 3 * errs); xp += gained;
      $('#decres').innerHTML = `<div class="reveal">${sentenceHTML(s)}<div class="row" style="justify-content:center;margin-top:8px"><span class="pill ${errs ? 'gold' : 'jade'}">perplexity ${ppl.toFixed(2)}</span><span class="pill">${errs} wrong token${errs === 1 ? '' : 's'}</span></div>
        <div class="row" style="justify-content:center;margin-top:12px"><button class="btn primary" id="decnext">${idx + 1 < chosen.length ? 'Next sentence' : 'Finish'} <kbd style="color:inherit;background:transparent;border-color:rgba(255,255,255,.4)">Enter</kbd></button></div></div>`;
      bindCommon($('#decres'));
      $('#decnext').addEventListener('click', next);
      errs ? SFX.bad() : SFX.good();
      TTS.speak(sentText(s));
    }
    function next() { idx++; if (idx < chosen.length) play(); else end(); }
    render();
    KEYH = e => {
      if (pos >= gold.length) { if (e.key === 'Enter' || e.key === ' ') { next(); return true; } return false; }
      if (/^[1-9]$/.test(e.key)) { choose(+e.key - 1); return true; }
      if (e.key === 'r' || e.key === 'R') { if (!hint) { hint = true; nll += 0.5; render(); } TTS.speak(sentText(s)); return true; }
      return false;
    };
  }
  function end() {
    KEYH = null;
    const ppl = Math.exp(nllSum / Math.max(1, tokSum));
    el.innerHTML = `<div class="explain">That's exactly how an LLM writes: one token at a time, each conditioned on everything before it. Greedy decoding = always take the most likely next token. It's fast, but a locally good choice can lead to a globally worse sentence. That's what <b>beam search</b> fixes.</div>`;
    done({ xp: Math.max(4, xp), score: Math.round(100 / ppl), summary: `perplexity ${ppl.toFixed(2)} · ${totalErr} wrong tokens` });
  }
  play();
}

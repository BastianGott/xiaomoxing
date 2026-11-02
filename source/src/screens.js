/* ============================================================
   Screens: research notes, dictionary, lab, stats, settings, init
   ============================================================ */

/* ---------- research notes ---------- */
function noteCardHTML(n) {
  const lv = levelInfo().level, on = n.lv <= lv;
  const t = n.terms[0];
  return `<button class="note ${on ? '' : 'locked'}" data-note="${n.id}">
    <div class="row" style="gap:6px"><span class="pill">Lv ${n.lv}</span>${on && !S.notesRead[n.id] ? '<span class="dot" title="unread"></span>' : ''}${S.quiz[n.id] ? '<span class="pill jade">quiz ✓</span>' : ''}</div>
    <div class="nt">${on ? esc(n.title) : '🔒 ' + esc(n.title)}</div>
    <div class="nz">${on ? esc(t[0]) : '？'}</div><div class="faint" style="font-size:12px">${on ? esc(t[1]) + ' · ' + esc(t[2]) : 'unlocks at Lv ' + n.lv}</div></button>`;
}
function openNote(id) {
  const n = NOTE_BY_ID[id];
  if (!n || n.lv > levelInfo().level) return;
  const firstRead = !S.notesRead[id];
  S.notesRead[id] = Date.now();
  if (firstRead) addXP(15, 'read');
  save();
  const q = n.quiz;
  const order = shuffle(q.o.map((o, i) => i));
  const m = modal(`<div class="mode" style="justify-content:flex-start">research note · Lv ${n.lv}</div>
    <h2 style="margin-top:6px">${esc(n.title)}</h2>
    <div class="terms">${n.terms.map(([h, p, mean], i) => `<div class="term" data-say="${esc(h)}"><span class="hzo">${esc(h)}</span><span><b>${esc(p)}</b><br><span class="muted" style="font-size:12px">${esc(mean)}</span></span></div>`).join('')}</div>
    <p style="line-height:1.65">${n.body}</p>
    <div class="formula">${n.formula}</div>
    <p class="muted" style="font-size:13px">🎮 ${n.game}</p>
    <div class="quiz" style="margin-top:14px"><h3>Check · ${S.quiz[id] ? 'passed ✓' : '+25 XP'}</h3><p style="font-weight:600">${esc(q.q)}</p>
      <div class="opts" style="margin-top:8px">${order.map((oi, k) => `<button class="opt" data-qi="${oi}"><span class="k">${k + 1}</span><span>${esc(q.o[oi])}</span></button>`).join('')}</div>
      <div id="qx" class="muted" style="margin-top:10px;font-size:13px"></div></div>
    ${S.settings.aiTerms && n.terms.some(t => { const w = WORDS.find(x => x.h === t[0]); return w && w.l === 0 && !isSeen(w.id); }) ? '<p class="faint" style="font-size:12px">The Chinese term will show up as a new word in an upcoming epoch.</p>' : ''}
    <div class="row" style="margin-top:16px"><span class="spacer"></span><button class="btn" data-close>Close <kbd>Esc</kbd></button></div>`,
    () => { if (VIEW === 'home') go('home'); if (VIEW === 'lab') go('lab'); flushLevelUps(); },
    { noEnter: true, keys: (e) => { if (/^[1-4]$/.test(e.key)) { answer(order[+e.key - 1]); return true; } return false; } });
  let answered = false;
  function answer(oi) {
    if (answered) return; answered = true;
    const right = oi === q.a;
    $$('.quiz .opt', m.bg).forEach(b => { const i = +b.dataset.qi; b.disabled = true; b.classList.add(i === q.a ? 'right' : i === oi ? 'wrong' : 'dim'); });
    $('#qx', m.bg).innerHTML = (right ? '<b style="color:var(--good)">Correct.</b> ' : '<b style="color:var(--bad)">Not quite.</b> ') + esc(q.x);
    if (right) { SFX.good(); if (!S.quiz[id]) { S.quiz[id] = Date.now(); addXP(25, 'quiz'); save(); } } else SFX.bad();
  }
  $$('.quiz .opt', m.bg).forEach(b => b.addEventListener('click', () => answer(+b.dataset.qi)));
}

/* ---------- word detail ---------- */
function statusOf(id) {
  const c = S.cards[id];
  if (c && c.susp) return ['suspended', 'st-susp'];
  if (!c || c.st === 0) return ['new', 'st-new'];
  if (c.due <= today()) return ['due', 'st-due'];
  if (c.s >= 21) return ['mature · ' + fmtIvl(c.due - today()), 'st-mature'];
  return ['in ' + fmtIvl(c.due - today()), 'st-ok'];
}
function openWord(id) {
  const w = WORDS[id];
  const sents = (SENTS_BY_WORD[id] || []).map(sid => SENTS[sid]).slice(0, 6);
  const c = S.cards[id];
  const m = modal(`<div class="row"><span class="mode">word · 词</span><span class="spacer"></span>${levelTag(w)}<span class="pill ${statusOf(id)[1]}">${statusOf(id)[0]}</span></div>
    <div style="text-align:center">${wordInfoHTML(w)}</div>
    ${usageHTML(id)}
    <div class="memline" style="text-align:center">${memLine(id)}</div>
    ${SPOKEN_BY_ID[id] && (DLGS_BY_WORD[id] || []).length ? `<h3 style="margin-top:16px">In a chat</h3>${dlgExampleHTML(id, true)}` : ''}
    ${sents.length ? `<h3 style="margin-top:16px">Example sentences</h3>${sents.map(s => `<div class="exbox small" data-say="${esc(sentText(s))}">${sentenceHTML(s, id)}<div class="en">${esc(s.en)}</div></div>`).join('')}` : ''}
    <div class="row" style="margin-top:18px">
      ${!c || c.st === 0 ? '<button class="btn" id="wnext">Learn next</button><button class="btn" id="wknown">I already know it</button>' : '<button class="btn" id="wreset">Reset progress</button>'}
      <button class="btn" id="wsusp">${c && c.susp ? 'Unsuspend' : 'Suspend'}</button>
      <span class="spacer"></span><button class="btn" data-close>Close</button></div>`, () => { if (VIEW === 'dict') renderDictRows(); });
  const on = (sel, fn) => { const b = $(sel, m.bg); if (b) b.addEventListener('click', () => { fn(); save(); m.close(); }); };
  on('#wnext', () => { S.order = [id, ...S.order.filter(x => x !== id)]; toast(`<span class="han">${esc(w.h)}</span> is next in line`); });
  on('#wknown', () => { const k = ensureCard(id); Object.assign(k, { st: 2, s: 30, d: 3, last: Date.now(), reps: 1, due: today() + randInt(14, 35), known: true }); });
  on('#wreset', () => { delete S.cards[id]; });
  on('#wsusp', () => { const k = ensureCard(id); k.susp = !k.susp; });
}

/* ---------- dictionary ---------- */
let DICT_Q = { q: '', lv: 'all', st: 'all' };
function renderDict(m) {
  const total = CORE_ORDER.length;
  m.innerHTML = `<div class="row" style="margin-bottom:6px"><h2>Dictionary · 词典 <span class="muted" style="font-weight:400;font-size:15px">cídiǎn</span></h2><span class="spacer"></span>
      <span class="muted" style="font-size:13px">${seenIds().length} / ${total} learned · ordered by learning priority (frequency-informed, HSK 1→4)</span></div>
    <div class="dicttools">
      <input id="dq" placeholder="Search 汉字, pinyin (ni3 / nǐ / ni) or English…" value="${esc(DICT_Q.q)}" autocomplete="off">
      <select id="dlv"><option value="all">All levels</option>${[1, 2, 3, 4].map(l => `<option value="${l}">HSK ${l}</option>`).join('')}<option value="0">AI terms</option><option value="chat">💬 Chat words</option></select>
      <button class="btn" id="dexp" title="Tab-separated file you can import into Anki (File → Import)">Export for Anki</button>
      <select id="dst"><option value="all">Any status</option><option value="new">New</option><option value="seen">Learned</option><option value="due">Due</option><option value="mature">Mature</option><option value="leech">Leeches</option><option value="susp">Suspended</option></select>
    </div>
    <div class="grid g4" style="margin-bottom:14px">${[1, 2, 3, 4].map(l => { const ids = WORDS.filter(w => w.l === l).map(w => w.id); const n = ids.filter(isSeen).length; return `<div class="card" style="padding:12px 14px"><div class="row"><b>HSK ${l}</b><span class="spacer"></span><span class="mono muted" style="font-size:12px">${n}/${ids.length}</span></div><div class="bar" style="margin-top:8px"><i style="width:${(n / ids.length * 100).toFixed(1)}%"></i></div></div>`; }).join('')}</div>
    <table><thead><tr><th>#</th><th>汉字</th><th>pinyin</th><th>meaning</th><th>level</th><th>status</th></tr></thead><tbody id="drows"></tbody></table>`;
  $('#dlv').value = DICT_Q.lv; $('#dst').value = DICT_Q.st;
  $('#dq').addEventListener('input', e => { DICT_Q.q = e.target.value; renderDictRows(); });
  $('#dlv').addEventListener('change', e => { DICT_Q.lv = e.target.value; renderDictRows(); });
  $('#dst').addEventListener('change', e => { DICT_Q.st = e.target.value; renderDictRows(); });
  $('#dexp').addEventListener('click', exportTSV);
  renderDictRows();
  KEYH = e => { if (e.key === '/' && e.target.tagName !== 'INPUT') { $('#dq').focus(); return true; } return false; };
}
function dictList() {
  const q = DICT_Q.q.trim().toLowerCase();
  const qn = q.replace(/\s+/g, '');
  let list = [...CORE_ORDER, ...WORDS.filter(w => w.l === 0).map(w => w.id)].map(id => WORDS[id]);
  if (DICT_Q.lv === 'chat') list = SPOKEN.map(x => WORDS[x.id]);
  else if (DICT_Q.lv !== 'all') list = list.filter(w => w.l === +DICT_Q.lv);
  const st = DICT_Q.st;
  if (st !== 'all') list = list.filter(w => { const c = S.cards[w.id];
    if (st === 'new') return !c || c.st === 0; if (st === 'seen') return c && c.st > 0; if (st === 'due') return c && c.st > 0 && c.due <= today() && !c.susp;
    if (st === 'mature') return c && c.s >= 21; if (st === 'leech') return c && c.leech; if (st === 'susp') return c && c.susp; return true; });
  if (q) list = list.filter(w => w.h.includes(q) || stripTones(w.p).replace(/\s/g, '').includes(stripTones(qn)) || w.p.toLowerCase().replace(/\s/g, '').includes(qn) ||
    numericPinyin(w).replace(/\s/g, '').startsWith(qn) || w.m.toLowerCase().includes(q));
  return list;
}
function renderDictRows() {
  const tb = $('#drows'); if (!tb) return;
  const rank = {}; CORE_ORDER.forEach((id, i) => rank[id] = i + 1);
  const list = dictList();
  const shown = list.slice(0, 400);
  tb.innerHTML = shown.map(w => { const [s, cls] = statusOf(w.id);
    return `<tr class="rowc" data-word="${w.id}"><td class="mono faint">${rank[w.id] || 'AI'}</td><td><span class="hzo">${hanziHTML(w)}</span></td><td>${pinyinHTML(w.s)}</td><td>${esc(w.m)}</td><td class="faint">${w.l === SPOKEN_LV ? '💬 ' + KIND_LABEL[SPOKEN_BY_ID[w.id].kind][0] : w.l ? 'HSK ' + w.l + (SPOKEN_BY_ID[w.id] ? ' 💬' : '') : 'AI'}</td><td class="${cls}" style="font-size:13px">${s}${S.cards[w.id] && S.cards[w.id].leech ? ' 🩹' : ''}</td></tr>`; }).join('')
    + (list.length > shown.length ? `<tr><td colspan="6" class="muted" style="text-align:center">${list.length - shown.length} more, refine your search</td></tr>` : '')
    + (!list.length ? `<tr><td colspan="6" class="muted" style="text-align:center;padding:30px">No matches</td></tr>` : '');
  bindCommon(tb);
}

/* ---------- lab ---------- */
function renderLab(m) {
  const lv = levelInfo().level;
  const read = NOTES.filter(n => S.notesRead[n.id]).length, unlocked = NOTES.filter(n => n.lv <= lv).length;
  m.innerHTML = `<h2>Lab · 实验室 <span class="muted" style="font-weight:400;font-size:15px">shíyànshì</span></h2>
    <p class="muted">Free-play mini-games and the research notes you've unlocked. Each note teaches one LLM idea and its Chinese term.</p>
    <h3 style="margin-top:20px">Mini-games</h3>
    <div class="games"><button class="gamebtn" id="gymlab"><div class="gz">练习</div><div class="gt">Sentence gym</div><div class="muted" style="font-size:12px">Build, translate, listen and dictation drills with sentences you can understand (${eligibleSentCount()} available).</div></button><button class="gamebtn" id="chatlab"><div class="gz">对话</div><div class="gt">Chat gym</div><div class="muted" style="font-size:12px">Dialogue practice: pick the reply, the particle, or listen (${eligibleDlgCount()} dialogues available).</div></button>${Object.entries(GAMES).map(([k, g]) => { const un = gameUnlocked(k), av = un && g.available(); const rec = S.games[k];
      return `<button class="gamebtn" data-g="${k}" ${av ? '' : 'disabled'}><div class="gz">${g.zh}</div><div class="gt">${esc(g.title)}</div><div class="muted" style="font-size:12px">${un ? (av ? esc(g.desc) : 'Learn a few more words first') : '🔒 unlocks at Lv ' + NOTE_BY_ID[g.note].lv}</div>${rec ? `<div class="faint mono" style="font-size:11px;margin-top:6px">played ${rec.plays}× · best ${rec.best}</div>` : ''}</button>`; }).join('')}
      <button class="gamebtn" id="ft" ${seenIds().length ? '' : 'disabled'}><div class="gz">微调</div><div class="gt">Fine-tune (LoRA mode)</div><div class="muted" style="font-size:12px">Drill your 15 weakest words without touching the schedule.</div></button></div>
    <div class="row"><h3 style="margin:0">Research notes</h3><span class="spacer"></span><span class="muted" style="font-size:13px">${read}/${unlocked} read · ${NOTES.length} total</span></div>
    <div class="notes" style="margin-top:12px">${NOTES.map(noteCardHTML).join('')}</div>
    ${phrasebookHTML()}
    ${idiomCollectionHTML()}`;
  bindCommon(m);
  $('#chatlab').addEventListener('click', () => startChatGym());
  $$('[data-g]', m).forEach(b => b.addEventListener('click', () => runGame(b.dataset.g, false)));
  $('#ft').addEventListener('click', () => startEpoch({ practice: true }));
  $('#gymlab').addEventListener('click', () => gymModal());
}

/* ---------- stats ---------- */
function barChart(vals, labels, color = 'var(--jade)', h = 150) {
  const W = 900, P = 26, max = Math.max(1, ...vals);
  const bw = (W - P * 2) / vals.length;
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" style="height:${h}px">
    <line x1="${P}" x2="${W - P}" y1="${h - 20}" y2="${h - 20}" stroke="var(--line)"/>
    ${vals.map((v, i) => { const bh = v / max * (h - 40); return `<rect x="${P + i * bw + 2}" y="${h - 20 - bh}" width="${Math.max(2, bw - 4)}" height="${bh}" rx="3" fill="${color}"><title>${labels[i]}: ${v}</title></rect>${vals.length <= 31 && (i % Math.ceil(vals.length / 10) === 0) ? `<text x="${P + i * bw + bw / 2}" y="${h - 6}" text-anchor="middle">${labels[i]}</text>` : ''}`; }).join('')}
    <text x="2" y="14">${max}</text></svg>`;
}
function renderStats(m) {
  const t = today();
  const seen = seenIds();
  const young = seen.filter(id => S.cards[id].s < 21 && !S.cards[id].susp).length, mature = seen.filter(id => S.cards[id].s >= 21 && !S.cards[id].susp).length;
  const totalMs = Object.values(S.days).reduce((a, d) => a + (d.ms || 0), 0);
  const last30 = [...Array(30)].map((_, i) => t - 29 + i);
  const fc = [...Array(14)].map((_, i) => t + i);
  const forecast = fc.map(d => seen.filter(id => { const c = S.cards[id]; return !c.susp && (c.due === d || (d === t && c.due < t)); }).length);
  const avgR = seen.length ? seen.reduce((a, id) => a + FSRS.retrievability(S.cards[id]), 0) / seen.length : 0;
  const weeks = 20, start = t - (weeks * 7 - 1) - ((new Date(t * DAY_MS).getUTCDay() + 6) % 7);
  const cal = [...Array(weeks * 7 + ((new Date(t * DAY_MS).getUTCDay() + 6) % 7) + 1)].map((_, i) => start + i);
  const maxDay = Math.max(1, ...cal.map(d => S.days[d] ? S.days[d].rev + S.days[d].new : 0));
  m.innerHTML = `<h2>Stats · 统计 <span class="muted" style="font-weight:400;font-size:15px">tǒngjì</span></h2>
    <div class="grid g4" style="margin:14px 0 16px">
      <div class="card stat"><span class="v">${seen.length}</span><span class="k">vocab</span><span class="s">${young} young · ${mature} mature · ${sentSeenCount()} sentences · ${dlgSeenCount()} chats · ${idiomSeenCount()} 成语</span></div>
      <div class="card stat"><span class="v">${(avgR * 100).toFixed(0)}%</span><span class="k">avg recall now</span><span class="s">FSRS estimate, target ${(S.settings.retention * 100).toFixed(0)}%</span></div>
      <div class="card stat"><span class="v">${S.epochs.length}</span><span class="k">epochs</span><span class="s">${Math.round(totalMs / 60000)} min total</span></div>
      <div class="card stat"><span class="v">${streak()}</span><span class="k">day streak</span><span class="s">${S.xp} XP total</span></div>
    </div>
    <div class="card" style="margin-bottom:16px"><h3>Training loss per epoch</h3>${S.epochs.length > 1 ? lossChart(S.epochs.slice(-60)) : '<p class="muted">Train a couple of epochs to see your loss curve.</p>'}
      <p class="faint" style="font-size:12px;margin:6px 0 0">Loss = −mean log p(correct), with p ≈ 0.15 / 0.55 / 0.85 / 0.95 for Again / Hard / Good / Easy. Lower is better; it rises a bit when old words come back for review, just like validation loss on harder data.</p></div>
    <div class="grid g2">
      <div class="card"><h3>Reviews, last 30 days</h3>${barChart(last30.map(d => S.days[d] ? S.days[d].rev + S.days[d].new : 0), last30.map(d => dayLabel(d).slice(5)))}</div>
      <div class="card"><h3>Due forecast, next 14 days</h3>${barChart(forecast, fc.map((d, i) => i === 0 ? 'today' : '+' + i), 'var(--gold)')}</div>
    </div>
    <div class="card" style="margin-top:16px"><h3>Activity</h3><div class="heatcal">${cal.map(d => { const v = S.days[d] ? S.days[d].rev + S.days[d].new : 0; return `<i title="${dayLabel(d)}: ${v}" style="${v ? `background:color-mix(in srgb, var(--jade) ${Math.round(25 + 75 * v / maxDay)}%, var(--card2))` : ''}${d > t ? ';opacity:.25' : ''}"></i>`; }).join('')}</div></div>
    <div class="card" style="margin-top:16px"><h3>Memory map · stability per word</h3><div style="display:flex;flex-wrap:wrap;gap:3px">${(() => { const pre = CORE_ORDER.slice(0, Math.max(150, seen.length + 30)); const ps = new Set(pre); return pre.concat(CORE_ORDER.filter(id => !ps.has(id) && isSeen(id))); })().map(id => { const c = S.cards[id]; const s = c && c.st ? c.s : 0;
      const col = !s ? 'var(--card2)' : s < 3 ? 'var(--t1)' : s < 7 ? 'var(--t2)' : s < 21 ? 'var(--t3)' : 'var(--t4)';
      return `<span data-word="${id}" title="${esc(WORDS[id].h)} · ${s ? 'S ' + fmtIvl(s) : 'new'}" style="width:14px;height:14px;border-radius:3px;background:${col};cursor:pointer;${c && c.susp ? 'opacity:.3' : ''}"></span>`; }).join('')}</div>
      <p class="faint" style="font-size:12px;margin:8px 0 0">red &lt;3d · orange &lt;7d · green &lt;21d · blue mature · grey new, in learning order</p></div>`;
  bindCommon(m);
}

/* ---------- settings ---------- */
function segCtl(key, opts) { return `<div class="seg-ctl" data-set="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(S.settings[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`; }
function renderSettings(m) {
  const st = S.settings;
  const voices = TTS.list();
  m.innerHTML = `<h2>Settings · 设置 <span class="muted" style="font-weight:400;font-size:15px">shèzhì</span></h2>
    <div class="card" style="margin-top:14px"><h3>Training hyperparameters · 超参数</h3><div class="set">
      <label>New words per day<span class="d">Anki default is 20; 10 keeps epochs near 10 minutes.</span></label>
      <div class="row"><input type="range" min="0" max="30" step="1" value="${st.newPerDay}" data-num="newPerDay" style="flex:1"><b class="mono" id="v-newPerDay">${st.newPerDay}</b></div>
      <label>New sentences per day<span class="d">Sentence cards only use words you already know. 0 turns them off.</span></label>
      <div class="row"><input type="range" min="0" max="15" step="1" value="${st.newSentPerDay}" data-num="newSentPerDay" style="flex:1"><b class="mono" id="v-newSentPerDay">${st.newSentPerDay}</b></div>
      <label>New idioms<span class="d">成语 cards are a rare side dish: they start once you know ${IDIOM_MIN_VOCAB} words, and at most 3 idiom reviews come up per epoch.</span></label>${segCtl('idiomEvery', [[0, 'Off'], [7, 'Weekly'], [3, 'Every 3 days'], [1, 'Daily']])}
      <label>New dialogues per day<span class="d">Chat cards: short two-person exchanges made only of words you know. 0 turns them off.</span></label>
      <div class="row"><input type="range" min="0" max="10" step="1" value="${st.newDlgPerDay}" data-num="newDlgPerDay" style="flex:1"><b class="mono" id="v-newDlgPerDay">${st.newDlgPerDay}</b></div>
      <label>Chat words per epoch<span class="d">Spoken reactions, mood particles, fillers and key function words (对对对, 好的, 吧, 啊, 也, 就…), mixed into your new words.</span></label>
      <div class="row"><input type="range" min="0" max="6" step="1" value="${st.chatPerEpoch}" data-num="chatPerEpoch" style="flex:1"><b class="mono" id="v-chatPerEpoch">${st.chatPerEpoch}</b></div>
      <label>Extra reviews for chat words<span class="d">Schedules chat words for ${Math.round(CHAT_RETENTION * 100)}% retention instead of your desired retention: about twice as many reviews.</span></label>${segCtl('chatBoost', [[true, 'On'], [false, 'Off']])}
      <label>Sentence building<span class="d">Tiles, or type with the Chinese keyboard (Windows: add "Chinese (Simplified) - Microsoft Pinyin" under Language) or plain pinyin.</span></label>${segCtl('sentInput', [['tiles', '🧩 Word tiles'], ['type', '⌨ Typing']])}
      <label>Catch-up mode<span class="d">After a break, new words are throttled until the review pile shrinks, epochs review at most ~${reviewCap()} words (most-forgotten first), and new words enter one at a time.</span></label>${segCtl('catchUp', [[true, 'On'], [false, 'Off']])}
      <label>Desired retention<span class="d">FSRS schedules each review when recall is predicted to drop to this. Higher = more reviews.</span></label>
      <div class="row"><input type="range" min="0.8" max="0.97" step="0.01" value="${st.retention}" data-num="retention" style="flex:1"><b class="mono" id="v-retention">${Math.round(st.retention * 100)}%</b></div>
      <label>Epoch goal (minutes)</label>
      <div class="row"><input type="range" min="5" max="30" step="1" value="${st.targetMin}" data-num="targetMin" style="flex:1"><b class="mono" id="v-targetMin">${st.targetMin}</b></div>
      <label>Temperature<span class="d">Softmax temperature of the epoch planner. Low = mostly cards, high = more mini-games.</span></label>
      <div><div class="row"><input type="range" min="0.1" max="2.5" step="0.05" value="${st.temperature}" data-num="temperature" style="flex:1"><b class="mono" id="v-temperature">${st.temperature.toFixed(2)}</b></div><div class="tbars" id="tbars"></div></div>
      <label>Card style</label>${segCtl('cardStyle', [['game', 'Game (mixed modes)'], ['classic', 'Classic flip (Anki)']])}
      <label>AI-term cards<span class="d">Adds the Chinese word for each unlocked LLM concept (量化, 注意力…).</span></label>${segCtl('aiTerms', [[true, 'On'], [false, 'Off']])}
      <label>Pinyin hint on reading cards</label>${segCtl('pinyinHint', [[false, 'Off'], [true, 'On']])}
    </div></div>
    <div class="card" style="margin-top:16px"><h3>Audio · 声音</h3><div class="set">
      <label>Chinese voice<span class="d">${voices.length ? voices.length + ' Chinese voice(s) found' : 'None found. Windows: Settings → Time &amp; language → Speech → Add voices → Chinese (Simplified). Edge has natural online voices.'}</span></label>
      <div class="row"><select id="voice" style="flex:1">${voices.map(v => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === st.voice ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('') || '<option>no Chinese voice</option>'}</select>${speakBtn('你好，我在学习汉语。')}</div>
      <label>Speech rate</label>
      <div class="row"><input type="range" min="0.5" max="1.2" step="0.05" value="${st.rate}" data-num="rate" style="flex:1"><b class="mono" id="v-rate">${st.rate.toFixed(2)}</b></div>
      <label>Autoplay word audio</label>${segCtl('autoplay', [[true, 'On'], [false, 'Off']])}
      <label>Sound effects</label>${segCtl('sfx', [[true, 'On'], [false, 'Off']])}
    </div></div>
    <div class="card" style="margin-top:16px"><h3>Look · 外观</h3><div class="set">
      <label>Theme</label>${segCtl('theme', [['dark', 'Dark'], ['light', 'Paper'], ['auto', 'System']])}
      <label>Character font<span class="d">楷体 looks handwritten, 黑体 is what you see on screens. Learn both.</span></label>${segCtl('font', [['kai', '楷体 Kai'], ['sans', '黑体 Sans'], ['serif', '宋体 Song']])}
    </div></div>
    <div class="card" style="margin-top:16px"><h3>Data · 数据</h3>
      <p class="muted" style="margin-top:0">Progress is stored in this browser (localStorage) for this file. Export a backup now and then, especially before clearing browser data or moving the file.</p>
      <div class="row"><button class="btn" id="exp">Export backup</button><label class="btn" style="cursor:pointer">Import backup<input type="file" id="imp" accept=".json,application/json" hidden></label><span class="spacer"></span><button class="btn" id="reset" style="color:var(--bad)">Reset everything…</button></div>
    </div>
    <p class="faint" style="font-size:12px;margin-top:20px">Vocabulary: ~1100 core words (HSK 2.0 levels 1–4) in a frequency-informed learning order, plus AI terms. Scheduling: FSRS-5 with default parameters. Audio: your system's speech voices.</p>`;
  $$('[data-num]', m).forEach(inp => inp.addEventListener('input', () => {
    const k = inp.dataset.num, v = +inp.value; st[k] = v;
    const lab = $('#v-' + k);
    if (lab) lab.textContent = k === 'retention' ? Math.round(v * 100) + '%' : (k === 'temperature' || k === 'rate') ? v.toFixed(2) : v;
    if (k === 'temperature') tempBars();
    save();
  }));
  $$('[data-set]', m).forEach(ctl => $$('button', ctl).forEach(b => b.addEventListener('click', () => {
    const k = ctl.dataset.set; let v = b.dataset.v; if (v === 'true') v = true; else if (v === 'false') v = false; else if (/^\d+$/.test(v)) v = +v;
    st[k] = v; save(); applyTheme();
    $$('button', ctl).forEach(x => x.classList.toggle('on', x === b));
  })));
  const vs = $('#voice'); vs.addEventListener('change', () => { st.voice = vs.value; save(); TTS.speak('你好'); });
  bindCommon(m);
  $('#exp').addEventListener('click', exportSave);
  $('#imp').addEventListener('change', e => importSave(e.target.files[0]));
  $('#reset').addEventListener('click', () => {
    const mm = modal(`<h2>Reset everything?</h2><p>This deletes all progress in this browser: cards, XP, epochs. Export a backup first if unsure.</p>
      <div class="row" style="margin-top:16px"><span class="spacer"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="doreset">Delete all progress</button></div>`, null, { noEnter: true });
    $('#doreset', mm.bg).addEventListener('click', () => { S = freshState(); S.welcomed = true; save(); mm.close(); applyTheme(); go('home'); toast('Weights re-initialized.'); });
  });
  tempBars();
}
function tempBars() {
  const el = $('#tbars'); if (!el) return;
  const opts = [['cards', 1.5], ...Object.entries(GAMES).map(([k, g]) => [k, g.logit])];
  const p = softmax(opts.map(o => o[1]), S.settings.temperature);
  el.innerHTML = opts.map(([k], i) => `<div class="r"><span>${k === 'cards' ? 'keep studying' : esc(GAMES[k].title)}</span><span class="b"><i style="width:${(p[i] * 100).toFixed(1)}%"></i></span><span class="mono">${(p[i] * 100).toFixed(0)}%</span></div>`).join('')
    + '<div class="faint" style="font-size:11px">p<sub>i</sub> = softmax(z<sub>i</sub> / T), checked every few cards (locked games are skipped)</div>';
}
function exportTSV() {
  const list = dictList();
  const rows = list.map(w => { const ex = exampleFor(w.id);
    return [w.h, w.p, w.m, w.l === SPOKEN_LV ? 'spoken' : w.l ? 'HSK' + w.l + (SPOKEN_BY_ID[w.id] ? ' chat' : '') : 'AI', ex ? sentText(ex) : '', ex ? ex.en : ''].map(x => String(x).replace(/[\t\n]/g, ' ')).join('\t'); });
  const head = '#separator:tab\n#html:false\n#columns:Hanzi\tPinyin\tMeaning\tTags\tExample\tExample (English)\n#tags column:4\n';
  const blob = new Blob([head + rows.join('\n')], { type: 'text/tab-separated-values' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `xiaomoxing-words-${list.length}.txt`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  toast(`Exported ${list.length} words. In Anki: File → Import.`);
}
function exportSave() {
  S.lastBackup = Date.now(); save();
  const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `xiaomoxing-backup-${dayLabel(today())}.json`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  toast('Backup downloaded');
}
function importSave(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const st = JSON.parse(r.result);
      if (!st || typeof st.cards !== 'object' || !st.settings) throw new Error('not a backup');
      const mm = modal(`<h2>Import backup?</h2><p>This replaces current progress with the backup (${Object.keys(st.cards).length} cards, ${st.xp || 0} XP).</p>
        <div class="row" style="margin-top:16px"><span class="spacer"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="doimp">Import</button></div>`, null, { noEnter: true });
      $('#doimp', mm.bg).addEventListener('click', () => { localStorage.setItem(SAVE_KEY, JSON.stringify(st)); S = loadState(); save(); mm.close(); applyTheme(); go('home'); toast('Backup restored'); });
    } catch (e) { toast('That file is not a 小模型 backup.', 'warn'); }
  };
  r.readAsText(file);
}

/* ---------- init ---------- */
function init() {
  applyTheme();
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme);
  $$('.nav button').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
  $('.logo').addEventListener('click', () => go('home'));
  document.addEventListener('voices', () => { if (VIEW === 'settings') renderSettings($('#main')); });
  go('home');
}
document.addEventListener('DOMContentLoaded', init);

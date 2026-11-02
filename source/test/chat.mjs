// Chat fine-tuning: chat-word stream, retention boost, dialogue cards (all modes), chat gym, Particles game,
// usage notes, dictionary filter, lab phrasebook, settings, and the one-time "what's new" for old saves.
import { chromium } from 'playwright';
import fs from 'fs';
const URL_ = new URL('../dist/xiaomoxing.html', import.meta.url).href;
const SHOTS = new URL('./shots/', import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 920 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message + '\n' + e.stack));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const ok = (cond, msg) => { if (!cond) { console.log('FAIL', msg); process.exitCode = 1; } else console.log('ok  ', msg); };
await page.goto(URL_);

// 1) an OLD save (no dcards / news / chat settings) → defaults filled + what's new shows once
await page.evaluate(() => {
  localStorage.clear();
  const old = freshState(); delete old.dcards; delete old.news; delete old.settings.newDlgPerDay; delete old.settings.chatPerEpoch; delete old.settings.chatBoost;
  old.welcomed = true;
  const t = today(), now = Date.now();
  CORE_ORDER.slice(0, 120).forEach((id, i) => { old.cards[id] = { st: 2, s: 5 + i % 20, d: 5, last: now - 3 * 864e5, due: t + 1 + i % 5, reps: 3, lapses: 0 }; });
  localStorage.setItem(SAVE_KEY, JSON.stringify(old));
});
await page.reload(); await page.waitForTimeout(300);
await page.evaluate(() => { TTS.available = () => true; });
ok(await page.isVisible('text=Chat fine-tuning 💬'), "what's new modal shows for an old save");
await page.screenshot({ path: SHOTS + '70-whatsnew.png' });
await page.keyboard.press('Enter'); await page.waitForTimeout(200);
ok(!(await page.isVisible('text=Chat fine-tuning 💬')), "what's new closes");
const st = await page.evaluate(() => ({ s: S.settings, dc: typeof S.dcards, news: S.news.chat > 0 }));
ok(st.s.newDlgPerDay === 3 && st.s.chatPerEpoch === 3 && st.s.chatBoost === true && st.dc === 'object' && st.news, 'old save gets the new defaults');
await page.reload(); await page.waitForTimeout(200);
ok(!(await page.isVisible('text=Chat fine-tuning 💬')), "what's new only once");

// 2) chat-word stream + retention boost
const q = await page.evaluate(() => {
  const nq = newQueue(10);
  const chat = nq.filter(id => SPOKEN_BY_ID[id]);
  const pos = nq.map((id, i) => SPOKEN_BY_ID[id] ? i : -1).filter(i => i >= 0);
  const chatId = SPOKEN.find(x => !isSeen(x.id)).id, plainId = CORE_ORDER.find(id => !SPOKEN_BY_ID[id] && !isSeen(id));
  return { n: nq.length, chat: chat.map(id => WORDS[id].h), pos, rc: retFor(chatId), rp: retFor(plainId), first: chat[0] === SPOKEN.find(x => !isSeen(x.id)).id };
});
ok(q.n === 10 && q.chat.length === 3 && q.first, `3 chat words in a 10-word queue, in spoken.tsv order: ${q.chat.join(' ')} at ${q.pos}`);
ok(q.pos[0] > 0 && q.pos[1] - q.pos[0] > 1, 'chat words are spread out, not bunched');
ok(q.rc === 0.95 && q.rp === S_ret(q), 'chat words get 95% retention');
function S_ret() { return 0.9; }
const iv = await page.evaluate(() => {
  const a = { st: 2, s: 10, d: 5, last: Date.now() - 10 * 864e5, reps: 3, lapses: 0 }, b = Object.assign({}, a);
  const chatId = SPOKEN.find(x => x.kind === 'func').id, plainId = CORE_ORDER.find(id => !SPOKEN_BY_ID[id]);
  S.cards[chatId] = a; S.cards[plainId] = b;
  const r = [applyGrade(chatId, 3), applyGrade(plainId, 3)];
  delete S.cards[chatId]; delete S.cards[plainId];
  S.settings.chatBoost = false; const off = retFor(chatId); S.settings.chatBoost = true;
  return { r, off };
});
ok(iv.r[0] < iv.r[1] && iv.off === 0.9, `chat word interval shorter (${iv.r[0]}d vs ${iv.r[1]}d); boost off → 90%`);

// 3) learn the first 25 chat words so dialogues unlock, then check counts
await page.evaluate(() => {
  const t = today(), now = Date.now();
  SPOKEN.slice(0, 25).forEach((x, i) => { S.cards[x.id] = { st: 2, s: 3 + i % 6, d: 5, last: now - 2 * 864e5, due: t + 2, reps: 2, lapses: 0, first: now - 2 * 864e5 }; });
  save();
});
await page.reload(); await page.waitForTimeout(200);
await page.evaluate(() => { TTS.available = () => true; });
const counts = await page.evaluate(() => ({ el: eligibleDlgCount(), nw: newDlgKeys(3), parts: particlePool().length }));
ok(counts.el >= 15 && counts.nw.length === 3, `dialogues eligible: ${counts.el}, new today: ${counts.nw.length}`);
ok(counts.parts >= 6, `particle items playable: ${counts.parts}`);
await page.screenshot({ path: SHOTS + '71-home.png' });
ok(await page.isVisible('#chatgym'), 'Chat gym button on the dashboard');

// 4) every dialogue mode via the chat gym
const keyWithParticle = await page.evaluate(() => DLGS.find(d => dlgEligible(d) && particleSlot(d) && d.t.length === 2).key);
for (const mode of ['read', 'reply', 'particle', 'listen']) {
  await page.evaluate(([k, m]) => { startChatGym(3); showDialogue({ dkey: k, kind: 'dgym', forceMode: m }); }, [keyWithParticle, mode]);
  await page.waitForTimeout(200);
  const label = await page.textContent('.qcard .mode');
  ok(label.includes({ read: 'read the chat', reply: 'pick the reply', particle: 'mood particle', listen: 'listen' }[mode]), `mode ${mode} renders`);
  if (mode === 'read' || mode === 'reply' || mode === 'particle') { await page.keyboard.press('p'); await page.waitForTimeout(100); }
  await page.screenshot({ path: SHOTS + `72-${mode}-q.png` });
  if (mode === 'read') await page.keyboard.press('Enter');
  else {
    const right = await page.evaluate(() => [...document.querySelectorAll('.opt')].length);
    ok(right >= 2, `${mode}: ${right} options`);
    await page.keyboard.press('1');
  }
  await page.waitForTimeout(200);
  ok(await page.isVisible('#grades:not(.hidden)'), `${mode}: reveal + grades`);
  ok(await page.isVisible('.reveal .chat'), `${mode}: full chat with pinyin + English on reveal`);
  await page.screenshot({ path: SHOTS + `73-${mode}-reveal.png`, fullPage: true });
  await page.keyboard.press(' '); await page.waitForTimeout(150);
}
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
await page.screenshot({ path: SHOTS + '74-chatgym-summary.png', fullPage: true });
ok(await page.isVisible('text=Dialogues this epoch'), 'summary lists dialogues');
await page.keyboard.press('Enter'); await page.waitForTimeout(150);

// particle mask hides every copy (好啊好啊 → both 啊 masked)
const masked = await page.evaluate(() => { const d = DLGS.find(x => x.t.some(t => t.key === '好啊好啊！')); const s = particleSlot(d); return [...s[1]].length; });
ok(masked === 2, 'doubled particles are both masked');

// 5) a real epoch: new dialogues come as "read" first, grading writes S.dcards
await page.evaluate(() => { S.settings.newPerDay = 0; S.settings.newSentPerDay = 0; save(); });
await page.evaluate(() => startEpoch());
let seenDlg = 0, steps = 0;
while (steps++ < 60) {
  const v = await page.evaluate(() => VIEW);
  if (v !== 'session' && v !== 'game') break;
  const kind = await page.evaluate(() => { const m = document.querySelector('.qcard .mode, .gamehead'); return m ? m.textContent : ''; });
  if (kind.includes('mini-game')) { await page.click('#gskip'); await page.waitForTimeout(80); continue; }
  if (kind.startsWith('chat')) {
    seenDlg++;
    if (seenDlg === 1) { ok(kind.includes('read the chat') && kind.includes('new dialogue'), 'first view of a new dialogue = read mode'); await page.screenshot({ path: SHOTS + '75-epoch-dialogue.png' }); }
    if (kind.includes('read')) await page.keyboard.press('Enter'); else await page.keyboard.press('1');
    await page.waitForTimeout(120); await page.keyboard.press('3'); await page.waitForTimeout(120); continue;
  }
  // other cards: answer 1, then accept
  await page.keyboard.press('Enter'); await page.waitForTimeout(60);
  await page.keyboard.press('1'); await page.waitForTimeout(80);
  await page.keyboard.press('3'); await page.waitForTimeout(80);
  await page.keyboard.press(' '); await page.waitForTimeout(80);
}
const after = await page.evaluate(() => ({ dc: Object.values(S.dcards).filter(c => c.st > 0).length, dNew: dayStats().dNew || 0 }));
ok(seenDlg >= 3 && after.dc >= 3 && after.dNew === 3, `epoch trained ${after.dc} dialogues (dNew ${after.dNew}, views ${seenDlg})`);
await page.evaluate(() => { if (SESS) endEpoch(true, true); go('home'); });

// 6) intro card of a chat word: kind pill, usage note, dialogue example
await page.evaluate(() => { S.settings.newPerDay = 10; S.settings.chatPerEpoch = 3; save(); startEpoch(); });
let found = false;
for (let i = 0; i < 40 && !found; i++) {
  const isChatIntro = await page.evaluate(() => !!document.querySelector('.qcard .newbadge') && !!document.querySelector('.qcard .usage'));
  if (isChatIntro) { found = true; break; }
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await page.evaluate(() => { go('home'); startEpoch(); }); await page.waitForTimeout(100);
  // skip forward to the next intro card
  for (let k = 0; k < 6; k++) {
    const intro = await page.evaluate(() => !!document.querySelector('.qcard .newbadge'));
    if (intro && await page.evaluate(() => !!document.querySelector('.qcard .usage'))) { found = true; break; }
    if (intro) { await page.keyboard.press(' '); await page.waitForTimeout(80); continue; }
    break;
  }
}
ok(found, 'chat word intro card has a usage note');
if (found) {
  ok(await page.isVisible('.qcard .chatex'), 'chat word intro shows a dialogue example');
  await page.screenshot({ path: SHOTS + '76-chatword-intro.png', fullPage: true });
}
await page.evaluate(() => { if (SESS) endEpoch(true, true); });

// 7) Particles mini-game, played to the end
await page.evaluate(() => runGame('particles', false)); await page.waitForTimeout(200);
await page.screenshot({ path: SHOTS + '77-particles.png' });
let sawContrast = false;
for (let r = 0; r < 24 && !(await page.isVisible('#gnext')); r++) {
  const isC = await page.evaluate(() => (document.querySelector('.explain') || {}).textContent.includes('contrast set'));
  if (isC && !sawContrast) { sawContrast = true; await page.screenshot({ path: SHOTS + '78b-contrast-q.png' }); }
  await page.keyboard.press('1'); await page.waitForTimeout(120);
  if (r === 0) await page.screenshot({ path: SHOTS + '78-particles-reveal.png' });
  if (isC && await page.isVisible('.ctable')) await page.screenshot({ path: SHOTS + '78c-contrast-table.png', fullPage: true });
  await page.keyboard.press('Enter'); await page.waitForTimeout(120);
}
ok(sawContrast, 'Particles game includes a contrast set');
ok(await page.isVisible('#gnext'), 'Particles game finishes');
const rec = await page.evaluate(() => S.games.particles);
ok(rec && rec.plays === 1, 'Particles game recorded');
await page.click('#gnext'); await page.waitForTimeout(200);

// 7b) Echo game: yes/no by repeating the verb
ok(await page.evaluate(() => GAMES.echo.available()), `Echo available (${await page.evaluate(() => echoPool().length)} items)`);
await page.evaluate(() => runGame('echo', false)); await page.waitForTimeout(250);
await page.screenshot({ path: SHOTS + '82-echo-q.png' });
for (let r = 0; r < 6; r++) {
  await page.keyboard.press('2'); await page.waitForTimeout(120);
  if (r === 0) await page.screenshot({ path: SHOTS + '83-echo-reveal.png' });
  await page.keyboard.press('Enter'); await page.waitForTimeout(120);
}
ok(await page.isVisible('#gnext'), 'Echo game finishes');
await page.click('#gnext'); await page.waitForTimeout(200);
const cs = await page.evaluate(() => ({ n: CONTRASTS.length, pool: contrastPool().length, echo: ECHO.length }));
ok(cs.n === 12 && cs.pool >= 3 && cs.echo === 24, `contrast sets ${cs.n} (${cs.pool} playable), echo items ${cs.echo}`);

// 8) lab phrasebook, dictionary filter, word modal, settings, note
await page.evaluate(() => go('lab')); await page.waitForTimeout(150);
ok(await page.isVisible('text=Chat phrasebook · 口语'), 'lab phrasebook');
await page.screenshot({ path: SHOTS + '79-lab.png', fullPage: true });
await page.evaluate(() => { go('dict'); }); await page.selectOption('#dlv', 'chat'); await page.waitForTimeout(150);
const rows = await page.$$eval('#drows tr', r => r.length);
ok(rows === await page.evaluate(() => SPOKEN.length) && rows >= 69, `dictionary chat filter: ${rows} rows`);
await page.evaluate(() => openWord(SPOKEN.find(x => x.kind === 'vulgar').id)); await page.waitForTimeout(150);
ok(await page.isVisible('.modal .pill.warn'), 'vulgar word is labeled');
await page.screenshot({ path: SHOTS + '80-word-vulgar.png' });
await page.keyboard.press('Escape');
await page.evaluate(() => go('settings')); await page.waitForTimeout(150);
ok(await page.isVisible('#v-newDlgPerDay') && await page.isVisible('#v-chatPerEpoch'), 'settings sliders');
await page.evaluate(() => { S.xp = 5000; openNote('induction'); }); await page.waitForTimeout(150);
ok(await page.isVisible('text=Induction heads: copying from context'), 'induction note opens');
await page.keyboard.press('Escape'); await page.waitForTimeout(100);
await page.evaluate(() => { openNote('sft'); }); await page.waitForTimeout(150);
await page.screenshot({ path: SHOTS + '81-note-sft.png' });
ok(await page.isVisible('text=Chat fine-tuning (SFT)'), 'SFT research note opens');

console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
if (errors.length) process.exitCode = 1;
await browser.close();

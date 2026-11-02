import { chromium } from 'playwright';
const URL_ = new URL('../dist/xiaomoxing.html', import.meta.url).href;
const SHOTS = new URL('./shots/', import.meta.url).pathname;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 920 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message + '\n' + e.stack));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(URL_);
await page.evaluate(() => {
  localStorage.clear();
  S = freshState(); S.welcomed = true;
  const t = today(), now = Date.now();
  CORE_ORDER.slice(0, 80).forEach((id, i) => { S.cards[id] = { st: 2, s: 5 + i % 20, d: 5, last: now - 3 * 86400000, due: t + 1 + i % 5, reps: 3, lapses: 0 }; });
  // a few sentence cards already learned and due today
  const el = SENTS.filter(sentEligible).slice(0, 6);
  el.forEach((s, i) => { S.scards[s.key] = { st: 2, s: [1, 5, 20, 2, 8, 30][i], d: 5, last: now - 2 * 86400000, due: t, reps: 2, lapses: 0 }; });
  save();
});
await page.reload(); await page.waitForTimeout(300);
await page.evaluate(() => { TTS.available = () => true; });
await page.screenshot({ path: SHOTS + '50-home-sentences.png' });

// force each sentence mode once via the gym, screenshot question + reveal
const modes = ['build', 'trans', 'listen', 'dict', 'ltrans'];
for (const mode of modes) {
  await page.evaluate(m => startGym(m, false, 3), mode);
  await page.waitForTimeout(250);
  await page.screenshot({ path: SHOTS + `51-${mode}-q.png` });
  if (mode === 'build') {
    // solve with tiles using the gold order
    const order = await page.evaluate(() => {
      const en = document.querySelector('.prompt-en').textContent;
      const s = SENTS.find(x => x.en === en && sentEligible(x));
      const gold = s.z.filter((t, i) => s.w[i] >= 0);
      const tiles = [...document.querySelectorAll('[data-ti]')].map(b => b.lastChild.textContent);
      const used = new Set(); return gold.map(g => { const j = tiles.findIndex((t, k) => t === g && !used.has(k)); used.add(j); return j; });
    });
    for (const j of order) { await page.click(`[data-ti="${j}"]`); await page.waitForTimeout(30); }
  } else if (mode === 'trans') {
    await page.fill('#ein', 'something like this'); await page.keyboard.press('Enter');
  } else if (mode === 'listen') {
    await page.keyboard.press('2');
  } else if (mode === 'dict') {
    // type the correct pinyin without tones for a perfect letters match
    const py = await page.evaluate(() => { const key = SESS && SESS.main.length >= 0 ? null : null; return null; });
    await page.fill('#sin', 'wo3 shi4 xue2sheng'); await page.keyboard.press('Enter');
  } else if (mode === 'ltrans') {
    await page.keyboard.press('Enter');
  }
  await page.waitForTimeout(250);
  await page.screenshot({ path: SHOTS + `52-${mode}-reveal.png`, fullPage: true });
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
}
// IME-style hanzi typing in build mode
await page.evaluate(() => { S.settings.sentInput = 'type'; startGym('build', false, 2); });
await page.waitForTimeout(200);
const target = await page.evaluate(() => { const en = document.querySelector('.prompt-en').textContent; return SENTS.find(x => x.en === en && sentEligible(x)).z.join(''); });
await page.fill('#sin', target.slice(0, -2)); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
await page.screenshot({ path: SHOTS + '53-build-typed.png', fullPage: true });
await page.keyboard.press('Escape'); await page.waitForTimeout(150); await page.keyboard.press('Enter');
await page.evaluate(() => { S.settings.sentInput = 'tiles'; save(); });

// stretch gym
await page.evaluate(() => startGym('trans', true, 3));
await page.waitForTimeout(200);
await page.screenshot({ path: SHOTS + '54-stretch-q.png' });
await page.keyboard.press('Enter'); await page.waitForTimeout(200);
await page.screenshot({ path: SHOTS + '54-stretch-reveal.png', fullPage: true });
await page.keyboard.press('Escape'); await page.waitForTimeout(150); await page.keyboard.press('Enter');

// full epoch: walk through everything, count item types
await page.evaluate(() => go('home'));
await page.keyboard.press('Enter'); await page.waitForTimeout(200);
const seen = {}; let stuck = 0; let steps = 0;
for (; steps < 900; steps++) {
  await page.waitForTimeout(40);
  if (await page.$('.modal-bg')) { await page.keyboard.press('Enter'); continue; }
  if (await page.$('#home')) break;
  if (await page.$('#gskip')) { await page.click('#gskip'); continue; }
  if (await page.$('#gotit') || await page.$('#igot')) { await page.keyboard.press(' '); continue; }
  const mode = await page.$eval('.qcard .mode', e => e.textContent).catch(() => '');
  const k = mode.split('·').slice(0, 2).join('·').trim(); seen[k] = (seen[k] || 0) + 1;
  if (await page.$('#grades:not(.hidden)')) { await page.keyboard.press(' '); continue; }
  if (await page.$('[data-ti]:not(.used)')) {
    const j = await page.evaluate(() => {
      const en = document.querySelector('.prompt-en').textContent;
      const s = SENTS.find(x => x.en === en);
      const gold = s.z.filter((t, i) => s.w[i] >= 0);
      const done = document.querySelectorAll('#decout .tokd:not([style])').length;
      const tiles = [...document.querySelectorAll('[data-ti]')];
      const k = tiles.findIndex(b => !b.classList.contains('used') && b.lastChild.textContent === gold[done]);
      return Math.random() < 0.15 ? tiles.findIndex(b => !b.classList.contains('used')) : k;
    });
    await page.click(`[data-ti="${j}"]`); continue;
  }
  if (await page.$('.qcard .opt:not([disabled])')) { await page.keyboard.press('1'); continue; }
  if (await page.$('#sin:not([disabled])')) { await page.fill('#sin', 'ni3 hao3'); await page.keyboard.press('Enter'); continue; }
  if (await page.$('#typein:not([disabled])')) { await page.fill('#typein', 'ni3'); await page.keyboard.press('Enter'); continue; }
  if (await page.$('#ein:not([disabled])')) { await page.keyboard.press('Enter'); continue; }
  if (await page.$('#fliphint')) { await page.keyboard.press(' '); continue; }
  // other card types (chat/dialogue cards from v3): generic answer sequence
  if (await page.$('.qcard')) { await page.keyboard.press('Enter'); await page.waitForTimeout(40); await page.keyboard.press('1'); await page.waitForTimeout(40); await page.keyboard.press('3'); await page.waitForTimeout(40); await page.keyboard.press(' '); stuck++; if (stuck < 40) continue; }
  console.log('stuck', await page.$eval('#main', e => e.innerText.slice(0, 300))); break;
}
await page.waitForTimeout(200);
await page.screenshot({ path: SHOTS + '55-summary.png', fullPage: true });
const st = await page.evaluate(() => ({ scards: Object.keys(S.scards).length, sNew: dayStats().sNew, ep: S.epochs[S.epochs.length - 1] }));
console.log('steps', steps, JSON.stringify(seen));
console.log(JSON.stringify(st));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();

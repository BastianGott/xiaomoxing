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
  localStorage.clear(); S = freshState(); S.welcomed = true; S.xp = xpFor(4);
  const now = Date.now(); CORE_ORDER.slice(0, 60).forEach(id => { S.cards[id] = { st: 2, s: 10, d: 5, last: now - 86400000 * 3, due: today() + 4, reps: 3, lapses: 0 }; });
  // two idioms already known and due
  ['好久不见', '一路平安'].forEach(k => { S.icards[k] = { st: 2, s: 3, d: 5, last: now - 86400000 * 3, due: today(), reps: 2, lapses: 0 }; });
  save();
});
await page.reload(); await page.waitForTimeout(200);
await page.evaluate(() => { TTS.available = () => true; });
await page.screenshot({ path: SHOTS + '70-home.png' });
// epoch: walk it, screenshot idiom items
await page.keyboard.press('Enter'); await page.waitForTimeout(200);
const seen = {}; let stuck = 0; let steps = 0, shots = 0;
for (; steps < 600; steps++) {
  await page.waitForTimeout(30);
  if (await page.$('.modal-bg')) { await page.keyboard.press('Enter'); continue; }
  if (await page.$('#home')) break;
  if (await page.$('#gskip')) { await page.click('#gskip'); continue; }
  if (await page.$('#igot')) { if (!seen.intro) await page.screenshot({ path: SHOTS + '71-idiom-intro.png' }); seen.intro = (seen.intro || 0) + 1; await page.keyboard.press(' '); continue; }
  if (await page.$('#gotit')) { await page.keyboard.press(' '); continue; }
  const mode = await page.$eval('.qcard .mode', e => e.textContent).catch(() => '');
  if (mode.startsWith('idiom')) {
    const k = mode.split('·')[1].trim();
    if (!seen[k] && !(await page.$('#grades:not(.hidden)'))) { await page.screenshot({ path: SHOTS + `72-idiom-${k.replace(/\W+/g, '_')}.png` }); }
    if (await page.$('#grades:not(.hidden)')) { if (!seen['r' + k]) await page.screenshot({ path: SHOTS + `73-idiom-reveal-${k.replace(/\W+/g, '_')}.png`, fullPage: true }); seen['r' + k] = 1; seen[k] = (seen[k] || 0) + 1; await page.keyboard.press(' '); continue; }
  }
  if (await page.$('#grades:not(.hidden)')) { await page.keyboard.press(' '); continue; }
  if (await page.$('[data-ti]:not(.used)')) {
    const j = await page.evaluate(() => { const en = document.querySelector('.prompt-en').textContent; const s = SENTS.find(x => x.en === en); const gold = s.z.filter((t, i) => s.w[i] >= 0);
      const done = document.querySelectorAll('#decout .tokd:not([style])').length; const tiles = [...document.querySelectorAll('[data-ti]')];
      return tiles.findIndex(b => !b.classList.contains('used') && b.lastChild.textContent === gold[done]); });
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
await page.screenshot({ path: SHOTS + '74-summary.png', fullPage: true });
const st = await page.evaluate(() => ({ icards: Object.entries(S.icards).map(([k, c]) => [k, c.st, Math.round(c.s * 10) / 10, c.due - today()]), iNew: dayStats().iNew }));
console.log('epoch steps', steps, JSON.stringify(seen));
console.log(JSON.stringify(st));
// all four quiz modes explicitly
for (const m of ['mean', 'fill', 'recall', 'hear']) {
  await page.evaluate(mm => { window.chooseIdiomMode = () => mm; SESS = { start: Date.now(), main: [{ ikey: '马到成功', kind: 'irev' }], learn: [], step: 0, done: 0, grades: [], xp: 0, nNew: 0, nSentNew: 0, nIdiomNew: 0, words: {}, sents: {}, idioms: {}, practice: false, sinceGame: 0, nextGameAt: 99, games: 0, epochNo: 1 };
    VIEW = 'session'; document.querySelector('#main').innerHTML = '<div class="sessbar" id="sessbar"></div><div class="stage" id="stage"></div>'; nextItem(); }, m);
  await page.waitForTimeout(150);
  await page.screenshot({ path: SHOTS + `75-imode-${m}.png` });
  await page.keyboard.press('Escape'); await page.waitForTimeout(100); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
}
// mini-game with a solver
await page.evaluate(() => runGame('idiom', false)); await page.waitForTimeout(200);
for (let r = 0; r < 6; r++) {
  await page.waitForTimeout(80);
  const kind = await page.evaluate(() => document.querySelector('.explain').textContent.includes('Masked') ? 'fill' : document.querySelector('[data-ti]') ? 'order' : 'mean');
  await page.screenshot({ path: SHOTS + `76-game-${r}-${kind}.png` });
  if (kind === 'order') {
    for (let k = 0; k < 4; k++) {
      const j = await page.evaluate(() => { const m = document.querySelector('.prompt-en').textContent; const x = IDIOMS.find(i => i.m === m); const done = document.querySelectorAll('#idout .tokd').length;
        return [...document.querySelectorAll("[data-ti]")].findIndex(b => !b.classList.contains("used") && b.dataset.c === x.h[done]); });
      await page.click(`[data-ti="${j}"]`);
    }
  } else { await page.keyboard.press('2'); }
  await page.waitForTimeout(100);
  if (r === 0) await page.screenshot({ path: SHOTS + '77-game-reveal.png', fullPage: true });
  await page.keyboard.press('Enter');
}
await page.waitForTimeout(200);
await page.screenshot({ path: SHOTS + '78-game-end.png' });
await page.keyboard.press('Enter'); await page.waitForTimeout(200);
await page.screenshot({ path: SHOTS + '79-lab.png', fullPage: true });
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();

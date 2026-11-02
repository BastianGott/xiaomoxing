import { chromium } from 'playwright';
const url = new URL('../dist/xiaomoxing.html', import.meta.url).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message + '\n' + e.stack));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(url);
await page.evaluate(() => {
  S.welcomed = true; S.xp = xpFor(13) + 120;
  const t = today(), now = Date.now();
  CORE_ORDER.slice(0, 180).forEach((id, i) => {
    const s = Math.max(0.5, 60 * Math.random() ** 2);
    S.cards[id] = { st: 2, s, d: 3 + Math.random() * 5, last: now - Math.random() * s * DAY_MS, due: t + Math.round(Math.random() * 20) - 4, reps: 3, lapses: i % 17 === 0 ? 6 : 0, leech: i % 17 === 0 };
  });
  for (let i = 0; i < 25; i++) { S.epochs.push({ day: t - 25 + i, t: now, ms: 600000, n: 60, nNew: 10, acc: .8, loss: 0.9 - i * 0.02 + Math.random() * 0.1, xp: 400 }); S.days[t - 25 + i] = { rev: 40 + Math.round(Math.random() * 40), new: 10, xp: 400, ms: 600000 }; }
  S.notesRead.tokens = 1; S.quiz.tokens = 1;
  save();
});
await page.reload(); await page.waitForTimeout(300);
await page.screenshot({ path: new URL('./shots/', import.meta.url).pathname + '10-home-adv.png', fullPage: true });
for (const v of ['dict', 'lab', 'stats', 'settings']) {
  await page.click(`.nav button[data-go="${v}"]`); await page.waitForTimeout(200);
  await page.screenshot({ path: `test/shots/11-${v}.png`, fullPage: v !== 'dict' });
}
// dictionary search
await page.click('.nav button[data-go="dict"]'); await page.fill('#dq', 'hao3'); await page.waitForTimeout(150);
await page.screenshot({ path: new URL('./shots/', import.meta.url).pathname + '12-dict-search.png' });
await page.click('tr.rowc'); await page.waitForTimeout(150);
await page.screenshot({ path: new URL('./shots/', import.meta.url).pathname + '13-word-modal.png' });
await page.keyboard.press('Escape');
// note modal
await page.click('.nav button[data-go="lab"]'); await page.waitForTimeout(100);
await page.click('[data-note="gptq"]'); await page.waitForTimeout(150);
await page.keyboard.press('2'); await page.waitForTimeout(100);
await page.screenshot({ path: new URL('./shots/', import.meta.url).pathname + '14-note-gptq.png' });
await page.keyboard.press('Escape'); await page.waitForTimeout(100);

async function playGame(key, solver) {
  await page.evaluate(k => runGame(k, false), key);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `test/shots/20-${key}-start.png` });
  await solver();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `test/shots/21-${key}-end.png`, fullPage: true });
}
await playGame('attention', async () => {
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < 5; k++) {
      const pair = await page.evaluate(() => {
        const qs = [...document.querySelectorAll('[data-q]')].filter(b => !b.classList.contains('done'));
        if (!qs.length) return null;
        const hz = qs[0].querySelector('.hzo').textContent;
        const w = WORDS.find(x => x.h === hz && isSeen(x.id));
        const ks = [...document.querySelectorAll('[data-k]')];
        const j = ks.findIndex(b => b.textContent.slice(1).trim() === w.m || b.textContent.slice(1).trim() === w.p);
        return [qs[0].dataset.q, j];
      });
      if (!pair) break;
      await page.click(`[data-q="${pair[0]}"]`); await page.click(`[data-k="${pair[1]}"]`);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(600);
    if (round === 0) await page.screenshot({ path: new URL('./shots/', import.meta.url).pathname + '20-attention-head2.png' });
  }
});
await playGame('tokenizer', async () => {
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press(' '); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press(' ');
    await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    if (i === 0) await page.screenshot({ path: new URL('./shots/', import.meta.url).pathname + '20-tokenizer-result.png' });
    await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  }
});
await playGame('quantize', async () => {
  for (let i = 0; i < 8; i++) {
    const n = await page.$$eval('.sylbox', x => x.length);
    for (let k = 0; k < n; k++) await page.keyboard.press(String(1 + (k + i) % 4));
    await page.waitForTimeout(400);
    if (i === 0) await page.screenshot({ path: new URL('./shots/', import.meta.url).pathname + '20-quantize-result.png' });
    await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  }
});
await playGame('decoder', async () => {
  for (let i = 0; i < 4; i++) {
    const order = await page.evaluate(() => {
      const en = document.querySelector('.prompt-en').textContent;
      const s = SENTS.find(x => x.en === en);
      const gold = s.z.filter((t, i) => s.w[i] >= 0);
      const tiles = [...document.querySelectorAll('[data-ti]')].map(b => b.lastChild.textContent);
      const used = new Set(); return gold.map(g => { const j = tiles.findIndex((t, k) => t === g && !used.has(k)); used.add(j); return j; });
    });
    if (i === 0) { await page.click(`[data-ti="${order[order.length - 1]}"]`); await page.waitForTimeout(100); await page.screenshot({ path: new URL('./shots/', import.meta.url).pathname + '20-decoder-mid.png' }); }
    for (const j of order) { await page.click(`[data-ti="${j}"]`); await page.waitForTimeout(40); }
    await page.waitForTimeout(150);
    if (i === 0) await page.screenshot({ path: new URL('./shots/', import.meta.url).pathname + '20-decoder-result.png' });
    await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  }
});
// light theme home
await page.evaluate(() => { S.settings.theme = 'light'; applyTheme(); go('home'); });
await page.waitForTimeout(200);
await page.screenshot({ path: new URL('./shots/', import.meta.url).pathname + '30-home-light.png', fullPage: true });
// start an epoch with reviews, take a few screenshots
await page.evaluate(() => { S.settings.theme = 'dark'; applyTheme(); startEpoch(); });
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(50);
  if (await page.$('.modal-bg')) { await page.keyboard.press('Enter'); continue; }
  if (await page.$('#gskip')) { await page.click('#gskip'); continue; }
  if (await page.$('#gotit')) { await page.keyboard.press(' '); continue; }
  if (await page.$('#grades:not(.hidden)')) {
    const m = await page.$eval('.qcard .mode', e => e.textContent.split('·')[0].trim());
    await page.screenshot({ path: `test/shots/31-rev-${m.replace(/\s/g, '_')}.png` });
    await page.keyboard.press(' '); continue;
  }
  if (await page.$('#typein:not([disabled])')) { await page.screenshot({ path: new URL('./shots/', import.meta.url).pathname + '31-type-q.png' }); await page.fill('#typein', 'ni3hao3'); await page.keyboard.press('Enter'); continue; }
  if (await page.$('#fliphint')) { await page.keyboard.press(' '); continue; }
  if (await page.$('.qcard .opt:not([disabled])')) { await page.keyboard.press('1'); continue; }
}
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
await page.screenshot({ path: new URL('./shots/', import.meta.url).pathname + '32-summary-adv.png' });
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();

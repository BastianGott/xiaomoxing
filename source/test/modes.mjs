import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(new URL('../dist/xiaomoxing.html', import.meta.url).href);
await page.evaluate(() => {
  S.welcomed = true;
  const t = today(), now = Date.now();
  CORE_ORDER.slice(0, 60).forEach(id => { S.cards[id] = { st: 2, s: 30, d: 5, last: now - 30 * DAY_MS, due: t, reps: 4, lapses: 0 }; });
  save();
});
await page.reload();
for (const mode of ['type', 'listen', 'prod']) {
  await page.evaluate(m => { window.chooseMode = () => m; TTS.available = () => true; startEpoch(); }, mode);
  await page.waitForTimeout(200);
  if (mode === 'type') { await page.screenshot({ path: new URL('./shots/', import.meta.url).pathname + '40-type.png' }); await page.fill('#typein', 'wo2'); await page.keyboard.press('Enter'); }
  else { await page.screenshot({ path: `test/shots/40-${mode}.png` }); await page.keyboard.press('2'); }
  await page.waitForTimeout(200);
  await page.screenshot({ path: `test/shots/41-${mode}-reveal.png` });
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
}
// end-early cleanup check: start epoch with new words, intro then esc
const res = await page.evaluate(() => {
  window.chooseMode = () => 'read';
  const before = dayStats().new;
  SESS = null; S.cards = {}; save();
  startEpoch();
  return before;
});
await page.keyboard.press(' '); await page.waitForTimeout(100); // got it on first intro
await page.keyboard.press('Escape'); await page.waitForTimeout(150);
const after = await page.evaluate(() => ({ newToday: dayStats().new, cards: Object.keys(S.cards).length, seen: seenIds().length }));
console.log('end-early cleanup', JSON.stringify(after));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();

import { chromium } from 'playwright';
const url = new URL('../dist/xiaomoxing.html', import.meta.url).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(url);
await page.waitForTimeout(400);
await page.screenshot({ path: new URL('./shots/', import.meta.url).pathname + '01-welcome.png' });
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
await page.screenshot({ path: new URL('./shots/', import.meta.url).pathname + '02-home.png', fullPage: true });
await page.keyboard.press('Enter'); // start epoch
await page.waitForTimeout(300);
const seenTypes = new Set();
let steps = 0;
for (; steps < 400; steps++) {
  await page.waitForTimeout(60);
  if (await page.$('.modal-bg')) {
    if (!seenTypes.has('levelup') && await page.$('.levelup')) { seenTypes.add('levelup'); await page.screenshot({ path: new URL('./shots/', import.meta.url).pathname + '05-levelup.png' }); }
    await page.keyboard.press('Enter'); continue;
  }
  if (await page.$('#home')) break; // summary
  if (await page.$('#gotit')) {
    if (!seenTypes.has('intro')) { seenTypes.add('intro'); await page.screenshot({ path: new URL('./shots/', import.meta.url).pathname + '03-intro.png' }); }
    await page.keyboard.press(' '); continue;
  }
  if (await page.$('#gskip')) {
    const title = await page.$eval('.gamehead .title', e => e.textContent);
    if (!seenTypes.has('g' + title)) { seenTypes.add('g' + title); await page.screenshot({ path: `test/shots/06-game-${title}.png` }); }
    await page.click('#gskip'); continue;
  }
  const grades = await page.$('#grades:not(.hidden)');
  if (grades) {
    const mode = await page.$eval('.qcard .mode', e => e.textContent);
    const key = 'r-' + mode.split('·')[0].trim();
    if (!seenTypes.has(key)) { seenTypes.add(key); await page.screenshot({ path: `test/shots/04-reveal-${mode.split('·')[0].trim().replace(/\s/g,'_')}.png` }); }
    // sometimes Again
    await page.keyboard.press(Math.random() < 0.15 ? '1' : ' ');
    continue;
  }
  const opt = await page.$('.qcard .opt:not([disabled])');
  if (opt) {
    const mode = await page.$eval('.qcard .mode', e => e.textContent);
    const key = 'q-' + mode.split('·')[0].trim();
    if (!seenTypes.has(key)) { seenTypes.add(key); await page.screenshot({ path: `test/shots/04-quiz-${mode.split('·')[0].trim().replace(/\s/g,'_')}.png` }); }
    await page.keyboard.press(String(1 + Math.floor(Math.random() * 4))); continue;
  }
  if (await page.$('#typein:not([disabled])')) { await page.fill('#typein', 'ni3'); await page.keyboard.press('Enter'); continue; }
  if (await page.$('#fliphint')) { await page.keyboard.press(' '); continue; }
  console.log('stuck at step', steps, await page.$eval('#main', e => e.innerText.slice(0, 200)));
  break;
}
await page.waitForTimeout(300);
await page.screenshot({ path: new URL('./shots/', import.meta.url).pathname + '07-summary.png', fullPage: true });
const st = await page.evaluate(() => ({ xp: S.xp, lvl: levelInfo().level, seen: seenIds().length, epochs: S.epochs, cards: Object.entries(S.cards).slice(0, 4) }));
console.log('steps', steps, 'types', [...seenTypes].join(', '));
console.log(JSON.stringify(st, null, 0).slice(0, 900));
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
await page.screenshot({ path: new URL('./shots/', import.meta.url).pathname + '08-home-after.png', fullPage: true });
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();

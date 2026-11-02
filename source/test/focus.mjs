// Focus robustness: after clicking audio/hint buttons or the card, typing (plain and IME) must land in the field.
import { chromium } from 'playwright';
const URL_ = new URL('../dist/xiaomoxing.html', import.meta.url).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const cdp = await page.context().newCDPSession(page);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(URL_);
await page.evaluate(() => {
  localStorage.clear(); S = freshState(); S.welcomed = true; S.settings.sentInput = 'type';
  const now = Date.now(); CORE_ORDER.slice(0, 80).forEach(id => { S.cards[id] = { st: 2, s: 30, d: 5, last: now - 86400000 * 31, due: today(), reps: 3, lapses: 0 }; });
  save();
});
await page.reload();
await page.evaluate(() => { TTS.available = () => true; });
async function ime(pinyin, hanzi) {
  for (let i = 1; i <= pinyin.length; i++) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Process', code: 'KeyA', windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
    await cdp.send('Input.imeSetComposition', { text: pinyin.slice(0, i), selectionStart: i, selectionEnd: i });
  }
  await cdp.send('Input.insertText', { text: hanzi });
}
const out = {};
// dictation: click 🔊 and 🐢 first, then type pinyin with a plain keyboard containing r and s
await page.evaluate(() => startGym('dict', false, 2)); await page.waitForTimeout(200);
await page.click('.speak.huge'); await page.click('[data-slow]');
await page.keyboard.type('wo shi ren');
out.dictPlain = await page.$eval('#sin', el => el.value);
await page.fill('#sin', '');
await page.click('[data-slow]');
await ime('woshi', '我是');
out.dictIME = await page.$eval('#sin', el => el.value);
await page.keyboard.press('Escape'); await page.waitForTimeout(100); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
// build (typing): click on the card background, then IME
await page.evaluate(() => startGym('build', false, 2)); await page.waitForTimeout(200);
await page.click('.prompt-en'); await page.evaluate(() => document.activeElement.blur());
await page.keyboard.type('n');      // stray key redirects focus into the field
await ime('nihao', '你好');
out.buildIME = await page.$eval('#sin', el => el.value);
await page.keyboard.press('Escape'); await page.waitForTimeout(100); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
// translate: Show pinyin button, then typing English with r/s/p letters
await page.evaluate(() => startGym('trans', false, 2)); await page.waitForTimeout(200);
await page.click('#hintbtn');
await page.keyboard.type('he is my friends sister');
out.trans = await page.$eval('#ein', el => el.value);
out.pinyinShown = await page.$eval('#pyhint', el => el.textContent.length > 0);
await page.keyboard.press('Enter'); await page.waitForTimeout(150);
out.revealed = !!(await page.$('#grades:not(.hidden)'));
await page.keyboard.press('3'); await page.waitForTimeout(150);
out.nextCard = await page.$eval('.qcard .mode', e => e.textContent);
await page.keyboard.press('Escape'); await page.waitForTimeout(100); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
// word pinyin typing mode
await page.evaluate(() => { window.chooseMode = () => 'type'; startEpoch(); }); await page.waitForTimeout(200);
await page.evaluate(() => document.activeElement.blur());
await page.keyboard.type('ni3 hao3');
out.wordType = await page.$eval('#typein', el => el.value);
console.log(JSON.stringify(out, null, 1));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();

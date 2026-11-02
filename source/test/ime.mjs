// Emulate a Chinese IME (Microsoft Pinyin-like event sequence) via CDP and check every text field accepts it.
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
  const now = Date.now(); CORE_ORDER.slice(0, 80).forEach(id => { S.cards[id] = { st: 2, s: 10, d: 5, last: now - 86400000 * 9, due: today() + 3, reps: 3, lapses: 0 }; });
  save();
  window.__prevented = [];
  window.addEventListener('keydown', e => { if (e.defaultPrevented) __prevented.push(e.key + '/' + e.keyCode); });   // bubbling, runs after document handlers
  window.addEventListener('compositionend', e => { window.__lastComp = e.data; });
});
await page.reload();
await page.evaluate(() => { TTS.available = () => true; window.__prevented = []; window.addEventListener('keydown', e => { if (e.defaultPrevented) __prevented.push(e.key + '/' + e.keyCode); }); });
async function imeType(sel, pinyin, hanzi) {
  await page.focus(sel);
  for (let i = 1; i <= pinyin.length; i++) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Process', code: 'Key' + pinyin[i - 1].toUpperCase(), windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
    await cdp.send('Input.imeSetComposition', { text: pinyin.slice(0, i), selectionStart: i, selectionEnd: i });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: pinyin[i - 1], code: 'Key' + pinyin[i - 1].toUpperCase(), windowsVirtualKeyCode: pinyin.toUpperCase().charCodeAt(i - 1) });
  }
  // pick the candidate with space
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Process', code: 'Space', windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
  await cdp.send('Input.insertText', { text: hanzi });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  return page.$eval(sel, el => el.value);
}
const results = {};
for (const [mode, sel] of [['build', '#sin'], ['dict', '#sin'], ['trans', '#ein'], ['ltrans', '#ein']]) {
  await page.evaluate(m => startGym(m, false, 2), mode);
  await page.waitForTimeout(200);
  results[mode] = await imeType(sel, 'nihao', '你好');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
}
results.prevented = await page.evaluate(() => __prevented);
console.log(JSON.stringify(results));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();

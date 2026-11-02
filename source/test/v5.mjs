// v5 checks: old (v4) save loads unchanged, beam game gone, idiom cadence, settings control stores numbers
import { chromium } from 'playwright';
const OLD = new URL('../../xiaomoxing_backup_v4.html', import.meta.url).href;
const NEW = new URL('../dist/xiaomoxing.html', import.meta.url).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(OLD);
const save = await page.evaluate(() => {
  S.welcomed = true; const now = Date.now();
  CORE_ORDER.slice(0, 120).forEach((id, i) => { S.cards[id] = { st: 2, s: 3 + i % 20, d: 5, last: now - 2 * 86400000, due: today() - (i % 2), reps: 3, lapses: 0 }; });
  // idiom introduced yesterday, plus 5 idioms due
  S.icards['马马虎虎'] = { st: 2, s: 2, d: 5, last: now - 86400000, first: now - 86400000, due: today(), reps: 2, lapses: 0 };
  IDIOMS.slice(1, 6).forEach(x => { S.icards[x.h] = { st: 2, s: 5, d: 5, last: now - 9 * 86400000, first: now - 9 * 86400000, due: today(), reps: 2, lapses: 0 }; });
  S.settings.newIdiomPerDay = 1; save();
  return { raw: localStorage.getItem(SAVE_KEY), map: Object.keys(S.cards).map(id => [id, WORDS[id].h, WORDS[id].p]) };
});
await page.goto(NEW);
await page.evaluate(raw => localStorage.setItem('xiaomoxing.save.v1', raw), save.raw);
await page.reload();
const r = await page.evaluate(map => ({
  bad: map.filter(([id, h, p]) => WORDS[id].h !== h || WORDS[id].p !== p).length,
  games: Object.keys(GAMES), idiomEvery: S.settings.idiomEvery,
  newIdiomToday: newIdiomLeftToday(), idiomDue: dueIdiomKeys().length,
}), save.map);
// pretend last idiom was 3 days ago -> one new idiom allowed
r.after3days = await page.evaluate(() => { const c = S.icards['马马虎虎']; c.first = c.last = Date.now() - 3 * 86400000; return newIdiomLeftToday(); });
r.weekly = await page.evaluate(() => { S.settings.idiomEvery = 7; return newIdiomLeftToday(); });
r.off = await page.evaluate(() => { S.settings.idiomEvery = 0; return newIdiomLeftToday(); });
await page.evaluate(() => { S.settings.idiomEvery = 3; save(); });
// epoch: count idiom reviews in the queue (max 3)
r.idiomItems = await page.evaluate(() => { startEpoch(); const n = SESS.main.filter(x => x.ikey).length; endEpoch(true, true); return n; });
// settings control stores a number
await page.evaluate(() => go('settings')); await page.waitForTimeout(150);
await page.click('[data-set="idiomEvery"] button[data-v="7"]');
r.storedType = await page.evaluate(() => typeof S.settings.idiomEvery + ':' + S.settings.idiomEvery);
await page.screenshot({ path: new URL('./shots/', import.meta.url).pathname + 'v5-settings.png', fullPage: true });
await page.evaluate(() => go('lab')); await page.waitForTimeout(150);
await page.screenshot({ path: new URL('./shots/', import.meta.url).pathname + 'v5-lab.png' });
r.labHasBeam = await page.evaluate(() => document.querySelector('#main').innerText.includes('Beam Search'));
r.tempBars = await page.evaluate(() => { go('settings'); return [...document.querySelectorAll('.tbars .r span:first-child')].map(e => e.textContent); });
console.log(JSON.stringify(r, null, 1));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();

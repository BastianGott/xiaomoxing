// catch-up mode: backlog throttles new cards, epochs are capped, new words enter gradually
import { chromium } from 'playwright';
const OLD = new URL('../../xiaomoxing_backup_v5.html', import.meta.url).href;
const NEW = new URL('../dist/xiaomoxing.html', import.meta.url).href;
const SHOTS = new URL('./shots/', import.meta.url).pathname;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const fails = [];
const check = (name, ok, info = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== '' ? '  ' + JSON.stringify(info) : '')); if (!ok) fails.push(name); };

// 1) save from the installed version loads and maps to the same words
await page.goto(OLD);
const oldWords = await page.evaluate(() => JSON.stringify(WORDS.map(w => [w.id, w.h, w.p])));
await page.goto(NEW);
const newWords = await page.evaluate(() => JSON.stringify(WORDS.map(w => [w.id, w.h, w.p])));
check('word IDs unchanged vs installed version', oldWords === newWords);

// helper: build a save with N words, `due` of them due today with varying overdue-ness
async function setup(nKnown, nDue, extra = {}) {
  await page.evaluate(({ nKnown, nDue, extra }) => {
    localStorage.clear();
    S = freshState(); S.welcomed = true;
    const now = Date.now();
    CORE_ORDER.slice(0, nKnown).forEach((id, i) => {
      const isDue = i < nDue;
      const s = 2 + (i % 25);
      const overdue = isDue ? 1 + (i * 7) % 12 : 0;            // days overdue
      S.cards[id] = { st: 2, s, d: 5, last: now - (s + overdue) * 86400000, due: isDue ? today() - overdue : today() + 5 + (i % 9), reps: 4, lapses: 0 };
    });
    Object.assign(S.settings, extra);
    save();
  }, { nKnown, nDue, extra });
  await page.reload();
  await page.waitForTimeout(150);
}
await page.evaluate(() => { window.__fs = typeof freshState; });
const hasFresh = await page.evaluate(() => window.__fs);
if (hasFresh !== 'function') { console.log('no freshState(), using defaultState'); }

// stub the card screens so we can walk an epoch fast and record the order
const WALK = `
window.__log = [];
window.__gradeFn = () => 3;
const finish = () => setTimeout(nextItem, 0);
showIntro = item => { __log.push('N'); SESS.done++; dayStats().new++; SESS.nNew++; SESS.learn.push({ id: item.id, kind: 'learn', first: true, at: SESS.step + 3, tries: 0 }); __log.push('L' + freshInLearning()); finish(); };
showQuiz = item => {
  const g = item.kind === 'rev' ? __gradeFn() : 3;
  __log.push(item.kind === 'rev' ? (g === 1 ? 'x' : 'r') : 'q');
  SESS.done++; SESS.grades.push(g);
  if (item.first && g < 4) SESS.learn.push({ id: item.id, kind: 'learn', at: SESS.step + 5, tries: 1 });
  else if (item.kind === 'rev' && g === 1) SESS.learn.push({ id: item.id, kind: 'learn', at: SESS.step + 5, tries: 1, relearn: true });
  finish();
};
showSentence = item => { __log.push('s'); SESS.done++; finish(); };
showDialogue = item => { __log.push('d'); SESS.done++; finish(); };
showIdiomQuiz = showIdiomIntro = item => { __log.push('i'); SESS.done++; finish(); };
`;
async function walk(gradeFnSrc = '() => 3') {
  await page.evaluate(({ WALK, gradeFnSrc }) => {
    eval(WALK); window.__gradeFn = eval(gradeFnSrc);
    window.__end = false; const oe = endEpoch; endEpoch = (...a) => { window.__end = true; window.__poolLeft = SESS.newPool.length; return oe(...a); };
    startEpoch(); SESS.nextGameAt = 1e9;
  }, { WALK, gradeFnSrc });
  await page.waitForFunction(() => window.__end, null, { timeout: 20000 });
  return page.evaluate(() => ({ log: __log.join(''), poolLeft: __poolLeft }));
}

// 2) big backlog after a break: 200 due -> review-only, epoch capped at ~65 most-forgotten first
await setup(300, 200);
let r = await page.evaluate(() => {
  const bl = backlogInfo();
  return { f: bl.f, cap: bl.cap, newW: newLeftToday(), newS: newSentLeftToday(), newD: newDlgLeftToday(), newI: newIdiomLeftToday(),
    banner: !!document.querySelector('.card.catchup'), dueStat: document.querySelector('.duebox .stat .v').textContent,
    dueSub: document.querySelector('.duebox .stat .s') && document.querySelector('.duebox .stat .s').textContent };
});
check('200 due: new-card budget is 0', r.f === 0 && r.newW === 0 && r.newS === 0 && r.newD === 0 && r.newI === 0, r);
check('200 due: banner shown, dashboard shows capped epoch', r.banner && r.dueStat === String(r.cap) && /200 waiting/.test(r.dueSub), r);
await page.screenshot({ path: SHOTS + 'catchup-home.png', fullPage: false });
r = await page.evaluate(() => {
  const ni = nextItem; nextItem = () => {}; startEpoch(); nextItem = ni; sessBar();
  const ids = SESS.main.filter(x => x.kind === 'rev').map(x => x.id);
  const R = ids.map(id => FSRS.retrievability(S.cards[id]));
  const allDue = dueIds().map(id => FSRS.retrievability(S.cards[id])).sort((a, b) => a - b);
  const sorted = R.every((v, i) => i === 0 || R[i - 1] <= v + 1e-9);
  const out = { n: ids.length, pool: SESS.newPool.length, sorted, worstIncluded: Math.abs(R[0] - allDue[0]) < 1e-9, bar: document.querySelector('#sessbar').textContent.includes('catch-up') };
  endEpoch(true, true); return out;
});
check('200 due: epoch holds 65 reviews, no new words, most-forgotten first', r.n === 65 && r.pool === 0 && r.sorted && r.worstIncluded, r);
check('session bar says catch-up', r.bar);

// 3) as the pile shrinks, new words come back gradually
r = await page.evaluate(() => {
  const res = [];
  const ids = dueIds();
  for (const left of [200, 130, 100, 70, 39, 10]) {
    ids.forEach((id, i) => { S.cards[id].due = i < left ? today() - 1 : today() + 3; });
    res.push([left, newLeftToday()]);
  }
  return res;
});
const monotone = r.every((x, i) => i === 0 || x[1] >= r[i - 1][1]);
check('new-word budget rises as backlog shrinks (0 -> 10)', monotone && r[0][1] === 0 && r[r.length - 1][1] === 10, r);

// 4) moderate backlog: a few new words, introduced gradually inside the epoch
await setup(300, 60);
r = await page.evaluate(() => ({ newW: newLeftToday(), f: backlogInfo().f }));
check('60 due: partial budget', r.newW > 0 && r.newW < 10, r);
let w = await walk();
let firstN = w.log.indexOf('N');
let maxLoad = Math.max(...[...w.log.matchAll(/L(\d)/g)].map(m => +m[1]));
let introduced = (w.log.match(/N/g) || []).length;
console.log('   order:', w.log.replace(/L\d/g, ''));
check('warm-up: first new word only after ~12 reviews', firstN >= 12, firstN);
check('never more than 3 fresh words in learning at once', maxLoad <= 3, maxLoad);
check('all budgeted new words introduced when answers are good', introduced === r.newW && w.poolLeft === 0, { introduced, left: w.poolLeft });

// 5) normal day (no backlog): full 10 new words, spread out, still capped load
await setup(150, 25);
r = await page.evaluate(() => ({ newW: newLeftToday(), active: backlogInfo().active, banner: !!document.querySelector('.card.catchup') }));
check('normal day: 10 new words, no banner', r.newW === 10 && !r.active && !r.banner, r);
w = await walk();
introduced = (w.log.match(/N/g) || []).length;
maxLoad = Math.max(...[...w.log.matchAll(/L(\d)/g)].map(m => +m[1]));
const seq = w.log.replace(/L\d/g, '');
const gaps = []; let lastN = -1; [...seq].forEach((c, i) => { if (c === 'N') { if (lastN >= 0) gaps.push(i - lastN); lastN = i; } });
console.log('   order:', seq);
check('normal day: all 10 introduced, load <= 3, no back-to-back burst of 4', introduced === 10 && maxLoad <= 3 && !/NNNN/.test(seq), { introduced, maxLoad, gaps });

// 6) struggling: lots of Again -> new words held back, summary says so
await setup(300, 45);
r = await page.evaluate(() => newLeftToday());
w = await walk('() => (Math.random() < 0.7 ? 1 : 3)');
introduced = (w.log.match(/N/g) || []).length;
const sumText = await page.evaluate(() => document.querySelector('#main').textContent);
console.log('   order:', w.log.replace(/L\d/g, ''));
check('struggling: new words mostly held back', introduced < r && w.poolLeft > 0, { budget: r, introduced, left: w.poolLeft });
check('summary mentions held-back words', /held back for the next epoch/.test(sumText));
r = await page.evaluate(() => ({ counted: dayStats().new, left: newLeftToday() }));
check('held-back words are not counted as learned today', r.counted === introduced, r);

// 6b) normal rustiness (~20% forgotten) does not stop new words
await setup(300, 45);
r = await page.evaluate(() => newLeftToday());
w = await walk('() => (Math.random() < 0.2 ? 1 : 3)');
introduced = (w.log.match(/N/g) || []).length;
check('~20% forgotten: new words still come', introduced >= r - 2, { budget: r, introduced });

// 7) override button + setting toggle
await setup(300, 200);
await page.click('#more');
r = await page.evaluate(() => { const o = { pool: SESS.newPool.length }; endEpoch(true, true); return o; });
check('"+5 new words anyway" gives 5 new words during catch-up', r.pool === 5, r);
await page.evaluate(() => go('settings')); await page.waitForTimeout(150);
await page.click('[data-set="catchUp"] button[data-v="false"]');
r = await page.evaluate(() => ({ v: S.settings.catchUp, t: typeof S.settings.catchUp, newW: newLeftToday(), active: backlogInfo().active }));
check('catch-up can be switched off (stores boolean)', r.v === false && r.t === 'boolean' && r.newW >= 10 && !r.active, r);
await page.click('[data-set="catchUp"] button[data-v="true"]');
check('and back on', await page.evaluate(() => S.settings.catchUp === true));

// 8) old save without the catchUp setting gets it on by default
await page.goto(OLD);
const raw = await page.evaluate(() => { S.welcomed = true; save(); return localStorage.getItem(SAVE_KEY); });
await page.goto(NEW);
await page.evaluate(raw => localStorage.setItem('xiaomoxing.save.v1', raw), raw);
await page.reload();
check('old save: catchUp defaults on', await page.evaluate(() => S.settings.catchUp === true));

// light theme screenshot of the banner
await setup(300, 120);
await page.emulateMedia({ colorScheme: 'light' });
await page.reload(); await page.waitForTimeout(150);
await page.screenshot({ path: SHOTS + 'catchup-home-light.png', fullPage: false });

check('no page errors', errors.length === 0, errors);
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);

import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(new URL('../dist/xiaomoxing.html', import.meta.url).href);
const r = await page.evaluate(() => {
  const out = [];
  const ok = (name, cond, extra = '') => out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
  const W = n => WORDS.find(w => w.h === n);
  // pinyin checker
  ok('ni3hao3', checkPinyin('ni3hao3', W('你好')) === 'ok');
  ok('ni3 hao3 spaced', checkPinyin('ni3 hao3', W('你好')) === 'ok');
  ok('marks nǐhǎo', checkPinyin('nǐhǎo', W('你好')) === 'ok');
  ok('wrong tones', checkPinyin('ni2hao3', W('你好')) === 'tones');
  ok('wrong letters', checkPinyin('ni3hai3', W('你好')) === 'wrong');
  ok('neutral lenient xue2sheng', checkPinyin('xue2sheng', W('学生')) === 'ok');
  ok('neutral lenient xue2sheng1', checkPinyin('xue2sheng1', W('学生')) === 'ok');
  ok('ü as v: nv3', checkPinyin('nv3', W('女')) === 'ok');
  ok('ü as u: — lv4 for 绿', checkPinyin('lv4', W('绿')) === 'ok');
  ok('erhua na3r', checkPinyin('na3r', W('哪儿')) === 'ok');
  ok('erhua nar3', checkPinyin('nar3', W('哪儿')) === 'ok');
  ok('apostrophe nv3er2', checkPinyin("nv3'er2", W('女儿')) === 'ok');
  ok('capital Zhong1guo2', checkPinyin('Zhong1guo2', W('中国')) === 'ok');
  // FSRS
  const now = Date.now();
  const n1 = FSRS.next(null, 3, now);
  ok('init S(Good)=3.173', Math.abs(n1.s - 3.173) < 1e-6, n1.s.toFixed(3));
  ok('init D(Good)≈5.28', Math.abs(n1.d - 5.28) < 0.02, n1.d.toFixed(3));
  ok('interval(S) == S at 0.9', FSRS.intervalDays(10, 0.9, false) === 10);
  ok('interval longer at 0.8', FSRS.intervalDays(10, 0.8, false) > 10, FSRS.intervalDays(10, 0.8, false));
  const card = { st: 2, s: 10, d: 5, last: now - 10 * DAY_MS, reps: 3 };
  const g3 = FSRS.next(card, 3, now), g2 = FSRS.next(card, 2, now), g4 = FSRS.next(card, 4, now), g1 = FSRS.next(card, 1, now);
  ok('success grows S', g3.s > 10, g3.s.toFixed(2));
  ok('Hard < Good < Easy', g2.s < g3.s && g3.s < g4.s, [g2.s, g3.s, g4.s].map(x => x.toFixed(1)).join(' '));
  ok('lapse shrinks S', g1.s < 10, g1.s.toFixed(2));
  ok('D up on Again, down on Easy', g1.d > 5 && g4.d < 5, g1.d.toFixed(2) + ' ' + g4.d.toFixed(2));
  const same = { st: 2, s: 3.173, d: 5.28, last: now - 60000, reps: 1 };
  ok('same-day Good boosts S ~1.41x', Math.abs(FSRS.next(same, 3, now).s / 3.173 - Math.exp(0.51655 * 0.6621)) < 1e-6);
  ok('R(S)=0.9', Math.abs(FSRS.R(7, 7) - 0.9) < 1e-9);
  // sentences: all tokens map to words & sandhi
  ok('sentences', SENTS.length > 400, SENTS.length);
  const s = SENTS.find(x => x.z.join('') === '我不是老师。');
  ok('不 sandhi bú shì', s && s.s[1][0][0] === 'bú');
  // planner softmax
  const p = softmax([1.5, 0.6, 0.7], 1); ok('softmax sums 1', Math.abs(p.reduce((a, b) => a + b) - 1) < 1e-9);
  // learning order starts with basics
  ok('first words', CORE_ORDER.slice(0, 5).map(i => WORDS[i].h).join('') === '我你好你好是', CORE_ORDER.slice(0, 5).map(i => WORDS[i].h).join(''));
  ok('newQueue no AI term at start', newQueue(10).every(id => WORDS[id].l > 0));
  return out;
});
console.log(r.join('\n'));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();

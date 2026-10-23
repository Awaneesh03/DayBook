// Finding and planning: search, quick navigation (Cmd/Ctrl+K), focus writing, habits, tasks, daily and weekly reviews.
// Needs: npm i playwright-core, Google Chrome, internet (three.js CDN). Rebuild first: python3 build.py
// Run: node tests/test_planner.mjs [path/to/index.html]     ONLY="text" runs just the matching tests.
import { chromium } from 'playwright-core';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = path.resolve(process.argv[2] || path.join(here, '..', 'index.html'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

let failed = 0;
const ok = (c, m) => { if (!c) throw new Error(m); };
// local dates, as the app uses them (the browser runs in this machine's time zone unless a test sets one)
const pad = n => String(n).padStart(2, '0');
const dayId = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const shift = (n, from = new Date()) => { const d = new Date(from); d.setDate(d.getDate() + n); return dayId(d); };
const TODAY = dayId(), YESTERDAY = shift(-1);

const baseLib = (extra = {}) => ({ v: 4, activeId: 'daily', journals: [{ id: 'daily', title: 'Daily Journal', pages: 3, order: 0 }, { id: 'trips', title: 'Voyages à Paris', pages: 2, order: 1 }], settings: { welcomed: true, animate: false }, ...extra });
const basePages = {
  'daily~1': { j: 'daily', n: 1, text: 'A slow morning. Coffee at the Café Lumière with Ana.', date: shift(-2), mood: 4, updatedAt: 1 },
  'daily~2': { j: 'daily', n: 2, text: 'Long walk by the river. Thinking about the trip.', date: YESTERDAY, mood: 3, updatedAt: 2 },
  'daily~3': { j: 'daily', n: 3, text: 'Wrote the plan for next week. 日本語のメモ 🌙 #plans', date: TODAY, mood: 5, updatedAt: 3 },
  'trips~1': { j: 'trips', n: 1, text: 'Lisbon: tiled houses, a cafe by the tram line, pastéis de nata.', date: '2026-02-14', mood: 0, updatedAt: 4 },
  'trips~2': { j: 'trips', n: 2, text: '<img src=x onerror=alert(1)> needle in the text', date: '2026-02-15', mood: 0, updatedAt: 5 }
};

async function fresh({ seed = { lib: baseLib(), pages: basePages }, ctxOpts = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...ctxOpts });
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('daybook3d:v1', JSON.stringify(s)); sessionStorage.setItem('seeded', '1'); } }, seed);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => { errors.push('dialog: ' + d.message()); d.dismiss().catch(() => {}); });
  await page.goto(pathToFileURL(html).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.Daybook && window.Daybook.R3 && document.querySelector('#loader.gone'), null, { timeout: 60000 });
  return { ctx, page, errors };
}
async function test(name, fn, opts) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  let t; try { t = await fresh(opts); } catch (e) { failed++; console.log('FAIL', name, '\n    page did not load:', e.message.split('\n')[0]); return; }
  try { await fn(t.page, t); ok(!t.errors.length, 'console/page errors: ' + t.errors.join(' | ')); console.log('PASS', name); }
  catch (e) { failed++; console.log('FAIL', name, '\n   ', e.message); }
  await t.ctx.close();
}
const readerAt = page => page.evaluate(() => { const r = document.querySelector('#reader'); if (r.hidden || !r.classList.contains('show')) return null; return { title: document.querySelector('#rJournal').textContent, pages: [...document.querySelectorAll('#spread .page')].filter(p => p.offsetParent).map(p => +p.dataset.n) }; });
const waitReader = page => page.waitForFunction(() => document.querySelector('#reader.show') && Daybook.R3.paused, null, { timeout: 30000 });
const waitRoom = page => page.waitForFunction(() => document.querySelector('#reader').hidden && Daybook.R3.cam.mode === 'room' && !Daybook.R3.paused, null, { timeout: 30000 });
const today = async page => { await page.evaluate(() => Daybook.openDrawer('today')); await page.waitForSelector('#plHabits'); };
const storedLib = page => page.evaluate(() => JSON.parse(localStorage.getItem('daybook3d:v1')).lib);
const settled = page => page.waitForFunction(() => document.querySelector('#rStatus').textContent !== 'Saving…' && !Daybook.unsaved(), null, { timeout: 15000 }).catch(() => {});
const libSaved = (page, f) => page.waitForFunction(f, null, { timeout: 15000 });
const reload = async page => { await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.Daybook && window.Daybook.R3 && document.querySelector('#loader.gone'), null, { timeout: 60000 }); };
const cmdK = page => page.keyboard.press('Control+k');

/* ---- search ---- */
await test('search needs every word, ignores accents and case, matches dates and titles, and opens the exact page', async page => {
  const r = await page.evaluate(() => {
    const ids = q => { const s = Daybook.searchAll(q, 40); return { pages: s.pages.map(p => p.j + '~' + p.n), journals: s.journals.map(j => j.id) }; };
    return { cafe: ids('CAFE'), two: ids('cafe lisbon'), jp: ids('日本語'), emoji: ids('🌙'), date: ids('february'), title: ids('voyages a paris'), none: ids('cafe zebra') };
  });
  ok(r.cafe.pages.join() === 'daily~1,trips~1', 'accents/case: ' + JSON.stringify(r.cafe));
  ok(r.two.pages.join() === 'trips~1', 'every word: ' + JSON.stringify(r.two));
  ok(r.jp.pages.join() === 'daily~3' && r.emoji.pages.join() === 'daily~3', 'unicode: ' + JSON.stringify([r.jp, r.emoji]));
  ok(r.date.pages.join() === 'trips~2,trips~1', 'dates: ' + JSON.stringify(r.date));
  ok(r.title.journals.join() === 'trips', 'titles: ' + JSON.stringify(r.title));
  ok(!r.none.pages.length && !r.none.journals.length, 'no results: ' + JSON.stringify(r.none));
  await page.evaluate(() => Daybook.openDrawer('journals'));
  await page.fill('#drSearch', 'lisbon');
  await page.waitForSelector('#drResults .res');
  const mark = await page.evaluate(() => document.querySelector('#drResults .res mark').textContent);
  ok(mark === 'Lisbon', 'marked text: ' + mark);
  await page.click('#drResults .res');
  await waitReader(page);
  const at = await readerAt(page);
  ok(at.title === 'Voyages à Paris' && at.pages.includes(1), 'opened at: ' + JSON.stringify(at));
});

await test('search results show page text as text, never as markup, and say when nothing matches', async page => {
  await page.evaluate(() => Daybook.openDrawer('journals'));
  await page.fill('#drSearch', 'needle');
  await page.waitForSelector('#drResults .res');
  const res = await page.evaluate(() => ({ imgs: document.querySelectorAll('#drResults img').length, text: document.querySelector('#drResults').textContent }));
  ok(!res.imgs && res.text.includes('<img src=x onerror=alert(1)>'), 'result: ' + JSON.stringify(res));
  await page.fill('#drSearch', 'zzzz qqqq');
  await page.waitForFunction(() => /Nothing matches/.test(document.querySelector('#drResults').textContent));
});

await test('edited and deleted words leave the results at once', async page => {
  await page.evaluate(() => Daybook.openJournal('daily', 1));
  await waitReader(page);
  await page.click('#spread .page[data-side="L"] textarea');
  await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('Rewritten without that word.');
  await settled(page);
  const r = await page.evaluate(() => ({ old: Daybook.searchAll('Lumière').pages.map(p => p.j + '~' + p.n), now: Daybook.searchAll('rewritten').pages.map(p => p.j + '~' + p.n) }));
  ok(!r.old.length && r.now.join() === 'daily~1', 'after editing: ' + JSON.stringify(r));
  await page.click('#spread .page[data-side="L"] textarea');
  await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('Backspace');
  await settled(page);
  ok(!(await page.evaluate(() => Daybook.searchAll('rewritten').total)), 'a page emptied out still matched');
});

await test('a large library still searches quickly', async page => {
  const t = await page.evaluate(() => {
    const words = ['river', 'morning', 'garden', 'letter', 'café', 'mountain', 'evening', 'notebook', 'quiet', 'train'];
    for (let i = 0; i < 3000; i++) { const n = (i % 999) + 1, j = i < 999 ? 'daily' : 'trips'; Daybook.state.pages.set(j + '~' + n + (i >= 1998 ? 'x' + i : ''), { j, n, text: Array.from({ length: 120 }, (_, k) => words[(i * 7 + k) % 10]).join(' ') + ' entry ' + i, date: '2025-01-0' + (1 + i % 9), mood: 0 }); }
    const a = performance.now(); const first = Daybook.searchAll('cafe river').total; const b = performance.now(); Daybook.searchAll('cafe river'); const c = performance.now(); Daybook.searchAll('entry 2999'); const d = performance.now();
    return { first: b - a, again: c - b, other: d - c, hits: first };
  });
  ok(t.hits >= 3000 && t.first < 2500 && t.again < 400 && t.other < 400, 'timings (ms): ' + JSON.stringify(t));
});

/* ---- quick navigation ---- */
await test('Ctrl+K opens quick navigation even while writing, types nothing, and Escape closes only the palette', async page => {
  await page.evaluate(() => Daybook.openJournal('daily', 3));
  await waitReader(page);
  await page.click('#spread .page[data-side="L"] textarea');
  const before = await page.evaluate(() => document.querySelector('#spread .page[data-side="L"] textarea').value);
  await cmdK(page);
  await page.waitForSelector('#qnav');
  ok(await page.evaluate(() => document.activeElement.id === 'qnIn'), 'the palette input should have focus');
  await page.keyboard.press('Escape');
  ok(!(await page.$('#qnav')) && await readerAt(page), 'Escape closed more than the palette');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.tagName === 'TEXTAREA'), 'focus should return to the page');
  ok(await page.evaluate(() => document.querySelector('#spread .page[data-side="L"] textarea').value) === before, 'Ctrl+K typed into the page');
  await page.keyboard.type('k');
  ok(await page.evaluate(() => document.querySelector('#spread .page[data-side="L"] textarea').value) === before + 'k', 'a plain k must still type');
});

await test('quick navigation is driven by the keyboard: arrows choose, Enter opens the chosen item', async page => {
  await cmdK(page); await page.waitForSelector('#qnav');
  await page.keyboard.type('lisbon');
  await page.waitForFunction(() => [...document.querySelectorAll('#qnList .qn-item')].some(li => /Voyages à Paris · page 1/.test(li.textContent)));
  const order = await page.evaluate(() => [...document.querySelectorAll('#qnList .qn-item b')].map(b => b.textContent));
  const idx = order.findIndex(t => /Voyages à Paris · page 1/.test(t));
  for (let i = 0; i < idx; i++) await page.keyboard.press('ArrowDown');
  ok(await page.evaluate(i => document.querySelector('#qnIn').getAttribute('aria-activedescendant') === 'qn' + i, idx), 'aria-activedescendant should follow the arrows');
  await page.keyboard.press('Enter');
  await waitReader(page);
  const at = await readerAt(page);
  ok(at.title === 'Voyages à Paris' && at.pages.includes(1), 'opened: ' + JSON.stringify(at));
});

await test('every quick navigation action reaches its destination', async page => {
  const checks = {
    'Library': () => !document.querySelector('#drawer').hidden && document.querySelector('[data-dt="journals"]').getAttribute('aria-selected') === 'true',
    'Today: habits and tasks': () => !!document.querySelector('#plHabits'),
    'Calendar': () => document.querySelector('[data-dt="calendar"]').getAttribute('aria-selected') === 'true',
    'Insights': () => document.querySelector('[data-dt="insights"]').getAttribute('aria-selected') === 'true',
    'Settings': () => document.querySelector('[data-dt="settings"]').getAttribute('aria-selected') === 'true',
    'Full backup and restore': () => { const c = document.querySelector('#bkCard'); if (!c) return false; const r = c.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; },
    'Search every journal': () => document.activeElement && document.activeElement.id === 'drSearch',
    'Design a new journal': () => !document.querySelector('#designer').hidden,
    'Customize the room': () => !document.querySelector('#roomCustomModal').hidden,
    'Sounds': () => !document.querySelector('#soundPop').hidden,
    'Room tour': () => Daybook.TOUR.active,
    'Look outside': () => Daybook.PEEK.active,
    'Explore the room': () => Daybook.R3.cam.mode === 'explore',
    'Write today': () => !!document.querySelector('#reader.show')
  };
  const reset = () => page.evaluate(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); if (Daybook.TOUR.active) Daybook.exitRoomTour(); if (Daybook.PEEK.active) Daybook.exitLookOutside(); if (Daybook.R3.cam.mode === 'explore') Daybook.exitFreeExplore(); Daybook.closeRoomCustom(); const d = document.querySelector('#dClose'); if (!document.querySelector('#designer').hidden) d.click(); Daybook.closeDrawer(); if (!document.querySelector('#reader').hidden) Daybook.closeReader(); });
  for (const [label, check] of Object.entries(checks)) {
    await cmdK(page); await page.waitForSelector('#qnav');
    await page.keyboard.type(label);
    const first = await page.evaluate(() => (document.querySelector('#qnList .qn-item b') || {}).textContent);
    ok(first === label, `typing "${label}" put "${first}" first`);
    await page.keyboard.press('Enter');
    await page.waitForFunction(check, null, { timeout: 20000 }).catch(() => { throw new Error('"' + label + '" did not reach its destination'); });
    await reset(); await page.waitForTimeout(700);
    if (label === 'Write today') await waitRoom(page);
  }
});

/* ---- focus writing ---- */
await test('focus writing keeps the page, the caret and the edits, and Escape leaves it before closing the journal', async page => {
  await page.evaluate(() => Daybook.openJournal('daily', 3));
  await waitReader(page);
  await page.click('#spread .page[data-side="L"] textarea'); await page.keyboard.press('End'); await page.keyboard.type(' First.');
  const before = await readerAt(page);
  await page.click('#rFocus');
  const f = await page.evaluate(() => ({ on: document.querySelector('#reader').classList.contains('focus'), tools: getComputedStyle(document.querySelector('.r-tools')).display, exit: getComputedStyle(document.querySelector('#rFocusExit')).display, goal: getComputedStyle(document.querySelector('#goal')).display, pressed: document.querySelector('#rFocus').getAttribute('aria-pressed') }));
  ok(f.on && f.tools === 'none' && f.exit !== 'none' && f.goal !== 'none' && f.pressed === 'true', 'focus mode: ' + JSON.stringify(f));
  ok(JSON.stringify(await readerAt(page)) === JSON.stringify(before), 'focus mode moved the reader');
  await page.click('#spread .page[data-side="L"] textarea'); await page.keyboard.press('End'); await page.keyboard.type(' Second.');
  await page.keyboard.press('Escape');
  ok(await page.evaluate(() => !document.querySelector('#reader').classList.contains('focus')) && await readerAt(page), 'Escape should leave focus mode and keep the journal open');
  await settled(page);
  ok((await page.evaluate(() => JSON.parse(localStorage.getItem('daybook3d:v1')).pages['daily~3'].text)).endsWith(' First. Second.'), 'edits in and out of focus mode must both be saved');
  await page.keyboard.press('Escape');
  await waitRoom(page);
});

await test('focus writing works with reduced motion and from the keyboard', async page => {
  await page.evaluate(() => Daybook.openJournal('daily', 3));
  await waitReader(page);
  await page.focus('#rFocus'); await page.keyboard.press('Enter');
  ok(await page.evaluate(() => document.querySelector('#reader').classList.contains('focus')), 'Enter on the Focus button');
  await page.focus('#rFocusExit'); await page.keyboard.press('Enter');
  ok(await page.evaluate(() => !document.querySelector('#reader').classList.contains('focus') && document.activeElement.id === 'rFocus'), 'Exit focus should return focus to the Focus button');
}, { ctxOpts: { reducedMotion: 'reduce' } });

/* ---- habits ---- */
await test('habit streaks count due days in a row; today counts once done; days not due are skipped; days before the start do not count', async page => {
  const r = await page.evaluate(() => {
    const H = (days, done, start = '') => ({ id: 'h', name: 'x', days, start, done: Object.fromEntries(done.map(d => [d, true])) });
    const all = [0, 1, 2, 3, 4, 5, 6], wk = [1, 2, 3, 4, 5], s = Daybook.habitStreak, T = '2026-10-21'; // a Wednesday
    return {
      threeDone: s(H(all, ['2026-10-21', '2026-10-20', '2026-10-19']), T),
      todayOpen: s(H(all, ['2026-10-20', '2026-10-19']), T),
      gap: s(H(all, ['2026-10-21', '2026-10-19', '2026-10-18']), T),
      weekdays: s(H(wk, ['2026-10-16', '2026-10-15']), '2026-10-19'),   // Mon not done yet; Sat/Sun not due; Fri, Thu done
      weekendGap: s(H(wk, ['2026-10-19', '2026-10-15']), '2026-10-19'),  // Fri 16 missed
      beforeStart: s(H(all, ['2026-10-21', '2026-10-20', '2026-10-19'], '2026-10-20'), T),
      none: s(H(all, []), T)
    };
  });
  ok(r.threeDone === 3 && r.todayOpen === 2 && r.gap === 1 && r.weekdays === 2 && r.weekendGap === 1 && r.beforeStart === 2 && r.none === 0, JSON.stringify(r));
});

await test('habits: add, tick, persist across a reload, edit without losing history, future days locked, delete only when confirmed', async page => {
  await today(page);
  await page.click('#plAddHabit'); await page.fill('#plHabitName', 'Read 10 pages'); await page.keyboard.press('Enter');
  await page.click('#plHabits .pl-check');
  await libSaved(page, () => { const l = JSON.parse(localStorage.getItem('daybook3d:v1')).lib; return l.habits && l.habits[0] && Object.keys(l.habits[0].done).length === 1; });
  await reload(page); await today(page);
  const h1 = await page.evaluate(() => ({ pressed: document.querySelector('#plHabits .pl-check').getAttribute('aria-pressed'), text: document.querySelector('#plHabits .pl-main').textContent }));
  ok(h1.pressed === 'true' && /1 day in a row/.test(h1.text), 'after reload: ' + JSON.stringify(h1));
  const doneKey = (await storedLib(page)).habits[0].done;
  ok(Object.keys(doneKey).join() === (await page.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })), 'ticked under the local date: ' + JSON.stringify(doneKey));
  await page.click('#plHabits .pl-habit .btn'); await page.fill('#plHabitName', 'Read 20 pages');
  await page.click('#plHabits .pl-edit .chip[aria-label="Sunday"]');
  await page.click('#plHabits .pl-edit .btn.solid');
  await libSaved(page, () => JSON.parse(localStorage.getItem('daybook3d:v1')).lib.habits[0].name === 'Read 20 pages');
  const h2 = (await storedLib(page)).habits[0];
  ok(h2.days.join() === '1,2,3,4,5,6' && Object.keys(h2.done).length === 1, 'edit must keep the ticks: ' + JSON.stringify(h2));
  await page.click('.pl-day [aria-label="Next day"]');
  ok(await page.evaluate(() => document.querySelector('#plHabits .pl-check').disabled), 'a future day cannot be ticked');
  await page.evaluate(() => [...document.querySelectorAll('.pl-day .btn')].find(b => b.textContent === 'Today').click());
  await page.click('#plHabits .pl-habit .btn'); await page.click('#plHabits .pl-edit .btn.danger');
  ok((await storedLib(page)).habits.length === 1, 'Delete… alone must not delete');
  await page.evaluate(() => [...document.querySelectorAll('#plHabits .btn')].find(b => b.textContent === 'Keep it').click());
  ok((await page.evaluate(() => Daybook.state.lib.habits.length)) === 1, 'Keep it must keep it');
  await page.click('#plHabits .pl-edit .btn.danger');   // the editor is still open after Keep it
  await page.evaluate(() => [...document.querySelectorAll('#plHabits .btn')].find(b => b.textContent === 'Delete habit').click());
  await libSaved(page, () => JSON.parse(localStorage.getItem('daybook3d:v1')).lib.habits.length === 0);
});

await test('a habit is ticked under the local date in a far-off time zone', async page => {
  await today(page);
  await page.click('#plAddHabit'); await page.fill('#plHabitName', 'Stretch'); await page.keyboard.press('Enter');
  await page.click('#plHabits .pl-check');
  const r = await page.evaluate(() => ({ key: Object.keys(Daybook.state.lib.habits[0].done)[0], local: new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Kiritimati' }).format(new Date()), shown: document.querySelector('#plDate').textContent }));
  ok(r.key === r.local, 'ticked ' + r.key + ' but the local date there is ' + r.local);
}, { ctxOpts: { timezoneId: 'Pacific/Kiritimati' } });

/* ---- tasks ---- */
await test('tasks: add, complete, edit, delete, and they persist across a reload', async page => {
  await today(page);
  for (const t of ['Call the library', 'Buy stamps', 'Water the plants']) { await page.fill('#plTaskIn', t); await page.keyboard.press('Enter'); }
  await page.click('#plTasks .pl-task .pl-check');
  await page.click('#plTasks .pl-task:nth-child(2) .btn'); await page.waitForFunction(() => document.activeElement.matches('.pl-task.editing input')); await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('Buy stamps and envelopes'); await page.keyboard.press('Enter');
  await page.click('#plTasks .pl-task:nth-child(3) .btn'); await page.evaluate(() => [...document.querySelectorAll('#plTasks .btn')].find(b => b.textContent === 'Delete task').click());
  await libSaved(page, () => JSON.parse(localStorage.getItem('daybook3d:v1')).lib.tasks.length === 2);
  await reload(page); await today(page);
  const t = await page.evaluate(() => ({ items: [...document.querySelectorAll('#plTasks .pl-task')].map(li => (li.classList.contains('done') ? '[x] ' : '[ ] ') + li.querySelector('b').textContent), count: document.querySelector('#plTaskCount').textContent }));
  ok(t.items.join('|') === '[x] Call the library|[ ] Buy stamps and envelopes' && t.count === '1 of 2 done', JSON.stringify(t));
});

await test('unfinished tasks move to today only when asked, without copies, and keep where they came from', async page => {
  await today(page);
  const card = await page.evaluate(() => document.querySelector('#plTasks').textContent);
  ok(/2 unfinished tasks from earlier days/.test(card), 'carry-forward offer: ' + card);
  ok((await page.evaluate(() => Daybook.state.lib.tasks.map(t => t.id + '@' + t.date).join())) === ['told1@' + shift(-3), 'told2@' + YESTERDAY, 'tdone@' + YESTERDAY, 'tnow@' + TODAY].join(), 'nothing may move before the visitor asks');
  await page.click('#plCarry');
  await libSaved(page, () => JSON.parse(localStorage.getItem('daybook3d:v1')).lib.tasks.filter(t => t.from).length === 2);
  const l = await storedLib(page);
  const todays = l.tasks.filter(t => t.date === l.tasks.find(x => x.id === 'tnow').date);
  ok(l.tasks.length === 4 && todays.length === 3 && l.tasks.find(t => t.id === 'tdone').date !== todays[0].date, 'after moving: ' + JSON.stringify(l.tasks));
  ok(l.tasks.filter(t => t.from).every(t => t.from < t.date), 'moved tasks must remember their day');
  ok(!(await page.$('#plCarry')), 'nothing left to move');
  ok(await page.evaluate(() => Daybook.carryForward()) === 0, 'moving again must not copy anything');
  ok((await page.evaluate(() => Daybook.state.lib.tasks.length)) === 4, 'no duplicates');
}, { seed: { lib: baseLib({ tasks: [
  { id: 'told1', text: 'Old open one', date: shift(-3), done: false, created: 1 },
  { id: 'told2', text: 'Old open two', date: YESTERDAY, done: false, created: 2 },
  { id: 'tdone', text: 'Old finished', date: YESTERDAY, done: true, created: 3 },
  { id: 'tnow', text: 'Today task', date: TODAY, done: false, created: 4 }] }), pages: basePages } });

await test('deleting a journal leaves tasks alone, and a link to a page that is gone says so', async page => {
  await today(page);
  ok(await page.evaluate(() => /↗ Voyages à Paris · page 1/.test(document.querySelector('#plTasks').textContent)), 'the linked page should be offered');
  await page.evaluate(() => [...document.querySelectorAll('#plTasks .pl-link')][0].click());
  await waitReader(page);
  ok((await readerAt(page)).title === 'Voyages à Paris', 'the link should open its page');
  await page.evaluate(() => Daybook.closeReader()); await waitRoom(page);
  // delete the journal through its menu
  await page.evaluate(() => Daybook.openJournal('trips', 1)); await waitReader(page);
  await page.click('#reader [data-pop="more"]');
  await page.evaluate(() => [...document.querySelectorAll('#pop button')].find(b => /Delete this journal/.test(b.textContent)).click());
  await page.evaluate(() => [...document.querySelectorAll('#pop button')].find(b => /^Delete/.test(b.textContent) && !/this journal/.test(b.textContent)).click());
  await waitRoom(page);
  await libSaved(page, () => !JSON.parse(localStorage.getItem('daybook3d:v1')).lib.journals.some(j => j.id === 'trips'));
  ok((await storedLib(page)).tasks.length === 1, 'the task must survive the journal');
  await today(page);
  ok(await page.evaluate(() => /Linked page is gone/.test(document.querySelector('#plTasks').textContent)), 'a gone link must say so');
}, { seed: { lib: baseLib({ tasks: [{ id: 'tl', text: 'Write up the trip', date: TODAY, done: false, created: 1, link: { j: 'trips', n: 1 } }] }), pages: { ...basePages, 'trips~1': { ...basePages['trips~1'], date: TODAY } } } });

/* ---- reviews ---- */
await test('a daily review is built from what was recorded, says what was not, opens on an unused page, and opens again later', async page => {
  const text = await page.evaluate(() => Daybook.reviewText('daily', (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })()));
  ok(text === await page.evaluate(t => Daybook.reviewText('daily', t), TODAY), 'the review must be the same each time it is built');
  ok(text.includes('#review') && /Writing: 1 page, \d+ words/.test(text) && /Mood: Great/.test(text) && /Habits: 1 of 2 done \(Read ✓, Walk ✗\)/.test(text) && /Tasks: 1 of 2 done; still open: Post the letter/.test(text) && /What should I focus on tomorrow\?/.test(text), text);
  await today(page);
  await page.click('#plDaily');
  await waitReader(page);
  const at = await readerAt(page);
  ok(at.title === 'Daily Journal' && at.pages.includes(4), 'review page: ' + JSON.stringify(at));
  const pages = await page.evaluate(() => Object.fromEntries([...Daybook.state.pages].filter(([k]) => k.startsWith('daily~')).map(([k, p]) => [k, p.text.slice(0, 20)])));
  ok(pages['daily~1'].startsWith('A slow morning') && pages['daily~3'].startsWith('Wrote the plan') && pages['daily~4'].startsWith('Daily review'), 'existing pages must be untouched: ' + JSON.stringify(pages));
  await page.evaluate(() => Daybook.closeReader()); await waitRoom(page);
  await today(page);
  ok(await page.evaluate(() => document.querySelector('#plDaily').textContent === 'Open'), 'the review should be offered to open again');
  await page.click('#plDaily'); await waitReader(page);
  ok((await readerAt(page)).pages.includes(4) && (await page.evaluate(() => [...Daybook.state.pages.keys()].filter(k => /^daily~/.test(k)).length)) === 4, 'opening again must not add a page');
}, { seed: { lib: baseLib({
  habits: [{ id: 'hr', name: 'Read', days: [0, 1, 2, 3, 4, 5, 6], start: shift(-10), done: { [TODAY]: true } }, { id: 'hw', name: 'Walk', days: [0, 1, 2, 3, 4, 5, 6], start: shift(-10), done: {} }],
  tasks: [{ id: 'a', text: 'Pay the bill', date: TODAY, done: true, created: 1 }, { id: 'b', text: 'Post the letter', date: TODAY, done: false, created: 2 }] }), pages: basePages } });

await test('with nothing recorded, a review says so instead of showing zeros', async page => {
  const t = await page.evaluate(d => Daybook.reviewText('daily', d), '2025-01-15');
  ok(/Writing: nothing written on this day yet/.test(t) && /Mood: not recorded/.test(t) && /Habits: none set up/.test(t) && /Tasks: none on this day/.test(t) && /What mattered most that day\?/.test(t), t);
  const w = await page.evaluate(d => Daybook.reviewText('weekly', d), '2025-01-15');
  ok(/Weekly review · 13 Jan 2025 – 19 Jan 2025/.test(w) && /nothing written this week/.test(w) && /Mood: not recorded this week/.test(w) && /Tasks: none this week/.test(w), w);
});

await test('a weekly review counts the week’s writing, moods, habits and tasks', async page => {
  const w = await page.evaluate(() => Daybook.reviewText('weekly', '2026-10-21'));
  ok(/Weekly review · 19 Oct – 25 Oct/.test(w) && /Writing: on 2 of \d days, 2 pages, 16 words/.test(w) && /Mood: recorded on 2 days, most often Great \(average 4\.5 of 5\)/.test(w) && /Habits: Run 2 of 3/.test(w) && /Tasks: 1 of 2 done/.test(w) && /Done: Book the train/.test(w) && /Next week’s priorities/.test(w), w);
}, { seed: { lib: baseLib({
  habits: [{ id: 'hr', name: 'Run', days: [1, 3, 5], start: '2026-10-01', done: { '2026-10-19': true, '2026-10-23': true } }],
  tasks: [{ id: 'a', text: 'Book the train', date: '2026-10-20', done: true, created: 1 }, { id: 'b', text: 'Pack', date: '2026-10-22', done: false, created: 2 }] }), pages: {
  'daily~1': { j: 'daily', n: 1, text: 'one two three four five six seven eight', date: '2026-10-19', mood: 5, updatedAt: 1 },
  'daily~2': { j: 'daily', n: 2, text: 'nine ten eleven twelve thirteen fourteen fifteen sixteen', date: '2026-10-21', mood: 4, updatedAt: 2 },
  'daily~3': { j: 'daily', n: 3, text: 'Weekly review · 19 Oct – 25 Oct  #review lots of words that must not be counted', date: '2026-10-21', mood: 0, updatedAt: 3 } } } });

await browser.close();
console.log(failed ? `\n${failed} test(s) failed` : '\nall passed');
process.exit(failed ? 1 : 0);

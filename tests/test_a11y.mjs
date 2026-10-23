// Keyboard and accessibility: names for every control, dialogs that take and give back focus, keyboard-only journaling,
// visible focus, tap target sizes and Escape. (Automated checks only; this is not a full WCAG audit.)
// Needs: npm i playwright-core, Google Chrome, internet (three.js CDN). Rebuild first: python3 build.py
// Run: node tests/test_a11y.mjs [path/to/index.html]     ONLY="text" runs just the matching tests.
import { chromium } from 'playwright-core';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = path.resolve(process.argv[2] || path.join(here, '..', 'index.html'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

let failed = 0;
const ok = (c, m) => { if (!c) throw new Error(m); };
const seed = { lib: { v: 4, activeId: 'daily', journals: [{ id: 'daily', title: 'Daily Journal', pages: 2 }], settings: { welcomed: true, animate: false } }, pages: { 'daily~1': { j: 'daily', n: 1, text: 'A page to read.', date: '2026-10-20', mood: 3 } } };
async function fresh(ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...ctxOpts });
  await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('daybook3d:v1', JSON.stringify(s)); sessionStorage.setItem('seeded', '1'); } }, seed);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(pathToFileURL(html).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.Daybook && window.Daybook.R3 && document.querySelector('#loader.gone'), null, { timeout: 60000 });
  return { ctx, page, errors };
}
async function test(name, fn, ctxOpts) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  let t; try { t = await fresh(ctxOpts); } catch (e) { failed++; console.log('FAIL', name, '\n    page did not load:', e.message.split('\n')[0]); return; }
  try { await fn(t.page, t); ok(!t.errors.length, 'console/page errors: ' + t.errors.join(' | ')); console.log('PASS', name); }
  catch (e) { failed++; console.log('FAIL', name, '\n   ', e.message); }
  await t.ctx.close();
}
const active = page => page.evaluate(() => { const a = document.activeElement; return { id: a.id, tag: a.tagName, in: (a.closest('[role=dialog], .drawer, #soundPop') || {}).id || '' }; });
const waitReader = page => page.waitForFunction(() => document.querySelector('#reader.show') && Daybook.R3.paused, null, { timeout: 30000 });
// visible controls with no accessible name (aria-label, labelledby, a label, their text, title or placeholder)
const unnamed = page => page.evaluate(() => {
  const vis = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !el.closest('[hidden], [aria-hidden="true"]'); };
  const name = el => { const l = el.getAttribute('aria-label'); if (l && l.trim()) return l; const lb = el.getAttribute('aria-labelledby'); if (lb) return lb.split(' ').map(i => (document.getElementById(i) || {}).textContent || '').join(' ').trim(); if (el.labels && el.labels.length) return [...el.labels].map(x => x.textContent).join(' ').trim(); if (!/INPUT|SELECT|TEXTAREA/.test(el.tagName) && el.textContent.trim()) return el.textContent.trim(); return el.getAttribute('title') || el.getAttribute('placeholder') || ''; };
  return [...document.querySelectorAll('button, input:not([type=hidden]), select, textarea, [role=tab], [role=switch], [role=option], a[href]')].filter(vis).filter(el => !name(el)).map(el => el.outerHTML.slice(0, 100));
});

await test('every visible control has a name, in the room, every library tab, the reader and its panels, and the new dialogs', async page => {
  const misses = {};
  const look = async label => { const u = await unnamed(page); if (u.length) misses[label] = u; };
  await look('room');
  for (const tab of ['journals', 'today', 'calendar', 'insights', 'settings']) { await page.evaluate(t => Daybook.openDrawer(t), tab); await page.waitForTimeout(300); await look('library ' + tab); }
  await page.evaluate(() => Daybook.closeDrawer()); await page.waitForTimeout(600);
  await page.evaluate(() => Daybook.openJournal('daily', 1)); await waitReader(page); await look('reader');
  for (const pop of ['pen', 'paper', 'decor', 'tpl', 'mark', 'more']) { await page.click(`#reader [data-pop="${pop}"]`); await page.waitForTimeout(250); await look('reader ' + pop); }
  await page.keyboard.press('Escape');
  await page.click('#rFocus'); await look('focus writing'); await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k'); await page.waitForSelector('#qnav'); await look('quick navigation'); await page.keyboard.press('Escape');
  ok(!Object.keys(misses).length, 'controls without a name: ' + JSON.stringify(misses));
});

await test('dialogs take focus when they open, keep Tab inside, and give focus back when they close', async page => {
  for (const [opener, dialog] of [['#bNew', 'designer'], ['#bCustomize', 'roomCustomModal']]) {
    await page.focus(opener); await page.keyboard.press('Enter');
    await page.waitForFunction(d => document.activeElement.closest('#' + d), dialog, { timeout: 5000 }).catch(() => { throw new Error(dialog + ' did not take focus'); });
    for (let i = 0; i < 30; i++) { await page.keyboard.press('Tab'); const a = await active(page); ok(a.in === dialog, `Tab left ${dialog} for #${a.id || a.tag}`); }
    await page.keyboard.press('Escape');
    await page.waitForFunction(o => document.activeElement === document.querySelector(o), opener, { timeout: 5000 }).catch(() => { throw new Error('focus did not come back to ' + opener + ' after ' + dialog); });
  }
  await page.focus('#bShelf'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement.closest('#drawer'), null, { timeout: 5000 }).catch(() => { throw new Error('the library did not take focus'); });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#drawer').hidden && document.activeElement.id === 'bShelf', null, { timeout: 5000 }).catch(() => { throw new Error('focus did not come back to the Library button'); });
});

await test('journaling works with the keyboard alone: write, plan a task, tick it and get back to the room', async page => {
  let tabs = 0;
  while ((await active(page)).id !== 'bToday' && tabs < 20) { await page.keyboard.press('Tab'); tabs++; }
  ok((await active(page)).id === 'bToday', 'Tab never reached Write today');
  await page.keyboard.press('Enter');
  await waitReader(page);
  await page.waitForFunction(() => document.activeElement.tagName === 'TEXTAREA', null, { timeout: 5000 }).catch(() => { throw new Error('the page did not get the caret'); });
  await page.keyboard.type('Written without a mouse.');
  await page.keyboard.press('Control+k'); await page.keyboard.type('today: habits'); await page.keyboard.press('Enter');
  await page.waitForSelector('#plTaskIn');
  await page.waitForFunction(() => document.activeElement.closest('#drawer'), null, { timeout: 5000 });
  tabs = 0; while ((await active(page)).id !== 'plTaskIn' && tabs < 40) { await page.keyboard.press('Tab'); tabs++; }
  ok((await active(page)).id === 'plTaskIn', 'Tab never reached the task field');
  await page.keyboard.type('Reply to Sam'); await page.keyboard.press('Enter');
  for (let i = 0; i < 4 && !(await page.evaluate(() => document.activeElement.matches('#plTasks .pl-check'))); i++) await page.keyboard.press('Shift+Tab');
  ok(await page.evaluate(() => document.activeElement.classList.contains('pl-check')), 'Shift+Tab should reach the task’s check box, not ' + JSON.stringify(await active(page)));
  await page.keyboard.press('Space');
  await page.waitForFunction(() => Daybook.state.lib.tasks[0] && Daybook.state.lib.tasks[0].done, null, { timeout: 5000 }).catch(() => { throw new Error('Space did not tick the task'); });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#drawer').hidden, null, { timeout: 5000 });
  ok(await page.evaluate(() => [...Daybook.state.pages.values()].some(p => /Written without a mouse\./.test(p.text))), 'the writing was not kept');
});

await test('focus is visible on the controls added for planning, navigation and focus writing', async page => {
  await page.evaluate(() => Daybook.openJournal('daily', 1)); await waitReader(page);
  await page.focus('#rFocus'); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');   // reach it by keyboard
  const o = await page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return { id: document.activeElement.id, style: cs.outlineStyle, width: cs.outlineWidth }; });
  ok(o.id === 'rFocus' && o.style !== 'none' && parseFloat(o.width) >= 2, 'focus ring: ' + JSON.stringify(o));
});

await test('the new controls are big enough to tap on a phone, and Escape closes each panel', async page => {
  await page.evaluate(() => Daybook.openDrawer('today')); await page.waitForSelector('#plHabits');
  await page.click('#plAddHabit'); await page.fill('#plHabitName', 'Walk'); await page.keyboard.press('Enter');
  await page.fill('#plTaskIn', 'Buy bread'); await page.keyboard.press('Enter');
  const small = await page.evaluate(() => [...document.querySelectorAll('#drBody button, #drBody input, #drBody select')].filter(el => el.offsetParent).map(el => { const r = el.getBoundingClientRect(); return { el: el.outerHTML.slice(0, 60), w: Math.round(r.width), h: Math.round(r.height) }; }).filter(x => x.w < 24 || x.h < 24));
  ok(!small.length, 'targets under 24 px: ' + JSON.stringify(small));
  for (const [open, gone] of [[() => Daybook.openDrawer('today'), () => document.querySelector('#drawer').hidden], [() => document.querySelector('#bSound').click(), () => document.querySelector('#soundPop').hidden], [() => Daybook.openRoomCustom('presets'), () => document.querySelector('#roomCustomModal').hidden]]) {
    await page.evaluate(open); await page.waitForTimeout(500); await page.keyboard.press('Escape');
    await page.waitForFunction(gone, null, { timeout: 5000 }).catch(() => { throw new Error('Escape did not close ' + open.toString()); });
  }
}, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

await browser.close();
console.log(failed ? `\n${failed} test(s) failed` : '\nall passed');
process.exit(failed ? 1 : 0);

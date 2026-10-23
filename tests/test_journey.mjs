// One realistic visit, start to finish, through the real controls: write and style a page, scrapbook it, turn pages,
// close and reopen, reload, search, focus writing, a habit, a task and a review, quick navigation, a phone-sized window,
// then a full backup, a change, a cancelled restore and a real restore. Fails on any console or page error.
// Needs: npm ci, Google Chrome, internet (three.js CDN). Rebuild first: python3 build.py
// Run: node tests/test_journey.mjs [path/to/index.html]
import { chromium } from 'playwright-core';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
// a build to test: a path (opened from disk), or an http(s) URL of a served copy (npm test serves one: browsers keep
// sessionStorage across a reload there, which Chromium on Linux does not always do for pages opened from disk)
const arg = process.argv[2] || '', served = /^https?:\/\//.test(arg);
const html = served ? path.join(here, '..', 'index.html') : path.resolve(arg || path.join(here, '..', 'index.html'));
const target = served ? arg : pathToFileURL(html).href;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'daybook-journey-'));
const ok = (c, m) => { if (!c) throw new Error(m); };
let step = 'start';
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
ctx.setDefaultNavigationTimeout(90000);   // the page waits for three.js from the CDN; slow machines need longer
const page = await ctx.newPage(); const errors = [];
page.on('pageerror', e => errors.push(step + ': ' + e));
page.on('console', m => { if (m.type() === 'error') errors.push(step + ': ' + m.text()); });
page.on('dialog', d => { errors.push(step + ': unexpected dialog ' + d.message()); d.dismiss().catch(() => {}); });
const at = s => { step = s; };
const ready = async () => { await page.waitForFunction(() => window.Daybook && window.Daybook.R3 && document.querySelector('#loader.gone'), null, { timeout: 60000 }); };
const readerUp = () => page.waitForFunction(() => document.querySelector('#reader.show') && document.querySelector('#flap').hidden && Daybook.R3.paused, null, { timeout: 30000 });
const roomBack = () => page.waitForFunction(() => document.querySelector('#reader').hidden && Daybook.R3.cam.mode === 'room' && !Daybook.R3.paused, null, { timeout: 30000 });
const saved = () => page.waitForFunction(() => !Daybook.unsaved() && document.querySelector('#rStatus').textContent !== 'Saving…', null, { timeout: 15000 });
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('daybook3d:v1')));
const leftText = '#spread .page[data-side="L"] textarea';
let failed = false;

try {
  at('launch: the room renders and the welcome appears on a first visit');
  await page.goto(target, { waitUntil: 'domcontentloaded' }); await ready();
  await page.waitForFunction(() => !document.querySelector('#welcome').hidden, null, { timeout: 60000 });   // its timer waits for the first frames, half a minute on slow machines
  ok(await page.evaluate(() => !!Daybook.R3 && !document.body.classList.contains('no3d')), 'the 3D room did not start');
  await page.click('#wLook');

  at('look around: the tour moves the camera and Escape ends it');
  await page.click('#bExplore'); await page.waitForFunction(() => Daybook.TOUR.active);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Escape');
  await page.waitForFunction(() => !Daybook.TOUR.active && Daybook.R3.cam.mode === 'room' && Daybook.R3.cam.t >= 1, null, { timeout: 20000 });

  at('open a journal and write');
  await page.click('#bToday'); await readerUp();
  await page.click(leftText); await page.keyboard.type('Journey day: café, rain and a long walk. #journey');
  at('change pen, ink and paper, set a mood, bookmark the page, add a sticker');
  await page.click('#reader [data-pop="pen"]'); await page.click('#pop .pen-card:nth-child(4)');
  await page.click('#reader [data-pop="paper"]'); await page.click('#pop .paper-t:nth-child(2)');
  await page.keyboard.press('Escape');
  await page.click('#spread .page[data-side="L"] [aria-label="Mood: Good"]');
  await page.click('#reader [data-pop="mark"]'); await page.fill('#bmLabel', 'Journey'); await page.evaluate(() => [...document.querySelectorAll('#pop button')].find(b => /Bookmark this page/.test(b.textContent)).click());
  await page.click('#reader [data-pop="decor"]'); await page.click('#pop [aria-label="Add sticker 🌙"]');
  await page.keyboard.press('Escape');
  await saved();
  const j0 = await page.evaluate(() => Daybook.state.lib.activeId);
  const p1 = (await stored()).pages[j0 + '~1'];
  ok(p1 && p1.text.includes('Journey day') && p1.mood === 4 && p1.style && p1.items.some(i => i.s === '🌙'), 'page 1 was not stored with its style, mood and sticker: ' + JSON.stringify(p1));
  ok((await stored()).lib.journals.find(j => j.id === j0).bookmarks.some(b => b.label === 'Journey'), 'the bookmark was not stored');

  at('turn pages, write on page 3, close and reopen');
  await page.click('#rNext'); await page.waitForFunction(() => [...document.querySelectorAll('#spread .page')].some(p => p.dataset.n === '3'), null, { timeout: 15000 });
  await page.click(leftText); await page.keyboard.type('Page three, after the turn.');
  await saved();
  await page.click('#rClose'); await roomBack();
  await page.click('#bShelf'); await page.click('#drList .jl-item'); await readerUp();
  ok(await page.evaluate(() => [...document.querySelectorAll('#spread .page textarea')].some(t => /Page three/.test(t.value))), 'reopening did not return to the last page');
  await page.click('#rClose'); await roomBack();

  at('reload: everything is still there');
  await page.reload({ waitUntil: 'domcontentloaded' }); await ready();
  ok(await page.evaluate(j => Daybook.state.pages.get(j + '~1').text.includes('Journey day') && Daybook.state.pages.get(j + '~3').text.includes('Page three'), j0), 'pages lost after the reload');

  at('search for a phrase and open the exact page');
  await page.click('#bShelf'); await page.fill('#drSearch', 'cafe rain');
  await page.click('#drResults .res'); await readerUp();
  ok(await page.evaluate(() => [...document.querySelectorAll('#spread .page textarea')].some(t => /Journey day/.test(t.value))), 'search did not open the page');

  at('focus writing in and out');
  await page.click('#rFocus'); ok(await page.evaluate(() => document.querySelector('#reader').classList.contains('focus')), 'focus mode did not start');
  await page.keyboard.press('Escape'); ok(await page.evaluate(() => !document.querySelector('#reader').classList.contains('focus') && !!document.querySelector('#reader.show')), 'Escape should only leave focus mode');

  at('quick navigation to Today; a habit, a task and a daily review');
  await page.keyboard.press('Control+k'); await page.keyboard.type('today: habits'); await page.keyboard.press('Enter');
  await page.waitForSelector('#plHabits');
  await page.click('#plAddHabit'); await page.fill('#plHabitName', 'Write daily'); await page.keyboard.press('Enter');
  await page.click('#plHabits .pl-check');
  await page.fill('#plTaskIn', 'Plan the weekend'); await page.keyboard.press('Enter');
  await page.click('#plTasks .pl-task .pl-check');
  await page.click('#plDaily'); await readerUp();
  const review = await page.evaluate(() => [...Daybook.state.pages.values()].find(p => /#review/.test(p.text)));
  ok(review && /Habits: 1 of 1 done/.test(review.text) && /Tasks: 1 of 1 done/.test(review.text), 'the review did not use what was recorded: ' + (review && review.text));
  await page.click('#rClose'); await roomBack();

  at('a phone-sized window: nothing overflows and a journal still opens');
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(800);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'the page scrolls sideways on a phone');
  await page.evaluate(() => Daybook.openJournal(Daybook.state.lib.activeId, 1)); await readerUp();
  ok(await page.evaluate(() => document.querySelector('#reader').classList.contains('single')), 'phones should show one page');
  await page.evaluate(() => Daybook.closeReader()); await roomBack();
  await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(800);

  at('export a full backup');
  await page.evaluate(() => Daybook.openDrawer('settings'));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => [...document.querySelectorAll('#bkCard button')].find(b => b.textContent.trim() === 'Export full backup').click())]);
  const file = path.join(tmp, dl.suggestedFilename()); await dl.saveAs(file);
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  ok(fs.statSync(file).size > 1000 && backup.format === 'daybook-backup' && backup.pages[j0 + '~1'].text.includes('Journey day') && backup.lib.habits.length === 1 && backup.lib.tasks.length === 1, 'the backup is incomplete');

  at('change something, then cancel a restore: nothing changes');
  await page.evaluate(j => { const p = Daybook.state.pages.get(j + '~1'); p.text = 'Changed after the backup.'; }, j0);
  await page.evaluate(() => Daybook.closeDrawer()); await page.waitForTimeout(500);
  await page.evaluate(() => Daybook.openJournal(Daybook.state.lib.activeId, 1)); await readerUp();
  await page.click(leftText); await page.keyboard.press('End'); await page.keyboard.type(' More.'); await saved();
  await page.click('#rClose'); await roomBack();
  const choose = async () => {
    await page.evaluate(() => Daybook.openDrawer('settings'));
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.evaluate(() => [...document.querySelectorAll('#bkCard button')].find(b => /Restore from a backup/.test(b.textContent)).click())]);
    await fc.setFiles(file); await page.waitForSelector('#bkCard .confirm');
  };
  await choose();
  await page.evaluate(() => [...document.querySelectorAll('#bkCard button')].find(b => b.textContent.trim() === 'Cancel').click());
  ok((await stored()).pages[j0 + '~1'].text === 'Changed after the backup. More.', 'cancelling changed the stored page');

  at('restore for real: the safety copy downloads and the backup comes back');
  await choose();
  const [safety] = await Promise.all([page.waitForEvent('download'), page.waitForEvent('framenavigated', { timeout: 30000 }), page.evaluate(() => [...document.querySelectorAll('#bkCard button')].find(b => /Replace everything/.test(b.textContent)).click())]);
  ok(/^daybook-before-restore-\d{4}-\d{2}-\d{2}-\d{6}\.json$/.test(safety.suggestedFilename()), 'safety copy name: ' + safety.suggestedFilename());
  await ready();
  await page.waitForFunction(() => document.querySelector('#toast').textContent === 'Backup restored.', null, { timeout: 15000 });
  ok(await page.evaluate(j => Daybook.state.pages.get(j + '~1').text.includes('Journey day') && Daybook.state.lib.habits.length === 1 && Daybook.state.lib.tasks[0].done, j0), 'the restored data does not match the backup');

  at('the end');
  ok(!errors.length, 'console/page errors: ' + errors.join(' | '));
  console.log('PASS a whole visit, from the first look around to a restored backup');
} catch (e) {
  failed = true;
  console.log('FAIL a whole visit, from the first look around to a restored backup\n    at "' + step + '": ' + e.message + (errors.length ? '\n    errors: ' + errors.join(' | ') : ''));
}
fs.rmSync(tmp, { recursive: true, force: true });
await browser.close();
console.log(failed ? '\n1 test(s) failed' : '\nall passed');
process.exit(failed ? 1 : 0);

// Saving and recovering unsaved writing: the save status, Ctrl+S, failed saves, drafts across a reload, conflicts, the PIN.
// Needs: npm i playwright-core, Google Chrome, internet (three.js CDN). Rebuild first: python3 build.py
// Run: node tests/test_saving.mjs [path/to/index.html]     ONLY="text" runs just the matching tests.
import { chromium } from 'playwright-core';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
// a build to test: a path (opened from disk), or an http(s) URL of a served copy (npm test serves one: browsers keep
// sessionStorage across a reload there, which Chromium on Linux does not always do for pages opened from disk)
const arg = process.argv[2] || '', served = /^https?:\/\//.test(arg);
const html = served ? path.join(here, '..', 'index.html') : path.resolve(arg || path.join(here, '..', 'index.html'));
const target = served ? arg : pathToFileURL(html).href;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

let failed = 0;
const ok = (c, m) => { if (!c) throw new Error(m); };
const KEY = 'daybook3d:v1';
const lib = { v: 4, activeId: 'daily', journals: [{ id: 'daily', title: 'Daily Journal', pages: 2 }], settings: { welcomed: true, animate: false } };
const pages = { 'daily~1': { j: 'daily', n: 1, text: 'Saved first page.', date: '2026-10-20', mood: 0, updatedAt: 1000 }, 'daily~2': { j: 'daily', n: 2, text: 'Saved second page.', date: '2026-10-21', mood: 0, updatedAt: 2000 } };

async function waitReady(page) {
  await page.waitForFunction(() => window.Daybook && window.Daybook.R3 && document.querySelector('#loader.gone'), null, { timeout: 60000 });
}
// seed: localStorage before the first load only; draft: a sessionStorage draft left by an earlier load of this tab
async function fresh({ seed = { lib, pages }, draft = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  ctx.setDefaultNavigationTimeout(90000);   // the page waits for three.js from the CDN; slow machines need longer
  await ctx.addInitScript(([s, d]) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('daybook3d:v1', JSON.stringify(s)); if (d) sessionStorage.setItem('daybook3d:draft:' + d.key, JSON.stringify(d.value));
    sessionStorage.setItem('seeded', '1');
  }, [seed, draft]);
  const page = await ctx.newPage(); const errors = [];
  // CPU_THROTTLE=n slows the page's CPU n times, to reproduce slow machines such as CI runners
  if (process.env.CPU_THROTTLE) await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: +process.env.CPU_THROTTLE });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(target, { waitUntil: 'domcontentloaded' }); await waitReady(page);
  return { ctx, page, errors };
}
async function test(name, fn, opts) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  let t; try { t = await fresh(opts); } catch (e) { failed++; console.log('FAIL', name, '\n    page did not load:', e.message.split('\n')[0]); return; }
  try { await fn(t.page, t); ok(!t.errors.length, 'console/page errors: ' + t.errors.join(' | ')); console.log('PASS', name); }
  catch (e) { failed++; console.log('FAIL', name, '\n   ', e.message); }
  await t.ctx.close();
}
// browser storage refuses any write holding the marker, as a full storage does (other pages still save)
const failWrites = (page, marker) => page.evaluate(m => { const real = window.__realSet = window.__realSet || Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (this === localStorage && String(v).includes(m)) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return real.call(this, k, v); }; }, marker);
const healWrites = page => page.evaluate(() => { if (window.__realSet) Storage.prototype.setItem = window.__realSet; });
const open = async (page, n = 1) => { await page.evaluate(n => Daybook.openJournal('daily', n), n); await page.waitForFunction(() => document.querySelector('#reader.show') && Daybook.R3.paused, null, { timeout: 30000 }); };
const typeOn = async (page, side, text) => { await page.click(`#spread .page[data-side="${side}"] textarea`); await page.keyboard.press('End'); await page.keyboard.type(text); };
const status = page => page.evaluate(() => document.querySelector('#rStatus').textContent);
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('daybook3d:v1')).pages);
const drafts = page => page.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith('daybook3d:draft:')));
const toastSays = (page, re) => page.waitForFunction(r => new RegExp(r).test(document.querySelector('#toast').textContent), re.source, { timeout: 15000 });
const reload = async page => { await page.reload({ waitUntil: 'domcontentloaded' }); await waitReady(page); };
const recoverShown = page => page.waitForSelector('#recover', { timeout: 15000 }).catch(async () => { throw new Error('no recovery dialog; the tab held ' + JSON.stringify(await page.evaluate(() => ({ drafts: Object.keys(sessionStorage).filter(k => k.startsWith('daybook3d:draft:')).map(k => sessionStorage.getItem(k)), stored: (JSON.parse(localStorage.getItem('daybook3d:v1')).pages['daily~1'] || {}).text, open: (Daybook.state.pages.get('daily~1') || {}).text })))); });

await test('a failed save says Not saved yet, stays so while another page saves, and Ctrl+S never claims Saved', async page => {
  await open(page);
  await failWrites(page, 'FAILME');
  await typeOn(page, 'L', ' FAILME one');
  await page.waitForFunction(() => document.querySelector('#rStatus').textContent === 'Not saved yet', null, { timeout: 15000 });
  await toastSays(page, /no room left/);
  await typeOn(page, 'R', ' two');   // this page does save
  await page.waitForFunction(() => Daybook.state.pages.get('daily~2').text.endsWith(' two') && JSON.parse(localStorage.getItem('daybook3d:v1')).pages['daily~2'].text.endsWith(' two'), null, { timeout: 15000 });
  await page.waitForTimeout(300);
  ok(await status(page) === 'Not saved yet', 'another page saving made the status say: ' + await status(page));
  await page.keyboard.press('Control+s');
  await toastSays(page, /^Not saved yet/);
  ok(!(await stored(page))['daily~1'].text.includes('FAILME'), 'page 1 should not be stored yet');
  await healWrites(page);
  await page.keyboard.press('Control+s');
  await toastSays(page, /^Saved\.$/);
  ok(await status(page) === 'Saved', 'status after the retry: ' + await status(page));
  ok((await stored(page))['daily~1'].text.endsWith('FAILME one'), 'the retried page was not stored');
  ok(!(await drafts(page)).length, 'a saved page should leave no draft behind');
});

await test('writing that could not be saved survives a reload and is restored only when asked', async page => {
  await open(page);
  await failWrites(page, 'FAILME');
  await typeOn(page, 'L', ' FAILME kept café ✨');
  await page.waitForFunction(() => document.querySelector('#rStatus').textContent === 'Not saved yet', null, { timeout: 15000 });
  await page.waitForFunction(() => Object.keys(sessionStorage).some(k => k === 'daybook3d:draft:daily~1'), null, { timeout: 5000 });
  await reload(page);
  await recoverShown(page);
  const shown = await page.evaluate(() => document.querySelector('#recover').textContent);
  ok(/Daily Journal · page 1/.test(shown) && shown.includes('FAILME kept café ✨') && /Saved now: “Saved first page\.”/.test(shown), 'recovery dialog: ' + shown);
  ok(!/saved again after this writing/.test(shown), 'not a conflict: the stored page is the one the writing started from');
  ok(await page.evaluate(() => Daybook.state.pages.get('daily~1').text) === 'Saved first page.', 'nothing may change before the visitor chooses');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.closest('#recover') !== null), 'focus should be in the dialog');
  await page.click('#recover .rc-item .btn.solid');
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('daybook3d:v1')).pages['daily~1'] || {}).text === 'Saved first page. FAILME kept café ✨', null, { timeout: 15000 });
  await page.waitForFunction(() => !document.querySelector('#recover'), null, { timeout: 5000 });
  ok(!(await drafts(page)).length, 'the draft should be gone once the restored page is saved');
});

await test('keeping the saved page discards the draft deliberately, and Decide later asks again next time', async page => {
  await open(page);
  await failWrites(page, 'FAILME');
  await typeOn(page, 'L', ' FAILME unwanted');
  await page.waitForFunction(() => Object.keys(sessionStorage).some(k => k === 'daybook3d:draft:daily~1'), null, { timeout: 15000 });
  await reload(page);
  await recoverShown(page);
  await page.keyboard.press('Escape');   // decide later
  ok(!(await page.$('#recover')) && (await drafts(page)).length === 1, 'Decide later must keep the draft');
  ok(await page.evaluate(() => document.querySelector('#drawer').hidden && Daybook.R3.cam.mode === 'room'), 'Escape on the dialog must not do anything else');
  await reload(page);
  await recoverShown(page);
  await page.click('#recover .rc-item .btn:not(.solid)');
  ok(!(await drafts(page)).length, 'Keep the saved page must remove the draft');
  ok(await page.evaluate(() => Daybook.state.pages.get('daily~1').text) === 'Saved first page.', 'the saved page must stay as it was');
  await reload(page); await page.waitForTimeout(800);
  ok(!(await page.$('#recover')), 'a discarded draft must not come back');
});

await test('a draft older than the saved page is flagged as a conflict and never applied by itself', async page => {
  await open(page);
  await failWrites(page, 'FAILME');
  await typeOn(page, 'L', ' FAILME older');
  await page.waitForFunction(() => Object.keys(sessionStorage).some(k => k === 'daybook3d:draft:daily~1'), null, { timeout: 15000 });
  // another tab saves a newer version of the same page meanwhile
  await page.evaluate(() => { const m = JSON.parse(localStorage.getItem('daybook3d:v1')); m.pages['daily~1'] = { ...m.pages['daily~1'], text: 'Newer text from another tab.', updatedAt: Date.now() + 5000 }; window.__realSet.call(localStorage, 'daybook3d:v1', JSON.stringify(m)); });
  await reload(page);
  await recoverShown(page);
  const shown = await page.evaluate(() => document.querySelector('#recover').textContent);
  ok(/saved again after this writing/.test(shown) && shown.includes('Newer text from another tab.'), 'conflict not shown: ' + shown);
  ok(await page.evaluate(() => Daybook.state.pages.get('daily~1').text) === 'Newer text from another tab.', 'the newer saved text must be what is open');
});

await test('recovered writing is not shown before the PIN is entered', async page => {
  ok(await page.evaluate(() => !document.querySelector('#lock').hidden), 'the lock screen should be up');
  await page.waitForTimeout(800);
  ok(!(await page.$('#recover')), 'the draft was shown over the lock screen');
  for (const k of '2580') await page.keyboard.press(k);
  await recoverShown(page);
  ok(await page.evaluate(() => document.querySelector('#lock').hidden), 'unlocked');
}, { seed: { lib: { ...lib, settings: { ...lib.settings, pinHash: crypto.createHash('sha256').update('daybook:2580').digest('hex') } }, pages }, draft: { key: 'daily~1', value: { text: 'Secret unsaved line', date: '2026-10-20', mood: 0, base: 1000, at: Date.now() } } });

await test('text typed just before a reload is kept, saved or offered back', async page => {
  await open(page);
  await typeOn(page, 'L', ' typed right before reload');
  await reload(page);   // well inside the 700 ms save delay
  await page.waitForTimeout(1500);
  const kept = await page.evaluate(() => (Daybook.state.pages.get('daily~1') || {}).text || '');
  const offered = await page.evaluate(() => (document.querySelector('#recover') || {}).textContent || '');
  ok(kept.includes('typed right before reload') || offered.includes('typed right before reload'), 'the text was lost: ' + JSON.stringify({ kept, offered }));
});

await browser.close();
console.log(failed ? `\n${failed} test(s) failed` : '\nall passed');
process.exit(failed ? 1 : 0);

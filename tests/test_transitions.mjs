// Room <-> journal transition tests. Needs: npm i playwright-core, Google Chrome, internet (three.js CDN).
// Run: node tests/test_transitions.mjs [path/to/index.html]
import { chromium } from 'playwright-core';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = path.resolve(process.argv[2] || path.join(here, '..', 'index.html'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

let failed = 0;
async function fresh(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(pathToFileURL(html).href);
  await page.waitForFunction(() => window.Daybook && window.Daybook.R3 && document.querySelector('#loader.gone'), null, { timeout: 30000 });
  await page.evaluate(() => { const b = document.querySelector('#wLook'); if (b && !document.querySelector('#welcome').hidden) b.click(); });
  await page.waitForTimeout(300);
  return { ctx, page, errors };
}
const readerOpen = p => p.evaluate(() => { const r = document.querySelector('#reader'); return !r.hidden && r.classList.contains('show'); });
const readerHidden = p => p.evaluate(() => document.querySelector('#reader').hidden);
const camMode = p => p.evaluate(() => Daybook.R3.cam.mode);
// Software WebGL is slow, so wait on state instead of fixed sleeps.
const opened = p => p.waitForFunction(() => { const r = document.querySelector('#reader'); return !r.hidden && r.classList.contains('show') && Daybook.R3.cam.t >= 1 && Daybook.R3.paused; }, null, { timeout: 25000 });
const closed = p => p.waitForFunction(() => document.querySelector('#reader').hidden && Daybook.R3.cam.mode === 'room' && Daybook.R3.cam.t >= 1 && !Daybook.R3.paused, null, { timeout: 25000 });
const settle = (p, ms = 3500) => p.waitForTimeout(ms);
const firstId = p => p.evaluate(() => Daybook.state.lib.journals[0].id);

async function test(name, fn, opts) {
  const t = await fresh(opts);
  try { await fn(t.page, t.errors); console.log('PASS', name); }
  catch (e) { failed++; console.log('FAIL', name, '\n   ', e.message); }
  await t.ctx.close();
}
const ok = (c, m) => { if (!c) throw new Error(m); };

await test('open reaches the desk, shows the reader, and close returns to the room', async (p, errs) => {
  const id = await firstId(p);
  await p.evaluate(i => Daybook.openJournal(i), id);
  await opened(p);
  ok(await readerOpen(p), 'reader should be visible');
  ok(await camMode(p) === 'desk', 'camera should be in desk mode');
  await p.evaluate(() => Daybook.closeReader());
  await closed(p);
  ok(await readerHidden(p), 'reader should be hidden after close');
  ok(await camMode(p) === 'room', 'camera should be back in room mode');
  ok(await p.evaluate(() => !Daybook.R3.paused), 'render loop should be running again');
  ok(!errs.length, 'page errors: ' + errs.join('; '));
});

await test('Escape closes the reader', async p => {
  await p.evaluate(i => Daybook.openJournal(i), await firstId(p));
  await opened(p);
  await p.locator('#reader textarea:visible').first().focus();
  await p.keyboard.press('Escape');
  await closed(p);
  ok(await readerHidden(p), 'reader should be hidden after Escape');
  ok(await camMode(p) === 'room', 'camera should be in room mode');
});

await test('Escape during the approach cancels the open', async p => {
  const id = await firstId(p);
  await p.evaluate(i => Daybook.openJournal(i), id);
  await p.waitForTimeout(250);
  await p.keyboard.press('Escape');
  await closed(p);
  await settle(p, 2500);
  ok(await readerHidden(p), 'reader must not open after cancel');
  ok(await camMode(p) === 'room', 'camera should return to room');
});

await test('rapid repeated opens produce one reader and no stuck state', async (p, errs) => {
  const id = await firstId(p);
  await p.evaluate(i => { for (let k = 0; k < 6; k++) Daybook.openJournal(i); }, id);
  await opened(p);
  ok(await readerOpen(p), 'reader should be open once');
  await p.evaluate(() => { Daybook.closeReader(); Daybook.closeReader(); });
  await closed(p);
  ok(await readerHidden(p) && await camMode(p) === 'room', 'should be closed and in room mode');
  ok(!errs.length, 'page errors: ' + errs.join('; '));
});

await test('close then immediate reopen ends open, not stuck', async p => {
  const id = await firstId(p);
  await p.evaluate(i => Daybook.openJournal(i), id);
  await opened(p);
  await p.evaluate(i => { Daybook.closeReader(); setTimeout(() => Daybook.openJournal(i), 100); }, id);
  await p.waitForTimeout(800);
  await opened(p);
  ok(await readerOpen(p), 'reader should be open after quick reopen');
  ok(await camMode(p) === 'desk', 'camera should be at the desk');
  ok(await p.evaluate(() => Daybook.R3.paused), 'room render should be paused behind the reader');
});

await test('closing restores the look angle the visitor had', async p => {
  await p.evaluate(() => { const c = Daybook.R3.cam; c.yawG = c.yaw = .12; c.pitchG = c.pitch = .05; });
  await p.evaluate(i => Daybook.openJournal(i), await firstId(p));
  await opened(p);
  await p.evaluate(() => Daybook.closeReader());
  await closed(p);
  const { yaw, pitch } = await p.evaluate(() => ({ yaw: Daybook.R3.cam.yawG, pitch: Daybook.R3.cam.pitchG }));
  ok(Math.abs(yaw - .12) < 1e-6 && Math.abs(pitch - .05) < 1e-6, `look angle lost: ${yaw}, ${pitch}`);
});

await test('typed text survives an immediate close', async p => {
  const id = await firstId(p);
  await p.evaluate(i => Daybook.openJournal(i), id);
  await opened(p);
  const ta = p.locator('#reader textarea:visible').first();
  await ta.focus();
  await p.keyboard.type('unsaved words survive');
  await p.evaluate(() => Daybook.closeReader());
  await closed(p);
  const saved = await p.evaluate(() => Array.from(Daybook.state.pages.values()).some(pg => (pg.text || '').includes('unsaved words survive')));
  const stored = await p.evaluate(() => (localStorage.getItem('daybook3d:v1') || '').includes('unsaved words survive'));
  ok(saved && stored, `text lost (memory=${saved}, storage=${stored})`);
});

await test('opening from free explore leaves explore and clears held keys', async p => {
  await p.evaluate(() => Daybook.startFreeExplore());
  await p.waitForFunction(() => Daybook.R3.cam.mode === 'explore' && Daybook.R3.cam.t >= 1, null, { timeout: 25000 });
  ok(await camMode(p) === 'explore', 'should be exploring');
  await p.keyboard.down('w');
  await p.evaluate(i => Daybook.openJournal(i), await firstId(p));
  await opened(p);
  await p.keyboard.up('w');
  ok(await readerOpen(p), 'reader should open');
  ok(await p.evaluate(() => document.querySelector('#exploreHud').hidden), 'explore HUD should be hidden');
  ok(await p.evaluate(() => !Object.values(Daybook.R3.cam.explore.keys).some(Boolean)), 'movement keys should be cleared');
});

await test('typing W/A/S/D in the reader does not move the camera', async p => {
  await p.evaluate(i => Daybook.openJournal(i), await firstId(p));
  await opened(p);
  const before = await p.evaluate(() => Daybook.R3.cam.pos.toArray());
  await p.locator('#reader textarea:visible').first().focus();
  await p.keyboard.type('wasd');
  await p.waitForTimeout(500);
  const after = await p.evaluate(() => Daybook.R3.cam.pos.toArray());
  ok(JSON.stringify(before) === JSON.stringify(after), 'camera moved while typing');
});

await test('reduced motion: open and close without waiting on animations', async (p, errs) => {
  await p.evaluate(i => Daybook.openJournal(i), await firstId(p));
  await p.waitForTimeout(1200);
  ok(await readerOpen(p), 'reader should be open quickly');
  await p.evaluate(() => Daybook.closeReader());
  await p.waitForTimeout(900);
  ok(await readerHidden(p) && await camMode(p) === 'room', 'should close quickly');
  ok(!errs.length, 'page errors: ' + errs.join('; '));
}, { reducedMotion: 'reduce' });

await browser.close();
console.log(failed ? `\n${failed} test(s) failed` : '\nall passed');
process.exit(failed ? 1 : 0);

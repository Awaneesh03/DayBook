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
  // a first visit opens the welcome dialog ~1.4 s after boot: wait for it, then dismiss it, so it cannot pop up mid-test
  await page.waitForFunction(() => Daybook.S().welcomed || Daybook.S().pinHash || !document.querySelector('#welcome').hidden, null, { timeout: 20000 }).catch(() => {});
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
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
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

await test('closing while the cover is still opening lets it fall back instead of sweeping across the pages', async (p, errs) => {
  await p.evaluate(i => Daybook.openJournal(i), await firstId(p));
  // pause the room behind as soon as the cover starts (the reader pauses it a moment later anyway) so frames keep coming
  await p.waitForFunction(() => { const on = document.querySelector('#flap').classList.contains('opening'); if (on) Daybook.R3.paused = true; return on; }, null, { timeout: 25000, polling: 'raf' });
  // record the cover's swing every frame, and where it was when Escape went down
  await p.evaluate(() => {
    const f = document.querySelector('#flap'), rd = document.querySelector('#reader');
    const deg = () => { const t = getComputedStyle(f).transform; if (!t || t === 'none') return 0; const m = new DOMMatrix(t); return Math.atan2(-m.m13, m.m11) * 180 / Math.PI; };
    const s = window.__cover = { frames: [], esc: null };
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !s.esc) s.esc = { deg: deg(), i: s.frames.length }; }, true);
    (function tick() { s.frames.push({ deg: f.hidden ? null : deg(), readerUp: !rd.hidden }); if (!rd.hidden || !s.esc) requestAnimationFrame(tick); })();
  });
  await p.keyboard.press('Escape');
  await closed(p);
  const { frames, esc } = await p.evaluate(() => window.__cover);
  const after = frames.slice(esc.i);
  const widest = Math.max(...after.filter(f => f.deg !== null).map(f => Math.abs(f.deg)));
  ok(widest <= Math.abs(esc.deg) + 3, `the cover swung open to ${widest.toFixed(0)} deg after Escape at ${esc.deg.toFixed(0)} deg`);
  ok(!after.some(f => f.deg === null && f.readerUp), 'the cover vanished while the reader was still showing');
  ok(await p.evaluate(() => { const f = document.querySelector('#flap'); return f.hidden && f.className === 'flap' && !document.querySelector('#book').classList.contains('opening'); }), 'cover and book should be back at rest');
  ok(!errs.length, 'page errors: ' + errs.join('; '));
});

/* ---- looking out of the window ---- */
// where the window's left pane is on screen (CSS pixels), once a frame has used the current camera
const windowAt = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => {
  const R3 = Daybook.R3, v = R3.win.localToWorld(new THREE.Vector3(-.2, .2, .03)).project(R3.camera), b = R3.renderer.domElement.getBoundingClientRect();
  r([b.left + (v.x + 1) / 2 * b.width, b.top + (1 - v.y) / 2 * b.height]);
}))));
// Real pixels: render once, read back the middle of the screen and return the share that is outside sky or skyline
// (by day bright and blue-dominant, at night dark and blue). A room view scores about .3 by day and .5 at night.
const outsideShare = (p, night) => p.evaluate(night => {
  const R3 = Daybook.R3, gl = R3.renderer.getContext(); R3.renderer.render(R3.scene, R3.camera);
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, w = W * .4 | 0, h = H * .5 | 0, a = new Uint8Array(w * h * 4);
  gl.readPixels(W * .3 | 0, H * .25 | 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, a);
  let n = 0, hit = 0;
  for (let i = 0; i < a.length; i += 36) { n++; const L = .2126 * a[i] + .7152 * a[i + 1] + .0722 * a[i + 2]; if (night ? L < 80 && a[i + 2] > a[i] : a[i + 2] - a[i] >= 15 && L > 110) hit++; }
  return hit / n;
}, night);
const setSky = async (p, s) => { await p.evaluate(s => { Daybook.S().sky = s; Daybook.applySettings(); }, s); await p.waitForFunction(() => Daybook.R3.night === Daybook.R3.nightG, null, { timeout: 25000 }); };
const peeked = p => p.waitForFunction(() => Daybook.R3.cam.mode === 'peek' && Daybook.R3.cam.t >= 1 && Math.abs(Daybook.R3.curtOpen - 1) < .002, null, { timeout: 25000 });
const backInRoom = p => p.waitForFunction(() => Daybook.R3.cam.mode === 'room' && Daybook.R3.cam.t >= 1, null, { timeout: 25000 });

await test('looking out of the window shows the sky and skyline by day and by night, then gives back the same view', async (p, errs) => {
  await p.evaluate(() => { const c = Daybook.R3.cam; c.yawG = c.yaw = -.1; c.pitchG = c.pitch = -.03; });
  await setSky(p, 'day');
  const [x, y] = await windowAt(p);
  await p.mouse.click(x, y);                                     // the window in the room, then its pop-up
  await p.getByRole('button', { name: 'Look outside (Peek)' }).click();
  await peeked(p);
  const day = await outsideShare(p, false);
  ok(day > .4, `by day the view should be mostly sky and skyline, got ${day.toFixed(2)}`);
  await p.click('#peekExit');
  await backInRoom(p);
  const v = await p.evaluate(() => ({ yaw: Daybook.R3.cam.yawG, pitch: Daybook.R3.cam.pitchG, bar: document.querySelector('#peekHud').hidden }));
  ok(Math.abs(v.yaw + .1) < 1e-6 && Math.abs(v.pitch + .03) < 1e-6, `look angle lost: ${v.yaw}, ${v.pitch}`);
  ok(v.bar, 'the peek bar should be gone');
  await setSky(p, 'night');
  await p.evaluate(() => Daybook.lookOutside());
  await peeked(p);
  const night = await outsideShare(p, true);
  ok(night > .6, `at night the view should be mostly night sky and skyline, got ${night.toFixed(2)}`);
  await p.keyboard.press('Escape');
  await backInRoom(p);
  ok(!errs.length, 'page errors: ' + errs.join('; '));
});

await test('a peek parts drawn curtains only while looking, and leaves free explore cleanly', async (p, errs) => {
  await p.evaluate(() => { Daybook.S().curtainsOpen = false; Daybook.applyRoomStyle(); });
  await p.waitForFunction(() => Daybook.R3.curtOpen < .002, null, { timeout: 25000 });
  await p.evaluate(() => Daybook.lookOutside());
  await peeked(p);
  ok(await p.evaluate(() => Daybook.S().curtainsOpen === false), 'peeking must not change the saved curtains');
  await p.click('#peekExit');
  await p.waitForFunction(() => Daybook.R3.cam.mode === 'room' && Daybook.R3.cam.t >= 1 && Daybook.R3.curtOpen < .002, null, { timeout: 25000 });
  await p.evaluate(() => Daybook.startFreeExplore());
  await p.waitForFunction(() => Daybook.R3.cam.mode === 'explore' && Daybook.R3.cam.t >= 1, null, { timeout: 25000 });
  await p.evaluate(() => Daybook.lookOutside());
  await p.waitForFunction(() => Daybook.R3.cam.mode === 'peek' && Daybook.R3.cam.t >= 1, null, { timeout: 25000 });
  ok(await p.evaluate(() => document.querySelector('#exploreHud').hidden), 'the explore bar should go when peeking');
  await p.click('#peekExit');                                    // fails if the explore bar still covers it
  await backInRoom(p);
  ok(await p.evaluate(() => document.querySelector('#peekHud').hidden && document.querySelector('#exploreHud').hidden), 'both bars should be gone');
  ok(!errs.length, 'page errors: ' + errs.join('; '));
});

await browser.close();
console.log(failed ? `\n${failed} test(s) failed` : '\nall passed');
process.exit(failed ? 1 : 0);

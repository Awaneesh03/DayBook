// Guided tour HUD tests: start, progress, Previous/Next, first and last stops, Finish, Exit, Escape, focus,
// keyboard isolation, cancellation by other modes, reduced motion and phone width.
// Needs: npm i playwright-core, Google Chrome, internet (three.js CDN). Rebuild first: python3 build.py
// Run: node tests/test_tour.mjs [path/to/index.html]     ONLY="text" runs just the matching tests.
import { chromium } from 'playwright-core';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = path.resolve(process.argv[2] || path.join(here, '..', 'index.html'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

// The stops, read from the source so the tests follow the data.
const cat = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(here, '..', 'src', 'j1_core.js'), 'utf8'), cat);
const STOPS = vm.runInContext('TOUR_STOPS.map(s => ({ label: s.label, desc: s.desc, pos: s.pos.map(v => +v.toFixed(2)).join(), ppos: s.portrait ? s.portrait.pos.map(v => +v.toFixed(2)).join() : null }))', cat);
const N = STOPS.length;

let failed = 0;
const ok = (c, m) => { if (!c) throw new Error(m); };
async function waitReady(page) {
  await page.waitForFunction(() => window.Daybook && window.Daybook.R3 && document.querySelector('#loader.gone'), null, { timeout: 60000 });
  // a first visit opens the welcome dialog ~1.4 s after boot: wait for it, then dismiss it, so it cannot pop up mid-test
  await page.waitForFunction(() => Daybook.S().welcomed || Daybook.S().pinHash || !document.querySelector('#welcome').hidden, null, { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => { const b = document.querySelector('#wLook'); if (b && !document.querySelector('#welcome').hidden) b.click(); });
}
async function fresh({ reduced = false, viewport = { width: 1280, height: 800 } } = {}) {
  const ctx = await browser.newContext({ viewport, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  ctx.setDefaultNavigationTimeout(90000);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try { await page.goto(pathToFileURL(html).href, { waitUntil: 'domcontentloaded' }); await waitReady(page); }
  catch (e) { await ctx.close(); throw e; }
  return { ctx, page, errors };
}
async function test(name, fn, opts) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  let t;
  try { t = await fresh(opts); } catch (e) { failed++; console.log('FAIL', name, '\n    page did not load:', e.message.split('\n')[0]); return; }
  try { await fn(t.page, t); ok(!t.errors.length, 'console/page errors: ' + t.errors.join(' | ')); console.log('PASS', name); }
  catch (e) { failed++; console.log('FAIL', name, '\n   ', e.message); }
  await t.ctx.close();
}

// Everything the bar shows, plus the tour state behind it.
const hud = page => page.evaluate(() => {
  const q = s => document.querySelector(s), dots = [...document.querySelectorAll('#tourDots .tour-dot')];
  return {
    shown: getComputedStyle(q('#tourHud')).display !== 'none', active: Daybook.TOUR.active, index: Daybook.TOUR.index,
    count: q('#tourCount').textContent, title: q('#tourStopTitle').textContent, desc: q('#tourStopDesc').textContent,
    prevDisabled: q('#tourPrev').disabled, next: q('#tourNext').textContent.trim(), nextLabel: q('#tourNext').getAttribute('aria-label'),
    dots: dots.length, activeDot: dots.findIndex(d => d.classList.contains('active')), current: dots.findIndex(d => d.getAttribute('aria-current') === 'step'),
    // where the camera is heading; with reduced motion it is placed there directly, without a transition target
    camTo: (matchMedia('(prefers-reduced-motion: reduce)').matches ? Daybook.R3.cam.pos : Daybook.R3.cam.toPos).toArray().map(v => +v.toFixed(2)).join(),
    mode: Daybook.R3.cam.mode, portrait: innerWidth / innerHeight < .85
  };
});
// The bar must show stop i consistently: text, progress, controls, dots and the camera's destination.
async function expectStop(page, i) {
  const h = await hud(page);
  ok(h.shown && h.active, `stop ${i + 1}: the tour bar should be showing (${JSON.stringify(h)})`);
  ok(h.index === i && h.count === `Stop ${i + 1} of ${N}`, `progress should read Stop ${i + 1} of ${N}, got "${h.count}" (index ${h.index})`);
  ok(h.title === STOPS[i].label && h.desc === STOPS[i].desc, `stop ${i + 1} text: "${h.title}" / "${h.desc}"`);
  ok(h.prevDisabled === (i === 0), `Previous should be ${i === 0 ? 'disabled' : 'enabled'} on stop ${i + 1}`);
  ok(h.next === (i === N - 1 ? 'Finish' : 'Next') && h.nextLabel === (i === N - 1 ? 'Finish the tour' : 'Next stop'), `stop ${i + 1}: Next reads "${h.next}" (${h.nextLabel})`);
  ok(h.dots === N && h.activeDot === i && h.current === i, `dots should mark stop ${i + 1}: ${h.dots} dots, active ${h.activeDot}, current ${h.current}`);
  const want = h.portrait && STOPS[i].ppos ? STOPS[i].ppos : STOPS[i].pos;   // tall screens use a stop's portrait pose if it has one
  ok(h.mode === 'tour' && h.camTo === want, `the camera should head for stop ${i + 1} (${want}), got ${h.mode} ${h.camTo}`);
}
const hidden = page => page.evaluate(() => getComputedStyle(document.querySelector('#tourHud')).display === 'none' && !Daybook.TOUR.active);
const focused = (page, sel) => page.waitForFunction(s => document.activeElement && document.activeElement.matches(s), sel, { timeout: 5000 }).then(() => true, () => false);
const backInRoom = page => page.waitForFunction(() => Daybook.R3.cam.mode === 'room' && Daybook.R3.cam.t >= 1, null, { timeout: 30000 });

await test('the Tour button opens the bar on the first stop with progress, text and controls', async page => {
  ok(await hidden(page), 'the tour bar must be hidden before the tour starts');
  await page.click('#bExplore');
  await expectStop(page, 0);
  ok(await focused(page, '#tourNext'), 'focus should move to Next so keyboard users can carry on');
  const r = await page.evaluate(() => { const b = document.querySelector('#tourHud').getBoundingClientRect(); return [b.left, b.right, b.bottom, innerWidth, innerHeight]; });
  ok(r[0] >= 0 && r[1] <= r[3] && r[2] <= r[4], 'the bar should sit inside the window: ' + r);
});

await test('Next, Previous and the dots walk the stops and keep the progress in step', async page => {
  await page.click('#bExplore');
  await page.click('#tourNext'); await expectStop(page, 1);
  await page.click('#tourNext'); await expectStop(page, 2);
  await page.click('#tourPrev'); await expectStop(page, 1);
  await page.click('#tourDots .tour-dot:nth-child(5)'); await expectStop(page, 4);
  await page.keyboard.press('ArrowLeft'); await expectStop(page, 3);
  await page.keyboard.press('ArrowRight'); await expectStop(page, 4);
});

await test('the first stop holds: Previous is disabled and ArrowLeft does nothing', async page => {
  await page.click('#bExplore');
  await page.evaluate(() => document.querySelector('#tourPrev').click());   // a disabled button ignores clicks
  await page.keyboard.press('ArrowLeft');
  await expectStop(page, 0);
});

await test('the last stop turns Next into Finish; ArrowRight stops there and Finish ends the tour', async page => {
  await page.click('#bExplore');
  for (let i = 0; i < N + 2; i++) await page.keyboard.press('ArrowRight');
  await expectStop(page, N - 1);
  await page.click('#tourNext');
  ok(await hidden(page), 'Finish should end the tour and hide the bar');
  await backInRoom(page);
});

await test('Exit tour and Escape end the tour, hide the bar and hand focus back', async page => {
  await page.focus('#bExplore'); await page.keyboard.press('Enter');        // start from the keyboard
  await expectStop(page, 0);
  ok(await focused(page, '#tourNext'), 'focus should be on Next');
  await page.keyboard.press('Enter'); await expectStop(page, 1);            // Enter on the focused Next button
  await page.keyboard.press('Escape');
  ok(await hidden(page), 'Escape should end the tour');
  ok(await focused(page, '#bExplore'), 'focus should return to the Tour button');
  await backInRoom(page);
  await page.click('#bExplore'); await page.click('#tourNext');
  await page.click('#tourExit');
  ok(await hidden(page), 'Exit tour should end the tour');
  await backInRoom(page);
});

await test('tour keys stand down while typing or while another panel is open', async page => {
  await page.click('#bExplore'); await page.keyboard.press('ArrowRight'); await expectStop(page, 1);
  // the library drawer: arrows and typing leave the tour alone, Escape closes the drawer first
  await page.click('#bShelf');
  await page.waitForFunction(() => document.querySelector('#drawer').classList.contains('open'));
  await page.keyboard.press('ArrowRight');
  await page.click('#drSearch'); await page.keyboard.type('ab'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight');
  let h = await hud(page); ok(h.index === 1 && h.active, 'the tour moved while the library was open: ' + h.index);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#drawer').classList.contains('open'));
  h = await hud(page); ok(h.active && h.index === 1, 'Escape should close the library before the tour');
  // the sounds panel: same rule
  await page.click('#bSound');
  await page.keyboard.press('ArrowRight');
  h = await hud(page); ok(h.index === 1, 'the tour moved while the sounds panel was open');
  await page.keyboard.press('Escape');
  ok(await page.evaluate(() => document.querySelector('#soundPop').hidden && Daybook.TOUR.active), 'Escape should close the sounds panel before the tour');
  await page.keyboard.press('Escape');
  ok(await hidden(page), 'with nothing on top, Escape ends the tour');
});

await test('other modes cancel the tour and hide its bar', async page => {
  await page.click('#bExplore');
  await page.click('#bExploreFree');
  ok(await hidden(page), 'free explore should end the tour');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('#exploreHud')).display !== 'none'), 'the explore bar should show');
  await page.click('#bExplore');                                           // and the tour ends free explore in turn
  await expectStop(page, 0);
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('#exploreHud')).display === 'none'), 'starting the tour should close the explore bar');
  await page.evaluate(() => Daybook.lookOutside());
  ok(await hidden(page), 'looking outside should end the tour');
  await page.evaluate(() => Daybook.exitLookOutside()); await backInRoom(page);
  await page.click('#bExplore');
  await page.click('#bToday');                                             // write today: the journal opens, the tour ends
  ok(await hidden(page), 'opening a journal should end the tour');
  await page.waitForFunction(() => { const r = document.querySelector('#reader'); return !r.hidden && r.classList.contains('show'); }, null, { timeout: 30000 });
  await page.keyboard.type('xy');                                          // typing in the journal never reaches the tour
  ok(await hidden(page), 'the tour must stay closed while writing');
});

await test('reduced motion: every stop is reached at once, with no camera animation', async page => {
  await page.click('#bExplore');
  const at = () => page.evaluate(() => [Daybook.R3.cam.t, Daybook.R3.cam.pos.toArray().map(v => +v.toFixed(2)).join()]);
  let a = await at(); ok(a[0] === 1 && a[1] === STOPS[0].pos, 'stop 1 should be reached instantly: ' + a);
  await page.click('#tourNext');
  a = await at(); ok(a[0] === 1 && a[1] === STOPS[1].pos, 'stop 2 should be reached instantly: ' + a);
  await expectStop(page, 1);
}, { reduced: true });

for (const [w, hgt] of [[390, 844], [320, 640]]) await test(`phone width ${w}px: the header's Tour button starts the tour; the bar fits and keeps the top controls clear`, async page => {
  // with a PIN set the lock button joins the header: the most crowded case
  await page.evaluate(() => { document.querySelector('#bLock').hidden = false; });
  const hd = await page.evaluate(() => {
    const r = e => e.getBoundingClientRect(), btns = [...document.querySelectorAll('.hud-btns .hb')].filter(b => getComputedStyle(b).display !== 'none');
    return { ids: btns.map(b => b.id).join(), brand: r(document.querySelector('.brand .mark')).right, first: r(btns[0]).left, last: r(btns[btns.length - 1]).right, overflow: document.querySelector('.hud').scrollWidth > innerWidth, name: document.querySelector('#bExplore').getAttribute('aria-label') };
  });
  ok(hd.ids.includes('bExplore') && hd.name === 'Room tour', 'the header should offer a named Tour button: ' + JSON.stringify(hd));
  ok(hd.brand <= hd.first && hd.last <= w && !hd.overflow, 'the header is crowded: ' + JSON.stringify(hd));
  await page.click('#bExplore');                                           // a real tap on the header button
  await expectStop(page, 0);
  const g = await page.evaluate(() => {
    const r = s => document.querySelector(s).getBoundingClientRect();
    const reach = s => { const b = r(s); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return b.width > 0 && b.left >= 0 && b.right <= innerWidth && b.bottom <= innerHeight && document.querySelector(s).contains(e); };
    return { bar: r('#tourHud'), header: r('header.hud'), w: innerWidth, h: innerHeight, reach: ['#tourPrev', '#tourNext', '#tourExit', '#tourDots'].map(s => [s, reach(s)]) };
  });
  ok(g.bar.left >= 0 && g.bar.right <= g.w && g.bar.bottom <= g.h, 'the bar should fit the screen: ' + JSON.stringify(g.bar));
  ok(g.bar.top > g.header.bottom, 'the bar must not cover the top controls');
  for (const [s, okay] of g.reach) ok(okay, s + ' should be visible and clickable');
  await page.click('#tourNext'); await expectStop(page, 1);
  await page.keyboard.press('Escape');
  ok(await hidden(page), 'Escape should end the tour at phone width');
  ok(await focused(page, '#bExplore'), 'focus should return to the header Tour button');
  await page.keyboard.press('Enter');                                      // the keyboard can start it again from there
  await expectStop(page, 0);
  await page.click('#tourExit'); ok(await hidden(page), 'Exit should work at phone width');
}, { viewport: { width: w, height: hgt } });

// Projects each keepsake with the real camera at the stop, checks it sits between the header and the tour bar
// (measured from the DOM), that a ray from the camera reaches it first, and that it is big enough to make out.
for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) await test(`Study Keepsakes frames the globe, plant and radio clear of the header and tour bar (${vp.width}x${vp.height})`, async page => {
  await page.evaluate(() => Daybook.startRoomTour(5));
  await page.waitForFunction(() => Daybook.R3.cam.t >= 1, null, { timeout: 30000 });
  await page.waitForTimeout(300);
  const f = await page.evaluate(() => {
    const R3 = Daybook.R3, cam = R3.camera, V = cam.position.constructor; cam.updateMatrixWorld(true);
    const top = document.querySelector('header.hud').getBoundingClientRect().bottom, bottom = document.querySelector('#tourHud').getBoundingClientRect().top;
    const shown = o => { for (let x = o; x; x = x.parent) if (x.visible === false) return false; return true; };
    const out = {};
    for (const k of ['globe', 'plant', 'radio']) {
      const g = R3.movables.get(k).group; let bb = null; g.updateMatrixWorld(true);
      g.traverse(o => { if (!o.isMesh) return; o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); bb = bb ? bb.union(b) : b; });
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const X of [bb.min.x, bb.max.x]) for (const Y of [bb.min.y, bb.max.y]) for (const Z of [bb.min.z, bb.max.z]) {
        const s = new V(X, Y, Z).project(cam), sx = (s.x + 1) / 2 * innerWidth, sy = (1 - s.y) / 2 * innerHeight;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      R3.raycaster.set(cam.position, bb.getCenter(new V()).sub(cam.position).normalize());
      const hit = R3.raycaster.intersectObjects(R3.scene.children, true).find(h => h.object.isMesh && shown(h.object) && !h.object.material.transparent);
      let seen = false; for (let o = hit && hit.object; o; o = o.parent) if (o === g) seen = true;
      out[k] = { x0, x1, y0, y1, seen, inside: x0 >= 0 && x1 <= innerWidth && y0 >= top && y1 <= bottom };
    }
    return { top, bottom, out };
  });
  for (const [k, o] of Object.entries(f.out)) {
    ok(o.inside, `${k} is not fully in the clear area: x ${Math.round(o.x0)}-${Math.round(o.x1)}, y ${Math.round(o.y0)}-${Math.round(o.y1)} (clear band ${Math.round(f.top)}-${Math.round(f.bottom)})`);
    ok(o.seen, `${k} is hidden behind something`);
    ok(o.y1 - o.y0 >= 40, `${k} is too small to make out (${Math.round(o.y1 - o.y0)} px tall)`);
  }
}, { viewport: vp });

await browser.close();
console.log(failed ? `\n${failed} test(s) failed` : '\nall passed');
process.exit(failed ? 1 : 0);

// Stability tests: room materials, hidden panels, PIN lock, custom presets, starter presets.
// Needs: npm i playwright-core, Google Chrome, internet (three.js CDN). Rebuild first: python3 build.py
// Run: node tests/test_stability.mjs [path/to/index.html]     ONLY="text" runs just the matching tests.
//
// Material checks read real rendered pixels back from the WebGL canvas (software rendering in headless Chrome),
// not just material parameters.
import { chromium } from 'playwright-core';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = path.resolve(process.argv[2] || path.join(here, '..', 'index.html'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

let failed = 0;
const ok = (c, m) => { if (!c) throw new Error(m); };
async function waitReady(page) {
  await page.waitForFunction(() => window.Daybook && window.Daybook.R3 && document.querySelector('#loader.gone'), null, { timeout: 60000 });
  // a first visit opens the welcome dialog ~1.4 s after boot: wait for it, then dismiss it, so it cannot pop up mid-test
  await page.waitForFunction(() => Daybook.S().welcomed || Daybook.S().pinHash || !document.querySelector('#welcome').hidden, null, { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => { const b = document.querySelector('#wLook'); if (b && !document.querySelector('#welcome').hidden) b.click(); });
}
async function reload(page) { await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 }); await waitReady(page); }
// seed: a saved library ({ lib, pages }) to place in localStorage before the first load only. url: load this instead of the file.
async function fresh({ seed = null, url = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  ctx.setDefaultNavigationTimeout(90000);
  if (seed) await ctx.addInitScript(v => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('daybook3d:v1', v); sessionStorage.setItem('seeded', '1'); window.__seededNow = true; } }, seed);
  const page = await ctx.newPage();
  // CPU_THROTTLE=n slows the page's CPU n times (Chrome DevTools emulation), to stress timing while hunting flakes
  if (process.env.CPU_THROTTLE) await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: +process.env.CPU_THROTTLE });
  const errors = [], dialogs = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => { dialogs.push(d.type() + ': ' + d.message()); d.dismiss().catch(() => {}); });
  try { await page.goto(url || pathToFileURL(html).href, { waitUntil: 'domcontentloaded' }); await waitReady(page); }
  catch (e) { await ctx.close(); throw e; }
  return { ctx, page, errors, dialogs };
}
async function test(name, fn, opts) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  let t;
  try { t = await fresh(opts); } catch (e) { failed++; console.log('FAIL', name, '\n    page did not load:', e.message.split('\n')[0]); return; }
  try {
    await fn(t.page, t);
    ok(!t.errors.length, 'console/page errors: ' + t.errors.join(' | '));
    ok(!t.dialogs.length, 'native dialogs opened: ' + t.dialogs.join(' | '));
    console.log('PASS', name);
  } catch (e) { failed++; console.log('FAIL', name, '\n   ', e.message); }
  await t.ctx.close();
}

/* ---- rendering helpers ---- */
const frames = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
// Real pixels: render once, then read back points on the shelf boards' front edges, the desk top, a pot and a curtain.
const sampleRoom = page => page.evaluate(() => {
  const R3 = Daybook.R3, cam = R3.camera, gl = R3.renderer.getContext(), V = cam.position.constructor;
  const boxOf = o => { o.updateMatrixWorld(true); o.geometry.computeBoundingBox(); return o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); };
  const meshes = m => { const r = []; R3.scene.traverse(o => { if (o.isMesh && o.material === m) r.push(o); }); return r; };
  R3.renderer.render(R3.scene, cam);
  const px = (x, y, z) => {
    const v = new V(x, y, z).project(cam); if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return null;
    const a = new Uint8Array(4); gl.readPixels(Math.round((v.x + 1) / 2 * gl.drawingBufferWidth), Math.round((v.y + 1) / 2 * gl.drawingBufferHeight), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, a);
    return [a[0], a[1], a[2]];
  };
  const shelf = meshes(R3.mats.shelf).map(boxOf).filter(b => b.max.x - b.min.x > 1.5).flatMap(b => [-.75, .4, .75].map(x => px(x, (b.min.y + b.max.y) / 2, b.max.z + .001)));
  const top = meshes(R3.mats.desk).map(boxOf).find(b => b.max.x - b.min.x > 1.6 && b.max.z - b.min.z > .6);
  const desk = [-.75, -.55, .75].map(x => px(x, top.max.y + .001, top.max.z - .04));
  const cb = boxOf(R3.curtLeft.children[0]);
  const curtain = [.3, .5, .7].map(f => px((cb.min.x + cb.max.x) / 2, cb.min.y + (cb.max.y - cb.min.y) * f, cb.max.z + .002));
  const pb = meshes(R3.potMat).map(boxOf)[0];
  const pot = [px((pb.min.x + pb.max.x) / 2, (pb.min.y + pb.max.y) / 2, pb.max.z)];
  const m = x => ({ roughness: x.roughness, metalness: x.metalness });
  return { shelf, desk, curtain, pot, mats: { shelf: m(R3.mats.shelf), desk: m(R3.mats.desk), pot: m(R3.potMat), curtainTint: R3.curtMat.color.getHexString() } };
});
const lum = c => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
const median = list => { const s = list.filter(Boolean).sort((a, b) => lum(a) - lum(b)); return s[s.length >> 1]; };
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const cos = (a, b) => { const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; const n = Math.hypot(...a) * Math.hypot(...b); return n ? d / n : 0; };
const FABRIC = { ochre: '#B4823E', cream: '#DED6C5', sage: '#5B7A6A', navy: '#2A3B56', burgundy: '#782631' };
const FINISH = { satin: [.52, .08], matte: [.86, .02], gloss: [.24, .22] };
async function setRoom(page, o) {
  await page.evaluate(o => { Object.assign(Daybook.S(), o); Daybook.applySettings(); Daybook.applyRoomStyle(); Daybook.R3.night = Daybook.R3.nightG; }, o);
  await frames(page);
}

/* ---------------------------- room materials ---------------------------- */

await test('shelves, desk, pots and curtains render in colour, never black, by day and night', async page => {
  const runs = [['day', 'satin', 'ochre'], ['day', 'matte', 'navy'], ['day', 'gloss', 'sage'], ['day', 'satin', 'cream'], ['day', 'matte', 'burgundy'],
    ['night', 'gloss', 'ochre'], ['night', 'satin', 'navy'], ['night', 'matte', 'sage'], ['night', 'gloss', 'cream'], ['night', 'satin', 'burgundy']];
  for (const [sky, finish, fabric] of runs) {
    await setRoom(page, { sky, weather: 'clear', woodFinish: finish, curtainColor: fabric });
    const s = await sampleRoom(page), tag = `${sky}/${finish}/${fabric}`;
    for (const k of ['shelf', 'desk']) {
      ok(s.mats[k].roughness === FINISH[finish][0] && s.mats[k].metalness === FINISH[finish][1], `${tag}: ${k} material ${JSON.stringify(s.mats[k])}`);
      const c = median(s[k]); ok(c && lum(c) > (sky === 'day' ? 30 : 4), `${tag}: ${k} renders too dark ${JSON.stringify(c)}`);
      ok(c[0] > c[2], `${tag}: ${k} should look like wood (red over blue), got ${JSON.stringify(c)}`);
    }
    ok(s.mats.pot.roughness === .8 && s.mats.pot.metalness === 0, `${tag}: pot material ${JSON.stringify(s.mats.pot)}`);
    ok(lum(s.pot[0]) > 20, `${tag}: pot renders black ${JSON.stringify(s.pot)}`);
    ok(s.mats.curtainTint === 'ffffff', `${tag}: the curtain material must not tint its fabric, got #${s.mats.curtainTint}`);
    const c = median(s.curtain);
    ok(c && Math.max(...c) >= (sky === 'day' ? 8 : 3), `${tag}: curtain renders black ${JSON.stringify(s.curtain)}`); // the bug gave exactly 0,0,0
    ok(cos(c, hexRgb(FABRIC[fabric])) > (sky === 'day' ? .97 : .9), `${tag}: curtain colour ${JSON.stringify(c)} is not ${fabric}`);
  }
});

await test('the customizer chips change the finish and the curtain fabric on screen', async page => {
  await setRoom(page, { sky: 'day', weather: 'clear' });
  const chip = (tab, label) => page.evaluate(([tab, label]) => {
    Daybook.openRoomCustom(tab); [...document.querySelectorAll('#rcBody .chip')].find(b => b.textContent.trim() === label).click();
  }, [tab, label]);
  await chip('furniture', 'Polished Varnish');
  await chip('window', 'Midnight navy');
  await page.evaluate(() => Daybook.closeRoomCustom()); await frames(page);
  const s = await sampleRoom(page);
  ok(s.mats.shelf.roughness === .24, 'the gloss chip did not reach the shelf material: ' + JSON.stringify(s.mats.shelf));
  ok(cos(median(s.curtain), hexRgb(FABRIC.navy)) > .97, 'the navy chip did not recolour the curtain: ' + JSON.stringify(s.curtain));
  ok(await page.evaluate(() => [Daybook.S().woodFinish, Daybook.S().curtainColor].join()) === 'gloss,navy', 'choices not stored');
});

await test('starter presets only use catalogue values that exist, and Rainy Evening gets ebony', async page => {
  const ctx = vm.createContext({ window: {} });
  for (const f of ['j1_core.js', 'j12_turn.js']) vm.runInContext(fs.readFileSync(path.join(here, '..', 'src', f), 'utf8'), ctx);
  const C = vm.runInContext('({ STARTER_PRESETS, WALLS, WOODS, LAMPS, FINISH_STYLES, LAMP_STYLES, CURTAIN_COLORS, CLOCK_STYLES, WEATHER_MODES, POT_STYLES, ART_STYLES })', ctx);
  const allowed = { wall: C.WALLS, wood: C.WOODS, lampTone: C.LAMPS, woodFinish: C.FINISH_STYLES, lampStyle: C.LAMP_STYLES, curtainColor: C.CURTAIN_COLORS,
    clockStyle: C.CLOCK_STYLES, weather: C.WEATHER_MODES, potStyle: C.POT_STYLES, artStyle: C.ART_STYLES, sky: { auto: 1, day: 1, night: 1 }, clockMode: { analog: 1, digital: 1, both: 1 } };
  const bad = [];
  for (const p of C.STARTER_PRESETS) for (const [k, v] of Object.entries(p.settings)) if (allowed[k] && !Object.prototype.hasOwnProperty.call(allowed[k], v)) bad.push(`${p.id}.${k}=${v}`);
  ok(!bad.length, 'preset values with no catalogue entry (they silently fall back): ' + bad.join(', '));
  await page.evaluate(() => { Daybook.applyPreset('rainy_evening'); Daybook.closeRoomCustom(); });
  const w = await page.evaluate(() => [Daybook.S().wood, Daybook.R3.mats.woodKey]);
  ok(w[0] === 'ebony' && w[1] === 'ebony', 'Rainy Evening should apply ebony wood, got ' + w);
  await setRoom(page, { sky: 'day', weather: 'clear' });
  const ebony = median((await sampleRoom(page)).shelf);
  await page.evaluate(() => { Daybook.S().wood = 'walnut'; Daybook.applyRoomStyle(); }); await frames(page);
  const walnut = median((await sampleRoom(page)).shelf);
  ok(lum(ebony) > 8 && lum(ebony) < lum(walnut), `ebony should read as a darker wood than walnut, got ${JSON.stringify(ebony)} vs ${JSON.stringify(walnut)}`);
});

/* ---------------------------- hidden elements ---------------------------- */

await test('closed panels are not displayed, never cover the room, and appear only while open', async page => {
  const shown = sel => page.evaluate(s => getComputedStyle(document.querySelector(s)).display !== 'none', sel);
  const stray = await page.evaluate(() => [...document.querySelectorAll('[hidden]')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.id || e.className));
  ok(!stray.length, 'elements with the hidden attribute are still displayed: ' + stray.join(', '));
  const top = await page.evaluate(() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return e.id === 'scene' ? '' : `${e.tagName}#${e.id}.${e.className} (${getComputedStyle(e).display})`; });
  ok(!top, 'something covers the room: ' + top);
  const cycle = async (name, sel, open, close) => {
    await page.evaluate(open);
    await page.waitForFunction(s => getComputedStyle(document.querySelector(s)).display !== 'none', sel, { timeout: 10000 }).catch(() => { throw new Error(name + ' did not appear'); });
    await page.evaluate(close);
    await page.waitForFunction(s => getComputedStyle(document.querySelector(s)).display === 'none', sel, { timeout: 10000 }).catch(() => { throw new Error(name + ' did not go away'); });
  };
  await cycle('library drawer', '#drawer', () => Daybook.openDrawer('journals'), () => Daybook.closeDrawer());
  await cycle('sounds panel', '#soundPop', () => document.querySelector('#bSound').click(), () => document.querySelector('#bSound').click());
  await cycle('room customizer', '#roomCustomModal', () => Daybook.openRoomCustom('presets'), () => Daybook.closeRoomCustom());
  await cycle('cover studio', '#designer', () => document.querySelector('#bNew').click(), () => document.querySelector('#dClose').click());
  await cycle('tour bar', '#tourHud', () => Daybook.startRoomTour(0), () => Daybook.exitRoomTour());
  await page.evaluate(() => Daybook.startRoomTour(1));   // (the tour bar has no text or buttons in the markup yet; see CONTEXT.md)
  const stop = await page.evaluate(() => [Daybook.TOUR.index, Daybook.R3.cam.mode, Daybook.R3.cam.toPos.toArray().map(v => +v.toFixed(2)).join()]);
  ok(stop.join('|') === '1|tour|0,1.48,-1.15', 'the tour should fly to the bookshelf stop, got ' + stop);
  await page.evaluate(() => Daybook.exitRoomTour());
  await cycle('window peek bar', '#peekHud', () => Daybook.lookOutside(), () => Daybook.exitLookOutside());
  await cycle('explore bar', '#exploreHud', () => Daybook.startFreeExplore(), () => Daybook.exitFreeExplore());
  await page.evaluate(() => Daybook.startArrangeMode());
  ok(await shown('#arrangeHud') && await shown('#arrangeControls'), 'arrange mode should show the rotate/reset controls for the selected object');
  ok((await page.evaluate(() => document.querySelector('#arrangeSelectedName').textContent)).length > 0, 'the selected object should be named');
  await page.evaluate(() => Daybook.exitArrangeMode());
  ok(!(await shown('#arrangeHud')), 'the arrange bar should go away on exit');
  ok(!(await shown('#lock')), 'the lock screen must stay hidden without a PIN');
});

await test('the PIN lock appears only when set, unlocks from the keyboard, and survives a reload', async page => {
  const locked = () => page.evaluate(() => getComputedStyle(document.querySelector('#lock')).display !== 'none');
  ok(!(await locked()), 'without a PIN the lock screen must not show');
  await page.evaluate(() => { Daybook.openDrawer('settings'); [...document.querySelectorAll('#drBody button')].find(b => b.textContent === 'Set a PIN').click(); });
  await page.fill('#pinA', '2468'); await page.fill('#pinB', '2468');
  await page.evaluate(() => [...document.querySelectorAll('#drBody button')].find(b => b.textContent === 'Turn on lock').click());
  await page.waitForFunction(() => !!Daybook.S().pinHash, null, { timeout: 10000 });
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('#bLock')).display !== 'none'), 'the lock button should appear once a PIN is set');
  await page.evaluate(() => Daybook.closeDrawer());
  await page.evaluate(() => document.querySelector('#bLock').click());
  ok(await locked(), 'the lock button should show the lock screen');
  ok(await page.evaluate(() => document.querySelector('#lock').contains(document.elementFromPoint(innerWidth / 2, innerHeight / 2))), 'the lock screen must cover the room');
  ok(await page.evaluate(() => [...document.querySelectorAll('#lkKeys button')].every(b => b.tabIndex >= 0 && b.offsetParent !== null)), 'keypad buttons should be visible and focusable');
  await page.keyboard.press('Escape'); ok(await locked(), 'Escape must not unlock');
  await page.keyboard.type('1111'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => /not right/.test(document.querySelector('#lkMsg').textContent), null, { timeout: 10000 });
  ok(await locked(), 'a wrong PIN must keep it locked');
  await page.keyboard.type('2468');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#lock')).display === 'none', null, { timeout: 10000 });
  await reload(page);
  ok(await locked(), 'with a PIN set, Daybook should open locked');
  await page.keyboard.type('2468');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#lock')).display === 'none', null, { timeout: 10000 });
});

/* ---------------------------- custom presets ---------------------------- */

const openPresets = page => page.evaluate(() => Daybook.openRoomCustom('presets'));
const savedNames = page => page.evaluate(() => Object.values(Daybook.S().customPresets).map(p => p.name).sort());
const inCard = (page, title, label) => page.evaluate(([title, label]) => {
  const card = [...document.querySelectorAll('#rcBody .preset-card')].find(c => { const t = c.querySelector('.preset-card-title, input'); return t && (t.textContent === title || t.value === title); });
  if (!card) throw new Error('no preset card called ' + title);
  const b = [...card.querySelectorAll('button')].find(b => b.textContent === label);
  if (!b) throw new Error(title + ' has no ' + label + ' button');
  b.click();
}, [title, label]);
async function savePreset(page, name) {
  await openPresets(page);
  await page.fill('#rcBody input[placeholder^="Preset name"]', name);
  await page.evaluate(() => [...document.querySelectorAll('#rcBody button')].find(b => b.textContent === 'Save Preset').click());
}

await test('custom presets: create, apply, rename, delete with confirmation, and keep them across reloads', async page => {
  await page.evaluate(() => { Daybook.S().wall = 'navy'; Daybook.applyRoomStyle(); });
  await savePreset(page, 'Midnight Writer');
  ok(JSON.stringify(await savedNames(page)) === '["Midnight Writer"]', 'create: ' + JSON.stringify(await savedNames(page)));
  await page.evaluate(() => { Daybook.S().wall = 'blush'; Daybook.applyRoomStyle(); });
  await openPresets(page); await inCard(page, 'Midnight Writer', 'Apply');
  ok(await page.evaluate(() => Daybook.S().wall) === 'navy', 'apply should bring back the saved wall');
  // rename: Enter saves, Escape cancels without closing the customizer
  await openPresets(page); await inCard(page, 'Midnight Writer', 'Rename');
  const field = page.locator('#rcBody .preset-card input.inp');
  await field.waitFor();
  await page.waitForFunction(() => document.activeElement && document.activeElement.matches('#rcBody .preset-card input'), null, { timeout: 5000 })
    .catch(() => { throw new Error('the rename field should take focus'); });
  await field.fill('Night Owl'); await field.press('Enter');
  ok(JSON.stringify(await savedNames(page)) === '["Night Owl"]', 'rename: ' + JSON.stringify(await savedNames(page)));
  await inCard(page, 'Night Owl', 'Rename'); await page.locator('#rcBody .preset-card input.inp').press('Escape');
  ok(await page.evaluate(() => !document.querySelector('#roomCustomModal').hidden), 'Escape in the rename field should not close the customizer');
  ok(JSON.stringify(await savedNames(page)) === '["Night Owl"]', 'Escape should keep the name');
  // delete asks first; "Keep it" keeps it
  await savePreset(page, 'Morning Pages');
  await inCard(page, 'Morning Pages', 'Delete');
  ok(await page.evaluate(() => !!document.querySelector('#rcBody .preset-card .confirm')), 'delete should ask for confirmation inside the card');
  await inCard(page, 'Morning Pages', 'Keep it');
  ok(JSON.stringify(await savedNames(page)) === '["Morning Pages","Night Owl"]', 'Keep it should not delete');
  await inCard(page, 'Morning Pages', 'Delete'); await inCard(page, 'Morning Pages', 'Delete for good');
  ok(JSON.stringify(await savedNames(page)) === '["Night Owl"]', 'delete: ' + JSON.stringify(await savedNames(page)));
  // kept across a reload, stored as an object keyed by id
  await savePreset(page, 'Rainy Notes');
  await reload(page);
  ok(JSON.stringify(await savedNames(page)) === '["Night Owl","Rainy Notes"]', 'presets lost on reload: ' + JSON.stringify(await savedNames(page)));
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('daybook3d:v1')).lib.settings.customPresets);
  ok(stored && !Array.isArray(stored) && Object.values(stored).length === 2, 'stored form should be an object of two presets: ' + JSON.stringify(stored));
  await openPresets(page);
  ok((await page.evaluate(() => [...document.querySelectorAll('#rcBody .preset-card-title')].map(t => t.textContent))).includes('Rainy Notes'), 'the customizer should list saved presets after a reload');
  await inCard(page, 'Rainy Notes', 'Apply');
});

// Saved libraries that hold legacy or broken preset data; journals and other settings must come through untouched.
const BASE_LIB = { v: 4, activeId: 'daily', journals: [{ id: 'daily', title: 'My Daily', subtitle: '', order: 0, pages: 3 }], settings: { wall: 'blush', welcomed: true } };
const PAGES = { 'daily~1': { j: 'daily', n: 1, text: 'Keep this entry', date: '2026-10-20', updatedAt: 1 } };
const VARIANTS = [
  ['a legacy array', [{ id: 'custom_a', name: 'Kept A', wall: 'navy' }, { name: '  Kept B  ', wall: 'cream' }, null, 'junk', 7, ['nested'], { id: 'custom_a', name: 'Duplicate A' }], ['Kept A', 'Kept B']],
  ['an object with junk entries', { good: { id: 'good', name: 'Good one', wall: 'cream' }, nul: null, str: 'x', num: 5, arr: [1], noname: { wall: 'sage' }, badname: { name: 42 } }, ['Custom preset', 'Custom preset', 'Good one']],
  ['a string', 'oops', []],
  ['a number', 42, []],
  ['null', null, []]
];
for (const [label, presets, expectNames] of VARIANTS) {
  const seed = JSON.stringify({ lib: Object.assign({}, BASE_LIB, { settings: Object.assign({}, BASE_LIB.settings, { customPresets: presets }) }), pages: PAGES });
  await test(`saved presets as ${label} are cleaned up without touching journals or other settings`, async page => {
    const s = await page.evaluate(() => ({ presets: Daybook.S().customPresets, wall: Daybook.S().wall, title: Daybook.state.lib.journals[0].title, text: (Daybook.state.pages.get('daily~1') || {}).text }));
    ok(s.presets && typeof s.presets === 'object' && !Array.isArray(s.presets), 'customPresets should be an object, got ' + JSON.stringify(s.presets));
    ok(JSON.stringify(Object.values(s.presets).map(p => p.name).sort()) === JSON.stringify(expectNames), 'kept ' + JSON.stringify(s.presets));
    ok(s.wall === 'blush' && s.title === 'My Daily' && s.text === 'Keep this entry', 'other data changed: ' + JSON.stringify(s));
    await openPresets(page);
    const cards = await page.evaluate(() => [...document.querySelectorAll('#rcBody .preset-card-title')].length);
    ok(cards >= expectNames.length, 'customizer did not list the kept presets');
    await savePreset(page, 'Fresh');
    ok(await page.evaluate(() => Object.values(Daybook.S().customPresets).some(p => p.name === 'Fresh')), 'stage A: Fresh was not saved in memory before the reload');
    await reload(page);
    // If Fresh goes missing, say at which stage: seed re-run, never written to storage, or dropped while loading.
    ok(!(await page.evaluate(() => window.__seededNow === true)), 'stage B: the harness seed was applied again on reload');
    const after = await page.evaluate(() => ({ names: Object.values(Daybook.S().customPresets).map(p => p.name).sort(), text: (Daybook.state.pages.get('daily~1') || {}).text, raw: localStorage.getItem('daybook3d:v1') || '' }));
    ok(after.raw.includes('"name":"Fresh"'), 'stage C: storage has no Fresh after the reload, so the write never landed');
    ok(JSON.stringify(after.names) === JSON.stringify(expectNames.concat('Fresh').sort()), 'stage D: storage has Fresh but the loaded library shows ' + JSON.stringify(after.names));
    const stored = JSON.parse(after.raw).lib.settings.customPresets;
    ok(!Array.isArray(stored) && after.text === 'Keep this entry', 'stored form or journal text wrong: ' + JSON.stringify({ stored, text: after.text }));
  }, { seed });
}

/* ---- text encoding ---- */
// Many servers send text/html without a charset. The page has to declare UTF-8 itself, or the browser falls back to
// windows-1252: "Pages 1–2" reads "Pages 1â€“2", and symbols the app writes into journals (template boxes, stickers) get saved garbled.
const plain = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(fs.readFileSync(html)); });
await new Promise(r => plain.listen(0, '127.0.0.1', r));
await test('text, and the symbols the app saves, stay intact when a server names no charset', async page => {
  ok(await page.evaluate(() => document.characterSet) === 'UTF-8', 'page not read as UTF-8: ' + await page.evaluate(() => document.characterSet));
  await page.click('#bToday');
  await page.waitForFunction(() => { const r = document.querySelector('#reader'); return !r.hidden && r.classList.contains('show') && Daybook.R3.paused; }, null, { timeout: 30000 });
  const ui = await page.evaluate(() => { const pg = document.querySelector('.page'); return { count: document.querySelector('#rCount').textContent, num: pg.querySelector('.p-num').textContent, hint: pg._ta.placeholder, ink: pg._ink.textContent, loader: document.querySelector('#loader p').textContent }; });
  ok(/^Pages 1–2 of \d+ · /.test(ui.count) && ui.num === '— 1 —' && ui.hint.endsWith('Start writing…') && ui.loader === 'Lighting the lamp…', 'garbled text: ' + JSON.stringify(ui));
  ok(/^⁠+$/.test(ui.ink), 'the ink layer over an empty page should hold only invisible word joiners: ' + JSON.stringify(ui.ink));
  await page.click('[data-pop="tpl"]');
  await page.locator('#pop button', { hasText: 'To-do list' }).click();
  await page.click('[data-pop="decor"]');
  await page.locator('#pop [aria-label^="Add sticker"]').first().click();
  await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('daybook3d:v1') || '{}').pages || {}).some(pg => (pg.text || '').includes('To do') && (pg.items || []).length), null, { timeout: 20000 });
  const saved = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('daybook3d:v1')).pages).find(pg => (pg.text || '').includes('To do')));
  ok(saved.text.includes('To do\n☐ \n☐ \n') && saved.items.some(i => (i.s || i.e || i.t) === '🌙'), 'saved garbled: ' + JSON.stringify({ text: saved.text, items: saved.items }));
}, { url: `http://127.0.0.1:${plain.address().port}/` });
plain.close();

await browser.close();
console.log(failed ? `\n${failed} test(s) failed` : '\nall passed');
process.exit(failed ? 1 : 0);

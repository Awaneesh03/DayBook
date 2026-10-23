// Weather and ambient audio tests. Needs: npm i playwright-core, Google Chrome, internet (three.js CDN).
// Run: node tests/test_weather_audio.mjs [path/to/index.html]
//
// Audio is checked at signal level: an AnalyserNode tapped on the ambience master reads the real Web Audio
// graph in headless Chrome. Nothing here is listened to by a person.
// This Chrome does not enforce the autoplay policy even when asked to, so the "waits for a click" tests
// emulate it (new contexts start suspended and resume() only works after a user activation).
import { chromium } from 'playwright-core';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
// a build to test: a path (opened from disk), or an http(s) URL of a served copy (npm test serves one: browsers keep
// sessionStorage across a reload there, which Chromium on Linux does not always do for pages opened from disk)
const arg = process.argv[2] || '', served = /^https?:\/\//.test(arg);
const html = served ? path.join(here, '..', 'index.html') : path.resolve(arg || path.join(here, '..', 'index.html'));
const target = served ? arg : pathToFileURL(html).href;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });

// Runs in the page before the app: tracks sources that are still alive and intervals that are still ticking.
const INIT = () => {
  const A = window.__aud = { persist: new Set(), intervals: new Set() };
  const patchStart = P => { const o = P.start; P.start = function (...a) { if (a.length < 3) { A.persist.add(this); this.addEventListener('ended', () => A.persist.delete(this)); } return o.apply(this, a); }; };
  patchStart(AudioBufferSourceNode.prototype); patchStart(OscillatorNode.prototype);
  const oStop = AudioScheduledSourceNode.prototype.stop;
  AudioScheduledSourceNode.prototype.stop = function (...a) { A.persist.delete(this); return oStop.apply(this, a); };
  const si = window.setInterval, ci = window.clearInterval;
  window.setInterval = (...a) => { const id = si(...a); A.intervals.add(id); return id; };
  window.clearInterval = id => { A.intervals.delete(id); return ci(id); };
};
// Emulated autoplay policy (see the header). Playwright runs every evaluate() as a user gesture, which would flip the
// real navigator.userActivation at once, so shadow it: it becomes true only after a trusted click, tap or key (not Esc).
const STRICT = () => {
  let active = false;
  const mark = e => { if (e.isTrusted && !(e.type === 'keydown' && e.key === 'Escape')) active = true; };
  ['pointerdown', 'pointerup', 'keydown', 'touchend'].forEach(t => window.addEventListener(t, mark, true));
  Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { get hasBeenActive() { return active; }, get isActive() { return active; } } });
  const Real = window.AudioContext;
  window.AudioContext = class extends Real {
    constructor(...a) { super(...a); window.__ctxMade = (window.__ctxMade || 0) + 1; if (!active) super.suspend(); }
    resume() { if (!active) { window.__blocked = (window.__blocked || 0) + 1; return new Promise(() => {}); } return super.resume(); }
  };
};

let failed = 0;
const ok = (c, m) => { if (!c) throw new Error(m); };
const near = (a, b, tol = .02) => Math.abs(a - b) <= tol;

// The page needs Google Fonts and the three.js CDN, so loads get a generous budget and wait for the DOM, not "load".
async function waitReady(page) {
  await page.waitForFunction(() => window.Daybook && window.Daybook.R3 && document.querySelector('#loader.gone'), null, { timeout: 60000 });
  // a first visit opens the welcome dialog ~1.4 s after boot (half a minute on slow machines, whose first software-rendered frames hold up its timer): wait for it, then dismiss it, so it cannot pop up mid-test
  await page.waitForFunction(() => Daybook.S().welcomed || Daybook.S().pinHash || !document.querySelector('#welcome').hidden, null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { const b = document.querySelector('#wLook'); if (b && !document.querySelector('#welcome').hidden) b.click(); });
  await page.evaluate(() => { Daybook.S().welcomed = true; });   // a late welcome (slow machines) must not cover a test that is not about it
}
async function reload(page) { await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 }); await waitReady(page); }
async function fresh({ strict = false, reduced = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  ctx.setDefaultNavigationTimeout(90000);
  await ctx.addInitScript(INIT);
  if (strict) await ctx.addInitScript(STRICT);
  const page = await ctx.newPage();
  const errors = [], warns = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning' && /AudioContext/.test(m.text())) warns.push(m.text()); });
  const t = { ctx, page, errors, warns };
  try { await page.goto(target, { waitUntil: 'domcontentloaded' }); await waitReady(page); }
  catch (e) { await ctx.close(); throw e; }
  return t;
}
// ONLY=text runs just the tests whose name contains it.
async function test(name, fn, opts) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  let t;
  try { t = await fresh(opts); } catch (e) { failed++; console.log('FAIL', name, '\n    page did not load:', e.message.split('\n')[0]); return; }
  try { await fn(t.page, t); ok(!t.errors.length, 'console/page errors: ' + t.errors.join(' | ')); console.log('PASS', name); }
  catch (e) { failed++; console.log('FAIL', name, '\n   ', e.message); }
  await t.ctx.close();
}

const NAMES = { clear: 'Clear Sky', rain: 'Gentle Rain', cloudy: 'Drifting Clouds', starry: 'Starry Twilight' };
const DIM = { clear: 0, rain: .4, cloudy: .25, starry: 1 };
const pickWeather = (page, key) => page.evaluate(n => { Daybook.openRoomCustom('lighting'); Array.from(document.querySelectorAll('#rcBody .chip')).find(b => b.textContent.trim() === n).click(); }, NAMES[key]);
const setSky = (page, mode) => page.evaluate(m => { Daybook.S().sky = m; Daybook.applySettings(); }, mode);
const skyNow = page => page.evaluate(() => ({ w: Daybook.S().weather, nightG: Daybook.R3.nightG, night: Daybook.R3.night, rain: Daybook.R3.rain.visible, sky: Daybook.S().sky }));
const rainPos = page => page.evaluate(() => Array.from(Daybook.R3.rain.geometry.attributes.position.array.slice(0, 24)));
const sameArr = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const hide = page => page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  document.dispatchEvent(new Event('visibilitychange'));
});
const show = page => page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  document.dispatchEvent(new Event('visibilitychange'));
});
// Tap the ambience master so the test can read what is actually being played.
const tap = page => page.evaluate(() => {
  const an = Daybook.SND.ctx.createAnalyser(); an.fftSize = 2048; Daybook.SND.master.connect(an);
  const buf = new Float32Array(2048);
  window.__rms = () => { an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; return Math.sqrt(s / buf.length); };
  window.__sample = (ms, step = 20) => new Promise(res => { const out = [], t0 = performance.now(); (function tick() { const t = performance.now() - t0; out.push([t, __rms()]); if (t < ms) setTimeout(tick, step); else res(out); })(); });
});
const level = async (page, ms = 600) => { const s = await page.evaluate(ms => __sample(ms, 40), ms); return s.reduce((a, [, r]) => a + r, 0) / s.length; };
const audio = page => page.evaluate(() => ({ live: __aud.persist.size, timers: __aud.intervals.size, mode: Daybook.SND.mode, voice: !!Daybook.SND.voice, state: Daybook.SND.ctx && Daybook.SND.ctx.state }));
const setAmb = (page, m) => page.evaluate(m => Daybook.setAmbient(m), m);
const openSoundPop = page => page.evaluate(() => { const p = document.querySelector('#soundPop'); if (p.hidden) document.querySelector('#bSound').click(); });
const setVolume = (page, v) => page.evaluate(v => { const i = document.querySelector('#soundPop input[type=range]'); i.value = String(v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }, v);

/* ------------------------------ weather ------------------------------ */

await test('every weather state lands on the same sky from any other state, by day and by night', async page => {
  for (const mode of ['day', 'night']) {
    await setSky(page, mode);
    for (const a of Object.keys(NAMES)) for (const b of Object.keys(NAMES)) {
      await pickWeather(page, a); await pickWeather(page, b);
      const s = await skyNow(page);
      const want = mode === 'night' ? 1 : DIM[b];
      ok(s.w === b && near(s.nightG, want, 1e-9), `${mode}: ${a} -> ${b} gave nightG ${s.nightG}, wanted ${want}`);
      ok(s.rain === (b === 'rain'), `${mode}: ${a} -> ${b} rain.visible=${s.rain}`);
    }
  }
  await page.evaluate(() => { Daybook.S().weather = 'snow'; Daybook.applySettings(); });
  const s = await skyNow(page);
  ok(!s.rain && s.nightG === 1, 'an unknown saved weather should behave like clear'); // sky is still "night" from the loop above
  await page.waitForFunction(() => Math.abs(Daybook.R3.night - Daybook.R3.nightG) < .02, null, { timeout: 20000 });
});

await test('switching weather repeatedly adds no rain objects, geometries or textures', async page => {
  const stats = () => page.evaluate(() => {
    let rain = 0; Daybook.R3.scene.traverse(o => { if (o.isLineSegments && o.material.color.getHex() === 0xAAD0F5) rain++; });
    const m = Daybook.R3.renderer.info.memory; return { rain, geometries: m.geometries, textures: m.textures, children: Daybook.R3.scene.children.length };
  });
  await pickWeather(page, 'rain'); await page.waitForTimeout(800);
  const before = await stats();
  ok(before.rain === 1, 'expected exactly one rain object, got ' + before.rain);
  const keys = Object.keys(NAMES);
  for (let i = 0; i < 80; i++) await pickWeather(page, keys[(i * 7 + (i >> 2)) % 4]);
  await pickWeather(page, 'rain'); await page.waitForTimeout(800);
  const after = await stats();
  ok(JSON.stringify(before) === JSON.stringify(after), `resources changed: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
});

await test('rain animates only while it is raining, and holds still when the tab is hidden', async page => {
  await pickWeather(page, 'rain');
  const a = await rainPos(page); await page.waitForTimeout(700); const b = await rainPos(page);
  ok(!sameArr(a, b), 'rain should fall while it is raining');
  await hide(page); await page.waitForTimeout(200);
  const h1 = await rainPos(page); await page.waitForTimeout(700); const h2 = await rainPos(page);
  ok(sameArr(h1, h2), 'rain should not update while the tab is hidden');
  await show(page);
  for (const k of ['clear', 'cloudy', 'starry']) {
    await pickWeather(page, k); await page.waitForTimeout(150);
    const c = await rainPos(page); await page.waitForTimeout(600); const d = await rainPos(page);
    ok(sameArr(c, d), `rain still updating under ${k}`);
    ok(!(await skyNow(page)).rain, `rain still visible under ${k}`);
  }
});

await test('reduced motion: rain is held still and the sky changes without a fade', async page => {
  await pickWeather(page, 'rain');
  ok((await skyNow(page)).rain, 'rain should still be shown');
  const a = await rainPos(page); await page.waitForTimeout(900); const b = await rainPos(page);
  ok(sameArr(a, b), 'rain should not move under reduced motion');
  await setSky(page, 'day'); await pickWeather(page, 'clear');
  await pickWeather(page, 'starry');
  const s = await skyNow(page);
  ok(s.night === s.nightG && s.nightG === 1, `sky should snap, got night=${s.night} nightG=${s.nightG}`);
}, { reduced: true });

await test('rain really appears on screen and is gone again when the weather clears', async page => {
  // The page relies on its host to hide [hidden] elements; without that the lock screen covers the canvas.
  await page.addStyleTag({ content: '[hidden]{display:none!important}' });
  await setSky(page, 'night');                                    // a fixed sky, so only the rain can differ
  const weather = async k => { await pickWeather(page, k); await page.evaluate(() => { document.querySelector('#roomCustomModal').hidden = true; }); };
  await weather('clear');
  await page.waitForFunction(() => Daybook.R3.night === 1 && Daybook.R3.cam.t >= 1, null, { timeout: 30000 });
  const clip = { x: 1150, y: 60, width: 130, height: 440 };       // the window at the default camera
  // the picture once it has settled: two shots in a row the same (a fixed wait was too short on slow CI machines, whose
  // software WebGL had not drawn the new weather yet)
  const shot = async () => { let a = '', b = ''; for (let i = 0; i < 15 && (!a || a !== b); i++) { a = b; await page.waitForTimeout(600); b = (await page.screenshot({ clip })).toString('base64'); } return b; };
  const clear1 = await shot();
  ok(clear1 === await shot(), 'harness: a clear night window should be a still picture');
  await weather('rain');
  ok(await shot() !== clear1, 'rain should change what is on screen');
  await weather('cloudy'); await weather('starry'); await weather('clear');
  ok(await shot() === clear1, 'the window should look exactly as before once the weather has cleared');
});

await test('the day/night controls keep the weather instead of resetting it', async page => {
  await setSky(page, 'day'); await pickWeather(page, 'rain');
  await page.evaluate(() => document.querySelector('#bSky').click());                 // to night
  let s = await skyNow(page); ok(s.sky === 'night' && s.nightG === 1 && s.rain, 'night + rain');
  await page.evaluate(() => document.querySelector('#bSky').click());                 // back to day, rain keeps its dim
  s = await skyNow(page); ok(s.sky === 'day' && near(s.nightG, .4, 1e-9) && s.rain, `day + rain should dim to .4, got ${s.nightG}`);
  await page.evaluate(() => document.querySelector('#bLamp').click());                // lamp toggles must not touch the sky
  s = await skyNow(page); ok(near(s.nightG, .4, 1e-9), 'lamp toggle changed the sky');
  await page.evaluate(() => document.querySelector('#bLamp').click());
  await pickWeather(page, 'starry');                                                  // stars force night, then daylight ends them
  s = await skyNow(page); ok(s.nightG === 1, 'starry should force night');
  ok(await page.evaluate(() => document.querySelector('#bSky').getAttribute('aria-label')) === 'Switch to daytime', 'sky button should offer daytime during starry');
  await page.evaluate(() => document.querySelector('#bSky').click());
  s = await skyNow(page); ok(s.w === 'clear' && s.sky === 'day' && s.nightG === 0, `daylight should end starry, got ${JSON.stringify(s)}`);
  await pickWeather(page, 'starry');                                                  // same through the Settings chips
  await page.evaluate(() => { Daybook.openDrawer('settings'); Array.from(document.querySelectorAll('#drBody .chip')).find(b => b.textContent.trim() === 'Always day').click(); });
  s = await skyNow(page); ok(s.w === 'clear' && s.nightG === 0, 'Always day should end starry too');
  ok(await page.evaluate(() => document.querySelector('#drBody').textContent.includes('PIN lock')), 'Settings tab should render in full');
  await pickWeather(page, 'starry');                                                  // and the room customizer's sync switch
  await page.evaluate(() => { Daybook.openRoomCustom('lighting'); document.querySelector('#rcBody .switch[aria-label="Sync sky with local time"]').click(); });
  s = await skyNow(page); ok(s.sky === 'auto' || s.w === 'starry', 'sync switch should land on a consistent state');
});

await test('presets and manual sky changes agree about weather, whatever order they run in', async page => {
  await page.evaluate(() => Daybook.applyPreset('rainy_evening'));
  let s = await skyNow(page); ok(s.w === 'rain' && s.rain && s.nightG === 1, 'rainy_evening: ' + JSON.stringify(s));
  await page.evaluate(() => Daybook.applyPreset('morning_focus'));
  s = await skyNow(page); ok(s.w === 'clear' && !s.rain && s.nightG === 0, 'morning_focus: ' + JSON.stringify(s));
  await page.evaluate(() => Daybook.applyPreset('warm_library'));
  s = await skyNow(page); ok(s.w === 'cloudy' && !s.rain && s.nightG === 1, 'warm_library: ' + JSON.stringify(s));
});

await test('"follow my clock" notices the time passing while the page stays open', async page => {
  await pickWeather(page, 'clear');
  await page.evaluate(() => { window.__hr = 12; Date.prototype.getHours = () => window.__hr; Daybook.S().sky = 'auto'; Daybook.applySettings(); });
  let s = await skyNow(page); ok(s.nightG === 0, 'noon should be day');
  await page.evaluate(() => { window.__hr = 22; Daybook.R3.skyCheck = -1e9; });
  await page.waitForFunction(() => Daybook.R3.nightG === 1 && document.querySelector('#bSky').getAttribute('aria-label') === 'Switch to daytime', null, { timeout: 20000 });
  await page.evaluate(() => { window.__hr = 7; Daybook.R3.skyCheck = -1e9; });
  await page.waitForFunction(() => Daybook.R3.nightG === 0 && document.querySelector('#bSky').getAttribute('aria-label') === 'Switch to night', null, { timeout: 20000 });
});

await test('a frame timestamp older than the last stamp cannot push the sky or lamp backwards', async page => {
  await setSky(page, 'day'); await pickWeather(page, 'rain');
  await page.waitForFunction(() => Math.abs(Daybook.R3.night - Daybook.R3.nightG) < .005, null, { timeout: 30000 });
  // handlers (tab visibility, reader close) stamp R3.last with performance.now(); make the next frame look older than that
  const r = await page.evaluate(async () => {
    const R3 = Daybook.R3, before = { night: R3.night, lamp: R3.lamp };
    const stamp = R3.last = performance.now() + 5000;
    await new Promise(res => (function wait() { if (R3.last !== stamp) res(); else setTimeout(wait, 20); })());
    return { before, night: R3.night, lamp: R3.lamp };
  });
  ok(r.night >= 0 && r.night <= 1 && near(r.night, r.before.night, 1e-6), `sky moved from ${r.before.night} to ${r.night}`);
  ok(r.lamp >= 0 && r.lamp <= 1 && near(r.lamp, r.before.lamp, 1e-6), `lamp moved from ${r.before.lamp} to ${r.lamp}`);
});

await test('weather survives an immediate reload and loads without a fade-in flash', async page => {
  for (const k of ['rain', 'starry']) {
    await pickWeather(page, k);
    await reload(page);
    const s = await skyNow(page);
    ok(s.w === k, `${k} not restored (got ${s.w})`);
    ok(s.rain === (k === 'rain'), `${k}: rain visibility after reload is ${s.rain}`);
    ok(s.night === s.nightG, `${k}: sky should be at its target on load, night=${s.night} nightG=${s.nightG}`);
  }
});

/* ------------------------------ ambient audio ------------------------------ */

await test('rapid ambience changes leave exactly one voice: no stray sources, no stray timers', async page => {
  await setAmb(page, 'rain'); await setAmb(page, 'off'); await page.waitForTimeout(1500);
  const base = await audio(page);
  ok(base.live === 0 && base.voice === false, 'baseline should be silent: ' + JSON.stringify(base));
  const expect = { rain: [2, 1], fire: [1, 1], ocean: [4, 0], crickets: [1, 1], cafe: [2, 1], off: [0, 0] }; // [live sources, timers]
  for (const final of Object.keys(expect)) {
    await page.evaluate(async final => {
      const modes = ['rain', 'fire', 'ocean', 'crickets', 'cafe', 'off'];
      for (let i = 0; i < 40; i++) { Daybook.setAmbient(modes[(i * 5 + (i >> 1)) % 6]); await new Promise(r => setTimeout(r, 8 + (i * 13) % 45)); }
      Daybook.setAmbient(final);
    }, final);
    await page.waitForTimeout(3200);                              // the outgoing voice fades for ~2.6 s before its sources are stopped
    const a = await audio(page);
    ok(a.mode === final, `mode ${a.mode} != ${final}`);
    ok(a.live === expect[final][0], `${final}: ${a.live} live sources, wanted ${expect[final][0]}`);
    ok(a.timers - base.timers === expect[final][1], `${final}: ${a.timers - base.timers} ambience timers, wanted ${expect[final][1]}`);
    ok(a.voice === (final !== 'off'), `${final}: voice=${a.voice}`);
  }
});

await test('choosing the ambience that is already playing does nothing', async page => {
  await setAmb(page, 'rain');
  const same = await page.evaluate(() => { const v = Daybook.SND.voice; Daybook.setAmbient('rain'); Daybook.setAmbient('rain'); return Daybook.SND.voice === v; });
  ok(same, 'the voice was rebuilt');
  await page.waitForTimeout(1500);
  ok((await audio(page)).live === 2, 'rain should hold exactly its two loops');
});

await test('ambience fades in, fades out and crossfades instead of cutting', async page => {
  await setAmb(page, 'rain'); await tap(page);
  const early = await page.evaluate(() => __sample(120, 20));
  await page.waitForTimeout(2600);
  const steady = await level(page, 600);
  ok(steady > .02, `rain should be audible, level ${steady}`);
  ok(early[0][1] < .35 * steady, `fade-in should start quiet: first ${early[0][1]} vs steady ${steady}`);
  // fade out
  const out = await page.evaluate(() => { Daybook.setAmbient('off'); return __sample(1800, 20); });
  const at = (t0, t1) => out.filter(([t]) => t >= t0 && t <= t1).map(([, r]) => r);
  const mid = at(90, 400); ok(mid.length && Math.max(...mid) > .03 * steady, `still audible ~100ms after the switch (a hard cut is silent): ${mid}`);
  ok(Math.max(...at(1500, 1800)) < .04 * steady, 'should be silent after the fade');
  ok(Math.max(...out.map(([, r]) => r)) < 1.3 * steady, 'fade-out must not get louder');
  // crossfade rain -> fire: judge a 100 ms moving average (instantaneous RMS of low-frequency noise is jumpy);
  // it must not dip far below the quieter of the two steady levels, and must not spike above the louder
  await page.waitForTimeout(300);
  await setAmb(page, 'fire'); await page.waitForTimeout(2800); const fireLevel = await level(page, 600);
  await setAmb(page, 'rain'); await page.waitForTimeout(2800); const rainLevel = await level(page, 600);
  ok(fireLevel > .008, 'fire should be audible, level ' + fireLevel);
  const x = await page.evaluate(() => { Daybook.setAmbient('fire'); return __sample(2400, 20); });
  const env = x.map(([t], i) => { const w = x.slice(Math.max(0, i - 2), i + 3); return [t, w.reduce((a, [, r]) => a + r, 0) / w.length]; });
  const dip = Math.min(...env.filter(([t]) => t > 100 && t < 1500).map(([, r]) => r));
  ok(dip > .25 * Math.min(rainLevel, fireLevel), `crossfade dips to ${dip.toFixed(4)}, quieter side is ${Math.min(rainLevel, fireLevel).toFixed(4)}`);
  ok(Math.max(...env.map(([, r]) => r)) < 2 * Math.max(rainLevel, fireLevel), 'crossfade should not spike');
  ok(near(env.slice(-10).reduce((a, [, r]) => a + r, 0) / 10, fireLevel, .6 * fireLevel), 'should end at the fire level');
});

await test('ambience follows the volume setting, including silence at zero', async page => {
  await setAmb(page, 'rain'); await tap(page); await openSoundPop(page);
  await setVolume(page, .3); await page.waitForTimeout(2800); const low = await level(page, 700);
  await setVolume(page, .9); await page.waitForTimeout(700); const high = await level(page, 700);
  ok(high / low > 2.1 && high / low < 4.2, `volume .9 vs .3 should be about 3x, got ${(high / low).toFixed(2)}x (${low} -> ${high})`);
  await setVolume(page, 0); await page.waitForTimeout(700); const zero = await level(page, 400);
  ok(zero < .0005, 'volume 0 should be silent, level ' + zero);
  ok(await page.evaluate(() => Daybook.S().volume) === 0, 'volume setting not stored');
});

await test('weather never changes the ambience the visitor chose, it only offers the match', async page => {
  await setAmb(page, 'fire'); await page.waitForTimeout(300);
  await page.evaluate(() => { Daybook.SND.voice.__mine = true; });
  for (const k of ['rain', 'starry', 'cloudy', 'clear', 'rain']) await pickWeather(page, k);
  await page.evaluate(() => Daybook.applyPreset('rainy_evening'));
  const a = await page.evaluate(() => ({ mode: Daybook.SND.mode, saved: Daybook.S().ambient, same: !!(Daybook.SND.voice && Daybook.SND.voice.__mine) }));
  ok(a.mode === 'fire' && a.saved === 'fire' && a.same, 'ambience was overridden: ' + JSON.stringify(a));
  await pickWeather(page, 'rain');
  ok((await page.evaluate(() => document.querySelector('#toast').textContent)).includes('Rain on the window'), 'toast should suggest the rain ambience');
  const label = () => page.evaluate(() => Array.from(document.querySelectorAll('#rcBody button')).map(b => b.textContent).find(t => t.startsWith('Play')) || null);
  ok(await label() === 'Play “Rain on the window”', 'pairing button missing, got ' + await label());
  await page.evaluate(() => Array.from(document.querySelectorAll('#rcBody button')).find(b => b.textContent.startsWith('Play')).click());
  const b = await page.evaluate(() => ({ mode: Daybook.SND.mode, saved: Daybook.S().ambient }));
  ok(b.mode === 'rain' && b.saved === 'rain', 'pairing button should switch to rain: ' + JSON.stringify(b));
  ok(await label() === null, 'button should go away once the match is playing');
  await pickWeather(page, 'starry');
  ok(await label() === 'Play “Summer night”', 'starry should offer Summer night');
  await pickWeather(page, 'clear');
  ok(await label() === null, 'clear weather has nothing to pair');
});

await test('ambience, volume and pen-sound settings survive a reload; sound waits for a real click or key', async (page, t) => {
  await page.mouse.click(5, 5);                                   // a genuine click, so audio may start
  ok(await page.evaluate(() => navigator.userActivation.hasBeenActive), 'harness: click should count as a user activation');
  await setAmb(page, 'ocean'); await openSoundPop(page); await setVolume(page, .35);
  await page.evaluate(() => { const sw = Array.from(document.querySelectorAll('#soundPop .switch'))[0]; sw.click(); }); // pen sounds off
  await reload(page); await page.waitForTimeout(800);
  let s = await page.evaluate(() => ({ amb: Daybook.S().ambient, vol: Daybook.S().volume, pen: Daybook.S().penSound, mode: Daybook.SND.mode, voice: !!Daybook.SND.voice, ctx: Daybook.SND.ctx, made: window.__ctxMade || 0, blocked: window.__blocked || 0, pressed: document.querySelector('#bSound').getAttribute('aria-pressed') }));
  ok(s.amb === 'ocean' && s.vol === .35 && s.pen === false, 'settings lost: ' + JSON.stringify(s));
  ok(s.mode === 'ocean' && s.pressed === 'true', 'sound button should show the saved ambience');
  ok(!s.voice && s.ctx === null && s.made === 0 && s.blocked === 0, 'nothing may start, or even create an AudioContext, before a click: ' + JSON.stringify(s));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);   // Esc is not a user activation: still nothing may start
  s = await page.evaluate(() => ({ voice: !!Daybook.SND.voice, ctx: Daybook.SND.ctx, made: window.__ctxMade || 0, blocked: window.__blocked || 0 }));
  ok(!s.voice && s.ctx === null && s.made === 0 && s.blocked === 0, 'Esc must not start sound or create a context: ' + JSON.stringify(s));
  await page.mouse.click(5, 5);
  await page.waitForFunction(() => Daybook.SND.voice && Daybook.SND.ctx.state === 'running', null, { timeout: 8000 });
  s = await page.evaluate(() => ({ gain: Daybook.SND.master.gain.value, slider: (document.querySelector('#bSound').click(), document.querySelector('#soundPop input[type=range]').value) }));
  ok(near(s.gain, .35 * 1.3, .03), 'master gain should follow the saved volume, got ' + s.gain);
  ok(Number(s.slider) === .35, 'slider should show the saved volume, got ' + s.slider);
  // a key works as the first gesture too
  await reload(page); await page.waitForTimeout(500);
  ok(!(await page.evaluate(() => !!Daybook.SND.voice)), 'no sound before the key');
  await page.keyboard.press('a');
  await page.waitForFunction(() => Daybook.SND.voice && Daybook.SND.ctx.state === 'running', null, { timeout: 8000 });
  ok(t.warns.length === 0, 'autoplay warnings: ' + t.warns.join(' | '));
}, { strict: true });

await test('choosing Quiet before the first click cancels the saved ambience for good', async page => {
  await page.mouse.click(5, 5); await setAmb(page, 'cafe');
  await reload(page);
  await page.evaluate(() => { Daybook.setAmbient('off'); });         // programmatic: no activation, as if from a hidden control
  await page.mouse.click(5, 5); await page.waitForTimeout(800);
  const s = await page.evaluate(() => ({ mode: Daybook.SND.mode, saved: Daybook.S().ambient, voice: !!Daybook.SND.voice }));
  ok(s.mode === 'off' && s.saved === 'off' && !s.voice, 'Quiet did not stick: ' + JSON.stringify(s));
}, { strict: true });

await test('a hidden tab stops ambience work and the ambience comes back on return', async page => {
  const timers0 = (await audio(page)).timers;
  await setAmb(page, 'rain'); await tap(page); await page.waitForTimeout(2200);
  ok((await audio(page)).timers === timers0 + 1, 'rain should run one timer');
  await hide(page);
  let a = await audio(page); ok(!a.voice && a.timers === timers0, 'hidden: voice and timers should be gone immediately: ' + JSON.stringify(a));
  await page.waitForTimeout(900);
  a = await audio(page); ok(a.state === 'suspended' && a.live === 0, 'hidden: context should be suspended with no live sources: ' + JSON.stringify(a));
  ok(await page.evaluate(() => Daybook.S().ambient) === 'rain', 'hiding must not change the saved ambience');
  await show(page);
  await page.waitForFunction(() => Daybook.SND.voice && Daybook.SND.ctx.state === 'running', null, { timeout: 8000 });
  await page.waitForTimeout(2600);
  ok(await level(page, 500) > .02, 'rain should be audible again after returning');
  a = await audio(page); ok(a.live === 2 && a.timers === timers0 + 1, 'exactly one rain voice after returning: ' + JSON.stringify(a));
});

await test('a start the browser blocked is resumed by the next click, without a second voice', async page => {
  await setAmb(page, 'rain');                                     // no click yet: the emulated browser keeps the context suspended
  await page.waitForTimeout(300);
  let a = await audio(page);
  ok(a.state === 'suspended' && a.voice, 'harness: the start should be blocked, got ' + JSON.stringify(a));
  ok(await page.evaluate(() => window.__blocked || 0) >= 1, 'harness: the app should have tried to resume and been refused');
  for (let i = 0; i < 4; i++) await page.mouse.click(5 + i, 5);
  await page.waitForFunction(() => Daybook.SND.ctx.state === 'running', null, { timeout: 8000 });
  await page.waitForTimeout(1500);
  a = await audio(page); ok(a.live === 2 && a.voice && a.state === 'running', 'one rain voice, now playing: ' + JSON.stringify(a));
}, { strict: true });

await browser.close();
console.log(failed ? `\n${failed} test(s) failed` : '\nall passed');
process.exit(failed ? 1 : 0);

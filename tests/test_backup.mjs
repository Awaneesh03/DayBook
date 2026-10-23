// Full backup and restore tests. Needs: npm i playwright-core, Google Chrome, internet (three.js CDN). Rebuild first: python3 build.py
// Run: node tests/test_backup.mjs [path/to/index.html]     ONLY="text" runs just the matching tests.
import { chromium } from 'playwright-core';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = path.resolve(process.argv[2] || path.join(here, '..', 'index.html'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'daybook-backup-'));

let failed = 0;
const ok = (c, m) => { if (!c) throw new Error(m); };
async function waitReady(page) {
  await page.waitForFunction(() => window.Daybook && window.Daybook.R3 && document.querySelector('#loader.gone'), null, { timeout: 60000 });
  await page.waitForFunction(() => Daybook.S().welcomed || Daybook.S().pinHash || !document.querySelector('#welcome').hidden, null, { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => { const b = document.querySelector('#wLook'); if (b && !document.querySelector('#welcome').hidden) b.click(); });
}
// seed: a saved library to place in localStorage before the first load only; init: extra script run before the app
async function fresh({ seed = null, init = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  ctx.setDefaultNavigationTimeout(90000);
  if (seed) await ctx.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, seed);
  if (init) await ctx.addInitScript(init);
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

/* ---- a device with something of everything ---- */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const TEXT = 'Café naïve — 日本語 · हिन्दी · العربية · 🌙✨ 👩‍💻 #travel';
const lib = {
  v: 4, activeId: 'daily',
  journals: [
    { id: 'daily', title: 'Daily Journal', subtitle: '2026', pages: 3, art: { layers: [{ t: 'img', mid: 'mcover', x: .5, y: .5, w: .5 }, { t: 'sticker', s: '⭐', x: .3, y: .3, w: .2 }] }, bookmarks: [{ n: 2, color: '#8E2A2A', label: 'Trip to Goa' }] },
    { id: 'jtrip', title: 'Viaje a México ✈️', pages: 2 }
  ],
  settings: { wall: 'navy', goal: 400, customPresets: { cp1: { id: 'cp1', name: 'Dusk Desk', wall: 'navy' } } }
};
const pages = {
  'daily~1': { j: 'daily', n: 1, text: TEXT, date: '2026-01-15', mood: 4, items: [{ t: 'photo', mid: 'mpage', w: .55, frame: 'polaroid' }, { t: 'sticker', s: '🌙', w: .16 }, { t: 'tape', c: '#F2C4CE', p: 'dots', w: .42 }], ink: [{ tool: 'pen', c: '#1B2A4A', w: 2, pts: [[.1, .2], [.3, .4]] }] },
  'daily~2': { j: 'daily', n: 2, text: 'Second page', date: '2026-01-16', mood: 0 },
  'jtrip~1': { j: 'jtrip', n: 1, text: 'Día uno: ¡qué calor! 🌮', date: '2026-02-01', mood: 5 }
};
const seed = { 'daybook3d:v1': JSON.stringify({ lib, pages }), 'daybook3d:m:mcover': JSON.stringify({ data: PNG, w: 1, h: 1, created: 1 }), 'daybook3d:m:mpage': JSON.stringify({ data: PNG, w: 1, h: 1, created: 2 }) };

const settings = async page => { await page.click('#bShelf'); await page.waitForFunction(() => document.querySelector('#drawer').classList.contains('open')); await page.evaluate(() => [...document.querySelectorAll('#drawer [role=tab]')].find(t => /settings/i.test(t.textContent)).click()); };
const press = (page, label) => page.evaluate(l => { const b = [...document.querySelectorAll('#bkCard button')].find(x => x.textContent.trim() === l); if (!b) throw new Error('no button ' + l); b.click(); }, label);
async function exportFile(page) {
  await settings(page);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), press(page, 'Export full backup')]);
  const file = path.join(tmp, 'backup-' + Date.now() + '.json'); await dl.saveAs(file);
  return { file, name: dl.suggestedFilename(), data: JSON.parse(fs.readFileSync(file, 'utf8')) };
}
async function choose(page, file) {
  await settings(page);
  // this file's own result: the preview, or a refusal that was not already on screen (an earlier one, or the low-space note, must not count)
  await page.evaluate(() => document.querySelectorAll('#bkCard .bk-msg').forEach(m => m.setAttribute('data-old', '')));
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), press(page, 'Restore from a backup…')]);
  await fc.setFiles(file);
  await page.waitForFunction(() => document.querySelector('#bkCard .confirm, #bkCard .bk-msg[role=alert]:not([data-old])'), null, { timeout: 20000 });
  return page.evaluate(() => ({ msg: (document.querySelector('#bkCard .bk-msg[role=alert]') || {}).textContent || '', preview: (document.querySelector('#bkCard .confirm') || {}).textContent || '' }));
}
const stored = page => page.evaluate(() => { const o = {}; for (const k of Object.keys(localStorage)) if (k.startsWith('daybook3d:')) o[k] = localStorage.getItem(k); return JSON.stringify(o, Object.keys(o).sort()); });
// what is stored once the app's own saves have landed (the first load writes the seed back in its tidied form)
const settled = async page => { let a = await stored(page); for (;;) { await page.waitForTimeout(800); const b = await stored(page); if (b === a) return b; a = b; } };
const writeJson = (name, v) => { const f = path.join(tmp, name); fs.writeFileSync(f, typeof v === 'string' ? v : JSON.stringify(v)); return f; };
let goodBackup = null;

await test('a full backup holds every journal, page, photo, sticker, drawing, preset and setting, but not the PIN', async page => {
  await page.evaluate(() => { Daybook.S().pinHash = 'abc123'; Daybook.S().pinHint = 'my hint'; });   // a PIN in use on this device
  const b = await exportFile(page);
  const d = b.data; goodBackup = b.file;
  ok(/^daybook-backup-\d{4}-\d{2}-\d{2}\.json$/.test(b.name), 'file name: ' + b.name);
  ok(d.format === 'daybook-backup' && d.version === 1 && d.createdAt, 'format/version: ' + JSON.stringify([d.format, d.version]));
  ok(d.lib.journals.map(j => j.title).join('|') === 'Daily Journal|Viaje a México ✈️', 'journals: ' + d.lib.journals.map(j => j.title));
  ok(Object.keys(d.pages).sort().join() === 'daily~1,daily~2,jtrip~1', 'pages: ' + Object.keys(d.pages));
  ok(d.pages['daily~1'].text === TEXT && d.pages['daily~1'].items.length === 3 && d.pages['daily~1'].ink.length === 1, 'page 1 content lost');
  ok(d.media.mcover && d.media.mpage && d.media.mpage.data === PNG, 'photos: ' + Object.keys(d.media));
  ok(d.lib.settings.customPresets.cp1 && d.lib.settings.wall === 'navy' && d.lib.settings.goal === 400, 'settings/presets lost');
  ok(!('pinHash' in d.lib.settings) && !('pinHint' in d.lib.settings), 'the PIN must not leave the device');
}, { seed });

await test('restoring on another device brings back everything, after a preview and a safety copy', async page => {
  ok(goodBackup, 'needs the backup made by the previous test');
  await page.evaluate(() => { Daybook.state.pages.set('notes~1', { j: 'notes', n: 1, text: 'Already here on this device', date: '2026-03-01', mood: 0 }); });
  const shown = await choose(page, goodBackup);
  ok(!shown.msg && /2 journals, 3 written pages/.test(shown.preview) && /2 photos/.test(shown.preview), 'preview: ' + shown.preview);
  ok(/replaces everything/.test(shown.preview) && /goes to your downloads first/.test(shown.preview), 'the preview must say it replaces and saves a safety copy: ' + shown.preview);
  const [safety] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.waitForEvent('framenavigated', { timeout: 30000 }), press(page, 'Replace everything with this backup')]);
  ok(/^daybook-before-restore-\d{4}-\d{2}-\d{2}-\d{6}\.json$/.test(safety.suggestedFilename()), 'safety copy: ' + safety.suggestedFilename());
  await waitReady(page);
  ok(await page.evaluate(() => document.querySelector('#toast').textContent) === 'Backup restored.', 'the reloaded page should confirm the restore');
  const s = await page.evaluate(async () => {
    const pg = Object.fromEntries(Daybook.state.pages);
    return { titles: Daybook.state.lib.journals.map(j => j.title), keys: Object.keys(pg).sort(), p1: pg['daily~1'], trip: pg['jtrip~1'] && pg['jtrip~1'].text,
      cover: Daybook.state.lib.journals[0].art.layers.map(l => l.t + (l.s || '')).join(), bookmark: Daybook.state.lib.journals[0].bookmarks[0], wall: Daybook.S().wall, goal: Daybook.S().goal, preset: Daybook.S().customPresets.cp1 && Daybook.S().customPresets.cp1.name,
      photos: [(await Daybook.state.store.readMedia('mcover') || {}).data, (await Daybook.state.store.readMedia('mpage') || {}).data] };
  });
  ok(s.titles.join('|') === 'Daily Journal|Viaje a México ✈️' && s.keys.join() === 'daily~1,daily~2,jtrip~1', 'journals/pages: ' + JSON.stringify([s.titles, s.keys]));
  ok(s.p1.text === TEXT && s.p1.mood === 4 && s.p1.date === '2026-01-15' && s.p1.items.map(i => i.t + (i.s || '')).join() === 'photo,sticker🌙,tape' && s.p1.ink.length === 1, 'page 1: ' + JSON.stringify(s.p1));
  ok(s.trip === 'Día uno: ¡qué calor! 🌮' && s.cover === 'img,sticker⭐' && s.bookmark.label === 'Trip to Goa', 'other content: ' + JSON.stringify([s.trip, s.cover, s.bookmark]));
  ok(s.wall === 'navy' && s.goal === 400 && s.preset === 'Dusk Desk', 'settings: ' + JSON.stringify([s.wall, s.goal, s.preset]));
  ok(s.photos.every(x => x === 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), 'photos did not come back');
});

// every bad file is refused before anything changes, with a message saying why
const bad = [
  ['not JSON', 'not { json', /not readable JSON/],
  ['another kind of file', { hello: 'world' }, /not a Daybook backup/],
  ['an unsupported version', { format: 'daybook-backup', version: 2, lib: lib, pages: {} }, /newer version/],
  ['a backup without its pages', { format: 'daybook-backup', version: 1, lib: lib }, /pages in this backup are missing/],
  ['a journal without an id', { format: 'daybook-backup', version: 1, lib: { journals: [{ title: 'No id' }] }, pages: {} }, /Journal 1 in this backup is damaged/],
  ['duplicate journal ids', { format: 'daybook-backup', version: 1, lib: { journals: [{ id: 'daily', title: 'A' }, { id: 'daily', title: 'B' }] }, pages: {} }, /twice/],
  ['a damaged page', { format: 'daybook-backup', version: 1, lib: lib, pages: { 'daily~1': { j: 'daily', n: 1, mood: 9 } } }, /page in this backup is damaged/],
  ['a damaged photo', { format: 'daybook-backup', version: 1, lib: lib, pages: {}, media: { mcover: { data: 'javascript:alert(1)' } } }, /photo in this backup is damaged/],
  // colours end up in CSS backgrounds, where url(...) would make the browser fetch an outside address
  ['a ribbon colour that loads an outside address', { format: 'daybook-backup', version: 1, lib: { journals: [{ id: 'daily', title: 'A', ribbon: 'url(https://example.invalid/t.png)' }] }, pages: {} }, /Journal 1 in this backup is damaged/],
  ['a note colour that loads an outside address', { format: 'daybook-backup', version: 1, lib: lib, pages: { 'daily~1': { j: 'daily', n: 1, items: [{ t: 'note', text: 'hi', c: 'url(https://example.invalid/t.png)' }] } } }, /page in this backup is damaged/],
  ['a damaged bookmark', { format: 'daybook-backup', version: 1, lib: { journals: [{ id: 'daily', title: 'A', bookmarks: [null] }] }, pages: {} }, /Journal 1 in this backup is damaged/],
  ['a damaged drawing', { format: 'daybook-backup', version: 1, lib: lib, pages: { 'daily~1': { j: 'daily', n: 1, ink: [null] } } }, /page in this backup is damaged/]
];
for (const [what, content, expect] of bad) {
  await test('a file with ' + what + ' is refused and nothing changes', async page => {
    const before = await settled(page);
    const shown = await choose(page, writeJson('bad-' + what.replace(/\W+/g, '-') + '.json', content));
    ok(expect.test(shown.msg) && !shown.preview, 'message: ' + JSON.stringify(shown));
    ok(await stored(page) === before, 'storage changed');
  }, { seed });
}

await test('a file too large to be a backup is refused without being read', async page => {
  const before = await settled(page);
  const big = path.join(tmp, 'huge.json'); fs.writeFileSync(big, Buffer.alloc(26 * 1024 * 1024, 32));
  const shown = await choose(page, big);
  ok(/too large/.test(shown.msg), 'message: ' + shown.msg);
  ok(await stored(page) === before, 'storage changed');
}, { seed });

await test('cancelling the preview or the file picker changes nothing', async page => {
  ok(goodBackup, 'needs the backup made by the first test');
  const before = await settled(page);
  const shown = await choose(page, goodBackup);
  ok(shown.preview, 'no preview');
  await press(page, 'Cancel');
  ok(await page.evaluate(() => !document.querySelector('#bkCard .confirm')), 'the preview should close');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), press(page, 'Restore from a backup…')]);
  await fc.setFiles([]);
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => !document.querySelector('#bkCard .confirm, #bkCard .bk-msg[role=alert]')), 'a cancelled picker should do nothing');
  ok(await stored(page) === before, 'storage changed');
}, { seed });

await test('a restore that does not fit in storage is undone completely and says so', async page => {
  const huge = { format: 'daybook-backup', version: 1, lib: { journals: [{ id: 'daily', title: 'Big', art: { layers: [{ t: 'img', mid: 'mbig' }] } }] }, pages: {}, media: { mbig: { data: 'data:image/jpeg;base64,' + 'A'.repeat(3000000), w: 1, h: 1 } } };
  const file = writeJson('too-big-to-store.json', huge);
  await page.evaluate(() => { const v = 'x'.repeat(256 * 1024); for (let i = 0; i < 100; i++) { try { localStorage.setItem('filler' + i, v); } catch (e) { break; } } });
  const before = await settled(page);
  const shown = await choose(page, file);
  ok(shown.preview, 'no preview: ' + shown.msg);
  const [first] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), press(page, 'Replace everything with this backup')]);
  await page.waitForFunction(() => document.querySelector('#bkCard .bk-msg[role=alert]'), null, { timeout: 20000 });
  const msg = await page.evaluate(() => document.querySelector('#bkCard .bk-msg[role=alert]').textContent);
  ok(/no room left/.test(msg) && /Nothing was changed/.test(msg), 'message: ' + msg);
  ok(await stored(page) === before, 'storage was not put back');
  ok(await page.evaluate(() => Daybook.state.pages.get('daily~1').text.startsWith('Café')), 'the journals on screen changed');
  await page.waitForTimeout(1100);   // a second try in the same day must not name an older safety copy
  await page.click('#bShelf'); await choose(page, file);
  const [again] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), press(page, 'Replace everything with this backup')]);
  await page.waitForFunction(() => document.querySelector('#bkCard .bk-msg[role=alert]'), null, { timeout: 20000 });
  ok(again.suggestedFilename() !== first.suggestedFilename(), 'two safety copies share a name: ' + again.suggestedFilename());
  await page.evaluate(() => { for (let i = 0; i < 100; i++) localStorage.removeItem('filler' + i); });
}, { seed });

await test('a backup with odd but harmless values restores and opens without errors', async (page, t) => {
  const U = w => 'url(https://example.invalid/' + w + ')', hits = [];   // in fields that are not colours, these must stay inert
  await t.ctx.route('**/example.invalid/**', r => { hits.push(r.request().url()); r.abort(); });
  const odd = { format: 'daybook-backup', version: 1, lib: {
    activeId: 'gone',
    journals: [{ id: 'daily', title: 'T'.repeat(300), pages: 1e9, last: 1, size: 'huge', thick: 42, order: 'x', ribbon: '#123',
      cover: { color: '#123456', material: 'plutonium', pattern: {}, emblem: 7, foil: null, font: 'comic' },
      defaults: { paper: U('paper'), ruling: 'nope', pen: '__proto__', ink: 'constructor', scale: 'big' },
      bookmarks: [{ n: 1, color: '#123456', label: 'b' }], art: { hideTitle: 'yes', layers: [{ t: 'zap' }, { t: 'img', mid: 'nope' }, { t: 'sticker' }] } }],
    settings: { wall: U('wall'), wood: 'diamond', lampTone: 3, ambient: 'kaboom', turnSpeed: 'warp', sky: 'green', clockMode: 'sundial', weather: 'locusts', exploreSpeed: 'fast', visibleObjects: 'all', objectLayout: [1], customPresets: 'none', activePreset: 'ghost', goal: 'lots', volume: 'loud' } },
  pages: { 'daily~1': { j: 'daily', n: 1, text: '<img src=x onerror=alert(1)>', style: { paper: 'x', pen: 'toString', ink: 'valueOf', scale: 'y' },
    items: [{ t: 'note', text: '<b>x</b>', c: '#123456', x: 'a', rot: U('rot') }, { t: 'tape', c: '#123456', p: U('pattern') }, { t: 'photo', mid: 'missing', frame: U('frame') }, { t: 'mystery' }], ink: [{ pts: 'no' }, {}, { k: 'hl', pts: [[1, 2]] }] } } };
  const shown = await choose(page, writeJson('odd.json', odd));
  ok(shown.preview && /2 photos the journals use are not in this backup/.test(shown.preview), 'preview: ' + JSON.stringify(shown));
  await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.waitForEvent('framenavigated', { timeout: 30000 }), press(page, 'Replace everything with this backup')]);
  await waitReady(page);
  ok(await page.evaluate(() => Daybook.state.lib.journals[0].pages) === 999, 'the page count should be capped');
  await page.evaluate(() => Daybook.openJournal('daily'));
  await page.waitForFunction(() => document.querySelector('.it-note'), null, { timeout: 20000 });
  ok(await page.evaluate(() => !document.querySelector('img[src="x"], .it-note b')), 'backup text must stay text, never markup');
  await page.evaluate(() => Daybook.closeReader());
  await settings(page);
  for (const tab of ['insights', 'journals', 'settings']) await page.evaluate(t => [...document.querySelectorAll('#drawer [role=tab]')].find(x => x.textContent.toLowerCase().includes(t)).click(), tab);
  ok(!hits.length, 'imported values made the page fetch: ' + hits);
});

// habits, tasks and the review pages live in the library, so a backup carries them; a later app version must still
// restore older backups without them (every test above), and planner data that is malformed is left out, never trusted
const planLib = { ...lib, habits: [{ id: 'h1', name: 'Read 10 pages', days: [1, 2, 3, 4, 5], start: '2026-01-01', done: { '2026-01-15': true } }],
  tasks: [{ id: 't1', text: 'Post the letter ✉️', date: '2026-01-15', done: false, created: 1, link: { j: 'daily', n: 1 } }], reviews: { 'daily:2026-01-15': { j: 'daily', n: 2 } } };
let planBackup = null;
await test('habits, tasks and review links travel in a full backup and come back on another device', async page => {
  const b = await exportFile(page);
  ok(b.data.lib.habits[0].name === 'Read 10 pages' && b.data.lib.habits[0].done['2026-01-15'] === true && b.data.lib.tasks[0].text === 'Post the letter ✉️' && b.data.lib.reviews['daily:2026-01-15'].n === 2, 'planner data missing from the backup: ' + JSON.stringify([b.data.lib.habits, b.data.lib.tasks, b.data.lib.reviews]));
  planBackup = b.file;
}, { seed: { 'daybook3d:v1': JSON.stringify({ lib: planLib, pages }) } });
await test('restoring brings habits, tasks and review links back, and the preview mentions them', async page => {
  ok(planBackup, 'needs the backup made by the previous test');
  const shown = await choose(page, planBackup);
  ok(/plus 1 habit and 1 task/.test(shown.preview), 'preview: ' + shown.preview);
  await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.waitForEvent('framenavigated', { timeout: 30000 }), press(page, 'Replace everything with this backup')]);
  await waitReady(page);
  const l = await page.evaluate(() => Daybook.state.lib);
  ok(l.habits.length === 1 && l.habits[0].done['2026-01-15'] && l.tasks.length === 1 && l.tasks[0].link.n === 1 && l.reviews['daily:2026-01-15'].n === 2, 'after restore: ' + JSON.stringify([l.habits, l.tasks, l.reviews]));
});
await test('malformed habits and tasks in a backup are left out, not trusted', async page => {
  const odd = { format: 'daybook-backup', version: 1, lib: { ...lib, habits: [{ id: 'ok1', name: 'Fine', days: [1], done: { '2026-01-05': true, '__proto__': true, 'x': true } }, { id: '../bad', name: 'Bad id' }, null, 'junk', { id: 'ok1', name: 'Duplicate' }, { id: 'h2', name: 'x'.repeat(500), days: [9, -1], done: [] }],
    tasks: [{ id: 'tk', text: 'Keep me', date: '2026-01-05' }, { id: 'nodate', text: 'No date' }, { id: 'empty', text: '   ', date: '2026-01-05' }, { id: 'link', text: 'Bad link', date: '2026-01-05', link: { j: 'x', n: 'one' } }],
    reviews: { 'daily:2026-01-05': { j: 'daily', n: 1 }, 'weird:2026-01-05': { j: 'daily', n: 1 }, 'daily:2026-01-06': { j: 'daily', n: 5000 } } }, pages: {} };
  const shown = await choose(page, writeJson('odd-planner.json', odd));
  ok(shown.preview && /plus 2 habits and 2 tasks/.test(shown.preview), 'preview: ' + JSON.stringify(shown));
  await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.waitForEvent('framenavigated', { timeout: 30000 }), press(page, 'Replace everything with this backup')]);
  await waitReady(page);
  const l = await page.evaluate(() => Daybook.state.lib);
  ok(l.habits.map(x => x.id).join() === 'ok1,h2' && Object.keys(l.habits[0].done).join() === '2026-01-05' && l.habits[1].name.length === 60 && l.habits[1].days.length === 7, 'habits: ' + JSON.stringify(l.habits));
  ok(l.tasks.map(t => t.id).join() === 'tk,link' && l.tasks[1].link === null, 'tasks: ' + JSON.stringify(l.tasks));
  ok(Object.keys(l.reviews).join() === 'daily:2026-01-05', 'reviews: ' + JSON.stringify(l.reviews));
  ok(await page.evaluate(() => ({}).polluted === undefined && Object.getPrototypeOf(Daybook.state.lib.habits[0].done) === Object.prototype), 'prototype touched');
});

await test('another tab cannot save what it held over a restore, and opens the restored journals', async (page, t) => {
  ok(goodBackup, 'needs the backup made by the first test');
  const other = await t.ctx.newPage();
  other.on('pageerror', e => t.errors.push(String(e)));
  await other.goto(pathToFileURL(html).href); await waitReady(other);
  // the other tab holds the library from before and saves it twice: in the middle of the restore (as its first photo lands),
  // and once the restored journals have reached it (a save that was waiting, say). Neither may win; the second must be refused.
  await other.evaluate(() => {
    const old = JSON.parse(JSON.stringify(Daybook.state.lib)); old.settings.goal = 999;
    const save = () => Daybook.state.store.writeLib(old).then(() => 'saved', () => 'refused');
    let during = true, after = true;
    window.addEventListener('storage', e => {
      if (during && e.key.startsWith('daybook3d:m:')) { during = false; save(); }
      else if (after && e.key === 'daybook3d:v1' && (e.newValue || '').includes('"restored":"r')) { after = false; save().then(r => sessionStorage.setItem('late', r)); }
    });
  });
  await choose(page, goodBackup);
  await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.waitForEvent('framenavigated', { timeout: 30000 }), other.waitForEvent('framenavigated', { timeout: 30000 }), press(page, 'Replace everything with this backup')]);
  await waitReady(other); await waitReady(page);
  ok(await other.evaluate(() => sessionStorage.getItem('late')) === 'refused', 'the other tab saved over the restore');
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('daybook3d:v1')));
  ok(st.lib.journals.map(j => j.title).join('|') === 'Daily Journal|Viaje a México ✈️' && st.lib.settings.goal === 400, 'stored: ' + JSON.stringify([st.lib.journals.map(j => j.title), st.lib.settings.goal]));
  ok(await other.evaluate(() => Daybook.state.lib.journals.length === 2 && Daybook.state.pages.get('daily~1').text.includes('日本語')), 'the other tab did not open the restored journals');
});

await test('if another tab saves over a restore after its re-check, the reloaded page says so instead of claiming success', async (page, t) => {
  ok(goodBackup, 'needs the backup made by the first test');
  // stands in for another tab's save landing after the restore's 400 ms re-check, just before this page reloads
  await t.ctx.addInitScript(() => {
    if (!sessionStorage.getItem('daybook3d:restore-check')) return;
    const m = JSON.parse(localStorage.getItem('daybook3d:v1')); delete m.restored; m.lib.journals[0].title = 'Saved by another tab';
    localStorage.setItem('daybook3d:v1', JSON.stringify(m));
  });
  await choose(page, goodBackup);
  await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.waitForEvent('framenavigated', { timeout: 30000 }), press(page, 'Replace everything with this backup')]);
  await waitReady(page);
  await page.waitForFunction(() => document.querySelector('#bkCard .bk-msg[role=alert]'), null, { timeout: 20000 });
  const s = await page.evaluate(() => ({ msg: document.querySelector('#bkCard .bk-msg[role=alert]').textContent, toast: document.querySelector('#toast').textContent, left: sessionStorage.getItem('daybook3d:restore-check') }));
  ok(/Another Daybook tab saved over the backup/.test(s.msg) && /restore it again/.test(s.msg), 'message: ' + s.msg);
  ok(s.toast !== 'Backup restored.' && s.left === null, 'must not claim success: ' + JSON.stringify(s));
});

// Inside Claude the cloud store is used; a small in-page stand-in for its db checks that restore writes, removes and keeps the right documents.
// window.__fail = { after: n, forever } makes the write after n more succeed fail (once, or every write from then on: the connection dropped).
const FAKE_CLAUDE = () => {
  const key = 'fakedb', load = () => JSON.parse(sessionStorage.getItem(key) || '{}'), save = m => sessionStorage.setItem(key, JSON.stringify(m));
  const gate = () => { const f = window.__fail; if (f && f.after-- <= 0) { if (!f.forever) window.__fail = null; throw new Error('network gone'); } };
  const docRef = p => ({ async get() { const m = load(); return { exists: p in m, data: () => m[p] }; }, async set(v) { gate(); const m = load(); m[p] = JSON.parse(JSON.stringify(v)); save(m); }, async delete() { gate(); const m = load(); delete m[p]; save(m); }, onSnapshot() {}, collection: n => colRef(p + '/' + n) });
  const colRef = p => ({ async get() { const m = load(); return { docs: Object.keys(m).filter(k => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/')).map(k => ({ id: k.slice(p.length + 1), data: () => m[k] })) }; }, doc: id => docRef(p + '/' + id), onSnapshot() {} });
  window.claude = { use: async what => what === 'db' ? { doc: docRef, collection: colRef } : what === 'user' ? { id: async () => 'u1' } : null };
};
await test('inside Claude, restoring replaces the stored journals, pages and photos too', async page => {
  ok(goodBackup, 'needs the backup made by the first test');
  ok(await page.evaluate(() => Daybook.state.store.kind) === 'cloud', 'the stand-in cloud store was not used');
  await page.evaluate(() => { Daybook.state.pages.set('notes~1', { j: 'notes', n: 1, text: 'Only on this device', mood: 0 }); return Daybook.state.store.writePage('notes~1', Daybook.state.pages.get('notes~1')); });
  await choose(page, goodBackup);
  await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.waitForEvent('framenavigated', { timeout: 30000 }), press(page, 'Replace everything with this backup')]);
  await waitReady(page);
  const db = await page.evaluate(() => JSON.parse(sessionStorage.getItem('fakedb')));
  const pageKeys = Object.keys(db).filter(k => k.includes('/lib/pages/')).map(k => k.split('/').pop()).sort();
  ok(pageKeys.join() === 'daily~1,daily~2,jtrip~1', 'cloud pages: ' + pageKeys);
  ok(db['data/users/u1/lib/media/mpage'] && db['data/users/u1/lib'].journals.length === 2, 'cloud photos/library not written');
  ok(await page.evaluate(() => Daybook.state.pages.get('daily~1').text.includes('日本語')), 'not loaded after restore');
}, { init: FAKE_CLAUDE });

// what the stand-in db holds, in an order that does not depend on when each document was written
const cloudNow = page => page.evaluate(() => { const m = JSON.parse(sessionStorage.getItem('fakedb') || '{}'); return Object.keys(m).sort().map(k => k + '=' + JSON.stringify(m[k])).join('\n'); });
async function cloudSettled(page) { let a = await cloudNow(page); for (;;) { await page.waitForTimeout(800); const b = await cloudNow(page); if (b === a) return b; a = b; } }

await test('inside Claude, a restore that fails part way is undone and says so', async page => {
  ok(goodBackup, 'needs the backup made by the first test');
  const before = await cloudSettled(page);
  await choose(page, goodBackup);
  await page.evaluate(() => { window.__fail = { after: 3, forever: false }; });   // photos and a page land, then one write fails
  await Promise.all([page.waitForEvent('download', { timeout: 20000 }), press(page, 'Replace everything with this backup')]);
  await page.waitForFunction(() => document.querySelector('#bkCard .bk-msg[role=alert]'), null, { timeout: 20000 });
  const msg = await page.evaluate(() => document.querySelector('#bkCard .bk-msg[role=alert]').textContent);
  ok(/Nothing was changed/.test(msg), 'message: ' + msg);
  ok(await cloudNow(page) === before, 'the stored journals were not put back');
  ok(await page.evaluate(() => !Daybook.state.restoring), 'saving should carry on after an undone restore');
}, { init: FAKE_CLAUDE });

await test('inside Claude, a restore that cannot be undone says so, names the safety copy and saves nothing more', async page => {
  ok(goodBackup, 'needs the backup made by the first test');
  await cloudSettled(page);
  await choose(page, goodBackup);
  await page.evaluate(() => { window.__fail = { after: 2, forever: true }; });   // the connection drops for good part way
  const [safety] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), press(page, 'Replace everything with this backup')]);
  await page.waitForFunction(() => document.querySelector('#bkCard .bk-msg[role=alert]'), null, { timeout: 20000 });
  const msg = await page.evaluate(() => document.querySelector('#bkCard .bk-msg[role=alert]').textContent);
  ok(!/Nothing was changed/.test(msg) && /could not put everything back/.test(msg) && msg.includes(safety.suggestedFilename()), 'message: ' + msg);
  await page.evaluate(() => { window.__fail = null; });   // back online: what this tab holds is from before the restore and must not be saved now
  const after = await cloudNow(page);
  await page.evaluate(() => { Daybook.S().goal = 999; Daybook.toggleClockSec(); });
  await page.waitForTimeout(1500);
  ok(await cloudNow(page) === after, 'the old journals on screen were saved over the half-restored ones');
}, { init: FAKE_CLAUDE });

fs.rmSync(tmp, { recursive: true, force: true });
await browser.close();
console.log(failed ? `\n${failed} test(s) failed` : '\nall passed');
process.exit(failed ? 1 : 0);

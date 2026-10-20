/* =====================================================================
   Data model + storage
   ===================================================================== */
const state = { lib: null, pages: new Map(), store: null, ready: false };
const dirtyPages = new Set();
const editSeq = new Map();
const pageKey = (jid, n) => jid + '~' + n;
const SETTINGS_DEFAULT = {
  sky: 'auto', lamp: true, goal: 250, animate: true, penSound: true, volume: .6,
  pinHash: null, pinHint: '', welcomed: false, goalDay: '', celebrated: 0,
  ambient: 'off', turnSpeed: 'normal', curl: true, wall: 'sage', wood: 'walnut', lampTone: 'warm',
  windowOpen: false, curtainsOpen: true, curtainColor: 'ochre',
  showClock: true, clockMode: 'analog', clockStyle: 'daybook', clockSec: true, clockTick: false,
  weather: 'clear', woodFinish: 'satin', lampStyle: 'brass', artStyle: 'quiet_focus',
  potStyle: 'terracotta', globeStyle: 'brass', radioStyle: 'wood',
  exploreSpeed: 1.0, activePreset: 'default', customPresets: [], objectLayout: {},
  visibleObjects: { globe: true, plant: true, radio: true, cup: true, mug: true, art: true, clock: true }
};

function normJ(j, i) {
  const o = Object.assign({ id: newId(), title: 'Untitled', subtitle: '', order: i, created: Date.now(), size: 'a5', thick: 'regular', ribbon: '#8E2A2A', pages: 2, bookmarks: [], last: 1 }, j);
  o.cover = Object.assign({ color: '#1F3A5F', material: 'leather', pattern: 'frame', emblem: 'none', foil: 'gold', font: 'serif' }, j.cover || {});
  o.defaults = Object.assign({ paper: 'cream', ruling: 'lined', pen: 'fountain', ink: 'midnight', scale: 1 }, j.defaults || {});
  o.art = Object.assign({ hideTitle: false, layers: [] }, j.art || {});
  if (!Array.isArray(o.art.layers)) o.art.layers = [];
  if (!Array.isArray(o.bookmarks)) o.bookmarks = [];
  o.pages = Math.max(1, o.pages | 0);
  return o;
}
function normLib(L) {
  L = L || {};
  const settings = Object.assign({}, SETTINGS_DEFAULT, L.settings || {});
  if (!Array.isArray(settings.customPresets)) settings.customPresets = [];
  if (typeof settings.objectLayout !== 'object' || settings.objectLayout === null) settings.objectLayout = {};
  if (typeof settings.visibleObjects !== 'object' || settings.visibleObjects === null) {
    settings.visibleObjects = Object.assign({}, SETTINGS_DEFAULT.visibleObjects);
  }
  return { v: 4, journals: (L.journals || []).map(normJ), activeId: L.activeId || null, settings };
}
function defaultLib() {
  const yr = String(new Date().getFullYear());
  return normLib({ activeId: 'daily', journals: [
    { id: 'daily', title: 'Daily Journal', subtitle: yr, order: 0, size: 'a5', thick: 'thick', ribbon: '#8E2A2A', cover: { color: '#1F3A5F', material: 'leather', pattern: 'frame', emblem: 'moon', foil: 'gold', font: 'serif' }, defaults: { paper: 'cream', ruling: 'lined', pen: 'fountain', ink: 'midnight' } },
    { id: 'gratitude', title: 'Gratitude', subtitle: 'Three good things', order: 1, size: 'a5', thick: 'regular', ribbon: '#C9A54C', cover: { color: '#7A9A7E', material: 'linen', pattern: 'corners', emblem: 'leaf', foil: 'cream', font: 'script' }, defaults: { paper: 'fresh', ruling: 'dotted', pen: 'gel', ink: 'forest' } },
    { id: 'dreams', title: 'Dreams', subtitle: 'Written at dawn', order: 2, size: 'tall', thick: 'regular', ribbon: '#C9CFD8', cover: { color: '#3D2752', material: 'velvet', pattern: 'stars', emblem: 'star', foil: 'silver', font: 'serif' }, defaults: { paper: 'midnight', ruling: 'blank', pen: 'gel', ink: 'silver' } },
    { id: 'notes', title: 'Notes & Ideas', subtitle: '', order: 3, size: 'pocket', thick: 'slim', ribbon: '#1B1B1F', cover: { color: '#A47148', material: 'kraft', pattern: 'band', emblem: 'none', foil: 'ink', font: 'type' }, defaults: { paper: 'kraft', ruling: 'grid', pen: 'pencil', ink: 'graphite' } }
  ] });
}
const jById = id => state.lib && state.lib.journals.find(j => j.id === id);
const S = () => (state.lib ? state.lib.settings : SETTINGS_DEFAULT);

function localStore() {
  const KEY = 'daybook3d:v1', MK = 'daybook3d:m:';
  let mem = { lib: null, pages: {} };
  try { const raw = window.localStorage.getItem(KEY); if (raw) mem = JSON.parse(raw) || mem; } catch (e) { /* private mode */ }
  if (!mem.pages) mem.pages = {};
  const media = {};
  const persist = () => { try { window.localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* storage full: keep in memory */ } };
  return {
    kind: 'local',
    async init() {
      let legacy = [];
      if (!mem.lib) { try { const old = JSON.parse(window.localStorage.getItem('daybook:v1') || '{}') || {}; legacy = Object.keys(old).map(k => old[k]); } catch (e) { legacy = []; } }
      return { lib: mem.lib, pages: Object.assign({}, mem.pages), legacy };
    },
    subscribe() {},
    async writeLib(lib) { mem.lib = clone(lib); persist(); },
    async writePage(k, d) { if (d) mem.pages[k] = clone(d); else delete mem.pages[k]; persist(); },
    async writeMedia(id, d) { media[id] = d; try { window.localStorage.setItem(MK + id, JSON.stringify(d)); } catch (e) { /* kept for this visit */ } },
    async readMedia(id) { if (media[id]) return media[id]; try { return JSON.parse(window.localStorage.getItem(MK + id) || 'null'); } catch (e) { return null; } },
    async deleteMedia(id) { delete media[id]; try { window.localStorage.removeItem(MK + id); } catch (e) { /* ignore */ } }
  };
}
async function cloudStore() {
  if (!window.claude || typeof window.claude.use !== 'function') return null;
  const db = await window.claude.use('db'); if (!db) return null;
  const user = await window.claude.use('user'); const uid = user ? await user.id() : null; if (!uid) return null;
  const base = 'data/users/' + uid;
  const libRef = db.doc(base + '/lib');
  const pagesCol = libRef.collection('pages');
  const mediaCol = libRef.collection('media');
  return {
    kind: 'cloud',
    async init() {
      const s = await libRef.get();
      const lib = s.exists ? clone(s.data()) : null;
      const ps = await pagesCol.get(); const pages = {};
      ps.docs.forEach(d => { const v = d.data(); if (v) pages[d.id] = clone(v); });
      let legacy = [];
      if (!lib) { try { const old = await db.collection(base).get(); old.docs.forEach(d => { if (/^\d{4}-\d{2}-\d{2}$/.test(d.id)) { const v = d.data(); if (v) legacy.push(clone(v)); } }); } catch (e) { legacy = []; } }
      return { lib, pages, legacy };
    },
    subscribe(onLib, onPages, onErr) {
      libRef.onSnapshot(s => { if (s.exists) onLib(s.data()); }, onErr);
      pagesCol.onSnapshot(s => { const m = {}; s.docs.forEach(d => { const v = d.data(); if (v) m[d.id] = v; }); onPages(m); }, onErr);
    },
    writeLib(lib) { return libRef.set(lib); },
    writePage(k, d) { return d ? pagesCol.doc(k).set(d) : pagesCol.doc(k).delete(); },
    writeMedia(id, d) { return mediaCol.doc(id).set(d); },
    async readMedia(id) { const s = await mediaCol.doc(id).get(); return s.exists ? s.data() : null; },
    deleteMedia(id) { return mediaCol.doc(id).delete(); }
  };
}
function importLegacy(lib, pages, legacy) {
  const list = legacy.filter(e => e && e.date && ((e.body && e.body.trim()) || e.title)).sort((a, b) => a.date < b.date ? -1 : 1);
  if (!list.length) return [];
  const j = lib.journals[0]; const keys = [];
  list.forEach((e, i) => {
    const n = i + 1; const k = pageKey(j.id, n);
    pages[k] = { j: j.id, n, text: (e.title ? e.title + '\n\n' : '') + (e.body || ''), date: e.date, mood: e.mood || 0, updatedAt: e.updatedAt || Date.now() };
    keys.push(k);
  });
  j.pages = list.length + 1; j.last = list.length;
  return keys;
}

let libTimer = null, libInflight = 0, chain = Promise.resolve(), saveErrShown = false;
function setSaveState(t) { const el = $('#rStatus'); if (el) el.textContent = t; }
function queue(fn) {
  chain = chain.then(fn).catch(() => {
    setSaveState('Not saved yet');
    if (!saveErrShown) { saveErrShown = true; toast('Could not save just now. Your words stay on screen and will save on the next change.'); setTimeout(() => { saveErrShown = false; }, 15000); }
  });
  return chain;
}
function saveLib(now) {
  clearTimeout(libTimer);
  const run = () => { libTimer = null; libInflight++; const snap = clone(state.lib); return queue(() => state.store.writeLib(snap)).then(() => { libInflight--; }); };
  if (now) return run();
  libTimer = setTimeout(run, 350);
}
const pageTimers = new Map();
function pageIsEmpty(p) { return !p || (!(p.text || '').trim() && !p.mood && !p.style && !(p.items && p.items.length) && !(p.ink && p.ink.length)); }
function savePage(key, now) {
  dirtyPages.add(key); editSeq.set(key, (editSeq.get(key) || 0) + 1);
  setSaveState('Saving…');
  clearTimeout(pageTimers.get(key));
  if (now) return flushPage(key);
  pageTimers.set(key, setTimeout(() => flushPage(key), 700));
}
function flushPage(key) {
  clearTimeout(pageTimers.get(key)); pageTimers.delete(key);
  const seq = editSeq.get(key);
  const p = state.pages.get(key);
  const empty = pageIsEmpty(p);
  const data = empty ? null : clone(p);
  if (data && JSON.stringify(data).length > 245000) { toast('This page holds too many drawings to save. Undo the last stroke or start a new page.'); setSaveState('Page too full'); return chain; }
  if (empty) state.pages.delete(key);
  return queue(async () => {
    await state.store.writePage(key, data);
    if (editSeq.get(key) === seq) dirtyPages.delete(key);
    if (!pageTimers.size) setSaveState('Saved');
  });
}
function flushAll() { for (const k of Array.from(pageTimers.keys())) flushPage(k); if (libTimer) saveLib(true); return chain; }

function onRemoteLib(data) {
  if (libTimer || libInflight) return;
  state.lib = normLib(clone(data));
  sync3D(); refreshOpenUI();
}
function onRemotePages(m) {
  const seen = new Set(Object.keys(m));
  for (const k of seen) { if (!dirtyPages.has(k)) state.pages.set(k, clone(m[k])); }
  for (const k of Array.from(state.pages.keys())) { if (!seen.has(k) && !dirtyPages.has(k)) state.pages.delete(k); }
  refreshOpenUI();
}
function refreshOpenUI() { if (RD.open) renderReader(true); if (!$('#drawer').hidden) renderDrawerSoft(); updateHudSub(); }

/* ---- stats shared by insights, HUD and goal ---- */
function writtenPages() { return Array.from(state.pages.values()).filter(p => (p.text || '').trim() || (p.items && p.items.length) || (p.ink && p.ink.length)); }
function writtenDays() { const s = new Set(); writtenPages().forEach(p => { if (p.date) s.add(p.date); }); return s; }
function currentStreak() { const days = writtenDays(); const d = new Date(); if (!days.has(toId(d))) d.setDate(d.getDate() - 1); let n = 0; while (days.has(toId(d))) { n++; d.setDate(d.getDate() - 1); } return n; }
function longestStreak() {
  const ds = Array.from(writtenDays()).sort(); let best = 0, run = 0, prev = null;
  ds.forEach(id => { const d = fromId(id); if (prev && (d - prev) / 864e5 === 1) run++; else run = 1; best = Math.max(best, run); prev = d; });
  return best;
}
function wordsToday() { const t = todayId(); let w = 0; for (const p of state.pages.values()) if (p.date === t) w += countWords(p.text); return w; }
function totalWords() { let w = 0; for (const p of state.pages.values()) w += countWords(p.text); return w; }

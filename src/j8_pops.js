/* =====================================================================
   Reader panels
   ===================================================================== */
function openPop(name) { if (RD.pop === name) { closePop(); return; } if (RD.drawing) toggleDraw(false); RD.pop = name; RD.confirmDelete = false; $('#pop').hidden = false; renderPop(); }
function closePop() { RD.pop = null; $('#pop').hidden = true; }
function setStyle(field, value, extra) {
  const j = curJ(); const n = focusN(); const p = editPage(n);
  p.style = Object.assign({}, p.style || {}, { [field]: value }, extra || {});
  j.defaults = Object.assign({}, j.defaults, { [field]: value }, extra || {});
  savePage(pageKey(j.id, n)); saveLib(); renderReader();
}
function useEverywhere(fields) {
  const j = curJ(); const st = pageStyle(j, state.pages.get(pageKey(j.id, focusN())));
  fields.forEach(f => { j.defaults[f] = st[f]; });
  for (const [k, p] of state.pages) {
    if (k.indexOf(j.id + '~') !== 0 || !p.style) continue;
    let changed = false; fields.forEach(f => { if (f in p.style) { delete p.style[f]; changed = true; } });
    if (changed) { if (!Object.keys(p.style).length) delete p.style; savePage(k); }
  }
  saveLib(); renderReader(); toast('Every page in ' + j.title + ' now uses this.');
}
function popHead(title) { return h('div', { class: 'pop-head' }, h('h3', { text: title }), h('button', { type: 'button', class: 'x', 'aria-label': 'Close', onclick: closePop }, '×')); }
function renderPop() {
  const pop = $('#pop'); const j = curJ(); if (!j || !RD.pop || RD.pop === 'note') return;
  pop.textContent = '';
  const n = focusN(); const p = state.pages.get(pageKey(j.id, n)); const st = pageStyle(j, p);
  if (RD.pop === 'pen') {
    pop.append(popHead('Pens and ink'), h('p', { class: 'note', text: 'Changes page ' + n + ' and every new page you start.' }));
    pop.append(h('div', { class: 'pens' }, Object.keys(PENS).map(id => {
      const pn = PENS[id];
      return h('button', { type: 'button', class: 'pen-card', 'aria-pressed': st.pen === id ? 'true' : 'false', style: 'color:' + inkOf(st.ink).c, onclick: () => {
        const extra = {}; if (id === 'pencil' && st.ink !== 'graphite') extra.ink = 'graphite'; if (st.pen === 'pencil' && id !== 'pencil' && st.ink === 'graphite') extra.ink = 'midnight';
        setStyle('pen', id, extra); sfx('pen', id);
      } }, id !== 'typewriter' ? h('span', { class: 'mini', html: penSvg(id) }) : null, h('b', { text: pn.name, style: 'color:var(--ink)' }), h('span', { class: 'smp', style: 'font-family:' + pn.font + ';font-weight:' + pn.weight + ';color:var(--ink)', text: 'Dear diary,' }), h('small', { text: pn.note }));
    })));
    const dark = (PAPERS[st.paper] || {}).dark;
    pop.append(h('fieldset', null, h('legend', { text: 'Ink' }), h('div', { class: 'swatches' }, INKS.map(ik => h('button', { type: 'button', class: 'sw', style: 'background:' + ik.c, title: ik.name + (dark && !ik.light ? ' (hard to see on dark paper)' : ''), 'aria-label': ik.name, 'aria-pressed': st.ink === ik.id ? 'true' : 'false', onclick: () => setStyle('ink', ik.id) })))));
    pop.append(h('fieldset', null, h('legend', { text: 'Writing size' }), h('div', { class: 'chips' }, SCALES.map(sc => h('button', { type: 'button', class: 'chip', 'aria-pressed': st.scale === sc.v ? 'true' : 'false', onclick: () => setStyle('scale', sc.v) }, sc.name)))));
    pop.append(settingToggle('Animated pen and ink', 'The pen follows your words and ink flows in', 'animate', () => renderReader()));
    pop.append(h('button', { type: 'button', class: 'btn', onclick: () => useEverywhere(['pen', 'ink', 'scale']) }, 'Use this pen on every page'));
  } else if (RD.pop === 'paper') {
    pop.append(popHead('Paper'), h('p', { class: 'note', text: 'Changes page ' + n + ' and every new page you start.' }));
    pop.append(h('div', { class: 'papers' }, Object.keys(PAPERS).map(id => {
      const P = PAPERS[id];
      return h('button', { type: 'button', class: 'paper-t', 'aria-pressed': st.paper === id ? 'true' : 'false', onclick: () => {
        const extra = {}; const ink = inkOf(st.ink);
        if (P.dark && !ink.light) extra.ink = 'white'; else if (!P.dark && ink.light) extra.ink = 'midnight';
        setStyle('paper', id, extra);
      } }, h('i', { style: 'background-color:' + P.bg + ';background-image:repeating-linear-gradient(to bottom,transparent 0 11px,' + P.rule + ' 11px 12px)' + (P.tex === 'aged' ? ',radial-gradient(circle at 70% 70%, rgba(120,80,30,.35), transparent 60%)' : '') }), P.name);
    })));
    pop.append(h('fieldset', null, h('legend', { text: 'Lines' }), h('div', { class: 'chips' }, Object.keys(RULINGS).map(id => h('button', { type: 'button', class: 'chip', 'aria-pressed': st.ruling === id ? 'true' : 'false', onclick: () => setStyle('ruling', id) }, RULINGS[id])))));
    pop.append(h('button', { type: 'button', class: 'btn', onclick: () => useEverywhere(['paper', 'ruling', 'ink']) }, 'Use this paper on every page'));
  } else if (RD.pop === 'decor') {
    pop.append(popHead('Decorate page ' + n), h('p', { class: 'note', text: 'Drag anything to move it. Use the corner dot to resize.' }));
    pop.append(h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn accent', onclick: () => $('#filePage').click() }, '+ Add a photo'),
      h('button', { type: 'button', class: 'btn', onclick: () => { addItem({ t: 'note', w: .36, text: '', c: '#F7E27A' }); const el = focusEl(); const it = editPage(+el.dataset.n).items.slice(-1)[0]; setTimeout(() => editNote(el, it), 80); } }, '+ Sticky note')));
    pop.append(h('fieldset', null, h('legend', { text: 'Washi tape' }), h('div', { class: 'tapes' }, TAPES.map(t => h('button', { type: 'button', style: 'background:' + tapeBg(t), 'aria-label': 'Add washi tape', onclick: () => addItem({ t: 'tape', c: t.c, p: t.p, w: .42 }) })))));
    pop.append(h('fieldset', null, h('legend', { text: 'Stickers' }), h('div', { class: 'grid-emoji' }, STICKERS.map(s => h('button', { type: 'button', 'aria-label': 'Add sticker ' + s, onclick: () => addItem({ t: 'sticker', s, w: .16 }) }, s)))));
  } else if (RD.pop === 'tpl') {
    pop.append(popHead('Templates and prompts'));
    const pr = promptFor(j, n);
    pop.append(h('div', { class: 'card' }, h('p', { class: 'eyebrow', text: "Today's prompt" }), h('q', { text: pr }),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn sm accent', onclick: () => { closePop(); insertText(pr + '\n'); } }, 'Write it on the page'),
        h('button', { type: 'button', class: 'btn sm', onclick: () => { const q = pop.querySelector('q'); q.textContent = PROMPTS[Math.floor(Math.random() * PROMPTS.length)]; } }, 'Another prompt'))));
    pop.querySelector('.card .btn.accent').onclick = () => { const q = pop.querySelector('q').textContent; closePop(); insertText(q + '\n'); };
    pop.append(h('div', { class: 'tpl' }, TEMPLATES.map(t => h('button', { type: 'button', onclick: () => { closePop(); insertText(t.text); } }, h('b', { text: t.name }), h('small', { text: t.note })))));
    pop.append(h('p', { class: 'note', text: 'Templates write themselves onto the page you are on. Use #tags like #travel to find pages later.' }));
  } else if (RD.pop === 'mark') {
    const bm = j.bookmarks.find(b => b.n === n);
    pop.append(popHead('Bookmarks and pages'));
    const gotoN = h('input', { class: 'inp', type: 'number', min: '1', max: String(MAX_PAGES), value: String(n), 'aria-label': 'Page number', id: 'gotoN', style: 'width:96px' });
    const gotoR = h('input', { type: 'range', min: '1', max: String(Math.max(j.pages, 2)), value: String(n), 'aria-label': 'Page slider', style: 'flex:1;accent-color:var(--accent)' });
    gotoR.addEventListener('input', () => { gotoN.value = gotoR.value; });
    gotoN.addEventListener('keydown', e => { if (e.key === 'Enter') goTo(+gotoN.value); });
    let lastW = 0; for (const q of state.pages.values()) if (q.j === j.id && (q.text || '').trim() && q.n > lastW) lastW = q.n;
    pop.append(h('div', { class: 'confirm' }, h('p', null, h('b', { text: 'Go to a page' }), ' · ' + plural(j.pages, 'page') + ' so far'),
      h('div', { class: 'row', style: 'flex-wrap:nowrap' }, gotoR, gotoN),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn sm solid', onclick: () => goTo(+gotoN.value) }, 'Turn to page'),
        h('button', { type: 'button', class: 'btn sm', onclick: () => goTo(1) }, 'First page'),
        lastW ? h('button', { type: 'button', class: 'btn sm', onclick: () => goTo(lastW) }, 'Last written (' + lastW + ')') : null,
        h('button', { type: 'button', class: 'btn sm', onclick: () => goTo(j.pages + 1) }, 'Fresh page'))));
    const box = h('div', { class: 'confirm' });
    box.append(h('p', null, h('b', { text: 'Page ' + n }), p && p.date ? ' · ' + shortDate(p.date) : ''));
    const label = h('input', { class: 'search', id: 'bmLabel', placeholder: 'Label, like “Trip to Goa”', maxlength: '40', value: bm ? bm.label || '' : '' });
    box.append(label);
    let color = bm ? bm.color : BM_COLORS[j.bookmarks.length % BM_COLORS.length];
    const sws = h('div', { class: 'swatches' }, BM_COLORS.map(col => h('button', { type: 'button', class: 'sw', style: 'background:' + col, 'aria-label': 'Bookmark colour', 'aria-pressed': col === color ? 'true' : 'false', onclick: e => { color = col; $$('.sw', sws).forEach(s => s.setAttribute('aria-pressed', 'false')); e.currentTarget.setAttribute('aria-pressed', 'true'); if (bm) { bm.color = col; saveLib(); renderReader(true); } } })));
    box.append(sws);
    label.addEventListener('change', () => { if (bm) { bm.label = label.value.trim(); saveLib(); renderReader(true); renderPop(); } });
    box.append(h('div', { class: 'row' }, bm
      ? h('button', { type: 'button', class: 'btn danger', onclick: () => { j.bookmarks = j.bookmarks.filter(b => b !== bm); saveLib(); renderReader(); } }, 'Remove bookmark')
      : h('button', { type: 'button', class: 'btn solid', onclick: () => { j.bookmarks.push({ n, color, label: label.value.trim() }); saveLib(); renderReader(); sfx('pop'); toast('Bookmarked page ' + n + '.'); } }, 'Bookmark this page')));
    pop.append(box);
    const list = j.bookmarks.slice().sort((a, b) => a.n - b.n);
    pop.append(list.length
      ? h('ul', { class: 'bm-list' }, list.map(b => h('li', null, h('button', { type: 'button', class: 'bm-item', onclick: () => { goTo(b.n); if (window.innerWidth < 680) closePop(); } }, h('i', { style: 'background:' + b.color }), h('span', { text: b.label || 'Bookmark' }), h('small', { text: 'p. ' + b.n })))))
      : h('p', { class: 'note', text: 'No bookmarks yet. Mark a page to jump back to it later.' }));
  } else if (RD.pop === 'more') {
    pop.append(popHead(j.title));
    pop.append(h('div', { class: 'menu' },
      h('button', { type: 'button', class: 'btn', onclick: () => { closePop(); openDesigner(j.id); } }, 'Open the cover studio'),
      h('button', { type: 'button', class: 'btn', onclick: () => exportJournal(j) }, 'Save a copy of this journal (.md)'),
      h('button', { type: 'button', class: 'btn', onclick: () => { closeReader(); setTimeout(() => { state.lib.activeId = null; saveLib(); sync3D(); }, 700); } }, 'Put it back on the shelf'),
      h('button', { type: 'button', class: 'btn danger', onclick: () => { RD.confirmDelete = true; renderPop(); } }, 'Delete this journal')));
    if (RD.confirmDelete) {
      pop.append(h('div', { class: 'confirm' }, h('p', { text: 'Delete “' + j.title + '” and its ' + plural(countWritten(j.id), 'written page') + '? This cannot be undone.' }),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn danger solid', onclick: () => deleteJournal(j.id) }, 'Delete for good'), h('button', { type: 'button', class: 'btn', onclick: () => { RD.confirmDelete = false; renderPop(); } }, 'Keep it'))));
    }
    const words = Array.from(state.pages.entries()).filter(([k]) => k.indexOf(j.id + '~') === 0).reduce((a, [, q]) => a + countWords(q.text), 0);
    pop.append(h('p', { class: 'note', text: plural(countWritten(j.id), 'page') + ' written · ' + plural(words, 'word') + ' · ' + plural(j.bookmarks.length, 'bookmark') }));
  }
}

let downloadsApi = null;
function journalMarkdown(j) {
  const pages = Array.from(state.pages.values()).filter(p => p.j === j.id && (p.text || '').trim()).sort((a, b) => a.n - b.n);
  let out = '# ' + j.title + '\n\n' + (j.subtitle ? j.subtitle + '\n\n' : '');
  pages.forEach(p => { out += '---\n\n## Page ' + p.n + (p.date ? ' · ' + longDate(p.date) : '') + '\n' + (p.mood ? 'Mood: ' + MOODS[p.mood - 1] + '\n' : '') + '\n' + p.text + '\n\n'; });
  return { out, count: pages.length };
}
// says whether the file really went out, so a restore can refuse to go on without its safety copy
async function saveFile(name, data, type) {
  if (!downloadsApi) {   // outside Claude: an ordinary browser download
    // the click hands the file to the browser; whether it then lands in downloads (or is kept) cannot be seen from here
    try {
      const a = h('a', { href: URL.createObjectURL(new Blob([data], { type: type || 'text/markdown;charset=utf-8' })), download: name, hidden: true });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch (e) { toast('Could not save a copy from here.'); return false; }
    toast('Saved a copy to your downloads.'); return true;
  }
  try { await downloadsApi.save({ filename: name, data }); toast('Copy saved.'); return true; }
  catch (e) { if (!e || e.code !== 'declined') toast('Could not save a copy from here.'); return false; }
}
async function exportJournal(j) {
  await flushAll(); const { out, count } = journalMarkdown(j);
  if (!count) { toast('Nothing written in this journal yet.'); return; }
  saveFile(j.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '-' + todayId() + '.md', out);
}
async function exportAll() {
  await flushAll(); let all = '# Daybook\n\nSaved ' + longDate(todayId()) + '\n\n'; let total = 0;
  state.lib.journals.forEach(j => { const { out, count } = journalMarkdown(j); if (count) { all += out.replace(/^# /, '# ') + '\n'; total += count; } });
  if (!total) { toast('Nothing written yet.'); return; }
  saveFile('daybook-' + todayId() + '.md', all);
}
/* ---- full backup and restore ---- */
// One JSON file: { format, version, app, createdAt, lib, pages, media }. lib and pages keep the stored shapes; media holds
// the photos that covers and pages use. The PIN (hash and hint) stays on this device.
const BACKUP = { format: 'daybook-backup', version: 1, maxBytes: 25 * 1024 * 1024 };
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const ID_OK = /^[\w-]{1,64}$/, PHOTO_OK = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const COLOR_OK = /^#[0-9a-f]{3,8}$/i;   // colours reach CSS backgrounds, so only the hex colours Daybook writes (never url(...))
const colorOk = c => c === undefined || COLOR_OK.test(c);
function backupError(msg) { const e = new Error(msg); e.friendly = true; return e; }
// the photos a library's covers and its pages point at
function photoIds(lib, pages) {
  const s = new Set();
  lib.journals.forEach(j => artMids(j).forEach(m => s.add(m)));
  Object.values(pages).forEach(p => (p.items || []).forEach(it => { if (it && it.mid) s.add(it.mid); }));
  return s;
}
// habits and tasks, when there are any, for the restore preview
const planSummary = lib => (lib.habits || []).length || (lib.tasks || []).length ? ', plus ' + plural((lib.habits || []).length, 'habit') + ' and ' + plural((lib.tasks || []).length, 'task') : '';
function libSummary(journals, pages, photos) {
  const written = Object.values(pages).filter(p => (p.text || '').trim() || (p.items || []).length || (p.ink || []).length);
  return plural(journals, 'journal') + ', ' + plural(written.length, 'written page') + ', ' + plural(written.reduce((a, p) => a + countWords(p.text), 0), 'word') + ' and ' + plural(photos, 'photo');
}
async function backupData() {
  await flushAll();
  const lib = clone(state.lib); delete lib.settings.pinHash; delete lib.settings.pinHint;
  const pages = {}; for (const [k, p] of state.pages) pages[k] = clone(p);
  const media = {};
  for (const mid of photoIds(lib, pages)) { const d = await state.store.readMedia(mid); if (d && typeof d.data === 'string') media[mid] = d; }
  return { format: BACKUP.format, version: BACKUP.version, app: 'Daybook', createdAt: new Date().toISOString(), lib, pages, media };
}
async function exportBackup() {
  let text;
  try { text = JSON.stringify(await backupData()); } catch (e) { toast('Could not prepare the backup, so nothing was saved. Please try again.'); return false; }
  return saveFile('daybook-backup-' + todayId() + '.json', text, 'application/json');
}
// Checks a backup file completely before anything is changed; throws a plain-language error for anything it cannot trust.
function checkBackup(text) {
  let d; try { d = JSON.parse(text); } catch (e) { throw backupError('This file is not a Daybook backup: it is not readable JSON.'); }
  if (!isObj(d) || d.format !== BACKUP.format) throw backupError('This file is not a Daybook backup.');
  if (!Number.isInteger(d.version) || d.version < 1) throw backupError('This backup has no version Daybook understands.');
  if (d.version > BACKUP.version) throw backupError('This backup was made by a newer version of Daybook, so it cannot be restored here.');
  const L = d.lib;
  if (!isObj(L) || !Array.isArray(L.journals) || !L.journals.length) throw backupError('This backup has no journals in it.');
  if (L.journals.length > 500) throw backupError('This backup lists more journals than Daybook can hold.');
  if (L.settings !== undefined && !isObj(L.settings)) throw backupError('The settings in this backup are damaged.');
  const ids = new Set();
  L.journals.forEach((j, i) => {
    const bad = () => backupError('Journal ' + (i + 1) + ' in this backup is damaged.');
    if (!isObj(j) || typeof j.id !== 'string' || !ID_OK.test(j.id) || typeof j.title !== 'string') throw bad();
    if (ids.has(j.id)) throw backupError('This backup lists the journal “' + j.title.slice(0, 40) + '” twice, so it cannot be restored safely.');
    ids.add(j.id);
    if ((j.cover !== undefined && !isObj(j.cover)) || (j.defaults !== undefined && !isObj(j.defaults)) || (j.bookmarks !== undefined && !Array.isArray(j.bookmarks))) throw bad();
    if (!colorOk(j.ribbon) || (j.cover && !colorOk(j.cover.color)) || (j.bookmarks || []).some(b => !isObj(b) || !Number.isInteger(b.n) || !colorOk(b.color))) throw bad();
    if (j.art !== undefined && (!isObj(j.art) || (j.art.layers !== undefined && !(Array.isArray(j.art.layers) && j.art.layers.every(isObj))))) throw bad();
  });
  if (!isObj(d.pages)) throw backupError('The pages in this backup are missing.');
  const pages = {}; let skipped = 0;
  for (const [k, p] of Object.entries(d.pages)) {
    const m = /^([\w-]{1,64})~(\d{1,3})$/.exec(k), bad = () => backupError('A page in this backup is damaged, so it cannot be restored safely.');
    if (!m || !isObj(p) || p.j !== m[1] || p.n !== +m[2] || p.n < 1 || p.n > MAX_PAGES) throw bad();
    if ((p.text !== undefined && typeof p.text !== 'string') || (p.date !== undefined && !(typeof p.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.date)))) throw bad();
    if ((p.mood !== undefined && !(Number.isInteger(p.mood) && p.mood >= 0 && p.mood <= 5)) || (p.style !== undefined && !isObj(p.style))) throw bad();
    if ((p.items !== undefined && !(Array.isArray(p.items) && p.items.every(it => isObj(it) && colorOk(it.c)))) || (p.ink !== undefined && !(Array.isArray(p.ink) && p.ink.every(isObj)))) throw bad();
    if (JSON.stringify(p).length > 245000) throw backupError('Page ' + p.n + ' in this backup holds more than Daybook can save on one page.');
    if (!ids.has(p.j)) { skipped++; continue; }   // a page of a journal the backup does not have
    pages[k] = p;
  }
  if (d.media !== undefined && !isObj(d.media)) throw backupError('The photos in this backup are damaged.');
  const want = photoIds(L, pages), media = {};
  for (const [mid, v] of Object.entries(d.media || {})) {
    if (!ID_OK.test(mid) || !isObj(v) || typeof v.data !== 'string' || !PHOTO_OK.test(v.data)) throw backupError('A photo in this backup is damaged, so it cannot be restored safely.');
    if (want.has(mid)) media[mid] = { data: v.data, w: +v.w || 0, h: +v.h || 0, created: +v.created || Date.now() };
  }
  const lib = normLib(L);
  lib.journals.forEach(j => { j.pages = Math.min(j.pages, MAX_PAGES); Object.values(pages).forEach(p => { if (p.j === j.id && p.n > j.pages) j.pages = p.n; }); });
  if (lib.activeId && !ids.has(lib.activeId)) lib.activeId = null;
  const created = new Date(d.createdAt);
  return { lib, pages, media, info: { created: isNaN(created) ? null : created, summary: libSummary(lib.journals.length, pages, Object.keys(media).length) + planSummary(lib), missing: [...want].filter(m => !media[m]).length, skipped } };
}
// Full replacement, once the visitor has confirmed it: a safety copy of what is here goes to their downloads first,
// then everything is written in one go (put back as it was if any write fails) and the page reloads into the backup.
async function restoreBackup(b) {
  await flushAll();
  let safety; try { safety = JSON.stringify(await backupData()); } catch (e) { throw backupError('Could not make a safety copy of your current journals, so nothing was restored.'); }
  // the time keeps each safety copy's name its own, so the recovery message never points at an older copy from the same day
  const safetyName = 'daybook-before-restore-' + todayId() + '-' + new Date().toTimeString().slice(0, 8).replace(/:/g, '') + '.json';
  if (!(await saveFile(safetyName, safety, 'application/json'))) throw backupError('The safety copy of your current journals was not saved, so nothing was restored.');
  const lib = clone(b.lib); lib.settings.pinHash = S().pinHash; lib.settings.pinHint = S().pinHint; lib.settings.welcomed = true;
  state.restoring = true; clearTimeout(libTimer); pageTimers.forEach(t => clearTimeout(t)); pageTimers.clear();
  let mark;
  try { await chain; mark = await state.store.replaceAll(lib, b.pages, b.media); }
  catch (e) {
    // could not put back what was there: saving stays off, so nothing on screen (from before) is saved over the mix
    if (e && e.partial) throw backupError('The restore stopped part way and Daybook could not put everything back. Reload Daybook, then restore “' + safetyName + '” from your downloads to get back what was here.');
    state.restoring = false; throw backupError((e && e.friendly ? e.message : 'Could not write the backup.') + ' Nothing was changed.');
  }
  // in this browser, success is only claimed by the reloaded page, once it finds this restore still stored (checkRestored)
  try { if (mark) sessionStorage.setItem(RESTORE_CHECK, mark); } catch (e) { mark = null; }
  dropAllDrafts();   // unsaved writing kept for the replaced journals no longer belongs to anything here
  toast(mark ? 'Opening the restored backup…' : 'Backup restored. Opening it now…'); setTimeout(() => location.reload(), 700);
}
const RESTORE_CHECK = 'daybook3d:restore-check';
// After the reload: another tab saving in the same instant as the restore can still have landed last. Say which happened.
function checkRestored() {
  let want = null; try { want = sessionStorage.getItem(RESTORE_CHECK); sessionStorage.removeItem(RESTORE_CHECK); } catch (e) { return; }
  if (!want) return;
  if (state.store.restored === want) { toast('Backup restored.'); return; }
  LB.restoreErr = 'Another Daybook tab saved over the backup as it was being restored, so what you see is not the backup. Close other Daybook tabs, then restore it again.';
  toast(LB.restoreErr); openDrawer('settings'); scrollBackup();
}
async function deleteJournal(id) {
  const keys = Array.from(state.pages.keys()).filter(k => k.indexOf(id + '~') === 0);
  const mids = artMids(jById(id) || {});
  keys.forEach(k => (state.pages.get(k).items || []).forEach(it => { if (it.mid) mids.push(it.mid); }));
  closeReader();
  state.lib.journals = state.lib.journals.filter(j => j.id !== id);
  if (state.lib.activeId === id) state.lib.activeId = null;
  keys.forEach(k => { state.pages.delete(k); dirtyPages.delete(k); clearTimeout(pageTimers.get(k)); pageTimers.delete(k); queue(() => state.store.writePage(k, null)); });
  saveLib(); sync3D(); releaseMedia(mids); toast('Journal deleted.');
}

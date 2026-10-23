/* =====================================================================
   Finding and planning: search, quick navigation, focus writing, the
   Today tab (habits, tasks, reviews), and recovering unsaved writing
   ===================================================================== */

/* ---- search ---- */
// Text folded for matching: lower case and without accents (café finds cafe), with where each folded character came
// from, so a match can be marked in the original. Plain ASCII text is the common case and skips the per-character work.
function fold(s) {
  s = s || '';
  if (!/[^\x00-\x7f]/.test(s)) return { f: s.toLowerCase(), map: null };
  let f = ''; const map = [];
  for (let i = 0; i < s.length;) {
    const ch = String.fromCodePoint(s.codePointAt(i)), g = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    for (let k = 0; k < g.length; k++) map.push(i);
    f += g; i += ch.length;
  }
  map.push(s.length);
  return { f, map };
}
// folded page text, kept until the text (or date) changes
const foldCache = new WeakMap();
function foldedPage(p) {
  let c = foldCache.get(p);
  if (!c || c.text !== p.text || c.date !== p.date) { c = { text: p.text, date: p.date, ...fold(p.text), meta: p.date ? fold(p.date + ' ' + longDate(p.date)).f : '' }; foldCache.set(p, c); }
  return c;
}
const searchTerms = q => fold((q || '').trim()).f.split(/\s+/).filter(Boolean);
// Every word must appear, in the page's text or its date ("trip october"). Journals match on their title.
function searchAll(q, limit) {
  const ts = searchTerms(q); if (!ts.length) return { journals: [], pages: [], total: 0 };
  const journals = state.lib.journals.filter(j => { const t = fold(j.title + ' ' + (j.subtitle || '')).f; return ts.every(x => t.includes(x)); });
  const hits = [];
  for (const p of state.pages.values()) {
    if (!(p.text || '').trim() || !jById(p.j)) continue;
    const c = foldedPage(p);
    if (ts.every(x => c.f.includes(x) || c.meta.includes(x))) hits.push(p);
  }
  hits.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (a.j < b.j ? -1 : a.j > b.j ? 1 : a.n - b.n));
  return { journals, pages: hits.slice(0, limit || 40), total: hits.length };
}
// the words around the first match, split so the match can be marked without ever parsing the text as HTML
function snippet(p, q) {
  const c = foldedPage(p), text = p.text, clean = x => x.replace(/\s+/g, ' ');
  let at = -1, len = 0;
  for (const t of searchTerms(q)) { const i = c.f.indexOf(t); if (i >= 0 && (at < 0 || i < at)) { at = i; len = t.length; } }
  if (at < 0) return { before: clean(text).slice(0, 150), hit: '', after: '' };
  const s = c.map ? c.map[at] : at, e = c.map ? c.map[at + len] : at + len;
  let from = Math.max(0, s - 50); if (from) { const sp = text.indexOf(' ', from); if (sp >= 0 && sp < s) from = sp + 1; }   // start on a whole word
  return { before: (from ? '…' : '') + clean(text.slice(from, s)).replace(/^\s/, ''), hit: clean(text.slice(s, e)), after: clean(text.slice(e, e + 110)) + (e + 110 < text.length ? '…' : '') };
}
const hitLine = (p, q) => { const s = snippet(p, q); return h('span', null, s.before, s.hit ? h('mark', { text: s.hit }) : null, s.after); };

/* ---- shared bits for the dialogs below ---- */
// keeps Tab inside a dialog, and gives focus back to what had it when the dialog closes
function trapFocus(box, e) {
  if (e.key !== 'Tab') return;
  const f = [...box.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
const giveFocusBack = el => { if (el && el.isConnected && el.offsetParent !== null && typeof el.focus === 'function') el.focus({ preventScroll: true }); };
// Dialogs and panels take focus when they appear and give it back when they go, so keyboard users are never left behind
// them in the room; modal dialogs also keep Tab inside. (The lock screen handles its own keys.)
const focusables = box => [...box.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
function watchFocus(el, modal) {
  let back = null, open = !el.hidden;
  new MutationObserver(() => {
    if (!el.hidden && !open) {
      open = true; back = document.activeElement;
      setTimeout(() => { if (!el.hidden && !el.contains(document.activeElement)) { const f = el.querySelector('[role=tab][aria-selected="true"]') || focusables(el)[0]; if (f) f.focus({ preventScroll: true }); } }, 0);   // once it is laid out
    } else if (el.hidden && open) { open = false; if (!document.activeElement || document.activeElement === document.body || el.contains(document.activeElement)) giveFocusBack(back); back = null; }
  }).observe(el, { attributes: true, attributeFilter: ['hidden'] });
  if (modal) el.addEventListener('keydown', e => trapFocus(el, e));
}
function watchDialogs() { ['#designer', '#roomCustomModal', '#welcome'].forEach(s => { const m = $(s); if (m) watchFocus(m, true); }); ['#drawer', '#soundPop'].forEach(s => { const m = $(s); if (m) watchFocus(m, false); }); }
// room-level panels sit under the reader, so the reader (and the cover studio) close first
function toRoom() { if (!$('#designer').hidden) closeDesigner(); if (RD.open) closeReader(); }

/* ---- quick navigation (Cmd+K / Ctrl+K) ---- */
const QN = { el: null, sel: 0, items: [], opener: null };
function qnActions() {
  const A = (label, keys, run, ok = true) => ok ? { kind: 'action', label, keys, run } : null;
  const room = !!R3;
  return [
    A('Write today', 'journal page new entry', writeToday),
    RD.open && !RD.focusMode ? A('Focus writing', 'distraction free zen full screen', () => setFocusMode(true)) : null,
    RD.open && RD.focusMode ? A('Leave focus writing', 'exit', () => setFocusMode(false)) : null,
    RD.open ? A('Back to the room', 'close journal reader', closeReader) : null,
    A('Search every journal', 'find text tag', () => { toRoom(); openDrawer('journals'); setTimeout(() => { const s = $('#drSearch'); if (s) s.focus(); }, 60); }),
    A('Today: habits and tasks', 'planner todo to-do checklist streak', () => { toRoom(); openDrawer('today'); }),
    A('Start today’s review', 'daily review reflection', () => startReview('daily', todayId())),
    A('Start this week’s review', 'weekly review reflection', () => startReview('weekly', todayId())),
    A('Library', 'journals list shelf', () => { toRoom(); openDrawer('journals'); }),
    A('Calendar', 'days month', () => { toRoom(); openDrawer('calendar'); }),
    A('Insights', 'stats statistics mood badges heatmap', () => { toRoom(); openDrawer('insights'); }),
    A('Settings', 'preferences options goal', () => { toRoom(); openDrawer('settings'); }),
    A('Full backup and restore', 'export import json safety copy', () => { toRoom(); openDrawer('settings'); setTimeout(scrollBackup, 60); }),
    A('Design a new journal', 'cover studio create', () => { if (RD.open) closeReader(); openDesigner(null); }),
    A('Customize the room', 'walls presets furniture lighting', () => { toRoom(); openRoomCustom('presets'); }, room),
    A('Room tour', 'guided tour', () => { toRoom(); startRoomTour(0); }, room),
    A('Look outside', 'window view sky peek', () => { toRoom(); lookOutside(); }, room),
    A('Explore the room', 'free walk move camera', () => { toRoom(); startFreeExplore(); }, room),
    A('Desk lamp on or off', 'light', toggleLamp, room),
    A('Day or night', 'sky dark light', toggleSky, room),
    A('Sounds', 'ambience rain music volume', () => { toRoom(); openSoundPop(); }),
    A('Lock now', 'pin privacy', showLock, !!S().pinHash)
  ].filter(Boolean);
}
function qnResults(q) {
  const ts = searchTerms(q), match = s => ts.every(t => fold(s).f.includes(t));
  const acts = qnActions().filter(a => !ts.length || match(a.label + ' ' + a.keys));
  const journals = state.lib.journals.slice().sort((a, b) => a.order - b.order).filter(j => !ts.length || match(j.title + ' ' + (j.subtitle || '') + ' journal open'))
    .map(j => ({ kind: 'journal', label: 'Open ' + j.title, run: () => openJournal(j.id) }));
  const pages = q.trim().length >= 2 ? searchAll(q, 8).pages.map(p => ({ kind: 'page', label: jById(p.j).title + ' · page ' + p.n + (p.date ? ' · ' + shortDate(p.date) : ''), p, run: () => openJournal(p.j, p.n) })) : [];
  return [...acts.slice(0, ts.length ? 8 : 6), ...journals.slice(0, 6), ...pages];
}
function openQuickNav() {
  if (isLocked() || QN.el) return;
  QN.opener = document.activeElement; QN.sel = 0;
  const inp = h('input', { id: 'qnIn', class: 'search', type: 'text', autocomplete: 'off', spellcheck: 'false', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'qnList', 'aria-autocomplete': 'list', 'aria-label': 'Go to a journal, page or action', placeholder: 'Go to a journal, page or action…' });
  const list = h('ul', { id: 'qnList', class: 'qn-list', role: 'listbox', 'aria-label': 'Results' });
  const box = h('div', { class: 'modal qn', id: 'qnav', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Quick navigation', onclick: e => { if (e.target.id === 'qnav') closeQuickNav(); } },
    h('div', { class: 'panel qn-panel' }, inp, list, h('p', { class: 'qn-foot note', text: '↑ ↓ to choose · Enter to open · Esc to close' })));
  QN.el = box; document.body.append(box);
  const render = () => {
    QN.items = qnResults(inp.value); list.textContent = '';
    if (!QN.items.length) list.append(h('li', { class: 'qn-empty', text: 'Nothing matches “' + inp.value.trim() + '”.' }));
    QN.items.forEach((it, i) => list.append(h('li', { id: 'qn' + i, role: 'option', class: 'qn-item', 'aria-selected': i === QN.sel ? 'true' : 'false', onmousemove: () => { if (QN.sel !== i) { QN.sel = i; mark(); } }, onclick: () => runQuickNav(i) },
      h('small', { text: it.kind === 'action' ? 'Action' : it.kind === 'journal' ? 'Journal' : 'Page' }), h('b', { text: it.label }), it.p ? hitLine(it.p, inp.value) : null)));
    mark();
  };
  const mark = () => { [...list.children].forEach((li, i) => li.setAttribute('aria-selected', i === QN.sel ? 'true' : 'false')); const cur = list.children[QN.sel]; if (cur && QN.items.length) { inp.setAttribute('aria-activedescendant', cur.id); cur.scrollIntoView({ block: 'nearest' }); } else inp.removeAttribute('aria-activedescendant'); };
  inp.addEventListener('input', () => { QN.sel = 0; render(); });
  box.addEventListener('keydown', e => {
    e.stopPropagation();   // the room's keys (and Escape closing the reader) must not act under the palette
    if (e.key === 'Escape') { e.preventDefault(); closeQuickNav(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (QN.items.length) { QN.sel = (QN.sel + (e.key === 'ArrowDown' ? 1 : -1) + QN.items.length) % QN.items.length; mark(); } }
    else if (e.key === 'Enter') { e.preventDefault(); if (QN.items.length) runQuickNav(QN.sel); }
    else if (e.key === 'Tab') e.preventDefault();   // one field: Tab would only leave the dialog
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); closeQuickNav(); }
  });
  render(); inp.focus();
}
function closeQuickNav(keepFocus) { if (!QN.el) return; QN.el.remove(); QN.el = null; if (!keepFocus) giveFocusBack(QN.opener); QN.opener = null; }
function runQuickNav(i) { const it = QN.items[i]; if (!it) return; closeQuickNav(true); it.run(); }

/* ---- focus writing ---- */
// The same reader and pages with everything but the writing put away: no tools, no room behind, a quiet word count.
function setFocusMode(on) {
  on = !!on && RD.open;
  RD.focusMode = on; $('#reader').classList.toggle('focus', on);
  $('#rFocus').setAttribute('aria-pressed', on ? 'true' : 'false');
  if (on) { closePop(); if (RD.drawing) toggleDraw(false); $('#rFocusExit').focus({ preventScroll: true }); const el = focusEl(); if (el && !el.classList.contains('is-end') && !(R3 && R3.mobile)) el._ta.focus({ preventScroll: true }); }
  else if (RD.open) $('#rFocus').focus({ preventScroll: true });
}

/* ---- habits ---- */
const PL = { day: null, editHabit: null, editTask: null, confirm: null };
const planDay = () => PL.day || todayId();
const habits = () => state.lib.habits || (state.lib.habits = []);
const tasks = () => state.lib.tasks || (state.lib.tasks = []);
const scheduledOn = (hb, id) => hb.days.includes(fromId(id).getDay()) && (!hb.start || id >= hb.start);
const addDays = (id, n) => { const d = fromId(id); d.setDate(d.getDate() + n); return toId(d); };
// Days in a row, counting back from today, on which the habit was due and done. Today only counts once it is done (it is
// not missed until it is over); days it was not due neither break nor extend it; days before it was started do not count.
function habitStreak(hb, today) {
  today = today || todayId(); let n = 0;
  for (let id = today, i = 0; i < 3700; i++, id = addDays(id, -1)) {
    if (hb.start && id < hb.start) break;
    if (!hb.days.includes(fromId(id).getDay())) continue;
    if (hb.done[id]) n++; else if (id !== today) break;
  }
  return n;
}
const DAY_LETTERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'], WEEK = [1, 2, 3, 4, 5, 6, 0];
const scheduleText = days => days.length === 7 ? 'Every day' : days.join() === '1,2,3,4,5' ? 'Weekdays' : days.join() === '0,6' ? 'Weekends' : WEEK.filter(d => days.includes(d)).map(d => DAY_LETTERS[d]).join(' ');
function setHabitDone(hb, id, on) { if (id > todayId()) return; if (on) hb.done[id] = true; else delete hb.done[id]; saveLib(); renderToday(); }
function dayChips(sel, onChange) {
  return h('div', { class: 'chips', role: 'group', 'aria-label': 'Days' }, WEEK.map(d => h('button', { type: 'button', class: 'chip sm', 'aria-pressed': sel.includes(d) ? 'true' : 'false', 'aria-label': DAYS[d], onclick: e => {
    const i = sel.indexOf(d); if (i >= 0) { if (sel.length > 1) sel.splice(i, 1); } else sel.push(d); sel.sort();
    e.currentTarget.setAttribute('aria-pressed', sel.includes(d) ? 'true' : 'false'); if (onChange) onChange();
  } }, DAY_LETTERS[d])));
}
function habitCard() {
  const card = h('div', { class: 'card', id: 'plHabits' }, h('h3', { text: 'Habits' }));
  const day = planDay(), future = day > todayId();
  if (!habits().length) card.append(h('p', { class: 'note', text: 'Nothing to track yet. Add something small you want to do regularly, like “Read 10 pages”.' }));
  habits().forEach(hb => {
    if (PL.editHabit === hb.id) { card.append(habitEditor(hb)); return; }
    const due = scheduledOn(hb, day), done = !!hb.done[day], streak = habitStreak(hb);
    const strip = h('div', { class: 'pl-strip', 'aria-label': 'Last 14 days' });
    for (let i = 13; i >= 0; i--) {
      const id = addDays(todayId(), -i), s = scheduledOn(hb, id) ? (hb.done[id] ? 'done' : id === todayId() ? 'open' : 'missed') : 'off';
      strip.append(h('i', { class: s, title: shortDate(id) + ': ' + { done: 'done', open: 'not yet', missed: 'missed', off: 'not due' }[s] }));
    }
    card.append(h('div', { class: 'pl-habit' },
      h('button', { type: 'button', class: 'pl-check', 'aria-pressed': done ? 'true' : 'false', disabled: !due || future, 'aria-label': (done ? 'Done: ' : 'Mark done: ') + hb.name + (due ? '' : ' (not due on this day)'), onclick: () => setHabitDone(hb, day, !done) }, done ? '✓' : ''),
      h('span', { class: 'pl-main' }, h('b', { text: hb.name }), h('small', { text: scheduleText(hb.days) + (streak ? ' · ' + plural(streak, 'day') + ' in a row' : '') + (due ? '' : ' · not due ' + (day === todayId() ? 'today' : 'this day')) })),
      strip,
      h('button', { type: 'button', class: 'btn sm', 'aria-label': 'Edit ' + hb.name, onclick: () => { PL.editHabit = hb.id; PL.confirm = null; renderToday(); } }, 'Edit')));
  });
  if (PL.editHabit === 'new') card.append(habitEditor(null));
  else if (habits().length < 50) card.append(h('button', { type: 'button', class: 'btn sm', id: 'plAddHabit', onclick: () => { PL.editHabit = 'new'; renderToday(); setTimeout(() => { const i = $('#plHabitName'); if (i) i.focus(); }, 0); } }, '+ Add a habit'));
  return card;
}
function habitEditor(hb) {
  const days = hb ? hb.days.slice() : [0, 1, 2, 3, 4, 5, 6];
  const name = h('input', { class: 'inp', id: 'plHabitName', maxlength: '60', value: hb ? hb.name : '', placeholder: 'For example: Read 10 pages', 'aria-label': 'Habit name' });
  const save = () => {
    const v = name.value.trim(); if (!v) { name.focus(); return; }
    if (hb) { hb.name = v; hb.days = days.slice(); }   // history stays: the days already ticked keep their dates
    else habits().push({ id: newId('h'), name: v, days: days.slice(), start: todayId(), done: {} });
    PL.editHabit = null; saveLib(); renderToday();
  };
  name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); PL.editHabit = null; renderToday(); } });
  const box = h('div', { class: 'confirm pl-edit' }, name, h('p', { class: 'note', text: 'Due on' }), dayChips(days));
  if (hb && PL.confirm === 'habit:' + hb.id) box.append(h('p', null, h('b', { text: 'Delete “' + hb.name + '”? ' }), 'Its ticks go with it.'), h('div', { class: 'row' },
    h('button', { type: 'button', class: 'btn sm danger solid', onclick: () => { state.lib.habits = habits().filter(x => x !== hb); PL.editHabit = null; PL.confirm = null; saveLib(); renderToday(); } }, 'Delete habit'),
    h('button', { type: 'button', class: 'btn sm', onclick: () => { PL.confirm = null; renderToday(); } }, 'Keep it')));
  else box.append(h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn sm solid', onclick: save }, hb ? 'Save' : 'Add habit'),
    h('button', { type: 'button', class: 'btn sm', onclick: () => { PL.editHabit = null; renderToday(); } }, 'Cancel'),
    hb ? h('button', { type: 'button', class: 'btn sm danger', onclick: () => { PL.confirm = 'habit:' + hb.id; renderToday(); } }, 'Delete…') : null));
  return box;
}

/* ---- tasks ---- */
function addTask(text, day) { text = (text || '').trim().slice(0, 200); if (!text) return null; const t = { id: newId('t'), text, date: day, done: false, created: Date.now(), link: null, from: '' }; tasks().push(t); saveLib(); return t; }
// unfinished tasks from days before today; moving them changes their date (no copies, so nothing is doubled)
const overdue = () => tasks().filter(t => !t.done && t.date < todayId());
function carryForward() { const list = overdue(), t = todayId(); list.forEach(x => { if (!x.from) x.from = x.date; x.date = t; }); if (list.length) { saveLib(); toast(plural(list.length, 'unfinished task') + ' moved to today.'); } renderToday(); return list.length; }
const pagesOn = day => writtenPages().filter(p => p.date === day && jById(p.j)).sort((a, b) => a.j < b.j ? -1 : a.j > b.j ? 1 : a.n - b.n);
function taskCard() {
  const day = planDay(), list = tasks().filter(t => t.date === day), done = list.filter(t => t.done).length;
  const card = h('div', { class: 'card', id: 'plTasks' }, h('h3', { text: 'Tasks' }), list.length ? h('p', { class: 'note', id: 'plTaskCount', text: done + ' of ' + list.length + ' done' }) : null);
  const late = day === todayId() ? overdue() : [];
  if (late.length) card.append(h('div', { class: 'confirm' }, h('p', { text: plural(late.length, 'unfinished task') + ' from earlier days: ' + late.slice(0, 3).map(t => t.text).join(', ') + (late.length > 3 ? '…' : '') }),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn sm solid', id: 'plCarry', onclick: carryForward }, 'Move them to today'))));
  const ul = h('ul', { class: 'pl-tasks' });
  list.forEach(t => {
    if (PL.editTask === t.id) {
      const inp = h('input', { class: 'inp', maxlength: '200', value: t.text, 'aria-label': 'Task' });
      const save = () => { const v = inp.value.trim(); if (v) t.text = v; PL.editTask = null; saveLib(); renderToday(); };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); PL.editTask = null; renderToday(); } });
      const pages = pagesOn(t.date), sel = h('select', { class: 'inp', 'aria-label': 'Link to a page' }, h('option', { value: '', text: 'No linked page' }),
        pages.map(p => h('option', { value: p.j + '~' + p.n, text: jById(p.j).title + ' · page ' + p.n })));
      sel.value = t.link ? t.link.j + '~' + t.link.n : '';
      if (sel.value === '' && t.link) sel.append(h('option', { value: t.link.j + '~' + t.link.n, text: 'Current link (that page is gone)', selected: true }));
      sel.addEventListener('change', () => { const m = sel.value.split('~'); t.link = sel.value ? { j: m[0], n: +m[1] } : null; });
      ul.append(h('li', { class: 'pl-task editing' }, h('div', { class: 'confirm pl-edit' }, inp, pages.length || t.link ? sel : h('p', { class: 'note', text: 'Pages written on this day can be linked here.' }),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn sm solid', onclick: save }, 'Save'), h('button', { type: 'button', class: 'btn sm', onclick: () => { PL.editTask = null; renderToday(); } }, 'Cancel'),
          h('button', { type: 'button', class: 'btn sm danger', onclick: () => { state.lib.tasks = tasks().filter(x => x !== t); PL.editTask = null; saveLib(); renderToday(); toast('Task deleted.'); } }, 'Delete task')))));
      setTimeout(() => inp.focus(), 0);
      return;
    }
    const linked = t.link && state.pages.get(pageKey(t.link.j, t.link.n)) && jById(t.link.j);
    ul.append(h('li', { class: 'pl-task' + (t.done ? ' done' : '') },
      h('button', { type: 'button', class: 'pl-check', 'aria-pressed': t.done ? 'true' : 'false', 'aria-label': (t.done ? 'Done: ' : 'Mark done: ') + t.text, onclick: () => { t.done = !t.done; saveLib(); renderToday(); } }, t.done ? '✓' : ''),
      h('span', { class: 'pl-main' }, h('b', { text: t.text }), t.from ? h('small', { text: 'from ' + shortDate(t.from) }) : null,
        t.link ? (linked ? h('button', { type: 'button', class: 'pl-link', onclick: () => openJournal(t.link.j, t.link.n) }, '↗ ' + jById(t.link.j).title + ' · page ' + t.link.n) : h('small', { text: 'Linked page is gone' })) : null),
      h('button', { type: 'button', class: 'btn sm', 'aria-label': 'Edit ' + t.text, onclick: () => { PL.editTask = t.id; renderToday(); } }, 'Edit')));
  });
  if (list.length) card.append(ul);
  else card.append(h('p', { class: 'note', text: day === todayId() ? 'No tasks for today.' : 'No tasks on this day.' }));
  const inp = h('input', { class: 'inp', id: 'plTaskIn', maxlength: '200', placeholder: day === todayId() ? 'Add a task for today' : 'Add a task for ' + shortDate(day), 'aria-label': 'New task' });
  const add = () => { if (addTask(inp.value, day)) { renderToday(); const i = $('#plTaskIn'); if (i) i.focus(); } else inp.focus(); };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  card.append(h('div', { class: 'row pl-add' }, inp, h('button', { type: 'button', class: 'btn sm solid', onclick: add }, 'Add')));
  return card;
}

/* ---- daily and weekly reviews ---- */
// Built only from what was recorded; anything not recorded is said to be not recorded, never shown as zero.
const isReview = p => /#review\b/.test(p.text || '');
const weekStart = id => { const d = fromId(id); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return toId(d); };
const rangeLabel = (a, b) => shortDate(a) + ' – ' + shortDate(b);
function writingLine(pages, days) {
  const words = pages.reduce((n, p) => n + countWords(p.text), 0), dset = new Set(pages.map(p => p.date));
  if (!pages.length) return '• Writing: nothing written ' + (days ? 'this week' : 'on this day') + ' yet';
  return '• Writing: ' + (days ? 'on ' + dset.size + ' of ' + days + ' days, ' : '') + plural(pages.length, 'page') + ', ' + plural(words, 'word');
}
function reviewText(kind, day) {
  const today = todayId();
  if (kind === 'daily') {
    const pages = pagesOn(day).filter(p => !isReview(p)), moods = pages.filter(p => p.mood).map(p => MOODS[p.mood - 1]);
    const hs = habits().filter(hb => scheduledOn(hb, day)), ts = tasks().filter(t => t.date === day), open = ts.filter(t => !t.done);
    const that = day === today ? 'today' : 'that day', next = day === today ? 'tomorrow' : 'the next day';
    return ['Daily review · ' + longDate(day) + '  #review', '', 'What Daybook recorded:', writingLine(pages, 0),
      '• Mood: ' + (moods.length ? Array.from(new Set(moods)).join(', then ') : 'not recorded'),
      '• Habits: ' + (!habits().length ? 'none set up' : !hs.length ? 'none due' : hs.filter(hb => hb.done[day]).length + ' of ' + hs.length + ' done (' + hs.map(hb => hb.name + (hb.done[day] ? ' ✓' : ' ✗')).join(', ') + ')'),
      '• Tasks: ' + (!ts.length ? 'none on this day' : (ts.length - open.length) + ' of ' + ts.length + ' done' + (open.length ? '; still open: ' + open.map(t => t.text).join('; ') : '')),
      '', 'What mattered most ' + that + '?', '', '', 'What did I accomplish?', '', '', 'What remains unfinished?', '', '', 'What should I focus on ' + next + '?', '', ''].join('\n');
  }
  const a = weekStart(day), b = addDays(a, 6), upTo = b < today ? b : today, ndays = Math.max(1, Math.round((fromId(upTo) - fromId(a)) / 864e5) + 1);
  const days = []; for (let id = a; id <= upTo; id = addDays(id, 1)) days.push(id);
  const pages = writtenPages().filter(p => p.date >= a && p.date <= upTo && jById(p.j) && !isReview(p)), moods = pages.filter(p => p.mood).map(p => p.mood);
  const ts = tasks().filter(t => t.date >= a && t.date <= b), dn = ts.filter(t => t.done);
  const hline = habits().map(hb => { const due = days.filter(id => scheduledOn(hb, id)); return due.length ? hb.name + ' ' + due.filter(id => hb.done[id]).length + ' of ' + due.length : null; }).filter(Boolean);
  let mood = 'not recorded this week';
  if (moods.length) { const cnt = {}; moods.forEach(m => { cnt[m] = (cnt[m] || 0) + 1; }); const top = Object.keys(cnt).sort((x, y) => cnt[y] - cnt[x] || y - x)[0]; mood = 'recorded on ' + plural(new Set(pages.filter(p => p.mood).map(p => p.date)).size, 'day') + ', most often ' + MOODS[top - 1] + ' (average ' + (moods.reduce((s, m) => s + m, 0) / moods.length).toFixed(1) + ' of 5)'; }
  return ['Weekly review · ' + rangeLabel(a, b) + '  #review', '', 'What Daybook recorded' + (upTo < b ? ' so far (' + plural(ndays, 'day') + ')' : '') + ':', writingLine(pages, ndays),
    '• Mood: ' + mood,
    '• Habits: ' + (!habits().length ? 'none set up' : hline.length ? hline.join(' · ') : 'none due'),
    '• Tasks: ' + (!ts.length ? 'none this week' : dn.length + ' of ' + ts.length + ' done'), dn.length ? '• Done: ' + dn.map(t => t.text).join('; ') : null,
    '', 'Accomplishments', '', '', 'Lessons learned', '', '', 'Next week’s priorities', '', ''].filter(x => x !== null).join('\n');
}
const reviewKey = (kind, day) => kind + ':' + (kind === 'weekly' ? weekStart(day) : day);
function reviewPage(kind, day) { const r = (state.lib.reviews || {})[reviewKey(kind, day)]; const p = r && state.pages.get(pageKey(r.j, r.n)); return r && p && (p.text || '').trim() && jById(r.j) ? r : null; }
function reviewJournalId() { const s = S().reviewJournal; return jById(s) ? s : jById(state.lib.activeId) ? state.lib.activeId : (state.lib.journals[0] || {}).id; }
// Opens the review if there is one; otherwise writes the draft on the first unused page after the journal's last written
// page (never over anything) and opens it there to be edited.
function startReview(kind, day) {
  const have = reviewPage(kind, day);
  if (have) { toRoom(); closeDrawer(); openJournal(have.j, have.n); return have; }
  const jid = reviewJournalId(), j = jById(jid); if (!j) { toast('Design a journal first, then start a review in it.'); return null; }
  let last = 0; for (const p of state.pages.values()) if (p.j === jid && !pageIsEmpty(p) && p.n > last) last = p.n;
  const n = last + 1; if (n > MAX_PAGES) { toast(j.title + ' is full. Choose another journal for reviews.'); return null; }
  const key = pageKey(jid, n), p = { j: jid, n, text: reviewText(kind, day), date: day, mood: 0, updatedAt: Date.now() };
  state.pages.set(key, p); savePage(key, true);
  if (n > j.pages) j.pages = n;
  if (!state.lib.reviews) state.lib.reviews = {};
  state.lib.reviews[reviewKey(kind, day)] = { j: jid, n }; saveLib();
  toRoom(); closeDrawer(); openJournal(jid, n);
  toast((kind === 'daily' ? 'Daily' : 'Weekly') + ' review started on page ' + n + ' of ' + j.title + '.');
  return { j: jid, n };
}
function reviewCard() {
  const day = planDay(), card = h('div', { class: 'card', id: 'plReviews' }, h('h3', { text: 'Reviews' }));
  const row = (kind, label) => { const r = reviewPage(kind, day); return h('div', { class: 'pl-review' }, h('span', { class: 'pl-main' }, h('b', { text: label }), h('small', { text: r ? 'On page ' + r.n + ' of ' + jById(r.j).title : 'A page with what was recorded, and questions to answer' })),
    h('button', { type: 'button', class: 'btn sm' + (r ? '' : ' solid'), id: kind === 'daily' ? 'plDaily' : 'plWeekly', onclick: () => startReview(kind, day) }, r ? 'Open' : 'Start')); };
  card.append(row('daily', 'Daily review · ' + (day === todayId() ? 'today' : shortDate(day))), row('weekly', 'Weekly review · ' + rangeLabel(weekStart(day), addDays(weekStart(day), 6))));
  if (state.lib.journals.length > 1) {
    const sel = h('select', { class: 'inp', id: 'plReviewJournal', 'aria-label': 'Journal for new reviews' }, state.lib.journals.map(j => h('option', { value: j.id, text: j.title })));
    sel.value = reviewJournalId(); sel.addEventListener('change', () => { state.lib.settings.reviewJournal = sel.value; saveLib(); });
    card.append(h('label', { class: 'pl-field' }, h('span', { class: 'note', text: 'New reviews go in' }), sel));
  }
  return card;
}

/* ---- the Today tab ---- */
function tabToday(body) {
  const day = planDay(), today = todayId();
  const go = n => { PL.day = addDays(day, n); PL.editHabit = PL.editTask = PL.confirm = null; renderToday(); };
  body.append(h('div', { class: 'pl-day' },
    h('button', { type: 'button', class: 'btn sm', 'aria-label': 'Previous day', onclick: () => go(-1) }, '‹'),
    h('b', { id: 'plDate', text: day === today ? 'Today · ' + shortDate(day) : longDate(day) }),
    h('button', { type: 'button', class: 'btn sm', 'aria-label': 'Next day', onclick: () => go(1) }, '›'),
    day !== today ? h('button', { type: 'button', class: 'btn sm', onclick: () => { PL.day = null; renderToday(); } }, 'Today') : null));
  body.append(habitCard(), taskCard(), reviewCard());
}
function renderToday() { if (LB.tab === 'today' && !$('#drawer').hidden) { const sc = $('#drBody').scrollTop; renderDrawer(); $('#drBody').scrollTop = sc; } }

/* ---- unsaved writing found on load ---- */
function offerDrafts() {
  if (isLocked()) { const lk = $('#lock'), mo = new MutationObserver(() => { if (lk.hidden) { mo.disconnect(); offerDrafts(); } }); mo.observe(lk, { attributes: true, attributeFilter: ['hidden'] }); return; }   // never show writing before the PIN
  const list = pendingDrafts(); if (!list.length || $('#recover')) return;
  const opener = document.activeElement, rows = h('div', { class: 'rc-list' });
  const box = h('div', { class: 'modal', id: 'recover', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rcvTitle' },
    h('div', { class: 'panel recover' }, h('header', { class: 'm-head' }, h('h2', { id: 'rcvTitle', text: 'Unsaved writing found' })),
      h('div', { class: 'w-body' }, h('p', { class: 'note', text: 'This writing had not been saved when Daybook last closed in this tab. Choose what to keep for each page. Nothing changes until you do.' }), rows),
      h('footer', { class: 'm-foot' }, h('button', { type: 'button', class: 'btn', id: 'rcvLater', onclick: () => close() }, 'Decide later'))));
  const close = () => { box.remove(); giveFocusBack(opener); };
  const ex = t => { const s = (t || '').replace(/\s+/g, ' ').trim(); return s ? '“' + s.slice(0, 160) + (s.length > 160 ? '…' : '') + '”' : '(empty)'; };
  const done = (row, msg) => { row.replaceWith(h('p', { class: 'note', text: msg })); if (!rows.querySelector('.rc-item')) setTimeout(close, 900); };
  list.forEach(d => {
    const j = jById(d.j), when = new Date(d.draft.at || Date.now()).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    const row = h('div', { class: 'confirm rc-item' },
      h('p', null, h('b', { text: (j ? j.title : 'A journal that is gone') + ' · page ' + d.n }), ' · written ' + when),
      h('p', { text: 'Recovered: ' + ex(d.draft.text) }), h('p', { class: 'note', text: 'Saved now: ' + (d.saved ? ex(d.saved.text) : 'nothing on this page') }));
    if (d.conflict) row.append(h('p', { class: 'note bk-msg', text: 'This page was saved again after this writing (perhaps in another tab). Restoring replaces that saved text.' }));
    const keep = h('button', { type: 'button', class: 'btn sm', onclick: () => { dropDraft(d.key); done(row, 'Kept the saved page for ' + (j ? j.title : 'that journal') + ', page ' + d.n + '.'); } }, 'Keep the saved page');
    row.append(h('div', { class: 'row' }, j ? h('button', { type: 'button', class: 'btn sm solid', onclick: () => { useDraft(d); done(row, 'Restored ' + j.title + ', page ' + d.n + '.'); } }, 'Restore this writing') : null, keep));
    rows.append(row);
  });
  box.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } else trapFocus(box, e); });
  document.body.append(box); box.querySelector('.rc-item button').focus();
}
function useDraft(d) {
  const j = jById(d.j); if (!j) return;
  let p = state.pages.get(d.key); if (!p) { p = { j: d.j, n: d.n, text: '', date: d.draft.date || todayId(), mood: 0 }; state.pages.set(d.key, p); }
  p.text = d.draft.text; if (d.draft.date) p.date = d.draft.date; if (d.draft.mood) p.mood = d.draft.mood; p.updatedAt = Date.now();
  if (d.n > j.pages) { j.pages = d.n; saveLib(); }
  savePage(d.key, true); refreshOpenUI();
}

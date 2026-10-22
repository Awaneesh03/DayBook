/* =====================================================================
   Library: journals, calendar, insights, settings
   ===================================================================== */
const LB = { tab: 'journals', calY: new Date().getFullYear(), calM: new Date().getMonth(), calSel: null, pinStep: null };
function openDrawer(tab) { if (isLocked()) return; closeSoundPop(); hideMemory(); const dr = $('#drawer'); if (tab) LB.tab = tab; dr.hidden = false; renderDrawer(); requestAnimationFrame(() => dr.classList.add('open')); fadeHint(); }
function closeDrawer() { if (document.body.classList.contains('no3d')) return; const dr = $('#drawer'); dr.classList.remove('open'); setTimeout(() => { if (!dr.classList.contains('open')) dr.hidden = true; }, 450); }
function renderDrawerSoft() { if (LB.tab === 'journals') { renderJournalList(); renderSearch(); } else if (LB.tab !== 'settings') renderDrawer(); }
function renderDrawer() {
  if (!state.lib) return;
  const tabs = { journals: tabJournals, calendar: tabCalendar, insights: tabInsights, settings: tabSettings };
  if (!tabs[LB.tab]) LB.tab = 'journals';   // the shelf and the pen cup ask for 'library', which is not a tab
  $$('.dtabs [data-dt]').forEach(b => b.setAttribute('aria-selected', b.dataset.dt === LB.tab ? 'true' : 'false'));
  const body = $('#drBody'); body.textContent = ''; body.scrollTop = 0;
  tabs[LB.tab](body);
}
function memories() {
  const t = new Date(), out = [];
  for (const p of state.pages.values()) {
    if (!p.date || !(p.text || '').trim() || p.date === todayId()) continue;
    const d = fromId(p.date);
    if (d.getDate() !== t.getDate()) continue;
    const months = (t.getFullYear() - d.getFullYear()) * 12 + t.getMonth() - d.getMonth();
    if (months >= 1) out.push({ p, label: months % 12 === 0 ? plural(months / 12, 'year') + ' ago today' : plural(months, 'month') + ' ago today' });
  }
  return out.sort((a, b) => a.p.date.localeCompare(b.p.date));
}
function memoryCard(m) {
  const j = jById(m.p.j);
  return h('div', { class: 'card' }, h('p', { class: 'eyebrow', text: 'On this day · ' + m.label }), h('q', { text: m.p.text.replace(/\s+/g, ' ').slice(0, 140) + (m.p.text.length > 140 ? '…' : '') }),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn sm', onclick: () => openJournal(m.p.j, m.p.n) }, 'Read it in ' + (j ? j.title : 'your journal'))));
}
function tabJournals(body) {
  memories().slice(0, 2).forEach(m => body.append(memoryCard(m)));
  const pagesW = writtenPages().length;
  body.append(h('div', { class: 'stats' }, [[state.lib.journals.length, 'journals'], [pagesW, 'pages'], [totalWords(), 'words'], [currentStreak(), 'day streak']].map(([v, l]) => h('div', { class: 'stat' }, h('b', { text: v.toLocaleString() }), h('span', { text: l })))));
  const q = h('input', { class: 'search', id: 'drSearch', type: 'search', placeholder: 'Search every journal or #tag', autocomplete: 'off', 'aria-label': 'Search every journal' });
  q.value = LB.q || ''; q.addEventListener('input', () => { LB.q = q.value; renderSearch(); });
  body.append(q);
  const tags = topTags(10);
  if (tags.length) body.append(h('div', { class: 'tags' }, tags.map(([t, c]) => h('button', { type: 'button', class: 'chip', onclick: () => { q.value = t; LB.q = t; renderSearch(); } }, t + ' ', h('small', { text: String(c), style: 'opacity:.6' })))));
  body.append(h('div', { class: 'results', id: 'drResults' }), h('ul', { class: 'jl', id: 'drList' }));
  body.append(h('button', { type: 'button', class: 'btn accent', onclick: () => openDesigner(null) }, '+ Design a new journal'));
  body.append(h('p', { class: 'note', text: state.store && state.store.kind === 'cloud' ? 'Saved to your account. Only you can read your journals, even if you share this page.' : window.claude ? 'Saved in this browser only. Open Daybook in Claude while signed in to keep journals on your account.' : 'Saved in this browser on this device only. Clearing your browsing data erases it, so save a copy now and then (Settings).' }));
  renderJournalList(); renderSearch();
}
// the #tags on a page, each once and in lower case (#Travel and #travel are one tag); a tag starts with a letter, in any language
function tagsIn(text) { return Array.from(new Set(((text || '').match(/#\p{L}[\p{L}\p{N}_-]*/gu) || []).map(t => t.toLowerCase()))); }
function topTags(n) { const m = new Map(); for (const p of state.pages.values()) tagsIn(p.text).forEach(t => m.set(t, (m.get(t) || 0) + 1)); return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, n); }
function renderJournalList() {
  const list = $('#drList'); if (!list) return; list.textContent = ''; list.hidden = !!(LB.q || '').trim();
  state.lib.journals.slice().sort((a, b) => a.order - b.order).forEach(j => {
    const cnt = countWritten(j.id); let lastDate = '';
    for (const p of state.pages.values()) if (p.j === j.id && p.date && (p.text || '').trim() && p.date > lastDate) lastDate = p.date;
    list.append(h('li', null, h('button', { type: 'button', class: 'jl-item', onclick: () => openJournal(j.id) },
      h('img', { src: coverURL(j, 132), alt: '' }),
      h('span', { class: 'jl-t' }, h('b', { text: j.title }), h('span', { text: plural(cnt, 'page') + ' written' + (lastDate ? ' · last ' + shortDate(lastDate) : '') })),
      state.lib.activeId === j.id ? h('span', { class: 'jl-badge', text: 'On desk' }) : null)));
  });
}
function renderSearch() {
  const res = $('#drResults'); if (!res) return; res.textContent = '';
  const q = (LB.q || '').trim(); const list = $('#drList'); if (list) list.hidden = !!q;
  if (!q) return;
  const ql = q.toLowerCase(); const hits = [];
  for (const p of state.pages.values()) { if ((p.text || '').toLowerCase().indexOf(ql) >= 0) hits.push(p); }
  hits.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!hits.length) { res.append(h('p', { class: 'note', text: 'Nothing matches “' + q + '”.' })); return; }
  res.append(h('p', { class: 'note', text: plural(hits.length, 'page') + ' found' }));
  hits.slice(0, 40).forEach(p => {
    const j = jById(p.j); if (!j) return;
    const flat = p.text.replace(/\s+/g, ' '); const fi = flat.toLowerCase().indexOf(ql); const start = Math.max(0, fi - 40);
    const snip = (start ? '…' : '') + flat.slice(start, start + 150); const span = h('span'); const si = snip.toLowerCase().indexOf(ql);
    if (si >= 0) span.append(snip.slice(0, si), h('mark', { text: snip.slice(si, si + q.length) }), snip.slice(si + q.length)); else span.textContent = snip;
    res.append(h('button', { type: 'button', class: 'res', onclick: () => openJournal(j.id, p.n) }, h('b', { text: j.title + ' · page ' + p.n + (p.date ? ' · ' + shortDate(p.date) : '') }), span));
  });
}
function dayInfo() {
  const m = new Map();
  writtenPages().forEach(p => { if (!p.date) return; const o = m.get(p.date) || { pages: [], words: 0, moods: [] }; o.pages.push(p); o.words += countWords(p.text); if (p.mood) o.moods.push(p.mood); m.set(p.date, o); });
  return m;
}
function tabCalendar(body) {
  const info = dayInfo(); const y = LB.calY, mo = LB.calM;
  body.append(h('div', { class: 'cal-head' }, h('h3', { text: MONTHS[mo] + ' ' + y }),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn sm', 'aria-label': 'Previous month', onclick: () => { LB.calM--; if (LB.calM < 0) { LB.calM = 11; LB.calY--; } renderDrawer(); } }, '‹'),
      h('button', { type: 'button', class: 'btn sm', onclick: () => { const t = new Date(); LB.calY = t.getFullYear(); LB.calM = t.getMonth(); LB.calSel = todayId(); renderDrawer(); } }, 'Today'),
      h('button', { type: 'button', class: 'btn sm', 'aria-label': 'Next month', onclick: () => { LB.calM++; if (LB.calM > 11) { LB.calM = 0; LB.calY++; } renderDrawer(); } }, '›'))));
  const wrap = h('div');
  wrap.append(h('div', { class: 'cal-dow' }, ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => h('span', { text: d }))));
  const grid = h('div', { class: 'cal-grid' }); const off = (new Date(y, mo, 1).getDay() + 6) % 7; const dim = new Date(y, mo + 1, 0).getDate();
  for (let i = 0; i < off; i++) grid.append(h('span'));
  let count = 0;
  for (let d = 1; d <= dim; d++) {
    const id = y + '-' + pad(mo + 1) + '-' + pad(d); const o = info.get(id); if (o) count++;
    const avg = o && o.moods.length ? Math.round(o.moods.reduce((a, b) => a + b, 0) / o.moods.length) : 0;
    const b = h('button', { type: 'button', class: 'cal-day' + (o ? ' has' : '') + (id === todayId() ? ' today' : '') + (id === LB.calSel ? ' sel' : ''), 'aria-label': d + ' ' + MONTHS[mo] + (o ? ', ' + plural(o.pages.length, 'page') : ''), onclick: () => { LB.calSel = id; renderDrawer(); } }, h('span', { text: String(d) }), h('i'));
    if (avg) b.style.setProperty('--mc', MOOD_C[avg - 1]);
    grid.append(b);
  }
  wrap.append(grid); body.append(wrap);
  body.append(h('p', { class: 'note', text: plural(count, 'day') + ' written in ' + MONTHS[mo] + '. Dot colours show your mood.' }));
  if (LB.calSel) {
    const o = info.get(LB.calSel);
    const card = h('div', { class: 'card' }, h('h3', { text: longDate(LB.calSel) }));
    if (!o) card.append(h('p', { class: 'note', text: 'Nothing written on this day.' }));
    else o.pages.forEach(p => { const j = jById(p.j); card.append(h('button', { type: 'button', class: 'res', onclick: () => openJournal(p.j, p.n) }, h('b', { text: (j ? j.title : 'Journal') + ' · page ' + p.n + (p.mood ? ' · ' + MOODS[p.mood - 1] : '') }), h('span', { text: (p.text || '').replace(/\s+/g, ' ').slice(0, 140) || 'Photos and drawings' }))); });
    body.append(card);
  }
}
function badgeWon(id) {
  const pages = writtenPages(); const words = totalWords(); const best = longestStreak();
  switch (id) {
    case 'first': return pages.length >= 1; case 's3': return best >= 3; case 's7': return best >= 7; case 's30': return best >= 30;
    case 'w1k': return words >= 1000; case 'w10k': return words >= 10000; case 'p25': return pages.length >= 25;
    case 'cover': return state.lib.journals.some(j => j.art && j.art.layers.length);
    case 'photo': return pages.some(p => (p.items || []).some(i => i.t === 'photo'));
    case 'owl': return pages.some(p => p.updatedAt && new Date(p.updatedAt).getHours() >= 23);
    case 'bird': return pages.some(p => p.updatedAt && new Date(p.updatedAt).getHours() < 7 && new Date(p.updatedAt).getHours() >= 4);
    case 'shelf': return state.lib.journals.length >= 6;
  }
  return false;
}
function tabInsights(body) {
  const info = dayInfo(); const pages = writtenPages(); const words = totalWords();
  body.append(h('div', { class: 'stats' }, [[currentStreak(), 'day streak'], [longestStreak(), 'longest'], [info.size, 'days written'], [pages.length ? Math.round(words / pages.length) : 0, 'words/page']].map(([v, l]) => h('div', { class: 'stat' }, h('b', { text: v.toLocaleString() }), h('span', { text: l })))));
  // heatmap: last 18 weeks
  const heat = h('div', { class: 'heat', role: 'img', 'aria-label': 'Writing over the last 18 weeks' });
  const end = new Date(); const start = new Date(end); start.setDate(end.getDate() - (17 * 7 + ((end.getDay() + 6) % 7)));
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const o = info.get(toId(d)); const w = o ? o.words : 0;
    const lvl = !o ? 0 : w < 50 ? 1 : w < 150 ? 2 : w < 300 ? 3 : 4;
    heat.append(h('i', { class: 'l' + lvl, title: shortDate(toId(d)) + ': ' + plural(w, 'word') }));
  }
  body.append(h('div', { class: 'card' }, h('h3', { text: 'Your writing' }), heat, h('p', { class: 'note', text: 'Each square is a day. Darker means more words.' })));
  // mood chart: last 30 days
  const W = 300, H = 110, pts = [];
  for (let i = 29; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const o = info.get(toId(d)); if (o && o.moods.length) pts.push([29 - i, o.moods.reduce((a, b) => a + b, 0) / o.moods.length]); }
  const X = i => 30 + i / 29 * (W - 40), Y = m => 10 + (5 - m) / 4 * (H - 30);
  let svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Mood over the last 30 days">';
  [1, 3, 5].forEach(m => { svg += '<line class="gl" x1="30" x2="' + (W - 10) + '" y1="' + Y(m) + '" y2="' + Y(m) + '"/><text x="0" y="' + (Y(m) + 3) + '">' + MOODS[m - 1] + '</text>'; });
  svg += '<text x="30" y="' + (H - 2) + '">30 days ago</text><text x="' + (W - 10) + '" y="' + (H - 2) + '" text-anchor="end">Today</text>';
  if (pts.length > 1) svg += '<polyline class="ln" points="' + pts.map(p => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join(' ') + '"/>';
  pts.forEach(p => { svg += '<circle cx="' + X(p[0]).toFixed(1) + '" cy="' + Y(p[1]).toFixed(1) + '" r="4" fill="' + MOOD_C[Math.round(p[1]) - 1] + '"/>'; });
  svg += '</svg>';
  body.append(h('div', { class: 'card' }, h('h3', { text: 'Mood, last 30 days' }), h('div', { html: svg }), pts.length ? null : h('p', { class: 'note', text: 'Tap the mood dots at the top of a page to see your mood here.' })));
  // weekday bars
  const wd = [0, 0, 0, 0, 0, 0, 0]; info.forEach((o, id) => { wd[(fromId(id).getDay() + 6) % 7]++; }); const mx = Math.max(1, ...wd);
  body.append(h('div', { class: 'card' }, h('h3', { text: 'When you write' }), h('div', { class: 'bars' }, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => h('div', null, h('b', { style: 'height:' + Math.round(wd[i] / mx * 70) + 'px;animation-delay:' + (i * .05) + 's', title: plural(wd[i], 'day') }), d)))));
  const tags = topTags(12);
  if (tags.length) body.append(h('div', { class: 'card' }, h('h3', { text: 'Your tags' }), h('div', { class: 'tags' }, tags.map(([t, c]) => h('button', { type: 'button', class: 'chip', onclick: () => { LB.tab = 'journals'; LB.q = t; renderDrawer(); } }, t + ' · ' + c)))));
  body.append(h('div', { class: 'card' }, h('h3', { text: 'Badges' }), h('div', { class: 'badges' }, BADGES.map(b => h('div', { class: 'badge' + (badgeWon(b.id) ? ' won' : '') }, h('span', { text: b.icon }), b.name, h('small', { text: b.note }))))));
}
function tabSettings(body) {
  const st = S();
  body.append(h('div', { class: 'card' }, h('h3', { text: 'Daily word goal' }), h('p', { class: 'note', text: 'A small goal makes it easy to write every day. Even a few lines keep your streak.' }),
    chipRow(h('div', { class: 'chips' }), { 0: 'No goal', 50: '50', 150: '150', 250: '250', 500: '500', 750: '750' }, String(st.goal || 0), v => { st.goal = +v; saveLib(); renderDrawer(); updateHudSub(); updateGoal(); })));
  body.append(h('div', null,
    settingToggle('Animated pen and ink', 'The pen follows your words and ink flows in', 'animate', () => { if (RD.open) renderReader(); }),
    settingToggle('Pen sounds', 'Soft scratches as you write; clacks for the typewriter', 'penSound')));
  const sky = h('div', { class: 'card' },
    h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;' },
      h('h3', { text: 'The room' }),
      h('button', { type: 'button', class: 'btn', onclick: () => { closeDrawer(); openRoomCustom('walls'); } }, 'Customize 3D room')
    ),
    chipRow(h('div', { class: 'chips' }), { auto: 'Follow my clock', day: 'Always day', night: 'Always night' }, st.sky, v => { setSkyMode(v); renderDrawer(); }));
  const sw = (map, cur, on) => h('div', { class: 'swatches' }, Object.keys(map).map(k => h('button', { type: 'button', class: 'sw', title: map[k][0], 'aria-label': map[k][0], 'aria-pressed': k === cur ? 'true' : 'false', style: 'background:' + map[k][1], onclick: () => on(k) })));
  const roomSet = (k, v) => { st[k] = v; saveLib(); applyRoomStyle(); renderDrawer(); };
  sky.append(
    h('p', { class: 'eyebrow', text: 'Wall colour' }), sw(WALLS, st.wall, v => roomSet('wall', v)),
    h('p', { class: 'eyebrow', text: 'Desk, shelf and floor' }), chipRow(h('div', { class: 'chips' }), Object.fromEntries(Object.keys(WOODS).map(k => [k, WOODS[k][0]])), st.wood, v => roomSet('wood', v)),
    h('p', { class: 'eyebrow', text: 'Lamp light' }), chipRow(h('div', { class: 'chips' }), Object.fromEntries(Object.keys(LAMPS).map(k => [k, LAMPS[k][0]])), st.lampTone, v => roomSet('lampTone', v)),
    h('p', { class: 'eyebrow', text: 'Curtain fabric' }), chipRow(h('div', { class: 'chips' }), Object.fromEntries(Object.keys(CURTAIN_COLORS).map(k => [k, CURTAIN_COLORS[k][0]])), st.curtainColor || 'ochre', v => roomSet('curtainColor', v))
  );
  body.append(sky);
  body.append(h('div', { class: 'card' }, h('h3', { text: 'Page turning' }), h('p', { class: 'note', text: 'Swipe a page with your finger, drag a page corner with the mouse, or use the arrow keys.' }),
    chipRow(h('div', { class: 'chips' }), { slow: 'Slow and gentle', normal: 'Natural', fast: 'Quick' }, st.turnSpeed, v => { st.turnSpeed = v; saveLib(); renderDrawer(); }),
    settingToggle('Paper curl', 'Pages bend as they turn, like real paper', 'curl')));
  const lock = h('div', { class: 'card' }, h('h3', { text: 'PIN lock' }));
  if (LB.pinStep) {
    const a = h('input', { class: 'inp', type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: '6', placeholder: '4 to 6 digits', 'aria-label': 'New PIN', id: 'pinA' });
    const b = h('input', { class: 'inp', type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: '6', placeholder: 'Type it again', 'aria-label': 'Confirm PIN', id: 'pinB' });
    const hint = h('input', { class: 'inp', maxlength: '60', placeholder: 'Hint (optional), shown if you forget', 'aria-label': 'PIN hint', id: 'pinH' });
    const msg = h('p', { class: 'note' });
    lock.append(a, b, hint, msg, h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn solid', onclick: async () => {
        if (!/^\d{4,6}$/.test(a.value)) { msg.textContent = 'Use 4 to 6 digits.'; return; }
        if (a.value !== b.value) { msg.textContent = 'The two PINs do not match.'; return; }
        st.pinHash = await hashPin(a.value); st.pinHint = hint.value.trim(); saveLib(); LB.pinStep = null; applySettings(); renderDrawer(); toast('PIN lock is on.');
      } }, 'Turn on lock'), h('button', { type: 'button', class: 'btn', onclick: () => { LB.pinStep = null; renderDrawer(); } }, 'Cancel')));
  } else if (st.pinHash) {
    lock.append(h('p', { class: 'note', text: 'Daybook asks for your PIN when it opens and after 3 minutes away.' }),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: () => { closeDrawer(); showLock(); } }, 'Lock now'),
        h('button', { type: 'button', class: 'btn danger', onclick: () => { st.pinHash = null; st.pinHint = ''; saveLib(); applySettings(); renderDrawer(); toast('PIN lock is off.'); } }, 'Turn off lock')));
  } else lock.append(h('p', { class: 'note', text: 'Keep people who use this device from reading your journals.' }), h('button', { type: 'button', class: 'btn', onclick: () => { LB.pinStep = 'new'; renderDrawer(); } }, 'Set a PIN'));
  body.append(lock);
  body.append(h('div', { class: 'card' }, h('h3', { text: 'Your words' }), h('p', { class: 'note', text: 'Save every journal as one text file you can keep anywhere.' }),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: exportAll }, 'Save a copy of everything'), h('button', { type: 'button', class: 'btn', onclick: () => { closeDrawer(); showWelcome(true); } }, 'Show the welcome tips'))));
  body.append(backupCard());
}
// Full backup: everything in one file, and restoring one. Choosing a file only checks it and shows what it holds;
// nothing changes until the visitor confirms the replacement.
function backupCard() {
  const card = h('div', { class: 'card', id: 'bkCard' }, h('h3', { text: 'Full backup' }),
    h('p', { class: 'note', text: 'One file with every journal, page, photo, sticker, drawing, room preset and setting. Your PIN stays on this device. Keep it somewhere safe to bring Daybook back later or on another browser.' }));
  const pick = h('input', { type: 'file', accept: '.json,application/json', hidden: true, 'aria-label': 'Choose a Daybook backup file', onchange: e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; pickBackup(f); } });
  card.append(pick, h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: exportBackup }, 'Export full backup'), h('button', { type: 'button', class: 'btn', onclick: () => pick.click() }, 'Restore from a backup…')));
  if (LB.restoreErr) card.append(h('p', { class: 'note bk-msg', role: 'alert', text: LB.restoreErr }));
  const r = LB.restore;
  if (r) {
    const now = {}; for (const [k, v] of state.pages) now[k] = v;
    const when = r.info.created ? ' made ' + r.info.created.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
    const box = h('div', { class: 'confirm', role: 'group', 'aria-label': 'Restore preview' },
      h('p', null, h('b', { text: 'Restore “' + r.name + '”?' })),
      h('p', { text: 'This backup' + when + ' holds ' + r.info.summary + '.' }),
      h('p', { text: 'Restoring replaces everything Daybook holds on this device now (' + libSummary(state.lib.journals.length, now, photoIds(state.lib, now).size) + '). A copy of what is here now goes to your downloads first.' }));
    if (r.info.missing) box.append(h('p', { class: 'note', text: plural(r.info.missing, 'photo') + ' the journals use ' + (r.info.missing > 1 ? 'are' : 'is') + ' not in this backup and will show as empty frames.' }));
    if (r.info.skipped) box.append(h('p', { class: 'note', text: plural(r.info.skipped, 'page') + ' in this backup belong' + (r.info.skipped > 1 ? '' : 's') + ' to no journal in it and will be left out.' }));
    box.append(h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn danger solid', onclick: async e => { e.currentTarget.disabled = true; try { await restoreBackup(r); } catch (err) { LB.restore = null; LB.restoreErr = err && err.friendly ? err.message : 'Could not restore this backup. Nothing was changed.'; renderDrawer(); scrollBackup(); } } }, 'Replace everything with this backup'),
      h('button', { type: 'button', class: 'btn', onclick: () => { LB.restore = null; LB.restoreErr = null; renderDrawer(); scrollBackup(); } }, 'Cancel')));
    card.append(box);
  }
  return card;
}
function scrollBackup() { const c = $('#bkCard'); if (c) c.scrollIntoView({ block: 'nearest' }); }
async function pickBackup(file) {
  if (!file) return;   // the picker was cancelled
  LB.restore = null; LB.restoreErr = null;
  try {
    if (file.size > BACKUP.maxBytes) throw backupError('This file is too large to be a Daybook backup (over 25 MB).');
    let text; try { text = await file.text(); } catch (e) { throw backupError('Could not read that file.'); }
    LB.restore = Object.assign(checkBackup(text), { name: file.name });
  } catch (e) { LB.restoreErr = e && e.friendly ? e.message : 'This file could not be read as a Daybook backup.'; }
  LB.tab = 'settings'; renderDrawer(); scrollBackup();
}

/* =====================================================================
   PIN lock, welcome, memories
   ===================================================================== */
async function hashPin(pin) {
  try { const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('daybook:' + pin)); return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''); }
  catch (e) { return 'p' + hashStr('daybook:' + pin).toString(16); }
}
const LK = { entry: '', wrong: 0, hiddenAt: 0 };
const isLocked = () => !$('#lock').hidden;
function showLock() {
  if (!S().pinHash) return;
  if (RD.open) closeReader(); closeDrawer(); closeSoundPop();
  LK.entry = ''; $('#lock').hidden = false; $('#lkMsg').textContent = 'Enter your PIN'; $('#lkForgot').hidden = LK.wrong < 3; renderDots();
}
function renderDots() { const d = $('#lkDots'); d.textContent = ''; for (let i = 0; i < 6; i++) if (i < Math.max(4, LK.entry.length)) d.append(h('i', { class: i < LK.entry.length ? 'on' : '' })); }
async function lockKey(k) {
  if (k === 'del') LK.entry = LK.entry.slice(0, -1);
  else if (LK.entry.length < 6) LK.entry += k;
  renderDots(); sfx('click');
  if (LK.entry.length >= 4) {
    const hsh = await hashPin(LK.entry);
    if (hsh === S().pinHash) { $('#lock').hidden = true; LK.wrong = 0; LK.entry = ''; toast('Welcome back.'); return; }
    if (LK.entry.length === 6) wrongPin();
  }
}
function wrongPin() {
  LK.wrong++; LK.entry = ''; const d = $('#lkDots'); d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake'); renderDots();
  $('#lkMsg').textContent = LK.wrong >= 3 && S().pinHint ? 'Hint: ' + S().pinHint : 'That PIN is not right. Try again.';
  $('#lkForgot').hidden = LK.wrong < 3;
}
function buildLock() {
  const keys = $('#lkKeys');
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'ok', '0', 'del'].forEach(k => keys.append(h('button', { type: 'button', 'aria-label': k === 'del' ? 'Delete' : k === 'ok' ? 'Enter' : k, onclick: async () => { if (k === 'ok') { if (LK.entry.length >= 4) { const hsh = await hashPin(LK.entry); if (hsh === S().pinHash) { $('#lock').hidden = true; LK.wrong = 0; LK.entry = ''; } else wrongPin(); } } else lockKey(k); } }, k === 'del' ? '⌫' : k === 'ok' ? '✓' : k)));
  document.addEventListener('keydown', e => { if (!isLocked()) return; if (/^\d$/.test(e.key)) lockKey(e.key); else if (e.key === 'Backspace') lockKey('del'); else if (e.key === 'Enter') keys.lastChild.previousSibling.previousSibling.click(); });
  $('#lkForgot').addEventListener('click', () => {
    let n = 30; $('#lkForgot').hidden = true;
    const t = setInterval(() => { n--; $('#lkMsg').textContent = 'Removing the lock in ' + n + ' seconds. Your journals stay safe.'; if (n <= 0) { clearInterval(t); state.lib.settings.pinHash = null; saveLib(); applySettings(); $('#lock').hidden = true; toast('The PIN lock was removed. You can set a new one in Settings.'); } }, 1000);
  });
}
function showWelcome(force) {
  // a visitor who has already opened something does not need it popping up over that
  if (!force && (S().welcomed || RD.open || opening() || (R3 && (isOverlayActive() || R3.cam.mode !== 'room')))) return;
  $('#welcome .note').textContent = state.store && state.store.kind === 'cloud' ? 'Only you can read your journals. They are saved to your account as you write.' : 'Your journals stay in this browser on this device, and save as you write.';
  $('#welcome').hidden = false;
}
function hideWelcome() { $('#welcome').hidden = true; if (!S().welcomed) { state.lib.settings.welcomed = true; saveLib(); } }
function showMemory() {
  const m = memories(); const box = $('#memory'); if (!m.length || isLocked()) return;
  const x = m[m.length - 1]; const j = jById(x.p.j);
  box.textContent = '';
  box.append(h('p', { class: 'eyebrow', text: 'On this day · ' + x.label }), h('q', { text: x.p.text.replace(/\s+/g, ' ').slice(0, 120) + (x.p.text.length > 120 ? '…' : '') }),
    h('div', null, h('button', { type: 'button', class: 'btn sm accent', onclick: () => openJournal(x.p.j, x.p.n) }, 'Open ' + (j ? j.title : 'it')), h('button', { type: 'button', class: 'btn sm', onclick: hideMemory }, 'Later')));
  box.hidden = false;
}
function hideMemory() { $('#memory').hidden = true; }

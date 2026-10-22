/* =====================================================================
   Reader: pages, ink that writes itself, the pen at your caret
   ===================================================================== */
const RD = { open: false, closing: false, jid: null, n: 1, focus: 0, pop: null, confirmDelete: false, drawing: false, sel: null, brush: { k: 'pen', c: null, w: 4 }, undo: [] };
const pageEls = [];
const spreadMode = () => window.innerWidth >= 900 && window.innerWidth / window.innerHeight > 1.05;
const curJ = () => jById(RD.jid);
const animOn = () => S().animate !== false && !reduceMotion();

function buildPageEl(side, idx) {
  const date = h('label', { class: 'p-date' }, h('span', { class: 'p-date-t' }), h('input', { type: 'date', 'aria-label': 'Date of this page', id: 'pDate' + side }));
  const mood = h('div', { class: 'p-mood', role: 'group', 'aria-label': 'Mood' },
    MOODS.map((m, i) => h('button', { type: 'button', 'data-m': String(i + 1), title: m, 'aria-label': 'Mood: ' + m, 'aria-pressed': 'false' })), h('span', { class: 'p-mood-t' }));
  const ta = h('textarea', { class: 'p-body', id: 'pText' + side, 'aria-label': 'Page text', spellcheck: 'true' });
  const ink = h('div', { class: 'p-ink', 'aria-hidden': 'true' });
  const pen = h('div', { class: 'pen', 'aria-hidden': 'true' }, h('div', { class: 'pen-in' }));
  const hl = h('canvas', { class: 'p-hl', 'aria-hidden': 'true' });
  const dr = h('canvas', { class: 'p-draw', 'aria-label': 'Drawing layer' });
  const items = h('div', { class: 'p-items' });
  const el = h('div', { class: 'page', 'data-side': side },
    hl, h('div', { class: 'p-tab', hidden: true }), h('div', { class: 'p-head' }, date, mood),
    h('div', { class: 'p-write' }, ta, ink, pen), h('div', { class: 'p-foot' }, h('span', { class: 'p-words' }), h('span', { class: 'p-num' })),
    dr, items, h('button', { type: 'button', class: 'p-add' }, '+ Turn to a new page'),
    h('button', { type: 'button', class: 'corner c-next', 'data-dir': '1', 'aria-label': 'Turn to the next page', title: 'Drag or click to turn' }),
    h('button', { type: 'button', class: 'corner c-prev', 'data-dir': '-1', 'aria-label': 'Turn to the previous page', title: 'Drag or click to turn back' }));
  Object.assign(el, { _ta: ta, _ink: ink, _pen: pen, _hl: hl, _dr: dr, _items: items, _fresh: [], _prev: '', _idx: idx });
  ta.addEventListener('focus', () => { RD.focus = idx; placePen(el); if (RD.pop && RD.pop !== 'more' && RD.pop !== 'decor') renderPop(); });
  ta.addEventListener('blur', () => { el._pen.classList.remove('on', 'writing'); const k = pageKey(RD.jid, +el.dataset.n); if (pageTimers.has(k)) flushPage(k); });
  ta.addEventListener('input', () => onType(el));
  ta.addEventListener('scroll', () => { ink.scrollTop = ta.scrollTop; placePen(el); });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter') sfx('enter', el.dataset.pen); });
  $('input', date).addEventListener('change', e => { const n = +el.dataset.n; const p = editPage(n); if (e.target.value) p.date = e.target.value; savePage(pageKey(RD.jid, n)); renderPageEl(el, curJ(), n); });
  mood.addEventListener('click', e => {
    const b = e.target.closest('button[data-m]'); if (!b) return; RD.focus = idx;
    const n = +el.dataset.n; const p = editPage(n); const v = +b.dataset.m; p.mood = p.mood === v ? 0 : v;
    savePage(pageKey(RD.jid, n)); renderPageEl(el, curJ(), n); sfx('click');
  });
  $('.p-add', el).addEventListener('click', () => turn(1));
  el.addEventListener('pointerdown', e => { if (!e.target.closest('.it') && !e.target.closest('.it-bar') && RD.sel) { RD.sel = null; renderItemsAll(); } });
  bindDraw(el);
  return el;
}
function editPage(n) {
  const k = pageKey(RD.jid, n); let p = state.pages.get(k);
  if (!p) { p = { j: RD.jid, n, text: '', date: todayId(), mood: 0 }; state.pages.set(k, p); }
  p.updatedAt = Date.now(); return p;
}

/* ---- ink overlay ---- */
function trackInsert(el, next, stagger) {
  const prev = el._prev; const now = performance.now();
  let a = 0; while (a < prev.length && a < next.length && prev[a] === next[a]) a++;
  let b = 0; while (b < prev.length - a && b < next.length - a && prev[prev.length - 1 - b] === next[next.length - 1 - b]) b++;
  const removed = prev.length - a - b, inserted = next.length - a - b;
  el._fresh = el._fresh.filter(f => f.i < a || f.i >= a + removed).map(f => f.i >= a + removed ? { i: f.i + inserted - removed, t: f.t } : f);
  if (animOn() && inserted > 0 && inserted <= 600) {
    const step = inserted > 1 ? (stagger || 16) : 0;
    for (let k = 0; k < inserted; k++) el._fresh.push({ i: a + k, t: now + k * step });
  }
  el._prev = next;
  return inserted;
}
// where each visible character starts: an emoji is two code units (or several joined ones) and must never be split
// across ink spans, or it shows as broken halves
const graphemes = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter() : null;
function charStarts(text) {
  if (graphemes) return Array.from(graphemes.segment(text), s => s.index);
  const s = []; for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); if (c < 0xDC00 || c > 0xDFFF) s.push(i); } return s;
}
function renderInk(el) {
  const ta = el._ta, ink = el._ink, text = ta.value, now = performance.now();
  el._fresh = el._fresh.filter(f => f.t > now - 700 && f.i < text.length);
  const caret = document.activeElement === ta ? ta.selectionEnd : -1;
  const starts = charStarts(text), end = new Map(starts.map((s, k) => [s, k + 1 < starts.length ? starts[k + 1] : text.length]));
  const startOf = i => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= i) lo = m; else hi = m - 1; } return starts[lo]; };
  const fm = new Map(); for (const f of el._fresh) { const s = startOf(f.i); if (!fm.has(s) || f.t < fm.get(s)) fm.set(s, f.t); }
  const idxs = Array.from(new Set(Array.from(fm.keys()).concat(caret >= 0 ? [caret] : []))).sort((x, y) => x - y);
  const frag = document.createDocumentFragment(); let pos = 0, mark = null; const spans = [];
  for (const i of idxs) {
    if (i < pos) continue;
    if (i > pos) frag.append(text.slice(pos, i));
    pos = i;
    if (i === caret) { mark = document.createElement('span'); mark.textContent = '⁠'; frag.append(mark); }
    if (fm.has(i)) { const s = document.createElement('span'); s.className = 'nw'; s.textContent = text.slice(i, end.get(i)); const t = fm.get(i); s.style.animationDelay = Math.round(t - now) + 'ms'; s._t = t; frag.append(s); spans.push(s); pos = end.get(i); }
  }
  if (pos < text.length) frag.append(text.slice(pos));
  frag.append('⁠');
  ink.replaceChildren(frag); ink.scrollTop = ta.scrollTop;
  el._spans = spans; el._mark = mark;
  if (spans.some(s => s._t > now)) followPen(el); else placePen(el);
}
function penShown(el) { return animOn() && el.dataset.pen !== 'typewriter' && !RD.drawing; }
function placePenAt(el, x, y) {
  const pen = el._pen; const H = el._ta.clientHeight;
  if (y < -4 || y > H + 6) { pen.classList.remove('on'); return; }
  pen.style.transform = 'translate(' + Math.round(x + 2) + 'px,' + Math.round(y) + 'px)';
  pen.classList.toggle('on', penShown(el));
}
function placePen(el) {
  const m = el._mark;
  if (!m || document.activeElement !== el._ta) { el._pen.classList.remove('on'); return; }
  placePenAt(el, m.offsetLeft, m.offsetTop + m.offsetHeight * .8 - el._ink.scrollTop);
}
function followPen(el) {
  if (el._follow) return;
  const step = () => {
    const now = performance.now(); let cur = null, pending = false;
    for (const s of el._spans || []) { if (s._t <= now) cur = s; else pending = true; }
    if (pending && el._spans && el._spans.length) {
      if (cur && cur.isConnected) {
        placePenAt(el, cur.offsetLeft + cur.offsetWidth, cur.offsetTop + cur.offsetHeight * .8 - el._ink.scrollTop);
        el._pen.classList.add('on', 'writing'); el._pen.classList.remove('lift');
        sfx('pen', el.dataset.pen);
      }
      el._follow = requestAnimationFrame(step);
    } else { el._follow = null; el._pen.classList.remove('writing'); placePen(el); }
  };
  el._follow = requestAnimationFrame(step);
}
function onType(el, stagger) {
  const ta = el._ta; const n = +el.dataset.n; const p = editPage(n);
  const ins = trackInsert(el, ta.value, stagger);
  p.text = ta.value; if (!p.date) p.date = todayId();
  renderInk(el);
  if (ins === 1) { sfx('pen', el.dataset.pen); }
  const pen = el._pen; pen.classList.add('writing'); pen.classList.remove('lift');
  clearTimeout(el._wt); el._wt = setTimeout(() => { if (!el._follow) pen.classList.remove('writing'); }, 260);
  clearTimeout(el._lt); el._lt = setTimeout(() => pen.classList.add('lift'), 1400);
  $('.p-words', el).textContent = plural(countWords(p.text), 'word');
  const dt = $('.p-date', el); if (dt.classList.contains('dim')) { dt.classList.remove('dim'); $('.p-date-t', el).textContent = dateLabel(p.date); }
  savePage(pageKey(RD.jid, n));
  clearTimeout(RD.goalT); RD.goalT = setTimeout(() => { updateGoal(); updateCount(); checkMilestones(); updateHudSub(); }, 400);
}
document.addEventListener('selectionchange', () => { const a = document.activeElement; if (a && a.classList && a.classList.contains('p-body')) { const el = a.closest('.page'); if (el && !el._follow) renderInk(el); } });
function insertText(str) {
  const el = pageEls[spreadMode() ? RD.focus : 0];
  if (!el || el.classList.contains('is-end')) { toast('Pick a page to write on first.'); return; }
  const ta = el._ta; ta.focus();
  const s = ta.selectionStart, e = ta.selectionEnd; const before = ta.value.slice(0, s);
  const pre = before && !before.endsWith('\n') ? '\n\n' : (before && !before.endsWith('\n\n') ? '\n' : '');
  ta.setRangeText(pre + str, s, e, 'end');
  onType(el, 22);
  ta.scrollTop = ta.scrollHeight;
}

/* ---- page style + render ---- */
function pageStyle(j, p) { const d = j.defaults, s = (p && p.style) || {}; return { paper: s.paper || d.paper, ruling: s.ruling || d.ruling, pen: s.pen || d.pen, ink: s.ink || d.ink, scale: s.scale || d.scale || 1 }; }
function applyPageStyle(el, st) {
  const P = PAPERS[st.paper] || PAPERS.cream, pen = PENS[st.pen] || PENS.fountain;
  el.style.setProperty('--paper', P.bg); el.style.setProperty('--rule', P.rule); el.style.setProperty('--ink-c', inkOf(st.ink).c);
  el.style.setProperty('--pen-font', pen.font); el.style.setProperty('--pen-size', (pen.size * st.scale).toFixed(1) + 'px');
  el.style.setProperty('--pen-weight', String(pen.weight)); el.style.setProperty('--lh', Math.round(32 * st.scale) + 'px');
  el.dataset.tex = P.tex; el.dataset.ruling = st.ruling;
  if (el.dataset.pen !== st.pen) { el.dataset.pen = st.pen; $('.pen-in', el).innerHTML = penSvg(st.pen); }
}
function dateLabel(id) { if (spreadMode()) return niceDate(id); const d = fromId(id); return DAYS[d.getDay()].slice(0, 3) + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3); }
function promptFor(j, n) { return PROMPTS[(hashStr(j.id) + n * 7 + new Date().getDate()) % PROMPTS.length]; }
function renderPageEl(el, j, n) {
  const changed = el.dataset.n !== String(n) || el.dataset.j !== j.id;
  el.dataset.n = String(n); el.dataset.j = j.id;
  const end = n > j.pages; el.classList.toggle('is-end', end);
  const p = state.pages.get(pageKey(j.id, n));
  applyPageStyle(el, pageStyle(j, p || (end ? state.pages.get(pageKey(j.id, j.pages)) : null)));
  if (end) { el._items.textContent = ''; clearCanvas(el._hl); clearCanvas(el._dr); return; }
  const ta = el._ta;
  if (document.activeElement !== ta || changed) { const v = p ? (p.text || '') : ''; if (ta.value !== v || changed) { ta.value = v; el._prev = v; el._fresh = []; if (changed) ta.scrollTop = 0; } }
  ta.placeholder = promptFor(j, n) + '\n\nStart writing…';
  renderInk(el);
  const dt = $('.p-date', el); const has = p && p.date;
  dt.classList.toggle('dim', !has); $('.p-date-t', dt).textContent = dateLabel(has ? p.date : todayId()); $('input', dt).value = has ? p.date : todayId();
  const mood = p ? p.mood || 0 : 0;
  $$('.p-mood button', el).forEach(b => b.setAttribute('aria-pressed', +b.dataset.m === mood ? 'true' : 'false'));
  $('.p-mood-t', el).textContent = mood ? MOODS[mood - 1] : '';
  $('.p-words', el).textContent = plural(countWords(p ? p.text : ''), 'word');
  $('.p-num', el).textContent = '— ' + n + ' —';
  const bm = j.bookmarks.find(b => b.n === n); const tab = $('.p-tab', el);
  tab.hidden = !bm; if (bm) { tab.style.setProperty('--tab', bm.color); tab.title = bm.label || 'Bookmark'; }
  renderItems(el, p);
  requestAnimationFrame(() => renderDoodles(el, p));
}
function renderReader(soft) {
  const j = curJ(); if (!j) { closeReader(); return; }
  const single = !spreadMode(); const rd = $('#reader'); rd.classList.toggle('single', single);
  if (RD.n > j.pages) RD.n = j.pages;
  if (RD.n < 1) RD.n = 1;
  if (!single && RD.n % 2 === 0) RD.n -= 1;
  const ns = single ? [RD.n] : [RD.n, RD.n + 1];
  pageEls.forEach((el, i) => { if (ns[i] != null) renderPageEl(el, j, ns[i]); });
  const book = $('#book'); book.style.backgroundColor = j.cover.color; book.style.backgroundImage = 'url(' + materialURL(j.cover.color, j.cover.material) + ')';
  book.style.setProperty('--ribbon', j.ribbon);
  $('#leaf').style.setProperty('--leaf', (PAPERS[pageStyle(j, null).paper] || PAPERS.cream).bg);
  $('#rJournal').textContent = j.title;
  updateCount();
  $('#rPrev').disabled = RD.n <= 1;
  const lastVisible = single ? RD.n : RD.n + 1;
  const nextLabel = lastVisible >= j.pages ? 'New page' : 'Next page';   // the label also names the button when phones hide the text
  $('#rNext').querySelector('span').textContent = nextLabel; $('#rNext').setAttribute('aria-label', nextLabel);
  updateGoal();
  if (!soft && RD.pop) renderPop();
  if (RD.drawing) renderDrawbar();
}
function updateCount() { const j = curJ(); if (!j) return; const single = !spreadMode(); $('#rCount').textContent = (single ? 'Page ' + RD.n : 'Pages ' + RD.n + '–' + Math.min(RD.n + 1, j.pages + 1)) + ' of ' + j.pages + ' · ' + plural(countWritten(j.id), 'page') + ' written'; }
function countWritten(jid) { let n = 0; for (const [k, p] of state.pages) if (k.indexOf(jid + '~') === 0 && (p.text || '').trim()) n++; return n; }
function updateGoal() {
  const g = S().goal, w = wordsToday(); const el = $('#goal'); if (!el) return;
  el.hidden = false;
  const pct = g ? Math.min(100, Math.round(w / g * 100)) : 100;
  $('#goalArc').setAttribute('stroke-dasharray', pct + ' 100');
  el.classList.toggle('done', !!g && w >= g);
  $('#goalTxt').textContent = g ? w.toLocaleString() + ' / ' + g + ' words' : plural(w, 'word') + ' today';
}
function showReader(id, n, pop) {
  const j = jById(id); if (!j) return;
  RD.jid = id; RD.n = n || j.last || 1; RD.focus = 0; RD.open = true; RD.pop = null; RD.confirmDelete = false; RD.sel = null; RD.undo = [];
  const rd = $('#reader'); rd.hidden = false; $('#pop').hidden = true;
  renderReader();
  const single = !spreadMode();
  if (!single && RD.n !== (n || j.last || 1) && n) RD.focus = 1;
  const want = n || RD.n; const fi = pageEls.findIndex(el => +el.dataset.n === want); if (fi >= 0) RD.focus = fi;
  const flap = $('#flap'), book = $('#book');
  if (animOn()) {
    $('.f-front', flap).style.backgroundImage = 'url(' + coverURL(j, 512) + ')';
    const back = $('.f-back', flap); back.style.backgroundColor = shade(j.cover.color, -.25); back.style.backgroundImage = 'url(' + materialURL(j.cover.color, j.cover.material) + ')';
    // reflow between the classes so the swing restarts even if a close left this animation reversed
    flap.hidden = false; flap.className = 'flap'; void flap.offsetWidth; flap.className = 'flap opening'; book.classList.add('opening');
    setTimeout(() => sfx('flip'), 250);
    clearTimeout(RD.flapT); RD.flapT = setTimeout(() => { flap.hidden = true; flap.className = 'flap'; book.classList.remove('opening'); }, 1100);
  }
  requestAnimationFrame(() => rd.classList.add('show'));
  document.body.classList.add('reading');   // hides the room header, which Safari otherwise shows through the reader's scrim
  if (R3) setTimeout(() => { if (RD.open) R3.paused = true; }, 450);
  $('#tip').hidden = true;
  setSaveState(state.store && state.store.kind === 'cloud' ? 'Saved to your account' : 'Saved in this browser');
  if (pop) openPop(pop);
  else if (!(R3 && R3.mobile)) setTimeout(() => { const el = pageEls[RD.focus]; if (RD.open && el && !el.classList.contains('is-end')) { el._ta.focus({ preventScroll: true }); const L = el._ta.value.length; el._ta.setSelectionRange(L, L); } }, animOn() ? 1000 : 200);
}
function closeReader() {
  if (!RD.open) return;
  flushAll();
  const j = curJ(); if (j && j.last !== RD.n) { j.last = RD.n; saveLib(); }
  RD.open = false; RD.closing = true; closePop(); if (RD.drawing) toggleDraw(false); RD.sel = null;
  clearTimeout(RD.flapT); // the opening's tidy-up would hide the cover partway through this close; finish() tidies up instead
  pageEls.forEach(el => { el._pen.classList.remove('on'); });
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  const rd = $('#reader'), flap = $('#flap');
  const finish = () => {
    RD.closing = false;
    if (!RD.open) { rd.classList.remove('show'); document.body.classList.remove('reading'); }
    setTimeout(() => { if (!RD.open) { rd.hidden = true; flap.hidden = true; flap.className = 'flap'; $('#book').classList.remove('opening'); } }, 400);
    if (R3) {
      R3.paused = false;
      R3.last = performance.now();
      // a quick reopen already owns the camera; otherwise go back to the view the visitor left
      if (!RD.open && !opening()) { const r = R3.cam.ret; R3.cam.ret = null; resetCameraToRoom(1.0, null, r && r.yaw, r && r.pitch); }
    }
  };
  if (animOn() && j) {
    $('.f-front', flap).style.backgroundImage = 'url(' + coverURL(j, 512) + ')';
    // a cover still opening falls back from where it is: the close animation starts fully open, so it would jump
    // across to the left page and sweep back over the open journal. (Not reverse(): a swing that has not started yet
    // rewinds to its end, the same jump. Not playbackRate =: the compositor runs this swing and would skip.)
    const swing = !flap.hidden && flap.classList.contains('opening') && flap.getAnimations()[0];
    if (swing) swing.updatePlaybackRate(-1); else { flap.hidden = false; flap.className = 'flap closing'; }
    sfx('flip'); setTimeout(finish, 650);
  }
  else finish();
  updateHudSub();
}
function focusEl() { return pageEls[spreadMode() ? RD.focus : 0]; }
function focusN() { const el = focusEl(); const n = +el.dataset.n; const j = curJ(); return Math.min(n || RD.n, j ? j.pages : 1); }

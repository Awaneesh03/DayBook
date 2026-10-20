/* =====================================================================
   Page decorations: photos, stickers, washi tape, notes
   ===================================================================== */
const SVGNS = 'http://www.w3.org/2000/svg';
function stickerSvg(ch) {
  const s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('viewBox', '0 0 100 100');
  const t = document.createElementNS(SVGNS, 'text'); t.setAttribute('x', '50'); t.setAttribute('y', '54'); t.setAttribute('font-size', '82');
  t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'middle'); t.textContent = ch; s.append(t); return s;
}
function renderItemsAll() { pageEls.forEach(el => { if (!el.classList.contains('is-end') && el.dataset.j) renderItems(el, state.pages.get(pageKey(el.dataset.j, +el.dataset.n))); }); }
function renderItems(el, p) {
  const box = el._items; box.textContent = '';
  const items = (p && p.items) || []; const n = +el.dataset.n;
  items.forEach(it => {
    const d = h('div', { class: 'it it-' + it.t + (RD.sel && RD.sel.n === n && RD.sel.id === it.id ? ' sel' : '') + (it._new ? ' pop-in' : ''), 'data-id': it.id, 'data-frame': it.frame || null });
    delete it._new;
    d.style.left = (it.x * 100) + '%'; d.style.top = (it.y * 100) + '%'; d.style.width = (it.w * 100) + '%'; d.style.setProperty('--r', (it.rot || 0) + 'deg');
    if (it.t === 'photo') { const u = mediaURL(it.mid); d.append(u ? h('img', { src: u, alt: 'Photo' }) : h('div', { class: 'ph-wait' })); if (it.tape) d.append(h('i', { class: 'tp' })); }
    else if (it.t === 'sticker') d.append(stickerSvg(it.s));
    else if (it.t === 'tape') d.style.background = tapeBg(it);
    else if (it.t === 'note') { d.textContent = it.text || ''; d.style.fontSize = 'calc(var(--pen-size) * .8)'; d.style.background = it.c || '#F7E27A'; }
    d.append(h('span', { class: 'rz', 'aria-hidden': 'true' }));
    bindItem(d, el, it);
    box.append(d);
  });
  if (RD.sel && RD.sel.n === n) { const it = items.find(i => i.id === RD.sel.id); if (it) box.append(itemBar(el, it)); }
}
function bindItem(d, el, it) {
  d.addEventListener('pointerdown', e => {
    if (RD.drawing) return;
    e.preventDefault(); e.stopPropagation();
    const n = +el.dataset.n; const wasSel = RD.sel && RD.sel.id === it.id;
    RD.sel = { n, id: it.id };
    const rect = el.getBoundingClientRect(); const resize = e.target.classList.contains('rz');
    const st = { x: e.clientX, y: e.clientY, ix: it.x, iy: it.y, iw: it.w, moved: false };
    const cx = rect.left + it.x * rect.width, cy = rect.top + it.y * rect.height; const d0 = Math.hypot(e.clientX - cx, e.clientY - cy) || 1;
    if (!wasSel) renderItems(el, state.pages.get(pageKey(RD.jid, n)));
    const node = el._items.querySelector('[data-id="' + it.id + '"]') || d; node.classList.add('drag');
    const bar = el._items.querySelector('.it-bar'); if (bar) bar.style.visibility = 'hidden';
    const move = ev => {
      if (Math.hypot(ev.clientX - st.x, ev.clientY - st.y) > 3) st.moved = true;
      if (resize) { it.w = clamp(st.iw * Math.hypot(ev.clientX - cx, ev.clientY - cy) / d0, .06, 1.1); node.style.width = (it.w * 100) + '%'; }
      else { it.x = clamp(st.ix + (ev.clientX - st.x) / rect.width, 0, 1); it.y = clamp(st.iy + (ev.clientY - st.y) / rect.height, 0, 1); node.style.left = (it.x * 100) + '%'; node.style.top = (it.y * 100) + '%'; }
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (st.moved) { editPage(n); savePage(pageKey(RD.jid, n)); }
      else if (it.t === 'note' && wasSel) { editNote(el, it); }
      renderItems(el, state.pages.get(pageKey(RD.jid, n)));
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  });
}
const IB = {
  rl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  rr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>'
};
function itemBar(el, it) {
  const n = +el.dataset.n;
  const act = fn => e => { e.stopPropagation(); const p = editPage(n); fn(p); savePage(pageKey(RD.jid, n)); renderItems(el, p); };
  const bar = h('div', { class: 'it-bar', role: 'toolbar', 'aria-label': 'Decoration tools' },
    h('button', { type: 'button', title: 'Rotate left', 'aria-label': 'Rotate left', html: IB.rl, onclick: act(() => { it.rot = (it.rot || 0) - 8; }) }),
    h('button', { type: 'button', title: 'Rotate right', 'aria-label': 'Rotate right', html: IB.rr, onclick: act(() => { it.rot = (it.rot || 0) + 8; }) }),
    h('button', { type: 'button', title: 'Smaller', 'aria-label': 'Smaller', onclick: act(() => { it.w = Math.max(.06, it.w * .85); }) }, '−'),
    h('button', { type: 'button', title: 'Bigger', 'aria-label': 'Bigger', onclick: act(() => { it.w = Math.min(1.1, it.w * 1.15); }) }, '+'),
    it.t === 'photo' ? h('button', { type: 'button', title: 'Frame style', 'aria-label': 'Change frame', onclick: act(() => { const order = ['polaroid', 'plain', 'round']; it.frame = order[(order.indexOf(it.frame || 'polaroid') + 1) % 3]; it.tape = it.frame === 'polaroid' ? !it.tape : false; }) }, '▢') : null,
    it.t === 'note' ? h('button', { type: 'button', title: 'Edit note', 'aria-label': 'Edit note', onclick: e => { e.stopPropagation(); editNote(el, it); } }, '✎') : null,
    h('button', { type: 'button', title: 'Bring to front', 'aria-label': 'Bring to front', html: IB.up, onclick: act(p => { p.items = p.items.filter(x => x !== it).concat([it]); }) }),
    h('button', { type: 'button', title: 'Remove', 'aria-label': 'Remove', html: IB.del, onclick: act(p => { p.items = p.items.filter(x => x !== it); RD.sel = null; if (it.mid) releaseMedia([it.mid]); }) }));
  bar.style.left = (it.x * 100) + '%'; bar.style.top = 'calc(' + (it.y * 100) + '% - 18px)';
  const pageH = el.clientHeight; if (it.y * pageH < 90) bar.style.top = 'calc(' + (it.y * 100) + '% + 70px)';
  bar.addEventListener('pointerdown', e => e.stopPropagation());
  return bar;
}
function editNote(el, it) {
  const n = +el.dataset.n;
  const pop = $('#pop'); RD.pop = 'note'; pop.hidden = false; pop.textContent = '';
  const ta = h('textarea', { class: 'inp', rows: '4', id: 'noteText', 'aria-label': 'Note text', maxlength: '160' }); ta.value = it.text || '';
  pop.append(h('div', { class: 'pop-head' }, h('h3', { text: 'Sticky note' }), h('button', { type: 'button', class: 'x', 'aria-label': 'Close', onclick: closePop }, '×')), ta,
    h('div', { class: 'swatches' }, ['#F7E27A', '#F8B4C8', '#B8E2C8', '#B9D7F5', '#F9C98F'].map(c => h('button', { type: 'button', class: 'sw', style: 'background:' + c, 'aria-label': 'Note colour', 'aria-pressed': (it.c || '#F7E27A') === c ? 'true' : 'false', onclick: () => { it.c = c; editPage(n); savePage(pageKey(RD.jid, n)); renderItems(el, state.pages.get(pageKey(RD.jid, n))); editNote(el, it); } }))),
    h('button', { type: 'button', class: 'btn solid', onclick: closePop }, 'Done'));
  ta.addEventListener('input', () => { it.text = ta.value; editPage(n); savePage(pageKey(RD.jid, n)); renderItems(el, state.pages.get(pageKey(RD.jid, n))); });
  setTimeout(() => ta.focus(), 50);
}
function addItem(item) {
  const el = focusEl(); if (!el || el.classList.contains('is-end')) { toast('Open a page first.'); return; }
  const n = +el.dataset.n; const p = editPage(n);
  p.items = p.items || [];
  if (p.items.length >= 40) { toast('This page already has a lot of decorations.'); return; }
  const it = Object.assign({ id: newId('i'), x: .5 + (Math.random() - .5) * .2, y: .45 + (Math.random() - .5) * .2, rot: Math.round((Math.random() - .5) * 14) }, item);
  p.items.push(it); it._new = true; RD.sel = { n, id: it.id };
  savePage(pageKey(RD.jid, n)); renderItems(el, p); sfx('pop');
  if (window.innerWidth < 680) closePop();
}
async function addPhotoFromFile(file) {
  if (!file) return;
  toast('Adding your photo…');
  try { const r = await mediaPut(file, 1100); addItem({ t: 'photo', mid: r.mid, w: .55, frame: 'polaroid', tape: true }); }
  catch (e) { toast(e && e.message ? e.message : 'Could not add that photo.'); }
}

/* =====================================================================
   Doodles and highlighter on pages
   ===================================================================== */
function sizeCanvas(cv) {
  const dpr = Math.min(2, window.devicePixelRatio || 1); const w = Math.round(cv.clientWidth * dpr), hh = Math.round(cv.clientHeight * dpr);
  if (cv.width !== w || cv.height !== hh) { cv.width = Math.max(1, w); cv.height = Math.max(1, hh); }
  return cv.getContext('2d');
}
function clearCanvas(cv) { const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height); }
function renderDoodles(el, p) {
  const ink = (p && p.ink) || [];
  const a = sizeCanvas(el._hl), b = sizeCanvas(el._dr);
  a.clearRect(0, 0, el._hl.width, el._hl.height); b.clearRect(0, 0, el._dr.width, el._dr.height);
  if (!ink.length) return;
  renderStrokes(a, el._hl.width, el._hl.height, ink, s => s.k === 'hl' || s.k === 'erase');
  renderStrokes(b, el._dr.width, el._dr.height, ink, s => s.k !== 'hl');
}
function bindDraw(el) {
  const cv = el._dr; let cur = null;
  const pt = e => { const r = cv.getBoundingClientRect(); return [Math.round(clamp((e.clientX - r.left) / r.width, 0, 1) * 1000), Math.round(clamp((e.clientY - r.top) / r.height, 0, 1) * 1000)]; };
  cv.addEventListener('pointerdown', e => {
    if (!RD.drawing || el.classList.contains('is-end')) return;
    e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    const br = RD.brush; const [x, y] = pt(e);
    cur = { k: br.k, c: br.k === 'erase' ? '#000' : br.c, w: br.w, p: [x, y] };
    const p = editPage(+el.dataset.n); p.ink = p.ink || []; p.ink.push(cur);
    RD.undo.push({ n: +el.dataset.n, s: cur });
    renderDoodles(el, p);
  });
  cv.addEventListener('pointermove', e => {
    if (!cur) return; const [x, y] = pt(e); const L = cur.p.length;
    if (Math.abs(x - cur.p[L - 2]) + Math.abs(y - cur.p[L - 1]) < 3) return;
    cur.p.push(x, y);
    if (!el._raf) el._raf = requestAnimationFrame(() => { el._raf = 0; renderDoodles(el, state.pages.get(pageKey(RD.jid, +el.dataset.n))); });
    if (cur.k !== 'erase' && Math.random() < .3) sfx('pen', cur.k === 'hl' ? 'marker' : el.dataset.pen);
  });
  const end = () => { if (!cur) return; cur = null; savePage(pageKey(RD.jid, +el.dataset.n)); renderDrawbar(); };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
}
const BRUSHES = { pen: { name: 'Pen', w: 4 }, marker: { name: 'Marker', w: 11 }, hl: { name: 'Highlighter', w: 30 }, erase: { name: 'Eraser', w: 34 } };
function toggleDraw(on) {
  RD.drawing = on == null ? !RD.drawing : on;
  $('#reader').classList.toggle('drawing', RD.drawing);
  $('#rDraw').setAttribute('aria-pressed', RD.drawing ? 'true' : 'false');
  $('#drawbar').hidden = !RD.drawing; $('#rBottom').style.visibility = RD.drawing ? 'hidden' : '';
  if (RD.drawing) {
    closePop(); RD.sel = null; renderItemsAll();
    if (!RD.brush.c) { const j = curJ(); RD.brush.c = inkOf(pageStyle(j, null).ink).c; }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    renderDrawbar(); toast('Draw on the page. Press Done when you finish.');
  }
  pageEls.forEach(el => el._pen.classList.remove('on'));
}
function renderDrawbar() {
  const bar = $('#drawbar'); if (!RD.drawing) return; bar.textContent = '';
  const br = RD.brush;
  bar.append(h('div', { class: 'chips' }, Object.keys(BRUSHES).map(k => h('button', { type: 'button', class: 'chip', 'aria-pressed': br.k === k ? 'true' : 'false', onclick: () => { br.k = k; br.w = BRUSHES[k].w; if (k === 'hl' && !HL_COLORS.includes(br.c)) br.c = HL_COLORS[0]; if (k !== 'hl' && HL_COLORS.includes(br.c)) br.c = inkOf(pageStyle(curJ(), null).ink).c; renderDrawbar(); } }, BRUSHES[k].name))));
  if (br.k !== 'erase') {
    bar.append(h('span', { class: 'sep' }));
    const cols = br.k === 'hl' ? HL_COLORS : INKS.map(i => i.c).concat(['#C0392B', '#E67E22', '#27AE60', '#2E86C1']);
    bar.append(h('div', { class: 'swatches' }, cols.map(c => h('button', { type: 'button', class: 'sw', style: 'background:' + c, 'aria-label': 'Colour', 'aria-pressed': br.c === c ? 'true' : 'false', onclick: () => { br.c = c; renderDrawbar(); } }))));
  }
  bar.append(h('span', { class: 'sep' }));
  const sz = h('input', { type: 'range', min: '2', max: br.k === 'hl' || br.k === 'erase' ? '60' : '24', value: String(br.w), 'aria-label': 'Brush size' });
  sz.addEventListener('input', () => { br.w = +sz.value; });
  bar.append(sz);
  bar.append(h('button', { type: 'button', class: 'btn sm', disabled: RD.undo.length ? null : true, onclick: () => {
    const u = RD.undo.pop(); if (!u) return; const p = state.pages.get(pageKey(RD.jid, u.n)); if (p && p.ink) { p.ink = p.ink.filter(s => s !== u.s); savePage(pageKey(RD.jid, u.n)); }
    pageEls.forEach(el => { if (+el.dataset.n === u.n) renderDoodles(el, p); }); renderDrawbar();
  } }, 'Undo'));
  bar.append(h('button', { type: 'button', class: 'btn sm danger', onclick: () => {
    const el = focusEl(); const n = +el.dataset.n; const p = state.pages.get(pageKey(RD.jid, n)); if (!p || !(p.ink || []).length) { toast('Nothing drawn on this page yet.'); return; }
    RD.undo = RD.undo.filter(u => u.n !== n); p.ink = []; savePage(pageKey(RD.jid, n)); renderDoodles(el, p); renderDrawbar(); toast('Drawing cleared on page ' + n + '.');
  } }, 'Clear page'));
  bar.append(h('button', { type: 'button', class: 'btn sm solid', onclick: () => toggleDraw(false) }, 'Done'));
}

/* =====================================================================
   Cover studio: style, drawing, photos, text and stickers
   ===================================================================== */
const DS = { draft: null, editId: null, tab: 'style', sel: -1, hist: [], brush: { k: 'pen', c: '#FFFFFF', w: 9 }, raf: 0, drag: null, slid: false };
const CW = 512;
function chipRow(container, opts, current, onPick, iconFn) {
  container.textContent = '';
  Object.keys(opts).forEach(id => {
    const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': id === current ? 'true' : 'false', onclick: () => onPick(id) });
    if (iconFn) { const ic = iconFn(id); if (ic) b.append(ic); }
    b.append(typeof opts[id] === 'string' ? opts[id] : opts[id].name);
    container.append(b);
  });
  return container;
}
function swRow(container, colors, current, onPick, custom) {
  container.textContent = '';
  colors.forEach(col => container.append(h('button', { type: 'button', class: 'sw', style: 'background:' + col, 'aria-label': 'Colour ' + col, 'aria-pressed': String(col).toLowerCase() === String(current || '').toLowerCase() ? 'true' : 'false', onclick: () => onPick(col, false) })));
  if (custom) {
    const inp = h('input', { type: 'color', value: current && current[0] === '#' && current.length === 7 ? current : '#888888', 'aria-label': 'Pick any colour' });
    inp.addEventListener('input', () => onPick(inp.value, true)); inp.addEventListener('change', () => onPick(inp.value, false));
    const isCustom = !colors.some(c => String(c).toLowerCase() === String(current || '').toLowerCase());
    container.append(h('span', { class: 'sw custom' + (isCustom ? ' on' : ''), title: 'Any colour' }, inp));
  }
  return container;
}
const fs = (title, ...kids) => h('fieldset', null, h('legend', { text: title }), ...kids);
function emblemIcon(id) {
  if (id === 'none') return null;
  const c = makeCanvas(44, 44); const col = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#94641D';
  drawEmblem(c.getContext('2d'), id, 22, 22, 38, col, true); return c;
}
function pushHist() { DS.hist.push(JSON.stringify(DS.draft)); if (DS.hist.length > 50) DS.hist.shift(); $('#dUndo').disabled = false; }
function undoStudio() { const s = DS.hist.pop(); if (!s) return; DS.draft = JSON.parse(s); DS.sel = -1; $('#dUndo').disabled = !DS.hist.length; renderStudio(); }
const selLayer = () => (DS.sel >= 0 ? DS.draft.art.layers[DS.sel] : null);

function sizeStudioCanvas() {
  const d = DS.draft; if (!d) return; const dm = dimsOf(d);
  const cv = $('#dCanvas'); const H = Math.round(CW * dm.h / dm.w);
  if (cv.width !== CW || cv.height !== H) { cv.width = CW; cv.height = H; }
  const st = $('#sStage'); const spineOn = getComputedStyle($('#dSpine')).display !== 'none';
  const availW = st.clientWidth - 40 - (spineOn ? 70 : 0), availH = st.clientHeight - 56;
  const w = Math.max(80, Math.min(availW, availH * CW / H));
  cv.style.width = Math.round(w) + 'px'; cv.style.height = Math.round(w * H / CW) + 'px';
  const sp = $('#dSpine'); sp.height = 640; sp.width = Math.max(36, Math.round(640 * dm.t / dm.h));
  sp.style.height = Math.round(w * H / CW) + 'px'; sp.style.width = Math.max(14, Math.round(w * H / CW * dm.t / dm.h)) + 'px';
}
function drawPreview() {
  cancelAnimationFrame(DS.raf);
  DS.raf = requestAnimationFrame(() => {
    const d = DS.draft; if (!d) return;
    const cv = $('#dCanvas'); drawCoverFace(cv.getContext('2d'), cv.width, cv.height, d, 'front', { sel: DS.sel >= 0 ? DS.sel : null });
    const sp = $('#dSpine'); drawCoverFace(sp.getContext('2d'), sp.width, sp.height, d, 'spine');
  });
}
function studioPoint(e) { const cv = $('#dCanvas'); const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * cv.width, y: (e.clientY - r.top) / r.height * cv.height }; }
function hitLayer(pt) {
  const cv = $('#dCanvas'), c = cv.getContext('2d'), W = cv.width, H = cv.height; const Ls = DS.draft.art.layers;
  let fillHit = -1;
  for (let i = Ls.length - 1; i >= 0; i--) {
    const L = Ls[i]; if (L.t === 'draw') continue;
    if (L.t === 'img' && L.fill) { if (fillHit < 0) fillHit = i; continue; }
    const b = layerBox(c, W, H, L); const a = -(L.rot || 0) * Math.PI / 180; const dx = pt.x - L.x * W, dy = pt.y - L.y * H;
    const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(lx) <= b.w / 2 + 8 && Math.abs(ly) <= b.h / 2 + 8) return i;
  }
  return fillHit;
}
function drawLayerTop() { const Ls = DS.draft.art.layers; let L = Ls[Ls.length - 1]; if (!L || L.t !== 'draw') { L = { t: 'draw', strokes: [] }; Ls.push(L); } return L; }
function bindStudio() {
  const cv = $('#dCanvas');
  cv.addEventListener('pointerdown', e => {
    if (!DS.draft) return; e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    const pt = studioPoint(e), W = cv.width, H = cv.height;
    if (DS.tab === 'draw') {
      pushHist(); const L = drawLayerTop(); const b = DS.brush;
      const s = { k: b.k === 'foil' ? 'pen' : b.k, c: b.k === 'erase' ? '#000' : b.c, w: b.w, p: [Math.round(pt.x / W * 1000), Math.round(pt.y / H * 1000)] };
      L.strokes.push(s); DS.drag = { stroke: s }; DS.sel = -1; drawPreview(); return;
    }
    const i = hitLayer(pt);
    DS.sel = i; renderSel();
    if (i >= 0) { const L = DS.draft.art.layers[i]; pushHist(); DS.drag = { i, sx: pt.x, sy: pt.y, ox: L.x, oy: L.y, moved: false }; }
    else DS.drag = null;
    drawPreview();
  });
  cv.addEventListener('pointermove', e => {
    const dg = DS.drag; if (!dg) return; const pt = studioPoint(e), W = cv.width, H = cv.height;
    if (dg.stroke) { const p = dg.stroke.p; const x = Math.round(clamp(pt.x / W, 0, 1) * 1000), y = Math.round(clamp(pt.y / H, 0, 1) * 1000); if (Math.abs(x - p[p.length - 2]) + Math.abs(y - p[p.length - 1]) >= 3) { p.push(x, y); drawPreview(); } return; }
    const L = DS.draft.art.layers[dg.i]; if (!L || L.fill) return;
    L.x = clamp(dg.ox + (pt.x - dg.sx) / W, -.2, 1.2); L.y = clamp(dg.oy + (pt.y - dg.sy) / H, -.2, 1.2); dg.moved = true; drawPreview();
  });
  const end = () => { if (DS.drag && DS.drag.i != null && !DS.drag.moved) DS.hist.pop(); DS.drag = null; $('#dUndo').disabled = !DS.hist.length; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('wheel', e => { const L = selLayer(); if (!L || DS.tab === 'draw') return; e.preventDefault(); const f = e.deltaY < 0 ? 1.06 : .94; if (L.t === 'text') L.size = clamp(L.size * f, .02, .4); else L.w = clamp(L.w * f, .04, 1.4); drawPreview(); renderSel(); }, { passive: false });
}
function rangeRow(label, min, max, step, val, fmt, onInput) {
  const r = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(val), 'aria-label': label });
  const out = h('output', { text: fmt(val) });
  r.addEventListener('pointerdown', () => { if (!DS.slid) { pushHist(); DS.slid = true; } });
  r.addEventListener('keydown', () => { if (!DS.slid) { pushHist(); DS.slid = true; } });
  r.addEventListener('change', () => { DS.slid = false; });
  r.addEventListener('input', () => { onInput(+r.value); out.textContent = fmt(+r.value); drawPreview(); });
  return h('label', { class: 'rng' }, h('span', { text: label }), r, out);
}
function renderSel() {
  const box = $('#sSel'); const L = selLayer();
  if (!L || L.t === 'draw' || DS.tab === 'draw' || DS.tab === 'style') { box.hidden = true; return; }
  box.hidden = false; box.textContent = '';
  box.append(h('b', { text: { img: 'Photo selected', text: 'Text selected', sticker: 'Sticker selected' }[L.t] || 'Selected' }));
  if (!(L.t === 'img' && L.fill)) {
    if (L.t === 'text') box.append(rangeRow('Size', .02, .4, .005, L.size, v => Math.round(v * 100) + '', v => { L.size = v; }));
    else box.append(rangeRow('Size', .04, 1.4, .01, L.w, v => Math.round(v * 100) + '%', v => { L.w = v; }));
    box.append(rangeRow('Rotate', -180, 180, 1, L.rot || 0, v => v + '°', v => { L.rot = v; }));
  }
  box.append(rangeRow('Opacity', .1, 1, .05, L.op == null ? 1 : L.op, v => Math.round(v * 100) + '%', v => { L.op = v; }));
  const Ls = DS.draft.art.layers;
  box.append(h('div', { class: 'row' },
    h('button', { type: 'button', class: 'btn sm', onclick: () => { if (DS.sel < Ls.length - 1) { pushHist(); const [x] = Ls.splice(DS.sel, 1); Ls.splice(DS.sel + 1, 0, x); DS.sel++; drawPreview(); } } }, 'Forward'),
    h('button', { type: 'button', class: 'btn sm', onclick: () => { if (DS.sel > 0) { pushHist(); const [x] = Ls.splice(DS.sel, 1); Ls.splice(DS.sel - 1, 0, x); DS.sel--; drawPreview(); } } }, 'Back'),
    h('button', { type: 'button', class: 'btn sm', onclick: () => { pushHist(); const c2 = clone(L); c2.x = (c2.x || .5) + .04; c2.y = (c2.y || .5) + .04; Ls.push(c2); DS.sel = Ls.length - 1; drawPreview(); renderSel(); } }, 'Copy'),
    h('button', { type: 'button', class: 'btn sm danger', onclick: () => { pushHist(); Ls.splice(DS.sel, 1); DS.sel = -1; drawPreview(); renderStudio(); } }, 'Delete')));
}
function addLayer(L) { pushHist(); DS.draft.art.layers.push(L); DS.sel = DS.draft.art.layers.length - 1; sfx('pop'); drawPreview(); renderStudio(); }
async function addCoverPhoto(file) {
  if (!file || !DS.draft) return;
  toast('Adding your photo to the cover…');
  try { const r = await mediaPut(file, 900); if (!DS.draft) return; addLayer({ t: 'img', mid: r.mid, ar: r.ar, x: .54, y: .5, w: .6, rot: 0, frame: 'none', fill: false }); }
  catch (e) { toast(e && e.message ? e.message : 'Could not add that photo.'); }
}
function renderStudio() {
  const d = DS.draft; if (!d) return;
  $$('.s-tabs [data-st]').forEach(b => b.setAttribute('aria-selected', b.dataset.st === DS.tab ? 'true' : 'false'));
  $('#dCanvas').classList.toggle('drawmode', DS.tab === 'draw');
  $('#sHint').textContent = { style: 'Pick a colour, material and pattern', draw: 'Draw straight onto the cover', photo: 'Drag a photo to move it. Scroll or use Size to resize', text: 'Drag text to place it', sticker: 'Drag stickers anywhere on the cover' }[DS.tab];
  const scroller = $('.s-scroll'); const keep = scroller.scrollTop;
  const pane = $('#sPane'); pane.textContent = '';
  const set = (path, v) => { pushHist(); const parts = path.split('.'); let o = d; while (parts.length > 1) o = o[parts.shift()]; o[parts[0]] = v; sizeStudioCanvas(); renderStudio(); };
  if (DS.tab === 'style') {
    const name = h('input', { id: 'dName', maxlength: '40', autocomplete: 'off', value: d.title });
    name.addEventListener('focus', () => pushHist()); name.addEventListener('input', () => { d.title = name.value; drawPreview(); });
    const sub = h('input', { id: 'dSub', maxlength: '40', autocomplete: 'off', placeholder: 'Your name, a year, a place', value: d.subtitle || '' });
    sub.addEventListener('focus', () => pushHist()); sub.addEventListener('input', () => { d.subtitle = sub.value; drawPreview(); });
    pane.append(h('label', { class: 'fld' }, h('span', { text: 'Title' }), name), h('label', { class: 'fld' }, h('span', { text: 'Line under the title' }), sub));
    pane.append(fs('Title on the front', chipRow(h('div', { class: 'chips' }), { show: 'Show', hide: 'Hide (spine keeps it)' }, d.art.hideTitle ? 'hide' : 'show', v => set('art.hideTitle', v === 'hide'))));
    pane.append(fs('Cover colour', swRow(h('div', { class: 'swatches' }), COVER_COLORS, d.cover.color, (c, live) => { if (live) { d.cover.color = c; drawPreview(); } else set('cover.color', c); }, true)));
    pane.append(fs('Material', chipRow(h('div', { class: 'chips' }), MATERIALS, d.cover.material, v => set('cover.material', v))));
    pane.append(fs('Pattern', chipRow(h('div', { class: 'chips' }), PATTERNS, d.cover.pattern, v => set('cover.pattern', v))));
    pane.append(fs('Emblem', chipRow(h('div', { class: 'chips' }), EMBLEMS, d.cover.emblem, v => set('cover.emblem', v), emblemIcon)));
    const fk = Object.keys(FOILS); const fc = fk.map(k => FOILS[k].g[Math.min(1, FOILS[k].g.length - 1)]);
    const foils = swRow(h('div', { class: 'swatches' }), fc, fc[fk.indexOf(d.cover.foil)], c => set('cover.foil', fk[fc.indexOf(c)]));
    $$('.sw', foils).forEach((b, i) => { b.title = FOILS[fk[i]].name; b.setAttribute('aria-label', 'Foil: ' + FOILS[fk[i]].name); });
    pane.append(fs('Foil and lettering', foils, chipRow(h('div', { class: 'chips' }), TITLE_FONTS, d.cover.font, v => set('cover.font', v))));
    pane.append(fs('Size', chipRow(h('div', { class: 'chips' }), SIZES, d.size, v => set('size', v)), chipRow(h('div', { class: 'chips' }), THICKS, d.thick, v => set('thick', v))));
    pane.append(fs('Ribbon', swRow(h('div', { class: 'swatches' }), RIBBONS, d.ribbon, c => set('ribbon', c))));
    if (!DS.editId) {
      const papers = {}; Object.keys(PAPERS).forEach(k => { papers[k] = PAPERS[k].name; });
      const pens = {}; Object.keys(PENS).forEach(k => { pens[k] = PENS[k].name; });
      pane.append(fs('Inside pages',
        chipRow(h('div', { class: 'chips' }), papers, d.defaults.paper, v => { d.defaults.paper = v; const P = PAPERS[v]; if (P.dark && !inkOf(d.defaults.ink).light) d.defaults.ink = 'white'; if (!P.dark && inkOf(d.defaults.ink).light) d.defaults.ink = 'midnight'; renderStudio(); }),
        chipRow(h('div', { class: 'chips' }), pens, d.defaults.pen, v => { d.defaults.pen = v; renderStudio(); })));
    }
    pane.append(h('button', { type: 'button', class: 'btn accent', onclick: () => { DS.tab = 'draw'; renderStudio(); } }, 'Next: draw on the cover →'));
  } else if (DS.tab === 'draw') {
    const b = DS.brush;
    pane.append(fs('Brush', chipRow(h('div', { class: 'chips' }), { pen: 'Ink pen', marker: 'Marker', foil: 'Metallic foil', erase: 'Eraser' }, b.k, v => { b.k = v; if (v === 'foil' && !FOILS[b.c]) b.c = 'gold'; if (v !== 'foil' && FOILS[b.c]) b.c = '#FFFFFF'; if (v === 'erase') b.w = Math.max(b.w, 20); renderStudio(); })));
    if (b.k === 'foil') pane.append(fs('Foil', chipRow(h('div', { class: 'chips' }), { gold: 'Gold', silver: 'Silver', copper: 'Copper', rose: 'Rose gold' }, b.c, v => { b.c = v; renderStudio(); })));
    else if (b.k !== 'erase') pane.append(fs('Colour', swRow(h('div', { class: 'swatches' }), ART_COLORS, b.c, (c, live) => { b.c = c; if (!live) renderStudio(); }, true)));
    pane.append(fs('Brush size', rangeRow('Size', 2, 60, 1, b.w, v => v + '', v => { b.w = v; })));
    const hasInk = d.art.layers.some(L => L.t === 'draw' && L.strokes.length);
    pane.append(h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn', disabled: hasInk ? null : true, onclick: () => { const Ls = d.art.layers; for (let i = Ls.length - 1; i >= 0; i--) { if (Ls[i].t === 'draw' && Ls[i].strokes.length) { pushHist(); Ls[i].strokes.pop(); if (!Ls[i].strokes.length) Ls.splice(i, 1); break; } } drawPreview(); renderStudio(); } }, 'Undo stroke'),
      h('button', { type: 'button', class: 'btn danger', disabled: hasInk ? null : true, onclick: () => { pushHist(); d.art.layers = d.art.layers.filter(L => L.t !== 'draw'); drawPreview(); renderStudio(); } }, 'Clear drawing')));
    pane.append(h('p', { class: 'note', text: 'The eraser only removes drawing, never the cover itself.' }));
  } else if (DS.tab === 'photo') {
    pane.append(h('button', { type: 'button', class: 'btn accent', onclick: () => $('#fileCover').click() }, '+ Add a photo or picture'));
    pane.append(h('p', { class: 'note', text: 'Photos are resized and saved privately with your journals.' }));
    const L = selLayer();
    if (L && L.t === 'img') {
      pane.append(fs('Placement', chipRow(h('div', { class: 'chips' }), { free: 'Move freely', fill: 'Fill the whole cover' }, L.fill ? 'fill' : 'free', v => { pushHist(); L.fill = v === 'fill'; drawPreview(); renderStudio(); })));
      if (!L.fill) pane.append(fs('Frame', chipRow(h('div', { class: 'chips' }), { none: 'None', round: 'Rounded', circle: 'Circle', polaroid: 'Polaroid' }, L.frame || 'none', v => { pushHist(); L.frame = v; drawPreview(); renderStudio(); })));
    } else if (d.art.layers.some(x => x.t === 'img')) pane.append(h('p', { class: 'note', text: 'Tap a photo on the cover to change it.' }));
  } else if (DS.tab === 'text') {
    const L = selLayer();
    if (L && L.t === 'text') {
      const ta = h('textarea', { class: 'inp', rows: '2', 'aria-label': 'Text', id: 'sText' }); ta.value = L.text;
      ta.addEventListener('focus', () => pushHist()); ta.addEventListener('input', () => { L.text = ta.value; drawPreview(); });
      pane.append(h('label', { class: 'fld' }, h('span', { text: 'Your words' }), ta));
      pane.append(fs('Lettering', chipRow(h('div', { class: 'chips' }), TEXT_FONTS, L.font, v => { pushHist(); L.font = v; drawPreview(); renderStudio(); })));
      const cols = ART_COLORS.concat(['gold', 'silver', 'copper', 'rose']);
      const sw = swRow(h('div', { class: 'swatches' }), cols.map(c => FOILS[c] ? FOILS[c].g[1] : c), FOILS[L.color] ? FOILS[L.color].g[1] : L.color, (c, live) => { const k = ['gold', 'silver', 'copper', 'rose'].find(f => FOILS[f].g[1] === c); if (!live) pushHist(); L.color = k || c; drawPreview(); if (!live) renderStudio(); }, true);
      pane.append(fs('Colour or foil', sw));
      pane.append(h('button', { type: 'button', class: 'btn', onclick: () => { DS.sel = -1; drawPreview(); renderStudio(); } }, '+ Add another text'));
    } else {
      const ta = h('textarea', { class: 'inp', rows: '2', placeholder: 'A name, a quote, a year…', 'aria-label': 'New text', id: 'sNewText' });
      pane.append(h('label', { class: 'fld' }, h('span', { text: 'Add words to the cover' }), ta));
      pane.append(h('button', { type: 'button', class: 'btn accent', onclick: () => addLayer({ t: 'text', text: ta.value.trim() || 'Your words', font: 'hand', color: '#FFFFFF', size: .09, x: .54, y: .72, rot: 0 }) }, '+ Add text'));
    }
  } else if (DS.tab === 'sticker') {
    pane.append(fs('Tap a sticker to add it', h('div', { class: 'grid-emoji' }, STICKERS.map(s => h('button', { type: 'button', 'aria-label': 'Add sticker ' + s, onclick: () => addLayer({ t: 'sticker', s, w: .18, x: .3 + Math.random() * .45, y: .2 + Math.random() * .6, rot: Math.round((Math.random() - .5) * 30) }) }, s)))));
  }
  renderSel(); drawPreview();
  scroller.scrollTop = keep;
}
function openDesigner(editId) {
  if (!state.ready || isLocked()) return;
  closeDrawer(); closeSoundPop();
  const r = rng(Date.now() & 0xffff);
  if (editId) { DS.editId = editId; DS.draft = normJ(clone(jById(editId)), 0); }
  else {
    if (!shelfHasRoomFor(normJ({ thick: 'regular' }, 0))) { toast('The shelf is full. Delete a journal to make room.'); return; }
    DS.editId = null;
    DS.draft = normJ({ id: newId(), title: 'New Journal', subtitle: '', order: Math.max(-1, ...state.lib.journals.map(j => j.order)) + 1,
      cover: { color: COVER_COLORS[Math.floor(r() * COVER_COLORS.length)], material: Object.keys(MATERIALS)[Math.floor(r() * 4)], pattern: 'frame', emblem: Object.keys(EMBLEMS)[1 + Math.floor(r() * 9)], foil: 'gold', font: 'serif' } }, 0);
  }
  DS.tab = 'style'; DS.sel = -1; DS.hist = []; $('#dUndo').disabled = true;
  $('#dTitle').textContent = editId ? 'Cover studio' : 'Design a new journal';
  $('#dSave').textContent = editId ? 'Save cover' : 'Put it on the shelf';
  $('#designer').hidden = false;
  requestAnimationFrame(() => { sizeStudioCanvas(); renderStudio(); });
}
function closeDesigner() { $('#designer').hidden = true; const d = DS.draft; DS.draft = null; if (d) releaseMedia(artMids(d)); }
function saveDesigner() {
  const d = DS.draft; d.title = (d.title || '').trim() || 'Untitled'; d.subtitle = (d.subtitle || '').trim();
  d.art.layers = d.art.layers.filter(L => L.t !== 'draw' || L.strokes.length);
  if (JSON.stringify(d.art).length > 150000) { toast('The cover drawing is very detailed. Undo a few strokes so it can be saved.'); return; }
  if (DS.editId) {
    const j = jById(DS.editId); if (!j) { closeDesigner(); return; }
    const test = state.lib.journals.map(x => x.id === j.id ? Object.assign({}, x, { size: d.size, thick: d.thick }) : x);
    if (layoutShelf(test).overflow) { toast('That size does not fit on the shelf. Try a slimmer book.'); return; }
    const old = artMids(j);
    Object.assign(j, { title: d.title, subtitle: d.subtitle, cover: d.cover, size: d.size, thick: d.thick, ribbon: d.ribbon, art: d.art });
    DS.draft = null; $('#designer').hidden = true; releaseMedia(old);
    saveLib(); sync3D(); if (RD.open) renderReader(); toast('Cover saved.'); sfx('cheer');
  } else {
    if (!shelfHasRoomFor(d)) { toast('The shelf is full. Delete a journal or choose a slimmer book.'); return; }
    state.lib.journals.push(normJ(d, state.lib.journals.length));
    DS.draft = null; $('#designer').hidden = true; saveLib(); sync3D();
    setTimeout(() => takeDown(d.id), R3 ? 500 : 0);
    toast('“' + d.title + '” is on the shelf.'); sfx('cheer');
  }
}

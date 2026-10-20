/* =====================================================================
   Media (photos): compressed and stored privately with your journals
   ===================================================================== */
const Media = { url: new Map(), img: new Map(), loading: new Set() };
const MEDIA_MAX = 235000;
function fileToImage(file) {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(file); const im = new Image();
    im.onload = () => { res(im); setTimeout(() => URL.revokeObjectURL(u), 2000); };
    im.onerror = () => rej(new Error('That file could not be read as an image.')); im.src = u;
  });
}
async function compressImage(file, maxDim) {
  const im = await fileToImage(file);
  const alpha = /png|gif|webp|svg/.test(file.type);
  let scale = Math.min(1, maxDim / Math.max(im.naturalWidth, im.naturalHeight));
  for (let pass = 0; pass < 6; pass++) {
    const w = Math.max(1, Math.round(im.naturalWidth * scale)), hh = Math.max(1, Math.round(im.naturalHeight * scale));
    const c = makeCanvas(w, hh, x => x.drawImage(im, 0, 0, w, hh));
    let url = '';
    if (alpha) { url = c.toDataURL('image/webp', .85); if (url.indexOf('data:image/webp') !== 0) url = c.toDataURL('image/png'); }
    if (!url || url.length > MEDIA_MAX) {
      const flat = makeCanvas(w, hh, x => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, hh); x.drawImage(c, 0, 0); });
      for (let q = .86; q >= .5; q -= .12) { url = flat.toDataURL('image/jpeg', q); if (url.length <= MEDIA_MAX) break; }
    }
    if (url.length <= MEDIA_MAX) return { url, w, h: hh };
    scale *= .72;
  }
  throw new Error('That image is too large.');
}
function makeImg(mid) { const im = new Image(); im.onload = () => onMediaReady(); im.src = Media.url.get(mid); Media.img.set(mid, im); }
async function loadMedia(mid) {
  if (!mid || Media.loading.has(mid)) return;
  if (Media.url.has(mid)) { if (!Media.img.has(mid)) makeImg(mid); return; }
  if (!state.store) return;
  Media.loading.add(mid);
  try { const d = await state.store.readMedia(mid); if (d && d.data) { Media.url.set(mid, d.data); makeImg(mid); } } catch (e) { /* missing photo */ }
  Media.loading.delete(mid);
}
function mediaURL(mid) { if (Media.url.has(mid)) return Media.url.get(mid); loadMedia(mid); return null; }
function mediaImg(mid) { const im = Media.img.get(mid); if (im && im.complete && im.naturalWidth) return im; loadMedia(mid); return null; }
let mediaTimer = null;
function onMediaReady() {
  clearTimeout(mediaTimer);
  mediaTimer = setTimeout(() => { sync3D(); if (RD.open) renderReader(true); if (DS.draft) drawPreview(); if (!$('#drawer').hidden) renderDrawerSoft(); }, 60);
}
async function mediaPut(file, maxDim) {
  const r = await compressImage(file, maxDim);
  const mid = newId('m');
  await state.store.writeMedia(mid, { data: r.url, w: r.w, h: r.h, created: Date.now() });
  Media.url.set(mid, r.url); makeImg(mid);
  return { mid, ar: r.h / r.w };
}
function mediaRefs() {
  const s = new Set();
  if (state.lib) state.lib.journals.forEach(j => (j.art && j.art.layers || []).forEach(L => { if (L.mid) s.add(L.mid); }));
  for (const p of state.pages.values()) (p.items || []).forEach(it => { if (it.mid) s.add(it.mid); });
  if (DS.draft) (DS.draft.art.layers || []).forEach(L => { if (L.mid) s.add(L.mid); });
  return s;
}
function releaseMedia(mids) {
  setTimeout(() => {
    const refs = mediaRefs();
    mids.forEach(mid => { if (mid && !refs.has(mid)) { Media.url.delete(mid); Media.img.delete(mid); queue(() => state.store.deleteMedia(mid)); } });
  }, 400);
}

/* =====================================================================
   Painting: covers, emblems, strokes
   ===================================================================== */
function foilFill(c, x0, y0, x1, y1, foil) {
  const f = FOILS[foil];
  if (!f) return foil || '#E8D9A8';
  if (f.g.length === 1) return f.g[0];
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, f.g[0]); g.addColorStop(.5, f.g[1]); g.addColorStop(1, f.g[2]);
  return g;
}
function paintMaterial(c, W, H, mat, base, r) {
  c.fillStyle = base; c.fillRect(0, 0, W, H);
  const dark = luminance(base) < .5;
  if (mat === 'leather') {
    const n = Math.floor(W * H / 55);
    for (let i = 0; i < n; i++) { c.fillStyle = r() < .55 ? 'rgba(0,0,0,.075)' : 'rgba(255,255,255,.05)'; c.beginPath(); c.arc(r() * W, r() * H, .8 + r() * 2.2, 0, 6.3); c.fill(); }
    for (let i = 0; i < 18; i++) { c.strokeStyle = 'rgba(0,0,0,.06)'; c.lineWidth = .6 + r(); c.beginPath(); let x = r() * W, y = r() * H; c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - .5) * W * .15; y += (r() - .5) * H * .1; c.lineTo(x, y); } c.stroke(); }
  } else if (mat === 'linen' || mat === 'cloth') {
    const step = mat === 'linen' ? 2 : 4;
    for (let y = 0; y < H; y += step) { c.fillStyle = r() < .5 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.06)'; c.fillRect(0, y, W, step * .5); }
    for (let x = 0; x < W; x += step) { c.fillStyle = r() < .5 ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.05)'; c.fillRect(x, 0, step * .5, H); }
    if (mat === 'cloth') for (let i = 0; i < W * H / 300; i++) { c.fillStyle = 'rgba(0,0,0,.06)'; c.fillRect(r() * W, r() * H, 2, 1); }
  } else if (mat === 'velvet') {
    const g = c.createRadialGradient(W * .35, H * .3, 0, W * .35, H * .3, Math.max(W, H) * .9);
    g.addColorStop(0, 'rgba(255,255,255,.16)'); g.addColorStop(.5, 'rgba(255,255,255,.03)'); g.addColorStop(1, 'rgba(0,0,0,.25)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (let i = 0; i < W * H / 40; i++) { c.fillStyle = 'rgba(255,255,255,.025)'; c.fillRect(r() * W, r() * H, 1, 1); }
  } else if (mat === 'kraft') {
    for (let i = 0; i < W * H / 90; i++) { const x = r() * W, y = r() * H, l = 3 + r() * 10, a = r() * 6.3; c.strokeStyle = r() < .5 ? 'rgba(40,20,5,.14)' : 'rgba(255,245,225,.14)'; c.lineWidth = .5 + r() * .6; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
    for (let i = 0; i < W * H / 260; i++) { c.fillStyle = 'rgba(30,15,0,.22)'; c.fillRect(r() * W, r() * H, 1.3, 1.3); }
  } else if (mat === 'marble') {
    for (let i = 0; i < 22; i++) {
      c.strokeStyle = dark ? 'rgba(255,255,255,' + (.05 + r() * .16) + ')' : 'rgba(0,0,0,' + (.04 + r() * .12) + ')'; c.lineWidth = .6 + r() * 3;
      c.beginPath(); let x = r() * W, y = -20; c.moveTo(x, y);
      while (y < H + 20) { const nx = x + (r() - .5) * W * .5, ny = y + H * (.08 + r() * .14); c.quadraticCurveTo(x + (r() - .5) * W * .4, (y + ny) / 2, nx, ny); x = nx; y = ny; }
      c.stroke();
    }
  }
  const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.32)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
}
function emblemShape(x, kind, s) {
  x.beginPath();
  switch (kind) {
    case 'moon': x.arc(0, 0, s * .42, 0, 6.3); x.fill(); x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(s * .2, -s * .1, s * .36, 0, 6.3); x.fill(); x.globalCompositeOperation = 'source-over'; break;
    case 'sun': x.arc(0, 0, s * .19, 0, 6.3); x.fill(); for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; x.beginPath(); x.moveTo(Math.cos(a) * s * .27, Math.sin(a) * s * .27); x.lineTo(Math.cos(a) * s * (i % 2 ? .38 : .45), Math.sin(a) * s * (i % 2 ? .38 : .45)); x.stroke(); } break;
    case 'star': for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? s * .19 : s * .45; i ? x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : x.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } x.closePath(); x.fill(); break;
    case 'heart': x.moveTo(0, s * .36); x.bezierCurveTo(-s * .58, 0, -s * .3, -s * .44, 0, -s * .15); x.bezierCurveTo(s * .3, -s * .44, s * .58, 0, 0, s * .36); x.fill(); break;
    case 'leaf':
      x.save(); x.rotate(.6); x.moveTo(0, -s * .45); x.quadraticCurveTo(s * .34, 0, 0, s * .4); x.quadraticCurveTo(-s * .34, 0, 0, -s * .45); x.fill();
      x.globalCompositeOperation = 'destination-out'; x.lineWidth = s * .035; x.beginPath(); x.moveTo(0, -s * .36); x.lineTo(0, s * .34); x.stroke();
      for (let i = 0; i < 4; i++) { const y = -s * .22 + i * s * .14; x.beginPath(); x.moveTo(0, y + s * .06); x.lineTo(s * .15, y - s * .04); x.moveTo(0, y + s * .06); x.lineTo(-s * .15, y - s * .04); x.stroke(); }
      x.globalCompositeOperation = 'source-over'; x.lineWidth = s * .04; x.beginPath(); x.moveTo(0, s * .38); x.lineTo(0, s * .52); x.stroke(); x.restore(); break;
    case 'flower':
      for (let i = 0; i < 6; i++) { x.save(); x.rotate(i * Math.PI / 3); x.beginPath(); x.ellipse(0, -s * .23, s * .1, s * .2, 0, 0, 6.3); x.fill(); x.restore(); }
      x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(0, 0, s * .09, 0, 6.3); x.fill(); x.globalCompositeOperation = 'source-over'; x.beginPath(); x.arc(0, 0, s * .055, 0, 6.3); x.fill(); break;
    case 'feather':
      x.save(); x.rotate(.55); x.moveTo(0, -s * .5); x.quadraticCurveTo(s * .26, -s * .1, s * .04, s * .32); x.lineTo(-s * .04, s * .32); x.quadraticCurveTo(-s * .24, -s * .1, 0, -s * .5); x.fill();
      x.globalCompositeOperation = 'destination-out'; x.lineWidth = s * .022;
      for (let i = 0; i < 6; i++) { const y = -s * .32 + i * s * .1; x.beginPath(); x.moveTo(0, y); x.lineTo(s * .2, y - s * .08); x.moveTo(0, y + s * .03); x.lineTo(-s * .2, y - s * .05); x.stroke(); }
      x.globalCompositeOperation = 'source-over'; x.lineWidth = s * .03; x.beginPath(); x.moveTo(0, -s * .42); x.lineTo(0, s * .52); x.stroke(); x.restore(); break;
    case 'compass': {
      x.arc(0, 0, s * .42, 0, 6.3); x.stroke(); x.beginPath();
      const pts = [[0, -.36], [.08, -.08], [.36, 0], [.08, .08], [0, .36], [-.08, .08], [-.36, 0], [-.08, -.08]];
      pts.forEach((p, i) => i ? x.lineTo(p[0] * s, p[1] * s) : x.moveTo(p[0] * s, p[1] * s)); x.closePath(); x.fill(); break;
    }
    case 'mountain': x.moveTo(-s * .46, s * .3); x.lineTo(-s * .12, -s * .24); x.lineTo(s * .04, s * .02); x.lineTo(s * .18, -s * .12); x.lineTo(s * .46, s * .3); x.closePath(); x.fill(); x.beginPath(); x.arc(s * .24, -s * .36, s * .08, 0, 6.3); x.fill(); break;
  }
}
function drawEmblem(c, kind, cx, cy, s, foil, flat) {
  if (!kind || kind === 'none') return;
  const S = Math.ceil(s * 1.3); const o = makeCanvas(S, S); const x = o.getContext('2d');
  x.translate(S / 2, S / 2); x.fillStyle = '#000'; x.strokeStyle = '#000'; x.lineWidth = s * .045; x.lineCap = 'round'; x.lineJoin = 'round';
  emblemShape(x, kind, s);
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = foilFill(x, 0, 0, S, S, foil); x.fillRect(0, 0, S, S);
  c.save(); if (!flat) { c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = s * .02; c.shadowOffsetX = s * .012; c.shadowOffsetY = s * .022; }
  c.drawImage(o, cx - S / 2, cy - S / 2); c.restore();
}
function titleFont(id, s) {
  switch (id) {
    case 'script': return s + 'px "Pinyon Script", cursive';
    case 'hand': return '700 ' + s + 'px "Caveat", cursive';
    case 'sans': return '700 ' + s + 'px "Manrope", sans-serif';
    case 'type': return s + 'px "Special Elite", monospace';
    case 'brush': return s + 'px "Nanum Brush Script", cursive';
    case 'apple': return s + 'px "Homemade Apple", cursive';
    case 'dancing': return '700 ' + s + 'px "Dancing Script", cursive';
    default: return '600 ' + s + 'px "Cormorant Garamond", Georgia, serif';
  }
}
function wrapLines(c, text, maxW) {
  const words = text.split(/\s+/).filter(Boolean); const lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (c.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; } }
  if (cur) lines.push(cur); return lines.length ? lines : [''];
}
function setSpacing(c, px) { if ('letterSpacing' in c) c.letterSpacing = px + 'px'; }
function embossText(c, t, x, y, foil, s) {
  c.save(); c.fillStyle = 'rgba(0,0,0,.45)'; c.fillText(t, x + s * .02, y + s * .035);
  c.fillStyle = foilFill(c, x - s * 2, y - s * .6, x + s * 2, y + s * .6, foil); c.fillText(t, x, y); c.restore();
}
function drawPattern(c, W, H, cv, r) {
  const p = cv.pattern; if (!p || p === 'none') return;
  c.save(); const f = foilFill(c, 0, 0, W, H, cv.foil); c.strokeStyle = f; c.fillStyle = f;
  const L = W * .13, R = W * .94, T = W * .07, B = H - W * .07;
  if (p === 'frame') { c.lineWidth = W * .007; c.strokeRect(L, T, R - L, B - T); c.lineWidth = W * .003; const k = W * .02; c.strokeRect(L + k, T + k, R - L - 2 * k, B - T - 2 * k); }
  else if (p === 'corners') {
    c.lineWidth = W * .006; c.lineCap = 'round'; const a = W * .14;
    [[L, T, 1, 1], [R, T, -1, 1], [L, B, 1, -1], [R, B, -1, -1]].forEach(([x, y, sx, sy]) => {
      c.beginPath(); c.moveTo(x + sx * a, y); c.lineTo(x, y); c.lineTo(x, y + sy * a); c.stroke();
      c.beginPath(); c.arc(x + sx * W * .05, y + sy * W * .05, W * .022, 0, 6.3); c.stroke(); c.beginPath(); c.arc(x + sx * W * .05, y + sy * W * .05, W * .007, 0, 6.3); c.fill();
    });
  } else if (p === 'band') { c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(W * .085, H * .42, W, H * .2); c.fillStyle = f; c.fillRect(W * .085, H * .42, W, W * .006); c.fillRect(W * .085, H * .62 - W * .006, W, W * .006); }
  else if (p === 'stripes') { c.globalAlpha = .13; c.lineWidth = W * .03; for (let x = -H; x < W + H; x += W * .085) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + H, H); c.stroke(); } }
  else if (p === 'dots') { c.globalAlpha = .35; const st = W * .07; for (let y = st / 2; y < H; y += st) for (let x = W * .12 + ((y / st) % 2 ? st / 2 : 0); x < W; x += st) { c.beginPath(); c.arc(x, y, W * .0065, 0, 6.3); c.fill(); } }
  else if (p === 'stars') {
    for (let i = 0; i < 46; i++) {
      const x = W * .1 + r() * W * .88, y = r() * H, s = W * (.006 + r() * .016);
      if (y > H * .4 && y < H * .66 && x > W * .2 && x < W * .86) continue;
      c.globalAlpha = .45 + r() * .5; c.beginPath(); c.moveTo(x, y - s * 2); c.quadraticCurveTo(x, y, x + s * 2, y); c.quadraticCurveTo(x, y, x, y + s * 2); c.quadraticCurveTo(x, y, x - s * 2, y); c.quadraticCurveTo(x, y, x, y - s * 2); c.fill();
    }
  } else if (p === 'waves') { c.lineWidth = W * .0045; c.globalAlpha = .7; for (let i = 0; i < 6; i++) { const y0 = H * .74 + i * H * .03; c.beginPath(); for (let x = W * .09; x <= W; x += 6) { const y = y0 + Math.sin(x / W * 14 + i * .8) * H * .008; x === W * .09 ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke(); } }
  c.restore();
}
function drawTitleBlock(c, W, H, j, cy) {
  const f = j.cover.font; let text = (j.title || 'Untitled').trim() || 'Untitled'; if (f === 'sans') text = text.toUpperCase();
  let s = W * (f === 'script' ? .15 : f === 'sans' ? .085 : f === 'hand' ? .14 : f === 'type' ? .085 : .125), lines;
  const maxW = W * .72;
  for (; s > W * .035; s *= .93) { c.font = titleFont(f, s); setSpacing(c, f === 'sans' ? Math.round(s * .14) : 0); lines = wrapLines(c, text, maxW); if (lines.length <= 3 && lines.every(l => c.measureText(l).width <= maxW)) break; }
  const lh = s * (f === 'script' ? 1.15 : 1.1); const y0 = cy - (lines.length - 1) * lh / 2;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  lines.forEach((l, i) => embossText(c, l, W * .535, y0 + i * lh, j.cover.foil, s));
  setSpacing(c, 0);
}

/* ---- strokes (cover drawings and page doodles) ---- */
function renderStrokes(ctx, W, H, strokes, filter) {
  for (const s of strokes || []) {
    if (filter && !filter(s)) continue;
    const p = s.p; if (!p || p.length < 2) continue;
    ctx.save();
    ctx.globalCompositeOperation = s.k === 'erase' ? 'destination-out' : 'source-over';
    ctx.globalAlpha = s.k === 'marker' ? .78 : s.k === 'hl' ? .4 : 1;
    ctx.strokeStyle = s.k === 'erase' ? '#000' : (FOILS[s.c] ? foilFill(ctx, 0, 0, W, H, s.c) : s.c);
    if (FOILS[s.c] && s.k !== 'erase') { ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowOffsetX = W * .002; ctx.shadowOffsetY = W * .003; }
    ctx.lineWidth = Math.max(.5, s.w / 1000 * W); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const X = i => p[i] / 1000 * W, Y = i => p[i + 1] / 1000 * H;
    ctx.beginPath(); ctx.moveTo(X(0), Y(0));
    if (p.length === 2) ctx.lineTo(X(0) + .1, Y(0));
    for (let i = 2; i < p.length - 2; i += 2) ctx.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 2)) / 2, (Y(i) + Y(i + 2)) / 2);
    if (p.length > 2) ctx.lineTo(X(p.length - 2), Y(p.length - 2));
    ctx.stroke(); ctx.restore();
  }
}

/* ---- cover art layers ---- */
function layerBox(c, W, H, L) {
  if (L.t === 'img') {
    if (L.fill) return { w: W, h: H };
    const w = L.w * W, hh = w * (L.ar || .75);
    return L.frame === 'polaroid' ? { w: w * 1.1, h: hh + w * .26 } : { w, h: hh };
  }
  if (L.t === 'sticker') { const s = L.w * W; return { w: s, h: s }; }
  if (L.t === 'text') {
    const s = L.size * W; c.save(); c.font = titleFont(L.font, s); const lines = String(L.text || '').split('\n');
    const w = Math.max(10, ...lines.map(l => c.measureText(l).width)); c.restore();
    return { w: w + s * .2, h: lines.length * s * 1.15 };
  }
  return { w: 0, h: 0 };
}
function drawLayer(c, W, H, L) {
  if (L.t === 'draw') { const o = makeCanvas(W, H, x => renderStrokes(x, W, H, L.strokes)); c.drawImage(o, 0, 0); return; }
  c.save(); c.globalAlpha = L.op == null ? 1 : L.op;
  if (L.t === 'img' && L.fill) {
    const im = mediaImg(L.mid);
    if (im) { const s = Math.max(W / im.naturalWidth, H / im.naturalHeight); const w = im.naturalWidth * s, hh = im.naturalHeight * s; c.drawImage(im, (W - w) / 2, (H - hh) / 2, w, hh); }
    else { c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(0, 0, W, H); }
    c.restore(); return;
  }
  c.translate(L.x * W, L.y * H); c.rotate((L.rot || 0) * Math.PI / 180);
  if (L.t === 'img') {
    const im = mediaImg(L.mid); const w = L.w * W, hh = w * (L.ar || .75);
    if (L.frame === 'polaroid') {
      const fw = w * 1.1, fh = hh + w * .26;
      c.save(); c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = w * .05; c.shadowOffsetY = w * .02; c.fillStyle = '#FBFAF6'; c.fillRect(-fw / 2, -fh / 2, fw, fh); c.restore();
      c.translate(0, -fh / 2 + w * .05 + hh / 2);
    }
    c.save(); c.beginPath();
    if (L.frame === 'circle') c.ellipse(0, 0, w / 2, hh / 2, 0, 0, 6.3);
    else if (L.frame === 'round') { const r = w * .08; if (c.roundRect) c.roundRect(-w / 2, -hh / 2, w, hh, r); else c.rect(-w / 2, -hh / 2, w, hh); }
    else c.rect(-w / 2, -hh / 2, w, hh);
    c.clip();
    if (im) c.drawImage(im, -w / 2, -hh / 2, w, hh); else { c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(-w / 2, -hh / 2, w, hh); }
    c.restore();
  } else if (L.t === 'sticker') {
    const s = L.w * W; c.font = s + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = s * .05; c.shadowOffsetY = s * .03; c.fillText(L.s, 0, s * .06);
  } else if (L.t === 'text') {
    const s = L.size * W; c.font = titleFont(L.font, s); c.textAlign = 'center'; c.textBaseline = 'middle';
    const lines = String(L.text || '').split('\n'); const lh = s * 1.15; const y0 = -(lines.length - 1) * lh / 2;
    lines.forEach((l, i) => { if (FOILS[L.color]) embossText(c, l, 0, y0 + i * lh, L.color, s); else { c.fillStyle = 'rgba(0,0,0,.3)'; c.fillText(l, s * .02, y0 + i * lh + s * .03); c.fillStyle = L.color || '#fff'; c.fillText(l, 0, y0 + i * lh); } });
  }
  c.restore();
}
function drawSelection(c, W, H, L) {
  if (!L || L.t === 'draw') return;
  const b = layerBox(c, W, H, L); c.save();
  if (L.t === 'img' && L.fill) { c.strokeStyle = '#FFD27A'; c.setLineDash([8, 6]); c.lineWidth = 3; c.strokeRect(4, 4, W - 8, H - 8); c.restore(); return; }
  c.translate(L.x * W, L.y * H); c.rotate((L.rot || 0) * Math.PI / 180);
  c.strokeStyle = '#FFD27A'; c.lineWidth = 2.5; c.setLineDash([8, 6]); c.strokeRect(-b.w / 2 - 6, -b.h / 2 - 6, b.w + 12, b.h + 12);
  c.setLineDash([]); c.fillStyle = '#FFD27A'; [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => { c.beginPath(); c.arc(sx * (b.w / 2 + 6), sy * (b.h / 2 + 6), 5, 0, 6.3); c.fill(); });
  c.restore();
}
function drawCoverFace(c, W, H, j, part, opts) {
  const cv = j.cover; const r = rng(hashStr(j.id + part));
  paintMaterial(c, W, H, cv.material, cv.color, r);
  const art = j.art || { layers: [] };
  if (part === 'spine') {
    const g = c.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(0,0,0,.4)'); g.addColorStop(.22, 'rgba(255,255,255,.07)'); g.addColorStop(.5, 'rgba(255,255,255,.12)'); g.addColorStop(.8, 'rgba(0,0,0,.06)'); g.addColorStop(1, 'rgba(0,0,0,.42)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.fillStyle = foilFill(c, 0, 0, W, H, cv.foil);
    [H * .055, H * .07, H * .93, H * .945].forEach(y => c.fillRect(0, y, W, Math.max(2, H * .006)));
    let text = (j.title || 'Untitled').trim(); if (cv.font === 'sans') text = text.toUpperCase();
    c.save(); c.translate(W / 2, H * .47); c.rotate(Math.PI / 2);
    let s = W * .5; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (; s > 6; s *= .93) { c.font = titleFont(cv.font, s); setSpacing(c, cv.font === 'sans' ? Math.round(s * .12) : 0); if (c.measureText(text).width <= H * .66) break; }
    embossText(c, text, 0, cv.font === 'script' ? s * .05 : 0, cv.foil, s); setSpacing(c, 0); c.restore();
    if (cv.emblem && cv.emblem !== 'none') drawEmblem(c, cv.emblem, W / 2, H * .86, Math.min(W * .62, H * .06), cv.foil);
    return;
  }
  const front = part === 'front';
  if (front) drawPattern(c, W, H, cv, r);
  if (front) (art.layers || []).forEach(L => drawLayer(c, W, H, L));
  const g = c.createLinearGradient(front ? 0 : W, 0, front ? W * .1 : W * .9, 0);
  g.addColorStop(0, 'rgba(0,0,0,.42)'); g.addColorStop(.6, 'rgba(255,255,255,.07)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(front ? 0 : W * .88, 0, W * .12, H);
  c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(front ? W * .075 : W * .92, 0, Math.max(1, W * .004), H);
  if (!front) { drawEmblem(c, cv.emblem, W * .47, H * .9, W * .08, cv.foil); return; }
  const em = cv.emblem && cv.emblem !== 'none';
  if (em) drawEmblem(c, cv.emblem, W * .535, cv.pattern === 'band' ? H * .29 : H * .32, W * .21, cv.foil);
  if (!art.hideTitle) {
    drawTitleBlock(c, W, H, j, cv.pattern === 'band' ? H * .52 : (em ? H * .52 : H * .44));
    if (j.subtitle) {
      const s = W * .036; c.font = '600 ' + s + 'px "Manrope", sans-serif'; setSpacing(c, Math.round(s * .22)); c.textAlign = 'center'; c.textBaseline = 'middle';
      embossText(c, j.subtitle.toUpperCase(), W * .535, cv.pattern === 'waves' ? H * .68 : H * .86, cv.foil, s); setSpacing(c, 0);
    }
  }
  if (opts && opts.sel != null && art.layers[opts.sel]) drawSelection(c, W, H, art.layers[opts.sel]);
}
function artMids(j) { return ((j.art && j.art.layers) || []).filter(L => L.mid).map(L => L.mid); }
function coverSig(j) { return JSON.stringify([j.title, j.subtitle, j.cover, j.size, j.thick, j.ribbon, j.art]) + artMids(j).map(m => mediaImg(m) ? 1 : 0).join(''); }
const thumbCache = new Map();
function coverURL(j, W) {
  const sig = coverSig(j) + W; if (thumbCache.has(sig)) return thumbCache.get(sig);
  const d = dimsOf(j); const H = Math.round(W * d.h / d.w);
  const url = makeCanvas(W, H, c => drawCoverFace(c, W, H, j, 'front')).toDataURL('image/png');
  if (thumbCache.size > 80) thumbCache.clear();
  thumbCache.set(sig, url); return url;
}
const matCache = new Map();
function materialURL(color, mat) {
  const k = color + mat; if (matCache.has(k)) return matCache.get(k);
  const url = makeCanvas(256, 256, c => paintMaterial(c, 256, 256, mat, color, rng(hashStr(k)))).toDataURL('image/png');
  matCache.set(k, url); return url;
}

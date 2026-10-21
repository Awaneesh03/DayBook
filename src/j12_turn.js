/* =====================================================================
   Page turning: a real sheet that curls, follows your finger and lands
   ===================================================================== */
const MAX_PAGES = 999;
const TURN = { cur: null, gesture: null };
const turnDur = () => ({ slow: 1350, normal: 950, fast: 560 })[S().turnSpeed || 'normal'] || 950;
const curlOn = () => S().curl !== false;
const stripCount = () => (curlOn() ? (window.innerWidth < 700 ? 9 : 14) : 1);
function geomOf(el) { return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }; }
function copyCanvases(from, to) {
  const a = from.querySelectorAll('canvas'), b = to.querySelectorAll('canvas');
  b.forEach((cv, i) => { const s = a[i]; if (!s || !s.width) return; cv.width = s.width; cv.height = s.height; try { cv.getContext('2d').drawImage(s, 0, 0); } catch (e) { /* tainted or empty */ } });
}
function snapPage(el) {
  const c = el.cloneNode(true);
  c.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
  c.querySelectorAll('.pen, .it-bar, .corner, .rz').forEach(n => n.remove());
  c.querySelectorAll('.it.sel').forEach(n => n.classList.remove('sel'));
  const ta = c.querySelector('.p-body'); if (ta) { ta.value = el._ta.value; ta.removeAttribute('placeholder'); if (!el._ta.value) ta.setAttribute('placeholder', el._ta.getAttribute('placeholder') || ''); }
  copyCanvases(el, c);
  c._scroll = el._ta.scrollTop; c._paper = getComputedStyle(el).backgroundColor;
  c.classList.add('snap'); c.setAttribute('aria-hidden', 'true');
  return c;
}
function cloneSnap(s) {
  const c = s.cloneNode(true); copyCanvases(s, c);
  const ta = c.querySelector('.p-body'), sta = s.querySelector('.p-body'); if (ta && sta) ta.value = sta.value;
  c._scroll = s._scroll; return c;
}
function fixScroll(root) { root.querySelectorAll('.snap').forEach(c => { const s = c._scroll || 0; const ink = c.querySelector('.p-ink'), ta = c.querySelector('.p-body'); if (ink) ink.scrollTop = s; if (ta) ta.scrollTop = s; }); }
function fillFace(face, spec, offset, g, sw) {
  face.style.background = spec.paper || '#F4ECD8';
  if (!spec.snap) return;
  const c = cloneSnap(spec.snap);
  Object.assign(c.style, { position: 'absolute', top: '0', left: (-offset) + 'px', width: g.w + 'px', height: g.h + 'px', margin: '0' });
  if (spec.ghost) {
    const wrap = h('div', { class: 'tl-ghost' }); wrap.style.width = sw + 'px'; wrap.append(c); face.append(wrap);
  } else face.append(c);
}
function buildLeaf(g, front, back, dir) {
  const N = stripCount(), sw = g.w / N;
  const root = h('div', { class: 'tl' + (dir > 0 ? '' : ' rev'), 'aria-hidden': 'true' });
  Object.assign(root.style, { left: g.x + 'px', top: g.y + 'px', width: g.w + 'px', height: g.h + 'px' });
  const strips = []; let parent = root;
  for (let k = 0; k < N; k++) {
    const s = h('div', { class: 'tl-s' });
    s.style.width = (sw + (k < N - 1 ? 1 : 0)) + 'px'; s.style.height = g.h + 'px';
    if (dir > 0) { s.style.left = (k ? sw : 0) + 'px'; s.style.transformOrigin = '0 50%'; }
    else { s.style.right = (k ? sw : 0) + 'px'; s.style.transformOrigin = '100% 50%'; }
    const ff = h('div', { class: 'tl-f front' }), bf = h('div', { class: 'tl-f back' });
    fillFace(ff, front, dir > 0 ? k * sw : g.w - (k + 1) * sw, g, sw);
    fillFace(bf, back, back.ghost ? (dir > 0 ? k * sw : g.w - (k + 1) * sw) : (dir > 0 ? g.w - (k + 1) * sw : k * sw), g, sw);
    if (k === N - 1) { ff.classList.add('edge'); bf.classList.add('edge'); }
    s.append(ff, bf); parent.append(s); parent = s; strips.push(s);
  }
  return { root, strips, sw, N, g, dir };
}
function placeUnder(snap, g) {
  const u = h('div', { class: 'tl-under', 'aria-hidden': 'true' });
  Object.assign(u.style, { left: g.x + 'px', top: g.y + 'px', width: g.w + 'px', height: g.h + 'px' });
  Object.assign(snap.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
  u.append(snap); return u;
}
function setTurn(T, p) {
  T.p = p;
  const L = T.leaf, N = L.N, back = T.mode === 'back-single';
  const sgn = L.dir > 0 ? -1 : 1;
  const BEND = curlOn() ? 64 : 0;
  const lift = Math.sin(p * Math.PI);
  let base, bend;
  if (back) { base = -180 * (1 - p); bend = lift * BEND; }
  else { base = sgn * 180 * p; bend = sgn * lift * BEND; }
  // ease the curl so the outer edge leads, then the sheet settles flat
  const step = N > 1 ? bend / (N - 1) : 0;
  let abs = base, edge = 0;
  L.strips.forEach((s, k) => {
    const a = k === 0 ? base : step; if (k) abs += step;
    s.style.transform = 'rotateY(' + a.toFixed(3) + 'deg)' + (k === 0 ? ' translateZ(' + (lift * 2).toFixed(2) + 'px)' : '');
    const c = Math.cos(abs * Math.PI / 180);
    s.style.setProperty('--sf', Math.max(0, (1 - c) * .55).toFixed(3));
    s.style.setProperty('--sb', Math.max(0, (1 + c) * .45).toFixed(3));
    s.style.setProperty('--hl', Math.max(0, Math.sin(abs * Math.PI / 180) * (L.dir > 0 ? -1 : 1) * .18).toFixed(3));
    edge += L.sw * c;
  });
  const hinge = L.dir > 0 ? L.g.x : L.g.x + L.g.w;
  const x = hinge + (L.dir > 0 ? edge : -edge);
  T.shadow.style.setProperty('--x', x.toFixed(1) + 'px');
  T.shadow.style.setProperty('--o', (lift * .55).toFixed(3));
  T.shadow.style.setProperty('--w', (40 + lift * 70).toFixed(0) + 'px');
}
function startTurn(dir, explicit) {
  const j = curJ(); if (!j || TURN.cur) return null;
  const single = !spreadMode();
  const oldN = RD.n, oldPages = j.pages;
  let target = explicit != null ? explicit : (single ? oldN + dir : oldN + 2 * dir);
  if (!single && target % 2 === 0) target -= 1;
  if (target < 1) { if (dir < 0) toast('This is the first page.'); return null; }
  if (target > MAX_PAGES) { toast('This journal is full at ' + MAX_PAGES + ' pages. Start a new journal for more.'); return null; }
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  RD.sel = null; closePop(); pageEls.forEach(el => el._pen.classList.remove('on', 'writing'));
  const need = single ? target : target + 1;
  const extend = () => { if (need > j.pages) j.pages = need; };
  if (!animOn()) { extend(); RD.n = target; renderReader(); j.last = RD.n; saveLib(); sfx('flip'); return 'instant'; }
  const gL = geomOf(pageEls[0]), gR = single ? null : geomOf(pageEls[1]);
  const oldS = single ? [snapPage(pageEls[0])] : [snapPage(pageEls[0]), snapPage(pageEls[1])];
  extend(); RD.n = target; renderReader(true);
  pageEls.forEach(el => { if (!el.classList.contains('is-end')) renderDoodles(el, state.pages.get(pageKey(j.id, +el.dataset.n))); });
  const newS = single ? [snapPage(pageEls[0])] : [snapPage(pageEls[0]), snapPage(pageEls[1])];
  const T = { dir, oldN, oldPages, j, p: 0, mode: '' };
  const spec = s => ({ snap: s, paper: s._paper });
  let under = null;
  if (single) {
    if (dir > 0) { T.mode = 'fwd-single'; T.leaf = buildLeaf(gL, spec(oldS[0]), Object.assign(spec(oldS[0]), { ghost: true }), 1); }
    else { T.mode = 'back-single'; under = placeUnder(oldS[0], gL); T.leaf = buildLeaf(gL, spec(newS[0]), Object.assign(spec(newS[0]), { ghost: true }), 1); }
  } else if (dir > 0) { T.mode = 'fwd'; under = placeUnder(oldS[0], gL); T.leaf = buildLeaf(gR, spec(oldS[1]), spec(newS[0]), 1); }
  else { T.mode = 'back'; under = placeUnder(oldS[1], gR); T.leaf = buildLeaf(gL, spec(oldS[0]), spec(newS[1]), -1); }
  T.under = under; T.shadow = h('div', { class: 'tl-shadow', 'aria-hidden': 'true' });
  const sp = $('#spread'); if (under) sp.append(under); sp.append(T.shadow, T.leaf.root);
  fixScroll(sp);
  setTurn(T, 0);
  TURN.cur = T; sfx('flip');
  return T;
}
function animateTurn(T, to, dur, done, curve) {
  const from = T.p, t0 = performance.now();
  const ez = curve === 'out' ? (t => 1 - Math.pow(1 - t, 3)) : (t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const stepFn = now => {
    const t = Math.min(1, (now - t0) / Math.max(60, dur));
    setTurn(T, from + (to - from) * ez(t));
    if (t < 1) T.raf = requestAnimationFrame(stepFn); else done();
  };
  T.raf = requestAnimationFrame(stepFn);
}
function finishTurn(T, commit) {
  cancelAnimationFrame(T.raf);
  [T.leaf && T.leaf.root, T.under, T.shadow].forEach(n => n && n.remove());
  TURN.cur = null;
  if (commit) { T.j.last = RD.n; saveLib(); sfx('land'); }
  else { T.j.pages = T.oldPages; RD.n = T.oldN; renderReader(true); }
  updateCount();
}
function turn(dir) {
  if (TURN.cur || !curJ()) return;
  const T = startTurn(dir); if (!T || T === 'instant') return;
  animateTurn(T, 1, turnDur(), () => finishTurn(T, true));
}
function goTo(n) {
  const j = curJ(); if (!j || TURN.cur) return;
  n = clamp(Math.round(n) || 1, 1, Math.min(MAX_PAGES, Math.max(j.pages, n)));
  const single = !spreadMode(); const newN = single ? n : (n % 2 ? n : n - 1);
  if (newN === RD.n) return;
  const T = startTurn(newN > RD.n ? 1 : -1, newN); if (!T || T === 'instant') return;
  animateTurn(T, 1, turnDur() * .85, () => finishTurn(T, true));
}

/* ---- finger and mouse gestures ---- */
function bindSwipe() {
  const book = $('#book');
  book.addEventListener('pointerdown', e => {
    if (!RD.open || RD.drawing || TURN.cur || e.button > 0) return;
    const corner = e.target.closest('.corner');
    if (!corner && e.target.closest('.it, .it-bar, button, input, .p-mood, .p-date')) return;
    const pg = e.target.closest('.page'); if (!pg || pg.classList.contains('snap')) return;
    const r = pg.getBoundingClientRect(); const single = !spreadMode(); const side = pg.dataset.side;
    const mouse = e.pointerType === 'mouse';
    const nearR = r.right - e.clientX < 46, nearL = e.clientX - r.left < 46;
    if (mouse && !corner && !(single ? (nearR || nearL) : (side === 'R' ? nearR : nearL))) return;
    TURN.gesture = { id: e.pointerId, x0: e.clientX, y0: e.clientY, lastX: e.clientX, lastT: performance.now(), v: 0, mouse, pw: r.width, started: false, corner: corner ? +corner.dataset.dir : 0 };
    if (mouse) e.preventDefault();
  }, true);
  window.addEventListener('pointermove', e => {
    const g = TURN.gesture; if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0, now = performance.now();
    g.v = g.v * .5 + .5 * ((e.clientX - g.lastX) / Math.max(1, now - g.lastT)); g.lastX = e.clientX; g.lastT = now;
    if (!g.started) {
      if (Math.abs(dx) < 9 || Math.abs(dx) < Math.abs(dy) * 1.25) { if (!g.mouse && Math.abs(dy) > 18) TURN.gesture = null; return; }
      const dir = dx < 0 ? 1 : -1;
      const T = startTurn(dir); if (!T || T === 'instant') { TURN.gesture = null; return; }
      g.started = true; g.T = T; g.dir = dir; g.x0 = e.clientX + (dir > 0 ? 6 : -6);
      $('#reader').classList.add('turning');
    }
    const span = g.pw * (spreadMode() ? 1.3 : 1.0);
    setTurn(g.T, clamp((g.dir > 0 ? g.x0 - e.clientX : e.clientX - g.x0) / span, 0, 1));
    if (Math.random() < .08) sfx('rustle');
  }, { passive: true });
  const up = e => {
    const g = TURN.gesture; if (!g || e.pointerId !== g.id) return; TURN.gesture = null;
    $('#reader').classList.remove('turning');
    if (!g.started) { if (g.corner) turn(g.corner); return; }
    const T = g.T; const speed = g.dir > 0 ? -g.v : g.v;
    const commit = T.p > .32 || (speed > .3 && T.p > .03);
    const rem = commit ? 1 - T.p : T.p;
    const dur = clamp(rem * turnDur() * (speed > .3 ? .55 : .8), 120, 900);
    animateTurn(T, commit ? 1 : 0, dur, () => finishTurn(T, commit), 'out');
  };
  window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  // trackpad / mouse wheel sideways swipes
  let wheelAcc = 0, wheelT = 0;
  book.addEventListener('wheel', e => {
    if (!RD.open || RD.drawing || TURN.cur) return;
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.5) return;
    e.preventDefault(); const now = performance.now(); if (now - wheelT > 400) wheelAcc = 0; wheelT = now;
    wheelAcc += e.deltaX; if (Math.abs(wheelAcc) > 90) { const d = wheelAcc > 0 ? 1 : -1; wheelAcc = 0; turn(d); }
  }, { passive: false });
}

/* =====================================================================
   Room styling: wall colour, wood, lamp warmth
   ===================================================================== */
const WALLS = { sage: ['Sage', '#4C655F'], navy: ['Midnight navy', '#2E3B55'], blush: ['Dusty blush', '#A97E7A'], cream: ['Warm cream', '#CDBF9F'], charcoal: ['Charcoal', '#34343A'], forest: ['Forest', '#2F4A3A'], terracotta: ['Terracotta', '#9A5B45'], lilac: ['Lilac', '#7D6F92'] };
const WOODS = {
  walnut: ['Walnut', { base: '#6B4428', dark: '#331D0E', light: '#A06C43' }, { base: '#5B3B24', dark: '#2A170B', light: '#8C613E' }],
  oak: ['Light oak', { base: '#B5874F', dark: '#7A5326', light: '#D9AE72' }, { base: '#A57B48', dark: '#6B4820', light: '#C99D63' }],
  ebony: ['Ebony', { base: '#33251C', dark: '#140C07', light: '#5A4232' }, { base: '#2B1F18', dark: '#110A06', light: '#4C392C' }],
  white: ['Whitewashed', { base: '#CDBDA6', dark: '#9C8A72', light: '#EDE2D2' }, { base: '#BFAE96', dark: '#8E7C64', light: '#DDD0BD' }],
  cherry: ['Cherry', { base: '#7A3A26', dark: '#3F180C', light: '#A85C3E' }, { base: '#6A3322', dark: '#35130A', light: '#94513A' }]
};
const LAMPS = { warm: ['Warm', 0xffc98a, 0xffb870], neutral: ['Neutral', 0xfff0d8, 0xffe2b8], cool: ['Cool', 0xdce8ff, 0xc8dcff], amber: ['Amber', 0xff9f4a, 0xff8a30] };
function applyRoomStyle() {
  if (!R3 || !R3.mats) return;
  const st = S();
  const wall = (WALLS[st.wall] || WALLS.sage)[1];
  if (R3.mats.wallBase !== wall) {
    R3.mats.wallBase = wall;
    const t = tex(makeCanvas(512, 512, (c, W, H) => drawWall(c, W, H, wall)), [7, 2.4]);
    if (R3.mats.wall.map) R3.mats.wall.map.dispose(); R3.mats.wall.map = t; R3.mats.wall.needsUpdate = true;
  }
  const wd = WOODS[st.wood] || WOODS.walnut;
  if (R3.mats.woodKey !== st.wood) {
    R3.mats.woodKey = st.wood;
    const desk = tex(makeCanvas(1024, 512, (c, W, H) => drawWood(c, W, H, Object.assign({ planks: 1, seed: 8 }, wd[1]))));
    const shelf = tex(makeCanvas(1024, 256, (c, W, H) => drawWood(c, W, H, Object.assign({ planks: 1, seed: 12 }, wd[1]))));
    const floor = tex(makeCanvas(1024, 1024, (c, W, H) => drawWood(c, W, H, Object.assign({ planks: 8, seed: 4 }, wd[2]))), [3, 3]);
    [['desk', desk], ['shelf', shelf], ['floor', floor]].forEach(([k, t]) => { const m = R3.mats[k]; if (!m) return; if (m.map) m.map.dispose(); m.map = t; m.needsUpdate = true; });
  }

  // Wood Finish (FINISH_STYLES and POT_STYLES store rough/metal; reading roughness/metalness gave undefined, which renders black)
  if (typeof FINISH_STYLES !== 'undefined') {
    const fin = FINISH_STYLES[st.woodFinish] || FINISH_STYLES.satin;
    if (R3.mats.desk) { R3.mats.desk.roughness = fin.rough; R3.mats.desk.metalness = fin.metal; R3.mats.desk.needsUpdate = true; }
    if (R3.mats.shelf) { R3.mats.shelf.roughness = fin.rough; R3.mats.shelf.metalness = fin.metal; R3.mats.shelf.needsUpdate = true; }
  }

  // Lamp tone & styles
  const lp = LAMPS[st.lampTone] || LAMPS.warm;
  R3.spot.color.setHex(lp[1]); R3.glow.color.setHex(lp[2]);
  if (typeof LAMP_STYLES !== 'undefined') {
    const ls = LAMP_STYLES[st.lampStyle] || LAMP_STYLES.banker;
    if (R3.lampShadeMat) {
      R3.lampShadeMat.color.set(ls.shade);
      R3.lampShadeMat.metalness = ls.metalness || .3;
      R3.lampShadeMat.roughness = ls.roughness || .45;
      R3.lampShadeMat.needsUpdate = true;
    }
    if (R3.lampBaseMat) {
      R3.lampBaseMat.color.set(ls.shade);
      R3.lampBaseMat.metalness = ls.metalness || .35;
      R3.lampBaseMat.roughness = ls.roughness || .4;
      R3.lampBaseMat.needsUpdate = true;
    }
    if (R3.lampBrass) {
      R3.lampBrass.color.set(ls.accent || '#B3893C');
      R3.lampBrass.needsUpdate = true;
    }
  }

  // Plant Pot styles
  if (typeof POT_STYLES !== 'undefined') {
    const ps = POT_STYLES[st.potStyle] || POT_STYLES.terracotta;
    if (R3.potMat) {
      R3.potMat.color.set(ps.color);
      R3.potMat.roughness = ps.rough;
      R3.potMat.metalness = ps.metal || 0;
      R3.potMat.needsUpdate = true;
    }
    if (R3.shelfPotMat) {
      R3.shelfPotMat.color.set(ps.color);
      R3.shelfPotMat.roughness = ps.rough;
      R3.shelfPotMat.metalness = ps.metal || 0;
      R3.shelfPotMat.needsUpdate = true;
    }
  }

  // Wall Art style
  if (R3.artCanvas && R3.artTex && typeof drawArt === 'function') {
    const curStyle = st.artStyle || 'modernist';
    if (R3.curArtStyle !== curStyle) {
      R3.curArtStyle = curStyle;
      drawArt(R3.artCanvas.getContext('2d'), 300, 400, curStyle);
      R3.artTex.needsUpdate = true;
    }
  }

  // Weather & Atmosphere
  applyWeather();

  // Window & Curtains
  R3.winAngleG = st.windowOpen ? 1.05 : 0;
  R3.curtOpenG = st.curtainsOpen !== false ? 1 : 0;
  if (R3.curtMat && typeof CURTAIN_COLORS !== 'undefined') {
    // entries are [name, colour, shade]; the old code tinted the material with entry.color (undefined), i.e. black
    const key = CURTAIN_COLORS[st.curtainColor] ? st.curtainColor : 'ochre';
    if (R3.mats.curtKey !== key) {
      R3.mats.curtKey = key;
      const t = tex(makeCanvas(128, 256, (c, W, H) => drawCurtain(c, W, H, CURTAIN_COLORS[key][1])));
      if (R3.curtMat.map) R3.curtMat.map.dispose(); R3.curtMat.map = t; R3.curtMat.needsUpdate = true;
    }
  }

  // Clock
  if (R3.clock) {
    R3.clock.visible = st.showClock !== false;
  }
  if (R3.clockRimMat && typeof CLOCK_STYLES !== 'undefined') {
    const cs = CLOCK_STYLES[st.clockStyle] || CLOCK_STYLES.daybook;
    R3.clockRimMat.color.set(cs.rim);
  }
  if (R3.clockCv && R3.clockTex && typeof drawClock === 'function') {
    drawClock(R3.clockCv.getContext('2d'), 256, st.clockStyle || 'daybook', st.clockMode || 'analog');
    R3.clockTex.needsUpdate = true;
  }

  // Movable Objects Visibility and Arrangement
  if (R3.movables) {
    const vis = st.visibleObjects || {};
    const layout = st.objectLayout || {};
    for (const [id, m] of R3.movables.entries()) {
      if (m.group) {
        m.group.visible = (vis[id] !== false);
        if (layout[id]) {
          m.group.position.set(layout[id].x, layout[id].y, layout[id].z);
          if (layout[id].rotY !== undefined) m.group.rotation.y = layout[id].rotY;
        } else if (m.basePos) {
          m.group.position.copy(m.basePos);
          m.group.rotation.y = m.baseRotY || 0;
        }
      }
    }
  }
}

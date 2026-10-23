/* =====================================================================
   3D room
   ===================================================================== */
const T3 = window.THREE;
let R3 = null;
const DESK_TOP = .78, SHELF_Y = [1.235, 1.595], SHELF_FRONT = -1.75, SHELF_HALF = .79;

function tex(canvas, rep) {
  const t = new T3.CanvasTexture(canvas); t.encoding = T3.sRGBEncoding; t.anisotropy = R3 ? R3.aniso : 4;
  if (rep) { t.wrapS = t.wrapT = T3.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
function stdMat(o) {
  const def = { roughness: .7, metalness: 0 };
  const merged = Object.assign(def, o);
  if (merged.roughness === undefined) merged.roughness = .7;
  return new T3.MeshStandardMaterial(merged);
}
function addMesh(geo, mat, x, y, z, parent, opt) {
  const m = new T3.Mesh(geo, mat); m.position.set(x, y, z);
  m.castShadow = !(opt && opt.noCast); m.receiveShadow = true;
  (parent || R3.scene).add(m); return m;
}
function boxM(w, hh, d, mat, x, y, z, parent, opt) { return addMesh(new T3.BoxGeometry(w, hh, d), mat, x, y, z, parent, opt); }
function cylBetween(a, b, r, mat, parent) {
  const dir = new T3.Vector3().subVectors(b, a); const len = dir.length();
  const m = new T3.Mesh(new T3.CylinderGeometry(r, r, len, 12), mat);
  m.position.copy(a).addScaledVector(dir, .5);
  m.quaternion.setFromUnitVectors(new T3.Vector3(0, 1, 0), dir.normalize());
  m.castShadow = true; parent.add(m); return m;
}
function drawWood(c, W, H, o) {
  const r = rng(o.seed || 3); c.fillStyle = o.base; c.fillRect(0, 0, W, H);
  const rows = o.planks || 1, ph = H / rows;
  for (let p = 0; p < rows; p++) {
    const y0 = p * ph;
    c.fillStyle = r() < .5 ? 'rgba(0,0,0,' + (r() * .12).toFixed(3) + ')' : 'rgba(255,255,255,' + (r() * .06).toFixed(3) + ')'; c.fillRect(0, y0, W, ph);
    const lines = Math.floor(ph / 2);
    for (let i = 0; i < lines; i++) {
      const y = y0 + r() * ph, amp = 1 + r() * 3, fr = .004 + r() * .01, ph2 = r() * 6;
      c.strokeStyle = r() < .65 ? o.dark : o.light; c.globalAlpha = .06 + r() * .16; c.lineWidth = .5 + r() * 1.3;
      c.beginPath(); for (let x = 0; x <= W; x += 8) { const yy = y + Math.sin(x * fr + ph2) * amp + Math.sin(x * fr * 3.1) * amp * .3; x ? c.lineTo(x, yy) : c.moveTo(x, yy); } c.stroke();
    }
    c.globalAlpha = 1;
    if (rows > 1) { c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(0, y0, W, 2); c.fillRect(r() * W, y0, 2, ph); }
  }
}
function drawWall(c, W, H, base) {
  c.fillStyle = base || '#4C655F'; c.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 32) { c.fillStyle = 'rgba(255,255,255,.035)'; c.fillRect(x, 0, 12, H); c.fillStyle = 'rgba(0,0,0,.03)'; c.fillRect(x + 22, 0, 2, H); }
  const r = rng(5);
  for (let i = 0; i < W * H / 30; i++) { c.fillStyle = r() < .5 ? 'rgba(0,0,0,.035)' : 'rgba(255,255,255,.025)'; c.fillRect(r() * W, r() * H, 1.5, 1.5); }
  c.fillStyle = 'rgba(240,226,190,.07)';
  for (let y = 16; y < H; y += 64) for (let x = 16 + ((y / 64) % 2) * 16; x < W; x += 32) { c.beginPath(); c.moveTo(x, y - 5); c.lineTo(x + 4, y); c.lineTo(x, y + 5); c.lineTo(x - 4, y); c.fill(); }
}
function drawCurtain(c, W, H, col) {
  c.fillStyle = col; c.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 3) { c.fillStyle = 'rgba(0,0,0,.05)'; c.fillRect(0, y, W, 1); }
  for (let x = 0; x < W; x += 16) { c.fillStyle = 'rgba(255,240,200,.09)'; c.fillRect(x, 0, 5, H); }
}
function drawSky(c, W, H, night) {
  const g = c.createLinearGradient(0, 0, 0, H);
  if (night) { g.addColorStop(0, '#040817'); g.addColorStop(.55, '#121C38'); g.addColorStop(1, '#202D4F'); }
  else { g.addColorStop(0, '#6BA8DE'); g.addColorStop(.6, '#B2D2EC'); g.addColorStop(1, '#E4EDF2'); }
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const r = rng(night ? 21 : 22);
  if (night) {
    // Stellar background & twinkling star clusters
    for (let i = 0; i < 130; i++) {
      const alpha = (.25 + r() * .75).toFixed(2);
      const isGold = r() < .2, isBlue = r() < .15;
      c.fillStyle = isGold ? `rgba(255,225,160,${alpha})` : isBlue ? `rgba(190,225,255,${alpha})` : `rgba(255,255,255,${alpha})`;
      const s = r() < .08 ? 2.5 : r() < .25 ? 1.8 : 1.1;
      const sx = r() * W, sy = r() * H * .65;
      c.fillRect(sx, sy, s, s);
      if (s > 2) {
        c.fillStyle = 'rgba(255,245,210,.18)';
        c.beginPath(); c.arc(sx + s / 2, sy + s / 2, s * 2, 0, 6.3); c.fill();
      }
    }
    // Glowing crescent / luminous moon with soft atmospheric aura
    const mx = W * .72, my = H * .2, mr = W * .075;
    const gl = c.createRadialGradient(mx, my, mr * .4, mx, my, mr * 3.8);
    gl.addColorStop(0, 'rgba(255,248,220,.42)'); gl.addColorStop(.5, 'rgba(255,245,200,.12)'); gl.addColorStop(1, 'rgba(255,245,200,0)');
    c.fillStyle = gl; c.fillRect(0, 0, W, H);
    c.fillStyle = '#FFF8E4'; c.beginPath(); c.arc(mx, my, mr, 0, 6.3); c.fill();
    c.fillStyle = 'rgba(215,205,175,.35)';
    c.beginPath(); c.arc(mx - mr * .32, my - mr * .18, mr * .24, 0, 6.3); c.fill();
    c.beginPath(); c.arc(mx + mr * .28, my + mr * .32, mr * .16, 0, 6.3); c.fill();
    c.beginPath(); c.arc(mx - mr * .05, my + mr * .4, mr * .12, 0, 6.3); c.fill();
  } else {
    // Daytime atmospheric cloud formations
    for (let i = 0; i < 9; i++) {
      const cx = r() * W, cy = H * (.08 + r() * .42), s = W * (.09 + r() * .14);
      c.fillStyle = 'rgba(255,255,255,.82)';
      for (let k = 0; k < 7; k++) {
        c.beginPath();
        c.ellipse(cx + (r() - .5) * s * 1.9, cy + (r() - .5) * s * .45, s * (.4 + r() * .45), s * (.22 + r() * .22), 0, 0, 6.3);
        c.fill();
      }
    }
  }
  // Skyline with warm windows and architectural details
  let x = 0;
  while (x < W) {
    const bw = W * (.06 + r() * .11), bh = H * (.13 + r() * .27);
    c.fillStyle = night ? '#0A0F21' : '#7D92A8'; c.fillRect(x, H - bh, bw, bh);
    // Rooftop antenna or water tank
    if (r() < .45) {
      c.fillStyle = night ? '#060A16' : '#697E94';
      c.fillRect(x + bw * .35, H - bh - 8, 2, 8);
      if (night && r() < .6) {
        c.fillStyle = 'rgba(255,80,60,.85)'; c.fillRect(x + bw * .35 - 1, H - bh - 10, 4, 3);
      }
    }
    // Lit windows
    if (night) {
      for (let yy = H - bh + 6; yy < H - 4; yy += 9) {
        for (let xx = x + 4; xx < x + bw - 4; xx += 8) {
          if (r() < .34) {
            const wGlow = (.4 + r() * .6).toFixed(2);
            c.fillStyle = r() < .2 ? `rgba(180,225,255,${wGlow})` : `rgba(255,214,130,${wGlow})`;
            c.fillRect(xx, yy, 3.2, 4.2);
          }
        }
      }
    }
    x += bw + 1;
  }
}
function drawClock(c, W, styleKey, mode) {
  const st = CLOCK_STYLES[styleKey] || CLOCK_STYLES.daybook;
  const isBrass = styleKey === 'brass';
  const isMinimal = styleKey === 'minimal';
  const isRoman = styleKey === 'roman';
  const isDigital = mode === 'digital';
  const isBoth = mode === 'both';

  c.save();
  // Face background
  c.fillStyle = isBrass ? '#EADCB5' : isMinimal ? '#FAF7F2' : isRoman ? '#EFE6D4' : '#F4EEE2';
  c.beginPath(); c.arc(W / 2, W / 2, W / 2, 0, 6.3); c.fill();
  c.translate(W / 2, W / 2);

  // Outer decorative rings
  c.strokeStyle = isBrass ? '#785A2D' : '#322E28';
  c.lineWidth = isMinimal ? 1 : 2;
  c.beginPath(); c.arc(0, 0, W * .48, 0, 6.3); c.stroke();
  if (!isMinimal) {
    c.lineWidth = 1;
    c.beginPath(); c.arc(0, 0, W * .46, 0, 6.3); c.stroke();
  }

  // Dial ticks
  c.fillStyle = isBrass ? '#423218' : '#2A2520';
  for (let i = 0; i < 60; i++) {
    c.save(); c.rotate(i * Math.PI / 30);
    const isMajor = i % 5 === 0;
    const len = isMajor ? (isMinimal ? W * .05 : W * .065) : W * .025;
    const wid = isMajor ? (isMinimal ? 2.5 : 3.5) : 1.2;
    c.fillRect(-wid / 2, -W * .46, wid, len);
    c.restore();
  }

  // Numerals
  if (!isDigital) {
    const ROMANS = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    const fontFam = st.font || 'Cormorant Garamond';
    c.font = isRoman ? `600 ${W * .095}px "${fontFam}", Georgia, serif` : isMinimal ? `700 ${W * .09}px "${fontFam}", sans-serif` : `600 ${W * .105}px "${fontFam}", Georgia, serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) {
      if (isMinimal && i % 3 !== 0) continue;
      const a = i * Math.PI / 6;
      const text = isRoman ? ROMANS[i % 12] : String(i);
      c.fillText(text, Math.sin(a) * W * .34, -Math.cos(a) * W * .34);
    }
  }

  // Branding signature
  if (!isDigital && !isMinimal) {
    c.font = 'italic 500 ' + (W * .065) + 'px "Cormorant Garamond", Georgia, serif';
    c.fillText('Daybook', 0, isBoth ? -W * .18 : W * .16);
  }

  // Digital display window if mode is digital or both
  if (isDigital || isBoth) {
    const d = new Date();
    const hr = d.getHours();
    const min = String(d.getMinutes()).padStart(2, '0');
    const sec = String(d.getSeconds()).padStart(2, '0');
    const ampm = hr >= 12 ? 'PM' : 'AM';
    const h12 = hr % 12 || 12;
    const timeStr = `${h12}:${min}:${sec} ${ampm}`;

    const dw = W * (isDigital ? .68 : .52);
    const dh = W * (isDigital ? .28 : .15);
    const dy = isDigital ? -dh / 2 : W * .14;

    c.fillStyle = '#18161E';
    c.beginPath();
    c.roundRect ? c.roundRect(-dw / 2, dy, dw, dh, 6) : c.rect(-dw / 2, dy, dw, dh);
    c.fill();
    c.strokeStyle = '#484236'; c.lineWidth = 1.5; c.stroke();

    c.fillStyle = isBrass ? '#FFAE42' : '#E8BE65';
    c.font = `700 ${dh * (isDigital ? .46 : .55)}px "Manrope", monospace`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(timeStr, 0, dy + dh / 2);
  }

  c.restore();
}
function drawArt(c, W, H, styleKey) {
  const style = styleKey || (typeof S === 'function' && S().artStyle) || 'modernist';
  c.fillStyle = '#E9E1D0'; c.fillRect(0, 0, W, H);
  if (style === 'minimalist') {
    c.fillStyle = '#D4C8B5'; c.fillRect(0, H * .45, W, H * .55);
    c.fillStyle = '#7A8C82'; c.beginPath(); c.arc(W * .5, H * .45, W * .22, Math.PI, 0); c.fill();
    c.strokeStyle = '#2B332E'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(W * .15, H * .45); c.lineTo(W * .85, H * .45); c.stroke();
  } else if (style === 'botanical') {
    c.fillStyle = '#F2ECE1'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#284E3A'; c.lineWidth = 3.5;
    c.beginPath(); c.moveTo(W * .5, H * .85); c.quadraticCurveTo(W * .52, H * .5, W * .48, H * .2); c.stroke();
    c.fillStyle = '#3F7A4E';
    for (let i = 0; i < 6; i++) {
      const y = H * .3 + i * H * .09;
      const side = (i % 2 === 0 ? 1 : -1);
      c.beginPath();
      c.ellipse(W * .5 + side * W * .14, y, W * .11, H * .035, side * .4, 0, 6.3);
      c.fill();
    }
  } else if (style === 'abstract') {
    c.fillStyle = '#2A3B4C'; c.fillRect(W * .1, H * .1, W * .4, H * .35);
    c.fillStyle = '#C86D51'; c.beginPath(); c.arc(W * .65, H * .3, W * .2, 0, 6.3); c.fill();
    c.fillStyle = '#D9A74A'; c.fillRect(W * .2, H * .5, W * .65, H * .35);
    c.strokeStyle = '#1D242B'; c.lineWidth = 3; c.strokeRect(W * .2, H * .5, W * .65, H * .35);
  } else {
    // modernist
    c.fillStyle = '#C8893B'; c.beginPath(); c.arc(W * .38, H * .4, W * .26, 0, 6.3); c.fill();
    c.fillStyle = '#2F4F6B'; c.beginPath(); c.arc(W * .66, H * .62, W * .2, Math.PI, 0); c.fill(); c.fillRect(W * .46, H * .62, W * .4, H * .14);
    c.strokeStyle = '#1E1C22'; c.lineWidth = W * .012; c.beginPath(); c.moveTo(W * .12, H * .82); c.bezierCurveTo(W * .4, H * .6, W * .6, H * .95, W * .9, H * .74); c.stroke();
    c.fillStyle = '#9C3D35'; c.fillRect(W * .62, H * .14, W * .1, W * .1);
  }
}
function drawRug(c, W, H) {
  c.fillStyle = '#6A2C2A'; c.fillRect(0, 0, W, H);
  c.strokeStyle = '#D8C49C'; c.lineWidth = 6; c.strokeRect(14, 14, W - 28, H - 28); c.lineWidth = 2; c.strokeRect(26, 26, W - 52, H - 52);
  c.fillStyle = '#2E3D5A'; c.beginPath(); c.ellipse(W / 2, H / 2, W * .22, H * .3, 0, 0, 6.3); c.fill();
  c.strokeStyle = '#D8C49C'; c.lineWidth = 3; c.beginPath(); c.ellipse(W / 2, H / 2, W * .16, H * .21, 0, 0, 6.3); c.stroke();
  const r = rng(9); for (let i = 0; i < W * H / 20; i++) { c.fillStyle = 'rgba(0,0,0,.08)'; c.fillRect(r() * W, r() * H, 2, 1); }
}
function drawGrille(c, W, H) {
  c.fillStyle = '#D9CDB4'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#3A2F28'; c.beginPath(); c.arc(W * .32, H * .5, H * .36, 0, 6.3); c.fill();
  c.fillStyle = '#5A4A3E'; for (let y = H * .18; y < H * .84; y += 6) for (let x = W * .12; x < W * .52; x += 6) { if (Math.hypot(x - W * .32, y - H * .5) < H * .33) { c.beginPath(); c.arc(x, y, 1.6, 0, 6.3); c.fill(); } }
  c.fillStyle = '#F2E9D6'; c.fillRect(W * .6, H * .3, W * .32, H * .2);
  c.fillStyle = '#7A1F2B'; c.fillRect(W * .72, H * .3, 2, H * .2);
  c.fillStyle = '#3A2F28'; c.font = '600 ' + (H * .1) + 'px Manrope, sans-serif'; c.fillText('88  96  104', W * .61, H * .42);
}
function drawEdges(c, W, H, color) {
  c.fillStyle = '#EEE6D3'; c.fillRect(0, 0, W, H);
  const r = rng(hashStr(color));
  for (let x = 0; x < W; x += 1.5) { c.fillStyle = 'rgba(80,60,30,' + (r() * .14) + ')'; c.fillRect(x, 0, .8, H); }
  c.fillStyle = color; c.fillRect(0, 0, W * .07, H); c.fillRect(W * .93, 0, W * .07, H);
}

function init3D() {
  if (!T3) return false;
  const canvas = $('#scene');
  let renderer;
  try { renderer = new T3.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); } catch (e) { return false; }
  const mobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 700;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.6 : 2));
  renderer.outputEncoding = T3.sRGBEncoding;
  renderer.toneMapping = T3.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T3.PCFSoftShadowMap;
  const scene = new T3.Scene(); scene.background = new T3.Color('#0D0C12');
  const camera = new T3.PerspectiveCamera(42, 1, .05, 40);
  R3 = {
    renderer, scene, camera, mobile, aniso: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
    books: new Map(), picks: [], plus: null, hover: null, booted: false,
    movables: new Map(),
    arrange: { active: false, selected: null, hovered: null, plane: null, isDragging: false },
    rain: null,
    clouds: null,
    hoverMesh: null,
    lampShadeMat: null, lampArmMat: null, potMat: null, globeGimbalMat: null, artCanvas: null,
    globeGroup: null, plantGroup: null, radioGroup: null, cupGroup: null, mugGroup: null,
    cam: {
      mode: 'room', // 'room', 'tour', 'peek', 'desk', 'explore'
      pos: new T3.Vector3(0, 1.3, 0.45),
      target: new T3.Vector3(0, 1.3, -1.75),
      fromPos: new T3.Vector3(),
      fromTarget: new T3.Vector3(),
      toPos: new T3.Vector3(),
      toTarget: new T3.Vector3(),
      t: 1, dur: 1.1, onDone: null,
      baseTarget: new T3.Vector3(0, 1.3, -1.75),
      baseDist: 2.2,
      yaw: 0, pitch: 0, yawG: 0, pitchG: 0, yawLim: .22,
      blend: 0, blendG: 0,
      explore: {
        pos: new T3.Vector3(0, 1.44, -.88),
        vel: new T3.Vector3(),
        yaw: 0, pitch: 0, yawG: 0, pitchG: 0,
        keys: { w: false, a: false, s: false, d: false }
      }
    },
    night: 0, nightG: 0, nightShown: false, skyCheck: 0, lamp: 1, lampG: 1,
    winAngle: 0, winAngleG: 0,
    curtOpen: 1, curtOpenG: 1,
    lastClockDraw: 0,
    raycaster: new T3.Raycaster(), ndc: new T3.Vector2(), last: performance.now(), paused: false
  };
  buildRoom();
  resize3D();
  bindPointer();
  renderer.setAnimationLoop(frame);
  return true;
}

function buildRoom() {
  const scn = R3.scene;
  // Lights
  R3.hemi = new T3.HemisphereLight(0xdfe8ff, 0x3a2e24, .55); scn.add(R3.hemi);
  const sun = new T3.DirectionalLight(0xfff1dc, 1.3); sun.position.set(2.4, 3.3, 1.4); sun.target.position.set(0, .9, -1.6);
  sun.castShadow = true; sun.shadow.mapSize.set(R3.mobile ? 1024 : 2048, R3.mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -2.4, right: 2.4, top: 2.4, bottom: -1.2, near: .5, far: 9 });
  sun.shadow.bias = -.0004; sun.shadow.normalBias = .02;
  scn.add(sun); scn.add(sun.target); R3.sun = sun;
  R3.winLight = new T3.PointLight(0xcfe0ff, .5, 4.5, 2); R3.winLight.position.set(1.45, 1.55, -1.55); scn.add(R3.winLight);

  // Floor, walls, rug
  const floorTex = tex(makeCanvas(1024, 1024, (c, W, H) => drawWood(c, W, H, { base: '#5B3B24', dark: '#2A170B', light: '#8C613E', planks: 8, seed: 4 })), [3, 3]);
  const floor = addMesh(new T3.PlaneGeometry(12, 12), stdMat({ map: floorTex, roughness: .72 }), 0, 0, 0, null, { noCast: true }); floor.rotation.x = -Math.PI / 2;
  R3.mats = { floor: floor.material };
  const wallTex = tex(makeCanvas(512, 512, drawWall), [7, 2.4]);
  const wallMat = stdMat({ map: wallTex, roughness: .9 }); R3.mats.wall = wallMat;
  const back = addMesh(new T3.PlaneGeometry(14, 3.4), wallMat, 0, 1.7, -2, null, { noCast: true });
  const left = addMesh(new T3.PlaneGeometry(8, 3.4), wallMat, -4.2, 1.7, 1, null, { noCast: true }); left.rotation.y = Math.PI / 2;
  const right = addMesh(new T3.PlaneGeometry(8, 3.4), wallMat, 4.2, 1.7, 1, null, { noCast: true }); right.rotation.y = -Math.PI / 2;
  void back;
  boxM(14, .9, .03, stdMat({ color: '#2C3D39', roughness: .8 }), 0, .45, -1.985, null, { noCast: true });
  boxM(14, .045, .05, stdMat({ color: '#E3DDCF', roughness: .6 }), 0, .92, -1.975);
  boxM(14, .1, .03, stdMat({ color: '#E3DDCF', roughness: .6 }), 0, .05, -1.98);
  const rug = addMesh(new T3.PlaneGeometry(2.4, 1.5), stdMat({ map: tex(makeCanvas(512, 320, drawRug)), roughness: .95 }), 0, .003, -.85, null, { noCast: true }); rug.rotation.x = -Math.PI / 2;

  // Window Assembly
  const win = new T3.Group(); win.position.set(1.48, 1.5, -1.99); scn.add(win); R3.win = win;
  const skyDay = tex(makeCanvas(390, 500, (c, W, H) => drawSky(c, W, H, false)));
  const skyNight = tex(makeCanvas(390, 500, (c, W, H) => drawSky(c, W, H, true)));
  const glassG = new T3.PlaneGeometry(.78, 1.0);
  const day = new T3.Mesh(glassG, new T3.MeshBasicMaterial({ map: skyDay, toneMapped: false })); day.position.z = .002; win.add(day);
  R3.nightGlass = new T3.Mesh(glassG, new T3.MeshBasicMaterial({ map: skyNight, toneMapped: false, transparent: true, opacity: 0 })); R3.nightGlass.position.z = .004; win.add(R3.nightGlass);
  // drawn first of the see-through parts: the sashes in front write depth, and seen from the side three.js sorted them
  // first, so the day sky showed through them at night
  R3.nightGlass.renderOrder = -2;
  const frameMat = stdMat({ color: '#E8E2D6', roughness: .55 });
  boxM(.88, .05, .06, frameMat, 0, .525, .02, win); boxM(.88, .05, .06, frameMat, 0, -.525, .02, win);
  boxM(.05, 1.1, .06, frameMat, -.415, 0, .02, win); boxM(.05, 1.1, .06, frameMat, .415, 0, .02, win);
  boxM(.025, 1.0, .03, frameMat, 0, 0, .02, win);
  boxM(.98, .035, .14, frameMat, 0, -.565, .06, win);

  // Hinged Casement Sashes (Left and Right)
  const paneMat = new T3.MeshStandardMaterial({ color: 0xffffff, roughness: .12, metalness: .1, transparent: true, opacity: .3, side: T3.DoubleSide });
  const sashBrass = stdMat({ color: '#B3893C', metalness: .6, roughness: .35 });

  // Left casement pivoted at left edge (x = -0.385)
  const winLeft = new T3.Group(); winLeft.position.set(-.385, 0, .025); win.add(winLeft); R3.winLeft = winLeft;
  boxM(.36, .028, .025, frameMat, .185, .47, 0, winLeft);
  boxM(.36, .028, .025, frameMat, .185, -.47, 0, winLeft);
  boxM(.028, .96, .025, frameMat, .015, 0, 0, winLeft);
  boxM(.028, .96, .025, frameMat, .36, 0, 0, winLeft);
  boxM(.33, .016, .016, frameMat, .185, .08, 0, winLeft);
  const paneL = new T3.Mesh(new T3.PlaneGeometry(.33, .93), paneMat); paneL.position.set(.185, 0, .002); winLeft.add(paneL);
  const handleL = new T3.Mesh(new T3.CylinderGeometry(.005, .005, .035, 10), sashBrass); handleL.position.set(.36, .08, .018); winLeft.add(handleL);
  [-.34, .34].forEach(hy => { const hg = new T3.Mesh(new T3.CylinderGeometry(.006, .006, .03, 10), sashBrass); hg.position.set(0, hy, 0); winLeft.add(hg); });

  // Right casement pivoted at right edge (x = 0.385)
  const winRight = new T3.Group(); winRight.position.set(.385, 0, .025); win.add(winRight); R3.winRight = winRight;
  boxM(.36, .028, .025, frameMat, -.185, .47, 0, winRight);
  boxM(.36, .028, .025, frameMat, -.185, -.47, 0, winRight);
  boxM(.028, .96, .025, frameMat, -.015, 0, 0, winRight);
  boxM(.028, .96, .025, frameMat, -.36, 0, 0, winRight);
  boxM(.33, .016, .016, frameMat, -.185, .08, 0, winRight);
  const paneR = new T3.Mesh(new T3.PlaneGeometry(.33, .93), paneMat); paneR.position.set(-.185, 0, .002); winRight.add(paneR);
  const handleR = new T3.Mesh(new T3.CylinderGeometry(.005, .005, .035, 10), sashBrass); handleR.position.set(-.36, .08, .018); winRight.add(handleR);
  [-.34, .34].forEach(hy => { const hg = new T3.Mesh(new T3.CylinderGeometry(.006, .006, .03, 10), sashBrass); hg.position.set(0, hy, 0); winRight.add(hg); });

  [day, R3.nightGlass, paneL, paneR].forEach(m => { m.userData.act = { type: 'window' }; R3.picks.push(m); });
  winLeft.traverse(o => { if (o.isMesh) { o.userData.act = { type: 'window' }; R3.picks.push(o); } });
  winRight.traverse(o => { if (o.isMesh) { o.userData.act = { type: 'window' }; R3.picks.push(o); } });

  // Curtains: the fabric colour lives in the texture (applyRoomStyle redraws it when the colour changes)
  R3.mats.curtKey = CURTAIN_COLORS[S().curtainColor] ? S().curtainColor : 'ochre';
  const curtTex = tex(makeCanvas(128, 256, (c, W, H) => drawCurtain(c, W, H, CURTAIN_COLORS[R3.mats.curtKey][1])));
  const curtMat = stdMat({ map: curtTex, roughness: .95, side: T3.DoubleSide }); R3.curtMat = curtMat;

  const mkCurtainMesh = () => {
    const g = new T3.PlaneGeometry(.38, 1.62, 20, 2); const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 55) * .022);
    g.computeVertexNormals();
    const m = addMesh(g, curtMat, 0, 0, 0, null);
    m.userData.act = { type: 'curtains' };
    return m;
  };

  const curtLeft = new T3.Group(); curtLeft.position.set(-.45, .02, .075); win.add(curtLeft); R3.curtLeft = curtLeft;
  const curtLMesh = mkCurtainMesh(); curtLeft.add(curtLMesh);
  const curtRight = new T3.Group(); curtRight.position.set(.45, .02, .075); win.add(curtRight); R3.curtRight = curtRight;
  const curtRMesh = mkCurtainMesh(); curtRight.add(curtRMesh);

  [curtLMesh, curtRMesh].forEach(m => R3.picks.push(m));
  cylBetween(new T3.Vector3(-.74, .84, .1), new T3.Vector3(.74, .84, .1), .012, stdMat({ color: '#2B2724', metalness: .5, roughness: .4 }), win);

  // Clock + art
  const clock = new T3.Group(); clock.position.set(-1.34, 1.84, -1.965); scn.add(clock); R3.clock = clock;
  const cst = S().clockStyle || 'daybook';
  const cstObj = CLOCK_STYLES[cst] || CLOCK_STYLES.daybook;
  R3.clockCv = makeCanvas(256, 256, (c, W) => drawClock(c, W, cst, S().clockMode || 'analog'));
  R3.clockTex = tex(R3.clockCv);
  const face = new T3.Mesh(new T3.CircleGeometry(.15, 48), stdMat({ map: R3.clockTex, roughness: .5 })); face.position.z = .012; clock.add(face); R3.clockFace = face;
  R3.clockRimMat = stdMat({ color: cstObj.rim || '#2B2420', roughness: .45, metalness: .35 });
  const rim = new T3.Mesh(new T3.TorusGeometry(.155, .014, 12, 48), R3.clockRimMat); rim.position.z = .012; rim.castShadow = true; clock.add(rim); R3.clockRim = rim;
  const handMat = stdMat({ color: '#1A1714', roughness: .4 });
  const mkHand = (len, w) => { const g = new T3.Group(); const m = new T3.Mesh(new T3.BoxGeometry(w, len, .004), handMat); m.position.y = len / 2 - .012; g.add(m); g.position.z = .018; clock.add(g); return g; };
  R3.hHour = mkHand(.075, .009); R3.hMin = mkHand(.115, .006); R3.hSec = mkHand(.12, .002);
  face.userData.act = { type: 'clock' }; rim.userData.act = { type: 'clock' }; R3.picks.push(face, rim);

  const art = new T3.Group(); art.position.set(-1.34, 1.22, -1.97); scn.add(art);
  boxM(.44, .56, .03, stdMat({ color: '#2A1E17', roughness: .55 }), 0, 0, 0, art);
  R3.artCanvas = makeCanvas(300, 400, (c, W, H) => drawArt(c, W, H, S().artStyle || 'modernist'));
  R3.artTex = tex(R3.artCanvas);
  R3.artMat = stdMat({ map: R3.artTex, roughness: .85 });
  const artP = new T3.Mesh(new T3.PlaneGeometry(.36, .48), R3.artMat); artP.position.z = .017; art.add(artP);
  art.traverse(o => { if (o.isMesh) { o.userData.act = { type: 'art' }; R3.picks.push(o); } });

  // Desk
  const deskTex = tex(makeCanvas(1024, 512, (c, W, H) => drawWood(c, W, H, { base: '#6B4428', dark: '#331D0E', light: '#A06C43', planks: 1, seed: 8 })));
  const deskMat = stdMat({ map: deskTex, roughness: .5 }); R3.mats.desk = deskMat;
  boxM(1.7, .05, .72, deskMat, 0, DESK_TOP - .025, -1.62);
  [[-.8, -1.31], [.8, -1.31], [-.8, -1.93], [.8, -1.93]].forEach(([x, z]) => boxM(.05, DESK_TOP - .05, .05, deskMat, x, (DESK_TOP - .05) / 2, z));
  boxM(1.55, .07, .02, deskMat, 0, DESK_TOP - .085, -1.275);
  boxM(.44, .2, .66, deskMat, .56, DESK_TOP - .15, -1.62);
  boxM(.4, .15, .015, stdMat({ map: deskTex, roughness: .45 }), .56, DESK_TOP - .15, -1.285);
  addMesh(new T3.SphereGeometry(.014, 12, 10), stdMat({ color: '#B8903F', metalness: .7, roughness: .3 }), .56, DESK_TOP - .15, -1.272);
  boxM(.95, .004, .46, stdMat({ color: '#1C2623', roughness: .95 }), 0, DESK_TOP + .002, -1.55, null, { noCast: true });

  // Shelf
  const shelfTex = tex(makeCanvas(1024, 256, (c, W, H) => drawWood(c, W, H, { base: '#7A5233', dark: '#3A2312', light: '#A97B52', planks: 1, seed: 12 })));
  const shelfMat = stdMat({ map: shelfTex, roughness: .55 }); R3.mats.shelf = shelfMat;
  const brass = stdMat({ color: '#B3893C', metalness: .55, roughness: .35 });
  R3.lampBrass = brass;
  SHELF_Y.forEach(top => {
    boxM(1.72, .03, .25, shelfMat, 0, top - .015, -1.875);
    [-.62, .62].forEach(x => { boxM(.025, .12, .03, stdMat({ color: '#26231F', metalness: .4, roughness: .5 }), x, top - .09, -1.985); boxM(.025, .025, .2, stdMat({ color: '#26231F', metalness: .4, roughness: .5 }), x, top - .042, -1.89); });
    [-SHELF_HALF - .018, SHELF_HALF + .018].forEach(x => boxM(.012, .15, .13, brass, x, top + .075, -1.83));
  });

  // Lamp
  const lamp = new T3.Group(); lamp.position.set(-.6, DESK_TOP, -1.74); scn.add(lamp);
  const curLampStyle = LAMP_STYLES[S().lampStyle] || LAMP_STYLES.banker;
  const lampMat = stdMat({ color: curLampStyle.shade, roughness: curLampStyle.roughness || .4, metalness: curLampStyle.metalness || .35 });
  R3.lampShadeMat = lampMat; R3.lampBaseMat = lampMat;
  const base = new T3.Mesh(new T3.CylinderGeometry(.07, .08, .025, 32), lampMat); base.position.y = .0125; base.castShadow = true; lamp.add(base);
  const B = new T3.Vector3(0, .02, 0), J = new T3.Vector3(.05, .36, .04), HD = new T3.Vector3(.25, .44, .14);
  cylBetween(B, J, .008, brass, lamp); cylBetween(J, HD, .008, brass, lamp);
  const jn = new T3.Mesh(new T3.SphereGeometry(.016, 12, 10), brass); jn.position.copy(J); lamp.add(jn);
  const head = new T3.Group(); head.position.copy(HD); lamp.add(head);
  const shadeG = new T3.CylinderGeometry(.085, .035, .11, 32, 1, true); shadeG.rotateX(Math.PI / 2);
  const shadeM = new T3.Mesh(shadeG, lampMat); shadeM.position.z = .03; shadeM.castShadow = true; head.add(shadeM);
  R3.bulbMat = new T3.MeshBasicMaterial({ color: 0xffe2a8 });
  const bulb = new T3.Mesh(new T3.SphereGeometry(.026, 16, 12), R3.bulbMat); bulb.position.z = .045; head.add(bulb);
  scn.updateMatrixWorld(true);
  const lampTarget = new T3.Vector3(-.12, DESK_TOP, -1.5);
  head.lookAt(lampTarget);
  scn.updateMatrixWorld(true);
  const bulbW = new T3.Vector3(); bulb.getWorldPosition(bulbW);
  const spot = new T3.SpotLight(0xffc98a, 2.5, 3.2, .82, .55, 2); spot.position.copy(bulbW); spot.target.position.copy(lampTarget);
  spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -.0005; spot.shadow.camera.near = .05; spot.shadow.camera.far = 3;
  scn.add(spot); scn.add(spot.target); R3.spot = spot;
  R3.glow = new T3.PointLight(0xffb870, .6, 1.8, 2); R3.glow.position.copy(bulbW).add(new T3.Vector3(0, .05, 0)); scn.add(R3.glow);
  lamp.traverse(o => { if (o.isMesh) { o.userData.act = { type: 'lamp' }; R3.picks.push(o); } });

  // Mug
  const mug = new T3.Group(); mug.position.set(.47, DESK_TOP, -1.4); scn.add(mug);
  const mugMat = stdMat({ color: '#2F4E78', roughness: .3 }); R3.mugMat = mugMat;
  const mb = new T3.Mesh(new T3.CylinderGeometry(.04, .036, .095, 28, 1, true), new T3.MeshStandardMaterial({ color: '#2F4E78', roughness: .3, side: T3.DoubleSide })); mb.position.y = .0475; mb.castShadow = true; mug.add(mb);
  const mbot = new T3.Mesh(new T3.CircleGeometry(.036, 24), mugMat); mbot.rotation.x = -Math.PI / 2; mbot.position.y = .002; mug.add(mbot);
  const coffee = new T3.Mesh(new T3.CircleGeometry(.038, 24), stdMat({ color: '#3A2214', roughness: .2 })); coffee.rotation.x = -Math.PI / 2; coffee.position.y = .08; mug.add(coffee);
  const handle = new T3.Mesh(new T3.TorusGeometry(.024, .007, 10, 20, Math.PI), mugMat); handle.rotation.z = -Math.PI / 2; handle.position.set(.04, .05, 0); handle.castShadow = true; mug.add(handle);
  mug.traverse(o => { if (o.isMesh) { o.userData.act = { type: 'mug' }; o.userData.movable = 'mug'; R3.picks.push(o); } });
  R3.movables.set('mug', { id: 'mug', group: mug, basePos: new T3.Vector3(.47, DESK_TOP, -1.4), baseRotY: 0, deskY: DESK_TOP });

  // Pen cup
  const cup = new T3.Group(); cup.position.set(.68, DESK_TOP, -1.76); scn.add(cup);
  const cupM = new T3.Mesh(new T3.CylinderGeometry(.045, .045, .11, 28, 1, true), new T3.MeshStandardMaterial({ color: '#7A3B2E', roughness: .6, side: T3.DoubleSide })); cupM.position.y = .055; cupM.castShadow = true; cup.add(cupM);
  const r = rng(31);
  ['#1E2F6B', '#C9A54C', '#1B1A1F', '#7A1F2B', '#E7E2D6', '#2F6B4F'].forEach((col, i) => {
    const a = i / 6 * 6.28, tilt = .12 + r() * .12;
    const pen = new T3.Group(); pen.position.set(Math.cos(a) * .02, .02, Math.sin(a) * .02); pen.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt); cup.add(pen);
    const body = new T3.Mesh(new T3.CylinderGeometry(.0055, .0055, .16, 10), stdMat({ color: col, roughness: .35, metalness: .2 })); body.position.y = .08; body.castShadow = true; pen.add(body);
    const cap = new T3.Mesh(new T3.CylinderGeometry(.006, .006, .03, 10), brass); cap.position.y = .16; pen.add(cap);
  });
  cup.traverse(o => { if (o.isMesh) { o.userData.act = { type: 'pens' }; o.userData.movable = 'cup'; R3.picks.push(o); } });
  R3.movables.set('cup', { id: 'cup', group: cup, basePos: new T3.Vector3(.68, DESK_TOP, -1.76), baseRotY: 0, deskY: DESK_TOP });

  // Plant
  const plant = new T3.Group(); plant.position.set(-.3, DESK_TOP, -1.86); scn.add(plant);
  const curPot = POT_STYLES[S().potStyle] || POT_STYLES.terracotta;
  const potMat = stdMat({ color: curPot.color, roughness: curPot.rough, metalness: curPot.metal || 0 }); R3.potMat = potMat;
  const pot = new T3.Mesh(new T3.CylinderGeometry(.05, .04, .075, 24), potMat); pot.position.y = .0375; pot.castShadow = true; plant.add(pot);
  const leafMat = stdMat({ color: '#3F7A4E', roughness: .6, side: T3.DoubleSide });
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * 6.28 + r() * .3; const lf = new T3.Mesh(new T3.SphereGeometry(.03, 10, 8), leafMat);
    lf.scale.set(.55, 2.2, .18); lf.position.set(Math.cos(a) * .03, .12 + r() * .03, Math.sin(a) * .03); lf.rotation.set(Math.sin(a) * .7, -a, Math.cos(a) * .7 * -1);
    lf.castShadow = true; plant.add(lf);
  }
  plant.traverse(o => { if (o.isMesh) { o.userData.act = { type: 'plant' }; o.userData.movable = 'plant'; R3.picks.push(o); } });
  R3.movables.set('plant', { id: 'plant', group: plant, basePos: new T3.Vector3(-.3, DESK_TOP, -1.86), baseRotY: 0, deskY: DESK_TOP });

  // Radio
  const radio = new T3.Group(); radio.position.set(.27, DESK_TOP, -1.86); scn.add(radio);
  const rb = boxM(.22, .13, .085, stdMat({ color: '#8C4A33', roughness: .45 }), 0, .065, 0, radio);
  const grille = new T3.Mesh(new T3.PlaneGeometry(.2, .11), stdMat({ map: tex(makeCanvas(256, 140, drawGrille)), roughness: .7 })); grille.position.set(0, .065, .0435); radio.add(grille);
  R3.radioLed = new T3.MeshBasicMaterial({ color: 0x3a2a20 });
  const led = new T3.Mesh(new T3.SphereGeometry(.006, 10, 8), R3.radioLed); led.position.set(.085, .11, .044); radio.add(led);
  const knob = new T3.Mesh(new T3.CylinderGeometry(.012, .012, .012, 16), brass); knob.rotation.x = Math.PI / 2; knob.position.set(.06, .04, .048); radio.add(knob);
  void rb;
  radio.traverse(o => { if (o.isMesh) { o.userData.act = { type: 'radio' }; o.userData.movable = 'radio'; R3.picks.push(o); } });
  R3.movables.set('radio', { id: 'radio', group: radio, basePos: new T3.Vector3(.27, DESK_TOP, -1.86), baseRotY: 0, deskY: DESK_TOP });

  // Upper-shelf decor (hidden once journals need that shelf)
  const decor = new T3.Group(); decor.position.y = SHELF_Y[1]; scn.add(decor); R3.decor = decor;
  [['#7A1F2B', .2, .028], ['#E3D6BA', .19, .024], ['#1F5F63', .21, .03]].reduce((y, [col, w, t], i) => {
    const bk = boxM(w, t, .15, stdMat({ color: col, roughness: .7 }), -.48 + i * .012, y + t / 2, -1.85, decor); bk.rotation.y = (i - 1) * .12; return y + t;
  }, 0);
  const pot2 = new T3.Mesh(new T3.CylinderGeometry(.04, .032, .06, 20), potMat); pot2.position.set(-.48, .082 + .03, -1.85); pot2.castShadow = true; decor.add(pot2);
  R3.shelfPotMat = pot2.material;
  for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; const lf = new T3.Mesh(new T3.SphereGeometry(.022, 8, 6), leafMat); lf.scale.set(.6, 1.9, .2); lf.position.set(-.48 + Math.cos(a) * .02, .17, -1.85 + Math.sin(a) * .02); lf.rotation.set(Math.sin(a) * .6, -a, -Math.cos(a) * .6); decor.add(lf); }
  const jar = new T3.Mesh(new T3.CylinderGeometry(.035, .035, .08, 24), stdMat({ color: '#E9E0CC', roughness: .5 })); jar.position.set(.28, .04, -1.86); jar.castShadow = true; decor.add(jar);
  const flame = new T3.Mesh(new T3.SphereGeometry(.009, 10, 8), new T3.MeshBasicMaterial({ color: 0xffc56b })); flame.scale.set(1, 1.8, 1); flame.position.set(.28, .095, -1.86); decor.add(flame);

  // Globe (directly on scene for positioning and arrangement)
  const globe = new T3.Group(); globe.position.set(.56, SHELF_Y[1], -1.86); scn.add(globe);
  const gb = new T3.Mesh(new T3.CylinderGeometry(.03, .04, .015, 20), brass); gb.position.y = .0075; globe.add(gb);
  cylBetween(new T3.Vector3(0, .015, 0), new T3.Vector3(0, .05, 0), .005, brass, globe);
  const ball = new T3.Mesh(new T3.SphereGeometry(.06, 28, 20), stdMat({ map: tex(makeCanvas(256, 128, (c, W, H) => { c.fillStyle = '#3E6E8E'; c.fillRect(0, 0, W, H); const rr = rng(44); c.fillStyle = '#C9B98A'; for (let i = 0; i < 14; i++) { c.beginPath(); c.ellipse(rr() * W, H * .2 + rr() * H * .6, 8 + rr() * 26, 6 + rr() * 16, rr() * 3, 0, 6.3); c.fill(); } })), roughness: .5 }));
  ball.position.y = .11; ball.rotation.z = .4; ball.castShadow = true; globe.add(ball); R3.globe = ball;
  globe.traverse(o => { if (o.isMesh) { o.userData.act = { type: 'globe' }; o.userData.movable = 'globe'; R3.picks.push(o); } });
  R3.movables.set('globe', { id: 'globe', group: globe, basePos: new T3.Vector3(.56, SHELF_Y[1], -1.86), baseRotY: 0, deskY: DESK_TOP });

  // Lightweight Rain Particle System inside the window opening: in front of the sky planes (z -1.986) and behind
  // the glass sashes (z -1.963). Behind the back wall (z -2) it could never be seen. x leaves room for the slant,
  // y stays on the glass (1.0 to 2.0), so no streak shows on the wall.
  const RAIN_N = 80;
  const rainGeo = new T3.BufferGeometry();
  const rainPts = new Float32Array(RAIN_N * 6);
  const rRain = rng(77);
  for (let i = 0; i < RAIN_N; i++) {
    const rx = 1.23 + rRain() * .62;
    const ry = 1.0 + rRain() * 1.0;
    const rz = -1.982 + rRain() * .008;
    rainPts[i * 6] = rx;
    rainPts[i * 6 + 1] = ry;
    rainPts[i * 6 + 2] = rz;
    rainPts[i * 6 + 3] = rx - .008;
    rainPts[i * 6 + 4] = ry - .055;
    rainPts[i * 6 + 5] = rz;
  }
  rainGeo.setAttribute('position', new T3.BufferAttribute(rainPts, 3));
  R3.rain = new T3.LineSegments(rainGeo, new T3.LineBasicMaterial({ color: 0xAAD0F5, transparent: true, opacity: .65 }));
  R3.rain.renderOrder = -1; // drawn before the glass sashes, which are transparent and write depth, so the rain shows through them
  R3.rain.visible = (S().weather === 'rain');
  scn.add(R3.rain);

  // Dust motes in the lamp light
  const N = 140, pts = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pts[i * 3] = -.6 + r() * .8; pts[i * 3 + 1] = DESK_TOP + .02 + r() * .55; pts[i * 3 + 2] = -1.9 + r() * .6; }
  const dg = new T3.BufferGeometry(); dg.setAttribute('position', new T3.BufferAttribute(pts, 3));
  R3.dust = new T3.Points(dg, new T3.PointsMaterial({ color: 0xffe3b0, size: .006, transparent: true, opacity: .4, depthWrite: false }));
  scn.add(R3.dust);

  // "New journal" ghost book
  const plusTex = tex(makeCanvas(64, 512, (c, W, H) => {
    c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.setLineDash([10, 8]); c.lineWidth = 3; c.strokeRect(3, 3, W - 6, H - 6); c.setLineDash([]);
    c.fillStyle = '#fff'; c.font = '600 54px Manrope, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('+', W / 2, H * .2);
    c.save(); c.translate(W / 2, H * .58); c.rotate(Math.PI / 2); c.font = '700 26px Manrope, sans-serif'; c.fillText('NEW JOURNAL', 0, 0); c.restore();
  }));
  const plusMat = new T3.MeshBasicMaterial({ map: plusTex, transparent: true, opacity: .9 });
  const plusSide = new T3.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .08 });
  R3.plus = new T3.Mesh(new T3.BoxGeometry(.04, .24, .17), [plusSide, plusSide, plusSide, plusSide, plusMat, plusSide]);
  R3.plus.userData.act = { type: 'plus' }; scn.add(R3.plus); R3.picks.push(R3.plus);
}

/* ---- books ---- */
function bookMaterials(j) {
  const d = dimsOf(j);
  const fH = Math.round(512 * d.h / d.w);
  const front = tex(makeCanvas(512, fH, (c, W, H) => drawCoverFace(c, W, H, j, 'front')));
  const back = tex(makeCanvas(256, Math.round(fH / 2), (c, W, H) => drawCoverFace(c, W, H, j, 'back')));
  const sH = 640, sW = Math.max(36, Math.round(sH * d.t / d.h));
  const spine = tex(makeCanvas(sW, sH, (c, W, H) => drawCoverFace(c, W, H, j, 'spine')));
  const edge = tex(makeCanvas(64, 256, (c, W, H) => drawEdges(c, W, H, j.cover.color)));
  const rough = { leather: .55, velvet: .95, linen: .85, kraft: .9, marble: .32, cloth: .85 }[j.cover.material] || .7;
  const mk = (map, rr) => stdMat({ map, roughness: rr });
  return [mk(front, rough), mk(back, rough), mk(edge, .9), mk(edge, .9), mk(spine, rough), mk(edge, .9)];
}
function disposeMesh(m) { m.geometry.dispose(); (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => { if (x.map) x.map.dispose(); x.dispose(); }); }
function createBookMesh(j) {
  const d = dimsOf(j);
  const m = new T3.Mesh(new T3.BoxGeometry(d.t, d.h, d.w), bookMaterials(j));
  m.castShadow = true; m.receiveShadow = true; m.userData.act = { type: 'book', id: j.id };
  return m;
}
const Q_DESK = (() => { if (!T3) return null; const qz = new T3.Quaternion().setFromAxisAngle(new T3.Vector3(0, 0, 1), Math.PI / 2); const qy = new T3.Quaternion().setFromAxisAngle(new T3.Vector3(0, 1, 0), -Math.PI / 2 + .1); return new T3.Quaternion().multiplyQuaternions(qy, qz); })();
function layoutShelf(journals) {
  // Journals fill the lower shelf first (closest to the desk), centred; the upper shelf takes the overflow.
  const list = journals.slice().sort((a, b) => a.order - b.order);
  const GAP = .003, CAP = SHELF_HALF * 2;
  const items = list.map(j => ({ id: j.id, d: dimsOf(j) })).concat([{ id: '+', d: { t: .04, h: .24, w: .17 } }]);
  const rows = [[]]; let used = 0;
  for (const it of items) {
    if (used + it.d.t > CAP && rows[rows.length - 1].length) { rows.push([]); used = 0; }
    rows[rows.length - 1].push(it); used += it.d.t + GAP;
  }
  const poses = {}; let plus = null;
  const overflow = rows.length > 2 && rows.slice(2).some(r => r.some(it => it.id !== '+'));
  rows.slice(0, 2).forEach((row, ri) => {
    const width = row.reduce((a, it) => a + it.d.t + GAP, -GAP);
    let x = -width / 2; const top = SHELF_Y[ri];
    row.forEach(it => {
      const pose = { x: x + it.d.t / 2, y: top + it.d.h / 2 + .001, z: SHELF_FRONT - it.d.w / 2 - .012 };
      if (it.id === '+') plus = pose; else poses[it.id] = pose;
      x += it.d.t + GAP;
    });
  });
  return { poses, plus, overflow, upperUsed: rows.length > 1 && rows[1].some(it => it.id !== '+') };
}
function shelfHasRoomFor(extra) { const L = layoutShelf(state.lib.journals.concat(extra ? [extra] : [])); return !L.overflow; }
function sync3D() {
  if (!R3 || !state.lib) return;
  const L = state.lib; const ids = new Set(L.journals.map(j => j.id));
  for (const [id, b] of R3.books) { if (!ids.has(id)) { R3.scene.remove(b.mesh); disposeMesh(b.mesh); R3.books.delete(id); } }
  const lay = layoutShelf(L.journals);
  for (const j of L.journals) {
    const sig = coverSig(j); let b = R3.books.get(j.id);
    const d = dimsOf(j);
    const sp = lay.poses[j.id];
    const desk = L.activeId === j.id;
    const pose = desk
      ? { p: new T3.Vector3(0, DESK_TOP + .004 + d.t / 2, -1.5), q: Q_DESK.clone(), desk: true }
      : { p: new T3.Vector3(sp.x, sp.y, sp.z), q: new T3.Quaternion(), desk: false };
    if (!b) {
      const mesh = createBookMesh(j); R3.scene.add(mesh);
      b = { mesh, sig, cur: { p: pose.p.clone(), q: pose.q.clone() }, from: null, to: pose, t: 1, dur: 1, hover: 0 };
      R3.books.set(j.id, b);
    } else {
      if (b.sig !== sig) {
        const mesh = createBookMesh(j); mesh.position.copy(b.mesh.position); mesh.quaternion.copy(b.mesh.quaternion);
        R3.scene.remove(b.mesh); disposeMesh(b.mesh); R3.scene.add(mesh); b.mesh = mesh; b.sig = sig;
      }
      if (b.to.p.distanceTo(pose.p) > 1e-4 || b.to.desk !== pose.desk) {
        b.from = { p: b.cur.p.clone(), q: b.cur.q.clone() }; b.to = pose; b.t = 0;
        b.dur = (b.from.p.distanceTo(pose.p) > .4) ? 1.15 : .45; b.travel = b.from.p.distanceTo(pose.p) > .4;
        if (reduceMotion()) { b.cur.p.copy(pose.p); b.cur.q.copy(pose.q); b.t = 1; }
      }
    }
  }
  if (lay.plus) { R3.plus.visible = true; R3.plus.position.set(lay.plus.x, lay.plus.y, lay.plus.z); } else R3.plus.visible = false;
  if (R3.decor) R3.decor.visible = !lay.upperUsed;
  R3.picks = R3.picks.filter(o => !(o.userData.act && o.userData.act.type === 'book'));
  for (const b of R3.books.values()) R3.picks.push(b.mesh);
  updateHudSub();
}

/* ---- camera, pointer, frame ---- */
function resize3D() {
  if (!R3) return;
  const w = window.innerWidth, hh = window.innerHeight, aspect = w / hh;
  R3.renderer.setSize(w, hh, false);
  R3.camera.aspect = aspect; R3.camera.updateProjectionMatrix();
  const tanV = Math.tan(R3.camera.fov * Math.PI / 360);
  const portrait = aspect < .85;
  const halfW = portrait ? .64 : 1.0, halfH = .8;
  const dist = Math.max(halfH / tanV, halfW / (tanV * aspect));
  R3.cam.baseDist = dist;
  R3.cam.baseTarget.set(0, portrait ? 1.36 : 1.3, -1.75);
  R3.cam.yawLim = portrait ? .3 : .2;

  if (R3.cam.mode === 'room' && R3.cam.t >= 1) {
    const pitch = .07 + R3.cam.pitch;
    R3.cam.pos.set(Math.sin(R3.cam.yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(R3.cam.yaw) * Math.cos(pitch) * dist).add(R3.cam.baseTarget);
    R3.cam.target.copy(R3.cam.baseTarget);
    R3.camera.position.copy(R3.cam.pos);
    R3.camera.lookAt(R3.cam.target);
  }
}

function startCameraTransition(toPos, toTarget, dur, onDone, mode) {
  const c = R3.cam;
  if (mode !== 'desk') dropPendingOpen();
  c.mode = mode || 'tour';
  const targetPos = Array.isArray(toPos) ? new T3.Vector3(toPos[0], toPos[1], toPos[2]) : toPos.clone();
  const targetLook = Array.isArray(toTarget) ? new T3.Vector3(toTarget[0], toTarget[1], toTarget[2]) : toTarget.clone();

  if (reduceMotion()) {
    c.pos.copy(targetPos);
    c.target.copy(targetLook);
    c.t = 1; c.onDone = null;
    R3.camera.position.copy(c.pos);
    R3.camera.lookAt(c.target);
    if (onDone) onDone();
    return;
  }

  c.fromPos.copy(c.pos);
  c.fromTarget.copy(c.target);
  c.toPos.copy(targetPos);
  c.toTarget.copy(targetLook);
  c.t = 0;
  c.dur = Math.max(.2, dur || 1.15);
  c.onDone = onDone || null;
}

// Ends a camera move where it was going. The reader pauses the room a moment after it opens; on a slow device that can
// come before the move's last frame, which left the camera at 98% of the way with the room paused.
function finishCamera() {
  const c = R3.cam; if (c.t >= 1) return;
  c.t = 1; c.pos.copy(c.toPos); c.target.copy(c.toTarget);
  if (c.onDone) { const cb = c.onDone; c.onDone = null; cb(); }
}
function resetCameraToRoom(dur, onDone, yaw, pitch) {
  const c = R3.cam;
  yaw = yaw || 0; pitch = pitch || 0;
  c.yawG = yaw; c.pitchG = pitch;
  const p = .07 + pitch;
  const roomPos = new T3.Vector3(Math.sin(yaw) * Math.cos(p) * c.baseDist, Math.sin(p) * c.baseDist, Math.cos(yaw) * Math.cos(p) * c.baseDist).add(c.baseTarget);
  startCameraTransition(roomPos, c.baseTarget, dur || 1.0, () => {
    c.mode = 'room';
    c.yaw = yaw; c.pitch = pitch;
    if (onDone) onDone();
  }, 'room');
}

function frame(now) {
  // never negative: R3.last is also stamped from event handlers, so the next frame's timestamp can be older
  const dt = clamp((now - R3.last) / 1000, 0, .05); R3.last = now;
  if (R3.paused) return;
  const c = R3.cam;

  // Camera animation and damping
  if (c.t < 1) {
    c.t = Math.min(1, c.t + dt / c.dur);
    const e = easeInOutCubic(c.t);
    c.pos.lerpVectors(c.fromPos, c.toPos, e);
    c.target.lerpVectors(c.fromTarget, c.toTarget, e);
    if (c.t >= 1 && c.onDone) {
      const cb = c.onDone; c.onDone = null; cb();
    }
  } else if (c.mode === 'room') {
    c.yaw += (c.yawG - c.yaw) * Math.min(1, dt * 6);
    c.pitch += (c.pitchG - c.pitch) * Math.min(1, dt * 6);
    const pitch = .07 + c.pitch;
    c.pos.set(Math.sin(c.yaw) * Math.cos(pitch) * c.baseDist, Math.sin(pitch) * c.baseDist, Math.cos(c.yaw) * Math.cos(pitch) * c.baseDist).add(c.baseTarget);
    c.target.copy(c.baseTarget);
  } else if (c.mode === 'desk') {
    const dp = new T3.Vector3(0, DESK_TOP + (R3.mobile ? .82 : .62), -1.0);
    const dl = new T3.Vector3(0, DESK_TOP, -1.52);
    c.pos.copy(dp); c.target.copy(dl);
  } else if (c.mode === 'explore') {
    const forward = new T3.Vector3(-Math.sin(c.explore.yaw), 0, -Math.cos(c.explore.yaw)).normalize();
    const right = new T3.Vector3(Math.cos(c.explore.yaw), 0, -Math.sin(c.explore.yaw)).normalize();
    let moveX = 0, moveZ = 0;
    if (c.explore.keys.w) moveZ += 1;
    if (c.explore.keys.s) moveZ -= 1;
    if (c.explore.keys.a) moveX -= 1;
    if (c.explore.keys.d) moveX += 1;

    const speedMult = S().exploreSpeed || 1.0;
    const targetVel = new T3.Vector3();
    if (moveX !== 0 || moveZ !== 0) {
      targetVel.addScaledVector(forward, moveZ).addScaledVector(right, moveX).normalize().multiplyScalar(1.65 * speedMult);
    }
    c.explore.vel.lerp(targetVel, Math.min(1, dt * 9));
    c.explore.pos.addScaledVector(c.explore.vel, dt);

    // Room boundaries
    c.explore.pos.x = clamp(c.explore.pos.x, -1.75, 1.75);
    c.explore.pos.z = clamp(c.explore.pos.z, -2.10, 0.40);
    c.explore.pos.y = 1.44;

    // Desk and bookshelf collision sliding
    if (c.explore.pos.x > -0.92 && c.explore.pos.x < 0.92 && c.explore.pos.z < -1.18) {
      if (c.explore.pos.z < -1.75) {
        c.explore.pos.x = c.explore.pos.x >= 0 ? 0.92 : -0.92;
      } else {
        c.explore.pos.z = -1.18;
      }
    }

    c.explore.yaw += (c.explore.yawG - c.explore.yaw) * Math.min(1, dt * 10);
    c.explore.pitch += (c.explore.pitchG - c.explore.pitch) * Math.min(1, dt * 10);
    c.pos.copy(c.explore.pos);
    c.target.set(
      -Math.sin(c.explore.yaw) * Math.cos(c.explore.pitch),
      Math.sin(c.explore.pitch),
      -Math.cos(c.explore.yaw) * Math.cos(c.explore.pitch)
    ).add(c.pos);
  }

  R3.camera.position.copy(c.pos);
  R3.camera.lookAt(c.target);

  if (pendingOpen && !RD.open && c.mode === 'desk' && c.t >= .96) {
    const p = pendingOpen; pendingOpen = null; showReader(p.jid, p.n, p.pop);
  }

  // Books animation with safe parabolic clearance arc
  for (const [id, b] of R3.books) {
    b.mesh.visible = id !== RD.inHand;   // the journal in the reader is drawn there, not on the desk behind it as well
    if (b.t < 1) {
      b.t = Math.min(1, b.t + dt / b.dur);
      const e = ease(b.t);
      b.cur.p.lerpVectors(b.from.p, b.to.p, e);
      if (b.travel) {
        const arcZ = Math.sin(Math.PI * e) * .28;
        const arcY = Math.sin(Math.PI * e) * (b.to.desk ? .16 : .22);
        b.cur.p.z += arcZ;
        b.cur.p.y += arcY;
      }
      b.cur.q.copy(b.from.q).slerp(b.to.q, e);
    }
    const hv = R3.hover === b.mesh ? 1 : 0;
    b.hover += (hv - b.hover) * Math.min(1, dt * 10);
    b.mesh.position.copy(b.cur.p);
    b.mesh.quaternion.copy(b.cur.q);
    if (b.t >= 1) {
      if (b.to.desk) b.mesh.position.y += b.hover * .012;
      else b.mesh.position.z += b.hover * .045;
    }
  }

  // Window casements animation
  R3.winAngle += (R3.winAngleG - R3.winAngle) * Math.min(1, dt * 5);
  if (R3.winLeft) R3.winLeft.rotation.y = -R3.winAngle;
  if (R3.winRight) R3.winRight.rotation.y = R3.winAngle;

  // Curtains animation (a peek parts drawn curtains to see out; the saved setting is untouched, so they close again after)
  R3.curtOpen += ((PEEK.active ? 1 : R3.curtOpenG) - R3.curtOpen) * Math.min(1, dt * 4.5);
  if (R3.curtLeft && R3.curtRight) {
    const cv = R3.curtOpen;
    R3.curtLeft.position.x = lerp(-.20, -.45, cv);
    R3.curtLeft.scale.x = lerp(1.0, .45, cv);
    R3.curtRight.position.x = lerp(.20, .45, cv);
    R3.curtRight.scale.x = lerp(1.0, .45, cv);
  }

  // Follow the clock: "Follow my clock" only re-reads the time when asked, so look again now and then.
  // (This loop is already idle while the tab is hidden or the reader is open.)
  if (state.lib && now - R3.skyCheck > 30000) { R3.skyCheck = now; if (nightNow() !== R3.nightShown) applySettings(); }

  // Lighting & Day/Night interpolation
  if (reduceMotion()) R3.night = R3.nightG;
  else R3.night += clamp(R3.nightG - R3.night, -dt * 1.5, dt * 1.5);
  R3.lamp += clamp(R3.lampG - R3.lamp, -dt * 3, dt * 3);
  const n = R3.night;
  let l = R3.lamp;
  if (R3.flickerUntil && now < R3.flickerUntil) l *= .45 + Math.random() * .55;

  R3.hemi.intensity = lerp(.62, .14, n);
  R3.hemi.color.setRGB(lerp(.88, .45, n), lerp(.91, .52, n), lerp(1, .78, n));
  R3.sun.intensity = lerp(1.3, .22, n);
  R3.sun.color.setRGB(lerp(1, .62, n), lerp(.95, .72, n), lerp(.86, 1, n));
  R3.winLight.intensity = lerp(.55, .3, n);
  R3.winLight.color.setRGB(lerp(.82, .5, n), lerp(.88, .6, n), 1);
  R3.spot.intensity = l * lerp(1.0, 2.4, n);
  R3.glow.intensity = l * lerp(.25, .85, n);
  R3.bulbMat.color.setRGB(lerp(.3, 1, l), lerp(.27, .9, l), lerp(.22, .68, l));
  R3.nightGlass.material.opacity = n;
  R3.renderer.toneMappingExposure = lerp(1.05, .98, n);

  // Globe rotation
  if (R3.globe) {
    R3.globe.rotation.y += dt * (.15 + (R3.globeSpin || 0));
    R3.globeSpin = Math.max(0, (R3.globeSpin || 0) - dt * 2.5);
  }

  // Rain animation (held still when the visitor prefers reduced motion)
  if (R3.rain && R3.rain.visible && !reduceMotion()) {
    const pos = R3.rain.geometry.attributes.position;
    const arr = pos.array;
    const dropSpeed = dt * 3.4;
    for (let i = 0; i < pos.count; i += 2) {
      arr[i * 3 + 1] -= dropSpeed;
      arr[(i + 1) * 3 + 1] -= dropSpeed;
      arr[i * 3] -= dropSpeed * .12;
      arr[(i + 1) * 3] -= dropSpeed * .12;
      if (arr[(i + 1) * 3 + 1] < 1.0) {
        const topY = 2.0 + Math.random() * .03;
        const resetX = 1.23 + Math.random() * .62;
        arr[i * 3] = resetX;
        arr[i * 3 + 1] = topY;
        arr[(i + 1) * 3] = resetX - .008;
        arr[(i + 1) * 3 + 1] = topY - .055;
      }
    }
    pos.needsUpdate = true;
  }

  // Dust motes
  if (R3.dust) {
    const pos = R3.dust.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + dt * .012 * (1 + (i % 3));
      if (y > DESK_TOP + .6) y = DESK_TOP + .02;
      pos.setY(i, y);
      pos.setX(i, pos.getX(i) + Math.sin(now / 1500 + i) * dt * .004);
    }
    pos.needsUpdate = true;
    R3.dust.material.opacity = .45 * l * (.35 + .65 * n);
  }

  // Wall clock updates
  if (R3.clock) {
    const show = S().showClock !== false;
    R3.clock.visible = show;
    if (show) {
      const d = new Date();
      const sec = d.getSeconds() + d.getMilliseconds() / 1000;
      const s = S().clockTick ? Math.floor(sec) : sec;
      const m = d.getMinutes() + s / 60;
      const hr = (d.getHours() % 12) + m / 60;

      const cMode = S().clockMode || 'analog';
      const isDig = cMode === 'digital';
      if (R3.hHour) R3.hHour.visible = !isDig;
      if (R3.hMin) R3.hMin.visible = !isDig;
      if (R3.hSec) R3.hSec.visible = !isDig && S().clockSec !== false;

      if (!isDig) {
        if (R3.hSec) R3.hSec.rotation.z = -s / 60 * Math.PI * 2;
        if (R3.hMin) R3.hMin.rotation.z = -m / 60 * Math.PI * 2;
        if (R3.hHour) R3.hHour.rotation.z = -hr / 12 * Math.PI * 2;
      }

      // Redraw digital display if needed
      if ((isDig || cMode === 'both') && (!R3.lastClockDraw || now - R3.lastClockDraw > 450)) {
        R3.lastClockDraw = now;
        drawClock(R3.clockCv.getContext('2d'), 256, S().clockStyle || 'daybook', cMode);
        R3.clockTex.needsUpdate = true;
      }
    }
  }

  R3.renderer.render(R3.scene, R3.camera);
}

function isOverlayActive() {
  if (RD.open || RD.closing || RD.drawing || opening()) return true;
  if ($('#designer') && !$('#designer').hidden) return true;
  if ($('#welcome') && !$('#welcome').hidden) return true;
  if ($('#lock') && !$('#lock').hidden) return true;
  if ($('#roomCustomModal') && !$('#roomCustomModal').hidden) return true;
  if ($('#drawer') && $('#drawer').classList.contains('open')) return true;
  return false;
}

function pick(clientX, clientY) {
  if (isOverlayActive()) return null;
  const rect = R3.renderer.domElement.getBoundingClientRect();
  R3.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  R3.raycaster.setFromCamera(R3.ndc, R3.camera);
  const hits = R3.raycaster.intersectObjects(R3.picks.filter(o => o.visible !== false), true);
  for (const hit of hits) {
    let o = hit.object;
    while (o && !o.userData.act) o = o.parent;
    if (o) return o;
  }
  return null;
}

function setMeshHighlight(root, on) {
  if (!root) return;
  root.traverse(o => {
    if (o.isMesh && o.material && 'emissive' in o.material) {
      if (on) {
        if (o.userData._origEmissive === undefined) o.userData._origEmissive = o.material.emissive.getHex();
        o.material.emissive.setHex(0x332818);
      } else if (o.userData._origEmissive !== undefined) {
        o.material.emissive.setHex(o.userData._origEmissive);
        delete o.userData._origEmissive;
      }
    }
  });
}

function describe(o) {
  const a = o.userData.act;
  switch (a.type) {
    case 'book': {
      const j = jById(a.id);
      if (!j) return null;
      return [j.title, state.lib.activeId === j.id ? 'Click to open' : 'Click to take it down'];
    }
    case 'plus': return ['New journal', 'Design a cover'];
    case 'lamp': return ['Desk lamp', R3.lampG > .5 ? 'Click to switch off' : 'Click to switch on'];
    case 'window': return ['Study window', S().windowOpen ? 'Click to close or peek outside' : 'Click to open or peek outside'];
    case 'curtains': return ['Window curtains', S().curtainsOpen ? 'Click to draw curtains' : 'Click to open curtains'];
    case 'clock': {
      const d = new Date();
      return ['Wall clock', d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' · Click to customize'];
    }
    case 'radio': return ['Vintage radio', 'Click to change ambient sound'];
    case 'pens': return ['Pen cup', 'Choose a pen'];
    case 'plant': return ['Desk plant', 'Thriving indoor flora · Click to customize'];
    case 'mug': return ['Coffee mug', 'Warm brew · Freshly poured'];
    case 'desk': return ['Writing desk', 'Click to focus or write'];
    case 'shelf': return ['Bookshelf', 'Click to view library'];
    case 'globe': return ['Study globe', 'Click to spin'];
    case 'art': return ['Study art', 'Modernist canvas · Click to customize'];
  }
  return null;
}

function bindPointer() {
  const el = R3.renderer.domElement; const tip = $('#tip');
  let down = null;
  let hoveredObj = null;

  el.addEventListener('pointerdown', e => {
    if (isOverlayActive()) return;
    const isArrange = R3.arrange && R3.arrange.active;
    if (isArrange) {
      const o = pick(e.clientX, e.clientY);
      let movId = null;
      if (o) {
        let cur = o;
        while (cur && !cur.userData.movable) cur = cur.parent;
        if (cur && cur.userData.movable) movId = cur.userData.movable;
      }
      if (movId && typeof selectArrangeObject === 'function') {
        selectArrangeObject(movId);
      }
    }

    down = {
      x: e.clientX,
      y: e.clientY,
      yaw: R3.cam.mode === 'explore' ? R3.cam.explore.yawG : R3.cam.yawG,
      pitch: R3.cam.mode === 'explore' ? R3.cam.explore.pitchG : R3.cam.pitchG,
      moved: false,
      id: e.pointerId
    };
    try { el.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
  });

  el.addEventListener('pointermove', e => {
    if (down) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.hypot(dx, dy) > 6) { down.moved = true; el.classList.add('dragging'); tip.hidden = true; }
      if (down.moved) {
        if (R3.arrange && R3.arrange.active && R3.arrange.selected) {
          // Raycast onto desk plane to drag object
          const rect = el.getBoundingClientRect();
          R3.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
          R3.raycaster.setFromCamera(R3.ndc, R3.camera);
          const pt = new T3.Vector3();
          const deskPlane = new T3.Plane(new T3.Vector3(0, 1, 0), -DESK_TOP);
          if (R3.raycaster.ray.intersectPlane(deskPlane, pt)) {
            const mov = R3.movables.get(R3.arrange.selected);
            if (mov && mov.group) {
              mov.group.position.x = clamp(pt.x, -0.72, 0.72);
              mov.group.position.z = clamp(pt.z, -1.86, -1.34);
              mov.group.position.y = mov.deskY || DESK_TOP;
              if (typeof updateArrangeHudSelection === 'function') updateArrangeHudSelection();
            }
          }
          return;
        }

        if (R3.cam.mode === 'room') {
          R3.cam.yawG = clamp(down.yaw - dx / window.innerWidth * 1.4, -R3.cam.yawLim, R3.cam.yawLim);
          R3.cam.pitchG = clamp(down.pitch + dy / window.innerHeight * .6, -.12, .16);
        } else if (R3.cam.mode === 'explore') {
          const sens = (S().exploreSpeed || 1.0) * 1.5;
          R3.cam.explore.yawG = down.yaw - (dx / window.innerWidth) * sens * Math.PI;
          R3.cam.explore.pitchG = clamp(down.pitch - (dy / window.innerHeight) * sens * 1.2, -0.65, 0.65);
        }
      }
      return;
    }

    if (e.pointerType !== 'mouse' || RD.open || isOverlayActive()) return;
    const o = pick(e.clientX, e.clientY);
    R3.hover = o && o.userData.act.type === 'book' ? o : null;
    el.classList.toggle('pointing', !!o);

    // Subtle warm hover highlight
    if (o !== hoveredObj) {
      if (hoveredObj) setMeshHighlight(hoveredObj, false);
      hoveredObj = o;
      if (hoveredObj) setMeshHighlight(hoveredObj, true);
    }

    const info = o && describe(o);
    if (info) {
      tip.textContent = '';
      tip.append(info[0], h('small', { text: info[1] }));
      tip.hidden = false;
      tip.style.left = Math.min(e.clientX + 14, window.innerWidth - 250) + 'px';
      tip.style.top = (e.clientY + 16) + 'px';
    } else tip.hidden = true;
  });

  const end = e => {
    el.classList.remove('dragging');
    if (!down) return;
    const d = down; down = null;
    if (R3.arrange && R3.arrange.active && d.moved) {
      if (typeof saveArrangeLayout === 'function') saveArrangeLayout();
      return;
    }
    if (!d.moved && e.type === 'pointerup') {
      const o = pick(e.clientX, e.clientY);
      R3.tapAt = [e.clientX, e.clientY];   // object pop-ups open beside it
      if (o) onAct(o.userData.act);
    }
  };

  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('pointerleave', () => {
    if (!down) {
      R3.hover = null;
      tip.hidden = true;
      if (hoveredObj) { setMeshHighlight(hoveredObj, false); hoveredObj = null; }
    }
  });
}

function onAct(a) {
  fadeHint();
  if (window.handleRoomObjectAction) {
    window.handleRoomObjectAction(a);
    return;
  }
  switch (a.type) {
    case 'book': if (isLocked()) return; if (state.lib.activeId === a.id) openJournal(a.id); else takeDown(a.id); break;
    case 'plus': if (!isLocked()) openDesigner(null); break;
    case 'lamp': toggleLamp(); break;
    case 'window': toggleSky(); break;
    case 'radio': cycleSound(); break;
    case 'plant': openRoomCustom('furniture'); break;
    case 'pens': if (state.lib.activeId) openJournal(state.lib.activeId, null, 'pen'); else toast('Take a journal down from the shelf first.'); break;
    case 'clock': toast('It is ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '.'); break;
  }
}


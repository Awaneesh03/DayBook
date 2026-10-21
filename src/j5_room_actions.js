/* =====================================================================
   Room actions
   ===================================================================== */
function takeDown(id) {
  if (!state.ready) return;
  state.lib.activeId = id; saveLib(); sync3D();
  if (jById(id)) setHint(R3 && R3.mobile ? 'Tap the journal on the desk to open it.' : 'Click the journal on the desk to open it.');
}

let pendingOpen = null;
let openJournalTimer = null;
const opening = () => !!(pendingOpen || openJournalTimer);
function dropPendingOpen() { clearTimeout(openJournalTimer); openJournalTimer = null; pendingOpen = null; if (R3) R3.cam.ret = null; }
// Abandon an open that has not shown the reader yet (Escape, or another camera mode taking over).
function cancelOpen() {
  if (!opening()) return false;
  const r = R3 && R3.cam.ret;
  dropPendingOpen();
  if (R3) resetCameraToRoom(.8, null, r && r.yaw, r && r.pitch);
  return true;
}
function openJournal(id, n, pop) {
  if (!state.ready || !jById(id) || isLocked()) return;
  closeDrawer(); closeSoundPop(); hideMemory(); closeRoomActionPop(); closeRoomCustom();
  const c = R3 && R3.cam;
  // remember the room view so closing the reader lands where the visitor left
  const ret = c ? (c.ret || (c.mode === 'room' ? { yaw: c.yawG, pitch: c.pitchG } : null)) : null;
  if (typeof TOUR !== 'undefined' && TOUR.active) exitRoomTour();
  if (typeof PEEK !== 'undefined' && PEEK.active) exitLookOutside();
  if (R3 && R3.arrange && R3.arrange.active) exitArrangeMode();
  if (c && c.mode === 'explore') exitFreeExplore();
  if (state.lib.activeId !== id) takeDown(id);
  if (RD.open) { flushAll(); showReader(id, n, pop); return; }
  if (!R3) { showReader(id, n, pop); return; }
  c.ret = ret;
  const b = R3.books.get(id);
  const wait = b && b.t < 1 ? (1 - b.t) * b.dur * 1000 : 0;
  clearTimeout(openJournalTimer);
  pendingOpen = null;
  openJournalTimer = setTimeout(() => {
    openJournalTimer = null;
    pendingOpen = { jid: id, n, pop };
    const dp = new T3.Vector3(0, DESK_TOP + (R3.mobile ? .82 : .62), -1.0);
    const dl = new T3.Vector3(0, DESK_TOP, -1.52);
    startCameraTransition(dp, dl, 0.95, null, 'desk');
  }, wait);
}

function writeToday() {
  if (!state.ready) return;
  let id = state.lib.activeId || (state.lib.journals[0] || {}).id;
  if (!id) { openDesigner(null); return; }
  const j = jById(id); let last = 0;
  for (const p of state.pages.values()) if (p.j === id && (p.text || '').trim() && p.n > last) last = p.n;
  let n = 1;
  if (last) {
    const lp = state.pages.get(pageKey(id, last));
    n = lp && lp.date === todayId() ? last : last + 1;
    if (n > j.pages) { j.pages = n; saveLib(); }
  }
  openJournal(id, n);
}

function skyIsNight() { const s = S().sky; if (s === 'night') return true; if (s === 'day') return false; const hr = new Date().getHours(); return hr < 6 || hr >= 19; }
// Weather: the day/night setting says how dark it is, the weather can only deepen that, so every path
// (weather chips, presets, sky toggle, clock) lands on the same sky instead of whichever ran last.
function weatherMode() { const w = S().weather; return WEATHER_MODES[w] ? w : 'clear'; }
function skyTarget() { const w = WEATHER_MODES[weatherMode()]; return w.night ? 1 : Math.max(skyIsNight() ? 1 : 0, w.dim || 0); }
const nightNow = () => skyTarget() >= .5;
function applyWeather() {
  if (!R3 || !R3.rain) return;
  R3.rain.visible = weatherMode() === 'rain';
  R3.nightG = skyTarget(); R3.nightShown = nightNow();
  if (!R3.booted || reduceMotion()) R3.night = R3.nightG; // no fade on load or when motion is reduced
}
// A daytime choice ends Starry Twilight, which only exists at night.
function setSkyMode(v) {
  const st = state.lib.settings; st.sky = v;
  if (WEATHER_MODES[weatherMode()].night && !skyIsNight()) { st.weather = 'clear'; toast('Starry Twilight ended with the daylight.'); }
  saveLib(); applySettings();
}
const SUN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';
function applySettings() {
  const night = nightNow(); const lampOn = S().lamp !== false;
  applyWeather();
  if (R3) { R3.lampG = lampOn ? 1 : 0; if (!R3.booted) R3.lamp = R3.lampG; }
  $('#bLamp').setAttribute('aria-pressed', lampOn ? 'true' : 'false'); $('#bLamp').setAttribute('aria-label', lampOn ? 'Switch the lamp off' : 'Switch the lamp on');
  const sb = $('#bSky'); sb.setAttribute('aria-label', night ? 'Switch to daytime' : 'Switch to night'); sb.innerHTML = night ? SUN_SVG : MOON_SVG;
  $('#bLock').hidden = !S().pinHash;
}
function toggleLamp() {
  if (!state.lib) return; const on = !(S().lamp !== false); state.lib.settings.lamp = on; saveLib(); applySettings();
  if (on && R3) R3.flickerUntil = performance.now() + 550;
  sfx('click');
}
function toggleSky() { if (state.lib) setSkyMode(nightNow() ? 'day' : 'night'); }
function updateHudSub() {
  if (!state.lib) return;
  const st = currentStreak(), w = wordsToday(), g = S().goal;
  const parts = [];
  if (st) parts.push(st + '-day streak');
  if (g) parts.push(Math.min(w, 99999).toLocaleString() + ' of ' + g + ' words today');
  else if (w) parts.push(plural(w, 'word') + ' today');
  if (!parts.length) { const j = jById(state.lib.activeId); parts.push(j ? 'On the desk: ' + j.title : plural(state.lib.journals.length, 'journal') + ' on the shelf'); }
  $('#hudSub').textContent = parts.join(' · ');
}
let hintTimer = null;
function setHint(t) { const el = $('#hint'); el.textContent = t; el.classList.remove('fade'); clearTimeout(hintTimer); hintTimer = setTimeout(fadeHint, 9000); }
function fadeHint() { $('#hint').classList.add('fade'); }

/* =====================================================================
   Guided Interactive Room Tour
   ===================================================================== */
const TOUR = { active: false, index: 0 };
function startRoomTour(idx) {
  if (!R3) return;
  closeDrawer(); closeSoundPop(); hideMemory(); closeRoomActionPop(); closeRoomCustom(); fadeHint();
  if (PEEK.active) exitLookOutside();
  if (R3.cam.mode === 'explore') exitFreeExplore();
  if (R3.arrange && R3.arrange.active) exitArrangeMode();
  TOUR.active = true;
  $('#tourHud').hidden = false;
  goToTourStop(typeof idx === 'number' ? idx : 0);
  sfx('flip');
  // keyboard users land on Next; leaving the tour hands focus back to the Tour button
  requestAnimationFrame(() => { if (TOUR.active) $('#tourNext').focus({ preventScroll: true }); });
}
function exitRoomTour() {
  const hud = $('#tourHud'), hadFocus = hud.contains(document.activeElement);
  TOUR.active = false;
  hud.hidden = true;
  if (hadFocus) { const b = $('#bExplore'); if (b.offsetParent) b.focus({ preventScroll: true }); else document.activeElement.blur(); }
  resetCameraToRoom(1.0);
  sfx('click');
}
function goToTourStop(idx) {
  if (!TOUR_STOPS || !TOUR_STOPS.length) return;
  TOUR.index = clamp(idx | 0, 0, TOUR_STOPS.length - 1); // the first and last stops are ends, not a loop
  const s = TOUR_STOPS[TOUR.index];
  const v = s.portrait && innerWidth / innerHeight < .85 ? s.portrait : s; // a stop may carry a wider pose for tall screens
  startCameraTransition(v.pos, v.target, 1.25, null, 'tour'); // TOUR_STOPS entries hold pos/target/label
  renderTourHud();
}
const tourAtEnd = () => TOUR.index >= TOUR_STOPS.length - 1;
function nextTourStop() { if (tourAtEnd()) return; goToTourStop(TOUR.index + 1); sfx('flip'); }
function prevTourStop() { if (TOUR.index <= 0) return; goToTourStop(TOUR.index - 1); sfx('flip'); }
// The Next button becomes Finish on the last stop; the arrow key just stops there.
function tourNextButton() { if (tourAtEnd()) exitRoomTour(); else nextTourStop(); }
// Tour keys stand down while something else is open on top: library, sounds panel, a room pop-up, a dialog.
const tourCovered = () => isOverlayActive() || !$('#soundPop').hidden || !$('#roomActionPop').hidden;
function renderTourHud() {
  const s = TOUR_STOPS[TOUR.index]; if (!s) return;
  const prev = $('#tourPrev'), next = $('#tourNext'), dots = $('#tourDots');
  const prevFocused = document.activeElement === prev, dotFocused = dots.contains(document.activeElement);
  $('#tourStopTitle').textContent = s.label;
  $('#tourStopDesc').textContent = s.desc;
  $('#tourCount').textContent = 'Stop ' + (TOUR.index + 1) + ' of ' + TOUR_STOPS.length;
  prev.disabled = TOUR.index === 0;
  $('span', next).textContent = tourAtEnd() ? 'Finish' : 'Next';
  next.setAttribute('aria-label', tourAtEnd() ? 'Finish the tour' : 'Next stop');
  dots.textContent = '';
  TOUR_STOPS.forEach((st, i) => dots.append(h('button', {
    type: 'button', class: 'tour-dot' + (i === TOUR.index ? ' active' : ''),
    'aria-label': 'Stop ' + (i + 1) + ': ' + st.label, 'aria-current': i === TOUR.index ? 'step' : null,
    onclick: () => { goToTourStop(i); sfx('click'); }
  })));
  // keep keyboard focus in the bar when its focused control is disabled or redrawn
  if (prevFocused && prev.disabled) next.focus({ preventScroll: true });
  if (dotFocused) dots.children[TOUR.index].focus({ preventScroll: true });
}

/* =====================================================================
   Window Peek Mode
   ===================================================================== */
const PEEK = { active: false };
function lookOutside() {
  if (!R3) return;
  closeDrawer(); closeSoundPop(); hideMemory(); closeRoomActionPop(); closeRoomCustom();
  if (TOUR.active) exitRoomTour();
  PEEK.active = true;
  const hud = $('#peekHud'); if (hud) hud.hidden = false;
  startCameraTransition([1.48, 1.62, -1.9], [1.48, 1.62, -8.0], 1.2, null, 'peek');
  toast(nightNow() ? 'Stargazing into the quiet night skyline.' : 'Gazing through the study window at the horizon.');
  sfx('flip');
}
function exitLookOutside() {
  PEEK.active = false;
  const hud = $('#peekHud'); if (hud) hud.hidden = true;
  resetCameraToRoom(1.0);
  sfx('click');
}

/* =====================================================================
   Free Room Exploration
   ===================================================================== */
function startFreeExplore() {
  if (!R3) return;
  closeDrawer(); closeSoundPop(); hideMemory(); closeRoomActionPop(); closeRoomCustom();
  if (typeof TOUR !== 'undefined' && TOUR.active) exitRoomTour();
  if (typeof PEEK !== 'undefined' && PEEK.active) exitLookOutside();
  if (R3.arrange && R3.arrange.active) exitArrangeMode();

  const c = R3.cam;
  c.explore.pos.set(c.pos.x, 1.44, Math.max(c.pos.z, -0.9));
  c.explore.yaw = c.explore.yawG = 0;
  c.explore.pitch = c.explore.pitchG = 0;
  c.explore.vel.set(0, 0, 0);

  const hud = $('#exploreHud');
  if (hud) hud.hidden = false;
  const sens = $('#expSens');
  if (sens) sens.value = String(S().exploreSpeed || 1.0);

  startCameraTransition(c.explore.pos, new T3.Vector3(0, 1.44, -1.9), 1.0, () => {
    c.mode = 'explore';
  }, 'explore');

  sfx('flip');
  toast('Free exploration active. Drag to look around, WASD or arrows to move.');
}

function exitFreeExplore() {
  const hud = $('#exploreHud');
  if (hud) hud.hidden = true;
  if (R3) {
    R3.cam.explore.keys.w = false;
    R3.cam.explore.keys.a = false;
    R3.cam.explore.keys.s = false;
    R3.cam.explore.keys.d = false;
    resetCameraToRoom(1.0);
  }
  sfx('click');
}

function setExploreSpeed(spd) {
  if (!state.lib) return;
  state.lib.settings.exploreSpeed = clamp(+spd || 1.0, 0.4, 2.5);
  saveLib();
}

/* =====================================================================
   Furniture Arrangement (Move and Rotate Mode)
   ===================================================================== */
let arrangeSaveTimer = null;
function saveArrangeLayout() {
  if (!R3 || !R3.movables) return;
  clearTimeout(arrangeSaveTimer);
  arrangeSaveTimer = setTimeout(() => {
    const layout = S().objectLayout || {};
    for (const [id, m] of R3.movables.entries()) {
      if (m.group) {
        layout[id] = {
          x: +m.group.position.x.toFixed(3),
          y: +m.group.position.y.toFixed(3),
          z: +m.group.position.z.toFixed(3),
          rotY: +m.group.rotation.y.toFixed(3)
        };
      }
    }
    state.lib.settings.objectLayout = layout;
    saveLib();
  }, 200);
}

function startArrangeMode() {
  if (!R3) return;
  closeDrawer(); closeSoundPop(); hideMemory(); closeRoomActionPop(); closeRoomCustom();
  if (typeof TOUR !== 'undefined' && TOUR.active) exitRoomTour();
  if (typeof PEEK !== 'undefined' && PEEK.active) exitLookOutside();
  if (R3.cam.mode === 'explore') exitFreeExplore();
  cancelOpen();

  R3.arrange.active = true;
  const hud = $('#arrangeHud');
  if (hud) hud.hidden = false;

  const firstMovable = R3.movables.keys().next().value || 'plant';
  selectArrangeObject(firstMovable);

  const dp = new T3.Vector3(0, DESK_TOP + 0.82, -1.05);
  const dl = new T3.Vector3(0, DESK_TOP, -1.62);
  startCameraTransition(dp, dl, 1.0, () => {
    R3.cam.mode = 'desk';
  }, 'desk');

  sfx('flip');
  toast('Arrange mode: Click and drag objects across the desk. Rotate with buttons or [ / ] keys.');
}

function exitArrangeMode() {
  if (!R3) return;
  R3.arrange.active = false;
  R3.arrange.selected = null;
  const hud = $('#arrangeHud');
  if (hud) hud.hidden = true;

  saveArrangeLayout();
  resetCameraToRoom(1.0);
  sfx('click');
}

function selectArrangeObject(id) {
  if (!R3 || !R3.movables.has(id)) return;
  R3.arrange.selected = id;
  updateArrangeHudSelection();
}

function updateArrangeHudSelection() {
  const id = R3 && R3.arrange.selected;
  const ctrls = $('#arrangeControls'); if (ctrls) ctrls.hidden = !id; // rotate and reset only apply to a selected object
  const nameEl = $('#arrangeSelectedName');
  if (!nameEl || !id) return;
  const meta = (typeof MOVABLE_OBJECTS !== 'undefined' && MOVABLE_OBJECTS[id]) || {};
  nameEl.textContent = meta.name || (id.charAt(0).toUpperCase() + id.slice(1));
}

function rotateArrangeObject(dir) {
  if (!R3 || !R3.arrange.selected) return;
  const mov = R3.movables.get(R3.arrange.selected);
  if (mov && mov.group) {
    mov.group.rotation.y += (dir || 1) * (Math.PI / 12);
    saveArrangeLayout();
    sfx('click');
  }
}

function resetObjectLayout(id) {
  const targetId = id || (R3 && R3.arrange.selected);
  if (!targetId || !R3) return;
  const mov = R3.movables.get(targetId);
  if (mov && mov.group && mov.basePos) {
    mov.group.position.copy(mov.basePos);
    mov.group.rotation.y = mov.baseRotY || 0;
    if (S().objectLayout) {
      delete S().objectLayout[targetId];
      saveLib();
    }
    const meta = (typeof MOVABLE_OBJECTS !== 'undefined' && MOVABLE_OBJECTS[targetId]) || {};
    toast('Reset position for ' + (meta.label || targetId));
    sfx('rustle');
  }
}

function resetAllObjectLayout() {
  if (!R3) return;
  for (const [, mov] of R3.movables.entries()) {
    if (mov.group && mov.basePos) {
      mov.group.position.copy(mov.basePos);
      mov.group.rotation.y = mov.baseRotY || 0;
    }
  }
  state.lib.settings.objectLayout = {};
  saveLib();
  toast('All desk items reset to default positions.');
  sfx('land');
}

/* =====================================================================
   Room Presets System
   ===================================================================== */
function applyPreset(pId) {
  if (!state.lib) return;
  let p = null;
  if (typeof STARTER_PRESETS !== 'undefined') {
    if (Array.isArray(STARTER_PRESETS)) p = STARTER_PRESETS.find(x => x.id === pId);
    else p = STARTER_PRESETS[pId];
  }
  if (!p && S().customPresets && S().customPresets[pId]) {
    p = S().customPresets[pId];
  }
  if (!p) {
    toast('Preset not found: ' + pId);
    return;
  }

  const src = p.settings || p;
  const keys = [
    'wall', 'wood', 'woodFinish', 'lampTone', 'lampStyle', 'lamp',
    'potStyle', 'artStyle', 'weather', 'sky', 'autoSky',
    'windowOpen', 'curtainsOpen', 'curtainColor', 'clockStyle', 'clockMode', 'showClock',
    'visibleObjects', 'objectLayout'
  ];
  keys.forEach(k => {
    if (src[k] !== undefined) {
      state.lib.settings[k] = JSON.parse(JSON.stringify(src[k]));
    }
  });

  state.lib.settings.activePreset = pId;
  saveLib();
  applyRoomStyle();
  applySettings();
  renderRoomCustom();
  sfx('flip');
  toast('Applied study preset: ' + (p.name || pId));
}

function saveCustomPreset(name) {
  if (!state.lib) return;
  const trimmed = (name || '').trim();
  if (!trimmed) {
    toast('Please enter a name for your preset.');
    return;
  }
  const id = 'custom_' + Date.now().toString(36);
  const st = S();
  const snapshot = {
    id,
    name: trimmed,
    desc: 'Saved study configuration',
    wall: st.wall,
    wood: st.wood,
    woodFinish: st.woodFinish,
    lampTone: st.lampTone,
    lampStyle: st.lampStyle,
    lamp: st.lamp !== false,
    potStyle: st.potStyle,
    artStyle: st.artStyle,
    weather: st.weather,
    sky: st.sky,
    autoSky: st.autoSky,
    windowOpen: st.windowOpen,
    curtainsOpen: st.curtainsOpen !== false,
    curtainColor: st.curtainColor,
    clockStyle: st.clockStyle,
    clockMode: st.clockMode,
    showClock: st.showClock !== false,
    visibleObjects: JSON.parse(JSON.stringify(st.visibleObjects || {})),
    objectLayout: JSON.parse(JSON.stringify(st.objectLayout || {}))
  };

  if (!state.lib.settings.customPresets) state.lib.settings.customPresets = {};
  state.lib.settings.customPresets[id] = snapshot;
  state.lib.settings.activePreset = id;
  saveLib();
  renderRoomCustom();
  sfx('pop');
  toast('Saved custom preset: ' + trimmed);
}

function renameCustomPreset(pId, newName) {
  if (!state.lib || !S().customPresets || !S().customPresets[pId]) return;
  const trimmed = (newName || '').trim();
  if (!trimmed) return;
  state.lib.settings.customPresets[pId].name = trimmed;
  saveLib();
  renderRoomCustom();
  toast('Preset renamed.');
}

function deleteCustomPreset(pId) {
  if (!state.lib || !S().customPresets || !S().customPresets[pId]) return;
  // asked for confirmation in the preset card itself: native confirm() is blocked in sandboxed frames
  delete state.lib.settings.customPresets[pId];
  if (state.lib.settings.activePreset === pId) {
    state.lib.settings.activePreset = 'custom';
  }
  saveLib();
  renderRoomCustom();
  sfx('rustle');
  toast('Preset deleted.');
}

/* =====================================================================
   Window & Curtains Interactive Controls
   ===================================================================== */
function toggleWindowOpen() {
  if (!state.lib) return;
  state.lib.settings.windowOpen = !S().windowOpen;
  saveLib(); applyRoomStyle();
  sfx('flip');
  toast(S().windowOpen ? 'Window opened. A quiet breeze stirs.' : 'Window latched shut.');
}
function toggleCurtains() {
  if (!state.lib) return;
  state.lib.settings.curtainsOpen = !S().curtainsOpen;
  saveLib(); applyRoomStyle();
  sfx('rustle');
  toast(S().curtainsOpen ? 'Curtains drawn wide.' : 'Curtains closed against the glass.');
}
function setCurtainColor(k) {
  if (!state.lib) return;
  state.lib.settings.curtainColor = k;
  saveLib(); applyRoomStyle();
  const name = (CURTAIN_COLORS[k] || {}).name || k;
  toast('Curtain fabric: ' + name);
}

/* =====================================================================
   Wall Clock Interactive Controls
   ===================================================================== */
function toggleClockVisibility() {
  if (!state.lib) return;
  state.lib.settings.showClock = !S().showClock;
  saveLib(); applyRoomStyle();
  toast(S().showClock ? 'Wall clock visible.' : 'Wall clock hidden.');
}
function setClockMode(m) {
  if (!state.lib) return;
  state.lib.settings.clockMode = m;
  saveLib(); applyRoomStyle();
  toast('Clock display: ' + (m.charAt(0).toUpperCase() + m.slice(1)));
}
function setClockStyle(st) {
  if (!state.lib) return;
  state.lib.settings.clockStyle = st;
  saveLib(); applyRoomStyle();
  const name = (CLOCK_STYLES[st] || {}).name || st;
  toast('Clock style: ' + name);
}
function toggleClockSec() {
  if (!state.lib) return;
  state.lib.settings.clockSec = !S().clockSec;
  saveLib(); applyRoomStyle();
  toast(S().clockSec ? 'Second hand active.' : 'Second hand quieted.');
}

/* =====================================================================
   Object Action Popups
   ===================================================================== */
function openRoomActionPop(title, sub, actions) {
  const pop = $('#roomActionPop'); if (!pop) return;
  pop.textContent = '';
  const head = h('div', { class: 'pop-head' },
    h('h3', { text: title }),
    h('button', { type: 'button', class: 'x', 'aria-label': 'Close', onclick: closeRoomActionPop }, '×')
  );
  pop.append(head);
  if (sub) pop.append(h('div', { class: 'pop-sub', text: sub }));
  const actContainer = h('div', { class: 'action-btns' });
  actions.forEach(a => {
    const b = h('button', {
      type: 'button',
      class: 'btn' + (a.primary ? ' prim' : ''),
      onclick: () => { closeRoomActionPop(); a.act(); }
    }, a.label);
    actContainer.append(b);
  });
  pop.append(actContainer);
  pop.hidden = false;
}
function closeRoomActionPop() {
  const pop = $('#roomActionPop'); if (pop) pop.hidden = true;
}

/* =====================================================================
   Room Customizer Modal
   ===================================================================== */
let rcCurTab = 'presets';
let rcPresetEdit = null; // { id, mode: 'rename' | 'delete' } while a custom preset card asks for a name or a confirmation
function openRoomCustom(tab) {
  if (!state.ready) return;
  rcPresetEdit = null;
  closeDrawer(); closeSoundPop(); closeRoomActionPop();
  if (TOUR.active) exitRoomTour();
  if (PEEK.active) exitLookOutside();
  rcCurTab = tab || 'presets';
  const modal = $('#roomCustomModal'); if (modal) modal.hidden = false;
  renderRoomCustom();
}
function closeRoomCustom() {
  const modal = $('#roomCustomModal'); if (modal) modal.hidden = true;
}
function renderRoomCustom() {
  if (rcCurTab !== 'presets') rcPresetEdit = null;
  const tabs = $$('#rcTabs button');
  tabs.forEach(btn => {
    const active = btn.getAttribute('data-rct') === rcCurTab;
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  const body = $('#rcBody'); if (!body) return;
  body.textContent = '';
  const st = S();

  if (rcCurTab === 'presets') {
    // Starter Presets Section
    body.append(h('div', { class: 'rc-field-col' },
      h('p', { class: 'eyebrow', text: 'Curated Room Atmospheres' }),
      h('div', { class: 'presets-grid' },
        typeof STARTER_PRESETS !== 'undefined' ? (Array.isArray(STARTER_PRESETS) ? STARTER_PRESETS : Object.values(STARTER_PRESETS)).map(p => {
          const isAct = st.activePreset === p.id;
          return h('div', { class: 'preset-card' + (isAct ? ' active' : '') },
            h('div', { class: 'preset-card-head' },
              h('span', { class: 'preset-card-title', text: (p.icon ? p.icon + ' ' : '') + p.name }),
              isAct ? h('span', { class: 'preset-badge', text: 'Active' }) : null
            ),
            h('p', { class: 'preset-card-desc', text: p.desc }),
            h('div', { class: 'preset-card-actions' },
              h('button', {
                type: 'button',
                class: 'btn sm' + (isAct ? ' solid' : ' prim'),
                onclick: () => applyPreset(p.id)
              }, isAct ? 'Reapply' : 'Apply Preset')
            )
          );
        }) : []
      )
    ));

    // Custom Presets Section
    const customList = Object.values(st.customPresets || {});
    body.append(h('div', { class: 'rc-field-col' },
      h('p', { class: 'eyebrow', text: 'Your Saved Configurations' }),
      customList.length ? h('div', { class: 'presets-grid' },
        customList.map(p => {
          const isAct = st.activePreset === p.id;
          // rename and delete ask inside the card: prompt() and confirm() are blocked in sandboxed frames
          const mode = rcPresetEdit && rcPresetEdit.id === p.id ? rcPresetEdit.mode : null;
          const edit = m => { rcPresetEdit = m ? { id: p.id, mode: m } : null; renderRoomCustom(); };
          let title = h('span', { class: 'preset-card-title', text: p.name }), actions;
          if (mode === 'rename') {
            title = h('input', { type: 'text', class: 'inp', value: p.name, maxlength: '40', 'aria-label': 'New name for ' + p.name });
            const save = () => { if (!title.value.trim()) { toast('Please type a preset name.'); return; } rcPresetEdit = null; renameCustomPreset(p.id, title.value); };
            title.addEventListener('keydown', e => { if (e.key === 'Enter') save(); else if (e.key === 'Escape') { e.stopPropagation(); edit(null); } });
            requestAnimationFrame(() => { title.focus(); title.select(); });
            actions = [h('button', { type: 'button', class: 'btn sm solid', onclick: save }, 'Save name'), h('button', { type: 'button', class: 'btn sm', onclick: () => edit(null) }, 'Cancel')];
          } else if (mode === 'delete') {
            actions = [h('div', { class: 'confirm' }, h('p', { text: 'Delete “' + p.name + '”? This cannot be undone.' }),
              h('div', { class: 'row' },
                h('button', { type: 'button', class: 'btn sm danger solid', onclick: () => { rcPresetEdit = null; deleteCustomPreset(p.id); } }, 'Delete for good'),
                h('button', { type: 'button', class: 'btn sm', onclick: () => edit(null) }, 'Keep it')))];
          } else {
            actions = [
              h('button', { type: 'button', class: 'btn sm' + (isAct ? ' solid' : ' prim'), onclick: () => applyPreset(p.id) }, 'Apply'),
              h('button', { type: 'button', class: 'btn sm', onclick: () => edit('rename') }, 'Rename'),
              h('button', { type: 'button', class: 'btn sm', onclick: () => edit('delete') }, 'Delete')
            ];
          }
          return h('div', { class: 'preset-card' + (isAct ? ' active' : '') },
            h('div', { class: 'preset-card-head' }, title, isAct ? h('span', { class: 'preset-badge', text: 'Active' }) : null),
            h('p', { class: 'preset-card-desc', text: p.desc || 'Custom configuration' }),
            h('div', { class: 'preset-card-actions' }, actions)
          );
        })
      ) : h('p', { class: 'note', text: 'No custom configurations saved yet.' })
    ));

    // Save Current Snapshot
    const inp = h('input', { type: 'text', placeholder: 'Preset name, e.g. Midnight Writer', class: 'inp', maxlength: '40' });
    body.append(h('div', { class: 'rc-field' },
      h('div', { class: 'rc-field-info' },
        h('span', { class: 'rc-field-title', text: 'Save Current Room' }),
        h('span', { class: 'rc-field-desc', text: 'Record your current wall, wood, lighting, and object arrangement' }),
        inp
      ),
      h('button', {
        type: 'button',
        class: 'btn solid',
        onclick: () => {
          if (inp.value) { saveCustomPreset(inp.value); inp.value = ''; }
          else toast('Please type a preset name.');
        }
      }, 'Save Preset')
    ));

  } else if (rcCurTab === 'walls') {
    const wallKeys = Object.keys(WALLS);
    const wallOpts = Object.fromEntries(wallKeys.map(k => [k, WALLS[k][0]]));
    body.append(h('div', { class: 'rc-field-col' },
      h('p', { class: 'eyebrow', text: 'Wall color & texture' }),
      chipRow(h('div', { class: 'chips' }), wallOpts, st.wall || 'sage', k => { st.wall = k; saveLib(); applyRoomStyle(); renderRoomCustom(); })
    ));

    const woodKeys = Object.keys(WOODS);
    const woodOpts = Object.fromEntries(woodKeys.map(k => [k, WOODS[k][0]]));
    body.append(h('div', { class: 'rc-field-col' },
      h('p', { class: 'eyebrow', text: 'Wood & Furniture tone' }),
      chipRow(h('div', { class: 'chips' }), woodOpts, st.wood || 'walnut', k => { st.wood = k; saveLib(); applyRoomStyle(); renderRoomCustom(); })
    ));

  } else if (rcCurTab === 'furniture') {
    // Wood Finish
    if (typeof FINISH_STYLES !== 'undefined') {
      const finOpts = Object.fromEntries(Object.keys(FINISH_STYLES).map(k => [k, FINISH_STYLES[k].name]));
      body.append(h('div', { class: 'rc-field-col' },
        h('p', { class: 'eyebrow', text: 'Wood Finish & Sheen' }),
        chipRow(h('div', { class: 'chips' }), finOpts, st.woodFinish || 'satin', k => { st.woodFinish = k; saveLib(); applyRoomStyle(); renderRoomCustom(); })
      ));
    }

    // Desk Wood Grain
    const woodKeys = Object.keys(WOODS);
    const woodOpts = Object.fromEntries(woodKeys.map(k => [k, WOODS[k][0]]));
    body.append(h('div', { class: 'rc-field-col' },
      h('p', { class: 'eyebrow', text: 'Desk & Bookshelf grain' }),
      chipRow(h('div', { class: 'chips' }), woodOpts, st.wood || 'walnut', k => { st.wood = k; saveLib(); applyRoomStyle(); renderRoomCustom(); })
    ));

    // Desk Lamp Style
    if (typeof LAMP_STYLES !== 'undefined') {
      const lampOpts = Object.fromEntries(Object.keys(LAMP_STYLES).map(k => [k, LAMP_STYLES[k].name]));
      body.append(h('div', { class: 'rc-field-col' },
        h('p', { class: 'eyebrow', text: 'Desk Lamp Style' }),
        chipRow(h('div', { class: 'chips' }), lampOpts, st.lampStyle || 'banker', k => { st.lampStyle = k; saveLib(); applyRoomStyle(); renderRoomCustom(); })
      ));
    }

    // Plant Pot Style
    if (typeof POT_STYLES !== 'undefined') {
      const potOpts = Object.fromEntries(Object.keys(POT_STYLES).map(k => [k, POT_STYLES[k].name]));
      body.append(h('div', { class: 'rc-field-col' },
        h('p', { class: 'eyebrow', text: 'Potted Plant Style' }),
        chipRow(h('div', { class: 'chips' }), potOpts, st.potStyle || 'terracotta', k => { st.potStyle = k; saveLib(); applyRoomStyle(); renderRoomCustom(); })
      ));
    }

    // Artwork Style
    if (typeof ART_STYLES !== 'undefined') {
      const artOpts = Object.fromEntries(Object.keys(ART_STYLES).map(k => [k, ART_STYLES[k].name]));
      body.append(h('div', { class: 'rc-field-col' },
        h('p', { class: 'eyebrow', text: 'Wall Artwork Canvas' }),
        chipRow(h('div', { class: 'chips' }), artOpts, st.artStyle || 'modernist', k => { st.artStyle = k; saveLib(); applyRoomStyle(); renderRoomCustom(); })
      ));
    }

    // Movable Object Visibility Toggles
    const vis = st.visibleObjects || {};
    const objToggles = [
      ['plant', 'Potted Plant', 'Show lush indoor plant on desk'],
      ['radio', 'Vintage Radio', 'Show audio console on desk'],
      ['cup', 'Pen Cup', 'Show ceramic cup with pens and stylus'],
      ['mug', 'Coffee Mug', 'Show warm coffee cup on desk'],
      ['globe', 'Study Globe', 'Show brass rotating globe']
    ];
    body.append(h('div', { class: 'rc-field-col' },
      h('p', { class: 'eyebrow', text: 'Desk & Shelf Decorations' }),
      ...objToggles.map(([id, title, note]) => {
        const isShown = vis[id] !== false;
        return h('div', { class: 'rc-field' },
          h('div', { class: 'rc-field-info' },
            h('span', { class: 'rc-field-title', text: title }),
            h('span', { class: 'rc-field-desc', text: note })
          ),
          h('button', {
            type: 'button',
            class: 'switch',
            role: 'switch',
            'aria-checked': isShown ? 'true' : 'false',
            'aria-label': 'Toggle ' + title,
            onclick: () => {
              if (!st.visibleObjects) st.visibleObjects = {};
              st.visibleObjects[id] = !isShown;
              saveLib(); applyRoomStyle(); renderRoomCustom();
            }
          })
        );
      })
    ));

    // Arrange Desk Objects Mode Button
    body.append(h('div', { class: 'rc-field' },
      h('div', { class: 'rc-field-info' },
        h('span', { class: 'rc-field-title', text: 'Arrange Desk Objects' }),
        h('span', { class: 'rc-field-desc', text: 'Freely move and rotate items on your writing desk surface' })
      ),
      h('button', {
        type: 'button',
        class: 'btn solid',
        onclick: () => { closeRoomCustom(); startArrangeMode(); }
      }, 'Enter Arrange Mode')
    ));

  } else if (rcCurTab === 'lighting') {
    // Weather
    if (typeof WEATHER_MODES !== 'undefined') {
      const wOpts = Object.fromEntries(Object.keys(WEATHER_MODES).map(k => [k, WEATHER_MODES[k].name]));
      body.append(h('div', { class: 'rc-field-col' },
        h('p', { class: 'eyebrow', text: 'Weather & Atmosphere' }),
        chipRow(h('div', { class: 'chips' }), wOpts, weatherMode(), k => {
          st.weather = k;
          saveLib(); applySettings(); renderRoomCustom();
          const am = weatherAmbience();
          toast('Weather: ' + WEATHER_MODES[k].name + (am ? ' · Try “' + AMBIENTS[am] + '” in Sounds' : ''));
        })
      ));
      // Offer the matching ambience; it only plays if the visitor asks for it.
      const am = weatherAmbience();
      if (am) body.append(h('div', { class: 'rc-field' },
        h('div', { class: 'rc-field-info' },
          h('span', { class: 'rc-field-title', text: 'Pair with the weather' }),
          h('span', { class: 'rc-field-desc', text: 'Your current ambience stays as it is until you choose.' })
        ),
        h('button', { type: 'button', class: 'btn', onclick: () => { setAmbient(am); renderRoomCustom(); } }, 'Play “' + AMBIENTS[am] + '”')
      ));
    }

    // Auto Sky Sync
    body.append(h('div', { class: 'rc-field' },
      h('div', { class: 'rc-field-info' },
        h('span', { class: 'rc-field-title', text: 'Sync Sky with Local Time' }),
        h('span', { class: 'rc-field-desc', text: st.sky === 'auto' ? 'Automatically adapts daylight and night stars to your local clock' : 'Manual sky mode' })
      ),
      h('button', {
        type: 'button',
        class: 'switch',
        role: 'switch',
        'aria-checked': st.sky === 'auto' ? 'true' : 'false',
        'aria-label': 'Sync sky with local time',
        onclick: () => {
          setSkyMode(st.sky === 'auto' ? (skyIsNight() ? 'night' : 'day') : 'auto');
          renderRoomCustom();
          toast(st.sky === 'auto' ? 'Sky synchronized with local time.' : 'Manual sky control active.');
        }
      })
    ));

    // Manual Sky Mode
    body.append(h('div', { class: 'rc-field' },
      h('div', { class: 'rc-field-info' },
        h('span', { class: 'rc-field-title', text: 'Day / Night Override' }),
        h('span', { class: 'rc-field-desc', text: nightNow() ? 'Currently Night (Starlight & City Glow)' : 'Currently Day (Sunlight & Horizon)' })
      ),
      h('button', {
        type: 'button',
        class: 'btn',
        onclick: () => { toggleSky(); renderRoomCustom(); }
      }, nightNow() ? 'Switch to Day' : 'Switch to Night')
    ));

    // Desk Lamp
    body.append(h('div', { class: 'rc-field' },
      h('div', { class: 'rc-field-info' },
        h('span', { class: 'rc-field-title', text: 'Desk Lamp' }),
        h('span', { class: 'rc-field-desc', text: 'Focused warm study spotlight' })
      ),
      h('button', {
        type: 'button',
        class: 'switch',
        role: 'switch',
        'aria-checked': (st.lamp !== false) ? 'true' : 'false',
        'aria-label': 'Toggle desk lamp',
        onclick: () => { toggleLamp(); renderRoomCustom(); }
      })
    ));

    const lampKeys = Object.keys(LAMPS);
    const lampOpts = Object.fromEntries(lampKeys.map(k => [k, LAMPS[k][0]]));
    body.append(h('div', { class: 'rc-field-col' },
      h('p', { class: 'eyebrow', text: 'Lamp light temperature' }),
      chipRow(h('div', { class: 'chips' }), lampOpts, st.lampTone || 'warm', k => { st.lampTone = k; saveLib(); applyRoomStyle(); renderRoomCustom(); })
    ));

  } else if (rcCurTab === 'window') {
    body.append(h('div', { class: 'rc-field' },
      h('div', { class: 'rc-field-info' },
        h('span', { class: 'rc-field-title', text: 'Casement Window' }),
        h('span', { class: 'rc-field-desc', text: st.windowOpen ? 'Dual sashes are swung open to the breeze' : 'Latched firmly shut against the elements' })
      ),
      h('button', {
        type: 'button',
        class: 'switch',
        role: 'switch',
        'aria-checked': st.windowOpen ? 'true' : 'false',
        'aria-label': 'Toggle window',
        onclick: () => { toggleWindowOpen(); renderRoomCustom(); }
      })
    ));

    body.append(h('div', { class: 'rc-field' },
      h('div', { class: 'rc-field-info' },
        h('span', { class: 'rc-field-title', text: 'Window Curtains' }),
        h('span', { class: 'rc-field-desc', text: (st.curtainsOpen !== false) ? 'Drawn open to let the light through' : 'Closed tight across the panes' })
      ),
      h('button', {
        type: 'button',
        class: 'switch',
        role: 'switch',
        'aria-checked': (st.curtainsOpen !== false) ? 'true' : 'false',
        'aria-label': 'Toggle curtains',
        onclick: () => { toggleCurtains(); renderRoomCustom(); }
      })
    ));

    const curKeys = Object.keys(CURTAIN_COLORS);
    const curOpts = Object.fromEntries(curKeys.map(k => [k, CURTAIN_COLORS[k][0]]));
    body.append(h('div', { class: 'rc-field-col' },
      h('p', { class: 'eyebrow', text: 'Curtain fabric & tone' }),
      chipRow(h('div', { class: 'chips' }), curOpts, st.curtainColor || 'ochre', k => { setCurtainColor(k); renderRoomCustom(); })
    ));

    body.append(h('div', { class: 'rc-field' },
      h('div', { class: 'rc-field-info' },
        h('span', { class: 'rc-field-title', text: 'Window View' }),
        h('span', { class: 'rc-field-desc', text: 'Glide up to the window to view the city skyline' })
      ),
      h('button', {
        type: 'button',
        class: 'btn prim',
        onclick: () => { closeRoomCustom(); lookOutside(); }
      }, 'Look outside')
    ));

  } else if (rcCurTab === 'clock') {
    body.append(h('div', { class: 'rc-field' },
      h('div', { class: 'rc-field-info' },
        h('span', { class: 'rc-field-title', text: 'Wall Clock' }),
        h('span', { class: 'rc-field-desc', text: (st.showClock !== false) ? 'Visible on the left wall above the desk' : 'Hidden from the study wall' })
      ),
      h('button', {
        type: 'button',
        class: 'switch',
        role: 'switch',
        'aria-checked': (st.showClock !== false) ? 'true' : 'false',
        'aria-label': 'Toggle clock visibility',
        onclick: () => { toggleClockVisibility(); renderRoomCustom(); }
      })
    ));

    const styleKeys = Object.keys(CLOCK_STYLES);
    const styleOpts = Object.fromEntries(styleKeys.map(k => [k, CLOCK_STYLES[k].name]));
    body.append(h('div', { class: 'rc-field-col' },
      h('p', { class: 'eyebrow', text: 'Clock face aesthetic' }),
      chipRow(h('div', { class: 'chips' }), styleOpts, st.clockStyle || 'daybook', k => { setClockStyle(k); renderRoomCustom(); })
    ));

    const modes = { analog: 'Analog hands', digital: 'Digital LCD', both: 'Dual display' };
    body.append(h('div', { class: 'rc-field-col' },
      h('p', { class: 'eyebrow', text: 'Display mode' }),
      chipRow(h('div', { class: 'chips' }), modes, st.clockMode || 'analog', k => { setClockMode(k); renderRoomCustom(); })
    ));

    body.append(h('div', { class: 'rc-field' },
      h('div', { class: 'rc-field-info' },
        h('span', { class: 'rc-field-title', text: 'Second Hand' }),
        h('span', { class: 'rc-field-desc', text: st.clockSec !== false ? 'Smooth red sweeping second hand' : 'Calm, minimal two-hand display' })
      ),
      h('button', {
        type: 'button',
        class: 'switch',
        role: 'switch',
        'aria-checked': (st.clockSec !== false) ? 'true' : 'false',
        'aria-label': 'Toggle second hand',
        onclick: () => { toggleClockSec(); renderRoomCustom(); }
      })
    ));
  }
}

/* =====================================================================
   Object Interaction Router
   ===================================================================== */
window.handleRoomObjectAction = function(a) {
  if (!a || !state.ready) return;
  fadeHint();

  switch (a.type) {
    case 'book': {
      if (isLocked()) return;
      if (state.lib.activeId === a.id) openJournal(a.id);
      else takeDown(a.id);
      break;
    }
    case 'plus': {
      if (!isLocked()) openDesigner(null);
      break;
    }
    case 'lamp': {
      toggleLamp();
      break;
    }
    case 'window': {
      const isWinOpen = S().windowOpen;
      const isCurtOpen = S().curtainsOpen !== false;
      openRoomActionPop(
        'Study Window',
        'Looking out onto the horizon and skyline.',
        [
          { label: isWinOpen ? 'Latch window shut' : 'Open window', act: toggleWindowOpen, primary: !isWinOpen },
          { label: 'Look outside (Peek)', act: lookOutside },
          { label: isCurtOpen ? 'Draw curtains' : 'Open curtains', act: toggleCurtains },
          { label: 'Window & curtain styles', act: () => openRoomCustom('window') }
        ]
      );
      break;
    }
    case 'curtains': {
      toggleCurtains();
      break;
    }
    case 'clock': {
      const nowStr = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
      openRoomActionPop(
        'Study Wall Clock',
        'Local time is ' + nowStr + '.',
        [
          { label: 'Customize clock', act: () => openRoomCustom('clock'), primary: true },
          { label: S().clockSec !== false ? 'Hide second hand' : 'Show second hand', act: toggleClockSec },
          { label: 'Cycle display mode', act: () => {
            const cur = S().clockMode || 'analog';
            const nxt = cur === 'analog' ? 'digital' : cur === 'digital' ? 'both' : 'analog';
            setClockMode(nxt);
          }}
        ]
      );
      break;
    }
    case 'radio': {
      openRoomActionPop(
        'Vintage Radio',
        'Solid wood study radio console.',
        [
          { label: 'Next ambient sound (' + (AMBIENTS[SND.mode] || 'Quiet') + ')', act: cycleSound, primary: true },
          { label: 'Sounds & volume panel', act: openSoundPop },
          { label: 'Move on desk (Arrange)', act: () => { startArrangeMode(); selectArrangeObject('radio'); } }
        ]
      );
      break;
    }
    case 'pens': {
      if (state.lib.activeId) {
        openJournal(state.lib.activeId, null, 'pen');
      } else {
        openRoomActionPop(
          'Pen Cup',
          'Ceramic cup with fountain pens and stylus.',
          [
            { label: 'Move on desk (Arrange)', act: () => { startArrangeMode(); selectArrangeObject('cup'); }, primary: true },
            { label: 'Browse journal library', act: () => openDrawer('library') }
          ]
        );
      }
      break;
    }
    case 'plant': {
      openRoomActionPop(
        'Potted Plant',
        'Thriving indoor green companion.',
        [
          { label: 'Change pot style & decor', act: () => openRoomCustom('furniture'), primary: true },
          { label: 'Move on desk (Arrange)', act: () => { startArrangeMode(); selectArrangeObject('plant'); } },
          { label: 'Toggle visibility', act: () => {
            if (!S().visibleObjects) state.lib.settings.visibleObjects = {};
            state.lib.settings.visibleObjects.plant = !(S().visibleObjects.plant !== false);
            saveLib(); applyRoomStyle();
          }}
        ]
      );
      break;
    }
    case 'mug': {
      openRoomActionPop(
        'Coffee Mug',
        'Freshly brewed warm drink.',
        [
          { label: 'Take a warm sip', act: () => { sfx('rustle'); toast('A comforting sip of coffee.'); }, primary: true },
          { label: 'Move on desk (Arrange)', act: () => { startArrangeMode(); selectArrangeObject('mug'); } },
          { label: 'Toggle visibility', act: () => {
            if (!S().visibleObjects) state.lib.settings.visibleObjects = {};
            state.lib.settings.visibleObjects.mug = !(S().visibleObjects.mug !== false);
            saveLib(); applyRoomStyle();
          }}
        ]
      );
      break;
    }
    case 'desk': {
      if (state.lib.activeId) openJournal(state.lib.activeId);
      else toast('Select a journal from the shelf to place on your desk.');
      break;
    }
    case 'shelf': {
      openDrawer('library');
      break;
    }
    case 'globe': {
      openRoomActionPop(
        'Study Globe',
        'Detailed geographic sphere with brass meridian.',
        [
          { label: 'Spin globe', act: () => {
            if (R3) { R3.globeSpin = (R3.globeSpin || 0) + 7; sfx('flip'); toast('You gave the globe a spin.'); }
          }, primary: true },
          { label: 'Move on desk (Arrange)', act: () => { startArrangeMode(); selectArrangeObject('globe'); } },
          { label: 'Customize in study panel', act: () => openRoomCustom('furniture') }
        ]
      );
      break;
    }
    case 'art': {
      const artKeys = Object.keys(typeof ART_STYLES !== 'undefined' ? ART_STYLES : { modernist: 1, minimalist: 1, botanical: 1, abstract: 1 });
      const curIdx = artKeys.indexOf(S().artStyle || 'modernist');
      const nextStyle = artKeys[(curIdx + 1) % artKeys.length];
      openRoomActionPop(
        'Study Art Canvas',
        'Framed original artwork: "' + ((ART_STYLES[S().artStyle] || {}).name || 'Modernist') + '".',
        [
          { label: 'Cycle to next style (' + ((ART_STYLES[nextStyle] || {}).name || nextStyle) + ')', act: () => {
            state.lib.settings.artStyle = nextStyle;
            saveLib(); applyRoomStyle();
            toast('Artwork set to ' + ((ART_STYLES[nextStyle] || {}).name || nextStyle));
          }, primary: true },
          { label: 'Open room customizer', act: () => openRoomCustom('furniture') }
        ]
      );
      break;
    }
    default: {
      toast('Study object: ' + a.type);
      break;
    }
  }
};

/* =====================================================================
   Sound: ambience and pen sounds (all generated, no files)
   ===================================================================== */
const SND = { ctx: null, mode: 'off', voice: null, hidden: document.visibilityState === 'hidden' };
const AMBIENTS = { off: 'Quiet', rain: 'Rain on the window', fire: 'Crackling fireplace', ocean: 'Ocean waves', crickets: 'Summer night', cafe: 'Café murmur' };
// Ambience has its own master gain, scaled by the volume setting (the default .6 keeps the old .8 level).
const ambientLevel = () => clamp(+S().volume || 0, 0, 1) * 1.3;
function applyAmbientVolume() { if (SND.master) SND.master.gain.setTargetAtTime(ambientLevel(), SND.ctx.currentTime, .04); }
// Browsers keep audio suspended until the visitor interacts (and after a hidden tab or an interruption).
function wake() {
  const c = SND.ctx; if (!c || c.state === 'running' || c.state === 'closed') return;
  try { const p = c.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* needs a gesture */ }
  armResume(); // a blocked resume() can stay pending, so also retry on the next click or key
}
function audio() {
  if (SND.ctx) { wake(); return SND.ctx; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  try {
    SND.ctx = new AC();
    const len = SND.ctx.sampleRate * 4;
    const mk = brown => { const buf = SND.ctx.createBuffer(1, len, SND.ctx.sampleRate), d = buf.getChannelData(0); let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; } return buf; };
    SND.white = mk(false); SND.brown = mk(true);
    SND.master = SND.ctx.createGain(); SND.master.gain.value = ambientLevel(); SND.master.connect(SND.ctx.destination);
    SND.penGain = SND.ctx.createGain(); SND.penGain.gain.value = S().volume; SND.penGain.connect(SND.ctx.destination);
    SND.ctx.onstatechange = () => { if (SND.ctx.state !== 'running' && !SND.hidden) armResume(); };
  } catch (e) { SND.ctx = null; }
  return SND.ctx;
}
// An ambience is a "voice": its own gain, looping sources and timers, so it can be faded and torn down as one.
function loopNoise(v, brown, type, freq, gain, lfo) {
  const c = SND.ctx; const src = c.createBufferSource(); src.buffer = brown ? SND.brown : SND.white; src.loop = true;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = c.createGain(); g.gain.value = 0;
  g.gain.linearRampToValueAtTime(gain, c.currentTime + 1.5);
  src.connect(f); f.connect(g); g.connect(v.g); src.start(); v.nodes.push(src, f, g);
  if (lfo) { const o = c.createOscillator(); o.frequency.value = lfo; const og = c.createGain(); og.gain.value = gain * .8; o.connect(og); og.connect(g.gain); o.start(); v.nodes.push(o, og); }
}
function burst(freq, q, dur, gain, type, out) {
  const c = SND.ctx; if (!c) return; const src = c.createBufferSource(); src.buffer = SND.white;
  const f = c.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); const t = c.currentTime; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(out || SND.master); src.start(t, Math.random() * 3, dur + .05);
}
function tone(freq, dur, gain, out, type) {
  const c = SND.ctx; if (!c) return; const o = c.createOscillator(); o.type = type || 'sine'; o.frequency.value = freq;
  const g = c.createGain(); const t = c.currentTime; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .005); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(out || SND.master); o.start(t); o.stop(t + dur + .05);
}
const every = (v, ms, fn) => v.timers.push(setInterval(fn, ms));
function buildAmbient(mode) {
  const c = SND.ctx, g = c.createGain(); g.gain.value = 0; g.connect(SND.master);
  const v = { g, nodes: [g], timers: [], dead: false };
  if (mode === 'rain') {
    loopNoise(v, false, 'lowpass', 1500, .16); loopNoise(v, true, 'lowpass', 380, .32);
    every(v, 70, () => { if (Math.random() < .7) burst(2500 + Math.random() * 3500, 2.5, .05, .05 + Math.random() * .06, null, g); });
  } else if (mode === 'fire') {
    loopNoise(v, true, 'lowpass', 520, .5);
    every(v, 55, () => { if (Math.random() < .45) burst(1500 + Math.random() * 4500, .8, .01 + Math.random() * .03, .1 + Math.random() * .3, 'highpass', g); });
  } else if (mode === 'ocean') {
    loopNoise(v, true, 'lowpass', 700, .45, .085); loopNoise(v, false, 'highpass', 2500, .05, .085);
  } else if (mode === 'crickets') {
    loopNoise(v, true, 'lowpass', 300, .18);
    every(v, 380, () => { if (Math.random() < .55) { const f = 4200 + Math.random() * 600; for (let k = 0; k < 3; k++) setTimeout(() => { if (!v.dead) tone(f, .035, .025, g); }, k * 45); } });
  } else if (mode === 'cafe') {
    loopNoise(v, true, 'bandpass', 420, .35); loopNoise(v, false, 'lowpass', 900, .05);
    every(v, 400, () => { if (Math.random() < .08) { tone(2600 + Math.random() * 1500, .25, .03, g); tone(3900 + Math.random() * 800, .2, .015, g); } });
  }
  g.gain.setTargetAtTime(1, c.currentTime, .35); // fade in
  return v;
}
// Fade a voice out, stop its timers now and its sources once the fade has finished.
function retire(v, tau) {
  if (v.dead) return; v.dead = true;
  v.timers.forEach(clearInterval); v.timers = [];
  const t = SND.ctx.currentTime; v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, tau);
  setTimeout(() => v.nodes.forEach(n => { try { if (n.stop) n.stop(); n.disconnect(); } catch (e) { /* already stopped */ } }), tau * 6500);
}
// (Re)build the voice for SND.mode, fading out whatever played before. Nothing sounds while the tab is hidden.
function startAmbient() {
  // the new sound ramps in slowly, so the old one lingers while it is replaced (a real crossfade) and fades fast only into silence
  if (SND.voice) { retire(SND.voice, SND.mode === 'off' || SND.hidden ? .15 : .4); SND.voice = null; }
  if (SND.mode === 'off' || SND.hidden || !SND.ctx) return;
  SND.voice = buildAmbient(SND.mode);
}
function syncSoundUI() {
  const on = SND.mode !== 'off';
  const btn = $('#bSound'); btn.setAttribute('aria-pressed', on ? 'true' : 'false'); btn.setAttribute('aria-label', 'Sounds: ' + AMBIENTS[SND.mode]);
  if (R3 && R3.radioLed) R3.radioLed.color.set(on ? 0xffb347 : 0x3a2a20);
  if (!$('#soundPop').hidden) renderSoundPop();
}
function setAmbient(next) {
  if (!AMBIENTS[next]) next = 'off';
  if (next !== 'off' && !audio()) { toast('Sound is not available in this browser.'); return; }
  const changed = next !== SND.mode;
  SND.mode = next;
  if (changed || (next !== 'off' && !SND.voice)) startAmbient();
  if (next !== 'off') wake();
  if (state.lib && state.lib.settings.ambient !== next) { state.lib.settings.ambient = next; saveLib(); }
  syncSoundUI();
}
// A saved ambience cannot start on page load (browsers need a click or key first), so it waits for the first one.
let resumeArmed = false;
function armResume() {
  if (resumeArmed || SND.mode === 'off') return;
  resumeArmed = true;
  const evs = ['pointerdown', 'pointerup', 'keydown', 'touchend']; // inputs browsers accept as permission to play
  const disarm = () => { resumeArmed = false; evs.forEach(e => document.removeEventListener(e, go, true)); };
  const go = () => {
    if (SND.mode === 'off') { disarm(); return; }
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; // Esc and the like are not a click: wait for a real one
    const c = audio(); if (!c) { disarm(); return; }
    const ready = () => { if (c.state === 'running') { disarm(); if (!SND.voice) startAmbient(); } };
    if (c.state === 'running') ready(); else { try { c.resume().then(ready, () => {}); } catch (e) { /* stays armed */ } }
  };
  evs.forEach(e => document.addEventListener(e, go, true));
}
// Leave no timers or audio work running behind a hidden tab; pick the ambience back up on return.
function ambientVisibility(hidden) {
  SND.hidden = hidden;
  if (hidden) {
    if (SND.voice) { retire(SND.voice, .08); SND.voice = null; }
    setTimeout(() => { if (SND.hidden && SND.ctx && SND.ctx.state === 'running') SND.ctx.suspend().catch(() => {}); }, 400);
  } else if (SND.ctx) { wake(); if (!SND.voice) startAmbient(); }
}
// The ambience that fits the current weather, unless it is already selected. Only ever suggested.
function weatherAmbience() { const a = WEATHER_MODES[weatherMode()].ambient; return a && a !== SND.mode ? a : null; }
function cycleSound() { const order = Object.keys(AMBIENTS); const n = order[(order.indexOf(SND.mode) + 1) % order.length]; setAmbient(n); toast(AMBIENTS[n]); }
let lastPenSnd = 0;
function sfx(kind, pen) {
  if (!S().penSound) return; if (!audio()) return;
  const out = SND.penGain; SND.penGain.gain.value = S().volume;
  const now = performance.now();
  if (kind === 'pen') {
    if (now - lastPenSnd < 35) return; lastPenSnd = now;
    const snd = (PENS[pen] || PENS.fountain).snd;
    if (snd === 'scratch') burst(2600 + Math.random() * 1400, .9, .06 + Math.random() * .04, .07, 'bandpass', out);
    else if (snd === 'smooth') burst(1500 + Math.random() * 600, 1.2, .05, .05, 'bandpass', out);
    else if (snd === 'pencil') { burst(4200 + Math.random() * 2000, .7, .07, .09, 'highpass', out); }
    else if (snd === 'felt') burst(800 + Math.random() * 300, 1, .08, .07, 'bandpass', out);
    else if (snd === 'type') { burst(2200, .6, .025, .45, 'highpass', out); burst(180, 1, .05, .35, 'lowpass', out); }
  } else if (kind === 'enter' && (PENS[pen] || {}).snd === 'type') { tone(2093, .7, .14, out); burst(500, .8, .18, .25, 'bandpass', out); }
  else if (kind === 'flip') { burst(1800, .5, .32, .08, 'bandpass', out); setTimeout(() => burst(3200, .6, .18, .04, 'bandpass', out), 120); }
  else if (kind === 'rustle') { if (now - lastPenSnd < 60) return; lastPenSnd = now; burst(2400 + Math.random() * 2000, .5, .12, .035, 'bandpass', out); }
  else if (kind === 'land') { burst(260, .8, .12, .16, 'lowpass', out); burst(1500, .6, .1, .03, 'bandpass', out); }
  else if (kind === 'pop') { tone(660, .09, .08, out, 'triangle'); setTimeout(() => tone(990, .12, .06, out, 'triangle'), 60); }
  else if (kind === 'click') burst(3000, 1, .02, .2, 'highpass', out);
  else if (kind === 'cheer') [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .35, .07, out, 'triangle'), i * 90));
}
function renderSoundPop() {
  const pop = $('#soundPop'); pop.textContent = '';
  pop.append(h('div', { class: 'pop-head' }, h('h3', { text: 'Sounds' }), h('button', { type: 'button', class: 'x', 'aria-label': 'Close', onclick: closeSoundPop }, '×')));
  pop.append(h('fieldset', null, h('legend', { text: 'Room ambience' }), h('div', { class: 'chips' }, Object.keys(AMBIENTS).map(k => h('button', { type: 'button', class: 'chip', 'aria-pressed': SND.mode === k ? 'true' : 'false', onclick: () => setAmbient(k) }, AMBIENTS[k])))));
  pop.append(settingToggle('Pen sounds', 'A soft scratch as you write; clacks for the typewriter', 'penSound'));
  const vol = h('input', { type: 'range', min: '0', max: '1', step: '.05', value: String(S().volume), 'aria-label': 'Sound volume' });
  vol.addEventListener('input', () => { state.lib.settings.volume = +vol.value; if (SND.penGain) SND.penGain.gain.value = +vol.value; applyAmbientVolume(); });
  vol.addEventListener('change', () => { saveLib(); sfx('pen', 'pencil'); });
  pop.append(h('label', { class: 'rng' }, h('span', { text: 'Volume' }), vol, h('output', { text: '' })));
}
function openSoundPop() { const p = $('#soundPop'); if (!p.hidden) { closeSoundPop(); return; } p.hidden = false; renderSoundPop(); }
function closeSoundPop() { $('#soundPop').hidden = true; }
function settingToggle(title, note, key, after) {
  const sw = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': S()[key] ? 'true' : 'false', 'aria-label': title });
  sw.addEventListener('click', () => { state.lib.settings[key] = !S()[key]; sw.setAttribute('aria-checked', S()[key] ? 'true' : 'false'); saveLib(); if (after) after(); });
  return h('div', { class: 'toggle' }, h('div', null, title, h('small', { text: note })), sw);
}

/* =====================================================================
   Confetti
   ===================================================================== */
const FX = { parts: [], raf: 0 };
function confetti(x, y, n) {
  if (reduceMotion()) return;
  const c = $('#fx'); const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = window.innerWidth * dpr; c.height = window.innerHeight * dpr;
  const cols = ['#F6C445', '#E8505B', '#4FB3BF', '#7C5CBF', '#8BC34A', '#FF8A3D', '#ffffff'];
  for (let i = 0; i < (n || 120); i++) {
    const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 9;
    FX.parts.push({ x: x * dpr, y: y * dpr, vx: Math.cos(a) * sp * dpr, vy: (Math.sin(a) * sp - 7) * dpr, r: Math.random() * 6, vr: (Math.random() - .5) * .4, s: (5 + Math.random() * 6) * dpr, c: cols[i % cols.length], life: 1 });
  }
  if (!FX.raf) FX.raf = requestAnimationFrame(fxStep);
}
function fxStep() {
  const c = $('#fx'), x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height);
  FX.parts = FX.parts.filter(p => p.life > 0);
  for (const p of FX.parts) {
    p.vy += .32; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= .009;
    x.save(); x.globalAlpha = Math.min(1, p.life * 2); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); x.restore();
  }
  FX.raf = FX.parts.length ? requestAnimationFrame(fxStep) : 0;
  if (!FX.raf) x.clearRect(0, 0, c.width, c.height);
}
function celebrate(msg, el) {
  const r = el ? el.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };
  confetti(r.left + r.width / 2, r.top + r.height / 2, 140); sfx('cheer'); toast(msg);
}
function checkMilestones() {
  if (!state.lib) return;
  const st = S(); const t = todayId(); const g = st.goal; const w = wordsToday();
  if (g && w >= g && st.goalDay !== t) { st.goalDay = t; saveLib(); celebrate('Daily goal reached: ' + plural(w, 'word') + ' today. Well written!', $('#goal')); return; }
  const s = currentStreak();
  if (MILESTONES.includes(s) && s > (st.celebrated || 0)) { st.celebrated = s; saveLib(); celebrate(s + '-day streak! Keep it going.', $('#goal')); }
}

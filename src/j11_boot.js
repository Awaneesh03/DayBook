/* =====================================================================
   Boot
   ===================================================================== */
function genPaperTextures() {
  const noise = makeCanvas(180, 180, (c, w, hh) => { const id = c.createImageData(w, hh); for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = Math.random() * 28; } c.putImageData(id, 0, 0); });
  const fiber = makeCanvas(260, 260, (c, w, hh) => { const r = rng(7); for (let i = 0; i < 480; i++) { const x = r() * w, y = r() * hh, l = 4 + r() * 14, a = r() * 6.3; c.strokeStyle = r() < .5 ? 'rgba(60,35,10,.22)' : 'rgba(255,240,210,.22)'; c.lineWidth = .5 + r() * .8; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); } for (let i = 0; i < 260; i++) { c.fillStyle = 'rgba(50,30,10,.28)'; c.fillRect(r() * w, r() * hh, 1.3, 1.3); } });
  const stain = makeCanvas(420, 420, (c, w, hh) => { const r = rng(11); for (let i = 0; i < 9; i++) { const x = r() * w, y = r() * hh, rad = 20 + r() * 70; const g = c.createRadialGradient(x, y, rad * .2, x, y, rad); g.addColorStop(0, 'rgba(120,80,30,0)'); g.addColorStop(.8, 'rgba(120,80,30,.12)'); g.addColorStop(1, 'rgba(120,80,30,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, 6.3); c.fill(); } for (let i = 0; i < 140; i++) { c.fillStyle = 'rgba(90,60,20,' + (r() * .28) + ')'; c.beginPath(); c.arc(r() * w, r() * hh, r() * 1.6, 0, 6.3); c.fill(); } });
  const root = document.documentElement.style;
  root.setProperty('--tex-noise', 'url(' + noise.toDataURL() + ')');
  root.setProperty('--tex-fiber', 'url(' + fiber.toDataURL() + ')');
  root.setProperty('--tex-stain', 'url(' + stain.toDataURL() + ')');
}
function fontsReady() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const fams = ['600 40px "Cormorant Garamond"', '40px "Pinyon Script"', '700 40px "Caveat"', '500 20px "Caveat"', '700 40px "Manrope"', '600 40px "Manrope"', '40px "Special Elite"', '300 20px "Kalam"', '20px "Patrick Hand"', '20px "Reenie Beanie"', '500 20px "Dancing Script"', '700 20px "Dancing Script"', '20px "Homemade Apple"', '20px "Nanum Brush Script"', 'italic 500 20px "Cormorant Garamond"'];
  return Promise.race([Promise.all(fams.map(f => document.fonts.load(f).catch(() => null))), new Promise(r => setTimeout(r, 3000))]);
}
function wireUI() {
  const spread = $('#spread'); ['L', 'R'].forEach((s, i) => { const el = buildPageEl(s, i); pageEls.push(el); spread.append(el); });
  buildLock(); bindStudio(); bindSwipe();
  $('#bToday').addEventListener('click', writeToday);
  $('#bShelf').addEventListener('click', () => { if ($('#drawer').classList.contains('open')) closeDrawer(); else openDrawer(); });
  $('#bNew').addEventListener('click', () => openDesigner(null));
  $('#bLamp').addEventListener('click', toggleLamp);
  $('#bSky').addEventListener('click', toggleSky);
  $('#bSound').addEventListener('click', openSoundPop);
  $('#bLock').addEventListener('click', showLock);
  const bExp = $('#bExplore'); if (bExp) bExp.addEventListener('click', () => startRoomTour(0));
  const bExpFree = $('#bExploreFree'); if (bExpFree) bExpFree.addEventListener('click', startFreeExplore);
  const expExit = $('#exploreExit'); if (expExit) expExit.addEventListener('click', exitFreeExplore);
  const expSens = $('#expSens'); if (expSens) expSens.addEventListener('input', () => setExploreSpeed(expSens.value));

  const arrDone = $('#arrangeDone'); if (arrDone) arrDone.addEventListener('click', exitArrangeMode);
  const arrRotL = $('#arrangeRotL'); if (arrRotL) arrRotL.addEventListener('click', () => rotateArrangeObject(-1));
  const arrRotR = $('#arrangeRotR'); if (arrRotR) arrRotR.addEventListener('click', () => rotateArrangeObject(1));
  const arrResetObj = $('#arrangeResetObj'); if (arrResetObj) arrResetObj.addEventListener('click', () => resetObjectLayout());
  const arrResetAll = $('#arrangeResetAll'); if (arrResetAll) arrResetAll.addEventListener('click', resetAllObjectLayout);

  const bCust = $('#bCustomize'); if (bCust) bCust.addEventListener('click', () => openRoomCustom('presets'));
  const tPrev = $('#tourPrev'); if (tPrev) tPrev.addEventListener('click', prevTourStop);
  const tNext = $('#tourNext'); if (tNext) tNext.addEventListener('click', tourNextButton);
  const tExit = $('#tourExit'); if (tExit) tExit.addEventListener('click', exitRoomTour);
  const pExit = $('#peekExit'); if (pExit) pExit.addEventListener('click', exitLookOutside);
  const rcCl = $('#rcClose'); if (rcCl) rcCl.addEventListener('click', closeRoomCustom);
  const rcDn = $('#rcDone'); if (rcDn) rcDn.addEventListener('click', closeRoomCustom);
  const rcMd = $('#roomCustomModal'); if (rcMd) rcMd.addEventListener('click', e => { if (e.target.id === 'roomCustomModal') closeRoomCustom(); });
  $$('#rcTabs [data-rct]').forEach(b => b.addEventListener('click', () => { rcCurTab = b.dataset.rct; renderRoomCustom(); }));
  $('#drClose').addEventListener('click', closeDrawer);
  $$('.dtabs [data-dt]').forEach(b => b.addEventListener('click', () => { LB.tab = b.dataset.dt; renderDrawer(); }));
  $('#rClose').addEventListener('click', closeReader);
  $('#rPrev').addEventListener('click', () => turn(-1));
  $('#rNext').addEventListener('click', () => turn(1));
  $('#rDraw').addEventListener('click', () => toggleDraw());
  $$('[data-pop]').forEach(b => b.addEventListener('click', () => openPop(b.dataset.pop)));
  $$('.s-tabs [data-st]').forEach(b => b.addEventListener('click', () => { DS.tab = b.dataset.st; if (DS.tab === 'draw' || DS.tab === 'style') DS.sel = -1; renderStudio(); }));
  $('#dClose').addEventListener('click', closeDesigner); $('#dCancel').addEventListener('click', closeDesigner);
  $('#dSave').addEventListener('click', saveDesigner); $('#dUndo').addEventListener('click', undoStudio);
  $('#designer').addEventListener('click', e => { if (e.target.id === 'designer') closeDesigner(); });
  $('#fileCover').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; addCoverPhoto(f); });
  $('#filePage').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; addPhotoFromFile(f); });
  $('#wLook').addEventListener('click', hideWelcome);
  $('#wStart').addEventListener('click', () => { hideWelcome(); writeToday(); });
  document.addEventListener('pointerdown', e => {
    if (RD.pop && RD.pop !== 'note' && !e.target.closest('#pop') && !e.target.closest('[data-pop]') && !e.target.closest('.page')) closePop();
    if ($('#drawer').classList.contains('open') && !e.target.closest('#drawer') && !e.target.closest('#bShelf') && !e.target.closest('.modal')) closeDrawer();
    if (!$('#soundPop').hidden && !e.target.closest('#soundPop') && !e.target.closest('#bSound')) closeSoundPop();
    if (!$('#roomActionPop').hidden && !e.target.closest('#roomActionPop')) closeRoomActionPop();
  });
  document.addEventListener('keydown', e => {
    if (isLocked()) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); flushAll(); toast('Saved.'); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !$('#designer').hidden && !/TEXTAREA|INPUT/.test(document.activeElement.tagName)) { e.preventDefault(); undoStudio(); return; }
    if (e.key === 'Escape') {
      if (!RD.open && cancelOpen()) return;
      if (R3 && R3.arrange && R3.arrange.active) { exitArrangeMode(); return; }
      if (R3 && R3.cam && R3.cam.mode === 'explore') { exitFreeExplore(); return; }
      if (typeof TOUR !== 'undefined' && TOUR.active && !tourCovered()) { exitRoomTour(); return; } // else close what covers it first
      if (typeof PEEK !== 'undefined' && PEEK.active) { exitLookOutside(); return; }
      if (!$('#roomActionPop').hidden) { closeRoomActionPop(); return; }
      if (!$('#roomCustomModal').hidden) { closeRoomCustom(); return; }
      if (!$('#welcome').hidden) hideWelcome();
      else if (!$('#designer').hidden) closeDesigner();
      else if (RD.drawing) toggleDraw(false);
      else if (RD.sel) { RD.sel = null; renderItemsAll(); }
      else if (RD.pop) closePop();
      else if (RD.open) closeReader();
      else { closeDrawer(); closeSoundPop(); }
      return;
    }
    const typing = /TEXTAREA|INPUT/.test((document.activeElement || {}).tagName || '');
    if (typing) return;

    if (R3 && R3.cam && R3.cam.mode === 'explore' && !RD.open) {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') { R3.cam.explore.keys.w = true; }
      if (k === 's' || k === 'arrowdown') { R3.cam.explore.keys.s = true; }
      if (k === 'a' || k === 'arrowleft') { R3.cam.explore.keys.a = true; }
      if (k === 'd' || k === 'arrowright') { R3.cam.explore.keys.d = true; }
    } else if (R3 && R3.arrange && R3.arrange.active) {
      if (e.key === '[' || e.key === '{') { rotateArrangeObject(-1); }
      if (e.key === ']' || e.key === '}') { rotateArrangeObject(1); }
      if (e.key.toLowerCase() === 'r') { resetObjectLayout(); }
    } else if (typeof TOUR !== 'undefined' && TOUR.active && !tourCovered()) {
      if (e.key === 'ArrowRight') { nextTourStop(); return; }
      if (e.key === 'ArrowLeft') { prevTourStop(); return; }
    } else if (RD.open && $('#designer').hidden) {
      if (e.key === 'ArrowRight') turn(1);
      if (e.key === 'ArrowLeft') turn(-1);
    }
  });

  document.addEventListener('keyup', e => {
    if (!R3 || !R3.cam || R3.cam.mode !== 'explore') return;
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'arrowup') { R3.cam.explore.keys.w = false; }
    if (k === 's' || k === 'arrowdown') { R3.cam.explore.keys.s = false; }
    if (k === 'a' || k === 'arrowleft') { R3.cam.explore.keys.a = false; }
    if (k === 'd' || k === 'arrowright') { R3.cam.explore.keys.d = false; }
  });

  let rz = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { resize3D(); if (RD.open) renderReader(true); if (DS.draft) { sizeStudioCanvas(); drawPreview(); } }); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { flushAll(); LK.hiddenAt = Date.now(); }
    else if (S().pinHash && LK.hiddenAt && Date.now() - LK.hiddenAt > 180000) showLock();
    if (R3) { R3.paused = document.visibilityState === 'hidden' || RD.open; R3.last = performance.now(); }
    ambientVisibility(document.visibilityState === 'hidden');
  });
  window.addEventListener('pagehide', () => flushAll());
}
async function boot() {
  genPaperTextures();
  wireUI();
  await fontsReady();
  const has3d = init3D();
  if (!has3d) document.body.classList.add('no3d');

  let st = null;
  try { st = await cloudStore(); } catch (e) { st = null; }
  if (!st) st = localStore();
  let init;
  try { init = await st.init(); } catch (e) { st = localStore(); init = await st.init(); }
  state.store = st;

  const pages = init.pages || {};
  let lib = init.lib; const toWrite = [];
  if (!lib || !Array.isArray(lib.journals)) {
    lib = defaultLib();
    if (init.legacy && init.legacy.length) toWrite.push(...importLegacy(lib, pages, init.legacy));
    state.lib = lib; saveLib(true);
  } else state.lib = normLib(lib);
  Object.keys(pages).forEach(k => state.pages.set(k, pages[k]));
  toWrite.forEach(k => queue(() => st.writePage(k, pages[k])));
  try { st.subscribe(onRemoteLib, onRemotePages, () => toast('Lost the connection to your journals. Changes on screen will retry.')); } catch (e) { /* local store */ }
  state.ready = true;
  state.lib.journals.forEach(j => artMids(j).forEach(loadMedia));

  applySettings(); applyRoomStyle(); sync3D();
  SND.mode = AMBIENTS[S().ambient] ? S().ambient : 'off'; syncSoundUI(); armResume(); // saved ambience resumes on the first click or key
  if (R3) R3.booted = true;
  updateHudSub();
  $('#loader').classList.add('gone');
  if (S().pinHash) showLock();
  checkRestored();
  if (has3d) setHint(R3.mobile ? 'Tap a journal to take it down, then tap it on the desk to open. Drag to look around.' : 'Click a journal to take it down, then click it on the desk to open. Drag to look around.');
  else { openDrawer(); fadeHint(); }
  if (!S().welcomed && !S().pinHash) setTimeout(() => showWelcome(), has3d ? 1400 : 300);
  else setTimeout(showMemory, 2200);
  try { if (window.claude && typeof window.claude.use === 'function') downloadsApi = await window.claude.use('downloads'); } catch (e) { downloadsApi = null; }
  window.Daybook = {
    state, R3, TOUR, PEEK, S,
    startRoomTour, exitRoomTour, nextTourStop, prevTourStop, goToTourStop,
    lookOutside, exitLookOutside,
    startFreeExplore, exitFreeExplore, setExploreSpeed,
    startArrangeMode, exitArrangeMode, selectArrangeObject, rotateArrangeObject, resetObjectLayout, resetAllObjectLayout, saveArrangeLayout,
    applyPreset, saveCustomPreset, deleteCustomPreset, renameCustomPreset,
    toggleWindowOpen, toggleCurtains, setCurtainColor,
    toggleClockVisibility, setClockMode, setClockStyle, toggleClockSec,
    openRoomCustom, closeRoomCustom,
    openJournal, takeDown, closeReader, writeToday,
    openDrawer, closeDrawer,
    applyRoomStyle, applySettings, sfx, toast,
    SND, setAmbient, cycleSound, weatherMode, skyTarget
  };
}
boot();

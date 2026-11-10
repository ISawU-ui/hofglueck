// ===== Eingabe & Spielschleife =====
'use strict';

const GROUP = { plow: 'sow', plant: 'sow', harvest: 'harvest', remove: 'shovel', unplow: 'shovel' };
const pointers = new Map(); // aktive Finger/Maus: id -> {x, y}
let mode = null;            // null | 'pendingPaint' | 'paint' | 'maybeTap' | 'pan' | 'pinch' | 'moveGhost'
let pend = null;            // Touch: Feld-Aktion kurz zurückhalten, falls ein zweiter Finger (Zoom) folgt
let drag = null;            // Aktionsgruppe beim Malen über Felder
let lastTile = null, startPt = null, pinch = null;

function localPt(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function tileAt(pt) {
  const w = screenToWorld(pt.x, pt.y);
  if (S.placing) { const d = BUILDINGS[S.placing]; return { x: Math.floor(w.x / TILE - d.w / 2 + 0.5), y: Math.floor(w.y / TILE - d.h / 2 + 0.5) }; }
  return { x: Math.floor(w.x / TILE), y: Math.floor(w.y / TILE) };
}

function act(x, y) {
  const a = actionFor(x, y, S.tool);
  if (!a || (drag && GROUP[a] !== drag)) return null;
  doAction(x, y, a, S.tool);
  if (a === 'plow' && S.tool !== 'schaufel') doAction(x, y, 'plant', S.tool); // Gras: pflügen und gleich säen
  return a;
}

// Tippen auf Dinge, die keine Feld-Aktion sind (wird erst beim Loslassen ausgelöst)
function tapAt(x, y) {
  if (S.placing) { S.hover = { x, y }; renderUI(); return; } // Bauen: Vorschau dorthin setzen, bestätigt wird mit ✔
  if (townHit(x, y) && y > 0 && y < MAP_H - 1) { openTab('stadt'); sfx('click'); return; }
  if (!inMap(x, y)) return;
  const t = tile(x, y);
  if (t.b) { clickBuilding(G.buildings[t.b]); renderUI(); return; }
  const dec = DECOR.find((d) => x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h);
  if (dec && dec.id === 'teich') { openPond(); sfx('click'); return; }
  if (dec) { openTab({ tafel: 'auftraege', scheune: 'scheune', haus: 'erfolge' }[dec.id]); sfx('click'); return; }
  const p = parcelAt(x, y);
  if (p && !G.parcels[p.i] && parcelBuyable(p.i)) { askParcel(p.i); return; }
  if (S.tool === 'hand' && t.s === 'soil' && !t.c && owned(x, y)) toast('✋ Umsehen ist aktiv – wähle links eine Pflanze zum Säen');
}
// liegt der Punkt auf der Bau-Vorschau? (dann verschiebt Ziehen die Vorschau statt der Karte)
function onGhost(pt) {
  if (!S.placing || !S.hover) return false;
  const w = screenToWorld(pt.x, pt.y), d = BUILDINGS[S.placing], h = S.hover;
  return w.x >= h.x * TILE - 10 && w.x <= (h.x + d.w) * TILE + 10 && w.y >= h.y * TILE - 10 && w.y <= (h.y + d.h) * TILE + 10;
}

function onDown(e) {
  if (e.button === 2) return;
  canvas.setPointerCapture(e.pointerId);
  const pt = localPt(e);
  pointers.set(e.pointerId, pt);
  if (pointers.size === 2) { // zweiter Finger: Zoomen + Verschieben, Malen abbrechen
    if (pend) { clearTimeout(pend.timer); pend = null; }
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    mode = 'pinch'; drag = null; return;
  }
  if (pointers.size > 2) return;
  if (closeDrawer()) { mode = null; return; } // offenes Menü auf dem Handy: erst schließen
  const { x, y } = tileAt(pt);
  S.hover = { x, y };
  if (S.placing) {
    if (e.pointerType === 'mouse') { S.hover = { x, y }; confirmPlace(); mode = null; renderUI(); return; } // Maus: Klick = bauen
    mode = onGhost(pt) ? 'moveGhost' : 'maybeTap'; startPt = pt; return; // Touch: erst Vorschau, dann ✔
  }
  if (inMap(x, y) && !tile(x, y).b && actionFor(x, y, S.tool)) {
    if (e.pointerType === 'mouse') { pend = { x, y }; commitPaint(); }
    else { mode = 'pendingPaint'; pend = { x, y, timer: setTimeout(commitPaint, 90) }; }
    return;
  }
  mode = 'maybeTap'; startPt = pt; // entscheidet sich beim Bewegen (Verschieben) oder Loslassen (Tippen)
}

function commitPaint() {
  if (!pend) return;
  clearTimeout(pend.timer);
  const { x, y } = pend; pend = null;
  const a = act(x, y);
  if (a) { mode = 'paint'; drag = GROUP[a]; lastTile = x + ',' + y; renderUI(); } else mode = null;
}

function onMove(e) {
  const pt = localPt(e);
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, pt);
  if (mode === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    panBy(mx - pinch.mx, my - pinch.my);
    if (pinch.d > 10) zoomAt(d / pinch.d, mx, my);
    pinch = { d, mx, my };
    return;
  }
  const pos = tileAt(pt);
  if (mode === 'moveGhost') { S.hover = pos; return; }
  if (S.placing && e.pointerType !== 'mouse') { /* Vorschau bleibt stehen, Karte wird verschoben */ }
  else if (e.pointerType === 'mouse' || mode) S.hover = pos;
  if (mode === 'maybeTap' && Math.hypot(pt.x - startPt.x, pt.y - startPt.y) > 8) mode = 'pan';
  if (mode === 'pan') { panBy(pt.x - startPt.x, pt.y - startPt.y); startPt = pt; }
  if (mode === 'pendingPaint' && pend && (pos.x !== pend.x || pos.y !== pend.y)) commitPaint();
  if (mode === 'paint') {
    const key = pos.x + ',' + pos.y;
    if (key !== lastTile) { lastTile = key; act(pos.x, pos.y); }
  }
  if (e.pointerType === 'mouse') {
    const t = inMap(pos.x, pos.y) && tile(pos.x, pos.y);
    canvas.style.cursor = mode === 'pan' ? 'grabbing' : S.placing || (t && (t.b || actionFor(pos.x, pos.y, S.tool))) ? 'pointer' : 'grab';
  }
}

function onUp(e) {
  pointers.delete(e.pointerId);
  if (mode === 'pendingPaint') commitPaint();
  if (mode === 'maybeTap' && e.type === 'pointerup') { const { x, y } = tileAt(localPt(e)); tapAt(x, y); }
  if (mode === 'paint') renderUI();
  if (mode === 'pinch' && pointers.size === 1) { mode = 'pan'; startPt = [...pointers.values()][0]; return; }
  if (mode === 'moveGhost') renderUI();
  if (pointers.size === 0) { mode = null; drag = null; lastTile = null; if (e.pointerType !== 'mouse' && !S.placing) S.hover = null; }
}

function clickBuilding(b) {
  const d = BUILDINGS[b.type];
  if (d.kind === 'boost') { openBuilding(b.id); return; }
  if (d.kind === 'horse' && b.foal) { onFoal(b, false); return; }
  if (b.job && b.job.p >= 1) { collect(b); return; }
  if (d.kind === 'tree') { toast(d.icon + ' ' + d.name + ': reif in ' + fmtTime((1 - (b.job ? b.job.p : 0)) * d.time / prodMul())); openBuilding(b.id); return; }
  if (!b.job && (d.kind !== 'horse' || canBreed(b)) && hasAll(recipe(b).in)) { startJob(b); return; }
  openBuilding(b.id);
}

function onKey(e) {
  if (e.key === 'Escape') { if (!$('#modal').hidden && $('#modal').dataset.kind !== 'slotstart') closeModal(); S.placing = null; closeDrawer(); renderUI(); return; }
  if (e.key === 's' || e.key === 'S') { handleAct('tool', 'schaufel'); renderUI(); return; }
  if (e.key === 'h' || e.key === 'H') { handleAct('tool', 'hand'); renderUI(); return; }
  if (e.key === 'Enter' && S.placing) { confirmPlace(); renderUI(); return; }
  if (e.key === '+' || e.key === '=') { const c = availCenter(); zoomAt(1.25, c.x, c.y); return; }
  if (e.key === '-') { const c = availCenter(); zoomAt(0.8, c.x, c.y); return; }
  const n = parseInt(e.key, 10), ids = Object.keys(CROPS);
  if (n >= 1 && n <= ids.length && G.level >= CROPS[ids[n - 1]].level) { handleAct('tool', ids[n - 1]); renderUI(); }
}

// ---------- Start ----------
// Begrüßung: neue Spieler bekommen die Einführung, bestehende einmal die Neuigkeiten
function greet(away) {
  if (!G.introDone) showIntro(0);
  else if (G.seen < NEWS_VERSION) showNews();
  else if (away > 60) {
    const h = Math.floor(away / 3600), m = Math.floor((away % 3600) / 60);
    openModal(`<h2>🌅 Willkommen zurück!</h2><p>Du warst ${h ? h + ' Std. ' : ''}${m} Min. weg.<br>Deine Pflanzen und Tiere haben weitergearbeitet.</p><button data-act="close">Los geht's</button>`);
  }
  if (modalQueue.length && $('#modal').hidden) openModal(modalQueue.shift());
}

function start() {
  const away = load();
  initRender();
  initUI();
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !mode && !S.placing) S.hover = null; });
  // iPhone: kein nachträglicher „Klick“ nach dem Tippen auf die Karte – sonst trifft er ein Popup, das gerade darunter aufgeht
  canvas.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); const p = localPt(e); zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y); }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (S.placing) { S.placing = null; renderUI(); return; }
    const { x, y } = tileAt(localPt(e));
    if (inMap(x, y) && tile(x, y).b) openBuilding(tile(x, y).b);
  });
  $('#zoombtns').addEventListener('click', (e) => {
    const b = e.target.closest('[data-zoom]'); if (!b) return;
    const c = availCenter();
    if (b.dataset.zoom === 'in') zoomAt(1.3, c.x, c.y);
    else if (b.dataset.zoom === 'out') zoomAt(1 / 1.3, c.x, c.y);
    else resetCam(true);
  });
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && !modalJustOpened() && $('#modal').dataset.kind !== 'slotstart') closeModal(); });
  window.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  // Beim Start zuerst die Spielstände – danach die Begrüßung für den gewählten Hof
  openSlots(true, away);

  renderUI();
  resize(); // jetzt sind Werkzeugleiste & Anzeigen gefüllt → freien Bereich neu messen
  let last = performance.now(), uiTimer = 0, saveTimer = 0;
  function frame(now) {
    const dt = Math.max(0, (now - last) / 1000); last = now;
    update(dt);                 // auch große Sprünge (Tab war im Hintergrund) sind ok
    updateFX(Math.min(dt, 0.1));
    updateCam(Math.min(dt, 0.1));
    draw(now);
    uiTimer += dt; saveTimer += dt;
    if (uiTimer > 0.25) { uiTimer = 0; renderUI(); }
    if (saveTimer > 5) { saveTimer = 0; save(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

window.addEventListener('load', start);

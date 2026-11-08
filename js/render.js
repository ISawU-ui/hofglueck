// ===== Zeichnen der Welt =====
'use strict';

// gemeinsamer Bedien-Zustand (wird von ui.js / main.js geändert)
const S = { tool: 'weizen', placing: null, hover: null };
const view = { scale: 1, ox: 0, oy: 0, dpr: 1 };
let canvas, ctx;

const WORLD_TW = MAP_W + TOWN_W;                 // Kacheln in der Breite: Hof + Stadt
const WORLD_W = WORLD_TW * TILE, WORLD_H = MAP_H * TILE;
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const isPath = (x, y) => (x === 3 && y >= 1 && y <= 14) || (y === 14 && x >= 0 && x < WORLD_TW);
const isCobble = (x, y) => { const t = x - TOWN_X0; return t >= 4 && t <= 5 && y >= 1 && y <= 13; };

function initRender() {
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');
  buildGround();
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(resize);
    ['#stage', '#toolbar', '#topbar', '#panel'].forEach((s) => ro.observe(document.querySelector(s)));
  }
  resize();
}
// Handy quer = kompaktes Layout (gleiche Grenze wie in style.css)
const isCompact = () => window.matchMedia('(max-height: 540px)').matches;

// Kamera: Mittelpunkt in Welt-Koordinaten + Zoom. auto = folgt automatisch dem eigenen Hof
const cam = { x: WORLD_W / 2, y: WORLD_H / 2, z: 1, auto: true, target: null };
// Bühne = Größe der Leinwand; l/r/t/b = Ränder, die von schwebenden Bedienelementen verdeckt sind
let stage = { w: 1, h: 1, l: 0, r: 0, t: 0, b: 0 };
let vignette = null;
function measureInsets(r) {
  if (!isCompact()) return { l: 0, r: 0, t: 0, b: 0 };
  const box = (s) => document.querySelector(s).getBoundingClientRect();
  const tb = box('#toolbar'), pn = box('#panel'), top = box('#topbar');
  return { l: Math.max(0, tb.right - r.left) + 6, r: Math.max(0, r.right - pn.left) + 6, t: Math.max(0, top.bottom - r.top) + 6, b: 6 };
}

function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  view.dpr = window.devicePixelRatio || 1;
  canvas.width = r.width * view.dpr; canvas.height = r.height * view.dpr;
  canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
  stage = { w: r.width, h: r.height, ...measureInsets(r) };
  const W = canvas.width, H = canvas.height;
  vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.62);
  vignette.addColorStop(0, 'rgba(20,30,10,0)'); vignette.addColorStop(1, 'rgba(20,30,10,0.28)');
  if (cam.auto) autoCam();
  applyCam();
}
const availW = () => Math.max(50, stage.w - stage.l - stage.r);
const availH = () => Math.max(50, stage.h - stage.t - stage.b);
// Mitte des freien Bereichs (Bildschirm-Koordinaten der Leinwand)
const availCenter = () => ({ x: stage.l + availW() / 2, y: stage.t + availH() / 2 });
const minZoom = () => Math.min(availW() / WORLD_W, availH() / WORLD_H);
const maxZoom = () => Math.max(minZoom(), 1.5);

// Auf dem Handy auf das eigene Land zoomen, am Computer den ganzen Hof zeigen
function autoView() {
  if (!isCompact()) return { x: MAP_W * TILE / 2, y: WORLD_H / 2, z: Math.min(availW() / (MAP_W * TILE), availH() / WORLD_H) };
  let x0 = 99, y0 = 99, x1 = 0, y1 = 0;
  G.parcels.forEach((own, i) => {
    if (!own) return;
    const px = PARCEL_X0 + (i % PARCEL_COLS) * PARCEL, py = PARCEL_Y0 + Math.floor(i / PARCEL_COLS) * PARCEL;
    x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px + PARCEL); y1 = Math.max(y1, py + PARCEL);
  });
  x0 -= 1; y0 -= 1; x1 += 1; y1 += 1; // etwas Rand, damit man die Nachbar-Schilder sieht
  return { x: (x0 + x1) / 2 * TILE, y: (y0 + y1) / 2 * TILE, z: Math.min(availW() / ((x1 - x0) * TILE), availH() / ((y1 - y0) * TILE)) };
}
function autoCam() { const v = autoView(); cam.x = v.x; cam.y = v.y; cam.z = v.z; }

function applyCam() {
  cam.z = Math.min(maxZoom(), Math.max(minZoom(), cam.z));
  const hw = availW() / 2 / cam.z, hh = availH() / 2 / cam.z;
  cam.x = WORLD_W <= hw * 2 ? WORLD_W / 2 : Math.min(WORLD_W - hw, Math.max(hw, cam.x));
  cam.y = WORLD_H <= hh * 2 ? WORLD_H / 2 : Math.min(WORLD_H - hh, Math.max(hh, cam.y));
  view.scale = cam.z;
  const c = availCenter();
  view.ox = c.x - cam.x * cam.z;
  view.oy = c.y - cam.y * cam.z;
}

// sanft zu einem Ziel gleiten (Stadt ansehen, zurück zum Hof)
function flyTo(v, auto) { cam.target = { ...v, auto }; }
function updateCam(dt) {
  const t = cam.target; if (!t) return;
  const k = 1 - Math.pow(0.002, dt);
  cam.x += (t.x - cam.x) * k; cam.y += (t.y - cam.y) * k; cam.z += (t.z - cam.z) * k;
  if (Math.abs(t.x - cam.x) < 1 && Math.abs(t.y - cam.y) < 1 && Math.abs(t.z - cam.z) < 0.002) { cam.x = t.x; cam.y = t.y; cam.z = t.z; cam.target = null; cam.auto = t.auto; }
  applyCam();
}
function focusTown() {
  flyTo({ x: (TOWN_X0 + TOWN_W / 2) * TILE, y: WORLD_H / 2, z: Math.min(availW() / (TOWN_W * TILE), availH() / (14 * TILE)) }, false);
}

// Zoomen um einen Bildschirmpunkt (sx, sy), der dabei an derselben Stelle der Welt bleibt
function zoomAt(factor, sx, sy) {
  cam.target = null;
  const w = screenToWorld(sx, sy);
  cam.z = Math.min(maxZoom(), Math.max(minZoom(), cam.z * factor));
  const c = availCenter();
  cam.x = w.x - (sx - c.x) / cam.z;
  cam.y = w.y - (sy - c.y) / cam.z;
  cam.auto = false; applyCam();
}
function panBy(dx, dy) { cam.target = null; cam.x -= dx / cam.z; cam.y -= dy / cam.z; cam.auto = false; applyCam(); }
function resetCam(smooth) { if (smooth) flyTo(autoView(), true); else { cam.target = null; cam.auto = true; autoCam(); applyCam(); } }

// Auf kleinen Bildschirmen Schilder, Zahlen und Texte auf der Karte größer zeichnen
function uiK() { return Math.min(1.7, Math.max(1, 0.75 / view.scale)); }
function screenToWorld(px, py) { return { x: (px - view.ox) / view.scale, y: (py - view.oy) / view.scale }; }
function visibleRect() {
  const a = screenToWorld(0, 0), b = screenToWorld(stage.w, stage.h);
  return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
}

function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function shade(hex, amt) { // Farbe aufhellen (amt > 0) oder abdunkeln (amt < 0)
  const n = parseInt(hex.slice(1), 16), f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// ---------- Pixel-Grafik (Sammelbild aus make_atlas.py, Stil „Pixel-Hof“) ----------
// Fehlt js/atlas.js, zeichnet das Spiel automatisch wieder die alte Canvas-/Emoji-Grafik.
const ATL = new Image();
let atlasReady = false;
if (typeof ATLAS_SRC !== 'undefined') { ATL.onload = () => { atlasReady = true; if (canvas) buildGround(); }; ATL.src = ATLAS_SRC; }
const PX = { grass: '#6ea24b', dirt: '#b8854b', dirtDark: '#9a6a40', water: '#5472bc' };
// Sprite zeichnen: (x, y) = unten Mitte (Füße), flip = gespiegelt, sc = Vergrößerung
function spr(g, name, i, x, y, flip = false, sc = 1) {
  const set = atlasReady && SPR[name]; if (!set) return false;
  const [sx, sy, w, h, ox, oy, W0, H0] = set[((i % set.length) + set.length) % set.length];
  const dy = Math.round(y + (oy - H0) * sc);
  if (flip) {
    const dx = Math.round(x + (W0 / 2 - ox - w) * sc);
    g.save(); g.translate(dx + w * sc, 0); g.scale(-1, 1); g.drawImage(ATL, sx, sy, w, h, 0, dy, w * sc, h * sc); g.restore();
  } else g.drawImage(ATL, sx, sy, w, h, Math.round(x + (ox - W0 / 2) * sc), dy, w * sc, h * sc);
  return true;
}
// Höhe eines Sprites über seinem Fußpunkt (für Blasen über dem Dach)
const sprTop = (name, i = 0) => { const f = atlasReady && SPR[name] && SPR[name][i]; return f ? f[7] - f[5] : 0; };
// 9-teiliger Rahmen aus 16-px-Stücken (Zaun, Teichufer): Ecken + Kanten werden wiederholt
function nineSlice(g, name, i, x, y, w, h, skipCenter = true) {
  const f = SPR[name][i], [sx, sy] = f, nx = Math.round(w / 16), ny = Math.round(h / 16);
  for (let j = 0; j < ny; j++) for (let k = 0; k < nx; k++) {
    const c = k === 0 ? 0 : k === nx - 1 ? 2 : 1, r = j === 0 ? 0 : j === ny - 1 ? 2 : 1;
    if (skipCenter && c === 1 && r === 1) continue;
    g.drawImage(ATL, sx + c * 16, sy + r * 16, 16, 16, x + k * 16, y + j * 16, 16, 16);
  }
}
// nur obere / untere Hälfte eines Zauns (damit Tiere zwischen den Zaunteilen stehen)
function fenceRing(g, x, y, w, h, part) {
  const f = SPR.fence9[0], [sx, sy] = f, nx = Math.round(w / 16), ny = Math.round(h / 16);
  for (let j = 0; j < ny; j++) for (let k = 0; k < nx; k++) {
    const c = k === 0 ? 0 : k === nx - 1 ? 2 : 1, r = j === 0 ? 0 : j === ny - 1 ? 2 : 1;
    if (c === 1 && r === 1) continue;
    const front = j >= ny / 2;
    if ((part === 'back' && front) || (part === 'front' && !front)) continue;
    g.drawImage(ATL, sx + c * 16, sy + r * 16, 16, 16, x + k * 16, y + j * 16, 16, 16);
  }
}

// ---------- Hauptfunktion ----------
function draw(time) {
  const T = time / 1000;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#3f7a35'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const s = view.scale * view.dpr;
  ctx.setTransform(s, 0, 0, s, view.ox * view.dpr, view.oy * view.dpr);
  const vr = visibleRect();

  // Pixel-Grafik: scharfe Pixel, nur beim starken Verkleinern weich (sonst flimmert es)
  ctx.imageSmoothingEnabled = !atlasReady || s < 2;
  ctx.drawImage(groundCv, 0, 0, WORLD_W, WORLD_H);
  ctx.imageSmoothingEnabled = !atlasReady || s < 0.9;
  if (atlasReady) drawTrees(vr, 0);
  if (vr.x0 < 3 * TILE) drawDecor(T);
  drawParcels();
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) drawCrop(x, y, T);
  if (vr.x1 > TOWN_X0 * TILE) drawTown(T);
  const bs = Object.values(G.buildings).sort((a, b) => a.y - b.y);
  for (const b of bs) drawBuilding(b, T);
  for (const b of bs) drawBubble(b, T);
  drawTrees(vr, atlasReady ? 15 : null);
  drawAmbient(T);
  drawHover(T);
  drawPointer(T);
  drawFX(ctx);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ---------- Boden: einmal vorzeichnen, danach nur noch kopieren ----------
let groundCv = null;
function buildGround() {
  const GS = 2;
  groundCv = document.createElement('canvas');
  groundCv.width = WORLD_W * GS; groundCv.height = WORLD_H * GS;
  const g = groundCv.getContext('2d');
  g.scale(GS, GS);
  if (atlasReady) { buildGroundPixel(g); return; }
  g.fillStyle = '#69bb4d'; g.fillRect(0, 0, WORLD_W, WORLD_H);
  // weiche helle/dunkle Flecken, damit die Wiese lebendig wirkt
  for (let i = 0; i < 1100; i++) {
    const x = hash(i, 1) * WORLD_W, y = hash(i, 2) * WORLD_H, r = 8 + hash(i, 3) * 30;
    g.fillStyle = hash(i, 4) > 0.5 ? 'rgba(150,210,95,0.16)' : 'rgba(55,135,45,0.14)';
    g.beginPath(); g.ellipse(x, y, r, r * 0.65, hash(i, 5) * 3, 0, 7); g.fill();
  }
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < WORLD_TW; x++) {
    if (isPath(x, y) || isCobble(x, y)) continue;
    const px = x * TILE, py = y * TILE;
    for (let k = 0; k < 3; k++) { // Grasbüschel
      const h = hash(x * 3 + k, y * 5 + 1); if (h < 0.35) continue;
      const gx = px + 6 + hash(x + k, y * 7) * 36, gy = py + 10 + hash(y + k, x * 11) * 34;
      g.strokeStyle = h > 0.7 ? '#4c9638' : '#58a842'; g.lineWidth = 1.6; g.lineCap = 'round'; g.beginPath();
      g.moveTo(gx - 3, gy); g.lineTo(gx - 5, gy - 6); g.moveTo(gx, gy); g.lineTo(gx, gy - 8); g.moveTo(gx + 3, gy); g.lineTo(gx + 5, gy - 6);
      g.stroke();
    }
    const f = hash(x, y + 9);
    if (f > 0.9) { // Blümchen
      const c = ['#fff6a8', '#ffb3c7', '#ffffff', '#c9b6ff'][Math.floor(hash(y, x + 3) * 4)];
      const fx = px + 10 + hash(x, y * 2) * 28, fy = py + 10 + hash(y, x * 2) * 28;
      g.fillStyle = c; for (let a = 0; a < 5; a++) { g.beginPath(); g.arc(fx + Math.cos(a * 1.26) * 2.6, fy + Math.sin(a * 1.26) * 2.6, 2, 0, 7); g.fill(); }
      g.fillStyle = '#f4b400'; g.beginPath(); g.arc(fx, fy, 1.5, 0, 7); g.fill();
    } else if (f < 0.04) { g.fillStyle = '#9aa39a'; g.beginPath(); g.ellipse(px + 24, py + 28, 4, 3, 0, 0, 7); g.fill(); }
  }
  // Feldwege (Erde) mit weichem Grasrand
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < WORLD_TW; x++) {
    if (!isPath(x, y)) continue;
    const px = x * TILE, py = y * TILE;
    g.fillStyle = '#dcbc80'; g.fillRect(px, py, TILE, TILE);
    g.fillStyle = 'rgba(160,120,60,0.35)';
    for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(px + hash(x + i, y * 3) * 44 + 2, py + hash(x * 7, y + i) * 44 + 2, 2.4, 1.6, 0, 0, 7); g.fill(); }
    if (y === 14) { g.fillStyle = 'rgba(150,110,55,0.22)'; g.fillRect(px, py + 14, TILE, 4); g.fillRect(px, py + 30, TILE, 4); } // Fahrspuren
  }
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < WORLD_TW; x++) {
    if (!isPath(x, y)) continue;
    const px = x * TILE, py = y * TILE;
    const side = [[0, -1, px, py, 1, 0], [0, 1, px, py + TILE, 1, 0], [-1, 0, px, py, 0, 1], [1, 0, px + TILE, py, 0, 1]];
    for (const [dx, dy, sx, sy, ax, ay] of side) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= WORLD_TW || ny >= MAP_H || isPath(nx, ny) || isCobble(nx, ny)) continue;
      g.fillStyle = '#69bb4d';
      for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(sx + ax * (k * 12 + hash(x * 9 + k, y) * 6), sy + ay * (k * 12 + hash(x, y * 9 + k) * 6), 3 + hash(k, x + y) * 3, 0, 7); g.fill(); }
    }
  }
  // Kopfsteinpflaster in der Stadt
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < WORLD_TW; x++) {
    if (!isCobble(x, y)) continue;
    const px = x * TILE, py = y * TILE;
    g.fillStyle = '#a79f90'; g.fillRect(px, py, TILE, TILE);
    for (let r = 0; r < 4; r++) for (let c = -1; c < 4; c++) {
      const sx = px + c * 14 + (r % 2) * 7 + 1, sy = py + r * 12 + 1;
      g.fillStyle = ['#cfc7b8', '#c2baaa', '#d8d0c2', '#bdb4a3'][Math.floor(hash(x * 13 + c, y * 7 + r) * 4)];
      g.save(); g.beginPath(); g.rect(px, py, TILE, TILE); g.clip();
      g.beginPath(); g.roundRect(sx, sy, 12, 10, 3); g.fill(); g.restore();
    }
  }
}

// Pixel-Boden: Wiese mit Grasbüscheln, Feldwege, Pflaster in der Stadt
function buildGroundPixel(g) {
  g.imageSmoothingEnabled = false;
  g.fillStyle = PX.grass; g.fillRect(0, 0, WORLD_W, WORLD_H);
  for (let i = 0; i < 700; i++) { // ganz leichte helle/dunkle Flecken
    const x = Math.round(hash(i, 1) * WORLD_W), y = Math.round(hash(i, 2) * WORLD_H), r = 10 + hash(i, 3) * 26;
    g.fillStyle = hash(i, 4) > 0.5 ? 'rgba(150,195,95,0.10)' : 'rgba(70,120,50,0.10)';
    g.beginPath(); g.ellipse(x, y, r, r * 0.6, 0, 0, 7); g.fill();
  }
  const flowers = ['#f4efd8', '#f2b6c6', '#f6d76b', '#c7b8f0'];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < WORLD_TW; x++) {
    if (isPath(x, y) || isCobble(x, y)) continue;
    const px = x * TILE, py = y * TILE;
    for (let k = 0; k < 2; k++) {
      const h = hash(x * 3 + k, y * 5 + 1); if (h < 0.45) continue;
      spr(g, 'tuft', Math.floor(h * 60), px + 8 + Math.round(hash(x + k, y * 7) * 32), py + 14 + Math.round(hash(y + k, x * 11) * 32));
    }
    const f = hash(x, y + 9);
    if (f > 0.9) { // Pixel-Blümchen
      const fx = px + 8 + Math.round(hash(x, y * 2) * 30), fy = py + 8 + Math.round(hash(y, x * 2) * 30);
      g.fillStyle = flowers[Math.floor(hash(y, x + 3) * 4)];
      g.fillRect(fx - 2, fy, 2, 2); g.fillRect(fx + 2, fy, 2, 2); g.fillRect(fx, fy - 2, 2, 2); g.fillRect(fx, fy + 2, 2, 2);
      g.fillStyle = '#e8a33a'; g.fillRect(fx, fy, 2, 2);
    } else if (f < 0.03) spr(g, 'spot', Math.floor(hash(y, x) * 4), px + 24, py + 40);
  }
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < WORLD_TW; x++) { // Feldwege
    if (!isPath(x, y)) continue;
    const px = x * TILE, py = y * TILE;
    g.fillStyle = PX.dirt; g.fillRect(px, py, TILE, TILE);
    g.fillStyle = 'rgba(120,80,45,0.45)';
    for (let i = 0; i < 6; i++) g.fillRect(px + Math.round(hash(x + i, y * 3) * 44), py + Math.round(hash(x * 7, y + i) * 44), 2 + (i % 2) * 2, 2);
    g.fillStyle = 'rgba(235,190,120,0.35)';
    for (let i = 0; i < 4; i++) g.fillRect(px + Math.round(hash(x + i, y * 5) * 44), py + Math.round(hash(x * 5, y + i) * 44), 2, 2);
    if (y === 14) { g.fillStyle = 'rgba(120,80,45,0.28)'; g.fillRect(px, py + 14, TILE, 4); g.fillRect(px, py + 30, TILE, 4); }
  }
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < WORLD_TW; x++) { // Grasrand am Weg
    if (!isPath(x, y)) continue;
    const px = x * TILE, py = y * TILE;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= WORLD_TW || ny >= MAP_H || isPath(nx, ny) || isCobble(nx, ny)) continue;
      g.fillStyle = PX.grass;
      for (let k = 0; k < 8; k++) {
        const t = k * 6 + Math.round(hash(x * 9 + k, y + dx) * 3), d = 2 + Math.round(hash(k, x + y * 3 + dy) * 3);
        if (dy) g.fillRect(px + t, dy < 0 ? py : py + TILE - d, 6, d); else g.fillRect(dx < 0 ? px : px + TILE - d, py + t, d, 6);
      }
    }
  }
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < WORLD_TW; x++) { // Pflaster in den Steinfarben von Paket A
    if (!isCobble(x, y)) continue;
    const px = x * TILE, py = y * TILE;
    if (SPR.pflaster) { const p = SPR.pflaster[0]; g.drawImage(ATL, p[0] + (x % 2) * 48, p[1] + (y % 2) * 48, 48, 48, px, py, TILE, TILE); continue; }
    g.fillStyle = '#5b5560'; g.fillRect(px, py, TILE, TILE);
    for (let r = 0; r < 4; r++) for (let c = -1; c < 4; c++) {
      const sx = px + c * 14 + (r % 2) * 7 + 1, sy = py + r * 12 + 1, v = hash(x * 13 + c, y * 7 + r);
      const x0 = Math.max(px, sx), x1 = Math.min(px + TILE, sx + 12);
      if (x1 - x0 < 2) continue;
      g.fillStyle = v < 0.5 ? '#8697ba' : v < 0.8 ? '#7d8bab' : '#8fa3c4'; g.fillRect(x0, sy, x1 - x0, 10);
      g.fillStyle = 'rgba(200,220,245,0.45)'; g.fillRect(x0, sy, x1 - x0, 2);
      g.fillStyle = 'rgba(40,40,60,0.35)'; g.fillRect(x0, sy + 8, x1 - x0, 2);
    }
  }
}

function drawTrees(vr, onlyRow) {
  if (atlasReady) { // Waldrand oben und unten: Pixel-Bäume und Büsche
    for (let x = 0; x < WORLD_TW; x++) {
      const y = onlyRow, h = hash(x, y + 50), px = x * TILE + 24 + Math.round((h - 0.5) * 14);
      if (px < vr.x0 - 60 || px > vr.x1 + 60) continue;
      const by = y * TILE + (y === 0 ? 40 : 46);
      if (h > 0.45) spr(ctx, 'wald', Math.floor(hash(x, y + 51) * 4), px, by, hash(x, y + 52) > 0.5);
      else spr(ctx, 'busch', Math.floor(hash(x, y + 51) * 6), px, by - 4, hash(x, y + 52) > 0.5);
    }
    return;
  }
  for (let x = 0; x < WORLD_TW; x++) for (const y of [0, 15]) {
    const h = hash(x, y + 50), px = x * TILE + 24 + (h - 0.5) * 14, py = y * TILE + (y === 0 ? 30 : 34);
    if (px < vr.x0 - 40 || px > vr.x1 + 40) continue;
    const r = 17 + hash(x, y + 51) * 6;
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(px + 4, py + 10, r + 2, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#6b4423'; ctx.fillRect(px - 4, py - 4, 8, 14);
    if (h > 0.78) { // Tanne
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = ['#2c6a35', '#327a3c', '#3b8a45'][k];
        ctx.beginPath(); ctx.moveTo(px - r + k * 4, py - k * 11); ctx.lineTo(px, py - 30 - k * 9); ctx.lineTo(px + r - k * 4, py - k * 11); ctx.fill();
      }
      continue;
    }
    ctx.fillStyle = '#2f7d32'; ctx.beginPath(); ctx.arc(px, py - 14, r, 0, 7); ctx.fill();
    ctx.fillStyle = '#3a9139'; ctx.beginPath(); ctx.arc(px - 4, py - 18, r * 0.72, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(160,230,120,0.45)'; ctx.beginPath(); ctx.arc(px - 7, py - 23, r * 0.35, 0, 7); ctx.fill();
  }
}

function drawDecor(T) {
  for (const d of DECOR) {
    const x = d.x * TILE, y = d.y * TILE, w = d.w * TILE, h = d.h * TILE;
    if (atlasReady && drawDecorPixel(d, x, y, w, h, T)) {
      outlinedText(ctx, d.id === 'teich' && G.level >= POND.level ? 'Teich – Angeln' : d.name, x + w / 2, y + h - 2, 11, '#fff');
      continue;
    }
    if (d.id !== 'teich') { ctx.fillStyle = 'rgba(0,0,0,0.18)'; rr(x + 8, y + 12, w - 10, h - 10, 8); ctx.fill(); }
    if (d.id === 'haus') {
      // Fachwerkhaus
      ctx.fillStyle = '#f6e7c8'; rr(x + 12, y + 56, w - 24, h - 62, 3); ctx.fill();
      ctx.strokeStyle = '#6b4423'; ctx.lineWidth = 4;
      ctx.strokeRect(x + 12, y + 56, w - 24, h - 62);
      ctx.beginPath(); ctx.moveTo(x + 12, y + 96); ctx.lineTo(x + w - 12, y + 96); ctx.moveTo(x + w / 2, y + 56); ctx.lineTo(x + w / 2, y + 96);
      ctx.moveTo(x + 12, y + 56); ctx.lineTo(x + 36, y + 96); ctx.moveTo(x + w - 12, y + 56); ctx.lineTo(x + w - 36, y + 96); ctx.stroke();
      // Dach mit Ziegelreihen
      ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(x + 2, y + 62); ctx.lineTo(x + w / 2, y + 8); ctx.lineTo(x + w - 2, y + 62); ctx.fill();
      ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(120,20,15,0.45)'; ctx.lineWidth = 2;
      for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(x, y + 18 + k * 9); ctx.lineTo(x + w, y + 18 + k * 9); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = '#e8574a'; ctx.beginPath(); ctx.moveTo(x + w / 2, y + 8); ctx.lineTo(x + w / 2 + 6, y + 14); ctx.lineTo(x + w / 2 - 6, y + 14); ctx.fill();
      ctx.fillStyle = '#7d2a20'; ctx.fillRect(x + w - 42, y + 16, 12, 22);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let k = 0; k < 3; k++) { const q = (T * 0.4 + k / 3) % 1; ctx.beginPath(); ctx.arc(x + w - 36 + q * 10, y + 12 - q * 26, 3 + q * 5, 0, 7); ctx.fill(); }
      for (const wx of [x + 22, x + w - 44]) { // Fenster mit Blumenkasten
        ctx.fillStyle = '#fff'; ctx.fillRect(wx - 2, y + 66, 26, 24);
        ctx.fillStyle = '#9fd8ff'; ctx.fillRect(wx, y + 68, 22, 20);
        ctx.fillStyle = '#fff'; ctx.fillRect(wx + 10, y + 68, 2, 20); ctx.fillRect(wx, y + 77, 22, 2);
        ctx.fillStyle = '#8b5a2b'; ctx.fillRect(wx - 3, y + 90, 28, 5);
        for (let k = 0; k < 4; k++) { ctx.fillStyle = k % 2 ? '#ff6b8a' : '#ffd34d'; ctx.beginPath(); ctx.arc(wx + 2 + k * 7, y + 89, 2.6, 0, 7); ctx.fill(); }
      }
      ctx.fillStyle = '#7a4e2a'; rr(x + w / 2 - 11, y + h - 40, 22, 34, [10, 10, 2, 2]); ctx.fill();
      ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(x + w / 2 + 6, y + h - 22, 2, 0, 7); ctx.fill();
    } else if (d.id === 'tafel') {
      ctx.fillStyle = '#7a4e2a'; ctx.fillRect(x + 22, y + 58, 8, 34); ctx.fillRect(x + w - 30, y + 58, 8, 34);
      ctx.fillStyle = '#a8763e'; rr(x + 10, y + 12, w - 20, 58, 6); ctx.fill();
      ctx.fillStyle = '#8a5f30'; rr(x + 14, y + 16, w - 28, 50, 4); ctx.fill();
      ctx.fillStyle = '#6d4c41'; ctx.beginPath(); ctx.moveTo(x + 4, y + 16); ctx.lineTo(x + w / 2, y + 2); ctx.lineTo(x + w - 4, y + 16); ctx.fill();
      for (let i = 0; i < 3; i++) {
        const o = G.orders[i], ready = o && o.wait === undefined && hasAll(o.items);
        ctx.fillStyle = o && o.wait === undefined ? (ready ? '#d9ffb0' : '#fff8e0') : 'rgba(255,255,255,0.25)';
        ctx.save(); ctx.translate(x + 34 + i * 38, y + 42); ctx.rotate((i - 1) * 0.08);
        ctx.fillRect(-14, -18, 28, 34); ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 3; k++) ctx.fillRect(-9, -8 + k * 7, 18, 2);
        ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(0, -16, 3, 0, 7); ctx.fill();
        ctx.restore();
      }
      const n = G.orders.filter((o) => o.wait === undefined && hasAll(o.items)).length;
      if (n) badge(x + w - 12, y + 12 + Math.sin(T * 5) * 3, n);
    } else if (d.id === 'scheune') {
      ctx.fillStyle = '#b03a2e'; rr(x + 8, y + 44, w - 16, h - 50, 4); ctx.fill();
      ctx.strokeStyle = 'rgba(90,20,15,0.35)'; ctx.lineWidth = 2;
      for (let k = 1; k < 8; k++) { ctx.beginPath(); ctx.moveTo(x + 8 + k * 16, y + 46); ctx.lineTo(x + 8 + k * 16, y + h - 8); ctx.stroke(); }
      ctx.fillStyle = '#7d2a20'; ctx.beginPath(); ctx.moveTo(x + 2, y + 50); ctx.lineTo(x + 24, y + 12); ctx.lineTo(x + w - 24, y + 12); ctx.lineTo(x + w - 2, y + 50); ctx.fill();
      ctx.fillStyle = '#9b3a2e'; ctx.fillRect(x + 24, y + 12, w - 48, 6);
      ctx.fillStyle = '#f5f0e6'; rr(x + w / 2 - 22, y + h - 56, 44, 50, 3); ctx.fill();
      ctx.strokeStyle = '#b03a2e'; ctx.lineWidth = 4; ctx.beginPath();
      ctx.moveTo(x + w / 2 - 20, y + h - 54); ctx.lineTo(x + w / 2 + 20, y + h - 8); ctx.moveTo(x + w / 2 + 20, y + h - 54); ctx.lineTo(x + w / 2 - 20, y + h - 8); ctx.stroke();
      ctx.fillStyle = '#f5f0e6'; ctx.beginPath(); ctx.arc(x + w / 2, y + 30, 9, 0, 7); ctx.fill();
      ctx.fillStyle = '#e8c45a'; rr(x + w - 30, y + h - 26, 26, 20, 5); ctx.fill(); // Heuballen
      ctx.strokeStyle = '#c9a23c'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + w - 26, y + h - 16); ctx.lineTo(x + w - 8, y + h - 16); ctx.stroke();
      const total = Object.values(G.inv).reduce((s, n) => s + n, 0);
      if (total) badge(x + w - 10, y + 16, total);
    } else if (d.id === 'teich') {
      const cx = x + w / 2, cy = y + h / 2;
      ctx.fillStyle = '#c8b27e'; ctx.beginPath(); ctx.ellipse(cx, cy + 2, w / 2 - 2, h / 2 - 3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#3b8fcf'; ctx.beginPath(); ctx.ellipse(cx, cy, w / 2 - 7, h / 2 - 9, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#5bb2ea'; ctx.beginPath(); ctx.ellipse(cx - 6, cy - 4, w / 2 - 20, h / 2 - 20, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx + Math.sin(T) * 10, cy, 14 + (T * 8) % 12, 5, 0, 0, 7); ctx.stroke();
      ctx.fillStyle = '#3c9a4a'; ctx.beginPath(); ctx.arc(x + 34, y + 36, 8, 0.4, 6); ctx.fill();
      ctx.fillStyle = '#ffb3c7'; ctx.beginPath(); ctx.arc(x + 36, y + 34, 2.5, 0, 7); ctx.fill();
      ctx.strokeStyle = '#4c8a2e'; ctx.lineWidth = 2; // Schilf
      for (let k = 0; k < 4; k++) { const rx = x + 8 + k * 5; ctx.beginPath(); ctx.moveTo(rx, cy + 14); ctx.lineTo(rx + Math.sin(T * 1.5 + k) * 2, cy - 8 - k * 2); ctx.stroke(); }
      const jump = (T * 0.25) % 1; // ab und zu springt ein Fisch
      if (G.pond.fish > 0 && jump < 0.12) {
        const q = jump / 0.12, jx = cx + 18, jy = cy - Math.sin(q * Math.PI) * 18;
        drawEmoji(ctx, '🐟', jx, jy, 16);
      }
      drawEmoji(ctx, '🦆', x + w - 46 + Math.sin(T * 0.5) * 16, cy + 4, 22);
      if (G.level >= POND.level) { // Steg mit Angel
        ctx.fillStyle = '#9c6b3c'; ctx.fillRect(x + w - 24, cy - 6, 24, 12);
        ctx.strokeStyle = '#7a4e2a'; ctx.lineWidth = 1; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x + w - 24 + k * 6, cy - 6); ctx.lineTo(x + w - 24 + k * 6, cy + 6); ctx.stroke(); }
        ctx.strokeStyle = '#5d3a1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + w - 8, cy + 2); ctx.lineTo(x + w - 30, cy - 26); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + w - 30, cy - 26); ctx.lineTo(x + w - 36, cy + 4); ctx.stroke();
        if (G.pond.fish > 0) bubbleIcon(cx + 10, y - 2 + Math.sin(T * 3) * 2, '🎣', 13, '#3b8fcf', G.pond.fish);
      }
    }
    outlinedText(ctx, d.id === 'teich' && G.level >= POND.level ? 'Teich – Angeln' : d.name, x + w / 2, y + h - 2, 11, '#fff');
  }
}

// Wohnhaus, Scheune und Teich in Pixel-Grafik (die Auftragstafel bleibt gezeichnet)
function drawDecorPixel(d, x, y, w, h, T) {
  if (d.id === 'haus') { // Wohnhaus + Hofhund, der davor auf und ab läuft
    spr(ctx, 'haus', 0, x + w / 2, y + h - 8);
    const q = Math.sin(T * 0.35), still = Math.abs(Math.cos(T * 0.35)) < 0.25;
    spr(ctx, 'hund_lauf', still ? 0 : Math.floor(T * 10), Math.round(x + w / 2 + q * (w / 2 - 22)), y + h + 26, Math.cos(T * 0.35) < 0);
    return true;
  }
  if (d.id === 'scheune') {
    spr(ctx, 'scheune', 0, x + w / 2, y + h - 14);
    const total = Object.values(G.inv).reduce((s, n) => s + n, 0);
    if (total) badge(x + w - 22, y + 34, total);
    return true;
  }
  if (d.id === 'tafel') {
    const bx = x + w / 2, by = y + h - 12;
    spr(ctx, 'kisten', 0, x + 20, by + 4);
    spr(ctx, 'tafel', 0, bx - 22, by); spr(ctx, 'tafel', 0, bx + 22, by);
    for (let i = 0; i < Math.min(4, G.orders.length); i++) { // ein Zettel pro Auftrag
      const o = G.orders[i], ready = o && o.wait === undefined && hasAll(o.items);
      const nx = bx - 36 + (i % 2) * 15 + Math.floor(i / 2) * 44, ny = by - 40 + (i % 2) * 4;
      ctx.fillStyle = 'rgba(40,25,10,0.45)'; ctx.fillRect(nx + 1, ny + 1, 12, 15);
      ctx.fillStyle = o && o.wait === undefined ? (ready ? '#cdf29b' : '#f6ecd0') : 'rgba(246,236,208,0.35)'; ctx.fillRect(nx, ny, 12, 15);
      if (o && o.wait === undefined) { ctx.fillStyle = 'rgba(70,50,30,0.55)'; for (let k = 0; k < 3; k++) ctx.fillRect(nx + 2, ny + 4 + k * 3, 8 - (k === 2 ? 3 : 0), 1); }
      ctx.fillStyle = '#c0392b'; ctx.fillRect(nx + 5, ny - 1, 2, 2);
    }
    const n = G.orders.filter((o) => o.wait === undefined && hasAll(o.items)).length;
    if (n) badge(x + w - 18, y + 22 + Math.sin(T * 5) * 3, n);
    return true;
  }
  if (d.id !== 'teich') return false;
  const cx = x + w / 2, cy = y + h / 2;
  ctx.fillStyle = PX.water; ctx.fillRect(x + 8, y + 8, w - 16, h - 16);
  ctx.fillStyle = 'rgba(170,200,245,0.55)';
  for (let k = 0; k < 4; k++) { // kleine Wellen
    const q = (T * 0.25 + k / 4) % 1;
    ctx.fillRect(Math.round(x + 22 + hash(k, 3) * (w - 60) + q * 12), Math.round(y + 22 + hash(k, 5) * (h - 44)), 6, 2);
  }
  spr(ctx, 'seerosen', Math.floor(T * 3) % 6, x + 36, y + h - 14);
  nineSlice(ctx, 'coast', Math.floor(T * 4) % 6, x, y, w, h);
  const jump = (T * 0.25) % 1; // ab und zu springt ein Fisch
  if (G.pond.fish > 0 && jump < 0.12) { // Pixel-Fisch springt aus dem Wasser
    const q = jump / 0.12, f = Math.min(8, Math.floor(q * 9));
    spr(ctx, 'fischspritzer', f, cx + 18, cy + 12); spr(ctx, 'fischsprung', f, cx + 18, Math.round(cy + 10 - Math.sin(q * Math.PI) * 12));
  }
  spr(ctx, 'ente_schwimm', Math.floor(T * 6), Math.round(cx - 14 + Math.sin(T * 0.4) * 26), cy + 16, Math.cos(T * 0.4) < 0);
  if (G.level >= POND.level) { // Steg mit Angel
    ctx.fillStyle = '#9c6b3c'; ctx.fillRect(x + w - 26, cy - 6, 26, 12);
    ctx.fillStyle = '#6e4626'; for (let k = 0; k < 5; k++) ctx.fillRect(x + w - 26 + k * 6, cy - 6, 1, 12);
    ctx.fillRect(x + w - 26, cy + 5, 26, 1);
    ctx.strokeStyle = '#5d3a1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + w - 8, cy + 2); ctx.lineTo(x + w - 30, cy - 26); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + w - 30, cy - 26); ctx.lineTo(x + w - 36, cy + 4); ctx.stroke();
    if (G.pond.fish > 0) bubbleIcon(cx + 10, y - 2 + Math.sin(T * 3) * 2, '🎣', 13, '#3b8fcf', G.pond.fish);
  }
  return true;
}

function badge(x, y, n) {
  ctx.save(); ctx.translate(x, y); ctx.scale(uiK(), uiK());
  ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(n > 99 ? '99+' : n, 0, 1);
  ctx.restore();
}
// runde Blase mit Symbol (optional mit Zahl)
function bubbleIcon(x, y, icon, r, border, n) {
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.strokeStyle = border; ctx.lineWidth = 2.5; ctx.stroke();
  drawEmoji(ctx, icon, x, y, r * 1.35);
  if (n) badge(x + r * 0.8, y - r * 0.7, n);
}

function drawParcels() {
  const next = nextParcelInfo();
  for (let i = 0; i < G.parcels.length; i++) {
    const px = i % PARCEL_COLS, py = Math.floor(i / PARCEL_COLS);
    const x = (PARCEL_X0 + px * PARCEL) * TILE, y = (PARCEL_Y0 + py * PARCEL) * TILE, w = PARCEL * TILE;
    if (G.parcels[i]) {
      for (let tx = 0; tx < PARCEL; tx++) for (let ty = 0; ty < PARCEL; ty++) {
        const gx = PARCEL_X0 + px * PARCEL + tx, gy = PARCEL_Y0 + py * PARCEL + ty, t = tile(gx, gy);
        if (t.s !== 'soil' || t.b) continue;
        const sx = gx * TILE, sy = gy * TILE, wet = boostMap && boostMap[idx(gx, gy)];
        if (atlasReady) { // Pixel-Ackerboden, Kacheln leicht voneinander abgesetzt
          const f = SPR.soil[Math.floor(hash(gx, gy) * 3)];
          ctx.fillStyle = '#93533a'; ctx.fillRect(sx, sy, TILE, TILE); // Erdfarbe unter die Kachel (das Sheet hat durchsichtige Fugen)
          ctx.drawImage(ATL, f[0], f[1], 48, 48, sx, sy, TILE, TILE);
          if (wet) { ctx.fillStyle = 'rgba(30,45,110,0.24)'; ctx.fillRect(sx, sy, TILE, TILE); }
          else if (t.c) { ctx.fillStyle = 'rgba(40,20,5,0.10)'; ctx.fillRect(sx, sy, TILE, TILE); }
          ctx.fillStyle = 'rgba(55,28,12,0.35)'; ctx.fillRect(sx, sy, TILE, 2); ctx.fillRect(sx, sy, 2, TILE);
          ctx.fillStyle = 'rgba(255,215,160,0.12)'; ctx.fillRect(sx + 2, sy + 2, TILE - 2, 1);
          if (wet) { ctx.fillStyle = 'rgba(170,215,255,0.8)'; ctx.fillRect(sx + 12, sy + 34, 2, 2); ctx.fillRect(sx + 34, sy + 16, 2, 2); }
          continue;
        }
        ctx.fillStyle = 'rgba(60,35,15,0.35)'; rr(sx + 2, sy + 4, TILE - 4, TILE - 4, 7); ctx.fill();
        ctx.fillStyle = wet ? '#6e4426' : t.c ? '#7d4c29' : '#8f5c34'; rr(sx + 2, sy + 2, TILE - 4, TILE - 5, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,220,170,0.10)'; rr(sx + 4, sy + 3, TILE - 8, 6, 3); ctx.fill();
        for (let k = 0; k < 3; k++) { // Furchen
          ctx.fillStyle = 'rgba(40,20,5,0.22)'; rr(sx + 7, sy + 10 + k * 12, TILE - 14, 4, 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,220,170,0.12)'; ctx.fillRect(sx + 8, sy + 14 + k * 12, TILE - 16, 1.5);
        }
        if (wet) { ctx.fillStyle = 'rgba(140,200,255,0.55)'; ctx.beginPath(); ctx.arc(sx + 12, sy + 34, 1.6, 0, 7); ctx.arc(sx + 34, sy + 16, 1.4, 0, 7); ctx.fill(); }
      }
      continue;
    }
    ctx.fillStyle = 'rgba(25,55,20,0.38)'; ctx.fillRect(x, y, w, w);
    if (atlasReady) { // Gestrüpp + Holzzaun in Pixel-Grafik
      const bush = [];
      for (let k = 0; k < 6; k++) bush.push([x + 20 + Math.round(hash(i, k) * (w - 40)), y + 30 + Math.round(hash(k, i + 7) * (w - 44)), Math.floor(hash(i + k, 3) * 6)]);
      bush.sort((a, b) => a[1] - b[1]).forEach(([bx, by, v]) => spr(ctx, 'busch', v, bx, by, v % 2 === 1));
      nineSlice(ctx, 'fence9', 0, x, y, w, w);
    } else for (let k = 0; k < 6; k++) { // Gestrüpp
      const bx = x + 18 + hash(i, k) * (w - 36), by = y + 18 + hash(k, i + 7) * (w - 36);
      ctx.fillStyle = '#2f6e2c'; ctx.beginPath(); ctx.arc(bx, by, 7 + hash(i + k, 3) * 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#3c8236'; ctx.beginPath(); ctx.arc(bx - 2, by - 3, 4 + hash(i + k, 4) * 3, 0, 7); ctx.fill();
    }
    if (!atlasReady) { // Zaun: Pfosten + zwei Latten
      ctx.strokeStyle = '#c9a26b'; ctx.lineWidth = 2.5; ctx.strokeRect(x + 5, y + 5, w - 10, w - 10); ctx.strokeRect(x + 5, y + 11, w - 10, w - 22);
      ctx.fillStyle = '#9b7040';
      for (let k = 0; k <= 4; k++) for (const [fx, fy] of [[x + 3 + k * (w - 10) / 4, y + 1], [x + 3 + k * (w - 10) / 4, y + w - 11], [x + 1, y + 3 + k * (w - 10) / 4], [x + w - 7, y + 3 + k * (w - 10) / 4]]) ctx.fillRect(fx, fy, 5, 8);
    }
    if (parcelBuyable(i)) {
      const ok = G.level >= next.level;
      ctx.save(); ctx.translate(x + w / 2, y + w / 2); ctx.scale(uiK(), uiK());
      ctx.fillStyle = '#7a4e2a'; ctx.fillRect(-3, 0, 6, 26);
      ctx.fillStyle = '#e8c690'; rr(-46, -26, 92, 36, 6); ctx.fill();
      ctx.strokeStyle = '#7a4e2a'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#4a2f18'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ok ? '💰 ' + fmt(next.cost) : '🔒 Level ' + next.level, 0, -8);
      ctx.restore();
    }
  }
}

function drawCrop(x, y, T) {
  const t = tile(x, y);
  if (!t.c) return;
  const px = x * TILE + TILE / 2, py = y * TILE + TILE / 2, p = t.p, icon = ITEMS[t.c].icon;
  if (atlasReady && SPR[t.c]) { // Pixel-Pflanzen: 3 Wachstumsstufen + reif
    const stage = p >= 1 ? 3 : p < 0.33 ? 0 : p < 0.66 ? 1 : 2, by = y * TILE + TILE - 3;
    if (p >= 1) { // weiches Leuchten: reif!
      const gl = ctx.createRadialGradient(px, py + 6, 2, px, py + 6, 24);
      gl.addColorStop(0, `rgba(255,236,120,${0.45 + Math.sin(T * 3 + x + y) * 0.12})`); gl.addColorStop(1, 'rgba(255,236,120,0)');
      ctx.fillStyle = gl; ctx.fillRect(px - 24, py - 18, 48, 48);
    }
    if (SPR[t.c][0][6] <= 16) { spr(ctx, t.c, stage, px - 15, by - 3); spr(ctx, t.c, stage, px + 15, by - 3); spr(ctx, t.c, stage, px, by); }
    else spr(ctx, t.c, stage, px, by);
    if (p >= 1 && (T * 1.3 + hash(x, y) * 10) % 3 < 0.25) { // Pixel-Funkeln
      const sx = px + 12, sy = py - 14; ctx.fillStyle = '#fff6c2';
      ctx.fillRect(sx - 1, sy - 5, 2, 10); ctx.fillRect(sx - 5, sy - 1, 10, 2); ctx.fillStyle = '#fff'; ctx.fillRect(sx - 1, sy - 1, 2, 2);
    }
    return;
  }
  if (p >= 1) {
    const b = Math.sin(T * 4 + x + y) * 2;
    ctx.fillStyle = 'rgba(255,240,120,0.38)'; ctx.beginPath(); ctx.arc(px, py + 2, 18, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(px, py + 15, 12, 4, 0, 0, 7); ctx.fill();
    drawEmoji(ctx, icon, px, py + b, 34);
    if ((T * 1.3 + hash(x, y) * 10) % 3 < 0.25) drawEmoji(ctx, '✨', px + 13, py - 13, 14);
    return;
  }
  const stage = p < 0.33 ? 0 : p < 0.66 ? 1 : 2, sway = Math.sin(T * 2 + x * 0.7) * 1.5;
  const spots = [[-11, -9], [9, -10], [-9, 9], [11, 8], [0, 0]];
  for (const [dx, dy] of spots) {
    const sx = px + dx, sy = py + dy + 4;
    if (stage === 0) { ctx.fillStyle = '#5a3a1e'; ctx.beginPath(); ctx.arc(sx, sy, 1.8, 0, 7); ctx.fill(); ctx.fillStyle = '#9ad35a'; ctx.fillRect(sx - 1, sy - 4, 2, 3); continue; }
    const hgt = stage === 1 ? 7 : 11;
    ctx.strokeStyle = '#3f8f2d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + sway, sy - hgt); ctx.stroke();
    ctx.fillStyle = stage === 1 ? '#7cc94a' : '#5fb53b';
    ctx.beginPath(); ctx.ellipse(sx + sway - 3, sy - hgt + 1, 4, 2.2, -0.6, 0, 7); ctx.ellipse(sx + sway + 3, sy - hgt + 2, 4, 2.2, 0.6, 0, 7); ctx.fill();
  }
  // kleine Vorschau der Frucht: man sieht sofort, was dort wächst
  ctx.globalAlpha = stage === 0 ? 0.5 : stage === 1 ? 0.7 : 0.95;
  drawEmoji(ctx, icon, px, py + 1, stage === 0 ? 11 : stage === 1 ? 15 : 21);
  ctx.globalAlpha = 1;
}

// ---------- Gebäude, Bäume & Tiere ----------
function drawBuilding(b, T) {
  const d = BUILDINGS[b.type], x = b.x * TILE, y = b.y * TILE, w = d.w * TILE, h = d.h * TILE;
  if (d.kind === 'boost' && atlasReady) { // Pixel-Sprinkler: Metallrohr + kreisende Wassertropfen
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x + 16, y + 38, 16, 3);
    ctx.fillStyle = '#2b2a33'; ctx.fillRect(x + 21, y + 16, 6, 24); ctx.fillRect(x + 17, y + 11, 14, 7);
    ctx.fillStyle = '#8697ba'; ctx.fillRect(x + 22, y + 17, 4, 22); ctx.fillRect(x + 18, y + 12, 12, 5);
    ctx.fillStyle = '#c3d3ee'; ctx.fillRect(x + 22, y + 17, 1, 21); ctx.fillRect(x + 18, y + 12, 12, 1);
    for (let k = 0; k < 10; k++) {
      const a = T * 3 + k * 0.63, rr2 = 8 + ((T * 18 + k * 7) % 16);
      ctx.fillStyle = k % 3 ? 'rgba(140,200,255,0.85)' : 'rgba(220,240,255,0.9)';
      ctx.fillRect(Math.round(x + 24 + Math.cos(a) * rr2), Math.round(y + 14 + Math.sin(a) * rr2 * 0.55), 2, 2);
    }
    return;
  }
  if (d.kind === 'boost') {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(x + 24, y + 38, 14, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#7f8c8d'; ctx.fillRect(x + 21, y + 14, 6, 24);
    ctx.fillStyle = '#95a5a6'; ctx.beginPath(); ctx.arc(x + 24, y + 14, 7, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(120,200,255,0.8)'; ctx.lineWidth = 2;
    const a = T * 3;
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x + 24, y + 14, 12 + ((T * 20 + k * 8) % 24), a + k * 2, a + k * 2 + 0.7); ctx.stroke(); }
    return;
  }
  if (d.kind === 'tree') { drawFruitTree(b, d, x, y, T); return; }
  if (atlasReady) { drawBuildingPixel(b, d, x, y, w, h, T); return; }
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; rr(x + 6, y + 10, w - 6, h - 6, 10); ctx.fill();
  if (d.kind === 'animal' || d.kind === 'horse') {
    ctx.fillStyle = d.ground; rr(x + 3, y + 3, w - 6, h - 6, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.ellipse(x + w / 2 + 6, y + h / 2 + 10, w / 3, h / 5, 0, 0, 7); ctx.fill();
    // Zaun
    ctx.strokeStyle = '#f2e6cf'; ctx.lineWidth = 2.5; rr(x + 4, y + 4, w - 8, h - 8, 8); ctx.stroke(); rr(x + 4, y + 10, w - 8, h - 16, 6); ctx.stroke();
    ctx.fillStyle = '#e0cfae'; for (let k = 0; k < 5; k++) { ctx.fillRect(x + 4 + k * (w - 12) / 4, y + h - 10, 4, 8); }
    // kleine Hütte
    ctx.fillStyle = d.color; ctx.fillRect(x + 8, y + 16, 30, 22);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1; for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x + 8 + k * 7.5, y + 16); ctx.lineTo(x + 8 + k * 7.5, y + 38); ctx.stroke(); }
    ctx.fillStyle = '#5d3a1a'; ctx.beginPath(); ctx.moveTo(x + 4, y + 18); ctx.lineTo(x + 23, y + 4); ctx.lineTo(x + 42, y + 18); ctx.fill();
    ctx.fillStyle = '#3b2412'; rr(x + 18, y + 26, 10, 12, [5, 5, 0, 0]); ctx.fill();
    if (d.kind === 'horse') {
      ctx.fillStyle = '#d9c27a'; rr(x + w - 26, y + 12, 18, 12, 3); ctx.fill(); // Heuraufe
      const list = b.horses || [];
      list.forEach((c, i) => {
        const sp = 0.18 + hash(b.id, i) * 0.2, ph = hash(i, b.id) * 10;
        const ax = x + w / 2 + Math.sin(T * sp + ph) * (w / 2 - 24), ay = y + h / 2 + 14 + Math.sin(T * sp * 1.3 + ph * 2) * (h / 2 - 30);
        drawHorse(ctx, c, ax, ay, Math.cos(T * sp + ph) > 0 ? 1 : -1, T + ph, 0.95);
      });
      if (b.foal) drawHorse(ctx, b.foal, x + w - 22, y + h - 20, -1, T, 0.6, true);
    } else {
      for (let i = 0; i < b.animals; i++) {
        const sp = 0.25 + hash(b.id, i) * 0.3, ph = hash(i, b.id) * 10;
        const ax = x + w / 2 + Math.sin(T * sp + ph) * (w / 2 - 22), ay = y + h / 2 + 12 + Math.sin(T * sp * 1.3 + ph * 2) * (h / 2 - 28);
        drawAnimal(d.animal, ax, ay, Math.cos(T * sp + ph) > 0 ? 1 : -1, T + ph);
      }
    }
  } else {
    // Werkstatt: Holzwände, Ziegeldach, Tür, Schild
    ctx.fillStyle = d.color; rr(x + 8, y + 30, w - 16, h - 36, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1.5;
    for (let k = 1; k < 5; k++) { ctx.beginPath(); ctx.moveTo(x + 8, y + 30 + k * 12); ctx.lineTo(x + w - 8, y + 30 + k * 12); ctx.stroke(); }
    ctx.fillStyle = '#6d4c41'; ctx.beginPath(); ctx.moveTo(x + 2, y + 36); ctx.lineTo(x + w / 2, y + 6); ctx.lineTo(x + w - 2, y + 36); ctx.fill();
    ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1.5;
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x, y + 14 + k * 7); ctx.lineTo(x + w, y + 14 + k * 7); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = '#4e342e'; rr(x + w / 2 - 10, y + h - 30, 20, 24, [8, 8, 2, 2]); ctx.fill();
    ctx.fillStyle = '#ffe9a8'; ctx.fillRect(x + 14, y + h - 30, 12, 10); ctx.fillRect(x + w - 26, y + h - 30, 12, 10);
    if (b.type === 'muehle') { // drehende Flügel
      ctx.save(); ctx.translate(x + w / 2, y + 22); ctx.rotate(b.job && b.job.p < 1 ? T * 3 : 0);
      ctx.fillStyle = '#f0e6d2'; ctx.strokeStyle = '#9b8a70'; ctx.lineWidth = 1;
      for (let k = 0; k < 4; k++) { ctx.rotate(Math.PI / 2); ctx.fillRect(-4, 2, 8, 28); ctx.strokeRect(-4, 2, 8, 28); }
      ctx.fillStyle = '#6d4c41'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, 7); ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = '#f5ead2'; rr(x + w / 2 - 14, y + 34, 28, 22, 5); ctx.fill();
      drawEmoji(ctx, d.icon, x + w / 2, y + 45, 20);
    }
    if (b.job && b.job.p < 1 && b.type !== 'muehle') { // Rauch
      ctx.fillStyle = '#5d4037'; ctx.fillRect(x + w - 26, y + 8, 9, 16);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      for (let k = 0; k < 3; k++) { const q = (T * 0.8 + k / 3) % 1; ctx.beginPath(); ctx.arc(x + w - 22 + q * 8, y + 6 - q * 24, 3 + q * 5, 0, 7); ctx.fill(); }
    }
  }
}

// ----- Pixel-Gebäude -----
const FACTORY_ART = { muehle: 'muehlturm', baeckerei: 'steinhaus', kaeserei: 'offenescheune', saftpresse: 'stall' };
const ANIMAL_ART = { huhn: 'huhn', kuh: 'kuh', schaf: 'schaf' };
// Bewegung eines Tieres in seinem Gehege (gleiches Muster wie früher, Füße zwischen Hütte und Zaun)
function penMove(b, i, x, y, w, h, T, sp0, spr0) {
  const sp = sp0 + hash(b.id, i) * spr0, ph = hash(i, b.id) * 10, vx = Math.cos(T * sp + ph);
  return { x: Math.round(x + w / 2 + Math.sin(T * sp + ph) * (w / 2 - 24)), y: Math.round(y + h - 26 + Math.sin(T * sp * 1.3 + ph * 2) * 16), dir: vx > 0 ? 1 : -1, still: Math.abs(vx) < 0.3, ph };
}
function drawBuildingPixel(b, d, x, y, w, h, T) {
  if (d.kind === 'animal' || d.kind === 'horse') {
    const dirt = d.animal === 'huhn' || d.kind === 'horse';
    ctx.fillStyle = dirt ? 'rgba(184,133,75,0.8)' : 'rgba(78,128,52,0.5)'; ctx.fillRect(x + 6, y + 8, w - 12, h - 14);
    ctx.fillStyle = dirt ? 'rgba(120,80,45,0.45)' : 'rgba(150,200,95,0.35)';
    for (let k = 0; k < 10; k++) ctx.fillRect(x + 10 + Math.round(hash(b.id, k) * (w - 24)), y + 14 + Math.round(hash(k, b.id + 3) * (h - 28)), 2 + (k % 2) * 2, 2);
    fenceRing(ctx, x, y, w, h, 'back');
    if (d.animal === 'huhn') spr(ctx, 'huehnerhaus', 0, x + 24, y + 54);
    else spr(ctx, 'heuhuette', 0, x + w / 2, y + 46);
    const list = [];
    if (d.kind === 'horse') {
      (b.horses || []).forEach((c, i) => { const m = penMove(b, i, x, y, w, h, T, 0.18, 0.2); list.push([m.y, () => drawHorse(ctx, c, m.x, m.y, m.dir, T + m.ph, 1, m.still)]); });
      if (b.foal) list.push([y + h - 12, () => drawHorse(ctx, b.foal, x + w - 26, y + h - 12, -1, T, 0.6, true)]);
    } else {
      const base = ANIMAL_ART[d.animal];
      for (let i = 0; i < b.animals; i++) {
        const m = penMove(b, i, x, y, w, h, T, 0.25, 0.3);
        list.push([m.y, () => spr(ctx, base + (m.still ? '_steh' : '_lauf'), Math.floor(T * (m.still ? 5 : 9) + m.ph * 3), m.x, m.y, m.dir < 0)]);
      }
    }
    list.sort((p, q) => p[0] - q[0]).forEach((e) => e[1]());
    fenceRing(ctx, x, y, w, h, 'front');
    return;
  }
  // Werkstatt: Gebäude + Schild mit der Ware
  const art = FACTORY_ART[b.type] || 'stall', by = y + h - 4, running = b.job && b.job.p < 1;
  spr(ctx, art, 0, x + w / 2, by);
  if (b.type === 'muehle') spr(ctx, 'fluegel', running ? Math.floor(T * 8) : 0, x + w / 2 - 2, by - 10);
  ctx.fillStyle = '#5a3a1e'; ctx.fillRect(x + w - 30, y + h - 30, 26, 22);
  ctx.fillStyle = '#c99a5b'; ctx.fillRect(x + w - 28, y + h - 28, 22, 18);
  drawEmoji(ctx, d.icon, x + w - 17, y + h - 19, 14);
  if (running && b.type !== 'muehle') { // Rauch
    const top = by - sprTop(art);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let k = 0; k < 3; k++) { const q = (T * 0.8 + k / 3) % 1; ctx.beginPath(); ctx.arc(x + w * 0.72 + q * 8, top + 8 - q * 24, 3 + q * 5, 0, 7); ctx.fill(); }
  }
}
// oberer Rand eines Gebäudes (für die Status-Blase)
function buildingTop(b) {
  const d = BUILDINGS[b.type], y = b.y * TILE;
  if (!atlasReady) return y;
  if (d.kind === 'tree') return y + TILE - 2 - sprTop(b.type);
  if (FACTORY_ART[b.type]) return Math.min(y, y + d.h * TILE - 4 - sprTop(b.type === 'muehle' ? 'fluegel' : FACTORY_ART[b.type]) - (b.type === 'muehle' ? 10 : 0));
  return y;
}

function drawFruitTree(b, d, x, y, T) {
  const cx = x + TILE / 2, cy = y + TILE / 2 - 4, ready = b.job && b.job.p >= 1, p = b.job ? b.job.p : 0;
  if (atlasReady && SPR[b.type]) { // Pixel-Baum: Früchte erscheinen langsam, reif = volle Früchte
    const by = y + TILE - 2;
    spr(ctx, b.type, 0, cx, by);
    if (ready) spr(ctx, b.type, 1, cx, by);
    else if (p > 0.5) { ctx.globalAlpha = Math.min(1, (p - 0.5) * 1.8); spr(ctx, b.type, 1, cx, by); ctx.globalAlpha = 1; }
    if (b.type === 'kirschbaum' && !ready && p < 0.3) { // Kirschblüte
      ctx.fillStyle = '#ffd1e0'; for (let k = 0; k < 9; k++) ctx.fillRect(Math.round(cx - 18 + hash(b.id, k) * 36), Math.round(by - 56 + hash(k, b.id) * 34), 2, 2);
    }
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(cx + 3, y + TILE - 6, 18, 6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#7a4e2a'; ctx.fillRect(cx - 3.5, cy + 4, 7, 16);
  const sway = Math.sin(T * 1.2 + b.id) * 0.8;
  ctx.fillStyle = shade(d.leaf, -0.2); ctx.beginPath(); ctx.arc(cx + sway, cy - 2, 19, 0, 7); ctx.fill();
  ctx.fillStyle = d.leaf; ctx.beginPath(); ctx.arc(cx - 3 + sway, cy - 6, 15, 0, 7); ctx.arc(cx + 8 + sway, cy - 1, 11, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(200,255,160,0.35)'; ctx.beginPath(); ctx.arc(cx - 7 + sway, cy - 12, 6, 0, 7); ctx.fill();
  if (b.type === 'kirschbaum' && !ready && p < 0.3) { // Kirschblüte
    ctx.fillStyle = '#ffd1e0'; for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.arc(cx - 12 + hash(b.id, k) * 24, cy - 16 + hash(k, b.id) * 22, 2.2, 0, 7); ctx.fill(); }
  }
  const spots = [[-9, -8], [7, -11], [9, 3], [-6, 4]].slice(0, Math.max(2, d.qty));
  for (const [dx, dy] of spots) {
    if (ready) drawEmoji(ctx, ITEMS[d.out].icon, cx + dx + sway, cy + dy, 14);
    else if (p > 0.25) { ctx.fillStyle = p > 0.7 ? '#b9d36a' : '#8fbf4a'; ctx.beginPath(); ctx.arc(cx + dx + sway, cy + dy, 1.5 + p * 3, 0, 7); ctx.fill(); }
  }
}

function drawAnimal(type, x, y, dir, T) {
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  const bob = Math.abs(Math.sin(T * 6)) * 1.5;
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(0, 7, 10, 3, 0, 0, 7); ctx.fill();
  if (type === 'huhn') {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, -bob, 8, 6.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#efe9dc'; ctx.beginPath(); ctx.ellipse(-2, -bob, 5, 3.5, -0.3, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(6, -6 - bob, 4.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#e74c3c'; ctx.fillRect(5, -12 - bob, 3, 3);
    ctx.fillStyle = '#f39c12'; ctx.beginPath(); ctx.moveTo(10, -6 - bob); ctx.lineTo(14, -5 - bob); ctx.lineTo(10, -4 - bob); ctx.fill();
    ctx.fillStyle = '#222'; ctx.fillRect(7, -7 - bob, 1.5, 1.5);
  } else if (type === 'kuh') {
    ctx.fillStyle = '#fff'; rr(-12, -9 - bob, 22, 13, 5); ctx.fill();
    ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(-5, -5 - bob, 3.5, 0, 7); ctx.arc(4, -2 - bob, 2.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(12, -9 - bob, 5.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#f5b7b1'; ctx.beginPath(); ctx.ellipse(15, -7 - bob, 3, 2.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#333'; ctx.fillRect(-10, 3, 3, 4); ctx.fillRect(6, 3, 3, 4);
  } else {
    ctx.fillStyle = '#f7f3ea';
    for (const [dx, dy] of [[-6, -4], [0, -7], [6, -4], [-3, 0], [4, 0]]) { ctx.beginPath(); ctx.arc(dx, dy - bob, 5, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#333'; ctx.beginPath(); ctx.ellipse(11, -6 - bob, 4, 3.5, 0, 0, 7); ctx.fill();
    ctx.fillRect(-6, 3, 2.5, 4); ctx.fillRect(4, 3, 2.5, 4);
  }
  ctx.restore();
}

// Pferd in beliebiger Fellfarbe (g = Zeichenfläche, damit es auch im Fohlen-Popup geht)
function drawHorse(g, coat, x, y, dir, T, s = 1, still = false, foal = false) {
  if (atlasReady) { // Pixel-Pferd in der Fellfarbe (umgefärbt in make_atlas.py); s < 0.8 oder foal = Fohlen, s ≥ 1.5 = doppelt groß
    const kind = foal || s < 0.8 ? 'fohlen' : 'pferd', c = COATS[coat] ? coat : 'braun', sc = s >= 1.5 ? 2 : 1;
    if (g !== ctx) g.imageSmoothingEnabled = false;
    spr(g, `${kind}_${c}_${still ? 'steh' : 'lauf'}`, Math.floor(T * (still ? 4 : 9)), x, y, dir < 0, sc);
    if (c === 'einhorn' && Math.sin(T * 3) > 0.75) { g.fillStyle = '#fff'; g.fillRect(x + dir * 14 * sc, y - 46 * sc, 2 * sc, 2 * sc); }
    return;
  }
  const k = COATS[coat] || COATS.braun, rainbow = k.mane === 'rainbow';
  const mane = rainbow ? '#ff7ad9' : k.mane, leg = shade(k.body, -0.18);
  g.save(); g.translate(x, y); g.scale(dir * s, s);
  const walk = still ? 0 : T * 7, bob = still ? Math.sin(T * 2) * 0.4 : Math.abs(Math.sin(walk)) * 0.8;
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(0, 9, 13, 3, 0, 0, 7); g.fill();
  [[-8, 0], [-4, Math.PI], [5, Math.PI], [9, 0]].forEach(([lx, ph]) => { // Beine
    const sw = still ? 0 : Math.sin(walk + ph) * 1.6;
    g.fillStyle = leg; g.fillRect(lx + sw - 1.2, -1, 2.6, 9);
    g.fillStyle = '#3a2a1e'; g.fillRect(lx + sw - 1.4, 7, 3, 2);
  });
  // Schweif
  g.lineCap = 'round';
  const tail = rainbow ? ['#ff6b6b', '#ffd34d', '#6bcbff', '#c98bff'] : [mane];
  tail.forEach((c, i) => { g.strokeStyle = c; g.lineWidth = rainbow ? 1.6 : 3; g.beginPath(); g.moveTo(-11, -6 - bob); g.quadraticCurveTo(-17, -3 + i, -15 + Math.sin(T * 3) * 1.5, 4 + i); g.stroke(); });
  // Körper
  g.fillStyle = k.body; g.beginPath(); g.ellipse(0, -3 - bob, 12, 6.5, 0, 0, 7); g.fill();
  if (k.spots) { g.fillStyle = k.spots; g.beginPath(); g.ellipse(-4, -5 - bob, 4, 3, 0.4, 0, 7); g.ellipse(5, -1 - bob, 3, 2.4, -0.3, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(-1, -6 - bob, 7, 2.2, 0, 0, 7); g.fill();
  // Hals + Kopf
  g.fillStyle = k.body; g.beginPath(); g.moveTo(5, -7 - bob); g.lineTo(10, -16 - bob); g.lineTo(15, -14 - bob); g.lineTo(11, -2 - bob); g.fill();
  g.save(); g.translate(15.5, -14.5 - bob); g.rotate(0.55); g.beginPath(); g.ellipse(0, 0, 6, 3.3, 0, 0, 7); g.fill(); g.restore();
  g.fillStyle = shade(k.body, -0.3); g.beginPath(); g.arc(19, -11.5 - bob, 1.1, 0, 7); g.fill();
  g.fillStyle = k.body; g.beginPath(); g.moveTo(11, -17 - bob); g.lineTo(12, -21 - bob); g.lineTo(13.5, -17 - bob); g.fill(); // Ohr
  g.fillStyle = '#1a1410'; g.beginPath(); g.arc(14.5, -15.5 - bob, 1.1, 0, 7); g.fill();
  // Mähne
  const mc = rainbow ? ['#ff6b6b', '#ffd34d', '#7ed957', '#6bcbff', '#c98bff'] : [mane];
  mc.forEach((c, i) => { g.strokeStyle = c; g.lineWidth = rainbow ? 1.4 : 2.6; g.beginPath(); g.moveTo(10 - i * 0.6, -17 - bob + i * 0.5); g.quadraticCurveTo(7 - i * 0.5, -12 - bob, 5 - i * 0.4, -6 - bob + i * 0.3); g.stroke(); });
  if (rainbow) { // Horn
    g.fillStyle = '#ffd34d'; g.beginPath(); g.moveTo(14, -18 - bob); g.lineTo(18.5, -26 - bob); g.lineTo(16.5, -17 - bob); g.fill();
    if (Math.sin(T * 3) > 0.6) { g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(19, -27 - bob, 1.6, 0, 7); g.fill(); }
  }
  g.restore();
}

// Status-Blase über dem Gebäude
function drawBubble(b, T) {
  const d = BUILDINGS[b.type];
  if (d.kind === 'boost') return;
  const cx = (b.x + d.w / 2) * TILE, top = buildingTop(b);
  if (d.kind === 'horse' && b.foal) { bubbleIcon(cx, top - 6 + Math.sin(T * 5) * 3, '🐴', 17, '#e0a800', '!'); return; }
  if (b.job && b.job.p >= 1) {
    const by = top - 6 + Math.sin(T * 5) * 3;
    bubbleIcon(cx, by, d.kind === 'horse' ? '🐴' : ITEMS[b.job.out].icon, d.kind === 'tree' ? 13 : 17, '#5cb85c');
  } else if (b.job) {
    if (d.kind === 'tree') return; // man sieht die Früchte wachsen
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; rr(cx - 30, top - 4, 60, 9, 4); ctx.fill();
    ctx.fillStyle = d.kind === 'horse' ? '#ff7aa8' : '#7ed957'; rr(cx - 29, top - 3, 58 * b.job.p, 7, 3); ctx.fill();
  } else if (d.kind !== 'tree') {
    // wartet: zeigt, was fehlt (statt einem Schlaf-Symbol)
    const r = recipe(b), ok = (d.kind !== 'horse' || canBreed(b)) && hasAll(r.in);
    const miss = d.kind === 'horse' && b.horses.length < 2 ? '🐴' : (Object.keys(r.in).find((k) => inv(k) < r.in[k]) || Object.keys(r.in)[0]);
    const icon = ITEMS[miss] ? ITEMS[miss].icon : miss, by = top - 4 + (ok ? Math.sin(T * 4) * 2 : 0);
    ctx.globalAlpha = ok ? 1 : 0.85;
    ctx.fillStyle = ok ? '#fff7d6' : '#fdecea'; ctx.beginPath(); ctx.arc(cx, by, 14, 0, 7); ctx.fill();
    ctx.strokeStyle = ok ? '#f0ad4e' : '#c0392b'; ctx.lineWidth = 2; ctx.stroke();
    if (!ok) ctx.globalAlpha = 0.6;
    drawEmoji(ctx, icon, cx, by, 18);
    ctx.globalAlpha = 1;
    if (!ok) { // rotes Ausrufezeichen: „hier fehlt etwas“
      ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(cx + 11, by - 10, 6.5, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', cx + 11, by - 9.5);
    }
  }
}

// ---------- Stadt ----------
const lotRect = (l) => ({ x: (TOWN_X0 + l.x) * TILE, y: l.y * TILE, w: l.w * TILE, h: l.h * TILE });
function townHit(x, y) { // Kachel → Projekt-ID (oder 'town' für den Rest der Stadt)
  if (x < TOWN_X0) return null;
  const t = x - TOWN_X0;
  for (const [id, p] of Object.entries(PROJECTS)) { const l = p.lot; if (t >= l.x && t < l.x + l.w && y >= l.y && y < l.y + l.h) return id; }
  return 'town';
}
function drawTown(T) {
  const X = TOWN_X0 * TILE;
  if (atlasReady) for (let y = 1; y <= 12; y++) spr(ctx, 'busch', Math.floor(hash(y, 77) * 6), X + 24, y * TILE + 44, y % 2 === 1); // Hecke am Stadtrand
  else for (let y = 1; y <= 12; y++) { // Hecke am Stadtrand
    const hx = X + 24, hy = y * TILE + 24;
    ctx.fillStyle = '#2e6f2e'; ctx.beginPath(); ctx.arc(hx, hy, 19, 0, 7); ctx.fill();
    ctx.fillStyle = '#3d8a3a'; ctx.beginPath(); ctx.arc(hx - 4, hy - 5, 12, 0, 7); ctx.fill();
  }
  // gelbes Ortsschild
  ctx.save(); ctx.translate(X + 24, 13 * TILE + 22); ctx.scale(uiK(), uiK());
  ctx.fillStyle = '#7a7a7a'; ctx.fillRect(-14, 4, 3, 22); ctx.fillRect(11, 4, 3, 22);
  ctx.fillStyle = '#ffd200'; rr(-32, -14, 64, 22, 3); ctx.fill(); ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5; rr(-30, -12, 60, 18, 2); ctx.stroke();
  ctx.fillStyle = '#222'; ctx.font = 'bold 8.5px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(TOWN_NAME, 0, -3);
  ctx.restore();

  if (atlasReady) { // Karren, Fässer, Kisten an der Straße – mit jedem Projekt mehr Leben (vor den Gebäuden gezeichnet, damit Schilder frei bleiben)
    const sp = [2, 6, 3, 8, 7, 9], nd = Math.min(sp.length, Object.keys(PROJECTS).filter(built).length); // leer am Anfang, wächst mit jedem Projekt
    for (let i = 0; i < nd; i++) spr(ctx, TOWN_DECO[i][0], TOWN_DECO[i][1], (TOWN_X0 + sp[i] + 0.5) * TILE, 13 * TILE + 44, i % 2 === 1);
    drawPeoplePixel(T); // Bewohner vor den Schildern zeichnen, damit die Namen lesbar bleiben
  }
  for (const [id, p] of Object.entries(PROJECTS)) {
    const r = lotRect(p.lot);
    if (built(id)) { drawProject(id, r, T); continue; }
    // Bauplatz
    ctx.fillStyle = 'rgba(150,115,70,0.45)'; rr(r.x + 6, r.y + 6, r.w - 12, r.h - 12, 10); ctx.fill();
    ctx.strokeStyle = '#d9c4a0'; ctx.setLineDash([6, 5]); ctx.lineWidth = 2; rr(r.x + 8, r.y + 8, r.w - 16, r.h - 16, 8); ctx.stroke(); ctx.setLineDash([]);
    const st = projectState(id), cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(uiK(), uiK());
    if (st === 'ready') ctx.translate(0, Math.sin(T * 4) * 2);
    ctx.fillStyle = '#7a4e2a'; ctx.fillRect(-2.5, 4, 5, 20);
    ctx.fillStyle = st === 'ready' ? '#d9ffb0' : '#f3e2c0'; rr(-34, -24, 68, 32, 6); ctx.fill();
    ctx.strokeStyle = st === 'ready' ? '#3e8e3e' : '#7a4e2a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalAlpha = st === 'locked' ? 0.5 : 1; drawEmoji(ctx, p.icon, -19, -8, 20); ctx.globalAlpha = 1;
    ctx.fillStyle = '#4a2f18'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(st === 'locked' ? 'Lv ' + p.level : st === 'ready' ? 'Bauen!' : '🔨', 9, -8);
    ctx.restore();
  }
  // Häuschen am unteren Rand: werden mit jedem Projekt mehr
  const spots = [2, 6, 3, 8, 7, 9]; // Spalte 1 bleibt frei fürs Ortsschild
  const n = Math.min(spots.length, 2 + Object.keys(PROJECTS).filter(built).length);
  if (atlasReady) return; // Deko und Bewohner stehen schon (siehe oben)
  for (let i = 0; i < n; i++) {
    const hx = (TOWN_X0 + spots[i]) * TILE, hy = 13 * TILE;
    const roof = ['#c0392b', '#2f7fc1', '#e67e22', '#8e44ad', '#16a085', '#d35400', '#c0392b'][i];
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(hx + 8, hy + 14, 36, 30);
    ctx.fillStyle = ['#f6e7c8', '#fff3e0', '#e8f1f5', '#fdebd0'][i % 4]; ctx.fillRect(hx + 6, hy + 16, 34, 26);
    ctx.fillStyle = roof; ctx.beginPath(); ctx.moveTo(hx + 2, hy + 18); ctx.lineTo(hx + 23, hy + 2); ctx.lineTo(hx + 44, hy + 18); ctx.fill();
    ctx.fillStyle = '#9fd8ff'; ctx.fillRect(hx + 10, hy + 22, 8, 8); ctx.fillStyle = '#7a4e2a'; ctx.fillRect(hx + 26, hy + 26, 9, 16);
  }
  drawPeople(T);
}

// ----- Stadt in Pixel-Grafik (Pakete derselben CraftPix-Reihe: Kapelle, Gildenhalle, Marktplatz …) -----
function drawProjectPixel(id, r, T) {
  const { x, y, w, h } = r, cx = x + w / 2, by = y + h - 6;
  switch (id) {
    case 'kirche':
      spr(ctx, 'kirche', 0, cx, by);
      spr(ctx, 'blumen', 0, x + 16, by + 2); spr(ctx, 'blumen', 1, x + w - 16, by + 2);
      return true;
    case 'rathaus':
      spr(ctx, 'banner', 0, cx - 86, by - 30); spr(ctx, 'banner', 0, cx + 86, by - 30);
      spr(ctx, 'rathaus', 0, cx, by);
      spr(ctx, 'blumen', 2, cx - 40, by + 2); spr(ctx, 'blumen', 3, cx + 40, by + 2);
      return true;
    case 'schule':
      spr(ctx, 'schule', 0, cx, by);
      return true;
    case 'markt':
      spr(ctx, 'marktbanner', 0, x + 12, y + 104);
      spr(ctx, 'marktstand', 0, cx, y + 110);
      spr(ctx, 'haendler', Math.floor(T * 6), cx + 50, y + 132);
      spr(ctx, 'brotstand', 0, cx - 18, by - 8);
      spr(ctx, 'fass', 0, x + w - 20, by);
      return true;
    case 'brunnen':
      spr(ctx, 'brunnen', 0, cx, y + h - 22);
      spr(ctx, 'blumen', 2, cx - 32, y + h - 6); spr(ctx, 'blumen', 3, cx + 32, y + h - 6);
      return true;
    case 'festplatz':
      spr(ctx, 'zelt', 0, x + 62, y + 124);
      spr(ctx, 'vogelscheuche', 0, x + w - 32, y + 92);
      spr(ctx, 'marktbanner', 0, x + w - 72, y + 96);
      spr(ctx, 'tisch', 1, x + 116, y + 158); spr(ctx, 'tisch', 0, x + w - 40, y + 150); spr(ctx, 'tisch', 2, x + w - 30, by);
      spr(ctx, 'laute', Math.floor(T * 7), x + 34, by); spr(ctx, 'floete', Math.floor(T * 6), x + 66, by + 2);
      return true;
    case 'reitschule': {
      ctx.fillStyle = '#c99a5b'; ctx.fillRect(x + 8, y + 12, w - 16, h - 18);
      ctx.fillStyle = 'rgba(120,80,45,0.35)';
      for (let k = 0; k < 14; k++) ctx.fillRect(x + 14 + Math.round(hash(k, 91) * (w - 30)), y + 18 + Math.round(hash(91, k) * (h - 34)), 3, 2);
      fenceRing(ctx, x, y, w, h, 'back');
      for (const [px, py] of [[cx - 40, y + h / 2 - 22], [cx + 34, y + h / 2 + 34]]) { // Sprung-Hindernisse
        ctx.fillStyle = '#3e2a1c'; ctx.fillRect(px - 13, py - 14, 3, 14); ctx.fillRect(px + 10, py - 14, 3, 14);
        for (let k = 0; k < 6; k++) { ctx.fillStyle = k % 2 ? '#f4efe4' : '#c0392b'; ctx.fillRect(px - 12 + k * 4, py - 11, 4, 3); }
      }
      const a = T * 0.6;
      drawHorse(ctx, ['falbe', 'rappe', 'schimmel'][Math.floor(T / 20) % 3], Math.round(cx + Math.cos(a) * (w / 2 - 42)), Math.round(y + h / 2 + 12 + Math.sin(a) * (h / 2 - 50)), -Math.sin(a) > 0 ? 1 : -1, T * 1.4, 1.1);
      fenceRing(ctx, x, y, w, h, 'front');
      return true;
    }
  }
  return false;
}
const TOWN_DECO = [['karren', 0], ['fass', 0], ['kisten', 0], ['karren', 1], ['schubkarre', 0], ['tisch', 0]];
function drawPeoplePixel(T) {
  const n = Object.keys(PROJECTS).filter(built).length * 2; // erst mit dem ersten Stadtprojekt ziehen Leute ein
  for (let i = 0; i < n; i++) {
    const sp = 0.012 + hash(i, 21) * 0.012, q = (T * sp + hash(i, 22)) % 1, back = q > 0.5, u = back ? (1 - q) * 2 : q * 2;
    const who = 'buerger' + (1 + (i % 5)), f = Math.floor(T * 8 + i * 3);
    if (i % 3 === 2) spr(ctx, who + '_rechts', f, Math.round((TOWN_X0 + 0.6 + u * (TOWN_W - 1.2)) * TILE), 14 * TILE + 26 + (i % 2) * 14, back); // auf der Straße
    else spr(ctx, who + (back ? '_hoch' : '_runter'), f, Math.round((TOWN_X0 + 4.3 + (i % 2) * 1.4) * TILE), Math.round((1.5 + u * 12) * TILE + 8)); // in der Gasse
  }
}

function drawProject(id, r, T) {
  const { x, y, w, h } = r, cx = x + w / 2;
  if (atlasReady && drawProjectPixel(id, r, T)) { outlinedText(ctx, PROJECTS[id].name, cx, y + h - 4, 11, '#fff'); return; }
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; rr(x + 10, y + 14, w - 14, h - 14, 10); ctx.fill();
  if (id === 'markt') {
    const cols = [['#e74c3c', '#fff'], ['#27ae60', '#fff'], ['#2f7fc1', '#fff']];
    const goods = ['🍎', '🥕', '🧀', '🍞', '🌽', '🥚'];
    for (let i = 0; i < 3; i++) {
      const sx = x + 10, sy = y + 10 + i * 60;
      ctx.fillStyle = '#9c6b3c'; ctx.fillRect(sx + 4, sy + 22, w - 28, 22);
      for (let k = 0; k < 6; k++) { ctx.fillStyle = cols[i][k % 2]; ctx.fillRect(sx + k * ((w - 20) / 6), sy, (w - 20) / 6, 18); }
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(sx, sy + 18, w - 20, 3);
      drawEmoji(ctx, goods[i * 2], sx + 22, sy + 32, 16); drawEmoji(ctx, goods[i * 2 + 1], sx + w - 50, sy + 32, 16);
    }
  } else if (id === 'brunnen') {
    const fy = y + h / 2;
    ctx.fillStyle = '#9e9e9e'; ctx.beginPath(); ctx.ellipse(cx, fy + 6, 38, 26, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#4aa3df'; ctx.beginPath(); ctx.ellipse(cx, fy + 4, 31, 20, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#bdbdbd'; ctx.fillRect(cx - 4, fy - 22, 8, 26);
    ctx.fillStyle = 'rgba(200,235,255,0.85)';
    for (let k = 0; k < 6; k++) { const a = k * 1.05 + T * 0.5, q = (T * 1.5 + k / 6) % 1; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * q * 22, fy - 22 + q * 26 - Math.sin(q * Math.PI) * 10, 2, 0, 7); ctx.fill(); }
  } else if (id === 'schule') {
    ctx.fillStyle = '#f4d03f'; rr(x + 12, y + 56, w - 24, h - 66, 4); ctx.fill();
    ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(x + 4, y + 62); ctx.lineTo(cx, y + 30); ctx.lineTo(x + w - 4, y + 62); ctx.fill();
    ctx.fillStyle = '#f4d03f'; ctx.fillRect(cx - 10, y + 12, 20, 26); ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(cx - 14, y + 14); ctx.lineTo(cx, y); ctx.lineTo(cx + 14, y + 14); ctx.fill();
    ctx.fillStyle = '#d4a017'; ctx.beginPath(); ctx.arc(cx, y + 24, 5, 0, 7); ctx.fill();
    for (let k = 0; k < 3; k++) { ctx.fillStyle = '#9fd8ff'; ctx.fillRect(x + 22 + k * 36, y + 76, 20, 18); }
    ctx.fillStyle = '#7a4e2a'; ctx.fillRect(cx - 9, y + h - 36, 18, 26);
  } else if (id === 'kirche') {
    ctx.fillStyle = '#f2efe8'; rr(x + 14, y + 70, w - 28, h - 80, 4); ctx.fill();
    ctx.fillStyle = '#5d6d7e'; ctx.beginPath(); ctx.moveTo(x + 8, y + 76); ctx.lineTo(cx, y + 50); ctx.lineTo(x + w - 8, y + 76); ctx.fill();
    ctx.fillStyle = '#f2efe8'; ctx.fillRect(cx - 14, y + 30, 28, 60);
    ctx.fillStyle = '#5d6d7e'; ctx.beginPath(); ctx.moveTo(cx - 17, y + 32); ctx.lineTo(cx, y - 4); ctx.lineTo(cx + 17, y + 32); ctx.fill();
    ctx.fillStyle = '#d4a017'; ctx.fillRect(cx - 1, y - 12, 2, 10);
    ctx.fillStyle = '#7fb3d5'; ctx.beginPath(); ctx.arc(cx, y + 48, 6, 0, 7); ctx.fill();
    ctx.fillStyle = '#7a4e2a'; rr(cx - 9, y + h - 36, 18, 26, [9, 9, 0, 0]); ctx.fill();
  } else if (id === 'reitschule') {
    ctx.fillStyle = '#e3c88f'; ctx.beginPath(); ctx.ellipse(cx, y + h / 2 + 4, w / 2 - 12, h / 2 - 16, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(cx, y + h / 2 + 4, w / 2 - 10, h / 2 - 14, 0, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - 12, y + h / 2 + 4); ctx.lineTo(cx + 12, y + h / 2 + 4); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillRect(cx - 14, y + h / 2 - 2, 3, 12); ctx.fillRect(cx + 11, y + h / 2 - 2, 3, 12);
    const a = T * 0.6, hx = cx + Math.cos(a) * (w / 2 - 34), hy = y + h / 2 + 4 + Math.sin(a) * (h / 2 - 34);
    drawHorse(ctx, ['falbe', 'rappe', 'schimmel'][Math.floor(T / 20) % 3], hx, hy, -Math.sin(a) > 0 ? 1 : -1, T * 1.4, 1.1);
  } else if (id === 'festplatz') {
    const wy = y + h / 2 - 8, R = 54;
    ctx.strokeStyle = '#7f8c8d'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx - 30, y + h - 12); ctx.lineTo(cx, wy); ctx.lineTo(cx + 30, y + h - 12); ctx.stroke();
    ctx.strokeStyle = '#ecf0f1'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, wy, R, 0, 7); ctx.stroke();
    const cols = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#e67e22', '#1abc9c', '#ff6b8a'];
    for (let k = 0; k < 8; k++) {
      const a = T * 0.35 + k * Math.PI / 4, gx = cx + Math.cos(a) * R, gy = wy + Math.sin(a) * R;
      ctx.strokeStyle = 'rgba(236,240,241,0.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx, wy); ctx.lineTo(gx, gy); ctx.stroke();
      ctx.fillStyle = cols[k]; rr(gx - 7, gy - 2, 14, 11, 3); ctx.fill();
    }
    ctx.fillStyle = '#bdc3c7'; ctx.beginPath(); ctx.arc(cx, wy, 6, 0, 7); ctx.fill();
  } else if (id === 'rathaus') {
    ctx.fillStyle = '#efe4cf'; rr(x + 10, y + 60, w - 20, h - 70, 4); ctx.fill();
    ctx.fillStyle = '#8e3b2f'; ctx.beginPath(); ctx.moveTo(x + 4, y + 66); ctx.lineTo(cx, y + 34); ctx.lineTo(x + w - 4, y + 66); ctx.fill();
    ctx.fillStyle = '#efe4cf'; ctx.fillRect(cx - 16, y + 14, 32, 40);
    ctx.fillStyle = '#8e3b2f'; ctx.beginPath(); ctx.moveTo(cx - 20, y + 16); ctx.lineTo(cx, y - 2); ctx.lineTo(cx + 20, y + 16); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, y + 32, 9, 0, 7); ctx.fill(); ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, y + 32); ctx.lineTo(cx + Math.cos(T * 0.2) * 6, y + 32 + Math.sin(T * 0.2) * 6); ctx.moveTo(cx, y + 32); ctx.lineTo(cx, y + 26); ctx.stroke();
    for (let k = 0; k < 5; k++) { ctx.fillStyle = '#d8ccb4'; ctx.fillRect(x + 22 + k * 32, y + 74, 8, h - 90); }
    ctx.fillStyle = '#c9bca2'; ctx.fillRect(x + 14, y + h - 16, w - 28, 6);
    ctx.strokeStyle = '#7f8c8d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 18, y + 60); ctx.lineTo(x + 18, y + 34); ctx.stroke();
    ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.moveTo(x + 18, y + 34); ctx.lineTo(x + 34 + Math.sin(T * 4) * 2, y + 39); ctx.lineTo(x + 18, y + 44); ctx.fill();
  }
  outlinedText(ctx, PROJECTS[id].name, cx, y + h - 4, 11, '#fff');
}

function drawPeople(T) {
  const n = Object.keys(PROJECTS).filter(built).length * 2; // erst mit dem ersten Stadtprojekt ziehen Leute ein
  const skins = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
  const shirts = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#2ecc71', '#e67e22', '#1abc9c'];
  for (let i = 0; i < n; i++) {
    const sp = 0.012 + hash(i, 21) * 0.012, q = (T * sp + hash(i, 22)) % 1, back = q > 0.5, u = back ? (1 - q) * 2 : q * 2;
    let px, py;
    if (i % 3 === 2) { px = (TOWN_X0 + 0.6 + u * (TOWN_W - 1.2)) * TILE; py = 14 * TILE + 16 + (i % 2) * 16; } // auf der Straße
    else { px = (TOWN_X0 + 4.3 + (i % 2) * 1.4) * TILE; py = (1.5 + u * 12) * TILE; }                        // in der Gasse
    const bob = Math.abs(Math.sin(T * 6 + i)) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(px, py + 8, 5, 2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = shirts[i % shirts.length]; rr(px - 4, py - 6 - bob, 8, 12, 3); ctx.fill();
    ctx.fillStyle = skins[i % skins.length]; ctx.beginPath(); ctx.arc(px, py - 10 - bob, 4, 0, 7); ctx.fill();
  }
}

// ---------- Stimmung: Wolkenschatten & Schmetterlinge ----------
function drawAmbient(T) {
  for (let i = 0; i < 4; i++) {
    const span = WORLD_W + 700, cx = ((T * (10 + i * 4) + i * 520) % span) - 350, cy = (0.12 + 0.25 * i) * WORLD_H;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1.7, 1);
    const gr = ctx.createRadialGradient(0, 0, 10, 0, 0, 120);
    gr.addColorStop(0, 'rgba(10,30,20,0.11)'); gr.addColorStop(1, 'rgba(10,30,20,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 120, 0, 7); ctx.fill();
    ctx.restore();
  }
  for (let i = 0; i < 5; i++) {
    const ax = (6 + hash(i, 11) * 15) * TILE, ay = (3 + hash(i, 12) * 9) * TILE;
    const x = ax + Math.sin(T * 0.37 + i) * 90 + Math.sin(T * 1.3 + i * 2) * 18;
    const y = ay + Math.cos(T * 0.29 + i * 3) * 50 + Math.sin(T * 1.7 + i) * 12;
    if (atlasReady) { // Pixel-Schmetterling: zwei Flügel, die auf und zu schlagen
      const c = ['#f2b6c6', '#f6d76b', '#c7b8f0', '#f4efd8', '#9fd3f0'][i], open = Math.sin(T * 14 + i) > 0, bx = Math.round(x), by = Math.round(y);
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(bx - 2, by + 14, 5, 2);
      ctx.fillStyle = c; if (open) { ctx.fillRect(bx - 5, by - 3, 4, 4); ctx.fillRect(bx + 2, by - 3, 4, 4); ctx.fillRect(bx - 4, by + 1, 3, 2); ctx.fillRect(bx + 2, by + 1, 3, 2); } else { ctx.fillRect(bx - 2, by - 4, 2, 5); ctx.fillRect(bx + 1, by - 4, 2, 5); }
      ctx.fillStyle = '#3a2a2a'; ctx.fillRect(bx, by - 3, 1, 6);
      continue;
    }
    ctx.save(); ctx.translate(x, y); ctx.scale(0.35 + Math.abs(Math.sin(T * 11 + i)) * 0.65, 1);
    drawEmoji(ctx, '🦋', 0, 0, 13); ctx.restore();
  }
}

// ---------- Tutorial-Zeiger ----------
function tutorialTarget() {
  const st = tutorialStep();
  if (!st || !G.introDone || S.placing) return null;
  const c = (x, y) => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE });
  const findTile = (fn) => { for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (owned(x, y) && fn(tile(x, y))) return c(x, y); return null; };
  switch (st.target) {
    case 'soil': return S.tool === 'hand' || S.tool === 'schaufel' ? null : findTile((t) => t.s === 'soil' && !t.c && !t.b);
    case 'crop': return findTile((t) => t.c && t.p >= 1);
    case 'grass': return S.tool === 'hand' || S.tool === 'schaufel' ? null : findTile((t) => t.s === 'grass' && !t.b && !t.c);
    case 'tafel': { if (!G.orders.some((o) => o.wait === undefined && hasAll(o.items))) return null; const d = DECOR[1]; return { x: (d.x + d.w / 2) * TILE, y: (d.y + 1) * TILE }; }
    case 'stall': { const b = Object.values(G.buildings).find((b) => b.type === 'huehnerstall' && (!b.job || b.job.p >= 1)); return b ? { x: (b.x + 1) * TILE, y: (b.y + 1) * TILE } : null; }
    case 'parcel': {
      if (G.level < nextParcelInfo().level) return null;
      const i = G.parcels.findIndex((o, k) => parcelBuyable(k)); if (i < 0) return null;
      return { x: (PARCEL_X0 + (i % PARCEL_COLS) * PARCEL + 2) * TILE, y: (PARCEL_Y0 + Math.floor(i / PARCEL_COLS) * PARCEL + 2) * TILE - 20 * uiK() };
    }
  }
  return null;
}
function drawPointer(T) {
  const p = tutorialTarget(); if (!p) return;
  const k = uiK(), pulse = (T * 1.2) % 1;
  ctx.strokeStyle = `rgba(255,255,255,${0.9 - pulse * 0.9})`; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(p.x, p.y, (14 + pulse * 18) * k, 0, 7); ctx.stroke();
  drawEmoji(ctx, '👇', p.x, p.y - (30 + Math.abs(Math.sin(T * 4)) * 8) * k, 30 * k);
}

function drawHover(T) {
  const h = S.hover;
  if (!h) return;
  if (S.placing) {
    const d = BUILDINGS[S.placing], ok = canPlace(S.placing, h.x, h.y);
    ctx.globalAlpha = 0.8;
    drawBuilding({ id: 0, type: S.placing, x: h.x, y: h.y, animals: 1, horses: ['braun'], job: null }, T);
    ctx.globalAlpha = 1;
    ctx.fillStyle = ok ? 'rgba(90,220,90,0.35)' : 'rgba(230,70,60,0.45)';
    rr(h.x * TILE, h.y * TILE, d.w * TILE, d.h * TILE, 8); ctx.fill();
    ctx.strokeStyle = ok ? '#7ed957' : '#e74c3c'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.lineDashOffset = -T * 20;
    rr(h.x * TILE + 1.5, h.y * TILE + 1.5, d.w * TILE - 3, d.h * TILE - 3, 8); ctx.stroke(); ctx.setLineDash([]);
    if (S.placing === 'sprinkler') {
      ctx.fillStyle = 'rgba(80,170,255,0.2)';
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (Math.abs(dx) + Math.abs(dy) <= 3) ctx.fillRect((h.x + dx) * TILE, (h.y + dy) * TILE, TILE, TILE);
    }
    return;
  }
  if (!inMap(h.x, h.y)) return;
  const a = actionFor(h.x, h.y, S.tool), t = tile(h.x, h.y);
  if (a || t.c) {
    ctx.strokeStyle = S.tool === 'schaufel' ? 'rgba(255,120,90,0.9)' : 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3; rr(h.x * TILE + 2, h.y * TILE + 2, TILE - 4, TILE - 4, 7); ctx.stroke();
  }
  if (t.c && t.p < 1) {
    const c = CROPS[t.c], left = Math.ceil((1 - t.p) * c.time / growMul() / (boostMap && boostMap[idx(h.x, h.y)] ? 1.5 : 1));
    outlinedText(ctx, fmtTime(left), h.x * TILE + TILE / 2, h.y * TILE - 6, 12, '#fff');
  }
}

function fmtTime(s) { s = Math.ceil(s); return s >= 60 ? Math.floor(s / 60) + 'm ' + (s % 60) + 's' : s + 's'; }

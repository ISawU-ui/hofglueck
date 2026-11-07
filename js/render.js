// ===== Zeichnen der Welt =====
'use strict';

// gemeinsamer Bedien-Zustand (wird von ui.js / main.js geändert)
const S = { tool: 'weizen', placing: null, hover: null };
const view = { scale: 1, ox: 0, oy: 0, dpr: 1 };
let canvas, ctx;

const WORLD_W = MAP_W * TILE, WORLD_H = MAP_H * TILE;
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const isPath = (x, y) => (x === 3 && y >= 1 && y <= 14) || y === 14;

function initRender() {
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');
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
const cam = { x: WORLD_W / 2, y: WORLD_H / 2, z: 1, auto: true };
// Bühne = Größe der Leinwand; l/r/t/b = Ränder, die von schwebenden Bedienelementen verdeckt sind
let stage = { w: 1, h: 1, l: 0, r: 0, t: 0, b: 0 };
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
  if (cam.auto) autoCam();
  applyCam();
}
const availW = () => Math.max(50, stage.w - stage.l - stage.r);
const availH = () => Math.max(50, stage.h - stage.t - stage.b);
// Mitte des freien Bereichs (Bildschirm-Koordinaten der Leinwand)
const availCenter = () => ({ x: stage.l + availW() / 2, y: stage.t + availH() / 2 });
const minZoom = () => Math.min(availW() / WORLD_W, availH() / WORLD_H);
const maxZoom = () => Math.max(minZoom(), 1.5);

// Auf dem Handy auf das eigene Land zoomen, am Computer die ganze Karte zeigen
function autoCam() {
  if (!isCompact()) { cam.x = WORLD_W / 2; cam.y = WORLD_H / 2; cam.z = minZoom(); return; }
  let x0 = 99, y0 = 99, x1 = 0, y1 = 0;
  G.parcels.forEach((own, i) => {
    if (!own) return;
    const px = PARCEL_X0 + (i % PARCEL_COLS) * PARCEL, py = PARCEL_Y0 + Math.floor(i / PARCEL_COLS) * PARCEL;
    x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px + PARCEL); y1 = Math.max(y1, py + PARCEL);
  });
  x0 -= 1; y0 -= 1; x1 += 1; y1 += 1; // etwas Rand, damit man die Nachbar-Schilder sieht
  cam.x = (x0 + x1) / 2 * TILE; cam.y = (y0 + y1) / 2 * TILE;
  cam.z = Math.min(availW() / ((x1 - x0) * TILE), availH() / ((y1 - y0) * TILE));
}

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

// Zoomen um einen Bildschirmpunkt (sx, sy), der dabei an derselben Stelle der Welt bleibt
function zoomAt(factor, sx, sy) {
  const w = screenToWorld(sx, sy);
  cam.z = Math.min(maxZoom(), Math.max(minZoom(), cam.z * factor));
  const c = availCenter();
  cam.x = w.x - (sx - c.x) / cam.z;
  cam.y = w.y - (sy - c.y) / cam.z;
  cam.auto = false; applyCam();
}
function panBy(dx, dy) { cam.x -= dx / cam.z; cam.y -= dy / cam.z; cam.auto = false; applyCam(); }
function resetCam() { cam.auto = true; autoCam(); applyCam(); }

// Auf kleinen Bildschirmen Schilder, Zahlen und Texte auf der Karte größer zeichnen
function uiK() { return Math.min(1.7, Math.max(1, 0.75 / view.scale)); }
function screenToWorld(px, py) { return { x: (px - view.ox) / view.scale, y: (py - view.oy) / view.scale }; }

function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

// ---------- Hauptfunktion ----------
function draw(time) {
  const T = time / 1000;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#3f7a35'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const s = view.scale * view.dpr;
  ctx.setTransform(s, 0, 0, s, view.ox * view.dpr, view.oy * view.dpr);

  drawGround();
  drawDecor(T);
  drawParcels();
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) drawCrop(x, y, T);
  const bs = Object.values(G.buildings).sort((a, b) => a.y - b.y);
  for (const b of bs) drawBuilding(b, T);
  for (const b of bs) drawBubble(b, T);
  drawTrees();
  drawHover(T);
  drawFX(ctx);
}

function drawGround() {
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const h = hash(x, y), px = x * TILE, py = y * TILE;
    if (isPath(x, y)) {
      ctx.fillStyle = '#d8b878'; ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = '#c9a564';
      for (let i = 0; i < 3; i++) ctx.fillRect(px + hash(x + i, y * 3) * 40, py + hash(x * 7, y + i) * 40, 4, 3);
      continue;
    }
    ctx.fillStyle = (x + y) % 2 ? '#6cbf4f' : '#67b84b'; ctx.fillRect(px, py, TILE, TILE);
    if (h > 0.55) { // Grasbüschel
      ctx.strokeStyle = '#4f9a3a'; ctx.lineWidth = 2; ctx.beginPath();
      const gx = px + 8 + h * 30, gy = py + 14 + hash(y, x) * 26;
      ctx.moveTo(gx - 4, gy); ctx.lineTo(gx - 6, gy - 7); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy - 9); ctx.moveTo(gx + 4, gy); ctx.lineTo(gx + 6, gy - 7);
      ctx.stroke();
    }
    if (h > 0.93) { ctx.fillStyle = hash(x, y + 9) > 0.5 ? '#fff6a8' : '#ffb3c7'; ctx.beginPath(); ctx.arc(px + 30, py + 30, 3, 0, 7); ctx.fill(); }
  }
}

function drawTrees() {
  for (let x = 0; x < MAP_W; x++) for (const y of [0, 15]) {
    const h = hash(x, y + 50), px = x * TILE + 24 + (h - 0.5) * 14, py = y * TILE + (y === 0 ? 30 : 34);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(px, py + 10, 20, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#7a4e2a'; ctx.fillRect(px - 4, py - 4, 8, 14);
    ctx.fillStyle = h > 0.5 ? '#2f7d32' : '#357f2e';
    ctx.beginPath(); ctx.arc(px, py - 14, 19, 0, 7); ctx.fill();
    ctx.fillStyle = '#43993d'; ctx.beginPath(); ctx.arc(px - 6, py - 20, 10, 0, 7); ctx.fill();
  }
}

function drawDecor(T) {
  for (const d of DECOR) {
    const x = d.x * TILE, y = d.y * TILE, w = d.w * TILE, h = d.h * TILE;
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; rr(x + 8, y + 12, w - 10, h - 10, 8); ctx.fill();
    if (d.id === 'haus') {
      ctx.fillStyle = '#f3e3c3'; rr(x + 10, y + 50, w - 20, h - 58, 4); ctx.fill();
      ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(x + 2, y + 56); ctx.lineTo(x + w / 2, y + 8); ctx.lineTo(x + w - 2, y + 56); ctx.fill();
      ctx.fillStyle = '#8e2a20'; ctx.fillRect(x + w - 40, y + 14, 12, 22);
      ctx.fillStyle = '#7a4e2a'; rr(x + w / 2 - 11, y + h - 36, 22, 30, 3); ctx.fill();
      ctx.fillStyle = '#9fd8ff'; ctx.fillRect(x + 22, y + 72, 20, 18); ctx.fillRect(x + w - 42, y + 72, 20, 18);
    } else if (d.id === 'tafel') {
      ctx.fillStyle = '#7a4e2a'; ctx.fillRect(x + 22, y + 60, 8, 32); ctx.fillRect(x + w - 30, y + 60, 8, 32);
      ctx.fillStyle = '#a8763e'; rr(x + 10, y + 10, w - 20, 58, 6); ctx.fill();
      ctx.fillStyle = '#8a5f30'; rr(x + 14, y + 14, w - 28, 50, 4); ctx.fill();
      for (let i = 0; i < 3; i++) {
        const o = G.orders[i], ready = o && o.wait === undefined && hasAll(o.items);
        ctx.fillStyle = o && o.wait === undefined ? (ready ? '#d9ffb0' : '#fff8e0') : 'rgba(255,255,255,0.25)';
        ctx.save(); ctx.translate(x + 34 + i * 38, y + 38); ctx.rotate((i - 1) * 0.08);
        ctx.fillRect(-14, -18, 28, 34); ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(0, -16, 3, 0, 7); ctx.fill();
        ctx.restore();
      }
      const n = G.orders.filter((o) => o.wait === undefined && hasAll(o.items)).length;
      if (n) badge(x + w - 12, y + 10 + Math.sin(T * 5) * 3, n);
    } else if (d.id === 'scheune') {
      ctx.fillStyle = '#b03a2e'; rr(x + 8, y + 44, w - 16, h - 50, 4); ctx.fill();
      ctx.fillStyle = '#7d2a20'; ctx.beginPath(); ctx.moveTo(x + 2, y + 50); ctx.lineTo(x + 24, y + 12); ctx.lineTo(x + w - 24, y + 12); ctx.lineTo(x + w - 2, y + 50); ctx.fill();
      ctx.fillStyle = '#f5f0e6'; rr(x + w / 2 - 22, y + h - 56, 44, 50, 3); ctx.fill();
      ctx.strokeStyle = '#b03a2e'; ctx.lineWidth = 4; ctx.beginPath();
      ctx.moveTo(x + w / 2 - 20, y + h - 54); ctx.lineTo(x + w / 2 + 20, y + h - 8); ctx.moveTo(x + w / 2 + 20, y + h - 54); ctx.lineTo(x + w / 2 - 20, y + h - 8); ctx.stroke();
      const total = Object.values(G.inv).reduce((s, n) => s + n, 0);
      if (total) badge(x + w - 10, y + 16, total);
    } else if (d.id === 'teich') {
      ctx.fillStyle = '#4aa3df'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2 - 6, h / 2 - 8, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x + w / 2 + Math.sin(T) * 10, y + h / 2, 14 + (T * 8) % 12, 5, 0, 0, 7); ctx.stroke();
      ctx.fillStyle = '#3c9a4a'; ctx.beginPath(); ctx.arc(x + 34, y + 34, 8, 0.4, 6); ctx.fill();
      drawEmoji(ctx, '🦆', x + w - 40 + Math.sin(T * 0.5) * 16, y + h / 2 + 2, 22);
    }
    outlinedText(ctx, d.name, x + w / 2, y + h - 2, 11, '#fff');
  }
}

function badge(x, y, n) {
  ctx.save(); ctx.translate(x, y); ctx.scale(uiK(), uiK());
  ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(n > 99 ? '99+' : n, 0, 1);
  ctx.restore();
}

function drawParcels() {
  const next = nextParcelInfo();
  for (let i = 0; i < G.parcels.length; i++) {
    const px = i % PARCEL_COLS, py = Math.floor(i / PARCEL_COLS);
    const x = (PARCEL_X0 + px * PARCEL) * TILE, y = (PARCEL_Y0 + py * PARCEL) * TILE, w = PARCEL * TILE;
    if (G.parcels[i]) {
      // Ackerboden
      for (let tx = 0; tx < PARCEL; tx++) for (let ty = 0; ty < PARCEL; ty++) {
        const gx = PARCEL_X0 + px * PARCEL + tx, gy = PARCEL_Y0 + py * PARCEL + ty, t = tile(gx, gy);
        if (t.s !== 'soil' || t.b) continue;
        const sx = gx * TILE, sy = gy * TILE;
        ctx.fillStyle = t.c ? '#7a4a28' : '#8b5a33'; rr(sx + 2, sy + 2, TILE - 4, TILE - 4, 6); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.13)';
        for (let k = 0; k < 3; k++) ctx.fillRect(sx + 7, sy + 10 + k * 12, TILE - 14, 3);
        if (boostMap && boostMap[idx(gx, gy)]) { ctx.fillStyle = 'rgba(80,170,255,0.16)'; rr(sx + 2, sy + 2, TILE - 4, TILE - 4, 6); ctx.fill(); }
      }
      continue;
    }
    ctx.fillStyle = 'rgba(30,60,20,0.35)'; ctx.fillRect(x, y, w, w);
    // Zaun
    ctx.strokeStyle = '#c9a26b'; ctx.lineWidth = 3; ctx.strokeRect(x + 4, y + 4, w - 8, w - 8);
    ctx.fillStyle = '#a77d48';
    for (let k = 0; k <= 4; k++) { ctx.fillRect(x + 2 + k * (w - 8) / 4, y + 1, 5, 8); ctx.fillRect(x + 2 + k * (w - 8) / 4, y + w - 9, 5, 8); }
    if (parcelBuyable(i)) {
      const ok = G.level >= next.level;
      ctx.save(); ctx.translate(x + w / 2, y + w / 2); ctx.scale(uiK(), uiK());
      ctx.fillStyle = '#7a4e2a'; ctx.fillRect(-3, 0, 6, 26);
      ctx.fillStyle = '#e8c690'; rr(-46, -26, 92, 36, 6); ctx.fill();
      ctx.strokeStyle = '#7a4e2a'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#4a2f18'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ok ? '💰 ' + next.cost : '🔒 Level ' + next.level, 0, -8);
      ctx.restore();
    }
  }
}

function drawCrop(x, y, T) {
  const t = tile(x, y);
  if (!t.c) return;
  const px = x * TILE + TILE / 2, py = y * TILE + TILE / 2, p = t.p;
  if (p >= 1) {
    const b = Math.sin(T * 4 + x + y) * 2;
    ctx.fillStyle = 'rgba(255,240,120,0.35)'; ctx.beginPath(); ctx.arc(px, py + 2, 17, 0, 7); ctx.fill();
    drawEmoji(ctx, ITEMS[t.c].icon, px, py + b, 34);
    if ((T * 1.3 + hash(x, y) * 10) % 3 < 0.25) drawEmoji(ctx, '✨', px + 13, py - 13, 14);
    return;
  }
  const stage = p < 0.33 ? 0 : p < 0.66 ? 1 : 2, sway = Math.sin(T * 2 + x * 0.7) * 1.5;
  const spots = [[-11, -9], [9, -10], [-9, 9], [11, 8], [0, 0]];
  for (const [dx, dy] of spots) {
    const sx = px + dx, sy = py + dy + 4;
    if (stage === 0) { ctx.fillStyle = '#9ad35a'; ctx.fillRect(sx - 1.5, sy - 3, 3, 4); continue; }
    const hgt = stage === 1 ? 7 : 12;
    ctx.strokeStyle = '#3f8f2d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + sway, sy - hgt); ctx.stroke();
    ctx.fillStyle = stage === 1 ? '#7cc94a' : '#5fb53b';
    ctx.beginPath(); ctx.ellipse(sx + sway - 3, sy - hgt + 1, 4, 2.2, -0.6, 0, 7); ctx.ellipse(sx + sway + 3, sy - hgt + 2, 4, 2.2, 0.6, 0, 7); ctx.fill();
    if (stage === 2 && t.c === 'weizen') { ctx.fillStyle = '#d9c25a'; ctx.fillRect(sx + sway - 1.5, sy - hgt - 5, 3, 6); }
  }
}

// ---------- Gebäude & Tiere ----------
function drawBuilding(b, T) {
  const d = BUILDINGS[b.type], x = b.x * TILE, y = b.y * TILE, w = d.w * TILE, h = d.h * TILE;
  if (d.kind === 'boost') {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(x + 24, y + 38, 14, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#7f8c8d'; ctx.fillRect(x + 21, y + 14, 6, 24);
    ctx.fillStyle = '#95a5a6'; ctx.beginPath(); ctx.arc(x + 24, y + 14, 7, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(120,200,255,0.8)'; ctx.lineWidth = 2;
    const a = T * 3;
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x + 24, y + 14, 12 + ((T * 20 + k * 8) % 24), a + k * 2, a + k * 2 + 0.7); ctx.stroke(); }
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; rr(x + 6, y + 10, w - 6, h - 6, 10); ctx.fill();
  if (d.kind === 'animal') {
    ctx.fillStyle = d.ground; rr(x + 3, y + 3, w - 6, h - 6, 8); ctx.fill();
    ctx.strokeStyle = '#f2e6cf'; ctx.lineWidth = 3; rr(x + 4, y + 4, w - 8, h - 8, 8); ctx.stroke();
    // kleine Hütte
    ctx.fillStyle = d.color; ctx.fillRect(x + 8, y + 16, 30, 22);
    ctx.fillStyle = '#5d3a1a'; ctx.beginPath(); ctx.moveTo(x + 4, y + 18); ctx.lineTo(x + 23, y + 4); ctx.lineTo(x + 42, y + 18); ctx.fill();
    ctx.fillStyle = '#3b2412'; ctx.fillRect(x + 18, y + 26, 10, 12);
    for (let i = 0; i < b.animals; i++) {
      const sp = 0.25 + hash(b.id, i) * 0.3, ph = hash(i, b.id) * 10;
      const ax = x + w / 2 + Math.sin(T * sp + ph) * (w / 2 - 22), ay = y + h / 2 + 12 + Math.sin(T * sp * 1.3 + ph * 2) * (h / 2 - 28);
      drawAnimal(d.animal, ax, ay, Math.cos(T * sp + ph) > 0 ? 1 : -1, T + ph);
    }
  } else {
    ctx.fillStyle = d.color; rr(x + 8, y + 30, w - 16, h - 36, 6); ctx.fill();
    ctx.fillStyle = '#6d4c41'; ctx.beginPath(); ctx.moveTo(x + 2, y + 36); ctx.lineTo(x + w / 2, y + 6); ctx.lineTo(x + w - 2, y + 36); ctx.fill();
    ctx.fillStyle = '#4e342e'; rr(x + w / 2 - 10, y + h - 30, 20, 24, 3); ctx.fill();
    if (b.type === 'muehle') { // drehende Flügel
      ctx.save(); ctx.translate(x + w / 2, y + 22); ctx.rotate(b.job && b.job.p < 1 ? T * 3 : 0);
      ctx.fillStyle = '#f0e6d2';
      for (let k = 0; k < 4; k++) { ctx.rotate(Math.PI / 2); ctx.fillRect(-3, 0, 6, 28); }
      ctx.restore();
    } else drawEmoji(ctx, d.icon, x + w / 2, y + 50, 26);
    if (b.job && b.job.p < 1 && b.type !== 'muehle') { // Rauch
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      for (let k = 0; k < 3; k++) { const q = (T * 0.8 + k / 3) % 1; ctx.beginPath(); ctx.arc(x + w - 22 + q * 8, y + 10 - q * 24, 3 + q * 5, 0, 7); ctx.fill(); }
    }
  }
}

function drawAnimal(type, x, y, dir, T) {
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  const bob = Math.abs(Math.sin(T * 6)) * 1.5;
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(0, 7, 10, 3, 0, 0, 7); ctx.fill();
  if (type === 'huhn') {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, -bob, 8, 6.5, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(6, -6 - bob, 4.5, 0, 7); ctx.fill();
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

// Status-Blase über dem Gebäude
function drawBubble(b, T) {
  const d = BUILDINGS[b.type];
  if (d.kind === 'boost') return;
  const cx = (b.x + d.w / 2) * TILE, top = b.y * TILE;
  if (b.job && b.job.p >= 1) {
    const by = top - 6 + Math.sin(T * 5) * 3;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, by, 17, 0, 7); ctx.fill();
    ctx.strokeStyle = '#5cb85c'; ctx.lineWidth = 3; ctx.stroke();
    drawEmoji(ctx, ITEMS[b.job.out].icon, cx, by, 24);
  } else if (b.job) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; rr(cx - 30, top - 4, 60, 9, 4); ctx.fill();
    ctx.fillStyle = '#7ed957'; rr(cx - 29, top - 3, 58 * b.job.p, 7, 3); ctx.fill();
  } else {
    const r = recipe(b), ok = hasAll(r.in), icon = ITEMS[Object.keys(r.in)[0]].icon;
    const by = top - 4;
    ctx.globalAlpha = ok ? 1 : 0.75;
    ctx.fillStyle = ok ? '#fff7d6' : '#f2d7d5'; ctx.beginPath(); ctx.arc(cx, by, 14, 0, 7); ctx.fill();
    ctx.strokeStyle = ok ? '#f0ad4e' : '#c0392b'; ctx.lineWidth = 2; ctx.stroke();
    drawEmoji(ctx, ok ? icon : '💤', cx, by, 18);
    ctx.globalAlpha = 1;
  }
}

function drawHover(T) {
  const h = S.hover;
  if (!h) return;
  if (S.placing) {
    const d = BUILDINGS[S.placing], ok = canPlace(S.placing, h.x, h.y);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = ok ? 'rgba(90,220,90,0.45)' : 'rgba(230,70,60,0.45)';
    rr(h.x * TILE, h.y * TILE, d.w * TILE, d.h * TILE, 8); ctx.fill();
    drawEmoji(ctx, d.icon, (h.x + d.w / 2) * TILE, (h.y + d.h / 2) * TILE, 30);
    if (S.placing === 'sprinkler') {
      ctx.fillStyle = 'rgba(80,170,255,0.2)';
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (Math.abs(dx) + Math.abs(dy) <= 3) ctx.fillRect((h.x + dx) * TILE, (h.y + dy) * TILE, TILE, TILE);
    }
    ctx.globalAlpha = 1;
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

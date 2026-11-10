// ===== Landschaft & Pixel-Generatoren (Update 6) =====
// Statische Hof-Landschaft (Wald, See, Berg, Wege, Hofplatz) wird einmal in eine Leinwand gezeichnet.
// Häuser, Autos, Hundehütte, Kratzbaum usw. sind selbst gepixelt (aus dem Hof-Plan der Deko-Werkstatt übernommen).
'use strict';
const SCN = (() => {
  const T = TILE, W = MAP_W + (TOWN_ON ? TOWN_W : 0), H = MAP_H;
  // Deko-Atlas (js/deko.js): Deko, Bäume, Felsen, Boot, Tier-Animationen, Pixel-Schrift
  const DATL = new Image(); let dReady = false;
  const readyCbs = [];
  DATL.onload = () => { dReady = true; readyCbs.splice(0).forEach((f) => f()); };
  if (typeof DEKO_SRC !== 'undefined') DATL.src = DEKO_SRC;
  const onReady = (f) => { if (dReady) f(); else readyCbs.push(f); };
  // Bild aus dem Deko-Atlas, (x, y) = unten Mitte
  function dspr(g, key, x, y, flip = false, alpha = 1) {
    const r = DSPR[key]; if (!r || !dReady) return false;
    const [sx, sy, w, h] = r, dx = Math.round(x - w / 2), dy = Math.round(y - h);
    if (alpha !== 1) g.globalAlpha = alpha;
    if (flip) { g.save(); g.translate(dx + w, dy); g.scale(-1, 1); g.drawImage(DATL, sx, sy, w, h, 0, 0, w, h); g.restore(); }
    else g.drawImage(DATL, sx, sy, w, h, dx, dy, w, h);
    if (alpha !== 1) g.globalAlpha = 1;
    return true;
  }
  const ps = (g, k, x, y, flip = false) => dspr(g, 'p_' + k, x, y, flip);
  function danim(g, key, frame, x, y, flip = false) {
    const fl = DANIM[key]; if (!fl || !dReady) return false;
    const [sx, sy, w, h] = fl[((frame % fl.length) + fl.length) % fl.length], dx = Math.round(x - w / 2), dy = Math.round(y - h);
    if (flip) { g.save(); g.translate(dx + w, dy); g.scale(-1, 1); g.drawImage(DATL, sx, sy, w, h, 0, 0, w, h); g.restore(); }
    else g.drawImage(DATL, sx, sy, w, h, dx, dy, w, h);
    return true;
  }
  // Pixel-Schrift für eigene Schildtexte (zentriert um cx, oben bei y)
  function pixelText(g, s, cx, y, color) {
    const c = DFONT.c; let w = 0; for (const ch of s) w += (c[ch] ? c[ch][1] : 4) + 1;
    let x = Math.round(cx - w / 2);
    const tmp = pixelText.cv || (pixelText.cv = document.createElement('canvas'));
    tmp.width = Math.max(1, w); tmp.height = DFONT.h; const tg = tmp.getContext('2d');
    tg.clearRect(0, 0, tmp.width, tmp.height);
    let tx = 0; for (const ch of s) { const e = c[ch]; if (e) tg.drawImage(DATL, DFONT.x + e[0], DFONT.y, e[1], DFONT.h, tx, 0, e[1], DFONT.h); tx += (e ? e[1] : 4) + 1; }
    tg.globalCompositeOperation = 'source-in'; tg.fillStyle = color; tg.fillRect(0, 0, tmp.width, tmp.height); tg.globalCompositeOperation = 'source-over';
    g.drawImage(tmp, x, Math.round(y));
  }



  let seed = 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const R = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };


  // ---------- Gelände ----------
  const LAKE = [[5.8, 23.4, 8.4, 5.8], [12.6, 25.4, 4.8, 3.4], [1.5, 20.2, 3, 3]];
  const lakeV = (px, py) => { let v = -9; for (const [cx, cy, rx, ry] of LAKE) { const dx = (px / T - cx) / rx, dy = (py / T - cy) / ry; v = Math.max(v, 1 - (dx * dx + dy * dy)); } return v; };

  // Berg: drei Felsterrassen, jede höhere weiter hinten (oben) und weiter rechts
  const MX = 28.4 * T;
  const TER = [
    { x0: MX, base: (x) => (4.45 + Math.sin(x / T * 0.9) * 0.25 + Math.sin(x / T * 2.1) * 0.1) * T, ch: 1.15 * T },
    { x0: MX + 2.6 * T, base: (x) => (2.9 + Math.sin(x / T * 1.3 + 1) * 0.25) * T, ch: 0.95 * T },
    { x0: MX + 5.6 * T, base: (x) => (1.45 + Math.sin(x / T * 1.7 + 2) * 0.2) * T, ch: 0.85 * T },
  ];
  const slope = (i, y) => Math.max(0, (y - (TER[i].base(TER[i].x0) - TER[i].ch - 0.6 * T)) * 0.55); // schräge Westflanke
  const terraceAt = (x, y) => { let k = -1; for (let i = 0; i < TER.length; i++) if (x >= TER[i].x0 + slope(i, y) && y < TER[i].base(x)) k = i; return k; };
  const inMount = (x, y) => terraceAt(x, y) >= 0;

  function dirt(g, x, y, w, h) {
    R(g, x, y, w, h, '#b8854b');
    for (let i = 0; i < w * h / 90; i++) R(g, x + rnd() * w, y + rnd() * h, 2, 2, rnd() < 0.5 ? '#9a6a40' : '#c99a5e');
    for (let xx = x; xx < x + w; xx += 4) { if (rnd() < 0.5) R(g, xx, y, 4, 4, '#6ea24b'); if (rnd() < 0.5) R(g, xx, y + h - 4, 4, 4, '#6ea24b'); }
    for (let yy = y; yy < y + h; yy += 4) { if (rnd() < 0.5) R(g, x, yy, 4, 4, '#6ea24b'); if (rnd() < 0.5) R(g, x + w - 4, yy, 4, 4, '#6ea24b'); }
  }
  function paved(g, r) {
    const [sx, sy, w, h] = SPR.pflaster[0];
    g.save(); g.beginPath(); g.rect(r.x * T, r.y * T, r.w * T, r.h * T); g.clip();
    for (let y = r.y * T; y < (r.y + r.h) * T; y += h) for (let x = r.x * T; x < (r.x + r.w) * T; x += w) g.drawImage(ATL, sx, sy, w, h, x, y, w, h);
    g.restore();
    R(g, r.x * T, (r.y + r.h) * T - 2, r.w * T, 2, 'rgba(60,40,20,.35)');
  }
  function lake(g) {
    for (let y = 15 * T; y < H * T; y += 4) for (let x = 0; x < 19 * T; x += 4) {
      const v = lakeV(x + 2, y + 2) + (rnd() - 0.5) * 0.03;
      if (v > 0.06) R(g, x, y, 4, 4, v > 0.55 ? '#4b66ad' : v > 0.22 ? '#5472bc' : '#6b8bd0');
      else if (v > -0.06) R(g, x, y, 4, 4, rnd() < 0.2 ? '#cbb27c' : '#d9c38f');
    }
    for (let i = 0; i < 80; i++) { const x = rnd() * 18 * T, y = 16 * T + rnd() * 11 * T; if (lakeV(x, y) > 0.2) R(g, x, y, 6 + rnd() * 8, 2, 'rgba(255,255,255,.35)'); }
  }

  // Berg zeichnen: Plateaus mit Geröll und Gras, darunter senkrechte Felswände mit Schichten und Schatten
  function mountain(g) {
    seed = 77;
    for (let k = 0; k < TER.length; k++) {
      const t = TER[k];
      for (let x = MX - 2 * T; x < MAP_W * T; x += 4) {
        const yb = t.base(x), yTop = yb - t.ch;
        for (let y = 0; y < yb; y += 4) {
          if (x < t.x0 + slope(k, y)) continue;
          const edge = x - (t.x0 + slope(k, y));
          if (y >= yTop) { // Felswand
            const band = Math.floor((y - yTop) / 9 + x / 37) % 3, r = rnd();
            let c = band === 0 ? '#7a6b56' : band === 1 ? '#6c5e4b' : '#857660';
            if (r < 0.06) c = '#5b4f3f'; else if (r < 0.1) c = '#968671';
            if (y < yTop + 4) c = '#c4b596';
            else if (y > yb - 6) c = '#4f4334';
            if (edge < 8) c = '#5b4f3f';
            R(g, x, y, 4, 4, c);
          } else { // Plateau
            const r = rnd();
            let c = r < 0.18 ? '#9c8e73' : r < 0.32 ? '#b5a78a' : '#a99b7f';
            if (r > 0.9) c = '#7f9a4c';
            if (edge < 8) c = '#8b7d64';
            R(g, x, y, 4, 4, c);
          }
        }
        if (x >= t.x0 + slope(k, yb)) R(g, x, yb, 4, 6, 'rgba(30,25,15,.22)');
      }
    }
    // kleiner Wasserfall von der oberen Terrasse bis in einen Bach
    const wx = MX + 7.4 * T, fw = 18;
    const pool = (cx, cy, rx, ry) => { for (let y = -ry; y <= ry; y += 2) for (let x = -rx; x <= rx; x += 2) { const d = (x * x) / (rx * rx) + (y * y) / (ry * ry); if (d <= 1) R(g, cx + x, cy + y, 2, 2, d > 0.7 ? '#9a8c72' : d > 0.45 ? '#6b8bd0' : '#5472bc'); } };
    // Bach auf der mittleren Terrasse, Becken am Fuß jeder Wand
    for (let y = TER[1].base(wx); y < TER[0].base(wx) - TER[0].ch; y += 2) R(g, wx + 3, y, fw - 6, 2, (y / 2) % 3 ? '#5f80c8' : '#7a9ad8');
    pool(wx + fw / 2, TER[1].base(wx) + 6, 20, 7);
    pool(wx + fw / 2, TER[0].base(wx) + 9, 28, 10);
    for (let k = 1; k >= 0; k--) {
      const t = TER[k], yb = t.base(wx), yTop = yb - t.ch - 2;
      for (let y = yTop; y < yb + 2; y += 2) for (let x = 0; x < fw; x += 2) {
        const s = (x + Math.floor(y / 2) * 3) % 7;
        R(g, wx + x, y, 2, 2, x < 2 || x >= fw - 2 ? '#7a9ad8' : s === 0 ? '#ffffff' : s < 3 ? '#cfe2fa' : '#9fc0ee');
      }
      for (let i = 0; i < 14; i++) R(g, wx - 8 + rnd() * (fw + 16), yb - 2 + rnd() * 8, 3, 2, '#f4f9ff');
    }
  }

  // ---------- eigene Pixel-Objekte ----------
  // Hundehütte: Satteldach mit Schindeln, Holzbretter, Namensschild, Napf, Knochen, Matte
  function dogHouse(g, x, y) {
    const a = Math.round(x - 22), b = Math.round(y - 46);
    R(g, a + 2, b + 42, 46, 5, 'rgba(0,0,0,.2)');
    R(g, a + 9, b + 43, 26, 4, '#5f86c9'); for (let i = 0; i < 26; i += 4) R(g, a + 9 + i, b + 43, 2, 4, '#4a6fae');
    const wl = a + 6, wr = a + 38, wy = b + 20, wb = b + 43;
    R(g, wl, wy, wr - wl, wb - wy, '#c48a52');
    for (let yy = wy + 3; yy < wb; yy += 5) { R(g, wl, yy, wr - wl, 1, '#8a5a32'); R(g, wl, yy + 1, wr - wl, 1, '#d9a36a'); }
    for (let r = 0; r < 14; r++) { const half = Math.round(r * 1.15); R(g, a + 22 - half, wy - 14 + r, half * 2, 1, '#c48a52'); }
    R(g, wl - 1, wy, 1, wb - wy, '#3b2412'); R(g, wr, wy, 1, wb - wy, '#3b2412'); R(g, wl - 1, wb, wr - wl + 2, 1, '#3b2412');
    R(g, a + 15, b + 30, 14, 13, '#2a170b'); R(g, a + 16, b + 28, 12, 2, '#2a170b'); R(g, a + 18, b + 27, 8, 1, '#2a170b');
    R(g, a + 14, b + 29, 1, 14, '#5d3a1a'); R(g, a + 29, b + 29, 1, 14, '#5d3a1a');
    R(g, a + 17, b + 39, 10, 4, '#b8462f'); R(g, a + 18, b + 39, 8, 1, '#d9604a');
    R(g, a + 15, b + 21, 14, 5, '#ecd9a6'); R(g, a + 15, b + 21, 14, 1, '#8a5a32'); R(g, a + 15, b + 25, 14, 1, '#8a5a32');
    for (let i = 0; i < 5; i++) R(g, a + 17 + i * 2, b + 23, 1, 1, '#5d3a1a');
    for (let r = 0; r < 20; r++) {
      const half = 4 + Math.round(r * 1.15), y0 = b + 2 + r;
      for (let side = -1; side <= 1; side += 2) {
        for (let t = 0; t < 7; t++) {
          const xx = a + 22 + side * (half - t);
          const shade = ((r + t) % 4 === 0) ? '#8f3423' : (t === 0 ? '#e06a4c' : (side > 0 ? '#a83c28' : '#c24d33'));
          R(g, xx, y0, 1, 1, shade);
        }
        R(g, a + 22 + side * (half + 1), y0, 1, 1, '#3b2412');
      }
    }
    R(g, a + 20, b, 4, 4, '#7a2a1a'); R(g, a + 21, b - 1, 2, 1, '#3b2412');
    R(g, a + 40, b + 38, 11, 5, '#3a74c4'); R(g, a + 41, b + 37, 9, 2, '#8b5a2b'); R(g, a + 42, b + 36, 2, 1, '#a8774a'); R(g, a + 46, b + 36, 2, 1, '#a8774a'); R(g, a + 40, b + 43, 11, 1, '#22457a');
    R(g, a - 4, b + 40, 9, 2, '#f3ecd9'); R(g, a - 5, b + 39, 2, 2, '#f3ecd9'); R(g, a - 5, b + 41, 2, 2, '#f3ecd9'); R(g, a + 4, b + 39, 2, 2, '#f3ecd9'); R(g, a + 4, b + 41, 2, 2, '#f3ecd9');
  }
  // Katzenbaum: Sockel, Sisal-Stämme, Höhlenhaus mit Spitzdach, Liegebrett mit Kissen, Spielball
  function catTree(g, x, y) {
    const a = Math.round(x - 22), b = Math.round(y - 66);
    R(g, a + 2, b + 63, 42, 4, 'rgba(0,0,0,.2)');
    R(g, a + 2, b + 58, 40, 6, '#8a5a32'); R(g, a + 2, b + 58, 40, 1, '#b07a45'); R(g, a + 1, b + 64, 42, 1, '#3b2412');
    const sisal = (sx, sy, h) => { R(g, sx, sy, 6, h, '#d9c49a'); for (let i = 0; i < h; i += 3) R(g, sx, sy + i, 6, 1, '#b39a68'); R(g, sx - 1, sy, 1, h, '#5d3a1a'); R(g, sx + 6, sy, 1, h, '#5d3a1a'); };
    sisal(a + 30, b + 14, 44); sisal(a + 8, b + 44, 14);
    R(g, a + 2, b + 30, 26, 16, '#a06a3c'); for (let yy = b + 34; yy < b + 46; yy += 4) R(g, a + 2, yy, 26, 1, '#7d5230');
    R(g, a + 1, b + 30, 1, 16, '#3b2412'); R(g, a + 28, b + 30, 1, 16, '#3b2412'); R(g, a + 1, b + 46, 28, 1, '#3b2412');
    R(g, a + 10, b + 36, 10, 10, '#24150a'); R(g, a + 11, b + 35, 8, 1, '#24150a'); R(g, a + 12, b + 34, 6, 1, '#24150a');
    R(g, a + 5, b + 33, 3, 3, '#ffe9a8');
    for (let r = 0; r < 10; r++) { const half = 3 + Math.round(r * 1.5); R(g, a + 15 - half, b + 20 + r, half * 2, 1, r % 3 === 0 ? '#3f6f8f' : '#4f86a8'); R(g, a + 15 - half - 1, b + 20 + r, 1, 1, '#24384a'); R(g, a + 15 + half, b + 20 + r, 1, 1, '#24384a'); }
    R(g, a + 14, b + 18, 2, 2, '#ffd34d');
    R(g, a + 22, b + 10, 22, 5, '#8a5a32'); R(g, a + 22, b + 10, 22, 1, '#b07a45'); R(g, a + 21, b + 15, 24, 1, '#3b2412');
    R(g, a + 24, b + 7, 18, 4, '#c0392b'); R(g, a + 25, b + 7, 16, 1, '#e05a48');
    R(g, a + 42, b + 15, 1, 14, '#e8d3a0'); R(g, a + 40, b + 29, 5, 5, '#e05a48'); R(g, a + 41, b + 29, 2, 1, '#ff9a8a');
  }
  // Kleinwagen von vorne: runde Kabine, Mintgrün, Chrom
  // schmaler, edler Stellplatz: Natursteinpflaster mit Bordsteinen
  function lantern(g, x, y) {
    g.fillStyle = 'rgba(255,220,120,.18)'; g.beginPath(); g.arc(x, y - 34, 16, 0, Math.PI * 2); g.fill();
    R(g, x - 1, y - 30, 3, 30, '#2f2f2f'); R(g, x - 4, y - 2, 9, 2, '#2f2f2f');
    R(g, x - 4, y - 40, 9, 10, '#2f2f2f'); R(g, x - 3, y - 39, 7, 8, '#ffe08a'); R(g, x - 5, y - 42, 11, 2, '#2f2f2f'); R(g, x - 1, y - 44, 3, 2, '#2f2f2f');
  }
  function mine(g, x, y) {
    const a = Math.round(x - 26), b = Math.round(y - 52);
    R(g, a + 6, b + 10, 40, 42, '#120c07'); R(g, a + 10, b + 6, 32, 4, '#120c07');
    R(g, a + 12, b + 14, 28, 38, '#1f150d'); R(g, a + 16, b + 20, 20, 32, '#2a1d12');
    R(g, a + 2, b + 8, 7, 44, '#7a4b25'); R(g, a + 43, b + 8, 7, 44, '#7a4b25'); R(g, a + 2, b + 8, 1, 44, '#3b2412'); R(g, a + 50, b + 8, 1, 44, '#3b2412');
    R(g, a, b + 2, 52, 8, '#8a5a32'); R(g, a, b + 9, 52, 1, '#3b2412'); R(g, a, b + 1, 52, 1, '#3b2412');
    R(g, a + 45, b + 14, 5, 7, '#ffd34d'); R(g, a + 46, b + 13, 3, 1, '#3b2412'); g.fillStyle = 'rgba(255,211,77,.25)'; g.fillRect(a + 40, b + 10, 15, 15);
  }
  function rails(g, x, y0, y1) {
    for (let y = y0; y < y1; y += 7) R(g, x - 11, y, 22, 3, '#6b4423');
    R(g, x - 8, y0, 2, y1 - y0, '#7d7f86'); R(g, x + 6, y0, 2, y1 - y0, '#7d7f86');
  }
  function cart(g, x, y) {
    const a = Math.round(x - 14), b = Math.round(y - 22);
    R(g, a + 2, b + 18, 24, 4, 'rgba(0,0,0,.25)');
    R(g, a + 3, b + 17, 6, 5, '#2b2b2b'); R(g, a + 19, b + 17, 6, 5, '#2b2b2b');
    R(g, a + 1, b + 6, 26, 13, '#3d3f45'); R(g, a + 2, b + 7, 24, 11, '#7d7f86'); R(g, a + 2, b + 7, 24, 2, '#a3a6ad');
    R(g, a + 5, b + 3, 6, 5, '#e7c14a'); R(g, a + 11, b + 2, 7, 6, '#8d8f96'); R(g, a + 17, b + 4, 6, 4, '#c97b4a'); R(g, a + 7, b + 2, 2, 2, '#fff2a8');
  }
  function pier(g, x, y0, y1) {
    const w = 30, a = Math.round(x - w / 2);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(a + 4, y0 + 6, w, y1 - y0);
    for (let y = y0; y < y1; y += 6) { R(g, a, y, w, 5, (y / 6) % 2 ? '#a8774a' : '#9a6a40'); R(g, a, y + 5, w, 1, '#5d3a1a'); }
    R(g, a - 1, y0, 1, y1 - y0, '#3b2412'); R(g, a + w, y0, 1, y1 - y0, '#3b2412');
    for (let y = y0 + 10; y < y1 + 4; y += 36) { R(g, a - 4, y, 5, 10, '#6b4423'); R(g, a + w - 1, y, 5, 10, '#6b4423'); }
  }
  function bed(g, x0, y0, w, h) {
    R(g, x0 - 2, y0 - 2, w + 4, h + 4, '#8a5a32'); R(g, x0, y0, w, h, '#6b4a2b');
    for (let i = 0; i < w * h / 20; i++) R(g, x0 + rnd() * w, y0 + rnd() * h, 2, 2, '#5a3d22');
  }
  function fenceRow(g, x0, x1, y) {
    for (let x = x0; x <= x1; x += 10) { R(g, x, y - 12, 3, 12, '#f1e6cc'); R(g, x, y - 13, 3, 1, '#8a7a5a'); }
    R(g, x0, y - 9, x1 - x0 + 3, 2, '#e3d6b8'); R(g, x0, y - 5, x1 - x0 + 3, 2, '#e3d6b8');
  }


  // Holzschild mit Namen (über Dächern bzw. an zwei Pfosten über dem Stolleneingang)
  function plaque(g, s, cx, cy, posts = false) {
    g.font = '800 14px Nunito, system-ui, sans-serif'; g.textAlign = 'center';
    const w = Math.round(g.measureText(s).width) + 20, h = 22, x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
    if (posts) { R(g, x + 6, y + h - 2, 4, 26, '#5d3a1a'); R(g, x + w - 10, y + h - 2, 4, 26, '#5d3a1a'); }
    else { R(g, x + 8, y - 6, 2, 7, '#3b2412'); R(g, x + w - 10, y - 6, 2, 7, '#3b2412'); }
    R(g, x + 2, y + 3, w, h, 'rgba(0,0,0,.25)');
    R(g, x, y, w, h, '#3b2412'); R(g, x + 2, y + 2, w - 4, h - 4, '#8a5a32'); R(g, x + 2, y + 2, w - 4, 2, '#a8774a');
    for (let i = x + 6; i < x + w - 6; i += 9) R(g, i, y + 9, 5, 1, '#7a4b25');
    R(g, x + 4, y + 4, 2, 2, '#d9b98a'); R(g, x + w - 6, y + 4, 2, 2, '#d9b98a');
    g.fillStyle = '#fff3d6'; g.fillText(s, cx, y + 16);
  }
  // Wegweiser mit Pfeilbrett
  function signpost(g, x, y, s) {
    g.font = '800 13px Nunito, system-ui, sans-serif'; g.textAlign = 'center';
    const w = Math.round(g.measureText(s).width) + 26, bx = Math.round(x - w / 2), by = Math.round(y - 52);
    R(g, x - 2, by, 5, 52, '#5d3a1a'); R(g, x - 1, by, 1, 52, '#7a4b25');
    g.fillStyle = '#3b2412'; g.beginPath(); g.moveTo(bx - 1, by - 1); g.lineTo(bx + w - 9, by - 1); g.lineTo(bx + w + 1, by + 10); g.lineTo(bx + w - 9, by + 21); g.lineTo(bx - 1, by + 21); g.closePath(); g.fill();
    g.fillStyle = '#c99a5e'; g.beginPath(); g.moveTo(bx + 1, by + 1); g.lineTo(bx + w - 10, by + 1); g.lineTo(bx + w - 2, by + 10); g.lineTo(bx + w - 10, by + 19); g.lineTo(bx + 1, by + 19); g.closePath(); g.fill();
    g.fillStyle = '#3b2412'; g.fillText(s, bx + w / 2 - 4, by + 15);
  }
  // Stellplatz-Zaun aus dem Spiel (gleicher Holzzaun wie um die Gehege): oben und an beiden Seiten, unten offen
  function parkFence(g, part) {
    const [sx, sy] = SPR.fence9[0], nx = 6, ny = 7, x = Math.round(FARM.park.x * T), y = Math.round(FARM.park.y * T) - 6;
    for (let j = 0; j < ny; j++) for (let k = 0; k < nx; k++) {
      const c = k === 0 ? 0 : k === nx - 1 ? 2 : 1, r = j === 0 ? 0 : 1;
      if (c === 1 && r === 1) continue;
      if ((part === 'back') !== (j === 0)) continue;
      g.drawImage(ATL, sx + c * 16, sy + r * 16, 16, 16, x + k * 16, y + j * 16, 16, 16);
    }
  }
  // Blumenstreifen links am Stellplatz


  // Schloss-Schild „ab Level X“ (Startansicht: noch gesperrte Orte)
  // ---------- Objekte (nach Fußpunkt sortiert) ----------

  // ---------- Beschriftung, Deko-Zonen, Nummern ----------


  // ---------- Ausblick-Bilder: Haus-Ausbau und Autos (Version 3, eigene Pixel-Zeichnungen) ----------
  // Kleine Pixel-Raster: Formen füllen, danach automatisch dunkel umranden (wie die CraftPix-Grafiken)
  const OUT = '#2a1d14';
  const grid = (w, h) => ({ w, h, px: new Array(w * h).fill(null) });
  const gset = (G, x, y, c) => { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < G.w && y < G.h) G.px[y * G.w + x] = c; };
  const gget = (G, x, y) => (x >= 0 && y >= 0 && x < G.w && y < G.h ? G.px[y * G.w + x] : null);
  const grect = (G, x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) gset(G, x + i, y + j, c); };
  function gpoly(G, pts, c) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
      const px = x + 0.5, py = y + 0.5; let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) gset(G, x, y, c);
    }
  }
  const gcirc = (G, cx, cy, r, c) => { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) gset(G, x, y, c); };
  const gswap = (G, x, y, w, h, from, to) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (gget(G, x + i, y + j) === from) gset(G, x + i, y + j, to); };
  function goutline(G) {
    const add = [];
    for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) if (!gget(G, x, y) && (gget(G, x - 1, y) || gget(G, x + 1, y) || gget(G, x, y - 1) || gget(G, x, y + 1))) add.push([x, y]);
    for (const [x, y] of add) gset(G, x, y, OUT);
  }
  function gdraw(g, G, x, y, s = 1) { for (let j = 0; j < G.h; j++) for (let i = 0; i < G.w; i++) { const c = G.px[j * G.w + i]; if (c) { g.fillStyle = c; g.fillRect(Math.round(x + i * s), Math.round(y + j * s), Math.ceil(s), Math.ceil(s)); } } }
  function wheel(G, cx, cy, r, o = {}) {
    gcirc(G, cx, cy, r + 1.3, '#1b1b1b');
    gcirc(G, cx, cy, r, '#262626');
    if (o.tread) for (let a = 0; a < 16; a++) gset(G, cx + Math.cos(a / 16 * 6.283) * (r - 0.6), cy + Math.sin(a / 16 * 6.283) * (r - 0.6), '#4a4a4a');
    if (o.white) { gcirc(G, cx, cy, r - 1.3, '#f1efe8'); gcirc(G, cx, cy, r - 2.4, '#262626'); }
    gcirc(G, cx, cy, Math.max(1.6, r * 0.45), o.chrome ? '#e8e8e8' : '#a9a9a9');
    gcirc(G, cx, cy, 1, '#6b6b6b'); gset(G, cx - 1, cy - 1, '#ffffff');
  }
  const GLASS = '#9cc6ec', GLASS2 = '#d6ecff';
  function glassShine(G, x, y) { gset(G, x, y, GLASS2); gset(G, x + 1, y, GLASS2); gset(G, x, y + 1, GLASS2); }

  // --- Fahrzeuge (Seitenansicht, fährt nach rechts) ---
  function vehicle(kind) {
    const G = grid(68, 34), b = 28; // b = Unterkante der Räder
    if (kind === 'quad') {
      const c = '#c63d2f', d = '#8e2a20', l = '#e86a55';
      grect(G, 14, b - 9, 26, 3, '#3a3a3a');
      grect(G, 4, b - 17, 15, 2, '#4a4a4a'); grect(G, 6, b - 15, 2, 4, '#4a4a4a'); grect(G, 15, b - 15, 2, 4, '#4a4a4a');
      grect(G, 6, b - 24, 11, 7, '#b5834f'); grect(G, 6, b - 21, 11, 1, '#7a5230'); grect(G, 6, b - 24, 11, 1, '#d9a56b');
      gpoly(G, [[3, b - 9], [6, b - 15], [18, b - 15], [21, b - 9]], c);
      gpoly(G, [[33, b - 9], [36, b - 15], [46, b - 15], [50, b - 9]], c);
      gpoly(G, [[17, b - 10], [19, b - 16], [33, b - 16], [37, b - 12], [33, b - 9], [18, b - 9]], c);
      grect(G, 19, b - 16, 14, 1, l); grect(G, 6, b - 15, 12, 1, l); grect(G, 36, b - 15, 10, 1, l);
      grect(G, 15, b - 19, 14, 3, '#2d2d2d'); grect(G, 16, b - 19, 12, 1, '#555555');
      grect(G, 34, b - 23, 2, 7, '#2d2d2d'); grect(G, 31, b - 24, 8, 2, '#2d2d2d'); grect(G, 30, b - 24, 2, 2, '#555555');
      grect(G, 47, b - 14, 2, 3, '#fff3b0'); grect(G, 3, b - 13, 2, 2, '#d9443a');
      gswap(G, 0, b - 11, 68, 2, c, d);
      wheel(G, 12, b - 6.5, 5.6, { tread: true }); wheel(G, 41, b - 6.5, 5.6, { tread: true });
    } else if (kind === 'kombi') {
      const c = '#4a7fc1', d = '#355f94', l = '#79a6dd';
      gcirc(G, 14, b - 5, 7, '#1b1b1b'); gcirc(G, 49, b - 5, 7, '#1b1b1b');
      gpoly(G, [[2, b - 3], [2, b - 12], [5, b - 14], [50, b - 14], [58, b - 12], [60, b - 9], [60, b - 3]], c);
      gpoly(G, [[4, b - 14], [6, b - 23], [37, b - 23], [46, b - 14]], c);
      gpoly(G, [[7, b - 15], [8, b - 21], [20, b - 21], [20, b - 15]], GLASS); gpoly(G, [[22, b - 15], [22, b - 21], [35, b - 21], [42, b - 15]], GLASS);
      glassShine(G, 10, b - 20); glassShine(G, 25, b - 20);
      grect(G, 6, b - 24, 30, 1, '#5a5a5a'); grect(G, 9, b - 25, 2, 1, '#5a5a5a'); grect(G, 31, b - 25, 2, 1, '#5a5a5a');
      grect(G, 5, b - 14, 46, 1, l); grect(G, 7, b - 23, 29, 1, l);
      grect(G, 21, b - 14, 1, 10, d); grect(G, 16, b - 11, 3, 1, d); grect(G, 32, b - 11, 3, 1, d);
      gswap(G, 0, b - 6, 68, 3, c, d);
      grect(G, 58, b - 11, 2, 2, '#fff3b0'); grect(G, 2, b - 11, 2, 3, '#d9443a');
      grect(G, 1, b - 5, 4, 2, '#a5a5a5'); grect(G, 57, b - 5, 4, 2, '#a5a5a5');
      wheel(G, 14, b - 5, 5); wheel(G, 49, b - 5, 5);
    } else if (kind === 'suv') {
      const c = '#5d7d3d', d = '#435c2b', l = '#83a35d', s = '#d8cfb4';
      gcirc(G, 15, b - 6, 8, '#1b1b1b'); gcirc(G, 46, b - 6, 8, '#1b1b1b');
      gpoly(G, [[4, b - 5], [4, b - 16], [50, b - 16], [55, b - 14], [56, b - 11], [56, b - 5]], c);
      gpoly(G, [[5, b - 16], [6, b - 26], [38, b - 26], [44, b - 16]], c);
      gpoly(G, [[8, b - 17], [8, b - 24], [21, b - 24], [21, b - 17]], GLASS); gpoly(G, [[23, b - 17], [23, b - 24], [36, b - 24], [41, b - 17]], GLASS);
      glassShine(G, 10, b - 23); glassShine(G, 26, b - 23);
      grect(G, 6, b - 28, 32, 1, '#3a3a3a'); for (const x of [8, 18, 28, 36]) grect(G, x, b - 27, 1, 1, '#3a3a3a');
      grect(G, 9, b - 31, 10, 3, '#b5834f'); grect(G, 21, b - 30, 8, 2, '#4f6a8a');
      grect(G, 5, b - 16, 46, 1, l); grect(G, 7, b - 26, 30, 1, l);
      grect(G, 4, b - 10, 52, 3, s); grect(G, 22, b - 16, 1, 9, d); grect(G, 17, b - 13, 3, 1, d); grect(G, 34, b - 13, 3, 1, d);
      gswap(G, 0, b - 7, 68, 2, c, d);
      grect(G, 56, b - 14, 2, 9, '#4a4a4a'); grect(G, 54, b - 13, 2, 2, '#fff3b0'); grect(G, 4, b - 14, 2, 3, '#d9443a');
      wheel(G, 3.5, b - 15, 4.3); wheel(G, 15, b - 6, 6, { tread: true }); wheel(G, 46, b - 6, 6, { tread: true });
    } else if (kind === 'pickup') {
      const c = '#b8352b', d = '#86251d', l = '#d9574a', cr = '#f1e2bf';
      gcirc(G, 13, b - 5, 7.2, '#1b1b1b'); gcirc(G, 52, b - 5, 7.2, '#1b1b1b');
      grect(G, 4, b - 22, 11, 8, '#e2c25c'); for (let y = b - 21; y < b - 14; y += 3) grect(G, 4, y, 11, 1, '#c29f3a'); grect(G, 4, b - 22, 11, 1, '#f3dc8a');
      grect(G, 16, b - 21, 5, 7, '#c9ccd2'); grect(G, 17, b - 22, 3, 1, '#8d9097'); grect(G, 16, b - 18, 5, 1, '#9fa3ab');
      grect(G, 22, b - 18, 5, 4, '#b5834f'); grect(G, 22, b - 18, 5, 1, '#d9a56b');
      gpoly(G, [[2, b - 3], [2, b - 15], [28, b - 15], [28, b - 13], [44, b - 13], [58, b - 13], [62, b - 11], [63, b - 8], [63, b - 3]], c);
      gpoly(G, [[28, b - 13], [29, b - 24], [40, b - 24], [46, b - 13]], c);
      gpoly(G, [[31, b - 14], [31, b - 22], [39, b - 22], [43, b - 14]], GLASS); glassShine(G, 33, b - 21);
      grect(G, 2, b - 15, 26, 2, cr); grect(G, 29, b - 24, 11, 1, l); grect(G, 44, b - 13, 15, 1, l);
      grect(G, 2, b - 9, 61, 1, cr);
      gswap(G, 0, b - 6, 68, 3, c, d);
      grect(G, 61, b - 10, 2, 2, '#fff3b0'); grect(G, 62, b - 8, 2, 5, '#d8d8d8'); grect(G, 1, b - 6, 3, 3, '#d8d8d8'); grect(G, 2, b - 13, 2, 3, '#d9443a');
      grect(G, 36, b - 11, 3, 1, d);
      wheel(G, 13, b - 5, 5.2, { chrome: true }); wheel(G, 52, b - 5, 5.2, { chrome: true });
    } else if (kind === 'oldtimer') {
      const c = '#2f8a87', d = '#206563', l = '#56b3ae', cr = '#efe3c4', crd = '#d5c49c';
      gpoly(G, [[2, b - 4], [2, b - 15], [25, b - 15], [25, b - 4]], c);
      gcirc(G, 12, b - 4, 8.3, c); gcirc(G, 52, b - 4, 8.3, c);
      gpoly(G, [[25, b - 4], [25, b - 15], [27, b - 22], [30, b - 25], [38, b - 25], [41, b - 22], [42, b - 15], [42, b - 4]], cr);
      gpoly(G, [[42, b - 4], [42, b - 14], [56, b - 13], [61, b - 10], [62, b - 7], [62, b - 4]], c);
      grect(G, 0, b - 6, 68, 6, null);
      grect(G, 2, b - 15, 23, 1, l); grect(G, 42, b - 14, 14, 1, l); grect(G, 28, b - 25, 10, 1, '#fffaf0');
      gpoly(G, [[28, b - 15], [29, b - 21], [31, b - 23], [37, b - 23], [39, b - 21], [40, b - 15]], GLASS); glassShine(G, 31, b - 22);
      gswap(G, 25, b - 9, 17, 5, cr, crd);
      grect(G, 20, b - 6, 26, 2, '#3a3a3a'); grect(G, 20, b - 6, 26, 1, '#5a5a5a');
      grect(G, 3, b - 11, 21, 1, d); grect(G, 43, b - 9, 18, 1, d);
      gcirc(G, 58, b - 11, 2, '#e6e6e6'); gcirc(G, 58, b - 11, 1.2, '#fff3b0');
      grect(G, 62, b - 8, 2, 4, '#e6e6e6'); grect(G, 0, b - 8, 3, 4, '#e6e6e6'); grect(G, 2, b - 13, 2, 2, '#d9443a');
      wheel(G, 12, b - 5, 5.2, { white: true, chrome: true }); wheel(G, 52, b - 5, 5.2, { white: true, chrome: true });
    }
    goutline(G);
    return G;
  }

  // --- Häuser (Vorderansicht) ---
  const HOUSE_COL = {
    weiss: ['#efe8da', '#d9d0bd'], gelb: ['#f0d78c', '#d8bb69'], salbei: ['#b9cfa3', '#9cb586'], rosa: ['#f0c2bd', '#d9a29c'], blau: ['#b7cbe6', '#97adcc'], holz: ['#b9834e', '#94643a'],
  };
  const ROOF_COL = { rot: ['#c4503a', '#8f3423', '#e0705a'], blau: ['#5d7aa8', '#3f5680', '#7e99c4'], gruen: ['#5f9a4a', '#3f6e30', '#82ba6b'], braun: ['#8a5a36', '#5f3c22', '#a9764d'], schiefer: ['#5b5f6b', '#3e414a', '#7b808d'] };
  function shingles(G, x0, y0, x1, y1, inside, rc) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (!inside(x, y)) continue;
      const row = Math.floor((y - y0) / 4), off = (row % 2) * 3;
      let col = rc[0];
      if ((y - y0) % 4 === 3) col = rc[1]; else if ((x + off) % 6 === 0) col = rc[1]; else if ((y - y0) % 4 === 0) col = rc[2];
      gset(G, x, y, col);
    }
  }
  function windowAt(G, x, y, type, trim, wallDark) {
    if (type === 'gross') {
      grect(G, x - 1, y - 1, 14, 18, trim); grect(G, x, y, 12, 16, GLASS); grect(G, x + 5, y, 2, 16, trim); grect(G, x, y + 7, 12, 1, trim); glassShine(G, x + 1, y + 1); glassShine(G, x + 8, y + 9);
      grect(G, x - 2, y + 16, 16, 2, trim);
    } else {
      grect(G, x - 1, y - 1, 12, 13, trim); grect(G, x, y, 10, 11, GLASS); grect(G, x + 4, y, 2, 11, trim); grect(G, x, y + 5, 10, 1, trim); glassShine(G, x + 1, y + 1);
      grect(G, x - 2, y + 11, 14, 2, trim);
      if (type === 'laden') { grect(G, x - 6, y - 1, 5, 13, '#4f7d4a'); grect(G, x + 11, y - 1, 5, 13, '#4f7d4a'); for (let j = 1; j < 12; j += 2) { grect(G, x - 5, y + j, 3, 1, '#3c6238'); grect(G, x + 12, y + j, 3, 1, '#3c6238'); } }
      if (type === 'blumen') { grect(G, x - 2, y + 13, 14, 3, '#8a5a32'); for (let i = 0; i < 6; i++) { gset(G, x - 1 + i * 2, y + 12, i % 2 ? '#e05a48' : '#ffd34d'); gset(G, x + i * 2, y + 11, '#5f9a4a'); } }
    }
  }
  function doorAt(G, x, y, type) { // (x, y) = unten Mitte
    if (type === 'doppel') {
      grect(G, x - 10, y - 21, 20, 21, '#e8dcc0'); grect(G, x - 9, y - 20, 18, 20, '#7a4b25');
      grect(G, x - 8, y - 18, 7, 7, GLASS); grect(G, x + 1, y - 18, 7, 7, GLASS); grect(G, x, y - 20, 1, 20, '#4f2f16');
      gset(G, x - 2, y - 9, '#ffd34d'); gset(G, x + 2, y - 9, '#ffd34d');
    } else if (type === 'bogen') {
      grect(G, x - 7, y - 16, 14, 16, '#8f2f24'); grect(G, x - 6, y - 18, 12, 2, '#8f2f24'); grect(G, x - 4, y - 19, 8, 1, '#8f2f24');
      for (let i = -5; i <= 5; i += 3) grect(G, x + i, y - 17, 1, 17, '#6f2119'); gset(G, x + 3, y - 8, '#ffd34d');
    } else if (type === 'gruen') {
      grect(G, x - 7, y - 19, 14, 19, '#e8dcc0'); grect(G, x - 6, y - 18, 12, 18, '#4f8a5a'); grect(G, x - 4, y - 16, 8, 5, GLASS); grect(G, x - 4, y - 9, 8, 1, '#3c6b45'); gset(G, x + 3, y - 7, '#ffd34d');
    } else {
      grect(G, x - 7, y - 19, 14, 19, '#5d3a1a'); grect(G, x - 6, y - 18, 12, 18, '#a06a3c');
      for (let i = -4; i <= 4; i += 3) grect(G, x + i, y - 18, 1, 18, '#7d5230'); grect(G, x - 6, y - 12, 12, 1, '#7d5230'); gset(G, x + 4, y - 9, '#ffd34d');
    }
    grect(G, x - 9, y, 18, 2, '#9a958c');
  }
  function house(o) {
    const fh = 24, floors = o.floors, W0 = o.w, ov = 5;
    const [wc, wd] = HOUSE_COL[o.wall], rc = ROOF_COL[o.roof];
    const roofH = o.hip ? 30 : Math.round(W0 * 0.46);
    const wallH = floors * fh + 5;
    const Gw = W0 + ov * 2 + 4, top = o.chimney ? 8 : 2;
    const G = grid(Gw, top + roofH + wallH + 4);
    const x0 = ov + 2, x1 = x0 + W0, cx = Math.floor(Gw / 2), wy = top + roofH - 4, gy = wy + wallH + 4;
    // Wand mit Putz, Ecken, Stockwerksbalken, Sockel
    grect(G, x0, wy, W0, wallH + 4, wc);
    seed = W0 * 7 + floors; for (let i = 0; i < W0 * wallH / 14; i++) gset(G, x0 + rnd() * W0, wy + rnd() * wallH, wd);
    grect(G, x0, wy, 2, wallH, o.trim); grect(G, x1 - 2, wy, 2, wallH, o.trim);
    for (let f = 1; f < floors; f++) grect(G, x0, gy - 5 - f * fh, W0, 2, o.trim);
    grect(G, x0, gy - 5, W0, 5, '#8e8a84'); for (let x = x0; x < x1; x += 6) gset(G, x, gy - 3, '#6f6b66'); grect(G, x0, gy - 5, W0, 1, '#a8a49d');
    // Fenster und Tür
    const nWin = Math.max(2, Math.floor(W0 / 24));
    for (let f = 0; f < floors; f++) {
      const fy = gy - 5 - (f + 1) * fh + 5;
      for (let i = 0; i < nWin; i++) {
        const wx = Math.round(x0 + (W0 / nWin) * (i + 0.5)) - 5;
        if (f === 0 && Math.abs(wx + 5 - cx) < 12) continue;
        windowAt(G, wx, fy, o.win, o.winTrim || '#f3ecd9', wd);
      }
    }
    doorAt(G, cx, gy - 5, o.door);
    // Veranda (amerikanischer Vorbau): Dach über dem Erdgeschoss, Pfosten, Geländer, Holzboden, Stufen
    if (o.porch) {
      const py = gy - 5 - fh - 1;
      shingles(G, x0 - 3, py - 3, x1 + 3, py + 3, () => true, rc); grect(G, x0 - 3, py + 3, W0 + 6, 1, rc[1]);
      for (let x = x0; x <= x1 - 2; x += Math.floor((W0 - 2) / 6)) grect(G, x, py + 4, 2, fh - 1, '#f3ecd9');
      for (let x = x0; x < x1; x++) { if (Math.abs(x - cx) < 9) continue; gset(G, x, gy - 13, '#f3ecd9'); gset(G, x, gy - 8, '#f3ecd9'); if (x % 3 === 0) for (let y = gy - 12; y < gy - 8; y++) gset(G, x, y, '#efe6d0'); }
      grect(G, x0 - 3, gy - 5, W0 + 6, 4, '#a8774a'); for (let x = x0 - 3; x < x1 + 3; x += 5) gset(G, x, gy - 3, '#7a5230');
      grect(G, cx - 9, gy - 1, 18, 2, '#8a5a32'); grect(G, cx - 10, gy + 1, 20, 2, '#7a5230');
    }
    // Dach
    if (o.hip) {
      const tw = Math.round(W0 * 0.35);
      shingles(G, 0, top, Gw, top + roofH, (x, y) => { const t = (y - top) / roofH; const half = tw / 2 + t * (Gw / 2 - tw / 2); return Math.abs(x + 0.5 - cx) <= half; }, rc);
      // Zwerchgiebel vorne in der Mitte mit rundem Fenster
      const gh = roofH + 4, gw = 34;
      shingles(G, cx - gw / 2 - 3, top - 2, cx + gw / 2 + 3, top + gh, (x, y) => Math.abs(x + 0.5 - cx) <= (y - top + 2) / gh * (gw / 2 + 3), rc);
      for (let y = top + 8; y < top + gh; y++) { const half = (y - top - 6) / (gh - 6) * (gw / 2 - 3); grect(G, Math.round(cx - half), y, Math.round(half * 2), 1, wc); }
      gcirc(G, cx, top + gh - 9, 4, o.trim); gcirc(G, cx, top + gh - 9, 3, GLASS); gset(G, cx - 1, top + gh - 10, GLASS2);
      if (o.chimney) { grect(G, x1 - 20, 0, 8, top + 10, '#9a5a44'); grect(G, x1 - 21, 0, 10, 2, '#6f3f30'); for (let y = 3; y < top + 10; y += 3) grect(G, x1 - 20, y, 8, 1, '#7f4a38'); }
    } else {
      shingles(G, 0, top, Gw, top + roofH, (x, y) => Math.abs(x + 0.5 - cx) <= (y - top + 1) / roofH * (Gw / 2), rc);
      const t = 8;
      for (let y = top + t + 4; y < top + roofH; y++) { const half = (y - top - t - 2) / roofH * (Gw / 2 - t - 2); if (half > 0) grect(G, Math.round(cx - half), y, Math.round(half * 2), 1, wc); }
      if (roofH > 26) { const ay = top + Math.round(roofH * 0.55); windowAt(G, cx - 5, ay, 'klein', o.winTrim || '#f3ecd9', wd); }
      if (o.chimney) { grect(G, x1 - 16, 0, 7, top + 14, '#9a5a44'); grect(G, x1 - 17, 0, 9, 2, '#6f3f30'); }
    }
    goutline(G);
    return G;
  }




  // Antippen in der Startansicht: was liegt an dieser Weltposition?
  // kleine Bilder für den Freischalt-Plan (Autos, Häuser, Türen, Fenster, Farben)


  // ---------- statische Landschaft ----------
  const onRoadPx = (x, y) => { const tx = Math.floor(x / T), ty = Math.floor(y / T); return (ty === FARM.road.y && tx >= FARM.road.x0) || (tx === FARM.stegweg.x && ty >= FARM.stegweg.y0 && ty <= FARM.stegweg.y1) || (tx === FARM.minenweg.x && ty >= FARM.minenweg.y0 && ty <= FARM.minenweg.y1); };
  const inRectT = (r, x, y, m = 8) => x > r.x * T - m && x < (r.x + r.w) * T + m && y > r.y * T - m && y < (r.y + r.h) * T + m;
  const inAnyParcel = (x, y) => PARCELS.some((p) => inRectT(p, x, y, 6));
  const MINE_X = 38.5 * T;
  function buildScene(g) {
    seed = 11;
    R(g, 0, 0, W * T, H * T, '#6ea24b');
    for (let y = 0; y < H * T; y += 4) for (let x = 0; x < W * T; x += 4) {
      const r = rnd(); if (r < 0.05) R(g, x, y, 4, 4, '#649847'); else if (r < 0.08) R(g, x, y, 4, 4, '#79ad55');
    }
    const f = FARM;
    dirt(g, f.road.x0 * T, f.road.y * T, (W - f.road.x0) * T, T);
    dirt(g, f.stegweg.x * T, f.stegweg.y0 * T, T, (f.stegweg.y1 - f.stegweg.y0 + 1) * T);
    dirt(g, f.minenweg.x * T, f.minenweg.y0 * T, T, (f.minenweg.y1 - f.minenweg.y0 + 1) * T);
    paved(g, f.yard); paved(g, f.link); paved(g, f.park);
    // Gasse in der Stadt (Pflaster), endet auf der Dorfstraße
    if (TOWN_ON) paved(g, { x: TOWN_X0 + 4, y: 1 + TOWN_Y0, w: 2, h: 13 });
    lake(g);
    seed = 23;
    for (let i = 0; i < 420; i++) {
      const x = rnd() * W * T, y = rnd() * H * T;
      if (lakeV(x, y) > -0.08 || inMount(x, y + 8) || onRoadPx(x, y) || inAnyParcel(x, y) || inRectT(f.yard, x, y) || inRectT(f.park, x, y) || inRectT(f.link, x, y)) continue;
      if (x > TOWN_X0 * T && y < 14 * T) continue;
      spr(g, 'tuft', Math.floor(rnd() * 6), x, y);
    }
    // Objekte nach Fußpunkt sortiert
    const O = []; const add = (y, fn) => O.push({ y, fn });
    seed = 5;
    const tree = (x, y) => {
      const r = rnd(), fl = rnd() < 0.5;
      if (r < 0.3) { const k = ['tanne1', 'tanne2', 'tanne3'][Math.floor(rnd() * 3)]; add(y, (g2) => ps(g2, k, x, y, fl)); }
      else if (r < 0.55) { const i = Math.floor(rnd() * 4); add(y, (g2) => spr(g2, 'wald', i, x, y, fl)); }
      else if (r < 0.8) { const k = ['laub1', 'laub2', 'laub3', 'laub5'][Math.floor(rnd() * 4)]; add(y, (g2) => ps(g2, k, x, y, fl)); }
      else { const k = ['tanne4', 'busch1', 'busch2', 'busch5'][Math.floor(rnd() * 4)]; add(y, (g2) => ps(g2, k, x, y, fl)); }
    };
    for (let row = 0; row < 3; row++) for (let x = -10 + row * 14; x < MX - 0.6 * T; x += 40 + rnd() * 18) tree(x, (0.9 + row * 1.05) * T + rnd() * 16);
    for (let x = 20; x < MX - T; x += 70 + rnd() * 80) { const y = 3.7 * T + rnd() * 10, k = ['busch3', 'busch4', 'farn', 'busch6'][Math.floor(rnd() * 4)]; add(y, (g2) => ps(g2, k, x, y)); }
    for (let col = 0; col < 2; col++) for (let y = 4 * T; y < 17.5 * T; y += 36 + rnd() * 16) tree((0.5 + col * 1.0) * T + rnd() * 10, y);
    for (let row = 0; row < 3; row++) for (let x = 17.8 * T + row * 14; x < W * T + 30; x += 40 + rnd() * 18) tree(x, (24.2 + row * 1.0) * T + rnd() * 14);
    // Stadtrand unter der Straße: ein paar Bäume und Büsche
    if (TOWN_ON) for (let i = 0; i < 16; i++) { const x = (TOWN_X0 + 0.5 + rnd() * (TOWN_W - 1)) * T, y = (15.5 + rnd() * 7) * T; if (rnd() < 0.5) tree(x, y); else { const k = ['busch3', 'busch5', 'farn'][Math.floor(rnd() * 3)]; add(y, (g2) => ps(g2, k, x, y)); } }
    // Berg
    add(-5000, (g2) => mountain(g2));
    const onPlateau = (k, x, y) => terraceAt(x, y) === k && y < TER[k].base(x) - TER[k].ch - 4 && terraceAt(x - 20, y) === k && terraceAt(x + 20, y) === k;
    for (let i = 0; i < 140; i++) {
      const x = MX + rnd() * (MAP_W * T - MX), y = rnd() * 4.4 * T, k = terraceAt(x, y);
      if (k < 0 || !onPlateau(k, x, y) || rnd() < 0.3) continue;
      if (Math.abs(x - (MX + 7.4 * T)) < 34 || Math.abs(x - MINE_X) < 40) continue;
      const pick = rnd(), fl = rnd() < 0.5;
      const k2 = pick < 0.45 ? ['tanne1', 'tanne2', 'tanne3', 'tanne4'][Math.floor(rnd() * 4)] : pick < 0.75 ? ['fels3', 'fels5', 'fels6', 'kiesel1'][Math.floor(rnd() * 4)] : ['busch3', 'farn', 'kiesel2'][Math.floor(rnd() * 3)];
      add(y, (g2) => ps(g2, k2, x, y, fl));
    }
    for (let x = MX + 20; x < MAP_W * T; x += 70 + rnd() * 60) { const y = TER[0].base(x) + 8, k = rnd() < 0.5 ? 'kiesel1' : 'kiesel2'; if (Math.abs(x - MINE_X) > 50 && Math.abs(x - (MX + 7.4 * T)) > 30) add(y, (g2) => ps(g2, k, x, y)); }
    const my = TER[0].base(MINE_X);
    add(my, (g2) => mine(g2, MINE_X, my));
    add(my + 1, (g2) => rails(g2, MINE_X, my, 6.6 * T));
    add(6.2 * T, (g2) => cart(g2, MINE_X, 6.2 * T));
    add(my - 30, (g2) => plaque(g2, 'Bergwerk', MINE_X - 6, my - 68, true));
    // Vorgarten-Beete mit Staketenzaun
    add(6.9 * T, (g2) => { bed(g2, 4.15 * T, 6.35 * T, 1.75 * T, 0.6 * T); fenceRow(g2, 4.1 * T, 5.95 * T, 7.15 * T); });
    add(6.9 * T, (g2) => { bed(g2, 7.15 * T, 6.35 * T, 1.75 * T, 0.6 * T); fenceRow(g2, 7.1 * T, 8.95 * T, 7.15 * T); });
    // Stellplatz-Zaun (hinten + Seiten)
    add(11.2 * T, (g2) => parkFence(g2, 'back'));
    add(13.45 * T, (g2) => parkFence(g2, 'sides'));
    // See: Schilf, Steg, Boot, Wegweiser
    for (const [x, y] of [[0.8, 18.4], [11.6, 19.7], [14.1, 21.4], [2.4, 17.7], [16.4, 22.6]]) add(y * T, (g2) => ps(g2, 'schilf', x * T, y * T, x > 8));
    add(17.6 * T, (g2) => pier(g2, 7.5 * T, 17.5 * T, 21.0 * T));
    add(21.1 * T, (g2) => ps(g2, 'boot', 7.5 * T, 20.85 * T + 71));
    add(17.2 * T, (g2) => signpost(g2, 8.7 * T, 17.2 * T, 'Angelsteg'));
    add(13.0 * T, (g2) => signpost(g2, 36.4 * T, 13.0 * T, 'Sonnenfeld'));
    for (const o of O.sort((a, b) => a.y - b.y)) o.fn(g);
  }

  // ---------- Häuser und Autos (zwischengespeichert) ----------
  const cache = {};
  function canvasOf(G) { const c = document.createElement('canvas'); c.width = G.w; c.height = G.h; gdraw(c.getContext('2d'), G, 0, 0, 1); return c; }
  const PRESETS = {
    haeuschen: { w: 68, floors: 1 }, familienhaus: { w: 78, floors: 2, chimney: true },
    landhaus: { w: 126, floors: 2, hip: true, porch: true, chimney: true },
  };
  function houseCanvas(h) {
    const key = [h.type, h.wall, h.roof, h.door, h.win].join('|');
    if (!cache[key]) cache[key] = canvasOf(house({ trim: '#6b4423', winTrim: '#7a5230', ...PRESETS[h.type], wall: h.wall, roof: h.roof, door: h.door, win: h.win }));
    return cache[key];
  }
  function vehicleCanvas(kind) { const key = 'car|' + kind; if (!cache[key]) cache[key] = canvasOf(vehicle(kind)); return cache[key]; }
  function iconCanvas(type, key) { // kleine Bilder für Menüs: Haus, Farbe, Tür, Fenster, Auto
    const ck = 'ic|' + type + '|' + key; if (cache[ck]) return cache[ck];
    let G2;
    const base = { trim: '#6b4423', winTrim: '#7a5230', win: 'klein', door: 'holz', wall: 'weiss', roof: 'rot' };
    if (type === 'car') G2 = vehicle(key);
    else if (type === 'type') G2 = house({ ...base, ...PRESETS[key] });
    else if (type === 'wall') G2 = house({ ...base, w: 68, floors: 1, wall: key });
    else if (type === 'roof') G2 = house({ ...base, w: 68, floors: 1, roof: key });
    else { G2 = grid(26, 30); grect(G2, 0, 0, 26, 30, HOUSE_COL.weiss[0]); if (type === 'door') doorAt(G2, 13, 26, key); else windowAt(G2, key === 'gross' ? 7 : 8, key === 'gross' ? 5 : 8, key, '#7a5230'); goutline(G2); }
    return (cache[ck] = canvasOf(G2));
  }
  // Deko-Bild als Datei-Adresse für die Menüs (Katalog, Lager)
  function decoIconURL(key) {
    const ck = 'url|' + key; if (cache[ck]) return cache[ck];
    const r = DSPR[key]; if (!r || !dReady) return '';
    const c = document.createElement('canvas'); c.width = r[2]; c.height = r[3];
    c.getContext('2d').drawImage(DATL, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    return (cache[ck] = c.toDataURL());
  }
  const canvasURL = (cv) => { if (!cv.dataset) return ''; return cv._url || (cv._url = cv.toDataURL()); };

  return { buildScene, dspr, ps, danim, pixelText, houseCanvas, vehicleCanvas, iconCanvas, decoIconURL, canvasURL, dogHouse, catTree, plaque, onReady, lakeV, MINE_X,
    get ready() { return dReady; }, DATL };
})();

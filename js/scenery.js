// ===== Landschaft & Pixel-Generatoren (Update 6) =====
// Statische Hof-Landschaft (Wald, See, Berg, Wege, Hofplatz) wird einmal in eine Leinwand gezeichnet.
// Häuser, Autos, Hundehütte, Kratzbaum usw. sind selbst gepixelt (aus dem Hof-Plan der Deko-Werkstatt übernommen).
'use strict';
const SCN = (() => {
  const T = TILE, W = MAP_W + (TOWN_ON ? TOWN_W : 0), H = MAP_H;
  // Rand außerhalb der Karte (Felder): Landschaft läuft weiter, damit man nie den leeren Hintergrund sieht
  const MG = SCENE_MARGIN;
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
  // Text genau mittig in ein Rechteck (Schildfläche): waagerecht nach Tinte, senkrecht nach Großbuchstaben-Höhe
  function pixelTextBox(g, s, bx, by, bw, bh, color) {
    s = String(s || '').trim(); if (!s) return;
    const c = DFONT.c; let x = 0, i0 = 0, i1 = 0;
    [...s].forEach((ch, i) => { const e = c[ch]; if (i === 0) i0 = e ? e[2] : 0; i1 = x + (e ? e[3] : 4); x += (e ? e[1] : 4) + 1; });
    const ox = Math.round(bx + (bw - (i1 - i0)) / 2 - i0), oy = Math.round(by + (bh - (DFONT.base - DFONT.top)) / 2 - DFONT.top);
    pixelText(g, s, ox, oy, color, true);
  }
  const inkWidth = (s) => { const c = DFONT.c; let x = 0, i0 = 0, i1 = 0; [...s].forEach((ch, i) => { const e = c[ch]; if (i === 0) i0 = e ? e[2] : 0; i1 = x + (e ? e[3] : 4); x += (e ? e[1] : 4) + 1; }); return i1 - i0; };
  // Pixel-Schrift für eigene Schildtexte (zentriert um cx, oben bei y)
  function pixelText(g, s, cx, y, color, exact = false) { // exact: cx ist schon die linke Kante (enge Schrift)
    const c = DFONT.c, gap = 1; let w = 0; for (const ch of s) w += (c[ch] ? c[ch][1] : 4) + gap;
    let x = exact ? cx : Math.round(cx - w / 2);
    const tmp = pixelText.cv || (pixelText.cv = document.createElement('canvas'));
    tmp.width = Math.max(1, w); tmp.height = DFONT.h; const tg = tmp.getContext('2d');
    tg.clearRect(0, 0, tmp.width, tmp.height);
    let tx = 0; for (const ch of s) { const e = c[ch]; if (e) tg.drawImage(DATL, DFONT.x + e[0], DFONT.y, e[1], DFONT.h, tx, 0, e[1], DFONT.h); tx += (e ? e[1] : 4) + gap; }
    tg.globalCompositeOperation = 'source-in'; tg.fillStyle = color; tg.fillRect(0, 0, tmp.width, tmp.height); tg.globalCompositeOperation = 'source-over';
    g.drawImage(tmp, x, Math.round(y));
  }



  // Felder, auf denen die Landschaft steht (Wald, See, Berg, Schilf, Wegweiser) – dort keine Deko
  let BL = null;
  const markT = (tx, ty) => { if (BL && tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H) BL[ty * MAP_W + tx] = 1; };
  const markPx = (x, y) => markT(Math.floor(x / T), Math.floor(y / T));
  function blockedAt(tx, ty) {
    if (!BL) { const c = document.createElement('canvas'); c.width = c.height = 1; try { buildScene(c.getContext('2d')); } catch (e) { /* ohne Grafik: nur Grundregeln */ } }
    if (!BL) return false;
    return !!BL[ty * MAP_W + tx];
  }
  // Wasser (See + Wasserfall-Becken): einzige Landschaft, auf der keine Deko stehen darf
  function waterAt(tx, ty) {
    for (const [a, b] of [[0.5, 0.5], [0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]]) if (lakeV((tx + a) * T, (ty + b) * T) > 0.06) return true;
    return false;
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
    for (let y = 15 * T; y < (H + MG) * T; y += 4) for (let x = -MG * T; x < 19 * T; x += 4) {
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
      for (let x = MX - 2 * T; x < (W + MG) * T; x += 4) {
        const yb = t.base(x), yTop = yb - t.ch;
        for (let y = -MG * T; y < yb; y += 4) {
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
  // Hundehütte in schräger Draufsicht: Giebel vorne, Dachflächen von oben, Bretterwand, Namensschild, Napf, Knochen, Matte
  let dogCv = null;
  function dogHouseGrid() {
    const G = grid(48, 50), cx = 24, wy = 26, x0 = 10, x1 = 38, gy = 44;
    grect(G, x0, wy, x1 - x0, gy - wy, '#c48a52');
    for (let y = wy + 3; y < gy; y += 5) { grect(G, x0, y, x1 - x0, 1, '#8a5a32'); grect(G, x0, y + 1, x1 - x0, 1, '#d9a36a'); }
    grect(G, x0, wy, x1 - x0, 2, '#8a5a32');
    const r = gableRoof(G, x0 - 4, x1 + 3, wy + 2, cx, 13, 11, ROOF_COL.rot, '#5d3a1a');
    gpoly(G, [[x0, wy + 1], [cx, r.ya + 3], [x1, wy + 1]], '#c48a52');
    r.fascia();
    // Eingang (Rundbogen) + Kissen
    grect(G, cx - 7, wy + 9, 14, gy - wy - 9, '#2a170b'); grect(G, cx - 6, wy + 7, 12, 2, '#2a170b'); grect(G, cx - 4, wy + 6, 8, 1, '#2a170b');
    grect(G, cx - 5, gy - 4, 10, 4, '#b8462f'); grect(G, cx - 4, gy - 4, 8, 1, '#d9604a');
    grect(G, cx - 6, wy + 1, 12, 4, '#ecd9a6'); for (let i = 0; i < 4; i++) gset(G, cx - 4 + i * 2, wy + 3, '#5d3a1a'); // Namensschild
    goutline(G);
    return G;
  }
  function dogHouse(g, x, y) {
    if (!dogCv) dogCv = canvasOf(dogHouseGrid());
    const a = Math.round(x - 24), b = Math.round(y - 46);
    g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(x, y - 1, 22, 4, 0, 0, Math.PI * 2); g.fill();
    R(g, a + 11, b + 44, 26, 4, '#5f86c9'); for (let i = 0; i < 26; i += 4) R(g, a + 11 + i, b + 44, 2, 4, '#4a6fae'); // Matte
    g.drawImage(dogCv, a, b - 2);
    // Napf (von oben: Rand + Futter) und Knochen
    R(g, a + 42, b + 40, 11, 6, '#22457a'); R(g, a + 42, b + 39, 11, 5, '#3a74c4'); R(g, a + 43, b + 40, 9, 3, '#8b5a2b'); R(g, a + 44, b + 40, 2, 1, '#a8774a');
    R(g, a - 3, b + 42, 9, 2, '#f3ecd9'); R(g, a - 4, b + 41, 2, 2, '#f3ecd9'); R(g, a - 4, b + 43, 2, 2, '#f3ecd9'); R(g, a + 5, b + 41, 2, 2, '#f3ecd9'); R(g, a + 5, b + 43, 2, 2, '#f3ecd9');
  }

  // Wanderhändler: eigene Figur mit ganzem Körper (Hut, Bart, Mantel, Gürtel mit Geldbeutel, Umhängetasche, Hose, Stiefel)
  // frame 1 = winkt mit der rechten Hand
  function merchantGrid(frame) {
    const G = grid(30, 50), cx = 15;
    const SK = '#e9b48a', SKD = '#c98e66', CO = '#6a4c93', COD = '#4f3770', COL = '#8a6cb3', BE = '#8a6a4a', BED = '#6b4f35';
    // Stiefel + Hose
    grect(G, cx - 6, 43, 5, 5, '#3b2412'); grect(G, cx + 1, 43, 5, 5, '#3b2412'); grect(G, cx - 6, 43, 5, 1, '#5d3a1a'); grect(G, cx + 1, 43, 5, 1, '#5d3a1a');
    grect(G, cx - 5, 36, 4, 7, '#4a4a5a'); grect(G, cx + 1, 36, 4, 7, '#4a4a5a'); grect(G, cx - 2, 36, 1, 7, '#3a3a48');
    // Mantel (Rock vorne offen), Hemd, Gürtel mit Schnalle und Geldbeutel
    grect(G, cx - 7, 21, 14, 17, CO); grect(G, cx - 7, 21, 2, 17, COD); grect(G, cx + 5, 21, 2, 17, COD);
    grect(G, cx - 2, 21, 4, 12, '#f3ecd9'); for (let y = 23; y < 32; y += 3) gset(G, cx, y, '#a8774a');
    grect(G, cx - 7, 30, 14, 2, '#3b2412'); grect(G, cx - 1, 30, 2, 2, '#ffd34d');
    grect(G, cx + 2, 32, 4, 4, '#c9962c'); grect(G, cx + 2, 32, 4, 1, '#8a6a22'); gset(G, cx + 4, 34, '#ffe08a');
    grect(G, cx - 7, 34, 3, 4, COD); grect(G, cx + 4, 34, 3, 4, COD);
    // Umhängetasche (Riemen schräg über die Brust)
    for (let i = 0; i < 11; i++) gset(G, cx - 5 + i, 21 + i, '#7a4b25');
    grect(G, cx - 10, 29, 5, 6, '#a8774a'); grect(G, cx - 10, 29, 5, 2, '#c99a5e');
    // Kragen + Schultern
    grect(G, cx - 8, 20, 16, 3, COL); grect(G, cx - 3, 20, 6, 2, '#f3ecd9');
    // Arme
    grect(G, cx - 10, 22, 3, 9, CO); grect(G, cx - 10, 31, 3, 2, SK);
    if (frame === 1) { grect(G, cx + 7, 12, 3, 10, CO); grect(G, cx + 7, 10, 3, 3, SK); gset(G, cx + 10, 10, SK); }
    else { grect(G, cx + 7, 22, 3, 9, CO); grect(G, cx + 7, 31, 3, 2, SK); }
    // Kopf: Gesicht, Augen, Nase, Bart
    grect(G, cx - 5, 9, 10, 11, SK); grect(G, cx - 5, 9, 1, 11, SKD); gset(G, cx - 6, 13, SK); gset(G, cx + 5, 13, SK);
    gset(G, cx - 3, 13, '#2a1d14'); gset(G, cx + 2, 13, '#2a1d14'); gset(G, cx - 3, 12, BED); gset(G, cx + 2, 12, BED);
    gset(G, cx - 1, 15, SKD); gset(G, cx, 15, SKD);
    grect(G, cx - 5, 16, 10, 4, BE); grect(G, cx - 4, 20, 8, 1, BE); grect(G, cx - 2, 17, 4, 1, '#b8462f'); grect(G, cx - 5, 19, 1, 1, BED); grect(G, cx + 4, 19, 1, 1, BED);
    // Hut mit breiter Krempe und rotem Band + Feder
    grect(G, cx - 9, 8, 18, 2, '#5d3a1a'); grect(G, cx - 9, 8, 18, 1, '#7a4b25');
    grect(G, cx - 5, 2, 10, 6, '#6b4423'); grect(G, cx - 5, 2, 10, 1, '#8a5a32'); grect(G, cx - 5, 6, 10, 2, '#c0392b');
    grect(G, cx + 4, 0, 2, 5, '#ffd34d'); gset(G, cx + 5, 0, '#fff3b0');
    goutline(G);
    for (let y = 47; y < 50; y++) for (let x = 4; x < 26; x++) if (!gget(G, x, y) && ((x - 15) / 10) ** 2 + ((y - 48) / 1.8) ** 2 <= 1) gset(G, x, y, 'rgba(0,0,0,0.22)');
    return G;
  }
  const merchantCv = [];
  function merchant(g, x, y, frame = 0) { // (x, y) = Füße
    if (!merchantCv[frame]) merchantCv[frame] = canvasOf(merchantGrid(frame));
    const c = merchantCv[frame]; g.drawImage(c, Math.round(x - c.width / 2), Math.round(y - 48));
  }
  const merchantURL = () => { if (!merchantCv[0]) merchantCv[0] = canvasOf(merchantGrid(0)); return canvasURL(merchantCv[0]); };
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
    for (let px = bx; px <= bx + w; px += T / 2) markPx(px, by + 10); markPx(x, y - 2);
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

  // --- Fahrzeuge: schräg von vorne-oben (stehen auf dem Stellplatz mit der Schnauze zur Straße) ---
  // Wie die CraftPix-Grafiken: man sieht Dach und Motorhaube von oben, darunter die Front.
  function carBody(G, o) {
    const { cx, c, d, l, bw, rw, yRoof, yWin, yHood, yFront, yBot } = o;
    // Räder (hinten schauen sie seitlich unter der Karosserie hervor, vorne unten an den Ecken)
    const wh = o.wheelH || 9;
    for (const s of [-1, 1]) {
      grect(G, cx + s * (bw / 2) - (s < 0 ? 2 : 3), yWin - 2, 5, wh, '#1f1f1f');
      grect(G, cx + s * (bw / 2) - (s < 0 ? 3 : 4), yBot - wh, 7, wh + 1, '#1f1f1f');
      grect(G, cx + s * (bw / 2) - (s < 0 ? 2 : 3), yBot - wh + 1, 5, 2, '#3a3a3a');
    }
    // Karosserie-Seiten (schmal sichtbar) + Heck oben
    gpoly(G, [[cx - rw / 2 - 1, yRoof - 2], [cx + rw / 2 + 1, yRoof - 2], [cx + bw / 2, yHood], [cx + bw / 2, yBot - 2], [cx - bw / 2, yBot - 2], [cx - bw / 2, yHood]], d);
    // Dach von oben
    gpoly(G, [[cx - rw / 2 + 2, yRoof], [cx + rw / 2 - 2, yRoof], [cx + rw / 2, yRoof + 2], [cx + rw / 2, yWin], [cx - rw / 2, yWin], [cx - rw / 2, yRoof + 2]], c);
    grect(G, cx - rw / 2 + 2, yRoof + 1, rw - 4, 1, l); grect(G, cx - rw / 2 + 1, yWin - 1, rw - 2, 1, d);
    // Windschutzscheibe (Trapez)
    gpoly(G, [[cx - rw / 2, yWin], [cx + rw / 2, yWin], [cx + bw / 2 - 3, yHood], [cx - bw / 2 + 3, yHood]], GLASS);
    for (let i = 0; i < 4; i++) gset(G, cx - rw / 2 + 4 + i, yWin + 1 + i, GLASS2);
    for (let i = 0; i < 3; i++) gset(G, cx - rw / 2 + 9 + i, yWin + 1 + i, GLASS2);
    grect(G, cx - 1, yWin, 2, 1, '#3a3a3a'); // Innenspiegel
    // Spiegel
    grect(G, cx - bw / 2 - 3, yHood - 3, 4, 3, c); grect(G, cx + bw / 2 - 1, yHood - 3, 4, 3, c);
    // Motorhaube von oben
    gpoly(G, [[cx - bw / 2 + 2, yHood], [cx + bw / 2 - 2, yHood], [cx + bw / 2, yFront], [cx - bw / 2, yFront]], c);
    grect(G, cx - bw / 2 + 2, yHood, bw - 4, 1, l);
    for (let y = yHood + 2; y < yFront - 1; y++) { gset(G, cx - 6, y, l); gset(G, cx + 5, y, d); }
    // Front: Kühlergrill, Scheinwerfer, Stoßstange
    grect(G, cx - bw / 2, yFront, bw, yBot - yFront - 3, d);
    grect(G, cx - bw / 2, yFront, bw, 1, l);
    grect(G, cx - 9, yFront + 2, 18, 4, '#2a2a2a'); for (let x = cx - 8; x < cx + 9; x += 2) grect(G, x, yFront + 2, 1, 4, '#4a4a4a');
    grect(G, cx - bw / 2 + 2, yFront + 2, 6, 3, '#fff3b0'); grect(G, cx + bw / 2 - 8, yFront + 2, 6, 3, '#fff3b0');
    gset(G, cx - bw / 2 + 3, yFront + 2, '#ffffff'); gset(G, cx + bw / 2 - 7, yFront + 2, '#ffffff');
    grect(G, cx - bw / 2 - 1, yBot - 4, bw + 2, 3, o.bumper || '#a5a5a5'); grect(G, cx - bw / 2 - 1, yBot - 4, bw + 2, 1, '#d6d6d6');
    grect(G, cx - 6, yBot - 4, 12, 3, '#efe6c8'); grect(G, cx - 5, yBot - 3, 10, 1, '#3a3a3a'); // Nummernschild
  }
  function vehicle(kind) {
    const G = grid(60, 64), cx = 30, b = 60;
    if (kind === 'quad') {
      const c = '#c63d2f', d = '#8e2a20', l = '#e86a55';
      for (const s of [-1, 1]) { grect(G, cx + s * 17 - 4, 14, 8, 12, '#1f1f1f'); grect(G, cx + s * 17 - 4, b - 16, 9, 14, '#1f1f1f'); for (let y = b - 15; y < b - 2; y += 3) grect(G, cx + s * 17 - 4, y, 9, 1, '#3a3a3a'); }
      gpoly(G, [[cx - 22, 18], [cx + 22, 18], [cx + 20, 26], [cx - 20, 26]], c); // hinterer Kotflügel
      grect(G, cx - 14, 6, 28, 12, '#b5834f'); grect(G, cx - 14, 6, 28, 2, '#d9a56b'); for (let x = cx - 12; x < cx + 13; x += 6) grect(G, x, 8, 1, 10, '#7a5230'); // Kiste hinten
      grect(G, cx - 18, 17, 36, 2, '#4a4a4a');
      gpoly(G, [[cx - 7, 22], [cx + 7, 22], [cx + 9, 36], [cx - 9, 36]], '#2d2d2d'); grect(G, cx - 6, 23, 12, 2, '#555555'); // Sitz
      gpoly(G, [[cx - 12, 34], [cx + 12, 34], [cx + 14, b - 18], [cx - 14, b - 18]], c); grect(G, cx - 11, 34, 22, 1, l); // Tank/Haube
      gpoly(G, [[cx - 24, b - 20], [cx + 24, b - 20], [cx + 22, b - 12], [cx - 22, b - 12]], c); grect(G, cx - 22, b - 20, 44, 1, l); // vorderer Kotflügel
      grect(G, cx - 20, 33, 40, 2, '#2d2d2d'); grect(G, cx - 22, 32, 4, 3, '#555555'); grect(G, cx + 18, 32, 4, 3, '#555555'); // Lenker
      grect(G, cx - 14, b - 14, 28, 3, '#3a3a3a'); for (let x = cx - 13; x < cx + 14; x += 4) grect(G, x, b - 14, 1, 3, '#6a6a6a'); // Gepäckgitter vorne
      grect(G, cx - 9, b - 11, 5, 3, '#fff3b0'); grect(G, cx + 4, b - 11, 5, 3, '#fff3b0');
      gswap(G, 0, b - 13, 60, 2, c, d);
    } else if (kind === 'kombi') {
      carBody(G, { cx, c: '#4a7fc1', d: '#355f94', l: '#79a6dd', bw: 42, rw: 34, yRoof: 3, yWin: 24, yHood: 34, yFront: 47, yBot: b });
      grect(G, cx - 15, 2, 30, 1, '#5a5a5a'); grect(G, cx - 15, 1, 2, 2, '#5a5a5a'); grect(G, cx + 13, 1, 2, 2, '#5a5a5a'); // Dachreling
    } else if (kind === 'suv') {
      carBody(G, { cx, c: '#5d7d3d', d: '#435c2b', l: '#83a35d', bw: 46, rw: 38, yRoof: 8, yWin: 26, yHood: 35, yFront: 46, yBot: b, wheelH: 11, bumper: '#3a3a3a' });
      grect(G, cx - 17, 5, 34, 2, '#3a3a3a'); for (const x of [cx - 15, cx - 5, cx + 5, cx + 14]) grect(G, x, 5, 1, 6, '#3a3a3a'); // Dachträger
      grect(G, cx - 12, 1, 14, 6, '#b5834f'); grect(G, cx - 12, 1, 14, 1, '#d9a56b'); grect(G, cx + 4, 2, 9, 5, '#4f6a8a'); // Gepäck
    } else if (kind === 'pickup') {
      const c = '#b8352b', d = '#86251d', l = '#d9574a';
      // Ladefläche hinter der Kabine (oben im Bild) mit Ladung
      grect(G, cx - 21, 1, 42, 19, d); grect(G, cx - 18, 3, 36, 16, '#5a1a14');
      grect(G, cx - 16, 4, 12, 9, '#e2c25c'); for (let y = 6; y < 13; y += 3) grect(G, cx - 16, y, 12, 1, '#c29f3a'); grect(G, cx - 16, 4, 12, 1, '#f3dc8a'); // Heuballen
      grect(G, cx - 2, 5, 8, 9, '#c9ccd2'); grect(G, cx - 1, 5, 6, 2, '#8d9097'); // Milchkanne
      grect(G, cx + 8, 7, 9, 7, '#b5834f'); grect(G, cx + 8, 7, 9, 1, '#d9a56b'); // Kiste
      grect(G, cx - 21, 1, 42, 2, l);
      carBody(G, { cx, c, d, l, bw: 44, rw: 34, yRoof: 19, yWin: 29, yHood: 37, yFront: 48, yBot: b, wheelH: 10, bumper: '#d8d8d8' });
    } else if (kind === 'oldtimer') {
      const c = '#2f8a87', d = '#206563', l = '#56b3ae', cr = '#efe3c4';
      grect(G, cx - 19, 1, 38, 17, d); grect(G, cx - 16, 3, 32, 14, '#6b4423'); for (let x = cx - 14; x < cx + 16; x += 5) grect(G, x, 3, 1, 14, '#553418'); // Holz-Ladefläche
      grect(G, cx - 12, 5, 10, 8, '#e2c25c'); grect(G, cx - 12, 5, 10, 1, '#f3dc8a');
      grect(G, cx - 19, 1, 38, 2, l);
      // runde Kotflügel vorne mit Weißwandreifen und runden Scheinwerfern
      for (const s of [-1, 1]) {
        grect(G, cx + s * 19 - 4, 18, 8, 10, '#1f1f1f');
        grect(G, cx + s * 19 - 5, b - 12, 10, 12, '#1f1f1f'); grect(G, cx + s * 19 - 4, b - 11, 8, 2, '#f1efe8');
        gcirc(G, cx + s * 18, b - 18, 8, c); grect(G, cx + s * 18 - 6, b - 26, 12, 2, l);
        gcirc(G, cx + s * 17, b - 15, 3.2, '#e6e6e6'); gcirc(G, cx + s * 17, b - 15, 2, '#fff3b0');
      }
      gpoly(G, [[cx - 14, 18], [cx + 14, 18], [cx + 15, 20], [cx + 15, 28], [cx - 15, 28], [cx - 15, 20]], cr); grect(G, cx - 12, 19, 24, 1, '#fffaf0'); // Dach (creme)
      gpoly(G, [[cx - 15, 28], [cx + 15, 28], [cx + 13, 34], [cx - 13, 34]], GLASS); for (let i = 0; i < 3; i++) gset(G, cx - 11 + i, 29 + i, GLASS2);
      gpoly(G, [[cx - 11, 34], [cx + 11, 34], [cx + 10, b - 12], [cx - 10, b - 12]], c); grect(G, cx - 10, 34, 20, 1, l); gset(G, cx, 36, l);
      for (let y = 36; y < b - 13; y++) { gset(G, cx - 5, y, d); gset(G, cx + 5, y, d); }
      grect(G, cx - 7, b - 12, 14, 7, '#e6e6e6'); for (let x = cx - 6; x < cx + 7; x += 2) grect(G, x, b - 11, 1, 5, '#9a9a9a'); // Chrom-Grill
      grect(G, cx - 22, b - 5, 44, 3, '#e6e6e6'); grect(G, cx - 22, b - 5, 44, 1, '#ffffff');
    }
    goutline(G);
    // Schatten am Boden
    for (let y = b - 1; y < b + 3; y++) for (let x = 6; x < 54; x++) if (!gget(G, x, y) && ((x - 30) / 25) ** 2 + ((y - b) / 3.5) ** 2 <= 1) gset(G, x, y, 'rgba(0,0,0,0.22)');
    return G;
  }

  // Farbe abdunkeln (für die Schattenseite des Dachs)
  const darkHex = (h, f) => { const n = parseInt(h.slice(1), 16); return '#' + [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0')).join(''); };
  // Satteldach mit dem Giebel nach vorne, in schräger Draufsicht (wie die CraftPix-Häuser):
  // zwei Dachflächen laufen von den Traufen vorne nach hinten (oben im Bild), Schindelreihen parallel zur Giebelkante.
  // xl/xr = Traufecken, ye = Traufhöhe vorne, cx = First, gH = Giebelhöhe, D = Tiefe nach hinten
  function gableRoof(G, xl, xr, ye, cx, gH, D, rc, trim) {
    const ya = ye - gH, RS = [darkHex(rc[0], 0.78), darkHex(rc[1], 0.8), darkHex(rc[2], 0.8)];
    const edgeL = (x) => ye + (x - xl) * (ya - ye) / (cx - xl), edgeR = (x) => ye + (xr - x) * (ya - ye) / (xr - cx);
    for (let x = xl; x <= xr; x++) {
      const left = x < cx, e = left ? edgeL(x + 0.5) : edgeR(x + 0.5), P = left ? rc : RS;
      for (let y = Math.floor(e - D); y <= Math.ceil(e); y++) {
        const d = e - y; if (d < 0 || d > D) continue;
        const dd = Math.floor(d), row = Math.floor(dd / 4);
        let col = P[0];
        if (dd % 4 === 3) col = P[1]; else if ((x + row * 3) % 6 === 0) col = P[1]; else if (dd % 4 === 0) col = P[2];
        gset(G, x, y, col);
      }
    }
    for (let y = Math.floor(ya - D); y <= ya; y++) { gset(G, cx - 1, y, rc[1]); gset(G, cx, y, RS[1]); } // First
    return { ya, edgeL, edgeR, fascia() { // Giebelbretter vorne (nach dem Giebeldreieck zeichnen)
      for (let x = xl; x <= xr; x++) { const e = x < cx ? edgeL(x + 0.5) : edgeR(x + 0.5); gset(G, x, Math.round(e), trim); gset(G, x, Math.round(e) - 1, x < cx ? rc[2] : RS[0]); }
    } };
  }
  // Walmdach-Fläche (Traufe parallel zur Front), Schindelreihen waagerecht; Walm-Enden dunkler
  function hipRoof(G, xl, xr, ye, D, inset, rc) {
    const RS = [darkHex(rc[0], 0.78), darkHex(rc[1], 0.8), darkHex(rc[2], 0.8)];
    for (let y = ye - D; y <= ye; y++) {
      const d = ye - y, k = d / D, a = xl + inset * k, b = xr - inset * k;
      for (let x = Math.floor(a); x <= Math.ceil(b); x++) {
        const end = x < xl + inset * 1.6 * k + 2 || x > xr - inset * 1.6 * k - 2, P = end ? RS : rc, row = Math.floor(d / 4);
        let col = P[0]; if (d % 4 === 3) col = P[1]; else if ((x + row * 3) % 6 === 0) col = P[1]; else if (d % 4 === 0) col = P[2];
        gset(G, x, y, col);
      }
    }
    for (let x = Math.ceil(xl + inset); x <= Math.floor(xr - inset); x++) gset(G, x, ye - D, rc[1]); // First
  }
  function chimneyAt(G, x, yb, h = 12) { grect(G, x, yb - h, 8, h, '#9a5a44'); grect(G, x, yb - h, 8, 3, '#b57a62'); grect(G, x - 1, yb - h - 1, 10, 2, '#6f3f30'); for (let y = yb - h + 5; y < yb; y += 3) grect(G, x, y, 8, 1, '#7f4a38'); grect(G, x + 6, yb - h + 3, 2, h - 3, '#7f4a38'); }

  // --- Häuser (schräge Draufsicht wie Scheune & Hofladen) ---
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
    const fh = 24, floors = o.floors, W0 = o.w, ov = 4;
    const [wc, wd] = HOUSE_COL[o.wall], rc = ROOF_COL[o.roof], trim = o.trim;
    const wallH = floors * fh + 5;
    const big = !!o.hip; // Landhaus: breites Walmdach + Zwerchgiebel; sonst Giebel nach vorne
    const gH = big ? 0 : Math.round(W0 * 0.4), D = big ? 38 : (floors > 1 ? 27 : 24);
    const top = big ? 14 : 4;
    const Gw = W0 + ov * 2 + 4, x0 = ov + 2, x1 = x0 + W0, cx = Math.floor(Gw / 2);
    const wy = top + D + gH, gy = wy + wallH + 4;
    const G = grid(Gw, gy + 3);
    // Wand mit Putz, Ecken, Stockwerksbalken, Sockel
    grect(G, x0, wy, W0, wallH + 4, wc);
    seed = W0 * 7 + floors; for (let i = 0; i < W0 * wallH / 14; i++) gset(G, x0 + rnd() * W0, wy + rnd() * wallH, wd);
    grect(G, x0, wy, W0, 3, darkHex(wc, 0.8)); // Schatten unter der Traufe
    grect(G, x0, wy, 2, wallH, trim); grect(G, x1 - 2, wy, 2, wallH, trim);
    for (let f = 1; f < floors; f++) grect(G, x0, gy - 5 - f * fh, W0, 2, trim);
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
    // Dach
    if (!big) {
      const r = gableRoof(G, x0 - ov, x1 + ov - 1, wy + 2, cx, gH, D, rc, trim);
      gpoly(G, [[x0, wy + 1], [cx, r.ya + 3], [x1, wy + 1]], wc); // Giebeldreieck (Wand)
      for (let y = Math.round(r.ya + 6); y < wy; y += 4) for (let x = x0; x < x1; x++) if (gget(G, x, y) === wc && (x + y) % 9 === 0) gset(G, x, y, wd);
      if (floors > 1) windowAt(G, cx - 5, Math.round(r.ya + gH * 0.42), 'klein', o.winTrim || '#f3ecd9', wd);
      else { gcirc(G, cx, r.ya + gH * 0.58, 4, trim); gcirc(G, cx, r.ya + gH * 0.58, 3, GLASS); gset(G, cx - 1, Math.floor(r.ya + gH * 0.58) - 1, GLASS2); }
      r.fascia();
      if (o.chimney) { const chx = cx + Math.round((x1 - cx) * 0.45); chimneyAt(G, chx, Math.round(r.edgeR(chx + 4) - D * 0.55), 12); }
    } else {
      hipRoof(G, x0 - ov, x1 + ov - 1, wy + 2, D, 22, rc);
      for (let x = x0 - ov; x < x1 + ov; x++) gset(G, x, wy + 2, trim); // Traufbrett
      if (o.chimney) chimneyAt(G, x1 - 30, wy - D + 18, 14);
      // Zwerchgiebel vorne in der Mitte mit rundem Fenster
      const gw = 44, gh2 = 24, r = gableRoof(G, cx - gw / 2 - 3, cx + gw / 2 + 2, wy + 2, cx, gh2, 12, rc, trim);
      gpoly(G, [[cx - gw / 2, wy + 1], [cx, r.ya + 3], [cx + gw / 2, wy + 1]], wc);
      gcirc(G, cx, wy - 8, 4, trim); gcirc(G, cx, wy - 8, 3, GLASS); gset(G, cx - 1, wy - 9, GLASS2);
      r.fascia();
    }
    // Veranda (amerikanischer Vorbau): Dach als Fläche von oben, Pfosten, Geländer, Holzboden, Stufen
    if (o.porch) {
      const py = gy - 5 - fh - 1;
      shingles(G, x0 - 3, py - 6, x1 + 3, py + 2, () => true, [darkHex(rc[0], 1.05), rc[1], rc[2]]);
      grect(G, x0 - 3, py + 2, W0 + 6, 2, trim);
      for (let x = x0; x <= x1 - 2; x += Math.floor((W0 - 2) / 6)) grect(G, x, py + 4, 2, fh - 1, '#f3ecd9');
      for (let x = x0; x < x1; x++) { if (Math.abs(x - cx) < 9) continue; gset(G, x, gy - 13, '#f3ecd9'); gset(G, x, gy - 8, '#f3ecd9'); if (x % 3 === 0) for (let y = gy - 12; y < gy - 8; y++) gset(G, x, y, '#efe6d0'); }
      grect(G, x0 - 3, gy - 5, W0 + 6, 4, '#a8774a'); for (let x = x0 - 3; x < x1 + 3; x += 5) gset(G, x, gy - 3, '#7a5230');
      grect(G, cx - 9, gy - 1, 18, 2, '#8a5a32'); grect(G, cx - 10, gy + 1, 20, 2, '#7a5230');
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
    BL = new Uint8Array(MAP_W * MAP_H);
    g.save(); g.translate(MG * T, MG * T); // gezeichnet wird in Karten-Koordinaten, die Leinwand hat ringsum MG Felder Rand
    seed = 11;
    R(g, -MG * T, -MG * T, (W + 2 * MG) * T, (H + 2 * MG) * T, '#6ea24b');
    for (let y = -MG * T; y < (H + MG) * T; y += 4) for (let x = -MG * T; x < (W + MG) * T; x += 4) {
      const r = rnd(); if (r < 0.05) R(g, x, y, 4, 4, '#649847'); else if (r < 0.08) R(g, x, y, 4, 4, '#79ad55');
    }
    const f = FARM;
    dirt(g, f.road.x0 * T, f.road.y * T, (W + MG - f.road.x0) * T, T); // Dorfstraße läuft rechts aus dem Bild (Richtung Stadt)
    dirt(g, f.stegweg.x * T, f.stegweg.y0 * T, T, (f.stegweg.y1 - f.stegweg.y0 + 1) * T);
    dirt(g, f.minenweg.x * T, f.minenweg.y0 * T, T, (f.minenweg.y1 - f.minenweg.y0 + 1) * T);
    paved(g, f.yard); paved(g, f.link); paved(g, f.park);
    // Gasse in der Stadt (Pflaster), endet auf der Dorfstraße
    if (TOWN_ON) paved(g, { x: TOWN_X0 + 4, y: 1 + TOWN_Y0, w: 2, h: 13 });
    lake(g);
    // Wasser und Berg sperren (Prüfpunkte im Feld)
    for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++)
      for (const [a, b] of [[0.5, 0.5], [0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) {
        const px = (tx + a) * T, py = (ty + b) * T;
        if (lakeV(px, py) > 0.06 || inMount(px, py)) { markT(tx, ty); break; }
      }
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
      markPx(x, y - 2); markPx(x, y - 34); // Stamm + Krone
      const r = rnd(), fl = rnd() < 0.5;
      if (r < 0.3) { const k = ['tanne1', 'tanne2', 'tanne3'][Math.floor(rnd() * 3)]; add(y, (g2) => ps(g2, k, x, y, fl)); }
      else if (r < 0.55) { const i = Math.floor(rnd() * 4); add(y, (g2) => spr(g2, 'wald', i, x, y, fl)); }
      else if (r < 0.8) { const k = ['laub1', 'laub2', 'laub3', 'laub5'][Math.floor(rnd() * 4)]; add(y, (g2) => ps(g2, k, x, y, fl)); }
      else { const k = ['tanne4', 'busch1', 'busch2', 'busch5'][Math.floor(rnd() * 4)]; add(y, (g2) => ps(g2, k, x, y, fl)); }
    };
    for (let row = 0; row < 3; row++) for (let x = -10 + row * 14; x < MX - 0.6 * T; x += 40 + rnd() * 18) tree(x, (0.9 + row * 1.05) * T + rnd() * 16);
    for (let x = 20; x < MX - T; x += 70 + rnd() * 80) { const y = 3.7 * T + rnd() * 10, k = ['busch3', 'busch4', 'farn', 'busch6'][Math.floor(rnd() * 4)]; markPx(x, y - 2); add(y, (g2) => ps(g2, k, x, y)); }
    for (let col = 0; col < 2; col++) for (let y = 4 * T; y < 17.5 * T; y += 36 + rnd() * 16) tree((0.5 + col * 1.0) * T + rnd() * 10, y);
    for (let row = 0; row < 3; row++) for (let x = 17.8 * T + row * 14; x < W * T + 30; x += 40 + rnd() * 18) tree(x, (24.2 + row * 1.0) * T + rnd() * 14);
    // Rand außerhalb der Karte: Wald oben, links und unten, rechts Wiese mit Bäumen (Straße frei)
    seed = 91;
    const freeOut = (x, y) => lakeV(x, y) < -0.15 && !inMount(x, y + 8) && !(y > 12.6 * T && y < 15.2 * T && x > (W - 1) * T);
    for (let y = -0.2 * T; y > -MG * T; y -= 1.05 * T) for (let x = -MG * T + rnd() * 20; x < MX - 0.6 * T; x += 40 + rnd() * 18) tree(x, y + rnd() * 16);
    for (let x = -0.5 * T; x > -MG * T; x -= T) for (let y = -MG * T + rnd() * 20; y < (H + MG) * T; y += 36 + rnd() * 16) { const xx = x + rnd() * 10; if (freeOut(xx, y)) tree(xx, y); }
    for (let y = (H + 0.35) * T; y < (H + MG + 1) * T; y += 1.05 * T) for (let x = -MG * T + rnd() * 20; x < (W + MG) * T; x += 40 + rnd() * 18) { const yy = y + rnd() * 14; if (freeOut(x, yy)) tree(x, yy); }
    for (let x = W * T + 20; x < (W + MG) * T + 20; x += 44 + rnd() * 16) for (let y = 0.6 * T; y < H * T; y += 40 + rnd() * 22) { const xx = x + rnd() * 12; if (freeOut(xx, y) && rnd() < 0.8) tree(xx, y); }
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
    for (let x = MX + 20; x < MAP_W * T; x += 70 + rnd() * 60) { const y = TER[0].base(x) + 8, k = rnd() < 0.5 ? 'kiesel1' : 'kiesel2'; if (Math.abs(x - MINE_X) > 50 && Math.abs(x - (MX + 7.4 * T)) > 30) { markPx(x, y - 2); add(y, (g2) => ps(g2, k, x, y)); } }
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
    for (const [x, y] of [[0.8, 18.4], [11.6, 19.7], [14.1, 21.4], [2.4, 17.7], [16.4, 22.6]]) { markPx(x * T, y * T - 2); add(y * T, (g2) => ps(g2, 'schilf', x * T, y * T, x > 8)); }
    add(17.6 * T, (g2) => pier(g2, 7.5 * T, 17.5 * T, 21.0 * T));
    add(21.1 * T, (g2) => ps(g2, 'boot', 7.5 * T, 20.85 * T + 71));
    add(17.2 * T, (g2) => signpost(g2, 8.7 * T, 17.2 * T, 'Angelsteg'));
    // Wegweiser nach Sonnenfeld ganz rechts am Ende der Dorfstraße, zeigt aus dem Bild hinaus (später: mit dem Auto in die Stadt)
    add(15.1 * T, (g2) => signpost(g2, W * T - 60, 15.1 * T, 'Sonnenfeld'));
    for (const o of O.sort((a, b) => a.y - b.y)) o.fn(g);
    g.restore();
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

  return { MG, buildScene, blockedAt, waterAt, dspr, ps, danim, pixelText, pixelTextBox, inkWidth, houseCanvas, vehicleCanvas, iconCanvas, decoIconURL, canvasURL, dogHouse, catTree, merchant, merchantURL, plaque, onReady, lakeV, MINE_X,
    get ready() { return dReady; }, DATL };
})();

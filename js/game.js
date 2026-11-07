// ===== Spiellogik & Spielstand =====
'use strict';

const SAVE_KEY = 'farmspiel_v1';
const DECOR = [
  { id: 'haus',    name: 'Wohnhaus',      x: 0, y: 1,  w: 3, h: 3 },
  { id: 'tafel',   name: 'Auftragstafel', x: 0, y: 5,  w: 3, h: 2 },
  { id: 'scheune', name: 'Scheune',       x: 0, y: 8,  w: 3, h: 3 },
  { id: 'teich',   name: 'Teich',         x: 0, y: 12, w: 3, h: 2 },
];

let G; // der Spielstand

const idx = (x, y) => y * MAP_W + x;
const inMap = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
function parcelAt(x, y) {
  const px = Math.floor((x - PARCEL_X0) / PARCEL), py = Math.floor((y - PARCEL_Y0) / PARCEL);
  if (x < PARCEL_X0 || y < PARCEL_Y0 || px >= PARCEL_COLS || py >= PARCEL_ROWS) return null;
  return { px, py, i: py * PARCEL_COLS + px };
}
const owned = (x, y) => { const p = parcelAt(x, y); return !!p && G.parcels[p.i]; };
const tile = (x, y) => G.tiles[idx(x, y)];
const inv = (id) => G.inv[id] || 0;
const addInv = (id, n) => { G.inv[id] = inv(id) + n; };

function newGame() {
  G = {
    money: 40, xp: 0, level: 1, nextId: 1,
    tiles: Array.from({ length: MAP_W * MAP_H }, () => ({ s: 'grass', c: null, p: 0, b: null })),
    parcels: Array(PARCEL_COLS * PARCEL_ROWS).fill(false),
    buildings: {}, inv: {}, upgrades: {}, orders: [], claimed: {},
    stats: { plowed: 0, planted: 0, harvested: 0, earned: 0, orders: 0, produced: 0, parcels: 0, sold: 0 },
    lastSave: Date.now(),
  };
  for (const [px, py] of START_PARCELS) G.parcels[py * PARCEL_COLS + px] = true;
  // ein paar Startfelder schon gepflügt, damit man sofort loslegen kann
  for (let x = 5; x < 8; x++) for (let y = 3; y < 5; y++) tile(x, y).s = 'soil';
  while (G.orders.length < 3) G.orders.push(makeOrder());
}

function save() {
  G.lastSave = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) { /* privat-Modus o.ä. */ }
}

function load() {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) {}
  if (!raw) { newGame(); return 0; }
  try {
    G = JSON.parse(raw);
    const fresh = G; newGame(); const def = G; G = fresh;
    for (const k in def) if (G[k] === undefined) G[k] = def[k];
    for (const k in def.stats) if (G.stats[k] === undefined) G.stats[k] = 0;
  } catch (e) { newGame(); return 0; }
  if (!Number.isFinite(G.money)) G.money = 0;
  if (!Number.isFinite(G.xp)) G.xp = 0;
  boostMap = null;
  // Offline-Fortschritt: alles wächst weiter, solange man weg war (max. 8 Stunden)
  const away = Math.min((Date.now() - G.lastSave) / 1000, 8 * 3600);
  if (away > 5) update(away);
  return away;
}

function resetGame() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} newGame(); rebuildBoost(); }

// ---------- Multiplikatoren ----------
const upg = (id) => G.upgrades[id] || 0;
const growMul = () => 1 / (1 - 0.1 * upg('duenger'));
const prodMul = () => 1 / (1 - 0.1 * upg('futter'));
const priceMul = () => 1 + 0.1 * upg('haendler');
const sellPrice = (id) => Math.round(ITEMS[id].price * priceMul());

let boostMap = null; // welche Kacheln vom Sprinkler profitieren
function rebuildBoost() {
  boostMap = new Uint8Array(MAP_W * MAP_H);
  for (const b of Object.values(G.buildings)) {
    if (b.type !== 'sprinkler') continue;
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
      const x = b.x + dx, y = b.y + dy;
      if (inMap(x, y) && Math.abs(dx) + Math.abs(dy) <= 3) boostMap[idx(x, y)] = 1;
    }
  }
}

// ---------- Zeit vergeht ----------
function update(dt) {
  if (!boostMap) rebuildBoost();
  const gm = growMul();
  for (let i = 0; i < G.tiles.length; i++) {
    const t = G.tiles[i];
    if (t.c && t.p < 1) t.p = Math.min(1, t.p + dt * gm * (boostMap[i] ? 1.5 : 1) / CROPS[t.c].time);
  }
  const pm = prodMul();
  for (const b of Object.values(G.buildings)) {
    if (b.job && b.job.p < 1) b.job.p = Math.min(1, b.job.p + dt * pm / b.job.dur);
  }
  for (const o of G.orders) if (o.wait) { o.wait -= dt; }
  for (let i = 0; i < G.orders.length; i++) if (G.orders[i].wait !== undefined && G.orders[i].wait <= 0) G.orders[i] = makeOrder();
}

// ---------- XP & Level ----------
function gainXP(n, wx, wy) {
  G.xp += n;
  if (wx !== undefined) fxFloat(wx, wy - 14, '+' + n + ' XP', '#7fd4ff');
  while (G.xp >= xpForLevel(G.level)) {
    G.xp -= xpForLevel(G.level);
    G.level++;
    const bonus = 15 * G.level;
    G.money += bonus;
    onLevelUp(G.level, bonus);
  }
}
function unlocksAt(lvl) {
  const out = [];
  for (const [id, c] of Object.entries(CROPS)) if (c.level === lvl) out.push(ITEMS[id].icon + ' ' + ITEMS[id].name + ' (Saatgut)');
  for (const b of Object.values(BUILDINGS)) if (b.level === lvl) out.push(b.icon + ' ' + b.name);
  for (const u of Object.values(UPGRADES)) if (u.level === lvl) out.push(u.icon + ' ' + u.name + ' (Upgrade)');
  return out;
}
function addMoney(n, wx, wy) {
  G.money += n; G.stats.earned += n;
  if (wx !== undefined) fxFloat(wx, wy, '+' + n + ' 💰', '#ffd34d');
}

// ---------- Felder ----------
const usable = (x, y) => inMap(x, y) && owned(x, y) && !tile(x, y).b;

// Was würde ein Klick auf diese Kachel tun? (für Ziehen mit der Maus)
function actionFor(x, y, tool) {
  if (!usable(x, y)) return null;
  const t = tile(x, y);
  if (tool === 'schaufel') return t.c ? 'remove' : (t.s === 'soil' ? 'unplow' : null);
  if (t.c) return t.p >= 1 ? 'harvest' : null;
  if (t.s === 'grass') return 'plow';
  return 'plant';
}

function doAction(x, y, action, seed) {
  const t = tile(x, y), cx = x * TILE + TILE / 2, cy = y * TILE + TILE / 2;
  switch (action) {
    case 'plow':
      t.s = 'soil'; G.stats.plowed++; fxDust(cx, cy, '#8a5a32'); sfx('plow'); return true;
    case 'unplow':
      t.s = 'grass'; fxDust(cx, cy, '#5fae4a'); sfx('plow'); return true;
    case 'remove':
      t.c = null; t.p = 0; fxDust(cx, cy, '#5fae4a'); sfx('plow'); return true;
    case 'plant': {
      const c = CROPS[seed];
      if (!c || G.level < c.level) return false;
      if (G.money < c.cost) { toast('Nicht genug Geld für Saatgut!', 'bad'); return false; }
      G.money -= c.cost; t.c = seed; t.p = 0; G.stats.planted++;
      fxDust(cx, cy, '#6b4423'); sfx('plant'); return true;
    }
    case 'harvest': {
      const id = t.c, lucky = Math.random() < 0.08 * upg('glueck');
      const n = lucky ? 2 : 1;
      addInv(id, n); G.stats.harvested += n;
      t.c = null; t.p = 0;
      fxPop(cx, cy, ITEMS[id].icon, lucky ? 'x2!' : null);
      gainXP(CROPS[id].xp * n, cx, cy);
      sfx(lucky ? 'lucky' : 'harvest'); return true;
    }
  }
  return false;
}

// ---------- Gebäude ----------
function canPlace(type, x, y) {
  const d = BUILDINGS[type];
  for (let dx = 0; dx < d.w; dx++) for (let dy = 0; dy < d.h; dy++) {
    const tx = x + dx, ty = y + dy;
    if (!usable(tx, ty) || tile(tx, ty).c) return false;
  }
  return true;
}
function placeBuilding(type, x, y) {
  const d = BUILDINGS[type];
  if (G.level < d.level || G.money < d.cost || !canPlace(type, x, y)) return false;
  G.money -= d.cost;
  const id = G.nextId++;
  G.buildings[id] = { id, type, x, y, animals: d.kind === 'animal' ? 1 : 0, job: null };
  for (let dx = 0; dx < d.w; dx++) for (let dy = 0; dy < d.h; dy++) {
    const t = tile(x + dx, y + dy); t.b = id; t.s = 'grass';
  }
  if (type === 'sprinkler') rebuildBoost();
  sfx('build'); fxDust((x + d.w / 2) * TILE, (y + d.h / 2) * TILE, '#c8b28a', 18);
  return true;
}
function demolish(id) {
  const b = G.buildings[id], d = BUILDINGS[b.type];
  const refund = Math.round(d.cost * 0.5 + (b.animals > 1 ? (b.animals - 1) * d.animalCost * 0.5 : 0));
  for (let dx = 0; dx < d.w; dx++) for (let dy = 0; dy < d.h; dy++) tile(b.x + dx, b.y + dy).b = null;
  delete G.buildings[id];
  G.money += refund;
  if (b.type === 'sprinkler') rebuildBoost();
  toast(d.name + ' abgerissen (+' + refund + ' 💰)');
}
function buyAnimal(id) {
  const b = G.buildings[id], d = b && BUILDINGS[b.type];
  if (!d || d.kind !== 'animal' || b.animals >= d.maxAnimals) return;
  if (G.money < d.animalCost) { toast('Nicht genug Geld!', 'bad'); return; }
  G.money -= d.animalCost; b.animals++; sfx('animal');
}
const animalCount = () => Object.values(G.buildings).reduce((s, b) => s + (b.animals || 0), 0);

// Rezept eines Gebäudes (was es braucht / was es liefert)
function recipe(b) {
  const d = BUILDINGS[b.type];
  if (d.kind === 'animal') return { in: { [d.feed]: d.feedPer * b.animals }, out: d.out, qty: b.animals };
  return { in: d.in, out: d.out, qty: 1 };
}
const hasAll = (req) => Object.entries(req).every(([k, n]) => inv(k) >= n);

function startJob(b, quiet) {
  const d = BUILDINGS[b.type], r = recipe(b);
  if (!hasAll(r.in)) {
    if (!quiet) toast('Benötigt: ' + Object.entries(r.in).map(([k, n]) => n + ' ' + ITEMS[k].icon).join(' + '), 'bad');
    return false;
  }
  for (const [k, n] of Object.entries(r.in)) G.inv[k] -= n;
  b.job = { p: 0, dur: d.time, out: r.out, qty: r.qty };
  if (!quiet) sfx(d.kind === 'animal' ? 'animal' : 'build');
  return true;
}
function collect(b) {
  const d = BUILDINGS[b.type], j = b.job;
  const cx = (b.x + d.w / 2) * TILE, cy = (b.y + d.h / 2) * TILE;
  addInv(j.out, j.qty); G.stats.produced += j.qty;
  b.job = null;
  fxPop(cx, cy - 20, ITEMS[j.out].icon, j.qty > 1 ? 'x' + j.qty : null);
  gainXP(d.xp * j.qty, cx, cy - 20);
  sfx('harvest');
  startJob(b, true); // läuft automatisch weiter, wenn genug Futter/Zutaten da sind
}

// ---------- Handel ----------
function sell(id, n) {
  n = Math.min(n, inv(id)); if (n <= 0) return;
  G.inv[id] -= n; G.stats.sold += n;
  addMoney(sellPrice(id) * n);
  sfx('coin');
}
function buyUpgrade(id) {
  const u = UPGRADES[id], l = upg(id), cost = upgradeCost(id, l);
  if (l >= u.max || G.level < u.level || G.money < cost) return;
  G.money -= cost; G.upgrades[id] = l + 1; sfx('levelup');
}
function nextParcelInfo() { const k = G.stats.parcels; return { cost: parcelCost(k), level: parcelLevel(k + 1) }; }
function parcelBuyable(i) {
  if (G.parcels[i]) return false;
  const px = i % PARCEL_COLS, py = Math.floor(i / PARCEL_COLS);
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
    const nx = px + dx, ny = py + dy;
    return nx >= 0 && ny >= 0 && nx < PARCEL_COLS && ny < PARCEL_ROWS && G.parcels[ny * PARCEL_COLS + nx];
  });
}
function buyParcel(i) {
  const { cost, level } = nextParcelInfo();
  if (!parcelBuyable(i) || G.level < level || G.money < cost) return false;
  G.money -= cost; G.parcels[i] = true; G.stats.parcels++;
  sfx('levelup');
  const px = i % PARCEL_COLS, py = Math.floor(i / PARCEL_COLS);
  fxDust((PARCEL_X0 + px * PARCEL + 2) * TILE, (PARCEL_Y0 + py * PARCEL + 2) * TILE, '#ffe28a', 30);
  return true;
}

// ---------- Aufträge ----------
function orderPool() {
  const pool = Object.keys(CROPS).filter((id) => CROPS[id].level <= G.level);
  for (const b of Object.values(G.buildings)) {
    const o = BUILDINGS[b.type].out;
    if (o && !pool.includes(o)) pool.push(o);
  }
  return pool;
}
function makeOrder() {
  const pool = orderPool().sort(() => Math.random() - 0.5);
  const types = Math.min(pool.length, 1 + Math.floor(Math.random() * Math.min(3, 1 + G.level / 3)));
  const target = (15 + G.level * 22) * (0.7 + Math.random() * 0.6);
  const items = {}; let value = 0;
  for (let i = 0; i < types; i++) {
    const id = pool[i], q = Math.max(1, Math.min(8 + 2 * G.level, Math.round(target / types / ITEMS[id].price)));
    items[id] = q; value += q * ITEMS[id].price;
  }
  const names = ['Bäcker Bruno', 'Oma Hilde', 'Café Sonne', 'Markt Müller', 'Koch Luigi', 'Hotel Alpenblick', 'Familie Schmidt', 'Hofladen Lisa'];
  return { who: names[Math.floor(Math.random() * names.length)], items, money: Math.round(value * 1.6 + 10), xp: Math.round(value / 6) + 3 };
}
function completeOrder(i) {
  const o = G.orders[i];
  if (!o || o.wait !== undefined || !hasAll(o.items)) return;
  for (const [k, n] of Object.entries(o.items)) G.inv[k] -= n;
  addMoney(o.money); gainXP(o.xp); G.stats.orders++;
  sfx('coin'); toast('Auftrag erfüllt: +' + o.money + ' 💰  +' + o.xp + ' XP', 'good');
  G.orders[i] = { wait: 4 };
}
function skipOrder(i) { G.orders[i] = { wait: 20 }; }

// ---------- Meilensteine ----------
function statValue(stat) { return stat === 'animals' ? animalCount() : G.stats[stat]; }
const claimable = () => ACHIEVEMENTS.filter((a) => !G.claimed[a.id] && statValue(a.stat) >= a.goal);
function claim(id) {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a || G.claimed[id] || statValue(a.stat) < a.goal) return;
  G.claimed[id] = true; addMoney(a.money); gainXP(a.xp);
  sfx('levelup'); toast('🏆 ' + a.name + ': +' + a.money + ' 💰', 'good');
}

// ---------- Tutorial / nächstes Ziel ----------
const TUTORIAL = [
  { text: 'Klicke auf ein braunes Feld, um 🌾 Weizen zu pflanzen', done: () => G.stats.planted >= 1 },
  { text: 'Warte kurz und ernte den reifen Weizen mit einem Klick', done: () => G.stats.harvested >= 1 },
  { text: 'Tipp: Klicke auf Gras zum Pflügen – und halte die Maus gedrückt, um viele Felder auf einmal zu bearbeiten', done: () => G.stats.plowed >= 4 },
  { text: 'Erfülle einen Auftrag an der 📋 Auftragstafel', done: () => G.stats.orders >= 1 },
  { text: 'Erreiche Level 2 und baue einen 🐔 Hühnerstall (🏪 Shop)', done: () => Object.values(G.buildings).some((b) => b.type === 'huehnerstall') },
  { text: 'Füttere die Hühner mit Weizen: klicke auf den Stall', done: () => G.stats.produced >= 1 },
  { text: 'Kaufe ein neues Landstück: klicke auf ein eingezäuntes Feld', done: () => G.stats.parcels >= 1 },
];
function currentGoal() {
  const step = TUTORIAL.find((s) => !s.done());
  if (step) return step.text;
  for (let l = G.level + 1; l < 40; l++) {
    const u = unlocksAt(l);
    if (u.length) return 'Nächstes Ziel: Level ' + l + ' schaltet ' + u.join(', ') + ' frei';
  }
  return 'Baue deine Farm zum größten Hof im Land aus!';
}

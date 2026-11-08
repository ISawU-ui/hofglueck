// ===== Spiellogik & Spielstand =====
'use strict';

const SAVE_KEY = 'farmspiel_v1';
const NEWS_VERSION = 3; // erhöhen, wenn es für bestehende Spieler „Neu im Spiel“ zu zeigen gibt
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
    stats: { plowed: 0, planted: 0, harvested: 0, earned: 0, orders: 0, produced: 0, parcels: 0, sold: 0, fished: 0, foals: 0, projects: 0 },
    market: {}, town: {}, coats: {}, pond: { fish: POND.max, t: 0 },
    seen: NEWS_VERSION, introDone: false,
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
    if (G.seen === undefined) { G.seen = 1; G.introDone = true; } // Spielstand von vor dem Update
    for (const k in def) if (G[k] === undefined) G[k] = def[k];
    for (const k in def.stats) if (G.stats[k] === undefined) G.stats[k] = 0;
    for (const b of Object.values(G.buildings)) if (!BUILDINGS[b.type]) delete G.buildings[b.id];
    G.tiles.forEach((t) => { if (t.b && !G.buildings[t.b]) t.b = null; });
  } catch (e) { newGame(); return 0; }
  if (!Number.isFinite(G.money)) G.money = 0;
  if (!Number.isFinite(G.xp)) G.xp = 0;
  boostMap = null;
  // Offline-Fortschritt: alles wächst weiter, solange man weg war (max. 8 Stunden)
  const away = Math.max(0, Math.min((Date.now() - G.lastSave) / 1000, 8 * 3600));
  if (away > 5) update(away);
  return away;
}

function resetGame() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} newGame(); rebuildBoost(); }

// ---------- Multiplikatoren ----------
const upg = (id) => G.upgrades[id] || 0;
const growMul = () => 1 / (1 - DUENGER_STEP * upg('duenger'));
const prodMul = () => 1 / (1 - FUTTER_STEP * upg('futter'));
const built = (id) => !!G.town[id];
const priceMul = () => 1 + 0.1 * upg('haendler') + (built('festplatz') ? 0.1 : 0);
const xpMul = () => 1 + (built('schule') ? 0.1 : 0) + (built('rathaus') ? 0.15 : 0);
const orderMul = () => built('kirche') ? 1.2 : 1;
const orderSlots = () => 3 + (built('brunnen') ? 1 : 0) + (built('festplatz') ? 1 : 0);
const mSize = () => marketSize(G.level, built('markt') ? 1.5 : 1);
// Markt: aktueller Preis-Faktor einer Ware (1 = voller Preis)
const marketFactor = (id) => 1 - Math.min(1 - MARKET.minFactor, G.market[id] || 0);
const sellPrice = (id) => Math.max(1, Math.round(ITEMS[id].price * priceMul() * marketFactor(id)));
// was n Stück jetzt zusammen bringen würden (jedes Stück drückt den Preis ein wenig)
function sellValue(id, n) {
  let sat = G.market[id] || 0, sum = 0;
  const base = ITEMS[id].price * priceMul(), step = ITEMS[id].price / mSize(), cap = 1 - MARKET.minFactor;
  for (let i = 0; i < n; i++) { sum += Math.max(1, Math.round(base * (1 - Math.min(cap, sat)))); sat = Math.min(cap, sat + step); }
  return { sum, sat };
}

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
    if (t.c && t.p < 1) t.p = Math.min(1, t.p + dt * gm * (boostMap[i] ? SPRINKLER_BOOST : 1) / CROPS[t.c].time);
  }
  const pm = prodMul();
  for (const b of Object.values(G.buildings)) {
    if (b.job && b.job.p < 1) b.job.p = Math.min(1, b.job.p + dt * pm / b.job.dur);
  }
  for (const id in G.market) { G.market[id] -= dt * (1 - MARKET.minFactor) / MARKET.recover; if (G.market[id] <= 0) delete G.market[id]; }
  const pd = G.pond;
  if (pd.fish < POND.max) { pd.t += dt; while (pd.t >= POND.regen && pd.fish < POND.max) { pd.t -= POND.regen; pd.fish++; } }
  if (pd.fish >= POND.max) pd.t = 0;
  while (G.orders.length < orderSlots()) G.orders.push({ wait: 3 });
  for (const o of G.orders) if (o.wait) { o.wait -= dt; }
  for (let i = 0; i < G.orders.length; i++) if (G.orders[i].wait !== undefined && G.orders[i].wait <= 0) G.orders[i] = makeOrder();
}

// ---------- XP & Level ----------
function gainXP(n, wx, wy) {
  n = Math.round(n * xpMul());
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
  for (const t of Object.values(PROJECTS)) if (t.level === lvl) out.push(t.icon + ' ' + t.name + ' (Stadt)');
  if (lvl === POND.level) out.push('🎣 Angeln am Teich');
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
  if (t.c && t.p >= 1) return 'harvest'; // Reifes wird immer geerntet, egal mit welchem Werkzeug
  if (tool === 'hand') return null;      // Hand: nur umsehen, nichts säen
  if (tool === 'schaufel') return t.c ? 'remove' : (t.s === 'soil' ? 'unplow' : null);
  if (t.c) return null;
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
    case 'remove': { // aus Versehen gesät? Saatgut gibt es zurück
      const back = CROPS[t.c] ? CROPS[t.c].cost : 0;
      t.c = null; t.p = 0; fxDust(cx, cy, '#5fae4a'); sfx('plow');
      if (back) { G.money += back; fxFloat(cx, cy, '+' + back + ' 💰 zurück', '#ffd34d'); }
      return true;
    }
    case 'plant': {
      const c = CROPS[seed];
      if (!c || G.level < c.level) return false;
      if (G.money < c.cost) { toast('Nicht genug Geld für Saatgut!', 'bad'); return false; }
      G.money -= c.cost; t.c = seed; t.p = 0; G.stats.planted++;
      fxDust(cx, cy, '#6b4423'); sfx('plant'); return true;
    }
    case 'harvest': {
      const id = t.c, lucky = Math.random() < GLUECK_STEP * upg('glueck');
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
  const b = G.buildings[id] = { id, type, x, y, animals: d.kind === 'animal' ? 1 : 0, job: null };
  if (d.kind === 'horse') { b.horses = [randomCoat(0)]; b.foal = null; G.coats[b.horses[0]] = true; }
  for (let dx = 0; dx < d.w; dx++) for (let dy = 0; dy < d.h; dy++) {
    const t = tile(x + dx, y + dy); t.b = id; t.s = 'grass';
  }
  if (d.kind === 'tree') startJob(b, true);
  if (type === 'sprinkler') rebuildBoost();
  sfx('build'); fxDust((x + d.w / 2) * TILE, (y + d.h / 2) * TILE, '#c8b28a', 18);
  return true;
}
function demolishRefund(b) {
  const d = BUILDINGS[b.type];
  const extra = d.kind === 'horse' ? Math.max(0, b.horses.length - 1) * d.animalCost : b.animals > 1 ? (b.animals - 1) * d.animalCost : 0;
  return Math.round(d.cost * 0.5 + extra * 0.5);
}
function demolish(id) {
  const b = G.buildings[id]; if (!b) return;
  const d = BUILDINGS[b.type], refund = demolishRefund(b);
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
const animalCount = () => Object.values(G.buildings).reduce((s, b) => s + (b.horses ? b.horses.length : b.animals || 0), 0);
const animalsIn = (b) => b.horses ? b.horses.length : b.animals;

// ---------- Pferdezucht ----------
function pick(list) { let r = Math.random() * list.reduce((s, x) => s + x.weight, 0); for (const x of list) if ((r -= x.weight) < 0) return x; return list[0]; }
function randomCoat(maxTier = 3) {
  const tier = COAT_TIERS.indexOf(pick(COAT_TIERS.filter((t, i) => i <= maxTier)));
  const ids = Object.keys(COATS).filter((c) => COATS[c].tier === tier);
  return ids[Math.floor(Math.random() * ids.length)];
}
function breedCoat(horses) { // 40 %: wie ein Elternteil, sonst neue Zufallsfarbe
  if (Math.random() < 0.4) return horses[Math.floor(Math.random() * horses.length)];
  return randomCoat(3);
}
const horseValue = (coat) => Math.round(COAT_TIERS[COATS[coat].tier].value * (built('reitschule') ? 1.5 : 1));
function buyHorse(id) {
  const b = G.buildings[id], d = b && BUILDINGS[b.type];
  if (!d || d.kind !== 'horse' || b.horses.length >= d.maxAnimals) return;
  if (G.money < d.animalCost) { toast('Nicht genug Geld!', 'bad'); return; }
  G.money -= d.animalCost; const c = randomCoat(0); b.horses.push(c); G.coats[c] = true; sfx('animal');
}
function keepFoal(id) {
  const b = G.buildings[id]; if (!b || !b.foal || b.horses.length >= BUILDINGS[b.type].maxAnimals) return;
  b.horses.push(b.foal); b.foal = null; sfx('animal'); startJob(b, true);
}
function sellFoal(id) {
  const b = G.buildings[id]; if (!b || !b.foal) return;
  addMoney(horseValue(b.foal)); b.foal = null; sfx('coin'); startJob(b, true);
}
function sellHorse(id, i) {
  const b = G.buildings[id]; if (!b || !b.horses[i]) return;
  const [c] = b.horses.splice(i, 1); addMoney(horseValue(c)); sfx('coin');
}

// Rezept eines Gebäudes (was es braucht / was es liefert)
function recipe(b) {
  const d = BUILDINGS[b.type];
  if (d.kind === 'animal') return { in: { [d.feed]: d.feedPer * b.animals }, out: d.out, qty: b.animals };
  if (d.kind === 'tree') return { in: {}, out: d.out, qty: d.qty };
  if (d.kind === 'horse') return { in: d.in, out: 'fohlen', qty: 1 };
  return { in: d.in, out: d.out, qty: 1 };
}
const hasAll = (req) => Object.entries(req).every(([k, n]) => inv(k) >= n);

function canBreed(b) { return b.horses.length >= 2 && !b.foal; }
function startJob(b, quiet) {
  const d = BUILDINGS[b.type], r = recipe(b);
  if (b.job) return false;
  if (d.kind === 'horse' && !canBreed(b)) {
    if (!quiet) toast(b.foal ? 'Entscheide erst, was mit dem Fohlen passiert' : 'Zum Züchten brauchst du 2 Pferde', 'bad');
    return false;
  }
  if (!hasAll(r.in)) {
    if (!quiet) toast('Benötigt: ' + Object.entries(r.in).map(([k, n]) => n + ' ' + ITEMS[k].icon).join(' + '), 'bad');
    return false;
  }
  for (const [k, n] of Object.entries(r.in)) G.inv[k] -= n;
  b.job = { p: 0, dur: d.time, out: r.out, qty: r.qty };
  if (!quiet) sfx(d.kind === 'animal' || d.kind === 'horse' ? 'animal' : 'build');
  return true;
}
function collect(b) {
  const d = BUILDINGS[b.type], j = b.job;
  if (!j || j.p < 1) return;
  const cx = (b.x + d.w / 2) * TILE, cy = (b.y + d.h / 2) * TILE;
  if (d.kind === 'horse') { // Fohlen: Spieler entscheidet (behalten / verkaufen)
    b.job = null; b.foal = breedCoat(b.horses); G.stats.foals++;
    const isNew = !G.coats[b.foal]; G.coats[b.foal] = true;
    gainXP(d.xp, cx, cy - 20); sfx('lucky');
    onFoal(b, isNew);
    return;
  }
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
  const { sum, sat } = sellValue(id, n);
  G.inv[id] -= n; G.stats.sold += n; G.market[id] = sat;
  addMoney(sum);
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
  if (G.stats.fished >= 3) pool.push('fisch');
  return pool;
}
// Ab welchem Level es eine Ware gibt (Aufträge wählen Neues öfter als Weizen)
function itemLevel(id) {
  if (CROPS[id]) return CROPS[id].level;
  if (id === 'fisch') return POND.level;
  let l = 99;
  for (const d of Object.values(BUILDINGS)) if (d.out === id) l = Math.min(l, d.level);
  return l === 99 ? 1 : l;
}
function makeOrder() {
  const pool = orderPool();
  const types = Math.min(pool.length, 1 + Math.floor(Math.random() * Math.min(3, 1 + G.level / 3)));
  const target = (15 + G.level * 22) * (0.7 + Math.random() * 0.6);
  const maxQ = 3 + Math.floor(G.level / 2); // höchstens so viele Stück pro Ware – sonst bestehen Aufträge aus Bergen Weizen
  const left = pool.map((id) => ({ id, w: itemLevel(id) + 2 })); // Gewicht: später freigeschaltete Waren kommen öfter
  const items = {}; let value = 0;
  for (let i = 0; i < types; i++) {
    let r = Math.random() * left.reduce((sum, x) => sum + x.w, 0), k = 0;
    while (k < left.length - 1 && (r -= left[k].w) >= 0) k++;
    const id = left.splice(k, 1)[0].id;
    const q = Math.max(1, Math.min(maxQ, Math.round(target / types / ITEMS[id].price)));
    items[id] = q; value += q * ITEMS[id].price;
  }
  const names = ['Bäcker Bruno', 'Oma Hilde', 'Café Sonne', 'Markt Müller', 'Koch Luigi', 'Hotel Alpenblick', 'Familie Schmidt', 'Hofladen Lisa'];
  return { who: names[Math.floor(Math.random() * names.length)], items, money: Math.round(value * 1.6 + 10), xp: Math.round(value / 5) + 4 };
}
function completeOrder(i) {
  const o = G.orders[i];
  if (!o || o.wait !== undefined || !hasAll(o.items)) return;
  for (const [k, n] of Object.entries(o.items)) G.inv[k] -= n;
  const money = Math.round(o.money * orderMul());
  addMoney(money); gainXP(o.xp); G.stats.orders++;
  sfx('coin'); toast('Auftrag erfüllt: +' + money + ' 💰  +' + Math.round(o.xp * xpMul()) + ' XP', 'good');
  G.orders[i] = { wait: 4 };
}
function skipOrder(i) { G.orders[i] = { wait: 20 }; }

// ---------- Meilensteine ----------
function statValue(stat) { return stat === 'animals' ? animalCount() : stat === 'coats' ? Object.keys(G.coats).length : G.stats[stat] || 0; }
const claimable = () => ACHIEVEMENTS.filter((a) => !G.claimed[a.id] && statValue(a.stat) >= a.goal);
function claim(id) {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a || G.claimed[id] || statValue(a.stat) < a.goal) return;
  G.claimed[id] = true; addMoney(a.money); gainXP(a.xp);
  sfx('levelup'); toast('🏆 ' + a.name + ': +' + a.money + ' 💰', 'good');
}

// ---------- Teich ----------
function catchFish() {
  if (G.pond.fish <= 0) return null;
  G.pond.fish--; const f = pick(FISH).id;
  addInv(f, 1); G.stats.fished++;
  const d = DECOR.find((x) => x.id === 'teich');
  gainXP(POND.xp, (d.x + d.w / 2) * TILE, d.y * TILE + 10);
  return f;
}

// ---------- Stadt ----------
function projectState(id) {
  const t = PROJECTS[id];
  if (built(id)) return 'built';
  if (G.level < t.level) return 'locked';
  return G.money >= t.cost && hasAll(t.items) ? 'ready' : 'open';
}
function buildProject(id) {
  const t = PROJECTS[id];
  if (projectState(id) !== 'ready') return false;
  G.money -= t.cost;
  for (const [k, n] of Object.entries(t.items)) G.inv[k] -= n;
  G.town[id] = true; G.stats.projects++;
  const l = t.lot, cx = (TOWN_X0 + l.x + l.w / 2) * TILE, cy = (l.y + l.h / 2) * TILE;
  fxDust(cx, cy, '#ffe28a', 34); gainXP(20 + t.level * 6, cx, cy);
  sfx('levelup');
  return true;
}

// ---------- Tutorial / nächstes Ziel ----------
const isTouch = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const TAP = () => isTouch() ? 'Tippe' : 'Klicke';
const TUTORIAL = [
  { text: () => TAP() + ' auf ein braunes Feld, um 🌾 Weizen zu säen', done: () => G.stats.planted >= 1, target: 'soil' },
  { text: () => 'Warte, bis der Weizen reif ist (✨) – dann ' + TAP().toLowerCase() + ' ihn an zum Ernten', done: () => G.stats.harvested >= 1, target: 'crop' },
  { text: () => isTouch() ? 'Tippe auf Gras für neue Felder – oder wische über mehrere Felder auf einmal' : 'Klicke auf Gras für neue Felder – oder halte die Maus gedrückt und ziehe über viele Felder', done: () => G.stats.plowed >= 4, target: 'grass' },
  { text: () => 'Bring Waren zur 📋 Auftragstafel – Aufträge zahlen mehr als der Verkauf', done: () => G.stats.orders >= 1, target: 'tafel' },
  { text: () => 'Ab Level 2: Baue einen 🐔 Hühnerstall (🏪 Shop)', done: () => Object.values(G.buildings).some((b) => b.type === 'huehnerstall'), target: 'shop' },
  { text: () => TAP() + ' auf den Hühnerstall, um die Hühner mit Weizen zu füttern', done: () => G.stats.produced >= 1, target: 'stall' },
  { text: () => 'Kaufe ein neues Landstück: ' + TAP().toLowerCase() + ' auf ein Holzschild am Zaun', done: () => G.stats.parcels >= 1, target: 'parcel' },
];
const tutorialStep = () => TUTORIAL.find((s) => !s.done());
function currentGoal() {
  const step = tutorialStep();
  if (step) return step.text();
  for (let l = G.level + 1; l < 40; l++) {
    const u = unlocksAt(l);
    if (u.length) return 'Nächstes Ziel: Level ' + l + ' schaltet ' + u.join(', ') + ' frei';
  }
  return 'Baue deine Farm zum größten Hof im Land aus!';
}

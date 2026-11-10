// ===== Spiellogik & Spielstand =====
'use strict';

const SAVE_KEY = 'farmspiel_v1';
const NEWS_VERSION = 4; // erhöhen, wenn es für bestehende Spieler „Neu im Spiel“ zu zeigen gibt
const MAP_VERSION = 6;  // Update 6: neue Karte (40 × 27) – ältere Spielstände werden beim Laden umgezogen

let G; // der Spielstand

const idx = (x, y) => y * MAP_W + x;
const inMap = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
const inRect = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
// Landstück-Nummer je Kachel (−1 = kein Landstück)
const PIDX = new Int8Array(MAP_W * MAP_H).fill(-1);
PARCELS.forEach((p, i) => { for (let dx = 0; dx < p.w; dx++) for (let dy = 0; dy < p.h; dy++) PIDX[(p.y + dy) * MAP_W + p.x + dx] = i; });
function parcelAt(x, y) { if (!inMap(x, y)) return null; const i = PIDX[idx(x, y)]; return i < 0 ? null : { i, p: PARCELS[i] }; }
const owned = (x, y) => { const p = parcelAt(x, y); return !!p && G.parcels[p.i]; };
const tile = (x, y) => G.tiles[idx(x, y)];
const inv = (id) => G.inv[id] || 0;
const addInv = (id, n) => { G.inv[id] = inv(id) + n; };
// Wege und feste Dinge (dort wird nichts gebaut, keine Deko)
function isRoad(x, y) {
  const f = FARM;
  return (y === f.road.y && x >= f.road.x0) || (x === f.stegweg.x && y >= f.stegweg.y0 && y <= f.stegweg.y1)
    || (x === f.minenweg.x && y >= f.minenweg.y0 && y <= f.minenweg.y1) || inRect(f.link, x, y);
}
// Haus: nur die Felder, die das aktuelle Hausbild wirklich bedeckt (Häuschen ist schmaler als das Landhaus)
const houseRect = () => (typeof houseRectDyn === 'function' && houseRectDyn()) || FARM_OBJ[0];
const farmObjAt = (x, y) => FARM_OBJ.find((o) => inRect(o.id === 'haus' ? houseRect() : o, x, y));
const isBed = (x, y) => FARM.beds.some(([bx, by]) => bx === x && by === y);
const zoneAt = (x, y) => DECO_ZONES.find((z) => inRect(z, x, y));
const farmObj = (id) => FARM_OBJ.find((o) => o.id === id);

function blankTiles() { return Array.from({ length: MAP_W * MAP_H }, () => ({ s: 'grass', c: null, p: 0, b: null })); }
function newGame() {
  G = {
    ver: MAP_VERSION, money: 40, xp: 0, level: 1, nextId: 1,
    tiles: blankTiles(),
    parcels: PARCELS.map(() => false),
    buildings: {}, inv: {}, upgrades: {}, orders: [], claimed: {},
    stats: { plowed: 0, planted: 0, harvested: 0, earned: 0, orders: 0, produced: 0, parcels: 0, sold: 0, fished: 0, foals: 0, projects: 0, mined: 0, boated: 0 },
    market: {}, town: {}, coats: {}, pond: { fish: POND.max, t: 0 },
    boat: { fish: BOAT.max, t: 0 }, mine: { open: false, finds: MINE.max, t: 0 },
    deco: {}, decoStore: {}, pets: {}, trader: { day: '', sold: false },
    house: { type: 'haeuschen', wall: 'weiss', roof: 'rot', door: 'holz', win: 'klein', have: { type: ['haeuschen'], wall: ['weiss'], roof: ['rot'], door: ['holz'], win: ['klein'] } },
    car: { cur: null, have: [] },
    seen: NEWS_VERSION, introDone: false,
    lastSave: Date.now(),
  };
  for (const i of START_PARCELS) G.parcels[i] = true;
  // sechs Startfelder schon gepflügt, damit man sofort loslegen kann
  const p0 = PARCELS[0];
  for (let x = p0.x + 1; x < p0.x + 4; x++) for (let y = p0.y + 1; y < p0.y + 3; y++) tile(x, y).s = 'soil';
  startDeco();
  while (G.orders.length < 3) G.orders.push(makeOrder());
}
// Hofplatz am ersten Tag: drei kleine Dinge + eine Blume im Beet (alles verschieb- und einlagerbar)
function startDeco() {
  for (const [id, x, y] of [['fass', 9, 6], ['schubkarre', 12, 8], ['kisten', 13, 10], ['lilie', 4, 6]]) addDecoAt(id, x, y);
}

// ---------- Spielstände: 3 Plätze ----------
// Platz 1 benutzt den alten Schlüssel → bestehende Spielstände sind automatisch „Spielstand 1“.
const SLOT_KEY = 'farmspiel_slot';
const SLOTS = 3;
// Testmodus (für Marvin zum Ausprobieren): eigener Speicherplatz, höchstes Level, alles freigeschaltet, unendlich Geld.
// Die echten Spielstände 1–3 werden dabei nie angefasst.
const TEST_SLOT = 9, TEST_LEVEL = 30, TEST_MONEY = 999999999;
let slot = 1;
try { const v = parseInt(localStorage.getItem(SLOT_KEY), 10) || 1; slot = v === TEST_SLOT ? TEST_SLOT : Math.min(SLOTS, Math.max(1, v)); } catch (e) {}
const slotKey = (n) => n === 1 ? SAVE_KEY : n === TEST_SLOT ? SAVE_KEY + '_test' : SAVE_KEY + '_s' + n;
// Testhof: höchstes Level, alle Waren reichlich, Freischalt-Bedingungen erfüllt, Einführung übersprungen
function applyTestMode(fresh) {
  G.test = true; G.money = TEST_MONEY; G.introDone = true; G.seen = NEWS_VERSION; G.tutSkip = true;
  if (G.level < TEST_LEVEL) { G.level = TEST_LEVEL; G.xp = 0; }
  if (fresh) {
    for (const id of Object.keys(ITEMS)) G.inv[id] = Math.max(G.inv[id] || 0, 999);
    G.stats.fished = Math.max(G.stats.fished, 999); G.stats.boated = Math.max(G.stats.boated, 99);
  }
}
function slotInfo(n) {
  try {
    const raw = localStorage.getItem(slotKey(n)); if (!raw) return null;
    const g = JSON.parse(raw);
    return { level: g.level || 1, money: g.money || 0, last: g.lastSave || 0 };
  } catch (e) { return null; }
}
function switchSlot(n) { // speichert den aktuellen Hof und lädt Platz n (leer = neues Spiel)
  save();
  slot = n; try { localStorage.setItem(SLOT_KEY, String(n)); } catch (e) {}
  return load();
}
// Spielstand löschen: ein anderer Platz wird einfach leer, der aktive beginnt sofort neu
function deleteSlot(n) {
  try { localStorage.removeItem(slotKey(n)); } catch (e) {}
  if (n === slot) { newGame(); if (n === TEST_SLOT) applyTestMode(true); rebuildBoost(); save(); }
}

function save() {
  G.lastSave = Date.now();
  try { localStorage.setItem(slotKey(slot), JSON.stringify(G)); } catch (e) { /* privat-Modus o.ä. */ }
}

function load() {
  let raw = null;
  try { raw = localStorage.getItem(slotKey(slot)); } catch (e) {}
  if (!raw) { newGame(); if (slot === TEST_SLOT) applyTestMode(true); return 0; }
  try {
    G = JSON.parse(raw);
    const fresh = G; newGame(); const def = G; G = fresh;
    const oldMap = !G.ver || G.ver < MAP_VERSION || (G.tiles && G.tiles.length !== MAP_W * MAP_H); // vor dem Auffüllen prüfen!
    if (G.seen === undefined) { G.seen = 1; G.introDone = true; } // Spielstand von vor dem Update
    for (const k in def) if (G[k] === undefined) G[k] = def[k];
    for (const k in def.stats) if (G.stats[k] === undefined) G.stats[k] = 0;
    if (oldMap) migrateMap(def);
    for (const k of ['boat', 'mine', 'trader', 'house', 'car']) if (!G[k] || typeof G[k] !== 'object') G[k] = def[k];
    for (const k in def.house) if (G.house[k] === undefined) G.house[k] = def.house[k];
    for (const b of Object.values(G.buildings)) if (!BUILDINGS[b.type]) delete G.buildings[b.id];
    for (const d of Object.values(G.deco)) if (!DECO[d.t]) delete G.deco[d.id];
    G.tiles.forEach((t) => { if (t.b && !G.buildings[t.b]) t.b = null; if (t.d && !G.deco[t.d]) t.d = null; });
    refitDeco();
  } catch (e) { console.error(e); newGame(); return 0; }
  if (!Number.isFinite(G.money)) G.money = 0;
  if (!Number.isFinite(G.xp)) G.xp = 0;
  if (slot === TEST_SLOT) applyTestMode(false); else G.test = false;
  boostMap = null;
  // Offline-Fortschritt: alles wächst weiter, solange man weg war (max. 8 Stunden)
  const away = Math.max(0, Math.min((Date.now() - G.lastSave) / 1000, 8 * 3600));
  if (away > 5) update(away);
  return away;
}

function resetGame() { try { localStorage.removeItem(slotKey(slot)); } catch (e) {} newGame(); rebuildBoost(); }

// ---------- Umzug alter Spielstände auf die neue Karte (Update 6) ----------
// Alte Landstück-Reihen 1 + 2 rücken 10 nach rechts und 3 nach unten, Reihe 3 rückt unter die Dorfstraße (4 nach unten).
// Gebäude, die so nicht mehr passen (z. B. über der Straße), suchen sich einen freien Platz auf eigenem Land –
// gibt es keinen, wird der volle Preis erstattet.
function migrateMap(def) {
  const oldTiles = G.tiles || [], oldParcels = G.parcels || [], oldB = G.buildings || {};
  const shift = (ox, oy) => { const r = Math.floor((oy - OLD.Y0) / OLD.PARCEL); return { x: ox + 10, y: oy + (r >= 2 ? 4 : 3) }; };
  G.tiles = blankTiles(); G.parcels = PARCELS.map(() => false);
  for (const i of START_PARCELS) G.parcels[i] = true;
  // Landstücke: jedes neue Stück, das ein altes gekauftes Stück überdeckt, gehört dir
  oldParcels.forEach((own, i) => {
    if (!own) return;
    const c = i % OLD.COLS, r = Math.floor(i / OLD.COLS), a = shift(OLD.X0 + c * 4, OLD.Y0 + r * 4);
    PARCELS.forEach((p, k) => { if (a.x < p.x + p.w && a.x + 4 > p.x && a.y < p.y + p.h && a.y + 4 > p.y) G.parcels[k] = true; });
  });
  // Felder und Pflanzen
  for (let oy = OLD.Y0; oy < OLD.Y0 + OLD.ROWS * 4; oy++) for (let ox = OLD.X0; ox < OLD.X0 + OLD.COLS * 4; ox++) {
    const t = oldTiles[oy * OLD.MAP_W + ox]; if (!t) continue;
    const n = shift(ox, oy); if (!inMap(n.x, n.y) || !owned(n.x, n.y)) continue;
    const nt = tile(n.x, n.y); nt.s = t.s === 'soil' ? 'soil' : 'grass'; nt.c = t.c && CROPS[t.c] ? t.c : null; nt.p = t.p || 0;
  }
  // Gebäude
  G.buildings = {}; const refunds = [];
  for (const b of Object.values(oldB)) {
    const d = BUILDINGS[b.type]; if (!d) continue;
    let pos = shift(b.x, b.y);
    if (!spotFree(b.type, pos.x, pos.y)) pos = nearestSpot(b.type, pos.x, pos.y);
    if (!pos) { G.money += d.cost; refunds.push(d.name); continue; }
    b.x = pos.x; b.y = pos.y; G.buildings[b.id] = b;
    for (let dx = 0; dx < d.w; dx++) for (let dy = 0; dy < d.h; dy++) { const t = tile(b.x + dx, b.y + dy); t.b = b.id; t.s = 'grass'; t.c = null; }
  }
  G.stats.parcels = Math.max(0, G.parcels.filter(Boolean).length - START_PARCELS.length);
  G.deco = {}; G.decoStore = {}; G.pets = {};
  G.house = JSON.parse(JSON.stringify(def.house));
  if (G.level >= HOUSES.familienhaus.lv) { G.house.type = 'familienhaus'; G.house.have.type.push('familienhaus'); } // wer schon weit ist, behält ein großes Haus
  G.car = { cur: null, have: [] };
  startDeco();
  G.ver = MAP_VERSION; G.moved = { refunds };
  boostMap = null;
}
// Platz für ein Gebäude frei? (ohne Geld/Level zu prüfen – für Umzug und Bauen)
function spotFree(type, x, y) {
  const d = BUILDINGS[type];
  for (let dx = 0; dx < d.w; dx++) for (let dy = 0; dy < d.h; dy++) {
    const tx = x + dx, ty = y + dy;
    if (!inMap(tx, ty) || !owned(tx, ty)) return false;
    const t = tile(tx, ty); if (t.b || t.c || t.d) return false;
  }
  return true;
}
function nearestSpot(type, x0, y0) {
  let best = null, bd = 1e9;
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (!spotFree(type, x, y)) continue;
    const dd = (x - x0) ** 2 + (y - y0) ** 2; if (dd < bd) { bd = dd; best = { x, y }; }
  }
  return best;
}

// ---------- Multiplikatoren ----------
const upg = (id) => G.upgrades[id] || 0;
const growMul = () => 1 / (1 - DUENGER_STEP * upg('duenger'));
const prodMul = () => 1 / (1 - FUTTER_STEP * upg('futter'));
const built = (id) => TOWN_ON && !!G.town[id]; // Stadt aus: keine Projekte, keine Boni (Daten bleiben gespeichert)
const priceMul = () => 1 + 0.1 * upg('haendler') + (built('festplatz') ? 0.1 : 0);
const xpMul = () => 1 + (built('schule') ? 0.1 : 0) + (built('rathaus') ? 0.15 : 0);
const orderMul = () => built('kirche') ? 1.2 : 1; // Autos sind vorerst nur Deko
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
  if (G.test) G.money = TEST_MONEY; // Testmodus: Geld geht nie aus
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
  regen(G.boat, BOAT, dt); if (G.mine.open) regen(G.mine, MINE, dt, 'finds');
  while (G.orders.length < orderSlots()) G.orders.push({ wait: 3 });
  for (const o of G.orders) if (o.wait) { o.wait -= dt; }
  for (let i = 0; i < G.orders.length; i++) if (G.orders[i].wait !== undefined && G.orders[i].wait <= 0) G.orders[i] = makeOrder();
}

function regen(o, cfg, dt, key = 'fish') {
  if (o[key] < cfg.max) { o.t += dt; while (o.t >= cfg.regen && o[key] < cfg.max) { o.t -= cfg.regen; o[key]++; } }
  if (o[key] >= cfg.max) o.t = 0;
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
  if (TOWN_ON) for (const t of Object.values(PROJECTS)) if (t.level === lvl) out.push(t.icon + ' ' + t.name + ' (Stadt)');
  if (lvl === POND.level) out.push('🎣 Angeln am See');
  if (lvl === BOAT.level) out.push('🚣 Ruderboot: seltene Fische');
  if (lvl === MINE.level) out.push('⛏️ Altes Bergwerk');
  const land = PARCELS.filter((p) => p.lv === lvl && lvl > 1).length;
  if (land) out.push('🗺️ ' + (land > 1 ? land + ' neue Landstücke' : 'Neues Landstück') + ' kaufbar');
  const deco = Object.values(DECO).filter((d) => d.lv === lvl && d.kind !== 'trader' && !d.start && !d.free && !d.stat);
  if (deco.length) out.push('🌼 Deko: ' + deco.map((d) => d.name).join(', '));
  for (const [id, h] of Object.entries(HOUSES)) if (h.lv === lvl && h.price) out.push('🏠 ' + h.name + ' (Haus-Ausbau)');
  for (const [kind, list] of Object.entries(HOUSE_PARTS)) for (const [, p] of Object.entries(list)) if (p[1] === lvl && p[2]) out.push('🏠 ' + PART_LABEL[kind] + ': ' + p[0]);
  for (const c of Object.values(CARS)) if (c.lv === lvl) out.push('🚗 ' + c.name);
  return out;
}
function addMoney(n, wx, wy) {
  G.money += n; G.stats.earned += n;
  if (wx !== undefined) fxFloat(wx, wy, '+' + n + ' 💰', '#ffd34d');
}

// ---------- Felder ----------
const usable = (x, y) => inMap(x, y) && owned(x, y) && !tile(x, y).b && !tile(x, y).d;

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
// ignore = Gebäude, das gerade verschoben wird (sein alter Platz zählt als frei)
function canPlace(type, x, y, ignore) {
  const d = BUILDINGS[type];
  for (let dx = 0; dx < d.w; dx++) for (let dy = 0; dy < d.h; dy++) {
    const tx = x + dx, ty = y + dy;
    if (!inMap(tx, ty) || !owned(tx, ty)) return false;
    const t = tile(tx, ty);
    if ((t.b && t.b !== ignore) || t.d || t.c) return false;
  }
  return true;
}
// Gebäude/Baum versetzen (Marvins Wunsch): Tiere, Arbeit und Wachstum laufen einfach weiter
function moveBuilding(id, x, y) {
  const b = G.buildings[id]; if (!b) return false;
  const d = BUILDINGS[b.type]; if (!canPlace(b.type, x, y, id)) return false;
  for (let dx = 0; dx < d.w; dx++) for (let dy = 0; dy < d.h; dy++) tile(b.x + dx, b.y + dy).b = null;
  b.x = x; b.y = y;
  for (let dx = 0; dx < d.w; dx++) for (let dy = 0; dy < d.h; dy++) { const t = tile(x + dx, y + dy); t.b = id; t.s = 'grass'; }
  rebuildBoost(); sfx('build');
  fxDust((x + d.w / 2) * TILE, (y + d.h / 2) * TILE, '#ffe9a8', 12);
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
// Landstücke: jedes hat sein eigenes Level, der Preis steigt mit jedem gekauften Stück und mit der Größe
function cheapestParcel() {
  let best = -1;
  PARCELS.forEach((p, i) => { if (!G.parcels[i] && (best < 0 || p.lv < PARCELS[best].lv)) best = i; });
  return best;
}
function nextParcelInfo(i) {
  if (i === undefined) i = cheapestParcel();
  if (i < 0) return { cost: 0, level: 99, i };
  const p = PARCELS[i];
  return { cost: parcelCost(G.stats.parcels, p.w * p.h), level: p.lv, i };
}
const parcelBuyable = (i) => i >= 0 && i < PARCELS.length && !G.parcels[i];
function buyParcel(i) {
  const { cost, level } = nextParcelInfo(i);
  if (!parcelBuyable(i) || G.level < level || G.money < cost) return false;
  G.money -= cost; G.parcels[i] = true; G.stats.parcels++;
  sfx('levelup');
  const p = PARCELS[i];
  fxDust((p.x + p.w / 2) * TILE, (p.y + p.h / 2) * TILE, '#ffe28a', 30);
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
  if (G.stats.boated >= 3) pool.push('hecht');
  if (G.mine.open && G.stats.mined >= 3) pool.push('stein', 'kohle');
  return pool;
}
// Ab welchem Level es eine Ware gibt (Aufträge wählen Neues öfter als Weizen)
function itemLevel(id) {
  if (CROPS[id]) return CROPS[id].level;
  if (id === 'fisch') return POND.level;
  if (id === 'hecht') return BOAT.level;
  if (id === 'stein' || id === 'kohle') return MINE.level;
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
function statValue(stat) {
  if (stat === 'animals') return animalCount();
  if (stat === 'coats') return Object.keys(G.coats).length;
  if (stat === 'deco') return decoCount();
  return G.stats[stat] || 0;
}
const achActive = (a) => TOWN_ON || a.stat !== 'projects'; // Stadt-Ziele vorerst ausgeblendet
const claimable = () => ACHIEVEMENTS.filter((a) => achActive(a) && !G.claimed[a.id] && statValue(a.stat) >= a.goal);
function claim(id) {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a || G.claimed[id] || statValue(a.stat) < a.goal) return;
  G.claimed[id] = true; addMoney(a.money); gainXP(a.xp);
  sfx('levelup'); toast('🏆 ' + a.name + ': +' + a.money + ' 💰', 'good');
}

// ---------- See: Angelsteg und Ruderboot ----------
function catchFish(boat) {
  const o = boat ? G.boat : G.pond;
  if (o.fish <= 0) return null;
  o.fish--; const f = pick(boat ? BOAT_FISH : FISH).id;
  addInv(f, 1); G.stats.fished++; if (boat) G.stats.boated++;
  const d = farmObj(boat ? 'boot' : 'steg');
  gainXP(boat ? BOAT.xp : POND.xp, (d.x + d.w / 2) * TILE, d.y * TILE + 10);
  return f;
}

// ---------- Bergwerk ----------
function openMine() {
  if (G.mine.open || G.level < MINE.level || G.money < MINE.cost) return false;
  G.money -= MINE.cost; G.mine.open = true; G.mine.finds = MINE.max; G.mine.t = 0;
  sfx('levelup'); return true;
}
function mineFind() { // ein Fund pro aufgeschlagenem Gestein
  if (!G.mine.open || G.mine.finds <= 0) return null;
  G.mine.finds--; const f = pick(MINE_FINDS).id;
  addInv(f, 1); G.stats.mined++;
  const d = farmObj('bergwerk'); gainXP(MINE.xp, (d.x + 1.5) * TILE, (d.y + 2) * TILE);
  return f;
}

// ---------- Deko ----------
// Ein Deko-Stück steht auf Kacheln (t.d = Stück-Nummer). Wege/Zäune belegen je 1 Kachel.
const petN = (id) => +G.pets[id] || 0;
const decoCount = () => Object.values(G.deco).filter((d) => { const k = decoKind(d.t); return k !== 'path' && k !== 'fence'; }).length + Object.keys(G.pets).reduce((s, p) => s + petN(p), 0);
const beauty = () => Object.values(G.deco).reduce((s, d) => s + (decoKind(d.t) === 'path' || decoKind(d.t) === 'fence' ? 0.2 : decoBeauty(d.t)), 0)
  + Object.keys(G.pets).reduce((s, p) => s + decoBeauty(p) * petN(p), 0);
// freigeschaltet? (Level, Meilenstein, Stadtprojekt, Gebäude)
function decoUnlocked(id) {
  const d = DECO[id];
  if (d.kind === 'trader' || d.start) return true;
  if (d.free) return Object.values(G.deco).some((x) => x.t === d.free);
  if (d.stat) return statValue(d.stat[0]) >= d.stat[1];
  if (G.level < d.lv) return false;
  if (TOWN_ON && d.town && !built(d.town)) return false;
  if (TOWN_ON && d.allTown && !Object.keys(PROJECTS).every(built)) return false;
  if (d.building && !Object.values(G.buildings).some((b) => b.type === d.building)) return false;
  return true;
}
const decoNeed = (id) => DECO[id].need || {};
const decoAffordable = (id) => G.money >= DECO[id].price && hasAll(decoNeed(id));
function payDeco(id) {
  if (!decoUnlocked(id) || !decoAffordable(id)) return false;
  G.money -= DECO[id].price;
  for (const [k, n] of Object.entries(decoNeed(id))) G.inv[k] -= n;
  return true;
}
// Darf das Stück hier stehen? ÜBERALL (Wiese, Wald, Berg, Wege, Hofplatz, eigenes Land) – nur nicht im Wasser,
// auf bepflanzten Feldern, auf noch gesperrtem Land oder dort, wo schon etwas steht (Gebäude, Haus, andere Deko).
// Beete vor dem Haus nur für Blumen. (Marvins Wunsch 2026-11-10)
const sceneWater = (x, y) => typeof SCN !== 'undefined' && SCN.waterAt(x, y);
// rep = „drübersetzen“: andere Deko und Pflanzen dürfen dort sein und werden beim Aufstellen abgebaut (Marvins Wunsch)
function decoTileOK(id, x, y, ignore, rep = false) {
  if (!inMap(x, y)) return false;
  const t = tile(x, y);
  if (t.b) return false;
  if (!rep && (t.c || (t.d && t.d !== ignore))) return false;
  if (isBed(x, y)) return !!DECO[id].flower && (DECO[id].w || 1) === 1;
  const fo = farmObjAt(x, y);
  if (fo && !(fo.id === 'kratzbaum' && !G.pets.katze)) return false; // Kratzbaum-Platz ist frei, solange keine Katze da ist
  if (parcelAt(x, y) && !owned(x, y)) return false;
  return !sceneWater(x, y);
}
// Schilder: kurzer Text = 1 Feld, langer Text = 2 Felder (Marvins Wunsch). text = Schildtext (bei anderen Deko egal)
function signW(id, text) {
  const t = String(text || '').trim();
  if (!t || typeof SCN === 'undefined' || typeof DSIGN === 'undefined') return 1;
  const b = DSIGN[DECO[id].spr + '_k'];
  return b && SCN.inkWidth(t) <= b[2] - 6 ? 1 : 2;
}
const signSpr = (id, text) => DECO[id].spr + (decoW(id, text) === 1 ? '_k' : '');
// Text so kürzen, dass er auf das lange Schild passt (links und rechts mindestens 4 Pixel Rand)
function signFit(id, text) {
  let t = String(text || '').trim().slice(0, SIGN_MAX);
  const box = typeof DSIGN !== 'undefined' && DSIGN[DECO[id].spr];
  if (box && typeof SCN !== 'undefined') while (t.length > 1 && SCN.inkWidth(t) > box[2] - 8) t = t.slice(0, -1).trimEnd();
  return t;
}
const eachTile = (id, x, y, text, fn) => { for (let dx = 0; dx < decoW(id, text); dx++) for (let dy = 0; dy < decoH(id); dy++) fn(x + dx, y + dy); };
// Warum geht es hier nicht? (für die Meldung)
function decoWhyNot(id, x, y, text, rep = decoReplaces(id)) {
  let why = null;
  eachTile(id, x, y, text, (tx, ty) => {
    if (why) return;
    if (!inMap(tx, ty)) { why = 'Hier ist der Rand der Karte.'; return; }
    const t = tile(tx, ty);
    if (isBed(tx, ty) && !(DECO[id].flower && (DECO[id].w || 1) === 1)) why = 'Ins Beet passen nur Blumen.';
    else if (parcelAt(tx, ty) && !owned(tx, ty)) why = 'Dieses Land gehört dir noch nicht.';
    else if (sceneWater(tx, ty)) why = 'Nicht ins Wasser.';
    else if (t.b) why = 'Hier steht ein Gebäude.';
    else if (!rep && t.c) why = 'Hier wächst etwas – erst ernten.';
  });
  return why || 'Hier steht schon etwas.';
}
// Einzelstücke dürfen drübergesetzt werden; Wege/Zäune (Wischen) nicht, sonst räumt man beim Ziehen aus Versehen ab
const decoReplaces = (id) => !['path', 'fence', 'pet'].includes(decoKind(id));
// Was würde beim Aufstellen abgebaut? (Namen für die Vorschau-Leiste und die Nachfrage)
function decoReplaced(id, x, y, ignore, text) {
  const out = [], seen = {};
  eachTile(id, x, y, text, (tx, ty) => {
    if (!inMap(tx, ty)) return;
    const t = tile(tx, ty);
    if (t.d && t.d !== ignore && G.deco[t.d] && !seen[t.d]) { seen[t.d] = 1; out.push(DECO[G.deco[t.d].t].name); }
    if (t.c && !seen['c' + t.c]) { seen['c' + t.c] = 1; out.push(CROPS[t.c] ? CROPS[t.c].name : t.c); }
  });
  return out;
}
// Platz frei machen: andere Deko kostenlos ins Lager, Pflanzen wie mit der Spitzhacke (Reifes ernten, sonst Saatgut zurück)
function clearForDeco(id, x, y, ignore, text) {
  eachTile(id, x, y, text, (tx, ty) => {
    if (!inMap(tx, ty)) return;
    const t = tile(tx, ty);
    if (t.d && t.d !== ignore && G.deco[t.d]) storeDeco(t.d);
    if (t.c) doAction(tx, ty, t.p >= 1 ? 'harvest' : 'remove');
  });
}
const markDeco = (d) => eachTile(d.t, d.x, d.y, d.text, (x, y) => { const t = tile(x, y); t.d = d.id; if (t.s === 'soil' && !t.c) t.s = 'grass'; });
// Nach Größen-Änderungen (Update 7): Felder aller Deko neu belegen; was nicht mehr passt, kommt kostenlos ins Lager.
function refitDeco() {
  G.tiles.forEach((t) => { t.d = null; });
  for (const d of Object.values(G.deco).sort((a, b) => a.id - b.id)) {
    const k = decoKind(d.t); if (k === 'pet') continue;
    let ok = true;
    eachTile(d.t, d.x, d.y, d.text, (x, y) => {
      if (!ok) return;
      if (!inMap(x, y) || farmObjAt(x, y)) { ok = false; return; }
      const t = tile(x, y); if (t.b || t.c || t.d) ok = false;
    });
    if (!ok) { delete G.deco[d.id]; G.decoStore[d.t] = (G.decoStore[d.t] || 0) + 1; continue; }
    eachTile(d.t, d.x, d.y, d.text, (x, y) => { tile(x, y).d = d.id; });
  }
}
function decoOK(id, x, y, ignore, rep = false, text) {
  let ok = true;
  eachTile(id, x, y, text, (tx, ty) => { if (ok && !decoTileOK(id, tx, ty, ignore, rep)) ok = false; });
  return ok;
}
function addDecoAt(id, x, y, extra = {}) {
  const n = G.nextId++;
  G.deco[n] = { id: n, t: id, x, y, ...extra };
  markDeco(G.deco[n]);
  return n;
}
// aus dem Lager aufstellen (frei) – oder direkt kaufen und aufstellen (Wege/Zäune, je Feld)
function placeDeco(id, x, y, extra = {}) {
  const rep = decoReplaces(id);
  if (!decoOK(id, x, y, undefined, rep, extra.text)) return 0;
  if ((G.decoStore[id] || 0) > 0) G.decoStore[id]--;
  else if (!payDeco(id)) return 0;
  if (rep) clearForDeco(id, x, y, undefined, extra.text);
  const n = addDecoAt(id, x, y, extra);
  sfx(decoKind(id) === 'path' ? 'plow' : 'build');
  fxDust((x + decoW(id, extra.text) / 2) * TILE, (y + decoH(id) / 2) * TILE, '#ffe9a8', 10);
  return n;
}
function buyDecoToStore(id) { if (!payDeco(id)) return false; G.decoStore[id] = (G.decoStore[id] || 0) + 1; sfx('coin'); return true; }
function removeDecoTiles(d) { eachTile(d.t, d.x, d.y, d.text, (x, y) => { if (inMap(x, y) && tile(x, y).d === d.id) tile(x, y).d = null; }); }
function storeDeco(n) { // kostenlos ins Lager
  const d = G.deco[n]; if (!d) return;
  removeDecoTiles(d); delete G.deco[n];
  G.decoStore[d.t] = (G.decoStore[d.t] || 0) + 1; sfx('click');
}
function moveDeco(n, x, y) {
  const d = G.deco[n], rep = d && decoReplaces(d.t); if (!d || !decoOK(d.t, x, y, n, rep, d.text)) return false;
  if (rep) clearForDeco(d.t, x, y, n, d.text);
  removeDecoTiles(d); d.x = x; d.y = y; markDeco(d);
  sfx('build'); return true;
}
const SIGN_MAX = 12;
// Schildtext ändern: wird das Schild dadurch breiter, braucht es rechts (oder links) ein freies Feld – sonst wird der Text gekürzt
function setSignText(n, text) {
  const d = G.deco[n]; if (!d) return '';
  let t = signFit(d.t, text), note = '';
  removeDecoTiles(d);
  if (decoW(d.t, t) > decoW(d.t, d.text) && !decoOK(d.t, d.x, d.y, n, false, t)) {
    if (decoOK(d.t, d.x - 1, d.y, n, false, t)) d.x -= 1;
    else { while (t.length > 1 && decoW(d.t, t) > 1) t = t.slice(0, -1).trimEnd(); note = 'Neben dem Schild ist kein Platz für den langen Text – gekürzt.'; }
  }
  d.text = t; markDeco(d);
  return note;
}
function buyPet(id) {
  const n = +G.pets[id] || 0; // alte Spielstände: true = 1
  if (n >= (PET_MAX[id] || 1) || !decoUnlocked(id) || !payDeco(id)) return false;
  G.pets[id] = n + 1; sfx('animal');
  if (id === 'katze') { const k = farmObj('kratzbaum'), t = tile(k.x, k.y); if (t.d) storeDeco(t.d); } // Platz für den Kratzbaum freimachen
  return true;
}
// Wanderhändler: jeden Tag ein anderes Sonderstück, das es sonst nirgends gibt
const TRADER_ITEMS = Object.keys(DECO).filter((id) => DECO[id].kind === 'trader');
function traderDay() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function traderOffer() {
  const day = traderDay();
  if (G.trader.day !== day) G.trader = { day, sold: false };
  let h = 0; for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TRADER_ITEMS[h % TRADER_ITEMS.length];
}
function buyTrader() {
  const id = traderOffer();
  if (G.trader.sold || G.money < DECO[id].price) return false;
  G.money -= DECO[id].price; G.trader.sold = true; G.decoStore[id] = (G.decoStore[id] || 0) + 1; sfx('lucky');
  return true;
}

// ---------- Haus-Ausbau ----------
const houseHas = (kind, id) => (G.house.have[kind] || []).includes(id);
function partInfo(kind, id) {
  if (kind === 'type') { const h = HOUSES[id]; return { name: h.name, lv: h.lv, price: h.price, need: h.need || {} }; }
  const [name, lv, price] = HOUSE_PARTS[kind][id]; return { name, lv, price, need: {} };
}
function buyHousePart(kind, id) {
  const p = partInfo(kind, id);
  if (houseHas(kind, id)) { G.house[kind] = id; sfx('click'); return true; }
  if (G.level < p.lv || G.money < p.price || !hasAll(p.need)) return false;
  G.money -= p.price; for (const [k, n] of Object.entries(p.need)) G.inv[k] -= n;
  (G.house.have[kind] = G.house.have[kind] || []).push(id); G.house[kind] = id;
  sfx('levelup'); const o = farmObj('haus'); fxDust((o.x + o.w / 2) * TILE, (o.y + 2) * TILE, '#ffe28a', 26);
  return true;
}

// ---------- Autos: immer genau eins auf dem Stellplatz ----------
// Stellplatz hat Platz für 2 Autos: G.car.cur (vorne) und G.car.cur2 (hinten). Tippen auf ein abgestelltes Auto = wegfahren.
function parkCar(id) {
  if (G.car.cur === id) { G.car.cur = G.car.cur2 || null; G.car.cur2 = null; return; }
  if (G.car.cur2 === id) { G.car.cur2 = null; return; }
  if (!G.car.cur) G.car.cur = id; else if (!G.car.cur2) G.car.cur2 = id; else G.car.cur2 = id; // voll: hinteres tauschen
}
function buyCar(id) {
  const c = CARS[id];
  if (G.car.have.includes(id)) { parkCar(id); sfx('click'); return true; }
  if (G.level < c.lv || G.money < c.price) return false;
  G.money -= c.price; G.car.have.push(id); parkCar(id);
  sfx('levelup'); const o = farmObj('stellplatz'); fxDust((o.x + 1) * TILE, (o.y + 1) * TILE, '#ffe28a', 20);
  return true;
}

// ---------- Stadt ----------
function projectState(id) {
  const t = PROJECTS[id];
  if (!TOWN_ON) return 'locked';
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
  const l = t.lot, cx = (TOWN_X0 + l.x + l.w / 2) * TILE, cy = (TOWN_Y0 + l.y + l.h / 2) * TILE;
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
  { text: () => 'Mach deinen Hof schön: Kaufe im 🌼 Deko-Reiter deine erste Deko', done: () => decoCount() >= 5 || Object.values(G.deco).some((d) => !['fass', 'schubkarre', 'kisten', 'lilie'].includes(d.t)), target: 'deko' },
];
const tutorialStep = () => (G.tutSkip ? null : TUTORIAL.find((s) => !s.done()));
function currentGoal() {
  const step = tutorialStep();
  if (step) return step.text();
  for (let l = G.level + 1; l < 40; l++) {
    const u = unlocksAt(l);
    if (u.length) return 'Nächstes Ziel: Level ' + l + ' schaltet ' + u.join(', ') + ' frei';
  }
  return 'Baue deine Farm zum größten Hof im Land aus!';
}

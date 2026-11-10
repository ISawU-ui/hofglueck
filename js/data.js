// ===== Spieldaten: hier wird das Balancing eingestellt =====
'use strict';

const GAME_VERSION = '7.6 (10.11.2026)'; // im Spielstand-Fenster sichtbar – so sieht man am Handy, ob die neue Version da ist
const TILE = 48;           // Pixel pro Kachel (Welt-Koordinaten)
// Update 6: neue, größere Karte aus dem Hof-Plan der Werkstatt (vorher 24 × 16)
const MAP_W = 40;          // Kacheln breit (Hof)
const MAP_H = 27;          // Kacheln hoch
const TOWN_X0 = MAP_W;     // rechts neben dem Hof liegt die Stadt (nur Deko + Stadtprojekte, keine Felder)
const TOWN_W = 10;
const TOWN_Y0 = -1;        // Stadt eine Zeile nach oben verschoben, damit ihre Straße auf der Dorfstraße (Zeile 13) liegt
const TOWN_NAME = 'Sonnenfeld';
// Stadt vorerst ausgeschaltet (Marvin will sie später neu machen). Gebaute Projekte bleiben im Spielstand (G.town) erhalten.
const TOWN_ON = false;
const SCENE_MARGIN = 6;    // so viele Felder Landschaft werden rings um die Karte weitergezeichnet (keine leeren Ränder)
// alte Karte (für den Umzug alter Spielstände)
const OLD = { MAP_W: 24, MAP_H: 16, PARCEL: 4, X0: 4, Y0: 2, COLS: 5, ROWS: 3 };

// Landstücke: wachsen mit dem Level – erst 4 × 4, dann 8 × 4, später 6 × 6 (x, y = linke obere Kachel)
const PARCELS = [
  { x: 14, y: 5, w: 4, h: 4, lv: 1 }, { x: 18, y: 5, w: 4, h: 4, lv: 1 }, { x: 22, y: 5, w: 4, h: 4, lv: 3 },
  { x: 26, y: 5, w: 4, h: 4, lv: 5 }, { x: 30, y: 5, w: 4, h: 4, lv: 7 }, { x: 34, y: 5, w: 4, h: 4, lv: 9 },
  { x: 14, y: 9, w: 4, h: 4, lv: 6 }, { x: 18, y: 9, w: 4, h: 4, lv: 8 }, { x: 22, y: 9, w: 8, h: 4, lv: 11 }, { x: 30, y: 9, w: 8, h: 4, lv: 13 },
  { x: 14, y: 14, w: 6, h: 6, lv: 12 }, { x: 20, y: 14, w: 6, h: 6, lv: 15 }, { x: 26, y: 14, w: 6, h: 6, lv: 18 }, { x: 32, y: 14, w: 6, h: 6, lv: 22 },
];
const START_PARCELS = [0, 1];
// Hof-Geometrie (Kacheln): Wege, Hofplatz, Stellplatz, Beete, feste Dinge, Deko-Zonen
const FARM = {
  road: { y: 13, x0: 5 },                     // Dorfstraße bis in die Stadt
  stegweg: { x: 7, y0: 14, y1: 17 },           // Weg zum Angelsteg
  minenweg: { x: 38, y0: 5, y1: 12 },          // Weg zum Bergwerk
  yard: { x: 4, y: 6, w: 10, h: 5 },           // gepflasterter Hofplatz
  link: { x: 7, y: 11, w: 3, h: 2 },           // Hofzufahrt
  park: { x: 5, y: 11, w: 2, h: 2 },           // Stellplatz
  beds: [[4, 6], [5, 6], [7, 6], [8, 6]],      // Vorgarten-Beete (nur Blumen)
};
// feste Dinge auf dem Hof (Kachel-Rechtecke zum Antippen; keine Deko darauf) – so groß wie ihr Bild, nicht größer.
// Das Haus wächst mit dem Ausbau: sein Rechteck rechnet render.js aus dem Hausbild aus (houseRectDyn), hier steht das größte.
const FARM_OBJ = [
  { id: 'haus', x: 4, y: 3, w: 5, h: 3 }, { id: 'scheune', x: 10, y: 4, w: 2, h: 2 }, { id: 'kratzbaum', x: 13, y: 5, w: 1, h: 1 },
  { id: 'hund', x: 4, y: 8, w: 2, h: 1 }, { id: 'hofladen', x: 10, y: 11, w: 3, h: 2 }, { id: 'tafel', x: 13, y: 12, w: 1, h: 1 },
  { id: 'stellplatz', x: 5, y: 11, w: 2, h: 2 }, { id: 'steg', x: 6, y: 17, w: 2, h: 4 }, { id: 'boot', x: 6, y: 21, w: 3, h: 2 },
  { id: 'bergwerk', x: 37, y: 2, w: 3, h: 3 }, { id: 'haendler', x: 10, y: 14, w: 3, h: 1 },
  { id: 'sonnenfeld', x: 38, y: 14, w: 2, h: 2 }, { id: 'steg', x: 8, y: 16, w: 2, h: 2 }, // Wegweiser „Angelsteg“ gehört zum Steg // Wegweiser am Ende der Dorfstraße (später: mit dem Auto in die Stadt)
];
// Deko-Zonen außerhalb der Landstücke (dort liegen nie Felder)
const DECO_ZONES = [
  { name: 'Hofplatz', x: 4, y: 6, w: 10, h: 5 }, { name: 'Uferwiese', x: 14, y: 21, w: 24, h: 2 },
  { name: 'Seeufer', x: 8, y: 14, w: 6, h: 3 }, { name: 'Waldrand', x: 2, y: 14, w: 4, h: 3 },
];

// Alles, was in der Scheune liegen kann
const ITEMS = {
  weizen:    { name: 'Weizen',    icon: '🌾', price: 4 },
  karotte:   { name: 'Karotte',   icon: '🥕', price: 11 },
  mais:      { name: 'Mais',      icon: '🌽', price: 19 },
  kartoffel: { name: 'Kartoffel', icon: '🥔', price: 36 },
  tomate:    { name: 'Tomate',    icon: '🍅', price: 58 },
  kuerbis:   { name: 'Kürbis',    icon: '🎃', price: 100 },
  erdbeere:  { name: 'Erdbeere',  icon: '🍓', price: 170 },
  ei:        { name: 'Ei',        icon: '🥚', price: 16 },
  milch:     { name: 'Milch',     icon: '🥛', price: 42 },
  wolle:     { name: 'Wolle',     icon: '🧶', price: 85 },
  mehl:      { name: 'Mehl',      icon: '🥣', price: 22 },
  brot:      { name: 'Brot',      icon: '🍞', price: 75 },
  kaese:     { name: 'Käse',      icon: '🧀', price: 140 },
  apfel:     { name: 'Apfel',     icon: '🍎', price: 9 },
  kirsche:   { name: 'Kirschen',  icon: '🍒', price: 24 },
  pfirsich:  { name: 'Pfirsich',  icon: '🍑', price: 48 },
  orange:    { name: 'Orange',    icon: '🍊', price: 75 },
  apfelsaft: { name: 'Apfelsaft', icon: '🧃', price: 55 },
  fisch:     { name: 'Fisch',     icon: '🐟', price: 14 },
  krebs:     { name: 'Krebs',     icon: '🦀', price: 32 },
  tropenfisch: { name: 'Tropenfisch', icon: '🐠', price: 70 },
  stiefel:   { name: 'Alter Stiefel', icon: '👢', price: 1 },
  hecht:     { name: 'Hecht',     icon: '🐟', price: 160 },
  goldkarpfen: { name: 'Goldkarpfen', icon: '🐠', price: 420 },
  stein:     { name: 'Stein',     icon: '🪨', price: 8 },
  kohle:     { name: 'Kohle',     icon: '⚫', price: 18 },
  eisenerz:  { name: 'Eisenerz',  icon: '⛓️', price: 40 },
  edelstein: { name: 'Edelstein', icon: '💎', price: 220 },
};

// Pflanzen: Saatgut-Kosten, Wachstum in Sekunden, XP pro Ernte
// Balancing (Update 4): kurze Pflanzen bringen pro Minute leicht am meisten (dafür oft klicken),
// lange bringen pro Ernte mehr, pro Minute aber weniger → gut für Pausen, aber nicht übermächtig.
// Gewinn pro Feld und Minute: Weizen 6,0 · Karotte 6,4 · Mais 5,6 · Kartoffel 5,5 · Tomate 5,3 · Kürbis 5,0 · Erdbeere 4,7
const CROPS = {
  weizen:    { level: 1,  cost: 1,  time: 30,  xp: 1 },
  karotte:   { level: 2,  cost: 3,  time: 75,  xp: 2 },
  mais:      { level: 3,  cost: 5,  time: 150, xp: 4 },
  kartoffel: { level: 5,  cost: 14, time: 240, xp: 6 },
  tomate:    { level: 7,  cost: 26, time: 360, xp: 8 },
  kuerbis:   { level: 9,  cost: 50, time: 600, xp: 12 },
  erdbeere:  { level: 12, cost: 95, time: 960, xp: 18 },
};
// Stärke von Sprinkler und Upgrades (pro Stufe); Texte unten rechnen damit
const SPRINKLER_BOOST = 1.3; // Pflanzen im Umkreis wachsen 30 % schneller
const DUENGER_STEP = 0.06;   // Dünger: pro Stufe 6 % kürzere Wachstumszeit (max. 5 Stufen = 30 %)
const FUTTER_STEP = 0.06;    // Kraftfutter: Tiere & Gebäude pro Stufe 6 % schneller
const GLUECK_STEP = 0.05;    // Glückliche Ernte: pro Stufe 5 % Chance auf doppelte Ernte

// Gebäude. kind: 'animal' (Tiere fressen und produzieren), 'factory' (Rezept), 'boost'
const BUILDINGS = {
  huehnerstall: {
    name: 'Hühnerstall', icon: '🐔', kind: 'animal', level: 2, cost: 120, w: 2, h: 2,
    animal: 'huhn', animalName: 'Huhn', animalCost: 35, maxAnimals: 6,
    feed: 'weizen', feedPer: 1, out: 'ei', time: 90, xp: 2,
    color: '#c98b4a', ground: '#d9c27a',
  },
  muehle: {
    name: 'Mühle', icon: '🌬️', kind: 'factory', level: 3, cost: 250, w: 2, h: 2,
    in: { weizen: 3 }, out: 'mehl', time: 40, xp: 3, color: '#b8a089',
  },
  kuhstall: {
    name: 'Kuhstall', icon: '🐄', kind: 'animal', level: 4, cost: 450, w: 2, h: 2,
    animal: 'kuh', animalName: 'Kuh', animalCost: 120, maxAnimals: 4,
    feed: 'mais', feedPer: 1, out: 'milch', time: 150, xp: 6,
    color: '#a0522d', ground: '#9ccf6a',
  },
  sprinkler: {
    name: 'Sprinkler', icon: '💦', kind: 'boost', level: 5, cost: 300, w: 1, h: 1,
    desc: 'Pflanzen im Umkreis wachsen 30 % schneller',
  },
  baeckerei: {
    name: 'Bäckerei', icon: '🥖', kind: 'factory', level: 6, cost: 800, w: 2, h: 2,
    in: { mehl: 1, ei: 1 }, out: 'brot', time: 90, xp: 6, color: '#d98c5f',
  },
  schafweide: {
    name: 'Schafweide', icon: '🐑', kind: 'animal', level: 8, cost: 1100, w: 2, h: 2,
    animal: 'schaf', animalName: 'Schaf', animalCost: 250, maxAnimals: 4,
    feed: 'karotte', feedPer: 2, out: 'wolle', time: 300, xp: 10,
    color: '#7a6a5a', ground: '#8fcf5a',
  },
  kaeserei: {
    name: 'Käserei', icon: '🧀', kind: 'factory', level: 10, cost: 2000, w: 2, h: 2,
    in: { milch: 2 }, out: 'kaese', time: 180, xp: 10, color: '#e0b23c',
  },
  saftpresse: {
    name: 'Saftpresse', icon: '🧃', kind: 'factory', level: 9, cost: 1500, w: 2, h: 2,
    in: { apfel: 3 }, out: 'apfelsaft', time: 100, xp: 6, color: '#8fbf4a',
  },
  pferdestall: {
    name: 'Pferdestall', icon: '🐴', kind: 'horse', level: 11, cost: 2500, w: 2, h: 2,
    animalName: 'Pferd', animalCost: 600, maxAnimals: 4,
    in: { karotte: 4, mais: 3 }, time: 600, xp: 30, color: '#8d5b3a', ground: '#b9d77a',
    desc: 'Zwei Pferde bekommen Fohlen – mit Glück in seltenen Fellfarben',
  },
  // Obstbäume: einmal pflanzen, tragen dann immer wieder Früchte (kein Saatgut nötig)
  apfelbaum:    { name: 'Apfelbaum',    icon: '🍎', kind: 'tree', level: 4,  cost: 180,  w: 1, h: 1, out: 'apfel',    qty: 2, time: 200, xp: 1, leaf: '#3f9a3a' },
  kirschbaum:   { name: 'Kirschbaum',   icon: '🍒', kind: 'tree', level: 7,  cost: 450,  w: 1, h: 1, out: 'kirsche',  qty: 3, time: 480, xp: 3, leaf: '#2f7d3a' },
  pfirsichbaum: { name: 'Pfirsichbaum', icon: '🍑', kind: 'tree', level: 13, cost: 1400, w: 1, h: 1, out: 'pfirsich', qty: 3, time: 900, xp: 6, leaf: '#4c9a42' },
  orangenbaum:  { name: 'Orangenbaum',  icon: '🍊', kind: 'tree', level: 15, cost: 3000, w: 1, h: 1, out: 'orange',   qty: 4, time: 1500, xp: 9, leaf: '#2e8a4a' },
};

// Pferde-Fellfarben: tier 0 häufig … 3 legendär
const COATS = {
  braun:    { name: 'Brauner', tier: 0, body: '#8b5a2b', mane: '#3b2412' },
  fuchs:    { name: 'Fuchs',   tier: 0, body: '#c8692c', mane: '#f0c27a' },
  rappe:    { name: 'Rappe',   tier: 1, body: '#2f2a2a', mane: '#111111' },
  schimmel: { name: 'Schimmel', tier: 1, body: '#ecebe4', mane: '#c9c3b6' },
  schecke:  { name: 'Schecke', tier: 2, body: '#f6f1e7', mane: '#3b2412', spots: '#7a4a24' },
  falbe:    { name: 'Falbe',   tier: 2, body: '#e3bb63', mane: '#4a3018' },
  einhorn:  { name: 'Einhorn', tier: 3, body: '#ffffff', mane: 'rainbow' },
};
const COAT_TIERS = [
  { name: 'häufig',      weight: 62, value: 300,  color: '#7a6a5a' },
  { name: 'selten',      weight: 27, value: 650,  color: '#2f7fc1' },
  { name: 'sehr selten', weight: 9,  value: 1400, color: '#9b4dca' },
  { name: 'legendär',    weight: 2,  value: 5000, color: '#d4a017' },
];

// See (Angelsteg): Fische wachsen nach, Fang ist Zufall
const POND = { level: 2, max: 5, regen: 120, xp: 2 };
const FISH = [
  { id: 'fisch', weight: 58 }, { id: 'krebs', weight: 20 }, { id: 'tropenfisch', weight: 8 }, { id: 'stiefel', weight: 14 },
];
// Ruderboot (ab Level 14): rausfahren und seltene Fische fangen
const BOAT = { level: 14, max: 3, regen: 180, xp: 6 };
const BOAT_FISH = [{ id: 'hecht', weight: 55 }, { id: 'tropenfisch', weight: 25 }, { id: 'goldkarpfen', weight: 12 }, { id: 'krebs', weight: 8 }];
// Bergwerk (ab Level 16): Stollen einmal freiräumen, dann Gestein abbauen
const MINE = { level: 16, cost: 5000, max: 6, regen: 120, xp: 4, hits: 3 };
const MINE_FINDS = [{ id: 'stein', weight: 52 }, { id: 'kohle', weight: 26 }, { id: 'eisenerz', weight: 16 }, { id: 'edelstein', weight: 6 }];

// Markt: wer sehr viel vom Gleichen verkauft, drückt kurz den Preis (Aufträge zahlen immer voll)
const MARKET = { minFactor: 0.35, recover: 480 }; // tiefster Preis 35 %, erholt sich in 8 Minuten ganz
const marketSize = (lvl, bonus) => (600 + 250 * lvl) * bonus; // Münzwert, den der Markt „schluckt“, bis der Preis am Boden ist

// Stadtprojekte: Geld + Waren abgeben → dauerhafter Bonus, die Stadt wächst sichtbar
// lot = Bauplatz in der Stadt (Spalte/Zeile relativ zu TOWN_X0)
const PROJECTS = {
  markt:      { name: 'Wochenmarkt', icon: '🏪', level: 3,  cost: 300,   items: { weizen: 15 },                 bonus: 'Markt 50 % größer: Preise sinken langsamer',  lot: { x: 1, y: 5, w: 3, h: 4 } },
  brunnen:    { name: 'Dorfbrunnen', icon: '⛲', level: 5,  cost: 900,   items: { karotte: 10, ei: 8 },          bonus: '+1 Auftrag an der Tafel',                     lot: { x: 4, y: 6, w: 2, h: 2 } },
  schule:     { name: 'Schule',      icon: '🏫', level: 7,  cost: 2200,  items: { brot: 6, milch: 6 },           bonus: '+10 % XP für alles',                          lot: { x: 1, y: 9, w: 3, h: 4 } },
  kirche:     { name: 'Kirche',      icon: '⛪', level: 9,  cost: 4500,  items: { mehl: 10, tomate: 10 },        bonus: 'Aufträge zahlen 20 % mehr',                   lot: { x: 1, y: 1, w: 3, h: 4 } },
  reitschule: { name: 'Reitschule',  icon: '🏇', level: 11, cost: 8000,  items: { mais: 25, apfel: 15 },         bonus: 'Pferde bringen 50 % mehr beim Verkauf',       lot: { x: 6, y: 9, w: 4, h: 4 } },
  festplatz:  { name: 'Festplatz',   icon: '🎡', level: 13, cost: 16000, items: { kuerbis: 10, apfelsaft: 8 },   bonus: '+10 % Verkaufspreis und +1 Auftrag',          lot: { x: 6, y: 5, w: 4, h: 4 } },
  rathaus:    { name: 'Rathaus',     icon: '🏛️', level: 16, cost: 60000, items: { erdbeere: 20, pfirsich: 10, kaese: 10 }, bonus: '+15 % XP – du wirst Ehrenbürger!', lot: { x: 6, y: 1, w: 4, h: 4 } },
};

// Globale Verbesserungen, jede Stufe wird teurer
const UPGRADES = {
  duenger:  { name: 'Dünger',          icon: '🧪', level: 3, base: 150, max: 5, desc: 'Pflanzen wachsen 6 % schneller' },
  haendler: { name: 'Guter Händler',   icon: '🤝', level: 4, base: 250, max: 5, desc: '+10 % Verkaufspreis' },
  glueck:   { name: 'Glückliche Ernte', icon: '🍀', level: 6, base: 400, max: 5, desc: '+5 % Chance auf doppelte Ernte' },
  futter:   { name: 'Kraftfutter',     icon: '🥫', level: 5, base: 350, max: 5, desc: 'Tiere & Gebäude 6 % schneller' },
};
const upgradeCost = (id, lvl) => Math.round(UPGRADES[id].base * Math.pow(2.2, lvl) / 10) * 10;

// XP für den nächsten Level
const xpForLevel = (lvl) => Math.floor(22 * lvl * lvl + 10); // Update 4: etwas flacher, weil Pflanzen jetzt länger wachsen

// Landstück-Preis: k = Anzahl schon dazugekaufter Stücke, größere Stücke kosten nach Fläche mehr
const parcelCost = (k, area = 16) => Math.round(200 * Math.pow(1.85, k) * area / 16 / 10) * 10;

// ---------- Deko (Update 6, alles aus der Deko-Werkstatt) ----------
// Größe w × h in Feldern; das Bild wird so gezeichnet, dass es GANZ in diese Felder passt (nie darüber hinaus).
// kind: 'item' (steht auf 1 Kachel oder w×h), 'path' (Weg, je Feld), 'fence' (Zaun, je Feld, verbindet sich),
//       'sign' (Schild mit eigenem Text), 'pet' (lebendig, ohne Platz), 'trader' (nur beim Wanderhändler)
// spr = Bild im Deko-Atlas (js/deko.js), lv = Level, price = Münzen (bleibt immer gleich), need = zusätzliche Waren
const DECO_CATS = [['blumen', 'Blumen & Beete'], ['gruen', 'Sträucher & Bäume'], ['natur', 'Steine & Pilze'], ['hof', 'Hof & Handwerk'],
  ['teich', 'Rund ums Angeln'], ['fest', 'Fest & Prunk'], ['licht', 'Licht & Feuer'], ['schilder', 'Schilder'], ['leben', 'Lebendige Deko'],
  ['wege', 'Wege'], ['zaeune', 'Zäune'], ['haendler', 'Vom Wanderhändler']];
const DECO = {
  wildblumen:   { name: 'Wildblumen',     cat: 'blumen', lv: 1,  price: 10,   spr: 'd_wildblumen', flower: true },
  glockenblume: { name: 'Glockenblumen',  cat: 'blumen', lv: 2,  price: 25,   spr: 'd_glockenblume', flower: true },
  goldblume:    { name: 'Goldsterne',     cat: 'blumen', lv: 2,  price: 30,   spr: 'd_goldblume', flower: true },
  lilie:        { name: 'Rote Lilien',    cat: 'blumen', lv: 3,  price: 40,   spr: 'd_lilie', flower: true },
  fackellilie:  { name: 'Fackellilien',   cat: 'blumen', lv: 4,  price: 60,   spr: 'd_fackellilie', flower: true },
  lila:         { name: 'Veilchen',       cat: 'blumen', lv: 5,  price: 80,   spr: 'd_lila', flower: true },
  rosa:         { name: 'Rosenstrauch',   cat: 'blumen', lv: 6,  price: 95,   spr: 'd_rosa', flower: true },
  rosenbogen:   { name: 'Rosenbogen',     cat: 'blumen', lv: 8,  price: 280,  spr: 'd_rosenbogen' },
  rittersporn:  { name: 'Rittersporn',    cat: 'blumen', lv: 9,  price: 150,  spr: 'd_rittersporn', flower: true },
  busch:        { name: 'Runder Busch',   cat: 'gruen',  lv: 2,  price: 45,   spr: 'd_busch' },
  farn:         { name: 'Farn',           cat: 'gruen',  lv: 4,  price: 45,   spr: 'd_farn' },
  beerenbusch:  { name: 'Beerenstrauch',  cat: 'gruen',  lv: 5,  price: 60,   spr: 'd_beerenbusch' },
  holunder:     { name: 'Holunder',       cat: 'gruen',  lv: 7,  price: 90,   spr: 'd_holunder' },
  tanne:        { name: 'Tanne',          cat: 'gruen',  lv: 7,  price: 320,  spr: 'd_tanne', w: 2, h: 2 },
  eiche:        { name: 'Alte Eiche',     cat: 'gruen',  lv: 10, price: 750,  spr: 'd_eiche', w: 2, h: 2 },
  steine:       { name: 'Feldsteine',     cat: 'natur',  lv: 2,  price: 35,   spr: 'd_steine' },
  pilze:        { name: 'Fliegenpilz',    cat: 'natur',  lv: 3,  price: 50,   spr: 'd_pilz', icon: 'd_pilze' },
  stumpf:       { name: 'Baumstumpf',     cat: 'natur',  lv: 5,  price: 50,   spr: 'd_stumpf' },
  steinmann:    { name: 'Steinmännchen',  cat: 'natur',  lv: 7,  price: 70,   spr: 'd_steinmann' },
  felsen:       { name: 'Felsgruppe',     cat: 'natur',  lv: 12, price: 900,  spr: 'd_felsen', w: 2, h: 1 },
  kisten:       { name: 'Kistenstapel',   cat: 'hof',    lv: 3,  price: 70,   spr: 'd_kisten' },
  fass:         { name: 'Regenfass',      cat: 'hof',    lv: 4,  price: 60,   spr: 'd_fass' },
  kuerbiskiste: { name: 'Apfelkiste',     cat: 'hof',    lv: 4,  price: 220,  spr: 'd_kuerbiskiste' },
  vogelscheuche:{ name: 'Vogelscheuche',  cat: 'hof',    lv: 6,  price: 260,  spr: 'd_vogelscheuche', note: 'Lockt Krähen an' },
  ziehbrunnen:  { name: 'Ziehbrunnen',    cat: 'hof',    lv: 9,  price: 1100, spr: 'd_ziehbrunnen' },
  schubkarre:   { name: 'Schubkarre',     cat: 'hof',    lv: 99, price: 0,    atlas: 'schubkarre', start: true },
  fischtafel:   { name: 'Fisch-Trophäe',  cat: 'teich',  lv: 2,  price: 0,    spr: 'd_fischtafel', stat: ['fished', 25], unlockText: 'bei 25 Fischen' },
  gestell:      { name: 'Fisch-Trockengestell', cat: 'teich', lv: 6, price: 300, spr: 'd_gestell', w: 2, h: 1 },
  netz:         { name: 'Fischernetz',    cat: 'teich',  lv: 8,  price: 260,  spr: 'd_netz' },
  hai:          { name: 'Hai-Trophäe',    cat: 'teich',  lv: 2,  price: 2500, spr: 'd_hai', w: 2, h: 1, stat: ['fished', 200], unlockText: 'bei 200 Fischen' },
  picknick:     { name: 'Festtafel',      cat: 'fest',   lv: 10, price: 480,  spr: 'd_picknick', w: 2, h: 1 },
  riesenfass:   { name: 'Erntedank-Fass', cat: 'fest',   lv: 11, price: 600,  spr: 'd_riesenfass' },
  stand:        { name: 'Hofladen-Stand', cat: 'fest',   lv: 13, price: 2400, spr: 'd_stand', w: 2, h: 2, town: 'markt', unlockText: 'mit Wochenmarkt' },
  banner:       { name: 'Wappenbanner',   cat: 'fest',   lv: 14, price: 900,  spr: 'd_banner', w: 1, h: 2 },
  engel:        { name: 'Engelsstatue',   cat: 'fest',   lv: 16, price: 4500, spr: 'd_engel', w: 1, h: 2, need: { edelstein: 3 } },
  drache:       { name: 'Drachenstatue',  cat: 'fest',   lv: 19, price: 9000, spr: 'd_drache', w: 1, h: 2, need: { edelstein: 10, eisenerz: 20 }, allTown: true, unlockText: 'alle Stadtprojekte' },
  windlicht:    { name: 'Windlicht',      cat: 'licht',  lv: 3,  price: 40,   spr: 'd_windlicht', light: 'glow' },
  fackel:       { name: 'Fackel',         cat: 'licht',  lv: 3,  price: 60,   spr: 'd_fackel', light: 'flame' },
  laterne:      { name: 'Hoflaterne',     cat: 'licht',  lv: 5,  price: 180,  spr: 'd_laterne', light: 'glow' },
  lichterkette: { name: 'Lichterkette',   cat: 'licht',  lv: 7,  price: 260,  spr: 'd_lichterkette', w: 2, h: 1, light: 'twinkle' },
  feuerschale:  { name: 'Feuerschale',    cat: 'licht',  lv: 10, price: 420,  spr: 'd_feuerschale', light: 'flame' },
  kerzenstaender:{ name: 'Kerzenständer', cat: 'licht',  lv: 12, price: 650,  spr: 'd_kerzenstaender', light: 'glow' },
  gluehwuermchen:{ name: 'Glühwürmchen',  cat: 'licht',  lv: 13, price: 900,  spr: 'd_gluehwuermchen', light: 'fireflies' },
  schild_pfahl: { name: 'Pfahlschild',    cat: 'schilder', lv: 1,  price: 30,  kind: 'sign', spr: 's_pfahl', icon: 'd_schild_pfahl', text: [43, 4, '#3b2412'] },
  schild_haenge:{ name: 'Hängeschild',    cat: 'schilder', lv: 6,  price: 80,  kind: 'sign', spr: 's_haenge', icon: 'd_schild_haenge', text: [50, 16, '#3b2412'] },
  schild_kreide:{ name: 'Kreidetafel',    cat: 'schilder', lv: 8,  price: 120, kind: 'sign', spr: 's_kreide', icon: 'd_schild_kreide', text: [43, 7, '#f2f2ea'] },
  schild_weg:   { name: 'Wegweiser',      cat: 'schilder', lv: 10, price: 200, kind: 'sign', spr: 's_weg', icon: 'd_schild_weg', text: [42, 6, '#3b2412'] },
  schild_messing:{ name: 'Messingschild', cat: 'schilder', lv: 12, price: 400, kind: 'sign', spr: 's_messing', icon: 'd_schild_messing', text: [45, 12, '#5a4210'] },
  katze:        { name: 'Hofkatze mit Kratzbaum', cat: 'leben', lv: 6, price: 900, kind: 'pet', spr: 'd_katze', note: 'Kratzbaum an der Scheune, die Katze streift über den Hof' },
  kueken:       { name: 'Entenküken',     cat: 'leben',  lv: 8,  price: 350,  kind: 'pet', spr: 'd_kueken', note: 'Schwimmen der Entenmama auf dem See hinterher' },
  kraehe:       { name: 'Krähen',         cat: 'leben',  lv: 6,  price: 0,    kind: 'pet', spr: 'd_kraehe', free: 'vogelscheuche', note: 'Kommen von allein, sobald eine Vogelscheuche steht' },
  esel:         { name: 'Esel',           cat: 'leben',  lv: 11, price: 2600, kind: 'pet', spr: 'd_esel', building: 'pferdestall', unlockText: 'mit Pferdestall', note: 'Grast auf den Wiesen rund um den Hof' },
  sandweg:      { name: 'Sandweg',        cat: 'wege', lv: 1,  price: 5,  kind: 'path', spr: 'd_sandweg' },
  pfl_kies:     { name: 'Kies',           cat: 'wege', lv: 3,  price: 8,  kind: 'path', spr: 'd_pfl_kies' },
  pfl_kopf:     { name: 'Kopfsteinpflaster', cat: 'wege', lv: 4, price: 12, kind: 'path', spr: 'd_pfl_kopf' },
  pfl_fein:     { name: 'Feines Pflaster', cat: 'wege', lv: 7, price: 15, kind: 'path', spr: 'd_pfl_fein' },
  pfl_holz:     { name: 'Holzbohlen',     cat: 'wege', lv: 8,  price: 18, kind: 'path', spr: 'd_pfl_holz' },
  pfl_ziegel:   { name: 'Ziegelpflaster', cat: 'wege', lv: 9,  price: 22, kind: 'path', spr: 'd_pfl_ziegel' },
  pfl_platten:  { name: 'Steinplatten',   cat: 'wege', lv: 11, price: 30, kind: 'path', spr: 'd_pfl_platten' },
  pfl_marmor:   { name: 'Marmorplatten',  cat: 'wege', lv: 15, price: 40, kind: 'path', spr: 'd_pfl_marmor' },
  zaun_holz:    { name: 'Holzzaun',       cat: 'zaeune', lv: 2,  price: 10, kind: 'fence', spr: 'd_zaun_holz', pal: ['#6b4423', '#8a5a32'] },
  zaun_staketen:{ name: 'Staketenzaun',   cat: 'zaeune', lv: 4,  price: 14, kind: 'fence', spr: 'd_zaun_staketen', pal: ['#f4efe2', '#d6cdb8'] },
  zaun_weide:   { name: 'Weidenzaun',     cat: 'zaeune', lv: 5,  price: 16, kind: 'fence', spr: 'd_zaun_weide', pal: ['#7d5f36', '#9b7a4c'] },
  zaun_jaeger:  { name: 'Jägerzaun',      cat: 'zaeune', lv: 7,  price: 20, kind: 'fence', spr: 'd_zaun_jaeger', pal: ['#7a4b25', '#a8774a'] },
  zaun_mauer:   { name: 'Steinmauer',     cat: 'zaeune', lv: 9,  price: 26, kind: 'fence', spr: 'd_zaun_mauer', pal: ['#8f969c', '#b0aa9f'] },
  zaun_gruen:   { name: 'Grüne Latten',   cat: 'zaeune', lv: 11, price: 30, kind: 'fence', spr: 'd_zaun_gruen', pal: ['#3f6f3a', '#7cbc70'] },
  zaun_hoch:    { name: 'Sichtschutz',    cat: 'zaeune', lv: 12, price: 36, kind: 'fence', spr: 'd_zaun_hoch', pal: ['#553418', '#7a4b25'] },
  zaun_eisen:   { name: 'Schmiedeeisen',  cat: 'zaeune', lv: 14, price: 45, kind: 'fence', spr: 'd_zaun_eisen', pal: ['#2a2a2e', '#d9b04a'] },
  goldpilz:     { name: 'Goldener Fliegenpilz', cat: 'haendler', lv: 1, price: 600,  kind: 'trader', spr: 'd_goldpilz' },
  kristallmann: { name: 'Kristall-Steinmännchen', cat: 'haendler', lv: 1, price: 900, kind: 'trader', spr: 'd_kristallmann' },
  goldlaterne:  { name: 'Goldene Laterne', cat: 'haendler', lv: 1, price: 1500, kind: 'trader', spr: 'd_goldlaterne', light: 'glow' },
  goldengel:    { name: 'Goldener Engel', cat: 'haendler', lv: 1, price: 12000, kind: 'trader', spr: 'd_goldengel', w: 1, h: 2 },
};
const decoKind = (id) => DECO[id].kind || 'item';
const PET_MAX = { katze: 5, esel: 5, kueken: 4 }; // Tiere mehrfach kaufbar (Küken: je Kauf 3 Stück)
const decoW = (id, text) => (DECO[id].kind === 'sign' ? signW(id, text) : DECO[id].w || 1), decoH = (id) => DECO[id].h || 1; // Schilder: Breite hängt vom Text ab
const decoBeauty = (id) => Math.max(1, Math.round(Math.sqrt(Math.max(10, DECO[id].price)) / 2));

// ---------- Haus-Ausbau und Autos ----------
const HOUSES = {
  haeuschen:    { name: 'Häuschen',      lv: 1,  price: 0,     desc: '1 Stockwerk' },
  familienhaus: { name: 'Familienhaus',  lv: 10, price: 8000,  desc: '2 Stockwerke' },
  landhaus:     { name: 'Landhaus',      lv: 18, price: 40000, desc: 'edel, mit Veranda', need: { stein: 30, eisenerz: 10 } },
};
const HOUSE_PARTS = {
  wall: { weiss: ['Weiß', 1, 0], gelb: ['Gelb', 3, 150], salbei: ['Salbei', 5, 300], rosa: ['Rosa', 7, 500], blau: ['Blau', 11, 1200] },
  roof: { rot: ['Rot', 1, 0], schiefer: ['Schiefer', 3, 150], braun: ['Braun', 5, 300], gruen: ['Grün', 7, 500], blau: ['Blau', 11, 1200] },
  door: { holz: ['Holztür', 1, 0], gruen: ['Grüne Tür', 4, 200], bogen: ['Rundbogentür', 7, 600], doppel: ['Doppeltür', 12, 1500] },
  win:  { klein: ['Fenster', 1, 0], laden: ['Fenster mit Läden', 5, 300], blumen: ['Blumenkasten', 8, 700], gross: ['Großes Fenster', 10, 1200] },
};
const PART_LABEL = { wall: 'Wandfarbe', roof: 'Dachfarbe', door: 'Haustür', win: 'Fenster' };
const CARS = {
  quad:     { name: 'Quad',            lv: 4,  price: 1200,  desc: 'flink über den Hof' },
  kombi:    { name: 'Familienauto',    lv: 8,  price: 4000,  desc: 'Kombi für die ganze Familie' },
  suv:      { name: 'Geländewagen',    lv: 11, price: 9000,  desc: 'kommt überall hin' },
  pickup:   { name: 'Pickup',          lv: 13, price: 15000, desc: 'mit Ladefläche' },
  oldtimer: { name: 'Oldtimer-Pickup', lv: 20, price: 40000, desc: 'edel und selten' },
};

// Meilensteine: stat = Zähler im Spielstand, Belohnung in Münzen + XP
const ACHIEVEMENTS = [
  { id: 'h1', name: 'Erste Ernte',      stat: 'harvested', goal: 10,    money: 30,   xp: 5 },
  { id: 'h2', name: 'Fleißiger Bauer',  stat: 'harvested', goal: 100,   money: 150,  xp: 25 },
  { id: 'h3', name: 'Erntemeister',     stat: 'harvested', goal: 500,   money: 600,  xp: 80 },
  { id: 'h4', name: 'Erntelegende',     stat: 'harvested', goal: 2000,  money: 2500, xp: 250 },
  { id: 'm1', name: 'Erstes Geld',      stat: 'earned',    goal: 200,   money: 50,   xp: 10 },
  { id: 'm2', name: 'Kleinunternehmer', stat: 'earned',    goal: 2000,  money: 300,  xp: 50 },
  { id: 'm3', name: 'Großbauer',        stat: 'earned',    goal: 20000, money: 2000, xp: 200 },
  { id: 'o1', name: 'Lieferservice',    stat: 'orders',    goal: 3,     money: 80,   xp: 15 },
  { id: 'o2', name: 'Zuverlässig',      stat: 'orders',    goal: 20,    money: 400,  xp: 60 },
  { id: 'o3', name: 'Großhändler',      stat: 'orders',    goal: 75,    money: 1500, xp: 200 },
  { id: 'a1', name: 'Tierfreund',       stat: 'animals',   goal: 3,     money: 60,   xp: 10 },
  { id: 'a2', name: 'Bauernhof-Zoo',    stat: 'animals',   goal: 12,    money: 500,  xp: 80 },
  { id: 'p1', name: 'Produzent',        stat: 'produced',  goal: 25,   money: 200,  xp: 30 },
  { id: 'p2', name: 'Fabrikant',        stat: 'produced',  goal: 200,  money: 1200, xp: 150 },
  { id: 'l1', name: 'Landbesitzer',     stat: 'parcels',   goal: 2,     money: 100,  xp: 20 },
  { id: 'l2', name: 'Gutsherr',         stat: 'parcels',   goal: 8,     money: 1500, xp: 200 },
  { id: 'f1', name: 'Angler',           stat: 'fished',    goal: 10,    money: 80,   xp: 15 },
  { id: 'f2', name: 'Petri Heil',       stat: 'fished',    goal: 100,   money: 900,  xp: 120 },
  { id: 't1', name: 'Stadtgründer',     stat: 'projects',  goal: 1,     money: 100,  xp: 20 },
  { id: 't2', name: 'Bürgermeister',    stat: 'projects',  goal: 7,     money: 5000, xp: 500 },
  { id: 'r1', name: 'Pferdezüchter',    stat: 'foals',     goal: 5,     money: 800,  xp: 100 },
  { id: 'r2', name: 'Pferdeflüsterer',  stat: 'coats',     goal: 7,     money: 8000, xp: 800 },
  { id: 'd1', name: 'Blumenhof',        stat: 'deco',      goal: 10,    money: 150,  xp: 30 },
  { id: 'd2', name: 'Prachthof',        stat: 'deco',      goal: 50,    money: 2000, xp: 250 },
  { id: 'b1', name: 'Bergmann',         stat: 'mined',     goal: 50,    money: 1500, xp: 200 },
];
const STAT_LABEL = { harvested: 'Ernte', earned: 'Verdiene Münzen', orders: 'Erfülle Aufträge', animals: 'Besitze Tiere', produced: 'Produziere Waren',
  parcels: 'Kaufe Landstücke', fished: 'Fange Fische', projects: 'Baue Stadtprojekte', foals: 'Züchte Fohlen', coats: 'Entdecke Fellfarben',
  deco: 'Stelle Deko auf', mined: 'Baue im Bergwerk ab' };

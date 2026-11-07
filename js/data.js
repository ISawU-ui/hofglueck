// ===== Spieldaten: hier wird das Balancing eingestellt =====
'use strict';

const TILE = 48;           // Pixel pro Kachel (Welt-Koordinaten)
const MAP_W = 24;          // Kacheln breit
const MAP_H = 16;          // Kacheln hoch
const PARCEL = 4;          // ein Landstück = 4x4 Kacheln
const PARCEL_X0 = 4;       // Landstücke beginnen bei Spalte 4
const PARCEL_Y0 = 2;       // ... und Zeile 2
const PARCEL_COLS = 5;
const PARCEL_ROWS = 3;
const START_PARCELS = [[0, 0], [1, 0]];

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
};

// Pflanzen: Saatgut-Kosten, Wachstum in Sekunden, XP pro Ernte
const CROPS = {
  weizen:    { level: 1,  cost: 1,  time: 10,  xp: 1 },
  karotte:   { level: 2,  cost: 4,  time: 25,  xp: 2 },
  mais:      { level: 3,  cost: 7,  time: 50,  xp: 3 },
  kartoffel: { level: 5,  cost: 14, time: 100, xp: 5 },
  tomate:    { level: 7,  cost: 22, time: 160, xp: 7 },
  kuerbis:   { level: 9,  cost: 38, time: 280, xp: 11 },
  erdbeere:  { level: 12, cost: 65, time: 450, xp: 16 },
};

// Gebäude. kind: 'animal' (Tiere fressen und produzieren), 'factory' (Rezept), 'boost'
const BUILDINGS = {
  huehnerstall: {
    name: 'Hühnerstall', icon: '🐔', kind: 'animal', level: 2, cost: 120, w: 2, h: 2,
    animal: 'huhn', animalName: 'Huhn', animalCost: 35, maxAnimals: 6,
    feed: 'weizen', feedPer: 1, out: 'ei', time: 30, xp: 2,
    color: '#c98b4a', ground: '#d9c27a',
  },
  muehle: {
    name: 'Mühle', icon: '🌬️', kind: 'factory', level: 3, cost: 250, w: 2, h: 2,
    in: { weizen: 3 }, out: 'mehl', time: 20, xp: 3, color: '#b8a089',
  },
  kuhstall: {
    name: 'Kuhstall', icon: '🐄', kind: 'animal', level: 4, cost: 450, w: 2, h: 2,
    animal: 'kuh', animalName: 'Kuh', animalCost: 120, maxAnimals: 4,
    feed: 'mais', feedPer: 1, out: 'milch', time: 60, xp: 5,
    color: '#a0522d', ground: '#9ccf6a',
  },
  sprinkler: {
    name: 'Sprinkler', icon: '💦', kind: 'boost', level: 5, cost: 300, w: 1, h: 1,
    desc: 'Pflanzen im Umkreis wachsen 50 % schneller',
  },
  baeckerei: {
    name: 'Bäckerei', icon: '🥖', kind: 'factory', level: 6, cost: 800, w: 2, h: 2,
    in: { mehl: 1, ei: 1 }, out: 'brot', time: 45, xp: 6, color: '#d98c5f',
  },
  schafweide: {
    name: 'Schafweide', icon: '🐑', kind: 'animal', level: 8, cost: 1100, w: 2, h: 2,
    animal: 'schaf', animalName: 'Schaf', animalCost: 250, maxAnimals: 4,
    feed: 'karotte', feedPer: 2, out: 'wolle', time: 100, xp: 8,
    color: '#7a6a5a', ground: '#8fcf5a',
  },
  kaeserei: {
    name: 'Käserei', icon: '🧀', kind: 'factory', level: 10, cost: 2000, w: 2, h: 2,
    in: { milch: 2 }, out: 'kaese', time: 90, xp: 10, color: '#e0b23c',
  },
};

// Globale Verbesserungen, jede Stufe wird teurer
const UPGRADES = {
  duenger:  { name: 'Dünger',          icon: '🧪', level: 3, base: 150, max: 5, desc: 'Pflanzen wachsen 10 % schneller' },
  haendler: { name: 'Guter Händler',   icon: '🤝', level: 4, base: 250, max: 5, desc: '+10 % Verkaufspreis' },
  glueck:   { name: 'Glückliche Ernte', icon: '🍀', level: 6, base: 400, max: 5, desc: '+8 % Chance auf doppelte Ernte' },
  futter:   { name: 'Kraftfutter',     icon: '🥫', level: 5, base: 350, max: 5, desc: 'Tiere & Gebäude 10 % schneller' },
};
const upgradeCost = (id, lvl) => Math.round(UPGRADES[id].base * Math.pow(2.2, lvl) / 10) * 10;

// XP für den nächsten Level
const xpForLevel = (lvl) => Math.floor(25 * lvl * lvl + 10);

// Landstück-Preis: k = Anzahl schon dazugekaufter Stücke
const parcelCost = (k) => Math.round(200 * Math.pow(1.85, k) / 10) * 10;
// n = wievieltes gekauftes Landstück (1, 2, 3 …) → benötigter Level
const parcelLevel = (n) => 2 * n;

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
];

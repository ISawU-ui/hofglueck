// ===== HTML-Oberfläche: Leiste oben, Werkzeuge, Seitenpanel, Popups =====
'use strict';

const $ = (s) => document.querySelector(s);
const TABS = [
  { id: 'shop', icon: '🏪', label: 'Shop' },
  { id: 'scheune', icon: '📦', label: 'Scheune' },
  { id: 'auftraege', icon: '📋', label: 'Aufträge' },
  { id: 'upgrades', icon: '⬆️', label: 'Upgrades' },
  { id: 'erfolge', icon: '🏆', label: 'Ziele' },
];
let tab = 'auftraege';
const lastHtml = {};
const modalQueue = [];

function setHtml(el, html) { if (lastHtml[el.id] !== html) { el.innerHTML = html; lastHtml[el.id] = html; } }
const fmt = (n) => Math.floor(n).toLocaleString('de-DE');
const itemList = (req, check) => Object.entries(req).map(([k, n]) =>
  `<span class="${check && inv(k) < n ? 'miss' : ''}">${n}× ${ITEMS[k].icon}${check ? ` <small>(${inv(k)})</small>` : ''}</span>`).join(' ');

function initUI() {
  $('#tabs').innerHTML = TABS.map((t) => `<button data-tab="${t.id}" title="${t.label}">${t.icon}<span class="tl"> ${t.label}</span><b class="badge" hidden></b></button>`).join('');
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    sfx('click');
    // Handy: Reiter öffnet/schließt das Menü über der Farm
    if (isCompact() && $('#panel').classList.contains('open') && tab === b.dataset.tab) closeDrawer();
    else openTab(b.dataset.tab);
  });
  // alle Knöpfe arbeiten über data-act="aktion:parameter"
  document.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const [act, arg] = b.dataset.act.split(':');
    handleAct(act, arg);
    renderUI();
  });
  // Vollbild: nur anzeigen, wo der Browser es erlaubt (iPhone erlaubt es Webseiten nicht)
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  if (document.fullscreenEnabled || document.webkitFullscreenEnabled) $('#fullscreen').hidden = false;
  $('#fullscreen').addEventListener('click', async () => {
    const root = document.documentElement;
    try {
      if (fsEl()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else {
        await (root.requestFullscreen ? root.requestFullscreen({ navigationUI: 'hide' }) : root.webkitRequestFullscreen());
        try { await screen.orientation.lock('landscape'); } catch (e) { /* nicht überall erlaubt */ }
      }
    } catch (e) { toast('Vollbild ist hier leider nicht möglich', 'bad'); }
  });
  // iPhone in Safari (nicht als App, nicht eingebettet): einmal erklären, wie es randlos geht
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let topLevel = true; try { topLevel = window.self === window.top; } catch (e) { topLevel = false; }
  let hinted = false; try { hinted = localStorage.getItem('hofglueck_homescreen') === '1'; } catch (e) {}
  if (isIOS && topLevel && !navigator.standalone && !hinted) {
    try { localStorage.setItem('hofglueck_homescreen', '1'); } catch (e) {}
    modalQueue.push(`<h2>📲 Als App spielen</h2><p>Für Vollbild ohne Ränder: Tippe in Safari auf <b>Teilen</b> <span aria-hidden="true">⬆️</span>
      und dann auf <b>„Zum Home-Bildschirm“</b>. Danach startest du Hofglück über das neue Symbol.</p><button data-act="close">Verstanden</button>`);
    setTimeout(() => { if ($('#modal').hidden && modalQueue.length) openModal(modalQueue.shift()); }, 800);
  }
  $('#sound').addEventListener('click', () => { muted = !muted; $('#sound').textContent = muted ? '🔇' : '🔊'; });
  $('#reset').addEventListener('click', () => openModal(`<h2>Neu anfangen?</h2><p>Dein ganzer Fortschritt wird gelöscht.</p>
    <div class="row"><button data-act="close">Abbrechen</button><button class="danger" data-act="reset">Löschen</button></div>`));
}

function handleAct(act, arg) {
  switch (act) {
    case 'tool': S.tool = arg; S.placing = null; sfx('click'); break;
    case 'build': S.placing = arg; closeDrawer(); toast('Tippe auf freies Land, um zu bauen (Esc = abbrechen)'); break;
    case 'sell': sell(arg, 1); break;
    case 'sellall': sell(arg, inv(arg)); break;
    case 'order': completeOrder(+arg); break;
    case 'skip': skipOrder(+arg); break;
    case 'upgrade': buyUpgrade(arg); break;
    case 'claim': claim(arg); break;
    case 'parcel': if (buyParcel(+arg)) { toast('Neues Land gekauft! 🎉', 'good'); if (cam.auto) resetCam(); } closeModal(); break;
    case 'animal': buyAnimal(+arg); openBuilding(+arg); break;
    case 'start': startJob(G.buildings[arg]); openBuilding(+arg); break;
    case 'collect': collect(G.buildings[arg]); openBuilding(+arg); break;
    case 'demolish': demolish(+arg); closeModal(); break;
    case 'reset': resetGame(); closeModal(); break;
    case 'gotab': closeModal(); openTab(arg); break;
    case 'close': closeModal(); break;
  }
}

function openTab(id) { tab = id; $('#panel').classList.add('open'); renderUI(); }
// schließt das Handy-Menü; gibt true zurück, wenn es offen war
function closeDrawer() {
  const p = $('#panel');
  if (!isCompact() || !p.classList.contains('open')) return false;
  p.classList.remove('open'); renderUI(); return true;
}

// ---------- regelmäßiges Aktualisieren ----------
function renderUI() {
  $('#money').textContent = fmt(G.money);
  $('#level').textContent = G.level;
  const need = xpForLevel(G.level);
  $('#xpfill').style.width = Math.min(100, (G.xp / need) * 100) + '%';
  $('#xptext').textContent = fmt(G.xp) + ' / ' + fmt(need) + ' XP';
  setHtml($('#goal'), '🎯 ' + currentGoal());

  // Werkzeugleiste
  let tools = '';
  let k = 1;
  for (const [id, c] of Object.entries(CROPS)) {
    const locked = G.level < c.level;
    tools += `<button class="tool ${S.tool === id && !S.placing ? 'sel' : ''}" ${locked ? 'disabled' : ''} data-act="tool:${id}" title="${ITEMS[id].name}: ${c.time}s Wachstum, verkauft für ${sellPrice(id)}">
      <span class="ic">${locked ? '🔒' : ITEMS[id].icon}</span><small>${locked ? 'Lv ' + c.level : '💰' + c.cost}</small><i>${k++}</i></button>`;
  }
  tools += `<button class="tool ${S.tool === 'schaufel' && !S.placing ? 'sel' : ''}" data-act="tool:schaufel" title="Schaufel: Pflanzen entfernen / Boden zu Gras">
    <span class="ic">⛏️</span><small>Weg</small><i>S</i></button>`;
  setHtml($('#toolbar'), tools);

  // Reiter + Abzeichen
  const counts = { auftraege: G.orders.filter((o) => o.wait === undefined && hasAll(o.items)).length, erfolge: claimable().length };
  document.querySelectorAll('#tabs button').forEach((b) => {
    b.classList.toggle('sel', b.dataset.tab === tab);
    const n = counts[b.dataset.tab] || 0, bd = b.querySelector('.badge');
    bd.hidden = !n; bd.textContent = n;
  });
  setHtml($('#content'), ({ shop: shopHtml, scheune: barnHtml, auftraege: ordersHtml, upgrades: upgradesHtml, erfolge: achHtml })[tab]());
  if (openBuildingId && $('#modal').dataset.kind === 'building') openBuilding(openBuildingId, true);
}

function shopHtml() {
  const next = nextParcelInfo();
  let h = '<h3>Gebäude & Tiere</h3>';
  for (const [id, d] of Object.entries(BUILDINGS)) {
    const locked = G.level < d.level, poor = G.money < d.cost;
    let info = d.kind === 'animal' ? `Frisst ${d.feedPer}× ${ITEMS[d.feed].icon} → ${ITEMS[d.out].icon} pro Tier (${d.time}s)`
      : d.kind === 'factory' ? `${itemList(d.in)} → ${ITEMS[d.out].icon} ${ITEMS[d.out].name} (${d.time}s)` : d.desc;
    h += `<div class="card ${locked ? 'locked' : ''}"><div class="big">${locked ? '🔒' : d.icon}</div>
      <div class="grow"><b>${d.name}</b> <small>${d.w}×${d.h}</small><br><small>${info}</small></div>
      <button data-act="build:${id}" ${locked || poor ? 'disabled' : ''}>${locked ? 'Level ' + d.level : '💰 ' + fmt(d.cost)}</button></div>`;
  }
  h += `<h3>Land</h3><div class="card"><div class="big">🗺️</div><div class="grow">Klicke auf ein Holzschild am Zaun, um ein neues Landstück zu kaufen.<br>
    <small>Nächstes: 💰 ${fmt(next.cost)} · ab Level ${next.level}</small></div></div>`;
  return h;
}

function barnHtml() {
  const ids = Object.keys(ITEMS).filter((id) => inv(id) > 0);
  if (!ids.length) return '<p class="empty">Die Scheune ist leer. Ernte etwas! 🌾</p>';
  const total = ids.reduce((s, id) => s + inv(id) * sellPrice(id), 0);
  let h = `<p class="hint">Gesamtwert: <b>💰 ${fmt(total)}</b> · Tipp: Aufträge zahlen mehr als der Verkauf!</p>`;
  for (const id of ids) {
    h += `<div class="card"><div class="big">${ITEMS[id].icon}</div><div class="grow"><b>${ITEMS[id].name}</b> × ${inv(id)}<br><small>je 💰 ${sellPrice(id)}</small></div>
      <button data-act="sell:${id}">1 verkaufen</button><button data-act="sellall:${id}">Alle (${fmt(inv(id) * sellPrice(id))})</button></div>`;
  }
  return h;
}

function ordersHtml() {
  let h = '<p class="hint">Liefere Waren für Bonusgeld und viele XP.</p>';
  G.orders.forEach((o, i) => {
    if (o.wait !== undefined) { h += `<div class="card order wait">🚚 Neuer Auftrag kommt in ${Math.ceil(Math.max(0, o.wait))}s …</div>`; return; }
    const ok = hasAll(o.items);
    h += `<div class="card order ${ok ? 'ready' : ''}"><div class="grow"><b>${o.who}</b><br>${itemList(o.items, true)}<br>
      <small>Belohnung: 💰 ${fmt(o.money)} · ⭐ ${o.xp} XP</small></div>
      <div class="col"><button data-act="order:${i}" ${ok ? '' : 'disabled'}>Liefern</button><button class="ghost" data-act="skip:${i}">Ablehnen</button></div></div>`;
  });
  return h;
}

function upgradesHtml() {
  let h = '';
  for (const [id, u] of Object.entries(UPGRADES)) {
    const l = upg(id), locked = G.level < u.level, max = l >= u.max, cost = upgradeCost(id, l);
    h += `<div class="card ${locked ? 'locked' : ''}"><div class="big">${locked ? '🔒' : u.icon}</div>
      <div class="grow"><b>${u.name}</b> <small>Stufe ${l}/${u.max}</small><br><small>${u.desc}</small>
      <div class="pips">${'●'.repeat(l)}${'○'.repeat(u.max - l)}</div></div>
      <button data-act="upgrade:${id}" ${locked || max || G.money < cost ? 'disabled' : ''}>${locked ? 'Level ' + u.level : max ? 'MAX' : '💰 ' + fmt(cost)}</button></div>`;
  }
  return h;
}

function achHtml() {
  const list = ACHIEVEMENTS.filter((a) => !G.claimed[a.id]);
  const done = ACHIEVEMENTS.length - list.length;
  let h = `<p class="hint">${done} / ${ACHIEVEMENTS.length} Ziele erreicht</p>`;
  // pro Kategorie nur das nächste Ziel zeigen
  const seen = {};
  for (const a of list) {
    if (seen[a.stat]) continue; seen[a.stat] = true;
    const v = Math.min(statValue(a.stat), a.goal), ok = v >= a.goal;
    const label = { harvested: 'Ernte', earned: 'Verdiene Münzen', orders: 'Erfülle Aufträge', animals: 'Besitze Tiere', produced: 'Produziere Waren', parcels: 'Kaufe Landstücke' }[a.stat];
    h += `<div class="card ${ok ? 'ready' : ''}"><div class="big">🏆</div><div class="grow"><b>${a.name}</b><br><small>${label}: ${fmt(v)} / ${fmt(a.goal)}</small>
      <div class="bar"><i style="width:${(v / a.goal) * 100}%"></i></div><small>💰 ${a.money} · ⭐ ${a.xp} XP</small></div>
      <button data-act="claim:${a.id}" ${ok ? '' : 'disabled'}>Abholen</button></div>`;
  }
  return h;
}

// ---------- Popups ----------
function openModal(html, kind = '') {
  const m = $('#modal');
  m.dataset.kind = kind; $('#modalbox').innerHTML = html; m.hidden = false;
}
function closeModal() {
  $('#modal').hidden = true; $('#modal').dataset.kind = ''; openBuildingId = null;
  if (modalQueue.length) { const next = modalQueue.shift(); setTimeout(() => openModal(next), 150); }
}

let openBuildingId = null;
function openBuilding(id, refresh) {
  const b = G.buildings[id];
  if (!b) { closeModal(); return; }
  const d = BUILDINGS[b.type];
  openBuildingId = id;
  let status = '', btns = '';
  if (d.kind === 'boost') status = d.desc;
  else {
    const r = recipe(b);
    if (b.job && b.job.p >= 1) { status = `✅ Fertig: ${b.job.qty}× ${ITEMS[b.job.out].icon}`; btns += `<button data-act="collect:${id}">Einsammeln</button>`; }
    else if (b.job) status = `⏳ Arbeitet … noch ${fmtTime((1 - b.job.p) * b.job.dur / prodMul())}<div class="bar"><i style="width:${b.job.p * 100}%"></i></div>`;
    else { status = `Benötigt: ${itemList(r.in, true)} → ${r.qty}× ${ITEMS[r.out].icon}`; btns += `<button data-act="start:${id}" ${hasAll(r.in) ? '' : 'disabled'}>${d.kind === 'animal' ? 'Füttern' : 'Starten'}</button>`; }
    if (d.kind === 'animal') {
      const full = b.animals >= d.maxAnimals;
      status += `<p>${d.animalName}: <b>${b.animals} / ${d.maxAnimals}</b> – mehr Tiere = mehr Ertrag pro Runde</p>`;
      btns += `<button data-act="animal:${id}" ${full || G.money < d.animalCost ? 'disabled' : ''}>${full ? 'Stall voll' : '+1 ' + d.animalName + ' (💰 ' + d.animalCost + ')'}</button>`;
    }
  }
  const html = `<h2>${d.icon} ${d.name}</h2><div class="status">${status}</div>
    <div class="row">${btns}</div><div class="row"><button class="ghost danger" data-act="demolish:${id}">Abreißen</button><button class="ghost" data-act="close">Schließen</button></div>`;
  if (refresh) { if (lastHtml.modal !== html) { $('#modalbox').innerHTML = html; lastHtml.modal = html; } }
  else { openModal(html, 'building'); lastHtml.modal = html; }
}

function askParcel(i) {
  const { cost, level } = nextParcelInfo();
  const ok = G.level >= level, rich = G.money >= cost;
  openModal(`<h2>🗺️ Neues Landstück</h2><p>4×4 Felder mehr Platz für Äcker und Gebäude.</p>
    <p><b>💰 ${fmt(cost)}</b> · benötigt Level ${level}</p>
    ${!ok ? `<p class="miss">Du brauchst Level ${level}.</p>` : !rich ? '<p class="miss">Nicht genug Geld.</p>' : ''}
    <div class="row"><button class="ghost" data-act="close">Abbrechen</button><button data-act="parcel:${i}" ${ok && rich ? '' : 'disabled'}>Kaufen</button></div>`);
}

function onLevelUp(lvl, bonus) {
  sfx('levelup');
  const u = unlocksAt(lvl);
  const k = G.stats.parcels;
  const land = parcelLevel(k + 1) === lvl ? '<li>🗺️ Neues Landstück kaufbar</li>' : '';
  const html = `<div class="levelup"><div class="star">⭐</div><h2>Level ${lvl}!</h2><p>Bonus: <b>+${bonus} 💰</b></p>
    ${u.length || land ? '<h3>Neu freigeschaltet</h3><ul>' + u.map((x) => '<li>' + x + '</li>').join('') + land + '</ul>' : ''}
    <button data-act="close">Weiter</button></div>`;
  confetti();
  if ($('#modal').hidden) openModal(html); else modalQueue.push(html);
}

function confetti() {
  for (let i = 0; i < 60; i++) {
    const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 260;
    FX.parts.push({ x: WORLD_W / 2, y: WORLD_H / 3, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 150, life: 1.2 + Math.random(),
      color: ['#ffd34d', '#ff6b6b', '#6bcBff', '#7ed957', '#d58cff'][i % 5], size: 5 + Math.random() * 4 });
  }
}

function toast(text, kind = '') {
  if (kind === 'bad') sfx('bad');
  const t = document.createElement('div');
  t.className = 'toast ' + kind; t.textContent = text;
  $('#toasts').appendChild(t);
  while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
  setTimeout(() => t.classList.add('out'), 2200);
  setTimeout(() => t.remove(), 2700);
}

// ===== HTML-Oberfläche: Leiste oben, Werkzeuge, Seitenpanel, Popups =====
'use strict';

const $ = (s) => document.querySelector(s);
const TABS = [
  { id: 'shop', icon: '🏪', label: 'Shop' },
  { id: 'scheune', icon: '📦', label: 'Scheune' },
  { id: 'auftraege', icon: '📋', label: 'Aufträge' },
  { id: 'stadt', icon: '🏘️', label: 'Stadt' },
  { id: 'upgrades', icon: '⬆️', label: 'Upgrades' },
  { id: 'erfolge', icon: '🏆', label: 'Ziele' },
];
let tab = 'auftraege';
const lastHtml = {};
const modalQueue = [];
let modalOpenedAt = 0;

function setHtml(el, html) { if (el && lastHtml[el.id] !== html) { el.innerHTML = html; lastHtml[el.id] = html; } }
const fmt = (n) => Math.floor(n).toLocaleString('de-DE');
const itemList = (req, check) => Object.entries(req).map(([k, n]) =>
  `<span class="${check && inv(k) < n ? 'miss' : ''}">${n}× ${ITEMS[k].icon}${check ? ` <small>(${inv(k)})</small>` : ''}</span>`).join(' ');
// Popup gerade erst aufgegangen? Dann ist ein Klick darin meist der „Nachklapp“ des Tippens, das es geöffnet hat
const modalJustOpened = () => performance.now() - modalOpenedAt < 400;

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
    if (b.closest('#modal') && modalJustOpened()) return;
    // Knöpfe mit data-confirm brauchen einen zweiten Tipp
    if (b.dataset.confirm && !b.classList.contains('armed')) {
      b.classList.add('armed'); b.dataset.label = b.innerHTML; b.innerHTML = b.dataset.confirm;
      setTimeout(() => { if (b.isConnected) { b.classList.remove('armed'); b.innerHTML = b.dataset.label; } }, 2500);
      return;
    }
    const [act, ...args] = b.dataset.act.split(':');
    handleAct(act, args.join(':'));
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
  }
  $('#sound').addEventListener('click', () => { muted = !muted; $('#sound').textContent = muted ? '🔇' : '🔊'; });
  $('#help').addEventListener('click', () => { sfx('click'); showIntro(0); });
  $('#reset').addEventListener('click', () => openModal(`<h2>Neu anfangen?</h2><p>Dein ganzer Fortschritt wird gelöscht.</p>
    <div class="row"><button data-act="close">Abbrechen</button><button class="danger" data-act="reset" data-confirm="Wirklich löschen?">Löschen</button></div>`));
}

function handleAct(act, arg) {
  switch (act) {
    case 'tool': S.tool = arg; S.placing = null; sfx('click'); break;
    case 'build': startPlacing(arg); break;
    case 'placeok': confirmPlace(); break;
    case 'placecancel': S.placing = null; S.hover = null; break;
    case 'sell': sell(arg, 1); break;
    case 'sellall': sell(arg, inv(arg)); break;
    case 'order': completeOrder(+arg); break;
    case 'skip': skipOrder(+arg); break;
    case 'upgrade': buyUpgrade(arg); break;
    case 'claim': claim(arg); break;
    case 'project': if (buildProject(arg)) { toast(PROJECTS[arg].icon + ' ' + PROJECTS[arg].name + ' gebaut! ' + PROJECTS[arg].bonus, 'good'); confetti(); } break;
    case 'gotown': closeDrawer(); focusTown(); break;
    case 'parcel': if (buyParcel(+arg)) { toast('Neues Land gekauft! 🎉', 'good'); if (cam.auto) resetCam(); } closeModal(); break;
    case 'building': openBuilding(+arg); break;
    case 'animal': buyAnimal(+arg); openBuilding(+arg); break;
    case 'horse': buyHorse(+arg); openBuilding(+arg); break;
    case 'sellhorse': { const [id, i] = arg.split(':').map(Number); sellHorse(id, i); openBuilding(id); break; }
    case 'keepfoal': keepFoal(+arg); openBuilding(+arg); break;
    case 'sellfoal': sellFoal(+arg); openBuilding(+arg); break;
    case 'start': startJob(G.buildings[arg]); openBuilding(+arg); break;
    case 'collect': {
      const b = G.buildings[arg]; if (!b) break;
      if (b.foal) { onFoal(b, false); break; }
      collect(b); if (!b.foal) openBuilding(+arg);
      break;
    }
    case 'askdemolish': askDemolish(+arg); break;
    case 'demolish': demolish(+arg); closeModal(); break;
    case 'fish': fishTap(); break;
    case 'intro': showIntro(+arg); break;
    case 'introdone': G.introDone = true; save(); closeModal(); break;
    case 'newsdone': G.seen = NEWS_VERSION; save(); closeModal(); break;
    case 'reset': resetGame(); closeModal(); resetCam(); showIntro(0); break;
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

// ---------- Bauen mit Vorschau ----------
function startPlacing(type) {
  S.placing = type; closeDrawer();
  S.hover = findSpot(type);
  toast(isTouch() ? 'Tippe oder ziehe dorthin, wo es stehen soll – dann ✔ Bauen' : 'Klicke auf freies Land, um zu bauen (Esc = abbrechen)');
}
// freier Platz möglichst nahe der Bildschirmmitte, damit die Vorschau gleich sichtbar ist
function findSpot(type) {
  const c = availCenter(), w = screenToWorld(c.x, c.y), d = BUILDINGS[type];
  let best = null, bd = 1e9;
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (!canPlace(type, x, y)) continue;
    const dist = Math.hypot((x + d.w / 2) * TILE - w.x, (y + d.h / 2) * TILE - w.y);
    if (dist < bd) { bd = dist; best = { x, y }; }
  }
  return best;
}
function confirmPlace() {
  const type = S.placing, h = S.hover;
  if (!type || !h) return;
  if (placeBuilding(type, h.x, h.y)) {
    const d = BUILDINGS[type];
    toast(d.name + (d.kind === 'tree' ? ' gepflanzt! Die Früchte wachsen von allein.' : ' gebaut! Tippe darauf, um zu starten.'), 'good');
    S.placing = null; S.hover = null;
  } else toast(G.money < BUILDINGS[type].cost ? 'Nicht genug Geld!' : 'Hier ist kein Platz (nur auf freiem, eigenem Land).', 'bad');
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
  let tools = `<button class="tool ${S.tool === 'hand' && !S.placing ? 'sel' : ''}" data-act="tool:hand" title="Hand: nur umsehen und ernten, nichts säen">
    <span class="ic">✋</span><small>Umsehen</small><i>H</i></button>`;
  let k = 1;
  for (const [id, c] of Object.entries(CROPS)) {
    const locked = G.level < c.level;
    tools += `<button class="tool ${S.tool === id && !S.placing ? 'sel' : ''}" ${locked ? 'disabled' : ''} data-act="tool:${id}" title="${ITEMS[id].name}: ${c.time}s Wachstum, verkauft für ${sellPrice(id)}">
      <span class="ic">${locked ? '🔒' : ITEMS[id].icon}</span><small>${locked ? 'Lv ' + c.level : '💰' + c.cost}</small><i>${k++}</i></button>`;
  }
  tools += `<button class="tool ${S.tool === 'schaufel' && !S.placing ? 'sel' : ''}" data-act="tool:schaufel" title="Spitzhacke: Pflanzen entfernen (Saatgut zurück) / Boden zu Gras">
    <span class="ic">⛏️</span><small>Weg</small><i>S</i></button>`;
  setHtml($('#toolbar'), tools);

  // Bau-Leiste (Vorschau bestätigen)
  const pb = $('#placebar');
  pb.hidden = !S.placing;
  if (S.placing) {
    const d = BUILDINGS[S.placing], ok = S.hover && canPlace(S.placing, S.hover.x, S.hover.y);
    setHtml($('#placeinfo'), `${d.icon} <b>${d.name}</b> · 💰 ${fmt(d.cost)}${ok ? '' : ' · <span class="miss">hier kein Platz</span>'}`);
    $('#placeok').disabled = !ok || G.money < d.cost;
  }

  // Reiter + Abzeichen
  const step = tutorialStep();
  const counts = {
    auftraege: G.orders.filter((o) => o.wait === undefined && hasAll(o.items)).length,
    erfolge: claimable().length,
    stadt: Object.keys(PROJECTS).filter((id) => projectState(id) === 'ready').length,
  };
  const hintTab = step && step.target === 'shop' && G.level >= 2 ? 'shop' : step && step.target === 'tafel' && counts.auftraege ? 'auftraege' : null;
  document.querySelectorAll('#tabs button').forEach((b) => {
    b.classList.toggle('sel', b.dataset.tab === tab);
    b.classList.toggle('hint', b.dataset.tab === hintTab && !(tab === hintTab && $('#panel').classList.contains('open')));
    const n = counts[b.dataset.tab] || 0, bd = b.querySelector('.badge');
    bd.hidden = !n; bd.textContent = n;
  });
  setHtml($('#content'), ({ shop: shopHtml, scheune: barnHtml, auftraege: ordersHtml, stadt: townHtml, upgrades: upgradesHtml, erfolge: achHtml })[tab]());
  if (openBuildingId && $('#modal').dataset.kind === 'building') openBuilding(openBuildingId, true);
  if ($('#modal').dataset.kind === 'pond') fishInfo();
}

function shopCard(id, d) {
  const locked = G.level < d.level, poor = G.money < d.cost;
  const info = d.kind === 'animal' ? `Frisst ${d.feedPer}× ${ITEMS[d.feed].icon} → ${ITEMS[d.out].icon} pro Tier (${d.time}s)`
    : d.kind === 'factory' ? `${itemList(d.in)} → ${ITEMS[d.out].icon} ${ITEMS[d.out].name} (${d.time}s)`
    : d.kind === 'tree' ? `Trägt alle ${fmtTime(d.time)} ${d.qty}× ${ITEMS[d.out].icon} – ohne Saatgut`
    : d.kind === 'horse' ? `${d.desc}. Futter: ${itemList(d.in)}` : d.desc;
  return `<div class="card ${locked ? 'locked' : ''}"><div class="big">${locked ? '🔒' : d.icon}</div>
    <div class="grow"><b>${d.name}</b> <small>${d.w}×${d.h}</small><br><small>${info}</small></div>
    <button data-act="build:${id}" ${locked || poor ? 'disabled' : ''}>${locked ? 'Level ' + d.level : '💰 ' + fmt(d.cost)}</button></div>`;
}
function shopHtml() {
  const next = nextParcelInfo();
  const groups = [['Tiere', ['animal', 'horse']], ['Verarbeitung', ['factory']], ['Obstbäume', ['tree']], ['Hilfen', ['boost']]];
  let h = '';
  for (const [title, kinds] of groups) {
    const list = Object.entries(BUILDINGS).filter(([, d]) => kinds.includes(d.kind)).sort((a, b) => a[1].level - b[1].level);
    h += `<h3>${title}</h3>` + list.map(([id, d]) => shopCard(id, d)).join('');
  }
  h += `<h3>Land</h3><div class="card"><div class="big">🗺️</div><div class="grow">${TAP()} auf ein Holzschild am Zaun, um ein neues Landstück zu kaufen.<br>
    <small>Nächstes: 💰 ${fmt(next.cost)} · ab Level ${next.level}</small></div></div>`;
  return h;
}

function barnHtml() {
  const ids = Object.keys(ITEMS).filter((id) => inv(id) > 0);
  if (!ids.length) return '<p class="empty">Die Scheune ist leer. Ernte etwas! 🌾</p>';
  const total = ids.reduce((s, id) => s + sellValue(id, inv(id)).sum, 0);
  let h = `<p class="hint">Gesamtwert: <b>💰 ${fmt(total)}</b><br>Wer viel vom Gleichen verkauft, drückt den Preis 📉 – er erholt sich mit der Zeit.
    <b>Aufträge zahlen immer voll!</b></p>`;
  for (const id of ids) {
    const f = marketFactor(id), drop = Math.round((1 - f) * 100);
    h += `<div class="card"><div class="big">${ITEMS[id].icon}</div><div class="grow"><b>${ITEMS[id].name}</b> × ${inv(id)}<br><small>je 💰 ${sellPrice(id)}</small>
      ${drop >= 3 ? `<small class="down">📉 −${drop} %</small>` : ''}</div>
      <button data-act="sell:${id}">1 verkaufen</button><button data-act="sellall:${id}">Alle (${fmt(sellValue(id, inv(id)).sum)})</button></div>`;
  }
  return h;
}

function ordersHtml() {
  let h = '<p class="hint">Liefere Waren für Bonusgeld und viele XP.</p>';
  G.orders.forEach((o, i) => {
    if (o.wait !== undefined) { h += `<div class="card order wait">🚚 Neuer Auftrag kommt in ${Math.ceil(Math.max(0, o.wait))}s …</div>`; return; }
    const ok = hasAll(o.items);
    h += `<div class="card order ${ok ? 'ready' : ''}"><div class="grow"><b>${o.who}</b><br>${itemList(o.items, true)}<br>
      <small>Belohnung: 💰 ${fmt(o.money * orderMul())} · ⭐ ${Math.round(o.xp * xpMul())} XP</small></div>
      <div class="col"><button data-act="order:${i}" ${ok ? '' : 'disabled'}>Liefern</button><button class="ghost" data-act="skip:${i}">Ablehnen</button></div></div>`;
  });
  return h;
}

function townHtml() {
  const n = Object.keys(PROJECTS).filter(built).length;
  let h = `<p class="hint">🏘️ <b>${TOWN_NAME}</b> wächst mit deinen Waren: Jedes Projekt bringt einen dauerhaften Bonus.
    · ${n} / ${Object.keys(PROJECTS).length} gebaut · 👥 ${fmt(townPeople())} Einwohner</p>
    <button class="wide" data-act="gotown">📍 Stadt ansehen</button>`;
  for (const [id, t] of Object.entries(PROJECTS)) {
    const st = projectState(id);
    h += `<div class="card ${st === 'locked' ? 'locked' : st === 'ready' ? 'ready' : ''}"><div class="big">${st === 'locked' ? '🔒' : t.icon}</div>
      <div class="grow"><b>${t.name}</b>${st === 'built' ? ' ✔' : ''}<br><small>${t.bonus}</small>
      ${st === 'built' ? '' : `<br><small><span class="${G.money < t.cost ? 'miss' : ''}">💰 ${fmt(t.cost)}</span> + ${itemList(t.items, true)}</small>`}</div>
      <button data-act="project:${id}" ${st === 'ready' ? '' : 'disabled'}>${st === 'built' ? 'Gebaut' : st === 'locked' ? 'Level ' + t.level : 'Bauen'}</button></div>`;
  }
  return h;
}
const townPeople = () => 120 + Object.keys(PROJECTS).filter(built).length * 85 + G.level * 6;

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
    h += `<div class="card ${ok ? 'ready' : ''}"><div class="big">🏆</div><div class="grow"><b>${a.name}</b><br><small>${STAT_LABEL[a.stat]}: ${fmt(v)} / ${fmt(a.goal)}</small>
      <div class="bar"><i style="width:${(v / a.goal) * 100}%"></i></div><small>💰 ${a.money} · ⭐ ${a.xp} XP</small></div>
      <button data-act="claim:${a.id}" ${ok ? '' : 'disabled'}>Abholen</button></div>`;
  }
  return h;
}

// ---------- Popups ----------
function openModal(html, kind = '') {
  const m = $('#modal');
  if (m.dataset.kind === 'pond' && kind !== 'pond') fishStop();
  m.dataset.kind = kind; $('#modalbox').innerHTML = html; m.hidden = false;
  modalOpenedAt = performance.now();
}
function closeModal() {
  if ($('#modal').dataset.kind === 'pond') fishStop();
  $('#modal').hidden = true; $('#modal').dataset.kind = ''; openBuildingId = null;
  if (modalQueue.length) { const next = modalQueue.shift(); setTimeout(() => openModal(next), 150); }
}

let openBuildingId = null;
// Aufbau bleibt immer gleich (Haupt-Knopf oben, Abreißen klein ganz unten), damit nichts unter den Finger rutscht
function openBuilding(id, refresh) {
  const b = G.buildings[id];
  if (!b) { closeModal(); return; }
  const d = BUILDINGS[b.type];
  openBuildingId = id;
  let status = '', btns = '', extra = '';
  if (d.kind === 'boost') { status = d.desc; btns = '<button disabled>💦 Läuft immer</button>'; }
  else if (d.kind === 'tree') {
    if (b.job && b.job.p >= 1) { status = `✅ Reif: ${b.job.qty}× ${ITEMS[d.out].icon}`; btns = `<button data-act="collect:${id}">Pflücken</button>`; }
    else { status = `🌳 Früchte wachsen … noch ${fmtTime((1 - (b.job ? b.job.p : 0)) * d.time / prodMul())}<div class="bar"><i style="width:${(b.job ? b.job.p : 0) * 100}%"></i></div>`;
      btns = '<button disabled>Wächst …</button>'; }
    status += `<p>Trägt alle ${fmtTime(d.time)} ${d.qty}× ${ITEMS[d.out].icon} ${ITEMS[d.out].name} – ganz ohne Saatgut.</p>`;
  } else if (d.kind === 'horse') {
    const r = recipe(b);
    if (b.foal) { status = '🐴 Ein Fohlen wartet auf dich!'; btns = `<button data-act="collect:${id}">Fohlen ansehen</button>`; }
    else if (b.job && b.job.p >= 1) { status = '✅ Ein Fohlen ist geboren!'; btns = `<button data-act="collect:${id}">Fohlen ansehen</button>`; }
    else if (b.job) { status = `❤️ Fohlen kommt … noch ${fmtTime((1 - b.job.p) * b.job.dur / prodMul())}<div class="bar"><i style="width:${b.job.p * 100}%"></i></div>`; btns = '<button disabled>Züchtet …</button>'; }
    else if (b.horses.length < 2) { status = 'Kaufe ein zweites Pferd – dann können sie Fohlen bekommen.'; btns = '<button disabled>Züchten</button>'; }
    else { status = `Futter für ein Fohlen: ${itemList(r.in, true)}`; btns = `<button data-act="start:${id}" ${hasAll(r.in) ? '' : 'disabled'}>Züchten</button>`; }
    const full = b.horses.length >= d.maxAnimals;
    btns += `<button data-act="horse:${id}" ${full || G.money < d.animalCost ? 'disabled' : ''}>${full ? 'Stall voll' : '+1 Pferd (💰 ' + d.animalCost + ')'}</button>`;
    extra = `<div class="horses">${b.horses.map((c, i) => `<div class="hrow">${coatDot(c)}<span><b>${COATS[c].name}</b> ${tierTag(c)}</span>
      <button class="ghost" data-act="sellhorse:${id}:${i}" data-confirm="Sicher?">💰 ${fmt(horseValue(c))}</button></div>`).join('')}</div>
      <p class="small">Sammlung: ${Object.keys(G.coats).length} / ${Object.keys(COATS).length} Fellfarben ${Object.keys(COATS).map((c) => G.coats[c] ? coatDot(c) : '<i class="coat unknown">?</i>').join('')}</p>`;
  } else {
    const r = recipe(b);
    if (b.job && b.job.p >= 1) { status = `✅ Fertig: ${b.job.qty}× ${ITEMS[b.job.out].icon}`; btns = `<button data-act="collect:${id}">Einsammeln</button>`; }
    else if (b.job) { status = `⏳ Arbeitet … noch ${fmtTime((1 - b.job.p) * b.job.dur / prodMul())}<div class="bar"><i style="width:${b.job.p * 100}%"></i></div>`; btns = '<button disabled>Arbeitet …</button>'; }
    else { status = `Benötigt: ${itemList(r.in, true)} → ${r.qty}× ${ITEMS[r.out].icon}`; btns = `<button data-act="start:${id}" ${hasAll(r.in) ? '' : 'disabled'}>${d.kind === 'animal' ? 'Füttern' : 'Starten'}</button>`; }
    if (d.kind === 'animal') {
      const full = b.animals >= d.maxAnimals;
      status += `<p>${d.animalName}: <b>${b.animals} / ${d.maxAnimals}</b> – mehr Tiere = mehr Ertrag pro Runde</p>`;
      btns += `<button data-act="animal:${id}" ${full || G.money < d.animalCost ? 'disabled' : ''}>${full ? 'Stall voll' : '+1 ' + d.animalName + ' (💰 ' + d.animalCost + ')'}</button>`;
    }
  }
  const parts = { mbstatus: status, mbbtns: btns, mbextra: extra };
  if (refresh) { for (const k in parts) setHtml(document.getElementById(k), parts[k]); return; }
  openModal(`<h2>${d.icon} ${d.name}</h2><div class="status" id="mbstatus"></div><div class="row" id="mbbtns"></div><div id="mbextra"></div>
    <div class="row"><button class="ghost" data-act="close">Schließen</button></div>
    <button class="linkbtn" data-act="askdemolish:${id}">${d.kind === 'tree' ? '🪓 Fällen …' : '🔨 Abreißen …'}</button>`, 'building');
  for (const k in parts) { lastHtml[k] = null; setHtml(document.getElementById(k), parts[k]); }
}

function askDemolish(id) {
  const b = G.buildings[id]; if (!b) return;
  const d = BUILDINGS[b.type], tree = d.kind === 'tree';
  const lost = [];
  if (animalsIn(b) > 0 && d.kind !== 'factory') lost.push(d.kind === 'horse' ? 'deine Pferde' : 'die Tiere');
  if (b.foal) lost.push('das Fohlen');
  if (b.job) lost.push(tree ? 'die wachsenden Früchte' : 'alles, was gerade darin entsteht');
  const lostTxt = lost.length ? '<br>⚠️ Dabei gehen verloren: ' + (lost.length > 1 ? lost.slice(0, -1).join(', ') + ' und ' + lost[lost.length - 1] : lost[0]) + '.' : '';
  openModal(`<h2>${tree ? '🪓' : '🔨'} ${d.name} ${tree ? 'fällen' : 'abreißen'}?</h2>
    <p>Du bekommst <b>💰 ${fmt(demolishRefund(b))}</b> zurück.${lostTxt}</p>
    <div class="row"><button data-act="building:${id}">Nein, behalten</button><button class="danger" data-act="demolish:${id}">Ja, ${tree ? 'fällen' : 'abreißen'}</button></div>`, 'confirm');
}

// ---------- Pferde ----------
function coatDot(c) {
  const k = COATS[c];
  return `<i class="coat ${k.mane === 'rainbow' ? 'rainbow' : ''}" style="--b:${k.body};--m:${k.mane === 'rainbow' ? '#f6c' : k.mane}" title="${k.name}"></i>`;
}
const tierTag = (c) => { const t = COAT_TIERS[COATS[c].tier]; return `<small class="tier" style="color:${t.color}">${t.name}</small>`; };
function onFoal(b, isNew) {
  const d = BUILDINGS[b.type], c = b.foal, k = COATS[c], full = b.horses.length >= d.maxAnimals;
  if (COATS[c].tier >= 2) confetti();
  openModal(`<div class="foal"><h2>🐴 Ein Fohlen ist geboren!</h2><canvas id="foalcv" width="220" height="140"></canvas>
    <p><b>${k.name}</b> ${tierTag(c)}${isNew ? '<br><span class="new">✨ Neue Fellfarbe für deine Sammlung!</span>' : ''}</p>
    <div class="row"><button data-act="keepfoal:${b.id}" ${full ? 'disabled' : ''}>${full ? 'Stall voll' : `Behalten (${b.horses.length + 1}/${d.maxAnimals})`}</button>
    <button class="gold" data-act="sellfoal:${b.id}">Verkaufen 💰 ${fmt(horseValue(c))}</button></div>
    <p class="small">Seltene Pferde behalten = bessere Chancen auf seltene Fohlen.</p></div>`, 'foal');
  const cv = document.getElementById('foalcv'), g = cv.getContext('2d');
  const dpr = window.devicePixelRatio || 1; cv.width = 220 * dpr; cv.height = 140 * dpr; g.scale(dpr, dpr);
  let t0 = performance.now();
  (function anim(now) {
    if (!cv.isConnected) return;
    g.clearRect(0, 0, 220, 140);
    g.fillStyle = '#bfe39a'; g.beginPath(); g.ellipse(110, 112, 90, 18, 0, 0, 7); g.fill();
    drawHorse(g, c, 110, atlasReady ? 108 : 96, 1, (now - t0) / 1000, 3.2, true, true);
    requestAnimationFrame(anim);
  })(t0);
}

// ---------- Angeln ----------
const fish = { state: 'idle', timer: null };
function openPond() {
  if (G.level < POND.level) { toast('🎣 Angeln gibt es ab Level ' + POND.level, 'bad'); return; }
  fish.state = 'idle';
  openModal(`<h2>🎣 Angeln</h2>
    <div id="fishscene" class="fishscene" data-act="fish"><i class="line"></i><i class="bob"></i><b class="bite">❗</b><span class="catch" id="fishcatch"></span></div>
    <p id="fishmsg">Wirf die Angel aus. Wenn der Schwimmer abtaucht: schnell tippen!</p>
    <p class="small" id="fishinfo"></p>
    <div class="row"><button id="fishbtn" data-act="fish">Angel auswerfen</button><button class="ghost" data-act="close">Fertig</button></div>`, 'pond');
  fishInfo();
}
function fishInfo() {
  const el = document.getElementById('fishinfo'); if (!el) return;
  const p = G.pond, next = p.fish < POND.max ? ` · nächster in ${Math.ceil(POND.regen - p.t)}s` : '';
  el.textContent = `🐟 Fische im Teich: ${p.fish} / ${POND.max}${next}`;
}
function fishSet(state, msg, btn) {
  fish.state = state;
  const sc = document.getElementById('fishscene'); if (!sc) return;
  sc.className = 'fishscene ' + state;
  if (msg) document.getElementById('fishmsg').innerHTML = msg;
  if (btn) document.getElementById('fishbtn').textContent = btn;
  fishInfo();
}
function fishTap() {
  clearTimeout(fish.timer);
  if (fish.state === 'wait') { fishSet('idle', '😬 Zu früh! Der Fisch ist erschrocken. Nochmal!', 'Angel auswerfen'); sfx('bad'); return; }
  if (fish.state === 'bite') {
    const f = catchFish();
    if (!f) { fishSet('idle', 'Der Teich ist leer.', 'Angel auswerfen'); return; }
    document.getElementById('fishcatch').textContent = ITEMS[f].icon;
    fishSet('caught', f === 'stiefel' ? 'Oh … ein alter Stiefel 👢. Passiert den Besten!' : `Gefangen: <b>${ITEMS[f].icon} ${ITEMS[f].name}</b>! Liegt in der Scheune.`, 'Nochmal auswerfen');
    sfx(f === 'tropenfisch' ? 'lucky' : f === 'stiefel' ? 'bad' : 'harvest');
    return;
  }
  if (G.pond.fish <= 0) { fishSet('idle', 'Der Teich braucht eine Pause – gleich schwimmen wieder Fische herbei.', 'Angel auswerfen'); return; }
  fishSet('wait', 'Warte … gleich beißt einer an …', 'Ziehen!');
  sfx('plant');
  fish.timer = setTimeout(() => {
    fishSet('bite', '❗ <b>JETZT tippen!</b>', 'ZIEHEN!'); sfx('coin');
    fish.timer = setTimeout(() => fishSet('idle', '💨 Zu spät – der Fisch hat den Köder geklaut.', 'Angel auswerfen'), 1100);
  }, 1600 + Math.random() * 2800);
}
function fishStop() { clearTimeout(fish.timer); fish.state = 'idle'; }

// ---------- Einführung & Neuigkeiten ----------
function introSlides() {
  const t = isTouch();
  return [
    { icon: '🚜', title: 'Willkommen auf deinem Hof!', text: 'Hier baust du deinen eigenen Bauernhof auf – Feld für Feld, Tier für Tier.' },
    { icon: '🌾', title: 'Säen & Ernten', text: `Wähle links eine Pflanze und ${t ? 'tippe' : 'klicke'} auf ein Feld. Ist sie reif (✨), ${t ? 'tippe' : 'klicke'} sie an.<br>
      <b>Tipp:</b> ${t ? 'Wische mit dem Finger' : 'Halte die Maus gedrückt und ziehe'} über viele Felder – dann geht alles auf einmal.` },
    { icon: '💰', title: 'Geld verdienen', text: 'Erfülle Aufträge an der 📋 Tafel – das bringt am meisten. Oder verkaufe Waren in der 📦 Scheune.' },
    { icon: '⭐', title: 'Größer werden', text: 'Ernten und Aufträge geben XP. Jedes Level schaltet Neues frei: Tiere, Obstbäume, Angeln, die Stadt und Pferde. Neues Land kaufst du über die Holzschilder am Zaun.' },
    { icon: '✋', title: 'Bedienung', text: t ? '✋ <b>Umsehen</b> (oben links): nichts wird aus Versehen gesät.<br>Zwei Finger = zoomen & verschieben, ⌂ = zurück zum Hof.<br>❓ oben zeigt diese Hilfe wieder.'
      : '✋ <b>Umsehen</b>: nichts wird aus Versehen gesät. Mausrad = zoomen, ziehen auf leerer Fläche = verschieben, ⌂ = zurück zum Hof. Tasten: 1–7 Saatgut, H Hand, S Spitzhacke. ❓ zeigt diese Hilfe wieder.' },
  ];
}
function showIntro(i) {
  const s = introSlides(), last = i >= s.length - 1, x = s[Math.min(i, s.length - 1)];
  openModal(`<div class="intro"><div class="ico">${x.icon}</div><h2>${x.title}</h2><p>${x.text}</p>
    <div class="dots">${s.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="row">${last ? '' : '<button class="ghost" data-act="introdone">Überspringen</button>'}
    <button data-act="${last ? 'introdone' : 'intro:' + (i + 1)}">${last ? "Los geht's!" : 'Weiter →'}</button></div></div>`, 'intro');
}
function showNews() {
  openModal(`<div class="intro"><div class="ico">🎉</div><h2>Neu auf dem Hof!</h2><ul class="news">
    <li>🎣 <b>Angeln</b> am Teich (ab Level 2)</li>
    <li>🍎 <b>Obstbäume</b> – einmal pflanzen, immer wieder ernten (ab Level 4)</li>
    <li>🏘️ Die Stadt <b>${TOWN_NAME}</b>: baue sie mit deinen Waren aus (🏘️-Reiter)</li>
    <li>🐴 <b>Pferdezucht</b> mit seltenen Fellfarben (ab Level 11)</li>
    <li>✋ <b>Umsehen</b>-Werkzeug: nichts wird aus Versehen gesät</li>
    <li>🔨 Bauen & Abreißen jetzt mit Vorschau und Nachfrage</li>
    <li>📉 <b>Markt</b>: viel vom Gleichen verkaufen drückt kurz den Preis – Aufträge zahlen immer voll</li>
  </ul><button data-act="newsdone">Super!</button></div>`, 'news');
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
  const c = screenToWorld(availCenter().x, stage.t + availH() * 0.3);
  for (let i = 0; i < 60; i++) {
    const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 260;
    FX.parts.push({ x: c.x, y: c.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 150, life: 1.2 + Math.random(),
      color: ['#ffd34d', '#ff6b6b', '#6bcBff', '#7ed957', '#d58cff'][i % 5], size: 5 + Math.random() * 4 });
  }
}

function toast(text, kind = '') {
  if (kind === 'bad') sfx('bad');
  const t = document.createElement('div');
  t.className = 'toast ' + kind; t.textContent = text;
  $('#toasts').appendChild(t);
  while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 3100);
}

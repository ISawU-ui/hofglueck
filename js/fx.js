// ===== Effekte: Partikel, schwebende Texte, Emoji-Cache, Sound =====
'use strict';

const FX = { parts: [], floats: [], pops: [] };

function fxFloat(x, y, text, color) { FX.floats.push({ x, y, text, color, life: 1.2 }); }
function fxPop(x, y, icon, label) { FX.pops.push({ x, y, icon, label, life: 1 }); }
function fxDust(x, y, color, n = 8) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 70;
    FX.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.5 + Math.random() * 0.4, color, size: 2 + Math.random() * 3 });
  }
}

function updateFX(dt) {
  for (const p of FX.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 160 * dt; p.life -= dt; }
  for (const f of FX.floats) { f.y -= 28 * dt; f.life -= dt; }
  for (const p of FX.pops) { p.life -= dt * 0.9; }
  FX.parts = FX.parts.filter((p) => p.life > 0);
  FX.floats = FX.floats.filter((f) => f.life > 0);
  FX.pops = FX.pops.filter((p) => p.life > 0);
}

function drawFX(ctx) {
  for (const p of FX.parts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  for (const p of FX.pops) {
    const t = 1 - p.life, s = 34 * (t < 0.15 ? t / 0.15 * 1.3 : 1.3 - Math.min(0.3, (t - 0.15)));
    ctx.globalAlpha = Math.min(1, p.life * 2.5);
    drawEmoji(ctx, p.icon, p.x, p.y - t * 50, s);
    if (p.label) outlinedText(ctx, p.label, p.x + 16, p.y - t * 50 - 14, 15, '#ffef5a');
  }
  for (const f of FX.floats) {
    ctx.globalAlpha = Math.min(1, f.life * 2);
    outlinedText(ctx, f.text, f.x, f.y, 14, f.color);
  }
  ctx.globalAlpha = 1;
}

function outlinedText(ctx, text, x, y, size, color) {
  size *= uiK();
  ctx.font = 'bold ' + size + 'px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(40,25,10,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}

// Emojis einmal auf eine kleine Leinwand malen und danach nur noch kopieren (schnell)
const emojiCache = {};
function drawEmoji(ctx, e, x, y, size) {
  const key = e;
  let c = emojiCache[key];
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 96;
    const g = c.getContext('2d');
    g.font = '72px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(e, 48, 54);
    emojiCache[key] = c;
  }
  const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = true; // Emojis weich, auch zwischen Pixel-Grafik
  ctx.drawImage(c, x - size / 2, y - size / 2, size, size);
  ctx.imageSmoothingEnabled = sm;
}

// ---------- Sound: kleine Synth-Töne, keine Dateien nötig ----------
let audio = null, muted = false;
function tone(freq, dur, type = 'sine', vol = 0.12, delay = 0, slide = 0) {
  if (muted) return;
  if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } }
  const t0 = audio.currentTime + delay;
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(audio.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}
let lastSfx = {};
function sfx(name) {
  const now = performance.now();
  if (lastSfx[name] && now - lastSfx[name] < 45) return; // beim Ziehen nicht zu laut stapeln
  lastSfx[name] = now;
  const r = 1 + (Math.random() - 0.5) * 0.12;
  switch (name) {
    case 'plow': tone(140 * r, 0.08, 'triangle', 0.08, 0, 0.6); break;
    case 'plant': tone(520 * r, 0.07, 'sine', 0.08, 0, 1.4); break;
    case 'harvest': tone(660 * r, 0.08, 'square', 0.05); tone(990 * r, 0.1, 'square', 0.04, 0.05); break;
    case 'lucky': [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0.12, 'square', 0.05, i * 0.05)); break;
    case 'coin': tone(988, 0.08, 'square', 0.05); tone(1319, 0.18, 'square', 0.05, 0.07); break;
    case 'build': tone(200, 0.12, 'triangle', 0.1); tone(300, 0.12, 'triangle', 0.1, 0.1); break;
    case 'animal': tone(700 * r, 0.12, 'sawtooth', 0.04, 0, 1.3); break;
    case 'levelup': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.1, i * 0.1)); break;
    case 'bad': tone(180, 0.15, 'sawtooth', 0.05, 0, 0.7); break;
    case 'click': tone(880, 0.03, 'sine', 0.05); break;
  }
}

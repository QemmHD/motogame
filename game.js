// game.js — Moto Rush X3 client. Canvas 2D, fixed-timestep sim, no framework.
import { STR } from './strings.js';
import { buildLevels } from './levels.js';
import { createBike, stepBike, buildTerrain, bikePoints, normAngle, CONFIG } from './physics.js';

// ---------------------------------------------------------------- assets ----
const ASSETS = {
  sky: 'sky.jpg', dirt: 'dirt.png', rock: 'rock.png', bike: 'bike.png', wheel: 'wheel.png',
  barrel: 'barrel.png', saw: 'saw.png', spikes: 'spikes.png', checkpoint: 'checkpoint.png', finish: 'finish.png',
};
const IMG = {};
function loadAssets() {
  return Promise.all(Object.entries(ASSETS).map(([k, f]) => new Promise((res) => {
    const im = new Image(); im.onload = () => { IMG[k] = im; res(); };
    im.onerror = () => { console.warn('missing asset', f); res(); }; im.src = './assets/' + f;
  })));
}

// ---- tunables (bike sprite placement over physics axle line) ----
const BIKE = { w: 1.62, axleY: 0.70, lift: 2 };  // width in wheelBase units
const TILE_WORLD = 170;                            // ground texture tile size in world px

// ---------------------------------------------------------------- canvas ----
const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
const DPR_CAP = 2;
let cssW = 0, cssH = 0, dpr = 1;
function resize() {
  dpr = Math.min(devicePixelRatio || 1, DPR_CAP);
  cssW = innerWidth; cssH = innerHeight;
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
}
addEventListener('resize', resize); addEventListener('orientationchange', resize); resize();

// ---------------------------------------------------------------- storage ---
const SAVE_KEY = 'motoRushX3.save.v1';
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; }
}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {} }
const save = loadSave();
save.best = save.best || {}; save.stars = save.stars || {}; save.unlocked = save.unlocked || 1;
save.bestScore = save.bestScore || {};

// settings substrate (persisted; every future toggle lives here)
const prefersReduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const SETTINGS = Object.assign({ music: 0.7, sfx: 0.9, reducedMotion: !!prefersReduced, haptics: true }, save.settings || {});
save.settings = SETTINGS;
function reduced() { return SETTINGS.reducedMotion; }
function vib(ms) { if (SETTINGS.haptics && navigator.vibrate) { try { navigator.vibrate(ms); } catch {} } }
const clamp01 = v => Math.max(0, Math.min(1, Math.round(v * 10) / 10));

// ---------------------------------------------------------------- audio -----
const Audio2 = (() => {
  let ac = null, master = null, engine = null, engGain = null, engFilt = null;
  let musicBus = null, menuEl = null, driveEl = null, menuGain = null, driveGain = null, musicReady = false;
  let muted = save.muted || false, musicKind = 'menu';
  function loadMusic() {
    try {
      menuEl = new Audio('./assets/music_menu.m4a'); menuEl.loop = true; menuEl.preload = 'auto';
      driveEl = new Audio('./assets/music_drive.m4a'); driveEl.loop = true; driveEl.preload = 'auto';
    } catch {}
  }
  function ensure() {
    if (ac) return;
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ac.destination);
    engine = ac.createOscillator(); engine.type = 'sawtooth'; engine.frequency.value = 60;
    const sub = ac.createOscillator(); sub.type = 'square'; sub.frequency.value = 30;
    engFilt = ac.createBiquadFilter(); engFilt.type = 'lowpass'; engFilt.frequency.value = 500;
    engGain = ac.createGain(); engGain.gain.value = 0;
    engine.connect(engFilt); sub.connect(engFilt); engFilt.connect(engGain); engGain.connect(master);
    engine.start(); sub.start();
    musicBus = ac.createGain(); musicBus.gain.value = 1; musicBus.connect(master);
    try {
      if (menuEl && driveEl) {
        const ms = ac.createMediaElementSource(menuEl); menuGain = ac.createGain(); menuGain.gain.value = 0; ms.connect(menuGain); menuGain.connect(musicBus);
        const ds = ac.createMediaElementSource(driveEl); driveGain = ac.createGain(); driveGain.gain.value = 0; ds.connect(driveGain); driveGain.connect(musicBus);
        musicReady = true;
      }
    } catch { musicReady = false; }
  }
  function applyMusicGains() {
    if (!musicReady || !ac) return;
    const t = ac.currentTime, vol = SETTINGS.music;
    menuGain.gain.setTargetAtTime(musicKind === 'menu' ? vol : 0, t, 0.4);
    driveGain.gain.setTargetAtTime(musicKind === 'drive' ? vol : 0, t, 0.4);
  }
  function startMusic() { if (!musicReady) return; menuEl.play().catch(() => {}); driveEl.play().catch(() => {}); applyMusicGains(); }
  function resume() { ensure(); if (ac && ac.state === 'suspended') ac.resume(); startMusic(); }
  function setMusicState(kind) { musicKind = kind; applyMusicGains(); }
  function duck() { if (!musicBus || !ac) return; const t = ac.currentTime; musicBus.gain.cancelScheduledValues(t); musicBus.gain.setValueAtTime(0.35, t); musicBus.gain.setTargetAtTime(1, t + 0.05, 0.28); }
  function sfxVol(v) { return v * SETTINGS.sfx; }
  function setEngine(speed, throttle) {
    if (!ac || muted) { if (engGain) engGain.gain.value = 0; return; }
    const t = ac.currentTime;
    engine.frequency.setTargetAtTime(55 + speed * 0.16 + (throttle ? 30 : 0), t, 0.05);
    engFilt.frequency.setTargetAtTime(350 + speed * 1.1, t, 0.05);
    engGain.gain.setTargetAtTime(sfxVol(throttle ? 0.16 : 0.05 + Math.min(speed, 600) / 600 * 0.05), t, 0.08);
  }
  function blip(freq, dur, type = 'sine', vol = 0.3, slideTo = null) {
    if (!ac || muted) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + dur);
    g.gain.value = sfxVol(vol); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.connect(g); g.connect(master); o.start(); o.stop(ac.currentTime + dur);
  }
  function noise(dur, vol = 0.4, filt = 900) {
    if (!ac || muted) return;
    const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filt;
    const g = ac.createGain(); g.gain.value = sfxVol(vol);
    src.connect(f); f.connect(g); g.connect(master); src.start();
  }
  return {
    resume, setEngine, setMusicState, loadMusic, applyMusicGains,
    land(v) { noise(0.14, Math.min(0.5, 0.15 + v / 900), 500); blip(90, 0.12, 'sine', 0.25, 60); },
    crash() { noise(0.5, 0.6, 1400); blip(180, 0.5, 'sawtooth', 0.4, 40); duck(); },
    flip() { blip(520, 0.16, 'square', 0.22, 900); },
    stunt() { blip(680, 0.12, 'triangle', 0.2, 1100); },
    checkpoint() { blip(600, 0.1, 'triangle', 0.28); setTimeout(() => blip(900, 0.14, 'triangle', 0.28), 90); },
    finish() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.3), i * 110)); },
    toggle() { muted = !muted; save.muted = muted; persist(); if (master && ac) master.gain.setTargetAtTime(muted ? 0 : 0.9, ac.currentTime, 0.05); return muted; },
    get muted() { return muted; },
  };
})();

// ---------------------------------------------------------------- input -----
const KEYMAP = { ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake',
  ArrowLeft: 'leanBack', KeyA: 'leanBack', ArrowRight: 'leanFwd', KeyD: 'leanFwd' };
const held = new Set();
addEventListener('keydown', e => {
  if (KEYMAP[e.code]) { held.add(KEYMAP[e.code]); e.preventDefault(); }
  if (e.code === 'KeyR') restartLevel();
  if (e.code === 'KeyM') Audio2.toggle();
  if (e.code === 'Escape' || e.code === 'KeyP') { if (G.settingsOpen) G.settingsOpen = false; else togglePause(); }
  if (e.code === 'Space' || e.code === 'Enter') { primaryAction(); e.preventDefault(); }
  Audio2.resume();
});
addEventListener('keyup', e => { if (KEYMAP[e.code]) held.delete(KEYMAP[e.code]); });

// pointers for on-screen controls + UI taps
const pointers = new Map();       // id -> {x,y}
let uiButtons = [];               // rebuilt each frame: {x,y,w,h,id}
function pointFromEvt(e, t) { const r = canvas.getBoundingClientRect(); return { x: (t.clientX - r.left), y: (t.clientY - r.top) }; }
function onDown(id, p) {
  Audio2.resume();
  for (const b of uiButtons) if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { doUI(b.id); return; }
  pointers.set(id, p);
}
function onMove(id, p) { if (pointers.has(id)) pointers.set(id, p); }
function onUp(id) { pointers.delete(id); }
canvas.addEventListener('touchstart', e => { for (const t of e.changedTouches) onDown(t.identifier, pointFromEvt(e, t)); e.preventDefault(); }, { passive: false });
canvas.addEventListener('touchmove', e => { for (const t of e.changedTouches) onMove(t.identifier, pointFromEvt(e, t)); e.preventDefault(); }, { passive: false });
canvas.addEventListener('touchend', e => { for (const t of e.changedTouches) onUp(t.identifier); e.preventDefault(); }, { passive: false });
canvas.addEventListener('touchcancel', e => { for (const t of e.changedTouches) onUp(t.identifier); }, { passive: false });
canvas.addEventListener('mousedown', e => onDown('m', pointFromEvt(e, e)));
canvas.addEventListener('mousemove', e => { if (pointers.has('m')) onMove('m', pointFromEvt(e, e)); });
addEventListener('mouseup', () => onUp('m'));

function controlRects() {
  const s = Math.min(cssW, cssH); const r = Math.max(46, s * 0.085); const m = r * 0.7;
  const by = cssH - m - r;
  return {
    leanBack: { x: m, y: by, r, label: '↺' },
    leanFwd: { x: m + r * 2.35, y: by, r, label: '↻' },
    brake: { x: cssW - m - r * 2.35, y: by, r, label: STR.brake },
    gas: { x: cssW - m - r, y: by, r: r * 1.12, label: STR.gas },
  };
}
function padCommands() {
  const out = new Set();
  for (const gp of navigator.getGamepads?.() ?? []) {
    if (!gp) continue;
    const b = gp.buttons, ax = gp.axes;
    if (b[7]?.pressed || b[0]?.pressed) out.add('gas');
    if (b[6]?.pressed || b[1]?.pressed) out.add('brake');
    if (b[14]?.pressed || (ax[0] ?? 0) < -0.4) out.add('leanBack');
    if (b[15]?.pressed || (ax[0] ?? 0) > 0.4) out.add('leanFwd');
  }
  return out;
}
function currentInput() {
  const cmd = { gas: false, brake: false, leanBack: false, leanFwd: false };
  for (const c of held) cmd[c] = true;
  for (const c of padCommands()) cmd[c] = true;
  if (G.state === 'playing' && !G.settingsOpen && isTouch) {
    const R = controlRects();
    for (const { x, y } of pointers.values())
      for (const k in R) { const b = R[k]; if (Math.hypot(x - b.x, y - b.y) <= b.r * 1.15) cmd[k] = true; }
  }
  return cmd;
}
let isTouch = false;
addEventListener('touchstart', () => { isTouch = true; }, { once: true, passive: true });

// ---------------------------------------------------------------- game ------
const levels = buildLevels();
const G = {
  state: 'loading', levelIdx: 0, level: null, terrain: null, bike: null,
  cam: { x: 0, y: 0, viewH: 460 }, elapsed: 0, flipBonus: 0, running: false,
  cpIndex: 0, particles: [], shake: 0, crashTimer: 0, finishTimer: 0,
  popups: [], flash: 0, cpFlash: 0, prevGrounded: true, prevFlipEvent: 0,
  finishStars: 0, finishTime: 0, finishNewRecord: false, slow: 1, hitstop: 0,
  score: 0, combo: 1, comboTimer: 0, airStart: -1, finishScore: 0, finishRecordScore: false,
  settingsOpen: false,
};

function startLevel(i) {
  const L = levels[i]; G.levelIdx = i; G.level = L;
  G.terrain = buildTerrain(L.course.chains);
  G.cpList = [{ x: L.course.startX, y: L.course.startY }, ...L.course.checkpoints];
  G.cpIndex = 0;
  G.bike = createBike(L.course.startX, L.course.startY - 40);
  G.elapsed = 0; G.flipBonus = 0; G.running = true; G.state = 'playing';
  G.particles.length = 0; G.popups.length = 0; G.shake = 0; G.crashTimer = 0;
  G.prevGrounded = true; G.prevFlipEvent = G.bike.flipEventId;
  G.slow = 1; G.hitstop = 0; G.flash = 0;
  G.score = 0; G.combo = 1; G.comboTimer = 0; G.airStart = -1;
  G.cam.x = G.bike.x; G.cam.y = G.bike.y - 40; G.cam.viewH = 460;
  for (const cp of L.course.decos) if (cp.type === 'checkpoint') cp.active = false;
  for (const h of L.course.hazards) { h.spin = 0; h._nm = false; }
  Audio2.setMusicState('drive');
}
function restartLevel() { if (G.level) startLevel(G.levelIdx); }
function respawn() {
  const cp = G.cpList[G.cpIndex];
  const keepSpin = G.bike.wheelSpin;
  G.bike = createBike(cp.x, cp.y - 40); G.bike.wheelSpin = keepSpin;
  G.state = 'playing'; G.airStart = -1;
  G.prevGrounded = true; G.prevFlipEvent = G.bike.flipEventId;
  Audio2.setMusicState('drive');
}
function togglePause() {
  if (G.state === 'playing') { G.state = 'paused'; }
  else if (G.state === 'paused') { G.state = 'playing'; }
}
function primaryAction() {
  if (G.settingsOpen) { G.settingsOpen = false; return; }
  if (G.state === 'menu') startLevel(Math.min(save.unlocked - 1, levels.length - 1));
  else if (G.state === 'crashed') respawn();
  else if (G.state === 'paused') G.state = 'playing';
}

function starsFor(L, time) { const s = L.star; if (time <= s[0]) return 3; if (time <= s[1]) return 2; if (time <= s[2]) return 1; return 0; }

// combo/style scoring
function scoreEvent(label, color, base, x, y) {
  G.combo = Math.min(9, G.combo + 1); G.comboTimer = 2.6;
  G.score += Math.round(base * G.combo);
  addPopup(label + (G.combo > 1 ? '  x' + G.combo : ''), x, y, color);
}

// ---------------------------------------------------------------- sim -------
function simulate(dt) {
  const bike = G.bike, L = G.level;
  const input = G.state === 'playing' && !G.settingsOpen ? currentInput() : { gas: false, brake: false, leanBack: false, leanFwd: false };
  if (G.state === 'playing') {
    G.elapsed += dt;
    stepBike(bike, G.terrain, input, dt);
    Audio2.setEngine(bike.speed, input.gas);
    if (G.comboTimer > 0) { G.comboTimer -= dt; if (G.comboTimer <= 0) G.combo = 1; }

    // flips -> time bonus + score + combo
    if (bike.flipEventId > G.prevFlipEvent) {
      G.prevFlipEvent = bike.flipEventId;
      const n = Math.abs(bike.lastFlips);
      G.flipBonus += 0.5 * n;
      G.combo = Math.min(9, G.combo + n); G.comboTimer = 2.6;
      G.score += Math.round(150 * n * G.combo);
      const label = n >= 3 ? STR.flip3 : n >= 2 ? STR.flip2 : STR.flip;
      addPopup(label + '  -' + (0.5 * n).toFixed(1) + 's' + (G.combo > 1 ? '  x' + G.combo : ''), bike.x, bike.y - 70, '#ffd23e');
      Audio2.flip(); vib(14);
      if (n >= 2 && !reduced()) G.slow = 0.5;   // brief slow-mo on multi-flip
    }
    // air tracking + landing feedback
    if (!bike.grounded && G.prevGrounded) G.airStart = G.elapsed;
    if (bike.grounded && !G.prevGrounded) {
      const v = Math.abs((bike.rear.y - bike.rear.oy) * 360);
      if (v > 120) { shakeAdd(Math.min(14, v / 90)); Audio2.land(v); dustBurst(bike.rear.x, bike.rear.y, 8); vib(18); }
      if (v > 520 && !reduced()) { G.hitstop = 0.04; G.flash = Math.min(0.4, v / 1600); }
      const air = G.airStart >= 0 ? G.elapsed - G.airStart : 0;
      if (air > 0.62) { scoreEvent(STR.bigAir, '#ffd23e', Math.round(air * 150), bike.x, bike.y - 60); Audio2.stunt(); }
      G.airStart = -1;
    }
    G.prevGrounded = bike.grounded;
    if (bike.grounded && input.gas && bike.speed > 120 && Math.random() < 0.6) dust(bike.rear.x, bike.rear.y, bike.speed);

    updateHazards(dt);
    if (!bike.crashed) scanHazards();

    while (G.cpIndex + 1 < G.cpList.length && bike.x > G.cpList[G.cpIndex + 1].x) {
      G.cpIndex++; const cp = G.cpList[G.cpIndex];
      const d = L.course.decos.find(o => o.type === 'checkpoint' && Math.abs(o.x - cp.x) < 2); if (d) d.active = true;
      G.cpFlash = 1.2; Audio2.checkpoint(); addPopup(STR.checkpoint, bike.x, bike.y - 80, '#8fe3ff');
    }
    if (bike.x > L.course.finishX) return finishLevel();
    if (bike.crashed) return doCrash();
    if (bike.y > L.course.bounds().maxY + 900) { bike.crashed = true; return doCrash(); }
  } else if (G.state === 'crashed') {
    G.elapsed += dt;
    G.crashTimer -= dt; if (G.crashTimer <= 0) respawn();
  }
}

function doCrash() {
  if (G.state !== 'playing') return;
  G.state = 'crashed'; G.crashTimer = 0.9; G.combo = 1; G.comboTimer = 0;
  if (!reduced()) { G.hitstop = 0.07; G.flash = 0.7; }
  shakeAdd(16); Audio2.crash(); vib(120);
  explosion(G.bike.head.x, G.bike.head.y);
}
function finishLevel() {
  G.state = 'finished'; G.running = false; G.finishTimer = 0; G.slow = 1; G.hitstop = 0;
  const time = Math.max(0, G.elapsed - G.flipBonus);
  G.finishTime = time; G.finishScore = G.score;
  G.finishStars = starsFor(G.level, time);
  const prev = save.best[G.levelIdx];
  G.finishNewRecord = (prev == null || time < prev);
  if (G.finishNewRecord) save.best[G.levelIdx] = time;
  G.finishRecordScore = G.score > (save.bestScore[G.levelIdx] || 0);
  if (G.finishRecordScore) save.bestScore[G.levelIdx] = G.score;
  save.stars[G.levelIdx] = Math.max(save.stars[G.levelIdx] || 0, G.finishStars);
  if (G.levelIdx + 1 < levels.length) save.unlocked = Math.max(save.unlocked, G.levelIdx + 2);
  persist(); Audio2.finish(); Audio2.setMusicState('menu'); vib(60);
  confetti();
}

// ---- hazards ----
function updateHazards(dt) { for (const h of G.level.course.hazards) if (h.type === 'saw') h.spin += dt * 9; }
function scanHazards() {
  const b = G.bike, pts = bikePoints(b), cpsPts = [pts.rear, pts.front, pts.head, { x: b.x, y: b.y }];
  for (const h of G.level.course.hazards) {
    const crashR = h.r + 10, nmR = h.r + 46;
    let minD2 = Infinity;
    for (const p of cpsPts) { const d2 = (p.x - h.x) ** 2 + (p.y - h.y) ** 2; if (d2 < minD2) minD2 = d2; }
    if (minD2 < crashR * crashR) { b.crashed = true; if (h.type === 'barrel') explosion(h.x, h.y); return; }
    if (!h._nm && minD2 < nmR * nmR && b.speed > 260 && !b.grounded) {
      h._nm = true; scoreEvent(STR.nearMiss, '#8fe3ff', 70, h.x, h.y - 40); Audio2.stunt();
    }
  }
}

// ---- particles ----
function shakeAdd(v) { if (!reduced()) G.shake = Math.max(G.shake, v); }
function addPopup(text, x, y, color) { G.popups.push({ text, x, y, color, life: 1.4, vy: -30 }); }
function dust(x, y, spd) {
  G.particles.push({ x, y: y + 14, vx: -spd * 0.15 - Math.random() * 40, vy: -20 - Math.random() * 40,
    life: 0.5 + Math.random() * 0.3, max: 0.8, size: 6 + Math.random() * 8, type: 'dust' });
}
function dustBurst(x, y, n) { for (let i = 0; i < n; i++) dust(x + (Math.random() - .5) * 20, y, 200); }
function explosion(x, y) {
  shakeAdd(18);
  for (let i = 0; i < 34; i++) {
    const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 320;
    G.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
      life: 0.4 + Math.random() * 0.6, max: 1, size: 5 + Math.random() * 14,
      type: Math.random() < 0.5 ? 'fire' : 'smoke' });
  }
}
function confetti() {
  for (let i = 0; i < 80; i++) G.particles.push({ x: G.bike.x + (Math.random() - .5) * 400, y: G.bike.y - 300 - Math.random() * 200,
    vx: (Math.random() - .5) * 120, vy: 40 + Math.random() * 120, life: 1.5 + Math.random(), max: 2.5,
    size: 5 + Math.random() * 6, type: 'confetti', col: ['#ff5252', '#ffd23e', '#5bd6ff', '#8bff6b', '#ff8ad8'][i % 5] });
}
function updateParticles(dt) {
  for (const p of G.particles) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.type === 'dust') { p.vy += 40 * dt; p.vx *= 0.94; }
    else if (p.type === 'fire' || p.type === 'smoke') { p.vy += 120 * dt; p.vx *= 0.96; }
    else if (p.type === 'confetti') { p.vy += 60 * dt; p.vx += Math.sin(p.y * 0.05) * 6 * dt; }
    p.life -= dt;
  }
  G.particles = G.particles.filter(p => p.life > 0);
  for (const p of G.popups) { p.y += p.vy * dt; p.life -= dt; }
  G.popups = G.popups.filter(p => p.life > 0);
  if (G.cpFlash > 0) G.cpFlash -= dt;
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 30);
}

// ---------------------------------------------------------------- camera ----
function updateCamera(dt) {
  const b = G.bike;
  const vx = (b.rear.x - b.rear.ox) * 360, vy = (b.rear.y - b.rear.oy) * 360;
  const tx = b.x + Math.max(-220, Math.min(280, vx * 0.32));
  const ty = b.y - 46 + Math.max(-70, Math.min(140, vy * 0.14));
  const tv = 452 + Math.min(200, Math.abs(vx) * 0.12) + (b.airborne ? 90 : 0);
  const k = 1 - Math.pow(0.001, dt);
  G.cam.x += (tx - G.cam.x) * k; G.cam.y += (ty - G.cam.y) * k;
  G.cam.viewH += (tv - G.cam.viewH) * (1 - Math.pow(0.02, dt));
}

// ---------------------------------------------------------------- render ----
let patDirt = null, patRock = null;
function makePatterns() {
  if (IMG.dirt) patDirt = ctx.createPattern(IMG.dirt, 'repeat');
  if (IMG.rock) patRock = ctx.createPattern(IMG.rock, 'repeat');
}
function patScale(pat, img) { const s = TILE_WORLD / img.width; const m = new DOMMatrix(); m.a = s; m.d = s; pat.setTransform(m); }

function worldTransform() {
  const scale = cssH / G.cam.viewH;
  const sx = (G.shake > 0) ? (Math.random() - .5) * G.shake : 0;
  const sy = (G.shake > 0) ? (Math.random() - .5) * G.shake : 0;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(cssW / 2 + sx, cssH * 0.6 + sy);
  ctx.scale(scale, scale);
  ctx.translate(-G.cam.x, -G.cam.y);
  return scale;
}

function drawSky() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const im = IMG.sky;
  if (!im) { ctx.fillStyle = '#7fc7ee'; ctx.fillRect(0, 0, cssW, cssH); return; }
  const bg = ctx.createLinearGradient(0, 0, 0, cssH); bg.addColorStop(0, '#4ea6e6'); bg.addColorStop(1, '#bfe3f5');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, cssW, cssH);
  const ih = cssH, iw = ih * im.width / im.height;
  const scroll = G.cam.x * 0.25;
  const oy = -Math.max(0, Math.min(cssH * 0.22, (G.cam.y - 240) * 0.1));
  const n0 = Math.floor(scroll / iw) - 1;
  for (let i = n0; i * iw - scroll < cssW + iw; i++) {
    const x = i * iw - scroll, flip = (((i % 2) + 2) % 2) === 1;
    if (flip) { ctx.save(); ctx.translate(x + iw, oy); ctx.scale(-1, 1); ctx.drawImage(im, 0, 0, iw, ih); ctx.restore(); }
    else ctx.drawImage(im, x, oy, iw, ih);
  }
  const g = ctx.createLinearGradient(0, 0, 0, cssH); g.addColorStop(0, 'rgba(255,240,200,0.12)'); g.addColorStop(0.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, cssW, cssH);
}

function visibleSlice(pts, left, right) {
  let i0 = 0, i1 = pts.length - 1;
  while (i0 < pts.length - 1 && pts[i0 + 1].x < left) i0++;
  while (i1 > 0 && pts[i1 - 1].x > right) i1--;
  return [Math.max(0, i0), Math.min(pts.length - 1, i1)];
}

function drawTerrain(scale) {
  const left = G.cam.x - (cssW / 2) / scale - 80, right = G.cam.x + (cssW / 2) / scale + 80;
  const bottom = G.cam.y + (cssH * 0.6) / scale + 400;
  const DIRT = 42;
  for (const ch of G.level.course.render) {
    if (ch.type !== 'ground') continue;
    const pts = ch.pts; if (pts[pts.length - 1].x < left || pts[0].x > right) continue;
    const [i0, i1] = visibleSlice(pts, left, right); if (i1 <= i0) continue;
    ctx.beginPath(); ctx.moveTo(pts[i0].x, pts[i0].y);
    for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineTo(pts[i1].x, bottom); ctx.lineTo(pts[i0].x, bottom); ctx.closePath();
    ctx.fillStyle = patRock || '#b98a55'; ctx.fill();
    ctx.fillStyle = 'rgba(60,40,25,0.28)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(pts[i0].x, pts[i0].y);
    for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(pts[i].x, pts[i].y);
    for (let i = i1; i >= i0; i--) ctx.lineTo(pts[i].x, pts[i].y + DIRT); ctx.closePath();
    ctx.fillStyle = patDirt || '#c98d4e'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(pts[i0].x, pts[i0].y);
    for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineWidth = 5; ctx.strokeStyle = '#3a2717'; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,225,150,0.55)'; ctx.stroke();
  }
}

function drawFlag(im, x, groundY, h, glow) {
  if (!im) return;
  const w = h * im.width / im.height;
  if (glow) { ctx.save(); ctx.globalAlpha = 0.5 + Math.sin(performance.now() / 200) * 0.2; ctx.filter = 'drop-shadow(0 0 10px #7dffb0)'; }
  ctx.drawImage(im, x - w * 0.16, groundY - h, w, h);
  if (glow) ctx.restore();
}

function drawHazards() {
  for (const h of G.level.course.hazards) {
    if (h.type === 'saw') {
      const d = h.r * 2.2, im = IMG.saw;
      ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.spin);
      if (im) ctx.drawImage(im, -d / 2, -d / 2, d, d); ctx.restore();
    } else if (h.type === 'barrel') {
      const im = IMG.barrel; const w = h.r * 2.5, ih = w * (im ? im.height / im.width : 0.75);
      if (im) ctx.drawImage(im, h.x - w / 2, h.y - ih / 2, w, ih);
    } else if (h.type === 'spikes') {
      const im = IMG.spikes; const w = h.r * 3.0, ih = w * (im ? im.height / im.width : 0.7);
      if (im) ctx.drawImage(im, h.x - w / 2, h.y - ih + 10, w, ih);
    }
  }
}

function drawBike() {
  const b = G.bike, pts = bikePoints(b), im = IMG.bike;
  ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(b.x, Math.max(pts.rear.y, pts.front.y) + 14, 46, 10, 0, 0, 7); ctx.fill(); ctx.restore();
  if (im) {
    const w = CONFIG.wheelBase * BIKE.w, h = w * im.height / im.width;
    ctx.save(); ctx.translate(b.x, b.y + BIKE.lift); ctx.rotate(b.angle);
    ctx.drawImage(im, -w / 2, -h * BIKE.axleY, w, h); ctx.restore();
  }
}

function drawParticles() {
  for (const p of G.particles) {
    const a = Math.max(0, p.life / p.max);
    if (p.type === 'dust') { ctx.globalAlpha = a * 0.5; ctx.fillStyle = '#d9b483'; }
    else if (p.type === 'fire') { ctx.globalAlpha = a; ctx.fillStyle = a > 0.5 ? '#ffe14d' : '#ff6a2b'; }
    else if (p.type === 'smoke') { ctx.globalAlpha = a * 0.5; ctx.fillStyle = '#555'; }
    else if (p.type === 'confetti') { ctx.globalAlpha = a; ctx.fillStyle = p.col; }
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawWorld(scale) {
  drawTerrain(scale);
  for (const d of G.level.course.decos) if (d.type === 'checkpoint') drawFlag(IMG.checkpoint, d.x, d.y, 130, d.active);
  if (G.level.course.finishPt) drawFlag(IMG.finish, G.level.course.finishPt.x, G.level.course.finishPt.y, 150, true);
  drawHazards();
  drawParticles();
  drawBike();
  for (const p of G.popups) {
    ctx.globalAlpha = Math.min(1, p.life / 0.6); ctx.fillStyle = p.color;
    ctx.font = '700 26px system-ui'; ctx.textAlign = 'center';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(p.text, p.x, p.y); ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
}

// ---------------------------------------------------------------- HUD -------
function fmt(t) { const m = Math.floor(t / 60), s = (t % 60); return (m > 0 ? m + ':' + s.toFixed(2).padStart(5, '0') : s.toFixed(2)); }
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function btn(x, y, w, h, label, id, color = '#ff5a3c') {
  roundRect(x, y, w, h, 12); ctx.fillStyle = color; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '700 ' + Math.round(h * 0.42) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  uiButtons.push({ x, y, w, h, id });
}
function star(cx, cy, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fillStyle = filled ? '#ffd23e' : 'rgba(255,255,255,0.18)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = filled ? '#c99400' : 'rgba(0,0,0,0.3)'; ctx.stroke();
}

function drawHUD() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  uiButtons = [];
  const pad = 14;
  if (G.state === 'playing' || G.state === 'paused' || G.state === 'crashed') {
    const time = Math.max(0, G.elapsed - G.flipBonus);
    ctx.textAlign = 'left';
    roundRect(pad, pad, 168, 54, 12); ctx.fillStyle = 'rgba(18,20,29,0.66)'; ctx.fill();
    ctx.fillStyle = '#ffd23e'; ctx.font = '800 30px ui-monospace, monospace'; ctx.fillText(fmt(time), pad + 14, pad + 37);
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '600 12px system-ui'; ctx.fillText(STR.level + ' ' + (G.levelIdx + 1) + ' · ' + G.level.name.toUpperCase(), pad + 2, pad + 74);
    if (G.flipBonus > 0) { ctx.fillStyle = '#8bff6b'; ctx.font = '700 15px system-ui'; ctx.fillText('▼ -' + G.flipBonus.toFixed(1) + 's', pad + 118, pad + 20); }
    // score + combo (below timer)
    ctx.fillStyle = '#fff'; ctx.font = '800 18px ui-monospace, monospace';
    ctx.fillText(String(G.score).padStart(6, '0'), pad + 2, pad + 92);
    if (G.combo > 1) {
      const cw = 58, cx = pad + 96;
      ctx.fillStyle = '#ff5a3c'; roundRect(cx, pad + 78, cw, 20, 6); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '800 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('COMBO x' + G.combo, cx + cw / 2, pad + 89); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(cx, pad + 98, cw * Math.max(0, G.comboTimer / 2.6), 2);
    }
    btn(cssW - pad - 46, pad, 46, 40, '⏸', 'pause', 'rgba(18,20,29,0.66)');
    btn(cssW - pad - 46 - 52, pad, 46, 40, Audio2.muted ? '🔇' : '🔊', 'mute', 'rgba(18,20,29,0.66)');
    if (G.cpFlash > 0) { ctx.globalAlpha = Math.min(1, G.cpFlash); ctx.fillStyle = '#8fe3ff'; ctx.font = '800 34px system-ui'; ctx.textAlign = 'center'; ctx.fillText(STR.checkpoint, cssW / 2, 70); ctx.globalAlpha = 1; ctx.textAlign = 'left'; }
    if (isTouch && G.state === 'playing' && !G.settingsOpen) drawTouchControls();
  }
  if (G.state === 'paused') overlayPaused();
  if (G.state === 'crashed') overlayCrashed();
  if (G.state === 'finished') overlayFinished();
  if (G.state === 'menu') drawMenu();
  if (G.settingsOpen) { uiButtons = []; drawSettings(); }
}

function drawTouchControls() {
  const R = controlRects(); const cmd = currentInput();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const k of ['leanBack', 'leanFwd', 'brake', 'gas']) {
    const b = R[k]; const on = cmd[k];
    ctx.globalAlpha = on ? 0.9 : 0.42;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7);
    ctx.fillStyle = k === 'gas' ? '#ff5a3c' : k === 'brake' ? '#3c6bff' : '#2a2f3d'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.font = '700 ' + Math.round(b.r * 0.5) + 'px system-ui';
    ctx.fillText(b.label, b.x, b.y + 1);
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

function panel(w, h) { const x = (cssW - w) / 2, y = (cssH - h) / 2; ctx.fillStyle = 'rgba(10,12,18,0.82)'; roundRect(x, y, w, h, 20); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.stroke(); return { x, y }; }

function overlayPaused() {
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, cssW, cssH);
  const w = Math.min(360, cssW - 40), h = 300, { x, y } = panel(w, h);
  ctx.fillStyle = '#fff'; ctx.font = '800 34px system-ui'; ctx.textAlign = 'center'; ctx.fillText(STR.paused, cssW / 2, y + 56); ctx.textAlign = 'left';
  btn(x + 40, y + 84, w - 80, 44, STR.resume, 'resume', '#ff5a3c');
  btn(x + 40, y + 136, w - 80, 44, STR.retry, 'retry', '#3c6bff');
  btn(x + 40, y + 188, w - 80, 40, STR.settings, 'gear', 'rgba(255,255,255,0.14)');
  btn(x + 40, y + 236, w - 80, 40, STR.menu, 'menu', 'rgba(255,255,255,0.14)');
}
function overlayCrashed() {
  ctx.fillStyle = 'rgba(120,20,10,0.28)'; ctx.fillRect(0, 0, cssW, cssH);
  ctx.fillStyle = '#ff6a4a'; ctx.font = '900 54px system-ui'; ctx.textAlign = 'center';
  ctx.fillText(STR.crash, cssW / 2, cssH * 0.44);
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '600 18px system-ui'; ctx.fillText(STR.tapRetry, cssW / 2, cssH * 0.44 + 40);
  ctx.textAlign = 'left';
}
function overlayFinished() {
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, cssW, cssH);
  const w = Math.min(420, cssW - 32), h = 372, { x, y } = panel(w, h);
  ctx.textAlign = 'center'; ctx.fillStyle = '#ffd23e'; ctx.font = '800 30px system-ui'; ctx.fillText(STR.levelComplete, cssW / 2, y + 48);
  for (let i = 0; i < 3; i++) star(cssW / 2 + (i - 1) * 68, y + 104, 30, i < G.finishStars);
  ctx.fillStyle = '#fff'; ctx.font = '700 40px ui-monospace, monospace'; ctx.fillText(fmt(G.finishTime), cssW / 2, y + 168);
  ctx.font = '600 13px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillText(STR.yourTime + (G.flipBonus > 0 ? '   ·   ' + STR.flipsSaved + ' -' + G.flipBonus.toFixed(1) + 's' : ''), cssW / 2, y + 190);
  ctx.fillStyle = '#8fe3ff'; ctx.font = '800 20px ui-monospace, monospace'; ctx.fillText(STR.score + ' ' + G.finishScore, cssW / 2, y + 222);
  let ry = y + 244;
  if (G.finishNewRecord) { ctx.fillStyle = '#8bff6b'; ctx.font = '800 16px system-ui'; ctx.fillText('★ ' + STR.newRecord, cssW / 2, ry); ry += 20; }
  else if (G.finishRecordScore) { ctx.fillStyle = '#8bff6b'; ctx.font = '800 15px system-ui'; ctx.fillText('★ ' + STR.bestScore + ' ' + STR.score, cssW / 2, ry); ry += 20; }
  ctx.textAlign = 'left';
  const bw = (w - 100) / 2;
  btn(x + 30, y + h - 60, bw, 44, STR.retry, 'retry', '#3c6bff');
  const last = G.levelIdx + 1 >= levels.length;
  btn(x + 30 + bw + 40, y + h - 60, bw, 44, last ? STR.menu : STR.next, last ? 'menu' : 'next', '#ff5a3c');
  ctx.textAlign = 'left';
}

// menu / level select
function drawMenu() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = 'rgba(10,12,20,0.35)'; ctx.fillRect(0, 0, cssW, cssH);
  ctx.textAlign = 'center';
  if (IMG.wheel) { const d = Math.min(96, cssW * 0.16); ctx.save(); ctx.globalAlpha = 0.9;
    ctx.translate(cssW / 2, cssH * 0.18 - Math.min(64, cssW * 0.11) * 0.35); ctx.rotate(performance.now() / 700);
    ctx.drawImage(IMG.wheel, -d / 2, -d / 2, d, d); ctx.restore(); }
  ctx.fillStyle = '#fff'; ctx.font = '900 ' + Math.min(64, cssW * 0.11) + 'px system-ui';
  ctx.lineWidth = 6; ctx.strokeStyle = '#1b1f2a'; ctx.strokeText(STR.title, cssW / 2, cssH * 0.18); ctx.fillStyle = '#ffd23e'; ctx.fillText(STR.title, cssW / 2, cssH * 0.18);
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '600 16px system-ui'; ctx.fillText(STR.tagline, cssW / 2, cssH * 0.18 + 30);
  const cols = cssW < 560 ? 2 : 4, cardW = Math.min(150, (cssW - 40 - (cols - 1) * 14) / cols), cardH = cardW * 0.92;
  const gw = cols * cardW + (cols - 1) * 14, gx = (cssW - gw) / 2, gy = cssH * 0.30;
  ctx.textAlign = 'left';
  levels.forEach((L, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const x = gx + c * (cardW + 14), y = gy + r * (cardH + 16);
    const locked = (i + 1) > save.unlocked;
    roundRect(x, y, cardW, cardH, 14); ctx.fillStyle = locked ? 'rgba(30,32,42,0.8)' : 'rgba(255,90,60,0.92)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '800 22px system-ui';
    ctx.fillText(String(i + 1), x + cardW / 2, y + 40);
    ctx.font = '700 12px system-ui'; ctx.fillText(L.name.toUpperCase(), x + cardW / 2, y + 62);
    if (locked) { ctx.font = '700 11px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillText('🔒 ' + STR.locked, x + cardW / 2, y + cardH - 34); }
    else {
      const st = save.stars[i] || 0; for (let s = 0; s < 3; s++) star(x + cardW / 2 + (s - 1) * 22, y + cardH - 40, 9, s < st);
      const bt = save.best[i]; ctx.font = '600 11px ui-monospace, monospace'; ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(STR.best + ' ' + (bt != null ? fmt(bt) : STR.noTime), x + cardW / 2, y + cardH - 12);
      uiButtons.push({ x, y, w: cardW, h: cardH, id: 'lvl' + i });
    }
    ctx.textAlign = 'left';
  });
  ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '600 13px system-ui';
  ctx.fillText(isTouch ? STR.hintTouch : STR.hintKeys, cssW / 2, cssH - 26);
  // top-right controls: settings gear + mute (+ install when available)
  btn(cssW - 14 - 46, 14, 46, 40, '⚙', 'gear', 'rgba(18,20,29,0.6)');
  btn(cssW - 14 - 46 - 52, 14, 46, 40, Audio2.muted ? '🔇' : '🔊', 'mute', 'rgba(18,20,29,0.6)');
  if (window.__deferredInstall) btn(14, 14, 108, 40, '⤓ ' + STR.install, 'install', 'rgba(60,107,255,0.9)');
  ctx.textAlign = 'left';
}

function drawSettings() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(0, 0, cssW, cssH);
  const w = Math.min(400, cssW - 28), h = 366, x = (cssW - w) / 2, y = (cssH - h) / 2;
  ctx.fillStyle = 'rgba(10,12,18,0.94)'; roundRect(x, y, w, h, 20); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.stroke();
  ctx.textAlign = 'center'; ctx.fillStyle = '#ffd23e'; ctx.font = '800 26px system-ui'; ctx.fillText(STR.settings, cssW / 2, y + 40);
  const lx = x + 26, rx = x + w - 26; let ry = y + 66;
  const label = (t) => { ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '700 15px system-ui'; ctx.fillText(t, lx, ry + 18); ctx.textBaseline = 'alphabetic'; };
  const slider = (t, val, dn, up) => {
    label(t);
    btn(rx - 34, ry, 34, 36, '+', up, 'rgba(255,255,255,0.14)');
    btn(rx - 34 - 118, ry, 34, 36, '−', dn, 'rgba(255,255,255,0.14)');
    ctx.fillStyle = '#fff'; ctx.font = '700 15px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(val * 100) + '%', rx - 34 - 118 + 34 + (118 - 34) / 2, ry + 19);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ry += 48;
  };
  const toggle = (t, on, id) => {
    label(t);
    btn(rx - 84, ry, 84, 36, on ? STR.on : STR.off, id, on ? '#3c6bff' : 'rgba(255,255,255,0.14)');
    ry += 48;
  };
  slider(STR.music, SETTINGS.music, 'set_music_dn', 'set_music_up');
  slider(STR.sfx, SETTINGS.sfx, 'set_sfx_dn', 'set_sfx_up');
  toggle(STR.muteAll, Audio2.muted, 'set_mute');
  toggle(STR.motion, SETTINGS.reducedMotion, 'set_motion');
  toggle(STR.haptics, SETTINGS.haptics, 'set_haptics');
  btn(x + 26, y + h - 52, w - 52, 40, STR.close, 'set_close', '#ff5a3c');
}

function doUI(id) {
  if (id === 'mute') { Audio2.toggle(); return; }
  if (id === 'pause') { togglePause(); return; }
  if (id === 'resume') { G.state = 'playing'; return; }
  if (id === 'retry') { G.settingsOpen = false; restartLevel(); return; }
  if (id === 'menu') { G.settingsOpen = false; G.state = 'menu'; G.running = false; Audio2.setMusicState('menu'); return; }
  if (id === 'next') { startLevel(Math.min(G.levelIdx + 1, levels.length - 1)); return; }
  if (id === 'gear') { G.settingsOpen = true; return; }
  if (id === 'set_close') { G.settingsOpen = false; return; }
  if (id === 'set_music_dn') { SETTINGS.music = clamp01(SETTINGS.music - 0.1); persist(); Audio2.applyMusicGains(); return; }
  if (id === 'set_music_up') { SETTINGS.music = clamp01(SETTINGS.music + 0.1); persist(); Audio2.applyMusicGains(); return; }
  if (id === 'set_sfx_dn') { SETTINGS.sfx = clamp01(SETTINGS.sfx - 0.1); persist(); return; }
  if (id === 'set_sfx_up') { SETTINGS.sfx = clamp01(SETTINGS.sfx + 0.1); persist(); return; }
  if (id === 'set_mute') { Audio2.toggle(); return; }
  if (id === 'set_motion') { SETTINGS.reducedMotion = !SETTINGS.reducedMotion; if (SETTINGS.reducedMotion) G.shake = 0; persist(); return; }
  if (id === 'set_haptics') { SETTINGS.haptics = !SETTINGS.haptics; persist(); if (SETTINGS.haptics) vib(20); return; }
  if (id === 'install') { const d = window.__deferredInstall; if (d) { d.prompt(); window.__deferredInstall = null; } return; }
  if (id.startsWith('lvl')) { startLevel(parseInt(id.slice(3), 10)); return; }
}

// ---------------------------------------------------------------- loop ------
const STEP = 1 / 60; let acc = 0, last = performance.now();
const dev = new URLSearchParams(location.search).has('dev');
if (dev) document.getElementById('dev').style.display = 'block';
let frames = 0, fpsAt = last, fps = 0;
addEventListener('blur', () => { if (G.state === 'playing') G.state = 'paused'; });

function frame(now) {
  requestAnimationFrame(frame);
  let dtMs = now - last; last = now; if (dtMs > 100) dtMs = 100;
  // hitstop: freeze the sim, keep rendering (a punchy impact beat)
  if (G.hitstop > 0) { G.hitstop -= dtMs / 1000; render(); return; }
  // slow-mo eases back to real time
  if (G.slow < 1) { G.slow += (1 - G.slow) * Math.min(1, dtMs / 1000 * 4); if (G.slow > 0.995) G.slow = 1; }
  acc += dtMs * G.slow;
  const active = (G.state === 'playing' || G.state === 'crashed');
  while (acc >= STEP * 1000) {
    if (active) simulate(STEP);
    updateParticles(STEP);
    if (active) updateCamera(STEP);
    acc -= STEP * 1000;
  }
  if (G.flash > 0) G.flash = Math.max(0, G.flash - dtMs / 1000 * 3.5);
  render();
  if (dev) { frames++; if (now - fpsAt >= 500) { fps = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now;
    document.getElementById('dev').textContent = fps + ' fps · ' + G.particles.length + ' p · ' + G.state + ' · ' + G.score; } }
}

function render() {
  drawSky();
  if (G.state !== 'menu' && G.level) { const scale = worldTransform(); drawWorld(scale); }
  drawHUD();
  if (G.flash > 0) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = 'rgba(255,255,255,' + (G.flash * 0.55) + ')'; ctx.fillRect(0, 0, cssW, cssH); }
}

// ---------------------------------------------------------------- boot ------
Audio2.loadMusic();
loadAssets().then(() => {
  makePatterns();
  if (patDirt) patScale(patDirt, IMG.dirt);
  if (patRock) patScale(patRock, IMG.rock);
  document.getElementById('boot').style.display = 'none';
  G.state = 'menu';
  Audio2.setMusicState('menu');
  requestAnimationFrame(frame);
});

// test hook (used by the screenshot harness / dev console)
window.__moto = { G, startLevel, restartLevel, levels, SETTINGS };

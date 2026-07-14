// game.js — Moto Rush X3 client. Canvas 2D, fixed-timestep sim, no framework.
import { STR } from './strings.js';
import { buildLevels, COURSE_VERSION } from './levels.js';
import { normAngle, CONFIG, PHYSICS_VERSION, terrainContact } from './physics.js';
import { REPLAY_INPUT, createReplayPlayback, createReplayRecorder, decodeReplay, encodeReplay,
  hashReplayState } from './replay.js';
import { sampleKinematicPlatform } from './kinematics.js';
import { createRagdoll, readRagdoll, stepRagdoll } from './ragdoll.js';
import { buildDebugProxySnapshot } from './debug-proxies.js';
import { initializeRunSession, snapshotRunSession,
  stepCrashedRun, stepPlayingRun } from './run-session.js';
import { createEffectPool } from './effect-pool.js';
import { createInputState } from './input-state.js';
import { PERFORMANCE_EVENT, createPerformanceMetrics, recordPerformanceEvent,
  recordPerformanceFrame, recordPerformanceViewport, resetPerformanceMetrics,
  snapshotPerformanceMetrics } from './perf-metrics.js';

const performanceMetrics = createPerformanceMetrics({ capacity: 360, slowFrameMs: 1000 / 30 });
let refreshInputSurface = () => {};

// ---------------------------------------------------------------- assets ----
const ASSETS = {
  sky: 'sky.jpg', dirt: 'dirt.png', rock: 'rock.png', bike: 'bike.png', wheel: 'wheel.png',
  bike_body: 'bike_body.png',
  barrel: 'barrel.png', saw: 'saw.png', spikes: 'spikes.png', checkpoint: 'checkpoint.png', finish: 'finish.png',
};
// Wheel-less bike+rider sprite: axle-anchor pixels (in the sprite's own image
// space) that the renderer pins onto the physics axles. Read off the art.
const BODY = { Sr: { x: 120, y: 440 }, Sf: { x: 573, y: 372 }, wheelR: CONFIG.wheelR, sag: 0.22, dip: 18 };
const BUILD_VERSION = globalThis.MOTO_RUSH_BUILD?.version || '1.7-dev';
const BUILD = globalThis.MOTO_RUSH_BUILD?.label || `v${BUILD_VERSION}`;
const IMG = {};
const GOLDEN_TAPES = new Map();
let goldenManifest = null;
function loadAssets() {
  return Promise.all(Object.entries(ASSETS).map(([k, f]) => new Promise((res) => {
    const im = new Image(); im.onload = () => { IMG[k] = im; res(); };
    im.onerror = () => { console.warn('missing asset', f); res(); }; im.src = './assets/' + f;
  })));
}
async function loadGoldenTapes() {
  try {
    const response = await fetch('./golden-tapes.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json();
    if (manifest?.schema !== 1 || manifest.build !== BUILD_VERSION
        || manifest.physics !== PHYSICS_VERSION || manifest.course !== COURSE_VERSION
        || manifest.levelCount !== levels.length || !Array.isArray(manifest.levels)
        || manifest.levels.length !== levels.length) {
      throw new Error('reference manifest is incompatible with this build');
    }
    for (let index = 0; index < manifest.levels.length; index++) {
      const entry = manifest.levels[index];
      if (entry?.index !== index || entry.id !== `level-${index + 1}` || typeof entry.token !== 'string') {
        throw new Error(`reference catalog entry ${index} is malformed`);
      }
      const decoded = decodeReplay(entry.token, { expected: replayMetadata(index) });
      if (!decoded.ok) throw new Error(`reference ${entry.id} failed ${decoded.code}`);
      GOLDEN_TAPES.set(entry.index, Object.freeze({ ...entry }));
    }
    goldenManifest = Object.freeze(manifest);
  } catch (error) {
    console.warn('golden reference runs unavailable', error);
  }
}

// ---- tunables (bike sprite placement over physics axle line) ----
const BIKE = { w: 1.62, axleY: 0.70, lift: 2 };  // width in wheelBase units
const TILE_WORLD = 170;                            // ground texture tile size in world px

// ---------------------------------------------------------------- canvas ----
const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
const DPR_CAP = 2;
let cssW = 0, cssH = 0, dpr = 1;
function viewportRotation() {
  const screenAngle = Number(screen.orientation?.angle);
  if (Number.isFinite(screenAngle)
      && (screenAngle !== 0 || cssH >= cssW || (navigator.maxTouchPoints || 0) === 0)) {
    return screenAngle;
  }
  const legacyAngle = Number(window.orientation);
  if (Number.isFinite(legacyAngle)) return legacyAngle;
  return cssW > cssH ? 90 : 0;
}
function resize() {
  dpr = Math.min(devicePixelRatio || 1, DPR_CAP);
  cssW = innerWidth; cssH = innerHeight;
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
  recordPerformanceViewport(performanceMetrics, cssW, cssH, dpr, viewportRotation());
  refreshInputSurface();
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
save.replays = save.replays || {};

// settings substrate (persisted; every future toggle lives here)
const prefersReduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const SETTINGS = Object.assign({ music: 0.7, sfx: 0.9, reducedMotion: !!prefersReduced,
  haptics: true, leftHanded: false }, save.settings || {});
save.settings = SETTINGS;
function reduced() { return SETTINGS.reducedMotion; }
function vib(ms) { if (SETTINGS.haptics && navigator.vibrate) { try { navigator.vibrate(ms); } catch {} } }
const clamp01 = v => Math.max(0, Math.min(1, Math.round(v * 10) / 10));

// ---------------------------------------------------------------- audio -----
const ENGINE_BANDS = Object.freeze([0, 180, 360, 560, 780, 1020]);
const Audio2 = (() => {
  let ac = null, master = null, engine = null, engGain = null, engFilt = null;
  let musicBus = null, menuEl = null, driveEl = null, menuGain = null, driveGain = null, musicReady = false;
  let muted = save.muted || false, musicKind = 'menu', lastGear = 1;
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
  function setEngine(speed, throttle, grounded = true, forwardSpeed = speed) {
    const roadSpeed = Math.max(0, Math.abs(forwardSpeed));
    const bands = ENGINE_BANDS;
    let gear = 1; while (gear < 5 && roadSpeed >= bands[gear]) gear++;
    if (!ac || muted) { if (engGain) engGain.gain.value = 0; lastGear = gear; return gear; }
    const t = ac.currentTime;
    const low = bands[gear - 1], high = bands[gear] || 1200;
    let rpm = Math.max(0, Math.min(1, (roadSpeed - low) / Math.max(1, high - low)));
    if (!grounded && throttle) rpm = Math.max(rpm, 0.84);
    else if (throttle) rpm = Math.max(rpm, 0.3);
    if (gear !== lastGear && grounded && throttle) blip(125 + gear * 16, 0.07, 'square', 0.08, 95);
    lastGear = gear;
    engine.frequency.setTargetAtTime(62 + rpm * 178 + (throttle ? 18 : 0), t, 0.045);
    engFilt.frequency.setTargetAtTime(420 + rpm * 1350 + Math.min(speed, 1000) * 0.35, t, 0.05);
    engGain.gain.setTargetAtTime(sfxVol(throttle ? 0.17 : 0.045 + rpm * 0.055), t, 0.08);
    return gear;
  }
  function stopEngine() {
    if (!engGain || !ac) return;
    engGain.gain.setTargetAtTime(0, ac.currentTime, 0.035);
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
    resume, setEngine, stopEngine, setMusicState, loadMusic, applyMusicGains,
    land(v) { noise(0.14, Math.min(0.5, 0.15 + v / 900), 500); blip(90, 0.12, 'sine', 0.25, 60); },
    crash() { noise(0.5, 0.6, 1400); blip(180, 0.5, 'sawtooth', 0.4, 40); duck(); },
    flip() { blip(520, 0.16, 'square', 0.22, 900); },
    stunt() { blip(680, 0.12, 'triangle', 0.2, 1100); },
    checkpoint() { blip(600, 0.1, 'triangle', 0.28); setTimeout(() => blip(900, 0.14, 'triangle', 0.28), 90); },
    loom() { blip(420, 0.16, 'triangle', 0.2, 880); setTimeout(() => blip(740, 0.1, 'sine', 0.16, 980), 70); },
    finish() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.3), i * 110)); },
    toggle() { muted = !muted; save.muted = muted; persist(); if (master && ac) master.gain.setTargetAtTime(muted ? 0 : 0.9, ac.currentTime, 0.05); return muted; },
    get muted() { return muted; },
  };
})();

// ---------------------------------------------------------------- input -----
const inputState = createInputState({ leftHanded: SETTINGS.leftHanded });
const liveInput = { gas: false, brake: false, leanBack: false, leanFwd: false };
const displayInput = { gas: false, brake: false, leanBack: false, leanFwd: false };
let controlLayout = null;
let gamepadConnected = !!Array.from(navigator.getGamepads?.() || []).find(Boolean);
addEventListener('keydown', e => {
  if (inputState.keyDown(e.code).handled) e.preventDefault();
  if (e.code === 'KeyR') restartLevel();
  if (e.code === 'KeyM') Audio2.toggle();
  if (e.code === 'KeyC' && dev) collisionDebug = !collisionDebug;
  if (e.code === 'KeyG' && G.state === 'finished') doUI('golden');
  if (e.code === 'Escape' || e.code === 'KeyP') { if (G.settingsOpen) G.settingsOpen = false; else togglePause(); }
  if (e.code === 'Space' || e.code === 'Enter') { primaryAction(); e.preventDefault(); }
  Audio2.resume();
});
addEventListener('keyup', e => { if (inputState.keyUp(e.code).handled) e.preventDefault(); });
addEventListener('gamepadconnected', () => { gamepadConnected = true; });
addEventListener('gamepaddisconnected', () => {
  gamepadConnected = !!Array.from(navigator.getGamepads?.() || []).find(Boolean);
  if (!gamepadConnected) inputState.updateGamepads([]);
});

// pointers for on-screen controls + UI taps
const activePointerIds = new Set();
let uiButtons = [];               // rebuilt each frame: {x,y,w,h,id}
let uiButtonCount = 0;
function pointFromEvt(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function onDown(id, p) {
  Audio2.resume();
  if (G.state === 'crashed') { primaryAction(); return; }
  for (let index = 0; index < uiButtonCount; index++) { const b = uiButtons[index];
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { doUI(b.id); return; } }
  if (inputState.pointerBegin({ id, x: p.x, y: p.y }).accepted) activePointerIds.add(id);
}
function onMove(id, p) { if (activePointerIds.has(id)) inputState.pointerMove({ id, x: p.x, y: p.y }); }
function releasePointer(id, kind) {
  if (!activePointerIds.delete(id)) return false;
  if (kind === 'cancel') inputState.pointerCancel(id);
  else if (kind === 'lost') inputState.pointerLostCapture(id);
  else inputState.pointerEnd(id);
  return true;
}
canvas.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse') isTouch = true;
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  onDown(e.pointerId, pointFromEvt(e)); e.preventDefault();
}, { passive: false });
canvas.addEventListener('pointermove', e => { onMove(e.pointerId, pointFromEvt(e)); e.preventDefault(); }, { passive: false });
canvas.addEventListener('pointerup', e => { releasePointer(e.pointerId, 'end'); e.preventDefault(); }, { passive: false });
canvas.addEventListener('pointercancel', e => {
  if (releasePointer(e.pointerId, 'cancel')) recordPerformanceEvent(performanceMetrics, PERFORMANCE_EVENT.CANCEL);
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('lostpointercapture', e => {
  if (releasePointer(e.pointerId, 'lost')) recordPerformanceEvent(performanceMetrics, PERFORMANCE_EVENT.CANCEL);
  e.preventDefault();
}, { passive: false });

function updateControlLayout() {
  const s = Math.min(cssW, cssH);
  let r = Math.max(42, Math.min(58, s * 0.08));
  const clusterSpan = radius => Math.max(6, radius * 0.3) + radius * 2.24
    + Math.max(6, radius * 0.18) + radius * 2;
  const availableClusterWidth = Math.max(1, cssW / 2 - 4);
  if (clusterSpan(r) > availableClusterWidth) r *= availableClusterWidth / clusterSpan(r);
  r = Math.max(24, r);
  const gasR = r * 1.12, m = Math.max(6, r * 0.3);
  const gap = Math.max(6, r * 0.18), by = cssH - m - gasR;
  const leftOuterX = m + (SETTINGS.leftHanded ? gasR : r);
  const leftInnerX = leftOuterX + (SETTINGS.leftHanded ? gasR : r) + r + gap;
  const rightOuterX = cssW - m - (SETTINGS.leftHanded ? r : gasR);
  const rightInnerX = rightOuterX - (SETTINGS.leftHanded ? r : gasR) - r - gap;
  controlLayout = SETTINGS.leftHanded ? {
    gas: { x: leftOuterX, y: by, r: gasR, label: STR.gas },
    brake: { x: leftInnerX, y: by, r, label: STR.brake },
    leanFwd: { x: rightInnerX, y: by, r, label: '↻' },
    leanBack: { x: rightOuterX, y: by, r, label: '↺' },
  } : {
    leanBack: { x: leftOuterX, y: by, r, label: '↺' },
    leanFwd: { x: leftInnerX, y: by, r, label: '↻' },
    brake: { x: rightInnerX, y: by, r, label: STR.brake },
    gas: { x: rightOuterX, y: by, r: gasR, label: STR.gas },
  };
  inputState.setLeftHanded(SETTINGS.leftHanded);
  activePointerIds.clear();
  inputState.configurePointerSurface({
    bounds: { x: 0, y: 0, width: Math.max(1, cssW), height: Math.max(1, cssH) },
    zones: ['leanBack', 'leanFwd', 'brake', 'gas'].map(command => ({
      command, shape: 'circle', x: controlLayout[command].x,
      y: controlLayout[command].y, radius: controlLayout[command].r * 1.04,
    })),
  });
  return controlLayout;
}
function controlRects() { return controlLayout || updateControlLayout(); }
refreshInputSurface = updateControlLayout;
updateControlLayout();

function currentInput() {
  const cmd = inputState.readCommands(liveInput);
  if (devAutoplay && G.state === 'playing') {
    cmd.gas = G.devWaitTicks <= 0;
    cmd.brake = G.devWaitTicks > 0;
    let threat = null;
    const hazards = G.run?.hazards || [];
    for (let index = 0; index < hazards.length; index++) {
      const hazard = hazards[index];
      if (!hazard.exploded && hazard.type !== 'tnt'
          && hazard.x > G.bike.x + 30 && hazard.x < G.bike.x + 155
          && Math.abs(hazard.y - G.bike.y) < hazard.r + 82) { threat = hazard; break; }
    }
    if (threat && G.bike?.grounded) { cmd.gas = false; cmd.brake = true; }
    if (!G.bike?.grounded) {
      const angle = normAngle(G.bike?.angle || 0);
      if (angle > 0.25) cmd.leanBack = true;
      else if (angle < -0.25) cmd.leanFwd = true;
    }
  }
  return cmd;
}
let isTouch = false;
function clearControls(reason = 'manual') { activePointerIds.clear(); return inputState.clearAll(reason); }

// ---------------------------------------------------------------- game ------
const particlePool = createEffectPool({
  capacity: 384,
  defaults: { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 0,
    type: '', rot: 0, vr: 0, col: '' },
});
const popupPool = createEffectPool({
  capacity: 32,
  defaults: { text: '', x: 0, y: 0, color: '#fff', life: 0, vy: 0 },
});
const trackPool = createEffectPool({
  capacity: 220,
  defaults: { x: 0, y: 0, a: 0 },
});
const EFFECT_CAPACITY = particlePool.capacity + popupPool.capacity + trackPool.capacity;
function activeEffectCount() {
  return particlePool.stats.active + popupPool.stats.active + trackPool.stats.active;
}
function createdEffectCount() {
  return particlePool.stats.created + popupPool.stats.created + trackPool.stats.created;
}

const levels = buildLevels();
const worlds = [...new Set(levels.map(L => L.world || 'Campaign'))];
const levelIndicesByWorld = worlds.map(world => Object.freeze(levels
  .map((level, index) => ({ level, index }))
  .filter(item => (item.level.world || 'Campaign') === world)
  .map(item => item.index)));
const G = {
  state: 'loading', levelIdx: 0, level: null, terrain: null, bike: null, run: null,
  kinematics: null, menuWorld: 0,
  cam: { x: 0, y: 0, viewH: 460, roll: 0, kickX: 0, kickY: 0 }, elapsed: 0, flipBonus: 0, running: false,
  cpIndex: 0, particlePool, trackPool, shake: 0, crashTimer: 0, crashAge: 0, finishTimer: 0,
  popupPool, flash: 0, cpFlash: 0, prevGrounded: true, prevFlipEvent: 0,
  finishStars: 0, finishTime: 0, finishNewRecord: false, slow: 1, hitstop: 0,
  score: 0, combo: 1, comboTimer: 0, airStart: -1, finishScore: 0, finishRecordScore: false,
  settingsOpen: false, trackT: 0,
  riderLean: 0, leanCmd: 0,
  engineGear: 1,
  ragdoll: null, ragdollPose: null,
  replayMode: false, replayPlayback: null, replayRecorder: null, replayToken: null,
  replaySource: null,
  replayTick: 0, replayVerified: false, replayRecorded: false, replayFailed: null,
  restartQueued: false, replayUnavailable: null,
  replayNotice: null,
  devWaitTicks: 0, devCrashCount: 0,
  debugProxy: null,
};

function replayMetadata(i) {
  return { levelId: `level-${i + 1}`, buildVersion: BUILD_VERSION,
    physicsVersion: PHYSICS_VERSION, generatorVersion: COURSE_VERSION };
}

function startLevel(i, { replayToken = null, replaySource = null } = {}) {
  const L = levels[i]; G.levelIdx = i; G.level = L;
  let playback = null;
  if (replayToken) {
    const decoded = decodeReplay(replayToken, { expected: replayMetadata(i) });
    if (decoded.ok) playback = createReplayPlayback(decoded.replay);
    else {
      if (replaySource !== 'golden' && save.replays[i] === replayToken) {
        delete save.replays[i]; persist();
      }
      if (G.replayToken === replayToken) G.replayToken = null;
      const message = decoded.code === 'INCOMPATIBLE_VERSION' ? STR.proofExpired
        : decoded.code === 'TOO_LARGE' ? STR.proofTooLarge : STR.proofDamaged;
      G.replayNotice = { message, detail: decoded.message || decoded.code, life: 4.5 };
      return false;
    }
  }
  G.replayNotice = null;
  initializeRunSession(G, L, i);
  particlePool.clear(); popupPool.clear(); G.shake = 0; G.cpFlash = 0;
  G.ragdoll = null; G.ragdollPose = null;
  G.slow = 1; G.hitstop = 0; G.flash = 0;
  trackPool.clear(); G.trackT = 0;
  G.riderLean = 0; G.leanCmd = 0; G.engineGear = 1; G.debugProxy = null;
  G.replayMode = !!playback; G.replayPlayback = playback; G.replayToken = replayToken;
  G.replaySource = playback ? (replaySource || 'saved') : null;
  G.replayRecorder = playback ? null : createReplayRecorder(replayMetadata(i));
  G.replayTick = 0; G.replayVerified = false; G.replayRecorded = false; G.replayFailed = null;
  G.restartQueued = false; G.replayUnavailable = null;
  G.devWaitTicks = 0; G.devCrashCount = 0;
  G.cam.x = G.bike.x; G.cam.y = G.bike.y - 40; G.cam.viewH = 460; G.cam.roll = 0; G.cam.kickX = 0; G.cam.kickY = 0;
  Audio2.setMusicState('drive');
  return true;
}
function restartLevel() {
  if (G.level) startLevel(G.levelIdx, G.replayMode
    ? { replayToken: G.replayToken, replaySource: G.replaySource } : undefined);
}
function finishRespawnPresentation() {
  G.ragdoll = null; G.ragdollPose = null;
  particlePool.clear(); popupPool.clear(); G.shake = 0; G.hitstop = 0; G.flash = 0; G.slow = 1;
  G.cam.kickX = 0; G.cam.kickY = 0; G.restartQueued = false;
  if (devAutoplay) {
    G.devCrashCount++;
    G.devWaitTicks = 12 + (G.devCrashCount % 7) * 11;
  }
  G.riderLean = 0; G.leanCmd = 0;
  Audio2.setMusicState('drive');
}
function togglePause() {
  if (G.state === 'playing') { G.state = 'paused'; Audio2.stopEngine(); }
  else if (G.state === 'paused') { G.state = 'playing'; }
}
function primaryAction() {
  if (G.settingsOpen) { G.settingsOpen = false; return; }
  if (G.state === 'menu') startLevel(Math.min(save.unlocked - 1, levels.length - 1));
  else if (G.state === 'crashed') G.restartQueued = true;
  else if (G.state === 'paused') G.state = 'playing';
}

function starsFor(L, time) { const s = L.star; if (time <= s[0]) return 3; if (time <= s[1]) return 2; if (time <= s[2]) return 1; return 0; }

const NEUTRAL_INPUT = Object.freeze({ gas: false, brake: false, leanBack: false, leanFwd: false });
const replayInput = { gas: false, brake: false, leanBack: false, leanFwd: false, restart: false };
function replayInputAtTick() {
  const mask = G.replayPlayback.maskAt(G.replayTick);
  replayInput.gas = !!(mask & REPLAY_INPUT.GAS);
  replayInput.brake = !!(mask & REPLAY_INPUT.BRAKE);
  replayInput.leanBack = !!(mask & REPLAY_INPUT.LEAN_LEFT);
  replayInput.leanFwd = !!(mask & REPLAY_INPUT.LEAN_RIGHT);
  replayInput.restart = !!(mask & REPLAY_INPUT.RESTART);
  return replayInput;
}
function replayMaskForInput(input, restart) {
  let mask = 0;
  if (input.gas) mask |= REPLAY_INPUT.GAS;
  if (input.brake) mask |= REPLAY_INPUT.BRAKE;
  if (input.leanBack) mask |= REPLAY_INPUT.LEAN_LEFT;
  else if (input.leanFwd) mask |= REPLAY_INPUT.LEAN_RIGHT;
  if (restart) mask |= REPLAY_INPUT.RESTART;
  return mask;
}

function replayStateSnapshot() {
  return { ...snapshotRunSession(G), replayTick: G.replayTick };
}

function failReplay(reason) {
  G.state = 'finished'; G.running = false; G.finishTimer = 0; G.slow = 1; G.hitstop = 0;
  G.finishTime = Math.max(0, G.elapsed - G.flipBonus); G.finishScore = G.score;
  G.finishStars = 0; G.finishNewRecord = false; G.finishRecordScore = false;
  G.replayVerified = false; G.replayFailed = reason || 'state mismatch';
  Audio2.stopEngine(); Audio2.setMusicState('menu');
}

// ---------------------------------------------------------------- sim -------
function presentSessionScore(event) {
  if (event.type === 'flip') return;
  const presentation = {
    bigAir: [STR.bigAir, '#ffd23e'],
    landingPerfect: [STR.landingPerfect, '#8bff6b'],
    landingClean: [STR.landingClean, '#8fe3ff'],
    blastLine: ['BLAST LINE', '#ffb12b'],
    nearMiss: [STR.nearMiss, '#8fe3ff'],
  }[event.type];
  if (!presentation) return;
  const combo = event.combo > 1 ? '  x' + event.combo : '';
  addPopup(presentation[0] + combo, event.x, event.y, presentation[1]);
}

function simulate(dt) {
  if (G.replayMode && G.replayTick >= G.replayPlayback.finishTick) {
    failReplay('tape ended before the finish'); return;
  }
  const tapeInput = G.replayMode ? replayInputAtTick() : null;
  const input = G.state === 'playing' && !G.settingsOpen
    ? (tapeInput || currentInput()) : NEUTRAL_INPUT;
  const restart = G.replayMode ? !!tapeInput?.restart : !!G.restartQueued;
  G.restartQueued = false;
  if (G.replayRecorder) {
    try { G.replayRecorder.recordMask(replayMaskForInput(input, restart)); }
    catch (error) {
      G.replayUnavailable = error?.code || 'recording limit'; G.replayRecorder = null;
      console.warn('replay recording stopped', error);
    }
  }
  G.replayTick++;
  if (devAutoplay && G.devWaitTicks > 0 && G.state === 'playing') G.devWaitTicks--;
  // rider body English: lean the character with the control input (smoothed)
  G.leanCmd = (input.leanFwd ? 1 : 0) - (input.leanBack ? 1 : 0);
  G.riderLean += (G.leanCmd - G.riderLean) * Math.min(1, dt * 9);
  if (G.state === 'playing') {
    const events = stepPlayingRun(G, input, dt);
    const bike = G.bike;
    G.engineGear = Audio2.setEngine(bike.speed, input.gas, bike.grounded, bike.forwardSpeed) || G.engineGear;
    for (const flip of events.flips) {
      const n = flip.count;
      const label = n >= 3 ? STR.flip3 : n >= 2 ? STR.flip2 : STR.flip;
      addPopup(label + '  -' + flip.timeBonus.toFixed(1) + 's'
        + (flip.combo > 1 ? '  x' + flip.combo : ''), flip.x, flip.y, '#ffd23e');
      Audio2.flip(); vib(14);
      if (n >= 2 && !reduced()) G.slow = 0.5;   // brief slow-mo on multi-flip
    }
    for (const landing of events.landings) {
      const v = landing.impact;
      if (landing.feedback) { shakeAdd(Math.min(14, v / 90)); Audio2.land(v); dustBurst(bike.rear.x, bike.rear.y, 8); vib(18);
        camKick(0, Math.min(10, v / 90)); if (v > 300) dirtClods(bike.rear.x, bike.rear.y, Math.min(10, v / 120)); }
      if (v > 520 && !reduced()) { G.hitstop = 0.04; G.flash = Math.min(0.4, v / 1600); }
      if (landing.airTime > 0.62) Audio2.stunt();
      if (landing.gradeWorthy && landing.grade === 'rough') addPopup(STR.landingRough, landing.x, landing.y - 68, '#ffbd62');
      else if (landing.gradeWorthy && landing.grade === 'slam') addPopup(STR.landingSlam, landing.x, landing.y - 68, '#ff6a4a');
    }
    for (const score of events.scores) presentSessionScore(score);
    if (events.stateAfter === 'playing' && bike.grounded && input.gas && bike.speed > 120 && Math.random() < 0.6) dust(bike.rear.x, bike.rear.y, bike.speed);
    if (events.stateAfter === 'playing' && bike.grounded && input.gas && Math.random() < 0.25) exhaust(bike);
    // tire tracks (decal ring buffer)
    if (events.stateAfter === 'playing' && bike.grounded && bike.speed > 60) { G.trackT += dt; if (G.trackT > 0.03) { G.trackT = 0;
      spawnTrack(bike.rear.x, bike.rear.y + CONFIG.wheelR * 0.7, 0.5); } }
    for (const blast of events.explosions) explosion(blast.x, blast.y);
    for (const impulse of events.impulses) {
      addPopup('BLAST BOOST!', impulse.x, impulse.y - 56, '#ffb12b');
      shakeAdd(12); camKick(-6, -8); vib(24);
    }
    for (const zone of events.forceZones) {
      if (!zone.entered) continue;
      addPopup(STR.vectorLock, zone.x, zone.y - zone.height * 0.5 - 24, '#8feaff');
      Audio2.loom();
      camKick(Math.sign(zone.acceleration.x) * 3, Math.sign(zone.acceleration.y) * 3);
      vib(12);
    }
    for (const _miss of events.nearMisses) Audio2.stunt();
    for (const activation of events.platformActivations) {
      const platform = G.kinematics.platforms.find(item => item.id === activation.id);
      addPopup(STR.liftOnline, platform?.current.x ?? activation.triggerX,
        (platform?.current.y ?? bike.y) - 58, '#55d8ff');
      Audio2.checkpoint(); camKick(0, -5); vib(18);
    }
    if (events.checkpoint) {
      G.cpFlash = 1.2; Audio2.checkpoint(); addPopup(STR.checkpoint, bike.x, bike.y - 80, '#8fe3ff');
    }
    if (events.finish) return finishLevel();
    if (events.crash) return doCrash(events.crash.reason || events.crash);
  } else if (G.state === 'crashed') {
    const events = stepCrashedRun(G, { restart }, dt);
    if (events.respawn) { finishRespawnPresentation(); return; }
    if (G.ragdoll) { stepRagdoll(G.ragdoll, dt); G.ragdollPose = readRagdoll(G.ragdoll, G.ragdollPose || {}); }
  }
}

function crashContact(x, y, radius) {
  let best = terrainContact(G.terrain, x, y, radius);
  for (const platform of G.kinematics?.platforms || []) {
    const p = platform.current;
    if (x + radius < p.left || x - radius > p.right || y > p.top + radius * 2.5) continue;
    const pen = y + radius - p.top;
    if (pen > 0 && pen < radius * 3 && (!best || pen > best.pen)) best = { pen, nx: 0, ny: -1, surface: p.surface };
  }
  return best;
}

function doCrash(reason = null) {
  if (G.state !== 'playing' && G.state !== 'crashed') return;
  if (G.state === 'playing') {
    G.state = 'crashed'; G.crashTimer = 1.85; G.crashAge = 0; G.combo = 1; G.comboTimer = 0;
  }
  const sourceX = reason?.x ?? G.bike.head.x, sourceY = reason?.y ?? G.bike.head.y;
  const dx = G.bike.x - sourceX, dy = G.bike.y - sourceY, d = Math.max(1, Math.hypot(dx, dy));
  G.ragdoll = createRagdoll(G.bike, { sampleDt: G.bike._dt, contact: crashContact,
    reducedMotion: reduced(), impulse: { x: dx / d * 120, y: dy / d * 80 - 85,
      spin: reason?.type === 'tnt' ? 0.9 : 0.35 } });
  G.ragdollPose = readRagdoll(G.ragdoll, {});
  if (!reduced()) { G.hitstop = 0.07; G.flash = 0.7; }
  shakeAdd(16); Audio2.stopEngine(); Audio2.crash(); vib(120);
  if (!reduced()) {
    if (reason?.type === 'tnt') explosion(G.bike.head.x, G.bike.head.y);
    else crashSparks(G.bike.head.x, G.bike.head.y);
  }
}
function finishLevel() {
  G.state = 'finished'; G.running = false; G.finishTimer = 0; G.slow = 1; G.hitstop = 0;
  const time = Math.max(0, G.elapsed - G.flipBonus);
  G.finishTime = time; G.finishScore = G.score;
  G.finishStars = starsFor(G.level, time);
  const proofState = replayStateSnapshot();
  const prev = save.best[G.levelIdx];
  G.replayRecorded = false; G.replayFailed = null;
  if (G.replayMode) {
    G.finishNewRecord = false; G.finishRecordScore = false;
    G.replayVerified = G.replayTick === G.replayPlayback.finishTick
      && hashReplayState(proofState) === G.replayPlayback.replay.stateHash;
    if (!G.replayVerified) G.replayFailed = 'final state mismatch';
  } else {
    G.finishNewRecord = (prev == null || time < prev);
    if (G.finishNewRecord) save.best[G.levelIdx] = time;
    G.finishRecordScore = G.score > (save.bestScore[G.levelIdx] || 0);
    if (G.finishRecordScore) save.bestScore[G.levelIdx] = G.score;
    save.stars[G.levelIdx] = Math.max(save.stars[G.levelIdx] || 0, G.finishStars);
    if (G.levelIdx + 1 < levels.length) save.unlocked = Math.max(save.unlocked, G.levelIdx + 2);
    try {
      const recorder = G.replayRecorder; G.replayRecorder = null;
      if (!recorder) throw new Error(G.replayUnavailable || 'recorder unavailable');
      const replay = recorder.finalize({ finishTick: G.replayTick, finalState: proofState });
      G.replayToken = encodeReplay(replay); save.replays[G.levelIdx] = G.replayToken;
      G.replayRecorded = true;
    } catch (error) { console.warn('replay proof unavailable', error); }
    persist();
  }
  Audio2.stopEngine(); Audio2.finish(); Audio2.setMusicState('menu'); vib(60);
  confetti();
}

// ---- particles ----
function shakeAdd(v) { if (!reduced()) G.shake = Math.max(G.shake, v); }
function spawnParticle(x, y, vx, vy, life, max, size, type, rot = 0, vr = 0, col = '') {
  const lease = particlePool.acquire(), particle = particlePool.get(lease);
  particle.x = x; particle.y = y; particle.vx = vx; particle.vy = vy;
  particle.life = life; particle.max = max; particle.size = size; particle.type = type;
  particle.rot = rot; particle.vr = vr; particle.col = col;
  return lease;
}
function addPopup(text, x, y, color) {
  const lease = popupPool.acquire(), popup = popupPool.get(lease);
  popup.text = text; popup.x = x; popup.y = y; popup.color = color; popup.life = 1.4; popup.vy = -30;
  return lease;
}
function spawnTrack(x, y, alpha) {
  const lease = trackPool.acquire(), track = trackPool.get(lease);
  track.x = x; track.y = y; track.a = alpha;
  return lease;
}
function dust(x, y, spd) {
  spawnParticle(x, y + 14, -spd * 0.15 - Math.random() * 40, -20 - Math.random() * 40,
    0.5 + Math.random() * 0.3, 0.8, 6 + Math.random() * 8, 'dust');
}
function dustBurst(x, y, n) { for (let i = 0; i < n; i++) dust(x + (Math.random() - .5) * 20, y, 200); }
function explosion(x, y) {
  shakeAdd(18);
  for (let i = 0; i < 34; i++) {
    const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 320;
    spawnParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 60,
      0.4 + Math.random() * 0.6, 1, 5 + Math.random() * 14,
      Math.random() < 0.5 ? 'fire' : 'smoke');
  }
}
const CONFETTI_COLORS = Object.freeze(['#ff5252', '#ffd23e', '#5bd6ff', '#8bff6b', '#ff8ad8']);
function confetti() {
  for (let i = 0; i < 80; i++) spawnParticle(
    G.bike.x + (Math.random() - .5) * 400, G.bike.y - 300 - Math.random() * 200,
    (Math.random() - .5) * 120, 40 + Math.random() * 120, 1.5 + Math.random(), 2.5,
    5 + Math.random() * 6, 'confetti', 0, 0, CONFETTI_COLORS[i % CONFETTI_COLORS.length]);
}
function camKick(x, y) { if (reduced()) return; G.cam.kickX += x; G.cam.kickY += y; }
function dirtClods(x, y, n) {
  for (let i = 0; i < n; i++) { const a = -Math.PI * (0.3 + Math.random() * 0.5);
    spawnParticle(x, y, -120 - Math.random() * 160, Math.sin(a) * (120 + Math.random() * 160),
      0.5 + Math.random() * 0.4, 0.9, 4 + Math.random() * 5, 'clod',
      Math.random() * 7, (Math.random() - .5) * 20); }
}
function exhaust(b) {
  const a = b.angle;
  spawnParticle(b.rear.x - Math.cos(a) * 26, b.rear.y - 8 - Math.sin(a) * 26,
    -30 - Math.random() * 30, -14 - Math.random() * 12,
    0.35 + Math.random() * 0.25, 0.6, 4 + Math.random() * 4, 'exhaust');
}
let effectStepDt = 0;
function stepParticleEffect(particle, lease) {
  const dt = effectStepDt;
  particle.x += particle.vx * dt; particle.y += particle.vy * dt;
  if (particle.type === 'dust') { particle.vy += 40 * dt; particle.vx *= 0.94; }
  else if (particle.type === 'fire' || particle.type === 'smoke') { particle.vy += 120 * dt; particle.vx *= 0.96; }
  else if (particle.type === 'confetti') { particle.vy += 60 * dt; particle.vx += Math.sin(particle.y * 0.05) * 6 * dt; }
  else if (particle.type === 'clod') { particle.vy += 620 * dt; particle.rot += particle.vr * dt; }
  else if (particle.type === 'exhaust') { particle.vy -= 12 * dt; particle.vx *= 0.95; particle.size += 20 * dt; }
  particle.life -= dt;
  if (particle.life <= 0) particlePool.release(lease);
}
function stepPopupEffect(popup, lease) {
  popup.y += popup.vy * effectStepDt; popup.life -= effectStepDt;
  if (popup.life <= 0) popupPool.release(lease);
}
function stepTrackEffect(track, lease) {
  track.a -= effectStepDt * 0.12;
  if (track.a <= 0) trackPool.release(lease);
}
function updateParticles(dt) {
  effectStepDt = dt;
  particlePool.forEachActive(stepParticleEffect);
  popupPool.forEachActive(stepPopupEffect);
  trackPool.forEachActive(stepTrackEffect);
  effectStepDt = 0;
  if (G.cpFlash > 0) G.cpFlash -= dt;
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 30);
  G.cam.kickX *= (1 - Math.min(1, dt * 9)); G.cam.kickY *= (1 - Math.min(1, dt * 9));
}

// ---------------------------------------------------------------- camera ----
function updateCamera(dt) {
  const b = G.bike;
  const focusNodes = G.state === 'crashed' ? G.ragdollPose?.nodes : null;
  let focusX = b.x, focusY = b.y, vx = b.vx, vy = b.vy;
  if (focusNodes?.length) {
    let sumX = 0, sumY = 0, sumVx = 0, sumVy = 0;
    for (let i = 0; i < focusNodes.length; i++) {
      const node = focusNodes[i];
      sumX += node.x; sumY += node.y; sumVx += node.vx; sumVy += node.vy;
    }
    const inverseCount = 1 / focusNodes.length;
    focusX = sumX * inverseCount; focusY = sumY * inverseCount;
    vx = sumVx * inverseCount; vy = sumVy * inverseCount;
  }
  const tx = focusX + Math.max(-220, Math.min(280, vx * 0.32));
  const ty = focusY - 46 + Math.max(-70, Math.min(140, vy * 0.14));
  const tv = 452 + Math.min(200, Math.abs(vx) * 0.12) + (b.airborne ? 90 : 0);
  const k = 1 - Math.pow(0.001, dt);
  G.cam.x += (tx - G.cam.x) * k; G.cam.y += (ty - G.cam.y) * k;
  G.cam.viewH += (tv - G.cam.viewH) * (1 - Math.pow(0.02, dt));
  // camera roll: lean into flips (clamped), settle level on the ground
  const tr = (b.airborne && !reduced()) ? Math.max(-0.17, Math.min(0.17, normAngle(b.angle) * 0.32)) : 0;
  G.cam.roll += (tr - G.cam.roll) * (1 - Math.pow(0.02, dt));
}

// ---------------------------------------------------------------- render ----
let patDirt = null, patRock = null;
let skyBaseGrad = null, skyWarmGrad = null, skyGradW = 0, skyGradH = 0, skyGradDpr = 0;
const RIDGE_LAYERS = [
  { sp: 0.10, amp: 34, baseOffset: 34, f: 0.0016, col: 'rgba(120,150,180,0.45)' },
  { sp: 0.26, amp: 54, baseOffset: 70, f: 0.0023, col: 'rgba(96,120,150,0.5)' },
];
const DASH_NONE = Object.freeze([]);
const DASH_BOOST = Object.freeze([18, 10]);
const DASH_BOUNCE = Object.freeze([12, 7]);
const DASH_GUIDE = Object.freeze([8, 10]);
const DASH_SENSOR = Object.freeze([7, 7]);
const DASH_MOTION = Object.freeze([10, 9]);
const DASH_DISABLED = Object.freeze([8, 7]);
const DASH_SWEEP = Object.freeze([8, 6]);
const DASH_PROXY = Object.freeze([6, 5]);
const DASH_CHECKPOINT = Object.freeze([9, 7]);
const DASH_FINISH = Object.freeze([10, 6]);
const DASH_LOOM = Object.freeze([18, 12]);
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
  ctx.translate(cssW / 2 + sx + G.cam.kickX, cssH * 0.6 + sy + G.cam.kickY);
  if (G.cam.roll) ctx.rotate(G.cam.roll);
  ctx.scale(scale, scale);
  ctx.translate(-G.cam.x, -G.cam.y);
  return scale;
}

function drawSky() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const im = IMG.sky;
  if (!im) { ctx.fillStyle = '#7fc7ee'; ctx.fillRect(0, 0, cssW, cssH); return; }
  if (!skyBaseGrad || skyGradW !== cssW || skyGradH !== cssH || skyGradDpr !== dpr) {
    skyGradW = cssW; skyGradH = cssH; skyGradDpr = dpr;
    skyBaseGrad = ctx.createLinearGradient(0, 0, 0, cssH);
    skyBaseGrad.addColorStop(0, '#4ea6e6'); skyBaseGrad.addColorStop(1, '#bfe3f5');
    skyWarmGrad = ctx.createLinearGradient(0, 0, 0, cssH);
    skyWarmGrad.addColorStop(0, 'rgba(255,240,200,0.12)'); skyWarmGrad.addColorStop(0.5, 'rgba(255,255,255,0)');
  }
  ctx.fillStyle = skyBaseGrad; ctx.fillRect(0, 0, cssW, cssH);
  const ih = cssH, iw = ih * im.width / im.height;
  const scroll = G.cam.x * 0.25;
  const oy = -Math.max(0, Math.min(cssH * 0.22, (G.cam.y - 240) * 0.1));
  const n0 = Math.floor(scroll / iw) - 1;
  for (let i = n0; i * iw - scroll < cssW + iw; i++) {
    const x = i * iw - scroll, flip = (((i % 2) + 2) % 2) === 1;
    if (flip) { ctx.save(); ctx.translate(x + iw, oy); ctx.scale(-1, 1); ctx.drawImage(im, 0, 0, iw, ih); ctx.restore(); }
    else ctx.drawImage(im, x, oy, iw, ih);
  }
  drawRidges();
  ctx.fillStyle = skyWarmGrad; ctx.fillRect(0, 0, cssW, cssH);
}
// distant hill silhouettes at two parallax speeds — cheap layered depth
function drawRidges() {
  if (G.state === 'menu') return;
  const horizon = cssH * 0.52;
  for (const L of RIDGE_LAYERS) {
    const base = horizon + L.baseOffset;
    ctx.fillStyle = L.col; ctx.beginPath(); ctx.moveTo(0, cssH);
    for (let sx = 0; sx <= cssW; sx += 14) {
      const wx = G.cam.x * L.sp + sx;
      const y = base + Math.sin(wx * L.f) * L.amp + Math.sin(wx * L.f * 2.7 + 1.3) * L.amp * 0.35;
      ctx.lineTo(sx, y);
    }
    ctx.lineTo(cssW, cssH); ctx.closePath(); ctx.fill();
  }
}

function visibleStart(pts, left) {
  let index = 0;
  while (index < pts.length - 1 && pts[index + 1].x < left) index++;
  return index;
}
function visibleEnd(pts, right) {
  let index = pts.length - 1;
  while (index > 0 && pts[index - 1].x > right) index--;
  return index;
}

function drawSurfaceBands(pts, i0, i1) {
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = Math.max(1, i0 + 1); i <= i1; i++) {
    const a = pts[i - 1], b = pts[i], surface = b.surface || 'dirt';
    if (surface === 'dirt') continue;
    ctx.beginPath(); ctx.moveTo(a.x, a.y - 2); ctx.lineTo(b.x, b.y - 2);
    ctx.lineWidth = surface === 'boost' ? 14 : 11;
    ctx.strokeStyle = surface === 'ice' ? 'rgba(150,235,255,0.92)'
      : surface === 'boost' ? 'rgba(255,175,35,0.96)' : 'rgba(236,95,255,0.92)';
    ctx.setLineDash(surface === 'boost' ? DASH_BOOST : surface === 'bouncy' ? DASH_BOUNCE : DASH_NONE);
    ctx.lineDashOffset = surface === 'boost' ? -performance.now() * 0.04 : 0;
    ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.setLineDash(DASH_NONE); ctx.stroke();
  }
  ctx.restore();
}

function drawTerrain(scale) {
  const left = G.cam.x - (cssW / 2) / scale - 80, right = G.cam.x + (cssW / 2) / scale + 80;
  const bottom = G.cam.y + (cssH * 0.6) / scale + 400;
  const DIRT = 42;
  for (const ch of G.level.course.render) {
    if (ch.type !== 'ground') continue;
    const pts = ch.pts; if (pts[pts.length - 1].x < left || pts[0].x > right) continue;
    const i0 = visibleStart(pts, left), i1 = visibleEnd(pts, right); if (i1 <= i0) continue;
    ctx.beginPath(); ctx.moveTo(pts[i0].x, pts[i0].y);
    for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineTo(pts[i1].x, bottom); ctx.lineTo(pts[i0].x, bottom); ctx.closePath();
    ctx.fillStyle = patRock || '#b98a55'; ctx.fill();
    ctx.fillStyle = 'rgba(60,40,25,0.28)'; ctx.fill();
    // form shading: warm rim of light at the surface fading to dark depths
    let top = Infinity; for (let i = i0; i <= i1; i++) if (pts[i].y < top) top = pts[i].y;
    const grd = ctx.createLinearGradient(0, top - 16, 0, top + 300);
    grd.addColorStop(0, 'rgba(255,226,170,0.18)'); grd.addColorStop(0.18, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(18,11,5,0.55)');
    ctx.fillStyle = grd; ctx.fill();
    ctx.beginPath(); ctx.moveTo(pts[i0].x, pts[i0].y);
    for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(pts[i].x, pts[i].y);
    for (let i = i1; i >= i0; i--) ctx.lineTo(pts[i].x, pts[i].y + DIRT); ctx.closePath();
    ctx.fillStyle = patDirt || '#c98d4e'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(pts[i0].x, pts[i0].y);
    for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineWidth = 5; ctx.strokeStyle = '#3a2717'; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,225,150,0.55)'; ctx.stroke();
    drawSurfaceBands(pts, i0, i1);
  }
}

const LOOM_PALETTES = Object.freeze({
  cyan: Object.freeze({ field: 'rgba(60,205,255,0.105)', line: '#55d8ff', glow: '#bcefff' }),
  magenta: Object.freeze({ field: 'rgba(255,116,208,0.10)', line: '#ff74d0', glow: '#ffd1ef' }),
  amber: Object.freeze({ field: 'rgba(255,190,46,0.09)', line: '#ffbe2e', glow: '#fff0b0' }),
});

// Kinetic Looms are original non-solid path-weaving machines. Their animation
// is tied to the authoritative fixed tick so screenshots and replays show the
// same field phase; Reduced Motion keeps the woven chevrons static.
function drawForceZones() {
  const zones = G.forceZones?.zones || [];
  for (const zone of zones) {
    const bounds = zone.bounds || {
      left: zone.x - zone.width * 0.5, right: zone.x + zone.width * 0.5,
      top: zone.y - zone.height * 0.5, bottom: zone.y + zone.height * 0.5,
    };
    const palette = LOOM_PALETTES[zone.render?.palette] || LOOM_PALETTES.cyan;
    const ax = zone.acceleration?.x || 0, ay = zone.acceleration?.y || 0;
    const magnitude = Math.hypot(ax, ay) || 1;
    const ux = ax / magnitude, uy = ay / magnitude;
    const px = -uy, py = ux;
    const diagonal = Math.hypot(zone.width, zone.height) + 80;
    const span = Math.min(zone.width, zone.height) * 0.72;
    const phase = reduced() ? 0.42 : ((G.run?.tick || 0) % 120) / 120;

    ctx.save();
    ctx.globalAlpha = zone.enabled === false ? 0.34 : 1;
    ctx.fillStyle = palette.field; ctx.fillRect(bounds.left, bounds.top, zone.width, zone.height);
    ctx.beginPath(); ctx.rect(bounds.left, bounds.top, zone.width, zone.height); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    for (let ribbon = 0; ribbon < 7; ribbon++) {
      const offset = (ribbon / 6 - 0.5) * span;
      const cx = zone.x + px * offset, cy = zone.y + py * offset;
      ctx.strokeStyle = ribbon === 3 ? palette.glow : palette.line;
      ctx.globalAlpha = ribbon === 3 ? 0.8 : 0.38;
      ctx.lineWidth = ribbon === 3 ? 3 : 1.6;
      ctx.setLineDash(DASH_LOOM);
      ctx.lineDashOffset = reduced() ? -14 : -(phase * 30 + ribbon * 5);
      ctx.beginPath();
      ctx.moveTo(cx - ux * diagonal * 0.5, cy - uy * diagonal * 0.5);
      ctx.lineTo(cx + ux * diagonal * 0.5, cy + uy * diagonal * 0.5);
      ctx.stroke();
      for (let arrow = 0; arrow < 3; arrow++) {
        const along = ((arrow / 3 + phase + ribbon * 0.07) % 1 - 0.5) * diagonal;
        const tipX = cx + ux * along, tipY = cy + uy * along;
        ctx.setLineDash(DASH_NONE); ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - ux * 14 + px * 7, tipY - uy * 14 + py * 7);
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - ux * 14 - px * 7, tipY - uy * 14 - py * 7);
        ctx.stroke();
      }
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = zone.enabled === false ? 0.42 : 1;
    ctx.strokeStyle = palette.line; ctx.lineWidth = 2; ctx.setLineDash(DASH_SENSOR);
    ctx.strokeRect(bounds.left, bounds.top, zone.width, zone.height);
    ctx.setLineDash(DASH_NONE);
    // Compact steel loom heads keep the field readable as machinery without
    // implying that the full translucent volume is a solid collider.
    for (let head = 0; head < 2; head++) {
      const x = (head === 0 ? bounds.left : bounds.right) - 8;
      ctx.fillStyle = '#222b35'; ctx.strokeStyle = '#0e141b'; ctx.lineWidth = 3;
      roundRect(x, bounds.bottom - 46, 16, 46, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3d4b59'; ctx.fillRect(x + 4, bounds.bottom - 40, 8, 28);
      ctx.fillStyle = palette.glow; ctx.fillRect(x + 5, bounds.bottom - 35, 6, 12);
      ctx.beginPath(); ctx.arc(x + 8, bounds.bottom - 7, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = palette.glow; ctx.font = '900 11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(zone.render?.label || 'VECTOR', zone.x, bounds.top - 9);
    ctx.restore(); ctx.textAlign = 'left'; ctx.setLineDash(DASH_NONE);
  }
}

function crashSparks(x, y) {
  dustBurst(x, y, 5);
  dirtClods(x, y, 7);
  for (let i = 0; i < 12; i++) {
    const a = Math.PI * (1.08 + Math.random() * 0.84), sp = 90 + Math.random() * 190;
    spawnParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
      0.18 + Math.random() * 0.28, 0.46, 2 + Math.random() * 4, 'fire');
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
  for (const h of G.run?.hazards || []) {
    if (h.exploded) continue;
    if (h.motion?.kind === 'sine') {
      ctx.save(); ctx.globalAlpha = 0.22; ctx.strokeStyle = '#9fd4ff'; ctx.lineWidth = 2; ctx.setLineDash(DASH_GUIDE);
      ctx.beginPath();
      if (h.motion.axis === 'x') { ctx.moveTo(h.baseX - h.motion.amplitude, h.baseY); ctx.lineTo(h.baseX + h.motion.amplitude, h.baseY); }
      else { ctx.moveTo(h.baseX, h.baseY - h.motion.amplitude); ctx.lineTo(h.baseX, h.baseY + h.motion.amplitude); }
      ctx.stroke(); ctx.restore();
    }
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
    } else if (h.type === 'mace') {
      ctx.save();
      ctx.strokeStyle = '#343a45'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(h.anchorX, h.anchorY); ctx.lineTo(h.x, h.y); ctx.stroke();
      ctx.strokeStyle = '#9aa3b1'; ctx.lineWidth = 2; ctx.stroke();
      ctx.translate(h.x, h.y); ctx.rotate(h.spin); ctx.fillStyle = '#303641'; ctx.strokeStyle = '#b8c2d1'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, h.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (h.r - 2), Math.sin(a) * (h.r - 2));
        ctx.lineTo(Math.cos(a) * (h.r + 13), Math.sin(a) * (h.r + 13)); ctx.stroke(); }
      ctx.restore();
    } else if (h.type === 'crusher') {
      ctx.save();
      ctx.fillStyle = '#343a45'; ctx.fillRect(h.baseX - 13, h.baseY - 150, 26, Math.max(150, h.y - h.baseY + 150));
      ctx.fillStyle = '#697383'; ctx.strokeStyle = '#161a20'; ctx.lineWidth = 4;
      roundRect(h.x - 58, h.y - 34, 116, 68, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffbe2e';
      for (let x = h.x - 47; x < h.x + 45; x += 23) { ctx.save(); ctx.translate(x, h.y); ctx.rotate(-0.7); ctx.fillRect(-5, -31, 10, 62); ctx.restore(); }
      ctx.restore();
    } else if (h.type === 'tnt') {
      const pulse = h.triggered ? 1 + Math.sin(G.run.tick * 0.65) * 0.08 : 1;
      ctx.save(); ctx.translate(h.x, h.y); ctx.scale(pulse, pulse);
      ctx.fillStyle = h.triggered ? '#ffcf34' : '#d63e2f'; ctx.strokeStyle = '#491611'; ctx.lineWidth = 4;
      roundRect(-32, -27, 64, 54, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff1ca'; ctx.font = '900 18px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('TNT', 0, 2);
      ctx.strokeStyle = '#2c2c2c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(12, -27); ctx.quadraticCurveTo(20, -42, 30, -35); ctx.stroke();
      ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
  }
}

function drawPlatforms() {
  for (const platform of G.kinematics?.platforms || []) {
    const p = sampleKinematicPlatform(platform, 1);
    const base = platform.definition;
    ctx.save();
    if (Number.isFinite(base.triggerX)) {
      const groundY = groundYAt(base.triggerX);
      if (groundY != null) {
        const armed = !p.active;
        ctx.strokeStyle = armed ? '#55d8ff' : '#8bff6b'; ctx.lineWidth = 3;
        ctx.setLineDash(DASH_SENSOR); ctx.beginPath();
        ctx.moveTo(base.triggerX, groundY - 5); ctx.lineTo(base.x, base.y); ctx.stroke();
        ctx.setLineDash(DASH_NONE);
        ctx.fillStyle = armed ? '#173d51' : '#17462c'; ctx.strokeStyle = armed ? '#55d8ff' : '#8bff6b';
        ctx.lineWidth = 3; roundRect(base.triggerX - 36, groundY - 9, 72, 13, 5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = armed ? '#bcefff' : '#c9ffd0'; ctx.font = '900 11px ui-monospace, monospace';
        ctx.textAlign = 'center'; ctx.fillText(armed ? 'LIFT SENSOR' : 'LIFT LIVE', base.triggerX, groundY - 18);
        ctx.textAlign = 'left';
      }
    }
    ctx.strokeStyle = 'rgba(180,210,230,0.24)'; ctx.lineWidth = 3;
    ctx.setLineDash(DASH_MOTION); ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    ctx.setLineDash(DASH_NONE);
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = p.active ? 1 : 0.74;
    ctx.fillStyle = '#222b35'; ctx.strokeStyle = '#0e141b'; ctx.lineWidth = 4;
    roundRect(-p.width / 2, -p.height / 2, p.width, p.height, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#3d4b59'; ctx.fillRect(-p.width / 2 + 5, -p.height / 2 + 4, p.width - 10, 5);
    if (p.render.warningStripe) {
      ctx.save(); roundRect(-p.width / 2 + 4, -p.height / 2 + 3, p.width - 8, p.height - 6, 3); ctx.clip();
      ctx.fillStyle = '#e6a72d';
      for (let x = -p.width / 2 - p.height; x < p.width / 2 + p.height; x += 28) {
        ctx.save(); ctx.translate(x, 0); ctx.rotate(-0.72); ctx.fillRect(-5, -p.height, 10, p.height * 2); ctx.restore();
      }
      ctx.restore();
    }
    ctx.fillStyle = '#a8bac7';
    for (let x = -p.width / 2 + 13; x < p.width / 2; x += 28) {
      ctx.beginPath(); ctx.arc(x, 0, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    if (!p.active) {
      ctx.globalAlpha = 1; ctx.fillStyle = '#55d8ff'; ctx.font = '900 12px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.fillText('STANDBY', 0, -p.height / 2 - 10); ctx.textAlign = 'left';
    }
    ctx.restore();
  }
}

function drawCollisionDebug() {
  const p = buildDebugProxySnapshot({
    terrain: G.terrain, run: G.run, kinematicRun: G.kinematics,
    forceZones: G.forceZones, bike: G.bike, level: G.level,
  });
  G.debugProxy = p;
  const circle = (item, color, width = 2) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
    ctx.arc(item.x, item.y, item.r, 0, Math.PI * 2); ctx.stroke();
  };
  ctx.save(); ctx.globalAlpha = 0.92; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const segment of p.terrain) {
    ctx.strokeStyle = segment.enabled ? (segment.surface === 'ice' ? '#62ddff'
      : segment.surface === 'boost' ? '#ffdd57' : segment.surface === 'bouncy' ? '#ff74d0' : '#53ff91') : '#ff4f5e';
    ctx.lineWidth = segment.enabled ? 3 : 2; ctx.setLineDash(segment.enabled ? DASH_NONE : DASH_DISABLED);
    ctx.beginPath(); ctx.moveTo(segment.a.x, segment.a.y); ctx.lineTo(segment.b.x, segment.b.y); ctx.stroke();
  }
  ctx.setLineDash(DASH_SWEEP);
  for (const sweep of p.bike.sweeps) {
    ctx.strokeStyle = sweep.kind === 'head' ? '#ff4f8b' : '#5be7ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sweep.x0, sweep.y0); ctx.lineTo(sweep.x1, sweep.y1); ctx.stroke();
  }
  ctx.setLineDash(DASH_NONE);
  for (const item of p.bike.circles) circle(item.current, item.kind === 'head' ? '#ff4f8b' : '#5be7ff', 3);
  for (const hazard of p.hazards) {
    ctx.strokeStyle = hazard.active ? '#ff9f43' : '#79818b'; ctx.lineWidth = 2; ctx.setLineDash(DASH_PROXY);
    ctx.beginPath(); ctx.moveTo(hazard.sweep.x0, hazard.sweep.y0); ctx.lineTo(hazard.sweep.x1, hazard.sweep.y1); ctx.stroke();
    ctx.setLineDash(DASH_NONE); circle(hazard.current, hazard.active ? '#ff5b3d' : '#79818b', 3);
  }
  for (const platform of p.platforms) {
    const prev = platform.previous, cur = platform.current;
    ctx.strokeStyle = '#8392a5'; ctx.lineWidth = 2; ctx.setLineDash(DASH_PROXY);
    ctx.strokeRect(prev.left, prev.top, prev.width, prev.height); ctx.setLineDash(DASH_NONE);
    ctx.strokeStyle = platform.active ? '#b46cff' : '#55d8ff'; ctx.lineWidth = 3;
    ctx.strokeRect(cur.left, cur.top, cur.width, cur.height);
    ctx.beginPath(); ctx.moveTo(platform.sweep.x0, platform.sweep.y0); ctx.lineTo(platform.sweep.x1, platform.sweep.y1); ctx.stroke();
  }
  for (const zone of p.forceZones) {
    ctx.strokeStyle = zone.active ? '#55d8ff' : '#79818b'; ctx.lineWidth = 3;
    ctx.setLineDash(DASH_PROXY);
    ctx.strokeRect(zone.bounds.left, zone.bounds.top,
      zone.bounds.right - zone.bounds.left, zone.bounds.bottom - zone.bounds.top);
    ctx.setLineDash(DASH_NONE); ctx.beginPath();
    ctx.moveTo(zone.arrow.x1, zone.arrow.y1); ctx.lineTo(zone.arrow.x2, zone.arrow.y2); ctx.stroke();
    const angle = Math.atan2(zone.arrow.y2 - zone.arrow.y1, zone.arrow.x2 - zone.arrow.x1);
    ctx.beginPath(); ctx.moveTo(zone.arrow.x2, zone.arrow.y2);
    ctx.lineTo(zone.arrow.x2 - Math.cos(angle - 0.48) * 14,
      zone.arrow.y2 - Math.sin(angle - 0.48) * 14);
    ctx.moveTo(zone.arrow.x2, zone.arrow.y2);
    ctx.lineTo(zone.arrow.x2 - Math.cos(angle + 0.48) * 14,
      zone.arrow.y2 - Math.sin(angle + 0.48) * 14); ctx.stroke();
  }
  for (const checkpoint of p.checkpoints) {
    ctx.strokeStyle = checkpoint.reached ? '#7d8794' : checkpoint.next ? '#55d8ff' : '#42637b';
    ctx.lineWidth = checkpoint.next ? 3 : 2; ctx.setLineDash(DASH_CHECKPOINT);
    ctx.beginPath(); ctx.moveTo(checkpoint.line.x1, checkpoint.line.y1); ctx.lineTo(checkpoint.line.x2, checkpoint.line.y2); ctx.stroke();
  }
  if (p.finish) {
    ctx.strokeStyle = '#ffe052'; ctx.lineWidth = 3; ctx.setLineDash(DASH_FINISH);
    ctx.beginPath(); ctx.moveTo(p.finish.line.x1, p.finish.line.y1); ctx.lineTo(p.finish.line.x2, p.finish.line.y2); ctx.stroke();
  }
  ctx.restore(); ctx.setLineDash(DASH_NONE);
}

function groundYAt(x) {
  const T = G.terrain; if (!T) return null;
  let best = null; const lo = T.bi(x);
  for (let bk = lo - 1; bk <= lo + 1; bk++) { if (bk < 0 || bk >= T.buckets.length) continue;
    for (const idx of T.buckets[bk]) { const s = T.segments[idx];
      if (x >= s.minx && x <= s.maxx) { const t = (x - s.ax) / ((s.bx - s.ax) || 1); const y = s.ay + (s.by - s.ay) * t;
        if (best == null || y < best) best = y; } } }
  return best;
}
// One spinning wheel: textured sprite if we have one, else a procedural
// knobby tire + rim + spokes. Rotates by `spin` (radians).
function drawWheel(cx, cy, r, spin) {
  const im = IMG.wheel;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(spin);
  if (im) {
    ctx.drawImage(im, -r, -r, r * 2, r * 2);
  } else {
    ctx.fillStyle = '#0d0e11'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();          // tire
    ctx.strokeStyle = '#26282e'; ctx.lineWidth = r * 0.34;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, 7); ctx.stroke();                             // sidewall
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2;                            // tread lugs
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke(); }
    ctx.fillStyle = '#b9c0ca'; ctx.beginPath(); ctx.arc(0, 0, r * 0.30, 0, 7); ctx.fill();    // hub
    ctx.strokeStyle = '#8a929d'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66); ctx.stroke(); }
  }
  ctx.restore();
}

function drawBike() {
  const b = G.bike;
  const gy = groundYAt(b.x);
  // dynamic contact shadow: tight/dark on the ground, wide/faint in the air
  if (gy != null) {
    const airH = Math.max(0, gy - (b.y + CONFIG.wheelR)), t = Math.min(1, airH / 300);
    ctx.save(); ctx.globalAlpha = 0.30 * (1 - t * 0.72); ctx.fillStyle = '#1a1206';
    ctx.beginPath(); ctx.ellipse(b.x, gy - 2, 44 + t * 34, 10 + t * 3, 0, 0, 7); ctx.fill(); ctx.restore();
  }

  // ---- suspension-aware anchors -----------------------------------------
  // The detailed sprite is pinned to the two physics axles, but each axle
  // anchor is nudged along bike-up by that wheel's REAL compression, so the
  // body squats/pitches on the suspension while the wheels stay planted.
  const A = b.angle, ux = Math.sin(A), uy = -Math.cos(A);
  const rA = b.rear, fA = b.front;
  const rOff = (b.rearComp - BODY.sag) * BODY.dip;   // >0 compressed -> body down
  const fOff = (b.frontComp - BODY.sag) * BODY.dip;
  const rAncX = rA.x - ux * rOff, rAncY = rA.y - uy * rOff;
  const fAncX = fA.x - ux * fOff, fAncY = fA.y - uy * fOff;

  const img = IMG.bike_body;
  if (img) {
    // similarity transform mapping sprite axle pixels (Sr,Sf) -> world anchors
    const Sr = BODY.Sr, Sf = BODY.Sf;
    const svx = Sf.x - Sr.x, svy = Sf.y - Sr.y;
    const wvx = fAncX - rAncX, wvy = fAncY - rAncY;
    const scale = Math.hypot(wvx, wvy) / Math.hypot(svx, svy);
    const rot = Math.atan2(wvy, wvx) - Math.atan2(svy, svx);
    ctx.save();
    ctx.translate(rAncX, rAncY); ctx.rotate(rot); ctx.scale(scale, scale); ctx.translate(-Sr.x, -Sr.y);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
    // spinning wheels drawn ON TOP at the true axles — they cover the sprite's
    // open fork/swingarm ends, hiding the suspension joint as the body travels.
    drawWheel(fA.x, fA.y, BODY.wheelR, b.wheelSpin);
    drawWheel(rA.x, rA.y, BODY.wheelR, b.wheelSpin);
  } else if (IMG.bike) {                               // fallback: old single sprite
    const w = CONFIG.wheelBase * BIKE.w, h = w * IMG.bike.height / IMG.bike.width;
    ctx.save(); ctx.translate(b.x, b.y + BIKE.lift); ctx.rotate(b.angle);
    ctx.drawImage(IMG.bike, -w / 2, -h * BIKE.axleY, w, h); ctx.restore();
  }
}

const ragdollNodeLookup = Object.create(null);
const ragdollNodeStamp = Object.create(null);
let ragdollPoseStamp = 0;
function ragdollLinkActive(links, a, b) {
  for (let i = 0; i < links.length; i++) {
    const item = links[i];
    if ((item.a === a && item.b === b) || (item.a === b && item.b === a)) return true;
  }
  return false;
}
function drawRagdollLink(links, stamp, a, b, color, width, requireActive = false) {
  if (ragdollNodeStamp[a] !== stamp || ragdollNodeStamp[b] !== stamp
    || (requireActive && !ragdollLinkActive(links, a, b))) return;
  const from = ragdollNodeLookup[a], to = ragdollNodeLookup[b];
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
  ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
}
function drawCrashRagdoll() {
  const pose = G.ragdollPose; if (!pose?.nodes?.length) return drawBike();
  const stamp = ++ragdollPoseStamp, links = pose.links || [];
  for (let i = 0; i < pose.nodes.length; i++) {
    const node = pose.nodes[i]; ragdollNodeLookup[node.id] = node; ragdollNodeStamp[node.id] = stamp;
  }
  const n = ragdollNodeLookup;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // Detached bike chassis: layered tubes keep the silhouette readable at speed.
  drawRagdollLink(links, stamp, 'rearWheel', 'bikeFrame', '#151a20', 11);
  drawRagdollLink(links, stamp, 'bikeFrame', 'frontWheel', '#151a20', 11);
  drawRagdollLink(links, stamp, 'rearWheel', 'frontWheel', '#343d47', 7);
  drawRagdollLink(links, stamp, 'bikeFrame', 'seat', '#ff5a3c', 10);
  drawRagdollLink(links, stamp, 'bikeFrame', 'handlebar', '#aeb8c3', 6);
  drawRagdollLink(links, stamp, 'frontWheel', 'handlebar', '#626e79', 5);
  drawRagdollLink(links, stamp, 'rearWheel', 'bikeFrame', '#ff5a3c', 5);
  drawRagdollLink(links, stamp, 'bikeFrame', 'frontWheel', '#ff5a3c', 5);
  drawWheel(n.rearWheel.x, n.rearWheel.y, n.rearWheel.radius, G.bike.wheelSpin - pose.elapsed * 8);
  drawWheel(n.frontWheel.x, n.frontWheel.y, n.frontWheel.radius, G.bike.wheelSpin + pose.elapsed * 9);

  // Segmented original rider model.
  drawRagdollLink(links, stamp, 'hip', 'torso', '#234f8c', 15);
  drawRagdollLink(links, stamp, 'torso', 'head', '#234f8c', 12);
  drawRagdollLink(links, stamp, 'torso', 'rearHand', '#ff6948', 8);
  drawRagdollLink(links, stamp, 'rearHand', 'handlebar', '#e2a47f', 5, true);
  drawRagdollLink(links, stamp, 'torso', 'frontHand', '#ff6948', 8);
  drawRagdollLink(links, stamp, 'frontHand', 'handlebar', '#e2a47f', 5, true);
  drawRagdollLink(links, stamp, 'hip', 'rearFoot', '#1c2f50', 10);
  drawRagdollLink(links, stamp, 'hip', 'frontFoot', '#1c2f50', 10);
  ctx.fillStyle = '#ff6948'; ctx.beginPath(); ctx.arc(n.torso.x, n.torso.y, n.torso.radius + 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#17233a'; ctx.beginPath(); ctx.arc(n.hip.x, n.hip.y, n.hip.radius, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f0b08a'; ctx.beginPath(); ctx.arc(n.head.x, n.head.y, n.head.radius, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd23e'; ctx.strokeStyle = '#151a20'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(n.helmet.x, n.helmet.y, n.helmet.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  const hx = n.head.x - n.helmet.x, hy = n.head.y - n.helmet.y, hl = Math.max(1, Math.hypot(hx, hy));
  ctx.strokeStyle = '#243447'; ctx.lineWidth = 5; ctx.beginPath();
  ctx.moveTo(n.helmet.x - hy / hl * 4, n.helmet.y + hx / hl * 4);
  ctx.lineTo(n.helmet.x + hx / hl * 9 - hy / hl * 3, n.helmet.y + hy / hl * 9 + hx / hl * 3); ctx.stroke();
  ctx.fillStyle = '#202936'; ctx.beginPath(); ctx.arc(n.rearHand.x, n.rearHand.y, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(n.frontHand.x, n.frontHand.y, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#10151b'; ctx.beginPath(); ctx.ellipse(n.rearFoot.x, n.rearFoot.y, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(n.frontFoot.x, n.frontFoot.y, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawTrackEffect(track) {
  if (track.a <= 0) return;
  ctx.globalAlpha = track.a * 0.5;
  ctx.beginPath(); ctx.ellipse(track.x, track.y, 4, 2.2, 0, 0, 7); ctx.fill();
}
function drawTracks() {
  ctx.fillStyle = '#2e2011'; trackPool.forEachActive(drawTrackEffect);
  ctx.globalAlpha = 1;
}
function drawParticleEffect(p) {
  const a = Math.max(0, p.life / p.max);
  if (p.type === 'clod') { ctx.globalAlpha = a; ctx.fillStyle = '#6b4a2a';
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0); ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.restore(); return; }
  if (p.type === 'fire') { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.fillStyle = a > 0.5 ? '#ffe14d' : '#ff6a2b'; }
  else if (p.type === 'dust') { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a * 0.45; ctx.fillStyle = '#dcc199'; }
  else if (p.type === 'smoke') { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a * 0.45; ctx.fillStyle = '#4a4038'; }
  else if (p.type === 'exhaust') { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a * 0.28; ctx.fillStyle = '#9a9a9a'; }
  else if (p.type === 'confetti') { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a; ctx.fillStyle = p.col; }
  ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill();
}
function drawParticles() {
  particlePool.forEachActive(drawParticleEffect);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}

function drawPopupEffect(popup) {
  ctx.globalAlpha = Math.min(1, popup.life / 0.6); ctx.fillStyle = popup.color;
  ctx.font = '700 26px system-ui'; ctx.textAlign = 'center';
  ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.strokeText(popup.text, popup.x, popup.y); ctx.fillText(popup.text, popup.x, popup.y);
}

function drawWorld(scale) {
  drawTerrain(scale);
  drawForceZones();
  drawPlatforms();
  drawTracks();
  let checkpointNumber = 0;
  for (const d of G.level.course.decos) if (d.type === 'checkpoint') {
    checkpointNumber++;
    drawFlag(IMG.checkpoint, d.x, d.y, 130, checkpointNumber <= G.cpIndex);
  }
  if (G.level.course.finishPt) drawFlag(IMG.finish, G.level.course.finishPt.x, G.level.course.finishPt.y, 150, true);
  drawHazards();
  drawParticles();
  if (G.state === 'crashed' && G.ragdollPose) drawCrashRagdoll(); else drawBike();
  if (collisionDebug) drawCollisionDebug();
  popupPool.forEachActive(drawPopupEffect);
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
}

// ---------------------------------------------------------------- HUD -------
function fmt(t) { const m = Math.floor(t / 60), s = (t % 60); return (m > 0 ? m + ':' + s.toFixed(2).padStart(5, '0') : s.toFixed(2)); }
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function registerButton(x, y, w, h, id) {
  let button = uiButtons[uiButtonCount];
  if (!button) { button = { x: 0, y: 0, w: 0, h: 0, id: '' }; uiButtons.push(button); }
  button.x = x; button.y = y; button.w = w; button.h = h; button.id = id; uiButtonCount++;
}
function btn(x, y, w, h, label, id, color = '#ff5a3c') {
  roundRect(x, y, w, h, 12); ctx.fillStyle = color; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '700 ' + Math.round(h * 0.42) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  registerButton(x, y, w, h, id);
}
function star(cx, cy, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fillStyle = filled ? '#ffd23e' : 'rgba(255,255,255,0.18)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = filled ? '#c99400' : 'rgba(0,0,0,0.3)'; ctx.stroke();
}

function drawHUD() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  uiButtonCount = 0;
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
    roundRect(cssW - pad - 98, pad + 47, 98, 25, 7); ctx.fillStyle = 'rgba(18,20,29,0.62)'; ctx.fill();
    ctx.fillStyle = '#ffd23e'; ctx.font = '800 12px ui-monospace, monospace'; ctx.textAlign = 'center';
    ctx.fillText('GEAR ' + G.engineGear, cssW - pad - 49, pad + 64); ctx.textAlign = 'left';
    if (G.replayMode) {
      const rw = G.replaySource === 'golden' ? 118 : 92, rx = (cssW - rw) / 2;
      roundRect(rx, pad, rw, 30, 9); ctx.fillStyle = 'rgba(60,107,255,0.88)'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '800 12px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('▶ ' + (G.replaySource === 'golden' ? STR.goldRun : STR.replay), cssW / 2, pad + 20); ctx.textAlign = 'left';
    }
    if (G.cpFlash > 0) { ctx.globalAlpha = Math.min(1, G.cpFlash); ctx.fillStyle = '#8fe3ff'; ctx.font = '800 34px system-ui'; ctx.textAlign = 'center'; ctx.fillText(STR.checkpoint, cssW / 2, 70); ctx.globalAlpha = 1; ctx.textAlign = 'left'; }
    if (isTouch && G.state === 'playing' && !G.settingsOpen) drawTouchControls();
  }
  if (G.state === 'paused') overlayPaused();
  if (G.state === 'crashed') overlayCrashed();
  if (G.state === 'finished') overlayFinished();
  if (G.state === 'menu') drawMenu();
  if (G.settingsOpen) { uiButtonCount = 0; drawSettings(); }
  if (G.replayNotice) drawReplayNotice();
  if (collisionDebug && G.debugProxy && G.level) drawCollisionLegend();
}

function drawCollisionLegend() {
  const p = G.debugProxy, x = 14, y = 116, w = Math.min(284, cssW - 28), h = 130;
  ctx.save();
  roundRect(x, y, w, h, 12); ctx.fillStyle = 'rgba(7,13,20,0.90)'; ctx.fill();
  ctx.strokeStyle = 'rgba(85,216,255,0.65)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#55d8ff'; ctx.font = '900 13px ui-monospace, monospace';
  ctx.fillText('COLLISION PROXIES  [C]', x + 12, y + 21);
  ctx.fillStyle = '#d9e7ef'; ctx.font = '700 11px ui-monospace, monospace';
  ctx.fillText(`TICK ${String(p.tick).padStart(5, '0')}  TERRAIN ${p.terrain.length}`, x + 12, y + 42);
  ctx.fillText(`BIKE 3  HAZARDS ${p.hazards.length}  DECKS ${p.platforms.length}`, x + 12, y + 59);
  ctx.fillText(`LOOMS ${p.forceZones.length}  CHECKPOINTS ${p.checkpoints.length}`, x + 12, y + 76);
  ctx.fillStyle = '#53ff91'; ctx.fillText('━ TERRAIN', x + 12, y + 97);
  ctx.fillStyle = '#5be7ff'; ctx.fillText('○ BIKE', x + 97, y + 97);
  ctx.fillStyle = '#ff5b3d'; ctx.fillText('○ HAZARD', x + 163, y + 97);
  ctx.fillStyle = '#b46cff'; ctx.fillText('□ PLATFORM', x + 12, y + 116);
  ctx.fillStyle = '#55d8ff'; ctx.fillText('□ LOOM', x + 119, y + 116);
  ctx.fillStyle = '#ffe052'; ctx.fillText('┊ GOALS', x + 197, y + 116);
  ctx.restore();
}

function drawReplayNotice() {
  const w = Math.min(500, cssW - 24), h = 62, x = (cssW - w) / 2, y = 16;
  ctx.save();
  ctx.globalAlpha = Math.min(1, G.replayNotice.life * 2);
  roundRect(x, y, w, h, 14); ctx.fillStyle = 'rgba(78,19,26,0.96)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,106,74,0.85)'; ctx.stroke();
  ctx.textAlign = 'center'; ctx.fillStyle = '#ff8b72'; ctx.font = '900 16px system-ui';
  ctx.fillText(G.replayNotice.message, cssW / 2, y + 25);
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '600 11px system-ui';
  ctx.fillText(String(G.replayNotice.detail || '').slice(0, 72), cssW / 2, y + 45);
  ctx.restore(); ctx.textAlign = 'left';
}

function drawTouchControls() {
  const R = controlRects(); const cmd = inputState.readCommands(displayInput);
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
  const reveal = Math.max(0, Math.min(1, (G.crashAge - 0.18) / 0.24));
  if (reveal <= 0) return;
  ctx.globalAlpha = reveal;
  ctx.fillStyle = 'rgba(120,20,10,0.22)'; ctx.fillRect(0, 0, cssW, cssH);
  const titleY = Math.max(118, cssH * 0.27);
  ctx.fillStyle = '#ff6a4a'; ctx.font = '900 ' + Math.min(48, cssW * 0.085) + 'px system-ui'; ctx.textAlign = 'center';
  ctx.fillText(STR.crash, cssW / 2, titleY);
  if (G.crashAge > 0.42) {
    ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.font = '600 17px system-ui';
    ctx.fillText(STR.tapRetry, cssW / 2, titleY + 34);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}
function overlayFinished() {
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, cssW, cssH);
  const hasGolden = GOLDEN_TAPES.has(G.levelIdx);
  const w = Math.min(440, cssW - 24), h = Math.min(hasGolden ? 454 : 410, cssH - 24), { x, y } = panel(w, h);
  ctx.textAlign = 'center'; ctx.fillStyle = '#ffd23e'; ctx.font = '800 30px system-ui';
  ctx.fillText(G.replayFailed ? STR.proofFailed : STR.levelComplete, cssW / 2, y + 48);
  for (let i = 0; i < 3; i++) star(cssW / 2 + (i - 1) * 68, y + 104, 30, i < G.finishStars);
  ctx.fillStyle = '#fff'; ctx.font = '700 40px ui-monospace, monospace'; ctx.fillText(fmt(G.finishTime), cssW / 2, y + 168);
  ctx.font = '600 13px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillText(STR.yourTime + (G.flipBonus > 0 ? '   ·   ' + STR.flipsSaved + ' -' + G.flipBonus.toFixed(1) + 's' : ''), cssW / 2, y + 190);
  ctx.fillStyle = '#8fe3ff'; ctx.font = '800 20px ui-monospace, monospace'; ctx.fillText(STR.score + ' ' + G.finishScore, cssW / 2, y + 222);
  let ry = y + 244;
  if (G.finishNewRecord) { ctx.fillStyle = '#8bff6b'; ctx.font = '800 16px system-ui'; ctx.fillText('★ ' + STR.newRecord, cssW / 2, ry); ry += 20; }
  else if (G.finishRecordScore) { ctx.fillStyle = '#8bff6b'; ctx.font = '800 15px system-ui'; ctx.fillText('★ ' + STR.bestScore + ' ' + STR.score, cssW / 2, ry); ry += 20; }
  if (G.replayMode) {
    const golden = G.replaySource === 'golden';
    ctx.fillStyle = G.replayVerified ? (golden ? '#ffd23e' : '#8bff6b') : '#ff6a4a'; ctx.font = '800 14px ui-monospace, monospace';
    ctx.fillText(G.replayVerified ? '✓ ' + (golden ? STR.referenceVerified : STR.proofVerified)
      : '⚠ ' + STR.proofFailed, cssW / 2, ry + 4);
  } else if (G.replayRecorded) {
    ctx.fillStyle = '#8fe3ff'; ctx.font = '800 14px ui-monospace, monospace';
    ctx.fillText('◆ ' + STR.proofRecorded, cssW / 2, ry + 4);
  }
  ctx.textAlign = 'left';
  if (hasGolden) btn(cssW / 2 - 67, y + h - 105, 134, 34, STR.goldRun, 'golden', '#bb8612');
  const gap = 10, bw = (w - 60 - gap * 2) / 3;
  btn(x + 20, y + h - 58, bw, 42, STR.retry, 'retry', '#3c6bff');
  btn(x + 20 + bw + gap, y + h - 58, bw, 42, STR.replay, 'replay', '#6f43d6');
  const last = G.levelIdx + 1 >= levels.length;
  btn(x + 20 + (bw + gap) * 2, y + h - 58, bw, 42, last ? STR.menu : STR.next, last ? 'menu' : 'next', '#ff5a3c');
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
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '600 12px ui-monospace, monospace';
  ctx.fillText(BUILD, cssW / 2, cssH - 14);
  const tabY = cssH * 0.235, tabGap = 10;
  const tabW = Math.min(156, (cssW - 40 - tabGap * (worlds.length - 1)) / worlds.length);
  const tabsW = worlds.length * tabW + (worlds.length - 1) * tabGap, tabsX = (cssW - tabsW) / 2;
  for (let i = 0; i < worlds.length; i++) btn(tabsX + i * (tabW + tabGap), tabY, tabW, 34,
    worlds[i].toUpperCase(), 'world' + i, i === G.menuWorld ? '#3c6bff' : 'rgba(18,20,29,0.72)');
  const visibleLevels = levelIndicesByWorld[G.menuWorld];
  const cols = cssW < 560 ? 2 : 4, cardW = Math.min(150, (cssW - 40 - (cols - 1) * 14) / cols), cardH = cardW * 0.92;
  const usedCols = Math.min(cols, visibleLevels.length), gw = usedCols * cardW + (usedCols - 1) * 14;
  const gx = (cssW - gw) / 2, gy = cssH * 0.31;
  ctx.textAlign = 'left';
  for (let pageIndex = 0; pageIndex < visibleLevels.length; pageIndex++) {
    const i = visibleLevels[pageIndex], L = levels[i];
    const c = pageIndex % cols, r = Math.floor(pageIndex / cols);
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
      if (GOLDEN_TAPES.has(i)) {
        ctx.fillStyle = '#ffd23e'; roundRect(x + 7, y + 8, 48, 18, 6); ctx.fill();
        ctx.fillStyle = '#2c2107'; ctx.font = '900 10px ui-monospace, monospace'; ctx.fillText('GOLD ✓', x + 31, y + 21);
      }
      if (save.replays[i]) { ctx.fillStyle = '#d6c8ff'; ctx.font = '800 12px system-ui'; ctx.fillText('↻', x + cardW - 16, y + 20); }
      registerButton(x, y, cardW, cardH, 'lvl' + i);
    }
    ctx.textAlign = 'left';
  }
  ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '600 13px system-ui';
  const touchHint = SETTINGS.leftHanded ? STR.hintTouchLeft : STR.hintTouch;
  ctx.fillText(cssW < 560 ? STR.hintCompact : (isTouch ? touchHint : STR.hintKeys), cssW / 2, cssH - 26);
  // top-right controls: settings gear + mute (+ install when available)
  btn(cssW - 14 - 46, 14, 46, 40, '⚙', 'gear', 'rgba(18,20,29,0.6)');
  btn(cssW - 14 - 46 - 52, 14, 46, 40, Audio2.muted ? '🔇' : '🔊', 'mute', 'rgba(18,20,29,0.6)');
  if (window.__deferredInstall) btn(14, 14, 108, 40, '⤓ ' + STR.install, 'install', 'rgba(60,107,255,0.9)');
  ctx.textAlign = 'left';
}

function drawSettings() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(0, 0, cssW, cssH);
  const rowH = cssH < 480 ? 41 : 48;
  const w = Math.min(400, cssW - 28), h = Math.min(cssH - 16, 66 + rowH * 6 + 56);
  const x = (cssW - w) / 2, y = (cssH - h) / 2;
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
    ry += rowH;
  };
  const toggle = (t, on, id) => {
    label(t);
    btn(rx - 84, ry, 84, 36, on ? STR.on : STR.off, id, on ? '#3c6bff' : 'rgba(255,255,255,0.14)');
    ry += rowH;
  };
  slider(STR.music, SETTINGS.music, 'set_music_dn', 'set_music_up');
  slider(STR.sfx, SETTINGS.sfx, 'set_sfx_dn', 'set_sfx_up');
  toggle(STR.muteAll, Audio2.muted, 'set_mute');
  toggle(STR.motion, SETTINGS.reducedMotion, 'set_motion');
  toggle(STR.haptics, SETTINGS.haptics, 'set_haptics');
  toggle(STR.leftHanded, SETTINGS.leftHanded, 'set_left_handed');
  btn(x + 26, y + h - 48, w - 52, 38, STR.close, 'set_close', '#ff5a3c');
}

function doUI(id) {
  if (id === 'mute') { Audio2.toggle(); return; }
  if (id === 'pause') { togglePause(); return; }
  if (id === 'resume') { G.state = 'playing'; return; }
  if (id === 'retry') { G.settingsOpen = false; restartLevel(); return; }
  if (id === 'replay') {
    const token = G.replayToken || save.replays[G.levelIdx];
    if (token) startLevel(G.levelIdx, { replayToken: token,
      replaySource: token === G.replayToken ? G.replaySource : 'saved' });
    else G.replayNotice = { message: STR.proofMissing, detail: STR.proofMissing, life: 3.5 };
    return;
  }
  if (id === 'golden') {
    const reference = GOLDEN_TAPES.get(G.levelIdx);
    if (reference) startLevel(G.levelIdx, { replayToken: reference.token, replaySource: 'golden' });
    else G.replayNotice = { message: STR.referenceMissing, detail: STR.referenceMissing, life: 3.5 };
    return;
  }
  if (id === 'menu') { G.settingsOpen = false; G.state = 'menu'; G.running = false;
    G.menuWorld = Math.max(0, worlds.indexOf(G.level?.world || worlds[0]));
    Audio2.stopEngine(); Audio2.setMusicState('menu'); return; }
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
  if (id === 'set_left_handed') {
    SETTINGS.leftHanded = !SETTINGS.leftHanded; updateControlLayout(); persist(); return;
  }
  if (id === 'install') { const d = window.__deferredInstall; if (d) { d.prompt(); window.__deferredInstall = null; } return; }
  if (id.startsWith('world')) { G.menuWorld = Math.max(0, Math.min(worlds.length - 1, parseInt(id.slice(5), 10) || 0)); return; }
  if (id.startsWith('lvl')) { startLevel(parseInt(id.slice(3), 10)); return; }
}

// ---------------------------------------------------------------- loop ------
const STEP = 1 / 60, STEP_MS = STEP * 1000;
const MAX_FIXED_TICKS_PER_FRAME = 5, MAX_BACKLOG_TICKS = 6;
let acc = 0, last = performance.now();
const devParams = new URLSearchParams(location.search), dev = devParams.has('dev');
const captureMode = dev && devParams.has('capture');
const devAutoplay = dev && devParams.has('autoplay');
const perfDebug = dev && (devParams.has('perf') || devParams.has('performance'));
let collisionDebug = dev && (devParams.get('debug') === 'collisions' || devParams.has('collisions'));
if (dev && devParams.has('touch')) isTouch = true;
const devLevel = Math.max(0, Math.min(levels.length - 1, (parseInt(devParams.get('level'), 10) || 1) - 1));
const devPanel = document.getElementById('dev');
if (dev && !captureMode) {
  devPanel.style.display = 'block';
  if (perfDebug) devPanel.classList.add('performance');
}
let devPanelAt = last;
function interruptControls(reason) {
  clearControls(reason);
  if (G.state === 'playing') { G.state = 'paused'; Audio2.stopEngine(); }
}
addEventListener('blur', () => interruptControls('blur'));
addEventListener('focus', () => recordPerformanceEvent(performanceMetrics, PERFORMANCE_EVENT.FOCUS));
addEventListener('visibilitychange', () => { if (document.hidden) interruptControls('hidden'); });
addEventListener('orientationchange', () => interruptControls('rotation'));

function updateDevPanel(now) {
  if (!dev || captureMode || now - devPanelAt < 500) return;
  devPanelAt = now;
  const report = snapshotPerformanceMetrics(performanceMetrics);
  if (!perfDebug) {
    devPanel.textContent = `${Math.round(report.fps)} fps · ${activeEffectCount()} fx · ${G.state} · ${G.score}`;
    return;
  }
  const input = inputState.getTelemetry();
  const reused = particlePool.stats.reused + popupPool.stats.reused + trackPool.stats.reused;
  const evicted = particlePool.stats.evicted + popupPool.stats.evicted + trackPool.stats.evicted;
  devPanel.textContent = [
    `SMOOTH RIDE LAB  ${BUILD}`,
    `${report.fps.toFixed(1)} FPS   FRAME ${report.meanFrameMs.toFixed(2)} ms`,
    `P50 ${report.p50FrameMs.toFixed(2)}   P95 ${report.p95FrameMs.toFixed(2)}   P99 ${report.p99FrameMs.toFixed(2)}`,
    `TICKS ${report.fixedTickCount}   CATCH-UP ${report.catchUpFrameCount}   BACKLOG ${report.maxBacklogTicks}`,
    `EFFECTS ${report.currentActiveEffects}/${EFFECT_CAPACITY}   PEAK ${report.peakActiveEffects}`,
    `CREATED ${createdEffectCount()}   REUSED ${reused}   EVICTED ${evicted}`,
    `INPUT ${input.activeKeys} KEY  ${input.activePointers} TOUCH  ${input.activeCommands} CMD`,
    `VIEW ${report.viewport.width}×${report.viewport.height} @${report.viewport.dpr.toFixed(1)}  ROT ${report.rotationCount}`,
  ].join('\n');
}

function recordFrameTelemetry(frameMs, ticks, backlogTicks, droppedMs, clampedMs) {
  recordPerformanceFrame(performanceMetrics, frameMs, ticks, backlogTicks, droppedMs, clampedMs,
    activeEffectCount(), createdEffectCount(), EFFECT_CAPACITY);
}

function frame(now) {
  requestAnimationFrame(frame);
  const rawDtMs = Math.max(0, now - last); last = now;
  const clampedMs = Math.max(0, rawDtMs - 100);
  const dtMs = Math.min(100, rawDtMs);
  let fixedTicks = 0, backlogTicks = Math.floor(acc / STEP_MS), droppedMs = 0;
  if (gamepadConnected) inputState.pollGamepads(navigator.getGamepads?.() || []);
  // hitstop: freeze the sim, keep rendering (a punchy impact beat)
  if (G.hitstop > 0) {
    G.hitstop -= dtMs / 1000; render();
    recordFrameTelemetry(rawDtMs, fixedTicks, backlogTicks, droppedMs, clampedMs);
    updateDevPanel(now); return;
  }
  // slow-mo eases back to real time
  if (G.slow < 1) { G.slow += (1 - G.slow) * Math.min(1, dtMs / 1000 * 4); if (G.slow > 0.995) G.slow = 1; }
  acc += dtMs * G.slow;
  while (acc >= STEP_MS && fixedTicks < MAX_FIXED_TICKS_PER_FRAME) {
    const active = (G.state === 'playing' || G.state === 'crashed');
    if (active) simulate(STEP);
    updateParticles(STEP);
    if (G.state === 'playing' || G.state === 'crashed') updateCamera(STEP);
    acc -= STEP_MS;
    fixedTicks++;
  }
  backlogTicks = Math.floor(acc / STEP_MS);
  if (backlogTicks > MAX_BACKLOG_TICKS) {
    const droppedTicks = backlogTicks - MAX_BACKLOG_TICKS;
    droppedMs = droppedTicks * STEP_MS;
    acc -= droppedMs;
    backlogTicks = MAX_BACKLOG_TICKS;
  }
  if (G.flash > 0) G.flash = Math.max(0, G.flash - dtMs / 1000 * 3.5);
  if (G.replayNotice) {
    G.replayNotice.life -= dtMs / 1000;
    if (G.replayNotice.life <= 0) G.replayNotice = null;
  }
  render();
  recordFrameTelemetry(rawDtMs, fixedTicks, backlogTicks, droppedMs, clampedMs);
  updateDevPanel(now);
}

let vigGrad = null, vigW = 0, vigH = 0, vigDpr = 0;
function drawVignette() {
  if (G.state === 'menu') return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!vigGrad || vigW !== cssW || vigH !== cssH || vigDpr !== dpr) {
    vigW = cssW; vigH = cssH; vigDpr = dpr;
    vigGrad = ctx.createRadialGradient(cssW / 2, cssH * 0.52, Math.min(cssW, cssH) * 0.34, cssW / 2, cssH * 0.52, Math.max(cssW, cssH) * 0.72);
    vigGrad.addColorStop(0, 'rgba(0,0,0,0)'); vigGrad.addColorStop(1, 'rgba(0,0,0,0.34)');
  }
  ctx.fillStyle = vigGrad; ctx.fillRect(0, 0, cssW, cssH);
}
function render() {
  drawSky();
  if (G.state !== 'menu' && G.level) { const scale = worldTransform(); drawWorld(scale); }
  drawVignette();
  drawHUD();
  if (G.flash > 0) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = 'rgba(255,255,255,' + (G.flash * 0.55) + ')'; ctx.fillRect(0, 0, cssW, cssH); }
}

// ---------------------------------------------------------------- boot ------
Audio2.loadMusic();
Promise.all([loadAssets(), loadGoldenTapes()]).then(() => {
  makePatterns();
  if (patDirt) patScale(patDirt, IMG.dirt);
  if (patRock) patScale(patRock, IMG.rock);
  document.getElementById('boot').style.display = 'none';
  if (devParams.has('level')) startLevel(devLevel);
  else { G.state = 'menu'; Audio2.setMusicState('menu'); }
  requestAnimationFrame(frame);
});

function stepDevTicks(count = 1) {
  if (!dev) return { ok: false, reason: 'development mode required' };
  const ticks = Math.max(0, Math.min(20000, Math.trunc(Number(count) || 0)));
  let stepped = 0;
  for (; stepped < ticks; stepped++) {
    if (G.state !== 'playing' && G.state !== 'crashed') break;
    simulate(STEP); updateParticles(STEP);
  }
  return { ok: true, stepped, state: G.state, replayTick: G.replayTick,
    runTick: G.run?.tick ?? 0, time: G.elapsed, score: G.score,
    token: G.replayToken || null };
}

function runDevToEnd(maxTicks = 60 * 120) {
  return stepDevTicks(maxTicks);
}

function resetGamePerformance() {
  resetPerformanceMetrics(performanceMetrics);
  recordPerformanceViewport(performanceMetrics, cssW, cssH, dpr, viewportRotation());
  return snapshotPerformanceMetrics(performanceMetrics);
}
function effectPoolSnapshot() {
  const copy = pool => ({ ...pool.stats });
  return Object.freeze({
    particles: Object.freeze(copy(particlePool)),
    popups: Object.freeze(copy(popupPool)),
    tracks: Object.freeze(copy(trackPool)),
    capacity: EFFECT_CAPACITY,
    active: activeEffectCount(),
    created: createdEffectCount(),
  });
}

// test hook (used by the screenshot harness / dev console)
window.__moto = { G, startLevel, restartLevel, levels, SETTINGS,
  stepTicks: stepDevTicks, runToEnd: runDevToEnd,
  input: inputState,
  performanceSnapshot: () => snapshotPerformanceMetrics(performanceMetrics),
  resetPerformance: resetGamePerformance,
  effectPoolSnapshot,
  get goldenManifest() { return goldenManifest; } };

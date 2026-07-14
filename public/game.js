// game.js — Moto Rush X3 client. Canvas 2D, fixed-timestep sim, no framework.
import { STR } from './strings.js';
import { buildLevels, COURSE_VERSION } from './levels.js';
import { normAngle, CONFIG, PHYSICS_VERSION } from './physics.js';
import { REPLAY_INPUT, createReplayPlayback, createReplayRecorder, decodeReplay, encodeReplay,
  hashReplayState } from './replay.js';
import { sampleKinematicPlatform } from './kinematics.js';
import { createRagdoll, drainRagdollImpacts, readRagdoll, stepRagdoll } from './ragdoll.js';
import { createCrashContactField, queryCrashContact } from './crash-contact.js';
import { buildCrashCameraPolicy, crashNoise, crashSignedNoise, hashCrashSeed,
  normalizeCrashCause } from './crash-presentation.js';
import { buildDebugProxySnapshot } from './debug-proxies.js';
import { RUN_SESSION_CRASH_DURATION, initializeRunSession, snapshotRunSession,
  stepCrashedRun, stepPlayingRun } from './run-session.js';
import { createEffectPool } from './effect-pool.js';
import { createInputState } from './input-state.js';
import {
  buildFinishReport,
  createScoreLedger,
  focusedResultAction,
  formatRaceTime,
  initialResultFocus,
  moveResultFocus,
  recordScoreEvent,
  resetScoreLedger,
  resolveResultAction,
  timeToMilliseconds,
} from './finish-flow.js';
import { createUiInput, uiCommandForKey } from './ui-input.js';
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
const BUILD_VERSION = globalThis.MOTO_RUSH_BUILD?.version || '1.8.1-dev';
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
const announcer = document.getElementById('announce');
const semanticResults = document.getElementById('semantic-results');
const semanticResultsTitle = document.getElementById('semantic-results-title');
const semanticResultsSummary = document.getElementById('semantic-results-summary');
const semanticResultsActions = document.getElementById('semantic-results-actions');
function announce(message) {
  if (!announcer) return;
  announcer.textContent = '';
  requestAnimationFrame(() => { announcer.textContent = String(message || ''); });
}
function hideSemanticResults() {
  const restoreCanvasFocus = !!semanticResults?.contains(document.activeElement);
  if (semanticResults) semanticResults.hidden = true;
  if (semanticResultsActions) semanticResultsActions.replaceChildren();
  canvas.setAttribute('aria-label', 'Moto Rush X3 motorcycle racing game');
  if (restoreCanvasFocus) canvas.focus({ preventScroll: true });
}
function semanticResultButton(target) {
  return target instanceof HTMLButtonElement && !!semanticResultsActions?.contains(target)
    ? target : null;
}
function focusSemanticResult(index = G.finishFocus) {
  const button = semanticResultsActions?.querySelectorAll('button')?.[index];
  if (!button || button.disabled) return false;
  button.focus({ preventScroll: true });
  return true;
}
function syncSemanticResults(report) {
  if (!semanticResults || !report) return;
  const title = G.replayFailed ? STR.proofFailed : 'Finish Forge run receipt';
  const summary = `${report.level.name}. Net time ${formatRaceTime(report.timing.net)}. `
    + `${report.stars} stars. Score ${report.score.total}.`;
  semanticResultsTitle.textContent = title;
  semanticResultsSummary.textContent = summary;
  semanticResultsActions.replaceChildren();
  for (const action of report.actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    button.disabled = !action.enabled;
    button.dataset.action = action.id;
    button.addEventListener('focus', () => {
      const index = report.actions.indexOf(action);
      setResultFocus(index, false);
      if (!G.captureFrozen && G.state === 'finished') render();
    });
    button.addEventListener('click', () => doUI(action.id));
    semanticResultsActions.append(button);
  }
  semanticResults.hidden = false;
  canvas.setAttribute('aria-label', `${summary} Use arrow keys to choose an action and Enter to activate.`);
  focusSemanticResult();
}
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
function saveRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
save.best = saveRecord(save.best); save.stars = saveRecord(save.stars);
save.bestScore = saveRecord(save.bestScore); save.replays = saveRecord(save.replays);
const storedUnlocked = Number(save.unlocked);
save.unlocked = Number.isSafeInteger(storedUnlocked) && storedUnlocked > 0 ? storedUnlocked : 1;

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
  let noiseBuffer = null;
  let muted = save.muted || false, musicKind = 'menu', lastGear = 1;
  const pendingSfx = new Set();
  const pendingTimers = new Set();
  function trackSfx(source) {
    pendingSfx.add(source);
    source.addEventListener?.('ended', () => pendingSfx.delete(source), { once: true });
    return source;
  }
  function schedule(callback, delay) {
    const timer = setTimeout(() => {
      pendingTimers.delete(timer);
      callback();
    }, delay);
    pendingTimers.add(timer);
    return timer;
  }
  function loadMusic() {
    try {
      menuEl = new Audio('./assets/music_menu.m4a'); menuEl.loop = true; menuEl.preload = 'auto';
      driveEl = new Audio('./assets/music_drive.m4a'); driveEl.loop = true; driveEl.preload = 'auto';
    } catch {}
  }
  function ensure() {
    if (ac) return;
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    const noiseSamples = Math.ceil(ac.sampleRate * 0.6);
    noiseBuffer = ac.createBuffer(1, noiseSamples, ac.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    let noiseSeed = 0x6d2b79f5;
    for (let index = 0; index < noiseSamples; index++) {
      noiseSeed = Math.imul(noiseSeed ^ (noiseSeed >>> 15), 1 | noiseSeed);
      noiseSeed ^= noiseSeed + Math.imul(noiseSeed ^ (noiseSeed >>> 7), 61 | noiseSeed);
      noiseData[index] = (((noiseSeed ^ (noiseSeed >>> 14)) >>> 0) / 0x100000000) * 2 - 1;
    }
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
    const o = trackSfx(ac.createOscillator()), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + dur);
    g.gain.value = sfxVol(vol); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.connect(g); g.connect(master); o.start(); o.stop(ac.currentTime + dur);
  }
  function noise(dur, vol = 0.4, filt = 900) {
    if (!ac || muted || !noiseBuffer) return;
    const duration = Math.max(0.02, Math.min(0.6, dur));
    const src = trackSfx(ac.createBufferSource()); src.buffer = noiseBuffer;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filt;
    const g = ac.createGain(); g.gain.setValueAtTime(sfxVol(vol), ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    src.connect(f); f.connect(g); g.connect(master); src.start(); src.stop(ac.currentTime + duration);
  }
  function resetRun() {
    for (const timer of pendingTimers) clearTimeout(timer);
    pendingTimers.clear();
    for (const source of pendingSfx) { try { source.stop(); } catch {} }
    pendingSfx.clear();
    lastGear = 1;
    if (ac) {
      const time = ac.currentTime;
      for (const parameter of [engine?.frequency, engFilt?.frequency, engGain?.gain]) {
        try { parameter?.cancelScheduledValues(time); } catch {}
      }
    }
    stopEngine();
  }
  return {
    resume, setEngine, stopEngine, setMusicState, loadMusic, applyMusicGains, resetRun,
    land(v) { noise(0.14, Math.min(0.5, 0.15 + v / 900), 500); blip(90, 0.12, 'sine', 0.25, 60); },
    crash() { noise(0.5, 0.6, 1400); blip(180, 0.5, 'sawtooth', 0.4, 40); duck(); },
    impact(speed, surface) {
      const metal = surface === 'metal' || surface === 'grated';
      const amount = Math.max(0, Math.min(1, (Number(speed) || 0) / 900));
      blip(metal ? 290 + amount * 210 : 105 + amount * 90,
        0.055 + amount * 0.07, metal ? 'square' : 'triangle', 0.08 + amount * 0.13,
        metal ? 170 : 65);
    },
    flip() { blip(520, 0.16, 'square', 0.22, 900); },
    stunt() { blip(680, 0.12, 'triangle', 0.2, 1100); },
    checkpoint() { blip(600, 0.1, 'triangle', 0.28); schedule(() => blip(900, 0.14, 'triangle', 0.28), 90); },
    loom() { blip(420, 0.16, 'triangle', 0.2, 880); schedule(() => blip(740, 0.1, 'sine', 0.16, 980), 70); },
    finish() { [523, 659, 784, 1046].forEach((f, i) => schedule(() => blip(f, 0.22, 'triangle', 0.3), i * 110)); },
    toggle() { muted = !muted; save.muted = muted; persist(); if (master && ac) master.gain.setTargetAtTime(muted ? 0 : 0.9, ac.currentTime, 0.05); return muted; },
    get muted() { return muted; },
    inspect() { return Object.freeze({ pendingTimers: pendingTimers.size,
      pendingSfx: pendingSfx.size, lastGear, musicKind }); },
  };
})();

// ---------------------------------------------------------------- input -----
const inputState = createInputState({ leftHanded: SETTINGS.leftHanded });
const uiInput = createUiInput();
const liveInput = { gas: false, brake: false, leanBack: false, leanFwd: false };
const displayInput = { gas: false, brake: false, leanBack: false, leanFwd: false };
let controlLayout = null;
let gamepadConnected = !!Array.from(navigator.getGamepads?.() || []).find(Boolean);
addEventListener('keydown', e => {
  const resultButton = semanticResultButton(e.target);
  if (resultButton) {
    if (e.repeat && (e.code === 'Enter' || e.code === 'Space')) {
      e.preventDefault(); Audio2.resume(); return;
    }
    if (!e.repeat && (e.code === 'Escape' || e.code === 'Backspace')) {
      e.preventDefault(); doUI('menu'); Audio2.resume(); return;
    }
    const buttonCommand = !e.repeat && uiCommandForKey(e.code);
    if (buttonCommand && buttonCommand !== 'confirm' && buttonCommand !== 'back') {
      e.preventDefault();
      if (handleUiCommand(buttonCommand, 'semantic-keyboard')) focusSemanticResult();
      Audio2.resume(); return;
    }
    // Keep native Tab/Shift+Tab traversal and native button Enter/Space
    // activation. The focus listener synchronizes the visible Canvas rail.
    if (e.code === 'Tab' || e.code === 'Enter' || e.code === 'Space') {
      Audio2.resume(); return;
    }
    // Unrelated result shortcuts (R/G/M/C) continue through the shared path.
  }
  const uiCommand = uiCommandForKey(e.code);
  const uiHandled = !e.repeat && uiCommand && handleUiCommand(uiCommand, 'keyboard');
  if (G.state === 'playing' && inputState.keyDown(e.code).handled) e.preventDefault();
  if (uiHandled) e.preventDefault();
  if (e.code === 'KeyR') {
    if (G.state === 'finished' && G.level) startLevel(G.levelIdx);
    else restartLevel();
  }
  if (e.code === 'KeyM') Audio2.toggle();
  if (e.code === 'KeyC' && dev) collisionDebug = !collisionDebug;
  if (e.code === 'KeyG' && G.state === 'finished') doUI('golden');
  if (!uiHandled && (e.code === 'Escape' || e.code === 'KeyP')) { if (G.settingsOpen) G.settingsOpen = false; else togglePause(); }
  if (!e.repeat && !uiHandled && (e.code === 'Space' || e.code === 'Enter')) {
    primaryAction(); e.preventDefault();
  }
  Audio2.resume();
});
addEventListener('keyup', e => { if (inputState.keyUp(e.code).handled) e.preventDefault(); });
addEventListener('gamepadconnected', () => { gamepadConnected = true; });
addEventListener('gamepaddisconnected', () => {
  gamepadConnected = !!Array.from(navigator.getGamepads?.() || []).find(Boolean);
  if (!gamepadConnected) inputState.updateGamepads([]);
  uiInput.poll([]);
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
save.unlocked = Math.max(1, Math.min(levels.length, save.unlocked));
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
  crashWorld: null, crashReason: null, crashProfile: null, crashImpacts: [],
  crashImpactVisuals: 0, crashLastAudioAge: -10, crashCamera: null,
  crashSeed: 0,
  replayMode: false, replayPlayback: null, replayRecorder: null, replayToken: null,
  replaySource: null,
  replayTick: 0, replayVerified: false, replayRecorded: false, replayFailed: null,
  restartQueued: false, replayUnavailable: null,
  replayNotice: null,
  scoreLedger: createScoreLedger(), finishReport: null, finishFocus: -1,
  devWaitTicks: 0, devCrashCount: 0,
  debugProxy: null,
  captureFrozen: false,
};
let resetLoopClock = () => {};

function replayMetadata(i) {
  return { levelId: `level-${i + 1}`, buildVersion: BUILD_VERSION,
    physicsVersion: PHYSICS_VERSION, generatorVersion: COURSE_VERSION };
}

function validLevelIndex(value) {
  return Number.isSafeInteger(value) && value >= 0 && value < levels.length
    && levels[value] && typeof levels[value] === 'object' && levels[value].course;
}

function routeNotice(reason) {
  const detail = {
    'level-locked': 'Clear the previous route first.',
    'level-missing': 'That route is unavailable in this build.',
    'next-locked': 'The next route is still locked.',
    'next-missing': 'The next route is unavailable in this build.',
    'current-missing': 'The current route is unavailable.',
    'campaign-complete': 'Relay complete. Returning to the board.',
  }[reason] || 'That route is unavailable.';
  G.replayNotice = { message: 'ROUTE BLOCKED', detail, life: 3.5 };
  announce(`Route blocked. ${detail}`);
}

function resetLevelPresentation() {
  Audio2.resetRun();
  particlePool.clear(); popupPool.clear(); trackPool.clear();
  G.shake = 0; G.cpFlash = 0; G.flash = 0; G.slow = 1; G.hitstop = 0;
  G.ragdoll = null; G.ragdollPose = null;
  G.crashWorld = null; G.crashReason = null; G.crashProfile = null;
  G.crashImpacts.length = 0; G.crashImpactVisuals = 0; G.crashLastAudioAge = -10;
  G.crashCamera = null; G.crashSeed = 0; G.captureFrozen = false;
  G.trackT = 0; G.riderLean = 0; G.leanCmd = 0; G.engineGear = 1; G.debugProxy = null;
  G.finishTimer = 0; G.finishNewRecord = false; G.finishRecordScore = false;
  G.finishReport = null; G.finishFocus = -1;
  G.settingsOpen = false;
  G.restartQueued = false; G.replayNotice = null;
  G.devWaitTicks = 0; G.devCrashCount = 0;
  resetScoreLedger(G.scoreLedger);
  uiInput.prime(navigator.getGamepads?.() || []);
  hideSemanticResults();
  resetLoopClock();
}

function startLevel(i, { replayToken = null, replaySource = null, requireUnlocked = false } = {}) {
  const index = Number(i);
  if (!validLevelIndex(index)) { routeNotice('level-missing'); return false; }
  if (requireUnlocked && index >= Math.max(1, Math.min(levels.length, Math.trunc(Number(save.unlocked) || 1)))) {
    routeNotice('level-locked'); return false;
  }
  const L = levels[index];
  let playback = null;
  if (replayToken) {
    const decoded = decodeReplay(replayToken, { expected: replayMetadata(index) });
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
  resetLevelPresentation();
  G.levelIdx = index; G.level = L;
  initializeRunSession(G, L, index);
  G.replayMode = !!playback; G.replayPlayback = playback; G.replayToken = replayToken;
  G.replaySource = playback ? (replaySource || 'saved') : null;
  G.replayRecorder = playback ? null : createReplayRecorder(replayMetadata(i));
  G.replayTick = 0; G.replayVerified = false; G.replayRecorded = false; G.replayFailed = null;
  G.restartQueued = false; G.replayUnavailable = null;
  G.cam.x = G.bike.x; G.cam.y = G.bike.y - 40; G.cam.viewH = 460; G.cam.roll = 0; G.cam.kickX = 0; G.cam.kickY = 0;
  clearControls('level-start');
  Audio2.setMusicState('drive');
  return true;
}
function restartLevel() {
  if (G.level) startLevel(G.levelIdx, G.replayMode
    ? { replayToken: G.replayToken, replaySource: G.replaySource } : undefined);
}
function finishRespawnPresentation() {
  Audio2.resetRun();
  G.ragdoll = null; G.ragdollPose = null;
  G.crashWorld = null; G.crashReason = null; G.crashProfile = null;
  G.crashImpacts.length = 0; G.crashImpactVisuals = 0; G.crashCamera = null; G.crashSeed = 0;
  particlePool.clear(); popupPool.clear(); trackPool.clear();
  G.shake = 0; G.hitstop = 0; G.flash = 0; G.slow = 1; G.cpFlash = 0; G.trackT = 0;
  G.cam.kickX = 0; G.cam.kickY = 0; G.restartQueued = false;
  G.cam.x = G.bike.x; G.cam.y = G.bike.y - 40; G.cam.viewH = 460; G.cam.roll = 0;
  if (devAutoplay) {
    G.devCrashCount++;
    G.devWaitTicks = 12 + (G.devCrashCount % 7) * 11;
  }
  G.riderLean = 0; G.leanCmd = 0; G.engineGear = 1; G.debugProxy = null;
  clearControls('respawn');
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
  else if (G.state === 'finished') activateFocusedResult();
  else if (G.state === 'paused') G.state = 'playing';
}

function setResultFocus(index, announceFocus = true) {
  const actions = G.finishReport?.actions || [];
  if (!Number.isInteger(index) || index < 0 || index >= actions.length
      || actions[index]?.enabled !== true) return false;
  G.finishFocus = index;
  if (G.captureFrozen) render();
  if (announceFocus) announce(`${actions[index].label} selected`);
  return true;
}

function moveFinishFocus(direction) {
  const actions = G.finishReport?.actions || [];
  return setResultFocus(moveResultFocus(actions, G.finishFocus, direction));
}

function activateFocusedResult() {
  const action = focusedResultAction(G.finishReport?.actions || [], G.finishFocus);
  if (!action) return false;
  doUI(action.id);
  return true;
}

function handleUiCommand(command, source = 'unknown') {
  if (G.settingsOpen && command === 'back') { G.settingsOpen = false; return true; }
  if (G.state === 'crashed') {
    if (command === 'confirm') { G.restartQueued = true; announce('Checkpoint retry'); return true; }
    if (command === 'back') { doUI('menu'); return true; }
    return false;
  }
  if (G.state !== 'finished') return false;
  if (command === 'left' || command === 'up') return moveFinishFocus(-1);
  if (command === 'right' || command === 'down') return moveFinishFocus(1);
  if (command === 'confirm') return activateFocusedResult();
  if (command === 'back') { doUI('menu'); return true; }
  return false;
}

function handleUiEdges(edges) {
  if (!edges) return;
  if (edges.left || edges.up) { handleUiCommand(edges.left ? 'left' : 'up', 'gamepad'); return; }
  if (edges.right || edges.down) { handleUiCommand(edges.right ? 'right' : 'down', 'gamepad'); return; }
  if (edges.confirm) handleUiCommand('confirm', 'gamepad');
  if (edges.back) handleUiCommand('back', 'gamepad');
}

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
  finalizeFinishReport(false);
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
    for (const score of events.scores) {
      recordScoreEvent(G.scoreLedger, score);
      presentSessionScore(score);
    }
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
    if (G.ragdoll) {
      stepRagdoll(G.ragdoll, dt);
      drainRagdollImpacts(G.ragdoll, G.crashImpacts);
      G.ragdollPose = readRagdoll(G.ragdoll, G.ragdollPose || {});
      presentRagdollImpacts(G.crashImpacts);
    }
  }
}

function deterministicCrashBurst(x, y, count, lane = 'entry') {
  const total = Math.max(0, Math.min(28, Math.trunc(count)));
  for (let index = 0; index < total; index++) {
    const seed = hashCrashSeed(G.crashSeed, lane, index);
    const angle = Math.PI * (1.04 + crashNoise(seed, 0) * 0.92);
    const speed = 90 + crashNoise(seed, 1) * 210;
    const fire = index % 3 !== 0;
    const life = 0.2 + crashNoise(seed, 2) * 0.34;
    spawnParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed,
      life, life, 2 + crashNoise(seed, 3) * 4, fire ? 'fire' : 'dust');
  }
}

function presentRagdollImpacts(impacts) {
  if (reduced() || !impacts?.length) return;
  const count = Math.min(4, impacts.length);
  for (let index = 0; index < count && G.crashImpactVisuals < 28; index++) {
    const impact = impacts[index];
    const strength = Math.max(0, Math.min(1, impact.strength || 0));
    const seed = hashCrashSeed(G.crashSeed, impact.tick, impact.node, index);
    const particleCount = strength > 0.45 ? 3 : 2;
    for (let spark = 0; spark < particleCount && G.crashImpactVisuals < 28; spark++) {
      const tangentX = -impact.ny, tangentY = impact.nx;
      const tangent = crashSignedNoise(seed, spark) * (75 + strength * 135);
      const normal = 45 + crashNoise(seed, spark + 7) * (75 + strength * 150);
      const life = 0.16 + crashNoise(seed, spark + 13) * 0.22;
      spawnParticle(impact.x, impact.y,
        tangentX * tangent + impact.nx * normal,
        tangentY * tangent + impact.ny * normal,
        life, life, 1.8 + strength * 3.2, impact.surface === 'dirt' ? 'dust' : 'fire');
      G.crashImpactVisuals++;
    }
    if (impact.speed > 260 && G.crashAge - G.crashLastAudioAge >= 0.16) {
      G.crashLastAudioAge = G.crashAge;
      Audio2.impact(impact.speed, impact.surface);
      shakeAdd(2 + strength * 5); camKick(impact.nx * 3, impact.ny * 3);
      if (impact.speed > 520) vib(18);
    }
  }
}

function doCrash(reason = null) {
  if (G.state !== 'playing' && G.state !== 'crashed') return;
  if (G.ragdoll) return;
  if (G.state === 'playing') {
    G.state = 'crashed'; G.crashTimer = RUN_SESSION_CRASH_DURATION;
    G.crashAge = 0; G.combo = 1; G.comboTimer = 0;
  }
  const profile = normalizeCrashCause(reason);
  const sourceX = profile.x ?? G.bike.head.x, sourceY = profile.y ?? G.bike.head.y;
  const dx = G.bike.x - sourceX, dy = G.bike.y - sourceY, d = Math.max(1, Math.hypot(dx, dy));
  G.crashProfile = profile;
  G.crashReason = Object.freeze({ type: profile.type, label: profile.label,
    x: sourceX, y: sourceY, id: String(reason?.id || reason?.platformId || '').slice(0, 64) });
  G.crashSeed = hashCrashSeed(BUILD_VERSION, G.levelIdx, G.run?.tick || 0,
    profile.type, sourceX, sourceY);
  G.crashWorld = createCrashContactField(G.terrain, G.kinematics);
  const contactField = G.crashWorld;
  const contact = (x, y, radius, node) => queryCrashContact(contactField, x, y, radius, node);
  G.ragdoll = createRagdoll(G.bike, { sampleDt: G.bike._dt, contact,
    reducedMotion: reduced(), impulse: { spin: profile.riderImpulse.spin },
    riderImpulse: { x: dx / d * profile.riderImpulse.radial,
      y: dy / d * profile.riderImpulse.radial - profile.riderImpulse.lift },
    bikeImpulse: { x: dx / d * profile.bikeImpulse.radial,
      y: dy / d * profile.bikeImpulse.radial - profile.bikeImpulse.lift },
    releaseTethers: profile.releaseTethers });
  G.ragdollPose = readRagdoll(G.ragdoll, {});
  G.crashImpacts.length = 0; G.crashImpactVisuals = 0; G.crashLastAudioAge = -10;
  G.crashCamera = Object.freeze({ x: G.cam.x, y: G.cam.y, viewH: G.cam.viewH });
  popupPool.clear(); G.cpFlash = 0; clearControls('crash');
  const policy = buildCrashCameraPolicy({ pose: G.ragdollPose, cause: profile,
    age: 0, seed: G.crashSeed, viewport: { width: cssW, height: cssH },
    reducedMotion: reduced(), baseViewHeight: G.crashCamera.viewH,
    fallbackX: G.bike.x, fallbackY: G.bike.y });
  G.hitstop = policy.hitstop; G.flash = policy.flash; G.slow = policy.slow;
  G.shake = policy.shake; G.cam.kickX = policy.kickX; G.cam.kickY = policy.kickY;
  G.cam.roll = policy.roll;
  if (reduced()) {
    G.cam.x = policy.x; G.cam.y = policy.y; G.cam.viewH = policy.viewH;
  }
  Audio2.stopEngine(); Audio2.crash(); vib(reduced() ? 50 : 120);
  if (!reduced()) {
    deterministicCrashBurst(G.bike.head.x, G.bike.head.y, profile.type === 'tnt' ? 24 : 15);
  }
}
function savedNonNegative(record, index) {
  const value = Number(record?.[index]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function boundedUnlocked() {
  const value = Number(save.unlocked);
  return Number.isSafeInteger(value) ? Math.max(1, Math.min(levels.length, value)) : 1;
}

function finalizeFinishReport(recordEligible, previous = {}) {
  const previousBestTime = previous.time !== undefined
    ? previous.time : savedNonNegative(save.best, G.levelIdx);
  const previousBestScore = previous.score !== undefined
    ? previous.score : savedNonNegative(save.bestScore, G.levelIdx);
  const token = G.replayToken || save.replays[G.levelIdx] || null;
  G.finishReport = buildFinishReport({
    level: G.level,
    levelIndex: G.levelIdx,
    levels,
    unlocked: boundedUnlocked(),
    elapsed: G.elapsed,
    flipBonus: G.flipBonus,
    finishTime: G.finishTime,
    score: G.finishScore,
    stars: G.finishStars,
    previousBestTime,
    previousBestScore,
    scoreLedger: G.scoreLedger,
    replayAvailable: typeof token === 'string' && token.length > 0,
    goldenAvailable: GOLDEN_TAPES.has(G.levelIdx),
    recordEligible,
  });
  G.finishNewRecord = G.finishReport.timing.newRecord;
  G.finishRecordScore = G.finishReport.score.newRecord;
  const preferredAction = G.replayMode || !recordEligible || previousBestTime !== null
    ? 'retry' : 'next';
  G.finishFocus = initialResultFocus(G.finishReport.actions, preferredAction);
  syncSemanticResults(G.finishReport);
  announce(`${G.replayFailed ? STR.proofFailed : STR.levelComplete}. ${formatRaceTime(G.finishTime)}. ${G.finishStars} stars. ${G.finishReport.actions[G.finishFocus]?.label || STR.menu} selected.`);
  return G.finishReport;
}

function finishLevel() {
  G.state = 'finished'; G.running = false; G.finishTimer = 0; G.slow = 1; G.hitstop = 0;
  // run-session.js has already committed the authoritative finish fields.
  const time = G.finishTime;
  const proofState = replayStateSnapshot();
  const prev = savedNonNegative(save.best, G.levelIdx);
  const previousScore = savedNonNegative(save.bestScore, G.levelIdx);
  G.replayRecorded = false; G.replayFailed = null;
  if (G.replayMode) {
    G.finishNewRecord = false; G.finishRecordScore = false;
    G.replayVerified = G.replayTick === G.replayPlayback.finishTick
      && hashReplayState(proofState) === G.replayPlayback.replay.stateHash;
    if (!G.replayVerified) G.replayFailed = 'final state mismatch';
  } else {
    G.finishNewRecord = prev == null || timeToMilliseconds(time) < timeToMilliseconds(prev);
    G.finishRecordScore = previousScore == null || G.score > previousScore;
    if (!dev) {
      if (G.finishNewRecord) save.best[G.levelIdx] = time;
      if (G.finishRecordScore) save.bestScore[G.levelIdx] = G.score;
      save.stars[G.levelIdx] = Math.max(save.stars[G.levelIdx] || 0, G.finishStars);
      if (G.levelIdx + 1 < levels.length) save.unlocked = Math.max(boundedUnlocked(), G.levelIdx + 2);
    }
    try {
      const recorder = G.replayRecorder; G.replayRecorder = null;
      if (!recorder) throw new Error(G.replayUnavailable || 'recorder unavailable');
      const replay = recorder.finalize({ finishTick: G.replayTick, finalState: proofState });
      G.replayToken = encodeReplay(replay); save.replays[G.levelIdx] = G.replayToken;
      G.replayRecorded = true;
    } catch (error) { console.warn('replay proof unavailable', error); }
    if (!dev) persist();
  }
  finalizeFinishReport(!G.replayMode && !dev, { time: prev, score: previousScore });
  Audio2.stopEngine(); Audio2.finish(); Audio2.setMusicState('menu'); vib(60);
  if (!reduced()) confetti();
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
  if (G.state === 'crashed' && G.ragdollPose) {
    const policy = buildCrashCameraPolicy({ pose: G.ragdollPose, cause: G.crashProfile,
      age: G.crashAge, seed: G.crashSeed, viewport: { width: cssW, height: cssH },
      reducedMotion: reduced(), baseViewHeight: G.crashCamera?.viewH || 460,
      fallbackX: b.x, fallbackY: b.y });
    if (reduced()) {
      G.cam.x = policy.x; G.cam.y = policy.y; G.cam.viewH = policy.viewH;
      G.cam.roll = 0; G.cam.kickX = 0; G.cam.kickY = 0;
      G.shake = 0; G.hitstop = 0; G.flash = 0; G.slow = 1;
    } else {
      const k = 1 - Math.pow(0.001, dt);
      G.cam.x += (policy.x - G.cam.x) * k;
      G.cam.y += (policy.y - G.cam.y) * k;
      G.cam.viewH += (policy.viewH - G.cam.viewH) * (1 - Math.pow(0.02, dt));
      G.cam.roll = policy.roll;
    }
    return;
  }
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
  const crashShake = G.state === 'crashed' && G.shake > 0;
  const shakePhase = (G.ragdollPose?.ticks || 0) * 2 + Math.floor(G.crashAge * 120);
  const sx = (G.shake > 0) ? (crashShake
    ? crashSignedNoise(G.crashSeed, `shake-x-${shakePhase}`) * G.shake * 0.5
    : (Math.random() - .5) * G.shake) : 0;
  const sy = (G.shake > 0) ? (crashShake
    ? crashSignedNoise(G.crashSeed, `shake-y-${shakePhase}`) * G.shake * 0.5
    : (Math.random() - .5) * G.shake) : 0;
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
    ragdollPose: G.ragdollPose,
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
  if (p.ragdoll.circles.length) {
    ctx.setLineDash(DASH_SWEEP);
    for (const sweep of p.ragdoll.sweeps) {
      ctx.strokeStyle = sweep.group === 'rider' ? '#ff77ab' : '#68edff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sweep.x0, sweep.y0); ctx.lineTo(sweep.x1, sweep.y1); ctx.stroke();
    }
    ctx.setLineDash(DASH_NONE);
    for (const link of p.ragdoll.links) {
      if (!link.resolved) continue;
      ctx.strokeStyle = link.kind === 'tether' ? '#ffd65c' : 'rgba(218,235,245,0.74)';
      ctx.lineWidth = link.kind === 'tether' ? 1.5 : 1; ctx.beginPath();
      ctx.moveTo(link.aPoint.x, link.aPoint.y); ctx.lineTo(link.bPoint.x, link.bPoint.y); ctx.stroke();
    }
    for (const item of p.ragdoll.circles) {
      circle(item.current, item.group === 'rider' ? '#ff77ab' : '#68edff', item.contacts ? 3 : 2);
    }
    if (!p.ragdoll.bounds.empty) {
      const bounds = p.ragdoll.bounds;
      ctx.strokeStyle = 'rgba(255,214,92,0.85)'; ctx.lineWidth = 2; ctx.setLineDash(DASH_PROXY);
      ctx.strokeRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
      ctx.setLineDash(DASH_NONE);
    }
  }
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
function drawCrashCapsule(stamp, aId, bId, width, fill, outline = '#111720') {
  if (ragdollNodeStamp[aId] !== stamp || ragdollNodeStamp[bId] !== stamp) return;
  const a = ragdollNodeLookup[aId], b = ragdollNodeLookup[bId];
  ctx.strokeStyle = outline; ctx.lineWidth = width + 5; ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.strokeStyle = fill; ctx.lineWidth = width; ctx.stroke();
}
function drawCrashJoint(stamp, id, radius, fill, outline = '#111720', lineWidth = 3) {
  if (ragdollNodeStamp[id] !== stamp) return;
  const node = ragdollNodeLookup[id];
  ctx.fillStyle = fill; ctx.strokeStyle = outline; ctx.lineWidth = lineWidth;
  ctx.beginPath(); ctx.arc(node.x, node.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}
function drawCrashPolygon(points, fill, outline = '#111720', lineWidth = 3) {
  if (!points.length) return;
  ctx.fillStyle = fill; ctx.strokeStyle = outline; ctx.lineWidth = lineWidth;
  ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index++) ctx.lineTo(points[index].x, points[index].y);
  ctx.closePath(); ctx.fill(); ctx.stroke();
}
function perpendicularPoints(a, b, halfA, halfB = halfA) {
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.max(1, Math.hypot(dx, dy));
  const px = -dy / length, py = dx / length;
  return [
    { x: a.x + px * halfA, y: a.y + py * halfA },
    { x: b.x + px * halfB, y: b.y + py * halfB },
    { x: b.x - px * halfB, y: b.y - py * halfB },
    { x: a.x - px * halfA, y: a.y - py * halfA },
  ];
}
function drawCrashShadow(pose) {
  let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of pose.nodes) {
    minX = Math.min(minX, node.x - node.radius); maxX = Math.max(maxX, node.x + node.radius);
    maxY = Math.max(maxY, node.y + node.radius);
  }
  const centerX = (minX + maxX) * 0.5, groundY = groundYAt(centerX);
  if (!Number.isFinite(groundY)) return;
  const air = Math.max(0, groundY - maxY), spread = Math.min(125, Math.max(42, (maxX - minX) * 0.42 + air * 0.12));
  ctx.save(); ctx.globalAlpha = Math.max(0.07, 0.28 - air / 1200); ctx.fillStyle = '#120d09';
  ctx.beginPath(); ctx.ellipse(centerX, groundY - 2, spread, 9 + Math.min(8, air * 0.02), 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function drawCrashRagdoll() {
  const pose = G.ragdollPose; if (!pose?.nodes?.length) return drawBike();
  const stamp = ++ragdollPoseStamp, links = pose.links || [];
  for (let i = 0; i < pose.nodes.length; i++) {
    const node = pose.nodes[i]; ragdollNodeLookup[node.id] = node; ragdollNodeStamp[node.id] = stamp;
  }
  const n = ragdollNodeLookup;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  drawCrashShadow(pose);

  // Splitline rider: far-side obsidian/cobalt limbs establish readable depth.
  drawCrashCapsule(stamp, 'torso', 'rearElbow', 9, '#244d82');
  drawCrashCapsule(stamp, 'rearElbow', 'rearHand', 7, '#172b4a');
  drawCrashCapsule(stamp, 'hip', 'rearKnee', 12, '#18335c');
  drawCrashCapsule(stamp, 'rearKnee', 'rearFoot', 9, '#10213d');
  drawCrashJoint(stamp, 'rearElbow', 5.5, '#152a48');
  drawCrashJoint(stamp, 'rearKnee', 6.5, '#ffb72e');

  // Detached original trellis bike: swingarm, twin-rail fork, tank and engine.
  drawCrashCapsule(stamp, 'rearWheel', 'bikeFrame', 8, '#4a5662');
  drawCrashCapsule(stamp, 'bikeFrame', 'frontWheel', 7, '#ff5a3c');
  drawCrashCapsule(stamp, 'frontWheel', 'handlebar', 5, '#aeb9c4');
  drawCrashCapsule(stamp, 'frontWheel', 'handlebar', 2, '#e7edf2', '#aeb9c4');
  drawCrashCapsule(stamp, 'rearWheel', 'seat', 6, '#343e49');
  drawCrashCapsule(stamp, 'bikeFrame', 'seat', 8, '#ff5a3c');
  drawCrashCapsule(stamp, 'bikeFrame', 'handlebar', 5, '#df4633');
  drawCrashPolygon(perpendicularPoints(n.bikeFrame, n.seat, 10, 8), '#d94333');
  drawCrashPolygon(perpendicularPoints(n.seat, n.handlebar, 9, 6), '#ff6a49');
  drawCrashJoint(stamp, 'bikeFrame', 10, '#2a3139');
  drawCrashJoint(stamp, 'bikeFrame', 5, '#c8d0d8', '#161b22', 2);
  drawCrashCapsule(stamp, 'seat', 'handlebar', 4, '#272f38');
  drawWheel(n.rearWheel.x, n.rearWheel.y, n.rearWheel.radius, G.bike.wheelSpin - pose.elapsed * 8);
  drawWheel(n.frontWheel.x, n.frontWheel.y, n.frontWheel.radius, G.bike.wheelSpin + pose.elapsed * 9);

  // Near-side armor and articulated joints complete the 17-part rider model.
  drawCrashCapsule(stamp, 'hip', 'torso', 15, '#0f2038');
  drawCrashPolygon(perpendicularPoints(n.hip, n.torso, 9, 12), '#ff5a3c');
  drawCrashCapsule(stamp, 'torso', 'head', 8, '#192a43');
  drawCrashCapsule(stamp, 'torso', 'frontElbow', 10, '#ff6548');
  drawCrashCapsule(stamp, 'frontElbow', 'frontHand', 8, '#e94838');
  drawCrashCapsule(stamp, 'hip', 'frontKnee', 13, '#28528b');
  drawCrashCapsule(stamp, 'frontKnee', 'frontFoot', 10, '#1d3e70');
  drawCrashJoint(stamp, 'hip', 7.5, '#12233c');
  drawCrashJoint(stamp, 'torso', 7.5, '#ff795b');
  drawCrashJoint(stamp, 'frontElbow', 5.5, '#ffb72e');
  drawCrashJoint(stamp, 'frontKnee', 6.5, '#ffb72e');
  // Cyan reflective seams are the rig's night-readable signature.
  drawRagdollLink(links, stamp, 'hip', 'torso', '#63e6ff', 2);
  drawRagdollLink(links, stamp, 'torso', 'frontElbow', '#63e6ff', 2);
  drawRagdollLink(links, stamp, 'hip', 'frontKnee', '#63e6ff', 2);

  drawCrashJoint(stamp, 'rearHand', 5.5, '#202a35');
  drawCrashJoint(stamp, 'frontHand', 5.5, '#202a35');
  drawCrashCapsule(stamp, 'rearKnee', 'rearFoot', 7, '#10151b');
  drawCrashCapsule(stamp, 'frontKnee', 'frontFoot', 8, '#10151b');
  drawCrashJoint(stamp, 'rearFoot', 6, '#0b1016');
  drawCrashJoint(stamp, 'frontFoot', 6, '#0b1016');

  // Amber halo helmet, separate face shell and smoke-blue visor.
  drawCrashJoint(stamp, 'head', n.head.radius, '#efaa82');
  drawCrashJoint(stamp, 'helmet', n.helmet.radius, '#ffd23e', '#111720', 3.5);
  const hx = n.head.x - n.helmet.x, hy = n.head.y - n.helmet.y, hl = Math.max(1, Math.hypot(hx, hy));
  const fx = hx / hl, fy = hy / hl, px = -fy, py = fx;
  drawCrashPolygon([
    { x: n.helmet.x + fx * 2 + px * 8, y: n.helmet.y + fy * 2 + py * 8 },
    { x: n.helmet.x + fx * 12 + px * 4, y: n.helmet.y + fy * 12 + py * 4 },
    { x: n.helmet.x + fx * 11 - px * 5, y: n.helmet.y + fy * 11 - py * 5 },
    { x: n.helmet.x + fx * 1 - px * 7, y: n.helmet.y + fy * 1 - py * 7 },
  ], '#243f58', '#101820', 2);
  ctx.strokeStyle = '#fff1a8'; ctx.lineWidth = 2; ctx.beginPath();
  ctx.moveTo(n.helmet.x - px * 9, n.helmet.y - py * 9);
  ctx.lineTo(n.helmet.x - px * 2 - fx * 7, n.helmet.y - py * 2 - fy * 7); ctx.stroke();

  // Only still-active grips remain visible; released tethers never fake contact.
  drawRagdollLink(links, stamp, 'rearHand', 'handlebar', '#9ca8b3', 2.5, true);
  drawRagdollLink(links, stamp, 'frontHand', 'handlebar', '#d9e0e6', 2.5, true);
  ctx.restore();
}

function drawCrashImpactGlyph() {
  if (reduced() || G.state !== 'crashed' || !G.crashReason || G.crashAge > 0.36) return;
  const age = Math.max(0, G.crashAge);
  const alpha = Math.max(0, 1 - age / 0.36);
  const radius = 22 + age * 95;
  ctx.save(); ctx.translate(G.crashReason.x, G.crashReason.y);
  ctx.globalAlpha = alpha; ctx.strokeStyle = G.crashProfile?.accent || '#ff7657';
  ctx.fillStyle = ctx.strokeStyle; ctx.lineCap = 'round';
  for (let ray = 0; ray < 6; ray++) {
    const angle = ray / 6 * Math.PI * 2 + crashSignedNoise(G.crashSeed, `ray-${ray}`) * 0.16;
    const inner = radius * (0.42 + crashNoise(G.crashSeed, `inner-${ray}`) * 0.12);
    const outer = radius * (0.86 + crashNoise(G.crashSeed, `outer-${ray}`) * 0.24);
    ctx.lineWidth = ray % 2 ? 2.5 : 4; ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer); ctx.stroke();
  }
  ctx.font = '900 22px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(G.crashProfile?.impactGlyph || '#', 0, 1);
  ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

function drawCrashScene() {
  const pose = G.ragdollPose;
  if (!pose) return drawBike();
  const blend = reduced() ? 1 : Math.max(0.22, Math.min(1, pose.elapsed / 0.08));
  if (blend < 1) {
    ctx.save(); ctx.globalAlpha = 1 - blend; drawBike(); ctx.restore();
  }
  ctx.save(); ctx.globalAlpha = blend; drawCrashRagdoll(); ctx.restore();
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
  drawCrashImpactGlyph();
  if (G.state === 'crashed' && G.ragdollPose) drawCrashScene(); else drawBike();
  if (collisionDebug) drawCollisionDebug();
  popupPool.forEachActive(drawPopupEffect);
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
}

// ---------------------------------------------------------------- HUD -------
function fmt(t) { return formatRaceTime(t); }
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function registerButton(x, y, w, h, id) {
  let button = uiButtons[uiButtonCount];
  if (!button) { button = { x: 0, y: 0, w: 0, h: 0, id: '' }; uiButtons.push(button); }
  button.x = x; button.y = y; button.w = w; button.h = h; button.id = id; uiButtonCount++;
}
function btn(x, y, w, h, label, id, color = '#ff5a3c', options = {}) {
  const disabled = options.disabled === true;
  const selected = options.selected === true && !disabled;
  ctx.save();
  ctx.globalAlpha = disabled ? 0.34 : 1;
  if (selected) {
    ctx.shadowColor = 'rgba(85,216,255,0.7)'; ctx.shadowBlur = 18;
    roundRect(x - 3, y - 3, w + 6, h + 6, 14);
    ctx.fillStyle = 'rgba(85,216,255,0.18)'; ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = 3; ctx.strokeStyle = '#dff8ff'; ctx.stroke();
  }
  roundRect(x, y, w, h, 12); ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = disabled ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.16)'; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = '800 ' + Math.max(11, Math.round(h * 0.34)) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  if (selected) {
    ctx.fillStyle = '#55d8ff'; ctx.font = '900 10px ui-monospace, monospace';
    ctx.fillText('SELECTED', x + w / 2, y + h - 7);
  }
  ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  if (!disabled) registerButton(x, y, w, h, id);
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
  if (G.state === 'finished') overlayFinishForge();
  if (G.state === 'menu') drawMenu();
  if (G.settingsOpen) { uiButtonCount = 0; drawSettings(); }
  if (G.replayNotice) drawReplayNotice();
  if (collisionDebug && G.debugProxy && G.level) drawCollisionLegend();
}

function drawCollisionLegend() {
  const p = G.debugProxy, x = 14, y = 116, w = Math.min(310, cssW - 28);
  const hasRagdoll = p.ragdoll.circles.length > 0, h = hasRagdoll ? 154 : 130;
  ctx.save();
  roundRect(x, y, w, h, 12); ctx.fillStyle = 'rgba(7,13,20,0.90)'; ctx.fill();
  ctx.strokeStyle = 'rgba(85,216,255,0.65)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#55d8ff'; ctx.font = '900 13px ui-monospace, monospace';
  ctx.fillText('COLLISION PROXIES  [C]', x + 12, y + 21);
  ctx.fillStyle = '#d9e7ef'; ctx.font = '700 11px ui-monospace, monospace';
  ctx.fillText(`TICK ${String(p.tick).padStart(5, '0')}  TERRAIN ${p.terrain.length}`, x + 12, y + 42);
  ctx.fillText(`BIKE 3  HAZARDS ${p.hazards.length}  DECKS ${p.platforms.length}`, x + 12, y + 59);
  ctx.fillText(`LOOMS ${p.forceZones.length}  CHECKPOINTS ${p.checkpoints.length}`, x + 12, y + 76);
  if (hasRagdoll) {
    const impacts = p.ragdoll.contactMetrics;
    ctx.fillStyle = '#ff77ab';
    ctx.fillText(`RAG ${p.ragdoll.circles.length}  LINKS ${p.ragdoll.resolvedLinks}  HIT ${Math.round(impacts.peakImpact)}`, x + 12, y + 93);
  }
  const legendY = hasRagdoll ? y + 117 : y + 97;
  ctx.fillStyle = '#53ff91'; ctx.fillText('-- TERRAIN', x + 12, legendY);
  ctx.fillStyle = '#5be7ff'; ctx.fillText('O BIKE', x + 97, legendY);
  ctx.fillStyle = '#ff5b3d'; ctx.fillText('O HAZARD', x + 163, legendY);
  ctx.fillStyle = '#b46cff'; ctx.fillText('[] PLATFORM', x + 12, legendY + 19);
  ctx.fillStyle = '#55d8ff'; ctx.fillText('[] LOOM', x + 119, legendY + 19);
  ctx.fillStyle = '#ffe052'; ctx.fillText('| GOALS', x + 197, legendY + 19);
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
  const profile = G.crashProfile || normalizeCrashCause(null);
  const pose = G.ragdollPose || {};
  const width = Math.min(430, cssW - 24);
  const height = 132;
  const x = (cssW - width) * 0.5;
  const y = Math.max(108, Math.min(cssH - height - 88, cssH * 0.2));
  ctx.save(); ctx.globalAlpha = reveal;
  ctx.fillStyle = 'rgba(120,20,10,0.17)'; ctx.fillRect(0, 0, cssW, cssH);
  roundRect(x, y, width, height, 18); ctx.fillStyle = 'rgba(9,13,20,0.88)'; ctx.fill();
  ctx.strokeStyle = profile.accent; ctx.lineWidth = 2.5; ctx.stroke();
  roundRect(x + 13, y + 12, 94, 24, 7); ctx.fillStyle = profile.accent; ctx.fill();
  ctx.fillStyle = '#10151d'; ctx.font = '900 11px ui-monospace, monospace';
  ctx.textAlign = 'center'; ctx.fillText('CRASH THEATER', x + 60, y + 28);
  ctx.fillStyle = '#fff'; ctx.font = '900 ' + Math.min(31, width * 0.074) + 'px system-ui';
  ctx.fillText(`${profile.impactGlyph}  ${profile.label}`, cssW / 2, y + 65);
  const contacts = pose.nodes?.reduce((count, node) => count + (node.contacts > 0 ? 1 : 0), 0) || 0;
  const impact = Math.round(Math.max(0, pose.peakImpact || 0));
  const parts = pose.nodes?.length || 0;
  ctx.fillStyle = 'rgba(222,235,245,0.72)'; ctx.font = '800 11px ui-monospace, monospace';
  ctx.fillText(`${parts} PART RIG   ${contacts} TOUCHPOINTS   PEAK ${impact}`, cssW / 2, y + 88);
  const progress = Math.max(0, Math.min(1, G.crashAge / RUN_SESSION_CRASH_DURATION));
  roundRect(x + 18, y + 101, width - 36, 5, 2.5); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
  roundRect(x + 18, y + 101, (width - 36) * progress, 5, 2.5); ctx.fillStyle = profile.accent; ctx.fill();
  if (G.crashAge > 0.42) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '700 15px system-ui';
    ctx.fillText(STR.tapRetry, cssW / 2, y + 124);
  }
  ctx.restore(); ctx.textAlign = 'left';
}
function finishReveal(start, duration = 0.22) {
  if (reduced()) return 1;
  return Math.max(0, Math.min(1, (G.finishTimer - start) / duration));
}

function finishActionColor(id) {
  return { retry: '#315fd8', replay: '#6f43d6', next: '#ff5a3c',
    menu: '#354052', golden: '#bb8612' }[id] || '#354052';
}

function drawFinishReceiptCell(x, y, w, h, label, value, color, emphasized = false) {
  roundRect(x, y, w, h, 10);
  ctx.fillStyle = emphasized ? 'rgba(85,216,255,0.12)' : 'rgba(255,255,255,0.055)'; ctx.fill();
  ctx.lineWidth = emphasized ? 2 : 1;
  ctx.strokeStyle = emphasized ? 'rgba(85,216,255,0.55)' : 'rgba(255,255,255,0.09)'; ctx.stroke();
  ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(214,230,242,0.62)';
  ctx.font = '900 9px ui-monospace, monospace'; ctx.fillText(label, x + w / 2, y + 17);
  ctx.fillStyle = color;
  ctx.font = `900 ${Math.max(16, Math.min(28, h * 0.36))}px ui-monospace, monospace`;
  ctx.fillText(value, x + w / 2, y + h - 15);
}

function overlayFinishForge() {
  const report = G.finishReport;
  if (!report) return;
  ctx.fillStyle = 'rgba(2,5,10,0.68)'; ctx.fillRect(0, 0, cssW, cssH);
  const compact = cssW < 540;
  const w = Math.min(660, cssW - 16);
  const h = Math.min(compact ? 620 : 600, cssH - 16);
  const x = (cssW - w) / 2, y = (cssH - h) / 2;
  roundRect(x, y, w, h, compact ? 16 : 22);
  const finishGradient = ctx.createLinearGradient(x, y, x + w, y + h);
  finishGradient.addColorStop(0, 'rgba(7,13,20,0.97)');
  finishGradient.addColorStop(1, 'rgba(20,25,38,0.96)');
  ctx.fillStyle = finishGradient; ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = G.replayFailed ? '#ff6a4a' : 'rgba(85,216,255,0.62)'; ctx.stroke();
  ctx.fillStyle = G.replayFailed ? '#ff6a4a' : '#55d8ff';
  roundRect(x + 10, y + 9, w - 20, 5, 2.5); ctx.fill();

  const headerY = y + (compact ? 34 : 40);
  ctx.textAlign = 'left'; ctx.fillStyle = '#ffd23e';
  ctx.font = `900 ${compact ? 11 : 12}px ui-monospace, monospace`;
  ctx.fillText(`FINISH FORGE  //  RUN ${String(report.level.number).padStart(2, '0')}`,
    x + 18, headerY);
  ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(225,237,246,0.58)';
  ctx.fillText(report.level.name.toUpperCase(), x + w - 18, headerY);

  const starY = y + (compact ? 70 : 83), starGap = compact ? 53 : 66;
  for (let index = 0; index < 3; index++) {
    const reveal = finishReveal(0.12 + index * 0.22);
    ctx.save(); ctx.globalAlpha = 0.25 + reveal * 0.75;
    ctx.translate(cssW / 2 + (index - 1) * starGap, starY);
    const scale = 0.78 + reveal * 0.22; ctx.scale(scale, scale);
    ctx.beginPath(); ctx.arc(0, 0, compact ? 21 : 25, 0, Math.PI * 2);
    ctx.fillStyle = index < report.stars ? 'rgba(255,210,62,0.15)' : 'rgba(255,255,255,0.04)'; ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = index < report.stars ? '#ffd23e' : 'rgba(255,255,255,0.12)'; ctx.stroke();
    star(0, 0, compact ? 14 : 17, index < report.stars);
    ctx.restore();
  }

  const receiptAlpha = finishReveal(0.7, 0.28);
  ctx.save(); ctx.globalAlpha = 0.2 + receiptAlpha * 0.8;
  const innerX = x + (compact ? 12 : 18), innerW = w - (compact ? 24 : 36);
  const timingY = y + (compact ? 101 : 120), timingH = compact ? 67 : 82;
  const timingGap = compact ? 6 : 10, timingW = (innerW - timingGap * 2) / 3;
  drawFinishReceiptCell(innerX, timingY, timingW, timingH,
    'RAW CLOCK', fmt(report.timing.gross), '#ffffff');
  drawFinishReceiptCell(innerX + timingW + timingGap, timingY, timingW, timingH,
    'FLIP CREDIT', `-${fmt(report.timing.bonus)}`, '#8bff6b');
  drawFinishReceiptCell(innerX + (timingW + timingGap) * 2, timingY, timingW, timingH,
    'NET LOCK', fmt(report.timing.net), '#55d8ff', true);

  const scoreY = timingY + timingH + (compact ? 8 : 12), scoreH = compact ? 82 : 102;
  roundRect(innerX, scoreY, innerW, scoreH, 12); ctx.fillStyle = 'rgba(255,255,255,0.045)'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.09)'; ctx.stroke();
  ctx.textAlign = 'left'; ctx.fillStyle = '#8fe3ff';
  ctx.font = '900 9px ui-monospace, monospace'; ctx.fillText('SCORE RECEIPT', innerX + 11, scoreY + 16);
  const rawItems = report.score.receipt.items;
  const items = rawItems.length <= 3 ? rawItems : [rawItems[0], rawItems[1], {
    label: 'OTHER', points: rawItems.slice(2).reduce((sum, item) => sum + item.points, 0),
  }];
  const scoreColumns = [...items, { label: 'TOTAL', points: report.score.total, total: true }];
  const scoreColumnW = innerW / scoreColumns.length;
  scoreColumns.forEach((item, index) => {
    const cx = innerX + scoreColumnW * (index + 0.5);
    ctx.textAlign = 'center'; ctx.fillStyle = item.total ? '#ffd23e' : 'rgba(214,230,242,0.55)';
    ctx.font = `900 ${compact ? 7 : 9}px ui-monospace, monospace`;
    ctx.fillText(item.label, cx, scoreY + (compact ? 35 : 42));
    ctx.fillStyle = item.total ? '#ffd23e' : '#ffffff';
    ctx.font = `900 ${compact ? 15 : 20}px ui-monospace, monospace`;
    ctx.fillText(String(item.points).padStart(item.total ? 6 : 3, '0'),
      cx, scoreY + (compact ? 62 : 74));
  });
  ctx.restore();

  const statusY = y + (compact ? 270 : 335);
  const previous = report.timing.previousBest;
  let pbText = previous === null ? 'FIRST RECORD LOCKED' : `PB ${fmt(previous)}`;
  if (report.timing.newRecord && previous !== null) {
    pbText = `PB SHAVED ${(report.timing.deltaMs / 1000).toFixed(2)}s`;
  } else if (!report.timing.newRecord && previous !== null && report.timing.deltaMs < 0) {
    pbText += `  //  +${Math.abs(report.timing.deltaMs / 1000).toFixed(2)}s`;
  }
  const proofText = G.replayMode
    ? (G.replayVerified
      ? (G.replaySource === 'golden' ? STR.referenceVerified : STR.proofVerified)
      : STR.proofFailed)
    : (G.replayRecorded ? STR.proofRecorded : STR.proofMissing);
  ctx.textAlign = 'left';
  ctx.fillStyle = report.timing.newRecord ? '#8bff6b' : 'rgba(225,237,246,0.76)';
  ctx.font = `900 ${compact ? 11 : 13}px ui-monospace, monospace`; ctx.fillText(pbText, innerX, statusY);
  ctx.fillStyle = G.replayFailed ? '#ff6a4a' : '#8fe3ff';
  ctx.font = `800 ${compact ? 9 : 11}px ui-monospace, monospace`;
  ctx.fillText(`PROOF // ${proofText}`, innerX, statusY + (compact ? 22 : 25));
  ctx.fillStyle = 'rgba(225,237,246,0.6)';
  const routeText = report.nextRoute.available
    ? `NEXT // ${String(report.nextRoute.index + 1).padStart(2, '0')} ${report.nextRoute.levelName.toUpperCase()}`
    : 'NEXT // RELAY BOARD';
  ctx.fillText(routeText, innerX, statusY + (compact ? 42 : 48));

  const actions = report.actions;
  const mainActions = actions.filter(action => action.id !== 'golden');
  const goldenAction = actions.find(action => action.id === 'golden');
  const actionGap = 8, useGrid = compact && mainActions.length >= 4;
  const actionRows = useGrid ? 2 : 1, actionHeight = compact ? 48 : 52;
  const actionAreaH = actionRows * actionHeight + (actionRows - 1) * actionGap;
  const actionY = y + h - 12 - actionAreaH;
  const actionCols = useGrid ? 2 : mainActions.length;
  const actionW = (innerW - actionGap * (actionCols - 1)) / actionCols;
  mainActions.forEach((action, index) => {
    const row = useGrid ? Math.floor(index / actionCols) : 0;
    const col = useGrid ? index % actionCols : index;
    const reportIndex = actions.indexOf(action);
    btn(innerX + col * (actionW + actionGap), actionY + row * (actionHeight + actionGap),
      actionW, actionHeight, action.label, action.id, finishActionColor(action.id), {
        disabled: !action.enabled,
        selected: reportIndex === G.finishFocus,
      });
  });
  if (goldenAction) {
    const reportIndex = actions.indexOf(goldenAction);
    const goldW = compact ? 118 : 142;
    const goldY = actionY - (compact ? 54 : 60);
    btn(x + w - (compact ? 12 : 18) - goldW, goldY, goldW, 44,
      goldenAction.label, goldenAction.id, finishActionColor('golden'), {
        selected: reportIndex === G.finishFocus,
      });
  }
  ctx.textAlign = 'left'; ctx.globalAlpha = 1;
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
  if (id === 'retry') {
    G.settingsOpen = false;
    const resolved = resolveResultAction('retry', {
      levels, currentIndex: G.levelIdx, unlocked: boundedUnlocked(),
    });
    const preservePlayback = G.state !== 'finished' && G.replayMode;
    if (resolved.ok) startLevel(resolved.index, preservePlayback
      ? { replayToken: G.replayToken, replaySource: G.replaySource } : undefined);
    else routeNotice(resolved.reason);
    return;
  }
  if (id === 'replay') {
    const token = G.replayToken || save.replays[G.levelIdx];
    const source = token === G.replayToken ? (G.replaySource || 'saved') : 'saved';
    const resolved = resolveResultAction('replay', {
      levels, currentIndex: G.levelIdx, unlocked: boundedUnlocked(),
      replayToken: token, replaySource: source,
    });
    if (resolved.ok) startLevel(resolved.index, { replayToken: resolved.token,
      replaySource: resolved.source });
    else {
      G.replayNotice = { message: STR.proofMissing, detail: STR.proofMissing, life: 3.5 };
      announce(STR.proofMissing);
    }
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
    G.finishFocus = -1; G.restartQueued = false; hideSemanticResults(); clearControls('menu'); Audio2.resetRun();
    Audio2.setMusicState('menu'); announce(STR.levelSelect); return; }
  if (id === 'next') {
    const resolved = resolveResultAction('next', {
      levels, currentIndex: G.levelIdx, unlocked: boundedUnlocked(),
    });
    if (resolved.ok) startLevel(resolved.index);
    else if (resolved.reason === 'campaign-complete') doUI('menu');
    else routeNotice(resolved.reason);
    return;
  }
  if (id === 'gear') { G.settingsOpen = true; return; }
  if (id === 'set_close') { G.settingsOpen = false; return; }
  if (id === 'set_music_dn') { SETTINGS.music = clamp01(SETTINGS.music - 0.1); persist(); Audio2.applyMusicGains(); return; }
  if (id === 'set_music_up') { SETTINGS.music = clamp01(SETTINGS.music + 0.1); persist(); Audio2.applyMusicGains(); return; }
  if (id === 'set_sfx_dn') { SETTINGS.sfx = clamp01(SETTINGS.sfx - 0.1); persist(); return; }
  if (id === 'set_sfx_up') { SETTINGS.sfx = clamp01(SETTINGS.sfx + 0.1); persist(); return; }
  if (id === 'set_mute') { Audio2.toggle(); return; }
  if (id === 'set_motion') {
    SETTINGS.reducedMotion = !SETTINGS.reducedMotion;
    if (SETTINGS.reducedMotion) {
      G.shake = 0; G.slow = 1; G.hitstop = 0; G.flash = 0;
      G.cam.roll = 0; G.cam.kickX = 0; G.cam.kickY = 0;
      if (G.state === 'crashed' && G.ragdoll) {
        G.ragdoll.active = false; G.ragdoll.settled = true;
        G.ragdoll.reducedMotion = true; G.ragdoll.settleReason = 'reduced-motion-toggle';
        for (const node of G.ragdoll.nodes) { node.oldX = node.x; node.oldY = node.y; }
        G.ragdollPose = readRagdoll(G.ragdoll, G.ragdollPose || {});
        updateCamera(0);
      }
    }
    persist(); return;
  }
  if (id === 'set_haptics') { SETTINGS.haptics = !SETTINGS.haptics; persist(); if (SETTINGS.haptics) vib(20); return; }
  if (id === 'set_left_handed') {
    SETTINGS.leftHanded = !SETTINGS.leftHanded; updateControlLayout(); persist(); return;
  }
  if (id === 'install') { const d = window.__deferredInstall; if (d) { d.prompt(); window.__deferredInstall = null; } return; }
  if (id.startsWith('world')) { G.menuWorld = Math.max(0, Math.min(worlds.length - 1, parseInt(id.slice(5), 10) || 0)); return; }
  const levelMatch = /^lvl(\d+)$/.exec(id);
  if (levelMatch) { startLevel(Number(levelMatch[1]), { requireUnlocked: true }); return; }
}

// ---------------------------------------------------------------- loop ------
const STEP = 1 / 60, STEP_MS = STEP * 1000;
const MAX_FIXED_TICKS_PER_FRAME = 5, MAX_BACKLOG_TICKS = 6;
let acc = 0, last = performance.now();
resetLoopClock = () => { acc = 0; last = performance.now(); };
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
  if (G.captureFrozen) {
    recordFrameTelemetry(rawDtMs, 0, backlogTicks, 0, clampedMs);
    updateDevPanel(now); return;
  }
  const gamepads = navigator.getGamepads?.() || [];
  if (gamepadConnected) inputState.pollGamepads(gamepads);
  handleUiEdges(uiInput.poll(gamepads));
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
  if (G.state === 'finished') {
    G.finishTimer = reduced() ? 10 : Math.min(10, G.finishTimer + dtMs / 1000);
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
  // Treat every renderer as an isolated pass. Complex tracks intentionally
  // use clips/compositing; a missed restore must never crop the HUD or poison
  // the next frame.
  ctx.save(); drawSky(); ctx.restore();
  if (G.state !== 'menu' && G.level) {
    ctx.save();
    const scale = worldTransform();
    drawWorld(scale);
    ctx.restore();
  }
  ctx.save(); drawVignette(); ctx.restore();
  ctx.save(); drawHUD(); ctx.restore();
  if (G.flash > 0) {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,' + (G.flash * 0.55) + ')';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- boot ------
Audio2.loadMusic();
Promise.all([loadAssets(), loadGoldenTapes()]).then(() => {
  makePatterns();
  if (patDirt) patScale(patDirt, IMG.dirt);
  if (patRock) patScale(patRock, IMG.rock);
  document.getElementById('boot').style.display = 'none';
  if (devParams.has('finish')) stageDevFinish({
    levelIndex: devLevel,
    reducedMotion: devParams.has('reduced'),
    presentationTime: devParams.has('presentation') ? Number(devParams.get('presentation')) : undefined,
    previousBestTime: devParams.has('first') ? null : undefined,
    freeze: captureMode,
  });
  else if (devParams.has('level')) startLevel(devLevel);
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
    if (G.state === 'playing' || G.state === 'crashed') updateCamera(STEP);
    if (G.flash > 0) G.flash = Math.max(0, G.flash - STEP * 3.5);
  }
  return { ok: true, stepped, state: G.state, replayTick: G.replayTick,
    runTick: G.run?.tick ?? 0, time: G.elapsed, score: G.score,
    token: G.replayToken || null };
}

function stageDevCrash(options = {}) {
  if (!dev) return { ok: false, reason: 'development mode required' };
  const levelIndex = Math.max(0, Math.min(levels.length - 1,
    Math.trunc(Number(options.levelIndex ?? options.level ?? 15) || 0)));
  G.captureFrozen = false;
  SETTINGS.reducedMotion = options.reducedMotion === true;
  if (!startLevel(levelIndex)) return { ok: false, reason: 'level start failed' };
  const warmupTicks = Math.max(0, Math.min(240, Math.trunc(Number(options.warmupTicks ?? 42) || 0)));
  stepDevTicks(warmupTicks);
  if (G.state !== 'playing') {
    startLevel(levelIndex); stepDevTicks(Math.min(12, warmupTicks));
  }
  const type = typeof options.type === 'string' ? options.type : 'mace';
  const sourceX = G.bike.x + (Number.isFinite(options.offsetX) ? options.offsetX : 28);
  const sourceY = G.bike.y + (Number.isFinite(options.offsetY) ? options.offsetY : -4);
  doCrash({ type, id: `dev-${type}`, x: sourceX, y: sourceY,
    intensity: Number.isFinite(options.intensity) ? options.intensity : 1 });
  const presentationTicks = Math.max(0, Math.min(110,
    Math.trunc(Number(options.presentationTicks ?? 0) || 0)));
  if (presentationTicks) {
    // Fixed capture staging begins after the real-time 75 ms impact beat.
    G.hitstop = 0; G.slow = 1;
    stepDevTicks(presentationTicks);
  }
  if (options.collisionDebug === true) collisionDebug = true;
  render();
  return {
    ok: G.state === 'crashed', state: G.state, levelIndex: G.levelIdx,
    type: G.crashProfile?.type, label: G.crashProfile?.label,
    crashAge: G.crashAge, poseTicks: G.ragdollPose?.ticks,
    parts: G.ragdollPose?.nodes?.length || 0,
    contacts: G.ragdollPose?.contactCount || 0,
    reducedMotion: G.ragdollPose?.reducedMotion === true,
    camera: { ...G.cam },
  };
}

function freezeDevPresentation(frozen = true) {
  if (!dev) return false;
  G.captureFrozen = frozen !== false;
  if (G.captureFrozen) render();
  return G.captureFrozen;
}

function runDevToEnd(maxTicks = 60 * 120) {
  return stepDevTicks(maxTicks);
}

function finishSnapshot() {
  const report = G.finishReport ? JSON.parse(JSON.stringify(G.finishReport)) : null;
  return Object.freeze({
    state: G.state,
    levelIndex: G.levelIdx,
    finishTimer: G.finishTimer,
    reducedMotion: reduced(),
    report,
    focusedAction: report?.actions?.[G.finishFocus]?.id || null,
    replayRecorded: G.replayRecorded,
    replayMode: G.replayMode,
    replayVerified: G.replayVerified,
    replayFailed: G.replayFailed,
  });
}

function uiSnapshot() {
  const semantic = semanticResultsActions
    ? [...semanticResultsActions.querySelectorAll('button')].map(button => ({
      id: button.dataset.action || '', label: button.textContent || '', disabled: button.disabled,
    })) : [];
  return Object.freeze({
    buttons: Object.freeze(uiButtons.slice(0, uiButtonCount).map(button => Object.freeze({ ...button }))),
    semantic: Object.freeze(semantic.map(button => Object.freeze(button))),
    focusIndex: G.finishFocus,
    focusedAction: G.finishReport?.actions?.[G.finishFocus]?.id || null,
    viewport: Object.freeze({ width: cssW, height: cssH, dpr,
      canvasWidth: canvas.width, canvasHeight: canvas.height }),
  });
}

function runtimeSnapshot() {
  return Object.freeze({
    state: G.state,
    levelIndex: G.levelIdx,
    session: G._runSessionReady ? snapshotRunSession(G) : null,
    presentation: Object.freeze({
      shake: G.shake, flash: G.flash, slow: G.slow, hitstop: G.hitstop,
      trackT: G.trackT, engineGear: G.engineGear, finishTimer: G.finishTimer,
      finishFocus: G.finishFocus, restartQueued: G.restartQueued,
      ragdoll: !!G.ragdoll, crashWorld: !!G.crashWorld,
      crashImpacts: G.crashImpacts.length, settingsOpen: G.settingsOpen,
    }),
    effects: effectPoolSnapshot(),
    input: inputState.getTelemetry(),
    uiInput: uiInput.inspect(),
    audio: Audio2.inspect(),
    loop: Object.freeze({ accumulatorMs: acc, lastFrameAt: last }),
  });
}

function stageDevFinish(options = {}) {
  if (!dev) return { ok: false, reason: 'development mode required' };
  const levelIndex = Math.max(0, Math.min(levels.length - 1,
    Math.trunc(Number(options.levelIndex ?? options.level ?? 0) || 0)));
  G.captureFrozen = false;
  SETTINGS.reducedMotion = options.reducedMotion === true;
  if (!startLevel(levelIndex)) return { ok: false, reason: 'level start failed' };
  const elapsed = Math.max(0, Number.isFinite(options.elapsed) ? options.elapsed : 18.75);
  const flipBonus = Math.max(0, Math.min(elapsed,
    Number.isFinite(options.flipBonus) ? options.flipBonus : 1.5));
  const scoreParts = {
    flip: Math.max(0, Math.trunc(Number(options.trickScore ?? 900) || 0)),
    landingPerfect: Math.max(0, Math.trunc(Number(options.flowScore ?? 420) || 0)),
    nearMiss: Math.max(0, Math.trunc(Number(options.riskScore ?? 180) || 0)),
  };
  resetScoreLedger(G.scoreLedger);
  for (const [type, points] of Object.entries(scoreParts)) {
    if (points > 0) recordScoreEvent(G.scoreLedger, { type, points });
  }
  G.elapsed = elapsed; G.flipBonus = flipBonus;
  G.score = G.scoreLedger.total; G.finishScore = G.score;
  G.finishTime = Math.max(0, elapsed - flipBonus);
  G.finishStars = Math.max(0, Math.min(3, Math.trunc(Number(options.stars ?? 3) || 0)));
  G.state = 'finished'; G.running = false; G.finishTimer = 0;
  G.replayMode = false; G.replayPlayback = null; G.replaySource = null;
  G.replayRecorder = null; G.replayVerified = false; G.replayFailed = null;
  const reference = GOLDEN_TAPES.get(levelIndex);
  G.replayToken = options.replayAvailable === false ? null : (reference?.token || null);
  G.replayRecorded = !!G.replayToken;
  save.unlocked = Math.max(boundedUnlocked(), Math.min(levels.length,
    Math.trunc(Number(options.unlocked ?? levelIndex + 2) || 1)));
  const previousTime = options.previousBestTime === null ? null
    : (Number.isFinite(options.previousBestTime) ? options.previousBestTime : G.finishTime + 0.84);
  const previousScore = options.previousBestScore === null ? null
    : (Number.isFinite(options.previousBestScore) ? options.previousBestScore : Math.max(0, G.score - 120));
  finalizeFinishReport(options.recordEligible !== false, { time: previousTime, score: previousScore });
  G.finishTimer = reduced() ? 10 : Math.max(0, Math.min(10,
    Number.isFinite(options.presentationTime) ? options.presentationTime : 2));
  if (options.freeze === true) G.captureFrozen = true;
  render();
  return Object.freeze({ ok: true, ...finishSnapshot(), ui: uiSnapshot() });
}

function stepFinishPresentationTicks(count = 1) {
  if (!dev || G.state !== 'finished') return { ok: false, reason: 'finished development scene required' };
  const ticks = Math.max(0, Math.min(600, Math.trunc(Number(count) || 0)));
  for (let index = 0; index < ticks; index++) {
    G.finishTimer = reduced() ? 10 : Math.min(10, G.finishTimer + STEP);
    updateParticles(STEP);
  }
  render();
  return { ok: true, ticks, finishTimer: G.finishTimer };
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
  stageCrash: stageDevCrash, stageFinish: stageDevFinish,
  stepFinishPresentationTicks, finishSnapshot, uiSnapshot, runtimeSnapshot,
  freezePresentation: freezeDevPresentation,
  renderNow: () => { if (dev) render(); return dev; },
  setCollisionDebug: value => { if (dev) collisionDebug = value === true; return collisionDebug; },
  input: inputState,
  performanceSnapshot: () => snapshotPerformanceMetrics(performanceMetrics),
  resetPerformance: resetGamePerformance,
  effectPoolSnapshot,
  get goldenManifest() { return goldenManifest; } };

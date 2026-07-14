// Moto Rush X3 collision-debug proxy builder.
//
// This module contains no Canvas or DOM code. It turns live simulation records
// into a bounded, detached, finite snapshot that any renderer (game overlay,
// test reporter, replay viewer) can consume without touching authoritative state.

import { CONFIG } from './physics.js';

const HARD_LIMITS = Object.freeze({
  terrainSegments: 16384,
  hazards: 2048,
  platforms: 1024,
  checkpoints: 1024,
  coordinate: 100000000,
  radius: 1000000,
});

export const DEBUG_PROXY_DEFAULTS = Object.freeze({
  maxTerrainSegments: 4096,
  maxHazards: 512,
  maxPlatforms: 256,
  maxCheckpoints: 256,
  maxCoordinate: 10000000,
  maxRadius: 100000,
  markerHalfHeight: 150,
});

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function boundedNumber(value, fallback, magnitude) {
  return clamp(finite(value, fallback), -magnitude, magnitude);
}

function boundedSize(value, fallback, maximum) {
  return clamp(Math.abs(finite(value, fallback)), 0, maximum);
}

function boundedInteger(value, fallback, maximum) {
  return Math.floor(clamp(finite(value, fallback), 0, maximum));
}

function safeString(value, fallback, maxLength = 96) {
  let result;
  try { result = value == null ? fallback : String(value); } catch { result = fallback; }
  return result.slice(0, maxLength);
}

function normalizeOptions(options = {}) {
  const maxCoordinate = clamp(Math.abs(finite(options.maxCoordinate,
    DEBUG_PROXY_DEFAULTS.maxCoordinate)), 1, HARD_LIMITS.coordinate);
  const maxRadius = clamp(Math.abs(finite(options.maxRadius,
    DEBUG_PROXY_DEFAULTS.maxRadius)), 1, HARD_LIMITS.radius);
  return Object.freeze({
    maxTerrainSegments: boundedInteger(options.maxTerrainSegments,
      DEBUG_PROXY_DEFAULTS.maxTerrainSegments, HARD_LIMITS.terrainSegments),
    maxHazards: boundedInteger(options.maxHazards,
      DEBUG_PROXY_DEFAULTS.maxHazards, HARD_LIMITS.hazards),
    maxPlatforms: boundedInteger(options.maxPlatforms,
      DEBUG_PROXY_DEFAULTS.maxPlatforms, HARD_LIMITS.platforms),
    maxCheckpoints: boundedInteger(options.maxCheckpoints,
      DEBUG_PROXY_DEFAULTS.maxCheckpoints, HARD_LIMITS.checkpoints),
    maxCoordinate,
    maxRadius,
    markerHalfHeight: clamp(Math.abs(finite(options.markerHalfHeight,
      DEBUG_PROXY_DEFAULTS.markerHalfHeight)), 1, maxCoordinate),
  });
}

function coordinate(value, cfg, fallback = 0) {
  return boundedNumber(value, fallback, cfg.maxCoordinate);
}

function radius(value, cfg, fallback = 0) {
  return boundedSize(value, fallback, cfg.maxRadius);
}

function sourceArray(value) {
  return Array.isArray(value) ? value : [];
}

function truncateCount(source, used) {
  return Math.max(0, source.length - used);
}

function terrainProxy(terrain, cfg) {
  const source = sourceArray(terrain?.segments);
  const count = Math.min(source.length, cfg.maxTerrainSegments);
  const output = new Array(count);
  for (let index = 0; index < count; index++) {
    const segment = source[index] || {};
    const ax = coordinate(segment.ax, cfg);
    const ay = coordinate(segment.ay, cfg);
    const bx = coordinate(segment.bx, cfg, ax);
    const by = coordinate(segment.by, cfg, ay);
    output[index] = {
      id: `terrain-${index}`,
      index,
      enabled: terrain?.enabled ? terrain.enabled[index] !== 0 : segment.enabled !== false,
      surface: safeString(segment.surface, 'dirt', 48),
      surfaceStrength: boundedNumber(segment.surfaceStrength, 1, cfg.maxCoordinate),
      oneWay: segment.oneWay !== false,
      a: { x: ax, y: ay },
      b: { x: bx, y: by },
      bounds: {
        left: Math.min(ax, bx),
        right: Math.max(ax, bx),
        top: Math.min(ay, by),
        bottom: Math.max(ay, by),
      },
    };
  }
  return { output, source };
}

function previousPoint(bike, node, id, cfg) {
  const framePrevious = bike?.framePrevious?.[id];
  const x = Number.isFinite(framePrevious?.x) ? framePrevious.x
    : Number.isFinite(node?.ox) ? node.ox : node?.x;
  const y = Number.isFinite(framePrevious?.y) ? framePrevious.y
    : Number.isFinite(node?.oy) ? node.oy : node?.y;
  return { x: coordinate(x, cfg), y: coordinate(y, cfg) };
}

function bikeProxy(bike, cfg) {
  if (!bike || typeof bike !== 'object') {
    return { circles: [], sweeps: [], grounded: false, crashed: false };
  }
  const definitions = [
    ['rear', 'wheel', bike.rear, bike.cfg?.wheelR ?? CONFIG.wheelR],
    ['front', 'wheel', bike.front, bike.cfg?.wheelR ?? CONFIG.wheelR],
    ['head', 'head', bike.head, bike.cfg?.headR ?? CONFIG.headR],
  ];
  const circles = definitions.map(([id, kind, node, rawRadius]) => {
    const current = {
      x: coordinate(node?.x, cfg),
      y: coordinate(node?.y, cfg),
      r: radius(rawRadius, cfg, kind === 'wheel' ? CONFIG.wheelR : CONFIG.headR),
    };
    const point = previousPoint(bike, node, id, cfg);
    return {
      id,
      kind,
      current,
      previous: { ...point, r: current.r },
    };
  });
  const sweeps = circles.map((circle) => ({
    id: circle.id,
    kind: circle.kind,
    x0: circle.previous.x,
    y0: circle.previous.y,
    x1: circle.current.x,
    y1: circle.current.y,
    r: circle.current.r,
  }));
  return {
    circles,
    sweeps,
    grounded: bike.grounded === true,
    crashed: bike.crashed === true,
  };
}

function hazardProxy(run, level, cfg) {
  const runtime = sourceArray(run?.hazards);
  const source = runtime.length ? runtime : sourceArray(level?.course?.hazards);
  const count = Math.min(source.length, cfg.maxHazards);
  const output = new Array(count);
  for (let index = 0; index < count; index++) {
    const hazard = source[index] || {};
    const x = coordinate(hazard.x ?? hazard.baseX, cfg);
    const y = coordinate(hazard.y ?? hazard.baseY, cfg);
    const previousX = coordinate(hazard.prevX, cfg, x);
    const previousY = coordinate(hazard.prevY, cfg, y);
    const r = radius(hazard.r ?? hazard.radius, cfg);
    const id = safeString(hazard.id, `hazard-${index}`);
    const type = safeString(hazard.type, 'hazard', 48);
    output[index] = {
      id,
      type,
      active: hazard.active !== false && hazard.enabled !== false && hazard.exploded !== true,
      triggered: hazard.triggered === true,
      exploded: hazard.exploded === true,
      current: { x, y, r },
      previous: { x: previousX, y: previousY, r },
      sweep: { x0: previousX, y0: previousY, x1: x, y1: y, r },
    };
  }
  return { output, source };
}

function rectProxy(raw, cfg, fallback = {}) {
  const widthFallback = Number.isFinite(raw?.right) && Number.isFinite(raw?.left)
    ? raw.right - raw.left : fallback.width;
  const heightFallback = Number.isFinite(raw?.bottom) && Number.isFinite(raw?.top)
    ? raw.bottom - raw.top : fallback.height;
  const width = radius(raw?.width, cfg, radius(widthFallback, cfg));
  const height = radius(raw?.height, cfg, radius(heightFallback, cfg));
  const fallbackX = finite(fallback.x);
  const fallbackY = finite(fallback.y);
  const derivedX = Number.isFinite(raw?.left) && Number.isFinite(raw?.right)
    ? (raw.left + raw.right) * 0.5 : fallbackX;
  const derivedY = Number.isFinite(raw?.top) && Number.isFinite(raw?.bottom)
    ? (raw.top + raw.bottom) * 0.5 : fallbackY;
  const x = coordinate(raw?.x, cfg, derivedX);
  const y = coordinate(raw?.y, cfg, derivedY);
  return {
    x,
    y,
    width,
    height,
    left: coordinate(raw?.left, cfg, x - width * 0.5),
    right: coordinate(raw?.right, cfg, x + width * 0.5),
    top: coordinate(raw?.top, cfg, y - height * 0.5),
    bottom: coordinate(raw?.bottom, cfg, y + height * 0.5),
  };
}

function platformProxy(kinematicRun, cfg) {
  const source = sourceArray(kinematicRun?.platforms);
  const count = Math.min(source.length, cfg.maxPlatforms);
  const output = new Array(count);
  const tickRate = Math.max(1, finite(kinematicRun?.tickRate, 60));
  for (let index = 0; index < count; index++) {
    const platform = source[index] || {};
    const currentRaw = platform.current || platform.pose || platform;
    const current = rectProxy(currentRaw, cfg);
    const dx = finite(currentRaw?.dx);
    const dy = finite(currentRaw?.dy);
    const previousFallback = {
      ...current,
      x: current.x - dx,
      y: current.y - dy,
      left: current.left - dx,
      right: current.right - dx,
      top: current.top - dy,
      bottom: current.bottom - dy,
    };
    const previous = rectProxy(platform.previous, cfg, previousFallback);
    const velocityX = coordinate(currentRaw?.vx, cfg, (current.x - previous.x) * tickRate);
    const velocityY = coordinate(currentRaw?.vy, cfg, (current.y - previous.y) * tickRate);
    output[index] = {
      id: safeString(platform.id ?? currentRaw?.id, `platform-${index}`),
      active: platform.active !== false && platform.enabled !== false
        && currentRaw?.active !== false && platform.definition?.active !== false,
      surface: safeString(currentRaw?.surface ?? platform.definition?.surface, 'metal', 48),
      current,
      previous,
      surfaceVelocity: { x: velocityX, y: velocityY },
      sweep: { x0: previous.x, y0: previous.y, x1: current.x, y1: current.y },
    };
  }
  return { output, source };
}

function checkpointProxy(run, level, cfg) {
  const authored = sourceArray(level?.course?.checkpoints);
  const source = authored.length ? authored : sourceArray(run?.cpList).slice(1);
  const count = Math.min(source.length, cfg.maxCheckpoints);
  const cpIndex = Math.max(0, Math.trunc(finite(run?.cpIndex)));
  const output = new Array(count);
  for (let index = 0; index < count; index++) {
    const checkpoint = source[index] || {};
    const x = coordinate(checkpoint.x, cfg);
    const y = coordinate(checkpoint.y, cfg);
    output[index] = {
      id: safeString(checkpoint.id, `checkpoint-${index + 1}`),
      index: index + 1,
      x,
      y,
      reached: cpIndex >= index + 1,
      next: cpIndex + 1 === index + 1,
      trigger: { axis: 'x', comparison: 'greater-than', value: x },
      line: {
        x1: x,
        y1: coordinate(y - cfg.markerHalfHeight, cfg),
        x2: x,
        y2: coordinate(y + cfg.markerHalfHeight, cfg),
      },
    };
  }
  return { output, source };
}

function finishProxy(level, bike, checkpoints, cfg) {
  const rawX = level?.course?.finishX;
  if (!Number.isFinite(rawX)) return null;
  const x = coordinate(rawX, cfg);
  const lastCheckpoint = checkpoints[checkpoints.length - 1];
  const y = coordinate(level?.course?.finishPt?.y, cfg,
    finite(lastCheckpoint?.y, finite(bike?.y)));
  return {
    id: 'finish',
    x,
    y,
    passed: Number.isFinite(bike?.x) ? bike.x > rawX : false,
    trigger: { axis: 'x', comparison: 'greater-than', value: x },
    line: {
      x1: x,
      y1: coordinate(y - cfg.markerHalfHeight, cfg),
      x2: x,
      y2: coordinate(y + cfg.markerHalfHeight, cfg),
    },
  };
}

/**
 * Build a detached collision-debug snapshot from current runtime state.
 * Sources are read only; no contact query or simulation method is invoked.
 */
export function buildDebugProxySnapshot(source = {}, options = {}) {
  const cfg = normalizeOptions(options);
  const terrain = terrainProxy(source.terrain, cfg);
  const hazards = hazardProxy(source.run, source.level, cfg);
  const platforms = platformProxy(source.kinematicRun, cfg);
  const checkpoints = checkpointProxy(source.run, source.level, cfg);
  const bike = bikeProxy(source.bike, cfg);
  return {
    tick: boundedNumber(source.run?.tick, 0, Number.MAX_SAFE_INTEGER),
    kinematicTick: boundedNumber(source.kinematicRun?.tick, 0, Number.MAX_SAFE_INTEGER),
    limits: { ...cfg },
    truncated: {
      terrainSegments: truncateCount(terrain.source, terrain.output.length),
      hazards: truncateCount(hazards.source, hazards.output.length),
      platforms: truncateCount(platforms.source, platforms.output.length),
      checkpoints: truncateCount(checkpoints.source, checkpoints.output.length),
    },
    terrain: terrain.output,
    bike,
    hazards: hazards.output,
    platforms: platforms.output,
    checkpoints: checkpoints.output,
    finish: finishProxy(source.level, source.bike, checkpoints.output, cfg),
  };
}

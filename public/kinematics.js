// kinematics.js — deterministic moving ground shared by the game and tests.
//
// Coordinates follow the game convention: +x is right and +y is down. Authored
// platform x/y values describe the centre of an axis-aligned rectangle. Runtime
// state is deliberately separate from the cloned, deeply frozen definitions.

export const KINEMATIC_TICK_RATE = 60;

const TAU = Math.PI * 2;
const EPSILON = 1e-9;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function mod1(value) {
  return ((value % 1) + 1) % 1;
}

function clonePlain(value) {
  if (Array.isArray(value)) return value.map(clonePlain);
  if (!value || typeof value !== 'object') return value;
  const copy = {};
  for (const [key, child] of Object.entries(value)) copy[key] = clonePlain(child);
  return copy;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function normaliseMotion(rawMotion = {}) {
  const rawKind = String(rawMotion.kind || 'static')
    .toLowerCase().replace(/[\s_-]/g, '');
  const aliases = {
    horizontalsine: ['sine', 'x'],
    verticalsine: ['sine', 'y'],
    horizontalpingpong: ['pingPong', 'x'],
    verticalpingpong: ['pingPong', 'y'],
    pingpong: ['pingPong', null],
    sine: ['sine', null],
    lift: ['lift', 'y'],
    piston: ['piston', null],
    static: ['static', null],
  };
  const [kind, aliasAxis] = aliases[rawKind] || aliases.static;
  const axis = aliasAxis || (rawMotion.axis === 'x' ? 'x' : 'y');
  const fallbackDirection = kind === 'lift' ? -1 : 1;
  const requestedDirection = finite(rawMotion.direction, fallbackDirection);

  return deepFreeze({
    kind,
    axis,
    amplitude: Math.abs(finite(
      rawMotion.amplitude,
      finite(rawMotion.distance, finite(rawMotion.stroke, 0)),
    )),
    period: positive(rawMotion.period, 2),
    phase: finite(rawMotion.phase, 0),
    direction: requestedDirection < 0 ? -1 : 1,
  });
}

function normaliseDefinition(definition, index) {
  if (!definition || typeof definition !== 'object') {
    throw new TypeError(`Kinematic platform ${index} must be an object`);
  }
  const width = positive(definition.width ?? definition.w, 0);
  const height = positive(definition.height ?? definition.h, 0);
  if (!width || !height) {
    throw new RangeError(`Kinematic platform ${index} needs positive width and height`);
  }

  return deepFreeze({
    id: String(definition.id || `platform-${index}`),
    x: finite(definition.x),
    y: finite(definition.y),
    width,
    height,
    surface: String(definition.surface || 'metal'),
    render: deepFreeze(clonePlain(definition.render || {})),
    motion: normaliseMotion(definition.motion),
  });
}

function sampleMotion(motion, tick, tickRate) {
  if (motion.kind === 'static' || motion.amplitude === 0) {
    return { offset: 0, progress: 0 };
  }

  const cycle = mod1(tick / tickRate / motion.period + motion.phase);
  if (motion.kind === 'sine') {
    const wave = Math.sin(TAU * cycle);
    return { offset: wave * motion.amplitude, progress: (wave + 1) * 0.5 };
  }
  if (motion.kind === 'pingPong') {
    const wave = 1 - 4 * Math.abs(cycle - 0.5);
    return { offset: wave * motion.amplitude, progress: (wave + 1) * 0.5 };
  }
  if (motion.kind === 'lift') {
    const triangle = cycle < 0.5 ? cycle * 2 : (1 - cycle) * 2;
    const eased = triangle * triangle * (3 - 2 * triangle);
    return {
      offset: eased * motion.amplitude * motion.direction,
      progress: eased,
    };
  }

  // A piston starts retracted, reaches full stroke halfway through its cycle,
  // and retracts with zero velocity at both ends.
  const extension = (1 - Math.cos(TAU * cycle)) * 0.5;
  return {
    offset: extension * motion.amplitude * motion.direction,
    progress: extension,
  };
}

function geometry(definition, tick, tickRate) {
  const sample = sampleMotion(definition.motion, tick, tickRate);
  const x = definition.x + (definition.motion.axis === 'x' ? sample.offset : 0);
  const y = definition.y + (definition.motion.axis === 'y' ? sample.offset : 0);
  return {
    id: definition.id,
    tick,
    x,
    y,
    width: definition.width,
    height: definition.height,
    left: x - definition.width * 0.5,
    right: x + definition.width * 0.5,
    top: y - definition.height * 0.5,
    bottom: y + definition.height * 0.5,
    motionProgress: sample.progress,
    surface: definition.surface,
  };
}

function poseAtNormalised(definition, tick, tickRate) {
  const current = geometry(definition, tick, tickRate);
  const previous = geometry(definition, tick - 1, tickRate);
  const dx = current.x - previous.x;
  const dy = current.y - previous.y;
  return {
    ...current,
    dx,
    dy,
    vx: dx * tickRate,
    vy: dy * tickRate,
  };
}

function stationaryPose(pose) {
  return { ...pose, dx: 0, dy: 0, vx: 0, vy: 0 };
}

/** Return a pure authored-platform pose at an integer simulation tick. */
export function platformPoseAt(definition, tick, tickRate = KINEMATIC_TICK_RATE) {
  const rate = positive(tickRate, KINEMATIC_TICK_RATE);
  const safeTick = Math.trunc(finite(tick));
  return poseAtNormalised(normaliseDefinition(definition, 0), safeTick, rate);
}

/**
 * Create per-run state. The caller's definitions are never frozen or mutated;
 * normalised internal copies are deeply frozen instead.
 */
export function createKinematicRun(definitions = [], options = {}) {
  if (!Array.isArray(definitions)) throw new TypeError('Kinematic definitions must be an array');
  const tickRate = positive(options.tickRate, KINEMATIC_TICK_RATE);
  const startTick = Math.trunc(finite(options.startTick));
  const immutableDefinitions = definitions.map(normaliseDefinition);
  const ids = new Set();
  for (const definition of immutableDefinitions) {
    if (ids.has(definition.id)) throw new Error(`Duplicate kinematic id: ${definition.id}`);
    ids.add(definition.id);
  }

  const run = {
    tick: startTick,
    startTick,
    tickRate,
    definitions: Object.freeze(immutableDefinitions),
    platforms: [],
  };
  run.platforms = immutableDefinitions.map((definition) => {
    const current = stationaryPose(poseAtNormalised(definition, startTick, tickRate));
    return {
      id: definition.id,
      definition,
      tickRate,
      previous: { ...current },
      current,
      pose: current,
    };
  });
  return run;
}

/** Advance one or more fixed simulation ticks. */
export function stepKinematicRun(run, tickCount = 1) {
  if (!run || !Array.isArray(run.platforms)) throw new TypeError('Invalid kinematic run');
  const count = Math.trunc(finite(tickCount, 1));
  if (count < 0) throw new RangeError('Kinematic tick count cannot be negative');
  for (let step = 0; step < count; step++) {
    run.tick++;
    for (const platform of run.platforms) {
      platform.previous = platform.current;
      platform.current = poseAtNormalised(platform.definition, run.tick, run.tickRate);
      platform.pose = platform.current;
    }
  }
  return run;
}

/** Reset a run without reallocating its platform records. */
export function resetKinematicRun(run, tick = run?.startTick ?? 0) {
  if (!run || !Array.isArray(run.platforms)) throw new TypeError('Invalid kinematic run');
  run.tick = Math.trunc(finite(tick));
  for (const platform of run.platforms) {
    const current = stationaryPose(
      poseAtNormalised(platform.definition, run.tick, run.tickRate),
    );
    platform.previous = { ...current };
    platform.current = current;
    platform.pose = current;
  }
  return run;
}

export function getKinematicPlatform(run, id) {
  return run.platforms.find((platform) => platform.id === id) || null;
}

/**
 * Interpolate a renderer-facing rectangle between the previous/current tick.
 * Physics must always use the un-interpolated runtime poses.
 */
export function sampleKinematicPlatform(platform, alpha = 1) {
  const amount = clamp(finite(alpha, 1), 0, 1);
  const previous = platform.previous || platform.current || platform;
  const current = platform.current || platform;
  const x = previous.x + (current.x - previous.x) * amount;
  const y = previous.y + (current.y - previous.y) * amount;
  const width = current.width;
  const height = current.height;
  return {
    id: platform.id || current.id,
    x,
    y,
    width,
    height,
    left: x - width * 0.5,
    right: x + width * 0.5,
    top: y - height * 0.5,
    bottom: y + height * 0.5,
    motionProgress: previous.motionProgress
      + (current.motionProgress - previous.motionProgress) * amount,
    surface: current.surface,
    render: platform.definition?.render || {},
  };
}

function circlePrevious(circle, axis, tickRate) {
  const verletKey = axis === 'x' ? 'ox' : 'oy';
  const previousKey = axis === 'x' ? 'prevX' : 'prevY';
  const velocityKey = axis === 'x' ? 'vx' : 'vy';
  if (Number.isFinite(circle[verletKey])) return circle[verletKey];
  if (Number.isFinite(circle[previousKey])) return circle[previousKey];
  if (Number.isFinite(circle[velocityKey])) {
    return circle[axis] - circle[velocityKey] / tickRate;
  }
  return circle[axis];
}

function setCirclePrevious(circle, x, y) {
  let wroteX = false;
  let wroteY = false;
  if ('ox' in circle) { circle.ox = x; wroteX = true; }
  if ('oy' in circle) { circle.oy = y; wroteY = true; }
  if ('prevX' in circle) { circle.prevX = x; wroteX = true; }
  if ('prevY' in circle) { circle.prevY = y; wroteY = true; }
  if (!wroteX) circle.prevX = x;
  if (!wroteY) circle.prevY = y;
}

function limitVector(x, y, limit) {
  const magnitude2 = x * x + y * y;
  if (!Number.isFinite(limit) || limit <= 0 || magnitude2 <= limit * limit) return { x, y };
  const scale = limit / Math.sqrt(magnitude2);
  return { x: x * scale, y: y * scale };
}

function posePair(platform) {
  const current = platform.current || platform;
  if (!current || !Number.isFinite(current.top)) {
    throw new TypeError('Platform needs a runtime pose or current/previous pose pair');
  }
  if (platform.previous) return { current, previous: platform.previous };
  const dx = finite(current.dx);
  const dy = finite(current.dy);
  return {
    current,
    previous: {
      ...current,
      x: current.x - dx,
      y: current.y - dy,
      left: current.left - dx,
      right: current.right - dx,
      top: current.top - dy,
      bottom: current.bottom - dy,
    },
  };
}

function overlapsCircleX(x, radius, left, right, slop) {
  return x + radius >= left - slop && x - radius <= right + slop;
}

/**
 * Resolve a circle against the one-way top of a rectangular moving platform.
 *
 * The circle may use Verlet `ox/oy`, `prevX/prevY`, or `vx/vy`. On contact its
 * y position is snapped to the platform top and its inherited surface velocity
 * is written back in the same representation. The returned contact can be kept
 * as gameplay metadata; null means no top contact.
 */
export function resolveCircleOnPlatform(circle, platform, options = {}) {
  if (!circle || !Number.isFinite(circle.x) || !Number.isFinite(circle.y)) {
    throw new TypeError('Circle needs finite x and y coordinates');
  }
  const radius = positive(circle.radius ?? circle.r, 0);
  if (!radius) throw new RangeError('Circle needs a positive radius or r');

  const { current, previous } = posePair(platform);
  const tickRate = positive(
    options.tickRate,
    positive(platform.tickRate, finite(current.tickRate, KINEMATIC_TICK_RATE)),
  );
  const skin = Math.max(0, finite(options.skin, 0.75));
  const supportSlop = Math.max(skin, finite(options.supportSlop, 2.5));
  const horizontalSlop = Math.max(0, finite(options.horizontalSlop, 0.5));
  const maxPenetration = positive(options.maxPenetration, radius + 8);
  const maxCarrySpeed = positive(options.maxCarrySpeed, 900);
  const maxLaunchSpeed = positive(options.maxLaunchSpeed, 720);
  const tangentRetention = clamp(finite(options.tangentRetention, 0), 0, 1);

  const previousX = circlePrevious(circle, 'x', tickRate);
  const previousY = circlePrevious(circle, 'y', tickRate);
  const currentX = circle.x;
  const currentY = circle.y;
  const previousBottom = previousY + radius;
  const currentBottom = currentY + radius;
  const previousRelative = previousBottom - previous.top;
  const currentRelative = currentBottom - current.top;
  const relativeDelta = currentRelative - previousRelative;

  const previousOverlap = overlapsCircleX(
    previousX, radius, previous.left, previous.right, horizontalSlop,
  );
  const currentOverlap = overlapsCircleX(
    currentX, radius, current.left, current.right, horizontalSlop,
  );
  const wasSupported = previousOverlap
    && Math.abs(previousRelative) <= supportSlop
    && previousY <= previous.top + supportSlop;
  const resting = wasSupported
    && currentOverlap
    && currentRelative >= -skin
    && currentRelative <= maxPenetration;

  let swept = false;
  let toi = 1;
  if (!resting
      && previousRelative <= skin
      && currentRelative >= -skin
      && relativeDelta > EPSILON
      && previousY <= previous.top + supportSlop) {
    toi = clamp(-previousRelative / relativeDelta, 0, 1);
    const hitX = previousX + (currentX - previousX) * toi;
    const hitLeft = previous.left + (current.left - previous.left) * toi;
    const hitRight = previous.right + (current.right - previous.right) * toi;
    swept = overlapsCircleX(hitX, radius, hitLeft, hitRight, horizontalSlop);
  }
  if (!resting && !swept) return null;

  const rawVx = Number.isFinite(current.vx)
    ? current.vx : (current.x - previous.x) * tickRate;
  const rawVy = Number.isFinite(current.vy)
    ? current.vy : (current.y - previous.y) * tickRate;
  const limited = limitVector(rawVx, rawVy, maxCarrySpeed);
  const inheritedVx = limited.x;
  const inheritedVy = clamp(limited.y, -maxLaunchSpeed, maxLaunchSpeed);
  const circleVx = (currentX - previousX) * tickRate;
  const targetVx = inheritedVx + (circleVx - inheritedVx) * tangentRetention;
  const targetVy = inheritedVy;

  let carryX = 0;
  if (wasSupported) {
    carryX = targetVx / tickRate - (currentX - previousX);
    circle.x += carryX;
  }
  circle.y = current.top - radius;
  setCirclePrevious(
    circle,
    circle.x - targetVx / tickRate,
    circle.y - targetVy / tickRate,
  );
  if ('vx' in circle) circle.vx = targetVx;
  if ('vy' in circle) circle.vy = targetVy;

  return {
    platformId: platform.id || current.id,
    kind: resting ? 'resting' : 'swept',
    toi,
    normalX: 0,
    normalY: -1,
    contactX: previousX + (currentX - previousX) * toi,
    contactY: previous.top + (current.top - previous.top) * toi,
    penetration: Math.max(0, currentRelative),
    surfaceVelocity: { x: rawVx, y: rawVy },
    inheritedVelocity: { x: inheritedVx, y: inheritedVy },
    carry: { x: carryX, y: circle.y - currentY },
    pose: current,
  };
}

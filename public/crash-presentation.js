// Moto Rush X3 crash presentation policy.
//
// This module is deliberately DOM-free and presentation-only. It normalizes
// crash art direction, supplies stateless seeded noise for effects, and frames
// detached ragdoll snapshots without changing run, bike, or replay authority.

const BASE_VIEW_HEIGHT = 460;
const UINT32_RANGE = 0x100000000;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function freezeImpulse(radial, lift, spin) {
  return Object.freeze({ radial, lift, spin });
}

function freezeProfile(label, accent, riderImpulse, bikeImpulse, releaseTethers, impactGlyph) {
  return Object.freeze({
    label,
    accent,
    riderImpulse: freezeImpulse(...riderImpulse),
    bikeImpulse: freezeImpulse(...bikeImpulse),
    releaseTethers: Object.freeze([...releaseTethers]),
    impactGlyph,
  });
}

export const CRASH_CAUSE_IDS = Object.freeze([
  'collision',
  'terrain',
  'platform',
  'saw',
  'spikes',
  'barrel',
  'mace',
  'crusher',
  'tnt',
  'fallout',
]);

// These names and silhouettes are original to Moto Rush X3. The impulse values
// are renderer/simulation setup hints; the authoritative bike is never changed.
export const CRASH_CAUSE_PROFILES = Object.freeze({
  collision: freezeProfile('AXLE BREAK', '#ff7657', [120, 85, 0.35], [84, 48, 0.44], [], '#'),
  terrain: freezeProfile('DIRT BITE', '#e6a15d', [102, 76, 0.27], [72, 44, 0.31], [], '//'),
  platform: freezeProfile('DECK SLAM', '#70d9ff', [114, 90, 0.32], [78, 52, 0.38], [], '[]'),
  saw: freezeProfile('SAW KISS', '#ff5d88', [154, 108, 0.54], [92, 62, 0.61], ['rearHand', 'frontHand'], '*'),
  spikes: freezeProfile('SPIKE CHECK', '#ffcf52', [130, 112, 0.43], [80, 58, 0.47], ['rearFoot', 'frontFoot'], '^'),
  barrel: freezeProfile('DRUM BLAST', '#ff9b45', [194, 148, 0.79], [142, 102, 0.86], ['*'], 'o'),
  mace: freezeProfile('CHAIN HAMMER', '#c4a9ff', [170, 114, 0.65], [120, 76, 0.71], ['rearHand', 'frontHand'], '@'),
  crusher: freezeProfile('PRESS LOCK', '#ff6d6d', [92, 64, 0.22], [62, 40, 0.27], ['*'], 'X'),
  tnt: freezeProfile('REDLINE BURST', '#ff4f38', [240, 190, 0.95], [184, 132, 1.0], ['*'], '!'),
  fallout: freezeProfile('VOID DROP', '#8da0bc', [50, 32, 0.18], [38, 24, 0.2], ['rearFoot', 'frontFoot'], 'v'),
});

export const CRASH_PRESENTATION_LIMITS = Object.freeze({
  maxNodes: 32,
  maxWorldCoordinate: 100000,
  minPoseExtent: 96,
  maxPoseSpan: 720,
  maxNodeRadius: 64,
  minViewHeight: 320,
  maxViewHeight: 1400,
  maxRoll: 0.11,
  maxKick: 18,
  maxShake: 18,
  maxHitstop: 0.08,
  maxFlash: 0.75,
  minSlow: 0.55,
});

const TYPE_ALIASES = Object.freeze({
  ground: 'terrain',
  dirt: 'terrain',
  deck: 'platform',
  lift: 'platform',
  blade: 'saw',
  spike: 'spikes',
  drum: 'barrel',
  chain: 'mace',
  press: 'crusher',
  explosive: 'tnt',
  explosion: 'tnt',
  fall: 'fallout',
  void: 'fallout',
  bounds: 'fallout',
});

function crashType(source) {
  let candidate = '';
  if (typeof source === 'string') candidate = source;
  else if (source && typeof source === 'object') {
    if (typeof source.type === 'string') candidate = source.type;
    else if (typeof source.kind === 'string') candidate = source.kind;
    else if (source.reason && typeof source.reason.type === 'string') candidate = source.reason.type;
  }
  const key = candidate.trim().toLowerCase();
  const aliased = TYPE_ALIASES[key] || key;
  return Object.hasOwn(CRASH_CAUSE_PROFILES, aliased) ? aliased : 'collision';
}

function scaledImpulse(source, intensity) {
  return Object.freeze({
    radial: source.radial * intensity,
    lift: source.lift * intensity,
    spin: source.spin * intensity,
  });
}

/**
 * Returns a detached immutable cause card and ragdoll setup profile.
 * Unknown or malformed causes safely fall back to the collision profile.
 */
export function normalizeCrashCause(source) {
  const type = crashType(source);
  const profile = CRASH_CAUSE_PROFILES[type];
  const sourceObject = source && typeof source === 'object' ? source : null;
  const intensity = clamp(finite(sourceObject?.intensity, 1), 0.25, 2);
  const x = Number.isFinite(sourceObject?.x)
    ? clamp(sourceObject.x, -CRASH_PRESENTATION_LIMITS.maxWorldCoordinate,
      CRASH_PRESENTATION_LIMITS.maxWorldCoordinate)
    : null;
  const y = Number.isFinite(sourceObject?.y)
    ? clamp(sourceObject.y, -CRASH_PRESENTATION_LIMITS.maxWorldCoordinate,
      CRASH_PRESENTATION_LIMITS.maxWorldCoordinate)
    : null;
  return Object.freeze({
    type,
    label: profile.label,
    accent: profile.accent,
    riderImpulse: scaledImpulse(profile.riderImpulse, intensity),
    bikeImpulse: scaledImpulse(profile.bikeImpulse, intensity),
    releaseTethers: Object.freeze([...profile.releaseTethers]),
    impactGlyph: profile.impactGlyph,
    intensity,
    x,
    y,
  });
}

function hashText(hash, text) {
  let output = hash >>> 0;
  for (let index = 0; index < text.length; index++) {
    output ^= text.charCodeAt(index);
    output = Math.imul(output, 0x01000193) >>> 0;
  }
  return output;
}

function hashValue(hash, value, depth, seen) {
  if (value === null) return hashText(hash, 'null;');
  const type = typeof value;
  if (type === 'number') return hashText(hash, Number.isFinite(value) ? `n:${value};` : 'n:0;');
  if (type === 'string') return hashText(hash, `s:${value.length}:${value};`);
  if (type === 'boolean') return hashText(hash, value ? 'b:1;' : 'b:0;');
  if (type === 'undefined') return hashText(hash, 'u;');
  if (type === 'bigint') return hashText(hash, `i:${value.toString()};`);
  if (type !== 'object' || depth >= 3) return hashText(hash, `${type};`);
  if (seen.has(value)) return hashText(hash, 'cycle;');
  seen.add(value);
  let output = hashText(hash, Array.isArray(value) ? '[' : '{');
  if (Array.isArray(value)) {
    const length = Math.min(value.length, 32);
    for (let index = 0; index < length; index++) {
      output = hashValue(output, value[index], depth + 1, seen);
    }
  } else {
    const keys = Object.keys(value).sort().slice(0, 32);
    for (const key of keys) {
      output = hashText(output, `${key}:`);
      output = hashValue(output, value[key], depth + 1, seen);
    }
  }
  seen.delete(value);
  return hashText(output, Array.isArray(value) ? ']' : '}');
}

/** Stable unsigned 32-bit hash for a crash, tick, effect lane, or node id. */
export function hashCrashSeed(...parts) {
  let hash = 0x811c9dc5;
  const seen = new WeakSet();
  for (const part of parts) hash = hashValue(hash, part, 0, seen);
  // Final avalanche keeps neighboring numeric seeds visually unrelated.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b) >>> 0;
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** Stateless deterministic noise in [0, 1), suitable for replacing Math.random in crash FX. */
export function crashNoise(seed, lane = 0) {
  return hashCrashSeed('mrx3-crash-fx', seed, lane) / UINT32_RANGE;
}

/** Stateless deterministic noise in [-1, 1). */
export function crashSignedNoise(seed, lane = 0) {
  return crashNoise(seed, lane) * 2 - 1;
}

function sourceNodes(pose) {
  if (Array.isArray(pose)) return pose;
  return Array.isArray(pose?.nodes) ? pose.nodes : [];
}

/**
 * Measures a detached ragdoll pose while constraining hostile or corrupt data
 * to a compact presentation envelope. The pose is never retained or changed.
 */
export function measureCrashPoseBounds(pose, options = {}) {
  const nodes = sourceNodes(pose);
  const limit = CRASH_PRESENTATION_LIMITS.maxWorldCoordinate;
  const anchorLimit = limit - CRASH_PRESENTATION_LIMITS.maxPoseSpan * 0.5;
  const fallbackX = clamp(finite(options.fallbackX), -anchorLimit, anchorLimit);
  const fallbackY = clamp(finite(options.fallbackY), -anchorLimit, anchorLimit);
  let anchorX = fallbackX;
  let anchorY = fallbackY;
  let anchorFound = Number.isFinite(options.fallbackX) && Number.isFinite(options.fallbackY);
  if (!anchorFound) {
    for (let index = 0; index < Math.min(nodes.length, CRASH_PRESENTATION_LIMITS.maxNodes); index++) {
      if (!Number.isFinite(nodes[index]?.x) || !Number.isFinite(nodes[index]?.y)) continue;
      anchorX = clamp(nodes[index].x, -anchorLimit, anchorLimit);
      anchorY = clamp(nodes[index].y, -anchorLimit, anchorLimit);
      anchorFound = true;
      break;
    }
  }
  const halfSpan = CRASH_PRESENTATION_LIMITS.maxPoseSpan * 0.5;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  let nodeCount = 0;
  const inspected = Math.min(nodes.length, CRASH_PRESENTATION_LIMITS.maxNodes);
  for (let index = 0; index < inspected; index++) {
    const node = nodes[index];
    if (!Number.isFinite(node?.x) || !Number.isFinite(node?.y)) continue;
    const radius = clamp(finite(node.radius), 0, CRASH_PRESENTATION_LIMITS.maxNodeRadius);
    const x = clamp(node.x, anchorX - halfSpan + radius, anchorX + halfSpan - radius);
    const y = clamp(node.y, anchorY - halfSpan + radius, anchorY + halfSpan - radius);
    left = Math.min(left, x - radius);
    top = Math.min(top, y - radius);
    right = Math.max(right, x + radius);
    bottom = Math.max(bottom, y + radius);
    nodeCount++;
  }
  if (!nodeCount) {
    left = anchorX;
    right = anchorX;
    top = anchorY;
    bottom = anchorY;
  }
  const minExtent = CRASH_PRESENTATION_LIMITS.minPoseExtent;
  if (right - left < minExtent) {
    const center = (left + right) * 0.5;
    left = center - minExtent * 0.5;
    right = center + minExtent * 0.5;
  }
  if (bottom - top < minExtent) {
    const center = (top + bottom) * 0.5;
    top = center - minExtent * 0.5;
    bottom = center + minExtent * 0.5;
  }
  const centerX = clamp((left + right) * 0.5, -limit, limit);
  const centerY = clamp((top + bottom) * 0.5, -limit, limit);
  return Object.freeze({
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    centerX,
    centerY,
    nodeCount,
    ignoredNodes: Math.max(0, nodes.length - nodeCount),
  });
}

function safeViewport(viewport) {
  const width = clamp(finite(viewport?.width, 1280), 240, 7680);
  const height = clamp(finite(viewport?.height, 720), 240, 7680);
  return { width, height, aspect: clamp(width / height, 0.35, 3.5) };
}

/**
 * Builds a finite camera/effect policy from a crash snapshot. Reduced Motion
 * intentionally preserves the base zoom and disables every impact transient.
 */
export function buildCrashCameraPolicy(options = {}) {
  const viewport = safeViewport(options.viewport);
  const bounds = measureCrashPoseBounds(options.pose, {
    fallbackX: options.fallbackX,
    fallbackY: options.fallbackY,
  });
  const reducedMotion = options.reducedMotion === true;
  const cause = normalizeCrashCause(options.cause);
  const age = clamp(finite(options.age), 0, 12);
  const baseViewHeight = clamp(finite(options.baseViewHeight, BASE_VIEW_HEIGHT),
    CRASH_PRESENTATION_LIMITS.minViewHeight, CRASH_PRESENTATION_LIMITS.maxViewHeight);
  const compact = viewport.width < 640 || viewport.aspect < 0.8;
  if (reducedMotion) {
    return Object.freeze({
      x: bounds.centerX,
      y: bounds.centerY,
      viewHeight: baseViewHeight,
      viewH: baseViewHeight,
      zoom: 1,
      roll: 0,
      kickX: 0,
      kickY: 0,
      shake: 0,
      hitstop: 0,
      flash: 0,
      slow: 1,
      compact,
      bounds,
    });
  }

  const padding = compact ? 62 : 78;
  const fitHeight = Math.max(bounds.height + padding * 2,
    (bounds.width + padding * 2) / viewport.aspect);
  const viewHeight = clamp(Math.max(baseViewHeight * 0.78, fitHeight),
    CRASH_PRESENTATION_LIMITS.minViewHeight, CRASH_PRESENTATION_LIMITS.maxViewHeight);
  const decay = Math.exp(-age * 5.2);
  const beat = Math.max(0, 1 - age / 0.34);
  const intensity = cause.intensity;
  const tick = Math.floor(age * 120 + 1e-9);
  const seed = hashCrashSeed(options.seed ?? 0, cause.type, tick);
  const kickScale = Math.min(CRASH_PRESENTATION_LIMITS.maxKick, 12 * intensity) * decay;
  const shake = clamp(15 * intensity * decay, 0, CRASH_PRESENTATION_LIMITS.maxShake);
  const roll = clamp(crashSignedNoise(seed, 'roll') * 0.085 * intensity * decay,
    -CRASH_PRESENTATION_LIMITS.maxRoll, CRASH_PRESENTATION_LIMITS.maxRoll);
  const kickX = clamp(crashSignedNoise(seed, 'kick-x') * kickScale,
    -CRASH_PRESENTATION_LIMITS.maxKick, CRASH_PRESENTATION_LIMITS.maxKick);
  const kickY = clamp(crashSignedNoise(seed, 'kick-y') * kickScale,
    -CRASH_PRESENTATION_LIMITS.maxKick, CRASH_PRESENTATION_LIMITS.maxKick);
  const hitstop = clamp(0.075 * intensity - age, 0, CRASH_PRESENTATION_LIMITS.maxHitstop);
  const flash = clamp(0.68 * intensity * Math.max(0, 1 - age / 0.18),
    0, CRASH_PRESENTATION_LIMITS.maxFlash);
  const slow = clamp(1 - beat * 0.42 * Math.min(1.25, intensity),
    CRASH_PRESENTATION_LIMITS.minSlow, 1);
  return Object.freeze({
    x: bounds.centerX,
    y: bounds.centerY - Math.min(42, viewHeight * 0.04),
    viewHeight,
    viewH: viewHeight,
    zoom: clamp(baseViewHeight / viewHeight,
      baseViewHeight / CRASH_PRESENTATION_LIMITS.maxViewHeight,
      baseViewHeight / CRASH_PRESENTATION_LIMITS.minViewHeight),
    roll,
    kickX,
    kickY,
    shake,
    hitstop,
    flash,
    slow,
    compact,
    bounds,
  });
}

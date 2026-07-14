// Deterministic, DOM-free continuous force fields for Moto Rush X3.
//
// Kinetic Looms are non-solid, axis-aligned volumes. Each active field can
// contribute at most once per fixed tick, even if several bike nodes touch it.
// Contributions are sorted by stable id, summed, and applied as one impulse so
// overlap behavior cannot depend on course authoring order.

import { applyImpulse } from './physics.js';

const LIMITS = Object.freeze({
  zones: 512,
  coordinate: 10_000_000,
  size: 1_000_000,
  acceleration: 20_000,
  angularAcceleration: 60,
  idLength: 96,
  renderLength: 96,
});

const KINDS = new Set(['kinetic-loom', 'flow']);

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function finite(value, label, maximum) {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  if (Math.abs(value) > maximum) {
    throw new RangeError(`${label} exceeds the supported range`);
  }
  return value;
}

function positive(value, label) {
  const result = finite(value, label, LIMITS.size);
  if (result <= 0) throw new RangeError(`${label} must be greater than zero`);
  return result;
}

function text(value, fallback, label, maximum = LIMITS.renderLength) {
  const result = String(value ?? fallback).trim();
  if (!result) throw new TypeError(`${label} must be a non-empty string`);
  if (result.length > maximum) throw new RangeError(`${label} is too long`);
  return result;
}

function normalizeRender(value, index) {
  if (value === undefined) value = {};
  assertObject(value, `force zone ${index}.render`);
  return Object.freeze({
    model: text(value.model, 'kinetic-loom', `force zone ${index}.render.model`),
    palette: text(value.palette, 'cyan', `force zone ${index}.render.palette`, 32),
    label: text(value.label, 'VECTOR', `force zone ${index}.render.label`),
  });
}

function normalizeZone(value, index) {
  const source = assertObject(value, `force zone ${index}`);
  const id = text(source.id, `force-zone-${index}`, `force zone ${index}.id`, LIMITS.idLength);
  const kind = text(source.kind, 'kinetic-loom', `force zone ${index}.kind`, 48);
  if (!KINDS.has(kind)) throw new RangeError(`force zone ${index}.kind is unsupported`);
  const x = finite(source.x, `force zone ${index}.x`, LIMITS.coordinate);
  const y = finite(source.y, `force zone ${index}.y`, LIMITS.coordinate);
  const width = positive(source.width, `force zone ${index}.width`);
  const height = positive(source.height, `force zone ${index}.height`);
  const acceleration = assertObject(source.acceleration, `force zone ${index}.acceleration`);
  const ax = finite(acceleration.x, `force zone ${index}.acceleration.x`, LIMITS.acceleration);
  const ay = finite(acceleration.y, `force zone ${index}.acceleration.y`, LIMITS.acceleration);
  const angularAcceleration = source.angularAcceleration === undefined ? 0
    : finite(source.angularAcceleration, `force zone ${index}.angularAcceleration`, LIMITS.angularAcceleration);
  const bounds = Object.freeze({
    left: x - width * 0.5,
    right: x + width * 0.5,
    top: y - height * 0.5,
    bottom: y + height * 0.5,
  });
  return Object.freeze({
    id,
    kind,
    x,
    y,
    width,
    height,
    acceleration: Object.freeze({ x: ax, y: ay }),
    angularAcceleration,
    enabled: source.enabled !== false,
    bounds,
    render: normalizeRender(source.render, index),
  });
}

/** Clone, validate, freeze, and stably order authored force fields. */
export function createForceZoneField(definitions = []) {
  if (!Array.isArray(definitions)) throw new TypeError('force zone definitions must be an array');
  if (definitions.length > LIMITS.zones) {
    throw new RangeError(`force zone definitions exceed the ${LIMITS.zones} zone limit`);
  }
  const zones = definitions.map(normalizeZone);
  const ids = new Set();
  for (const zone of zones) {
    if (ids.has(zone.id)) throw new RangeError(`duplicate force zone id: ${zone.id}`);
    ids.add(zone.id);
  }
  zones.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return Object.freeze({ schema: 1, zones: Object.freeze(zones) });
}

function circleTouchesBounds(x, y, radius, bounds) {
  const nearestX = Math.max(bounds.left, Math.min(bounds.right, x));
  const nearestY = Math.max(bounds.top, Math.min(bounds.bottom, y));
  const dx = x - nearestX, dy = y - nearestY;
  return dx * dx + dy * dy <= radius * radius;
}

// Liang-Barsky point-segment/AABB test against the authored rectangle.
function segmentHitsBounds(x0, y0, x1, y1, bounds) {
  const { left, right, top, bottom } = bounds;
  const dx = x1 - x0, dy = y1 - y0;
  let t0 = 0, t1 = 1;
  const clip = (p, q) => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, x0 - left) && clip(dx, right - x0)
    && clip(-dy, y0 - top) && clip(dy, bottom - y0) && t0 <= t1;
}

function pointSegmentDistanceSquared(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-24) {
    const ox = px - x0, oy = py - y0;
    return ox * ox + oy * oy;
  }
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / lengthSquared));
  const ox = px - (x0 + dx * t), oy = py - (y0 + dy * t);
  return ox * ox + oy * oy;
}

// Exact continuous circle/AABB contact is equivalent to the minimum distance
// from the node-center sweep to the rectangle being at most the node radius.
// Endpoints cover edge interiors, the segment test covers a direct crossing,
// and corner-to-segment distances cover the rounded Minkowski corners without
// the false positives produced by a rectangular radius expansion.
function sweptCircleHitsBounds(x0, y0, x1, y1, radius, bounds) {
  if (circleTouchesBounds(x0, y0, radius, bounds)
      || circleTouchesBounds(x1, y1, radius, bounds)
      || segmentHitsBounds(x0, y0, x1, y1, bounds)) return true;
  const radiusSquared = radius * radius;
  return pointSegmentDistanceSquared(bounds.left, bounds.top, x0, y0, x1, y1) <= radiusSquared
    || pointSegmentDistanceSquared(bounds.right, bounds.top, x0, y0, x1, y1) <= radiusSquared
    || pointSegmentDistanceSquared(bounds.left, bounds.bottom, x0, y0, x1, y1) <= radiusSquared
    || pointSegmentDistanceSquared(bounds.right, bounds.bottom, x0, y0, x1, y1) <= radiusSquared;
}

function bikeNodeSamples(bike) {
  assertObject(bike, 'bike');
  const cfg = assertObject(bike.cfg, 'bike.cfg');
  const definitions = [
    ['rear', bike.rear, cfg.wheelR],
    ['front', bike.front, cfg.wheelR],
    ['head', bike.head, cfg.headR],
  ];
  return definitions.map(([id, node, rawRadius]) => {
    assertObject(node, `bike.${id}`);
    const x = finite(node.x, `bike.${id}.x`, LIMITS.coordinate);
    const y = finite(node.y, `bike.${id}.y`, LIMITS.coordinate);
    const radius = positive(rawRadius, `bike.${id} radius`);
    const framePrevious = bike.framePrevious?.[id];
    const x0 = Number.isFinite(framePrevious?.x) ? framePrevious.x
      : Number.isFinite(node.ox) ? node.ox : x;
    const y0 = Number.isFinite(framePrevious?.y) ? framePrevious.y
      : Number.isFinite(node.oy) ? node.oy : y;
    finite(x0, `bike.${id} previous x`, LIMITS.coordinate);
    finite(y0, `bike.${id} previous y`, LIMITS.coordinate);
    return { id, x0, y0, x1: x, y1: y, radius };
  });
}

function detachedApplication(zone, dt, contact) {
  return {
    type: 'force-zone',
    id: zone.id,
    kind: zone.kind,
    x: zone.x,
    y: zone.y,
    width: zone.width,
    height: zone.height,
    bounds: { ...zone.bounds },
    acceleration: { ...zone.acceleration },
    angularAcceleration: zone.angularAcceleration,
    impulse: {
      x: zone.acceleration.x * dt,
      y: zone.acceleration.y * dt,
      angular: zone.angularAcceleration * dt,
    },
    entered: !contact.previousInside && contact.touched,
    exited: (contact.previousInside && !contact.currentInside)
      || (!contact.previousInside && !contact.currentInside && contact.sweptOnly),
    swept: contact.sweptOnly,
    hitNodes: [...contact.hitNodes],
  };
}

function emptyResult() {
  return { applied: false, applications: [], impulse: { x: 0, y: 0, angular: 0 } };
}

/**
 * Apply all active fields touched during this frame. The returned presentation
 * records are detached; mutating them cannot alter the field or bike.
 */
export function stepForceZones(field, bike, dt) {
  assertObject(field, 'force zone field');
  if (!Array.isArray(field.zones)) throw new TypeError('force zone field.zones must be an array');
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) {
    throw new RangeError('force zone dt must be greater than zero and at most 0.1 seconds');
  }
  let hasActiveZone = false;
  for (const zone of field.zones) {
    if (zone?.enabled !== false) { hasActiveZone = true; break; }
  }
  if (!hasActiveZone || bike?.crashed === true) return emptyResult();
  const samples = bikeNodeSamples(bike);
  const applications = [];

  for (const zone of field.zones) {
    if (zone?.enabled === false) continue;
    const hitNodes = [];
    let previousInside = false, currentInside = false, swept = false;
    for (const sample of samples) {
      const previous = circleTouchesBounds(sample.x0, sample.y0, sample.radius, zone.bounds);
      const current = circleTouchesBounds(sample.x1, sample.y1, sample.radius, zone.bounds);
      const sweep = sweptCircleHitsBounds(sample.x0, sample.y0, sample.x1, sample.y1,
        sample.radius, zone.bounds);
      if (previous || current || sweep) hitNodes.push(sample.id);
      previousInside = previousInside || previous;
      currentInside = currentInside || current;
      swept = swept || sweep;
    }
    const touched = previousInside || currentInside || swept;
    if (!touched) continue;
    applications.push(detachedApplication(zone, dt, {
      previousInside,
      currentInside,
      touched,
      sweptOnly: swept && !previousInside && !currentInside,
      hitNodes,
    }));
  }

  if (applications.length === 0) return emptyResult();
  let ix = 0, iy = 0, angular = 0;
  for (const application of applications) {
    ix += application.impulse.x;
    iy += application.impulse.y;
    angular += application.impulse.angular;
  }
  const applied = applyImpulse(bike, ix, iy, angular);
  return { applied, applications, impulse: { x: ix, y: iy, angular } };
}

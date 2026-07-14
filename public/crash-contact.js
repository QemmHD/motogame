// crash-contact.js — deterministic presentation-only ragdoll contact fields.
//
// Crash Theater must not keep live references to authoritative course state.
// This module snapshots terrain collision segments and the current pose of each
// kinematic deck, then exposes a DOM-free query for the ragdoll simulation.
// Moving decks become frozen one-way top capsules for the life of the field.

import { terrainContact } from './physics.js';

export const CRASH_CONTACT_LIMITS = Object.freeze({
  maxTerrainSegments: 8192,
  maxPlatforms: 512,
  maxCoordinate: 10_000_000,
  maxDimension: 1_000_000,
  maxRadius: 2048,
});

export const CRASH_SURFACE_FRICTION = Object.freeze({
  dirt: 0.38,
  grass: 0.42,
  gravel: 0.44,
  grated: 0.46,
  metal: 0.24,
  ice: 0.08,
  boost: 0.27,
  bouncy: 0.2,
});

const PRIVATE_FIELDS = new WeakMap();
const EPSILON = 1e-7;
const DEFAULT_FRICTION = 0.34;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function safeString(value, fallback, maxLength = 64) {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).slice(0, maxLength);
}

function validCoordinate(value) {
  return Number.isFinite(value) && Math.abs(value) <= CRASH_CONTACT_LIMITS.maxCoordinate;
}

function validDimension(value) {
  return Number.isFinite(value) && value > EPSILON
    && value <= CRASH_CONTACT_LIMITS.maxDimension;
}

/** Return a stable friction coefficient for known and custom course surfaces. */
export function crashSurfaceFriction(surface, explicitFriction) {
  if (Number.isFinite(explicitFriction)) return clamp(explicitFriction, 0, 1);
  const key = safeString(surface, 'dirt').toLowerCase();
  return CRASH_SURFACE_FRICTION[key] ?? DEFAULT_FRICTION;
}

function cloneTerrain(source) {
  const sourceSegments = Array.isArray(source?.segments) ? source.segments : [];
  const segments = [];
  const sourceIndices = [];
  const sourceEnabled = [];
  const count = Math.min(sourceSegments.length, CRASH_CONTACT_LIMITS.maxTerrainSegments);

  for (let index = 0; index < count; index++) {
    const segment = sourceSegments[index];
    if (!segment || !validCoordinate(segment.ax) || !validCoordinate(segment.ay)
        || !validCoordinate(segment.bx) || !validCoordinate(segment.by)) continue;
    const dx = segment.bx - segment.ax;
    const dy = segment.by - segment.ay;
    if (dx * dx + dy * dy < EPSILON * EPSILON) continue;

    const surface = safeString(segment.surface, 'dirt');
    const surfaceStrength = clamp(finite(segment.surfaceStrength, 1), -1000, 1000);
    const oneWay = segment.oneWay !== false;
    segments.push({
      ax: segment.ax,
      ay: segment.ay,
      bx: segment.bx,
      by: segment.by,
      minx: Math.min(segment.ax, segment.bx),
      maxx: Math.max(segment.ax, segment.bx),
      surface,
      surfaceStrength,
      oneWay,
    });
    sourceIndices.push(index);
    sourceEnabled.push(source?.enabled ? Boolean(source.enabled[index]) : true);
  }

  // A single broad-phase bucket makes hostile coordinate ranges allocation-safe
  // while retaining terrainContact's exact segment math and stable source order.
  // The hard segment limit bounds the worst-case query independently of extent.
  const enabled = new Uint8Array(segments.length);
  for (let index = 0; index < sourceEnabled.length; index++) {
    enabled[index] = sourceEnabled[index] ? 1 : 0;
  }
  const terrain = {
    segments,
    buckets: [segments.map((_, index) => index)],
    bi: () => 0,
    chains: [],
    minX: 0,
    maxX: 1,
    enabled,
    seen: new Uint32Array(segments.length),
    seenToken: 0,
  };
  return { terrain, sourceIndices };
}

function platformRectangle(rawPlatform, index) {
  const pose = rawPlatform?.current ?? rawPlatform?.pose ?? rawPlatform;
  if (!pose || typeof pose !== 'object') return null;

  const width = finite(pose.width, finite(rawPlatform?.definition?.width));
  const height = finite(pose.height, finite(rawPlatform?.definition?.height));
  if (!validDimension(width) || !validDimension(height)) return null;

  const x = finite(pose.x, NaN);
  const y = finite(pose.y, NaN);
  const left = Number.isFinite(pose.left) ? pose.left : x - width * 0.5;
  const right = Number.isFinite(pose.right) ? pose.right : x + width * 0.5;
  const top = Number.isFinite(pose.top) ? pose.top : y - height * 0.5;
  const bottom = Number.isFinite(pose.bottom) ? pose.bottom : y + height * 0.5;
  if (![left, right, top, bottom].every(validCoordinate)
      || right - left <= EPSILON || bottom - top <= EPSILON) return null;

  const surface = safeString(
    pose.surface ?? rawPlatform?.definition?.surface,
    'metal',
  );
  const surfaceStrength = clamp(finite(
    pose.surfaceStrength,
    finite(rawPlatform?.definition?.surfaceStrength, 1),
  ), -1000, 1000);
  const explicitFriction = pose.friction ?? rawPlatform?.definition?.friction;
  return Object.freeze({
    id: safeString(rawPlatform?.id ?? pose.id, `platform-${index}`, 96),
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
    surface,
    surfaceStrength,
    friction: crashSurfaceFriction(surface, explicitFriction),
  });
}

/**
 * Build a detached contact field at crash entry.
 *
 * The returned public record and all platform records are frozen. Mutable
 * terrain-query scratch arrays live in private module state and never alias the
 * authoritative terrain's `seen`, `enabled`, buckets, chains, or segments.
 */
export function createCrashContactField(terrainSource, kinematicRun) {
  const terrainSnapshot = cloneTerrain(terrainSource);
  const sourcePlatforms = Array.isArray(kinematicRun?.platforms)
    ? kinematicRun.platforms
    : Array.isArray(kinematicRun) ? kinematicRun : [];
  const platforms = [];
  const count = Math.min(sourcePlatforms.length, CRASH_CONTACT_LIMITS.maxPlatforms);
  for (let index = 0; index < count; index++) {
    const platform = platformRectangle(sourcePlatforms[index], index);
    if (platform) platforms.push(platform);
  }
  Object.freeze(platforms);

  const field = Object.freeze({
    kind: 'crash-contact-field',
    terrainSegmentCount: terrainSnapshot.sourceIndices.length,
    platformCount: platforms.length,
    platforms,
  });
  PRIVATE_FIELDS.set(field, {
    terrain: terrainSnapshot.terrain,
    terrainSourceIndices: terrainSnapshot.sourceIndices,
    platforms,
  });
  return field;
}

function terrainHit(privateField, x, y, radius) {
  const hit = terrainContact(privateField.terrain, x, y, radius);
  if (!hit) return null;
  const sourceSegIdx = privateField.terrainSourceIndices[hit.segIdx];
  return {
    ...hit,
    segIdx: sourceSegIdx,
    kind: 'terrain',
    friction: crashSurfaceFriction(hit.surface),
  };
}

function stationaryTopHit(platform, x, y, radius) {
  // A one-way top cannot recover a circle whose centre is already underneath.
  if (y > platform.top + EPSILON) return null;
  const closestX = clamp(x, platform.left, platform.right);
  const dx = x - closestX;
  const dy = y - platform.top;
  const distanceSquared = dx * dx + dy * dy;
  if (distanceSquared > radius * radius + EPSILON) return null;

  const distance = Math.sqrt(Math.max(0, distanceSquared));
  let nx = 0;
  let ny = -1;
  if (distance > EPSILON) {
    nx = dx / distance;
    ny = dy / distance;
  }
  // The capsule's side tangent is deliberately not a wall.
  if (ny > EPSILON) return null;
  const penetration = Math.max(EPSILON, radius - distance);
  return { nx, ny, pen: penetration, swept: false, toi: 1 };
}

function lineSweepHit(platform, oldX, oldY, x, y, radius) {
  const deltaX = x - oldX;
  const deltaY = y - oldY;
  if (deltaY <= EPSILON) return null;
  const contactY = platform.top - radius;
  const toi = (contactY - oldY) / deltaY;
  if (toi < -EPSILON || toi > 1 + EPSILON) return null;
  const boundedToi = clamp(toi, 0, 1);
  const contactX = oldX + deltaX * boundedToi;
  if (contactX < platform.left - EPSILON || contactX > platform.right + EPSILON) return null;
  return { nx: 0, ny: -1, toi: boundedToi };
}

function endpointSweepHit(platform, endpointX, oldX, oldY, x, y, radius) {
  const deltaX = x - oldX;
  const deltaY = y - oldY;
  const originX = oldX - endpointX;
  const originY = oldY - platform.top;
  const a = deltaX * deltaX + deltaY * deltaY;
  if (a <= EPSILON * EPSILON) return null;
  const b = 2 * (originX * deltaX + originY * deltaY);
  const c = originX * originX + originY * originY - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;

  const root = Math.sqrt(Math.max(0, discriminant));
  const candidates = [(-b - root) / (2 * a), (-b + root) / (2 * a)];
  for (const rawToi of candidates) {
    if (rawToi < -EPSILON || rawToi > 1 + EPSILON) continue;
    const toi = clamp(rawToi, 0, 1);
    const contactX = oldX + deltaX * toi;
    const contactY = oldY + deltaY * toi;
    const nx = (contactX - endpointX) / radius;
    const ny = (contactY - platform.top) / radius;
    // Only the rounded upper cap is solid. Require motion into that cap.
    if (ny > EPSILON || deltaX * nx + deltaY * ny >= -EPSILON) continue;
    return { nx, ny, toi };
  }
  return null;
}

function sweptTopHit(platform, oldX, oldY, x, y, radius) {
  const deltaX = x - oldX;
  const deltaY = y - oldY;
  if (deltaY <= EPSILON || oldY > platform.top + EPSILON) return null;

  // If the prior pose was already in shallow top overlap, retain the top-side
  // classification and recover the new downward penetration continuously.
  const priorOverlap = stationaryTopHit(platform, oldX, oldY, radius);
  if (priorOverlap) {
    const approach = deltaX * priorOverlap.nx + deltaY * priorOverlap.ny;
    if (approach < -EPSILON) {
      return {
        nx: priorOverlap.nx,
        ny: priorOverlap.ny,
        pen: clamp(priorOverlap.pen - approach, EPSILON, radius * 8),
        swept: true,
        toi: 0,
      };
    }
  }

  const candidates = [
    lineSweepHit(platform, oldX, oldY, x, y, radius),
    endpointSweepHit(platform, platform.left, oldX, oldY, x, y, radius),
    endpointSweepHit(platform, platform.right, oldX, oldY, x, y, radius),
  ].filter(Boolean).sort((a, b) => a.toi - b.toi);
  const first = candidates[0];
  if (!first) return null;

  const remaining = 1 - first.toi;
  const projectedOvershoot = -(deltaX * first.nx + deltaY * first.ny) * remaining;
  return {
    nx: first.nx,
    ny: first.ny,
    pen: clamp(Math.max(EPSILON, projectedOvershoot), EPSILON, radius * 8),
    swept: true,
    toi: first.toi,
  };
}

function platformHit(platform, x, y, radius, node) {
  const oldX = validCoordinate(node?.oldX) ? node.oldX : x;
  const oldY = validCoordinate(node?.oldY) ? node.oldY : y;
  const moved = Math.abs(oldX - x) > EPSILON || Math.abs(oldY - y) > EPSILON;
  const swept = moved ? sweptTopHit(platform, oldX, oldY, x, y, radius) : null;
  // A node that started beneath the deck may pass upward through it, but it
  // must not be mistaken for a stationary shallow overlap at the end pose.
  const projection = swept ?? (moved && oldY > platform.top + EPSILON
    ? null
    : stationaryTopHit(platform, x, y, radius));
  if (!projection) return null;
  return {
    ...projection,
    kind: 'platform',
    platformId: platform.id,
    surface: platform.surface,
    surfaceStrength: platform.surfaceStrength,
    friction: platform.friction,
  };
}

/**
 * Query the deepest terrain/platform contact for a ragdoll node.
 * Invalid fields, coordinates, radii, and malformed previous-node poses are
 * safe no-ops. The optional node's oldX/oldY enable continuous deck sweeps.
 */
export function queryCrashContact(field, x, y, radius, node = null) {
  const privateField = PRIVATE_FIELDS.get(field);
  if (!privateField || !validCoordinate(x) || !validCoordinate(y)
      || !Number.isFinite(radius) || radius <= 0
      || radius > CRASH_CONTACT_LIMITS.maxRadius) return null;

  let best = terrainHit(privateField, x, y, radius);
  for (const platform of privateField.platforms) {
    const hit = platformHit(platform, x, y, radius, node);
    if (hit && (!best || hit.pen > best.pen)) best = hit;
  }
  return best;
}

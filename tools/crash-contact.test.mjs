import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CRASH_CONTACT_LIMITS,
  crashSurfaceFriction,
  createCrashContactField,
  queryCrashContact,
} from '../public/crash-contact.js';
import { createKinematicRun, stepKinematicRun } from '../public/kinematics.js';
import { buildTerrain } from '../public/physics.js';

function staticDeck(overrides = {}) {
  return createKinematicRun([{
    id: 'frozen-deck',
    x: 100,
    y: 110,
    width: 200,
    height: 20,
    surface: 'grated',
    motion: { kind: 'static' },
    ...overrides,
  }]);
}

test('high-speed downward sweeps cannot tunnel through a frozen platform top', () => {
  const field = createCrashContactField(null, staticDeck());
  const node = { oldX: 100, oldY: 20 };
  const hit = queryCrashContact(field, 100, 180, 10, node);

  assert.ok(hit);
  assert.equal(hit.kind, 'platform');
  assert.equal(hit.platformId, 'frozen-deck');
  assert.equal(hit.surface, 'grated');
  assert.equal(hit.swept, true);
  assert.ok(Math.abs(hit.toi - 0.4375) < 1e-9);
  assert.deepEqual([hit.nx, hit.ny], [0, -1]);
  assert.ok(hit.pen > 0 && hit.pen <= 80);

  const shallowStart = queryCrashContact(field, 100, 125, 10, { oldX: 100, oldY: 95 });
  assert.equal(shallowStart?.kind, 'platform');
  assert.equal(shallowStart.swept, true);
  assert.deepEqual([shallowStart.nx, shallowStart.ny], [0, -1]);
});

test('rounded deck edges use the circle radius instead of an expanded square', () => {
  const field = createCrashContactField(null, staticDeck());
  // Deck top is y=100 and right edge is x=200. At y=95, a radius-10
  // circle reaches sqrt(10^2 - 5^2) horizontally around the rounded corner.
  const inside = queryCrashContact(field, 208.6, 95, 10);
  const outside = queryCrashContact(field, 208.8, 95, 10);

  assert.equal(inside?.kind, 'platform');
  assert.ok(inside.nx > 0 && inside.ny < 0);
  assert.equal(outside, null);
});

test('one-way tops never collide with stationary or upward-moving nodes underneath', () => {
  const field = createCrashContactField(null, staticDeck());
  assert.equal(queryCrashContact(field, 100, 105, 10), null);
  assert.equal(queryCrashContact(field, 100, 80, 10, { oldX: 100, oldY: 145 }), null);
  assert.equal(queryCrashContact(field, 100, 95, 10, { oldX: 100, oldY: 145 }), null);
  assert.equal(queryCrashContact(field, 215, 100, 10, { oldX: 215, oldY: 140 }), null);
});

test('stationary shallow overlap is projected without requiring previous-node state', () => {
  const field = createCrashContactField(null, staticDeck());
  const hit = queryCrashContact(field, 100, 95, 10);
  assert.equal(hit?.kind, 'platform');
  assert.equal(hit.swept, false);
  assert.equal(hit.pen, 5);
  assert.deepEqual([hit.nx, hit.ny], [0, -1]);
});

test('terrain contact behavior retains source segment identity and surface metadata', () => {
  const terrain = buildTerrain([[
    { x: 0, y: 100, surface: 'boost', surfaceStrength: 0.72 },
    { x: 200, y: 100, surface: 'boost', surfaceStrength: 0.72 },
  ]]);
  const field = createCrashContactField(terrain, null);
  const hit = queryCrashContact(field, 80, 95, 10);

  assert.equal(hit?.kind, 'terrain');
  assert.equal(hit.segIdx, 0);
  assert.equal(hit.surface, 'boost');
  assert.equal(hit.surfaceStrength, 0.72);
  assert.equal(hit.friction, crashSurfaceFriction('boost'));
  assert.equal(hit.pen, 5);
});

test('field snapshots are detached, frozen, and unaffected by later source motion', () => {
  const authored = [{
    id: 'moving-lift', x: 300, y: 220, width: 140, height: 18,
    surface: 'metal', motion: { kind: 'vertical-sine', amplitude: 70, period: 2 },
  }];
  const authoredBefore = structuredClone(authored);
  const run = createKinematicRun(authored);
  const terrain = buildTerrain([[
    { x: -50, y: 400, surface: 'ice' },
    { x: 500, y: 400, surface: 'ice' },
  ]]);
  const terrainSegmentsBefore = structuredClone(terrain.segments);
  const enabledBefore = [...terrain.enabled];
  const seenTokenBefore = terrain.seenToken;
  const field = createCrashContactField(terrain, run);
  const frozenTop = field.platforms[0].top;

  assert.equal(Object.isFrozen(field), true);
  assert.equal(Object.isFrozen(field.platforms), true);
  assert.equal(Object.isFrozen(field.platforms[0]), true);
  assert.notStrictEqual(field.platforms[0], run.platforms[0].current);
  assert.equal(queryCrashContact(field, 300, frozenTop - 5, 10)?.kind, 'platform');
  stepKinematicRun(run, 30);

  assert.notEqual(run.platforms[0].current.top, frozenTop);
  assert.equal(field.platforms[0].top, frozenTop);
  assert.deepEqual(authored, authoredBefore);
  assert.deepEqual(terrain.segments, terrainSegmentsBefore);
  assert.deepEqual([...terrain.enabled], enabledBefore);
  assert.equal(terrain.seenToken, seenTokenBefore,
    'detached terrain queries mutated the authoritative dedupe token');
});

test('malformed sources and queries fail closed within hard iteration limits', () => {
  const malformedRun = {
    platforms: [null, {}, { current: { left: 0, right: Infinity, top: 0, bottom: 10 } }],
  };
  const empty = createCrashContactField({ segments: [{ ax: NaN }] }, malformedRun);
  assert.equal(empty.terrainSegmentCount, 0);
  assert.equal(empty.platformCount, 0);
  assert.equal(queryCrashContact(empty, NaN, 0, 10), null);
  assert.equal(queryCrashContact(empty, 0, Infinity, 10), null);
  assert.equal(queryCrashContact(empty, 0, 0, 0), null);
  assert.equal(queryCrashContact(empty, 0, 0, -1), null);
  assert.equal(queryCrashContact(empty, 0, 0, CRASH_CONTACT_LIMITS.maxRadius + 1), null);
  assert.equal(queryCrashContact({}, 0, 0, 10), null);

  const many = Array.from({ length: CRASH_CONTACT_LIMITS.maxPlatforms + 25 }, (_, index) => ({
    id: `deck-${index}`,
    x: index * 2,
    y: 100,
    width: 2,
    height: 2,
    surface: 'metal',
  }));
  const bounded = createCrashContactField(null, many);
  assert.equal(bounded.platformCount, CRASH_CONTACT_LIMITS.maxPlatforms);
  assert.equal(queryCrashContact(
    bounded,
    10,
    90,
    10,
    { oldX: Symbol('bad'), oldY: 'bad' },
  )?.kind, 'platform');
});

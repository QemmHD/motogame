import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDebugProxySnapshot } from '../public/debug-proxies.js';
import {
  CONFIG,
  buildTerrain,
  createBike,
  setTerrainSegmentEnabled,
} from '../public/physics.js';
import {
  createKinematicRun,
  sampleKinematicPlatform,
  stepKinematicRun,
} from '../public/kinematics.js';
import { createRunState, stepRunRules } from '../public/rules.js';

function levelFixture() {
  return {
    name: 'Proxy Test',
    course: {
      startX: 0,
      startY: 180,
      checkpoints: [{ x: 180, y: 170 }, { x: 420, y: 150 }],
      finishX: 760,
      finishPt: { x: 760, y: 140 },
      hazards: [{
        id: 'sweep-saw',
        type: 'saw',
        x: 600,
        y: 40,
        baseX: 600,
        baseY: 40,
        r: 36,
        motion: { kind: 'sine', axis: 'y', amplitude: 45, period: 1.75, phase: 0.1 },
      }],
      platforms: [],
    },
  };
}

function assertAllNumbersFinite(value, path = 'snapshot') {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${path} is not finite`);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertAllNumbersFinite(child, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    assertAllNumbersFinite(child, `${path}.${key}`);
  }
}

test('terrain and bike proxies align with authoritative physics geometry', () => {
  const terrain = buildTerrain([[
    { x: -100, y: 200, surface: 'dirt' },
    { x: 100, y: 190, surface: 'ice', surfaceStrength: 0.7 },
    { x: 300, y: 210, surface: 'boost', surfaceStrength: 1.25 },
  ]]);
  setTerrainSegmentEnabled(terrain, 1, false);
  const bike = createBike(80, 120);
  bike.framePrevious = {
    rear: { x: bike.rear.x - 7, y: bike.rear.y - 3 },
    front: { x: bike.front.x - 6, y: bike.front.y - 2 },
    head: { x: bike.head.x - 5, y: bike.head.y - 4 },
  };
  const before = {
    terrainSegments: structuredClone(terrain.segments),
    enabled: Array.from(terrain.enabled),
    seenToken: terrain.seenToken,
    bike: structuredClone(bike),
  };

  const snapshot = buildDebugProxySnapshot({ terrain, bike });
  assert.equal(snapshot.terrain.length, 2);
  assert.equal(snapshot.terrain[0].surface, 'ice');
  assert.equal(snapshot.terrain[0].surfaceStrength, 0.7);
  assert.equal(snapshot.terrain[0].enabled, true);
  assert.equal(snapshot.terrain[1].surface, 'boost');
  assert.equal(snapshot.terrain[1].enabled, false);
  assert.deepEqual(snapshot.terrain[0].a, { x: -100, y: 200 });
  assert.deepEqual(snapshot.terrain[0].b, { x: 100, y: 190 });

  assert.equal(snapshot.bike.circles.length, 3);
  assert.equal(snapshot.bike.sweeps.length, 3);
  const rear = snapshot.bike.circles.find((circle) => circle.id === 'rear');
  const front = snapshot.bike.circles.find((circle) => circle.id === 'front');
  const head = snapshot.bike.circles.find((circle) => circle.id === 'head');
  assert.equal(rear.current.r, CONFIG.wheelR);
  assert.equal(front.current.r, CONFIG.wheelR);
  assert.equal(head.current.r, CONFIG.headR);
  assert.deepEqual(rear.current, { x: bike.rear.x, y: bike.rear.y, r: CONFIG.wheelR });
  assert.deepEqual(rear.previous, {
    x: bike.framePrevious.rear.x,
    y: bike.framePrevious.rear.y,
    r: CONFIG.wheelR,
  });
  assert.deepEqual(snapshot.bike.sweeps[0], {
    id: 'rear',
    kind: 'wheel',
    x0: bike.framePrevious.rear.x,
    y0: bike.framePrevious.rear.y,
    x1: bike.rear.x,
    y1: bike.rear.y,
    r: CONFIG.wheelR,
  });

  assert.deepEqual(terrain.segments, before.terrainSegments);
  assert.deepEqual(Array.from(terrain.enabled), before.enabled);
  assert.equal(terrain.seenToken, before.seenToken,
    'debug snapshot should not perform terrain contact queries');
  assert.deepEqual(bike, before.bike);
});

test('hazard sweeps and checkpoint/finish triggers align with rules runtime', () => {
  const level = levelFixture();
  const run = createRunState(level);
  const bike = createBike(260, 70);
  const levelBefore = structuredClone(level);
  stepRunRules(level, run, bike);
  const runBefore = structuredClone(run);
  const bikeBefore = structuredClone(bike);
  const runtimeHazard = run.hazards[0];

  const snapshot = buildDebugProxySnapshot({ level, run, bike });
  assert.equal(snapshot.tick, run.tick);
  assert.equal(snapshot.hazards.length, 1);
  assert.deepEqual(snapshot.hazards[0], {
    id: runtimeHazard.id,
    type: runtimeHazard.type,
    active: true,
    triggered: runtimeHazard.triggered,
    exploded: runtimeHazard.exploded,
    current: { x: runtimeHazard.x, y: runtimeHazard.y, r: runtimeHazard.r },
    previous: { x: runtimeHazard.prevX, y: runtimeHazard.prevY, r: runtimeHazard.r },
    sweep: {
      x0: runtimeHazard.prevX,
      y0: runtimeHazard.prevY,
      x1: runtimeHazard.x,
      y1: runtimeHazard.y,
      r: runtimeHazard.r,
    },
  });

  assert.equal(run.cpIndex, 1);
  assert.equal(snapshot.checkpoints.length, 2);
  assert.equal(snapshot.checkpoints[0].reached, true);
  assert.equal(snapshot.checkpoints[0].next, false);
  assert.equal(snapshot.checkpoints[1].reached, false);
  assert.equal(snapshot.checkpoints[1].next, true);
  assert.deepEqual(snapshot.checkpoints[1].trigger,
    { axis: 'x', comparison: 'greater-than', value: 420 });
  assert.equal(snapshot.finish.x, level.course.finishX);
  assert.equal(snapshot.finish.passed, false);
  assert.deepEqual(snapshot.finish.trigger,
    { axis: 'x', comparison: 'greater-than', value: level.course.finishX });

  assert.deepEqual(level, levelBefore);
  assert.deepEqual(run, runBefore);
  assert.deepEqual(bike, bikeBefore);
});

test('platform proxies preserve exact sampled pose rectangles and surface velocity', () => {
  const definitions = [{
    id: 'debug-lift',
    x: 240,
    y: 310,
    width: 176,
    height: 24,
    surface: 'metal',
    motion: { kind: 'sine', axis: 'y', amplitude: 92, period: 2.6, phase: 0.17 },
  }];
  const run = createKinematicRun(definitions);
  stepKinematicRun(run, 37);
  const before = structuredClone(run);
  const platform = run.platforms[0];
  const sampledCurrent = sampleKinematicPlatform(platform, 1);
  const sampledPrevious = sampleKinematicPlatform(platform, 0);
  const snapshot = buildDebugProxySnapshot({ kinematicRun: run });
  const proxy = snapshot.platforms[0];

  assert.equal(snapshot.kinematicTick, run.tick);
  assert.equal(proxy.id, platform.id);
  assert.equal(proxy.active, true);
  assert.equal(proxy.surface, 'metal');
  for (const key of ['x', 'y', 'width', 'height', 'left', 'right', 'top', 'bottom']) {
    assert.equal(proxy.current[key], sampledCurrent[key], `current ${key} drifted`);
    assert.equal(proxy.previous[key], sampledPrevious[key], `previous ${key} drifted`);
  }
  assert.deepEqual(proxy.surfaceVelocity,
    { x: platform.current.vx, y: platform.current.vy });
  assert.deepEqual(proxy.sweep, {
    x0: platform.previous.x,
    y0: platform.previous.y,
    x1: platform.current.x,
    y1: platform.current.y,
  });
  assert.deepEqual(run, before);
});

test('malformed oversized inputs are finite, bounded, detached, and report truncation', () => {
  const makeSegment = (index) => ({
    ax: index % 2 ? Infinity : index * 1e20,
    ay: -Infinity,
    bx: NaN,
    by: index,
    surface: `surface-${index}`,
    surfaceStrength: Infinity,
  });
  const makeHazard = (index) => ({
    id: `hazard-${index}`,
    type: 'saw',
    x: index * 1e30,
    y: NaN,
    prevX: -Infinity,
    prevY: index,
    r: Infinity,
  });
  const makePlatform = (index) => ({
    id: `platform-${index}`,
    active: index % 2 === 0,
    current: {
      x: Infinity,
      y: index,
      width: 1e20,
      height: NaN,
      left: -Infinity,
      right: Infinity,
      top: NaN,
      bottom: Infinity,
      vx: Infinity,
      vy: -Infinity,
      surface: 'metal',
    },
  });
  const source = {
    terrain: {
      segments: Array.from({ length: 9 }, (_, index) => makeSegment(index)),
      enabled: new Uint8Array([1, 0, 1, 0, 1, 0, 1, 0, 1]),
    },
    run: {
      tick: Infinity,
      cpIndex: 1,
      hazards: Array.from({ length: 8 }, (_, index) => makeHazard(index)),
    },
    kinematicRun: {
      tick: -Infinity,
      tickRate: Infinity,
      platforms: Array.from({ length: 7 }, (_, index) => makePlatform(index)),
    },
    bike: {
      x: Infinity,
      y: NaN,
      cfg: { wheelR: Infinity, headR: NaN },
      rear: { x: Infinity, y: NaN, ox: -Infinity, oy: 4 },
      front: { x: -1e30, y: Infinity, ox: 2, oy: NaN },
      head: { x: NaN, y: -Infinity, ox: Infinity, oy: -Infinity },
    },
    level: {
      course: {
        checkpoints: Array.from({ length: 6 }, (_, index) => ({ x: index * 1e40, y: NaN })),
        finishX: 1e50,
        finishPt: { x: Infinity, y: -Infinity },
      },
    },
  };
  const before = structuredClone(source);
  const snapshot = buildDebugProxySnapshot(source, {
    maxTerrainSegments: 3,
    maxHazards: 2,
    maxPlatforms: 2,
    maxCheckpoints: 2,
    maxCoordinate: 1000,
    maxRadius: 100,
    markerHalfHeight: 5000,
  });

  assert.equal(snapshot.terrain.length, 3);
  assert.equal(snapshot.hazards.length, 2);
  assert.equal(snapshot.platforms.length, 2);
  assert.equal(snapshot.checkpoints.length, 2);
  assert.deepEqual(snapshot.truncated, {
    terrainSegments: 6,
    hazards: 6,
    platforms: 5,
    checkpoints: 4,
  });
  assert.ok(snapshot.terrain.every((segment) =>
    [segment.a.x, segment.a.y, segment.b.x, segment.b.y]
      .every((value) => Math.abs(value) <= 1000)));
  assert.ok(snapshot.bike.circles.every((circle) => circle.current.r <= 100));
  assert.ok(snapshot.platforms.every((platform) =>
    platform.current.width <= 100 && platform.current.height <= 100));
  assert.equal(snapshot.limits.markerHalfHeight, 1000);
  assertAllNumbersFinite(snapshot);
  assert.deepEqual(source, before);

  snapshot.terrain[0].a.x = 77;
  snapshot.hazards[0].current.x = 88;
  snapshot.platforms[0].current.x = 99;
  assert.deepEqual(source, before, 'renderer mutations leaked back into live state');
});

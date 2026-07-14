import assert from 'node:assert/strict';
import test from 'node:test';

import { createForceZoneField, stepForceZones } from '../public/force-zones.js';
import { CONFIG, applyImpulse, createBike } from '../public/physics.js';

const DT = 1 / 60;

function definition(overrides = {}) {
  return {
    id: 'loom-a',
    kind: 'kinetic-loom',
    x: 0,
    y: 170,
    width: 220,
    height: 180,
    acceleration: { x: 600, y: -120 },
    angularAcceleration: 0,
    enabled: true,
    render: { model: 'kinetic-loom', palette: 'cyan', label: 'VECTOR' },
    ...overrides,
  };
}

function snapshotBike(bike) {
  return structuredClone(bike);
}

function nodeVelocity(node, dt = DT) {
  return { x: (node.x - node.ox) / dt, y: (node.y - node.oy) / dt };
}

test('field construction validates, clones, freezes, and stably orders definitions', () => {
  const source = [definition({ id: 'z-last' }), definition({
    id: 'a-first', acceleration: { x: -80, y: 40 }, render: { label: 'A' },
  })];
  const before = structuredClone(source);
  const field = createForceZoneField(source);

  assert.deepEqual(source, before);
  assert.deepEqual(field.zones.map(zone => zone.id), ['a-first', 'z-last']);
  assert.equal(Object.isFrozen(field), true);
  assert.equal(Object.isFrozen(field.zones), true);
  assert.equal(Object.isFrozen(field.zones[0]), true);
  assert.equal(Object.isFrozen(field.zones[0].bounds), true);
  assert.equal(Object.isFrozen(field.zones[0].acceleration), true);
  source[0].acceleration.x = 999;
  assert.equal(field.zones[1].acceleration.x, 600);

  assert.throws(() => createForceZoneField({}), /array/);
  assert.throws(() => createForceZoneField([definition(), definition()]), /duplicate/);
  assert.throws(() => createForceZoneField([definition({ x: NaN })]), /finite/);
  assert.throws(() => createForceZoneField([definition({ width: 0 })]), /greater than zero/);
  assert.throws(() => createForceZoneField([definition({
    acceleration: { x: Infinity, y: 0 },
  })]), /finite/);
  assert.throws(() => createForceZoneField([definition({ kind: 'teleporter' })]), /unsupported/);
  assert.throws(() => createForceZoneField(Array.from({ length: 513 }, (_, index) =>
    definition({ id: `loom-${index}` }))), /zone limit/);
});

test('a field applies once per tick even when every bike node overlaps it', () => {
  const field = createForceZoneField([definition()]);
  const bike = createBike(0, 200);
  const result = stepForceZones(field, bike, DT);

  assert.equal(result.applied, true);
  assert.equal(result.applications.length, 1);
  assert.deepEqual(result.applications[0].hitNodes, ['rear', 'front', 'head']);
  assert.deepEqual(result.applications[0].impulse, { x: 10, y: -2, angular: 0 });
  assert.deepEqual(result.impulse, { x: 10, y: -2, angular: 0 });
  assert.equal(result.applications[0].entered, false,
    'a bike whose full previous frame was already inside must not re-enter');
});

test('circle boundaries are inclusive while a one-pixel miss stays dormant', () => {
  const field = createForceZoneField([definition({
    x: 150, y: 200, width: 100, height: 100, acceleration: { x: 60, y: 0 },
  })]);
  const touching = createBike(42, 200); // front center 82 + radius 18 = left edge 100
  const missed = createBike(41, 200);

  assert.equal(stepForceZones(field, touching, DT).applications.length, 1);
  assert.equal(stepForceZones(field, missed, DT).applications.length, 0);

  const cornerField = createForceZoneField([definition({
    x: 100, y: 100, width: 100, height: 100, acceleration: { x: 60, y: 0 },
  })]);
  const cornerBike = (rearX, rearY) => {
    const bike = createBike(0, 200);
    for (const id of ['rear', 'front', 'head']) {
      bike[id].x = bike[id].ox = -100;
      bike[id].y = bike[id].oy = -100;
    }
    bike.rear.x = bike.rear.ox = rearX;
    bike.rear.y = bike.rear.oy = rearY;
    bike.framePrevious = {
      rear: { x: rearX, y: rearY },
      front: { x: -100, y: -100 },
      head: { x: -100, y: -100 },
    };
    return bike;
  };
  assert.equal(stepForceZones(cornerField, cornerBike(37, 37), DT).applications.length, 0,
    'a circle outside a rounded rectangle corner must not hit the expanded square corner');
  assert.equal(stepForceZones(cornerField, cornerBike(37.5, 37.5), DT).applications.length, 1,
    'a circle within radial distance of the rectangle corner must touch');
});

test('a thin field cannot be skipped by a high-speed full-frame sweep', () => {
  const field = createForceZoneField([definition({
    x: 0, y: 200, width: 8, height: 90, acceleration: { x: 300, y: -300 },
  })]);
  const bike = createBike(220, 200);
  bike.framePrevious = {
    rear: { x: -260, y: bike.rear.y },
    front: { x: -180, y: bike.front.y },
    head: { x: -223, y: bike.head.y },
  };
  const result = stepForceZones(field, bike, DT);
  const application = result.applications[0];

  assert.ok(application);
  assert.equal(application.swept, true);
  assert.equal(application.entered, true);
  assert.equal(application.exited, true);
  assert.ok(application.hitNodes.length >= 2);
});

test('continuous acceleration scales with dt and overlapping fields are order-independent', () => {
  const a = definition({ id: 'a', acceleration: { x: 600, y: -120 } });
  const b = definition({ id: 'b', acceleration: { x: -180, y: 420 } });
  const firstField = createForceZoneField([a, b]);
  const reversedField = createForceZoneField([b, a]);
  const firstBike = createBike(0, 200);
  const reversedBike = createBike(0, 200);

  const first = stepForceZones(firstField, firstBike, DT);
  const reversed = stepForceZones(reversedField, reversedBike, DT);
  assert.deepEqual(first, reversed);
  assert.deepEqual(first.impulse, { x: 7, y: 5, angular: 0 });
  assert.deepEqual(snapshotBike(firstBike), snapshotBike(reversedBike));

  const doubleDt = stepForceZones(createForceZoneField([a]), createBike(0, 200), DT * 2);
  assert.deepEqual(doubleDt.impulse, { x: 20, y: -4, angular: 0 });
});

test('disabled, empty, crashed, and distant fields are exact no-ops', () => {
  const cases = [
    createForceZoneField([]),
    createForceZoneField([definition({ enabled: false })]),
    createForceZoneField([definition({ x: 10_000, y: 10_000 })]),
  ];
  for (const field of cases) {
    const bike = createBike(0, 200);
    const before = snapshotBike(bike);
    assert.deepEqual(stepForceZones(field, bike, DT), {
      applied: false, applications: [], impulse: { x: 0, y: 0, angular: 0 },
    });
    assert.deepEqual(snapshotBike(bike), before);
  }

  const crashed = createBike(0, 200); crashed.crashed = true;
  const beforeCrash = snapshotBike(crashed);
  assert.equal(stepForceZones(createForceZoneField([definition()]), crashed, DT).applied, false);
  assert.deepEqual(snapshotBike(crashed), beforeCrash);
});

test('application records are detached from immutable field definitions', () => {
  const field = createForceZoneField([definition()]);
  const result = stepForceZones(field, createBike(0, 200), DT);
  result.applications[0].bounds.left = 999;
  result.applications[0].acceleration.x = 999;
  result.applications[0].hitNodes.length = 0;
  result.impulse.x = 999;

  assert.equal(field.zones[0].bounds.left, -110);
  assert.equal(field.zones[0].acceleration.x, 600);
});

test('applyImpulse is atomic for invalid inputs and a no-op for crashed bikes', () => {
  const bike = createBike(0, 200);
  const before = snapshotBike(bike);
  for (const args of [[NaN, 0, 0], [0, Infinity, 0], [0, 0, -Infinity]]) {
    assert.throws(() => applyImpulse(bike, ...args), /finite/);
    assert.deepEqual(snapshotBike(bike), before, 'invalid impulse mutated bike state');
  }
  assert.throws(() => applyImpulse(null, 0, 0), /object/);

  for (const invalidDt of [0, NaN, Infinity]) {
    const invalid = createBike(0, 200); invalid._dt = invalidDt;
    const snapshot = snapshotBike(invalid);
    assert.throws(() => applyImpulse(invalid, 10, -4, 0), /sample dt/);
    assert.deepEqual(snapshotBike(invalid), snapshot, 'invalid sample dt mutated bike state');
  }
  const invalidMode = createBike(0, 200); invalidMode.mode = 'bogus';
  const modeSnapshot = snapshotBike(invalidMode);
  assert.throws(() => applyImpulse(invalidMode, 10, -4, 0), /mode/);
  assert.deepEqual(snapshotBike(invalidMode), modeSnapshot, 'invalid mode mutated bike state');

  bike.crashed = true;
  const crashed = snapshotBike(bike);
  assert.equal(applyImpulse(bike, 100, -100, 2), false);
  assert.deepEqual(snapshotBike(bike), crashed);
});

test('ground and air impulse paths retain their hard velocity and spin bounds', () => {
  const ground = createBike(0, 200); ground._dt = DT;
  assert.equal(applyImpulse(ground, 1e9, -1e9, 40), true);
  for (const node of [ground.rear, ground.front, ground.head]) {
    const velocity = nodeVelocity(node);
    assert.ok(Math.hypot(velocity.x, velocity.y) <= CONFIG.maxLinearSpeed + 1e-7);
  }
  assert.equal(ground.aOmega, 0, 'ground impulses must not invent air rotation');

  const air = createBike(0, 200); air.mode = 'air'; air._dt = DT;
  assert.equal(applyImpulse(air, 1e9, -1e9, 1e9), true);
  assert.equal(air.mvx, CONFIG.maxLinearSpeed);
  assert.equal(air.mvy, -CONFIG.maxLinearSpeed);
  assert.equal(air.aOmega, CONFIG.maxAirOmega);
});

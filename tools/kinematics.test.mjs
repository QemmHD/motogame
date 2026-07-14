import assert from 'node:assert/strict';
import test from 'node:test';

import {
  KINEMATIC_TICK_RATE,
  activateKinematicPlatform,
  createKinematicRun,
  deactivateKinematicPlatform,
  getKinematicPlatform,
  platformPoseAt,
  resetKinematicRun,
  resolveCircleOnPlatform,
  restoreKinematicRun,
  sampleKinematicPlatform,
  snapshotKinematicRun,
  stepKinematicRun,
} from '../public/kinematics.js';
import { buildTerrain, createBike, resolveBikePlatforms, stepBike } from '../public/physics.js';

const authoredPlatforms = [
  {
    id: 'rail-shuttle', x: 100, y: 240, width: 180, height: 20,
    surface: 'grated', render: { model: 'rail-deck', warningStripe: true },
    motion: { kind: 'horizontal-sine', amplitude: 72, period: 2, phase: 0.125 },
  },
  {
    id: 'freight-lift', x: 460, y: 300, width: 140, height: 24,
    motion: { kind: 'lift', distance: 110, period: 3, direction: -1 },
  },
  {
    id: 'press-head', x: 760, y: 120, width: 100, height: 30,
    motion: { kind: 'piston', axis: 'y', stroke: 150, period: 1.5 },
  },
  {
    id: 'patrol-deck', x: 980, y: 260, width: 120, height: 18,
    motion: { kind: 'vertical-ping-pong', amplitude: 60, period: 2.5 },
  },
];

function snapshot(run) {
  return run.platforms.map(({ id, previous, current }) => ({
    id,
    previous: { x: previous.x, y: previous.y },
    current: {
      x: current.x,
      y: current.y,
      vx: current.vx,
      vy: current.vy,
      progress: current.motionProgress,
    },
  }));
}

function verletStep(circle, gravity = 0.34) {
  const dx = circle.x - circle.ox;
  const dy = circle.y - circle.oy;
  circle.ox = circle.x;
  circle.oy = circle.y;
  circle.x += dx;
  circle.y += dy + gravity;
}

test('all authored motion poses are deterministic fixed-tick functions', () => {
  for (const definition of authoredPlatforms) {
    const a = platformPoseAt(definition, 137);
    const b = platformPoseAt(definition, 137);
    assert.deepEqual(a, b, `${definition.id} changed at the same tick`);
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y));
    assert.ok(Number.isFinite(a.vx) && Number.isFinite(a.vy));
  }

  const horizontal = platformPoseAt(authoredPlatforms[0], 17);
  assert.notEqual(horizontal.x, authoredPlatforms[0].x);
  assert.equal(horizontal.y, authoredPlatforms[0].y);

  const lift = platformPoseAt(authoredPlatforms[1], 45);
  assert.equal(lift.x, authoredPlatforms[1].x);
  assert.ok(lift.y < authoredPlatforms[1].y, 'lift did not travel upward');

  const pistonRetracted = platformPoseAt(authoredPlatforms[2], 0);
  const pistonExtended = platformPoseAt(authoredPlatforms[2], 45);
  assert.ok(pistonExtended.y > pistonRetracted.y, 'piston did not extend');

  const pingA = platformPoseAt(authoredPlatforms[3], 15);
  const pingB = platformPoseAt(authoredPlatforms[3], 90);
  assert.notEqual(pingA.y, pingB.y, 'ping-pong pose did not move');
});

test('runtime state never mutates authored definitions and exposes render geometry', () => {
  const source = structuredClone(authoredPlatforms);
  const original = JSON.stringify(source);
  const run = createKinematicRun(source);

  assert.ok(Object.isFrozen(run.definitions));
  assert.ok(Object.isFrozen(run.definitions[0]));
  assert.ok(Object.isFrozen(run.definitions[0].motion));
  assert.ok(Object.isFrozen(run.definitions[0].render));

  stepKinematicRun(run, 183);
  assert.equal(JSON.stringify(source), original);
  assert.notStrictEqual(run.definitions[0], source[0]);
  assert.notStrictEqual(run.platforms[0].previous, run.platforms[0].current);

  const renderState = sampleKinematicPlatform(run.platforms[0], 0.5);
  assert.equal(renderState.width, source[0].width);
  assert.equal(renderState.left, renderState.x - renderState.width * 0.5);
  assert.equal(renderState.render.model, 'rail-deck');
});

test('a dormant platform stays solid at base and activation starts local tick zero', () => {
  const definition = {
    id: 'trigger-lift', x: 320, y: 260, width: 180, height: 22,
    startActive: false, triggerX: 555,
    motion: { kind: 'horizontal-sine', amplitude: 72, period: 2 },
  };
  const authoredBefore = JSON.stringify(definition);
  const run = createKinematicRun([definition], { startTick: 120 });
  const platform = run.platforms[0];

  assert.equal(platform.active, false);
  assert.equal(platform.definition.triggerX, 555);
  assert.ok(Object.isFrozen(platform.definition));
  assert.equal(JSON.stringify(definition), authoredBefore);
  assert.equal(platform.activationTick, null);
  assert.equal(platform.current.x, definition.x);
  stepKinematicRun(run, 60);
  assert.equal(platform.current.x, definition.x);
  assert.equal(platform.current.vx, 0);

  const circle = { x: definition.x, y: platform.current.top - 12,
    ox: definition.x, oy: platform.current.top - 12, r: 12 };
  const dormantContact = resolveCircleOnPlatform(circle, platform);
  assert.ok(dormantContact, 'inactive platform stopped being solid');
  assert.equal(dormantContact.active, false);

  assert.equal(activateKinematicPlatform(run, definition.id), true);
  assert.equal(platform.active, true);
  assert.equal(platform.activationTick, 180);
  assert.equal(platform.current.motionTick, 0);
  assert.equal(platform.current.x, platformPoseAt(definition, 0).x);
  assert.equal(platform.current.vx, 0, 'activation injected teleport velocity');
  const renderState = sampleKinematicPlatform(platform, 1);
  assert.equal(renderState.active, true);
  assert.equal(renderState.activationTick, 180);

  stepKinematicRun(run, 30);
  assert.equal(platform.current.motionTick, 30);
  assert.ok(Math.abs(platform.current.x - platformPoseAt(definition, 30).x) < 1e-9);
  assert.equal(deactivateKinematicPlatform(run, definition.id), true);
  assert.equal(platform.active, false);
  assert.equal(platform.activationTick, null);
  assert.equal(platform.current.x, definition.x);
  assert.equal(platform.current.vx, 0);
});

test('trigger activation and reset replay exactly from a nonzero start tick', () => {
  const source = [{
    id: 'replay-trigger', x: 80, y: 200, width: 150, height: 20,
    startActive: false,
    motion: { kind: 'lift', distance: 96, period: 1.75, direction: -1 },
  }];
  const original = JSON.stringify(source);
  const run = createKinematicRun(source, { startTick: 73 });
  const record = () => {
    stepKinematicRun(run, 11);
    assert.equal(activateKinematicPlatform(run, 'replay-trigger'), true);
    const trace = [];
    for (let tick = 0; tick < 180; tick++) {
      trace.push({
        tick: run.tick,
        active: run.platforms[0].active,
        activationTick: run.platforms[0].activationTick,
        motionTick: run.platforms[0].current.motionTick,
        x: run.platforms[0].current.x,
        y: run.platforms[0].current.y,
        vx: run.platforms[0].current.vx,
        vy: run.platforms[0].current.vy,
      });
      stepKinematicRun(run);
    }
    return trace;
  };

  const first = record();
  resetKinematicRun(run);
  assert.equal(run.tick, 73);
  assert.equal(run.platforms[0].active, false);
  assert.equal(run.platforms[0].activationTick, null);
  assert.equal(run.platforms[0].current.x, source[0].x);
  const second = record();
  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(source), original, 'trigger runtime mutated authored data');
  assert.equal(run.definitions[0].startActive, false);
  assert.equal(run.definitions[0].triggerX, null);
  assert.ok(Object.isFrozen(run.definitions[0]));
});

test('trigger APIs return false for missing ids and no-op state changes', () => {
  const run = createKinematicRun([{
    id: 'known-trigger', x: 0, y: 100, width: 100, height: 20,
    startActive: false, motion: { kind: 'piston', stroke: 40, period: 1 },
  }]);
  assert.equal(activateKinematicPlatform(run, 'missing'), false);
  assert.equal(deactivateKinematicPlatform(run, 'missing'), false);
  assert.equal(deactivateKinematicPlatform(run, 'known-trigger'), false);
  assert.equal(activateKinematicPlatform(run, 'known-trigger'), true);
  assert.equal(activateKinematicPlatform(run, 'known-trigger'), false);
  assert.equal(deactivateKinematicPlatform(run, 'known-trigger'), true);
  assert.equal(deactivateKinematicPlatform(run, 'known-trigger'), false);
});

test('a rider remains carried for ten cycles after delayed activation', () => {
  const definition = {
    id: 'delayed-shuttle', x: 240, y: 220, width: 220, height: 22,
    startActive: false,
    motion: { kind: 'horizontal-sine', amplitude: 64, period: 1.8 },
  };
  const run = createKinematicRun([definition], { startTick: 41 });
  stepKinematicRun(run, 19);
  assert.equal(activateKinematicPlatform(run, definition.id), true);
  const platform = run.platforms[0];
  const radius = 14;
  const circle = { x: platform.current.x, y: platform.current.top - radius,
    ox: platform.current.x, oy: platform.current.top - radius, r: radius };
  const relativeX = circle.x - platform.current.x;
  const cycleTicks = Math.round(definition.motion.period * KINEMATIC_TICK_RATE);

  for (let tick = 0; tick < cycleTicks * 10; tick++) {
    stepKinematicRun(run);
    verletStep(circle);
    const contact = resolveCircleOnPlatform(circle, platform);
    assert.ok(contact, `triggered rider lost contact at local tick ${tick}`);
    assert.equal(contact.active, true);
    assert.ok(Math.abs((circle.x - platform.current.x) - relativeX) < 1e-7);
    assert.ok(Math.abs(circle.y - (platform.current.top - radius)) < 1e-8);
  }
});

test('checkpoint snapshot restores an activated platform and exact subsequent trace', () => {
  const source = [{
    id: 'checkpoint-lift', x: 180, y: 260, width: 190, height: 22,
    startActive: false, triggerX: 420,
    motion: { kind: 'lift', distance: 108, period: 2.25, direction: -1 },
  }];
  const authoredBefore = JSON.stringify(source);
  const run = createKinematicRun(source, { startTick: 37 });
  stepKinematicRun(run, 14);
  assert.equal(activateKinematicPlatform(run, 'checkpoint-lift'), true);
  stepKinematicRun(run, 53);
  const checkpoint = snapshotKinematicRun(run);
  const checkpointBefore = JSON.stringify(checkpoint);

  assert.equal(Object.getPrototypeOf(checkpoint), Object.prototype);
  assert.equal(Object.getPrototypeOf(checkpoint.platforms[0]), Object.prototype);
  assert.equal(checkpoint.tick, 104);
  assert.equal(checkpoint.platforms[0].activationTick, 51);

  const trace = () => {
    const output = [];
    for (let tick = 0; tick < 240; tick++) {
      stepKinematicRun(run);
      const platform = run.platforms[0];
      output.push({
        tick: run.tick,
        active: platform.active,
        activationTick: platform.activationTick,
        previous: { ...platform.previous },
        current: { ...platform.current },
      });
    }
    return output;
  };
  const expected = trace();

  deactivateKinematicPlatform(run, 'checkpoint-lift');
  stepKinematicRun(run, 17);
  resetKinematicRun(run);
  stepKinematicRun(run, 9);
  restoreKinematicRun(run, checkpoint);
  assert.equal(JSON.stringify(checkpoint), checkpointBefore, 'restore mutated its snapshot');
  assert.equal(JSON.stringify(source), authoredBefore, 'restore mutated authored definitions');
  assert.deepEqual(snapshotKinematicRun(run), checkpoint);
  assert.deepEqual(trace(), expected);

  const restoredX = run.platforms[0].current.x;
  checkpoint.platforms[0].current.x += 10;
  assert.equal(run.platforms[0].current.x, restoredX, 'run retained snapshot pose objects');
});

test('checkpoint restore rejects malformed or mismatched snapshots atomically', () => {
  const run = createKinematicRun([{
    id: 'snapshot-a', x: 0, y: 100, width: 120, height: 20,
    startActive: false, motion: { kind: 'sine', axis: 'x', amplitude: 20, period: 1 },
  }, {
    id: 'snapshot-b', x: 200, y: 100, width: 120, height: 20,
  }], { startTick: 9 });
  stepKinematicRun(run, 5);
  activateKinematicPlatform(run, 'snapshot-a');
  stepKinematicRun(run, 8);
  const good = snapshotKinematicRun(run);
  const stable = JSON.stringify(good);
  const attempt = (mutate, pattern) => {
    const malformed = structuredClone(good);
    mutate(malformed);
    assert.throws(() => restoreKinematicRun(run, malformed), pattern);
    assert.equal(JSON.stringify(snapshotKinematicRun(run)), stable,
      'failed restore partially changed the run');
  };

  attempt(snapshot => { snapshot.platforms.pop(); }, /count/);
  attempt(snapshot => { snapshot.platforms[0].id = 'wrong-id'; }, /id/);
  attempt(snapshot => { snapshot.platforms[0].current.x = NaN; }, /finite/);
  attempt(snapshot => { delete snapshot.platforms[0].current.vx; }, /missing/);
  attempt(snapshot => { snapshot.platforms[0].active = false; }, /activationTick|active state/);
});

test('an idle circle remains planted on moving ground for ten full cycles', () => {
  for (const definition of [authoredPlatforms[0], authoredPlatforms[1]]) {
    const run = createKinematicRun([definition]);
    const platform = run.platforms[0];
    const radius = 14;
    const circle = {
      x: platform.current.x,
      y: platform.current.top - radius,
      ox: platform.current.x,
      oy: platform.current.top - radius,
      r: radius,
    };
    const relativeX = circle.x - platform.current.x;
    const cycleTicks = Math.round(definition.motion.period * KINEMATIC_TICK_RATE);

    for (let tick = 0; tick < cycleTicks * 10; tick++) {
      stepKinematicRun(run);
      verletStep(circle);
      const contact = resolveCircleOnPlatform(circle, platform);
      assert.ok(contact, `${definition.id} lost its rider at run tick ${run.tick}`);
      assert.ok(
        Math.abs(circle.y - (platform.current.top - radius)) < 1e-8,
        `${definition.id} rider drifted vertically`,
      );
      assert.ok(
        Math.abs((circle.x - platform.current.x) - relativeX) < 1e-7,
        `${definition.id} failed to carry the rider`,
      );
    }
  }
});

test('relative swept crossing catches a high-speed landing in one tick', () => {
  const run = createKinematicRun([{
    id: 'catcher', x: 0, y: 100, width: 160, height: 20,
  }]);
  const platform = run.platforms[0];
  const circle = { x: 12, y: 190, ox: 12, oy: -40, radius: 10 };

  const contact = resolveCircleOnPlatform(circle, platform);
  assert.ok(contact, 'swept landing was missed');
  assert.equal(contact.kind, 'swept');
  assert.ok(contact.toi > 0 && contact.toi < 1);
  assert.equal(circle.y, platform.current.top - circle.radius);
  assert.equal(circle.y - circle.oy, 0, 'downward landing speed was not removed');
});

test('platform carry and upward launch inheritance are strictly bounded', () => {
  const horizontalRun = createKinematicRun([{
    id: 'fast-rail', x: 0, y: 100, width: 200, height: 20,
    motion: { kind: 'sine', axis: 'x', amplitude: 900, period: 0.08 },
  }]);
  stepKinematicRun(horizontalRun);
  const horizontal = horizontalRun.platforms[0];
  const rider = {
    x: horizontal.previous.x,
    y: horizontal.previous.top - 10,
    ox: horizontal.previous.x,
    oy: horizontal.previous.top - 10,
    r: 10,
  };
  // Follow the deck's position this tick so this assertion isolates inherited
  // velocity rather than testing whether a tiny deck can teleport under a rider.
  rider.x += horizontal.current.x - horizontal.previous.x;
  rider.y += 1;
  const railContact = resolveCircleOnPlatform(rider, horizontal, {
    maxCarrySpeed: 120,
    maxLaunchSpeed: 90,
  });
  assert.ok(railContact);
  assert.ok(Math.abs(railContact.surfaceVelocity.x) > 120);
  assert.ok(Math.abs(railContact.inheritedVelocity.x) <= 120 + 1e-9);
  assert.ok(Math.abs((rider.x - rider.ox) * KINEMATIC_TICK_RATE) <= 120 + 1e-9);

  const liftRun = createKinematicRun([{
    id: 'fast-lift', x: 0, y: 200, width: 200, height: 20,
    motion: { kind: 'lift', distance: 600, period: 0.12, direction: -1 },
  }]);
  stepKinematicRun(liftRun);
  const lift = liftRun.platforms[0];
  const lifted = {
    x: lift.current.x,
    y: lift.current.top - 10,
    ox: lift.previous.x,
    oy: lift.previous.top - 10,
    r: 10,
  };
  const liftContact = resolveCircleOnPlatform(lifted, lift, {
    maxCarrySpeed: 160,
    maxLaunchSpeed: 75,
  });
  assert.ok(liftContact);
  assert.ok(Math.abs(liftContact.surfaceVelocity.y) > 75);
  assert.ok(Math.abs(liftContact.inheritedVelocity.y) <= 75 + 1e-9);
  assert.ok(Math.abs((lifted.y - lifted.oy) * KINEMATIC_TICK_RATE) <= 75 + 1e-9);
});

test('reset recreates the exact initial state and deterministic replay', () => {
  const run = createKinematicRun(authoredPlatforms, { startTick: 0 });
  const initial = snapshot(run);
  const replayA = [];
  for (let i = 0; i < 240; i++) {
    stepKinematicRun(run);
    replayA.push(snapshot(run));
  }

  resetKinematicRun(run);
  assert.equal(run.tick, 0);
  assert.deepEqual(snapshot(run), initial);
  assert.equal(getKinematicPlatform(run, 'missing'), null);
  assert.equal(getKinematicPlatform(run, 'freight-lift').id, 'freight-lift');

  const replayB = [];
  for (let i = 0; i < 240; i++) {
    stepKinematicRun(run);
    replayB.push(snapshot(run));
  }
  assert.deepEqual(replayB, replayA);
});

test('the complete bike stays carried on a moving deck for ten cycles', () => {
  const definition = { id: 'bike-shuttle', x: 300, y: 300, width: 230, height: 24,
    motion: { kind: 'horizontal-sine', amplitude: 68, period: 2.2 } };
  const run = createKinematicRun([definition]);
  const terrain = buildTerrain([[]]);
  const bike = createBike(definition.x, run.platforms[0].current.top - 18);
  const idle = { gas: false, brake: false, leanFwd: false, leanBack: false };
  const cycleTicks = Math.round(definition.motion.period * KINEMATIC_TICK_RATE);
  let contactTicks = 0;
  for (let tick = 0; tick < cycleTicks * 10; tick++) {
    stepKinematicRun(run);
    stepBike(bike, terrain, idle, 1 / 60);
    if (resolveBikePlatforms(bike, run, 1 / 60).length) contactTicks++;
    assert.equal(bike.crashed, false, `bike crashed at platform tick ${tick}`);
    assert.ok(Number.isFinite(bike.x) && Number.isFinite(bike.y));
    assert.ok(Math.abs(bike.x - run.platforms[0].current.x) < 115,
      `bike escaped the moving deck at tick ${tick}`);
  }
  assert.ok(contactTicks > cycleTicks * 8, 'bike was not supported for most platform ticks');
});

test('the driven wheel accelerates, brakes, and reverses relative to a floating deck', () => {
  const definition = { id: 'drive-deck', x: 0, y: 300, width: 6000, height: 24 };
  const run = createKinematicRun([definition]);
  const terrain = buildTerrain([[]]);
  const bike = createBike(0, run.platforms[0].current.top - 18);
  const dt = 1 / 60;
  const input = (gas, brake) => ({ gas, brake, leanFwd: false, leanBack: false });
  const advance = (ticks, controls) => {
    for (let tick = 0; tick < ticks; tick++) {
      stepKinematicRun(run);
      stepBike(bike, terrain, controls, dt);
      const contacts = resolveBikePlatforms(bike, run, dt, controls);
      assert.ok(contacts.some(contact => contact.node === 'rear'),
        `rear wheel lost the drive deck at tick ${run.tick}`);
      assert.equal(bike.crashed, false);
    }
  };

  advance(15, input(false, false));
  advance(90, input(true, false));
  const accelerated = bike.forwardSpeed;
  assert.ok(accelerated > 150, `platform gas produced only ${accelerated.toFixed(1)} px/s`);

  advance(30, input(false, true));
  const braked = bike.forwardSpeed;
  assert.ok(braked < accelerated - 100,
    `platform brake did not reduce speed (${accelerated.toFixed(1)} -> ${braked.toFixed(1)})`);

  advance(90, input(false, true));
  assert.ok(bike.forwardSpeed < -20, `platform brake never engaged reverse: ${bike.forwardSpeed}`);
  assert.ok(bike.forwardSpeed >= -bike.cfg.reverseSpeed - 15,
    `platform reverse exceeded its bound: ${bike.forwardSpeed}`);
  assert.ok(bike.speed <= bike.cfg.maxLinearSpeed + 1e-6,
    `platform drive exceeded the hard speed cap: ${bike.speed}`);
});

test('a head sweep crashes even while a wheel contacts the same platform', () => {
  const run = createKinematicRun([{
    id: 'simultaneous-contact', x: 0, y: 100, width: 240, height: 20,
  }]);
  const bike = createBike(0, 0);
  bike.rear.x = -28; bike.rear.y = 72; bike.rear.ox = -28; bike.rear.oy = 72;
  bike.front.x = 52; bike.front.y = 42; bike.front.ox = 52; bike.front.oy = 42;
  bike.head.x = 4; bike.head.y = 105; bike.head.ox = 4; bike.head.oy = 105;
  bike.framePrevious = {
    rear: { x: -28, y: 72 },
    front: { x: 52, y: 42 },
    head: { x: 4, y: 55 },
  };

  const contacts = resolveBikePlatforms(bike, run, 1 / 60);
  assert.ok(contacts.some(contact => contact.node === 'rear'), 'wheel contact was not established');
  assert.ok(contacts.some(contact => contact.node === 'head'), 'head sweep was skipped');
  assert.equal(bike.crashed, true);
  assert.deepEqual(bike.crashContact, {
    type: 'platform',
    id: 'simultaneous-contact',
    platformId: 'simultaneous-contact',
    x: 4,
    y: 79,
    surface: 'metal',
  });
});

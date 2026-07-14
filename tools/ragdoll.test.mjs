import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTerrain, terrainContact } from '../public/physics.js';
import { createCrashContactField, queryCrashContact } from '../public/crash-contact.js';
import { normalizeCrashCause } from '../public/crash-presentation.js';
import {
  RAGDOLL_DEFAULTS,
  createRagdoll,
  drainRagdollImpacts,
  ragdollAngle,
  readRagdoll,
  stepRagdoll,
} from '../public/ragdoll.js';

const FIXED_DT = 1 / 120;
const REQUIRED_PARTS = [
  'rearWheel', 'frontWheel', 'bikeFrame', 'seat', 'handlebar',
  'hip', 'torso', 'head', 'helmet',
  'rearElbow', 'frontElbow', 'rearHand', 'frontHand',
  'rearKnee', 'frontKnee', 'rearFoot', 'frontFoot',
];

function crashSnapshot(index) {
  const centerX = -900 + index * 83;
  const centerY = 66 + (index % 6) * 23;
  const angle = -1.05 + (index % 12) * 0.19;
  const forward = { x: Math.cos(angle), y: Math.sin(angle) };
  const up = { x: forward.y, y: -forward.x };
  const wheelBase = 80;
  const rear = {
    x: centerX - forward.x * wheelBase * 0.5,
    y: centerY - forward.y * wheelBase * 0.5,
  };
  const front = {
    x: centerX + forward.x * wheelBase * 0.5,
    y: centerY + forward.y * wheelBase * 0.5,
  };
  const head = {
    x: centerX + up.x * 44 - forward.x * 3,
    y: centerY + up.y * 44 - forward.y * 3,
  };
  const vx = -280 + ((index * 173) % 1180);
  const vy = 60 + (index % 8) * 82;
  const omega = -6.2 + (index % 10) * 1.31;
  const withHistory = (node) => {
    const rx = node.x - centerX;
    const ry = node.y - centerY;
    const nodeVx = vx - omega * ry;
    const nodeVy = vy + omega * rx;
    return {
      x: node.x,
      y: node.y,
      ox: node.x - nodeVx * FIXED_DT,
      oy: node.y - nodeVy * FIXED_DT,
    };
  };
  return {
    cfg: { wheelBase, wheelR: 18, headR: 11 },
    x: centerX,
    y: centerY,
    vx,
    vy,
    aOmega: omega,
    _dt: FIXED_DT,
    rear: withHistory(rear),
    front: withHistory(front),
    head: withHistory(head),
    metadata: { script: index, untouched: true },
  };
}

function flatTerrain() {
  const groundY = 360;
  const terrain = buildTerrain([[
    { x: -6000, y: groundY },
    { x: 9000, y: groundY },
  ]]);
  return {
    groundY,
    contact: (x, y, radius) => terrainContact(terrain, x, y, radius),
  };
}

const CRASH_MATRIX_CAUSES = Object.freeze(['terrain', 'platform', 'saw', 'mace', 'crusher', 'tnt']);
const CRASH_MATRIX_WORLDS = Object.freeze([
  { name: 'flat-dirt', slope: 0, surface: 'dirt' },
  { name: 'uphill-gravel', slope: -0.18, surface: 'gravel' },
  { name: 'downhill-ice', slope: 0.035, surface: 'ice' },
  { name: 'ledge-endpoint', slope: -0.06, surface: 'dirt', endpoint: true },
  { name: 'frozen-deck', slope: 0.04, surface: 'grated', platform: true },
]);

function crashMatrixContact(source, world) {
  const left = source.x - 6200;
  const right = source.x + 6200;
  const groundY = 370;
  const terrain = buildTerrain([[{
    x: left,
    y: groundY - world.slope * (source.x - left),
    surface: world.surface,
  }, {
    x: world.endpoint ? source.x + 520 : right,
    y: groundY + world.slope * (world.endpoint ? 520 : right - source.x),
    surface: world.surface,
  }], ...(world.endpoint ? [[
    { x: source.x + 500, y: groundY + 420, surface: 'dirt' },
    { x: right, y: groundY + 420, surface: 'dirt' },
  ]] : [])]);
  const platformTop = groundY - 22;
  const kinematics = world.platform ? { platforms: [{
    id: 'matrix-deck',
    current: {
      x: source.x,
      y: platformTop + 10,
      width: 260,
      height: 20,
      left: source.x - 130,
      right: source.x + 130,
      top: platformTop,
      bottom: platformTop + 20,
      surface: 'grated',
    },
  }] } : null;
  const field = createCrashContactField(terrain, kinematics);
  return (x, y, radius, node) => queryCrashContact(field, x, y, radius, node);
}

function assertFiniteAndBounded(pose, origin) {
  assert.ok(Number.isFinite(pose.elapsed));
  assert.ok(Number.isFinite(pose.rmsSpeed));
  assert.ok(Number.isFinite(pose.peakSpeed));
  assert.ok(pose.peakSpeed <= RAGDOLL_DEFAULTS.maxSpeed + 1e-7,
    `peak speed escaped cap: ${pose.peakSpeed}`);
  for (const node of pose.nodes) {
    for (const value of [node.x, node.y, node.vx, node.vy, node.radius]) {
      assert.ok(Number.isFinite(value), `${node.id} contains non-finite state`);
    }
    assert.ok(Math.hypot(node.vx, node.vy) <= RAGDOLL_DEFAULTS.maxSpeed + 1e-6,
      `${node.id} escaped speed cap`);
    assert.ok(Math.hypot(node.x - origin.x, node.y - origin.y) <= RAGDOLL_DEFAULTS.maxDistance + 1e-6,
      `${node.id} escaped world bound`);
  }
}

function assertConstraintStability(pose) {
  const byId = Object.fromEntries(pose.nodes.map((node) => [node.id, node]));
  for (const link of pose.links.filter((candidate) => candidate.kind === 'structure')) {
    const a = byId[link.a];
    const b = byId[link.b];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const relativeError = Math.abs(length - link.rest) / link.rest;
    // Contacts are resolved after every PBD iteration, so a limb pinned between
    // ground and bike may temporarily trade a little length for non-penetration.
    assert.ok(relativeError < 0.22,
      `${link.a}-${link.b} stretched ${(relativeError * 100).toFixed(1)}%`);
  }
}

test('30 named cause/world crashes stay finite, deterministic and settle by both groups', () => {
  for (let index = 0; index < 30; index++) {
    const cause = CRASH_MATRIX_CAUSES[Math.floor(index / CRASH_MATRIX_WORLDS.length)];
    const world = CRASH_MATRIX_WORLDS[index % CRASH_MATRIX_WORLDS.length];
    const scenario = `${cause}/${world.name}`;
    const source = crashSnapshot(index);
    const sourceBefore = structuredClone(source);
    const profile = normalizeCrashCause({ type: cause, intensity: 0.82 });
    const run = () => {
      const contact = crashMatrixContact(source, world);
      const ragdoll = createRagdoll(source, {
        contact,
        impulse: { spin: profile.riderImpulse.spin },
        riderImpulse: { x: profile.riderImpulse.radial * (index % 2 ? -1 : 1),
          y: -profile.riderImpulse.lift },
        bikeImpulse: { x: profile.bikeImpulse.radial * (index % 2 ? -1 : 1),
          y: -profile.bikeImpulse.lift },
        releaseTethers: profile.releaseTethers,
      });
      const origin = { x: source.x, y: source.y };
      let pose = readRagdoll(ragdoll);
      assert.deepEqual(pose.nodes.map((node) => node.id), REQUIRED_PARTS, scenario);
      for (let frame = 0; frame < 13 * 60 && !ragdoll.settled; frame++) {
        stepRagdoll(ragdoll, 1 / 60);
        if (frame % 20 === 0) {
          pose = readRagdoll(ragdoll);
          assertFiniteAndBounded(pose, origin);
          assertConstraintStability(pose);
        }
      }
      pose = readRagdoll(ragdoll);
      assertFiniteAndBounded(pose, origin);
      assertConstraintStability(pose);
      assert.equal(pose.settled, true, `${scenario} never settled`);
      assert.equal(pose.settleReason, 'sleep', `${scenario} reached only the lifetime fallback`);
      assert.ok(pose.nodes.some((node) => node.group === 'bike' && node.contacts > 0),
        `${scenario} bike never contacted its world`);
      assert.ok(pose.nodes.some((node) => node.group === 'rider' && node.contacts > 0),
        `${scenario} rider never contacted its world`);
      assert.equal(pose.invalidRecoveries, 0, `${scenario} masked invalid solver state`);
      return pose;
    };
    assert.deepEqual(run(), run(), `${scenario} did not replay exactly`);
    assert.deepEqual(source, sourceBefore, `${scenario} mutated its source bike`);
  }
});

test('the same crash and frame script produce an exact deterministic replay', () => {
  const source = crashSnapshot(17);
  const sourceBefore = structuredClone(source);
  const run = () => {
    const { contact } = flatTerrain();
    const ragdoll = createRagdoll(source, {
      contact,
      impulse: { x: 77, y: -143, spin: 0.44 },
    });
    const frameScript = [1 / 60, 1 / 120, 1 / 40, 1 / 30, 1 / 75];
    for (let frame = 0; frame < 640 && !ragdoll.settled; frame++) {
      stepRagdoll(ragdoll, frameScript[frame % frameScript.length]);
    }
    return readRagdoll(ragdoll);
  };

  const first = run();
  const second = run();
  assert.deepEqual(second, first);
  assert.deepEqual(source, sourceBefore);
});

test('reduced motion returns a static, readable crash pose and never simulates', () => {
  const source = crashSnapshot(4);
  const sourceBefore = structuredClone(source);
  let contactCalls = 0;
  const ragdoll = createRagdoll(source, {
    reducedMotion: true,
    contact: () => {
      contactCalls++;
      return null;
    },
    impulse: { x: 1000, y: -1000, spin: 9 },
  });
  const before = readRagdoll(ragdoll);
  const creationContactCalls = contactCalls;
  for (let i = 0; i < 240; i++) stepRagdoll(ragdoll, 1 / 30);
  const after = readRagdoll(ragdoll);

  assert.deepEqual(after, before);
  assert.equal(after.active, false);
  assert.equal(after.settled, true);
  assert.equal(after.settleReason, 'reduced-motion');
  assert.equal(after.reducedMotion, true);
  assert.equal(after.elapsed, 0);
  assert.ok(creationContactCalls > 0, 'static creation did not inspect supplied terrain');
  assert.equal(contactCalls, creationContactCalls, 'settled reduced pose continued simulating contacts');
  assert.ok(Number.isFinite(ragdollAngle(after)));
  assert.ok(after.nodes.every((node) => node.vx === 0 && node.vy === 0));
  assert.deepEqual(after.nodes.map((node) => node.id), REQUIRED_PARTS);
  assert.deepEqual(source, sourceBefore);
});

test('reduced-motion creation projects every part out of sloped terrain deterministically', () => {
  const makeRun = () => {
    const terrain = buildTerrain([[
      { x: -500, y: 340 },
      { x: 500, y: 140 },
    ]]);
    const angle = Math.atan2(-200, 1000);
    const forward = { x: Math.cos(angle), y: Math.sin(angle) };
    const up = { x: forward.y, y: -forward.x };
    const center = { x: 0, y: 255 };
    const history = (x, y) => ({ x, y, ox: x, oy: y });
    const source = {
      ...center,
      vx: 0,
      vy: 0,
      aOmega: 0,
      _dt: FIXED_DT,
      cfg: { wheelBase: 80, wheelR: 18, headR: 11 },
      rear: history(center.x - forward.x * 40, center.y - forward.y * 40),
      front: history(center.x + forward.x * 40, center.y + forward.y * 40),
      head: history(center.x + up.x * 44 - forward.x * 3,
        center.y + up.y * 44 - forward.y * 3),
    };
    const sourceBefore = structuredClone(source);
    const contact = (x, y, radius) => terrainContact(terrain, x, y, radius);
    const pose = readRagdoll(createRagdoll(source, { reducedMotion: true, contact }));
    return { terrain, source, sourceBefore, pose };
  };

  const first = makeRun();
  const second = makeRun();
  assert.deepEqual(first.pose, second.pose);
  assert.deepEqual(first.source, first.sourceBefore);
  for (const node of first.pose.nodes) {
    assert.equal(terrainContact(first.terrain, node.x, node.y, node.radius), null,
      `${node.id} remained embedded in the slope`);
  }
  assertConstraintStability(first.pose);
  assert.equal(first.pose.settleReason, 'reduced-motion');
  assert.equal(first.pose.contactCount, 0,
    'creation-time pose projection should not count as a physical simulation contact');
});

test('contact friction and contact accounting apply once per physical substep', () => {
  const speed = 400;
  const history = (x, y) => ({ x, y, ox: x - speed * FIXED_DT, oy: y });
  const source = {
    x: 0,
    y: 0,
    vx: speed,
    vy: 0,
    aOmega: 0,
    _dt: FIXED_DT,
    cfg: { wheelBase: 80, wheelR: 18, headR: 11 },
    rear: history(-40, 0),
    front: history(40, 0),
    head: history(-3, -44),
  };
  const run = (solverIterations) => {
    const ragdoll = createRagdoll(source, {
      velocityScale: 1,
      contact: () => ({ pen: 0.01, nx: 0, ny: -1, friction: 0.25 }),
      config: {
        gravity: 0,
        damping: 1,
        solverIterations,
        minSettleTime: 10,
        maxLife: 20,
      },
    });
    stepRagdoll(ragdoll, FIXED_DT);
    const first = readRagdoll(ragdoll);
    stepRagdoll(ragdoll, FIXED_DT);
    const second = readRagdoll(ragdoll);
    return { first, second };
  };

  const oneIteration = run(1);
  const eightIterations = run(8);
  for (const result of [oneIteration, eightIterations]) {
    assert.equal(result.first.contactCount, REQUIRED_PARTS.length);
    assert.ok(result.first.nodes.every((node) => node.contacts === 1));
    assert.ok(result.first.nodes.every((node) => Math.abs(node.vx - speed * 0.75) < 1e-7));
    assert.equal(result.second.contactCount, REQUIRED_PARTS.length * 2);
    assert.ok(result.second.nodes.every((node) => node.contacts === 2));
    assert.ok(result.second.nodes.every((node) => Math.abs(node.vx - speed * 0.75 ** 2) < 1e-7));
  }
  for (let index = 0; index < REQUIRED_PARTS.length; index++) {
    assert.ok(Math.abs(oneIteration.first.nodes[index].vx - eightIterations.first.nodes[index].vx) < 1e-9);
    assert.ok(Math.abs(oneIteration.second.nodes[index].vx - eightIterations.second.nodes[index].vx) < 1e-9);
  }
});

test('initial telemetry is derived from capped node histories', () => {
  const source = crashSnapshot(2);
  const ragdoll = createRagdoll(source, {
    velocityX: 1e9,
    velocityY: -1e9,
    angularVelocity: 1e7,
    impulse: { x: 1e9, y: -1e9, spin: 1e6 },
  });
  const pose = readRagdoll(ragdoll);
  const speeds = pose.nodes.map((node) => Math.hypot(node.vx, node.vy));
  const expectedRms = Math.sqrt(speeds.reduce((sum, speed) => sum + speed * speed, 0)
    / speeds.length);
  assert.ok(speeds.every((speed) => speed <= RAGDOLL_DEFAULTS.maxSpeed + 1e-6));
  assert.ok(Math.abs(pose.rmsSpeed - expectedRms) < 1e-7);
  assert.ok(Math.abs(pose.peakSpeed - Math.max(...speeds)) < 1e-7);
  assert.equal(pose.invalidRecoveries, 0);
});

test('renderer snapshots reuse buffers without exposing simulation state', () => {
  const { contact } = flatTerrain();
  const ragdoll = createRagdoll(crashSnapshot(6), { contact });
  const target = {};
  const first = readRagdoll(ragdoll, target);
  const nodeBuffer = first.nodes;
  const linkBuffer = first.links;
  const firstNode = first.nodes[0];
  stepRagdoll(ragdoll, 1 / 60);
  const second = readRagdoll(ragdoll, target);
  assert.equal(second.nodes, nodeBuffer);
  assert.equal(second.links, linkBuffer);
  assert.equal(second.nodes[0], firstNode);

  const detached = readRagdoll(ragdoll);
  detached.nodes[0].x = Infinity;
  detached.links[0].rest = -1;
  if (detached.lastImpact) detached.lastImpact.speed = Infinity;
  const clean = readRagdoll(ragdoll);
  assert.ok(Number.isFinite(clean.nodes[0].x));
  assert.ok(clean.links[0].rest > 0);
  assert.ok(!clean.lastImpact || Number.isFinite(clean.lastImpact.speed));
});

test('impact beats are deterministic, bounded, drainable and detached', () => {
  const source = crashSnapshot(9);
  const run = () => {
    const ragdoll = createRagdoll(source, {
      velocityX: 0,
      velocityY: 900,
      angularVelocity: 0,
      contact: () => ({ pen: 0.01, nx: 0, ny: -1, friction: 0.2,
        surface: 'steel', kind: 'platform', id: 'test-deck' }),
      config: { gravity: 0, damping: 1, impactThreshold: 100, maxImpactEvents: 3,
        minSettleTime: 10, maxLife: 20 },
    });
    stepRagdoll(ragdoll, FIXED_DT);
    const before = readRagdoll(ragdoll);
    const events = drainRagdollImpacts(ragdoll);
    const after = readRagdoll(ragdoll);
    return { ragdoll, before, events, after };
  };
  const first = run();
  const second = run();
  assert.equal(first.before.impactCount, REQUIRED_PARTS.length);
  assert.equal(first.before.pendingImpacts, 3);
  assert.equal(first.before.droppedImpacts, REQUIRED_PARTS.length - 3);
  assert.equal(first.events.length, 3);
  assert.ok(first.events.every((event) => event.surface === 'steel'
    && event.kind === 'platform' && event.id === 'test-deck' && event.speed >= 100));
  assert.equal(first.after.pendingImpacts, 0);
  assert.deepEqual(first.events, second.events);
  first.events[0].speed = Infinity;
  assert.ok(Number.isFinite(readRagdoll(first.ragdoll).lastImpact.speed));
});

test('cause profiles can separate rider and bike while releasing only named tethers', () => {
  const ragdoll = createRagdoll(crashSnapshot(12), {
    velocityX: 0,
    velocityY: 0,
    angularVelocity: 0,
    riderImpulse: { x: 220, y: -140 },
    bikeImpulse: { x: -80, y: 30 },
    releaseTethers: ['hip', 'rearHand', 'frontHand'],
  });
  const pose = readRagdoll(ragdoll);
  const groupAverage = (group, axis) => {
    const nodes = pose.nodes.filter((node) => node.group === group);
    return nodes.reduce((sum, node) => sum + node[axis], 0) / nodes.length;
  };
  assert.ok(groupAverage('rider', 'vx') - groupAverage('bike', 'vx') > 250);
  assert.ok(groupAverage('bike', 'vy') - groupAverage('rider', 'vy') > 130);
  assert.equal(pose.brokenTethers, 3);
  assert.ok(!pose.links.some((link) => link.kind === 'tether'
    && (link.a === 'hip' || link.a === 'rearHand' || link.a === 'frontHand')));
  assert.ok(pose.links.some((link) => link.kind === 'tether' && link.a === 'rearFoot'));
});

test('fixed-step partitioning is exact for equal elapsed presentation time', () => {
  const source = crashSnapshot(19);
  const run = (frames, dt) => {
    const { contact } = flatTerrain();
    const ragdoll = createRagdoll(source, { contact, impulse: { x: 31, y: -72, spin: 0.3 } });
    for (let index = 0; index < frames; index++) stepRagdoll(ragdoll, dt);
    return readRagdoll(ragdoll);
  };
  assert.deepEqual(run(120, 1 / 60), run(60, 1 / 30));
});

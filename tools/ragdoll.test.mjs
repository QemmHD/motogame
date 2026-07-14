import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTerrain, terrainContact } from '../public/physics.js';
import {
  RAGDOLL_DEFAULTS,
  createRagdoll,
  ragdollAngle,
  readRagdoll,
  stepRagdoll,
} from '../public/ragdoll.js';

const FIXED_DT = 1 / 120;
const REQUIRED_PARTS = [
  'rearWheel', 'frontWheel', 'bikeFrame', 'seat', 'handlebar',
  'hip', 'torso', 'head', 'helmet',
  'rearHand', 'frontHand', 'rearFoot', 'frontFoot',
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

test('30 scripted crashes stay finite, stable and settle on terrain', () => {
  for (let index = 0; index < 30; index++) {
    const source = crashSnapshot(index);
    const sourceBefore = structuredClone(source);
    const { groundY, contact } = flatTerrain();
    const ragdoll = createRagdoll(source, {
      contact,
      impulse: {
        x: ((index % 3) - 1) * 85,
        y: -35 - (index % 4) * 24,
        spin: ((index % 5) - 2) * 0.28,
      },
    });
    const origin = { x: source.x, y: source.y };
    let pose = readRagdoll(ragdoll);
    assert.deepEqual(pose.nodes.map((node) => node.id), REQUIRED_PARTS);

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
    assert.equal(pose.settled, true, `script ${index} never settled`);
    assert.equal(pose.settleReason, 'sleep', `script ${index} reached only the lifetime fallback`);
    assert.ok(pose.contactCount > 0, `script ${index} never contacted terrain`);
    assert.ok(pose.nodes.some((node) => node.contacts > 0 && node.y <= groundY + 1e-6),
      `script ${index} did not settle against the ground`);
    assert.deepEqual(source, sourceBefore, `script ${index} mutated its source bike`);
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

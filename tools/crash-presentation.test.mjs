import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CRASH_CAUSE_IDS,
  CRASH_CAUSE_PROFILES,
  CRASH_PRESENTATION_LIMITS,
  buildCrashCameraPolicy,
  crashNoise,
  crashSignedNoise,
  hashCrashSeed,
  measureCrashPoseBounds,
  normalizeCrashCause,
} from '../public/crash-presentation.js';

function assertFiniteTree(value, path = 'value') {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${path} is finite`);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) assertFiniteTree(child, `${path}.${key}`);
}

function poseFixture() {
  return {
    nodes: [
      { id: 'rearWheel', x: 100, y: 240, radius: 18 },
      { id: 'frontWheel', x: 184, y: 226, radius: 18 },
      { id: 'hip', x: 139, y: 200, radius: 8 },
      { id: 'helmet', x: 174, y: 164, radius: 12 },
    ],
  };
}

test('all authored causes normalize to detached finite presentation profiles', () => {
  assert.deepEqual(Object.keys(CRASH_CAUSE_PROFILES), CRASH_CAUSE_IDS);
  for (const type of CRASH_CAUSE_IDS) {
    const normalized = normalizeCrashCause({ type, x: 42, y: -17, intensity: 1.25 });
    assert.equal(normalized.type, type);
    assert.equal(normalized.label, CRASH_CAUSE_PROFILES[type].label);
    assert.match(normalized.accent, /^#[0-9a-f]{6}$/i);
    assert.equal(typeof normalized.impactGlyph, 'string');
    assert.ok(normalized.impactGlyph.length > 0);
    assert.ok(Array.isArray(normalized.releaseTethers));
    assert.notEqual(normalized.releaseTethers, CRASH_CAUSE_PROFILES[type].releaseTethers);
    assert.ok(Object.isFrozen(normalized));
    assert.ok(Object.isFrozen(normalized.riderImpulse));
    assert.ok(Object.isFrozen(normalized.bikeImpulse));
    assert.ok(Object.isFrozen(normalized.releaseTethers));
    assertFiniteTree(normalized);
  }
});

test('malformed causes use the safe collision fallback without changing their source', () => {
  const cyclic = { type: 'not-a-cause', x: Infinity, y: Number.NaN, intensity: 999 };
  cyclic.self = cyclic;
  const beforeKeys = Object.keys(cyclic);
  const result = normalizeCrashCause(cyclic);
  assert.equal(result.type, 'collision');
  assert.equal(result.x, null);
  assert.equal(result.y, null);
  assert.equal(result.intensity, 2);
  assert.deepEqual(Object.keys(cyclic), beforeKeys);
  assert.equal(cyclic.self, cyclic);
  assert.equal(cyclic.type, 'not-a-cause');
  assert.equal(normalizeCrashCause(null).type, 'collision');
  assert.equal(normalizeCrashCause({ reason: { type: 'TNT' } }).type, 'tnt');
  assert.equal(normalizeCrashCause('void').type, 'fallout');
});

test('crash hashes and stateless noise are deterministic, finite, and lane-separated', () => {
  const source = { tick: 920, cause: 'mace', point: { y: 11, x: 8 } };
  const before = structuredClone(source);
  const hash = hashCrashSeed('level-8', source, 4);
  assert.equal(hash, hashCrashSeed('level-8', { point: { x: 8, y: 11 }, cause: 'mace', tick: 920 }, 4));
  assert.notEqual(hash, hashCrashSeed('level-8', source, 5));
  assert.equal(crashNoise(hash, 'sparks'), crashNoise(hash, 'sparks'));
  assert.notEqual(crashNoise(hash, 'sparks'), crashNoise(hash, 'dust'));
  for (let lane = 0; lane < 100; lane++) {
    const noise = crashNoise(hash, lane);
    const signed = crashSignedNoise(hash, lane);
    assert.ok(noise >= 0 && noise < 1);
    assert.ok(signed >= -1 && signed < 1);
  }
  assert.deepEqual(source, before);
  const cycle = {}; cycle.self = cycle;
  assert.ok(Number.isInteger(hashCrashSeed(cycle)));
});

test('ragdoll bounds stay finite and bounded without retaining or mutating the pose', () => {
  const pose = poseFixture();
  pose.nodes.push(
    { id: 'bad', x: Infinity, y: Number.NaN, radius: 1e9 },
    { id: 'far', x: 1e300, y: -1e300, radius: 1e300 },
  );
  const before = structuredClone(pose);
  const bounds = measureCrashPoseBounds(pose);
  assertFiniteTree(bounds);
  assert.ok(bounds.width >= CRASH_PRESENTATION_LIMITS.minPoseExtent);
  assert.ok(bounds.height >= CRASH_PRESENTATION_LIMITS.minPoseExtent);
  assert.ok(bounds.width <= CRASH_PRESENTATION_LIMITS.maxPoseSpan);
  assert.ok(bounds.height <= CRASH_PRESENTATION_LIMITS.maxPoseSpan);
  assert.equal(bounds.nodeCount, 5);
  assert.equal(bounds.ignoredNodes, 1);
  assert.ok(Object.isFrozen(bounds));
  assert.deepEqual(pose, before);

  const empty = measureCrashPoseBounds(null, { fallbackX: 500, fallbackY: 300 });
  assert.equal(empty.centerX, 500);
  assert.equal(empty.centerY, 300);
  assert.equal(empty.nodeCount, 0);
});

test('Reduced Motion keeps constant zoom and removes every impact transient', () => {
  const pose = poseFixture();
  const policies = [0, 0.04, 0.3, 4].map(age => buildCrashCameraPolicy({
    pose,
    age,
    seed: 93,
    cause: { type: 'tnt', intensity: 2 },
    viewport: { width: 390, height: 844 },
    reducedMotion: true,
  }));
  for (const policy of policies) {
    assert.equal(policy.zoom, 1);
    assert.equal(policy.viewHeight, 460);
    assert.equal(policy.viewH, 460);
    assert.equal(policy.roll, 0);
    assert.equal(policy.kickX, 0);
    assert.equal(policy.kickY, 0);
    assert.equal(policy.shake, 0);
    assert.equal(policy.hitstop, 0);
    assert.equal(policy.flash, 0);
    assert.equal(policy.slow, 1);
    assert.equal(policy.compact, true);
    assertFiniteTree(policy);
  }
  assert.deepEqual(policies.map(({ zoom, viewHeight }) => ({ zoom, viewHeight })), [
    { zoom: 1, viewHeight: 460 },
    { zoom: 1, viewHeight: 460 },
    { zoom: 1, viewHeight: 460 },
    { zoom: 1, viewHeight: 460 },
  ]);
});

test('dynamic camera framing is deterministic, bounded, and mobile-safe', () => {
  const pose = { nodes: [
    { x: -300, y: 120, radius: 20 },
    { x: 300, y: 360, radius: 20 },
  ] };
  const options = {
    pose,
    age: 0.03,
    seed: 'course-16:tick-440',
    cause: { type: 'barrel', intensity: 1.8 },
    viewport: { width: 390, height: 844 },
  };
  const first = buildCrashCameraPolicy(options);
  const second = buildCrashCameraPolicy(options);
  assert.deepEqual(first, second);
  assert.equal(first.compact, true);
  assertFiniteTree(first);
  assert.ok(first.viewHeight >= CRASH_PRESENTATION_LIMITS.minViewHeight);
  assert.ok(first.viewHeight <= CRASH_PRESENTATION_LIMITS.maxViewHeight);
  assert.ok(first.zoom > 0);
  assert.ok(Math.abs(first.roll) <= CRASH_PRESENTATION_LIMITS.maxRoll);
  assert.ok(Math.abs(first.kickX) <= CRASH_PRESENTATION_LIMITS.maxKick);
  assert.ok(Math.abs(first.kickY) <= CRASH_PRESENTATION_LIMITS.maxKick);
  assert.ok(first.shake <= CRASH_PRESENTATION_LIMITS.maxShake);
  assert.ok(first.hitstop <= CRASH_PRESENTATION_LIMITS.maxHitstop);
  assert.ok(first.flash <= CRASH_PRESENTATION_LIMITS.maxFlash);
  assert.ok(first.slow >= CRASH_PRESENTATION_LIMITS.minSlow && first.slow <= 1);
  const requiredFitHeight = Math.max(first.bounds.height + 124,
    (first.bounds.width + 124) / (390 / 844));
  assert.ok(first.viewHeight + 1e-9 >= Math.min(requiredFitHeight,
    CRASH_PRESENTATION_LIMITS.maxViewHeight));

  const malformed = buildCrashCameraPolicy({
    pose: { nodes: [{ x: Number.NaN, y: Infinity, radius: -Infinity }] },
    viewport: { width: Number.NaN, height: 0 },
    age: Infinity,
    cause: { type: '???', intensity: Number.NaN },
  });
  assertFiniteTree(malformed);
  assert.ok(malformed.viewHeight >= CRASH_PRESENTATION_LIMITS.minViewHeight);
  assert.ok(malformed.viewHeight <= CRASH_PRESENTATION_LIMITS.maxViewHeight);
});

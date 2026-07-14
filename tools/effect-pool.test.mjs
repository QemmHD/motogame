import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EFFECT_POOL_LIMITS,
  createEffectPool,
} from '../public/effect-pool.js';

function serialPool(capacity) {
  return createEffectPool({
    capacity,
    defaults: { serial: -1, life: 0, visible: false, label: 'idle' },
  });
}

test('validates capacity and requires a reset strategy', () => {
  for (const capacity of [0, -1, 1.5, Number.NaN, Infinity, EFFECT_POOL_LIMITS.maxCapacity + 1]) {
    assert.throws(() => createEffectPool({ capacity, defaults: { x: 0 } }), /capacity/);
  }
  assert.throws(() => createEffectPool({ capacity: 2 }), /defaults or an initialize hook/);
  assert.throws(
    () => createEffectPool({ capacity: 2, defaults: { nested: { x: 0 } } }),
    /must be a scalar/,
  );
});

test('hard capacity bounds identities through thousands of churn cycles', () => {
  const capacity = 7;
  const acquisitions = 20_000;
  const pool = serialPool(capacity);
  const identities = new Set();
  let firstLease;

  for (let serial = 0; serial < acquisitions; serial += 1) {
    const lease = pool.acquire({ serial, life: serial % 11, visible: true });
    if (serial === 0) firstLease = lease;
    const effect = pool.get(lease);
    identities.add(effect);
    assert.equal(effect.serial, serial);
    assert.equal(effect.life, serial % 11);
    assert.equal(effect.visible, true);
    assert.equal(effect.label, 'idle');
  }

  assert.equal(identities.size, capacity, 'pool created more identities than its hard capacity');
  assert.equal(pool.has(firstLease), false, 'the first evicted lease remained valid');
  assert.deepEqual({ ...pool.stats }, {
    capacity,
    active: capacity,
    free: 0,
    created: capacity,
    reused: acquisitions - capacity,
    evicted: acquisitions - capacity,
    peak: capacity,
  });
});

test('full pools evict the oldest active effect in deterministic order', () => {
  const pool = serialPool(3);
  const a = pool.acquire({ serial: 1 });
  const b = pool.acquire({ serial: 2 });
  const c = pool.acquire({ serial: 3 });
  const aIdentity = pool.get(a);
  const bIdentity = pool.get(b);
  const cIdentity = pool.get(c);

  assert.equal(pool.release(b), true);
  const d = pool.acquire({ serial: 4 });
  assert.strictEqual(pool.get(d), bIdentity, 'released slots should rotate back through free storage');

  const e = pool.acquire({ serial: 5 });
  assert.equal(pool.has(a), false, 'oldest active lease A should be evicted first');
  assert.strictEqual(pool.get(e), aIdentity);
  assert.equal(pool.has(c), true);
  assert.equal(pool.has(d), true);

  const f = pool.acquire({ serial: 6 });
  assert.equal(pool.has(c), false, 'C should be oldest after A is replaced');
  assert.strictEqual(pool.get(f), cIdentity);
  assert.equal(pool.get(d).serial, 4);
  assert.equal(pool.get(e).serial, 5);
  assert.equal(pool.get(f).serial, 6);
  assert.equal(pool.stats.evicted, 2);
});

test('clear invalidates leases and reuses existing values without recreating storage', () => {
  let factoryCalls = 0;
  const pool = createEffectPool({
    capacity: 4,
    defaults: { serial: -1, opacity: 1 },
    create(slot) {
      factoryCalls += 1;
      return { slot, serial: -99, opacity: -99 };
    },
  });
  const firstLeases = Array.from({ length: 4 }, (_, serial) => pool.acquire({ serial }));
  const firstValues = firstLeases.map((lease) => pool.get(lease));

  assert.equal(pool.clear(), 4);
  assert.equal(pool.clear(), 0);
  assert.equal(pool.stats.active, 0);
  assert.equal(pool.stats.free, 4);
  for (const lease of firstLeases) assert.equal(pool.has(lease), false);

  const secondLeases = Array.from(
    { length: 4 },
    (_, serial) => pool.acquire({ serial: serial + 10, opacity: 0.5 }),
  );
  const secondValues = secondLeases.map((lease) => pool.get(lease));
  assert.deepEqual(secondValues, firstValues, 'clear should preserve and reuse value identities by slot');
  assert.equal(factoryCalls, 4);
  assert.equal(pool.stats.created, 4);
  assert.equal(pool.stats.reused, 4);
  assert.equal(pool.stats.peak, 4);
});

test('unique leases and generations reject stale releases after slot reuse', () => {
  const pool = serialPool(1);
  const first = pool.acquire({ serial: 1 });
  const identity = pool.get(first);
  const firstGeneration = pool.generationOf(first);
  const second = pool.acquire({ serial: 2 });

  assert.notEqual(second, first);
  assert.strictEqual(pool.get(second), identity);
  assert.equal(pool.generationOf(second), firstGeneration + 1);
  assert.equal(pool.release(first), false, 'evicted lease released its replacement');
  assert.equal(pool.stats.active, 1);
  assert.equal(pool.get(second).serial, 2);

  assert.equal(pool.release(second), true);
  assert.equal(pool.release(second), false, 'double release should be harmless');
  const third = pool.acquire({ serial: 3 });
  assert.strictEqual(pool.get(third), identity);
  assert.equal(pool.release(second), false, 'released lease became valid after another reuse');
  assert.equal(pool.has(third), true);
});

test('active iteration tolerates current and future release without visiting new effects', () => {
  const pool = serialPool(8);
  const leases = Array.from({ length: 8 }, (_, serial) => pool.acquire({ serial }));
  const seen = [];
  let replacement;

  const visited = pool.forEachActive((effect, lease, slot, generation) => {
    seen.push(effect.serial);
    assert.equal(pool.generationOf(lease), generation);
    assert.ok(Number.isInteger(slot));
    if (effect.serial === 0) {
      assert.equal(pool.release(lease), true);
      replacement = pool.acquire({ serial: 99 });
    }
    if (effect.serial === 1) {
      assert.equal(pool.release(leases[6]), true);
    }
    if (effect.serial >= 2 && effect.serial !== 6) pool.release(lease);
  });

  assert.deepEqual(seen, [0, 1, 2, 3, 4, 5, 7]);
  assert.equal(visited, seen.length);
  assert.equal(seen.includes(99), false, 'effect acquired mid-pass was updated in the same pass');
  assert.equal(pool.has(replacement), true);
  assert.equal(pool.stats.active, 2, 'only serial 1 and the replacement should remain active');

  const nextPass = [];
  pool.forEachActive((effect) => nextPass.push(effect.serial));
  assert.deepEqual(nextPass.sort((a, b) => a - b), [1, 99]);
});

test('schema mode resets fields without mutating defaults or acquisition sources', () => {
  const defaults = { x: 1, y: 2, label: 'dust', visible: false };
  const source = { x: 9, visible: true };
  const defaultsBefore = { ...defaults };
  const sourceBefore = { ...source };
  const pool = createEffectPool({ capacity: 1, defaults });

  const first = pool.acquire(source);
  assert.deepEqual(source, sourceBefore);
  assert.deepEqual(defaults, defaultsBefore);
  assert.deepEqual(pool.get(first), { x: 9, y: 2, label: 'dust', visible: true });

  pool.get(first).y = 500;
  pool.get(first).label = 'changed';
  pool.release(first);
  defaults.x = -100;
  const second = pool.acquire({ y: 7 });
  assert.deepEqual(pool.get(second), { x: 1, y: 7, label: 'dust', visible: false });
  assert.throws(() => pool.acquire({ typo: 1 }), /unknown key typo/);
});

test('custom create and initialize hooks support preallocated nested effect state', () => {
  const sources = [];
  const pool = createEffectPool({
    capacity: 1,
    create: (slot) => ({ slot, point: { x: 0, y: 0 }, color: '' }),
    initialize(effect, source, slot, generation, lease) {
      sources.push(source);
      effect.point.x = source.x;
      effect.point.y = source.y;
      effect.color = source.color;
      assert.equal(effect.slot, slot);
      assert.ok(generation >= 1);
      assert.ok(Number.isSafeInteger(lease));
    },
  });
  const source = Object.freeze({ x: 12, y: -4, color: '#f80' });
  const lease = pool.acquire(source);

  assert.strictEqual(sources[0], source);
  assert.deepEqual(pool.get(lease), {
    slot: 0,
    point: { x: 12, y: -4 },
    color: '#f80',
  });
  const value = pool.get(lease);
  const point = value.point;
  pool.release(lease);
  const nextSource = Object.freeze({ x: -8, y: 15, color: '#09f' });
  const nextLease = pool.acquire(nextSource);
  assert.strictEqual(pool.get(nextLease), value);
  assert.strictEqual(pool.get(nextLease).point, point, 'nested state should stay preallocated');
  assert.deepEqual(pool.get(nextLease).point, { x: -8, y: 15 });
  assert.deepEqual(nextSource, { x: -8, y: 15, color: '#09f' });
});

test('stats are a stable finite live view', () => {
  const pool = serialPool(5);
  const stats = pool.stats;
  assert.strictEqual(pool.stats, stats);
  for (let index = 0; index < 1000; index += 1) {
    const lease = pool.acquire({ serial: index });
    if (index % 3 === 0) pool.release(lease);
  }
  assert.strictEqual(pool.stats, stats);
  for (const key of ['capacity', 'active', 'free', 'created', 'reused', 'evicted', 'peak']) {
    assert.ok(Number.isFinite(stats[key]), `${key} was not finite`);
    assert.ok(stats[key] >= 0, `${key} was negative`);
  }
  assert.equal(stats.active + stats.free, stats.capacity);
  assert.ok(stats.created <= stats.capacity);
  assert.ok(stats.peak <= stats.capacity);
});

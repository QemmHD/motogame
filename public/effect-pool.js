// Bounded reusable storage for particles, popups, tracks, and other effects.
//
// The pool is deliberately DOM-free. `acquire()` returns a unique numeric
// lease instead of the pooled value itself: callers use `get(lease)` when they
// need direct access, or `forEachActive()` for the allocation-free hot path.
// Releasing an expired lease can therefore never release a newer effect that
// happens to reuse the same object and slot.

export const EFFECT_POOL_LIMITS = Object.freeze({
  maxCapacity: 1_000_000,
  maxLease: Number.MAX_SAFE_INTEGER,
});

const OWN = Object.prototype.hasOwnProperty;
const UNSAFE_SCHEMA_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertOptions(options) {
  if (!isPlainObject(options)) throw new TypeError('effect pool options must be a plain object');
  const capacity = options.capacity;
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > EFFECT_POOL_LIMITS.maxCapacity) {
    throw new RangeError(
      `effect pool capacity must be an integer from 1 to ${EFFECT_POOL_LIMITS.maxCapacity}`,
    );
  }
  if (options.create !== undefined && typeof options.create !== 'function') {
    throw new TypeError('effect pool create must be a function');
  }
  if (options.initialize !== undefined && typeof options.initialize !== 'function') {
    throw new TypeError('effect pool initialize must be a function');
  }
  if (options.defaults !== undefined && !isPlainObject(options.defaults)) {
    throw new TypeError('effect pool defaults must be a plain object');
  }
  if (options.defaults === undefined && options.initialize === undefined) {
    throw new TypeError('effect pool requires schema defaults or an initialize hook');
  }
}

function isScalar(value) {
  return value === null || (typeof value !== 'object' && typeof value !== 'function');
}

// Schema mode intentionally accepts scalar fields only. That keeps every
// assignment reference-safe and prevents a pooled effect from accidentally
// mutating a caller-owned nested object. Complex effects can preallocate their
// nested state in `create` and update it explicitly in `initialize`.
function snapshotSchema(defaults) {
  if (defaults === undefined) return null;
  const keys = Object.keys(defaults);
  const values = Object.create(null);
  for (const key of keys) {
    if (UNSAFE_SCHEMA_KEYS.has(key)) {
      throw new TypeError(`effect pool defaults contain unsafe key ${key}`);
    }
    const value = defaults[key];
    if (!isScalar(value)) {
      throw new TypeError(`effect pool default ${key} must be a scalar value`);
    }
    values[key] = value;
  }
  return Object.freeze({ keys: Object.freeze(keys), values: Object.freeze(values) });
}

function applySchema(target, source, schema, allowExtraSourceKeys) {
  if (!schema) return;
  if (source !== undefined && source !== null && !isPlainObject(source)) {
    if (!allowExtraSourceKeys) {
      throw new TypeError('effect pool schema source must be a plain object');
    }
    source = null;
  }

  if (source && !allowExtraSourceKeys) {
    for (const key of Object.keys(source)) {
      if (!OWN.call(schema.values, key)) {
        throw new TypeError(`effect pool schema source contains unknown key ${key}`);
      }
    }
  }

  for (const key of schema.keys) {
    const value = source && OWN.call(source, key) ? source[key] : schema.values[key];
    if (!isScalar(value)) {
      throw new TypeError(`effect pool schema value ${key} must be a scalar value`);
    }
    target[key] = value;
  }
}

function incrementFinite(value) {
  return value < Number.MAX_SAFE_INTEGER ? value + 1 : Number.MAX_SAFE_INTEGER;
}

/**
 * Creates a fixed-capacity effect pool.
 *
 * Options:
 * - capacity: positive hard limit.
 * - defaults: optional scalar field schema, snapshotted at construction.
 * - create(slot): optional lazy factory, called at most once per slot.
 * - initialize(value, source, slot, generation, lease): optional acquire hook.
 *
 * The initialize hook may read arbitrary source data. The pool itself never
 * writes to options, defaults, or acquisition sources; any mutation performed
 * inside a caller-supplied hook remains the caller's responsibility.
 */
export function createEffectPool(options) {
  assertOptions(options);

  const capacity = options.capacity;
  const schema = snapshotSchema(options.defaults);
  const create = options.create ?? (() => ({}));
  const initialize = options.initialize ?? null;

  // These arrays are allocated exactly once. Values themselves are lazy so a
  // large capacity does not force factories to run before an effect is needed.
  const values = new Array(capacity);
  const createdSlots = new Uint8Array(capacity);
  const activeSlots = new Uint8Array(capacity);
  const generations = new Float64Array(capacity);
  const leases = new Float64Array(capacity);
  const bornAt = new Float64Array(capacity);
  const activePrev = new Int32Array(capacity);
  const activeNext = new Int32Array(capacity);
  const freeNext = new Int32Array(capacity);
  activePrev.fill(-1);
  activeNext.fill(-1);
  for (let index = 0; index < capacity; index += 1) {
    freeNext[index] = index + 1 < capacity ? index + 1 : -1;
  }

  // Only active leases are retained, so this map is bounded by capacity.
  const leaseSlots = new Map();
  let freeHead = 0;
  let freeTail = capacity - 1;
  let activeHead = -1;
  let activeTail = -1;
  let activeCount = 0;
  let createdCount = 0;
  let reusedCount = 0;
  let evictedCount = 0;
  let peakCount = 0;
  let lastLease = 0;
  let initializing = false;

  function takeFree() {
    const index = freeHead;
    if (index < 0) return -1;
    freeHead = freeNext[index];
    freeNext[index] = -1;
    if (freeHead < 0) freeTail = -1;
    return index;
  }

  function appendFree(index) {
    freeNext[index] = -1;
    if (freeTail < 0) {
      freeHead = index;
      freeTail = index;
      return;
    }
    freeNext[freeTail] = index;
    freeTail = index;
  }

  function detachActive(index) {
    const previous = activePrev[index];
    const next = activeNext[index];
    if (previous >= 0) activeNext[previous] = next;
    else activeHead = next;
    if (next >= 0) activePrev[next] = previous;
    else activeTail = previous;
    activePrev[index] = -1;
    activeNext[index] = -1;
    activeSlots[index] = 0;
    activeCount -= 1;
  }

  function appendActive(index) {
    activePrev[index] = activeTail;
    activeNext[index] = -1;
    if (activeTail >= 0) activeNext[activeTail] = index;
    else activeHead = index;
    activeTail = index;
    activeSlots[index] = 1;
    activeCount += 1;
    if (activeCount > peakCount) peakCount = activeCount;
  }

  function nextUniqueLease() {
    if (lastLease >= EFFECT_POOL_LIMITS.maxLease) {
      throw new RangeError('effect pool exhausted its safe numeric lease space');
    }
    lastLease += 1;
    return lastLease;
  }

  function acquire(source) {
    if (initializing) throw new Error('effect pool acquire cannot reenter initialize');

    // Reserve identifiers before changing active state. Exhaustion therefore
    // cannot evict a still-valid effect.
    const lease = nextUniqueLease();
    const candidate = freeHead >= 0 ? freeHead : activeHead;
    if (candidate < 0) throw new Error('effect pool has no reusable slot');
    if (generations[candidate] >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError('effect pool slot exhausted its safe generation space');
    }

    let index = takeFree();
    if (index < 0) {
      index = activeHead;
      const displacedLease = leases[index];
      detachActive(index);
      leaseSlots.delete(displacedLease);
      leases[index] = 0;
      bornAt[index] = 0;
      evictedCount = incrementFinite(evictedCount);
    }

    const wasCreated = createdSlots[index] === 1;
    try {
      if (!wasCreated) {
        const value = create(index);
        if ((typeof value !== 'object' || value === null) && typeof value !== 'function') {
          throw new TypeError('effect pool create must return an object or function');
        }
        values[index] = value;
        createdSlots[index] = 1;
        createdCount += 1;
      }

      generations[index] += 1;
      leases[index] = lease;
      applySchema(values[index], source, schema, initialize !== null);
      if (initialize) {
        initializing = true;
        try {
          initialize(values[index], source, index, generations[index], lease);
        } finally {
          initializing = false;
        }
      }
    } catch (error) {
      // A failed initialization produces no active lease. The already-created
      // value stays available for the next attempt, preserving bounded storage.
      leases[index] = 0;
      bornAt[index] = 0;
      appendFree(index);
      throw error;
    }

    if (wasCreated) reusedCount = incrementFinite(reusedCount);
    bornAt[index] = lease;
    leaseSlots.set(lease, index);
    appendActive(index);
    return lease;
  }

  function get(lease) {
    const index = leaseSlots.get(lease);
    if (index === undefined || leases[index] !== lease || activeSlots[index] !== 1) {
      return undefined;
    }
    return values[index];
  }

  function has(lease) {
    return get(lease) !== undefined;
  }

  function generationOf(lease) {
    const index = leaseSlots.get(lease);
    if (index === undefined || leases[index] !== lease || activeSlots[index] !== 1) {
      return undefined;
    }
    return generations[index];
  }

  function release(lease) {
    const index = leaseSlots.get(lease);
    if (index === undefined || leases[index] !== lease || activeSlots[index] !== 1) {
      return false;
    }
    leaseSlots.delete(lease);
    detachActive(index);
    leases[index] = 0;
    bornAt[index] = 0;
    appendFree(index);
    return true;
  }

  function clear() {
    if (initializing) throw new Error('effect pool clear cannot run during initialize');
    const released = activeCount;
    leaseSlots.clear();
    activeHead = -1;
    activeTail = -1;
    activeCount = 0;
    freeHead = 0;
    freeTail = capacity - 1;
    for (let index = 0; index < capacity; index += 1) {
      activeSlots[index] = 0;
      leases[index] = 0;
      bornAt[index] = 0;
      activePrev[index] = -1;
      activeNext[index] = -1;
      freeNext[index] = index + 1 < capacity ? index + 1 : -1;
    }
    return released;
  }

  // Slot-order scanning is deliberate: it needs no temporary collection and
  // remains correct if the callback releases current or future effects. New
  // acquisitions receive a lease beyond the captured ceiling and are deferred
  // until the next pass, preventing loops or double updates.
  function forEachActive(callback, thisArg) {
    if (typeof callback !== 'function') {
      throw new TypeError('effect pool iteration callback must be a function');
    }
    const leaseCeiling = lastLease;
    let visited = 0;
    for (let index = 0; index < capacity; index += 1) {
      if (activeSlots[index] !== 1 || bornAt[index] > leaseCeiling) continue;
      const lease = leases[index];
      const generation = generations[index];
      visited += 1;
      if (callback.call(thisArg, values[index], lease, index, generation) === false) break;
    }
    return visited;
  }

  // A single stable stats view avoids allocating diagnostic objects every
  // frame. Counters saturate at MAX_SAFE_INTEGER instead of becoming Infinity.
  const stats = {};
  Object.defineProperties(stats, {
    capacity: { enumerable: true, value: capacity },
    active: { enumerable: true, get: () => activeCount },
    free: { enumerable: true, get: () => capacity - activeCount },
    created: { enumerable: true, get: () => createdCount },
    reused: { enumerable: true, get: () => reusedCount },
    evicted: { enumerable: true, get: () => evictedCount },
    peak: { enumerable: true, get: () => peakCount },
  });
  Object.freeze(stats);

  return Object.freeze({
    capacity,
    stats,
    acquire,
    get,
    has,
    generationOf,
    release,
    clear,
    forEachActive,
  });
}

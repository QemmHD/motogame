// Deterministic fixed-tick replay tapes for Moto Rush X3.
// This module deliberately has no DOM or game-state dependencies so tapes can
// be recorded, verified, and tested in browsers, workers, or Node.js.

export const REPLAY_SCHEMA_VERSION = 1;

export const REPLAY_INPUT = Object.freeze({
  GAS: 1 << 0,
  BRAKE: 1 << 1,
  LEAN_LEFT: 1 << 2,
  LEAN_RIGHT: 1 << 3,
  RESTART: 1 << 4,
});

const VALID_INPUT_MASK = Object.values(REPLAY_INPUT).reduce((mask, bit) => mask | bit, 0);
const NEUTRAL_INPUT = Object.freeze({ gas: false, brake: false, lean: 0, restart: false });

export const REPLAY_LIMITS = Object.freeze({
  maxTicks: 108_000, // 30 minutes at the game's fixed 60 Hz tick rate.
  maxRuns: 16_384,
  maxRunLength: 65_535,
  maxStringLength: 64,
  maxJsonBytes: 65_536,
  maxEncodedChars: 87_384,
});

const VERSION_FIELDS = Object.freeze([
  'buildVersion',
  'physicsVersion',
  'generatorVersion',
]);
const REPLAY_KEYS = Object.freeze([
  'schema',
  'levelId',
  ...VERSION_FIELDS,
  'tickCount',
  'finishTick',
  'stateHash',
  'runs',
]);
const COMPACT_KEYS = Object.freeze(['s', 'l', 'b', 'p', 'g', 't', 'f', 'h', 'r']);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:+-]*$/;
const HASH_PATTERN = /^[0-9a-f]{8}$/;
const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder('utf-8', { fatal: true });

function replayError(code, message) {
  const error = new Error(message);
  error.name = 'ReplayError';
  error.code = code;
  return error;
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw replayError('MALFORMED', `${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw replayError('MALFORMED', `${label} must be a plain object`);
  }
}

function assertExactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw replayError('MALFORMED', `${label} has unexpected or missing fields`);
  }
}

function assertSafeString(value, label) {
  if (typeof value !== 'string' || value.length < 1 || value.length > REPLAY_LIMITS.maxStringLength
      || !SAFE_ID.test(value)) {
    throw replayError(
      'MALFORMED',
      `${label} must be 1-${REPLAY_LIMITS.maxStringLength} URL-safe characters`,
    );
  }
  return value;
}

function assertInteger(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw replayError('MALFORMED', `${label} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function assertInputMask(mask) {
  assertInteger(mask, 0, VALID_INPUT_MASK, 'input mask');
  if ((mask & ~VALID_INPUT_MASK) !== 0) {
    throw replayError('MALFORMED', 'input mask contains unknown bits');
  }
  if ((mask & REPLAY_INPUT.LEAN_LEFT) && (mask & REPLAY_INPUT.LEAN_RIGHT)) {
    throw replayError('MALFORMED', 'input mask cannot lean left and right together');
  }
  return mask;
}

function cloneAndValidateRuns(runs, tickCount) {
  if (!Array.isArray(runs) || runs.length > REPLAY_LIMITS.maxRuns) {
    throw replayError('MALFORMED', `runs must be an array with at most ${REPLAY_LIMITS.maxRuns} entries`);
  }

  const clean = new Array(runs.length);
  let total = 0;
  let previousMask = -1;
  for (let index = 0; index < runs.length; index++) {
    const run = runs[index];
    if (!Array.isArray(run) || run.length !== 2) {
      throw replayError('MALFORMED', `run ${index} must be a [mask, count] pair`);
    }
    const mask = assertInputMask(run[0]);
    const count = assertInteger(run[1], 1, REPLAY_LIMITS.maxRunLength, `run ${index} count`);
    if (mask === previousMask) {
      throw replayError('MALFORMED', `adjacent run ${index} must use a different mask`);
    }
    total += count;
    if (total > REPLAY_LIMITS.maxTicks) {
      throw replayError('TOO_LARGE', `replay exceeds ${REPLAY_LIMITS.maxTicks} ticks`);
    }
    clean[index] = Object.freeze([mask, count]);
    previousMask = mask;
  }

  if (total !== tickCount || (tickCount === 0) !== (runs.length === 0)) {
    throw replayError('MALFORMED', 'run lengths do not equal tickCount');
  }
  return Object.freeze(clean);
}

function normalizeReplay(value, requireExactKeys = true) {
  assertPlainObject(value, 'replay');
  if (requireExactKeys) assertExactKeys(value, REPLAY_KEYS, 'replay');

  const schema = assertInteger(value.schema, 1, Number.MAX_SAFE_INTEGER, 'schema');
  if (schema !== REPLAY_SCHEMA_VERSION) {
    throw replayError(
      'INCOMPATIBLE_VERSION',
      `replay schema ${schema} is not supported (expected ${REPLAY_SCHEMA_VERSION})`,
    );
  }
  const tickCount = assertInteger(value.tickCount, 0, REPLAY_LIMITS.maxTicks, 'tickCount');
  const finishTick = assertInteger(value.finishTick, 0, tickCount, 'finishTick');
  if (typeof value.stateHash !== 'string' || !HASH_PATTERN.test(value.stateHash)) {
    throw replayError('MALFORMED', 'stateHash must be eight lowercase hexadecimal characters');
  }

  return Object.freeze({
    schema,
    levelId: assertSafeString(value.levelId, 'levelId'),
    buildVersion: assertSafeString(value.buildVersion, 'buildVersion'),
    physicsVersion: assertSafeString(value.physicsVersion, 'physicsVersion'),
    generatorVersion: assertSafeString(value.generatorVersion, 'generatorVersion'),
    tickCount,
    finishTick,
    stateHash: value.stateHash,
    runs: cloneAndValidateRuns(value.runs, tickCount),
  });
}

function normalizeMetadata(metadata) {
  assertPlainObject(metadata, 'metadata');
  assertExactKeys(metadata, ['levelId', ...VERSION_FIELDS], 'metadata');
  return Object.freeze({
    levelId: assertSafeString(metadata.levelId, 'levelId'),
    buildVersion: assertSafeString(metadata.buildVersion, 'buildVersion'),
    physicsVersion: assertSafeString(metadata.physicsVersion, 'physicsVersion'),
    generatorVersion: assertSafeString(metadata.generatorVersion, 'generatorVersion'),
  });
}

/** Convert the game's boolean/directional input snapshot to one tape mask. */
export function packReplayInput(input) {
  assertPlainObject(input, 'input');
  const lean = input.lean ?? 0;
  if (lean !== -1 && lean !== 0 && lean !== 1) {
    throw replayError('MALFORMED', 'input.lean must be -1, 0, or 1');
  }
  for (const key of ['gas', 'brake', 'restart']) {
    if (input[key] !== undefined && typeof input[key] !== 'boolean') {
      throw replayError('MALFORMED', `input.${key} must be boolean when provided`);
    }
  }

  let mask = 0;
  if (input.gas) mask |= REPLAY_INPUT.GAS;
  if (input.brake) mask |= REPLAY_INPUT.BRAKE;
  if (lean < 0) mask |= REPLAY_INPUT.LEAN_LEFT;
  if (lean > 0) mask |= REPLAY_INPUT.LEAN_RIGHT;
  if (input.restart) mask |= REPLAY_INPUT.RESTART;
  return mask;
}

/** Convert one tape mask back into a fresh game input snapshot. */
export function unpackReplayInput(mask) {
  assertInputMask(mask);
  if (mask === 0) return { ...NEUTRAL_INPUT };
  return {
    gas: Boolean(mask & REPLAY_INPUT.GAS),
    brake: Boolean(mask & REPLAY_INPUT.BRAKE),
    lean: mask & REPLAY_INPUT.LEAN_LEFT ? -1 : mask & REPLAY_INPUT.LEAN_RIGHT ? 1 : 0,
    restart: Boolean(mask & REPLAY_INPUT.RESTART),
  };
}

function canonicalState(value, context, depth = 0) {
  if (++context.nodes > 10_000 || depth > 32) {
    throw replayError('TOO_LARGE', 'final state is too deep or complex to hash safely');
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw replayError('MALFORMED', 'final state contains a non-finite number');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((item) => canonicalState(item, context, depth + 1));
  assertPlainObject(value, 'final state value');
  if (context.seen.has(value)) throw replayError('MALFORMED', 'final state contains a cycle');
  context.seen.add(value);
  const result = {};
  for (const key of Object.keys(value).sort()) {
    result[key] = canonicalState(value[key], context, depth + 1);
  }
  context.seen.delete(value);
  return result;
}

/** Stable FNV-1a hash of a JSON-compatible state snapshot with sorted object keys. */
export function hashReplayState(state) {
  const canonical = canonicalState(state, { nodes: 0, seen: new Set() });
  const bytes = TEXT_ENCODER.encode(JSON.stringify(canonical));
  if (bytes.length > REPLAY_LIMITS.maxJsonBytes) {
    throw replayError('TOO_LARGE', 'final state snapshot is too large to hash');
  }
  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

/**
 * Create one fixed-tick recorder. Call record() exactly once per simulation tick.
 * finalize() freezes the RLE tape and fingerprints the supplied deterministic state.
 */
export function createReplayRecorder(metadata, options = {}) {
  const cleanMetadata = normalizeMetadata(metadata);
  assertPlainObject(options, 'recorder options');
  const maxTicks = options.maxTicks === undefined
    ? REPLAY_LIMITS.maxTicks
    : assertInteger(options.maxTicks, 1, REPLAY_LIMITS.maxTicks, 'options.maxTicks');
  const maxRuns = options.maxRuns === undefined
    ? REPLAY_LIMITS.maxRuns
    : assertInteger(options.maxRuns, 1, REPLAY_LIMITS.maxRuns, 'options.maxRuns');
  const runs = [];
  let tickCount = 0;
  let finalized = false;

  function recordMask(mask) {
    if (finalized) throw replayError('FINALIZED', 'cannot record after replay finalization');
    assertInputMask(mask);
    if (tickCount >= maxTicks) throw replayError('TOO_LARGE', `recorder reached its ${maxTicks}-tick cap`);
    const last = runs[runs.length - 1];
    if (last && last[0] === mask && last[1] < REPLAY_LIMITS.maxRunLength) {
      last[1]++;
    } else {
      if (runs.length >= maxRuns) throw replayError('TOO_LARGE', `recorder reached its ${maxRuns}-run cap`);
      runs.push([mask, 1]);
    }
    return tickCount++;
  }

  return Object.freeze({
    get tickCount() { return tickCount; },
    get runCount() { return runs.length; },
    get isFinalized() { return finalized; },
    record(input) { return recordMask(packReplayInput(input)); },
    recordMask,
    finalize({ finishTick = tickCount, finalState } = {}) {
      if (finalized) throw replayError('FINALIZED', 'replay has already been finalized');
      if (finalState === undefined) throw replayError('MALFORMED', 'finalState is required');
      const candidate = normalizeReplay({
        schema: REPLAY_SCHEMA_VERSION,
        ...cleanMetadata,
        tickCount,
        finishTick,
        stateHash: hashReplayState(finalState),
        runs,
      });
      finalized = true;
      return candidate;
    },
  });
}

/** Build an immutable random-access view over a validated tape. */
export function createReplayPlayback(replay) {
  const clean = normalizeReplay(replay);
  const runEnds = new Uint32Array(clean.runs.length);
  let end = 0;
  for (let index = 0; index < clean.runs.length; index++) {
    end += clean.runs[index][1];
    runEnds[index] = end;
  }

  function maskAt(tick) {
    assertInteger(tick, 0, Number.MAX_SAFE_INTEGER, 'playback tick');
    if (tick >= clean.tickCount) return 0;
    let low = 0;
    let high = runEnds.length - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (tick < runEnds[middle]) high = middle;
      else low = middle + 1;
    }
    return clean.runs[low][0];
  }

  return Object.freeze({
    replay: clean,
    get tickCount() { return clean.tickCount; },
    get finishTick() { return clean.finishTick; },
    maskAt,
    inputAt(tick) { return unpackReplayInput(maskAt(tick)); },
  });
}

function base64UrlEncode(bytes) {
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const c = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const combined = (a << 16) | (b << 8) | c;
    result += BASE64URL_ALPHABET[(combined >>> 18) & 63];
    result += BASE64URL_ALPHABET[(combined >>> 12) & 63];
    if (index + 1 < bytes.length) result += BASE64URL_ALPHABET[(combined >>> 6) & 63];
    if (index + 2 < bytes.length) result += BASE64URL_ALPHABET[combined & 63];
  }
  return result;
}

function base64UrlDecode(token) {
  if (typeof token !== 'string' || token.length === 0 || !/^[A-Za-z0-9_-]+$/.test(token)
      || token.length % 4 === 1) {
    throw replayError('MALFORMED', 'replay token is not canonical base64url');
  }
  const remainder = token.length % 4;
  const lastValue = BASE64URL_ALPHABET.indexOf(token[token.length - 1]);
  if ((remainder === 2 && (lastValue & 15) !== 0) || (remainder === 3 && (lastValue & 3) !== 0)) {
    throw replayError('MALFORMED', 'replay token has non-zero base64 padding bits');
  }

  const output = new Uint8Array(Math.floor(token.length * 6 / 8));
  let accumulator = 0;
  let bits = 0;
  let outputIndex = 0;
  for (const character of token) {
    const value = BASE64URL_ALPHABET.indexOf(character);
    accumulator = (accumulator << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[outputIndex++] = (accumulator >>> bits) & 255;
      accumulator &= (1 << bits) - 1;
    }
  }
  return output;
}

function compactReplay(replay) {
  return {
    s: replay.schema,
    l: replay.levelId,
    b: replay.buildVersion,
    p: replay.physicsVersion,
    g: replay.generatorVersion,
    t: replay.tickCount,
    f: replay.finishTick,
    h: replay.stateHash,
    r: replay.runs,
  };
}

function expandCompactReplay(value) {
  assertPlainObject(value, 'encoded replay');
  assertExactKeys(value, COMPACT_KEYS, 'encoded replay');
  return {
    schema: value.s,
    levelId: value.l,
    buildVersion: value.b,
    physicsVersion: value.p,
    generatorVersion: value.g,
    tickCount: value.t,
    finishTick: value.f,
    stateHash: value.h,
    runs: value.r,
  };
}

/** Serialize a validated replay as compact, URL-safe, unpadded base64. */
export function encodeReplay(replay) {
  const clean = normalizeReplay(replay);
  const bytes = TEXT_ENCODER.encode(JSON.stringify(compactReplay(clean)));
  if (bytes.length > REPLAY_LIMITS.maxJsonBytes) {
    throw replayError('TOO_LARGE', `replay JSON exceeds ${REPLAY_LIMITS.maxJsonBytes} bytes`);
  }
  const token = base64UrlEncode(bytes);
  if (token.length > REPLAY_LIMITS.maxEncodedChars) {
    throw replayError('TOO_LARGE', `replay token exceeds ${REPLAY_LIMITS.maxEncodedChars} characters`);
  }
  return token;
}

/** Return an explicit compatibility verdict for the versions a caller requires. */
export function checkReplayCompatibility(replay, expected = {}) {
  assertPlainObject(expected, 'expected versions');
  const mismatches = [];
  for (const field of ['schema', 'levelId', ...VERSION_FIELDS]) {
    if (expected[field] !== undefined && replay[field] !== expected[field]) {
      mismatches.push(Object.freeze({ field, expected: expected[field], actual: replay[field] }));
    }
  }
  return mismatches.length === 0
    ? Object.freeze({ compatible: true, mismatches: Object.freeze([]) })
    : Object.freeze({
      compatible: false,
      code: 'INCOMPATIBLE_VERSION',
      mismatches: Object.freeze(mismatches),
    });
}

/**
 * Safely parse an untrusted challenge-link token. This function never throws:
 * it returns { ok: false, code, message } for malformed, oversized, or stale data.
 */
export function decodeReplay(token, { expected = {} } = {}) {
  try {
    if (typeof token !== 'string') throw replayError('MALFORMED', 'replay token must be a string');
    if (token.length > REPLAY_LIMITS.maxEncodedChars) {
      throw replayError('TOO_LARGE', `replay token exceeds ${REPLAY_LIMITS.maxEncodedChars} characters`);
    }
    const bytes = base64UrlDecode(token);
    if (bytes.length > REPLAY_LIMITS.maxJsonBytes) {
      throw replayError('TOO_LARGE', `replay JSON exceeds ${REPLAY_LIMITS.maxJsonBytes} bytes`);
    }
    let parsed;
    try {
      parsed = JSON.parse(TEXT_DECODER.decode(bytes));
    } catch {
      throw replayError('MALFORMED', 'replay token does not contain valid UTF-8 JSON');
    }
    const replay = normalizeReplay(expandCompactReplay(parsed));
    const compatibility = checkReplayCompatibility(replay, expected);
    if (!compatibility.compatible) {
      return Object.freeze({ ok: false, ...compatibility });
    }
    return Object.freeze({ ok: true, replay });
  } catch (error) {
    return Object.freeze({
      ok: false,
      code: error?.code === 'TOO_LARGE' || error?.code === 'INCOMPATIBLE_VERSION'
        ? error.code
        : 'MALFORMED',
      message: error instanceof Error ? error.message : 'invalid replay token',
    });
  }
}

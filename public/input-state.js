// input-state.js — deterministic, DOM-free command aggregation for Moto Rush X3.
//
// Browser adapters should translate their events into this module's plain-data
// methods. The state machine deliberately knows nothing about EventTarget,
// canvas, navigator, focus, visibility, or screen orientation.

export const INPUT_COMMANDS = Object.freeze([
  'gas',
  'brake',
  'leanBack',
  'leanFwd',
]);

export const INPUT_CLEAR_REASONS = Object.freeze([
  'blur',
  'hidden',
  'rotation',
  'manual',
]);

export const DEFAULT_INPUT_KEY_MAP = Object.freeze({
  ArrowUp: 'gas',
  KeyW: 'gas',
  ArrowDown: 'brake',
  KeyS: 'brake',
  ArrowLeft: 'leanBack',
  KeyA: 'leanBack',
  ArrowRight: 'leanFwd',
  KeyD: 'leanFwd',
});

export const DEFAULT_GAMEPAD_MAP = deepFreeze({
  gas: { buttons: [7, 0], axes: [] },
  brake: { buttons: [6, 1], axes: [] },
  leanBack: { buttons: [14], axes: [{ index: 0, direction: -1 }] },
  leanFwd: { buttons: [15], axes: [{ index: 0, direction: 1 }] },
});

export const INPUT_INTEGRATION_NOTES = Object.freeze([
  'Call keyDown(event.code) and keyUp(event.code); preventDefault when the result is handled.',
  'Convert pointer coordinates to canvas CSS pixels before pointerBegin/pointerMove.',
  'Call pointerCancel and pointerLostCapture as well as pointerEnd so touch commands cannot stick.',
  'Refresh gamepads once per rendered frame with pollGamepads(navigator.getGamepads()); use updateGamepads for a detached diagnostic result.',
  'Use readCommands(reusableTarget) in the fixed-step hot path; snapshot() is the detached diagnostic form.',
  'Development input is a complete snapshot; updateDevelopmentInput replaces, rather than merges, it.',
  'Call clearAll("blur"), clearAll("hidden"), or clearAll("rotation") at lifecycle boundaries.',
  'Consume pause-recommended events in the browser shell; this module never changes game state itself.',
  'Rebuild pointer zones after resize/orientation and keep layout metadata separate from hit geometry.',
]);

const COMMAND_SET = new Set(INPUT_COMMANDS);
const INPUT_CLEAR_REASON_SET = new Set(INPUT_CLEAR_REASONS);
const DEFAULT_POINTER_LIMIT = 1_000_000;
const MAX_POINTERS = 32;
const MAX_GAMEPADS = 8;
const MAX_BUTTONS = 64;
const MAX_AXES = 16;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function commandSnapshot(gas = false, brake = false, leanBack = false, leanFwd = false) {
  return { gas: gas === true, brake: brake === true,
    leanBack: leanBack === true, leanFwd: leanFwd === true };
}

function frozenCommandSnapshot(source = {}) {
  return Object.freeze(commandSnapshot(
    source.gas,
    source.brake,
    source.leanBack,
    source.leanFwd,
  ));
}

function sameCommands(a, b) {
  return a.gas === b.gas && a.brake === b.brake
    && a.leanBack === b.leanBack && a.leanFwd === b.leanFwd;
}

function countCommands(commands) {
  let count = 0;
  for (const command of INPUT_COMMANDS) if (commands[command]) count++;
  return count;
}

function cleanReason(reason, fallback = 'manual') {
  if (typeof reason !== 'string') return fallback;
  const value = reason.trim().toLowerCase();
  return value && value.length <= 64 ? value : fallback;
}

/** Canonicalise common KeyboardEvent.code aliases without using KeyboardEvent. */
export function normalizeKeyboardCode(rawCode) {
  const candidate = rawCode && typeof rawCode === 'object' ? rawCode.code : rawCode;
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  if (!trimmed || trimmed.length > 64) return null;
  const lower = trimmed.toLowerCase();
  const aliases = {
    up: 'ArrowUp', arrowup: 'ArrowUp',
    down: 'ArrowDown', arrowdown: 'ArrowDown',
    left: 'ArrowLeft', arrowleft: 'ArrowLeft',
    right: 'ArrowRight', arrowright: 'ArrowRight',
    esc: 'Escape', escape: 'Escape',
    spacebar: 'Space', space: 'Space',
    return: 'Enter', enter: 'Enter',
  };
  if (aliases[lower]) return aliases[lower];
  if (/^[a-z]$/i.test(trimmed)) return `Key${trimmed.toUpperCase()}`;
  if (/^[0-9]$/.test(trimmed)) return `Digit${trimmed}`;
  const keyMatch = /^key([a-z])$/i.exec(trimmed);
  if (keyMatch) return `Key${keyMatch[1].toUpperCase()}`;
  const digitMatch = /^digit([0-9])$/i.exec(trimmed);
  if (digitMatch) return `Digit${digitMatch[1]}`;
  if (!/^[a-z][a-z0-9_-]*$/i.test(trimmed)) return null;
  return trimmed;
}

function mappingEntries(raw, label) {
  if (raw instanceof Map) return [...raw.entries()];
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.entries(raw);
  throw new TypeError(`${label} must be an object, Map, or entry array`);
}

function normalizeKeyMap(raw) {
  const entries = [];
  const seen = new Set();
  for (const entry of mappingEntries(raw, 'key map')) {
    if (!Array.isArray(entry) || entry.length < 2) throw new TypeError('key map entries need code and command');
    const code = normalizeKeyboardCode(entry[0]);
    const command = entry[1];
    if (!code) throw new TypeError(`invalid keyboard code: ${String(entry[0])}`);
    if (!COMMAND_SET.has(command)) throw new RangeError(`unknown input command: ${String(command)}`);
    if (seen.has(code)) throw new Error(`duplicate keyboard binding: ${code}`);
    seen.add(code);
    entries.push([code, command]);
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  return Object.freeze(Object.fromEntries(entries));
}

function positiveInteger(value, fallback, max) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(value)));
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function normalizeBounds(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('pointer bounds must be an object');
  }
  let left = raw.left ?? raw.x ?? -DEFAULT_POINTER_LIMIT;
  let top = raw.top ?? raw.y ?? -DEFAULT_POINTER_LIMIT;
  let right = raw.right;
  let bottom = raw.bottom;
  if (right === undefined && Number.isFinite(raw.width)) right = left + raw.width;
  if (bottom === undefined && Number.isFinite(raw.height)) bottom = top + raw.height;
  right ??= DEFAULT_POINTER_LIMIT;
  bottom ??= DEFAULT_POINTER_LIMIT;
  if (![left, top, right, bottom].every(Number.isFinite)) {
    throw new TypeError('pointer bounds must be finite');
  }
  if (right < left || bottom < top) throw new RangeError('pointer bounds are inverted');
  return Object.freeze({ left, top, right, bottom });
}

function normalizeZone(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError(`pointer zone ${index} must be an object`);
  }
  if (!COMMAND_SET.has(raw.command)) {
    throw new RangeError(`pointer zone ${index} has an unknown command`);
  }
  const circle = raw.shape === 'circle' || Number.isFinite(raw.r) || Number.isFinite(raw.radius);
  if (circle) {
    const x = Number(raw.x);
    const y = Number(raw.y);
    const radius = Number(raw.radius ?? raw.r);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius <= 0) {
      throw new RangeError(`pointer circle ${index} needs finite x/y and positive radius`);
    }
    return Object.freeze({ command: raw.command, shape: 'circle', x, y, radius });
  }
  const bounds = normalizeBounds(raw);
  if (bounds.right === bounds.left || bounds.bottom === bounds.top) {
    throw new RangeError(`pointer rectangle ${index} must have area`);
  }
  return Object.freeze({ command: raw.command, shape: 'rect', ...bounds });
}

function normalizePointerSurface(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('pointer surface must be an object');
  }
  const bounds = normalizeBounds(raw.bounds || raw);
  const zones = raw.zones === undefined ? [] : raw.zones;
  if (!Array.isArray(zones)) throw new TypeError('pointer zones must be an array');
  const normalizedZones = Object.freeze(zones.map(normalizeZone));
  return deepFreeze({ bounds, zones: normalizedZones });
}

function normalizeAxisRule(raw, label) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError(`${label} must be an object`);
  }
  const index = Math.trunc(raw.index);
  if (!Number.isSafeInteger(index) || index < 0 || index >= MAX_AXES) {
    throw new RangeError(`${label}.index is outside the supported range`);
  }
  const direction = Number(raw.direction) < 0 ? -1 : 1;
  const threshold = raw.threshold === undefined ? null : Number(raw.threshold);
  if (threshold !== null && (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1)) {
    throw new RangeError(`${label}.threshold must be within (0, 1]`);
  }
  return Object.freeze({ index, direction, threshold });
}

function normalizeGamepadMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('gamepad map must be an object');
  }
  const result = {};
  for (const command of INPUT_COMMANDS) {
    const rule = raw[command] || {};
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
      throw new TypeError(`gamepad ${command} rule must be an object`);
    }
    const buttons = rule.buttons || [];
    const axes = rule.axes || [];
    if (!Array.isArray(buttons) || !Array.isArray(axes)) {
      throw new TypeError(`gamepad ${command} buttons and axes must be arrays`);
    }
    const normalizedButtons = buttons.map((value, index) => {
      const button = Math.trunc(value);
      if (!Number.isSafeInteger(button) || button < 0 || button >= MAX_BUTTONS) {
        throw new RangeError(`gamepad ${command} button ${index} is outside the supported range`);
      }
      return button;
    });
    result[command] = Object.freeze({
      buttons: Object.freeze([...new Set(normalizedButtons)]),
      axes: Object.freeze(axes.map((axis, index) => normalizeAxisRule(
        axis,
        `gamepad ${command} axis ${index}`,
      ))),
    });
  }
  return deepFreeze(result);
}

function normalizePauseReasons(raw) {
  const reasons = raw === undefined ? ['blur', 'hidden', 'rotation'] : raw;
  if (!Array.isArray(reasons) && !(reasons instanceof Set)) {
    throw new TypeError('pause reasons must be an array or Set');
  }
  return Object.freeze([...new Set([...reasons].map(reason => cleanReason(reason)))].sort());
}

/** Pure layout metadata; hit zones remain a separate, viewport-specific concern. */
export function createControlLayoutMetadata(leftHanded = false) {
  const left = leftHanded ? ['gas', 'brake'] : ['leanBack', 'leanFwd'];
  const right = leftHanded ? ['leanBack', 'leanFwd'] : ['brake', 'gas'];
  const commandSides = {};
  for (const command of left) commandSides[command] = 'left';
  for (const command of right) commandSides[command] = 'right';
  return deepFreeze({
    leftHanded: leftHanded === true,
    clusters: { left: [...left], right: [...right] },
    commandSides,
  });
}

function pointerIdentity(raw) {
  const value = raw && typeof raw === 'object'
    ? (raw.id ?? raw.pointerId)
    : raw;
  if (Number.isSafeInteger(value) && value >= 0) return { key: `n:${value}`, id: value };
  if (typeof value === 'string') {
    const id = value.trim();
    if (id && id.length <= 64) return { key: `s:${id}`, id };
  }
  return null;
}

function normalizeCommands(raw) {
  if (raw === undefined || raw === null) return [];
  let values;
  if (typeof raw === 'string') values = [raw];
  else if (Array.isArray(raw) || raw instanceof Set) values = [...raw];
  else if (raw && typeof raw === 'object') {
    values = INPUT_COMMANDS.filter(command => raw[command] === true);
    for (const key of Object.keys(raw)) {
      if (raw[key] === true && !COMMAND_SET.has(key)) return null;
    }
  } else return null;
  if (values.some(command => !COMMAND_SET.has(command))) return null;
  return [...new Set(values)].sort((a, b) => INPUT_COMMANDS.indexOf(a) - INPUT_COMMANDS.indexOf(b));
}

function commandsForPoint(surface, x, y) {
  const commands = [];
  for (const zone of surface.zones) {
    const hit = zone.shape === 'circle'
      ? (x - zone.x) ** 2 + (y - zone.y) ** 2 <= zone.radius ** 2
      : x >= zone.left && x <= zone.right && y >= zone.top && y <= zone.bottom;
    if (hit && !commands.includes(zone.command)) commands.push(zone.command);
  }
  return commands.sort((a, b) => INPUT_COMMANDS.indexOf(a) - INPUT_COMMANDS.indexOf(b));
}

function arrayValue(source, index) {
  if (!source || typeof source !== 'object') return undefined;
  return source[index];
}

function buttonPressed(raw) {
  if (raw === true) return true;
  if (Number.isFinite(raw)) return raw > 0.5;
  if (!raw || typeof raw !== 'object') return false;
  return raw.pressed === true || (Number.isFinite(raw.value) && raw.value > 0.5);
}

function axisValue(raw) {
  return Number.isFinite(raw) ? clamp(raw, -1, 1) : 0;
}

/**
 * Create an isolated command state machine. All returned configuration,
 * snapshots, events, telemetry, and layout metadata are detached and frozen.
 */
export function createInputState(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('input options must be an object');
  }

  let keyMap = normalizeKeyMap(options.keyMap || DEFAULT_INPUT_KEY_MAP);
  let pointerSurface = normalizePointerSurface(options.pointerSurface || {
    bounds: options.pointerBounds || {},
    zones: options.pointerZones || [],
  });
  let gamepadMap = normalizeGamepadMap(options.gamepadMap || DEFAULT_GAMEPAD_MAP);
  let leftHanded = options.leftHanded === true;
  let layout = createControlLayoutMetadata(leftHanded);
  const coordinateMode = options.coordinateMode === 'reject' ? 'reject' : 'clamp';
  const deadzone = options.gamepadDeadzone === undefined ? 0.4 : Number(options.gamepadDeadzone);
  if (!Number.isFinite(deadzone) || deadzone <= 0 || deadzone > 1) {
    throw new RangeError('gamepadDeadzone must be within (0, 1]');
  }
  const eventLimit = positiveInteger(options.eventLimit, 256, 4096);
  const pauseReasons = normalizePauseReasons(options.pauseReasons);
  const pauseReasonSet = new Set(pauseReasons);

  const heldKeys = new Set();
  const pointers = new Map();
  let gamepads = commandSnapshot();
  let gamepadScratch = commandSnapshot();
  let lastGamepadSeen = 0;
  let lastGamepadAccepted = true;
  let development = commandSnapshot();
  let sequence = 0;
  const events = [];
  const clearReasons = Object.create(null);
  const counters = {
    snapshots: 0,
    hotReads: 0,
    commandChanges: 0,
    keyDowns: 0,
    keyUps: 0,
    keyRepeats: 0,
    keyIgnored: 0,
    keyRejected: 0,
    keyStale: 0,
    pointerBegins: 0,
    pointerMoves: 0,
    pointerEnds: 0,
    pointerCancels: 0,
    pointerLostCaptures: 0,
    pointerRejected: 0,
    pointerStale: 0,
    pointerClamped: 0,
    pointerLimitRejected: 0,
    gamepadUpdates: 0,
    gamepadRejected: 0,
    gamepadsSeen: 0,
    developmentUpdates: 0,
    developmentRejected: 0,
    clears: 0,
    pauseRecommendations: 0,
    remaps: 0,
    surfaceChanges: 0,
    layoutChanges: 0,
    eventsEmitted: 0,
    eventsDropped: 0,
  };

  function emit(type, details = {}) {
    sequence++;
    const event = deepFreeze({ sequence, type, ...details });
    if (events.length === eventLimit) {
      events.shift();
      counters.eventsDropped++;
    }
    events.push(event);
    counters.eventsEmitted++;
    return event;
  }

  function computeKeyboard() {
    const commands = commandSnapshot();
    for (const code of heldKeys) {
      const command = keyMap[code];
      if (command) commands[command] = true;
    }
    return commands;
  }

  function computePointers() {
    const commands = commandSnapshot();
    for (const pointer of pointers.values()) {
      for (const command of pointer.commands) commands[command] = true;
    }
    return commands;
  }

  function writeAggregate(result) {
    result.gas = false; result.brake = false; result.leanBack = false; result.leanFwd = false;
    for (const code of heldKeys) {
      const command = keyMap[code];
      if (command) result[command] = true;
    }
    for (const pointer of pointers.values()) {
      for (const command of pointer.commands) result[command] = true;
    }
    for (const command of INPUT_COMMANDS) {
      result[command] = result[command] || gamepads[command] || development[command];
    }
    return result;
  }

  function computeAll() {
    return writeAggregate(commandSnapshot());
  }

  let lastAggregate = computeAll();

  function recordCommandChange(source) {
    const current = computeAll();
    if (sameCommands(current, lastAggregate)) return null;
    lastAggregate = current;
    counters.commandChanges++;
    return emit('command-change', { source, commands: frozenCommandSnapshot(current) });
  }

  function reject(source, action, reason, extra = {}) {
    return emit('input-rejected', { source, action, reason, ...extra });
  }

  function parsePointerSample(sample, action) {
    if (!sample || typeof sample !== 'object' || Array.isArray(sample)) {
      return { ok: false, reason: 'invalid-sample' };
    }
    const identity = pointerIdentity(sample);
    if (!identity) return { ok: false, reason: 'invalid-id' };
    let x = Number(sample.x);
    let y = Number(sample.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { ok: false, reason: 'invalid-coordinate', identity };
    }
    const bounds = pointerSurface.bounds;
    const outside = x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom;
    if (outside && coordinateMode === 'reject') {
      return { ok: false, reason: 'outside-bounds', identity };
    }
    const originalX = x;
    const originalY = y;
    if (outside) {
      x = clamp(x, bounds.left, bounds.right);
      y = clamp(y, bounds.top, bounds.bottom);
    }
    if (Object.is(x, -0)) x = 0;
    if (Object.is(y, -0)) y = 0;
    const commands = sample.commands === undefined
      ? commandsForPoint(pointerSurface, x, y)
      : normalizeCommands(sample.commands);
    if (!commands) return { ok: false, reason: 'invalid-command', identity };
    return {
      ok: true,
      action,
      identity,
      x,
      y,
      commands,
      clamped: x !== originalX || y !== originalY,
    };
  }

  function pointerReject(action, parsed) {
    counters.pointerRejected++;
    reject('pointer', action, parsed.reason, parsed.identity ? { id: parsed.identity.id } : {});
    return Object.freeze({ accepted: false, handled: false, action,
      reason: parsed.reason, stale: false });
  }

  function pointerRelease(rawId, action) {
    const identity = pointerIdentity(rawId);
    if (!identity) return pointerReject(action, { reason: 'invalid-id' });
    if (!pointers.has(identity.key)) {
      counters.pointerStale++;
      emit('pointer-stale', { action, id: identity.id });
      return Object.freeze({ accepted: false, handled: false, action,
        reason: 'stale-id', stale: true, id: identity.id });
    }
    const previous = pointers.get(identity.key);
    pointers.delete(identity.key);
    if (action === 'end') counters.pointerEnds++;
    else if (action === 'cancel') counters.pointerCancels++;
    else counters.pointerLostCaptures++;
    emit(`pointer-${action}`, { id: identity.id, commands: [...previous.commands] });
    recordCommandChange(`pointer-${action}`);
    return Object.freeze({ accepted: true, handled: true, action,
      stale: false, id: identity.id });
  }

  function keyDown(rawCode) {
    const code = normalizeKeyboardCode(rawCode);
    if (!code) {
      counters.keyRejected++;
      reject('keyboard', 'down', 'invalid-code');
      return Object.freeze({ accepted: false, handled: false, reason: 'invalid-code' });
    }
    const command = keyMap[code];
    if (!command) {
      counters.keyIgnored++;
      return Object.freeze({ accepted: true, handled: false, code, command: null });
    }
    if (heldKeys.has(code)) {
      counters.keyRepeats++;
      return Object.freeze({ accepted: true, handled: true, changed: false,
        repeat: true, code, command });
    }
    heldKeys.add(code);
    counters.keyDowns++;
    emit('key-down', { code, command });
    recordCommandChange('keyboard');
    return Object.freeze({ accepted: true, handled: true, changed: true,
      repeat: false, code, command });
  }

  function keyUp(rawCode) {
    const code = normalizeKeyboardCode(rawCode);
    if (!code) {
      counters.keyRejected++;
      reject('keyboard', 'up', 'invalid-code');
      return Object.freeze({ accepted: false, handled: false, reason: 'invalid-code' });
    }
    if (!heldKeys.has(code)) {
      const handled = !!keyMap[code];
      if (handled) counters.keyStale++;
      else counters.keyIgnored++;
      return Object.freeze({ accepted: true, handled, changed: false,
        stale: handled, code, command: keyMap[code] || null });
    }
    heldKeys.delete(code);
    const command = keyMap[code] || null;
    counters.keyUps++;
    emit('key-up', { code, command });
    recordCommandChange('keyboard');
    return Object.freeze({ accepted: true, handled: true, changed: true,
      stale: false, code, command });
  }

  function pointerBegin(sample) {
    const parsed = parsePointerSample(sample, 'begin');
    if (!parsed.ok) return pointerReject('begin', parsed);
    if (pointers.has(parsed.identity.key)) {
      return pointerReject('begin', { reason: 'duplicate-id', identity: parsed.identity });
    }
    if (pointers.size >= MAX_POINTERS) {
      counters.pointerLimitRejected++;
      return pointerReject('begin', { reason: 'pointer-limit', identity: parsed.identity });
    }
    if (parsed.clamped) counters.pointerClamped++;
    const record = {
      id: parsed.identity.id,
      x: parsed.x,
      y: parsed.y,
      commands: Object.freeze([...parsed.commands]),
    };
    pointers.set(parsed.identity.key, record);
    counters.pointerBegins++;
    emit('pointer-begin', { ...record, clamped: parsed.clamped });
    recordCommandChange('pointer-begin');
    return Object.freeze({ accepted: true, handled: true, action: 'begin',
      stale: false, clamped: parsed.clamped, id: record.id,
      x: record.x, y: record.y, commands: record.commands });
  }

  function pointerMove(sample) {
    const identity = pointerIdentity(sample);
    if (!identity) return pointerReject('move', { reason: 'invalid-id' });
    if (!pointers.has(identity.key)) {
      counters.pointerStale++;
      emit('pointer-stale', { action: 'move', id: identity.id });
      return Object.freeze({ accepted: false, handled: false, action: 'move',
        reason: 'stale-id', stale: true, id: identity.id });
    }
    const parsed = parsePointerSample(sample, 'move');
    if (!parsed.ok) return pointerReject('move', parsed);
    if (parsed.clamped) counters.pointerClamped++;
    const previous = pointers.get(identity.key);
    const record = {
      id: identity.id,
      x: parsed.x,
      y: parsed.y,
      commands: Object.freeze([...parsed.commands]),
    };
    pointers.set(identity.key, record);
    counters.pointerMoves++;
    const changed = previous.x !== record.x || previous.y !== record.y
      || previous.commands.length !== record.commands.length
      || previous.commands.some((command, index) => command !== record.commands[index]);
    emit('pointer-move', { ...record, clamped: parsed.clamped, changed });
    recordCommandChange('pointer-move');
    return Object.freeze({ accepted: true, handled: true, action: 'move',
      stale: false, changed, clamped: parsed.clamped, id: record.id,
      x: record.x, y: record.y, commands: record.commands });
  }

  function applyGamepadSnapshot(snapshot, target) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    for (const command of INPUT_COMMANDS) {
      const rule = gamepadMap[command];
      let active = false;
      for (const index of rule.buttons) {
        if (buttonPressed(arrayValue(snapshot.buttons, index))) { active = true; break; }
      }
      if (!active) {
        for (const axis of rule.axes) {
          const value = axisValue(arrayValue(snapshot.axes, axis.index));
          const threshold = axis.threshold ?? deadzone;
          if (axis.direction < 0 ? value < -threshold : value > threshold) {
            active = true; break;
          }
        }
      }
      if (active) target[command] = true;
    }
    return true;
  }

  function scanGamepads(rawSnapshots, target) {
    target.gas = false; target.brake = false; target.leanBack = false; target.leanFwd = false;
    if (rawSnapshots === undefined || rawSnapshots === null) return 0;
    let seen = 0;
    if (Array.isArray(rawSnapshots)
        || (typeof rawSnapshots === 'object' && Number.isFinite(rawSnapshots.length))) {
      const length = Math.max(0, Math.min(MAX_GAMEPADS, Math.trunc(rawSnapshots.length)));
      for (let index = 0; index < length; index++) {
        if (applyGamepadSnapshot(rawSnapshots[index], target)) seen++;
      }
      return seen;
    }
    if (typeof rawSnapshots === 'object'
        && typeof rawSnapshots[Symbol.iterator] === 'function') {
      for (const snapshot of rawSnapshots) {
        if (seen >= MAX_GAMEPADS) break;
        if (applyGamepadSnapshot(snapshot, target)) seen++;
      }
      return seen;
    }
    return -1;
  }

  // Allocation-stable browser polling: steady unchanged controller state only
  // scans into reusable storage and updates numeric counters. Diagnostic events
  // and frozen snapshots are emitted only when aggregated commands change.
  function pollGamepads(rawSnapshots) {
    const seen = scanGamepads(rawSnapshots, gamepadScratch);
    lastGamepadAccepted = seen >= 0;
    lastGamepadSeen = Math.max(0, seen);
    const changed = !sameCommands(gamepads, gamepadScratch);
    if (seen < 0) {
      counters.gamepadRejected++;
      if (changed) {
        const previous = gamepads; gamepads = gamepadScratch; gamepadScratch = previous;
      }
      reject('gamepad', 'update', 'invalid-snapshot-list');
      if (changed) recordCommandChange('gamepad');
      return changed;
    }
    counters.gamepadUpdates++;
    counters.gamepadsSeen = Math.min(Number.MAX_SAFE_INTEGER, counters.gamepadsSeen + seen);
    if (!changed) return false;
    const previous = gamepads; gamepads = gamepadScratch; gamepadScratch = previous;
    emit('gamepad-update', { gamepads: seen, commands: frozenCommandSnapshot(gamepads) });
    recordCommandChange('gamepad');
    return true;
  }

  function updateGamepads(rawSnapshots) {
    const changed = pollGamepads(rawSnapshots);
    return Object.freeze({ accepted: lastGamepadAccepted, gamepads: lastGamepadSeen,
      activeCommands: countCommands(gamepads), changed });
  }

  function updateDevelopmentInput(rawSnapshot = {}) {
    if (rawSnapshot === null) rawSnapshot = {};
    if (!rawSnapshot || typeof rawSnapshot !== 'object' || Array.isArray(rawSnapshot)) {
      counters.developmentRejected++;
      development = commandSnapshot();
      reject('development', 'update', 'invalid-snapshot');
      recordCommandChange('development');
      return Object.freeze({ accepted: false, activeCommands: 0 });
    }
    development = commandSnapshot(
      rawSnapshot.gas === true,
      rawSnapshot.brake === true,
      rawSnapshot.leanBack === true,
      rawSnapshot.leanFwd === true,
    );
    counters.developmentUpdates++;
    emit('development-update', { commands: frozenCommandSnapshot(development) });
    recordCommandChange('development');
    return Object.freeze({ accepted: true, activeCommands: countCommands(development) });
  }

  function clearAll(rawReason = 'manual') {
    const reason = cleanReason(rawReason);
    const cleared = Object.freeze({
      keys: heldKeys.size,
      pointers: pointers.size,
      gamepadCommands: countCommands(gamepads),
      developmentCommands: countCommands(development),
    });
    heldKeys.clear();
    pointers.clear();
    gamepads = commandSnapshot();
    development = commandSnapshot();
    counters.clears++;
    const reasonKey = INPUT_CLEAR_REASON_SET.has(reason) ? reason : 'other';
    clearReasons[reasonKey] = (clearReasons[reasonKey] || 0) + 1;
    emit('input-cleared', { reason, cleared });
    recordCommandChange('clear');
    const pauseRecommended = pauseReasonSet.has(reason);
    if (pauseRecommended) recommendPause(reason);
    return Object.freeze({ reason, cleared, pauseRecommended });
  }

  function recommendPause(rawReason = 'manual') {
    const reason = cleanReason(rawReason);
    counters.pauseRecommendations++;
    return emit('pause-recommended', { reason });
  }

  function replaceKeyMap(rawMap) {
    keyMap = normalizeKeyMap(rawMap);
    counters.remaps++;
    emit('keymap-changed', { bindingCount: Object.keys(keyMap).length });
    recordCommandChange('keymap');
    return keyMap;
  }

  function remapKey(rawCode, command = null) {
    const code = normalizeKeyboardCode(rawCode);
    if (!code) throw new TypeError(`invalid keyboard code: ${String(rawCode)}`);
    if (command !== null && !COMMAND_SET.has(command)) {
      throw new RangeError(`unknown input command: ${String(command)}`);
    }
    const next = { ...keyMap };
    if (command === null) delete next[code];
    else next[code] = command;
    return replaceKeyMap(next);
  }

  function configurePointerSurface(rawSurface) {
    const next = normalizePointerSurface(rawSurface);
    const released = pointers.size;
    pointers.clear();
    pointerSurface = next;
    counters.surfaceChanges++;
    emit('pointer-surface-changed', { released, zoneCount: next.zones.length,
      bounds: next.bounds });
    recordCommandChange('pointer-surface');
    return pointerSurface;
  }

  function setGamepadMap(rawMap) {
    gamepadMap = normalizeGamepadMap(rawMap);
    gamepads = commandSnapshot();
    emit('gamepad-map-changed');
    recordCommandChange('gamepad-map');
    return gamepadMap;
  }

  function setLeftHanded(enabled) {
    const next = enabled === true;
    if (next === leftHanded) return layout;
    leftHanded = next;
    layout = createControlLayoutMetadata(leftHanded);
    counters.layoutChanges++;
    emit('layout-changed', { leftHanded });
    return layout;
  }

  function snapshot() {
    counters.snapshots++;
    return frozenCommandSnapshot(computeAll());
  }

  // Allocation-free command read for the fixed-step browser adapter. The
  // caller owns the mutable target; detached/immutable consumers use snapshot().
  function readCommands(target) {
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
      throw new TypeError('input command target must be an object');
    }
    counters.hotReads++;
    return writeAggregate(target);
  }

  function inspect() {
    return deepFreeze({
      commands: computeAll(),
      sources: {
        keyboard: computeKeyboard(),
        pointer: computePointers(),
        gamepad: { ...gamepads },
        development: { ...development },
      },
      heldKeys: [...heldKeys].sort(),
      pointers: [...pointers.values()].map(pointer => ({
        id: pointer.id,
        x: pointer.x,
        y: pointer.y,
        commands: [...pointer.commands],
      })),
    });
  }

  function getConfig() {
    return deepFreeze({
      keyMap: { ...keyMap },
      pointerSurface: {
        bounds: { ...pointerSurface.bounds },
        zones: pointerSurface.zones.map(zone => ({ ...zone })),
      },
      gamepadMap: Object.fromEntries(INPUT_COMMANDS.map(command => [command, {
        buttons: [...gamepadMap[command].buttons],
        axes: gamepadMap[command].axes.map(axis => ({ ...axis })),
      }])),
      gamepadDeadzone: deadzone,
      coordinateMode,
      eventLimit,
      pauseReasons: [...pauseReasons],
      leftHanded,
      layout,
    });
  }

  function getTelemetry() {
    const reasons = Object.fromEntries(Object.entries(clearReasons).sort(([a], [b]) => a.localeCompare(b)));
    return deepFreeze({
      sequence,
      queuedEvents: events.length,
      activeKeys: heldKeys.size,
      activePointers: pointers.size,
      activeCommands: countCommands(computeAll()),
      clearReasons: reasons,
      counters: { ...counters },
    });
  }

  function drainEvents() {
    const drained = Object.freeze(events.splice(0, events.length));
    return drained;
  }

  function peekEvents() {
    return Object.freeze([...events]);
  }

  return Object.freeze({
    keyDown,
    keyUp,
    pointerBegin,
    pointerMove,
    pointerEnd: rawId => pointerRelease(rawId, 'end'),
    pointerCancel: rawId => pointerRelease(rawId, 'cancel'),
    pointerLostCapture: rawId => pointerRelease(rawId, 'lost-capture'),
    pollGamepads,
    updateGamepads,
    updateDevelopmentInput,
    clearDevelopmentInput: () => updateDevelopmentInput({}),
    clearAll,
    recommendPause,
    replaceKeyMap,
    remapKey,
    configurePointerSurface,
    setGamepadMap,
    setLeftHanded,
    readCommands,
    snapshot,
    inspect,
    getConfig,
    getLayoutMetadata: () => layout,
    getTelemetry,
    drainEvents,
    peekEvents,
  });
}

// Edge-triggered menu input shared by finish and crash flows.
// Gameplay commands continue to live in input-state.js; this adapter only
// exposes standard directional/confirm/back edges so a held throttle cannot
// accidentally dismiss a newly opened results screen.

export const UI_COMMANDS = Object.freeze(['left', 'right', 'up', 'down', 'confirm', 'back']);

const KEY_COMMANDS = Object.freeze({
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  Enter: 'confirm',
  Space: 'confirm',
  Escape: 'back',
  Backspace: 'back',
});

function pressed(value) {
  if (value === true) return true;
  if (Number.isFinite(value)) return value > 0.5;
  return !!value && typeof value === 'object'
    && (value.pressed === true || Number(value.value) > 0.5);
}

function axis(snapshot, index) {
  const value = Number(snapshot?.axes?.[index]);
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
}

function button(snapshot, index) {
  return pressed(snapshot?.buttons?.[index]);
}

function gamepadList(raw) {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object' && Number.isFinite(raw.length)) return Array.from(raw);
  if (typeof raw === 'object' && typeof raw[Symbol.iterator] === 'function') return [...raw];
  return [];
}

export function uiCommandForKey(rawCode) {
  return KEY_COMMANDS[String(rawCode || '')] || null;
}

export function createUiInput({ deadzone = 0.62, maximumGamepads = 4 } = {}) {
  if (!Number.isFinite(deadzone) || deadzone < 0.25 || deadzone > 0.95) {
    throw new RangeError('UI input deadzone must be from 0.25 to 0.95');
  }
  if (!Number.isSafeInteger(maximumGamepads) || maximumGamepads < 1 || maximumGamepads > 16) {
    throw new RangeError('maximumGamepads must be an integer from 1 to 16');
  }
  const held = Object.fromEntries(UI_COMMANDS.map(command => [command, false]));
  const edges = Object.fromEntries(UI_COMMANDS.map(command => [command, false]));
  const current = Object.fromEntries(UI_COMMANDS.map(command => [command, false]));
  let polls = 0;
  let changes = 0;

  function sample(rawGamepads) {
    for (const command of UI_COMMANDS) current[command] = false;
    const list = gamepadList(rawGamepads);
    const count = Math.min(maximumGamepads, list.length);
    for (let index = 0; index < count; index++) {
      const pad = list[index];
      if (!pad || typeof pad !== 'object') continue;
      const x = axis(pad, 0), y = axis(pad, 1);
      const leftThreshold = held.left ? deadzone * 0.72 : deadzone;
      const rightThreshold = held.right ? deadzone * 0.72 : deadzone;
      const upThreshold = held.up ? deadzone * 0.72 : deadzone;
      const downThreshold = held.down ? deadzone * 0.72 : deadzone;
      current.left ||= button(pad, 14) || x < -leftThreshold;
      current.right ||= button(pad, 15) || x > rightThreshold;
      current.up ||= button(pad, 12) || y < -upThreshold;
      current.down ||= button(pad, 13) || y > downThreshold;
      current.confirm ||= button(pad, 0);
      current.back ||= button(pad, 1);
    }
  }

  function poll(rawGamepads) {
    sample(rawGamepads);
    polls++;
    for (const command of UI_COMMANDS) {
      edges[command] = current[command] && !held[command];
      if (current[command] !== held[command]) changes++;
      held[command] = current[command];
    }
    return edges;
  }

  // Adopt the physical state without emitting an edge. This is used when a
  // run/result scene is rebuilt so a button held through the transition must
  // be released before it can activate the newly opened UI.
  function prime(rawGamepads) {
    sample(rawGamepads);
    for (const command of UI_COMMANDS) {
      held[command] = current[command];
      edges[command] = false;
    }
    return edges;
  }

  function clear() {
    for (const command of UI_COMMANDS) {
      held[command] = false;
      current[command] = false;
      edges[command] = false;
    }
    return edges;
  }

  function inspect() {
    return Object.freeze({
      held: Object.freeze({ ...held }),
      polls,
      changes,
      deadzone,
      maximumGamepads,
    });
  }

  return Object.freeze({ poll, prime, clear, inspect });
}

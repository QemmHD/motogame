import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_INPUT_KEY_MAP,
  INPUT_COMMANDS,
  INPUT_INTEGRATION_NOTES,
  createControlLayoutMetadata,
  createInputState,
  normalizeKeyboardCode,
} from '../public/input-state.js';

const NONE = Object.freeze({ gas: false, brake: false, leanBack: false, leanFwd: false });

function gamepad({ buttons = {}, axes = {} } = {}) {
  const normalizedButtons = [];
  const normalizedAxes = [];
  for (const [index, pressed] of Object.entries(buttons)) {
    normalizedButtons[Number(index)] = { pressed: pressed === true, value: pressed ? 1 : 0 };
  }
  for (const [index, value] of Object.entries(axes)) normalizedAxes[Number(index)] = value;
  return { buttons: normalizedButtons, axes: normalizedAxes };
}

test('keyboard code normalization retains current controls and common aliases', () => {
  assert.equal(normalizeKeyboardCode('w'), 'KeyW');
  assert.equal(normalizeKeyboardCode('keya'), 'KeyA');
  assert.equal(normalizeKeyboardCode({ code: 'arrowup' }), 'ArrowUp');
  assert.equal(normalizeKeyboardCode('  Left  '), 'ArrowLeft');
  assert.equal(normalizeKeyboardCode('7'), 'Digit7');
  assert.equal(normalizeKeyboardCode('not a code'), null);
  assert.equal(normalizeKeyboardCode(null), null);
  assert.deepEqual(Object.keys(DEFAULT_INPUT_KEY_MAP).sort(), [
    'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp',
    'KeyA', 'KeyD', 'KeyS', 'KeyW',
  ]);
});

test('keyboard, pointers, gamepads, and development input mix without suppressing each other', () => {
  const input = createInputState();
  assert.equal(input.keyDown('w').handled, true);
  input.pointerBegin({ id: 1, x: 10, y: 20, commands: 'leanBack' });
  input.updateGamepads([gamepad({ buttons: { 6: true } })]);
  input.updateDevelopmentInput({ leanFwd: true });
  assert.deepEqual(input.snapshot(), {
    gas: true,
    brake: true,
    leanBack: true,
    leanFwd: true,
  });

  input.keyUp('KeyW');
  assert.deepEqual(input.snapshot(), { ...NONE, brake: true, leanBack: true, leanFwd: true });
  input.pointerEnd(1);
  assert.deepEqual(input.snapshot(), { ...NONE, brake: true, leanFwd: true });
  input.updateGamepads([]);
  assert.deepEqual(input.snapshot(), { ...NONE, leanFwd: true });
  input.updateDevelopmentInput({});
  assert.deepEqual(input.snapshot(), NONE);
});

test('two pointers independently hold commands and movement recomputes zones', () => {
  const input = createInputState({
    pointerSurface: {
      bounds: { x: 0, y: 0, width: 400, height: 200 },
      zones: [
        { command: 'leanBack', x: 50, y: 150, r: 40 },
        { command: 'leanFwd', x: 140, y: 150, r: 40 },
        { command: 'brake', left: 250, top: 110, right: 315, bottom: 190 },
        { command: 'gas', left: 320, top: 110, right: 395, bottom: 190 },
      ],
    },
  });
  input.pointerBegin({ pointerId: 10, x: 50, y: 150 });
  input.pointerBegin({ pointerId: 11, x: 360, y: 150 });
  assert.deepEqual(input.snapshot(), { ...NONE, gas: true, leanBack: true });

  input.pointerMove({ pointerId: 10, x: 140, y: 150 });
  input.pointerMove({ pointerId: 11, x: 280, y: 150 });
  assert.deepEqual(input.snapshot(), { ...NONE, brake: true, leanFwd: true });

  input.pointerEnd(10);
  assert.deepEqual(input.snapshot(), { ...NONE, brake: true });
  input.pointerEnd(11);
  assert.deepEqual(input.snapshot(), NONE);
});

test('pointer end, cancel, and lost capture all release held commands', () => {
  const input = createInputState();
  input.pointerBegin({ id: 'end', x: 1, y: 1, commands: 'gas' });
  input.pointerBegin({ id: 'cancel', x: 1, y: 1, commands: 'brake' });
  input.pointerBegin({ id: 'capture', x: 1, y: 1, commands: 'leanBack' });
  assert.deepEqual(input.snapshot(), { ...NONE, gas: true, brake: true, leanBack: true });

  assert.equal(input.pointerEnd('end').accepted, true);
  assert.equal(input.pointerCancel('cancel').accepted, true);
  assert.equal(input.pointerLostCapture('capture').accepted, true);
  assert.deepEqual(input.snapshot(), NONE);

  const telemetry = input.getTelemetry();
  assert.equal(telemetry.counters.pointerEnds, 1);
  assert.equal(telemetry.counters.pointerCancels, 1);
  assert.equal(telemetry.counters.pointerLostCaptures, 1);
});

test('invalid coordinates are rejected, outside coordinates are bounded, and stale ids are harmless', () => {
  const input = createInputState({
    pointerBounds: { left: 0, top: 0, right: 100, bottom: 50 },
  });
  const bad = input.pointerBegin({ id: 1, x: Number.NaN, y: 20, commands: 'gas' });
  assert.equal(bad.accepted, false);
  assert.equal(bad.reason, 'invalid-coordinate');
  assert.deepEqual(input.snapshot(), NONE);

  const bounded = input.pointerBegin({ id: 2, x: 1000, y: -30, commands: 'gas' });
  assert.equal(bounded.accepted, true);
  assert.equal(bounded.clamped, true);
  assert.equal(bounded.x, 100);
  assert.equal(bounded.y, 0);
  assert.deepEqual(input.snapshot(), { ...NONE, gas: true });

  const staleMove = input.pointerMove({ id: 999, x: 10, y: 10, commands: 'brake' });
  const staleCancel = input.pointerCancel(999);
  assert.equal(staleMove.stale, true);
  assert.equal(staleCancel.stale, true);
  assert.deepEqual(input.snapshot(), { ...NONE, gas: true });

  const duplicate = input.pointerBegin({ id: 2, x: 10, y: 10, commands: 'brake' });
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.reason, 'duplicate-id');
  assert.deepEqual(input.snapshot(), { ...NONE, gas: true });
  assert.equal(input.getTelemetry().counters.pointerClamped, 1);
});

test('reject coordinate mode leaves an existing pointer unchanged after a bad move', () => {
  const input = createInputState({
    coordinateMode: 'reject',
    pointerBounds: { x: 0, y: 0, width: 100, height: 100 },
  });
  input.pointerBegin({ id: 4, x: 20, y: 20, commands: 'gas' });
  const result = input.pointerMove({ id: 4, x: 101, y: 20, commands: 'brake' });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'outside-bounds');
  assert.deepEqual(input.snapshot(), { ...NONE, gas: true });
  input.pointerCancel(4);
  assert.deepEqual(input.snapshot(), NONE);
});

test('remapping is immediate, supports removal, and held codes never stick', () => {
  const input = createInputState({ keyMap: { KeyW: 'gas', KeyQ: 'leanBack' } });
  input.keyDown('KeyW');
  assert.deepEqual(input.snapshot(), { ...NONE, gas: true });

  input.remapKey('KeyW', 'brake');
  assert.deepEqual(input.snapshot(), { ...NONE, brake: true });

  input.remapKey('KeyW', null);
  assert.deepEqual(input.snapshot(), NONE);
  const released = input.keyUp('KeyW');
  assert.equal(released.handled, true, 'held key remains releasable after its binding is removed');

  input.replaceKeyMap({ q: 'gas', ArrowLeft: 'leanFwd' });
  input.keyDown('KeyQ');
  input.keyDown('left');
  assert.deepEqual(input.snapshot(), { ...NONE, gas: true, leanFwd: true });
});

test('gamepad snapshots aggregate pads, respect axes, and replacement prevents sticky state', () => {
  const input = createInputState();
  input.updateGamepads([
    gamepad({ buttons: { 7: true }, axes: { 0: -0.8 } }),
    gamepad({ buttons: { 1: true }, axes: { 0: 0.9 } }),
  ]);
  assert.deepEqual(input.snapshot(), {
    gas: true,
    brake: true,
    leanBack: true,
    leanFwd: true,
  });

  input.updateGamepads([gamepad({ axes: { 0: 0.2 } })]);
  assert.deepEqual(input.snapshot(), NONE);

  input.updateGamepads('not a gamepad list');
  assert.deepEqual(input.snapshot(), NONE);
  assert.equal(input.getTelemetry().counters.gamepadRejected, 1);

  input.drainEvents();
  const steadyPad = [gamepad({ buttons: { 7: true } })];
  assert.equal(input.pollGamepads(steadyPad), true);
  const changedEventCount = input.peekEvents().length;
  assert.equal(input.pollGamepads(steadyPad), false);
  assert.equal(input.peekEvents().length, changedEventCount,
    'unchanged hot polling must not allocate diagnostic events');
  assert.deepEqual(input.snapshot(), { ...NONE, gas: true });
  assert.equal(input.pollGamepads([]), true);
  assert.deepEqual(input.snapshot(), NONE);
});

test('development updates replace complete snapshots instead of merging flags', () => {
  const input = createInputState();
  input.updateDevelopmentInput({ gas: true, leanFwd: true });
  assert.deepEqual(input.snapshot(), { ...NONE, gas: true, leanFwd: true });
  input.updateDevelopmentInput({ brake: true });
  assert.deepEqual(input.snapshot(), { ...NONE, brake: true });
  input.clearDevelopmentInput();
  assert.deepEqual(input.snapshot(), NONE);

  input.updateDevelopmentInput({ gas: true });
  input.updateDevelopmentInput('invalid');
  assert.deepEqual(input.snapshot(), NONE, 'an invalid sample fails safe instead of retaining throttle');
});

test('clear reasons release every source and emit an explicit pause recommendation', () => {
  for (const reason of ['blur', 'hidden', 'rotation']) {
    const input = createInputState();
    input.keyDown('KeyW');
    input.pointerBegin({ id: 1, x: 1, y: 1, commands: 'brake' });
    input.updateGamepads([gamepad({ buttons: { 14: true } })]);
    input.updateDevelopmentInput({ leanFwd: true });
    input.drainEvents();

    const result = input.clearAll(reason);
    assert.equal(result.pauseRecommended, true);
    assert.deepEqual(result.cleared, {
      keys: 1,
      pointers: 1,
      gamepadCommands: 1,
      developmentCommands: 1,
    });
    assert.deepEqual(input.snapshot(), NONE);
    const events = input.drainEvents();
    assert.equal(events.filter(event => event.type === 'input-cleared').length, 1);
    assert.deepEqual(events.filter(event => event.type === 'pause-recommended')
      .map(event => event.reason), [reason]);
    assert.equal(input.getTelemetry().clearReasons[reason], 1);
  }

  const manual = createInputState();
  assert.equal(manual.clearAll('manual').pauseRecommended, false);
  assert.equal(manual.drainEvents().some(event => event.type === 'pause-recommended'), false);
  manual.clearAll('custom-one');
  manual.clearAll('custom-two');
  assert.equal(manual.getTelemetry().clearReasons.other, 2,
    'arbitrary reasons must stay in one bounded telemetry bucket');
  manual.recommendPause('menu-request');
  assert.equal(manual.drainEvents().at(-1).type, 'pause-recommended');
});

test('snapshots are exact, detached, immutable, and source inspection is detached', () => {
  const input = createInputState();
  input.keyDown('KeyW');
  const first = input.snapshot();
  const second = input.snapshot();
  assert.notEqual(first, second);
  assert.deepEqual(Object.keys(first), INPUT_COMMANDS);
  assert.equal(Object.isFrozen(first), true);
  assert.throws(() => { first.gas = false; }, TypeError);
  assert.equal(second.gas, true);

  const inspection = input.inspect();
  assert.equal(Object.isFrozen(inspection), true);
  assert.equal(Object.isFrozen(inspection.sources.keyboard), true);
  assert.throws(() => inspection.heldKeys.push('KeyS'), TypeError);
  assert.deepEqual(input.snapshot(), { ...NONE, gas: true });
});

test('hot-path reads reuse caller storage while matching detached snapshots', () => {
  const input = createInputState();
  const reusable = { gas: false, brake: false, leanBack: false, leanFwd: false };
  input.keyDown('KeyW');
  input.pointerBegin({ id: 22, x: 10, y: 10, commands: 'leanBack' });
  assert.strictEqual(input.readCommands(reusable), reusable);
  assert.deepEqual(reusable, input.snapshot());
  input.clearAll('manual');
  assert.strictEqual(input.readCommands(reusable), reusable);
  assert.deepEqual(reusable, NONE);
  assert.equal(input.getTelemetry().counters.hotReads, 2);
  assert.throws(() => input.readCommands(null), /target/);
});

test('caller configuration is cloned and published configuration is deeply immutable', () => {
  const caller = {
    keyMap: { KeyZ: 'gas' },
    pointerSurface: {
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      zones: [{ command: 'gas', x: 80, y: 80, radius: 15 }],
    },
    leftHanded: true,
  };
  const input = createInputState(caller);
  caller.keyMap.KeyZ = 'brake';
  caller.pointerSurface.zones[0].command = 'leanBack';
  caller.pointerSurface.bounds.width = 1;

  input.keyDown('KeyZ');
  assert.deepEqual(input.snapshot(), { ...NONE, gas: true });
  const config = input.getConfig();
  assert.equal(config.keyMap.KeyZ, 'gas');
  assert.equal(config.pointerSurface.zones[0].command, 'gas');
  assert.equal(config.pointerSurface.bounds.right, 100);
  assert.equal(config.leftHanded, true);
  assert.equal(Object.isFrozen(config), true);
  assert.equal(Object.isFrozen(config.pointerSurface.zones[0]), true);
  assert.equal(Object.isFrozen(config.gamepadMap.gas.buttons), true);
  assert.throws(() => { config.keyMap.KeyZ = 'brake'; }, TypeError);

  input.remapKey('KeyZ', 'leanFwd');
  assert.equal(config.keyMap.KeyZ, 'gas', 'older config snapshots remain immutable and detached');
  assert.equal(input.getConfig().keyMap.KeyZ, 'leanFwd');
});

test('left-handed layout metadata swaps command clusters without altering input', () => {
  const normal = createControlLayoutMetadata(false);
  const left = createControlLayoutMetadata(true);
  assert.deepEqual(normal.clusters.left, ['leanBack', 'leanFwd']);
  assert.deepEqual(normal.clusters.right, ['brake', 'gas']);
  assert.deepEqual(left.clusters.left, ['gas', 'brake']);
  assert.deepEqual(left.clusters.right, ['leanBack', 'leanFwd']);
  assert.equal(Object.isFrozen(left.commandSides), true);

  const input = createInputState();
  input.keyDown('KeyW');
  assert.equal(input.setLeftHanded(true).leftHanded, true);
  assert.deepEqual(input.snapshot(), { ...NONE, gas: true });
  assert.equal(input.getLayoutMetadata().commandSides.gas, 'left');
});

test('reconfiguring pointer geometry safely releases active pointers', () => {
  const input = createInputState();
  input.pointerBegin({ id: 8, x: 10, y: 10, commands: 'gas' });
  assert.equal(input.snapshot().gas, true);
  const surface = input.configurePointerSurface({
    bounds: { x: 0, y: 0, width: 200, height: 100 },
    zones: [{ command: 'brake', left: 100, top: 0, right: 200, bottom: 100 }],
  });
  assert.equal(Object.isFrozen(surface), true);
  assert.deepEqual(input.snapshot(), NONE);
  assert.equal(input.pointerEnd(8).stale, true);
  input.pointerBegin({ id: 9, x: 150, y: 50 });
  assert.deepEqual(input.snapshot(), { ...NONE, brake: true });
});

test('long input churn stays bounded and never leaves a sticky command', () => {
  const input = createInputState({ eventLimit: 32 });
  for (let index = 0; index < 5_000; index++) {
    const code = index % 2 ? 'KeyW' : 'KeyS';
    input.keyDown(code);
    input.keyDown(code);
    input.keyUp(code);
    input.pointerBegin({ id: index, x: index, y: -index,
      commands: index % 2 ? 'leanBack' : 'leanFwd' });
    input.pointerMove({ id: index, x: index + 0.5, y: -index - 0.5, commands: [] });
    if (index % 3) input.pointerEnd(index);
    else input.pointerCancel(index);
  }
  input.updateGamepads([]);
  input.updateDevelopmentInput({});
  assert.deepEqual(input.snapshot(), NONE);
  const telemetry = input.getTelemetry();
  assert.equal(telemetry.activeKeys, 0);
  assert.equal(telemetry.activePointers, 0);
  assert.equal(telemetry.queuedEvents, 32);
  assert.ok(telemetry.counters.eventsDropped > 1_000);
  assert.equal(telemetry.counters.keyRepeats, 5_000);
  assert.equal(telemetry.counters.pointerBegins, 5_000);
});

test('integration guidance covers every lifecycle adapter boundary', () => {
  const joined = INPUT_INTEGRATION_NOTES.join(' ').toLowerCase();
  for (const term of ['keydown', 'keyup', 'pointercancel', 'pointerlostcapture',
    'gamepad', 'development', 'blur', 'hidden', 'rotation', 'pause-recommended']) {
    assert.ok(joined.includes(term), `integration guidance omitted ${term}`);
  }
  assert.equal(Object.isFrozen(INPUT_INTEGRATION_NOTES), true);
});

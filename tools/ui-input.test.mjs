import assert from 'node:assert/strict';
import test from 'node:test';

import { createUiInput, uiCommandForKey } from '../public/ui-input.js';

function pad({ buttons = {}, axes = [0, 0] } = {}) {
  const values = Array.from({ length: 16 }, (_, index) => ({
    pressed: buttons[index] === true,
    value: buttons[index] === true ? 1 : 0,
  }));
  return { buttons: values, axes };
}

test('keyboard menu commands cover directions, confirm, and back', () => {
  assert.equal(uiCommandForKey('ArrowLeft'), 'left');
  assert.equal(uiCommandForKey('KeyD'), 'right');
  assert.equal(uiCommandForKey('Enter'), 'confirm');
  assert.equal(uiCommandForKey('Space'), 'confirm');
  assert.equal(uiCommandForKey('Escape'), 'back');
  assert.equal(uiCommandForKey('KeyQ'), null);
});

test('gamepad controls emit edges once until released', () => {
  const input = createUiInput();
  const first = input.poll([pad({ buttons: { 0: true, 15: true } })]);
  assert.equal(first.confirm, true);
  assert.equal(first.right, true);
  const held = input.poll([pad({ buttons: { 0: true, 15: true } })]);
  assert.equal(first, held, 'hot polling should reuse its edge object');
  assert.equal(held.confirm, false);
  assert.equal(held.right, false);
  input.poll([pad()]);
  const pressedAgain = input.poll([pad({ buttons: { 0: true } })]);
  assert.equal(pressedAgain.confirm, true);
  assert.equal(input.inspect().polls, 4);
});

test('stick directions use press/release hysteresis around the deadzone', () => {
  const input = createUiInput({ deadzone: 0.62 });
  assert.equal(input.poll([pad({ axes: [0.9, 0] })]).right, true);
  assert.equal(input.poll([pad({ axes: [0.8, 0] })]).right, false);
  assert.equal(input.poll([pad({ axes: [0.5, 0] })]).right, false,
    'a held direction should remain latched inside the release band');
  assert.equal(input.poll([pad({ axes: [0.2, 0] })]).right, false);
  assert.equal(input.poll([pad({ axes: [0.7, 0] })]).right, true);
  const diagonal = input.poll([pad({ axes: [-0.7, -0.9] })]);
  assert.equal(diagonal.left, true);
  assert.equal(diagonal.up, true);
});

test('B maps to back and malformed snapshots stay neutral', () => {
  const input = createUiInput();
  assert.equal(input.poll([null, 'bad', pad({ buttons: { 1: true } })]).back, true);
  input.clear();
  const neutral = input.poll({ nope: true });
  assert.deepEqual({ ...neutral }, {
    left: false, right: false, up: false, down: false, confirm: false, back: false,
  });
  assert.throws(() => createUiInput({ deadzone: 0.1 }), /deadzone/);
});

test('priming preserves a held physical button without creating a transition edge', () => {
  const input = createUiInput();
  const heldPad = pad({ buttons: { 0: true } });
  assert.equal(input.poll([heldPad]).confirm, true);
  input.clear();
  assert.equal(input.prime([heldPad]).confirm, false);
  assert.equal(input.inspect().held.confirm, true);
  assert.equal(input.poll([heldPad]).confirm, false,
    'a control held through a scene reset must not activate the new screen');
  input.poll([pad()]);
  assert.equal(input.poll([heldPad]).confirm, true,
    'a fresh press after release should still activate normally');
});

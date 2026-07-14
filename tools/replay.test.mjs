import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REPLAY_INPUT,
  REPLAY_LIMITS,
  checkReplayCompatibility,
  createReplayPlayback,
  createReplayRecorder,
  decodeReplay,
  encodeReplay,
  hashReplayState,
  packReplayInput,
} from '../public/replay.js';
import { buildTerrain, createBike, stepBike } from '../public/physics.js';
import { createRunState, stepRunRules } from '../public/rules.js';

const metadata = Object.freeze({
  levelId: 'stormworks-08',
  buildVersion: '1.3.0',
  physicsVersion: 'physics-2',
  generatorVersion: 'course-1',
});

function recorder() {
  return createReplayRecorder(metadata);
}

function rawToken(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

test('replay tapes roundtrip through compact base64url JSON', () => {
  const tape = recorder();
  tape.record({ gas: true, lean: 1 });
  tape.record({ gas: true, lean: 1 });
  tape.record({ brake: true, lean: -1 });
  const replay = tape.finalize({
    finishTick: 3,
    finalState: { score: 4200, bike: { y: 18.5, x: 900 }, checkpoints: [true, true] },
  });

  const token = encodeReplay(replay);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  const decoded = decodeReplay(token, { expected: metadata });
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.replay, replay);
  assert.equal(decoded.replay.finishTick, 3);
  assert.match(decoded.replay.stateHash, /^[0-9a-f]{8}$/);
});

test('long identical input spans compress to one RLE run', () => {
  const tape = recorder();
  for (let tick = 0; tick < 600; tick++) tape.record({ gas: true });
  const replay = tape.finalize({ finishTick: 600, finalState: { x: 1234 } });
  assert.equal(tape.runCount, 1);
  assert.deepEqual(replay.runs, [[REPLAY_INPUT.GAS, 600]]);
  assert.ok(encodeReplay(replay).length < 250, 'RLE token unexpectedly large');
});

test('restart events occupy their own bit and survive adjacent input changes', () => {
  const tape = recorder();
  tape.record({ gas: true });
  tape.record({ gas: true, restart: true });
  tape.record({ gas: true });
  const replay = tape.finalize({ finishTick: 3, finalState: { restarts: 1 } });

  assert.deepEqual(replay.runs, [
    [REPLAY_INPUT.GAS, 1],
    [REPLAY_INPUT.GAS | REPLAY_INPUT.RESTART, 1],
    [REPLAY_INPUT.GAS, 1],
  ]);
  const playback = createReplayPlayback(replay);
  assert.equal(playback.inputAt(1).restart, true);
  assert.equal(playback.inputAt(2).restart, false);
});

test('playback performs deterministic random lookup by fixed tick', () => {
  const tape = recorder();
  for (let tick = 0; tick < 3; tick++) tape.record({ gas: true, lean: -1 });
  for (let tick = 0; tick < 2; tick++) tape.record({ brake: true, lean: 1 });
  tape.record({});
  const playback = createReplayPlayback(tape.finalize({
    finishTick: 5,
    finalState: { complete: true },
  }));

  assert.deepEqual(playback.inputAt(0), { gas: true, brake: false, lean: -1, restart: false });
  assert.deepEqual(playback.inputAt(2), { gas: true, brake: false, lean: -1, restart: false });
  assert.deepEqual(playback.inputAt(3), { gas: false, brake: true, lean: 1, restart: false });
  assert.deepEqual(playback.inputAt(5), { gas: false, brake: false, lean: 0, restart: false });
  assert.deepEqual(playback.inputAt(99), { gas: false, brake: false, lean: 0, restart: false });
  assert.throws(() => playback.inputAt(-1), /playback tick/);
});

test('equivalent recording and state order produce byte-identical deterministic tapes', () => {
  const first = recorder();
  const second = recorder();
  const inputs = [
    { gas: true },
    { gas: true },
    { gas: true, lean: 1 },
    { brake: true, lean: -1 },
  ];
  for (const input of inputs) {
    first.record(input);
    second.record(input);
  }
  const a = first.finalize({ finishTick: 4, finalState: { z: 3, bike: { y: 2, x: 1 } } });
  const b = second.finalize({ finishTick: 4, finalState: { bike: { x: 1, y: 2 }, z: 3 } });
  assert.equal(a.stateHash, b.stateHash);
  assert.equal(hashReplayState({ b: 2, a: 1 }), hashReplayState({ a: 1, b: 2 }));
  assert.equal(encodeReplay(a), encodeReplay(b));
});

test('malformed and noncanonical replay data is rejected without throwing', () => {
  for (const token of ['', '***', 'A', rawToken({ nope: true })]) {
    const result = decodeReplay(token);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'MALFORMED');
  }

  const valid = recorder();
  valid.record({ gas: true });
  const compact = JSON.parse(Buffer.from(encodeReplay(valid.finalize({
    finishTick: 1,
    finalState: { x: 1 },
  })), 'base64url').toString('utf8'));
  compact.r = [[REPLAY_INPUT.GAS, 1], [REPLAY_INPUT.GAS, 1]];
  compact.t = 2;
  const malformedRuns = decodeReplay(rawToken(compact));
  assert.equal(malformedRuns.ok, false);
  assert.equal(malformedRuns.code, 'MALFORMED');

  assert.throws(() => packReplayInput({ lean: 0.25 }), /input\.lean/);
  assert.throws(() => hashReplayState({ speed: Number.NaN }), /non-finite/);
});

test('oversized tokens and recorder limits fail with an explicit size code', () => {
  const tooLarge = decodeReplay('A'.repeat(REPLAY_LIMITS.maxEncodedChars + 1));
  assert.equal(tooLarge.ok, false);
  assert.equal(tooLarge.code, 'TOO_LARGE');

  const tiny = createReplayRecorder(metadata, { maxTicks: 2 });
  tiny.record({});
  tiny.record({});
  assert.throws(() => tiny.record({}), (error) => error.code === 'TOO_LARGE');
});

test('version mismatches return an explicit incompatibility result', () => {
  const tape = recorder();
  tape.record({ gas: true });
  const replay = tape.finalize({ finishTick: 1, finalState: { x: 1 } });
  const compatibility = checkReplayCompatibility(replay, { physicsVersion: 'physics-3' });
  assert.equal(compatibility.compatible, false);
  assert.equal(compatibility.code, 'INCOMPATIBLE_VERSION');
  assert.deepEqual(compatibility.mismatches, [{
    field: 'physicsVersion',
    expected: 'physics-3',
    actual: 'physics-2',
  }]);

  const decoded = decodeReplay(encodeReplay(replay), {
    expected: { ...metadata, physicsVersion: 'physics-3' },
  });
  assert.equal(decoded.ok, false);
  assert.equal(decoded.code, 'INCOMPATIBLE_VERSION');
  assert.equal(decoded.mismatches[0].field, 'physicsVersion');
});

test('a recorded physics run replays to the same finish state and hash', () => {
  const level = { course: { startX: 0, startY: 240, checkpoints: [], finishX: 760,
    hazards: [], chains: [[{ x: -200, y: 240 }, { x: 1000, y: 240 }]] } };
  const simulate = (inputAt, record = null) => {
    const terrain = buildTerrain(level.course.chains), run = createRunState(level);
    const bike = createBike(level.course.startX, level.course.startY - 40);
    let tick = 0;
    for (; tick < 600; tick++) {
      const input = inputAt(tick);
      if (record) record.record({ gas: input.gas, brake: input.brake,
        lean: input.leanBack ? -1 : input.leanFwd ? 1 : 0 });
      stepBike(bike, terrain, input, 1 / 60);
      if (stepRunRules(level, run, bike).finished) { tick++; break; }
    }
    const q = value => Math.round(value * 1000);
    return { tick, state: { tick, runTick: run.tick, x: q(bike.x), y: q(bike.y),
      angle: q(bike.angle), rear: [q(bike.rear.x), q(bike.rear.y)],
      front: [q(bike.front.x), q(bike.front.y)] } };
  };
  const gas = () => ({ gas: true, brake: false, leanBack: false, leanFwd: false });
  const tape = recorder();
  const original = simulate(gas, tape);
  const replay = tape.finalize({ finishTick: original.tick, finalState: original.state });
  const playback = createReplayPlayback(replay);
  const replayed = simulate(tick => {
    const input = playback.inputAt(tick);
    return { gas: input.gas, brake: input.brake, leanBack: input.lean < 0, leanFwd: input.lean > 0 };
  });
  assert.deepEqual(replayed, original);
  assert.equal(hashReplayState(replayed.state), replay.stateHash);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLevels } from '../public/levels.js';
import {
  RUN_SESSION_STEP,
  finishTimeForRun,
  initializeRunSession,
  snapshotRunSession,
  stepCrashedRun,
  stepPlayingRun,
} from '../public/run-session.js';

const DT = RUN_SESSION_STEP;
const gas = Object.freeze({ gas: true, brake: false, leanBack: false, leanFwd: false });
const neutral = Object.freeze({ gas: false, brake: false, leanBack: false, leanFwd: false });

function runToFinish(level, levelIndex = 0, maxTicks = 6_000) {
  const target = {};
  initializeRunSession(target, level, levelIndex);
  const trace = [];
  let crashes = 0;
  for (let tick = 0; tick < maxTicks && target.state !== 'finished'; tick++) {
    const events = target.state === 'playing'
      ? stepPlayingRun(target, gas, DT)
      : stepCrashedRun(target, { restart: false }, DT);
    for (const score of events.scores) trace.push([
      target.sessionTick,
      score.type,
      score.points,
      score.combo,
      score.total,
    ]);
    if (events.crash) crashes++;
  }
  return { target, trace, crashes };
}

function crashFixture() {
  const course = {
    startX: 0,
    startY: 240,
    chains: [[{ x: -240, y: 240 }, { x: 1_200, y: 240 }]],
    checkpoints: [{ x: 110, y: 240 }],
    hazards: [{ type: 'saw', id: 'retry-saw', x: 330, y: 190, r: 46 }],
    platforms: [{ id: 'retry-lift', x: 560, y: 130, width: 140, height: 20,
      startActive: false, triggerX: 80,
      motion: { kind: 'sine', axis: 'y', amplitude: 50, period: 2 } }],
    finishX: 1_050,
    bounds() { return { minY: 240, maxY: 240 }; },
  };
  return { name: 'Retry Fixture', world: 'Test', course, star: [8, 12, 20] };
}

function manualRetryScript(level) {
  const target = {};
  initializeRunSession(target, level, 91);
  let crash = null;
  let activation = null;
  let checkpointPlatforms = null;
  for (let tick = 0; tick < 600 && target.state === 'playing'; tick++) {
    const events = stepPlayingRun(target, gas, DT);
    if (events.platformActivations.length) activation = events.platformActivations[0];
    if (events.checkpoint) checkpointPlatforms = snapshotRunSession(target).platforms;
    if (events.crash) crash = events.crash;
  }
  assert.ok(crash, 'fixture never reached its crash');
  assert.ok(activation, 'fixture never activated its triggered platform');
  assert.ok(checkpointPlatforms, 'fixture never captured platform checkpoint state');
  assert.equal(target.run.cpIndex, 1, 'fixture did not cross its checkpoint');
  const checkpointTick = target.run.checkpointSnapshot.tick;
  for (let tick = 0; tick < 7; tick++) stepCrashedRun(target, { restart: false }, DT);
  const retry = stepCrashedRun(target, { restart: true }, DT);
  assert.ok(retry.respawn, 'manual retry did not emit a respawn event');
  assert.deepEqual(snapshotRunSession(target).platforms, checkpointPlatforms,
    'checkpoint retry did not restore exact platform activation/motion state');
  return { target, crash, activation, checkpointTick, checkpointPlatforms, retry };
}

test('a clean Canyon Run completion produces an authoritative finish', () => {
  const level = buildLevels()[0];
  const { target, crashes } = runToFinish(level, 0);
  assert.equal(target.state, 'finished');
  assert.equal(crashes, 0);
  assert.equal(target.running, false);
  assert.equal(target.finishTime, finishTimeForRun(target));
  assert.equal(target.finishScore, target.score);
  assert.ok(target.finishTime > 0 && target.finishTime < 30);
  assert.ok(target.finishStars >= 0 && target.finishStars <= 3);
});

test('crash timing and a manual retry reproduce the exact checkpoint state', () => {
  const level = crashFixture();
  const first = manualRetryScript(level);
  const second = manualRetryScript(level);

  assert.deepEqual(first.crash, second.crash);
  assert.deepEqual(first.activation, second.activation);
  assert.deepEqual(first.retry, second.retry);
  assert.equal(first.retry.respawn.runTick, first.checkpointTick);
  assert.equal(first.retry.respawn.platformTick, first.checkpointTick);
  assert.equal(first.target.state, 'playing');
  assert.deepEqual(snapshotRunSession(first.target), snapshotRunSession(second.target));
});

test('the 1.85 second crash timer auto-respawns on the same fixed tick', () => {
  const level = crashFixture();
  const target = {};
  initializeRunSession(target, level, 91);
  for (let tick = 0; tick < 600 && target.state === 'playing'; tick++) {
    stepPlayingRun(target, gas, DT);
  }
  assert.equal(target.state, 'crashed');
  assert.equal(target.crashTimer, 1.85);
  const elapsedAtCrash = target.elapsed;
  let crashTicks = 0;
  let respawn = null;
  while (target.state === 'crashed' && crashTicks < 200) {
    const events = stepCrashedRun(target, { restart: false }, DT);
    crashTicks++;
    if (events.respawn) respawn = events.respawn;
  }
  // This deliberately matches the browser's repeated floating-point subtract:
  // 1.85 / (1 / 60) reaches a tiny positive remainder at tick 111.
  assert.equal(crashTicks, 112);
  assert.ok(respawn);
  assert.equal(target.state, 'playing');
  assert.ok(Math.abs(target.elapsed - elapsedAtCrash - crashTicks * DT) < 1e-10);
});

test('initializing the same target again is an exact full restart', () => {
  const level = buildLevels()[12];
  const target = { browserOwnedField: 'preserved' };
  initializeRunSession(target, level, 12);
  const initial = snapshotRunSession(target);
  for (let tick = 0; tick < 180; tick++) {
    if (target.state === 'playing') stepPlayingRun(target, gas, DT);
    else stepCrashedRun(target, { restart: false }, DT);
  }

  initializeRunSession(target, level, 12);
  assert.equal(target.browserOwnedField, 'preserved');
  assert.deepEqual(snapshotRunSession(target), initial);
});

test('the same input script repeats score events and the complete finish snapshot', () => {
  const level = buildLevels()[0];
  const first = runToFinish(level, 0);
  const second = runToFinish(level, 0);

  assert.equal(first.target.state, 'finished');
  assert.equal(second.target.state, 'finished');
  assert.deepEqual(first.trace, second.trace);
  assert.deepEqual(snapshotRunSession(first.target), snapshotRunSession(second.target));
  assert.equal(first.target.finishTime, second.target.finishTime);
  assert.equal(first.target.finishScore, second.target.finishScore);
});

test('session stepping and checkpoint restoration never mutate level definitions', () => {
  const level = buildLevels()[12];
  const authored = JSON.stringify({
    chains: level.course.chains,
    hazards: level.course.hazards,
    platforms: level.course.platforms,
    checkpoints: level.course.checkpoints,
  });
  const target = {};
  initializeRunSession(target, level, 12);
  for (let tick = 0; tick < 420 && target.state !== 'finished'; tick++) {
    if (target.state === 'playing') stepPlayingRun(target, tick % 90 < 80 ? gas : neutral, DT);
    else stepCrashedRun(target, { restart: tick % 11 === 0 }, DT);
  }
  assert.equal(JSON.stringify({
    chains: level.course.chains,
    hazards: level.course.hazards,
    platforms: level.course.platforms,
    checkpoints: level.course.checkpoints,
  }), authored);
});

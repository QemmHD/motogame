import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLevels } from '../public/levels.js';
import {
  RUN_SESSION_STEP,
  finishTimeForRun,
  initializeRunSession,
  snapshotRunSession,
  starsForLevel,
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
  let finish = null;
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
    if (events.finish) finish = events.finish;
  }
  return { target, trace, crashes, finish };
}

function crashFixture() {
  const course = {
    startX: 0,
    startY: 240,
    chains: [[{ x: -240, y: 240 }, { x: 1_200, y: 240 }]],
    checkpoints: [{ x: 110, y: 240 }],
    hazards: [{ type: 'saw', id: 'retry-saw', x: 330, y: 190, r: 46 }],
    forceZones: [{ id: 'retry-loom', kind: 'kinetic-loom', x: 230, y: 190,
      width: 100, height: 140, acceleration: { x: 45, y: 0 },
      angularAcceleration: 0, enabled: true, render: { model: 'kinetic-loom' } }],
    platforms: [{ id: 'retry-lift', x: 560, y: 130, width: 140, height: 20,
      startActive: false, triggerX: 80,
      motion: { kind: 'sine', axis: 'y', amplitude: 50, period: 2 } }],
    finishX: 1_050,
    bounds() { return { minY: 240, maxY: 240 }; },
  };
  return { name: 'Retry Fixture', world: 'Test', course, star: [8, 12, 20] };
}

function naturalCrashFixture(kind) {
  const terrainHeadStrike = kind === 'terrain';
  const course = {
    startX: 0,
    startY: 240,
    chains: terrainHeadStrike
      ? [
        [{ x: -18, y: 165, surface: 'gravel' }, { x: 18, y: 165, surface: 'gravel' }],
        [{ x: -400, y: 400 }, { x: 900, y: 400 }],
      ]
      : [[{ x: -400, y: 400 }, { x: 900, y: 400 }]],
    checkpoints: [{ x: 0, y: 240 }],
    hazards: [],
    platforms: terrainHeadStrike ? [] : [{
      id: 'cause-deck', x: 0, y: 177, width: 120, height: 20,
      surface: 'steel', startActive: true,
    }],
    finishX: 800,
    bounds() { return { minY: 165, maxY: 400 }; },
  };
  return { name: `${kind} Cause Fixture`, world: 'Test', course, star: [8, 12, 20] };
}

function manualRetryScript(level) {
  const target = {};
  initializeRunSession(target, level, 91);
  let crash = null;
  let activation = null;
  let loomEntry = null;
  let checkpointPlatforms = null;
  for (let tick = 0; tick < 600 && target.state === 'playing'; tick++) {
    const events = stepPlayingRun(target, gas, DT);
    if (events.platformActivations.length) activation = events.platformActivations[0];
    if (!loomEntry) loomEntry = events.forceZones.find(event => event.entered) || null;
    if (events.checkpoint) checkpointPlatforms = snapshotRunSession(target).platforms;
    if (events.crash) crash = events.crash;
  }
  assert.ok(crash, 'fixture never reached its crash');
  assert.ok(activation, 'fixture never activated its triggered platform');
  assert.ok(loomEntry, 'fixture never entered its Kinetic Loom');
  assert.ok(checkpointPlatforms, 'fixture never captured platform checkpoint state');
  assert.equal(target.run.cpIndex, 1, 'fixture did not cross its checkpoint');
  const checkpointTick = target.run.checkpointSnapshot.tick;
  for (let tick = 0; tick < 7; tick++) stepCrashedRun(target, { restart: false }, DT);
  const retry = stepCrashedRun(target, { restart: true }, DT);
  assert.ok(retry.respawn, 'manual retry did not emit a respawn event');
  assert.deepEqual(snapshotRunSession(target).platforms, checkpointPlatforms,
    'checkpoint retry did not restore exact platform activation/motion state');
  let retryLoomEntry = null;
  for (let tick = 0; tick < 180 && target.state === 'playing' && !retryLoomEntry; tick++) {
    const events = stepPlayingRun(target, gas, DT);
    retryLoomEntry = events.forceZones.find(event => event.entered) || null;
  }
  assert.ok(retryLoomEntry, 'checkpoint retry never re-entered its stateless Kinetic Loom');
  return { target, crash, activation, loomEntry, retryLoomEntry,
    checkpointTick, checkpointPlatforms, retry };
}

test('a clean Canyon Run completion produces an authoritative finish', () => {
  const level = buildLevels()[0];
  const { target, crashes, finish } = runToFinish(level, 0);
  assert.equal(target.state, 'finished');
  assert.equal(crashes, 0);
  assert.equal(target.running, false);
  assert.equal(target.finishTime, finishTimeForRun(target));
  assert.equal(target.finishScore, target.score);
  assert.deepEqual(finish, {
    time: target.finishTime,
    score: target.finishScore,
    stars: target.finishStars,
    elapsed: target.elapsed,
    flipBonus: target.flipBonus,
    tick: target.sessionTick,
  });
  assert.ok(target.finishTime > 0 && target.finishTime < 30);
  assert.ok(target.finishStars >= 0 && target.finishStars <= 3);
});

test('star thresholds are inclusive, ordered, and owned by the run session', () => {
  const level = { star: [18, 25, 34] };
  assert.equal(starsForLevel(level, 18), 3);
  assert.equal(starsForLevel(level, 18.001), 2);
  assert.equal(starsForLevel(level, 25), 2);
  assert.equal(starsForLevel(level, 25.001), 1);
  assert.equal(starsForLevel(level, 34), 1);
  assert.equal(starsForLevel(level, 34.001), 0);
  assert.equal(starsForLevel({ star: [25, 18, 34] }, 10), 0);
  assert.equal(starsForLevel({ star: [18, NaN, 34] }, 10), 0);
});

test('Vector Weave completes through all three authoritative Kinetic Looms', () => {
  const level = buildLevels()[15];
  const target = {};
  initializeRunSession(target, level, 15);
  const touched = new Set();
  const entered = new Set();
  let crashes = 0;
  for (let tick = 0; tick < 1_500 && target.state !== 'finished'; tick++) {
    const events = target.state === 'playing'
      ? stepPlayingRun(target, gas, DT)
      : stepCrashedRun(target, { restart: false }, DT);
    for (const zone of events.forceZones) {
      touched.add(zone.id);
      if (zone.entered) entered.add(zone.id);
    }
    if (events.crash) crashes++;
  }
  assert.equal(target.state, 'finished');
  assert.equal(crashes, 0);
  assert.deepEqual([...touched].sort(), ['weave-assist', 'weave-correction', 'weave-loft']);
  assert.deepEqual([...entered].sort(), [...touched].sort());
  assert.equal(level.course.hazards.length, 0);
  assert.equal(level.course.checkpoints.length, 3);
});

test('crash timing and a manual retry reproduce the exact checkpoint state', () => {
  const level = crashFixture();
  const first = manualRetryScript(level);
  const second = manualRetryScript(level);

  assert.deepEqual(first.crash, second.crash);
  assert.deepEqual(first.activation, second.activation);
  assert.deepEqual(first.loomEntry, second.loomEntry);
  assert.deepEqual(first.retryLoomEntry, second.retryLoomEntry);
  assert.equal(first.loomEntry.id, 'retry-loom');
  assert.equal(first.loomEntry.impulse.x, 45 * DT);
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

test('manual retry wins exactly once on the automatic retry boundary', () => {
  const target = {};
  initializeRunSession(target, crashFixture(), 91);
  for (let tick = 0; tick < 600 && target.state === 'playing'; tick++) {
    stepPlayingRun(target, gas, DT);
  }
  assert.equal(target.state, 'crashed');
  target.crashTimer = DT;
  const events = stepCrashedRun(target, { restart: true }, DT);
  assert.ok(events.respawn);
  assert.equal(events.stateBefore, 'crashed');
  assert.equal(events.stateAfter, 'playing');
  assert.equal(target.state, 'playing');
  assert.equal(target.crashTimer, 0);
});

test('crash presentation reasons are natural and detached from authoritative session state', () => {
  const target = {};
  initializeRunSession(target, crashFixture(), 91);
  let crash = null;
  for (let tick = 0; tick < 600 && !crash; tick++) {
    crash = stepPlayingRun(target, gas, DT).crash;
  }
  assert.ok(crash?.reason);
  const authoritative = snapshotRunSession(target);
  const storedReason = structuredClone(target.lastCrash);
  assert.notEqual(crash.reason, target.lastCrash);
  crash.reason.type = 'presentation-only-mutation';
  crash.reason.x = Infinity;
  crash.reason.details = { nested: true };
  assert.deepEqual(target.lastCrash, storedReason);
  assert.deepEqual(snapshotRunSession(target), authoritative);

  for (const type of ['terrain', 'platform']) {
    const naturalTarget = {};
    initializeRunSession(naturalTarget, naturalCrashFixture(type), 92);
    const naturalCrash = stepPlayingRun(naturalTarget, neutral, DT).crash;
    assert.ok(naturalCrash, `${type} fixture did not crash naturally`);
    assert.equal(naturalCrash.type, type);
    assert.equal(naturalCrash.reason?.type, type);
    assert.equal(naturalTarget.lastCrash, null,
      `${type} presentation metadata entered replay-authoritative lastCrash state`);
    assert.equal(snapshotRunSession(naturalTarget).crash[2], null,
      `${type} presentation metadata changed the proof snapshot`);
    const naturalSnapshot = snapshotRunSession(naturalTarget);
    naturalCrash.reason.type = 'presentation-only-mutation';
    naturalCrash.reason.x = Infinity;
    assert.deepEqual(snapshotRunSession(naturalTarget), naturalSnapshot);
  }
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
  const level = buildLevels()[15];
  const authored = JSON.stringify({
    chains: level.course.chains,
    hazards: level.course.hazards,
    platforms: level.course.platforms,
    forceZones: level.course.forceZones,
    checkpoints: level.course.checkpoints,
  });
  const target = {};
  initializeRunSession(target, level, 15);
  for (let tick = 0; tick < 420 && target.state !== 'finished'; tick++) {
    if (target.state === 'playing') stepPlayingRun(target, tick % 90 < 80 ? gas : neutral, DT);
    else stepCrashedRun(target, { restart: tick % 11 === 0 }, DT);
  }
  assert.equal(JSON.stringify({
    chains: level.course.chains,
    hazards: level.course.hazards,
    platforms: level.course.platforms,
    forceZones: level.course.forceZones,
    checkpoints: level.course.checkpoints,
  }), authored);
});

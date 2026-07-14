import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFinishReport,
  buildResultActions,
  canonicalTimeBreakdown,
  createScoreLedger,
  formatRaceTime,
  focusedResultAction,
  initialResultFocus,
  moveResultFocus,
  recordScoreEvent,
  resetScoreLedger,
  resolveNextRoute,
  resolveResultAction,
  snapshotScoreLedger,
  timeToMilliseconds,
} from '../public/finish-flow.js';

function level(name) {
  return { name, world: 'Test Relay', course: { chains: [] }, star: [10, 14, 20] };
}

const levels = Object.freeze([level('Launch'), level('Switchback'), level('Finale')]);

function ledgerWithScore() {
  const ledger = createScoreLedger();
  recordScoreEvent(ledger, { type: 'flip', points: 300 });
  recordScoreEvent(ledger, { type: 'landingPerfect', points: 180 });
  recordScoreEvent(ledger, { type: 'nearMiss', points: 140 });
  return ledger;
}

test('score receipts itemize every event and must reconcile exactly', () => {
  const ledger = ledgerWithScore();
  assert.deepEqual(snapshotScoreLedger(ledger, 620), {
    items: [
      { id: 'tricks', label: 'TRICK BANK', points: 300 },
      { id: 'flow', label: 'AIR & LAND', points: 180 },
      { id: 'risk', label: 'RISK LINE', points: 140 },
    ],
    total: 620,
    events: 3,
  });
  assert.throws(() => snapshotScoreLedger(ledger, 619), /score receipt mismatch/);
  resetScoreLedger(ledger);
  assert.deepEqual(snapshotScoreLedger(ledger, 0), {
    items: [{ id: 'clean', label: 'CLEAN RUN', points: 0 }], total: 0, events: 0,
  });
});

test('finish report preserves authoritative arithmetic and PB comparisons', () => {
  const report = buildFinishReport({
    level: levels[0], levelIndex: 0, levels, unlocked: 2,
    elapsed: 21.25, flipBonus: 1.5, finishTime: 19.75,
    score: 620, stars: 2, previousBestTime: 20.25, previousBestScore: 600,
    scoreLedger: ledgerWithScore(), replayAvailable: true, goldenAvailable: true,
  });
  assert.deepEqual(report.timing, {
    gross: 21.25, bonus: 1.5, net: 19.75,
    grossMs: 21250, bonusMs: 1500, netMs: 19750,
    previousBest: 20.25, previousBestMs: 20250,
    delta: 0.5, deltaMs: 500, newRecord: true, tiedRecord: false,
  });
  assert.equal(report.score.delta, 20);
  assert.equal(report.score.newRecord, true);
  assert.equal(report.nextRoute.index, 1);
  assert.deepEqual(report.actions.map(action => [action.id, action.enabled]), [
    ['retry', true], ['replay', true], ['next', true], ['menu', true], ['golden', true],
  ]);
  assert.ok(Object.isFrozen(report));
  assert.ok(Object.isFrozen(report.score.receipt.items));
});

test('canonical time receipt and formatter carry cleanly through minute boundaries', () => {
  assert.deepEqual(canonicalTimeBreakdown({ elapsed: 12.345, flipBonus: 1.5, finishTime: 10.845 }),
    { gross: 12.345, bonus: 1.5, net: 10.845, grossMs: 12345, bonusMs: 1500, netMs: 10845 });
  assert.equal(timeToMilliseconds(1.2346), 1235);
  assert.equal(formatRaceTime(0), '0.00');
  assert.equal(formatRaceTime(59.994), '59.99');
  assert.equal(formatRaceTime(59.995), '1:00.00');
  assert.equal(formatRaceTime(60), '1:00.00');
  assert.equal(formatRaceTime(65.2), '1:05.20');
});

test('finish report rejects a second or rounded finish formula', () => {
  assert.throws(() => buildFinishReport({
    level: levels[0], levelIndex: 0, levels, unlocked: 2,
    elapsed: 10.005, flipBonus: 0.5, finishTime: 9.51,
    score: 0, stars: 3, scoreLedger: createScoreLedger(),
  }), /finish time mismatch/);
});

test('sub-millisecond noise cannot create a zero-delta personal best', () => {
  const report = buildFinishReport({
    level: levels[0], levelIndex: 0, levels, unlocked: 2,
    elapsed: 10.0001, flipBonus: 0, finishTime: 10.0001,
    score: 0, stars: 3, previousBestTime: 10.0004,
    scoreLedger: createScoreLedger(),
  });
  assert.equal(report.timing.netMs, 10000);
  assert.equal(report.timing.previousBestMs, 10000);
  assert.equal(report.timing.deltaMs, 0);
  assert.equal(report.timing.newRecord, false);
  assert.equal(report.timing.tiedRecord, true);
});

test('next route rejects end-of-campaign, holes, locked content, and missing current levels', () => {
  assert.deepEqual(resolveNextRoute({ levels, currentIndex: 0, unlocked: 1 }),
    { available: false, index: 1, reason: 'next-locked' });
  assert.deepEqual(resolveNextRoute({ levels, currentIndex: 2, unlocked: 3 }),
    { available: false, index: null, reason: 'campaign-complete' });
  const hole = [levels[0], null, levels[2]];
  assert.deepEqual(resolveNextRoute({ levels: hole, currentIndex: 0, unlocked: 3 }),
    { available: false, index: 1, reason: 'next-missing' });
  assert.deepEqual(resolveNextRoute({ levels: hole, currentIndex: 1, unlocked: 3 }),
    { available: false, index: null, reason: 'current-missing' });
});

test('result focus wraps and skips disabled actions', () => {
  const actions = buildResultActions({
    nextRoute: { available: true, index: 1 }, replayAvailable: false,
  });
  assert.equal(initialResultFocus(actions), 2);
  assert.equal(moveResultFocus(actions, 0, 1), 2);
  assert.equal(moveResultFocus(actions, 2, 1), 3);
  assert.equal(moveResultFocus(actions, 3, 1), 0);
  assert.equal(moveResultFocus(actions, 0, -1), 3);
  assert.equal(focusedResultAction(actions, 1), null);
  assert.equal(focusedResultAction(actions, 2).id, 'next');
});

test('result actions resolve only valid routes and proof tokens', () => {
  assert.deepEqual(resolveResultAction('retry', { levels, currentIndex: 0, unlocked: 2 }),
    { ok: true, type: 'start', index: 0 });
  assert.deepEqual(resolveResultAction('next', { levels, currentIndex: 0, unlocked: 1 }),
    { ok: false, type: 'next', reason: 'next-locked', index: 1 });
  assert.deepEqual(resolveResultAction('replay', { levels, currentIndex: 0, unlocked: 2 }),
    { ok: false, type: 'replay', reason: 'proof-missing' });
  assert.deepEqual(resolveResultAction('replay', {
    levels, currentIndex: 0, unlocked: 2, replayToken: 'proof', replaySource: 'fresh',
  }), { ok: true, type: 'replay', index: 0, token: 'proof', source: 'fresh' });
  assert.deepEqual(resolveResultAction('next', { levels, currentIndex: 0, unlocked: 2 }),
    { ok: true, type: 'start', index: 1 });
  assert.deepEqual(resolveResultAction('menu'), { ok: true, type: 'menu' });
});

// DOM-free finish/result policy for Moto Rush X3.
//
// The fixed-step run session remains authoritative for elapsed time, flip
// bonus, score, and stars. This module turns those values into a detached
// presentation report, reconciles the score receipt, and guards every route a
// results screen may request. Canvas, persistence, audio, and browser input are
// intentionally outside this file.

const SCORE_BUCKETS = Object.freeze([
  Object.freeze({ id: 'tricks', label: 'TRICK BANK' }),
  Object.freeze({ id: 'flow', label: 'AIR & LAND' }),
  Object.freeze({ id: 'risk', label: 'RISK LINE' }),
  Object.freeze({ id: 'other', label: 'OTHER' }),
]);

const SCORE_BUCKET_BY_EVENT = Object.freeze({
  flip: 'tricks',
  bigAir: 'flow',
  landingPerfect: 'flow',
  landingClean: 'flow',
  blastLine: 'risk',
  nearMiss: 'risk',
});

const ACTION_LABELS = Object.freeze({
  retry: 'RETRY',
  replay: 'REPLAY',
  next: 'NEXT',
  menu: 'MENU',
  golden: 'GOLD RUN',
});

function finiteNumber(value, label, { minimum = 0 } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < minimum) {
    throw new RangeError(`${label} must be a finite number >= ${minimum}`);
  }
  return result;
}

function integer(value, label, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return result;
}

function optionalFinite(value, label) {
  if (value === null || value === undefined) return null;
  return finiteNumber(value, label);
}

function assertLedger(ledger) {
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) {
    throw new TypeError('score ledger must be an object');
  }
  for (const bucket of SCORE_BUCKETS) {
    if (!Number.isSafeInteger(ledger[bucket.id]) || ledger[bucket.id] < 0) {
      throw new RangeError(`score ledger ${bucket.id} must be a non-negative integer`);
    }
  }
  if (!Number.isSafeInteger(ledger.total) || ledger.total < 0
      || !Number.isSafeInteger(ledger.events) || ledger.events < 0) {
    throw new RangeError('score ledger totals must be non-negative integers');
  }
  return ledger;
}

function validLevel(level) {
  return !!level && typeof level === 'object' && !Array.isArray(level)
    && typeof level.name === 'string' && level.name.trim().length > 0
    && !!level.course && typeof level.course === 'object';
}

function freezeAction(id, enabled = true, reason = null) {
  return Object.freeze({ id, label: ACTION_LABELS[id] || id.toUpperCase(),
    enabled: enabled === true, reason: reason || null });
}

export function timeToMilliseconds(value) {
  return Math.max(0, Math.round(finiteNumber(value, 'race time') * 1000));
}

export function canonicalTimeBreakdown({ elapsed, flipBonus, finishTime }) {
  const gross = finiteNumber(elapsed, 'elapsed time');
  const bonus = finiteNumber(flipBonus, 'flip bonus');
  const net = finiteNumber(finishTime, 'finish time');
  const expectedNet = Math.max(0, gross - bonus);
  if (Math.abs(net - expectedNet) > 1e-9) {
    throw new Error(`finish time mismatch: session=${net}, elapsed-minus-bonus=${expectedNet}`);
  }
  const grossMs = timeToMilliseconds(gross);
  const bonusMs = timeToMilliseconds(bonus);
  const netMs = Math.max(0, grossMs - bonusMs);
  if (Math.abs(netMs - timeToMilliseconds(net)) > 1) {
    throw new Error(`canonical finish mismatch: session=${timeToMilliseconds(net)}, receipt=${netMs}`);
  }
  return Object.freeze({ gross, bonus, net, grossMs, bonusMs, netMs });
}

export function formatRaceTime(value) {
  const centiseconds = Math.max(0, Math.round(finiteNumber(value, 'race time') * 100));
  const minutes = Math.floor(centiseconds / 6000);
  const seconds = Math.floor((centiseconds % 6000) / 100);
  const hundredths = centiseconds % 100;
  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
  }
  return `${seconds}.${String(hundredths).padStart(2, '0')}`;
}

export function createScoreLedger() {
  return { tricks: 0, flow: 0, risk: 0, other: 0, total: 0, events: 0 };
}

export function resetScoreLedger(ledger) {
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) {
    throw new TypeError('score ledger must be an object');
  }
  ledger.tricks = 0;
  ledger.flow = 0;
  ledger.risk = 0;
  ledger.other = 0;
  ledger.total = 0;
  ledger.events = 0;
  return ledger;
}

export function recordScoreEvent(ledger, event) {
  assertLedger(ledger);
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new TypeError('score event must be an object');
  }
  const points = integer(event.points, 'score event points');
  const bucket = SCORE_BUCKET_BY_EVENT[event.type] || 'other';
  ledger[bucket] += points;
  ledger.total += points;
  ledger.events++;
  return ledger;
}

export function snapshotScoreLedger(ledger, expectedTotal = ledger?.total) {
  assertLedger(ledger);
  const expected = integer(expectedTotal, 'expected score total');
  const sum = SCORE_BUCKETS.reduce((total, bucket) => total + ledger[bucket.id], 0);
  if (sum !== ledger.total || ledger.total !== expected) {
    throw new Error(`score receipt mismatch: buckets=${sum}, ledger=${ledger.total}, score=${expected}`);
  }
  const items = SCORE_BUCKETS
    .filter(bucket => ledger[bucket.id] > 0)
    .map(bucket => Object.freeze({ id: bucket.id, label: bucket.label, points: ledger[bucket.id] }));
  if (items.length === 0) items.push(Object.freeze({ id: 'clean', label: 'CLEAN RUN', points: 0 }));
  return Object.freeze({ items: Object.freeze(items), total: ledger.total, events: ledger.events });
}

/** Resolve the only legal campaign target after the current level. */
export function resolveNextRoute({ levels, currentIndex, unlocked }) {
  if (!Array.isArray(levels)) throw new TypeError('levels must be an array');
  const index = integer(currentIndex, 'current level index');
  const unlockedCount = integer(unlocked, 'unlocked level count');
  if (index >= levels.length || !validLevel(levels[index])) {
    return Object.freeze({ available: false, index: null, reason: 'current-missing' });
  }
  const nextIndex = index + 1;
  if (nextIndex >= levels.length) {
    return Object.freeze({ available: false, index: null, reason: 'campaign-complete' });
  }
  if (!validLevel(levels[nextIndex])) {
    return Object.freeze({ available: false, index: nextIndex, reason: 'next-missing' });
  }
  if (nextIndex >= unlockedCount) {
    return Object.freeze({ available: false, index: nextIndex, reason: 'next-locked' });
  }
  return Object.freeze({ available: true, index: nextIndex, reason: null,
    levelName: levels[nextIndex].name });
}

export function buildResultActions({ nextRoute, replayAvailable, goldenAvailable = false }) {
  if (!nextRoute || typeof nextRoute !== 'object') throw new TypeError('next route is required');
  const actions = [freezeAction('retry')];
  actions.push(freezeAction('replay', replayAvailable === true,
    replayAvailable === true ? null : 'proof-missing'));
  if (nextRoute.available) actions.push(freezeAction('next'));
  actions.push(freezeAction('menu'));
  if (goldenAvailable === true) actions.push(freezeAction('golden'));
  return Object.freeze(actions);
}

/**
 * Build a detached receipt from authoritative session values.
 *
 * finishTime must match elapsed - flipBonus. Rejecting disagreement here keeps
 * the renderer from silently inventing a second finish formula.
 */
export function buildFinishReport({
  level,
  levelIndex,
  levels,
  unlocked,
  elapsed,
  flipBonus,
  finishTime,
  score,
  stars,
  previousBestTime = null,
  previousBestScore = null,
  scoreLedger,
  replayAvailable = false,
  goldenAvailable = false,
  recordEligible = true,
}) {
  if (!validLevel(level)) throw new TypeError('level must be a playable level');
  const index = integer(levelIndex, 'level index');
  const timing = canonicalTimeBreakdown({ elapsed, flipBonus, finishTime });
  const { gross, bonus, net } = timing;
  const finishScore = integer(score, 'finish score');
  const finishStars = integer(stars, 'finish stars', { maximum: 3 });
  const bestTime = optionalFinite(previousBestTime, 'previous best time');
  const bestScore = optionalFinite(previousBestScore, 'previous best score');
  const scoreReceipt = snapshotScoreLedger(scoreLedger, finishScore);
  const nextRoute = resolveNextRoute({ levels, currentIndex: index, unlocked });
  const previousBestMs = bestTime === null ? null : timeToMilliseconds(bestTime);
  const timeDeltaMs = previousBestMs === null ? null : previousBestMs - timing.netMs;
  const timeDelta = timeDeltaMs === null ? null : timeDeltaMs / 1000;
  const scoreDelta = bestScore === null ? null : finishScore - bestScore;
  const actions = buildResultActions({ nextRoute, replayAvailable, goldenAvailable });
  return Object.freeze({
    level: Object.freeze({ index, number: index + 1, name: level.name,
      world: typeof level.world === 'string' ? level.world : 'Campaign' }),
    timing: Object.freeze({ ...timing, previousBest: bestTime,
      previousBestMs,
      delta: timeDelta, deltaMs: timeDeltaMs,
      newRecord: recordEligible === true
        && (previousBestMs === null || timing.netMs < previousBestMs),
      tiedRecord: previousBestMs !== null && timing.netMs === previousBestMs }),
    score: Object.freeze({ total: finishScore, previousBest: bestScore,
      delta: scoreDelta, newRecord: recordEligible === true
        && (bestScore === null || finishScore > bestScore),
      tiedRecord: bestScore !== null && finishScore === bestScore,
      receipt: scoreReceipt }),
    stars: finishStars,
    recordEligible: recordEligible === true,
    nextRoute,
    actions,
  });
}

export function initialResultFocus(actions, preferred = 'next') {
  if (!Array.isArray(actions)) throw new TypeError('result actions must be an array');
  const preferredIndex = actions.findIndex(action => action?.id === preferred && action.enabled === true);
  if (preferredIndex >= 0) return preferredIndex;
  return actions.findIndex(action => action?.enabled === true);
}

export function moveResultFocus(actions, currentIndex, direction) {
  if (!Array.isArray(actions) || actions.length === 0) return -1;
  const step = Number(direction) < 0 ? -1 : 1;
  let index = Number.isInteger(currentIndex) ? currentIndex : initialResultFocus(actions);
  if (index < 0 || index >= actions.length) index = step > 0 ? -1 : 0;
  for (let attempts = 0; attempts < actions.length; attempts++) {
    index = (index + step + actions.length) % actions.length;
    if (actions[index]?.enabled === true) return index;
  }
  return -1;
}

export function focusedResultAction(actions, focusIndex) {
  if (!Array.isArray(actions) || !Number.isInteger(focusIndex)) return null;
  const action = actions[focusIndex];
  return action?.enabled === true ? action : null;
}

/** Resolve a requested result action without mutating browser or save state. */
export function resolveResultAction(id, {
  levels,
  currentIndex,
  unlocked,
  replayToken = null,
  replaySource = null,
} = {}) {
  const action = String(id || '');
  if (action === 'menu') return Object.freeze({ ok: true, type: 'menu' });
  if (!Array.isArray(levels)) return Object.freeze({ ok: false, type: action, reason: 'levels-missing' });
  const index = Number(currentIndex);
  if (!Number.isSafeInteger(index) || index < 0 || index >= levels.length || !validLevel(levels[index])) {
    return Object.freeze({ ok: false, type: action, reason: 'current-missing' });
  }
  if (action === 'retry') return Object.freeze({ ok: true, type: 'start', index });
  if (action === 'replay') {
    if (typeof replayToken !== 'string' || replayToken.length === 0) {
      return Object.freeze({ ok: false, type: action, reason: 'proof-missing' });
    }
    return Object.freeze({ ok: true, type: 'replay', index, token: replayToken,
      source: replaySource || 'saved' });
  }
  if (action === 'next') {
    const route = resolveNextRoute({ levels, currentIndex: index, unlocked });
    if (!route.available) return Object.freeze({ ok: false, type: action, reason: route.reason,
      index: route.index });
    return Object.freeze({ ok: true, type: 'start', index: route.index });
  }
  return Object.freeze({ ok: false, type: action, reason: 'unknown-action' });
}

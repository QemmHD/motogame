// Authoritative, DOM-free run lifecycle for Moto Rush X3.
//
// This module owns only simulation and scoring state. Audio, particles, camera,
// haptics, persistence, menus, ragdolls, and replay encoding remain consumers of
// the plain presentation events returned by each fixed-tick step.

import {
  buildTerrain,
  createBike,
  resolveBikePlatforms,
  stepBike,
} from './physics.js';
import {
  createRunState,
  restoreCheckpointRunState,
  stepRunRules,
} from './rules.js';
import {
  activateKinematicPlatform,
  createKinematicRun,
  restoreKinematicRun,
  snapshotKinematicRun,
  stepKinematicRun,
} from './kinematics.js';

export const RUN_SESSION_STEP = 1 / 60;
export const RUN_SESSION_CRASH_DURATION = 1.85;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function positive(value, fallback, label) {
  const result = value === undefined ? fallback : value;
  if (!Number.isFinite(result) || result <= 0) throw new RangeError(`${label} must be positive`);
  return result;
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function assertSession(target) {
  assertObject(target, 'run session target');
  if (!target._runSessionReady || !target.level?.course || !target.bike || !target.run) {
    throw new Error('run session target has not been initialized');
  }
  return target;
}

function assertStep(dt) {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) {
    throw new RangeError('run session dt must be greater than 0 and at most 0.1 seconds');
  }
  return dt;
}

function normalizeInput(input = {}) {
  assertObject(input, 'run input');
  const lean = finite(input.lean, 0);
  return {
    gas: input.gas === true,
    brake: input.brake === true,
    leanBack: input.leanBack === true || lean < 0,
    leanFwd: input.leanFwd === true || lean > 0,
  };
}

function clonePlainEvent(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clonePlainEvent);
  const result = {};
  for (const [key, child] of Object.entries(value)) result[key] = clonePlainEvent(child);
  return result;
}

function createStepEvents(target) {
  return {
    tick: target.sessionTick + 1,
    stateBefore: target.state,
    stateAfter: target.state,
    flips: [],
    landings: [],
    scores: [],
    explosions: [],
    impulses: [],
    nearMisses: [],
    platformContacts: [],
    platformActivations: [],
    checkpoint: null,
    crash: null,
    finish: null,
    respawn: null,
  };
}

function finishEvents(target, events) {
  events.stateAfter = target.state;
  return events;
}

function starsForLevel(level, time) {
  const stars = level.star;
  if (!Array.isArray(stars) || stars.length < 3) return 0;
  if (time <= stars[0]) return 3;
  if (time <= stars[1]) return 2;
  if (time <= stars[2]) return 1;
  return 0;
}

function recordScore(target, events, type, base, x, y, details = {}) {
  const points = Math.round(base * target.combo);
  target.score += points;
  const event = {
    type,
    base,
    points,
    combo: target.combo,
    total: target.score,
    x,
    y,
    ...details,
  };
  events.scores.push(event);
  return event;
}

function awardScore(target, events, type, base, x, y, details = {}) {
  target.combo = Math.min(9, target.combo + 1);
  target.comboTimer = 2.6;
  return recordScore(target, events, type, base, x, y, details);
}

function enterCrash(target, reason, events) {
  target.state = 'crashed';
  target.crashTimer = target.runSessionOptions.crashDuration;
  target.crashAge = 0;
  target.combo = 1;
  target.comboTimer = 0;
  target.lastCrash = reason ? clonePlainEvent(reason) : null;
  const x = reason?.x ?? target.bike.head.x;
  const y = reason?.y ?? target.bike.head.y;
  events.crash = {
    type: reason?.type || 'collision',
    reason: target.lastCrash,
    x,
    y,
    duration: target.crashTimer,
  };
}

function enterFinish(target, events) {
  target.state = 'finished';
  target.running = false;
  target.finishTimer = 0;
  target.finishTime = finishTimeForRun(target);
  target.finishScore = target.score;
  target.finishStars = starsForLevel(target.level, target.finishTime);
  events.finish = {
    time: target.finishTime,
    score: target.finishScore,
    stars: target.finishStars,
    elapsed: target.elapsed,
    flipBonus: target.flipBonus,
    tick: target.sessionTick,
  };
}

/**
 * Initialize an existing object in place. Unrelated browser-owned fields on the
 * target are preserved, allowing the current game state object to adopt this
 * session without a mirror object later.
 */
export function initializeRunSession(target, level, levelIndex = 0, options = {}) {
  assertObject(target, 'run session target');
  assertObject(level, 'level');
  assertObject(level.course, 'level.course');
  assertObject(options, 'run session options');
  if (!Array.isArray(level.course.chains)) throw new TypeError('level.course.chains must be an array');

  const crashDuration = positive(
    options.crashDuration,
    RUN_SESSION_CRASH_DURATION,
    'options.crashDuration',
  );
  const falloutMargin = positive(options.falloutMargin, 900, 'options.falloutMargin');
  const spawnOffsetY = Number.isFinite(options.spawnOffsetY) ? options.spawnOffsetY : -40;
  const bounds = typeof level.course.bounds === 'function'
    ? level.course.bounds()
    : { maxY: Math.max(...level.course.chains.flat().map(point => finite(point?.y)), level.course.startY) };

  target._runSessionReady = true;
  target.runSessionOptions = Object.freeze({ crashDuration, falloutMargin, spawnOffsetY });
  target.runSessionBikeConfig = options.bikeConfig;
  target.level = level;
  target.levelIndex = Math.trunc(finite(levelIndex));
  target.levelIdx = target.levelIndex;
  target.terrain = buildTerrain(level.course.chains);
  target.run = createRunState(level);
  target.cpList = target.run.cpList;
  target.cpIndex = target.run.cpIndex;
  const authoredPlatforms = level.course.platforms || [];
  target.platformTriggers = Object.freeze(authoredPlatforms
    .map((definition, index) => Number.isFinite(definition.triggerX)
      ? Object.freeze({
        id: String(definition.id || `platform-${index}`),
        triggerX: definition.triggerX,
      })
      : null)
    .filter(Boolean));
  const runtimePlatformDefinitions = authoredPlatforms.map(definition => (
    Number.isFinite(definition.triggerX) && definition.startActive === undefined
      ? { ...definition, startActive: false }
      : definition
  ));
  target.kinematics = createKinematicRun(runtimePlatformDefinitions);
  target.bike = createBike(
    level.course.startX,
    level.course.startY + spawnOffsetY,
    options.bikeConfig,
  );
  for (const trigger of target.platformTriggers) {
    if (target.bike.x >= trigger.triggerX) activateKinematicPlatform(target.kinematics, trigger.id);
  }
  target.kinematicCheckpointSnapshot = snapshotKinematicRun(target.kinematics);
  target.falloutY = finite(bounds?.maxY, level.course.startY) + falloutMargin;
  target.sessionTick = 0;
  target.elapsed = 0;
  target.flipBonus = 0;
  target.score = 0;
  target.combo = 1;
  target.comboTimer = 0;
  target.airStart = -1;
  target.prevGrounded = true;
  target.prevFlipEvent = target.bike.flipEventId;
  target.state = 'playing';
  target.running = true;
  target.crashTimer = 0;
  target.crashAge = 0;
  target.lastCrash = null;
  target.finishTimer = 0;
  target.finishTime = 0;
  target.finishScore = 0;
  target.finishStars = 0;
  return target;
}

/** Advance one authoritative playing tick and return presentation-only events. */
export function stepPlayingRun(target, rawInput, dt = RUN_SESSION_STEP) {
  assertSession(target);
  assertStep(dt);
  if (target.state !== 'playing') throw new Error(`cannot step playing run from ${target.state}`);
  const input = normalizeInput(rawInput);
  const events = createStepEvents(target);
  target.sessionTick++;
  target.elapsed += dt;

  stepKinematicRun(target.kinematics);
  stepBike(target.bike, target.terrain, input, dt);
  for (const trigger of target.platformTriggers) {
    if (target.bike.x >= trigger.triggerX
        && activateKinematicPlatform(target.kinematics, trigger.id)) {
      events.platformActivations.push({
        id: trigger.id,
        triggerX: trigger.triggerX,
        tick: target.kinematics.tick,
      });
    }
  }
  const platformContacts = resolveBikePlatforms(target.bike, target.kinematics, dt, input);
  events.platformContacts = platformContacts.map(contact => ({
    platformId: contact.platformId,
    node: contact.node,
    x: finite(contact.x, finite(contact.pose?.x)),
    y: finite(contact.y, finite(contact.pose?.top)),
    surface: contact.pose?.surface || contact.surface || 'dirt',
    inheritedVelocity: clonePlainEvent(contact.inheritedVelocity || { x: 0, y: 0 }),
  }));

  if (target.comboTimer > 0) {
    target.comboTimer -= dt;
    if (target.comboTimer <= 0) target.combo = 1;
  }

  const bike = target.bike;
  if (bike.flipEventId > target.prevFlipEvent) {
    target.prevFlipEvent = bike.flipEventId;
    const count = Math.abs(bike.lastFlips);
    target.flipBonus += 0.5 * count;
    target.combo = Math.min(9, target.combo + count);
    target.comboTimer = 2.6;
    const score = recordScore(
      target,
      events,
      'flip',
      150 * count,
      bike.x,
      bike.y - 70,
      { count, rawFlips: bike.lastFlips, timeBonus: 0.5 * count },
    );
    events.flips.push({
      count,
      rawFlips: bike.lastFlips,
      timeBonus: 0.5 * count,
      combo: target.combo,
      points: score.points,
      x: bike.x,
      y: bike.y - 70,
    });
  }

  if (!bike.grounded && target.prevGrounded) target.airStart = target.elapsed;
  if (bike.landedThisStep && !bike.crashed) {
    const impact = bike.landingImpact;
    const airTime = target.airStart >= 0 ? target.elapsed - target.airStart : 0;
    const gradeWorthy = airTime > 0.22 || impact > 220;
    const landing = {
      grade: bike.landingGrade,
      quality: bike.landingQuality,
      retention: bike.landingRetention,
      impact,
      airTime,
      gradeWorthy,
      feedback: impact > 120,
      x: bike.x,
      y: bike.y,
    };
    events.landings.push(landing);
    if (airTime > 0.62) {
      awardScore(target, events, 'bigAir', Math.round(airTime * 150), bike.x, bike.y - 60,
        { airTime });
    }
    if (gradeWorthy && bike.landingGrade === 'perfect') {
      awardScore(target, events, 'landingPerfect', 180, bike.x, bike.y - 86, { landing });
    } else if (gradeWorthy && bike.landingGrade === 'clean') {
      awardScore(target, events, 'landingClean', 90, bike.x, bike.y - 76, { landing });
    }
    target.airStart = -1;
  }
  target.prevGrounded = bike.grounded;

  const rules = stepRunRules(target.level, target.run, bike);
  events.explosions = rules.explosions.map(clonePlainEvent);
  events.impulses = rules.impulses.map(clonePlainEvent);
  events.nearMisses = rules.nearMisses.map(clonePlainEvent);

  for (const impulse of rules.impulses) {
    awardScore(target, events, 'blastLine', Math.round(impulse.power * 0.3),
      impulse.x, impulse.y - 88, { impulse: clonePlainEvent(impulse) });
  }
  for (const nearMiss of rules.nearMisses) {
    awardScore(target, events, 'nearMiss', 70, nearMiss.x, nearMiss.y - 40,
      { nearMiss: clonePlainEvent(nearMiss) });
  }

  if (rules.crash) bike.crashed = true;
  if (rules.checkpoint) {
    target.cpIndex = target.run.cpIndex;
    target.kinematicCheckpointSnapshot = snapshotKinematicRun(target.kinematics);
    events.checkpoint = clonePlainEvent(rules.checkpoint);
  }

  if (rules.finished && !bike.crashed) enterFinish(target, events);
  else if (bike.crashed) enterCrash(target, rules.crash, events);
  else if (bike.y > target.falloutY) {
    bike.crashed = true;
    enterCrash(target, { type: 'fallout' }, events);
  }
  return finishEvents(target, events);
}

/** Advance one crash tick; a manual restart is consumed before crash time. */
export function stepCrashedRun(target, { restart = false } = {}, dt = RUN_SESSION_STEP) {
  assertSession(target);
  assertStep(dt);
  if (target.state !== 'crashed') throw new Error(`cannot step crashed run from ${target.state}`);
  const events = createStepEvents(target);
  target.sessionTick++;
  if (restart === true) {
    events.respawn = respawnRunSession(target);
    return finishEvents(target, events);
  }
  target.elapsed += dt;
  target.crashAge += dt;
  target.crashTimer -= dt;
  if (target.crashTimer <= 0) events.respawn = respawnRunSession(target);
  return finishEvents(target, events);
}

/** Restore the exact authored checkpoint snapshot without advancing a tick. */
export function respawnRunSession(target) {
  assertSession(target);
  const checkpointIndex = target.run?.cpIndex ?? target.cpIndex;
  const checkpoint = target.cpList[checkpointIndex];
  if (!checkpoint) throw new Error(`checkpoint ${checkpointIndex} is unavailable`);
  const wheelSpin = target.bike.wheelSpin;
  target.cpIndex = checkpointIndex;
  target.run = restoreCheckpointRunState(target.level, target.run);
  target.cpList = target.run.cpList;
  restoreKinematicRun(target.kinematics, target.kinematicCheckpointSnapshot);
  target.bike = createBike(
    checkpoint.x,
    checkpoint.y + target.runSessionOptions.spawnOffsetY,
    target.runSessionBikeConfig,
  );
  target.bike.wheelSpin = wheelSpin;
  target.state = 'playing';
  target.running = true;
  target.airStart = -1;
  target.crashTimer = 0;
  target.crashAge = 0;
  target.lastCrash = null;
  target.prevGrounded = true;
  target.prevFlipEvent = target.bike.flipEventId;
  return {
    checkpointIndex,
    x: checkpoint.x,
    y: checkpoint.y,
    runTick: target.run.tick,
    platformTick: target.kinematics.tick,
  };
}

/** Net timed result, matching the browser's elapsed-minus-flip-bonus rule. */
export function finishTimeForRun(target) {
  assertSession(target);
  return Math.max(0, finite(target.elapsed) - finite(target.flipBonus));
}

function q(value) {
  return Math.round(finite(Number(value)) * 1000);
}

function snapshotNode(node) {
  return [q(node?.x), q(node?.y), q(node?.ox), q(node?.oy)];
}

/** Stable, plain, quantized authoritative snapshot suitable for proof hashing. */
export function snapshotRunSession(target) {
  assertSession(target);
  const bike = target.bike;
  return {
    level: target.levelIdx,
    state: target.state,
    running: target.running ? 1 : 0,
    sessionTick: target.sessionTick,
    runTick: target.run.tick,
    platformTick: target.kinematics.tick,
    checkpoint: target.run.cpIndex,
    elapsed: q(target.elapsed),
    flipBonus: q(target.flipBonus),
    score: target.score,
    combo: target.combo,
    comboTimer: q(target.comboTimer),
    airStart: target.airStart < 0 ? -1 : q(target.airStart),
    crash: [q(target.crashTimer), q(target.crashAge), target.lastCrash?.type || null],
    finish: [q(target.finishTime), target.finishScore, target.finishStars],
    bike: {
      mode: bike.mode,
      crashed: bike.crashed ? 1 : 0,
      grounded: bike.grounded ? 1 : 0,
      rear: snapshotNode(bike.rear),
      front: snapshotNode(bike.front),
      head: snapshotNode(bike.head),
      air: [q(bike.mx), q(bike.my), q(bike.mvx), q(bike.mvy), q(bike.aAngle), q(bike.aOmega)],
      flips: [bike.flipEventId, bike.lastFlips, q(bike.wheelSpin)],
      landing: [bike.landingGrade, q(bike.landingQuality), q(bike.landingRetention)],
    },
    hazards: target.run.hazards.map(hazard => [
      hazard.id,
      hazard.type,
      q(hazard.x),
      q(hazard.y),
      q(hazard.prevX),
      q(hazard.prevY),
      q(hazard.spin),
      hazard.nearMissed ? 1 : 0,
      hazard.triggered ? 1 : 0,
      hazard.fuseTicks,
      hazard.exploded ? 1 : 0,
    ]),
    platforms: target.kinematics.platforms.map(platform => [
      platform.id,
      q(platform.previous.x),
      q(platform.previous.y),
      q(platform.current.x),
      q(platform.current.y),
      q(platform.current.vx),
      q(platform.current.vy),
      platform.active ? 1 : 0,
      platform.activationTick,
    ]),
  };
}

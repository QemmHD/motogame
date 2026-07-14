// Moto Rush X3 crash-theater simulation.
//
// This module is deliberately DOM-free. Coordinates use the same convention as
// physics.js (x right, y down), but terrain is supplied through a callback so
// the simulation can be tested, replayed, or rendered without browser globals.

const TAU = Math.PI * 2;

export const RAGDOLL_DEFAULTS = Object.freeze({
  fixedDt: 1 / 120,
  maxFrameDt: 0.1,
  maxStepsPerCall: 24,
  gravity: 1900,
  damping: 0.997,
  solverIterations: 8,
  restitution: 0.045,
  friction: 0.34,
  maxSpeed: 1800,
  maxDistance: 7000,
  maxContactCorrection: 96,
  settleSpeed: 24,
  settleFrames: 72,
  minSettleTime: 0.8,
  maxLife: 12,
});

const NODE_BLUEPRINTS = Object.freeze([
  // id, radius, mass, render group
  ['rearWheel', 18, 2.2, 'bike'],
  ['frontWheel', 18, 2.2, 'bike'],
  ['bikeFrame', 7, 1.9, 'bike'],
  ['seat', 5, 0.8, 'bike'],
  ['handlebar', 4, 0.65, 'bike'],
  ['hip', 8, 1.25, 'rider'],
  ['torso', 9, 1.35, 'rider'],
  ['head', 8, 0.75, 'rider'],
  ['helmet', 12, 0.45, 'rider'],
  ['rearHand', 4.5, 0.28, 'rider'],
  ['frontHand', 4.5, 0.28, 'rider'],
  ['rearFoot', 5, 0.38, 'rider'],
  ['frontFoot', 5, 0.38, 'rider'],
]);

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function length(x, y) {
  return Math.sqrt(x * x + y * y);
}

function point(value, fallbackX, fallbackY) {
  return {
    x: finite(value?.x, fallbackX),
    y: finite(value?.y, fallbackY),
  };
}

function mergeConfig(overrides) {
  const cfg = { ...RAGDOLL_DEFAULTS };
  for (const key of Object.keys(cfg)) {
    if (Number.isFinite(overrides?.[key])) cfg[key] = overrides[key];
  }
  cfg.fixedDt = clamp(cfg.fixedDt, 1 / 360, 1 / 30);
  cfg.maxFrameDt = clamp(cfg.maxFrameDt, cfg.fixedDt, 0.25);
  cfg.maxStepsPerCall = Math.max(1, Math.floor(cfg.maxStepsPerCall));
  cfg.solverIterations = Math.max(1, Math.floor(cfg.solverIterations));
  cfg.gravity = clamp(cfg.gravity, -6000, 6000);
  cfg.damping = clamp(cfg.damping, 0.8, 1);
  cfg.restitution = clamp(cfg.restitution, 0, 0.8);
  cfg.friction = clamp(cfg.friction, 0, 1);
  cfg.maxSpeed = clamp(cfg.maxSpeed, 100, 10000);
  cfg.maxDistance = clamp(cfg.maxDistance, 500, 100000);
  cfg.maxContactCorrection = clamp(cfg.maxContactCorrection, 1, 1000);
  cfg.settleSpeed = clamp(cfg.settleSpeed, 0.1, cfg.maxSpeed);
  cfg.settleFrames = Math.max(1, Math.floor(cfg.settleFrames));
  cfg.minSettleTime = Math.max(0, cfg.minSettleTime);
  cfg.maxLife = Math.max(cfg.minSettleTime + cfg.fixedDt, cfg.maxLife);
  return Object.freeze(cfg);
}

function makeBasis(snapshot) {
  const fallbackX = finite(snapshot?.x, 0);
  const fallbackY = finite(snapshot?.y, 0);
  const wheelBase = Math.max(24, finite(snapshot?.cfg?.wheelBase, 80));
  const rear = point(snapshot?.rear, fallbackX - wheelBase / 2, fallbackY);
  const front = point(snapshot?.front, fallbackX + wheelBase / 2, fallbackY);
  const midpoint = { x: (rear.x + front.x) * 0.5, y: (rear.y + front.y) * 0.5 };
  let dx = front.x - rear.x;
  let dy = front.y - rear.y;
  let distance = length(dx, dy);
  if (distance < 1e-6) {
    dx = wheelBase;
    dy = 0;
    distance = wheelBase;
    rear.x = midpoint.x - wheelBase / 2;
    front.x = midpoint.x + wheelBase / 2;
  }
  const forward = { x: dx / distance, y: dy / distance };
  let up = { x: forward.y, y: -forward.x };
  const sourceHead = point(snapshot?.head, midpoint.x + up.x * 44, midpoint.y + up.y * 44);
  if ((sourceHead.x - midpoint.x) * up.x + (sourceHead.y - midpoint.y) * up.y < 0) {
    up = { x: -up.x, y: -up.y };
  }
  return { rear, front, midpoint, forward, up, sourceHead, wheelBase: distance };
}

function localPoint(basis, forwardOffset, upOffset) {
  return {
    x: basis.midpoint.x + basis.forward.x * forwardOffset + basis.up.x * upOffset,
    y: basis.midpoint.y + basis.forward.y * forwardOffset + basis.up.y * upOffset,
  };
}

function dynamicPose(basis) {
  const head = basis.sourceHead;
  const handlebar = localPoint(basis, basis.wheelBase * 0.29, 20);
  const seat = localPoint(basis, -basis.wheelBase * 0.18, 13);
  const hip = {
    x: head.x - basis.up.x * 39 - basis.forward.x * 9,
    y: head.y - basis.up.y * 39 - basis.forward.y * 9,
  };
  const torso = {
    x: head.x - basis.up.x * 21 - basis.forward.x * 4,
    y: head.y - basis.up.y * 21 - basis.forward.y * 4,
  };
  return {
    rearWheel: basis.rear,
    frontWheel: basis.front,
    bikeFrame: localPoint(basis, 0, 8),
    seat,
    handlebar,
    hip,
    torso,
    head,
    helmet: {
      x: head.x + basis.up.x * 3 - basis.forward.x * 1.5,
      y: head.y + basis.up.y * 3 - basis.forward.y * 1.5,
    },
    rearHand: {
      x: handlebar.x - basis.forward.x * 5 + basis.up.x * 1.5,
      y: handlebar.y - basis.forward.y * 5 + basis.up.y * 1.5,
    },
    frontHand: {
      x: handlebar.x + basis.forward.x * 5 - basis.up.x * 1.5,
      y: handlebar.y + basis.forward.y * 5 - basis.up.y * 1.5,
    },
    rearFoot: localPoint(basis, -basis.wheelBase * 0.2, 5),
    frontFoot: localPoint(basis, basis.wheelBase * 0.03, 4),
  };
}

function staticPose(basis) {
  // A readable, already-fallen silhouette for reduced-motion players. The pose
  // is constructed in bike-local space, so it remains coherent on slopes.
  const p = (forward, up) => localPoint(basis, forward, up);
  return {
    rearWheel: basis.rear,
    frontWheel: basis.front,
    bikeFrame: p(0, 4),
    seat: p(-15, 8),
    handlebar: p(27, 9),
    hip: p(8, 11),
    torso: p(28, 12),
    head: p(49, 10),
    helmet: p(52, 12),
    rearHand: p(38, 3),
    frontHand: p(51, 2),
    rearFoot: p(-7, 4),
    frontFoot: p(5, 1),
  };
}

function velocitySeed(snapshot, basis, options) {
  const sampleDt = clamp(finite(options.sampleDt, finite(snapshot?._dt, 1 / 60)), 1 / 1000, 0.1);
  const rearVelocity = {
    x: Number.isFinite(snapshot?.rear?.ox) ? (basis.rear.x - snapshot.rear.ox) / sampleDt : finite(snapshot?.vx),
    y: Number.isFinite(snapshot?.rear?.oy) ? (basis.rear.y - snapshot.rear.oy) / sampleDt : finite(snapshot?.vy),
  };
  const frontVelocity = {
    x: Number.isFinite(snapshot?.front?.ox) ? (basis.front.x - snapshot.front.ox) / sampleDt : finite(snapshot?.vx),
    y: Number.isFinite(snapshot?.front?.oy) ? (basis.front.y - snapshot.front.oy) / sampleDt : finite(snapshot?.vy),
  };
  const center = {
    x: (rearVelocity.x + frontVelocity.x) * 0.5,
    y: (rearVelocity.y + frontVelocity.y) * 0.5,
  };
  const axleX = basis.front.x - basis.rear.x;
  const axleY = basis.front.y - basis.rear.y;
  const axleLengthSq = axleX * axleX + axleY * axleY;
  const measuredOmega = axleLengthSq > 1e-8
    ? (axleX * (frontVelocity.y - rearVelocity.y) - axleY * (frontVelocity.x - rearVelocity.x)) / axleLengthSq
    : 0;
  return {
    x: finite(options.velocityX, center.x) * finite(options.velocityScale, 0.92),
    y: finite(options.velocityY, center.y) * finite(options.velocityScale, 0.92),
    omega: finite(options.angularVelocity, finite(snapshot?.aOmega, measuredOmega)),
    impulseX: finite(options.impulse?.x),
    impulseY: finite(options.impulse?.y),
    impulseSpin: finite(options.impulse?.spin),
  };
}

function createNodes(pose, basis, seed, cfg, reducedMotion) {
  return NODE_BLUEPRINTS.map(([id, radius, mass, group], index) => {
    const position = pose[id];
    let vx = 0;
    let vy = 0;
    if (!reducedMotion) {
      const rx = position.x - basis.midpoint.x;
      const ry = position.y - basis.midpoint.y;
      const omega = seed.omega + seed.impulseSpin;
      vx = seed.x + seed.impulseX - omega * ry;
      vy = seed.y + seed.impulseY + omega * rx;
      const speed = length(vx, vy);
      if (speed > cfg.maxSpeed) {
        const scale = cfg.maxSpeed / speed;
        vx *= scale;
        vy *= scale;
      }
    }
    return {
      id,
      index,
      group,
      radius,
      inverseMass: 1 / mass,
      x: position.x,
      y: position.y,
      oldX: position.x - vx * cfg.fixedDt,
      oldY: position.y - vy * cfg.fixedDt,
      spawnX: position.x,
      spawnY: position.y,
      contacts: 0,
      contactToken: 0,
    };
  });
}

function makeConstraint(nodesById, aId, bId, stiffness, kind = 'structure', breakRatio = Infinity) {
  const a = nodesById[aId];
  const b = nodesById[bId];
  return {
    a: a.index,
    b: b.index,
    aId,
    bId,
    rest: Math.max(0.001, length(b.x - a.x, b.y - a.y)),
    stiffness,
    kind,
    breakRatio,
    active: true,
  };
}

function createConstraints(nodes) {
  const byId = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const links = [
    // Bike triangle and controls.
    makeConstraint(byId, 'rearWheel', 'frontWheel', 0.98),
    makeConstraint(byId, 'rearWheel', 'bikeFrame', 0.94),
    makeConstraint(byId, 'frontWheel', 'bikeFrame', 0.94),
    makeConstraint(byId, 'bikeFrame', 'seat', 0.88),
    makeConstraint(byId, 'bikeFrame', 'handlebar', 0.82),
    makeConstraint(byId, 'frontWheel', 'handlebar', 0.74),

    // Rider skeleton. Two arm and two leg chains make the silhouette legible.
    makeConstraint(byId, 'hip', 'torso', 0.92),
    makeConstraint(byId, 'torso', 'head', 0.9),
    makeConstraint(byId, 'head', 'helmet', 0.78),
    makeConstraint(byId, 'torso', 'rearHand', 0.86),
    makeConstraint(byId, 'torso', 'frontHand', 0.86),
    makeConstraint(byId, 'hip', 'rearFoot', 0.84),
    makeConstraint(byId, 'hip', 'frontFoot', 0.84),

    // Breakable contact points let the rider peel away without random forces.
    makeConstraint(byId, 'hip', 'seat', 0.26, 'tether', 1.65),
    makeConstraint(byId, 'rearHand', 'handlebar', 0.2, 'tether', 1.8),
    makeConstraint(byId, 'frontHand', 'handlebar', 0.2, 'tether', 1.8),
    makeConstraint(byId, 'rearFoot', 'bikeFrame', 0.16, 'tether', 1.8),
    makeConstraint(byId, 'frontFoot', 'bikeFrame', 0.16, 'tether', 1.8),
  ];
  return links;
}

function capVelocity(node, dt, maxSpeed) {
  let vx = (node.x - node.oldX) / dt;
  let vy = (node.y - node.oldY) / dt;
  const speed = length(vx, vy);
  if (!Number.isFinite(speed)) {
    node.x = node.spawnX;
    node.y = node.spawnY;
    node.oldX = node.x;
    node.oldY = node.y;
    return 0;
  }
  if (speed > maxSpeed) {
    const scale = maxSpeed / speed;
    vx *= scale;
    vy *= scale;
    node.oldX = node.x - vx * dt;
    node.oldY = node.y - vy * dt;
    return maxSpeed;
  }
  return speed;
}

function keepBounded(node, origin, cfg) {
  if (![node.x, node.y, node.oldX, node.oldY].every(Number.isFinite)) {
    node.x = node.spawnX;
    node.y = node.spawnY;
    node.oldX = node.x;
    node.oldY = node.y;
    return;
  }
  const dx = node.x - origin.x;
  const dy = node.y - origin.y;
  const distance = length(dx, dy);
  if (distance > cfg.maxDistance) {
    const scale = cfg.maxDistance / distance;
    node.x = origin.x + dx * scale;
    node.y = origin.y + dy * scale;
    node.oldX = node.x;
    node.oldY = node.y;
  }
}

function solveConstraint(ragdoll, link) {
  if (!link.active) return;
  const a = ragdoll.nodes[link.a];
  const b = ragdoll.nodes[link.b];
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const distance = length(dx, dy);
  if (!Number.isFinite(distance) || distance < 1e-8) return;
  if (link.kind === 'tether' && distance > link.rest * link.breakRatio) {
    link.active = false;
    ragdoll.brokenTethers++;
    return;
  }
  const error = (distance - link.rest) / distance;
  const weight = a.inverseMass + b.inverseMass;
  if (weight <= 0) return;
  const correctionX = dx * error * link.stiffness;
  const correctionY = dy * error * link.stiffness;
  const aShare = a.inverseMass / weight;
  const bShare = b.inverseMass / weight;
  a.x += correctionX * aShare;
  a.y += correctionY * aShare;
  b.x -= correctionX * bShare;
  b.y -= correctionY * bShare;
}

function solveConstraintPass(ragdoll) {
  // Soft rider-to-bike tethers yield first; the structural skeleton always
  // gets the final word so grips cannot stretch limbs.
  for (const link of ragdoll.constraints) {
    if (link.kind === 'tether') solveConstraint(ragdoll, link);
  }
  for (const link of ragdoll.constraints) {
    if (link.kind === 'structure') solveConstraint(ragdoll, link);
  }
}

function contactProjection(hit, cfg) {
  if (!hit || !Number.isFinite(hit.pen) || hit.pen <= 0) return null;
  let nx = finite(hit.nx);
  let ny = finite(hit.ny, -1);
  const normalLength = length(nx, ny);
  if (normalLength < 1e-7) return null;
  nx /= normalLength;
  ny /= normalLength;
  return {
    nx,
    ny,
    penetration: clamp(hit.pen, 0, cfg.maxContactCorrection),
  };
}

function projectStaticNode(ragdoll, node, contact) {
  const hit = contact(node.x, node.y, node.radius, node, ragdoll);
  const projection = contactProjection(hit, ragdoll.cfg);
  if (!projection) return false;
  // A microscopic separation slop avoids returning an exact-boundary circle
  // that floating-point roundoff can still classify as penetrating.
  const correction = projection.penetration + 1e-6;
  node.x += projection.nx * correction;
  node.y += projection.ny * correction;
  return true;
}

function projectStaticPose(ragdoll, contact) {
  // Alternating contact and skeleton projections preserve a readable pose on
  // slopes. Every round ends with contact projection, so the reduced-motion
  // pose is never returned with a node left inside terrain or a platform.
  const rounds = Math.max(4, ragdoll.cfg.solverIterations * 2);
  for (let round = 0; round < rounds; round++) {
    let projected = false;
    for (const node of ragdoll.nodes) projected = projectStaticNode(ragdoll, node, contact) || projected;
    solveConstraintPass(ragdoll);
    for (const node of ragdoll.nodes) projected = projectStaticNode(ragdoll, node, contact) || projected;
    if (!projected) break;
  }
  // A capped correction can require more than one final sweep after a deep
  // spawn. These sweeps intentionally do not alter physical contact counters.
  for (let sweep = 0; sweep < 8; sweep++) {
    let projected = false;
    for (const node of ragdoll.nodes) projected = projectStaticNode(ragdoll, node, contact) || projected;
    if (!projected) break;
  }
  for (const node of ragdoll.nodes) {
    keepBounded(node, ragdoll.origin, ragdoll.cfg);
    node.oldX = node.x;
    node.oldY = node.y;
  }
}

function resolveContact(ragdoll, node, contact, contactToken) {
  if (typeof contact !== 'function') return false;
  const hit = contact(node.x, node.y, node.radius, node, ragdoll);
  const projection = contactProjection(hit, ragdoll.cfg);
  if (!projection) return false;
  const { nx, ny, penetration } = projection;
  const firstContactThisStep = node.contactToken !== contactToken;

  const dt = ragdoll.cfg.fixedDt;
  let vx = (node.x - node.oldX) / dt;
  let vy = (node.y - node.oldY) / dt;
  node.x += nx * penetration;
  node.y += ny * penetration;

  let normalSpeed = vx * nx + vy * ny;
  const tangentX = -ny;
  const tangentY = nx;
  let tangentSpeed = vx * tangentX + vy * tangentY;
  if (normalSpeed < 0) normalSpeed = -normalSpeed * ragdoll.cfg.restitution;
  if (Math.abs(normalSpeed) < ragdoll.cfg.settleSpeed * 0.32) normalSpeed = 0;
  if (firstContactThisStep) {
    const surfaceFriction = clamp(finite(hit.friction, ragdoll.cfg.friction), 0, 1);
    tangentSpeed *= 1 - surfaceFriction;
  }
  vx = nx * normalSpeed + tangentX * tangentSpeed;
  vy = ny * normalSpeed + tangentY * tangentSpeed;
  node.oldX = node.x - vx * dt;
  node.oldY = node.y - vy * dt;
  if (firstContactThisStep) {
    node.contactToken = contactToken;
    node.contacts++;
    ragdoll.contactCount++;
    return 2;
  }
  return 1;
}

function setSleeping(ragdoll, reason) {
  ragdoll.settled = true;
  ragdoll.active = false;
  ragdoll.settleReason = reason;
  for (const node of ragdoll.nodes) {
    node.oldX = node.x;
    node.oldY = node.y;
  }
}

function substep(ragdoll, contact) {
  const { cfg } = ragdoll;
  const dt = cfg.fixedDt;
  const damping = cfg.damping;
  for (const node of ragdoll.nodes) {
    const vx = (node.x - node.oldX) * damping;
    const vy = (node.y - node.oldY) * damping;
    node.oldX = node.x;
    node.oldY = node.y;
    node.x += vx;
    node.y += vy + cfg.gravity * dt * dt;
  }

  let contactsThisStep = 0;
  const contactToken = ragdoll.ticks + 1;
  for (let iteration = 0; iteration < cfg.solverIterations; iteration++) {
    solveConstraintPass(ragdoll);
    for (const node of ragdoll.nodes) {
      if (resolveContact(ragdoll, node, contact, contactToken) === 2) contactsThisStep++;
    }
  }

  let speedSquared = 0;
  let maxSpeed = 0;
  for (const node of ragdoll.nodes) {
    keepBounded(node, ragdoll.origin, cfg);
    const speed = capVelocity(node, dt, cfg.maxSpeed);
    speedSquared += speed * speed;
    maxSpeed = Math.max(maxSpeed, speed);
  }
  const rmsSpeed = Math.sqrt(speedSquared / ragdoll.nodes.length);
  ragdoll.lastRmsSpeed = rmsSpeed;
  ragdoll.peakSpeed = Math.max(ragdoll.peakSpeed, maxSpeed);
  ragdoll.elapsed += dt;
  ragdoll.ticks++;

  if (ragdoll.elapsed >= cfg.minSettleTime && contactsThisStep > 0 && rmsSpeed <= cfg.settleSpeed) {
    ragdoll.quietTicks++;
  } else {
    ragdoll.quietTicks = 0;
  }
  if (ragdoll.quietTicks >= cfg.settleFrames) setSleeping(ragdoll, 'sleep');
  else if (ragdoll.elapsed >= cfg.maxLife) setSleeping(ragdoll, 'lifetime');
}

/**
 * Creates a crash ragdoll without retaining or mutating the bike snapshot.
 *
 * @param {object} bikeSnapshot rear/front/head nodes plus optional velocity data
 * @param {object} options contact callback, config, impulse and reducedMotion
 */
export function createRagdoll(bikeSnapshot, options = {}) {
  const snapshot = bikeSnapshot || {};
  const cfg = mergeConfig(options.config);
  const basis = makeBasis(snapshot);
  const reducedMotion = options.reducedMotion === true;
  const pose = reducedMotion ? staticPose(basis) : dynamicPose(basis);
  const seed = velocitySeed(snapshot, basis, options);
  const nodes = createNodes(pose, basis, seed, cfg, reducedMotion);
  const constraints = createConstraints(nodes);
  const ragdoll = {
    cfg,
    nodes,
    constraints,
    contact: typeof options.contact === 'function' ? options.contact : null,
    origin: { x: basis.midpoint.x, y: basis.midpoint.y },
    elapsed: 0,
    accumulator: 0,
    ticks: 0,
    active: !reducedMotion,
    settled: reducedMotion,
    settleReason: reducedMotion ? 'reduced-motion' : null,
    reducedMotion,
    quietTicks: 0,
    contactCount: 0,
    brokenTethers: 0,
    lastRmsSpeed: reducedMotion ? 0 : length(seed.x + seed.impulseX, seed.y + seed.impulseY),
    peakSpeed: 0,
  };
  if (reducedMotion && ragdoll.contact) projectStaticPose(ragdoll, ragdoll.contact);
  return ragdoll;
}

/**
 * Advances a ragdoll using fixed simulation ticks. Pass a contact override to
 * swap terrain per replay; otherwise the callback supplied at creation is used.
 */
export function stepRagdoll(ragdoll, frameDt, contactOverride) {
  if (!ragdoll || ragdoll.settled || !ragdoll.active) return ragdoll;
  const contact = typeof contactOverride === 'function' ? contactOverride : ragdoll.contact;
  const frame = clamp(finite(frameDt), 0, ragdoll.cfg.maxFrameDt);
  ragdoll.accumulator = Math.min(ragdoll.accumulator + frame, ragdoll.cfg.maxFrameDt);
  let steps = 0;
  while (ragdoll.accumulator + 1e-12 >= ragdoll.cfg.fixedDt && steps < ragdoll.cfg.maxStepsPerCall) {
    substep(ragdoll, contact);
    ragdoll.accumulator -= ragdoll.cfg.fixedDt;
    if (ragdoll.accumulator < 1e-12) ragdoll.accumulator = 0;
    steps++;
    if (ragdoll.settled) break;
  }
  return ragdoll;
}

/**
 * Returns a detached, renderer-friendly snapshot. Mutating the result cannot
 * affect simulation state. A target object may be supplied to reuse its shell.
 */
export function readRagdoll(ragdoll, target = {}) {
  if (!ragdoll) return null;
  const dt = ragdoll.cfg.fixedDt;
  target.active = ragdoll.active;
  target.settled = ragdoll.settled;
  target.settleReason = ragdoll.settleReason;
  target.reducedMotion = ragdoll.reducedMotion;
  target.elapsed = ragdoll.elapsed;
  target.ticks = ragdoll.ticks;
  target.contactCount = ragdoll.contactCount;
  target.brokenTethers = ragdoll.brokenTethers;
  target.rmsSpeed = ragdoll.lastRmsSpeed;
  target.peakSpeed = ragdoll.peakSpeed;
  target.nodes = ragdoll.nodes.map((node) => ({
    id: node.id,
    group: node.group,
    x: node.x,
    y: node.y,
    radius: node.radius,
    vx: (node.x - node.oldX) / dt,
    vy: (node.y - node.oldY) / dt,
    contacts: node.contacts,
  }));
  target.links = ragdoll.constraints.filter((link) => link.active).map((link) => ({
    a: link.aId,
    b: link.bId,
    rest: link.rest,
    stiffness: link.stiffness,
    kind: link.kind,
  }));
  return target;
}

// Useful to render wheels/helmet with a shared angular convention without
// importing game code. Kept small and deterministic for replay consumers.
export function ragdollAngle(pose, aId = 'rearWheel', bId = 'frontWheel') {
  const nodes = pose?.nodes || [];
  const a = nodes.find((node) => node.id === aId);
  const b = nodes.find((node) => node.id === bId);
  if (!a || !b) return 0;
  const angle = Math.atan2(b.y - a.y, b.x - a.x) % TAU;
  return Number.isFinite(angle) ? angle : 0;
}

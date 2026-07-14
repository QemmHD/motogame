// physics.js — Moto Rush X3 bike physics. Pure ES module, no DOM.
// y is DOWN (screen space); gravity is +y.
//
// The bike is 3 point masses forming a rigid triangle: rear wheel, front wheel,
// and the rider's head. On the GROUND it runs as a Verlet/PBD soft body so the
// wheels rest on and conform to the terrain (great terrain-following). In the
// AIR it runs as a crisp rigid body (explicit centre/angle/omega) so flips feel
// tight and controllable. Velocities carry across the two modes continuously.

import { resolveCircleOnPlatform } from './kinematics.js';

export const PHYSICS_VERSION = 'physics-4';

export const CONFIG = {
  wheelBase: 80,      // axle-to-axle
  wheelR: 18,         // wheel radius (collision + visual)
  headFwd: -3,        // head x offset from wheel-midpoint, body frame
  headUp: 44,         // head height above the axle line
  headR: 11,          // crash sensor radius
  wheelMass: 1,
  headMass: 0.65,

  gravity: 1900,      // px/s^2 (arcade-floaty: generous air time for flips)
  damp: 0.9992,       // per-substep velocity damping (Verlet)

  driveAccel: 2950,   // rear-wheel forward accel while grounded + gas (px/s^2)
  maxSpeed: 1000,     // cap on rear-wheel forward speed (px/s)
  brakeAccel: 2800,   // deceleration while braking + moving
  reverseSpeed: 210,  // top speed in reverse
  maxLinearSpeed: 2400, // hard safety ceiling for collision/constraint energy
  maxFallSpeed: 2200, // terminal downward velocity; does not bleed horizontal speed
  rollResist: 0.6,    // gentle rolling resistance (fraction/sec-ish)
  restitution: 0.06,  // wheel bounce
  grip: 0.14,         // tangential slip damping on contact (0=slick,1=glue)
  airborneGraceSteps: 12, // 33 ms hysteresis: filters contact chatter, preserves real jumps

  airAccel: 13.5,     // rad/s^2 while leaning airborne
  maxAirOmega: 9.0,   // rad/s cap
  airDamp: 0.25,      // passive angular damping in air

  iters: 6,           // constraint solver iterations
  substeps: 6,

  // ---- suspension (render/feel layer, does NOT alter collision) ----------
  // Each wheel carries a sprung DOF driven by the REAL contact response
  // (penetration load + into-surface impact speed). It never moves the
  // collision node, so terrain-following & completability are untouched —
  // it only tells the renderer how far each fork/swingarm has compressed,
  // which is what sells the "suspension" feel. Front & rear are independent,
  // so acceleration/braking and one-wheel landings produce weight transfer.
  suspTravel: 15,      // px of visible wheel travel at full compression
  suspSag: 0.22,       // static ride compression on flat ground (0..1)
  suspPenGain: 0.070,  // compression per px of contact penetration
  suspImpGain: 0.0011, // extra compression per px/s of landing impact
  suspStiff: 260,      // spring constant pulling toward the load target
  suspDampComp: 13,    // damping while compressing (soft — soaks bumps)
  suspDampReb: 24,     // damping while rebounding (firm — no pogo)
  suspAirTarget: 0.05, // wheels droop (near full extension) in the air
  suspMax: 1.25,       // clamp on compression (allow slight overshoot)
};

// ---- helpers --------------------------------------------------------------
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function len(x, y) { return Math.sqrt(x * x + y * y); }
function closestOnSeg(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const denom = abx * abx + aby * aby;
  let t = denom > 1e-9 ? ((px - ax) * abx + (py - ay) * aby) / denom : 0;
  t = clamp(t, 0, 1);
  return { x: ax + abx * t, y: ay + aby * t };
}
export function normAngle(a) {
  a = a % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

// ---- terrain --------------------------------------------------------------
export function buildTerrain(chains) {
  const segments = [];
  for (const chain of chains)
    for (let i = 0; i < chain.length - 1; i++) {
      const a = chain[i], b = chain[i + 1];
      const sx = b.x - a.x, sy = b.y - a.y;
      if (sx * sx + sy * sy < 1e-8) continue;
      segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y,
        minx: Math.min(a.x, b.x), maxx: Math.max(a.x, b.x),
        surface: b.surface || a.surface || 'dirt',
        surfaceStrength: b.surfaceStrength ?? a.surfaceStrength ?? 1,
        oneWay: b.oneWay ?? a.oneWay ?? true });
    }
  let minX = Infinity, maxX = -Infinity;
  for (const s of segments) { minX = Math.min(minX, s.minx); maxX = Math.max(maxX, s.maxx); }
  if (!isFinite(minX)) { minX = 0; maxX = 1; }
  const bucketSize = 64;
  const nB = Math.max(1, Math.ceil((maxX - minX) / bucketSize) + 1);
  const buckets = Array.from({ length: nB }, () => []);
  const bi = (x) => clamp(Math.floor((x - minX) / bucketSize), 0, nB - 1);
  segments.forEach((s, i) => { for (let b = bi(s.minx); b <= bi(s.maxx); b++) buckets[b].push(i); });
  const enabled = new Uint8Array(segments.length); enabled.fill(1);
  return { segments, buckets, bi, chains, minX, maxX, enabled,
    seen: new Uint32Array(segments.length), seenToken: 0 };
}
// Deepest contact of circle (cx,cy,R) vs terrain, or null.
export function terrainContact(T, cx, cy, R) {
  let best = null;
  const lo = T.bi(cx - R), hi = T.bi(cx + R);
  let token = (T.seenToken + 1) >>> 0;
  if (token === 0) { T.seen.fill(0); token = 1; }
  T.seenToken = token;
  for (let b = lo; b <= hi; b++) for (const idx of T.buckets[b]) {
    if (T.seen[idx] === token) continue;
    T.seen[idx] = token;
    if (T.enabled && !T.enabled[idx]) continue;
    const s = T.segments[idx];
    const sx = s.bx - s.ax, sy = s.by - s.ay, sl2 = sx * sx + sy * sy;
    if (sl2 < 1e-8) continue;
    const rawT = ((cx - s.ax) * sx + (cy - s.ay) * sy) / sl2;
    const p = closestOnSeg(cx, cy, s.ax, s.ay, s.bx, s.by);
    const dx = cx - p.x, dy = cy - p.y;
    let d = len(dx, dy);
    let nx, ny, pen;
    if (s.oneWay && rawT >= 0 && rawT <= 1) {
      const sl = Math.sqrt(sl2); nx = sy / sl; ny = -sx / sl;
      const signed = dx * nx + dy * ny;
      // Standard course ground is rendered as solid below the polyline. Recover
      // shallow solver tunnelling upward, but ignore genuinely distant geometry.
      if (signed >= R || signed < -R * 4.5) continue;
      pen = R - signed;
    } else {
      if (d >= R) continue;
      if (d > 1e-6) { nx = dx / d; ny = dy / d; }
      else { const sl = Math.sqrt(sl2); nx = sy / sl; ny = -sx / sl; d = 0; }
      pen = R - d;
    }
    if (!best || pen > best.pen) best = { pen, nx, ny, segIdx: idx,
      surface: s.surface, surfaceStrength: s.surfaceStrength };
  }
  return best;
}

export function setTerrainSegmentEnabled(terrain, segIdx, enabled) {
  if (!terrain?.enabled || segIdx < 0 || segIdx >= terrain.enabled.length) return false;
  terrain.enabled[segIdx] = enabled ? 1 : 0;
  return true;
}

// ---- bike -----------------------------------------------------------------
function mkNode(x, y, mass) { return { x, y, ox: x, oy: y, im: 1 / mass }; }

export function createBike(x, y, cfg = CONFIG) {
  const hb = cfg.wheelBase / 2;
  const rear = mkNode(x - hb, y, cfg.wheelMass);
  const front = mkNode(x + hb, y, cfg.wheelMass);
  const head = mkNode(x + cfg.headFwd, y - cfg.headUp, cfg.headMass);
  const dist = (a, b) => len(a.x - b.x, a.y - b.y);
  const bike = {
    cfg, rear, front, head,
    L_rf: dist(rear, front), L_rh: dist(rear, head), L_fh: dist(front, head),
    mode: 'ground',
    // air rigid state
    mx: x, my: y, mvx: 0, mvy: 0, aAngle: 0, aOmega: 0,
    // status
    x, y, angle: 0, speed: 0, vx: 0, vy: 0, forwardSpeed: 0,
    grounded: false, rearGround: false, frontGround: false, platformGrounded: false,
    crashed: false, crashContact: null, airborne: false, airGapSteps: 0, airRot: 0,
    lastFlips: 0, flipEventId: 0, wheelSpin: 0,
    landedThisStep: false, landingImpact: 0,
    landingGrade: 'none', landingQuality: 0, landingRetention: 1,
    // suspension (per-wheel sprung DOF, render/feel only)
    rSusp: cfg.suspSag, rSuspV: 0, fSusp: cfg.suspSag, fSuspV: 0,
    rearComp: cfg.suspSag, frontComp: cfg.suspSag,
  };
  return bike;
}

function nodesArr(b) { return [b.rear, b.front, b.head]; }
function velOf(n, dt) { return { x: (n.x - n.ox) / dt, y: (n.y - n.oy) / dt }; }
function setVel(n, vx, vy, dt) { n.ox = n.x - vx * dt; n.oy = n.y - vy * dt; }
function capNodeVelocity(n, dt, maxSpeed) {
  const v = velOf(n, dt), speed = len(v.x, v.y);
  if (speed <= maxSpeed || speed < 1e-9) return;
  const k = maxSpeed / speed;
  setVel(n, v.x * k, v.y * k, dt);
}

function solveConstraints(b) {
  const links = [[b.rear, b.front, b.L_rf], [b.rear, b.head, b.L_rh], [b.front, b.head, b.L_fh]];
  for (let it = 0; it < b.cfg.iters; it++) {
    for (const [a, c, rest] of links) {
      let dx = c.x - a.x, dy = c.y - a.y;
      let d = len(dx, dy) || 1e-6;
      const diff = (d - rest) / d;
      const wsum = a.im + c.im;
      const ka = a.im / wsum, kc = c.im / wsum;
      dx *= diff; dy *= diff;
      a.x += dx * ka; a.y += dy * ka;
      c.x -= dx * kc; c.y -= dy * kc;
    }
  }
}

function resolveWheel(b, T, node, driven, input, dt) {
  const cfg = b.cfg;
  const c = terrainContact(T, node.x, node.y, cfg.wheelR);
  if (!c) { node._pen = 0; node._impact = 0; return false; }
  const v = velOf(node, dt);
  // depenetrate
  node.x += c.nx * c.pen; node.y += c.ny * c.pen;
  // velocity split
  const nx = c.nx, ny = c.ny;
  let tx = -ny, ty = nx;
  // forward tangent aligned with travel / bike facing
  const fwd = { x: b.front.x - b.rear.x, y: b.front.y - b.rear.y };
  if (tx * fwd.x + ty * fwd.y < 0) { tx = -tx; ty = -ty; }
  let vn = v.x * nx + v.y * ny;
  let vt = v.x * tx + v.y * ty;
  // record REAL contact load for the suspension spring (render/feel only)
  node._pen = c.pen; node._impact = vn < 0 ? -vn : 0; node._surface = c.surface;
  node._tx = tx; node._ty = ty;
  // cancel into-surface velocity (small bounce); PRESERVE separation so the
  // bike can launch off ramps. tangential is the rolling axis -> keep it free.
  const ice = c.surface === 'ice', boost = c.surface === 'boost', bouncy = c.surface === 'bouncy';
  const restitution = bouncy ? Math.max(0.72, cfg.restitution) : cfg.restitution;
  if (vn < 0) vn = -vn * restitution;
  vt -= vt * cfg.rollResist * (ice ? 0.08 : 1) * dt;
  if (driven) {
    const traction = ice ? 0.24 : 1;
    if (input.gas && vt < cfg.maxSpeed) vt = Math.min(vt + cfg.driveAccel * traction * dt, cfg.maxSpeed);
    if (input.brake) {
      const brake = cfg.brakeAccel * traction * dt;
      vt = vt > 30 ? Math.max(vt - brake, 0) : Math.max(vt - brake, -cfg.reverseSpeed);
    }
    if (boost && vt > -40) vt += 2500 * c.surfaceStrength * dt;
    vt = clamp(vt, -cfg.reverseSpeed, cfg.maxLinearSpeed);
    b.wheelSpin += (vt / cfg.wheelR) * dt;
  }
  setVel(node, nx * vn + tx * vt, ny * vn + ty * vt, dt);
  return true;
}

function headCrash(b, T) {
  const c = terrainContact(T, b.head.x, b.head.y, b.cfg.headR);
  if (c) {
    const distance = Math.max(0, b.cfg.headR - c.pen);
    b.crashed = true;
    b.crashContact = {
      type: 'terrain',
      id: `terrain-${c.segIdx}`,
      segmentIndex: c.segIdx,
      x: b.head.x - c.nx * distance,
      y: b.head.y - c.ny * distance,
      surface: c.surface || 'dirt',
      surfaceStrength: c.surfaceStrength ?? 1,
    };
    return true;
  }
  return false;
}

// Per-wheel suspension spring. Driven by the REAL contact response captured in
// resolveWheel (penetration + landing impact). Pure render/feel state — it does
// not move any collision node, so completability is identical to the rigid core.
function stepSusp(b, dt) {
  const cfg = b.cfg;
  const air = b.airborne;
  const step = (susp, suspV, pen, impact) => {
    const target = air
      ? cfg.suspAirTarget
      : clamp(cfg.suspSag + pen * cfg.suspPenGain + impact * cfg.suspImpGain, 0, cfg.suspMax);
    let a = (target - susp) * cfg.suspStiff;              // spring toward load
    a -= suspV * (suspV > 0 ? cfg.suspDampComp : cfg.suspDampReb); // asym. damp
    const nv = suspV + a * dt;
    return [clamp(susp + nv * dt, 0, cfg.suspMax), nv];
  };
  [b.rSusp, b.rSuspV] = step(b.rSusp, b.rSuspV, b.rear._pen || 0, b.rear._impact || 0);
  [b.fSusp, b.fSuspV] = step(b.fSusp, b.fSuspV, b.front._pen || 0, b.front._impact || 0);
}

function gradeLanding(b, impact, tangentX, tangentY, dt) {
  const axleX = b.front.x - b.rear.x, axleY = b.front.y - b.rear.y;
  const alignment = Math.abs((axleX * tangentX + axleY * tangentY)
    / ((len(axleX, axleY) || 1) * (len(tangentX, tangentY) || 1)));
  const impactScore = 1 - clamp((impact - 180) / 980, 0, 1);
  const quality = clamp(alignment * 0.72 + impactScore * 0.28, 0, 1);
  const grade = quality >= 0.91 ? 'perfect' : quality >= 0.75 ? 'clean'
    : quality >= 0.53 ? 'rough' : 'slam';
  const retention = grade === 'perfect' ? 1 : grade === 'clean' ? 1
    : grade === 'rough' ? 0.995 : 0.98;
  for (const node of nodesArr(b)) {
    const velocity = velOf(node, dt);
    setVel(node, velocity.x * retention, velocity.y, dt);
  }
  b.landingImpact = impact; b.landingQuality = quality;
  b.landingGrade = grade; b.landingRetention = retention;
}

function layoutAir(b) {
  const cfg = b.cfg, A = b.aAngle;
  const c = Math.cos(A), s = Math.sin(A);
  const hb = cfg.wheelBase / 2;
  const place = (lx, ly, n) => { n.x = b.mx + lx * c - ly * s; n.y = b.my + lx * s + ly * c; };
  place(-hb, 0, b.rear); place(hb, 0, b.front); place(cfg.headFwd, -cfg.headUp, b.head);
  // set velocities = Vm + omega x r
  for (const n of nodesArr(b)) {
    const rx = n.x - b.mx, ry = n.y - b.my;
    setVel(n, b.mvx - b.aOmega * ry, b.mvy + b.aOmega * rx, b._dt);
  }
}

function seedAir(b, dt) {
  const vR = velOf(b.rear, dt), vF = velOf(b.front, dt);
  b.mx = (b.rear.x + b.front.x) / 2; b.my = (b.rear.y + b.front.y) / 2;
  b.mvx = (vR.x + vF.x) / 2; b.mvy = (vR.y + vF.y) / 2;
  const dx = b.front.x - b.rear.x, dy = b.front.y - b.rear.y;
  b.aAngle = Math.atan2(dy, dx);
  const dl2 = dx * dx + dy * dy || 1;
  b.aOmega = (dx * (vF.y - vR.y) - dy * (vF.x - vR.x)) / dl2;
}

function substep(b, T, input, dt) {
  const cfg = b.cfg;
  if (b.crashed) return;
  b._dt = dt;

  // Is the bike touching ground with either wheel right now?
  const cRear = terrainContact(T, b.rear.x, b.rear.y, cfg.wheelR);
  const cFront = terrainContact(T, b.front.x, b.front.y, cfg.wheelR);
  const touching = !!(cRear || cFront || b.platformGrounded);

  if (touching) {
    b.airGapSteps = 0;
    if (b.mode === 'air') b.mode = 'ground'; // velocities already live in nodes
    // Verlet integrate
    for (const n of nodesArr(b)) {
      const vx = (n.x - n.ox) * cfg.damp, vy = (n.y - n.oy) * cfg.damp;
      n.ox = n.x; n.oy = n.y;
      n.x += vx; n.y += vy + cfg.gravity * dt * dt;
    }
    solveConstraints(b);
    let rg = resolveWheel(b, T, b.rear, true, input, dt);
    let fg = resolveWheel(b, T, b.front, false, input, dt);
    solveConstraints(b);
    // Constraints can re-introduce shallow penetration; finish with contacts so
    // a wheel is never left on the solid underside of ordinary course ground.
    rg = resolveWheel(b, T, b.rear, true, input, dt) || rg;
    fg = resolveWheel(b, T, b.front, false, input, dt) || fg;
    b.rearGround = rg; b.frontGround = fg; b.grounded = rg || fg;
    for (const n of nodesArr(b)) capNodeVelocity(n, dt, cfg.maxLinearSpeed);
    // grounded lean: small wheelie / nose torque via head nudge handled by air only; ground stays stable
    headCrash(b, T);
    if (b.airborne && !b.crashed) { // just landed cleanly
      b.airborne = false;
      b.landedThisStep = true;
      const rearImpact = b.rear._impact || 0, frontImpact = b.front._impact || 0;
      const landingNode = rearImpact >= frontImpact ? b.rear : b.front;
      gradeLanding(b, Math.max(rearImpact, frontImpact),
        landingNode._tx || 1, landingNode._ty || 0, dt);
      const n = Math.trunc(Math.abs(b.airRot) / (2 * Math.PI) + 0.15);
      if (n > 0) { b.lastFlips = n * Math.sign(b.airRot); b.flipEventId++; }
      b.airRot = 0;
    }
  } else {
    if (b.mode === 'ground') { seedAir(b, dt); b.mode = 'air'; }
    b.airGapSteps = (b.airGapSteps || 0) + 1;
    if (b.airGapSteps >= cfg.airborneGraceSteps) b.airborne = true;
    b.grounded = false; b.rearGround = b.frontGround = false;
    b.rear._pen = b.rear._impact = 0; b.front._pen = b.front._impact = 0;
    const lean = (input.leanFwd ? 1 : 0) - (input.leanBack ? 1 : 0);
    b.mvy += cfg.gravity * dt;
    b.mvx = clamp(b.mvx, -cfg.maxLinearSpeed, cfg.maxLinearSpeed);
    b.mvy = clamp(b.mvy, -cfg.maxLinearSpeed, cfg.maxFallSpeed);
    b.mx += b.mvx * dt; b.my += b.mvy * dt;
    b.aOmega += lean * cfg.airAccel * dt;
    b.aOmega *= (1 - cfg.airDamp * dt);
    b.aOmega = clamp(b.aOmega, -cfg.maxAirOmega, cfg.maxAirOmega);
    b.aAngle += b.aOmega * dt;
    b.airRot += b.aOmega * dt;
    if (input.gas) b.wheelSpin += 13 * dt;
    layoutAir(b);
    headCrash(b, T);
  }
  stepSusp(b, dt);
}

// Advance one frame (sub-stepped).
function publishBikeState(bike, frameDt) {
  bike.x = (bike.rear.x + bike.front.x) / 2;
  bike.y = (bike.rear.y + bike.front.y) / 2;
  bike.angle = Math.atan2(bike.front.y - bike.rear.y, bike.front.x - bike.rear.x);
  const sampleDt = frameDt / bike.cfg.substeps;
  const vr = velOf(bike.rear, sampleDt), vf = velOf(bike.front, sampleDt);
  bike.vx = (vr.x + vf.x) * 0.5; bike.vy = (vr.y + vf.y) * 0.5;
  bike.speed = len(bike.vx, bike.vy);
  bike.forwardSpeed = bike.vx * Math.cos(bike.angle) + bike.vy * Math.sin(bike.angle);
  bike.rearComp = bike.rSusp; bike.frontComp = bike.fSusp;
}

export function stepBike(bike, terrain, input, frameDt) {
  bike.crashContact = null;
  bike.landedThisStep = false; bike.landingImpact = 0;
  bike.framePrevious = {
    rear: { x: bike.rear.x, y: bike.rear.y },
    front: { x: bike.front.x, y: bike.front.y },
    head: { x: bike.head.x, y: bike.head.y },
  };
  const dt = frameDt / bike.cfg.substeps;
  for (let i = 0; i < bike.cfg.substeps; i++) substep(bike, terrain, input, dt);
  publishBikeState(bike, frameDt);
  return bike.crashContact;
}

// Resolve the three bike bodies against deterministic one-way moving decks.
// The platform solver works at frame cadence while node velocity is converted
// back into the bike's substep Verlet representation before the next tick.
export function resolveBikePlatforms(bike, kinematicRun, frameDt, input = null) {
  if (!bike || bike.crashed || !kinematicRun?.platforms?.length) return [];
  const contacts = [], subDt = frameDt / bike.cfg.substeps;
  const controls = input || {};
  const wasAirborne = bike.airborne;
  let rearHit = false, frontHit = false, landingImpact = 0;
  const applyDeckDrive = (node, contact) => {
    const cfg = bike.cfg;
    const velocity = velOf(node, subDt);
    const surfaceVx = contact.inheritedVelocity?.x || 0;
    const facing = bike.front.x >= bike.rear.x ? 1 : -1;
    const traction = contact.pose.surface === 'ice' ? 0.24 : 1;
    let relativeForward = (velocity.x - surfaceVx) * facing;
    if (controls.gas && relativeForward < cfg.maxSpeed) {
      relativeForward = Math.min(
        relativeForward + cfg.driveAccel * traction * frameDt,
        cfg.maxSpeed,
      );
    }
    if (controls.brake) {
      const brake = cfg.brakeAccel * traction * frameDt;
      relativeForward = relativeForward > 30
        ? Math.max(relativeForward - brake, 0)
        : Math.max(relativeForward - brake, -cfg.reverseSpeed);
    }
    relativeForward = clamp(relativeForward, -cfg.reverseSpeed, cfg.maxLinearSpeed);
    setVel(node, surfaceVx + relativeForward * facing, velocity.y, subDt);
    capNodeVelocity(node, subDt, cfg.maxLinearSpeed);
    bike.wheelSpin += relativeForward / cfg.wheelR * frameDt;
  };
  const resolveNode = (node, previous, radius, platform, kind) => {
    const circle = { x: node.x, y: node.y, prevX: previous.x, prevY: previous.y, r: radius };
    const incomingVy = (node.y - previous.y) / frameDt - (platform.current?.vy || 0);
    const contact = resolveCircleOnPlatform(circle, platform, {
      tickRate: 1 / frameDt, tangentRetention: kind === 'head' ? 0.35 : 0.88,
      maxCarrySpeed: bike.cfg.maxSpeed * 1.25, maxLaunchSpeed: 760,
    });
    if (!contact) return null;
    node.x = circle.x; node.y = circle.y;
    setVel(node, (circle.x - circle.prevX) / frameDt, (circle.y - circle.prevY) / frameDt, subDt);
    if (kind === 'rear') applyDeckDrive(node, contact);
    node._surface = contact.pose.surface; node._platform = contact.platformId;
    landingImpact = Math.max(landingImpact, Math.max(0, incomingVy));
    contacts.push({ ...contact, node: kind });
    return contact;
  };

  for (const platform of kinematicRun.platforms) {
    const localRear = !!resolveNode(bike.rear, bike.framePrevious.rear, bike.cfg.wheelR, platform, 'rear');
    const localFront = !!resolveNode(bike.front, bike.framePrevious.front, bike.cfg.wheelR, platform, 'front');
    rearHit = localRear || rearHit; frontHit = localFront || frontHit;
    const headContact = resolveNode(
      bike.head,
      bike.framePrevious.head,
      bike.cfg.headR,
      platform,
      'head',
    );
    if (headContact) {
      bike.crashed = true;
      bike.crashContact = {
        type: 'platform',
        id: String(headContact.platformId || platform.id || 'platform'),
        platformId: String(headContact.platformId || platform.id || 'platform'),
        x: bike.head.x,
        y: bike.head.y,
        surface: headContact.pose?.surface || headContact.surface || 'steel',
      };
    }
  }
  bike.platformGrounded = rearHit || frontHit;
  if (rearHit || frontHit) {
    bike.airGapSteps = 0;
    solveConstraints(bike);
    bike.mode = 'ground'; bike.rearGround = bike.rearGround || rearHit;
    bike.frontGround = bike.frontGround || frontHit; bike.grounded = true;
    if (wasAirborne && !bike.crashed) {
      bike.airborne = false; bike.landedThisStep = true;
      gradeLanding(bike, landingImpact, 1, 0, subDt);
      const flips = Math.trunc(Math.abs(bike.airRot) / (2 * Math.PI) + 0.15);
      if (flips > 0) { bike.lastFlips = flips * Math.sign(bike.airRot); bike.flipEventId++; }
      bike.airRot = 0;
    }
  }
  publishBikeState(bike, frameDt);
  return contacts;
}

function validImpulseNode(node) {
  return node && typeof node === 'object'
    && Number.isFinite(node.x) && Number.isFinite(node.y)
    && Number.isFinite(node.ox) && Number.isFinite(node.oy);
}

// Adds an instantaneous velocity change to the bike. This is the shared,
// mode-safe hook used by launch pads, explosions, geysers, and moving props.
export function applyImpulse(bike, ix, iy, angularImpulse = 0) {
  if (!bike || typeof bike !== 'object' || Array.isArray(bike)) {
    throw new TypeError('impulse bike must be an object');
  }
  if (!Number.isFinite(ix)) throw new RangeError('ix must be finite');
  if (!Number.isFinite(iy)) throw new RangeError('iy must be finite');
  if (!Number.isFinite(angularImpulse)) throw new RangeError('angularImpulse must be finite');
  if (bike.crashed) return false;
  const cfg = bike.cfg;
  if (!cfg || typeof cfg !== 'object' || !Number.isFinite(cfg.substeps) || cfg.substeps <= 0
      || !Number.isFinite(cfg.maxLinearSpeed) || cfg.maxLinearSpeed <= 0
      || !Number.isFinite(cfg.maxFallSpeed) || cfg.maxFallSpeed <= 0
      || !Number.isFinite(cfg.maxAirOmega) || cfg.maxAirOmega <= 0) {
    throw new TypeError('impulse bike configuration is invalid');
  }
  const dt = bike._dt === undefined ? (1 / 60 / bike.cfg.substeps) : bike._dt;
  if (!Number.isFinite(dt) || dt <= 0) throw new RangeError('impulse sample dt must be positive and finite');
  if (!validImpulseNode(bike.rear)) throw new TypeError('impulse bike rear node is invalid');
  if (!validImpulseNode(bike.front)) throw new TypeError('impulse bike front node is invalid');
  if (!validImpulseNode(bike.head)) throw new TypeError('impulse bike head node is invalid');
  if (bike.mode !== 'ground' && bike.mode !== 'air') {
    throw new TypeError('impulse bike mode must be ground or air');
  }
  if (bike.mode === 'air'
      && !(Number.isFinite(bike.mx) && Number.isFinite(bike.my)
        && Number.isFinite(bike.mvx) && Number.isFinite(bike.mvy)
        && Number.isFinite(bike.aAngle) && Number.isFinite(bike.aOmega))) {
    throw new TypeError('impulse bike air state is invalid');
  }
  if (bike.mode === 'air') {
    bike.mvx += ix; bike.mvy += iy;
    bike.mvx = clamp(bike.mvx, -bike.cfg.maxLinearSpeed, bike.cfg.maxLinearSpeed);
    bike.mvy = clamp(bike.mvy, -bike.cfg.maxLinearSpeed, bike.cfg.maxFallSpeed);
    bike.aOmega = clamp(bike.aOmega + angularImpulse, -bike.cfg.maxAirOmega, bike.cfg.maxAirOmega);
    layoutAir(bike);
  } else {
    for (const n of nodesArr(bike)) {
      const v = velOf(n, dt);
      setVel(n, v.x + ix, v.y + iy, dt);
      capNodeVelocity(n, dt, bike.cfg.maxLinearSpeed);
    }
  }
  return true;
}

export function bikePoints(b) {
  return {
    rear: { x: b.rear.x, y: b.rear.y },
    front: { x: b.front.x, y: b.front.y },
    head: { x: b.head.x, y: b.head.y },
    rearComp: b.rearComp, frontComp: b.frontComp,
    travel: b.cfg.suspTravel,
  };
}

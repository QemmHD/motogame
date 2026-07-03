// physics.js — Moto Rush X3 bike physics. Pure ES module, no DOM.
// y is DOWN (screen space); gravity is +y.
//
// The bike is 3 point masses forming a rigid triangle: rear wheel, front wheel,
// and the rider's head. On the GROUND it runs as a Verlet/PBD soft body so the
// wheels rest on and conform to the terrain (great terrain-following). In the
// AIR it runs as a crisp rigid body (explicit centre/angle/omega) so flips feel
// tight and controllable. Velocities carry across the two modes continuously.

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
  rollResist: 0.6,    // gentle rolling resistance (fraction/sec-ish)
  restitution: 0.06,  // wheel bounce
  grip: 0.14,         // tangential slip damping on contact (0=slick,1=glue)

  airAccel: 13.5,     // rad/s^2 while leaning airborne
  maxAirOmega: 9.0,   // rad/s cap
  airDamp: 0.25,      // passive angular damping in air

  iters: 6,           // constraint solver iterations
  substeps: 6,
};

// ---- helpers --------------------------------------------------------------
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
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
      segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y,
        minx: Math.min(a.x, b.x), maxx: Math.max(a.x, b.x) });
    }
  let minX = Infinity, maxX = -Infinity;
  for (const s of segments) { minX = Math.min(minX, s.minx); maxX = Math.max(maxX, s.maxx); }
  if (!isFinite(minX)) { minX = 0; maxX = 1; }
  const bucketSize = 64;
  const nB = Math.max(1, Math.ceil((maxX - minX) / bucketSize) + 1);
  const buckets = Array.from({ length: nB }, () => []);
  const bi = (x) => clamp(Math.floor((x - minX) / bucketSize), 0, nB - 1);
  segments.forEach((s, i) => { for (let b = bi(s.minx); b <= bi(s.maxx); b++) buckets[b].push(i); });
  return { segments, buckets, bi, chains, minX, maxX };
}
// Deepest contact of circle (cx,cy,R) vs terrain, or null.
function contact(T, cx, cy, R) {
  let best = null;
  const lo = T.bi(cx - R), hi = T.bi(cx + R);
  const seen = new Set();
  for (let b = lo; b <= hi; b++) for (const idx of T.buckets[b]) {
    if (seen.has(idx)) continue; seen.add(idx);
    const s = T.segments[idx];
    const p = closestOnSeg(cx, cy, s.ax, s.ay, s.bx, s.by);
    const dx = cx - p.x, dy = cy - p.y;
    let d = Math.hypot(dx, dy);
    if (d >= R) continue;
    let nx, ny;
    if (d > 1e-6) { nx = dx / d; ny = dy / d; }
    else { const sx = s.bx - s.ax, sy = s.by - s.ay, sl = Math.hypot(sx, sy) || 1; nx = sy / sl; ny = -sx / sl; d = 0; }
    const pen = R - d;
    if (!best || pen > best.pen) best = { pen, nx, ny };
  }
  return best;
}

// ---- bike -----------------------------------------------------------------
function mkNode(x, y, mass) { return { x, y, ox: x, oy: y, im: 1 / mass }; }

export function createBike(x, y, cfg = CONFIG) {
  const hb = cfg.wheelBase / 2;
  const rear = mkNode(x - hb, y, cfg.wheelMass);
  const front = mkNode(x + hb, y, cfg.wheelMass);
  const head = mkNode(x + cfg.headFwd, y - cfg.headUp, cfg.headMass);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const bike = {
    cfg, rear, front, head,
    L_rf: dist(rear, front), L_rh: dist(rear, head), L_fh: dist(front, head),
    mode: 'ground',
    // air rigid state
    mx: x, my: y, mvx: 0, mvy: 0, aAngle: 0, aOmega: 0,
    // status
    x, y, angle: 0, speed: 0,
    grounded: false, rearGround: false, frontGround: false,
    crashed: false, airborne: false, airRot: 0,
    lastFlips: 0, flipEventId: 0, wheelSpin: 0,
  };
  return bike;
}

function nodesArr(b) { return [b.rear, b.front, b.head]; }
function velOf(n, dt) { return { x: (n.x - n.ox) / dt, y: (n.y - n.oy) / dt }; }
function setVel(n, vx, vy, dt) { n.ox = n.x - vx * dt; n.oy = n.y - vy * dt; }

function solveConstraints(b) {
  const links = [[b.rear, b.front, b.L_rf], [b.rear, b.head, b.L_rh], [b.front, b.head, b.L_fh]];
  for (let it = 0; it < b.cfg.iters; it++) {
    for (const [a, c, rest] of links) {
      let dx = c.x - a.x, dy = c.y - a.y;
      let d = Math.hypot(dx, dy) || 1e-6;
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
  const c = contact(T, node.x, node.y, cfg.wheelR);
  if (!c) return false;
  // depenetrate
  node.x += c.nx * c.pen; node.y += c.ny * c.pen;
  // velocity split
  let v = velOf(node, dt);
  const nx = c.nx, ny = c.ny;
  let tx = -ny, ty = nx;
  // forward tangent aligned with travel / bike facing
  const fwd = { x: b.front.x - b.rear.x, y: b.front.y - b.rear.y };
  if (tx * fwd.x + ty * fwd.y < 0) { tx = -tx; ty = -ty; }
  let vn = v.x * nx + v.y * ny;
  let vt = v.x * tx + v.y * ty;
  // cancel into-surface velocity (small bounce); PRESERVE separation so the
  // bike can launch off ramps. tangential is the rolling axis -> keep it free.
  if (vn < 0) vn = -vn * cfg.restitution;
  vt -= vt * cfg.rollResist * dt;
  if (driven) {
    if (input.gas && vt < cfg.maxSpeed) vt = Math.min(vt + cfg.driveAccel * dt, cfg.maxSpeed);
    if (input.brake) vt = vt > 30 ? Math.max(vt - cfg.brakeAccel * dt, 0) : Math.max(vt - cfg.brakeAccel * dt, -cfg.reverseSpeed);
    b.wheelSpin += (vt / cfg.wheelR) * dt;
  }
  setVel(node, nx * vn + tx * vt, ny * vn + ty * vt, dt);
  return true;
}

function headCrash(b, T) {
  const c = contact(T, b.head.x, b.head.y, b.cfg.headR);
  if (c) { b.crashed = true; return true; }
  return false;
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
  const cRear = contact(T, b.rear.x, b.rear.y, cfg.wheelR);
  const cFront = contact(T, b.front.x, b.front.y, cfg.wheelR);
  const touching = !!(cRear || cFront);

  if (touching) {
    if (b.mode === 'air') b.mode = 'ground'; // velocities already live in nodes
    // Verlet integrate
    for (const n of nodesArr(b)) {
      const vx = (n.x - n.ox) * cfg.damp, vy = (n.y - n.oy) * cfg.damp;
      n.ox = n.x; n.oy = n.y;
      n.x += vx; n.y += vy + cfg.gravity * dt * dt;
    }
    solveConstraints(b);
    const rg = resolveWheel(b, T, b.rear, true, input, dt);
    const fg = resolveWheel(b, T, b.front, false, input, dt);
    solveConstraints(b);
    b.rearGround = rg; b.frontGround = fg; b.grounded = rg || fg;
    // grounded lean: small wheelie / nose torque via head nudge handled by air only; ground stays stable
    headCrash(b, T);
    if (b.airborne) { // just landed
      b.airborne = false;
      const n = Math.trunc(Math.abs(b.airRot) / (2 * Math.PI) + 0.15);
      if (n > 0) { b.lastFlips = n * Math.sign(b.airRot); b.flipEventId++; }
      b.airRot = 0;
    }
  } else {
    if (b.mode === 'ground') { seedAir(b, dt); b.mode = 'air'; }
    b.airborne = true; b.grounded = false; b.rearGround = b.frontGround = false;
    const lean = (input.leanFwd ? 1 : 0) - (input.leanBack ? 1 : 0);
    b.mvy += cfg.gravity * dt;
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
}

// Advance one frame (sub-stepped).
export function stepBike(bike, terrain, input, frameDt) {
  const dt = frameDt / bike.cfg.substeps;
  for (let i = 0; i < bike.cfg.substeps; i++) substep(bike, terrain, input, dt);
  // publish render/status fields
  bike.x = (bike.rear.x + bike.front.x) / 2;
  bike.y = (bike.rear.y + bike.front.y) / 2;
  bike.angle = Math.atan2(bike.front.y - bike.rear.y, bike.front.x - bike.rear.x);
  const v = velOf(bike.rear, frameDt / bike.cfg.substeps);
  bike.speed = Math.hypot(v.x, v.y);
}

export function bikePoints(b) {
  return { rear: { x: b.rear.x, y: b.rear.y }, front: { x: b.front.x, y: b.front.y }, head: { x: b.head.x, y: b.head.y } };
}

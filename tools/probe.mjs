import { createBike, stepBike, buildTerrain, normAngle, CONFIG } from '../public/physics.js';

function probe(rw, rh, grav, maxSpeed) {
  const pts = [{ x: -300, y: 400 }];
  for (let x = -300; x <= 1400; x += 10) pts.push({ x, y: 400 });
  const x0 = 1400, n = Math.round(rw / 10);
  for (let i = 1; i <= n; i++) { const t = i / n; pts.push({ x: x0 + t * rw, y: 400 - rh * t * t }); }
  const lipX = x0 + rw;
  for (let x = lipX + 10; x <= lipX + 1400; x += 10) pts.push({ x, y: 400 });
  const T = buildTerrain([pts]);
  const cfg = { ...CONFIG };
  if (grav) cfg.gravity = grav;
  if (maxSpeed) cfg.maxSpeed = maxSpeed;
  const b = createBike(-260, 360, cfg);
  let launched = false, peak = 1e9, landX = 0, maxspd = 0, launchSpd = 0;
  for (let i = 0; i < 4000; i++) {
    const inp = { gas: true };
    if (!b.grounded) { const a = normAngle(b.angle); if (a > 0.15) inp.leanBack = true; else if (a < -0.15) inp.leanFwd = true; }
    stepBike(b, T, inp, 1 / 60);
    maxspd = Math.max(maxspd, b.speed);
    if (!launched && b.x > lipX && !b.grounded) { launched = true; launchSpd = Math.round(b.speed); }
    if (launched) { peak = Math.min(peak, b.y); if (b.grounded && b.x > lipX + 30) { landX = b.x; break; } }
    if (b.crashed) { landX = -1; break; }
  }
  return { rw, rh, g: cfg.gravity, mx: cfg.maxSpeed, topSpeed: Math.round(maxspd), launchSpd,
    range: landX > 0 ? Math.round(landX - lipX) : landX, peakUp: Math.round(400 - peak) };
}

console.log('--- current cfg ---');
for (const [rw,rh] of [[180,60],[200,70],[220,80],[240,70],[200,55]]) console.log(probe(rw,rh));
console.log('--- gravity 1850, maxSpeed 1050 ---');
for (const [rw, rh] of [[160, 60], [180, 70], [200, 90], [200, 70]]) console.log(probe(rw, rh, 1850, 1050));
console.log('--- gravity 1700, maxSpeed 1100 ---');
for (const [rw, rh] of [[180, 70], [200, 80]]) console.log(probe(rw, rh, 1700, 1100));

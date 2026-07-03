import { createBike, stepBike, buildTerrain, normAngle, CONFIG } from '../public/physics.js';

// runway (with optional downhill) into a loop of radius r; does the bike get
// around and continue past it?
function probe(r, runway, downhill) {
  const pts = [{ x: -300, y: 400 }];
  let x = -300, y = 400;
  for (; x <= runway; x += 10) pts.push({ x, y: 400 });
  // downhill dip to build speed then back up to loop base
  const baseX = x;
  const cx = baseX + r, cy = 400 - r;
  for (let i = 0; i <= 72; i++) { const a = (i / 72) * 2 * Math.PI; }
  const loop = [];
  for (let i = 0; i <= 72; i++) { const a = (i / 72) * 2 * Math.PI; loop.push({ x: cx + r * Math.sin(a), y: cy + r * Math.cos(a) }); }
  for (let xx = baseX; xx <= baseX + 2 * r + 600; xx += 10) pts.push({ x: xx, y: 400 });
  const T = buildTerrain([pts, loop]);
  const b = createBike(-260, 360, CONFIG);
  let maxX = -260, topSpd = 0, passed = false, minAngSeen = 0, wentUp = false;
  const exitX = baseX + 2 * r + 60;
  for (let i = 0; i < 6000; i++) {
    const inp = { gas: true };
    stepBike(b, T, inp, 1 / 60);
    topSpd = Math.max(topSpd, b.speed);
    maxX = Math.max(maxX, b.x);
    if (b.y < 400 - r) wentUp = true;              // climbed above loop mid
    if (b.x > exitX && b.grounded) { passed = true; break; }
    if (b.crashed) break;
  }
  return { r, runway, passed, wentUp, maxX: Math.round(maxX), topSpd: Math.round(topSpd), crashed: b.crashed };
}

console.log('need v_bottom ~= sqrt(5*g*r):');
for (const r of [60, 70, 80, 90]) console.log('  r', r, '->', Math.round(Math.sqrt(5 * CONFIG.gravity * r)), 'px/s');
console.log('probes (runway from rest):');
for (const r of [60, 70, 80, 90]) console.log(probe(r, 500));

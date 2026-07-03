// Headless numeric check of the physics + levels (no DOM).
import { buildLevels } from '../public/levels.js';
import { createBike, stepBike, buildTerrain, normAngle, bikePoints } from '../public/physics.js';

const DT = 1 / 60;
const levels = buildLevels();

function run(levelIndex, ai) {
  const L = levels[levelIndex];
  const terrain = buildTerrain(L.course.chains);
  const cps = [{ x: L.course.startX, y: L.course.startY }, ...L.course.checkpoints];
  let cpi = 0;
  let bike = createBike(L.course.startX, L.course.startY - 40);
  let t = 0, crashes = 0, maxX = bike.x, finished = false, flips = 0;
  let steps = 0;
  const finishX = L.course.finishX;
  for (; t < 120; t += DT, steps++) {
    const input = ai(bike);
    stepBike(bike, terrain, input, DT);
    if (!isFinite(bike.x) || !isFinite(bike.y) || !isFinite(bike.angle)) {
      return { level: L.name, error: 'NaN', t, steps };
    }
    maxX = Math.max(maxX, bike.x);
    if (bike.flipEventId > flips) { flips = bike.flipEventId; }
    // advance checkpoint
    while (cpi + 1 < cps.length && bike.x > cps[cpi + 1].x) cpi++;
    if (bike.crashed) {
      crashes++;
      const cp = cps[cpi];
      bike = createBike(cp.x, cp.y - 40);
    }
    if (bike.x > finishX) { finished = true; break; }
    if (crashes > 60) break;
  }
  return { level: L.name, finished, t: +t.toFixed(1), crashes, maxX: Math.round(maxX),
           finishX, speed: Math.round(bike.speed), lastAngle: +normAngle(bike.angle).toFixed(2), flips };
}

// AI 1: gas only
const gasOnly = () => ({ gas: true, brake: false, leanFwd: false, leanBack: false });

// AI 2: gas + keep upright in the air (counter the current tilt), tap flips off
function smartAI(bike) {
  const inp = { gas: true, brake: false, leanFwd: false, leanBack: false };
  if (!bike.grounded) {
    const a = normAngle(bike.angle);
    // if nose-down too far, lean back; if nose-up too far, lean forward
    if (a > 0.25) inp.leanBack = true;
    else if (a < -0.25) inp.leanFwd = true;
  }
  return inp;
}

console.log('--- gas only ---');
for (let i = 0; i < levels.length; i++) console.log(run(i, gasOnly));
console.log('--- smart (auto level in air) ---');
for (let i = 0; i < levels.length; i++) console.log(run(i, smartAI));

// stability probe: sit on flat ground doing nothing, ensure it settles upright
(() => {
  const terrain = buildTerrain(levels[0].course.chains);
  const b = createBike(400, 200); // drop from height
  const idle = () => ({ gas: false, brake: false, leanFwd: false, leanBack: false });
  for (let i = 0; i < 60 * 4; i++) stepBike(b, terrain, idle(), DT);
  console.log('--- idle settle ---', { y: Math.round(b.y), angle: +normAngle(b.angle).toFixed(3),
    grounded: b.grounded, speed: +b.speed.toFixed(1), crashed: b.crashed });
})();

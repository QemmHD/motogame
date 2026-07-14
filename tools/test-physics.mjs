// Asserted headless release gate for terrain, course rules, hazards, and stability.
import assert from 'node:assert/strict';
import { buildLevels } from '../public/levels.js';
import { CONFIG, createBike, stepBike, buildTerrain, normAngle } from '../public/physics.js';
import { createRunState, stepRunRules } from '../public/rules.js';

const DT = 1 / 60;
const MAX_SECONDS = 90;
const levels = buildLevels();

const gasOnly = () => ({ gas: true, brake: false, leanFwd: false, leanBack: false });
function smartAI(bike) {
  const input = gasOnly();
  if (!bike.grounded) {
    const angle = normAngle(bike.angle);
    if (angle > 0.25) input.leanBack = true;
    else if (angle < -0.25) input.leanFwd = true;
  }
  return input;
}

function run(levelIndex, ai, includeRules) {
  const level = levels[levelIndex], terrain = buildTerrain(level.course.chains);
  const runState = createRunState(level);
  let bike = createBike(level.course.startX, level.course.startY - 40);
  let crashes = 0, maxX = bike.x, maxSpeed = 0, finished = false, ticks = 0;
  const fallY = level.course.bounds().maxY + 900;

  for (; ticks < MAX_SECONDS / DT; ticks++) {
    stepBike(bike, terrain, ai(bike), DT);
    assert.ok(Number.isFinite(bike.x) && Number.isFinite(bike.y) && Number.isFinite(bike.angle),
      `${level.name}: non-finite bike state at tick ${ticks}`);
    maxX = Math.max(maxX, bike.x); maxSpeed = Math.max(maxSpeed, bike.speed);

    let rules = null;
    if (includeRules) {
      rules = stepRunRules(level, runState, bike);
      if (rules.crash) bike.crashed = true;
    } else {
      while (runState.cpIndex + 1 < runState.cpList.length
        && bike.x > runState.cpList[runState.cpIndex + 1].x) runState.cpIndex++;
    }

    const fellOut = bike.y > fallY;
    if ((rules?.finished || bike.x > level.course.finishX) && !bike.crashed && !fellOut) {
      finished = true; break;
    }
    if (bike.crashed || fellOut) {
      crashes++;
      const checkpoint = runState.cpList[runState.cpIndex];
      bike = createBike(checkpoint.x, checkpoint.y - 40);
      if (crashes > 60) break;
    }
  }

  return { level: level.name, finished, seconds: +(ticks * DT).toFixed(2), crashes,
    maxX: Math.round(maxX), finishX: level.course.finishX, maxSpeed: Math.round(maxSpeed) };
}

assert.ok(levels.length >= 12, `expected the expanded 12-level campaign, got ${levels.length}`);
const report = [];
for (let i = 0; i < levels.length; i++) {
  const terrainRun = run(i, gasOnly, false);
  assert.equal(terrainRun.finished, true, `${terrainRun.level}: terrain-only full-throttle route is not completable`);
  assert.ok(terrainRun.maxSpeed <= CONFIG.maxLinearSpeed * 1.1,
    `${terrainRun.level}: unsafe speed ${terrainRun.maxSpeed}`);

  const rulesRun = run(i, smartAI, true);
  assert.equal(rulesRun.finished, true, `${rulesRun.level}: rules/hazards route is not completable`);
  assert.ok(rulesRun.crashes <= 40, `${rulesRun.level}: excessive crash loop (${rulesRun.crashes})`);
  report.push({ level: i + 1, name: rulesRun.level, time: rulesRun.seconds,
    crashes: rulesRun.crashes, maxSpeed: rulesRun.maxSpeed });
}

{
  const terrain = buildTerrain(levels[0].course.chains);
  const bike = createBike(400, 200);
  const idle = () => ({ gas: false, brake: false, leanFwd: false, leanBack: false });
  for (let i = 0; i < 60 * 4; i++) stepBike(bike, terrain, idle(), DT);
  assert.equal(bike.grounded, true, 'idle drop did not settle on the ground');
  assert.equal(bike.crashed, false, 'idle drop crashed');
  assert.ok(Math.abs(normAngle(bike.angle)) < 0.08, `idle bike did not settle upright: ${bike.angle}`);
  assert.ok(bike.speed < 30, `idle bike retained unsafe energy: ${bike.speed}`);
}

console.table(report);
console.log(`Physics/rules gate passed for ${levels.length} levels.`);

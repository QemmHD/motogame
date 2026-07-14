// rules.js — deterministic, DOM-free course rules shared by the game and tests.
// Hazard motion is derived from the fixed simulation tick, never wall-clock time.

import { applyImpulse } from './physics.js';

const TAU = Math.PI * 2;
const TICK_RATE = 60;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function len(x, y) { return Math.sqrt(x * x + y * y); }

function runtimeHazard(h, index) {
  const x = h.baseX ?? h.x, y = h.baseY ?? h.y;
  return { ...h, id: h.id || `hazard-${index}`, baseX: x, baseY: y,
    x, y, prevX: x, prevY: y, spin: 0, nearMissed: false,
    triggered: false, fuseTicks: -1, exploded: false };
}

export function createRunState(level) {
  const course = level.course;
  return {
    tick: 0,
    cpIndex: 0,
    cpList: [{ x: course.startX, y: course.startY }, ...course.checkpoints],
    hazards: course.hazards.map(runtimeHazard),
  };
}

function motionPosition(h, tick) {
  const m = h.motion;
  if (!m) return { x: h.baseX, y: h.baseY };
  const period = Math.max(0.25, m.period || 2.5);
  const phase = TAU * (tick / TICK_RATE / period + (m.phase || 0));
  if (m.kind === 'pendulum') {
    const angle = (m.amplitude || 0.8) * Math.sin(phase);
    return { x: h.anchorX + Math.sin(angle) * m.length,
      y: h.anchorY + Math.cos(angle) * m.length };
  }
  if (m.kind === 'piston') {
    const stroke = (1 - Math.cos(phase)) * 0.5 * (m.amplitude || 0);
    return { x: h.baseX + (m.axis === 'x' ? stroke : 0),
      y: h.baseY + (m.axis === 'x' ? 0 : stroke) };
  }
  const offset = Math.sin(phase) * (m.amplitude || 0);
  return { x: h.baseX + (m.axis === 'x' ? offset : 0),
    y: h.baseY + (m.axis === 'x' ? 0 : offset) };
}

function sweptDistance2(px0, py0, px1, py1, hx0, hy0, hx1, hy1) {
  const sx = px0 - hx0, sy = py0 - hy0;
  const vx = (px1 - px0) - (hx1 - hx0), vy = (py1 - py0) - (hy1 - hy0);
  const vv = vx * vx + vy * vy;
  const t = vv > 1e-9 ? clamp(-(sx * vx + sy * vy) / vv, 0, 1) : 0;
  const dx = sx + vx * t, dy = sy + vy * t;
  return dx * dx + dy * dy;
}

function bikeSweeps(bike) {
  return [bike.rear, bike.front, bike.head].map(n => ({ x0: n.ox, y0: n.oy, x1: n.x, y1: n.y })).concat({
    x0: (bike.rear.ox + bike.front.ox) * 0.5,
    y0: (bike.rear.oy + bike.front.oy) * 0.5,
    x1: bike.x, y1: bike.y,
  });
}

function minHazardDistance2(h, sweeps) {
  let best = Infinity;
  for (const p of sweeps) {
    const d2 = sweptDistance2(p.x0, p.y0, p.x1, p.y1,
      h.prevX, h.prevY, h.x, h.y);
    if (d2 < best) best = d2;
  }
  return best;
}

function detonateTnt(h, bike, events) {
  h.exploded = true;
  events.explosions.push({ x: h.x, y: h.y, id: h.id });
  const dx = bike.x - h.x, dy = bike.y - h.y;
  const distance = len(dx, dy);
  const core = h.core ?? 44, radius = 225;
  if (distance <= core) {
    events.crash = { type: 'tnt', id: h.id, x: h.x, y: h.y };
    return;
  }
  if (distance >= radius) return;
  const safeDistance = Math.max(1, distance);
  const power = (h.boost ?? 760) * (1 - distance / radius);
  const ix = dx / safeDistance * power;
  const iy = dy / safeDistance * power - power * 0.58;
  applyImpulse(bike, ix, iy, clamp(dx / radius, -1, 1) * 1.8);
  events.impulses.push({ type: 'tnt', x: h.x, y: h.y, power });
}

export function stepRunRules(level, run, bike) {
  run.tick++;
  const events = { crash: null, nearMisses: [], explosions: [], impulses: [],
    checkpoint: null, finished: false };

  for (const h of run.hazards) {
    h.prevX = h.x; h.prevY = h.y;
    const pos = motionPosition(h, run.tick); h.x = pos.x; h.y = pos.y;
    h.spin += (h.type === 'saw' ? 9 : h.type === 'mace' ? 3.5 : 0) / TICK_RATE;
    if (h.triggered && !h.exploded && --h.fuseTicks <= 0) detonateTnt(h, bike, events);
  }

  const sweeps = bikeSweeps(bike);
  for (const h of run.hazards) {
    if (events.crash) break;
    if (h.type === 'tnt') {
      if (h.exploded) continue;
      const triggerR = h.r + 54;
      if (!h.triggered && minHazardDistance2(h, sweeps) < triggerR * triggerR) {
        h.triggered = true;
        h.fuseTicks = Math.max(1, Math.round((h.fuse ?? 0.14) * TICK_RATE));
      }
      continue;
    }
    const d2 = minHazardDistance2(h, sweeps);
    const crashR = h.r + 10, nearR = h.r + 50;
    if (d2 < crashR * crashR) {
      events.crash = { type: h.type, id: h.id, x: h.x, y: h.y };
      break;
    }
    if (!h.nearMissed && d2 < nearR * nearR && bike.speed > 260 && !bike.grounded) {
      h.nearMissed = true;
      events.nearMisses.push({ type: h.type, id: h.id, x: h.x, y: h.y });
    }
  }

  while (run.cpIndex + 1 < run.cpList.length && bike.x > run.cpList[run.cpIndex + 1].x) {
    run.cpIndex++;
    events.checkpoint = { index: run.cpIndex, ...run.cpList[run.cpIndex] };
  }
  events.finished = bike.x > level.course.finishX;
  return events;
}

export function hazardPositionAt(hazard, tick) {
  return motionPosition(runtimeHazard(hazard, 0), tick);
}

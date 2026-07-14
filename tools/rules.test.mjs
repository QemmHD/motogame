import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTerrain, createBike, setTerrainSegmentEnabled, terrainContact } from '../public/physics.js';
import { createRunState, hazardPositionAt, stepRunRules } from '../public/rules.js';

test('moving hazard positions are deterministic and level data stays immutable', () => {
  const hazard = { type: 'saw', x: 100, y: 80, baseX: 100, baseY: 80, r: 36,
    motion: { kind: 'sine', axis: 'y', amplitude: 60, period: 2.4, phase: 0.25 } };
  assert.deepEqual(hazardPositionAt(hazard, 137), hazardPositionAt(hazard, 137));
  assert.notDeepEqual(hazardPositionAt(hazard, 137), hazardPositionAt(hazard, 170));

  const level = { course: { startX: 0, startY: 0, checkpoints: [], finishX: 1000, hazards: [hazard] } };
  const original = JSON.stringify(level.course.hazards);
  const a = createRunState(level), b = createRunState(level);
  const bikeA = createBike(-400, 0), bikeB = createBike(-400, 0);
  assert.deepEqual(stepRunRules(level, a, bikeA), stepRunRules(level, b, bikeB));
  assert.equal(JSON.stringify(level.course.hazards), original);
});

test('ordinary terrain recovers shallow underside penetration with an upward normal', () => {
  const terrain = buildTerrain([[{ x: 0, y: 100 }, { x: 200, y: 100 }]]);
  const contact = terrainContact(terrain, 100, 115, 18);
  assert.ok(contact, 'expected recovery contact');
  assert.equal(contact.nx, 0);
  assert.equal(contact.ny, -1);
  assert.ok(contact.pen > 30);
  assert.equal(setTerrainSegmentEnabled(terrain, contact.segIdx, false), true);
  assert.equal(terrainContact(terrain, 100, 95, 18), null);
});

test('surface metadata reaches the collision API', () => {
  const terrain = buildTerrain([[
    { x: 0, y: 100, surface: 'dirt' },
    { x: 100, y: 100, surface: 'boost', surfaceStrength: 0.8 },
    { x: 200, y: 100, surface: 'ice' },
  ]]);
  assert.equal(terrainContact(terrain, 50, 90, 18).surface, 'boost');
  assert.equal(terrainContact(terrain, 150, 90, 18).surface, 'ice');
});

test('TNT has a fuse and applies a non-lethal launch impulse outside its core', () => {
  const level = { course: { startX: 0, startY: 0, checkpoints: [], finishX: 1000,
    hazards: [{ type: 'tnt', x: 120, y: 0, r: 30, fuse: 0.05, boost: 760, core: 44 }] } };
  const run = createRunState(level), bike = createBike(0, 0);
  let blast = null;
  for (let i = 0; i < 10; i++) {
    const events = stepRunRules(level, run, bike);
    if (events.explosions.length) { blast = events; break; }
  }
  assert.ok(blast, 'TNT never detonated');
  assert.equal(blast.crash, null);
  assert.equal(blast.impulses.length, 1);
  assert.notEqual(bike.rear.ox, bike.rear.x, 'bike received no launch velocity');
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parsePrecacheManifest, verifyPublicAssets } from './verify-public-assets.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('the complete public runtime is valid and available offline', () => {
  const report = verifyPublicAssets(REPO_ROOT);
  assert.match(report.buildVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(report.cacheName, `moto-rush-x3-v${report.buildVersion}`);
  assert.ok(report.runtimeFileCount > 20, 'expected the game modules and art/audio asset set');
  assert.ok(report.sourceReferenceCount > 10, 'expected local source references to be inspected');
});

test('critical gameplay modules and bike art are explicit offline dependencies', () => {
  const serviceWorker = readFileSync(resolve(REPO_ROOT, 'public', 'sw.js'), 'utf8');
  const precache = new Set(parsePrecacheManifest(serviceWorker));
  for (const required of ['./logic.js', './rules.js', './replay.js', './kinematics.js',
    './ragdoll.js', './run-session.js', './debug-proxies.js', './assets/bike_body.png']) {
    assert.ok(precache.has(required), `${required} must remain in PRECACHE`);
  }
});

test('the precache manifest parser rejects computed paths', () => {
  const source = "const PRECACHE = Object.freeze(['./index.html', dynamicPath]);";
  assert.throws(() => parsePrecacheManifest(source), /only literal paths/);
});

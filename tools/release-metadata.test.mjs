import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path, { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { buildLevels, COURSE_VERSION } from '../public/levels.js';
import { PHYSICS_VERSION } from '../public/physics.js';
import {
  REPLAY_SCHEMA_VERSION,
  checkReplayCompatibility,
  decodeReplay,
} from '../public/replay.js';
import { parsePrecacheManifest } from './verify-public-assets.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_ROOT = resolve(REPO_ROOT, 'public');

// This is an intentional compatibility contract, not a value inferred from the
// files under test. Updating it requires a conscious release decision.
const RELEASE = Object.freeze({
  build: '1.8.1',
  saveKey: 'motoRushX3.save.v1',
  replaySchema: 1,
  physics: 'physics-4',
  course: 'course-4',
  levelCount: 16,
});

function read(relativePath) {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function runtimeBuild() {
  const sandbox = { globalThis: {} };
  vm.runInNewContext(read('public/version.js'), sandbox, {
    filename: 'public/version.js',
  });
  return sandbox.globalThis.MOTO_RUSH_BUILD;
}

function localModuleSpecifiers(source) {
  const specifiers = new Set();
  const staticImport = /\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"](\.[^'"]+)['"]/g;
  const dynamicImport = /\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  for (const pattern of [staticImport, dynamicImport]) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  }
  return specifiers;
}

function canonicalPublicPath(absolutePath) {
  const relative = path.relative(PUBLIC_ROOT, absolutePath).replaceAll(path.sep, '/');
  assert.ok(relative && relative !== '..' && !relative.startsWith('../'),
    `runtime import escapes public/: ${absolutePath}`);
  return `./${relative}`;
}

function runtimeModuleGraph() {
  const html = read('public/index.html');
  const entrypoints = [...html.matchAll(
    /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["'](\.[^"']+)["'][^>]*>/gi,
  )].map(match => match[1]);
  assert.deepEqual(entrypoints, ['./game.js'],
    'index.html must keep one explicit ./game.js module entrypoint');

  const pending = entrypoints.map(specifier => resolve(PUBLIC_ROOT, specifier));
  const visited = new Set();
  while (pending.length) {
    const filename = pending.pop();
    const canonical = canonicalPublicPath(filename);
    if (visited.has(canonical)) continue;
    visited.add(canonical);
    for (const specifier of localModuleSpecifiers(readFileSync(filename, 'utf8'))) {
      const imported = resolve(dirname(filename), specifier);
      const importedPath = canonicalPublicPath(imported);
      assert.match(importedPath, /\.js$/,
        `runtime module import must name a JavaScript file: ${canonical} -> ${specifier}`);
      pending.push(imported);
    }
  }
  return visited;
}

test('v1.8.1 is the single release version in runtime and npm metadata', () => {
  const build = runtimeBuild();
  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');

  assert.equal(build?.version, RELEASE.build,
    'public/version.js must expose v1.8.1 (and thereby invalidate the offline cache)');
  assert.equal(build?.label, `v${RELEASE.build}`,
    'public/version.js release label must follow its version');
  assert.equal(build?.cacheName, `moto-rush-x3-v${RELEASE.build}`,
    'public/version.js cache name must follow its version');
  assert.equal(pkg.version, RELEASE.build, 'package.json must be bumped to 1.8.1');
  assert.equal(lock.version, RELEASE.build,
    'package-lock.json top-level version must be bumped to 1.8.1');
  assert.equal(lock.packages?.['']?.version, RELEASE.build,
    'package-lock.json packages[""] version must be bumped to 1.8.1');
});

test('v1.8.1 keeps the explicit save and simulation compatibility contract', () => {
  const gameSource = read('public/game.js');
  const saveKeys = [...gameSource.matchAll(/const\s+SAVE_KEY\s*=\s*['"]([^'"]+)['"]/g)]
    .map(match => match[1]);

  assert.deepEqual(saveKeys, [RELEASE.saveKey],
    'patch release must preserve the v1 progression/settings save namespace');
  assert.equal(REPLAY_SCHEMA_VERSION, RELEASE.replaySchema,
    'patch release must preserve replay schema 1');
  assert.equal(PHYSICS_VERSION, RELEASE.physics,
    'presentation-only patch must preserve physics-4 replay identity');
  assert.equal(COURSE_VERSION, RELEASE.course,
    'presentation-only patch must preserve course-4 replay identity');
  assert.match(gameSource,
    /const\s+BUILD_VERSION\s*=\s*globalThis\.MOTO_RUSH_BUILD\?\.version\s*\|\|\s*['"]1\.8\.1-dev['"]\s*;/,
    'game.js development fallback must identify the 1.8.1 release line');
  assert.match(gameSource,
    /decodeReplay\(replayToken,\s*\{\s*expected:\s*replayMetadata\(index\)\s*\}\)/,
    'saved replay playback must continue checking complete release metadata');

  const currentProof = Object.freeze({
    schema: RELEASE.replaySchema,
    levelId: 'level-1',
    buildVersion: RELEASE.build,
    physicsVersion: RELEASE.physics,
    generatorVersion: RELEASE.course,
  });
  assert.deepEqual(checkReplayCompatibility(currentProof, currentProof), {
    compatible: true,
    mismatches: [],
  }, 'a proof stamped with the complete v1.8.1 identity must be compatible');

  const previousPatch = { ...currentProof, buildVersion: '1.8.0' };
  assert.deepEqual(checkReplayCompatibility(previousPatch, currentProof), {
    compatible: false,
    code: 'INCOMPATIBLE_VERSION',
    mismatches: [{ field: 'buildVersion', expected: '1.8.1', actual: '1.8.0' }],
  }, 'Gold/saved replay proofs remain build-locked even though progression saves remain compatible');
});

test('the Gold manifest and every proof carry the exact v1.8.1 identity', () => {
  const manifest = readJson('public/golden-tapes.json');
  const levels = buildLevels();

  assert.equal(manifest.schema, 1, 'Gold manifest schema must remain 1');
  assert.equal(manifest.build, RELEASE.build,
    'regenerate public/golden-tapes.json after bumping the runtime to 1.8.1');
  assert.equal(manifest.replaySchema, RELEASE.replaySchema,
    'Gold manifest replay schema must match the exported replay schema');
  assert.equal(manifest.physics, RELEASE.physics,
    'Gold manifest must preserve the physics-4 identity');
  assert.equal(manifest.course, RELEASE.course,
    'Gold manifest must preserve the course-4 identity');
  assert.equal(levels.length, RELEASE.levelCount,
    'v1.8.1 is expected to retain the 16-course campaign');
  assert.equal(manifest.levelCount, levels.length,
    'Gold manifest levelCount must equal buildLevels().length');
  assert.equal(manifest.levels?.length, levels.length,
    'Gold manifest entries must cover every built level');

  for (let index = 0; index < manifest.levels.length; index++) {
    const entry = manifest.levels[index];
    const expected = {
      schema: RELEASE.replaySchema,
      levelId: `level-${index + 1}`,
      buildVersion: RELEASE.build,
      physicsVersion: RELEASE.physics,
      generatorVersion: RELEASE.course,
    };
    const decoded = decodeReplay(entry.token, { expected });
    assert.equal(decoded.ok, true,
      `${entry.id} Gold token must be regenerated with the exact v1.8.1 identity: ${JSON.stringify(decoded)}`);
  }
});

test('the literal service-worker precache covers the complete runtime import graph', () => {
  const serviceWorker = read('public/sw.js');
  const precache = new Set(parsePrecacheManifest(serviceWorker));
  const modules = runtimeModuleGraph();

  assert.ok(modules.has('./finish-flow.js'),
    'finish-flow.js must remain part of the reachable game module graph');
  assert.ok(modules.has('./ui-input.js'),
    'ui-input.js must remain part of the reachable game module graph');
  for (const modulePath of modules) {
    assert.ok(precache.has(modulePath),
      `${modulePath} is imported by the runtime and must appear literally in sw.js PRECACHE`);
  }
  for (const classicRuntime of ['./version.js']) {
    assert.ok(precache.has(classicRuntime),
      `${classicRuntime} is loaded by index.html and must appear literally in sw.js PRECACHE`);
  }
});

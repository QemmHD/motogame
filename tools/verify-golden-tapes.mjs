#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { decodeReplay, encodeReplay } from '../public/replay.js';
import {
  formatFailure,
  launchInstalledBrowser,
  openCleanGamePage,
  roundTime,
  startStaticServer,
} from './golden-browser.mjs';

const DEFAULT_MANIFEST = path.join('public', 'golden-tapes.json');
const DEFAULT_MAX_TICKS = 20_000;

function usage() {
  return `Verify every golden replay twice in clean browser contexts.

Usage:
  node tools/verify-golden-tapes.mjs [manifest]
  node tools/verify-golden-tapes.mjs --manifest <file> [--max-ticks <1-20000>]

Defaults:
  manifest     ${DEFAULT_MANIFEST}
  max ticks    ${DEFAULT_MAX_TICKS}

Browser selection:
  Set MOTORUSH_BROWSER to a local Chrome/Chromium executable when auto-detection
  is not sufficient. Verification is loopback-only and never rewrites the manifest.`;
}

function parseArguments(argv) {
  let manifest = null;
  let maxTicks = DEFAULT_MAX_TICKS;
  let help = false;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') { help = true; continue; }
    if (argument === '--manifest' || argument === '-m') {
      if (!argv[index + 1]) throw new Error(`${argument} requires a file path`);
      manifest = argv[++index];
      continue;
    }
    if (argument === '--max-ticks') {
      const value = Number(argv[++index]);
      if (!Number.isInteger(value) || value < 1 || value > 20_000) {
        throw new Error('--max-ticks must be an integer from 1 to 20000');
      }
      maxTicks = value;
      continue;
    }
    if (argument.startsWith('-')) throw new Error(`unknown option: ${argument}`);
    if (manifest !== null) throw new Error(`unexpected positional argument: ${argument}`);
    manifest = argument;
  }
  return { help, maxTicks, manifestPath: path.resolve(manifest || DEFAULT_MANIFEST) };
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function requireEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}

function requireClose(actual, expected, label) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > 0.000001) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

function validateManifest(manifest) {
  requireCondition(manifest && typeof manifest === 'object' && !Array.isArray(manifest), 'manifest must be an object');
  requireEqual(manifest.schema, 1, 'manifest schema');
  requireCondition(Number.isInteger(manifest.replaySchema) && manifest.replaySchema > 0,
    'manifest.replaySchema must be a positive integer');
  for (const key of ['build', 'physics', 'course']) {
    requireCondition(typeof manifest[key] === 'string' && manifest[key], `manifest.${key} must be a non-empty string`);
  }
  requireCondition(Array.isArray(manifest.levels) && manifest.levels.length > 0,
    'manifest.levels must be a non-empty array');
  requireEqual(manifest.levelCount, manifest.levels.length, 'manifest levelCount');

  const ids = new Set();
  for (let position = 0; position < manifest.levels.length; position++) {
    const level = manifest.levels[position];
    requireCondition(level && typeof level === 'object' && !Array.isArray(level), `level ${position} must be an object`);
    requireEqual(level.index, position, `level ${position} index`);
    requireEqual(level.id, `level-${position + 1}`, `level ${position} id`);
    requireCondition(!ids.has(level.id), `duplicate level id: ${level.id}`);
    ids.add(level.id);
    for (const key of ['name', 'world', 'token', 'stateHash']) {
      requireCondition(typeof level[key] === 'string' && level[key], `${level.id}.${key} must be a non-empty string`);
    }
    requireEqual(level.route, 'recovery', `${level.id} route`);
    for (const key of ['finishTick', 'replayTick', 'tapeTicks', 'runTick', 'score', 'crashes']) {
      requireCondition(Number.isInteger(level[key]) && level[key] >= 0,
        `${level.id}.${key} must be a non-negative integer`);
    }
    for (const key of ['elapsedTime', 'finishTime']) {
      requireCondition(Number.isFinite(level[key]) && level[key] >= 0,
        `${level.id}.${key} must be a non-negative finite number`);
    }

    const decoded = decodeReplay(level.token);
    requireCondition(decoded.ok, `${level.id} token failed to decode: ${decoded.code} ${decoded.message || ''}`);
    const replay = decoded.replay;
    requireEqual(replay.schema, manifest.replaySchema, `${level.id} token schema`);
    requireEqual(replay.levelId, level.id, `${level.id} token level`);
    requireEqual(replay.buildVersion, manifest.build, `${level.id} token build`);
    requireEqual(replay.physicsVersion, manifest.physics, `${level.id} token physics`);
    requireEqual(replay.generatorVersion, manifest.course, `${level.id} token course`);
    requireEqual(replay.finishTick, level.finishTick, `${level.id} token finishTick`);
    requireEqual(replay.tickCount, level.tapeTicks, `${level.id} token tapeTicks`);
    requireEqual(level.replayTick, level.finishTick, `${level.id} replayTick`);
    requireEqual(level.tapeTicks, level.finishTick, `${level.id} tapeTicks`);
    requireEqual(replay.stateHash, level.stateHash, `${level.id} token stateHash`);
  }
  return manifest;
}

async function readCatalog(browser, baseUrl) {
  const { context, page } = await openCleanGamePage(browser, baseUrl);
  try {
    return await page.evaluate(() => ({
      build: globalThis.MOTO_RUSH_BUILD?.version || null,
      levels: window.__moto.levels.map((level, index) => ({
        index,
        id: `level-${index + 1}`,
        name: level.name,
        world: level.world || 'Campaign',
      })),
    }));
  } finally {
    await context.close();
  }
}

async function verifyMismatchNotice(browser, baseUrl, level) {
  const decoded = decodeReplay(level.token);
  requireCondition(decoded.ok, `${level.id} mismatch fixture token did not decode`);
  const incompatibleToken = encodeReplay({ ...decoded.replay, buildVersion: '0.0.0-stale' });
  const { context, page, pageErrors } = await openCleanGamePage(browser, baseUrl);
  try {
    const result = await page.evaluate(({ levelIndex, token }) => {
      const api = window.__moto;
      const started = api.startLevel(levelIndex, { replayToken: token, replaySource: 'saved' });
      return { started, state: api.G.state, notice: api.G.replayNotice };
    }, { levelIndex: level.index, token: incompatibleToken });
    requireEqual(result.started, false, 'incompatible proof start result');
    requireEqual(result.state, 'menu', 'incompatible proof retained menu state');
    requireEqual(result.notice?.message, 'SAVED PROOF EXPIRED', 'incompatible proof notice');
    requireCondition(typeof result.notice?.detail === 'string' && result.notice.detail,
      'incompatible proof notice must include decoder detail');
    if (pageErrors.length) throw new Error(`mismatch notice page error: ${pageErrors.join(' | ')}`);
  } finally {
    await context.close();
  }
}

async function verifyAttempt(browser, baseUrl, level, attempt, maxTicks) {
  const { context, page, pageErrors } = await openCleanGamePage(browser, baseUrl);
  try {
    const result = await page.evaluate(({ levelIndex, token, tickLimit }) => {
      const api = window.__moto;
      const started = api.startLevel(levelIndex, { replayToken: token });
      const run = started ? api.runToEnd(tickLimit) : null;
      const game = api.G;
      return {
        started,
        stepped: run?.stepped ?? 0,
        state: game.state,
        replayMode: game.replayMode,
        replayVerified: game.replayVerified,
        replayFailed: game.replayFailed,
        replayNotice: game.replayNotice,
        replayTick: game.replayTick,
        runTick: game.run?.tick ?? null,
        elapsedTime: game.elapsed,
        finishTime: game.finishTime,
        score: game.finishScore,
        crashes: game.devCrashCount,
        name: game.level?.name || null,
        world: game.level?.world || 'Campaign',
      };
    }, { levelIndex: level.index, token: level.token, tickLimit: maxTicks });

    const prefix = `${level.id} attempt ${attempt}`;
    requireCondition(result.started, `${prefix} was rejected: ${JSON.stringify(result.replayNotice)}`);
    requireEqual(result.state, 'finished', `${prefix} state after ${maxTicks} ticks`);
    requireEqual(result.replayMode, true, `${prefix} replay mode`);
    requireEqual(result.replayVerified, true, `${prefix} proof verdict`);
    requireEqual(result.replayFailed, null, `${prefix} replay failure`);
    requireEqual(result.name, level.name, `${prefix} level name`);
    requireEqual(result.world, level.world, `${prefix} world`);
    requireEqual(result.replayTick, level.replayTick, `${prefix} replayTick`);
    requireEqual(result.runTick, level.runTick, `${prefix} runTick`);
    requireEqual(result.score, level.score, `${prefix} score`);
    requireEqual(result.crashes, level.crashes, `${prefix} recovery count`);
    requireClose(result.elapsedTime, level.elapsedTime, `${prefix} elapsedTime`);
    requireClose(result.finishTime, level.finishTime, `${prefix} finishTime`);
    if (pageErrors.length) throw new Error(`${prefix} page error: ${pageErrors.join(' | ')}`);

    return {
      state: result.state,
      replayVerified: result.replayVerified,
      replayTick: result.replayTick,
      runTick: result.runTick,
      elapsedTime: roundTime(result.elapsedTime),
      finishTime: roundTime(result.finishTime),
      score: result.score,
      crashes: result.crashes,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { console.log(usage()); return; }

  const parsed = JSON.parse(await readFile(options.manifestPath, 'utf8'));
  const manifest = validateManifest(parsed);
  for (const level of manifest.levels) {
    if (level.replayTick > options.maxTicks) {
      throw new Error(`${level.id} needs ${level.replayTick} ticks, above --max-ticks ${options.maxTicks}`);
    }
  }

  let server;
  let browser;
  try {
    server = await startStaticServer(path.resolve('public'));
    const launched = await launchInstalledBrowser();
    browser = launched.browser;
    console.log(`Golden verifier: ${launched.source} (${launched.executablePath})`);

    const catalog = await readCatalog(browser, server.baseUrl);
    requireEqual(catalog.build, manifest.build, 'runtime build');
    requireEqual(catalog.levels.length, manifest.levelCount, 'runtime level count');
    await verifyMismatchNotice(browser, server.baseUrl, manifest.levels[0]);
    console.log('  incompatible saved proof rejected with a visible notice');
    for (const level of manifest.levels) {
      const runtimeLevel = catalog.levels[level.index];
      requireCondition(runtimeLevel, `${level.id} is missing from the runtime catalog`);
      requireEqual(runtimeLevel.id, level.id, `${level.id} runtime id`);
      requireEqual(runtimeLevel.name, level.name, `${level.id} runtime name`);
      requireEqual(runtimeLevel.world, level.world, `${level.id} runtime world`);

      const first = await verifyAttempt(browser, server.baseUrl, level, 1, options.maxTicks);
      const second = await verifyAttempt(browser, server.baseUrl, level, 2, options.maxTicks);
      requireEqual(JSON.stringify(second), JSON.stringify(first), `${level.id} repeated result`);
      console.log(`  ${level.id.padEnd(8)} verified twice: ${level.finishTick} ticks, `
        + `${level.finishTime.toFixed(2)}s, ${level.score} pts`);
    }
    console.log(`Verified ${manifest.levelCount} golden tapes twice with no divergence.`);
  } finally {
    await browser?.close().catch(() => {});
    await server?.close().catch(() => {});
  }
}

main().catch(error => {
  console.error(`Golden verification failed:\n${formatFailure(error)}`);
  process.exitCode = 1;
});

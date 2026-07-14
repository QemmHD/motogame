#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { decodeReplay } from '../public/replay.js';
import {
  formatFailure,
  launchInstalledBrowser,
  openCleanGamePage,
  roundTime,
  startStaticServer,
} from './golden-browser.mjs';

const DEFAULT_OUTPUT = path.join('public', 'golden-tapes.json');
const DEFAULT_MAX_TICKS = 20_000;

function usage() {
  return `Generate deterministic recovery-route replay tapes for every built level.

Usage:
  node tools/generate-golden-tapes.mjs [output]
  node tools/generate-golden-tapes.mjs --output <file> [--max-ticks <1-20000>]

Defaults:
  output       ${DEFAULT_OUTPUT}
  max ticks    ${DEFAULT_MAX_TICKS}

Browser selection:
  Set MOTORUSH_BROWSER to a local Chrome/Chromium executable when auto-detection
  is not sufficient. The script never downloads a browser or accesses the web.`;
}

function parseArguments(argv) {
  let output = null;
  let maxTicks = DEFAULT_MAX_TICKS;
  let help = false;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') { help = true; continue; }
    if (argument === '--output' || argument === '-o') {
      if (!argv[index + 1]) throw new Error(`${argument} requires a file path`);
      output = argv[++index];
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
    if (output !== null) throw new Error(`unexpected positional argument: ${argument}`);
    output = argument;
  }
  return { help, maxTicks, outputPath: path.resolve(output || DEFAULT_OUTPUT) };
}

function requireEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { console.log(usage()); return; }

  const publicDir = path.resolve('public');
  let server;
  let browser;
  try {
    server = await startStaticServer(publicDir);
    const launched = await launchInstalledBrowser();
    browser = launched.browser;
    console.log(`Golden generator: ${launched.source} (${launched.executablePath})`);

    const opened = await openCleanGamePage(browser, server.baseUrl);
    const { context, page, pageErrors } = opened;
    try {
      const catalog = await page.evaluate(() => ({
        buildVersion: globalThis.MOTO_RUSH_BUILD?.version || null,
        levels: window.__moto.levels.map((level, index) => ({
          index,
          id: `level-${index + 1}`,
          name: level.name,
          world: level.world || 'Campaign',
        })),
      }));
      if (!catalog.buildVersion) throw new Error('game did not expose MOTO_RUSH_BUILD.version');
      if (!catalog.levels.length) throw new Error('game did not expose any built levels');

      const levels = [];
      let physicsVersion = null;
      let courseVersion = null;
      let replaySchema = null;

      for (const level of catalog.levels) {
        const result = await page.evaluate(({ levelIndex, maxTicks }) => {
          const api = window.__moto;
          const started = api.startLevel(levelIndex);
          const run = started ? api.runToEnd(maxTicks) : null;
          const game = api.G;
          return {
            started,
            stepped: run?.stepped ?? 0,
            state: game.state,
            replayRecorded: game.replayRecorded,
            replayTick: game.replayTick,
            runTick: game.run?.tick ?? null,
            elapsedTime: game.elapsed,
            finishTime: game.finishTime,
            score: game.finishScore,
            crashes: game.devCrashCount,
            token: game.replayToken || run?.token || null,
            replayUnavailable: game.replayUnavailable,
          };
        }, { levelIndex: level.index, maxTicks: options.maxTicks });

        if (!result.started) throw new Error(`${level.id} (${level.name}) did not start`);
        if (result.state !== 'finished') {
          throw new Error(`${level.id} (${level.name}) did not finish within ${options.maxTicks} ticks; `
            + `state=${result.state}, replayTick=${result.replayTick}, runTick=${result.runTick}`);
        }
        if (!result.replayRecorded || typeof result.token !== 'string' || !result.token) {
          throw new Error(`${level.id} (${level.name}) finished without a replay token: `
            + (result.replayUnavailable || 'recorder did not finalize'));
        }

        const decoded = decodeReplay(result.token);
        if (!decoded.ok) throw new Error(`${level.id} generated an invalid token: ${decoded.code} ${decoded.message || ''}`);
        const replay = decoded.replay;
        requireEqual(replay.levelId, level.id, `${level.id} token level`);
        requireEqual(replay.buildVersion, catalog.buildVersion, `${level.id} token build`);
        requireEqual(replay.finishTick, result.replayTick, `${level.id} finish tick`);
        requireEqual(replay.tickCount, result.replayTick, `${level.id} tape tick count`);
        if (!Number.isInteger(result.runTick) || result.runTick < 0) {
          throw new Error(`${level.id} exposed an invalid run tick: ${result.runTick}`);
        }

        replaySchema ??= replay.schema;
        physicsVersion ??= replay.physicsVersion;
        courseVersion ??= replay.generatorVersion;
        requireEqual(replay.schema, replaySchema, `${level.id} replay schema`);
        requireEqual(replay.physicsVersion, physicsVersion, `${level.id} physics version`);
        requireEqual(replay.generatorVersion, courseVersion, `${level.id} course version`);

        levels.push({
          index: level.index,
          id: level.id,
          name: level.name,
          world: level.world,
          route: 'recovery',
          token: result.token,
          finishTick: replay.finishTick,
          replayTick: result.replayTick,
          tapeTicks: replay.tickCount,
          runTick: result.runTick,
          elapsedTime: roundTime(result.elapsedTime),
          finishTime: roundTime(result.finishTime),
          score: result.score,
          crashes: result.crashes,
          stateHash: replay.stateHash,
        });
        console.log(`  ${level.id.padEnd(8)} ${level.name}: ${replay.finishTick} ticks, `
          + `${roundTime(result.finishTime).toFixed(2)}s, ${result.score} pts, ${result.crashes} recoveries`);
      }

      if (pageErrors.length) throw new Error(`game page error: ${pageErrors.join(' | ')}`);
      const manifest = {
        schema: 1,
        replaySchema,
        build: catalog.buildVersion,
        physics: physicsVersion,
        course: courseVersion,
        levelCount: levels.length,
        levels,
      };
      await mkdir(path.dirname(options.outputPath), { recursive: true });
      await writeFile(options.outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      console.log(`Wrote ${levels.length} deterministic tapes to ${options.outputPath}`);
    } finally {
      await context.close();
    }
  } finally {
    await browser?.close().catch(() => {});
    await server?.close().catch(() => {});
  }
}

main().catch(error => {
  console.error(`Golden generation failed:\n${formatFailure(error)}`);
  process.exitCode = 1;
});

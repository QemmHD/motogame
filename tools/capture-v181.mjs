import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { launchInstalledBrowser, startStaticServer } from './golden-browser.mjs';

const RELEASE_OUTPUT = path.resolve('docs/screenshots/v1.8.1');
const MAX_DIFFERING_PIXELS = 8;
const MAX_CHANNEL_DELTA = 8;

const SCENES = Object.freeze([
  Object.freeze({
    key: 'hero',
    filename: 'update-v181-finish-forge-hero.png',
    viewport: Object.freeze({ width: 1280, height: 720 }),
    deviceScaleFactor: 1,
    touch: false,
    reducedMotion: false,
    focusAction: 'next',
    finish: Object.freeze({
      levelIndex: 0,
      elapsed: 18.75,
      flipBonus: 1.5,
      trickScore: 900,
      flowScore: 420,
      riskScore: 180,
      stars: 3,
      previousBestTime: 18.09,
      previousBestScore: 1380,
      presentationTime: 2,
    }),
  }),
  Object.freeze({
    key: 'focused',
    filename: 'update-v181-focused-action.png',
    viewport: Object.freeze({ width: 1280, height: 720 }),
    deviceScaleFactor: 1,
    touch: false,
    reducedMotion: false,
    focusAction: 'golden',
    finish: Object.freeze({
      levelIndex: 7,
      elapsed: 69.4,
      flipBonus: 4.5,
      trickScore: 1600,
      flowScore: 780,
      riskScore: 320,
      stars: 2,
      previousBestTime: 64.3,
      previousBestScore: 2900,
      presentationTime: 1.35,
    }),
  }),
  Object.freeze({
    key: 'mobile',
    filename: 'update-v181-mobile-finish.png',
    viewport: Object.freeze({ width: 390, height: 844 }),
    deviceScaleFactor: 2,
    touch: true,
    reducedMotion: false,
    focusAction: 'retry',
    finish: Object.freeze({
      levelIndex: 14,
      elapsed: 8.42,
      flipBonus: 0.5,
      trickScore: 720,
      flowScore: 360,
      riskScore: 240,
      stars: 3,
      previousBestTime: null,
      previousBestScore: null,
      presentationTime: 2,
    }),
  }),
  Object.freeze({
    key: 'reduced',
    filename: 'update-v181-reduced-motion.png',
    viewport: Object.freeze({ width: 1280, height: 720 }),
    deviceScaleFactor: 1,
    touch: false,
    reducedMotion: true,
    focusAction: 'menu',
    finish: Object.freeze({
      levelIndex: 15,
      elapsed: 7.8,
      flipBonus: 1,
      trickScore: 480,
      flowScore: 240,
      riskScore: 0,
      stars: 3,
      previousBestTime: 7.25,
      previousBestScore: 900,
      replayAvailable: false,
      presentationTime: 0.05,
    }),
  }),
]);

function usage() {
  return [
    'Usage: node tools/capture-v181.mjs [--check] [--write | --output <directory>]',
    '',
    '  (default)       Run the complete gate in a disposable temporary directory.',
    '  --check         Explicit spelling of the default non-publishing mode.',
    '  --write         Publish the four certified PNGs to docs/screenshots/v1.8.1.',
    '  --output <dir>  Retain certified PNGs in another directory for review.',
  ].join('\n');
}

function parseArguments(argv) {
  let write = false;
  let check = false;
  let output = null;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      console.log(usage());
      return null;
    }
    if (argument === '--write') { write = true; continue; }
    if (argument === '--check') { check = true; continue; }
    if (argument === '--output') {
      output = argv[++index];
      if (!output) throw new Error('--output requires a directory');
      continue;
    }
    if (argument.startsWith('--output=')) {
      output = argument.slice('--output='.length);
      if (!output) throw new Error('--output requires a directory');
      continue;
    }
    throw new Error(`Unknown argument: ${argument}\n\n${usage()}`);
  }
  if (write && output) throw new Error('--write and --output are mutually exclusive');
  if (write && check) throw new Error('--write and --check are mutually exclusive');
  return Object.freeze({ write, check, output: output ? path.resolve(output) : null });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function pngBuffer(dataUrl) {
  const comma = dataUrl.indexOf(',');
  assert.ok(dataUrl.startsWith('data:image/png;base64,') && comma > 0,
    'Canvas did not return a base64 PNG');
  return Buffer.from(dataUrl.slice(comma + 1), 'base64');
}

function formatRaceTime(value) {
  const centiseconds = Math.max(0, Math.round(Number(value) * 100));
  const minutes = Math.floor(centiseconds / 6000);
  const seconds = Math.floor((centiseconds % 6000) / 100);
  const hundredths = centiseconds % 100;
  return minutes > 0
    ? `${minutes}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`
    : `${seconds}.${String(hundredths).padStart(2, '0')}`;
}

function formatIssues(issues) {
  return issues.map(issue => `${issue.kind}: ${issue.text}`).join(' | ');
}

function textValues(metadata) {
  return metadata.text.map(entry => entry.text);
}

function expectedPbText(report) {
  const previous = report.timing.previousBest;
  if (previous === null) return 'FIRST RECORD LOCKED';
  if (report.timing.newRecord) {
    return `PB SHAVED ${(report.timing.deltaMs / 1000).toFixed(2)}s`;
  }
  const base = `PB ${formatRaceTime(previous)}`;
  return report.timing.deltaMs < 0
    ? `${base}  //  +${Math.abs(report.timing.deltaMs / 1000).toFixed(2)}s`
    : base;
}

function expectedProofText(metadata) {
  if (metadata.finish.replayMode) {
    if (!metadata.finish.replayVerified) return 'REPLAY DIVERGED';
    return 'PROOF VERIFIED';
  }
  return metadata.finish.replayRecorded ? 'PROOF RECORDED' : 'NO SAVED PROOF';
}

function rectanglesOverlap(first, second) {
  const overlapWidth = Math.min(first.x + first.w, second.x + second.w)
    - Math.max(first.x, second.x);
  const overlapHeight = Math.min(first.y + first.h, second.y + second.h)
    - Math.max(first.y, second.y);
  return overlapWidth > 0 && overlapHeight > 0;
}

function assertButtonGeometry(scene, metadata) {
  const reportActions = metadata.finish.report.actions;
  const expectedEnabled = reportActions.filter(action => action.enabled).map(action => action.id);
  assert.deepEqual(metadata.ui.buttons.map(button => button.id), expectedEnabled,
    `${scene.key}: Canvas buttons do not match enabled report actions`);
  assert.deepEqual(metadata.ui.semantic, reportActions.map(action => ({
    id: action.id, label: action.label, disabled: !action.enabled,
  })), `${scene.key}: semantic buttons do not match the report`);

  for (const button of metadata.ui.buttons) {
    assert.ok(Number.isFinite(button.x) && Number.isFinite(button.y)
      && Number.isFinite(button.w) && Number.isFinite(button.h),
    `${scene.key}: ${button.id} has non-finite geometry`);
    assert.ok(button.w >= 44 && button.h >= 44,
      `${scene.key}: ${button.id} is smaller than 44 CSS pixels`);
    assert.ok(button.x >= 0 && button.y >= 0
      && button.x + button.w <= scene.viewport.width
      && button.y + button.h <= scene.viewport.height,
    `${scene.key}: ${button.id} leaves the viewport`);
  }
  for (let first = 0; first < metadata.ui.buttons.length; first++) {
    for (let second = first + 1; second < metadata.ui.buttons.length; second++) {
      assert.equal(rectanglesOverlap(metadata.ui.buttons[first], metadata.ui.buttons[second]), false,
        `${scene.key}: ${metadata.ui.buttons[first].id} overlaps ${metadata.ui.buttons[second].id}`);
    }
  }
  assert.ok(metadata.ui.buttons.some(button => button.id === scene.focusAction),
    `${scene.key}: focused action has no enabled Canvas target`);
}

function assertScene(scene, metadata) {
  const finish = metadata.finish;
  const report = finish.report;
  const expectedScore = scene.finish.trickScore + scene.finish.flowScore + scene.finish.riskScore;
  const expectedNet = scene.finish.elapsed - scene.finish.flipBonus;
  assert.equal(metadata.stagedOk, true, `${scene.key}: stageFinish failed`);
  assert.equal(finish.state, 'finished', `${scene.key}: expected finished state`);
  assert.equal(finish.levelIndex, scene.finish.levelIndex, `${scene.key}: wrong level`);
  assert.equal(finish.reducedMotion, scene.reducedMotion,
    `${scene.key}: wrong Reduced Motion state`);
  assert.equal(metadata.captureFrozen, true, `${scene.key}: presentation is not frozen`);
  assert.equal(finish.finishTimer, scene.reducedMotion ? 10 : scene.finish.presentationTime,
    `${scene.key}: wrong reveal time`);
  assert.equal(report.timing.gross, scene.finish.elapsed, `${scene.key}: wrong raw time`);
  assert.equal(report.timing.bonus, scene.finish.flipBonus, `${scene.key}: wrong flip credit`);
  assert.equal(report.timing.net, expectedNet, `${scene.key}: wrong net time`);
  assert.equal(report.score.total, expectedScore, `${scene.key}: wrong receipt total`);
  assert.equal(report.score.receipt.total, expectedScore, `${scene.key}: receipt did not reconcile`);
  assert.equal(report.stars, scene.finish.stars, `${scene.key}: wrong star count`);
  assert.equal(finish.focusedAction, scene.focusAction, `${scene.key}: wrong selected action`);
  assert.equal(metadata.ui.focusedAction, scene.focusAction, `${scene.key}: UI focus disagrees`);
  assert.equal(metadata.semantic.activeAction, scene.focusAction,
    `${scene.key}: semantic focus disagrees`);
  assert.equal(metadata.semantic.hidden, false, `${scene.key}: semantic result dialog is hidden`);
  assert.equal(metadata.semantic.title, 'Finish Forge run receipt',
    `${scene.key}: wrong semantic title`);
  assert.ok(metadata.semantic.summary.includes(report.level.name)
    && metadata.semantic.summary.includes(formatRaceTime(report.timing.net)),
  `${scene.key}: semantic summary omits result identity`);
  assert.ok(metadata.semantic.canvasLabel.includes(report.level.name)
    && metadata.semantic.canvasLabel.includes('Use arrow keys'),
  `${scene.key}: Canvas label omits result navigation`);

  assert.deepEqual(metadata.viewport, scene.viewport, `${scene.key}: wrong viewport`);
  assert.equal(metadata.dpr, scene.deviceScaleFactor, `${scene.key}: wrong DPR`);
  assert.deepEqual(metadata.canvas, {
    width: scene.viewport.width * scene.deviceScaleFactor,
    height: scene.viewport.height * scene.deviceScaleFactor,
  }, `${scene.key}: wrong Canvas pixel dimensions`);
  assert.deepEqual(metadata.canvasRect, {
    x: 0, y: 0, width: scene.viewport.width, height: scene.viewport.height,
  }, `${scene.key}: Canvas CSS geometry differs from the viewport`);
  assert.equal(metadata.clockPinned, true, `${scene.key}: render clock is not pinned`);
  if (scene.touch) assert.ok(metadata.touchPoints > 0, `${scene.key}: touch profile missing`);

  assertButtonGeometry(scene, metadata);
  const text = textValues(metadata);
  const requiredText = [
    `FINISH FORGE  //  RUN ${String(report.level.number).padStart(2, '0')}`,
    report.level.name.toUpperCase(),
    'RAW CLOCK',
    'FLIP CREDIT',
    'NET LOCK',
    'SCORE RECEIPT',
    formatRaceTime(report.timing.gross),
    `-${formatRaceTime(report.timing.bonus)}`,
    formatRaceTime(report.timing.net),
    expectedPbText(report),
    `PROOF // ${expectedProofText(metadata)}`,
    report.nextRoute.available
      ? `NEXT // ${String(report.nextRoute.index + 1).padStart(2, '0')} ${report.nextRoute.levelName.toUpperCase()}`
      : 'NEXT // RELAY BOARD',
    ...report.score.receipt.items.map(item => item.label),
    'TOTAL',
    ...report.actions.map(action => action.label),
    'SELECTED',
  ];
  for (const expected of requiredText) {
    assert.ok(text.includes(expected), `${scene.key}: missing Canvas text ${JSON.stringify(expected)}`);
  }
  assert.equal(text.filter(value => value === 'SELECTED').length, 1,
    `${scene.key}: expected one selected-action marker`);
  assert.ok(metadata.text.every(entry => Number.isFinite(entry.x) && Number.isFinite(entry.y)),
    `${scene.key}: Canvas text contains non-finite coordinates`);
}

function detachedState(metadata) {
  const { pixelSha256: _pixelSha256, ...state } = metadata;
  return state;
}

async function comparePngPixels(browser, firstBuffer, secondBuffer, expectedCanvas) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  try {
    return await page.evaluate(async ({ firstUrl, secondUrl, width, height }) => {
      const load = source => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('comparison PNG failed to decode'));
        image.src = source;
      });
      const [firstImage, secondImage] = await Promise.all([load(firstUrl), load(secondUrl)]);
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(firstImage, 0, 0);
      const first = ctx.getImageData(0, 0, width, height).data;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(secondImage, 0, 0);
      const second = ctx.getImageData(0, 0, width, height).data;
      let differingPixels = 0;
      let maxChannelDelta = 0;
      let maxPixelChannelSum = 0;
      let left = width, top = height, right = -1, bottom = -1;
      for (let offset = 0; offset < first.length; offset += 4) {
        let differs = false;
        let pixelChannelSum = 0;
        for (let channel = 0; channel < 4; channel++) {
          const delta = Math.abs(first[offset + channel] - second[offset + channel]);
          if (delta) differs = true;
          maxChannelDelta = Math.max(maxChannelDelta, delta);
          pixelChannelSum += delta;
        }
        if (!differs) continue;
        differingPixels++;
        maxPixelChannelSum = Math.max(maxPixelChannelSum, pixelChannelSum);
        const pixel = offset / 4;
        const x = pixel % width, y = Math.floor(pixel / width);
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
      return {
        differingPixels,
        maxChannelDelta,
        maxPixelChannelSum,
        bounds: differingPixels ? { left, top, right, bottom } : null,
      };
    }, {
      firstUrl: `data:image/png;base64,${firstBuffer.toString('base64')}`,
      secondUrl: `data:image/png;base64,${secondBuffer.toString('base64')}`,
      width: expectedCanvas.width,
      height: expectedCanvas.height,
    });
  } finally {
    await context.close();
  }
}

async function capturePass(browser, baseUrl, scene) {
  const context = await browser.newContext({
    viewport: scene.viewport,
    deviceScaleFactor: scene.deviceScaleFactor,
    isMobile: scene.touch,
    hasTouch: scene.touch,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const issues = [];
  page.on('pageerror', error => issues.push({ kind: 'pageerror', text: error.message }));
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') {
      issues.push({ kind: `console.${message.type()}`, text: message.text() });
    }
  });
  page.on('requestfailed', request => issues.push({
    kind: 'requestfailed',
    text: `${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`.trim(),
  }));
  page.on('response', response => {
    if (response.status() >= 400) issues.push({ kind: `http.${response.status()}`, text: response.url() });
  });

  try {
    await page.addInitScript(() => {
      const nativeGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function getReadbackSafeContext(type, options) {
        if (type !== '2d') return nativeGetContext.call(this, type, options);
        return nativeGetContext.call(this, type, { ...(options || {}), willReadFrequently: true });
      };

      const text = [];
      for (const method of ['fillText', 'strokeText']) {
        const nativeText = CanvasRenderingContext2D.prototype[method];
        CanvasRenderingContext2D.prototype[method] = function captureCanvasText(value, x, y, maxWidth) {
          text.push({
            method,
            text: String(value),
            x: Number(x),
            y: Number(y),
            maxWidth: Number.isFinite(Number(maxWidth)) ? Number(maxWidth) : null,
            font: String(this.font),
            align: String(this.textAlign),
            baseline: String(this.textBaseline),
            alpha: Number(this.globalAlpha),
          });
          return nativeText.apply(this, arguments);
        };
      }
      Object.defineProperty(window, '__motoCanvasTextProbe', {
        configurable: false,
        value: Object.freeze({
          reset() { text.length = 0; },
          snapshot() { return text.map(entry => ({ ...entry })); },
        }),
      });

      let randomState = 0x181f0a6e;
      Math.random = () => {
        randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
        return randomState / 0x100000000;
      };
      Date.now = () => 1_000_000_000_000;
      window.requestAnimationFrame = () => 1;
      window.cancelAnimationFrame = () => {};
      try {
        Object.defineProperty(Performance.prototype, 'now', {
          configurable: true,
          value: () => 1_000_000_000,
        });
      } catch {}
    });

    const touchQuery = scene.touch ? '&touch' : '';
    await page.goto(`${baseUrl}/index.html?dev&capture${touchQuery}`, {
      waitUntil: 'load',
      timeout: 15_000,
    });
    await page.waitForFunction(() => window.__moto?.G?.state === 'menu'
      && typeof window.__moto.stageFinish === 'function'
      && typeof window.__moto.finishSnapshot === 'function'
      && typeof window.__moto.uiSnapshot === 'function'
      && typeof window.__moto.renderNow === 'function'
      && window.__motoCanvasTextProbe
      && document.getElementById('boot')?.style.display === 'none', undefined,
    { timeout: 15_000, polling: 50 });

    const result = await page.evaluate(async options => {
      const api = window.__moto;
      const staged = api.stageFinish({
        ...options.finish,
        reducedMotion: options.reducedMotion,
        freeze: true,
      });
      const target = document.querySelector(
        `#semantic-results-actions button[data-action="${options.focusAction}"]`,
      );
      if (!target || target.disabled) {
        throw new Error(`focused semantic action unavailable: ${options.focusAction}`);
      }
      target.focus({ preventScroll: true });
      window.__motoCanvasTextProbe.reset();
      api.renderNow();

      const canvas = document.getElementById('c');
      const rect = canvas.getBoundingClientRect();
      const pixelBytes = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const pixelDigest = await crypto.subtle.digest('SHA-256', pixelBytes);
      const pixelSha256 = [...new Uint8Array(pixelDigest)]
        .map(value => value.toString(16).padStart(2, '0')).join('');
      const finish = api.finishSnapshot();
      const ui = api.uiSnapshot();
      const dialog = document.getElementById('semantic-results');
      const metadata = {
        scene: options.key,
        stagedOk: staged.ok === true,
        finish,
        ui,
        captureFrozen: api.G.captureFrozen === true,
        semantic: {
          hidden: dialog.hidden,
          title: document.getElementById('semantic-results-title')?.textContent || '',
          summary: document.getElementById('semantic-results-summary')?.textContent || '',
          activeAction: document.activeElement?.dataset?.action || null,
          canvasLabel: canvas.getAttribute('aria-label') || '',
        },
        viewport: { width: innerWidth, height: innerHeight },
        dpr: devicePixelRatio,
        canvas: { width: canvas.width, height: canvas.height },
        canvasRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        touchPoints: navigator.maxTouchPoints || 0,
        renderClock: performance.now(),
        clockPinned: performance.now() === 1_000_000_000
          && Date.now() === 1_000_000_000_000,
        text: window.__motoCanvasTextProbe.snapshot(),
        pixelSha256,
      };
      return { dataUrl: canvas.toDataURL('image/png'), metadata };
    }, {
      key: scene.key,
      finish: scene.finish,
      reducedMotion: scene.reducedMotion,
      focusAction: scene.focusAction,
    });

    assertScene(scene, result.metadata);
    await page.waitForTimeout(50);
    assert.equal(issues.length, 0, `${scene.key}: ${formatIssues(issues)}`);
    return { buffer: pngBuffer(result.dataUrl), metadata: result.metadata };
  } finally {
    await context.close();
  }
}

async function captureScene(browser, baseUrl, scene) {
  const first = await capturePass(browser, baseUrl, scene);
  const second = await capturePass(browser, baseUrl, scene);
  const firstState = detachedState(first.metadata);
  const secondState = detachedState(second.metadata);
  assert.deepEqual(secondState, firstState, `${scene.key}: independent capture state differs`);
  const firstStateHash = sha256(Buffer.from(JSON.stringify(firstState)));
  const secondStateHash = sha256(Buffer.from(JSON.stringify(secondState)));
  assert.equal(secondStateHash, firstStateHash, `${scene.key}: detached state SHA-256 mismatch`);

  const pixelDiff = await comparePngPixels(browser, first.buffer, second.buffer, first.metadata.canvas);
  assert.ok(pixelDiff.differingPixels <= MAX_DIFFERING_PIXELS,
    `${scene.key}: ${pixelDiff.differingPixels} pixels differ (limit ${MAX_DIFFERING_PIXELS})`);
  assert.ok(pixelDiff.maxChannelDelta <= MAX_CHANNEL_DELTA,
    `${scene.key}: max channel delta ${pixelDiff.maxChannelDelta} (limit ${MAX_CHANNEL_DELTA})`);

  return {
    ...first.metadata,
    filename: scene.filename,
    bytes: first.buffer.length,
    sha256: sha256(first.buffer),
    repeatSha256: sha256(second.buffer),
    byteIdentical: second.buffer.equals(first.buffer),
    stateSha256: firstStateHash,
    pixelDiff,
    buffer: first.buffer,
  };
}

async function chooseOutput(options) {
  if (options.write) return { directory: RELEASE_OUTPUT, temporary: false, mode: 'release' };
  if (options.output) return { directory: options.output, temporary: false, mode: 'review' };
  const directory = await mkdtemp(path.join(tmpdir(), 'motorush-v181-capture-'));
  return { directory, temporary: true, mode: 'check' };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options) return;
  const output = await chooseOutput(options);
  const server = await startStaticServer(path.resolve('public'));
  let browser;
  try {
    const launched = await launchInstalledBrowser();
    browser = launched.browser;
    console.log(`v1.8.1 capture browser: ${launched.source}`);
    console.log(`v1.8.1 capture mode: ${output.mode} (${output.directory})`);
    const records = [];
    for (const scene of SCENES) {
      const record = await captureScene(browser, server.baseUrl, scene);
      records.push(record);
      console.log([
        `  ${record.filename}`,
        `${record.canvas.width}x${record.canvas.height}`,
        `level=${record.finish.report.level.number}`,
        `net=${formatRaceTime(record.finish.report.timing.net)}`,
        `focus=${record.finish.focusedAction}`,
        `buttons=${record.ui.buttons.length}`,
        `text=${record.text.length}`,
        `raster-diff=${record.pixelDiff.differingPixels}px/${record.pixelDiff.maxChannelDelta}ch`,
        `state=${record.stateSha256}`,
        `sha256=${record.sha256}`,
      ].join('  '));
    }

    assert.equal(new Set(records.map(record => record.stateSha256)).size, SCENES.length,
      'the four staged scenes do not have distinct detached states');
    await mkdir(output.directory, { recursive: true });
    await Promise.all(records.map(record => writeFile(
      path.join(output.directory, record.filename), record.buffer,
    )));
    console.log(`v1.8.1 capture: 4 scenes, 8 clean contexts, exact detached state + <=${MAX_DIFFERING_PIXELS}px/${MAX_CHANNEL_DELTA}ch raster gate verified`);
    console.log(output.mode === 'release'
      ? `v1.8.1 capture: published certified PNGs to ${output.directory}`
      : output.mode === 'review'
        ? `v1.8.1 capture: retained certified PNGs in ${output.directory}`
        : 'v1.8.1 capture: check passed; disposable PNGs will be removed');
  } finally {
    await browser?.close().catch(() => {});
    await server.close().catch(() => {});
    if (output.temporary) await rm(output.directory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});

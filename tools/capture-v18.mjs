import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { launchInstalledBrowser, startStaticServer } from './golden-browser.mjs';

const OUTPUT = path.resolve('docs/screenshots/v1.8');
const LEVEL_INDEX = 7;
const PRESENTATION_TICKS = 33;
const GAME_TICK_RATE = 60;
const RAGDOLL_STEPS_PER_TICK = 2;
const EXPECTED_PARTS = 17;
const EXPECTED_CAUSE = 'mace';
const EXPECTED_LABEL = 'CHAIN HAMMER';
const MAX_DIFFERING_PIXELS = 8;
const MAX_CHANNEL_DELTA = 8;

const SCENES = Object.freeze([
  Object.freeze({
    key: 'hero',
    filename: 'update-v18-crash-hero.png',
    viewport: Object.freeze({ width: 1280, height: 720 }),
    deviceScaleFactor: 1,
    touch: false,
    collisionDebug: false,
    reducedMotion: false,
  }),
  Object.freeze({
    key: 'proxies',
    filename: 'update-v18-ragdoll-proxies.png',
    viewport: Object.freeze({ width: 1280, height: 720 }),
    deviceScaleFactor: 1,
    touch: false,
    collisionDebug: true,
    reducedMotion: false,
  }),
  Object.freeze({
    key: 'mobile',
    filename: 'update-v18-mobile-crash.png',
    viewport: Object.freeze({ width: 390, height: 844 }),
    deviceScaleFactor: 2,
    touch: true,
    collisionDebug: false,
    reducedMotion: false,
  }),
  Object.freeze({
    key: 'reduced',
    filename: 'update-v18-reduced-motion.png',
    viewport: Object.freeze({ width: 1280, height: 720 }),
    deviceScaleFactor: 1,
    touch: false,
    collisionDebug: false,
    reducedMotion: true,
  }),
]);

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function pngBuffer(dataUrl) {
  const comma = dataUrl.indexOf(',');
  assert.ok(dataUrl.startsWith('data:image/png;base64,') && comma > 0,
    'Canvas did not return a base64 PNG');
  return Buffer.from(dataUrl.slice(comma + 1), 'base64');
}

function formatIssues(issues) {
  return issues.map(issue => `${issue.kind}: ${issue.text}`).join(' | ');
}

function stagedState(metadata) {
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
    if (response.status() >= 400) {
      issues.push({ kind: `http.${response.status()}`, text: response.url() });
    }
  });

  try {
    // The crash simulation and crash FX are already deterministic. Pinning the
    // ambient clock and Math.random also removes unrelated glow/audio-noise
    // variance while the capture hook is being staged in a fresh context.
    await page.addInitScript(() => {
      const nativeGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function getReadbackSafeContext(type, options) {
        if (type !== '2d') return nativeGetContext.call(this, type, options);
        return nativeGetContext.call(this, type, { ...(options || {}), willReadFrequently: true });
      };
      let randomState = 0x18c0ffee;
      Math.random = () => {
        randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
        return randomState / 0x100000000;
      };
      // The harness owns every fixed step and final render. Suppress the page's
      // ambient RAF loop so a headless GPU readback cannot land between two
      // otherwise identical frozen Canvas frames.
      window.requestAnimationFrame = () => 1;
      window.cancelAnimationFrame = () => {};
      try {
        Object.defineProperty(Performance.prototype, 'now', {
          configurable: true,
          value: () => 1_000_000_000,
        });
      } catch {}
    });

    const query = scene.touch ? '&touch' : '';
    await page.goto(`${baseUrl}/index.html?dev&capture&autoplay${query}`, {
      waitUntil: 'load',
      timeout: 15_000,
    });
    await page.waitForFunction(() => window.__moto?.G?.state === 'menu'
      && typeof window.__moto.stageCrash === 'function'
      && typeof window.__moto.stepTicks === 'function'
      && typeof window.__moto.freezePresentation === 'function', undefined,
    { timeout: 15_000 });

    const result = await page.evaluate(async options => {
      const api = window.__moto;
      const staged = api.stageCrash({
        levelIndex: options.levelIndex,
        type: options.cause,
        intensity: 1,
        offsetX: 28,
        offsetY: -4,
        warmupTicks: 0,
        presentationTicks: options.presentationTicks,
        reducedMotion: options.reducedMotion,
        collisionDebug: options.collisionDebug,
      });
      const frozen = api.freezePresentation(true);
      api.renderNow();

      const canvas = document.getElementById('c');
      const pose = api.G.ragdollPose;
      const pixelBytes = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const pixelDigest = await crypto.subtle.digest('SHA-256', pixelBytes);
      const pixelSha256 = [...new Uint8Array(pixelDigest)]
        .map(value => value.toString(16).padStart(2, '0')).join('');
      const metadata = {
        staged,
        frozen,
        state: api.G.state,
        levelIndex: api.G.levelIdx,
        levelName: api.G.level?.name || '',
        cause: api.G.crashProfile?.type || '',
        label: api.G.crashProfile?.label || '',
        reducedMotion: pose?.reducedMotion === true,
        parts: pose?.nodes?.length || 0,
        presentationTicks: options.presentationTicks,
        sessionTick: api.G.sessionTick,
        runTick: api.G.run?.tick ?? -1,
        poseTick: pose?.ticks ?? -1,
        crashAge: api.G.crashAge,
        contacts: pose?.contactCount || 0,
        peakImpact: pose?.peakImpact || 0,
        brokenTethers: pose?.brokenTethers || 0,
        collisionDebug: options.collisionDebug,
        viewport: { width: innerWidth, height: innerHeight },
        dpr: devicePixelRatio,
        renderClock: performance.now(),
        renderClockPinned: performance.now() === 1_000_000_000,
        canvas: { width: canvas.width, height: canvas.height },
        touchPoints: navigator.maxTouchPoints || 0,
        pixelSha256,
        poseSignature: JSON.stringify((pose?.nodes || []).map(node => [
          node.id, node.group, node.x, node.y, node.radius, node.vx, node.vy, node.contacts,
        ])),
      };
      return { dataUrl: canvas.toDataURL('image/png'), metadata };
    }, {
      levelIndex: LEVEL_INDEX,
      cause: EXPECTED_CAUSE,
      presentationTicks: PRESENTATION_TICKS,
      reducedMotion: scene.reducedMotion,
      collisionDebug: scene.collisionDebug,
    });

    assert.equal(result.metadata.staged.ok, true, `${scene.key}: stageCrash failed`);
    assert.equal(result.metadata.frozen, true, `${scene.key}: presentation did not freeze`);
    assert.equal(result.metadata.state, 'crashed', `${scene.key}: expected crashed state`);
    assert.equal(result.metadata.levelIndex, LEVEL_INDEX, `${scene.key}: wrong level`);
    assert.equal(result.metadata.cause, EXPECTED_CAUSE, `${scene.key}: wrong crash cause`);
    assert.equal(result.metadata.label, EXPECTED_LABEL, `${scene.key}: wrong crash label`);
    assert.equal(result.metadata.parts, EXPECTED_PARTS, `${scene.key}: wrong rig part count`);
    assert.equal(result.metadata.reducedMotion, scene.reducedMotion,
      `${scene.key}: wrong Reduced Motion state`);
    assert.equal(result.metadata.collisionDebug, scene.collisionDebug,
      `${scene.key}: wrong collision-debug state`);
    assert.equal(result.metadata.sessionTick, PRESENTATION_TICKS,
      `${scene.key}: wrong session tick`);
    assert.equal(result.metadata.runTick, 0, `${scene.key}: authoritative run advanced`);
    assert.ok(Math.abs(result.metadata.crashAge - PRESENTATION_TICKS / GAME_TICK_RATE) < 1e-9,
      `${scene.key}: wrong crash age`);
    assert.equal(result.metadata.poseTick,
      scene.reducedMotion ? 0 : PRESENTATION_TICKS * RAGDOLL_STEPS_PER_TICK,
      `${scene.key}: wrong ragdoll tick`);
    assert.deepEqual(result.metadata.viewport, scene.viewport, `${scene.key}: wrong viewport`);
    assert.equal(result.metadata.dpr, scene.deviceScaleFactor, `${scene.key}: wrong DPR`);
    assert.equal(result.metadata.renderClockPinned, true, `${scene.key}: render clock is not pinned`);
    assert.deepEqual(result.metadata.canvas, {
      width: scene.viewport.width * scene.deviceScaleFactor,
      height: scene.viewport.height * scene.deviceScaleFactor,
    }, `${scene.key}: wrong Canvas pixel dimensions`);
    if (scene.touch) assert.ok(result.metadata.touchPoints > 0, `${scene.key}: touch profile missing`);

    // Let any asynchronous browser diagnostics already queued by loading or
    // staging reach the listeners before certifying this isolated context.
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
  const firstHash = sha256(first.buffer);
  const secondHash = sha256(second.buffer);
  const firstState = stagedState(first.metadata);
  const secondState = stagedState(second.metadata);
  assert.deepEqual(secondState, firstState,
    `${scene.key}: independent capture metadata differs`);
  const firstStateHash = sha256(Buffer.from(JSON.stringify(firstState)));
  const secondStateHash = sha256(Buffer.from(JSON.stringify(secondState)));
  assert.equal(secondStateHash, firstStateHash, `${scene.key}: staged-state SHA-256 mismatch`);

  const pixelDiff = await comparePngPixels(browser, first.buffer, second.buffer,
    first.metadata.canvas);
  assert.ok(pixelDiff.differingPixels <= MAX_DIFFERING_PIXELS,
    `${scene.key}: ${pixelDiff.differingPixels} pixels differ (limit ${MAX_DIFFERING_PIXELS})`);
  assert.ok(pixelDiff.maxChannelDelta <= MAX_CHANNEL_DELTA,
    `${scene.key}: max channel delta ${pixelDiff.maxChannelDelta} (limit ${MAX_CHANNEL_DELTA})`);

  await writeFile(path.join(OUTPUT, scene.filename), first.buffer);
  return {
    ...first.metadata,
    filename: scene.filename,
    bytes: first.buffer.length,
    sha256: firstHash,
    repeatSha256: secondHash,
    byteIdentical: second.buffer.equals(first.buffer),
    stateSha256: firstStateHash,
    pixelDiff,
  };
}

async function main() {
  await mkdir(OUTPUT, { recursive: true });
  await Promise.all(SCENES.flatMap(scene => [
    rm(path.join(OUTPUT, `.debug-${scene.key}-first.png`), { force: true }),
    rm(path.join(OUTPUT, `.debug-${scene.key}-second.png`), { force: true }),
  ]));
  const server = await startStaticServer(path.resolve('public'));
  let browser;
  try {
    const launched = await launchInstalledBrowser();
    browser = launched.browser;
    console.log(`v1.8 capture browser: ${launched.source}`);
    const records = new Map();
    for (const scene of SCENES) {
      const record = await captureScene(browser, server.baseUrl, scene);
      records.set(scene.key, record);
      console.log([
        `  ${record.filename}`,
        `${record.canvas.width}x${record.canvas.height}`,
        `session=${record.sessionTick}`,
        `pose=${record.poseTick}`,
        `age=${record.crashAge.toFixed(2)}s`,
        `parts=${record.parts}`,
        `contacts=${record.contacts}`,
        `peak=${record.peakImpact.toFixed(1)}`,
        `raster-diff=${record.pixelDiff.differingPixels}px/${record.pixelDiff.maxChannelDelta}ch`,
        `state=${record.stateSha256}`,
        `sha256=${record.sha256}`,
      ].join('  '));
    }

    assert.equal(records.get('hero').poseSignature, records.get('proxies').poseSignature,
      'hero and collision-debug captures are not the same staged ragdoll pose');
    assert.equal(records.get('hero').sessionTick, records.get('proxies').sessionTick,
      'hero and collision-debug captures are not the same staged session tick');
    console.log(`v1.8 capture: 4 scenes, 8 clean contexts, exact state + <=${MAX_DIFFERING_PIXELS}px/${MAX_CHANNEL_DELTA}ch raster gate verified`);
  } finally {
    await browser?.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});

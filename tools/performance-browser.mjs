import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchInstalledBrowser, startStaticServer } from './golden-browser.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PUBLIC = path.join(ROOT, 'public');

const PROFILES = Object.freeze([
  Object.freeze({
    id: 'desktop-1280x720-dpr1',
    viewport: Object.freeze({ width: 1280, height: 720 }),
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    p95WorkBudgetMs: 8,
  }),
  Object.freeze({
    id: 'mobile-390x844-dpr2',
    viewport: Object.freeze({ width: 390, height: 844 }),
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    p95WorkBudgetMs: 12,
  }),
]);

const FRAME_WORK_SAMPLE_CAPACITY = 360;
const FRAME_WORK_SAMPLE_TARGET = 180;
const MINIMUM_MEASUREMENT_MS = 3_000;
const SAMPLE_TARGET_TIMEOUT_MS = 12_000;
const PERFORMANCE_LEVEL = 5;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function commandIsNeutral(command) {
  return command && !command.gas && !command.brake && !command.leanBack && !command.leanFwd;
}

function validatePool(name, stats) {
  invariant(Number.isInteger(stats.capacity) && stats.capacity > 0,
    `${name} pool has an invalid capacity`);
  invariant(stats.active >= 0 && stats.active <= stats.capacity,
    `${name} pool exceeded capacity: ${stats.active}/${stats.capacity}`);
  invariant(stats.created >= 0 && stats.created <= stats.capacity,
    `${name} pool created ${stats.created} identities for capacity ${stats.capacity}`);
  invariant(stats.peak >= 0 && stats.peak <= stats.capacity,
    `${name} pool peak exceeded capacity: ${stats.peak}/${stats.capacity}`);
}

function formatPerformance(profile, measurement) {
  const work = measurement.frameWork;
  const pacing = measurement.performance;
  return `${profile.id}: ${work.sampleCount} frame-work samples, `
    + `work mean ${work.meanMs.toFixed(2)} ms, `
    + `p50 ${work.p50Ms.toFixed(2)} ms, p95 ${work.p95Ms.toFixed(2)} ms, `
    + `p99 ${work.p99Ms.toFixed(2)} ms, max ${work.maxMs.toFixed(2)} ms; `
    + `pacing p95 ${pacing.p95FrameMs.toFixed(2)} ms, `
    + `${pacing.fixedTickCount} fixed ticks`;
}

function validateFrameWork(profile, measurement) {
  const work = measurement.frameWork;
  const values = [work.meanMs, work.p50Ms, work.p95Ms, work.p99Ms, work.maxMs];
  invariant(work.capacity === FRAME_WORK_SAMPLE_CAPACITY,
    `${profile.id} frame-work capacity changed: ${work.capacity}`);
  invariant(Number.isInteger(work.sampleCount) && Number.isInteger(work.totalSampleCount)
      && work.totalSampleCount >= FRAME_WORK_SAMPLE_TARGET,
    `${profile.id} captured fewer than ${FRAME_WORK_SAMPLE_TARGET} frame-work samples; ${formatPerformance(profile, measurement)}`);
  invariant(work.sampleCount === Math.min(work.totalSampleCount, work.capacity),
    `${profile.id} frame-work rolling/total counts disagree: ${work.sampleCount}/${work.totalSampleCount}`);
  invariant(work.totalSampleCount === measurement.performance.totalSampleCount,
    `${profile.id} frame telemetry/probe totals disagree: ${measurement.performance.totalSampleCount}/${work.totalSampleCount}`);
  invariant(work.wrappedCallbackCount === 1,
    `${profile.id} expected one animation callback identity, found ${work.wrappedCallbackCount}`);
  invariant(measurement.probeFrozen && measurement.frameWorkFrozen,
    `${profile.id} frame-work probe or snapshot is mutable`);
  invariant(values.every(value => Number.isFinite(value) && value >= 0) && work.maxMs > 0,
    `${profile.id} frame-work statistics are invalid: ${JSON.stringify(work)}`);
  invariant(work.p50Ms <= work.p95Ms && work.p95Ms <= work.p99Ms
      && work.p99Ms <= work.maxMs && work.meanMs <= work.maxMs,
    `${profile.id} frame-work percentiles are unordered: ${JSON.stringify(work)}`);
}

async function installFrameWorkProbe(page) {
  await page.addInitScript(({ capacity }) => {
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    const samples = new Float64Array(capacity);
    const wrappers = new WeakMap();
    let writeIndex = 0;
    let sampleCount = 0;
    let totalSampleCount = 0;
    let wrappedCallbackCount = 0;
    let enabled = false;

    function quantile(sorted, probability) {
      if (!sorted.length) return 0;
      if (sorted.length === 1) return sorted[0];
      const position = (sorted.length - 1) * probability;
      const lower = Math.floor(position);
      const upper = Math.ceil(position);
      if (lower === upper) return sorted[lower];
      const fraction = position - lower;
      return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction;
    }

    function record(durationMs) {
      samples[writeIndex] = Math.max(0, Number.isFinite(durationMs) ? durationMs : 0);
      writeIndex = writeIndex + 1 === capacity ? 0 : writeIndex + 1;
      if (sampleCount < capacity) sampleCount++;
      totalSampleCount++;
    }

    function createSnapshot() {
      const sorted = new Float64Array(sampleCount);
      let total = 0;
      let start = writeIndex - sampleCount;
      if (start < 0) start += capacity;
      for (let offset = 0; offset < sampleCount; offset++) {
        const index = start + offset < capacity ? start + offset : start + offset - capacity;
        const value = samples[index];
        sorted[offset] = value;
        total += value;
      }
      sorted.sort();
      return Object.freeze({
        capacity,
        sampleCount,
        totalSampleCount,
        wrappedCallbackCount,
        meanMs: sampleCount ? total / sampleCount : 0,
        p50Ms: quantile(sorted, 0.50),
        p95Ms: quantile(sorted, 0.95),
        p99Ms: quantile(sorted, 0.99),
        maxMs: sampleCount ? sorted[sampleCount - 1] : 0,
      });
    }

    const probe = Object.freeze({
      get sampleCount() { return sampleCount; },
      get totalSampleCount() { return totalSampleCount; },
      reset() {
        enabled = false;
        samples.fill(0);
        writeIndex = 0;
        sampleCount = 0;
        totalSampleCount = 0;
        enabled = true;
      },
      stopAndSnapshot() {
        enabled = false;
        return createSnapshot();
      },
    });
    Object.defineProperty(window, '__motoFrameWorkProbe', {
      value: probe,
      configurable: false,
      enumerable: false,
      writable: false,
    });
    window.requestAnimationFrame = function requestAnimationFrameWithWorkProbe(callback) {
      if (typeof callback !== 'function') return nativeRequestAnimationFrame(callback);
      let wrapped = wrappers.get(callback);
      if (!wrapped) {
        wrappedCallbackCount++;
        wrapped = function measuredAnimationFrame(timestamp) {
          if (!enabled) return callback.call(window, timestamp);
          const startedAt = performance.now();
          try { return callback.call(window, timestamp); }
          finally { record(performance.now() - startedAt); }
        };
        wrappers.set(callback, wrapped);
      }
      return nativeRequestAnimationFrame(wrapped);
    };
  }, { capacity: FRAME_WORK_SAMPLE_CAPACITY });
}

async function assertDisjointControlZones(page, label) {
  const snapshot = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    zones: window.__moto.input.getConfig().pointerSurface.zones,
  }));
  const byCommand = Object.fromEntries(snapshot.zones.map(zone => [zone.command, zone]));
  for (const [first, second] of [['gas', 'brake'], ['leanBack', 'leanFwd']]) {
    const a = byCommand[first];
    const b = byCommand[second];
    invariant(a?.shape === 'circle' && b?.shape === 'circle',
      `${label} is missing circular ${first}/${second} touch zones`);
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    invariant(distance > a.radius + b.radius,
      `${label} ${first}/${second} touch zones overlap by ${(a.radius + b.radius - distance).toFixed(2)} px`);
  }
  for (const zone of snapshot.zones) {
    invariant(zone.x - zone.radius >= 0 && zone.x + zone.radius <= snapshot.width
        && zone.y - zone.radius >= 0 && zone.y + zone.radius <= snapshot.height,
    `${label} ${zone.command} touch zone is clipped by the viewport`);
  }
  return snapshot;
}

async function runInterruptionMatrix(page) {
  await page.evaluate(() => {
    window.__moto.startLevel(0);
    window.__moto.G.settingsOpen = false;
  });
  const { width, height } = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  const portraitZones = await assertDisjointControlZones(page, `${width}x${height}`);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(80);
  const narrowZones = await assertDisjointControlZones(page, '320x568');
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(80);
  const restoredZones = await assertDisjointControlZones(page, `${width}x${height} restored`);
  const byCommand = Object.fromEntries(restoredZones.zones.map(zone => [zone.command, zone]));
  const gasX = byCommand.gas.x;
  const leanBackX = byCommand.leanBack.x;
  const y = byCommand.gas.y;

  await page.dispatchEvent('#c', 'pointerdown', {
    pointerId: 701,
    pointerType: 'touch',
    clientX: gasX,
    clientY: y,
    bubbles: true,
  });
  await page.dispatchEvent('#c', 'pointerdown', {
    pointerId: 702,
    pointerType: 'touch',
    clientX: leanBackX,
    clientY: y,
    bubbles: true,
  });
  const simultaneous = await page.evaluate(() => window.__moto.input.snapshot());
  invariant(simultaneous.gas && simultaneous.leanBack,
    `simultaneous touch was not aggregated: ${JSON.stringify(simultaneous)}`);

  await page.dispatchEvent('#c', 'pointercancel', {
    pointerId: 701,
    pointerType: 'touch',
    clientX: gasX,
    clientY: y,
    bubbles: true,
  });
  const cancelled = await page.evaluate(() => ({
    command: window.__moto.input.snapshot(),
    performance: window.__moto.performanceSnapshot(),
  }));
  invariant(!cancelled.command.gas && cancelled.command.leanBack,
    `pointer cancel released the wrong commands: ${JSON.stringify(cancelled.command)}`);
  invariant(cancelled.performance.cancelCount >= 1,
    'pointer cancellation was not counted by performance telemetry');

  await page.dispatchEvent('#c', 'pointerup', {
    pointerId: 702,
    pointerType: 'touch',
    clientX: leanBackX,
    clientY: y,
    bubbles: true,
  });
  await page.keyboard.down('ArrowUp');
  invariant((await page.evaluate(() => window.__moto.input.snapshot())).gas,
    'keyboard gas did not reach the extracted input state');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const blurred = await page.evaluate(() => ({
    state: window.__moto.G.state,
    command: window.__moto.input.snapshot(),
    telemetry: window.__moto.input.getTelemetry(),
  }));
  await page.keyboard.up('ArrowUp');
  invariant(blurred.state === 'paused' && commandIsNeutral(blurred.command),
    `blur did not pause and clear controls: ${JSON.stringify(blurred)}`);
  invariant((blurred.telemetry.clearReasons.blur || 0) >= 1,
    'blur clear reason was not retained');

  await page.evaluate(() => window.__moto.startLevel(0));
  await page.dispatchEvent('#c', 'pointerdown', {
    pointerId: 703,
    pointerType: 'touch',
    clientX: gasX,
    clientY: y,
    bubbles: true,
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(120);
  let rotated = await page.evaluate(() => ({
    state: window.__moto.G.state,
    command: window.__moto.input.snapshot(),
    telemetry: window.__moto.input.getTelemetry(),
    performance: window.__moto.performanceSnapshot(),
    canvas: {
      width: document.querySelector('canvas').clientWidth,
      height: document.querySelector('canvas').clientHeight,
    },
  }));
  if (rotated.state === 'playing') {
    await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
    await page.waitForTimeout(80);
    rotated = await page.evaluate(() => ({
      state: window.__moto.G.state,
      command: window.__moto.input.snapshot(),
      telemetry: window.__moto.input.getTelemetry(),
      performance: window.__moto.performanceSnapshot(),
      canvas: {
        width: document.querySelector('canvas').clientWidth,
        height: document.querySelector('canvas').clientHeight,
      },
    }));
  }
  invariant(rotated.state === 'paused' && commandIsNeutral(rotated.command),
    `rotation did not pause and clear controls: ${JSON.stringify(rotated)}`);
  invariant((rotated.telemetry.clearReasons.rotation || 0) >= 1,
    'rotation clear reason was not retained');
  invariant(rotated.performance.rotationCount >= 1,
    'rotation was not counted by performance telemetry');
  invariant(rotated.canvas.width === 844 && rotated.canvas.height === 390,
    `canvas missed rotated viewport: ${JSON.stringify(rotated.canvas)}`);

  await page.evaluate(() => { window.__moto.G.settingsOpen = true; });
  await page.waitForTimeout(80);
  const settingsGeometry = await page.evaluate(() => {
    const width = innerWidth;
    const height = innerHeight;
    const rowHeight = height < 480 ? 41 : 48;
    const panelWidth = Math.min(400, width - 28);
    const panelHeight = Math.min(height - 16, 66 + rowHeight * 6 + 56);
    const x = (width - panelWidth) / 2;
    const y = (height - panelHeight) / 2;
    const right = x + panelWidth - 26;
    return { x: right - 42, y: y + 66 + rowHeight * 5 + 18 };
  });
  await page.mouse.click(settingsGeometry.x, settingsGeometry.y);
  await page.waitForTimeout(50);
  const leftHanded = await page.evaluate(() => ({
    enabled: window.__moto.SETTINGS.leftHanded,
    layout: window.__moto.input.getLayoutMetadata(),
  }));
  invariant(leftHanded.enabled && leftHanded.layout.leftHanded
      && leftHanded.layout.commandSides.gas === 'left'
      && leftHanded.layout.commandSides.leanBack === 'right',
    `left-hand layout did not swap command clusters: ${JSON.stringify(leftHanded)}`);
  const leftHandedZones = await assertDisjointControlZones(page, 'left-handed 844x390');

  return { portraitZones, narrowZones, simultaneous, cancelled, blurred, rotated,
    leftHanded, leftHandedZones };
}

async function runProfile(browser, baseUrl, profile) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await installFrameWorkProbe(page);
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  try {
    await page.goto(`${baseUrl}/index.html?dev&capture&touch&autoplay&level=${PERFORMANCE_LEVEL}`, {
      waitUntil: 'load',
      timeout: 15_000,
    });
    await page.waitForFunction(
      () => window.__moto?.G?.state === 'playing'
        && typeof window.__moto.resetPerformance === 'function',
      undefined,
      { timeout: 15_000 },
    );
    await page.waitForTimeout(750);
    await page.evaluate(() => {
      window.__moto.resetPerformance();
      window.__motoFrameWorkProbe.reset();
    });
    await page.waitForTimeout(MINIMUM_MEASUREMENT_MS);
    await page.waitForFunction(
      target => window.__motoFrameWorkProbe?.totalSampleCount >= target,
      FRAME_WORK_SAMPLE_TARGET,
      { timeout: SAMPLE_TARGET_TIMEOUT_MS, polling: 50 },
    ).catch(error => {
      // Preserve the measured snapshot for a useful assertion message when a
      // hosted scheduler cannot deliver the target inside the bounded window.
      if (error?.name !== 'TimeoutError') throw error;
    });

    const measurement = await page.evaluate(() => {
      const frameWork = window.__motoFrameWorkProbe.stopAndSnapshot();
      return {
        state: window.__moto.G.state,
        performance: window.__moto.performanceSnapshot(),
        frameWork,
        probeFrozen: Object.isFrozen(window.__motoFrameWorkProbe),
        frameWorkFrozen: Object.isFrozen(frameWork),
        pools: window.__moto.effectPoolSnapshot(),
      };
    });
    console.log(formatPerformance(profile, measurement));
    invariant(pageErrors.length === 0, `${profile.id} measurement page errors: ${pageErrors.join(' | ')}`);
    invariant(consoleErrors.length === 0,
      `${profile.id} measurement console errors: ${consoleErrors.join(' | ')}`);
    validateFrameWork(profile, measurement);
    invariant(measurement.state === 'playing',
      `${profile.id} was not actively playing during measurement: ${measurement.state}`);
    invariant(measurement.performance.fixedTickCount >= 60,
      `${profile.id} advanced only ${measurement.performance.fixedTickCount} fixed ticks`);
    invariant(measurement.performance.peakActiveEffects > 0,
      `${profile.id} did not exercise any pooled effects during measurement`);
    invariant(measurement.frameWork.p95Ms < profile.p95WorkBudgetMs,
      `${profile.id} frame-work p95 ${measurement.frameWork.p95Ms.toFixed(2)} ms exceeds ${profile.p95WorkBudgetMs} ms`);
    invariant(measurement.performance.peakActiveEffects <= measurement.pools.capacity,
      `${profile.id} telemetry observed effects beyond pool capacity`);
    validatePool('particles', measurement.pools.particles);
    validatePool('popups', measurement.pools.popups);
    validatePool('tracks', measurement.pools.tracks);

    await page.waitForFunction(
      measuredTotal => window.__moto.performanceSnapshot().totalSampleCount > measuredTotal,
      measurement.performance.totalSampleCount,
      { timeout: 2_000, polling: 50 },
    );
    const continued = await page.evaluate(() => ({
      frameWorkTotal: window.__motoFrameWorkProbe.totalSampleCount,
      performanceTotal: window.__moto.performanceSnapshot().totalSampleCount,
    }));
    invariant(continued.frameWorkTotal === measurement.frameWork.totalSampleCount
        && continued.performanceTotal > measurement.performance.totalSampleCount,
      `${profile.id} frame-work probe did not stop cleanly: ${JSON.stringify(continued)}`);

    const interactions = profile.isMobile ? await runInterruptionMatrix(page) : null;
    invariant(pageErrors.length === 0, `${profile.id} page errors: ${pageErrors.join(' | ')}`);
    invariant(consoleErrors.length === 0,
      `${profile.id} console errors: ${consoleErrors.join(' | ')}`);
    return {
      id: profile.id,
      workBudgetMs: profile.p95WorkBudgetMs,
      pageErrors,
      consoleErrors,
      measurement,
      interactions,
    };
  } finally {
    await context.close();
  }
}

const server = await startStaticServer(PUBLIC);
let browser;
try {
  const launched = await launchInstalledBrowser();
  browser = launched.browser;
  console.log(`Browser: ${launched.source}, ${browser.version()} (${launched.executablePath})`);
  const reports = [];
  for (const profile of PROFILES) {
    const report = await runProfile(browser, server.baseUrl, profile);
    reports.push(report);
    const work = report.measurement.frameWork;
    console.log(
      `${profile.id}: passed frame-work p95 < ${profile.p95WorkBudgetMs} ms with `
      + `${report.measurement.performance.peakActiveEffects}/`
      + `${report.measurement.pools.capacity} peak effects and ${work.sampleCount} samples`,
    );
  }
  console.log('Smooth Ride browser gate passed.');
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await server.close().catch(() => {});
}

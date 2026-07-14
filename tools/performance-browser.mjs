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
    p95BudgetMs: 20,
  }),
  Object.freeze({
    id: 'mobile-390x844-dpr2',
    viewport: Object.freeze({ width: 390, height: 844 }),
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    p95BudgetMs: 25,
  }),
]);

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
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  try {
    await page.goto(`${baseUrl}/index.html?dev&capture&touch&autoplay&level=1`, {
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
    await page.evaluate(() => window.__moto.resetPerformance());
    await page.waitForTimeout(3_000);

    const measurement = await page.evaluate(() => ({
      state: window.__moto.G.state,
      performance: window.__moto.performanceSnapshot(),
      pools: window.__moto.effectPoolSnapshot(),
    }));
    invariant(measurement.performance.sampleCount >= 100,
      `${profile.id} captured only ${measurement.performance.sampleCount} frames`);
    invariant(measurement.state === 'playing',
      `${profile.id} was not actively playing during measurement: ${measurement.state}`);
    invariant(measurement.performance.fixedTickCount >= 60,
      `${profile.id} advanced only ${measurement.performance.fixedTickCount} fixed ticks`);
    invariant(measurement.performance.peakActiveEffects > 0,
      `${profile.id} did not exercise any pooled effects during measurement`);
    invariant(measurement.performance.p95FrameMs < profile.p95BudgetMs,
      `${profile.id} p95 ${measurement.performance.p95FrameMs.toFixed(2)} ms exceeds ${profile.p95BudgetMs} ms`);
    invariant(measurement.performance.peakActiveEffects <= measurement.pools.capacity,
      `${profile.id} telemetry observed effects beyond pool capacity`);
    validatePool('particles', measurement.pools.particles);
    validatePool('popups', measurement.pools.popups);
    validatePool('tracks', measurement.pools.tracks);

    const interactions = profile.isMobile ? await runInterruptionMatrix(page) : null;
    invariant(pageErrors.length === 0, `${profile.id} page errors: ${pageErrors.join(' | ')}`);
    invariant(consoleErrors.length === 0,
      `${profile.id} console errors: ${consoleErrors.join(' | ')}`);
    return {
      id: profile.id,
      budgetMs: profile.p95BudgetMs,
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
  const reports = [];
  for (const profile of PROFILES) {
    const report = await runProfile(browser, server.baseUrl, profile);
    reports.push(report);
    const perf = report.measurement.performance;
    console.log(
      `${profile.id}: ${perf.sampleCount} frames, p50 ${perf.p50FrameMs.toFixed(2)} ms, `
      + `p95 ${perf.p95FrameMs.toFixed(2)} ms, p99 ${perf.p99FrameMs.toFixed(2)} ms, `
      + `${perf.peakActiveEffects}/${report.measurement.pools.capacity} peak effects`,
    );
  }
  console.log(`Browser: ${launched.source} (${launched.executablePath})`);
  console.log('Smooth Ride browser gate passed.');
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await server.close().catch(() => {});
}

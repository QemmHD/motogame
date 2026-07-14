import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchInstalledBrowser, startStaticServer } from './golden-browser.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PUBLIC = path.join(ROOT, 'public');

const REQUIRED_PARTS = Object.freeze([
  'rearWheel',
  'frontWheel',
  'bikeFrame',
  'seat',
  'handlebar',
  'hip',
  'torso',
  'head',
  'helmet',
  'rearElbow',
  'frontElbow',
  'rearHand',
  'frontHand',
  'rearKnee',
  'frontKnee',
  'rearFoot',
  'frontFoot',
]);

const PROFILES = Object.freeze([
  Object.freeze({
    id: 'desktop-1280x720-dpr1-tnt',
    viewport: Object.freeze({ width: 1280, height: 720 }),
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    reducedMotion: false,
    cause: 'tnt',
    causeLabel: 'REDLINE BURST',
    p95WorkBudgetMs: 8,
  }),
  Object.freeze({
    id: 'mobile-390x844-dpr2-saw',
    viewport: Object.freeze({ width: 390, height: 844 }),
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: false,
    cause: 'saw',
    causeLabel: 'SAW KISS',
    p95WorkBudgetMs: 12,
  }),
  Object.freeze({
    id: 'reduced-motion-1280x720-crusher',
    viewport: Object.freeze({ width: 1280, height: 720 }),
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    reducedMotion: true,
    cause: 'crusher',
    causeLabel: 'PRESS LOCK',
    p95WorkBudgetMs: null,
  }),
]);

const FRAME_WORK_CAPACITY = 360;
const FRAME_WORK_SAMPLE_TARGET = 180;
const FRAME_WORK_TIMEOUT_MS = 30_000;
const EFFECT_CAPACITY = 636;
const STAGED_PRESENTATION_TICKS = 28;
const MEASURED_CRASH_TIMER_SECONDS = 35;
const VISIBLE_HOLD_TICKS = 112;
const VISIBLE_HOLD_MS = Math.ceil(VISIBLE_HOLD_TICKS * 1000 / 60);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function installCrashProbes(page) {
  return page.addInitScript(({ frameCapacity, textCapacity }) => {
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    const frameSamples = new Float64Array(frameCapacity);
    const frameWrappers = new WeakMap();
    let frameWriteIndex = 0;
    let frameSampleCount = 0;
    let frameTotalSampleCount = 0;
    let wrappedCallbackCount = 0;
    let frameProbeEnabled = false;

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

    function recordFrameWork(durationMs) {
      frameSamples[frameWriteIndex] = Math.max(0,
        Number.isFinite(durationMs) ? durationMs : 0);
      frameWriteIndex = frameWriteIndex + 1 === frameCapacity ? 0 : frameWriteIndex + 1;
      if (frameSampleCount < frameCapacity) frameSampleCount++;
      frameTotalSampleCount++;
    }

    function frameWorkSnapshot() {
      const sorted = new Float64Array(frameSampleCount);
      let total = 0;
      let start = frameWriteIndex - frameSampleCount;
      if (start < 0) start += frameCapacity;
      for (let offset = 0; offset < frameSampleCount; offset++) {
        const candidate = start + offset;
        const index = candidate < frameCapacity ? candidate : candidate - frameCapacity;
        const value = frameSamples[index];
        sorted[offset] = value;
        total += value;
      }
      sorted.sort();
      return Object.freeze({
        capacity: frameCapacity,
        sampleCount: frameSampleCount,
        totalSampleCount: frameTotalSampleCount,
        wrappedCallbackCount,
        meanMs: frameSampleCount ? total / frameSampleCount : 0,
        p50Ms: quantile(sorted, 0.5),
        p95Ms: quantile(sorted, 0.95),
        p99Ms: quantile(sorted, 0.99),
        maxMs: frameSampleCount ? sorted[frameSampleCount - 1] : 0,
      });
    }

    const frameProbe = Object.freeze({
      get sampleCount() { return frameSampleCount; },
      get totalSampleCount() { return frameTotalSampleCount; },
      reset() {
        frameProbeEnabled = false;
        frameSamples.fill(0);
        frameWriteIndex = 0;
        frameSampleCount = 0;
        frameTotalSampleCount = 0;
        frameProbeEnabled = true;
      },
      stopAndSnapshot() {
        frameProbeEnabled = false;
        return frameWorkSnapshot();
      },
    });
    Object.defineProperty(window, '__motoCrashFrameProbe', {
      value: frameProbe,
      configurable: false,
      enumerable: false,
      writable: false,
    });

    window.requestAnimationFrame = function measuredRequestAnimationFrame(callback) {
      if (typeof callback !== 'function') return nativeRequestAnimationFrame(callback);
      let wrapped = frameWrappers.get(callback);
      if (!wrapped) {
        wrappedCallbackCount++;
        wrapped = function measuredAnimationFrame(timestamp) {
          if (!frameProbeEnabled) return callback.call(window, timestamp);
          const startedAt = performance.now();
          try { return callback.call(window, timestamp); }
          finally { recordFrameWork(performance.now() - startedAt); }
        };
        frameWrappers.set(callback, wrapped);
      }
      return nativeRequestAnimationFrame(wrapped);
    };

    const nativeFillText = CanvasRenderingContext2D.prototype.fillText;
    const textEntries = new Array(textCapacity);
    let textWriteIndex = 0;
    let textCount = 0;
    CanvasRenderingContext2D.prototype.fillText = function observedFillText(text, ...args) {
      textEntries[textWriteIndex] = String(text);
      textWriteIndex = textWriteIndex + 1 === textCapacity ? 0 : textWriteIndex + 1;
      if (textCount < textCapacity) textCount++;
      return nativeFillText.call(this, text, ...args);
    };
    const textProbe = Object.freeze({
      reset() {
        textEntries.fill(undefined);
        textWriteIndex = 0;
        textCount = 0;
      },
      snapshot() {
        const output = new Array(textCount);
        let start = textWriteIndex - textCount;
        if (start < 0) start += textCapacity;
        for (let offset = 0; offset < textCount; offset++) {
          const candidate = start + offset;
          output[offset] = textEntries[candidate < textCapacity
            ? candidate : candidate - textCapacity];
        }
        return Object.freeze(output);
      },
    });
    Object.defineProperty(window, '__motoCanvasTextProbe', {
      value: textProbe,
      configurable: false,
      enumerable: false,
      writable: false,
    });
  }, { frameCapacity: FRAME_WORK_CAPACITY, textCapacity: 512 });
}

async function sceneSnapshot(page, resetText = false) {
  return page.evaluate(reset => {
    const api = window.__moto;
    if (reset) {
      window.__motoCanvasTextProbe.reset();
      api.renderNow();
    }
    const canvas = document.querySelector('#c');
    const context = canvas.getContext('2d');
    const colors = new Set();
    for (let row = 0; row < 8; row++) {
      for (let column = 0; column < 12; column++) {
        const x = Math.min(canvas.width - 1,
          Math.max(0, Math.floor((column + 0.5) * canvas.width / 12)));
        const y = Math.min(canvas.height - 1,
          Math.max(0, Math.floor((row + 0.5) * canvas.height / 8)));
        const pixel = context.getImageData(x, y, 1, 1).data;
        colors.add(`${pixel[0]},${pixel[1]},${pixel[2]},${pixel[3]}`);
      }
    }
    const rect = canvas.getBoundingClientRect();
    const style = getComputedStyle(canvas);
    const G = api.G;
    return {
      state: G.state,
      running: G.running,
      replayTick: G.replayTick,
      sessionTick: G.sessionTick,
      runTick: G.run?.tick,
      elapsed: G.elapsed,
      crashAge: G.crashAge,
      crashTimer: G.crashTimer,
      restartQueued: G.restartQueued,
      captureFrozen: G.captureFrozen,
      reason: G.crashReason ? { ...G.crashReason } : null,
      profile: G.crashProfile ? {
        type: G.crashProfile.type,
        label: G.crashProfile.label,
        accent: G.crashProfile.accent,
        intensity: G.crashProfile.intensity,
      } : null,
      pose: G.ragdollPose ? {
        active: G.ragdollPose.active,
        settled: G.ragdollPose.settled,
        settleReason: G.ragdollPose.settleReason,
        reducedMotion: G.ragdollPose.reducedMotion,
        elapsed: G.ragdollPose.elapsed,
        ticks: G.ragdollPose.ticks,
        contactCount: G.ragdollPose.contactCount,
        impactCount: G.ragdollPose.impactCount,
        pendingImpacts: G.ragdollPose.pendingImpacts,
        droppedImpacts: G.ragdollPose.droppedImpacts,
        peakImpact: G.ragdollPose.peakImpact,
        brokenTethers: G.ragdollPose.brokenTethers,
        invalidRecoveries: G.ragdollPose.invalidRecoveries,
        velocityClamps: G.ragdollPose.velocityClamps,
        worldClamps: G.ragdollPose.worldClamps,
        rmsSpeed: G.ragdollPose.rmsSpeed,
        peakSpeed: G.ragdollPose.peakSpeed,
        nodes: G.ragdollPose.nodes.map(node => ({ ...node })),
        links: G.ragdollPose.links.map(link => ({ ...link })),
      } : null,
      ragdoll: G.ragdoll ? {
        active: G.ragdoll.active,
        settled: G.ragdoll.settled,
        settleReason: G.ragdoll.settleReason,
        reducedMotion: G.ragdoll.reducedMotion,
      } : null,
      camera: { ...G.cam },
      crashCamera: G.crashCamera ? { ...G.crashCamera } : null,
      transients: {
        hitstop: G.hitstop,
        flash: G.flash,
        shake: G.shake,
        slow: G.slow,
        crashImpactVisuals: G.crashImpactVisuals,
      },
      effects: api.effectPoolSnapshot(),
      text: window.__motoCanvasTextProbe.snapshot(),
      canvas: {
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        uniqueSampleColors: colors.size,
        dpr: devicePixelRatio,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
      },
    };
  }, resetText);
}

function assertFiniteTree(value, label, seen = new Set()) {
  if (typeof value === 'number') {
    invariant(Number.isFinite(value), `${label} contains a non-finite number`);
    return;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    assertFiniteTree(child, `${label}.${key}`, seen);
  }
}

function assertCanvasSafe(profile, scene, phase) {
  const canvas = scene.canvas;
  const effectiveDpr = Math.min(profile.deviceScaleFactor, 2);
  invariant(canvas.clientWidth === profile.viewport.width
      && canvas.clientHeight === profile.viewport.height,
  `${profile.id} ${phase} canvas CSS size is ${canvas.clientWidth}x${canvas.clientHeight}`);
  invariant(canvas.width === Math.round(profile.viewport.width * effectiveDpr)
      && canvas.height === Math.round(profile.viewport.height * effectiveDpr),
  `${profile.id} ${phase} backing canvas is ${canvas.width}x${canvas.height}`);
  invariant(canvas.rect.x === 0 && canvas.rect.y === 0
      && canvas.rect.width === profile.viewport.width
      && canvas.rect.height === profile.viewport.height,
  `${profile.id} ${phase} canvas escaped the viewport: ${JSON.stringify(canvas.rect)}`);
  invariant(canvas.display !== 'none' && canvas.visibility !== 'hidden'
      && Number(canvas.opacity) > 0,
  `${profile.id} ${phase} canvas is not visible`);
  invariant(canvas.uniqueSampleColors >= 8,
    `${profile.id} ${phase} canvas looks blank (${canvas.uniqueSampleColors} sampled colors)`);
}

function assertRequiredPose(profile, scene) {
  invariant(scene.state === 'crashed' && scene.pose && scene.ragdoll,
    `${profile.id} did not expose a live crashed scene`);
  assert.deepEqual(scene.pose.nodes.map(node => node.id), REQUIRED_PARTS,
    `${profile.id} crash rig does not contain the exact 17-part contract`);
  invariant(scene.profile?.type === profile.cause
      && scene.profile.label === profile.causeLabel
      && scene.reason?.type === profile.cause
      && scene.reason.label === profile.causeLabel,
  `${profile.id} cause card mismatch: ${JSON.stringify({
    profile: scene.profile,
    reason: scene.reason,
  })}`);
  assertFiniteTree(scene.pose, `${profile.id}.pose`);
  assertFiniteTree(scene.camera, `${profile.id}.camera`);
  assertFiniteTree(scene.crashCamera, `${profile.id}.crashCamera`);
  invariant(scene.text.includes('CRASH THEATER'),
    `${profile.id} did not paint the Crash Theater badge`);
  invariant(scene.text.some(text => text.includes(profile.causeLabel)),
    `${profile.id} did not paint ${profile.causeLabel}`);
  invariant(scene.text.includes('Press / tap to respawn'),
    `${profile.id} did not paint the retry prompt after ${scene.crashAge.toFixed(3)} seconds`);
  invariant(scene.crashAge > 0.42,
    `${profile.id} was sampled before the retry UI reveal`);
  invariant(scene.effects.capacity === EFFECT_CAPACITY,
    `${profile.id} effect cap changed from ${EFFECT_CAPACITY} to ${scene.effects.capacity}`);
  invariant(scene.effects.active >= 0 && scene.effects.active <= EFFECT_CAPACITY
      && scene.effects.created >= 0 && scene.effects.created <= EFFECT_CAPACITY,
  `${profile.id} effect pool escaped its cap: ${JSON.stringify(scene.effects)}`);
  assertCanvasSafe(profile, scene, 'crash');
}

function stableCrashState(scene) {
  return {
    state: scene.state,
    running: scene.running,
    replayTick: scene.replayTick,
    sessionTick: scene.sessionTick,
    runTick: scene.runTick,
    elapsed: scene.elapsed,
    crashAge: scene.crashAge,
    crashTimer: scene.crashTimer,
    captureFrozen: scene.captureFrozen,
    reason: scene.reason,
    profile: scene.profile,
    pose: scene.pose,
    ragdoll: scene.ragdoll,
    camera: scene.camera,
    crashCamera: scene.crashCamera,
    transients: scene.transients,
    effects: scene.effects,
  };
}

function assertReducedMotion(profile, scene) {
  invariant(scene.pose.reducedMotion === true && scene.ragdoll.reducedMotion === true,
    `${profile.id} reduced-motion flags are missing`);
  invariant(scene.pose.ticks === 0 && scene.pose.elapsed === 0,
    `${profile.id} reduced pose advanced to tick ${scene.pose.ticks}`);
  invariant(scene.pose.active === false && scene.pose.settled === true
      && scene.pose.settleReason === 'reduced-motion'
      && scene.ragdoll.active === false && scene.ragdoll.settled === true,
  `${profile.id} reduced pose is not static and settled`);
  invariant(scene.pose.nodes.every(node => node.vx === 0 && node.vy === 0),
    `${profile.id} reduced pose contains moving parts`);
  invariant(scene.transients.hitstop === 0 && scene.transients.flash === 0
      && scene.transients.shake === 0 && scene.transients.slow === 1
      && scene.camera.roll === 0 && scene.camera.kickX === 0 && scene.camera.kickY === 0,
  `${profile.id} retained reduced-motion transients: ${JSON.stringify({
    transients: scene.transients,
    camera: scene.camera,
  })}`);
  invariant(scene.camera.viewH === scene.crashCamera.viewH,
    `${profile.id} changed zoom from ${scene.crashCamera.viewH} to ${scene.camera.viewH}`);
  invariant(scene.effects.active === 0 && scene.transients.crashImpactVisuals === 0,
    `${profile.id} emitted crash motion effects`);
}

function validateFrameWork(profile, work) {
  invariant(work.capacity === FRAME_WORK_CAPACITY,
    `${profile.id} callback-work capacity changed to ${work.capacity}`);
  invariant(work.wrappedCallbackCount === 1,
    `${profile.id} expected one animation callback identity, found ${work.wrappedCallbackCount}`);
  invariant(work.totalSampleCount >= FRAME_WORK_SAMPLE_TARGET
      && work.sampleCount === Math.min(work.totalSampleCount, work.capacity),
  `${profile.id} captured only ${work.totalSampleCount} callback-work samples`);
  const values = [work.meanMs, work.p50Ms, work.p95Ms, work.p99Ms, work.maxMs];
  invariant(values.every(value => Number.isFinite(value) && value >= 0) && work.maxMs > 0,
    `${profile.id} callback-work measurements are invalid: ${JSON.stringify(work)}`);
  invariant(work.p50Ms <= work.p95Ms && work.p95Ms <= work.p99Ms
      && work.p99Ms <= work.maxMs && work.meanMs <= work.maxMs,
  `${profile.id} callback-work percentiles are unordered: ${JSON.stringify(work)}`);
  invariant(work.p95Ms < profile.p95WorkBudgetMs,
    `${profile.id} crash callback-work p95 ${work.p95Ms.toFixed(2)} ms exceeds `
      + `${profile.p95WorkBudgetMs} ms`);
}

function assertClean(profile, diagnostics) {
  invariant(diagnostics.pageErrors.length === 0,
    `${profile.id} page errors: ${diagnostics.pageErrors.join(' | ')}`);
  invariant(diagnostics.consoleErrors.length === 0,
    `${profile.id} console errors: ${diagnostics.consoleErrors.join(' | ')}`);
  invariant(diagnostics.failedRequests.length === 0,
    `${profile.id} failed requests: ${diagnostics.failedRequests.join(' | ')}`);
  invariant(diagnostics.badResponses.length === 0,
    `${profile.id} bad responses: ${diagnostics.badResponses.join(' | ')}`);
}

async function runProfile(browser, baseUrl, profile) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    reducedMotion: profile.reducedMotion ? 'reduce' : 'no-preference',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await installCrashProbes(page);
  const diagnostics = {
    pageErrors: [],
    consoleErrors: [],
    failedRequests: [],
    badResponses: [],
  };
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
  });
  page.on('requestfailed', request => {
    diagnostics.failedRequests.push(`${request.method()} ${request.url()} `
      + `(${request.failure()?.errorText || 'unknown failure'})`);
  });
  page.on('response', response => {
    if (response.status() >= 400) {
      diagnostics.badResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  try {
    await page.goto(`${baseUrl}/index.html?dev&capture${profile.hasTouch ? '&touch' : ''}`, {
      waitUntil: 'load',
      timeout: 15_000,
    });
    await page.waitForFunction(
      () => window.__moto?.G?.state === 'menu'
        && typeof window.__moto.stageCrash === 'function'
        && typeof window.__moto.stepTicks === 'function'
        && typeof window.__moto.freezePresentation === 'function'
        && window.__motoCanvasTextProbe
        && window.__motoCrashFrameProbe,
      undefined,
      { timeout: 15_000 },
    );

    const staged = await page.evaluate(({ options, measuredCrashTimer }) => {
      const api = window.__moto;
      const result = api.stageCrash(options);
      // Keep the exact crashed simulation path live long enough to collect a
      // stable callback-work window on slow hosted runners. Manual retry and
      // the separate 112-tick frozen-review assertion still test cleanup.
      api.G.crashTimer = measuredCrashTimer;
      const frozen = api.freezePresentation(false);
      window.__motoCanvasTextProbe.reset();
      api.renderNow();
      window.__motoCrashFrameProbe.reset();
      return { result, frozen };
    }, {
      measuredCrashTimer: MEASURED_CRASH_TIMER_SECONDS,
      options: {
        levelIndex: 15,
        type: profile.cause,
        reducedMotion: profile.reducedMotion,
        warmupTicks: 18,
        presentationTicks: STAGED_PRESENTATION_TICKS,
        intensity: 1,
      },
    });
    invariant(staged.result.ok && staged.result.state === 'crashed' && staged.frozen === false,
      `${profile.id} could not stage a live crash: ${JSON.stringify(staged)}`);

    const initial = await sceneSnapshot(page);
    assertRequiredPose(profile, initial);
    if (profile.reducedMotion) assertReducedMotion(profile, initial);

    let frameWork = null;
    if (profile.p95WorkBudgetMs != null) {
      try {
        await page.waitForFunction(
          target => window.__motoCrashFrameProbe.totalSampleCount >= target,
          FRAME_WORK_SAMPLE_TARGET,
          { timeout: FRAME_WORK_TIMEOUT_MS, polling: 50 },
        );
      } catch (error) {
        const captured = await page.evaluate(
          () => window.__motoCrashFrameProbe.totalSampleCount,
        ).catch(() => 0);
        throw new Error(`${profile.id} captured ${captured}/${FRAME_WORK_SAMPLE_TARGET} `
          + `live crash callbacks within ${FRAME_WORK_TIMEOUT_MS} ms: `
          + `${error instanceof Error ? error.message : String(error)}`);
      }
      frameWork = await page.evaluate(() => window.__motoCrashFrameProbe.stopAndSnapshot());
      validateFrameWork(profile, frameWork);
    } else {
      await page.waitForFunction(
        age => window.__moto.G.crashAge >= age + 0.25,
        initial.crashAge,
        { timeout: 5_000, polling: 25 },
      );
    }

    const live = await sceneSnapshot(page, true);
    assertRequiredPose(profile, live);
    invariant(live.captureFrozen === false && live.crashAge > initial.crashAge
        && live.sessionTick > initial.sessionTick
        && live.crashTimer < MEASURED_CRASH_TIMER_SECONDS,
    `${profile.id} did not advance the live crashed session: ${JSON.stringify({
      initialAge: initial.crashAge,
      liveAge: live.crashAge,
      initialSessionTick: initial.sessionTick,
      liveSessionTick: live.sessionTick,
      crashTimer: live.crashTimer,
    })}`);
    if (profile.reducedMotion) assertReducedMotion(profile, live);
    else invariant(live.pose.ticks > initial.pose.ticks,
      `${profile.id} ragdoll did not advance during measured crash work`);

    const frozen = await page.evaluate(() => {
      const api = window.__moto;
      const didFreeze = api.freezePresentation(true);
      window.__motoCanvasTextProbe.reset();
      api.renderNow();
      return didFreeze;
    });
    invariant(frozen === true, `${profile.id} could not freeze its review frame`);
    const frozenInitial = await sceneSnapshot(page);
    assertRequiredPose(profile, frozenInitial);
    await page.waitForTimeout(VISIBLE_HOLD_MS);
    const held = await sceneSnapshot(page, true);
    assertRequiredPose(profile, held);
    assert.deepEqual(stableCrashState(held), stableCrashState(frozenInitial),
      `${profile.id} auto-advanced during the ${VISIBLE_HOLD_TICKS}-tick visible review window`);
    if (profile.reducedMotion) assertReducedMotion(profile, held);

    await page.dispatchEvent('#c', 'pointerdown', {
      pointerId: profile.hasTouch ? 818 : 817,
      pointerType: profile.hasTouch ? 'touch' : 'mouse',
      clientX: profile.viewport.width / 2,
      clientY: profile.viewport.height / 2,
      bubbles: true,
    });
    await page.dispatchEvent('#c', 'pointerup', {
      pointerId: profile.hasTouch ? 818 : 817,
      pointerType: profile.hasTouch ? 'touch' : 'mouse',
      clientX: profile.viewport.width / 2,
      clientY: profile.viewport.height / 2,
      bubbles: true,
    });
    const retry = await page.evaluate(() => {
      const api = window.__moto;
      const queued = api.G.restartQueued;
      const step = api.stepTicks(1);
      window.__motoCanvasTextProbe.reset();
      api.renderNow();
      return { queued, step };
    });
    invariant(retry.queued === true && retry.step.ok && retry.step.state === 'playing',
      `${profile.id} canvas retry did not respawn: ${JSON.stringify(retry)}`);
    const respawned = await sceneSnapshot(page);
    invariant(respawned.state === 'playing' && respawned.running === true
        && respawned.pose === null && respawned.ragdoll === null
        && respawned.profile === null && respawned.reason === null
        && respawned.crashCamera === null && respawned.restartQueued === false
        && respawned.crashAge === 0 && respawned.crashTimer === 0,
    `${profile.id} retry left crash presentation state behind: ${JSON.stringify({
      state: respawned.state,
      running: respawned.running,
      pose: respawned.pose,
      ragdoll: respawned.ragdoll,
      profile: respawned.profile,
      reason: respawned.reason,
      crashCamera: respawned.crashCamera,
      restartQueued: respawned.restartQueued,
      crashAge: respawned.crashAge,
      crashTimer: respawned.crashTimer,
    })}`);
    invariant(!respawned.text.includes('CRASH THEATER')
        && !respawned.text.some(text => text.includes(profile.causeLabel)),
    `${profile.id} retry left the cause card painted on the canvas`);
    assertCanvasSafe(profile, respawned, 'respawn');
    assertClean(profile, diagnostics);

    return { initial, live, held, respawned, frameWork };
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
  for (const profile of PROFILES) {
    const report = await runProfile(browser, server.baseUrl, profile);
    const pose = report.live.pose;
    const work = report.frameWork;
    console.log(`${profile.id}: ${pose.nodes.length} parts, ${pose.ticks} pose ticks, `
      + `${pose.contactCount} contacts, live-measured then held ${VISIBLE_HOLD_TICKS} ticks, retry passed`
      + (work ? `; callback-work p95 ${work.p95Ms.toFixed(2)} ms `
        + `(< ${profile.p95WorkBudgetMs} ms), ${work.sampleCount} samples` : ''));
  }
  console.log('Moto Rush X3 Crash Theater browser gate passed.');
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await server.close().catch(() => {});
}

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

const NARROW_VIEWPORT = Object.freeze({ width: 320, height: 568 });
const FRAME_WORK_CAPACITY = 240;
const FRAME_WORK_SAMPLE_TARGET = 120;
const FRAME_WORK_TIMEOUT_MS = 8_000;
const UI_WAIT_TIMEOUT_MS = 3_000;
const REQUIRED_CANVAS_TEXT = Object.freeze([
  'RAW CLOCK',
  'FLIP CREDIT',
  'NET LOCK',
  'SCORE RECEIPT',
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function installResultsProbes(page) {
  return page.addInitScript(({ frameCapacity, textCapacity }) => {
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    const samples = new Float64Array(frameCapacity);
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
      writeIndex = writeIndex + 1 === frameCapacity ? 0 : writeIndex + 1;
      if (sampleCount < frameCapacity) sampleCount++;
      totalSampleCount++;
    }

    function snapshot() {
      const sorted = new Float64Array(sampleCount);
      let total = 0;
      let start = writeIndex - sampleCount;
      if (start < 0) start += frameCapacity;
      for (let offset = 0; offset < sampleCount; offset++) {
        const candidate = start + offset;
        const index = candidate < frameCapacity ? candidate : candidate - frameCapacity;
        const value = samples[index];
        sorted[offset] = value;
        total += value;
      }
      sorted.sort();
      return Object.freeze({
        capacity: frameCapacity,
        sampleCount,
        totalSampleCount,
        wrappedCallbackCount,
        meanMs: sampleCount ? total / sampleCount : 0,
        p50Ms: quantile(sorted, 0.5),
        p95Ms: quantile(sorted, 0.95),
        p99Ms: quantile(sorted, 0.99),
        maxMs: sampleCount ? sorted[sampleCount - 1] : 0,
      });
    }

    const frameProbe = Object.freeze({
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
        return snapshot();
      },
    });
    Object.defineProperty(window, '__motoResultsFrameProbe', {
      value: frameProbe,
      configurable: false,
      enumerable: false,
      writable: false,
    });

    window.requestAnimationFrame = function measuredRequestAnimationFrame(callback) {
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
        const result = new Array(textCount);
        let start = textWriteIndex - textCount;
        if (start < 0) start += textCapacity;
        for (let offset = 0; offset < textCount; offset++) {
          const candidate = start + offset;
          result[offset] = textEntries[candidate < textCapacity
            ? candidate : candidate - textCapacity];
        }
        return Object.freeze(result);
      },
    });
    Object.defineProperty(window, '__motoResultsTextProbe', {
      value: textProbe,
      configurable: false,
      enumerable: false,
      writable: false,
    });

    const buttons = Array.from({ length: 17 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    }));
    const axes = [0, 0, 0, 0];
    const gamepad = {
      id: 'Moto Rush X3 Results Gate Pad',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      buttons,
      axes,
      vibrationActuator: null,
    };
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [gamepad, null, null, null],
      configurable: true,
    });
    const testPad = Object.freeze({
      setButton(index, down) {
        const button = buttons[index];
        if (!button) return false;
        button.pressed = down === true;
        button.touched = down === true;
        button.value = down === true ? 1 : 0;
        gamepad.timestamp = performance.now();
        return true;
      },
      setAxis(index, value) {
        if (!Number.isInteger(index) || index < 0 || index >= axes.length) return false;
        axes[index] = Math.max(-1, Math.min(1, Number(value) || 0));
        gamepad.timestamp = performance.now();
        return true;
      },
      reset() {
        for (const button of buttons) {
          button.pressed = false;
          button.touched = false;
          button.value = 0;
        }
        axes.fill(0);
        gamepad.timestamp = performance.now();
      },
      snapshot() {
        return Object.freeze({
          id: gamepad.id,
          mapping: gamepad.mapping,
          timestamp: gamepad.timestamp,
          buttons: Object.freeze(buttons.map(button => button.pressed)),
          axes: Object.freeze(axes.slice()),
        });
      },
    });
    Object.defineProperty(window, '__motoResultsPad', {
      value: testPad,
      configurable: false,
      enumerable: false,
      writable: false,
    });
  }, { frameCapacity: FRAME_WORK_CAPACITY, textCapacity: 1024 });
}

function assertDiagnostics(profile, diagnostics) {
  invariant(diagnostics.pageErrors.length === 0,
    `${profile.id} page errors: ${diagnostics.pageErrors.join(' | ')}`);
  invariant(diagnostics.consoleErrors.length === 0,
    `${profile.id} console errors: ${diagnostics.consoleErrors.join(' | ')}`);
  invariant(diagnostics.failedRequests.length === 0,
    `${profile.id} failed requests: ${diagnostics.failedRequests.join(' | ')}`);
  invariant(diagnostics.badResponses.length === 0,
    `${profile.id} bad responses: ${diagnostics.badResponses.join(' | ')}`);
}

async function setPadButton(page, index, down) {
  const changed = await page.evaluate(({ button, pressed }) =>
    window.__motoResultsPad.setButton(button, pressed), { button: index, pressed: down });
  invariant(changed, `test gamepad button ${index} could not be changed`);
}

function waitForUi(page, predicate, argument) {
  return page.waitForFunction(predicate, argument, { timeout: UI_WAIT_TIMEOUT_MS });
}

async function resetPad(page) {
  await page.evaluate(() => window.__motoResultsPad.reset());
  await waitForUi(page, () => {
    const held = window.__moto.runtimeSnapshot().uiInput.held;
    return Object.values(held).every(value => value === false);
  });
}

async function stageFinish(page, options = {}) {
  return page.evaluate(stageOptions => {
    window.__motoResultsTextProbe.reset();
    const staged = window.__moto.stageFinish({
      levelIndex: 0,
      elapsed: 18.75,
      flipBonus: 1.5,
      trickScore: 900,
      flowScore: 420,
      riskScore: 180,
      stars: 3,
      unlocked: 2,
      previousBestTime: 18.09,
      previousBestScore: 1380,
      presentationTime: 2,
      ...stageOptions,
    });
    window.__moto.renderNow();
    return {
      staged,
      finish: window.__moto.finishSnapshot(),
      ui: window.__moto.uiSnapshot(),
      runtime: window.__moto.runtimeSnapshot(),
      effects: window.__moto.effectPoolSnapshot(),
      text: window.__motoResultsTextProbe.snapshot(),
    };
  }, options);
}

async function stageMissingNext(page) {
  return page.evaluate(() => {
    const api = window.__moto;
    const nextLevel = api.levels[1];
    api.levels[1] = null;
    let staged;
    try {
      window.__motoResultsTextProbe.reset();
      staged = api.stageFinish({
        levelIndex: 0,
        elapsed: 18.75,
        flipBonus: 1.5,
        trickScore: 900,
        flowScore: 420,
        riskScore: 180,
        stars: 3,
        unlocked: 2,
        replayAvailable: false,
        presentationTime: 2,
      });
      api.renderNow();
      return {
        staged,
        finish: api.finishSnapshot(),
        ui: api.uiSnapshot(),
        text: window.__motoResultsTextProbe.snapshot(),
      };
    } finally {
      api.levels[1] = nextLevel;
    }
  });
}

async function semanticSnapshot(page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('#semantic-results');
    const canvas = document.querySelector('#c');
    return {
      hidden: dialog.hidden,
      role: dialog.getAttribute('role'),
      modal: dialog.getAttribute('aria-modal'),
      labelledBy: dialog.getAttribute('aria-labelledby'),
      title: document.querySelector('#semantic-results-title')?.textContent || '',
      summary: document.querySelector('#semantic-results-summary')?.textContent || '',
      actions: [...document.querySelectorAll('#semantic-results-actions button')].map(button => ({
        id: button.dataset.action || '',
        label: button.textContent || '',
        disabled: button.disabled,
        type: button.type,
      })),
      canvasLabel: canvas.getAttribute('aria-label') || '',
      activeElement: document.activeElement?.id || '',
      activeAction: document.activeElement?.dataset?.action || '',
    };
  });
}

function assertReceipt(profile, scene, semantic) {
  const report = scene.finish.report;
  invariant(scene.staged.ok && scene.finish.state === 'finished' && report,
    `${profile.id} could not stage Finish Forge`);
  invariant(report.timing.grossMs === 18_750 && report.timing.bonusMs === 1_500
      && report.timing.netMs === 17_250,
  `${profile.id} timing receipt is not authoritative: ${JSON.stringify(report.timing)}`);
  invariant(report.score.total === 1_500 && report.score.receipt.total === 1_500,
    `${profile.id} score receipt does not reconcile`);
  invariant(report.score.receipt.items.reduce((total, item) => total + item.points, 0) === 1_500,
    `${profile.id} itemized score does not add to the total`);
  invariant(report.stars === 3 && report.level.index === 0 && report.nextRoute.index === 1,
    `${profile.id} staged result metadata is wrong`);

  invariant(semantic.hidden === false && semantic.role === 'dialog'
      && semantic.modal === 'true' && semantic.labelledBy === 'semantic-results-title',
  `${profile.id} semantic results dialog is not exposed`);
  invariant(semantic.title === 'Finish Forge run receipt',
    `${profile.id} semantic title changed: ${semantic.title}`);
  const expectedSummary = `${report.level.name}. Net time 17.25. 3 stars. Score 1500.`;
  invariant(semantic.summary === expectedSummary,
    `${profile.id} semantic summary changed: ${semantic.summary}`);
  invariant(semantic.canvasLabel.includes(expectedSummary)
      && semantic.canvasLabel.includes('Enter to activate'),
  `${profile.id} canvas does not expose the receipt and controls`);

  const expectedActions = report.actions.map(action => ({
    id: action.id,
    label: action.label,
    disabled: !action.enabled,
    type: 'button',
  }));
  invariant(JSON.stringify(semantic.actions) === JSON.stringify(expectedActions),
    `${profile.id} semantic actions disagree with the report: `
      + `${JSON.stringify({ expectedActions, actual: semantic.actions })}`);

  invariant(scene.text.some(text => text.startsWith('FINISH FORGE  //  RUN 01')),
    `${profile.id} did not paint the Finish Forge header`);
  for (const label of REQUIRED_CANVAS_TEXT) {
    invariant(scene.text.includes(label), `${profile.id} did not paint ${label}`);
  }
  for (const action of report.actions) {
    invariant(scene.text.includes(action.label),
      `${profile.id} did not paint result action ${action.label}`);
  }
}

function rectanglesOverlap(a, b) {
  const horizontal = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const vertical = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return horizontal > 0.01 && vertical > 0.01;
}

function assertActionGeometry(label, finish, ui, expectedViewport) {
  invariant(ui.viewport.width === expectedViewport.width
      && ui.viewport.height === expectedViewport.height,
  `${label} viewport snapshot is ${ui.viewport.width}x${ui.viewport.height}`);
  invariant(ui.viewport.canvasWidth === Math.round(expectedViewport.width * ui.viewport.dpr)
      && ui.viewport.canvasHeight === Math.round(expectedViewport.height * ui.viewport.dpr),
  `${label} backing canvas does not match CSS pixels and DPR`);
  const enabledIds = finish.report.actions
    .filter(action => action.enabled)
    .map(action => action.id)
    .sort();
  const buttonIds = ui.buttons.map(button => button.id).sort();
  invariant(new Set(buttonIds).size === buttonIds.length,
    `${label} registered duplicate result buttons: ${buttonIds.join(', ')}`);
  invariant(JSON.stringify(buttonIds) === JSON.stringify(enabledIds),
    `${label} canvas buttons disagree with enabled report actions: `
      + `${JSON.stringify({ enabledIds, buttonIds })}`);
  for (const button of ui.buttons) {
    invariant(button.w >= 44 && button.h >= 44,
      `${label} ${button.id} target is only ${button.w.toFixed(1)}x${button.h.toFixed(1)}`);
    invariant(button.x >= -0.01 && button.y >= -0.01
        && button.x + button.w <= ui.viewport.width + 0.01
        && button.y + button.h <= ui.viewport.height + 0.01,
    `${label} ${button.id} target is clipped: ${JSON.stringify(button)}`);
  }
  for (let first = 0; first < ui.buttons.length; first++) {
    for (let second = first + 1; second < ui.buttons.length; second++) {
      invariant(!rectanglesOverlap(ui.buttons[first], ui.buttons[second]),
        `${label} ${ui.buttons[first].id}/${ui.buttons[second].id} targets overlap`);
    }
  }
  return ui.buttons.length;
}

async function assertFinishReset(page, label, expectedLevel) {
  const snapshot = await page.evaluate(() => ({
    finish: window.__moto.finishSnapshot(),
    runtime: window.__moto.runtimeSnapshot(),
    effects: window.__moto.effectPoolSnapshot(),
    semantic: {
      hidden: document.querySelector('#semantic-results').hidden,
      actionCount: document.querySelectorAll('#semantic-results-actions button').length,
      canvasLabel: document.querySelector('#c').getAttribute('aria-label'),
    },
  }));
  invariant(snapshot.finish.state === 'playing' && snapshot.finish.levelIndex === expectedLevel,
    `${label} did not start level ${expectedLevel + 1}`);
  invariant(snapshot.finish.report === null && snapshot.finish.focusedAction === null
      && snapshot.runtime.presentation.finishTimer === 0
      && snapshot.runtime.presentation.finishFocus === -1
      && snapshot.runtime.presentation.restartQueued === false
      && snapshot.runtime.presentation.ragdoll === false
      && snapshot.runtime.presentation.crashWorld === false
      && snapshot.runtime.presentation.crashImpacts === 0,
  `${label} left Finish Forge presentation residue: ${JSON.stringify(snapshot.runtime.presentation)}`);
  invariant(snapshot.effects.active === 0,
    `${label} left ${snapshot.effects.active} pooled effects active`);
  invariant(snapshot.semantic.hidden && snapshot.semantic.actionCount === 0
      && snapshot.semantic.canvasLabel === 'Moto Rush X3 motorcycle racing game',
  `${label} left semantic result residue: ${JSON.stringify(snapshot.semantic)}`);
}

function validateFrameWork(profile, work) {
  invariant(work.capacity === FRAME_WORK_CAPACITY,
    `${profile.id} callback-work capacity changed to ${work.capacity}`);
  // The perpetual game frame plus the one-shot live-region announcer are the
  // only callback identities expected on this screen.
  invariant(work.wrappedCallbackCount >= 1 && work.wrappedCallbackCount <= 2,
    `${profile.id} expected at most two animation callback identities, found `
      + `${work.wrappedCallbackCount}`);
  invariant(work.totalSampleCount >= FRAME_WORK_SAMPLE_TARGET
      && work.sampleCount === Math.min(work.totalSampleCount, work.capacity),
  `${profile.id} captured only ${work.totalSampleCount} Finish Forge callbacks`);
  const values = [work.meanMs, work.p50Ms, work.p95Ms, work.p99Ms, work.maxMs];
  invariant(values.every(value => Number.isFinite(value) && value >= 0) && work.maxMs > 0,
    `${profile.id} callback-work values are invalid: ${JSON.stringify(work)}`);
  invariant(work.p50Ms <= work.p95Ms && work.p95Ms <= work.p99Ms
      && work.p99Ms <= work.maxMs && work.meanMs <= work.maxMs,
  `${profile.id} callback-work percentiles are unordered: ${JSON.stringify(work)}`);
  invariant(work.p95Ms < profile.p95WorkBudgetMs,
    `${profile.id} Finish Forge callback-work p95 ${work.p95Ms.toFixed(2)} ms exceeds `
      + `${profile.p95WorkBudgetMs} ms`);
}

async function measureFinishWork(page, profile) {
  await page.evaluate(() => window.__motoResultsFrameProbe.reset());
  try {
    await page.waitForFunction(
      target => window.__motoResultsFrameProbe.totalSampleCount >= target,
      FRAME_WORK_SAMPLE_TARGET,
      { timeout: FRAME_WORK_TIMEOUT_MS, polling: 25 },
    );
  } catch (error) {
    const captured = await page.evaluate(
      () => window.__motoResultsFrameProbe.totalSampleCount,
    ).catch(() => 0);
    throw new Error(`${profile.id} captured ${captured}/${FRAME_WORK_SAMPLE_TARGET} `
      + `Finish Forge callbacks within ${FRAME_WORK_TIMEOUT_MS} ms: `
      + `${error instanceof Error ? error.message : String(error)}`);
  }
  const work = await page.evaluate(() => window.__motoResultsFrameProbe.stopAndSnapshot());
  validateFrameWork(profile, work);
  return work;
}

async function runKeyboardRoute(page, profile) {
  await resetPad(page);
  let scene = await stageFinish(page, {
    replayAvailable: false,
    previousBestTime: null,
  });
  invariant(scene.finish.focusedAction === 'next',
    `${profile.id} keyboard scene did not prefer NEXT`);
  let semantic = await semanticSnapshot(page);
  invariant(semantic.activeAction === 'next',
    `${profile.id} semantic dialog did not initially focus NEXT`);
  await page.keyboard.press('Tab');
  await waitForUi(page, () => window.__moto.finishSnapshot().focusedAction === 'menu');
  semantic = await semanticSnapshot(page);
  invariant(semantic.activeAction === 'menu',
    `${profile.id} native Tab did not advance to MENU`);
  await page.keyboard.press('Shift+Tab');
  await waitForUi(page, () => window.__moto.finishSnapshot().focusedAction === 'next');
  await page.keyboard.press('ArrowLeft');
  await waitForUi(page, () => window.__moto.finishSnapshot().focusedAction === 'retry');
  semantic = await semanticSnapshot(page);
  invariant(semantic.activeAction === 'retry',
    `${profile.id} semantic arrow navigation did not synchronize RETRY focus`);
  const repeated = await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', repeat: true, bubbles: true, cancelable: true,
    });
    const accepted = document.activeElement.dispatchEvent(event);
    return { accepted, defaultPrevented: event.defaultPrevented, state: window.__moto.G.state };
  });
  invariant(!repeated.accepted && repeated.defaultPrevented && repeated.state === 'finished',
    `${profile.id} repeated Enter crossed the result boundary: ${JSON.stringify(repeated)}`);
  await page.keyboard.press('Enter');
  await waitForUi(page, () => window.__moto.G.state === 'playing');
  await assertFinishReset(page, `${profile.id} native semantic Enter retry`, 0);

  scene = await stageFinish(page, { replayAvailable: false, previousBestTime: null });
  semantic = await semanticSnapshot(page);
  invariant(semantic.activeAction === 'next',
    `${profile.id} semantic dialog did not restore initial focus before shortcut test`);
  await page.keyboard.press('KeyR');
  await waitForUi(page, () => window.__moto.G.state === 'playing');
  await assertFinishReset(page, `${profile.id} result-button-focused R retry`, 0);

  scene = await stageFinish(page, { replayAvailable: false, previousBestTime: null });
  invariant(scene.finish.focusedAction === 'next',
    `${profile.id} second keyboard scene did not prefer NEXT`);
  await page.locator('#c').focus();
  semantic = await semanticSnapshot(page);
  invariant(semantic.activeElement === 'c', `${profile.id} canvas did not take keyboard focus`);
  await page.keyboard.press('ArrowLeft');
  await waitForUi(page, () => window.__moto.finishSnapshot().focusedAction === 'retry');
  await page.keyboard.press('Enter');
  await waitForUi(page, () => window.__moto.G.state === 'playing');
  await assertFinishReset(page, `${profile.id} keyboard Enter retry`, 0);
}

async function runMissingAndLockedRoutes(page, profile) {
  await resetPad(page);
  const locked = await stageFinish(page, {
    levelIndex: 1,
    unlocked: 2,
    replayAvailable: false,
  });
  const lockedSemantic = await semanticSnapshot(page);
  invariant(locked.finish.report.nextRoute.available === false
      && locked.finish.report.nextRoute.reason === 'next-locked'
      && !locked.finish.report.actions.some(action => action.id === 'next'),
  `${profile.id} exposed a locked next route`);
  invariant(lockedSemantic.actions.some(action => action.id === 'replay' && action.disabled)
      && !locked.ui.buttons.some(button => button.id === 'replay' || button.id === 'next'),
  `${profile.id} exposed a missing replay or locked route as a canvas target`);
  invariant(locked.finish.focusedAction === 'retry',
    `${profile.id} did not fall back to RETRY when NEXT was locked`);
  await page.locator('#c').focus();
  await page.keyboard.press('ArrowRight');
  await waitForUi(page, () => window.__moto.finishSnapshot().focusedAction === 'menu');
  await page.keyboard.press('ArrowLeft');
  await waitForUi(page, () => window.__moto.finishSnapshot().focusedAction === 'retry');

  const missing = await stageMissingNext(page);
  invariant(missing.staged.ok
      && missing.finish.report.nextRoute.available === false
      && missing.finish.report.nextRoute.reason === 'next-missing'
      && !missing.finish.report.actions.some(action => action.id === 'next'),
  `${profile.id} did not safely suppress a missing next route`);

  await stageFinish(page, { previousBestTime: null });
  await page.evaluate(() => { window.__moto.G.replayToken = null; });
  await page.locator('#c').focus();
  await page.keyboard.press('ArrowLeft');
  await waitForUi(page, () => window.__moto.finishSnapshot().focusedAction === 'replay');
  await page.keyboard.press('Enter');
  await waitForUi(page, () => window.__moto.G.replayNotice?.life > 0);
  const safe = await page.evaluate(() => ({
    state: window.__moto.G.state,
    focusedAction: window.__moto.finishSnapshot().focusedAction,
    notice: window.__moto.G.replayNotice,
  }));
  invariant(safe.state === 'finished' && safe.focusedAction === 'replay'
      && typeof safe.notice?.message === 'string',
  `${profile.id} unsafe missing-proof route: ${JSON.stringify(safe)}`);
}

async function runGamepadRoute(page, profile) {
  await resetPad(page);
  const scene = await stageFinish(page, { previousBestTime: null });
  invariant(scene.finish.focusedAction === 'next',
    `${profile.id} gamepad scene did not prefer NEXT`);
  const pad = await page.evaluate(() => window.__motoResultsPad.snapshot());
  invariant(pad.mapping === 'standard' && pad.id.includes('Results Gate Pad'),
    `${profile.id} did not install a standard fake gamepad`);

  await setPadButton(page, 15, true);
  await waitForUi(page, () => window.__moto.finishSnapshot().focusedAction === 'menu');
  const heldFocus = await page.evaluate(() => window.__moto.finishSnapshot().focusedAction);
  await page.waitForTimeout(120);
  invariant(await page.evaluate(() => window.__moto.finishSnapshot().focusedAction) === heldFocus,
    `${profile.id} held d-pad generated repeated navigation edges`);
  await setPadButton(page, 15, false);
  await waitForUi(page, () => window.__moto.runtimeSnapshot().uiInput.held.right === false);

  await setPadButton(page, 14, true);
  await waitForUi(page, () => window.__moto.finishSnapshot().focusedAction === 'next');
  await setPadButton(page, 14, false);
  await waitForUi(page, () => window.__moto.runtimeSnapshot().uiInput.held.left === false);

  await setPadButton(page, 0, true);
  await waitForUi(page, () => window.__moto.G.state === 'playing'
    && window.__moto.G.levelIdx === 1);
  await waitForUi(page, () => window.__moto.runtimeSnapshot().uiInput.held.confirm === true);
  await assertFinishReset(page, `${profile.id} gamepad A next`, 1);

  await stageFinish(page, { previousBestTime: null });
  const heldPollStart = await page.evaluate(() => window.__moto.runtimeSnapshot().uiInput.polls);
  await waitForUi(page,
    start => window.__moto.runtimeSnapshot().uiInput.polls >= start + 4, heldPollStart);
  const heldA = await page.evaluate(() => ({
    finish: window.__moto.finishSnapshot(),
    held: window.__moto.runtimeSnapshot().uiInput.held.confirm,
  }));
  invariant(heldA.finish.state === 'finished' && heldA.held === true,
    `${profile.id} a held A button dismissed newly opened results: ${JSON.stringify(heldA)}`);

  await setPadButton(page, 0, false);
  await waitForUi(page, () => window.__moto.runtimeSnapshot().uiInput.held.confirm === false);
  await setPadButton(page, 1, true);
  await waitForUi(page, () => window.__moto.G.state === 'menu');
  const menu = await page.evaluate(() => ({
    state: window.__moto.G.state,
    focus: window.__moto.G.finishFocus,
    hidden: document.querySelector('#semantic-results').hidden,
    actions: document.querySelectorAll('#semantic-results-actions button').length,
  }));
  invariant(menu.state === 'menu' && menu.focus === -1 && menu.hidden && menu.actions === 0,
    `${profile.id} gamepad B did not return cleanly to the menu`);
  await setPadButton(page, 1, false);
}

async function runReducedMotion(page, profile) {
  await resetPad(page);
  const scene = await stageFinish(page, {
    reducedMotion: true,
    presentationTime: 0,
  });
  const semantic = await semanticSnapshot(page);
  assertReceipt(profile, scene, semantic);
  const presentation = scene.runtime.presentation;
  invariant(scene.finish.reducedMotion === true && scene.finish.finishTimer === 10,
    `${profile.id} reduced-motion receipt was not fully revealed immediately`);
  invariant(scene.effects.active === 0
      && presentation.shake === 0
      && presentation.flash === 0
      && presentation.slow === 1
      && presentation.hitstop === 0,
  `${profile.id} reduced-motion finish retained effects: ${JSON.stringify({
    effects: scene.effects,
    presentation,
  })}`);
}

async function runTouchAndNarrow(page, profile) {
  await resetPad(page);
  await page.setViewportSize(NARROW_VIEWPORT);
  await waitForUi(page,
    ({ width, height }) => window.__moto.uiSnapshot().viewport.width === width
      && window.__moto.uiSnapshot().viewport.height === height,
    NARROW_VIEWPORT);
  const scene = await stageFinish(page);
  const semantic = await semanticSnapshot(page);
  assertReceipt({ ...profile, id: `${profile.id}/320x568` }, scene, semantic);
  const targets = assertActionGeometry(`${profile.id}/320x568`, scene.finish, scene.ui,
    NARROW_VIEWPORT);
  const retry = scene.ui.buttons.find(button => button.id === 'retry');
  invariant(retry, `${profile.id}/320x568 has no Retry touch target`);
  await page.touchscreen.tap(retry.x + retry.w / 2, retry.y + retry.h / 2);
  await waitForUi(page, () => window.__moto.G.state === 'playing');
  await assertFinishReset(page, `${profile.id}/320x568 touch-center retry`, 0);
  await page.setViewportSize(profile.viewport);
  await waitForUi(page,
    ({ width, height }) => window.__moto.uiSnapshot().viewport.width === width
      && window.__moto.uiSnapshot().viewport.height === height,
    profile.viewport);
  return targets;
}

async function runProfile(browser, baseUrl, profile) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    reducedMotion: 'no-preference',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await installResultsProbes(page);
  const diagnostics = {
    pageErrors: [],
    consoleErrors: [],
    failedRequests: [],
    badResponses: [],
  };
  page.on('pageerror', error => diagnostics.pageErrors.push(
    error instanceof Error ? error.message : String(error)));
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
        && typeof window.__moto.stageFinish === 'function'
        && typeof window.__moto.finishSnapshot === 'function'
        && typeof window.__moto.uiSnapshot === 'function'
        && window.__motoResultsFrameProbe
        && window.__motoResultsTextProbe
        && window.__motoResultsPad,
      undefined,
      { timeout: 15_000 },
    );

    const scene = await stageFinish(page);
    const semantic = await semanticSnapshot(page);
    assertReceipt(profile, scene, semantic);
    invariant(scene.ui.viewport.dpr === profile.deviceScaleFactor,
      `${profile.id} DPR ${scene.ui.viewport.dpr} does not match ${profile.deviceScaleFactor}`);
    const targets = assertActionGeometry(profile.id, scene.finish, scene.ui, profile.viewport);
    const work = await measureFinishWork(page, profile);

    await runKeyboardRoute(page, profile);
    await runMissingAndLockedRoutes(page, profile);
    if (!profile.isMobile) {
      await runGamepadRoute(page, profile);
      await runReducedMotion(page, profile);
    }

    let narrowTargets = null;
    if (profile.hasTouch) narrowTargets = await runTouchAndNarrow(page, profile);
    assertDiagnostics(profile, diagnostics);
    return { targets, narrowTargets, semanticActions: semantic.actions.length, work };
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
    console.log(`${profile.id}: ${report.semanticActions} semantic actions, `
      + `${report.targets} enabled >=44px targets, callback-work p95 `
      + `${report.work.p95Ms.toFixed(2)} ms (< ${profile.p95WorkBudgetMs} ms), `
      + `${report.work.sampleCount} samples`
      + (report.narrowTargets == null
        ? '; keyboard + standard gamepad routes passed'
        : `; 320x568 ${report.narrowTargets} targets + touch-center retry passed`));
  }
  console.log('Moto Rush X3 Finish Forge browser gate passed.');
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await server.close().catch(() => {});
}

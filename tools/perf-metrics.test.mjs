import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PERFORMANCE_EVENT,
  createPerformanceMetrics,
  recordPerformanceEvent,
  recordPerformanceFrame,
  recordPerformanceViewport,
  resetPerformanceMetrics,
  snapshotPerformanceMetrics,
} from '../public/perf-metrics.js';

function near(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`);
}

test('exact frame quantiles and loop pressure counters are deterministic', () => {
  const metrics = createPerformanceMetrics({ capacity: 8, slowFrameMs: 20 });
  recordPerformanceFrame(metrics, 10, 1, 0, 0, 0, 2, 8, 10);
  recordPerformanceFrame(metrics, 20, 3, 2, 4, 0, 4, 9, 12);
  recordPerformanceFrame(metrics, 30, 0, 1, 0, 6, 3, 7, 12);
  recordPerformanceFrame(metrics, 40, 2, 0, 2, 3, 8, 4, 16);

  const report = snapshotPerformanceMetrics(metrics);
  assert.equal(report.sampleCount, 4);
  assert.equal(report.totalSampleCount, 4);
  assert.equal(report.meanFrameMs, 25);
  assert.equal(report.fps, 40);
  assert.equal(report.p50FrameMs, 25);
  near(report.p95FrameMs, 38.5);
  near(report.p99FrameMs, 39.7);
  assert.equal(report.maxFrameMs, 40);
  assert.equal(report.slowFrameCount, 3);
  assert.equal(report.totalSlowFrameCount, 3);

  assert.equal(report.fixedTickCount, 6);
  assert.equal(report.catchUpFrameCount, 2);
  assert.equal(report.catchUpTickCount, 3);
  assert.equal(report.backlogFrameCount, 2);
  assert.equal(report.backlogTickCount, 3);
  assert.equal(report.maxBacklogTicks, 2);
  assert.equal(report.dropFrameCount, 3);
  assert.equal(report.droppedMs, 6);
  assert.equal(report.clampFrameCount, 2);
  assert.equal(report.clampedMs, 9);
  assert.equal(report.discardedMs, 15);

  assert.equal(report.currentActiveEffects, 8);
  assert.equal(report.peakActiveEffects, 8);
  assert.equal(report.windowPeakPooledEffects, 9);
  assert.equal(report.currentEffectCapacity, 16);
  assert.equal(report.currentPoolUtilization, 0.5);
});

test('ring wrap exposes only the newest samples while lifetime totals remain', () => {
  const metrics = createPerformanceMetrics({ capacity: 3, slowFrameMs: 25 });
  recordPerformanceFrame(metrics, 10, 1, 0, 0, 0, 1, 1, 2);
  recordPerformanceFrame(metrics, 20, 1, 0, 0, 0, 2, 2, 4);
  recordPerformanceFrame(metrics, 30, 2, 1, 3, 0, 3, 3, 6);
  recordPerformanceFrame(metrics, 40, 4, 2, 0, 5, 4, 4, 8);

  const report = snapshotPerformanceMetrics(metrics);
  assert.equal(report.capacity, 3);
  assert.equal(report.sampleCount, 3);
  assert.equal(report.totalSampleCount, 4);
  assert.equal(report.meanFrameMs, 30);
  assert.equal(report.p50FrameMs, 30);
  assert.equal(report.p95FrameMs, 39);
  assert.equal(report.maxFrameMs, 40);
  assert.equal(report.slowFrameCount, 2);
  assert.equal(report.totalSlowFrameCount, 2);
  assert.equal(report.fixedTickCount, 7);
  assert.equal(report.totalFixedTickCount, 8);
  assert.equal(report.windowPeakActiveEffects, 4);
  assert.equal(report.peakActiveEffects, 4);
  assert.equal(metrics.writeIndex, 1);
});

test('non-finite samples are rejected atomically and finite values are clamped', () => {
  const metrics = createPerformanceMetrics({
    capacity: 2,
    maxFrameMs: 100,
    maxTicksPerFrame: 5,
    maxBacklogTicks: 4,
    maxDroppedMs: 50,
    maxEffectCount: 9,
  });
  const stable = snapshotPerformanceMetrics(metrics);

  assert.throws(() => recordPerformanceFrame(metrics, NaN), /frameMs must be finite/);
  assert.throws(() => recordPerformanceFrame(metrics, {
    frameMs: 12,
    fixedTicks: Infinity,
  }), /fixedTicks must be finite/);
  assert.deepEqual(snapshotPerformanceMetrics(metrics), stable);

  recordPerformanceFrame(metrics, {
    wallMs: -3,
    simulationTicks: 99.8,
    tickBacklog: 20,
    droppedMs: -4,
    clampedMs: 999,
    activeEffects: 22,
    poolSize: 7.9,
    poolCapacity: 50,
  });
  const report = snapshotPerformanceMetrics(metrics);
  assert.equal(report.meanFrameMs, 0);
  assert.equal(report.fixedTickCount, 5);
  assert.equal(report.backlogTickCount, 4);
  assert.equal(report.droppedMs, 0);
  assert.equal(report.clampedMs, 50);
  assert.equal(report.currentActiveEffects, 9);
  assert.equal(report.currentPooledEffects, 7);
  assert.equal(report.currentEffectCapacity, 9);

  assert.throws(() => createPerformanceMetrics({ capacity: NaN }), /capacity must be finite/);
  assert.throws(() => createPerformanceMetrics({ minDpr: 4, maxDpr: 2 }), /maxDpr/);
});

test('viewport, DPR, rotation, focus, and cancel events are counted safely', () => {
  const metrics = createPerformanceMetrics({ maxViewportDimension: 2000, maxDpr: 4 });
  recordPerformanceViewport(metrics, 800, 600, 1, 0);
  recordPerformanceViewport(metrics, { width: 800, height: 600, dpr: 2, angle: 0 });
  recordPerformanceViewport(metrics, 9999, -20, 9, -90);
  recordPerformanceEvent(metrics, PERFORMANCE_EVENT.FOCUS);
  recordPerformanceEvent(metrics, 'resume');
  recordPerformanceEvent(metrics, 'pointercancel');
  recordPerformanceEvent(metrics, PERFORMANCE_EVENT.ROTATION);

  let report = snapshotPerformanceMetrics(metrics);
  assert.deepEqual(report.viewport, {
    initialised: true,
    width: 2000,
    height: 0,
    dpr: 4,
    rotation: 270,
  });
  assert.equal(report.viewportEventCount, 3);
  assert.equal(report.viewportChangeCount, 1);
  assert.equal(report.dprChangeCount, 2);
  assert.equal(report.rotationCount, 2);
  assert.equal(report.focusCount, 2);
  assert.equal(report.cancelCount, 1);

  assert.throws(() => recordPerformanceViewport(metrics, 1, 1, Infinity, 0), /dpr/);
  assert.throws(() => recordPerformanceEvent(metrics, 'mystery'), /Unknown/);
  report = snapshotPerformanceMetrics(metrics);
  assert.equal(report.viewportEventCount, 3, 'invalid viewport update was not atomic');
});

test('snapshots are detached and reset reuses every fixed-size buffer', () => {
  const metrics = createPerformanceMetrics({ capacity: 5 });
  const buffers = metrics.buffers;
  const identities = Object.fromEntries(
    Object.entries(buffers).map(([key, value]) => [key, value]),
  );
  recordPerformanceFrame(metrics, 18, 3, 2, 4, 5, 6, 7, 8);
  recordPerformanceViewport(metrics, 1280, 720, 2, 90);
  recordPerformanceEvent(metrics, 'focus');

  const detached = snapshotPerformanceMetrics(metrics);
  detached.viewport.width = 1;
  detached.meanFrameMs = -1;
  const untouched = snapshotPerformanceMetrics(metrics);
  assert.equal(untouched.viewport.width, 1280);
  assert.equal(untouched.meanFrameMs, 18);

  resetPerformanceMetrics(metrics);
  assert.strictEqual(metrics.buffers, buffers);
  for (const [key, value] of Object.entries(identities)) {
    assert.strictEqual(metrics.buffers[key], value, `${key} storage was replaced`);
    assert.equal(value.length, 5);
    assert.ok(value.every(sample => sample === 0));
  }
  const empty = snapshotPerformanceMetrics(metrics);
  assert.equal(empty.sampleCount, 0);
  assert.equal(empty.totalSampleCount, 0);
  assert.equal(empty.fps, 0);
  assert.equal(empty.p99FrameMs, 0);
  assert.equal(empty.peakActiveEffects, 0);
  assert.deepEqual(empty.viewport, {
    initialised: false, width: 0, height: 0, dpr: 1, rotation: 0,
  });
  assert.equal(empty.focusCount, 0);

  recordPerformanceFrame(metrics, 12);
  assert.strictEqual(metrics.buffers.frameMs, identities.frameMs);
  assert.equal(snapshotPerformanceMetrics(metrics).meanFrameMs, 12);
});

test('long churn stays bounded and retains the exact final rolling window', () => {
  const capacity = 17;
  const iterations = 100000;
  const metrics = createPerformanceMetrics({ capacity, slowFrameMs: 500 });
  const identities = Object.values(metrics.buffers);
  for (let index = 0; index < iterations; index++) {
    recordPerformanceFrame(
      metrics,
      index % 1000,
      index % 8,
      index % 5,
      index % 3,
      index % 7,
      index % 41,
      index % 53,
      64,
    );
  }

  const report = snapshotPerformanceMetrics(metrics);
  const first = iterations - capacity;
  let expectedTotal = 0;
  let expectedSlow = 0;
  for (let index = first; index < iterations; index++) {
    const frame = index % 1000;
    expectedTotal += frame;
    if (frame >= 500) expectedSlow++;
  }
  assert.equal(report.sampleCount, capacity);
  assert.equal(report.totalSampleCount, iterations);
  assert.equal(report.meanFrameMs, expectedTotal / capacity);
  assert.equal(report.slowFrameCount, expectedSlow);
  assert.ok(Number.isFinite(report.p99FrameMs));
  assert.ok(Number.isFinite(report.totalDiscardedMs));
  assert.equal(Object.values(metrics.buffers).length, identities.length);
  Object.values(metrics.buffers).forEach((buffer, index) => {
    assert.strictEqual(buffer, identities[index]);
    assert.equal(buffer.length, capacity);
  });
});

// perf-metrics.js — bounded, DOM-free fixed-loop performance telemetry.
//
// The hot recordPerformanceFrame() path only validates numbers, updates
// counters, and writes into preallocated typed arrays. It does not create an
// object or grow an array. Sorting and detached object creation happen only in
// snapshotPerformanceMetrics(), where an allocation is explicitly requested.

export const DEFAULT_PERFORMANCE_CAPACITY = 240;

export const PERFORMANCE_EVENT = Object.freeze({
  ROTATION: 1,
  FOCUS: 2,
  CANCEL: 3,
});

const METRICS_BRAND = Symbol('MotoRushPerformanceMetrics');
const UINT32_MAX = 0xffffffff;
const MAX_CAPACITY = 36000;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function finiteOption(value, fallback, label) {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

function boundedOption(value, fallback, min, max, label, integer = false) {
  const finite = finiteOption(value, fallback, label);
  const bounded = clamp(finite, min, max);
  return integer ? Math.trunc(bounded) : bounded;
}

function finiteRequired(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

function boundedSample(value, fallback, max, label, integer = false) {
  const candidate = value === undefined ? fallback : value;
  const finite = finiteRequired(candidate, label);
  const bounded = clamp(finite, 0, max);
  return integer ? Math.trunc(bounded) : bounded;
}

function assertMetrics(metrics) {
  if (!metrics || metrics[METRICS_BRAND] !== true) {
    throw new TypeError('Invalid performance metrics instance');
  }
}

function saturatingIncrement(value) {
  return value < Number.MAX_SAFE_INTEGER ? value + 1 : value;
}

function saturatingAdd(value, amount) {
  const remaining = Number.MAX_SAFE_INTEGER - value;
  return amount < remaining ? value + amount : Number.MAX_SAFE_INTEGER;
}

function addDuration(value, amount) {
  const next = value + amount;
  return Number.isFinite(next) ? next : Number.MAX_VALUE;
}

function normaliseRotation(value) {
  const finite = finiteRequired(value, 'rotation');
  const degrees = finite % 360;
  return degrees < 0 ? degrees + 360 : degrees;
}

function quantile(sortedValues, probability) {
  const count = sortedValues.length;
  if (!count) return 0;
  if (count === 1) return sortedValues[0];

  // R-7 / linear interpolation: the first and last observations are p0/p100,
  // and an even-sized p50 is the arithmetic median of its two centre values.
  const position = (count - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  const fraction = position - lower;
  return sortedValues[lower]
    + (sortedValues[upper] - sortedValues[lower]) * fraction;
}

function createBuffers(capacity) {
  return Object.freeze({
    frameMs: new Float64Array(capacity),
    fixedTicks: new Uint32Array(capacity),
    backlogTicks: new Uint32Array(capacity),
    droppedMs: new Float64Array(capacity),
    clampedMs: new Float64Array(capacity),
    activeEffects: new Uint32Array(capacity),
    pooledEffects: new Uint32Array(capacity),
    effectCapacity: new Uint32Array(capacity),
  });
}

/**
 * Construct an allocation-stable rolling metrics recorder.
 *
 * All finite sample values are clamped to the configured bounds. NaN,
 * Infinity, and non-numeric values are rejected before live state is changed.
 */
export function createPerformanceMetrics(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Performance metric options must be an object');
  }

  const capacity = boundedOption(
    options.capacity,
    DEFAULT_PERFORMANCE_CAPACITY,
    1,
    MAX_CAPACITY,
    'capacity',
    true,
  );
  const maxFrameMs = boundedOption(options.maxFrameMs, 1000, 1, 60000, 'maxFrameMs');
  const maxTicksPerFrame = boundedOption(
    options.maxTicksPerFrame, 120, 1, UINT32_MAX, 'maxTicksPerFrame', true,
  );
  const config = Object.freeze({
    capacity,
    maxFrameMs,
    slowFrameMs: boundedOption(
      options.slowFrameMs, 1000 / 30, 0, maxFrameMs, 'slowFrameMs',
    ),
    targetTicksPerFrame: boundedOption(
      options.targetTicksPerFrame, 1, 0, maxTicksPerFrame,
      'targetTicksPerFrame', true,
    ),
    maxTicksPerFrame,
    maxBacklogTicks: boundedOption(
      options.maxBacklogTicks, 600, 0, UINT32_MAX, 'maxBacklogTicks', true,
    ),
    maxDroppedMs: boundedOption(
      options.maxDroppedMs, 60000, 0, Number.MAX_VALUE, 'maxDroppedMs',
    ),
    maxEffectCount: boundedOption(
      options.maxEffectCount, 1000000, 0, UINT32_MAX, 'maxEffectCount', true,
    ),
    maxViewportDimension: boundedOption(
      options.maxViewportDimension, 32768, 1, 1000000,
      'maxViewportDimension', true,
    ),
    minDpr: boundedOption(options.minDpr, 0.1, 0.01, 64, 'minDpr'),
    maxDpr: boundedOption(options.maxDpr, 16, 0.01, 64, 'maxDpr'),
  });
  if (config.maxDpr < config.minDpr) {
    throw new RangeError('maxDpr cannot be less than minDpr');
  }

  return {
    [METRICS_BRAND]: true,
    config,
    buffers: createBuffers(capacity),
    writeIndex: 0,
    sampleCount: 0,
    totalSampleCount: 0,

    totalSlowFrameCount: 0,
    totalFixedTickCount: 0,
    totalCatchUpFrameCount: 0,
    totalCatchUpTickCount: 0,
    totalBacklogFrameCount: 0,
    totalBacklogTickCount: 0,
    peakBacklogTicks: 0,
    totalDropFrameCount: 0,
    totalDroppedMs: 0,
    totalClampFrameCount: 0,
    totalClampedMs: 0,

    currentActiveEffects: 0,
    peakActiveEffects: 0,
    currentPooledEffects: 0,
    peakPooledEffects: 0,
    currentEffectCapacity: 0,
    peakEffectCapacity: 0,

    viewportInitialised: false,
    viewportWidth: 0,
    viewportHeight: 0,
    viewportDpr: 1,
    viewportRotation: 0,
    viewportEventCount: 0,
    viewportChangeCount: 0,
    dprChangeCount: 0,
    rotationCount: 0,
    focusCount: 0,
    cancelCount: 0,
  };
}

/**
 * Record one rendered frame.
 *
 * Allocation-free positional form:
 *   recordPerformanceFrame(metrics, frameMs, fixedTicks, backlogTicks,
 *     droppedMs, clampedMs, activeEffects, pooledEffects, effectCapacity)
 *
 * A reusable object may also be passed as the second argument. Supported keys
 * are frameMs/wallMs, fixedTicks/simulationTicks, backlogTicks/tickBacklog,
 * droppedMs, clampedMs, activeEffects, pooledEffects/poolSize, and
 * effectCapacity/poolCapacity.
 */
export function recordPerformanceFrame(
  metrics,
  frameOrSample,
  fixedTicks = 0,
  backlogTicks = 0,
  droppedMs = 0,
  clampedMs = 0,
  activeEffects = 0,
  pooledEffects = 0,
  effectCapacity = 0,
) {
  assertMetrics(metrics);

  let rawFrameMs = frameOrSample;
  let rawFixedTicks = fixedTicks;
  let rawBacklogTicks = backlogTicks;
  let rawDroppedMs = droppedMs;
  let rawClampedMs = clampedMs;
  let rawActiveEffects = activeEffects;
  let rawPooledEffects = pooledEffects;
  let rawEffectCapacity = effectCapacity;
  if (frameOrSample && typeof frameOrSample === 'object') {
    rawFrameMs = frameOrSample.frameMs ?? frameOrSample.wallMs;
    rawFixedTicks = frameOrSample.fixedTicks ?? frameOrSample.simulationTicks ?? 0;
    rawBacklogTicks = frameOrSample.backlogTicks ?? frameOrSample.tickBacklog ?? 0;
    rawDroppedMs = frameOrSample.droppedMs ?? 0;
    rawClampedMs = frameOrSample.clampedMs ?? 0;
    rawActiveEffects = frameOrSample.activeEffects ?? 0;
    rawPooledEffects = frameOrSample.pooledEffects ?? frameOrSample.poolSize ?? 0;
    rawEffectCapacity = frameOrSample.effectCapacity ?? frameOrSample.poolCapacity ?? 0;
  }

  // Complete validation first so a rejected sample is atomic.
  const frame = boundedSample(
    rawFrameMs, undefined, metrics.config.maxFrameMs, 'frameMs',
  );
  const ticks = boundedSample(
    rawFixedTicks, 0, metrics.config.maxTicksPerFrame, 'fixedTicks', true,
  );
  const backlog = boundedSample(
    rawBacklogTicks, 0, metrics.config.maxBacklogTicks, 'backlogTicks', true,
  );
  const dropped = boundedSample(
    rawDroppedMs, 0, metrics.config.maxDroppedMs, 'droppedMs',
  );
  const clamped = boundedSample(
    rawClampedMs, 0, metrics.config.maxDroppedMs, 'clampedMs',
  );
  const active = boundedSample(
    rawActiveEffects, 0, metrics.config.maxEffectCount, 'activeEffects', true,
  );
  const pooled = boundedSample(
    rawPooledEffects, 0, metrics.config.maxEffectCount, 'pooledEffects', true,
  );
  const poolCapacity = boundedSample(
    rawEffectCapacity, 0, metrics.config.maxEffectCount, 'effectCapacity', true,
  );

  const index = metrics.writeIndex;
  const buffers = metrics.buffers;
  buffers.frameMs[index] = frame;
  buffers.fixedTicks[index] = ticks;
  buffers.backlogTicks[index] = backlog;
  buffers.droppedMs[index] = dropped;
  buffers.clampedMs[index] = clamped;
  buffers.activeEffects[index] = active;
  buffers.pooledEffects[index] = pooled;
  buffers.effectCapacity[index] = poolCapacity;
  metrics.writeIndex = index + 1 === metrics.config.capacity ? 0 : index + 1;
  if (metrics.sampleCount < metrics.config.capacity) metrics.sampleCount++;
  metrics.totalSampleCount = saturatingIncrement(metrics.totalSampleCount);

  if (frame >= metrics.config.slowFrameMs) {
    metrics.totalSlowFrameCount = saturatingIncrement(metrics.totalSlowFrameCount);
  }
  metrics.totalFixedTickCount = saturatingAdd(metrics.totalFixedTickCount, ticks);
  if (ticks > metrics.config.targetTicksPerFrame) {
    metrics.totalCatchUpFrameCount = saturatingIncrement(metrics.totalCatchUpFrameCount);
    metrics.totalCatchUpTickCount = saturatingAdd(
      metrics.totalCatchUpTickCount,
      ticks - metrics.config.targetTicksPerFrame,
    );
  }
  if (backlog > 0) {
    metrics.totalBacklogFrameCount = saturatingIncrement(metrics.totalBacklogFrameCount);
    metrics.totalBacklogTickCount = saturatingAdd(metrics.totalBacklogTickCount, backlog);
    if (backlog > metrics.peakBacklogTicks) metrics.peakBacklogTicks = backlog;
  }
  if (dropped > 0 || clamped > 0) {
    metrics.totalDropFrameCount = saturatingIncrement(metrics.totalDropFrameCount);
  }
  if (dropped > 0) metrics.totalDroppedMs = addDuration(metrics.totalDroppedMs, dropped);
  if (clamped > 0) {
    metrics.totalClampFrameCount = saturatingIncrement(metrics.totalClampFrameCount);
    metrics.totalClampedMs = addDuration(metrics.totalClampedMs, clamped);
  }

  metrics.currentActiveEffects = active;
  if (active > metrics.peakActiveEffects) metrics.peakActiveEffects = active;
  metrics.currentPooledEffects = pooled;
  if (pooled > metrics.peakPooledEffects) metrics.peakPooledEffects = pooled;
  metrics.currentEffectCapacity = poolCapacity;
  if (poolCapacity > metrics.peakEffectCapacity) metrics.peakEffectCapacity = poolCapacity;
  return metrics;
}

/**
 * Record a viewport sample. Width/height/DPR changes are counted after the
 * first baseline sample. A changed rotation angle also counts as one rotation.
 */
export function recordPerformanceViewport(
  metrics,
  widthOrSample,
  height,
  dpr,
  rotation = 0,
) {
  assertMetrics(metrics);
  let rawWidth = widthOrSample;
  let rawHeight = height;
  let rawDpr = dpr;
  let rawRotation = rotation;
  if (widthOrSample && typeof widthOrSample === 'object') {
    rawWidth = widthOrSample.width;
    rawHeight = widthOrSample.height;
    rawDpr = widthOrSample.dpr;
    rawRotation = widthOrSample.rotation ?? widthOrSample.angle ?? 0;
  }

  const width = boundedSample(
    rawWidth, undefined, metrics.config.maxViewportDimension, 'viewport width', true,
  );
  const safeHeight = boundedSample(
    rawHeight, undefined, metrics.config.maxViewportDimension, 'viewport height', true,
  );
  const finiteDpr = finiteRequired(rawDpr, 'viewport dpr');
  const safeDpr = clamp(finiteDpr, metrics.config.minDpr, metrics.config.maxDpr);
  const safeRotation = normaliseRotation(rawRotation);

  if (metrics.viewportInitialised) {
    if (width !== metrics.viewportWidth || safeHeight !== metrics.viewportHeight) {
      metrics.viewportChangeCount = saturatingIncrement(metrics.viewportChangeCount);
    }
    if (safeDpr !== metrics.viewportDpr) {
      metrics.dprChangeCount = saturatingIncrement(metrics.dprChangeCount);
    }
    if (safeRotation !== metrics.viewportRotation) {
      metrics.rotationCount = saturatingIncrement(metrics.rotationCount);
    }
  } else {
    metrics.viewportInitialised = true;
  }

  metrics.viewportWidth = width;
  metrics.viewportHeight = safeHeight;
  metrics.viewportDpr = safeDpr;
  metrics.viewportRotation = safeRotation;
  metrics.viewportEventCount = saturatingIncrement(metrics.viewportEventCount);
  return metrics;
}

/** Record a lifecycle event when no viewport angle change is available. */
export function recordPerformanceEvent(metrics, event) {
  assertMetrics(metrics);
  if (event === PERFORMANCE_EVENT.ROTATION
      || event === 'rotation'
      || event === 'rotate'
      || event === 'orientationchange') {
    metrics.rotationCount = saturatingIncrement(metrics.rotationCount);
  } else if (event === PERFORMANCE_EVENT.FOCUS || event === 'focus' || event === 'resume') {
    metrics.focusCount = saturatingIncrement(metrics.focusCount);
  } else if (event === PERFORMANCE_EVENT.CANCEL
      || event === 'cancel'
      || event === 'pointercancel'
      || event === 'touchcancel') {
    metrics.cancelCount = saturatingIncrement(metrics.cancelCount);
  } else {
    throw new RangeError(`Unknown performance event: ${String(event)}`);
  }
  return metrics;
}

/**
 * Create a detached report for the current rolling window plus lifetime
 * counters accumulated since construction/reset.
 */
export function snapshotPerformanceMetrics(metrics) {
  assertMetrics(metrics);
  const count = metrics.sampleCount;
  const capacity = metrics.config.capacity;
  const buffers = metrics.buffers;
  const sortedFrames = new Float64Array(count);
  let frameTotal = 0;
  let slowFrameCount = 0;
  let fixedTickCount = 0;
  let catchUpFrameCount = 0;
  let catchUpTickCount = 0;
  let backlogFrameCount = 0;
  let backlogTickCount = 0;
  let maxBacklogTicks = 0;
  let dropFrameCount = 0;
  let droppedMs = 0;
  let clampFrameCount = 0;
  let clampedMs = 0;
  let windowPeakActiveEffects = 0;
  let windowPeakPooledEffects = 0;
  let windowPeakEffectCapacity = 0;
  let start = metrics.writeIndex - count;
  if (start < 0) start += capacity;

  for (let offset = 0; offset < count; offset++) {
    const index = start + offset < capacity ? start + offset : start + offset - capacity;
    const frame = buffers.frameMs[index];
    const ticks = buffers.fixedTicks[index];
    const backlog = buffers.backlogTicks[index];
    const dropped = buffers.droppedMs[index];
    const clamped = buffers.clampedMs[index];
    const active = buffers.activeEffects[index];
    const pooled = buffers.pooledEffects[index];
    const poolCapacity = buffers.effectCapacity[index];
    sortedFrames[offset] = frame;
    frameTotal += frame;
    if (frame >= metrics.config.slowFrameMs) slowFrameCount++;
    fixedTickCount += ticks;
    if (ticks > metrics.config.targetTicksPerFrame) {
      catchUpFrameCount++;
      catchUpTickCount += ticks - metrics.config.targetTicksPerFrame;
    }
    if (backlog > 0) {
      backlogFrameCount++;
      backlogTickCount += backlog;
      if (backlog > maxBacklogTicks) maxBacklogTicks = backlog;
    }
    if (dropped > 0 || clamped > 0) dropFrameCount++;
    droppedMs += dropped;
    if (clamped > 0) clampFrameCount++;
    clampedMs += clamped;
    if (active > windowPeakActiveEffects) windowPeakActiveEffects = active;
    if (pooled > windowPeakPooledEffects) windowPeakPooledEffects = pooled;
    if (poolCapacity > windowPeakEffectCapacity) windowPeakEffectCapacity = poolCapacity;
  }
  sortedFrames.sort();
  const meanFrameMs = count ? frameTotal / count : 0;
  const maxFrame = count ? sortedFrames[count - 1] : 0;
  const currentPoolUtilization = metrics.currentEffectCapacity > 0
    ? clamp(metrics.currentActiveEffects / metrics.currentEffectCapacity, 0, 1)
    : 0;

  return {
    capacity,
    sampleCount: count,
    totalSampleCount: metrics.totalSampleCount,
    fps: meanFrameMs > 0 ? 1000 / meanFrameMs : 0,
    meanFrameMs,
    p50FrameMs: quantile(sortedFrames, 0.50),
    p95FrameMs: quantile(sortedFrames, 0.95),
    p99FrameMs: quantile(sortedFrames, 0.99),
    maxFrameMs: maxFrame,
    slowFrameThresholdMs: metrics.config.slowFrameMs,
    slowFrameCount,
    totalSlowFrameCount: metrics.totalSlowFrameCount,

    fixedTickCount,
    totalFixedTickCount: metrics.totalFixedTickCount,
    catchUpFrameCount,
    catchUpTickCount,
    totalCatchUpFrameCount: metrics.totalCatchUpFrameCount,
    totalCatchUpTickCount: metrics.totalCatchUpTickCount,
    backlogFrameCount,
    backlogTickCount,
    maxBacklogTicks,
    totalBacklogFrameCount: metrics.totalBacklogFrameCount,
    totalBacklogTickCount: metrics.totalBacklogTickCount,
    peakBacklogTicks: metrics.peakBacklogTicks,

    dropFrameCount,
    droppedMs,
    clampFrameCount,
    clampedMs,
    discardedMs: droppedMs + clampedMs,
    totalDropFrameCount: metrics.totalDropFrameCount,
    totalDroppedMs: metrics.totalDroppedMs,
    totalClampFrameCount: metrics.totalClampFrameCount,
    totalClampedMs: metrics.totalClampedMs,
    totalDiscardedMs: metrics.totalDroppedMs + metrics.totalClampedMs,

    currentActiveEffects: metrics.currentActiveEffects,
    peakActiveEffects: metrics.peakActiveEffects,
    windowPeakActiveEffects,
    currentPooledEffects: metrics.currentPooledEffects,
    peakPooledEffects: metrics.peakPooledEffects,
    windowPeakPooledEffects,
    currentEffectCapacity: metrics.currentEffectCapacity,
    peakEffectCapacity: metrics.peakEffectCapacity,
    windowPeakEffectCapacity,
    currentPoolUtilization,

    viewport: {
      initialised: metrics.viewportInitialised,
      width: metrics.viewportWidth,
      height: metrics.viewportHeight,
      dpr: metrics.viewportDpr,
      rotation: metrics.viewportRotation,
    },
    viewportEventCount: metrics.viewportEventCount,
    viewportChangeCount: metrics.viewportChangeCount,
    dprChangeCount: metrics.dprChangeCount,
    rotationCount: metrics.rotationCount,
    focusCount: metrics.focusCount,
    cancelCount: metrics.cancelCount,
  };
}

/** Clear telemetry in place while retaining every preallocated ring buffer. */
export function resetPerformanceMetrics(metrics) {
  assertMetrics(metrics);
  const buffers = metrics.buffers;
  buffers.frameMs.fill(0);
  buffers.fixedTicks.fill(0);
  buffers.backlogTicks.fill(0);
  buffers.droppedMs.fill(0);
  buffers.clampedMs.fill(0);
  buffers.activeEffects.fill(0);
  buffers.pooledEffects.fill(0);
  buffers.effectCapacity.fill(0);

  metrics.writeIndex = 0;
  metrics.sampleCount = 0;
  metrics.totalSampleCount = 0;
  metrics.totalSlowFrameCount = 0;
  metrics.totalFixedTickCount = 0;
  metrics.totalCatchUpFrameCount = 0;
  metrics.totalCatchUpTickCount = 0;
  metrics.totalBacklogFrameCount = 0;
  metrics.totalBacklogTickCount = 0;
  metrics.peakBacklogTicks = 0;
  metrics.totalDropFrameCount = 0;
  metrics.totalDroppedMs = 0;
  metrics.totalClampFrameCount = 0;
  metrics.totalClampedMs = 0;

  metrics.currentActiveEffects = 0;
  metrics.peakActiveEffects = 0;
  metrics.currentPooledEffects = 0;
  metrics.peakPooledEffects = 0;
  metrics.currentEffectCapacity = 0;
  metrics.peakEffectCapacity = 0;

  metrics.viewportInitialised = false;
  metrics.viewportWidth = 0;
  metrics.viewportHeight = 0;
  metrics.viewportDpr = 1;
  metrics.viewportRotation = 0;
  metrics.viewportEventCount = 0;
  metrics.viewportChangeCount = 0;
  metrics.dprChangeCount = 0;
  metrics.rotationCount = 0;
  metrics.focusCount = 0;
  metrics.cancelCount = 0;
  return metrics;
}

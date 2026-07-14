# Performance and Interruption QA

This document is the reproducible acceptance record for the v1.6.0 **Smooth Ride** runtime work. It separates what the automated browser gate proves from what still requires physical-device testing.

## Acceptance profiles

| Profile ID | Viewport | DPR | Browser flags | p95 budget |
|---|---:|---:|---|---:|
| `desktop-1280x720-dpr1` | 1280 × 720 | 1 | desktop, no touch | < 20 ms |
| `mobile-390x844-dpr2` | 390 × 844 | 2 | mobile context, touch enabled | < 25 ms |

The latest standalone run used a local **system-installed Chrome in headless mode**. It did not use a hosted browser, a production Pages build, or a physical phone.

## Latest measured result

| Profile | Rolling samples | p50 | p95 | p99 | Budget | Status |
|---|---:|---:|---:|---:|---:|---|
| Desktop 1280 × 720 @1 | 360 frames | 3.60 ms | 7.10 ms | 7.20 ms | p95 < 20 ms | Pass |
| Mobile 390 × 844 @2 | 360 frames | 3.60 ms | 10.70 ms | 17.84 ms | p95 < 25 ms | Pass |

Both measurements are below their repository budgets. The measurements are local gate evidence only; they are not a universal performance guarantee and should not be read as proof that a phone display renders at roughly 200 FPS. Headless Chrome is not synchronized to a physical display panel in the same way as an interactive device session.

## Browser harness procedure

`npm run test:browser-performance` starts a temporary static server for `public/`, locates an installed Chrome/Chromium/Edge browser, and runs the two profiles sequentially. For each profile it:

1. Creates a clean context with the profile viewport, DPR, mobile, and touch settings.
2. Blocks service workers so cached files cannot hide a missing runtime dependency.
3. Opens level 1 with development capture, touch, and autoplay flags.
4. Captures page and console errors across measurement and the complete interaction matrix.
5. Warms the runtime for 750 ms.
6. Resets telemetry, measures for 3 seconds, and reads a detached report.
7. Requires at least 100 samples, active play, at least 60 fixed ticks, and nonzero pooled-effect activity; the current 360-frame ring fills during the run.
8. Requires p95 frame time to remain below the profile budget.
9. Validates that active/created/peak effects stay within each fixed pool capacity.
10. Runs the interruption and control-layout matrix on the mobile profile, including 390 × 844 and 320 × 568 target separation.
11. Closes each context, the browser, and the temporary server even if an assertion fails.

Reproduce it from the repository root:

```powershell
npm ci
npm run test:browser-performance
```

Run the DOM-free telemetry and pool/input unit gates separately:

```powershell
npm run test:effects
npm run test:input
npm run test:performance
```

## Telemetry design

The live recorder uses eight preallocated typed arrays in a fixed **360-frame rolling ring** for frame duration, fixed ticks, backlog ticks, dropped time, clamped time, active effects, pooled/created effects, and effect capacity. The record path validates and clamps numeric samples, writes the current slot, and updates scalar counters. It does not grow an array or construct a per-frame report.

A snapshot is an explicit cold-path operation. It copies the current window, sorts the frame-time values, and produces a detached object containing:

- FPS, mean frame time, p50, p95, p99, maximum, and slow-frame totals;
- total fixed ticks, catch-up frames/ticks, backlog frames/ticks, and peak backlog;
- clamped/dropped frame counts and accumulated time;
- current and peak active/pooled/capacity effect counts;
- viewport size, DPR, rotation, focus, and pointer-cancel counters.

The in-game `?dev&perf` overlay asks for this snapshot at a throttled interval. The browser loop consumes at most five fixed ticks per rendered frame and retains at most six queued ticks, making backlog and dropped-time counters real bounded pressure signals. Telemetry is diagnostic presentation, not authoritative simulation state and not part of a replay hash.

## Effect-capacity invariants

| Pool | Capacity | Harness invariant |
|---|---:|---|
| Particles | 384 | active, created, and peak are each ≤ 384 |
| Popups | 32 | active, created, and peak are each ≤ 32 |
| Tracks | 220 | active, created, and peak are each ≤ 220 |
| **Combined** | **636** | telemetry peak never exceeds combined capacity |

Storage is bounded. A pool lazily creates at most one reusable value per slot. If all slots in one pool are active, its oldest active effect is evicted deterministically; the pool never expands. Release/clear operations return slots to the fixed free list, and active iteration does not build a temporary effect collection.

## Mobile interruption matrix

After the mobile performance sample, the harness exercises control ownership and state transitions:

| Case | Automated assertion |
|---|---|
| Control separation | Standard and left-handed Gas/Brake plus Lean hit circles are disjoint and unclipped at 390 × 844, 320 × 568, and rotated 844 × 390 layouts. |
| Simultaneous touch | Separate Gas and Lean Back pointers are both present in the aggregate command. |
| Pointer cancel | Cancelling the Gas pointer releases Gas only; the Lean Back pointer stays active and the cancel counter increments. |
| Blur | A held keyboard Gas command becomes neutral, the run pauses, and `blur` is retained as the clear reason. |
| Rotation | A held touch becomes neutral, the run pauses, rotation count increments, and the canvas becomes 844 × 390. |
| Left-hand setting | Settings enable left-handed layout metadata; Gas maps to the left cluster and Lean Back to the right cluster. |

The runtime also clears active commands when the document becomes hidden. The input module has deterministic coverage for pointer end, pointer cancel, lost pointer capture, keyboard remapping, gamepad snapshots/deadzone behavior, development input, event bounds, invalid input rejection, and clear/pause reasons.

## Visual evidence

| Desktop live sample | Mobile live sample |
|:---:|:---:|
| ![Smooth Ride Lab over live desktop gameplay](../screenshots/v1.6/update-v16-performance-live.png) | <img src="../screenshots/v1.6/update-v16-performance-mobile.png" alt="Smooth Ride Lab at 390 by 844 and DPR 2" width="300"> |

| Rotation assertion | Left-hand layout assertion |
|:---:|:---:|
| ![Paused 844 by 390 rotated canvas with neutral input](../screenshots/v1.6/update-v16-rotation-safe.png) | <img src="../screenshots/v1.6/update-v16-left-hand-play.png" alt="Gas and Brake on the left in portrait play" width="300"> |

| 320 px standard targets | 320 px left-hand targets |
|:---:|:---:|
| <img src="../screenshots/v1.6/update-v16-narrow-controls.png" alt="Separate standard controls at 320 by 568" width="240"> | <img src="../screenshots/v1.6/update-v16-narrow-left-hand.png" alt="Separate left-handed controls at 320 by 568" width="240"> |

These screenshots show the live runtime and telemetry panel. They are supporting visual evidence, while the command's pass/fail assertions remain the repeatable acceptance mechanism.

## Interpretation and limits

This gate is designed to catch regressions such as an effect array growing without bound, fresh effect identity churn, a slow percentile moving beyond budget, fixed-step backlog, stale controls after pointer cancellation, or layout/input ownership disagreeing after rotation.

It does not substitute for profiling a production build on physical hardware. Before production release, record a comparable 10+ minute run on representative low/mid-tier Android hardware and an iPhone-class device. Include heavy dust/confetti/crash scenes, repeated retries, portrait/landscape rotation, background/foreground, real multi-touch, audio, haptics, browser UI expansion/collapse, thermal behavior, and battery impact. Also smoke-test the published GitHub Pages URL with a clean cache and an installed offline PWA.

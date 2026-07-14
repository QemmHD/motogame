# Performance and Interruption QA

This document is the reproducible acceptance record for the v1.6.0 **Smooth Ride** foundation, v1.7.0 **Vector Weave**, v1.8.0 **Crash Theater**, and the current v1.8.1 **Fast Failure, Great Finish** candidate. It separates what the automated browser gates prove from what still requires physical-device testing.

## Acceptance profiles

| Profile ID | Viewport | DPR | Browser context | Frame-work p95 budget |
|---|---:|---:|---|---:|
| `desktop-1280x720-dpr1` | 1280 × 720 | 1 | desktop, no touch | < 8 ms |
| `mobile-390x844-dpr2` | 390 × 844 | 2 | mobile context, touch enabled | < 12 ms |

The recorded full-gate reference run used a local **system-installed Chrome in headless mode**. It did not use a hosted browser, a production Pages build, or a physical phone.

## Latest recorded local reference — v1.8.1

The final ordinary-play regression run on 2026-07-14 passed both existing profiles:

| Profile | Work p95 | Budget | Status |
|---|---:|---:|---|
| Desktop 1280 × 720 @1 | 1.10 ms | p95 < 8 ms | Pass |
| Mobile 390 × 844 @2 | 0.90 ms | p95 < 12 ms | Pass |

The mobile profile also retained the existing interruption, rotation, 320 × 568 geometry, simultaneous-pointer, and left-hand-control assertions.

### Finish Forge result-flow profiles — v1.8.1

`npm run test:browser-results` stages an exact authoritative Finish Forge receipt in clean service-worker-blocked contexts, measures the live result screen, and then exercises input, route, semantic, Reduced Motion, and reset behavior:

| Profile | Semantic actions | Enabled Canvas targets | Work samples | Work p95 | Budget | Additional interaction coverage | Status |
|---|---:|---:|---:|---:|---:|---|---|
| Desktop 1280 × 720 @1 | 5 | 5, each ≥ 44 px | 123 | 0.70 ms | p95 < 8 ms | Native semantic Tab/Enter, held-repeat suppression, keyboard shortcuts, plus standard fake-gamepad D-pad/stick/A/B navigation, confirm, back, and held-A suppression | Pass |
| Mobile 390 × 844 @2 | 5 | 5, each ≥ 44 px | 127 | 0.60 ms | p95 < 12 ms | Native semantic keyboard route, 320 × 568 five-target containment/non-overlap, and real touch-center Retry | Pass |

Both profiles require canonical report and semantic text, matching action/disabled state, safe missing proof and locked/missing Next handling, clean transition reset, and zero page, console, request, or HTTP errors. The desktop profile additionally requires Reduced Motion to reveal timer state `10` immediately with no pooled effects, shake, flash, hitstop, or slow-motion residue.

### Crash Theater regression profiles — v1.8.1

`npm run test:browser-crash` proves the v1.8.1 result/reset integration did not regress the preserved failure presentation:

| Profile | Parts | Pose ticks | Raw contacts | Frozen review | Work samples | Work p95 | Budget | Retry | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| Desktop 1280 × 720 @1, TNT | 17 | 177 | 1,894 | 112 ticks | final profile | 3.10 ms | p95 < 8 ms | Clean | Pass |
| Mobile 390 × 844 @2, saw | 17 | 168 | 1,287 | 112 ticks | final profile | 1.70 ms | p95 < 12 ms | Clean | Pass |
| Desktop 1280 × 720 @1, Reduced Motion crusher | 17 | 0 | 0 | 112 ticks | — | not timed | static invariant | Clean | Pass |

### Hosted Actions confirmation — v1.8.1

[GitHub Actions run 29324957318](https://github.com/QemmHD/motogame/actions/runs/29324957318), pinned to gameplay SHA [`27bcce2b66f4`](https://github.com/QemmHD/motogame/commit/27bcce2b66f46592c8ea83122067f43f915a27eb) in draft [PR #4](https://github.com/QemmHD/motogame/pull/4), passed the complete gate on the hosted Ubuntu runner:

| Profile | Samples | Work p95 | Diagnostic pacing p95 | Peak effects / detail | Budget | Status |
|---|---:|---:|---:|---:|---:|---|
| Ordinary desktop 1280 × 720 @1 | 181 | 1.20 ms | 66.80 ms | 101/636; 628 fixed ticks | < 8 ms | Pass |
| Ordinary mobile 390 × 844 @2 | 182 | 1.20 ms | 115.77 ms | 94/636; 816 fixed ticks | < 12 ms | Pass |
| Crash desktop TNT | 182 | 2.10 ms | diagnostic | 17 parts; 177 pose ticks; 1,894 contacts | < 8 ms | Pass |
| Crash mobile saw | 183 | 2.50 ms | diagnostic | 17 parts; 168 pose ticks; 1,287 contacts | < 12 ms | Pass |
| Finish Forge desktop | 122 | 0.80 ms | diagnostic | 5 semantic / 5 enabled targets | < 8 ms | Pass |
| Finish Forge mobile | 122 | 0.80 ms | diagnostic | 5 semantic / 5 enabled targets; narrow touch passed | < 12 ms | Pass |

The hosted gate also passed 3 asset/offline checks, 127 deterministic systems, all 16 routes, and all 16 Gold tapes twice. Reduced Motion crash and finish invariants passed, the test job completed in 1m51s, and publishing was correctly skipped because this was a pull-request event. Hosted pacing reflects shared-runner scheduling and remains diagnostic; synchronous callback-work budgets passed.

The final local aggregate `npm test` completed in **334.1 seconds** and passed 3 asset checks, 127 deterministic systems, all 16 routes, 32 Gold replays, both ordinary profiles, all three crash profiles, and both Finish Forge profiles.

## Preserved local reference — v1.8.0

The final aggregate `npm test` run on 2026-07-14 used Chrome 150.0.7871.102 and passed both ordinary profiles:

| Profile | Work samples | Work mean | Work p50 | Work p95 | Work p99 | Work max | Pacing p95 | Peak effects | Budget | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Desktop 1280 × 720 @1 | 360 | 0.62 ms | 0.55 ms | 1.00 ms | 1.60 ms | 2.80 ms | 7.20 ms | 69/636 | p95 < 8 ms | Pass |
| Mobile 390 × 844 @2 | 360 | 0.55 ms | 0.50 ms | 0.81 ms | 1.78 ms | 3.00 ms | 7.20 ms | 69/636 | p95 < 12 ms | Pass |

The desktop and mobile profiles advanced 99 and 91 fixed ticks respectively. The mobile profile then passed the complete interruption, rotation, narrow-layout, simultaneous-pointer, and left-hand-control matrix.

### Dedicated Crash Theater profiles — v1.8.0

`npm run test:browser-crash` measures real live Crash Theater scenes separately from the clean ordinary-play route:

| Profile | Parts | Pose ticks | Raw contacts | Frozen review | Work samples | Work p95 | Budget | Retry | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| Desktop 1280 × 720 @1, TNT | 17 | 177 | 1,894 | 112 ticks | 181 | 1.60 ms | p95 < 8 ms | Clean | Pass |
| Mobile 390 × 844 @2, saw | 17 | 168 | 1,287 | 112 ticks | 181 | 1.50 ms | p95 < 12 ms | Clean | Pass |
| Desktop 1280 × 720 @1, Reduced Motion crusher | 17 | 0 | 0 | 112 ticks | — | not timed | not applicable | Clean | Pass |

The two timed profiles run unfrozen while crashed-session ticks, the retry timer, ragdoll stepping/contact, impact draining, particles, and camera work advance. Every profile also verifies the exact 17-part order, matching Canvas cause/card text, finite pose and camera output, bounded effects, a separately frozen review state, checkpoint retry, and clean post-retry reset. The Reduced Motion case advances the crashed-session timer while proving a static pose invariant instead of reporting a meaningless animation timing percentile.

### Hosted Actions confirmation — v1.8.0

[GitHub Actions run 29319685056](https://github.com/QemmHD/motogame/actions/runs/29319685056), pinned to gameplay SHA [`89e5f7d9757e`](https://github.com/QemmHD/motogame/commit/89e5f7d9757eb90ae1f58f5dfd6914d5aaa7aad4), passed the complete draft-PR gate on the hosted Ubuntu runner:

| Ordinary profile | Samples | Work mean | Work p50 | Work p95 | Work p99 | Work max | Pacing p95 | Peak effects | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Desktop 1280 × 720 @1 | 182 | 0.89 ms | 0.90 ms | 1.20 ms | 1.32 ms | 3.10 ms | 83.40 ms | 92/636 | Pass |
| Mobile 390 × 844 @2 | 181 | 0.85 ms | 0.80 ms | 1.20 ms | 1.80 ms | 2.80 ms | 116.70 ms | 99/636 | Pass |

| Crash profile | Parts | Pose ticks | Raw contacts | Samples | Work p95 | Budget | Status |
|---|---:|---:|---:|---:|---:|---:|---|
| Desktop TNT | 17 | 177 | 1,894 | 182 | 2.29 ms | p95 < 8 ms | Pass |
| Mobile DPR 2 saw | 17 | 168 | 1,287 | 183 | 2.50 ms | p95 < 12 ms | Pass |
| Reduced Motion crusher | 17 | 0 | 0 | — | not timed | static invariant | Pass |

The hosted gate also passed 3 asset/offline checks, 108 deterministic system subtests, all 16 routes, and all 16 Gold tapes twice. Both dynamic crashes measured unfrozen work, then all three profiles held the frozen review and retried cleanly. Pacing remains diagnostic shared-runner scheduling; the strict work budgets passed. Publishing was correctly skipped because the event was a draft pull request rather than an eligible push to `main`.

## Preserved local reference — v1.7.0

| Profile | Work samples | Work p50 | Work p95 | Work p99 | Pacing p95 | Work budget | Status |
|---|---:|---:|---:|---:|---:|---:|---|
| Desktop 1280 × 720 @1 | 360 frames | 0.30 ms | 1.00 ms | 3.68 ms | 3.70 ms | p95 < 8 ms | Pass |
| Mobile 390 × 844 @2 | 360 frames | 0.40 ms | 2.20 ms | 2.92 ms | 3.70 ms | p95 < 12 ms | Pass |

Both callback-work p95 measurements are below their repository budgets. `Work` is the synchronous duration of the game's animation-frame callback, including fixed-step updates, presentation updates, and canvas command submission. `Pacing` is the existing runtime's callback-to-callback wall interval; it remains visible as a diagnostic but is not gated on shared CI because host scheduling dominates it. Neither view is a universal performance guarantee or a physical-display FPS/GPU claim.

The table above is the final v1.7 local `npm test` run in Chrome 150. It includes the new Kinetic Loom module, renderer, Vector Weave course, and 16-route catalog.

### Hosted Actions confirmation — v1.7.0

[GitHub Actions run 29307193559](https://github.com/QemmHD/motogame/actions/runs/29307193559) passed the complete draft-PR gate in Chrome 150 on the hosted Ubuntu runner:

| Profile | Work samples | Work p50 | Work p95 | Work p99 | Work max | Pacing p95 | Status |
|---|---:|---:|---:|---:|---:|---:|---|
| Desktop 1280 × 720 @1 | 182 | 0.80 ms | 1.10 ms | 1.34 ms | 2.80 ms | 66.70 ms | Pass |
| Mobile 390 × 844 @2 | 182 | 0.70 ms | 1.10 ms | 1.42 ms | 2.60 ms | 100.00 ms | Pass |

The hosted gate also passed 3 asset/offline checks, 87 deterministic system subtests, all 16 routes, and all 16 Gold tapes twice. Publishing was correctly skipped because the event was a draft pull request rather than an eligible push to `main`.

### Preserved v1.6 predecessor

[GitHub Actions run 29304809481](https://github.com/QemmHD/motogame/actions/runs/29304809481) passed the same gate in Chrome 150 on the hosted Ubuntu runner:

| Profile | Work samples | Work p50 | Work p95 | Work p99 | Work max | Pacing p95 | Status |
|---|---:|---:|---:|---:|---:|---:|---|
| Desktop 1280 × 720 @1 | 181 | 0.80 ms | 1.10 ms | 1.22 ms | 2.60 ms | 66.70 ms | Pass |
| Mobile 390 × 844 @2 | 181 | 0.70 ms | 1.20 ms | 1.48 ms | 3.00 ms | 100.00 ms | Pass |

Both hosted runs keep synchronous work close to their local references while pacing differs sharply, which is the expected signature of shared-host scheduling rather than a hidden 50-100 ms game callback.

## Browser harness procedure

`npm run test:browser-performance` starts a temporary static server for `public/`, locates an installed Chrome/Chromium/Edge browser, and runs the two profiles sequentially. For each profile it:

1. Creates a clean context with the profile viewport, DPR, mobile, and touch settings.
2. Injects a preallocated 360-value wrapper around `requestAnimationFrame` before any game script runs; the wrapper records only synchronous callback work.
3. Blocks service workers so cached files cannot hide a missing runtime dependency.
4. Opens Cliffhanger (level 5) with development capture, touch, and autoplay flags. Its clean reference route remains active throughout the hosted runner's observed sample window.
5. Captures page and console errors across measurement and the complete interaction matrix.
6. Warms the runtime for 750 ms, then resets the runtime telemetry and harness probe together.
7. Measures for at least 3 seconds. If the host has not produced 180 frames, it waits up to 12 more seconds for the same target; a timeout still produces the measured snapshot and an actionable failure.
8. Prints browser version plus complete work and pacing diagnostics before assertions, requires matching probe/runtime sample counts, active play, at least 60 fixed ticks, and nonzero pooled-effect activity.
9. Requires main-loop work p95 to remain below the profile budget while retaining pacing p95 as a diagnostic.
10. Validates that active/created/peak effects stay within each fixed pool capacity.
11. Runs the interruption and control-layout matrix on the mobile profile, including 390 × 844 and 320 × 568 target separation.
12. Closes each context, the browser, and the temporary server even if an assertion fails.

The dedicated crash harness starts the same temporary deployment boundary with service workers blocked, then runs desktop TNT, mobile DPR 2 saw, and Reduced Motion crusher profiles. It stages each cause through development-only deterministic hooks after 28 presentation ticks. For measurement only, it raises the harness copy of the crash timer to 35 seconds so a slow runner can collect at least 180 unfrozen callbacks through the real crashed-session/ragdoll/contact/effect/camera path; collection may wait up to 30 seconds and reports the partial count on timeout, while the strict 8/12 ms callback-work budgets do not change. The production `1.85` second retry boundary is unchanged and covered separately. It requires session and dynamic pose progress, validates the 17-part rig and visible card, then freezes and compares an exact review state for 112 tick-equivalent intervals, retries, and rejects page, console, network, HTTP, camera, pose, effect-bound, or reset errors.

The Finish Forge harness uses the same two acceptance viewports and work budgets. It injects a bounded callback-work probe and standard fake gamepad before navigation, stages a canonical finish, requires at least 120 live callback samples, and checks the rendered receipt against the semantic dialog and authoritative report. It then exercises keyboard Retry, disabled Replay, locked and missing Next, standard-gamepad focus/confirm/back with held-A suppression, instant Reduced Motion, complete result cleanup, and—on the mobile context—five contained/non-overlapping 320 × 568 targets plus an actual touch-center Retry. It rejects a mismatch or any page, console, request, or HTTP error.

Reproduce it from the repository root:

```powershell
npm ci
npm run test:browser-performance
npm run test:browser-crash
npm run test:browser-results
```

Run the DOM-free telemetry and pool/input unit gates separately:

```powershell
npm run test:effects
npm run test:input
npm run test:performance
```

## Telemetry design

The live recorder uses eight preallocated typed arrays in a fixed **360-frame rolling ring** for callback-to-callback wall interval, fixed ticks, backlog ticks, dropped time, clamped time, active effects, pooled/created effects, and effect capacity. The record path validates and clamps numeric samples, writes the current slot, and updates scalar counters. It does not grow an array or construct a per-frame report.

The browser harness adds a separate test-only 360-value `Float64Array` ring around the one game animation callback. This separates synchronous main-loop work from time spent waiting for a hosted browser to schedule the next callback. Its reset and record paths reuse fixed storage; only the requested final snapshot copies and sorts values.

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

| v1.8.1 Finish Forge desktop | v1.8.1 mobile DPR 2 |
|:---:|:---:|
| ![Finish Forge desktop receipt](../screenshots/v1.8.1/update-v181-finish-forge-hero.png) | <img src="../screenshots/v1.8.1/update-v181-mobile-finish.png" alt="Finish Forge at 390 by 844 and DPR 2" width="300"> |

| Visible action focus | Reduced Motion invariant |
|:---:|:---:|
| ![Finish Forge focus rail](../screenshots/v1.8.1/update-v181-focused-action.png) | ![Immediately complete static Finish Forge receipt](../screenshots/v1.8.1/update-v181-reduced-motion.png) |

The v1.8.1 files are deterministic local candidate captures. Their staged state identities, dimensions, determinism method, and evidence limits are recorded in the [v1.8.1 screenshot record](../screenshots/v1.8.1/README.md).

### Preserved Crash Theater evidence

| v1.8 live crash sample | v1.8 mobile DPR 2 sample |
|:---:|:---:|
| ![Crash Theater desktop hero](../screenshots/v1.8/update-v18-crash-hero.png) | <img src="../screenshots/v1.8/update-v18-mobile-crash.png" alt="Crash Theater at 390 by 844 and DPR 2" width="300"> |

| Exact crash proxies | Reduced Motion invariant |
|:---:|:---:|
| ![Ragdoll circles, sweeps, links, and contacts](../screenshots/v1.8/update-v18-ragdoll-proxies.png) | ![Static Splitline pose under Reduced Motion](../screenshots/v1.8/update-v18-reduced-motion.png) |

The v1.8 files are deterministic local candidate captures. Their exact state hashes, PNG hashes, dimensions, and capture limits are recorded in the [v1.8 screenshot record](../screenshots/v1.8/README.md).

### Preserved Smooth Ride evidence

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

These gates are designed to catch regressions such as an effect array growing without bound, fresh effect identity churn, synchronous main-loop or crash work moving beyond budget, non-finite crash poses/cameras, broken retry cleanup, fixed-step backlog, stale controls after pointer cancellation, or layout/input ownership disagreeing after rotation. Pacing remains visible to expose scheduler stalls, but it is not confused with the callback-work regression budget.

It does not substitute for profiling a production build on physical hardware. Before production release, record a comparable 10+ minute run on representative low/mid-tier Android hardware and an iPhone-class device. Include heavy dust/confetti/crash scenes, repeated retries, portrait/landscape rotation, background/foreground, real multi-touch, audio, haptics, browser UI expansion/collapse, thermal behavior, and battery impact. Also smoke-test the published GitHub Pages URL with a clean cache and an installed offline PWA.

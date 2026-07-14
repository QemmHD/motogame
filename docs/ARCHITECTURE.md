# Moto Rush X3 Architecture

This document describes the unmerged `v1.8.1` Fast Failure, Great Finish release-candidate architecture as it exists on 2026-07-14. The game is a static, framework-free Canvas 2D application. `public/` is the complete deployment boundary. Finish Forge consumes authoritative session results through DOM-free presentation policy; replay schema `1`, `physics-4`, and `course-4` remain current, while build/cache identity advances because player-visible result, input, accessibility, and reset behavior changed. Older build tapes remain explicitly incompatible even when their authoritative physics/course identities match.

## Runtime map

| Path | Responsibility |
| --- | --- |
| `public/index.html` | Canvas shell, mobile/PWA metadata, build metadata bootstrap, game-module load, and service-worker registration. The `?dev` flag deliberately skips service-worker registration. |
| `public/version.js` | Single runtime release and offline-cache version. Exposes frozen `globalThis.MOTO_RUSH_BUILD`. |
| `public/game.js` | Browser orchestration: asset/reference loading, DOM input adapters, replay selection, audio, save data, menus, pooled presentation effects, crash theater, camera, Canvas rendering, performance telemetry, and the animation loop. It advances the authoritative run session but does not reimplement its rules or scoring. |
| `public/run-session.js` | DOM-free authoritative fixed-step lifecycle: terrain/bike/rules/platform/force-field creation, playing/crashed steps, scoring, checkpoint capture/restore, triggered platform activation, ordered force-zone application, crash/respawn/finish transitions, and proof snapshots. |
| `public/effect-pool.js` | DOM-free fixed-capacity reusable effect storage with unique leases/generations, deterministic oldest-active eviction, stale-release rejection, clear-without-storage-reallocation, allocation-free active iteration, and bounded statistics. |
| `public/input-state.js` | DOM-free keyboard, multi-pointer, gamepad, and development-command aggregation; remapping; reusable fixed-tick reads; interruption clearing/pause recommendations; diagnostics; and left-hand layout metadata. |
| `public/ui-input.js` | DOM-free menu/result keyboard mapping and standard gamepad D-pad/stick/A/B rising edges with press/release hysteresis, held-input suppression, bounded controller scanning, and explicit clear/inspection state. |
| `public/finish-flow.js` | DOM-free score-ledger reconciliation, canonical millisecond finish arithmetic/formatting/PB comparison, legal next-route checks, result action construction/focus wrap, and mutation-free action resolution. |
| `public/perf-metrics.js` | DOM-free fixed typed-ring telemetry for frame/tick pressure, dropped/clamped time, effect counts, viewport/DPR/rotation, interruption events, and detached p50/p95/p99 summaries. |
| `public/levels.js` | `Course` builder DSL, `course-4` compatibility identity, and 16 authored definitions across Canyon Run, Stormworks, and R&D Yard. |
| `public/physics.js` | DOM-free `physics-4` terrain/bike simulation, collision response, platform integration, detached natural head-contact presentation metadata, surface behavior, landing grades/retention, flip signals, safety limits, and the public bounded impulse entry point used by hazards and force fields. |
| `public/rules.js` | DOM-free per-run state, deterministic full/checkpoint reset, tick-derived hazard motion, swept hazard checks, TNT behavior, checkpoints, near misses, and finish events. |
| `public/kinematics.js` | DOM-free immutable moving-ground definitions, fixed/local-tick poses, dormant activation, exact checkpoint snapshots, validated atomic restore, render sampling, swept one-way contact, carry, and bounded launch inheritance. |
| `public/force-zones.js` | DOM-free Kinetic Loom normalization and stateless fixed-step rectangle/sweep evaluation; applies bounded linear/angular impulses through the physics API and emits detached per-zone application metadata. |
| `public/replay.js` | DOM-free fixed-tick input tapes, RLE compression, strict base64url codec, deterministic state hashing, compatibility checks, and random-access playback. |
| `public/ragdoll.js` | DOM-free bounded `1 / 120` Crash Theater simulation: 17 bike/rider nodes, structural and breakable/releasable tether constraints, finite settling, Reduced Motion projection, first-contact impact metrics, a 48-record default queue, detached draining, and reusable/detached render snapshots. |
| `public/crash-contact.js` | DOM-free crash-entry snapshot of terrain and frozen one-way platform tops, with private query scratch state, exact line/rounded-endpoint circle sweeps, surface metadata/friction, hard source/query limits, and no authoritative aliases. |
| `public/crash-presentation.js` | DOM-free immutable ten-cause normalization, stable seed/noise functions, bounded pose measurement, finite dynamic camera/effect policy, and strict Reduced Motion camera/transient invariants. |
| `public/debug-proxies.js` | DOM-free finite/detached collision snapshot for terrain, bike sweeps, hazards, platforms, force-zone rectangles/arrows, checkpoints, finish triggers, and Crash Theater nodes/sweeps/links/impact metrics used by the development overlay. |
| `public/golden-tapes.json` | Versioned repository recovery reference for every built level; tokens are read-only runtime data and part of the offline boundary. |
| `public/strings.js` | Player-facing interface strings. |
| `public/logic.js` | Minimal generic game-host compatibility surface. It is currently a stub and is not the Moto Rush simulation. |
| `public/sw.js` | Versioned cache-first service worker and atomic runtime precache. |
| `public/manifest.json` | Installable web-app metadata and icons. |
| `public/assets/` | Runtime art, icons, textures, and music. |
| `tools/verify-public-assets.mjs` | Release verifier for syntax, JSON, local references, release metadata, and complete offline coverage. |
| `tools/rules.test.mjs` | Deterministic rules, collision metadata, terrain-mask, TNT, and repeated restart/checkpoint tests. |
| `tools/replay.test.mjs` | Replay roundtrip, RLE, restart-bit, lookup, hash, malformed/size/version, and physics-finish reproduction tests. |
| `tools/kinematics.test.mjs` | Moving-ground pose, immutability, carry, swept crossing, bounded inheritance, reset, and full-bike stability tests. |
| `tools/force-zones.test.mjs` | Kinetic Loom normalization, immutability, dormant behavior, overlap/sweep application, linear/angular impulse, ordering, and finite-bound fixtures. |
| `tools/crash-contact.test.mjs` | Seven exact tests for high-speed deck sweep, rounded endpoints, one-way underside behavior, shallow overlap, terrain identity, detached/frozen snapshots, malformed input, and hard iteration limits. |
| `tools/crash-presentation.test.mjs` | Six exact tests for all cause profiles, malformed fallback, stable hash/noise lanes, bounded pose measurement, strict Reduced Motion policy, and dynamic camera bounds. |
| `tools/ragdoll.test.mjs` | Ten tests for 30 finite/settling crashes, exact repeat, static/projected Reduced Motion, once-per-substep friction/contact, initial finite metrics, reusable/detached snapshots, bounded/drainable impacts, cause separation, and exact time partitioning. |
| `tools/run-session.test.mjs` | Browser-neutral finish, crash timing, manual/automatic respawn, full restart, scoring repeatability, trigger/checkpoint restore, stateless Loom re-entry, and authored-data immutability tests. |
| `tools/debug-proxies.test.mjs` | Seven proxy tests covering authoritative terrain/platform/force-zone alignment, detached Crash Theater nodes/sweeps/links/metrics, malformed ragdoll caps, finite bounds, truncation, and no mutation. |
| `tools/effect-pool.test.mjs` | Nine deterministic tests for hard bounds, eviction order, lease/generation safety, clear/reuse, iteration mutation, schema isolation, custom initialization, and finite statistics. |
| `tools/input-state.test.mjs` | Seventeen deterministic tests for keyboard aliases/remapping, multi-source and multi-pointer aggregation, cancel/lost-capture/lifecycle clearing, gamepad/dev replacement, reusable reads, left-hand metadata, and bounded churn. |
| `tools/ui-input.test.mjs` | Result/menu keyboard mapping, standard gamepad edges, deadzone release hysteresis, held-input suppression, clear/reset, malformed snapshots, and bounded controller tests. |
| `tools/finish-flow.test.mjs` | Exact score receipt, finish arithmetic, minute formatting, canonical PB, route safety, disabled focus wrap, and action-resolution tests. |
| `tools/release-metadata.test.mjs` | Explicit v1.8.1 package/runtime/cache/save/replay/physics/course/Gold contract plus complete runtime-import/precache coverage. |
| `tools/perf-metrics.test.mjs` | Six deterministic tests for exact quantiles/counters, ring wrap, validation/clamping, viewport/interruption events, detached/reset reuse, and long bounded churn. |
| `tools/test-physics.mjs` | Asserted 16-level headless completion, checkpoint recovery, and stability gate. |
| `tools/generate-golden-tapes.mjs` | Loopback-only real-browser generator for deterministic all-course recovery tapes. |
| `tools/verify-golden-tapes.mjs` | Strict manifest/token/catalog validator and twice-per-level clean-browser replay gate. |
| `tools/performance-browser.mjs` | Repeatable installed-Chrome desktop/mobile frame-profile gate, pool-bound checks, page/console error audit, and touch cancel/blur/rotation/left-hand interruption matrix. |
| `tools/crash-browser.mjs` | Repeatable installed-Chrome desktop/mobile/Reduced-Motion Crash Theater gate for exact rig/card state, finite pose/camera, frozen review, callback-work budgets, effect bounds, and clean retry/reset. |
| `tools/results-browser.mjs` | Repeatable installed-Chrome desktop/mobile Finish Forge gate for canonical receipt/semantic parity, 44 px target geometry, keyboard/touch/standard-gamepad routes, held-input suppression, safe missing/locked content, Reduced Motion, callback-work budgets, and clean reset. |
| `tools/capture-v18.mjs` | Deterministic double-capture harness for the v1.8 desktop hero, exact ragdoll proxies, mobile DPR 2 card, and static Reduced Motion gallery, including state and bounded raster comparison. |
| `tools/capture-v181.mjs` | Deterministic double-capture harness for the v1.8.1 Finish Forge desktop hero, focused action, mobile DPR 2 receipt, and static Reduced Motion gallery, including semantic/state and exact raster comparison. |
| `.github/workflows/pages.yml` | Runs the release gate for pull requests, manual dispatches, and `main`; only a successful push to `main` publishes the `public/` subtree to `gh-pages`. |

Keep authoritative simulation behavior in `physics.js`, `rules.js`, `kinematics.js`, `force-zones.js`, `run-session.js`, or `replay.js`. Keep browser-neutral presentation simulation/policy in `ragdoll.js`, `crash-contact.js`, `crash-presentation.js`, and `finish-flow.js`; keep other browser-neutral infrastructure in `debug-proxies.js`, `effect-pool.js`, `input-state.js`, `ui-input.js`, and `perf-metrics.js`. `game.js` adapts browser events, selects/records commands, advances `run-session.js`, and turns returned events into pooled presentation, sound, persistence, telemetry, and UI. Result receipts validate session values but do not replace scoring/star/finish authority. Crash contact, cause impulses, ragdoll state, camera policy, result focus, effect seeds, and performance measurements are deliberately not authoritative run state.

## Fixed-step data flow

The browser paints with `requestAnimationFrame`, but game state advances in fixed `1 / 60` second steps.

1. `version.js` initializes the build label and cache name before the ES modules load.
2. `game.js` loads assets plus the compatible repository Gold manifest and builds all level definitions once with `buildLevels()`.
3. `startLevel()` validates a supplied player/Gold tape when present, then calls `initializeRunSession()` to create fresh bucketed terrain, rules, kinematics, a normalized force-zone field, bike, scoring, and lifecycle state. Normal play creates a recorder tagged with level/build/physics/course compatibility metadata.
4. Each animation frame captures raw wall time, clamps a long gap to 100 ms, applies the current slow-motion multiplier, and adds the result to an accumulator. Raw/clamped values are diagnostic only.
5. While the accumulator contains at least one `1 / 60` second step, `simulate(STEP)` runs for active play or crash states. Pooled effects and the camera also update on this fixed cadence without replacement-array cleanup.
6. Once per rendered frame, the browser adapter polls connected gamepads into reusable scratch state and emits ride diagnostics only when their aggregate command changes. `simulate()` then reads the combined reusable ride-command target from `input-state.js`, or reads replay input. A normal run records that command exactly once; replay mode reads the mask for the same integer replay tick. The same raw snapshots pass separately through `ui-input.js` to produce presentation-only direction/confirm/back edges; a held ride button cannot synthesize a new result action edge.
7. Playing state calls `stepPlayingRun()` once. The session advances kinematics, steps bike physics, activates passed platform sensors, resolves platform contact, processes scoring, then advances rules/hazards. Only when that rules result is neither crash nor finish and the bike is above the fallout boundary does it evaluate Kinetic Looms. A Loom applies acceleration-scaled linear/angular impulse after the current bike solve, so the velocity change is consumed by the next fixed physics tick. Checkpoint capture and crash/fallout/finish transitions follow.
8. Crashed state calls `stepCrashedRun()` once. Manual restart is consumed on its recorded fixed tick; otherwise the unchanged 1.85-second session timer advances and auto-respawns at the deterministic boundary.
9. `game.js` consumes plain flips, landings, score records, blasts, Kinetic Loom applications/entries, near misses, platform activation, checkpoint, crash, finish, and respawn events to drive audio, haptics, pooled particles/popups/tracks, camera, ragdoll, persistence, and UI without mutating authoritative arithmetic. Every authoritative score event is also recorded in a presentation ledger; its final bucket sum must equal the session score exactly. The crash event carries a detached reason copy.
10. At crash entry, `game.js` normalizes the cause, derives a stable seed, freezes a detached terrain/platform contact field, and creates the 17-part rig with cause-specific rider/bike impulses and tether release. During crash ticks, the separate `1 / 120` solver advances, drained impact records drive bounded secondary feedback, and `readRagdoll()` refreshes the renderer snapshot. The session timer still advances only through step 8.
11. A finish finalizes or verifies the authoritative session snapshot. `finish-flow.js` validates elapsed minus flip credit against finish time, canonicalizes millisecond/PB comparisons, reconciles the score ledger, resolves the immediate legal next route, and returns a detached report/action list. `game.js` persists eligible records, starts the Finish Forge ceremony, mirrors it into a semantic dialog, and keeps Replay/Next mutation behind a second safe resolver. Rendering and result/crash presentation read state but do not advance authoritative bike/rules/platform ticks. After the frame, `perf-metrics.js` records frame duration, fixed ticks, accumulator backlog, clamped/dropped time, effect counts/capacity, and viewport state into its fixed ring.

Hitstop intentionally renders without advancing the fixed simulation. Slow motion changes how quickly fixed ticks are consumed relative to wall-clock time; it does not change the fixed simulation step, retry tick boundary, or replay input ordering. Hazard and platform movement derive from integer simulation ticks, not `performance.now()`. Force zones have no independent clock or mutable phase. Crash seeds use stable context rather than wall time. Equal versioned starting state and inputs therefore produce equal authoritative machine poses and field impulses; equal staged crash context also produces equal presentation policy and effect lanes.

## Browser input, effects, and performance

### Input boundaries

`input-state.js` knows no DOM, canvas, navigator, focus, or orientation APIs. The browser adapter converts keyboard codes, pointer IDs/coordinates, `navigator.getGamepads()` snapshots, and development autoplay into plain calls. The fixed-step hot path uses `readCommands(reusableTarget)`; detached `snapshot()` and source/telemetry reports are for QA only.

`ui-input.js` is a separate DOM-free edge adapter for menus/results. It maps standard D-pad/stick/A/B state to left/right/up/down/confirm/back and applies a lower release threshold after a direction is held. Only a false-to-true transition emits an edge. `game.js` suppresses confirmation when a direction edge arrives in the same poll, moves focus across enabled actions only, and resolves an action again before changing state. Keyboard UI commands use the same policy; Canvas pointer/touch activation uses only registered enabled rectangles. Ride-input masks and replay recording never include these UI edges.

Pointer zones are rebuilt from current CSS-pixel control geometry after resize or orientation change. Their radii and cluster spacing scale down at narrow widths so the 320 × 568 gate keeps all targets inside the viewport and opposing command circles disjoint. Up, cancel, and lost-capture paths release only the matching pointer. Blur, document-hidden, rotation, restart, and manual transitions clear every input source; pause recommendations let `game.js` own player-visible pause policy. The left-handed setting swaps the touch command-cluster metadata and geometry but never changes replay bit meaning.

### Effect bounds and lifetimes

`game.js` creates exactly three effect pools once:

| Pool | Hard capacity | Exhaustion behavior |
| --- | ---: | --- |
| Particles | 384 | Oldest active particle is deterministically reused. |
| Popups | 32 | Oldest active popup is deterministically reused. |
| Tracks | 220 | Oldest active track is deterministically reused. |

The maximum live/created presentation identity count is therefore 636. Acquisitions use unique leases and per-slot generations so an expired reference cannot release a newer occupant. A full restart clears active leases but preserves storage. Updating, expiring, and drawing iterate active linked slots directly; no `filter()`, `shift()`, or per-frame effect list is required. Pools remain presentation-only and are excluded from checkpoints and proof hashes.

### Allocation and draw audit

The current renderer retains v1.6's dimension/key-dependent sky and terrain-gradient caches, binary-searches each terrain chain to draw only the visible point slice, and reuses scalar camera accumulation, crash-ragdoll node lookups, engine state, menu/world lists, settings rows, control command targets, and effect callbacks. Some Canvas/browser primitives can still allocate internally; the contract is bounded JavaScript-owned effect storage plus repeatable frame measurements, not a claim of zero browser allocations.

### Telemetry contract

`perf-metrics.js` owns fixed typed arrays for 360 recent frames in the integrated browser. `recordPerformanceFrame()` performs validation and positional writes without growing storage. The browser loop consumes at most five fixed ticks in one rendered frame and retains at most six backlog ticks, so its backlog/drop counters describe actual bounded pressure instead of a post-drain constant. Explicit snapshots allocate detached, sorted reporting data and calculate FPS, mean, p50, p95, p99, maximum, slow/catch-up/backlog/drop/clamp totals, effect current/peaks, and viewport/DPR/rotation/focus/cancel counters. The live `?dev&performance` overlay requests these reports for inspection; the normal route does not show the overlay.

`tools/performance-browser.mjs` injects a harness-only wrapper around the game's sole `requestAnimationFrame` callback before navigation. Its fixed 360-value ring measures synchronous main-loop callback work independently of the time a hosted browser waits before scheduling the next frame. After a 750 ms warm-up, each profile measures Cliffhanger for at least three seconds and, when needed, waits up to 24 more seconds for 180 samples; that clean route remains active through the hosted runner's observed collection window. The game telemetry ring continues to report wall-clock pacing, fixed ticks, backlog, drops, and effects; the gate prints both views and applies calibrated 8/12 ms p95 budgets only to callback work. The final v1.8 aggregate local run measured 1.00 ms p95 at 1280 × 720 DPR 1 and 0.81 ms at 390 × 844 DPR 2, with 360 samples each. The preserved v1.7 local gate measured 1.00/2.20 ms, and [hosted Actions run 29307193559](https://github.com/QemmHD/motogame/actions/runs/29307193559) measured 1.10 ms for both predecessor profiles. The harness rejects a static/non-playing sample, mismatched probe/telemetry counts, inadequate sample or tick activity, and page/console errors. The mobile profile then checks disjoint/unclipped zones at 390 × 844 and 320 × 568, simultaneous pointers, selective cancellation, blur clearing/pause, rotation clearing/pause and canvas resize, telemetry events, and left-hand controls. Callback work does not include every compositor/GPU cost, so these results satisfy only the named automated main-thread gate and must not be generalized to untested physical phones or the undeployed production service-worker path.

`tools/crash-browser.mjs` uses the same callback-work wrapper around a real crashed-session path. It stages a deterministic cause after 28 presentation ticks, raises only the harness copy of `crashTimer` to 35 seconds so a slow runner can collect at least 180 unfrozen callbacks, and requires session tick, retry timer, dynamic pose, contact, impact, particles, and camera work to advance during measurement. Collection may wait up to 30 seconds independently of the strict 8/12 ms callback-work budgets, and a timeout reports the exact partial sample count. The production `1.85` second boundary is unchanged and remains separately covered by exact session tests. After measurement, the harness freezes the review frame for 112 tick-equivalent intervals, compares complete stable presentation state, performs manual retry, and requires every crash field/card to clear. The final local run measured 1.60 ms desktop TNT and 1.50 ms mobile DPR 2 saw p95 across 181 samples each; Reduced Motion kept pose tick `0` while its crashed-session timer advanced.

## Physics and collision model

World coordinates use pixels and screen-space orientation: positive `x` is right and positive `y` is down. Gravity therefore increases `y`.

The bike has three physical point masses: rear wheel, front wheel, and head. Ground motion uses Verlet/PBD constraints so the wheels follow terrain; airborne motion uses an explicit rigid center, angle, linear velocity, and angular velocity. Mode changes preserve velocity. The front and rear suspension values are a render/feel layer driven by real contact penetration and impact; they do not move separate collision nodes.

`buildTerrain()` converts level polylines into segments and a 64-pixel horizontal bucket index. Each segment carries:

- `surface` and `surfaceStrength` metadata;
- a `oneWay` flag, true by default;
- an enabled byte used by `setTerrainSegmentEnabled()`;
- bounds used to limit candidate contact checks.

Ordinary course ground is one-way from above. Contact normals point upward for the usual left-to-right course geometry, while shallow underside penetration is recovered to prevent solver tunnelling. A stamp array deduplicates segments found in adjacent buckets without allocating a `Set` on each query.

Current surface responses are:

| Surface | Physics behavior |
| --- | --- |
| `dirt` | Baseline rolling resistance, braking, drive, and restitution. |
| `ice` | Greatly reduced rolling resistance, traction, and braking authority. |
| `boost` | Adds driven acceleration scaled by `surfaceStrength`. |
| `bouncy` | Raises wheel restitution for a strong rebound. |

Hard limits cap collision/constraint energy (`maxLinearSpeed`) and downward fall velocity (`maxFallSpeed`). `landingImpact`, `landingQuality`, `landingGrade`, `landingRetention`, `landedThisStep`, flip events, grounded flags, center velocity, speed, and forward speed are simulation outputs for the client to consume. Landing grades are authoritative physics results; score text, particles, haptics, camera response, and sound remain presentation.

`resolveBikePlatforms()` is a separate post-bike step over the current kinematic run. It sweeps the previous/current wheel and head circles relative to each platform's previous/current rectangle, resolves valid one-way top crossings, writes bounded surface velocity into Verlet history, and includes wheel contact in grounded state. A head/frame hit can still crash the bike. This separation keeps the core terrain bucket format unchanged while moving-ground behavior matures.

## Content model

### Course geometry

A `Course` is a turtle-style builder over one or more ground polylines. Curves are sampled at approximately 10-pixel intervals. Its durable definition contains:

- `chains`: collidable terrain polylines;
- `render`: ground data used by the renderer;
- `hazards`: immutable hazard definitions;
- `platforms`: immutable solid-deck definitions with dimensions, motion, surface, and render metadata;
- `forceZones`: immutable non-solid field definitions with rectangle bounds, linear/angular acceleration, enable state, and detached render metadata;
- `checkpoints`: checkpoint positions;
- `decos`: non-simulation markers such as checkpoint art;
- `finishX` and `finishPt`;
- vertical bounds used by camera and fall-out logic.

Builder methods cover flats, slopes, hills, dips, rises, falls, ramps, landings, bumps, whoops, gaps, complete jump assemblies, surfaces, hazards, solid platforms, Kinetic Loom force zones, checkpoints, and the finish. `jump()` can populate a pit with spikes, barrels, or TNT. Every playable level returns a name, world, course, and three ordered star-time thresholds.

### Surfaces

Surface helpers temporarily tag newly generated terrain points, then restore the prior surface. `buildTerrain()` transfers point metadata to collision segments. A new surface is not complete until its builder API, collision response, visual language, tests, and at least one teaching setup in a level agree.

### Hazards

Level hazard objects are definitions and must not be mutated during a run. `createRunState()` clones them and adds runtime fields such as stable IDs, current/previous positions, spin, near-miss state, TNT fuse state, and explosion state.

Supported motion is calculated at a fixed 60-tick rate:

- sine patrol on the `x` or `y` axis;
- pendulum motion around an anchor;
- piston motion on the `x` or `y` axis.

Hazard collision is swept between each bike node's previous/current position and each hazard's previous/current position. This reduces tunnelling when both objects move quickly. Saws, spikes, barrels, maces, and crushers currently resolve as lethal radius checks rather than solid kinematic terrain. TNT has a trigger radius and short fuse; its core is lethal, while its outer radius applies a launch impulse and emits an impulse event.

The checkpoint list always begins with the course start. Progress advances when the bike passes checkpoint `x` coordinates. Crossing a checkpoint captures `run.tick`, `cpIndex`, cloned hazard runtime fields, and an exact kinematic snapshot. `respawnRunSession()` reconstructs clean rules state and restores the validated platform snapshot, so hazard changes and platform activation/motion after the checkpoint never survive a retry. Kinetic Looms require no checkpoint payload: their definitions are immutable and entry/exit/sweep results derive from the restored bike's previous/current geometry on each step. The session accepts finish only when the bike is not crashed.

### Kinematic platforms

Platform definitions are cloned, normalized, and deeply frozen when `createKinematicRun()` starts. Each runtime record keeps previous/current poses so collision can be relative and drawing can interpolate without mutating authoring data. Supported motion families are static, sine, ping-pong, lift, and piston aliases along one axis. `startActive: false` keeps a solid deck at base until `activateKinematicPlatform()` begins its local timeline; authored `triggerX` policy is owned by the run session.

Current solid geometry is intentionally narrow: an axis-aligned rectangle with a one-way top. It is enough for freight shuttles, elevators, recovery decks, stable carry, bounded apex launches, and rear-wheel gas/brake/reverse relative to deck velocity. Head sweeps remain lethal even when a wheel contacts the same deck. It is not yet arbitrary moving terrain, a rotated collider, or a solid side/ceiling. Kinetic Looms are a separate non-solid volume mechanic, not an extension of the platform collider. Visible deck dimensions must match the rectangle returned by `sampleKinematicPlatform()`.

Full restart creates a fresh kinematic run at tick zero. Checkpoint capture stores every platform's active/activation state and complete previous/current pose. Restore validates the whole detached snapshot before mutation, then resumes the same local/global motion phase. This exact contract is required for a replay proof to reproduce triggered moving ground.

### Kinetic Loom force zones

`Course.forceZone()` authors an original Kinetic Loom as a non-solid axis-aligned rectangle. `createForceZoneField()` validates and deeply freezes each normalized definition: stable `id` and `kind`; center `x`/`y`; positive `width`/`height`; exact `bounds { left, right, top, bottom }`; `acceleration { x, y }`; `angularAcceleration`; `enabled`; and detached `render` strings. The runtime field exposes a frozen `zones` list and does not add occupancy, cooldown, timer, or checkpoint state.

`stepForceZones()` derives previous/current bike-node overlap and swept entry from bike geometry already produced by the physics step. The continuous test uses exact circle-to-rectangle distance, including rounded corner distance instead of a square radius expansion. An enabled zone applies its linear acceleration and angular acceleration once for that fixed step through the public physics impulse API. Its detached application record identifies the zone and reports geometry, acceleration, the applied impulse, entry/exit/sweep classification, and hit nodes for presentation and QA. Disabled or non-overlapping fields are dormant and must leave the bike unchanged.

Run-session ordering is deliberate: kinematics and bike/platform collision resolve first; scoring and `stepRunRules()` then decide lethal hazards and finish; only a surviving, unfinished, in-bounds bike can receive a Loom impulse. Because that impulse is written after the current solve, its velocity effect begins on the following fixed tick. Crash and finish therefore win same-tick conflicts, and a field cannot rescue or alter a run that rules already ended.

`buildDebugProxySnapshot()` reads `forceZones.zones` (or authored `level.course.forceZones` before runtime initialization) without running a contact query. Each bounded, finite, detached proxy contains `id`, `active`, `kind`, exact rectangle `bounds`, `center`, linear and angular acceleration, a center-origin direction `arrow` clipped to the rectangle, and sanitized render strings. `limits.maxForceZones` caps output and `truncated.forceZones` reports omitted records. Renderer mutations cannot leak into authoritative definitions.

### Replay tapes and proofs

Replay input is a five-bit mask (`gas`, `brake`, `lean left`, `lean right`, `restart`) sampled once per fixed game tick. Adjacent identical masks are stored as `[mask, count]` runs. The codec uses a compact fixed-key JSON object encoded as unpadded base64url; strict field, range, canonical-form, tick, run-count, byte, and token-length checks apply before untrusted data reaches playback.

Every tape carries schema, level ID, build version, physics version, and course-generator version. `decodeReplay()` returns a structured `MALFORMED`, `TOO_LARGE`, or `INCOMPATIBLE_VERSION` result rather than throwing into game flow. `createReplayPlayback()` precomputes cumulative run ends and provides random `maskAt(tick)` / `inputAt(tick)` lookup. Manual crash respawn is queued and consumed on a fixed tick, so its restart bit reproduces the same checkpoint timing. The game treats reaching `finishTick` without a finish as divergence instead of continuing on neutral input indefinitely.

At finish, `snapshotRunSession()` builds a quantized proof record containing session/rules/platform ticks, lifecycle/scoring state, checkpoint, time, bike state, expanded hazard state, and platform previous/current/activation state; `game.js` adds the matching replay tick. `hashReplayState()` sorts object keys and returns an eight-hex FNV-1a fingerprint. A normal finish is labeled **Proof Recorded**; player playback shows **Proof Verified**, and repository playback shows **Gold Reference Verified**, only after finish tick and final-state hash match. Camera, particles, random dust/exhaust, audio, and ragdoll presentation are excluded because they are not authoritative run state.

Replay playback never updates unlocks, stars, best times, or best scores. One player token per level currently lives in the local save. `golden-tapes.json` adds one checked-in recovery reference per course; the release gate replays each twice in a real browser. PB ghosts, human safe/apex classes, migrations, pruning, URL import/export, and challenge UX remain future layers.

### Crash presentation

`normalizeCrashCause()` first converts the session's detached reason into one of ten immutable presentation profiles. Terrain head contact and one-way-platform head contact publish finite natural presentation records from the physics/session boundary; they are deliberately excluded from `lastCrash` and proof snapshots, preserving the existing authoritative hash contract. Hazard reasons keep their established rules-owned path. Each profile supplies a label/accent/glyph, finite cause location/intensity, separate rider/bike impulse hints, and an immutable tether-release list. Stable hashing/noise functions derive presentation lanes without `Math.random()` or wall time.

`createCrashContactField()` clones valid terrain collision segments and enabled state into private query data and freezes every current platform rectangle. The public field never aliases authoritative terrain dedupe scratch or moving-platform state. `queryCrashContact()` delegates terrain geometry to the established circle/segment contact and adds one-way platform top contact with current overlap, line sweep, and exact rounded-endpoint sweep. A node already underneath or moving upward from underneath passes through. Inputs and source counts are strictly bounded.

`createRagdoll()` copies the authoritative bike snapshot into 17 independent bike/rider nodes and constraints. The Splitline structure contains five bike nodes, hip/torso/head/helmet, paired elbows/hands, and paired knees/feet. It applies shared motion plus cause-specific group impulses only to the new presentation nodes. Structural constraints preserve the segmented silhouette; five softer hip/hand/foot tethers may break or be explicitly released.

`stepRagdoll()` advances at its own bounded `1 / 120` step and receives detached contact through a callback, allowing the module to stay DOM-free. Gravity, damping, substeps, solver passes, speed, distance, correction, settling, and lifetime are clamped. Friction, contact count, and impact emission apply only on a node's first contact in one physical substep, never once per solver iteration. Impact records are finite detached metadata with a default 150 px/s threshold and 48-record queue; total/peak/drop metrics continue even when storage is full. `drainRagdollImpacts()` copies pending records into caller-owned storage and clears the internal queue.

`readRagdoll()` returns a renderer-friendly pose. Callers can request a fully detached snapshot or reuse their own node/link objects to avoid crash-frame churn; neither path exposes writable simulation records. `debug-proxies.js` makes a second bounded detached projection for circles, sweeps, links, bounds, contacts, impacts, broken tethers, and motion/clamp metrics.

`measureCrashPoseBounds()` and `buildCrashCameraPolicy()` frame the whole detached scene inside finite position/span/view limits. Normal mode adds deterministic decaying fit, roll, kick, shake, flash, hitstop, and slow policy. Reduced Motion returns fixed base view height, zoom `1`, roll/kick/shake/hitstop/flash `0`, and slow `1`. A reduced request at creation makes a static pose and projects every part out of the detached field without simulation; enabling the setting mid-crash freezes the current node histories. Browser code suppresses animated impact glyphs, secondary contact FX/audio/haptics, and impact camera additions while keeping cause/retry information.

The ragdoll begins only after the authoritative run has failed. It cannot change checkpoints, time, score, hazards, platform snapshots, Kinetic Looms, replay input/tick, or proof state. Manual retry remains a recorded fixed-tick input and automatic retry remains the same 1.85-second session boundary. Crash presentation determinism is tested but intentionally excluded from run-proof hashes.

## Browser state and persistence

The browser client persists JSON under `localStorage` key `motoRushX3.save.v1`. The current shape includes:

- best time by level;
- best score by level;
- best star count by level;
- highest unlocked level;
- one last completed replay token by level;
- music, sound-effect, reduced-motion, haptics, and left-hand-control settings;
- mute state.

Reads and writes are wrapped in `try`/`catch`, and missing fields receive defaults. There is no separate migration framework: a breaking save-shape change must either preserve these fields, migrate data during `loadSave()`, or intentionally introduce a new key with a documented reset policy.

The browser owns event listeners, but `input-state.js` owns held ride commands and `ui-input.js` owns held UI edges. Multiple simultaneous pointers clear independently on `pointerup`, `pointercancel`, and `lostpointercapture`. Keyboard, pointer, gamepad, development, and UI edge state clear on their relevant lifecycle/run transitions, and active play pauses when the page loses focus, becomes hidden, or rotates. Pointer-surface reconfiguration also invalidates old pointer holds. Starting or leaving Finish Forge additionally clears semantic buttons/live announcements, focus/timers, pooled effects/tracks, camera/crash state, queued restart state, scheduled audio cues, and active synthesized SFX sources.

## Offline and deployment model

`public/version.js` is authoritative for both the menu label and service-worker cache identity. The service worker imports it, atomically adds the literal `PRECACHE` list during install, removes only stale caches with the Moto Rush prefix during activation, and uses cache-first fetches. Successful same-origin network responses may populate the cache at runtime. Query strings are ignored for cache matching.

`tools/verify-public-assets.mjs` enforces that every runtime file under `public/` is explicitly precached, every literal local reference resolves, all public JavaScript parses, JSON is valid, the cache name derives from the single semantic version, and the precache contains only literal canonical paths. Replay, kinematics, force zones, run session, finish flow, UI input, debug proxies, crash contact, crash presentation, effect pools, ride input, performance metrics, ragdoll, rules, physics, levels, Gold data, bike art, and music are covered. `release-metadata.test.mjs` additionally walks the runtime ES-module import graph and requires every reachable module in the literal precache. Additions to `public/` therefore require a matching `PRECACHE` entry.

The Pages workflow runs `npm test` for pull requests into `main`, manual dispatches, and pushes to `main`. Only a successful push to `main` may publish: it splits `public/` into a temporary branch and force-pushes that subtree to `gh-pages`. Feature branches and manual runs cannot update production. Because the deployed root is the contents of `public/`, repository-relative paths outside `public/` are never available to the live game.

## Core invariants

Preserve these rules when changing the game:

1. Simulation uses a fixed `1 / 60` second step; wall-clock time must not directly drive course rules or hazard motion.
2. `physics.js` and `rules.js` remain DOM-free and executable in Node tests.
3. `kinematics.js`, `force-zones.js`, `run-session.js`, `finish-flow.js`, `ui-input.js`, `debug-proxies.js`, `replay.js`, `ragdoll.js`, `crash-contact.js`, `crash-presentation.js`, `effect-pool.js`, `input-state.js`, and `perf-metrics.js` also remain DOM-free and executable in Node tests.
4. Course definitions, especially `course.hazards`, `course.platforms`, and `course.forceZones`, stay immutable during play; mutable state belongs to a run object. Kinetic Looms remain stateless unless a future version explicitly changes the reset/proof contract.
5. Positive `y` is down, and normal course ground and platform tops are one-way from above.
6. The configured wheel radius is both the collision radius and the visual radius.
7. A run is not complete if the finish and a crash occur together.
8. Full restart returns to authored tick-zero state; checkpoint retry returns to captured rules and exact validated kinematic snapshots, including triggered-platform local phase.
9. Replay input is recorded/read once per fixed simulation tick. Playback cannot mutate progression, and proof hashes exclude non-authoritative presentation state.
10. Schema, level, build, physics, and course versions must match before replay playback.
11. New public runtime files and local references must be present in the static service-worker precache.
12. `public/version.js` contains the only runtime release-version literal and owns cache invalidation.
13. Every level has a start, at least one valid route, a finish, and three star thresholds ordered fastest to slowest.
14. Particle, popup, and track identities remain hard-bounded at 384, 32, and 220 unless a separately measured release intentionally changes those budgets.
15. Blur, hidden-document, rotation, pointer cancel, and lost capture cannot leave ride commands held; layout changes must invalidate old pointer geometry.
16. Frame telemetry, random presentation effects, camera, audio, and ragdoll state never enter authoritative checkpoints or replay hashes.
17. A release must pass asset/offline checks, all deterministic system tests, all-level completion/stability tests, all compatible repository proofs, and the repeatable real-browser performance/input gate. Production sign-off additionally requires the deployed cache/offline and physical-device smoke appropriate to the claim.
18. Force-zone evaluation remains after rules and before lifecycle transition; same-tick crash/finish outcomes take priority, and the resulting impulse begins affecting motion on the next physics tick.
19. Crash Theater is created only after authoritative failure; its field, cause profile, impulses, rig, impacts, seeds, camera, audio, haptics, and debug records cannot write run/checkpoint/replay state.
20. The automatic crash retry boundary remains 1.85 fixed-simulation seconds and manual retry remains a replay-recorded fixed-tick command unless an intentional future U06 authority version changes it.
21. Ragdoll contact fields snapshot terrain and platform pose at crash entry; they cannot retain authoritative arrays, dedupe scratch, or live moving-platform references.
22. Reduced Motion keeps crash zoom/view height constant and disables all crash slow/hitstop/flash/roll/shake/kick and secondary impact transients while preserving a readable static pose and retry affordance.
23. Ragdoll impact storage and browser secondary crash output remain hard-bounded; saturation increments explicit drop/eviction metrics instead of growing arrays.
24. Authoritative elapsed time, flip credit, finish time, score, and stars come from `run-session.js`. Finish presentation must reconcile those exact values and never introduce a second scoring, star, or net-time formula.
25. Result time/PB comparisons use canonical integer milliseconds; score receipts equal the authoritative integer total exactly.
26. Next may start only the immediate playable unlocked catalog entry. Retry, Replay, Next, Menu, and Gold Run must pass a detached resolver before browser/save state changes; missing or disabled actions fail closed.
27. A held ride/gamepad control cannot create a fresh result confirm edge. Result focus wraps through enabled actions only, and every enabled Canvas target remains at least 44 × 44 CSS pixels, contained, and non-overlapping at the 320 × 568 minimum gate.
28. Every Finish Forge exit clears its presentation, semantic, effect, camera/crash, UI-input, and scheduled/active audio ownership before the next live/replay/menu state is exposed.

## Safe extension recipes

### Add or change a level

1. Build geometry with `Course` methods in `public/levels.js`; keep hazards readable and provide recovery runway around new mechanics.
2. Add checkpoints before long or high-risk sections and terminate with `.finish()`.
3. Return `{ name, world, course, star }`, then include the level in `buildLevels()` in unlock order.
4. Run the terrain-only and rules/hazards completion gate. A passing AI route is a regression floor, not proof that the level is fun or that star times are fair.
5. Play the level with keyboard and touch controls, validate every checkpoint respawn, and calibrate star thresholds with human runs.

### Add a hazard or motion type

1. Add only immutable authoring data to the `Course` API.
2. Initialize all mutable flags in `runtimeHazard()`.
3. Derive movement from `tick`; do not use wall-clock time or mutate the level definition.
4. Define collision radius, swept behavior, crash/impulse events, and checkpoint-restart expectations in `rules.js`.
5. Add a clear telegraph and renderer in `game.js`.
6. Add deterministic unit coverage and an authored teaching setup before using the mechanic in a mixed gauntlet.

### Add a kinematic platform

1. Add immutable dimensions, motion, surface, and render fields through `Course.platform()`; give the platform a stable unique ID.
2. Keep motion an integer-tick function in `kinematics.js`. Do not sample wall-clock time or mutate authored definitions.
3. Make the rendered rectangle/support language agree with the sampled collision bounds.
4. Define full-restart and checkpoint-restored tick behavior before adding triggers or persistent switches.
5. Test high-speed crossing, idle carry, complete-bike carry, launch inheritance, exact reset, and immutability.
6. Author a recoverable teaching route and record both safe and apex reference tapes before claiming the platform family complete.

### Add a Kinetic Loom

1. Author immutable center, dimensions, acceleration, angular acceleration, enable state, and render strings through `Course.forceZone()`; give every field a stable unique ID.
2. Keep the field non-solid and stateless. A stateful switch, cooldown, or moving volume needs an explicit checkpoint/replay design rather than hidden renderer state.
3. Keep rendered bounds, normalized `bounds`, overlap/sweep evaluation, and the collision-debug rectangle exactly aligned.
4. Preserve run-session ordering: rules decide crash/finish before the field can apply an impulse, and impulse effects begin on the next physics tick.
5. Add normalization, dormant-baseline, direct-overlap, swept-entry, finite-bound, reset/re-entry, proxy-detachment, and authored-data immutability fixtures.
6. Put the field first in a forgiving teaching setup, then verify keyboard/touch recovery and regenerate compatible Gold references only after intentionally bumping proof versions.

### Add a surface

1. Add a scoped `Course` helper that restores the previous surface after generating its segment.
2. Add named behavior to `resolveWheel()` using `surfaceStrength` where appropriate.
3. Add a unique, legible rendered treatment and feedback.
4. Add metadata and physics assertions, then validate braking, reverse travel, landing, and checkpoint respawn on the surface.

### Add or change a Crash Theater cause

1. Keep the authoritative crash event plain and deterministic in `rules.js` / `run-session.js`; clone its reason before giving it to browser presentation.
2. Add or map the cause in `crash-presentation.js` with a finite original label, accent, glyph, rider/bike impulse balance, and explicit tether-release list. Do not read wall time or random browser state.
3. Reuse the detached `crash-contact.js` field. A new presentation collider must snapshot its source, define one-way/two-way semantics, enforce hard limits, and prove it cannot alias authoritative mutable data.
4. Keep impact records finite and queue/output bounds unchanged unless a measured release intentionally revises them.
5. Add malformed-input, exact-repeat, finite/settling, Reduced Motion, proxy, and authority-detachment tests. If retry timing, run state, or bike state changes, treat the work as an authoritative U06/physics change instead of presentation tuning.
6. Capture normal, debug, mobile, and Reduced Motion examples, then run all Gold references to prove no authoritative outcome drift.

### Change finish results or progression actions

1. Keep elapsed time, flip credit, finish time, score, and stars authoritative in `run-session.js`; expose a plain exact finish event instead of reading browser presentation state.
2. Extend `finish-flow.js` with a detached validated field or action. Require score/time reconciliation and fail closed on malformed catalog, progression, proof, or record data.
3. Keep keyboard/gamepad result commands edge-triggered in `ui-input.js`. Mirror every visible Canvas action and disabled state into the semantic dialog, and preserve minimum target geometry.
4. Add reset ownership for timers, focus, semantic/live-region state, effects/tracks, camera/crash state, queued input, and scheduled/active audio before adding a new exit route.
5. Extend DOM-free policy/session tests, the strict result-browser keyboard/touch/gamepad/semantic/route/reset matrix, Reduced Motion assertions, and deterministic desktop/mobile captures.
6. If scoring, star thresholds, finish timing, unlock semantics, or proof-relevant state changes, version the appropriate authority domain and regenerate Gold tapes intentionally; a presentation-only change must preserve non-token outcomes.

### Add a runtime asset or module

1. Place it under `public/` and reference it with a relative path.
2. Add the exact literal path to `PRECACHE` in `public/sw.js`.
3. If the deploy changes player-visible runtime behavior, bump `public/version.js` so installed clients receive a fresh cache.
4. Run `npm test`, update the release records, and smoke-test once with `?dev` before testing the normal service-worker path.

### Change proof-relevant simulation state

1. Decide whether the change affects authoritative finish reproduction. If yes, bump `PHYSICS_VERSION` or `COURSE_VERSION` intentionally.
2. Add required deterministic fields to `snapshotRunSession()` in stable quantized form; never include camera, audio, particles, or wall-clock values.
3. Keep old tokens incompatible unless a tested migration can genuinely reproduce their old semantics.
4. Extend replay roundtrip, mismatch, malformed-data, and recorded-physics fixtures.
5. Regenerate repository recovery tapes only for an intentional versioned change, inspect the manifest diff, and replay all of them twice; do not infer compatibility from a unit test alone.

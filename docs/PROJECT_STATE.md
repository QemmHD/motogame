# Moto Rush X3 Project State

Last updated: **2026-07-13**

This is the canonical pickup note for the active repository state. Update it whenever a batch changes the build, compatibility identity, acceptance evidence, known risks, or next priority. Chat history is not project state.

## Repository and release coordinates

| Item | Current value |
|---|---|
| Product | Moto Rush X3 |
| Candidate | `1.6.0` — Smooth Ride |
| Runtime source of truth | `public/version.js` |
| Package version | `1.6.0` |
| Replay identity | schema `1`; physics `physics-3`; course `course-3` |
| Working branch | `agent/motorush-30-update-foundation` |
| Remote | `https://github.com/QemmHD/motogame.git` |
| Draft pull request | `#1` — branch review/promotion vehicle |
| Candidate delivery state | `v1.6.0` is on the feature branch and draft PR `#1`; it is not production |
| Production URL | <https://qemmhd.github.io/motogame/> |
| Deployment boundary | `public/`, published to `gh-pages` only through the eligible workflow |
| Save key | `motoRushX3.save.v1` |

The v1.6 release candidate is tracked on the feature branch and draft PR; its exact head can advance independently of this durable handoff note. Use `git rev-parse HEAD`, `git status -sb`, and the draft PR for current coordinates. A pushed feature branch is still not production: do not describe v1.6 as live until review, promotion to `main`, a successful GitHub Pages run, and canonical URL/cache/offline smoke are recorded.

The build-version field is part of replay compatibility. Repository Gold tokens were therefore regenerated for `1.6.0`, but authoritative simulation identities remain `physics-3` and `course-3`; Smooth Ride did not intentionally change bike, rules, hazard, platform, scoring, or course behavior.

## Current playable catalog

The candidate contains **15 handcrafted levels across three worlds**:

- **Canyon Run, L1–L6:** Warm-Up, Air Time, Whoops & Woes, Danger Zone, Cliffhanger, Grand Finale.
- **Stormworks, L7–L12:** Boostline, Pendulum Pass, Cold Circuit, Blast Foundry, Piston Works, Stormbreak.
- **R&D Yard, L13–L15:** Freight Flight, Lift Logic, Proof Circuit.

R&D Yard remains a focused mechanics lab rather than a full six-course world. Lift Logic teaches the first sensor-triggered moving deck, with a recoverable lower trail. Progression persists unlocks, stars, best time, best score, settings, and the player's latest completed proof per level. Every current course also has a read-only repository Gold Run loaded from `public/golden-tapes.json`.

## v1.6 integrated architecture

### Authoritative run session remains stable

`public/run-session.js` is still the DOM-free authority for terrain/bike creation, rules and kinematic state, fixed playing/crashed steps, scoring, checkpoints, crash/fallout/respawn/finish transitions, and proof-ready snapshots. Browser performance, input telemetry, particles, camera, audio, UI, and ragdoll presentation remain outside the proof hash.

Smooth Ride changes presentation ownership and instrumentation around this session. It does not change the `1 / 60` fixed-step order protected by the 15 Gold Runs.

### Bounded effect ownership

`public/effect-pool.js` owns reusable, fixed-capacity presentation identities. Each acquisition returns a unique lease and increments the slot generation. Releasing an expired lease cannot release a newer occupant. If a full pool is acquired, it deterministically evicts the oldest active lease. `clear()` invalidates active leases while preserving allocated storage and already-created objects; `forEachActive()` updates/draws without creating a per-frame array.

The browser integrates three hard bounds:

| Pool | Capacity | Typical contents |
|---|---:|---|
| Particles | 384 | dust, sparks, fire, smoke, confetti, clods, exhaust |
| Popups | 32 | flip, landing, score, checkpoint, and machine labels |
| Tracks | 220 | fading tire marks |
| **Total** | **636** | all pooled presentation identities |

Pool statistics expose active, created, reused, evicted, and peak counts for QA. Created/active/peak counts must never exceed the owning capacity. Full restart and checkpoint presentation cleanup clear the appropriate pools without replacing their storage.

### Extracted input ownership

`public/input-state.js` is a DOM-free command aggregator. `game.js` converts browser events and geometry into plain calls, but held-command ownership lives in the module. It supports:

- keyboard code normalization and configurable/removable bindings;
- independent simultaneous pointers with movement-based zone recomputation;
- pointer up, cancel, and lost-capture release paths;
- complete gamepad snapshot replacement with buttons and axes;
- allocation-stable once-per-rendered-frame gamepad polling that suppresses unchanged events;
- complete development/autoplay snapshot replacement;
- combined commands when multiple sources agree or overlap;
- allocation-free `readCommands(reusableTarget)` for fixed ticks;
- detached snapshots, source diagnostics, clear-reason counters, and pause recommendations;
- clear-all boundaries for blur, hidden documents, rotation, manual reset, and pointer-surface rebuild;
- left-handed layout metadata that swaps command clusters without changing command semantics.

The persisted **LEFT-HAND CONTROLS** setting swaps gas/brake and lean clusters. Keyboard and replay meaning remain unchanged. Rotation rebuilds pointer zones, clears every source, records the event, and pauses active play so pre-rotation touches cannot survive into the new layout.

### Frame and allocation telemetry

`public/perf-metrics.js` keeps a fixed 360-frame typed-array ring in the browser. Recording a frame writes into preallocated buffers; sorting and detached report objects occur only when a snapshot is explicitly requested. Reports include FPS; mean, p50, p95, p99, and maximum frame time; slow/catch-up/backlog/drop/clamp counters; current and peak effect usage; viewport/DPR/rotation; and focus/cancel event counts.

`?dev&performance` exposes this data in the live browser overlay. The animation loop consumes at most five fixed ticks per rendered frame, retains at most six queued ticks, and records raw wall-frame time, clamped time, fixed ticks consumed, real remaining backlog, bounded dropped time, and pooled-effect state after rendering. These values are diagnostic only and never enter authoritative state or replay hashes.

The rendering audit also removed avoidable allocations and excess work from the active path:

- sky and terrain gradients are cached and rebuilt only when their size/key changes;
- terrain chains use binary-search visible slices before path construction;
- camera focus uses scalar accumulation instead of transient reduce objects;
- crash-ragdoll drawing reuses node lookup state and avoids per-frame sets/sorts;
- engine updates, menu/world lists, settings rows, control display commands, and effect callbacks reuse stable structures;
- effect expiry releases in place instead of `filter()` replacement arrays, and track pressure no longer shifts arrays.

### Performance and interruption browser gate

`tools/performance-browser.mjs` starts the local static deployment boundary, launches an installed Chrome/Chromium, blocks service workers, captures three seconds of live autoplay after warm-up, rejects page/console errors, validates pool bounds, and runs two named profiles:

| Profile | Local measured p95 | Current harness budget | Result |
|---|---:|---:|---|
| 1280 × 720, DPR 1, desktop | 7.10 ms | 20 ms | Pass |
| 390 × 844, DPR 2, mobile/touch emulation | 10.70 ms | 25 ms | Pass |

Both observed p95 values are below the roadmap's 16.7 ms target. These are repeatable local headless-Chrome measurements, not evidence for every physical phone. The mobile pass additionally asserts disjoint and unclipped control zones at 390 × 844 and 320 × 568, two-pointer gas/lean aggregation, selective pointer cancellation, blur pause/clear, portrait-to-844 × 390 rotation pause/clear, exact canvas resize, telemetry counters, and left-hand UI/layout state.

## Repository Gold Run evidence

Manifest: `public/golden-tapes.json`

| Measure | Current result |
|---|---|
| Catalog coverage | 15 of 15 current levels |
| Route classification | `recovery` |
| Browser attempts per tape | 2 clean contexts |
| Total verified replays | 30 |
| Divergences | 0 |
| Compatibility | build `1.6.0`; schema `1`; `physics-3`; `course-3` |
| Authoritative reason for regeneration | None; build compatibility only |

The full course table and regeneration policy remain in `docs/qa/GOLDEN_TAPES.md`. These are deterministic automation references, not clean-human, safe/apex, star-target, or personal-best claims.

## Release gate

Run from the repository root with a Node 22-compatible toolchain and a locally installed Chrome/Chromium-family browser:

```powershell
npm ci
npm test
```

The full gate runs:

```powershell
npm run test:assets
npm run test:systems
npm run test:physics
npm run test:goldens
npm run test:browser-performance
```

Current expected coverage:

- **Asset/offline:** 3 subtests.
- **Deterministic systems:** 76 subtests—44 existing rules/replay/kinematics/ragdoll/session/proxy tests, 9 effect-pool tests, 17 input-state tests, and 6 performance-metrics tests.
- **Physics/routes:** 15 of 15 authored levels.
- **Browser Gold Runs:** 15 tapes × 2 attempts = 30 verified replays.
- **Browser profiles:** 2 measured profiles plus the mobile interruption/rotation/left-hand matrix.

Focused commands:

```powershell
npm run test:effects
npm run test:input
npm run test:performance
npm run test:browser-performance
npm run test:rules
npm run test:replay
npm run test:kinematics
npm run test:ragdoll
npm run test:session
npm run test:debug
npm run test:goldens
```

Regenerate references only for an intentional build/compatibility or authoritative behavior change:

```powershell
npm run generate:goldens
npm run test:goldens
```

Inspect every manifest diff. A build-only regeneration must not be described as a physics or course change. `package-lock.json` is tracked; do not delete or silently regenerate it with a different dependency intent.

## Visual evidence

Latest performance, input, and responsive QA captures live under `docs/screenshots/v1.6/`:

- `update-v16-performance-desktop.png` — desktop Smooth Ride performance overlay.
- `update-v16-performance-mobile.png` — 390 × 844 DPR 2 mobile profile.
- `update-v16-performance-live.png` — active pooled effects and live telemetry during play.
- `update-v16-rotation-safe.png` — 844 × 390 rotated layout after controls were safely cleared.
- `update-v16-left-hand-settings.png` — persisted left-hand setting in the settings panel.
- `update-v16-left-hand-play.png` — swapped touch clusters during active play.
- `update-v16-narrow-controls.png` — standard disjoint touch targets at the 320 × 568 minimum-width gate.
- `update-v16-narrow-left-hand.png` — the same minimum-width gate with left-handed clusters enabled.

The v1.5 Gold/reference/collision gallery and v1.4 gallery remain preserved under their version directories. Screenshots are local candidate evidence; they do not prove the production URL serves the same build.

## Roadmap acceptance state

| Update | Status after v1.6 | Evidence | Still open |
|---|---|---|---|
| U01 Release Gate | Release candidate | 3 assets, 76 systems, 15 routes, 30 Gold passes, 2 browser profiles | Eligible deploy and production cache/install/offline smoke |
| U02 Restart Contract | Partial foundation | Shared DOM-free session, 50-repeat rules restore, exact hazard/platform snapshots, extracted ride input | Physical keyboard/touch/gamepad results/restart matrix and further module splits |
| U03 Smooth Ride | Release candidate | Hard-bounded 384/32/220 pools, typed-ring metrics, 17 input tests, 6 metric tests, 2-profile p95, cancel/blur/rotation/left-hand matrix | Physical low-end phone and production-profile confirmation |
| U04 Collision Keystone | Partial foundation | Swept platforms/hazards, proxy builder, aligned browser overlay | Force zones and general moving/closed chains |
| U05 Crash Theater | Playable preview | Deterministic finite ragdoll, static reduced-motion pose, optimized renderer | Final authored part art and physical-device crash matrix |
| U07 Engine Soul | Playable preview | Landing grades, momentum retention, five gear bands, reactive audio | Wheelie meter, tire/surface layers, measured envelopes/audio budget |
| U09 Proof Replays | Release candidate | 15 build-compatible tapes, 30 exact browser passes, explicit mismatch UI | Human route classes remain U10/U14 work |
| U10 Moving Ground | Playable preview | Ten-cycle carry, bounded inheritance, triggered lift, exact restore, proxy audit | Broader/rotating geometry, dedicated framing, human safe/apex tapes |
| U14 Campaign | Playable preview | 12 campaign routes headlessly complete and repository-proofed | Human safe/risky/touch/onboarding QA and star derivation |
| U27 Accessibility | Playable preview | Responsive touch, 320 × 568 disjoint-target assertion, haptics, audio sliders, reduced motion, left-hand mode, rotation smoke | High contrast, full remapping UI, safe-area and physical-device matrix |

Do not promote other statuses because a primitive exists. `ROADMAP.md` acceptance gates remain authoritative.

## Known gaps and risks

- **Production:** the live URL can remain on an older build until merge/publish; candidate screenshots and local tests are not production evidence.
- **Physical performance:** no deliberately low-end phone has repeated the p95 capture. Headless Chrome on the development host does not reproduce thermals, browser chrome, GPU/driver, installed-PWA, or service-worker costs.
- **Input devices:** module tests cover gamepad snapshots, but a physical controller and a representative mobile multitouch set still need end-to-end production smoke.
- **Human calibration:** automated route completion does not prove fun, readability, touch difficulty, or fair star times.
- **Moving geometry:** platforms remain axis-aligned top-only rectangles. Force zones, arbitrary splines, rotation, two-sided closed chains, and breakable ground are not complete.
- **Competition:** no PB tape library, translucent ghost, splits, daily relay, URL challenge UX, or pruning.
- **Audio/feel:** wheelie balance, tire/surface loops, simultaneous-level budget, and measured landing envelopes remain open.
- **Browser controller size:** input and effect ownership are extracted, but `game.js` still owns audio, persistence, presentation composition, UI, rendering, and loop orchestration.

## Immediate next priorities

1. Review draft PR `#1`, confirm its eight-image gallery and exact 3/76/15/30/2 gate, inspect the final diff, and require a passing GitHub Actions run.
2. Promote only after review; verify visible `v1.6.0`, eligible Pages workflow, cache replacement, installability, and offline reload on the canonical URL.
3. Repeat the interruption and performance matrix on representative physical devices: low-end Android, iOS Safari if available, keyboard desktop, multitouch, and a real gamepad. Preserve measurements, screenshots, and console results.
4. Continue U04 with a DOM-free force-zone contract, deterministic fixtures, debug proxies, reset/checkpoint behavior, and unchanged-baseline tests before adding course content.
5. Add broader moving or closed collision geometry only after force zones and their proof/version implications are explicit.
6. Record human safe/apex runs separately from recovery references; use human keyboard/touch rides—not automation recovery timing—to derive star targets.
7. Keep extracting audio, persistence, renderer, and UI ownership from `game.js` without changing fixed-step ordering or silently invalidating Gold proofs.

## Local QA routes

Serve the public directory:

```powershell
python -m http.server 8080 --directory public
```

Useful routes:

- `http://127.0.0.1:8080/?dev`
- `http://127.0.0.1:8080/?dev&performance&level=1&autoplay&touch`
- `http://127.0.0.1:8080/?dev&performance&level=14&touch`
- `http://127.0.0.1:8080/?dev&level=14&debug=collisions`
- `http://127.0.0.1:8080/?dev&level=15&autoplay`
- `http://127.0.0.1:8080/?dev&touch`

## Handoff discipline

Every future batch must:

- update `CHANGELOG.md`, `ROADMAP.md`, this file, and the relevant release/QA page;
- change `public/version.js` and `package.json` together for a release identity change;
- bump physics/course identities only when their compatibility domain actually changes;
- add every shipped public runtime/data file to the literal service-worker precache;
- add deterministic tests for every new mutable state, pool, input owner, metric, collider, trigger, reset owner, replay field, or level assumption;
- keep input interruption cleanup and effect hard bounds covered by the repeatable browser gate;
- inspect Gold-manifest diffs rather than regenerating through unexplained failures;
- run `npm test`, `git diff --check`, and `git status -sb` on the final worktree;
- preserve unrelated user changes;
- capture and version real browser screenshots for material presentation work;
- keep mechanics, code, art, names, layouts, and timing original rather than copying proprietary competitor material;
- state clearly whether work is a local candidate, pushed PR state, or production-verified release.

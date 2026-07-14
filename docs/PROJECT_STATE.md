# Moto Rush X3 Project State

Last updated: **2026-07-14**

This is the canonical pickup note for the active repository state. Update it whenever a batch changes the build, compatibility identity, acceptance evidence, known risks, or next priority. Chat history is not project state.

## Repository and release coordinates

| Item | Current value |
|---|---|
| Product | Moto Rush X3 |
| Candidate | `1.8.0` — Crash Theater |
| Runtime source of truth | `public/version.js` |
| Package version | `1.8.0` |
| Replay identity | schema `1`; physics `physics-4`; course `course-4` |
| Working branch | `agent/motorush-v18-crash-theater` |
| Remote | `https://github.com/QemmHD/motogame.git` |
| Draft pull request | v1.8: `pending`; [v1.7 draft `#2`](https://github.com/QemmHD/motogame/pull/2) and v1.6 draft `#1` remain preserved |
| Candidate delivery state | Local unmerged v1.8 candidate; complete local gate and four-image visual record pass, while push/PR, hosted gate, physical-device coverage, and production are `pending` |
| Production URL | <https://qemmhd.github.io/motogame/> |
| Deployment boundary | `public/`, published to `gh-pages` only through the eligible workflow |
| Save key | `motoRushX3.save.v1` |

The current v1.8 worktree is not yet represented by a pushed draft PR. Its complete local gate and inspected gallery are recorded below; use `git branch --show-current`, `git rev-parse HEAD`, and `git status -sb` for local coordinates until an actual v1.8 PR URL and gameplay SHA are recorded. The pushed v1.7 predecessor remains reviewable in draft PR [`#2`](https://github.com/QemmHD/motogame/pull/2), separately from preserved v1.6 draft PR `#1`. Do not describe v1.8 as pushed, hosted-gate green, merged, deployed, or live until each state has direct evidence.

The build-version field is part of replay compatibility. Repository Gold tokens were intentionally refreshed for `1.8.0` while replay schema `1`, `physics-4`, and `course-4` remain unchanged. A direct v1.7/v1.8 manifest comparison finds no changed non-token field for any of the 16 routes: finish/replay/run ticks, elapsed/net time, score, crash/recovery count, and authoritative state hashes are identical. This is a build-only compatibility refresh for presentation and cache identity, not a physics or course migration.

## Current playable catalog

The candidate contains **16 handcrafted levels across three worlds**:

- **Canyon Run, L1–L6:** Warm-Up, Air Time, Whoops & Woes, Danger Zone, Cliffhanger, Grand Finale.
- **Stormworks, L7–L12:** Boostline, Pendulum Pass, Cold Circuit, Blast Foundry, Piston Works, Stormbreak.
- **R&D Yard, L13–L16:** Freight Flight, Lift Logic, Proof Circuit, Vector Weave.

R&D Yard remains a focused mechanics lab rather than a full six-course world. Lift Logic teaches the first sensor-triggered moving deck; Vector Weave teaches Flow Assist, Loft Line, and Soft Landing Kinetic Looms over a recoverable lower trail. Progression persists unlocks, stars, best time, best score, settings, and the player's latest completed proof per level. Every current course also has a read-only repository Gold Run loaded from `public/golden-tapes.json`.

## v1.8 integrated architecture

### Authority and retry contract stay unchanged

`public/run-session.js` remains the DOM-free authority for terrain/bike creation, rules, kinematic state, fixed playing/crashed steps, scoring, checkpoints, crash/fallout/respawn/finish transitions, force-field application, and proof-ready snapshots. Browser performance, input telemetry, particles, camera, audio, UI, Crash Theater contact/pose/FX, and debug presentation remain outside the proof hash. Crash entry now passes the browser a cloned reason record so presentation cannot retain a mutation path into authoritative `lastCrash` state.

Manual checkpoint retry is still consumed and recorded on a fixed input tick. Automatic retry still uses `RUN_SESSION_CRASH_DURATION = 1.85` seconds and reaches the same deterministic boundary. Crash Theater begins only after the session has failed the run and cannot change bike, time, score, checkpoints, hazards, platform snapshots, force fields, replay ticks, or proof state. This keeps v1.8 inside U05 presentation scope rather than silently changing U06 retry semantics.

Kinetic Looms retain their existing `physics-4` order after terrain/platform solving and rules/TNT. A lethal crash or valid finish wins before field application, and field velocity affects the next physics tick. No v1.8 Crash Theater path enters this authority.

### Stateless Kinetic Loom authority

`public/force-zones.js` clones, validates, freezes, and stably orders axis-aligned field definitions. Rear, front, and head circles sweep from the complete previous frame to current geometry using exact circle-to-rectangle distance, so a thin field cannot be skipped and square-expanded corner false positives are rejected. Each field contributes at most once per tick. Overlaps sum in stable ID order and call `applyImpulse()` once, preserving bounded order-independent results.

Fields carry no timers, cooldowns, occupancy tables, or switch memory. Entry/exit/swept metadata is derived from geometry every step, so checkpoint retry needs no hidden Loom snapshot. The shared impulse hook now rejects malformed/non-finite input atomically, returns explicit success/no-op status, and retains ground/air speed and spin clamps.

The Canvas renders fixed-tick woven ribbons, directional chevrons, compact steel heads, and labels. Reduced Motion freezes the weave phase. The collision overlay consumes detached bounded proxies with exact rectangles and clipped acceleration arrows; it never re-runs contact authority.

### Original 17-part Splitline rig

`public/ragdoll.js` now owns 17 fixed identities: five detached bike points, four rider-core points, two elbows, two hands, two knees, and two feet. Elbows and knees turn each arm/leg into a readable two-segment chain. Structural constraints preserve the skeleton; softer hip/hand/foot tethers can break or be selectively released. The solver remains DOM-free, uses bounded `1 / 120` second substeps, and enforces hard configuration, speed, distance, correction, iteration, settling, and lifetime limits.

`game.js` renders a code-native **Splitline** model over those nodes. Far/near depth, orange armor, amber joint guards, cyan reflective seams, a separate helmet shell/visor, and a fuller frame/engine/shroud/fork/swingarm silhouette replace the earlier stick-like crash drawing without adding a bitmap. The authoritative intact-bike sprite remains unchanged during normal play.

### Ten cause profiles and deterministic presentation

`public/crash-presentation.js` normalizes collision, terrain, platform, saw, spikes, barrel, mace, crusher, TNT, and fallout into immutable finite records with original labels, accents, glyphs, separate rider/bike impulse profiles, and tether-release lists. Aliases map safely and malformed inputs fall back to collision without source mutation.

Terrain and one-way-platform head contacts now publish finite detached `terrain` / `platform` presentation reasons, so those cards are reachable through ordinary play rather than only development staging. The session keeps this natural contact metadata out of `lastCrash` and proof snapshots; hazard reasons retain their existing authoritative rules path. Integration coverage mutates the emitted copies and proves the session snapshot cannot change.

The same DOM-free module hashes stable crash context into stateless effect lanes, measures a detached pose inside strict bounds, and produces a finite camera policy. Normal presentation uses a short decaying fit/roll/kick/shake/flash/hitstop/slow beat. Entry debris, secondary sparks, and camera variation are deterministic for the same staged crash. They remain presentation-only and do not enter checkpoint or replay state.

Reduced Motion returns a constant base view height and zoom `1`, with zero roll, kick, shake, hitstop, and flash plus slow multiplier `1`. At crash creation the rig is a static projected pose; enabling the setting during a crash freezes the current pose and neutralizes node history. Animated glyph/secondary contact particles, impact audio, impact haptics, and impact camera feedback are suppressed while the cause/retry card remains readable.

### Detached swept crash contact

`public/crash-contact.js` clones valid terrain segments and enabled state, then freezes the current rectangles of up to 512 platforms when the crash begins. Terrain query scratch state is private and never aliases authoritative buckets, segment arrays, `enabled`, `seen`, or `seenToken`. Moving decks remain frozen for the presentation.

Each ragdoll circle can query current contact plus its previous position. One-way deck contact sweeps the top line and both rounded endpoints, so small fast parts do not tunnel through a thin deck while stationary or upward-moving parts underneath still pass through. Terrain source identity and surface metadata are preserved, and material friction applies once on a node's first contact in one physical substep.

### Bounded impact and debug records

The ragdoll emits an impact only on first contact in a substep and above its configured normal-speed threshold. Its default queue holds at most 48 records and exposes total, pending, dropped, peak, and last-impact metrics. `drainRagdollImpacts()` copies into browser-owned storage and clears the internal queue. The browser consumes at most four records per batch, caps secondary crash particles at 28, and throttles impact sound/haptics/camera beats.

`public/debug-proxies.js` now publishes detached bounded ragdoll circles, previous-to-current sweeps, resolved links, pose bounds, contact/impact totals, broken tethers, speed/clamp metrics, and last-impact metadata. The Canvas overlay reads those records without querying collision or advancing presentation simulation.

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

The final v1.8 aggregate run used Chrome 150 and recorded both the ordinary play profiles and the dedicated live-crash profiles:

| Profile | Work samples | Work p95 | Diagnostic pacing p95 | Work budget | Result |
|---|---:|---:|---:|---:|---|
| 1280 × 720, DPR 1, desktop play | 360 | 1.00 ms | 7.20 ms | 8 ms | Pass |
| 390 × 844, DPR 2, mobile/touch play | 360 | 0.81 ms | 7.20 ms | 12 ms | Pass |
| 1280 × 720, DPR 1, unfrozen desktop TNT crash | 181 | 1.60 ms | diagnostic only | 8 ms | Pass |
| 390 × 844, DPR 2, unfrozen mobile saw crash | 181 | 1.50 ms | diagnostic only | 12 ms | Pass |
| 1280 × 720, Reduced Motion crusher (pose tick `0`) | — | not timed | — | invariant gate | Pass |

The ordinary profiles retained 69/636 peak effects each. The mobile pass additionally asserts disjoint and unclipped control zones at 390 × 844 and 320 × 568, two-pointer gas/lean aggregation, selective pointer cancellation, blur pause/clear, portrait-to-844 × 390 rotation pause/clear, exact canvas resize, telemetry counters, and left-hand UI/layout state. The two dynamic crash profiles advanced to pose ticks 177/168 with 1,894/1,287 raw contacts while their crashed sessions, ragdoll contact, impacts, particles, camera, and retry timers remained live. Every crash profile verifies 17 parts, the authored cause/card, a finite camera/pose, a separately frozen 112-tick-equivalent review window, bounded effects, and clean retry/reset. These are repeatable local headless-Chrome measurements, not evidence for compositor/GPU behavior or every physical phone.

The preserved [v1.7 hosted Actions run `29307193559`](https://github.com/QemmHD/motogame/actions/runs/29307193559), pinned to gameplay SHA `3b1cd56`, passed its predecessor 3/87/16/32/2 gate at 1.10 ms work p95 for both ordinary profiles. Publishing was correctly skipped for that draft PR. v1.8 hosted evidence remains separate and pending until its branch and draft PR exist.

## Repository Gold Run evidence

Manifest: `public/golden-tapes.json`

| Measure | Current result |
|---|---|
| Catalog coverage | 16 of 16 current levels |
| Route classification | `recovery` |
| Browser attempts per tape | 2 clean contexts |
| Total verified replays | 32 |
| Divergences | 0 |
| Compatibility | build `1.8.0`; schema `1`; `physics-4`; `course-4` |
| Reason for regeneration | Build-only compatibility/cache refresh for Crash Theater; no authoritative physics/course change |
| Manifest SHA-256 | `FE153EFFD8517A3D69FFD0E7099740FCEDF10F2D7C70ECA3F2C803BE8ED8DA59` |
| v1.7 baseline | Every non-token route field is identical across all 16 entries |

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
npm run test:browser-crash
```

Current expected coverage:

- **Asset/offline:** 3 subtests.
- **Deterministic systems:** 108 subtests, including 7 crash-contact, 6 crash-presentation, 10 ragdoll, and 7 debug-proxy cases alongside the preserved rules/replay/kinematics/force-zone/session/effect/input/performance fixtures.
- **Physics/routes:** 16 of 16 authored levels.
- **Browser Gold Runs:** 16 tapes × 2 attempts = 32 verified replays.
- **Browser profiles:** 2 measured ordinary profiles plus the mobile interruption/rotation/left-hand matrix and 3 dedicated crash profiles.

Recorded on the final local v1.8 worktree: aggregate `npm test` passes all asset, system, route, Gold, ordinary browser, and crash-browser stages with the exact counts and measurements above.

Focused commands:

```powershell
npm run test:effects
npm run test:input
npm run test:performance
npm run test:browser-performance
npm run test:browser-crash
npm run test:rules
npm run test:replay
npm run test:kinematics
npm run test:ragdoll
npm run test:crash-contact
npm run test:crash-presentation
npm run test:session
npm run test:force-zones
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

The inspected v1.8 Crash Theater gallery is preserved under `docs/screenshots/v1.8/`:

- `update-v18-crash-hero.png` — desktop 17-part Splitline hero with detached bike and cause/retry card.
- `update-v18-ragdoll-proxies.png` — exact circles, sweeps, links, contacts, impact metrics, and aligned contact field.
- `update-v18-mobile-crash.png` — 390 × 844 DPR 2 compact card with unclipped retry affordance.
- `update-v18-reduced-motion.png` — static projected pose with fixed zoom/view height and no impact transients.

`node tools/capture-v18.mjs` generated every scene twice in independent contexts. The recorded run matched at zero changed pixels and zero channel delta; the four PNGs were inspected at full resolution on 2026-07-14. Exact sizes, SHA-256 values, staged state hashes, method, and evidence limits live in `docs/screenshots/v1.8/README.md`.

The complete inspected Vector Weave predecessor remains under `docs/screenshots/v1.7/`:

- `update-v17-vector-weave-hero.png` — full desktop ride inside the magenta Loft Line.
- `update-v17-collision-looms.png` — exact collision rectangles and clipped vectors over all three Looms.
- `update-v17-mobile-loom.png` — 390 × 844 DPR 2 mobile ride with disjoint touch controls.
- `update-v17-reduced-motion.png` — static Loom phase with Reduced Motion enabled.

The v1.6 Smooth Ride gallery remains preserved under `docs/screenshots/v1.6/`:

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

| Update | Status in v1.8 candidate | Evidence | Still open |
|---|---|---|---|
| U01 Release Gate | Release candidate | Complete local v1.8 gate: 3 assets, 108 systems, 16 routes, 32 Gold passes, 2 ordinary browser profiles, 3 crash profiles | Hosted gate, eligible deploy, production cache/install/offline smoke |
| U02 Restart Contract | Partial foundation | Shared DOM-free session, 50-repeat rules restore, exact hazard/platform snapshots, extracted ride input | Physical keyboard/touch/gamepad results/restart matrix and further module splits |
| U03 Smooth Ride | Release candidate | Hard-bounded 384/32/220 pools, typed-ring metrics, 17 input tests, 6 metric tests, 2-profile p95, cancel/blur/rotation/left-hand matrix | Physical low-end phone and production-profile confirmation |
| U04 Collision Keystone | Partial foundation | Swept platforms/hazards, stateless swept Kinetic Looms, bounded proxies, aligned browser overlay, retry fixtures | General moving/rotating/two-sided closed chains |
| U05 Crash Theater | Release candidate | 17-part Splitline rig, ten causes, detached swept contact, 48-event impact bound, seeded FX/camera, ragdoll proxies, 30 finite/settling scripts, exact repeat, Reduced Motion invariants, 3 crash-browser profiles, 4 inspected captures | Hosted gate and physical cause/retry matrix |
| U07 Engine Soul | Playable preview | Landing grades, momentum retention, five gear bands, reactive audio | Wheelie meter, tire/surface layers, measured envelopes/audio budget |
| U09 Proof Replays | Release candidate | 16 build-refreshed tapes, 32 exact browser passes, no non-token v1.7 outcome change, explicit mismatch UI | Human route classes remain U10/U14 work |
| U10 Moving Ground | Playable preview | Ten-cycle carry, bounded inheritance, triggered lift, exact restore, proxy audit | Broader/rotating geometry, dedicated framing, human safe/apex tapes |
| U14 Campaign | Playable preview | 12 campaign routes headlessly complete and repository-proofed | Human safe/risky/touch/onboarding QA and star derivation |
| U27 Accessibility | Playable preview | Responsive touch, 320 × 568 disjoint-target assertion, haptics, audio sliders, reduced motion, left-hand mode, rotation smoke | High contrast, full remapping UI, safe-area and physical-device matrix |

Do not promote other statuses because a primitive exists. `ROADMAP.md` acceptance gates remain authoritative.

## Known gaps and risks

- **Candidate delivery:** v1.8 has no recorded push, draft PR, or hosted run yet. Its complete local gate and inspected image set do not substitute for those states.
- **Production:** the live URL can remain on an older build until review, eligible merge, publish, and direct smoke; local candidate tests are not production evidence.
- **Crash visuals:** the four required browser captures pass local full-resolution inspection; physical browser/device rendering and the eventual production build remain unverified.
- **Crash devices:** all ten causes, rapid manual retry, automatic retry, audio overlap, haptics, rotation, and long heavy-crash sessions still need representative physical keyboard/touch/gamepad and low-end-device smoke.
- **Physical performance:** no deliberately low-end phone has repeated the p95 capture. Headless Chrome on the development host does not reproduce thermals, browser chrome, GPU/driver, installed-PWA, or service-worker costs.
- **Input devices:** module tests cover gamepad snapshots, but a physical controller and a representative mobile multitouch set still need end-to-end production smoke.
- **Human calibration:** automated route completion does not prove fun, readability, touch difficulty, or fair star times.
- **Moving geometry:** platforms remain axis-aligned top-only rectangles. Arbitrary splines, rotation, two-sided closed chains, and breakable ground are not complete.
- **Competition:** no PB tape library, translucent ghost, splits, daily relay, URL challenge UX, or pruning.
- **Audio/feel:** wheelie balance, tire/surface loops, simultaneous-level budget, and measured landing envelopes remain open.
- **Browser controller size:** input and effect ownership are extracted, but `game.js` still owns audio, persistence, presentation composition, UI, rendering, and loop orchestration.

## Immediate next priorities

1. Push the branch, open a draft v1.8 PR, pin its gameplay SHA, add the completed gallery to the PR, watch hosted Actions, and record the run URL plus publish-skipped state. Do not merge or deploy without explicit review/authorization.
2. Exercise all ten causes and retry timing on keyboard, multitouch, and real gamepad, then repeat heavy crash scenes on a deliberately low-end Android device and representative iOS hardware.
3. Promote only after review; verify visible `v1.8.0`, eligible Pages workflow, cache replacement, installability, clean-cache load, and offline relaunch at the canonical URL.
4. Continue U04 with broader moving/rotating or closed collision chains, keeping proof/version and reset implications explicit; separately human-tune Vector Weave without replacing the deterministic recovery reference.
5. Record human safe/apex runs separately from recovery references, and keep extracting audio, persistence, renderer, and UI ownership without changing fixed-step authority.

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
- `http://127.0.0.1:8080/?dev&level=16&autoplay`
- `http://127.0.0.1:8080/?dev&level=16&autoplay&debug=collisions`
- `http://127.0.0.1:8080/?dev&level=16&autoplay&touch`
- `http://127.0.0.1:8080/?dev&touch`

For a deterministic Crash Theater scene, open a `?dev&level=16` route and call from the browser console:

```js
__moto.stageCrash({ type: 'mace', warmupTicks: 42, presentationTicks: 36 });
```

Use `collisionDebug: true`, `reducedMotion: true`, another authored cause ID, or `__moto.freezePresentation(true)` for reproducible inspection. These hooks are development-only and are not player-facing authority.

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

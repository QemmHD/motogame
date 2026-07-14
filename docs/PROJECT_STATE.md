# Moto Rush X3 Project State

Last updated: **2026-07-14**

This is the canonical pickup note for the active repository state. Update it whenever a batch changes the build, compatibility identity, acceptance evidence, known risks, or next priority. Chat history is not project state.

## Repository and release coordinates

| Item | Current value |
|---|---|
| Product | Moto Rush X3 |
| Candidate | `1.8.1` — Fast Failure, Great Finish |
| Runtime source of truth | `public/version.js` |
| Package version | `1.8.1` |
| Replay identity | schema `1`; physics `physics-4`; course `course-4` |
| Working branch | `agent/motorush-v181-fast-failure` |
| Remote | `https://github.com/QemmHD/motogame.git` |
| Gameplay commit | [`27bcce2b66f4`](https://github.com/QemmHD/motogame/commit/27bcce2b66f46592c8ea83122067f43f915a27eb) |
| Draft pull request | [#4 — Ship v1.8.1: Fast Failure, Great Finish](https://github.com/QemmHD/motogame/pull/4) |
| Hosted gate | [Actions run 29324957318](https://github.com/QemmHD/motogame/actions/runs/29324957318) passed; publish skipped |
| Candidate delivery state | Committed and pushed v1.8.1 draft candidate; deterministic/browser/visual/hosted gates pass, while physical-device, assistive-technology, review/merge, and production evidence are `pending` |
| Production URL | <https://qemmhd.github.io/motogame/> |
| Deployment boundary | `public/`, published to `gh-pages` only through the eligible workflow |
| Save key | `motoRushX3.save.v1` |

The v1.8.1 work is committed and pushed on `agent/motorush-v181-fast-failure`. Draft [PR #4](https://github.com/QemmHD/motogame/pull/4) is pinned to gameplay SHA `27bcce2b66f46592c8ea83122067f43f915a27eb`; [hosted Actions run 29324957318](https://github.com/QemmHD/motogame/actions/runs/29324957318) passed and the ineligible feature-branch publish job was correctly skipped. The preserved v1.8 candidate remains reviewable in draft [PR #3](https://github.com/QemmHD/motogame/pull/3), and v1.7 in draft [PR #2](https://github.com/QemmHD/motogame/pull/2). Do not describe v1.8.1 as merged, deployed, production-smoked, or live until each state has direct evidence.

The build-version field is part of replay compatibility. Repository Gold tokens were intentionally refreshed for `1.8.1` while replay schema `1`, `physics-4`, and `course-4` remain unchanged. A direct v1.8.0/v1.8.1 manifest comparison finds no changed non-token field for any of the 16 routes: finish/replay/run ticks, elapsed/net time, score, crash/recovery count, and authoritative state hashes are identical. This is a build-only compatibility refresh for result presentation/input/accessibility and cache identity, not a physics or course migration. Save storage remains `motoRushX3.save.v1`.

## Current playable catalog

The candidate contains **16 handcrafted levels across three worlds**:

- **Canyon Run, L1–L6:** Warm-Up, Air Time, Whoops & Woes, Danger Zone, Cliffhanger, Grand Finale.
- **Stormworks, L7–L12:** Boostline, Pendulum Pass, Cold Circuit, Blast Foundry, Piston Works, Stormbreak.
- **R&D Yard, L13–L16:** Freight Flight, Lift Logic, Proof Circuit, Vector Weave.

R&D Yard remains a focused mechanics lab rather than a full six-course world. Lift Logic teaches the first sensor-triggered moving deck; Vector Weave teaches Flow Assist, Loft Line, and Soft Landing Kinetic Looms over a recoverable lower trail. Progression persists unlocks, stars, best time, best score, settings, and the player's latest completed proof per level. Every current course also has a read-only repository Gold Run loaded from `public/golden-tapes.json`.

## v1.8.1 integrated architecture

### Authority and retry contract stay unchanged

`public/run-session.js` remains the DOM-free authority for terrain/bike creation, rules, kinematic state, fixed playing/crashed steps, scoring, validated inclusive star thresholds, checkpoints, crash/fallout/respawn/finish transitions, force-field application, exact finish events, and proof-ready snapshots. Browser performance, UI edges, result focus/ceremony, score receipt layout, input telemetry, particles, camera, audio, UI, Crash Theater contact/pose/FX, and debug presentation remain outside the proof hash. Crash entry passes the browser a cloned reason record so presentation cannot retain a mutation path into authoritative `lastCrash` state.

Manual checkpoint retry is still consumed and recorded on a fixed input tick. Automatic retry still uses `RUN_SESSION_CRASH_DURATION = 1.85` seconds and reaches the same deterministic boundary. Crash Theater begins only after the session has failed the run and cannot change bike, time, score, checkpoints, hazards, platform snapshots, force fields, replay ticks, or proof state. This keeps v1.8 inside U05 presentation scope rather than silently changing U06 retry semantics.

Kinetic Looms retain their existing `physics-4` order after terrain/platform solving and rules/TNT. A lethal crash or valid finish wins before field application, and field velocity affects the next physics tick. No v1.8 Crash Theater path enters this authority.

### Finish Forge report and route policy

`public/finish-flow.js` accepts the authoritative finish event plus the browser's presentation-only score ledger. It requires elapsed minus flip credit to equal finish time, canonicalizes values to integer milliseconds, reconciles every ledger bucket exactly to the authoritative integer score, and returns a detached immutable report. It handles minute carry, PB/tied-record comparisons, and first-record behavior without letting sub-millisecond floating-point noise produce a visible `0 ms` record.

The same module is the only policy for result actions. Retry targets the current playable course, Replay requires an existing proof token, Next requires the immediate catalog entry to exist and fall below the normalized unlock count, Menu is always safe, and Gold Run is offered only when a repository reference exists. Missing current/next records, a locked/final route, absent proof, malformed indices, and unknown actions fail closed. `game.js` resolves again immediately before mutation; it never clamps a missing Next to the final level.

The browser records score events into four presentation buckets—TRICK BANK, AIR & LAND, RISK LINE, and OTHER—at the same event-consumption boundary that drives popups/audio. The ledger does not award points and resets with every run. A clean zero-point finish receives an explicit CLEAN RUN receipt row.

### Result input, semantics, and reset ownership

`public/ui-input.js` maps standard gamepad D-pad/stick/A/B snapshots into left/right/up/down/confirm/back rising edges with separate press/release thresholds. Held directions do not repeat, held A/throttle cannot confirm a newly opened receipt, and a direction plus confirm in the same rendered poll moves focus without activating the destination. Keyboard Arrow/WASD, Enter/Space, and Escape use the same result policy; pointer/touch uses only enabled registered Canvas rectangles.

Finish Forge registers only enabled hit targets, each at least 44 × 44 CSS pixels and contained/non-overlapping through the 320 × 568 gate. Disabled Replay remains in the semantic dialog with its disabled state, while enabled action focus is mirrored between the DOM and Canvas. The Canvas has an application label and keyboard focus, the document declares English, a live region announces the exact result summary, and browser zoom is not disabled.

Every result transition calls the shared presentation reset before exposing the next state. It clears finish timer/focus/report, semantic buttons and announcement, pooled particles/popups/tracks, camera shake/flash/slow/hitstop, ragdoll/contact/impact state, queued restart, ride/UI input latches, scheduled audio timers, and active synthesized SFX sources. Reduced Motion reveals the complete receipt immediately, retains focus/actions, and emits no finish confetti.

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

`tools/performance-browser.mjs` starts the local static deployment boundary, launches an installed Chrome/Chromium, blocks service workers, captures at least three seconds of live autoplay after warm-up and waits up to 24 more seconds when needed to collect 180 callbacks, rejects page/console errors, validates pool bounds, and runs two named profiles:

The current v1.8.1 local gate used Chrome 150 and recorded ordinary play, preserved live-crash regression, and strict Finish Forge profiles:

| Profile | Work samples | Work p95 | Diagnostic pacing p95 | Work budget | Result |
|---|---:|---:|---:|---:|---|
| 1280 × 720, DPR 1, desktop play | final profile | 1.10 ms | diagnostic only | 8 ms | Pass |
| 390 × 844, DPR 2, mobile/touch play | final profile | 0.90 ms | diagnostic only | 12 ms | Pass |
| 1280 × 720, DPR 1, unfrozen desktop TNT crash | final profile | 3.10 ms | diagnostic only | 8 ms | Pass |
| 390 × 844, DPR 2, unfrozen mobile saw crash | final profile | 1.70 ms | diagnostic only | 12 ms | Pass |
| 1280 × 720, Reduced Motion crusher (pose tick `0`) | — | not timed | — | invariant gate | Pass |
| 1280 × 720, DPR 1, Finish Forge | 123 | 0.70 ms | diagnostic only | 8 ms | Pass |
| 390 × 844, DPR 2, mobile Finish Forge | 127 | 0.60 ms | diagnostic only | 12 ms | Pass |

The mobile ordinary pass asserts disjoint and unclipped ride zones at 390 × 844 and 320 × 568, two-pointer gas/lean aggregation, selective pointer cancellation, blur pause/clear, portrait-to-844 × 390 rotation pause/clear, exact canvas resize, telemetry counters, and left-hand UI/layout state. The two dynamic crash profiles advanced to pose ticks 177/168 with 1,894/1,287 raw contacts while crashed sessions, ragdoll contact, impacts, particles, camera, and retry timers remained live. Finish Forge exposed five semantic actions and five enabled 44 px-or-larger Canvas targets in each full scene; desktop passed keyboard plus standard-gamepad rising-edge navigation/confirm/back/held-A suppression, and mobile passed five non-overlapping 320 × 568 targets plus actual touch-center Retry. Both result profiles also prove canonical receipt/semantic parity, missing/locked route safety, Reduced Motion, clean reset, and zero page/console/request/HTTP errors. These are repeatable local headless-Chrome measurements, not evidence for compositor/GPU behavior or every physical device.

The v1.8.1 hosted full gate passed in [Actions run `29324957318`](https://github.com/QemmHD/motogame/actions/runs/29324957318), pinned to gameplay SHA `27bcce2b66f46592c8ea83122067f43f915a27eb`. It passed 3 assets, 127 systems, 16 routes, 32 Gold replays, two ordinary profiles at 1.20/1.20 ms p95, dynamic crash profiles at 2.10/2.50 ms p95 plus the static Reduced Motion invariant, and both Finish Forge profiles at 0.80 ms p95. The test job completed in 1m51s and publishing was correctly skipped. Preserved v1.8 run `29320024589` and v1.7 run `29307193559` remain predecessor evidence.

## Repository Gold Run evidence

Manifest: `public/golden-tapes.json`

| Measure | Current result |
|---|---|
| Catalog coverage | 16 of 16 current levels |
| Route classification | `recovery` |
| Browser attempts per tape | 2 clean contexts |
| Total verified replays | 32 |
| Divergences | 0 |
| Compatibility | build `1.8.1`; schema `1`; `physics-4`; `course-4` |
| Reason for regeneration | Build-only compatibility/cache refresh for Finish Forge; no authoritative physics/course change |
| Manifest SHA-256 | `48F307B97C223E93795A20F5A5885488A20FD1C4C10B4525B4A4214698560EF4` |
| v1.8.0 baseline | Every non-token route field is identical across all 16 entries |

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
npm run test:browser-results
```

Current expected coverage:

- **Asset/offline:** 3 subtests.
- **Deterministic systems:** 127 subtests, including 8 finish-flow, 5 UI-input, 4 release-metadata, 10 run-session, 7 crash-contact, 6 crash-presentation, 10 ragdoll, and 7 debug-proxy cases alongside preserved rules/replay/kinematics/force-zone/effect/ride-input/performance fixtures.
- **Physics/routes:** 16 of 16 authored levels.
- **Browser Gold Runs:** 16 tapes × 2 attempts = 32 verified replays.
- **Browser profiles:** 2 measured ordinary profiles plus the mobile interruption/rotation/left-hand matrix, 3 dedicated crash profiles, and 2 strict Finish Forge result profiles.

Recorded on the final local v1.8.1 runtime and documentation worktree: aggregate `npm test` completed in 334.1 seconds and passed 3 assets, 127 systems, all 16 routes, 32 Gold passes, two ordinary browser profiles, three crash profiles, and two strict Finish Forge profiles. Run `git diff --check` before commit.

Focused commands:

```powershell
npm run test:effects
npm run test:input
npm run test:performance
npm run test:finish-flow
npm run test:ui-actions
npm run test:release-metadata
npm run test:browser-performance
npm run test:browser-crash
npm run test:browser-results
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

The inspected v1.8.1 Finish Forge gallery is preserved under `docs/screenshots/v1.8.1/`:

- `update-v181-finish-forge-hero.png` — 1280 × 720 exact receipt with five actions and Next focus.
- `update-v181-focused-action.png` — 1280 × 720 visible Gold Run focus treatment on a long-time result.
- `update-v181-mobile-finish.png` — 390 × 844 DPR 2 complete portrait receipt with Retry focus.
- `update-v181-reduced-motion.png` — instant static Level 16 receipt with only its three legal actions.

`node tools/capture-v181.mjs --write` generated every scene twice in independent clean contexts after validating report arithmetic, action/focus, semantic output, viewport/DPR, and staged state identity. The final render-isolated pass matched at zero changed pixels and zero channel delta. Exact staged state hashes, dimensions, byte sizes, PNG SHA-256 values, method, review result, and evidence limits live in `docs/screenshots/v1.8.1/README.md`.

The inspected v1.8 Crash Theater predecessor remains preserved under `docs/screenshots/v1.8/`:

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

| Update | Status in v1.8.1 candidate | Evidence | Still open |
|---|---|---|---|
| U01 Release Gate | Release candidate | Local and hosted v1.8.1 assets, 127 systems, 16 routes, 32 Gold passes, 2 ordinary, 3 crash, and 2 Finish Forge profiles plus 4 captures | Review/eligible deploy and production cache/install/offline smoke |
| U02 Restart Contract | Partial foundation | Shared DOM-free session, 50-repeat rules restore, exact hazard/platform snapshots, extracted ride/UI input, explicit Finish Forge reset audit | Physical input/device restart matrix and further renderer/audio/persistence splits |
| U03 Smooth Ride | Release candidate | Hard-bounded 384/32/220 pools, typed-ring metrics, 17 input tests, 6 metric tests, 2-profile p95, cancel/blur/rotation/left-hand matrix | Physical low-end phone and production-profile confirmation |
| U04 Collision Keystone | Partial foundation | Swept platforms/hazards, stateless swept Kinetic Looms, bounded proxies, aligned browser overlay, retry fixtures | General moving/rotating/two-sided closed chains |
| U05 Crash Theater | Release candidate | 17-part Splitline rig, ten causes, detached swept contact, 48-event impact bound, seeded FX/camera, ragdoll proxies, 30 finite/settling scripts, exact repeat, Reduced Motion invariants, local/hosted crash-browser passes, 4 inspected captures | Physical cause/retry matrix |
| U06 Fast Failure, Great Finish | Release candidate | Exact DOM-free receipt/route policy, canonical PB timing, itemized score ledger, 5-action responsive Finish Forge, semantic dialog, keyboard/touch/standard-gamepad local+hosted gates, Reduced Motion, full reset audit, 4 inspected captures | Physical input/assistive-technology matrix and production evidence |
| U07 Engine Soul | Playable preview | Landing grades, momentum retention, five gear bands, reactive audio | Wheelie meter, tire/surface layers, measured envelopes/audio budget |
| U09 Proof Replays | Release candidate | 16 build-refreshed tapes, 32 exact browser passes, no non-token v1.7 outcome change, explicit mismatch UI | Human route classes remain U10/U14 work |
| U10 Moving Ground | Playable preview | Ten-cycle carry, bounded inheritance, triggered lift, exact restore, proxy audit | Broader/rotating geometry, dedicated framing, human safe/apex tapes |
| U14 Campaign | Playable preview | 12 campaign routes headlessly complete and repository-proofed | Human safe/risky/touch/onboarding QA and star derivation |
| U27 Accessibility | Playable preview | Responsive touch, 320 × 568 ride/result target assertions, semantic result dialog/live region, browser zoom, haptics, audio sliders, reduced motion, left-hand mode, rotation smoke | High contrast, full remapping UI, safe-area, screen-reader, and physical-device matrix |

Do not promote other statuses because a primitive exists. `ROADMAP.md` acceptance gates remain authoritative.

## Known gaps and risks

- **Candidate delivery:** v1.8.1 is committed and pushed in draft PR #4 with a passing hosted gate and skipped publish; review, physical/assistive-technology evidence, merge, and production promotion remain open.
- **Production:** the live URL can remain on an older build until review, eligible merge, publish, and direct smoke; local candidate tests are not production evidence.
- **Crash visuals:** the four required browser captures pass local full-resolution inspection; physical browser/device rendering and the eventual production build remain unverified.
- **Crash devices:** all ten causes, rapid manual retry, automatic retry, audio overlap, haptics, rotation, and long heavy-crash sessions still need representative physical keyboard/touch/gamepad and low-end-device smoke.
- **Physical performance:** no deliberately low-end phone has repeated the p95 capture. Headless Chrome on the development host does not reproduce thermals, browser chrome, GPU/driver, installed-PWA, or service-worker costs.
- **Input devices:** module tests cover gamepad snapshots, but a physical controller and a representative mobile multitouch set still need end-to-end production smoke.
- **Assistive technology:** semantic dialog/live-region assertions pass in automation, but representative screen-reader/browser and keyboard-only review is not yet recorded.
- **Human calibration:** automated route completion does not prove fun, readability, touch difficulty, or fair star times.
- **Moving geometry:** platforms remain axis-aligned top-only rectangles. Arbitrary splines, rotation, two-sided closed chains, and breakable ground are not complete.
- **Competition:** no PB tape library, translucent ghost, splits, daily relay, URL challenge UX, or pruning.
- **Audio/feel:** wheelie balance, tire/surface loops, simultaneous-level budget, and measured landing envelopes remain open.
- **Browser controller size:** input and effect ownership are extracted, but `game.js` still owns audio, persistence, presentation composition, UI, rendering, and loop orchestration.

## Immediate next priorities

1. Review draft PR #4; preserve the passing hosted gate and do not promote until the remaining physical/assistive-technology checks are accepted.
2. Exercise Finish Forge plus all ten crash causes on physical keyboard, multitouch, real gamepad, and representative screen-reader/browser combinations; repeat heavy scenes on low-end Android and representative iOS hardware.
3. Promote only after review; verify visible `v1.8.1`, eligible Pages workflow, cache replacement, installability, clean-cache load, and offline relaunch at the canonical URL.
4. Continue U04 with broader moving/rotating or closed collision chains only with an explicit reset/proof contract; record human safe/apex runs separately and keep extracting renderer/audio/persistence ownership.

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
- `http://127.0.0.1:8080/?dev&finish&capture&level=1`
- `http://127.0.0.1:8080/?dev&finish&capture&level=16&reduced`
- `http://127.0.0.1:8080/?dev&touch`

For a deterministic Crash Theater scene, open a `?dev&level=16` route and call from the browser console:

```js
__moto.stageCrash({ type: 'mace', warmupTicks: 42, presentationTicks: 36 });
```

Use `collisionDebug: true`, `reducedMotion: true`, another authored cause ID, or `__moto.freezePresentation(true)` for reproducible inspection. These hooks are development-only and are not player-facing authority.

For deterministic result inspection, use the `?dev&finish&capture` route or call `__moto.stageFinish({...})`. `__moto.finishSnapshot()`, `__moto.uiSnapshot()`, and `__moto.runtimeSnapshot()` expose detached QA state; `stepFinishPresentationTicks()` advances only presentation. These hooks must not be used as evidence that progression mutations are safe—the strict browser gate exercises real keyboard, touch, gamepad, semantic, and reset routes separately.

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

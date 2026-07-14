# Changelog

All notable Moto Rush X3 changes are recorded here so development can resume without reconstructing old decisions from source code. Dates use YYYY-MM-DD.

## [1.7.0] — 2026-07-13 — Vector Weave (release candidate)

This candidate advances U04 Collision Keystone with an original player-facing force-field mechanic. It is tested and screenshot-backed locally, but is not production-live until the branch is reviewed, promoted through an eligible merge, published, and smoke-tested at the canonical Pages URL.

### Added

- A DOM-free `force-zones.js` authority for immutable continuous axis-aligned fields with stable IDs, exact bounds, bounded acceleration, deterministic ID ordering, and detached presentation records.
- Full-frame exact swept-circle/rectangle detection across the rear wheel, front wheel, and head so thin fields cannot be skipped at high speed and expanded-square corner false positives are rejected.
- One-call aggregation for overlapping fields: every touched Loom contributes at most once per tick, contributions are stably ordered, and one bounded impulse prevents authored order from changing clamp results.
- Stateless entry/exit/sweep metadata derived from previous/current geometry, requiring no cooldown table or checkpoint payload.
- Original **Kinetic Loom** presentation: woven luminous ribbons, repeated directional chevrons, compact steel heads, cyan/magenta/amber roles, fixed-tick animation, static Reduced Motion phase, `VECTOR LOCK!` feedback, synthesized entry cue, camera nudge, and haptics.
- **Vector Weave**, a sixteenth course and fourth R&D Yard route, with three checkpoints, Flow Assist, Loft Line, Soft Landing, an optional sky deck, and a continuous hazard-free recovery road.
- Bounded force-zone debug proxies with exact rectangles, center-origin clipped acceleration arrows, active/kind metadata, detached render strings, a Loom count, and truncation reporting.
- Nine focused force-zone tests plus integrated session/proxy coverage for validation, immutability, boundaries, high-speed sweeps, timestep scaling, overlap order, dormant/crashed no-ops, detached output, invalid impulse atomicity, velocity caps, all-three-field completion, and checkpoint re-entry.
- A repeatable `tools/capture-v17.mjs` browser harness and four inspected hero, collision, mobile DPR 2, and Reduced Motion images under `docs/screenshots/v1.7/`.

### Changed

- Release/package/cache identity advances to `1.7.0`; authoritative identity advances to `physics-4` and `course-4`; replay schema remains `1`.
- The public `applyImpulse()` hook now rejects non-finite or malformed inputs, invalid sample timing, and unknown bike modes before mutation; it returns a success/no-op result and preserves the existing ground/air speed and spin clamps.
- Run-session order now evaluates Kinetic Looms after rules/TNT and before lifecycle entry, with lethal crash and valid finish taking priority; field velocity affects the next fixed physics tick.
- The service-worker literal precache and asset audit include the new runtime module.
- The repository/store presentation now targets a 16-course, 16-Gold, screenshot-backed Vector Weave candidate while preserving earlier galleries and release notes.

### Verified

- **Complete local gate:** 3 asset/offline subtests, 87 deterministic system subtests, 16 physics/rules routes, 16 Gold tapes replayed twice (32 exact browser passes), and 2 browser profiles.
- **Baseline preservation:** levels 1–15 retain identical finish ticks, run ticks, elapsed/net times, scores, recovery counts, and authoritative state hashes outside version-bearing tokens.
- **Vector Weave:** authoritative session touches and enters all three fields with zero crashes; the Gold route finishes in 258 ticks / 4.30 seconds with 3,644 points and zero recoveries.
- **Performance:** Chrome 150 recorded 360 samples per profile; work p95 was 1.00 ms desktop against 8 ms and 2.20 ms mobile DPR 2 against 12 ms. Pacing p95 was 3.70 ms for both and remains diagnostic.
- **Visual QA:** four full-resolution captures were inspected; the collision image aligns Loom art, rectangles, and clipped vectors, while mobile controls remain visible and Reduced Motion retains direction.

### Remaining before promotion

- Human keyboard and touch calibration for Vector Weave recovery, optional-deck readability, and star targets.
- Representative physical iOS/Android, real gamepad, audio/haptics, long-session, install, offline-relaunch, and low-end-device checks.
- Hosted v1.7 Actions evidence, eligible Pages publish, cache replacement, visible version, and canonical production smoke.
- General moving terrain, rotated/two-sided closed chains, and solid side/ceiling contacts remain open U04 work.

## [1.6.0] — 2026-07-13 — Smooth Ride (release candidate)

This candidate completes the local U03 Smooth Ride acceptance gate. It is not described as production-live or proven on low-end physical hardware until review, eligible-branch publishing, canonical Pages/cache/offline smoke, and real-device checks are complete.

### Added

- A DOM-free bounded effect-pool module with unique leases, per-slot generations, deterministic oldest-active eviction, stale-release protection, clear-without-storage-reallocation, allocation-free active iteration, stable live statistics, and schema/custom-initializer modes.
- Three integrated presentation pools with hard identity limits: 384 particles, 32 popups, and 220 tracks—636 total reusable effect slots regardless of long-run churn.
- A DOM-free input state machine that aggregates keyboard, simultaneous pointers, gamepad snapshots, and development input without one source suppressing another.
- Explicit pointer end/cancel/lost-capture ownership, lifecycle clearing for blur, hidden documents, rotation, and manual resets, plus browser-consumable pause recommendations and detached diagnostic telemetry.
- Configurable keyboard/gamepad mappings, reusable fixed-tick command reads, and left-handed command-cluster metadata. The settings UI now persists and visibly applies a left-hand touch layout.
- A DOM-free typed-ring performance recorder for frame time, fixed ticks, backlog, clamped/dropped time, active/pooled effect counts, viewport/DPR/rotation state, focus/cancel events, and detached p50/p95/p99 reports.
- A live `?dev&performance` overlay showing rolling frame percentiles, tick pressure, effect activity/capacity/reuse/eviction, viewport/DPR, and interruption counters.
- A repeatable installed-Chrome browser gate with desktop 1280 × 720 DPR 1 and mobile 390 × 844 DPR 2 profiles, bounded-pool assertions, page/console error checks, and a mobile interruption matrix.
- Eight versioned v1.6 QA captures covering desktop/mobile telemetry, live pooled effects, left-handed play/settings, a 320 × 568 minimum-width control pair, and safe portrait-to-landscape rotation.
- An explicit ISC license plus a storefront README, versioned release gallery, QA hub, and durable pickup records.
- Nine effect-pool tests, 17 input-state tests, and 6 performance-metrics tests, raising deterministic system coverage from 44 to 76 subtests.

### Changed

- Runtime/package identity advances to `1.6.0`; replay schema remains `1`, physics remains `physics-3`, and course generation remains `course-3`.
- Browser ride commands now flow through `input-state.js`; `game.js` remains the DOM adapter for event coordinates, shortcuts, lifecycle events, navigator gamepad reads, and pause/UI policy.
- Connected gamepads are polled once per rendered frame through reusable scratch state. Unchanged aggregate commands no longer emit or shift diagnostic events during steady controller play.
- Particles, popups, and tire tracks now acquire reusable identities and release them in place instead of allocating unbounded objects, shifting arrays, or filtering new arrays every fixed tick.
- Each animation frame records raw/clamped wall time, consumed fixed ticks, real post-budget accumulator backlog, dropped time, and effect-pool state without adding wall-clock values to authoritative simulation or replay proofs. A five-tick frame budget and six-tick backlog ceiling prevent an unbounded catch-up spiral.
- Sky and terrain gradients are cached, terrain drawing searches only the visible point slice, camera and crash-ragdoll calculations reuse scalar/lookup state, and engine, menu, settings, and control-display paths reuse previously allocated structures where practical.
- Rotation rebuilds the canvas/control geometry, clears held commands, records telemetry, and pauses active play before the resized frame can inherit stale touch input.
- Repository Gold tokens were regenerated for the required build-version compatibility change only. Their authoritative `physics-3` / `course-3` behavior did not change.
- The full npm gate now includes the two-profile browser-performance and interruption harness after assets, 76 systems tests, 15 headless routes, and 30 Gold replay passes.

### Fixed

- Touch throttle or lean can no longer remain held after `pointercancel`, lost pointer capture, window blur, a hidden document, or viewport rotation.
- Replacing a gamepad or development-input snapshot can no longer leave commands from the previous snapshot stuck.
- Simultaneous touch controls are aggregated independently, so releasing or cancelling one pointer does not release the other pointer's command.
- Standard and left-handed control geometry now fits at 320 × 568 with every target inside the viewport and opposing Gas/Brake or Lean hit circles strictly disjoint.
- Long effect-heavy runs can no longer grow particle, popup, or track identity counts beyond their declared capacities; exhausted pools evict predictably instead of extending storage.
- Per-tick effect cleanup no longer allocates replacement arrays, and repeated tire tracks no longer require front-array shifts.
- Performance samples and event counts reject non-finite input, clamp configured bounds, retain exact newest-window ordering across ring wrap, and reset while reusing their typed buffers.
- Pages publishing is restricted to a successful push on `main`; pull requests and manual dispatches run tests without publishing, and the stale legacy release branch can no longer deploy production.
- The hosted browser-performance gate now injects a bounded 360-sample probe around the game's sole animation-frame callback, measures for at least three seconds and up to fifteen seconds to collect 180 samples, and reports scheduler pacing separately from synchronous game work. Browser version and complete work/pacing diagnostics print before assertions; profile p95 budgets are not relaxed.
- After a passing hosted reference measured 1.10 ms desktop and 1.20 ms mobile work p95, the regression ceilings were tightened to 8 ms and 12 ms instead of retaining the earlier frame-interval-oriented 20/25 ms values.
- GitHub Actions checkout and Node setup advance to their current Node 24-based v6 runtimes, and the test/publish jobs now have explicit ten/five-minute timeout ceilings.

### Verification

- **Asset/offline:** 3 subtests cover syntax, local references, literal precache completeness, and the three new runtime modules.
- **Deterministic systems:** 76 subtests—44 prior rules/replay/kinematics/ragdoll/session/proxy tests plus 9 effect-pool, 17 input-state, and 6 performance-metrics tests.
- **Physics/routes:** all 15 authored courses pass the unchanged `physics-3` / `course-3` headless completion and stability gate.
- **Gold Runs:** all 15 build-compatible references replay twice in clean browser contexts—30 exact passes with no divergence.
- **Desktop profile:** the recorded local full-gate reference at 1280 × 720 DPR 1 measured main-loop work p95 1.00 ms and diagnostic pacing p95 3.70 ms.
- **Mobile profile:** the recorded local full-gate reference at 390 × 844 DPR 2 measured main-loop work p95 0.81 ms and diagnostic pacing p95 3.70 ms, then passed 390 × 844 and 320 × 568 disjoint/unclipped control geometry, simultaneous touch, pointer cancel, blur pause/clear, 844 × 390 rotation pause/clear, canvas resize, telemetry counters, and left-hand layout assertions.
- **Bounded effects:** browser telemetry and direct tests confirm 384/32/220 hard capacities, 636 total, with created and peak identities never exceeding their owning pool.
- **Visual QA:** eight reviewed screenshots are stored under `docs/screenshots/v1.6/`.
- **Hosted CI:** Actions run `29304809481` passed the complete 3/76/15/30/browser gate; publishing was correctly skipped for the draft pull request.

The browser timings are repeatable main-thread work and pacing evidence for the named local Chrome profiles, not a claim that every phone will match them. Headless rendering, compositor/GPU cost, host scheduling, hardware, drivers, thermal state, installed mode, and production service-worker behavior can all differ from a physical device.

### Remaining before production sign-off

- Merge through an eligible branch, verify visible `v1.6.0`, Pages workflow success, cache replacement, installability, and offline reload at the canonical URL.
- Run keyboard, multitouch, physical gamepad, audio, haptics, reduced-motion, crash/retry, Gold Run, background/foreground, and repeated portrait/landscape smoke on representative real devices, including a deliberately low-end phone.
- Record production performance results separately from the local headless profiles and retain screenshots/console evidence.
- Continue U04 with force-zone contracts and fixtures before broadening moving/closed collision geometry; do not change `physics-3` or Gold compatibility accidentally.

## [1.5.0] — 2026-07-13 — Gold Standard (release candidate)

This candidate is integrated on the feature branch and is not described as production-live until review, eligible-branch publishing, and canonical Pages/cache/offline smoke testing are complete.

### Added

- A repository-owned `public/golden-tapes.json` manifest with one browser-recorded recovery proof for all 15 current courses.
- A local-only Chrome/Chromium golden generator that launches the real game, completes every built level, validates each emitted replay, and writes deterministic versioned output without external network access.
- A browser verifier that validates manifest/token/catalog compatibility, replays every course twice in clean contexts, compares finish tick, run tick, elapsed/net time, score, recovery count, proof verdict, and repeated results, and fails on page errors.
- Visible **GOLD ✓** badges on course cards, a **GOLD RUN** results action, an in-run Gold label, and **GOLD REFERENCE VERIFIED** finish status.
- A DOM-free authoritative run-session module for terrain, bike physics, hazards, kinematic ground, scoring, checkpoint/crash/respawn/finish transitions, and proof-ready snapshots.
- Trigger-controlled moving platforms with dormant solid state, explicit track sensors, local activation clocks, deterministic activation events, and Lift Logic's first teaching setup.
- Exact kinematic checkpoint snapshot/restore, including activation state/tick and complete detached previous/current poses.
- A DOM-free collision-proxy builder for terrain, bike circles/sweeps, hazards, platforms, checkpoints, and finish triggers with finite caps and detached renderer data.
- An aligned development collision overlay, `C` toggle, `?dev&debug=collisions` route, count/tick legend, and screenshot evidence.
- Player-facing messages for missing, incompatible, damaged, and oversized saved replay proofs.
- Versioned documentation sections for releases, QA, screenshots, architecture/handoff, and store-style repository presentation.
- A committed `package-lock.json` for reproducible browser-tool dependency resolution.

### Changed

- Browser simulation now records/selects input, advances `run-session.js` exactly once per fixed tick, and translates plain authoritative events into presentation instead of duplicating physics/rules/scoring logic in `game.js`.
- Checkpoint retry restores exact triggered-platform motion phase rather than deriving all platform poses only from the restored hazard tick.
- Replay final-state proof now uses the richer authoritative session snapshot, including session/run/platform ticks, scoring state, expanded bike/hazard state, and platform activation.
- `Course.platform()` now preserves `startActive` and absolute/relative trigger authoring metadata.
- Lift Logic's first vertical deck begins dormant and activates from a visible sensor before the rider reaches it.
- The service-worker precache now includes run-session, debug-proxy, and repository Gold Run data.
- Runtime/package release identity advances to `1.5.0`; course compatibility advances to `course-3`; physics remains `physics-3`.
- The complete npm gate now includes asset/offline, 44 system tests, the 15-route physics gate, and repeated browser verification of all 15 Gold Runs.

### Fixed

- Browser lifecycle and Node fixtures can no longer drift on score order, checkpoint capture, crash timing, automatic/manual respawn, fallout, or finish arithmetic because they consume the same run-session authority.
- Triggered moving decks no longer lose their active state or restart at the wrong phase after a checkpoint retry.
- Kinematic snapshot restore rejects malformed, nonfinite, duplicate, missing, mismatched, or geometrically inconsistent data atomically before mutating runtime state.
- Repository reference playback cannot silently masquerade as an ordinary saved proof; its source and verified verdict remain visible.
- Stale local proof rejection no longer silently starts an unrelated normal run.
- Collision inspection no longer depends on querying or mutating authoritative contact state.
- New public runtime modules and reference data cannot silently fall out of offline packaging.

### Verification

- **Asset/offline:** 3 subtests validate the complete public runtime, local references, literal precache, and critical simulation/proxy modules.
- **Deterministic systems:** 44 subtests cover rules/restart, replay, kinematics, ragdoll, authoritative run sessions, and collision proxies.
- **Physics/routes:** all 15 authored courses pass terrain/hazard-aware completion, checkpoint, stability, finite-state, and speed assertions.
- **Gold Runs:** all 15 checked-in tapes replay twice in clean browser contexts—30 verified runs with no divergence or page errors.
- **Visual QA:** desktop Gold menu, sensor lift, collision overlay, verified Gold finish, and 390 × 844 mobile menu captures were reviewed and committed under `docs/screenshots/v1.5/`.
- The generator produced byte-identical output across independent same-build runs before the final manifest was checked in.

### Remaining before production sign-off

- Merge through an eligible branch, confirm the GitHub Pages workflow, then smoke-test visible `v1.5.0`, cache replacement, offline reload, install, audio, reduced motion, keyboard, multitouch, and gamepad flows on the canonical URL.
- Replace automation recovery references with separately classified clean human safe/apex tapes where U10/U14 requires them; current recovery counts are evidence, not a difficulty claim.
- Measure mobile p95 frame time and allocations, pool hot visual effects, and complete the U03 performance gate.
- Add force zones, arbitrary moving/closed chains, rotating/broader platforms, breakable ground, wheelie feedback, surface audio, PB ghosts, and future world packs through their roadmap dependencies.

## [1.4.0] — 2026-07-13 — Proof & Platforms (release candidate)

This candidate is integrated in the current worktree. It is not described as production-live until the reviewed changes reach an eligible publish branch, the Pages workflow succeeds, and the canonical URL passes a smoke test.

### Added

- A third menu world, **R&D Yard**, with three original courses: Freight Flight, Lift Logic, and Proof Circuit. The playable build now contains 15 levels.
- A DOM-free kinematic-ground module with immutable authored definitions, deterministic 60 Hz poses, static/sine/ping-pong/lift/piston paths, runtime reset, interpolated render sampling, and stable identifiers.
- Solid one-way platform-top collision for wheels and bike frame, including swept high-speed landings, two-wheel carry, bounded surface velocity, and bounded upward launch inheritance.
- `Course.platform()` authoring and visible freight/lift models with guide rails, supports, lights, surface markings, shadows, and matching rectangular collision geometry.
- A DOM-free replay-tape module with gas, brake, lean-left, lean-right, and restart bitmasks; run-length compression; strict size/range checks; canonical state hashing; base64url encoding; and random tick playback.
- Last-completed-run recording per level, local replay persistence, Replay flow from results, proof status in the finish panel, and replay markers on course cards.
- Replay compatibility checks for schema, level ID, build version, `physics-3`, and `course-2`; incompatible or malformed saved tapes are rejected instead of being simulated.
- A DOM-free crash-ragdoll module with segmented bike/rider nodes, constraints, terrain/platform contact, finite safety limits, deterministic stepping, settling, and detached render snapshots.
- Crash-theater rendering and camera handoff, with impact impulse direction from the crash source.
- A static, readable reduced-motion crash pose that skips ragdoll simulation and suppresses strong hitstop, flash, shake, and camera kick.
- Landing grades—perfect, clean, rough, and slam—with momentum-retention bands, score messaging, impact feedback, and landing audio.
- A five-band engine/load model with airborne rev behavior, shift blips, reactive filter/pitch, and a visible gear readout.
- Dedicated replay, kinematics, and ragdoll regression suites under the new `npm run test:systems` gate.

### Changed

- Runtime and package release metadata advance from `1.3.0` to `1.4.0`; the service-worker cache advances with the runtime version.
- Physics compatibility advances to `physics-3`, and authored course compatibility advances to `course-2`.
- Checkpoint crossing captures the exact deterministic rules tick, checkpoint index, and cloned hazard runtime state.
- Checkpoint retry restores that snapshot and resets kinematic platforms to the restored tick. Changes after the checkpoint do not leak into the retry.
- A full level restart rebuilds the authored initial rules, bike, platform, replay, score, particle, camera, and presentation state.
- Physics grounded state includes solid platform contact; landing feedback and engine behavior therefore work on moving decks as well as terrain.
- The finish flow now distinguishes a new authoritative run from replay playback: playback does not overwrite progression or best records.
- The results panel includes replay proof state and Replay alongside Next and Menu.
- The asset/offline verifier treats replay, kinematics, and ragdoll modules as critical cached gameplay dependencies.
- The headless route gate now enumerates all 15 authored levels and restores deterministic checkpoint state after a simulated crash.

### Fixed

- Checkpoint retries no longer inherit TNT fuse/explosion state or moving-hazard changes that occurred after the checkpoint snapshot.
- Full retries no longer depend on partially reset machine state.
- Fast downward crossings can no longer pass through a moving platform top solely because the bike and platform moved during the same tick.
- Long platform contact no longer adds unbounded energy, and platform launches cannot inherit unsafe velocity.
- Replay playback cannot silently accept a different level, build, physics model, course generator, malformed payload, or oversized token.
- Replaying a proof cannot update stars, unlocks, best time, or best score.
- Crash presentation no longer needs to mutate the authoritative bike/run simulation after failure.
- Catch-up frames stop simulating as soon as a run finishes, so a finalized replay recorder cannot receive another tick.
- Manual tap/keyboard crash respawns are queued on the fixed tick, recorded in proof tapes, and reproduced during playback.
- Replays now stop with an explicit divergent result if a compatible tape reaches its finish tick without finishing; recorder size-limit failures no longer lock the render loop.
- New finishes show **Proof Recorded**; **Proof Verified** is reserved for a completed playback whose tick and state hash actually match.
- Floating decks now accept gas, brake, and bounded reverse input relative to their surface velocity, and simultaneous wheel/head platform contact correctly crashes.
- Ground-contact hysteresis removes duplicate idle landing events without changing the 15-level completion gate.
- Ordinary crashes use readable sparks and dirt instead of a full smoke blast; the overlay waits for the impact beat, tap-to-respawn works across the canvas, and retry clears crash transients.
- Reduced-motion ragdolls are projected out of sloped terrain, while dynamic friction/contact accounting runs once per physical substep rather than once per solver iteration.

### Verification

- **Asset/offline:** 3 Node subtests validate the complete public runtime, critical cached modules/art, and rejection of computed precache paths.
- **Deterministic systems:** 28 Node subtests cover rules/restarts (5), replay tapes and proof reproduction (9), kinematic platforms (9), and crash ragdolls (5).
- **Physics/routes:** the headless gate enumerates all 15 levels, checks terrain-only and hazard-aware completion, restores checkpoint state, and asserts finite bounded bike behavior and stable settling.
- Kinematic evidence includes ten-cycle idle-circle and complete-bike carry, high-speed swept crossing, bounded inheritance, definition immutability, and exact reset/replay behavior.
- Ragdoll evidence includes 30 scripted crashes remaining finite and settling on terrain, exact repeated simulation, and a non-simulating reduced-motion pose.
- Replay evidence includes RLE roundtrip, restart events, random tick lookup, canonical hashes, malformed/oversized rejection, explicit version mismatch, and a recorded physics run reproducing its finish tick and hash.

The complete `npm test` command passed on 2026-07-13 against the integrated v1.4 runtime present during this documentation update: 3 asset/offline subtests, 28 deterministic system subtests, and all 15 headless routes. Browser smoke also covered a clean proof recording/playback hash match, tap-to-respawn, moving-ground presentation, the R&D menu, mobile layout, and an error-free console. Production/offline smoke is still required after deployment.

### Remaining before production sign-off

- Complete keyboard, multitouch, reduced-motion, audio, install, service-worker-update, and offline-reload browser smoke tests on the final deployed candidate.
- Human-calibrate star targets, recovery timing, and safe/stunt routes for all 15 levels; headless completion is a regression floor, not a difficulty or fun rating.
- Record repository-owned golden completion tapes for every course. The current system stores the player's last completed run only.
- Add clear in-game messaging when a saved replay is discarded for version incompatibility; the decoder result is explicit, but the current start flow silently removes the stale local tape.
- Extend moving ground beyond axis-aligned one-way decks with triggered lifts, richer camera cues, and reference tapes before U10 is accepted as complete.
- Finish the wheelie meter, tire/surface audio, measured landing envelopes, and simultaneous-audio budget before U07 is accepted as complete.
- Split browser orchestration, rendering, input, audio, and persistence out of the still-large `public/game.js` module.

## [1.3.0] — 2026-07-13 — Stormworks Foundation (release candidate)

This candidate is implemented on the feature branch and is not described as production-live until its pull request is merged and the Pages workflow succeeds.

### Added

- Six original Stormworks courses: Boostline, Pendulum Pass, Cold Circuit, Blast Foundry, Piston Works, and Stormbreak.
- A two-page world selector so Canyon Run and Stormworks each present six readable course cards.
- Deterministic patrol saws, pendulum weights, piston crushers, and Nitro crates.
- Swept relative bike/hazard collision to reduce high-speed misses.
- Nitro fuse state, lethal core, outer launch impulse, blast scoring, particles, and camera feedback.
- Ice, boost-rail, and bouncy-membrane terrain with distinct physical behavior and rendering.
- Terrain segment metadata and runtime enable masks for future breakable and moving geometry.
- A DOM-free rules module for hazard state, checkpoints, finishes, near misses, blasts, and fixed-tick machine transforms.
- Developer launch flags for direct levels, deterministic autoplay, and forced touch layout.
- A shared public version/cache source and visible v1.3.0 build label.
- Asset, offline-cache, rules, terrain, route, hazard, and stability tests under one npm test command.
- Store-style README, 30-update production roadmap, architecture reference, project-state handoff, changelog, and pull-request checklist.

### Changed

- Landing impact is captured before contact projection and exposed as an explicit per-step landing event.
- Flip awards require a clean landing and cannot be granted by a crashed landing.
- Camera, audio, and speed-sensitive effects use bike-center velocity instead of rear-wheel node velocity.
- Horizontal air-speed and vertical fall-speed limits are independent.
- Wheel rendering matches the collision radius.
- Terrain contacts skip degenerate segments, prefer upward one-way normals, perform shallow underside recovery, and repeat contact after constraints.
- Hot collision checks reuse stamped buckets instead of allocating a Set on every query.
- Touch controls use Pointer Events and support simultaneous controls.
- Pointer cancellation, lost capture, window blur, and document visibility changes release held inputs.
- Mobile menus use a compact control hint.
- Service-worker installation precaches the complete runtime atomically and removes only old Moto Rush X3 caches.
- Pull requests run the release tests; publishing waits for tests and is skipped for pull-request events.
- Package metadata now points to the canonical repository and GitHub Pages game.

### Fixed

- Missing logic, rules, bike-body, and music files can no longer silently fall out of the offline cache.
- A shallow terrain underside contact no longer traps the bike indefinitely.
- Zero-length terrain segments can no longer create invalid contact math.
- Landing force no longer reads as zero after depenetration.
- Simultaneous crash/finish frames no longer award a false completion.
- Long falls no longer erase horizontal momentum by applying a single combined speed clamp.
- Crashed runs no longer receive clean flip awards.
- Moving-hazard simulation no longer mutates authored level definitions.

### Verification

- Asset verification checks every public runtime file, local reference, static precache entry, JavaScript module, and JSON document.
- Rule tests cover deterministic hazard motion, immutable definitions, one-way terrain recovery, segment disabling, surface metadata, and Nitro impulses.
- Physics tests cover 12 terrain-only full-throttle routes, 12 hazard-aware deterministic routes, fall-out parity, idle settling, finite values, maximum speed, crashes, and finishes.
- Browser QA covered desktop world selection, new course cards, boost surfaces, pendulum models, direct developer launch, autoplay, and a 390×844 mobile menu.

### Known follow-ups

- Finish the remaining U02 rules/UI extraction and repeated-restart fixture.
- Add kinematic moving ground, force zones, and collision debug overlays to finish U04.
- Record human reference tapes and recalibrate all star thresholds before U14 is called complete.
- Give Stormworks its final background, prop atlas, warning audio, and store screenshots.
- Split the large game renderer/controller module and pool visual effects.

## [1.2.0] — Earlier history — Real Dirt Bike

- Added the sprite-based bike/rider presentation, spinning tires, visible suspension, larger wheels, and harder course tuning.
- Added a visible menu build version and the first automatic public-directory deployment to gh-pages.
- Added the first detailed feel specification and long-range roadmap.

## [1.1.0] — Earlier history — Feel and Feedback

- Expanded the initial prototype with stronger physical feedback, local progression, presentation polish, and game-feel work.

## [1.0.0] — Earlier history — Prototype

- Established the static Canvas game, fixed-step motorcycle simulation, first Canyon Run courses, checkpoints, timing, stars, and browser-local saves.

# Changelog

All notable Moto Rush X3 changes are recorded here so development can resume without reconstructing old decisions from source code. Dates use YYYY-MM-DD.

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

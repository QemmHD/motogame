# Changelog

All notable Moto Rush X3 changes are recorded here so development can resume without reconstructing old decisions from source code. Dates use YYYY-MM-DD.

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

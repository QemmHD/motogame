# Moto Rush X3 Architecture

This document describes the `v1.5.0` Gold Standard release-candidate architecture as it exists on 2026-07-13. The game is a static, framework-free Canvas 2D application. `public/` is the complete deployment boundary.

## Runtime map

| Path | Responsibility |
| --- | --- |
| `public/index.html` | Canvas shell, mobile/PWA metadata, build metadata bootstrap, game-module load, and service-worker registration. The `?dev` flag deliberately skips service-worker registration. |
| `public/version.js` | Single runtime release and offline-cache version. Exposes frozen `globalThis.MOTO_RUSH_BUILD`. |
| `public/game.js` | Browser orchestration: asset/reference loading, input/replay selection, audio, save data, menus, presentation effects, crash theater, camera, Canvas rendering, and the animation loop. It advances the authoritative run session but does not reimplement its rules or scoring. |
| `public/run-session.js` | DOM-free authoritative fixed-step lifecycle: terrain/bike/rules/platform creation, playing/crashed steps, scoring, checkpoint capture/restore, triggered platform activation, crash/respawn/finish transitions, and proof snapshots. |
| `public/levels.js` | `Course` builder DSL, `course-3` compatibility identity, and 15 authored definitions across Canyon Run, Stormworks, and R&D Yard. |
| `public/physics.js` | DOM-free `physics-3` terrain/bike simulation, collision response, platform integration, surface behavior, landing grades/retention, flip signals, safety limits, and impulses. |
| `public/rules.js` | DOM-free per-run state, deterministic full/checkpoint reset, tick-derived hazard motion, swept hazard checks, TNT behavior, checkpoints, near misses, and finish events. |
| `public/kinematics.js` | DOM-free immutable moving-ground definitions, fixed/local-tick poses, dormant activation, exact checkpoint snapshots, validated atomic restore, render sampling, swept one-way contact, carry, and bounded launch inheritance. |
| `public/replay.js` | DOM-free fixed-tick input tapes, RLE compression, strict base64url codec, deterministic state hashing, compatibility checks, and random-access playback. |
| `public/ragdoll.js` | DOM-free fixed-step crash-theater simulation, segmented bike/rider constraints, terrain contact, finite settling, reduced-motion pose, and detached render snapshots. |
| `public/debug-proxies.js` | DOM-free finite/detached collision snapshot for terrain, bike sweeps, hazards, platforms, checkpoints, finish triggers, and the development overlay. |
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
| `tools/ragdoll.test.mjs` | Thirty-crash finite/settle fixture, exact repeat, and reduced-motion tests. |
| `tools/run-session.test.mjs` | Browser-neutral finish, crash timing, manual/automatic respawn, full restart, scoring repeatability, trigger/checkpoint restore, and authored-data immutability tests. |
| `tools/debug-proxies.test.mjs` | Proxy-to-authoritative-geometry alignment, finite bounds, caps, detachment, and no-mutation tests. |
| `tools/test-physics.mjs` | Asserted 15-level headless completion, checkpoint recovery, and stability gate. |
| `tools/generate-golden-tapes.mjs` | Loopback-only real-browser generator for deterministic all-course recovery tapes. |
| `tools/verify-golden-tapes.mjs` | Strict manifest/token/catalog validator and twice-per-level clean-browser replay gate. |
| `.github/workflows/pages.yml` | Runs the release gate, then publishes the `public/` subtree to `gh-pages` for eligible pushes or a manual dispatch. |

Keep simulation behavior in `physics.js`, `rules.js`, `kinematics.js`, `run-session.js`, `replay.js`, or `ragdoll.js` when it can remain independent of the DOM. `game.js` selects/records input, advances `run-session.js`, and turns returned events into presentation, sound, persistence, and UI. Ragdoll state is deterministic presentation but is deliberately not authoritative run state.

## Fixed-step data flow

The browser paints with `requestAnimationFrame`, but game state advances in fixed `1 / 60` second steps.

1. `version.js` initializes the build label and cache name before the ES modules load.
2. `game.js` loads assets plus the compatible repository Gold manifest and builds all level definitions once with `buildLevels()`.
3. `startLevel()` validates a supplied player/Gold tape when present, then calls `initializeRunSession()` to create fresh bucketed terrain, rules, kinematics, bike, scoring, and lifecycle state. Normal play creates a recorder tagged with level/build/physics/course compatibility metadata.
4. Each animation frame clamps a long wall-clock gap to 100 ms, applies the current slow-motion multiplier, and adds the result to an accumulator.
5. While the accumulator contains at least one `1 / 60` second step, `simulate(STEP)` runs for active play or crash states. Particles and the camera also update on this fixed cadence.
6. `simulate()` reads keyboard, pointer, development-autoplay, or replay input. A normal run records that snapshot exactly once; replay mode reads the mask for the same integer replay tick.
7. Playing state calls `stepPlayingRun()` once. The session advances kinematics, steps bike physics, activates passed platform sensors, resolves platform contact, applies scoring, advances rules/hazards, captures checkpoints, and transitions to crash/fallout/finish as one ordered operation.
8. Crashed state calls `stepCrashedRun()` once. Manual restart is consumed on its recorded fixed tick; otherwise the 1.85-second session timer advances and auto-respawns at the deterministic boundary.
9. `game.js` consumes plain flips, landings, score records, blasts, near misses, platform activation, checkpoint, crash, finish, and respawn events to drive audio, haptics, particles, camera, ragdoll, persistence, and UI without mutating authoritative arithmetic.
10. A crash creates a separate ragdoll snapshot and advances it during the short crash state. A finish finalizes or verifies the authoritative session snapshot. Rendering reads state but does not advance authoritative bike/rules/platform ticks.

Hitstop intentionally renders without advancing the fixed simulation. Slow motion changes how quickly fixed ticks are consumed relative to wall-clock time; it does not change the fixed simulation step. Hazard and platform movement derive from integer simulation ticks, not `performance.now()`, so equal versioned starting state and inputs produce equal machine poses.

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
- `checkpoints`: checkpoint positions;
- `decos`: non-simulation markers such as checkpoint art;
- `finishX` and `finishPt`;
- vertical bounds used by camera and fall-out logic.

Builder methods cover flats, slopes, hills, dips, rises, falls, ramps, landings, bumps, whoops, gaps, complete jump assemblies, surfaces, hazards, solid platforms, checkpoints, and the finish. `jump()` can populate a pit with spikes, barrels, or TNT. Every playable level returns a name, world, course, and three ordered star-time thresholds.

### Surfaces

Surface helpers temporarily tag newly generated terrain points, then restore the prior surface. `buildTerrain()` transfers point metadata to collision segments. A new surface is not complete until its builder API, collision response, visual language, tests, and at least one teaching setup in a level agree.

### Hazards

Level hazard objects are definitions and must not be mutated during a run. `createRunState()` clones them and adds runtime fields such as stable IDs, current/previous positions, spin, near-miss state, TNT fuse state, and explosion state.

Supported motion is calculated at a fixed 60-tick rate:

- sine patrol on the `x` or `y` axis;
- pendulum motion around an anchor;
- piston motion on the `x` or `y` axis.

Hazard collision is swept between each bike node's previous/current position and each hazard's previous/current position. This reduces tunnelling when both objects move quickly. Saws, spikes, barrels, maces, and crushers currently resolve as lethal radius checks rather than solid kinematic terrain. TNT has a trigger radius and short fuse; its core is lethal, while its outer radius applies a launch impulse and emits an impulse event.

The checkpoint list always begins with the course start. Progress advances when the bike passes checkpoint `x` coordinates. Crossing a checkpoint captures `run.tick`, `cpIndex`, cloned hazard runtime fields, and an exact kinematic snapshot. `respawnRunSession()` reconstructs clean rules state and restores the validated platform snapshot, so hazard changes and platform activation/motion after the checkpoint never survive a retry. The session accepts finish only when the bike is not crashed.

### Kinematic platforms

Platform definitions are cloned, normalized, and deeply frozen when `createKinematicRun()` starts. Each runtime record keeps previous/current poses so collision can be relative and drawing can interpolate without mutating authoring data. Supported motion families are static, sine, ping-pong, lift, and piston aliases along one axis. `startActive: false` keeps a solid deck at base until `activateKinematicPlatform()` begins its local timeline; authored `triggerX` policy is owned by the run session.

Current solid geometry is intentionally narrow: an axis-aligned rectangle with a one-way top. It is enough for freight shuttles, elevators, recovery decks, stable carry, bounded apex launches, and rear-wheel gas/brake/reverse relative to deck velocity. Head sweeps remain lethal even when a wheel contacts the same deck. It is not yet arbitrary moving terrain, a rotated collider, a solid side/ceiling, or a general force zone. Visible deck dimensions must match the rectangle returned by `sampleKinematicPlatform()`.

Full restart creates a fresh kinematic run at tick zero. Checkpoint capture stores every platform's active/activation state and complete previous/current pose. Restore validates the whole detached snapshot before mutation, then resumes the same local/global motion phase. This exact contract is required for a replay proof to reproduce triggered moving ground.

### Replay tapes and proofs

Replay input is a five-bit mask (`gas`, `brake`, `lean left`, `lean right`, `restart`) sampled once per fixed game tick. Adjacent identical masks are stored as `[mask, count]` runs. The codec uses a compact fixed-key JSON object encoded as unpadded base64url; strict field, range, canonical-form, tick, run-count, byte, and token-length checks apply before untrusted data reaches playback.

Every tape carries schema, level ID, build version, physics version, and course-generator version. `decodeReplay()` returns a structured `MALFORMED`, `TOO_LARGE`, or `INCOMPATIBLE_VERSION` result rather than throwing into game flow. `createReplayPlayback()` precomputes cumulative run ends and provides random `maskAt(tick)` / `inputAt(tick)` lookup. Manual crash respawn is queued and consumed on a fixed tick, so its restart bit reproduces the same checkpoint timing. The game treats reaching `finishTick` without a finish as divergence instead of continuing on neutral input indefinitely.

At finish, `snapshotRunSession()` builds a quantized proof record containing session/rules/platform ticks, lifecycle/scoring state, checkpoint, time, bike state, expanded hazard state, and platform previous/current/activation state; `game.js` adds the matching replay tick. `hashReplayState()` sorts object keys and returns an eight-hex FNV-1a fingerprint. A normal finish is labeled **Proof Recorded**; player playback shows **Proof Verified**, and repository playback shows **Gold Reference Verified**, only after finish tick and final-state hash match. Camera, particles, random dust/exhaust, audio, and ragdoll presentation are excluded because they are not authoritative run state.

Replay playback never updates unlocks, stars, best times, or best scores. One player token per level currently lives in the local save. `golden-tapes.json` adds one checked-in recovery reference per course; the release gate replays each twice in a real browser. PB ghosts, human safe/apex classes, migrations, pruning, URL import/export, and challenge UX remain future layers.

### Crash presentation

`createRagdoll()` copies a bike snapshot into independent bike/rider nodes and constraints. `stepRagdoll()` advances at its own bounded `1 / 120` step and receives terrain contact through a callback, allowing the module to stay DOM-free. `readRagdoll()` returns a detached renderer-friendly pose so Canvas code cannot mutate the simulation accidentally.

The ragdoll begins only after the authoritative run has failed and cannot change checkpoints, time, score, hazards, platforms, or replay proof. Dynamic terrain friction and contact counts apply once per physical substep rather than per solver iteration. A reduced-motion request creates a static pose, deterministically projects every part out of supplied terrain, and does not simulate. This presentation determinism is testable, but it is not included in run-proof hashes.

## Browser state and persistence

The browser client persists JSON under `localStorage` key `motoRushX3.save.v1`. The current shape includes:

- best time by level;
- best score by level;
- best star count by level;
- highest unlocked level;
- one last completed replay token by level;
- music, sound-effect, reduced-motion, and haptics settings;
- mute state.

Reads and writes are wrapped in `try`/`catch`, and missing fields receive defaults. There is no separate migration framework: a breaking save-shape change must either preserve these fields, migrate data during `loadSave()`, or intentionally introduce a new key with a documented reset policy.

Pointer input supports multiple simultaneous pointers and clears each pointer on `pointerup`, `pointercancel`, and `lostpointercapture`. Keyboard/pointer state is cleared and active play pauses when the page loses focus or becomes hidden. This prevents stuck controls after an interruption.

## Offline and deployment model

`public/version.js` is authoritative for both the menu label and service-worker cache identity. The service worker imports it, atomically adds the literal `PRECACHE` list during install, removes only stale caches with the Moto Rush prefix during activation, and uses cache-first fetches. Successful same-origin network responses may populate the cache at runtime. Query strings are ignored for cache matching.

`tools/verify-public-assets.mjs` enforces that every runtime file under `public/` is explicitly precached, every literal local reference resolves, all public JavaScript parses, JSON is valid, the cache name derives from the single semantic version, and the precache contains only literal canonical paths. Replay, kinematics, run session, debug proxies, ragdoll, rules, physics, levels, Gold data, bike art, and music are covered. Additions to `public/` therefore require a matching `PRECACHE` entry.

The Pages workflow runs `npm test` before publishing. On an eligible push to `main` or `claude/moto-x3m-bike-game-ipwi7p`, or on a manual workflow dispatch, it splits `public/` into a temporary branch and force-pushes that subtree to `gh-pages`. A push to another feature branch does not update production. Because the deployed root is the contents of `public/`, repository-relative paths outside `public/` are never available to the live game.

## Core invariants

Preserve these rules when changing the game:

1. Simulation uses a fixed `1 / 60` second step; wall-clock time must not directly drive course rules or hazard motion.
2. `physics.js` and `rules.js` remain DOM-free and executable in Node tests.
3. `kinematics.js`, `run-session.js`, `debug-proxies.js`, `replay.js`, and `ragdoll.js` also remain DOM-free and executable in Node tests.
4. Course definitions, especially `course.hazards` and `course.platforms`, stay immutable during play; mutable state belongs to a run object.
5. Positive `y` is down, and normal course ground and platform tops are one-way from above.
6. The configured wheel radius is both the collision radius and the visual radius.
7. A run is not complete if the finish and a crash occur together.
8. Full restart returns to authored tick-zero state; checkpoint retry returns to captured rules and exact validated kinematic snapshots, including triggered-platform local phase.
9. Replay input is recorded/read once per fixed simulation tick. Playback cannot mutate progression, and proof hashes exclude non-authoritative presentation state.
10. Schema, level, build, physics, and course versions must match before replay playback.
11. New public runtime files and local references must be present in the static service-worker precache.
12. `public/version.js` contains the only runtime release-version literal and owns cache invalidation.
13. Every level has a start, at least one valid route, a finish, and three star thresholds ordered fastest to slowest.
14. A release must pass asset/offline checks, all deterministic system tests, all-level completion/stability tests, all compatible repository proofs, and real browser visual/input smoke.

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

### Add a surface

1. Add a scoped `Course` helper that restores the previous surface after generating its segment.
2. Add named behavior to `resolveWheel()` using `surfaceStrength` where appropriate.
3. Add a unique, legible rendered treatment and feedback.
4. Add metadata and physics assertions, then validate braking, reverse travel, landing, and checkpoint respawn on the surface.

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

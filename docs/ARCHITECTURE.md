# Moto Rush X3 Architecture

This document describes the `v1.3.0` release-candidate architecture as it exists on 2026-07-13. The game is a static, framework-free Canvas 2D application. `public/` is the complete deployment boundary.

## Runtime map

| Path | Responsibility |
| --- | --- |
| `public/index.html` | Canvas shell, mobile/PWA metadata, build metadata bootstrap, game-module load, and service-worker registration. The `?dev` flag deliberately skips service-worker registration. |
| `public/version.js` | Single runtime release and offline-cache version. Exposes frozen `globalThis.MOTO_RUSH_BUILD`. |
| `public/game.js` | Browser orchestration: asset loading, input, audio, save data, menus, run lifecycle, scoring, effects, camera, Canvas rendering, and the animation loop. |
| `public/levels.js` | `Course` builder DSL and the 12 authored level definitions in the Canyon Run and Stormworks worlds. |
| `public/physics.js` | DOM-free terrain and bike simulation, collision response, surface behavior, landing/flip signals, safety limits, and impulses. |
| `public/rules.js` | DOM-free per-run state, tick-derived hazard motion, swept hazard checks, TNT behavior, checkpoints, near misses, and finish events. |
| `public/strings.js` | Player-facing interface strings. |
| `public/logic.js` | Minimal generic game-host compatibility surface. It is currently a stub and is not the Moto Rush simulation. |
| `public/sw.js` | Versioned cache-first service worker and atomic runtime precache. |
| `public/manifest.json` | Installable web-app metadata and icons. |
| `public/assets/` | Runtime art, icons, textures, and music. |
| `tools/verify-public-assets.mjs` | Release verifier for syntax, JSON, local references, release metadata, and complete offline coverage. |
| `tools/rules.test.mjs` | Deterministic rules, collision metadata, terrain-mask, and TNT unit tests. |
| `tools/test-physics.mjs` | Asserted 12-level headless completion and stability gate. |
| `.github/workflows/pages.yml` | Runs the release gate, then publishes the `public/` subtree to `gh-pages` for eligible pushes or a manual dispatch. |

Keep simulation behavior in `physics.js` or `rules.js` when it can remain independent of the DOM. `game.js` should consume simulation signals and turn them into presentation, sound, score, persistence, and state transitions.

## Fixed-step data flow

The browser paints with `requestAnimationFrame`, but game state advances in fixed `1 / 60` second steps.

1. `version.js` initializes the build label and cache name before the ES modules load.
2. `game.js` loads assets and builds all level definitions once with `buildLevels()`.
3. `startLevel()` converts the selected course chains into bucketed terrain with `buildTerrain()`, creates a fresh bike with `createBike()`, and clones immutable hazard definitions into a fresh `createRunState()` result.
4. Each animation frame clamps a long wall-clock gap to 100 ms, applies the current slow-motion multiplier, and adds the result to an accumulator.
5. While the accumulator contains at least one `1 / 60` second step, `simulate(STEP)` runs for active play or crash states. Particles and the camera also update on this fixed cadence.
6. `simulate()` reads keyboard, pointer, gamepad, or development-autoplay input and calls `stepBike()` first.
7. The updated bike is passed to `stepRunRules()`. Rules advance the run tick, move hazards, perform swept collision checks, update checkpoints, and emit plain event data.
8. `game.js` consumes those events to trigger crash/finish state changes, scoring, popups, sound, haptics, particles, and TNT effects.
9. Rendering reads the resulting state but does not advance the physics or rule tick.

Hitstop intentionally renders without advancing the fixed simulation. Slow motion changes how quickly fixed ticks are consumed relative to wall-clock time; it does not change the fixed simulation step. Hazard movement is derived from `run.tick`, not `performance.now()`, so equal starting state and inputs produce equal hazard positions.

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

Hard limits cap collision/constraint energy (`maxLinearSpeed`) and downward fall velocity (`maxFallSpeed`). `landingImpact`, `landedThisStep`, flip events, grounded flags, center velocity, speed, and forward speed are simulation outputs for the client to consume.

## Content model

### Course geometry

A `Course` is a turtle-style builder over one or more ground polylines. Curves are sampled at approximately 10-pixel intervals. Its durable definition contains:

- `chains`: collidable terrain polylines;
- `render`: ground data used by the renderer;
- `hazards`: immutable hazard definitions;
- `checkpoints`: checkpoint positions;
- `decos`: non-simulation markers such as checkpoint art;
- `finishX` and `finishPt`;
- vertical bounds used by camera and fall-out logic.

Builder methods cover flats, slopes, hills, dips, rises, falls, ramps, landings, bumps, whoops, gaps, complete jump assemblies, surfaces, hazards, checkpoints, and the finish. `jump()` can populate a pit with spikes, barrels, or TNT. Every playable level returns a name, world, course, and three ordered star-time thresholds.

### Surfaces

Surface helpers temporarily tag newly generated terrain points, then restore the prior surface. `buildTerrain()` transfers point metadata to collision segments. A new surface is not complete until its builder API, collision response, visual language, tests, and at least one teaching setup in a level agree.

### Hazards

Level hazard objects are definitions and must not be mutated during a run. `createRunState()` clones them and adds runtime fields such as stable IDs, current/previous positions, spin, near-miss state, TNT fuse state, and explosion state.

Supported motion is calculated at a fixed 60-tick rate:

- sine patrol on the `x` or `y` axis;
- pendulum motion around an anchor;
- piston motion on the `x` or `y` axis.

Hazard collision is swept between each bike node's previous/current position and each hazard's previous/current position. This reduces tunnelling when both objects move quickly. Saws, spikes, barrels, maces, and crushers currently resolve as lethal radius checks rather than solid kinematic terrain. TNT has a trigger radius and short fuse; its core is lethal, while its outer radius applies a launch impulse and emits an impulse event.

The checkpoint list always begins with the course start. Progress advances when the bike passes checkpoint `x` coordinates. The finish event fires after the bike passes `finishX`; `game.js` accepts the finish only when the bike is not crashed.

## Browser state and persistence

The browser client persists JSON under `localStorage` key `motoRushX3.save.v1`. The current shape includes:

- best time by level;
- best score by level;
- best star count by level;
- highest unlocked level;
- music, sound-effect, reduced-motion, and haptics settings;
- mute state.

Reads and writes are wrapped in `try`/`catch`, and missing fields receive defaults. There is no separate migration framework: a breaking save-shape change must either preserve these fields, migrate data during `loadSave()`, or intentionally introduce a new key with a documented reset policy.

Pointer input supports multiple simultaneous pointers and clears each pointer on `pointerup`, `pointercancel`, and `lostpointercapture`. Keyboard/pointer state is cleared and active play pauses when the page loses focus or becomes hidden. This prevents stuck controls after an interruption.

## Offline and deployment model

`public/version.js` is authoritative for both the menu label and service-worker cache identity. The service worker imports it, atomically adds the literal `PRECACHE` list during install, removes only stale caches with the Moto Rush prefix during activation, and uses cache-first fetches. Successful same-origin network responses may populate the cache at runtime. Query strings are ignored for cache matching.

`tools/verify-public-assets.mjs` enforces that every runtime file under `public/` is explicitly precached, every literal local reference resolves, all public JavaScript parses, JSON is valid, the cache name derives from the single semantic version, and the precache contains only literal canonical paths. Additions to `public/` therefore require a matching `PRECACHE` entry.

The Pages workflow runs `npm test` before publishing. On an eligible push to `main` or `claude/moto-x3m-bike-game-ipwi7p`, or on a manual workflow dispatch, it splits `public/` into a temporary branch and force-pushes that subtree to `gh-pages`. A push to another feature branch does not update production. Because the deployed root is the contents of `public/`, repository-relative paths outside `public/` are never available to the live game.

## Core invariants

Preserve these rules when changing the game:

1. Simulation uses a fixed `1 / 60` second step; wall-clock time must not directly drive course rules or hazard motion.
2. `physics.js` and `rules.js` remain DOM-free and executable in Node tests.
3. Course definitions, especially `course.hazards`, stay immutable during play; all mutable hazard state belongs to the run state.
4. Positive `y` is down, and normal course ground is one-way from above.
5. The configured wheel radius is both the collision radius and the visual radius.
6. A run is not complete if the finish and a crash occur together.
7. New public runtime files and local references must be present in the static service-worker precache.
8. `public/version.js` contains the only runtime release-version literal and owns cache invalidation.
9. Every level has a start, at least one valid route, a finish, and three star thresholds ordered fastest to slowest.
10. A release must pass asset/offline checks, deterministic rule tests, all-level completion/stability tests, and a real browser smoke test.

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

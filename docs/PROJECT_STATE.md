# Moto Rush X3 Project State

Last updated: **2026-07-13**

This is the canonical pickup note for the active repository state. Update it whenever a batch changes the build, compatibility identity, acceptance evidence, known risks, or next priority. Chat history is not project state.

## Repository and release coordinates

| Item | Current value |
|---|---|
| Product | Moto Rush X3 |
| Candidate | `1.5.0` — Gold Standard |
| Runtime source of truth | `public/version.js` |
| Package version | `1.5.0` |
| Replay identity | schema `1`; physics `physics-3`; course `course-3` |
| Working branch | `agent/motorush-30-update-foundation` |
| Remote | `https://github.com/QemmHD/motogame.git` |
| Draft pull request | `#1` — branch review/promotion vehicle |
| Last pushed baseline before v1.5 | `03bd079f36b6f7fdb425f10de7578aded8ff69ba` — v1.4 Proof & Platforms |
| Production URL | <https://qemmhd.github.io/motogame/> |
| Deployment boundary | `public/`, published to `gh-pages` only through the eligible workflow |
| Save key | `motoRushX3.save.v1` |

The current document is part of the v1.5 release commit on top of the pushed v1.4 baseline. Use `git rev-parse HEAD` and `git status -sb` for the exact checked-out commit/worktree. Do not describe v1.5 as production-live until the branch is reviewed, promoted to an eligible branch, GitHub Pages succeeds, and the canonical URL/cache/offline path is smoke-tested.

## Current playable catalog

The candidate contains **15 handcrafted levels across three worlds**:

- **Canyon Run, L1–L6:** Warm-Up, Air Time, Whoops & Woes, Danger Zone, Cliffhanger, Grand Finale.
- **Stormworks, L7–L12:** Boostline, Pendulum Pass, Cold Circuit, Blast Foundry, Piston Works, Stormbreak.
- **R&D Yard, L13–L15:** Freight Flight, Lift Logic, Proof Circuit.

R&D Yard remains a focused mechanics lab rather than a full six-course world. Lift Logic now teaches the first sensor-triggered moving deck. Crossing the authored sensor starts the platform's local fixed-tick motion and produces a visible/audio/camera cue. The lower trail remains recoverable.

Progression persists unlocks, stars, best time, best score, settings, and the player's latest completed proof per level. Every current course also has a read-only repository Gold Run loaded from `public/golden-tapes.json`.

## v1.5 integrated architecture

### Authoritative run session

`public/run-session.js` is the DOM-free authority for:

- terrain and bike creation;
- rules/hazard and kinematic-platform runtime state;
- one fixed playing or crashed step;
- flip, landing, air, blast, and near-miss scoring;
- checkpoint capture;
- crash/fallout transition;
- 1.85-second automatic and fixed-tick manual respawn;
- exact checkpoint restore;
- finish time, score, and stars;
- quantized proof snapshot data.

The browser continues to own input selection/recording, audio, random visual particles, camera, haptics, ragdoll presentation, persistence, menus, drawing, and the animation loop. It calls the session once per fixed tick and converts returned plain events into presentation. It no longer duplicates authoritative score/rules/respawn logic.

### Triggered moving ground

Kinematic definitions preserve `startActive` and optional `triggerX`. Runtime platforms expose `active`, `activationTick`, and local `motionTick`. Dormant platforms remain solid at their authored base pose. Activation starts local tick zero without injecting teleport velocity. Deactivation/reset returns to base.

Checkpoint snapshots are detached JSON-safe objects containing the kinematic run tick, platform IDs, active state, activation tick, and complete previous/current poses. Restore validates all fields, IDs, count, finite values, authored dimensions/surface, tick alignment, and rectangle geometry before mutation. Subsequent motion is exact.

### Collision-proxy audit

`public/debug-proxies.js` builds bounded, detached, renderer-ready snapshots of:

- enabled/disabled terrain segments and surface metadata;
- rear/front wheel and head collision circles;
- previous-to-current bike sweeps;
- hazard circles and relative sweeps;
- current/previous moving-platform rectangles and surface velocity;
- checkpoint and finish trigger lines.

The browser overlay is available with `?dev&debug=collisions` or `C`. It is development-only. The v1.5 screenshot archive contains the reviewed Lift Logic alignment frame.

### Player and repository proof paths

Normal completed play records compact RLE input with gas, brake, lean, and restart bits. Compatibility includes replay schema, level ID, build, physics, and course identity. Final verification compares finish tick and the authoritative session-state hash.

Player proofs remain in local storage. Missing, stale, damaged, oversized, or incompatible tokens produce explicit notices. Repository Gold Runs are separate read-only references, marked on cards, launched from results, labeled in-run, and only show **Gold Reference Verified** after exact playback verification.

## Repository Gold Run evidence

Manifest: `public/golden-tapes.json`

| Measure | Current result |
|---|---|
| Catalog coverage | 15 of 15 current levels |
| Route classification | `recovery` |
| Browser attempts per tape | 2 clean contexts |
| Total verified replays | 30 |
| Divergences | 0 |
| Browser page errors | 0 |
| Longest reference | Stormbreak, 4,068 replay ticks / 67.80 seconds / 12 recoveries |
| Cleanest references | 7 courses with zero recovery events |

The full course-by-course result table and regeneration policy are in `docs/qa/GOLDEN_TAPES.md`.

These are deterministic automation references, not clean-human or personal-best claims. High recovery counts on Pendulum Pass, Blast Foundry, and Stormbreak are visible quality evidence that those courses still need human pacing and safe-route review. Do not derive star targets from these tapes.

## Release gate

Run from the repository root with a Node 22-compatible toolchain and a locally installed Chrome/Chromium-family browser:

```powershell
npm install
npm test
```

The full gate runs:

```powershell
npm run test:assets
npm run test:systems
npm run test:physics
npm run test:goldens
```

Current expected coverage:

- **Asset/offline:** 3 subtests.
- **Deterministic systems:** 44 subtests—debug proxies 4, kinematics 15, ragdoll 5, replay 9, rules 5, run session 6.
- **Physics/routes:** 15 of 15 authored levels.
- **Browser Gold Runs:** 15 tapes × 2 attempts = 30 verified replays.

Focused commands:

```powershell
npm run test:rules
npm run test:replay
npm run test:kinematics
npm run test:ragdoll
npm run test:session
npm run test:debug
npm run test:goldens
```

Regenerate references only for an intentional compatibility/authoritative behavior change:

```powershell
npm run generate:goldens
npm run test:goldens
```

`package-lock.json` is tracked. Do not delete or silently regenerate it with a different dependency intent.

## Visual evidence

Latest store and QA captures live under `docs/screenshots/v1.5/`:

- `update-v15-golden-menu.png` — desktop R&D Yard with Gold badges.
- `update-v15-trigger-lift.png` — live sensor/platform presentation.
- `update-v15-collision-debug.png` — aligned proxy overlay and legend.
- `update-v15-golden-verified.png` — verified repository reference result.
- `update-v15-mobile.png` — 390 × 844 responsive Gold menu.

All five were captured from the local v1.5 browser runtime with no page errors. The prior v1.4 gallery is preserved under `docs/screenshots/v1.4/`. `docs/screenshots/README.md` is the visual index.

## Roadmap acceptance state

| Update | Status after v1.5 | Evidence | Still open |
|---|---|---|---|
| U01 Release Gate | Release candidate | 3/44/15/30 local gate, lockfile, cache audit, desktop/mobile images | Eligible deploy and production/cache/offline smoke |
| U02 Restart Contract | Partial foundation | Shared DOM-free browser/test session, 50-repeat rules restore, exact hazard/platform checkpoint state | Input-device browser matrix, remaining presentation reset audit/module splits |
| U03 Smooth Ride | Partial foundation | Pointer cancellation/focus cleanup, DPR cap, deterministic proof hash | Pools, allocation metrics, rotation evidence, measured mobile p95 |
| U04 Collision Keystone | Partial foundation | Swept platforms/hazards, proxy builder, aligned browser overlay | Force zones and general moving/closed chains |
| U05 Crash Theater | Playable preview | Deterministic finite ragdoll, static reduced-motion pose, browser rendering | Final part art and full crash/device matrix |
| U07 Engine Soul | Playable preview | Landing grades, momentum retention, five gear bands, reactive audio | Wheelie meter, tire/surface layers, measured envelopes/audio budget |
| U08 Machine Conductor | Playable preview | Deterministic hazards plus first sensor-triggered platform | General registry/trigger graph, complete telegraph art/audio, safe/fast QA |
| U09 Proof Replays | Release candidate | 15 checked-in tapes, 30 exact browser replays, explicit mismatch UI | Production smoke belongs to U01; human route classes belong to U10/U14 |
| U10 Moving Ground | Playable preview | Ten-cycle carry, bounded inheritance, trigger lift, exact restore, proxy audit | Broader/rotating geometry, dedicated framing, human safe/apex tapes |
| U14 Campaign | Playable preview | 12 original campaign routes headlessly complete and repository-proofed | Human safe/risky/touch/onboarding QA and star derivation |
| U26 Challenge Links | Partial foundation | URL-safe bounded codec and all-course verifier substrate | Fragment UX, share budget, Echo race |
| U27 Accessibility | Playable preview | Responsive touch, haptics, reduced motion, mobile capture | Remapping, left-hand/high-contrast modes, safe-area/target/device matrix |

Do not promote statuses because a primitive exists. `ROADMAP.md` acceptance gates remain authoritative.

## Known gaps and risks

- **Production:** the live URL may remain on an older build until merge/publish; do not confuse branch screenshots with production evidence.
- **Performance:** no measured low-end mobile p95, allocation counter, particle pool, or full rotation matrix yet.
- **Human calibration:** automated route completion does not prove fun, readability, touch difficulty, or fair star times.
- **Moving geometry:** platforms remain axis-aligned top-only rectangles. No arbitrary splines, rotation, two-sided closed chains, force zones, or breakable ground.
- **Competition:** no PB-only tape library, translucent ghost, splits, daily relay, URL challenge UX, or pruning.
- **Audio/feel:** wheelie balance, tire/surface loops, simultaneous-level budget, and measured landing envelopes remain open.
- **Presentation:** R&D Yard is three courses with shared procedural language, not a full world art pack.
- **Accessibility:** no remapping, left-hand layout, high-contrast mode, formal safe-area audit, or full keyboard/touch/gamepad matrix.
- **Browser controller size:** authoritative lifecycle is extracted, but `game.js` still contains input, audio, persistence, presentation effects, UI, rendering, and loop orchestration.

## Immediate next priorities

1. Push v1.5, update draft PR title/body/images, wait for the GitHub Actions gate, then inspect the final diff.
2. Promote through the eligible branch only after review; verify visible `v1.5.0`, Pages workflow, cache replacement, install, and offline reload at the canonical URL.
3. Complete keyboard, simultaneous touch/cancel, gamepad, reduced-motion, audio, pause/focus, crash-retry, Gold Run, and stale-proof browser smoke on production.
4. Start the U03 measured performance batch: particle/effect pools, allocation counters, repeatable frame capture, rotation tests, and a defined phone profile.
5. Record human safe/apex runs separately from recovery references; document lines and derive star targets from actual keyboard/touch rides.
6. Continue U04/U10 with force zones and broader moving geometry only after their reset/proxy/proof contracts are specified.
7. Extract renderer/input/audio/persistence modules from `game.js` without changing the fixed-step ordering now protected by the session and Gold Runs.

## Local QA routes

Serve the public directory:

```powershell
python -m http.server 8080 --directory public
```

Useful routes:

- `http://127.0.0.1:8080/?dev`
- `http://127.0.0.1:8080/?dev&level=13`
- `http://127.0.0.1:8080/?dev&level=14`
- `http://127.0.0.1:8080/?dev&level=14&debug=collisions`
- `http://127.0.0.1:8080/?dev&level=15&autoplay`
- `http://127.0.0.1:8080/?dev&touch`

## Handoff discipline

Every future batch must:

- update `CHANGELOG.md`, `ROADMAP.md`, this file, and the relevant release/QA page;
- change `public/version.js` and `package.json` together for a release identity change;
- bump physics/course identities intentionally when their compatibility domain changes;
- add every shipped public runtime/data file to the literal service-worker precache;
- add deterministic tests for every new mutable state, collider, trigger, reset owner, replay field, or level assumption;
- inspect golden-manifest diffs rather than regenerating through unexplained failures;
- run `npm test`, `git diff --check`, and `git status -sb` on the final worktree;
- preserve unrelated user changes;
- capture and version real browser screenshots for material presentation work;
- keep mechanics, code, art, names, layouts, and timing original rather than copying proprietary competitor material;
- state clearly whether work is a local candidate, pushed PR state, or production-verified release.

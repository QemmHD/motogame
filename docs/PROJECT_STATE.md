# Moto Rush X3 Project State

Last updated: **2026-07-13**

This is the canonical pickup note for the current worktree. Update it whenever a development batch changes the build, roadmap evidence, known risks, verification result, or next priority. Do not rely on chat history as project state.

## Release and repository coordinates

| Item | Current value |
|---|---|
| Product | Moto Rush X3 |
| Runtime release candidate | `1.4.0` from `public/version.js` |
| Package version | `1.4.0` |
| Compatibility tags | Replay schema `1`; physics `physics-3`; course generator `course-2` |
| Working branch | `agent/motorush-30-update-foundation` |
| Last committed branch state | `9a033cc` — v1.3 Stormworks foundation |
| Current v1.4 state | Uncommitted Proof & Platforms work on top of `9a033cc` at the time of this handoff update |
| Tracked upstream | `origin/agent/motorush-30-update-foundation` |
| Production URL | <https://qemmhd.github.io/motogame/> |
| Deployment branch | `gh-pages`, generated from `public/` |
| Save key | `motoRushX3.save.v1` |

`1.4.0` is a release candidate in this worktree, not a claim about production. This feature branch does not automatically publish. The candidate becomes production only after review/promotion to an eligible branch, a successful release-gate and Pages publish, and a smoke test of the canonical URL and offline update path.

`public/version.js` remains authoritative for the visible runtime version and cache identity. `package.json` is aligned for repository tooling. Replay compatibility is intentionally stricter and also includes `PHYSICS_VERSION` from `public/physics.js` and `COURSE_VERSION` from `public/levels.js`.

## Current playable build

The candidate contains **15 handcrafted levels across three menu worlds**:

- **Canyon Run, levels 1–6:** Warm-Up, Air Time, Whoops & Woes, Danger Zone, Cliffhanger, and Grand Finale.
- **Stormworks, levels 7–12:** Boostline, Pendulum Pass, Cold Circuit, Blast Foundry, Piston Works, and Stormbreak.
- **R&D Yard, levels 13–15:** Freight Flight, Lift Logic, and Proof Circuit.

R&D Yard is a focused three-course mechanics lab, not yet a six-course world pack. Freight Flight introduces horizontal freight decks above recovery ground. Lift Logic combines vertical decks with ice, bouncy terrain, and jumps. Proof Circuit is a compact mixed-system replay trial.

Progression unlocks levels sequentially and persists best time, best score, stars, settings, and one last completed replay token per level. Keyboard and Pointer Event input, simultaneous touch, checkpoint retry, full restart, pause, settings, music/SFX, haptics, reduced motion, PWA installation, and offline play are present.

## Integrated in the `1.4.0` candidate

### Deterministic restart and checkpoint contract

- `createRunState()` owns fresh per-run rules and hazard state.
- A full restart rebuilds the level, terrain, rules, platforms, bike, replay recorder/playback, score, effects, camera, and presentation state through `startLevel()`.
- Every checkpoint captures rules tick, checkpoint index, and a cloned hazard runtime snapshot.
- Checkpoint retry restores that snapshot; fuse, explosion, movement, and near-miss changes after the checkpoint do not survive.
- Kinematic platforms reset to the restored rules tick, keeping moving ground aligned with the recovered hazard timeline.
- The rules suite repeats full restart and checkpoint restoration 50 times and compares exact results.

### Last-run replay proof

- `public/replay.js` is DOM-free and defines one compact bitmask per fixed simulation tick: gas, brake, lean left, lean right, and restart. Manual crash respawns are queued on a simulation tick, recorded, and replayed; a full level restart intentionally starts a fresh proof attempt.
- Adjacent identical masks use run-length encoding. Tokens are canonical unpadded base64url JSON with hard tick, run, byte, string, and encoded-length limits.
- Metadata includes schema, level ID, build version, physics version, and course-generator version.
- Finalization records finish tick and a stable FNV-1a hash of a sorted, deterministic final-state snapshot.
- Normal completed runs persist one replay token per level. The results panel offers Replay, and course cards mark saved proofs.
- Playback supplies input by tick and verifies both finish tick and final-state hash. Playback cannot overwrite progression or records.
- Malformed, oversized, level-mismatched, or version-incompatible local tapes are rejected. The current game removes a rejected saved tape silently; player-facing incompatibility messaging is still missing.

### Solid moving ground

- `public/kinematics.js` keeps immutable authored platform definitions separate from runtime poses.
- Authored paths support static, sine, ping-pong, lift, and piston-style movement at a fixed 60 Hz tick rate.
- The collision primitive is an axis-aligned, one-way solid top with high-speed relative swept crossing.
- Wheels remain planted and inherit bounded surface velocity; upward platform launch inheritance is separately bounded.
- The complete bike can be carried for ten platform cycles in the deterministic suite.
- `Course.platform()` supplies collision dimensions, motion, surface, and presentation metadata used by both simulation and drawing.
- Current platforms are rectangular decks. Arbitrary moving terrain, rotation, triggered sequencing, general force zones, and dedicated camera behavior are not implemented.

### Crash theater and reduced motion

- `public/ragdoll.js` is a DOM-free, fixed-step, segmented bike-and-rider presentation simulation.
- It uses bounded nodes, structural/tether constraints, terrain/platform contacts, sleep detection, and a finite lifetime.
- Crash source direction seeds the presentation impulse; the camera can follow the detached pose while the authoritative run is already failed.
- Reduced motion returns a static readable crash pose and avoids ragdoll stepping. The browser client also suppresses strong hitstop, flash, shake, and camera kick.
- Tests cover 30 scripted finite/settling crashes, exact repeated simulation, and the static reduced-motion path.

### Landing, engine, and finish feedback

- `physics-3` emits perfect, clean, rough, and slam grades plus a momentum-retention value.
- Meaningful landings receive grade messaging, score treatment, particles, haptics, camera response, and impact-scaled sound.
- The procedural engine uses road speed, forward speed, throttle, grounding, and airborne load to drive pitch/filter/gain.
- Five gear bands are visible on the HUD and use shift blips while accelerating on the ground.
- The finish panel shows time, flip time reduction, score, stars, record state, proof status, and Replay/Next/Menu actions.

### Storefront and pickup presentation

- README presentation is updated for v1.4, 15 courses, honest candidate status, controls, tests, and remaining limits.
- The screenshot gallery references `docs/update-v14-menu.png`, `docs/update-v14-platforms.png`, `docs/update-v14-crash.png`, `docs/update-v14-replay.png`, and `docs/update-v14-mobile.png`.
- Before committing, verify all five gallery files exist, display the intended state, contain no debug overlays or private browser chrome, and render correctly on GitHub.

## Roadmap evidence, not completion claims

| Update | Current status | Evidence present | Acceptance still open |
|---|---|---|---|
| U01 Release Gate | Release candidate | 3 asset tests, 28 system tests, 15-level route gate, local desktop/mobile browser captures | Final deploy and production/offline smoke |
| U02 Restart Contract | Partial foundation | 50-repeat rules restart/checkpoint fixture; exact hazard/tick snapshot restore | Full browser input parity, reset-ownership audit, smaller browser modules |
| U03 Smooth Ride | Partial foundation | Canonical replay hash; Pointer Event/focus cleanup already integrated | Pools, allocation/frame metrics, rotation evidence, measured mobile p95 |
| U04 Collision Keystone | Partial foundation | Solid swept moving decks, carry and bounded inheritance tests | Force zones, moving chains, art/proxy overlay audit |
| U05 Crash Theater | Playable preview | Integrated deterministic ragdoll, 30 crash fixtures, reduced-motion pose | Final authored part art and browser crash/presentation matrix |
| U06 Finish Flow | Playable preview | Fast retry, results, records, Replay/Next/Menu | Full subsystem-reset and device-navigation matrix |
| U07 Engine Soul | Playable preview | Landing grades/retention, five gears, reactive engine and landing sound | Wheelie meter, tire/surface layers, measured envelopes/audio budget |
| U09 Proof Replays | Playable preview | Last-run RLE tape, compatibility, finish/hash verification, physics replay fixture | Golden tapes for every level, repeated browser playback, mismatch UI |
| U10 Moving Ground | Playable preview | Three levels, deterministic solid platforms, ten-cycle carry | Triggered lifts, broader shapes, camera cues, safe/apex golden tapes |
| U14 12-Level Campaign | Playable preview | Original 12 routes remain headlessly completable | Human safe/risky QA, golden tapes, star-time derivation |
| U26 Challenge Links | Partial foundation | URL-safe strict codec and compatibility result | Fragment import/export, shared race UX, under-2 KB fixture, verifier |
| U27 Mobile/Accessibility | Playable preview | Responsive touch, cancellation cleanup, haptics, reduced motion | Remapping, left-hand mode, contrast, safe-area/target and device matrix |

Do not promote these statuses merely because a foundation exists. The detailed acceptance gates in `ROADMAP.md` are authoritative.

## Known gaps and risks

- **Production status:** no v1.4 claim is valid until the live build label, a course from every world, a saved proof replay, service-worker update, and offline reload are checked on the canonical URL.
- **Browser orchestration:** `public/game.js` still owns input, audio, save data, run lifecycle, scoring, effects, menus, rendering, replay integration, and the animation loop.
- **Replay breadth:** only the last completed run is kept per level. There are no repository golden tapes, PB ghosts, splits, daily events, URL challenge import/export, tape migration, or storage pruning.
- **Replay UX:** a stale or incompatible local tape is safely removed but not explained to the player.
- **Replay snapshot scope:** proof hashes quantized authoritative bike/run/platform state, score, and elapsed data. Visual particles, random dust/exhaust, camera, audio, and ragdoll presentation are intentionally excluded.
- **Platform breadth:** current collision is axis-aligned and top-only. Platforms do not rotate, follow arbitrary splines, act as walls/ceilings, trigger from switches, or replace general moving terrain.
- **Crash presentation:** deterministic safety is tested in Node, but silhouette quality, camera framing, overlap, fast retry timing, and reduced-motion clarity need a browser matrix and human review.
- **Landing/audio tuning:** landing grade thresholds and star targets need measured human runs. There is no wheelie meter, tire/surface sound set, or simultaneous-audio clipping budget.
- **Content validation:** headless agents finish 15 levels, but may use recovery crashes and do not prove fun, route readability, fair stars, or touch difficulty. Stormbreak remains the noisiest simulated route.
- **Presentation breadth:** R&D Yard uses procedural models and shared environment language. It does not yet have the final breadth of a six-level world pack.
- **Accessibility:** reduced motion, scalable layout, keyboard, touch, volume, and haptics are present; high contrast, remapping, left-handed layout, explicit safe-area audit, and full assistive testing are not.
- **Package hygiene:** `playwright-core` supports optional capture helpers, but the repository still has no lockfile and visual harnesses are not part of authoritative CI.

## Verification commands

Run from the repository root with Node.js 22-compatible tooling:

```powershell
npm test
```

The authoritative gate runs, in order:

```powershell
npm run test:assets
npm run test:systems
npm run test:physics
```

Focused system commands are also available:

```powershell
npm run test:rules
npm run test:replay
npm run test:kinematics
npm run test:ragdoll
```

Current coverage:

- `test:assets`: **3 subtests** for complete runtime/offline validity, critical dependencies, and literal precache enforcement.
- `test:systems`: **28 subtests** — rules/restarts 5, replay 9, kinematics 9, ragdoll 5.
- `test:physics`: **15 authored levels** through terrain-only and hazard-aware completion, checkpoint restore, finite-state, speed, crash-loop, and idle-settle assertions.
- `verify:assets`: report-only form of the public asset/offline audit.

Before committing, also run:

```powershell
git diff --check
git status -sb
```

For manual QA, serve `public/` over HTTP:

```powershell
python -m http.server 8080 --directory public
```

Useful local routes:

- `http://127.0.0.1:8080/?dev` — uncached development menu and statistics.
- `http://127.0.0.1:8080/?dev&level=13` — Freight Flight.
- `http://127.0.0.1:8080/?dev&level=14` — Lift Logic.
- `http://127.0.0.1:8080/?dev&level=15` — Proof Circuit.
- `http://127.0.0.1:8080/?dev&level=15&autoplay` — development smoke input, not a quality bot.
- `http://127.0.0.1:8080/?dev&touch` — forced touch layout.

## Last known release-gate result

`npm test` passed on **2026-07-13** against the integrated v1.4 code present while this document was updated:

- assets/offline: **3 passed, 0 failed**;
- deterministic systems: **28 passed, 0 failed**;
- physics/rules route gate: **15 of 15 levels finished**, with finite state and bounded speeds.

Local browser smoke on the same candidate recorded and replayed Freight Flight to an identical finish/hash, confirmed **Proof Recorded** versus **Proof Verified**, exercised canvas tap-to-respawn, inspected R&D Yard, moving-platform gameplay, crash theater, and a 390 × 844 responsive menu, and found no warning/error console entries. The five resulting PNGs are committed under `docs/` for update evidence.

The reported smart route used recovery crashes on some courses, including 15 on Stormbreak, so this result is not evidence of balanced difficulty. Any subsequent code or public-asset edit invalidates this fresh-result statement until `npm test` is rerun. Documentation-only edits do not change the runtime result, but the final pull request should still record its own complete command output.

## Immediate next priorities

1. **Promote and prove v1.4:** review the five captured screenshots and PR diff, finish reduced-motion/audio/install/offline input smoke, merge through the eligible branch, then verify the live cache/version.
2. **Create all-course proofs:** record clean human reference runs for 15 levels, store repository golden tapes, replay each repeatedly, and derive documented star thresholds from those rides.
3. **Close restart acceptance:** audit all mutable browser presentation state, test full restart and checkpoint retry through keyboard/touch/gamepad paths, and make incompatible replay removal visible.
4. **Finish moving-ground acceptance:** add collision debug overlays, triggered lift state, camera cues, and golden safe/apex routes before claiming U10 complete.
5. **Finish bike physicality:** measure landing envelopes, add wheelie balance feedback and tire/surface audio, and test simultaneous sound levels.
6. **Reduce `game.js` coupling:** extract browser-neutral scoring/run lifecycle first, then isolate renderer, input, audio, replay persistence, and UI without changing fixed-step order.
7. **Build competition in dependency order:** PB Echoes first; challenge fragment import/export only after all-course replay stability; daily generation after course and physics versions are stable.

## Future handoff and release checklist

Every future batch must leave the repository understandable without relying on chat history:

- [ ] Update `CHANGELOG.md` with player-visible work, technical changes, fixes, verification, and remaining gaps.
- [ ] Update `ROADMAP.md` statuses using acceptance evidence. Do not mark an update complete because one primitive or one demo level exists.
- [ ] Update this document's date, branch/commit coordinates, release state, playable content, known gaps, test state, and next pickup.
- [ ] Change `public/version.js` and `package.json` together for deployed runtime changes; keep physics/course compatibility tags intentional.
- [ ] Add every new `public/` runtime file to the literal `PRECACHE` array in `public/sw.js`.
- [ ] Add deterministic regression coverage for every new rule, reset owner, collider, surface, hazard, replay field, save field, or level assumption.
- [ ] Run `npm test` and `git diff --check` from the final worktree and record fresh results in the commit or pull request.
- [ ] Smoke-test desktop keyboard, simultaneous touch and cancellation, checkpoint retry, full restart, replay, pause/focus loss, reduced motion, audio settings, and at least one level from every affected world.
- [ ] Test both `?dev` and the normal service-worker route whenever cache or runtime assets change.
- [ ] Verify README screenshots exist, are current, contain no debug/private UI, and render on GitHub.
- [ ] Keep mechanics, art, level layouts, names, and presentation original. Inspiration is not authorization to copy proprietary source, assets, or exact geometry.
- [ ] State clearly whether the branch is a candidate or has been verified on the production URL.

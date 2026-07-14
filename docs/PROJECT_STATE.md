# Moto Rush X3 Project State

Last updated: **2026-07-13**

This is the canonical pickup note for the current worktree. Update it whenever a development batch changes the build, roadmap status, known risks, or next priority.

## Release and repository coordinates

| Item | Current value |
| --- | --- |
| Product | Moto Rush X3 |
| Runtime release candidate | `1.3.0` from `public/version.js` |
| Working branch | `agent/motorush-30-update-foundation` |
| Branch start / current upstream base | `origin/claude/moto-x3m-bike-game-ipwi7p` at `d6243e6` before this uncommitted batch |
| Default repository branch | `main` (`origin/main` currently contains only the initial repository state) |
| Production URL | <https://qemmhd.github.io/motogame/> |
| Deployment branch | `gh-pages`, generated from `public/` |
| Save key | `motoRushX3.save.v1` |

`1.3.0` is a release candidate in this worktree, not a statement about the production URL. The current feature branch is not one of the automatic publish branches. Production changes only after this work is promoted to an eligible branch and the release-gate/publish workflow succeeds. Verify the live build label after deployment before marking `1.3.0` as production.

The npm package metadata and `public/version.js` both identify this candidate as `1.3.0`. `public/version.js` remains the authoritative runtime/cache source; package metadata is kept aligned for repository clarity.

## Current playable build

The release candidate contains 12 handcrafted levels split across two menu worlds:

- **Canyon Run, levels 1-6:** Warm-Up, Air Time, Whoops & Woes, Danger Zone, Cliffhanger, and Grand Finale.
- **Stormworks, levels 7-12:** Boostline, Pendulum Pass, Cold Circuit, Blast Foundry, Piston Works, and Stormbreak.

Progression unlocks levels sequentially and persists best time, score, stars, and settings locally. The client supports keyboard, pointer/multitouch, and gamepad-style input polling; checkpoint respawn, retry, pause, settings, audio, haptics, reduced motion, PWA installation, and offline play are present.

## Shipped in the `1.3.0` release candidate

These systems are implemented in the worktree and covered at least by automated regression checks or direct browser inspection:

- Shared build metadata and cache invalidation in `public/version.js`.
- Atomic offline coverage verification for the full public runtime and its local references.
- A test-before-publish GitHub Pages workflow with read-only tests and publish-only write permission.
- A deterministic, DOM-free rules module with per-run hazard state.
- Tick-derived moving saws, pendulums, and piston/crusher hazards.
- Swept relative hazard collision to reduce fast-moving tunnelling.
- TNT trigger/fuse logic with a lethal core and non-lethal outer launch impulse.
- Checkpoint, finish, near-miss, explosion, and impulse event outputs.
- Terrain contact metadata, runtime segment enable masks, degenerate-segment filtering, and allocation-light bucket deduplication.
- One-way terrain with shallow underside recovery.
- Dirt, ice, boost, and bouncy surface physics plus distinct rendered surface bands.
- Separate horizontal and fall-speed safety limits, pre-depenetration landing impact capture, and stable bike center metrics.
- Six new Stormworks courses, bringing the campaign to 12 levels.
- Two-world menu paging and procedural presentation for the new machinery and TNT hazards.
- Pointer-event multitouch with cancellation handling, focus-loss input clearing, and automatic pause on page hide.
- Development launch flags for targeted and automated smoke tests.

## Partial systems and known gaps

Treat the following as incomplete, even though foundations or previews exist:

- **Release status:** `1.3.0` has not been proven live until promotion, workflow success, and a production smoke test.
- **Rules extraction:** course rules are separated, but `public/game.js` still combines input, audio, save data, run state, scoring, rendering, UI, and effects in one large module.
- **Collision breadth:** moving hazards are swept radius hazards, not solid kinematic platforms. Crushers do not yet carry the bike, and there are no elevators, lifts, moving terrain, or general force-zone primitives.
- **Breakables:** terrain segments can be enabled or disabled, but no player-facing fragile-ground system consumes that capability yet.
- **Surface breadth:** ice, boost, and bouncy surfaces are implemented; mud, water, wind, currents, and richer per-surface audio/VFX are not.
- **Crash presentation:** crashes use the current bike state and effects; there is no segmented rider ragdoll or authored crash theater.
- **Competition:** there are no run tapes, ghosts, daily runs, shareable challenge links, or deterministic input replay files.
- **Progression depth:** sequential unlocks, stars, best times, and best scores exist; garage cosmetics, records/badges, optional contracts, and collectibles do not.
- **Content validation:** automated agents can finish all 12 routes, but the new star thresholds and hazard rhythms still need multiple human keyboard and touch runs. The test allows recovery crashes and is not a quality or difficulty rating.
- **Presentation breadth:** Stormworks hazards and surfaces have clear procedural visuals, but the world still shares much of the existing environment art. Store-ready screenshots should be refreshed after final presentation tuning.
- **Accessibility:** reduced motion, volume controls, haptics toggle, scalable layout, keyboard, and touch are present. Dedicated contrast options, remapping, left-handed layouts, and a complete accessibility audit are not.
- **Browser gate:** the authoritative automated tests are Node-based. Visual, audio, touch, install, and service-worker behavior still require browser smoke testing.
- **Package hygiene:** browser capture helpers depend on `playwright-core`, but those optional visual harnesses are not part of the authoritative CI test path and the repository does not yet contain a lockfile.

## Verification commands

Run from the repository root with Node.js 22-compatible tooling.

```powershell
npm test
```

That command is the authoritative local release gate and runs, in order:

```powershell
npm run test:assets
npm run test:rules
npm run test:physics
```

Individual purposes:

- `npm run test:assets` validates runtime JavaScript/JSON, build metadata, every local reference, and complete literal precache coverage.
- `npm run test:rules` checks deterministic motion without level mutation, one-way contact recovery, the terrain enable mask, surface metadata, and TNT fuse/impulse behavior.
- `npm run test:physics` asserts at least 12 levels, terrain-only full-throttle completion, smart rules/hazard completion, finite simulation state, speed bounds, crash-loop bounds, and stable idle settling.
- `npm run verify:assets` prints the asset/offline verification report without the Node test wrapper.

Before committing, also run:

```powershell
git diff --check
git status -sb
```

For a manual smoke test, serve `public/` over HTTP rather than opening `index.html` directly:

```powershell
python -m http.server 8080 --directory public
```

Useful local routes:

- `http://127.0.0.1:8080/?dev` - disables service-worker registration and shows development stats.
- `http://127.0.0.1:8080/?dev&level=8` - launches a specific one-based level directly.
- `http://127.0.0.1:8080/?dev&level=8&autoplay` - launches the simple development driver.
- `http://127.0.0.1:8080/?dev&touch` - forces touch controls for layout inspection.

The development autoplay is a smoke aid, not a gameplay bot or quality benchmark.

## Last known release-gate result

The full `npm test` suite passed during this development batch after the core physics, rules, content, and offline changes. Subsequent code or asset edits must invalidate that statement until the suite is run again. The physics gate's last reported smart-route recovery counts remained below its limit for every level, with no non-finite state and all 12 finishes reached.

Do not copy old console output into a new handoff as proof. Record the command and fresh result in the commit or pull request after the final worktree state is tested.

## Immediate next priorities

1. **Close the `1.3.0` release candidate:** rerun the full gate on the final diff, complete desktop and touch smoke tests, confirm normal service-worker update behavior, and publish through the reviewed branch workflow.
2. **Prove production:** open the canonical Pages URL after deployment, confirm the menu says `v1.3.0`, launch one Canyon Run and one Stormworks level, and verify a reload can start offline from the new cache.
3. **Finish the restart contract:** stress retry and checkpoint respawn across all hazard types, especially active TNT and movers; specify whether hazard cycles reset or continue on checkpoint respawn and test that choice.
4. **Reduce `game.js` coupling:** extract browser-neutral scoring/run-state helpers first, then isolate renderer/audio/input modules without changing the fixed-step order.
5. **Add run tapes:** record fixed-tick input plus required version/course identity before building ghosts, daily runs, or challenge links.
6. **Human-calibrate the 12-level campaign:** collect clean and recovery runs on keyboard and touch, adjust star thresholds and hazard phases, and document a golden completion time for each route.
7. **Continue the roadmap in dependency order:** solid kinematic/moving-ground primitives before breakables and reactive props; richer progression and sharing only after deterministic run tapes are stable.

## Future handoff and release checklist

Every future development batch must leave the repository understandable without relying on chat history. Before pushing or handing off:

- [ ] Update `CHANGELOG.md` with player-visible changes, technical changes, fixes, and the exact verification performed.
- [ ] Update `ROADMAP.md` status markers: shipped, partial/preview, next, or planned. Do not mark a roadmap update complete because only one underlying primitive exists.
- [ ] Update this `docs/PROJECT_STATE.md` date, branch/base, release status, shipped/partial systems, known gaps, test state, and immediate priorities.
- [ ] Confirm `public/version.js`. Bump it for every deployed runtime or offline-content change so existing installations receive a new cache; do not add a second runtime version literal elsewhere.
- [ ] Add every new `public/` runtime file to the literal `PRECACHE` array in `public/sw.js`.
- [ ] Add or update deterministic unit/regression coverage for each changed mechanic and level assumption.
- [ ] Run `npm test` from the final worktree and record the fresh result. Also run `git diff --check`.
- [ ] Smoke-test desktop keyboard, touch/multitouch cancellation, checkpoint respawn, retry, pause/focus loss, audio settings, and at least one level from each affected world.
- [ ] Test both `?dev` (uncached) and the normal service-worker route when cache or asset behavior changes.
- [ ] Refresh README/store screenshots when the visible menu, world art, bike, hazards, or major effects change.
- [ ] Keep new mechanics, art, level layouts, names, and presentation original. Inspiration is not authorization to copy proprietary source, assets, or exact course geometry.
- [ ] In the commit or pull request, state whether the branch is only a release candidate or has been verified on the production URL.

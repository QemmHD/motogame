# Moto Rush X3 — 30-Update Production Roadmap

Updated: 2026-07-13

This is the canonical production plan. Every update has a player-facing promise, a bounded engineering/content scope, dependencies, and a release gate. Future pull requests must update this file when scope or status changes.

## Product direction

Moto Rush X3 will become an original trail-racing anthology built around five ideas:

1. **Momentum Machines** — hazards, lifts, charges, gates, and terrain form readable connected mechanisms that skilled riders can use for speed.
2. **Three-Lane Trails** — major set pieces aim to provide a forgiving route, a faster stunt line, and a discoverable Rush Route.
3. **Bike-and-Rider Physicality** — suspension, tire contact, posture, engine load, landing quality, and crashes make the machine feel tangible.
4. **Echo Competition** — personal-best ghosts, replay proofs, daily relays, and challenge links work without accounts or a game server.
5. **Original Trail Anthology** — Canyon Run, Frostline Relay, Sunspill Coast, and Stormworks Foundry each receive their own machinery, color story, silhouettes, props, and music.

The game may learn from broad genre conventions, but no update may decompile a competitor or copy proprietary code, art, audio, UI layouts, exact tracks, or timing data. All implementation and content must be original.

## Status legend

- **RELEASE CANDIDATE** — implemented and verified on the current v1.3 branch; not claimed live until merged and deployed.
- **PARTIAL FOUNDATION** — part of the future update shipped early because later content depends on it.
- **PLAYABLE PREVIEW** — a smaller version is playable, but the full acceptance gate is not complete.
- **PLANNED** — scoped but not yet started.

## Phase I — Make the foundation trustworthy

### U01 / v1.3 — Release Gate

**Status:** RELEASE CANDIDATE

**Player promise:** Fresh builds load correctly, work offline, keep their art and audio, and do not deploy when core behavior is broken.

**Ships:** One authoritative version/cache source; a real npm test command; asset-reference and service-worker precache auditing; finite-physics, route, hazard, and idle tests; nonzero failures; test-gated GitHub Pages publishing; visible build label.

**Gate:** All 12 terrain routes and 12 hazard-aware routes complete headlessly; no NaN or runaway speed; every public runtime file is cached; invalid JavaScript/JSON and broken local references fail CI; production version and cache version match.

### U02 / v1.4 — Rules Core and Restart Contract

**Status:** PARTIAL FOUNDATION

**Player promise:** Checkpoints, finishes, crashes, and restarts behave the same every time, regardless of input device.

**Ships:** Complete DOM-free run rules; explicit start, checkpoint, crash, respawn, restart, and finish transitions; reset ownership for every hazard, particle, audio, and score state; visible keyboard/touch restart affordance; smaller game-loop modules.

**Dependencies:** U01.

**Gate:** Restarting 50 times produces identical initial state; rules fixtures match browser behavior; keyboard, touch, and gamepad restart smoke tests pass; no previous-run hazard state survives.

### U03 / v1.5 — Smooth Ride Pass

**Status:** PARTIAL FOUNDATION

**Player promise:** No stuck throttle after interruptions, fewer frame hitches, and crisp play on normal phones.

**Ships:** Pointer-event controls with cancellation and focus-loss cleanup; hot-path allocation removal; particle pools; cached visual resources; bounded device-pixel ratio; deterministic math audit; performance overlay and repeatable tick hash.

**Dependencies:** U01–U02.

**Gate:** A fixed run produces the same tick hash; controls clear after pointer cancel, window blur, visibility loss, and rotation; hot-path object counts stay bounded; agreed mobile profile reaches p95 frame time below 16.7 ms.

### U04 / v1.6 — Collision Keystone

**Status:** PARTIAL FOUNDATION

**Player promise:** Fast wheels stop tunneling, underside contacts recover cleanly, moving objects can carry the bike, and surfaces feel distinct.

**Ships:** Contact metadata and segment enable masks; one-way/open terrain rules; degenerate filtering; repeat contact pass; surface velocity; kinematic collider hooks; force zones; public impulse API; swept bike/hazard collision; aligned debug proxies.

**Dependencies:** U01–U03.

**Gate:** Fast-mover fixtures cannot tunnel; dormant features leave baseline runs unchanged; one-way terrain does not trap the bike; inherited platform speed is bounded; debug contacts align with rendered geometry.

## Phase II — Make every run satisfying

### U05 / v1.7 — Crash Theater

**Status:** PLANNED

**Player promise:** Crashes become spectacular, readable, and quick instead of feeling like an abrupt state change.

**Ships:** Original segmented rider atlas; rider ejection; detached tumbling bike; terrain-contact ragdoll; camera handoff; short impact beat; reduced-motion alternative.

**Dependencies:** U02, U04.

**Gate:** Crash bodies never alter authoritative run state; 30 scripted crash types remain finite and settle on terrain; reduced motion removes zoom and slow motion while preserving clear feedback.

### U06 / v1.8 — Fast Failure, Great Finish

**Status:** PLANNED

**Player promise:** Retry is nearly instant and a successful finish clearly celebrates time, stars, flips, and personal bests.

**Ships:** Tuned crash-to-retry cadence; immediate restart option; landing/flip notification; itemized results; star ceremony; PB comparison; Next, Replay, and Menu flows.

**Dependencies:** U05.

**Gate:** Every mutable subsystem resets; finish arithmetic is exact; Next cannot select locked or missing content; keyboard, touch, and gamepad can retry and advance.

### U07 / v1.9 — Landing Grade and Engine Soul

**Status:** PLANNED

**Player promise:** Clean landings preserve speed, rough ones scrub it visibly, wheelies communicate balance, and engine sound reacts to load.

**Ships:** Landing quality grades; suspension/tire compression cues; momentum scrub and preservation bands; wheelie balance meter; RPM/load model; gears, free rev, limiter, tire and landing audio layers.

**Dependencies:** U01–U06.

**Gate:** Physics version is bumped; jump, braking, and landing envelopes are measured; old untagged terrain remains completable; maximum simultaneous audio does not clip.

### U08 / v2.0 — Machine Conductor

**Status:** PLAYABLE PREVIEW

**Player promise:** Patrol cutters, pendulums, piston crushers, and timed machinery turn each trail into a readable moving puzzle.

**Ships:** Hazard registry shared by simulation and drawing; deterministic tick-based transforms; warning lights, cables, guide rails, shadows, and sounds; triggered sequences; safe and fast solutions.

**Dependencies:** U04, U07.

**Gate:** Identical ticks produce identical poses; maximum-speed swept kills pass; every machine telegraphs its danger; level definitions remain immutable.

### U09 / v2.1 — Run Tapes and Proof Replays

**Status:** PLANNED

**Player promise:** Replay the last run and trust that reference times came from a real, reproducible ride.

**Ships:** Compact per-tick input recording; restart events; Replay Last Run; deterministic run hashes; physics/generator version tags; golden developer tapes and verifier.

**Dependencies:** U02, U07–U08.

**Gate:** Replaying every tape repeatedly yields the same finish tick and hash; incompatible versions fail with a clear message; every campaign course has a passing tape.

## Phase III — Build the machine sandbox

### U10 / v2.2 — Moving Ground

**Status:** PLANNED

**Player promise:** Lifts, freight platforms, oscillating ledges, and apex-launch shortcuts make the ground itself part of the stunt.

**Ships:** Kinematic platforms with surface velocity; support-frame models and collision proxies; rider carry behavior; elevators and triggered lifts; platform-specific camera cues.

**Dependencies:** U04, U08–U09.

**Gate:** An idle rider stays stable for ten platform cycles; inherited velocity is clamped; safe and apex routes both have golden tapes.

### U11 / v2.3 — Nitro Chain Reactions

**Status:** PLAYABLE PREVIEW

**Player promise:** Nitro crates can destroy a run at their core or launch the bike from a carefully timed pressure wave.

**Ships:** Trigger/fuse states; linked charges; core lethality; outer impulse ring; blast visuals, sound, camera pulse, and chain timing puzzles.

**Dependencies:** U04, U08–U09.

**Gate:** A proof segment requires the intended blast; fuse order is deterministic; restart restores every charge; launch arcs stay within documented limits.

### U12 / v2.4 — Fragile Ground

**Status:** PLANNED

**Player promise:** Planks crack, ramps buckle, and timed bridges fall away behind the bike.

**Ships:** Contact-triggered damage state; crack animation; delayed segment disable; render-only debris; reset-safe breakable groups; chase-ramp patterns.

**Dependencies:** U04, U09.

**Gate:** Disabled segments are ignored by wheels, frame, rider, and probes; telegraph delay is consistent; repeated restarts restore all geometry.

### U13 / v2.5 — Reactive Props

**Status:** PLANNED

**Player promise:** Boulders, seesaws, rolling drums, and floating props become physical tools instead of decoration.

**Ships:** Bounded dynamic bodies; mass classes; wheel/body impulses; stable seesaw constraints; rolling and push interactions; matching art/collision silhouettes.

**Dependencies:** U04, U09, U12.

**Gate:** Long contacts do not create energy; props do not tunnel; mass tests pass; debug proxies match each visible model.

### U14 / v2.6 — Canyon Relay, 12-Level Campaign

**Status:** PLAYABLE PREVIEW

**Player promise:** A complete first campaign teaches the bike gently, then combines movers, Nitro, crushers, surfaces, and a multi-system finale.

**Ships:** Rebuilt tutorial arc for L1–L6; promoted and retuned Stormworks trials for L7–L12; checkpoint-before-trap rule; forgiving safe paths; stunt routes; recorded star targets; full content QA.

**Dependencies:** U08–U13.

**Gate:** Twelve golden tapes; safe and risky routes manually verified; checkpoints precede lethal tests; three-star times derive from recorded rides; onboarding assumes no genre knowledge.

### U15 / v2.7 — Closed-Course Geometry

**Status:** PLANNED

**Player promise:** Loops and enclosed track sections add speed commitments without trapping the bike.

**Ships:** Two-sided closed chains; loop and tube authoring helpers; inside/outside contact selection; closed-track rendering; speed-band teaching trial.

**Dependencies:** U04, U09, U14.

**Gate:** Loops succeed and fail within measured speed bands; contacts cannot pin the rider; closed chains render without fill artifacts; legacy screenshot checks pass.

### U16 / v2.8 — Surface Language

**Status:** PLAYABLE PREVIEW

**Player promise:** Riders can read ice, mud, traction mesh, boost rail, and bouncy membrane before their wheels touch them.

**Ships:** Full surface registry; ice, mud, grip mesh, boost, and membrane tuning; distinct shapes/colors; tire sounds and particles; transition blending.

**Dependencies:** U04, U09, U15.

**Gate:** Untagged terrain behavior is unchanged; braking, restitution, and boost probes meet documented bands; transitions produce no one-frame impulse spikes.

### U17 / v2.9 — Water and Force Fields

**Status:** PLANNED

**Player promise:** Skim water at speed, sink after a failed approach, ride geysers, and fight wind or current.

**Ships:** Water volumes; drag, lift, skim, and drown states; geysers; wind tunnels; directional force zones; current cues; final planned physics-version change.

**Dependencies:** U04, U09, U16.

**Gate:** Forces run inside substeps; skim/drown thresholds reproduce; all earlier tapes pass or receive intentional migrations; physics version is then locked.

## Phase IV — Turn courses into a world

### U18 / v3.0 — Relay World Map

**Status:** PLANNED

**Player promise:** A transit-board-style map connects worlds, makes progress readable, and always points to the next ride.

**Ships:** Original world map; campaign nodes; world totals; focus memory; completion-based unlocks; corrupted-save merge; v1 save migration.

**Dependencies:** U14.

**Gate:** Completion—not star count—unlocks the next level; old saves migrate without data loss; keyboard, touch, and gamepad navigation pass.

### U19 / v3.1 — Frostline Relay, L13–L18

**Status:** PLANNED

**Player promise:** Six winter-machine courses mix radio towers, winches, snow bridges, crosswinds, ice, and falling icicles.

**Ships:** Six original levels; winter background/color script; tower, winch, bridge, snow, and ice models; collision proxies; particles; music stem; loop finale.

**Dependencies:** U15–U18.

**Gate:** Six golden tapes; no mandatory stopping zone is pure ice; every proxy matches art; pack stays inside frame and asset budgets.

### U20 / v3.2 — Sunspill Coast, L19–L24

**Status:** PLANNED

**Player promise:** Six coastal-machine courses use tide gates, drain tubes, buoy bridges, geysers, waterwheels, and a rolling chase.

**Ships:** Six original levels; coastal background and prop set; tube/water geometry; buoy and waterwheel interactions; geyser lines; boulder/Nitro finale.

**Dependencies:** U15–U18.

**Gate:** Six golden tapes; tubes cannot softlock; every water gap has a recoverable safe route or preceding checkpoint; finale pacing passes a full-run reference.

### U21 / v3.3 — Boltworks Garage

**Status:** PLANNED

**Player promise:** Earn six original bike/rider looks without changing performance or spending stars.

**Ships:** Cosmetic garage; preview animation; permanent total-star unlock thresholds; equipped-set persistence; default fallback; shared physics pins for every model.

**Dependencies:** U18–U20.

**Gate:** Axle and rider pin checks pass for every set; cosmetics do not alter replay hashes; missing assets fall back to the default bike.

### U22 / v3.4 — Rider Records

**Status:** PLANNED

**Player promise:** Long-term distance, air, flips, crashes, clean finishes, and 30 badges make every run contribute.

**Ships:** Lifetime stats; badge predicates; milestone toasts; records screen; migration-safe counters; replay/ghost exclusion.

**Dependencies:** U21.

**Gate:** Predicate unit tests pass; each event awards once; migration fixtures preserve progress; simulations cannot double-count stats.

### U23 / v3.5 — Trail Contracts and Signal Tags

**Status:** PLANNED

**Player promise:** Optional objectives and one hidden Signal Tag per course reward mastery without blocking the campaign.

**Ships:** Three authored contracts per level; route, time, clean-run, landing, and stunt conditions; discoverable tags; results progress; proof tapes.

**Dependencies:** U09, U14, U22.

**Gate:** Every objective and tag has a proof; restart/replay cannot grant false completion; campaign unlocks remain independent.

## Phase V — Compete without a backend

### U24 / v3.6 — PB Echoes

**Status:** PLANNED

**Player promise:** Race a translucent personal-best rider and see checkpoint gains or losses immediately.

**Ships:** PB tape library; deterministic ghost simulation; checkpoint split popups; visibility control; storage cap and pruning; mismatch messaging.

**Dependencies:** U09.

**Gate:** Ghost and authoritative replay converge at every checkpoint; physics mismatch hides the ghost safely; pruning preserves best records.

### U25 / v3.7 — Daily Relay Run

**Status:** PLANNED

**Player promise:** One date-seeded challenge offers a fresh offline-compatible route each day.

**Ships:** UTC seed; curated segment generator; safety envelopes; deterministic fallback; practice mode; streak and local history.

**Dependencies:** U09, U14–U20.

**Gate:** The next 60 dates validate in CI; the same date/version gives the same course; invalid generation falls back deterministically; first-loaded challenges work offline.

### U26 / v3.8 — Challenge Links

**Status:** PLANNED

**Player promise:** Share a compact run link and let a friend race its verified Echo.

**Ships:** Compressed input proof in the URL fragment; safe decoder; version tags; replay-derived finish time; Race This Echo flow.

**Dependencies:** U09, U24–U25.

**Gate:** Malformed or oversized input is rejected; a typical link stays under 2 KB; version mismatch is explicit; decoded runs pass the standard verifier.

## Phase VI — Ship the definitive edition

### U27 / v3.9 — Mobile and Accessibility Pass

**Status:** PLANNED

**Player promise:** Comfortable controls and readable hazards across small phones, tablets, desktop, reduced motion, and high contrast.

**Ships:** Safe-area layout; minimum 44 px targets; optional two-half controls; rotation guidance; remappable keys; reduced motion; high-contrast hazard mode; separate audio sliders; optional haptics.

**Dependencies:** U03, U06.

**Gate:** Layout matrix from 320×568 through tablet passes; all focus-loss paths release controls; contrast/reduced-motion audit passes; touch, keyboard, and gamepad smoke tests pass.

### U28 / v4.0 — Fast Boot and Distribution

**Status:** PLANNED

**Player promise:** Branded instant paint, honest loading progress, reliable installs, and quick offline relaunch.

**Ships:** Initial-load budget; lazy music; optimized textures; atlas for static props; loading progress; install guidance; social cards; Pages, itch, and portal-ready packages.

**Dependencies:** U01, U27.

**Gate:** Initial payload stays below the agreed 2 MB target; interactive in under five seconds on the test 4G profile; second launch works offline; packaged content matches Pages.

### U29 / v4.1 — Stormworks Foundry, L25–L30

**Status:** PLANNED

**Player promise:** Six late-game courses combine conveyor machinery, cranes, furnaces, pressure systems, electrical gates, exhaust wind, and reactive drums.

**Ships:** Six original courses; Foundry art/audio pack; connected-machine Rush Routes; frozen-system compositions only; campaign finale with safe, stunt, and machine-manipulation lines.

**Dependencies:** U08–U20, U28.

**Gate:** Six golden tapes and all 30 campaign tapes pass; no physics-version bump; every prop has art/proxy overlay QA; finale routes are manually verified.

### U30 / v4.2 — Trail Forge

**Status:** PLANNED

**Player promise:** Build, test, save, and share original courses from a constrained set of trusted parts.

**Ships:** Validated primitive palette; snapping; undo/redo; local saves; test ride; completion proof; compact share fragments; repository-curated packs.

**Dependencies:** U09, U26, U29.

**Gate:** Shared data cannot execute code; strict size/range validation; export requires a passing completion tape; mobile editing passes; curated-pack lint rejects missing IDs, assets, or proofs.

## Immediate execution queue

After the v1.3 release candidate is reviewed and merged:

1. Finish U02 by extracting remaining run-state/UI ownership and adding the 50-restart test.
2. Finish U03 with pools, frame instrumentation, a recorded mobile budget, and canonical tick hashes.
3. Finish U04 with kinematic platforms, surface velocity, force zones, and collision debug overlays.
4. Produce U05 original rider-part concepts and collision silhouettes while engineering closes U02–U04.
5. Record human reference runs for all 12 current courses and recalibrate star times before calling U14 complete.

## Update discipline

Every shipped update must:

1. Change public/version.js and package.json together when the release number changes.
2. Add an exact entry to CHANGELOG.md.
3. Refresh docs/PROJECT_STATE.md with the current branch, completed work, gaps, checks, and next pickup.
4. Change statuses or acceptance gates here when reality changes.
5. Add or update tests for any new rule, collision type, surface, hazard, or save field.
6. Run npm test and record the result in the pull request.
7. Add store screenshots when the player-facing presentation changes materially.

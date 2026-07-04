# 🏍️ Moto Rush X3 — Roadmap v2: The 20-Update Plan

> The complete plan for taking Moto Rush X3 (v1.2: 6 levels, real suspension, parts-rig dirt bike, GitHub Pages auto-deploy) to full **Moto X3M parity and beyond** — 24+ levels, the entire hazard verb catalog, ragdoll crashes, themed worlds, a star-currency garage, and a zero-server competition stack.
>
> Built from a fresh multi-agent research pass (2026-07-04): an exhaustive Moto X3M feature catalog, a genre survey (Trials, Hill Climb Racing, Mad Skills Motocross, Bike Race, Happy Wheels, Gravity Defied, Pumped BMX), a line-by-line audit of this codebase, the 2026 web-game quality bar, and trials-genre level-design theory — then hardened by two adversarial reviews (authenticity + feasibility).
>
> **Supersedes** the previous 6-patch roadmap (preserved in git history). Key re-scope: **everything here ships on GitHub Pages static hosting** — no backend, no paid services. The one feature that genuinely wants a server (global leaderboards) is deliberately replaced by *self-verifying share codes* and parked in the backlog.

---

## The Ten Laws (what the research says makes X3M work)

These are non-negotiable design rules every update below obeys:

1. **Time is the only score.** Every flip deducts 0.5s from the clock; risk is directly monetized into stars. The `-0.5s` popup at the landing moment is the game's self-teaching mechanism.
2. **Hazards double as tools.** TNT kills you *and* is the intended propulsion across gaps. The cleverest recurring trick in the series — never make a hazard that is only a wall.
3. **Levels unlock strictly sequentially.** No star-gating of levels — stars gate **bikes** (the garage), never progress.
4. **Losing is fun.** The comedic ragdoll crash is retention machinery, not polish. Crash → laugh → R → instantly riding again in under a second.
5. **Teach-test-twist.** One new verb per level: safe intro → lethal test → remix with a known verb. First levels are near-failproof tutorials.
6. **Checkpoint before every trap**, with 1.5–2s of acceleration runway after it.
7. **Two-line rule.** Every set-piece has a fast risky line and a slow safe line; the harness AI must be able to take the safe line.
8. **Physics-lock windows.** Physics-affecting changes land in declared windows and bump `PHYSICS_VERSION`; content packs are authored only on frozen physics; tapes/ghosts invalidate cleanly across versions.
9. **The completability gate is sacred.** Every level ships with a golden dev tape; CI replays every tape and blocks deploys on any failure. No player ever sees an uncompletable level.
10. **GitHub only.** Static-hostable or it doesn't ship. Higgsfield is used to *generate* art/audio which is committed to the repo; deploys go only to GitHub Pages via the auto-publish Action.

---

## Gap analysis — where we stand vs. the original (July 2026)

| Category | HAVE (v1.2) | MISSING (this roadmap) |
|---|---|---|
| **Physics/feel** | Deterministic 60Hz 3-node Verlet/PBD, flips + time rebate, contact-driven suspension, reverse driving, x-bucket broadphase | Dynamic colliders w/ velocity inheritance, explosion impulses, surface modifiers (ice/boost/bouncy), water, loops, speedrun tech (fake flips, wheelie boost, rear-wheel landing boost) |
| **Crash** | Head-contact crash, auto-respawn, hitstop+flash | **Ragdoll rider ejection**, camera-chases-body, crash slow-mo beat, R instant restart |
| **Gimmicks** | Static saws/spikes/barrels, gaps, ramps, whoops | **The entire X3M motion catalog**: moving platforms, pendulum maces, crushers, TNT launchers, exploding ramps, breakable bridges, timed platforms, loops, rolling boulders, seesaws, elevators, icicles, water, slide tubes |
| **Content** | 6 levels, 1 theme | 18+ more levels across 3+ themed worlds (X3M ships 22–25/title) |
| **Progression** | Sequential unlock, 3-star times, best times | **Star-currency garage** (bikes), achievements, lifetime stats, per-level challenges, collectibles |
| **UI/UX** | Menu grid, pause, settings, finish screen | World map, **animated results card** (star stamps, one-tap Next), `-0.5s` flip popup, garage screen, R-restart affordance |
| **Juice** | Hitstop, slow-mo, shake, 6 particle types, music crossfade, ducking | Ragdoll spectacle, saw-proximity audio telegraphing, engine RPM/gear model, splinter/splash particles, finish ceremony |
| **Mobile** | 4-button multi-touch, gamepad, PWA | Safe-area insets, Pointer Events (`pointercancel` = stuck throttle today), hold-halves control scheme, rotate overlay |
| **Perf** | Fixed-step loop, broadphase | Zero-alloc hot path (`new Set()` per contact ≈2,160/s), particle pooling, cached gradients, asset budget (5.1MB → <2MB) |
| **Retention** | Local bests | Input tapes, **PB ghost racing**, date-seeded daily + share text, self-verifying share-run URLs, achievements |
| **Infra/CI** | Auto-deploy on push, headless harness exists | **Harness not wired into CI** (a NaN could ship to prod today), SW precache missing `bike_body.png` (live bug), stale cache key, no `PHYSICS_VERSION` |

---

# The 20 Updates

## ARC 1 — Trust the pipeline (v1.3 – v1.6)
*Nothing new for players yet — these four make the next sixteen updates safe to ship fast. The audit found live bugs (a physics NaN would deploy straight to prod; installed PWAs are missing the bike sprite offline and can be stuck on stale code forever). Fix the foundation first.*

### v1.3 — The Sacred Gate: CI completability + deploy & versioning hygiene
- **Goal:** every push is automatically blocked from deploying if any level becomes uncompletable, physics NaNs, or a probe regresses — and installed/offline players always receive correct, fresh code.
- **Work:** assertions + exit codes in `tools/test-physics.mjs` / `loopprobe.mjs` (finished per level, no NaN, crash budget pinned to observed baselines — no retries: the sim is deterministic, a failure fails every time); `test` job in `pages.yml` gating the publish job via `needs:`; **replace the `git subtree split` publish with an orphan-commit publish of `public/`** (required so CI-time build stamping actually reaches production); add `bike_body.png` + `logic.js` to the SW precache; derive the SW cache key from a single checked-in `version.js` shared with `game.js`; export `PHYSICS_VERSION` and `GENERATOR_VERSION` constants; CI check that the SW precache covers every referenced asset.
- **Risk:** a bad cache-key derivation serves stale content → manual SW update test documented in the workflow.

### v1.4 — Headless truth: `rules.js` + monolith split
- **Goal:** the harness dies to saws like a real player, so hazard-heavy levels can be CI-trusted; the codebase stays reviewable for the next 16 patches.
- **Work:** extract hazard kill-scan, checkpoint/finish detection, respawn placement, and flip time-bonus from `game.js` into DOM-free `public/rules.js` (same style as `physics.js`); harness consumes the *real* rules; split the ~930-line `game.js` into `audio.js` / `input.js` / `render.js` / `hud.js` + orchestrator; reconcile the two overlapping suspension systems (keep the physics-driven `BODY.sag/dip` path, delete the vestigial whole-bike `G.susp` spring); mark stale `FEEL_SPEC.md` claims historical.
- **Risk:** behavioral drift during extraction → pure-move discipline, before/after harness runs on all 6 levels.

### v1.5 — Hot path + numeric determinism pass
- **Goal:** steady 60fps on a mid-range Android, no GC hitches, and a sim that produces *identical* tick-by-tick results — the property every replay feature stands on.
- **Work:** remove `contact()`'s per-call `new Set()` (frame-stamped seen-array); pool particles/popups (free-lists, swap-remove); cache sky/terrain gradients on offscreen canvases; clamp DPR to 2; **canonicalize `Math.hypot` → `sqrt(x*x+y*y)`** across `physics.js` (hypot precision is implementation-defined; sqrt is IEEE-exact) and set the sin/cos policy for the sim; add a **tick-hash fixture** (hash of bike state per tick on a fixed run) to CI — any diff is a regression; fix the mobile `pointercancel` stuck-throttle bug (incoming call = throttle stuck today) since it's zero-sim-risk input correctness.
- **Risk:** the Set removal + hypot swap touch the determinism-critical path → land while the level set is small; tick-hash before/after; retune the `levels.js` jump envelope if any measured arc changes.

### v1.6 — Contact API + dynamics substrate (the engine keystone)
- **Goal:** one determinism-verified engine patch containing *every* collision-core change the whole gimmick catalog needs — so later updates plug in without touching `physics.js` again.
- **Work:** `contact()` returns `{pen, nx, ny, segIdx}` (callers learn *which* segment they hit — prerequisite for surfaces, breakables, per-segment behavior); per-segment `enabled` mask honored by contact/touch-probe/headCrash (breakables); a **kinematic collider list stepped per-substep** (not per-tick — the bike substeps 6×/tick, a tick-frozen platform teleports 6 substeps of penetration) with surface-velocity inheritance; an in-substep force-zone hook (water/wind/geysers must apply inside the substep loop or the Verlet solver destabilizes); `applyImpulse(node, ix, iy)` valid in both ground and air modes; swept-capsule hazard collision helper (prev→current hazard position vs bike points — kills tunneling against fast movers).
- **Risk:** the highest-leverage, highest-risk patch of the roadmap → tick-hash fixture must be bit-identical with all new features dormant; full harness + probe suite before merge.

## ARC 2 — Identity: the crash and the finish (v1.7 – v1.9)
*The two moments that define the game — failure and success — get their X3M-grade treatment before content scales. (Authenticity review: the draft plan polished the crash twice and the finish zero times; fixed here.)*

### v1.7 — Ragdoll crash: the rider flies
- **Goal:** on crash the rider ejects as a limp, tumbling ragdoll while the bike clatters away separately — failure becomes the funniest moment in the game.
- **Work:** 5–6 node Verlet ragdoll (head/torso/hips/limbs) spawned render-side on crash with the bike's node velocities + impact impulse; bike detaches and tumbles as a second body; both collide against terrain via the existing `contact()`; camera target switches to the ragdoll during the crash window. Render-only: the sim outcome is already decided at crash time, so ragdoll behavior *cannot* affect determinism or the harness.
- **Assets:** Higgsfield rider-only sprite (green-screen, matching `bike_body.png` style) segmented into parts.
- **Risk:** ragdoll tunneling through thin terrain looks silly → clamp velocity, substep its integration.

### v1.8 — Crash *and* finish presentation: instant restart + results ceremony
- **Goal:** crashes get a slow-mo comedy beat and `R` restarts instantly ("smash R, don't watch"); finishing gets the full X3M ceremony — ride-out celebration, results card with **flip deductions itemized**, stars stamping in one-by-one with sound, one-tap Next.
- **Work:** crash slow-mo (~0.4× for 0.4s, reduced-motion gated) + camera zoom on the ragdoll; `R`/touch instant restart that skips the 0.9s crash window and fully resets per-level mutated state (hazard phases, breakable masks — reuse the hardened `startLevel` path; harness restart-storm test: crash+R ×50, still completable); **the `-0.5s` flip popup at the landing moment** (the mechanic's self-teaching signal); animated results card (final time with flip rebate line, star stamps with SFX, best-time highlight, one-tap Next/Replay chaining); finish-flag ride-out + confetti tie-in.
- **Risk:** restart must be state-leak-proof → covered by the restart-storm harness test.

### v1.9 — Feel-parity tech + engine RPM audio *(declared physics window — `PHYSICS_VERSION` bump)*
- **Goal:** the speedrun-depth tech layer that separates X3M from its clones: **fake flips** (rotation past a threshold banks the 0.5s without completing), **wheelie-boost charging**, **rear-wheel landing boost**, air-time speed bleed — plus an engine that *sounds* like a dirt bike.
- **Work:** rotation-threshold flip counting; wheelie detection + hold-brake charge mechanic; rear-tire-only landing grants a speed pulse; slight speed bleed during long airtime; replace the flat speed-pitch whine with an RPM/gear model (pitch climbs through ratios, rev-limiter bounce, free-rev in air off `wheelSpin`); re-measure and document the jump envelope in `probe.mjs`; bump `PHYSICS_VERSION`.
- **Why now:** these change physics outcomes — they *must* land before the tape era (v1.11+) and before 18 levels are authored on top of them. This is the bike-feel lock.

## ARC 3 — The verb catalog (v1.10 – v1.15)
*The X3M gimmick engine, built foundation-first, with the tape recorder pulled forward (feasibility review) so every gimmick level ships CI-verified by a golden dev tape rather than hoping the harness AI can thread a pendulum.*

### v1.10 — Hazard conductor: deterministic movers + audio telegraphing
- **Goal:** saws that slide along tracks, maces that swing on chains, crushers that stamp, icicles that drop — all learnable fixed-period rhythms, all telegraphed by sound before you see them.
- **Work:** hazard schema `{motion: patrol|pendulum|rotor|piston|drop, anchor, amplitude, period, phase, triggerDist}`; movers computed in `rules.js` as **pure functions of sim tick** (never mutate level data — positions live on per-run state; the audit's state-leak trap); swept-capsule collision via the v1.6 helper; chain-link/piston-housing rendering + motion-path telegraphing; **distance-attenuated saw whir + hazard audio loops** (the catalog is explicit: danger is telegraphed by sound — a moving hazard without approach audio feels unfair).
- **Assets:** Higgsfield chain link, mace ball, crusher block sprites.
- **Risk:** tunneling/timing unfairness → swept test + telegraph audio + the two-line rule.

### v1.11 — Tape recorder + `verify-tape` CI *(pulled forward — the real completability answer)*
- **Goal:** every run records as a tiny input tape that replays perfectly; every level from here on ships with a **golden dev tape** that CI replays — moving-hazard levels get gated by *proof*, not by teaching the harness AI to wait for a pendulum phase.
- **Work:** tape schema `{levelId, PHYSICS_VERSION, GENERATOR_VERSION, per-tick input flags **+ restart events**}` (R-restart changes the sim timeline, so it's a tape event), RLE/delta-encoded (~bytes/sec); `?dev` recorder; `tools/verify-tape.mjs` replays through `physics.js` + `rules.js` headlessly and asserts the outcome; wired into the CI gate with a fixture tape per level — which doubles as the strongest determinism regression test the project can have.
- **Risk:** any hidden nondeterminism surfaces as replay divergence — that's a feature (the canary).

### v1.12 — Moving platforms + elevators
- **Goal:** ride oscillating ledges across gaps, jump off at the platform's apex to convert its velocity into height (a top-5 X3M verb), balance on elevators between tiers.
- **Work:** platforms as short polyline chains on the v1.6 kinematic collider list (per-substep stepping + velocity inheritance); `platform()` / `elevator()` Course primitives; stationary-balance play (feather throttle/brake — reverse driving already works) verified viable; harness idle-settle probe on a moving platform.
- **Assets:** Higgsfield steel/wood ledge sprites.
- **Risk:** velocity inheritance can inject energy into the PBD solver → clamp relative velocity; idle-on-platform harness test.

### v1.13 — TNT launchers + exploding ramps *(hazards double as tools)*
- **Goal:** riding into TNT at the right angle blasts you across the gap instead of killing you; exploding ramps detonate as you cross — hesitate and you fall with them.
- **Work:** **new `tnt` hazard type — existing `barrel`s stay lethal** (they're load-bearing pit hazards in six shipped level segments; retuning them would silently change difficulty); kill-core radius + boost radius applying radial `applyImpulse` to all 3 nodes; deterministic chain fuses (conductor clock) for wave set-pieces; exploding launch ramps (charge triggers on crossing, impulse if fast, ramp segment disables via the v1.6 mask if slow); `tntChain()` primitive; boost arc documented in `probe.mjs`; a harness-gated segment crossable *only* via TNT boost.
- **Assets:** deep boom SFX layer; TNT crate sprite.

### v1.14 — Breakables + reactive bodies
- **Goal:** plank bridges crack and fall away a beat after your wheels touch them; and a small **dynamic-body system** — rolling boulders you ride or outrun, seesaws that tip under your weight, pushable beach balls — completes "hazards double as tools" beyond TNT.
- **Work:** `breakable:{delay, segLen}` chains using the v1.6 per-segment enabled mask + contact timestamps; crack visual + creak SFX telegraph; falling debris as render-only bodies; **reactive bodies**: circle/plank bodies with mass, bike-pushable, ride-able on top (boulder = moving ground via the kinematic list; seesaw = pivot-constrained plank reacting to wheel contact position); `bridge()` / `boulder()` / `seesaw()` primitives; state fully reset on restart (harness-enforced).
- **Assets:** Higgsfield wood plank strip, boulder sprite.
- **Risk:** reactive bodies are sim-affecting → they live inside the physics substep, are covered by tick-hash + golden tapes, and land *before* the physics lock.

### v1.15 — Campaign rebuild: tutorial retrofit + levels 7–12
- **Goal:** the campaign doubles to 12 levels with teach-test-twist pacing — and the *existing* six levels are re-authored as the catalog's proven opening (one near-failproof tutorial per verb: throttle/jump, flip, wheelie-over-saws, TNT boost, moving platform).
- **Work:** retrofit L1–6 as verb tutorials; author L7–12 one-verb-each: platforms → pendulum maces → TNT chains → crushers (wait-or-send) → collapsing-bridge chase → two-verb remix finale; checkpoint-before-trap discipline; star times anchored to recorded dev reference runs (3★ = ref+8–15%, 2★ = +30–50%); **every level ships with a golden tape**; a breather spectacle level mid-pack (saw-tooth difficulty).
- **Assets:** one new background ridge palette.

## ARC 4 — Worlds (v1.16 – v1.19)
*The themed-sequel formula: shared verbs + 2–3 new physics modifiers + a full reskin per world. Physics locks for good at v1.17.*

### v1.16 — Loop-de-loops
- **Goal:** full 360° loops as pure speed checks — too slow and you fall off the top, exactly like X3M 2's fiery loops.
- **Work:** the collision is ~90% proven (`loopprobe.mjs` already rides a closed 72-segment chain) — fix the `d≈0` degenerate branch to pick the side consistent with the previous frame; the real work is rendering: closed chains draw as stroked tubes (not fill-to-bottom), exempt from `visibleSlice`'s x-monotonic culling and `groundYAt` shadows; `loop(radius)` primitive; promote `loopprobe` to an asserting CI check; screenshot-diff across all existing levels (renderer-core changes).
- **Risk:** renderer assumptions → screenshot-diff gate; contact() change → full tick-hash + tape replay.

### v1.17 — Surfaces & water: ice, boost, bouncy, water zones *(final physics lock)*
- **Goal:** ice slides, boost strips slingshot, inflatables bounce, water skims at speed and drowns you slow — the Winter and Pool Party physics kits in one declared window.
- **Work:** per-segment `surface` tags (via v1.6 `segIdx`) scaling friction (ice ≈0.25×), adding tangential accel (boost), raising restitution (bouncy); water volumes applying quadratic drag + skim lift **inside the physics substep** (per-tick force application to a 6-substep Verlet body is unstable); sink → deep submersion crash; splash/ripple particles + muffled underwater audio beat; `icePatch()/boostPad()/water()/bouncy()` primitives; `probe.mjs` gains ice-braking-distance and minimum-skim-speed measurements; **`PHYSICS_VERSION` final bump — physics is frozen from here**.
- **Risk:** friction changes are the classic "small change breaks everything" hazard → strictly scoped to tagged segments; tick-hash proves zero drift on untagged levels; timebox skim tuning with kill-pit fallback.

### v1.18 — World map + Winter pack (levels 13–18)
- **Goal:** level select becomes a scrolling themed world map — Canyon / Gimmick Gulch / Winter / Pool — and Winter ships: ice handling, falling icicles, candy-cane launchers, a crusher/ice remix, a loop set-piece.
- **Work:** `levels.js` restructured into world groups; horizontally-paged world panels with per-world star totals; **worlds unlock sequentially by completion — no star gates** (the series never gates levels on stars; stars are for the garage); save-format migration (v1 → v2, default-merge); six Winter levels on ice segments + drop icicles + breakable icy bridges + loop finale; snow particle recolor; winter music stem.
- **Assets:** Higgsfield winter ridge set, icicle sprite, snowman hazard reskins, world badges, winter stem.
- **Risk:** ice + harness AI braking → mandatory stops stay off ice (two-line rule); golden tapes carry the gate anyway.

### v1.19 — Pool pack (levels 19–24): slide tubes + boulder-chase finale
- **Goal:** the campaign hits **24 levels (X3M parity)** with Pool Party's *signature* — enclosed waterslide tubes — plus water skims, bouncy inflatables, geyser boosts, half-pipe pumping, and a chase finale.
- **Work:** **waterslide tubes** as constrained closed channels (v1.16's closed-chain tech + two-sided contact — the research rates tubes THE Pool Party novelty, above skim physics); six levels: water gaps, inflatable platforms, geysers (upward impulse volumes via `applyImpulse`), half-pipes, timed platforms (piston motion as appearing ledges); finale = **rolling-boulder + chained-TNT chase** tuned to known full-throttle pace with dense checkpoints.
- **Assets:** Higgsfield pool/summer ridge set, inflatable duck/beach-ball sprites, geyser splash, summer stem.

## ARC 5 — Meta & reach (v2.0 – v2.2)
*The star economy pays off, then the zero-server competition stack, then the world gets to find the game.*

### v2.0 — The Garage + achievements + lifetime stats
- **Goal:** spend earned stars on themed bikes (witch-bike/bone-bike energy — X3M 2's exact meta, and the payoff that makes the 3-star chase matter), plus 30 achievements and a stats page.
- **Work:** garage screen; 5–6 skins priced across the ~72-star ceiling (12/25/40/60; spending never deducts level-record stars); 3 palette-swap tints (offscreen recolor of `bike_body.png`) + 2 fully new Higgsfield sprite sets (**axle pins Sr/Sf measured per skin** — a tools script asserts geometry so the dual-anchor transform never breaks); skins are cosmetic-only (physics shared — protects ghost/share fairness); `achievements.js` predicate table evaluated on run-end; badge grid + toasts; lifetime counters (flips, airtime, crashes, distance); save export/import via clipboard (Safari 7-day eviction guard); save schema bump + migration fixture.
- **Order note:** garage lands *before* the social stack — it's the one meta the original actually had (authenticity review).

### v2.1 — Ghosts, daily challenge, share codes *(the zero-server competition stack)*
- **Goal:** race your PB as a translucent rider with live checkpoint splits; one shared date-seeded challenge per day for every player on Earth with a Wordle-style share line; **self-verifying challenge URLs** — the link *is* the run, so times can't be faked.
- **Work:** PB ghost = second render-only sim replaying the tape in the same fixed-tick loop (**full rules replay** — physics + hazard phases + respawns, since PB runs legitimately contain crashes); ±split popups at checkpoints; daily = `cyrb128(UTC date) → mulberry32` parameter-varying curated templates within the measured jump envelope, **CI validates the next 60 seeds** (deterministic fallback to nearest valid seed), streak counter + practice mode, share text ("Moto Rush X3 Daily #142 — 41.3s 🏍️"); share-run codes: `{level|seed, PHYSICS_VERSION, tape}` → deflate → base64url in the URL fragment (`#r=`, no server, no logs) — opening re-simulates headlessly to derive the *true* time, then offers "Race this ghost"; `GENERATOR_VERSION` stamps dailies so future Course changes never silently rewrite past seeds.
- **Risk:** URL length → 60–90s runs compress to a few hundred chars; 2KB cap with clipboard fallback. Same-engine verification is honest about float caveats (v1.5's canonicalization is why this works).

### v2.2 — Mobile ergonomics + load time + distribution
- **Goal:** comfortable on notched phones, interactive in <5s on 4G, and shareable everywhere — the update that makes strangers' first 30 seconds great.
- **Work:** `viewport-fit=cover` + safe-area insets for HUD/controls; full Pointer Events migration with per-pointer tracking; optional **"Simple" control scheme** (hold right half = gas, left = brake — HCR-style) with hit zones much larger than visuals; rotate-device overlay; asset optimization pass (`oxipng`/`pngquant`, resize the 592KB dirt.png & 476KB icon; **5.1MB → <2MB target**, CI size-budget assertion); sprite atlas for props/particles/UI (bike/wheel sprites stay standalone — transform-critical); lazy music loading; instant-paint branded splash + real progress bar + tap-to-play audio unlock; OG/twitter cards (1200×630 gameplay art), favicon kit; `tools/package-itch.mjs` one-command itch.io zip; Poki checklist audit (payload, saves, tablet controls) with gaps filed.
- **Order note:** last on purpose — distribution amplifies whatever exists, so it ships after the game is worth spreading.

---

## Beyond the 20 — the horizon backlog

Sequenced roughly; each is real but none blocks the 20 above.

- **Per-level challenges + collectible bolts** — 3 challenge flags per level (no-crash, no-brake, flip-count, beat-dev-time) + a collectible on the risky line; every collectible verified reachable by a stored dev tape in CI. The cheapest content multiplier (research: 3–4 replay passes over the same 24 levels).
- **Level editor + community packs** — in-game editor over the existing Course primitives (parameterized, envelope-safe by construction), share levels as `#l=` URL codes; curated `packs/community.json` in the repo via PRs — **a PR must include a completability tape, so community levels can't break the sacred gate**.
- **Spooky pack (levels 25–30)** — rolling pumpkins, exploding jack-o'-lanterns, ghost hazards; third full theme on the same formula.
- **Chase-director set-pieces** — a reusable script layer (camera cues, spawn waves, pursuing threat speed curve): avalanche for Winter, tidal wave for Pool. 1–2 per campaign, placed late.
- **Cannons/launch tubes, water currents, drop shafts** — remaining medium-priority catalog verbs.
- **Second bike with distinct physics** (per-bike `CONFIG` presets, records namespaced by bike) — only after the garage proves cosmetic demand.
- **Rhythm mode** — BPM-quantized hazard conductor as an opt-in scored mode (the conductor already carries `{period, phase}`).
- **Endless/daily-endless mode** — stream-stitched Course segments with escalating density, on the daily's validated-template machinery.
- **Online leaderboards** — *parked while GitHub-only.* The honest answer needs a server-side verifier; share codes (v2.1) deliver 80% of the value at 0% of the cost. If ever revisited: the tape format + headless verifier are already the hard part, built.
- **App-store wrappers (Capacitor/TWA), i18n, deeper accessibility hub, tilt controls** — post-distribution, demand-driven.

---

## Engineering discipline (how 20 updates ship without breaking the game)

- **The gate:** CI runs harness + probes + tick-hash + every golden tape on every push; the deploy job only runs if green. A level without a passing tape does not merge.
- **Physics windows:** sim-affecting changes only in v1.5/v1.6 (infrastructure), v1.9 (feel lock), v1.13/v1.14 (dynamics), v1.16/v1.17 (final lock). Each bumps `PHYSICS_VERSION`; stored tapes/ghosts invalidate cleanly with a friendly message.
- **Pure-function movers:** all dynamic hazard state derives from tick count; per-run state lives outside level data; `startLevel`/instant-restart fully reset (harness restart-storm test).
- **Art pipeline:** Higgsfield green-screen → chroma-key → autocrop → committed to `public/assets/`; new bike skins ship with measured axle-pin geometry.
- **Deploys:** GitHub only. Every merge to the working branch auto-publishes `public/` to `gh-pages`; the live site is https://qemmhd.github.io/motogame/ and the menu's build tag confirms what's live.

*Living document — updated as patches land. v2 authored 2026-07-04 from the multi-agent research + adversarial review pass; supersedes the v1 roadmap (see git history).*

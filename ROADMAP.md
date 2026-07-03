# 🏍️ Moto Rush X3 — Development Roadmap

> Living plan for taking Moto Rush X3 from a polished 4-level demo to a competition-grade, live-ops stunt racer that beats Moto X3M at its own game. Generated from a multi-agent audit of the Moto X3M franchise + genre peers, our own codebase, and the connector/tool stack available to this project. Patches are independently shippable and sequenced so foundations land before the features that need them.

**Where we are now (v1.0):** framework-free HTML5 canvas game — custom 3-point Verlet bike physics (soft-body on ground, rigid in air), turtle-built courses with 4 levels, spikes/barrels/saws, keyboard+touch+gamepad, synthesized SFX, particles, local best-times + star ratings. Deployed on Higgsfield + GitHub (githack / gh-pages). No backend, music, customization, dynamic hazards, editor, or online play — **that is what this roadmap builds.**

## 🎯 Vision

Moto Rush X3 becomes the definitive skill-first stunt racer by beating Moto X3M on the three things clones actually compete on — crafted-level craft, honest competition, and reach — while our Verlet 3-point physics does things the franchise fakes. The moat is a DETERMINISTIC, replay-verified spine: physics.js has zero Math.random and runs on a fixed timestep, so a 4-bit-per-tick input tape re-simulates to the exact same finish tick. That single property powers ghosts, cheat-resistant leaderboards, and async duels at a few KB each. But we treat determinism as an engineering problem to be earned, not assumed: IEEE-754 only guarantees correct rounding for +,-,*,/,sqrt, while sin/cos/hypot/atan2 differ across CPUs and V8 builds, so we de-risk cross-platform re-sim (deterministic-math shim, then fixed-point where it matters) BEFORE we bet the competitive spine on it, and prove it with a golden-tape CI gate that ships WITH the tape recorder. We front-load fun (juice, music, control-feel, a fully local ghost + daily loop that needs no server) so retention is proven before a line of backend exists. Content is crafted-first: a designer-in-the-loop tuning pipeline and a deep bench of authored levels, with a style-locked AI art pipeline turning a themed biome around in days (not the fantasy 'afternoon'), and procedural daily/endless as a supplement, never a substitute. We reach players where the genre lives — web-game portals (Poki/CrazyGames) with rewarded-ad revenue that funds the edge stack — and we ship the compliance (COPPA/GDPR-K age-gating), moderation, and performance budget that a young-skewing, UGC-bearing game legally and practically requires. Real soft-body physics (sagging rope bridges, buoyancy, ragdoll), a rhythm layer that quantizes hazards to the soundtrack, a style-fed pay-nothing economy, and true accessibility round out a game with a live-ops heartbeat a static clone can't sustain.

## 🥇 How we beat & differ from Moto X3M

1. Earned determinism, not assumed: we replace implementation-defined transcendentals (sin/cos/hypot/atan2) with a bundled deterministic-math shim and fixed-point where drift matters, then lock it with a golden-tape CI gate that fails the build on any finish-tick divergence. Only after re-sim is proven bit-identical browser-vs-edge do we build leaderboards on it — so posted times are genuinely un-forgeable, where Moto X3M/clones trust the client.
2. Local-first competitive loop before any backend: the input tape drives self-ghost racing and a date-seeded local daily with ZERO server, delivering the 2x-attempts retention lever months before the edge/auth/verifier stack — and ghosts are baked to a position buffer on load (one re-sim, then interpolate) so racing 3 ghosts is cheap, not 4x live physics.
3. Crafted-first content with designer-in-the-loop tuning: a real level-authoring + playtest-telemetry pipeline and a deep bench of hand-tuned, surprise-driven levels — procedural daily/endless supplements it, never replaces it — because Moto X3M's appeal is authored craft, not reskins.
4. Real soft-body physics, not scripted fakes: rope bridges sag and snap plank-by-plank, seesaws respond to RIDER lean via our Verlet head-mass, water gives true buoyancy/dunk-crashes, crashes ragdoll — where the franchise pre-animates all of it.
5. Rhythm layer shipped, not shelved: saws/crushers/pendulums carry {path,phase,speed} and quantize to the soundtrack BPM as a real scored mode, so clean play literally feels musical — a headline the vision actually delivers on-schedule.
6. Speed-gated skill loops and a style-fed, pay-nothing economy: stall-and-slide-back loops, detonatable kicker barrels, a trick-charged nitro meter, and currency/cosmetics earned by flips, near-misses and margin under the 3-star time — 100% cosmetic, funded by rewarded ads, never pay-to-win.
7. Reach where the genre lives: web-portal distribution (Poki/CrazyGames/Y8) with a save/leaderboard/ads abstraction designed in from v1.1 so portal SDK constraints shape the architecture instead of being bolted on — plus rewarded-ad revenue that actually funds the servers.
8. Trust, safety and access built for a young audience: COPPA/GDPR-K age-gating before accounts/analytics/push, UGC moderation (report/block/EULA) before the editor ships, full remap/assist presets, colorblind + shape-coded hazards baked in at draw time, screen-reader narration, and offline-first PWA that genuinely works offline from v1.1.

## 🚀 The patch plan

### v1.1 — Feel, Feedback & the Local Loop
**Theme.** Prove the game is FUN and retentive before any backend: settings/persistence foundation first, then juice, music, class-leading control feel, and a fully local ghost + daily loop that needs zero server.

**Goal.** Front-load every near-zero-cost feel win and a complete no-server retention loop. Ship the settings/persistence substrate FIRST (it owns every flag later features toggle), wire the dormant juice hooks, add music, dedicate real work to validating the core driving model, surface a basic style/combo score, and deliver local self-ghost racing + a local date-seeded daily plus a genuinely-offline PWA — all runnable and shippable to a web-portal sandbox with no server.

| Feature | What & how | Effort | Tools |
| --- | --- | :---: | --- |
| **Settings & persistence substrate + control remapping (FOUNDATION, first)** | Build a lightweight focusable DOM overlay above the canvas that becomes the single home and persistence owner for every current and future toggle, and replace the hardcoded KEYMAP (game.js:101) with a rebind-capture flow. Kept deliberately small so remapping is NOT gated behind a polished design-system hub; the polished accessibility hub lands later. | M | `verify` · `code-review` · `Figma` |
| **Wire the dormant juice hooks (slow-mo + hitstop + flash)** | Activate the already-declared-but-inert G.slow, the frame() 'slow' local (hardcoded to 1) and the dead G.flash field: scale the fixed timestep at triple-flip apex, near-misses and finishX crossing, and freeze 40-80ms + one-frame white flash on crash/heavy landings, energy-scaled. The single cheapest feel upgrade — ship it first after the substrate. | S | `verify` · `code-review` |
| **Music & adaptive audio bed (largest session-length lever)** | There is zero music today; the master-gain bus (game.js:54) and mute plumbing exist. Add looping per-state stems that cross-fade and intensify with speed/hazard proximity, plus a gear/RPM engine model replacing the flat speed*0.16 whine. Front-loaded as the first M because it is the roadmap's single biggest session-length lever. | M | `higgsfield generate_audio` · `Cloudinary` · `code-review` |
| **Core driving-model validation & tuning pass (NEW)** | Everything downstream assumes the throttle/lean/grip feel is already Moto-X3M-tight, but that is unproven. Dedicate real iteration to the base control model: instrument lightweight local telemetry (time-to-correct, air-control responsiveness, landing forgiveness), run structured playtests, and tune CONFIG until the raw ride is class-leading BEFORE ghosts/boards are built on top of it. | M | `verify` · `code-review` · `dataviz` |
| **Physics-driven landing squash, suspension & camera** | Add fork/shock compression and squash-and-stretch to the rigid drawBike sprite, driven by real impact velocity at game.js:235, compressing front and rear independently so nose-dives and flat cases read differently, plus a subtle flip-following camera. | M | `verify` · `code-review` · `higgsfield generate_image` |
| **Haptics + reduced-motion + photosensitivity safety** | Add navigator.vibrate + Gamepad vibrationActuator scaled by impact energy, all reading the reducedMotion flag from the substrate so shake/camera/slow-mo/particle budgets are capped in one place. | S | `verify` · `code-review` |
| **Basic combo / style score HUD (pulled early from v1.3)** | physics.js already detects flips, rear/front ground contact and clean landings. Surface a minimal live combo/style meter now so the 'style fantasy' the vision sells exists from v1.1 and the later currency has a substrate to key off — not deferred to v1.3. | S | `verify` · `dataviz` |
| **Deterministic replay tape + LOCAL self-ghost + local daily (NEW, pulled from v1.2)** | Record the 4-bit input bitmask per fixed 1/60 tick plus a header {levelId, geometry hash, PHYSICS_VERSION, start state}, RLE/varint-compressed to a few KB (possible because game.js:628-651 is a fixed-timestep accumulator with no Math.random). Deliver the biggest retention lever with NO server: race your own PB ghost and a date-seeded local daily. Ghosts bake to a position buffer on load (one re-sim, then interpolate) to avoid per-frame 4x sim cost. | M | `verify` · `code-review` |
| **Installable, genuinely-offline PWA shell** | Deliver the 'offline-first' the vision promises NOW, not in three versions: manifest (standalone, landscape lock, theme_color #1b1f2a, maskable icons/splash) PLUS a cache-first service worker so the game actually plays offline. SW cache version is bound to build hash so it can never serve a stale game.js/physics.js under a new PHYSICS_VERSION. | M | `higgsfield generate_image` · `Cloudinary` · `GitHub Actions` · `code-review` · `verify` |

<details><summary>Tasks — Settings & persistence substrate + control remapping (FOUNDATION, first)</summary>

- Create a minimal DOM overlay (menu + pause) with focus management and ARIA landmarks
- Add a persisted settings store next to save.muted (mute, reducedMotion default from prefers-reduced-motion, haptics) that later features read/write
- Replace hardcoded KEYMAP (game.js:101) with an e.code rebind-capture flow; ship southpaw/one-hand/lean-swap presets
- Expose CONFIG feel constants (physics.js:10-36) as Chill/Normal/Pro assist presets, raw sliders behind ?dev
- Design a save/leaderboard/ads ABSTRACTION seam now so portal SDKs slot in without a rewrite later
- verify keyboard nav + rebind persistence; code-review the persistence layer

</details>
<details><summary>Tasks — Wire the dormant juice hooks (slow-mo + hitstop + flash)</summary>

- Scale frame() 'slow' from G.slow, keeping input sampling at full rate
- Auto-trigger slow-mo on triple-flip apex and finish crossing (game.js:253), ramp back to 1x
- Drive hitstop duration + G.flash intensity from the impact-energy value at game.js:235
- Gate all of it behind the reducedMotion flag from the substrate
- verify a crash and a finish fire the beats; code-review the timestep hot path

</details>
<details><summary>Tasks — Music & adaptive audio bed (largest session-length lever)</summary>

- Generate original looping stems (menu/drive/tension/finish) + a finish sting with Higgsfield generate_audio; trim clean loop points
- Build an audio manager routing stems through the master bus, ducking under SFX
- Key intensity off bike.speed and nearest-hazard distance
- Replace the single oscillator with an RPM/gear model: pitch climbs through ratios, rev-limiter bounce, free-rev in air off bike.wheelSpin
- Serve/optimize audio via Cloudinary; honor save.muted; code-review the audio graph

</details>
<details><summary>Tasks — Core driving-model validation & tuning pass (NEW)</summary>

- Add local, opt-in feel-telemetry (input latency, air-rotation authority, landing recovery window) surfaced in a ?dev overlay
- Run a structured self+external playtest protocol; capture a before/after tuning log
- Iterate driveAccel/airAccel/maxAirOmega/gravity/grip (physics.js:10-36) to a documented target feel
- Add a rider auto-level 'rescue rotation' assist nudging wheels-down near ground with no input
- verify the tuned model across touch/keyboard/gamepad; code-review any physics constant changes (no PHYSICS_VERSION-affecting logic changes here)

</details>
<details><summary>Tasks — Physics-driven landing squash, suspension & camera</summary>

- Compute per-wheel impact velocity from rear/front Verlet node delta-y at contact
- Apply a decaying squash/stretch scalar per wheel as non-uniform scale in drawBike (game.js:444-454)
- Tie dust/roost burst magnitude to the same value
- Add camera rotation following ~15-25% of bike.airRot, eased to level on land, gated by reducedMotion
- verify a big case vs a nose-dive; code-review the render path

</details>
<details><summary>Tasks — Haptics + reduced-motion + photosensitivity safety</summary>

- Emit vibration on land/crash/checkpoint/flip, strength = normalized impact energy, behind the haptics toggle
- Drive gamepad rumble via pads enumerated in padCommands (game.js:147)
- Route reducedMotion to cap G.shake, camera rotation, slow-mo and particle counts
- verify on touch + gamepad; code-review the gating

</details>
<details><summary>Tasks — Basic combo / style score HUD (pulled early from v1.3)</summary>

- Aggregate flips/near-misses/clean-landing/no-brake streaks into a live combo meter in the HUD
- Compute a per-run style score (kept simple, re-derivable from run state)
- Show a finish-screen style summary + best-style memory in local save
- verify the score reflects a flip-heavy vs clean run; dataviz the combo HUD

</details>
<details><summary>Tasks — Deterministic replay tape + LOCAL self-ghost + local daily (NEW, pulled from v1.2)</summary>

- Capture the per-tick input bitmask + header; RLE/varint compress the tape; store locally
- Add a ghost path that re-simulates a stored tape ONCE at load into a position buffer, then interpolates during play (cheap multi-ghost)
- Race your own PB as a translucent ghost; support a local best-time chase
- Add a purely-local date-seeded daily from the Course builder (no server, no board yet)
- verify a replayed tape reproduces the exact recorded finish tick locally; code-review the encoder

</details>
<details><summary>Tasks — Installable, genuinely-offline PWA shell</summary>

- Author manifest.webmanifest with landscape lock and maskable icon set; generate icons/splash with Higgsfield, deliver via Cloudinary
- Add a cache-first SW precaching the shell + assets, stale-while-revalidate for JS, cache key = build hash (never serves mismatched physics version)
- Surface a native Install prompt on beforeinstallprompt
- Wire GitHub Actions to version icons/manifest/SW-cache with deploys
- code-review the SW cache-versioning; verify offline boot + local play

</details>

**Success metrics:** Median session length up >=30% (music + juice) vs v1.0 baseline; 100% of crashes/finishes fire hitstop+flash+haptics; Control-feel tuning log shows measurable improvement in landing-recovery and air-authority targets; base model signed off by playtest before any board work; Local self-ghost live: per-level attempts up >=2x on ghost-enabled levels, with ZERO server dependency; Reduced-motion, remap and assist presets reachable + persisted for 100% of players; no canvas-only settings remain; PWA installs AND plays fully offline in v1.1; SW cache key bound to build hash, verified to never serve mismatched physics

---

### v1.2 — Living Hazards, Rhythm & the Determinism Foundation
**Theme.** Build the parametric hazard engine (with accessibility and the rhythm payoff baked in) and de-risk cross-platform determinism BEFORE any competitive backend is built on it.

**Goal.** Deliver the parametric hazard conductor with shape-coded/colorblind glyphs authored at draw time and the BPM rhythm payoff the vision headlines, add explosives/kickers, and — critically — land the determinism de-risk (deterministic-math shim / fixed-point where drift matters) and the golden-tape CI gate that ships WITH the tape recorder, so the competitive spine in v1.4 rests on proven bit-identical re-simulation instead of an assumption.

| Feature | What & how | Effort | Tools |
| --- | --- | :---: | --- |
| **Deterministic-math foundation + golden-tape CI gate (FOUNDATION, biggest risk)** | THE de-risk. physics.js uses Math.hypot/cos/sin/atan2 (physics.js:83,174,190,250); IEEE-754 does not standardize these, so browser and Cloudflare-Worker re-sims can diverge over thousands of ticks. Replace them with a bundled deterministic-math shim (and fixed-point for the accumulating hot paths) so re-sim is bit-identical everywhere, and prove it with a CI gate that lands WITH the tape recorder — never after. | L | `verify` · `code-review` · `GitHub` · `Cloudflare` |
| **Parametric hazard conductor + animated hazards + shape-coded glyphs (FOUNDATION)** | Today updateHazards (game.js:285) only advances the saw's cosmetic spin. Give every hazard {path, phase, speed, kind} and a shared update/collide pass so saws slide/sweep, pendulums swing (nudgeable point-mass), crushers slam on cadence and gates cycle. Colorblind + shape-coded glyphs are authored HERE at draw time (not retrofitted in v1.4), since this is where every hazard's render path is built. | L | `verify` · `code-review` · `dataviz` · `higgsfield generate_image` · `higgsfield generate_audio` |
| **Rhythm mode: BPM-quantized hazards (delivers the headline differentiator)** | The vision sells a 'rhythm layer nobody else has' yet the draft left it in the backlog. Deliver it: quantize the hazard conductor's {phase,speed} to the soundtrack BPM as a real, opt-in scored mode so clean play feels musical. | M | `verify` · `code-review` · `higgsfield generate_audio` |
| **Timed explosives & kicker barrels** | Two barrel types on the new hazard engine: lethal (crash) and 'kicker' barrels the player intentionally detonates to blast across an un-jumpable gap, applying a physics impulse to the Verlet nodes (using the deterministic-math foundation so detonations re-sim identically). | M | `verify` · `code-review` · `higgsfield generate_audio` · `higgsfield generate_image` |
| **Polished accessibility hub (screen-reader + colorblind completeness)** | Grow the v1.1 settings substrate into the full accessibility hub: an ARIA live region narrating menu/level/checkpoint/crash/flip/finish with earcons, and completion of the colorblind palette system (the per-hazard glyphs already exist from the conductor). Designed as a Figma token system the canvas draw helpers consume. | M | `Figma` · `verify` · `code-review` · `dataviz` |

<details><summary>Tasks — Deterministic-math foundation + golden-tape CI gate (FOUNDATION, biggest risk)</summary>

- Audit every transcendental/accumulating op in physics.js; replace Math.sin/cos/hypot/atan2 with a bundled deterministic implementation, fixed-point where drift accumulates
- Add a Node harness importing physics.js that replays a tape to the same finish tick
- Add a CI job replaying golden tapes across Node + a Worker isolate + headless browser; ANY finish-tick divergence fails the build and forces an explicit PHYSICS_VERSION bump
- Establish PHYSICS_VERSION as the season/namespace key from day one
- verify identical finish ticks across all three runtimes; high-effort code-review of the math swap

</details>
<details><summary>Tasks — Parametric hazard conductor + animated hazards + shape-coded glyphs (FOUNDATION)</summary>

- Extend the hazard schema in levels.js with path (linear/arc/orbit), phase, speed, cadence, kind
- Rewrite updateHazards into a generic mover updating each hazard's collision center per tick
- Add kinds: sliding/sweeping saw, swinging pendulum (distance-constraint point-mass), slam crusher with a pass window, cycling gate
- Bake per-hazard outline glyph + colorblind-safe palette at draw time (danger never hue-only), WCAG-validated
- Add an adaptive-cadence accessibility option (widens window after repeated deaths, off for leaderboard runs)
- Author one showcase gauntlet threading all kinds; verify each end-to-end; code-review collision timing

</details>
<details><summary>Tasks — Rhythm mode: BPM-quantized hazards (delivers the headline differentiator)</summary>

- Add a BPM clock synced to the audio manager; snap hazard phase/cadence to musical subdivisions
- Add an opt-in Rhythm mode toggle per level that quantizes all dynamic hazards
- Add on-beat visual/audio feedback and a rhythm-accuracy contribution to style score
- verify hazards land on-beat against the stems; code-review the clock sync

</details>
<details><summary>Tasks — Timed explosives & kicker barrels</summary>

- Add a detonation event applying a radial velocity impulse to nearby bike nodes
- Author lethal vs kicker variants (proximity/contact/timer triggers)
- Add a blast particle burst + explosion SFX + energy-scaled shake
- Design one gap only crossable via a kicker detonation
- verify the launch physics re-sims deterministically; code-review the impulse math

</details>
<details><summary>Tasks — Polished accessibility hub (screen-reader + colorblind completeness)</summary>

- Push concise strings to an off-canvas ARIA live region at existing event points; add distinct earcons
- Complete a central palette map with deuter/prot/trit schemes reusing the conductor's glyphs
- Design the hub as a Figma token set exported for the canvas draw helpers
- verify screen-reader flow start-to-finish; code-review the token indirection

</details>

**Success metrics:** Golden tapes re-sim to a bit-identical finish tick across Node + Worker + browser; an intentional physics tweak in a canary PR fails the CI gate; Hazard engine ships >=4 dynamic kinds reused across all levels with no per-level bespoke code; every hazard carries a shape glyph + colorblind-safe palette from day one; Rhythm mode ships and hazards land on-beat; rhythm accuracy feeds style score (the headline differentiator is live, not backlogged); Screen-reader narration + colorblind palettes validated before any leaderboard launch; No leaderboard-affecting physics has shipped yet — the competitive spine is intentionally still un-launched

---

### v1.3 — Worlds, Crafted Content & Leaderboard-Affecting Physics
**Theme.** Deliver the real Moto X3M content palette AND freeze every leaderboard-affecting physics change BEFORE boards launch — themed biomes, a crafted-level pipeline, moving/soft/inverted terrain, loops, deep scoring — plus portal distribution and rewarded-ad revenue to fund the backend.

**Goal.** Land all the physics rewrites that bump PHYSICS_VERSION (moving segments, soft-body terrain, per-surface grip, the XL contact() inversion for loops) HERE, so v1.4's boards launch on frozen physics and early seasons aren't thrown away. Build the crafted-level authoring + tuning pipeline (not just reskins), harden the Course generator that daily/endless/UGC depend on, ship 3-4 style-locked biomes, surface deep trick scoring, and publish to web portals with rewarded ads so revenue funds the edge stack.

| Feature | What & how | Effort | Tools |
| --- | --- | :---: | --- |
| **Crafted-level pipeline + authored volume + generator hardening (FOUNDATION, NEW)** | The draft treated content as 'apply a theme id' + procedural — but Moto X3M is authored craft. Build a designer-in-the-loop pipeline: a fast internal authoring/tuning flow with playtest telemetry, a deep bench of hand-tuned levels, AND hardening of the 'turtle' Course builder that daily/endless/UGC all silently depend on, so its output is provably solvable and fun. | L | `verify` · `code-review` · `Linear` · `dataviz` |
| **Data-driven theme manifest + 3-4 style-locked biomes** | A theme manifest (palette + hazard set + parallax + SFX/music pack) so one render path draws every world. Ship Winter, Pool Party, Spooky and Desert — but scoped honestly: AI generation is fast at raw assets and SLOW at cohesion, so the hard, time-boxed work is art-direction and a locked style guide, landing a biome in days, not the fantasy 'afternoon'. | L | `higgsfield generate_image` · `Cloudinary` · `Figma` · `Linear` · `code-review` |
| **Moving-segment collision: platforms, elevators, conveyors, seesaws (leaderboard-affecting)** | REFACTOR that changes physics. Terrain is baked into static buckets today; make collision aware of moving, velocity-carrying segments that impart frame velocity to the bike, plus conveyor surface velocity and rider-lean seesaws. Landed BEFORE boards so it can't reset seasons afterward. | L | `verify` · `code-review` · `higgsfield generate_audio` |
| **Soft-body terrain: rope bridges & collapsing ramps (leaderboard-affecting)** | Our Verlet/PBD solver IS the tool. Ship rope bridges the bike deforms and snaps plank-by-plank, plus collapsing wood/glass ramps with crack propagation. Perf-budgeted: constraint-solver cost is capped and profiled against the low-end device matrix so it never breaks the 60fps determinism contract. | L | `verify` · `code-review` · `higgsfield generate_audio` · `higgsfield generate_image` |
| **Per-surface physics: ice/mud/sand/tarmac + boost + wind (leaderboard-affecting)** | Tag each ground segment with a surface id modulating the existing grip param plus particles/sound, add trigger boost pads feeding the trick-charged nitro meter, and volumetric wind/gravity zones. All grip-affecting, so landed before boards. | M | `verify` · `code-review` · `higgsfield generate_image` · `Cloudinary` |
| **360 gravity-defying loops via inverted-surface contact (XL, highest-risk, leaderboard-affecting)** | XL refactor + signature wow, done BEFORE boards so its unavoidable PHYSICS_VERSION bump doesn't reset a live season. contact() depenetrates OUTWARD (physics.js:142) so it can't support inside surfaces. Rework to signed/two-sided depenetration behind a feature flag with the full existing-level regression suite guarding ground-collision feel, then add speed-gated loops (too-slow stalls and slides back — recoverable, not instant death). | XL | `verify` · `code-review` · `higgsfield generate_audio` |
| **Deep trick / flip-combo scoring (extends the v1.1 style HUD)** | Grow the basic v1.1 combo HUD into full depth: chained flips + near-misses + no-brake streaks paying into BOTH the finish-time bonus (-0.5s/flip) and a style axis, with a near-miss grader for gauntlets — all re-derivable from the tape so it can later feed a verified style board. | M | `verify` · `code-review` · `dataviz` · `Figma` |
| **Web-portal distribution + rewarded-ad revenue (NEW, funds the backend)** | Publish to Poki/CrazyGames/Y8 — the highest-ROI channel for the genre and the actual Moto X3M distribution — using the save/leaderboard/ads abstraction seam built in v1.1. Add rewarded-ad continues + interstitial-on-retry (the real web monetization) so revenue starts BEFORE the expensive v1.4 edge stack. | M | `verify` · `code-review` · `Linear` |

<details><summary>Tasks — Crafted-level pipeline + authored volume + generator hardening (FOUNDATION, NEW)</summary>

- Build an internal level-authoring + hot-reload tuning flow with playtest telemetry (death heatmap, time-to-clear) feeding star-threshold tuning
- Author a bench of >=12 hand-tuned, surprise-driven levels (not reskins), reviewed against a difficulty curve
- Harden the Course generator: solvability check via headless replay, quality gates, seed reproducibility — the shared dependency for daily/endless/UGC
- Track each level as a Linear content issue; verify every authored + generated level is clearable and re-sims deterministically

</details>
<details><summary>Tasks — Data-driven theme manifest + 3-4 style-locked biomes</summary>

- Define a theme manifest schema; route drawSky/parallax/palette/SFX through it (replaces shared sky.jpg)
- Establish a locked style guide + Figma tokens FIRST so generated strips/tiles/sprites stay cohesive (the real bottleneck)
- Generate tileable parallax + power-of-two terrain tiles per biome with Higgsfield; remove_background/upscale; atlas + deliver via Cloudinary (f_auto/q_auto)
- Apply each biome as a theme id over crafted courses
- code-review the theming indirection

</details>
<details><summary>Tasks — Moving-segment collision: platforms, elevators, conveyors, seesaws (leaderboard-affecting)</summary>

- Add moving/kinematic ground segments with per-segment velocity to the collision model
- Transfer segment frame velocity to bike nodes on contact (a fast lift flings you)
- Add conveyor surface velocity into the contact-tangent rolling calc; reversible-on-timer belts
- Add center-hinged seesaw planks redistributing weight from rider lean via Verlet head-mass
- verify momentum transfer + seesaw balance re-sim deterministically; code-review the moving-collision math

</details>
<details><summary>Tasks — Soft-body terrain: rope bridges & collapsing ramps (leaderboard-affecting)</summary>

- Build rope bridges as linked point-mass chains with distance constraints, weight-deforming and snappable
- Add breakable planks/ramps with a structural-integrity timer and cracks propagating from wheel contact
- Add a glass variant shattering into physics shards via the particle system
- Profile solver + shard cost against the low-end matrix; add a quality tier that reduces shard/constraint count without changing sim outcome
- verify sag/snap/shatter; code-review constraint-solver load

</details>
<details><summary>Tasks — Per-surface physics: ice/mud/sand/tarmac + boost + wind (leaderboard-affecting)</summary>

- Add a surface id per ground segment modulating CONFIG.grip and selecting particle/SFX
- Add boost pads + a style-fed nitro meter charged by flips + clean rear-wheel landings, spent manually
- Add volumetric force zones (wind/updraft/low-gravity) as an added substep acceleration term with wind-streak decor
- Add surface-aware particles: directional mud roost, frame-scrape sparks, persistent tire tracks
- verify each surface feel re-sims identically; code-review the substep force term

</details>
<details><summary>Tasks — 360 gravity-defying loops via inverted-surface contact (XL, highest-risk, leaderboard-affecting)</summary>

- Rework contact() for signed, two-sided/inside-surface depenetration behind a flag, without regressing normal ground
- Guard with a regression suite replaying all existing crafted levels' golden tapes for identical outcomes
- Add loop geometry to the Course builder; validate the bike rides the inside under centripetal speed
- Add a momentum meter; too-slow entry stalls and slides back rather than crashing; add an inverted ceiling-ride variant
- Bump PHYSICS_VERSION once here; verify loop entry at various speeds; high-effort code-review of the collision rewrite

</details>
<details><summary>Tasks — Deep trick / flip-combo scoring (extends the v1.1 style HUD)</summary>

- Extend the combo meter with chaining, near-miss grading (how close without touching) and no-brake streaks
- Pay combo into finish-time bonus and a separate style score
- Ensure style is fully re-derivable from the input tape (for later server verification)
- dataviz the combo HUD; verify style reproduces from tape; code-review the scoring hooks

</details>
<details><summary>Tasks — Web-portal distribution + rewarded-ad revenue (NEW, funds the backend)</summary>

- Integrate a portal SDK (Poki first) behind the v1.1 abstraction: their save, ad, and (portal) leaderboard hooks
- Add rewarded-ad 'continue/checkpoint-skip' and interstitial-on-retry with frequency caps tuned to portal policy
- Conform to portal technical requirements (loading, pause/mute events, resolution) and submit for certification
- Track revenue + retention per portal; verify ad flows don't break the deterministic run/tape
- code-review the ads/save abstraction

</details>

**Success metrics:** >=12 hand-crafted, difficulty-curated levels shipped (not reskins) + a hardened generator that only emits verified-solvable courses; 4 style-locked biomes from one theme code path; cohesion reviewed against a locked style guide (days-per-biome, honestly scoped); ALL leaderboard-affecting physics (moving segments, soft-body, surfaces, loops) shipped and FROZEN before v1.4 boards; PHYSICS_VERSION bumped at most once here; Loops clearable with stall/slide-back (not instant death); existing-level regression suite passes bit-identically after the contact() rewrite; Live on >=1 web portal with rewarded ads producing revenue that funds v1.4; ad flows verified not to corrupt tapes; low-end device matrix holds 60fps with soft-body + shards

---

### v1.4 — The Competitive Spine (on frozen, proven physics)
**Theme.** Now that physics is frozen and determinism is proven, launch honest global competition — server verifier, leaderboards, downloadable ghosts, accounts — with compliance, anti-TAS, and a perf gate as first-class features.

**Goal.** Ship the server-authoritative verifier (re-running the deterministic-math physics.js in an edge isolate), global/friends leaderboards, downloadable ghosts, and guest-first cloud accounts on one edge origin — gated by a COPPA/GDPR-K age/compliance track that MUST precede accounts+analytics, a TAS/bot detection-and-segregation plan beyond cadence heuristics, and a performance CI gate + low-end device matrix so determinism doesn't spiral weak phones into a death loop.

| Feature | What & how | Effort | Tools |
| --- | --- | :---: | --- |
| **Child-privacy & compliance track (FOUNDATION, precedes accounts/analytics/push)** | The audience skews young and we are about to add accounts, an events stream and (later) push. COPPA/GDPR-K age-gating, consent, data-minimization and a privacy policy/EULA are a legal and store-review blocker that must land BEFORE the first account or analytics event — not bolted on in v2.0. | M | `verify` · `Tavily` · `WorkOS` |
| **Server-authoritative verifier (edge replay on proven physics)** | An edge function ingests a tape and re-runs the UNMODIFIED deterministic-math physics.js tick-for-tick in a V8 isolate, deriving the finish time itself — safe now because v1.2 proved bit-identical re-sim. Rejects on level-hash/PHYSICS_VERSION mismatch, tick-vs-claim inconsistency, or head-crash before finish. The board time is the server-recomputed tick; the client number is discarded. | L | `Cloudflare` · `Supabase` · `Sentry` · `verify` |
| **Anti-TAS / bot detection & segregation (NEW)** | The verifier defeats time-forgery but NOT a solver that emits a physically-valid, human-plausible tape and re-sims cleanly — that farms #1 on every board. Add detection (input-entropy/optimality fingerprinting, frame-perfect-consistency scoring, statistical outlier flags) and a segregated 'unverified/TAS' board so bots don't pollute the human ladder. | L | `Supabase` · `dataviz` · `verify` · `code-review` |
| **Performance budget + low-end device gate (NEW, FOUNDATION)** | Determinism forbids dropping sim steps, so a weak phone that can't run Verlet + shards + multiple ghosts at 60fps spirals. Establish a target-device matrix, a perf CI gate, and dynamic quality scaling (particles/shards/ghost-render count) that never alters the sim — only rendering. | M | `Sentry` · `verify` · `code-review` · `GitHub` |
| **Global + friends leaderboards with auto-rivals** | Postgres tables (runs, leaderboard_entry, seasons) for per-level all-time + weekly boards, top-N + 'your rank', global/friends/country filters, namespaced by PHYSICS_VERSION (frozen since v1.3, so seasons are stable). RLS forbids client INSERTs — only the verifier writes. | L | `Supabase` · `Neon` · `Swagger` · `Postman` · `dataviz` · `Figma` |
| **Downloadable ghosts & replays (server-fed)** | Extend the v1.1 LOCAL ghost to server-fed: download a rival's or the world #1's tiny tape, bake it to a position buffer on load (one re-sim, then interpolate — no per-frame 4x cost), and race up to 3. Perf-capped via the device matrix. | M | `Supabase` · `Cloudflare` · `verify` · `code-review` |
| **Guest-first accounts & non-regressing cloud save** | Replace localStorage-only save (SAVE_KEY, game.js:39-44) with server-mirrored progress behind the compliance age-gate. Play instantly as an anonymous guest that appears on boards, then MERGE into a real account on sign-in with a field-level non-regressing merge (best=MIN, stars=MAX, unlocked=MAX). | M | `Clerk` · `Supabase` · `Sentry` · `verify` |
| **Edge hosting consolidation** | Move the static shell + API onto ONE edge origin (Cloudflare Pages + Workers) to kill CORS and edge-cache board reads, with GitHub Pages as a zero-cost fallback. The determinism CI gate already lives in v1.2, so this is purely hosting/deploy plumbing. | M | `Cloudflare` · `GitHub` · `Sentry` · `verify` |

<details><summary>Tasks — Child-privacy & compliance track (FOUNDATION, precedes accounts/analytics/push)</summary>

- Add a neutral age-gate on first launch; branch data collection by age band (no behavioral analytics/push for under-age without verifiable consent)
- Write privacy policy + EULA + data-deletion flow; wire consent state into the settings substrate
- Data-minimize the tape/save/analytics schemas; document retention
- Ensure portal + future store submissions can point to compliant flows; verify the age-gate blocks under-age data paths

</details>
<details><summary>Tasks — Server-authoritative verifier (edge replay on proven physics)</summary>

- Package the deterministic physics.js to run headless in a Cloudflare Worker (Vercel Edge alt)
- Re-simulate the tape, compute finish tick, apply rejection rules
- Add Cloudflare KV token-bucket rate-limit, tape-hash dedupe, and Turnstile on first submit
- Wire Sentry to catch any replay divergence (should be zero given the CI gate)
- verify a forged fast time is rejected and an honest one accepted

</details>
<details><summary>Tasks — Anti-TAS / bot detection & segregation (NEW)</summary>

- Fingerprint tapes for superhuman consistency: reaction-time distribution, frame-perfect input clustering, optimality vs human corpus
- Flag statistical outliers for a shadow/unverified board instead of the human ladder
- Add a human-verified tier (behavioral + optional challenge) for top ranks
- Build a labeled corpus from real playtests to tune thresholds; verify a scripted optimal tape is segregated, a human run is not

</details>
<details><summary>Tasks — Performance budget + low-end device gate (NEW, FOUNDATION)</summary>

- Define a target-device matrix (low/mid/high) with a 60fps sim budget
- Add a perf CI gate measuring worst-case frame time (rope + shards + 3 ghosts) on emulated low-end; regressions fail the build
- Add dynamic RENDER-only quality scaling (particle/shard budgets, ghost-render cap) that leaves the deterministic sim untouched
- Add Sentry perf spans around simulate()/render() tagged by device + PHYSICS_VERSION; verify low-end holds 60fps

</details>
<details><summary>Tasks — Global + friends leaderboards with auto-rivals</summary>

- Design schema with a partial covering index on (level_id, physics_version, time_ms); rank via SQL window function
- Enforce RLS: the service-role verifier is the only writer
- Author the OpenAPI spec in Swagger + a Postman mock so client work starts day one
- Add an auto-assigned rival and 'rival beat your time' nudges
- Build board/rank UI from Figma HUD tokens; dataviz rank-delta visuals; Neon branch-per-PR preview boards

</details>
<details><summary>Tasks — Downloadable ghosts & replays (server-fed)</summary>

- Add 'download the #1/rival ghost' per leaderboard row; store tapes in Supabase/R2, edge-cached
- Reuse the v1.1 bake-on-load ghost path; cap simultaneous rendered ghosts per device tier
- verify a downloaded ghost overlays the exact recorded line; code-review the multi-ghost buffer

</details>
<details><summary>Tasks — Guest-first accounts & non-regressing cloud save</summary>

- Integrate Clerk (Google/Apple + anonymous guest) issuing the JWT the verifier checks; gate sign-up behind the age flow
- Mirror save to Supabase keyed by user id; localStorage stays offline authority, syncs on finish + focus
- Implement server-side field-level non-regressing merge so a stale device can't regress a record
- Trigger 'claim your progress' after first 3-star/Level 2 — no login wall in front of the fun
- verify guest->account merge preserves all records; Sentry on auth flows

</details>
<details><summary>Tasks — Edge hosting consolidation</summary>

- Deploy static shell to Cloudflare Pages + API to Workers on one origin (Vercel/Netlify alt, Pages fallback)
- GitHub Actions: Playwright smoke test booting each level via window.__moto (game.js:668)
- Tag GitHub Releases with changelog + PHYSICS_VERSION; release->CI->deploy one chain
- Upload source maps from CI for readable Sentry traces

</details>

**Success metrics:** Age-gate + privacy/EULA/deletion flow live and blocking under-age data paths BEFORE the first account or analytics event; 100% of accepted board times are server-recomputed from a valid tape; forged times rejected; a scripted TAS tape is segregated to the unverified board while human runs pass; Perf CI gate + device matrix hold 60fps worst-case (rope + shards + 3 ghosts) on low-end; render-only quality scaling never alters the sim/tape; Guest->account merge preserves 100% of records across the device matrix; zero CORS errors post-consolidation; Global boards launch on physics FROZEN since v1.3 — no season reset follows acquisition

---

### v1.5 — Live Ops, Meta & Economy
**Theme.** Give players a reason to return tomorrow and a skill-earned meta to chase, on the v1.4 account + revenue foundation, with analytics and i18n scoped realistically.

**Goal.** Stack retention loops on accounts: promote the v1.1 local daily to a server-verified worldwide daily, add streaks and compliant high-signal push, a star-gated world map, style-scaled soft currency + procedural cosmetic garage, skill-feat unlocks and vehicle presets, plus analytics/FTUE and an i18n system scoped for the reality of canvas text rendering.

| Feature | What & how | Effort | Tools |
| --- | --- | :---: | --- |
| **Star-gated world map** | Wrap the level list into scrollable themed worlds gated by total stars banked (starsFor + save.stars, game.js:214), each using a v1.3 biome palette, with a locked art-teased next world pulling players to replay for 3-star times. | M | `Figma` · `higgsfield generate_image` · `Cloudinary` · `Supabase` · `verify` |
| **Server-verified daily + login streak + clean-run flame** | Promote the v1.1 LOCAL daily to a server-verified worldwide daily (one attempt, one board via the verifier), add an escalating login-streak calendar buffing the session style-coin multiplier, and an in-HUD clean-run flame that raises the multiplier and resets on crash. | M | `Cloudflare` · `Vercel` · `Supabase` · `verify` |
| **Compliant web push + offline background sync** | Opt-in push (behind the v1.4 age-gate/consent) reserved for three high-signal events only — streak about to break, rival beat your time, daily is live — plus offline queueing that background-syncs finished runs on reconnect (the SW already exists from v1.1). | M | `Cloudflare` · `GitHub Actions` · `Supabase` · `Sentry` · `code-review` · `verify` |
| **Style-scaled soft currency + cosmetic garage (rewarded-ad funded)** | Earnable coins whose payout scales with style score + margin under the 3-star time — 100% cosmetic, no energy, no pay-to-win, with optional rewarded-ad coin-doublers (v1.3 ads). Because the bike is drawn procedurally, cosmetics are swappable palette/decal/trail params, not a new art pipeline per item. | M | `Supabase` · `Figma` · `higgsfield generate_image` · `Cloudinary` · `verify` |
| **Skill-feat unlocks + swappable vehicle presets** | A roster of bikes/riders unlocked by feats the engine already tracks (cumulative backflips, crash-free clears, air time) — mastery, not wallet. Expose CONFIG as named physics presets (truck = grip/less flip, ghost-bike = low gravity) with rare swap pads; leaderboards are vehicle-namespaced to stay fair. | M | `Supabase` · `higgsfield generate_image` · `Figma` · `verify` |
| **i18n + colorblind/screen-reader completeness (realistically scoped)** | Key strings.js by locale with runtime switching and Intl formatting. Scoped honestly: canvas has no text layout engine, so ship LTR locales + embedded webfonts first and treat RTL/bidi/CJK as a separate, explicitly-budgeted effort — not a throwaway 'true i18n' claim. Colorblind palettes + glyphs already shipped in v1.2; this completes screen-reader coverage of new meta screens. | M | `dataviz` · `Tavily` · `Figma` · `verify` · `code-review` |
| **Retention analytics + FTUE onboarding** | A consented (v1.4 age-gate) event stream POSTed through the Worker into a Supabase events table feeding a difficulty-heatmap + D1/D7 funnel, plus a tuned first three minutes: teach lean/throttle in the Warm-Up level, guarantee an early star, end session one on 'come back tomorrow for your Daily'. | M | `Supabase` · `dataviz` · `artifact-design` · `Linear` · `Sentry` |

<details><summary>Tasks — Star-gated world map</summary>

- Build a scrollable world-map UI (Figma tokens) grouping crafted levels into worlds
- Gate each world behind N total stars using existing starsFor/save.stars
- Apply biome palettes per world; art-tease the next locked world with Higgsfield key art
- Sync unlock state via cloud save; verify gate logic and the replay-for-stars loop

</details>
<details><summary>Tasks — Server-verified daily + login streak + clean-run flame</summary>

- Distribute the date seed from the edge (Cloudflare scheduled Worker/KV); reuse the verifier for a global daily board
- Add an escalating login-reward calendar whose streak buffs the session style-coin multiplier (felt in play, not a popup)
- Add an in-HUD clean-run flame raising the multiplier across crash-free clears, reset on one crash
- verify the same seed yields identical courses across clients and the daily board rejects forgeries

</details>
<details><summary>Tasks — Compliant web push + offline background sync</summary>

- Extend the v1.1 SW with an offline run queue + background sync of tapes/scores on reconnect
- Add opt-in push gated to the three triggers AND to age/consent state
- code-review the SW-vs-PHYSICS_VERSION interaction (stale SW must never upload mismatched tapes)
- verify offline play + deferred upload on a throttled connection

</details>
<details><summary>Tasks — Style-scaled soft currency + cosmetic garage (rewarded-ad funded)</summary>

- Add a coin ledger in Supabase; payout keys off style score + 3-star margin, with an optional rewarded-ad doubler
- Build a garage (Figma tokens) equipping frame color, wheels, decals, rider outfit, flip-trick exhaust trails as canvas params
- Tie unlockable trails to the flip-bonus system so cosmetics reinforce trick play
- Generate seasonal skin variants with Higgsfield via Cloudinary; verify earn->spend->equip

</details>
<details><summary>Tasks — Skill-feat unlocks + swappable vehicle presets</summary>

- Track lifetime feats server-side and map to unlock milestones
- Expose CONFIG as named presets (grippy/floaty/twitchy, truck, ghost-bike)
- Add swap pads + a level beatable in two vehicles for different star lines
- Namespace/normalize boards by vehicle; generate roster art with Higgsfield; verify unlock triggers fire

</details>
<details><summary>Tasks — i18n + colorblind/screen-reader completeness (realistically scoped)</summary>

- Key strings.js by locale with navigator.language detection + Intl time/number formatting (replacing hardcoded fmt game.js:486); persist choice
- Ship LTR locales first with embedded webfonts; scope RTL mirroring + CJK canvas fallback as a separate budgeted milestone (not implied-free)
- Extend the ARIA live region + earcons to the world-map/garage/daily screens
- Use Tavily to source native-quality copy flagged for human review; verify a locale switch + screen-reader flow

</details>
<details><summary>Tasks — Retention analytics + FTUE onboarding</summary>

- Emit batched, sampled events through the Worker into a Supabase table, respecting consent state
- Build a live cohort/funnel/difficulty-heatmap dashboard with dataviz + artifact-design
- Turn Warm-Up into an interactive tutorial using the input-hint system; guarantee a first star
- End session one on an unlock/Daily reveal; track FTUE A/Bs in Linear

</details>

**Success metrics:** D1 retention up materially post-FTUE; tutorial guarantees a first star for >=90% of new players; Server daily is byte-identical worldwide and forgery-rejected; a daily-return cohort visible in the dashboard; Push limited to 3 triggers AND gated to age/consent; offline play + deferred sync verified on a throttled connection; Earn->spend->equip closes; coins scale with style, 100% cosmetic, rewarded-ad doubler optional, zero pay-to-win; LTR i18n + screen-reader shipped; RTL/CJK explicitly budgeted as its own milestone rather than assumed free

---

### v2.0 — Set-Pieces, UGC (with Trust & Safety) & Native Distribution
**Theme.** The platform leap — moderated user-generated levels, cinematic boss chases, viral duels, seasons, endless mode, and native app-store presence with the review-gating compliance handled up front.

**Goal.** Scale content and reach: a companion editor emitting engine-native Course JSON WITH a full moderation/trust-and-safety system (Apple 1.2 gate), a director set-piece layer for boss finales, async ghost duels, live seasons with a reward track, an endless survival mode, and Capacitor/TWA wrappers whose Apple 4.2/COPPA review risks are treated as real work — capped by a launch trailer.

| Feature | What & how | Effort | Tools |
| --- | --- | :---: | --- |
| **UGC moderation & trust-and-safety system (FOUNDATION, precedes the editor)** | Apple guideline 1.2 makes reporting/blocking/EULA a hard review gate for any UGC. Build the trust-and-safety layer FIRST: level + display-name reporting, creator blocking, a moderation queue, automated + manual review, and takedown — before a single user level is publicly browsable. | L | `Supabase` · `verify` · `code-review` · `Tavily` |
| **Community level editor & gallery** | A companion web editor emitting the SAME Course JSON the engine consumes (using the v1.3-hardened generator/validator), backed by accounts + the verifier, with a browse/rate/remix gallery — all flowing through the moderation layer above. | XL | `Replit` · `Lovable` · `Base44` · `Supabase` · `Neon` · `Vercel` · `Figma` · `verify` |
| **Boss / chase set-piece director** | A reusable director layer scripting camera, hazard spawns and a pursuing threat over any course — avalanche (Winter), tidal wave (Pool), reaper (Spooky) — capped with a Higgsfield cinematic. The shareable trailer moments clones lack. | L | `higgsfield generate_video` · `higgsfield generate_image` · `higgsfield generate_audio` · `verify` · `Linear` |
| **Async friend duels (viral loop)** | Send a friend a seeded course + your ghost via a deep link; they race it instantly in guest mode (behind the age-gate), winner takes coins + bragging rights. Built on the ghost tape + a shared blob — no realtime netcode. | M | `Supabase` · `Vercel` · `Cloudflare` · `Canva` · `verify` |
| **Seasons & reward track** | Time-limited 2-4 week themed seasons: reskin the daily + a seeded themed mini-world with a style-locked AI palette, plus a reward track (free cosmetics + optional premium cosmetic tier — no pay-to-win), namespaced by the frozen PHYSICS_VERSION so history stays valid. | L | `higgsfield generate_image` · `Cloudflare` · `Supabase` · `Linear` · `Canva` |
| **Endless / survival mode** | Stream-stitch the v1.3-hardened Course segments into an infinite ribbon with escalating hazard density (reusing the v1.2 dynamic engine), scored on distance, with a distance board and a daily-seeded variant — all on the proven-deterministic generator. | M | `Supabase` · `verify` · `code-review` |
| **App-store wrappers (Capacitor + TWA) with review-risk handled** | Wrap the PWA as native shells — Capacitor for App Store/Play (native Haptics + immersive mode) and a TWA for Play — treating Apple 4.2 minimum-functionality, 1.2 UGC (now satisfied by the moderation layer) and COPPA age-gating as real review work, not one-time engineering. | XL | `GitHub` · `Sentry` · `Linear` · `verify` |
| **Launch trailer + marketing creative** | A 30-45s trailer + vertical shorts, store screenshots, app icon and social art from shared key art, with hooks A/B-tested before commit. | M | `higgsfield generate_video` · `higgsfield virality_predictor` · `Canva` · `Adobe` · `artifact-design` |

<details><summary>Tasks — UGC moderation & trust-and-safety system (FOUNDATION, precedes the editor)</summary>

- Add report/block on levels, names and creators; build a moderation queue with automated pre-screen + manual review
- Add name/text filtering, a creator EULA/agreement, and a takedown + appeal flow
- Rate-limit + reputation-gate publishing; log for abuse handling
- Ensure minors' UGC exposure respects the v1.4 age-gate; verify the report->takedown loop end-to-end

</details>
<details><summary>Tasks — Community level editor & gallery</summary>

- Build the editor as a companion web app (Replit/Lovable/Base44) outputting engine-native Course JSON
- Validate/sandbox user levels (geometry hash, headless-replay playability check from v1.3)
- Add a moderated gallery (browse/rate/remix) backed by Supabase/Neon + Vercel; per-level boards reuse the verifier
- Design editor + gallery in Figma; verify a shared level loads, passes moderation, and posts to its own board

</details>
<details><summary>Tasks — Boss / chase set-piece director</summary>

- Build a director timeline (camera cues, hazard spawns, pursuing-threat speed curve) layered on a course
- Add a chase-threat entity that fails the run on catch, tuned for recoverable panic
- Author one finale per biome; generate cinematic stings/video + boss art with Higgsfield
- verify the chase is beatable and the fail state fires; track as a Linear epic

</details>
<details><summary>Tasks — Async friend duels (viral loop)</summary>

- Generate a shareable duel = seeded course id + ghost tape + deep link
- Open the exact challenge from the link, playable immediately in guest mode
- Resolve winner server-side by comparing verified times; award coins
- Add share cards via Canva; verify a link round-trips into the identical challenge

</details>
<details><summary>Tasks — Seasons & reward track</summary>

- Add a season config (theme manifest + seeded mini-world + reward track) on a scheduled Worker
- Generate seasonal palette/skins with Higgsfield (style-locked); Canva/Adobe for promo
- Build the free + premium-cosmetic reward-track UI; namespace boards by PHYSICS_VERSION
- Track each season as a Linear cycle; verify the reward track grants correctly

</details>
<details><summary>Tasks — Endless / survival mode</summary>

- Stream-generate infinite track by stitching Course segments ahead and recycling behind
- Ramp hazard density/speed with distance using the v1.2 engine
- Add a distance leaderboard + daily-seeded endless variant
- verify infinite generation stays deterministic under a seed; code-review memory recycling

</details>
<details><summary>Tasks — App-store wrappers (Capacitor + TWA) with review-risk handled</summary>

- Add a thin Capacitor layer upgrading to native Haptics while WebAudio keeps working; enrich beyond a thin wrapper to clear Apple 4.2
- Configure a TWA (Bubblewrap) for Play against the deployed origin
- Point store submissions at the v1.4 age-gate + v2.0 moderation/EULA; budget for repeat-rejection cycles
- Wire GitHub Actions to build + sign on tagged releases; Sentry native crash capture; verify install + haptics on a real device

</details>
<details><summary>Tasks — Launch trailer + marketing creative</summary>

- Capture real gameplay; cut the trailer with Higgsfield generate_video (+ upscale_video 4K master)
- A/B opening hooks with Higgsfield virality_predictor before committing
- Produce thumbnails/screenshots/app icon in Canva + Adobe from the key art
- Style the landing/press page with artifact-design

</details>

**Success metrics:** Moderation (report/block/EULA/takedown) live and verified BEFORE any public UGC — Apple 1.2 gate satisfied; Editor emits engine-native Course JSON; a user level loads, passes moderation + validation, and posts to its own board with zero code change; Each biome has a director finale (chase fail-state + cinematic verified); duel deep-links round-trip byte-identical, playable in guest mode; Season cadence sustainable solo (theme + seeded mini-world + reward track in <1 week of art time); endless stays deterministic under a seed; Signed Capacitor + TWA builds clear store review (4.2/1.2/COPPA addressed up front) and pass install/haptics on real devices; trailer hook chosen via virality_predictor

---

## 🧊 Later backlog

- RTL/bidi + CJK canvas text rendering as its own budgeted milestone (deferred out of v1.5's LTR-first i18n because canvas has no layout engine)
- Aimable cannons/launchers & rocket rings — a charge phase where rider lean sets launch angle for a landing-zone skill-shot bonus
- Pressure-plate cause-and-effect: hit a ramp switch to open a gate 200m ahead, rewarding carried speed (a mechanic Moto X3M never explores)
- Weather + time-of-day as a mechanical difficulty lever (rain lowers grip, snow slicks, night masks the world to a headlight cone) with Higgsfield skyboxes
- Water flume 'tubes' — curved buoyant channels physically richer than the franchise's scripted Pool Party slides
- Moon-gravity / space Spooky world reusing the air-flip code with dialed-down gravity for hang-time trickery
- Tilt/gyro steering option with tuned deadzone that auto-disables on sensorless devices
- Customizable/drag-to-place touch control layout with lefty presets saved per device
- 3D hero/marketing bike renders via Higgsfield generate_3d for store and garage showcases
- Org/tournament SSO via WorkOS for school or arcade instances; Turnstile-gated tournament brackets
- Neon branch-per-PR throwaway leaderboards wired into preview environments for every PR
- Difficulty-heatmap-driven auto-tuning of star thresholds and adaptive-cadence crushers from analytics
- Ghost 'coaching' overlay that annotates where the #1 line brakes/leans to teach the optimal route
- Additional web portals beyond the first (CrazyGames/Y8/GameDistribution) once the Poki integration + revenue is proven
- Remix/duet gallery mechanics: fork a top user level and beat the author's ghost in one flow
- Additional crafted-level content packs on the v1.3 authoring pipeline as an ongoing live-ops cadence

## 🧰 Tooling & connector map

| Tool / connector | Used for |
| --- | --- |
| **higgsfield (generate_image / generate_3d / remove_background / upscale_image)** | Source art behind a LOCKED style guide (the real bottleneck is cohesion, not generation): tileable parallax strips, power-of-two terrain tiles, hazard/glyph sprites, cosmetic skins, roster art, PWA icons/splash, hero renders |
| **higgsfield generate_audio** | Looping per-biome/season stems, BPM-clockable rhythm-mode tracks, engine RPM layers, and one-shot SFX (saw, explosion, crack/shatter, splash, chain, gate, finish sting) |
| **higgsfield generate_video / virality_predictor / upscale_video** | Boss/chase cinematics and the launch trailer (4K master), with A/B-tested opening hooks |
| **Cloudinary** | Asset source-of-truth: f_auto/q_auto WebP/AVIF, sprite atlasing, responsive srcset, hashed-URL delivery so art re-optimizes without a code deploy |
| **Cloudflare (Pages + Workers + KV + R2 + Turnstile + Cron)** | One-origin host + edge API, the V8 replay verifier running deterministic physics.js, rate-limit/dedupe/bot-gate, ghost/tape storage, edge-cached boards, scheduled daily/season seeding, and the multi-runtime determinism CI leg |
| **Vercel / Netlify** | Drop-in edge-function alternatives, Cron for the daily, and hosting the gallery/companion services |
| **GitHub (Actions + Releases + Pages)** | CI: the golden-tape determinism gate (lands WITH the tape recorder in v1.2), the low-end perf gate, Playwright smoke tests via window.__moto, signed wrapper builds, source-map upload, and versioned physics-season releases; zero-cost fallback origin |
| **Portal SDKs (Poki / CrazyGames / Y8)** | Primary genre distribution + rewarded-ad/interstitial revenue that funds the edge stack, integrated behind the v1.1 save/leaderboard/ads abstraction seam so their constraints shape architecture early |
| **Supabase** | Primary Postgres: leaderboards (RLS verifier-only writes), the anti-TAS/unverified board tier, non-regressing cloud saves, currency/unlocks, UGC gallery + moderation queue, and consented analytics |
| **Neon** | Postgres alternative whose DB branching gives every PR a throwaway leaderboard for preview environments |
| **Clerk** | Guest-first identity (Google/Apple + anonymous handle) issuing the JWT the verifier checks, gated behind the COPPA/GDPR-K age flow, with guest->account non-regressing merge |
| **WorkOS** | Reserved org/SSO for school or arcade tournament instances; consulted for the compliance/age-gating track |
| **Sentry** | Browser perf spans around simulate()/render() tagged by device + PHYSICS_VERSION (the low-end death-spiral guard), and Worker-side verifier/replay-divergence capture, source-mapped |
| **Swagger + Postman** | OpenAPI contract for verify/leaderboard/cloud-save endpoints, a mock so client work starts day one, and CI contract tests that fail on API drift |
| **Figma** | The DOM settings/HUD design system (started small in v1.1, polished in v1.2) exported as JSON tokens the canvas draw helpers consume, plus per-biome theme token sets and the style-lock guide |
| **Linear** | Epics/cycles for the release train, a templated content-issue per CRAFTED level/biome/season/vehicle carrying the asset + tuning checklist, and FTUE/A-B experiment tracking |
| **Replit / Lovable / Base44** | The companion level-editor web app (emitting engine-native Course JSON) and optional live analytics/retention dashboards reading Supabase |
| **Canva + Adobe** | Store screenshots, thumbnails, app icon, seasonal promo art, and duel share cards from shared key art |
| **Tavily** | Sourcing native-quality localization copy (flagged for human review) and researching COPPA/GDPR-K + portal/store policy for the compliance track |
| **dataviz skill** | WCAG-validated colorblind palettes (baked into the v1.2 hazard render path), the combo/rank/difficulty-heatmap + D1/D7 visuals, and the anti-TAS input-fingerprint distributions |
| **artifact-design skill** | Styling the landing/press page and the retention dashboard shell |
| **verify skill** | Driving each mechanic and service flow end-to-end (control-feel tuning, local ghost, loop entry, momentum transfer, forged-time rejection, TAS segregation, guest->account merge, offline sync, report->takedown) before commit |
| **code-review skill** | The load-bearing refactors: the deterministic-math/fixed-point swap, timestep scaling, moving/inverted-surface collision, the Verlet constraint-solver load, the tape encoder, SW cache-versioning, and the render-only quality scaler |
| **playwright-core** | Headless CI smoke tests booting every level via window.__moto, plus the multi-runtime golden-tape determinism check in-browser |

## ⚠️ Design principles & risks (from the adversarial review)

**Feasibility risks we design around:**
- Cross-platform bit-identical re-simulation is not guaranteed and is the single biggest risk. physics.js uses Math.hypot/cos/sin/atan2 (physics.js:83,174,190,250). IEEE-754 mandates correct rounding for +,-,*,/,sqrt only; transcendental functions are implementation-defined and differ across V8 versions and CPU architectures. Over thousands of ticks these tiny differences diverge, so the browser tape and the Cloudflare-Worker re-sim can produce different finish ticks — false-rejecting honest players or accepting drift. 'Physically impossible to forge, re-sim matches bit-identical' requires fixed-point math or a bundled deterministic transcendental library, a major unscoped rewrite touching every physics line.
- Ghosts are NOT 'nearly free.' Each ghost is a full re-simulation, so racing 3 ghosts means 4x the physics per frame (live + 3), on top of the Verlet constraint solver for ropes and particle systems — on mobile canvas 2D, at a locked 60fps that cannot skip steps. The payload is tiny but the CPU cost is 4 full sims; this is a hard perf cliff on mid/low-end phones.
- The two-sided/inverted contact() rewrite (v1.3 XL) is genuinely destabilizing. contact() currently depenetrates outward (physics.js:142); making it signed/two-sided risks regressing all existing ground collision and PBD stability, and loop/rope stability at variable speed is notoriously finicky. High risk of breaking the whole game's feel for a solo dev, and it forces yet another season-resetting PHYSICS_VERSION bump.
- App-store review is underestimated (v2.0 XL). Thin PWA wrappers hit Apple 4.2 minimum-functionality scrutiny; the UGC gallery triggers 1.2 (must ship reporting/blocking/EULA before review); a young audience triggers COPPA/age-gating. These cause repeat rejections and are not one-time engineering tasks.
- Service-worker cache-versioning against a versioned deterministic physics engine is a footgun: a stale SW serving old game.js/physics.js with a new PHYSICS_VERSION silently produces mismatched or corrupt tapes and merge regressions. SW + offline queue + physics-season versioning interact in exactly the way that produces hard-to-debug determinism bugs.
- 'A new biome in an afternoon at zero art cost' overweights generation and underweights art direction. AI image tools are inconsistent at seamless tiling and locking a cohesive style across dozens of parallax strips, power-of-two terrain tiles, and sprites. Cohesion and consistency — not raw generation — are the hard, time-consuming part.
- 'True i18n over the canvas' with RTL HUD mirroring and CJK fallback is much harder than the roadmap implies. Canvas text has no layout engine; RTL mirroring, bidi, and embedding CJK webfonts for canvas rendering is substantially more work than i18n in a DOM app.
- Overall scope is implausible for a solo/AI dev on the stated cadence. v1.2 alone (deterministic tape, edge V8 verifier, Postgres+RLS, Clerk auth, ghosts, CI determinism gate, edge consolidation) is a multi-month backend program, and v1.3/v2.0 stack multiple L/XL items. The 'live-ops heartbeat / biome-in-an-afternoon' narrative collides with a roadmap that is L/XL-dominated.

**Sequencing rules:**
- The 'rhythm layer nobody else has' is a headline differentiator but is scheduled NOWHERE — BPM-quantized hazards live only in the backlog. The v1.1 hazard conductor carries {path,phase,speed} but no feature actually delivers the musical-sync payoff the vision sells.
- The CI determinism gate (golden-tape replay) is the LAST feature of v1.2, but the tape recorder and server verifier (earlier in v1.2) are built on the assumption that physics is deterministic. The gate must land WITH or BEFORE the recorder, or the entire competitive spine is built on unverified determinism.
- Launching honest global leaderboards in v1.2 immediately before v1.3's XL contact()/inverted-surface rewrite (which bumps PHYSICS_VERSION and resets every season) wastes the competitive launch. The leaderboard-affecting physics rewrites (loops, moving segments, per-surface grip) should be frozen BEFORE, not after, the boards go live — otherwise early seasons are throwaway and the social proof resets right after acquisition.
- Colorblind / shape-coded hazard glyphs are deferred to v1.4, but hazards are (re)drawn in v1.1's hazard conductor. Retrofitting distinct glyphs across every hazard type after they all ship hue-only is strictly more work than doing it once when the render path is being built.
- The DOM settings/persistence hub is the LAST (L) item of v1.1, yet three earlier v1.1 features (juice hooks, haptics, reduced-motion) reference toggles/flags the hub is supposed to own and persist. The settings + persistence foundation should be first in v1.1, not last.
- Trick/combo scoring is deferred to v1.3, but v1.1 already sells a 'style-fed economy' and near-miss/flip juice, and v1.4's currency depends on style score. The scoring substrate is scheduled after two patches that assume it exists. A basic combo/style score should precede or accompany the v1.1 juice work.
- Daily challenge, endless mode (v2.0), and the community editor (v2.0) all rest on a 'turtle-style Course builder' that deterministically generates quality, solvable levels — but no feature ever builds or hardens that generator. It is treated as pre-existing infrastructure across three patches; if it doesn't produce good playable output, daily + endless + UGC all collapse.
- The vision claims 'offline-first PWA,' but v1.1 ships only the manifest + install button while the service worker, offline queue, and background sync are deferred to v1.4. Installing a PWA that cannot yet work offline for three versions contradicts the stated differentiator.

**Quick wins pulled early:**
- Local ghost racing (race your own PB from a locally-stored tape) needs only the tape recorder + playback — no server, no accounts, no verifier. This delivers the biggest retention lever (their own metric: 2x attempts) months before the entire v1.2 edge/auth/verifier stack. Ship a local self-ghost and local best-time chase in v1.1.
- Wiring the dormant juice hooks (slow-mo + hitstop + flash) is literally activating already-declared-but-inert fields — make it the very first thing shipped for an instant, near-zero-cost feel upgrade.
- The music/adaptive audio bed is the single largest session-length lever per the roadmap's own success metric ('zero music today'). Front-load it as the first M in v1.1, not mid-list.
- A basic trick/combo/style score HUD — the engine already detects flips, rear/front contact, and clean landings — is cheap to surface and immediately deepens the loop and feeds the 'style' fantasy. Pull a minimal version into v1.1 instead of waiting for v1.3.
- Shape-coded / colorblind hazard glyphs: do them at build time inside the v1.1 hazard conductor when hazards are drawn, not as a v1.4 retrofit across every hazard type.
- Control remapping is a small keybind-capture change; don't gate it behind the full Figma-designed L settings hub — ship the rebind early even if the polished hub lands later.
- A purely-local, date-seeded daily challenge (no server, no board) is a cheap daily-return hook that can ship as soon as the procedural builder exists, well before the server-verified global daily.
- The PWA manifest + install button (S) is trivial and can ship immediately, though its user impact is low — treat it as a free background task, not a milestone.

**Explicitly tracked so we don't forget:**
- No hand-crafted level design pipeline or volume plan. Moto X3M's appeal is tightly-tuned, surprise-driven crafted levels; this roadmap treats content as 'apply a theme id to existing courses' (reskins) plus a procedural daily/endless. Procedural generation is NOT a substitute for authored set-pieces, and there is no feature that produces a deep bench of crafted levels or a designer-in-the-loop tuning loop.
- No web-game portal distribution (Poki / CrazyGames / Y8 / Game Distribution). This is literally how Moto X3M reached scale. The roadmap's only distribution is the own-PWA plus app-store wrappers in v2.0. Missing the highest-ROI, lowest-friction channel for the genre — and portal SDKs impose ad/leaderboard/save constraints that should shape the architecture from v1.1, not be bolted on.
- No business model / revenue plan. The economy is explicitly '100% cosmetic, no pay-to-win, no energy,' and the only revenue hint is an 'optional premium cosmetic tier' in v2.0 seasons. There is no rewarded-ad or interstitial-on-retry plan (the actual Moto X3M web monetization), so a solo dev funds Cloudflare Workers + Postgres + auth + storage indefinitely with essentially no income.
- No UGC moderation / trust-and-safety system. v2.0's editor 'validates playability' but has no content moderation, level/name reporting, blocking, or abuse handling. Apple guideline 1.2 makes this a hard store-review gate for any app with user-generated content.
- No child-privacy / legal compliance track (COPPA / GDPR-K / age gating). The audience skews young, yet the game adds accounts, analytics event streams, and web push. This is a real store-review and legal blocker that appears nowhere.
- Anti-cheat only defeats time-forgery, not optimal-input (TAS/bot) tapes. A solver can produce a physically-valid, human-plausible-cadence input tape that re-simulates cleanly and is unbeatable. The 'superhuman cadence' heuristic does not catch this, so the #1 spot on every board is farmable by a bot. No detection/segregation plan.
- No core game-feel validation of the driving model itself. The roadmap assumes the base controls are already Moto-X3M-tight ('4 solved toy levels') and only ever adds juice on top. If the throttle/lean/grip feel isn't already class-leading, ghosts and leaderboards save nothing — yet no feature is dedicated to iterating the control feel.
- No explicit performance budget or low-end-device gate. Determinism forbids dropping sim steps, so a weak phone that can't run Verlet rope solve + glass shards + 3 simultaneously re-simulated ghosts at 60fps enters a spiral of death. Only Sentry spans are mentioned; there is no target-device matrix or perf CI gate.

> **Review verdict:** Technically sharp and the determinism-as-moat insight is real, but the plan bets the whole competitive spine on cross-platform bit-identical re-simulation that Math.sin/cos/hypot does not guarantee, front-loads heavy backend before proven fun, and omits the three things a Moto X3M-beater actually needs — crafted-level volume, web-portal distribution, and any revenue — so de-risk determinism (fixed-point) and ship a local-ghost/juice/audio retention loop before building the edge stack.

---

*This roadmap is a living document. Each patch is independently shippable; foundations (settings/persistence substrate, deterministic-math shim + golden-tape CI, level data format, audio bus) intentionally land before the features that depend on them.*
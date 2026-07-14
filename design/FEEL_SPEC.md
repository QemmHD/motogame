I have enough grounding. Note the actual code differs from the FEEL report's premise: the model is **already 5-node** (`rA`, `fA`, `H` chassis triangle + `rW`, `fW` spring-damped wheels), suspension already exists and has already been partly softened (`suspStiff:0.055`, `suspIters:1`, not the `0.28`/`3` the audit quoted). So the work is tuning + consumption, not re-architecting. The spec below reconciles all four reports against the real code.

---

# FEEL & LIFE & DEPTH — Upgrade Spec
Moto Rush X3 (canvas-2D clone). Target: kill the "rotated-PNG-on-paper" read on both the physics and render sides, and make levels demand skill. All references are to `public/physics.js`, `public/game.js`, `public/levels.js` at their current state.

## Reconciliation note (read first)
The "3-point rigid triangle, no suspension" premise in the FEEL report is **wrong for the current code**. `physics.js` is already a 5-node soft body: chassis triangle `rA/fA/H` (`solveChassis`, L109) plus two spring-damped wheels `rW/fW` (`solveSusp`, L123). `wheelSpin`, `rearComp`, `frontComp` are already computed (L103, L161, L203-210). So:
- We do **not** add sprung/unsprung nodes — they exist.
- The bike feels dead for three real reasons: (1) suspension travel is tiny and over-damped so it barely moves; (2) `resolveWheel` (L145) fully depenetrates + drives via a **velocity clamp** (L159), which deletes landing energy and gives instant top speed with no traction/weight-transfer; (3) the renderer (`drawBike`, L489) throws away every live signal and blits one rotated sprite. Fix those three and most of the "alive" gap closes.

---

# (A) BIKE FEEL — physics changes

### A0. Current CONFIG baseline (deltas below are from these)
`suspRest:16, suspMin:4, suspMax:24, suspStiff:0.055, suspDamp:0.07, suspIters:1`; `driveAccel:2950, maxSpeed:1000, restitution:0.05, rollResist:0.6`; `airAccel:13.5, maxAirOmega:9.0, airDamp:0.25`; masses `axle:1.0, wheel:0.8, head:0.6`; `headUp:46` (rider head sits 46px above axle = top-heavy). `iters:6, substeps:6, gravity:1900`.

### A1. Make the existing suspension actually travel (highest FEEL payoff, lowest risk)
Widen travel and let it overshoot so landings visibly squash→rebound.
- `suspRest: 22`, `suspMin: 8`, `suspMax: 40` (was 16/4/24). Now ~14px compression, ~18px droop.
- `suspStiff: 0.09` (slightly stiffer than 0.055 so it returns, but with more travel).
- `suspDamp: 0.05` on compression is fine; the key is **asymmetric damping** (below).
- `suspIters: 1` stays (more iters = re-glues to rest).

**Asymmetric damping** in `solveSusp` (L136-141): the damper currently bleeds `rv` symmetrically. Split by sign of `rv` (rv>0 = extending/rebound, rv<0 = compressing, in chassis-down coords check the sign convention):
```
const zeta = (rv > 0) ? cfg.suspDampRebound : cfg.suspDampComp;   // rebound firmer
```
Set `suspDampComp: 0.04` (soft — let it soak the hit), `suspDampRebound: 0.14` (firm — no pogo). This is the single change that converts "stiff cutout" into "weighted landing." Front slightly stiffer than rear: give front `suspStiff*1.15`, rear `suspStiff*0.9` (rear squats under throttle).

### A2. Soften wheel depenetration + raise restitution (kills the "dead thud")
`resolveWheel` L149 shoves the wheel 100% out of penetration every substep, so the impact never loads the spring.
- L149: `node.x += c.nx * c.pen * 0.6; node.y += c.ny * c.pen * 0.6;` (leave 40% residual for one frame → the spring reads it as compression and transmits it to the chassis).
- `restitution: 0.18` (was 0.05) — a small bounce so the chassis pops rather than absorbing everything positionally.
- Clamp the incoming normal velocity fed to the damper to avoid one-frame spikes on big drops: cap `vn` magnitude to ~1500 px/s before the restitution line (L156).

### A3. Drive as force + traction + wheel angular state (weight transfer, wheelspin, wheelies)
Replace the velocity-clamp drive (L158-162) with a **traction-limited force** whose grip scales with the wheel's current load = spring compression. This is what makes throttle feel analog and makes wheelies/endos emergent.

Add per-wheel angular velocity `b.omegaRear` (real spin, can exceed ground speed) alongside existing `wheelSpin` (keep `wheelSpin` as the render angle, integrate it from `omegaRear`).

In `resolveWheel`, rear/driven branch:
```
// load on this wheel from suspension (rearComp is 0..1, already computed)
const Fz = 0.4 + 0.6 * b.rearComp;                 // normalized load, 0.4..1.0
const groundV = vt;                                 // tangential ground speed
if (input.gas) b.omegaRear += (cfg.driveAccel/cfg.wheelR) * dt;   // spin up freely
const surfV = b.omegaRear * cfg.wheelR;
const slip  = (surfV - groundV) / (Math.abs(groundV) + 60);       // +60 avoids /0
const grip  = clamp(slip * cfg.kSlip, -1, 1);       // rises then saturates
const drive = grip * Fz * cfg.mu * cfg.driveAccel * dt;
vt = Math.min(vt + drive, cfg.maxSpeed);
// bleed wheel spin back toward ground when gripping (traction couples them)
b.omegaRear -= (surfV - groundV)/cfg.wheelR * 0.5 * Fz;
b.wheelSpin += b.omegaRear * dt;
```
New CONFIG: `mu: 1.0, kSlip: 9`. Falloff near top speed: multiply `drive` by `(1 - vt/maxSpeed)**1.5` so acceleration tapers instead of clipping. Result: mash throttle on a steep unloaded face → `omegaRear` runs ahead, `slip` saturates, `drive` drops → **visible wheelspin + real cost** (dust in §B), and hard grip when the rear is loaded (squatted).

**Weight transfer for free:** because drive force is applied at the rear contact patch (below+behind the CoM), and the chassis can now pitch on the softened springs (A1), throttle automatically lifts the front. No scripting. Add a small extra pitch impulse on gas to make it reliable: on `input.gas`, add a tiny upward velocity to `fA` and downward to `rA` (± ~8 px/s·dt) — a few px of pitch under power. Cap so a held wheelie balances ~35-45° rather than looping: restoring torque toward neutral proportional to pitch above 30°.

### A4. Lower the center of mass (fixes top-heavy twitchiness)
`headUp:46` with `headMass:0.6` puts the heaviest-ish node way up high. Rebalance so CoM sits low and ~40% forward of the rear axle:
- `axleMass`: rear axle heavier than front. Split the single `axleMass` into `rearAxleMass:1.2, frontAxleMass:0.9`.
- `headMass: 0.35` (was 0.6) — rider stops dominating rotation.
- Keep `headUp:46` for the crash hitbox/visual, but it no longer anchors the mass.

### A5. Rider weight-shift input (skill ceiling; makes hard levels fair)
`leanFwd/leanBack` currently only drive air rotation (L222). On the **ground**, also nudge the CoM: forward lean adds a downward impulse to `fA` (load front, nose drops — save an over-rotation), back lean loads `rA` (wheelie/loft). ±10-14px of authority. This is the Trials-style control that lets you make levels demand technique instead of full-gas.

### A6. Input shaping (responsive, not twitchy)
- **Throttle ramp:** don't apply full `driveAccel` on frame 1. Track `b.throttle` easing toward the held target at ~5/s (full in ~200ms); multiply drive by it.
- **Air control** already bounded (`airAccel 13.5`, `maxAirOmega 9.0`) — good. Reduce `maxAirOmega` to ~7.0 and add speed-scaling: at high speed cut air authority ~20% so fast sections aren't over-rotatey.
- **Landing forgiveness:** treat touchdown as clean if chassis-vs-slope angle within ±25° (not exact). Buffer lean/gas inputs ~90ms across touchdown so a tap just before landing registers. Forgiveness is what lets levels be hard without feeling cheap.

### A7. Keep jumps/flips/level-completability working (guardrails)
The air solver (`layoutChassisAir`, L177) rigidly rebuilds chassis nodes each substep — that's fine and **must stay** for crisp flips; don't let the new springs run the show in air (wheels already hang correctly, L230-237). Risks and mitigations:
- Softer suspension + restitution changes launch velocities → **jump arcs shift**. Levels are geometry-tuned to the current arc (`levels.js` header). After A1-A3, **re-measure the full-gas jump arc** (instrument: log peak height + gap cleared at full throttle from a flat ramp) and either (a) rescale the `jump()` gap/land defaults by the measured ratio, or (b) keep arcs and retune. Do this before touching level difficulty (§C).
- Add an **auto-recover / min-progress check**: if the softened landings ever trap the bike (stuck oscillating), the existing crash+checkpoint respawn covers it; verify respawn still fires.
- Gate every physics constant behind CONFIG so you can bisect if a level becomes uncompletable.

---

# (B) VISUAL LIFE — render changes (canvas-2D)

Ordered by impact ÷ effort. Items 1-5 use data the physics already publishes; **zero physics change**.

### B1. Draw the bike as parts, consuming live physics (the biggest single win)
`drawBike` (L489) blits one sprite rotated by `b.angle`. Replace with a composited draw using `bikePoints(b)`:
- **Wheels:** draw `IMG.wheel` (already loaded, currently only used in the menu, L633) twice — at `pts.rear` and `pts.front`, each `ctx.rotate(b.wheelSpin)`. Stop baking wheels into `bike.png`. This alone kills ~50% of the cardboard read.
- **Suspension travel:** the axle nodes (`pts.rearAxle/frontAxle`) and wheel nodes (`pts.rear/front`) now separate visibly (A1). Draw a fork/swingarm line from axle to wheel; the wheel sprite sits at the wheel node, so squash/extension is automatic. Alternatively scale the chassis sprite vertically by `1 - 0.18*rearComp` anchored at the axle line.
- **Rider:** draw a torso sprite pinned at the seat (midpoint of axle line, offset up) leaning by weight-shift (A5) + opposite `aOmega` in air (rider hangs back on backflips), pitching forward under gas. Even a 2-part torso+head reads as alive. Optional 2-bone IK for arms (hands pinned to a bar point) later.
- **Engine idle vibration:** when `input.gas && b.grounded`, jitter the chassis draw origin ±0.6px·`sin(t*90)`. Gate behind `reduced()`.

### B2. Parallax layers (kill the single-plane look)
`drawSky` (L415) is the only background layer (one `sky.jpg` at `cam.x*0.25`). Add a layer table drawn back-to-front, each tiled like the existing sky loop with its own `offsetX = cam.x * speed`:
```
far mountains   speed 0.08   (haze-tinted, pre-blurred)
mid hills       speed 0.20
near dune band  speed 0.45
[ PLAY PLANE    speed 1.0 ]  (terrain, bike, hazards)
fg occluders    speed 1.6   (blurred, drawn AFTER drawBike)
```
- **Free midground from your own terrain:** sample the course heightfield, offset up+back, fill as flat dark-blue silhouettes at speed 0.4-0.6. Instant ridgelines, zero new art.
- **Atmospheric perspective without per-frame cost:** pre-bake each distant layer once into an offscreen canvas with `ctx.filter='blur(3px)'` + a low-alpha blue-grey `fillRect` overlay; blit the cached canvas each frame.
- **Foreground occluders** (highest depth payoff): a few blurred dark shapes (grass tufts, fence post) drawn after the bike at speed ~1.6, low alpha + `blur(2px)`, streaking past.

### B3. Dynamic contact shadow (grounds every jump)
Replace the fixed ellipse (L491-492). Project the bike down to terrain Y under `b.x`; scale shadow width/alpha by airborne height (`b.y` vs ground Y): on ground → tight/dark; high in air → wide/faint/offset. Cheap, immediately reads as "off the ground."

### B4. Vignette + data-driven day/dusk palette
- **Vignette:** after everything, reset transform, radial gradient transparent→`rgba(0,0,0,0.35)`, one `fillRect`. Focuses the frame instantly.
- **Palette per level:** make `drawSky`'s two `addColorStop` colors (L419) read from `level.palette = {top,bottom,haze,sun}`. L1 midday blue → L4 dusk orange/violet. Tint parallax haze from the same palette. Near-zero cost, big mood delta.
- **Rim light:** draw the bike sprite a second time offset 1-2px toward `sun`, warm-tinted, `globalCompositeOperation='lighter'`, low alpha. Pops silhouette off background.

### B5. Persistent tire tracks + richer particles
- **Tire tracks (decal layer):** ring buffer of `{x,y,alpha}` stamped at the rear contact when `b.grounded`; draw as a dark fading polyline in world space under the terrain-detail pass. Most makes the track feel *driven on*.
- **Particle types:** current particles are flat `ctx.arc` (`drawParticles` L500). Add: **dirt clods** (large opaque brown rotating rects, gravity+tumble) on hard landings/wheelspin, alongside light dust; **sparks** on saw proximity (reuse `minD2` from `scanHazards` L339) as short yellow line segments with `lighter` blend, ~0.15s life; **exhaust puffs** on gas rise. Set `globalCompositeOperation='lighter'` for `fire`. Upgrade `dust` from arc to a pre-baked soft radial-gradient sprite (same count, softer look).
- **Wheelspin dust** wired to A3: emit dust when `slip` saturates — a *felt* visual cost to over-throttling.

### B6. Camera tilt + directional punch + speed cues
`updateCamera` (L385) already does look-ahead + speed zoom (strong foundation).
- **Roll on air:** add `cam.roll` easing toward a fraction of `aAngle`/`airRot` while airborne, clamp ±10°; apply `ctx.rotate(cam.roll)` inside `worldTransform` (L404) before the world translate. Flips feel kinetic.
- **Directional impact punch:** current shake (L406) is symmetric random. Add a one-shot camera kick along the impact normal on landing/crash, spring back — reads as weight not noise.
- **Speed cues:** above a speed threshold, draw a few screen-space horizontal streaks at edges + 2-3 decreasing-alpha ghost copies of the chassis (motion trail). Gate behind `reduced()`.
- **Handheld sway:** tiny continuous sin offset (~1.5px, 0.5Hz) when moving, `reduced()`-gated.

### B7. Terrain life
`drawTerrain` (L441) is uniform rock-fill + fixed 42px dirt cap. Add: top-to-bottom gradient over the fill (light surface → dark below) for form; grass/pebble sprites stamped along the top polyline at intervals jittered by a **deterministic hash of x** (no frame shimmer), clipped to `visibleSlice` (already computed L434); 2-3 dirt strata bands with wavy boundaries; vary the existing bright top-stroke alpha by slope-facing (brighter toward sun).

---

# (C) DIFFICULTY & MECHANICS

Current state: every hazard is static (`updateHazards` L333 only spins saws cosmetically); geometry is deliberately sized to the full-gas arc (`levels.js` header, `jump()` L47); star times are loose (`[24,34,48]` etc.); checkpoints even (~every 2 obstacles). Full-gas beats everything. Fixes in three tiers.

### C1. Engine change: time-parameterized hazards
Add a level clock `t` and an optional `h.update(t, dt)` mutating `h.x/h.y/h.state`; call it in `updateHazards` before `scanHazards`. `scanHazards` (L334) already re-reads `h.x/h.y` each frame, so moving hazards is nearly free. Add kill-volume support (reuse the `crashR` circle test) and a trigger `zone` that flips hazard state on entry.

### C2. New hazard types (ranked by impact ÷ effort — all timing windows, not walls)
1. **Swinging pendulum / wrecking ball:** `x = ax + L*sin(θ0 + A*cos(ω t))`, swept through the racing line. Builder: `.pendulum({dx,anchorY,len,amp,period,phase})`. Archetypal X3M killer.
2. **Vertical crusher/piston:** `y = topY + travel*max(0, sin(ω t))`, gap only during "up" phase → forces stop-and-go. `.crusher({dx,period,travel,dwell})`.
3. **Saw on a track:** extend `saw()` with `{path:'h'|'v', amp, period}` so it's *on* the line part of its cycle.
4. **Moving platform:** a 2-point chain translated each frame (terrain is already multi-chain, `buildTerrain` handles arrays; `contact()` resolves by nearest segment+normal, so a moving chain drops in). `.movePlatform({...})`.
5. **Collapsing/tipping bridge:** platform chain that starts falling `triggerT = touchT + 0.15s` after the rear wheel touches → forces continuous throttle. `.collapseBridge({w,delay,fallAccel})`.
6. **Rising water/lava:** level-level kill-line rising at constant speed → soft time limit. `risingHazard({startY,speed,fromCheckpoint})`.
7. **Cannon/launch pad:** on contact call `setVel()` on wheel nodes (API exists, L88) for a fixed impulse — sometimes required, sometimes over-launches into a hazard. `.cannon({dx,impulseX,impulseY})`.
8. **Timed laser/gate:** kill-bar blinking on a period. Cheap gauntlet finisher.
9. **Falling boulder/dropper:** spawns above on a trip-zone, falls with gravity. Punishes lingering.

Every dynamic hazard must be **telegraphed** with a `deco` (anchor chain, warning stripe, shadow) so it's readable before commit — this is what keeps hard *fair*.

### C3. Geometry that demands skill (no engine change, just `Course` tuning)
- **Overshoot traps:** after a big ramp, a *short* landing with a saw/spike wall just past it → full-gas overshoots; must brake before the ramp. Removes "hold gas to win." Add a `.brakeZone()` telegraph deco.
- **Forced-flip gaps:** widen the gap beyond the flat-clearable arc + a low saw ceiling over it → backflip is the only way through.
- **Blind drops:** `.ledge(dropH)` ending terrain abruptly to an unseen angled landing; must pre-set rotation. Camera must not pre-pan down.
- **Uphill landings:** landings that slope *up* (currently down/forgiving) → must land nose-high or stuff the front.
- **Loops / wall-rides:** the multi-chain terrain + normal-based contact already support past-vertical geometry; add `.loop(radius)` emitting a circular chain. Requires min entry speed → natural speed-management + commitment challenge.
- **Un-rollable whoops:** make some `bumps()` taller/tighter so full-speed bucks you; must feather. Exploits the new suspension rhythm.
- **Preload ramps:** faces where compressing then releasing at the lip (now real, A1) gives extra pop needed for the next gap — a 3-star skill ceiling.

### C4. Choreography (combine, don't isolate)
Build **gauntlets** of 3-5 hazards where the exit state of one is the entry state of the next, spaced ~1 bike-length apart with *conflicting* demands. Worked climax (~95% mark, one checkpoint before, none inside):
1. Full-gas into a **loop** (min entry speed → can't be timid) →
2. exit into a **short ramp + low saw ceiling over a spike gap** → forced backflip →
3. land on a **collapsing bridge** (tips 0.15s after touch) → must keep gas →
4. bridge end is a **blind drop to an uphill landing guarded by a pendulum** → set nose-up on faith + arrive at far swing →
5. short flat → **finish**, optional big jump to flip for 3-star.

### C5. Difficulty curve
**Within a level** (Trials/X3M shape): Intro 0-20% (new mechanic once, safe, checkpoint right after) → Development 20-70% (combined/sped-up/blind, checkpoints after each hard beat) → Climax gauntlet 70-95% (hardest combo, **wider checkpoint spacing** — one before, none inside) → Finish 95-100% (victory flourish). Make checkpoint spacing a **variable dial** (currently even ~2 obstacles): tight early, wide in gauntlets.

**Across levels** (one new mechanic each, then remix): L1 gas+small jumps (keep) → L2 speed management (overshoot traps, uphill landings) → L3 pendulum → L4 crushers + moving platforms → L5 collapsing bridges + cannons → L6 loops + wall-rides → L7 rising water/timed → L8+ full choreography + blind drops + tightest 3-star.

### C6. Flip economy + 3-star pressure
- Wire the already-detected flips (`lastFlips`, `flipEventId`, L216) into scoring: each completed flip subtracts ~0.5s from finish time.
- Re-tune star arrays so 3-star requires flipping over gaps you could clear flat and carrying speed where the safe line brakes. Tighten the 3-star column (current `[13,19,27]`…`[24,34,48]` are too generous) until a no-flip cautious run *cannot* hit it. 1-star = completion, 2-star = clean-but-cautious, 3-star = risky flip-heavy line.

---

# (D) ORDERED BUILD PLAN

Sequenced for max felt improvement earliest, with the risky re-tune isolated.

**Phase 0 — Instrumentation (before touching anything).** Add a debug overlay logging `rearComp/frontComp`, `omegaRear`, jump peak height + gap cleared at full gas from a flat ramp, and current arc. You need the baseline arc to protect completability.

**Phase 1 — Physics feel core (§A1, A2, A3).** Softer/wider/asymmetric suspension → soft depenetration + restitution → force+traction+wheel-spin drive with load-scaled grip. **Highest risk to completability** (changes arcs). Do all three, then re-measure the arc and rescale `jump()` defaults (A7). Test: every existing level still completable full-gas *and* with technique; landings visibly squash; throttle on a wall spins the rear.

**Phase 2 — Render consumes the physics (§B1, B3, B5-dust).** Parts-based bike (wheels/suspension/rider), dynamic shadow, wheelspin dust. Zero physics risk, kills the cardboard read, and validates Phase 1 visually. This is the biggest perceived-quality jump.

**Phase 3 — Cheap depth & mood (§B2, B4, B7).** Parallax layers (+ free ridgeline), vignette, per-level palette, terrain scatter. Pure render, low risk, high polish.

**Phase 4 — Mass/CoM + input feel (§A4, A5, A6).** Lower CoM, weight-shift input, throttle ramp, landing forgiveness, air-control tuning. Moderate risk (re-verify completability). Unlocks technique-gated design.

**Phase 5 — Dynamic hazard engine + first mechanic (§C1, C2 items 1-3).** Level clock + `h.update` + kill volumes; ship pendulum, crusher, tracked saw. Test each in isolation in a sandbox level first. Medium risk (new collision paths).

**Phase 6 — Choreography, curve, scoring (§C3-C6).** Geometry skill-traps, gauntlets, variable checkpoints, per-level mechanic ladder, flip time-bonus, tightened stars. Author + playtest-heavy, low code risk.

**Phase 7 — Finishing polish (§B6, B1-IK, C2 items 4-9).** Camera roll/punch/speed-blur, 2-bone rider IK, moving platforms/collapsing bridges/loops/rising water/cannons.

**Cross-cutting testing:**
- **Completability gate (automated):** a headless full-gas + a scripted "technique" run per level that must reach the finish; run on every physics-constant change. Bisect via CONFIG if it fails.
- **Arc regression:** assert measured full-gas arc stays within ±X% or level defaults get rescaled.
- **`reduced()` gate** on shake, sway, speed-blur, vibration, ghost trails (accessibility).
- **Perf:** pre-bake parallax/dust/rim sprites to offscreen canvases; never run `ctx.filter` per-frame in the hot loop.

**Riskiest items, flagged:** Phase 1 (arc-shifting physics), Phase 5 (moving-solid collision), and loops/wall-rides in Phase 7 (past-vertical contact + centripetal min-speed). Each gets a throwaway sandbox level before touching shipped content.
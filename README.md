<p align="center">
  <img src="docs/cover.png" alt="Moto Rush X3 cover art" width="900">
</p>

<h1 align="center">MOTO RUSH X3</h1>

<p align="center"><strong>Send it. Land it. Prove it.</strong></p>

<p align="center">
  An original momentum-driven motorcycle stunt racer built for instant browser play,
  recoverable machine routes, expressive landings, and runs you can verify.
</p>

<p align="center">
  <a href="https://qemmhd.github.io/motogame/"><strong>PLAY THE CURRENT LIVE BUILD</strong></a>
  &nbsp;&middot;&nbsp;
  <a href="docs/releases/v1.5.0.md">v1.5 update</a>
  &nbsp;&middot;&nbsp;
  <a href="ROADMAP.md">30-update roadmap</a>
  &nbsp;&middot;&nbsp;
  <a href="docs/README.md">documentation hub</a>
</p>

<p align="center">
  <img alt="v1.5.0 release candidate" src="https://img.shields.io/badge/release-v1.5.0%20candidate-bb8612">
  <img alt="15 courses" src="https://img.shields.io/badge/courses-15-ff5a3c">
  <img alt="15 verified Gold Runs" src="https://img.shields.io/badge/Gold%20Runs-15%2F15-ffd23e">
  <img alt="offline PWA" src="https://img.shields.io/badge/PWA-offline--ready-2b9f71">
  <img alt="Canvas 2D" src="https://img.shields.io/badge/runtime-Canvas%202D-2764d9">
</p>

---

## Gold Standard gallery

| Every course has a reference | Machinery reacts to the rider |
|:---:|:---:|
| ![R&D Yard with Gold reference badges](docs/screenshots/v1.5/update-v15-golden-menu.png) | ![Lift Logic sensor-controlled platform](docs/screenshots/v1.5/update-v15-trigger-lift.png) |

| Art and collision stay aligned | The finish proves the run |
|:---:|:---:|
| ![Collision proxy development overlay](docs/screenshots/v1.5/update-v15-collision-debug.png) | ![Gold reference verified result](docs/screenshots/v1.5/update-v15-golden-verified.png) |

<p align="center">
  <img src="docs/screenshots/v1.5/update-v15-mobile.png" alt="Moto Rush X3 mobile course storefront" width="390">
</p>

## The ride

Moto Rush X3 is a browser-first 2D motorcycle game about carrying momentum through hand-built terrain. The bike has physical wheels, suspension, lean, airborne rotation, landing grades, crash state, and surface response. Courses mix readable safe ground with faster stunt opportunities and deterministic machinery.

The **v1.5.0 Gold Standard** release candidate makes every current course independently reproducible. Fifteen checked-in recovery tapes are recorded by the real browser runtime and replayed twice by the release gate. The game exposes those references as Gold Runs, while still keeping the player's own last-run replay separate.

### What makes it ours

- **Momentum Machines:** freight decks, lifts, saw patrols, pendulums, crushers, Nitro pressure waves, boost rails, ice, and bouncy membranes can change a line without replacing rider skill.
- **Readable recovery:** checkpoints and forgiving ground routes keep experimentation fast; failures restore exact hazard and platform timelines.
- **Physical feedback:** perfect, clean, rough, and slam landings affect momentum and trigger distinct score, camera, particle, haptic, and audio responses.
- **Proof-first competition:** compact fixed-tick input tapes carry build, physics, and course identities, then verify their finish tick and authoritative state hash.
- **Original trail anthology:** Canyon Run, Stormworks, and R&D Yard use original names, layouts, systems, tuning, art direction, and presentation.

## Current game

- **15 handcrafted courses** across Canyon Run, Stormworks, and R&D Yard.
- **15 repository Gold Runs** available from the results screen and marked on course cards.
- **One authoritative run session** shared by browser play and deterministic tests for bike physics, hazards, moving ground, scoring, checkpoint recovery, crashes, and finishes.
- **Solid moving platforms** with swept top collision, stable bike carry, bounded inherited velocity, and sensor-triggered local timelines.
- **Crash theater** with a deterministic segmented bike/rider ragdoll plus a static reduced-motion alternative.
- **Last-run player proofs** stored locally and clearly rejected when missing, damaged, oversized, level-mismatched, or version-incompatible.
- **Five-band engine response** driven by road speed, load, grounding, and throttle, with landing and stunt audio.
- **Keyboard, Pointer Event, touch, and gamepad input** with simultaneous controls, cancellation cleanup, pause/focus handling, haptics, and reduced motion.
- **Installable offline PWA** with a literal, versioned, test-audited service-worker cache.
- **Local progression** for unlocks, stars, best time, best score, settings, and the most recent completed proof per course.

## What is new in v1.5

### Gold Runs for all 15 courses

`public/golden-tapes.json` contains one browser-recorded recovery reference for each current course. The verifier launches a clean local browser, confirms compatibility and catalog identity, replays every token twice, and rejects any mismatch in finish state, ticks, time, score, recoveries, or browser errors.

### Sensor-controlled machinery

Lift Logic now teaches the first triggered moving deck. A dormant platform remains solid at its authored base pose. Crossing its track sensor begins local motion tick zero, produces a clear cue, and records activation state in checkpoint and replay proof data.

### Authoritative restart contract

`public/run-session.js` owns the fixed-step lifecycle. Full restarts rebuild authored state. Checkpoint retries restore hazards plus exact platform activation, previous/current poses, and motion phase. Browser presentation consumes plain events instead of reimplementing scoring and rules.

### Collision audit view

The development overlay shows terrain segments, wheel/head circles and sweeps, hazard proxies, platform rectangles, checkpoint lines, and the finish trigger over their rendered models. Data is finite, capped, detached, and covered by alignment/immutability tests.

Read the full, screenshot-backed release record in [docs/releases/v1.5.0.md](docs/releases/v1.5.0.md).

## Controls

| Action | Keyboard | Touch / pointer |
|---|---|---|
| Accelerate | Up arrow or `W` | Gas button |
| Brake / reverse | Down arrow or `S` | Brake button |
| Lean back / backflip | Left arrow or `A` | Left rotate button |
| Lean forward / frontflip | Right arrow or `D` | Right rotate button |
| Pause | `Esc` or `P` | Pause button |
| Restart level | `R` | Retry button / paused menu |
| Retry checkpoint after crash | Space, Enter, or primary action | Tap the crash overlay |
| Replay the player's finish | Results screen | Replay button |
| Play repository reference | `G` on results | Gold Run button |
| Toggle collision proxies | `C` in development mode | Development-only |

## Run locally

The shipped game has no compilation step. Serve `public/` through HTTP:

```powershell
python -m http.server 8080 --directory public
```

Open `http://127.0.0.1:8080/`.

Install the pinned repository tooling and run the full gate:

```powershell
npm install
npm test
```

The v1.5 gate covers:

- 3 asset/offline subtests;
- 44 deterministic system subtests;
- all 15 authored physics/rules routes;
- all 15 Gold Runs replayed twice in clean browser contexts.

Focused commands:

```powershell
npm run test:session
npm run test:kinematics
npm run test:debug
npm run test:goldens
```

Useful development routes:

- `?dev&level=13` — Freight Flight.
- `?dev&level=14` — Lift Logic and the sensor deck.
- `?dev&level=15&autoplay` — deterministic Proof Circuit smoke input.
- `?dev&level=14&debug=collisions` — aligned collision overlay.
- `?dev&touch` — forced touch layout.

## Project reference

| Section | Purpose |
|---|---|
| [Documentation hub](docs/README.md) | Release, QA, screenshot, architecture, and handoff index |
| [v1.5 release brief](docs/releases/v1.5.0.md) | Current player-visible and technical update with images |
| [Golden run QA](docs/qa/GOLDEN_TAPES.md) | Exact 15-course proof catalog and regeneration policy |
| [Screenshot archive](docs/screenshots/README.md) | Versioned visual progress instead of overwritten images |
| [30-update roadmap](ROADMAP.md) | Dependencies, promises, status, evidence, and acceptance gates |
| [Changelog](CHANGELOG.md) | Permanent chronological release record |
| [Project state](docs/PROJECT_STATE.md) | Canonical current branch/build pickup note |
| [Architecture](docs/ARCHITECTURE.md) | Runtime modules, fixed-step flow, and invariants |
| [Feel specification](design/FEEL_SPEC.md) | Bike feel and feedback targets |
| [Asset inventory](design/assets.csv) | Art-production tracking |

## Repository layout

```text
public/                 Shipped game, PWA shell, simulation modules, levels, assets, Gold Runs
tools/                  Deterministic systems, route gates, browser generator, replay verifier
docs/releases/          Screenshot-backed release briefs
docs/qa/                Reproducible QA records and policies
docs/screenshots/       Versioned desktop, gameplay, debug, proof, and mobile captures
design/                 Feel specification and production asset inventory
.github/                Test-gated Pages workflow and contribution templates
```

## Project information

| | |
|---|---|
| **Current candidate** | v1.5.0 — Gold Standard |
| **Course count** | 15 across three worlds |
| **Reference coverage** | 15/15 repository recovery tapes, each verified twice |
| **Format** | Static HTML, CSS, Canvas 2D, and native JavaScript modules |
| **Distribution** | GitHub Pages / installable PWA |
| **Canonical game** | <https://qemmhd.github.io/motogame/> |
| **Persistence** | Browser `localStorage`; no account or backend required |
| **Target** | Desktop and mobile browsers |

## Release-candidate honesty

`v1.5.0` describes this repository branch. The public play link may remain on an earlier production build until the pull request is reviewed, merged to an eligible branch, published by GitHub Pages, and smoke-tested at the canonical URL.

Gold Runs are deterministic automation recovery references, not claims of clean human mastery or balanced star times. The R&D Yard is still a focused three-course lab. Current platforms are axis-aligned one-way decks. Safe/apex human tape pairs, wheelie balance feedback, richer surface audio, force zones, breakable terrain, more worlds, PB ghosts, challenge links, and Trail Forge remain on the roadmap.

## Originality promise

Moto Rush X3 learns from broad side-scrolling motorcycle and stunt-racing conventions, but it does not decompile competitors or copy proprietary code, assets, audio, UI layouts, exact tracks, or timing data. Its mechanics, code, names, layouts, tuning, visuals, and documentation are created for this project.

## Credits

Created and directed by [QemmHD](https://github.com/QemmHD). Engineering and production progress is kept in this repository so every future update can resume from reviewable code, tests, images, and written state.

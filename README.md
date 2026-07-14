<p align="center">
  <img src="docs/cover.png" alt="Moto Rush X3 cover art" width="900">
</p>

<h1 align="center">MOTO RUSH X3</h1>

<p align="center"><strong>Send it. Land it. Prove it.</strong></p>

<p align="center">
  An original momentum-driven motorcycle stunt racer with physical landings,
  reactive machinery, deterministic run proofs, and instant browser play.
</p>

<p align="center">
  <a href="https://qemmhd.github.io/motogame/"><strong>PLAY THE CURRENT LIVE BUILD</strong></a>
  &nbsp;&middot;&nbsp;
  <a href="docs/releases/v1.6.0.md">v1.6 update</a>
  &nbsp;&middot;&nbsp;
  <a href="ROADMAP.md">30-update roadmap</a>
  &nbsp;&middot;&nbsp;
  <a href="docs/README.md">documentation hub</a>
</p>

<p align="center">
  <img alt="v1.6.0 Smooth Ride candidate" src="https://img.shields.io/badge/release-v1.6.0%20Smooth%20Ride-ff5a3c">
  <img alt="15 courses in 3 worlds" src="https://img.shields.io/badge/courses-15%20in%203%20worlds-2764d9">
  <img alt="15 verified Gold Runs" src="https://img.shields.io/badge/Gold%20Runs-15%2F15-ffd23e">
  <img alt="76 deterministic system tests" src="https://img.shields.io/badge/system%20tests-76%2F76-2b9f71">
  <img alt="offline-ready PWA" src="https://img.shields.io/badge/PWA-offline--ready-6c52b8">
</p>

---

## Smooth Ride gallery

<p align="center">
  <img src="docs/screenshots/v1.6/update-v16-performance-live.png" alt="Moto Rush X3 live performance telemetry during a run" width="900">
</p>

| Measured on the desktop route | Measured at mobile DPR 2 |
|:---:|:---:|
| ![Desktop performance profile](docs/screenshots/v1.6/update-v16-performance-desktop.png) | ![Mobile performance profile](docs/screenshots/v1.6/update-v16-performance-mobile.png) |

| Rotation-safe controls | Left-handed controls |
|:---:|:---:|
| ![Landscape rotation with controls safely reset](docs/screenshots/v1.6/update-v16-rotation-safe.png) | ![Left-handed touch controls in play](docs/screenshots/v1.6/update-v16-left-hand-play.png) |

<p align="center">
  <img src="docs/screenshots/v1.6/update-v16-left-hand-settings.png" alt="Moto Rush X3 left-handed control setting" width="420">
</p>

| 320 px standard controls | 320 px left-handed controls |
|:---:|:---:|
| <img src="docs/screenshots/v1.6/update-v16-narrow-controls.png" alt="Disjoint standard touch targets at 320 by 568" width="240"> | <img src="docs/screenshots/v1.6/update-v16-narrow-left-hand.png" alt="Disjoint left-handed touch targets at 320 by 568" width="240"> |

## The ride

Moto Rush X3 is a browser-first 2D motorcycle game about carrying momentum through hand-built terrain. Its bike has physical wheels, suspension, lean, airborne rotation, graded landings, crash recovery, and distinct surface response. Every course offers readable safe ground, faster stunt lines, and deterministic machinery that rewards timing without replacing rider skill.

The **v1.6.0 Smooth Ride** candidate hardens the experience around the physics. Effects now reuse bounded storage, frame health is measurable instead of guessed, and one extracted input state owns simultaneous keyboard, pointer, gamepad, and development commands. Cancellation, focus loss, visibility changes, and screen rotation all have explicit recovery paths.

### What makes it ours

- **Momentum Machines:** freight decks, sensor lifts, saw patrols, pendulums, crushers, Nitro pressure waves, boost rails, ice, and bouncy membranes reshape a line while preserving player agency.
- **Readable recovery:** checkpoints and forgiving ground routes keep experimentation fast; retries restore exact hazard and platform timelines.
- **Physical feedback:** perfect, clean, rough, and slam landings affect momentum and trigger distinct score, camera, particles, haptics, and audio.
- **Proof-first competition:** compact fixed-tick input tapes carry build, physics, and course identities, then verify their finish tick and authoritative state hash.
- **Original trail anthology:** Canyon Run, Stormworks, and R&D Yard have original names, layouts, systems, tuning, art direction, and presentation.

## Current game

- **15 handcrafted courses** across three original worlds: Canyon Run, Stormworks, and R&D Yard.
- **15 repository Gold Runs**, one for every course, available from results and marked directly on course cards.
- **One authoritative run session** shared by browser play and deterministic tests for bike physics, hazards, moving ground, scoring, checkpoint recovery, crashes, and finishes.
- **Reactive solid platforms** with swept top collision, stable bike carry, bounded inherited velocity, and sensor-triggered local timelines.
- **Crash theater** with a deterministic segmented bike-and-rider ragdoll plus a static reduced-motion alternative.
- **Last-run player proofs** stored locally and clearly rejected when missing, damaged, oversized, level-mismatched, or version-incompatible.
- **Five-band engine response** driven by road speed, load, grounding, and throttle, with landing and stunt audio.
- **Keyboard, Pointer Event, touch, and gamepad input**, including simultaneous controls, interruption cleanup, remappable command metadata, left-handed touch layout, haptics, and reduced motion.
- **Installable offline PWA** with a literal, versioned, test-audited service-worker cache.
- **Local progression** for unlocks, stars, best time, best score, settings, and the most recent completed proof per course.

## What is new in v1.6

### Bounded effects that reuse memory

Dust, debris, smoke, sparks, confetti, score popups, and tire tracks run through fixed-capacity pools instead of growing arrays and per-frame filters. The complete presentation budget is a hard **636 live items**: 384 particles, 32 popups, and 220 tracks. Saturation deterministically reuses the oldest slot, and reset clears active state without reallocating pool storage.

### Frame health you can inspect

A fixed-ring telemetry module records frame time, simulation ticks, catch-up pressure, clamped time, viewport changes, and effect-pool activity without allocating a new sample object each frame. Development telemetry reports FPS, mean, p50, p95, p99, maximum frame time, slow frames, effect peaks, reuse, and evictions.

The final clean local headless Chrome gate recorded **1.00 ms desktop main-loop work p95** against a 20 ms regression budget and **0.81 ms mobile DPR 2 work p95** against a 25 ms budget. Browser pacing is reported separately so a hosted runner's scheduling does not masquerade as game workload. These figures are reproducible automation evidence from the current development machine, not physical-device certification.

### Interruption-safe input

Ride commands now pass through an extracted DOM-free state machine. It resolves keyboard, multiple pointers, gamepad snapshots, and development input into one stable command view. Pointer cancel, lost capture, window blur, hidden tabs, and orientation changes clear held state so a rider cannot remain stuck on gas or lean after an interruption.

The responsive gate also checks the narrow 320 × 568 layout: every touch target remains inside the viewport and opposing Gas/Brake or Lean zones cannot overlap. Connected gamepads are sampled once per rendered frame, and unchanged samples do not create diagnostic-event churn.

### Left-handed touch play

The accessibility setting can mirror the touch clusters without changing the ride model. Layout changes and screen rotation invalidate stale pointer ownership before play resumes, preserving predictable input in either orientation.

### Cached presentation work

Reusable gradients, camera accumulators, ragdoll lookup state, and bounded effect iteration remove avoidable hot-path garbage while leaving authoritative fixed-step physics and Gold Run compatibility separate from presentation.

Read the screenshot-backed release record in [docs/releases/v1.6.0.md](docs/releases/v1.6.0.md), or inspect the exact profiling method and budgets in [docs/qa/PERFORMANCE.md](docs/qa/PERFORMANCE.md).

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

Touch players can select the standard or left-handed layout from Settings.

## Run locally

The shipped game has no compilation step. Serve `public/` through HTTP:

```powershell
python -m http.server 8080 --directory public
```

Open `http://127.0.0.1:8080/`.

Install the pinned repository tooling and run the complete release gate:

```powershell
npm ci
npm test
```

The v1.6 gate covers:

- 3 asset and offline subtests;
- 76 deterministic system subtests;
- all 15 authored physics and rules routes;
- all 15 Gold Runs replayed twice in clean browser contexts, for 30 replay passes;
- 2 repeatable browser performance and input profiles: desktop and mobile DPR 2.

Focused commands:

```powershell
npm run test:session
npm run test:kinematics
npm run test:input
npm run test:effects
npm run test:performance
npm run test:browser-performance
npm run test:goldens
```

Useful development routes:

- `?dev&level=13` — Freight Flight.
- `?dev&level=14` — Lift Logic and its sensor deck.
- `?dev&level=15&autoplay` — deterministic Proof Circuit smoke input.
- `?dev&level=14&debug=collisions` — aligned collision overlay.
- `?dev&level=14&perf` — live frame and effect telemetry.
- `?dev&touch` — forced touch layout for desktop inspection.

## Project reference

| Section | Purpose |
|---|---|
| [Documentation hub](docs/README.md) | Release, QA, screenshot, architecture, and handoff index |
| [v1.6 Smooth Ride brief](docs/releases/v1.6.0.md) | Current player-visible and technical update with images |
| [Performance QA](docs/qa/PERFORMANCE.md) | Browser profiles, p95 budgets, method, and evidence limits |
| [Golden Run QA](docs/qa/GOLDEN_TAPES.md) | Exact 15-course proof catalog and regeneration policy |
| [Screenshot archive](docs/screenshots/README.md) | Versioned visual progress instead of overwritten images |
| [30-update roadmap](ROADMAP.md) | Dependencies, promises, status, evidence, and acceptance gates |
| [Changelog](CHANGELOG.md) | Permanent chronological release record |
| [Project state](docs/PROJECT_STATE.md) | Canonical current branch and build pickup note |
| [Architecture](docs/ARCHITECTURE.md) | Runtime modules, fixed-step flow, and invariants |
| [Feel specification](design/FEEL_SPEC.md) | Bike feel and feedback targets |
| [Asset inventory](design/assets.csv) | Art-production tracking |
| [ISC license](LICENSE) | Use, modification, and distribution terms |

## Repository layout

```text
public/                 Shipped game, PWA shell, runtime modules, levels, assets, Gold Runs
tools/                  Deterministic systems, route gates, browser profiles, replay verifier
docs/releases/          Screenshot-backed release briefs
docs/qa/                Reproducible QA records, measurements, and policies
docs/screenshots/       Versioned desktop, mobile, gameplay, debug, and proof captures
design/                 Feel specification and production asset inventory
.github/                Test-gated Pages workflow and contribution templates
```

## Project information

| | |
|---|---|
| **Current candidate** | v1.6.0 — Smooth Ride |
| **Course count** | 15 across three worlds |
| **Reference coverage** | 15/15 repository recovery tapes, each verified twice |
| **Effects ceiling** | 636 live items across particles, popups, and tracks |
| **Format** | Static HTML, CSS, Canvas 2D, and native JavaScript modules |
| **Distribution** | GitHub Pages / installable PWA |
| **Canonical game** | <https://qemmhd.github.io/motogame/> |
| **Persistence** | Browser `localStorage`; no account or backend required |
| **Target** | Desktop and mobile browsers |

## Release-candidate honesty

`v1.6.0` describes this repository branch. The public play link may remain on an earlier production build until the pull request is reviewed, merged to an eligible branch, published by GitHub Pages, and smoke-tested at the canonical URL.

The performance numbers above come from the documented local headless Chrome profiles. They protect against repeatable regressions; they do not replace physical-device testing across different chipsets, thermal states, browsers, or refresh rates. Gold Runs are deterministic automation recovery references, not claims of clean human mastery or final star-time balance.

The R&D Yard remains a focused three-course lab, and current moving platforms are axis-aligned one-way decks. Safe/apex human tape pairs, wheelie balance feedback, richer surface audio, force zones, breakable terrain, more worlds, personal-best ghosts, challenge links, and Trail Forge remain on the roadmap.

## Originality promise

Moto Rush X3 learns from broad side-scrolling motorcycle and stunt-racing conventions, but it does not decompile competitors or copy proprietary code, assets, audio, UI layouts, exact tracks, or timing data. Its mechanics, code, names, layouts, tuning, visuals, and documentation are created for this project.

## Credits

Created and directed by [QemmHD](https://github.com/QemmHD). Engineering and production progress stays in this repository so every future update can resume from reviewable code, tests, images, measurements, and written state.

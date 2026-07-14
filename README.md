<p align="center">
  <img src="docs/cover.png" alt="Moto Rush X3 cover art" width="900">
</p>

<h1 align="center">MOTO RUSH X3</h1>

<p align="center"><strong>Send it. Flip it. Beat the clock.</strong></p>

<p align="center">
  An original, momentum-driven 2D stunt racer built for fast restarts, wild machinery,
  and runs that feel better every time you learn the trail.
</p>

<p align="center">
  <a href="https://qemmhd.github.io/motogame/"><strong>PLAY NOW</strong></a>
  ·
  <a href="ROADMAP.md">30-update roadmap</a>
  ·
  <a href="CHANGELOG.md">What changed</a>
  ·
  <a href="docs/PROJECT_STATE.md">Developer pickup</a>
</p>

---

## Ride the trail, conduct the machine

Moto Rush X3 is a browser-first motorcycle physics game. Balance the bike across hand-built terrain, preserve momentum through landings, find faster stunt lines, and turn hazardous machinery into part of the route.

The v1.3 release candidate expands the project from six Canyon Run courses to a 12-course campaign with a new Stormworks page. It also adds the collision and deterministic rules foundation needed for larger future worlds, replays, moving platforms, rider crashes, and player-made trails.

## Screenshots

| Store cover | In-game development capture |
|:---:|:---:|
| ![Moto Rush X3 store cover](docs/cover.png) | ![Moto Rush X3 gameplay](docs/gameplay.png) |

## Current game

- **12 handcrafted courses** across Canyon Run and Stormworks.
- **Physical three-node bike simulation** with wheel contacts, suspension feedback, angular control, flips, crashes, checkpoints, and timed finishes.
- **Connected machine hazards** including patrol saws, pendulum weights, piston crushers, spikes, and explosive Nitro crates.
- **Readable surface behaviors** for dirt, ice, boost rails, and bouncy membranes.
- **Multiple ways to play** with keyboard, mouse, pointer-event multi-touch, pause handling, vibration, reduced motion, and installable PWA support.
- **Offline-ready release** with an audited service-worker precache and a single versioned cache source.
- **Local progress** for unlocked levels, best times, stars, settings, and high scores.

## What is new in v1.3

### Stormworks campaign preview

Six new original levels—Boostline, Pendulum Pass, Cold Circuit, Blast Foundry, Piston Works, and Stormbreak—combine moving machinery, new surfaces, explosions, and mixed-system finales.

### Better collisions and bike feedback

Terrain contacts now carry surface metadata, ignore degenerate segments, support runtime enable masks, and recover safely from shallow underside contact. Landing force is measured before depenetration, clean flips are validated on landing, and camera/audio logic uses bike-center velocity rather than one spinning wheel.

### Deterministic machine rules

Hazards move from the simulation tick instead of wall-clock time. Swept collision checks reduce high-speed tunneling, and Nitro crates have deterministic fuse, blast, kill-core, and launch-wave behavior without mutating level definitions.

### A real release gate

`npm test` now verifies public assets, offline precache coverage, rules behavior, terrain contacts, all 12 terrain routes, all 12 hazard-aware routes, idle stability, finite physics, and bounded speed. Pull requests test first; release branches publish only after that gate passes.

See the complete release record in [CHANGELOG.md](CHANGELOG.md).

## Controls

| Action | Keyboard | Touch / pointer |
|---|---|---|
| Accelerate | Up arrow or `W` | Gas button |
| Brake / reverse | Down arrow or `S` | Brake button |
| Lean back | Left arrow or `A` | Left rotate button |
| Lean forward | Right arrow or `D` | Right rotate button |
| Pause | `Esc` or `P` | Pause button |
| Restart | `R` after a crash | Tap to respawn |

## Run locally

The shipped game has no build step. Serve `public/` through any static HTTP server:

```powershell
python -m http.server 8080 --directory public
```

Then open `http://127.0.0.1:8080/`.

Run the complete release gate:

```powershell
npm test
```

Useful developer routes:

- `?dev&level=7` launches a specific one-based level.
- `?dev&level=8&autoplay` adds deterministic test input.
- `?touch` forces touch controls for layout testing.

## Project reference

| Document | Purpose |
|---|---|
| [ROADMAP.md](ROADMAP.md) | The next 30 numbered updates, dependencies, player value, and acceptance gates |
| [CHANGELOG.md](CHANGELOG.md) | Permanent release-by-release record of completed work |
| [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md) | Exact handoff state, known gaps, commands, and next priorities |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Runtime modules, data flow, invariants, and extension guides |
| [design/FEEL_SPEC.md](design/FEEL_SPEC.md) | Bike-feel targets and tuning reference |
| [design/assets.csv](design/assets.csv) | Art inventory and production tracking |

## Repository layout

```text
public/       Shipped Canvas game, PWA shell, rules, physics, levels, and assets
tools/        Headless physics/rules/release verification and capture helpers
docs/         Store images, architecture, and current developer handoff
design/       Feel specification and art inventory
.github/      Test-gated GitHub Pages publishing workflow and PR checklist
```

## Project information

| | |
|---|---|
| **Current candidate** | v1.3.0 — Stormworks Foundation |
| **Format** | Static HTML, CSS, Canvas 2D, and native JavaScript modules |
| **Distribution** | GitHub Pages / installable PWA |
| **Canonical game** | https://qemmhd.github.io/motogame/ |
| **Persistence** | Browser `localStorage`; no account or backend required |
| **Target** | Desktop and mobile browsers |

## Originality promise

Moto Rush X3 takes inspiration from the broad side-scrolling motorcycle stunt genre, but its code, systems, names, level layouts, tuning, visuals, and roadmap are built from first principles for this project. The project does not decompile competitors or copy proprietary source code, art, audio, UI layouts, exact tracks, or timing data.

## Credits

Created and directed by [QemmHD](https://github.com/QemmHD). Ongoing engineering and production work is recorded in this repository so every future update can resume from an accurate, reviewable state.

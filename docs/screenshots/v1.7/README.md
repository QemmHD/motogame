# v1.7.0 Screenshot Record

These are inspected local Chrome captures of the Moto Rush X3 v1.7.0 **Vector Weave** candidate. They were rendered from the real repository Canvas at fixed development ticks by `node tools/capture-v17.mjs`; the capture fails on page or console errors.

| File | Output | Fixed scene | What it records |
|---|---:|---:|---|
| `update-v17-vector-weave-hero.png` | 1280 × 720 | Run tick 89 | Clean Loft Line gameplay: bike, magenta woven field, two compact loom heads, optional sky deck, recovery terrain, adjacent fields, and normal HUD. |
| `update-v17-collision-looms.png` | 1280 × 720 | Run tick 89 | Collision overlay aligned to the Loft Line rectangle, bike circles/sweeps, terrain, platform, checkpoint, finish, and all three bounded Loom proxies. |
| `update-v17-mobile-loom.png` | 780 × 1688 PNG from a 390 × 844 DPR 2 profile | Run tick 54 | Flow Assist in portrait with the bike centered, direction ribbons readable, and four touch controls inside the viewport. |
| `update-v17-reduced-motion.png` | 1280 × 720 | Run tick 89 | The same Loft Line framing with Reduced Motion active and the woven chevrons frozen at a fixed phase. |

## Gallery

<p align="center">
  <img src="update-v17-vector-weave-hero.png" alt="Vector Weave Loft Line Kinetic Loom gameplay" width="900">
</p>

| Exact collision geometry | Reduced Motion field |
|:---:|:---:|
| ![Kinetic Loom collision rectangles and vectors](update-v17-collision-looms.png) | ![Static Kinetic Loom chevrons under Reduced Motion](update-v17-reduced-motion.png) |

<p align="center">
  <img src="update-v17-mobile-loom.png" alt="Flow Assist and touch controls at 390 by 844 DPR 2" width="300">
</p>

## Reproduction

From the repository root:

```powershell
node tools/capture-v17.mjs
```

The script starts the exact `public/` deployment boundary on a loopback-only ephemeral server, blocks service workers, launches an installed Chromium-family browser, starts level 16 with deterministic development input, advances to the selected field, synchronizes the camera, freezes only presentation time, and reads the Canvas at device-pixel resolution. It does not composite fake geometry, HUD values, or test results.

Manual inspection routes remain available:

```text
http://127.0.0.1:8080/?dev&capture&autoplay&level=16
http://127.0.0.1:8080/?dev&capture&autoplay&level=16&debug=collisions
http://127.0.0.1:8080/?dev&capture&autoplay&touch&level=16
```

## Review result and evidence boundary

- All four PNGs were inspected at full resolution on 2026-07-13.
- The visible field bounds, labels, arrow directions, steel heads, bike, terrain, deck, HUD, and touch controls are readable in their intended profiles.
- The debug field rectangle coincides with the rendered Loft Line boundary and its acceleration arrow stays clipped to that rectangle.
- The Reduced Motion frame preserves direction without moving the ribbon phase.
- No browser chrome, account data, filesystem paths, or unrelated windows appear.

These images prove only the visible local candidate states shown. Deterministic correctness comes from the system/Gold gates; physical-device performance, production hosting, service-worker replacement, audio/haptics, and store approval remain separate checks.

# v1.8.1 Finish Forge Capture Record

Captured: **2026-07-14**

These four files are real deterministic Canvas captures of the local v1.8.1 candidate. They are not concept art and do not prove that the public Pages URL serves this build.

## Gallery

<p align="center">
  <img src="update-v181-finish-forge-hero.png" alt="Finish Forge desktop receipt with three stars and five result actions" width="900">
</p>

| Focus rail | Reduced Motion |
|:---:|:---:|
| ![Focused Gold Run action with a visible rail](update-v181-focused-action.png) | ![Static immediately completed Finish Forge receipt](update-v181-reduced-motion.png) |

<p align="center">
  <img src="update-v181-mobile-finish.png" alt="Finish Forge receipt at 390 by 844 and DPR 2" width="300">
</p>

## Fixed scenes

| File | Canvas output | Bytes | Staged intent | Finish state SHA-256 | PNG SHA-256 |
|---|---:|---:|---|---|---|
| `update-v181-finish-forge-hero.png` | 1280 × 720 | 1,154,772 | Level 1, net `17.25`, three stars, 1,500 points, Next focused, all five actions available | `26316e641653c48a1016e8b20459344786d30bfb6164f17ca6c107528d3f49e9` | `b3bce8fc2a569dea051af2ae7d143eb493997e7d001106700645337da43f9aee` |
| `update-v181-focused-action.png` | 1280 × 720 | 1,148,070 | Level 8, net `1:04.90`, Gold Run focused, visible focus treatment | `0e88be5e3326503ee793df25fd1e2b168c151eb28b5eab0ad2f4166b111242a5` | `7f3fcf2d866f8d910bbc84413297c230982cb32197ed802d357633b7c9ae96f4` |
| `update-v181-mobile-finish.png` | 780 × 1688 from 390 × 844 DPR 2 | 1,175,789 | Level 15, net `7.92`, Retry focused, complete portrait receipt and actions | `faa89c0fb952bb74b109d4fd65b1606fb79d3b8ba805f2c4ece8960108184601` | `c6ffb3160712937690f56fea0e040d7dff9cd9b52ecf9d45ddb1454a190e4272` |
| `update-v181-reduced-motion.png` | 1280 × 720 | 1,151,398 | Level 16, net `6.80`, Menu focused, only three legal actions, instant static ceremony | `b1fb5b00a2cc883fbc1c2d9be4a8712cfdc02fa3d42f3579d07056db712fc483` | `104beaaad751c3de7f77b9ce915483729d18fecb3c65186413acb79afce738ee` |

The state digest is computed from the staged finish/report/focus/viewport contract. It identifies the intended runtime scene; it is separate from the PNG file digest.

## Determinism method

`node tools/capture-v181.mjs --write`:

1. starts a temporary server from the exact `public/` deployment boundary;
2. opens a fresh browser context with service workers blocked for each pass;
3. stages an authoritative finish through development-only hooks;
4. validates build, report arithmetic, score receipt, stars, action legality, focus, semantic output, viewport, DPR, and Reduced Motion state;
5. freezes presentation, resets the Canvas text probe, and renders one complete frame;
6. captures the backing Canvas instead of browser chrome;
7. repeats each scene in a second independent context and compares every pixel/channel;
8. rejects page, console, request, response, state, text, geometry, or raster disagreement.

The recorded candidate pass produced **0 changed pixels and 0 maximum channel delta** for all four scene pairs.

## Full-resolution review

- **Hero:** the complete gross/credit/net hierarchy, score receipt, PB/proof/next metadata, three star rivets, and five actions are readable without covering the course finish marker.
- **Focus:** the focused action is distinguishable by structure and contrast rather than color alone; surrounding actions remain legible.
- **Mobile:** the 390 × 844 CSS-pixel composition keeps the receipt and enabled targets inside the viewport at DPR 2 without overlapping buttons.
- **Reduced Motion:** the receipt is fully revealed immediately, confetti is absent, and the legal three-action layout remains balanced.

## Evidence limits

These captures prove the named staged Canvas composition and exact repeatability on the recorded browser. They do not prove physical touch accuracy, real gamepad behavior, screen-reader usability, GPU/driver consistency, installed-PWA cache replacement, production hosting, or subjective readability on every device. Those checks remain separate release gates.

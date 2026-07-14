# v1.8.0 Crash Theater Screenshot Record

These four inspected files are real Canvas output from the unmerged v1.8.0 candidate. They document the code-native 17-part Splitline crash rig, its exact QA proxies, portrait framing, and Reduced Motion alternative; they are not concept art or evidence that the public Pages URL already serves v1.8.

## Gallery

<p align="center">
  <img src="update-v18-crash-hero.png" alt="Moto Rush X3 17-part Splitline Crash Theater hero" width="900">
</p>

| Exact ragdoll proxies | Static Reduced Motion alternative |
|:---:|:---:|
| ![Ragdoll circles, sweeps, links, contacts, and impact metrics](update-v18-ragdoll-proxies.png) | ![Static Splitline pose with fixed crash camera](update-v18-reduced-motion.png) |

<p align="center">
  <img src="update-v18-mobile-crash.png" alt="Crash Theater cause card at 390 by 844 and DPR 2" width="300">
</p>

## Fixed capture state

Run from the repository root:

```powershell
node tools/capture-v18.mjs
```

The harness opens clean local Chrome contexts with service workers blocked, stages the original **CHAIN HAMMER** mace profile on level 8 **Pendulum Pass**, advances 33 presentation ticks (`0.55` seconds), and freezes the review frame. Dynamic scenes reach ragdoll pose tick `66`; the Reduced Motion scene remains at pose tick `0`. Session tick is `33`, run tick is `0`, and all scenes contain the exact ordered 17-part rig.

| Scene | Browser viewport | Output | Pose ticks | Raw contacts | Peak impact | State SHA-256 |
|---|---:|---:|---:|---:|---:|---|
| Hero | 1280 × 720 @1 | 1280 × 720 | 66 | 256 | 371.7 | `a2c11b7ff81e9da6300995559629c651167c8a4f49d543f56d26a5f4e35ceb53` |
| Collision proxies | 1280 × 720 @1 | 1280 × 720 | 66 | 256 | 371.7 | `0183fec5d878de9b157e9d706b6d9c5ee75bde4d664af05e2e76a34f0189bc3f` |
| Mobile card | 390 × 844 @2 | 780 × 1688 | 66 | 256 | 371.7 | `e344f4042d4ba689739576ebae95c8c4fa62562828cffd280e94c3be1cfb1998` |
| Reduced Motion | 1280 × 720 @1 | 1280 × 720 | 0 | 0 | 0 | `290f65036893970810f3c71e9fa579b53cd15fdb8d18cc26ef274b6ac6e4053b` |

## File integrity

| File | Bytes | SHA-256 |
|---|---:|---|
| `update-v18-crash-hero.png` | 1,766,269 | `072CCCC13DEDD652B4C231C098E390544D405310F538B74DDDCBF45A33A2B651` |
| `update-v18-ragdoll-proxies.png` | 1,738,973 | `57C45A3DAA533717EEC831850A4A965F7AB2F3F4C970CA86BCAC08D20FBDF98A` |
| `update-v18-mobile-crash.png` | 2,064,638 | `214321430D13D8E952690530CBD91E3BC7A4B24ED0FC1084B0966C47866C9BE8` |
| `update-v18-reduced-motion.png` | 1,771,813 | `602BA95F2F3854A173CBE7065F06A471BD7D0FD942F94F28555B528D874F0FDA` |

## Determinism and review method

Each scene is captured twice in independent contexts. The harness pins the ambient clock, `Math.random()`, and animation-frame progression used by non-authoritative background presentation, then checks identical staged metadata and state hashes. Its raster comparator permits at most eight changed pixels with a maximum per-channel delta of eight to avoid failing on microscopic renderer variation. The final recorded run matched all four pairs at **zero changed pixels and zero channel delta**.

The harness fails on page errors, console warnings/errors, failed requests, HTTP 4xx/5xx responses, wrong viewport/DPR, wrong cause/card, wrong part count, moving frozen state, or mismatched deterministic metadata. All four final PNGs were inspected at full resolution on 2026-07-14. The desktop hero retains a readable bike/rider silhouette and retry card; debug circles, sweeps, links, and bounds align with the pose; the portrait card stays inside the canvas; Reduced Motion keeps the static cause/retry story with no impact transients.

## Evidence limits

- These are local automated Chrome captures, not physical-device certification.
- GPU/compositor behavior, physical multitouch/gamepad paths, audio, haptics, thermals, browser chrome, and installed-PWA behavior still require device smoke testing.
- The cause was staged through a development-only hook; this record validates presentation, not the authority of a live hazard strike.
- Service workers were blocked so cached files could not hide a missing dependency; production cache replacement and offline relaunch remain unverified until an eligible deployment.
- The collision overlay is development QA, not a player-facing mode.

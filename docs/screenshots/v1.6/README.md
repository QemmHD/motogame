# v1.6.0 Screenshot Record

These images are real local Chrome captures of the v1.6.0 repository runtime. They document the **Smooth Ride** release candidate and remain versioned so future releases do not overwrite the evidence.

| File | View | What it records |
|---|---|---|
| `update-v16-performance-live.png` | 1280 × 720 landscape | Proof Circuit during live play with the Smooth Ride Lab reporting frame percentiles, ticks, backlog, effects, input, viewport, DPR, and rotation. |
| `update-v16-performance-desktop.png` | 1280 × 720 landscape | Three-star Proof Circuit completion while the diagnostic panel shows bounded effect creation and no eviction. |
| `update-v16-performance-mobile.png` | 390 × 844 portrait, DPR 2 profile | Mobile layout under active play with the telemetry panel and touch controls visible. |
| `update-v16-rotation-safe.png` | 844 × 390 landscape, DPR 2 profile | Post-rotation paused state, resized canvas, neutral input counters, and one recorded rotation. |
| `update-v16-left-hand-settings.png` | 1688 × 780 landscape | Settings with Left-hand Controls enabled. |
| `update-v16-left-hand-play.png` | 780 × 1688 portrait | Left-handed play layout with Gas/Brake on the left and Lean controls on the right. |
| `update-v16-narrow-controls.png` | 320 × 568 portrait | Final standard 320 px minimum-width layout with visibly separated command circles. |
| `update-v16-narrow-left-hand.png` | 320 × 568 portrait | Final minimum-width left-handed layout with Gas/Brake left and Lean right. |

## Gallery

| Live performance | Completed run |
|:---:|:---:|
| ![Live desktop performance overlay](update-v16-performance-live.png) | ![Desktop level completion and effect telemetry](update-v16-performance-desktop.png) |

| Rotation safety | Left-hand setting |
|:---:|:---:|
| ![Paused rotated viewport](update-v16-rotation-safe.png) | ![Left-hand controls enabled in settings](update-v16-left-hand-settings.png) |

| Mobile telemetry | Left-hand portrait play |
|:---:|:---:|
| <img src="update-v16-performance-mobile.png" alt="Mobile performance overlay" width="300"> | <img src="update-v16-left-hand-play.png" alt="Left-hand portrait controls" width="300"> |

| 320 px standard targets | 320 px left-hand targets |
|:---:|:---:|
| <img src="update-v16-narrow-controls.png" alt="Separate standard targets at 320 by 568" width="240"> | <img src="update-v16-narrow-left-hand.png" alt="Separate left-hand targets at 320 by 568" width="240"> |

## Evidence boundary

The captures show the live UI states used during local browser QA. They do not by themselves prove performance on physical phone hardware, production hosting, service-worker cache behavior, audio/haptics, or store approval. Numeric acceptance comes from [`docs/qa/PERFORMANCE.md`](../../qa/PERFORMANCE.md), and physical-device plus production Pages smoke testing remains open.

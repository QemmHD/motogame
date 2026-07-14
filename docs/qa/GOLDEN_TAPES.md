# Golden Run QA

Source manifest: [`public/golden-tapes.json`](../../public/golden-tapes.json)

Compatibility identity:

| Field | Value |
|---|---|
| Manifest schema | `1` |
| Replay schema | `1` |
| Runtime build | `1.6.0` |
| Physics | `physics-3` |
| Course generator | `course-3` |
| Route class | `recovery` |

Manifest SHA-256 for this candidate: `368D4728F9D60F9A07C1375AF3B9D5B18FEC8200A030633CC2679A2DB7701C08`.
The v1.6 regeneration was required by the intentional build-compatibility bump. Physics remains
`physics-3`, course generation remains `course-3`, and every finish tick, run tick, time, score,
recovery count, and authoritative state hash stayed equal to the reviewed v1.5 catalog.

## Current reference catalog

| # | Course | World | Finish tick | Run tick | Time | Score | Recoveries |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | Warm-Up | Canyon Run | 565 | 565 | 9.42s | 6,360 | 0 |
| 2 | Air Time | Canyon Run | 922 | 922 | 15.37s | 5,180 | 0 |
| 3 | Whoops & Woes | Canyon Run | 1,047 | 1,047 | 17.45s | 5,255 | 0 |
| 4 | Danger Zone | Canyon Run | 1,046 | 908 | 17.43s | 6,254 | 1 |
| 5 | Cliffhanger | Canyon Run | 938 | 938 | 15.63s | 15,786 | 0 |
| 6 | Grand Finale | Canyon Run | 1,425 | 1,286 | 23.75s | 7,830 | 1 |
| 7 | Boostline | Stormworks | 496 | 496 | 8.27s | 3,820 | 0 |
| 8 | Pendulum Pass | Stormworks | 4,020 | 716 | 67.00s | 6,809 | 13 |
| 9 | Cold Circuit | Stormworks | 552 | 552 | 9.20s | 7,520 | 0 |
| 10 | Blast Foundry | Stormworks | 2,000 | 624 | 33.33s | 11,472 | 6 |
| 11 | Piston Works | Stormworks | 1,299 | 611 | 21.65s | 2,165 | 2 |
| 12 | Stormbreak | Stormworks | 4,068 | 1,029 | 67.80s | 11,331 | 12 |
| 13 | Freight Flight | R&D Yard | 898 | 559 | 14.97s | 2,040 | 2 |
| 14 | Lift Logic | R&D Yard | 773 | 506 | 12.88s | 934 | 2 |
| 15 | Proof Circuit | R&D Yard | 407 | 407 | 6.78s | 2,754 | 0 |

`Finish tick` counts every recorded fixed tick, including crash/restart ticks. `Run tick` is the restored machine timeline at the finish and therefore can be smaller when checkpoint recovery occurred.

## What the verifier proves

For every manifest entry, the verifier:

1. Validates the manifest schema, catalog order, field types, and unique IDs.
2. Decodes the replay token and matches schema, build, physics, course, level, tick count, finish tick, and state hash.
3. Starts a clean browser context with service workers blocked and no external network dependency.
4. Confirms the runtime course name/world catalog still matches the manifest.
5. Replays the tape to `finished` with `replayVerified === true`.
6. Matches replay tick, run tick, elapsed time, net finish time, score, and recovery count.
7. Repeats the same tape a second time and compares the complete reported result.
8. Fails on any browser page error or divergence.

## Reproduction

```powershell
npm install
npm run test:goldens
```

The tool auto-detects Chrome, Chromium, or Edge. A specific browser can be selected without changing the repository:

```powershell
$env:MOTORUSH_BROWSER = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:goldens
```

## Regeneration policy

Do not regenerate merely to make a mismatch disappear. First determine whether the change is intentional and reviewed. A new manifest is expected when any of these compatibility identities or authoritative semantics change:

- `public/version.js` build version;
- `PHYSICS_VERSION`;
- `COURSE_VERSION` or level geometry;
- fixed-step input ordering;
- scoring, checkpoint, respawn, platform activation, or finish state;
- proof snapshot fields or quantization.

After an intentional change, run `npm run generate:goldens`, inspect the manifest diff and recovery counts, then run the full `npm test` gate. Clean human safe/apex tapes must use a separate route classification; they must not be mislabeled as these automation recovery references.

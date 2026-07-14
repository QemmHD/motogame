## Summary

Describe the player-facing result and the systems/content changed.

## Why

Explain the problem, design intention, or roadmap gate this work addresses.

## Player impact

- What becomes better or newly possible?
- What existing behavior could regress?
- Which device/input/layout paths were checked?

## Verification

- [ ] `npm ci --ignore-scripts` and `npm test`
- [ ] Relevant browser playtest
- [ ] Desktop layout checked
- [ ] Mobile/touch layout checked when presentation or input changed
- [ ] Offline/update behavior checked when public runtime files changed

List exact commands, fixtures, routes, and results here.

## Project record

- [ ] CHANGELOG.md records the completed work
- [ ] docs/PROJECT_STATE.md reflects the current handoff
- [ ] ROADMAP.md status/gates match reality
- [ ] public/version.js and package.json agree when the release changed
- [ ] New runtime files are included in the offline release
- [ ] New mechanics have deterministic tests or proof tapes
- [ ] Golden-manifest changes were intentional, inspected, and replay-verified
- [ ] Store screenshots were refreshed under a versioned `docs/screenshots/` section when presentation changed materially
- [ ] A screenshot-backed release brief exists for a release-candidate bump

## Originality

- [ ] Code, tuning, names, models, layouts, art, audio, and UI in this change are original or properly licensed
- [ ] No proprietary competitor source, assets, exact tracks, or timing data were copied

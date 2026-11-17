# HM-PF-27 — SG-02 Native Multi-State / Atlas Import Path (#225)

Issue [#225](https://github.com/leejpjack-hue/fight-motion-kit/issues/225).
Builds on SG-01 / HM-PF-25 ([#105](https://github.com/leejpjack-hue/fight-motion-kit/issues/105)) and HM-PF-26 ([#71](https://github.com/leejpjack-hue/fight-motion-kit/pull/71)).

## Scope & Contract

1. **FE-only File API import**: No generation backend, no remote asset URLs, no ZIP-first parser, and no provider calls.
2. **Native manifest first (`frame_layout` + `states`)**:
   - Accepts one local PNG sheet + one local JSON manifest carrying `frame_layout` (explicit `[x, y, w, h]` rectangles) and `states` (animation state frame lists and cadence/policy metadata).
   - Uses explicit rectangles directly from `frame_layout`. **Never infers an equal-cell grid** over a native manifest and **never invents an upstream version field**.
3. **Aseprite JSON is not the first path**:
   - Aseprite-compatible JSON (`meta.frameTags`, `frames[*].spriteSourceSize` / `sourceSize` without `frame_layout`) is rejected cleanly across both `HMStripAdapter.stage` and `skills/hm-spritegen-handoff/handoff.cjs`.
4. **Honesty & isolation preserved**:
   - `root_motion` / `engine_export` payloads remain rejected (HM-PF-28).
   - Imported multi-state atlases stage and commit atomically into the pending media store (`PENDING, NOT PLAYABLE`), keep open-project confirm-before-replace intact, and round-trip through `.motion.json` save/reopen re-validation.
   - Playable playback of pending strips/atlases on the canvas timeline stays out of scope until separately signed.

## Implementation Files

- [`public/ui/project-media.js`](../../public/ui/project-media.js) — `HMStripAdapter.isNativeAtlasManifest`, `isAsepriteJson`, `normalizeAtlas`, `stage`, `validateProject`, `decodeProject`, and `buildStripQaPanel`.
- [`skills/hm-spritegen-handoff/handoff.cjs`](../../skills/hm-spritegen-handoff/handoff.cjs) — `atlas-native-manifest` acceptance + `aseprite-hold` / `atlas-hold` rejection.
- [`skills/hm-spritegen-handoff/SKILL.md`](../../skills/hm-spritegen-handoff/SKILL.md).

## Verification

- `npm test` (`tests/hm-225-226-227.test.cjs`, `tests/hm-pf-25-spritegen-handoff.test.cjs`, `tests/hm-pf-30-strip-qa.test.cjs`, `tests/sg01.test.cjs`).
- Playwright browser check: `tests/hm-225-226-227.browser.cjs`.

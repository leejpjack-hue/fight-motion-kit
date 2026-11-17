# HM-PF-25 — hm-spritegen-handoff outside-FE contract

Issue [#105](https://github.com/leejpjack-hue/fight-motion-kit/issues/105).
Depends on HM-PF-05 ([#87](https://github.com/leejpjack-hue/fight-motion-kit/issues/87)), now on `main`.
Operator checklist: [`HM-PF-05-sprite-forge-absence.md`](HM-PF-05-sprite-forge-absence.md). This page does not merge itself.

The skill documents and checks a local strip handoff. It does not make HTML Motion a generation backend.

## Contract

1. Generation stays outside the FE. Sprite Forge stays absent. Jack imports with the File API only.
2. The first path is one strip PNG and one strip JSON (producer names `*.strip.png` and `*.strip.json`).
3. Credential files and run-session files are rejected. A run directory is rejected with them.
4. Schema SoT is SG-00 inside `/workspace/hr/briefs/sprite-gen-html-motion-2026-11-07.md` (HM-SG-00 through HM-SG-04). Cite that brief read-only. The same plan is published at <https://sprite-gen-html-motion-urak.pages.grok.bot/>. The fail-closed import subset already in this kit is `HMStripAdapter` in `public/ui/project-media.js`.

The gate is `skills/hm-spritegen-handoff/handoff.cjs`. It classifies local files. `HMStripAdapter.stage` still validates the pair before a pending save. The strip stays **PENDING, NOT PLAYABLE** until SG-02.

## Operator path

1. Generate the strip with the external sprite-gen CLI. HM does not embed that CLI.
2. Run `node skills/hm-spritegen-handoff/handoff.cjs <strip.png> <strip.json>`.
3. On `path: "strip-png-json"`, open `/ui/` and use **Import pending strip · PNG + JSON**. Select those two files.
4. Read the strip QA panel, then **Save pending strip**.

## Related holds & extensions

- **HM-PF-27 (#225 — Native multi-state / atlas path)**: [`HM-PF-27-sg02-atlas-path.md`](HM-PF-27-sg02-atlas-path.md) accepts a native sheet + manifest pair with explicit `frame_layout` rectangles and `states` metadata through the File API without inferring equal grids and without putting Aseprite JSON first. Bare `manifest.json` files without `frame_layout` + `states` still fail the gate (`atlas-hold`).
- SG-02 playback of pending strips, voice / #41, Remotion, and a vendored sprite-gen server remain out of scope here.

## HM-PF-28 — root_motion / engine-export rejection (#224)

`root_motion` (`rootmotion`) and `engine_export` payloads are rejected as a product import with a clear human-readable reason pointing to the strip PNG+JSON handoff (`handoff.cjs`, `HMStripAdapter`, Open project, Import from project, and Reference B import). HTML Motion stays a FE composer and does not become an engine runtime.

## Verification

`npm test` includes `tests/hm-pf-25-spritegen-handoff.test.cjs`.

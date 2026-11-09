---
name: hm-cam-grammar-scene
description: Design editable Intent/Action/Reaction triplets and a Wide re-establish per scene from an approved PF-08 board, using the Fight Camera Grammar Template fields and the checkout's current camera catalog. Hand the scene sheet to HM for human edits or hm-cam-shot-author; never invent wide_* curves or generate plates.
---

# HM scene camera grammar · Step 4

Use the [Fight Camera Grammar Template](https://app.notion.com/p/40b9565776c68154a978edfd92c62652)
as the planning contract. Its source was read on 2026-11-08; last edited
2026-11-01T11:46:06.416Z; Notion verification state was **unverified**.
The related [camera grammar audit](https://app.notion.com/p/40b9565776c681e78bc0f8240988daba)
provides context. The checkout's actual `public/presets/camera_presets.json`
wins whenever historical source examples mention absent IDs.

## Required input

Open the intended show in HM. Review **2 Story · Jack GO gate → Approve**, then
**Clip Settings → Camera motion → Scene camera grammar → Export approved camera
input**. This downloads the stable PF-08 beat IDs, board, current show, and GO
snapshot. Never manufacture GO; implementation authorization is not story approval.
External PF-08 boards can use `--go-file` with the same step-2 approval contract
and the canonical `HMComposeClient.rhythmBoardSnapshot(board)`.

HM-PF-06 (#88) owns upstream Cantonese storyboard creation. Consume the existing
approved PF-08 board; do not claim to implement or replace its missing source.
Preserve story labels, motion classes, durations, plates, screen sides and FX.

Ask for the scene's camera intent if it is unknown. Produce a small design JSON
with `intent` and optional `fight_meta`, plus `rows` keyed by existing `beat_id`.
Each row can set `scene_id`, `triplet`, `role`, `shot_size`, `preset_id`,
`beat_action`, `fx`, `lens_mm`, `direction`, `speed`, and `purpose`.
Roles must be explicit in the source board or design; unknown roles fail closed.
Do not insert beats or silently turn an Action into a Wide to pass validation.
Have the operator revise the approved board when more coverage is needed.

```json
{"intent":"Readable attack and aftermath", "rows":[
  {"beat_id":"EXISTING-ID", "scene_id":"scene-01", "triplet":"T1",
   "role":"Intent", "shot_size":"MCU", "preset_id":"eye_hold",
   "lens_mm":"50mm", "direction":"steady", "speed":"zero speed",
   "purpose":"show the opening before the attack"}
]}
```

The example is a partial override, not a complete approved storyboard. The helper
fills known role defaults only on existing beats. At least one complete ordered
Intent → Action → Reaction triplet and a Wide **after** a triplet are required in
each scene. Maximum one planned full impact per triplet. The source's typical
4–7 impacts for a 30s film is guidance, not a fixed budget for every show.

## Emit and review

```sh
node skills/hm-cam-grammar-scene/scripts/grammar.cjs \
  --board work/story.camera-input.json --design work/scene-design.json \
  --intent 'Keep screen sides readable through the counter' \
  --out work/scene.grammar.json --markdown work/scene.grammar.md
```

`--repo` selects another checkout. `--design`, `--intent` and `--markdown` are
optional; approved boards already carrying roles can produce a starter proposal.
`--design` also accepts an exported `.camera-clauses.json` or `.camera-clauses.txt`
file to round-trip edited `Camera:` clauses back into scene grammar.
Outputs never overwrite existing files. Missing GO, stale story IDs, incomplete
triplets, missing Wide coverage and absent catalog presets stop before output.
In the HM UI, the **Wide establish preset** picker (**＋ Insert Wide re-establish**
or **Mark beat as Wide**) inserts or marks a `Wide`-tagged beat using existing
establish presets (`eye_orbit`, `low_rise`) without inventing `wide_*` curves, and
Show JSON Lint warns (`scene_missing_wide`) if a grammar scene has zero `Wide` beats.

The sheet retains the template's fight-meta fields and exact ten beat columns:
`#`, `t (s)`, `Role (Intent/Action/Reaction/Wide)`, `Shot size`, `Angle`,
`Function / move`, `Preset id`, `Beat / action`, `FX (full / hitstop / none)`,
`Camera clause (draft)`. Angle/move always come from the selected catalog preset.
The source formula is:

`Camera: {angle}, {lens_mm}; camera {move} {direction} at {speed}, {purpose/end composition}.`

Keep one setup, one move, explicit speed, and a stated purpose. Preserve the
180° screen-side relationship; use match action / a motivated angle change.
Wide is a coverage role, not a new curve. Inspect actual plate framing: a tight
plate does not become genuinely wide through a label, lens text or existing pan.
Lens, shot size and planned FX are prompt intent; they do not change rendered FX.

Hand the JSON to `hm-cam-shot-author`, or import directly using **Apply grammar /
camera map** in HM. Review the summary; the application is one undoable edit.
The human can edit scene/triplet, role, shot size, action, lens, direction, speed,
purpose and planned FX in the disclosure. The existing camera menu overrides the
preset; clauses regenerate from the actual catalog move. Export the editable
Markdown sheet, JSON, or `Camera:` clauses; Save project retains planning fields.
Story changes require new GO. Camera planning changes can retain the original
approved story provenance. Rework blocks authoring until the operator approves.

Run the existing html-motion-composer Frame-QA lint → peek → claim loop after
structural camera changes; inspect cuts in preview and the exported film. Do not
claim completion with structural errors. No plate generation, voice, backend API,
automatic n8n resume, new renderer, new camera curves, or deployment.

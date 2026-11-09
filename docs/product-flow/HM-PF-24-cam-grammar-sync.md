# Cam grammar Notion ↔ box template sync note

**Story:** HM-PF-24 (SIGNED). Owner is PO. Skill is `hm-cam-grammar-scene`.
**Date:** 9 Nov 2026.
**This file is the source of truth** for the camera-grammar Notion URLs, the box template path, the fight-meta labels, and the beat-sheet columns. Skills cite this note. They do not keep a second field list.

This note does not change the composer, add preset curves, or lift a HOLD.

## Pointers

Fetched from Notion on 9 Nov 2026. Both pages report verification state **unverified**. URLs below are the pages already linked from this kit. No other Notion grammar URL was found in the checkout.

| Surface | Path or URL | What this run could read |
|---|---|---|
| Notion template (field contract) | https://app.notion.com/p/40b9565776c68154a978edfd92c62652 | Page title **Fight Camera Grammar Template**. Last edited `2026-11-01T11:46:06.416Z`. |
| Notion audit (context only) | https://app.notion.com/p/40b9565776c681e78bc0f8240988daba | Page title **Fight Camera Grammar — Combining Angle, Action, Close-up for a Good Fight Animation (2026-11-01)**. Last edited `2026-11-01T09:43:07.371Z`. Not a second field contract. |
| Box template | `/workspace/hr/html-motion/templates/fight-camera-grammar-template-2026-11-01.md` | **UNKNOWN.** Cited from [`companion-notes.md`](companion-notes.md). The file is not in this checkout, and it was not on disk or Drive for this run. Do not treat a missing file as an empty template or invent its body. |
| Box brief beside that citation | `/workspace/hr/briefs/cloudagent-hm-cam-grammar-starter-2026-11-01.md` | **UNKNOWN.** Same companion note. Not the field template. |

Present in the repo, and **not** substitutes for the box template:

| Path | Role |
|---|---|
| `kit/templates/fight-cam-grammar-starter.json` | Cold-open show sample |
| `public/templates/fight-cam-grammar-starter.json` | Same sample on the served tree |
| `kit/presets/camera_presets.json` | Preset catalog the Notion template names as kit SoT |
| `public/presets/camera_presets.json` | Checkout catalog the skills load |
| `public/ui/camera-authoring.js` | Already stores the template URL and the ten column labels in `TEMPLATE` |

The Notion template calls itself a reusable Notion + box SoT. It does not print a filesystem path. The box path in the table is the one path this repo already cites.

## Locked labels

Copied from the Notion template fetch on 9 Nov 2026. These are the only fight-meta labels and beat columns.

Fight meta (§1), in order:

1. `Fight / show id`
2. `Duration (s)`
3. `Plate count`
4. `Screen-LEFT fighter`
5. `Screen-RIGHT fighter`
6. `Geography / set`
7. `Target triplet count`
8. `Full-impact budget`
9. `Finisher FX`
10. `Composer / kit tip`
11. `Notes`

Beat sheet (§7), ten columns, in order:

1. `#`
2. `t (s)`
3. `Role (Intent/Action/Reaction/Wide)`
4. `Shot size`
5. `Angle`
6. `Function / move`
7. `Preset id`
8. `Beat / action`
9. `FX (full / hitstop / none)`
10. `Camera clause (draft)`

Roles named by that role column: `Intent`, `Action`, `Reaction`, `Wide`.

Clause formula printed in §8:

```txt
Camera: {angle}, {lens_mm}; camera {move} {direction} at {speed}, {purpose/end composition}.
```

`lens_mm`, `direction`, `speed`, and `purpose` are placeholders inside that formula. They are not extra beat columns.

Shot-size codes printed in §3: `EWS`, `WS`, `MWS`, `MS`, `MCU`, `CU / OTS` (one row), `ECU`, `INS`, `POV`, `RXN`, `CUT`. Sections §3–§6 and §9–§12 are reference tables on the Notion page. They are not new output keys.

## Already in the checkout

`public/ui/camera-authoring.js` already uses the eleven fight-meta labels as `fight_meta` keys and the ten column labels as `TEMPLATE.fields`. This note does not add keys.

Existing row keys that already map onto those columns: `triplet`, `t_s`, `role`, `shot_size`, `angle`, `function_move`, `preset_id`, `beat_action`, `fx`, `camera_clause`. `beat_id` and `scene_id` are existing PF-08 board keys. `lens_mm`, `direction`, `speed`, and `purpose` are already accepted because the clause formula names them.

Observed differences, left as-is (this story does not edit the exporter):

- The checkout clause line, under `fight-prompting-enhancements-2026-11-01`, is `Camera: {shot_size} framing at {angle}, {lens_mm}; camera {move} {direction} at {speed}, to {purpose}.` The Notion §8 line has no shot-size token and ends with `{purpose/end composition}`. Do not invent a third formula.
- The checkout size list splits the Notion `CU / OTS` row into `CU` and `OTS`. Do not add further size codes.
- Notion §6 names `wide_*` preset ids. This kit rejects absent `wide_*` ids. Preset ids come from the current `camera_presets.json`.

## No silent field invent

A skill, scene JSON file, or Markdown sheet may emit only the labels and the existing checkout keys above. An unknown fight-meta label, beat column, shot-size code, or clause token is not added to make a sheet validate. Leave it blank or fail closed and update this note first.

Do not copy a reference-table row (angle name, move name, FX hook, or `wide_*` id) into a new field. Do not fill the UNKNOWN box body from the Notion page and call that a sync.

## Drift checklist

Run this when the Notion template, the audit page, or the box file changes.

1. Re-fetch both Notion URLs. Record title, last-edited time, and verification state in the pointer table.
2. Open the box path. If the file is still missing, keep **UNKNOWN**. Do not reconstruct it.
3. Diff fight-meta labels and the ten beat-column headers against the lists above. Diff nothing else into the skill.
4. A rename lands in this note in the same change. Until that edit is merged, skill output keeps the previous label. Do not emit both names.
5. A new label is not a skill field until this note lists it. Do not add it in `SKILL.md` or `README.md` first.
6. If the box body and the Notion page disagree, stop and record the disagreeing labels here. Do not pick one silently.
7. Preset ids still resolve through the checkout catalog. A Notion `wide_*` row does not add a curve.
8. Leave the recorded clause-formula difference until a story that is allowed to change the exporter. Do not paper over it with a new token.
9. Voice / #41, HM-PF-27, HM-PF-28, HM-PF-47, HM-PF-48, `root_motion`, and HM-PF-30a stay HOLD. This checklist does not lift them.

## Who cites this note

- [`skills/hm-cam-grammar-scene/README.md`](../../skills/hm-cam-grammar-scene/README.md)
- [`skills/hm-cam-grammar-scene/SKILL.md`](../../skills/hm-cam-grammar-scene/SKILL.md)
- [`skills/hm-cam-shot-author/SKILL.md`](../../skills/hm-cam-shot-author/SKILL.md)
- [`CAMERA-AUTHORING.md`](CAMERA-AUTHORING.md)

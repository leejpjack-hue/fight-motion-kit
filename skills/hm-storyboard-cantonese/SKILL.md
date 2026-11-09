---
name: hm-storyboard-cantonese
description: Turn a short fight brief into an editable Cantonese second-by-second storyboard and stop for Jack GO before gen or rhythm. Copy STORYBOARD-zh table headers when that file is present. Do not invent its fields when it is missing. No plate generation, voice, sprite import, or n8n resume.
---

# HM Cantonese storyboard

Own step 2 story text for HM-PF-06 (#88). HM-PF-51 indexed this name. This
file is the board implementation. The board is editable Cantonese text. It
is not a plate list, a show, or a rhythm plan.

## Inputs

- A short typed fight premise.
- Optional `show_id`.
- Optional `--source` STORYBOARD-zh markdown. The void-array file is
  `/workspace/deliverables/fight-baijia-elfmage-void-array-2026-11-06/STORYBOARD-zh.md`.
  When that path or `--source` is readable, its table headers are the fields.
- The existing step-2 Jack GO record, only when advancing. Implementation
  permission is not that Approve. Do not manufacture one.

## Outputs

A markdown board and a sibling JSON file. Every row has a second mark and a
Cantonese beat label. `beat_id` values match the HM-PF-08 shape. The JSON
includes a `pf08` slice (`kind: "hm-pf-08-board"`, `show_id`, `beats[]` with
`beat_id` and `label`). Cantonese prose and any other source column stay on
this board. `.motion.json` stores the id on the atom.

If the STORYBOARD-zh source is missing, say so and emit only
`秒 | beat_id | 鏡頭`. Do not invent void-array columns to fill the gap.
`fields_from` is `v1-fallback`. Pass `--source` before treating the headers
as the void-array file. Do not rename, translate, drop, or replace a header
that the source actually has.

English glosses stay with HM-PF-07. This skill does not add them.

## FE handoff

Open the text in the HM board surface (`#hmBoardSurface`, `#hmBoardText`).
Jack edits it there. Editing does not create plates or atoms. The existing
**2 Story · Jack GO gate** (HM-PF-09) is Approve / Rework. Rework stays on
step 2 and does not wipe a costume lock pack.

## Flow — Jack GO before gen or rhythm

1. Emit the board from the typed brief. Stop.
2. Jack edits the text in the HM board surface.
3. Jack clicks **Approve** on **2 Story · Jack GO gate**. Do not manufacture
   a GO record.
4. Only that Approve (`Decision: "Approve"`, `step: 2`, `step_id: "story"`)
   may be treated as permission to consider gen or rhythm.
5. `board.cjs advance --to gen` and `--to rhythm` refuse to continue without
   that GO file. With the file, they still do not generate plates and do not
   run rhythm. The operator then uses the existing HM rhythm export and
   `hm-rhythm-pacing`, or an outside gen path, as a separate step.
6. Fight-video gates stay in force: storyboard text requires human review
   before plate generation. `html-motion-fight-video` is not called from this
   skill. n8n is a gate only and is not resumed here.

No auto-gen plates without GO. This skill never writes PNG, WebP, or JPG
files. A source column whose header is already a plate column is filled with
`未出板`. A missing source does not gain a plate column.

```sh
node skills/hm-storyboard-cantonese/scripts/board.cjs emit \
  --brief-file work/brief.txt --show-id street-duel \
  --source /workspace/deliverables/fight-baijia-elfmage-void-array-2026-11-06/STORYBOARD-zh.md \
  --out work/street-duel.board.md

node skills/hm-storyboard-cantonese/scripts/board.cjs check \
  --board work/street-duel.board.md --source work/storyboard-zh.md

node skills/hm-storyboard-cantonese/scripts/board.cjs advance \
  --to rhythm --board work/street-duel.board.md --go-file work/go.json
```

## Anti-jobs

- Do not generate plates, call sprite-gen, or run rhythm from this skill.
- Do not manufacture Jack GO, Approve, or Rework.
- Do not rename `beat_id` rules or fork the HM-PF-08 bridge.
- Do not invent void-array fields when the STORYBOARD-zh source is missing.
- Do not add voice, SFX, or a #41 lift.
- Do not implement HM-PF-27, HM-PF-28, HM-PF-47, HM-PF-48, SG-01, or 30a.
- Do not call `api.teqcon.uk`, `:8770`, or a compose / save HTTP API.
- Do not treat n8n as the editor. n8n may later key a gate on `beat_id`. It does not write the show.

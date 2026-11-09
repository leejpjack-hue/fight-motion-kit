---
name: hm-storyboard-cantonese
description: Turn a short fight brief into an editable Cantonese second-by-second storyboard and stop for Jack GO before gen or rhythm. Reuse STORYBOARD-zh table headers without renaming them. No plate generation, voice, sprite import, or n8n resume.
---

# HM Cantonese storyboard

Own step 2 story text for HM-PF-06 (#88). The board is editable Cantonese
text. It is not a plate list, a show, or a rhythm plan.

## Field contract

The void-array source of truth is
`/workspace/deliverables/fight-baijia-elfmage-void-array-2026-11-06/STORYBOARD-zh.md`.
When that file or another `--source` STORYBOARD-zh file is readable, its
markdown table headers are the fields. Copy them in order. Do not rename,
translate, drop, or replace a header. Extra columns such as `法陣` stay on
the board under that exact header. They are not copied onto `.motion.json`.

The PF-08 handoff is only `show_id`, `beat_id`, and the Cantonese `label`.
`boardFromShow` still rebuilds those three from the show. Cantonese prose
and every other STORYBOARD-zh column stay on this board.

If the source file is absent, emit uses the v1 fallback headers
`秒 | beat_id | 鏡頭 | 左 | 右 | 板` and records `fields_from: v1-fallback`.
That fallback is not a silent rewrite of the void-array file. Pass `--source`
pointing at the real STORYBOARD-zh before treating those headers as compatible.

The 黛玉×寶釵 30s 分鏡 page is a sibling reuse for second marks and Cantonese
shot labels. It does not replace the void-array header row.

## Flow — Jack GO before gen or rhythm

1. Emit the board from the typed brief. Stop.
2. Open that text in the HM board surface (`#hmBoardSurface`, `#hmBoardText`).
   Jack edits the text there. Editing does not create plates or atoms.
3. Jack reviews step 2 on the existing **2 Story · Jack GO gate** and clicks
   **Approve**. Rework stays on the board. Do not manufacture a GO record.
4. Only that Approve (`Decision: "Approve"`, `step: 2`, `step_id: "story"`)
   may be treated as permission to consider gen or rhythm.
5. `board.cjs advance --to gen` and `--to rhythm` refuse to continue without
   that GO file. With the file, they still do not generate plates and do not
   run rhythm. The operator then uses the existing HM rhythm export and
   `hm-rhythm-pacing`, or an outside gen path, as a separate step.
6. Fight-video gates stay in force: storyboard text requires human review
   before plate generation. `html-motion-fight-video` is not called from this
   skill. n8n is a gate only and is not resumed here.

No auto-gen plates without GO. The plate column, when the source has one,
is `未出板`. This skill never writes PNG, WebP, or JPG files.

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

`--source` may be omitted only when the SoT path itself is readable. A missing
SoT emits the labeled v1 fallback instead of inventing a second header dialect.

## Holds

Do not implement or lift these: HM-PF-27, HM-PF-28, HM-PF-47, HM-PF-48,
#41, SG-01, voice invent, 30a. No SFX, no voice track, no atlas, no
root_motion import, and no 30a strip panel.

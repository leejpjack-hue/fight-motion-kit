# HM-PF-06 — Cantonese second-by-second board

Issue [#88](https://github.com/leejpjack-hue/fight-motion-kit/issues/88).
Skill: [`hm-storyboard-cantonese`](../../skills/hm-storyboard-cantonese/SKILL.md).

Jack types a short fight premise. The skill writes a board with a second mark
and a Cantonese beat label on every row. The text opens in the HM board
surface (`#hmBoardSurface` / `#hmBoardText`) and stays editable. Nothing in
that surface creates plates or atoms.

## Jack GO before gen or rhythm

Gen and rhythm wait for the existing **2 Story · Jack GO gate → Approve**
(`Decision: "Approve"`, `step: 2`, `step_id: "story"`). The skill helper
`advance` refuses both targets without that record. A recorded GO still does
not generate plates and does not run `hm-rhythm-pacing`. Plate cells stay
`未出板`.

## STORYBOARD-zh fields

The field source is
`/workspace/deliverables/fight-baijia-elfmage-void-array-2026-11-06/STORYBOARD-zh.md`.
This checkout does not vendor that deliverable. When the file is passed with
`--source`, its table headers are copied in order and are not renamed. The
PF-08 bridge still carries only `beat_id` and `label`. Other columns remain
on the PF-06 board.

HM-PF-27, HM-PF-28, HM-PF-47, HM-PF-48, #41, SG-01, voice, and 30a stay on hold.

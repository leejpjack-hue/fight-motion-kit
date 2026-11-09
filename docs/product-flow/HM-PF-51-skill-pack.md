# hm-* skill pack (HM-PF-51)

**Story:** HM-PF-51 (SIGNED). Owner lane for this landing is Cursor.
**Date:** 9 Nov 2026
**Landing:** [`PRODUCT-FLOW.md`](PRODUCT-FLOW.md)

Agents load one named skill per step and read a fixed contract. This page is that name set. It does not add a composer feature, a script, or a schema field.

The names are the Approval Page step skills (Jack t2473u), the same 1..10 order as [`workflow.board.json`](workflow.board.json) and the locked steps in [`PRODUCT-FLOW.md`](PRODUCT-FLOW.md). The HM-SKILL-SYNC draft `html-motion-fight-video.SKILL.md` is not in this checkout. This page does not reconstruct that draft. It records the Approval names and points at the file that already exists, or at a contract stub.

HOLDs are unchanged. HM-PF-27, HM-PF-28, HM-PF-47, and HM-PF-48 stay DESIGNED-HOLD. This story does not SIGN them. Step 10 stays a disabled HOLD. Voice and #41 stay HOLD.

## Name set

| Step | Skill | Path | Kind |
|---|---|---|---|
| 1 | `hm-character-lock` | `skills/hm-character-lock/SKILL.md` | shipped |
| 2 | `hm-storyboard-cantonese` | `skills/hm-storyboard-cantonese/SKILL.md` | shipped |
| 3 | `hm-rhythm-pacing` | `skills/hm-rhythm-pacing/SKILL.md` | shipped |
| 4 | `hm-cam-grammar-scene` | `skills/hm-cam-grammar-scene/SKILL.md` | shipped |
| 5 | `hm-cam-shot-author` | `skills/hm-cam-shot-author/SKILL.md` | shipped |
| 6 | `hm-spritegen-handoff` | `skills/hm-spritegen-handoff/SKILL.md` | shipped |
| 7 | `hm-bg-scene-author` | `skills/hm-bg-scene-author/SKILL.md` | shipped |
| 8 | `hm-fg-layer-author` | `skills/hm-fg-layer-author/SKILL.md` | stub |
| 9 | `html-motion-fight-video` | `skills/html-motion-fight-video/SKILL.md` | shipped |
| 9 | `hm-compose-fx-impact` | `skills/hm-compose-fx-impact/SKILL.md` | shipped |
| 10 | `hm-voice-track` | `skills/hm-voice-track/SKILL.md` | designed-hold |

`shipped` means the skill is the implementation agents should run. `stub` and `designed-hold` are contract files only. Each stub and the voice hold has Inputs, Outputs, FE handoff, and Anti-jobs, and none of those files contains a script. HM-PF-06 implements `hm-storyboard-cantonese`, so that row is shipped and its helper may write the board text.

HM-PF-51 left `hm-bg-scene-author` as a stub. HM-PF-31 ships it. HM-PF-40 implements `html-motion-fight-video` as the steps 1..9 sequencer, so that row is shipped. It calls each step skill and does not replace `html-motion-composer`. `hm-fg-layer-author` stays a stub. The voice HOLD is unchanged.

`skills/html-motion-composer/` stays the compose helper already on `main`. Step 9's agent name on the Approval Page is `html-motion-fight-video`. HM-PF-40 sequences the shipped step skills and points at the composer skill. It does not replace it. Voice and #41 stay HOLD.

These names are not step skills and are not stubbed here: `n8n` (gates only, [`DUAL-PATH-CONTRACT.md`](DUAL-PATH-CONTRACT.md)), `json-pose-from-image`, and `prompt-sheets` (external reuse named by `hm-character-lock`).

## Product-flow prose, same names

[`PRODUCT-FLOW.md`](PRODUCT-FLOW.md) describes the beside-skill in words. Those words map onto the table above.

| Step prose | Skill file |
|---|---|
| Character / OpenPose skill | `hm-character-lock` |
| Storyboard skill | `hm-storyboard-cantonese` |
| Rhythm and frame-QA skill | `hm-rhythm-pacing`. Frame-QA stays `skills/html-motion-composer/scripts/frame-qa.cjs` |
| Triplet-planner skill | `hm-cam-grammar-scene` |
| Preset-tuning skill | `hm-cam-shot-author` |
| External sprite-gen, local handoff | `hm-spritegen-handoff` |
| Background framing skill | `hm-bg-scene-author` |
| Cutout skill beside foreground edit | `hm-fg-layer-author` |
| Compose scripts beside the canvas | `html-motion-composer`, sequenced by `html-motion-fight-video` (HM-PF-40) |
| Cutout and FX wording on step 8 | Props stay `hm-fg-layer-author`. Wave 1 FX stays the shipped `hm-compose-fx-impact` skill at step 9 |
| Voice HOLD | `hm-voice-track` (DESIGNED-HOLD) |

A stub that needs a field already persisted by the composer cites that field. It does not add a key.

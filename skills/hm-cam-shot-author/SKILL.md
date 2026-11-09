---
name: hm-cam-shot-author
description: Map an approved scene grammar sheet to existing camera_presets.json IDs and reusable Camera clauses. Fail closed on missing presets, then hand the local map to HM for per-beat human overrides and the shipped camera-chain controls.
---

# HM camera shot author · Step 5

Consume the JSON from [hm-cam-grammar-scene](../hm-cam-grammar-scene/SKILL.md).
Its approved PF-08 story, complete triplets and per-scene Wide re-establish are
required. Reuse the [Fight Camera Grammar Template](https://app.notion.com/p/40b9565776c68154a978edfd92c62652)
fields and four-part camera clause, with angle/move from the current checkout.
Never substitute an absent preset or create historical `wide_*` curve IDs.

```sh
node skills/hm-cam-shot-author/scripts/author.cjs \
  --grammar work/scene.grammar.json --out work/scene.camera-map.json \
  --clauses work/scene.camera-clauses.txt \
  --clauses-json work/scene.camera-clauses.json
```

`--repo` selects another checkout; `--clauses` (text) and `--clauses-json` (JSON
`beat → Camera: clause` map matching `fight-prompting-enhancements-2026-11-01`
REPORT conventions) are optional. `--grammar` accepts either a scene grammar JSON
or an exported `.camera-clauses.json` package so clauses round-trip cleanly into
skill inputs and HM's **Apply grammar / camera map** importer. The helper loads the
actual `public/presets/camera_presets.json` and shared browser authoring logic.
Missing presets, malformed roles/IDs or stale GO fail before writing output.
Existing output files are never overwritten. The map contains ordered stable
beat IDs, existing `camera.preset` values, and clauses for fight-prompting reuse.
Hand the text to the prompting operator; do not start image generation or voice.

Open the matching show and use **Clip Settings → Camera motion → Scene camera
grammar → Apply grammar / camera map**. Read the summary and apply. Undo restores
all cameras/planning metadata together. Timing, plates, motion classes, character
locks and rendered FX remain intact. Camera segments/chains are replaced by the
mapped single-preset moves; timing-pack camera ownership is cleared on override.

The human can select a beat and override the existing camera menu, nudge or
easing. Exported clauses derive from the current preset; an old stored clause
never wins. The angle/move and default direction/speed update after a preset
change; lens/purpose remain editable. Different camera presets inside one
Dual-segment beat cannot be represented by the template's one-move clause:
disable Dual-segment or use one preset throughout before exporting that sheet.
The ordinary preview and export still support dual segments.

For adjacent cuts, Shift-click a timeline run and choose **Chain from first
camera** or **Chain + snap zoom**. Both explicitly copy the first camera's preset
and framing across the run, then call the existing HM-CAM-CHAIN hook. This avoids
per-clip nudge/intensity jumps. Existing Easing and Use easing on chain controls
remain available. Preview the cut boundaries, use Undo if needed, and Save project
for portable persistence. No second chain engine or schema for curves is added.

Run html-motion-composer's Frame-QA lint → peek → claim loop and inspect the
actual preview after structural changes. No backend compose, automatic n8n
resume, plate generation, voice, deploy or self-merge.

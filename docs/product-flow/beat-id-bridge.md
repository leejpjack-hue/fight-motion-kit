# Board ↔ `.motion.json` beat ids (HM-PF-08)

n8n reads the same beat ids on the storyboard and in the show inside `.motion.json`. The field is `beat_id`. It is not an HF-04 beat-block id.

## Contract

| Side | Field | Role |
|---|---|---|
| Board beat | `beat_id` | Stable storyboard id. `id` is an alias only when `beat_id` is absent. |
| Show atom | `beat_id` | Same id, written onto `show.atoms[]` in the portable project. |
| Show atom | `id` | Equals `beat_id` after a successful stamp or rename. |
| HF-04 block | `blocks[].id` | Camera and FX preset pack (`street_ecu_fist` and the rest). Apply keeps atom `id` and `beat_id`. |

`HMComposeClient.applyBoardToShow` writes `beat_id` when every board beat matches one atom. `renameBeat` changes that id on the board and on the atom together. If the ids have drifted, the target is already taken, or the show id does not match, the call returns `ok: false` and does not change either object.

`roundTripBoard` checks the id list in show-atom order. A board whose beats are sorted differently still stamps by id, and the round trip reports `order_drift` instead of rewriting the film.

HF-03 records a mismatch as `beat_id_conflict`. Severity is a warning. `blocksBake` stays false. The finding is not a structural error, so the HF-06 claim gate does not treat it as a bake block.

Copying a bridged clip assigns the copy a new `beat_id` equal to its new atom id. Two clips never keep one beat id.

## PF-06 seam

`hm-storyboard-cantonese` is not in this repo. This bridge does not add a storyboard editor. When that skill lands, its board can be:

```json
{
  "kind": "hm-pf-08-board",
  "show_id": "daiyu-wang-five-seconds",
  "beats": [{ "beat_id": "beat-01", "label": "Opening clash" }]
}
```

`show.atoms[].id` values that already exist (`beat-01`, or a legacy id such as `lib_eye_push__jab_vs_block__2s`) are the alias until `beat_id` is stamped. Extra beat fields, including Cantonese prose, stay on the PF-06 board. `.motion.json` stores the id on the atom. `boardFromShow` rebuilds `beat_id`, `label`, and `index` from the show.

DiagramTool files in this folder (`architecture.board.json`, `workflow.board.json`) are the design boards for steps 1..10. They are not the storyboard.

The bridge is frontend-only. It does not call compose, save, or upload HTTP. n8n still does not write the show. It can key Wait and Rework off `beat_id` because a board edit and a show edit that go through `renameBeat` leave the same id on both sides.

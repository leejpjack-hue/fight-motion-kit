---
name: hm-rhythm-pacing
description: Design one editable duration map and impact budget from an approved HTML Motion storyboard plus target seconds, or stamp the shipped dialogue_film_slow and micro_cut_flurry packs onto selected beats. Reuse the composer engine and existing beat IDs; hand the local rhythm plan to HM for human fine tuning and Undo. No plate generation, voice, server compose, or competing rhythm skill.
---

# HM rhythm pacing

Own the rhythm map for Step 3. Use the existing HF-04 beat IDs and
HM-DIALOGUE-HOLD behavior; never implement a second hold/flurry engine.

## Inputs and story approval

- An approved board in the existing `hm-pf-08-board` contract: `show_id`,
  ordered `beats[]`, stable `beat_id` (or matching `id`), and editable labels.
  Cantonese prose and other board fields stay intact. Optional `duration_s`
  supplies a pacing weight; optional `timing_pack` selects a shipped hold.
- Target seconds, and optionally a maximum count of impact slots. The slot
  budget counts impact clips, not every camera cut or individual FX hook.
- The current portable `.motion.json` or shipped show JSON when applying
  timing packs. This supplies real motion/FX impact classification and current
  durations; a normal duration proposal can also be made from a board alone.
- **Jack GO before rhythm.** In HM, review the current story using the existing
  **2 Story · Jack GO gate → Approve**, then **Export approved rhythm input**
  in Clip Settings → Rhythm. That local JSON bundles the board and its approval.
  A changed board, missing GO, Rework, or a mismatched show cannot be treated as
  approval. Implementation authorization is not creative story approval.

HM-PF-06 (#88) still owns Cantonese storyboard creation and its upstream source
format. This skill consumes the already shipped PF-08 board contract; it does
not invent or replace the void-array STORYBOARD-zh source. An externally authored
approved board can instead be supplied with `--go-file`: the existing step-2
fields (`Decision: "Approve"`, `step: 2`, `step_id: "story"`, `show_id`) plus `story_snapshot`, the
canonical `HMComposeClient.rhythmBoardSnapshot(board)` of that exact board.
Only the human/operator records a GO; never manufacture one to run the helper.

## Design a duration map

```sh
node skills/hm-rhythm-pacing/scripts/rhythm.cjs plan \
  --board work/story.rhythm-input.json --target-s 10 \
  --project work/story.motion.json --impact-budget 3 \
  --out work/story.rhythm-plan.json
```

The helper reads the checkout's actual engine and
`public/presets/timing_hold_packs.json`. `--repo` selects another checkout.
Target allocation is deterministic to 0.0001s. Unpinned beats share remaining
time proportionally to their current durations (or board weights), constrained
to the existing 0.1–3s lint window. A named pack fixes its selected beat's shipped
duration. If the target cannot fit, ask the human to add/split beats or choose
another target; do not stretch the film, invent plates, or silently retime holds.

The JSON output contains the duration map, target, impact budget, original board,
and its GO record. Existing files are never overwritten. The helper does not
modify the input project or write image assets.

## Pack A / Pack B on selected beats

```sh
node skills/hm-rhythm-pacing/scripts/rhythm.cjs stamp \
  --board work/story.rhythm-input.json --project work/story.motion.json \
  --pack dialogue_film_slow --beats beat-02,beat-04 --soft-cam \
  --out work/holds.rhythm-plan.json

node skills/hm-rhythm-pacing/scripts/rhythm.cjs stamp \
  --board work/story.rhythm-input.json --project work/story.motion.json \
  --pack micro_cut_flurry --beats beat-02,beat-03 \
  --out work/flurry.rhythm-plan.json
```

- **Pack A `dialogue_film_slow`:** floor 1.5s; optional shipped soft camera.
- **Pack B `micro_cut_flurry`:** 0.12s cuts with the shipped camera sequence;
  selected impacts use the shipped minimum 1.2s hold. Motion classes and FX are
  classified by the existing composer behavior.
- Stamp mode preserves every unselected duration. It does not fit/stretch the
  rest of the show or freeze unselected impact clips. It retains the existing
  duration target unless `--target-s` is explicit; the UI reports any delta.
- Unknown pack IDs, missing source durations, mismatched beat IDs, missing GO,
  and stale pack-duration assumptions fail before a plan is applied.

## Human edit and verification

Open the same project in HM, then **Clip Settings → Rhythm → Apply rhythm plan**
and select the local output. Review the application summary and confirm. This
is one undoable edit using the existing engine. **Undo** restores timing, camera
settings, target, and budget together. Jack can still edit each clip's duration
or use the existing Timing pack control afterward.

The impact meter shows used/budget slots, remaining slots, and impact time;
duration edits update the time immediately. Over-budget is a warning, never a
bake block. Target lint reports total, target, and signed delta. Missing durations
remain invalid rather than reporting a false total or successful match.

Save project to retain target/budget in `.motion.json`. For an authored show,
run the existing `html-motion-composer` Frame-QA lint → peek → claim loop after
structural timing edits. Do not claim completion with structural errors. Use
the actual preview/export to verify holds and cuts. Do not call a compose API,
generate new art, resume n8n automatically, or create voice/#41 work.

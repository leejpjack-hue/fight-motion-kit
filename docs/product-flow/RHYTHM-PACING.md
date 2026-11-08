# Approved rhythm plans — HM-PF-11/12/13/14

Issues [#91](https://github.com/leejpjack-hue/fight-motion-kit/issues/91),
[#92](https://github.com/leejpjack-hue/fight-motion-kit/issues/92),
[#93](https://github.com/leejpjack-hue/fight-motion-kit/issues/93), and
[#94](https://github.com/leejpjack-hue/fight-motion-kit/issues/94) share one
[`hm-rhythm-pacing` skill](../../skills/hm-rhythm-pacing/SKILL.md) and the actual
composer engine. No competing timing implementation or generation backend.

## Human path

1. Open a project and review its story in the existing **2 Story · Jack GO gate**.
   Click **Approve**. This captures the exact current beat IDs, labels, duration
   weights, motion classes, FX, and applied hold-pack directives for rhythm input.
2. In **Clip Settings → Rhythm**, choose **Export approved rhythm input**. The
   local file contains a PF-08 board and the bound step-2 approval record.
   Changed story content or Rework disables export until the story is approved
   again. This file is not a new n8n resume request or an authenticated provider
   certificate; it records the operator's explicit local story decision.
3. Run the skill helper locally with a target, optionally an impact-slot budget.
   It emits a complete duration map or a selected-beat pack stamp. See the skill
   for exact commands. Files are written exclusively; inputs are never overwritten.
4. Choose **Apply rhythm plan**, select the output, review the summary, and
   confirm. One undoable edit updates the open project. Clip durations, cameras,
   and timing-pack controls remain editable afterward.
5. **Save project** retains target, budget, and applied timing metadata in the
   same `.motion.json`. **Undo** restores the entire prior timing/configuration.

## Contracts

| Artifact | Fields / semantics |
| --- | --- |
| Input | `kind: hm-rhythm-input`, `version: 1`, `board`, `approval`. The board retains the existing PF-08 `show_id`, ordered `beats`, `beat_id`/`id`, labels, and any additional prose. |
| Approval | Existing `Decision: Approve`, `step: 2`, `step_id: story`, matching `show_id`; `story_snapshot` is the canonical, recursively key-sorted serialization of that exact board. |
| Plan | `kind: hm-rhythm-plan`, `version: 1`, `mode: plan|stamp`, `show_id`, `target_s`, `impact_budget`, original `board`/`approval`, and `duration_map`. |
| Map entry | Stable `beat_id`, numeric `duration_s`, optional shipped `timing_pack`, boolean `soft_cam`. Unknown packs and inconsistent IDs fail before applying. |
| Project | `show.duration_target_s` and `show.rhythm.impact_budget` (integer 0–300), with `source: hm-rhythm-pacing` and `mode` after plan import. Atom `timing_hold` remains the shipped format. |

HM-PF-06 (#88) remains the upstream storyboard-authoring story. This change
consumes the already shipped PF-08 contract and existing human gate; it does
not claim to implement #88 or reproduce unavailable STORYBOARD-zh sources.
An approved external board may supply its GO record with `--go-file`.

## Timing and pack behavior

Full plans allocate time proportionally to the source durations, constrained
to the existing lint window of 0.1–3 seconds per clip. Integer 0.0001-second
ticks make the total equal the requested target. Fixed pack durations are not
stretched. Impossible targets fail with guidance to add/split beats or adjust
the target. Optional weights on a board alone default to 0.5 seconds; missing
durations on an actual source show are invalid, not guessed.

Stamp mode uses `HMComposeClient.applyTimingPack` with the selected beat IDs:

- Pack A `dialogue_film_slow`: at least 1.5 seconds, optional existing soft camera.
- Pack B `micro_cut_flurry`: 0.12-second flurry cuts; selected impacts use the
  shipped minimum 1.2-second hold and existing camera sequence.
- Every unselected clip keeps its duration. Stamping never fits or stretches the
  remaining show or freezes an unselected impact. Existing camera-chain reflow
  keeps continuity where timing changes require it.
- The target is retained unless explicitly changed, so a pack stamp can create
  an honest visible target delta. Applying a stale pack whose computed duration
  no longer matches the current source fails instead of substituting new timing.

## Meter and lint

The meter counts **impact clips** once each, using the shipped impact classes
and hooks, `timing_hold.kind: impact_hold`, and Wave1 `impacts/` hooks. Multiple
hooks on one clip consume one slot. Its impact-time readout sums those clips'
durations and updates with duration edits. The skill defaults its proposed
budget to the source impact count; the operator can choose any budget 0–300.
Over-budget is always a warning and never blocks bake.

`HMComposeClient.rhythmTiming(show)` returns numeric total/target/signed delta,
or `null` total/delta for missing/invalid durations. Target mismatch appears as
`duration_target_mismatch` in HF-03 and the Rhythm panel. Invalid targets are
structural lint findings; invalid durations retain `unsafe_duration`. Export
refuses invalid timing rather than reporting a false total or successful match.
The ordinary target-drift warning stays soft; the existing HF-06 structural
claim rules still apply to structural errors such as atom overruns.

## Verification

- `npm test` includes exact-sum, boundary allocation, GO/ID/pack rejection,
  engine-equivalent Pack A/B stamping, unselected-impact preservation, live
  budget arithmetic, signed target deltas, and CLI output safety.
- With `npm run dev`, run `node tests/rhythm-flow.browser.cjs` for the real
  approved-input → CLI → File API → Undo/edit → portable reopen path.
- Timing edits authored into a show also use the existing Frame-QA
  `lint → peek → claim` loop; outputs belong under ignored `work/qa/`.

Automated test GO records simulate a human click to verify behavior. They do
not authorize a creative storyboard, new plates, voice/#41, or automatic n8n
progression.

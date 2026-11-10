# HM-PF-45 proof — seekable preview + frame peek in bake QA

**Status:** DONE · FE-only · ready for review, not merged
**Branch:** `cursor/hm-pf-45-bake-qa-cap18-c676` (replay onto Cap18 tip `9f21c37`, HM-PF-29)
**Source:** cherry-pick of `c98899d` from PR #149, via Cap17 successor #174 (`5415dce`). #149 and #174 stay open
**Merge order:** HM-PF-40 is already shipped on Cap12. This successor stays unmerged for Cap after Cap 37.
**Story:** Bake QA uses the existing HF-01 frame peek and HF-02 scrub clock so Jack can judge a frame before export.

## What landed

| Artifact | Path |
|---|---|
| Shared snapshot | `HMComposeClient.bakeQaSnapshot` / `stripCellAt` in `public/ui/compose-client.js` |
| Bake QA dock | `#bakeQaDock` inside the export dialog (`public/ui/index.html`, `public/ui/exports.js`) |
| Reach it from the timeline | `#openBakeQa` on the frame peek strip |
| Contract | `SEEKABLE_PREVIEW_CONTRACT.surfaces` includes `bake_qa_dock` |
| Unit tests | `tests/hm-pf-45-bake-qa.test.cjs` |
| Browser check | `tests/hm-pf-45-bake-qa.browser.cjs` |

## Musts

1. **HF-01 / HF-02 from the compose dock.** Export → Bake QA. The scrub calls `HMStudio.renderAt(t, { source: 'bake-qa-dock' })`. Peek buttons call `HMStudio.seekToPeek`. **Frame peek strip** closes the dialog onto `#framePeekStrip`. `#openBakeQa` on the timeline strip opens the same dock.
2. **Imported strips and plate shows.** The 5.00s demo is a parity plate show (`parity_mode`). Pending strip cells crop the PNG at the same `t` (`cell 3/4` at 0.25s, 10 fps) and stay **NOT PLAYABLE**. The OpenPose kick pack (`daiyu-wang-10s-kicks-pose-pack`) peeks P01 mid / +0.3s end on the same clock. 40 peek cards (20 plates × 2).
3. **No separate CSS/GIF clock.** Dock `data-clock="renderAt"`. No `<img>` in the dock. Computed `animation-name` is `none`. A direct renderer call without `viaSoT` still soft-warns and does not block bake.
4. **FE-only.** No new API, no Workers compose backend, no `:8770`.

## Verification

- `node --test tests/hm-pf-45-bake-qa.test.cjs` → **4/4**
- `npm test` → **201/201** (Cap18 suite plus the 4 HM-PF-45 tests). Five-second demo stays 5.00s / 8 plates.
- `node tests/hm-pf-45-bake-qa.browser.cjs` → **PASS**
  - Scrub to 1.25s: `#scrub`, `HMStudio.time`, and `seekPreviewContract.lastEntry === 'bake-qa-dock'` with `lastRenderViaSoT === true`. Bake canvas pixels match the stage.
  - Peek click seeks to that peek's `t`. Duration stays 5.
  - Staged body strip: blue cell 3/4 at 0.25s, atoms still 8, strip not on the timeline.
  - Pose-ref plate pack: label `Plate show · pose pack`, P01 +0.3s end at 0.40s, 40 peek cards, duration 10.07s.

Screenshots: `ui-bake-qa-dock.png`, `ui-bake-qa-strip.png`, `ui-bake-qa-plate.png`.

## HOLDs

Voice / #41, HM-PF-27, HM-PF-28, HM-PF-47, HM-PF-48, SG-01, and 30a are unchanged. HM-PF-40 is already shipped on Cap12 and is not re-packaged here.

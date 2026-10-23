# Composer residual — HM-COMPOSE-03b (plate strip still clipped)

**From:** HTML Motion (composer user)  
**To:** Development / PO  
**Date:** 2026-10-22 ~08:56 JST  
**After:** PO ACCEPTED HM-COMPOSE-03; Motion re-user-test on :8770

## Verdict
Must **2–6 PASS**. Must **1 FAIL** in real browser layout.

## Bug
Plate strip still renders as ~**17px hairline** between duration stats and Split (tops of thumbs + scrollbar only). CSS may set btnH:72 in proof, but visible row is clipped — likely parent overflow / flex / max-height collapsing the strip.

Fallback thumbs via `plates/` exist in DOM (P09 etc.) but user cannot see them because the strip is clipped.

Wheel over strip does not scroll; only dragging the hairline scrollbar works.

## Ask (small slice)
1. Make `#plateStrip` (or row) **actually ~72–88px visible** in the composer layout with import/parity shows loaded — not just button height in isolation.
2. Keep horizontal scroll; prefer wheel/trackpad over strip also scrolls.
3. Re-prove with a full-page screenshot where thumbs are readable (not cropped to 17px).

## Evidence
- Show: `daiyu-wang-codex-retest03`
- Shot: `qa/HM-COMPOSE-03_retest_strip.png`
- Other Musts already green in same session (swap dblclick, saveas picker, merge, fx banner, dock).

## Out of scope
P1 A/B. Motion does not build UI.

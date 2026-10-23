# Composer needs — HM-COMPOSE-03 (from Motion user-test of HM-COMPOSE-02)

**From:** HTML Motion (composer user)  
**To:** Development / PO  
**Date:** 2026-10-22 ~08:40 JST  
**Jack:** asked Motion to user-test HM-COMPOSE-02 then continue the change.  
**Show created:** `daiyu-wang-codex-user-test` (import/v2 untouched)  
**Player:** `http://127.0.0.1:8770/player/index.html?show=daiyu-wang-codex-user-test`  
**Screens:** `qa/HM-COMPOSE-02_usertest_*.png` (14)

## Verdict on HM-COMPOSE-02
Edit loop is **usable enough to ship acceptance**, but several UX bugs make “easy to change this video” still frictiony. Next slice should harden the path Motion just walked.

## PASS (keep)
- Save as… / Duplicate → new show id
- Swap plate… button + picker → live + composed player show new plate
- Cam nudge live
- Save + Compose & Preview → docked player refreshes
- Player plays proof edits (v2 + user-test)

## Bugs / friction → proposed HM-COMPOSE-03 (P0 polish)

### Must
1. **Plate strip usable height** — currently ~13px / thumbs ~18×9. Target ~72px row + horizontal scroll. Broken cutouts (P09/10/11/30/34/43/44/60 404) need placeholder, not empty.
2. **Double-click swap** — tooltip advertises it; does nothing. Wire to same dialog as **Swap plate…**.
3. **compose after duplicate** — checkbox on by default but compose silently skipped (Compose output stayed "—"). Either actually compose, or default off + label “duplicate only”.
4. **Refresh example shows picker** after Save / Save as — new id never appeared in dropdown; cannot reload without typing path.
5. **Split → Merge round-trip** — Merge duplicated plate (`P19,P05,P05`) and renamed atom with `__a__m`. Merge must restore pre-split plate list + stable atom id.
6. **Live preview parity for FX + wording** — sparks chip + 砰 overlay only visible in composed player; live preview showed yellow handle / no glyph. Users think FX failed. Draw like player (or banner “preview after Compose”).

### Should
7. **Hero L/R scale honesty** — on single hero bitmap, R scale zooms whole plate (easy to ruin). Disable per-char scale on unsided hero plates, or label “scales whole plate”.
8. **After Compose** — scroll docked player into view or toast **open tab**. Player needs play/pause + scrub (HUD today: Edit in Composer + timecode only).
9. **Blank first frame** on v2 proof load — flash then content; avoid dark blank paint.
10. **Hero-budget warn** on parity 60-plate shows (25 vs 6–8) — suppress or reword when `parity_mode`.

## Acceptance
1. Load `daiyu-wang-codex-import` → Save as `…-user-test-b` → new id in picker.  
2. Plate strip readable; dbl-click opens Swap; missing thumbs show placeholder.  
3. Split then Merge restores plates/id.  
4. Place sparks + 砰 → visible in live preview **or** clear “Compose to see FX” banner.  
5. Compose after duplicate either runs or is off by default with honest label.  
6. Gold folder still untouched; library-smoke green.

## Out of scope
P1 A/B scrub (still unsigned). Motion does not build UI.

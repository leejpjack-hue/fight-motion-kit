# HM-COMPOSE-03 QA — Composer polish from HM-COMPOSE-02 user-test

**Date:** 2026-10-22 (Asia/Tokyo)  
**Kit:** `/workspace/deliverables/html-motion-template-kit-2026-10-19/`  
**Gold pack (untouched):** `/workspace/deliverables/fight-daiyu-wang-rooftop-tankshort-codex-html-2026-10-19/`  
**Owner:** Development (PO SIGNED)  
**Depends on:** HM-COMPOSE-02 ACCEPTED  
**Needs:** `feedback/composer-needs-hm-compose-03-usertest.md`  
**Story:** `/workspace/hr/html-motion/stories/HM-COMPOSE-03.md`

## What shipped

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Plate strip ~72px + horizontal scroll | **Must DONE** | CSS row height 72px / strip 88px; `flex-wrap:nowrap; overflow-x:auto` |
| 1b | Missing cutout thumbs not empty | **Must DONE** | Inventory: prefer `cutout/`, fall back `plates/`; true miss → `404 Pxx` placeholder |
| 2 | Double-click → Swap dialog | **Must DONE** | Fixed undefined `ai`/`pi` in dblclick closure; uses `dataset` |
| 3 | Compose-after-duplicate honest | **Must DONE** | Default **off**; label `also compose (off = duplicate only)`; compose failures keep modal open |
| 4 | Refresh example-shows picker after Save / Save as | **Must DONE** | `refreshExamplePicker()` always runs from `loadCatalog(keep)` |
| 5 | Split→Merge round-trip | **Must DONE** | `_split_orig` / `_pre_split_plates` / `_split_mate`; merge restores id + plates; no `__a__m` |
| 6 | FX + wording live honesty | **Must DONE** | Banner `#fxBanner`: “Compose to see FX …” when atom has `fx_hooks` (wording still live) |
| 7 | L/R scale honesty on unsided hero | **Should DONE** | Labels “scales whole plate” / “R sc (whole plate)” in insp + Characters |
| 8 | After Compose scroll / toast + transport | **Should DONE** | `scrollIntoView` + toast; dock **replay / pause@t / scrub** |
| 9 | Blank first-frame flash | **Should DONE** | Offscreen canvas paint then blit to `#pv` |
| 10 | Hero-budget warn in parity | **Should DONE** | Stats: `parity / plate-pack (budget N/A)` (compose.py already skipped) |

## Files changed

| File | Change |
|------|--------|
| `ui/index.html` | All Must + Should UI polish; `__composer` test hook |
| `qa/hm-compose-03-proof.py` | Playwright acceptance (system Chrome) |
| `qa/HM-COMPOSE-03-proof.json` | Machine evidence |
| `qa/HM-COMPOSE-03_*.png` | Screenshots |
| `composer/serve.py` | **unchanged** this slice (duplicate compose path already worked; honesty was UI) |
| `composer/compose.py` | **unchanged** (parity budget suppress already in HM-COMPOSE-01) |

Backups: `ui/index.html.bak-compose03`, `composer/serve.py.bak-compose03`.

## How to use

1. Open `http://127.0.0.1:8770/ui/index.html` → Load `daiyu-wang-codex-import`
2. **Save as…** → e.g. `…-user-test-b` (compose checkbox off by default) → new id appears in picker
3. Plate strip: ~72px thumbs, scroll horizontally; dbl-click opens Swap; cutout-missing IDs show `plates/` thumb
4. Split then Merge on a hero atom → same id + plates restored
5. Place sparks chip → yellow banner “Compose to see FX”; wording overlays still live
6. **Compose & Preview** → dock scrolls into view; use replay/scrub transport

## Acceptance proof (2026-10-22)

Runner: `python3 qa/hm-compose-03-proof.py` → **27/27 PASS** (`qa/HM-COMPOSE-03-proof.json`).

| Acceptance | Evidence |
|------------|----------|
| Save as `…-user-test-b` → picker | PASS — option `shows/daiyu-wang-codex-user-test-b.json` |
| Strip ~72px; dbl-click Swap; missing thumbs not empty | PASS — `btnH:72`, Swap modal on, P09–P60 via `plates/` |
| Split→Merge restores plates + id | PASS — `codex_01_low_rise` / `['P01','P02']` |
| sparks + 砰 → banner | PASS — `#fxBanner.on` “Compose to see FX (sparks)” |
| Duplicate compose honest | PASS — default off + label |
| Gold untouched; library-smoke dry | PASS — gold sha `708398461829c2ec`; smoke dry-ok, `parity_mode:false` |
| Re-prove Save-as→swap→compose (02) | PASS — `daiyu-wang-codex-proof03` compose ✓ 30s, overlays 2 |

### Screenshots
- `qa/HM-COMPOSE-03_plate-strip.png`
- `qa/HM-COMPOSE-03_fx-banner.png`
- `qa/HM-COMPOSE-03_composer.png`
- `qa/HM-COMPOSE-03_dock.png`

### Proof shows created (kit-local)
- `shows/daiyu-wang-codex-user-test-b.json` (+ assets symlink)
- `shows/daiyu-wang-codex-proof03.json` (+ composed `out/daiyu-wang-codex-proof03/`)

## Cap / out of scope
- Does **not** count toward SI / Ma Wan / DT daily caps.
- P1 A/B scrub, open-ref, 60-cutout preview perf: **NOT SIGNED**.
- No GenerateImage, no Origin/GitHub PRs, gold folder not edited.

## Deferred
None of Must/Should deferred. P1 backlog unchanged.

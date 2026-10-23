# HM-COMPOSE-03b QA — Plate strip actually visible (~72–88px) in layout

**Date:** 2026-10-22 (Asia/Tokyo)  
**Kit:** `/workspace/deliverables/html-motion-template-kit-2026-10-19/`  
**Gold pack (untouched):** `/workspace/deliverables/fight-daiyu-wang-rooftop-tankshort-codex-html-2026-10-19/`  
**Owner:** Development (PO SIGNED)  
**Depends on:** HM-COMPOSE-03 (Must 2–6 green; Must 1 FAIL in real layout)  
**Needs:** `feedback/composer-needs-hm-compose-03b-strip.md`  
**Story:** `/workspace/hr/html-motion/stories/HM-COMPOSE-03b.md`

## Problem (was)
HM-COMPOSE-03 set thumb height 72px / strip 88px and proof measured `btnH:72` in isolation. In the real Timeline flex column (`section { display:flex; flex-direction:column; min-height:0 }`), `#plateStrip` defaulted to `flex-shrink:1` and collapsed to a ~17px hairline (scrollbar + thumb tops only). Wheel over strip did not scroll horizontally.

## Fix
| Change | Detail |
|--------|--------|
| CSS | `#plateStrip { flex: 0 0 88px; flex-shrink: 0; min-height: 88px; height: 88px; max-height: 88px; … }` |
| Wheel | `wirePlateStripWheel()` — vertical/horizontal wheel over strip → `scrollLeft` with `preventDefault` |
| Hook | `window.__composer.plateStripMetrics()` — layout-visible `getBoundingClientRect` height for proofs |
| Kept | Missing-cutout → `plates/` / `404` placeholders from 03; Must 2 dbl-click Swap |

## Files changed
| File | Change |
|------|--------|
| `ui/index.html` | flex-shrink fix + wheel + metrics hook |
| `ui/index.html.bak-compose03b` | backup |
| `qa/hm-compose-03b-proof.py` | Playwright acceptance |
| `qa/HM-COMPOSE-03b-proof.json` | machine evidence |
| `qa/HM-COMPOSE-03b_strip.png` | full-page screenshot (readable thumbs) |
| `qa/HM-COMPOSE-03b_strip-crop.png` | strip-only crop |
| `qa/HM-COMPOSE-03b_strip-context.png` | stats → Split context |
| `qa/HM-COMPOSE-03b_strip-shortvp.png` | stress viewport 1280×650 |

## Acceptance proof (2026-10-22 Asia/Tokyo)

Runner: `python3 qa/hm-compose-03b-proof.py` → **12/12 PASS**.

Show: `daiyu-wang-codex-retest03` (viewport 1400×800 — short enough to reproduce the old collapse).

| Check | Result |
|-------|--------|
| Visible strip height (layout `getBoundingClientRect`) | **88px** (btnH 72) |
| `flex-shrink` | **0** / `flex: 0 0 88px` |
| Wheel → horizontal scroll | `scrollLeft 0 → 400` |
| P09/P30/P60 plates fallback | still via `plates/` |
| Dbl-click Swap (Must 2) | still opens `#platePick` |
| library-smoke dry | ok, `parity_mode: false` |
| Gold | sha `708398461829c2ec`, n=252 unchanged |

Short-viewport stress (1280×650): visibleH still **88**.

## How to verify by hand
1. Open `http://127.0.0.1:8770/ui/index.html` → Load `daiyu-wang-codex-import` or `daiyu-wang-codex-retest03`
2. Plate strip between duration bar and Split should show readable ~72px thumbs (not a hairline)
3. Wheel / trackpad over the strip scrolls horizontally
4. Dbl-click a thumb → Swap dialog

## Cap / out of scope
- Does **not** count toward SI / Ma Wan / DT caps.
- P1 A/B scrub still NOT SIGNED.
- Gold folder not edited. No agent messaging from this slice.

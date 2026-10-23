# HM-COMPOSE-06 QA — Mobile composer / player shell (Stitch 03)

**Date:** 2026-10-22 (Asia/Tokyo)  
**Kit:** `/workspace/deliverables/html-motion-template-kit-2026-10-19/`  
**Gold pack (untouched):** `/workspace/deliverables/fight-daiyu-wang-rooftop-tankshort-codex-html-2026-10-19/`  
**Owner:** Development (PO SIGNED)  
**Depends on:** HM-COMPOSE-05 desktop visual tokens/chrome  
**Pack SoT:** `/workspace/deliverables/html-motion-composer-ui-stitch-2026-10-22/`  
**Story:** `/workspace/hr/html-motion/stories/HM-COMPOSE-06.md`

## Problem (was)
Desktop 04/05 gave Jack-speed behavior + Stitch desktop chrome, but no usable single-column composer/player at phone width. Atom Picker rail and multi-column grid crushed the ≤60s path on ~390px.

## Fix (P0 — responsive CSS; keep 05/04 desktop)

| # | Change | Detail |
|---|--------|--------|
| 1 | Viewport + mobile media | `meta viewport`; `@media (max-width:640px)` single-column shell |
| 2 | Zone order | **stage → plate strip → beat controls → fixed Play/Pause/Compose dock** via `display:contents` + grid areas |
| 3 | No Atom Picker rail | `#atomPane` hidden on mobile; auto **Beat focus** when opening fight |
| 4 | Dock Compose | Orange **Compose** in fixed bottom dock (header Compose demoted on mobile); Play/Pause sentence-case kept |
| 5 | Palette locked | Same `:root` / DESIGN tokens as 05. No fake sync/BPM/GPU meters |
| 6 | Desktop untouched | Above 640px: 05 land shell, Open fight primacy, strip 88px, dock above fold — regression smoked |

Kept from 04/05: Open fight, Beat focus collapse, strip↔timeline sync, follow playhead, swap/cam/timing/compose, Jack bar ≤60s.

## Files changed
| File | Change |
|------|--------|
| `ui/index.html` | Mobile shell CSS + dock Compose + auto beat-focus + dock reparent |
| `ui/index.html.bak-compose06` | backup pre-06 |
| `qa/hm-compose-06-proof.py` | Playwright acceptance (mobile 390 + desktop regression) |
| `qa/HM-COMPOSE-06-proof.json` | machine evidence |
| `qa/HM-COMPOSE-06_mobile.png` | mobile full-page shell |
| `qa/HM-COMPOSE-06_mobile-composed.png` | after Compose dock |
| `qa/HM-COMPOSE-06_vs-stitch-03.png` | kit vs Stitch 03 |
| `qa/HM-COMPOSE-06_desktop-regression.png` | desktop strip/beat-focus smoke |

## Acceptance proof (2026-10-22 Asia/Tokyo)

Runner: `python3 qa/hm-compose-06-proof.py` → **17/17 PASS**.

Show: `daiyu-wang-codex-import` · viewport **390×844**

| Check | Result |
|-------|--------|
| `:root` ⊆ locked palette | 14 tokens, 0 bad |
| viewport meta + HM-COMPOSE-06 | present |
| mobile shell @390 | `isMobileShell` + `mobileShell` + auto beat focus |
| Atom Picker hidden | `display:none`; timeline list hidden |
| zone order | stage → strip → beat → dock |
| honesty + strip | on · visibleH **88** · 64 thumbs |
| Play / Pause / Compose dock | above fold (fixed bottom) |
| Jack bar ≤60s | **wall_time_s=0.98** |
| no fake meters | none |
| desktop regression | strip **88px**, Open fight, header Compose, dockCompose hidden |
| library-smoke dry | ok, not parity |
| Gold | sha `708398461829c2ec`, n=252 unchanged |

## How to verify by hand
1. Open `http://127.0.0.1:8770/ui/index.html` in a phone-width window (~390) or DevTools device mode  
2. **Open fight** → single column: stage, strip, cam/timing/swap, fixed **Compose** dock; no Atom Picker  
3. Tweak 1 plate / cam / timing → **Compose** → **Play** / **Pause**  
4. Widen past 640px → desktop 05 land / Open fight / strip 88px restored  

## Cap / out of scope
- Does **not** count toward SI / Ma Wan / DT caps.  
- Fake Stitch BPM / engine cards — not built.  
- P1/P2 unsigned. Gold folder not edited.

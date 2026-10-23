# HM-COMPOSE-05 QA — Desktop Stitch visual shell (land + beat-focus)

**Date:** 2026-10-22 (Asia/Tokyo)  
**Kit:** `/workspace/deliverables/html-motion-template-kit-2026-10-19/`  
**Gold pack (untouched):** `/workspace/deliverables/fight-daiyu-wang-rooftop-tankshort-codex-html-2026-10-19/`  
**Owner:** Development (PO SIGNED)  
**Depends on:** HM-COMPOSE-04 ACCEPTED  
**Pack SoT:** `/workspace/deliverables/html-motion-composer-ui-stitch-2026-10-22/`  
**Story:** `/workspace/hr/html-motion/stories/HM-COMPOSE-05.md`

## Problem (was)
04 shipped Jack-speed *behavior*; desktop chrome still read as kitchen-sink power-user (equal-weight Load/New/Undo…), not Stitch land / Beat-focus tool look. Jev soft note: keep **Open fight** primacy + **Play/Pause dock above the fold**.

## Fix (P0 chrome only — keep 04 behavior)

| # | Change | Detail |
|---|--------|--------|
| 1 | Land / Open fight shell | Cold open (no deep link) shows `#landShell`: Continue-last hero + pinned (3) + recent (4) plate-pack cards. Show **preloaded** so Open is instant. |
| 2 | Header demotion | Teal-filled **Open fight** primary; **Compose & preview** secondary accent; Load/New/Undo/Save/Export… behind **More ▾** overflow. |
| 3 | Beat-focus chrome | Inspector retitled ACTIVE; Show grp hidden; Cam / Timing / Swap section groups; FX honesty bar under header; strip ≥88px kept. |
| 4 | Dock above fold | Transport first in dock; sticky + `ensureDockInView` after Compose; live preview shrinks when docked. |
| 5 | Palette locked | `:root` full hex from DESIGN only (`#77ffdd` acc, fx-warn tokens). No fake sync%/GPU/ACES meters. |

Kept from 04: Open fight, Beat focus collapse, strip↔timeline sync, follow playhead, sentence-case Play/Pause, Jack bar ≤60s.

## Files changed
| File | Change |
|------|--------|
| `ui/index.html` | Desktop Stitch visual shell |
| `ui/index.html.bak-compose05` | backup |
| `qa/hm-compose-05-proof.py` | Playwright acceptance |
| `qa/HM-COMPOSE-05-proof.json` | machine evidence |
| `qa/HM-COMPOSE-05_land.png` | land shell |
| `qa/HM-COMPOSE-05_beat-focus.png` | beat-focus composer |
| `qa/HM-COMPOSE-05_dock-above-fold.png` | Play/Pause above fold |
| `qa/HM-COMPOSE-05_vs-stitch-01-land.png` | kit vs Stitch 01 |
| `qa/HM-COMPOSE-05_vs-stitch-02-beat-focus.png` | kit vs Stitch 02 |

## Acceptance proof (2026-10-22 Asia/Tokyo)

Runner: `python3 qa/hm-compose-05-proof.py` → **19/19 PASS**.

Show: `daiyu-wang-codex-import`

| Check | Result |
|-------|--------|
| `:root` ⊆ locked palette | 14 tokens, 0 bad |
| Cold land shell | Continue `daiyu-wang-codex-import` · 3 pinned · 4 recent |
| Cold land preload (04) | plate-pack preloaded under shell |
| Open fight primacy | teal fill `rgb(119,255,221)` · tools behind More |
| Open → composer | honesty on · strip 62 thumbs |
| Beat focus | Atom Picker collapsed · Cam/Timing/Swap groups · ACTIVE badge |
| Strip 88px | visibleH **88**, flexShrink **0** |
| Dock Play/Pause | above fold after Compose |
| Jack bar ≤60s | **wall_time_s=1.35** |
| No fake meters | none |
| library-smoke dry | ok, not parity |
| Gold | sha `708398461829c2ec`, n=252 unchanged |

## How to verify by hand
1. Open `http://127.0.0.1:8770/ui/index.html` (cold) → land shell with Continue last + cards  
2. **Open fight** (or card Open) → composer; honesty banner; strip  
3. **Beat focus** → inspector ACTIVE; Cam/Timing/Swap; Atom Picker collapsed  
4. Edit 1 plate / 1 cam / 1 timing → **Compose & preview** → **Play** / **Pause** / scrub visible without scroll  

## Cap / out of scope
- Does **not** count toward SI / Ma Wan / DT caps.  
- Mobile → **HM-COMPOSE-06** (not built).  
- Fake Stitch meters, P1 A/B scrub / live FX / jump chips — not built.  
- Gold folder not edited.

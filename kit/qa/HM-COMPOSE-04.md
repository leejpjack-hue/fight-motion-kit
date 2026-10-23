# HM-COMPOSE-04 QA — Happy path: open fight + beat focus + strip sync + Play/Pause

**Date:** 2026-10-22 (Asia/Tokyo)  
**Kit:** `/workspace/deliverables/html-motion-template-kit-2026-10-19/`  
**Gold pack (untouched):** `/workspace/deliverables/fight-daiyu-wang-rooftop-tankshort-codex-html-2026-10-19/`  
**Owner:** Development (PO SIGNED P0 only)  
**Depends on:** HM-COMPOSE-03b ACCEPTED  
**Needs:** `feedback/composer-ux-user-view-2026-10-22.md`  
**Story:** `/workspace/hr/html-motion/stories/HM-COMPOSE-04.md`

## Problem (was)
Power-user usable, not easy. Cold land on `editor-features`; first 30s hunting show id; dense chrome; strip not synced to timeline; dock transport labeled `replay` / `pause@t`.

## Fix (P0 only — subtract / IA)

| # | Change | Detail |
|---|--------|--------|
| 1 | Open fight / pin recent | Land prefers recent → `daiyu-wang-codex-import` → any Codex pack (not editor-features). Header **Open fight** one-click. `localStorage` remembers last plate-pack. |
| 2 | Beat focus | `#beatFocusBtn` toggles `body.beatFocus`: collapses Atom Picker, hides secondary aside groups + A/B chrome; keeps strip + cam + timing + swap + Selected atom. Exit restores prior collapse state. |
| 3 | Strip ↔ timeline sync | Selected atom plates get `.atomOn` strong highlight; strip scrolls them into view. Optional **follow playhead** keeps scrub plate in view (ticker while Play). |
| 4 | Plain Play / Pause | Dock buttons relabeled; `ensureDockInView()` after Compose (`block:start` + rAF). |

Kept from 03/03b: strip `flex:0 0 88px`, wheel scroll, dbl-click Swap.

## Files changed
| File | Change |
|------|--------|
| `ui/index.html` | P0 UX (land, Open fight, Beat focus, strip sync, Play/Pause) |
| `ui/index.html.bak-compose04` | backup |
| `qa/hm-compose-04-proof.py` | Playwright acceptance |
| `qa/HM-COMPOSE-04-proof.json` | machine evidence |
| `qa/HM-COMPOSE-04_land.png` | cold land on Codex import |
| `qa/HM-COMPOSE-04_focus-on.png` | Beat focus on |
| `qa/HM-COMPOSE-04_focus-off.png` | Beat focus off |
| `qa/HM-COMPOSE-04_strip-sync.png` | strip atomOn sync crop |
| `qa/HM-COMPOSE-04_dock-labels.png` | dock Play/Pause after Compose |

## Acceptance proof (2026-10-22 Asia/Tokyo)

Runner: `python3 qa/hm-compose-04-proof.py` → **18/18 PASS**.

Show: `daiyu-wang-codex-import`

| Check | Result |
|-------|--------|
| Cold land | `daiyu-wang-codex-import` (not editor-features) |
| Open fight | 60 thumbs strip on |
| Beat focus on | Atom Picker collapsed; strip+cam+timing+swap usable |
| Beat focus off | chrome restored |
| Strip sync | atomOn highlight + in view (e.g. P51 @ scrollLeft 6469) |
| Follow playhead | scrub 16.5s → P34 in view |
| Dock labels | **Play** / **Pause** |
| Compose → dock in view | yes |
| Jack bar ≤60s | **wall_time_s=1.46** (swap + cam + timing + Compose → dock) |
| Strip 03b intact | visibleH **88**, flexShrink **0** |
| library-smoke dry | ok, not parity |
| Gold | sha `708398461829c2ec`, n=252 unchanged |

## How to verify by hand
1. Open `http://127.0.0.1:8770/ui/index.html` (cold) → lands on Codex import / recent fight  
2. Or click **Open fight**  
3. Select a timeline atom → strip scrolls + strong highlight  
4. **Beat focus** → left rail collapses; exit restores  
5. Edit 1 plate / 1 cam / 1 timing → **Compose & Preview** → dock shows **Play** / **Pause** in view  

## Cap / out of scope
- Does **not** count toward SI / Ma Wan / DT caps.  
- P1 A/B scrub, live FX stand-ins, jump chips — NOT SIGNED / not built.  
- P2 hide picker permanently, hide L/R, dirty-beat checklist — not built.  
- Gold folder not edited.

# HM-COMPOSE-07 QA — Frontend-only product path

**Date:** 2026-10-23 (Asia/Tokyo)  
**Kit:** `/workspace/deliverables/html-motion-template-kit-2026-10-19/`  
**Deploy:** `https://html-motion-composer.leejpjack.workers.dev/ui/`  
**Gold pack (untouched):** `/workspace/deliverables/fight-daiyu-wang-rooftop-tankshort-codex-html-2026-10-19/`  
**Owner:** Development (PO SIGNED)  
**Architecture SoT:** `/workspace/hr/html-motion/architecture/FRONTEND-ONLY-2026-10-23.md`  
**Story:** `/workspace/hr/html-motion/stories/HM-COMPOSE-07.md`

## Problem (was)
Workers UI loaded, but Compose/Save/Upload were **501 stubs**. Jack bar needed VPS `:8770` / `api.teqcon.uk`. Jack (via CoS): drop the backend API — product is static frontend only.

## Fix (P0)

| # | Change | Detail |
|---|--------|--------|
| 1 | Static product path | `/catalog.json` + `/plates.json` baked; UI does not call `/api/compose|save|upload|duplicate|import_pack|catalog` on Jack bar |
| 2 | In-browser compose | `ui/compose-client.js` ports hero/parity/plate-pack path from `composer/compose.py` |
| 3 | Persistence | `ui/fe-store.js` — localStorage out + local shows; Save uses download / File System Access |
| 4 | Duplicate / import | In-browser duplicate; folder File API import (zip fail-closed with plain language) |
| 5 | Honest FE-only | Status: `frontend-only · in-browser compose`; Pillow wording / setup / upload fail closed |
| 6 | Player | Prefer `localStorage` composed out, then static `/out/<id>/` |
| 7 | Regression | 05 desktop + 06 mobile chrome kept; gold untouched |

`composer/serve.py` + `compose.py` remain **optional QA/oracle**, not product.

## Files changed
| File | Change |
|------|--------|
| `ui/compose-client.js` | **new** — JS compose (hero/parity) |
| `ui/fe-store.js` | **new** — localStorage / File API persistence |
| `ui/index.html` | FE-only catalog, compose, save, dup, import; backup `.bak-compose07` |
| `player/index.html` | Prefer FE out store |
| `catalog.json` / `plates.json` | Baked at kit root + deploy `public/` |
| `deploy/.../public/ui/*` | Synced + `wrangler deploy` |
| `deploy/.../src/worker.js` | Honest FE-only stub copy (writes unused) |
| `qa/hm-compose-07-proof.py` | Playwright acceptance (Workers primary) |
| `README.md` | Product = static; serve.py optional QA |

## Acceptance proof (2026-10-23 Asia/Tokyo)

Runner: `HM_COMPOSE_07_FORCE=1 python3 qa/hm-compose-07-proof.py` → **25/25 PASS**.

Host: `https://html-motion-composer.leejpjack.workers.dev (workers)`  
Show: `daiyu-wang-codex-import`  
Jack bar wall: **1.803s** (compose 0.052s)

| Check | Result |
|-------|--------|
| FE-only status | ready · frontend-only · in-browser compose |
| Open fight → Codex pack | yes |
| 05 Open fight primacy | teal fill preserved |
| Beat focus | collapses Atom Picker |
| Compose engine | `js-fe` · parity · 31.5s · 63 plates |
| Dock Play/Pause | on after compose |
| Zero product `/api/*` | yes |
| No api.teqcon.uk / :8770 | yes |
| Save localStorage | yes |
| Duplicate in-browser | `hm-compose-07-dup` |
| Gold | sha `708398461829c2ec`, n=252 unchanged |

Screenshots: `qa/HM-COMPOSE-07_workers_composed.png`, `qa/HM-COMPOSE-07_workers_dock.png`  
Machine evidence: `qa/HM-COMPOSE-07-proof.json`

## How to verify by hand
1. Open https://html-motion-composer.leejpjack.workers.dev/ui/ (cold) → land shell  
2. **Open fight** → strip + inspector  
3. Swap 1 plate, nudge cam, tweak timing → **Compose & preview** → **Play** / **Pause**  
4. DevTools Network: no `/api/compose`, `/api/save`, etc.  
5. Optional local: `python3 -m http.server 8765` at kit root (not `serve.py`)

## Cap / out of scope
- Does **not** count toward SI / Ma Wan / DT.  
- P1/P2, mobile residuals 6–8, Pillow wording server — NOT SIGNED / fail closed.  
- Gold folder not edited.

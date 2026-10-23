# HM-COMPOSE-01 QA — Import plate pack + parity compose + per-plate bg

**Date:** 2026-10-22 (Asia/Tokyo)  
**Kit:** `/workspace/deliverables/html-motion-template-kit-2026-10-19/`  
**Gold pack:** `/workspace/deliverables/fight-daiyu-wang-rooftop-tankshort-codex-html-2026-10-19/`  
**Owner:** Development (PO SIGNED)

## What shipped

| # | Change | Files |
|---|--------|-------|
| 1 | Import Codex folder/zip → `assets/<id>/` + `shows/<id>.json` + compose | `scripts/import_plate_pack.py`, `composer/serve.py` (`POST /api/import_pack`), `ui/index.html` (Import plate pack panel) |
| 2 | Parity / plate-pack compose mode: 0 hero-budget warns on full ~60-plate hero shows | `composer/compose.py` (`parity_mode` / `compose_mode:"parity"` / auto-detect) |
| 3 | Per-plate `bg` / `bg_zoom` from imported `layout.json` (overrides `swap_t`) | `composer/compose.py` (`map_layout_bg_to_key`) |

Assets are **symlinked** by default (optional `copy: true`). Gold source folder is never edited.

## How to import (≤2 clicks / ≤2 API steps)

### UI (≤2 clicks)
1. Open `http://127.0.0.1:8770/ui/index.html`
2. Aside → **Import plate pack**: set `show_id`, paste source folder path (or pick a zip), click **Import & compose**

### API (1 step)
```bash
curl -s -X POST http://127.0.0.1:8770/api/import_pack \
  -H 'Content-Type: application/json' \
  -d '{
    "show_id": "daiyu-wang-codex-import",
    "source_path": "/workspace/deliverables/fight-daiyu-wang-rooftop-tankshort-codex-html-2026-10-19",
    "compose": true
  }'
```

### CLI
```bash
cd /workspace/deliverables/html-motion-template-kit-2026-10-19
python3 scripts/import_plate_pack.py \
  --source /workspace/deliverables/fight-daiyu-wang-rooftop-tankshort-codex-html-2026-10-19 \
  --show-id daiyu-wang-codex-import
```

Player: `http://127.0.0.1:8770/player/index.html?show=daiyu-wang-codex-import`

## Acceptance proof (2026-10-22)

### 1. Import → playable ?show=
- POST `/api/import_pack` with gold folder → `ok: true`
- Show: `shows/daiyu-wang-codex-import.json`
- Assets: `assets/daiyu-wang-codex-import/{bg,cutout,plates,layout.json}` → symlinks into gold (no copy, gold untouched)
- HTTP 200: player, `out/.../timeline.json`, cutout `P01.png`, `bg_rooftop.png`
- Zip path also proven: show `daiyu-wang-codex-zip` (zip via `zip_b64`)

### 2. Parity compose: 0 budget errors / 0 budget warns
```
budget_errors: 0
budget_warns: 0
warnings: []
stats: {atoms:25, hero_atoms:25, plates:60, parity_mode:true, hero_budget:[6.0,8.0]}
```
Recompose of pre-existing `daiyu-wang-codex` (no flag): auto-detect parity → `warnings: []`.  
Library control: `library-smoke` stays `parity_mode: false` and still emits its draft/budget warns (unchanged).

### 3. Per-plate bg mid-atom vs gold
Atom `codex_18_box_side_pan` spans **P37@18.0s** and **P38@18.5s** (mid-atom bg change).

| Plate | t | gold `layout.json` bg | composed `out/.../layout.json` bg key |
|-------|---|------------------------|----------------------------------------|
| P37 / S037 | 18.0 | `bg_rooftop` | `base` → `bg_rooftop.png` |
| P38 / S038 | 18.5 | `bg_rooftop_dented` | `swap` → `bg_rooftop_dented.png` |

**Override proof:** recomposed with deliberate wrong `swap_t: 0` (would force all-swap if swap_t-only). Result still `S001=base`, `S037=base`, `S038=swap` — per-plate `bg` wins.

`bg_zoom` also copied for P19/P22/P36/P57/P58/P59 (1.9).

## Remaining non-budget WARNs
None on the imported parity shows (`warnings: []`).

Out of this slice (P1/P2 backlog): A/B scrub, open-ref, 60-cutout preview perf, cam verify, FX inspector, L/R alias HUD.

## Reproduce
```bash
# server (if not already up)
python3 composer/serve.py --port 8770

# import + compose
curl -s -X POST http://127.0.0.1:8770/api/import_pack -H 'Content-Type: application/json' \
  -d '{"show_id":"daiyu-wang-codex-import","source_path":"/workspace/deliverables/fight-daiyu-wang-rooftop-tankshort-codex-html-2026-10-19"}' | python3 -m json.tool

# play
open 'http://127.0.0.1:8770/player/index.html?show=daiyu-wang-codex-import'
# scrub to t=18.0 (rooftop) vs t=18.5 (dented) — mid-atom in box_side_pan
```

## Zip import note
Zip extracts land under `uploads/packs/<show_id>/` (durable). Default asset links under `assets/<show_id>/` point there so they survive after import. Folder imports symlink straight to the source pack (gold untouched).

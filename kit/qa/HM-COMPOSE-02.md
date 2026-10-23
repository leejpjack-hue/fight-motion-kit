# HM-COMPOSE-02 QA — Easy edit loop on imported Codex plate-pack show

**Date:** 2026-10-22 (Asia/Tokyo)  
**Kit:** `/workspace/deliverables/html-motion-template-kit-2026-10-19/`  
**Gold pack (untouched):** `/workspace/deliverables/fight-daiyu-wang-rooftop-tankshort-codex-html-2026-10-19/`  
**Owner:** Development (PO SIGNED)  
**Depends on:** HM-COMPOSE-01 ACCEPTED

## What shipped

| # | Feature | Files |
|---|---------|-------|
| 1 | **Duplicate / Save as** — new show id; assets symlinked; gold untouched | `composer/serve.py` (`POST /api/duplicate`), `ui/index.html` (Save as… modal) |
| 2 | **Plate strip / swap** — P01–P60 thumbs; click select / dbl-click or Swap plate… picker from `cutout/` or `plates/` | `serve.py` (`GET /api/plates`), `ui/index.html` (`#plateStrip`, `#platePick`) |
| 3 | **Per-slot timing** — 0.5–3s grid, ±, Split / Merge→ adjacent hero atoms; duration warn vs ~30s | `ui/index.html` (`setAtomDuration`, `splitSelectedAtom`, `mergeWithNext`) |
| 4 | **Camera on selection** — preset + live `nudge x/y/s/r`; baked into compose curves | `ui/index.html` (insp cam), `compose.py` (`apply_cam_nudge`) |
| 5 | **L/R framing on hero/parity** — same Characters / char_overrides controls; pair framing for unsided Codex plates; `full` plates materialize as parts when scaled | `compose.py` (`apply_layout_transforms`), live hero preview in `ui/index.html` |
| 6 | **FX / wording on beats** — fx chips place at scrub `t_rel`; wording overlays via existing dock | `ui/index.html` (fx chips + overlays v3) |

## How to use (happy path, UI only)

1. Open `http://127.0.0.1:8770/ui/index.html` → Load `daiyu-wang-codex-import`
2. Header **Save as…** → e.g. `daiyu-wang-codex-v2` → Duplicate (compose on)
3. Plate strip: click a thumb to scrub; double-click (or **Swap plate…**) → pick from cutout/plates → Use selected
4. Selected atom: duration ±0.5 / Split / Merge→; camera preset + nudge (live preview); Characters R scale; fx chips / wording overlays
5. **Save** then **Compose & Preview** → docked player / tab shows changes

### API equivalents

```bash
# Duplicate
curl -s -X POST http://127.0.0.1:8770/api/duplicate \
  -H 'Content-Type: application/json' \
  -d '{"from_id":"daiyu-wang-codex-import","to_id":"daiyu-wang-codex-v2","compose":true}'

# Plate inventory
curl -s 'http://127.0.0.1:8770/api/plates?show=daiyu-wang-codex-v2' | python3 -m json.tool | head

# Compose after UI/API edits (show JSON body)
curl -s -X POST http://127.0.0.1:8770/api/compose -H 'Content-Type: application/json' \
  -d @- <<'JSON'
{"show": { ...edited show... }, "save": true}
JSON
```

Player: `http://127.0.0.1:8770/player/index.html?show=daiyu-wang-codex-v2`

## Acceptance proof (2026-10-22)

Show used: **`daiyu-wang-codex-v2`** (Save-as from `daiyu-wang-codex-import`).  
Machine evidence: `qa/HM-COMPOSE-02-proof.json`

### 1. Open import / Save-as variant in composer
- Duplicate API → `shows/daiyu-wang-codex-v2.json`
- `assets/daiyu-wang-codex-v2` → symlink to `assets/daiyu-wang-codex-import`
- UI controls present: `dupShowBtn`, `plateStrip`, `nudgeX`, `swapPlateBtn`, `splitAtomBtn`
- Screenshot: `qa/HM-COMPOSE-02_composer_v2.png`, `qa/HM-COMPOSE-02_save_as_modal.png`

### 2. From edit path: 3 plate swaps + 2 cam nudges + 1 L/R scale + 2 SFX
| Edit | Detail |
|------|--------|
| Swap 1 | `codex_01_low_rise` slot0 → **P12** (composed `S001`) |
| Swap 2 | `codex_02_eye_orbit` slot0 → **P40** (`S003`) |
| Swap 3 | `codex_03_eye_push` slot0 → **P50** (`S005`) |
| Cam 1 | `codex_01_low_rise` nudge `{x:40,y:-20,s:0.08,r:3}` → curves y `150→-20`, s `1.48→1.20` |
| Cam 2 | `codex_04_ecu_fist_lens` nudge `{x:-30,y:10,s:-0.05,r:-2}` |
| L/R | `chars.R.transform.scale = 1.15` → pair scale on unsided parts; `S001` part w `1246 → 1432.9` (ratio **1.15**) |
| SFX | overlays `ov_proof_bang` @ **t=1.0–2.2**, `ov_proof_clash` @ **t=5.0–6.0**; plus dust/sparks hooks on atom 4 |

### 3. Save + Compose & Preview → player shows changes
- Compose: `ok`, `duration_s: 30`, `parity_mode: true`, `overlays: 2`, `warnings: []`
- Player HTTP 200: `/player/index.html?show=daiyu-wang-codex-v2`
- Screenshots:
  - `qa/HM-COMPOSE-02_player_t0_swap.png` — opening plate after swap
  - `qa/HM-COMPOSE-02_player_t1.2_bang.png` — BANG overlay window
  - `qa/HM-COMPOSE-02_player_t5.2_clash.png` — 砰 overlay window

### 4. Gold folder untouched
| Check | Value |
|-------|-------|
| `index.html` sha256 | `2258b73ba513a39d4b643682f018d3d0391779957949433e82d38c5f6e441fd6` |
| newest mtime + nfiles | unchanged before/after proof (`nfiles=252`) |

### 5. Library / pose-library paths still green
- `library-smoke` dry compose: `ok`, `parity_mode: false` (budget path unchanged)
- Catalog still lists `library-smoke` and `editor-features`
- Plate-strip UI gated on plate-pack / parity (`isPlatePackShow()`)

### 6. Split timing sanity
- Split first 1s atom → 0.5+0.5; dry compose still `ok`, 26 atoms / 60 plates / parity

## Leftover gaps (not blocking)
- Live preview for hero plates draws cutouts with pair framing; composed player remains source of truth for FX particle systems (dust/sparks) and full cam curves.
- Optional camBase-at-t readout (P2) not built — nudge + live cam HUD is enough.
- P1 A/B scrub / open-ref / 60-cutout preview perf still NOT SIGNED.

## Reproduce
```bash
cd /workspace/deliverables/html-motion-template-kit-2026-10-19
python3 composer/serve.py --port 8770
# then UI Save as + edits, or re-run the proof edits against daiyu-wang-codex-v2
open 'http://127.0.0.1:8770/ui/index.html'
open 'http://127.0.0.1:8770/player/index.html?show=daiyu-wang-codex-v2&t=1.2'
```

## UI smoke (Playwright / Chrome channel)
- `wireV4Controls()` now runs on `loadCatalog().then` (was previously defined but never called — also unblocked Import/Setup handlers).
- Loaded `daiyu-wang-codex-v2`: plate strip **on** with **60** thumbs; Save as modal opens; plate picker lists **54** cutouts; cam nudge fields present; `library-smoke` keeps plate strip **off**.

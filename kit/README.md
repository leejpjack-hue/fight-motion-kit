# HTML Motion Template Kit: P0

P0 build, 19 Oct 2026 HKT. Jack approved P0 at 18:36 HKT and added the UI at 18:37 HKT.
Locked decisions are in `TAXONOMY-DRAFT.md`. P0 makes no GenerateImage calls, opens no PRs and leaves the source show untouched (assets are copied).


## Product path (HM-COMPOSE-07 — frontend-only)
The **product** host is static (Cloudflare Workers): `https://html-motion-composer.leejpjack.workers.dev/ui/`.
Compose / Save / Duplicate / Import run **in the browser** (`ui/compose-client.js` + `ui/fe-store.js`). No `api.teqcon.uk`, no VPS `:8770`, no `/api/compose` on the happy path.

```bash
# Local static check (no serve.py):
cd /workspace/deliverables/html-motion-template-kit-2026-10-19
python3 -m http.server 8765
# open http://127.0.0.1:8765/ui/index.html
```

`composer/serve.py` + `composer/compose.py` remain **optional local/QA tools** (oracle / Pillow wording / library-mode). Not required for Jack bar on Workers.

## Quick start
```bash
cd /workspace/deliverables/html-motion-template-kit-2026-10-19
# CLI compose: show spec -> out/<show_id>/{layout,timeline}.json
python3 composer/compose.py shows/zhao-hua-parity.json
python3 composer/compose.py shows/library-smoke.json
# Optional QA only (NOT product): UI + /api/* via serve.py
python3 composer/serve.py --port 8770
#   http://127.0.0.1:8770/ui/index.html
#   http://127.0.0.1:8770/player/index.html?show=zhao-hua-parity
```
The player needs any HTTP server, because it `fetch`es JSON. `python3 -m http.server` at the kit root works too. In that static mode the UI can still pick atoms, edit the timeline and export JSON, but **Compose** is disabled. The UI also logs one expected 404 from the `/api/catalog` probe.
Needs `jsonschema` for validation (`pip install --user --break-system-packages jsonschema`). Without it, compose prints a warning and skips schema checks.

## Folder map
| Path | What |
|---|---|
| `schema/atom.schema.json` | One atom (1, 1.5 or 2 s = 2, 3 or 4 plates): family, pose_mode library\|hero, poses{L,R} (one id or one per plate), contact rule, camera preset + params / u_range / compound segments, fx_hooks (t_rel normalised 0..1), compat tags |
| `schema/show.schema.json` | Show: atoms, chars L/R (+ optional `transform`), `overlays[]`, bg, 30–60 s target, `draft` |
| `schema/pose_library.schema.json` | Per pose: pose_id, png, facing, foot_anchor_xy, hand_hit_xy, head_xy, scale, beat_tags |
| `presets/camera_presets.json` | 25 camera presets as parametric curves (x, y, s, r over u = 0..1). Curve types: const / lerp(ease) / saw / sin / alt_bump. `comment` names the camBase segment; `derived:false` = invented |
| `presets/fx_presets.json` | 14 named FX hooks: hit_orange/pink (hit-stop 2f + flash + shake + burst), hitstop_2f, flash_*, bg_flash_blue/teal, shake, smear_trail, dust, speed_lines, sparks, fence_shake, pink_cut. Ghost smear, motion blur and parallax are built into the player |
| `composer/compose.py` | Composer + validator (schema, plates = 2×dur, 30–60 s guard, hero budget 6–8 per 30 s warning, library placement) |
| `composer/serve.py` | UI server: catalog/compose/save/upload + `POST /api/wording` (Pillow gen) + `GET /api/composed` |
| `player/index.html` | Generalised player. `?show=<id>` reads `../out/<id>/timeline.json` + `layout.json`; `&capture` = deterministic `renderAt(t)` |
| `ui/index.html` | Composer UI (vanilla JS, dark theme) |
| `shows/` | `zhao-hua-parity.json` (25 hero atoms), `library-smoke.json` (placeholder duo draft), `hua-fei-library-smoke.json` (Sprite Forge real zhao-min + hua-fei, 4 library atoms), `editor-features.json`, `wording-fx.json` (Editor v3 artificial wording), `ui-test.json`, `head-cu-30s.json` (30s ~70% head-CU library fight 趙敏 vs 華妃) |
| `libraries/placeholder-{zhao,hua}/` | **PLACEHOLDER** pose libraries (7 poses each) |
| `assets/zhao-hua/` | Copies of the source show's cutout/, plates/, bg/ and html/layout.json (112 MB, local only) |
| `assets/wording/` | Sample transparent wording PNGs (砰 / CLASH / 終) for overlay demos |
| `scripts/` | build_presets, make_parity_show, make_placeholder_library, qa_parity, qa_parity_sweep, qa_shots, qa_ui, qa_serve_check |
| `qa/` | parity_compare.png, p0_strip.png, library_smoke.png, ui.png, ui_preview.png, placeholder_library_anchors.png and JSON results |
| `pose_library/` | Sprite Forge real packs: `hua-fei/` + `zhao-min/` (30 poses each + `pose_library.json` schema wrap). Catalog scans `pose_library/*/pose_library.json`. |

## Timeline output
`timeline.json` contains:
- `atoms[].cam[]`: resolved curve segments (`t0,t1,u0,u1,curves`)
- `plates[]`: S001… plate times at 2 plates/s
- `fx{hits,flash,hitstop,shake,bgflash,dust,sparks,speed,fence,trails,pink_cut}`: absolute event times
- `cam_keys`: coarse keyframes every 0.25 s, for inspection only (the player evaluates the curves exactly)
- `stats`, `warnings`

`layout.json` is keyed by plate. Each entry is the same shape as the rooftop layout, plus `atom`, `pose_mode`, `source_plate`, `contact` (library only), `flip` (per part) and `slate` (pending hero plate).

## Real vs placeholder
- **Real:**
  - schemas, the 25 camera presets (20 transcribed from camBase, 5 invented), FX hooks, composer, player, UI
  - parity show over the real approved plates P01–P60
  - **Sprite Forge pose libraries (shipped 2026-10-20):**
    - `pose_library/hua-fei/pose_library.json` — 華妃, 30 poses, `placeholder: false`, canvas 768², baseline y=720, facing left
    - `pose_library/zhao-min/pose_library.json` — 趙敏, 30 poses, `placeholder: false`, canvas 768², baseline y=720, facing right
    - Smoke: `shows/hua-fei-library-smoke.json` → `out/hua-fei-library-smoke/` (L=zhao-min, R=hua-fei)
    - **DRIFT (zhao-min):** `parry.png` still has black wrist cuffs — paint failed; Jack SHIP as-is (restored byte-identical to `raw/parry.before-paint.png`). See `pose_library/zhao-min/DRIFT.md`.
- **Placeholder:**
  - `libraries/placeholder-*` remain for plumbing / older demos (`shows/library-smoke.json`). Crops split from duo cutouts with auto-estimated anchors; `hua_knee` still contains a sliver of Zhao's fist. Prefer the Sprite Forge packs above for new shows.
- **Pending hero:**
  - a hero atom with no plates renders as a striped `HERO PENDING` slate and composes with a warning. Plate generation still goes through the existing pipeline after storyboard approval.

## Parity result (key proof)
`shows/zhao-hua-parity.json` re-expresses the approved 30 s film as 25 hero atoms:
- 21 × 1 s and 2 × 1.5 s atoms
- 4 × 2 s atoms, including the 3 s and 4 s camBase segments split with `u_range`
- one compound camera atom (`low_dive_under` 0.5 s + `upward_inside` 1 s), because the 0.5 s camBase segment can't be an atom on its own

Results:
- **Camera:** compared with the original `camBase(t)` at 24 fps over all 720 frames. Max abs diff x/y/s/r = 2e-13 / 7e-15 / 0 / 0.
- **FX:** event arrays HITS, BGFLASH, DUST, SPARKS, FENCE and TRAILS are identical. SPEED is identical except the 26–30 s radial span, which is split into two atoms with k0/k1; the pixel checks below include that span.
- **Pixels:** 14 timestamps plus a 180-frame sweep (every 1/6 s): mean abs pixel diff **0.00 / 255** on every frame. The composed player is pixel-identical to the original in headless Chromium.
- The parity show trips the hero-budget warning (25 hero atoms against a 6–8 target). That is expected, because the original film is 100% hero plates.

## Library smoke result
Four 2 s library atoms (8 s, `draft:true`): jab→block, hook→duck, front_kick→parry, clash. They exercise:
- per-plate poses
- the shared floor line (feet on y=684, contact shadows)
- facing/flip
- the contact solve (attacker `hand_hit_xy` lands on the defender's guard, head, body or fist; only x is solved, so feet stay grounded)
- FX at the solved contact point
- a bg swap at 6 s

Jab→block and kick→guard line up visibly. Hook→duck still overlaps the bodies because the auto-anchors on the placeholder poses are poor. This proves the plumbing only, not the motion quality.

## UI (`ui/index.html`)
- **Atom picker:** filter by family / 25 cam presets / 20 fight beats / duration / pose_mode / text. It covers 3000 virtual templates (25 × 20 × 3 durations × 2 modes). Each card shows a looping camera-curve preview on a placeholder frame, and invented cameras are tagged.
- **Timeline:** add, drag cards in, drag rows to reorder, ↑/↓, duplicate, remove. Shows a running total, a 30–60 s guard and a hero counter (warns outside 6–8 per 30 s).
- **Inspector:** L/R pose selects, attacker/target selects, hero layout source + plate ids, and a raw atom JSON editor.
- **Inputs:** L/R slots (name, pose-library picker, key image path, upload, **x/y/scale transform**); bg base / swap / swap time; **Wording / overlays** panel.
- **Live preview:** scrubber + canvas under the timeline; drag L/R/W handles.
- **Buttons:**
  - **Export show JSON** does a server dry-run compose for schema validation before the download, so an invalid show is not exported.
  - **Compose** saves to `shows/<id>.json` and composes.
  - **Preview** opens `player/index.html?show=<id>`.
- Both example shows are preloaded (parity loads by default).
- QA (`scripts/qa_ui.py`) ran end-to-end: load, add, drag, export, compose, preview. The exported JSON passes `show.schema.json` and there were 0 console errors.



## Editor v2 — before/after edit loop (20 Oct 2026)

Ship goal: edit **before** compose and review/adjust **after** without leaving the page. Demo: `shows/editor-features.json`.

1. **Deep link** — `/ui/index.html?show=<show_id>&t=<scrub>` loads that show (catalog match by `show_id`) and optional scrub time.
2. **Save draft** — header **Save** → `POST /api/save` writes `shows/<id>.json` only (no compose).
3. **Dirty / stale banner** — after a successful compose, further edits show “edited — recompose to refresh player”. **Revert to last composed** restores the snapshot from the last good compose.
4. **Docked composed player** — iframe under live preview; shown when `out/<id>/timeline.json` exists or after compose.
5. **Compose refreshes docked player** — **Compose & Preview** cache-busts the iframe (`?show=&t=&_=`), stays in-page.
6. **Player → Edit** — non-capture player has **Edit in Composer** → `/ui/index.html?show=<id>&t=<t>`.
7. **Undo / Redo** — history stack (~40 snapshots). `⌘/Ctrl+Z`, `⌘/Ctrl+Shift+Z` / `⌘/Ctrl+Y`.
8. **localStorage autosave** — debounce ~800ms key `html-motion-composer:draft:<show_id>`; Restore/Discard prompt on load if newer draft. Cleared on Save or Compose.
9. **Keyboard** — Space = scrub autoplay; ←/→ = ±0.05s; `s` = Save (ignored while typing in inputs).
10. **Atom duration +/-** — Selected atom inspector: `−0.5` / `+0.5` and 1 / 1.5 / 2 shortcuts (clamped to valid atom durations).
11. **Copy URL** — copies absolute `?show=<id>&t=<scrub>` deep link.
12. **Compose & Preview** — primary button composes then refreshes the docked player (Preview ▶ still opens a new tab). Scrub `t` is preserved across compose refresh and Player↔Edit.

Endpoints: `POST /api/save`, `GET /api/composed?show=<id>`.


## Editor v3 — artificial wording + action effects (20 Oct 2026)

Ship goal: fight-impact **wording that matches the video** (runtime artificial text, not the old sample PNGs) plus **action effect selection** on each overlay. Demo: `shows/wording-fx.json`.

1. **Artificial wording generator** — primary path is **runtime text overlays** (`kind:"text"` + `text` + `style`). Optional `POST /api/wording` still writes `uploads/wording_gen_*.png` (Pillow) for a PNG fallback. Preset chips: 砰 / 咚 / 咔 / 啪 / CLASH / BANG / HIT / KO / 終 / WHOOSH.
2. **Wording action effects** — overlay `effect: {type, intensity?}` (or string enum). Types: `none`, `pop`, `slam`, `shake`, `flash`, `fade`, `bounce`, `slide_left`, `slide_right`, `spin_in`, `pulse`, `impact`. Applied in live preview **and** composed player.
3. **Effect intensity** — 0.25–2 slider per overlay (scales amp / overshoot / shake).
4. **Style panel for artificial text** — fill, stroke, stroke width, font size, weight, italic, **font** (書法·马善政 / 草書·龙藏 / Noto Serif / Noto Sans); live on canvas (no regenerate needed for `kind:text`).
   - **Calligraphy fonts** in `assets/fonts/` (OFL): `MaShanZheng-Regular.ttf` (马善政楷书, default for zh impact), `LongCang-Regular.ttf` (龙藏体 brush). Player + Pillow `/api/wording` + live preview share the same families via `style.fontFamily`.
5. **Preset chips UI** — one-click add at scrub time with default effect `impact` (dropdown override).
6. **Snap to hit / atom** — **Snap → atom** sets start to current atom; **Snap → hit** uses composed `timeline.fx.hits` when available, else atom midpoint.
7. **Duplicate overlay** — clones selected overlay with new id + slight x/y offset.
8. **Timeline overlay lane** — thin markers under the duration bar (truncated label); click seeks scrub.
9. **Atom FX hook chips** — Selected atom inspector multi-toggles common `fx_hooks` (`hit_orange`, `hit_pink`, `shake`, `dust`, `sparks`, `speed_lines`, …); JSON textarea kept.
10. **Live preview of wording effects** — `paintPreview` shares the same effect curves as the player so slam/pop are visible before compose.

Schema: `show.schema.json` `$defs.overlay` adds optional `kind`, `text`, `style`, `effect` (`src` optional when `kind=text`). Compose `normalize_overlays` passes them into `timeline.json`.

Try:
```bash
python3 composer/serve.py --port 8770
# http://127.0.0.1:8770/ui/index.html?show=wording-fx&t=2.55
# http://127.0.0.1:8770/player/index.html?show=wording-fx&t=2.55
```
QA: `qa/editor_v3_wording.png`, `qa/editor_v3_effects.png`, `qa/player_v3_wording.png`, `qa/wording-fx-strip.png`, `qa/wording-fx-calligraphy.mp4`.

## Editor v4 — craft pack + setup (20 Oct 2026)

Ship goal: craft-speed timeline editing, live cam/guides, A/B review, scrub export, and **Template Setup → generate all images**. Demo: `shows/editor-v4.json`.
- Show: `shows/head-cu-30s.json` (30 atoms / 30.0s, library pose_mode) — player `?show=head-cu-30s`. Framing ~83% head CU (head-only / head+body / hand+body+head) per approved STORYBOARD-zh-head-cu-30s.md.


1. **Craft keyboard pack** — `,` / `.` = ±1/24s scrub; Shift+←/→ = prev/next atom (or hit); Alt+arrows nudge selected overlay 1px (Shift+Alt = 10px); `[` / `]` bulk ±0.5s on multi-select.
2. **Overlay lane trim + z-order** — drag overlay marker edges for `t_start`/`t_end`; **Bring↑ / Send↓** + `z` field.
3. **Live-preview camera** — scrub canvas applies atom cam curves (`cam()` + presets) before compose (toggle **live cam**).
4. **Pose thumbnail picker** — inspector L/R pose PNG grids from catalog (30-pose craft pick).
5. **Contact guides** — live preview draws foot / hand_hit / head / hit markers (+ optional contact ghost). Catalog `/api/catalog` now includes pose anchors.
6. **Loop In/Out** — In/Out on scrubber; Space loops A–B; markers on overlay lane / bar.
7. **Atom multi-select + clipboard** — Shift-click rows; ⌘/Ctrl+C/V/D; Delete; bulk `[`/`]`.
8. **A/B compare dock** — side-by-side (or wipe) live preview | composed player at shared `t`.
9. **Scrub still / strip export** — Still PNG / N-frame strip → download + `POST /api/qa_png` → `qa/`.
10. **Template Setup → generate all images** — Setup panel: pick `templates/*.json` (or seed show), L/R libs, new `show_id` → **Run setup** → `POST /api/setup` writes `shows/<id>.json`, `shows/<id>.setup.json`, `setup/<id>/manifest.json`. Local Pillow wording + pose existence checks run now; hero plates listed as `pending_generate_image` (prompt stubs, no faked plates).

Try:
```bash
python3 composer/serve.py --port 8770
# http://127.0.0.1:8770/ui/index.html?show=editor-v4&t=2.55
```
QA: `qa/editor_v4_*.png`, `qa/editor_v4_result.json`, `qa/setup_manifest_sample.json`.




## Honest gaps / decisions
1. **Camera preset names:** the mapping from camBase segments to the 25 draft names is my call, listed in each `comment`.
   - camBase has 24 segments, which map onto 20 derived presets. 5 parity atoms reuse a preset with `params` overrides: eye_lateral reversed, ecu_jitter y-only and s-only, whip_A_to_B wide, and the waist_ots_chase sine phase.
   - 5 presets are invented (`derived:false`): low_hold, high_hold, ots_L_hold (mirror), pull_aftermath, rise_from_floor.
2. **`t_rel` is normalised** (0..1 of the atom), so hooks scale with duration. Saw jitter and `omega` sines are in seconds, so jitter speed stays constant.
3. Cuts between atoms are hard camera cuts, as in camBase. There is no blending between atoms yet.
4. **Library placement** solves only x (the grounded rule). Scale = show `char_screen_scale` × pose `scale`. Sprite Forge needs to deliver poses at a consistent scale with true anchors (`foot_anchor_xy` = the planted/support foot, not just the lowest pixel).
5. **Auto FX defaults** in the UI (hits on strikes, dust on dodges) are heuristic. Edit them per atom.
6. **Live-playback glitch:** in live playback (not capture mode), the first frame after a plate change can paint before a new `<img>` decodes. The original player has the same behaviour. Capture/QA is unaffected.
7. No 500-atom catalog files yet. The picker builds virtual atoms on the fly, and seeding real catalog atoms is P1.
8. No MP4 render in P0. The existing `render_mp4.py` pattern can drive `renderAt` later.


## Editor features (20 Oct 2026)

### Character transform (position / size)
- Show-level: `chars.L|R.transform: {x, y, scale}` — applied after grounded placement.
- Per-atom: `atoms[i].char_overrides.L|R: {x, y, scale}` — field-wise override of the show transform.
- **Scale pivots on the foot**, so scale alone keeps feet on the floor line.
- **`y ≠ 0` breaks grounding** (feet leave the floor). UI shows a warning; composer emits a warning once per side/atom.
- Applies to **side-tagged parts** (library poses). Hero duo cutouts without `side` are unchanged (parity preserved).
- UI: number inputs under each character slot + drag the cyan (L) / orange (R) handle on the live preview.

### Wording / text overlays
- Show-level: `show.overlays: [{id, kind?, text?, style?, effect?, src?, t_start, t_end, x, y, scale, opacity, z}]`.
- Prefer `kind:"text"` (runtime artificial wording). Legacy `src` PNGs still work (`assets/wording/*`, uploads).
- `effect`: `{type, intensity}` — see Editor v3 list. Live preview + player share curves.
- `x,y` = center on the 1280×720 stage. Overlays live **inside the camera layer** (move with cam), above characters, below `#full` / pink cut / flash / FX canvas.
- UI: preset chips, style panel, effect dropdown, overlay lane, snap/dup. Optional `POST /api/wording` → `uploads/wording_gen_*.png`.
- Demos: `shows/wording-fx.json` (v3), `shows/editor-features.json` (legacy PNGs).

### Live preview (UI)
- Scrub the timeline under the atom list.
- Drag L/R handles to nudge transform; drag W for the selected overlay.
- Preview placement for library poses is approximate (foot ≈ bottom-center); composed player uses real anchors.

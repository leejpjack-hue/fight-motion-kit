# HM-PIXELFX-COMPOSER-FX

Wave 1 pixelfx impacts are extra Catalog Query FX in the HTML Motion composer. Kit `fx_presets` chips stay. No compose HTTP backend. No pixelfx PR.

## Tips

| Repo | SHA |
| --- | --- |
| fight-motion-kit base (main after HF-05 #54) | `fb6118eb555d59e106791e87168cf48122939dad` |
| pixelfx source (read-only) | `679844a6e45b7dbdc4b3d1f76f2dd0fdcc2bc892` |

## Vendored paths

Served from `public/vendor/pixelfx/` (Workers static host). `SOURCE.txt` records the pixelfx tip.

Runtime the 12 modules import:

- `src/core/act.js`, `actor.js`, `chain.js`, `color.js`, `font.js`, `fx.js`, `index.js`, `math.js`, `painter.js`, `particles.js`, `poses.js`, `rig.js`, `scene.js`, `shapes.js`, `sim.js`

Shared helpers (not extra FX):

- `src/fx/impacts/_lib.js`
- `src/fx/melee/_lib.js`
- `src/fx/explosions/_lib.js`

The 12 modules:

- `src/fx/impacts/hit-spark.js`
- `src/fx/impacts/blunt-hit.js`
- `src/fx/impacts/crit-hit.js`
- `src/fx/impacts/hit-flash.js`
- `src/fx/impacts/impact-frame.js`
- `src/fx/impacts/parry.js`
- `src/fx/impacts/ground-slam.js`
- `src/fx/impacts/heavy-landing.js`
- `src/fx/melee/uppercut.js`
- `src/fx/explosions/cartoon-pow.js`
- `src/fx/explosions/dirt-explosion.js`
- `src/fx/explosions/smoke-bomb.js`

Bridge: `wave1.js` (`createFx` / `createAct`, transparent composite). Browser and offline HTML use the bundle `wave1.global.js`, built from that bridge. `LICENSE` is the pixelfx MIT notice.

Presets (same 12 rows: id, role, label, notes):

- `kit/presets/pixelfx_wave1.json`
- `public/presets/pixelfx_wave1.json`

## Hook shape

Catalog Apply on the selected clip, add-if-missing:

```json
{ "type": "<wave1-id>", "t_rel": 0.08, "source": "pixelfx" }
```

Example: `{ "type": "impacts/hit-spark", "t_rel": 0.08, "source": "pixelfx" }`.

A second Apply of the same id leaves the list unchanged. No clip selected shows `Select a clip, then Apply.` Plates, camera, timing, and hooks already on the clip stay.

## What draws

Preview and compose/export (`sampleStageFrameAt`, the same path as frame export) call `HMPixelFx.paint`. This run drew all 12. `missed` was empty, so the honesty banner stayed hidden.

| id | drew |
| --- | --- |
| impacts/hit-spark | yes |
| impacts/blunt-hit | yes |
| impacts/crit-hit | yes |
| impacts/hit-flash | yes |
| impacts/impact-frame | yes |
| impacts/parry | yes |
| impacts/ground-slam | yes |
| impacts/heavy-landing | yes |
| melee/uppercut | yes |
| explosions/cartoon-pow | yes |
| explosions/dirt-explosion | yes |
| explosions/smoke-bomb | yes |

A paint that returns no pixels sets the preview banner to `Pixelfx did not draw: <ids>. Those hooks stay on the clip and did not paint.` The same sentence is written to `#pixelfxHonesty` in playable HTML. That is the only miss path. It is not a silent no-op.

## Capscreens

- `query-hit-spark.png` — Catalog query, FX filter, Hit spark, family pixelfx
- `apply-hit-spark.png` — second Apply leaves the hook in place
- `preview-hit-spark.png` — live preview paints the spark on the clip
- `compose-wave1.png` — compose draw of all 12
- `honesty-miss.png` — banner when paint reports a miss
- `draw-report.json` — drawn ids for preview and compose

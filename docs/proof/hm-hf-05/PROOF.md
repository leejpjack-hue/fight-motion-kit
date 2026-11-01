# HM-HF-05 Catalog Query

Jack types a cam, FX, or block name in the composer and Apply puts that hit on the selected clip. Cam and FX work while the beat-block registry is empty.

## Index

Offline only. No catalog HTTP API.

| Source | What it contributes |
| --- | --- |
| `public/presets/camera_presets.json` | `cam` hits |
| `public/presets/fx_presets.json` | `fx` hits |
| `public/presets/beat_blocks.json` | `block` hits from `blocks` (also `beat_blocks`, `registry`, or `items`) |
| `catalog.json` `beat_blocks` or `blocks` | extra block hits when that key exists |
| `catalog.json` `caption_styles` | caption hits when a real list exists |

The presets file ships as `{ "blocks": [] }`. The same empty file is in `kit/presets/beat_blocks.json`. An empty list, a missing file, or a catalog with no block key does not throw. The Block chip stays hidden until at least one block is indexed. Two caption stubs (`impact_hit` / clash, `street_mark` / STREET) fill the caption kind until a real `caption_styles` list is present.

Query is a case-insensitive substring of id, label, description, and theme tags. The theme menu lists angle, move, theme, family, and beat class. An empty theme means every hit.

## Apply

Selected clip only. No clip selected shows `Select a clip, then Apply.` and does not change the show.

| Kind | What Apply writes |
| --- | --- |
| `cam` | `camera.preset`, plus `angle` and `move` from the preset. Drops stale curve `params` and `impact_macro`. If dual segments exist, segment A takes the new preset and its duration stays. Nudge, intensity, ease, chain, duration, plates, motion, `timing_hold`, and `fx_hooks` stay. |
| `fx` | Add-if-missing. Pushes `{ type, t_rel: 0.08 }` (span hooks also get `t_rel_end: 0.92`). Does not replace hooks already on the clip. A second Apply of the same id leaves the list unchanged. |
| `block` | Cam Apply for the block preset, then add-if-missing each `fx_hooks` entry. Sets `motion.beat_class` and `motion.family` when the block has them. Sets `caption` only when the clip caption is empty. Does not change duration or plates. |
| `caption_style` | Sets `caption_style`. Sets `caption` to the stub sample only when the clip caption is empty. |

## Where it sits

`public/ui` shows Catalog query at the top of Clip settings. `kit/ui` shows the same control in a Beat-focus group. Both call `catalog-query.js`.

## Proof

Empty registry (`blocks: []`):

- Search `whip` returns `whip_A_to_B`, `face_whip`, and other hits whose text contains whip. The Block chip is hidden.
- Apply `whip_A_to_B` on clip 01 sets `camera.preset` to `whip_A_to_B` (`angle` eye, `move` whip_pan). Duration, plates, beat class, and the existing `shake` hook stay. The camera menu value is `whip_A_to_B`.
- Kind FX + search `hit`, Apply `hit_orange` appends that hook. The readout is `fx_hooks: shake, hit_orange`. Apply again does not add a second copy.
- Theme `STREET` leaves `street_mark`.
- Apply with every clip removed shows the select-a-clip warning.

Registry present (the presets URL answered with one `street_clash` block: `face_whip`, `hit_pink`, beat `clash`, caption `CLASH`):

- The Block chip is visible.
- Apply on clip 02 sets face whip, beat clash, hit pink, and caption CLASH. Duration and plates stay.

Capscreens in this folder: `query-whip.png`, `apply-cam-fx.png`, `filter-street.png`, `query-block.png`, `apply-block.png`.

`npm test` covers the index, filters, empty registry, and Apply. The browser checks above ran against `http://127.0.0.1:8765/ui/`. The full `npm run test:browser` file also contains these checks. On this machine that suite stops earlier, on the existing frame-peek zip download, and that stop also happens with the composer UI from `8f93e667` before this change.

# HM-HF-05 Catalog Query

Jack types a cam, FX, or block name in the composer and Apply puts that hit on the selected clip. Cam and FX work while the beat-block registry is empty.

## Index

Offline only. No catalog HTTP API.

| Source | What it contributes |
| --- | --- |
| `public/presets/camera_presets.json` | `cam` hits |
| `public/presets/fx_presets.json` | `fx` hits |
| `public/blocks/beat_blocks.json` (same file under `kit/blocks/`) | `block` hits. Tip HF-04 ships 16 STREET blocks here. `catalog.json` `beat_blocks.path` points at this file. |
| `catalog.json` `caption_styles` | caption hits when a real list exists |

An empty `blocks` array, a missing file, or a catalog with no block key does not throw. The Block chip stays hidden until at least one block is indexed. Two caption stubs (`impact_hit` / clash, `street_mark` / STREET) fill the caption kind until a real `caption_styles` list is present.

Query is a case-insensitive substring of id, label, description, and theme tags. The theme menu lists angle, move, theme, family, and beat class. An empty theme means every hit.

## Apply

Selected clip only. No clip selected shows `Select a clip, then Apply.` and does not change the show.

| Kind | What Apply writes |
| --- | --- |
| `cam` | `camera.preset`, plus `angle` and `move` from the preset. Drops stale curve `params` and `impact_macro`. If dual segments exist, segment A takes the new preset and its duration stays. Nudge, intensity, ease, chain, duration, plates, motion, `timing_hold`, and `fx_hooks` stay. |
| `fx` | Add-if-missing. Pushes `{ type, t_rel: 0.08 }` (span hooks also get `t_rel_end: 0.92`). Does not replace hooks already on the clip. A second Apply of the same id leaves the list unchanged. |
| `block` | Same write as HF-04 `applyBeatBlock`: sets `camera.preset`, replaces `fx_hooks` with the block's hooks, and sets caption, `caption_style`, `motion.beat_class`, and `motion.grammar_role` when the block has them. Duration, plates, and poses stay. |
| `caption_style` | Sets `caption_style`. Sets `caption` to the stub sample only when the clip caption is empty. |

## Where it sits

`public/ui` shows Catalog query at the top of Clip settings. `kit/ui` shows the same control in a Beat-focus group. Both call `catalog-query.js`.

## Proof

Tip registry (`public/blocks/beat_blocks.json`, 16 STREET blocks):

- Search `street_whip_action` returns that block. Apply on clip 02 sets `camera.preset` to `whip_A_to_B` and `fx_hooks` to `speed_lines`. Duration and plates stay.
- Search `street_ecu_fist` and Apply sets `ecu_fist_lens`, hooks `hit_orange` and `hitstop_2f`, caption `HIT`, and beat class `Action`.
- Cam Apply of `whip_A_to_B` on clip 01 keeps duration, plates, beat class, and the hooks already on that clip.
- FX Apply of `hit_pink` adds that hook and does not add it a second time.
- Theme `STREET` includes `street_whip_action`.
- Apply with every clip removed shows the select-a-clip warning.

Empty registry (the blocks URL answered `{ "blocks": [] }`):

- The Block chip stays hidden.
- Cam Apply of `face_whip` and FX Apply of `hit_orange` still update the selected clip.

Capscreens in this folder: `query-whip.png`, `apply-cam-fx.png`, `filter-street.png`, `query-block.png`, `apply-block.png`.

`npm test` covers the index, filters, empty registry, and Apply. The browser checks above ran against `http://127.0.0.1:8765/ui/`. The full `npm run test:browser` file also contains these checks. On this machine that suite stops earlier, on the existing frame-peek zip download, and that stop also happens with the composer UI from `8f93e667` before this change.

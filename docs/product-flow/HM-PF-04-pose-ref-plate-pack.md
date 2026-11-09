# HM-PF-04 — Pose-ref plate pack from locked OpenPose WORK

**Issue:** `#86` · **Depends on:** HM-PF-01 (`#83` / `#127`) · **Scope:** FE-only. No new plates, no `GenerateImage`, no `api.teqcon.uk`, no `:8770`, no `wrangler deploy`.

## What Jack loads

1. Open the Workers UI at `/ui/` (local: `http://127.0.0.1:8765/ui/`).
2. Click **Open OpenPose kick plate pack** (`#loadPoseRefPack`), or open `/ui/?show=daiyu-wang-10s-kicks-pose-pack`.
3. The composer loads `daiyu-wang-10s-kicks-pose-pack`: 20 pose ids `P01`–`P20` from `fight-daiyu-wang-10s-kicks-openpose-2026-11-01`, each already on a hero plate slot with the deliverable camera preset.
4. Tweak a clip (trim, replace plate, or change camera) and let the in-browser compose finish. That open → tweak → compose path is the ≤60s Jack bar.

The 5.00s eight-plate demo (`daiyu-wang-five-seconds`) is unchanged until that button is used.

## Pose id → camera-ready slot

[`HMComposeClient.normalizePoseRefPlatePack`](../../public/ui/pose-ref-pack.js) turns [`openpose_10s_kicks_pose_pack.json`](../../public/presets/openpose_10s_kicks_pose_pack.json) into a portable project through [`normalizeCostumeLockPack`](../../public/ui/costume-lock.js). Each slot keeps:

| Field | Meaning |
| --- | --- |
| `pose_id` / `plate_id` | OpenPose plate id (`P01`…`P20`). The plate id is the pose id. |
| `beat_id` | Source atom id (`k10_01_jab` … `k10_20_standoff_crouch`). |
| `camera_preset` | Camera already on that plate (`eye_push` on `P01`, `upward_inside` on `P07`, …). |
| `src` | Cleared plate `assets/daiyu-wang-10s-kicks/plates/P0N.png`. |

`show.pose_ref_pack.slots` is the authored map. Replacing a clip's plate updates `atom.hero.plates` only. The pose-id map and both costume lock IDs stay put.

Costume locks, taken from the 10s kicks costume lock (not the PF-01 jacket ids):

- L 林黛玉 · `daiyu_pale_teal_tank_v1`
- R 王熙鳳 · `wang_black_tank_red_skirt_v1`

## Art

Cleared `P01`–`P20` PNGs are the attached plates archive. They are character art on white, 1280×720, reused as-is. The pack sets `bg.key_white` so the existing renderer knocks out the white backdrop onto the already-vendored rooftop (`assets/daiyu-wang-codex-import/bg/`). No cutouts were in the archive, and none were generated.

Source-motion impact FX (dust, sparks, hit flashes, exposure) are not copied. `fx_profile` stays `comic`.

## Proof

- Unit: `node --test tests/hm-pf-04-pose-ref-pack.test.cjs` (included in `npm test`)
- Browser: `HM_PROOF_DIR=/opt/cursor/artifacts node tests/hm-pf-04-pose-ref-pack.browser.cjs`
- Receipt: `hm-pf-04-jack-bar.json` plus `hm-pf-04-pose-ref-pack.png` when `HM_PROOF_DIR` is set

## Honesty

- `P05` is the cleared plate from the deliverable. BUILD_STATUS still marks the body-hook read as FAIL; this pack does not redraw it.
- Rooftop pixels are the vendored Codex rooftop, not a new 10s-kicks background file. The 10s bg files were not in the plate archive.
- Duration sum is the deliverable 10.07s. The Jack bar is wall-clock open → tweak → compose, not clip length.
- No PF-27/28/47/48, no `#41` SFX, no SG-01, no 30a, no voice.

# HM-PF-22 — Rooftop camera-grammar golden show (Step 4–5 proof film)

Issues [#100](https://github.com/leejpjack-hue/fight-motion-kit/issues/100) (`HM-PF-20`), [#101](https://github.com/leejpjack-hue/fight-motion-kit/issues/101) (`HM-PF-21`), and [#102](https://github.com/leejpjack-hue/fight-motion-kit/issues/102) (`HM-PF-22`).

## Golden show contract

The rooftop camera-grammar film (`fight-cam-grammar-starter`, reusing `fight-daiyu-wang-rooftop-camera-grammar-2026-11-01` and `assets/daiyu-wang-eight` `P01`–`P08` over `assets/daiyu-wang-continuation/rooftop-dusk.png`) is a Gold product-flow reference show and the canonical **Step 4–5 proof film** for scene camera grammar and per-beat shot authoring.

- **Workers UI & local URL:** `/ui/?show=fight-cam-grammar-starter` (also resolves aliases `?show=fight-daiyu-wang-rooftop-camera-grammar-2026-11-01` and `?show=rooftop-camera-grammar`, **Open camera-grammar cold open**, **Templates → Fight cam grammar starter**, and **B ref → Gold · Rooftop cam-grammar (11s)**).
- **Duration & beats:** 11.00 seconds across 11 beats (22 plates at 2 plates/s).
- **Role structure:** Opening `Wide` → three consecutive `Intent → Action → Reaction` triplets (`T1`, `T2`, `T3`) → closing `Wide` re-establish.
- **Grammar-true presets (zero `wide_*` curves):**

| # | Beat ID | Role | Preset ID | Angle | Move | Plates |
|---:|---|---|---|---|---|---|
| 1 | `wide_open_low_rise` | `Wide` | `low_rise` | `low` | `rise` | `P01`, `P01` |
| 2 | `t1_intent_ots_L_hold` | `Intent` | `ots_L_hold` | `waist_ots_L` | `hold` | `P02`, `P02` |
| 3 | `t1_action_eye_push` | `Action` | `eye_push` | `eye` | `push_in` | `P03`, `P03` |
| 4 | `t1_reaction_ots_R_hold` | `Reaction` | `ots_R_hold` | `waist_ots_R` | `hold` | `P04`, `P04` |
| 5 | `t2_intent_eye_lateral` | `Intent` | `eye_lateral` | `eye` | `lateral` | `P05`, `P05` |
| 6 | `t2_action_whip_A_to_B` | `Action` | `whip_A_to_B` | `eye` | `whip_pan` | `P06`, `P06` |
| 7 | `t2_reaction_ecu_jitter` | `Reaction` | `ecu_jitter` | `ecu` | `hold` | `P07`, `P07` |
| 8 | `t3_intent_eye_hold` | `Intent` | `eye_hold` | `eye` | `hold` | `P08`, `P08` |
| 9 | `t3_action_ecu_fist_lens` | `Action` | `ecu_fist_lens` | `ecu` | `push_in` | `P03`, `P03` |
| 10 | `t3_reaction_pull_aftermath` | `Reaction` | `pull_aftermath` | `eye` | `pull_out` | `P04`, `P04` |
| 11 | `wide_reestablish_eye_orbit` | `Wide` | `eye_orbit` | `eye` | `orbit` | `P01`, `P01` |

## Step 4–5 proof film workflow (Open → Edit → Clause Export → Bake)

1. **Open golden cam show:** Load `/ui/?show=fight-cam-grammar-starter` (or click **Open camera-grammar cold open**). Pane A and Gold Reference B both load the 11.00s rooftop film with zero backend calls.
2. **One-click Wide re-establish picker (`HM-PF-20`, #100):** In **Clip Settings → Camera motion → Scene camera grammar**, choose an existing establish preset (`eye_orbit` for Wide re-establish or `low_rise` for Wide open) and click **＋ Insert Wide re-establish** or **Mark beat as Wide**. If a grammar scene has zero `Wide` beats, Show JSON Lint and the grammar panel surface a soft `scene_missing_wide` warning without blocking bake.
3. **`Camera:` clause export for prompting (`HM-PF-21`, #101):** Approve step 2 in **2 Story · Jack GO gate**, then export `.camera-clauses.txt` (**Export Camera: clauses**) or `.camera-clauses.json` (**Export Camera: clauses JSON**). Both follow `fight-prompting-enhancements-2026-11-01` REPORT conventions, download locally with no upload backend, and round-trip into `hm-cam-grammar-scene --design`, `hm-cam-shot-author --grammar`, and **Apply grammar / camera map** in the UI.
4. **FE-only bake (Step 9):** Click **Export ↗** and choose **Playable HTML**, **Current frame**, **Timing pack**, or **Frame sequence + timing JSON**. All composition and asset embedding run in the browser; no `/api/` or remote compose endpoints are called.

## Verification & approval demo capscreens

```sh
npm test
npm run dev
node tests/grammar-starter.browser.cjs
node tests/camera-flow.browser.cjs
TEST_BASE_URL=https://html-motion-composer.leejpjack.workers.dev \
  HM_PROOF_DIR=work/qa/grammar-workers \
  node tests/grammar-starter.browser.cjs
```

`tests/grammar-starter.browser.cjs` and `tests/camera-flow.browser.cjs` verify cold open, Gold A/B reference selection, one-click Wide re-establish insertion and zero-Wide lint warnings, local text/JSON `Camera:` clause export and round-trip, FE-only playable HTML bake, and write approval demo capscreens under gitignored `work/qa/` (`cold-open.png`, `rooftop-golden-bake.png`, `grammar-panel.png`, `wide-picker.png`, `chain-panel.png`).

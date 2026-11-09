# HM-PF-10 — Void-array board as golden story template

Issue [#90](https://github.com/leejpjack-hue/fight-motion-kit/issues/90). Depends on HM-PF-06. This template is ready for CoS to merge after PF-06 is on main. It does not implement the Cantonese authoring skill.

## Golden story contract

The void-array film (`baijia-elfmage-void-array`, pack `fight-baijia-elfmage-void-array-2026-11-06`) is a loadable golden story: 47 beats, 30.00 seconds, Cantonese labels, and the proven camera presets.

- **Workers UI & local URL:** `/ui/?show=baijia-elfmage-void-array` (alias `?show=fight-baijia-elfmage-void-array-2026-11-06`, **Open void-array golden story**, **Templates → Void-array golden story**, and **B ref → Gold · Void-array board (30s)**).
- **Cantonese board source:** `/workspace/deliverables/fight-baijia-elfmage-void-array-2026-11-06/STORYBOARD-zh.md`
- **Timing:** the 47 beat durations and labels from the 2026-11-06 motion board. `show.board` is an `hm-pf-08-board`. Each atom `beat_id` matches its board beat.
- **Playback:** the local board slate stands in for cutouts that are not in this checkout. Bake stays in the browser. No teqcon, `:8770`, or compose HTTP.

## Open → edit → bake

1. Open `/ui/?show=baijia-elfmage-void-array`.
2. Confirm the story gate labels the Cantonese board source path.
3. Scrub, edit a duration or camera preset, then **Export → Playable HTML**.

The 5.00s eight-plate demo stays the default show.

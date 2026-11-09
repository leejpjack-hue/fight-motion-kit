# HM-PF-34. Classroom dense golden show

Open the classroom dense film, read the background crop and pan, then edit and bake in the browser.

Issue [#111](https://github.com/leejpjack-hue/fight-motion-kit/issues/111). The show depends on HM-PF-31 for merge order. This registration does not add the `hm-bg-scene-author` skill.

## Open the show

1. Open `/ui/?show=fight-daiyu-baochai-classroom-dense`. The same film also opens from **Open classroom-dense show**, **Templates → Classroom dense multi-BG**, and **B ref → Gold · Classroom dense (21.825s)**.
2. Aliases `fight-daiyu-baochai-classroom-dense-2026-10-24`, `classroom-dense`, and `hm-class-dense-bg` resolve to that show.
3. The film is 21.825 seconds and 60 clips. `venue` is `classroom`, so the comic/ink profile stays the default.

You should see the background panel with crop **70% × 90% @ 15, 5** and a pan note for `pan_right` at 70% across the whole show. The stage preview then reports that the classroom bitmap is not in this kit. That message is the missing file, not a new picture.

## Crop and pan

These numbers come from the pack compile dump. Project scope and every clip use the same crop and the same pan.

| Field | Value |
|---|---|
| Crop `x`, `y`, `w`, `h` | `0.15`, `0.05`, `0.70`, `0.90` |
| Pan preset | `pan_right` |
| Pan amount | `0.70` |
| Pan clock | `show` |
| Project `swap_t` | `13.6` seconds, clean classroom to mess |

Clip backgrounds switch by start time. The visible plate is the clip `background.src`. The project `swap_t` stays the fallback.

| Start | End | Background |
|---|---|---|
| 0.00s | 5.10s | `assets/daiyu-baochai-classroom/bg/bg_classroom.jpg` |
| 5.10s | 10.20s | `assets/daiyu-baochai-classroom/bg/bg_classroom_side_low.jpg` |
| 10.20s | 15.10s | `assets/daiyu-baochai-classroom/bg/bg_classroom_mid_mess.jpg` |
| 15.10s | end | `assets/daiyu-baochai-classroom/bg/bg_classroom_mess.jpg` |

## Foreground proof

The pack already pairs this background with the CLASS-DENSE-FG TUNG props. Parallax is `0.45`. Breaks are `12.18` seconds and `13.60` seconds. The prop layer sha256 is `3f9e52f2d252cd6a30a38e7dd41e4a3b9ce40ac02ed4fde81f7d9d03e2ff29e1`.

Those prop bytes and `show.fg` were not in the attached metadata. This show does not copy them and does not generate new foreground art. The clips keep the existing plate ids, including `IB01` through `IB04`.

## Missing pack bitmaps

The pack lives on the CoA box at `/workspace/deliverables/fight-daiyu-baochai-classroom-dense-2026-10-24`. None of these files are in the kit.

- `assets/daiyu-baochai-classroom/bg/bg_classroom.jpg`
- `assets/daiyu-baochai-classroom/bg/bg_classroom_side_low.jpg`
- `assets/daiyu-baochai-classroom/bg/bg_classroom_mid_mess.jpg`
- `assets/daiyu-baochai-classroom/bg/bg_classroom_mess.jpg`
- `assets/daiyu-baochai-nightarcade/plates/IB01.png`
- `assets/daiyu-baochai-nightarcade/plates/IB02.png`
- `assets/daiyu-baochai-nightarcade/plates/IB03.png`
- `assets/daiyu-baochai-nightarcade/plates/IB04.png`

Plate files for `P01` through `P56` are also absent. The attached metadata names the plate ids and does not name their file paths, so this note does not invent those paths.

Three `codex_06_dive_then_inside` clips still carry the pack camera segments, whose durations sum to 1.5 seconds inside a shorter clip. Compose warns and does not invent a new preset.

## Bake

Edit a crop number or the pan amount in **Background**. Export from **Export**. Composition stays in the browser. No `/api/compose` call is added.

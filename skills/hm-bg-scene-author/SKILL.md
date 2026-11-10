---
name: hm-bg-scene-author
description: Stamp a background crop and a show-clock pan into a portable .motion.json from a typed scene place. Reuse the composer crop, motion, and continuous-pan fields. The human then edits those fields with the existing Background controls.
---

# hm-bg-scene-author

Author the Step 7 background for one scene place. The skill writes the crop rect and the motion object the composer already saves. Open the file and pan with the existing Background controls.

HM-PF-06 still owns the Cantonese storyboard. This skill does not read that board and does not invent a story schema. A typed place plus the open project is enough.

The field names are the ones in [`project-format.md`](../html-motion-composer/references/project-format.md) and the HM-BG-CROP, HM-BG-MOTION, and HM-BG-PAN-CONT helpers in `public/ui/compose-client.js`.

## Inputs

- `--place`, the scene place in words. Required. It is not stored on the show.
- `--project`, a portable project or a show JSON that already has `show.bg.base` (or `swap` when `--layer swap`).
- Optional `--crop x,y,w,h` in fractions of the source. Omit it and the skill writes a 16:9 window with room on the travel side.
- Optional `--preset` (`pan_right` by default), `--amount` (`0.4` by default), and `--clock` `show` or `per_atom`.
- Optional `--brief file.json` with those same fields. Flags override the file.
- Optional `--pack` `hold`, `slow-pan`, `accent-pan`, or `rhythm`. This path does not take `--place`, `--preset`, `--amount`, `--clock`, `--crop`, `--layer`, or `--brief`.
- `--out` must be a new `*.motion.json`. `--repo` selects another checkout.

## Outputs

A portable project file. On `show.bg` the skill sets these fields.

- `crops.base` or `crops.swap` as `{x,y,w,h}`
- `motion` as `{preset, amount}` and, for a travel preset, `clock` of `show` or `per_atom`

Plate timing, cameras, FX, and atoms stay as they were. An existing crop or motion is left untouched and the command fails. The place string is not written.

## Run

```sh
node skills/hm-bg-scene-author/scripts/author.cjs \
  --project public/shows/street-old-city.json \
  --place "old-city street" \
  --out work/street.motion.json
```

The command loads the composer engine and refuses to write when compose rejects the show. An existing `--out` is not replaced.

## Rhythm motion pack

`--pack` writes a row from `public/presets/bg_motion_packs.json` (the same file as `kit/presets/bg_motion_packs.json`) onto the motion fields this skill already uses. It does not add a preset id and it does not move character cameras.

- `hold` writes `{preset: static, amount: 0}`. That is the micro-cut row. The crop stays put so a pan does not cross the cut.
- `slow-pan` writes `pan_right` at `0.25` on the show clock. That is the dialogue-hold row.
- `accent-pan` writes `pan_left` at `0.7` with `clock: per_atom`. That is the impact-hold row. The move restarts on the clip.
- `rhythm` reads each clip's existing `timing_hold.kind` and writes the matching row onto `atom.background.motion`. A clip without a hold is left alone. Project motion is left alone.

A show that already uses background locations has no single project motion. Apply `hold`, `slow-pan`, or `accent-pan` from the Background panel onto one location. `rhythm` still writes clip motion on that show.

```sh
node skills/hm-bg-scene-author/scripts/author.cjs \
  --project public/shows/street-old-city.json \
  --pack rhythm \
  --out work/street-rhythm.motion.json
```

The Background panel applies the same four choices. Preview and the playable HTML export both draw the stored motion with the existing window-pan helpers.

## FE handoff

Open the `.motion.json` in the composer. **Background** (`#backgroundMotionDetails`) shows the crop and the motion. Drag the crop, change the preset, or set Travel to Continuous (show) or Per clip. **Save project** writes the same keys. Undo still covers those edits.

Span t0-t1 stays on that panel. This skill does not write a span. Set one there after open.

## Anti-jobs

- Do not add background keys, a second pan channel, or a new renderer.
- Do not generate plates or fetch images.
- Do not rewrite the span drawer. That residual is HM-PF-33.
- Do not touch the 5.00s eight-plate demo file. It has no background image, so this command rejects it.
- Do not move character camera curves. `follow_camera` is the only preset that rides them. A motion pack refuses that preset.
- Do not add `hold`, `slow-pan`, or `accent-pan` as renderer preset ids. They name rows in the pack file.
- Do not add voice, SFX, or a #41 lift.
- Do not call `api.teqcon.uk`, `:8770`, or a compose / save HTTP API.

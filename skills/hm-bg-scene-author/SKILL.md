---
name: hm-bg-scene-author
description: HM-PF-51 contract stub for the Step 7 background framing skill. Read the inputs, outputs, frontend handoff, and anti-jobs. Do not write .motion.json, add background keys, or generate plates.
---

# hm-bg-scene-author

**Status:** HM-PF-51 contract stub. Step 7 on the Approval Page.
**Not an implementation.** This file does not author a background and does not write `.motion.json`.

The field source is the composer project format already documented in [`skills/html-motion-composer/references/project-format.md`](../html-motion-composer/references/project-format.md). Read that file before naming a key. This stub adds none.

## Inputs

- A typed scene-place brief from the human (where the fight is, and how the background should read).
- The open portable project or show JSON, unchanged.
- Background images already in that project, or local images the human has selected. No remote fetch.

## Outputs

No file is written.

A later implementation may propose only values for keys the composer already persists:

- `show.bg.base`, `show.bg.swap`, `show.bg.swap_t`
- `show.bg.motion` and `atom.background.motion` with the presets, `amount`, `clock`, and `span` that the project format already lists
- `atom.background.src` and `atom.background.key_white` as that format already describes
- Per-layout `bg` of `base` or `swap`

Crop, pan, and span are those existing motion and swap fields. A new crop object, a new pan channel, or a fourth-and-beyond plate model is a later story (HM-PF-32, HM-PF-33), not this stub.

## FE handoff

The human edits the background in the composer: **Background → Change background**, **Apply to**, and the motion controls already on that panel. Undo and **Save project** stay the persistence path. IndexedDB and `.motion.json` remain the stores.

This stub does not click those controls and does not import files.

## Anti-jobs

- Do not add schema keys, a background renderer, or a writer script.
- Do not generate plates or call a provider.
- Do not implement multi-background windows of four or more, or a new span control.
- Do not override character camera curves. Background motion stays independent of the foreground camera except the existing `follow_camera` preset.
- Do not add voice, SFX, or a #41 lift.
- Do not call `api.teqcon.uk`, `:8770`, or a compose / save HTTP API.

---
name: hm-fg-layer-author
description: HM-PF-51 contract stub for the Step 8 foreground prop skill. Read the inputs, outputs, frontend handoff, and anti-jobs. Do not write show.fg, add a prop, or generate cutout art.
---

# hm-fg-layer-author

**Status:** HM-PF-51 contract stub. Step 8 on the Approval Page.
**Not an implementation.** This file does not place props and does not write `show.fg`.

The live shape is `HMComposeClient.normalizeForeground` in `public/ui/compose-client.js`, edited from `#foregroundPanel` in `public/ui/index.html`. This stub does not extend that shape.

Wave 1 impact FX is not this skill. That contract is the shipped [`hm-compose-fx-impact`](../hm-compose-fx-impact/SKILL.md) skill at step 9.

## Inputs

- A typed prop list or scene brief from the human.
- The open show, including any `show.fg` already saved.
- Local PNG, JPEG, or WebP files the human already has, when they name them. No remote fetch and no generated stand-ins.

## Outputs

No file is written.

A later implementation may propose only values `normalizeForeground` already accepts:

- `show.fg.cam` with the existing preset, `amount`, `nudge`, `clock`, and `span`
- `show.fg.props[]` with `id`, `src`, `x`, `y`, `scale`, `z`, `t_start`, `t_end`
- Optional `kf[]` rows of `t`, `x`, `y`, `scale`
- `slot` of `prop` or `overlay`
- On a breakable prop, `effect.type` of `break`, `effect.t`, and optional `effect.broken_src`

Overlay art does not take a break effect. That rule is already in the normalizer.

## FE handoff

The human edits props in **Foreground** (`#foregroundPanel`): add, remove, slot, placement, time window, keyframes, and break. The panel states that this camera does not follow background crop-pan or the clip camera. **Save project** writes the portable `.motion.json`.

This stub does not add a prop, attach a broken image, or change the panel.

## Anti-jobs

- Do not add schema keys, a writer script, or generated fire, debris, dust, or slash art.
- Do not move Wave 1 `fx_hooks` into this skill. Use `hm-compose-fx-impact` for that catalog.
- Do not implement the later thicken stories (HM-PF-37, HM-PF-38, HM-PF-39) from this file.
- Do not retarget background motion or the character camera.
- Do not add voice, SFX, or a #41 lift.
- Do not call `api.teqcon.uk`, `:8770`, or a compose / save HTTP API.

---
name: html-motion-fight-video
description: HM-PF-51 contract stub for the Step 9 end-to-end fight-video skill. It names the existing step skills and the composer helper. It does not run them, fork their contracts, bake a film, or include voice.
---

# html-motion-fight-video

**Status:** HM-PF-51 contract stub. Step 9 packaging name on the Approval Page (HM-PF-40).
**Not an implementation.** This file does not sequence a run, compose a show, or export a file.

The HM-SKILL-SYNC draft `html-motion-fight-video.SKILL.md` is not in this checkout. Do not reconstruct its missing procedures. Per-step contracts stay in each skill file listed in [`docs/product-flow/HM-PF-51-skill-pack.md`](../../docs/product-flow/HM-PF-51-skill-pack.md). This stub must not fork them.

`skills/html-motion-composer/` remains the compose and export helper already on `main`, including `frame-qa.cjs`. This stub does not replace that skill.

## Inputs

- The human's premise, or a `.motion.json` / show they already opened.
- The step skill that owns the current step, read from that skill's own file.
- Human GO where a shipped gate already requires it (step 2 Approve). Do not manufacture GO.
- Local files those skills already accept. No new upload endpoint.

## Outputs

No file is written.

A later packaging story may only do this:

- Name the next step skill from the pack index and the artifact that skill already defines.
- Leave plate, camera, rhythm, sprite, background, foreground, and FX edits in the HTML Motion UI.
- At step 9, point the human at the existing composer export and, when they ask to stamp shipped Wave 1 hooks, at [`hm-compose-fx-impact`](../hm-compose-fx-impact/SKILL.md).
- Keep `.motion.json` as the single artifact ([`docs/product-flow/MOTION-JSON-SOT.md`](../../docs/product-flow/MOTION-JSON-SOT.md)).

Voice is not an output. Step 10 is omitted.

## FE handoff

Every step still opens in the composer for show and edit. n8n, when used, orders gates only ([`docs/product-flow/DUAL-PATH-CONTRACT.md`](../../docs/product-flow/DUAL-PATH-CONTRACT.md)). It does not compose.

Export stays the composer's existing HTML, PNG sequence, and MediaRecorder path, with the honesty that MIME support depends on the browser. This stub adds no export preset and no ffmpeg wrapper.

Frame peek and scrub stay the shipped HF-01 / HF-02 controls. This stub does not add a QA surface.

## Anti-jobs

- Do not fork a step skill's inputs, outputs, or handoff into this file.
- Do not replace `html-motion-composer` or reimplement `hm-compose-fx-impact`.
- Do not call, enable, or productize `hm-voice-track`. Voice stays DESIGNED-HOLD. #41 stays HOLD.
- Do not add a compose, save, or upload HTTP API, `api.teqcon.uk`, or `:8770`.
- Do not add Remotion, a Workers compose backend, or a provider login.
- Do not auto-approve a gate or resume n8n.
- Do not merge, deploy, or publish from this skill.

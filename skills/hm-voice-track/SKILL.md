---
name: hm-voice-track
description: DESIGNED-HOLD shell for Step 10 voice (HM-PF-47). Documents future VO/SFX hook boundaries while staying disabled until signed. Clash SFX #41 is already shipped separately.
---

# hm-voice-track

**Status:** DESIGNED-HOLD. Step 10 on the Approval Page (HM-PF-47).
**Not SIGNED.** This skill shell defines the documented Step 10 VO/SFX contract only. It does **not** ship a frontend voice recorder, invent a voice HTTP backend, redo [#41](../../docs/product-flow/HM-SFX-SAME-CLOCK.md), or treat #41 as still held. Do not SIGN HM-PF-47 or HM-PF-48 here.

Clash SFX (#41) already shipped on tip `35ee259` (accepted 16 Nov 2026) via the opt-in same-clock local WebAudio/WAV synth (`public/ui/clash-sfx-clock.js` and `scripts/clash-sfx-clock.cjs` on `renderAt`). HM-PF-48 ([`HM-PF-48-sfx-41-lift-checklist.md`](../../docs/product-flow/HM-PF-48-sfx-41-lift-checklist.md)) records the post-ship criteria audit for #41. Dialogue-hold timing packs (`dialogue_film_slow`, `micro_cut_flurry`) remain timing rhythm, not voice audio.

## Inputs

When a future Step 10 voice slice is signed and enabled outside this hold, a handoff to `hm-voice-track` would accept read-only metadata only:

- `show_id` and beat sequence exported from an approved Step 2 story (`beat_id`, `id`, `t0`, `t1`, `duration_s` from `renderAt` / `HMStudio.timelineDump`).
- Optional beat dialogue/caption lines (`atom.caption`, `atom.caption_style`, `atom.label`) without rewriting picture timing.
- External local rights/clearance manifest supplied by an operator (voice talent release, license scope, language locale).
- Reference boundary to existing clash SFX peaks (`show.sfx.hero_beat_t0` and `HMClashSfxClock.buildCuePlan` cue windows) so any future VO bed ducks rather than collides with shipped #41 clash transients.

Nothing in this shell triggers audio capture or collects voice files today.

## Outputs

No live product outputs yet. Future signed outputs stay strictly beside the composer:

- A local cue/script sheet (dialogue lines + `t0`..`t1` windows + `renderAt` offsets) prepared **outside** the browser composer.
- Disabled/visible n8n Step 10 flow-control hook metadata (`step: 10`, `step_id: voice`, `disabled: true`, `HMProductFlowNotify` refusal of step 10 until separately signed). Do not enable n8n step 10 or any Wait gate that approves live voice automation.
- No `.motion.json` audio binary embedding, no cloud TTS URLs, and no modification to the picture compose timeline.

## FE handoff

What stays **outside** the FE composer (HM FE-only invariant):

- Voice recording, microphone capture, cloud TTS / HeyGen avatars, and `-14 LUFS` broadcast loudness mastering.
- Audio-to-video muxing (external local `ffmpeg` workflow alongside exported frame sequences + timing JSON / local WAV).
- Any backend HTTP route (`api.teqcon.uk`, `:8770`, `/api/compose`, `/api/save`, workers voice upload).

What the FE composer keeps:

- Picture-only Playable HTML, PNG frames, and real-time WebM capture (`public/ui/exports.js`).
- Silent-by-default opt-in clash SFX preview in Bake QA (`#clashSfxToggle` on `renderAt` in `public/ui/clash-sfx-clock.js`), already shipped under #41.
- Do not add a voice recorder, waveform editor, microphone permission prompt, or live voice product UI to `public/ui/*` from this skill shell.

## Anti-jobs

- Do not SIGN this skill, HM-PF-47, HM-PF-48, or re-open #41 as held.
- Do not re-implement or rewrite shipped #41 clash SFX (`public/ui/clash-sfx-clock.js`, `scripts/clash-sfx-clock.cjs`).
- Do not enable n8n step 10 or any Wait gate that approves voice in production workflows.
- Do not add an FE voice recorder, microphone capture UI, cloud TTS client, or required audio engine.
- Do not invent a new audio HTTP backend or call `api.teqcon.uk`, `:8770`, or `/api/compose`.
- Do not treat timing packs (`dialogue_film_slow`, `micro_cut_flurry`) or picture captions as a voice track.

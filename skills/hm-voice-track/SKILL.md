---
name: hm-voice-track
description: DESIGNED-HOLD shell for Step 10 voice. Not SIGNED. Do not record audio, add SFX, enable n8n step 10, or build a voice UI. #41 stays HOLD.
---

# hm-voice-track

**Status:** DESIGNED-HOLD. Step 10 on the Approval Page.
**Not SIGNED.** This file does not lift #41 and does not SIGN HM-PF-47 or HM-PF-48.

HM-PF-47 is the designed skill shell. HM-PF-48 is the designed lift checklist. Both stay DESIGNED-HOLD. This story does not turn either into a weekday SIGN and does not write the checklist as tasks to implement.

Dialogue-hold timing packs (`dialogue_film_slow`, `micro_cut_flurry`) are rhythm. They are not a voice track and they are not an input to this skill.

## Inputs

None. There is no product run.

A future design note, not accepted here, would be a rights-cleared voice or SFX reference and a Jack decision that lifts #41. This file does not collect that reference and does not record that decision.

## Outputs

None. No audio file, no caption track that stands in for voice, no recorder session, and no change to `.motion.json`.

The node stays visible on the workflow board and disabled in any n8n spike. Disabled means the gate cannot approve voice.

## FE handoff

There is no product voice surface to hand off.

Existing local HTML, PNG, and video bake stays the composer export. That bake is picture. It is not a VO or SFX deliverable, and browser MediaRecorder output is still MIME-dependent. Do not add a recorder, a waveform, or a voice cue control to the composer from this file.

## Anti-jobs

- Do not SIGN this skill, HM-PF-47, HM-PF-48, or SFX / #41.
- Do not enable n8n step 10 or any Wait gate that approves voice.
- Do not add an FE voice recorder, microphone capture, or SFX library.
- Do not productize future VO or SFX hooks, including a UI placeholder that looks live.
- Do not schedule this file as Week A, Week B, or Week C implementation.
- Do not treat a rhythm hold as audio.
- Do not call `api.teqcon.uk`, `:8770`, or a compose / save HTTP API.

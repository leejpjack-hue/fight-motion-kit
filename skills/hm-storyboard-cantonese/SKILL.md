---
name: hm-storyboard-cantonese
description: HM-PF-51 contract stub for the Step 2 Cantonese second-by-second storyboard skill. Read the inputs, outputs, frontend handoff, and anti-jobs. Do not write a board file, add a storyboard editor, generate plates, or record Jack GO.
---

# hm-storyboard-cantonese

**Status:** HM-PF-51 contract stub. Step 2 on the Approval Page.
**Not an implementation.** This file does not add a storyboard editor and does not write a board.

HM-PF-06 owns Cantonese second-by-second board creation when that story is implemented. The upstream source format is void-array STORYBOARD-zh when that source is in the workspace. This stub does not redefine it. If that source is absent, say it is missing and stop. Do not invent a replacement prose format.

The id bridge that already shipped is [`docs/product-flow/beat-id-bridge.md`](../../docs/product-flow/beat-id-bridge.md) (HM-PF-08). A future board may use that shape. This stub does not stamp atoms.

## Inputs

- A short typed fight premise from the human.
- Optional archetype words the human already used (cold-open, duel, chase). This stub does not supply the HM-PF-07 catalog.
- Optional `show_id` of a show already open in the composer.
- An existing human Approve on the step-2 Jack GO gate, when one is already recorded. Implementation permission is not that Approve.

## Outputs

No file is written.

The contract a later implementation must meet, and must not widen here:

- Editable board text with second marks and beat labels in Cantonese.
- Stable `beat_id` values that match the HM-PF-08 board shape (`kind: "hm-pf-08-board"`, `show_id`, `beats[]` with `beat_id` and `label`).
- Cantonese prose stays on the board. `.motion.json` stores the id on the atom, as the bridge already describes.
- English gloss is out of this stub. HM-PF-07 owns template glosses.

## FE handoff

The human reviews and edits the board in the HTML Motion UI before any plate or sprite generation. The existing step-2 Jack GO gate (HM-PF-09) is the Approve / Rework control. Rework stays on step 2 and does not wipe a costume lock pack.

This stub does not open the UI, does not call the gate, and does not import a board. When a board file exists from elsewhere, the human opens the show and uses the controls that HM-PF-08 already shipped.

## Anti-jobs

- Do not add a storyboard editor, a writer script, or a new board schema.
- Do not generate plates, call sprite-gen, or advance to rhythm without a human GO.
- Do not manufacture Jack GO, Approve, or Rework.
- Do not rename `beat_id` rules or fork the HM-PF-08 bridge.
- Do not invent void-array fields when the STORYBOARD-zh source is missing.
- Do not add voice, SFX, or a #41 lift. Step 10 stays DESIGNED-HOLD.
- Do not call `api.teqcon.uk`, `:8770`, or a compose / save HTTP API.
- Do not treat n8n as the editor. n8n may later key a gate on `beat_id`. It does not write the show.

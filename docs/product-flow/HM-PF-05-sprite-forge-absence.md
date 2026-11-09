# HM-PF-05 — Sprite Forge is absent from the HTML Motion frontend

**Issue:** [#87](https://github.com/leejpjack-hue/fight-motion-kit/issues/87) · **Steps:** 1 and 6 · **Scope:** docs only. No composer change, no `GenerateImage` wiring, no provider call.

Sprite Forge is absent from the HTML Motion frontend. It is out of scope (OOS) for HM FE. Character art and sprite strips are generated outside this frontend. There is no in-FE GenerateImage product path.

Labels such as "Sprite Forge real" on pose libraries already in `kit/` name static files that were produced outside and committed. They are not a Sprite Forge control in the frontend.

## Operator checklist

Generate outside, QA, then hand off local PNG + JSON. HTML Motion edits the files it is given.

1. **Generate outside.** Produce the art with the external sprite-gen CLI (upstream pin `6a3f4c47`) or another operator tool, on a machine outside this frontend. Sprite Forge is not a control here. HM does not embed that CLI, take a provider login, or call GenerateImage.
2. **QA.** Review the outside result before it enters the composer. The adapt page's outside step covers identity, feet, alpha, loop, and rights. HM does not accept login or run credentials, and this note adds no QA backend.
3. **Local PNG + JSON handoff.** Bring the finished pair in as local files (a `.strip.png` with its `.strip.json`, or another local PNG + JSON pack the File API already accepts). No remote URL. No upload API.

The existing local strip handoff is [`skills/hm-spritegen-handoff/SKILL.md`](../../skills/hm-spritegen-handoff/SKILL.md). This story does not change that skill, `public/ui/project-media.js`, or the staged-strip gate.

## Source of truth

- Sprite-gen adapt Page: https://sprite-gen-html-motion-urak.pages.grok.bot/
- Builder brief on the CoS box: `/workspace/hr/briefs/sprite-gen-html-motion-2026-11-07.md`

That brief is not vendored into this repository. [`companion-notes.md`](companion-notes.md) already cites the same path for the sprite-gen scope gates (`HM-SG-00` through `HM-SG-04`). [`PRODUCT-FLOW.md`](PRODUCT-FLOW.md) step 6 is the in-repo product statement: external sprite-gen stays outside HTML Motion.

## What this page does not add

- No in-FE GenerateImage product path.
- No Sprite Forge UI, login, or generation backend.
- No HM-SG-01 code change. No HM-PF-27, HM-PF-28, HM-PF-47, or HM-PF-48.
- No voice track and no #41 SFX.
- n8n stays gates and control only. It does not generate plates.

## Verification

`node --test tests/hm-pf-05-sprite-forge-absence.test.cjs` is part of `npm test`. It reads this page and [`PRODUCT-FLOW.md`](PRODUCT-FLOW.md). It checks the absence sentence, the checklist order, the CoS brief path, and the adapt-page link. It does not call a provider.

# n8n and HTML Motion dual-path contract

**Story:** HM-PF-50 (SIGNED). Owner is Cursor. Depends on HM-PF-49.
**Date:** 8 Nov 2026 (Asia/Tokyo)
**Landing:** [`PRODUCT-FLOW.md`](PRODUCT-FLOW.md)

Humans and agents share this page for one control rule. n8n orders the steps and holds the gates. The HTML Motion UI shows and edits the artifact. Skills assist beside that edit.

This file is a kit design doc. It does not install n8n, install Cursor catalog plugin `73065872`, add workflow JSON, change the composer or schemas, or define a compose API.

## The rule

- n8n is flow control, human gates, skill HTTP stubs, and notify.
- The HTML Motion UI shows and edits `.motion.json`, plates, camera, rhythm, and FE-only compose.
- Skills assist beside the human. A skill does not replace inspection in the HTML Motion UI.
- DiagramTool boards are the design source of truth. They are not the live runtime.

Every step keeps both paths. Jack can show and edit the artifact in the HTML Motion UI, and a skill may assist. n8n sequences those paths and pauses for Jack. n8n does not collapse a step into an AI-only path.

## Owns and must-not-own

The six swimlanes on [`architecture.board.json`](architecture.board.json) stay design-ownership bands. See [Ownership lanes](PRODUCT-FLOW.md#ownership-lanes). The table below is the control split. n8n is not an extra lane, and it does not take compose or bake from the HTML Motion bot lane.

| Layer | Owns | Must not own |
|---|---|---|
| **n8n** | Step order 1..9, with step 10 HOLD / disabled. Triggers. Wait, Approve, and Rework. HTTP stubs to skills. Notifying Jack. | Plate and camera editing. FE compose. The `.motion.json` schema. Any compose or save API. |
| **HTML Motion UI** | Show and edit for the current step. IndexedDB. Local bake. FE-only compose within 60 seconds. | A workflow scheduler across shows or stories. |
| **Skills** | Draft, generate, and lint assist for one step, beside the human edit. | Replacing the human edit. Silent auto-approve. A product backend. |
| **DiagramTool boards** | Design source of truth for the architecture swimlanes and for steps 1..10 ([`architecture.board.json`](architecture.board.json), [`workflow.board.json`](workflow.board.json)). | Live runtime. Execution state. |

n8n does not absorb plate, camera, or compose. Those stay in the frontend composer. Step 9 stays in the browser (`compose-client`, `motion-renderer`, `.motion.json`). `html-motion-composer` scripts may assist that step. They are not a compose API. `.motion.json` stays the artifact. There is no product compose or save callback for n8n to call.

## Dify stays the runner-up

[`PRODUCT-FLOW.md`](PRODUCT-FLOW.md) and [`HANDOFF.json`](HANDOFF.json) record the pick. Primary is n8n. Runner-up is Dify. Dify is not the live orchestrator. Plate and camera review stay in the HTML Motion UI, and stay out of Dify Human Input forms.

## Voice and #41

Step 10 is a disabled HOLD node only. This contract does not SIGN SFX or audio. A gate does not approve voice.

## Constraints that stay in force

Same limits as [`PRODUCT-FLOW.md`](PRODUCT-FLOW.md#constraints-that-stay-in-force).

- **FE-only.** Workers UI, IndexedDB, and `.motion.json`. See [`docs/FRONTEND-ONLY-2026-10-23.md`](../FRONTEND-ONLY-2026-10-23.md).
- **Forge.** Composer and show land on fight-motion-kit. Wave 1 FX vendor authorship lands on pixelfx. Checklist: [`FORGE-BOUNDARY.md`](FORGE-BOUNDARY.md) (HM-PF-52).
- **Cap.** At most 3 SIGNED HTML Motion stories per weekday.
- **Jack bar.** Open a fight, tweak, and compose within 60 seconds. The 5.00s eight-plate demo (`daiyu-wang-five-seconds`) stays intact.
- **n8n is gates and control only.** It sequences steps, calls skill stubs, and pauses. It does not generate the show.

## Resume, still with no compose API

HTML Motion is browser-local. Jack can resume a paused gate from the n8n execution panel, from the resume form URL on the gate, or later from the resume webhook. A future Slack send-and-wait (HM-PF-53) can offer the same Approve or Rework choice. None of those paths write `.motion.json` or call a compose backend. Rework returns to the same step. It does not, by itself, wipe lock packs. The HTML Motion UI keeps the artifact. Any step's edit is on that same `.motion.json`, so a paused gate resumes from the file the composer saved. See [`MOTION-JSON-SOT.md`](MOTION-JSON-SOT.md) (HM-PF-44).

## HM-PF-49 spike

HM-PF-49 spike artifacts are ready and sit outside this kit. They are the spike plan, `docker-compose.yml`, the steps 1..10 workflow JSON, and the gate notes. Live n8n did not start on the Cursor machine. Docker was missing there. Jack runs that smoke on his own machine. That blocked smoke does not block this contract.

This kit does not copy that workflow in, start Docker, or install plugin `73065872`.

## When step labels drift

If an n8n step label, [`workflow.board.json`](workflow.board.json), and the docs in `docs/product-flow/` disagree, the boards and these docs win. Update all three in one signed story.

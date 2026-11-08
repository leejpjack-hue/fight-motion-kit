# HM-PF-53 — Jack notify bridge (Slack/form) without a compose API

**Base:** `954b5502` (HM-PF-09 on main) · **Scope:** FE + docs + tests + n8n
spike JSON. There is no backend, no live Slack send, and no Voice/#41 work.

## What Jack sees

The **Notify Jack · gate ping** panel ([`product-flow-notify.js`](../../public/ui/product-flow-notify.js),
`#pf53NotifyPanel`) sits right under the PF-09 **2 Story · Jack GO gate**. It shows:

- **Gate** select: S1..S9 from [`PRODUCT-FLOW.md`](PRODUCT-FLOW.md). The default
  is **S2 Story**. **S10 Voice — HOLD #41** is listed but disabled, and
  `buildNotify({step:10})` throws.
- A Slack-style preview card labelled **PREVIEW · not sent**. Its Approve and
  Rework buttons are decoration only. The real decision is made in the n8n Wait form.
- **Copy notify** writes the notify text to the clipboard with
  `navigator.clipboard.writeText`. Jack, or n8n's stub, pastes it into Slack or
  the form. If the clipboard is unavailable, the panel says so and the preview
  text can still be selected by hand.

Notes and the resume-form URL come from the PF-09 fields `#pf09GateNotes` and
`#pf09ResumeHint`. Approve and Rework stay in PF-09: the decision is stored
locally under `hm.pf09.gate.<show_id>` and nothing is sent over the network.

## Notify contract (GATE-UX template)

```text
HM gate — Step {n} {label} — show {show_id}
{hm_ui_instruction}
HM UI location: {origin}/ui/?show={show_id}#{anchor}
Resume form: {resumeFormUrl}
Decision: Approve|Rework
Notes: {Notes}
show_id: {show_id}
step: {n}; step_id: {step_id}; step_label: {step_label}
Open HM UI, review/edit, then submit Approve or Rework in the n8n form to resume.
```

`buildNotify()` returns `{title, body, text, fields}`. `fields` carries `step`,
`step_id`, `step_label`, `decisions: ["Approve","Rework"]`,
`hm_ui_instruction`, `hm_ui_deep_link`, `resume_form_url`, `Notes`, and `show_id`.
Any value that is missing keeps its `{placeholder}`.

| Step | step_id | HM UI anchor |
|---|---|---|
| 1 Character creation | `character` | `#plateJumpList` |
| 2 Story | `story` (= PF-09 `STEP2`) | `#timelineJsonPanel` |
| 3 Rhythm | `rhythm` | `#framePeekStrip` |
| 4 Scene cam-shot design | `scene_cam_design` | `#cutTransitionGroup` |
| 5 Per-scene cam shots | `per_scene_cam` | `#camera` |
| 6 Sprite gen | `sprite_gen` | `#importStrip` (staged only; NOT PLAYABLE until SG-02) |
| 7 Background scene | `background` | `#backgroundMotionDetails` |
| 8 Foreground | `foreground` | `#foregroundPanel` |
| 9 HTML Motion cam-shot compose | `hm_compose` | `#stage` |
| 10 Voice | — | HOLD / #41, no notify |

The step 2 id, label, and instruction are asserted to match HM-PF-09 `STEP2`.
The S1 and S3..S9 ids are new in this story. The PF-49 `GATE-UX.md` and workflow
export were not on the build box, so these ids come from `PRODUCT-FLOW.md`.
Reconcile them with GATE-UX before Jack SIGN if they differ.
The deep-link hash only scrolls to the surface. A show that isn't available
locally still has to be opened from the project picker, same as PF-09.

## n8n pattern (spike; no runtime)

[`hm-pf-53-notify-workflow.json`](hm-pf-53-notify-workflow.json) is importable.
For each of S1..S9 the node chain is:

`S{n} Gate prep` (Set) → `S{n} Render notify` (Code; the same template, with
`$execution.resumeFormUrl`) → `S{n} Slack notify (stub)` (**disabled**,
placeholder credential) → `S{n} Wait — Jack form` (form: `Decision`
Approve/Rework, `Notes`, `show_id`) → `S{n} Approve?` (IF). The true branch goes to
the next gate. The false branch (Rework) loops back to the same Gate prep.
`S10 Voice — HOLD #41` is a disabled NoOp. The workflow has no HTTP Request,
webhook, or file-write nodes, never calls `/compose`, and never writes
`.motion.json`. A disabled Slack node passes its data through, so the Wait still opens.
Until a credential is signed, the notify text can be copied from the Render node
output or from HM UI **Copy notify**.

## Verification

- `node --test tests/hm-pf-53-notify.test.cjs` checks the payload fields
  (step id, Approve/Rework, deep link, instruction), S1..S9 anchors in
  `index.html`, the S10 HOLD, the panel's clipboard-only behaviour with zero
  network calls, the wiring order, that the new source contains no
  compose/transport strings, and the shape of the n8n workflow.
- Both suites are now part of `npm test`.
- Capscreens `53-A`..`53-F` are in the spike deliverable
  `hm-pf-53-2026-11-08/capscreens/`.

The dual path is unchanged: **n8n = control + gates + notify; HM UI =
show/edit; skills = assist; boards = design source of truth.**

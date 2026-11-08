# HM-PF-09 — Jack GO gate for step 2 Story

The visible **2 Story · Jack GO gate** panel above the atom timeline offers
**Approve** and **Rework**, optional Notes, the open show_id, and an optional
resume-form URL hint. The storyboard surface is the atom sequence editor and
HM-HF-07 timeline JSON inspector. Its instruction is exactly:

`HM UI: atom sequence editor + HM-HF-07 timeline JSON`

Board-friendly instruction: `Atom sequence + HM-HF-07 timeline JSON`.
The panel's **Open storyboard / timeline JSON** link opens that inspector.
For a show already available locally, use `/ui/?show={show_id}#timelineJsonPanel`;
an unavailable show still needs to be opened using the existing project picker.

Approve saves a local decision under `hm.pf09.gate.<show_id>` in localStorage.
It does not advance or resume n8n. The selectable instruction box provides a
manual handoff to an operator-supplied resume form; the URL hint is text only.
If local storage fails, the panel reports failure instead of claiming approval.
Rework returns the shell focus to the timeline, opens the JSON inspector, and
focuses the selected atom, falling back to the first atom or empty-show summary.

Rework snapshots the **current** lock fields immediately before returning to
editing: `show.chars`, `show.costume_lock`, `show.lock_pack`,
`show.meta.costume_lock`, and `show.meta.lock_pack`, when present. The snapshot
is deep-cloned and recursively frozen. Restoration copies only those fields,
leaving other metadata and storyboard edits intact, then verifies equality.
No project reload, character reset, or stale gate-open snapshot is involved.
Rework itself does not overwrite the last locally stored approval; a later
Approve replaces it. Rework instructions can be submitted manually to the form.

The PF-49 Wait S2 field contract is `Decision` (`Approve` or `Rework`), `Notes`,
and optional `show_id` (included for the open show). Context carries `step: 2`,
`step_id: "story"`, `step_label: "2 Story"`, and `hm_ui_instruction`.
An optional `resume_form_url` is a local handoff hint, not a required form field.

The dual path remains: **n8n = control + Wait gates; HM UI = show/edit;
skills = assist; boards = design source of truth**. There is no compose API,
automatic resume request, or n8n write to `.motion.json` in this story.

## Slack/form notify option — documentation only

Reuse the **GATE-UX.md notify pattern** with the PF-49 Wait S2 form:

```text
Title: HM gate — Step {n} {label} — show {show_id}
Body:
HM UI: atom sequence editor + HM-HF-07 timeline JSON
HM UI location: /ui/?show={show_id}#timelineJsonPanel
Resume form: {resumeFormUrl}
Decision: Approve|Rework
Notes: {Notes}
show_id: {show_id}
```

For step 2, `{n}=2` and `{label}=Story`. A future notifier may send this via
Slack and direct Jack to the form after HM UI inspection. **HM-PF-53 owns live
notify** — see [`HM-PF-53-notify-bridge.md`](HM-PF-53-notify-bridge.md). HM-PF-09 sends no Slack messages and makes no gate network requests.

## Sources of truth

- **GATE-UX.md**, step 2 HM UI instruction and notify pattern (external contract
  supplied in the HM-PF-09 brief; the file is not present in this checkout).
- **PF-49 workflow, Wait S2**, `Decision` / `Notes` / `show_id` form (external
  contract supplied in the brief; no workflow export is present here).
- [`workflow.board.json`](workflow.board.json), node **Step2Story**; readable
  source [`workflow.dsl`](workflow.dsl), `node Step2Story`.
- [`PRODUCT-FLOW.md`](PRODUCT-FLOW.md), locked step 2 and ownership separation.

No n8n runtime is needed. Browser/Playwright verification is intentionally
skipped for this slice; Node contract checks do not establish browser or Jev approval.

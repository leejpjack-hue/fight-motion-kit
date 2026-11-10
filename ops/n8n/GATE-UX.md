# HM-PF-49 — Gate UX + dual-path contract (one-pager)

**Date:** 2026-11-08 (Asia/Tokyo) · **Story:** HM-PF-49 spike  
**Companion:** `SPIKE-PLAN.md` · `workflows/hm-product-flow-1-10.json`

---

## Dual-path contract (encode everywhere)

```
n8n  = flow CONTROL + human GATES + skill invoke stubs + notify
HM UI = artifact SHOW / EDIT (.motion.json, plate, cam, rhythm, compose FE-only)
skills = ASSIST beside human (never replace HM UI inspection)
DiagramTool boards = DESIGN SoT (not live runtime)
```

| | **Owns** | **Must not own** |
|--|----------|------------------|
| **n8n** | Step order 1..9 (+10 HOLD), Wait/Approve/Rework, HTTP stubs to skills, Jack notify | Plate/cam WYSIWYG, `.motion.json` schema, FE compose, invent compose/save API |
| **HM UI** | Per-step show/edit; IndexedDB; local bake | Cross-show workflow scheduler |
| **Skills** | Draft / generate / lint assist for a step | Silent auto-approve; product backend |
| **Boards** | Architecture + 1..10 design truth | Execution state |

**Dify** = named runner-up only (form-centric AI apps). Do not absorb plate/cam review into a second product UI.

**Voice / #41** = step 10 **HOLD / disabled** node only. No SFX/audio SIGN via gates.

---

## Approve / Rework — n8n form path (spike default)

Each step 1..9 ends in a **Wait → On Form Submitted** node.

1. Skill HTTP stub runs (placeholder; may no-op / neverError).
2. **Gate prep** node records:
   - `hm_ui_instruction` — what to open in HM
   - `{{ $execution.resumeFormUrl }}` — form Jack submits
   - `{{ $execution.resumeUrl }}` — webhook alternate
   - Slack notify template string (unused until HM-PF-53)
3. Execution **pauses** at Wait (offloaded to DB — safe for multi-day gaps).
4. Jack opens **HM UI**, edits the artifact for that step, then opens the **resume form URL**.
5. Form fields:
   - **Decision** (required dropdown): `Approve` | `Rework`
   - **Notes** (optional textarea)
   - **show_id** (optional text)
6. **IF Approve?**  
   - Approve → next step  
   - Rework → loop back to same step Set (re-run stub + re-gate; does not wipe lock packs by itself — HM UI owns artifact persistence)

### Per-step HM UI instructions (copy onto notify)

| Step | Open in HM UI | Skill assist (optional) |
|------|---------------|-------------------------|
| 1 | Character/plate picker, costume-lock, pose cards | character/OpenPose |
| 2 | Atom sequence + HM-HF-07 timeline JSON | storyboard draft |
| 3 | duration_s, beat_blocks, frame peek, scrub | rhythm lint / frame-qa |
| 4 | fight-cam-grammar templates + HM-HF-08 cuts | cam-grammar planner |
| 5 | camera.preset, CAM-10R, PAN-SPAN | cam-preset tune |
| 6 | SG-01 staged strip picker (**NOT PLAYABLE** until SG-02) | sprite-gen CLI |
| 7 | BG crop/pan/span/parallax | BG framing |
| 8 | FG cutouts + IMPACT FX chips | rembg / fx_hooks |
| 9 | compose-client + motion-renderer + `.motion.json` | composer scripts (**no compose API**) |
| 10 | — HOLD — | — disabled — |

---

## Slack / notify pattern (document only — HM-PF-53 implements)

Spike does **not** send live Slack. Pattern for Antigravity HM-PF-53:

```
Title: HM gate — Step {n} {label} — show {show_id}
Body:
  1) Open HM UI → {hm_ui_instruction}
  2) Edit / inspect artifact (dual path; skills optional)
  3) Submit gate: {resumeFormUrl}
     Decision: Approve | Rework
Alt resume webhook: {resumeUrl}
n8n = control; HM = edit; no compose API.
```

Rules:

- Notify carries **step id + Approve/Rework + HM instruction/deep-link**
- Never invent a product compose/save callback
- Prefer one ping per Wait; avoid notify spam (cap discipline)
- Form path works without Slack (Jack can copy resumeFormUrl from n8n execution UI)

---

## Resume bridge without compose API (FE-only)

HM is browser-local. Allowed resume paths:

1. **Manual:** Jack uses n8n execution panel → open Wait form → Approve  
2. **Form URL:** Gate prep / notify carries `$execution.resumeFormUrl`  
3. **Webhook:** `$execution.resumeUrl` for a future thin “Mark done” button (still not a compose API)  
4. **Slack send-and-wait** (optional later): same Approve/Rework semantics

**Forbidden:** n8n writing `.motion.json`, calling a made-up `/compose` backend, or replacing HM Studio preview.

---

## Operator smoke (after import)

1. Manual Trigger  
2. Confirm S1 HTTP stub continues even if placeholder DNS fails (`neverError`)  
3. Open Wait form → **Rework** → lands back on S1  
4. **Approve** → advances to S2  
5. Skip ahead mentally: S9 Approve → End; S10 remains disabled/unconnected  

---

## SoT drift guard (one line)

If n8n step labels ≠ DiagramTool `workflow.board.json` ≠ kit `docs/product-flow/`, **boards/docs win** until a signed story updates all three together (see SPIKE-PLAN §6 · HM-PF-50).

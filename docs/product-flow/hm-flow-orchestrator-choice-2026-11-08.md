# HTML Motion — flow orchestrator choice (visual, Jack-editable)

**Date:** 2026-11-08 (Asia/Tokyo)  
**Trigger:** Jack revise on product-flow APPROVAL — study Dify / Langflow / LangGraph / n8n / peers; choose one Jack can **see and edit** himself.  
**Status:** RESEARCH + RECOMMENDATION only. **No SIGN. No product code. No plugin install. No canvas edit.**  
**Related:** Approval Page canvas `8cd93fd2-5ce0-4640-817c-8882fb7d0599` (parent owns edits); boards `/workspace/deliverables/hm-approval-boards-2026-11-08/`; FE-only SoT `/workspace/hr/html-motion/architecture/FRONTEND-ONLY-2026-10-23.md`.

---

## TL;DR pick

| Role | Tool | One-line why |
|------|------|----------------|
| **PRIMARY** | **n8n** (self-host Community first) | Mature visual canvas Jack can open and edit; native Wait / form / Slack human gates between the locked 10 steps; HTTP + code nodes wrap Grok Bot skills and local scripts **without** becoming the HM composer. |
| **RUNNER-UP** | **Dify** (self-host Community) | Strongest in-canvas Human Input forms for AI draft review/edit; heavier stack and more “AI app product” gravity — risk of competing with HM UI. |

**Anti-fits for Jack’s bar:** LangGraph-only (and LangSmith Studio as primary editor) — visualize/debug for developers, **not** a Jack-first drag-edit workflow canvas. Flowise — EOL 2026-08-31; do not start new work there.

---

## Locked product constraints (score against these)

1. Jack must **SEE and EDIT** the product flow himself (human-first visual UX).
2. HM product path stays **FE-only** (Workers UI, IndexedDB / `.motion.json`). Orchestrator must **not** invent a compose backend or replace plate/cam edit UI.
3. Locked 10 steps, each with **HM UI show/edit + AI skill beside**, plus **human gates** (approve plate, edit cam, etc.).
4. Orchestrator = **flow control + gates**; skills = create/edit assist; HM UI = artifact edit surface.
5. Cap ≤3 SIGNED HM stories/weekday; voice / #41 SFX stays **HOLD**.
6. Solo operator ops burden matters; prefer self-host / privacy-friendly.

---

## Comparison table (2025–2026 state)

Scores: **H** = strong fit · **M** = workable · **L** = weak / anti-fit for THIS use.

| Criterion | **n8n** | **Dify** | **Langflow** | **LangGraph + Studio / Fleet** | **Flowise** (peer) |
|-----------|---------|----------|--------------|--------------------------------|---------------------|
| Visual canvas Jack edits himself | **H** — production visual editor | **H** — Workflow/Chatflow canvas | **H** — visual builder (Python-flavored) | **L** — Studio = agent IDE (visualize/debug); Fleet = no-code **agents**, explicitly **not** a visual workflow builder | H historically, but **EOL** |
| Self-host / privacy / FE-adjacent | **H** — single Docker; stays beside FE | **M** — Docker Compose, many services (~DB + vector + sandbox) | **H** — Docker / `uv`; light | **M** — code + LangSmith account; cloud gravity for Fleet | n/a |
| Multi-step AI + human gates | **H** — Wait (webhook/form), Slack/Chat “send and wait”, AI-tool HITL | **H** — Human Input node (form, approve/edit/regenerate, timeout) | **M–H** — Human Input / tool approval (newer HITL) | **M** — interrupt/HITL in code; not Jack-canvas gates | — |
| Wrap skills / HTTP / local scripts without owning compose | **H** — HTTP Request, webhooks, Code, Execute Command (self-host), MCP | **H** — HTTP, tools, marketplace; more AI-app-centric | **H** — API + MCP + Python components | **H** for eng teams; L for Jack solo visual | — |
| Jack-editability vs code-first | **H** — no/low-code first | **H** — low-code AI apps | **M** — visual + open Python on every node | **L** — code-first graphs | — |
| Solo ops burden | **H** — lightest full orchestrator | **L–M** — fuller platform to babysit | **M** — light runtime; security hardening on you | **L** — eng toolchain | — |
| Cost / license (high-level) | Self-host Community free for **internal** use (Sustainable Use License); Cloud from ~€20/mo | Community self-host; Cloud sandbox/paid; modified Apache (logo / multi-tenant limits) | **MIT** OSS; Desktop / Cloud options | LangSmith free tier for Studio; Fleet/cloud product surface | Archived |
| Fit vs DiagramTool boards + HM composer | **H** — mirror 1..10 as nodes; HM stays artifact UI | **M** — easy to absorb review UI into Dify forms | **M** — good skill graphs; weaker durable ops spine | **L** as Jack editor; possible later runtime under a visual layer | **L** — do not adopt |
| Cursor / Grok Bot ecosystem | **H** — catalog plugin id `73065872` exists (not installed) | None found | None found | None found | — |

**Peers checked and not recommended as primary:** Flowise (EOL); Temporal+UI (durable eng workflows, not Jack-first AI pipeline canvas); CrewAI Studio (agent crew framing, not the 10-step gated product flow editor).

---

## Why n8n wins

1. **Matches Jack’s wording literally.** He asked for flow control he can **visual and edit**. n8n’s canvas is that job: drag steps, open any day, change order/gates without opening a Python repo.
2. **Human gates are first-class for a multi-day pipeline.** Wait → form / webhook / Slack approval pauses execution and resumes later — exactly “approve plate → edit cam in HM → continue.” Dify’s Human Input is excellent for **in-form AI draft review**, but the HM bar already says plate/cam edit lives in **HM UI**, not in a second review app.
3. **Thin control plane.** HTTP + webhook nodes call Grok Bot skills, sprite-gen CLI wrappers, or local scripts. Compose stays in FE-only HM. That respects `FRONTEND-ONLY-2026-10-23.md`.
4. **Ops for one operator.** One container (or n8n Cloud) vs Dify’s multi-service stack. Fits ≤3 SIGNED stories/day discipline: less platform tax.
5. **Ecosystem hook.** Cursor plugin catalog already lists n8n (`73065872`). Do **not** install until Jack APPROVE — but availability reduces integration friction later.
6. **Maps cleanly onto existing boards.** DiagramTool `workflow.board.json` steps 1..10 become n8n nodes + Wait gates; architecture swimlanes stay ownership SoT, not runtime.

---

## Why not the others (decisive)

| Tool | Verdict |
|------|---------|
| **Dify** | Runner-up. Best when the **AI app is the product** (KB, published chat/API, rich Human Input forms). For HM, that gravity competes with Workers composer and invites putting show/edit into Dify forms. Heavier self-host. Keep as fallback if Jack prefers form-centric review over Slack/Wait + HM deep-links. |
| **Langflow** | Excellent **skill/IDE** canvas (MIT, Python components, MCP). Weaker as the **durable product pipeline** Jack edits for gates, schedules, Slack, and cross-bot HTTP. Prefer later as optional skill-authoring side tool, not the product-flow controller. |
| **LangGraph / LangSmith Studio** | Studio visualizes and debugs graphs written in code; hot-reload from code, not Jack drag-edit of the 10-step product flow. Fleet/Agent Builder is no-code **agents** and LangChain’s own blog contrasts it with visual workflow builders. **Fails “visual edit by me” as primary.** May re-enter later as an execution engine *under* a visual layer — not the pick now. |
| **Flowise** | End of life 2026-08-31 (repo archived). Migration target only if legacy flows existed; they do not for HM. |

---

## Architecture sketch (orchestrator vs HM vs skills)

```
┌─────────────────────────────────────────────────────────────┐
│  Jack edits VISUALLY                                         │
│  n8n canvas = product FLOW CONTROL (steps 1..10 + gates)     │
│  [1 Char]→Wait→[2 Story]→Wait→…→[9 Compose]→[10 Voice HOLD] │
└───────────────┬─────────────────────────────┬───────────────┘
                │ trigger / HTTP / webhook      │ resume after approve
                ▼                               ▼
┌───────────────────────────┐     ┌─────────────────────────────┐
│ AI skills (beside path)   │     │ HM Composer (FE-only UI)    │
│ Grok Bot skills, local    │     │ Workers UI · IndexedDB      │
│ scripts, sprite-gen CLI,  │     │ .motion.json SoT            │
│ OpenPose / cam-grammar    │     │ plate · cam · rhythm edit   │
│ HTTP endpoints / webhooks │     │ compose / bake in browser   │
└───────────────────────────┘     └─────────────────────────────┘
                │                               │
                └──────── artifacts / paths ────┘
                         (URLs, file picks, show_id)
```

**Separation rules (encode in design, not code yet):**

| Layer | Owns | Must not own |
|-------|------|--------------|
| **n8n** | Step order, triggers, Wait/approve gates, calling skills, notifying Jack | Plate/cam WYSIWYG, FE compose, `.motion.json` schema |
| **HM UI** | Show/edit artifacts for each step; Jack bar compose ≤60s FE-only | Becoming the cross-story workflow scheduler |
| **Skills / bots** | Create/edit assist for a step (draft storyboard, run sprite-gen, frame-qa) | Replacing human edit; inventing product backend |
| **DiagramTool boards** | Approval-time architecture + 1..10 design SoT | Live runtime |

**Dual-path note (locked):** every step still has HM UI show/edit **and** skill assist. n8n sequences them and pauses for Jack; it does not collapse the dual path into “AI-only.”

**Voice / #41:** model step 10 as a **disabled / skipped HOLD** node in n8n until a future APPROVAL lifts it. No SFX/audio SIGN via this pick.

---

## Open risks

1. **FE ↔ orchestrator resume bridge.** HM is browser-local. n8n Wait-on-webhook needs a deliberate resume path (manual “Mark done” in n8n, Slack approve after Jack edits in HM, or a tiny non-compose callback — **must not** reintroduce a compose API). Design this explicitly before SIGN.
2. **Sustainable Use License.** Community self-host is fine for Jack’s **internal** use. Hosting n8n as a multi-tenant product for external editors needs a commercial path — out of scope for HM desk use, but do not white-label Community carelessly.
3. **Do not absorb compose.** Temptation to “just generate the show in n8n” would violate FE-only. Keep nodes as *control + skill invoke + gate*.
4. **Long waits / weekday cap.** Wait offloads to DB (good). Still: gates must not create silent backlog past ≤3 SIGNED stories/weekday discipline.
5. **Plugin not installed.** Catalog id `73065872` is availability only. Install only after Jack APPROVE of this pick + parent policy.
6. **DiagramTool ≠ n8n.** Boards remain design SoT; n8n is runtime control. Avoid two conflicting “truths” — version the 10-step list in one place when implementing.
7. **Dify temptation.** If runner-up is chosen later, guard against replacing HM review surfaces with Dify Human Input forms for plate/cam.

---

## Next steps IF Jack APPROVE this pick (n8n)

1. **Stand up n8n** self-host (Docker volume + HTTPS reverse proxy) **or** evaluate n8n Cloud for Jack-only access — spike only; no product SIGN.
2. **Model the locked 1..10 flow** as one workflow: one node (or sub-workflow) per step + **Wait / approval** after each human gate; mark **10 Voice** as HOLD/disabled.
3. **Define gate UX:** Slack or n8n form “Approve / Rework” + deep-link or instruction to open the matching HM UI surface (plate, cam, rhythm, etc.).
4. **Stub skill HTTP:** HTTP Request nodes pointing at placeholder skill/webhook URLs (character/OpenPose, storyboard, sprite-gen CLI wrapper, `build-project` / `frame-qa`) — no real product compose backend.
5. **Write a one-page contract** (parent can put on Approval Page): n8n = control; HM UI = edit; skills = assist; FE-only unchanged; #41 HOLD; DiagramTool boards remain design SoT.

---

## Sources (fetched / consulted)

| Source | URL |
|--------|-----|
| n8n GitHub / product | https://github.com/n8n-io/n8n |
| n8n HITL for AI tools | https://docs.n8n.io/build/integrate-ai/ai-examples/human-in-the-loop-for-tools |
| n8n Wait node | https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.wait |
| n8n features / AI agents | https://n8n.io/features/ · https://n8n.io/ai-agents/ |
| n8n pricing / license FAQ | https://n8n.io/pricing/ · https://docs.n8n.io/n8n-community-license · https://support.n8n.io/article/can-i-use-your-license-for-my-use-case |
| Dify product + GitHub | https://dify.ai/ · https://github.com/langgenius/dify/ |
| Dify Workflow & Chatflow | https://docs.dify.ai/en/self-host/use-dify/build/workflow-chatflow |
| Dify Human Input node | https://docs.dify.ai/en/self-host/use-dify/nodes/human-input |
| Langflow GitHub / docs | https://github.com/langflow-ai/langflow/ · https://docs.langflow.org/deployment-docker · https://docs.langflow.org/security |
| LangSmith Studio (ex–LangGraph Studio) | https://docs.langchain.com/oss/python/langgraph/studio · https://docs.langchain.com/langsmith/studio |
| LangSmith Fleet / Agent Builder (not visual workflows) | https://docs.langchain.com/langsmith/fleet · https://www.langchain.com/blog/langsmith-agent-builder |
| Flowise sunset / EOL | https://flowiseai.com/sunset · https://github.com/FlowiseAI/Flowise/discussions/6727 |
| Independent comparisons (context only) | https://wz-it.com/en/blog/dify-flowise-langflow-n8n-comparison/ · https://vdf.ai/blog/dify-vs-n8n-vs-flowise-vs-langflow/ |
| Local FE-only + board notes | `/workspace/hr/html-motion/architecture/FRONTEND-ONLY-2026-10-23.md` · `/workspace/deliverables/hm-approval-boards-2026-11-08/companion-notes.md` |

---

## Handoff

- Brief path: `/workspace/hr/briefs/hm-flow-orchestrator-choice-2026-11-08.md`
- Parent JSON: `/workspace/deliverables/hm-flow-orchestrator-2026-11-08/HANDOFF.json`
- Parent may update Approval Page; this executor did **not** edit canvases, install plugins, SIGN, or message Jack.

# HM-PF-49 — n8n self-host spike plan (1..10 Wait gates)

**Story:** HM-PF-49 · **Owner:** Cursor · **Status target:** READY (artifacts) / BLOCKED_RUNTIME on Cursor box  
**Date:** 2026-11-08 (Asia/Tokyo)  
**Jack authorize:** t2476u SIGN ALL  
**Reuse:** `/workspace/hr/briefs/hm-flow-orchestrator-choice-2026-11-08.md` · `/workspace/deliverables/hm-flow-orchestrator-2026-11-08/HANDOFF.json` · fight-motion-kit `docs/product-flow/` tip `970c1f9b` · boards `/workspace/deliverables/hm-approval-boards-2026-11-08/`

---

## 1. Goal (Jack)

Jack opens the n8n canvas → sees steps 1..10 as editable nodes → changes order/gates himself → hits human Approve/Rework Wait forms between steps → edits artifacts in **HM UI** (not inside n8n) → resumes the flow. Step 10 Voice/#41 stays **disabled HOLD**.

## 2. Locked separation (do not violate)

| Layer | Owns | Must not own |
|-------|------|--------------|
| **n8n** | Step order, triggers, Wait/Approve/Rework, calling skill HTTP stubs, notifying Jack | Plate/cam WYSIWYG, FE compose, `.motion.json` schema, invent compose API |
| **HM UI** | Show/edit artifacts per step; FE-only compose ≤60s | Cross-story workflow scheduler |
| **Skills / bots** | Create/edit assist beside human | Replacing human edit; product backend |
| **DiagramTool boards** | Design SoT for 1..10 + architecture | Live runtime |

Dual path on every step: HM UI show/edit **and** skill assist. n8n sequences + pauses; it does not collapse to AI-only.

## 3. How Jack runs Community self-host (preferred)

### 3.1 Prerequisites (Jack's machine — not the Cursor box)

- Docker Engine + Docker Compose v2
- ~1 GB free RAM, port `5678` free
- This deliverable folder copied or cloned onto that machine

**Cursor box note (2026-11-08):** `docker` is **not** installed on the shared agent box. Live `docker compose up` was **not** run here. Runtime proof is Jack-side (or a later machine with Docker). Artifacts remain complete.

### 3.2 Bring-up

```bash
cd /path/to/hm-pf-49-n8n-spike-2026-11-08
cp .env.example .env
openssl rand -hex 32   # paste into N8N_ENCRYPTION_KEY=
mkdir -p local-files
docker compose up -d
# wait ~30s
open http://localhost:5678
```

**URL:** `http://localhost:5678` (default; override via `.env`)

**Auth:** First visit creates the **owner** account (email + password). Store in vault; do not commit. Community user management is fine for one operator.

**Backup volume:** named Docker volume `hm_pf49_n8n_data` → container `/home/node/.n8n` (SQLite DB, encryption key material, workflow store).

```bash
# Backup
docker run --rm -v hm_pf49_n8n_data:/data -v "$PWD:/backup" alpine \
  tar czf /backup/n8n-data-backup-$(date +%Y%m%d).tgz -C /data .
# Restore (stop n8n first)
docker compose stop
docker run --rm -v hm_pf49_n8n_data:/data -v "$PWD:/backup" alpine \
  tar xzf /backup/n8n-data-backup-YYYYMMDD.tgz -C /data
docker compose up -d
```

**Stop / tear down (keep data):** `docker compose stop`  
**Destroy container, keep volume:** `docker compose down`  
**Nuclear (lose workflows):** `docker compose down -v` — avoid unless intentional.

### 3.3 Import the workflow

1. UI → **Workflows** → menu → **Import from File**
2. Select `workflows/hm-product-flow-1-10.json`
3. Confirm sticky CONTRACT note is visible
4. Confirm **S10 Voice HOLD — disabled** shows disabled (grey)
5. Do **not** Activate until placeholder HTTP stubs are understood (they `neverError` / continue, but still POST to `placeholder.local`)

### 3.4 Optional production HTTPS

For LAN/remote access later, follow n8n docs Traefik compose (`docs.n8n.io` → Hosting → Docker Compose) with subdomain + Let's Encrypt. Spike does **not** require Traefik. Set `N8N_PROTOCOL=https`, `WEBHOOK_URL`, and `N8N_EDITOR_BASE_URL` to the public URL so Wait resume form links work off-machine.

## 4. License note (internal use)

n8n Community is under the **Sustainable Use License**:

- ✅ Fine for Jack's **internal** HTML Motion desk / solo operator use
- ❌ Not for multi-tenant white-label hosting of n8n as a product for external editors without a commercial path

This spike assumes internal desk use only.

Sources: https://docs.n8n.io/n8n-community-license · https://n8n.io/pricing/

## 5. Workflow model (what the JSON contains)

For each of steps **1..9**:

1. **Set** — step id/label + HM UI instruction + `show_id`
2. **HTTP Request stub** — `POST https://placeholder.local/skills/...` with `neverError` / continue; body marks `assist_stub`; **no compose API**
3. **Gate prep Set** — packs `resumeFormUrl` / `resumeUrl` hints + Slack notify template string (for HM-PF-53; no live Slack in this spike)
4. **Wait (On Form Submitted)** — dropdown **Approve | Rework** + Notes + optional `show_id`
5. **IF Approve?** — true → next step; false (Rework) → loop back to this step's Set

After step **9 Approve** → **End** (`COMPLETE_THROUGH_STEP_9`, `step_10=SKIPPED_HOLD`).

Step **10** = disabled Set + sticky HOLD note; **not wired** into the live path.

Locked Jack order (DiagramTool SoT mirror):

1. Character creation  
2. Story  
3. Rhythm  
4. Scene cam-shot design  
5. Per-scene cam shots  
6. Sprite gen  
7. Background scene  
8. Foreground  
9. HTML Motion cam-shot compose  
10. Voice (**HOLD**)

## 6. DiagramTool boards vs n8n SoT split — mitigation

**Blast risk:** boards (design) and n8n (runtime) drift if both claim 1..10 independently.

**Mitigation (spike encodes; HM-PF-50 hardens as contract page):**

1. **Single ordered list pin:** the 1..10 labels in the workflow sticky + this plan match `workflow.board.json` / `docs/product-flow/` tip `970c1f9b`.
2. **Boards remain design SoT.** n8n is control runtime. Do not reverse (do not redesign product order only inside n8n without updating boards/docs).
3. **Change protocol:** any step rename/reorder → update (a) DiagramTool `workflow.dsl`/`workflow.board.json`, (b) kit `docs/product-flow/`, (c) this n8n export — same PR/story window when possible.
4. **Version stamp:** workflow `versionId: hm-pf-49-2026-11-08` + tip SHA cited in sticky.
5. **HM-PF-50** publishes the Owns / Must-not-own one-pager so bots cannot invent a second SoT via n8n.

## 7. Plugin `73065872` (Cursor catalog)

- **Available** in catalog; **not installed** by this spike.
- **Not product code.**
- Install **only after** this written spike plan is reviewed and parent/Jack want the connector.
- Documented command for parent (do not run in this story unless parent explicitly asks post-review):

```text
# Parent / Jack after plan review — catalog plugin id 73065872 (n8n)
# Use Cursor plugin install UI / SearchPlugins → GetPlugin → install flow.
# Do NOT treat the plugin as HM product code or compose backend.
```

Prefer leave install for parent after plan review (per story musts).

## 8. What this spike deliberately does NOT do

- No live Slack notify (HM-PF-53)
- No real skill HTTP endpoints
- No compose / save / upload API
- No enable of step 10 Voice/#41
- No plugin install
- No canvas/product code changes in fight-motion-kit
- No Docker bring-up on Cursor box (no docker binary)

## 9. Validation checklist (Jack)

- [ ] `docker compose up -d` healthy; UI at configured URL
- [ ] Owner account created; encryption key persisted in `.env` + volume
- [ ] Workflow imported; 9 Wait forms present; S10 disabled
- [ ] Manual Trigger → S1 → form → Approve advances; Rework loops
- [ ] HTTP stubs do not point at any HM compose backend
- [ ] Sticky contract readable on canvas
- [ ] Volume backup command dry-run once

## 10. Unlocks after READY

| Next | Why |
|------|-----|
| **HM-PF-50** | Dual-path contract page (Cursor) |
| **HM-PF-09** (Codex-09) | Jack GO gate surface for storyboards (depends on this Wait contract) |
| **HM-PF-53** | Antigravity notify bridge Slack/form with HM deep-link (depends on 49 + 09) |

Cap ≤3 HM SIGNED builds/weekday still applies to subsequent launches.

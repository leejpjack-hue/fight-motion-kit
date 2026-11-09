# HM-PF-49 on a Cursor Cloud Agent

Community n8n for product-flow steps 1..10 Wait/Approve gates. n8n is control and gates only. The HTML Motion frontend shows and edits artifacts. This pack does not add a compose API. Step 10 Voice/#41 stays a disabled HOLD and is not on the live path. Catalog plugin `73065872` is not installed.

The signed spike files in this directory are unchanged (`SPIKE-PLAN.md`, `docker-compose.yml`, `.env.example`, `workflows/hm-product-flow-1-10.json`, `GATE-UX.md`, `HANDOFF.json`, `validation-receipt.json`). `HANDOFF.json` still records `BLOCKED_RUNTIME` from 2026-11-08, when the shared agent box had no Docker. This note is the Cloud Agent path that unblocks that smoke.

## What is in git vs this machine only

| In the repo | This machine only (never commit) |
|---|---|
| Spike pack, `.cursor/Dockerfile`, `.cursor/environment.json`, `.cursor/start-n8n.sh` | `ops/n8n/.env` |
| `.env.example` placeholder | Docker volume `hm_pf49_n8n_data` |
| | Owner email and password created on first login |

`N8N_ENCRYPTION_KEY` has to stay stable for the life of the volume. Losing it bricks credentials stored in that volume. Generate it with `openssl rand -hex 32`. Later, put the same value in Cursor Secrets as `N8N_ENCRYPTION_KEY`. The start script copies `.env.example` to `.env` only when `.env` is absent and that secret is set. It does not rotate a key that is already on disk.

## How start is wired

`.cursor/environment.json` `start` runs `bash .cursor/start-n8n.sh`. That script runs `sudo service docker start`, then `docker compose up -d` in this directory, then waits for `http://127.0.0.1:5678/healthz`. n8n is not in `install`.

This personal environment was created from a snapshot (`environmentJsonPath` unset). A committed `environment.json` applies only after the environment's config location points at `.cursor/environment.json`. Merging the PR does not by itself switch the saved environment, and it does not make this session a permanent host. Agent VMs go away. Always-on hosting (a machine that keeps the volume, a stable URL, Traefik or similar) is still a later decision. The spike does not add that infra.

The Dockerfile is the nested-Docker base (Ubuntu 24.04, Docker Engine 29.9.3, Compose plugin, `fuse-overlayfs`, `iptables-legacy`, Node 22 for `npm test`). Adopting it replaces the previous snapshot. `npm install` in `install` restores the kit dependency (Playwright). Browser binaries for `npm run test:browser` are a separate `npx playwright install` and are not part of this spike.

## Jack: open the test UI (this agent)

This spike's smoke URL is the forwarded port on **this** Cloud Agent, not a public product host.

1. Open this agent in the Cursor Agents Window.
2. Open **Forwarded Ports**.
3. Forward port **5678** (n8n). After the environment records `.cursor/environment.json`, the port is named `n8n` in that file. On a session that has not adopted the file yet, add **5678** by hand.
4. Choose **Open**. That is the smoke URL.

First visit asks for the owner account (email + password). Keep that in a vault. Do not commit it. Import is already done when the start-up evidence says the workflow was imported; otherwise use **Workflows → Import from File** and pick `workflows/hm-product-flow-1-10.json`.

Then check:

- Sticky **CONTRACT** is visible.
- **S10 Voice HOLD — disabled** is greyed out.
- That node is not connected. The live path ends at **End — pipeline complete (step 10 skipped HOLD)** after step 9 Approve.
- Do not activate the workflow while HTTP stubs still POST to `placeholder.local`.
- Do not enable step 10.

Stop without deleting the volume: `docker compose stop` from this directory. `docker compose down -v` deletes workflows and the encryption-key data. Avoid that unless you mean to.

## Optional quick tunnel

A temporary `cloudflared` quick tunnel can expose this same port without new product infra:

```bash
cloudflared tunnel --url http://127.0.0.1:5678 --no-autoupdate
```

The `trycloudflare.com` URL dies with the process and with the VM. It is not an always-on host. Prefer Forwarded Port 5678. Do not put the tunnel token or the owner password in git.

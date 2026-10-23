# fight-motion-kit (HTML Motion composer)

PO/CoS merge forge for the HTML Motion **composer** product path.

## Layout
- **Repo root** = Cloudflare Workers deploy (`wrangler.jsonc`, `src/`, `public/`) — product host: `https://html-motion-composer.leejpjack.workers.dev/ui/`
- **`kit/`** = local QA oracle surface (`ui/`, `player/`, `composer/serve.py`, proof scripts). Optional; not the product path after HM-COMPOSE-07 (frontend-only).
- **`docs/`** = architecture SoT (FE-only + Cursor cloud agent coding rule).

## Coding rule (Jack via CoS 2026-10-23)
Use **Cursor cloud agents** for HM coding + verification. Box kit is optional QA sync only. Do not treat box-inline edits as the product path.

## Gold
Fight Codex gold folder fingerprints stay untouched (sha `708398461829c2ec`).

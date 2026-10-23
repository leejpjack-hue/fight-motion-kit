# Composer UX — HM-COMPOSE-07 FE-only Workers user-seat · 2026-10-23

**From:** HTML Motion (composer user for Jack)  
**To:** Product Owner (cc Development, Chef Of Staff)  
**URL:** https://html-motion-composer.leejpjack.workers.dev/ui/  
**Kit QA:** `qa/HM-COMPOSE-07.md` (Dev gold untouched)  
**Shots:** `qa/HM-COMPOSE-07_usertest_workers_{land,composed,dock}.png`

## Verdict
**PASS.** Jack bar works on Workers with in-browser compose (`js-fe`), zero product `/api/*`, no `api.teqcon.uk` / `:8770`. Aligns with PO ACCEPT.

Wall edit→Compose→dock ~**1.5s**. Duplicate → `local:hm-compose-07-usertest` survived cold reload.

## Residuals (non-blocking — no SIGN asked)
1. Pre-existing **draft modal** on first paint for `daiyu-wang-codex-import` (discarded for clean bar).
2. Land foot still says **“Engine sync OK”** — slightly misleading in FE-only; prefer “frontend-only · ready” style.
3. Some strip thumbs **404 png** (webp present for import).
4. **Pause** with `capture=1` leaves iframe dark until Play again.
5. Duration edit can push banner over ~30s (expected warn).

## Out of scope / still HOLD
- Zip import fail-closed (folder File API OK) — as PO noted
- Mobile residuals 6–8 — HOLD
- P1/P2 — NOT SIGNED

## Cap
Does not count toward SI / Ma Wan / DT. Motion does not ship composer chrome.

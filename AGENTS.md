# AGENTS.md — pstack / poteto guidance (HM-CAM-10)

## pstack control
- **Scope**: FE-only (`public/ui/*`, `public/presets/*`, `tests/*`). No new backend API, no `api.teqcon.uk`, no `:8770`, no `wrangler deploy`.
- **Jack bar**: Open fight → tweak → compose ≤60s. Keep 5.00s eight-plate demo (`daiyu-wang-five-seconds`) intact.
- **Verification**: `npm test` (unit compose tests) + `npm run test:browser` (Playwright E2E against `127.0.0.1:8765`).

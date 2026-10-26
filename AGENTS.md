# AGENTS.md — pstack / poteto guidance (HM-CAM-10 / HM-FX-LOC-SIZE)

## pstack control
- **Scope**: FE-only (`public/ui/*`, `public/presets/*`, `kit/presets/*`, `kit/schema/*`, `tests/*`). No new backend API, no `api.teqcon.uk`, no `:8770`, no `wrangler deploy`.
- **Jack bar**: Open fight → tweak → compose ≤60s. Keep 5.00s eight-plate demo (`daiyu-wang-five-seconds`) intact.
- **poteto-mode**: Smallest diff extending existing parametric hooks; no photo fire/light/dust/pink-slash overlays; no multi-select chip rewrite; draft PR only (never self-merge).
- **Verification**: `npm test` (unit compose tests) + `npm run test:browser` (Playwright E2E against `127.0.0.1:8765`).


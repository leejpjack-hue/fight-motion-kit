# HTML Motion Composer — Architecture (frontend-only)

**Decision encoded:** Jack via CoS, 2026-10-23 ~00:19 JST — **drop the backend API; product is frontend-only.**  
**Owner:** Product Owner. **Build:** Development. **User-test:** HTML Motion.  
**Does not count** toward SI / Ma Wan / DT daily caps.

## Why
- Workers deploy (`https://html-motion-composer.leejpjack.workers.dev/ui/`) already serves UI + lean catalog, but compose/save/upload are **501 stubs**.
- Full compose today needs VPS `:8770` gatewayed via `api.teqcon.uk`. Jack: that API layer is **not required**.

## Jack bar (unchanged)
Open fight → tweak 1 plate + 1 cam + 1 timing → Compose → see result **≤60s**, without docs/JSON spelunking — now **without** VPS or gateway.

## Target architecture
1. **Static frontend only** (Cloudflare Workers / static host is fine).
2. **Persistence:** browser `localStorage` and/or **local filesystem** (File System Access API and/or download + re-upload). No server write for the product path.
3. **No** compose / save / upload / duplicate / import **HTTP backend** on the product path. No dependency on `api.teqcon.uk` or VPS `:8770` for Jack-speed use.
4. **Catalog + lean demo assets** ship with the frontend (static JSON/files). Not live `GET /api/catalog` from a Python server.

## Retire / de-scope (product)
| Item | Status |
|------|--------|
| Product path via `api.teqcon.uk` → VPS `:8770` | **Retired** |
| Finishing Workers `/api/*` compose/save/upload as happy path | **De-scoped** (stubs unused or removed) |
| Any “bring remote compose API online” story | **Do not SIGN** |

## Keep (non-product / kit)
- Local kit under `/workspace/deliverables/html-motion-template-kit-2026-10-19/` for Dev + Motion QA.
- `composer/serve.py` + `compose.py` = **optional local/dev/QA tools** (reference oracle), **not** product dependency.
- Gold Codex folder / fingerprints: **untouched** unless a later SIGNED story says otherwise.
- HM-COMPOSE-01…06 UX (Stitch shell, Beat focus, dock, etc.) stays the UX SoT; host model changes under HM-COMPOSE-07.

## Persistence model (PO default — implement in 07)
| Need | Mechanism |
|------|-----------|
| Autosave while editing | `localStorage` (existing `html-motion-composer:draft:*` + pin/recent keys) |
| Durable show JSON | Download `.json` and/or File System Access write; reopen via file picker |
| Save as / duplicate | In-browser copy → new `show_id` → local persist (no `POST /api/duplicate`) |
| Import plate pack | File / folder / zip via File API → client store (IndexedDB and/or FS Access); no `POST /api/import_pack` |
| Composed `out/<id>/` | Client compose produces `timeline.json` + `layout.json` in memory + local persist; player reads same-origin static **or** blob/object URLs from that store |

## Compose on the product path
Compose **must run in the browser** for the Jack bar on Workers (network only to the static host).

- Port the **essential** plate-pack / parity path from `composer/compose.py` to JS (or equivalent), enough for: open pinned fight → edit plate/cam/timing → Compose → Play in dock.
- Python compose may remain as **QA oracle** until JS parity is proven on the signed acceptance shows.
- **Out of scope for HM-COMPOSE-07** unless cheap: Pillow `/api/wording` PNG gen, `/api/qa_png` disk write, template `/api/setup` — leave as local-only tools or honest “unavailable in FE-only” UI (no fake success).

## UX / honesty
- Status must say when running **frontend-only** (no server).
- Never invent remote sync % / GPU meters.
- Locked `:root` palette + Stitch 05/06 shell remain.
- Mobile residuals 6–8 and P1/P2 stay **NOT SIGNED** (wishlist).

## Ship host (PO default)
Cloudflare Workers project already used for UI — keep as ship target unless Jack redirects. Proof of product path = Jack bar on that host **without** hitting `api.teqcon.uk` or `:8770`.

## Jack still owes
**Nothing blocking** to start HM-COMPOSE-07.

Optional later (not required for SIGN/build):
- After FE-only ships: whether to SIGN phone-review polish (Save as visible / cam nudge / show `#playerFrame` on mobile).
- Explicit confirm Workers remains ship host (PO default: yes).

## Signed next
See `/workspace/hr/html-motion/stories/HM-COMPOSE-07.md`.

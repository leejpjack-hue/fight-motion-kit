# FE-only forge boundary checklist

**Story:** HM-PF-52 (SIGNED). Owner is Cursor.
**Date:** 8 Nov 2026 (Asia/Tokyo)
**Landing:** [`PRODUCT-FLOW.md`](PRODUCT-FLOW.md)

Cap briefs use this page to pick the repo before a SIGN. Composer and show work lands on fight-motion-kit. Wave 1 FX vendor authorship lands on pixelfx.

This file is a kit design doc. It does not change the composer, edit `public/vendor/pixelfx/`, install n8n, or define a compose API.

## Pick the repo

| SIGN is about | Lands on | Access |
|---|---|---|
| HTML Motion composer, show, `.motion.json`, HF stories, product-flow docs, compose UI | [`leejpjack-hue/fight-motion-kit`](https://github.com/leejpjack-hue/fight-motion-kit) | Product home. This repository. |
| Wave 1 FX vendor authorship (HM-LANDING-WIRE / IMPACT-WAVE1 class) | [`leejpjack-hue/pixelfx`](https://github.com/leejpjack-hue/pixelfx) | Writable build fork. Open the coding PR here. |
| Same FX, upstream library | [`patch-gg/pixelfx`](https://github.com/patch-gg/pixelfx) | App pull-only. Pull from here. Coding PRs stay on the build fork. |
| Consumed Wave 1 copy already on the kit | `public/vendor/pixelfx/` in fight-motion-kit | Mirror only. Author on the pixelfx build fork, then vendor. |

`public/vendor/pixelfx/SOURCE.txt` records the consumed copy: pixelfx `679844a6e45b7dbdc4b3d1f76f2dd0fdcc2bc892` from `leejpjack-hue/pixelfx`, Wave 1 only. The architecture companion notes pin the same fork SHA ([`companion-notes.md`](companion-notes.md)). New FX authorship still goes to the pixelfx forge. The mirror is the copy the kit serves.

## Anti-spec (product path)

The product path is frontend-only. See [`docs/FRONTEND-ONLY-2026-10-23.md`](../FRONTEND-ONLY-2026-10-23.md). The Cursor architecture lane on [`architecture.board.json`](architecture.board.json) owns that contract: Workers UI, IndexedDB, and portable `.motion.json` ([`companion-notes.md`](companion-notes.md)).

Allowed on the product path:

- Cloudflare Workers, or another static host, serving the UI and the lean catalog.
- Browser IndexedDB and portable `.motion.json`.
- Compose in the browser. Network only to the static host.

Out of the product path:

- `api.teqcon.uk`
- VPS `:8770`
- Workers compose / save / upload / duplicate / import HTTP (`/api/*` as the happy path)

[`DUAL-PATH-CONTRACT.md`](DUAL-PATH-CONTRACT.md) keeps the same line for n8n: gates and control only. n8n has no compose or save callback. Local `composer/serve.py` and `compose.py` stay an optional QA oracle, not a product dependency.

## Locked on 1 Nov 2026

Jack (t765u / t766u), 1 Nov 2026 ~18:08 JST, set the urgent HTML Motion forge to `https://github.com/patch-gg/pixelfx.git`. Upstream is public and App pull-only. The writable build fork is `leejpjack-hue/pixelfx`. That lock covers HM-LANDING-WIRE and IMPACT-WAVE1 class FX work. The same decision says pixelfx is not the FE composer kit, and historical composer ships stay on fight-motion-kit.

HM-PF-52 is the checklist Cap uses after that lock. Composer, show, `.motion.json`, HF stories, product-flow docs, and the compose UI stay on fight-motion-kit. Wave 1 FX vendor authorship uses the pixelfx build fork, then the kit mirror.

Source note: `/workspace/hr/logs/po-hm-pixelfx-forge-2026-11-01.md`. The Cursor cloud-agent coding path stays [`docs/CODING-CURSOR-AGENT-2026-10-23.md`](../CODING-CURSOR-AGENT-2026-10-23.md). The repo pick for a SIGN is this page.

## Constraints that stay in force

Same limits as [`PRODUCT-FLOW.md`](PRODUCT-FLOW.md#constraints-that-stay-in-force) and [`DUAL-PATH-CONTRACT.md`](DUAL-PATH-CONTRACT.md#constraints-that-stay-in-force).

- **FE-only.** Workers UI, IndexedDB, and `.motion.json`.
- **Cap.** At most 3 SIGNED HTML Motion stories per weekday.
- **Voice / #41.** HOLD. This checklist does not SIGN SFX or audio.
- **n8n.** Gates and control only. It sequences steps and pauses. It does not generate the show.
- **Jack bar.** Open a fight, tweak, and compose within 60 seconds. The 5.00s eight-plate demo (`daiyu-wang-five-seconds`) stays intact.

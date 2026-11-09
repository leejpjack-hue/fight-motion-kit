# HM-PF-29 proof. Market spritegen film as import proof show

**Status:** BLOCKED_RUNTIME for pack bytes. The step 6 receipt is on the Workers UI.
**Issue:** #106
**Show id:** `fight-baijia-elfmage-market-spritegen-2026-11-06`

The exact head SHA is the tip of this branch at push time and is recorded in the pull request body.

## What landed

| Artifact | Path |
|---|---|
| Receipt model | `HMMarketSpritegenProof.assess` in `public/ui/market-spritegen-proof.js` |
| Receipt the UI fetches | `public/shows/market-spritegen-proof.json` |
| Composer entry | **Step 6 market spritegen proof** and `#marketSpritegenDialog` |
| Product-flow page | `public/product-flow.html` step 6 section |
| How-to | `docs/product-flow/HM-PF-29-market-spritegen-proof.md` |

## Musts

1. Show and assets from market-spritegen load via the local handoff. **Blocked.** The File API handoff is the existing **Import pending strip · PNG + JSON** control. No pack bytes are in the repo, so nothing from that pack is staged.
2. Bake and demo on the Workers UI, frontend only. **The demo is the receipt.** Export still bakes the open project. That project stays `daiyu-wang-five-seconds` because the market film is not loaded.
3. Documented as the step 6 proof film. **Yes.** `/product-flow.html` and `docs/product-flow/HM-PF-29-market-spritegen-proof.md`.
4. No provider calls during the demo. **Yes.** The proof script fetches only `/shows/market-spritegen-proof.json`.

## Missing paths

`/workspace` on this machine is the kit checkout. These paths are absent.

- `/workspace/deliverables/fight-baijia-elfmage-market-spritegen-2026-11-06`
- `/workspace/deliverables/fight-baijia-elfmage-market-spritegen-2026-11-06/BUILD_STATUS.md`
- `/workspace/deliverables/fight-baijia-elfmage-market-spritegen-2026-11-06/assets`
- `/workspace/deliverables/fight-baijia-elfmage-market-spritegen-2026-11-06/*.motion.json` (name unresolved)
- `/workspace/deliverables/fight-baijia-elfmage-market-spritegen-2026-11-06/html` (name unresolved)

No plates were invented to fill those paths.

## Holds

HM-PF-27, HM-PF-28, HM-PF-47, HM-PF-48, #41, SG-01 playback, and voice are unchanged. The strip dialog still says pending and not playable.

## Tests

`node --test tests/hm-pf-29-market-spritegen.test.cjs` passed 4.

`npm test` passed 152.

`TEST_BASE_URL=http://127.0.0.1:8765 node tests/hm-pf-29-browser.cjs` passed. The dialog shows `BLOCKED_RUNTIME`, pane A stays `daiyu-wang-five-seconds`, the strip dialog stays not playable, and every request stayed on `127.0.0.1:8765`.

`npm run test:browser` passed, including zero uncaught browser errors.

Base after fetch is `387b7ee44f896e0db5f9d4a6242efc76c35cc4b8`. The requested pin `452b9d65dc8589bb3ede4328d22ef606599fa8c4` is the parent of that tip (`HM-PF-04`). This branch starts at the fetched tip.

# HM-PF-29 STATUS

- **BLOCKED_RUNTIME** for the market film bytes. The pack `fight-baijia-elfmage-market-spritegen-2026-11-06` is not in this checkout and not at `/workspace/deliverables/fight-baijia-elfmage-market-spritegen-2026-11-06`.
- **FE proof is in the composer.** `/ui/?show=fight-baijia-elfmage-market-spritegen-2026-11-06` shows the receipt, keeps the 5.00s demo, and does not call a provider.
- **Holds left alone.** HM-PF-27, HM-PF-28, HM-PF-47, HM-PF-48, #41, SG-01 playback, voice.
- **Local offline FE handoff bundle (#106):** `public/shows/fight-baijia-elfmage-market-spritegen-handoff.json` loads 8 embedded PNG plates (`5.00s`, 0 provider calls) from `#marketSpritegenLoadLocal` and composes/exports offline while keeping `market-spritegen-proof.json` `BLOCKED_RUNTIME` when `/workspace/deliverables/fight-baijia-elfmage-market-spritegen-2026-11-06` is absent.

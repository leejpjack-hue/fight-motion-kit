# Open the step 6 market spritegen proof

The market spritegen pack is the step 6 proof film for outside sprite-gen into the HTML Motion composer. This checkout does not contain that pack. The composer shows `BLOCKED_RUNTIME` and leaves the 5.00s eight-plate demo open.

Show id: `fight-baijia-elfmage-market-spritegen-2026-11-06`.

## Open the proof

1. Open `/ui/?show=fight-baijia-elfmage-market-spritegen-2026-11-06`, or click **Step 6 market spritegen proof** in the plate library.
2. Read the status line. `BLOCKED_RUNTIME` means the pack directory is not on this disk.
3. Leave the 5.00s demo in place. Do not draw stand-in plates.

The same receipt is on `/product-flow.html` under **Step 6 proof film**. The receipt file is `/shows/market-spritegen-proof.json`.

## Missing paths

The receipt names these paths, and this disk does not have them.

- `/workspace/deliverables/fight-baijia-elfmage-market-spritegen-2026-11-06`
- `/workspace/deliverables/fight-baijia-elfmage-market-spritegen-2026-11-06/BUILD_STATUS.md`
- `/workspace/deliverables/fight-baijia-elfmage-market-spritegen-2026-11-06/assets`

`*.motion.json` and `html` sit inside that directory. Their file names stay unresolved until the directory exists. On this machine `/workspace` is the kit checkout, so `deliverables/` is not a separate pack tree.

## Import when the pack is on disk

1. Click **Open strip import**. That opens **Import pending strip · PNG + JSON**.
2. Choose the pack PNG and the pack JSON. The page reads them with the File API. It does not call a provider.
3. Read the strip QA panel, then click **Save pending strip**. The strip stays pending and not playable.
4. Click **Export**, then **Playable HTML**. The browser builds that file from the open project.

Export bakes the open project. While the pack is missing, the open project is the 5.00s demo, not the market film.

## What this proof does not do

It does not generate sprites, call a provider, add voice, or lift SG-01 playback. HM-PF-27, HM-PF-28, HM-PF-47, HM-PF-48, and #41 stay on hold.

## Local portable handoff bundle (`#106`)

When the external `/workspace/deliverables/fight-baijia-elfmage-market-spritegen-2026-11-06` folder is absent from disk, `market-spritegen-proof.json` continues to report `BLOCKED_RUNTIME` honestly without calling any provider. To exercise the full 8-plate **Baijia × Elfmage** proof sequence offline in the FE composer:

- **Offline bundle**: `public/shows/fight-baijia-elfmage-market-spritegen-handoff.json` (`8` embedded PNG plates, `5.00s`, `0` provider calls, `art_invented: false`).
- **UI button**: Inside `#marketSpritegenDialog` ("Market proof"), click **Load local proof bundle (8 plates)** (`#marketSpritegenLoadLocal`) to load the show into `HMStudio`, compose in-browser, and export playable HTML offline.
- **Generator / validator**: `node skills/hm-spritegen-handoff/market-proof-handoff.cjs --check`

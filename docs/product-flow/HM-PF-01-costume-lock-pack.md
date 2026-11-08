# HM-PF-01 — Dual-cast costume lock pack opens in composer

**Issue:** `#83` · **Step:** `1 Character creation` · **Scope:** FE-only (`public/ui/*`, `public/presets/*`, `kit/presets/*`, `kit/schema/*`, `tests/*`). No `GenerateImage` call from FE, no backend compose API, and offline of `api.teqcon.uk` / `:8770`.

## What Jack sees

1. **One-click sample or file import (no JSON spelunking)**:
   - Click **Open dual-cast costume lock** (`#loadCostumeLock`, or open `/ui/?show=daiyu-wang-costume-lock`) to load [`costume_lock_dual_cast.json`](../../public/presets/costume_lock_dual_cast.json) directly as an editable plate pack.
   - Or click **Open project** (`#openProject` / `#projectInput`) and select a `costume_lock` JSON emitted by `hm-character-lock` together with companion `.png`/`.jpg`/`.webp` sheets, earlier approved `cast.{L,R}.lock_refs`, and optional pose refs. [HM-PF-03](HM-PF-03-costume-drift.md) now requires a named human drift review before a fresh standalone pack replaces the current project. Missing references and rejected reviews block import visibly.
2. **Locked costume IDs visible for both cast members**:
   - In the Clip Settings **Characters** panel (`#charHonesty`), `#charNameL` and `#charNameR` show cast names while `#charLockL` and `#charLockR` show the locked `costume_id` badges for screen-left (`L`) and screen-right (`R`), plus sheet/pose-ref counts (`#charLockMeta`).
   - Existing shows without costume locks keep `#charLockRowL`, `#charLockRowR`, and `#charLockMeta` hidden with zero visual or DOM text regression.
3. **Plate swap preserves lock IDs with zero generation calls**:
   - All costume sheets (`role: "sheet"`) and pose refs (`role: "pose_ref"`) load into the plate library (`project.media` and `project.layouts`).
   - Swapping a clip's plate via **Show picker** / **⇄ Replace plate** (or `HMMotionSot.applyCharacterPlate`) updates only `atom.hero` while keeping `show.chars.{L,R}` and `show.costume_lock` intact, firing zero `GenerateImage` or external network requests.

## Dual-cast `costume_lock` pack contract

[`HMComposeClient.normalizeCostumeLockPack(input, opts)`](../../public/ui/costume-lock.js) normalizes a dual-cast lock pack synchronously into a portable `.motion.json` project (`{ version: 1, show, layouts, media, assets }`):

```json
{
  "kind": "costume_lock",
  "version": 1,
  "pack_id": "daiyu-wang-costume-lock",
  "title": "Daiyu vs Wang · Dual-cast costume lock",
  "venue": "street",
  "cast": {
    "L": {
      "name": "Lin Daiyu",
      "costume_id": "daiyu_celadon_tank_v1",
      "lock_refs": [{ "label": "Earlier Daiyu lock reference", "src": "assets/daiyu-wang-eight/P01.png" }],
      "sheets": [{ "id": "L_SHEET_01", "label": "Daiyu · celadon tank sheet", "src": "assets/daiyu-wang-continuation/P09.png" }],
      "pose_refs": [{ "id": "L_POSE_01", "label": "Opening guard · L ref", "src": "assets/daiyu-wang-eight/P01.png", "duration_s": 0.625 }]
    },
    "R": {
      "name": "Wang Xifeng",
      "costume_id": "wang_crimson_jacket_v1",
      "lock_refs": [{ "label": "Earlier Wang lock reference", "src": "assets/daiyu-wang-eight/P02.png" }],
      "sheets": [{ "id": "R_SHEET_01", "label": "Wang · crimson jacket sheet", "src": "assets/daiyu-wang-continuation/P10.png" }],
      "pose_refs": [{ "id": "R_POSE_01", "label": "Slip & press · R ref", "src": "assets/daiyu-wang-eight/P02.png", "duration_s": 0.625 }]
    }
  }
}
```

- **Dual-cast requirement**: Both `L` and `R` must resolve a non-empty locked `costume_id` (`costume_id`, `lock_id`, or `costume_lock`).
- **Offline safety**: Nonlocal URLs (`http://`, `https://`, `//`, `..`, `\`) are rejected fail-closed in both `HMComposeClient.normalizeCostumeLockPack` and `app.js` `validate()`.
- **SoT & Gate round-trip**: [`motion-sot.js`](../../public/ui/motion-sot.js) includes `costume_lock` / `lock_pack` in `fingerprint()` when present and normalizes standalone lock packs in `asPortableProject()`. PF-09 Rework (`HMProductFlowGate.applyRework`) and `.motion.json` save/reopen preserve both cast lock IDs unchanged.

## Verification

- Unit: `node --test tests/hm-pf-01-costume-lock.test.cjs` (included in `npm test`)
- Browser E2E: `node tests/hm-pf-01-costume-lock.browser.cjs`

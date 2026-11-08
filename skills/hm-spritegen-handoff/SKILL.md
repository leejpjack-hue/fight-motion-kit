---
name: hm-spritegen-handoff
description: Hand off externally generated body strips (sprite-gen .strip.png + .strip.json) into the fight-motion-kit HTML Motion composer. Covers opening the SG-01 staged strip dialog, reviewing the strip QA panel (frames, delay_ms, body_h, loop policy, timing source, warnings), and saving the pending strip. Use when importing or QA-checking a local strip pair; the strip stays PENDING and NOT PLAYABLE until SG-02. Not for generating sprites, running RIFE, importing root-motion strips, or any playback/timeline work on the strip.
---

# hm-spritegen-handoff

Move a finished body strip from the external sprite-gen CLI into HTML Motion without ever generating, retiming, or playing it inside HM. The whole path is browser-local: File API staging, a QA panel Jack can scan, then a durable save of the original bytes.

## Flow (SG-01, shipped; playback is SG-02 and NOT shipped)

```
external sprite-gen CLI (outside HM)          HM composer (this repo)
────────────────────────────────────          ──────────────────────────────
.sprite.png + .strip.json  ── local files ──▶ "Import pending strip · PNG + JSON"
                                              (library toolbar, public/ui/index.html)
                                              → strip QA panel review
                                              → "Save pending strip"  ⇒ PENDING, NOT PLAYABLE
```

1. **Produce outside HM.** The external `sprite-gen` CLI generates and assembles the strip pair. HM never invokes it, embeds it, or talks to any provider. Producer source of truth (read-only cite, never execute or vendor from the skill): `aldegad/sprite-gen` pinned at `6a3f4c47d7f8745853cc06fe66b252636976a442` — see its `docs/video-pipeline.md` (`.strip.png` + `.strip.json` with `frames,w,h,body_h,delay_ms,cycle_frames,cycle_seconds`; `body_h` is standing height, not padded jump height) and `sprite_gen/video/loop.py`.
2. **Stage in HM.** Open `/ui/`, click **Import pending strip · PNG + JSON** in the plate-library toolbar, choose exactly one `.png` + one `.json`. `HMStripAdapter.stage` (in `public/ui/project-media.js`) validates byte caps (PNG ≤33554432, JSON ≤262144), PNG structure and dimensions, the fail-closed sidecar whitelist, and SHA256 integrity before anything is staged.
3. **Read the QA panel** (`#stripQaPanel`, inside `#stripDialog`) before saving:
   - Fields: **frames**, **cell delay** (raw `delay_ms` from the sidecar when present, else derived from the cadence timing source), **body_h** (standing reference) with cell h, **loop policy** (`kind · loop · returns · hold-last · end frame`), **timing source** (`fps` / `delay_ms-integer-rate-snap` / `delay_ms-literal`), **strip duration**, and **source rate** when `source_fps` exists.
   - Warnings are labeled by origin: `PRODUCER` (verbatim `warnings` from the sidecar), `ADAPTER` (e.g. subsampled export — retained cells only), `QA` (fps mismatch: export `fps` vs `source_fps`, or `fps` vs the rate implied by `delay_ms`), and `SOURCE REPORT` (safe local provenance snippets such as `subsampled`, `cycle_frames`, `cell_cap`, `body_ref`, `sample_indices` count). No remote URLs are ever synthesized.
   - A malformed pair fails closed: the panel shows the error, the commit button stays disabled, nothing is staged.
4. **Save pending.** "Save pending strip" commits original PNG + JSON bytes plus the normalized descriptor. The strip is **PENDING, NOT PLAYABLE until SG-02**: it cannot be used on the timeline, as a background, or in exports. Reopening a saved project re-validates the original bytes against the same contract.

The panel model itself is pure and unit-testable: `HMStripAdapter.buildStripQaPanel(descriptor, raw?)` → `{fields, warnings, ok}` in `public/ui/project-media.js`. It reports the cadence `secondsPerCell` exactly as normalized; it never retimes a strip.

## Anti-jobs (hard refusals)

- **No RIFE from HM.** Frame interpolation is an external sprite-gen concern; HM does not install, call, or proxy it.
- **No root_motion.** FINAL `once`/`once-return`/`one-shot` sidecars carry `root_motion` and are rejected by SG-01. Do not "fix" them by stripping the field.
- **No SG-02.** No playback, timeline plates, background use, or export composition for a pending strip. Do not ungate `NOT PLAYABLE`.
- **No voice, no generation, no upload.** No provider calls, credentials, or run-session files enter HM.

## Scope and verification

FE-only (`public/ui/*`, `tests/*`). Keep the 5.00s eight-plate demo intact. After touching this path run:

```sh
node --test tests/sg01.test.cjs tests/hm-pf-30-strip-qa.test.cjs   # strip transport + QA panel
npm test                                                            # full unit suite
npm run test:browser                                                # Playwright E2E when a browser is available
```

Context documents: `docs/product-flow/PRODUCT-FLOW.md` and `docs/product-flow/companion-notes.md` (SG-00…SG-04 gates, sprite-gen pin, dual-path contract). SG-00 field-map evidence lives outside the repo at `/workspace/hr/briefs/sprite-gen-html-motion-2026-11-07.md` (read-only cite; may not travel with a checkout).

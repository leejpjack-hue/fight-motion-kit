---
name: hm-spritegen-handoff
description: Hand off externally generated body strips (sprite-gen .strip.png + .strip.json) into the fight-motion-kit HTML Motion composer. Generation stays outside the FE; File API import only. Accepts the strip PNG+JSON pair as the first path and rejects credential and run-session files. Covers the local handoff gate, the SG-01 staged strip dialog, the strip QA panel (frames, delay_ms, body_h, loop policy, timing source, warnings), and saving the pending strip. The strip stays PENDING and NOT PLAYABLE until SG-02. Schema SoT is SG-00 in /workspace/hr/briefs/sprite-gen-html-motion-2026-11-07.md.
---

# hm-spritegen-handoff

Move a finished body strip from the external sprite-gen CLI into HTML Motion. Generation stays outside the FE. Jack imports the pair through the File API. The skill checks the files first, the QA panel is what Jack reads, and the save keeps the original bytes.

## Outside-FE contract (HM-PF-25)

Depends on HM-PF-05 (#87). CoS merges this story only after HM-PF-05 is on `main`. This skill does not write the PF-05 product copy and does not invent Sprite Forge.

1. **Generation stays outside the FE. File API import only.** The external `sprite-gen` CLI produces the strip. HM does not embed that CLI, call a provider, or upload the pair. There is no in-FE Sprite Forge and no in-FE GenerateImage path. The browser reads one local PNG and one local JSON through the existing **Import pending strip · PNG + JSON** picker.
2. **The first path is strip PNG+JSON.** Accept one `.strip.png` and one `.strip.json` (any one local `.png` plus one local `.json` sidecar passes the same gate). That pair is the path Jack imports. Atlas `manifest.json` stays DESIGNED-HOLD (HM-PF-27).
3. **Credential files and run-session files are rejected.** Names such as `credentials.json`, `.env`, `token.json`, `api-key.json`, `session.json`, and `run-session.json` never enter HM. A directory argument is rejected with the run-session class so a run folder is not walked. JSON keys or text carrying `credential`, `password`, `token`, or `session` fail the same way. `root_motion` stays rejected (HM-PF-28).
4. **SG-00 is the schema SoT.** Cite `/workspace/hr/briefs/sprite-gen-html-motion-2026-11-07.md` read-only (HM-SG-00 through HM-SG-04 in that brief). The published surface of the same plan is <https://sprite-gen-html-motion-urak.pages.grok.bot/>. Do not vendor the brief or the sprite-gen server into this kit. `HMStripAdapter` in `public/ui/project-media.js` is the fail-closed subset HM actually imports (sprite-gen pin `6a3f4c47`).

Check a pair before import:

```sh
node skills/hm-spritegen-handoff/handoff.cjs <strip.png> <strip.json>
```

`skills/hm-spritegen-handoff/handoff.cjs` prints `{ ok, path, generation, import }`. Success is `path: "strip-png-json"`, `generation: "outside-fe"`, `import: "file-api"`. Exit 0 accepts that pair. Exit 1 rejects it. The gate does not replace `HMStripAdapter.stage`.

Product note: [`docs/product-flow/HM-PF-25-spritegen-handoff.md`](../../docs/product-flow/HM-PF-25-spritegen-handoff.md).

## Flow (SG-01, shipped; playback is SG-02 and NOT shipped)

```
external sprite-gen CLI (outside the FE)      HM composer (this repo)
────────────────────────────────────          ──────────────────────────────
.strip.png + .strip.json   ── File API ──▶    "Import pending strip · PNG + JSON"
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
- **No voice, no generation, no upload.** Generation stays outside the FE. Credential files and run-session files are rejected. No provider calls enter HM.
- **No Sprite Forge and no vendored sprite-gen server.** File API import only. Atlas and SG-02 playback stay HOLD. Voice / #41 stays HOLD.

## Scope and verification

FE-only (`public/ui/*`, `tests/*`, this skill). Keep the 5.00s eight-plate demo intact. After touching this path run:

```sh
node --test tests/hm-pf-25-spritegen-handoff.test.cjs tests/sg01.test.cjs tests/hm-pf-30-strip-qa.test.cjs
npm test                                                            # full unit suite
npm run test:browser                                                # Playwright E2E when a browser is available
```

`tests/hm-pf-30-browser.cjs` is an optional loopback check of `#stripQaPanel` only. It is not part of `npm test`.

Context documents: [`docs/product-flow/HM-PF-25-spritegen-handoff.md`](../../docs/product-flow/HM-PF-25-spritegen-handoff.md), `docs/product-flow/PRODUCT-FLOW.md`, and `docs/product-flow/companion-notes.md`. Schema SoT is SG-00 in `/workspace/hr/briefs/sprite-gen-html-motion-2026-11-07.md`. That brief lives outside this checkout; cite it read-only and do not vendor it.

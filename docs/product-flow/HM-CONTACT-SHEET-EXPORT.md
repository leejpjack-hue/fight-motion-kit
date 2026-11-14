# HM-CONTACT-SHEET-EXPORT (#38) — Beat +0.3s, Transition & Phone Sheets

Generates fast human-review image sheets directly from any `.motion.json` show or portable project, without video playback or backend APIs.

## Outputs

1. **`sheets/beat-plus-0.3s.png`** (`1280px` wide) — Paired midpoint (`+0.0s`) and `+0.3s` peek panels for every atom, aligned with `HMComposeClient.framePeekPlan`.
2. **`sheets/transition-strips.png`** (`1280px` wide) — Triplet samples (`-0.08s`, `+0.00s`, `+0.08s`) straddling every cut / clip boundary for instant cut QA.
3. **`sheets/phone-360w.png`** (`360px` wide) — Mobile-width vertical strip (`2-up` panels per beat at `width: 360`) readable on a phone without pinching.
4. **`sheets/manifest.json`** — Exact coordinates, panel timestamps, clamped flags, and dimensions.
5. **`beats/*.png` & `transitions/*.png`** (CLI output) — Individual high-clarity beat and cut strips.

## FE Usage

In the composer (`/ui/`), click **↓ Sheets (.zip)** (`#downloadBeatSheets`) in the **Frame peek strip** toolbar. All frames sample via `HMStudio.sampleStageFrameAt` on the shared `renderAt` clock in the browser and download locally as `<show_id>-sheets.zip`.

## Local CLI

```sh
node scripts/contact-sheet-export.cjs public/shows/daiyu-wang-five-seconds.json --out /tmp/daiyu-sheets --assets public
```

- Pure Node (`zlib` PNG encoder/decoder, no `ffmpeg` or external provider calls required).
- Preserves the 5.00s eight-plate demo (`daiyu-wang-five-seconds`).

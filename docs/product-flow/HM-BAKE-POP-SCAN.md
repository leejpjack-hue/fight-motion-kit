# HM-BAKE-POP-SCAN (#40) — Visual Frame Spike / Pop QA Oracle

Detects unauthored single-frame flashes, white-out pops, black-frame drops, and unexpected mid-beat frame spikes on rendered stage frames or exported PNG/MP4 frame sequences while ignoring expected cut boundaries and authored `exposure_warm_crush` / `flash_orange` hooks.

> **Scope honesty**: Visual frame-delta QA only (`scope: "visual-frame-delta-only"`, `audioLufsChecked: false`). Never claims `-14 LUFS` or audio loudness verification.

## Composer UI

In the Export / Bake QA dock (`#bakeQaDock`), click **Frame spike QA** (`#runSpikeScan`). It samples frames across the open project on the shared `renderAt` clock in the browser and prints either `Clean · N frames scanned · 0 unauthored pops` or `POP DETECTED (...)` with timestamps.

## Local CLI

```sh
# Scan extracted PNG frames directory against show cuts/hooks
node scripts/bake-pop-scan.cjs --dir /tmp/frames --fps 30 --show public/shows/daiyu-wang-five-seconds.json

# Scan pre-sampled JSON metrics fixture (exit 0 = clean, exit 2 = pop detected)
node scripts/bake-pop-scan.cjs tests/fixtures/pop-scan-clean.json
node scripts/bake-pop-scan.cjs tests/fixtures/pop-scan-spike.json

# Scan video (requires ffmpeg on PATH; fails loudly with instructions if missing)
node scripts/bake-pop-scan.cjs --video out/fight.mp4 --show show.json
```

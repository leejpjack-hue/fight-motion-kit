# HM-PF-38 proof — FG own-cam vs BG

**Status:** READY · FE-only · depends on HM-PF-36. Replay parent is tip `3790874a3d517a5b6f380547339acd9da51f9e59` (HM-PF-35). This branch does not merge itself.

## Design

HM-COMPOSE-FG already draws three cameras apart: background crop-pan, the clip camera on the plates, and `show.fg.cam` in front of both. This story does not add a compose API. It adds one proof show and one scrub line that samples those three cameras with the functions the player and the export already use.

| Layer | Control on the proof show |
|---|---|
| FG | CLASS-DENSE-FG parallax `0.45`, nudge `0,0,0` |
| BG | Classroom-dense crop `0.15, 0.05, 0.70, 0.90`, `pan_right` `0.70`, show clock |
| Character | The street sample's existing `static_hold` clip cameras |

Classroom bitmaps and the TUNG prop bytes are not in this kit. The proof reuses `assets/daiyu-wang-continuation/rooftop-dusk.png` and `assets/wording/clash_en.png`. The 5.00s demo and the classroom-dense show stay without `show.fg`.

## Musts

1. Open **Open FG cam proof** or `/ui/?show=class-dense-fg-cam`. Scrub. `#fgLayerMatrix` names FG parallax, BG pan_right, and the character preset, and ends in `independent`.
2. Save project and reopen the `.motion.json`. `show.fg.cam`, `show.bg.motion`, and each clip `camera` come back unchanged. A draft reopen does the same.
3. Export HTML inlines `layerCamMatrix` and prints the same line on `#layers` while seeking. Export webm records through `HMMotion` / `sampleStageFrameAt`, which stores that sample in the same render that draws the foreground outside the character transform.
4. Files stay in `public/ui`, `public/shows`, and `tests`. No teqcon, no `:8770`, no compose HTTP.

## Held

No HM-PF-27, HM-PF-28, HM-PF-47, HM-PF-48, #41 SFX, SG-01, voice, or 30a.

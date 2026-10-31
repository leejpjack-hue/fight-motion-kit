# Seekable Preview Contract (`HM-HF-02-SEEKABLE-PREVIEW`)

## Single Source of Truth (SoT): `renderStageAt(t)` / `renderAt(t)`

In HTML Motion Composer, deterministic time-to-pixel resolution (`time → pixels`) is governed by a single shared entry contract:

1. **`renderStageAt(t, opts)`** (`public/ui/app.js` / `window.HMStudio.renderStageAt`)
   - Samples and paints Pane A (`#stage`) at explicit show time `t` (in seconds).
   - Resolves the active atom window `[t0, t1]`, live FX stand-in hooks, onion ghost state, and delegates to `renderer.render(t, { ..., viaSoT: true })`.
2. **`renderStageBAt(t, opts)`** (`public/ui/app.js` / `window.HMStudio.renderStageBAt`)
   - Samples and paints Reference Pane B (`#stageB`) at the same linked show time `t`, resolving Pane B's atom window `[t0B, t1B]` and `rendererB.render(t, { ..., viaSoT: true })`.
3. **`HMStudio.renderAt(t, opts)`** (`public/ui/app.js`)
   - Programmatic and interactive seek entry point.
   - Clamps `t` to `[0, maxScrubDuration()]`, pauses wall-clock transport (unless driven by transport with `{ keepPlaying: true }` or `{ sampleOnly: true }`), updates `time`, and routes both Pane A and Pane B through `renderStageAt(t)` and `renderStageBAt(t)`.
4. **`HMStudio.sampleStageFrameAt(t, opts)`** (`public/ui/app.js`)
   - Bake / export frame-sampling entry point (`exportFrame`, `exportFrames`, `peekCanvasBlob`).
   - Resolves pixels at explicit time `t` through the shared SoT (`viaSoT: true`) without allowing unconstrained wall-clock `requestAnimationFrame` drift.

## Call Sites Using the Shared SoT

| Surface | Entry / Call Site | Resolution Path |
| --- | --- | --- |
| Timeline Scrub (`#scrub`, `#ruler`) | `public/ui/app.js` (`#scrub.oninput`, `#ruler.onclick`) | `HMStudio.renderAt(value)` → `draw()` → `renderStageAt(time)` + `renderStageBAt(time)` |
| A/B Linked Reference (`#stage`, `#stageB`) | `public/ui/app.js` (`draw()`) | `renderStageAt(time)` + `renderStageBAt(time)` + `HMComposeClient.compareAt(result, resultB, time)` |
| Frame Peek Strip & PNG/ZIP (`#framePeekStrip`) | `public/ui/app.js` (`renderFramePeekStrip`, `seekToPeek`, `peekCanvasBlob`) | `renderStageAt(peek.t, { standIn: true, onion })` / `HMStudio.renderAt(peek.t)` |
| Play / Pause Transport (`#play`, `tick(now)`) | `public/ui/app.js` (`tick(now)`) | `tick(now)` advances `nextTime` and calls `renderAt(nextTime, { keepPlaying: true, source: 'transport-play' })` |
| Current Frame & Frame Sequence Bake | `public/ui/exports.js` (`exportFrame`, `exportFrames`) | `S.sampleStageFrameAt(t, { renderer, standIn: false })` → `renderer.render(t, { viaSoT: true, ... })` |
| Standalone / Exported Player | `public/player/player.js`, `public/ui/exports.js` (`standalonePlayer`) | `window.renderAt(t)` → `renderer.render(t, { viaSoT: true })` |

## Soft-Warn Guard for Unconstrained rAF / Wall-Clock Preview Pixels

- **Rule**: Play/Pause may drive the transport clock `t`, and real-time WebM `MediaRecorder` (`exportVideo`) may step frames on a visible tab, but **preview pixel sampling** for scrub, A/B panes, Frame Peek, and deterministic frame bake must resolve through `renderAt(t)` / `renderStageAt(t)` (`opts.viaSoT === true`).
- **Detection**:
  - Calling `renderer.render(t, opts)` on a preview stage without `viaSoT: true` (for example, from an unconstrained `requestAnimationFrame` loop or with a `performance.now()` millisecond timestamp `t > duration + 1` or `opts.unconstrainedRaf === true`) triggers a **soft warning**.
- **Soft-Warn Behavior**:
  - Surfaces a visible composer banner (`#seekPreviewWarnBanner` in `public/ui/index.html`) and records the warning in `HMStudio.seekPreviewContract` (`warns` array) plus `console.warn`.
  - **Does not hard-block** Compose or bake/export (`exportHtml`, `exportFrames`, `exportFrame`, `exportTiming`, `exportVideo` remain available).

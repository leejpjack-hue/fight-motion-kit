# Project and renderer contract

The checkout is the source of truth. This reference describes the canvas editor introduced in PR #3 of `leejpjack-hue/fight-motion-kit`.

## Editable project versus composed output

A portable project is `{version:1, show, layouts, media, assets}`:

- `show`: editable scene specification.
- `layouts`: maps each `hero.layout_source` key to its layout object.
- `media`: `[{id,name,src,layoutSource,plateId}]` for the media library. `src` may be a portable asset key resolved through `assets`.
- `assets`: maps resolved image paths to embedded PNG/JPG/WebP/GIF data URLs. Do not persist ephemeral blob URLs or external URLs.

The actual compose engine is `HMComposeClient.composeShow(show, {cameraPresets,fxPresets,loadJson})`. It returns `{ok,timeline,layout,...}`. On success `HMMotion(canvas,assets).load(result)` preloads assets; `.render(seconds)` produces the frame. The editor exposes `window.ready` and `HMStudio.load(project)`, `.compile()`, `.project`, `.composed`, `.renderAt(t)` for automation. Discover the current API before depending on it.

`duration_target_s` is descriptive; actual duration is the sum of `atoms[*].duration_s`. Current range is 0.1–120 seconds. `plates_needed` is a positive integer matching `hero.plates.length`. Each plate receives an equal share of that atom's duration; use one atom per plate for arbitrary holds. Never calculate total time from plate count alone. Explicit composed `timeline.plates[*].t0/t1` drive rendering.

## Show and atom

```json
{
  "show_id": "my-motion", "title": "My motion", "duration_target_s": 0.75,
  "parity_mode": true, "compose_mode": "parity", "floor_y": 684,
  "chars": {"L":{"name":"Left"},"R":{"name":"Right"}},
  "bg": {"base":"assets/my-motion/rooftop.png"}, "overlays": [],
  "atoms": [{
    "id":"beat-01", "label":"Counter", "kind":"duo",
    "duration_s":0.75, "plates_needed":1, "pose_mode":"hero",
    "motion":{"family":"fight","beat_class":"straight"},
    "hero":{"layout_source":"assets/my-motion/layout.json","plates":["P09"]},
    "camera":{"preset":"slow_push","nudge":{"x":0,"y":0,"s":0}},
    "fx_hooks":[{"type":"shake","t_rel":0.12,"params":{"amp":5,"dur":0.15}}]
  }]
}
```

`show_id` uses lowercase ASCII letters/numbers/hyphens/underscores. Keep atom IDs unique. `t_rel` is normalized inside the atom, not global seconds. For static background changes, `bg.swap`, `bg.swap_t`, and per-layout `bg: "base" | "swap"` are supported. Legacy layout tokens can match the show's asset stem; `bg.aliases.base` / `.swap` preserve those tokens when a background is replaced.

## Layout, transparency, and paths

```json
{
  "P09": {
    "bg":"base", "floor":684,
    "parts":[{"src":"P09.png","x":0,"y":0,"w":1280,"h":720}],
    "shadows":[{"cx":330,"cy":682,"rx":85,"ry":7},{"cx":930,"cy":682,"rx":85,"ry":7}]
  }
}
```

Part/full paths are relative to the directory of `hero.layout_source`, unless embedded as image data. The virtual stage is 1280×720. Use real transparent character PNGs for `parts`; the renderer paints the background first. A full-scene opaque plate uses `{"full":"P01.png"}` and deliberately covers the background. Adding an empty background under such a plate changes nothing. Avoid using whole-image shadow ellipses as huge character shadows.

The legacy rooftop layout refers to PNG cutouts/full plates, but the deployed files are WebP/JPG. The build helper checks for those alternatives on disk without altering original images.

The editor's **Background → Change background** imports PNG/JPG/WebP into portable assets. **Remove white backdrop** sets `key_white: true` on the selected clip's background or the project default and removes edge-connected near-white pixels from full plates during rendering, preserving enclosed whites. It auto-enables for white-corner full plates when choosing a background; inspect the result and disable it when unsuitable. Source images stay intact. Leave it off when preserving an existing opaque sequence; use transparent parts for newly generated scenes. Background edits support undo/redo, device drafts, portable projects, and offline/video exports.

The **Background → Apply to** selector defaults to **Selected clip**. `atom.background.src` overrides that clip's background; omit `src` to inherit the project image or set it to `null` for no background. `atom.background.key_white` can override the project setting. These settings belong to the atom, so duplication and reordering preserve them.

`show.bg.motion` is the project default; `atom.background.motion` overrides it for a clip. The format is `{"preset":"pan_left","amount":0.4}`, with an amount from 0 to 1. Presets are `follow_camera` (legacy behavior), `static`, `pan_left`, `pan_right`, `pan_up`, `pan_down`, `push_in`, and `pull_out`. All except `follow_camera` render the background independently of the foreground camera. Pan and zoom travel on a continuous show clock, from the start of the show through its duration, so the crop keeps sliding across clips. `"clock":"per_atom"` or `"clock":"legacy"` restarts that move on each clip (still across every plate inside the clip). Optional `"span":{"t0":1,"t1":4}` or `[t0,t1]`, or `t0`/`t1` on the motion, runs the move over that show-time window. Foreground camera curves remain unchanged, and plates stay put unless the preset is `follow_camera`.

**Import from project**, below **Import images**, lets users select images from the shipped samples or a saved portable `.motion.json` file. It adds library images with new asset/layout keys and leaves the destination timeline in place. These images can become clip plates or be selected through **Use library image** in the background panel. Import only the images needed, then save the destination project to preserve them.

## Cameras, effects, captions

Load preset IDs from `public/presets/camera_presets.json` and hook IDs from `fx_presets.json`. Simple cameras include `static_hold`, `slow_push`, `slow_pull`, `slide_left`, `slide_right`, `gentle_orbit`. Camera `params` can override x/y/s/r curves (`const`, `lerp`, `sin`, `saw`, `alt_bump`); x/y are pixels, s is scale, r is degrees. Use subtle values for already tightly framed plates. Rotation automatically raises minimum scale to avoid exposed corners.

Overlays use `{id,kind:"text",text,t_start,t_end,x,y,style:{fontSize,fill,stroke,strokeWidth}}`. Keep preserved overlays unchanged when extending. Editor atom `caption` is converted into timeline overlays when compiled by the UI. The build helper materializes captions in its validation compose so reports match the editor.

Portable export embeds images. Browser-recorded video is real-time MediaRecorder output and may vary by a frame. Deterministic export renders `total_seconds * fps` frames at `i/fps`, then encodes at that fps; verify the actual file metadata. WebM is video, not MP4.

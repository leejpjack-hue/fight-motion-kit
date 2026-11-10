---
name: hm-fg-layer-author
description: Stamp foreground props, their own camera, and break timing onto a fight-motion-kit show (.motion.json / show JSON) from a typed prop list or scene brief. Add-if-missing, then hand off to the Compose FOREGROUND panel for human placement and break edits. Use when asked to place FG props, a foreground camera, or a break time on a show. Not for voice, SFX, new FX art, or a compose HTTP backend.
---

# hm-fg-layer-author — stamp FG props, own camera, and break timing

Place a prop list on `show.fg` with that layer's own camera, then let Jack
break and nudge it in the Compose FOREGROUND panel. This skill only writes
fields HM-COMPOSE-FG already normalizes and draws. It invents no FX, no
voice, and no #41 SFX.

## Reuse (shipped on tip — do not rebuild)

- **HM-COMPOSE-FG** (introduced `42211b68`, still the live path): `show.fg.cam`
  plus `show.fg.props[]`. `public/ui/compose-client.js` `normalizeForeground`
  and `public/ui/motion-renderer.js` `fgCameraFrame` / `fgPropPose` /
  `fgBreakState`. The foreground camera does not follow background crop-pan
  or the clip camera.
- **Compose FG panel**: `public/ui/index.html` `#foregroundPanel` and
  `public/ui/foreground-controls.js`. Break / effect is `#fgEffect` +
  `#fgEffectT`. Camera is `#fgCamPreset` / `#fgCamAmount` / nudge fields.
  Default camera matches the panel: `parallax`, amount `0.45`, nudge `0,0,0`.
- **Broken cutout field** (shipped HM-FG-BROKEN-CUTOUT): optional
  `effect.broken_src` (PNG / WebP / JPG path). Omit it and the prop cracks
  in the existing renderer. Thickening that art path is HM-PF-37.
- **CLASS-DENSE-FG** stays the later independence / dense-show proof
  (HM-PF-38 / HM-PF-39). This skill does not add a new show or restyle the panel.
- The historical pack `hm-compose-fg-2026-10-25` is not in this checkout.
  The schema and panel on tip are the source of truth.

## Inputs

- Repo path. Default: the checkout this skill lives in. Override with `--repo`.
- Show / `.motion.json` path (required, `--show`). A saved project wrapper
  (`{ show: { ... } }`) is stamped on the inner show. Relative paths resolve
  against the repo root.
- Prop list, either:
  - `--brief <scene-brief.json>` with `cam` and `props[]`, or
  - repeatable `--prop id=chair,src=props/chair.png,x=200,y=160,z=20,break=2,broken=props/chair-broken.png`
- Break on a prop that is already on the show: `--break chair=2` or
  `--break chair=2:props/chair-broken.png`.
- Camera retune (optional): `--cam parallax`, `--amount 0.45`, `--nudge x,y,s`.
  The first stamp writes a camera when the show has none. Later stamps keep
  Jack's camera unless one of those flags is passed.
- Output (optional): `--out <file>`. Default overwrites the show in place and
  saves `<show>.bak` once (first backup wins).

## Run

```sh
node skills/hm-fg-layer-author/scripts/stamp-fg.cjs \
  --show public/shows/my-show.json \
  --brief skills/hm-fg-layer-author/fixtures/scene-brief.json \
  --out /tmp/my-show-fg.json
```

Pure Node filesystem — no network, no server, no compose HTTP. Exits non-zero
on a missing show, a bad camera preset, a non-break effect, a voice/#41 field,
an overlay with a break, or a break aimed at a prop that is not on the show.

Add-if-missing: an id already on `show.fg.props` is reported
`already present, placement left untouched`. An existing break time is left
alone. A prop with no break yet can gain one from `--break` or from a later
brief. `--replace` overwrites the listed ids.

The entry written is the panel shape, for example:

```json
{
  "cam": { "preset": "parallax", "amount": 0.45, "nudge": { "x": 0, "y": 0, "s": 0 } },
  "props": [
    {
      "id": "chair",
      "src": "props/chair.png",
      "x": 200,
      "y": 160,
      "scale": 1,
      "z": 20,
      "t_start": 0,
      "t_end": 4,
      "effect": { "type": "break", "t": 2, "broken_src": "props/chair-broken.png" }
    }
  ]
}
```

`t_end` defaults to the show length (sum of `atoms[].duration_s`) and is
clamped to that length, which is what compose already does. Omitted `x` / `y`
use the panel's Add-prop start (`980,180` for a prop, `640,360` for overlay).

## FE handoff — where Jack breaks it

After stamping, open the composer at `/ui/` (loopback static server, e.g.
`npm run dev` → `http://127.0.0.1:8765/ui/`), import the stamped show, and
use the FOREGROUND panel:

- Pick the prop (`#fgProp`).
- Set **Break / effect** (`#fgEffect`) and **Break at** (`#fgEffectT`).
- Retune **Foreground camera** (`#fgCamPreset`, `#fgCamAmount`, nudge).
- The note on the panel still says this camera does not follow background
  crop-pan or the clip camera.

`#fgSkillHint` names this skill. It sits after the camera block, outside the
sticky header, so break and camera controls keep scrolling as before.

**Break** (`#fgJumpBreak`) and **Camera** (`#fgJumpCam`) sit on the prop row
inside `#fgStickyTop`. They scroll `#foregroundPanel` only, to `#fgBreakBox`
or `#fgCamBox`. The scrollport, sticky add header, sticky break, and scrolling
prop list stay the HM-FG-PANEL-SCROLL-2026-10-30 rules. Slot notes sit under
that header so a short dock does not pin them over the break time or the
camera preset.

## Anti-jobs

- No `api.teqcon.uk`, no `:8770`, no compose HTTP, no `wrangler deploy`.
- No voice / SFX. HM-PF-47 and HM-PF-48 stay HOLD. A brief that carries
  `voice`, `sfx`, `audio`, `vo`, or `#41` fails closed.
- No new effect type. `fire`, debris, dust, and photo overlays are rejected.
- No rewrite of the FG panel, no new prop art, no second camera engine.
- Do not overwrite `public/shows/daiyu-wang-five-seconds.json`. The 5.00s
  eight-plate demo stays intact; write `--out` somewhere else.
- No merge from this skill. HM-PF-31 (hm-bg-scene-author) is on main.

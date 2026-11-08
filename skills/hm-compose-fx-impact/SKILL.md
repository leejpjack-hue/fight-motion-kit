---
name: hm-compose-fx-impact
description: Stamp Wave1 pixelfx impact FX hooks (impacts/hit-spark and 11 other shipped ids) onto the atoms of a fight-motion-kit show (.motion.json / show JSON) from the command line, add-if-missing, then hand off to the HTML Motion Composer inspector for FX location/size tweaks. Use when asked to add impact hits, Wave1 FX, or pixelfx hooks to a show in bulk or by script; not for authoring new FX JS, voice/SFX, or any compose HTTP backend.
---

# hm-compose-fx-impact — stamp Wave1 impact FX onto a show

Stamp a shipped Wave1 pixelfx impact onto chosen beats of a show, then let the
composer inspector do the fine tuning. This skill only writes `fx_hooks`
entries that already render through the shipped composer paths — it invents no
new FX.

## Reuse (all shipped on tip — do not rebuild)

- **IMPACT-WAVE1 catalog**: `public/presets/pixelfx_wave1.json` (mirror
  `kit/presets/pixelfx_wave1.json`) — 12 ids, roles Action / Reaction /
  Aftermath.
- **COMPOSER-FX renderer**: `public/vendor/pixelfx/wave1.js` (+ global build)
  via the composer's createFx path (#55). The hook only has to name the id.
- **Catalog Query Apply semantics**: `public/ui/catalog-query.js` `addFx` —
  add-if-missing, `t_rel: 0.08`, `source: "pixelfx"`. The stamp writes the
  same entry, plus `params: { x, y, scale }`.
- **FX LOCATION & SIZE inspector (HM-FX-LOC-SIZE)**: `public/ui/index.html`
  `#fxLocSizeBox` with `#fxLocX` / `#fxLocY` / `#fxScale` — these edit exactly
  the `params.x` / `params.y` / `params.scale` the stamp seeds.
- **Frame-QA after structural edits**: `skills/html-motion-composer/scripts/frame-qa.cjs`
  (lint → peek → claim) if the edit is more than a hook stamp.

## Inputs

- Repo path (a fight-motion-kit checkout). Default: the checkout this skill
  lives in; override with `--repo`.
- Show / `.motion.json` path (required, `--show`; relative paths resolve
  against the repo root).
- Target atoms (optional): `--atoms beat-01,beat-03` (ids) or `--atoms 0,2`
  (0-based indices), or `--all-action-beats` for every atom whose
  `motion.beat_class` is a strike: clash, straight, jab, hook, uppercut,
  elbow, knee, front_kick, sweep.
- Wave1 FX (optional): `--fx <id>` (e.g. `impacts/hit-spark`) or a role name
  `Action` / `Reaction` / `Aftermath` (first catalog id of that role).
  Default: first Action id — `impacts/hit-spark`.
- Output (optional): `--out <file>`. Default overwrites the show in place and
  saves the pre-stamp original as `<show>.bak` once (first backup wins).

## Run

```sh
node skills/hm-compose-fx-impact/scripts/stamp-wave1-fx.cjs \
  --show public/shows/my-show.json --atoms beat-01,beat-04 --fx impacts/crit-hit
```

Pure Node filesystem — no network, no server, no compose HTTP. Exits non-zero
on a missing show file, an unknown fx id/role, or zero atoms selected/resolved.
Add-if-missing: an atom that already carries the fx id is reported
`already present, left untouched` — existing params (Jack's tweaks) survive.

Output report lists each atom → fx id, e.g.:

```
  beat-01: added impacts/hit-spark (t_rel 0.08, pixelfx, params x/y/scale 0/0/1)
```

The entry written is exactly:

```json
{ "type": "impacts/hit-spark", "t_rel": 0.08, "source": "pixelfx", "params": { "x": 0, "y": 0, "scale": 1 } }
```

## FE handoff — where loc/size gets tweaked

After stamping, the human/agent opens the composer at `/ui/` (loopback static
server, e.g. `npm run dev` → `http://127.0.0.1:8765/ui/`), opens/imports the
stamped show, and clicks a stamped clip:

- **FX LOCATION & SIZE** (`#fxLocSizeBox`) appears in the inspector for hooks
  with params — edit **FX X** (`#fxLocX`), **FX Y** (`#fxLocY`), **FX Scale**
  (`#fxScale`), or Reset. Values land in the hook's `params`.
- Preview honesty stays labeled: Wave1 pixelfx hooks render at compose time,
  not live-scrub — the stage keeps the **Compose-to-see-FX** honesty banner
  (`#fxHonestyBanner` / `#fxHonestyNote`), so say "compose/export to see the
  FX", never "it renders in the scrub preview".

## Anti-jobs

- No `api.teqcon.uk`, no `:8770`, no compose HTTP, no `wrangler deploy`.
- No voice / SFX work; no HM-PF-47 / HM-PF-48 scope.
- No new FX JS beyond the shipped Wave1 catalog — no invented ids, no vendor
  edits.
- No merge / deploy / push from this skill; PRs stay draft for the CoS gate.

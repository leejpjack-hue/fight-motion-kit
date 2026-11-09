# HM-PF-36 proof — hm-fg-layer-author

**Status:** READY · FE-only · HM-PF-31 and HM-PF-40 are on main. This branch does not merge itself.
**Tip:** `903be981` (Cap12)

## What landed

| Artifact | Path |
|---|---|
| Skill | `skills/hm-fg-layer-author/SKILL.md` |
| Stamp script | `skills/hm-fg-layer-author/scripts/stamp-fg.cjs` |
| Scene brief | `skills/hm-fg-layer-author/fixtures/scene-brief.json` |
| Tests | `tests/hm-pf-36-fg-layer.test.cjs` (wired in `package.json` `test`) |
| Show schema | `kit/schema/show.schema.json` `fg` / `fgCam` / `fgProp` / `fgEffect` |
| Panel hint | `#fgSkillHint` in `public/ui/index.html` (outside the sticky header) |

## Musts

1. **FG props land in the show schema with their own cam fields.**  
   Stamp writes `show.fg.cam` (`preset`, `amount`, `nudge`) and `show.fg.props[]`. See `fg-stamped.json`. Compose keeps the 5.00s demo length and does not retune background or clip cameras.
2. **Break / effect timing is attachable.**  
   `effect: { type: "break", t, broken_src? }`. A later stamp leaves a break Jack already set. `--break id=seconds` attaches one when the prop has none. `fire` and voice/#41 fail closed.
3. **Human edits in the Compose FG panel.**  
   `#fgEffect` / `#fgEffectT` / `#fgCamPreset` are the shipped HM-COMPOSE-FG controls. Browser proof: stamped chair break `2` → panel edit `2.75`, parallax amount `0.45` → `0.2`, duration stays `5`, eight atoms stay.
4. **Reuses the shipped path.**  
   No new renderer, no new effect type, no gold-demo overwrite (`public/shows/daiyu-wang-five-seconds.json`).

## Stamp prove

`node --test tests/hm-pf-36-fg-layer.test.cjs` → 5/5.  
`npm test` → 176/176 on Cap12.

```
Foreground camera: parallax amount 0.45 nudge 0,0,0 (wrote)
  desk: added
  chair: added (break @ 2s, broken props/chair-broken.png)
Stamped 2 prop(s): 2 added, 0 already present, 0 replaced. Breaks attached: 1.
Show length stays 5s.
```

Full log: `stamp-run.txt`.

## Jack handoff

1. Stamp a prop list onto a copy of the show (`--out`; the 5.00s demo is refused in place).
2. Open `/ui/` and import the show.
3. In FOREGROUND, pick the prop and edit **Break at** and **Foreground camera**.

## Anti-jobs held

- Voice / #41 and HM-PF-47 / HM-PF-48 untouched
- No teqcon, no `:8770`, no compose HTTP, no `wrangler deploy`
- HM-PF-37 / 38 / 39 stay follow-ons (broken-art thicken, independence proof, scroll polish)
- HM-PF-31 is on main. This proof does not merge the branch.

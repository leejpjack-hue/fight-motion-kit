# HM-PF-41 proof — hm-compose-fx-impact

**Status:** DONE · FE-only · no merge  
**Branch tip (base):** `970c1f9` (origin/main) · worktree `fight-motion-kit-hm-pf-41`  
**Session:** ZCode app-server · GLM-5.3 · `sess_2fc628ee-581d-401f-bd2e-19e456f895d3` (skill + stamp authored; proof/commit finished after PNG-churn steer)

## What landed

| Artifact | Path |
|---|---|
| Skill | `skills/hm-compose-fx-impact/SKILL.md` |
| Stamp script | `skills/hm-compose-fx-impact/scripts/stamp-wave1-fx.cjs` |
| Fixture | `skills/hm-compose-fx-impact/fixtures/two-beat-fixture.json` |
| Tests | `tests/stamp-wave1-fx.test.cjs` (wired in `package.json` `test`) |
| Composer hint | `#catalogSkillHint` in `public/ui/index.html` |

## Musts

1. **Wave1 impact FX attachable from skill output → show**  
   Stamp writes add-if-missing `fx_hooks` with `source: "pixelfx"`, `t_rel: 0.08`, seeded `params: {x,y,scale}` — same shape Catalog Query Apply uses (COMPOSER-FX / IMPACT-WAVE1).
2. **Preview honesty Compose-to-see-FX labeled**  
   Unchanged: `#fxHonestyBanner` / `#fxPreviewBadge` / `#fxHonestyNote` in public composer; kit shell still carries “Compose to see FX …”. No regression in this Cap.
3. **Reuse pixelfx vendor into kit — no teqcon**  
   Catalog: `public/presets/pixelfx_wave1.json` · renderer: `public/vendor/pixelfx/`. Stamp invents no FX JS.
4. **Cut/impact timing editable in UI after**  
   Loc/size: `#fxLocSizeBox` (`#fxLocX` / `#fxLocY` / `#fxScale`). Cut presets remain HF-08 (`cut_transitions.json`) — full cut-pack-in-flow is HM-PF-43.

## Stamp prove

```sh
node skills/hm-compose-fx-impact/scripts/stamp-wave1-fx.cjs \
  --repo . --show /tmp/show.json --atoms 1 --fx impacts/hit-spark
```

See `stamp-run.txt`, `before-fx_hooks.json`, `after-fx_hooks.json`.

Unknown fx → exit 3. Happy path → 1 added, 0 already present (idempotent).  
`node --test tests/stamp-wave1-fx.test.cjs` → **5/5 pass**.

## Jack handoff

1. Stamp Wave1 onto the show (skill / script).  
2. Open composer `npm run dev` → `/ui/` → select clip.  
3. Tweak **FX X / Y / Scale** under FX LOCATION & SIZE.  
4. Honesty banner tells live vs Compose-only / miss — no invent compose HTTP.

## Anti-jobs held

- voice / #41 · HM-PF-47 / HM-PF-48 untouched  
- no merge/deploy (CoS gate)  
- no teqcon · no CloudAgent

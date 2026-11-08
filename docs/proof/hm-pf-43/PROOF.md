# HM-PF-43 proof — HF-08 cut pack apply in compose/rhythm + skill

**Status:** DONE · FE-only · ready for review, not merged (supersedes #79; CoS squash)
**Branch:** `cursor/hm-pf-43-hf08-cut-pack-rebased` (base origin/main @ `cfb647b`, HM-PF-44)
**Story:** HF-08 ships per-clip Cut-in; this Cap adds the block-pack apply — pick cut pack → fight reads snappier.

## What landed

| Artifact | Path |
|---|---|
| Skill stamp script | `skills/hm-compose-fx-impact/scripts/stamp-cut-pack.cjs` |
| Skill docs (Cut-pack section, Wave1 kept) | `skills/hm-compose-fx-impact/SKILL.md` |
| Compose helper | `HMComposeClient.applyCutPack(show, selectedIndices, opts)` in `public/ui/compose-client.js` |
| UI (rhythm/compose flow) | `#cutPackMode` + `#applyCutPack` + `#cutPackHint` inside `#cutTransitionGroup` (`public/ui/index.html`), wired in `public/ui/app.js` (`applySelectedCutPack`) |
| Unit tests | `tests/hm-pf-43-cut-pack.test.cjs` (in `package.json` `test`) |
| Browser check | `tests/hm-pf-43-cut-pack.browser.cjs` (standalone, sg01-browser pattern) + inline block in `tests/editor.cjs` |

## Musts

1. **HF-08 cut pack apply from compose/rhythm UI or skill**
   - UI: click a clip, Shift-click to extend the selection, choose **Cut pack** (`Cycle HF-08 pack` / `Freeze hold` / `White flash` / `Whip cut`), click **Apply cut pack to selection**. Applies to every selected index ≥ 1 (falls back to `[selected]`).
   - Skill: `node skills/hm-compose-fx-impact/scripts/stamp-cut-pack.cjs --show <show.json> --all` (or `--atoms ids|indices`, `--pack cycle`, `--preset <id>`, `--out`, `--repo`).
   - Both write `show.atoms[i].cut = { preset, dur_s, hold_s, dir }` with gold catalog defaults; atom 0 is skipped/reported (no incoming boundary) and never stamped.
2. **Gold `cut_transitions` presets preserved** — file untouched (byte-stable; `git diff` shows no change to `public/presets/cut_transitions.json` or `kit/presets/cut_transitions.json`). Test 1 asserts the exact 3 ids + original defaults.
3. **Preview + export parity** — no new draw path. The pack only writes `show.atoms[i].cut`; preview scrub and export keep using `public/ui/cut-transitions.js` (`resolveCutTransition` / paint) via motion-renderer + exports (HM-HF-08 tip). Unit test 6 composes a stamped show through `composeShow` → 3 cuts at indices 1–3, duration unchanged.
4. **FE-only** — no backend, no Remotion/GSAP, no CloudAgent, no merge.

## How to apply (Jack path)

- **From the composer:** open `/ui/` (`npm run dev`), click the first clip you want cut, Shift-click the last, pick a mode under **Cut in → Cut pack**, press **Apply cut pack to selection**. Status line reports the stamped presets; the per-clip Cut-in form refreshes; Undo (⌘/Ctrl Z) restores.
- **From the skill:** see `stamp-run.txt` — cycle stamps freeze → flash → whip across i≥1, `--preset white_flash` stamps one id, unknown id exits 3. First in-place write backs up to `<show>.bak`.

## Verification

- `node --test tests/hm-pf-43-cut-pack.test.cjs` → **6/6 pass** (gold catalog intact, cycle stamp, single-preset + backup, compose-client parity, unknown-preset failures both paths, compose-through-HF-08-draw).
- `npm test` → **83/83 pass** on this rebase. The script keeps HM-PF-44 `tests/motion-sot.test.cjs` and adds `tests/hm-pf-43-cut-pack.test.cjs`.
- `node tests/hm-pf-43-cut-pack.browser.cjs` → **PASS** (cycle + single preset from the UI, Cut-in form refresh, undo restore, first-clip-only refused with honest status). Screenshot: `ui-apply-cut-pack.png` (regenerated on the HM-PF-44 composer).
- `npm run test:browser` (`tests/editor.cjs`): **pre-existing abort, not this Cap.** On `origin/main` @ `cfb647b` the HM-CAM-CHAIN block starts at line 140 (`chained preset`) and the u_range continuity asserts are lines 141–144. The suite aborts there, before the HM-PF-43 inline block. The standalone browser check above covers this Cap's UI flow.

## Blast radius

- Cut pack apply only: `app.js` (+37 lines: populate/hint/apply/wire), `compose-client.js` (+34: one pure helper + export), `index.html` (+1 line inside `#cutTransitionGroup`), skill folder, tests, docs.
- Undo stays the normal `edit()` snapshot — no new undo stack. Durations/plate times untouched (cuts add no time).
- Gold preset files, motion-renderer, `cut-transitions.js` draw logic, and exports peel: untouched.

## OOS / N/A

- Renderer peel, second renderer: N/A (reuse `public/ui/cut-transitions.js`).
- Voice/#41, HM-PF-27/28/47/48, SG-01 playability, pixelfx Wave1 FX bodies: untouched.
- HM-PF-13 (dialogue-hold): not needed, not blocked.
- HM-PF-09 gate surface, Jack GO storyboard: untouched.

# HM-PF-30 proof — Strip timing/body_h QA panel

**Status:** DONE · FE-only · draft PR (CoS Jev→squash)  
**Head:** `41af365` (`41af3658b7c50ac156bc96ac21f8011855b054d8`) on `cursor/hm-pf-30-strip-timing-qa`  
**Base:** origin/main `3ef3f100` (HM-PF-26)  
**Session:** ZCode GLM-5.3 `sess_22a8267a-0ddf-406a-93f3-95ca3a75d3df`

## Landed
| Artifact | Path |
|---|---|
| Skill | `skills/hm-spritegen-handoff/SKILL.md` |
| Panel model | `HMStripAdapter.buildStripQaPanel` in `public/ui/project-media.js` |
| Dialog UI | `#stripQaPanel` in `public/ui/index.html` + styles |
| Focused tests | `tests/hm-pf-30-strip-qa.test.cjs` (8) |

## Musts
1. Panel shows frames, delay_ms (raw/derived), body_h, loop policy, timingSource, duration + warnings (fps mismatch, subsample) — **yes**
2. Producer warnings + local source-report metadata preserved — **yes** (`producer` / `adapter` / `qa` / `metadata` labels)
3. FE-only; no RIFE/provider — **yes**
4. Malformed strip fails closed pre-commit — **yes** (commit stays disabled; panel error)

## Honesty / blast
- Strip remains **PENDING, NOT PLAYABLE until SG-02** (status copy unchanged).
- **Blast:** `secondsPerCell` / motion-renderer clock **unchanged** — panel is view-model only (test asserts no mutate/retime).
- HOLD untouched: PF-27/28/47/48 · root_motion · voice/#41.

## Tests
### Focused
```
$ node --test tests/hm-pf-30-strip-qa.test.cjs
# pass 8
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 55.917448
```
### Full
```
$ npm test
# tests 83
# suites 0
# pass 83
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 576.547635
```

## Browser verify
- Unit/dialog harness in focused suite covers `#stripQaPanel` render + commit gating (vm stubs, no headed Chrome required).
- Headed Playwright `test:browser` / `sg01-browser`: **SKIP for Cap gate** unless separately green — panel prove is the vm dialog test + screenshot `qa-panel.png` when present.

## Jack path
1. Open composer → **Import pending strip · PNG + JSON**
2. Pick `.strip.png` + `.strip.json`
3. Read **STRIP QA** panel (frames / delay / body_h / loop / warnings)
4. Only then **Save pending strip**

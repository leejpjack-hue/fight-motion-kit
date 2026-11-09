# HM-PF-30 proof — Strip timing/body_h QA panel

**Status:** DONE · FE-only · ready for CoS direct review (no Jev prerequisite)
**Base:** `e089c633b5d9bbc1b502b883d7c64e0d5f50cf2e` (`origin/main`, PR #132)
**Branch:** `cursor/hm-pf-30-strip-qa-tip-e089c63-e57d`
**Issue:** #107
**Supersedes:** draft PR #75 (head `bbbffd090762b500cd6f11829bdd53baa862c8bb`, dirty vs this base). That branch was not force-pushed.

The exact head SHA is the tip of this branch at push time and is recorded in the pull request body.

## Landed

| Artifact | Path |
|---|---|
| Skill | `skills/hm-spritegen-handoff/SKILL.md` |
| Panel model | `HMStripAdapter.buildStripQaPanel` in `public/ui/project-media.js` |
| Dialog UI | `#stripQaPanel` in `public/ui/index.html` + styles |
| Focused tests | `tests/hm-pf-30-strip-qa.test.cjs` (8) |
| Optional browser check | `tests/hm-pf-30-browser.cjs` (not part of `npm test`) |

## Musts

1. Panel shows frames, delay_ms (raw/derived), body_h, loop policy, timingSource, duration + warnings (fps mismatch, subsample) — **yes**
2. Producer warnings + local source-report metadata preserved — **yes** (`producer` / `adapter` / `qa` / `metadata` labels)
3. FE-only; no RIFE/provider — **yes**
4. Malformed strip fails closed pre-commit — **yes** (commit stays disabled; panel error)

## Honesty / blast

- Strip remains **PENDING, NOT PLAYABLE until SG-02** (status copy unchanged). SG-02 is not invented here.
- **Blast:** `secondsPerCell` / motion-renderer clock **unchanged** — panel is a view-model only (test asserts no mutate/retime). Normalize's cadence branch was not edited.
- HOLD untouched: HM-PF-27/28/47/48 · SG-02 · root_motion · voice/#41 · no 30a scope.

## Tests

### Focused

```
$ node --test tests/hm-pf-30-strip-qa.test.cjs
# tests 8
# pass 8
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 59.986843
```

### SG-01 regression (dialog wiring still fail-closed)

```
$ node --test tests/hm-pf-30-strip-qa.test.cjs tests/sg01.test.cjs
# tests 44
# pass 44
# fail 0
```

### Full

```
$ npm test
# tests 142
# suites 0
# pass 142
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1057.780935
```

`npm test` includes `tests/hm-pf-30-strip-qa.test.cjs` and does not include `tests/sg01.test.cjs` or the browser script.

## Browser verify

Headless Playwright against the existing loopback server (`127.0.0.1:8765`, this checkout):

```
$ TEST_BASE_URL=http://127.0.0.1:8765 node tests/hm-pf-30-browser.cjs
PASS HM-PF-30 browser: QA panel rows render, warnings labeled, fail-closed keeps commit disabled, close resets
```

Screenshot: `docs/proof/hm-pf-30/qa-panel.png` (numbered-pixel FINAL periodic fixture, not generated fight art).

Headed `npm run test:browser` / `tests/sg01-browser.cjs`: **not run** for this gate. The prior SG-01 browser suite is a separate lock assertion and is outside this panel prove.

## Jack path

1. Open composer → **Import pending strip · PNG + JSON**
2. Pick `.strip.png` + `.strip.json`
3. Read **STRIP QA** (frames / delay / body_h / loop / timing source / duration / warnings)
4. Only then **Save pending strip**

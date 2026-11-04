# HM-HF-06 Agent Frame-QA Loop

After a structural edit, the composer skill requires lint → peek → claim. Structural lint findings are Errors and block the claim. Rhythm findings stay warnings. The command is local and uses the tip compose engine.

## Commands

Fixture: `skills/html-motion-composer/fixtures/hm-hf-06-broken-slice.json` (`camera.preset` is empty).

```sh
cp skills/html-motion-composer/fixtures/hm-hf-06-broken-slice.json work/qa/hm-hf-06-qa-slice/show.json

node skills/html-motion-composer/scripts/frame-qa.cjs lint --repo . \
  --show work/qa/hm-hf-06-qa-slice/show.json --out work/qa/hm-hf-06-qa-slice

node skills/html-motion-composer/scripts/frame-qa.cjs peek --repo . \
  --show work/qa/hm-hf-06-qa-slice/show.json --out work/qa/hm-hf-06-qa-slice

node skills/html-motion-composer/scripts/frame-qa.cjs claim \
  --out work/qa/hm-hf-06-qa-slice
```

That lint exits 1. Peek and claim exit 1 and do not write their artifacts.

Fix: set `beat-01` `camera.preset` to `static_hold` in `work/qa/hm-hf-06-qa-slice/show.json`. Then run the same three commands again. Lint and peek exit 0. Claim exits 0 and writes `claim.json`.

## Transcript

Lint on the broken slice:

```
lint: 1 Error(s), 0 warning(s), claim blocked
exit 1
```

`work/qa/hm-hf-06-qa-slice/lint.json` records `empty_cam_preset` on `beat-01` with `severity: error`, `blocksClaim: true`, `blocksBake: false`.

```
peek blocked: lint reports 1 Error(s). Frame Peek runs only after lint is clean of Errors.
exit 1

claim blocked: 1 Error(s) remain. Fix the show, re-run lint, then peek, then claim.
exit 1
```

After `static_hold`:

```
lint: 0 Errors, 0 warning(s), claim allowed after peek
exit 0

peek: 2 frame(s) for hm-hf-06-qa-slice
exit 0

claim: done hm-hf-06-qa-slice
exit 0
```

`frame-peek.json` is `HMComposeClient.framePeekPlan` after `HMComposeClient.composeShow`. The slice is 0.5s, one atom, plate `P01`. Peeks are mid `t=0.25` (`hm-hf-06-qa-slice-peek-01-P01-mid-0.25s.png`) and clamped +0.3s `t=0.4999` (`hm-hf-06-qa-slice-peek-01-P01-plus03-0.50s.png`). `claim.json` has `ok: true` and the same `lint_digest`.

## Artifact paths

| Path | Role |
| --- | --- |
| `work/qa/<slice>/lint.json` | Lint report. Errors block the claim. |
| `work/qa/<slice>/frame-peek.json` | Frame Peek list for that slice. Names PNG files; writes no PNG bytes. |
| `work/qa/<slice>/claim.json` | Written only when claim exits 0. |

`.gitignore` ignores `work/`, including `work/qa/`. `git check-ignore` matches `lint.json`, `frame-peek.json`, and `claim.json`. Peek PNGs, zips, and WebM files stay in that tree and are not part of this PR.

Pixel export stays on `skills/html-motion-composer/scripts/export-project.cjs` or the editor Frame Peek download. Portable projects stay on `build-project.cjs`.

## Tests

`npm test` includes `tests/frame-qa-loop.test.cjs` (lint-fail → blocked peek/claim → fix → peek → claim, rhythm warnings do not block, peek before lint is blocked).

## Out of scope

- Motion skill harness ownership: N/A. The only skill edit is `skills/html-motion-composer/`.
- Cloud or remote QA, HeyGen, Remotion, GSAP: N/A. `frame-qa.cjs` does not reference them and does not call a compose API.
- HF-08 Cut Transition Pack, issues #38 and #40, #41 SFX: N/A. No transition, contact-sheet, bake-pop, or audio files change.
- pixelfx forge and extra Cap slots: N/A. No `public/vendor/pixelfx` or pixelfx preset edits. This is Cap HM 1/3 for 2026-11-04.

The fixture does not modify `public/shows/daiyu-wang-five-seconds.json`. That show stays eight plates and 5.00s.

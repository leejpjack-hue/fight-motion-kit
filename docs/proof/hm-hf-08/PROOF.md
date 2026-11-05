# HM-HF-08 Cut Transition Block Pack

Three front-end cut presets sit on the atom they enter. They do not add time. The existing motion renderer draws them when you scrub.

## Preset ids

| Id | What it draws |
| --- | --- |
| `freeze_hold` | Holds the outgoing plate for `hold_s` seconds into the next clip |
| `white_flash` | Full-frame white, peaking on the boundary across `dur_s` |
| `whip_cut` | Horizontal smear and a white bar traveling across `dur_s` (`dir` 1 right, -1 left) |

Catalog: `public/presets/cut_transitions.json` (same file under `kit/presets/`).

## Field path

`show.atoms[i].cut` for `i >= 1`. The first atom has no incoming boundary, so a `cut` there is ignored.

```json
{
  "id": "beat-02",
  "cut": { "preset": "freeze_hold", "dur_s": 0.12, "hold_s": 0.12, "dir": 1 }
}
```

Fixture `public/shows/hm-hf-08-cuts.json` (2.00s, four plates, the eight-plate layout):

| Atom | Field | Preset | Boundary |
| --- | --- | --- | --- |
| `beat-02` | `show.atoms[1].cut` | `freeze_hold` | 0.50s |
| `beat-03` | `show.atoms[2].cut` | `white_flash` | 1.00s |
| `beat-04` | `show.atoms[3].cut` | `whip_cut` | 1.50s |

Compose copies that onto `timeline.cuts[]` and `timeline.atoms[i].cut` (`t`, `after_id`, `before_id`, `preset`, `dur_s`, `hold_s`, `dir`). Save project is `JSON.stringify` of the show, so the field round-trips. The Clip Settings **Cut in** select writes the same object.

`daiyu-wang-five-seconds` is unchanged: eight plates, 5.00s, `timeline.cuts` empty until you add one.

## Scrub

Browser check against `http://127.0.0.1:8765/ui/`. The scrub input dispatches `input`, which calls `renderAt` → `renderStageAt` → `HMMotion.render`. `lastRenderSource` is `scrub`.

On the fixture, onion off, canvas PNG:

- Freeze at 0.54s and 0.60s share picture time `0.4999` and the same region hash `1406815403`. At 0.74s the cut is gone and the hash is `1644805221`. Frame: `scrub-freeze-hold.png` (outgoing plate held at 0.56s).
- White flash at 1.00s is `white: 1`. Center and corner pixels are `255,255,255,255`. At 0.90s the cut is absent and the corner is not white. Frame: `scrub-white-flash.png`.
- Whip at 1.50s has `barX` 604. The center pixel is white and differs from 1.40s (no cut). At 1.62s the cut is gone. Frame: `scrub-whip-cut.png`.
- Inspector after choosing Freeze hold on clip 02 of the five-second show: `inspector-freeze-hold.png`. The hint names `show.atoms[1].cut`. JSON reload kept that object. Duration stayed 5.00s.

Numbers are in `scrub-report.json`.

## Frame-QA

```sh
node skills/html-motion-composer/scripts/frame-qa.cjs lint --repo . \
  --show public/shows/hm-hf-08-cuts.json --out work/qa/hm-hf-08-cuts
node skills/html-motion-composer/scripts/frame-qa.cjs peek --repo . \
  --show public/shows/hm-hf-08-cuts.json --out work/qa/hm-hf-08-cuts
node skills/html-motion-composer/scripts/frame-qa.cjs claim --out work/qa/hm-hf-08-cuts
```

```
lint: 0 Errors, 0 warning(s), claim allowed after peek
peek: 8 frame(s) for hm-hf-08-cuts
claim: done hm-hf-08-cuts
```

`claim.json` has `ok: true`. `work/qa/` stays gitignored.

## Tests

`npm test` — 70 passed, including `tests/cut-transitions.test.cjs`.

`npm run test:browser` — passed, including `HM-HF-08 cut presets draw on scrub and round-trip in show JSON`.

## Out of scope

- #40 BAKE-POP: N/A. No bake-pop files.
- Remotion, GSAP, HeyGen: N/A. No references added.
- Remote compose API: N/A. Compose stays `HMComposeClient.composeShow` in the page.
- HF-09, HF-11: N/A. Not started.
- #38 CONTACT-SHEET: N/A. No contact-sheet files.
- #41 SFX HOLD: N/A. No audio.
- pixelfx forge: N/A. No `public/vendor/pixelfx` edits. Offline HTML only gained the two cut functions the renderer already calls.
- Cap 2 and Cap 3: N/A. This is Cap HM 1/3 for 2026-11-05.

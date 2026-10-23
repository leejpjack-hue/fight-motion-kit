# HTML Motion Composer skill and extension validation

The reusable `html-motion-composer` skill is in `skills/html-motion-composer/`. It includes an entrypoint, UI metadata, a project/renderer reference, a portable-project builder, and a browser-driven export helper. No model keys or external publishing actions are embedded in the skill.

The sample `daiyu-wang-ten-seconds` demonstrates actual use:

- Existing P01–P08 atoms and their timings are unchanged (five seconds).
- New P09–P16 add exactly five seconds; total is ten seconds.
- Eight new imagegen PNGs have RGBA alpha extrema 0–255. Their originals are preserved. Layout placement scales/positions them on the common stage without changing pixels.
- A ninth generated image is the opaque dusk rooftop background. New plates use `parts`; the original section retains `full` plates, which cover the background and preserve the old frames.
- `generation-prompts.json` and `alpha-validation.json` accompany the new assets.

Validation completed:

- Skill Creator's `quick_validate.py`: valid.
- Skill builder: 10 seconds, 16 plates, 17 image assets, no compose warnings, correct unchanged prefix and exactly five appended seconds.
- Export helper: offline HTML with HTTP(S) blocked; 300 rendered frames, encoded at 30fps; metadata confirms 10.000 seconds, 1280×720, VP8 WebM.
- Separate installed-skill smoke test: a one-second / two-plate project exported as 30 frames and verified as 1.000 second. An incorrect requested append length failed before creating output.
- Pixel comparisons at 0.00, 0.13, 0.90, 1.35, 2.40, 3.66, 4.55 and 4.99 seconds matched the original rendered project exactly.
- Background pixels after the seam are opaque blue skyline pixels, not a white matte; storyboard and editor preview were visually inspected.
- Six compose regression tests passed. Existing editor workflow tests are retained, with separate verification of the new deep link and 16-plate project.

The video animates existing still plates with cuts, camera moves and effects. It does not synthesize continuous character motion. Original source assets and the original five-second outputs remain intact.

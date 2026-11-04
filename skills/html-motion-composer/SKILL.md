---
name: html-motion-composer
description: Create, enhance, or extend editable plate-based videos in the fight-motion-kit HTML Motion Composer using images, backgrounds, timed clips, camera moves, effects, captions, and offline exports. After a structural edit, run the local Frame-QA loop (lint, then Frame Peek, then claim) and do not claim done while lint Errors remain. Use for this composer or its .motion.json/show projects; not for general footage editing or generating continuous character animation.
---

# HTML Motion Composer

Author an editable composition and verify its rendered result, not just its JSON. The tool is a browser-only canvas editor in `leejpjack-hue/fight-motion-kit`; there is no compose API or video-generation backend. Discover the user's checkout and inspect `public/ui/compose-client.js`, `motion-renderer.js`, and its current project format rather than assuming this skill's reference matches every revision.

## Choose the starting point

- Prefer the supplied `.motion.json` project or the show's JSON plus layout/assets. Identify the intended sample from the conversation or editor. A rendered video alone does not preserve its layers or timings; locate its editable source before claiming to extend that project.
- For an extension, duplicate the source under a new project/show ID. Keep the original atoms, timing, assets, and overlays unchanged unless the user requests changes. Append new atoms; do not stretch the original to fill the new total.
- Infer reasonable creative details when unspecified. State the continuation length and visual direction. A request to add five seconds to a five-second project means ten seconds total.
- Repository publication and deployment are separate actions. Generating assets or using this skill does not grant permission to push, merge, upload, or publish them.

## Plan and create assets

Inspect the last existing plates and character references. Map the continuation into actions with durations that sum to the requested addition. Preserve identity, costume, screen side, floor, framing, and action continuity where appropriate. Choose as many new plates as the action needs; do not impose a universal plate count or 2fps timing.

Use the available built-in image generator (and its imagegen skill) for new illustrations or backgrounds. Label each reference's purpose. Generate animation plates individually; a contact sheet is a review artifact, not a substitute for separately usable PNGs. Keep generated originals and record the final prompts.

**Background compositing matters:** an opaque `full` image covers the separate background. Prefer actual alpha-transparent character PNGs in `parts` entries for new scenes. A white PNG remains opaque unless the editor's optional **Remove white backdrop** (`show.bg.key_white`) is enabled; this removes edge-connected near-white pixels during rendering and needs visual inspection. Preserve opaque original plates and leave that option off if the existing section must remain unchanged. Inspect alpha and composite edges, and request a targeted image-generation correction if transparency is missing. Do not assume a visible checkerboard means there is alpha.

Read [references/project-format.md](references/project-format.md) when authoring layouts, atoms, backgrounds, camera curves or portable JSON.

## Compose and render

Use either supported path:

- **Editor:** open the local `/ui/`, import/open the project, arrange or replace media, adjust clip settings, and use Save project / Export. Preview recomposes automatically. Use browser controls that are actually available in the current environment.
- **Project authoring:** write a show/layout under the checkout's `public/` directory, then run `scripts/build-project.cjs` from this skill. It uses the repo's real compose engine, resolves assets, embeds them into a portable project, and can check an unchanged prefix plus exact extension length. Do not substitute fabricated timeline output.

Example (paths are placeholders, not prescribed locations):

```sh
node /path/to/skill/scripts/build-project.cjs --repo /path/to/fight-motion-kit \
  --show public/shows/extended.json --out /path/to/output/extended.motion.json \
  --base-show public/shows/original.json --append-seconds 5
```

For repeatable offline HTML and video exports, use `scripts/export-project.cjs`. It runs the actual editor in an isolated Playwright browser, verifies successful compose and asset loading, exports its HTML, and encodes every rendered frame. It does not touch the user's current browser draft. Requires Playwright (available from the repo's dev dependencies or the environment), a browser, and ffmpeg with a VP8 encoder for WebM.

```sh
node /path/to/skill/scripts/export-project.cjs --repo /path/to/fight-motion-kit \
  --project /path/to/output/extended.motion.json \
  --html /path/to/output/extended.html --video /path/to/output/extended.webm \
  --report /path/to/output/verification.json --fps 30
```

`BROWSER_CHANNEL=chrome` selects installed Chrome; otherwise Playwright's installed Chromium is used. `FFMPEG` can select a binary. Discover bundled dependency paths when applicable; do not hardcode another user's runtime paths. The helper starts a temporary loopback-only static server and shuts it down. If deterministic encoding is unavailable, export playable HTML and report the missing prerequisite; do not relabel a file as a different video format.

## Frame-QA loop

After a structural edit (atoms, plates, camera, FX hooks, durations, or layouts), the order is lint → peek → claim. Finish that order before you say the edit is done. The command is `skills/html-motion-composer/scripts/frame-qa.cjs`. It loads the checkout's `HMComposeClient` (the same engine `build-project.cjs` uses). It does not start a second renderer, a compose API, or a video encoder. Pixel export stays on `export-project.cjs` or the editor.

1. **Lint.** Structural findings (`missing_plate`, `atom_overrun`, `empty_cam_preset`, `bad_fx_t_rel`, `unsafe_duration`) are Errors. Rhythm findings (`adjacent_same_cam`, `duration_outlier`) stay warnings. The composer panel still treats every finding as a soft warning and does not block bake. This gate blocks the agent claim only.
2. **Frame Peek.** Runs only when that lint JSON is clean of Errors. It calls `composeShow`, then `framePeekPlan`, and writes the peek list for the edited show slice.
3. **Claim.** Writes `claim.json` only when the current lint has zero Errors and the peek file's digest matches that lint file. A stale peek, a missing peek, or any remaining Error refuses the claim and deletes a prior `claim.json`.

```sh
node skills/html-motion-composer/scripts/frame-qa.cjs lint --repo . \
  --show path/to/show.json --out work/qa/SHOW_ID
node skills/html-motion-composer/scripts/frame-qa.cjs peek --repo . \
  --show path/to/show.json --out work/qa/SHOW_ID
node skills/html-motion-composer/scripts/frame-qa.cjs claim --out work/qa/SHOW_ID
```

Every lint run replaces `lint.json` and deletes `frame-peek.json` and `claim.json` in that directory, so peek and claim have to be run again. Lint exits non-zero while Errors remain. Peek exits non-zero if lint has not been run or Errors remain. Claim exits non-zero in those cases too. Fix the show, then run lint, peek, and claim again. Do not describe the edit as done while claim is blocked.

Artifacts for the slice (JSON only; no PNG bytes):

| File | What it is |
| --- | --- |
| `work/qa/<slice>/lint.json` | `kind: hm-hf-06-lint`. `error_count`, `claim_blocked`, and each finding's `severity` (`error` or `warn`) plus the `Fix:` line. |
| `work/qa/<slice>/frame-peek.json` | `kind: hm-hf-06-frame-peek`. Peek times, plate ids, and the PNG filenames the editor Frame Peek strip would use. `lint_digest` binds it to the lint file. |
| `work/qa/<slice>/claim.json` | `kind: hm-hf-06-claim` and `ok: true`. Present only after a successful claim. |

`work/` is gitignored, including `work/qa/`. Leave lint JSON, peek JSON, peek PNGs, zips, and WebM files there. Do not add them to the PR. A committed proof note may quote the command transcript; it must not embed those binaries.

Frame Peek PNG pixels, when you need them, come from the editor's Frame Peek download or from `export-project.cjs`. Those paths already render with the editor. This loop does not encode them.

The loop is local. It does not call a cloud QA service, a remote compose API, HeyGen, Remotion, or GSAP.

## Verify and hand off

- For a structural edit, run the Frame-QA loop above and cite `claim.json` only after `frame-qa.cjs claim` exits 0. Do not claim done while lint Errors remain.
- Confirm all intended plates appear in order and timestamps cover the exact total without gaps. Compare the original prefix structurally and at representative rendered frames when preserving it matters.
- Inspect start, extension seam, impacts, and ending. Check clipping, feet/floor, character sides, alpha edges, and whether the background is actually visible.
- Verify offline HTML with HTTP(S) blocked, and inspect video metadata for duration, dimensions and frame rate. A frame count alone is not proof of successful encoding.
- Keep project JSON, playable HTML, video, new PNG/background assets, and concise verification/prompt records in user-facing output locations. Report what was rendered and any unverified limits.
- Call the result plate animation (cuts, camera movement, effects). Do not imply the tool generated continuous body motion, in-between poses, lip sync or audio it did not create.

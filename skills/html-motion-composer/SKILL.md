---
name: html-motion-composer
description: Create, enhance, or extend editable plate-based videos in the fight-motion-kit HTML Motion Composer using images, backgrounds, timed clips, camera moves, effects, captions, and offline exports. Use for this composer or its .motion.json/show projects; not for general footage editing or generating continuous character animation.
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

**Background compositing matters:** this renderer's `full` image hides the separate background. To show a new background behind characters, obtain actual alpha-transparent PNGs and use `parts` entries instead. A white PNG is opaque; setting `show.bg` will not remove it. Preserve opaque original plates if the existing section must remain unchanged. Inspect alpha and composite edges, and request a targeted image-generation correction if transparency is missing. Do not assume a visible checkerboard means there is alpha.

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

## Verify and hand off

- Confirm all intended plates appear in order and timestamps cover the exact total without gaps. Compare the original prefix structurally and at representative rendered frames when preserving it matters.
- Inspect start, extension seam, impacts, and ending. Check clipping, feet/floor, character sides, alpha edges, and whether the background is actually visible.
- Verify offline HTML with HTTP(S) blocked, and inspect video metadata for duration, dimensions and frame rate. A frame count alone is not proof of successful encoding.
- Keep project JSON, playable HTML, video, new PNG/background assets, and concise verification/prompt records in user-facing output locations. Report what was rendered and any unverified limits.
- Call the result plate animation (cuts, camera movement, effects). Do not imply the tool generated continuous body motion, in-between poses, lip sync or audio it did not create.

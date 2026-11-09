---
name: html-motion-fight-video
description: Sequence a fight-motion-kit fight from costume lock through local compose and export, calling each shipped hm-* skill and stopping for Jack GO. Use for an end-to-end HTML Motion fight video on the static composer. Do not use for voice, SFX, issue #41, a new strip importer, or any compose backend.
---

# HTML Motion fight video

Run product-flow steps 1 to 9 as one agent path. Read each named skill and follow that file. Pass only local files between steps. The show stays one portable `.motion.json`.

This directory is the Cursor skill. Do not add `agents/openai.yaml`.

## Start from the static composer

Work in a fight-motion-kit checkout. The editor is `public/ui/`. When you need the browser, start the existing static server and open the local UI.

```sh
npm run dev
```

Open `http://127.0.0.1:8765/ui/`. **Open project** loads a show. **↓ Save project** writes `.motion.json`. **Export ↗** writes local HTML, frames, or a browser recording.

n8n only orders steps and holds Wait gates. Leave n8n paused. Do not resume it. Do not POST the show. Do not deploy. Do not merge.

If a skill path below is missing, stop that assist step and name the path. Leave the step to the composer controls named here. Do not write a replacement skill, script, prompt pack, or HTTP API.

## Sequence

Follow the steps in order. Read the linked skill from the top. Do not copy its contract into a new script.

1. Character lock. Read [hm-character-lock](../hm-character-lock/SKILL.md). Jack completes that skill's costume drift review before import. A reject leaves the open project unchanged. Sheet generation stays in the sibling skills that file already names. Do not call GenerateImage from this frontend. The shipped pose-ref pack `public/presets/openpose_10s_kicks_pose_pack.json` loads in the composer as local plates. Do not generate replacements for it.

2. Story. Cantonese second-by-second boards belong to `skills/hm-storyboard-cantonese/SKILL.md`, HM-PF-06, issue #88. Read that file when it is in the checkout and follow it. When the file is absent, stop board authoring. Do not draft Cantonese beats in this skill and do not add a STORYBOARD-zh writer. Continue only from an approved PF-08 board that is already on the open show. Jack records approval in **2 Story · Jack GO gate** with **Approve**, then uses **Clip Settings → Rhythm → Export approved rhythm input**. **Rework** stays on step 2. A missing Approve, a Rework decision, or a changed board is not a GO. Never manufacture a GO file. `--go-file` on later helpers accepts only a record the operator already saved. Permission to implement is not story approval. Do not generate plates before this Approve.

3. Rhythm. Read [hm-rhythm-pacing](../hm-rhythm-pacing/SKILL.md). Give it the exported rhythm input from step 2. Jack applies the plan in the composer and can Undo.

4. Scene grammar. Read [hm-cam-grammar-scene](../hm-cam-grammar-scene/SKILL.md). Use the same step-2 Approve. Do not invent `wide_*` camera curves.

5. Per-beat cameras. Read [hm-cam-shot-author](../hm-cam-shot-author/SKILL.md). Jack applies the map in Clip Settings and can override a preset there.

6. Sprite handoff. Read [hm-spritegen-handoff](../hm-spritegen-handoff/SKILL.md). Generation stays on the external sprite-gen CLI. In the composer, use **Import pending strip · PNG + JSON**, review the strip QA panel, then **Save pending strip**. The strip stays PENDING and NOT PLAYABLE. Do not add strip-import code, a playback path, or an SG-02 ungate in this skill. Do not run RIFE. Do not accept `root_motion`.

7. Background. When `skills/hm-bg-scene-author/SKILL.md` exists, read it and follow it. When it does not, edit the open show in the composer background panel. Use **Change background**, the crop region, **Background motion · window pan**, and the optional show-time span. Do not add a background authoring script.

8. Foreground and impact. When `skills/hm-fg-layer-author/SKILL.md` exists, read it and follow it. When it does not, edit **FOREGROUND** in the composer. Use **Add prop**, the break time, and the foreground camera. Do not add a foreground authoring script. For a shipped Wave1 hook or the HF-08 cut pack, read [hm-compose-fx-impact](../hm-compose-fx-impact/SKILL.md) and run that skill's stamp scripts. Do not invent FX ids.

9. Compose and export. Read [html-motion-composer](../html-motion-composer/SKILL.md). This checkout's compose and export path is that skill plus the buttons in **Start from the static composer**. Do not start a second renderer.

   After atoms, plates, camera, FX hooks, durations, or layouts change, run that skill's Frame-QA loop. Lint first, then peek, then claim.

   ```sh
   node skills/html-motion-composer/scripts/frame-qa.cjs lint --repo . \
     --show path/to/show.json --out work/qa/SHOW_ID
   node skills/html-motion-composer/scripts/frame-qa.cjs peek --repo . \
     --show path/to/show.json --out work/qa/SHOW_ID
   node skills/html-motion-composer/scripts/frame-qa.cjs claim --out work/qa/SHOW_ID
   ```

   Build a portable project from a show on disk with the composer builder. Export offline HTML and video with the composer exporter. Point `--repo` at the checkout. Keep outputs under `work/` unless Jack names another local directory.

   ```sh
   node skills/html-motion-composer/scripts/build-project.cjs --repo . \
     --show public/shows/your-show.json --out work/your-show.motion.json
   node skills/html-motion-composer/scripts/export-project.cjs --repo . \
     --project work/your-show.motion.json \
     --html work/your-show.html --video work/your-show.webm \
     --report work/your-show.verification.json --fps 30
   ```

   In the browser, **↓ Save project** and **Export ↗** use the same editor renderer. `work/` is gitignored. Do not commit peek PNGs, WebM files, or claim JSON. Do not describe the edit as done while lint Errors remain or `claim` exits non-zero. A Frame-QA claim does not replace the step-2 Approve.

10. Voice stays HOLD. Skip the step. Do not create `skills/hm-voice-track/SKILL.md`. If that path is already a DESIGNED-HOLD note, leave it and do not run it. Do not record audio, do not add SFX, and do not lift issue #41. The workflow board keeps step 10 disabled until Jack lifts that HOLD.

## Jack GO gates

- Both cast sides pass the costume drift review before a lock pack changes the project.
- Jack clicks **Approve** on **2 Story · Jack GO gate** before rhythm, camera export, and plate generation. Never manufacture that GO.
- **Rework** returns to the story. It leaves the costume lock in place.
- An n8n Wait stays an operator gate. Do not auto-resume it.
- **Save pending strip** does not put that strip on the timeline or in an export.
- Do not launch a new Cap and do not issue GO 30a from this skill.

## Refusals

Refuse `api.teqcon.uk`, `:8770`, `wrangler deploy`, and any compose HTTP route. Refuse Remotion, HeyGen, and GSAP. Refuse voice, issue #41, new SG-01 importer code, and SG-02 playback. Refuse photo fire, light, dust, and pink-slash overlays. Leave `daiyu-wang-five-seconds` at 5.00 seconds and eight plates unless Jack asks for a copy.

## Hand off

Name the skills you read, any missing skill path, and the Approve or Rework choice Jack recorded. Name the `.motion.json` path and the Frame-QA claim result. Name an export only after the exporter or **Export ↗** actually wrote it. Call the result plate animation. Continuous body motion, lip sync, and audio are outside this path.

---
name: hm-character-lock
description: Turn a typed dual-cast brief or approved character references into a local costume_lock JSON pack, costume sheets, and optional pose-reference images for the fight-motion-kit frontend. Reuse prompt-sheets for sheet authoring and json-pose-from-image for pose extraction; use this skill for character and costume locking before composing, not for continuous animation, provider login, or a compose backend.
---

# HM character lock

Produce an editable local lock pack for **Step 1 · Character creation**
(HM-PF-02, #84). The agent prepares files outside HM; Jack opens them using the
existing HM-PF-01 **Open project** File API importer. HM stays a static frontend.

## Inputs

Accept a plain-language cast brief, for example:

> Use $hm-character-lock for Ah Lung on the left in a blue denim vest and
> Siu Mei on the right in a red track jacket. Keep these supplied faces and
> costumes. Write the pack to work/character-lock/street-duel.

| Input | Handling |
| --- | --- |
| Two cast members | Record names and fixed screen sides `L` and `R`. The shipped importer requires both sides; ask for the missing cast member if only one is supplied. |
| Identity and costume | Prefer supplied descriptions, approved images, and existing `costume_id` values. Record face, hair, silhouette, clothing, colors, footwear, and accessories in a human-readable lock. Propose unspecified details explicitly as draft choices. |
| Reference files | Inspect local images before using them. Distinguish identity/costume references from pose references; a pose reference must not silently replace an approved face or outfit. |
| Style and sheet requirements | Carry the user's style and required views to `prompt-sheets`; keep its sheet contract rather than inventing a new generation prompt. |
| Pose requests | Optional. Supply the source image and target side to `json-pose-from-image`. Pose JSON is an auxiliary artifact, not an HM image plate. |
| Output directory | Use the requested local directory, otherwise `work/character-lock/<pack-id>/` under the checkout. Preserve prior outputs; choose a new revision directory for changes. |

For names alone, propose a concise draft identity/costume brief before generating
new sheets. Existing approved local sheets can be packaged immediately. Preserve
an existing lock ID while reusing the same outfit; a changed outfit gets a new
revision ID, never a silent change under the previous lock.

## Reuse sibling skills

1. Locate and read the available **fight-prompting REPORT**, **prompt-sheets**,
   and, when pose extraction is requested, **json-pose-from-image** instructions
   in the current skill catalog or workspace. These are external reuse surfaces,
   not files bundled in this checkout. Record the actual source path/version in
   `prompts.md`; do not fabricate a report citation or assume another machine's
   paths exist.
2. Use the REPORT's applicable identity/costume consistency guidance and send
   the agreed cast brief plus labeled reference images to **prompt-sheets**.
   It owns sheet layout, prompt construction, and image-generation behavior.
   Save its final prompts and actual image outputs locally. This skill owns
   only the cast locks, file packaging, and HM handoff.
3. If needed, pass a supplied image to **json-pose-from-image**. Preserve its
   output schema in `pose-data/`; do not translate it into a made-up HM pose
   format. Only an actual local pose-reference **image** belongs in `pose_refs`.
   Skeleton/reference plates do not imply native ControlNet or body animation.
4. If a sibling or REPORT is unavailable, say which source is missing. Reuse
   approved local images when supplied. Otherwise write the draft brief and
   pending handoff in `prompts.md`, and report the pack as incomplete. Do not
   invent replacement prompts, provider commands, or placeholder sheets and
   call them generated output.

## Write the lock pack

Read [the pack contract and local smoke example](references/pack-contract.md)
before writing files. Its source of truth is the shipped
`public/ui/costume-lock.js` normalizer and
`docs/product-flow/HM-PF-01-costume-lock-pack.md`, not a parallel schema.

1. Write `cast-brief.md` with the user's brief, side assignments, locked visual
   details, reference provenance, and any unresolved draft choices.
2. Obtain or reuse at least one real, inspected costume-sheet image for each
   side. Keep the originals; copy the selected images into the output directory
   with distinct, safe basenames such as `L-sheet.png` and `R-sheet.png`.
   Keep the actual file format/extension. Do not create fake image bytes or
   relabel a contact sheet as individually generated animation frames.
3. Write `costume_lock.json` using the canonical `kind: "costume_lock"`,
   `version: 1`, `pack_id`, and `cast.{L,R}` fields. Each side has a `name`,
   stable `costume_id`, and `sheets` array of `{ id, label, src }` entries.
   Include `lock_refs` for each side: `{ label, src }` entries pointing to the
   earlier approved identity/costume images, distinct from candidate sheets.
   Keep these local reference images in the same output directory. If no
   approved reference is available, report the pack as pending reference review.
   Include only images that exist. Optional `pose_refs` use the same shape;
   omit them or use `[]` when no pose-reference images were supplied.
4. Write `prompts.md` with the sibling skills/REPORT actually used, labeled
   references, exact final sheet prompts, actual output filenames, reused-asset
   provenance, and pending work. For a pack made entirely from existing images,
   record that no generation occurred. Do not include credentials.
5. Write `HANDOFF.md` listing exactly the JSON and companion images to select,
   the two costume IDs, review status, and the FE steps below. Keep sibling
   pose JSON, brief, and prompt records outside the File API selection.

Minimum completed output:

```text
<output>/
  costume_lock.json
  L-sheet.png
  R-sheet.png
  L-reference.png
  R-reference.png
  cast-brief.md
  prompts.md
  HANDOFF.md
```

Additional sheets, pose-reference images, and `pose-data/` are optional. A
previously approved pose image may also serve as a locked reference, so the
same file can appear in `pose_refs` and `lock_refs`. Candidate sheets cannot
be their own lock reference. A prompt-only draft is useful preparation but is
**not** a completed importable
lock pack. Mark draft versus human-approved status in `HANDOFF.md`; a
`costume_id` binds an outfit and does not prove approval or visual consistency.

## Verify and hand off to the frontend

- Parse the JSON and confirm both cast names/IDs, unique plate IDs, at least one
  sheet per side, and an existing readable image for every `src`. Inspect the
  images for identity, costume, and side consistency; disclose uncertainty.
- Use the checkout's `HMComposeClient.normalizeCostumeLockPack` with a
  `localFiles` map of the companion image data URLs to verify the actual HM
  contract. The [reference](references/pack-contract.md#local-contract-check)
  contains a runnable check. This is local Node code, not a service call.
- Start the existing static editor with `npm run dev`, open
  `http://127.0.0.1:8765/ui/`, choose **Open project**, and select
  **`costume_lock.json` plus all companion images in the same selection**.
  A local file path in JSON alone does not give the browser access to that file.
- Follow [the costume drift checklist](references/drift-review.md) before
  import, then complete the visible HM-PF-03 comparison of candidate sheets
  against `lock_refs`. Supply the reviewer name and pass every check for both
  sides. Missing images, unchecked items, or Reject keep the current project
  unchanged. An existing JSON approval claim never skips this review.
- Confirm both names and costume-ID badges in **Clip Settings → Characters**;
  use the plate picker to inspect sheets/pose refs. The importer initially
  sequences pose refs if present, otherwise sheets. It does not synthesize
  motion. Swapping a plate must keep both costume IDs intact.
- Use **Save project** to obtain a portable `.motion.json` with embedded assets
  for further editing. Report the output directory, exact selection, review
  status, and what was actually verified.

No provider login, provider secrets, or generation calls belong inside HM FE.
Any sheet generation runs in the sibling skill's authorized external agent
environment. No new backend/API, `api.teqcon.uk`, `:8770`, voice/#41 work, n8n
generation/compose path, new Cap launch, or GO 30a is part of this skill.

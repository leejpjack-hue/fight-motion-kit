# Scene grammar, Wide picker, shot maps, clause export and camera chains · HM-PF-15/18/19/20/21/22

Step 4 uses [hm-cam-grammar-scene](../../skills/hm-cam-grammar-scene/SKILL.md)
to propose an editable scene sheet. Step 5 uses
[hm-cam-shot-author](../../skills/hm-cam-shot-author/SKILL.md) to turn it into a
per-beat preset map and reusable `Camera:` clauses. Both load the current
checkout's camera catalog and shared frontend authoring logic.

## Template provenance

Notion URLs, the box template path, fight-meta labels, and the ten beat
columns have one source of truth: the
[HM-PF-24 sync note](HM-PF-24-cam-grammar-sync.md).
Read that note before renaming or adding a grammar field. The Markdown export
keeps those labels, and `source_template` in the sheet JSON still carries the
template URL stored by the checkout. Historical `wide_*` examples absent from
this kit are rejected. No preset IDs or curves are added. Six existing generic
presets gain planning angle/move metadata only; rendered curves stay identical.

Each scene needs consecutive Intent → Action → Reaction triplets and at least
one Wide after a triplet. One planned full impact per triplet is the maximum.
Wide describes coverage; source plate framing must actually support it. Lens,
shot size and planned FX are prompting intent, not renderer controls. The sheet
preserves the source's one setup + one movement + explicit speed + stated purpose
camera-clause formula. Scene sides/geography require human visual review.

## Operator loop

1. Open the approved show or the existing camera-grammar starter sample. Review
   **2 Story · Jack GO gate → Approve**. Upstream Cantonese board authoring (#88)
   stays separate; these skills consume the existing PF-08 board format.
2. Open **Clip Settings → Camera motion → Scene camera grammar**. Choose
   **Export approved camera input**. The local file carries the current show,
   board and exact approval snapshot. Agents must not manufacture approval.
3. Give the scene intent and optional beat overrides to the grammar skill. Then
   run the shot-author helper, or import the grammar directly. See commands below.
4. Choose **Apply grammar / camera map**, select the local JSON and review the
   application summary. Unknown presets, mismatched beats and changed story
   content fail before edits. Timing, plates, FX and character locks are retained;
   mapped single-preset cameras replace old segments/chains. Camera overrides
   clear the selected beats' timing-pack camera ownership, as ordinary edits do.
5. Select a beat and edit its role, scene, triplet, shot size, action, lens,
   direction, speed, purpose or planned FX. Use the **Wide establish preset**
   picker (**＋ Insert Wide re-establish** or **Mark beat as Wide**) to insert a
   `Wide`-tagged atom or mark the selected clip in one click using the best
   available establish preset (`eye_orbit` for Wide re-establish, `low_rise` for
   opening Wide) without inventing `wide_*` curves. If a grammar scene has zero
   `Wide` beats, `HMComposeClient.lintShow` / `HMCameraAuthor.lintGrammar` emits a
   soft `scene_missing_wide` warning in Show JSON Lint and the grammar panel
   without blocking bake. The camera menu above overrides its
   preset. Angle/move and the generated clause follow the actual catalog choice.
   An old stored clause cannot override the camera. Different presets inside one
   Dual-segment beat require simplifying to one move before clause export; the
   ordinary preview/export continues to support dual segments.
6. Export grammar JSON, an editable Markdown beat sheet, or `Camera:` clauses in
   both text (`.camera-clauses.txt`) and JSON (`.camera-clauses.json`) for the
   prompting operator. Both formats follow `fight-prompting-enhancements-2026-11-01`
   REPORT conventions (`Camera: {shot_size} framing at {angle}, {lens_mm}; camera {move} {direction} at {speed}, to {purpose}.`),
   download locally with zero backend upload, and round-trip into
   `hm-cam-grammar-scene --design`, `hm-cam-shot-author --grammar`, and
   **Apply grammar / camera map** in HM. Save project retains `camera_authoring`
   provenance and per-atom `camera_grammar`. It carries no generated plates or new
   backend state. Undo restores a map, Wide insertion, or field edit. Rework blocks
   authoring until new approval; changed story labels/motion classes/FX require
   reviewing the story again.

```sh
node skills/hm-cam-grammar-scene/scripts/grammar.cjs \
  --board work/story.camera-input.json --design work/scene-design.json \
  --intent 'Readable attack, reaction and geography' \
  --out work/scene.grammar.json --markdown work/scene.grammar.md
node skills/hm-cam-shot-author/scripts/author.cjs \
  --grammar work/scene.grammar.json --out work/scene.camera-map.json \
  --clauses work/scene.camera-clauses.txt \
  --clauses-json work/scene.camera-clauses.json
```

An approved board already carrying roles can omit `--design`. Otherwise provide
role overrides keyed by the existing beat IDs; missing roles fail. The helpers
never add plates/beats or overwrite output files. The local output is a proposal
for human review, not an automatic n8n resume or an image-generation request.

## Legacy medium and tight shows

Open a show whose cameras are only medium or tight presets and that has no Wide beat and no Intent → Action → Reaction run. **Scene camera grammar** shows that gap. **Download original backup** saves the current show as `.grammar-upgrade-backup.json` and leaves the timeline alone. **Suggest grammar remap** lists a beat map that uses presets already in `camera_presets.json` (`low_rise`, `eye_hold`, `eye_push`, `pull_aftermath`, `eye_orbit`). Confirm downloads that backup, then replaces camera presets and grammar roles. Cancel keeps the current cameras. Plates, timing and FX stay. Undo restores the previous cameras. The remap does not run by itself, and it does not add preset ids.

## Join cameras across cuts

Shift-click adjacent timeline clips. The visible selection summary names the run;
a single selected clip defaults to itself and its next neighbor. The final clip
alone has no following neighbor, so chain actions are disabled.

**Chain from first camera** and **Chain + snap zoom** copy the first camera's
preset, nudge, intensity and framing across the run, then call the shipped
`chainClipCameras` / `reflowAllCamChains` hooks. This deliberately replaces the
other moves; the button help explains it before the edit. A common framing profile
prevents nudge/intensity offsets at the shared cut. The existing `u_range`,
`segments`, `chain`, `ease` and `snap_zoom` schema fields handle persistence.
No new curve/chain schema or second interpolation engine is introduced.

Snap zoom and Easing stay in Beat focus. Use easing on chain edits the whole run;
Unchain removes the existing linkage. Preview each cut and use Undo if the
result is unsuitable. Save project and reopen the `.motion.json` to retain it.

## Verification

```sh
npm test
npm run dev
node tests/camera-flow.browser.cjs
npm run test:browser
node skills/html-motion-composer/scripts/frame-qa.cjs lint \
  --repo . --show work/qa/camera-flow/authored.show.json --out work/qa/camera-frame
node skills/html-motion-composer/scripts/frame-qa.cjs peek \
  --repo . --show work/qa/camera-flow/authored.show.json --out work/qa/camera-frame
node skills/html-motion-composer/scripts/frame-qa.cjs claim --out work/qa/camera-frame
```

The focused browser flow exercises both real CLIs, File API import, preset and
clause overrides, Undo/redo, continuity across cut boundaries, snap zoom, portable
reopen in fresh storage, stale story/Rework rejection, mobile width and zero
backend calls. It writes synthetic approval/test artifacts under ignored `work/qa`;
these are automated fixtures, not human art approval. Frame-QA validates structure;
actual plate composition and screen-side continuity still need visual review.
The unchanged default sample remains exactly 5.00s with eight source plates.

# Scene grammar, shot maps and camera chains · HM-PF-15/18/19

Step 4 uses [hm-cam-grammar-scene](../../skills/hm-cam-grammar-scene/SKILL.md)
to propose an editable scene sheet. Step 5 uses
[hm-cam-shot-author](../../skills/hm-cam-shot-author/SKILL.md) to turn it into a
per-beat preset map and reusable `Camera:` clauses. Both load the current
checkout's camera catalog and shared frontend authoring logic.

## Template provenance

The authoritative field contract is the
[Fight Camera Grammar Template](https://app.notion.com/p/40b9565776c68154a978edfd92c62652),
read 2026-11-08, last edited 2026-11-01T11:46:06.416Z. Its Notion verification
state was unverified. The template's ten columns and fight-meta fields are
retained in the Markdown export; the original URL and field list travel in JSON.
The [related audit](https://app.notion.com/p/40b9565776c681e78bc0f8240988daba)
is contextual research. Historical `wide_*` examples absent from this kit are
rejected. No preset IDs or curves are added. Six existing generic presets gain
planning angle/move metadata only; rendered curves stay identical.

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
   direction, speed, purpose or planned FX. The camera menu above overrides its
   preset. Angle/move and the generated clause follow the actual catalog choice.
   An old stored clause cannot override the camera. Different presets inside one
   Dual-segment beat require simplifying to one move before clause export; the
   ordinary preview/export continues to support dual segments.
6. Export grammar JSON, an editable Markdown beat sheet, or `Camera:` clauses for
   the prompting operator. Save project retains `camera_authoring` provenance and
   per-atom `camera_grammar`. It carries no generated plates or new backend state.
   Undo restores a map or a field edit. Rework blocks authoring until new approval;
   changed story labels/motion classes/FX require reviewing the story again.

```sh
node skills/hm-cam-grammar-scene/scripts/grammar.cjs \
  --board work/story.camera-input.json --design work/scene-design.json \
  --intent 'Readable attack, reaction and geography' \
  --out work/scene.grammar.json --markdown work/scene.grammar.md
node skills/hm-cam-shot-author/scripts/author.cjs \
  --grammar work/scene.grammar.json --out work/scene.camera-map.json \
  --clauses work/scene.camera-clauses.txt
```

An approved board already carrying roles can omit `--design`. Otherwise provide
role overrides keyed by the existing beat IDs; missing roles fail. The helpers
never add plates/beats or overwrite output files. The local output is a proposal
for human review, not an automatic n8n resume or an image-generation request.

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

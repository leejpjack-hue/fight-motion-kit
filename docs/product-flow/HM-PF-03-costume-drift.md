# HM-PF-03 — Costume-sheet drift guard

Issue [#85](https://github.com/leejpjack-hue/fight-motion-kit/issues/85).
The operator compares externally prepared sheets against the approved locked
identity/costume references before the pack enters the composer. HM remains a
static frontend: no Sprite Forge, generation backend, or provider login.

## Operator path

1. Keep the earlier approved references, names, and costume IDs. Generate or
   revise candidate sheets outside HM with `hm-character-lock` / `prompt-sheets`.
2. Use [the drift checklist](../../skills/hm-character-lock/references/drift-review.md)
   to compare identity, costume, anatomy/proportions, and L/R assignment.
3. Include `cast.L.lock_refs` and `cast.R.lock_refs` as local `{ label, src }`
   arrays in the standalone `costume_lock` JSON, distinct from `sheets`.
   Select the JSON, candidate sheets, locked references, and optional pose
   images together in **Open project**. Embedded images are also supported.
4. HM shows each cast member's locked references alongside candidate sheets.
   Click an image to inspect it full size. Every check for **both** sides and
   the reviewer name are required. A rejection reason blocks approval.
5. If anything drifts or is uncertain, enter a specific reason and choose
   **Reject / cancel**. The editor shows the reject reason and preserves the
   current project. Re-run the operator skill outside HM and select the new
   local pack again; the checklist always starts empty.
6. **Approve sheets and import** records the human review and opens the editable
   pack. The separate replacement confirmation can still keep the current
   edit. If that edit changes while review is open, import is refused as stale.

Missing references, unselected local files, external URLs, unreadable images,
and using a candidate as its own reference fail closed. Existing approval
claims in incoming standalone JSON do not populate or bypass the checklist.
Raw `HMStudio.load/openProject/openReferenceB` costume-pack calls also refuse
to skip the review path. The normalizer remains a pure format converter, and
the shipped built-in example remains available with no generation calls.
Normalization marks new projects `import_review: "required"`; central project
opening refuses that marker too, so an automatic normalize-then-open path
cannot accidentally bypass review. A completed review changes it to `approved`;
the shipped sample is explicitly labeled `builtin-sample`, not a new human review.

## Evidence and gates

The portable project's `show.costume_lock.drift_review` contains reviewer,
timestamp, L/R checks, costume IDs, filenames, and a SHA-256 fingerprint of the
reviewed plan including selected image bytes. Reference images are retained
in `project.assets`, without adding them to the timeline. Save/reopen preserves
this record. It is a human attestation and audit fingerprint; it does not
authenticate the provider, perform automatic face recognition, or certify later
manual image edits. Replacement generations must use a fresh standalone pack
and repeat review.

This guards the fresh standalone pack import boundary. Opening an existing
portable `.motion.json` remains an edit/reopen operation, rather than a new
generation approval. This story does not introduce an automatic n8n resume or
change its Wait form: the operator hands the accepted/rejected review to the
existing step 1→2 human gate manually.

## Verification

- `npm test` includes the receipt/plan unit checks.
- Start `npm run dev`, then run
  `node tests/hm-pf-03-costume-drift.browser.cjs` for the actual File API path:
  missing refs, untrusted approval, incomplete checks, corrupt images, visible
  rejection, mobile layout, stale destination, clean re-import, and saved evidence.
- `node tests/hm-pf-01-costume-lock.browser.cjs` verifies the existing sample,
  plate swaps, and the reviewed standalone import path.
- `npm run test:browser` covers the editor regression suite.

Automated tests simulate a reviewer to check the gate's behavior; they do not
constitute Jack's visual approval of any new generated art.

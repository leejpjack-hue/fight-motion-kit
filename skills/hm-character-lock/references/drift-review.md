# Costume sheet drift check (HM-PF-03 / #85)

Before importing newly prepared sheets, compare every candidate with the
earlier **approved identity/costume references**, not with itself or another
unreviewed generation. Keep both sets locally. This is an operator visual
review; HM does not provide automatic face recognition or generation QA.

For each side (`L` and `R`), check:

| Check | Compare candidate sheet with locked references |
| --- | --- |
| Identity | Face, hair, silhouette, and recognisable identity details. |
| Costume | Garment shape, colors, footwear, accessories, and the unchanged costume ID. |
| Geometry | Body proportions, hands, limbs, and unwanted extra/missing details. |
| Side assignment | Correct cast name, costume ID, and screen side; no identity swap. |

If any item drifts or cannot be judged, **Reject** and record a specific reason,
for example “R: jacket changed from crimson to black” or “L: missing reference,
cannot verify face”. Missing evidence is not a pass. Do not mark a draft outfit
as locked or invent an approval from Jack.

The local manifest adds `cast.L.lock_refs` and `cast.R.lock_refs`, each an array
of `{ "label": "Earlier approved outfit", "src": "L-reference.png" }` entries.
`sheets` remains the candidate array used by the existing importer. Use safe
local paths with unique basenames; select all sheets and reference images
alongside the JSON. `pose_refs` remains optional image plates and does not
replace this identity/costume evidence. A pose image can also be a lock reference
only when it is an earlier approved identity/costume source.

The File API importer opens the comparison **before replacing the current
project**. Both sides need every checkbox checked and a named reviewer, with no
rejection reason outstanding. Missing/invalid images, self-comparison, Cancel,
and unchecked items block import with a visible reason. An `Approve` claim
inside an incoming standalone JSON never pre-checks or bypasses this gate.
Directly opening a raw costume pack through `HMStudio.load/openProject` also
refuses it and directs the caller to this review path. The pure normalizer is a
format converter, not an approval operation: it marks the generated project
`import_review: "required"`, which also refuses an unreviewed automatic open.

After approval, the saved portable project contains
`show.costume_lock.drift_review`: reviewer, time, explicit checks for both sides,
costume IDs, filenames, and a SHA-256 fingerprint of the compared plan including
the actual selected image data. Locked reference bytes are retained in
`project.assets`. This is a record of human review, not provider authentication
or a guarantee against later manual edits. The existing built-in sample and
saved-project editing remain available; they do not generate or approve new
sheets. Use a new standalone pack and review again for replacement generations.

For rework: retain the rejected output and reason, rerun `prompt-sheets` through
`hm-character-lock` **outside HM**, keep the same approved lock references, then
select the new local JSON + images again. Every standalone import starts with
an empty checklist. No Sprite Forge, provider login, generation backend, new
Cap launch, or automatic n8n resume is added. The operator passes the human
decision to the existing step 1→2 Wait gate manually.

# Local costume-lock handoff

HM-PF-02 emits the standalone pack already consumed by
[`normalizeCostumeLockPack`](../../../public/ui/costume-lock.js) and documented
in [HM-PF-01](../../../docs/product-flow/HM-PF-01-costume-lock-pack.md). Do not
introduce a second importer, provider session, or pose schema.

## Canonical fields

Use [the example JSON](../examples/costume_lock.json) as the structural starting
point, replacing the example identity, lock IDs, and image references with the
actual cast. The copy recipe below is specifically a shipped-asset smoke demo.

| Field | Meaning |
| --- | --- |
| `kind`, `version` | `"costume_lock"`, `1`. |
| `pack_id` | Stable local pack ID, lowercase ASCII letters/digits/hyphens/underscores. Use a new ID for an intentional new pack revision. |
| `title`, `venue` | Human-readable title and existing venue, such as `street`. |
| `cast.L`, `cast.R` | Screen-side assignments, each with nonempty `name` and `costume_id`. Preserve supplied lock IDs. |
| `cast.<side>.sheets` | One or more real local sheet images per side for this skill's completed output. The importer itself permits any one sheet/pose image across the pack; this skill intentionally promises a sheet for each cast member. |
| `cast.<side>.lock_refs` | Earlier approved identity/costume reference images as `{ label, src }`. Required for each side by HM-PF-03's File API review; candidate sheet bytes cannot be their own reference. |
| `cast.<side>.pose_refs` | Optional actual local image plates. JSON joint coordinates are not an image and must not be placed here. |
| Image entry | Unique `id`, readable `label`, local `src`. Optional `duration_s` must be at least `0.1`; the importer defaults to `0.625`. |

Use flat, unique filenames in the output directory so Jack can select the JSON
and images together. The importer resolves companion files by path or basename;
`L-sheet.png` and `R-sheet.png` avoid ambiguity from two files named `sheet.png`.
Local paths accept ASCII letters, digits, `_`, `.`, `/`, and `-`; exclude
spaces, `..`, backslashes, external URLs, and protocol-relative paths. Prefer
PNG, JPG/JPEG, or WebP. Actual supported base64 image data may also be embedded
in `assets`, but companion files keep this workflow directly editable.

No absolute agent filesystem path or remote generation URL makes a file
available to the browser. Do not point `src` at `cast-brief.md`, `prompts.md`, a
pose JSON, a missing future image, or an image from another unselected folder.

Extra authoring fields are not guaranteed to survive normalization: keep the
editable textual costume details and sibling provenance in `cast-brief.md` and
`prompts.md`, and retain those beside the saved `.motion.json`.

## Reproduce a local example without generation

Run from the checkout root. This uses existing HM-PF-01 demo assets with their
existing lock IDs, and does not claim newly generated or human-approved sheets.
Choose a fresh output directory; `mkdir` intentionally refuses an existing one.

```sh
mkdir -p work/character-lock
mkdir work/character-lock/daiyu-wang-example
cp skills/hm-character-lock/examples/costume_lock.json work/character-lock/daiyu-wang-example/costume_lock.json
cp public/assets/daiyu-wang-continuation/P09.png work/character-lock/daiyu-wang-example/L-sheet.png
cp public/assets/daiyu-wang-continuation/P10.png work/character-lock/daiyu-wang-example/R-sheet.png
cp public/assets/daiyu-wang-eight/P01.png work/character-lock/daiyu-wang-example/L-guard.png
cp public/assets/daiyu-wang-eight/P02.png work/character-lock/daiyu-wang-example/R-guard.png
```

For a real skill run, also write the brief, prompts/provenance, and handoff
specified in [SKILL.md](../SKILL.md). This recipe only materializes the example's
five import files; it is not a substitute for reviewing a new cast.

## Local contract check

This check reads the actual files, verifies both cast sheets and unique plate
IDs, then runs the shipped normalizer with the same data-URL mapping used by
File API import. It checks packaging, not visual quality or human approval.
Run from the checkout root; change `packDir` for your own output.

```sh
node <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('./public/ui/compose-client.js');
require('./public/ui/costume-lock.js');
const packDir = 'work/character-lock/daiyu-wang-example';
const pack = JSON.parse(fs.readFileSync(path.join(packDir, 'costume_lock.json'), 'utf8'));
assert.equal(pack.kind, 'costume_lock');
assert.equal(pack.version, 1);
const localFiles = Object.create(null);
const ids = new Set();
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
for (const side of ['L', 'R']) {
  const cast = pack.cast[side];
  assert.ok(cast.name.trim() && cast.costume_id.trim(), `Missing ${side} identity/lock`);
  assert.ok(cast.sheets.length > 0, `Missing ${side} sheet`);
  assert.ok(cast.lock_refs.length > 0, `Missing ${side} locked references`);
  for (const ref of [...cast.sheets, ...(cast.pose_refs || []), ...cast.lock_refs]) {
    assert.match(ref.src, /^[A-Za-z0-9_-]+\.(png|jpe?g|webp)$/i);
    if (!cast.lock_refs.includes(ref)) {
      assert.ok(ref.id && !ids.has(ref.id), `Missing or duplicate plate id: ${ref.id}`);
      ids.add(ref.id);
    }
    const bytes = fs.readFileSync(path.join(packDir, ref.src));
    assert.ok(bytes.length > 0, `Empty image: ${ref.src}`);
    localFiles[ref.src] = `data:${mime[path.extname(ref.src).toLowerCase()]};base64,${bytes.toString('base64')}`;
  }
}
const project = HMComposeClient.normalizeCostumeLockPack(pack, { localFiles });
require('./public/ui/costume-drift.js');
HMCostumeDrift.plan(pack, localFiles);
assert.equal(HMComposeClient.parityDirtyChecklist(project).clean, true);
for (const media of project.media) assert.ok(project.assets[media.src]);
console.log(`Ready for human review: ${project.media.length} local images; L=${project.show.chars.L.costume_id}; R=${project.show.chars.R.costume_id}`);
NODE
```

Then start `npm run dev` and open `http://127.0.0.1:8765/ui/`. In **Open
project**, select only `costume_lock.json`, `L-sheet.png`, `R-sheet.png`,
`L-guard.png`, and `R-guard.png` together. The example should show two
sheet/reference comparison groups first. Complete the human drift review
with a reviewer name before the pack is imported. Rejection keeps the open
project unchanged. See [the checklist](drift-review.md). After approval it shows two costume
badges, four library images, and two pose-ref clips totaling 1.25 seconds.
Swap a plate, verify both lock IDs remain, then **Save project** and reopen
the portable `.motion.json` without needing the companion selection again.

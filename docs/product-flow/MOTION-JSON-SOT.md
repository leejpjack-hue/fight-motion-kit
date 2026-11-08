# `.motion.json` source of truth (HM-PF-44)

Any step in the HTML Motion composer edits one project. **Save project** downloads that project as `<show_id>.motion.json`. **Open project** loads the file back. Compose bakes that same show in the browser. An n8n gate resumes from this file. n8n still has no compose or save API. See [`DUAL-PATH-CONTRACT.md`](DUAL-PATH-CONTRACT.md).

## One object

| Step | Edit | Fields on `project.show` |
|---|---|---|
| 1 Character | Plate chosen in the media library | `atoms[i].hero.plates`, `plates_needed` |
| 5 Per-atom cam | Camera preset, nudge, intensity | `atoms[i].camera` |
| 9 Compose | Clip length and FX, then in-browser bake | `atoms[i].duration_s`, `timing_hold` when set, `atoms[i].fx_hooks` |

`public/ui/motion-sot.js` is the shared read/write for that object. The composer still edits through its existing controls. Download and reopen use `serialize` / `asPortableProject`. Bake uses `compose-client.js` on `project.show`.

Round-trip covers cam, timing, FX, and plates. Layouts, media, and embedded images travel in the file.

## Two persists

| Copy | Where | What it holds |
|---|---|---|
| localStorage draft | `html-motion-composer:draft:<show_id>` | `{ts, show, scrub}` on each edit and on Save project. Same key and payload shape as the kit autosave. |
| File | Download `<show_id>.motion.json` | Portable project: `show`, `layouts`, `media`, `assets`. Reopen with Open project. |

The on-device snapshot stays IndexedDB `html-motion-studio` / object store `projects` / key `active` (HM-COMPOSE-07, `public/ui/fe-store.js` and `public/ui/asset-store.js`).

Pin and recent keys stay `hm.composer.pinPlatePack` and `hm.composer.recentPlatePack`. This story keeps those names.

## Server

Save, draft, and compose run in the browser. Workers `/api/*` write routes stay the unused HM-COMPOSE-07 stubs. The product path does not call `api.teqcon.uk` or VPS `:8770`.

## Lint after edit

HM-HF-03 still lists findings after an edit cycle. Findings stay soft (`blocksBake: false`). Compose still runs.

## Shipped demo

`public/shows/daiyu-wang-five-seconds.json` stays the 5.00s eight-plate demo. The edit loop copies it into the open project. It does not rewrite that file.

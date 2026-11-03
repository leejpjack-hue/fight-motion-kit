# HM-HF-07 Timeline JSON Inspector

The composer Timeline JSON drawer lists the current show’s atoms with absolute times, camera preset, FX hooks, and plate keys. Copy JSON puts that slice on the clipboard. A read-only diff compares it with the last explicit save, or says `no prior save`. The drawer does not write the show.

## Dump shape

Copy JSON writes this object (pretty-printed). It is the atoms slice, not the portable project and not the media library.

| Field | Source |
| --- | --- |
| `show_id` | `project.show.show_id` |
| `clock` | `"prefix-sum duration_s"` |
| `atom_count` | number of atoms |
| `duration_s` | sum of `duration_s` (same number as the last `abs_end`) |
| `atoms[].index` | 0-based position |
| `atoms[].id` | `atom.id` |
| `atoms[].abs_start` / `abs_end` | scrub clock, below |
| `atoms[].camera_preset` | `camera.preset`, or a string preset, or `segments[].preset` joined with `+` when there is no preset |
| `atoms[].fx_hooks` | hook `type` (or `id`, or the string itself) |
| `atoms[].plate_keys` | `hero.plates` |

Example from `daiyu-wang-five-seconds` beat 01: `abs_start` 0, `abs_end` 0.5, `camera_preset` `static_hold`, `fx_hooks` `["shake"]`, `plate_keys` `["P01"]`.

## Absolute times

One clock. `abs_start` of atom `i` is the sum of `duration_s` before it. `abs_end` is that sum plus this atom’s `duration_s`.

That is the same prefix sum the preview uses:

- `public/ui/app.js` `startOf(index)`, and `renderStageAt`’s `atomWindow` `[t0, t1]`
- `kit/ui` `atomBounds()` `t0` / `t1`
- composed `timeline.atoms[].t0` / `t1` on this tip (checked equal on the five-second show)

The drawer re-renders from that clock whenever the timeline renders (selection, reorder, duration, camera, FX, plates). Refresh reads the same clock again. It does not keep a second timer.

## Copy JSON

`Copy JSON` writes `JSON.stringify(dump, null, 2)`. Success sets the status to `Copied timeline JSON`. An empty show still copies `{ "atom_count": 0, "atoms": [] }` and the status is `Copied timeline JSON (empty show)`. A blocked clipboard leaves the text in a read-only box and does not change the show.

## Diff

Read-only. Compared fields: time (`abs_start` / `abs_end`), `camera_preset`, `fx_hooks`, `plate_keys`, and index. Rows match on atom id.

| Status line | When |
| --- | --- |
| `no prior save` | no snapshot for this `show_id` |
| `Matches last save` | snapshot atoms dump equal to the current dump |
| `Changed vs last save · …` | ids whose time, camera, FX, plates, or index differ, plus added and removed ids |

The snapshot is `localStorage` key `html-motion-composer:timeline-save:<show_id>`, written by the existing Save action (composer **Save project**, kit **Save**). It stores `show_id` and `atoms` only. If that key is missing, the drawer falls back to `HMFeStore.getLocalShow` (the tip’s local show save). Neither path is an autosave of the live draft, so opening a show that was never saved stays `no prior save`.

There is no Apply control. Diff and copy do not call `edit`, `putLocalShow` from the drawer, or replace `show.atoms`.

## Sync

Live with the timeline render. The selected clip’s row is marked. Refresh is the same read, for when you want to pull the save snapshot again without editing.

## Where it sits

`public/ui` opens the drawer from the timeline **JSON** button, under the timeline (next to Show JSON Lint). `kit/ui` shows the same read-only group in the side inspector. Both call `timeline-json.js`.

## Proof

Browser checks against `http://127.0.0.1:8765/ui/` on the five-second show:

- Eight atoms list abs start/end, `static_hold`, FX (`shake` or `none`), and plates `P01`–`P08`. Clip 02 is the selected row. Status is `no prior save`.
- Copy JSON status is `Copied timeline JSON`. The clipboard payload matches the dump above. Atoms are unchanged.
- After a local snapshot whose beat 01 camera is `slow_push` and FX is `hit_pink`, the drawer still shows the live `static_hold` / `shake` row and the diff line `Changed vs last save · beat-01 (camera_preset, fx_hooks)`.
- A blank project copies an empty atoms array and still reports `no prior save`.

Capscreens in this folder: `drawer-atoms.png`, `copy-json.png`, `drawer-diff.png`, `empty-copy.png`.

`npm test` covers the clock, the copy payload, the empty show, bad/missing saves, and the read-only diff. The same drawer checks are in `tests/editor.cjs`.

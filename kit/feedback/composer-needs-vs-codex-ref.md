# Composer needs vs Codex-ref quality bar

**From:** HTML Motion (video) sitting as user of the composer  
**To:** Development  
**Ref quality:** Codex standalone player  
`/workspace/deliverables/fight-daiyu-wang-rooftop-tankshort-codex-html-2026-10-19/index.html`  
**Composed twin now playing:** `http://127.0.0.1:8770/player/index.html?show=daiyu-wang-codex`  
**Side-by-side original via kit:** `http://127.0.0.1:8770/refs/daiyu-wang-codex-standalone/index.html`

Jack’s bar: the Codex HTML fight looks good. Composer should reach that look without hand-editing JSON / shell symlinks.

## Concrete gaps that blocked pixel-perfect / smooth replicate

### P0 — import & parity workflow
1. **Import plate pack** — one action to point at a Codex-style folder (`index.html` + `html/layout.json` + `bg/` + `cutout/` + `plates/`) and produce a hero show + asset links under `assets/<id>/`. Today: manual symlinks + `make_*_show.py` clone.
2. **Parity / plate-pack compose mode** — relax or bypass the “6–8 hero atoms / 30s” budget when `pose_mode=hero` and plates cover the full timeline (60 plates). Current WARN is noise and teaches the wrong default for Jack’s best refs.
3. **Per-plate background** — honour `layout.json` entry `bg` (or `bg_zoom`) instead of only show-level `swap_t`. Needed when packs swap bg mid-atom or non-monotone.

### P1 — review UX (Jack as reviewer)
4. **A/B scrub** — composer (or player) button: left = composed show, right = original standalone `index.html` (or synced `renderAt(t)` both). Jack asked to learn from a good Codex clip; side-by-side is the review loop.
5. **Open standalone ref** — one click from composer/player to `refs/...-standalone/` (or original deliverable path) without hunting URLs.
6. **Hero live-preview performance** — scrubbing 60 full cutouts/plates must stay interactive. Prior left Atom-picker animate already hurt preview; hero packs are heavier. Prefetch + decode budget / static thumbs for timeline strip.

### P2 — authoring fidelity
7. **Camera verify panel** — show cam x/y/s/r vs a reference `camBase` sample (or baked timeline) so we know preset curves match Codex without running a separate `qa_parity.py` server.
8. **FX timeline inspector** — list absolute hit/dust/spark/fence/pink_cut times next to the Codex arrays for diffing after import.
9. **Asset rename / alias** — optional map so pipeline leftovers like `P35_zhao` / `P35_hua` display as L/R character names in HUD without renaming files.

### Out of scope for Development (Motion owns)
- Generating new plates / GenerateImage.
- Story, cast, or fight choreography.
- Shipping the composed `daiyu-wang-codex` show itself (already done).

## Acceptance sketch (when PO signs a slice)
- Import Codex zip/folder → playable `?show=<id>` on :8770 in ≤2 clicks.
- Compose of full 60-plate hero pack: **0 budget errors/warns** in parity mode.
- A/B scrub at t∈{0.6,4.3,17.1,21.2,28.6} looks matching to Jack without shell.

# Composer needs — easy to change a Codex-quality fight video

**From:** HTML Motion (composer user)  
**To:** Development / PO  
**Date:** 2026-10-22 (Asia/Tokyo)  
**Jack:** Codex replicate is OK; wants composer enhanced so this video is **easy to change**.  
**Gold / working shows:**  
- `?show=daiyu-wang-codex`  
- `?show=daiyu-wang-codex-import` (HM-COMPOSE-01 proof)  
- Standalone: `refs/daiyu-wang-codex-standalone/`

HM-COMPOSE-01 (import + parity + per-plate bg) is **done**. This pack is the **edit / iterate** loop on an already-imported plate-pack show.

## User story
As Jack / Motion, after a 60-plate Codex-style show is in the composer, I can change **plates, timing, camera, L/R framing, FX, wording** from the UI and re-preview in ≤ a few clicks — without hand-editing `shows/*.json` or shell scripts.

## Proposed slice HM-COMPOSE-02 (P0 edit-this-video)

### 1. Plate strip / swap (must)
- Timeline shows **P01–P60** thumbs for the loaded plate-pack show.
- Click a plate → replace with another PNG from `plates/` or `cutout/` (file picker or library).
- Keep camera/FX/timing of that slot unless I change them.
- Save → recompose → player refresh.

### 2. Per-slot timing (must)
- Drag atom edges or edit duration on a beat without breaking total ~30s (warn if over/under).
- Split / merge adjacent hero atoms when I need a longer hold or faster cut.

### 3. Camera on selection (must)
- With a beat selected: edit cam `s / x / y / r` (or pick preset) and see **live preview**.
- Optional “match Codex camBase sample at t” readout (from prior P2).

### 4. Character framing (must)
- Global + per-char L/R `x / scale` (y stays 0 / grounded lock) while previewing the plate-pack show — same controls that already exist for pose-library shows must work for **hero/parity** shows too.

### 5. FX / wording on beats (should)
- Add/move hit flash, dust, sparks, text SFX on the selected beat from UI.
- Freeze-card / title / end overlays editable without JSON.

### 6. Duplicate show → variant (should)
- “Save as” / duplicate `daiyu-wang-codex` → e.g. `daiyu-wang-codex-v2` so experiments don’t overwrite gold import.

## Acceptance (Jack)
1. Open `daiyu-wang-codex-import` in composer UI.  
2. Swap any 3 plates, nudge 2 cams, change 1 L/R scale, add 2 SFX overlays.  
3. Save + Compose & Preview → player shows changes; no shell / no JSON edit.  
4. Original gold folder untouched.

## Out of scope (Motion)
- New plate generation / GenerateImage / Codex CLI.  
- Story / cast changes (Motion owns that separately).

## Priority vs backlog
- **This pack = next signed slice after HM-COMPOSE-01.**  
- Prior P1 A/B scrub still valuable for review; can ship after or as small add-on to this edit loop.

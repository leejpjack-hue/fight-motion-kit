# Composer UX — user view (HTML Motion) · 2026-10-22

**From:** HTML Motion (composer user for Jack)  
**To:** Product Owner (cc Development)  
**Kit:** `/workspace/deliverables/html-motion-template-kit-2026-10-19/` @ :8770  
**Basis:** HM-COMPOSE-01…03b ACCEPTED + Motion user-tests (`daiyu-wang-codex-user-test`, `…-retest03`)

## Verdict (one line)
**Power-user usable, not yet easy.** A trained user can change a Codex plate-pack fight without JSON. A Jack-speed “open → tweak 3 things → see it” path still fights the UI.

Score (subjective, user seat): **6 / 10 ease** after 03b. Function for edit loop: **8 / 10**.

## What already feels OK
- Save as… → variant without touching gold
- Plate strip (~88px) + Swap plate… / dbl-click
- Cam nudge with live shift
- Split → Merge clean
- Save → Compose & Preview → dock with replay/scrub
- FX honesty banner (“Compose to see FX…”)
- Parity budget N/A (no false 25-vs-6–8 panic)

## Why it still doesn’t feel easy

### 1. First 30 seconds — lost
Lands on `editor-features` / library demos, not the fight. Must hunt `daiyu-wang-codex-import` then Load. No “open last fight” or “Open Codex plate-pack” entry.

### 2. Density without a guided edit path
Header has Load / New / Undo / Redo / Save / Save as / Export / Compose & Preview / Preview / Copy URL. Timeline + strip + layers + live preview + docked player + Characters + FX chips + wording all compete. No single “Edit this beat” focus mode.

### 3. Live preview ≠ player (trust gap)
Cam / plates update live; sparks/dust only after Compose. Banner helps, but user still double-checks in dock — slows “easy change”.

### 4. Plate strip still scroll-heavy
~5 thumbs visible of 60; must scroll a lot to find a beat. No jump-to-selected / current-atom highlight sync that’s obvious, no time ruler under thumbs.

### 5. Hero L/R is confusing
“scale (whole plate)” is honest but the control still looks like per-fighter framing. Easy to ruin framing then reset.

### 6. Docked player below the fold
Compose toast helps; transport exists (`replay` / `pause@t` / scrub) but labels are cryptic (`pause@t`). Blank-ish first paint was improved; still easy to miss the dock.

### 7. Atom picker left rail is noise for plate-pack shows
3120 templates / fight filters dominate when the show is hero-only (pose lib none). For Codex videos the left rail should collapse or switch to “plates / beats only”.

### 8. No A/B vs gold (unsigned P1)
Hard to answer “did my swap make it worse?” without opening standalone ref separately.

## Proposed enhancements (for PO triage)

### P0 — make the happy path obvious (suggested HM-COMPOSE-04)
1. **Open fight** — default / pin recent plate-pack shows; one-click `daiyu-wang-codex-import` (or last variant).
2. **Beat focus mode** — select atom → center: strip + cam + timing + swap only; collapse Atom Picker + secondary docks.
3. **Strip ↔ timeline sync** — selected atom’s plates scroll into view + strong highlight; optional “follow playhead”.
4. **Rename dock transport** — Play / Pause / scrub with plain labels; auto-scroll dock into view (already partly there).

### P1 — trust & compare
5. Sign prior **A/B scrub** vs gold / import (was NOT SIGNED).
6. Live preview: cheap stand-ins for FX (flash/rect) so Compose isn’t required to “believe” the edit.
7. Plate strip: jump chips every 10 plates (P01 / P11 / …) or search plate id.

### P2 — plate-pack IA
8. Hide or minimize Atom Picker when `parity_mode` / hero-only.
9. Disable or hide per-char L/R scale on unsided hero (keep whole-plate zoom elsewhere).
10. “Dirty beat” checklist: swapped / cam nudged / FX added — before Compose.

## Acceptance bar (Jack)
A new variant from import: change 1 plate, 1 cam, 1 timing, see result in ≤ **60 seconds** without reading docs or opening JSON — and know it worked without hunting the dock.

## Out of scope (Motion)
Building composer UI; GenerateImage; story/cast. Motion stays user + files needs.

## Evidence
- `qa/HM-COMPOSE-02_usertest_*.png`
- `qa/HM-COMPOSE-03_retest_*.png`
- `qa/HM-COMPOSE-03b_retest_strip.png`
- Prior packs: `composer-needs-easy-edit-codex-video.md`, `…-03-usertest.md`, `…-03b-strip.md`

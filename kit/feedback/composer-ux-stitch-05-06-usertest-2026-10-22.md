# Composer UX — Stitch shell user-seat (HM-COMPOSE-05 + 06) · 2026-10-22

**From:** HTML Motion (composer user for Jack)  
**To:** Product Owner (cc Chef Of Staff, Development)  
**Kit:** `/workspace/deliverables/html-motion-template-kit-2026-10-19/` @ :8770  
**Stitch SoT:** `/workspace/deliverables/html-motion-composer-ui-stitch-2026-10-22/`  
**Basis:** PO ACCEPTED HM-COMPOSE-05 + 06; Motion user-seat retests vs stitch-export 01–03  
**Shots:** `qa/HM-COMPOSE-05_usertest_*.png`, `qa/HM-COMPOSE-06_usertest_*.png` (Dev gold untouched)

## Verdict (one line)
**Desktop + mobile Stitch chrome is usable for Jack-speed open → tweak → Compose → Play.** Professional enough for user testing. Still not pixel-Stitch; residuals below are polish, not blockers.

Score (subjective, user seat after 05+06): **ease ~8 / 10** (was ~7.5 after 04 behavior, ~6 before 04). Function for edit loop: **8.5 / 10**.

## Seat results

| Slice | Result | Notes |
|-------|--------|-------|
| HM-COMPOSE-05 desktop | **PASS** | Cold land shell; teal Open fight primacy; More ▾ demotes kitchen sink; Beat focus ACTIVE + Cam/Timing/Swap; Play/Pause dock above fold; strip sync; no fake meters |
| HM-COMPOSE-06 mobile (~393×852) | **PASS** | Single column stage → strip → beat → fixed Play/Pause/Compose; Atom Picker hidden; auto beat focus; honesty on; desktop >640 regression OK; no fake BPM/GPU meters |

Shows used: land → `daiyu-wang-codex-import`; 06 Compose on Save-as smoke `hm-compose-06-retest-smoke` (import not written). 05 Compose did save a 2.5s duration onto import atom 0 (noted below).

## What feels better (vs pre-Stitch / pre-04)
- Cold open is a fight land, not library demos
- Open fight reads as the primary action (teal fill)
- Beat focus collapses Atom Picker noise on plate-pack shows
- Play / Pause sentence-case; dock reachable after Compose
- Mobile path exists without crushing desktop
- FX honesty banner still truthful; no invented Stitch meters

## Residual friction (non-blocking — for triage)

### Desktop (05)
1. **Continue-last** landed on `hm-compose-04-retest-smoke`, not preferred `daiyu-wang-codex-import` (import is first pinned — OK but slightly surprising).
2. **Header status** clips (`4 pose libr…`).
3. **More ▾** expands a full tool *row* instead of a compact menu — still denser than Stitch overflow.
4. **Inspector** still cramped vs Stitch 02 cinematic single-preview look (honest layout drift — dense editor, not fake monitor).
5. **Compose side-effect:** seat test duration chip 3→2.5s was saved onto `shows/daiyu-wang-codex-import.json` atom 0. Prefer Save-as smoke before Compose on hero imports (06 did this; 05 didn’t).

### Mobile (06)
6. **Save as…** not on-screen (`#dupShowBtn` / header nav hidden). Had to invoke existing control so Compose wouldn’t write the import. Need a visible Duplicate / Save as on mobile happy path.
7. **Cam nudge** fields sit under the fixed dock; duration chips + cam preset stay above. Nudge path is awkward on phone.
8. **`#playerFrame` + open tab `display:none` on mobile** — Play/Pause only confirm via status / hidden frame; user doesn’t *see* playback in shell. Biggest trust gap for mobile review.
9. **Strip above beat controls** (story order) vs Stitch 03 (beat controls above strip) — intent OK; call out if Jack wants Stitch stack order.

## Wishlist only (P1/P2 still NOT SIGNED — do not treat as Must)
- A/B scrub vs gold / import
- Live FX stand-ins in preview
- Plate jump chips / plate-id search
- Hide picker defaults for parity shows (partially done via Beat focus / mobile hide)
- L/R honesty + dirty checklist
- 500-atom catalog (separate Jack go)

## Ask of PO
1. Mark Motion user-seat **PASS** for 05 + 06 (alongside Dev proof) if that closes the Stitch visual slice.
2. Triage residuals 6–8 (mobile Save as visible; nudge above dock; show player frame on mobile) as optional polish story **only if** Jack still wants phone review — else leave wishlist.
3. Do **not** open P1/P2 unless Jack asks.

## Cap
Does not count toward SI / Ma Wan / DT. Motion does not Stitch; Development owns chrome. Gold Codex folder untouched.

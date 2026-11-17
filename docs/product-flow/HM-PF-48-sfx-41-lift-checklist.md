# HM-PF-48 — SFX #41 Lift Criteria Checklist (#227)

Issue [#227](https://github.com/leejpjack-hue/fight-motion-kit/issues/227).
Context: [`HM-SFX-SAME-CLOCK.md`](HM-SFX-SAME-CLOCK.md) · [`HM-PF-47-voice-track-skill-shell.md`](HM-PF-47-voice-track-skill-shell.md) · Shipped on tip `35ee259` (accepted by Jack 16 Nov 2026).

> **Post-ship record & residual check**: #41 (opt-in clash SFX on the shared `renderAt` clock) is already **shipped** in `public/ui/clash-sfx-clock.js` and `scripts/clash-sfx-clock.cjs`. This checklist documents the rights, quality, and FE-only constraints and audits the shipped code honestly. It does not un-ship #41 or add a new SFX backend.

## 1. Lift Criteria (Rights, Quality, FE-Only Constraints)

| # | Category | Criterion |
|---|---|---|
| C1 | FE-only / Local | Zero network audio fetches, zero cloud audio/TTS APIs, and zero remote HTTP compose/save audio backends. |
| C2 | Rights / Provenance | No third-party copyrighted soundbank assets embedded; local WebAudio transient synthesis or operator-supplied local audio only. |
| C3 | Clock / Determinism | Clash SFX cues bind directly to `renderAt` (`HMStudio.renderAt`) timeline beat peaks (`fx_hooks` `t_rel` or beat midpoint). |
| C4 | Default Silence | Default path stays silent (`enabled: false`; `#clashSfxToggle` unchecked by default; STREET and picture-only exports emit zero audio by default). |
| C5 | Pre-Hero Silence | Timeline samples before `hero_beat_t0` emit zero amplitude (`amplitude: 0`, `silent: true`, exact zero PCM bytes before `hero_beat_t0`). |
| C6 | Quality / Honesty | No fabricated broadcast loudness claims (no `-14 LUFS` normalization claim without an actual ITU-R BS.1770 meter). |
| C7 | Boundary with Voice | Clash SFX stays distinct from full Step 10 VO/voice tracks (`HM-PF-47` / `skills/hm-voice-track/SKILL.md`). |

## 2. Post-Ship Audit Against Tip `35ee259`

Evidence inspected in [`public/ui/clash-sfx-clock.js`](../../public/ui/clash-sfx-clock.js), [`scripts/clash-sfx-clock.cjs`](../../scripts/clash-sfx-clock.cjs), [`docs/product-flow/HM-SFX-SAME-CLOCK.md`](HM-SFX-SAME-CLOCK.md), [`public/ui/exports.js`](../../public/ui/exports.js), and [`tests/hm-38-40-41-106.test.cjs`](../../tests/hm-38-40-41-106.test.cjs):

| Criterion | Status | Observed Evidence (Tip `35ee259`) |
|---|---|---|
| C1 · FE-only / Local | **PASS** | `public/ui/clash-sfx-clock.js` uses local WebAudio oscillator/noise buffer synthesis only; `scripts/clash-sfx-clock.cjs` writes local PCM RIFF/WAVE bytes; zero `fetch` / HTTP backend calls. |
| C2 · Rights / Provenance | **PASS** | All synthesis is procedural PCM (`Math.sin` + decaying envelope in `clash-sfx-clock.js` / `clash-sfx-clock.cjs`); no external WAV/MP3 sample library bundles exist in `public/`. |
| C3 · Clock / Determinism | **PASS** | `HMClashSfxClock.buildCuePlan` reads atom `t0`, `duration_s`, and `fx_hooks` (`t_rel`) on the `renderAt` clock; verified in `tests/hm-38-40-41-106.test.cjs` (`clock === 'renderAt'`). |
| C4 · Default Silence | **PASS** | `buildCuePlan(show)` defaults `opts.enabled` to `false`; `#clashSfxToggle` in `public/ui/index.html` is unchecked by default (`Silent default (opt-in)`). |
| C5 · Pre-Hero Silence | **PASS** | `sampleAt` checks `t < plan.hero_beat_t0` returning `{ silent: true, amplitude: 0 }`; `synthesizePlanPcm` emits exact `0` PCM frames before `hero_beat_t0` (tested in `tests/hm-38-40-41-106.test.cjs`). |
| C6 · Quality / Honesty | **PASS** | `docs/product-flow/HM-SFX-SAME-CLOCK.md` explicitly states "no `-14 LUFS` loudness QA claims." |
| C7 · Boundary with Voice | **RESIDUAL GAP** | Voice/VO (`HM-PF-47`) remains external / `DESIGNED-HOLD` (`skills/hm-voice-track/SKILL.md`), and standalone Playable HTML (`exports.js` `standalonePlayer`) stays picture-only (operator uses `scripts/clash-sfx-clock.cjs` + external mux for offline video soundtracks). No action needed unless a standalone Playable HTML audio opt-in is later signed. |

## 3. Approval & Follow-Up Links

- Shipped clash SFX contract: [`docs/product-flow/HM-SFX-SAME-CLOCK.md`](HM-SFX-SAME-CLOCK.md)
- Voice track skill shell (separate Step 10 boundary): [`docs/product-flow/HM-PF-47-voice-track-skill-shell.md`](HM-PF-47-voice-track-skill-shell.md) · [`skills/hm-voice-track/SKILL.md`](../../skills/hm-voice-track/SKILL.md)
- Unit test verification: `tests/hm-38-40-41-106.test.cjs` and `tests/hm-225-226-227.test.cjs` inside `npm test`.

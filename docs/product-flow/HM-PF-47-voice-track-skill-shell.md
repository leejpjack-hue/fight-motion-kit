# HM-PF-47 — `hm-voice-track` Skill Shell (#226)

Issue [#226](https://github.com/leejpjack-hue/fight-motion-kit/issues/226).
Context: [`skills/hm-voice-track/SKILL.md`](../../skills/hm-voice-track/SKILL.md) · [`HM-PF-51-skill-pack.md`](HM-PF-51-skill-pack.md) · [`HM-PF-48-sfx-41-lift-checklist.md`](HM-PF-48-sfx-41-lift-checklist.md).

## Contract Summary

1. **Skill shell only**: Documents Step 10 voice / future VO & SFX handoff boundaries in [`skills/hm-voice-track/SKILL.md`](../../skills/hm-voice-track/SKILL.md) without productizing an FE voice recorder or adding any audio HTTP backend.
2. **Shipped #41 boundary respected**: Clash SFX ([#41](HM-SFX-SAME-CLOCK.md)) already shipped on tip `35ee259` (accepted 16 Nov 2026 via `public/ui/clash-sfx-clock.js` and `scripts/clash-sfx-clock.cjs`). `hm-voice-track` neither redoes #41 nor treats #41 as held.
3. **FE-only constraints**:
   - Microphone capture, cloud TTS, HeyGen avatars, broadcast loudness mastering, and A/V muxing stay outside the browser composer.
   - `public/ui/*` exposes no voice recorder or live voice upload.
   - n8n Step 10 remains visible-but-disabled / held (`HMProductFlowNotify.buildNotify({ step: 10 })` throws `HOLD`; ops workflow does not enable autonomous voice approval).

## Verification

- `npm test` (`tests/hm-pf-51-skill-pack.test.cjs`, `tests/hm-pf-53-notify.test.cjs`, `tests/hm-225-226-227.test.cjs`).

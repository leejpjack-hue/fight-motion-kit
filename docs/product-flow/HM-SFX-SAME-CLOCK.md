# HM-SFX-SAME-CLOCK (#41) — Optional Clash SFX on `renderAt`

Places optional clash sound cues directly on the shared `renderAt` timeline clock (`HMStudio.renderAt`), aligned to clash/impact FX peaks (`t_peak`), while keeping the default path strictly **silent** and keeping all samples strictly silent before `hero_beat_t0`.

## Guarantees

1. **Silent default (`enabled: false`)** — Unchecked `#clashSfxToggle` and default `HMClashSfxClock.buildCuePlan(show)` produce zero audio output and `sampleAt(...).silent === true`.
2. **Strict silence before hero beat** — Any time `t < hero_beat_t0` returns `amplitude: 0, activeCues: []`, and no cue is emitted before `hero_beat_t0` (determined from `show.sfx.hero_beat_t0`, explicit `hero_beat: true`, or the first clash beat).
3. **Peak placement on clash atoms** — Selects each clash beat's impact peak (`fx_hooks` `t_rel` or beat midpoint fallback) on `renderAt`.
4. **Local-only synthesis** — Opt-in WebAudio transient clicks in browser or deterministic PCM WAV via CLI; zero network audio downloads and no `-14 LUFS` loudness QA claims.

## Local CLI

```sh
# Dry-run cue plan (silent default)
node scripts/clash-sfx-clock.cjs public/shows/daiyu-wang-five-seconds.json

# Opt-in WAV synthesis on the shared clock
node scripts/clash-sfx-clock.cjs public/shows/daiyu-wang-five-seconds.json --enabled --hero-beat 0.5 --out /tmp/clash.wav
```

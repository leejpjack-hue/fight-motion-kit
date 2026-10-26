# HM-CAM-10R — Distinct beat-tick proof

Seat check for signed story HM-CAM-10R. Baseline `939dc531`.

Beat-tick marks are `.beat-tick` spans on each timeline clip. Each mark’s `left` is that clip’s `fx_hooks[].t_rel` (missing `t_rel` uses `0.08`, the same default compose uses). Fit chips are the separate `.fit-chips` buttons: Fit 3s, Fit to 5 seconds, Fit 8s, Fit 10s.

## Must

1. `ticks-at-hooks.png` and `fit-chips.png` are different images. `proof.json` records both sha256 values. The browser check rejects a tick that lives inside `.fit-chips`.
2. Hooks at `0.15`, `0.50`, and `0.85` draw three ticks at those fractions of clip 0. Clearing hooks removes the ticks. Composed hit, shake, and flash times are `t0 + t_rel * duration`.
3. After those ticks are showing, Fit 3 / 8 / 10 / 5 still sets the total duration to 3, 8, 10, then 5 seconds. The hook fractions stay `15%`, `50%`, `85%`.
4. This directory is the proof. `npm run test:browser` rewrites the two capscreens and `proof.json`.

HM-FX-LOC-SIZE is unchanged.

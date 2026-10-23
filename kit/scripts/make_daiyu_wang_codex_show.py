"""Writes shows/daiyu-wang-codex.json: Codex 林黛玉 vs 王熙鳳 rooftop 60-plate film
re-expressed as 25 hero atoms (same cam/VFX/timing as zhao-hua-parity / Codex index.html)."""
import json, os
K = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LS = "assets/daiyu-wang-codex/layout.json"
def P(a, b): return [f"P{i:02d}" for i in range(a, b + 1)]
def hk(t, typ, end=None, **params):
    h = {"t_rel": t, "type": typ}
    if end is not None: h["t_rel_end"] = end
    if params: h["params"] = params
    return h
# (id, dur, kind, camera, beat, plates, fx, cam src)
A = [
 ("low_rise", 1, "duo", {"preset": "low_rise"}, "clash", P(1, 2), [hk(.05, "hit_orange")], "camBase[0,1)"),
 ("eye_orbit", 1, "duo", {"preset": "eye_orbit"}, "straight", P(3, 4), [hk(0, "dust"), hk(.5, "dust"), hk(.5, "smear_trail", dir=1)], "camBase[1,2)"),
 ("eye_push", 1, "duo", {"preset": "eye_push"}, "uppercut", P(5, 6), [hk(0, "speed_lines", 1, mode="up")], "camBase[2,3)"),
 ("ecu_fist_lens", 1, "duo", {"preset": "ecu_fist_lens"}, "straight", P(7, 8), [hk(0, "hit_pink"), hk(.5, "hit_pink"), hk(.5, "dust", k=1.2)], "camBase[3,4)"),
 ("ecu_jitter", 1.5, "close", {"preset": "ecu_jitter"}, "impact_hold", P(9, 11), [hk(0, "bg_flash_blue")], "camBase[4,5.5)"),
 ("dive_then_inside", 1.5, "duo", {"segments": [{"preset": "low_dive_under", "dur_s": .5}, {"preset": "upward_inside", "dur_s": 1}]}, "hook", P(12, 14), [hk(1/3, "hit_orange")], "camBase[5.5,6)+[6,7)"),
 ("ots_R_hold", 1, "duo", {"preset": "ots_R_hold"}, "elbow", P(15, 16), [hk(.5, "smear_trail", dir=-1)], "camBase[7,8)"),
 ("eye_lateral", 1, "duo", {"preset": "eye_lateral"}, "slip", P(17, 18), [hk(.5, "hit_pink"), hk(.5, "dust")], "camBase[8,9)"),
 ("waist_ots_chase", 1, "duo", {"preset": "waist_ots_chase", "params": {"y": {"phase": 180}}}, "skid", P(19, 20), [hk(0, "dust", k=.8), hk(0, "fence_shake", .6, k=.4)], "camBase[9,10)"),
 ("fence_sweep_roll", 1, "duo", {"preset": "fence_sweep_roll"}, "leap_short", P(21, 22), [hk(0, "speed_lines", 1, mode="up"), hk(0, "fence_shake", 1, k=1)], "camBase[10,11)"),
 ("floor_hold", 1, "duo", {"preset": "floor_hold"}, "knee", P(23, 24), [hk(0, "hit_orange"), hk(0, "dust", k=1.3)], "camBase[11,12)"),
 ("eye_lateral_rev", 1, "duo", {"preset": "eye_lateral", "params": {"x": {"a": 90, "b": -90}, "y": {"type": "const", "v": -45}, "s": {"v": 1.2}}}, "sweep", P(25, 26), [hk(0, "dust"), hk(.5, "dust"), hk(.5, "sparks", n=40)], "camBase[12,13)"),
 ("eye_hold", 1, "duo", {"preset": "eye_hold"}, "straight", P(27, 28), [hk(0, "hit_pink")], "camBase[13,14)"),
 ("ecu_jitter_y", 1, "close", {"preset": "ecu_jitter", "params": {"s": {"b": 1.12}, "x": {"type": "const", "v": 0}, "y": {"type": "saw", "a": -10, "b": 10, "period_s": .5}}}, "impact_hold", P(29, 30), [hk(0, "fence_shake", 1, k=2.2)], "camBase[14,15)"),
 ("floor_race", 1, "duo", {"preset": "floor_race"}, "duck", P(31, 32), [hk(.5, "hit_orange"), hk(.5, "dust", k=1.2)], "camBase[15,16)"),
 ("whip_A_to_B", 1, "duo", {"preset": "whip_A_to_B"}, "clash", P(33, 34), [hk(0, "hit_pink"), hk(.5, "smear_trail", dir=1)], "camBase[16,17)"),
 ("high_dive", 1, "split", {"preset": "high_dive"}, "leap_short", P(35, 36), [hk(0, "speed_lines", 1, mode="down")], "camBase[17,18)"),
 ("box_side_pan", 1, "duo", {"preset": "box_side_pan"}, "front_kick", P(37, 38), [hk(0, "hit_orange"), hk(0, "sparks", n=60), hk(0, "fence_shake", .5, k=.8)], "camBase[18,19)"),
 ("whip_A_to_B_wide", 2, "duo", {"preset": "whip_A_to_B", "params": {"x": {"offset": -90, "amp": 140, "cycles": 1}, "s": {"type": "lerp", "a": 1.4, "b": 1.5, "ease": "linear"}}}, "cartwheel", P(39, 42), [hk(.25, "hit_pink"), hk(.75, "hit_orange")], "camBase[19,21)"),
 ("ecu_jitter_s", 1, "close", {"preset": "ecu_jitter", "params": {"x": {"type": "const", "v": 0}}}, "impact_hold", P(43, 44), [hk(0, "bg_flash_teal"), hk(.5, "sparks", n=90, at=[700, 380]), hk(.75, "sparks", n=60, at=[700, 380])], "camBase[21,22)"),
 ("face_whip", 1, "duo", {"preset": "face_whip"}, "jab", P(45, 46), [hk(0, "smear_trail", dir=1), hk(.25, "smear_trail", dir=-1), hk(.5, "smear_trail", dir=1), hk(.75, "smear_trail", dir=-1)], "camBase[22,23)"),
 ("pass_between_a", 2, "duo", {"preset": "pass_between", "u_range": [0, 2/3]}, "hook", P(47, 50), [hk(.25, "hit_pink"), hk(.75, "hit_orange")], "camBase[23,26) part 1"),
 ("pass_between_b", 1, "duo", {"preset": "pass_between", "u_range": [2/3, 1]}, "guard_recover", P(51, 52), [hk(0, "hit_pink"), hk(.5, "dust")], "camBase[23,26) part 2"),
 ("dutch_spiral_a", 2, "leap", {"preset": "dutch_spiral", "u_range": [0, .5]}, "leap_short", P(53, 56), [hk(0, "dust", k=2.2), hk(0, "speed_lines", 1, mode="radial", k0=0, k1=.5)], "camBase[26,30) part 1"),
 ("dutch_spiral_b", 2, "tight", {"preset": "dutch_spiral", "u_range": [.5, 1]}, "clash", P(57, 60), [hk(0, "speed_lines", 1, mode="radial", k0=.5, k1=1), hk(.95, "pink_cut")], "camBase[26,30) part 2"),
]
atoms, t = [], 0.0
for i, (cid, d, kind, cam, beat, plates, fx, src) in enumerate(A, 1):
    atoms.append({"id": f"codex_{i:02d}_{cid}", "duration_s": d, "plates_needed": int(d * 2), "kind": kind,
                  "camera": cam, "motion": {"family": "fight", "beat_class": beat}, "pose_mode": "hero",
                  "hero": {"layout_source": LS, "plates": plates}, "fx_hooks": fx,
                  "assets": {"char_slots": ["L", "R"], "requires_costume_lock": False},
                  "source_refs": [f"codex index.html {src} t={t:g}-{t+d:g}s", f"plates_spec {plates[0]}-{plates[-1]}", "src=fight-daiyu-wang-rooftop-tankshort-codex-html-2026-10-19"]})
    t += d
assert abs(t - 30) < 1e-9, t
show = {"show_id": "daiyu-wang-codex", "title": "林黛玉 vs 王熙鳳 — Rooftop tank+short (Codex 60-plate · composer hero parity)", "duration_target_s": 30,
        "grounded": True, "floor_y": 684,
        "chars": {"L": {"name": "林黛玉 Lin Daiyu (Codex plates)"},
                  "R": {"name": "王熙鳳 Wang Xifeng (Codex plates)"}},
        "bg": {"base": "assets/daiyu-wang-codex/bg/bg_rooftop.png", "swap": "assets/daiyu-wang-codex/bg/bg_rooftop_dented.png", "swap_t": 18.5},
        "atoms": atoms}
json.dump(show, open(f"{K}/shows/daiyu-wang-codex.json", "w"), ensure_ascii=False, indent=1)
print(len(atoms), "atoms", t, "s")

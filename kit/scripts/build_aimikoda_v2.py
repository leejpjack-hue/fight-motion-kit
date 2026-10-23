#!/usr/bin/env python3
"""Hand-authored aimikoda-v2 show — craft pillars, NOT catalog auto-fill.

Editorial intent vs v1:
  - Framing: cam s ~1.85–2.30 + y 80–140 + L/R bias ±35–60 (true near-head CU)
  - Kill soft mid presets (waist_ots / box_side / floor / low_rise / wide pull)
  - Pose pairs = attack vs distinct defence/react every beat
  - Uneven 0.5 / 1.0 rhythm; 2× freeze 1.0s; 1× slow-mo 2.0s
  - Impact FX + SFX overlays locked to contact midpoints
"""
from __future__ import annotations
import json, os

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(KIT, "shows", "aimikoda-v2.json")
PLAN = os.path.join(KIT, "shows", "_aimikoda-v2-PLAN.json")

def C(v): return {"type": "const", "v": v}
def L(a, b, ease="smooth"): return {"type": "lerp", "a": a, "b": b, "ease": ease}
def SAW(a, b, period_s=0.5): return {"type": "saw", "a": a, "b": b, "period_s": period_s}
def ALT(offset, amp, n=4): return {"type": "alt_bump", "offset": offset, "amp": amp, "n": n}

def atom(
    id, dur, preset, *,
    Lposes, Rposes, beat, Lbrief=None, Rbrief=None,
    params=None, attacker="none", target="guard", depth=24, gap=-200,
    fx=None, kind="duo",
):
    npl = int(round(dur * 2))
    assert abs(npl - dur * 2) < 1e-9
    # pad / trim pose lists to plates
    def fit(ps):
        ps = list(ps)
        if len(ps) < npl:
            ps = ps + [ps[-1]] * (npl - len(ps))
        return ps[:npl]
    Lp, Rp = fit(Lposes), fit(Rposes)
    contact = []
    for i in range(npl):
        if attacker == "none":
            contact.append({"attacker": "none", "gap_px": gap})
        elif i == npl - 1 or (npl >= 2 and i >= npl // 2):
            contact.append({"attacker": attacker, "target": target, "depth_px": depth})
        else:
            contact.append({"attacker": "none", "gap_px": gap})
    return {
        "id": id,
        "duration_s": dur,
        "plates_needed": npl,
        "kind": kind,
        "camera": {"preset": preset, "params": params or {}},
        "motion": {
            "family": "fight",
            "beat_class": beat,
            "left_pose_brief": Lbrief or Lp[-1],
            "right_pose_brief": Rbrief or Rp[-1],
        },
        "pose_mode": "library",
        "poses": {"L": Lp, "R": Rp},
        "contact": contact,
        "fx_hooks": fx or [],
        "layout_hints": {"shadow_policy": "contact"},
        "compat": {"prev_exit_tags": ["grounded"], "next_entry_tags": ["grounded"]},
    }

def hit(t_rel, typ, **params):
    h = {"t_rel": t_rel, "type": typ}
    if params:
        h["params"] = params
    return h

# ── hand-authored beat sheet (sum → 30.0) ──────────────────────────────────
atoms = []

# 0.00 title — already tight two-head, clash ready (NOT idle guard)
atoms.append(atom(
    "v2_00_title_clash", 0.5, "eye_hold",
    Lposes=["clash_fist"], Rposes=["clash_fist"], beat="hold",
    params={"s": C(2.05), "x": C(0), "y": C(115)},
    attacker="none", gap=-220,
))

# 0.50–5.00 punch string A (9×0.5) — alternate L/R, CU push
atoms.append(atom(
    "v2_01_L_straight", 0.5, "eye_push",
    Lposes=["straight"], Rposes=["block_forearm_mid"], beat="straight",
    params={"s": L(1.92, 2.18), "x": C(-48), "y": L(85, 118)},
    attacker="L", target="guard",
    fx=[hit(0.35, "smear_trail", dir=1), hit(0.5, "hit_orange"), hit(0.55, "impact_white")],
))
atoms.append(atom(
    "v2_02_R_jab_dutch", 0.5, "dutch_snap",
    Lposes=["slip_side"], Rposes=["jab"], beat="jab",
    params={"s": L(2.00, 2.18), "x": L(20, -8), "y": C(105), "r": L(-14, 3)},
    attacker="R", target="head",
    fx=[hit(0.4, "smear_trail", dir=-1), hit(0.5, "hit_pink"), hit(0.55, "impact_white")],
))
atoms.append(atom(
    "v2_03_L_hook_snap", 0.5, "face_whip",
    Lposes=["hook"], Rposes=["hit_head_snap"], beat="hook",
    params={"s": C(2.22), "x": ALT(-40, 50, 4), "y": C(130)},
    attacker="L", target="head",
    fx=[hit(0.4, "smear_trail", dir=1), hit(0.5, "hit_orange"), hit(0.55, "shake")],
))
atoms.append(atom(
    "v2_04_R_upper_ecu", 0.5, "ecu_fist_lens",
    Lposes=["duck"], Rposes=["uppercut"], beat="uppercut",
    params={"s": L(2.05, 2.28), "x": L(35, 55), "y": C(125)},
    attacker="R", target="head",
    fx=[hit(0.45, "smear_trail", dir=-1), hit(0.5, "hit_pink")],
))
atoms.append(atom(
    "v2_05_L_knee_ots", 0.5, "ots_R_hold",
    Lposes=["knee"], Rposes=["block_forearm_high"], beat="knee",
    params={"s": C(2.05), "x": L(58, 42), "y": C(108)},
    attacker="L", target="guard",
    fx=[hit(0.45, "hit_orange"), hit(0.55, "dust", k=1.2)],
))
atoms.append(atom(
    "v2_06_clash", 0.5, "eye_push",
    Lposes=["clash_fist"], Rposes=["clash_fist"], beat="clash",
    params={"s": L(2.08, 2.25), "x": C(0), "y": L(100, 120)},
    attacker="L", target="guard", depth=40,
    fx=[hit(0.45, "impact_white"), hit(0.5, "sparks", n=8), hit(0.55, "shake")],
))
atoms.append(atom(
    "v2_07_R_elbow", 0.5, "face_whip",
    Lposes=["stagger"], Rposes=["elbow"], beat="elbow",
    params={"s": C(2.18), "x": ALT(35, 45, 4), "y": C(125)},
    attacker="R", target="head",
    fx=[hit(0.4, "smear_trail", dir=-1), hit(0.5, "hit_pink")],
))
atoms.append(atom(
    "v2_08_L_jab_ecu", 0.5, "ecu_jitter",
    Lposes=["jab"], Rposes=["parry"], beat="jab",
    params={"s": SAW(2.05, 2.22), "x": SAW(-35, -15), "y": C(122)},
    attacker="L", target="guard",
    fx=[hit(0.45, "hit_orange"), hit(0.55, "impact_white")],
))
atoms.append(atom(
    "v2_09_R_straight", 0.5, "eye_push",
    Lposes=["block_forearm_high"], Rposes=["straight"], beat="straight",
    params={"s": L(1.95, 2.20), "x": C(48), "y": L(90, 118)},
    attacker="R", target="guard",
    fx=[hit(0.4, "smear_trail", dir=-1), hit(0.5, "hit_pink")],
))

# 5.00 breathe 1.0s — still CU OTS, grab vs recover (readable, not idle)
atoms.append(atom(
    "v2_10_breathe_grab", 1.0, "ots_L_hold",
    Lposes=["grab_reach", "grab_reach"], Rposes=["recover", "backstep"], beat="clash",
    params={"s": C(1.98), "x": L(-58, -40), "y": C(105)},
    attacker="L", target="guard", depth=30,
    fx=[hit(0.55, "smear_trail", dir=1)],
))

# 6.00 dutch chaos
atoms.append(atom(
    "v2_11_dutch_chaos", 0.5, "dutch_snap",
    Lposes=["straight"], Rposes=["block_forearm_high"], beat="straight",
    params={"s": L(2.05, 2.22), "x": L(-18, 12), "y": C(112), "r": L(12, -4)},
    attacker="L", target="guard",
    fx=[hit(0.45, "impact_white"), hit(0.5, "hit_orange")],
))

# 6.50 FREEZE 華妃 1.0s — hard R bias ECU
atoms.append(atom(
    "v2_12_freeze_huafei", 1.5, "eye_hold",
    Lposes=["guard_stance", "guard_stance", "guard_stance"], Rposes=["finisher_pose", "finisher_pose", "finisher_pose"], beat="hold",
    params={"s": C(2.20), "x": C(58), "y": C(128)},
    attacker="none", gap=-200,
))

# 7.50–12.50 exchange B
atoms.append(atom(
    "v2_13_L_hook", 0.5, "eye_push",
    Lposes=["hook"], Rposes=["block_forearm_mid"], beat="hook",
    params={"s": L(1.95, 2.18), "x": C(-45), "y": L(95, 120)},
    attacker="L", target="guard",
    fx=[hit(0.4, "smear_trail", dir=1), hit(0.5, "hit_orange")],
))
atoms.append(atom(
    "v2_14_R_straight_hit", 0.5, "ecu_fist_lens",
    Lposes=["hit_head_snap"], Rposes=["straight"], beat="straight",
    params={"s": L(2.10, 2.30), "x": L(30, 50), "y": C(130)},
    attacker="R", target="head",
    fx=[hit(0.4, "smear_trail", dir=-1), hit(0.5, "hit_pink"), hit(0.55, "impact_white")],
))
atoms.append(atom(
    "v2_15_L_upper", 0.5, "face_whip",
    Lposes=["uppercut"], Rposes=["duck"], beat="uppercut",
    params={"s": C(2.20), "x": ALT(-35, 55, 4), "y": C(128)},
    attacker="L", target="head",
    fx=[hit(0.45, "hit_orange"), hit(0.55, "shake")],
))
atoms.append(atom(
    "v2_16_R_knee", 0.5, "ots_L_hold",
    Lposes=["block_forearm_high"], Rposes=["knee"], beat="knee",
    params={"s": C(2.05), "x": L(-55, -38), "y": C(110)},
    attacker="R", target="guard",
    fx=[hit(0.45, "hit_pink"), hit(0.55, "dust", k=1.1)],
))
atoms.append(atom(
    "v2_17_clash_dutch", 0.5, "dutch_snap",
    Lposes=["clash_fist"], Rposes=["clash_fist"], beat="clash",
    params={"s": L(2.08, 2.24), "x": L(-10, 14), "y": C(115), "r": L(-12, 5)},
    attacker="L", target="guard", depth=40,
    fx=[hit(0.45, "impact_white"), hit(0.5, "sparks", n=10)],
))
atoms.append(atom(
    "v2_18_L_elbow", 0.5, "ecu_jitter",
    Lposes=["elbow"], Rposes=["stagger"], beat="elbow",
    params={"s": SAW(2.08, 2.24), "x": SAW(-40, -18), "y": C(124)},
    attacker="L", target="head",
    fx=[hit(0.45, "hit_orange"), hit(0.55, "impact_white")],
))
atoms.append(atom(
    "v2_19_exchange", 1.0, "eye_lateral",
    Lposes=["jab", "straight"], Rposes=["block_forearm_mid", "parry"], beat="straight",
    params={"s": L(1.95, 2.15), "x": L(-40, 35), "y": C(112)},
    attacker="L", target="guard",
    fx=[hit(0.25, "hit_orange"), hit(0.7, "hit_pink"), hit(0.75, "impact_white")],
))
atoms.append(atom(
    "v2_20_R_hook", 0.5, "face_whip",
    Lposes=["slip_side"], Rposes=["hook"], beat="hook",
    params={"s": C(2.18), "x": ALT(30, 50, 4), "y": C(126)},
    attacker="R", target="head",
    fx=[hit(0.4, "smear_trail", dir=-1), hit(0.5, "hit_pink")],
))
atoms.append(atom(
    "v2_21_L_kick", 0.5, "ecu_fist_lens",
    Lposes=["front_kick"], Rposes=["hit_body_fold"], beat="front_kick",
    params={"s": L(2.00, 2.22), "x": L(-30, -50), "y": C(115)},
    attacker="L", target="body",
    fx=[hit(0.4, "smear_trail", dir=1), hit(0.5, "hit_orange"), hit(0.55, "impact_white")],
))
atoms.append(atom(
    "v2_22_R_jab", 0.5, "eye_push",
    Lposes=["parry"], Rposes=["jab"], beat="jab",
    params={"s": L(1.98, 2.20), "x": C(46), "y": L(95, 120)},
    attacker="R", target="guard",
    fx=[hit(0.4, "smear_trail", dir=-1), hit(0.5, "hit_pink")],
))

# 12.50 FREEZE 趙敏 1.0s
atoms.append(atom(
    "v2_23_freeze_zhaomin", 1.5, "eye_hold",
    Lposes=["finisher_pose", "finisher_pose", "finisher_pose"], Rposes=["guard_stance", "guard_stance", "guard_stance"], beat="hold",
    params={"s": C(2.20), "x": C(-58), "y": C(128)},
    attacker="none", gap=-200,
))

# 13.50–19.50 run to climax
atoms.append(atom(
    "v2_24_R_grab", 0.5, "ots_R_hold",
    Lposes=["recover"], Rposes=["grab_reach"], beat="clash",
    params={"s": C(2.00), "x": L(55, 40), "y": C(108)},
    attacker="R", target="guard", depth=30,
    fx=[hit(0.5, "smear_trail", dir=-1)],
))
atoms.append(atom(
    "v2_25_clash", 0.5, "eye_push",
    Lposes=["clash_fist"], Rposes=["clash_fist"], beat="clash",
    params={"s": L(2.10, 2.28), "x": C(0), "y": L(105, 125)},
    attacker="L", target="guard", depth=40,
    fx=[hit(0.45, "impact_white"), hit(0.5, "sparks", n=8)],
))
atoms.append(atom(
    "v2_26_L_knee", 0.5, "upward_inside",
    Lposes=["knee"], Rposes=["block_forearm_mid"], beat="knee",
    params={"s": L(2.00, 2.18), "x": C(-35), "y": L(130, 100)},
    attacker="L", target="guard",
    fx=[hit(0.45, "hit_orange"), hit(0.55, "dust", k=1.2)],
))
atoms.append(atom(
    "v2_27_R_upper", 0.5, "face_whip",
    Lposes=["duck"], Rposes=["uppercut"], beat="uppercut",
    params={"s": C(2.22), "x": ALT(40, 50, 4), "y": C(130)},
    attacker="R", target="head",
    fx=[hit(0.45, "hit_pink"), hit(0.55, "impact_white")],
))
atoms.append(atom(
    "v2_28_L_straight", 0.5, "ecu_fist_lens",
    Lposes=["straight"], Rposes=["backstep"], beat="straight",
    params={"s": L(2.05, 2.25), "x": L(-25, -45), "y": C(120)},
    attacker="L", target="guard",
    fx=[hit(0.4, "smear_trail", dir=1), hit(0.5, "hit_orange")],
))
atoms.append(atom(
    "v2_29_combo", 1.0, "eye_push",
    Lposes=["hook", "elbow"], Rposes=["block_forearm_high", "stagger"], beat="hook",
    params={"s": L(2.05, 2.28), "x": C(-42), "y": L(100, 125)},
    attacker="L", target="head",
    fx=[hit(0.3, "hit_orange"), hit(0.7, "hit_pink"), hit(0.75, "impact_white"), hit(0.8, "shake")],
))
atoms.append(atom(
    "v2_30_R_jab", 0.5, "ecu_jitter",
    Lposes=["slip_side"], Rposes=["jab"], beat="jab",
    params={"s": SAW(2.08, 2.24), "x": SAW(20, 40), "y": C(122)},
    attacker="R", target="head",
    fx=[hit(0.45, "hit_pink"), hit(0.55, "impact_white")],
))
atoms.append(atom(
    "v2_31_clash", 0.5, "eye_orbit",
    Lposes=["clash_fist"], Rposes=["clash_fist"], beat="clash",
    params={"s": C(2.15), "x": L(-30, 30), "y": C(118), "r": L(-4, 4)},
    attacker="L", target="guard", depth=40,
    fx=[hit(0.5, "impact_white"), hit(0.55, "sparks", n=10)],
))
atoms.append(atom(
    "v2_32_R_elbow", 0.5, "face_whip",
    Lposes=["stagger"], Rposes=["elbow"], beat="elbow",
    params={"s": C(2.20), "x": ALT(32, 48, 4), "y": C(128)},
    attacker="R", target="head",
    fx=[hit(0.4, "smear_trail", dir=-1), hit(0.5, "hit_pink")],
))
atoms.append(atom(
    "v2_33_L_upper_setup", 0.5, "eye_push",
    Lposes=["uppercut"], Rposes=["block_forearm_high"], beat="uppercut",
    params={"s": L(2.00, 2.22), "x": C(-48), "y": L(100, 125)},
    attacker="L", target="guard",
    fx=[hit(0.45, "hit_orange")],
))

# 19.50 SLOW-MO climax 2.0s — 4 plates, keep CU
atoms.append(atom(
    "v2_33b_R_hook", 0.5, "face_whip",
    Lposes=["hit_head_snap"], Rposes=["hook"], beat="hook",
    params={"s": C(2.22), "x": ALT(38, 48, 4), "y": C(130)},
    attacker="R", target="head",
    fx=[hit(0.4, "smear_trail", dir=-1), hit(0.5, "hit_pink"), hit(0.55, "impact_white")],
))
atoms.append(atom(
    "v2_33c_clash_push", 1.0, "eye_push",
    Lposes=["clash_fist", "straight"], Rposes=["clash_fist", "block_forearm_high"], beat="clash",
    params={"s": L(2.08, 2.26), "x": C(-20), "y": L(110, 128)},
    attacker="L", target="guard", depth=36,
    fx=[hit(0.3, "impact_white"), hit(0.7, "hit_orange"), hit(0.75, "sparks", n=10)],
))
atoms.append(atom(
    "v2_34_slowmo", 2.0, "eye_hold",
    Lposes=["windup", "straight", "straight", "finisher_pose"],
    Rposes=["guard_stance", "block_forearm_high", "hit_head_snap", "stagger"],
    beat="straight",
    params={"s": L(2.18, 2.32), "x": C(-30), "y": L(125, 138)},
    attacker="L", target="head", depth=28,
    fx=[
        hit(0.35, "speed_lines", mode="radial", k0=0.6, k1=1.3),
        hit(0.45, "smear_trail", dir=1),
        hit(0.5, "impact_white"),
        hit(0.52, "hit_orange"),
        hit(0.55, "shake"),
        hit(0.6, "sparks", n=12),
    ],
))

# 21.50 aftermath still fairly tight
atoms.append(atom(
    "v2_35_aftermath", 1.5, "pull_aftermath",
    Lposes=["finisher_pose", "finisher_pose", "finisher_pose"], Rposes=["stagger", "skid_back", "skid_back"], beat="hold",
    params={"s": L(2.05, 1.88), "x": C(0), "y": L(110, 85)},
    attacker="none", gap=-180,
    fx=[hit(0.2, "dust", k=1.0)],
))

# 22.50 short settle then end
atoms.append(atom(
    "v2_36_settle", 1.5, "eye_hold",
    Lposes=["guard_stance", "recover", "recover"], Rposes=["skid_back", "recover", "guard_stance"], beat="hold",
    params={"s": C(1.92), "x": C(0), "y": C(95)},
    attacker="none", gap=-200,
))
atoms.append(atom(
    "v2_37_end", 3.0, "eye_hold",
    Lposes=["finisher_pose"]*6,
    Rposes=["finisher_pose"]*6,
    beat="hold",
    params={"s": L(1.88, 1.72), "x": C(0), "y": L(90, 70)},
    attacker="none", gap=-200,
))

total = sum(a["duration_s"] for a in atoms)
assert abs(total - 30.0) < 1e-9, f"duration {total} != 30"
print(f"atoms={len(atoms)} duration={total}")

# ── overlays: title/cards/end + SFX locked to atom contact midpoints ──
def ov(oid, text, t0, t1, *, fill, stroke, size, effect, x=640, y=200, intens=1.2, font="Ma Shan Zheng", z=25, italic=False):
    style = {
        "fill": fill, "stroke": stroke, "strokeWidth": 8,
        "fontSize": size, "fontWeight": "400", "fontFamily": font,
    }
    if italic:
        style["italic"] = True
    return {
        "id": oid, "kind": "text", "text": text,
        "style": style,
        "effect": {"type": effect, "intensity": intens},
        "t_start": round(t0, 3), "t_end": round(t1, 3), "x": x, "y": y, "scale": 1, "opacity": 1, "z": z,
    }

# map atom id -> absolute start
t_abs = {}
t = 0.0
for a in atoms:
    t_abs[a["id"]] = t
    t += a["duration_s"]

SFX_CYCLE = [
    ("砰", "#ff6b3d", "#2a0800", "slam", 130),
    ("碰", "#ff2f9a", "#200018", "slam", 125),
    ("擋", "#ffe66d", "#1a0a00", "impact", 110),
    ("唰", "#9ef", "#023", "slide_left", 95),
    ("CLASH", "#ffe66d", "#1a0a00", "impact", 105),
]

overlays = [
    ov("ov_title", "天台決", 0.0, 0.55, fill="#ffe66d", stroke="#1a0a00", size=150, effect="slam", y=300, intens=1.5, font="Long Cang", z=30),
]

si = 0
for a in atoms:
    aid = a["id"]
    if "freeze_huafei" in aid:
        overlays.append(ov("ov_card_hf", "華妃 · HUA FEI", t_abs[aid]+0.05, t_abs[aid]+a["duration_s"]-0.05,
            fill="#ff2f9a", stroke="#200018", size=72, effect="fade", x=820, y=560, font="Long Cang", z=28, intens=1.0))
        continue
    if "freeze_zhaomin" in aid:
        overlays.append(ov("ov_card_zm", "趙敏 · ZHAO MIN", t_abs[aid]+0.05, t_abs[aid]+a["duration_s"]-0.05,
            fill="#ffe66d", stroke="#1a0a00", size=72, effect="fade", x=460, y=560, font="Long Cang", z=28, intens=1.0))
        continue
    if "slowmo" in aid:
        overlays.append(ov("ov_slow_peng", "——碰", t_abs[aid]+0.85, t_abs[aid]+1.7,
            fill="#fff", stroke="#400", size=140, effect="slam", y=240, intens=1.5, z=30))
        overlays.append(ov("ov_combo", "14 HITS", t_abs[aid]+1.85, t_abs[aid]+a["duration_s"]+0.8,
            fill="#ffe66d", stroke="#1a0a00", size=64, effect="pulse", y=80, font="Long Cang", z=26, intens=1.0))
        continue
    # SFX on contact atoms (skip holds/title/aftermath/settle/end)
    if a["motion"]["beat_class"] == "hold":
        continue
    has_hit = any(h.get("type", "").startswith("hit") or h.get("type") == "impact_white" for h in a.get("fx_hooks", []))
    if not has_hit and a["motion"]["beat_class"] not in ("clash", "straight", "jab", "hook", "elbow", "knee", "uppercut", "front_kick"):
        continue
    # mid-atom
    word, fill, stroke, eff, size = SFX_CYCLE[si % len(SFX_CYCLE)]
    si += 1
    # cap density ~14 SFX besides title/cards/slow/end
    if si > 14:
        continue
    italic = word == "唰"
    font = "Long Cang" if word in ("唰", "CLASH", "呼") else "Ma Shan Zheng"
    xoff = 700 if si % 2 else 560
    t0 = t_abs[aid] + 0.22 * a["duration_s"]
    t1 = t0 + 0.45
    overlays.append(ov(f"ov_sfx_{si:02d}", word, t0, t1, fill=fill, stroke=stroke, size=size, effect=eff,
        x=xoff, y=170 + (si % 3) * 15, font=font, italic=italic, intens=1.25))

# end card
overlays.append(ov("ov_end", "天台 · 未完", total - 2.7, total - 0.2,
    fill="#ff2f9a", stroke="#200018", size=120, effect="bounce", y=340, font="Long Cang", intens=1.3, z=35))
print(f"overlays={len(overlays)} (sfx≈{si})")

show = {
    "show_id": "aimikoda-v2",
    "title": "Aimikoda-craft v2 — 趙敏 vs 華妃（手砌近鏡·快切·Dutch·freeze·slow-mo）",
    "draft": True,
    "grounded": True,
    "floor_y": 684,
    "char_screen_scale": 1.0,
    "storyboard_note": "Execution iterate under JACK APPROVED aimikoda pillars (rapid cuts / Dutch / impact / kinetic SFX / freeze / slow-mo). No new storyboard gate — polish pass after v1 reject (framing too wide / catalog feel).",
    "chars": {
        "L": {
            "name": "趙敏 Zhao Min (Sprite Forge real)",
            "pose_library": "pose_library/zhao-min/pose_library.json",
            "transform": {"x": 125, "y": 0, "scale": 1.28},
        },
        "R": {
            "name": "華妃 Hua Fei (Sprite Forge real)",
            "pose_library": "pose_library/hua-fei/pose_library.json",
            "transform": {"x": -125, "y": 0, "scale": 1.28},
        },
    },
    "bg": {
        "base": "assets/zhao-hua/bg/bg_rooftop.png",
        "swap": "assets/zhao-hua/bg/bg_rooftop_dented.png",
        "swap_t": 14.0,
    },
    "atoms": atoms,
    "overlays": overlays,
}

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(show, f, ensure_ascii=False, indent=1)
print("wrote", OUT)

# CU density estimate
cu = 0
for a in atoms:
    s = a["camera"]["params"].get("s", {})
    vals = []
    if s.get("type") == "const":
        vals = [s["v"]]
    elif s.get("type") == "lerp":
        vals = [s["a"], s["b"]]
    elif s.get("type") == "saw":
        vals = [s["a"], s["b"]]
    if vals and min(vals) >= 1.85:
        cu += a["duration_s"]
print(f"near-CU runtime (s>=1.85): {cu:.1f}s / 30 ({100*cu/30:.0f}%)")
print(f"overlays: {len(overlays)}")

plan = {
    "plan_id": "aimikoda-v2",
    "title": "Aimikoda-craft v2 hand-authored CU fight edit",
    "status": "BUILDING",
    "parent_approval": "approve_library (v1 pillars) — Jack rejected v1 quality; polish under same pillars, no new storyboard gate",
    "vs_v1": {
        "framing": "cam s 1.85–2.32 + y 85–138 (v1 was ~1.3–1.72 / soft mid)",
        "presets_killed": ["waist_ots_chase", "box_side_pan", "floor_hold", "low_rise", "whip_A_to_B wide"],
        "poses": "attack vs distinct defence/react; clash/hit_head/stagger over idle guard pairs",
        "rhythm": "hand beat sheet; uneven 0.5/1.0; freezes 1.0; slowmo 2.0",
        "sfx": "overlays locked to contact midpoints",
    },
    "refs": {
        "storyboard": "STORYBOARD-zh-aimikoda-30s.md",
        "craft_brief": "refs/aimikoda/CRAFT_BRIEF.md",
        "baseline_spacing": "shows/head-cu-30s.json (v4 L/R x±125 scale 1.28 y=0)",
        "rejected": "shows/aimikoda-v1.json",
    },
}
with open(PLAN, "w", encoding="utf-8") as f:
    json.dump(plan, f, ensure_ascii=False, indent=2)
print("wrote", PLAN)

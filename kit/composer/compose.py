#!/usr/bin/env python3
"""HTML Motion Template Kit — composer (P0).

show spec (shows/*.json) -> out/<show_id>/layout.json + out/<show_id>/timeline.json

  python3 composer/compose.py shows/zhao-hua-parity.json
  python3 composer/compose.py shows/library-smoke.json --out out

All paths inside specs / libraries / layouts are resolved to KIT-ROOT-relative
paths in the output, so player/index.html (one level down) prefixes '../'.
"""
import json, math, os, sys, argparse, copy

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FPS_PLATES = 2
DEFAULTS = {"x": 0.0, "y": 0.0, "s": 1.12, "r": 0.0}

def jload(p): return json.load(open(p, encoding="utf-8"))
def rel(p): return os.path.relpath(os.path.abspath(p), KIT).replace(os.sep, "/")

class ComposeError(Exception): pass

# ---------------- validation ----------------
def validator(name):
    try:
        import jsonschema
        from referencing import Registry, Resource
    except Exception:
        return None
    reg = Registry()
    for n in ("atom", "show", "pose_library"):
        reg = reg.with_resource(f"{n}.schema.json", Resource.from_contents(jload(f"{KIT}/schema/{n}.schema.json")))
    return jsonschema.Draft202012Validator(jload(f"{KIT}/schema/{name}.schema.json"), registry=reg)

def validate(obj, name, label, errors):
    v = validator(name)
    if v is None:
        print("WARN: jsonschema not installed; schema validation skipped", file=sys.stderr); return
    for e in v.iter_errors(obj):
        errors.append(f"{label}: schema {name}: {'/'.join(map(str, e.absolute_path))}: {e.message[:200]}")

# ---------------- camera curves ----------------
def ease(kind, u):
    u = 0.0 if u < 0 else 1.0 if u > 1 else u
    if kind == "linear": return u
    if kind == "sine": return 0.5 - 0.5 * math.cos(math.pi * u)
    return u * u * (3 - 2 * u)

def eval_curve(c, u, tl):
    t = c["type"]
    if t == "const": return c["v"]
    if t == "lerp": return c["a"] + (c["b"] - c["a"]) * ease(c.get("ease", "smooth"), u)
    if t == "saw":
        f = (tl % c["period_s"]) / c["period_s"]; return c["a"] + (c["b"] - c["a"]) * f
    if t == "sin":
        arg = (c["omega"] * tl if "omega" in c else 2 * math.pi * c.get("cycles", 1) * u) + c.get("phase", 0)
        return c.get("offset", 0) + c["amp"] * math.sin(arg)
    if t == "alt_bump":
        k = c["n"] * u; sign = 1 if int(math.floor(k)) % 2 else -1
        return c.get("offset", 0) + sign * c["amp"] * math.sin((k % 1) * math.pi)
    raise ComposeError(f"unknown curve type {t}")

def eval_cam(curves, u, tl):
    o = {ch: (eval_curve(curves[ch], u, tl) if ch in curves else DEFAULTS[ch]) for ch in "xysr"}
    smin = 1 + abs(math.sin(o["r"] * math.pi / 180)) * 0.9
    o["s"] = max(o["s"], smin); return o

def merge_curves(preset, params):
    cur = copy.deepcopy(preset["curves"])
    for ch, ov in (params or {}).items():
        if "type" in ov or ch not in cur: cur[ch] = dict(ov)
        else: cur[ch].update(ov)
    return cur

def apply_cam_nudge(curves, nudge):
    """Add additive camera.nudge {x,y,s,r} into preset curves (HM-COMPOSE-02)."""
    if not nudge:
        return curves
    out = copy.deepcopy(curves)
    for ch in "xysr":
        if ch not in nudge or nudge[ch] is None:
            continue
        try:
            dv = float(nudge[ch])
        except (TypeError, ValueError):
            continue
        if abs(dv) < 1e-12:
            continue
        if ch not in out:
            out[ch] = {"type": "const", "v": DEFAULTS[ch] + dv}
            continue
        c = out[ch]
        t = c.get("type")
        if t == "const":
            c["v"] = float(c.get("v", DEFAULTS[ch])) + dv
        elif t == "lerp":
            c["a"] = float(c["a"]) + dv
            c["b"] = float(c["b"]) + dv
        elif t == "saw":
            c["a"] = float(c["a"]) + dv
            c["b"] = float(c["b"]) + dv
        elif t in ("sin", "alt_bump"):
            c["offset"] = float(c.get("offset", 0) or 0) + dv
        else:
            # fallback: const override at nudged default
            out[ch] = {"type": "const", "v": DEFAULTS[ch] + dv}
    return out

# ---------------- pose library placement ----------------
def load_library(path, errors):
    lib = jload(path); validate(lib, "pose_library", rel(path), errors)
    base = os.path.dirname(path)
    poses = {}
    for p in lib["poses"]:
        q = dict(p); q["png_rel"] = rel(os.path.join(base, p["png"]))
        if "size" not in q:
            from PIL import Image
            q["size"] = list(Image.open(os.path.join(base, p["png"])).size)
        poses[p["pose_id"]] = q
    lib["_poses"] = poses; return lib

def pose_for(spec, i):
    if isinstance(spec, list): return spec[min(i, len(spec) - 1)]
    return spec

def screen_pt(pose, foot_x, floor, k, flip, xy):
    fx, fy = pose["foot_anchor_xy"]; px, py = xy
    dx = (px - fx) * k * (-1 if flip else 1)
    return foot_x + dx, floor - (fy - py) * k

def target_xy(pose, target):
    if target == "head": return pose["head_xy"]
    if target in ("guard", "fist"): return pose["hand_hit_xy"]
    hx, hy = pose["head_xy"]; fx, fy = pose["foot_anchor_xy"]   # body = 40% head->foot
    return [hx + (fx - hx) * 0.4, hy + (fy - hy) * 0.4]

def place_library_plate(atom, i, libs, floor, char_scale, warns):
    sides = {}
    for side, need in (("L", "right"), ("R", "left")):
        pid = pose_for(atom["poses"][side], i)
        lib = libs.get(side)
        if lib is None or pid not in lib["_poses"]:
            raise ComposeError(f"{atom['id']}: pose '{pid}' not in {side} library")
        p = lib["_poses"][pid]
        k = char_scale * p.get("scale", 1.0) * atom.get("layout_hints", {}).get("char_scale", 1.0)
        sides[side] = dict(pose=p, k=k, flip=(p["facing"] != need))
    c = atom.get("contact", {})
    if isinstance(c, list): c = c[min(i, len(c) - 1)]
    att = c.get("attacker", "none")
    # foot positions: attacker hand meets defender target (x only; feet stay on floor = grounded rule)
    if att in ("L", "R"):
        dfd = "R" if att == "L" else "L"
        A, D = sides[att], sides[dfd]
        ax, _ = screen_pt(A["pose"], 0, floor, A["k"], A["flip"], A["pose"]["hand_hit_xy"])
        tx, _ = screen_pt(D["pose"], 0, floor, D["k"], D["flip"], target_xy(D["pose"], c.get("target", "body")))
        depth = c.get("depth_px", 12)     # px the striking point travels past the target (negative = falls short)
        gapLR = (ax - tx - depth) if att == "L" else (tx - ax - depth)   # R_foot - L_foot
    def ext(S):   # (left extent, right extent) of the silhouette box relative to the foot anchor, screen px
        w = S["pose"]["size"][0]; fx = S["pose"]["foot_anchor_xy"][0]; k = S["k"]
        return ((w - fx) * k, fx * k) if S["flip"] else (fx * k, (w - fx) * k)
    min_gap = ext(sides["L"])[1] * 0.35 + ext(sides["R"])[0] * 0.35   # keep >=35% of each half-body apart
    if att not in ("L", "R"):
        # no contact: silhouettes separated by gap_px clearance (bbox to bbox)
        gapLR = ext(sides["L"])[1] + c.get("gap_px", 40) + ext(sides["R"])[0]
    elif gapLR < min_gap:
        warns.append(f"{atom['id']} plate {i}: contact solve put feet {gapLR:.0f}px apart (<{min_gap:.0f}); clamped"); gapLR = min_gap
    cx = 640 + atom.get("layout_hints", {}).get("pair_offset_x", 0)
    foot = {"L": cx - gapLR / 2, "R": cx + gapLR / 2}
    parts, shadows = [], []
    for side in ("L", "R"):
        S = sides[side]; p = S["pose"]; k = S["k"]; w, h = p["size"]
        fx, fy = p["foot_anchor_xy"]
        left = foot[side] - ((w - fx) if S["flip"] else fx) * k
        parts.append({"src": p["png_rel"], "x": round(left, 1), "y": round(floor - fy * k, 1),
                      "w": round(w * k, 1), "h": round(h * k, 1), "flip": S["flip"], "side": side, "pose_id": p["pose_id"]})
        shadows.append({"cx": round(foot[side], 1), "cy": floor, "rx": round(max(60, w * k * 0.33), 1), "ry": 10.0})
    contact = None
    if att in ("L", "R"):
        A = sides[att]; contact = [round(v, 1) for v in screen_pt(A["pose"], foot[att], floor, A["k"], A["flip"], A["pose"]["hand_hit_xy"])]
    return parts, shadows, contact


def merge_transform(show, atom, side):
    """Show-level chars[side].transform merged with atom.char_overrides[side] (atom wins per field)."""
    base = (show.get("chars") or {}).get(side, {}).get("transform") or {}
    ov = ((atom or {}).get("char_overrides") or {}).get(side) or {}
    return {
        "x": float(ov["x"] if "x" in ov else base.get("x", 0) or 0),
        "y": float(ov["y"] if "y" in ov else base.get("y", 0) or 0),
        "scale": float(ov["scale"] if "scale" in ov else base.get("scale", 1) or 1),
    }

def apply_part_transform(part, shadow, xf, floor, warns, label):
    """Scale around foot (shadow.cx, floor), then add x/y. Mutates part + shadow."""
    sx = xf.get("scale", 1.0) or 1.0
    dx = xf.get("x", 0.0) or 0.0
    dy = xf.get("y", 0.0) or 0.0
    if abs(sx - 1.0) < 1e-9 and abs(dx) < 1e-9 and abs(dy) < 1e-9:
        return
    cx = shadow["cx"] if shadow else (part["x"] + part["w"] / 2)
    foot_y = floor
    ox = part["x"] - cx
    oy = part["y"] - foot_y
    part["w"] = round(part["w"] * sx, 1)
    part["h"] = round(part["h"] * sx, 1)
    part["x"] = round(cx + ox * sx + dx, 1)
    part["y"] = round(foot_y + oy * sx + dy, 1)
    if shadow is not None:
        shadow["cx"] = round(cx + dx, 1)
        shadow["cy"] = round(foot_y + dy, 1)
        shadow["rx"] = round(shadow.get("rx", 60) * sx, 1)
    if abs(dy) > 1e-6:
        msg = f"{label}: y transform {dy:+.0f}px breaks floor grounding"
        if msg not in warns:
            warns.append(msg)

def apply_layout_transforms(entry, show, atom, warns):
    """Apply L/R transforms to side-tagged parts (library + hero when parts have side).

    Hero/parity Codex plates are often a single unsided full-frame part. For those,
    apply pair framing: x = L.x+R.x, scale = L.scale*R.scale, y = L.y or R.y
    (y≠0 still warns). That lets the same Characters / char_overrides controls
    nudge plate-pack shows (HM-COMPOSE-02).
    """
    parts = entry.get("parts") or []
    shadows = entry.get("shadows") or []
    floor = entry.get("floor", show.get("floor_y", 684))
    if not parts:
        return
    sided = [p for p in parts if p.get("side") in ("L", "R")]
    if sided:
        side_shadow = {}
        for i, part in enumerate(parts):
            side = part.get("side")
            if side not in ("L", "R"):
                continue
            xf = merge_transform(show, atom, side)
            sh = None
            if side not in side_shadow:
                for j, s in enumerate(shadows):
                    if j not in side_shadow.values():
                        side_shadow[side] = j
                        sh = s
                        break
            else:
                sh = shadows[side_shadow[side]] if side_shadow[side] < len(shadows) else None
            apply_part_transform(part, sh, xf, floor, warns, f"{atom.get('id','?')} {side}")
        return
    # Unsided full plates (plate-pack / parity hero)
    xfL = merge_transform(show, atom, "L")
    xfR = merge_transform(show, atom, "R")
    xf = {
        "x": xfL["x"] + xfR["x"],
        "y": xfL["y"] if abs(xfL["y"]) > 1e-9 else xfR["y"],
        "scale": (xfL["scale"] or 1.0) * (xfR["scale"] or 1.0),
    }
    # Also honour show.char_screen_scale as an extra multiply (library path bakes it earlier)
    cscale = float(show.get("char_screen_scale") or 1.0)
    if abs(cscale - 1.0) > 1e-9:
        xf["scale"] = xf["scale"] * cscale
    if abs(xf["scale"] - 1.0) < 1e-9 and abs(xf["x"]) < 1e-9 and abs(xf["y"]) < 1e-9:
        return
    # Close-up `full` plates have no parts — materialize a 1280×720 part so framing applies.
    if entry.get("full") and not parts:
        part = {"src": entry["full"], "x": 0.0, "y": 0.0, "w": 1280.0, "h": 720.0}
        sh = {"cx": 640.0, "cy": float(floor), "rx": 400.0, "ry": 10.0}
        apply_part_transform(part, sh, xf, floor, warns, f"{atom.get('id','?')} full")
        entry["parts"] = [part]
        entry["shadows"] = [sh]
        del entry["full"]
        return
    for i, part in enumerate(parts):
        sh = shadows[i] if i < len(shadows) else (shadows[0] if shadows else None)
        apply_part_transform(part, sh, xf, floor, warns, f"{atom.get('id','?')} pair")

def normalize_overlays(show, dur, warns):
    EFFECT_TYPES = {"none","pop","slam","shake","flash","fade","bounce","slide_left","slide_right","spin_in","pulse","impact"}
    out = []
    for i, o in enumerate(show.get("overlays") or []):
        oid = o.get("id") or f"ov_{i+1}"
        kind = o.get("kind") or ("text" if o.get("text") else "image")
        src = o.get("src")
        text = o.get("text")
        if kind == "text":
            if not (text and str(text).strip()):
                warns.append(f"overlay {oid}: kind=text but empty text, skipped"); continue
        else:
            if not src:
                warns.append(f"overlay {oid}: missing src, skipped"); continue
        t0 = float(o.get("t_start", 0))
        t1 = float(o.get("t_end", t0 + 1))
        if t1 <= t0:
            warns.append(f"overlay {oid}: t_end <= t_start, skipped"); continue
        if t0 >= dur:
            warns.append(f"overlay {oid}: starts after show end ({t0}>={dur}), skipped"); continue
        row = {
            "id": oid,
            "kind": kind,
            "t_start": round(t0, 4),
            "t_end": round(min(t1, dur), 4),
            "x": float(o.get("x", 640)),
            "y": float(o.get("y", 200)),
            "scale": float(o.get("scale", 1) or 1),
            "opacity": float(o.get("opacity", 1) if o.get("opacity") is not None else 1),
            "z": float(o.get("z", 10)),
        }
        if src:
            row["src"] = src
        if text is not None:
            row["text"] = str(text)
        style = o.get("style")
        if isinstance(style, dict):
            row["style"] = {
                k: style[k] for k in ("fill", "stroke", "strokeWidth", "fontSize", "fontWeight", "italic", "fontFamily")
                if k in style and style[k] is not None
            }
        eff = o.get("effect")
        if isinstance(eff, str):
            et = eff if eff in EFFECT_TYPES else "none"
            row["effect"] = {"type": et, "intensity": 1.0}
        elif isinstance(eff, dict):
            et = eff.get("type") or "none"
            if et not in EFFECT_TYPES:
                warns.append(f"overlay {oid}: unknown effect {et!r}, using none"); et = "none"
            inten = float(eff.get("intensity", 1) or 1)
            inten = max(0.25, min(2.0, inten))
            row["effect"] = {"type": et, "intensity": inten}
            if "hold" in eff and eff["hold"] is not None:
                row["effect"]["hold"] = float(eff["hold"])
        out.append(row)
    out.sort(key=lambda x: (x["z"], x["t_start"]))
    return out


def map_layout_bg_to_key(src_bg, show_bg):
    """Map layout.json bg token (e.g. bg_rooftop) to player key base|swap via show.bg paths."""
    if not src_bg:
        return None
    token = str(src_bg).strip()
    token_base = os.path.splitext(os.path.basename(token))[0]
    for key in ("base", "swap"):
        path = show_bg.get(key)
        if not path:
            continue
        name = os.path.splitext(os.path.basename(path))[0]
        if token == name or token_base == name or token in path or token_base in path:
            return key
    return None

def is_parity_mode(show, atoms, n_hero, n_plate, dur):
    """True when show opts into parity OR auto-detects a full-timeline hero pack (~60 plates)."""
    if show.get("parity_mode") is True:
        return True
    if show.get("compose_mode") == "parity" or show.get("plate_pack") is True:
        return True
    if not atoms:
        return False
    all_hero = all(a.get("pose_mode") == "hero" for a in atoms)
    # Full Codex-style pack: ~60 plates covering ~30s, all hero
    return all_hero and n_hero == len(atoms) and n_plate >= 50 and (30 - 1e-6) <= dur <= (60 + 1e-6)

# ---------------- main compose ----------------
def compose(show_path, out_root=None):
    errors, warns = [], []
    show = jload(show_path); validate(show, "show", rel(show_path), errors)
    cams = {p["id"]: p for p in jload(f"{KIT}/presets/camera_presets.json")["presets"]}
    fxp = {h["id"]: h for h in jload(f"{KIT}/presets/fx_presets.json")["hooks"]}
    sdir = os.path.dirname(os.path.abspath(show_path))
    def kpath(p): return p if os.path.isabs(p) else os.path.normpath(os.path.join(KIT, p))
    atoms = []
    for a in show["atoms"]:
        if "ref" in a:
            ap = kpath(os.path.join("atoms", a["ref"] + ".json")); a = jload(ap)
        validate(a, "atom", f"atom {a.get('id')}", errors); atoms.append(a)
    if errors: raise ComposeError("\n".join(errors))
    libs = {}
    for side in ("L", "R"):
        lp = show["chars"][side].get("pose_library")
        if lp: libs[side] = load_library(kpath(lp), errors)
    if errors: raise ComposeError("\n".join(errors))
    floor = show.get("floor_y", 684); cscale = show.get("char_screen_scale", 1.0)
    bg = show["bg"]; swap_t = bg.get("swap_t") if bg.get("swap") else None
    layout, plates, tl_atoms = {}, [], []
    fx = {k: [] for k in ("hits", "flash", "hitstop", "shake", "bgflash", "dust", "sparks", "speed", "fence", "trails")}
    fx["pink_cut"] = None
    hero_layouts = {}
    t = 0.0; n_plate = 0; n_hero = 0
    for a in atoms:
        d = float(a["duration_s"]); npl = int(a["plates_needed"])
        if abs(npl - d * FPS_PLATES) > 1e-6: errors.append(f"{a['id']}: plates_needed {npl} != duration_s*2")
        t0, t1 = t, t + d
        # camera
        cam = a["camera"]; segs = cam.get("segments") or [{"preset": cam["preset"], "dur_s": d, "params": cam.get("params"), "u_range": cam.get("u_range")}]
        if abs(sum(s["dur_s"] for s in segs) - d) > 1e-6: errors.append(f"{a['id']}: camera segments sum != duration")
        cs, st = [], t0
        atom_nudge = cam.get("nudge") if isinstance(cam.get("nudge"), dict) else {}
        for s in segs:
            if s["preset"] not in cams: errors.append(f"{a['id']}: unknown camera preset {s['preset']}"); continue
            u0, u1 = (s.get("u_range") or [0, 1])
            seg_nudge = s.get("nudge") if isinstance(s.get("nudge"), dict) else atom_nudge
            curves = apply_cam_nudge(merge_curves(cams[s["preset"]], s.get("params")), seg_nudge)
            cs.append({"t0": round(st, 4), "t1": round(st + s["dur_s"], 4), "u0": u0, "u1": u1, "preset": s["preset"],
                       "curves": curves}); st += s["dur_s"]
        # plates
        mode = a["pose_mode"]; n_hero += mode == "hero"
        for i in range(npl):
            n_plate += 1; pid = f"S{n_plate:03d}"; pt0 = t0 + i / FPS_PLATES
            bgkey = "swap" if (swap_t is not None and pt0 + 1e-6 >= swap_t) else "base"
            entry = {"id": pid, "t": pt0, "atom": a["id"], "kind": a["kind"], "pose_mode": mode, "bg": bgkey}
            if mode == "hero":
                h = a.get("hero", {}); src_ids = h.get("plates") or []
                if i < len(src_ids):
                    lsrc = kpath(h["layout_source"])
                    if lsrc not in hero_layouts: hero_layouts[lsrc] = jload(lsrc)
                    se = hero_layouts[lsrc].get(src_ids[i])
                    if se is None: errors.append(f"{a['id']}: plate {src_ids[i]} not in {h['layout_source']}"); continue
                    ldir = os.path.dirname(lsrc)
                    # Per-plate bg / bg_zoom from layout.json (HM-COMPOSE-01). Prefer over show-level swap_t.
                    src_bg = se.get("bg")
                    if src_bg:
                        mapped = map_layout_bg_to_key(src_bg, bg)
                        if mapped:
                            entry["bg"] = mapped
                        else:
                            warns.append(f"{a['id']}: layout bg {src_bg!r} not in show.bg base/swap; keeping {entry['bg']}")
                    if se.get("bg_zoom") is not None:
                        entry["bg_zoom"] = se["bg_zoom"]
                    if "floor" in se and se["floor"] is not None:
                        entry["floor"] = se["floor"]
                    entry["source_plate"] = src_ids[i]; entry["kind"] = se.get("kind", a["kind"])
                    if se.get("full"): entry["full"] = rel(os.path.join(ldir, se["full"]))
                    else:
                        entry["parts"] = [dict(p, src=rel(os.path.join(ldir, p["src"]))) for p in se.get("parts", [])]
                        entry["shadows"] = se.get("shadows", [])
                else:
                    briefs = h.get("pose_briefs") or []
                    entry["slate"] = f"HERO PENDING · {a['motion']['beat_class']} · plate {i+1}/{npl}" + (f" · {briefs[i]}" if i < len(briefs) else "")
                    warns.append(f"{a['id']}: hero plate {i+1} not generated yet (slate)")
            else:
                parts, shadows, contact = place_library_plate(a, i, libs, floor, cscale, warns)
                entry.update(parts=parts, shadows=shadows, floor=floor)
                if contact: entry["contact"] = contact
            apply_layout_transforms(entry, show, a, warns)
            layout[pid] = entry; plates.append({"id": pid, "t0": round(pt0, 4), "t1": round(pt0 + 0.5, 4)})
        # fx hooks -> absolute events
        for hk in a.get("fx_hooks", []):
            p = fxp.get(hk["type"])
            if p is None: errors.append(f"{a['id']}: unknown fx hook {hk['type']}"); continue
            prm = dict(p.get("defaults", {})); prm.update(hk.get("params", {}))
            ht = round(t0 + hk["t_rel"] * d, 4); he = round(t0 + hk.get("t_rel_end", 1.0) * d, 4)
            col = prm.get("color", p.get("color"))
            for comp in p["components"]:
                if comp == "impact_burst": fx["hits"].append([ht, col])
                elif comp == "flash" and "impact_burst" not in p["components"]: fx["flash"].append([ht, col])
                elif comp == "hitstop_2f" and "impact_burst" not in p["components"]: fx["hitstop"].append(ht)
                elif comp == "shake" and "impact_burst" not in p["components"]: fx["shake"].append([ht, prm["amp"], prm["dur"]])
                elif comp == "tint": fx["bgflash"].append([ht, col])
                elif comp == "trail": fx["trails"].append([ht, prm["dir"]])
                elif comp == "dust": fx["dust"].append([ht, prm["k"]])
                elif comp == "speed": fx["speed"].append([ht, he, prm["mode"], prm["k0"], prm["k1"]])
                elif comp == "sparks": fx["sparks"].append([ht, prm["n"], prm.get("at")])
                elif comp == "fence": fx["fence"].append([ht, he, prm["k"]])
                elif comp == "pink_cut": fx["pink_cut"] = ht
        tl_atoms.append({"id": a["id"], "t0": round(t0, 4), "t1": round(t1, 4), "pose_mode": mode,
                         "beat": a["motion"]["beat_class"], "family": a["motion"]["family"], "cam": cs,
                         "source_refs": a.get("source_refs", [])})
        t = t1
    dur = round(t, 4)
    # guards
    if not (30 - 1e-6 <= dur <= 60 + 1e-6):
        (warns if show.get("draft") else errors).append(f"total duration {dur}s outside 30-60s" + (" (draft: allowed)" if show.get("draft") else ""))
    lo, hi = 6 * dur / 30, 8 * dur / 30
    parity = is_parity_mode(show, atoms, n_hero, n_plate, dur)
    if parity:
        # Full-timeline hero plate-pack: budget warn is noise (HM-COMPOSE-01).
        pass
    elif not (lo - 1e-6 <= n_hero <= hi + 1e-6):
        warns.append(f"hero budget: {n_hero} hero atoms for {dur}s (target {lo:.1f}-{hi:.1f})")
    if errors: raise ComposeError("\n".join(errors))
    # coarse cam keyframes for inspection (player evaluates the curves exactly)
    keys = []
    for a in tl_atoms:
        for s in a["cam"]:
            tt = s["t0"]
            while tt < s["t1"] - 1e-9:
                u = s["u0"] + (s["u1"] - s["u0"]) * (tt - s["t0"]) / (s["t1"] - s["t0"])
                c = eval_cam(s["curves"], u, tt - s["t0"]); keys.append([round(tt, 3)] + [round(c[ch], 3) for ch in "xysr"]); tt += 0.25
    overlays = normalize_overlays(show, dur, warns)
    for o in overlays:
        if o.get("src"):
            o["src"] = rel(kpath(o["src"]))
    timeline = {"show_id": show["show_id"], "title": show.get("title", show["show_id"]), "duration_s": dur,
                "fps_plates": FPS_PLATES, "floor_y": floor,
                "bg": {"base": rel(kpath(bg["base"])), "swap": rel(kpath(bg["swap"])) if bg.get("swap") else None, "swap_t": swap_t},
                "chars": show["chars"], "atoms": tl_atoms, "plates": plates, "fx": fx,
                "overlays": overlays,
                "cam_keys_cols": ["t", "x", "y", "s", "r"], "cam_keys": keys,
                "stats": {"atoms": len(atoms), "hero_atoms": n_hero, "library_atoms": len(atoms) - n_hero,
                          "plates": n_plate, "hero_budget": [round(lo, 2), round(hi, 2)],
                          "parity_mode": parity, "overlays": len(overlays)},
                "warnings": warns}
    out = os.path.join(out_root or f"{KIT}/out", show["show_id"]); os.makedirs(out, exist_ok=True)
    json.dump(layout, open(f"{out}/layout.json", "w"), ensure_ascii=False, indent=1)
    json.dump(timeline, open(f"{out}/timeline.json", "w"), ensure_ascii=False, indent=1)
    return {"ok": True, "out": rel(out), "duration_s": dur, "stats": timeline["stats"], "warnings": warns}

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("show"); ap.add_argument("--out")
    a = ap.parse_args()
    try:
        r = compose(a.show, a.out)
    except ComposeError as e:
        print("COMPOSE FAILED:\n" + str(e), file=sys.stderr); sys.exit(1)
    for w in r["warnings"]: print("WARN:", w)
    print(json.dumps({k: r[k] for k in ("out", "duration_s", "stats")}))

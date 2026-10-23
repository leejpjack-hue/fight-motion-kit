#!/usr/bin/env python3
"""Tiny local server for the composer UI (static files + JSON endpoints). No dependencies beyond compose.py.

  python3 composer/serve.py [--port 8770]
  open http://127.0.0.1:8770/ui/index.html

GET  /api/catalog            presets, fx hooks, beats, bg images, pose libraries, example shows
GET  /api/composed?show=<id> -> {ok, exists} checking out/<id>/timeline.json
POST /api/compose  {show, save:bool}   -> writes shows/<id>.json (if save) + out/<id>/{layout,timeline}.json
POST /api/save     {show}              -> writes shows/<id>.json only (no compose)
POST /api/upload   {name, data_b64}    -> uploads/<name> (character key images)
POST /api/qa_png   {name, data_b64}    -> qa/<name> (editor scrub still/strip)
POST /api/setup    {template, show_id, chars?, costume_lock?, generate_local?} -> show + setup manifest
POST /api/wording  {text, lang?, fontSize?, fill?, stroke?, strokeWidth?, italic?, fontWeight?, fontFamily?/font?}
                   -> uploads/wording_gen_<hash>.png (Pillow artificial wording; calligraphy default for zh)
POST /api/import_pack {show_id, source_path? OR zip_b64?/zip_name?, title?, copy?, compose?}
                   -> assets/<id>/ + shows/<id>.json + optional compose (HM-COMPOSE-01 plate-pack import)
POST /api/duplicate {from_id|source_id, to_id|show_id, title?, compose?}
                   -> copy show JSON + symlink assets/<to> (HM-COMPOSE-02 Save as)
GET  /api/plates?show=<id> -> plate / cutout inventory for plate-strip swap UI
"""
import json, os, sys, glob, base64, re, argparse, hashlib, time
from urllib.parse import urlparse, parse_qs
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import compose as C
KIT = C.KIT
sys.path.insert(0, os.path.join(KIT, "scripts"))
try:
    from import_plate_pack import import_plate_pack as _import_plate_pack
except Exception:
    _import_plate_pack = None
BEATS = ["windup", "jab", "straight", "hook", "uppercut", "elbow", "knee", "front_kick", "spin_kick", "sweep",
         "block", "parry", "duck", "slip", "clash", "skid", "leap_short", "cartwheel", "guard_recover", "impact_hold"]
WORDING_PRESETS = ["砰", "咚", "咔", "啪", "CLASH", "BANG", "HIT", "KO", "終", "WHOOSH"]

def rels(pattern): return sorted(C.rel(p) for p in glob.glob(os.path.join(KIT, pattern), recursive=True))

# CSS/UI family name -> kit-relative or absolute font file
FONT_FAMILY_FILES = {
    "Ma Shan Zheng": "assets/fonts/MaShanZheng-Regular.ttf",
    "Long Cang": "assets/fonts/LongCang-Regular.ttf",
    "Noto Serif CJK SC": "/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc",
    "Noto Sans CJK SC": "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
}

def _resolve_font_path(font_family=None, prefer_cjk=True):
    """Return absolute path for a family name, or CJK calligraphy default chain."""
    if font_family:
        key = str(font_family).strip().strip('"').strip("'")
        # allow raw path
        if key.endswith((".ttf", ".otf", ".ttc")):
            cand = key if os.path.isabs(key) else os.path.join(KIT, key)
            if os.path.isfile(cand):
                return cand
        rel = FONT_FAMILY_FILES.get(key)
        if rel:
            cand = rel if os.path.isabs(rel) else os.path.join(KIT, rel)
            if os.path.isfile(cand):
                return cand
        # case-insensitive / partial match
        for name, rel in FONT_FAMILY_FILES.items():
            if name.lower() == key.lower() or key.lower() in name.lower():
                cand = rel if os.path.isabs(rel) else os.path.join(KIT, rel)
                if os.path.isfile(cand):
                    return cand
    candidates = []
    if prefer_cjk:
        candidates += [
            os.path.join(KIT, "assets/fonts/MaShanZheng-Regular.ttf"),
            os.path.join(KIT, "assets/fonts/LongCang-Regular.ttf"),
            "/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc",
            "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc",
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
            "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Bold.otf",
            "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
        ]
    candidates += [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    for path in candidates:
        if os.path.isfile(path):
            return path
    return None

def _pick_font(size, prefer_cjk=True, font_family=None):
    from PIL import ImageFont
    path = _resolve_font_path(font_family, prefer_cjk=prefer_cjk)
    if path:
        try:
            return ImageFont.truetype(path, size=size)
        except Exception:
            pass
    return ImageFont.load_default()

def render_wording_png(text, *, lang="zh", font_size=96, fill="#ffe66d", stroke="#1a0a00",
                       stroke_width=8, italic=False, font_weight="900", font_family=None):
    """Return (bytes_png, meta). Transparent fight-impact glyph art (calligraphy default for zh)."""
    from PIL import Image, ImageDraw, ImageFont, ImageFilter
    text = (text or "").strip() or "!"
    prefer_cjk = lang.startswith("zh") or any(ord(c) > 0x2E80 for c in text)
    # pad for stroke + italic lean
    pad = max(24, int(stroke_width) * 2 + 16)
    # measure on oversized canvas
    font = _pick_font(int(font_size), prefer_cjk=prefer_cjk, font_family=font_family)
    probe = Image.new("RGBA", (8, 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(probe)
    bbox = d.textbbox((0, 0), text, font=font, stroke_width=int(stroke_width))
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    w = max(32, tw + pad * 2 + (int(font_size * 0.15) if italic else 0))
    h = max(32, th + pad * 2)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    x0 = pad - bbox[0]
    y0 = pad - bbox[1]
    if italic:
        # shear via affine
        shear = 0.22
        # draw on temp then transform
        tmp = Image.new("RGBA", (w + int(h * shear) + 8, h), (0, 0, 0, 0))
        ImageDraw.Draw(tmp).text((x0 + int(h * shear * 0.3), y0), text, font=font,
                                 fill=fill, stroke_width=int(stroke_width), stroke_fill=stroke)
        im = tmp.transform(im.size, Image.AFFINE, (1, shear, -int(h * shear * 0.35), 0, 1, 0),
                           resample=Image.BICUBIC)
    else:
        draw.text((x0, y0), text, font=font, fill=fill,
                  stroke_width=int(stroke_width), stroke_fill=stroke)
    # slight outer glow for fight feel
    glow = im.filter(ImageFilter.GaussianBlur(radius=max(1, int(font_size / 48))))
    base = Image.new("RGBA", im.size, (0, 0, 0, 0))
    base = Image.alpha_composite(base, glow)
    base = Image.alpha_composite(base, im)
    import io
    buf = io.BytesIO()
    base.save(buf, format="PNG")
    return buf.getvalue(), {"w": base.size[0], "h": base.size[1], "text": text}

def _list_templates():
    out = []
    for p in rels("templates/*.json"):
        try:
            j = C.jload(os.path.join(KIT, p))
            out.append({"id": j.get("id") or os.path.splitext(os.path.basename(p))[0], "path": p,
                        "label": j.get("label") or j.get("id") or p, "seed_show": j.get("seed_show"),
                        "kind": j.get("kind", "show_template")})
        except Exception as e:
            out.append({"path": p, "error": str(e)})
    # also expose seed shows as pseudo-templates
    for p in ("shows/wording-fx.json", "shows/zhao-hua-parity.json", "shows/library-smoke.json", "shows/editor-features.json"):
        fp = os.path.join(KIT, p)
        if os.path.isfile(fp):
            try:
                j = C.jload(fp)
                out.append({"id": p, "path": p, "label": "show: " + j.get("show_id", p), "seed_show": p, "kind": "show_seed"})
            except Exception:
                pass
    return out

def run_template_setup(body):
    """Materialize show from template + build image manifest; generate local assets (Pillow wording)."""
    tpl_ref = (body.get("template") or "").strip()
    sid = (body.get("show_id") or "").strip()
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", sid or ""):
        return {"ok": False, "errors": ["show_id must match ^[a-z0-9][a-z0-9_-]*$"]}
    if not tpl_ref:
        return {"ok": False, "errors": ["template required"]}
    # resolve template JSON or seed show
    tpl = None
    seed_path = None
    cand = [
        os.path.join(KIT, tpl_ref),
        os.path.join(KIT, "templates", tpl_ref if tpl_ref.endswith(".json") else tpl_ref + ".json"),
        os.path.join(KIT, "shows", tpl_ref if tpl_ref.endswith(".json") else tpl_ref + ".json"),
    ]
    for c in cand:
        if os.path.isfile(c):
            j = C.jload(c)
            if "seed_show" in j or j.get("kind") == "show_template":
                tpl = j
                seed_path = os.path.join(KIT, j["seed_show"]) if j.get("seed_show") else None
            else:
                # raw show used as seed
                seed_path = c
                tpl = {"id": os.path.basename(c), "seed_show": C.rel(c), "image_jobs": {"wording_from_overlays": True, "require_pose_pngs": True, "hero_plates": "pending_generate_image"}}
            break
    if not seed_path or not os.path.isfile(seed_path):
        return {"ok": False, "errors": [f"could not resolve template/seed: {tpl_ref}"]}
    show = C.jload(seed_path)
    show = json.loads(json.dumps(show))  # deep copy
    show["show_id"] = sid
    if body.get("title"):
        show["title"] = body["title"]
    else:
        show["title"] = (show.get("title") or sid) + " (setup)"
    # apply char libraries
    chars = body.get("chars") or {}
    for side in ("L", "R"):
        show.setdefault("chars", {}).setdefault(side, {})
        if side in chars and isinstance(chars[side], dict):
            for k, v in chars[side].items():
                if v:
                    show["chars"][side][k] = v
    if body.get("costume_lock"):
        show.setdefault("meta", {})["costume_lock"] = body["costume_lock"]
    defaults = (tpl or {}).get("defaults") or {}
    if "draft" in defaults:
        show["draft"] = defaults["draft"]
    show["draft"] = True if body.get("draft", True) else show.get("draft", False)

    # write show
    show_path = os.path.join(KIT, "shows", f"{sid}.json")
    os.makedirs(os.path.dirname(show_path), exist_ok=True)
    json.dump(show, open(show_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    setup_dir = os.path.join(KIT, "setup", sid)
    os.makedirs(setup_dir, exist_ok=True)
    raw_dir = os.path.join(setup_dir, "raw")
    os.makedirs(raw_dir, exist_ok=True)

    jobs = []
    generated = []
    pending = []
    jobs_cfg = (tpl or {}).get("image_jobs") or {}

    # pose PNG existence checks
    if jobs_cfg.get("require_pose_pngs", True):
        for side in ("L", "R"):
            lib_rel = (show.get("chars") or {}).get(side, {}).get("pose_library")
            if not lib_rel:
                continue
            lib_path = os.path.join(KIT, lib_rel)
            if not os.path.isfile(lib_path):
                pending.append({"slot": f"pose_lib_{side}", "status": "missing_library", "path": lib_rel})
                continue
            lib = C.jload(lib_path)
            base = os.path.dirname(lib_path)
            needed = set()
            for a in show.get("atoms") or []:
                if a.get("pose_mode") != "library":
                    continue
                poses = (a.get("poses") or {}).get(side)
                if isinstance(poses, list):
                    needed.update(poses)
                elif poses:
                    needed.add(poses)
            for pid in sorted(needed):
                pose = next((q for q in lib.get("poses") or [] if q.get("pose_id") == pid), None)
                slot = {"slot": f"pose_{side}_{pid}", "kind": "pose_png", "pose_id": pid, "side": side}
                if not pose:
                    slot["status"] = "missing_pose_entry"; pending.append(slot); jobs.append(slot); continue
                png_abs = os.path.join(base, pose["png"])
                slot["out"] = C.rel(png_abs)
                slot["ref"] = slot["out"]
                if os.path.isfile(png_abs):
                    slot["status"] = "exists"; generated.append(slot)
                else:
                    slot["status"] = "missing_file"; pending.append(slot)
                jobs.append(slot)

    # hero plates → pending GenerateImage stubs
    if jobs_cfg.get("hero_plates") == "pending_generate_image":
        for a in show.get("atoms") or []:
            if a.get("pose_mode") != "hero":
                continue
            plates = ((a.get("hero") or {}).get("plates")) or []
            briefs = ((a.get("hero") or {}).get("pose_briefs")) or []
            if not plates:
                # unknown plate count from duration
                n = int(round(float(a.get("duration_s") or 1) * 2))
                plates = [f"P{str(i+1).zfill(2)}" for i in range(n)]
            for i, pl in enumerate(plates):
                out_rel = f"setup/{sid}/raw/{a.get('id','atom')}_{pl}.png"
                slot = {
                    "slot": f"hero_{a.get('id','atom')}_{pl}",
                    "kind": "hero_plate",
                    "atom_id": a.get("id"),
                    "plate": pl,
                    "out": out_rel,
                    "status": "pending_generate_image",
                    "prompt": {
                        "brief": (briefs[i] if i < len(briefs) else briefs[-1] if briefs else f"hero fight plate {pl} for {a.get('id')}"),
                        "camera": a.get("camera"),
                        "beat": (a.get("motion") or {}).get("beat_class"),
                        "chars": {s: show["chars"][s].get("name") for s in ("L", "R") if s in show.get("chars", {})},
                    },
                    "ASSET_MAP_stub": {out_rel: None},
                }
                pending.append(slot); jobs.append(slot)

    # wording overlays — generate locally via Pillow when generate_local
    gen_local = body.get("generate_local", True)
    if jobs_cfg.get("wording_from_overlays", True):
        for o in show.get("overlays") or []:
            text = o.get("text") if (o.get("kind") == "text" or o.get("text")) else None
            if not text:
                # legacy PNG — just record
                if o.get("src"):
                    slot = {"slot": f"ov_{o.get('id','x')}", "kind": "wording_png_ref", "out": o["src"],
                            "status": "exists" if os.path.isfile(os.path.join(KIT, o["src"])) else "missing_file"}
                    jobs.append(slot)
                    (generated if slot["status"] == "exists" else pending).append(slot)
                continue
            st = o.get("style") or {}
            digest_key = f"{text}|{st.get('fontFamily')}|{st.get('fontSize')}|{st.get('fill')}"
            name = "wording_setup_" + re.sub(r"[^A-Za-z0-9._-]", "", text)[:12] + "_" + hashlib.sha1(digest_key.encode()).hexdigest()[:8] + ".png"
            out_rel = f"uploads/{name}"
            slot = {"slot": f"ov_{o.get('id','x')}", "kind": "wording_pillow", "text": text, "out": out_rel, "overlay_id": o.get("id")}
            if gen_local:
                try:
                    png, meta = render_wording_png(
                        text,
                        lang="zh" if any(ord(c) > 0x2E80 for c in text) else "en",
                        font_size=int(st.get("fontSize") or 96),
                        fill=st.get("fill") or "#ffe66d",
                        stroke=st.get("stroke") or "#1a0a00",
                        stroke_width=int(st.get("strokeWidth") or 8),
                        italic=bool(st.get("italic")),
                        font_weight=str(st.get("fontWeight") or "400"),
                        font_family=st.get("fontFamily") or "Ma Shan Zheng",
                    )
                    os.makedirs(os.path.join(KIT, "uploads"), exist_ok=True)
                    open(os.path.join(KIT, out_rel), "wb").write(png)
                    # also copy under setup/raw
                    open(os.path.join(raw_dir, name), "wb").write(png)
                    slot["status"] = "generated"
                    slot["meta"] = meta
                    slot["raw"] = f"setup/{sid}/raw/{name}"
                    # optional: attach src for PNG fallback path without changing text overlay
                    generated.append(slot)
                except Exception as e:
                    slot["status"] = "error"; slot["error"] = repr(e); pending.append(slot)
            else:
                slot["status"] = "planned"; pending.append(slot)
            jobs.append(slot)

    manifest = {
        "show_id": sid,
        "template": tpl.get("id") if tpl else tpl_ref,
        "seed_show": C.rel(seed_path),
        "show_path": C.rel(show_path),
        "created": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "setup_status": "ready_local" if not any(j.get("status") == "pending_generate_image" for j in jobs) else "pending_generate_image",
        "jobs": jobs,
        "counts": {
            "jobs": len(jobs),
            "generated_or_exists": len(generated),
            "pending": len(pending),
            "pending_generate_image": sum(1 for j in jobs if j.get("status") == "pending_generate_image"),
        },
    }
    man_path = os.path.join(KIT, "shows", f"{sid}.setup.json")
    json.dump(manifest, open(man_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    json.dump(manifest, open(os.path.join(setup_dir, "manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    return {
        "ok": True,
        "show_path": C.rel(show_path),
        "manifest": C.rel(man_path),
        "setup_dir": f"setup/{sid}",
        "setup_status": manifest["setup_status"],
        "generated": len(generated),
        "pending": len(pending),
        "pending_generate": manifest["counts"]["pending_generate_image"],
        "counts": manifest["counts"],
    }



def _safe_sid(sid):
    return bool(re.fullmatch(r"[a-z0-9][a-z0-9_-]*", sid or ""))

def duplicate_show(from_id, to_id, title=None, compose=True):
    """HM-COMPOSE-02: Save-as / duplicate a show under a new id (kit-local only).

    Rewrites assets/<from>/ → assets/<to>/ in the show JSON and symlinks
    assets/<to> → assets/<from> when the source assets dir exists. Never touches
    the gold source pack outside the kit.
    """
    if not _safe_sid(from_id) or not _safe_sid(to_id):
        return {"ok": False, "errors": ["from_id/to_id must match ^[a-z0-9][a-z0-9_-]*$"]}
    if from_id == to_id:
        return {"ok": False, "errors": ["to_id must differ from from_id"]}
    src_show = os.path.join(KIT, "shows", f"{from_id}.json")
    if not os.path.isfile(src_show):
        return {"ok": False, "errors": [f"source show not found: shows/{from_id}.json"]}
    dst_show = os.path.join(KIT, "shows", f"{to_id}.json")
    if os.path.exists(dst_show):
        return {"ok": False, "errors": [f"target show already exists: shows/{to_id}.json"]}
    raw = open(src_show, encoding="utf-8").read()
    # Rewrite asset-root references when present
    old_prefix = f"assets/{from_id}"
    new_prefix = f"assets/{to_id}"
    if old_prefix in raw:
        raw = raw.replace(old_prefix, new_prefix)
    show = json.loads(raw)
    show["show_id"] = to_id
    if title:
        show["title"] = title
    else:
        base = show.get("title") or to_id
        if not str(base).endswith(f"({to_id})"):
            show["title"] = f"{base} · {to_id}"
    meta = dict(show.get("meta") or {})
    meta["duplicated_from"] = from_id
    meta["duplicate"] = "HM-COMPOSE-02"
    show["meta"] = meta
    # Symlink assets dir so plate/cutout/bg/layout resolve under new id
    src_assets = os.path.join(KIT, "assets", from_id)
    dst_assets = os.path.join(KIT, "assets", to_id)
    linked = None
    if os.path.isdir(src_assets) or os.path.islink(src_assets):
        if os.path.lexists(dst_assets):
            return {"ok": False, "errors": [f"assets/{to_id} already exists"]}
        os.symlink(os.path.abspath(src_assets), dst_assets)
        linked = f"assets/{to_id} -> assets/{from_id}"
    os.makedirs(os.path.dirname(dst_show), exist_ok=True)
    json.dump(show, open(dst_show, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    out = {
        "ok": True,
        "from_id": from_id,
        "show_id": to_id,
        "show_path": C.rel(dst_show),
        "assets_link": linked,
        "player": f"/player/index.html?show={to_id}",
    }
    if compose:
        try:
            r = C.compose(dst_show)
            out["compose"] = {"ok": r.get("ok", True), "stats": r.get("stats"), "warnings": r.get("warnings") or [],
                              "budget_errors": r.get("budget_errors"), "budget_warns": r.get("budget_warns"),
                              "out": r.get("out"), "duration_s": r.get("duration_s")}
        except C.ComposeError as e:
            out["compose"] = {"ok": False, "errors": str(e).split("\n")}
        except Exception as e:
            out["compose"] = {"ok": False, "errors": [repr(e)]}
    return out

def list_plates_for_show(sid):
    """Return plates/ + cutout/ inventory for the show's assets dir (plate-strip UI)."""
    if not _safe_sid(sid):
        return {"ok": False, "errors": ["bad show id"]}
    show_path = os.path.join(KIT, "shows", f"{sid}.json")
    asset_dir = os.path.join(KIT, "assets", sid)
    # Also honour layout_source dirname if assets/<sid> missing
    layout_src = None
    used = []
    if os.path.isfile(show_path):
        show = json.load(open(show_path, encoding="utf-8"))
        for a in show.get("atoms") or []:
            for p in ((a.get("hero") or {}).get("plates") or []):
                used.append(p)
            ls = (a.get("hero") or {}).get("layout_source")
            if ls and not layout_src:
                layout_src = ls
    if not os.path.isdir(asset_dir) and layout_src:
        # layout_source like assets/foo/layout.json
        cand = os.path.dirname(os.path.join(KIT, layout_src) if not os.path.isabs(layout_src) else layout_src)
        if os.path.isdir(cand):
            asset_dir = cand
    plates, cutouts = [], []
    for sub, bucket in (("plates", plates), ("cutout", cutouts)):
        d = os.path.join(asset_dir, sub)
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            if not name.lower().endswith((".png", ".webp", ".jpg", ".jpeg")):
                continue
            pid = os.path.splitext(name)[0]
            rel = C.rel(os.path.join(d, name))
            bucket.append({"id": pid, "file": name, "src": rel, "url": "/" + rel})
    return {
        "ok": True,
        "show_id": sid,
        "assets_dir": C.rel(asset_dir) if os.path.isdir(asset_dir) else None,
        "plates": plates,
        "cutouts": cutouts,
        "used_in_show": used,
        "plate_count": len(plates) or len(cutouts),
    }

def catalog():
    libs = []
    for p in rels("libraries/*/pose_library.json") + rels("pose_library/*/pose_library.json"):
        try:
            j = C.jload(os.path.join(KIT, p)); libs.append({"path": p, "character": j.get("character"), "placeholder": j.get("placeholder", False),
                "poses": [{"pose_id": q["pose_id"], "png": C.rel(os.path.join(KIT, os.path.dirname(p), q["png"])),
                           "tags": q.get("beat_tags", []), "facing": q.get("facing"), "scale": q.get("scale", 1.0),
                           "size": q.get("size"), "foot_anchor_xy": q.get("foot_anchor_xy"),
                           "hand_hit_xy": q.get("hand_hit_xy"), "head_xy": q.get("head_xy")} for q in j["poses"]]})
        except Exception as e: libs.append({"path": p, "error": str(e)})
    shows = []
    for p in rels("shows/*.json"):
        try: shows.append({"path": p, "show": C.jload(os.path.join(KIT, p))})
        except Exception as e: shows.append({"path": p, "error": str(e)})
    return {"presets": C.jload(f"{KIT}/presets/camera_presets.json")["presets"],
            "fx": C.jload(f"{KIT}/presets/fx_presets.json")["hooks"],
            "families": {"fight": BEATS}, "bgs": rels("assets/**/bg/*.png") + rels("bg/*.png"),
            "wording": rels("assets/wording/*.png") + rels("uploads/wording_*.png") + rels("uploads/wording_gen_*.png"),
            "wording_presets": WORDING_PRESETS,
            "overlay_effects": ["none","pop","slam","shake","flash","fade","bounce","slide_left","slide_right","spin_in","pulse","impact"],
            "fonts": [
                {"id": "Ma Shan Zheng", "label": "書法·马善政", "file": "assets/fonts/MaShanZheng-Regular.ttf"},
                {"id": "Long Cang", "label": "草書·龙藏", "file": "assets/fonts/LongCang-Regular.ttf"},
                {"id": "Noto Serif CJK SC", "label": "Noto Serif CJK"},
                {"id": "Noto Sans CJK SC", "label": "Noto Sans CJK"},
            ],
            "libraries": libs, "shows": shows, "uploads": rels("uploads/*"),
            "layouts": rels("assets/*/layout.json"),
            "templates": _list_templates()}
class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=KIT, **k)
    def log_message(self, *a): pass
    def _json(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode(); self.send_response(code)
        self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        u = urlparse(self.path)
        if u.path.startswith("/api/catalog"): return self._json(200, catalog())
        if u.path.startswith("/api/composed"):
            qs = parse_qs(u.query); sid = (qs.get("show") or [""])[0]
            if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", sid or ""):
                return self._json(400, {"ok": False, "exists": False, "errors": ["bad show id"]})
            exists = os.path.isfile(os.path.join(KIT, "out", sid, "timeline.json"))
            return self._json(200, {"ok": True, "exists": exists, "player": f"/player/index.html?show={sid}"})
        if u.path.startswith("/api/plates"):
            qs = parse_qs(u.query); sid = (qs.get("show") or [""])[0]
            r = list_plates_for_show(sid)
            return self._json(200 if r.get("ok") else 400, r)
        if self.path in ("/", ""): self.send_response(302); self.send_header("Location", "/ui/index.html"); self.end_headers(); return
        return super().do_GET()
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0)); body = json.loads(self.rfile.read(n) or b"{}")
        if self.path.startswith("/api/save"):
            show = body.get("show") or {}; sid = show.get("show_id", "")
            if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", sid): return self._json(400, {"ok": False, "errors": ["show_id must match ^[a-z0-9][a-z0-9_-]*$"]})
            path = os.path.join(KIT, "shows", f"{sid}.json")
            os.makedirs(os.path.dirname(path), exist_ok=True)
            json.dump(show, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            return self._json(200, {"ok": True, "path": C.rel(path)})
        if self.path.startswith("/api/compose"):
            show = body.get("show") or {}; sid = show.get("show_id", "")
            if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", sid): return self._json(400, {"ok": False, "errors": ["show_id must match ^[a-z0-9][a-z0-9_-]*$"]})
            path = os.path.join(KIT, "shows", f"{sid}.json") if body.get("save", True) and not body.get("dry") else os.path.join(KIT, "out", f".tmp-{sid}.json")
            os.makedirs(os.path.dirname(path), exist_ok=True)
            json.dump(show, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            try: r = C.compose(path, os.path.join(KIT, "out", ".dry") if body.get("dry") else None); r["show_path"] = C.rel(path); r["player"] = f"/player/index.html?show={sid}"; return self._json(200, r)
            except C.ComposeError as e: return self._json(400, {"ok": False, "errors": str(e).split("\n")})
            except Exception as e: return self._json(500, {"ok": False, "errors": [repr(e)]})
        if self.path.startswith("/api/wording"):
            text = (body.get("text") or "").strip()
            if not text:
                return self._json(400, {"ok": False, "errors": ["text required"]})
            lang = body.get("lang") or ("zh" if any(ord(c) > 0x2E80 for c in text) else "en")
            try:
                png, meta = render_wording_png(
                    text,
                    lang=lang,
                    font_size=int(body.get("fontSize") or body.get("font_size") or 96),
                    fill=body.get("fill") or "#ffe66d",
                    stroke=body.get("stroke") or "#1a0a00",
                    stroke_width=int(body.get("strokeWidth") or body.get("stroke_width") or 8),
                    italic=bool(body.get("italic")),
                    font_weight=str(body.get("fontWeight") or body.get("font_weight") or "900"),
                    font_family=body.get("fontFamily") or body.get("font_family") or body.get("font"),
                )
            except Exception as e:
                return self._json(500, {"ok": False, "errors": [repr(e)]})
            digest = hashlib.sha1(png).hexdigest()[:10]
            ascii_safe = re.sub(r"[^A-Za-z0-9._-]", "", text)[:16]
            if not ascii_safe:
                ascii_safe = "zh" if any(ord(c) > 0x2E80 for c in text) else "glyph"
            name = f"wording_gen_{ascii_safe}_{digest}.png"
            os.makedirs(os.path.join(KIT, "uploads"), exist_ok=True)
            path = os.path.join(KIT, "uploads", name)
            open(path, "wb").write(png)
            return self._json(200, {"ok": True, "path": f"uploads/{name}", "meta": meta})
        if self.path.startswith("/api/setup"):
            try:
                return self._json(200 if (r := run_template_setup(body)).get("ok") else 400, r)
            except Exception as e:
                return self._json(500, {"ok": False, "errors": [repr(e)]})
        if self.path.startswith("/api/qa_png"):
            # Write a PNG (data_b64) under qa/ for Editor v4 scrub export. Name sanitized.
            name = re.sub(r"[^A-Za-z0-9._-]", "_", body.get("name", "scrub.png"))[-120:]
            if not name.lower().endswith(".png"): name += ".png"
            os.makedirs(os.path.join(KIT, "qa"), exist_ok=True)
            path = os.path.join(KIT, "qa", name)
            open(path, "wb").write(base64.b64decode(body.get("data_b64", "")))
            return self._json(200, {"ok": True, "path": f"qa/{name}"})
        if self.path.startswith("/api/duplicate"):
            from_id = (body.get("from_id") or body.get("source_id") or body.get("from") or "").strip()
            to_id = (body.get("to_id") or body.get("show_id") or body.get("to") or "").strip()
            title = body.get("title")
            do_compose = True if body.get("compose", True) else False
            try:
                r = duplicate_show(from_id, to_id, title=title, compose=do_compose)
            except Exception as e:
                return self._json(500, {"ok": False, "errors": [repr(e)]})
            return self._json(200 if r.get("ok") else 400, r)
        if self.path.startswith("/api/import_pack"):
            if _import_plate_pack is None:
                return self._json(500, {"ok": False, "errors": ["import_plate_pack module unavailable"]})
            sid = (body.get("show_id") or "").strip()
            source_path = (body.get("source_path") or body.get("source") or "").strip() or None
            title = body.get("title")
            copy_assets = bool(body.get("copy") or body.get("copy_assets"))
            do_compose = True if body.get("compose", True) else False
            zip_path = None
            # Accept zip via path or base64 upload (saved under uploads/packs/)
            if body.get("zip_path"):
                zip_path = body["zip_path"] if os.path.isabs(body["zip_path"]) else os.path.join(KIT, body["zip_path"])
            elif body.get("zip_b64"):
                zname = re.sub(r"[^A-Za-z0-9._-]", "_", body.get("zip_name") or f"{sid or 'pack'}.zip")[-80:]
                if not zname.lower().endswith(".zip"):
                    zname += ".zip"
                os.makedirs(os.path.join(KIT, "uploads", "packs"), exist_ok=True)
                zip_path = os.path.join(KIT, "uploads", "packs", zname)
                open(zip_path, "wb").write(base64.b64decode(body.get("zip_b64", "")))
            try:
                r = _import_plate_pack(
                    source_path=source_path,
                    zip_path=zip_path,
                    show_id=sid,
                    title=title,
                    copy_assets=copy_assets,
                    compose=do_compose,
                    kit=KIT,
                )
            except Exception as e:
                return self._json(500, {"ok": False, "errors": [repr(e)]})
            return self._json(200 if r.get("ok") else 400, r)
        if self.path.startswith("/api/upload"):
            name = re.sub(r"[^A-Za-z0-9._-]", "_", body.get("name", "upload.png"))[-80:]
            os.makedirs(os.path.join(KIT, "uploads"), exist_ok=True)
            open(os.path.join(KIT, "uploads", name), "wb").write(base64.b64decode(body.get("data_b64", "")))
            return self._json(200, {"ok": True, "path": f"uploads/{name}"})
        self._json(404, {"ok": False})
if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--port", type=int, default=8770); ap.add_argument("--host", default="127.0.0.1"); a = ap.parse_args()
    print(f"HTML Motion composer UI: http://{a.host}:{a.port}/ui/index.html"); ThreadingHTTPServer((a.host, a.port), H).serve_forever()

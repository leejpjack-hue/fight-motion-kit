#!/usr/bin/env python3
"""Import a Codex-style plate pack into the HTML Motion kit as a hero parity show.

Point at a folder (or zip) containing:
  index.html, html/layout.json, bg/, cutout/, plates/

Produces:
  assets/<show_id>/  (symlinks by default; optional copy)
  shows/<show_id>.json
  out/<show_id>/{layout,timeline}.json  (when compose=True)

Reuses the same 25-atom cam/FX map as make_daiyu_wang_codex_show.py /
make_parity_show.py so a full 60-plate pack becomes a playable ?show= without
shell symlinks or a one-off make_*_show.py.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import zipfile
from typing import Any, Optional

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def P(a, b):
    return [f"P{i:02d}" for i in range(a, b + 1)]


def hk(t, typ, end=None, **params):
    h = {"t_rel": t, "type": typ}
    if end is not None:
        h["t_rel_end"] = end
    if params:
        h["params"] = params
    return h


# Same cam/FX atom map as make_daiyu_wang_codex_show.py / make_parity_show.py
ATOM_SPEC = [
    ("low_rise", 1, "duo", {"preset": "low_rise"}, "clash", P(1, 2), [hk(.05, "hit_orange")], "camBase[0,1)"),
    ("eye_orbit", 1, "duo", {"preset": "eye_orbit"}, "straight", P(3, 4), [hk(0, "dust"), hk(.5, "dust"), hk(.5, "smear_trail", dir=1)], "camBase[1,2)"),
    ("eye_push", 1, "duo", {"preset": "eye_push"}, "uppercut", P(5, 6), [hk(0, "speed_lines", 1, mode="up")], "camBase[2,3)"),
    ("ecu_fist_lens", 1, "duo", {"preset": "ecu_fist_lens"}, "straight", P(7, 8), [hk(0, "hit_pink"), hk(.5, "hit_pink"), hk(.5, "dust", k=1.2)], "camBase[3,4)"),
    ("ecu_jitter", 1.5, "close", {"preset": "ecu_jitter"}, "impact_hold", P(9, 11), [hk(0, "bg_flash_blue")], "camBase[4,5.5)"),
    ("dive_then_inside", 1.5, "duo", {"segments": [{"preset": "low_dive_under", "dur_s": .5}, {"preset": "upward_inside", "dur_s": 1}]}, "hook", P(12, 14), [hk(1 / 3, "hit_orange")], "camBase[5.5,6)+[6,7)"),
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
    ("pass_between_a", 2, "duo", {"preset": "pass_between", "u_range": [0, 2 / 3]}, "hook", P(47, 50), [hk(.25, "hit_pink"), hk(.75, "hit_orange")], "camBase[23,26) part 1"),
    ("pass_between_b", 1, "duo", {"preset": "pass_between", "u_range": [2 / 3, 1]}, "guard_recover", P(51, 52), [hk(0, "hit_pink"), hk(.5, "dust")], "camBase[23,26) part 2"),
    ("dutch_spiral_a", 2, "leap", {"preset": "dutch_spiral", "u_range": [0, .5]}, "leap_short", P(53, 56), [hk(0, "dust", k=2.2), hk(0, "speed_lines", 1, mode="radial", k0=0, k1=.5)], "camBase[26,30) part 1"),
    ("dutch_spiral_b", 2, "tight", {"preset": "dutch_spiral", "u_range": [.5, 1]}, "clash", P(57, 60), [hk(0, "speed_lines", 1, mode="radial", k0=.5, k1=1), hk(.95, "pink_cut")], "camBase[26,30) part 2"),
]


def _rel(p: str) -> str:
    return os.path.relpath(os.path.abspath(p), KIT).replace(os.sep, "/")


def _safe_show_id(sid: str) -> bool:
    return bool(re.fullmatch(r"[a-z0-9][a-z0-9_-]*", sid or ""))


def _find_pack_root(path: str) -> str:
    """Accept pack root or a nested folder that contains html/layout.json."""
    path = os.path.abspath(path)
    if os.path.isfile(os.path.join(path, "html", "layout.json")):
        return path
    # zip extract sometimes wraps one top-level dir
    if os.path.isdir(path):
        for name in sorted(os.listdir(path)):
            cand = os.path.join(path, name)
            if os.path.isdir(cand) and os.path.isfile(os.path.join(cand, "html", "layout.json")):
                return cand
    raise ValueError(f"not a Codex plate pack (missing html/layout.json): {path}")


def _validate_pack(root: str) -> dict:
    layout = os.path.join(root, "html", "layout.json")
    bg = os.path.join(root, "bg")
    cutout = os.path.join(root, "cutout")
    plates = os.path.join(root, "plates")
    missing = [lab for lab, p in (("html/layout.json", layout), ("bg/", bg), ("cutout/", cutout), ("plates/", plates))
               if not (os.path.isfile(p) if lab.endswith(".json") else os.path.isdir(p))]
    if missing:
        raise ValueError("pack missing required paths: " + ", ".join(missing))
    return {"layout": layout, "bg": bg, "cutout": cutout, "plates": plates,
            "index": os.path.join(root, "index.html") if os.path.isfile(os.path.join(root, "index.html")) else None}


def _link_or_copy(src: str, dst: str, copy: bool) -> None:
    if os.path.lexists(dst):
        if os.path.islink(dst) or os.path.isfile(dst):
            os.unlink(dst)
        elif os.path.isdir(dst) and not os.path.islink(dst):
            shutil.rmtree(dst)
        else:
            os.unlink(dst)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if copy:
        if os.path.isdir(src):
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)
    else:
        os.symlink(os.path.abspath(src), dst)


def _read_title(index_path: Optional[str], layout_path: str) -> str:
    if index_path and os.path.isfile(index_path):
        try:
            html = open(index_path, encoding="utf-8", errors="ignore").read(4000)
            m = re.search(r"<title>([^<]+)</title>", html, re.I)
            if m:
                return m.group(1).strip()
        except OSError:
            pass
    return os.path.basename(os.path.dirname(os.path.dirname(layout_path)))


def _infer_chars(title: str) -> dict:
    # "林黛玉 vs 王熙鳳 — …" / "趙敏 vs 華妃 — …"
    m = re.search(r"^\s*(.+?)\s+vs\.?\s+(.+?)(?:\s*[—\-|·].*)?$", title, re.I)
    if m:
        return {"L": {"name": m.group(1).strip()}, "R": {"name": m.group(2).strip()}}
    return {"L": {"name": "L (Codex plates)"}, "R": {"name": "R (Codex plates)"}}


def _bg_plan(layout: dict, asset_prefix: str, bg_dir: str) -> dict:
    """Derive show.bg base/swap (+ optional swap_t hint) from layout.json plate bg tags."""
    order = []
    seen = []
    for pid in sorted(layout.keys()):
        entry = layout[pid]
        if not isinstance(entry, dict):
            continue
        bg = entry.get("bg")
        if not bg:
            continue
        if bg not in seen:
            seen.append(bg)
            order.append((pid, bg, float(entry.get("t", 0))))
    files = {os.path.splitext(f)[0]: f for f in os.listdir(bg_dir) if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))}
    if not seen:
        # fall back to sorted bg files
        names = sorted(files.keys())
        if not names:
            raise ValueError("no bg images in pack bg/")
        seen = names[:2]
        order = [("P01", seen[0], 0.0)]
        if len(seen) > 1:
            order.append(("P??", seen[1], 0.0))

    def resolve(name: str) -> str:
        fname = files.get(name) or files.get(name.replace("bg_", "")) or (name if name in files.values() else None)
        if fname is None:
            # try name.png
            for ext in (".png", ".jpg", ".jpeg", ".webp"):
                if os.path.isfile(os.path.join(bg_dir, name + ext)):
                    fname = name + ext
                    break
        if fname is None:
            raise ValueError(f"layout bg {name!r} has no matching file in bg/")
        return f"{asset_prefix}/bg/{fname}"

    base_name = seen[0]
    swap_name = seen[1] if len(seen) > 1 else None
    out = {"base": resolve(base_name)}
    if swap_name:
        out["swap"] = resolve(swap_name)
        # first plate that uses swap → swap_t hint (player still prefers per-plate bg)
        for pid, bg, t in order:
            if bg == swap_name:
                out["swap_t"] = float(t)
                break
    return out


def _build_atoms(layout_source: str, src_label: str, plate_ids: list[str]) -> tuple[list, float]:
    """Build 25 hero atoms covering P01–P60. Raises if pack plate set is incomplete for the map."""
    have = set(plate_ids)
    atoms, t = [], 0.0
    for i, (cid, d, kind, cam, beat, plates, fx, src) in enumerate(ATOM_SPEC, 1):
        missing = [p for p in plates if p not in have]
        if missing:
            raise ValueError(f"pack layout missing plates required by parity atom map: {missing[:8]}")
        atoms.append({
            "id": f"codex_{i:02d}_{cid}",
            "duration_s": d,
            "plates_needed": int(d * 2),
            "kind": kind,
            "camera": cam,
            "motion": {"family": "fight", "beat_class": beat},
            "pose_mode": "hero",
            "hero": {"layout_source": layout_source, "plates": plates},
            "fx_hooks": fx,
            "assets": {"char_slots": ["L", "R"], "requires_costume_lock": False},
            "source_refs": [
                f"codex index.html {src} t={t:g}-{t + d:g}s",
                f"plates_spec {plates[0]}-{plates[-1]}",
                f"src={src_label}",
            ],
        })
        t += d
    return atoms, t


def _extract_zip(zip_path: str, dest: str) -> str:
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(dest)
    return _find_pack_root(dest)


def import_plate_pack(
    source_path: Optional[str] = None,
    show_id: str = "",
    *,
    title: Optional[str] = None,
    zip_path: Optional[str] = None,
    copy_assets: bool = False,
    compose: bool = True,
    kit: Optional[str] = None,
) -> dict[str, Any]:
    """Import a Codex-style pack. Returns a result dict (ok / errors)."""
    kit = kit or KIT
    if not _safe_show_id(show_id):
        return {"ok": False, "errors": ["show_id must match ^[a-z0-9][a-z0-9_-]*$"]}
    if not source_path and not zip_path:
        return {"ok": False, "errors": ["source_path or zip_path required"]}

    try:
        if zip_path:
            if not os.path.isfile(zip_path):
                return {"ok": False, "errors": [f"zip not found: {zip_path}"]}
            # Durable extract so default symlinks stay valid (do not use mkdtemp + rmtree).
            pack_root = os.path.join(kit, "uploads", "packs", show_id)
            if os.path.isdir(pack_root):
                shutil.rmtree(pack_root)
            os.makedirs(pack_root, exist_ok=True)
            root = _extract_zip(zip_path, pack_root)
        else:
            root = _find_pack_root(source_path)

        paths = _validate_pack(root)
        layout = json.load(open(paths["layout"], encoding="utf-8"))
        plate_ids = [k for k, v in layout.items() if isinstance(v, dict)]
        if len(plate_ids) < 50:
            return {"ok": False, "errors": [f"expected full-timeline pack (~60 plates), got {len(plate_ids)}"]}

        asset_dir = os.path.join(kit, "assets", show_id)
        os.makedirs(asset_dir, exist_ok=True)
        links = {}
        for name, src in (("bg", paths["bg"]), ("cutout", paths["cutout"]), ("plates", paths["plates"]),
                          ("layout.json", paths["layout"])):
            dst = os.path.join(asset_dir, name)
            _link_or_copy(src, dst, copy=copy_assets)
            links[name] = _rel(dst)

        layout_js = os.path.join(root, "html", "layout.js")
        if os.path.isfile(layout_js):
            _link_or_copy(layout_js, os.path.join(asset_dir, "layout.js"), copy=copy_assets)
            links["layout.js"] = f"assets/{show_id}/layout.js"

        asset_prefix = f"assets/{show_id}"
        layout_source = f"{asset_prefix}/layout.json"
        resolved_title = title or _read_title(paths["index"], paths["layout"])
        chars = _infer_chars(resolved_title)
        bg = _bg_plan(layout, asset_prefix, paths["bg"])
        src_label = os.path.basename(root.rstrip("/"))
        atoms, dur = _build_atoms(layout_source, src_label, plate_ids)

        show = {
            "show_id": show_id,
            "title": f"{resolved_title} · composer hero parity",
            "duration_target_s": round(dur, 1),
            "grounded": True,
            "floor_y": 684,
            "parity_mode": True,
            "compose_mode": "parity",
            "chars": chars,
            "bg": bg,
            "atoms": atoms,
            "meta": {
                "imported_from": os.path.abspath(root),
                "plate_count": len(plate_ids),
                "import": "HM-COMPOSE-01",
            },
        }

        show_path = os.path.join(kit, "shows", f"{show_id}.json")
        os.makedirs(os.path.dirname(show_path), exist_ok=True)
        json.dump(show, open(show_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

        result: dict[str, Any] = {
            "ok": True,
            "show_id": show_id,
            "show_path": _rel(show_path),
            "assets": links,
            "assets_dir": asset_prefix,
            "player": f"/player/index.html?show={show_id}",
            "parity_mode": True,
            "plate_count": len(plate_ids),
            "duration_s": dur,
            "atom_count": len(atoms),
            "source": os.path.abspath(root),
            "copy_assets": copy_assets,
        }

        if compose:
            import sys
            sys.path.insert(0, os.path.join(kit, "composer"))
            import compose as C  # noqa: WPS433
            try:
                cr = C.compose(show_path, os.path.join(kit, "out"))
                result["compose"] = cr
                # surface budget counts clearly
                stats = (cr or {}).get("stats") or {}
                warns = (cr or {}).get("warnings") or []
                result["budget_errors"] = 0
                result["budget_warns"] = sum(1 for w in warns if "hero budget" in w)
                result["warnings"] = warns
                result["stats"] = stats
            except C.ComposeError as e:
                return {"ok": False, "errors": str(e).split("\n"), "show_path": _rel(show_path), "assets": links}

        return result
    except Exception as e:
        return {"ok": False, "errors": [f"{type(e).__name__}: {e}"]}


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Import Codex plate pack → hero parity show")
    ap.add_argument("--source", required=True, help="Path to Codex folder OR .zip")
    ap.add_argument("--show-id", required=True)
    ap.add_argument("--title")
    ap.add_argument("--copy", action="store_true", help="Copy assets instead of symlink")
    ap.add_argument("--no-compose", action="store_true")
    args = ap.parse_args()
    src = args.source
    zip_path = src if src.lower().endswith(".zip") else None
    source_path = None if zip_path else src
    r = import_plate_pack(source_path=source_path, zip_path=zip_path, show_id=args.show_id,
                          title=args.title, copy_assets=args.copy, compose=not args.no_compose)
    print(json.dumps(r, ensure_ascii=False, indent=2))
    raise SystemExit(0 if r.get("ok") else 1)

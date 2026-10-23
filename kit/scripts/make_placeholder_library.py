"""PLACEHOLDER pose libraries for library-mode smoke test.
Splits existing zhao-hua duo cutouts at the emptiest alpha column (30-70% width) into
single-character crops and estimates anchors automatically. NOT a real Sprite Forge library."""
import json, os
import numpy as np
from PIL import Image
K = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = f"{K}/assets/zhao-hua/cutout"; LAY = json.load(open(f"{K}/assets/zhao-hua/layout.json"))
# plate -> (zhao pose id, zhao tags, hua pose id, hua tags)
PICK = {
 "P01": ("zhao_hook", ["hook", "clash"], "hua_knee", ["knee", "clash"]),
 "P06": ("zhao_jab", ["jab", "straight"], "hua_guard_lean", ["block", "guard"]),
 "P19": ("zhao_shoved", ["skid", "recoil"], "hua_shove", ["push"]),
 "P24": ("zhao_low_sweep", ["sweep"], "hua_step_back", ["evade", "slip"]),
 "P31": ("zhao_high_kick", ["front_kick", "kick"], "hua_lunge_punch", ["straight", "hook", "parry"]),
 "P50": ("zhao_elbow", ["elbow"], "hua_cheek_hit", ["hit_react"]),
 "P52": ("zhao_crouch", ["guard_recover", "windup"], "hua_crouch", ["guard_recover", "windup"]),
}
def anchors(a, facing):
    ys, xs = np.nonzero(a); h = a.shape[0]
    top, bot = ys.min(), ys.max()
    fb = ys >= bot - max(4, int(0.02 * (bot - top))); foot = [float(xs[fb].mean()), float(bot)]
    hb = ys <= top + 0.07 * (bot - top); head = [float(xs[hb].mean()), float(top + 0.06 * (bot - top))]
    up = ys <= top + 0.62 * (bot - top)
    xu, yu = xs[up], ys[up]
    xe = xu.max() if facing == "right" else xu.min()
    sel = np.abs(xu - xe) <= 3; hand = [float(xe), float(yu[sel].mean())]
    return foot, hand, head
def drop_edge_slivers(crop, edge):
    """remove small alpha islands touching the cut edge (slivers of the other fighter)"""
    from scipy import ndimage
    arr = np.array(crop); m = arr[:, :, 3] > 10
    lab, n = ndimage.label(m)
    if n <= 1: return crop
    sizes = ndimage.sum(m, lab, range(1, n + 1)); big = sizes.max()
    col = lab[:, -1] if edge == "right" else lab[:, 0]
    for i in set(col[col > 0].tolist()):
        if sizes[i - 1] < 0.15 * big: arr[lab == i, 3] = 0
    return Image.fromarray(arr)
def build():
    libs = {"zhao": [], "hua": []}
    for P, (zid, zt, hid, ht) in PICK.items():
        im = Image.open(f"{SRC}/{P}.png").convert("RGBA"); a = np.array(im)[:, :, 3] > 40
        W = a.shape[1]; occ = a.sum(0); lo, hi = int(W * .3), int(W * .7); cut = lo + int(occ[lo:hi].argmin())
        scale = LAY[P]["parts"][0]["w"] / im.size[0]
        for who, x0, x1, pid, tags, facing in (("zhao", 0, cut, zid, zt, "right"), ("hua", cut, W, hid, ht, "left")):
            crop = im.crop((x0, 0, x1, im.size[1]))
            crop = drop_edge_slivers(crop, "right" if who == "zhao" else "left")
            bb = crop.getbbox(); crop = crop.crop(bb)
            ca = np.array(crop)[:, :, 3] > 40
            foot, hand, head = anchors(ca, facing)
            d = f"{K}/libraries/placeholder-{who}/poses"; os.makedirs(d, exist_ok=True)
            crop.save(f"{d}/{pid}.png")
            libs[who].append({"pose_id": pid, "png": f"poses/{pid}.png", "size": list(crop.size), "facing": facing,
                              "foot_anchor_xy": [round(v, 1) for v in foot], "hand_hit_xy": [round(v, 1) for v in hand],
                              "head_xy": [round(v, 1) for v in head], "scale": round(scale, 4), "beat_tags": tags,
                              "placeholder": True, "source": f"split of assets/zhao-hua/cutout/{P}.png at x={cut} (auto anchors)"})
    for who, name in (("zhao", "趙敏 Zhao Min"), ("hua", "華妃 Hua Fei")):
        json.dump({"character": name, "placeholder": True,
                   "note": "Stand-in for plumbing only: crops split from duo cutouts (may include a sliver of the other fighter), anchors auto-estimated. Real library = Sprite Forge.",
                   "costume_lock": "fight-zhao-min-hua-fei-rooftop-2026-10-19/costume_lock.md", "poses": libs[who]},
                  open(f"{K}/libraries/placeholder-{who}/pose_library.json", "w"), ensure_ascii=False, indent=1)
    return libs
if __name__ == "__main__":
    L = build(); print({k: len(v) for k, v in L.items()})
    # QA sheet with anchors
    from PIL import ImageDraw
    cells = []
    for who in ("zhao", "hua"):
        lib = json.load(open(f"{K}/libraries/placeholder-{who}/pose_library.json"))
        for p in lib["poses"]:
            im = Image.open(f"{K}/libraries/placeholder-{who}/{p['png']}").convert("RGBA")
            bg = Image.new("RGBA", im.size, (40, 50, 60, 255)); bg.alpha_composite(im); d = ImageDraw.Draw(bg)
            for xy, c in ((p["foot_anchor_xy"], "lime"), (p["hand_hit_xy"], "red"), (p["head_xy"], "cyan")):
                d.ellipse([xy[0] - 9, xy[1] - 9, xy[0] + 9, xy[1] + 9], outline=c, width=4)
            d.text((6, 6), p["pose_id"], fill="yellow"); bg.thumbnail((220, 300)); cells.append(bg)
    sheet = Image.new("RGB", (220 * 7, 300 * 2), (20, 20, 20))
    for i, c in enumerate(cells): sheet.paste(c.convert("RGB"), ((i % 7) * 220, (i // 7) * 300))
    sheet.save(f"{K}/qa/placeholder_library_anchors.png")

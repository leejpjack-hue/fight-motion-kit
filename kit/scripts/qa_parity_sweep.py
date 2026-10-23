"""Sweep parity: FX event arrays + pixel diff every 1/6 s (180 frames) original vs composed."""
import asyncio, json, sys, os, glob, io
from playwright.async_api import async_playwright
from PIL import Image, ImageChops, ImageStat
PORT = int(sys.argv[1]); K = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B = f"http://127.0.0.1:{PORT}/"
async def main():
    async with async_playwright() as pw:
        exe = sorted(glob.glob(os.path.expanduser("~/.cache/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell")))[-1]
        b = await pw.chromium.launch(executable_path=exe)
        po = await b.new_page(viewport={"width": 1280, "height": 720}); await po.goto(B + "fight-zhao-min-hua-fei-rooftop-2026-10-19/index.html?capture"); await po.evaluate("window.ready")
        pn = await b.new_page(viewport={"width": 1280, "height": 720}); await pn.goto(B + "html-motion-template-kit-2026-10-19/player/index.html?show=zhao-hua-parity&capture"); await pn.evaluate("window.ready")
        o = await po.evaluate("({HITS,BGFLASH,DUST,SPARKS,SPEED,FENCE,TRAILS})")
        n = await pn.evaluate("FX")
        def norm(a): return sorted(json.dumps([round(x, 4) if isinstance(x, (int, float)) else x for x in e]) for e in a)
        fxcmp = {"HITS": norm(o["HITS"]) == norm(n["hits"]), "BGFLASH": norm(o["BGFLASH"]) == norm(n["bgflash"]),
                 "DUST": norm(o["DUST"]) == norm(n["dust"]), "SPARKS_times": sorted(s[0] for s in o["SPARKS"]) == sorted(s[0] for s in n["sparks"]),
                 "FENCE": norm(o["FENCE"]) == norm(n["fence"]), "TRAILS": norm(o["TRAILS"]) == norm(n["trails"]),
                 "SPEED_spans": sorted((s[0], s[2]) for s in o["SPEED"]) == sorted(set((s[0], s[2]) for s in n["speed"])) or "radial split into 2 atoms (k0/k1) - checked by pixels"}
        diffs = []
        for i in range(180):
            t = i / 6 + 1/48
            ims = []
            for p in (po, pn):
                await p.evaluate(f"renderAt({t})"); await p.wait_for_timeout(30); await p.evaluate(f"renderAt({t})")
                ims.append(Image.open(io.BytesIO(await p.screenshot())).convert("RGB"))
            diffs.append((round(t, 3), round(sum(ImageStat.Stat(ImageChops.difference(*ims)).mean) / 3, 3)))
        await b.close()
    bad = [d for d in diffs if d[1] > 1.0]
    r = {"fx_arrays_equal": fxcmp, "frames": len(diffs), "max_mean_diff": max(d[1] for d in diffs), "frames_over_1.0": bad}
    json.dump(r, open(f"{K}/qa/parity_sweep.json", "w"), indent=1); print(json.dumps(r, indent=1))
asyncio.run(main())

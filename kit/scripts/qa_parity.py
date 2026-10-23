"""Parity QA: original rooftop index.html vs composed show in player/index.html.
Run with a static server at http://127.0.0.1:PORT/ rooted at /workspace/deliverables."""
import asyncio, json, sys, os
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw, ImageChops, ImageStat
import glob
def launch_kw():
    c = sorted(glob.glob(os.path.expanduser("~/.cache/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell")))
    return {"executable_path": c[-1]} if c else {}
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
K = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIG = f"http://127.0.0.1:{PORT}/fight-zhao-min-hua-fei-rooftop-2026-10-19/index.html?capture"
NEW = f"http://127.0.0.1:{PORT}/html-motion-template-kit-2026-10-19/player/index.html?show=zhao-hua-parity&capture"
TS = [0.6, 4.3, 9.4, 16.3, 21.2, 27.1]
STRIP = [1.2, 5.0, 8.7, 12.6, 17.3, 19.6, 23.4, 28.6]
async def page(b, url, errs):
    p = await b.new_page(viewport={"width": 1280, "height": 720})
    p.on("console", lambda m: errs.append(f"{url}: {m.text}") if m.type == "error" else None)
    p.on("pageerror", lambda e: errs.append(f"{url}: {e}"))
    await p.goto(url); await p.evaluate("window.ready"); return p
async def shot(p, t, path):
    await p.evaluate(f"renderAt({t})"); await p.wait_for_timeout(120)
    await p.evaluate(f"renderAt({t})"); await p.wait_for_timeout(60)
    await p.screenshot(path=path, clip={"x": 0, "y": 0, "width": 1280, "height": 720})
async def main():
    errs = []
    os.makedirs(f"{K}/qa/frames", exist_ok=True)
    async with async_playwright() as pw:
        b = await pw.chromium.launch(**launch_kw())
        po, pn = await page(b, ORIG, errs), await page(b, NEW, errs)
        # numeric camera parity (base camera, 24 fps, full 30 s)
        js = "(()=>{const o=[];for(let i=0;i<720;i++){const c=camBase(i/24);o.push([c.x,c.y,c.s,c.r]);}return o})()"
        co, cn = await po.evaluate(js), await pn.evaluate(js)
        md = [max(abs(a[k] - b_[k]) for a, b_ in zip(co, cn)) for k in range(4)]
        worst = max(range(720), key=lambda i: max(abs(co[i][k] - cn[i][k]) for k in range(4)))
        # plate index parity
        pj = "(()=>{const o=[];for(let i=0;i<720;i++){renderAt(i/24);o.push(document.getElementById('hud').textContent)}return o})()"
        rows = []
        for t in TS + STRIP:
            a, n = f"{K}/qa/frames/orig_{t:05.2f}.png", f"{K}/qa/frames/new_{t:05.2f}.png"
            await shot(po, t, a); await shot(pn, t, n)
            d = ImageChops.difference(Image.open(a).convert("RGB"), Image.open(n).convert("RGB"))
            rows.append((t, sum(ImageStat.Stat(d).mean) / 3))
        await b.close()
    # side-by-side sheet
    W, H = 560, 315
    sheet = Image.new("RGB", (W * 2 + 30, (H + 26) * len(TS) + 40), (10, 14, 18)); dr = ImageDraw.Draw(sheet)
    dr.text((10, 10), "ORIGINAL index.html", fill=(127, 255, 221)); dr.text((W + 30, 10), "COMPOSED player (zhao-hua-parity.json)", fill=(127, 255, 221))
    diff = dict(rows)
    for i, t in enumerate(TS):
        y = 40 + i * (H + 26)
        for j, pre in enumerate(("orig", "new")):
            im = Image.open(f"{K}/qa/frames/{pre}_{t:05.2f}.png").convert("RGB").resize((W, H)); sheet.paste(im, (10 + j * (W + 10), y + 18))
        dr.text((10, y + 2), f"t={t:.2f}s   mean abs pixel diff {diff[t]:.2f}/255", fill=(255, 220, 120))
    sheet.save(f"{K}/qa/parity_compare.png")
    sw, sh = 320, 180
    strip = Image.new("RGB", (sw * 8, sh + 20), (10, 14, 18)); dr = ImageDraw.Draw(strip)
    for i, t in enumerate(STRIP):
        strip.paste(Image.open(f"{K}/qa/frames/new_{t:05.2f}.png").convert("RGB").resize((sw, sh)), (i * sw, 20))
        dr.text((i * sw + 4, 4), f"{t:.1f}s", fill=(127, 255, 221))
    strip.save(f"{K}/qa/p0_strip.png")
    res = {"camera_max_abs_diff_xysr": md, "worst_frame_t": worst / 24, "pixel_mean_diff": rows, "console_errors": errs}
    json.dump(res, open(f"{K}/qa/parity_result.json", "w"), indent=1); print(json.dumps(res, indent=1))
asyncio.run(main())

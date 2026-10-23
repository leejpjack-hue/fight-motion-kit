"""Capture a row/grid of player frames for a composed show. usage: qa_shots.py PORT SHOW OUT.png t1 t2 ..."""
import asyncio, sys, os, glob, io
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw
PORT, SHOW, OUT = int(sys.argv[1]), sys.argv[2], sys.argv[3]; TS = [float(x) for x in sys.argv[4:]]
async def main():
    errs = []
    async with async_playwright() as pw:
        exe = sorted(glob.glob(os.path.expanduser("~/.cache/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell")))[-1]
        b = await pw.chromium.launch(executable_path=exe)
        p = await b.new_page(viewport={"width": 1280, "height": 720})
        p.on("console", lambda m: errs.append(m.text) if m.type == "error" else None); p.on("pageerror", lambda e: errs.append(str(e)))
        await p.goto(f"http://127.0.0.1:{PORT}/html-motion-template-kit-2026-10-19/player/index.html?show={SHOW}&capture"); await p.evaluate("window.ready")
        ims = []
        for t in TS:
            await p.evaluate(f"renderAt({t})"); await p.wait_for_timeout(120); await p.evaluate(f"renderAt({t})")
            ims.append((t, Image.open(io.BytesIO(await p.screenshot())).convert("RGB"), await p.evaluate("document.getElementById('hud').textContent")))
        await b.close()
    cols = 4; W, H = 480, 270; rows = (len(ims) + cols - 1) // cols
    sheet = Image.new("RGB", (W * cols, (H + 20) * rows), (10, 14, 18)); d = ImageDraw.Draw(sheet)
    for i, (t, im, _) in enumerate(ims):
        x, y = (i % cols) * W, (i // cols) * (H + 20); sheet.paste(im.resize((W, H)), (x, y + 20)); d.text((x + 4, y + 4), f"{SHOW} t={t:.2f}s", fill=(127, 255, 221))
    sheet.save(OUT); print("saved", OUT, "console errors:", errs)
asyncio.run(main())

"""Serve check: load pages on a plain `python3 -m http.server` rooted at /workspace/deliverables, collect console errors."""
import asyncio, sys, os, glob, json
from playwright.async_api import async_playwright
PORT = int(sys.argv[1]); B = f"http://127.0.0.1:{PORT}/html-motion-template-kit-2026-10-19/"
PAGES = ["player/index.html?show=zhao-hua-parity", "player/index.html?show=library-smoke", "ui/index.html"]
async def main():
    res = {}
    async with async_playwright() as pw:
        exe = sorted(glob.glob(os.path.expanduser("~/.cache/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell")))[-1]
        b = await pw.chromium.launch(executable_path=exe)
        for u in PAGES:
            errs = []; p = await b.new_page(viewport={"width": 1280, "height": 720})
            p.on("console", lambda m: errs.append(m.text) if m.type == "error" else None); p.on("pageerror", lambda e: errs.append(str(e)))
            r = await p.goto(B + u); await p.wait_for_timeout(2500)
            extra = await p.evaluate("document.getElementById('status')?document.getElementById('status').textContent:document.title")
            res[u] = {"http": r.status, "console_errors": errs, "info": extra}; await p.close()
        await b.close()
    print(json.dumps(res, ensure_ascii=False, indent=1))
asyncio.run(main())

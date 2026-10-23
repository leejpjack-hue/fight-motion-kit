"""QA: editor transforms + wording overlays. Screenshots + 0 console errors."""
import asyncio, sys, os, glob, json
from playwright.async_api import async_playwright
PORT = int(sys.argv[1])
K = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

async def main():
    errs, log = [], {}
    async with async_playwright() as pw:
        exe = sorted(glob.glob(os.path.expanduser("~/.cache/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell")))[-1]
        b = await pw.chromium.launch(executable_path=exe)
        ctx = await b.new_context(viewport={"width": 1600, "height": 1000})
        p = await ctx.new_page()
        p.on("console", lambda m: errs.append("ui: " + m.text) if m.type == "error" else None)
        p.on("pageerror", lambda e: errs.append("ui: " + str(e)))
        await p.goto(f"http://127.0.0.1:{PORT}/ui/index.html")
        await p.wait_for_function("document.getElementById('status').textContent.startsWith('ready')")
        # load editor-features
        await p.select_option("#example", "shows/editor-features.json")
        await p.click("#loadEx")
        await p.wait_for_timeout(800)
        log["status"] = await p.text_content("#status")
        log["ov_count"] = await p.evaluate("SHOW.overlays.length")
        log["L_xf"] = await p.evaluate("SHOW.chars.L.transform")
        # scrub to show CLASH overlay
        await p.fill("#scrub", "0.5")
        await p.dispatch_event("#scrub", "input")
        await p.wait_for_timeout(400)
        await p.locator("#previewBox").screenshot(path=f"{K}/qa/ui_wording.png")
        # adjust transform via inputs
        await p.fill('[data-xf="L"][data-k="x"]', "-80")
        await p.dispatch_event('[data-xf="L"][data-k="x"]', "change")
        await p.fill('[data-xf="L"][data-k="scale"]', "1.25")
        await p.dispatch_event('[data-xf="L"][data-k="scale"]', "change")
        await p.wait_for_timeout(400)
        await p.locator("#slots").screenshot(path=f"{K}/qa/ui_char_transform.png")
        # compose
        await p.click("#composeBtn")
        await p.wait_for_function("document.getElementById('status').textContent.match(/composed|failed/)")
        log["compose_status"] = await p.text_content("#status")
        log["compose_out"] = await p.text_content("#out")
        # preview player with both features
        async with ctx.expect_page() as pg:
            await p.click("#previewBtn")
        pp = await pg.value
        pp.on("console", lambda m: errs.append("preview: " + m.text) if m.type == "error" else None)
        pp.on("pageerror", lambda e: errs.append("preview: " + str(e)))
        await pp.wait_for_load_state()
        await pp.evaluate("window.ready")
        # jump to a frame with overlay
        await pp.evaluate("renderAt(0.8)")
        await pp.wait_for_timeout(300)
        await pp.screenshot(path=f"{K}/qa/editor_features.png")
        # also capture bang frame
        await pp.evaluate("renderAt(5.0)")
        await pp.wait_for_timeout(200)
        await pp.screenshot(path=f"{K}/qa/editor_features_bang.png")
        await pp.close()
        await b.close()
    log["console_errors"] = errs
    print(json.dumps(log, ensure_ascii=False, indent=1))
    json.dump(log, open(f"{K}/qa/editor_features_result.json", "w"), ensure_ascii=False, indent=1)
    if errs:
        sys.exit(1)
asyncio.run(main())

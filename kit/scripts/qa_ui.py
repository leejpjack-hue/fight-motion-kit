"""UI smoke: load ui via composer/serve.py, add atoms, dry-run export, compose, preview, screenshot qa/ui.png."""
import asyncio, sys, os, glob, json
from playwright.async_api import async_playwright
PORT = int(sys.argv[1]); K = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
async def main():
    errs = []; log = {}
    async with async_playwright() as pw:
        exe = sorted(glob.glob(os.path.expanduser("~/.cache/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell")))[-1]
        b = await pw.chromium.launch(executable_path=exe); ctx = await b.new_context(viewport={"width": 1600, "height": 900}, accept_downloads=True)
        p = await ctx.new_page()
        p.on("console", lambda m: errs.append("ui: " + m.text) if m.type == "error" else None); p.on("pageerror", lambda e: errs.append("ui: " + str(e)))
        await p.goto(f"http://127.0.0.1:{PORT}/ui/index.html"); await p.wait_for_function("document.getElementById('status').textContent.startsWith('ready')")
        log["status"] = await p.text_content("#status")
        log["cards_count"] = await p.text_content("#count")
        # load library-smoke example, add two library atoms + one hero atom via picker
        await p.select_option("#example", "shows/library-smoke.json"); await p.click("#loadEx")
        await p.fill("#sId", "ui-test"); await p.dispatch_event("#sId", "change"); await p.fill("#sTitle", "UI test (library-smoke + picker atoms)"); await p.dispatch_event("#sTitle", "change")
        await p.select_option("#fPreset", "dutch_spiral"); await p.select_option("#fBeat", "clash"); await p.select_option("#fDur", "2")
        await p.click("#cards .card:nth-child(1) button")   # library
        await p.click("#cards .card:nth-child(2) button")   # hero (pending slate)
        await p.select_option("#fPreset", ""); await p.select_option("#fBeat", "jab"); await p.select_option("#fDur", "")
        # drag a card onto the timeline (HTML5 DnD)
        await p.drag_and_drop("#cards .card:nth-child(3)", "#tl")
        log["stats_after_add"] = await p.text_content("#stats")
        # dry-run export (schema-validated) -> download
        async with p.expect_download() as dl: await p.click("#exportBtn")
        d = await dl.value; path = f"{K}/qa/ui_export.json"; await d.save_as(path)
        # validate exported file with jsonschema
        sys.path.insert(0, f"{K}/composer"); import compose as C
        e = []; C.validate(json.load(open(path)), "show", "export", e); log["export_schema_errors"] = e
        # compose via endpoint
        await p.click("#composeBtn"); await p.wait_for_function("document.getElementById('status').textContent.match(/composed|failed/)")
        log["compose_status"] = await p.text_content("#status"); log["compose_out"] = await p.text_content("#out")
        # preview opens player
        async with ctx.expect_page() as pg: await p.click("#previewBtn")
        pp = await pg.value
        pp.on("console", lambda m: errs.append("preview: " + m.text) if m.type == "error" else None); pp.on("pageerror", lambda e: errs.append("preview: " + str(e)))
        await pp.wait_for_load_state(); await pp.evaluate("window.ready"); await pp.wait_for_timeout(1500)
        log["preview_title"] = await pp.title(); await pp.screenshot(path=f"{K}/qa/ui_preview.png")
        await pp.close()
        # nicer screenshot: select the hero row, filters wide
        await p.select_option("#fBeat", "hook"); await p.click("#tl .item:nth-child(6) .nm"); await p.wait_for_timeout(1200)
        await p.screenshot(path=f"{K}/qa/ui.png")
        await b.close()
    log["console_errors"] = errs; print(json.dumps(log, ensure_ascii=False, indent=1))
    json.dump(log, open(f"{K}/qa/ui_result.json", "w"), ensure_ascii=False, indent=1)
asyncio.run(main())

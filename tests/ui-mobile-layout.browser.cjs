'use strict';

const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
const out = path.resolve(process.env.TEST_OUTPUT || '/opt/cursor/artifacts');
fs.mkdirSync(out, { recursive: true });

const MIMES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

async function ensureServer(urlStr) {
  const ok = await new Promise(resolve => {
    const req = http.get(urlStr + '/ui/', res => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.setTimeout(600, () => { req.destroy(); resolve(false); });
  });
  if (ok) return null;
  const root = path.resolve('public');
  const srv = http.createServer((req, res) => {
    const clean = decodeURIComponent(new URL(req.url, urlStr).pathname).replace(/^\/+/, '');
    let fp = path.resolve(root, clean);
    if (!fp.startsWith(root)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
    if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': MIMES[path.extname(fp)] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  });
  const u = new URL(urlStr);
  await new Promise((resolve, reject) => { srv.once('error', reject); srv.listen(+u.port || 0, u.hostname || '127.0.0.1', resolve); });
  srv.unref();
  return srv;
}

(async () => {
  const srv = await ensureServer(base);
  const actualBase = srv ? `http://127.0.0.1:${srv.address().port}` : base;
  const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--disable-gpu'] });

  try {
    // 1. Compact Mobile (360x800) & iPhone (390x844) end-to-end UX checks
    for (const vp of [{ width: 360, height: 800 }, { width: 390, height: 844 }]) {
      const ctx = await browser.newContext({ viewport: vp, acceptDownloads: true });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', err => errors.push(err.message));

      await page.goto(actualBase + '/ui/');
      await page.evaluate(() => window.ready);
      await page.waitForFunction(() => window.HMStudio && HMStudio.project.show.show_id === 'daiyu-wang-five-seconds' && HMStudio.duration === 5);

      // Default mobile state: Timeline tab active, single-pane stage (A/B collapsed), zero horizontal overflow
      const initMetrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        focus: document.querySelector('.shell-focus-input:checked')?.value,
        abEnabled: HMStudio.abEnabled,
        playTop: document.getElementById('play').getBoundingClientRect().top,
        playBottom: document.getElementById('play').getBoundingClientRect().bottom,
        railVisible: getComputedStyle(document.querySelector('nav.shell-rail')).display !== 'none'
      }));
      assert.ok(initMetrics.scrollWidth <= vp.width, `no horizontal overflow at ${vp.width}px (got ${initMetrics.scrollWidth})`);
      assert.equal(initMetrics.focus, 'timeline');
      assert.equal(initMetrics.abEnabled, false);
      assert.equal(initMetrics.railVisible, true);
      assert.ok(initMetrics.playBottom < vp.height * 0.65, 'Play button is immediately visible above the fold on mobile');

      // Touch targets on bottom rail >= 44px height
      const tabHeights = await page.locator('nav.shell-rail .shell-rail-item:visible label').evaluateAll(
        els => els.map(el => el.getBoundingClientRect().height)
      );
      assert.equal(tabHeights.length, 5);
      for (const h of tabHeights) assert.ok(h >= 44, `bottom tab touch height >= 44px (got ${h})`);

      // Edit beat shortcut from Timeline -> Clip tab; sticky stage stays visible while scrolling Clip settings
      await page.click('#mobileEditBeatBtn');
      assert.equal(await page.evaluate(() => document.querySelector('.shell-focus-input:checked')?.value), 'clip');
      assert.equal(await page.locator('#inspectorContent').isVisible(), true);
      assert.equal(await page.locator('.timeline-panel').isVisible(), false);

      // Advanced drawers start collapsed on mobile and expand cleanly on tap
      assert.equal(await page.evaluate(() => HMUiLayout.getDrawerState('camAdvanced')), false);
      assert.equal(await page.evaluate(() => HMUiLayout.getDrawerState('rhythmTiming')), false);
      assert.equal(await page.evaluate(() => HMUiLayout.getDrawerState('cutTransition')), false);
      assert.equal(await page.evaluate(() => HMUiLayout.getDrawerState('catalogSearch')), false);

      await page.click('#camAdvancedToggle');
      assert.equal(await page.evaluate(() => HMUiLayout.getDrawerState('camAdvanced')), true);
      assert.equal(await page.locator('#panX').isVisible(), true);

      // Scroll down in Clip tab and verify sticky #stage stays pinned at top of viewport
      await page.evaluate(() => window.scrollTo(0, 350));
      const stageRectAfterScroll = await page.locator('#stage').evaluate(el => el.getBoundingClientRect());
      assert.ok(stageRectAfterScroll.top >= 0 && stageRectAfterScroll.bottom <= vp.height * 0.5, 'sticky stage stays visible while scrolling Clip settings');
      await page.evaluate(() => window.scrollTo(0, 0));

      // Quick scrub bar in sticky stage drives HMStudio.time while on Clip tab
      await page.fill('#mobileStageScrub', '1.75');
      await page.locator('#mobileStageScrub').dispatchEvent('input');
      assert.ok(Math.abs(await page.evaluate(() => HMStudio.time) - 1.75) < 0.01);

      // Replace plate on mobile jumps straight to Media tab so library is visible
      await page.click('#replaceImage');
      assert.equal(await page.evaluate(() => document.querySelector('.shell-focus-input:checked')?.value), 'media');
      assert.equal(await page.locator('#mediaGrid').isVisible(), true);

      // QA tab shows Frame Peek Strip & Story Gate without horizontal overflow
      await page.click('label[for="shellFocusQa"]');
      assert.equal(await page.locator('#framePeekStrip').isVisible(), true);
      assert.equal(await page.locator('#pf09GatePanel').isVisible(), true);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `QA tab fits ${vp.width}px`);

      // Mobile Export bottom-sheet puts Playable HTML above Bake QA and exports cleanly
      await page.click('#exportOpen');
      await page.waitForFunction(() => document.getElementById('exportDialog').open);
      const htmlTop = await page.locator('#exportHtml').evaluate(el => el.getBoundingClientRect().top);
      const bakeTop = await page.locator('#exportDialog .export-bake').evaluate(el => el.getBoundingClientRect().top);
      assert.ok(htmlTop < bakeTop, 'Playable HTML sits above Bake QA settings in mobile export sheet');

      if (vp.width === 390) {
        const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#exportHtml')]);
        assert.equal(await dl.failure(), null);
      }

      assert.deepEqual(errors, []);
      await ctx.close();
    }

    // 2. Desktop (1440x900) layout & unclipped 16:9 stage check
    const dCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const dPage = await dCtx.newPage();
    await dPage.goto(actualBase + '/ui/');
    await dPage.evaluate(() => window.ready);
    await dPage.waitForFunction(() => window.HMStudio && HMStudio.duration === 5);

    const desktopCheck = await dPage.evaluate(() => {
      const ab = document.getElementById('abContainer');
      const topOf = sel => document.querySelector(sel).getBoundingClientRect().top;
      return {
        focus: document.querySelector('.shell-focus-input:checked')?.value,
        abEnabled: HMStudio.abEnabled,
        abClipped: ab.scrollHeight > ab.clientHeight + 2,
        camAboveRhythm: topOf('#cameraSettingsGroup') < topOf('#rhythmTimingGroup'),
        fxAboveCut: topOf('#fxSettingsGroup') < topOf('#cutTransitionGroup')
      };
    });
    assert.equal(desktopCheck.focus, 'deck');
    assert.equal(desktopCheck.abEnabled, true);
    assert.equal(desktopCheck.abClipped, false, 'desktop dual 16:9 stage is not vertically clipped');
    assert.equal(desktopCheck.camAboveRhythm, true, 'Camera motion appears above Rhythm & timing packs');
    assert.equal(desktopCheck.fxAboveCut, true, 'Impact FX appears above Cut transitions');

    // Quick filter bar in Clip Settings works cleanly
    await dPage.click('#inspectorFilterBar button[data-filter="core"]');
    assert.equal(await dPage.locator('#rhythmTimingGroup').isVisible(), false);
    assert.equal(await dPage.locator('#cameraSettingsGroup').isVisible(), true);
    await dPage.click('#inspectorFilterBar button[data-filter="all"]');
    assert.equal(await dPage.locator('#rhythmTimingGroup').isVisible(), true);

    // Desktop Export dialog places primary export actions side-by-side with Bake QA, fully inside viewport
    await dPage.click('#exportOpen');
    await dPage.waitForFunction(() => document.getElementById('exportDialog').open);
    const dExportGeom = await dPage.evaluate(() => {
      const htmlR = document.getElementById('exportHtml').getBoundingClientRect();
      const bakeR = document.querySelector('#exportDialog .export-bake').getBoundingClientRect();
      return {
        htmlLeft: htmlR.left,
        htmlBottom: htmlR.bottom,
        bakeLeft: bakeR.left,
        innerH: window.innerHeight
      };
    });
    assert.ok(dExportGeom.htmlLeft < dExportGeom.bakeLeft, 'Desktop export dialog uses side-by-side 2-column layout');
    assert.ok(dExportGeom.htmlBottom <= dExportGeom.innerH, 'Playable HTML stays completely inside 900px desktop viewport');
    await dPage.evaluate(() => document.getElementById('exportDialog').close());

    // Resizing from desktop to mobile while editing a clip preserves Clip tab focus and fits FX path editor
    await dPage.click('[data-effect="exposure_warm_crush"]');
    await dPage.setViewportSize({ width: 390, height: 844 });
    await dPage.click('[data-effect="leg_arc"]');
    assert.equal(await dPage.locator('#fxPathBox').isVisible(), true);
    assert.equal(await dPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await dPage.setViewportSize({ width: 1440, height: 900 });
    assert.equal(await dPage.evaluate(() => document.querySelector('.shell-focus-input:checked')?.value), 'deck');

    await dCtx.close();
    console.log('PASS ui-mobile-layout (360x800, 390x844, 1440x900)');
  } finally {
    await browser.close();
    if (srv) srv.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});

'use strict';

const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
const MIMES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
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
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = [], external = [];
    page.on('pageerror', err => errors.push(err.message));
    ctx.on('request', req => {
      const u = req.url();
      if (!u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== new URL(actualBase).origin) external.push(u);
    });

    await page.goto(actualBase + '/ui/');
    await page.evaluate(() => window.ready);
    await page.waitForFunction(() => window.HMStudio && HMStudio.project?.show?.show_id === 'daiyu-wang-five-seconds' && HMStudio.duration === 5 && HMStudio.projectB);

    // 1. Issue #219 — Peek Diff Overlay extends A/B scrub & exports PNG on renderAt SoT
    await page.evaluate(() => HMStudio.renderAt(0.25, { source: 'scrub' }));
    await page.click('#peekDiffToggle');
    const identicalState = await page.evaluate(() => ({
      pressed: document.getElementById('peekDiffToggle').getAttribute('aria-pressed'),
      hidden: document.getElementById('peekDiffCanvas').hidden,
      chip: document.getElementById('abDiffPixels').textContent,
      abBarVisible: !document.getElementById('abCompareBar').hidden,
      stats: HMStudio.peekDiffStats,
    }));
    assert.equal(identicalState.pressed, 'true');
    assert.equal(identicalState.hidden, false);
    assert.equal(identicalState.abBarVisible, true);
    assert.equal(identicalState.stats.identical, true);
    assert.match(identicalState.chip, /0\.0% \(tint\)/);

    // Edit A's camera to diverge visually from gold B at t=0.25s and check tint vs onion + PNG download
    await page.evaluate(() => {
      HMStudio.editProject(p => {
        p.show.atoms[0].camera = { preset: 'whip_right', nudge: {} };
        return 0;
      });
    });
    await page.waitForFunction(() => HMStudio.peekDiffStats && HMStudio.peekDiffStats.changedPixels > 0);
    await page.evaluate(() => HMStudio.renderAt(0.25, { source: 'scrub' }));
    const changedState = await page.evaluate(() => ({
      stats: HMStudio.peekDiffStats,
      chipText: document.getElementById('abDiffPixels').textContent,
      chipDiff: document.getElementById('abDiffPixels').dataset.diff,
      abCamDiff: document.getElementById('abDiffCam').dataset.diff,
    }));
    assert.ok(changedState.stats.changedPixels > 0);
    assert.equal(changedState.chipDiff, 'changed');
    assert.equal(changedState.abCamDiff, 'changed', 'A/B compare bar stays active alongside diff overlay');

    await page.selectOption('#peekDiffMode', 'onion');
    assert.equal(await page.evaluate(() => HMStudio.peekDiffMode), 'onion');
    assert.match(await page.locator('#abDiffPixels').textContent(), /\(onion\)/);

    const [diffDl] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#exportPeekDiffPng'),
    ]);
    assert.match(diffDl.suggestedFilename(), /-peek-diff-onion-0\.25s\.png$/);
    const diffStream = await diffDl.createReadStream();
    const diffChunks = [];
    for await (const c of diffStream) diffChunks.push(c);
    const diffBytes = Buffer.concat(diffChunks);
    assert.ok(diffBytes.length > 1000);
    assert.deepEqual([...diffBytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(await page.evaluate(() => HMStudio.seekPreviewContract.warns.length), 0);

    await page.click('#peekDiffToggle'); // turn off before safe guide clean export test
    assert.equal(await page.evaluate(() => HMStudio.peekDiffEnabled), false);

    // 2. Issue #220 — Action-Safe (90%) & Title-Safe (80%) Guides + non-blocking lint
    await page.click('#safeGuidesToggle');
    const safeUi = await page.evaluate(() => ({
      pressed: document.getElementById('safeGuidesToggle').getAttribute('aria-pressed'),
      overlayHidden: document.getElementById('safeGuidesOverlay').hidden,
      actionText: document.querySelector('#safeGuidesOverlay .safe-guide-action')?.textContent,
      titleText: document.querySelector('#safeGuidesOverlay .safe-guide-title')?.textContent,
    }));
    assert.equal(safeUi.pressed, 'true');
    assert.equal(safeUi.overlayHidden, false);
    assert.match(safeUi.actionText, /90% action-safe/);
    assert.match(safeUi.titleText, /80% title-safe/);

    // Verify Download Peek PNG still works uncropped without breaking frames, and soft lint fires on out-of-title-safe FX without blocking bake
    await page.click('[data-effect="exposure_warm_crush"]');
    await page.fill('#fxLocX', '600');
    await page.locator('#fxLocX').dispatchEvent('change');
    await page.waitForFunction(() => (HMStudio.showLint.by_code.outside_title_safe || 0) >= 1);
    const lintDom = await page.evaluate(() => ({
      hasCode: document.getElementById('showLintList').textContent.includes('outside_title_safe'),
      exportHtmlDisabled: document.getElementById('exportHtml')?.disabled,
    }));
    assert.equal(lintDom.hasCode, true);
    assert.equal(lintDom.exportHtmlDisabled, false);

    const [frameDl] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#downloadPeekPng'),
    ]);
    assert.match(frameDl.suggestedFilename(), /\.png$/);

    // 3. Issue #224 — Reject root_motion & engine_export across all FE import surfaces without mutating open fight
    page.once('dialog', d => d.accept());
    await page.click('#loadDemo');
    await page.waitForFunction(() => HMStudio.project.show.show_id === 'daiyu-wang-five-seconds' && HMStudio.duration === 5);

    const rootPayload = JSON.stringify({
      frames: 4,
      w: 64,
      h: 64,
      body_h: 48,
      fps: 12,
      kind: 'once',
      loop: false,
      root_motion: { dx: [0, 12, 24, 36] },
    });

    // 3a. Open project file input (#projectInput)
    await page.setInputFiles('#projectInput', {
      name: 'engine-root-motion.json',
      mimeType: 'application/json',
      buffer: Buffer.from(rootPayload),
    });
    await page.waitForFunction(() => /root_motion/i.test(document.getElementById('status').textContent));
    assert.match(await page.locator('#status').textContent(), /strip PNG\+JSON/i);
    assert.equal(await page.locator('#importReceipt').isVisible(), true);
    assert.equal(await page.evaluate(() => HMStudio.project.show.show_id), 'daiyu-wang-five-seconds');

    // 3b. Import pending strip dialog (#stripInput)
    await page.click('#importStrip');
    await page.waitForFunction(() => document.getElementById('stripDialog').open);
    await page.setInputFiles('#stripInput', {
      name: 'walk-once.json',
      mimeType: 'application/json',
      buffer: Buffer.from(rootPayload),
    });
    await page.waitForFunction(() => /root_motion/i.test(document.getElementById('stripStatus').textContent));
    assert.equal(await page.locator('#commitStrip').isDisabled(), true);
    await page.keyboard.press('Escape');

    // 3c. Reference B import (#abInput)
    await page.setInputFiles('#abInput', {
      name: 'b-engine-export.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ show_id: 'eng', engine_export: { target: 'unreal' }, atoms: [] })),
    });
    await page.waitForFunction(() => /root_motion|engine-export/i.test(document.getElementById('status').textContent));
    assert.equal(await page.evaluate(() => HMStudio.projectB.show.show_id), 'daiyu-wang-five-seconds');

    // 3d. Import from project (#projectMediaInput)
    await page.click('#importProjectImages');
    await page.waitForFunction(() => document.getElementById('projectMediaDialog').open);
    await page.setInputFiles('#projectMediaInput', {
      name: 'proj-root-motion.json',
      mimeType: 'application/json',
      buffer: Buffer.from(rootPayload),
    });
    await page.waitForFunction(() => /root_motion/i.test(document.getElementById('projectMediaStatus').textContent));
    assert.match(await page.locator('#projectMediaStatus').textContent(), /strip PNG\+JSON/i);
    await page.keyboard.press('Escape');

    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
    await ctx.close();
    console.log('PASS Issues #219, #220, #224 browser E2E (Peek Diff Overlay, Action-Safe Guides, root_motion reject)');
  } finally {
    await browser.close();
    if (srv) srv.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});

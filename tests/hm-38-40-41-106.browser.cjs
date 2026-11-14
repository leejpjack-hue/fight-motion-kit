'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp'
};

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = urlPath === '/' || urlPath === '/ui' ? '/ui/index.html' : urlPath === '/ui/' ? '/ui/index.html' : urlPath;
      const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
      const full = path.join(ROOT, 'public', safe);
      if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
      fs.createReadStream(full).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

(async () => {
  const server = await startStaticServer();
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const externalUrls = [];

  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (!url.startsWith(base) && !url.startsWith('data:') && !url.startsWith('blob:')) {
      externalUrls.push(url);
      return route.abort();
    }
    return route.continue();
  });

  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    // 1. Default composer load (daiyu-wang-five-seconds)
    await page.goto(base + '/ui/');
    await page.evaluate(() => window.ready);

    // #38: Beat +0.3s, transition & 360px sheets ZIP download
    const dlPromise38 = page.waitForEvent('download');
    await page.click('#downloadBeatSheets');
    const dl38 = await dlPromise38;
    assert.equal(dl38.suggestedFilename(), 'daiyu-wang-five-seconds-sheets.zip');
    const sheetResult = await page.evaluate(() => window.HMBeatSheetExport.lastResult);
    assert.equal(sheetResult.widths.phone, 360);
    assert.ok(sheetResult.fileNames.includes('sheets/beat-plus-0.3s.png'));
    assert.ok(sheetResult.fileNames.includes('sheets/transition-strips.png'));
    assert.ok(sheetResult.fileNames.includes('sheets/phone-360w.png'));
    assert.ok(sheetResult.fileNames.includes('sheets/manifest.json'));
    assert.ok(sheetResult.blobSize > 2000);

    // #40: Frame spike scan in Bake QA dock (clean pass, 0 LUFS claims)
    await page.click('#openBakeQa');
    await page.click('#runSpikeScan');
    await page.waitForFunction(() => /Clean/.test(document.getElementById('spikeScanStatus')?.textContent || ''));
    const scanReport = await page.evaluate(() => window.HMFrameSpikeScan.lastReport);
    assert.equal(scanReport.clean, true);
    assert.equal(scanReport.popCount, 0);
    assert.equal(scanReport.framesScanned, 40);
    assert.equal(scanReport.audioLufsChecked, false);

    // #41: Silent default -> opt-in on renderAt peak -> reset silent
    const sfxDefault = await page.evaluate(() => ({
      checked: document.getElementById('clashSfxToggle').checked,
      enabled: window.HMClashSfxClock.enabled,
      status: document.getElementById('clashSfxStatus').textContent
    }));
    assert.equal(sfxDefault.checked, false);
    assert.equal(sfxDefault.enabled, false);
    assert.match(sfxDefault.status, /Silent default/i);

    await page.click('#clashSfxToggle');
    await page.evaluate(() => window.HMStudio.renderAt(0.08));
    const sfxActive = await page.evaluate(() => ({
      enabled: window.HMClashSfxClock.enabled,
      status: document.getElementById('clashSfxStatus').textContent,
      lastSample: window.HMClashSfxClock.lastSample
    }));
    assert.equal(sfxActive.enabled, true);
    assert.match(sfxActive.status, /Active \(renderAt\)/);
    assert.equal(sfxActive.lastSample.silent, false);
    assert.ok(sfxActive.lastSample.amplitude > 0.5);
    await page.click('#clashSfxToggle'); // leave disabled

    // #106: Market spritegen URL keeps 5.00s BLOCKED_RUNTIME until Load local proof bundle is clicked
    await page.goto(base + '/ui/?show=fight-baijia-elfmage-market-spritegen-2026-11-06');
    await page.evaluate(() => window.ready);
    await page.waitForFunction(() => document.getElementById('marketSpritegenDialog')?.open === true);
    const initialId = await page.evaluate(() => window.HMStudio.show.show_id);
    assert.equal(initialId, 'daiyu-wang-five-seconds');

    await page.click('#marketSpritegenLoadLocal');
    await page.waitForFunction(() => (
      window.HMStudio?.show?.show_id === 'fight-baijia-elfmage-market-spritegen-2026-11-06' &&
      !document.getElementById('marketSpritegenDialog')?.open &&
      /READY/.test(document.getElementById('status')?.textContent || '')
    ));
    const handoffState = await page.evaluate(() => ({
      showId: window.HMStudio.show.show_id,
      atoms: window.HMStudio.show.atoms.length,
      duration: window.HMStudio.duration,
      dialogOpen: Boolean(document.getElementById('marketSpritegenDialog').open),
      status: document.getElementById('status').textContent
    }));
    assert.equal(handoffState.atoms, 8);
    assert.equal(handoffState.duration, 5);
    assert.equal(handoffState.dialogOpen, false);
    assert.match(handoffState.status, /READY/);

    // Verify Playable HTML export works offline on the loaded market handoff show
    await page.click('#exportOpen');
    const dlPromiseHtml = page.waitForEvent('download');
    await page.click('#exportHtml');
    const dlHtml = await dlPromiseHtml;
    assert.equal(dlHtml.suggestedFilename(), 'fight-baijia-elfmage-market-spritegen-2026-11-06.html');
    const htmlPath = await dlHtml.path();
    const exportedHtml = fs.readFileSync(htmlPath, 'utf8');
    assert.ok(exportedHtml.length > 30000);

    // Load exported standalone HTML cleanly offline
    const offlinePage = await context.newPage();
    offlinePage.on('pageerror', (err) => errors.push('exported:' + err.message));
    await offlinePage.setContent(exportedHtml);
    await offlinePage.evaluate(() => window.ready);
    const playerTitle = await offlinePage.title();
    assert.match(playerTitle, /Baijia/);

    assert.deepEqual(externalUrls, [], 'Expected zero external requests');
    assert.deepEqual(errors, [], 'Unexpected browser errors: ' + errors.join('; '));
    console.log('PASS hm-38-40-41-106 browser E2E: sheets (360px + +0.3s + cuts), spike scan clean, clash sfx silent-default/renderAt, market 8-plate local handoff + offline HTML export');
  } finally {
    await browser.close();
    server.close();
  }
})();

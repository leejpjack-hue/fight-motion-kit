const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const hosts = new Set();
    page.on('request', req => {
      const url = new URL(req.url());
      hosts.add(url.host);
    });
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(base + '/ui/?show=fight-baijia-elfmage-market-spritegen-2026-11-06');
    await page.waitForFunction(() => {
      const dlg = document.getElementById('marketSpritegenDialog');
      return dlg && dlg.open && document.getElementById('marketSpritegenStatus').textContent.includes('BLOCKED_RUNTIME');
    });
    const status = await page.locator('#marketSpritegenStatus').innerText();
    assert.match(status, /BLOCKED_RUNTIME/);
    assert.match(status, /no provider call/);
    const missing = await page.locator('#marketSpritegenMissing li').allInnerTexts();
    assert.deepEqual(missing.slice(0, 3), [
      '/workspace/deliverables/fight-baijia-elfmage-market-spritegen-2026-11-06',
      '/workspace/deliverables/fight-baijia-elfmage-market-spritegen-2026-11-06/BUILD_STATUS.md',
      '/workspace/deliverables/fight-baijia-elfmage-market-spritegen-2026-11-06/assets',
    ]);
    assert.match(missing[3], /\*\.motion\.json/);
    assert.match(missing[4], /\/html /);
    assert.equal(await page.locator('#paneAShowId').innerText(), 'daiyu-wang-five-seconds');
    assert.equal(await page.locator('#previewTitle').innerText(), 'First exchange');
    await page.click('#marketSpritegenHandoff');
    await page.waitForFunction(() => document.getElementById('stripDialog').open);
    assert.match(await page.locator('#stripDialog').innerText(), /NOT PLAYABLE/);
    assert.equal(await page.locator('#commitStrip').isDisabled(), true);
    const flow = await browser.newPage();
    await flow.goto(base + '/product-flow.html');
    await flow.waitForFunction(() => document.getElementById('pf29Status').textContent.includes('BLOCKED_RUNTIME'));
    assert.match(await flow.locator('#pf29Status').innerText(), /provider calls 0/);
    assert.deepEqual([...hosts], [new URL(base).host]);
    assert.deepEqual(errors, []);
    console.log('PASS HM-PF-29 browser: receipt is BLOCKED_RUNTIME, 5.00s demo stays open, strip import stays not playable, no off-origin request');
  } finally {
    await browser.close();
  }
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

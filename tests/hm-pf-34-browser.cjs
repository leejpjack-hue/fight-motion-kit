/* HM-PF-34 browser verify. Serves public/ on 127.0.0.1:8765 unless TEST_BASE_URL is set.
 * Confirms the classroom dense show opens FE-only, the crop and pan readouts match the pack,
 * and the missing bitmap is named instead of replaced. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
(async () => {
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/ui/?show=fight-daiyu-baochai-classroom-dense');
    await page.evaluate(() => window.ready);
    await page.waitForFunction(() => {
      const show = window.HMStudio && window.HMStudio.project && window.HMStudio.project.show;
      return show && show.show_id === 'fight-daiyu-baochai-classroom-dense';
    });
    const crop = await page.locator('#backgroundCropValue').innerText();
    await page.locator('#backgroundMotionDetails').evaluate(el => { el.open = true; });
    const note = await page.locator('#backgroundMotionNote').innerText();
    const amount = await page.locator('#backgroundMotionValue').innerText();
    const status = await page.locator('#status').innerText();
    assert.match(crop, /70% × 90% @ 15, 5/);
    assert.equal(amount, '70%');
    assert.match(note, /Slides the crop window/);
    assert.match(note, /Continuous \(show\)/);
    assert.match(status, /Missing plate/);
    assert.match(status, /P01 has no image/);
    assert.match(status, /IB01 has no image/);
    assert.equal(await page.locator('#abSource option[value="fight-daiyu-baochai-classroom-dense"]').count(), 1);
    const flow = await page.goto(base + '/product-flow.html');
    assert.equal(flow.status(), 200);
    const body = await page.locator('body').innerText();
    assert.match(body, /70% by 90% at 15%, 5%/);
    assert.match(body, /pan_right/);
    assert.match(body, /0\.70/);
    assert.deepEqual(errors, []);
    console.log('PASS HM-PF-34 browser: classroom dense show opens, crop and pan read out, missing bitmap is named');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });

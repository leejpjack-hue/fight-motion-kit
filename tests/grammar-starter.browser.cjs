/* Read-only sample proof against loopback or existing Workers UI. No deployment. */
'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
const out = path.resolve(process.env.HM_PROOF_DIR || 'work/qa/grammar-starter');
(async () => {
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const forbidden = [], errors = [];
    await context.route('**/*', route => {
      const req = route.request(), url = req.url();
      if (/^(data:|blob:)/.test(url)) return route.continue();
      if (new URL(url).origin !== new URL(base).origin || /\/api\//.test(url) || req.method() !== 'GET') {
        forbidden.push(url); return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    const started = Date.now();
    await page.goto(base + '/ui/?show=fight-cam-grammar-starter'); await page.evaluate(() => window.ready);
    await page.waitForFunction(() => !HMStudio.loading);
    const before = await page.evaluate(() => HMStudio.project.show);
    assert.equal(before.show_id, 'fight-cam-grammar-starter');
    const roles = before.atoms.map(a => a.grammar_role);
    assert.equal(roles.filter(r => r === 'Wide').length >= 1, true);
    assert.equal(roles.filter(r => r === 'Intent').length >= 3, true);
    assert.equal(roles.filter(r => r === 'Action').length >= 3, true);
    assert.equal(roles.filter(r => r === 'Reaction').length >= 3, true);
    assert.deepEqual(roles.slice(1, 10), ['Intent','Action','Reaction','Intent','Action','Reaction','Intent','Action','Reaction']);
    assert.equal(await page.evaluate(() => HMStudio.duration), 11);
    assert.equal(before.atoms.some(a => a.camera.preset.startsWith('wide_')), false);
    await page.click('#openTemplates');
    await page.click('#templateList [data-template-id="fight-cam-grammar-starter"]');
    await page.waitForFunction(() => !HMStudio.loading);
    assert.deepEqual(await page.evaluate(() => HMStudio.project.show), before);
    await page.fill('#scrub', '7'); await page.locator('#scrub').dispatchEvent('input');
    assert.equal(await page.evaluate(() => HMStudio.time), 7);
    assert.ok(Date.now() - started < 60000, 'cold open/template/scrub exceeds Jack bar');
    fs.mkdirSync(out, { recursive: true }); await page.screenshot({ path: path.join(out, 'cold-open.png'), fullPage: true });
    // HM-PF-22 (#102): Open golden cam show → edit → FE-only bake + approval demo capscreens
    await page.click('.timeline-clip[data-index="2"]');
    await page.selectOption('#camera', 'upward_inside');
    await page.waitForFunction(() => !HMStudio.loading && HMStudio.project.show.atoms[2].camera.preset === 'upward_inside');
    await page.evaluate(() => HMStudio.compile());
    await page.screenshot({ path: path.join(out, 'rooftop-golden-edit.png'), fullPage: true });
    await page.click('#exportOpen');
    await page.waitForSelector('#exportDialog[open]');
    assert.equal(await page.locator('#exportHtml').isEnabled(), true);
    await page.screenshot({ path: path.join(out, 'rooftop-golden-bake.png'), fullPage: true });
    const [bakedHtml] = await Promise.all([page.waitForEvent('download'), page.click('#exportHtml')]);
    assert.equal(await bakedHtml.failure(), null);
    const bakedPath = path.join(out, 'fight-cam-grammar-starter.html');
    await bakedHtml.saveAs(bakedPath);
    assert.match(fs.readFileSync(bakedPath, 'utf8'), /HTML Motion · Plate animation · Plays offline/);
    const proof = { base, show_id: before.show_id, triplets: 3, wide: roles.filter(r => r === 'Wide').length,
      seconds: 11, baked_html_bytes: fs.statSync(bakedPath).size, elapsed_ms: Date.now() - started, forbidden, errors };
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(proof, null, 2));
    assert.deepEqual(forbidden, []); assert.deepEqual(errors, []);
    console.log(JSON.stringify(proof));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

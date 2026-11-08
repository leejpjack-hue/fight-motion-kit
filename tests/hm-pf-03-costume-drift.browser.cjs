/* Run against npm run dev. Exercises the real File API and existing project state. */
'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
const proof = path.resolve(process.env.HM_PROOF_DIR || 'work/qa/hm-pf-03');
const clone = value => JSON.parse(JSON.stringify(value));
const example = JSON.parse(fs.readFileSync('skills/hm-character-lock/examples/costume_lock.json', 'utf8'));
const files = [
  ['L-sheet.png', 'public/assets/daiyu-wang-continuation/P09.png'],
  ['R-sheet.png', 'public/assets/daiyu-wang-continuation/P10.png'],
  ['L-guard.png', 'public/assets/daiyu-wang-eight/P01.png'],
  ['R-guard.png', 'public/assets/daiyu-wang-eight/P02.png'],
].map(([name, filename]) => ({ name, mimeType: 'image/png', buffer: fs.readFileSync(filename) }));
(async () => {
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const blocked = [], errors = [];
    await context.route('**/*', route => {
      const url = route.request().url();
      if (/^(data:|blob:)/.test(url) || new URL(url).origin === new URL(base).origin) return route.continue();
      blocked.push(url); return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.goto(base + '/ui/'); await page.evaluate(() => window.ready);
    const original = await page.evaluate(() => HMStudio.project.show);
    assert.equal(original.show_id, 'daiyu-wang-five-seconds');
    assert.equal(await page.evaluate(() => HMStudio.duration), 5);
    const select = (pack, images = files) => page.setInputFiles('#projectInput', [
      { name: 'costume_lock.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) }, ...images,
    ]);
    const dialog = page.locator('#costumeDriftDialog');
    const allChecks = async () => {
      for (const box of await dialog.locator('input[type="checkbox"]').all()) await box.check();
      await dialog.locator('.reviewer').fill('Browser QA operator');
    };
    const reject = async reason => {
      await dialog.locator('.reject-reason').fill(reason);
      await dialog.locator('.reject').click();
      await page.waitForFunction(reason => document.getElementById('exportStatus').textContent.includes(reason), reason);
      assert.ok((await page.locator('#status').textContent()).includes(reason), 'reject reason is visible in the editor status');
      assert.deepEqual(await page.evaluate(() => HMStudio.project.show), original);
    };

    const missing = clone(example); delete missing.cast.L.lock_refs;
    await select(missing);
    await dialog.waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('.review-status').textContent.includes('Missing L lock_refs'));
    assert.equal(await dialog.locator('.approve').isDisabled(), true);
    await reject('L reference missing; cannot verify identity');

    const claimed = clone(example); claimed.drift_review = { decision: 'Approve', reviewer: 'File claim' };
    await select(claimed); await dialog.waitFor({ state: 'visible' });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true, 'review dialog fits a mobile viewport');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await dialog.locator('.inspect-review-image').first().click();
    assert.equal(await page.locator('.costume-review-image[open] img').count(), 1);
    await page.getByRole('button', { name: 'Close image', exact: true }).click();
    assert.equal(await dialog.locator('input[type="checkbox"]:checked').count(), 0);
    await dialog.locator('.reviewer').fill('Browser QA operator');
    assert.equal(await dialog.locator('.approve').isDisabled(), true);
    await dialog.locator('input[data-side="L"]').first().check();
    assert.equal(await dialog.locator('.approve').isDisabled(), true);
    await allChecks();
    await page.waitForFunction(() => !document.querySelector('.approve').disabled);
    await dialog.locator('input[data-side="R"][data-check="costume"]').uncheck();
    assert.equal(await dialog.locator('.approve').isDisabled(), true);
    await reject('R: jacket color drifts from the locked reference');

    const broken = files.map(file => file.name === 'L-sheet.png' ? { ...file, buffer: Buffer.from('not a PNG') } : file);
    await select(example, broken); await dialog.waitFor({ state: 'visible' });
    await allChecks();
    await page.waitForFunction(() => document.querySelector('.review-status').textContent.startsWith('Import blocked:'));
    assert.equal(await dialog.locator('.approve').isDisabled(), true);
    await reject('Candidate image is unreadable');

    await select(example); await dialog.waitFor({ state: 'visible' });
    await allChecks(); await page.waitForFunction(() => !document.querySelector('.approve').disabled);
    await page.evaluate(() => HMStudio.editProject(project => { project.show.title = 'Edited while reviewing'; }));
    await dialog.locator('.approve').click();
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('project changed during import review'));
    assert.equal(await page.evaluate(() => HMStudio.project.show.title), 'Edited while reviewing');
    assert.equal(await page.evaluate(() => HMStudio.project.show.show_id), original.show_id);
    await page.evaluate(title => HMStudio.editProject(project => { project.show.title = title; }), original.title);
    assert.deepEqual(await page.evaluate(() => HMStudio.project.show), original);

    const t0 = Date.now();
    await select(example); await dialog.waitFor({ state: 'visible' });
    assert.equal(await dialog.locator('input[type="checkbox"]:checked').count(), 0, 're-import resets the review');
    await allChecks();
    await dialog.locator('.reject-reason').fill('Outstanding rejection');
    assert.equal(await dialog.locator('.approve').isDisabled(), true);
    await dialog.locator('.reject-reason').fill('');
    await page.waitForFunction(() => !document.querySelector('.approve').disabled);
    fs.mkdirSync(proof, { recursive: true });
    await dialog.screenshot({ path: path.join(proof, 'review-before-import.png') });
    await dialog.locator('.approve').click();
    await page.waitForFunction(() => HMStudio.project.show.show_id === 'daiyu-wang-skill-example' && !HMStudio.loading);
    assert.ok(Date.now() - t0 < 60000, 'review/import exceeds Jack bar');
    const imported = await page.evaluate(() => HMStudio.project);
    assert.equal(imported.show.chars.L.costume_id, 'daiyu_celadon_tank_v1');
    assert.equal(imported.show.chars.R.costume_id, 'wang_crimson_jacket_v1');
    assert.equal(imported.show.costume_lock.drift_review.reviewer, 'Browser QA operator');
    assert.equal(imported.show.costume_lock.drift_review.checks.R.costume, true);
    assert.ok(imported.assets['L-guard.png'].startsWith('data:image/png;base64,'));
    const refused = await page.evaluate(raw => {
      try { HMStudio.load(raw); return 'unexpectedly accepted'; } catch (e) { return e.message; }
    }, example);
    assert.match(refused, /review is required/);
    const normalizedRefused = await page.evaluate(raw => {
      try { HMStudio.load(HMComposeClient.normalizeCostumeLockPack(raw)); return 'unexpectedly accepted'; } catch (e) { return e.message; }
    }, example);
    assert.match(normalizedRefused, /review is required/, 'normalizing a pack cannot silently bypass review');
    const download = page.waitForEvent('download'); await page.click('#saveProject');
    const saved = await download; assert.equal(await saved.failure(), null);
    const savedPath = path.join(proof, 'reviewed.motion.json'); await saved.saveAs(savedPath);
    const portable = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
    assert.deepEqual(portable.show.costume_lock.drift_review, imported.show.costume_lock.drift_review);
    assert.equal(Object.keys(portable.assets).length, 4);
    await page.setInputFiles('#projectInput', savedPath);
    await page.waitForFunction(() => document.getElementById('exportStatus').textContent === 'Project opened.');
    assert.equal(await page.locator('#costumeDriftDialog').count(), 0, 'saved reviewed project is an edit/reopen, not new sheet generation');
    assert.deepEqual(await page.evaluate(() => HMStudio.project.show.costume_lock.drift_review), imported.show.costume_lock.drift_review);
    assert.deepEqual(blocked, []); assert.deepEqual(errors, []);
    console.log('HM-PF-03 passed: missing refs, incomplete checks, untrusted approval, corrupt image, visible reject reasons, clean re-import, direct-open guard, and portable evidence; 0 external requests/errors.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

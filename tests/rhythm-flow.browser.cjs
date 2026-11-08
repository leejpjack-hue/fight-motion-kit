/* Actual local File API → skill CLI → editable composer loop. Start npm run dev. */
'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
const out = path.resolve(process.env.HM_PROOF_DIR || 'work/qa/rhythm-flow');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const forbidden = [], errors = [];
    await context.route('**/*', route => {
      const request = route.request(), url = request.url();
      if (/^(data:|blob:)/.test(url)) return route.continue();
      if (new URL(url).origin !== new URL(base).origin || /\/api\//.test(url) || request.method() !== 'GET') {
        forbidden.push(url); return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    const settle = async () => { await page.waitForFunction(() => !HMStudio.loading); await page.evaluate(() => HMStudio.compile()); };
    const state = () => page.evaluate(() => HMStudio.project.show);
    const download = async (button, name) => {
      const pending = page.waitForEvent('download'); await page.click('#' + button);
      const file = await pending; assert.equal(await file.failure(), null);
      const target = path.join(out, name); await file.saveAs(target); return target;
    };
    const apply = async file => {
      await page.setInputFiles('#rhythmPlanInput', file);
      await page.waitForFunction(() => document.getElementById('rhythmPlanStatus').textContent.startsWith('Rhythm plan applied.'));
      await settle();
    };
    const run = args => {
      const result = spawnSync(process.execPath, ['skills/hm-rhythm-pacing/scripts/rhythm.cjs', ...args], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr); return result;
    };
    await page.goto(base + '/ui/'); await page.evaluate(() => window.ready);
    assert.equal(await page.evaluate(() => HMStudio.duration), 5);
    assert.equal(await page.locator('.timeline-clip').count(), 8);
    await page.click('#loadGrammarSample');
    await page.waitForFunction(() => HMStudio.project.show.show_id === 'fight-cam-grammar-starter' && !HMStudio.loading);
    await settle();
    assert.equal(await page.evaluate(() => HMStudio.duration), 11);
    await page.goto(base + '/product-flow.html');
    await page.getByRole('link', { name: 'Open camera-grammar cold open' }).click();
    await page.waitForFunction(() => typeof window.ready?.then === 'function');
    await page.evaluate(() => window.ready); await settle();
    assert.equal((await state()).show_id, 'fight-cam-grammar-starter');
    assert.equal(await page.evaluate(() => HMStudio.duration), 11);
    assert.equal(await page.locator('#exportRhythmInput').isDisabled(), true);
    await page.click('#pf09Approve');
    assert.equal(await page.locator('#exportRhythmInput').isEnabled(), true);
    const approved = await download('exportRhythmInput', 'approved.rhythm-input.json');
    const original = await state();
    const source = path.join(out, 'source.json'); fs.writeFileSync(source, JSON.stringify(original));
    const fullPlan = path.join(out, 'full.rhythm-plan.json');
    if (fs.existsSync(fullPlan)) fs.unlinkSync(fullPlan);
    run(['plan', '--board', approved, '--project', source, '--target-s', '12', '--impact-budget', '0', '--out', fullPlan]);
    await apply(fullPlan);
    assert.equal(await page.evaluate(() => HMStudio.duration), 12);
    assert.equal((await state()).duration_target_s, 12);
    assert.match(await page.locator('#rhythmTiming').textContent(), /Δ 0.0000s/);
    assert.match(await page.locator('#impactWarning').textContent(), /Over budget/);
    assert.equal(await page.locator('#impactMeter').evaluate(el => el.value > el.high), true);
    await page.click('#exportOpen');
    assert.equal(await page.locator('#exportHtml').isEnabled(), true, 'impact warning does not block bake');
    await page.getByRole('button', { name: 'Close export', exact: true }).click();
    await page.click('#undo'); await settle(); assert.deepEqual(await state(), original);
    await page.click('#redo'); await settle();
    await page.click('.timeline-clip[data-index="5"]');
    const impactBefore = await page.locator('#impactReadout').textContent();
    await page.fill('#duration', '1.5'); await page.locator('#duration').dispatchEvent('change'); await settle();
    assert.notEqual(await page.locator('#impactReadout').textContent(), impactBefore);
    assert.match(await page.locator('#rhythmTiming').textContent(), /Δ \+/);
    assert.ok(await page.locator('[data-code="duration_target_mismatch"]').count() > 0);
    const portable = await download('saveProject', 'rhythm.motion.json');
    const saved = JSON.parse(fs.readFileSync(portable));
    assert.equal(saved.show.rhythm.impact_budget, 0); assert.equal(saved.show.duration_target_s, 12);
    await page.setInputFiles('#projectInput', portable);
    await page.waitForFunction(() => document.getElementById('exportStatus').textContent === 'Project opened.'); await settle();
    assert.equal(await page.locator('#impactBudget').inputValue(), '0');
    assert.equal(await page.locator('#rhythmTarget').inputValue(), '12');

    // Add an unselected impact through the existing FX control, then approve this exact story.
    await page.click('.timeline-clip[data-index="8"]');
    await page.click('[data-effect="hit_orange"]'); await settle();
    await page.click('#pf09Approve');
    const packInput = await download('exportRhythmInput', 'packs.rhythm-input.json');
    const beforePacks = await state(), source2 = path.join(out, 'pack-source.json');
    fs.writeFileSync(source2, JSON.stringify(beforePacks));
    const ids = [beforePacks.atoms[1].id, beforePacks.atoms[5].id].join(',');
    for (const pack of ['dialogue_film_slow', 'micro_cut_flurry']) {
      const file = path.join(out, pack + '.rhythm-plan.json'); if (fs.existsSync(file)) fs.unlinkSync(file);
      run(['stamp', '--board', packInput, '--project', source2, '--pack', pack, '--beats', ids, '--out', file]);
      await apply(file);
      const actual = await state();
      const gold = await page.evaluate(({ source, id }) => HMComposeClient.applyTimingPack(source, [1, 5], HMStudio.timingPacks.packs.find(p => p.id === id)), { source: beforePacks, id: pack });
      assert.deepEqual(actual.atoms, gold.atoms);
      assert.deepEqual(actual.atoms[8], beforePacks.atoms[8], 'unselected impact remains untouched');
      await page.click('#undo'); await settle(); assert.deepEqual(await state(), beforePacks);
    }
    const bad = JSON.parse(fs.readFileSync(fullPlan)); bad.approval.Decision = 'Rework';
    await page.setInputFiles('#rhythmPlanInput', { name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('Jack GO required'));
    assert.deepEqual(await state(), beforePacks);
    const broken = await page.evaluate(() => HMStudio.project); delete broken.show.atoms[0].duration_s;
    await page.setInputFiles('#projectInput', { name: 'missing-duration.motion.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(broken)) });
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('Each clip needs a duration'));
    assert.deepEqual(await state(), beforePacks);
    await page.locator('#rhythmPanel').screenshot({ path: path.join(out, 'rhythm-panel.png') });
    await page.click('#pf09Rework'); assert.equal(await page.locator('#exportRhythmInput').isDisabled(), true);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(forbidden, []); assert.deepEqual(errors, []);
    console.log('Rhythm flow passed: real CLI plan/stamps, GO, Undo, unselected impact, live budget/time, signed delta, portable reopen, missing duration rejection, mobile; zero backend requests/errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

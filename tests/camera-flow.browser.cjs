/* Start npm run dev. Real File API → both skill CLIs → editable portable show. */
'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
const out = path.resolve(process.env.HM_PROOF_DIR || 'work/qa/camera-flow');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const forbidden = [], errors = [];
    await context.route('**/*', route => {
      const request = route.request(), url = request.url();
      if (/^(data:|blob:)/.test(url)) return route.continue();
      if (new URL(url).origin !== new URL(base).origin || /\/api\//.test(url) || request.method() !== 'GET') { forbidden.push(url); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
    const settle = async () => { await page.waitForFunction(() => !HMStudio.loading); await page.evaluate(() => HMStudio.compile()); };
    const state = () => page.evaluate(() => HMStudio.project.show);
    const download = async (button, name) => {
      const pending = page.waitForEvent('download'); await page.click('#' + button);
      const file = await pending; assert.equal(await file.failure(), null);
      const target = path.join(out, name); await file.saveAs(target); return target;
    };
    const run = (script, args) => {
      const result = spawnSync(process.execPath, ['skills/' + script, ...args], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    };
    await page.goto(base + '/ui/'); await page.evaluate(() => window.ready); await settle();
    assert.equal(await page.evaluate(() => HMStudio.duration), 5);
    assert.equal(await page.locator('.timeline-clip').count(), 8);
    await page.locator('#cameraGrammar summary').click();
    assert.equal(await page.locator('#exportCameraGrammar').isDisabled(), true);
    assert.equal(await page.locator('#grammarUpgrade').isVisible(), true);
    assert.match(await page.locator('#grammarUpgradeFlag').innerText(), /no Wide beat/);
    assert.match(await page.locator('#grammarUpgradeFlag').innerText(), /Intent → Action → Reaction/);
    assert.equal(await page.evaluate(() => HMStudio.showLint.clean), true);
    const backupPath = await download('downloadGrammarBackup', 'five.grammar-upgrade-backup.json');
    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    assert.equal(backup.kind, 'hm-grammar-upgrade-backup');
    assert.equal(backup.show.show_id, 'daiyu-wang-five-seconds');
    assert.equal(backup.show.atoms[0].camera.preset, 'static_hold');
    const beforeUpgrade = await state();
    const remapDownload = page.waitForEvent('download');
    await page.click('#suggestGrammarUpgrade');
    const remapFile = await remapDownload;
    assert.equal(await remapFile.failure(), null);
    const remapBackupPath = path.join(out, 'five.remap-backup.json');
    await remapFile.saveAs(remapBackupPath);
    assert.deepEqual(JSON.parse(fs.readFileSync(remapBackupPath, 'utf8')).show, backup.show);
    await page.waitForFunction(() => document.getElementById('cameraPlanStatus').textContent.startsWith('Grammar remap applied'));
    await settle();
    const remapped = await state();
    assert.equal(remapped.atoms[0].grammar_role, 'Wide');
    assert.equal(remapped.atoms[0].camera.preset, 'low_rise');
    assert.equal(remapped.atoms[7].grammar_role, 'Wide');
    assert.equal(remapped.atoms[7].camera.preset, 'eye_orbit');
    remapped.atoms.forEach((atom, index) => {
      assert.equal(atom.duration_s, beforeUpgrade.atoms[index].duration_s);
      assert.deepEqual(atom.hero, beforeUpgrade.atoms[index].hero);
      assert.deepEqual(atom.fx_hooks, beforeUpgrade.atoms[index].fx_hooks);
    });
    assert.equal(await page.evaluate(() => HMStudio.duration), 5);
    assert.equal(await page.locator('#grammarUpgrade').isVisible(), false);
    await page.click('#undo'); await settle();
    assert.deepEqual(await state(), beforeUpgrade);
    assert.equal(await page.locator('#grammarUpgrade').isVisible(), true);
    await page.click('#loadGrammarSample');
    await page.waitForFunction(() => HMStudio.project.show.show_id === 'fight-cam-grammar-starter' && !HMStudio.loading); await settle();
    assert.equal(await page.locator('#grammarUpgrade').isVisible(), false);
    assert.equal(await page.locator('#exportCameraInput').isDisabled(), true);
    await page.click('#pf09Approve');
    const approved = await download('exportCameraInput', 'approved.camera-input.json');
    const source = await state(), grammar = path.join(out, 'grammar.json'), md = path.join(out, 'grammar.md'), map = path.join(out, 'map.json'), clauses = path.join(out, 'clauses.txt');
    for (const file of [grammar, md, map, clauses]) if (fs.existsSync(file)) fs.unlinkSync(file);
    run('hm-cam-grammar-scene/scripts/grammar.cjs', ['--board', approved, '--out', grammar, '--markdown', md, '--intent', 'Readable exchange and re-establish']);
    run('hm-cam-shot-author/scripts/author.cjs', ['--grammar', grammar, '--out', map, '--clauses', clauses]);
    await page.setInputFiles('#cameraPlanInput', map);
    await page.waitForFunction(() => document.getElementById('cameraPlanStatus').textContent.startsWith('Camera grammar applied.')); await settle();
    const authored = await state();
    assert.equal(authored.atoms[1].camera.preset, 'eye_hold');
    authored.atoms.forEach((atom, i) => { for (const key of ['duration_s', 'hero', 'fx_hooks']) assert.deepEqual(atom[key], source.atoms[i][key]); });
    assert.equal(await page.locator('#exportCameraGrammar').isEnabled(), true);
    await page.click('#undo'); await settle(); assert.deepEqual(await state(), source);
    await page.click('#redo'); await settle(); assert.deepEqual(await state(), authored);
    await page.click('.timeline-clip[data-index="1"]');
    await page.selectOption('#camera', 'slide_left'); await settle();
    assert.match(await page.locator('#grammarClause').inputValue(), /camera tracks left/);
    await page.fill('#grammarPurpose', 'keep the opening visible'); await page.locator('#grammarPurpose').blur(); await settle();
    assert.match(await page.locator('#grammarClause').inputValue(), /keep the opening visible/);
    const beforeRole = await state();
    await page.selectOption('#grammarRole', 'Action'); await settle();
    assert.equal((await state()).atoms[1].camera_grammar.role, 'Action');
    assert.equal(await page.locator('#exportCameraGrammar').isDisabled(), true, 'incomplete triplets stay editable but cannot export');
    assert.equal(await page.evaluate(() => HMStudio.composed.ok), true, 'planning validation does not block the ordinary renderer');
    await page.click('#undo'); await settle(); assert.deepEqual(await state(), beforeRole);
    assert.equal(await page.locator('#exportCameraGrammar').isEnabled(), true);
    const exported = await download('exportCameraClauses', 'edited-clauses.txt');
    assert.match(fs.readFileSync(exported, 'utf8'), /camera tracks left.*keep the opening visible/);
    const exportedJson = await download('exportCameraClausesJson', 'edited-clauses.json');
    const clausePack = JSON.parse(fs.readFileSync(exportedJson, 'utf8'));
    assert.equal(clausePack.kind, 'hm-camera-clauses');
    assert.equal(clausePack.report_convention, 'fight-prompting-enhancements-2026-11-01');
    assert.match(clausePack.clauses.t1_intent_ots_L_hold, /camera tracks left.*keep the opening visible/);
    // Round-trip edited JSON clauses through hm-cam-shot-author and directly into #cameraPlanInput
    clausePack.clauses.t1_intent_ots_L_hold = clausePack.clauses.t1_intent_ots_L_hold.replace('keep the opening visible', 'hold screen-left guard for prompt pack');
    const roundtripClausesFile = path.join(out, 'roundtrip.camera-clauses.json');
    const roundtripMapFile = path.join(out, 'roundtrip.map.json');
    if (fs.existsSync(roundtripMapFile)) fs.unlinkSync(roundtripMapFile);
    fs.writeFileSync(roundtripClausesFile, JSON.stringify(clausePack, null, 2));
    run('hm-cam-shot-author/scripts/author.cjs', ['--grammar', roundtripClausesFile, '--out', roundtripMapFile]);
    await page.setInputFiles('#cameraPlanInput', roundtripClausesFile);
    await page.waitForFunction(() => document.getElementById('cameraPlanStatus').textContent.startsWith('Camera grammar applied.')); await settle();
    assert.equal((await state()).atoms[1].camera_grammar.purpose, 'hold screen-left guard for prompt pack');
    await page.click('#undo'); await settle();
    assert.equal((await state()).atoms[1].camera_grammar.purpose, 'keep the opening visible');

    // HM-PF-20 (#100): Wide re-establish beat picker and zero-Wide grammar lint warning
    const beforeWidePicker = await state();
    await page.click('.timeline-clip[data-index="0"]');
    await page.selectOption('#grammarRole', 'Intent'); await settle();
    await page.click('.timeline-clip[data-index="10"]');
    await page.selectOption('#grammarRole', 'Reaction'); await settle();
    const zeroWideLint = await page.evaluate(() => HMStudio.showLint);
    assert.ok(zeroWideLint.findings.some(f => f.code === 'scene_missing_wide'), 'grammar lint warns when scene has zero Wide');
    assert.match(await page.locator('#cameraGrammarValidation').textContent(), /Wide/);
    await page.click('#markWideBeat'); await settle();
    assert.equal((await state()).atoms[10].grammar_role, 'Wide');
    assert.equal((await state()).atoms[10].camera.preset, 'eye_orbit');
    await page.click('.timeline-clip[data-index="0"]');
    await page.selectOption('#widePresetPicker', 'low_rise');
    await page.click('#markWideBeat'); await settle();
    assert.equal((await state()).atoms[0].grammar_role, 'Wide');
    assert.equal((await state()).atoms[0].camera.preset, 'low_rise');
    assert.equal((await page.evaluate(() => HMStudio.showLint)).findings.some(f => f.code === 'scene_missing_wide'), false);
    await page.selectOption('#widePresetPicker', 'eye_orbit');
    await page.click('.timeline-clip[data-index="3"]');
    await page.click('#insertWideBeat'); await settle();
    assert.equal((await state()).atoms.length, 12);
    assert.equal((await state()).atoms[4].grammar_role, 'Wide');
    assert.equal((await state()).atoms[4].camera.preset, 'eye_orbit');
    await page.locator('#widePresetPicker').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, 'wide-picker.png') });
    // Undo back to beforeWidePicker so subsequent assertions run on the 11-clip state
    for (let u = 0; u < 5; u++) { await page.click('#undo'); await settle(); }
    assert.deepEqual(await state(), beforeWidePicker);
    await page.click('.timeline-clip[data-index="1"]');

    const sheet = await download('exportCameraSheet', 'edited-sheet.md');
    assert.match(fs.readFileSync(sheet, 'utf8'), /\| slide_left \|/);
    await page.locator('#grammarPurpose').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, 'grammar-panel.png') });

    // Different camera offsets used to make cuts jump; the explicit chain action normalizes them.
    await page.click('.timeline-clip[data-index="0"]');
    await page.selectOption('#camera', 'slow_push'); await page.fill('#panX', '30'); await page.locator('#panX').blur(); await settle();
    const beforeChain = await state();
    await page.click('.timeline-clip[data-index="2"]', { modifiers: ['Shift'] });
    assert.equal(await page.locator('.timeline-clip.in-range').count(), 3);
    assert.match(await page.locator('#cameraChainSelection').textContent(), /Clips 1–3/);
    await page.click('#chainSnap'); await settle();
    const chained = await state();
    assert.deepEqual(chained.atoms.slice(3), beforeChain.atoms.slice(3));
    assert.equal(chained.atoms[2].camera.chain.count, 3);
    assert.equal(chained.atoms[1].camera.snap_zoom, true);
    assert.equal(chained.atoms[1].camera.nudge.x, 30);
    assert.equal(await page.locator('#camEase').inputValue(), 'snap');
    const discontinuities = await page.evaluate(() => {
      const result = HMStudio.composed, failures = [];
      for (const cut of [1, 2]) {
        const left = HMComposeClient.inspectAt(result, cut - 1e-5).cam_pose, right = HMComposeClient.inspectAt(result, cut).cam_pose;
        for (const key of ['x', 'y', 's', 'r']) if (Math.abs(left[key] - right[key]) > 1e-3) failures.push(key);
      }
      return failures;
    });
    assert.deepEqual(discontinuities, []);
    await page.click('#undo'); await settle(); assert.deepEqual(await state(), beforeChain);
    await page.click('#redo'); await settle(); assert.deepEqual(await state(), chained);
    const portable = await download('saveProject', 'camera.motion.json');
    const saved = JSON.parse(fs.readFileSync(portable));
    assert.ok(saved.show.camera_authoring.approval.story_snapshot);
    assert.equal(saved.show.atoms[1].camera_grammar.purpose, 'keep the opening visible');
    await page.locator('#chainSnap').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, 'chain-panel.png') });

    const invalid = JSON.parse(fs.readFileSync(map)); invalid.grammar.rows[0].preset_id = 'wide_invented';
    await page.setInputFiles('#cameraPlanInput', { name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
    await page.waitForFunction(() => document.getElementById('cameraPlanStatus').textContent.includes('Missing camera preset'));
    assert.deepEqual(await state(), chained);
    // A changed story cannot silently reuse the earlier GO record.
    await page.fill('#clipName', 'changed story'); await page.locator('#clipName').blur(); await settle();
    assert.equal(await page.locator('#exportCameraGrammar').isDisabled(), true);
    await page.click('#undo'); await settle();
    await page.click('#pf09Rework'); assert.equal(await page.locator('#exportCameraGrammar').isDisabled(), true);
    await page.click('#pf09Approve'); assert.equal(await page.locator('#exportCameraGrammar').isEnabled(), true);
    await page.click('.timeline-clip[data-index="10"]'); assert.equal(await page.locator('#chainSnap').isDisabled(), true);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await context.close();

    // Fresh storage/browser context: the portable project carries authoring and chain state.
    const fresh = await browser.newContext({ acceptDownloads: true });
    await fresh.route('**/*', route => {
      const request = route.request(), url = request.url();
      if (/^(data:|blob:)/.test(url)) return route.continue();
      if (new URL(url).origin !== new URL(base).origin || /\/api\//.test(url) || request.method() !== 'GET') { forbidden.push(url); return route.abort(); }
      return route.continue();
    });
    const reopened = await fresh.newPage(); reopened.on('dialog', dialog => dialog.accept()); reopened.on('pageerror', e => errors.push(e.message));
    await reopened.goto(base + '/ui/'); await reopened.evaluate(() => window.ready);
    await reopened.setInputFiles('#projectInput', portable);
    await reopened.waitForFunction(() => document.getElementById('exportStatus').textContent === 'Project opened.' && !HMStudio.loading, null, { timeout: 60000 });
    assert.deepEqual(await reopened.evaluate(() => HMStudio.project.show), saved.show);
    assert.equal(await reopened.locator('#exportCameraGrammar').isEnabled(), true);
    const restored = await reopened.evaluate(() => HMCameraAuthor.fromShow(HMStudio.project.show, HMStudio.cameraPresets));
    assert.equal(restored.rows[1].purpose, 'keep the opening visible');
    fs.writeFileSync(path.join(out, 'authored.show.json'), JSON.stringify(saved.show, null, 2));
    assert.deepEqual(forbidden, []); assert.deepEqual(errors, []);
    await fresh.close();
    console.log('Camera flow passed: both real CLIs, GO, strict import, manual preset/clause edits, Undo/redo, snap continuity, portable fresh reopen, stale story/Rework rejection, mobile; zero backend calls/errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

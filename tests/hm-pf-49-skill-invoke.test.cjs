'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { invoke, SHOW_ID } = require('../ops/n8n/skill-invoke/handlers.cjs');
const { assessLayout, assessRepo } = require('../ops/n8n/skill-invoke/pack.cjs');

test('step 1 reads the void-array cast and does not claim a lock pack', async () => {
  const result = await invoke('character-openpose', { step: 1, step_id: 'character', show_id: SHOW_ID });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'incomplete');
  assert.equal(result.inspected.L, '白甲槍士');
  assert.equal(result.inspected.R, '精靈法師');
  assert.equal(result.product_compose_api, false);
  assert.equal(result.writes_source_show, false);
});

test('steps without a GO or a strip stay incomplete', async () => {
  for (const route of ['storyboard-draft', 'rhythm-frame-qa', 'cam-grammar-plan', 'cam-preset-tune', 'sprite-gen-cli', 'fg-fx']) {
    const result = await invoke(route, { show_id: 'SHOW-PLACEHOLDER' });
    assert.equal(result.ok, false, route);
    assert.equal(result.show_id, SHOW_ID);
    assert.equal(result.writes_source_show, false);
  }
  const sprite = await invoke('sprite-gen-cli', { show_id: SHOW_ID });
  assert.equal(sprite.not_playable, true);
});

test('a different show id is refused', async () => {
  await assert.rejects(() => invoke('character-openpose', { show_id: 'other-show' }), /void-array/);
});

test('the checkout layout is the board-slate stub', () => {
  const verdict = assessRepo(path.resolve(__dirname, '..'));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'slate-stub');
});

test('compose refuses the slate stub and does not encode', async () => {
  const result = await invoke('hm-composer-assist', { step: 9, step_id: 'compose', show_id: SHOW_ID });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'missing_plates');
  assert.equal(result.pack.reason, 'slate-stub');
  assert.equal(result.writes_source_show, false);
  assert.equal(fs.existsSync(path.resolve(__dirname, '../work/skill-invoke', SHOW_ID, SHOW_ID + '.mp4')), false);
});

test('a layout that names a missing cutout is not pack-ready', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'va-pack-'));
  const layout = { P01: { parts: [{ src: 'cutout/P01.png' }] } };
  const verdict = assessLayout(layout, [dir]);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'missing-cutouts');
  assert.equal(verdict.sample, 'cutout/P01.png');
});

test('a layout with the cutout file on disk is pack-ready', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'va-pack-'));
  fs.mkdirSync(path.join(dir, 'cutout'));
  fs.writeFileSync(path.join(dir, 'cutout', 'P01.png'), Buffer.from('not-a-real-png'));
  const layout = { P01: { parts: [{ src: 'cutout/P01.png' }] } };
  const verdict = assessLayout(layout, [dir]);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.reason, 'pack-ready');
});

test('background author refuses to overwrite the pack motion', async () => {
  const result = await invoke('bg-frame', { step: 7, step_id: 'background', show_id: SHOW_ID });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'tool_refused');
  assert.match(result.stderr, /background motion|already has a crop/);
  assert.equal(result.writes_source_show, false);
});

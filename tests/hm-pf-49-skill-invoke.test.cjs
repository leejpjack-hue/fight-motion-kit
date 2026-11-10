'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { invoke, SHOW_ID } = require('../ops/n8n/skill-invoke/handlers.cjs');

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

test('background author refuses to overwrite the pack motion', async () => {
  const result = await invoke('bg-frame', { step: 7, step_id: 'background', show_id: SHOW_ID });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'tool_refused');
  assert.match(result.stderr, /background motion|already has a crop/);
  assert.equal(result.writes_source_show, false);
});

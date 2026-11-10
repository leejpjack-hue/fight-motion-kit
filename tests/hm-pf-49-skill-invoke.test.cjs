'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { invoke, SHOW_ID } = require('../ops/n8n/skill-invoke/handlers.cjs');
const { assessLayout, assessRepo } = require('../ops/n8n/skill-invoke/pack.cjs');
const { assignments, assemble } = require('../ops/n8n/skill-invoke/assemble-scratch-pack.cjs');
const { spawnSync } = require('node:child_process');

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

test('scratch assignments cover every storyboard plate once', () => {
  const map = assignments();
  assert.equal(Object.keys(map).length, 47);
  assert.equal(map.P01, 'k01');
  assert.equal(map.P02, 'k02');
  assert.equal(map.P05, 'k03');
  assert.equal(map.P23, 'k04');
  assert.equal(map.P28, 'k05');
  assert.equal(map.P36, 'k06');
  assert.equal(map.P47, 'k07');
  assert.equal(new Set(Object.values(map)).size, 7);
});

test('assemble writes a pack the slate gate accepts', () => {
  const ffmpeg = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  if (ffmpeg.status !== 0) return;
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'va-keys-'));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'va-pack-'));
  const names = ['va-k01-open.jpg', 'va-k02-magic.jpg', 'va-k03b-clash.jpg', 'va-k04-midair.jpg', 'va-k05-disarm.jpg', 'va-k06-freeze.jpg', 'va-k07-end.jpg'];
  for (const name of names) {
    const made = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=white:s=64x36', '-frames:v', '1', path.join(src, name)], { encoding: 'utf8' });
    assert.equal(made.status, 0, name);
  }
  const packed = assemble({ src, out });
  assert.equal(packed.ok, true);
  assert.equal(packed.keys, 7);
  const verdict = assessLayout(JSON.parse(fs.readFileSync(packed.layout, 'utf8')), [out]);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.reason, 'pack-ready');
  assert.equal(verdict.plates, 47);
});

test('background author refuses to overwrite the pack motion', async () => {
  const result = await invoke('bg-frame', { step: 7, step_id: 'background', show_id: SHOW_ID });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'tool_refused');
  assert.match(result.stderr, /background motion|already has a crop/);
  assert.equal(result.writes_source_show, false);
});

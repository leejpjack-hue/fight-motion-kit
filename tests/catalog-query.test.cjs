const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
require('../public/ui/catalog-query.js');

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const cameras = read('public/presets/camera_presets.json');
const fx = read('public/presets/fx_presets.json');

function atom(extra) {
  return Object.assign({
    id: 'beat-01',
    duration_s: 0.5,
    plates_needed: 1,
    pose_mode: 'hero',
    motion: { family: 'fight', beat_class: 'straight' },
    hero: { layout_source: 'assets/daiyu-wang-eight/layout.json', plates: ['P01'] },
    camera: { preset: 'static_hold', nudge: { x: 4, y: 0, s: 0, r: 0 }, intensity: 1.25, params: { s: { type: 'const', v: 1.01 } } },
    fx_hooks: [{ type: 'shake', t_rel: 0.2, params: { amp: 5 } }],
    timing_hold: { kind: 'hold' }
  }, extra);
}

test('empty beat-block registry still indexes cam presets and FX hooks', () => {
  for (const beatBlocks of [null, undefined, { blocks: [] }, { nope: true }]) {
    const index = HMCatalogQuery.buildIndex({ cameras, fx, beatBlocks, catalog: null });
    assert.equal(index.counts.block, 0);
    assert.ok(index.counts.cam >= 25, String(index.counts.cam));
    assert.ok(index.counts.fx >= 15, String(index.counts.fx));
    assert.equal(index.counts.caption_style, 2);
    assert.equal(index.sources.caption_stubs, true);
  }
});

test('query matches id, label, and description and filters by kind and theme', () => {
  const index = HMCatalogQuery.buildIndex({ cameras, fx, beatBlocks: { blocks: [] } });
  const whip = HMCatalogQuery.query(index, { q: 'whip' }).map(hit => hit.id);
  assert.ok(whip.includes('whip_A_to_B'));
  assert.ok(whip.includes('face_whip'));
  const whipCam = HMCatalogQuery.query(index, { q: 'whip', kind: 'cam' });
  assert.ok(whipCam.every(hit => hit.kind === 'cam'));
  assert.ok(whipCam.some(hit => hit.id === 'face_whip' && hit.themes.includes('eye') && hit.themes.includes('whip_pan')));
  const hits = HMCatalogQuery.query(index, { q: 'hit', kind: 'fx' }).map(hit => hit.id);
  assert.ok(hits.includes('hit_orange'));
  assert.ok(hits.includes('hit_pink'));
  assert.ok(hits.every(id => index.hits.find(hit => hit.id === id).kind === 'fx'));
  const eye = HMCatalogQuery.query(index, { theme: 'eye', kind: 'cam' });
  assert.ok(eye.length > 0);
  assert.ok(eye.every(hit => hit.themes.some(tag => tag.toLowerCase() === 'eye')));
  assert.equal(HMCatalogQuery.query(index, { theme: 'STREET' }).map(hit => hit.id).join(','), 'street_mark');
  assert.equal(HMCatalogQuery.query(index, { q: 'clash', kind: 'caption_style' }).map(hit => hit.id).join(','), 'impact_hit');
  assert.deepEqual(HMCatalogQuery.query(index, { q: 'does-not-exist' }), []);
});

test('cam and fx Apply keep poses and timing when no beat blocks exist', () => {
  const index = HMCatalogQuery.buildIndex({ cameras, fx, beatBlocks: null });
  const whip = index.hits.find(hit => hit.id === 'whip_A_to_B');
  const clip = atom({
    camera: {
      preset: 'static_hold',
      nudge: { x: 4 },
      intensity: 1.25,
      params: { s: { type: 'const', v: 1.01 } },
      segments: [
        { preset: 'static_hold', dur_s: 0.2 },
        { preset: 'slow_push', dur_s: 0.3 }
      ]
    }
  });
  const cam = HMCatalogQuery.applyHit(clip, whip);
  assert.equal(cam.ok, true);
  assert.equal(clip.camera.preset, 'whip_A_to_B');
  assert.equal(clip.camera.angle, 'eye');
  assert.equal(clip.camera.move, 'whip_pan');
  assert.equal(clip.camera.params, undefined);
  assert.equal(clip.camera.nudge.x, 4);
  assert.equal(clip.camera.intensity, 1.25);
  assert.equal(clip.camera.segments[0].preset, 'whip_A_to_B');
  assert.equal(clip.camera.segments[0].dur_s, 0.2);
  assert.equal(clip.camera.segments[1].preset, 'slow_push');
  assert.equal(clip.duration_s, 0.5);
  assert.deepEqual(clip.hero.plates, ['P01']);
  assert.equal(clip.motion.beat_class, 'straight');
  assert.equal(clip.timing_hold.kind, 'hold');
  assert.deepEqual(clip.fx_hooks.map(hook => hook.type), ['shake']);

  const orange = index.hits.find(hit => hit.kind === 'fx' && hit.id === 'hit_orange');
  const added = HMCatalogQuery.applyHit(clip, orange);
  assert.equal(added.code, 'applied');
  assert.deepEqual(clip.fx_hooks.map(hook => hook.type), ['shake', 'hit_orange']);
  assert.equal(clip.fx_hooks[1].t_rel, 0.08);
  assert.equal(clip.camera.preset, 'whip_A_to_B');
  assert.equal(clip.duration_s, 0.5);
  const again = HMCatalogQuery.applyHit(clip, orange);
  assert.equal(again.code, 'unchanged');
  assert.equal(clip.fx_hooks.length, 2);
});

test('Apply warns when no atom is selected and does not throw', () => {
  const index = HMCatalogQuery.buildIndex({ cameras, fx });
  const hit = index.hits.find(item => item.id === 'static_hold');
  for (const missing of [null, undefined]) {
    const result = HMCatalogQuery.applyHit(missing, hit);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'no-selection');
    assert.match(result.message, /Select a clip/);
  }
});

test('block hits appear from a registry and Apply sets cam, hooks, and beat without touching plates', () => {
  const registry = {
    blocks: [{
      id: 'street_clash',
      label: 'Street clash',
      theme: 'STREET',
      beat_class: 'clash',
      family: 'fight',
      camera: { preset: 'face_whip' },
      fx_hooks: ['hit_pink', { type: 'shake', t_rel: 0.4 }],
      caption: 'CLASH'
    }]
  };
  const index = HMCatalogQuery.buildIndex({ cameras, fx, beatBlocks: registry });
  assert.equal(index.counts.block, 1);
  const hits = HMCatalogQuery.query(index, { q: 'clash', kind: 'block' });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'street_clash');
  assert.ok(hits[0].themes.includes('STREET'));
  assert.ok(hits[0].themes.includes('clash'));
  const clip = atom();
  clip.fx_hooks = [];
  clip.caption = '';
  const result = HMCatalogQuery.applyHit(clip, hits[0]);
  assert.equal(result.ok, true);
  assert.equal(clip.camera.preset, 'face_whip');
  assert.equal(clip.camera.angle, 'eye');
  assert.equal(clip.motion.beat_class, 'clash');
  assert.equal(clip.motion.family, 'fight');
  assert.deepEqual(clip.fx_hooks.map(hook => hook.type), ['hit_pink', 'shake']);
  assert.equal(clip.caption, 'CLASH');
  assert.equal(clip.duration_s, 0.5);
  assert.deepEqual(clip.hero.plates, ['P01']);
  assert.equal(clip.timing_hold.kind, 'hold');
  const second = HMCatalogQuery.applyHit(clip, hits[0]);
  assert.equal(second.ok, true);
  assert.equal(clip.fx_hooks.length, 2);
});

test('catalog.beat_blocks is picked up when the presets file is empty', () => {
  const index = HMCatalogQuery.buildIndex({
    cameras,
    fx,
    beatBlocks: { blocks: [] },
    catalog: { beat_blocks: [{ id: 'from_catalog', label: 'From catalog', theme: 'STREET', preset: 'low_rise' }] }
  });
  assert.equal(index.counts.block, 1);
  assert.equal(index.hits.find(hit => hit.kind === 'block').id, 'from_catalog');
});

test('tip beat registry at blocks/beat_blocks.json indexes STREET block ids', () => {
  const doc = read('public/blocks/beat_blocks.json');
  const index = HMCatalogQuery.buildIndex({ cameras, fx, beatBlocks: doc, catalog: { beat_blocks: { path: 'blocks/beat_blocks.json', theme: 'STREET', count: 16 } } });
  assert.equal(index.counts.block, 16);
  const whip = HMCatalogQuery.query(index, { q: 'street_whip_action', kind: 'block' });
  assert.equal(whip.length, 1);
  assert.equal(whip[0].payload.camera.preset, 'whip_A_to_B');
  assert.deepEqual(whip[0].payload.fx_hooks, ['speed_lines']);
  const fist = index.hits.find(hit => hit.id === 'street_ecu_fist');
  assert.equal(fist.kind, 'block');
  assert.equal(fist.payload.camera.preset, 'ecu_fist_lens');
  assert.deepEqual(fist.payload.fx_hooks, ['hit_orange', 'hitstop_2f']);
  assert.ok(fist.themes.includes('STREET'));
});

test('caption stub sets caption_style and leaves an existing caption', () => {
  const index = HMCatalogQuery.buildIndex({ cameras, fx, beatBlocks: { blocks: [] } });
  const stub = index.hits.find(hit => hit.id === 'impact_hit');
  const clip = atom();
  clip.caption = 'already';
  const result = HMCatalogQuery.applyHit(clip, stub);
  assert.equal(result.ok, true);
  assert.equal(clip.caption_style, 'impact_hit');
  assert.equal(clip.caption, 'already');
  assert.equal(clip.camera.preset, 'static_hold');
});

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

test('wave 1 pixelfx rows index as fx and Apply adds the hook without wiping the clip', () => {
  const wave = read('public/presets/pixelfx_wave1.json');
  const index = HMCatalogQuery.buildIndex({ cameras, fx, pixelfx: wave, beatBlocks: { blocks: [] } });
  const ids = [
    'impacts/hit-spark', 'impacts/blunt-hit', 'impacts/crit-hit', 'impacts/hit-flash',
    'impacts/impact-frame', 'impacts/parry', 'impacts/ground-slam', 'impacts/heavy-landing',
    'melee/uppercut', 'explosions/cartoon-pow', 'explosions/dirt-explosion', 'explosions/smoke-bomb'
  ];
  assert.equal(wave.length, 12);
  assert.equal(index.sources.pixelfx, 12);
  assert.ok(index.counts.fx >= 15 + 12);
  for (const id of ids) {
    const hit = index.hits.find(item => item.kind === 'fx' && item.id === id);
    assert.ok(hit, id);
    assert.equal(hit.family, 'pixelfx');
    assert.equal(hit.source, 'pixelfx');
    assert.ok(hit.themes.includes('pixelfx'));
    const row = wave.find(item => item.id === id);
    assert.equal(hit.label, row.label);
    assert.equal(hit.description, row.notes);
  }
  assert.ok(index.hits.some(hit => hit.kind === 'fx' && hit.id === 'hit_pink' && hit.source !== 'pixelfx'));
  const spark = HMCatalogQuery.query(index, { q: 'Hit spark', kind: 'fx' });
  assert.ok(spark.some(hit => hit.id === 'impacts/hit-spark'));
  const byId = HMCatalogQuery.query(index, { q: 'explosions/smoke-bomb', kind: 'fx' });
  assert.equal(byId.length, 1);
  assert.equal(byId[0].label, 'Smoke bomb');
  const themed = HMCatalogQuery.query(index, { theme: 'pixelfx', kind: 'fx' });
  assert.equal(themed.length, 12);

  const clip = atom();
  const before = {
    plates: clip.hero.plates.slice(),
    duration: clip.duration_s,
    preset: clip.camera.preset,
    nudge: clip.camera.nudge.x,
    timing: clip.timing_hold.kind
  };
  const hit = index.hits.find(item => item.id === 'impacts/hit-spark');
  const added = HMCatalogQuery.applyHit(clip, hit);
  assert.equal(added.code, 'applied');
  assert.deepEqual(clip.fx_hooks[1], { type: 'impacts/hit-spark', t_rel: 0.08, source: 'pixelfx' });
  assert.equal(clip.fx_hooks[0].type, 'shake');
  assert.equal(clip.hero.plates[0], before.plates[0]);
  assert.equal(clip.duration_s, before.duration);
  assert.equal(clip.camera.preset, before.preset);
  assert.equal(clip.camera.nudge.x, before.nudge);
  assert.equal(clip.timing_hold.kind, before.timing);
  const again = HMCatalogQuery.applyHit(clip, hit);
  assert.equal(again.code, 'unchanged');
  assert.equal(clip.fx_hooks.length, 2);
  const missing = HMCatalogQuery.applyHit(null, hit);
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'no-selection');
  assert.match(missing.message, /Select a clip/);
});

test('HM-PF-23 catalog query returns cam preset ids and short labels and applies the preset to the current beat', () => {
  const catalog = read('public/catalog.json');
  const index = HMCatalogQuery.buildIndex({ cameras, catalog, fx, beatBlocks: { blocks: [] } });
  assert.equal(index.cameraCatalog, 'ok');
  const all = HMCatalogQuery.queryCamPresets(index, {});
  assert.equal(all.ok, true);
  assert.equal(all.code, 'ok');
  assert.ok(all.presets.length >= 25);
  for (const row of all.presets) {
    assert.equal(typeof row.id, 'string');
    assert.ok(row.id.trim());
    assert.equal(typeof row.label, 'string');
    assert.ok(row.label.trim());
    assert.equal(Object.keys(row).sort().join(','), 'id,label');
  }
  assert.equal(all.presets.find(row => row.id === 'static_hold').label, 'Hold frame');
  assert.equal(all.presets.find(row => row.id === 'eye_orbit').label, 'eye orbit');
  const orbit = HMCatalogQuery.queryCamPresets(index, { q: 'eye_orbit' });
  assert.ok(orbit.presets.some(row => row.id === 'eye_orbit' && row.label === 'eye orbit'));
  assert.ok(orbit.presets.every(row => row.id.includes('eye_orbit') || row.label.toLowerCase().includes('eye_orbit')));
  const grammar = HMCatalogQuery.queryCamPresets(index, { q: 'grammar' });
  assert.ok(grammar.templates.some(row => row.id === 'fight-cam-grammar-starter' && row.label === 'Fight cam grammar starter'));
  assert.ok(grammar.presets.every(row => row.id !== 'fight-cam-grammar-starter'));
  const clip = atom();
  const hit = index.hits.find(item => item.kind === 'cam' && item.id === 'eye_orbit');
  const applied = HMCatalogQuery.applyHit(clip, hit);
  assert.equal(applied.ok, true);
  assert.equal(clip.camera.preset, 'eye_orbit');
  assert.equal(clip.camera.angle, 'eye');
  assert.equal(clip.duration_s, 0.5);
  assert.deepEqual(clip.hero.plates, ['P01']);
  assert.equal(clip.motion.beat_class, 'straight');
  const tpl = index.hits.find(item => item.kind === 'template' && item.id === 'fight-cam-grammar-starter');
  const before = JSON.stringify(clip);
  const denied = HMCatalogQuery.applyHit(clip, tpl);
  assert.equal(denied.ok, false);
  assert.equal(denied.code, 'template-show');
  assert.match(denied.message, /does not change this beat/);
  assert.equal(JSON.stringify(clip), before);
  const deniedWithoutBeat = HMCatalogQuery.applyHit(null, tpl);
  assert.equal(deniedWithoutBeat.code, 'template-show');
  assert.match(deniedWithoutBeat.message, /does not change this beat/);
});

test('empty or missing camera catalog fails honestly and does not invent presets', () => {
  const missing = HMCatalogQuery.buildIndex({ fx, catalog: null, cameras: null });
  const missingQuery = HMCatalogQuery.queryCamPresets(missing, { q: 'static_hold' });
  assert.equal(missing.cameraCatalog, 'missing');
  assert.equal(missingQuery.ok, false);
  assert.equal(missingQuery.code, 'missing-catalog');
  assert.deepEqual(missingQuery.presets, []);
  assert.match(missingQuery.message, /Camera catalog is missing/);
  assert.equal(missing.hits.some(hit => hit.kind === 'cam'), false);
  assert.ok(missing.counts.fx >= 15);

  const empty = HMCatalogQuery.buildIndex({
    cameras: { presets: [] },
    catalog: {
      presets: [],
      templates: [{ id: 'fight-cam-grammar-starter', label: 'Fight cam grammar starter', seed_show: 'shows/fight-cam-grammar-starter.json' }]
    },
    fx
  });
  const emptyQuery = HMCatalogQuery.queryCamPresets(empty, { q: 'hold' });
  assert.equal(empty.cameraCatalog, 'empty');
  assert.equal(emptyQuery.ok, false);
  assert.equal(emptyQuery.code, 'empty-catalog');
  assert.deepEqual(emptyQuery.presets, []);
  assert.match(emptyQuery.message, /Camera catalog is empty/);
  assert.equal(empty.hits.some(hit => hit.kind === 'cam'), false);
  const named = HMCatalogQuery.queryCamPresets(empty, { q: 'grammar' });
  assert.deepEqual(named.presets, []);
  assert.deepEqual(named.templates, [{ id: 'fight-cam-grammar-starter', label: 'Fight cam grammar starter' }]);

  const bare = HMCatalogQuery.buildIndex({
    catalog: { camera_presets: ['low_rise', 'eye_orbit'], presets: [] }
  });
  const bareQuery = HMCatalogQuery.queryCamPresets(bare, { q: 'low_rise' });
  assert.equal(bare.cameraCatalog, 'empty');
  assert.equal(bareQuery.ok, false);
  assert.match(bareQuery.message, /no preset records/);
  assert.deepEqual(bareQuery.presets, []);

  const fallback = HMCatalogQuery.buildIndex({
    cameras: null,
    catalog: { presets: [{ id: 'eye_orbit', angle: 'eye', move: 'orbit' }] }
  });
  const fallbackQuery = HMCatalogQuery.queryCamPresets(fallback, { q: 'orbit' });
  assert.equal(fallback.cameraCatalog, 'ok');
  assert.deepEqual(fallbackQuery.presets, [{ id: 'eye_orbit', label: 'eye orbit' }]);
  const clip = atom();
  const applied = HMCatalogQuery.applyHit(clip, fallback.hits.find(hit => hit.kind === 'cam' && hit.id === 'eye_orbit'));
  assert.equal(applied.ok, true);
  assert.equal(clip.camera.preset, 'eye_orbit');
  assert.equal(clip.duration_s, 0.5);
  assert.deepEqual(clip.hero.plates, ['P01']);
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

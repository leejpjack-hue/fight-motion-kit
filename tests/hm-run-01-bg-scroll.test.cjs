'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

require('../public/ui/compose-client.js');
require('../public/ui/motion-renderer.js');

const C = HMComposeClient;
const read = rel => JSON.parse(fs.readFileSync(rel, 'utf8'));
const street = () => read('public/shows/street-old-city.json');
const compose = show => C.composeShow(show, {
  cameraPresets: read('public/presets/camera_presets.json'),
  fxPresets: read('public/presets/fx_presets.json'),
  loadJson: async rel => read('public/' + rel),
});

test('HM-RUN-01: bg_motion_packs keeps HM-PF-35 gold packs and ships run_presets', () => {
  const kitPacks = read('kit/presets/bg_motion_packs.json');
  const pubPacks = read('public/presets/bg_motion_packs.json');
  assert.deepEqual(kitPacks, pubPacks);
  assert.deepEqual(pubPacks.packs.map(p => p.id), ['hold', 'slow-pan', 'accent-pan']);
  assert.ok(Array.isArray(pubPacks.run_presets) && pubPacks.run_presets.length >= 4);
  for (const preset of pubPacks.run_presets) {
    assert.ok(C.isScrollBackgroundPreset(preset.motion.preset), preset.id);
    assert.ok(preset.motion.speed_px_s > 0);
  }
});

test('HM-RUN-01: compose validates scroll_* presets and rejects bad run params', async () => {
  const show = street();
  show.bg.motion = {
    preset: 'scroll_left',
    amount: 0.7,
    clock: 'show',
    speed_px_s: 840,
    tile_mode: 'mirror',
    stride_bob: { amp_px: 8, freq_hz: 3.2 },
    motion_blur: 0.4,
  };
  const ok = await compose(show);
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));

  const badSpeed = street();
  badSpeed.bg.motion = { preset: 'scroll_left', amount: 0.5, speed_px_s: 9000 };
  assert.equal((await compose(badSpeed)).ok, false);

  const badTile = street();
  badTile.bg.motion = { preset: 'scroll_right', amount: 0.5, tile_mode: 'stretch' };
  assert.equal((await compose(badTile)).ok, false);

  const badBob = street();
  badBob.bg.motion = { preset: 'scroll_up', amount: 0.5, stride_bob: { amp_px: -2, freq_hz: 2 } };
  assert.equal((await compose(badBob)).ok, false);

  const locShow = street();
  locShow.bg = {
    locations: [
      { id: 'loc-1', src: street().bg.base, t0: 0, t1: 2.5, motion: { preset: 'scroll_left', amount: 0.8, speed_px_s: 760, tile_mode: 'mirror' } },
      { id: 'loc-2', src: street().bg.base, t0: 2.5, t1: 5, motion: { preset: 'static', amount: 0 } },
    ],
  };
  assert.equal((await compose(locShow)).ok, true);
});

test('HM-RUN-01: backgroundScrollState is deterministic, wraps past crop bounds, and computes stride bob', () => {
  const m = {
    preset: 'scroll_left',
    amount: 0.6,
    clock: 'show',
    speed_px_s: 900,
    tile_mode: 'mirror',
    stride_bob: { amp_px: 10, freq_hz: 2 },
    motion_blur: 0.35,
  };
  const s1 = backgroundScrollState(m, 1.25, { duration: 5, atomT0: 0, atomT1: 0.5 }, 1280, 720);
  const s1Repeat = backgroundScrollState(m, 1.25, { duration: 5, atomT0: 0, atomT1: 0.5 }, 1280, 720);
  assert.deepEqual(s1, s1Repeat);
  assert.equal(s1.active, true);
  assert.equal(s1.tileMode, 'mirror');
  assert.equal(s1.speedPxS, 900);
  assert.equal(s1.offsetX, -1125);
  assert.equal(s1.offsetY, 0);

  const later = backgroundScrollState(m, 4.0, { duration: 5, atomT0: 3.5, atomT1: 4.5 }, 1280, 720);
  assert.equal(later.offsetX, -3600);
  assert.notEqual(s1.bobY, backgroundScrollState(m, 1.375, { duration: 5 }, 1280, 720).bobY);

  const spanScroll = backgroundScrollState({ preset: 'scroll_right', amount: 0.5, clock: 'span', span: [1, 3], speed_px_s: 500 }, 4.5, { duration: 5 }, 1280, 720);
  assert.equal(spanScroll.elapsedS, 2);
  assert.equal(spanScroll.offsetX, 1000);

  const frame = backgroundMotionFrame({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, 'scroll_left', 0.8, 0.5);
  assert.equal(frame.mode, 'scroll');
  assert.equal(backgroundMotionSupport().scroll_left.ok, true);
});

test('HM-RUN-01: exports bundles backgroundScrollState into standalone HTML script', () => {
  const exp = fs.readFileSync('public/ui/exports.js', 'utf8');
  assert.match(exp, /backgroundScrollState\.toString\(\)/);
  const ctx = vm.createContext({});
  vm.runInContext(backgroundScrollState.toString() + '\nbackgroundScrollState({preset:"scroll_down",amount:0.5,speed_px_s:400}, 2, {duration:5}, 1280, 720);', ctx);
  assert.equal(vm.runInContext('backgroundScrollState({preset:"scroll_down",amount:0.5,speed_px_s:400}, 2, {duration:5}, 1280, 720).offsetY', ctx), 800);
});

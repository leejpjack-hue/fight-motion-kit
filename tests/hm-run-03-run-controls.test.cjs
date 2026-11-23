'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

require('../public/ui/compose-client.js');
require('../public/ui/motion-sot.js');

const html = fs.readFileSync('public/ui/index.html', 'utf8');
const bgCtrl = fs.readFileSync('public/ui/background-controls.js', 'utf8');
const fgCtrl = fs.readFileSync('public/ui/foreground-controls.js', 'utf8');

test('HM-RUN-03: index.html and controls expose BG run presets, speed/tile/bob & FG pass-by UI', () => {
  for (const id of [
    'bgRunControls', 'bgRunPresetRow', 'bgRunParams', 'bgRunSpeed', 'bgRunSpeedValue',
    'bgRunTileMode', 'bgRunBobEnabled', 'bgRunBobAmp', 'bgRunBobFreq', 'bgRunBlur', 'bgRunBlurValue',
    'fgPassByBox', 'fgPassByEnabled', 'fgPassByFields', 'fgPassByDir', 'fgPassByMatchBg',
    'fgPassByMult', 'fgPassByMultValue', 'fgPassBySpeed', 'fgPassBySpacing', 'fgPassBySpacingValue',
    'fgPassByPhase', 'fgPassByBlur', 'fgPassByBlurValue',
  ]) {
    assert.ok(html.includes('id="' + id + '"'), 'missing #' + id);
  }
  for (const val of ['scroll_left', 'scroll_right', 'scroll_up', 'scroll_down']) {
    assert.ok(html.includes('value="' + val + '"'), 'missing option ' + val);
  }
  for (const preset of ['city_jog', 'full_sprint', 'rooftop_dash', 'vertical_drop']) {
    assert.ok(html.includes('data-bg-run-preset="' + preset + '"'), 'missing run preset ' + preset);
  }
  assert.match(bgCtrl, /applyMotionObj/);
  assert.match(bgCtrl, /bgRunSpeed/);
  assert.match(bgCtrl, /bgRunBobEnabled/);
  assert.match(fgCtrl, /function writePassBy/);
  assert.match(fgCtrl, /fgPassByEnabled/);
  assert.match(fgCtrl, /fgPassByMatchBg/);
});

test('HM-RUN-03: running BG motion and pass_by FG props round-trip through .motion.json serialization', () => {
  const show = JSON.parse(fs.readFileSync('public/shows/street-old-city.json', 'utf8'));
  show.bg.motion = {
    preset: 'scroll_left',
    amount: 0.85,
    clock: 'show',
    speed_px_s: 920,
    tile_mode: 'mirror',
    stride_bob: { amp_px: 10, freq_hz: 3.8 },
    motion_blur: 0.45,
  };
  show.fg = {
    cam: { preset: 'parallax', amount: 0.45, nudge: { x: 0, y: 0, s: 0 } },
    props: [{
      id: 'fg-runner-1',
      src: 'backgrounds/test.png',
      x: 900,
      y: 360,
      scale: 1,
      z: 10,
      t_start: 0.25,
      t_end: 4.75,
      pass_by: { enabled: true, direction: 'left', parallax_mult: 2.1, spacing_px: 1600, phase_offset_px: 80, motion_blur: 0.4 },
    }],
  };
  const project = { version: 1, show, layouts: {}, media: [], assets: {} };
  const raw = HMMotionSot.serialize(project);
  const restored = HMMotionSot.asPortableProject(JSON.parse(raw));
  assert.deepEqual(restored.show.bg.motion, show.bg.motion);
  assert.deepEqual(restored.show.fg.props[0].pass_by, show.fg.props[0].pass_by);
});

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

require('../public/ui/cut-transitions.js');
require('../public/ui/motion-renderer.js');
require('../public/ui/compose-client.js');
require('../public/ui/cam-action-picker.js');

const Fx = globalThis.HMMotionFx;

test('HM-CAM-11: fight-grade cameraEase curves satisfy boundary and dynamic overshoot invariants', () => {
  for (const kind of ['linear', 'smooth', 'sine', 'ease_in', 'ease_out', 'snap', 'spring', 'whip', 'punch_in', 'recoil_settle']) {
    assert.ok(Math.abs(cameraEase(kind, 0) - 0) < 1e-6, `${kind} starts at 0`);
    assert.ok(Math.abs(cameraEase(kind, 1) - 1) < 1e-6, `${kind} ends at 1`);
  }
  // spring & punch_in overshoot > 1.0 mid-move
  assert.ok(cameraEase('spring', 0.35) > 1.0, 'spring overshoots past 1');
  assert.ok(cameraEase('punch_in', 0.4) > 1.0, 'punch_in overshoots before settling');
  // recoil_settle anticipates below 0 then settles
  assert.ok(cameraEase('recoil_settle', 0.12) < 0.3, 'recoil_settle dips early');
  // whip accelerates steeply across center
  assert.ok(Math.abs(cameraEase('whip', 0.5) - 0.5) < 1e-6);
  assert.ok(cameraEase('whip', 0.25) < 0.05 && cameraEase('whip', 0.75) > 0.95);
});

test('HM-CAM-11: roll_scale_clamp, computeCameraVelocity, and deterministic motion-blur pass stay valid', async () => {
  const seg = {
    t0: 0,
    t1: 0.5,
    u0: 0,
    u1: 1,
    ease: 'whip',
    motion_blur: true,
    curves: {
      x: { type: 'lerp', a: -180, b: 180, ease: 'linear' },
      y: { type: 'const', v: 0 },
      s: { type: 'const', v: 1.0 },
      r: { type: 'lerp', a: -8, b: 8, ease: 'linear' },
    },
  };
  const pose = cameraPoseOnSegment(seg, 0.25);
  assert.ok(pose.s >= 1 + Math.abs(Math.sin(pose.r * Math.PI / 180)) * 0.9, 'roll_scale_clamp prevents empty borders');
  const vel = Fx.computeCameraVelocity(seg, 0.26);
  assert.ok(vel.speed > 18 && Math.abs(vel.vx) > 0.5, 'whip pan has significant horizontal velocity');

  // Velocity blur draws ghost echoes deterministically on high-speed whip frame
  const ops = [];
  const noop = () => {};
  const ctx = {
    globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '12px sans-serif', textAlign: 'left', textBaseline: 'alphabetic',
    save() { ops.push(['save']); }, restore() { ops.push(['restore']); },
    setTransform: noop, translate(x, y) { ops.push(['translate', x, y]); }, rotate: noop, scale: noop,
    fillRect: noop, strokeRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, closePath: noop, arc: noop, fill: noop, stroke: noop, fillText() { ops.push(['slateText']); }, strokeText: noop,
    drawImage: noop,
  };
  const renderer = HMMotion({ width: 1280, height: 720, getContext: () => ctx }, {});
  await renderer.load({
    timeline: {
      show_id: 'blur-test',
      duration_s: 0.5,
      plates: [{ id: 'S001', t0: 0, t1: 0.5 }],
      atoms: [{ id: 'beat-01', t0: 0, t1: 0.5, cam: [seg], fx_hooks: [] }],
      fx: {},
      overlays: [],
    },
    layout: { S001: { slate: 'action', atom: 'beat-01' } },
  });
  renderer.render(0.26, { viaSoT: true });
  const textDraws = ops.filter((o) => o[0] === 'slateText').length;
  assert.equal(textDraws, 3, '2 velocity motion-blur ghosts + 1 main scene pass rendered deterministically');
});

test('HM-CAM-12 & atom.schema.json: visual cards, SVG curve/frustum preview, schema compose round-trip & Daiyu parity', async () => {
  const picker = globalThis.HMCamActionPicker;
  assert.ok(picker.CAM_ACTION_CARDS.length >= 6);
  const schema = readJson('kit/schema/atom.schema.json');
  for (const e of ['spring', 'whip', 'punch_in', 'recoil_settle']) {
    assert.ok(schema.properties.camera.properties.ease.enum.includes(e), e);
    assert.ok(schema.properties.camera.properties.segments.items.properties.ease.enum.includes(e), e);
  }
  assert.ok(HMComposeClient.CAM_EASES.includes('spring'));

  const camPresets = readJson('public/presets/camera_presets.json');
  const fxPresets = readJson('public/presets/fx_presets.json');
  const presetIds = new Set(camPresets.presets.map((p) => p.id));

  for (const card of picker.CAM_ACTION_CARDS) {
    assert.ok(presetIds.has(card.preset), `card ${card.id} maps to valid catalog preset ${card.preset}`);
    const svg = picker.buildCamCardSvg(card);
    assert.match(svg, /<svg viewBox="0 0 88 48"/);
    assert.match(svg, /<polyline/);
  }

  const show = readJson('public/shows/daiyu-wang-five-seconds.json');
  const applied = picker.applyCamActionCard(show.atoms[0], 'whip_crash_pan');
  assert.equal(applied.preset, 'eye_orbit');
  assert.equal(applied.ease, 'whip');
  assert.equal(applied.motion_blur, true);
  assert.equal(picker.matchesCard(show.atoms[0], picker.CAM_ACTION_CARDS[1]), true);

  const composed = await HMComposeClient.composeShow(show, {
    cameraPresets: camPresets,
    fxPresets,
    loadJson: async (p) => readJson('public/' + p),
  });
  assert.equal(composed.ok, true, JSON.stringify(composed.errors));
  assert.equal(composed.timeline.atoms[0].cam[0].ease, 'whip');
  assert.equal(composed.timeline.atoms[0].cam[0].motion_blur, true);
});

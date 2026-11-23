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
require('../public/ui/fx-stack.js');
require('../public/ui/impact-studio.js');

const Fx = globalThis.HMMotionFx;

function spyCtx() {
  const ops = [];
  const noop = () => {};
  const ctx = {
    globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    save() { ops.push(['save']); }, restore() { ops.push(['restore']); },
    setTransform: noop,
    translate(x, y) { ops.push(['translate', x, y]); },
    rotate(r) { ops.push(['rotate', r]); },
    scale(x, y) { ops.push(['scale', x, y]); },
    fillRect: noop, strokeRect: noop,
    beginPath() { ops.push(['beginPath']); },
    moveTo(x, y) { ops.push(['moveTo', x, y]); },
    lineTo(x, y) { ops.push(['lineTo', x, y]); },
    quadraticCurveTo(cx, cy, x, y) { ops.push(['quad', cx, cy, x, y]); },
    closePath() { ops.push(['closePath']); },
    arc(x, y, r) { ops.push(['arc', x, y, r]); },
    fill() { ops.push(['fill', ctx.fillStyle, ctx.globalAlpha, ctx.globalCompositeOperation]); },
    stroke() { ops.push(['stroke', ctx.strokeStyle, ctx.lineWidth, ctx.globalCompositeOperation]); },
    fillText: noop, strokeText: noop, drawImage: noop,
    createRadialGradient() { return { addColorStop: noop }; },
  };
  return { ctx, ops };
}

test('HM-FX-01: HMFxStack appends, reorders, mutes, updates params, and preserves Wave 1 PixelFX transforms', async () => {
  const Stack = globalThis.HMFxStack;
  let hooks = ['hit_orange'];
  hooks = Stack.addLayer(hooks, 'speed_lines', { color: '#ff3fa4', opacity: 0.7 });
  assert.equal(hooks.length, 2, 'adding second FX preserves first hook');
  assert.equal(hooks[0].type, 'hit_orange');
  assert.equal(hooks[1].type, 'speed_lines');
  assert.equal(hooks[1].t_rel_end, 0.92);

  hooks = Stack.addLayer(hooks, 'impacts/hit-spark', { x: 140, y: -60, scale: 1.5, rotation: 30, opacity: 0.85, blend: 'screen' });
  assert.equal(hooks[2].source, 'pixelfx');

  hooks = Stack.reorderLayer(hooks, 2, -1);
  assert.equal(hooks[1].type, 'impacts/hit-spark');
  hooks = Stack.toggleMuteLayer(hooks, 0);
  assert.equal(hooks[0].muted, true);
  hooks = Stack.updateLayer(hooks, 1, { x: 200, color: '#00ffaa', blend: 'lighter', rotation: 45 });
  assert.equal(hooks[1].params.x, 200);
  assert.equal(hooks[1].params.blend, 'lighter');

  // composeShow skips muted layer and forwards PixelFX placement/blend params
  const show = readJson('public/shows/daiyu-wang-five-seconds.json');
  show.atoms[0].fx_hooks = hooks;
  const composed = await HMComposeClient.composeShow(show, {
    cameraPresets: readJson('public/presets/camera_presets.json'),
    fxPresets: readJson('public/presets/fx_presets.json'),
    loadJson: async (p) => readJson('public/' + p),
  });
  assert.equal(composed.ok, true, JSON.stringify(composed.errors));
  assert.equal(composed.timeline.fx.hits.length, 0, 'muted hit_orange omitted from active fx.hits');
  assert.equal(composed.timeline.fx.speed[0][5].color, '#ff3fa4');
  assert.equal(composed.timeline.fx.pixelfx[0][2].x, 200);
  assert.equal(composed.timeline.fx.pixelfx[0][2].rotation, 45);
  assert.equal(composed.timeline.fx.pixelfx[0][2].blend, 'lighter');

  // Verify PixelFX render() honors HMPixelFx.paint transform wrapper
  const prevPixel = globalThis.HMPixelFx;
  const paintCalls = [];
  globalThis.HMPixelFx = {
    has: (id) => id === 'impacts/hit-spark',
    meta: () => ({ duration: 0.6 }),
    paint: (id, local, ctx) => { paintCalls.push({ id, local, alpha: ctx.globalAlpha, blend: ctx.globalCompositeOperation }); return { drew: true }; },
  };
  try {
    const { ctx, ops } = spyCtx();
    const renderer = HMMotion({ width: 1280, height: 720, getContext: () => ctx }, {});
    await renderer.load({
      timeline: { show_id: 'px-place', duration_s: 0.5, plates: [{ id: 'S001', t0: 0, t1: 0.5 }], atoms: composed.timeline.atoms.slice(0, 1), fx: composed.timeline.fx, overlays: [] },
      layout: { S001: { slate: 'p1', atom: 'beat-01' } },
    });
    renderer.render(0.1, { fxStandIn: false, viaSoT: true });
    assert.equal(paintCalls.length, 1);
    assert.equal(paintCalls[0].blend, 'lighter');
    assert.ok(ops.some((o) => o[0] === 'translate' && o[1] === 840 && o[2] === 300), 'PixelFX translated by 640+x, 360+y');
    assert.ok(ops.some((o) => o[0] === 'rotate' && Math.abs(o[1] - 45 * Math.PI / 180) < 1e-6), 'PixelFX rotated cleanly');
  } finally {
    globalThis.HMPixelFx = prevPixel;
  }
});

test('HM-FX-02: procedural sakuga shapes (leg arc, fist shock-cone, layered tornado, core FX) paint tapered polygons deterministically', async () => {
  const poly = Fx.taperedArcPolygon([[0, 0], [50, -30], [120, -20], [200, 10]], 30);
  assert.equal(poly.length, 8);

  const { ctx, ops } = spyCtx();
  Fx.drawLegArc(ctx, [[800, 560], [1020, 340], [1160, 150]], 0.7, { color: '#77ffdd', opacity: 0.8, rotation: 15 });
  assert.ok(ops.some((o) => o[0] === 'fill' && o[1] === '#77ffdd'), 'drawLegArc uses tapered polygon fill with custom color');
  assert.ok(ops.some((o) => o[0] === 'stroke' && o[1] === '#0e1b2a'), 'drawLegArc adds crisp dark sakuga ink rim');

  ops.length = 0;
  Fx.drawFistPressure(ctx, 640, 320, 0.5, 1.2, { angle: 0.2, color: '#ff3366' });
  assert.ok(ops.some((o) => o[0] === 'quad'), 'drawFistPressure paints directional sonic vapor cone curves');
  assert.ok(ops.some((o) => o[0] === 'fill' && o[1] === '#ff3366'));

  ops.length = 0;
  Fx.drawTornado(ctx, 640, 420, 0.4, 1.0, { color: '#cceeff' });
  assert.ok(ops.filter((o) => o[0] === 'fill').length >= 14, 'drawTornado paints 4 tapered funnel bands + 10 angular debris shards');
});

test('HM-IMP-02 & Playable HTML export parity: Impact Studio target mapping, archetypes & FE-only checks pass', () => {
  const Studio = globalThis.HMImpactStudio;
  const pt = Studio.clientPointToStage(320, 90, { left: 0, top: 0, width: 640, height: 360 });
  assert.deepEqual(pt, { x: 640, y: 180, nx: 0.5, ny: 0.25 });

  const atom = { id: 'a1', fx_hooks: ['shake'] };
  const hk = Studio.applyImpactArchetype(atom, 'ko_finisher', { x: 520, y: 240 });
  assert.equal(hk.type, 'hit_pink');
  assert.equal(hk.params.x, 520);
  assert.equal(hk.params.y, 240);
  assert.equal(hk.params.frames, 4);
  assert.equal(atom.fx_hooks.length, 2, 'non-impact shake preserved alongside new impact archetype');

  Studio.updateImpactParams(atom, { angle: Studio.ANGLE_PRESETS.up_cut.angle, strength: 2.0, t_rel: 0.25 });
  assert.equal(atom.fx_hooks[0].params.angle, -1.15);
  assert.equal(atom.fx_hooks[0].params.strength, 2);
  assert.equal(atom.fx_hooks[0].t_rel, 0.25);

  // Confirm all Playable HTML serialized helpers evaluate cleanly together
  const expSrc = fs.readFileSync(path.join(ROOT, 'public/ui/exports.js'), 'utf8');
  for (const fn of ['normalizeFxLayerOpts', 'taperedArcPolygon', 'computeCameraVelocity', 'computeBgParallaxOffset', 'drawSceneAtmosphereMood']) {
    assert.ok(expSrc.includes(fn + '.toString()'), `exports.js includes ${fn}`);
  }

  // Confirm daiyu-wang-five-seconds.json untouched & FE modules have zero network/random leaks
  const statusOut = fs.readFileSync(path.join(ROOT, 'public/shows/daiyu-wang-five-seconds.json'), 'utf8');
  assert.ok(statusOut.includes('"show_id": "daiyu-wang-five-seconds"'));
  for (const file of ['public/ui/motion-renderer.js', 'public/ui/cut-transitions.js', 'public/ui/fx-stack.js', 'public/ui/impact-studio.js', 'public/ui/cam-action-picker.js', 'public/ui/scene-action-ui.js']) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.equal(/Math\.random\s*\(|api\.teqcon\.uk|:8770|XMLHttpRequest/.test(src), false, file);
  }
});

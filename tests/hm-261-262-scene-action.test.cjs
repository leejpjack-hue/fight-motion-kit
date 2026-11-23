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
require('../public/ui/scene-action-ui.js');

const Fx = globalThis.HMMotionFx;

function spyCtx() {
  const ops = [];
  const noop = () => {};
  const ctx = {
    canvas: { width: 1280, height: 720 },
    globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    save() { ops.push(['save']); }, restore() { ops.push(['restore']); },
    setTransform: noop, translate: noop, rotate: noop, scale: noop,
    rect(x, y, w, h) { ops.push(['rect', x, y, w, h]); },
    fillRect(x, y, w, h) { ops.push(['fillRect', ctx.fillStyle, x, y, w, h]); },
    strokeRect(x, y, w, h) { ops.push(['strokeRect', x, y, w, h]); },
    beginPath() { ops.push(['beginPath']); },
    moveTo(x, y) { ops.push(['moveTo', x, y]); },
    lineTo(x, y) { ops.push(['lineTo', x, y]); },
    closePath() { ops.push(['closePath']); },
    arc(x, y, r) { ops.push(['arc', x, y, r]); },
    fill(rule) { ops.push(['fill', ctx.fillStyle, rule || 'nonzero']); },
    stroke() { ops.push(['stroke', ctx.strokeStyle, ctx.lineWidth]); },
    createLinearGradient() { return { addColorStop: noop }; },
    createRadialGradient() { return { addColorStop: noop }; },
  };
  return { ctx, ops };
}

test('HM-SCN-01: gold cut_transitions.json invariant holds and extended cut styles resolve/compose deterministically', async () => {
  const pubCuts = readJson('public/presets/cut_transitions.json');
  const kitCuts = readJson('kit/presets/cut_transitions.json');
  assert.deepEqual(kitCuts, pubCuts);
  assert.deepEqual(pubCuts.presets.map((p) => p.id), ['freeze_hold', 'white_flash', 'whip_cut']);
  assert.deepEqual(pubCuts.extended_presets.map((p) => p.id), ['slash_wipe', 'impact_invert_cut', 'zoom_smash', 'iris_focus']);
  assert.deepEqual(HMComposeClient.CUT_TRANSITION_IDS, ['freeze_hold', 'white_flash', 'whip_cut']);

  // Verify drawWhipCut no longer emits 16 flat grey/black debug rectangles (#f4f7f8/#101820 bars)
  const { ctx, ops } = spyCtx();
  const whip = resolveCutTransition([{ t: 1.0, preset: 'whip_cut', dur_s: 0.1, dir: 1 }], 1.0);
  drawWhipCut(ctx, whip);
  assert.ok(ops.some((o) => o[0] === 'moveTo'), 'upgraded drawWhipCut draws tapered streak paths');
  assert.ok(!ops.some((o) => o[0] === 'fillRect' && o[4] === 72), 'upgraded drawWhipCut removes blocky debug bars');

  // Verify all 4 opt-in cut styles resolve boundaries and paint clean canvas shapes
  const show = readJson('public/shows/hm-hf-08-cuts.json');
  globalThis.HMSceneAction.applyExtendedCutStyle(show, 1, 'slash_wipe');
  globalThis.HMSceneAction.applyExtendedCutStyle(show, 2, 'impact_invert_cut');
  globalThis.HMSceneAction.applyExtendedCutStyle(show, 3, 'zoom_smash');
  const composed = await HMComposeClient.composeShow(show, {
    cameraPresets: readJson('public/presets/camera_presets.json'),
    fxPresets: readJson('public/presets/fx_presets.json'),
    cutPresets: pubCuts,
    loadJson: async (p) => readJson('public/' + p),
  });
  assert.equal(composed.ok, true, JSON.stringify(composed.errors));
  assert.deepEqual(composed.timeline.cuts.map((c) => c.preset), ['slash_wipe', 'impact_invert_cut', 'zoom_smash']);

  for (const style of ['slash_wipe', 'impact_invert_cut', 'zoom_smash', 'iris_focus']) {
    const cutList = [{ t: 1.0, preset: style, dur_s: 0.12, dir: 1 }];
    assert.equal(resolveCutTransition(cutList, 0.90), null);
    const heldA = resolveCutTransition(cutList, 1.0);
    const heldB = resolveCutTransition(cutList, 1.0);
    assert.deepEqual(heldA, heldB);
    assert.equal(heldA.preset, style);
    assert.equal(resolveCutTransition(cutList, 1.07), null);
    ops.length = 0;
    paintCutOverlay(ctx, heldA);
    assert.ok(ops.length > 0, `paintCutOverlay renders ops for ${style}`);
  }
});

test('HM-SCN-02: bg_motion_packs.json keeps gold packs intact, parallax keeps BG bounds safe, and mood/recipes compose cleanly', async () => {
  const pubBg = readJson('public/presets/bg_motion_packs.json');
  const kitBg = readJson('kit/presets/bg_motion_packs.json');
  assert.deepEqual(kitBg, pubBg);
  assert.deepEqual(pubBg.packs.map((p) => p.id), ['hold', 'slow-pan', 'accent-pan']);
  assert.ok(pubBg.scene_recipes.length >= 4 && pubBg.mood_presets.length >= 5);

  // Parallax bounds check: moving camera computes inverse parallax shift with safe overscan minScale >= 1
  const pxNone = Fx.computeBgParallaxOffset({ x: 80, y: -40, s: 1.2 }, 0);
  assert.deepEqual(pxNone, { dx: 0, dy: 0, minScale: 1 });
  const pxActive = Fx.computeBgParallaxOffset({ x: 100, y: -50, s: 1.2 }, 0.35);
  assert.equal(pxActive.dx, -35);
  assert.equal(pxActive.dy, 17.5);
  assert.ok(pxActive.minScale > 1.05, 'parallax scaling protects against black edge exposure');

  // Procedural atmosphere mood renders deterministically and is silent on neutral
  const { ctx, ops } = spyCtx();
  Fx.drawSceneAtmosphereMood(ctx, { id: 'neutral', intensity: 0.5 }, 1.2);
  assert.equal(ops.length, 0);
  Fx.drawSceneAtmosphereMood(ctx, { id: 'sunset_clash', intensity: 0.6, motes: true }, 1.2);
  const sunsetA = ops.slice();
  ops.length = 0;
  Fx.drawSceneAtmosphereMood(ctx, { id: 'sunset_clash', intensity: 0.6, motes: true }, 1.2);
  assert.deepEqual(ops, sunsetA, 'atmosphere mood layer is deterministic across renders');

  // Scene Action recipe configures parallax + bg motion + cam + mood + FX non-destructively
  const show = readJson('public/shows/daiyu-wang-five-seconds.json');
  const hookCountBefore = show.atoms[0].fx_hooks.length;
  const applied = globalThis.HMSceneAction.applySceneRecipe(show, 0, 'high_speed_chase');
  assert.equal(applied.recipe, 'high_speed_chase');
  assert.equal(show.bg.parallax_ratio, 0.38);
  assert.equal(show.mood.id, 'sunset_clash');
  assert.equal(show.atoms[0].camera.preset, 'eye_orbit');
  assert.equal(show.atoms[0].camera.ease, 'whip');
  assert.equal(show.atoms[0].fx_hooks.length, hookCountBefore + 1, 'appends speed_lines cue without erasing existing shake hook');

  const composed = await HMComposeClient.composeShow(show, {
    cameraPresets: readJson('public/presets/camera_presets.json'),
    fxPresets: readJson('public/presets/fx_presets.json'),
    loadJson: async (p) => readJson('public/' + p),
  });
  assert.equal(composed.ok, true, JSON.stringify(composed.errors));
  assert.equal(composed.timeline.bg.parallax_ratio, 0.38);
  assert.equal(composed.timeline.mood.id, 'sunset_clash');
});

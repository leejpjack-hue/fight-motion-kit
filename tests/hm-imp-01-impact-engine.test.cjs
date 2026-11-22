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

const Fx = globalThis.HMMotionFx;

function mockCanvasAndCtx(withImageData = true) {
  const ops = [];
  const pixels = new Uint8ClampedArray(16 * 9 * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 240; pixels[i + 1] = 235; pixels[i + 2] = 230; pixels[i + 3] = 255;
  }
  const noop = () => {};
  const ctx = {
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '12px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    save() { ops.push(['save']); },
    restore() { ops.push(['restore']); },
    setTransform(...a) { ops.push(['setTransform', ...a]); },
    transform(...a) { ops.push(['transform', ...a]); },
    translate(x, y) { ops.push(['translate', x, y]); },
    rotate(r) { ops.push(['rotate', r]); },
    scale(sx, sy) { ops.push(['scale', sx, sy]); },
    fillRect(x, y, w, h) { ops.push(['fillRect', ctx.fillStyle, x, y, w, h]); },
    strokeRect: noop,
    beginPath() { ops.push(['beginPath']); },
    moveTo(x, y) { ops.push(['moveTo', x, y]); },
    lineTo(x, y) { ops.push(['lineTo', x, y]); },
    closePath() { ops.push(['closePath']); },
    arc(x, y, r) { ops.push(['arc', x, y, r]); },
    ellipse: noop,
    fill() { ops.push(['fill', ctx.fillStyle, ctx.globalAlpha]); },
    stroke() { ops.push(['stroke', ctx.strokeStyle, ctx.lineWidth, ctx.globalAlpha]); },
    fillText: noop,
    strokeText: noop,
    measureText: () => ({ width: 80 }),
    createRadialGradient() { return { addColorStop: noop }; },
    drawImage: noop,
    ...(withImageData ? {
      getImageData: () => ({ data: new Uint8ClampedArray(pixels) }),
      putImageData: (img) => { ops.push(['putImageData', img.data[0], img.data[1], img.data[2]]); },
    } : {}),
  };
  const canvas = { width: withImageData ? 16 : 1280, height: withImageData ? 9 : 720, getContext: () => ctx };
  return { canvas, ctx, ops };
}

test('HM-IMP-01: impactBurstGeometry is deterministic, tapered, dual-shockwave, and target/angle aware', () => {
  const defA = Fx.impactBurstGeometry(0.25);
  const defB = Fx.impactBurstGeometry(0.25);
  assert.deepEqual(defA, defB);
  assert.equal(defA.cx, 640);
  assert.equal(defA.cy, 320);
  assert.equal(defA.rays.length, 20);
  assert.equal(defA.shards.length, 14);
  assert.ok(defA.ring1.radius > 0 && defA.ring2.radius > 0 && defA.ring1.radius > defA.ring2.radius);

  // Varying seeded spike lengths & tapered half-widths
  const lenSet = new Set(defA.rays.map((r) => Math.round(r.r1)));
  assert.ok(lenSet.size > 5, 'starburst spikes must have varied seeded lengths');

  // Custom coordinate & directional angle bias + strength scale
  const angled = Fx.impactBurstGeometry(0.35, { x: 410, y: 270, angle: 0, strength: 1.6 });
  assert.equal(angled.cx, 410);
  assert.equal(angled.cy, 270);
  assert.equal(angled.hasAngle, true);
  assert.ok(angled.ring1.radius > defA.ring1.radius);
  const onAxis = angled.rays.filter((r) => Math.abs(Math.cos(r.angle)) > 0.9);
  const offAxis = angled.rays.filter((r) => Math.abs(Math.cos(r.angle)) < 0.25);
  const maxOn = Math.max(...onAxis.map((r) => r.r1 - r.r0));
  const maxOff = Math.max(...offAxis.map((r) => r.r1 - r.r0));
  assert.ok(maxOn > maxOff, 'rays aligned to strike angle should extend farther than perpendicular rays');

  // Early u <= 0.08 has no ring2 yet; mid-impact launches ring2
  assert.equal(Fx.impactBurstGeometry(0.05).ring2.radius, 0);
});

test('HM-IMP-01: resolveHitstopAt & applyHitstopPixels handle default 2f, custom frames, invert/snapback, and stand-in', () => {
  const dur2f = 2 / 24;
  const src = { hits: [[1.0, '#ff8a1e', { frames: 3, tint: '#ff8a1e' }]], hitstop: [0.2] };

  // Legacy hitstop_2f at 0.2s active in [0.2, 0.2 + 2/24)
  const hsLegacy0 = Fx.resolveHitstopAt(src, 0.2, { standIn: false });
  assert.equal(hsLegacy0.active, true);
  assert.equal(hsLegacy0.freeze, true);
  assert.equal(hsLegacy0.holdT, 0.2);
  assert.ok(Math.abs(hsLegacy0.dur - dur2f) < 1e-6);

  // Just after 2 frames at 24fps, hitstop ends cleanly
  assert.equal(Fx.resolveHitstopAt(src, 0.2 + dur2f + 0.001, { standIn: false }), null);

  // Custom 3f hitstop freezes scene time at 1.0 throughout [1.0, 1.0 + 3/24)
  const hs3f = Fx.resolveHitstopAt(src, 1.0 + 0.09, { standIn: false });
  assert.equal(hs3f.active, true);
  assert.equal(hs3f.freeze, true);
  assert.equal(hs3f.holdT, 1.0);
  assert.ok(Math.abs(hs3f.dur - 3 / 24) < 1e-6);

  // hitstop: false / frames: 0 suppresses freeze cleanly
  assert.equal(Fx.resolveHitstopAt({ hits: [[0.5, '#ff8a1e', { frames: 0 }]] }, 0.51, { standIn: false }), null);
  assert.equal(Fx.resolveHitstopAt({ hits: [[0.5, '#ff8a1e', { hitstop: false }]] }, 0.51, { standIn: false }), null);

  // Stand-in preview inside atom before event time t < h
  const stand = Fx.resolveHitstopAt({ hitstop: [0.04] }, 0, { standIn: true, atomT0: 0, atomT1: 0.5 });
  assert.equal(stand.active, true);
  assert.equal(stand.freeze, false);
  assert.equal(stand.isStandIn, true);
  assert.equal(stand.u, 0.25);

  // applyHitstopPixels: bright pixel inverts dark at u=0.1 (frame 0) and snaps high-white at u=0.6 (snap-back)
  const f0 = new Uint8ClampedArray([240, 240, 240, 255, 20, 20, 20, 255]);
  Fx.applyHitstopPixels(f0, 0.1, { invert: true });
  assert.ok(f0[0] < 30 && f0[4] > 225, `frame 0 must invert high-contrast pixels, got ${f0[0]} / ${f0[4]}`);
  assert.equal(f0[3], 255);

  const f1 = new Uint8ClampedArray([240, 240, 240, 255, 20, 20, 20, 255]);
  Fx.applyHitstopPixels(f1, 0.6, { invert: true });
  assert.ok(f1[0] > 225 && f1[4] < 30, `frame 1 must snap back high-contrast without invert, got ${f1[0]} / ${f1[4]}`);
});

test('HM-IMP-01: computeCameraImpactShake produces directional kick, rotational micro-roll, and decays cleanly', () => {
  const hitHoriz = [[1.0, '#ff8a1e', { angle: 0, strength: 1.5, recoil: 20 }]];
  const hitVert = [[1.0, '#ff8a1e', { angle: Math.PI / 2, strength: 1.5, recoil: 20 }]];

  const shH = Fx.computeCameraImpactShake([], hitHoriz, 1.01);
  const shV = Fx.computeCameraImpactShake([], hitVert, 1.01);
  assert.ok(Math.abs(shH.dx) > Math.abs(shV.dx), 'horizontal angle kicks primarily along X');
  assert.ok(Math.abs(shV.dy) > Math.abs(shH.dy), 'vertical angle kicks primarily along Y');
  assert.notEqual(shH.dr, 0, 'impact produces rotational micro-roll');

  const shLate = Fx.computeCameraImpactShake([], hitHoriz, 1.24);
  assert.ok(shLate.amp < shH.amp, 'trauma shake decays over time');
  assert.deepEqual(Fx.computeCameraImpactShake([], hitHoriz, 1.40), { dx: 0, dy: 0, dr: 0, amp: 0 });
});

test('HM-IMP-01: live preview (standIn) and composed export produce parity for hit_orange, hitstop_2f, and custom targets', async () => {
  const fxPresets = readJson('public/presets/fx_presets.json');
  const camPresets = readJson('public/presets/camera_presets.json');
  const kitFx = readJson('kit/presets/fx_presets.json');
  assert.deepEqual(kitFx, fxPresets, 'public and kit fx_presets.json stay synchronized');

  const baseShow = readJson('public/shows/daiyu-wang-five-seconds.json');
  const show = {
    show_id: 'impact-parity-test',
    title: 'Impact Parity',
    duration_target_s: 1.0,
    floor_y: 684,
    chars: { L: { name: 'A' }, R: { name: 'B' } },
    bg: {},
    overlays: [],
    atoms: [
      Object.assign({}, baseShow.atoms[0], {
        id: 'beat-01',
        duration_s: 0.5,
        plates_needed: 1,
        fx_hooks: [
          { type: 'hit_orange', t_rel: 0.2, params: { x: 480, y: 260, angle: 0.4, strength: 1.4, frames: 3 } },
        ],
      }),
      Object.assign({}, baseShow.atoms[1], {
        id: 'beat-02',
        duration_s: 0.5,
        plates_needed: 1,
        fx_hooks: ['hit_pink', 'hitstop_2f'],
      }),
    ],
  };

  const composed = await HMComposeClient.composeShow(show, {
    cameraPresets: camPresets,
    fxPresets,
    loadJson: async (p) => readJson('public/' + p),
  });
  assert.equal(composed.ok, true, JSON.stringify(composed.errors));
  assert.equal(composed.timeline.fx.hits.length, 2);
  assert.equal(composed.timeline.fx.hits[0][2].x, 480);
  assert.equal(composed.timeline.fx.hits[0][2].y, 260);
  assert.equal(composed.timeline.fx.hitstop.length, 1);

  const liveCanvas = mockCanvasAndCtx(true);
  const expCanvas = mockCanvasAndCtx(true);
  const liveRenderer = HMMotion(liveCanvas.canvas, {});
  const expRenderer = HMMotion(expCanvas.canvas, {});
  const renderData = {
    timeline: composed.timeline,
    layout: {
      S001: { slate: 'plate-1', atom: 'beat-01' },
      S002: { slate: 'plate-2', atom: 'beat-02' },
    },
  };
  await liveRenderer.load(renderData);
  await expRenderer.load(renderData);

  // At t=0.15 (inside 3f hitstop window starting at h=0.10): both live & export freeze holdT=0.10 and invert pixels
  liveRenderer.render(0.15, {
    fxStandIn: true,
    liveHooks: show.atoms[0].fx_hooks,
    atomWindow: [0, 0.5],
    viaSoT: true,
    source: 'live-test',
  });
  expRenderer.render(0.15, { fxStandIn: false, viaSoT: true, source: 'export-test' });

  assert.equal(liveRenderer.lastHitstop.active, true);
  assert.equal(liveRenderer.lastHitstop.freeze, true);
  assert.equal(liveRenderer.lastHitstop.holdT, 0.1);
  assert.equal(expRenderer.lastHitstop.active, true);
  assert.equal(expRenderer.lastHitstop.freeze, true);
  assert.equal(expRenderer.lastHitstop.holdT, 0.1);

  const livePut = liveCanvas.ops.find((op) => op[0] === 'putImageData');
  const expPut = expCanvas.ops.find((op) => op[0] === 'putImageData');
  assert.ok(livePut && expPut, 'both live preview and export apply hitstop pixel pass');
  assert.deepEqual(livePut, expPut, 'hitstop pixel pass matches deterministically between live and export');

  // Verify starburst rendered at custom (480, 260) on both live and export
  assert.ok(liveCanvas.ops.some((op) => op[0] === 'arc' && op[1] === 480 && op[2] === 260));
  assert.ok(expCanvas.ops.some((op) => op[0] === 'arc' && op[1] === 480 && op[2] === 260));

  // Verify legacy string hook atom (beat-02 hit at t=0.54) falls back to (640, 320)
  expCanvas.ops.length = 0;
  expRenderer.render(0.55, { fxStandIn: false, viaSoT: true });
  assert.equal(expRenderer.lastHitstop.active, true);
  assert.equal(expRenderer.lastHitstop.holdT, 0.54);
  assert.ok(expCanvas.ops.some((op) => op[0] === 'arc' && op[1] === 640 && op[2] === 320));
});

test('HM-IMP-01: daiyu-wang-five-seconds.json, Playable HTML export bundle, and FE-only guard remain clean', async () => {
  const daiyu = readJson('public/shows/daiyu-wang-five-seconds.json');
  const baked = await HMComposeClient.composeShow(daiyu, {
    cameraPresets: readJson('public/presets/camera_presets.json'),
    fxPresets: readJson('public/presets/fx_presets.json'),
    loadJson: async (p) => readJson('public/' + p),
  });
  assert.equal(baked.ok, true);
  assert.equal(baked.duration_s, 5);
  assert.equal(baked.timeline.plates.length, 8);

  const exportsSrc = fs.readFileSync(path.join(ROOT, 'public/ui/exports.js'), 'utf8');
  for (const fn of ['normalizeImpactOpts', 'normalizeHitstopEntry', 'resolveHitstopAt', 'applyHitstopPixels', 'impactBurstGeometry', 'drawImpactBurst', 'computeCameraImpactShake']) {
    assert.ok(exportsSrc.includes(fn + '.toString()'), `Playable HTML bundle must serialize ${fn}`);
  }

  const mrSrc = fs.readFileSync(path.join(ROOT, 'public/ui/motion-renderer.js'), 'utf8');
  assert.equal(/Math\.random\s*\(|api\.teqcon\.uk|:8770|XMLHttpRequest/.test(mrSrc), false, 'renderer stays deterministic and FE-only');
});

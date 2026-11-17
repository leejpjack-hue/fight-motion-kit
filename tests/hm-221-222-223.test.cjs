'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

require('../public/ui/catalog-query.js');
require('../public/ui/compose-client.js');
require('../public/ui/motion-renderer.js');
require('../public/ui/motion-sot.js');
require('../public/ui/hf-09-12-14.js');

function memoryStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    keys() { return [...map.keys()]; },
  };
}

function demoShow() {
  return readJson('public/shows/daiyu-wang-five-seconds.json');
}

function demoProject(showOverride) {
  const show = showOverride || demoShow();
  const layoutPath = show.atoms[0].hero.layout_source;
  return {
    version: 1,
    show,
    layouts: { [layoutPath]: readJson('public/' + layoutPath) },
    media: [],
    assets: {},
  };
}

function recordingCtx() {
  const ops = [];
  const noop = () => {};
  const grad = { addColorStop: noop };
  const ctx = {
    canvas: { width: 1280, height: 720 },
    save: noop,
    restore: noop,
    translate: (...args) => ops.push(['translate', ...args]),
    scale: (...args) => ops.push(['scale', ...args]),
    rotate: noop,
    transform: (...args) => ops.push(['transform', ...args]),
    setTransform: noop,
    clearRect: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    clip: noop,
    closePath: noop,
    stroke: noop,
    fill: noop,
    drawImage: noop,
    createRadialGradient: () => grad,
    createLinearGradient: () => grad,
    fillRect: (...args) => ops.push(['fillRect', ctx.fillStyle, ...args]),
    strokeRect: (...args) => ops.push(['strokeRect', ctx.strokeStyle, ctx.lineWidth, ...args]),
    fillText: (...args) => ops.push(['fillText', ctx.fillStyle, ctx.font, ...args]),
    strokeText: (...args) => ops.push(['strokeText', ctx.strokeStyle, ctx.lineWidth, ctx.font, ...args]),
    measureText: (txt) => ({ width: String(txt || '').length * 24 }),
    getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: noop,
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    lineJoin: 'miter',
    lineCap: 'butt',
  };
  return { ctx, ops };
}

test('Issue #221 (HM-HF-09): 5 FE caption styles index, compose, persist cleanly, and STREET stays silent by default', async () => {
  const styles = HMCatalogQuery.CAPTION_STYLES;
  assert.equal(styles.length, 5);
  assert.deepEqual(styles.map(s => s.id), ['slam', 'glitch_edge', 'clean_bar', 'impact_hit', 'street_mark']);

  const cameraPresets = readJson('public/presets/camera_presets.json');
  const fxPresets = readJson('public/presets/fx_presets.json');
  const index = HMCatalogQuery.buildIndex({ cameras: cameraPresets, fx: fxPresets, captionStyles: styles });
  assert.equal(index.counts.caption_style, 5);
  assert.equal(index.sources.caption_stubs, false);
  for (const id of ['slam', 'glitch_edge', 'clean_bar', 'impact_hit', 'street_mark']) {
    const spec = HMComposeClient.resolveCaptionStyle(id);
    assert.ok(spec && spec.fill && spec.fontWeight >= 700, id);
  }

  // Schema includes all 5 caption_style enum ids
  const schema = readJson('kit/schema/atom.schema.json');
  assert.deepEqual(schema.properties.caption_style.enum, ['slam', 'glitch_edge', 'clean_bar', 'impact_hit', 'street_mark', '']);

  // STREET remains silent by default (no captions or caption_style authored on street-old-city.json)
  const street = readJson('public/shows/street-old-city.json');
  assert.equal(street.atoms.every(a => !a.caption && !a.caption_style), true);
  const streetBaked = await HMComposeClient.composeShow(street, {
    cameraPresets,
    fxPresets,
    loadJson: async rel => readJson('public/' + rel),
  });
  assert.equal(streetBaked.ok, true);
  assert.equal((streetBaked.timeline.overlays || []).filter(o => o.kind === 'text').length, 0);

  // Caption style persists via HMMotionSot serialize/open + draft save/read and composes onto overlays
  const project = demoProject();
  project.show.atoms[0].caption = 'CRACK!';
  project.show.atoms[0].caption_style = 'slam';
  project.show.atoms[1].caption = 'SPLIT';
  project.show.atoms[1].caption_style = 'glitch_edge';
  project.show.atoms[2].caption = 'GUARD';
  project.show.atoms[2].caption_style = 'clean_bar';

  const serialized = HMMotionSot.serialize(project);
  const reopened = HMMotionSot.asPortableProject(JSON.parse(serialized));
  assert.equal(reopened.show.atoms[0].caption_style, 'slam');
  assert.equal(reopened.show.atoms[1].caption_style, 'glitch_edge');
  assert.equal(reopened.show.atoms[2].caption_style, 'clean_bar');

  const storage = memoryStorage();
  HMMotionSot.writeDraft(storage, project, 0.2);
  const restored = HMMotionSot.applyDraftShow(demoProject(), HMMotionSot.readDraft(storage, project.show.show_id));
  assert.equal(restored.show.atoms[0].caption_style, 'slam');

  const baked = await HMComposeClient.composeShow(reopened.show, {
    cameraPresets,
    fxPresets,
    loadJson: async rel => readJson('public/' + rel),
  });
  assert.equal(baked.ok, true);
  assert.equal(baked.timeline.atoms[0].caption_style, 'slam');
  const ovSlam = baked.timeline.overlays.find(o => o.id === 'caption-' + project.show.atoms[0].id);
  const ovGlitch = baked.timeline.overlays.find(o => o.id === 'caption-' + project.show.atoms[1].id);
  const ovClean = baked.timeline.overlays.find(o => o.id === 'caption-' + project.show.atoms[2].id);
  assert.equal(ovSlam.caption_style, 'slam');
  assert.equal(ovSlam.style.skewX, -0.18);
  assert.equal(ovGlitch.style.glitchCyan, '#29f2ff');
  assert.equal(ovClean.style.accentBar, '#ccf17b');

  // Canvas 2D renderer paints style-specific box/skew/chromatic calls
  const { ctx, ops } = recordingCtx();
  const mockCanvas = { width: 1280, height: 720, getContext: () => ctx };
  const renderer = HMMotion(mockCanvas, {});
  const minimalTimeline = {
    show_id: 'cap-test',
    duration_s: baked.duration_s,
    plates: [{ id: 'S001', t0: 0, t1: baked.duration_s }],
    atoms: baked.timeline.atoms,
    fx: {},
    overlays: [ovSlam, ovGlitch, ovClean],
  };
  await renderer.load({ timeline: minimalTimeline, layout: { S001: { slate: 'test', atom: baked.timeline.atoms[0].id } } });

  renderer.render(ovSlam.t_start + 0.05, { viaSoT: true, source: 'test-slam' });
  assert.ok(ops.some(op => op[0] === 'transform' && op[3] === -0.18), 'slam skew transform drawn');
  assert.ok(ops.some(op => op[0] === 'fillRect' && op[1] === 'rgba(20, 17, 14, 0.88)'), 'slam backdrop rect drawn');

  ops.length = 0;
  renderer.render(ovGlitch.t_start + 0.05, { viaSoT: true, source: 'test-glitch' });
  assert.ok(ops.some(op => op[0] === 'fillText' && op[1] === '#29f2ff'), 'glitch_edge cyan pass drawn');
  assert.ok(ops.some(op => op[0] === 'fillText' && op[1] === '#ff3ca6'), 'glitch_edge magenta pass drawn');

  ops.length = 0;
  renderer.render(ovClean.t_start + 0.05, { viaSoT: true, source: 'test-clean' });
  assert.ok(ops.some(op => op[0] === 'fillRect' && op[1] === '#ccf17b'), 'clean_bar lime accent bar drawn');
});

test('Issue #222 (HM-HF-12): camera micro-moves live in presets JSON, compose additively, and match prior presets when unset', async () => {
  const pubCams = readJson('public/presets/camera_presets.json');
  const kitCams = readJson('kit/presets/camera_presets.json');
  assert.ok(Array.isArray(pubCams.micro_moves) && pubCams.micro_moves.length >= 3);
  assert.deepEqual(kitCams.micro_moves, pubCams.micro_moves);
  assert.deepEqual(pubCams.micro_moves.map(m => m.id), ['shake_burst', 'punch_in', 'scan_gate']);

  const schema = readJson('kit/schema/atom.schema.json');
  assert.deepEqual(schema.properties.camera.properties.micro_move.enum, ['shake_burst', 'punch_in', 'scan_gate', '']);

  const fxPresets = readJson('public/presets/fx_presets.json');
  const baseShow = demoShow();
  const baseComposed = await HMComposeClient.composeShow(baseShow, {
    cameraPresets: pubCams,
    fxPresets,
    loadJson: async rel => readJson('public/' + rel),
  });
  assert.equal(baseComposed.ok, true);

  // Additive contract: atom without micro_move keeps identical seg curves and evaluated poses
  const addShow = demoShow();
  addShow.atoms[0].camera = Object.assign({}, baseShow.atoms[0].camera, { micro_move: 'shake_burst' });
  addShow.atoms[1].camera = { preset: 'static_hold', micro_move: 'punch_in' };
  addShow.atoms[2].camera = { preset: 'static_hold', micro_move: 'scan_gate' };

  const addComposed = await HMComposeClient.composeShow(addShow, {
    cameraPresets: pubCams,
    fxPresets,
    loadJson: async rel => readJson('public/' + rel),
  });
  assert.equal(addComposed.ok, true);
  assert.equal(addComposed.timeline.atoms[0].cam[0].micro_move, 'shake_burst');
  assert.equal(addComposed.timeline.atoms[1].cam[0].micro_move, 'punch_in');
  assert.equal(addComposed.timeline.atoms[2].cam[0].micro_move, 'scan_gate');
  // Unchanged atom 3 matches prior compose pose identically
  const basePose3 = cameraPoseOnSegment(baseComposed.timeline.atoms[3].cam[0], baseComposed.timeline.atoms[3].t0 + 0.12);
  const addPose3 = cameraPoseOnSegment(addComposed.timeline.atoms[3].cam[0], addComposed.timeline.atoms[3].t0 + 0.12);
  assert.deepEqual(addPose3, basePose3);

  // Compare compose-client poseOnSegment and motion-renderer cameraPoseOnSegment across all 3 micro-moves
  for (let i = 0; i < 3; i++) {
    const seg = addComposed.timeline.atoms[i].cam[0];
    const tMid = (seg.t0 + seg.t1) / 2;
    const tEarly = seg.t0 + (seg.t1 - seg.t0) * 0.15;
    const clientPose = HMComposeClient.poseOnSegment(seg, i === 0 ? tEarly : tMid);
    const renderPose = cameraPoseOnSegment(seg, i === 0 ? tEarly : tMid);
    assert.deepEqual(renderPose, clientPose, 'pose mismatch on micro_move ' + seg.micro_move);
  }

  // shake_burst modifies inside u_range [0, 0.55] and is zero delta at u=0.9
  const burstSeg = addComposed.timeline.atoms[0].cam[0];
  const baseSeg0 = baseComposed.timeline.atoms[0].cam[0];
  const tBurstOn = burstSeg.t0 + (burstSeg.t1 - burstSeg.t0) * 0.12;
  const tBurstOff = burstSeg.t0 + (burstSeg.t1 - burstSeg.t0) * 0.90;
  assert.notEqual(cameraPoseOnSegment(burstSeg, tBurstOn).x, cameraPoseOnSegment(baseSeg0, tBurstOn).x);
  assert.deepEqual(cameraPoseOnSegment(burstSeg, tBurstOff), cameraPoseOnSegment(baseSeg0, tBurstOff));

  // punch_in raises scale cleanly vs static_hold
  const punchSeg = addComposed.timeline.atoms[1].cam[0];
  const punchEnd = cameraPoseOnSegment(punchSeg, punchSeg.t1 - 1e-4);
  assert.ok(punchEnd.s > 1.15, 'punch_in scales up from static_hold (got ' + punchEnd.s + ')');
  assert.ok(punchEnd.y < -10, 'punch_in vertical lock delta');

  // Unknown micro_move fails closed when !allowSoftLint
  const badShow = demoShow();
  badShow.atoms[0].camera = { preset: 'static_hold', micro_move: 'nonexistent_micro' };
  const badComposed = await HMComposeClient.composeShow(badShow, {
    cameraPresets: pubCams,
    fxPresets,
    loadJson: async rel => readJson('public/' + rel),
  });
  assert.equal(badComposed.ok, false);
  assert.ok(badComposed.errors.some(e => e.includes('nonexistent_micro')));
});

test('Issue #223 (HM-HF-14): multi-edit batch receipts persist in localStorage, stay bounded, and undo restores exact prior show slice', () => {
  const storage = memoryStorage();
  const baseShow = demoShow();
  const modified = JSON.parse(JSON.stringify(baseShow));
  modified.duration_target_s = 8;
  modified.atoms[0].caption = 'OPEN!';
  modified.atoms[0].caption_style = 'slam';
  modified.atoms[1].camera = { preset: 'whip_right', micro_move: 'shake_burst' };
  modified.atoms[2].duration_s = 1.2;

  const receipt = HMHistoryReceipts.recordBatch({
    beforeShow: baseShow,
    afterShow: modified,
    source: 'hm-cam-grammar-scene',
    label: 'Batch camera + caption update',
    storage,
  });

  assert.equal(receipt.contract, 'HM-HF-14-HISTORY-RECEIPTS');
  assert.equal(receipt.show_id, baseShow.show_id);
  assert.equal(receipt.atomCount, 3);
  assert.equal(receipt.changedAtoms.length, 3);
  assert.ok(receipt.changedAtoms[0].fields.includes('caption_style'));
  assert.ok(receipt.changedAtoms[1].fields.includes('camera'));
  assert.ok(receipt.changedAtoms[2].fields.includes('duration_s'));

  const stored = HMHistoryReceipts.listReceipts(baseShow.show_id, storage);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].id, receipt.id);

  // One restoreSlice call restores exact prior atoms & metadata
  const restored = HMHistoryReceipts.restoreSlice(modified, receipt);
  assert.deepEqual(restored.atoms, baseShow.atoms);
  assert.equal(restored.duration_target_s, baseShow.duration_target_s);

  const marked = HMHistoryReceipts.markRestored(receipt.id, storage);
  assert.equal(marked.restored, true);
  assert.equal(HMHistoryReceipts.listReceipts(baseShow.show_id, storage)[0].restored, true);

  // Bounded list check: > MAX_RECEIPTS keeps newest MAX_RECEIPTS items only
  HMHistoryReceipts.clearReceipts(baseShow.show_id, storage);
  for (let i = 0; i < HMHistoryReceipts.MAX_RECEIPTS + 5; i++) {
    const next = JSON.parse(JSON.stringify(baseShow));
    next.atoms[0].label = 'pass-' + i;
    HMHistoryReceipts.recordBatch({
      beforeShow: baseShow,
      afterShow: next,
      label: 'Pass ' + i,
      storage,
    });
  }
  const bounded = HMHistoryReceipts.listReceipts(baseShow.show_id, storage);
  assert.equal(bounded.length, HMHistoryReceipts.MAX_RECEIPTS);
  assert.equal(bounded[0].label, 'Pass ' + (HMHistoryReceipts.MAX_RECEIPTS + 4));

  // Verify FE-only constraint on hf-09-12-14.js
  const src = fs.readFileSync(path.join(ROOT, 'public/ui/hf-09-12-14.js'), 'utf8');
  assert.equal(/\bfetch\s*\(|XMLHttpRequest|WebSocket|api\.teqcon\.uk|:8770|wrangler/.test(src), false);
});

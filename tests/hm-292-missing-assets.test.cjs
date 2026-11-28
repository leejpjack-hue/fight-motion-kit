'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'public/ui/motion-renderer.js'));
require(path.join(ROOT, 'public/ui/compose-client.js'));
const HMComposeClient = globalThis.HMComposeClient;
const HMUxHelpers = require(path.join(ROOT, 'public/ui/ux-helpers.js'));
const HMHtmlImport = require(path.join(ROOT, 'public/ui/html-import.js'));

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=';

function readText(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function readJson(rel) {
  return JSON.parse(readText(rel));
}

function makeMockCanvas() {
  const ops = [];
  const noop = () => {};
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    lineJoin: 'miter',
    save: noop,
    restore: noop,
    setTransform: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    transform: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    arc: noop,
    ellipse: noop,
    fill: noop,
    stroke: noop,
    strokeRect: noop,
    clearRect: noop,
    fillRect(x, y, w, h) { ops.push(['fillRect', this.fillStyle, x, y, w, h]); },
    fillText(txt) { ops.push(['fillText', String(txt)]); },
    strokeText: noop,
    drawImage(im) { ops.push(['drawImage', im && im.src ? im.src : 'img']); },
  };
  return {
    width: 1280,
    height: 720,
    getContext() { return ctx; },
    ops,
  };
}

test('#292 missingAssetsForActiveClip & auditProjectMissingAssets detect unresolved, broken, and empty plates', () => {
  const project = {
    version: 1,
    show: {
      show_id: 'missing-audit-probe',
      title: 'Missing Audit Probe',
      atoms: [
        { id: 'c1', label: 'Valid Beat', duration_s: 0.5, plates_needed: 1, hero: { layout_source: 'imported-html-layout.json', plates: ['P01'] } },
        { id: 'c2', label: 'Missing Path Beat', duration_s: 0.5, plates_needed: 1, hero: { layout_source: 'imported-html-layout.json', plates: ['P02'] } },
        { id: 'c3', label: 'Broken Decode Beat', duration_s: 0.5, plates_needed: 1, hero: { layout_source: 'imported-html-layout.json', plates: ['P03'] } },
        { id: 'c4', label: 'Empty Plate Beat', duration_s: 0.5, plates_needed: 1, hero: { layout_source: 'imported-html-layout.json', plates: [] } },
        { id: 'c5', label: 'Empty Entry Beat', duration_s: 0.5, plates_needed: 1, hero: { layout_source: 'imported-html-layout.json', plates: ['P05'] } },
      ],
    },
    layouts: {
      'imported-html-layout.json': {
        P01: { full: 'plates/P01.png' },
        P02: { full: 'plates/P02.png' },
        P03: { full: 'plates/P03.png' },
        P05: {},
      },
    },
    assets: {
      'plates/P01.png': TINY_PNG,
      'plates/P03.png': TINY_PNG,
    },
  };

  const failedAssets = ['plates/P03.png'];

  const a1 = HMUxHelpers.missingAssetsForActiveClip(project, 0.25, { failedAssets });
  assert.equal(a1.hasMissing, false);
  assert.deepEqual(a1.missingRefs, []);

  const a2 = HMUxHelpers.missingAssetsForActiveClip(project, 0.75, { failedAssets });
  assert.equal(a2.hasMissing, true);
  assert.deepEqual(a2.missingRefs, ['plates/P02.png']);

  const a3 = HMUxHelpers.missingAssetsForActiveClip(project, 1.25, { failedAssets });
  assert.equal(a3.hasMissing, true);
  assert.deepEqual(a3.brokenRefs, ['plates/P03.png']);
  assert.deepEqual(a3.missingRefs, ['plates/P03.png']);

  const a4 = HMUxHelpers.missingAssetsForActiveClip(project, 1.75, { failedAssets });
  assert.equal(a4.hasMissing, true);
  assert.equal(a4.emptyPlates.length, 1);
  assert.match(a4.missingRefs[0], /no plate assigned/);

  const a5 = HMUxHelpers.missingAssetsForActiveClip(project, 2.25, { failedAssets });
  assert.equal(a5.hasMissing, true);
  assert.match(a5.missingRefs[0], /plate P05 \(empty\)/);

  const audit = HMUxHelpers.auditProjectMissingAssets(project, { failedAssets });
  assert.equal(audit.hasMissing, true);
  assert.equal(audit.missingClips.length, 4);
  assert.ok(audit.missingRefs.includes('plates/P02.png'));
  assert.ok(audit.missingRefs.includes('plates/P03.png'));
});

test('#292 renderer loads valid plates alongside broken/missing plates and never invents stand-in art during export', async () => {
  const prevImage = globalThis.Image;
  const prevLocation = globalThis.location;
  globalThis.location = { origin: 'http://127.0.0.1:8765' };
  globalThis.Image = class FakeImage {
    constructor() {
      this.src = '';
      this.width = 64;
      this.height = 64;
      this.complete = true;
      this.naturalWidth = 64;
    }
    decode() {
      if (this.src.includes('P02_broken') || this.src.includes('corrupt')) {
        return Promise.reject(new Error('decode failed'));
      }
      return Promise.resolve();
    }
  };

  try {
    const cameraPresets = readJson('public/presets/camera_presets.json');
    const fxPresets = readJson('public/presets/fx_presets.json');
    const cutPresets = readJson('public/presets/cut_transitions.json');

    const layouts = {
      'imported-html-layout.json': {
        P01: { full: 'plates/P01_ok.png', kind: 'duo' },
        P02: { full: 'plates/P02_broken.png', kind: 'duo' },
      },
    };
    const show = {
      show_id: 'partial-honest-film',
      title: 'Partial Honest Film',
      atoms: [
        { id: 'b1', label: 'Valid Hit', kind: 'duo', duration_s: 0.5, plates_needed: 1, pose_mode: 'hero', hero: { layout_source: 'imported-html-layout.json', plates: ['P01'] }, camera: { preset: 'static_hold' }, fx_hooks: [] },
        { id: 'b2', label: 'Broken Plate', kind: 'duo', duration_s: 0.5, plates_needed: 1, pose_mode: 'hero', hero: { layout_source: 'imported-html-layout.json', plates: ['P02'] }, camera: { preset: 'static_hold' }, fx_hooks: [] },
        { id: 'b3', label: 'Missing Plate', kind: 'duo', duration_s: 0.5, plates_needed: 1, pose_mode: 'hero', hero: { layout_source: 'imported-html-layout.json', plates: ['P99_ABSENT'] }, camera: { preset: 'static_hold' }, fx_hooks: [] },
      ],
      bg: {},
      overlays: [],
    };

    const composed = await HMComposeClient.composeShow(show, {
      allowSoftLint: true,
      cameraPresets,
      fxPresets,
      cutPresets,
      layouts,
      loadJson: async rel => layouts[rel],
    });
    assert.equal(composed.ok, true);

    const canvas = makeMockCanvas();
    const renderer = globalThis.HMMotion(canvas, { 'plates/P01_ok.png': TINY_PNG });

    // Strict mode still fails closed if explicitly requested
    await assert.rejects(() => renderer.load(composed, { strict: true }), /Image could not load/);

    // Default mode loads valid plates, tracks failed assets, and never adds fake images
    await renderer.load(composed);
    assert.equal(renderer.images.has('plates/P01_ok.png'), true);
    assert.equal(renderer.images.has('plates/P02_broken.png'), false);
    assert.deepEqual(renderer.missingAssets, ['plates/P02_broken.png']);

    // Frame 1 (valid plate): draws real image, lastMissingAsset is null
    canvas.ops.length = 0;
    renderer.render(0.25, { viaSoT: true, source: 'bake-export-frames' });
    assert.equal(renderer.lastMissingAsset, null);
    assert.equal(canvas.ops.filter(o => o[0] === 'drawImage').length, 1);

    // Frame 2 (broken plate): draws ZERO images and ZERO invented stand-in art, reports broken-image
    canvas.ops.length = 0;
    renderer.render(0.75, { viaSoT: true, source: 'bake-export-frames' });
    assert.equal(renderer.lastMissingAsset.missing, true);
    assert.equal(renderer.lastMissingAsset.reason, 'broken-image');
    assert.deepEqual(renderer.lastMissingAsset.refs, ['plates/P02_broken.png']);
    assert.equal(canvas.ops.filter(o => o[0] === 'drawImage').length, 0);
    assert.equal(canvas.ops.filter(o => o[0] === 'fillText').length, 0);

    // Frame 3 (missing layout plate with MISSING PLATE slate): export bake omits placeholder slate and draws ZERO stand-in art
    canvas.ops.length = 0;
    renderer.render(1.25, { viaSoT: true, source: 'bake-record-video' });
    assert.equal(renderer.lastMissingAsset.missing, true);
    assert.equal(renderer.lastMissingAsset.reason, 'empty-plate');
    assert.equal(canvas.ops.filter(o => o[0] === 'drawImage').length, 0);
    assert.equal(canvas.ops.filter(o => o[0] === 'fillText').length, 0);
    assert.equal(canvas.ops.some(o => o[0] === 'fillRect' && o[1] === '#1c2b30'), false);
  } finally {
    globalThis.Image = prevImage;
    globalThis.location = prevLocation;
  }
});

test('#292 HTML round-trip, UI surfaces, exports honesty, and 5.00s eight-plate demo invariance', () => {
  // HTML import with 1 present plate + 1 missing plate preserves only present assets (0 stand-in art)
  const partialProject = {
    version: 1,
    show: {
      show_id: 'partial-roundtrip',
      title: 'Partial Roundtrip',
      atoms: [
        { id: 'a1', label: 'Present', kind: 'duo', duration_s: 0.5, plates_needed: 1, pose_mode: 'hero', hero: { layout_source: 'imported-html-layout.json', plates: ['P01'] }, camera: { preset: 'static_hold' }, fx_hooks: [] },
        { id: 'a2', label: 'Gap', kind: 'duo', duration_s: 0.5, plates_needed: 1, pose_mode: 'hero', hero: { layout_source: 'imported-html-layout.json', plates: ['P02'] }, camera: { preset: 'static_hold' }, fx_hooks: [] },
      ],
      bg: {},
      overlays: [],
    },
    layouts: {
      'imported-html-layout.json': {
        P01: { full: 'plates/P01.png' },
        P02: { full: 'plates/P02.png' },
      },
    },
    media: [
      { id: 'm1', name: 'P01', src: 'plates/P01.png', layoutSource: 'imported-html-layout.json', plateId: 'P01' },
      { id: 'm2', name: 'P02', src: 'plates/P02.png', layoutSource: 'imported-html-layout.json', plateId: 'P02' },
    ],
    assets: { 'plates/P01.png': TINY_PNG },
  };
  const html = '<!doctype html><html><body>' + HMHtmlImport.embedProjectScript(partialProject) + '</body></html>';
  const reopened = HMHtmlImport.parseMotionHtml(html, { fileName: 'partial-roundtrip.html' });
  assert.equal(reopened.project.assets['plates/P01.png'], TINY_PNG);
  assert.equal(Object.prototype.hasOwnProperty.call(reopened.project.assets, 'plates/P02.png'), false);

  const appSrc = readText('public/ui/app.js');
  const exportsSrc = readText('public/ui/exports.js');
  const cssSrc = readText('public/ui/styles.css');
  assert.match(appSrc, /no stand-in art generated/i);
  assert.match(appSrc, /clip-missing-badge/);
  assert.match(appSrc, /dataset\.missingAsset='true'/);
  assert.match(exportsSrc, /function missingAssetsNote/);
  assert.match(exportsSrc, /allowMissing/);
  assert.match(exportsSrc, /left empty \(no stand-in art\)/);
  assert.match(cssSrc, /\.clip-missing-badge/);
  assert.equal(/\/api\/compose|api\.teqcon\.uk|:8770|wrangler deploy/i.test(appSrc + exportsSrc), false);

  // 5.00s eight-plate demo untouched
  const demo = readJson('public/shows/daiyu-wang-five-seconds.json');
  assert.equal(demo.show_id, 'daiyu-wang-five-seconds');
  assert.equal(demo.atoms.length, 8);
  assert.equal(demo.atoms.reduce((sum, a) => sum + a.duration_s, 0), 5);
});

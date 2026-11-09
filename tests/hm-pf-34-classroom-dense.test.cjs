'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
require('../public/ui/compose-client.js');
const C = HMComposeClient;
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const show = () => read('public/shows/fight-daiyu-baochai-classroom-dense.json');
const catalog = read('public/presets/camera_presets.json');
const KNOWN = [
  'assets/daiyu-baochai-classroom/bg/bg_classroom.jpg',
  'assets/daiyu-baochai-classroom/bg/bg_classroom_side_low.jpg',
  'assets/daiyu-baochai-classroom/bg/bg_classroom_mid_mess.jpg',
  'assets/daiyu-baochai-classroom/bg/bg_classroom_mess.jpg',
  'assets/daiyu-baochai-nightarcade/plates/IB01.png',
  'assets/daiyu-baochai-nightarcade/plates/IB02.png',
  'assets/daiyu-baochai-nightarcade/plates/IB03.png',
  'assets/daiyu-baochai-nightarcade/plates/IB04.png',
];

test('HM-PF-34 (#111): classroom dense golden show composes FE-only and lists missing pack bitmaps', async () => {
  const golden = show();
  assert.equal(golden.show_id, 'fight-daiyu-baochai-classroom-dense');
  assert.equal(golden.venue, 'classroom');
  assert.equal(golden.bg.motion.preset, 'pan_right');
  assert.equal(golden.bg.motion.amount, 0.7);
  assert.equal(golden.bg.motion.clock, 'show');
  assert.deepEqual(golden.bg.crops.base, { x: 0.15, y: 0.05, w: 0.7, h: 0.9 });
  assert.deepEqual(golden.bg.crops.swap, golden.bg.crops.base);
  assert.equal(golden.atoms.length, 60);
  assert.equal(golden.fg, undefined);
  assert.equal(golden.meta.fg_proof.copied, false);
  assert.equal(golden.meta.fg_proof.id, 'CLASS-DENSE-FG');
  const srcs = [...new Set(golden.atoms.map(a => a.background.src))];
  assert.deepEqual(srcs, KNOWN.slice(0, 4));
  assert.ok(golden.atoms.every(a => a.background.motion.preset === 'pan_right' && a.background.crop.w === 0.7));
  for (const rel of KNOWN) assert.equal(fs.existsSync('public/' + rel), false, rel);
  assert.deepEqual(golden.meta.missing_assets.known_paths_absent_from_kit, KNOWN);
  assert.equal(golden.meta.missing_assets.unknown_plate_files.length, 56);
  const doc = fs.readFileSync('docs/product-flow/HM-PF-34-classroom-dense-golden-show.md', 'utf8');
  assert.match(doc, /pan_right/);
  assert.match(doc, /0\.70/);
  assert.match(doc, /0\.15/);
  assert.match(doc, /bg_classroom_mid_mess\.jpg/);
  assert.match(doc, /P01/);
  const ui = fs.readFileSync('public/ui/index.html', 'utf8');
  const app = fs.readFileSync('public/ui/app.js', 'utf8');
  assert.match(ui, /Gold · Classroom dense \(21\.825s\)/);
  assert.match(ui, /id="loadClassroomDense"/);
  assert.match(app, /fight-daiyu-baochai-classroom-dense-2026-10-24/);
  for (const catPath of ['public/catalog.json', 'kit/catalog.json', 'src/catalog.json']) {
    const cat = read(catPath);
    assert.ok(cat.templates.some(row => row.id === 'fight-daiyu-baochai-classroom-dense' && row.seed_show === 'shows/fight-daiyu-baochai-classroom-dense.json'));
  }
  assert.equal(fs.readFileSync('public/shows/fight-daiyu-baochai-classroom-dense.json', 'utf8'), fs.readFileSync('kit/shows/fight-daiyu-baochai-classroom-dense.json', 'utf8'));
  const composed = await C.composeShow(golden, {
    allowSoftLint: true,
    cameraPresets: catalog,
    fxPresets: read('public/presets/fx_presets.json'),
    loadJson: async file => read('public/' + file),
  });
  assert.equal(composed.ok, true);
  assert.equal(composed.duration_s, 21.825);
  assert.equal(composed.timeline.bg.motion.preset, 'pan_right');
  assert.equal(fs.readFileSync('public/shows/daiyu-wang-five-seconds.json', 'utf8').includes('"show_id": "daiyu-wang-five-seconds"'), true);
});

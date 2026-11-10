const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

require('../public/ui/compose-client.js');
require('../public/ui/motion-renderer.js');
require('../public/ui/motion-sot.js');

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const show = () => read('public/shows/class-dense-fg-cam.json');
const compose = input => HMComposeClient.composeShow(input, {
  cameraPresets: read('public/presets/camera_presets.json'),
  fxPresets: read('public/presets/fx_presets.json'),
  loadJson: async file => read('public/' + file),
});

function memoryStorage() {
  const store = new Map();
  return {
    setItem(key, value) { store.set(key, String(value)); },
    getItem(key) { return store.has(key) ? store.get(key) : null; },
  };
}

test('HM-PF-38: CLASS-DENSE-FG proof show keeps FG cam off the BG crop and the character cam', async () => {
  const proof = show();
  const street = read('public/shows/street-old-city.json');
  const gold = read('public/shows/daiyu-wang-five-seconds.json');
  const dense = read('public/shows/fight-daiyu-baochai-classroom-dense.json');
  assert.equal(proof.show_id, 'class-dense-fg-cam');
  assert.equal(proof.meta.fg_proof.id, 'CLASS-DENSE-FG');
  assert.equal(proof.meta.reuse, 'HM-COMPOSE-FG');
  assert.equal(proof.fg.cam.preset, 'parallax');
  assert.equal(proof.fg.cam.amount, 0.45);
  assert.deepEqual(proof.fg.cam.nudge, {x: 0, y: 0, s: 0});
  assert.equal(proof.bg.motion.preset, 'pan_right');
  assert.equal(proof.bg.motion.amount, 0.7);
  assert.equal(proof.bg.motion.clock, 'show');
  assert.deepEqual(proof.bg.crops.base, {x: 0.15, y: 0.05, w: 0.7, h: 0.9});
  assert.equal(proof.atoms.length, 8);
  assert.deepEqual(proof.atoms.map(atom => atom.camera), street.atoms.map(atom => atom.camera));
  assert.ok(proof.atoms.every(atom => atom.camera.preset === 'static_hold'));
  assert.ok(proof.atoms.every(atom => atom.background.motion.preset === 'pan_right' && atom.background.motion.amount === 0.7));
  assert.equal(JSON.stringify(proof).includes('voice'), false);
  assert.equal(JSON.stringify(proof).includes('"sfx"'), false);
  assert.equal(JSON.stringify(proof).includes('#41'), false);
  assert.equal(gold.show_id, 'daiyu-wang-five-seconds');
  assert.equal(gold.fg, undefined);
  assert.equal(gold.duration_target_s, 5);
  assert.equal(dense.fg, undefined);
  assert.equal(dense.meta.fg_proof.copied, false);
  assert.equal(dense.meta.fg_proof.id, 'CLASS-DENSE-FG');
  assert.equal(fs.existsSync('public/' + proof.bg.base), true);
  assert.equal(fs.existsSync('public/' + proof.fg.props[0].src), true);

  const out = await compose(proof);
  assert.equal(out.ok, true, JSON.stringify(out.errors));
  assert.equal(out.duration_s, 5);
  assert.equal(out.timeline.fg.cam.preset, 'parallax');
  assert.equal(out.timeline.fg.cam.amount, 0.45);
  assert.equal(out.timeline.bg.motion.preset, 'pan_right');
  assert.equal(out.timeline.atoms[0].cam[0].preset, 'static_hold');

  const start = layerCamMatrix(out.timeline, 0, out.layout);
  const mid = layerCamMatrix(out.timeline, 2.5, out.layout);
  const end = layerCamMatrix(out.timeline, 4.99, out.layout);
  for (const row of [start, mid, end]) {
    assert.equal(layerCamsIndependent(row), true, JSON.stringify(row));
    assert.match(layerCamMatrixText(row), /independent/);
    assert.equal(row.fg.preset, 'parallax');
    assert.equal(row.bg.preset, 'pan_right');
    assert.equal(row.character.preset, 'static_hold');
    assert.equal(row.bg.mode, 'window');
  }
  assert.ok(start.fg.x > 50, 'fg parallax starts apart from the character pose');
  assert.ok(end.fg.x < -50, 'fg parallax travels on its own clock');
  assert.ok(end.bg.x > start.bg.x, 'background crop pans the other way');
  assert.ok(Math.abs(start.character.x) < 20);
  assert.ok(Math.abs(end.character.x) < 20);
  assert.notEqual(start.fg.x, start.character.x);
  assert.notEqual(Math.sign(end.fg.x - start.fg.x), Math.sign(end.bg.x - start.bg.x));

  const fgTuned = structuredClone(proof);
  fgTuned.fg.cam.amount = 1;
  const fgOut = await compose(fgTuned);
  const fgStart = layerCamMatrix(fgOut.timeline, 0, fgOut.layout);
  assert.notEqual(fgStart.fg.x, start.fg.x);
  assert.equal(fgStart.bg.x, start.bg.x);
  assert.equal(fgStart.character.x, start.character.x);
  assert.equal(fgStart.character.s, start.character.s);

  const bgTuned = structuredClone(proof);
  bgTuned.bg.motion.amount = 0.2;
  bgTuned.atoms.forEach(atom => { atom.background.motion.amount = 0.2; });
  const bgOut = await compose(bgTuned);
  const bgMid = layerCamMatrix(bgOut.timeline, 2.5, bgOut.layout);
  assert.notEqual(bgMid.bg.x, mid.bg.x);
  assert.equal(bgMid.fg.x, mid.fg.x);
  assert.equal(bgMid.character.x, mid.character.x);

  const camTuned = structuredClone(proof);
  camTuned.atoms[0].camera = {preset: 'eye_orbit'};
  const camOut = await compose(camTuned);
  const camStart = layerCamMatrix(camOut.timeline, 0, camOut.layout);
  assert.equal(camStart.character.preset, 'eye_orbit');
  assert.notEqual(camStart.character.x, start.character.x);
  assert.equal(camStart.fg.x, start.fg.x);
  assert.equal(camStart.bg.x, start.bg.x);
});

test('HM-PF-38: save and reopen keep the three cameras apart', async () => {
  const proof = show();
  const project = {version: 1, show: proof, layouts: {}, media: []};
  const opened = HMMotionSot.asPortableProject(JSON.parse(HMMotionSot.serialize(project)));
  assert.deepEqual(opened.show.fg.cam, proof.fg.cam);
  assert.deepEqual(opened.show.bg.motion, proof.bg.motion);
  assert.deepEqual(opened.show.bg.crops, proof.bg.crops);
  assert.deepEqual(opened.show.atoms.map(atom => atom.camera), proof.atoms.map(atom => atom.camera));
  assert.deepEqual(opened.show.atoms.map(atom => atom.background.motion), proof.atoms.map(atom => atom.background.motion));
  const storage = memoryStorage();
  HMMotionSot.writeDraft(storage, project, 2.5);
  const draft = HMMotionSot.readDraft(storage, proof.show_id);
  const restored = HMMotionSot.applyDraftShow({version: 1, show: {show_id: proof.show_id, atoms: []}}, draft);
  assert.equal(restored.show.fg.cam.preset, 'parallax');
  assert.equal(restored.show.fg.cam.amount, 0.45);
  assert.equal(restored.show.bg.motion.preset, 'pan_right');
  assert.equal(restored.show.atoms[0].camera.preset, 'static_hold');
  const out = await compose(restored.show);
  assert.equal(out.ok, true, JSON.stringify(out.errors));
  assert.equal(layerCamsIndependent(layerCamMatrix(out.timeline, 2.5, out.layout)), true);
});

test('HM-PF-38: HTML and webm export keep the same independent camera sample', async () => {
  const proof = show();
  const out = await compose(proof);
  const ui = fs.readFileSync('public/ui/index.html', 'utf8');
  const app = fs.readFileSync('public/ui/app.js', 'utf8');
  const exp = fs.readFileSync('public/ui/exports.js', 'utf8');
  const player = HMMotion.toString();
  assert.match(ui, /id="fgLayerMatrix"/);
  assert.match(ui, /id="loadFgCamProof"/);
  assert.match(app, /class-dense-fg-cam/);
  assert.match(app, /paintFgLayerMatrix/);
  assert.match(exp, /id="layers"/);
  assert.match(exp, /layerCamMatrix\.toString\(\)/);
  assert.match(exp, /layerCamsIndependent\.toString\(\)/);
  assert.match(exp, /layerCamMatrixText\.toString\(\)/);
  assert.match(exp, /on\('exportVideo'/);
  assert.match(exp, /HMMotion\(canvas/);
  assert.match(exp, /sampleStageFrameAt/);
  assert.match(player, /lastLayerMatrix = layerCamMatrix\(timeline, t, layout\)/);
  assert.ok(player.indexOf('ctx.restore();\n    drawForeground(t);') > player.indexOf('cameraPoseOnSegment(seg, t)'));

  const script = [
    backgroundMotionFrame,
    backgroundMotionProgress,
    fgCameraFrame,
    cameraEase,
    cameraChannel,
    cameraPoseOnSegment,
    backgroundLocationsBundle,
    layerCamMatrix,
    layerCamsIndependent,
    layerCamMatrixText,
  ].map(fn => fn.toString()).join('\n') + '\nbackgroundLocationsBundle();\n';
  const context = vm.createContext({});
  vm.runInContext(script, context);
  const encoded = 'layerCamMatrix(' + JSON.stringify(out.timeline) + ', 2.5, ' + JSON.stringify(out.layout) + ')';
  const exported = vm.runInContext(encoded, context);
  const live = layerCamMatrix(out.timeline, 2.5, out.layout);
  assert.equal(JSON.stringify(exported), JSON.stringify(live));
  assert.equal(vm.runInContext('layerCamsIndependent(' + JSON.stringify(exported) + ')', context), true);
  assert.match(vm.runInContext('layerCamMatrixText(' + JSON.stringify(exported) + ')', context), /FG parallax 0\.45/);
  assert.match(vm.runInContext('layerCamMatrixText(' + JSON.stringify(exported) + ')', context), /BG pan_right 0\.7/);
  assert.match(vm.runInContext('layerCamMatrixText(' + JSON.stringify(exported) + ')', context), /Character static_hold/);
});

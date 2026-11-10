'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('../public/ui/compose-client.js');
require('../public/ui/motion-renderer.js');
const { applyBackgroundMotionPack } = require('../skills/hm-bg-scene-author/scripts/author.cjs');

const C = HMComposeClient;
const repo = path.join(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(repo, rel), 'utf8'));
const packs = read('public/presets/bg_motion_packs.json');
const street = () => read('public/shows/street-old-city.json');
const demoPath = path.join(repo, 'public/shows/daiyu-wang-five-seconds.json');
const script = path.join(repo, 'skills/hm-bg-scene-author/scripts/author.cjs');
const crop = { x: 0.15, y: 0.15, w: 0.7, h: 0.7 };
const HOLD = { preset: 'static', amount: 0 };
const SLOW = { preset: 'pan_right', amount: 0.25, clock: 'show' };
const ACCENT = { preset: 'pan_left', amount: 0.7, clock: 'per_atom' };

const compose = show => C.composeShow(show, {
  cameraPresets: read('public/presets/camera_presets.json'),
  fxPresets: read('public/presets/fx_presets.json'),
  loadJson: async rel => read('public/' + rel),
});

function cameras(show) {
  return show.atoms.map(atom => atom.camera);
}

function spans(show) {
  let t = 0;
  return show.atoms.map(atom => {
    const span = [t, round(t + atom.duration_s)];
    t = span[1];
    return span;
  });
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

function frameAt(composed, t) {
  const plates = composed.timeline.plates;
  const plate = plates.find(row => t >= row.t0 && t < row.t1) || plates[plates.length - 1];
  const entry = composed.layout[plate.id];
  const view = backgroundAt(entry, composed.timeline.bg, t);
  const atom = composed.timeline.atoms.find(row => t >= row.t0 && t < row.t1) || composed.timeline.atoms.at(-1);
  const motion = view.motion || {};
  const u = backgroundMotionProgress(motion, t, {
    duration: composed.timeline.duration_s,
    atomT0: atom.t0,
    atomT1: atom.t1,
  });
  return {
    plateId: plate.id,
    motion,
    u,
    frame: backgroundMotionFrame(view.crop, motion.preset || 'follow_camera', motion.amount == null ? 0.4 : motion.amount, u),
  };
}

function rhythmShow() {
  const show = street();
  show.bg.crops = { base: crop };
  show.bg.motion = { preset: 'pan_up', amount: 1, clock: 'show' };
  show.atoms[0].timing_hold = { pack: 'dialogue_film_slow', kind: 'hold', soft_cam: true };
  show.atoms[1].timing_hold = { pack: 'micro_cut_flurry', kind: 'micro_cut', soft_cam: false, preset: 'ecu_jitter' };
  show.atoms[1].background = { src: 'backgrounds/keep.png', key_white: true };
  show.atoms[2].timing_hold = { pack: 'micro_cut_flurry', kind: 'impact_hold', soft_cam: false, preset: 'static_hold' };
  show.atoms[5].timing_hold = { pack: 'dialogue_film_slow', kind: 'hold', soft_cam: false };
  return show;
}

test('shipped background packs align hold, slow-pan, and accent-pan to rhythm', () => {
  assert.deepEqual(read('kit/presets/bg_motion_packs.json'), packs);
  assert.deepEqual(packs.packs.map(row => row.id), ['hold', 'slow-pan', 'accent-pan']);
  assert.deepEqual(packs.packs.map(row => row.aligns), ['micro_cut', 'hold', 'impact_hold']);
  assert.deepEqual(packs.packs.map(row => row.motion), [HOLD, SLOW, ACCENT]);
  const table = C.bgMotionPackTable(packs);
  assert.equal(table.byRhythm.micro_cut, 'hold');
  assert.equal(table.byRhythm.hold, 'slow-pan');
  assert.equal(table.byRhythm.impact_hold, 'accent-pan');
});

test('a named pack writes window-pan fields and leaves character cameras', () => {
  const source = street();
  source.bg.crops = { base: crop };
  const held = C.applyBgMotionPack(source, 'hold', { packs });
  assert.deepEqual(held.bg.motion, HOLD);
  assert.deepEqual(held.atoms, source.atoms);
  assert.deepEqual(cameras(held), cameras(source));
  const clip = C.applyBgMotionPack(source, 'slow-pan', { packs, scope: 'clip', indices: [3] });
  assert.equal(clip.bg.motion, undefined);
  assert.deepEqual(clip.atoms[3].background.motion, SLOW);
  assert.equal(clip.atoms[0].background, undefined);
  assert.deepEqual(cameras(clip), cameras(source));
  const again = C.applyBgMotionPack(clip, 'slow-pan', { packs, scope: 'clip', indices: [3] });
  assert.deepEqual(again.atoms[3].background, clip.atoms[3].background);
});

test('rhythm alignment holds micro-cuts, pans dialogue on the show clock, and accents impacts', async () => {
  const source = rhythmShow();
  const beforeCameras = cameras(source);
  const before = await compose(source);
  assert.equal(before.ok, true);
  const stamped = C.applyBgMotionPack(source, 'rhythm', { packs });
  assert.deepEqual(stamped.bg.motion, source.bg.motion);
  assert.deepEqual(stamped.atoms[0].background.motion, SLOW);
  assert.deepEqual(stamped.atoms[1].background, { src: 'backgrounds/keep.png', key_white: true, motion: HOLD });
  assert.deepEqual(stamped.atoms[2].background.motion, ACCENT);
  assert.equal(stamped.atoms[3].background, undefined);
  assert.deepEqual(stamped.atoms[5].background.motion, SLOW);
  assert.deepEqual(stamped.atoms.map(atom => atom.timing_hold), source.atoms.map(atom => atom.timing_hold));
  assert.deepEqual(stamped.atoms.map(atom => atom.duration_s), source.atoms.map(atom => atom.duration_s));
  assert.deepEqual(cameras(stamped), beforeCameras);
  assert.notEqual(stamped.atoms[0].camera.preset, 'slow_push');
  const after = await compose(stamped);
  assert.equal(after.ok, true);
  assert.deepEqual(after.timeline.cam_keys, before.timeline.cam_keys);
  const times = spans(stamped);
  const microA = frameAt(after, times[1][0] + 0.04);
  const microB = frameAt(after, times[1][1] - 0.04);
  assert.deepEqual(microA.motion, HOLD);
  assert.deepEqual(microA.frame.crop, microB.frame.crop);
  assert.equal(microA.frame.mode, 'hold');
  const slowA = frameAt(after, times[0][0] + 0.04);
  const slowB = frameAt(after, times[0][1] - 0.04);
  const slowLater = frameAt(after, times[5][0] + 0.04);
  assert.deepEqual(slowA.motion, SLOW);
  assert.ok(slowB.u > slowA.u);
  assert.ok(slowB.frame.crop.x > slowA.frame.crop.x);
  assert.ok(slowLater.u > slowB.u);
  const accentA = frameAt(after, times[2][0] + 0.04);
  const accentB = frameAt(after, times[2][1] - 0.04);
  assert.deepEqual(accentA.motion, ACCENT);
  assert.ok(accentA.u < 0.25);
  assert.ok(accentB.u > 0.75);
  assert.ok(accentB.frame.crop.x < accentA.frame.crop.x);
  assert.equal(after.layout[accentA.plateId].background.motion.preset, 'pan_left');
  assert.deepEqual(frameAt(after, times[2][0] + 0.04), accentA);
  assert.deepEqual(cameras(source), beforeCameras);
});

test('one selected clip can match rhythm without moving the other cameras', () => {
  const source = rhythmShow();
  const stamped = C.applyBgMotionPack(source, 'rhythm', { packs, indices: [2] });
  assert.deepEqual(stamped.atoms[2].background.motion, ACCENT);
  assert.equal(stamped.atoms[0].background, undefined);
  assert.deepEqual(stamped.atoms[1].background, source.atoms[1].background);
  assert.deepEqual(cameras(stamped), cameras(source));
  assert.throws(() => C.applyBgMotionPack(street(), 'rhythm', { packs }), /dialogue hold or micro-cut/);
  assert.throws(() => C.applyBgMotionPack(street(), 'orbit', { packs }), /Unknown background motion pack/);
  const riding = JSON.parse(JSON.stringify(packs));
  riding.packs[1].motion = { preset: 'follow_camera', amount: 0.4 };
  assert.throws(() => C.applyBgMotionPack(street(), 'slow-pan', { packs: riding }), /character camera/);
});

test('a location pack writes that window only', async () => {
  const source = street();
  const dur = spans(source).at(-1)[1];
  source.bg = {
    key_white: false,
    locations: [
      { id: 'loc-1', src: source.bg.base, t0: 0, t1: 2, crop },
      { id: 'loc-2', src: source.bg.base, t0: 2, t1: dur },
    ],
  };
  const stamped = C.applyBgMotionPack(source, 'accent-pan', { packs, scope: 'location', locationId: 'loc-1' });
  assert.deepEqual(stamped.bg.locations[0].motion, ACCENT);
  assert.equal(stamped.bg.locations[1].motion, undefined);
  assert.throws(() => C.applyBgMotionPack(source, 'hold', { packs }), /Background panel/);
  assert.deepEqual(cameras(stamped), cameras(source));
  const after = await compose(stamped);
  assert.equal(after.ok, true);
  const times = spans(stamped);
  const early = frameAt(after, times[0][0] + 0.04);
  const late = frameAt(after, times[0][1] - 0.04);
  assert.deepEqual(early.motion, ACCENT);
  assert.ok(late.frame.crop.x < early.frame.crop.x);
  const inherited = frameAt(after, 2.05);
  assert.equal(inherited.motion.preset || 'follow_camera', 'follow_camera');
});

test('CLI --pack writes .motion.json once and leaves the five-second demo', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-pf-35-'));
  const projectFile = path.join(dir, 'street.json');
  const out = path.join(dir, 'street.motion.json');
  const source = rhythmShow();
  const demoBefore = fs.readFileSync(demoPath);
  fs.writeFileSync(projectFile, JSON.stringify(source));
  const ok = spawnSync(process.execPath, [script, '--project', projectFile, '--pack', 'rhythm', '--out', out], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  const writtenText = fs.readFileSync(out, 'utf8');
  const written = JSON.parse(writtenText);
  assert.deepEqual(written.show.atoms[0].background.motion, SLOW);
  assert.deepEqual(written.show.atoms[1].background.motion, HOLD);
  assert.deepEqual(written.show.atoms[2].background.motion, ACCENT);
  assert.deepEqual(written.show.atoms.map(atom => atom.camera), source.atoms.map(atom => atom.camera));
  assert.deepEqual(JSON.parse(fs.readFileSync(projectFile, 'utf8')), source);
  const again = spawnSync(process.execPath, [script, '--project', projectFile, '--pack', 'rhythm', '--out', out], { encoding: 'utf8' });
  assert.notEqual(again.status, 0);
  assert.equal(fs.readFileSync(out, 'utf8'), writtenText);
  const mixed = spawnSync(process.execPath, [script, '--project', projectFile, '--pack', 'hold', '--preset', 'pan_right', '--out', path.join(dir, 'mixed.motion.json')], { encoding: 'utf8' });
  assert.notEqual(mixed.status, 0);
  assert.match(mixed.stderr, /Drop --preset/);
  const named = path.join(dir, 'hold.motion.json');
  const hold = spawnSync(process.execPath, [script, '--project', projectFile, '--pack', 'hold', '--out', named], { encoding: 'utf8' });
  assert.equal(hold.status, 0, hold.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(named, 'utf8')).show.bg.motion, HOLD);
  const bare = applyBackgroundMotionPack(street(), 'slow-pan', packs);
  assert.equal(bare.version, 1);
  assert.deepEqual(bare.show.bg.motion, SLOW);
  assert.deepEqual(bare.show.atoms.map(atom => atom.camera), street().atoms.map(atom => atom.camera));
  assert.deepEqual(fs.readFileSync(demoPath), demoBefore);
});

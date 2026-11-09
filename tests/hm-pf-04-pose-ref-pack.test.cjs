'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('../public/ui/compose-client.js');
require('../public/ui/costume-lock.js');
require('../public/ui/pose-ref-pack.js');
require('../public/ui/motion-sot.js');

const ROOT = path.resolve(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const EXPECTED = [
  ['P01', 'k10_01_jab', 'eye_push', 0.4],
  ['P02', 'k10_02_body_punch', 'eye_lateral', 0.6],
  ['P03', 'k10_03_fold_recover', 'ots_R_hold', 0.3],
  ['P04', 'k10_04_hook_load', 'box_side_pan', 0.5],
  ['P05', 'k10_05_body_hook_impact', 'ecu_fist_lens', 0.65],
  ['P06', 'k10_06_hook_aftershock', 'dutch_snap', 0.28],
  ['P07', 'k10_07_back_hook_kick', 'upward_inside', 0.68],
  ['P08', 'k10_08_back_hook_connect', 'ecu_jitter', 0.72],
  ['P09', 'k10_09_push_kick', 'eye_orbit', 0.4],
  ['P10', 'k10_10_slide_reset', 'whip_A_to_B', 0.28],
  ['P11', 'k10_11_jump_back_kick_air', 'low_rise', 0.68],
  ['P12', 'k10_12_jump_back_land', 'ecu_fist_lens', 0.72],
  ['P13', 'k10_13_rush_punch', 'ots_L_hold', 0.28],
  ['P14', 'k10_14_knee_check', 'dutch_snap', 0.38],
  ['P15', 'k10_15_jump_side_kick_air', 'high_dive', 0.68],
  ['P16', 'k10_16_jump_side_land', 'ecu_jitter', 0.72],
  ['P17', 'k10_17_low_sweep', 'floor_hold', 0.38],
  ['P18', 'k10_18_hammer_down', 'high_dive', 0.42],
  ['P19', 'k10_19_catch', 'face_whip', 0.52],
  ['P20', 'k10_20_standoff_crouch', 'pull_aftermath', 0.48],
];

function loadPack() {
  return HMComposeClient.normalizePoseRefPlatePack(readJson('public/presets/openpose_10s_kicks_pose_pack.json'));
}

test('HM-PF-04: OpenPose 10s kicks pack loads and maps pose ids to camera-ready plate slots', async () => {
  const pub = readJson('public/presets/openpose_10s_kicks_pose_pack.json');
  const kit = readJson('kit/presets/openpose_10s_kicks_pose_pack.json');
  assert.deepEqual(pub, kit);
  assert.equal(HMComposeClient.isPoseRefPlatePack(pub), true);
  assert.equal(HMComposeClient.isCostumeLockPackInput(pub), false);

  const project = HMMotionSot.asPortableProject(pub);
  assert.equal(project.show.show_id, 'daiyu-wang-10s-kicks-pose-pack');
  assert.equal(project.show.plate_pack, true);
  assert.equal(HMComposeClient.isPlatePackShow(project.show), true);
  assert.equal(project.show.fx_profile, 'comic');
  assert.equal(project.show.bg.key_white, true);
  assert.equal(project.show.chars.L.costume_id, 'daiyu_pale_teal_tank_v1');
  assert.equal(project.show.chars.R.costume_id, 'wang_black_tank_red_skirt_v1');
  assert.equal(project.show.costume_lock.import_review, 'reused-cleared-art');
  assert.equal(project.show.atoms.length, 20);
  assert.equal(project.media.length, 20);

  const slots = HMComposeClient.poseRefSlotMap(project);
  assert.equal(slots.length, 20);
  EXPECTED.forEach(([pose, beat, cam, dur], index) => {
    const slot = slots[index];
    const atom = project.show.atoms[index];
    assert.equal(slot.pose_id, pose);
    assert.equal(slot.plate_id, pose);
    assert.equal(slot.beat_id, beat);
    assert.equal(slot.camera_preset, cam);
    assert.equal(atom.id, beat);
    assert.equal(atom.hero.plates[0], pose);
    assert.equal(atom.camera.preset, cam);
    assert.equal(atom.duration_s, dur);
    assert.deepEqual(atom.fx_hooks, []);
    assert.equal(slot.src, 'assets/daiyu-wang-10s-kicks/plates/' + pose + '.png');
    assert.equal(fs.existsSync(path.join(ROOT, 'public', slot.src)), true, slot.src);
  });

  const sum = project.show.atoms.reduce((total, atom) => total + atom.duration_s, 0);
  assert.ok(Math.abs(sum - 10.07) < 1e-6, String(sum));

  const checklist = HMComposeClient.parityDirtyChecklist(project);
  assert.equal(checklist.clean, true, JSON.stringify(checklist));

  const composed = await HMComposeClient.composeShow(project.show, {
    cameraPresets: readJson('public/presets/camera_presets.json'),
    fxPresets: readJson('public/presets/fx_presets.json'),
    cutPresets: readJson('public/presets/cut_transitions.json'),
    loadJson: async (p) => project.layouts[p],
  });
  assert.equal(composed.ok, true, JSON.stringify(composed.errors));
  assert.equal(composed.duration_s, 10.07);
  assert.equal(composed.stats.plates, 20);
  assert.equal(composed.timeline.bg.key_white, true);
  assert.equal(composed.timeline.atoms[0].cam[0].preset, 'eye_push');
  assert.equal(composed.timeline.atoms[6].cam[0].preset, 'upward_inside');
});

test('HM-PF-04: plate swap keeps the pose-id map and both costume lock IDs', () => {
  const project = loadPack();
  const before = HMComposeClient.poseRefSlotMap(project).map((slot) => slot.pose_id + ':' + slot.plate_id + ':' + slot.camera_preset);
  project.show.atoms[0].hero.plates = ['P07'];
  const after = HMComposeClient.poseRefSlotMap(project);
  assert.equal(project.show.atoms[0].hero.plates[0], 'P07');
  assert.equal(project.show.atoms[0].camera.preset, 'eye_push');
  assert.equal(after[0].pose_id, 'P01');
  assert.equal(after[0].plate_id, 'P01');
  assert.equal(after[6].pose_id, 'P07');
  assert.equal(after[6].camera_preset, 'upward_inside');
  assert.deepEqual(after.map((slot) => slot.pose_id + ':' + slot.plate_id + ':' + slot.camera_preset), before);
  assert.equal(project.show.chars.L.costume_id, 'daiyu_pale_teal_tank_v1');
  assert.equal(project.show.chars.R.costume_id, 'wang_black_tank_red_skirt_v1');
});

test('HM-PF-04: nonlocal plates and incomplete slots fail closed', () => {
  const base = {
    kind: 'pose_ref_plate_pack',
    pack_id: 'bad-pose-pack',
    cast: {
      L: { name: 'Lin', costume_id: 'lin_v1' },
      R: { name: 'Wang', costume_id: 'wang_v1' },
    },
  };
  assert.throws(() => HMComposeClient.normalizePoseRefPlatePack({
    ...base,
    slots: [{ pose_id: 'P01', src: 'https://api.teqcon.uk/plates/P01.png', duration_s: 0.4, camera: { preset: 'eye_push' } }],
  }), /nonlocal|unsafe|invalid/i);
  assert.throws(() => HMComposeClient.normalizePoseRefPlatePack({
    ...base,
    slots: [{ pose_id: 'P01', src: 'assets/daiyu-wang-10s-kicks/plates/P01.png', duration_s: 0.4 }],
  }), /camera preset/);
  assert.throws(() => HMComposeClient.normalizePoseRefPlatePack({
    ...base,
    slots: [
      { pose_id: 'P01', src: 'assets/daiyu-wang-10s-kicks/plates/P01.png', duration_s: 0.4, camera: { preset: 'eye_push' } },
      { pose_id: 'P01', src: 'assets/daiyu-wang-10s-kicks/plates/P02.png', duration_s: 0.4, camera: { preset: 'low_rise' } },
    ],
  }), /Duplicate pose id/);
});

test('HM-PF-04: five-second demo and pose-pack loader stay free of generation calls', () => {
  const demo = readJson('public/shows/daiyu-wang-five-seconds.json');
  assert.equal(demo.show_id, 'daiyu-wang-five-seconds');
  assert.equal(demo.atoms.length, 8);
  const dur = demo.atoms.reduce((sum, atom) => sum + atom.duration_s, 0);
  assert.equal(dur, 5);
  const src = read('public/ui/pose-ref-pack.js');
  assert.equal(/GenerateImage|api\.teqcon\.uk|:8770|wrangler/.test(src), false);
  assert.equal(read('public/ui/index.html').includes('id="loadPoseRefPack"'), true);
});

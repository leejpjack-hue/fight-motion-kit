'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('../public/ui/compose-client.js');
require('../public/ui/costume-lock.js');
require('../public/ui/motion-sot.js');
require('../public/ui/product-flow-gate.js');

const ROOT = path.resolve(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const TINY_PNG_A = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const TINY_PNG_B = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

test('HM-PF-01: shipped dual-cast costume_lock preset loads as plate pack and composes cleanly offline', async () => {
  const pubPack = readJson('public/presets/costume_lock_dual_cast.json');
  const kitPack = readJson('kit/presets/costume_lock_dual_cast.json');
  assert.deepEqual(pubPack, kitPack);
  assert.equal(HMComposeClient.isCostumeLockPackInput(pubPack), true);

  const project = HMComposeClient.normalizeCostumeLockPack(pubPack);
  assert.equal(project.version, 1);
  assert.equal(project.show.show_id, 'daiyu-wang-costume-lock');
  assert.equal(HMComposeClient.isPlatePackShow(project.show), true);

  const honesty = HMComposeClient.charHonesty(project.show);
  assert.equal(honesty.locked, true);
  assert.equal(honesty.dualLocked, true);
  assert.equal(honesty.L.name, 'Lin Daiyu');
  assert.equal(honesty.L.costume_id, 'daiyu_celadon_tank_v1');
  assert.equal(honesty.L.sheets, 1);
  assert.equal(honesty.L.pose_refs, 4);
  assert.equal(honesty.R.name, 'Wang Xifeng');
  assert.equal(honesty.R.costume_id, 'wang_crimson_jacket_v1');
  assert.equal(honesty.R.sheets, 1);
  assert.equal(honesty.R.pose_refs, 4);

  // 2 costume sheets + 8 pose refs = 10 swappable library plates; 8 initial timeline atoms = 5.00s
  assert.equal(project.media.length, 10);
  assert.equal(project.media.filter((m) => m.role === 'sheet').length, 2);
  assert.equal(project.media.filter((m) => m.role === 'pose_ref').length, 8);
  assert.equal(project.show.atoms.length, 8);

  const checklist = HMComposeClient.parityDirtyChecklist(project);
  assert.equal(checklist.active, true);
  assert.equal(checklist.clean, true, JSON.stringify(checklist));

  // Verify every referenced asset exists locally in public/
  const allPaths = new Set([
    project.show.bg.base,
    ...project.media.map((m) => m.src),
  ]);
  for (const rel of allPaths) {
    assert.equal(fs.existsSync(path.join(ROOT, 'public', rel)), true, 'missing local asset: ' + rel);
  }

  const composed = await HMComposeClient.composeShow(project.show, {
    cameraPresets: readJson('public/presets/camera_presets.json'),
    fxPresets: readJson('public/presets/fx_presets.json'),
    cutPresets: readJson('public/presets/cut_transitions.json'),
    loadJson: async (p) => project.layouts[p] || readJson('public/' + p),
  });
  assert.equal(composed.ok, true, JSON.stringify(composed.errors));
  assert.equal(composed.duration_s, 5);
  assert.equal(composed.stats.plates, 8);
});

test('HM-PF-01: companion local sheet + pose ref files resolve into embedded offline assets via asPortableProject', async () => {
  const skillLockJson = {
    kind: 'costume_lock',
    pack_id: 'street-duel-lock',
    title: 'Street Duel Lock',
    cast: {
      L: {
        name: 'Ah Lung',
        costume_id: 'lung_denim_vest_v2',
        sheets: ['sheets/lung_sheet.png'],
        pose_refs: [{ id: 'L_GUARD', label: 'Lung guard', src: 'poses/lung_guard.png', duration_s: 0.5 }],
      },
      R: {
        name: 'Siu Mei',
        costume_id: 'mei_track_jacket_v1',
        sheets: ['sheets/mei_sheet.png'],
        pose_refs: [{ id: 'R_KICK', label: 'Mei side kick', src: 'poses/mei_kick.png', duration_s: 0.5 }],
      },
    },
  };
  const localFiles = {
    'lung_sheet.png': TINY_PNG_A,
    'mei_sheet.png': TINY_PNG_B,
    'lung_guard.png': TINY_PNG_A,
    'mei_kick.png': TINY_PNG_B,
  };

  const project = HMMotionSot.asPortableProject(skillLockJson, { localFiles });
  assert.ok(project && project.show);
  assert.equal(project.show.chars.L.costume_id, 'lung_denim_vest_v2');
  assert.equal(project.show.chars.R.costume_id, 'mei_track_jacket_v1');
  assert.equal(project.assets['sheets/lung_sheet.png'], TINY_PNG_A);
  assert.equal(project.assets['poses/mei_kick.png'], TINY_PNG_B);
  assert.equal(HMComposeClient.parityDirtyChecklist(project).clean, true);

  const composed = await HMComposeClient.composeShow(project.show, {
    cameraPresets: readJson('public/presets/camera_presets.json'),
    fxPresets: readJson('public/presets/fx_presets.json'),
    loadJson: async (p) => project.layouts[p],
  });
  assert.equal(composed.ok, true, JSON.stringify(composed.errors));
  assert.equal(composed.duration_s, 1);
  assert.equal(composed.stats.plates, 2);
});

test('HM-PF-01: plate swap, .motion.json round-trip, and PF-09 Rework preserve locked costume IDs for both cast members', () => {
  const project = HMComposeClient.normalizeCostumeLockPack(readJson('public/presets/costume_lock_dual_cast.json'));
  const beforeLock = HMComposeClient.costumeLockInfo(project.show);
  assert.equal(beforeLock.L.costume_id, 'daiyu_celadon_tank_v1');
  assert.equal(beforeLock.R.costume_id, 'wang_crimson_jacket_v1');

  // Swap clip 0 to a costume sheet plate and clip 1 to R's pose ref plate
  const sheetMedia = project.media.find((m) => m.role === 'sheet' && m.side === 'R');
  const poseMedia = project.media.find((m) => m.role === 'pose_ref' && m.side === 'L' && m.plateId === 'L_POSE_04');
  assert.ok(sheetMedia && poseMedia);

  HMMotionSot.applyCharacterPlate(project, 0, { layout_source: sheetMedia.layoutSource, plateId: sheetMedia.plateId });
  HMMotionSot.applyCharacterPlate(project, 1, { layout_source: poseMedia.layoutSource, plateId: poseMedia.plateId });

  assert.deepEqual(project.show.atoms[0].hero.plates, ['R_SHEET_01']);
  assert.deepEqual(project.show.atoms[1].hero.plates, ['L_POSE_04']);

  const afterSwapLock = HMComposeClient.costumeLockInfo(project.show);
  assert.equal(afterSwapLock.L.costume_id, 'daiyu_celadon_tank_v1');
  assert.equal(afterSwapLock.R.costume_id, 'wang_crimson_jacket_v1');
  assert.deepEqual(afterSwapLock, beforeLock);

  // Save/reopen portable .motion.json round-trip
  const reopened = HMMotionSot.asPortableProject(JSON.parse(HMMotionSot.serialize(project)));
  assert.equal(HMMotionSot.sameSot(project, reopened), true);
  assert.deepEqual(HMComposeClient.costumeLockInfo(reopened.show), beforeLock);

  // PF-09 Rework preserves dual-cast costume lock
  const storage = memoryStorage();
  HMProductFlowGate.applyRework(reopened, { storage, notes: 'tighten beat 2' });
  assert.deepEqual(HMComposeClient.costumeLockInfo(reopened.show), beforeLock);
});

test('HM-PF-01: rejects missing cast lock IDs, non-lock JSON, and nonlocal/teqcon/:8770 URLs', () => {
  assert.equal(HMComposeClient.isCostumeLockPackInput({ bad: true }), false);
  assert.equal(HMMotionSot.asPortableProject({ bad: true }), null);

  // Missing R costume_id fails explicitly
  assert.throws(() => HMComposeClient.normalizeCostumeLockPack({
    kind: 'costume_lock',
    cast: {
      L: { name: 'Daiyu', costume_id: 'daiyu_v1', sheets: [TINY_PNG_A] },
      R: { name: 'Wang', sheets: [TINY_PNG_B] },
    },
  }), /both L and R/);

  // Remote URLs (teqcon / :8770 / https) fail closed for offline guarantee
  for (const remote of [
    'https://api.teqcon.uk/sheets/L.png',
    'http://127.0.0.1:8770/pose/P01.png',
    '//cdn.example.com/sheet.png',
    '../escape/sheet.png',
  ]) {
    assert.throws(() => HMComposeClient.normalizeCostumeLockPack({
      kind: 'costume_lock',
      cast: {
        L: { name: 'Daiyu', costume_id: 'daiyu_v1', sheets: [remote] },
        R: { name: 'Wang', costume_id: 'wang_v1', sheets: [TINY_PNG_B] },
      },
    }), /nonlocal|unsafe|invalid/i);
  }
});

test('HM-PF-01: zero blast radius on existing plate packs, schema, and zero GenerateImage/backend strings in FE', () => {
  const schema = readJson('kit/schema/show.schema.json');
  assert.ok(schema.properties.costume_lock);
  assert.ok(schema.$defs.char.properties.costume_id);
  assert.ok(schema.$defs.costumeLockPack);

  for (const showRel of [
    'public/shows/daiyu-wang-five-seconds.json',
    'public/shows/daiyu-wang-ten-seconds.json',
    'public/shows/daiyu-wang-codex-import.json',
    'public/shows/street-old-city.json',
    'public/shows/fight-cam-grammar-starter.json',
  ]) {
    const show = readJson(showRel);
    assert.equal(HMComposeClient.isCostumeLockPackInput(show), false, showRel);
    const h = HMComposeClient.charHonesty(show);
    assert.equal(h.locked, false, showRel);
  }

  // Legacy string costume_lock on show.chars (e.g. zhao-hua-parity.json) resolves cleanly
  const legacy = readJson('kit/shows/zhao-hua-parity.json');
  const legacyLock = HMComposeClient.costumeLockInfo(legacy);
  assert.equal(legacyLock.active, true);
  assert.equal(legacyLock.dualLocked, true);
  assert.match(legacyLock.L.costume_id, /costume_lock\.md$/);
  assert.match(legacyLock.R.costume_id, /costume_lock\.md$/);

  // Source scan: FE composer makes zero GenerateImage, teqcon, or :8770 calls
  for (const feRel of [
    'public/ui/costume-lock.js',
    'public/ui/exports.js',
    'public/ui/motion-sot.js',
    'public/ui/index.html',
  ]) {
    const src = fs.readFileSync(path.join(ROOT, feRel), 'utf8');
    assert.doesNotMatch(src, /GenerateImage|generate_image|api\.teqcon\.uk|:8770/, feRel);
  }
});

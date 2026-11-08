const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

require('../public/ui/motion-sot.js');
require('../public/ui/compose-client.js');

const read = (p) => JSON.parse(fs.readFileSync('public/' + p, 'utf8'));
const demo = () => read('shows/daiyu-wang-five-seconds.json');

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    keys() { return [...map.keys()]; },
  };
}

function projectFrom(show) {
  const layoutKey = show.atoms[0].hero.layout_source;
  return {
    version: 1,
    show: JSON.parse(JSON.stringify(show)),
    layouts: { [layoutKey]: read(layoutKey) },
    media: [],
    assets: {},
  };
}

test('HM-PF-44: steps 1, 5, and 9 edit one show and the .motion.json round-trips cam, timing, FX, and plates', async () => {
  const project = projectFrom(demo());
  assert.equal(HMMotionSot.applyCharacterPlate(project, 0, { plateId: 'P08' }), project);
  assert.equal(HMMotionSot.applyAtomCam(project, 0, { preset: 'slow_push', nudge: { r: 12 }, intensity: 1.25 }), project);
  assert.equal(HMMotionSot.applyAtomCam(project, 1, { preset: 'slow_push', nudge: {} }), project);
  assert.equal(HMMotionSot.applyComposeEdit(project, 0, {
    duration_s: 0.8,
    fx_hooks: [{ type: 'hit_pink', t_rel: 0.08, params: {} }],
  }), project);

  const before = HMMotionSot.fingerprint(project);
  assert.equal(before.atoms[0].plates[0], 'P08');
  assert.equal(before.atoms[0].camera.preset, 'slow_push');
  assert.equal(before.atoms[0].camera.nudge.r, 12);
  assert.equal(before.atoms[0].camera.intensity, 1.25);
  assert.equal(before.atoms[0].duration_s, 0.8);
  assert.equal(before.atoms[0].fx_hooks[0].type, 'hit_pink');
  assert.equal(before.atoms[1].camera.preset, 'slow_push');

  const text = HMMotionSot.serialize(project);
  const reopened = HMMotionSot.asPortableProject(JSON.parse(text));
  assert.deepEqual(HMMotionSot.fingerprint(reopened), before);
  assert.equal(HMMotionSot.sameSot(reopened, project), true);
  assert.deepEqual(reopened.layouts, project.layouts);

  const storage = memoryStorage();
  const written = HMMotionSot.writeDraft(storage, project, 0.4);
  assert.equal(storage.keys().join(','), HMMotionSot.draftKey(project.show.show_id));
  assert.equal(HMMotionSot.draftKey(project.show.show_id), 'html-motion-composer:draft:daiyu-wang-five-seconds');
  const draft = HMMotionSot.readDraft(storage, project.show.show_id);
  assert.equal(draft.ts, written.ts);
  assert.equal(draft.scrub, 0.4);
  const fromDraft = HMMotionSot.applyDraftShow(projectFrom(demo()), draft);
  assert.deepEqual(HMMotionSot.fingerprint(fromDraft), before);

  const baked = await HMComposeClient.composeShow(reopened.show, {
    allowSoftLint: true,
    cameraPresets: read('presets/camera_presets.json'),
    fxPresets: read('presets/fx_presets.json'),
    loadJson: async (p) => read(p),
  });
  assert.equal(baked.ok, true);
  assert.equal(baked.layout.S001.source_plate, 'P08');
  assert.equal(baked.timeline.atoms[0].cam[0].preset, 'slow_push');
  assert.equal(+(baked.timeline.atoms[0].t1 - baked.timeline.atoms[0].t0).toFixed(4), 0.8);
  assert.equal(baked.timeline.atoms[0].fx_hooks[0].type, 'hit_pink');

  const lint = HMComposeClient.lintShow(reopened, {
    cameraPresets: read('presets/camera_presets.json'),
    fxPresets: read('presets/fx_presets.json'),
  });
  assert.equal(lint.contract, 'HM-HF-03-SHOW-JSON-LINT');
  assert.equal(lint.blocksBake, false);
  assert.ok(lint.findings.some((row) => row.code === 'adjacent_same_cam' && row.blocksBake === false));
});

test('HM-PF-44: draft key names stay put and the module does not call a server', () => {
  const kit = fs.readFileSync('kit/ui/index.html', 'utf8');
  assert.match(kit, /const DRAFT_PREFIX='html-motion-composer:draft:';/);
  assert.match(kit, /const HM_RECENT_KEY='hm\.composer\.recentPlatePack';/);
  assert.match(kit, /const HM_PIN_KEY='hm\.composer\.pinPlatePack';/);
  assert.equal(HMMotionSot.DRAFT_PREFIX, 'html-motion-composer:draft:');
  assert.equal(HMMotionSot.PIN_KEY, 'hm.composer.pinPlatePack');
  assert.equal(HMMotionSot.RECENT_KEY, 'hm.composer.recentPlatePack');
  const src = fs.readFileSync('public/ui/motion-sot.js', 'utf8');
  assert.equal(/fetch\s*\(|api\.teqcon\.uk|:8770|XMLHttpRequest|\/api\/(compose|save|upload)/.test(src), false);
  assert.equal(HMMotionSot.asPortableProject(demo()), null);
});

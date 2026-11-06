const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
require('../public/ui/compose-client.js');
require('../public/ui/motion-renderer.js');

const read = (p) => JSON.parse(fs.readFileSync('public/' + p, 'utf8'));
const demo = () => read('shows/daiyu-wang-five-seconds.json');
const fixture = () => read('shows/hm-hf-08-cuts.json');
const compose = (show, extra) => HMComposeClient.composeShow(show, Object.assign({
  cameraPresets: read('presets/camera_presets.json'),
  fxPresets: read('presets/fx_presets.json'),
  cutPresets: read('presets/cut_transitions.json'),
  loadJson: async (p) => read(p),
}, extra || {}));

test('cut transition pack ships freeze hold, white flash, and whip cut', () => {
  const pack = read('presets/cut_transitions.json');
  const kit = JSON.parse(fs.readFileSync('kit/presets/cut_transitions.json', 'utf8'));
  assert.deepEqual(kit, pack);
  assert.equal(pack.field, 'show.atoms[i].cut');
  assert.deepEqual(pack.presets.map((p) => p.id), ['freeze_hold', 'white_flash', 'whip_cut']);
  assert.deepEqual(HMComposeClient.CUT_TRANSITION_IDS, ['freeze_hold', 'white_flash', 'whip_cut']);
});

test('show.atoms[i].cut round-trips and lands on the atom boundary without adding time', async () => {
  const show = fixture();
  const again = JSON.parse(JSON.stringify(show));
  assert.deepEqual(again.atoms[1].cut, { preset: 'freeze_hold', dur_s: 0.12, hold_s: 0.12, dir: 1 });
  assert.equal(again.atoms[2].cut.preset, 'white_flash');
  assert.equal(again.atoms[3].cut.preset, 'whip_cut');
  const r = await compose(again);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.duration_s, 2);
  assert.equal(r.timeline.plates.length, 4);
  assert.deepEqual(r.timeline.cuts.map((c) => [c.preset, c.t, c.after_id, c.before_id, c.index]), [
    ['freeze_hold', 0.5, 'beat-01', 'beat-02', 1],
    ['white_flash', 1, 'beat-02', 'beat-03', 2],
    ['whip_cut', 1.5, 'beat-03', 'beat-04', 3],
  ]);
  assert.equal(r.timeline.atoms[0].cut, undefined);
  assert.equal(r.timeline.atoms[1].cut.hold_s, 0.12);
  assert.equal(r.timeline.atoms[2].cut.dur_s, 0.08);
  assert.equal(r.timeline.atoms[3].cut.dir, 1);
  const raw = JSON.stringify(again);
  const stored = JSON.parse(raw);
  assert.equal(stored.atoms[1].cut.preset, 'freeze_hold');
  const second = await compose(stored);
  assert.deepEqual(second.timeline.cuts, r.timeline.cuts);
});

test('cuts on the five-second show do not move its eight plates', async () => {
  const plain = await compose(demo());
  assert.equal(plain.ok, true);
  assert.equal(plain.duration_s, 5);
  assert.equal(plain.timeline.plates.length, 8);
  assert.deepEqual(plain.timeline.cuts, []);
  const show = demo();
  show.atoms[1].cut = { preset: 'freeze_hold', dur_s: 0.12, hold_s: 0.12, dir: 1 };
  show.atoms[2].cut = { preset: 'white_flash', dur_s: 0.08, hold_s: 0, dir: 1 };
  show.atoms[3].cut = { preset: 'whip_cut', dur_s: 0.1, hold_s: 0, dir: -1 };
  const r = await compose(show);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.duration_s, 5);
  assert.equal(r.timeline.plates.length, 8);
  assert.deepEqual(r.timeline.plates.map((p) => [p.t0, p.t1]), plain.timeline.plates.map((p) => [p.t0, p.t1]));
  assert.equal(r.timeline.cuts[2].dir, -1);
  assert.equal(r.timeline.cuts[2].preset, 'whip_cut');
});

test('unknown cut preset fails and a cut on the first atom is ignored', async () => {
  const bad = fixture();
  bad.atoms[1].cut = { preset: 'sparkle', dur_s: 0.08 };
  const failed = await compose(bad);
  assert.equal(failed.ok, false);
  assert.match(failed.errors.join('\n'), /beat-02: unknown cut preset sparkle/);
  const show = fixture();
  show.atoms[0].cut = { preset: 'white_flash', dur_s: 0.08 };
  const r = await compose(show);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.timeline.cuts.length, 3);
  assert.equal(r.timeline.cuts.some((c) => c.before_id === 'beat-01'), false);
  assert.match(r.warnings.join('\n'), /beat-01: cut ignored on the first atom/);
});

test('scrub phase peaks on the boundary for flash and whip and holds the freeze', () => {
  const cuts = [
    { t: 0.5, preset: 'freeze_hold', dur_s: 0.12, hold_s: 0.12, dir: 1, after_id: 'beat-01', before_id: 'beat-02' },
    { t: 1, preset: 'white_flash', dur_s: 0.08, hold_s: 0, dir: 1, after_id: 'beat-02', before_id: 'beat-03' },
    { t: 1.5, preset: 'whip_cut', dur_s: 0.1, hold_s: 0, dir: 1, after_id: 'beat-03', before_id: 'beat-04' },
  ];
  assert.equal(resolveCutTransition(cuts, 0.49), null);
  const heldEarly = resolveCutTransition(cuts, 0.54);
  const heldLate = resolveCutTransition(cuts, 0.6);
  assert.equal(heldEarly.freeze, true);
  assert.equal(heldLate.freeze, true);
  assert.equal(heldEarly.t, heldLate.t);
  assert.equal(resolveCutTransition(cuts, 0.62), null);
  const flash = resolveCutTransition(cuts, 1);
  assert.equal(flash.preset, 'white_flash');
  assert.equal(flash.u, 0.5);
  assert.equal(flash.white, 1);
  assert.equal(resolveCutTransition(cuts, 1 - 0.04).preset, 'white_flash');
  assert.equal(resolveCutTransition(cuts, 1.04), null);
  const whip = resolveCutTransition(cuts, 1.5);
  assert.equal(whip.preset, 'whip_cut');
  assert.equal(whip.peak, 1);
  assert.equal(whip.whip.barX, 640 - 36);
  const left = resolveCutTransition([{ t: 1.5, preset: 'whip_cut', dur_s: 0.1, dir: -1 }], 1.5);
  assert.equal(left.whip.dir, -1);
  assert.equal(left.whip.barX, 640 - 36);
  assert.equal(resolveCutTransition(cuts, 1.4), null);
  assert.equal(resolveCutTransition(cuts, 1.46).preset, 'whip_cut');
  assert.equal(resolveCutTransition(cuts, 1.55), null);
});

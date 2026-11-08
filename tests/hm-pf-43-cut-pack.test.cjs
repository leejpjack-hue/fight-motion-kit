const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('../public/ui/compose-client.js');

const repo = path.resolve(__dirname, '..');
const script = path.join(repo, 'skills/hm-compose-fx-impact/scripts/stamp-cut-pack.cjs');
const gold = JSON.parse(fs.readFileSync(path.join(repo, 'public/presets/cut_transitions.json'), 'utf8'));
const kit = JSON.parse(fs.readFileSync(path.join(repo, 'kit/presets/cut_transitions.json'), 'utf8'));
const fixtureShow = () => {
  const show = JSON.parse(fs.readFileSync(path.join(repo, 'public/shows/hm-hf-08-cuts.json'), 'utf8'));
  show.atoms.forEach((a) => { delete a.cut; });
  return show;
};

const CYCLE_CUTS = [
  { preset: 'freeze_hold', dur_s: 0.12, hold_s: 0.12, dir: 1 },
  { preset: 'white_flash', dur_s: 0.08, hold_s: 0, dir: 1 },
  { preset: 'whip_cut', dur_s: 0.10, hold_s: 0, dir: 1 },
];

function run(args) {
  return spawnSync(process.execPath, [script, ...args], { cwd: repo, encoding: 'utf8' });
}

function freshShow(dir, name) {
  const showPath = path.join(dir, name || 'show.json');
  fs.writeFileSync(showPath, JSON.stringify(fixtureShow(), null, 2) + '\n');
  return showPath;
}

test('HM-PF-43: gold cut_transitions.json keeps exactly the 3 HF-08 preset ids with original defaults', () => {
  assert.deepEqual(kit, gold); // kit mirror stays byte-stable with public gold
  assert.equal(gold.version, 'hm-hf-08');
  assert.equal(gold.field, 'show.atoms[i].cut');
  assert.deepEqual(gold.presets.map((p) => p.id), ['freeze_hold', 'white_flash', 'whip_cut']);
  assert.deepEqual(gold.presets.map((p) => p.defaults), [
    { dur_s: 0.12, hold_s: 0.12, dir: 1 },
    { dur_s: 0.08, hold_s: 0, dir: 1 },
    { dur_s: 0.10, hold_s: 0, dir: 1 },
  ]);
});

test('HM-PF-43: stamp-cut-pack cycle writes freeze/white/whip on atoms 1..3 and leaves atom 0 without cut', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-pf-43-'));
  const showPath = freshShow(dir);
  const out = path.join(dir, 'out.json');

  const stamped = run(['--show', showPath, '--pack', 'cycle', '--all', '--out', out]);
  assert.equal(stamped.status, 0, stamped.stderr);
  assert.match(stamped.stdout, /Mode: cycle \(freeze_hold -> white_flash -> whip_cut\)/);
  assert.match(stamped.stdout, /beat-01\[0\]: skipped — first atom has no incoming boundary/);

  const show = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal('cut' in show.atoms[0], false);
  assert.deepEqual([show.atoms[1].cut, show.atoms[2].cut, show.atoms[3].cut], CYCLE_CUTS);
  // Cuts add no time: durations are untouched.
  const before = JSON.parse(fs.readFileSync(showPath, 'utf8'));
  assert.deepEqual(show.atoms.map((a) => a.duration_s), before.atoms.map((a) => a.duration_s));
});

test('HM-PF-43: stamp-cut-pack --preset stamps one gold preset and backs up on first in-place write', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-pf-43-'));
  const showPath = freshShow(dir);

  const single = run(['--show', showPath, '--preset', 'white_flash', '--atoms', 'beat-02,beat-04']);
  assert.equal(single.status, 0, single.stderr);
  const show = JSON.parse(fs.readFileSync(showPath, 'utf8'));
  assert.equal('cut' in show.atoms[0], false);
  assert.equal('cut' in show.atoms[2], false);
  assert.deepEqual(show.atoms[1].cut, CYCLE_CUTS[1]);
  assert.deepEqual(show.atoms[3].cut, CYCLE_CUTS[1]);
  const backup = JSON.parse(fs.readFileSync(showPath + '.bak', 'utf8'));
  assert.equal(backup.atoms.some((a) => a.cut), false); // pristine first backup
});

test('HM-PF-43: applyCutPack (compose-client) matches stamp-cut-pack semantics', () => {
  const base = fixtureShow();
  const next = HMComposeClient.applyCutPack(base, [0, 1, 2, 3], { preset: 'cycle', cutPresets: gold });
  assert.equal('cut' in next.atoms[0], false); // atom 0 skipped, not an error
  assert.deepEqual([next.atoms[1].cut, next.atoms[2].cut, next.atoms[3].cut], CYCLE_CUTS);
  assert.equal(base.atoms.some((a) => a.cut), false); // input show untouched (clone semantics)
  assert.deepEqual(next.atoms.map((a) => a.duration_s), base.atoms.map((a) => a.duration_s));

  // Default opts cycle too, and single-preset mode stamps one id across the selection.
  const defaulted = HMComposeClient.applyCutPack(base, [1, 2, 3]);
  assert.deepEqual([defaulted.atoms[1].cut, defaulted.atoms[2].cut, defaulted.atoms[3].cut], CYCLE_CUTS);
  const single = HMComposeClient.applyCutPack(base, [1, 3], { preset: 'whip_cut', cutPresets: gold });
  assert.deepEqual(single.atoms[1].cut, CYCLE_CUTS[2]);
  assert.deepEqual(single.atoms[3].cut, CYCLE_CUTS[2]);

  // Selection of only atom 0 is zero targets — honest throw, mirroring the stamp exit.
  assert.throws(() => HMComposeClient.applyCutPack(base, [0], { cutPresets: gold }), /entering clips \(i >= 1\)/);
});

test('HM-PF-43: unknown cut preset fails in both the stamp and the compose helper', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-pf-43-'));
  const showPath = freshShow(dir);

  const unknown = run(['--show', showPath, '--preset', 'sparkle', '--all']);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /unknown cut preset "sparkle"/);

  const zeroTargets = run(['--show', showPath, '--atoms', 'beat-01', '--out', path.join(dir, 'x.json')]);
  assert.notEqual(zeroTargets.status, 0);
  assert.match(zeroTargets.stderr, /zero targets/);

  const missingShow = run(['--show', path.join(dir, 'ghost.json'), '--all']);
  assert.notEqual(missingShow.status, 0);
  assert.match(missingShow.stderr, /cannot read show/);

  assert.throws(() => HMComposeClient.applyCutPack(fixtureShow(), [1], { preset: 'sparkle', cutPresets: gold }), /Unknown cut preset: sparkle/);
});

test('HM-PF-43: stamped cut pack composes through the existing HM-HF-08 draw path', async () => {
  const read = (p) => JSON.parse(fs.readFileSync(path.join(repo, 'public', p), 'utf8'));
  const show = HMComposeClient.applyCutPack(fixtureShow(), [0, 1, 2, 3], { preset: 'cycle', cutPresets: gold });
  const result = await HMComposeClient.composeShow(show, {
    cameraPresets: read('presets/camera_presets.json'),
    fxPresets: read('presets/fx_presets.json'),
    cutPresets: gold,
    loadJson: async (p) => read(p),
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.duration_s, 2); // cuts add no time
  assert.deepEqual(result.timeline.cuts.map((c) => [c.preset, c.index]), [
    ['freeze_hold', 1],
    ['white_flash', 2],
    ['whip_cut', 3],
  ]);
});

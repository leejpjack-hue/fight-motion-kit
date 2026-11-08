const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const script = path.join(repo, 'skills/hm-compose-fx-impact/scripts/stamp-wave1-fx.cjs');
const fixture = path.join(repo, 'skills/hm-compose-fx-impact/fixtures/two-beat-fixture.json');
const wave1 = JSON.parse(fs.readFileSync(path.join(repo, 'public/presets/pixelfx_wave1.json'), 'utf8'));

function run(args) {
  return spawnSync(process.execPath, [script, ...args], {cwd: repo, encoding: 'utf8'});
}

function freshShow(dir, name) {
  const showPath = path.join(dir, name || 'show.json');
  fs.copyFileSync(fixture, showPath);
  return showPath;
}

test('HM-PF-41: happy path adds the Wave1 hook once, with loc/size params', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-pf-41-'));
  const showPath = freshShow(dir);
  const out = path.join(dir, 'out.json');

  const stamped = run(['--show', showPath, '--atoms', 'beat-01', '--out', out]);
  assert.equal(stamped.status, 0, stamped.stderr);
  assert.match(stamped.stdout, /beat-01: added impacts\/hit-spark/);

  const atom = JSON.parse(fs.readFileSync(out, 'utf8')).atoms[0];
  assert.deepEqual(atom.fx_hooks, [
    {type: 'impacts/hit-spark', t_rel: 0.08, source: 'pixelfx', params: {x: 0, y: 0, scale: 1}}
  ]);
  // --out leaves the source untouched.
  assert.equal('fx_hooks' in JSON.parse(fs.readFileSync(showPath, 'utf8')).atoms[0], false);
});

test('HM-PF-41: stamping twice is idempotent and keeps a pristine first backup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-pf-41-'));
  const showPath = freshShow(dir);

  const first = run(['--show', showPath, '--atoms', 'beat-01']);
  assert.equal(first.status, 0, first.stderr);
  const second = run(['--show', showPath, '--atoms', 'beat-01']);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /beat-01: impacts\/hit-spark already present, left untouched/);

  const hooks = JSON.parse(fs.readFileSync(showPath, 'utf8')).atoms[0].fx_hooks;
  assert.equal(hooks.filter(hook => hook.type === 'impacts/hit-spark').length, 1);
  const backup = JSON.parse(fs.readFileSync(showPath + '.bak', 'utf8'));
  assert.equal('fx_hooks' in backup.atoms[0], false);
});

test('HM-PF-41: --fx accepts a role name; default fx is the first Action id', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-pf-41-'));

  const byRole = run(['--show', freshShow(dir, 'role.json'), '--atoms', 'beat-01', '--fx', 'reaction', '--out', path.join(dir, 'role-out.json')]);
  assert.equal(byRole.status, 0, byRole.stderr);
  const firstReaction = wave1.find(row => row.role === 'Reaction');
  assert.match(byRole.stdout, new RegExp('Stamp fx: ' + firstReaction.id.replace('/', '\\/') + ' \\[Reaction\\]'));

  const byDefault = run(['--show', freshShow(dir, 'default.json'), '--atoms', '0', '--out', path.join(dir, 'default-out.json')]);
  assert.equal(byDefault.status, 0, byDefault.stderr);
  const firstAction = wave1.find(row => row.role === 'Action');
  assert.match(byDefault.stdout, new RegExp('Stamp fx: ' + firstAction.id.replace('/', '\\/') + ' \\[Action\\]'));
});

test('HM-PF-41: --all-action-beats stamps strike beats only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-pf-41-'));
  const showPath = freshShow(dir);

  const stamped = run(['--show', showPath, '--all-action-beats', '--out', path.join(dir, 'out.json')]);
  assert.equal(stamped.status, 0, stamped.stderr);
  assert.match(stamped.stdout, /Stamped 1 atom\(s\): 1 added/);

  const show = JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8'));
  assert.equal(show.atoms[0].motion.beat_class, 'clash'); // stamped
  assert.ok(show.atoms[0].fx_hooks.some(hook => hook.source === 'pixelfx'));
  assert.equal('fx_hooks' in show.atoms[1], false); // guard_recover is not an action beat
});

test('HM-PF-41: fails non-zero on unknown fx id, missing show, and no atoms', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-pf-41-'));
  const showPath = freshShow(dir);

  const unknownFx = run(['--show', showPath, '--atoms', 'beat-01', '--fx', 'impacts/nope']);
  assert.notEqual(unknownFx.status, 0);
  assert.match(unknownFx.stderr, /unknown fx id "impacts\/nope"/);

  const missingShow = run(['--show', path.join(dir, 'ghost.json'), '--atoms', 'beat-01']);
  assert.notEqual(missingShow.status, 0);
  assert.match(missingShow.stderr, /cannot read show/);

  const noSelector = run(['--show', showPath]);
  assert.notEqual(noSelector.status, 0);
  assert.match(noSelector.stderr, /no atoms selected/);

  const badAtom = run(['--show', showPath, '--atoms', 'beat-99']);
  assert.notEqual(badAtom.status, 0);
  assert.match(badAtom.stderr, /no atom matches "beat-99"/);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('../public/ui/compose-client.js');
require('../public/ui/product-flow-gate.js');
const C = HMComposeClient;
const packs = JSON.parse(fs.readFileSync('public/presets/timing_hold_packs.json'));
const clone = x => JSON.parse(JSON.stringify(x));
const show = () => JSON.parse(fs.readFileSync('public/shows/daiyu-wang-five-seconds.json'));
function input(source) {
  const board = C.rhythmBoardFromShow(source);
  return { board, approval: { Decision: 'Approve', step: 2, step_id: 'story', show_id: source.show_id,
    story_snapshot: C.rhythmBoardSnapshot(board), Notes: 'Automated fixture, not human art approval' } };
}
function plan(source, target, options = {}) {
  const data = input(source);
  return C.buildRhythmPlan(data.board, target, { ...data, show: source, timingPacks: packs, ...options });
}
const apply = (source, value) => C.applyRhythmPlan(source, value, { timingPacks: packs });

test('rhythm maps sum exactly to target, preserve a matching map, and respect floor/cap at extreme weights', () => {
  const source = show(), before = clone(source);
  assert.deepEqual(plan(source, 5).duration_map.map(x => x.duration_s), source.atoms.map(x => x.duration_s));
  for (const target of [0.8, 1.2345, 5, 10, 23.9999, 24]) {
    const mapped = plan(source, target);
    assert.equal(C.rhythmTiming(apply(source, mapped)).delta_s, 0);
    assert.ok(mapped.duration_map.every(x => x.duration_s >= 0.1 && x.duration_s <= 3));
    assert.deepEqual(mapped, plan(source, target));
  }
  source.atoms = source.atoms.slice(0, 3);
  source.atoms[0].duration_s = 99; source.atoms[1].duration_s = source.atoms[2].duration_s = 0.1;
  const extreme = plan(source, 3.01);
  assert.equal(C.rhythmTiming(apply(source, extreme)).total_s, 3.01);
  assert.deepEqual(extreme.duration_map.map(x => x.duration_s), [2.81, 0.1, 0.1]);
  assert.deepEqual(before, show(), 'input JSON is never mutated');
});

test('missing/stale GO, impossible targets, wrong beat IDs, and unknown packs fail without mutation', () => {
  const source = show(), before = clone(source), data = input(source);
  for (const approval of [null, { ...data.approval, Decision: 'Rework' }, { ...data.approval, show_id: 'other' }]) {
    assert.throws(() => C.buildRhythmPlan(data.board, 5, { approval, timingPacks: packs }), /Jack GO required/);
  }
  data.board.beats[0].label = 'Changed story';
  assert.throws(() => C.buildRhythmPlan(data.board, 5, { approval: data.approval, timingPacks: packs }), /Jack GO required/);
  for (const target of [0.7, 25, NaN, '5', 5.123456]) assert.throws(() => plan(source, target), /Target|target/);
  assert.throws(() => plan(source, 5, { packId: 'invented', selectedBeatIds: ['beat-01'] }), /Unknown timing pack/);
  assert.throws(() => plan(source, 5, { softCam: true }), /Soft camera requires/);
  assert.throws(() => plan(source, 5, { selectedBeatIds: ['beat-01'] }), /Choose a timing pack/);
  const wrong = plan(source, 5); wrong.duration_map[0].beat_id = 'missing';
  assert.throws(() => apply(source, wrong), /Invalid rhythm|beat IDs/);
  const changed = clone(source); changed.atoms[0].label = 'Another story';
  assert.throws(() => apply(changed, plan(source, 5)), /story labels/);
  const changedFx = clone(source); changedFx.atoms[0].fx_hooks = ['hit_orange'];
  assert.throws(() => apply(changedFx, plan(source, 5)), /motion\/FX/);
  assert.deepEqual(source, before);
  const missingId = input(source); delete missingId.board.beats[0].beat_id;
  assert.throws(() => C.buildRhythmPlan(missingId.board, 5, { timingPacks: packs, approval: missingId.approval }), /beat IDs/);
});

test('Pack A and Pack B exactly reuse the engine and leave unselected impacts untouched', () => {
  const source = show(); source.atoms[2].motion.beat_class = source.atoms[6].motion.beat_class = 'clash';
  const selected = [1, 2], ids = selected.map(i => source.atoms[i].id);
  for (const pack of packs.packs) {
    const stamped = plan(source, 5, { mode: 'stamp', packId: pack.id, selectedBeatIds: ids, softCam: pack.kind === 'hold' });
    const actual = apply(source, stamped);
    const gold = C.applyTimingPack(source, selected, pack, { softCam: pack.kind === 'hold' });
    assert.deepEqual(actual.atoms, gold.atoms);
    assert.deepEqual(actual.atoms[6], source.atoms[6], 'unselected impact is not frozen');
    assert.equal(stamped.duration_map.length, 2);
    assert.equal(actual.duration_target_s, 5);
    assert.notEqual(C.rhythmTiming(actual).delta_s, 0, 'stamping does not silently fit other clips');
  }
});

test('fixed holds remain shipped values and infeasible full-target plans are rejected', () => {
  const source = show();
  const mapped = plan(source, 10, { packId: 'dialogue_film_slow', selectedBeatIds: ['beat-01'] });
  assert.equal(mapped.duration_map[0].duration_s, 1.5);
  assert.equal(apply(source, mapped).atoms[0].timing_hold.pack, 'dialogue_film_slow');
  const held = C.applyTimingPack(source, [0], packs.packs[0]);
  const heldPlan = plan(held, 6);
  assert.equal(heldPlan.duration_map[0].timing_pack, 'dialogue_film_slow');
  assert.equal(apply(held, heldPlan).atoms[0].duration_s, 1.5);
  assert.throws(() => plan(source, 1, { packId: 'dialogue_film_slow', selectedBeatIds: ['beat-01'] }), /cannot fit/);
  const stale = plan(source, 5, { mode: 'stamp', packId: 'dialogue_film_slow', selectedBeatIds: ['beat-01'] });
  source.atoms[0].duration_s = 2;
  assert.throws(() => apply(source, stale), /no longer matches/);
});

test('budget counts impact clips once, warns softly, and updates impact time after duration edits', () => {
  const source = show(); source.rhythm = { impact_budget: 1 };
  source.atoms[0].motion.beat_class = 'impact'; source.atoms[0].fx_hooks = ['hit_orange', 'hitstop_2f'];
  source.atoms[1].fx_hooks = [{ type: 'impacts/hit-spark', source: 'pixelfx' }];
  source.atoms.slice(2).forEach(a => { a.motion.beat_class = 'straight'; a.fx_hooks = []; });
  const budget = C.impactBudget(source, packs);
  assert.equal(budget.slots_used, 2); assert.equal(budget.remaining, -1); assert.equal(budget.over_budget, true);
  source.atoms[0].duration_s += 0.25;
  const edited = C.impactBudget(JSON.parse(JSON.stringify(source)), packs);
  assert.equal(edited.slots_used, 2); assert.equal(edited.impact_time_s, budget.impact_time_s + 0.25);
  assert.equal(C.lintShow(source).blocksBake, false, 'over-budget never introduces a hard gate');
});

test('duration lint reports signed under/over deltas and never treats unknown durations as success', () => {
  const source = show();
  for (const [target, delta] of [[4, 1], [6, -1], [5, 0]]) {
    source.duration_target_s = target;
    assert.equal(C.rhythmTiming(source).delta_s, delta);
    const finding = C.lintShow(source).findings.find(x => x.code === 'duration_target_mismatch');
    if (delta) { assert.match(finding.message, /delta [+-]1.0000s/); assert.equal(finding.category, 'rhythm'); }
    else assert.equal(finding, undefined);
  }
  for (const invalid of [undefined, null, '0.5', NaN, Infinity, 0]) {
    source.atoms[0].duration_s = invalid;
    assert.equal(C.rhythmTiming(source).total_s, null);
    assert.equal(C.rhythmTiming(source).state, 'invalid');
    assert.equal(C.lintShow(source).total_duration_s, null);
    assert.ok(C.lintShow(source).findings.some(x => x.code === 'unsafe_duration' && x.category === 'structural'));
  }
  assert.equal(C.rhythmTiming({}).durations_valid, false);
});

test('existing story gate exports a board-bound GO; changed board content invalidates it', () => {
  const project = { show: show() }, map = new Map(), storage = { setItem: (k, v) => map.set(k, v) };
  const approval = HMProductFlowGate.applyApprove(project, 'Fixture review', '', storage);
  const board = C.rhythmBoardFromShow(project.show);
  assert.doesNotThrow(() => C.requireRhythmApproval(board, approval));
  board.beats[0].label = 'Changed';
  assert.throws(() => C.requireRhythmApproval(board, approval), /Jack GO required/);
});

test('CLI emits a local plan, never overwrites files, and leaves inputs unchanged on failures', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-rhythm-'));
  try {
    const source = show(), data = input(source), boardFile = path.join(dir, 'input.json'), projectFile = path.join(dir, 'source.json'), out = path.join(dir, 'plan.json');
    fs.writeFileSync(boardFile, JSON.stringify({ kind: 'hm-rhythm-input', ...data })); fs.writeFileSync(projectFile, JSON.stringify(source));
    const args = ['skills/hm-rhythm-pacing/scripts/rhythm.cjs', 'plan', '--board', boardFile, '--project', projectFile, '--target-s', '6', '--out', out];
    assert.equal(spawnSync(process.execPath, args, { encoding: 'utf8' }).status, 0);
    const bytes = fs.readFileSync(out, 'utf8');
    assert.equal(C.rhythmTiming(apply(source, JSON.parse(bytes))).total_s, 6);
    assert.notEqual(spawnSync(process.execPath, args, { encoding: 'utf8' }).status, 0);
    assert.equal(fs.readFileSync(out, 'utf8'), bytes);
    assert.deepEqual(JSON.parse(fs.readFileSync(projectFile)), source);
    delete data.approval;
    fs.writeFileSync(boardFile, JSON.stringify({ kind: 'hm-rhythm-input', ...data }));
    const failed = path.join(dir, 'failed.json'); args[args.length - 1] = failed;
    assert.notEqual(spawnSync(process.execPath, args, { encoding: 'utf8' }).status, 0);
    assert.equal(fs.existsSync(failed), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
require('../public/ui/compose-client.js');
require('../public/ui/camera-authoring.js');
require('../public/ui/motion-renderer.js');
require('../public/ui/motion-sot.js');
const C = HMComposeClient, A = HMCameraAuthor;
const read = file => JSON.parse(fs.readFileSync('public/' + file));
const catalog = read('presets/camera_presets.json');
const show = () => read('shows/fight-cam-grammar-starter.json');
const clone = value => JSON.parse(JSON.stringify(value));
function input(source = show()) {
  const board = C.rhythmBoardFromShow(source);
  return { kind: 'hm-camera-input', version: 1, board, show: source, approval: {
    Decision: 'Approve', step: 2, step_id: 'story', show_id: source.show_id,
    story_snapshot: C.rhythmBoardSnapshot(board), Notes: 'Synthetic test fixture; not human art approval',
  } };
}
const build = (source = show(), design) => A.build(input(source), catalog, { design });
const compose = source => C.composeShow(source, { cameraPresets: catalog, fxPresets: read('presets/fx_presets.json'), loadJson: async file => read(file) });

test('source template fields, triplets and Wide coverage produce a human-editable sheet without new curves', () => {
  const source = show(), before = clone(source), sheet = build(source);
  assert.deepEqual(sheet.source_template.fields, ['#', 't (s)', 'Role (Intent/Action/Reaction/Wide)', 'Shot size', 'Angle', 'Function / move', 'Preset id', 'Beat / action', 'FX (full / hitstop / none)', 'Camera clause (draft)']);
  assert.match(sheet.source_template.url, /40b9565776c68154a978edfd92c62652/);
  assert.equal(sheet.fight_meta['Duration (s)'], 11);
  assert.equal(sheet.fight_meta['Screen-LEFT fighter'], 'Lin Daiyu');
  assert.equal(sheet.rows.filter(row => row.role === 'Intent').length, 3);
  assert.equal(sheet.rows.at(-1).role, 'Wide');
  assert.ok(sheet.rows.every(row => catalog.presets.some(p => p.id === row.preset_id)));
  assert.ok(sheet.rows.every(row => /^Camera: .+; camera .+ at .+, to .+\.$/.test(row.camera_clause)));
  assert.match(A.markdown(sheet, catalog), /\| Camera clause \(draft\) \|/);
  assert.match(A.markdown(sheet, catalog), /tight source plate/);
  assert.deepEqual(source, before);
});

test('each scene needs a complete consecutive triplet, a Wide re-establish, and one full impact maximum', () => {
  const source = show(), sheet = build(source);
  const invalid = [
    rows => { rows.at(-1).role = 'Reaction'; },
    rows => { rows[3].scene_id = 'scene-02'; },
    rows => { rows[2].triplet = 'T2'; },
    rows => { rows[1].fx = rows[2].fx = 'full'; },
    rows => { rows[1].shot_size = 'invented'; },
    rows => { rows[0].t_s = Infinity; },
  ];
  for (const change of invalid) { const candidate = clone(sheet); change(candidate.rows); assert.throws(() => A.validate(candidate, catalog)); }
  const rows = sheet.rows.map(clone);
  rows.slice(4).forEach(row => { row.scene_id = 'scene-02'; });
  // First scene has no Wide after its Reaction.
  assert.throws(() => A.validate({ ...sheet, rows }, catalog), /Wide re-establish/);
});

test('missing GO, stale board, unknown/missing preset and mismatched maps fail before mutation', () => {
  const source = show(), before = clone(source), data = input(source);
  for (const approval of [null, { ...data.approval, Decision: 'Rework' }, { ...data.approval, story_snapshot: 'stale' }]) assert.throws(() => A.build({ ...data, approval }, catalog), /Jack GO required/);
  for (const preset_id of ['wide_establish', 'invented', 'none']) assert.throws(() => build(source, { rows: [{ beat_id: source.atoms[0].id, preset_id }] }), /Missing camera preset/);
  const plan = A.author(build(source), catalog);
  const stale = clone(source); stale.atoms[1].label = 'new story';
  assert.throws(() => A.apply(stale, plan, catalog), /Story changed/);
  for (const change of [p => p.shots[0].camera.preset = 'low_hold', p => p.shots[1].beat_id = 'missing', p => p.shots[0].camera_clause = 'stale clause']) {
    const candidate = clone(plan); change(candidate); assert.throws(() => A.apply(source, candidate, catalog), /disagree/);
  }
  const missingCatalog = clone(catalog); missingCatalog.presets = missingCatalog.presets.filter(p => p.id !== plan.shots[0].camera.preset);
  assert.throws(() => A.apply(source, plan, missingCatalog), /Missing camera preset/);
  assert.deepEqual(source, before);
});

test('applying a map preserves current timing, plates, FX, locks and unrelated data; portable metadata remains editable', () => {
  const source = show(); source.costume_lock = { L: 'red', R: 'black' }; source.custom = { keep: true };
  const before = clone(source), plan = A.author(build(source), catalog);
  source.atoms[1].duration_s = 1.25; // Step 3 timing can evolve independently of the approved story.
  const next = A.apply(source, plan, catalog);
  assert.deepEqual(source.atoms[0], before.atoms[0]);
  for (const key of ['chars', 'bg', 'costume_lock', 'custom', 'meta']) assert.deepEqual(next[key], source[key]);
  next.atoms.forEach((atom, i) => {
    for (const key of ['duration_s', 'hero', 'fx_hooks', 'kind', 'plates_needed', 'pose_mode']) assert.deepEqual(atom[key], source.atoms[i][key]);
    assert.equal(atom.motion.beat_class, source.atoms[i].motion.beat_class);
    assert.equal(atom.camera_grammar.preset_id, undefined);
    assert.equal(atom.camera_grammar.camera_clause, undefined);
  });
  const reopened = clone(next), derived = A.fromShow(reopened, catalog);
  assert.equal(HMMotionSot.sameSot(next, reopened), true);
  assert.equal(derived.fight_meta['Duration (s)'], 11.25);
  assert.equal(derived.rows[2].t_s, 2.25);
  assert.equal(derived.rows[1].preset_id, next.atoms[1].camera.preset);
  reopened.atoms[1].camera_grammar.purpose = 'hold the opening on screen';
  assert.equal(HMMotionSot.sameSot(next, reopened), false, 'planning edits participate in portable source-of-truth comparisons');
  assert.match(A.fromShow(reopened, catalog).rows[1].camera_clause, /hold the opening on screen/);
  reopened.atoms[1].motion.beat_class = 'different-story';
  assert.throws(() => A.fromShow(reopened, catalog), /Story changed/);
});

test('manual preset overrides regenerate angle, move and direction in clauses from the actual catalog', () => {
  const next = A.apply(show(), A.author(build(), catalog), catalog);
  const atom = next.atoms[1];
  atom.camera_grammar.direction = 'old direction'; atom.camera_grammar.speed = 'old speed';
  atom.camera = { preset: 'slide_left' };
  const row = A.fromShow(next, catalog).rows[1];
  assert.equal(row.preset_id, 'slide_left');
  assert.match(row.camera_clause, /eye level.*camera tracks left/);
  assert.doesNotMatch(row.camera_clause, /old direction|old speed|holds/);
  assert.equal(A.author(A.fromShow(next, catalog), catalog).shots[1].camera.preset, 'slide_left');
  for (const preset of catalog.presets) assert.ok(A.presetFor(preset.id, catalog));
  atom.camera.segments = [{ preset: 'slide_left' }, { preset: 'slow_push' }];
  assert.throws(() => A.fromShow(next, catalog), /one preset per beat/);
});

test('chain from first normalizes framing, keeps unselected clips and produces continuous rendered camera cuts with snap/ease', async () => {
  for (const ease of [undefined, 'snap', 'smooth']) {
    const source = show(); source.atoms[0].camera = { preset: 'slow_push', nudge: { x: 13, y: -5, r: 2, s: 0.04 }, intensity: 1.2 };
    source.atoms[1].camera.nudge = { x: -200, y: 90 }; source.atoms[2].camera.intensity = 0.1;
    const before = clone(source), result = A.chainFromFirst(source, [0, 1, 2], catalog, ease);
    assert.deepEqual(source, before); assert.deepEqual(result.show.atoms.slice(3), source.atoms.slice(3));
    assert.equal(result.info.preset, 'slow_push');
    assert.deepEqual(result.show.atoms[1].camera.nudge, source.atoms[0].camera.nudge);
    const composed = await compose(clone(result.show)); assert.equal(composed.ok, true);
    for (const cut of [1, 2]) {
      const left = C.inspectAt(composed, cut - 1e-5).cam_pose, right = C.inspectAt(composed, cut).cam_pose;
      for (const key of ['x', 'y', 's', 'r']) assert.ok(Math.abs(left[key] - right[key]) < 1e-3, key + ' continuity');
    }
    const segment = composed.timeline.atoms[1].cam[0];
    const engine = C.poseOnSegment(segment, 1.4), preview = cameraPoseOnSegment(segment, 1.4);
    for (const key of ['x', 'y', 's', 'r']) assert.equal(engine[key], preview[key]);
    if (ease === 'snap') assert.equal(segment.snap_zoom, true);
  }
  for (const indices of [[0], [0, 2], [1, 0], [0, 0], [9, 10, 11]]) assert.throws(() => A.chainFromFirst(show(), indices, catalog), /adjacent/);
});

test('CLI grammar → strict camera map and clauses; invalid input and existing destinations produce no partial output', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-camera-'));
  try {
    const board = path.join(dir, 'input.json'), grammar = path.join(dir, 'grammar.json'), md = path.join(dir, 'sheet.md'), map = path.join(dir, 'map.json'), clauses = path.join(dir, 'clauses.txt');
    fs.writeFileSync(board, JSON.stringify(input()));
    const run = (script, args) => spawnSync(process.execPath, ['skills/' + script, ...args], { encoding: 'utf8' });
    assert.equal(run('hm-cam-grammar-scene/scripts/grammar.cjs', ['--board', board, '--out', grammar, '--markdown', md]).status, 0);
    assert.equal(run('hm-cam-shot-author/scripts/author.cjs', ['--grammar', grammar, '--out', map, '--clauses', clauses]).status, 0);
    assert.equal(JSON.parse(fs.readFileSync(map)).shots.length, 11);
    assert.equal((fs.readFileSync(clauses, 'utf8').match(/Camera:/g) || []).length, 11);
    const noPartial = path.join(dir, 'no-partial.json');
    assert.notEqual(run('hm-cam-grammar-scene/scripts/grammar.cjs', ['--board', board, '--out', noPartial, '--markdown', md]).status, 0);
    assert.equal(fs.existsSync(noPartial), false);
    const invalid = JSON.parse(fs.readFileSync(grammar)); invalid.rows[0].preset_id = 'wide_invented'; fs.writeFileSync(grammar, JSON.stringify(invalid));
    assert.notEqual(run('hm-cam-shot-author/scripts/author.cjs', ['--grammar', grammar, '--out', noPartial]).status, 0);
    assert.equal(fs.existsSync(noPartial), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

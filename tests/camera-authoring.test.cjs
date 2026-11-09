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

test('HM-PF-20 (#100): Wide re-establish beat picker uses best available establish preset without wide_* curves and grammar lint warns on zero Wide', async () => {
  assert.deepEqual(A.wideEstablishPresets(catalog), ['eye_orbit', 'low_rise', 'pull_aftermath', 'static_hold']);
  assert.equal(A.widePresetFor(catalog, { mode: 'reestablish' }), 'eye_orbit');
  assert.equal(A.widePresetFor(catalog, { mode: 'open' }), 'low_rise');
  const trimmedCatalog = clone(catalog);
  trimmedCatalog.presets = trimmedCatalog.presets.filter(p => p.id !== 'eye_orbit');
  assert.equal(A.widePresetFor(trimmedCatalog, { mode: 'reestablish' }), 'low_rise', 'falls back to next available establish preset');
  assert.throws(() => A.widePresetFor(catalog, { preset_id: 'wide_establish' }), /Missing camera preset/);
  assert.throws(() => A.insertWideBeat(show(), 0, catalog, { preset_id: 'wide_reestablish' }), /Missing camera preset/);

  // Scene with zero Wide beats emits soft grammar lint warning and never blocks bake
  const noWide = show();
  noWide.atoms.forEach(a => {
    if (a.grammar_role === 'Wide') {
      a.grammar_role = 'Reaction';
      a.motion.grammar_role = 'Reaction';
    }
  });
  const lintZeroWide = C.lintShow(noWide, { cameraPresets: catalog, fxPresets: read('presets/fx_presets.json') });
  assert.equal(lintZeroWide.blocksBake, false);
  const wideWarn = lintZeroWide.findings.find(f => f.code === 'scene_missing_wide');
  assert.ok(wideWarn, 'expected scene_missing_wide finding when scene has zero Wide');
  assert.match(wideWarn.message, /zero Wide/i);
  assert.ok(wideWarn.fix.startsWith('Fix: ') && wideWarn.fix.endsWith('.'));
  assert.equal(A.lintGrammar(noWide).count, 1);

  // One-click markWideBeat restores Wide coverage on selected beat using eye_orbit
  const marked = A.markWideBeat(noWide, noWide.atoms.length - 1, catalog);
  assert.equal(marked.preset_id, 'eye_orbit');
  assert.equal(marked.atom.grammar_role, 'Wide');
  assert.equal(marked.atom.camera.preset, 'eye_orbit');
  assert.equal(marked.atom.camera_grammar.role, 'Wide');
  assert.equal(marked.atom.camera_grammar.shot_size, 'WS');
  assert.equal(A.lintGrammar(marked.show).clean, true);

  // One-click insertWideBeat inserts a Wide-tagged atom after the triplet using HM-CAM-GRAMMAR-STARTER convention
  const insertedFromIntent = A.insertWideBeat(noWide, 1, catalog);
  assert.equal(insertedFromIntent.index, 4, 'inserting from Intent beat places Wide re-establish right after the triplet Reaction');
  assert.equal(insertedFromIntent.atom.id, 'wide_reestablish_eye_orbit_2');
  assert.equal(insertedFromIntent.atom.label, 'Wide · eye_orbit');
  assert.equal(insertedFromIntent.atom.grammar_role, 'Wide');
  assert.equal(insertedFromIntent.atom.motion.grammar_role, 'Wide');
  assert.equal(insertedFromIntent.atom.camera.preset, 'eye_orbit');
  assert.equal(insertedFromIntent.atom.camera.preset.startsWith('wide_'), false);
  assert.equal(A.lintGrammar(insertedFromIntent.show).clean, true);
  const composedInserted = await compose(insertedFromIntent.show);
  assert.equal(composedInserted.ok, true);
});

test('HM-PF-21 (#101): Camera: clause export in text/JSON matches fight-prompting REPORT conventions and round-trips into skill inputs', () => {
  const source = show(), sheet = build(source);
  const pack = A.clauseMap(sheet, catalog);
  const txt = A.clausesText(sheet, catalog);
  assert.equal(pack.kind, 'hm-camera-clauses');
  assert.equal(pack.version, 1);
  assert.equal(pack.report_convention, 'fight-prompting-enhancements-2026-11-01');
  assert.equal(Object.keys(pack.clauses).length, 11);
  for (const row of sheet.rows) {
    assert.equal(pack.clauses[row.beat_id], row.camera_clause);
    const parsed = A.parseClause(pack.clauses[row.beat_id]);
    assert.equal(parsed.shot_size, row.shot_size);
    assert.equal(parsed.lens_mm, row.lens_mm);
    assert.equal(parsed.direction, row.direction);
    assert.equal(parsed.speed, row.speed);
    assert.equal(parsed.purpose, row.purpose);
  }

  // Edit a clause purpose & lens in exported JSON and round-trip into build, author, apply, and CLI scripts
  const editedPack = clone(pack);
  editedPack.clauses.t1_action_eye_push = editedPack.clauses.t1_action_eye_push
    .replace('85mm', '50mm')
    .replace('to follow the committed action.', 'to frame the lead straight for plate prompting.');
  const rebuilt = A.build(input(source), catalog, { design: editedPack });
  assert.equal(rebuilt.rows[2].lens_mm, '50mm');
  assert.equal(rebuilt.rows[2].purpose, 'frame the lead straight for plate prompting');
  const appliedFromPack = A.apply(source, editedPack, catalog);
  assert.equal(appliedFromPack.atoms[2].camera_grammar.lens_mm, '50mm');
  assert.equal(appliedFromPack.atoms[2].camera_grammar.purpose, 'frame the lead straight for plate prompting');

  // Round-trip text clauses into build
  const editedTxt = txt.replaceAll('to re-establish both fighters and the geography.', 'to re-establish rooftop spacing after the exchange.');
  const rebuiltFromTxt = A.build(input(source), catalog, { design: editedTxt });
  assert.equal(rebuiltFromTxt.rows.at(-1).purpose, 're-establish rooftop spacing after the exchange');

  // CLI round-trip with --clauses-json and --design
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-clauses-'));
  try {
    const boardFile = path.join(dir, 'input.json');
    const grammar1 = path.join(dir, 'grammar1.json');
    const map1 = path.join(dir, 'map1.json');
    const clausesTxtFile = path.join(dir, 'clauses.txt');
    const clausesJsonFile = path.join(dir, 'clauses.json');
    const grammar2 = path.join(dir, 'grammar2.json');
    const map2 = path.join(dir, 'map2.json');
    fs.writeFileSync(boardFile, JSON.stringify(input(source)));
    const run = (script, args) => spawnSync(process.execPath, ['skills/' + script, ...args], { encoding: 'utf8' });
    assert.equal(run('hm-cam-grammar-scene/scripts/grammar.cjs', ['--board', boardFile, '--out', grammar1]).status, 0);
    assert.equal(run('hm-cam-shot-author/scripts/author.cjs', ['--grammar', grammar1, '--out', map1, '--clauses', clausesTxtFile, '--clauses-json', clausesJsonFile]).status, 0);
    const onDiskPack = JSON.parse(fs.readFileSync(clausesJsonFile, 'utf8'));
    assert.equal(onDiskPack.kind, 'hm-camera-clauses');
    assert.equal(Object.keys(onDiskPack.clauses).length, 11);
    assert.equal(run('hm-cam-grammar-scene/scripts/grammar.cjs', ['--board', boardFile, '--design', clausesJsonFile, '--out', grammar2]).status, 0);
    assert.equal(run('hm-cam-shot-author/scripts/author.cjs', ['--grammar', clausesJsonFile, '--out', map2]).status, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(map2, 'utf8')).shots, JSON.parse(fs.readFileSync(map1, 'utf8')).shots);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('HM-PF-22 (#102): Rooftop cam-grammar golden show is documented as step 4-5 proof film and composes FE-only with grammar-true presets', async () => {
  const golden = show();
  assert.equal(golden.show_id, 'fight-cam-grammar-starter');
  assert.equal(golden.bg.base, 'assets/daiyu-wang-continuation/rooftop-dusk.png');
  assert.deepEqual(
    golden.atoms.map(a => a.camera.preset),
    ['low_rise', 'ots_L_hold', 'eye_push', 'ots_R_hold', 'eye_lateral', 'whip_A_to_B', 'ecu_jitter', 'eye_hold', 'ecu_fist_lens', 'pull_aftermath', 'eye_orbit']
  );
  assert.equal(golden.atoms.some(a => a.camera.preset.startsWith('wide_')), false);
  const lint = C.lintShow(golden, { cameraPresets: catalog, fxPresets: read('presets/fx_presets.json') });
  assert.equal(lint.clean, true);
  const composed = await compose(golden);
  assert.equal(composed.ok, true);
  assert.equal(composed.duration_s, 11);
  const doc = fs.readFileSync('docs/product-flow/HM-PF-22-rooftop-golden-show.md', 'utf8');
  assert.match(doc, /Step 4–5 proof film/);
  assert.match(doc, /fight-daiyu-wang-rooftop-camera-grammar-2026-11-01/);
});

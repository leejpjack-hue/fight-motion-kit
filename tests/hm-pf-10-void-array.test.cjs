const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
require('../public/ui/compose-client.js');

const SOURCE = '/workspace/deliverables/fight-baijia-elfmage-void-array-2026-11-06/STORYBOARD-zh.md';
const BOARD_SHA = 'ad8bbf264bf2decaff7d527809608eb4b4998fc0dbe4d643fb61659da26ef3a7';
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

function boardRows(show) {
  return show.atoms.map((a) => [a.id, a.duration_s, a.camera.preset, a.label, a.source_refs.join(',')].join('|')).join('\n');
}

test('void-array golden template loads the 30s Cantonese board and composes without a backend', async () => {
  const show = read('public/shows/baijia-elfmage-void-array.json');
  const kit = read('kit/shows/baijia-elfmage-void-array.json');
  const tpl = read('public/templates/baijia-elfmage-void-array.json');
  const kitTpl = read('kit/templates/baijia-elfmage-void-array.json');
  const catalog = read('public/catalog.json');
  const kitCatalog = read('kit/catalog.json');
  const cams = new Set(read('public/presets/camera_presets.json').presets.map((p) => p.id));
  assert.deepEqual(kit, show);
  assert.deepEqual(kitTpl, tpl);
  assert.equal(show.show_id, 'baijia-elfmage-void-array');
  assert.equal(show.title, '白甲槍士 × 精靈法師 · 虛空法陣 30s');
  assert.equal(show.duration_target_s, 30);
  assert.equal(show.atoms.length, 47);
  assert.equal(show.board.kind, 'hm-pf-08-board');
  assert.equal(show.board.language, 'yue');
  assert.equal(show.board.source_label, 'Cantonese board');
  assert.equal(show.board.source_path, SOURCE);
  assert.equal(show.meta.cantonese_board_source, SOURCE);
  assert.equal(tpl.kind, 'show_template');
  assert.equal(tpl.label, 'Void-array golden story');
  assert.equal(tpl.seed_show, 'shows/baijia-elfmage-void-array.json');
  assert.equal(tpl.board_source_path, SOURCE);
  assert.match(tpl.description, /Cantonese board source: \/workspace\/deliverables\/fight-baijia-elfmage-void-array-2026-11-06\/STORYBOARD-zh\.md/);
  assert.ok(catalog.templates.some((t) => t.id === 'baijia-elfmage-void-array' && t.seed_show === tpl.seed_show && t.board_source_path === SOURCE));
  assert.ok(kitCatalog.templates.some((t) => t.id === 'baijia-elfmage-void-array' && t.seed_show === tpl.seed_show));
  assert.ok(catalog.shows.some((s) => s.path === tpl.seed_show && s.show.show_id === show.show_id && s.show.board.source_path === SOURCE));
  const five = read('public/shows/daiyu-wang-five-seconds.json');
  assert.equal(five.show_id, 'daiyu-wang-five-seconds');
  assert.equal(five.atoms.length, 8);
  assert.equal(five.atoms.reduce((s, a) => s + a.duration_s, 0), 5);

  const ids = new Set();
  let total = 0;
  show.atoms.forEach((atom, index) => {
    assert.equal(ids.has(atom.id), false, atom.id);
    ids.add(atom.id);
    assert.equal(atom.beat_id, atom.id);
    assert.equal(atom.pose_mode, 'hero');
    assert.equal(atom.plates_needed, 1);
    assert.equal(atom.hero.plates.length, 1);
    assert.equal(cams.has(atom.camera.preset), true, atom.camera.preset);
    assert.match(atom.label, /^P\d{2} /);
    assert.equal(show.board.beats[index].beat_id, atom.id);
    assert.equal(show.board.beats[index].label, atom.label);
    assert.equal(show.board.beats[index].duration_s, atom.duration_s);
    total += atom.duration_s;
    const blob = JSON.stringify(atom);
    assert.equal(/teqcon|:8770|\/api\//.test(blob), false);
  });
  assert.equal(Math.round(total * 10000) / 10000, 30);
  assert.equal(show.atoms[0].id, 'va_p01');
  assert.equal(show.atoms[0].label, 'P01 廣角建立');
  assert.equal(show.atoms[0].duration_s, 1);
  assert.equal(show.atoms[0].camera.preset, 'eye_push');
  assert.equal(show.atoms[2].id, 'va_p03');
  assert.equal(show.atoms[2].label, 'P03 槍士蓄力');
  assert.equal(show.atoms[2].source_refs[0], 's1_f00');
  assert.ok(show.atoms[2].source_refs.length > 1);
  assert.equal(show.atoms[42].label, 'P43 寸止定格');
  assert.equal(show.atoms[42].duration_s, 1.5);
  assert.equal(show.atoms.at(-1).id, 'va_p47');
  assert.equal(show.atoms.at(-1).label, 'P47 停推漸黑');
  assert.equal(show.atoms.at(-1).camera.preset, 'pull_aftermath');
  const digest = crypto.createHash('sha256').update(boardRows(show)).digest('hex');
  assert.equal(digest, BOARD_SHA);

  const layout = read('public/' + show.atoms[0].hero.layout_source);
  for (const atom of show.atoms) {
    const plate = atom.hero.plates[0];
    assert.ok(layout[plate], plate);
    assert.equal(fs.existsSync('public/assets/baijia-elfmage-void-array/' + layout[plate].full), true);
  }
  assert.equal(fs.existsSync('public/' + show.bg.base), true);
  const png = fs.readFileSync('public/' + show.bg.base);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');

  const bridge = HMComposeClient.applyBoardToShow(show, show.board);
  assert.equal(bridge.ok, true, JSON.stringify(bridge.conflicts || bridge));
  const round = HMComposeClient.roundTripBoard(show, show.board);
  assert.equal(round.ok, true, JSON.stringify(round.conflicts || round));
  const composed = await HMComposeClient.composeShow(show, {
    cameraPresets: read('public/presets/camera_presets.json'),
    fxPresets: read('public/presets/fx_presets.json'),
    loadJson: async (p) => read('public/' + p),
  });
  assert.equal(composed.ok, true, JSON.stringify(composed.errors));
  assert.equal(composed.duration_s, 30);
  assert.equal(composed.timeline.plates.length, 47);
  assert.equal(JSON.stringify(composed).includes('teqcon.uk'), false);
  assert.equal(JSON.stringify(composed).includes(':8770'), false);
});

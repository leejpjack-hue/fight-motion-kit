const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
require('../public/ui/timeline-json.js');

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const demo = read('public/shows/daiyu-wang-five-seconds.json');

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(String(key), String(value)); },
  };
}

function startOf(atoms, index) {
  return atoms.slice(0, index).reduce((sum, atom) => sum + atom.duration_s, 0);
}

test('dump abs times match the scrub prefix-sum clock', () => {
  const before = JSON.stringify(demo.atoms);
  const dump = HMTimelineJson.dump(demo.atoms, { show_id: demo.show_id });
  assert.equal(JSON.stringify(demo.atoms), before);
  assert.equal(dump.clock, 'prefix-sum duration_s');
  assert.equal(dump.show_id, 'daiyu-wang-five-seconds');
  assert.equal(dump.atom_count, demo.atoms.length);
  assert.ok(dump.atom_count >= 2);
  let end = 0;
  demo.atoms.forEach((atom, index) => {
    const row = dump.atoms[index];
    assert.equal(row.id, atom.id);
    assert.equal(row.index, index);
    assert.equal(row.abs_start, startOf(demo.atoms, index));
    end = startOf(demo.atoms, index) + atom.duration_s;
    assert.equal(row.abs_end, end);
    assert.equal(row.camera_preset, atom.camera.preset);
    assert.deepEqual(row.fx_hooks, (atom.fx_hooks || []).map((hook) => hook.type || hook));
    assert.deepEqual(row.plate_keys, atom.hero.plates);
  });
  assert.equal(dump.duration_s, end);
  assert.equal(dump.atoms[0].abs_start, 0);
  assert.equal(dump.atoms[0].abs_end, 0.5);
  assert.equal(dump.atoms[0].camera_preset, 'static_hold');
  assert.deepEqual(dump.atoms[0].fx_hooks, ['shake']);
  assert.deepEqual(dump.atoms[0].plate_keys, ['P01']);
  assert.equal(dump.atoms[1].abs_start, 0.5);
  assert.equal(dump.atoms[1].abs_end, 1);
  assert.deepEqual(dump.atoms[1].plate_keys, ['P02']);
});

test('copy payload is the atoms slice and an empty show still serializes', () => {
  const dump = HMTimelineJson.dump(demo.atoms, { show_id: demo.show_id });
  const parsed = JSON.parse(HMTimelineJson.serialize(dump));
  assert.equal(parsed.atom_count, demo.atoms.length);
  assert.ok(Array.isArray(parsed.atoms));
  assert.equal(parsed.atoms[0].id, 'beat-01');
  assert.equal(Object.hasOwn(parsed, 'media'), false);
  const empty = HMTimelineJson.dump([], { show_id: 'blank' });
  const emptyParsed = JSON.parse(HMTimelineJson.serialize(empty));
  assert.equal(emptyParsed.atom_count, 0);
  assert.deepEqual(emptyParsed.atoms, []);
  assert.equal(emptyParsed.duration_s, 0);
  assert.equal(HMTimelineJson.diff([], null).status, 'no prior save');
  assert.equal(HMTimelineJson.diffStatusText(HMTimelineJson.diff([], null)), 'no prior save');
});

test('missing save, bad save, and a real snapshot diff are read-only', () => {
  const storage = memoryStorage();
  assert.equal(HMTimelineJson.readSave(storage, demo.show_id), null);
  storage.setItem(HMTimelineJson.saveKey(demo.show_id), '{not json');
  assert.equal(HMTimelineJson.readSave(storage, demo.show_id), null);
  assert.equal(HMTimelineJson.diff(demo.atoms, null).status, 'no prior save');
  assert.equal(HMTimelineJson.diff(demo.atoms, {}).status, 'no prior save');
  assert.equal(HMTimelineJson.diff(demo.atoms, { atoms: 'nope' }).status, 'no prior save');

  const current = JSON.parse(JSON.stringify(demo.atoms));
  const before = JSON.stringify(current);
  const saved = JSON.parse(JSON.stringify(demo));
  saved.atoms[0].camera.preset = 'slow_push';
  saved.atoms[0].fx_hooks = [{ type: 'hit_pink', t_rel: 0.08 }];
  saved.atoms[0].hero.plates = ['P09'];
  saved.atoms[1].duration_s = 1;
  const result = HMTimelineJson.diff(current, saved);
  assert.equal(JSON.stringify(current), before);
  assert.equal(result.status, 'changed');
  const first = result.changed.find((row) => row.id === 'beat-01');
  assert.ok(first.fields.includes('camera_preset'));
  assert.ok(first.fields.includes('fx_hooks'));
  assert.ok(first.fields.includes('plate_keys'));
  const second = result.changed.find((row) => row.id === 'beat-02');
  assert.ok(second.fields.includes('time'));
  assert.match(HMTimelineJson.diffStatusText(result), /beat-01/);
  assert.equal(HMTimelineJson.diff(demo.atoms, { show: demo }).status, 'unchanged');
  assert.equal(HMTimelineJson.diffStatusText(HMTimelineJson.diff(demo.atoms, demo)), 'Matches last save');
});

test('explicit save snapshot round-trips and does not replace a missing save with an empty write', () => {
  const storage = memoryStorage();
  const payload = HMTimelineJson.writeSave(storage, demo);
  assert.equal(payload.show_id, demo.show_id);
  assert.equal(payload.atoms.length, demo.atoms.length);
  payload.atoms[0].camera.preset = 'mutated';
  const read = HMTimelineJson.readSave(storage, demo.show_id);
  assert.equal(read.atoms[0].camera.preset, 'static_hold');
  const prior = HMTimelineJson.readPrior(storage, demo.show_id, null);
  assert.equal(HMTimelineJson.diff(demo.atoms, prior).status, 'unchanged');
  const other = HMTimelineJson.readPrior(storage, 'missing-show', { show_id: 'missing-show', atoms: demo.atoms.slice(0, 1) });
  assert.equal(other.via, 'local-show');
  assert.equal(HMTimelineJson.diff(demo.atoms, other).added.length > 0 || HMTimelineJson.diff(demo.atoms, other).status === 'changed', true);
  assert.equal(HMTimelineJson.readPrior(storage, 'none', null), null);
});

test('string hooks and segment presets still dump', () => {
  const dump = HMTimelineJson.dump([
    { id: 'a', duration_s: 0.25, camera: { segments: [{ preset: 'low_rise' }, { preset: 'eye_push' }] }, fx_hooks: ['hit_orange'], hero: { plates: ['P03'] } },
    { duration_s: '0.25', camera: 'static_hold' },
  ]);
  assert.equal(dump.atoms[0].camera_preset, 'low_rise+eye_push');
  assert.deepEqual(dump.atoms[0].fx_hooks, ['hit_orange']);
  assert.deepEqual(dump.atoms[0].plate_keys, ['P03']);
  assert.equal(dump.atoms[1].id, '1');
  assert.equal(dump.atoms[1].abs_start, 0.25);
  assert.equal(dump.atoms[1].abs_end, 0.5);
  assert.equal(dump.atoms[1].camera_preset, 'static_hold');
  assert.deepEqual(dump.atoms[1].fx_hooks, []);
  assert.deepEqual(dump.atoms[1].plate_keys, []);
});

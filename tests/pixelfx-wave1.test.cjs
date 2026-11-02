const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const IDS = [
  'impacts/hit-spark',
  'impacts/blunt-hit',
  'impacts/crit-hit',
  'impacts/hit-flash',
  'impacts/impact-frame',
  'impacts/parry',
  'impacts/ground-slam',
  'impacts/heavy-landing',
  'melee/uppercut',
  'explosions/cartoon-pow',
  'explosions/dirt-explosion',
  'explosions/smoke-bomb',
];

test('vendored wave 1 modules match the preset rows and paint pixels', async () => {
  const rows = JSON.parse(fs.readFileSync('public/presets/pixelfx_wave1.json', 'utf8'));
  const kit = JSON.parse(fs.readFileSync('kit/presets/pixelfx_wave1.json', 'utf8'));
  assert.deepEqual(kit, rows);
  assert.deepEqual(rows.map(row => row.id), IDS);
  for (const row of rows) {
    assert.equal(typeof row.role, 'string');
    assert.equal(typeof row.label, 'string');
    assert.equal(typeof row.notes, 'string');
    assert.ok(row.label.length > 0);
    assert.ok(row.notes.length > 0);
  }
  const root = 'public/vendor/pixelfx';
  for (const id of IDS) {
    const file = root + '/src/fx/' + id + '.js';
    assert.equal(fs.existsSync(file), true, file);
  }
  assert.equal(fs.existsSync(root + '/src/core/fx.js'), true);
  assert.equal(fs.existsSync(root + '/wave1.js'), true);
  assert.equal(fs.existsSync(root + '/wave1.global.js'), true);
  assert.match(fs.readFileSync(root + '/SOURCE.txt', 'utf8'), /679844a6e45b7dbdc4b3d1f76f2dd0fdcc2bc892/);
  const bundle = fs.readFileSync(root + '/wave1.global.js', 'utf8');
  for (const id of IDS) assert.match(bundle, new RegExp(id.replace('/', '\\/')));

  const { raster, IDS: exported } = await import('../public/vendor/pixelfx/wave1.js');
  assert.deepEqual(exported, IDS);
  const drawn = [];
  const missed = [];
  for (const id of IDS) {
    const sample = [0.08, 0.16, 0.2].map(t => raster(id, t));
    const best = sample.reduce((a, b) => (b.opaque > a.opaque ? b : a));
    if (best.opaque > 8) drawn.push({ id, pixels: best.opaque });
    else missed.push({ id, pixels: best.opaque });
  }
  assert.ok(drawn.length >= 10, 'drew ' + drawn.length + ' missed ' + JSON.stringify(missed));
  assert.deepEqual(missed, []);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('../public/ui/compose-client.js');
require('../public/ui/motion-renderer.js');
const { authorBackgroundScene } = require('../skills/hm-bg-scene-author/scripts/author.cjs');
const C = HMComposeClient;

const repo = path.join(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(repo, rel), 'utf8'));
const street = () => read('public/shows/street-old-city.json');
const demoPath = path.join(repo, 'public/shows/daiyu-wang-five-seconds.json');
const place = 'pf31-zephyr-court';
const compose = show => C.composeShow(show, {
  cameraPresets: read('public/presets/camera_presets.json'),
  fxPresets: read('public/presets/fx_presets.json'),
  loadJson: async rel => read('public/' + rel),
});

test('a scene place stamps crop, show-clock pan, and motion into a portable project', async () => {
  const source = street();
  const before = await compose(source);
  assert.equal(before.ok, true);
  const plateTimes = before.timeline.plates.map(plate => [plate.t0, plate.t1]);
  const stamped = authorBackgroundScene(source, { place });
  assert.equal(JSON.stringify(stamped).includes(place), false);
  assert.equal(stamped.version, 1);
  assert.deepEqual(stamped.show.atoms, source.atoms);
  assert.deepEqual(stamped.show.bg.crops.base, { x: 0, y: 0.15, w: 0.7, h: 0.7 });
  assert.deepEqual(stamped.show.bg.motion, { preset: 'pan_right', amount: 0.4, clock: 'show' });
  assert.equal(stamped.show.bg.base, source.bg.base);
  assert.deepEqual(Object.keys(stamped.show.bg).sort(), ['base', 'crops', 'motion']);
  const after = await compose(stamped.show);
  assert.equal(after.ok, true);
  assert.equal(after.duration_s, before.duration_s);
  assert.deepEqual(after.timeline.plates.map(plate => [plate.t0, plate.t1]), plateTimes);
  assert.deepEqual(after.timeline.bg.crops.base, stamped.show.bg.crops.base);
  assert.deepEqual(after.timeline.bg.motion, stamped.show.bg.motion);
  const crop = stamped.show.bg.crops.base;
  const x0 = backgroundMotionFrame(crop, 'pan_right', 0.4, 0).crop.x;
  const x1 = backgroundMotionFrame(crop, 'pan_right', 0.4, 1).crop.x;
  assert.ok(x1 > x0);
  const ui = C.resolveBackgroundSpanUi(stamped.show.bg.motion, after.duration_s, null);
  assert.equal(ui.clock, 'show');
  assert.equal(ui.continuous, true);
  assert.equal(ui.authored, false);
  assert.deepEqual(C.resolveBackgroundCrop({ bg: 'base' }, after.timeline.bg), crop);
  assert.deepEqual(source, street());
});

test('preset, clock, crop, and a portable wrapper stay on the existing fields', () => {
  const source = street();
  const left = authorBackgroundScene(source, { place, preset: 'pan_left' });
  assert.deepEqual(left.show.bg.crops.base, { x: 0.3, y: 0.15, w: 0.7, h: 0.7 });
  assert.equal(left.show.bg.motion.clock, 'show');
  const held = authorBackgroundScene(source, { place, preset: 'static', clock: 'per_atom' });
  assert.deepEqual(held.show.bg.crops.base, { x: 0.15, y: 0.15, w: 0.7, h: 0.7 });
  assert.deepEqual(held.show.bg.motion, { preset: 'static', amount: 0.4 });
  const clipClock = authorBackgroundScene(source, { place, clock: 'per_atom', amount: 1 });
  assert.deepEqual(clipClock.show.bg.motion, { preset: 'pan_right', amount: 1, clock: 'per_atom' });
  const crop = { x: 0.1, y: 0.2, w: 0.4, h: 0.4 };
  const explicit = authorBackgroundScene(source, { place, crop, preset: 'pan_down', amount: 0.2 });
  assert.deepEqual(explicit.show.bg.crops.base, crop);
  assert.deepEqual(explicit.show.bg.motion, { preset: 'pan_down', amount: 0.2, clock: 'show' });
  const wrapped = authorBackgroundScene({ version: 1, show: source, layouts: { keep: true }, media: [], assets: { keep: true } }, { place });
  assert.equal(wrapped.layouts.keep, true);
  assert.equal(wrapped.assets.keep, true);
  assert.equal(wrapped.show.bg.motion.preset, 'pan_right');
});

test('missing place, missing image, bad crop, span, and an existing edit fail without mutation', () => {
  const source = street();
  const before = JSON.parse(JSON.stringify(source));
  assert.throws(() => authorBackgroundScene(source, {}), /scene place/);
  assert.throws(() => authorBackgroundScene(read('public/shows/daiyu-wang-five-seconds.json'), { place }), /background image/);
  assert.throws(() => authorBackgroundScene(source, { place, crop: { x: 0, y: 0, w: 1, h: 1 } }), /room in the source/);
  assert.throws(() => authorBackgroundScene(source, { place, crop: { x: 0, y: 0, w: 0.01, h: 0.5 } }), /Crop must/);
  assert.throws(() => authorBackgroundScene(source, { place, clock: 'span' }), /t0-t1 span/);
  assert.throws(() => authorBackgroundScene(source, { place, span: { t0: 0, t1: 1 } }), /t0-t1 span/);
  assert.throws(() => authorBackgroundScene(source, { place, preset: 'orbit' }), /Unknown background preset/);
  assert.throws(() => authorBackgroundScene(source, { place, amount: 2 }), /amount/);
  assert.throws(() => authorBackgroundScene(source, { place, layer: 'swap' }), /swap background image/);
  const cropped = street();
  cropped.bg.crops = { base: { x: 0.2, y: 0.2, w: 0.4, h: 0.4 } };
  assert.throws(() => authorBackgroundScene(cropped, { place }), /already has a crop/);
  const moving = street();
  moving.bg.motion = { preset: 'static', amount: 0 };
  assert.throws(() => authorBackgroundScene(moving, { place }), /already has background motion/);
  assert.deepEqual(source, before);
  assert.deepEqual(read('public/shows/daiyu-wang-five-seconds.json').bg, {});
});

test('CLI writes .motion.json once, leaves the show file, and rejects the five-second demo', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-pf-31-'));
  const projectFile = path.join(dir, 'street.json');
  const out = path.join(dir, 'street.motion.json');
  const source = street();
  const demoBefore = fs.readFileSync(demoPath);
  fs.writeFileSync(projectFile, JSON.stringify(source));
  const script = path.join(repo, 'skills/hm-bg-scene-author/scripts/author.cjs');
  const args = [script, '--project', projectFile, '--place', place, '--out', out];
  const ok = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  const written = fs.readFileSync(out, 'utf8');
  const parsed = JSON.parse(written);
  assert.equal(parsed.show.bg.motion.clock, 'show');
  assert.equal(parsed.show.bg.motion.preset, 'pan_right');
  assert.ok(parsed.show.bg.crops.base);
  assert.equal(written.includes(place), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(projectFile, 'utf8')), source);
  const again = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.notEqual(again.status, 0);
  assert.equal(fs.readFileSync(out, 'utf8'), written);
  const failed = path.join(dir, 'missing.motion.json');
  const denied = spawnSync(process.execPath, [script, '--project', demoPath, '--place', place, '--out', failed], { encoding: 'utf8' });
  assert.notEqual(denied.status, 0);
  assert.equal(fs.existsSync(failed), false);
  assert.deepEqual(fs.readFileSync(demoPath), demoBefore);
  fs.rmSync(dir, { recursive: true, force: true });
});

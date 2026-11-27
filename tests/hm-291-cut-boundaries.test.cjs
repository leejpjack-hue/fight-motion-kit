'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'public/ui/compose-client.js'));
require(path.join(ROOT, 'public/ui/motion-renderer.js'));
const X = require(path.join(ROOT, 'public/ui/x-export.js'));

function read(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'public', rel), 'utf8'));
}

function compose(show) {
  return HMComposeClient.composeShow(show, {
    cameraPresets: read('presets/camera_presets.json'),
    fxPresets: read('presets/fx_presets.json'),
    loadJson: async (p) => read(p),
  });
}

function cutShow() {
  const show = read('shows/daiyu-wang-five-seconds.json');
  const seed = show.atoms[0];
  seed.duration_s = 1.3;
  seed.plates_needed = 1;
  seed.fx_hooks = [];
  seed.camera = { preset: 'static_hold' };
  const [left, right] = HMComposeClient.splitAtomAt(seed, 0.85, 'beat-cut');
  right.hero = { layout_source: seed.hero.layout_source, plates: ['P02'] };
  show.atoms = [left, right];
  show.overlays = [];
  show.fg = {
    props: [{ id: 'prop-cut', src: 'fg.png', t_start: 0.85, t_end: 1.3, x: 80, y: 80 }],
  };
  show.bg = {
    key_white: false,
    locations: [
      { id: 'loc-a', src: 'a.png', t0: 0, t1: 0.85 },
      { id: 'loc-b', src: 'b.png', t0: 0.85, t1: 1.3 },
    ],
  };
  return { show, left, right };
}

test('#291 a trim or cut on character, foreground, and background is sampled at that timestamp', () => {
  const { show, left, right } = cutShow();
  const bounds = X.timelineBoundaries(show, 1.3);
  const aligned = X.alignExportFrames(X.framePlan(1.3, 30), bounds, 30);
  const character = aligned.checks.find(row => row.role === 'cut' && row.track === 'character');
  const fg = aligned.checks.find(row => row.role === 'cut' && row.track === 'fg' && row.edge === 'in');
  const bg = aligned.checks.find(row => row.role === 'cut' && row.track === 'bg' && row.id === 'loc-b');
  const start = aligned.checks.find(row => row.role === 'start');
  const end = aligned.checks.find(row => row.role === 'end');

  assert.equal(character.id, right.id);
  assert.equal(character.t, 0.85);
  assert.equal(character.sample_t, 0.85);
  assert.equal(character.matches_preview, true);
  assert.equal(character.frame_index, 25);
  assert.ok(Math.abs(character.frame_t - (25 / 30)) < 1e-9);
  assert.ok(Math.abs(character.sample_t - character.frame_t) > 0.01);
  assert.equal(fg.t, 0.85);
  assert.equal(fg.sample_t, 0.85);
  assert.equal(bg.t, 0.85);
  assert.equal(bg.sample_t, 0.85);
  assert.equal(start.t, 0);
  assert.equal(start.sample_t, 0);
  assert.equal(start.matches_preview, true);
  assert.equal(end.t, 1.3);
  assert.equal(end.sample_t, 1.3);
  assert.equal(end.frame_index, 38);
  assert.equal(end.matches_preview, true);
  assert.match(X.boundaryHonesty(aligned), /same time at start, cut, and end/);
  assert.match(X.boundaryHonesty(aligned), /0\.850s is frame 25/);
  assert.equal(left.duration_s, 0.85);
  assert.equal(right.duration_s, 0.45);
});

test('#291 the frame clock before an off-grid cut still shows the outgoing clip', async () => {
  const { show, left, right } = cutShow();
  const aligned = X.alignExportFrames(X.framePlan(1.3, 30), X.timelineBoundaries(show, 1.3), 30);
  const character = aligned.checks.find(row => row.role === 'cut' && row.track === 'character');
  const composed = await compose(show);
  assert.equal(composed.ok, true, JSON.stringify(composed.errors));
  const atCut = HMComposeClient.inspectAt(composed, character.sample_t);
  const atClock = HMComposeClient.inspectAt(composed, character.frame_t);
  const atStart = HMComposeClient.inspectAt(composed, 0);
  const atEnd = HMComposeClient.inspectAt(composed, 1.3);
  assert.equal(atCut.atom_id, right.id);
  assert.equal(atClock.atom_id, left.id);
  assert.equal(atStart.atom_id, left.id);
  assert.equal(atEnd.atom_id, right.id);
  const plate = composed.layout[atCut.plate_id];
  assert.equal(backgroundAt(plate, composed.timeline.bg, 0.84).src, 'a.png');
  assert.equal(backgroundAt(plate, composed.timeline.bg, 0.85).src, 'b.png');
  assert.equal(/\/api\/compose|api\.teqcon\.uk|:8770|wrangler deploy/.test(
    fs.readFileSync(path.join(ROOT, 'public/ui/x-export.js'), 'utf8')
    + fs.readFileSync(path.join(ROOT, 'public/ui/exports.js'), 'utf8')
  ), false);
});

test('#291 a background switch inside one plate follows the timeline cut', async () => {
  const show = read('shows/daiyu-wang-five-seconds.json');
  show.atoms = [show.atoms[0]];
  show.atoms[0].duration_s = 4;
  show.atoms[0].plates_needed = 1;
  show.atoms[0].fx_hooks = [];
  show.bg = {
    base: 'backgrounds/base.png',
    swap: 'backgrounds/swap.png',
    swap_t: 2,
    crops: {
      base: { x: 0, y: 0, w: 1, h: 1 },
      swap: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 },
    },
  };
  const composed = await compose(show);
  assert.equal(composed.ok, true, JSON.stringify(composed.errors));
  assert.equal(composed.timeline.plates.length, 1);
  assert.equal(backgroundAt(composed.layout.S001, composed.timeline.bg, 1.99).src, 'backgrounds/base.png');
  assert.equal(backgroundAt(composed.layout.S001, composed.timeline.bg, 2).src, 'backgrounds/swap.png');
  assert.deepEqual(backgroundAt(composed.layout.S001, composed.timeline.bg, 2).crop, { x: 0.2, y: 0.2, w: 0.5, h: 0.5 });
});

test('#291 one dropped frame is recorded and a shared frame is not called a match', () => {
  const one = X.cadenceTelemetry({
    durationS: 1,
    targetFps: 30,
    renderedFrames: 29,
    actualElapsedMs: 1000,
    mime: 'video/webm',
    width: 1280,
    height: 720,
    droppedIndexes: [14],
  });
  assert.equal(one.dropped_frames, 1);
  assert.equal(one.significant_drop, false);
  assert.deepEqual(one.dropped_indexes, [14]);
  assert.match(one.summary, /Dropped 1 of 30 frames/);
  assert.doesNotMatch(one.summary, /Cadence warning/);

  const show = read('shows/daiyu-wang-five-seconds.json');
  show.atoms = show.atoms.slice(0, 1);
  show.atoms[0].duration_s = 1;
  show.fg = { props: [{ id: 'early', src: 'fg.png', t_start: 0.01, t_end: 0.4 }] };
  const aligned = X.alignExportFrames(X.framePlan(1, 30), X.timelineBoundaries(show, 1), 30);
  const start = aligned.checks.find(row => row.role === 'start');
  assert.equal(start.matches_preview, false);
  assert.equal(start.sample_t, 0.01);
  assert.match(X.boundaryHonesty(aligned), /shares frame 0 sampled at 0\.010s/);
  assert.doesNotMatch(X.boundaryHonesty(aligned), /same time at start, cut, and end/);

  const receipt = X.buildExportReceipt({
    kind: 'video',
    filename: 'cut.webm',
    mime: 'video/webm',
    bytes: 128,
    preset: X.presetById('720p30'),
    width: 1280,
    height: 720,
    durationS: 1,
    showId: 'cut',
    droppedFrames: 1,
    expectedFrames: 30,
    boundaryNote: 'start 0.000s shares frame 0 sampled at 0.010s.',
  });
  assert.match(receipt.honestyNote, /Dropped 1 of 30 frames/);
  assert.match(receipt.honestyNote, /shares frame 0/);
  assert.match(receipt.honestyNote, /not universal/);
  assert.equal(receipt.dropped_frames, 1);
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

require('../public/ui/compose-client.js');
const TL = require('../public/ui/multi-track-timeline.js');

const html = fs.readFileSync('public/ui/index.html', 'utf8');
const app = fs.readFileSync('public/ui/app.js', 'utf8');
const rendererSrc = fs.readFileSync('public/ui/motion-renderer.js', 'utf8');

test('HM-TL-02: direct drag, trim, split, and preview-only track mute controls exist and exports stay unmuted', () => {
  for (const id of ['trackAddFg', 'trackMuteFg', 'trackSplitBg', 'trackMuteBg']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing #' + id);
  }
  assert.match(app, /function setTrackMute/);
  assert.match(app, /muteBg:!exportBake&&trackMute\.bg/);
  assert.match(app, /muteFg:!exportBake&&trackMute\.fg/);
  assert.match(rendererSrc, /activeMuteBg = !!opts\.muteBg/);
  assert.match(rendererSrc, /activeMuteFg = !!opts\.muteFg/);
});

test('HM-TL-02: FG move/trim clamps cleanly without crossing bounds or mutating min duration', () => {
  const prop = { id: 'p1', t_start: 1.0, t_end: 2.5 };
  assert.deepEqual(TL.clampFgWindowMove(prop, 10, 5), { t_start: 3.5, t_end: 5 });
  assert.deepEqual(TL.clampFgWindowMove(prop, -5, 5), { t_start: 0, t_end: 1.5 });

  assert.deepEqual(TL.clampFgWindowTrim(prop, 'left', 2.48, 5, 0.1), { t_start: 2.4, t_end: 2.5 });
  assert.deepEqual(TL.clampFgWindowTrim(prop, 'right', 0.5, 5, 0.1), { t_start: 1.0, t_end: 1.1 });
  assert.deepEqual(TL.clampFgWindowTrim(prop, 'right', 8, 5, 0.1), { t_start: 1.0, t_end: 5 });
});

test('HM-TL-02: BG location move/trim never overlaps neighbors and swap_t edit validates cleanly', () => {
  const locs = [
    { id: 'loc-1', src: 'a.png', t0: 0, t1: 1.5 },
    { id: 'loc-2', src: 'b.png', t0: 2.0, t1: 3.5 },
    { id: 'loc-3', src: 'c.png', t0: 4.0, t1: 5.0 },
  ];
  assert.deepEqual(TL.clampBgLocationTrim(locs, 'loc-2', 'left', 0.5, 5, 0.1), { t0: 1.5, t1: 3.5 });
  assert.deepEqual(TL.clampBgLocationTrim(locs, 'loc-2', 'right', 4.8, 5, 0.1), { t0: 2.0, t1: 4.0 });
  assert.deepEqual(TL.clampBgLocationMove(locs, 'loc-2', -2, 5), { t0: 1.5, t1: 3.0 });
  assert.deepEqual(TL.clampBgLocationMove(locs, 'loc-2', 2, 5), { t0: 2.5, t1: 4.0 });
  assert.equal(TL.clampBgSwapTime(99, 5, 0.1), 4.9);
  assert.equal(TL.clampBgSwapTime(-3, 5, 0.1), 0.1);

  const show = JSON.parse(fs.readFileSync('public/shows/street-old-city.json', 'utf8'));
  const beforeAtoms = JSON.stringify(show.atoms);
  show.bg.swap = 'backgrounds/other.png';
  show.bg.swap_t = 2.0;
  HMComposeClient.applyBackgroundEdit(show, { op: 'set-swap-t', swap_t: 3.25 });
  assert.equal(show.bg.swap_t, 3.25);
  assert.equal(JSON.stringify(show.atoms), beforeAtoms, 'BG edit never mutates Character atoms');
});

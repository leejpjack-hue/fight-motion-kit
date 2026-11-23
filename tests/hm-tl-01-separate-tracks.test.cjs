'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const TL = require('../public/ui/multi-track-timeline.js');

const html = fs.readFileSync('public/ui/index.html', 'utf8');
const css = fs.readFileSync('public/ui/styles.css', 'utf8');
const app = fs.readFileSync('public/ui/app.js', 'utf8');

test('HM-TL-01: separate FG, Character (#timelineClips), and BG lanes share ruler and playhead in DOM', () => {
  for (const id of [
    'timelineMultiTrack', 'timelineHeaders', 'timelineFgLane', 'timelineClips',
    'timelineBgLane', 'ruler', 'playhead', 'trackCountFg', 'trackCountChar', 'trackCountBg',
  ]) {
    assert.ok(html.includes('id="' + id + '"'), 'missing #' + id);
  }
  assert.ok(html.indexOf('id="timelineFgLane"') < html.indexOf('id="timelineClips"'));
  assert.ok(html.indexOf('id="timelineClips"') < html.indexOf('id="timelineBgLane"'));
  assert.ok(html.indexOf('id="timelineBgLane"') < html.indexOf('id="playhead"'));
  assert.match(css, /\.timeline-panel>\.timeline-scroll[^{]*\{order:1\}/);
  assert.match(app, /HMMultiTrackTimeline\?\.render\?\.\(\)/);
});

test('HM-TL-01: buildTrackModel maps BG locations, legacy swap, running badge, and non-overlapping FG sub-rows independently of Character cuts', () => {
  const show = JSON.parse(fs.readFileSync('public/shows/daiyu-wang-five-seconds.json', 'utf8'));
  const proj = { version: 1, show };
  const demoModel = TL.buildTrackModel(proj, 5);
  assert.equal(demoModel.duration, 5);
  assert.equal(demoModel.counts.character, show.atoms.length);
  assert.equal(demoModel.counts.fg, 0);
  assert.equal(demoModel.counts.bg, 1);
  assert.equal(demoModel.bgSegments[0].isWhite, true);

  // Overlapping FG props + multi-location BG spanning across character cuts
  const multi = {
    version: 1,
    show: {
      ...show,
      bg: {
        locations: [
          { id: 'loc-1', src: 'bg/alley.png', t0: 0, t1: 3.2, motion: { preset: 'scroll_left', amount: 0.7, speed_px_s: 740, tile_mode: 'mirror' } },
          { id: 'loc-2', src: 'bg/roof.png', t0: 3.2, t1: 5.0, motion: { preset: 'pan_right', amount: 0.4, clock: 'show' } },
        ],
      },
      fg: {
        props: [
          { id: 'pole', src: 'props/pole.png', t_start: 0.2, t_end: 3.8, z: 10, kf: [{ t: 1.0, x: 500, y: 300, scale: 1 }], pass_by: { enabled: true } },
          { id: 'rail', src: 'props/rail.png', t_start: 1.0, t_end: 4.5, z: 20, effect: { type: 'break', t: 2.5 } },
          { id: 'leaf', src: 'props/leaf.png', t_start: 4.0, t_end: 5.0, z: 5 },
        ],
      },
    },
  };
  const m = TL.buildTrackModel(multi, 5);
  assert.equal(m.counts.fg, 3);
  assert.equal(m.fgRows.length, 2, 'overlapping pole & rail pack into 2 rows, leaf reuses row 0');
  assert.equal(m.counts.bg, 2);
  assert.equal(m.bgSegments[0].motionBadge, 'RUN ← 740');
  assert.equal(m.bgSegments[0].isScroll, true);
  assert.equal(m.bgSegments[1].motionBadge, 'PAN →');
  assert.equal(m.bgSegments[0].widthPct, 64);
  assert.ok(m.fgBars.find(b => b.id === 'pole').passBy);
  assert.equal(m.fgBars.find(b => b.id === 'pole').kfMarkers.length, 1);
  assert.equal(m.fgBars.find(b => b.id === 'rail').breakT, 2.5);
});

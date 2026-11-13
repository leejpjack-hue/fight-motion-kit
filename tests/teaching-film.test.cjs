'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('../public/ui/compose-client.js');
const HMTeachingFilm = require('../public/ui/teaching-film.js');

const ROOT = path.resolve(__dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

test('Issue #210: composeShow preserves clip label and caption onto timeline atoms without inventing beat_id', async () => {
  const show = readJson('public/shows/daiyu-wang-five-seconds.json');
  show.atoms[0].caption = 'Step inside the guard';
  show.atoms[2].caption = 'Turn the forearm away';

  const result = await HMComposeClient.composeShow(show, {
    cameraPresets: readJson('public/presets/camera_presets.json'),
    fxPresets: readJson('public/presets/fx_presets.json'),
    loadJson: async rel => readJson(path.join('public', rel)),
  });

  assert.equal(result.ok, true);
  assert.equal(result.timeline.atoms.length, 8);
  assert.equal(result.timeline.atoms[0].label, 'Opening clash');
  assert.equal(result.timeline.atoms[0].caption, 'Step inside the guard');
  assert.equal(result.timeline.atoms[0].beat_id, undefined);
  assert.equal(result.timeline.atoms[2].caption, 'Turn the forearm away');
  assert.equal(result.timeline.atoms[7].label, 'Push kick');
  assert.equal(result.timeline.atoms[7].caption, '');
});

test('Issue #210: describeTimelineAt resolves clip name, beat label, captions, and show clock across scrubbing', async () => {
  const show = readJson('public/shows/daiyu-wang-five-seconds.json');
  show.atoms[0].beat_id = 'B01';
  show.atoms[0].caption = 'Opening clash caption';
  show.overlays = [
    ...(show.overlays || []),
    { kind: 'text', atom_id: show.atoms[0].id, editor_caption: true, t_start: 0, t_end: 0.5, text: 'Opening clash caption' },
    { kind: 'text', t_start: 1.1, t_end: 1.6, text: 'Mid-fight overlay callout' },
  ];

  const result = await HMComposeClient.composeShow(show, {
    cameraPresets: readJson('public/presets/camera_presets.json'),
    fxPresets: readJson('public/presets/fx_presets.json'),
    loadJson: async rel => readJson(path.join('public', rel)),
  });
  assert.equal(result.ok, true);

  const atStart = HMTeachingFilm.describeTimelineAt(result, 0);
  assert.equal(atStart.activeIndex, 0);
  assert.equal(atStart.clipName, 'Opening clash');
  assert.match(atStart.beatBadgeText, /B01 · clash/);
  assert.match(atStart.beatBadgeText, /P01/);
  assert.equal(atStart.clockText, '0.00 / 5.00s');
  assert.equal(atStart.hasCaption, true);
  assert.equal(atStart.captionText, 'Opening clash caption');

  const atBoundary = HMTeachingFilm.describeTimelineAt(result, 0.5);
  assert.equal(atBoundary.activeIndex, 1);
  assert.equal(atBoundary.clipName, 'Recoil');
  assert.equal(atBoundary.clockText, '0.50 / 5.00s');
  assert.equal(atBoundary.hasCaption, false);
  assert.match(atBoundary.displayCaption, /Recoil/);

  const atOverlay = HMTeachingFilm.describeTimelineAt(result, 1.25);
  assert.equal(atOverlay.activeIndex, 2);
  assert.equal(atOverlay.hasCaption, true);
  assert.equal(atOverlay.captionText, 'Mid-fight overlay callout');
  assert.equal(atOverlay.clockText, '1.25 / 5.00s');

  const atEnd = HMTeachingFilm.describeTimelineAt(result, 5.0);
  assert.equal(atEnd.activeIndex, 7);
  assert.equal(atEnd.clipName, 'Push kick');
  assert.equal(atEnd.clockText, '5.00 / 5.00s');
});

test('Issue #210: Playable HTML and /player/ wire teaching-film without backend compose calls', () => {
  const exportsSrc = fs.readFileSync(path.join(ROOT, 'public/ui/exports.js'), 'utf8');
  const teachingSrc = fs.readFileSync(path.join(ROOT, 'public/ui/teaching-film.js'), 'utf8');
  const playerHtml = fs.readFileSync(path.join(ROOT, 'public/player/index.html'), 'utf8');
  const playerJs = fs.readFileSync(path.join(ROOT, 'public/player/player.js'), 'utf8');

  assert.match(exportsSrc, /createHMTeachingFilm/);
  assert.match(exportsSrc, /mountTeachingHud/);
  assert.match(playerHtml, /teaching-film\.js/);
  assert.match(playerJs, /HMTeachingFilm\.mountTeachingHud/);
  for (const src of [teachingSrc, playerJs]) {
    assert.equal(/https?:\/\//.test(src), false);
    assert.equal(src.includes('api.teqcon'), false);
    assert.equal(src.includes('8770'), false);
  }
});

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const X = require(path.join(ROOT, 'public/ui/x-export.js'));
const M = require(path.join(ROOT, 'public/ui/export-matrix.js'));

test('#233 720p24 and 1080p24 presets build exact 24 fps frame plans and timing JSON', () => {
  const p720_24 = X.presetById('720p24');
  const p1080_24 = X.presetById('1080p24');
  assert.deepEqual([p720_24.width, p720_24.height, p720_24.fps], [1280, 720, 24]);
  assert.deepEqual([p1080_24.width, p1080_24.height, p1080_24.fps], [1920, 1080, 24]);
  assert.match(X.bitrateHint(p720_24), /720p24 · 1280×720 · 24 fps/);
  assert.match(X.bitrateHint(p1080_24), /1080p24 · 1920×1080 · 24 fps/);

  const demoFrames = X.framePlan(5, p720_24.fps);
  assert.equal(demoFrames.length, 120);
  assert.equal(demoFrames[1].t, 1 / 24);
  assert.equal(demoFrames[119].file, 'frames/000119.png');

  const shortFrames = X.framePlan(0.25, p1080_24.fps);
  assert.equal(shortFrames.length, 6);
  const doc = X.timingDocument({ showId: 'daiyu-24fps', preset: p1080_24, durationS: 0.25, frames: shortFrames });
  assert.equal(doc.preset_id, '1080p24');
  assert.equal(doc.fps, 24);
  assert.deepEqual(doc.ffmpeg.argv.slice(0, 4), ['ffmpeg', '-y', '-framerate', '24']);
  assert.throws(() => X.framePlan(0.1, 24), /whole number of frames/);
});

test('#233 availableRecorderFormats and pickRecorderMime handle multi-format preference without claiming alpha', () => {
  const both = type => [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9,alpha',
  ].includes(type);

  const list = X.availableRecorderFormats(both);
  assert.deepEqual(list.map(entry => ({ ext: entry.ext, mime: entry.mime })), [
    { ext: 'webm', mime: 'video/webm;codecs=vp9' },
    { ext: 'mp4', mime: 'video/mp4;codecs=avc1.42E01E' },
  ]);
  assert.equal(list.some(entry => entry.mime.includes('alpha')), false);
  assert.equal(X.pickRecorderMime(both).mime, 'video/webm;codecs=vp9');
  assert.equal(X.pickRecorderMime(both, 'mp4').mime, 'video/mp4;codecs=avc1.42E01E');
  assert.equal(X.pickRecorderMime(both, 'mp4').ext, 'mp4');
  assert.equal(X.pickRecorderMime(type => type === 'video/webm', 'mp4').mime, 'video/webm');

  const caps = M.browserCaps({ captureStream: true, isTypeSupported: both });
  const mp4Chosen = M.matrix(caps, 'mp4');
  assert.equal(mp4Chosen.universal_mp4, false);
  assert.equal(mp4Chosen.universal_alpha, false);
  assert.equal(mp4Chosen.record_mime, 'video/mp4');
  assert.match(mp4Chosen.rows.find(r => r.id === 'mp4').note, /Record video uses video\/mp4 on this browser only\. MP4 is not universal\./);
  assert.equal(mp4Chosen.rows.find(r => r.id === 'alpha').offered, false);
});

test('#233 detectCadenceMismatch warns on 24 fps strips at 30 fps preset and clears at 24 fps', () => {
  const projectWithPending24 = {
    media: [
      {
        id: 'strip-1',
        name: 'kick.strip.png',
        pendingMotion: {
          status: 'pending',
          cadence: { secondsPerCell: 1 / 24, timingSource: 'fps' },
          metadata: { source_fps: 24 },
        },
      },
    ],
    show: { show_id: 's1', atoms: [] },
  };
  const projectWithPlayable24 = {
    media: [],
    strips: [{ id: 'walk-strip', name: 'walk.strip.png', fps: 24 }],
    show: { show_id: 's2', atoms: [] },
  };
  const normalProject = {
    media: [{ id: 'p1', name: 'P01.png' }],
    show: { show_id: 'daiyu-wang-five-seconds', atoms: [{ id: 'a1', duration_s: 5 }] },
  };

  const w1 = X.detectCadenceMismatch(projectWithPending24, X.presetById('720p30'));
  assert.equal(w1.mismatch, true);
  assert.equal(w1.stripFps, 24);
  assert.equal(w1.targetFps, 30);
  assert.match(w1.warning, /24 fps strip.*30 fps preset/i);

  const ok24 = X.detectCadenceMismatch(projectWithPending24, X.presetById('720p24'));
  assert.equal(ok24.mismatch, false);
  assert.equal(ok24.warning, '');

  const w2 = X.detectCadenceMismatch(projectWithPlayable24, X.presetById('1080p30'));
  assert.equal(w2.mismatch, true);
  assert.deepEqual(w2.stripNames, ['walk.strip.png']);

  const okNormal = X.detectCadenceMismatch(normalProject, X.presetById('720p30'));
  assert.equal(okNormal.mismatch, false);
});

test('#233 cadenceTelemetry summarizes MIME, resolution, measured cadence and flags significant drops', () => {
  const smooth = X.cadenceTelemetry({
    durationS: 1,
    targetFps: 24,
    renderedFrames: 24,
    actualElapsedMs: 1000,
    mime: 'video/webm;codecs=vp9',
    width: 1280,
    height: 720,
  });
  assert.equal(smooth.expected_frames, 24);
  assert.equal(smooth.rendered_frames, 24);
  assert.equal(smooth.dropped_frames, 0);
  assert.equal(smooth.measured_fps, 24);
  assert.equal(smooth.significant_drop, false);
  assert.match(smooth.summary, /video\/webm;codecs=vp9/);
  assert.match(smooth.summary, /1280×720/);
  assert.match(smooth.summary, /target 24 fps/);
  assert.match(smooth.summary, /measured 24\.0 fps/);

  const dropped = X.cadenceTelemetry({
    durationS: 2,
    targetFps: 30,
    renderedFrames: 20,
    actualElapsedMs: 2000,
    mime: 'video/mp4;codecs=avc1.42E01E',
    width: 1920,
    height: 1080,
  });
  assert.equal(dropped.expected_frames, 60);
  assert.equal(dropped.dropped_frames, 40);
  assert.equal(dropped.measured_fps, 10);
  assert.equal(dropped.significant_drop, true);
  assert.match(dropped.summary, /dropped 40 of 60 expected frames/);
  assert.match(dropped.summary, /PNG frames/);
});

test('#233 FE-only export controls and cancel surface stay backend-free', () => {
  const files = ['public/ui/x-export.js', 'public/ui/export-matrix.js', 'public/ui/exports.js', 'public/ui/index.html', 'public/ui/styles.css'];
  const joined = files.map(p => fs.readFileSync(path.join(ROOT, p), 'utf8')).join('\n');
  assert.equal(/\/api\/compose|api\.teqcon\.uk|:8770|wrangler deploy/i.test(joined), false);
  assert.match(joined, /id="exportFormat"/);
  assert.match(joined, /id="exportProgress"/);
  assert.match(joined, /id="cancelExport"/);
  assert.match(joined, /Export cancelled\./);
});

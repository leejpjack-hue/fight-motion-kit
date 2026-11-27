'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const X = require(path.join(ROOT, 'public/ui/x-export.js'));

function webmBytes() {
  const bytes = new Uint8Array(96);
  bytes.set([0x1a, 0x45, 0xdf, 0xa3], 0);
  bytes.set([0x77, 0x65, 0x62, 0x6d], 24);
  bytes.set([0x1f, 0x43, 0xb6, 0x75], 87);
  return bytes;
}

function mp4Bytes() {
  const bytes = new Uint8Array(32);
  bytes.set([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], 0);
  bytes.set([0x6d, 0x6f, 0x6f, 0x76], 24);
  return bytes;
}

test('#290 one playable file is a WebM or this-browser MP4 container, and garbage fails closed', () => {
  const webm = X.inspectPlayableContainer(webmBytes(), 'video/webm;codecs=vp9');
  assert.deepEqual({ ext: webm.ext, mime: webm.mime, bytes: webm.bytes }, {
    ext: 'webm',
    mime: 'video/webm;codecs=vp9',
    bytes: 96,
  });

  const mp4 = X.inspectPlayableContainer(mp4Bytes(), 'video/mp4');
  assert.equal(mp4.ext, 'mp4');
  assert.equal(mp4.mime, 'video/mp4');
  assert.equal(/universal/i.test(mp4.mime + mp4.ext), false);

  assert.throws(() => X.inspectPlayableContainer(new Uint8Array(0), 'video/webm'), /empty file \(0 bytes\)/);
  assert.throws(() => X.inspectPlayableContainer(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), 'video/webm'), /playable video file/);
  assert.throws(() => X.inspectPlayableContainer(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]), 'video/webm'), /playable video file/);
});

test('#290 the receipt duration, size, and picture match the file a player opens', () => {
  const preset = X.presetById('720p30');
  const played = {
    filename: 'playable-probe.webm',
    mime: 'video/webm;codecs=vp9',
    bytes: 4946,
    width: 1280,
    height: 720,
    durationS: 0.373537,
  };
  const receipt = X.buildExportReceipt({
    kind: 'video',
    filename: played.filename,
    format: played.mime,
    mime: played.mime,
    bytes: played.bytes,
    preset,
    width: played.width,
    height: played.height,
    durationS: played.durationS,
    showId: 'playable-probe',
    note: 'measured 34.3 fps',
  });
  assert.equal(receipt.duration_s, 0.374);
  assert.match(receipt.summary, /playable-probe\.webm/);
  assert.match(receipt.summary, /video\/webm;codecs=vp9/);
  assert.match(receipt.summary, /4\.8 KB/);
  assert.match(receipt.summary, /1280×720/);
  assert.match(receipt.summary, /0\.374s/);
  assert.doesNotMatch(receipt.summary, /0\.40s/);
  assert.match(receipt.honestyNote, /this file/);
  assert.match(receipt.honestyNote, /MP4 is not universal/);
  assert.equal(X.receiptMatchesPlayableFile(receipt, played), true);

  const timelineReceipt = X.buildExportReceipt({
    kind: 'video',
    filename: played.filename,
    mime: played.mime,
    bytes: played.bytes,
    preset,
    width: played.width,
    height: played.height,
    durationS: 0.4,
    showId: 'playable-probe',
  });
  assert.throws(() => X.receiptMatchesPlayableFile(timelineReceipt, played), /does not match the playable file/);

  const html = fs.readFileSync(path.join(ROOT, 'public/ui/index.html'), 'utf8');
  const exportsSrc = fs.readFileSync(path.join(ROOT, 'public/ui/exports.js'), 'utf8');
  assert.match(html, /id="exportVideo"[^>]*class="primary"/);
  assert.match(html, /Playable video file/);
  assert.equal(/\/api\/compose|api\.teqcon\.uk|:8770|wrangler deploy/i.test(html + exportsSrc), false);
});

test('#290 the frame-zip ffmpeg command is a complete local encode and does not claim a universal MP4', () => {
  const preset = X.presetById('720p30');
  const cmd = X.formatFfmpegCommand(X.ffmpegMp4Argv(preset, 0.4, 'playable-probe.mp4'));
  assert.match(cmd, /^ffmpeg -y -framerate 30 -start_number 0 -i frames\/%06d\.png -an -c:v libx264 -pix_fmt yuv420p -b:v 5000k -movflags \+faststart -t 0\.400 playable-probe\.mp4$/);
  const receipt = X.buildExportReceipt({
    kind: 'frames',
    filename: 'playable-probe-720p30-frames.zip',
    format: 'PNG + timing.json',
    mime: 'application/zip',
    bytes: 4096,
    preset,
    width: 1280,
    height: 720,
    durationS: 0.4,
    showId: 'playable-probe',
    ffmpegCommand: cmd,
  });
  assert.equal(receipt.ffmpegCommand, cmd);
  assert.match(receipt.honestyNote, /not universal/);
});

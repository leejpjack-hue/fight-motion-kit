'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const Sampler = require(path.join(ROOT, 'public/ui/strip-sampler.js'));
const HMStripAdapter = require(path.join(ROOT, 'public/ui/project-media.js'));
require(path.join(ROOT, 'public/ui/compose-client.js'));
const HMComposeClient = globalThis.HMComposeClient;
const HMHtmlImport = require(path.join(ROOT, 'public/ui/html-import.js'));
const X = require(path.join(ROOT, 'public/ui/x-export.js'));
const M = require(path.join(ROOT, 'public/ui/export-matrix.js'));

const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

function pngChunk(type, data) {
  const table = pngChunk.t || (pngChunk.t = Array.from({ length: 256 }, (_, n) => {
    for (let i = 0; i < 8; i++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : (n >>> 1);
    return n >>> 0;
  }));
  const b = Buffer.alloc(data.length + 12);
  b.writeUInt32BE(data.length, 0);
  b.write(type, 4);
  data.copy(b, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < b.length - 4; i++) crc = table[(crc ^ b[i]) & 255] ^ (crc >>> 8);
  b.writeUInt32BE((crc ^ 0xffffffff) >>> 0, b.length - 4);
  return b;
}

function makeStripPng(frames, w, h) {
  const totalW = frames * w;
  const rows = Buffer.alloc((totalW * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (totalW * 4 + 1);
    rows[row] = 0;
    for (let x = 0; x < totalW; x++) {
      const cell = Math.floor(x / w);
      const off = row + 1 + x * 4;
      rows[off] = 40 * (cell + 1);
      rows[off + 1] = 200 - 30 * cell;
      rows[off + 2] = 60;
      rows[off + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(totalW, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function descriptorFor(kind, extra = {}) {
  return {
    geometry: { frames: 4, w: 16, h: 24, body_h: 16 },
    cadence: { secondsPerCell: 0.1, timingSource: 'fps' },
    policy: {
      kind,
      loop: kind === 'repeat',
      returns: kind === 'once-return',
      holdLast: kind === 'once',
      endFrame: 3,
    },
    metadata: { foot_anchor: 'feet', foot_x: 8 },
    ...extra,
  };
}

test('#231 sampleStripAt handles cumulative intervals, repeat modulo, once clamp, once-return endpoint, repeated cells & +/-1e-6 boundaries', () => {
  const repeatDesc = descriptorFor('repeat');
  // +/-1e-6 epsilon boundary probes across floating-point cumulative boundary 0.3 (= 3 * 0.1)
  assert.equal(Sampler.sampleStripAt(repeatDesc, 0.3 - 1e-6).cellIndex, 2);
  assert.equal(Sampler.sampleStripAt(repeatDesc, 0.3).cellIndex, 3);
  assert.equal(Sampler.sampleStripAt(repeatDesc, 0.3 + 1e-6).cellIndex, 3);
  assert.equal(Sampler.sampleStripAt(repeatDesc, 0.4 - 1e-6).cellIndex, 3);
  assert.equal(Sampler.sampleStripAt(repeatDesc, 0.4).cellIndex, 0);
  assert.equal(Sampler.sampleStripAt(repeatDesc, 0.55).cellIndex, 1);

  // once: clamps to final frame (no modulo wrap)
  const onceDesc = descriptorFor('once');
  assert.equal(Sampler.sampleStripAt(onceDesc, -0.05).cellIndex, 0);
  assert.equal(Sampler.sampleStripAt(onceDesc, -0.05).clamped, true);
  assert.equal(Sampler.sampleStripAt(onceDesc, 0.39).cellIndex, 3);
  assert.equal(Sampler.sampleStripAt(onceDesc, 0.4).cellIndex, 3);
  assert.equal(Sampler.sampleStripAt(onceDesc, 2.5).cellIndex, 3);
  assert.equal(Sampler.sampleStripAt(onceDesc, 2.5).clamped, true);

  // once-return: settles at actual endFrame without looping
  const returnDesc = descriptorFor('once-return');
  const endSample = Sampler.sampleStripAt(returnDesc, 0.4);
  assert.equal(endSample.cellIndex, 3);
  assert.equal(endSample.atEndpoint, true);
  assert.equal(Sampler.sampleStripAt(returnDesc, 1.2).cellIndex, 3);

  // Repeated cells stay distinct playback instances with cumulative durations
  const seqDesc = descriptorFor('repeat', {
    sequence: [0, 1, 0, 2],
    cellDurations: [0.1, 0.25, 0.05, 0.1],
  });
  const inst0 = Sampler.sampleStripAt(seqDesc, 0.05);
  const inst1 = Sampler.sampleStripAt(seqDesc, 0.15);
  const inst2 = Sampler.sampleStripAt(seqDesc, 0.36);
  const inst3 = Sampler.sampleStripAt(seqDesc, 0.45);
  assert.deepEqual([inst0.instanceIndex, inst0.cellIndex], [0, 0]);
  assert.deepEqual([inst1.instanceIndex, inst1.cellIndex], [1, 1]);
  assert.deepEqual([inst2.instanceIndex, inst2.cellIndex], [2, 0]);
  assert.deepEqual([inst3.instanceIndex, inst3.cellIndex], [3, 2]);
  assert.equal(Sampler.sampleStripAt(seqDesc, 0.35 - 1e-6).instanceIndex, 1);
  assert.equal(Sampler.sampleStripAt(seqDesc, 0.35 + 1e-6).instanceIndex, 2);

  // Random seek and backseek equal sequential evaluation
  const probes = [0.02, 0.36, 0.15, 0.45, 0.02, 0.35, 0.36];
  const seqRun = probes.map(t => Sampler.sampleStripAt(seqDesc, t));
  const revRun = probes.slice().reverse().map(t => Sampler.sampleStripAt(seqDesc, t)).reverse();
  assert.deepEqual(seqRun, revRun);
});

test('#231 stripStagePlacement anchors by body_h so jump headroom keeps constant actor scale', () => {
  const standing = { geometry: { frames: 4, w: 64, h: 64, body_h: 48 }, metadata: { foot_anchor: 'feet', foot_x: 32 } };
  const jumping = { geometry: { frames: 4, w: 64, h: 96, body_h: 48 }, metadata: { foot_anchor: 'feet', foot_x: 32 } };
  const rStand = Sampler.stripStagePlacement(standing, 684);
  const rJump = Sampler.stripStagePlacement(jumping, 684);
  assert.equal(rStand.scale, rJump.scale);
  assert.equal(rStand.bodyHeightStage, 450);
  assert.equal(rJump.bodyHeightStage, 450);
  assert.equal(rStand.destY + rStand.destH, 684);
  assert.equal(rJump.destY + rJump.destH, 684);
  assert.ok(rJump.destY < rStand.destY, 'extra jump air-room extends upward without shrinking actor');

  // drawStripFrame sets imageSmoothingEnabled = false and draws clipped cell without matte punch-out
  let calls = [];
  const fakeCtx = {
    imageSmoothingEnabled: true,
    save() { calls.push(['save', this.imageSmoothingEnabled]); },
    drawImage(...args) { calls.push(['draw', this.imageSmoothingEnabled, ...args.slice(1)]); },
    restore() { calls.push(['restore']); },
  };
  const entry = { ...descriptorFor('once'), clip_offset_s: 0.1, atom_t0: 1.0, floor_y: 684 };
  const drawn = Sampler.drawStripFrame(fakeCtx, { naturalWidth: 64, naturalHeight: 24 }, entry, 1.15, 684);
  assert.equal(drawn.sample.cellIndex, 2); // 0.1 offset + (1.15 - 1.0) = 0.25s -> cell 2
  assert.equal(calls[1][1], false); // imageSmoothingEnabled forced false
  assert.deepEqual(calls[1].slice(2, 6), [32, 0, 16, 24]); // exact source crop rect
});

test('#231 / #232 stage -> append -> composeShow -> splitAtomAt -> html-import round-trip preserves playable strips', async () => {
  const pngBytes = makeStripPng(4, 8, 12);
  const jsonBytes = Buffer.from(JSON.stringify({ frames: 4, w: 8, h: 12, body_h: 8, fps: 10, kind: 'periodic', loop: true }));
  const staged = await HMStripAdapter.stage(
    [
      { name: 'kick.strip.png', size: pngBytes.length, arrayBuffer: async () => Uint8Array.from(pngBytes).buffer },
      { name: 'kick.strip.json', size: jsonBytes.length, arrayBuffer: async () => Uint8Array.from(jsonBytes).buffer },
    ],
    { decode: async () => ({ width: 32, height: 12 }) },
  );
  assert.equal(staged.strip.status, 'playable');

  const project = { version: 1, show: { show_id: 'strip-e2e', title: 'Strip E2E', atoms: [], bg: {}, overlays: [] }, layouts: {}, media: [], assets: {} };
  HMStripAdapter.append(project, staged);
  HMStripAdapter.validateProject(project);
  assert.equal(project.show.atoms.length, 1);
  assert.equal(project.show.atoms[0].duration_s, 0.4);
  assert.equal(project.media[0].strip.status, 'playable');

  // Split atom at 0.15s and verify offset continuity across halves
  const [left, right] = HMComposeClient.splitAtomAt(project.show.atoms[0], 0.15, 'clip-part-2');
  assert.equal(left.duration_s, 0.15);
  assert.equal(left.strip_offset_s, 0);
  assert.equal(right.duration_s, 0.25);
  assert.equal(right.strip_offset_s, 0.15);
  project.show.atoms = [left, right];

  const composed = await HMComposeClient.composeShow(project.show, {
    cameraPresets: read('public/presets/camera_presets.json'),
    fxPresets: read('public/presets/fx_presets.json'),
    loadJson: async p => project.layouts[p],
  });
  assert.equal(composed.ok, true);
  assert.equal(composed.layout.S001.strip.clip_offset_s, 0);
  assert.equal(composed.layout.S002.strip.clip_offset_s, 0.15);
  assert.equal(composed.timeline.atoms[1].strip.clip_offset_s, 0.15);

  // Standalone DATA + hm-project-data HTML reconstruction preserves strip & offset
  const scriptTag = HMHtmlImport.embedProjectScript(project, { omitAssets: true });
  const fakeHtml = `<!doctype html><html><body>${scriptTag}<script>const DATA=${JSON.stringify({ ...composed, assets: project.assets })};</script></body></html>`;
  const restored = HMHtmlImport.parseMotionHtml(fakeHtml, { fileName: 'strip-e2e.html' }).project;
  assert.equal(restored.media[0].strip.status, 'playable');
  assert.equal(restored.show.atoms[1].strip_offset_s, 0.15);
});

test('#240 ffmpegMp4Argv, timingDocument, buildExportReceipt & FE-only guarantees', () => {
  const preset = X.presetById('720p24');
  const mp4Argv = X.ffmpegMp4Argv(preset, 5, 'ai-duel.mp4');
  assert.equal(mp4Argv.includes('-c:v'), true);
  assert.equal(mp4Argv.includes('libx264'), true);
  assert.equal(mp4Argv.includes('-pix_fmt'), true);
  assert.equal(mp4Argv.includes('yuv420p'), true);
  assert.equal(mp4Argv.includes('-movflags'), true);
  assert.equal(mp4Argv.includes('+faststart'), true);
  const cmd = X.formatFfmpegCommand(mp4Argv);
  assert.match(cmd, /^ffmpeg -y -framerate 24 -start_number 0 -i frames\/%06d\.png .*yuv420p .*ai-duel\.mp4$/);

  const frames = X.framePlan(0.25, 24);
  const doc = X.timingDocument({ showId: 'ai-duel', preset, durationS: 0.25, frames });
  assert.equal(doc.ffmpeg.argv.includes('mp4'), false);
  assert.equal(doc.ffmpeg.argv.includes('libvpx'), true);
  assert.equal(doc.ffmpeg_mp4.argv.includes('libx264'), true);
  assert.equal(doc.ffmpeg_mp4.argv.includes('yuv420p'), true);
  assert.equal(doc.ffmpeg_mp4.command, X.formatFfmpegCommand(doc.ffmpeg_mp4.argv));

  const rec = X.buildExportReceipt({
    kind: 'frames',
    filename: 'ai-duel-720p24-frames.zip',
    format: 'PNG + timing.json',
    preset,
    durationS: 0.25,
    showId: 'ai-duel',
    note: '6 frames',
  });
  assert.equal(rec.title, 'PNG frame sequence ready');
  assert.match(rec.summary, /ai-duel-720p24-frames\.zip/);
  assert.match(rec.mp4Command, /libx264 -pix_fmt yuv420p/);

  // Matrix honesty & FE-only boundary
  const m = M.matrix(M.browserCaps({ captureStream: true, isTypeSupported: t => /webm|mp4/.test(t) }));
  assert.equal(m.universal_mp4, false);
  assert.equal(m.universal_alpha, false);
  const files = ['public/ui/strip-sampler.js', 'public/ui/project-media.js', 'public/ui/compose-client.js', 'public/ui/motion-renderer.js', 'public/ui/x-export.js', 'public/ui/exports.js', 'public/ui/index.html'];
  const joined = files.map(p => fs.readFileSync(path.join(ROOT, p), 'utf8')).join('\n');
  assert.equal(/\/api\/compose|api\.teqcon\.uk|:8770|wrangler deploy/i.test(joined), false);

  // Demo integrity preserved
  const demo = read('public/shows/daiyu-wang-five-seconds.json');
  assert.equal(demo.atoms.length, 8);
  assert.equal(demo.atoms.reduce((s, a) => s + a.duration_s, 0), 5);
});

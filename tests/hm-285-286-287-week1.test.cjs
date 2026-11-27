'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const X = require(path.join(ROOT, 'public/ui/x-export.js'));
require(path.join(ROOT, 'public/ui/motion-renderer.js'));
require(path.join(ROOT, 'public/ui/compose-client.js'));
const HMComposeClient = globalThis.HMComposeClient;
const HMHtmlImport = require(path.join(ROOT, 'public/ui/html-import.js'));
const HMImportSecurity = require(path.join(ROOT, 'public/ui/import-security.js'));

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=';

function readText(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function readJson(rel) {
  return JSON.parse(readText(rel));
}

function assertNoUniversalMp4Claim(text) {
  const s = String(text || '');
  assert.equal(/universal MP4 export|always exports MP4|every browser records MP4/i.test(s), false);
  const lower = s.toLowerCase();
  let from = 0;
  while (from < lower.length) {
    const idx = lower.indexOf('universal', from);
    if (idx < 0) break;
    assert.equal(lower.slice(Math.max(0, idx - 4), idx), 'not ', 'universal must be negated in: ' + s);
    from = idx + 9;
  }
}

test('#285 empty-composer first run offers direct start actions without inventing stand-in art', () => {
  const html = readText('public/ui/index.html');
  const app = readText('public/ui/app.js');
  const css = readText('public/ui/styles.css');

  const emptyBlock = html.match(/<div id="emptyStage"[\s\S]*?<\/div><div id="stageMissingOverlay"/);
  assert.ok(emptyBlock, '#emptyStage block present');
  const markup = emptyBlock[0];
  assert.match(markup, /id="emptyOpenHtml"/);
  assert.match(markup, /Open AI Motion HTML/);
  assert.match(markup, /id="emptyLoadDemo"/);
  assert.match(markup, /Load 5s starter fight/);
  assert.match(markup, /id="emptyAdd"/);
  assert.match(markup, /Import images/);
  assert.match(markup, /No stand-in art is invented/);

  assert.match(app, /on\('emptyOpenHtml',\s*\(\)\s*=>\s*firstPathStep\('import-html'\)\)/);
  assert.match(app, /on\('emptyLoadDemo',\s*\(\)\s*=>\s*firstPathStep\('open'\)\)/);
  assert.match(app, /on\('emptyAdd',\s*\(\)\s*=>\s*\$\('imageInput'\)\.click\(\)\)/);
  assert.match(app, /Empty timeline \(0 clips\)/);
  assert.match(css, /\.empty-stage-actions/);

  // Strict FE-only, no backend generation
  assert.equal(/\/api\/compose|api\.teqcon\.uk|:8770|wrangler deploy/i.test(html + app), false);
});

test('#286 export receipt reports actual MIME, byte size, resolution, duration, ffmpeg command, and fails closed on empty blobs', () => {
  assert.equal(X.formatBytes(0), '0 B');
  assert.equal(X.formatBytes(842), '842 B');
  assert.equal(X.formatBytes(2048), '2.0 KB');
  assert.equal(X.formatBytes(3 * 1024 * 1024), '3.00 MB');

  const p720 = X.presetById('720p30');
  const p1080 = X.presetById('1080p24');

  const webmReceipt = X.buildExportReceipt({
    kind: 'video',
    filename: 'daiyu-wang-five-seconds.webm',
    format: 'video/webm;codecs=vp9',
    mime: 'video/webm;codecs=vp9',
    bytes: 2457600,
    preset: p720,
    width: 1280,
    height: 720,
    durationS: 5,
    showId: 'daiyu-wang-five-seconds',
    note: 'measured 29.8 fps',
  });
  assert.equal(webmReceipt.mime, 'video/webm;codecs=vp9');
  assert.equal(webmReceipt.bytes, 2457600);
  assert.equal(webmReceipt.size_label, '2.34 MB');
  assert.equal(webmReceipt.resolution, '1280×720');
  assert.equal(webmReceipt.duration_s, 5);
  assert.match(webmReceipt.summary, /video\/webm;codecs=vp9/);
  assert.match(webmReceipt.summary, /2\.34 MB/);
  assert.match(webmReceipt.summary, /1280×720/);
  assert.match(webmReceipt.summary, /5\.00s/);
  assert.match(webmReceipt.honestyNote, /WebM/);
  assertNoUniversalMp4Claim(webmReceipt.honestyNote + ' ' + webmReceipt.summary);

  const framesReceipt = X.buildExportReceipt({
    kind: 'frames',
    filename: 'sprint-1080p24-frames.zip',
    format: 'PNG + timing.json',
    mime: 'application/zip',
    bytes: 5242880,
    preset: p1080,
    width: 1920,
    height: 1080,
    durationS: 3,
    showId: 'sprint',
    note: '72 frames',
  });
  assert.equal(framesReceipt.mime, 'application/zip');
  assert.equal(framesReceipt.bytes, 5242880);
  assert.equal(framesReceipt.size_label, '5.00 MB');
  assert.equal(framesReceipt.resolution, '1920×1080');
  assert.match(framesReceipt.summary, /application\/zip/);
  assert.match(framesReceipt.summary, /5\.00 MB/);
  assert.match(framesReceipt.summary, /1920×1080/);
  assert.match(framesReceipt.summary, /3\.00s/);
  assert.match(framesReceipt.ffmpegCommand, /^ffmpeg -y -framerate 24 -start_number 0 -i frames\/%06d\.png .*yuv420p .*sprint\.mp4$/);
  assertNoUniversalMp4Claim(framesReceipt.honestyNote + ' ' + framesReceipt.summary);

  const htmlReceipt = X.buildExportReceipt({
    kind: 'html',
    filename: 'sprint.html',
    format: 'Offline HTML + Project SoT',
    mime: 'text/html',
    bytes: 98304,
    width: 1280,
    height: 720,
    durationS: 3,
    showId: 'sprint',
    note: 'All images embedded',
  });
  assert.equal(htmlReceipt.mime, 'text/html');
  assert.equal(htmlReceipt.size_label, '96.0 KB');
  assert.match(htmlReceipt.summary, /text\/html/);
  assert.match(htmlReceipt.summary, /96\.0 KB/);
  assertNoUniversalMp4Claim(htmlReceipt.honestyNote);

  const pngReceipt = X.buildExportReceipt({
    kind: 'frame',
    filename: 'sprint-1.20s.png',
    format: 'PNG frame',
    mime: 'image/png',
    bytes: 16384,
    width: 1280,
    height: 720,
    durationS: 3,
    showId: 'sprint',
    note: 'at 1.20s',
  });
  assert.equal(pngReceipt.mime, 'image/png');
  assert.equal(pngReceipt.size_label, '16.0 KB');
  assert.equal(pngReceipt.title, 'Current frame PNG exported');

  const timingReceipt = X.buildExportReceipt({
    kind: 'timing',
    filename: 'sprint-timing.json',
    format: 'Timing pack JSON',
    mime: 'application/json',
    bytes: 4096,
    durationS: 3,
    showId: 'sprint',
    note: '72 timing rows',
  });
  assert.equal(timingReceipt.mime, 'application/json');
  assert.equal(timingReceipt.size_label, '4.0 KB');
  assert.equal(timingReceipt.title, 'Timing pack JSON exported');

  // Fail closed on zero-byte / invalid byte size
  assert.throws(() => X.buildExportReceipt({ kind: 'video', filename: 'bad.webm', mime: 'video/webm', bytes: 0, durationS: 2 }), /empty file \(0 bytes\)/);
  assert.throws(() => X.buildExportReceipt({ kind: 'frames', filename: 'bad.zip', mime: 'application/zip', bytes: -5, durationS: 2 }), /empty file \(0 bytes\)/);
  assert.throws(() => X.buildExportReceipt({ kind: 'html', filename: 'bad.html', mime: 'text/html', bytes: Number.NaN, durationS: 2 }), /empty file \(0 bytes\)/);

  // Verify exports.js wires actual Blob size/type and clears receipt on failure/cancel
  const exportsSrc = readText('public/ui/exports.js');
  const html = readText('public/ui/index.html');
  assert.match(exportsSrc, /function assertNonEmptyBlob/);
  assert.match(exportsSrc, /catch\(e\)\{hideReceipt\(\);report\(e\.message,true\);throw e;\}/);
  assert.match(exportsSrc, /bytes:vidBlob\.size/);
  assert.match(exportsSrc, /bytes:zipBlob\.size/);
  assert.match(exportsSrc, /bytes:htmlBlob\.size/);
  assert.match(exportsSrc, /mime:actualMime/);
  assert.match(exportsSrc, /ffmpegCommand:timing\.ffmpeg_mp4\?\.command/);
  assert.match(html, /id="exportReceiptHonesty"/);
  assert.match(html, /id="exportReceiptCmd"/);
});

test('#287 multi-track BG locations, running parallax, FG pass-by props, micro_frames, and mood survive both HTML round-trip paths with zero numeric drift', async () => {
  const cameraPresets = readJson('public/presets/camera_presets.json');
  const fxPresets = readJson('public/presets/fx_presets.json');
  const cutPresets = readJson('public/presets/cut_transitions.json');

  const assets = {
    'plates/P01.png': TINY_PNG,
    'plates/P02.png': TINY_PNG,
    'plates/P01_micro.png': TINY_PNG,
    'bg/city_run.png': TINY_PNG,
    'bg/rooftop_run.png': TINY_PNG,
    'fg/lamp_post.png': TINY_PNG,
    'fg/crate_intact.png': TINY_PNG,
    'fg/crate_broken.png': TINY_PNG,
  };

  const layouts = {
    'imported-html-layout.json': {
      P01: { full: 'plates/P01.png', kind: 'duo' },
      P02: { full: 'plates/P02.png', kind: 'duo' },
    },
  };

  const show = {
    show_id: 'week1-multitrack-sprint',
    title: 'Week-1 Multi-Track Sprint',
    fx_profile: 'full',
    chars: { L: { name: 'Daiyu' }, R: { name: 'Wang' } },
    mood: { id: 'night_neon', intensity: 0.55 },
    bg: {
      key_white: false,
      parallax_ratio: 0.55,
      locations: [
        {
          id: 'loc-city-jog',
          label: 'City Jog Alley',
          src: 'bg/city_run.png',
          t0: 0,
          t1: 1.5,
          motion: {
            preset: 'scroll_left',
            amount: 0.45,
            speed_px_s: 360,
            tile_mode: 'tile',
            stride_bob: { amp_px: 4, freq_hz: 2.6 },
            motion_blur: 0.25,
          },
        },
        {
          id: 'loc-rooftop-dash',
          label: 'Rooftop Dash',
          src: 'bg/rooftop_run.png',
          t0: 1.5,
          t1: 3,
          motion: {
            preset: 'scroll_right',
            amount: 0.85,
            speed_px_s: 1120,
            tile_mode: 'mirror',
            stride_bob: { amp_px: 8, freq_hz: 4.4 },
            motion_blur: 0.65,
          },
        },
      ],
    },
    fg: {
      cam: { preset: 'parallax', amount: 0.65, nudge: { x: 12, y: -6, s: 0.05 } },
      props: [
        {
          id: 'fg-lamp-passby',
          src: 'fg/lamp_post.png',
          x: 640,
          y: 360,
          scale: 1.15,
          z: 5,
          t_start: 0.2,
          t_end: 2.8,
          pass_by: {
            enabled: true,
            direction: 'left',
            speed_px_s: 1650,
            parallax_mult: 2.1,
            spacing_px: 1400,
            phase_offset_px: 120,
            motion_blur: 0.45,
          },
        },
        {
          id: 'fg-crate-break',
          src: 'fg/crate_intact.png',
          x: 920,
          y: 520,
          scale: 0.9,
          z: 8,
          t_start: 0.5,
          t_end: 2.5,
          kf: [
            { t: 0.5, x: 960, y: 520, scale: 0.9 },
            { t: 1.25, x: 880, y: 510, scale: 1.05 },
          ],
          effect: {
            type: 'break',
            t: 1.25,
            broken_src: 'fg/crate_broken.png',
          },
        },
      ],
    },
    atoms: [
      {
        id: 'beat-01',
        label: 'Sprint Approach',
        kind: 'duo',
        duration_s: 1.5,
        plates_needed: 1,
        pose_mode: 'hero',
        hero: { layout_source: 'imported-html-layout.json', plates: ['P01'] },
        camera: { preset: 'eye_push', micro_move: 'punch_in', motion_blur: 0.35 },
        fx_hooks: [{ type: 'speed_lines', t_rel: 0.1, params: {} }],
        mood: { id: 'crimson_fury', intensity: 0.7 },
        micro_frames: [
          {
            id: 'mf-1',
            at: 'start',
            frames: 1,
            action: 'anticipation',
            dir: 1,
            strength: 1.1,
          },
          {
            id: 'mf-2',
            at: 'end',
            frames: 2,
            action: 'swap_plate',
            dir: -1,
            strength: 1.0,
            src: 'plates/P01_micro.png',
          },
        ],
      },
      {
        id: 'beat-02',
        label: 'Rooftop Impact',
        kind: 'duo',
        duration_s: 1.5,
        plates_needed: 1,
        pose_mode: 'hero',
        hero: { layout_source: 'imported-html-layout.json', plates: ['P02'] },
        camera: { preset: 'low_rise' },
        fx_hooks: [{ type: 'hit_orange', t_rel: 0.08, params: {} }],
      },
    ],
    overlays: [],
  };

  const project = {
    version: 1,
    show,
    layouts,
    media: [
      { id: 'm1', name: 'P01', src: 'plates/P01.png', layoutSource: 'imported-html-layout.json', plateId: 'P01' },
      { id: 'm2', name: 'P02', src: 'plates/P02.png', layoutSource: 'imported-html-layout.json', plateId: 'P02' },
    ],
    assets,
  };

  const composeWith = (s, lay) => HMComposeClient.composeShow(s, {
    cameraPresets,
    fxPresets,
    cutPresets,
    layouts: lay,
    loadJson: async rel => lay[rel],
  });

  const composed1 = await composeWith(project.show, layouts);
  assert.equal(composed1.ok, true, 'initial compose succeeds: ' + (composed1.errors || []).join('; '));

  const dataBlob = JSON.stringify({ ...composed1, assets });

  // Path 1: Lossless <script id="hm-project-data"> + const DATA
  const losslessHtml = '<!doctype html><html><body>' +
    HMHtmlImport.embedProjectScript(project, { omitAssets: true }) +
    '<script>const DATA=' + dataBlob + ';</script></body></html>';
  const parsedLossless = HMHtmlImport.parseMotionHtml(losslessHtml, { fileName: 'week1-multitrack-sprint.html' });
  assert.equal(parsedLossless.kind, 'hm-project-data');
  assert.deepEqual(parsedLossless.warnings, []);
  assert.deepEqual(parsedLossless.project.show.bg, show.bg);
  assert.deepEqual(parsedLossless.project.show.fg, show.fg);
  assert.deepEqual(parsedLossless.project.show.mood, show.mood);
  assert.deepEqual(parsedLossless.project.show.atoms[0].micro_frames, show.atoms[0].micro_frames);
  assert.deepEqual(parsedLossless.project.show.atoms[0].mood, show.atoms[0].mood);
  assert.equal(parsedLossless.project.assets['plates/P01_micro.png'], TINY_PNG);
  assert.equal(parsedLossless.project.assets['bg/rooftop_run.png'], TINY_PNG);
  assert.equal(parsedLossless.project.assets['fg/crate_broken.png'], TINY_PNG);

  const recomposedLossless = await composeWith(parsedLossless.project.show, parsedLossless.project.layouts);
  assert.equal(recomposedLossless.ok, true, 'lossless re-compose succeeds');
  assert.deepEqual(recomposedLossless.timeline.bg, composed1.timeline.bg);
  assert.deepEqual(recomposedLossless.timeline.fg, composed1.timeline.fg);
  assert.deepEqual(recomposedLossless.timeline.mood, composed1.timeline.mood);
  assert.deepEqual(recomposedLossless.timeline.atoms[0].micro_frames, composed1.timeline.atoms[0].micro_frames);
  assert.equal(X.framePlan(recomposedLossless.timeline.duration_s, 30).length, 90);

  // Path 2: Legacy `const DATA = {...};` fallback reconstruction (without #hm-project-data)
  const legacyHtml = '<!doctype html><html><body><script>const DATA=' + dataBlob + ';</script></body></html>';
  const parsedLegacy = HMHtmlImport.parseMotionHtml(legacyHtml, { fileName: 'week1-multitrack-sprint.html' });
  assert.equal(parsedLegacy.kind, 'legacy-data');
  assert.deepEqual(parsedLegacy.project.show.bg, composed1.timeline.bg);
  assert.deepEqual(parsedLegacy.project.show.fg, composed1.timeline.fg);
  assert.deepEqual(parsedLegacy.project.show.mood, composed1.timeline.mood);
  assert.deepEqual(parsedLegacy.project.show.atoms[0].micro_frames, composed1.timeline.atoms[0].micro_frames);
  assert.deepEqual(parsedLegacy.project.show.atoms[0].mood, composed1.timeline.atoms[0].mood);
  assert.equal(parsedLegacy.project.show.atoms[0].camera.motion_blur, 0.35);
  assert.equal(parsedLegacy.project.show.atoms[0].camera.micro_move, 'punch_in');

  const recomposedLegacy = await composeWith(parsedLegacy.project.show, parsedLegacy.project.layouts);
  assert.equal(recomposedLegacy.ok, true, 'legacy re-compose succeeds: ' + (recomposedLegacy.errors || []).join('; '));
  assert.deepEqual(recomposedLegacy.timeline.bg, composed1.timeline.bg);
  assert.deepEqual(recomposedLegacy.timeline.fg, composed1.timeline.fg);
  assert.deepEqual(recomposedLegacy.timeline.mood, composed1.timeline.mood);
  assert.deepEqual(recomposedLegacy.timeline.atoms[0].micro_frames, composed1.timeline.atoms[0].micro_frames);
  assert.equal(X.framePlan(recomposedLegacy.timeline.duration_s, 30).length, 90);
});

test('#287 single-BG Full Sprint scroll round-trip, micro_frames relink audit, bounds guard, and 5s demo invariance', async () => {
  const cameraPresets = readJson('public/presets/camera_presets.json');
  const fxPresets = readJson('public/presets/fx_presets.json');
  const cutPresets = readJson('public/presets/cut_transitions.json');
  const layouts = { 'imported-html-layout.json': { P01: { full: 'plates/P01.png', kind: 'duo' } } };

  const sprintShow = {
    show_id: 'single-bg-full-sprint',
    title: 'Single BG Full Sprint',
    bg: {
      base: 'bg/street_sprint.png',
      key_white: false,
      parallax_ratio: 0.75,
      motion: {
        preset: 'scroll_left',
        amount: 0.75,
        speed_px_s: 920,
        tile_mode: 'tile',
        stride_bob: { amp_px: 7, freq_hz: 4.1 },
        motion_blur: 0.55,
      },
    },
    atoms: [
      {
        id: 'sprint-01',
        label: 'Full Sprint',
        kind: 'duo',
        duration_s: 2,
        plates_needed: 1,
        pose_mode: 'hero',
        hero: { layout_source: 'imported-html-layout.json', plates: ['P01'] },
        camera: { preset: 'static_hold' },
        fx_hooks: [],
      },
    ],
    overlays: [],
  };

  const composed = await HMComposeClient.composeShow(sprintShow, { cameraPresets, fxPresets, cutPresets, layouts, loadJson: async rel => layouts[rel] });
  assert.equal(composed.ok, true);
  const legacyHtml = '<!doctype html><script>const DATA=' + JSON.stringify({
    ...composed,
    assets: { 'plates/P01.png': TINY_PNG, 'bg/street_sprint.png': TINY_PNG },
  }) + ';</script>';
  const recon = HMHtmlImport.parseMotionHtml(legacyHtml, { fileName: 'sprint.html' }).project;
  assert.deepEqual(recon.show.bg.motion, sprintShow.bg.motion);
  assert.equal(recon.show.bg.parallax_ratio, 0.75);
  assert.equal(Object.prototype.hasOwnProperty.call(recon.show.bg, 'swap'), false);
  const recomposed = await HMComposeClient.composeShow(recon.show, { cameraPresets, fxPresets, cutPresets, layouts: recon.layouts, loadJson: async rel => recon.layouts[rel] });
  assert.equal(recomposed.ok, true);
  assert.deepEqual(recomposed.timeline.bg.motion, composed.timeline.bg.motion);

  // Relink detects missing micro_frames[].src
  const relinkProject = {
    version: 1,
    show: {
      show_id: 'relink-micro',
      atoms: [{ id: 'a1', duration_s: 1, micro_frames: [{ id: 'mf1', t_rel: 0.5, frames: 1, fps: 24, kind: 'swap_plate', src: 'plates/missing_mf.png' }] }],
      bg: {},
      overlays: [],
    },
    layouts: {},
    media: [],
    assets: {},
  };
  const relinked = HMHtmlImport.relinkMissingAssets(relinkProject, { 'missing_mf.png': TINY_PNG });
  assert.equal(relinked.matched.length, 1);
  assert.equal(relinked.project.assets['plates/missing_mf.png'], TINY_PNG);

  // Security bounds reject invalid fg.props[].t_start / t_end
  assert.throws(() => HMImportSecurity.sanitizeProjectBounds({
    version: 1,
    show: {
      show_id: 'bad-fg',
      atoms: [{ id: 'a1', duration_s: 1 }],
      fg: { props: [{ id: 'p1', t_start: 2, t_end: 1 }] },
    },
  }), /invalid t_end/);

  // 5.00s eight-plate demo untouched
  const demo = readJson('public/shows/daiyu-wang-five-seconds.json');
  assert.equal(demo.show_id, 'daiyu-wang-five-seconds');
  assert.equal(demo.atoms.length, 8);
  assert.equal(demo.atoms.reduce((s, a) => s + a.duration_s, 0), 5);
});

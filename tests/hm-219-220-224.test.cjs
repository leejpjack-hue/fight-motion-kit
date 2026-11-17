'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const repo = path.join(__dirname, '..');
require('../public/ui/compose-client.js');
const Pds = require('../public/ui/peek-diff-safe-guides.js');
const HMComposeClient = globalThis.HMComposeClient;
const HMStripAdapter = require('../public/ui/project-media.js');
const { classifyHandoff } = require('../skills/hm-spritegen-handoff/handoff.cjs');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(repo, rel), 'utf8'));
}

function tinyPng(width = 8, height = 4) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    for (let i = 0; i < 8; i++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  function chunk(type, data) {
    const b = Buffer.alloc(data.length + 12);
    b.writeUInt32BE(data.length);
    b.write(type, 4);
    data.copy(b, 8);
    let c = 0xffffffff;
    for (let i = 4; i < b.length - 4; i++) c = crcTable[(c ^ b[i]) & 255] ^ (c >>> 8);
    b.writeUInt32BE((c ^ 0xffffffff) >>> 0, b.length - 4);
    return b;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  const rawRows = Buffer.alloc((width + 1) * height);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 0xa, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rawRows)), chunk('IEND', Buffer.alloc(0))]);
}

test('Issue #219 (HM-HF-11): PEEK_DIFF_CONTRACT extends renderAt SoT with tint and onion pixel modes and filename builder', () => {
  const c = HMComposeClient.PEEK_DIFF_CONTRACT;
  assert.equal(c.id, 'HM-HF-11-PEEK-DIFF-OVERLAY');
  assert.deepEqual(c.modes, ['tint', 'onion']);
  assert.equal(c.defaultMode, 'tint');
  assert.deepEqual(c.sot, ['renderAt', 'renderStageAt', 'renderStageBAt', 'sampleStageFrameAt']);
  assert.equal(c.width, 1280);
  assert.equal(c.height, 720);

  const a = new Uint8ClampedArray([
    100, 100, 100, 255,
    240, 240, 240, 255,
    20, 20, 20, 255,
    50, 60, 70, 255,
  ]);
  const same = Pds.computePeekDiffPixels(a, new Uint8ClampedArray(a), null, { mode: 'tint' });
  assert.equal(same.identical, true);
  assert.equal(same.changedPixels, 0);
  assert.equal(same.diffRatio, 0);
  assert.equal(same.maxDelta, 0);

  const b = new Uint8ClampedArray([
    100, 100, 100, 255, // identical
    20, 20, 20, 255,    // A brighter than B
    230, 230, 230, 255, // B brighter than A
    50, 60, 70, 255,    // identical
  ]);
  const tint = Pds.computePeekDiffPixels(a, b, null, { mode: 'tint' });
  assert.equal(tint.mode, 'tint');
  assert.equal(tint.identical, false);
  assert.equal(tint.changedPixels, 2);
  assert.equal(tint.totalPixels, 4);
  assert.equal(tint.diffRatio, 0.5);
  assert.ok(tint.data[4] < tint.data[5] && tint.data[6] > tint.data[4], 'A>B difference paints cyan/mint tint');
  assert.ok(tint.data[8] > tint.data[9] && tint.data[10] > tint.data[9], 'B>A difference paints magenta/coral tint');

  const onion = Pds.computePeekDiffPixels(a, b, null, { mode: 'onion' });
  assert.equal(onion.mode, 'onion');
  assert.equal(onion.changedPixels, 2);
  assert.equal(onion.data[4], (240 + 20) >> 1);
  assert.equal(onion.data[8], (20 + 230) >> 1);

  assert.equal(
    Pds.peekDiffFilename('daiyu-wang-five-seconds', 'street-old-city', 1.25, 'tint'),
    'daiyu-wang-five-seconds-vs-street-old-city-peek-diff-tint-1.25s.png'
  );
  assert.equal(
    Pds.peekDiffFilename('draft a', 'gold b', 0.5, 'onion'),
    'draft-a-vs-gold-b-peek-diff-onion-0.50s.png'
  );
});

test('Issue #220 (HM-HF-10): SAFE_GUIDES_CONTRACT draws 90% action-safe & 80% title-safe overlays and emits non-blocking lint', () => {
  const s = HMComposeClient.SAFE_GUIDES_CONTRACT;
  assert.equal(s.id, 'HM-HF-10-ACTION-SAFE-GUIDES');
  assert.equal(s.blocksBake, false);
  assert.equal(s.lintCode, 'outside_title_safe');
  assert.deepEqual(s.actionSafe, { ratio: 0.9, insetPct: 5, x: 64, y: 36, w: 1152, h: 648, right: 1216, bottom: 684 });
  assert.deepEqual(s.titleSafe, { ratio: 0.8, insetPct: 10, x: 128, y: 72, w: 1024, h: 576, right: 1152, bottom: 648 });

  const calls = [];
  const fakeCtx = {
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    setTransform() {},
    setLineDash() {},
    strokeRect(x, y, w, h) { calls.push(['strokeRect', x, y, w, h]); },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fillRect() {},
    fillText(txt) { calls.push(['fillText', txt]); },
  };
  Pds.paintSafeGuides(fakeCtx);
  assert.deepEqual(
    calls.filter(c => Array.isArray(c) && c[0] === 'strokeRect'),
    [['strokeRect', 64, 36, 1152, 648], ['strokeRect', 128, 72, 1024, 576]]
  );
  assert.ok(calls.some(c => Array.isArray(c) && c[0] === 'fillText' && /90% action-safe/.test(c[1])));
  assert.ok(calls.some(c => Array.isArray(c) && c[0] === 'fillText' && /80% title-safe/.test(c[1])));

  function projectFromShow(show) {
    const layouts = {};
    for (const a of show.atoms || []) {
      const src = a?.hero?.layout_source;
      if (src && !layouts[src]) layouts[src] = readJson(path.join('public', src));
    }
    return { version: 1, show, layouts, media: [], assets: {} };
  }

  const cameraPresets = readJson('public/presets/camera_presets.json');
  const fxPresets = readJson('public/presets/fx_presets.json');
  for (const showFile of ['public/shows/daiyu-wang-five-seconds.json', 'public/shows/street-old-city.json']) {
    const show = readJson(showFile);
    const clean = HMComposeClient.lintShow(projectFromShow(show), { cameraPresets, fxPresets });
    assert.equal(clean.clean, true, showFile + ' stays clean');
    assert.equal(clean.by_code.outside_title_safe, undefined);
  }

  const demo = readJson('public/shows/daiyu-wang-five-seconds.json');
  demo.atoms[0].caption = 'Edge caption';
  demo.atoms[0].caption_y = 690; // below y=648 (80% title-safe bottom)
  demo.atoms[1].fx_hooks = [{ type: 'exposure_warm_crush', t_rel: 0.08, params: { dur: 0.1, x: 560, y: 0, scale: 1 } }]; // 640 + 560 = 1200 > 1152
  demo.overlays = [{ id: 'hud-corner', kind: 'text', text: 'Corner HUD', t_start: 0, t_end: 0.5, x: 40, y: 40 }]; // outside [128..1152]x[72..648]

  const linted = HMComposeClient.lintShow({ show: demo }, { cameraPresets, fxPresets });
  assert.equal(linted.blocksBake, false);
  const safeFindings = linted.findings.filter(f => f.code === 'outside_title_safe');
  assert.equal(safeFindings.length, 3);
  for (const f of safeFindings) {
    assert.equal(f.category, 'safe');
    assert.equal(f.severity, 'warn');
    assert.equal(f.blocksBake, false);
  }
});

test('Issue #224 (HM-PF-28): FE importer and CLI gate reject root_motion and engine_export payloads with actionable reason', async () => {
  const png = tinyPng();
  const rootJson = Buffer.from(JSON.stringify({
    frames: 2,
    w: 4,
    h: 4,
    body_h: 2,
    fps: 12,
    kind: 'once',
    loop: false,
    root_motion: { dx: [0, 24] }
  }));

  assert.throws(
    () => HMStripAdapter.normalize(JSON.parse(rootJson.toString('utf8'))),
    /Unsupported strip field: root_motion — root_motion \/ engine-export payloads are rejected as a product import \(HM-PF-28\)\. HTML Motion is not an engine runtime; use the strip PNG\+JSON handoff\./
  );

  await assert.rejects(
    HMStripAdapter.stage([
      { name: 'root.strip.png', size: png.length, arrayBuffer: async () => Uint8Array.from(png).buffer },
      { name: 'root.strip.json', size: rootJson.length, arrayBuffer: async () => Uint8Array.from(rootJson).buffer },
    ], { decode: async () => ({ width: 8, height: 4 }) }),
    /strip PNG\+JSON handoff/
  );

  // Even selecting a standalone JSON file containing root_motion/engine_export gives the specific HM-PF-28 error
  await assert.rejects(
    HMStripAdapter.stage([
      { name: 'engine-export.json', size: rootJson.length, arrayBuffer: async () => Uint8Array.from(rootJson).buffer },
    ]),
    /root_motion \/ engine-export payloads are rejected as a product import \(HM-PF-28\)/
  );

  assert.throws(() => HMStripAdapter.assertNotRootMotion({ version: 1, show: { show_id: 'x', engine_export: { runtime: 'unity' }, atoms: [] } }), /not an engine runtime/);
  assert.throws(() => HMStripAdapter.assertNotRootMotion({ show_id: 'x', atoms: [{ id: 'a1', root_motion: { dx: 12 } }] }), /strip PNG\+JSON handoff/);

  const cli = classifyHandoff([
    { name: 'walk.png', bytes: png },
    { name: 'walk.json', bytes: Buffer.from(JSON.stringify({ frames: 2, w: 4, h: 4, body_h: 2, fps: 12, engine_export: { target: 'godot' } })) },
  ]);
  assert.equal(cli.ok, false);
  assert.equal(cli.rejected[0].reason, 'root-motion-hold');
  assert.match(cli.error, /not an engine runtime.*strip PNG\+JSON/i);

  const skill = fs.readFileSync(path.join(repo, 'skills/hm-spritegen-handoff/SKILL.md'), 'utf8');
  assert.match(skill, /HM-PF-28/);
  assert.match(skill, /not a product import/i);
  assert.match(skill, /engine runtime/i);
});

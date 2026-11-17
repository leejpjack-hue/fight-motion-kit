'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const HMStripAdapter = require('../public/ui/project-media.js');
const { classifyHandoff } = require('../skills/hm-spritegen-handoff/handoff.cjs');

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});

function pngChunk(type, data) {
  const b = Buffer.alloc(data.length + 12);
  b.writeUInt32BE(data.length, 0);
  b.write(type, 4);
  data.copy(b, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < b.length - 4; i++) crc = CRC_TABLE[(crc ^ b[i]) & 255] ^ (crc >>> 8);
  b.writeUInt32BE((crc ^ 0xffffffff) >>> 0, b.length - 4);
  return b;
}

function makePng(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit grayscale
  const rows = Buffer.alloc((width + 1) * height);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function memFile(name, buf) {
  const bytes = Buffer.isBuffer(buf) ? buf : Buffer.from(buf, 'utf8');
  return {
    name,
    size: bytes.length,
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  };
}

function nativeAtlasManifest(extra = {}) {
  return Object.assign({
    sheet_w: 96,
    sheet_h: 40,
    fps: 12,
    body_h: 24,
    frame_layout: [
      { id: 'idle_0', state: 'idle', x: 0, y: 0, w: 24, h: 30 },
      { id: 'idle_1', state: 'idle', x: 24, y: 0, w: 28, h: 30 },
      { id: 'strike_0', state: 'strike', rect: [52, 0, 44, 40] },
    ],
    states: {
      idle: { frames: ['idle_0', 'idle_1'], loop: true, fps: 12 },
      strike: { frames: [2], kind: 'once', fps: 24 },
    },
  }, extra);
}

test('Issue #225 (HM-PF-27): native atlas manifest uses explicit frame_layout rects without equal-grid inference', async () => {
  const raw = nativeAtlasManifest();
  assert.equal(HMStripAdapter.isNativeAtlasManifest(raw), true);
  assert.equal(HMStripAdapter.isAsepriteJson(raw), false);
  // No invented upstream version field required or emitted in metadata
  assert.equal('version' in raw, false);

  const normalized = HMStripAdapter.normalize(raw);
  assert.equal(normalized.format, 'native-atlas');
  assert.equal(normalized.status, 'pending');
  assert.equal(normalized.geometry.layoutMode, 'manifest-rects');
  assert.equal(normalized.geometry.sheetWidth, 96);
  assert.equal(normalized.geometry.sheetHeight, 40);
  assert.deepEqual(
    normalized.atlas.frameLayout.map(r => [r.x, r.y, r.w, r.h]),
    [[0, 0, 24, 30], [24, 0, 28, 30], [52, 0, 44, 40]]
  );
  assert.deepEqual(normalized.atlas.states.map(s => s.id), ['idle', 'strike']);
  assert.deepEqual(normalized.atlas.states[0].frames, [0, 1]);
  assert.deepEqual(normalized.atlas.states[1].frames, [2]);

  // Real PNG 96x40 stages cleanly (notice 96 != 3 * 24 and 40 != 30, so equal-grid assumption would fail!)
  const pngBytes = makePng(96, 40);
  const jsonBytes = Buffer.from(JSON.stringify(raw, null, 2));
  const staged = await HMStripAdapter.stage(
    [memFile('hero.atlas.png', pngBytes), memFile('hero.atlas.json', jsonBytes)],
    { decode: async () => ({ width: 96, height: 40 }) }
  );
  assert.equal(staged.pendingMotion.format, 'native-atlas');

  const panel = HMStripAdapter.buildStripQaPanel(staged.pendingMotion, raw);
  assert.equal(panel.ok, true);
  assert.ok(panel.fields.some(f => f.key === 'atlasLayout' && /native manifest rects/.test(f.value)));
  assert.ok(panel.fields.some(f => f.key === 'atlasStates' && f.value.includes('idle (2f)') && f.value.includes('strike (1f)')));

  // Committed project validates and decodes against explicit manifest rects
  const project = {
    version: 1,
    show: { show_id: 'atlas-check', atoms: [], overlays: [] },
    layouts: {},
    media: [],
    assets: {},
  };
  HMStripAdapter.append(project, staged);
  HMStripAdapter.validateProject(project);
  const PrevImage = global.Image;
  global.Image = class {
    set src(data) { this._data = data; }
    async decode() {
      const hdr = HMStripAdapter.pngHeader(Buffer.from(this._data.slice(22), 'base64'));
      this.naturalWidth = hdr.width;
      this.naturalHeight = hdr.height;
    }
  };
  try {
    await HMStripAdapter.decodeProject(project);
  } finally {
    if (PrevImage === undefined) delete global.Image;
    else global.Image = PrevImage;
  }

  // handoff.cjs classifies native atlas manifests separately from legacy manifest.json strip hold
  const gateOk = classifyHandoff([
    { name: 'hero.atlas.png', bytes: pngBytes },
    { name: 'hero.atlas.json', bytes: jsonBytes },
  ]);
  assert.equal(gateOk.ok, true);
  assert.equal(gateOk.path, 'atlas-native-manifest');

  // Out-of-bounds rectangle fails closed
  assert.throws(
    () => HMStripAdapter.normalize(nativeAtlasManifest({
      frame_layout: [{ id: 'bad', x: 70, y: 0, w: 32, h: 30 }],
      states: { idle: { frames: [0] } },
    })),
    /exceeds sheet_w/
  );

  // root_motion inside manifest or state fails closed (HM-PF-28 preserved)
  assert.throws(
    () => HMStripAdapter.normalize(nativeAtlasManifest({ root_motion: { dx: 2 } })),
    /HM-PF-28/
  );
  assert.throws(
    () => HMStripAdapter.normalize(nativeAtlasManifest({
      frame_layout: [{ id: 'f0', x: 0, y: 0, w: 24, h: 30, root_motion: [1, 2] }],
    })),
    /HM-PF-28/
  );

  // Aseprite-first JSON is rejected across normalize, stage, and classifyHandoff
  const aseprite = {
    frames: [{ filename: 'hero 0.aseprite', frame: { x: 0, y: 0, w: 24, h: 30 }, spriteSourceSize: { x: 0, y: 0, w: 24, h: 30 }, sourceSize: { w: 24, h: 30 } }],
    meta: { app: 'https://www.aseprite.org/', frameTags: [{ name: 'idle', from: 0, to: 0 }] },
  };
  assert.equal(HMStripAdapter.isAsepriteJson(aseprite), true);
  assert.throws(() => HMStripAdapter.normalize(aseprite), /Aseprite JSON is not the first path/);
  await assert.rejects(
    () => HMStripAdapter.stage([memFile('ase.png', pngBytes), memFile('ase.json', Buffer.from(JSON.stringify(aseprite)))], { decode: async () => ({ width: 96, height: 40 }) }),
    /Aseprite JSON is not the first path/
  );
  const aseGate = classifyHandoff([
    { name: 'ase.png', bytes: pngBytes },
    { name: 'ase.json', bytes: Buffer.from(JSON.stringify(aseprite)) },
  ]);
  assert.equal(aseGate.ok, false);
  assert.equal(aseGate.rejected[0].reason, 'aseprite-hold');
});

test('Issue #226 (HM-PF-47): hm-voice-track skill shell documents VO/SFX hook contract, keeps #41 shipped, and stays non-live', () => {
  const skill = read('skills/hm-voice-track/SKILL.md');
  const note = read('docs/product-flow/HM-PF-47-voice-track-skill-shell.md');

  assert.match(skill, /\*\*Status:\*\* DESIGNED-HOLD/);
  assert.match(skill, /\*\*Not SIGNED\.\*\*/);
  assert.match(skill, /already shipped/i);
  assert.match(skill, /HM-PF-47/);
  assert.match(skill, /HM-PF-48/);
  assert.match(skill, /Do not enable n8n step 10/);
  assert.match(skill, /What stays \*\*outside\*\* the FE composer/i);
  assert.match(skill, /cloud TTS/i);
  assert.match(skill, /voice recorder/i);
  assert.doesNotMatch(skill, /```/);
  assert.doesNotMatch(skill, /\b(require|import|function)\s*\(/);
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'skills/hm-voice-track')).sort(), ['SKILL.md']);

  assert.match(note, /HM-PF-47/);
  assert.match(note, /#41/);
  assert.match(note, /clash-sfx-clock\.js/);
  assert.match(note, /DISABLED|held/i);
});

test('Issue #227 (HM-PF-48): SFX #41 lift criteria checklist audits shipped tip 35ee259 with honest statuses', () => {
  const checklist = read('docs/product-flow/HM-PF-48-sfx-41-lift-checklist.md');
  const sameClock = read('docs/product-flow/HM-SFX-SAME-CLOCK.md');

  assert.match(checklist, /HM-PF-48/);
  assert.match(checklist, /35ee259/);
  assert.match(checklist, /renderAt/);
  assert.match(checklist, /Silent default/i);
  assert.match(checklist, /Pre-Hero Silence/i);
  assert.match(checklist, /-14 LUFS/);
  assert.match(checklist, /\*\*PASS\*\*/);
  assert.match(checklist, /\*\*RESIDUAL GAP\*\*/);
  assert.match(checklist, /public\/ui\/clash-sfx-clock\.js/);
  assert.match(checklist, /scripts\/clash-sfx-clock\.cjs/);
  assert.doesNotMatch(checklist, /api\.teqcon\.uk|:8770|wrangler deploy/);
  assert.match(sameClock, /HM-PF-48-sfx-41-lift-checklist\.md/);
});

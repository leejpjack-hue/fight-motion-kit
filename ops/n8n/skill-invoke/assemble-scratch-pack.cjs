'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const SHOW_ID = 'baijia-elfmage-void-array';

// Seven generated key holds cover the approved 47 beats. This is not the
// 377-frame densified pack. Camera and timing stay on the source show.
const RANGES = [
  [1, 1, 'k01'],
  [2, 2, 'k02'],
  [3, 8, 'k03'],
  [9, 11, 'k01'],
  [12, 19, 'k03'],
  [20, 25, 'k04'],
  [26, 29, 'k05'],
  [30, 34, 'k03'],
  [35, 36, 'k06'],
  [37, 42, 'k03'],
  [43, 47, 'k07'],
];

const KEY_FILES = {
  k01: 'va-k01-open.jpg',
  k02: 'va-k02-magic.jpg',
  k03: 'va-k03b-clash.jpg',
  k04: 'va-k04-midair.jpg',
  k05: 'va-k05-disarm.jpg',
  k06: 'va-k06-freeze.jpg',
  k07: 'va-k07-end.jpg',
};

const DRIFT = [
  'Key holds, not Pipeline B densify: 7 plates stand in for P01–P47. In-between attack frames do not exist.',
  'Hair: the spearman reads as a tied white tail with a blue headband. Some keys are looser than warrior-main-v5.',
  'Spear: one shaft, tip toward screen-right. k03 stops the tip on her palm. k04’s tip meets her in the air; his rear foot is closer to a lunge than a full float.',
  'Disarm k05 has no spear. His hair is spikier than the lock. Her two open hands match the unarmed beat.',
  'Elf ears, teal robe, cream underlayer, and gray soft boots hold. High side slits are not always readable.',
  'Magic: k02 has a cyan orb in the right palm. Hit sparks on k03/k05/k06 are small contact marks, not the composer flash overlays.',
  'White backdrop is keyed so the show’s void-circle background can show through. Near-white armor highlights can thin.',
];

function plateId(n) {
  return 'P' + String(n).padStart(2, '0');
}

function assignments() {
  const map = {};
  for (const [start, end, key] of RANGES) {
    for (let n = start; n <= end; n += 1) map[plateId(n)] = key;
  }
  return map;
}

function layoutFor(map) {
  const layout = {};
  for (const [id, key] of Object.entries(map)) {
    layout[id] = {
      id,
      kind: 'duo',
      bg: 'base',
      floor: 684,
      full: 'cutout/' + key + '.png',
    };
  }
  return layout;
}

function keySources(src) {
  const missing = [];
  const found = {};
  for (const [key, file] of Object.entries(KEY_FILES)) {
    const full = path.join(src, file);
    if (!fs.existsSync(full)) missing.push(file);
    else found[key] = full;
  }
  return { missing, found };
}

const WIDTH = 1280;
const HEIGHT = 720;

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}

function writeRgbaPng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const start = y * (1 + width * 4);
    raw[start] = 0;
    rgba.copy(raw, start + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function keyBackdrop(rgba, width, height) {
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (seen[i]) return;
    const o = i * 4;
    if (rgba[o] < 246 || rgba[o + 1] < 246 || rgba[o + 2] < 246) return;
    seen[i] = 1;
    queue[tail++] = i;
  };
  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    const y = (i - x) / width;
    rgba[i * 4 + 3] = 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
}

function keyCutout(ffmpeg, input, output) {
  const result = spawnSync(ffmpeg, [
    '-v', 'error', '-i', input,
    '-vf', 'scale=' + WIDTH + ':' + HEIGHT + ':force_original_aspect_ratio=decrease,pad=' + WIDTH + ':' + HEIGHT + ':(ow-iw)/2:(oh-ih)/2:white',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1',
  ], { maxBuffer: WIDTH * HEIGHT * 4 + 1024 });
  if (result.status !== 0) {
    throw new Error((result.stderr || 'ffmpeg failed').toString().trim().slice(-400));
  }
  const rgba = result.stdout;
  if (!Buffer.isBuffer(rgba) || rgba.length !== WIDTH * HEIGHT * 4) {
    throw new Error('Expected a ' + WIDTH + 'x' + HEIGHT + ' frame, got ' + (rgba ? rgba.length : 0) + ' bytes');
  }
  keyBackdrop(rgba, WIDTH, HEIGHT);
  fs.writeFileSync(output, writeRgbaPng(WIDTH, HEIGHT, rgba));
}

function assemble({ src, out, ffmpeg = 'ffmpeg' }) {
  const map = assignments();
  const ids = Object.keys(map);
  if (ids.length !== 47) throw new Error('Expected 47 plate assignments, got ' + ids.length);
  const { missing, found } = keySources(src);
  if (missing.length) {
    return { ok: false, reason: 'missing-keys', missing, plates: ids.length };
  }
  const cutout = path.join(out, 'cutout');
  fs.mkdirSync(cutout, { recursive: true });
  for (const [key, input] of Object.entries(found)) {
    keyCutout(ffmpeg, input, path.join(cutout, key + '.png'));
  }
  const layout = layoutFor(map);
  const layoutFile = path.join(out, 'layout.json');
  fs.writeFileSync(layoutFile, JSON.stringify(layout, null, 1) + '\n');
  fs.writeFileSync(path.join(out, 'drift.json'), JSON.stringify({
    show_id: SHOW_ID,
    keys: Object.keys(KEY_FILES),
    plates: ids.length,
    notes: DRIFT,
  }, null, 1) + '\n');
  return {
    ok: true,
    reason: 'scratch-pack',
    plates: ids.length,
    keys: Object.keys(found).length,
    layout: layoutFile,
    out,
  };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    if (!flag || !flag.startsWith('--') || !argv[i + 1]) throw new Error('Use --src DIR --out DIR');
    out[flag.slice(2)] = argv[i + 1];
  }
  return out;
}

if (require.main === module) {
  const opt = parseArgs(process.argv.slice(2));
  if (!opt.src || !opt.out) {
    console.error('Use --src DIR --out DIR');
    process.exit(1);
  }
  const result = assemble({ src: opt.src, out: opt.out, ffmpeg: opt.ffmpeg || 'ffmpeg' });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

module.exports = { SHOW_ID, KEY_FILES, assignments, layoutFor, assemble, DRIFT };

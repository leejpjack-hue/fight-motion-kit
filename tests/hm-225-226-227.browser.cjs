'use strict';

const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
const MIMES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

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
  ihdr[8] = 8;
  const rows = Buffer.alloc((width + 1) * height);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function ensureServer(urlStr) {
  const ok = await new Promise(resolve => {
    const req = http.get(urlStr + '/ui/', res => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.setTimeout(600, () => { req.destroy(); resolve(false); });
  });
  if (ok) return null;
  const root = path.resolve('public');
  const srv = http.createServer((req, res) => {
    const clean = decodeURIComponent(new URL(req.url, urlStr).pathname).replace(/^\/+/, '');
    let fp = path.resolve(root, clean);
    if (!fp.startsWith(root)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
    if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': MIMES[path.extname(fp)] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  });
  const u = new URL(urlStr);
  await new Promise((resolve, reject) => { srv.once('error', reject); srv.listen(+u.port || 0, u.hostname || '127.0.0.1', resolve); });
  srv.unref();
  return srv;
}

(async () => {
  const srv = await ensureServer(base);
  const actualBase = srv ? `http://127.0.0.1:${srv.address().port}` : base;
  const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--disable-gpu'] });

  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = [], external = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('dialog', d => d.accept());
    ctx.on('request', req => {
      const u = req.url();
      if (!u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== new URL(actualBase).origin) external.push(u);
    });

    await page.goto(actualBase + '/ui/');
    await page.evaluate(() => window.ready);
    await page.waitForFunction(() => window.HMStudio && HMStudio.project?.show?.show_id === 'daiyu-wang-five-seconds' && HMStudio.duration === 5);

    const pngBuf = makePng(96, 40);
    const nativeManifest = Buffer.from(JSON.stringify({
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
    }, null, 2));

    // Reject Aseprite JSON before native path
    await page.click('#importStrip');
    await page.setInputFiles('#stripInput', [
      { name: 'ase.png', mimeType: 'image/png', buffer: pngBuf },
      { name: 'ase.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
        frames: [{ frame: { x: 0, y: 0, w: 24, h: 30 }, spriteSourceSize: { x: 0, y: 0, w: 24, h: 30 }, sourceSize: { w: 24, h: 30 } }],
        meta: { app: 'Aseprite', frameTags: [] },
      })) },
    ]);
    await page.waitForFunction(() => !document.getElementById('stripQaError').hidden);
    const aseError = await page.textContent('#stripQaError');
    assert.match(aseError, /Aseprite JSON is not the first path/);
    assert.equal(await page.isDisabled('#commitStrip'), true);

    // Stage native multi-state atlas manifest with explicit non-uniform rectangles
    await page.setInputFiles('#stripInput', [
      { name: 'hero.atlas.png', mimeType: 'image/png', buffer: pngBuf },
      { name: 'hero.atlas.json', mimeType: 'application/json', buffer: nativeManifest },
    ]);
    await page.waitForFunction(() => !document.getElementById('commitStrip').disabled);

    const qaRows = await page.evaluate(() => Array.from(document.querySelectorAll('#stripQaFields .strip-qa-row')).map(r => r.textContent));
    assert.ok(qaRows.some(r => r.includes('native manifest rects') && r.includes('3 rects')), qaRows.join(' | '));
    assert.ok(qaRows.some(r => r.includes('idle (2f)') && r.includes('strike (1f)')), qaRows.join(' | '));

    await page.click('#commitStrip');
    await page.waitForFunction(() => !HMStudio.pendingCommit && !document.getElementById('stripDialog').open);

    const pending = await page.evaluate(() => HMStudio.project.media.find(m => m.pendingMotion));
    assert.ok(pending);
    assert.equal(pending.pendingMotion.format, 'native-atlas');
    assert.deepEqual(pending.pendingMotion.atlas.frameLayout.map(r => [r.x, r.y, r.w, r.h]), [[0, 0, 24, 30], [24, 0, 28, 30], [52, 0, 44, 40]]);
    assert.deepEqual(pending.pendingMotion.atlas.states.map(s => s.id), ['idle', 'strike']);

    // Portable round-trip via Save + Open
    const dl = page.waitForEvent('download');
    await page.click('#saveProject');
    const saved = await dl;
    const parts = [];
    for await (const ch of await saved.createReadStream()) parts.push(ch);
    const savedBuf = Buffer.concat(parts);
    await page.setInputFiles('#projectInput', { name: 'atlas-roundtrip.motion.json', mimeType: 'application/json', buffer: savedBuf });
    await page.waitForFunction(() => !HMStudio.loading && HMStudio.project.media.some(m => m.pendingMotion?.format === 'native-atlas'));

    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log('PASS Issues #225, #226, #227 browser E2E (Native Multi-State Atlas, Aseprite-first reject, Portable Round-Trip)');
  } finally {
    await browser.close();
  }
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

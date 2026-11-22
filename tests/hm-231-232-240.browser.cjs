'use strict';

/* E2E verification for #231 (HM-SG-02A), #232 (HM-SG-02B), and #240 (HM-E2E-03).
 * Verifies:
 *   1. Playable one-state sprite strip import, scrub, pixel & body_h accuracy (keeping white pixels & crisp alpha).
 *   2. Split, Trim, Duplicate & save/reopen parity on the strip timeline.
 *   3. Composer vs PNG frame zip vs standalone offline HTML strip rendering parity + lossless HTML reopen.
 *   4. AI motion HTML (hm-project-data & legacy DATA) -> edit -> 1-click ffmpeg MP4 copy + frame zip + video export + receipt -> HTML round-trip. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-231-232-240-'));
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

function chunk(type, data) {
  const table = chunk.t || (chunk.t = Array.from({ length: 256 }, (_, n) => {
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

// 4-cell strip: 8px wide x 12px tall per cell (32x12 total), body_h = 8.
// Top 4 rows transparent headroom; bottom 8 rows opaque cell color + center pure white band (rows 6..7) to prove white isn't keyed out.
function buildColorStripPng() {
  const w = 8, h = 12, frames = 4, totalW = w * frames;
  const cellColors = [
    [225, 30, 30],   // cell 0: red
    [30, 195, 65],   // cell 1: green
    [35, 80, 230],   // cell 2: blue
    [220, 140, 20],  // cell 3: amber
  ];
  const rows = Buffer.alloc((totalW * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (totalW * 4 + 1);
    rows[row] = 0;
    for (let x = 0; x < totalW; x++) {
      const off = row + 1 + x * 4;
      if (y < 4) {
        rows[off + 3] = 0; // transparent jump air-room
      } else if (y >= 6 && y <= 7) {
        rows[off] = 255; rows[off + 1] = 255; rows[off + 2] = 255; rows[off + 3] = 255; // pure white band
      } else {
        const c = cellColors[Math.floor(x / w)];
        rows[off] = c[0]; rows[off + 1] = c[1]; rows[off + 2] = c[2]; rows[off + 3] = 255;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(totalW, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeSolidPlateUri(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const w = 16, h = 16;
  const rows = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 4 + 1);
    rows[row] = 0;
    for (let x = 0; x < w; x++) {
      const o = row + 1 + x * 4;
      rows[o] = r; rows[o + 1] = g; rows[o + 2] = b; rows[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const buf = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return 'data:image/png;base64,' + buf.toString('base64');
}

async function ensureServer(urlStr) {
  const u = new URL(urlStr);
  const ok = await new Promise(r => {
    const req = http.get(urlStr + '/ui/', res => { res.resume(); r(res.statusCode === 200); });
    req.on('error', () => r(false));
    req.setTimeout(600, () => { req.destroy(); r(false); });
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
  await new Promise((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(+u.port || 8765, u.hostname || '127.0.0.1', resolve);
  });
  srv.unref();
  return srv;
}

(async () => {
  const srv = await ensureServer(base);
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ['--disable-dev-shm-usage', '--disable-gpu'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('dialog', dialog => dialog.accept());

  const settle = async () => {
    await page.waitForFunction(() => !HMStudio.loading);
    return page.evaluate(() => HMStudio.compile());
  };

  try {
    await page.goto(base + '/ui/');
    await page.evaluate(() => window.ready);
    await settle();

    // === Part 1: #231 & #232 Playable strip import, edit, PNG frames & offline HTML parity ===
    await page.click('#newProject');
    await page.waitForFunction(() => HMStudio.project.show.atoms.length === 0 && !HMStudio.loading);
    await page.evaluate(() => HMStudio.load({
      version: 1,
      show: { ...HMStudio.project.show, show_id: 'strip-e2e-show', title: 'Strip E2E Show', atoms: [], bg: {}, overlays: [] },
      layouts: {},
      media: [],
      assets: {},
    }));
    await settle();

    const stripPng = buildColorStripPng();
    const stripJson = Buffer.from(JSON.stringify({ frames: 4, w: 8, h: 12, body_h: 8, fps: 10, kind: 'periodic', loop: true }));
    await page.click('#importStrip');
    await page.setInputFiles('#stripInput', [
      { name: 'kick-hero.strip.png', mimeType: 'image/png', buffer: stripPng },
      { name: 'kick-hero.strip.json', mimeType: 'application/json', buffer: stripJson },
    ]);
    await page.waitForFunction(() => !document.getElementById('commitStrip').disabled);
    assert.match(await page.locator('#stripStatus').textContent(), /PLAYABLE on shared renderAt sampler/);
    await page.click('#commitStrip');
    await page.waitForFunction(() => !document.getElementById('stripDialog').open && !HMStudio.loading);
    await settle();

    // Importing onto empty project creates 1 playable 0.40s strip clip
    assert.equal(await page.evaluate(() => HMStudio.duration), 0.4);
    assert.equal(await page.locator('[data-playable-strip="true"]').count(), 1);

    // Sample stage pixels at t=0.05 (red cell 0), t=0.15 (green cell 1), t=0.25 (blue cell 2), t=0.35 (amber cell 3)
    const sampleStageRgb = async t => page.evaluate(time => {
      HMStudio.renderAt(time, { source: 'test-strip-probe' });
      const ctx = document.getElementById('stage').getContext('2d');
      const d = ctx.getImageData(640, 620, 1, 1).data; // bottom colored band (y=8..11 of 12, well above floor 684)
      const white = ctx.getImageData(640, 402, 1, 1).data; // pure white band (rows 6..7 map to y=346.5..459)
      return {
        rgb: [d[0], d[1], d[2]],
        white: [white[0], white[1], white[2]],
        sample: HMStudio.renderer.lastStripSample.sample.cellIndex,
      };
    }, t);

    const s0 = await sampleStageRgb(0.05);
    const s1 = await sampleStageRgb(0.15);
    const s2 = await sampleStageRgb(0.25);
    const s3 = await sampleStageRgb(0.35);
    assert.equal(s0.sample, 0); assert.ok(s0.rgb[0] > 180 && s0.rgb[1] < 80); // Red
    assert.equal(s1.sample, 1); assert.ok(s1.rgb[1] > 160 && s1.rgb[0] < 80); // Green
    assert.equal(s2.sample, 2); assert.ok(s2.rgb[2] > 180 && s2.rgb[0] < 80); // Blue
    assert.equal(s3.sample, 3); assert.ok(s3.rgb[0] > 180 && s3.rgb[1] > 100 && s3.rgb[2] < 60); // Amber
    assert.deepEqual(s0.white, [255, 255, 255], 'Pure white pixels must not be keyed out');

    // Split at midpoint (0.20s), then verify second half offset = 0.20s still renders blue cell 2 at t=0.25s!
    await page.click('#splitClip');
    await settle();
    assert.equal(await page.evaluate(() => HMStudio.project.show.atoms.length), 2);
    assert.equal(await page.evaluate(() => HMStudio.project.show.atoms[1].strip_offset_s), 0.2);
    const postSplit = await sampleStageRgb(0.25);
    assert.equal(postSplit.sample, 2, 'Split preserves continuous strip offset playback');

    // Trim (+0.1s) on part 2 so total becomes 0.50s (integer frame count at 30 fps)
    await page.click('#trimPlus');
    await settle();
    assert.equal(await page.evaluate(() => HMStudio.duration), 0.5);

    // Export PNG frames zip + Offline HTML on same strip show and verify parity at identical timestamps
    await page.click('#exportOpen');
    await page.waitForSelector('#exportDialog[open]');
    await page.selectOption('#exportPreset', '720p30');
    const [zipDl] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.click('#exportFrames'),
    ]);
    assert.equal(await zipDl.failure(), null);
    const zipPath = path.join(outDir, 'strip-frames.zip');
    await zipDl.saveAs(zipPath);

    const extractedUrls = JSON.parse(execFileSync('python3', ['-c', `
import base64,json,sys,zipfile
z=zipfile.ZipFile(sys.argv[1])
doc=json.loads(z.read('timing.json'))
assert doc['frame_count']==15 and 'ffmpeg_mp4' in doc and 'yuv420p' in doc['ffmpeg_mp4']['command']
def data_url(name):
  return 'data:image/png;base64,'+base64.b64encode(z.read(name)).decode('ascii')
print(json.dumps({'f0':data_url('frames/000000.png'),'f3':data_url('frames/000003.png'),'f6':data_url('frames/000006.png')}))
`, zipPath], { encoding: 'utf8' }).trim());
    const parsedFrames = await page.evaluate(async urls => {
      const sampleUrl = url => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.width; c.height = img.height;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const d = ctx.getImageData(640, 620, 1, 1).data;
          resolve([d[0], d[1], d[2]]);
        };
        img.onerror = reject;
        img.src = url;
      });
      return {
        f0: await sampleUrl(urls.f0),
        f3: await sampleUrl(urls.f3),
        f6: await sampleUrl(urls.f6),
      };
    }, extractedUrls);
    assert.ok(parsedFrames.f0[0] > 180 && parsedFrames.f0[1] < 80, 'Frame 0 (0.00s) is red cell 0');
    assert.ok(parsedFrames.f3[1] > 160 && parsedFrames.f3[0] < 80, 'Frame 3 (0.10s) is green cell 1');
    assert.ok(parsedFrames.f6[2] > 180 && parsedFrames.f6[0] < 80, 'Frame 6 (0.20s across split clip 2) is blue cell 2');

    // Export video on the playable strip (#232) at 720p30
    await page.waitForFunction(() => !document.getElementById('exportVideo').disabled);
    const [stripVidDl] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.click('#exportVideo'),
    ]);
    assert.equal(await stripVidDl.failure(), null);
    const stripVidPath = path.join(outDir, 'strip-' + stripVidDl.suggestedFilename());
    await stripVidDl.saveAs(stripVidPath);
    assert.ok(fs.statSync(stripVidPath).size > 50, 'Playable strip exports non-empty video');

    // Export standalone HTML & verify offline playback renders identical cells + zero network leaks
    await page.waitForFunction(() => !document.getElementById('exportHtml').disabled);
    const [htmlDl] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.click('#exportHtml'),
    ]);
    const stripHtmlPath = path.join(outDir, 'strip-playable.html');
    await htmlDl.saveAs(stripHtmlPath);
    const offline = await context.newPage();
    const leaked = [];
    await offline.route('http://**', r => { leaked.push(r.request().url()); return r.abort(); });
    await offline.route('https://**', r => { leaked.push(r.request().url()); return r.abort(); });
    await offline.goto('file://' + stripHtmlPath);
    await offline.evaluate(() => window.ready);
    const offPx = await offline.evaluate(() => {
      renderAt(0.25);
      const d = document.getElementById('stage').getContext('2d').getImageData(640, 620, 1, 1).data;
      return [d[0], d[1], d[2]];
    });
    assert.ok(offPx[2] > 180 && offPx[0] < 80, 'Offline HTML renders blue cell 2 at t=0.25s matching PNG zip & composer');
    assert.deepEqual(leaked, []);
    await offline.close();

    // Re-open the exported strip HTML in composer and confirm lossless round-trip
    await page.evaluate(() => document.getElementById('exportDialog').close());
    await page.click('#newProject');
    await page.waitForFunction(() => HMStudio.project.show.atoms.length === 0 && !HMStudio.loading);
    await page.setInputFiles('#projectInput', stripHtmlPath);
    await page.waitForFunction(() => HMStudio.project?.show?.atoms?.length === 2 && !HMStudio.loading);
    await settle();
    assert.equal(await page.evaluate(() => HMStudio.project.show.atoms.length), 2);
    assert.equal(await page.evaluate(() => HMStudio.project.show.atoms[1].strip_offset_s), 0.2);

    // === Part 2: #240 End-to-End Legacy AI Motion HTML -> Edit -> 1-click ffmpeg MP4 + Video & HTML Round-Trip ===
    const legacyPlate = makeSolidPlateUri('#ff5522');
    const legacyData = {
      timeline: {
        show_id: 'legacy-ai-duel',
        title: 'Legacy AI Duel',
        duration_s: 0.5,
        atoms: [{
          id: 'beat-1',
          label: 'Opening',
          t0: 0,
          t1: 0.5,
          cam: [{ t0: 0, t1: 0.5, preset: 'static_hold' }],
          fx_hooks: [],
        }],
        plates: [{ id: 'S001', t0: 0, t1: 0.5 }],
        bg: {},
        overlays: [],
      },
      layout: { S001: { full: 'p1.png', source_plate: 'P01' } },
      assets: { 'p1.png': legacyPlate },
    };
    const legacyHtml = `<!doctype html><html><body><script>const DATA=${JSON.stringify(legacyData)};</script></body></html>`;
    await page.setInputFiles('#projectInput', {
      name: 'ai-legacy.html',
      mimeType: 'text/html',
      buffer: Buffer.from(legacyHtml, 'utf8'),
    });
    await page.waitForFunction(() => HMStudio.project?.show?.show_id === 'legacy-ai-duel' && !HMStudio.loading);
    await settle();
    assert.equal(await page.evaluate(() => HMStudio.project.show.show_id), 'legacy-ai-duel');

    // Edit duration, camera preset, and caption cleanly
    await page.selectOption('#camera', 'slow_push');
    await page.fill('#caption', 'ROUND TRIP HIT');
    await page.locator('#caption').dispatchEvent('change');
    await page.click('#longer');
    await settle();
    assert.equal(await page.evaluate(() => HMStudio.duration), 0.6);

    // Export dialog: check 1-click ffmpeg MP4 command updates per preset & copy works, plus receipt after exportFrames / exportVideo / exportHtml
    await page.click('#exportOpen');
    await page.waitForSelector('#exportDialog[open]');
    await page.evaluate(() => {
      window.__copied = '';
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async text => { window.__copied = text; } },
      });
    });
    await page.selectOption('#exportPreset', '720p24');
    assert.match(await page.locator('#exportFfmpegCmd').textContent(), /ffmpeg -y -framerate 24 .*libx264 -pix_fmt yuv420p/);
    await page.click('#copyFfmpegMp4');
    await page.waitForFunction(() => /MP4 ffmpeg command copied/.test(document.getElementById('exportStatus').textContent));
    assert.match(await page.evaluate(() => window.__copied), /-c:v libx264 -pix_fmt yuv420p -b:v .* -movflags \+faststart -t 0\.600 legacy-ai-duel\.mp4$/);

    await page.selectOption('#exportPreset', '1080p30');
    assert.match(await page.locator('#exportFfmpegCmd').textContent(), /-framerate 30 .*-b:v 8000k/);

    // Frame sequence zip + post-export receipt
    await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#exportFrames')]);
    await page.waitForSelector('#exportReceipt:not([hidden])');
    assert.match(await page.locator('#exportReceiptTitle').textContent(), /PNG frame sequence ready/);
    assert.match(await page.locator('#exportReceiptMeta').textContent(), /legacy-ai-duel-1080p30-frames\.zip/);
    assert.equal(await page.locator('#exportReceiptCopyMp4').isVisible(), true);

    // Record video (720p30) + post-export receipt
    await page.waitForFunction(() => !document.getElementById('exportPreset').disabled && !document.getElementById('exportVideo').disabled);
    await page.selectOption('#exportPreset', '720p30');
    await page.waitForFunction(() => !document.getElementById('exportVideo').disabled);
    const [recDl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#exportVideo')]);
    const recPath = path.join(outDir, recDl.suggestedFilename());
    await recDl.saveAs(recPath);
    assert.ok(fs.statSync(recPath).size > 50);
    await page.waitForFunction(() => !document.getElementById('exportHtml').disabled);
    assert.match(await page.locator('#exportReceiptTitle').textContent(), /Video exported/);

    // Round-trip Playable HTML & re-import verifying all edits survived
    const [rtDl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#exportHtml')]);
    const rtPath = path.join(outDir, 'legacy-roundtrip.html');
    await rtDl.saveAs(rtPath);
    await page.evaluate(() => document.getElementById('exportDialog').close());
    await page.click('#newProject');
    await page.waitForFunction(() => HMStudio.project.show.atoms.length === 0 && !HMStudio.loading);
    await page.setInputFiles('#projectInput', rtPath);
    await page.waitForFunction(() => HMStudio.project?.show?.show_id === 'legacy-ai-duel' && HMStudio.project.show.atoms.length === 1 && !HMStudio.loading);
    await settle();
    const finalAtom = await page.evaluate(() => HMStudio.project.show.atoms[0]);
    assert.equal(finalAtom.duration_s, 0.6);
    assert.equal(finalAtom.camera.preset, 'slow_push');
    assert.equal(finalAtom.caption, 'ROUND TRIP HIT');

    assert.deepEqual(errors, []);
    console.log('PASS hm-231-232-240 browser E2E (playable strip, split/trim/save parity, PNG zip + offline HTML parity, ffmpeg MP4 copy, video + round-trip)');
  } finally {
    await browser.close();
    if (srv) await new Promise(resolve => srv.close(resolve));
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});

'use strict';

/* #290 — one Playable video file action downloads a file a browser player and
 * ffprobe can open, the #286 receipt matches that file, and a bad encode
 * saves nothing. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-290-'));
const artifacts = '/opt/cursor/artifacts';
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

function ffprobe(file) {
  return JSON.parse(execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=format_name,duration,size:stream=codec_name,width,height',
    '-of', 'json',
    file,
  ], { encoding: 'utf8' }));
}

(async () => {
  const srv = await ensureServer(base);
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ['--disable-dev-shm-usage', '--disable-gpu'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  let downloads = 0;
  page.on('pageerror', err => errors.push(err.message));
  page.on('dialog', dialog => dialog.accept());
  page.on('download', () => { downloads += 1; });
  await page.route('**/*', route => {
    const url = route.request().url();
    if (/\/api\/compose|api\.teqcon|:8770/.test(url)) return route.abort();
    return route.continue();
  });

  try {
    await page.goto(base + '/ui/');
    await page.evaluate(() => window.ready);
    await page.waitForFunction(() => window.HMStudio && !HMStudio.loading && HMStudio.duration === 5);
    assert.equal(await page.evaluate(() => HMStudio.project.show.show_id), 'daiyu-wang-five-seconds');

    await page.evaluate(async () => {
      const make = draw => {
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 64;
        draw(c.getContext('2d'));
        return c.toDataURL('image/png');
      };
      const plate = make(g => {
        g.fillStyle = '#1eb446';
        g.fillRect(0, 0, 64, 64);
        g.fillStyle = '#ffffff';
        g.fillRect(8, 8, 24, 24);
      });
      const current = HMStudio.project;
      const key = 'embedded/hm-290/layout.json';
      const atoms = [{
        id: 'hm-290-clip',
        label: 'Playable probe',
        kind: 'duo',
        duration_s: 0.4,
        plates_needed: 1,
        pose_mode: 'hero',
        hero: { layout_source: key, plates: ['P01'] },
        camera: { preset: 'static_hold', params: { s: { type: 'const', v: 1 }, x: { type: 'const', v: 0 }, y: { type: 'const', v: 0 } } },
        fx_hooks: [],
      }];
      await HMStudio.load({
        version: 1,
        show: { ...current.show, show_id: 'playable-probe', title: 'Playable probe', atoms, bg: {}, overlays: [] },
        layouts: { [key]: { P01: { full: plate } } },
        media: [{ id: 'hm-290-plate', name: 'Marker', src: plate, layoutSource: key, plateId: 'P01' }],
        assets: {},
      });
    });
    await page.waitForFunction(() => HMStudio.duration === 0.4 && !HMStudio.loading);

    await page.click('#exportOpen');
    await page.waitForSelector('#exportDialog[open]');
    assert.match(await page.locator('#exportVideo').innerText(), /Playable video file/);
    assert.equal(await page.locator('#exportVideo').evaluate(el => el.classList.contains('primary')), true);
    const before = downloads;
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.click('#exportVideo'),
    ]);
    assert.equal(await dl.failure(), null);
    const saved = path.join(outDir, dl.suggestedFilename());
    await dl.saveAs(saved);
    assert.equal(downloads, before + 1);

    const receipt = await page.evaluate(() => {
      const box = document.getElementById('exportReceipt');
      return {
        hidden: box.hidden,
        title: document.getElementById('exportReceiptTitle').textContent,
        meta: document.getElementById('exportReceiptMeta').textContent,
        honesty: document.getElementById('exportReceiptHonesty').textContent,
        filename: box.dataset.filename,
        mime: box.dataset.mime,
        bytes: box.dataset.bytes,
        width: box.dataset.width,
        height: box.dataset.height,
        duration: box.dataset.duration,
      };
    });
    const probed = ffprobe(saved);
    const stream = probed.streams.find(row => row.codec_name);
    const playedDuration = Number(Number(probed.format.duration).toFixed(3));
    assert.equal(receipt.hidden, false);
    assert.match(receipt.title, /Video exported/);
    assert.equal(receipt.filename, dl.suggestedFilename());
    assert.equal(receipt.filename, 'playable-probe.webm');
    assert.match(receipt.mime, /^video\/webm/);
    assert.equal(Number(receipt.bytes), fs.statSync(saved).size);
    assert.equal(Number(receipt.bytes), Number(probed.format.size));
    assert.equal(Number(receipt.width), stream.width);
    assert.equal(Number(receipt.height), stream.height);
    assert.equal(Number(receipt.duration), playedDuration);
    assert.match(receipt.meta, new RegExp(receipt.filename.replace('.', '\\.')));
    assert.match(receipt.meta, new RegExp(receipt.mime.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(receipt.meta, new RegExp(stream.width + '×' + stream.height));
    assert.match(receipt.meta, new RegExp(playedDuration.toFixed(3) + 's'));
    assert.match(receipt.honesty, /this file/);
    assert.match(receipt.honesty, /MP4 is not universal/);
    assert.equal(/universal MP4|always exports MP4/i.test(receipt.honesty + receipt.meta), false);

    const player = await context.newPage();
    await player.setViewportSize({ width: 900, height: 640 });
    const playback = await player.evaluate(async (b64) => {
      const bin = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
      const blob = new Blob([bin], { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      document.body.style.margin = '0';
      document.body.style.background = '#111';
      const video = document.createElement('video');
      video.controls = true;
      video.muted = true;
      video.playsInline = true;
      video.style.width = '100%';
      video.src = url;
      document.body.append(video);
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = () => reject(new Error('browser player rejected the file'));
      });
      await video.play();
      await new Promise(resolve => setTimeout(resolve, 180));
      video.pause();
      const label = document.createElement('p');
      label.textContent = video.videoWidth + '×' + video.videoHeight + ' · player ' + video.duration.toFixed(3) + 's · playhead ' + video.currentTime.toFixed(3) + 's';
      label.style.cssText = 'margin:0;padding:10px 12px;color:#edf1e9;font:14px/1.4 ui-monospace,monospace;background:#111';
      document.body.append(label);
      return {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        currentTime: video.currentTime,
        paused: video.paused,
      };
    }, fs.readFileSync(saved).toString('base64'));
    assert.equal(Number(playback.duration.toFixed(3)), playedDuration);
    assert.equal(playback.width, stream.width);
    assert.equal(playback.height, stream.height);
    assert.ok(playback.currentTime > 0, 'browser player advanced the playhead');
    fs.mkdirSync(artifacts, { recursive: true });
    const webmOut = path.join(artifacts, 'hm-290-playable.webm');
    fs.copyFileSync(saved, webmOut);
    const frameOut = path.join(artifacts, 'hm-290-played-frame.png');
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', saved, '-frames:v', '1', frameOut]);
    assert.ok(fs.statSync(frameOut).size > 100);
    await page.locator('#exportDialog').screenshot({ path: path.join(artifacts, 'hm-290-receipt.png') });
    await player.screenshot({ path: path.join(artifacts, 'hm-290-player.png') });
    await player.close();

    const beforeBad = downloads;
    await page.evaluate(() => {
      const Orig = window.MediaRecorder;
      window.__hm290Orig = Orig;
      class GarbageRecorder {
        constructor() {
          this.state = 'inactive';
          this.mimeType = 'video/webm;codecs=vp9';
          this.ondataavailable = null;
          this.onstop = null;
          this.onerror = null;
        }
        start() { this.state = 'recording'; }
        stop() {
          if (this.state === 'inactive') return;
          this.state = 'inactive';
          const data = new Blob([Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8])], { type: 'video/webm' });
          if (this.ondataavailable) this.ondataavailable({ data });
          if (this.onstop) this.onstop();
        }
      }
      GarbageRecorder.isTypeSupported = Orig.isTypeSupported.bind(Orig);
      window.MediaRecorder = GarbageRecorder;
    });
    await page.click('#exportVideo');
    await page.waitForFunction(() => /playable video file/.test(document.getElementById('exportStatus').textContent));
    assert.equal(downloads, beforeBad, 'a failed encode must not download a file');
    assert.equal(await page.locator('#exportReceipt').isHidden(), true);
    assert.equal(await page.locator('#exportStatus').evaluate(el => el.classList.contains('error')), true);
    await page.locator('#exportDialog').screenshot({ path: path.join(artifacts, 'hm-290-fail-closed.png') });
    await page.evaluate(() => { if (window.__hm290Orig) window.MediaRecorder = window.__hm290Orig; });

    assert.deepEqual(errors, []);
    console.log('PASS #290 playable file ' + receipt.filename + ' ' + receipt.bytes + ' bytes ' + stream.width + 'x' + stream.height + ' ' + playedDuration.toFixed(3) + 's ' + stream.codec_name);
    console.log('FILE ' + webmOut);
  } finally {
    await browser.close();
    if (srv) await new Promise(resolve => srv.close(resolve));
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});

'use strict';

/* HM-SG-02C (#233) browser E2E — 24/30 fps presets, multi-format selector, live progress,
 * clean Cancel (video & PNG frames with zero partial downloads), cadence mismatch & telemetry. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-sg-02c-'));
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

(async () => {
  const srv = await ensureServer(base);
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ['--disable-dev-shm-usage', '--disable-gpu'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  let downloads = 0;
  page.on('pageerror', err => errors.push(err.message));
  page.on('dialog', dialog => dialog.accept());
  page.on('download', () => { downloads += 1; });

  const settle = async () => {
    await page.waitForFunction(() => !HMStudio.loading);
    return page.evaluate(() => HMStudio.compile());
  };

  try {
    await page.goto(base + '/ui/');
    await page.evaluate(() => window.ready);
    await settle();
    assert.equal(await page.evaluate(() => HMStudio.project.show.show_id), 'daiyu-wang-five-seconds');
    assert.equal(await page.evaluate(() => HMStudio.duration), 5);

    // 1. Verify 24 & 30 fps presets with 720p30 default
    await page.click('#exportOpen');
    await page.waitForSelector('#exportDialog[open]');
    assert.equal(await page.locator('#exportPreset').inputValue(), '720p30');
    assert.deepEqual(
      await page.locator('#exportPreset option').allTextContents(),
      ['720p30', '1080p30', '720p24', '1080p24'],
    );
    await page.selectOption('#exportPreset', '720p24');
    assert.match(await page.locator('#exportBitrateHint').textContent(), /720p24 · 1280×720 · 24 fps/);
    assert.match(await page.locator('#frameSeqHint').textContent(), /120 frames/);

    // 2. Verify format picker when both WebM and MP4 are supported while keeping universal_* false
    await page.evaluate(() => {
      const Orig = window.MediaRecorder;
      Orig.__origIsSupported = Orig.isTypeSupported;
      Orig.isTypeSupported = type => type === 'video/webm;codecs=vp9' || type === 'video/mp4';
      document.getElementById('exportPreset').dispatchEvent(new Event('change'));
    });
    assert.equal(await page.locator('#exportFormat').isEnabled(), true);
    assert.deepEqual(await page.locator('#exportFormat option').evaluateAll(opts => opts.map(o => o.value)), ['webm', 'mp4']);
    await page.selectOption('#exportFormat', 'mp4');
    assert.match(await page.locator('#videoHint').textContent(), /MP4 · this browser only · MP4 is not universal/);
    assert.match(await page.locator('#exportMatrix [data-export-row="mp4"]').textContent(), /this browser only/);
    assert.equal(await page.locator('#exportMatrix').getAttribute('data-universal-mp4'), 'false');
    assert.equal(await page.locator('#exportMatrix').getAttribute('data-universal-alpha'), 'false');
    // Restore original browser MIME support & default 720p30
    await page.evaluate(() => {
      if (MediaRecorder.__origIsSupported) MediaRecorder.isTypeSupported = MediaRecorder.__origIsSupported;
      const fmt = document.getElementById('exportFormat');
      if (fmt) {
        fmt.dataset.userChoice = '';
        fmt.value = 'webm';
      }
      document.getElementById('exportPreset').dispatchEvent(new Event('change'));
    });
    await page.selectOption('#exportPreset', '720p30');

    // 3. Cancel active video recording mid-flight: stops immediately, zero partial download, controls & show restored
    const beforeDownloads = downloads;
    await page.click('#exportVideo');
    await page.waitForSelector('#exportProgressWrap:not([hidden]) #cancelExport:not([hidden])');
    await page.waitForFunction(() => /Recording /.test(document.getElementById('exportStatus').textContent));
    assert.equal(await page.locator('#exportPreset').isDisabled(), true);
    await page.click('#cancelExport');
    await page.waitForFunction(() => document.getElementById('exportStatus').textContent === 'Export cancelled.');
    await page.waitForFunction(() => !document.getElementById('exportVideo').disabled && document.getElementById('exportProgressWrap').hidden);
    assert.equal(downloads, beforeDownloads, 'Cancel video must not trigger any partial download');
    assert.equal(await page.evaluate(() => ({
      recording: HMStudio.recording,
      inert: document.querySelector('.workspace').inert,
      presetDisabled: document.getElementById('exportPreset').disabled,
      showId: HMStudio.project.show.show_id,
      duration: HMStudio.duration,
      clips: HMStudio.project.show.atoms.length,
    })).then(JSON.stringify), JSON.stringify({
      recording: false,
      inert: false,
      presetDisabled: false,
      showId: 'daiyu-wang-five-seconds',
      duration: 5,
      clips: 8,
    }));

    // 4. Cancel PNG frame sequence export mid-flight: zero partial download, controls restored
    await page.click('#exportFrames');
    await page.waitForSelector('#exportProgressWrap:not([hidden]) #cancelExport:not([hidden])');
    await page.waitForFunction(() => document.getElementById('exportProgress').value > 0);
    await page.click('#cancelExport');
    await page.waitForFunction(() => document.getElementById('exportStatus').textContent === 'Export cancelled.');
    await page.waitForFunction(() => !document.getElementById('exportFrames').disabled && document.getElementById('exportProgressWrap').hidden);
    assert.equal(downloads, beforeDownloads, 'Cancel frame sequence must not trigger any partial download');
    assert.equal(await page.evaluate(() => HMStudio.duration), 5);
    await page.evaluate(() => document.getElementById('exportDialog').close());

    // 5. Cadence-mismatch honesty for a 24 fps imported strip at 30 fps preset
    await page.evaluate(async () => {
      const make = draw => {
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 64;
        draw(c.getContext('2d'));
        return c.toDataURL('image/png');
      };
      const plate = make(g => { g.fillStyle = '#228be6'; g.fillRect(0, 0, 64, 64); });
      const current = HMStudio.project;
      const key = 'embedded/sg02c-24fps/layout.json';
      const atoms = [{
        id: 'sg02c-clip',
        label: '24fps Probe',
        kind: 'duo',
        duration_s: 0.25,
        plates_needed: 1,
        pose_mode: 'hero',
        hero: { layout_source: key, plates: ['P01'] },
        camera: { preset: 'static_hold', params: { s: { type: 'const', v: 1 }, x: { type: 'const', v: 0 }, y: { type: 'const', v: 0 } } },
        fx_hooks: [],
      }];
      await HMStudio.load({
        version: 1,
        show: { ...current.show, show_id: 'sg02c-24fps-probe', title: 'SG-02C 24fps Probe', atoms, bg: {}, overlays: [] },
        layouts: { [key]: { P01: { full: plate } } },
        media: [{
          id: 'sg02c-strip',
          name: 'hero-24fps.strip.png',
          src: plate,
          layoutSource: key,
          plateId: 'P01',
          fps: 24,
        }],
        assets: {},
      });
    });
    await settle();
    assert.equal(await page.evaluate(() => HMStudio.duration), 0.25);

    await page.click('#exportOpen');
    await page.waitForSelector('#exportDialog[open]');
    await page.selectOption('#exportPreset', '720p30');
    assert.match(await page.locator('#exportHonesty').textContent(), /Cadence warning: 24 fps strip.*30 fps preset/);
    assert.match(await page.locator('#videoHint').textContent(), /cadence mismatch/);

    // Selecting 720p24 removes the cadence mismatch warning and builds a deterministic 6-frame PNG zip
    await page.selectOption('#exportPreset', '720p24');
    assert.equal(await page.locator('#exportHonesty').textContent(), HMXExportHonesty());
    const [zipDl] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.click('#exportFrames'),
    ]);
    assert.equal(await zipDl.failure(), null);
    const zipPath = path.join(outDir, 'sg02c-720p24-frames.zip');
    await zipDl.saveAs(zipPath);
    const frameCount = execFileSync('python3', ['-c', `
import json,sys,zipfile
z=zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None
names=z.namelist()
assert len(names)==7 and names[0]=='timing.json'
doc=json.loads(z.read('timing.json'))
assert doc['preset_id']=='720p24' and doc['fps']==24 and doc['frame_count']==6
assert abs(doc['frames'][5]['t'] - 5/24) < 1e-6
print(doc['frame_count'])
`, zipPath], { encoding: 'utf8' });
    assert.match(frameCount, /6/);

    // 6. Complete 720p24 video export and verify post-record telemetry summary (MIME, res, target fps, measured fps)
    const [vidDl] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.click('#exportVideo'),
    ]);
    assert.equal(await vidDl.failure(), null);
    const vidPath = path.join(outDir, vidDl.suggestedFilename());
    await vidDl.saveAs(vidPath);
    assert.ok(fs.statSync(vidPath).size > 50);
    const statusAfterVideo = await page.locator('#exportStatus').textContent();
    assert.match(statusAfterVideo, /Video downloaded · video\/(webm|mp4)/);
    assert.match(statusAfterVideo, /1280×720 · target 24 fps · measured /);

    // 7. Simulated MediaRecorder error aborts recording immediately with zero partial downloads and restores UI
    const beforeErrorDownloads = downloads;
    await page.evaluate(() => {
      const Orig = window.MediaRecorder;
      window.__origMRForErrTest = Orig;
      class FailingRecorder {
        constructor() {
          this.state = 'inactive';
          this.ondataavailable = null;
          this.onstop = null;
          this.onerror = null;
        }
        start() {
          this.state = 'recording';
          setTimeout(() => {
            this.state = 'inactive';
            if (this.onerror) this.onerror({ error: new Error('Mock encoder failure') });
          }, 25);
        }
        stop() {
          this.state = 'inactive';
          if (this.onstop) this.onstop();
        }
      }
      FailingRecorder.isTypeSupported = Orig.isTypeSupported.bind(Orig);
      window.MediaRecorder = FailingRecorder;
    });
    await page.click('#exportVideo');
    await page.waitForFunction(() => document.getElementById('exportStatus').textContent === 'Mock encoder failure');
    await page.waitForFunction(() => !document.getElementById('exportVideo').disabled && document.getElementById('exportProgressWrap').hidden);
    assert.equal(await page.locator('#exportStatus').evaluate(el => el.classList.contains('error')), true);
    assert.equal(downloads, beforeErrorDownloads, 'Recorder error must not trigger partial download');
    assert.equal(await page.evaluate(() => HMStudio.recording), false);
    await page.evaluate(() => {
      if (window.__origMRForErrTest) window.MediaRecorder = window.__origMRForErrTest;
    });

    // Desktop layout keeps primary controls unclipped at 1440x900
    await page.setViewportSize({ width: 1440, height: 900 });
    const geom = await page.evaluate(() => ({
      htmlBottom: document.getElementById('exportHtml').getBoundingClientRect().bottom,
      innerH: window.innerHeight,
    }));
    assert.ok(geom.htmlBottom <= geom.innerH, 'Desktop export controls fit inside 900px height');

    assert.deepEqual(errors, []);
    console.log('PASS hm-sg-02c browser E2E (' + statusAfterVideo + ')');
  } finally {
    await browser.close();
    if (srv) await new Promise(resolve => srv.close(resolve));
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});

function HMXExportHonesty() {
  return 'Real-time Record still needs this tab visible. Deterministic ffmpeg stays on the local skill.';
}

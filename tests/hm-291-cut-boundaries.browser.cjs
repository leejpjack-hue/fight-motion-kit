'use strict';

/* #291 — a character split plus foreground and background trims must show the
 * same picture in preview and in the export at the start, the cut, and the end. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
const artifacts = '/opt/cursor/artifacts';
fs.mkdirSync(artifacts, { recursive: true });
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

function near(a, b, tol) {
  return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;
}

function writeDataUrl(name, dataUrl) {
  const file = path.join(artifacts, name);
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return file;
}

(async () => {
  const srv = await ensureServer(base);
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ['--disable-dev-shm-usage', '--disable-gpu'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('dialog', dialog => dialog.accept());
  try {
    await page.goto(base + '/ui/');
    await page.evaluate(() => window.ready);
    await page.waitForFunction(() => window.HMStudio && !HMStudio.loading && HMStudio.duration === 5);
    if (await page.locator('#onionToggle').getAttribute('aria-pressed') === 'true') {
      await page.click('#onionToggle');
    }

    await page.evaluate(async () => {
      const solid = (r, g, b) => {
        const c = document.createElement('canvas');
        c.width = 8;
        c.height = 8;
        const ctx = c.getContext('2d');
        ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.fillRect(0, 0, 8, 8);
        return c.toDataURL('image/png');
      };
      const red = solid(210, 30, 30);
      const blue = solid(30, 50, 210);
      const yellow = solid(240, 210, 40);
      const cyan = solid(20, 190, 210);
      const white = solid(250, 250, 250);
      const key = 'embedded/hm-291/layout.json';
      const current = HMStudio.project;
      await HMStudio.load({
        version: 1,
        show: {
          ...current.show,
          show_id: 'cut-boundaries',
          title: 'Cut boundaries',
          overlays: [],
          atoms: [{
            id: 'clip-whole',
            label: 'Whole',
            kind: 'duo',
            duration_s: 1.3,
            plates_needed: 1,
            pose_mode: 'hero',
            hero: { layout_source: key, plates: ['P01'] },
            camera: { preset: 'static_hold' },
            fx_hooks: [],
          }],
          bg: {
            key_white: false,
            locations: [{ id: 'loc-a', src: yellow, t0: 0, t1: 1.3 }],
          },
          fg: { cam: { preset: 'static', amount: 0 }, props: [] },
        },
        layouts: {
          [key]: {
            P01: { parts: [{ src: red, x: 360, y: 160, w: 560, h: 400 }] },
            P02: { parts: [{ src: blue, x: 360, y: 160, w: 560, h: 400 }] },
          },
        },
        media: [],
        assets: { 'fg-white.png': white, 'bg-yellow.png': yellow, 'bg-cyan.png': cyan },
      });
      window.__hm291 = { yellow, cyan, white, red, blue };
    });
    await page.waitForFunction(() => !HMStudio.loading && HMStudio.duration === 1.3 && HMStudio.project.show.atoms.length === 1);

    await page.evaluate(() => HMStudio.renderAt(0.85, { source: 'cut-seek' }));
    await page.click('#splitClip');
    await page.waitForFunction(() => !HMStudio.loading && HMStudio.project.show.atoms.length === 2);

    await page.evaluate(() => {
      const marks = window.__hm291;
      HMStudio.editProject(project => {
        const incoming = project.show.atoms[1];
        incoming.hero = { ...incoming.hero, plates: ['P02'] };
        incoming.label = 'After cut';
        project.show.bg = {
          key_white: false,
          locations: [
            { id: 'loc-a', src: marks.yellow, t0: 0, t1: 0.85 },
            { id: 'loc-b', src: marks.cyan, t0: 0.85, t1: 1.3 },
          ],
        };
        project.show.fg = {
          cam: { preset: 'static', amount: 0 },
          props: [{ id: 'prop-cut', src: marks.white, t_start: 0.85, t_end: 1.3, x: 1120, y: 90, scale: 1 }],
        };
      });
    });
    await page.waitForFunction(() => !HMStudio.loading && HMStudio.composed && HMStudio.composed.ok !== false && HMStudio.project.show.atoms.length === 2);

    const compared = await page.evaluate(async () => {
      const read = (canvas, x, y) => {
        const d = canvas.getContext('2d').getImageData(x, y, 1, 1).data;
        return [d[0], d[1], d[2]];
      };
      const clock = HMXExport.alignExportFrames(
        HMXExport.framePlan(HMStudio.duration, 30),
        HMXExport.timelineBoundaries(HMStudio.project.show, HMStudio.duration),
        30
      );
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = 1280;
      exportCanvas.height = 720;
      const renderer = HMMotion(exportCanvas, HMStudio.project.assets || {});
      await renderer.load(HMStudio.composed);
      const stage = document.getElementById('stage');
      const points = { bg: [24, 24], character: [640, 360], fg: [1120, 90] };
      const times = [
        { name: 'start', t: 0 },
        { name: 'cut', t: 0.85 },
        { name: 'end', t: HMStudio.duration },
      ];
      const rows = [];
      for (const row of times) {
        const mark = clock.checks.find(item => item.role === row.name) || clock.checks.find(item => item.role === 'cut' && Math.abs(item.t - row.t) < 1e-6);
        HMStudio.renderAt(row.t, { source: 'preview-cut' });
        const frame = clock.frames[mark.frame_index];
        HMStudio.sampleStageFrameAt(frame.sample_t, { renderer, standIn: false, onion: false, source: 'bake-export-frames' });
        const preview = {};
        const exported = {};
        Object.keys(points).forEach(key => {
          preview[key] = read(stage, points[key][0], points[key][1]);
          exported[key] = read(exportCanvas, points[key][0], points[key][1]);
        });
        let early = null;
        if (row.name === 'cut') {
          HMStudio.sampleStageFrameAt(frame.t, { renderer, standIn: false, onion: false, source: 'bake-export-frames' });
          early = read(exportCanvas, points.character[0], points.character[1]);
          HMStudio.sampleStageFrameAt(frame.sample_t, { renderer, standIn: false, onion: false, source: 'bake-export-frames' });
        }
        rows.push({
          name: row.name,
          t: row.t,
          frame_index: mark.frame_index,
          frame_t: frame.t,
          sample_t: frame.sample_t,
          matches_preview: mark.matches_preview,
          preview,
          exported,
          early,
          previewPng: stage.toDataURL('image/png'),
          exportPng: exportCanvas.toDataURL('image/png'),
        });
      }
      const character = clock.checks.find(item => item.role === 'cut' && item.track === 'character');
      const fg = clock.checks.find(item => item.track === 'fg' && item.edge === 'in');
      const bg = clock.checks.find(item => item.track === 'bg' && item.id === 'loc-b');
      return {
        note: HMXExport.boundaryHonesty(clock),
        character, fg, bg,
        rows,
        atoms: HMStudio.project.show.atoms.map(atom => ({ id: atom.id, duration_s: atom.duration_s, plate: atom.hero.plates[0] })),
      };
    });

    assert.equal(compared.character.t, 0.85);
    assert.equal(compared.character.sample_t, 0.85);
    assert.equal(compared.fg.t, 0.85);
    assert.equal(compared.bg.t, 0.85);
    assert.match(compared.note, /same time at start, cut, and end/);
    assert.deepEqual(compared.atoms.map(atom => atom.plate), ['P01', 'P02']);

    const shots = [];
    for (const row of compared.rows) {
      for (const key of ['bg', 'character', 'fg']) {
        assert.deepEqual(row.exported[key], row.preview[key], row.name + ' ' + key + ' preview ' + row.preview[key] + ' export ' + row.exported[key]);
      }
      writeDataUrl('cut-preview-' + row.name + '.png', row.previewPng);
      writeDataUrl('cut-export-' + row.name + '.png', row.exportPng);
      shots.push(row);
    }
    const start = compared.rows[0];
    const cut = compared.rows[1];
    const end = compared.rows[2];
    assert.ok(!near(start.preview.character, cut.preview.character, 20), 'the cut must change the character picture');
    assert.ok(!near(start.preview.bg, cut.preview.bg, 20), 'the cut must change the background');
    assert.ok(!near(start.preview.fg, cut.preview.fg, 20), 'the foreground prop must appear at the cut');
    assert.ok(near(cut.preview.character, end.preview.character, 2));
    assert.ok(!near(cut.early, cut.preview.character, 20), 'sampling the frame clock instead of the cut would show the outgoing clip');

    await page.evaluate(() => HMStudio.renderAt(0.85, { source: 'preview-cut' }));
    await page.locator('#stage').screenshot({ path: path.join(artifacts, 'cut-stage-at-cut.png') });
    await page.locator('#timelineMultiTrack').scrollIntoViewIfNeeded();
    await page.locator('#timelineMultiTrack').screenshot({ path: path.join(artifacts, 'cut-timeline.png') });

    await page.click('#exportOpen');
    await page.waitForSelector('#exportDialog[open]');
    await page.selectOption('#exportPreset', '720p30');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      page.click('#exportVideo'),
    ]);
    assert.equal(await download.failure(), null);
    const videoPath = path.join(artifacts, 'cut-boundaries.webm');
    await download.saveAs(videoPath);
    const receipt = await page.evaluate(() => ({
      honesty: document.getElementById('exportReceiptHonesty').textContent,
      meta: document.getElementById('exportReceiptMeta').textContent,
      status: document.getElementById('exportStatus').textContent,
    }));
    assert.match(receipt.honesty, /Dropped \d+ of \d+ frames/);
    assert.match(receipt.honesty, /not universal/);
    assert.match(receipt.status, /Dropped \d+ of \d+ frames/);
    fs.writeFileSync(path.join(artifacts, 'cut-export-receipt.txt'), receipt.honesty + '\n' + receipt.status + '\n' + receipt.meta + '\n');

    const probed = JSON.parse(execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', videoPath,
    ], { encoding: 'utf8' }));
    const played = Number(probed.format.duration);
    assert.ok(played > 0.5, 'playable duration ' + played);
    const grab = (seconds, name) => {
      const dest = path.join(artifacts, name);
      execFileSync('ffmpeg', ['-y', '-i', videoPath, '-ss', String(seconds), '-frames:v', '1', dest], { stdio: 'ignore' });
      return dest;
    };
    const videoStart = grab(0, 'cut-video-start.png');
    const videoCut = grab(Math.min(0.85, Math.max(0, played - 0.08)), 'cut-video-cut.png');
    const videoEnd = grab(Math.max(0, played - 0.04), 'cut-video-end.png');
    const videoColors = await page.evaluate(async (files) => {
      const read = async (b64) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const at = (x, y) => {
          const sx = Math.round(x * img.width / 1280);
          const sy = Math.round(y * img.height / 720);
          const d = ctx.getImageData(sx, sy, 1, 1).data;
          return [d[0], d[1], d[2]];
        };
        return { bg: at(24, 24), character: at(640, 360), fg: at(1120, 90) };
      };
      const out = {};
      for (const [name, b64] of Object.entries(files)) out[name] = await read(b64);
      return out;
    }, {
      start: fs.readFileSync(videoStart).toString('base64'),
      cut: fs.readFileSync(videoCut).toString('base64'),
      end: fs.readFileSync(videoEnd).toString('base64'),
    });

    for (const key of ['bg', 'character', 'fg']) {
      assert.ok(near(videoColors.start[key], start.preview[key], 36), 'video start ' + key + ' ' + videoColors.start[key] + ' vs ' + start.preview[key]);
      assert.ok(near(videoColors.cut[key], cut.preview[key], 36), 'video cut ' + key + ' ' + videoColors.cut[key] + ' vs ' + cut.preview[key]);
      assert.ok(near(videoColors.end[key], end.preview[key], 36), 'video end ' + key + ' ' + videoColors.end[key] + ' vs ' + end.preview[key]);
    }
    assert.equal(errors.length, 0, errors.join('\n'));

    await page.setViewportSize({ width: 1400, height: 980 });
    await page.evaluate((payload) => {
      const { rows, video } = payload;
      document.body.innerHTML = '';
      document.body.style.margin = '0';
      document.body.style.background = '#121614';
      document.body.style.color = '#f4f7f2';
      document.body.style.font = '14px system-ui';
      const title = document.createElement('h1');
      title.textContent = 'Preview vs export at start, cut 0.850s, and end';
      title.style.cssText = 'font-size:18px;margin:12px 16px';
      document.body.append(title);
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:160px 1fr 1fr 1fr;gap:8px;padding:0 16px 16px';
      const head = ['', 'Start 0.000s', 'Cut 0.850s', 'End 1.300s'];
      head.forEach(text => {
        const cell = document.createElement('div');
        cell.textContent = text;
        cell.style.fontWeight = '700';
        grid.append(cell);
      });
      const addRow = (label, urls) => {
        const name = document.createElement('div');
        name.textContent = label;
        name.style.alignSelf = 'center';
        grid.append(name);
        urls.forEach(url => {
          const img = document.createElement('img');
          img.src = url;
          img.style.width = '100%';
          img.style.background = '#000';
          grid.append(img);
        });
      };
      addRow('Preview', rows.map(row => row.previewPng));
      addRow('Export sample', rows.map(row => row.exportPng));
      addRow('Exported film', [video.start, video.cut, video.end]);
      document.body.append(grid);
    }, {
      rows: shots,
      video: {
        start: 'data:image/png;base64,' + fs.readFileSync(videoStart).toString('base64'),
        cut: 'data:image/png;base64,' + fs.readFileSync(videoCut).toString('base64'),
        end: 'data:image/png;base64,' + fs.readFileSync(videoEnd).toString('base64'),
      },
    });
    await page.screenshot({ path: path.join(artifacts, 'cut-preview-vs-export.png'), fullPage: true });
    fs.writeFileSync(path.join(artifacts, 'cut-boundary-colors.json'), JSON.stringify({
      compared: {
        note: compared.note,
        atoms: compared.atoms,
        rows: compared.rows.map(row => ({
          name: row.name,
          t: row.t,
          frame_index: row.frame_index,
          frame_t: row.frame_t,
          sample_t: row.sample_t,
          preview: row.preview,
          exported: row.exported,
          early: row.early,
        })),
      },
      video: videoColors,
      played,
      receipt,
    }, null, 2));
    console.log('PASS #291 preview matches export at start, cut, and end');
    console.log(receipt.honesty);
  } finally {
    await browser.close();
    if (srv) srv.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});

'use strict';

const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-239-238-235-'));
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

const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, c]);
}
function makeSolidPng(r, g, b, w = 8, h = 8) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * (1 + w * 4) + 1 + x * 4;
      rows[o] = r; rows[o + 1] = g; rows[o + 2] = b; rows[o + 3] = 255;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
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
  await new Promise((resolve, reject) => { srv.once('error', reject); srv.listen(+u.port || 8765, u.hostname || '127.0.0.1', resolve); });
  srv.unref();
  return srv;
}

(async () => {
  const srv = await ensureServer(base);
  const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--disable-gpu'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();
  const errors = [];
  const external = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.route('**/*', route => {
    const url = route.request().url();
    if (!url.startsWith(base) && !url.startsWith('data:') && !url.startsWith('blob:')) {
      external.push(url);
      return route.abort();
    }
    if (/\/compose(?:$|[/?])|\/api\/compose|api\.teqcon|:8770|generateImage/i.test(url)) {
      external.push(url);
      return route.abort();
    }
    return route.continue();
  });

  const settle = async () => {
    await page.waitForFunction(() => !HMStudio.loading);
    return page.evaluate(() => HMStudio.compile());
  };

  try {
    await page.goto(base + '/ui/');
    await page.evaluate(() => window.ready);
    await settle();
    assert.equal(await page.evaluate(() => HMStudio.project.show.show_id), 'daiyu-wang-five-seconds');

    // #238 compact pf09GatePanel by default while Approve stays visible
    assert.equal(await page.locator('#pf09GatePanel').getAttribute('data-ui-collapsed'), 'true');
    assert.equal(await page.locator('#pf09Approve').isVisible(), true);
    assert.equal(await page.locator('#pf09Approve').isEnabled(), true);

    // #235 firstPathImportHtml & firstPathVideo visible, Export dialog video-first
    assert.equal(await page.locator('#firstPathImportHtml').isVisible(), true);
    assert.equal(await page.locator('#firstPathVideo').isVisible(), true);
    await page.click('#firstPathVideo');
    await page.waitForFunction(() => document.getElementById('exportDialog').open);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'exportVideo');
    assert.equal(await page.locator('#exportVideo').evaluate(el => el.classList.contains('primary')), true);
    const exportOrder = await page.evaluate(() => ({
      videoTop: document.getElementById('exportVideo').getBoundingClientRect().top,
      htmlTop: document.getElementById('exportHtml').getBoundingClientRect().top,
      bakeQaCollapsed: document.getElementById('bakeQaDock').getAttribute('data-ui-collapsed'),
      scrubVisible: document.getElementById('bakeQaScrub').offsetParent !== null,
    }));
    assert.ok(exportOrder.videoTop < exportOrder.htmlTop, 'Export Video sits above Playable HTML');
    assert.equal(exportOrder.bakeQaCollapsed, 'true');
    assert.equal(exportOrder.scrubVisible, false);

    // Clicking #openBakeQa expands #bakeQaDock
    await page.evaluate(() => document.getElementById('exportDialog').close());
    await page.click('#openBakeQa');
    await page.waitForFunction(() => document.getElementById('exportDialog').open);
    assert.equal(await page.locator('#bakeQaDock').getAttribute('data-ui-collapsed'), 'false');
    assert.equal(await page.locator('#bakeQaScrub').isVisible(), true);
    await page.evaluate(() => document.getElementById('exportDialog').close());

    // #239 Step 1: Edit clip -> Export HTML -> Blank project -> Open exported HTML (lossless round-trip)
    await page.fill('#duration', '0.65');
    await page.locator('#duration').dispatchEvent('change');
    await page.selectOption('#camera', 'slow_push');
    await page.fill('#roll', '-6');
    await page.locator('#roll').dispatchEvent('change');
    await page.click('[data-effect="hit_pink"]');
    await page.fill('#caption', 'ROUNDTRIP HIT');
    await page.locator('#caption').dispatchEvent('change');
    await settle();

    await page.click('#exportOpen');
    const dlPromise = page.waitForEvent('download', { timeout: 90000 });
    await page.click('#exportHtml');
    const dl = await dlPromise;
    assert.equal(await dl.failure(), null);
    const exportedHtmlPath = path.join(tmp, 'roundtrip.html');
    await dl.saveAs(exportedHtmlPath);
    const exportedHtmlText = fs.readFileSync(exportedHtmlPath, 'utf8');
    assert.match(exportedHtmlText, /id="hm-project-data"/);
    await page.evaluate(() => document.getElementById('exportDialog').close());

    await page.click('#newProject');
    await page.waitForFunction(() => HMStudio.project.show.atoms.length === 0);
    // Blank show honestly disables exportVideo
    assert.equal(await page.locator('#exportVideo').isDisabled(), true);
    assert.match(await page.locator('#exportStatus').textContent(), /Open an AI motion HTML or add a clip to export video/);

    await page.setInputFiles('#projectInput', exportedHtmlPath);
    await page.waitForFunction(() => HMStudio.project.show.show_id === 'daiyu-wang-five-seconds' && HMStudio.project.show.atoms.length === 8 && HMStudio.project.show.atoms[0].duration_s === 0.65);
    await settle();
    const restored = await page.evaluate(() => ({
      dur: HMStudio.project.show.atoms[0].duration_s,
      cam: HMStudio.project.show.atoms[0].camera.preset,
      roll: HMStudio.project.show.atoms[0].camera.nudge.r,
      fx: HMStudio.project.show.atoms[0].fx_hooks[0].type,
      caption: HMStudio.project.show.atoms[0].caption,
      receipt: document.getElementById('importReceiptStatus').textContent,
    }));
    assert.equal(restored.dur, 0.65);
    assert.equal(restored.cam, 'slow_push');
    assert.equal(restored.roll, -6);
    assert.equal(restored.fx, 'hit_pink');
    assert.equal(restored.caption, 'ROUNDTRIP HIT');
    assert.equal(restored.receipt, 'LANDED');

    // #239 Step 3: Legacy standalone HTML Motion `const DATA = {...};` without hm-project-data
    const legacyHtmlText = exportedHtmlText.replace(/<script id="hm-project-data"[^>]*>[\s\S]*?<\/script>/, '');
    assert.equal(legacyHtmlText.includes('hm-project-data'), false);
    assert.match(legacyHtmlText, /const DATA=/);
    const legacyPath = path.join(tmp, 'legacy-data.html');
    fs.writeFileSync(legacyPath, legacyHtmlText);

    await page.setInputFiles('#projectInput', legacyPath);
    await page.waitForFunction(() => HMStudio.project.show.atoms.length === 8 && HMStudio.project.show.atoms[0].caption === 'ROUNDTRIP HIT');
    await settle();
    assert.equal(await page.locator('#importReceiptStatus').textContent(), 'LANDED');
    assert.equal(await page.evaluate(() => HMStudio.project.show.atoms[0].fx_hooks[0].type), 'hit_pink');

    // #239 Step 4: Generic AI HTML with inline data:image/png assets -> sequential 0.75s clips
    const pngRed = 'data:image/png;base64,' + makeSolidPng(220, 30, 30).toString('base64');
    const pngBlue = 'data:image/png;base64,' + makeSolidPng(30, 80, 220).toString('base64');
    const rawAiHtml = `<!doctype html><html><body><img src="${pngRed}"><img src="${pngRed}"><img src="${pngBlue}"></body></html>`;
    await page.setInputFiles('#projectInput', [{ name: 'raw-ai-fight.html', mimeType: 'text/html', buffer: Buffer.from(rawAiHtml) }]);
    await page.waitForFunction(() => HMStudio.project.show.show_id === 'raw-ai-fight' && HMStudio.project.show.atoms.length === 2);
    await settle();
    assert.equal(await page.evaluate(() => HMStudio.duration), 1.5);
    assert.equal(await page.locator('#importReceiptStatus').textContent(), 'LANDED');

    // #239 Step 5: Unsupported HTML fails closed, keeps active show, shows Copy AI HTML format hint
    await page.setInputFiles('#projectInput', [{ name: 'bad-ai.html', mimeType: 'text/html', buffer: Buffer.from('<!doctype html><html><body>No motion here</body></html>') }]);
    await page.waitForFunction(() => document.getElementById('importReceipt')?.dataset.status === 'error');
    assert.equal(await page.locator('#importReceiptStatus').textContent(), 'NOT LOADED');
    assert.equal(await page.evaluate(() => HMStudio.project.show.show_id), 'raw-ai-fight');
    assert.equal(await page.locator('#importReceiptCopyHint').isVisible(), true);
    await page.click('#importReceiptCopyHint');
    const copiedHint = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(copiedHint, /<script id="hm-project-data" type="application\/json">/);

    // #238 Partial AI HTML -> Relink missing image in place -> Undo restores
    const missingRef = 'plates/missing-shot.png';
    const partialProject = {
      version: 1,
      show: {
        show_id: 'partial-relink-show',
        title: 'Partial Relink Show',
        chars: { L: { name: 'Daiyu', costume_id: 'blue_silk' }, R: { name: 'Xifeng', costume_id: 'red_vest' } },
        costume_lock: { id: 'lock-99' },
        atoms: [
          {
            id: 'b1',
            label: 'Relink Beat',
            kind: 'duo',
            duration_s: 0.85,
            plates_needed: 1,
            pose_mode: 'hero',
            motion: { family: 'fight', beat_class: 'clash' },
            hero: { layout_source: 'imported-html-layout.json', plates: ['P01'] },
            camera: { preset: 'slow_push' },
            fx_hooks: [],
            caption: 'Relink Test',
          },
        ],
        bg: {},
        overlays: [],
      },
      layouts: { 'imported-html-layout.json': { P01: { full: missingRef } } },
      media: [{ id: 'm1', name: 'P01', src: missingRef, layoutSource: 'imported-html-layout.json', plateId: 'P01' }],
      assets: {},
    };
    const partialHtml = `<!doctype html><html><body><script id="hm-project-data" type="application/json">${JSON.stringify(partialProject)}</script></body></html>`;
    await page.setInputFiles('#projectInput', [{ name: 'partial.html', mimeType: 'text/html', buffer: Buffer.from(partialHtml) }]);
    await page.waitForFunction(() => HMStudio.project?.show?.show_id === 'partial-relink-show' && document.getElementById('importReceipt')?.dataset.status === 'partial');
    assert.equal(await page.locator('#importReceiptRelink').isVisible(), true);
    assert.match(await page.locator('#importReceiptMissing').textContent(), /plates\/missing-shot\.png/);

    const missingPngBuf = makeSolidPng(20, 200, 90);
    await page.setInputFiles('#relinkAssetsInput', [{ name: 'missing-shot.png', mimeType: 'image/png', buffer: missingPngBuf }]);
    await page.waitForFunction(() => document.getElementById('importReceipt')?.dataset.status === 'ok' && !HMStudio.loading);
    await settle();
    const afterRelink = await page.evaluate(() => ({
      receiptStatus: document.getElementById('importReceiptStatus').textContent,
      missingText: document.querySelector('#importReceipt [data-receipt="missing-count"]').textContent,
      assetLoaded: typeof HMStudio.project.assets['plates/missing-shot.png'] === 'string' && HMStudio.project.assets['plates/missing-shot.png'].startsWith('data:image/png;base64,'),
      dur: HMStudio.project.show.atoms[0].duration_s,
      caption: HMStudio.project.show.atoms[0].caption,
      lock: HMStudio.project.show.costume_lock,
      undoDisabled: document.getElementById('undo').disabled,
    }));
    assert.equal(afterRelink.receiptStatus, 'LANDED');
    assert.equal(afterRelink.missingText, '0 missing');
    assert.equal(afterRelink.assetLoaded, true);
    assert.equal(afterRelink.dur, 0.85);
    assert.equal(afterRelink.caption, 'Relink Test');
    assert.deepEqual(afterRelink.lock, { id: 'lock-99' });
    assert.equal(afterRelink.undoDisabled, false);

    // Undo restores prior unresolved state
    await page.click('#undo');
    await page.waitForFunction(() => !HMStudio.project.assets?.['plates/missing-shot.png']);

    // Verify 5.00s demo JSON untouched
    const demo = JSON.parse(fs.readFileSync('public/shows/daiyu-wang-five-seconds.json', 'utf8'));
    assert.equal(demo.atoms.length, 8);
    assert.equal(demo.atoms.reduce((s, a) => s + a.duration_s, 0), 5);
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
    console.log('PASS hm-239-238-235 browser E2E');
  } finally {
    await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    if (srv) await new Promise(resolve => srv.close(resolve));
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});

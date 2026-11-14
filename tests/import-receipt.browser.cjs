/* Issue #211 browser check — Local import receipt: what landed, missing packs stay missing, undo restores draft, zero provider calls. */
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
function makePng(w = 4, h = 4) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * (1 + w * 4) + 1 + x * 4;
      rows[o] = 60; rows[o + 1] = 190; rows[o + 2] = 90; rows[o + 3] = 255;
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
  await new Promise((resolve, reject) => { srv.once('error', reject); srv.listen(+u.port || 8765, u.hostname || '127.0.0.1', resolve); });
  srv.unref();
  return srv;
}

(async () => {
  const srv = await ensureServer(base);
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ['--disable-dev-shm-usage', '--disable-gpu'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const errors = [];
  const externalOrProvider = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.route('**/*', route => {
    const url = route.request().url();
    if (!url.startsWith(base) && !url.startsWith('data:') && !url.startsWith('blob:')) {
      externalOrProvider.push(url);
      return route.abort();
    }
    if (/\/compose(?:$|[/?])|\/api\/compose|api\.teqcon|:8770|generateImage/i.test(url)) {
      externalOrProvider.push(url);
      return route.abort();
    }
    return route.continue();
  });

  const settle = async () => { await page.waitForFunction(() => !HMStudio.loading); return page.evaluate(() => HMStudio.compile()); };

  try {
    const samplePng = makePng(4, 4);
    await page.goto(base + '/ui/');
    await page.evaluate(() => window.ready);
    await settle();
    assert.equal(await page.locator('#importReceipt').isVisible(), false);

    // 1. Blank project -> Import images -> Undo restores previous draft
    await page.click('#newProject');
    await page.waitForFunction(() => HMStudio.project.show.atoms.length === 0);
    const beforeBlankMedia = await page.evaluate(() => HMStudio.project.media.length);
    await page.setInputFiles('#imageInput', [
      { name: 'alpha-pose.png', mimeType: 'image/png', buffer: samplePng },
      { name: 'beta-pose.png', mimeType: 'image/png', buffer: samplePng },
    ]);
    await page.waitForFunction(() => HMStudio.project.show.atoms.length === 2);
    assert.equal(await page.evaluate(() => HMStudio.project.media.length), beforeBlankMedia + 2);
    assert.equal(await page.locator('#importReceipt').isVisible(), true);
    assert.equal(await page.locator('#importReceiptStatus').textContent(), 'LANDED');
    assert.equal(await page.locator('#importReceipt [data-receipt="clips"]').textContent(), '2 clips');
    assert.equal(await page.locator('#importReceipt [data-receipt="images"]').textContent(), '2 images');
    assert.equal(await page.locator('#importReceipt [data-receipt="missing-count"]').textContent(), '0 missing');
    assert.match(await page.locator('#importReceiptLanded').textContent(), /alpha-pose\.png/);
    assert.match(await page.locator('#importReceiptLanded').textContent(), /beta-pose\.png/);
    assert.match(await page.locator('#importReceiptNote').textContent(), /Undo restores your previous draft/);

    await page.click('#undo');
    await page.waitForFunction(n => HMStudio.project.show.atoms.length === 0 && HMStudio.project.media.length === n, beforeBlankMedia);

    // Invalid upload -> error receipt without mutating draft
    await page.setInputFiles('#imageInput', [{ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') }]);
    await page.waitForFunction(() => document.getElementById('importReceipt')?.dataset.status === 'error');
    assert.equal(await page.locator('#importReceiptStatus').textContent(), 'NOT LOADED');
    assert.equal(await page.locator('#importReceipt [data-receipt="clips"]').textContent(), '0 clips');
    assert.equal(await page.locator('#importReceipt [data-receipt="images"]').textContent(), '0 images');
    assert.match(await page.locator('#importReceiptMissing').textContent(), /bad\.txt/);
    assert.equal(await page.evaluate(() => HMStudio.project.show.atoms.length), 0);

    // 2. Restore 5.00s demo -> Market spritegen proof aligns cleanly and keeps active demo
    await page.click('#loadDemo');
    await page.waitForFunction(() => HMStudio.project.show.show_id === 'daiyu-wang-five-seconds');
    await settle();
    await page.click('#openMarketSpritegenProof');
    await page.waitForSelector('#marketSpritegenDialog[open]');
    await page.click('#marketSpritegenDialog button.dialog-close');
    assert.equal(await page.locator('#importReceipt').isVisible(), true);
    assert.equal(await page.locator('#importReceiptStatus').textContent(), 'BLOCKED · MISSING ON DISK');
    assert.equal(await page.locator('#importReceipt [data-receipt="source"]').textContent(), 'fight-baijia-elfmage-market-spritegen-2026-11-06');
    assert.equal(await page.locator('#importReceipt [data-receipt="clips"]').textContent(), '0 clips');
    assert.equal(await page.locator('#importReceipt [data-receipt="images"]').textContent(), '0 images');
    assert.match(await page.locator('#importReceiptMissing').textContent(), /\/workspace\/deliverables\/fight-baijia-elfmage-market-spritegen-2026-11-06/);
    assert.match(await page.locator('#importReceiptMissing').textContent(), /\*\.motion\.json/);
    assert.equal(await page.evaluate(() => HMStudio.project.show.show_id), 'daiyu-wang-five-seconds');
    assert.equal(await page.evaluate(() => HMStudio.duration), 5);

    // 3. Import from project + Undo
    const beforeMedia = await page.evaluate(() => HMStudio.project.media.length);
    await page.click('#importProjectImages');
    await page.waitForSelector('#projectMediaDialog[open]');
    await page.selectOption('#projectMediaSource', 'street-old-city');
    await page.waitForSelector('#projectMediaGrid .project-media-card input[type="checkbox"]');
    await page.locator('#projectMediaGrid .project-media-card input[type="checkbox"]').first().check();
    await page.click('#importSelectedProjectImages');
    await page.waitForFunction(n => HMStudio.project.media.length === n + 1, beforeMedia);
    assert.equal(await page.locator('#importReceiptStatus').textContent(), 'LANDED');
    assert.equal(await page.locator('#importReceipt [data-receipt="clips"]').textContent(), '0 clips');
    assert.equal(await page.locator('#importReceipt [data-receipt="images"]').textContent(), '1 image');
    await page.click('#undo');
    await page.waitForFunction(n => HMStudio.project.media.length === n, beforeMedia);

    // 4. Import pending strip (PNG + JSON pair) -> PENDING · NOT PLAYABLE, Undo restores draft
    const stripPng = makePng(8, 4);
    const stripSha = require('node:crypto').createHash('sha256').update(stripPng).digest('hex');
    const stripJson = Buffer.from(JSON.stringify({
      frames: 2,
      w: 4,
      h: 4,
      body_h: 3,
      fps: 24,
      delay_ms: 41.67,
      source_fps: 24,
    }));
    await page.click('#importStrip');
    await page.setInputFiles('#stripInput', [
      { name: 'test-strip.png', mimeType: 'image/png', buffer: stripPng },
      { name: 'test-strip.json', mimeType: 'application/json', buffer: stripJson },
    ]);
    await page.waitForFunction(() => !document.getElementById('commitStrip').disabled);
    await page.click('#commitStrip');
    await page.waitForFunction(n => HMStudio.project.media.length === n + 1, beforeMedia);
    assert.equal(await page.locator('#importReceiptStatus').textContent(), 'PENDING · NOT PLAYABLE');
    assert.equal(await page.locator('#importReceipt [data-receipt="clips"]').textContent(), '0 clips');
    assert.equal(await page.locator('#importReceipt [data-receipt="images"]').textContent(), '1 image');
    assert.match(await page.locator('#importReceiptLanded').textContent(), /test-strip\.png/);
    assert.match(await page.locator('#importReceiptNote').textContent(), /Undo restores your previous draft/);
    await page.click('#undo');
    await page.waitForFunction(n => HMStudio.project.media.length === n, beforeMedia);

    // 5a. Open incomplete costume_lock pack via #projectInput -> lists missing local refs, keeps open project
    const incompleteLock = {
      kind: 'costume_lock',
      version: 1,
      pack_id: 'incomplete-lock',
      cast: {
        L: { name: 'Lung', costume_id: 'c1', lock_refs: [{ src: 'lung_ref.png' }], sheets: [{ id: 'L1', src: 'sheets/lung_sheet.png' }], pose_refs: [] },
        R: { name: 'Mei', costume_id: 'c2', lock_refs: [{ src: 'mei_ref.png' }], sheets: [{ id: 'R1', src: 'sheets/mei_sheet.png' }], pose_refs: [] },
      },
    };
    await page.setInputFiles('#projectInput', [
      { name: 'incomplete.costume_lock.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incompleteLock)) },
      { name: 'lung_sheet.png', mimeType: 'image/png', buffer: samplePng },
    ]);
    await page.waitForSelector('#costumeDriftDialog[open]');
    assert.match(await page.locator('#costumeDriftDialog .review-status').textContent(), /Import blocked: Missing local review image/);
    await page.click('#costumeDriftDialog .reject');
    await page.waitForFunction(() => /incomplete/.test(document.getElementById('importReceipt')?.textContent || ''));
    assert.equal(await page.locator('#importReceiptStatus').textContent(), 'NOT LOADED');
    assert.match(await page.locator('#importReceiptMissing').textContent(), /sheets\/mei_sheet\.png/);
    assert.equal(await page.evaluate(() => HMStudio.project.show.show_id), 'daiyu-wang-five-seconds');

    // 5b. Open partial .motion.json via #projectInput -> partial landed vs missing + skipped unsupported file
    const dataUri = 'data:image/png;base64,' + samplePng.toString('base64');
    const partialMotion = {
      version: 1,
      show: {
        show_id: 'partial-open-test',
        title: 'Partial Open Test',
        atoms: [
          { id: 'c1', label: 'Clip 1', kind: 'duo', duration_s: 0.5, plates_needed: 1, pose_mode: 'hero', motion: { family: 'fight', beat_class: 'clash' }, hero: { layout_source: 'custom/layout.json', plates: ['P01'] }, camera: { preset: 'static_hold' }, fx_hooks: [] },
          { id: 'c2', label: 'Clip 2', kind: 'duo', duration_s: 0.5, plates_needed: 1, pose_mode: 'hero', motion: { family: 'fight', beat_class: 'straight' }, hero: { layout_source: 'custom/layout.json', plates: ['P02'] }, camera: { preset: 'static_hold' }, fx_hooks: [] },
        ],
        bg: {},
        overlays: [],
      },
      layouts: { 'custom/layout.json': { P01: { full: 'P01.png' }, P02: { full: 'P02.png' } } },
      media: [
        { id: 'm1', name: 'P01', src: 'custom/P01.png', layoutSource: 'custom/layout.json', plateId: 'P01' },
        { id: 'm2', name: 'P02', src: 'custom/P02.png', layoutSource: 'custom/layout.json', plateId: 'P02' },
      ],
      assets: { 'custom/P01.png': dataUri },
    };
    await page.setInputFiles('#projectInput', [
      { name: 'partial-open.motion.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(partialMotion)) },
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('skip me') },
    ]);
    await page.waitForFunction(() => HMStudio.project?.show?.show_id === 'partial-open-test');
    assert.equal(await page.locator('#importReceiptStatus').textContent(), 'PARTIAL · MISSING FILES');
    assert.equal(await page.locator('#importReceipt [data-receipt="clips"]').textContent(), '2 clips');
    assert.equal(await page.locator('#importReceipt [data-receipt="images"]').textContent(), '1 image');
    assert.match(await page.locator('#importReceiptLanded').textContent(), /partial-open\.motion\.json/);
    assert.match(await page.locator('#importReceiptMissing').textContent(), /custom\/P02\.png/);
    assert.match(await page.locator('#importReceiptMissing').textContent(), /notes\.txt/);

    assert.deepEqual(externalOrProvider, []);
    assert.deepEqual(errors, []);
    console.log('PASS Issue #211 Local import receipt');
  } finally {
    await browser.close();
    if (srv) await new Promise(resolve => srv.close(resolve));
  }
})().catch(err => { console.error(err); process.exit(1); });

/* Issue #210 browser check — Playable HTML and /player/ act as offline teaching films. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-teaching-film-'));
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
  await new Promise((resolve, reject) => { srv.once('error', reject); srv.listen(+u.port || 8765, u.hostname || '127.0.0.1', resolve); });
  srv.unref();
  return srv;
}

(async () => {
  const srv = await ensureServer(base);
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ['--disable-dev-shm-usage', '--disable-gpu'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const errors = [];
  try {
    const page = await context.newPage();
    page.on('pageerror', e => errors.push('ui:' + e.message));
    page.on('dialog', d => d.accept());

    await page.goto(base + '/ui/');
    await page.evaluate(() => window.ready);
    await page.waitForFunction(() => !HMStudio.loading);

    await page.evaluate(async () => {
      const p = structuredClone(HMStudio.project);
      p.show.atoms[0].beat_id = 'B01';
      p.show.atoms[0].caption = 'Daiyu checks distance on the opening clash';
      p.show.atoms[3].caption = 'Cross-guard pivot before strike';
      await HMStudio.load(p);
    });
    await page.waitForFunction(() => !HMStudio.loading);

    await page.click('#exportOpen');
    await page.waitForSelector('#exportDialog[open] #exportHtml');
    const dlWait = page.waitForEvent('download', { timeout: 60000 });
    await page.click('#exportHtml');
    const dl = await dlWait;
    const htmlPath = path.join(out, 'daiyu-teaching.html');
    await dl.saveAs(htmlPath);
    await page.evaluate(() => document.getElementById('exportDialog').close());

    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.equal(/src=["']https?:/i.test(html), false, 'offline HTML must not embed external HTTP scripts/images');

    // Open offline file:// with all network traffic aborted
    const offline = await context.newPage();
    offline.on('pageerror', e => errors.push('offline:' + e.message));
    const leaked = [];
    await offline.route('http://**', route => { leaked.push(route.request().url()); return route.abort(); });
    await offline.route('https://**', route => { leaked.push(route.request().url()); return route.abort(); });
    await offline.goto('file://' + htmlPath);
    await offline.evaluate(() => window.ready);

    assert.equal(await offline.locator('#teachingFilm').isVisible(), true);
    assert.equal(await offline.locator('#teachingClipName').textContent(), 'Opening clash');
    assert.match(await offline.locator('#teachingBeatLabel').textContent(), /B01 · clash/);
    assert.equal(await offline.locator('#teachingClock').textContent(), '0.00 / 5.00s');
    assert.equal(await offline.locator('#teachingCaption').textContent(), 'Daiyu checks distance on the opening clash');
    assert.equal(await offline.locator('#teachingBeats .teaching-beat').count(), 8);
    assert.equal(await offline.locator('#teachingBeats .teaching-beat').first().getAttribute('aria-current'), 'step');

    // Click beat 4 to scrub directly and verify clip name + caption + show clock update
    await offline.locator('#teachingBeats .teaching-beat').nth(3).click();
    assert.equal(await offline.locator('#teachingClipName').textContent(), await offline.locator('#teachingBeats .teaching-beat .teaching-beat-label').nth(3).textContent());
    assert.equal(await offline.locator('#teachingCaption').textContent(), 'Cross-guard pivot before strike');
    assert.equal(await offline.locator('#teachingBeats .teaching-beat').nth(3).getAttribute('aria-current'), 'step');

    // Play briefly and verify clock & HUD respond live during playback
    await offline.evaluate(() => renderAt(0));
    await offline.click('#play');
    await offline.waitForTimeout(220);
    await offline.click('#play');
    const playedClock = await offline.locator('#teachingClock').textContent();
    assert.notEqual(playedClock, '0.00 / 5.00s');
    assert.deepEqual(leaked, []);
    await offline.close();

    // Check /player/ fresh context (empty localStorage) also displays teaching HUD
    const freshContext = await browser.newContext({ viewport: { width: 1280, height: 960 } });
    try {
      const player = await freshContext.newPage();
      player.on('pageerror', e => errors.push('player:' + e.message));
      await player.goto(base + '/player/?show=daiyu-wang-five-seconds');
      await player.evaluate(() => window.ready);
      assert.equal(await player.locator('#teachingFilm').isVisible(), true);
      assert.equal(await player.locator('#teachingClipName').textContent(), 'Opening clash');
      assert.match(await player.locator('#teachingBeatLabel').textContent(), /clash/);
      assert.equal(await player.locator('#teachingClock').textContent(), '0.00 / 5.00s');
      assert.equal(await player.locator('#teachingBeats .teaching-beat').count(), 8);
      await player.evaluate(() => renderAt(4.9));
      assert.equal(await player.locator('#teachingClipName').textContent(), 'Push kick');
      assert.equal(await player.locator('#teachingClock').textContent(), '4.90 / 5.00s');
      await player.close();

      // ?capture mode hides chrome and teaching HUD
      const cap = await freshContext.newPage();
      await cap.goto(base + '/player/?show=daiyu-wang-five-seconds&capture');
      await cap.evaluate(() => window.ready);
      assert.equal(await cap.locator('#teachingFilm').isVisible(), false);
      await cap.close();
    } finally {
      await freshContext.close();
    }

    assert.deepEqual(errors, []);
    console.log('PASS Issue #210 Playable HTML & /player/ teaching film');
  } finally {
    await browser.close();
    if (srv) await new Promise(resolve => srv.close(resolve));
  }
})().catch(err => { console.error(err); process.exit(1); });

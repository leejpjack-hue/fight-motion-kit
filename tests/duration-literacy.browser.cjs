/* Live check: the three durations stay together on /ui/ while editing. */
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
const out = path.resolve(process.env.TEST_OUTPUT || '/opt/cursor/artifacts');
fs.mkdirSync(out, {recursive: true});

const MIMES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

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
    res.writeHead(200, {'Content-Type': MIMES[path.extname(fp)] || 'application/octet-stream'});
    fs.createReadStream(fp).pipe(res);
  });
  const u = new URL(urlStr);
  await new Promise((resolve, reject) => { srv.once('error', reject); srv.listen(+u.port || 8765, u.hostname || '127.0.0.1', resolve); });
  srv.unref();
  return srv;
}

function readRow(page) {
  return page.evaluate(() => ({
    show: document.getElementById('showClockTotal').textContent,
    clip: document.getElementById('selectedClipLength').textContent,
    exportDuration: document.getElementById('exportDuration').textContent,
    together: document.getElementById('durationLiteracy').innerText.replace(/\s+/g, ' ').trim()
  }));
}

(async () => {
  const srv = await ensureServer(base);
  const browser = await chromium.launch({headless: true, args: ['--disable-dev-shm-usage', '--disable-gpu']});
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, acceptDownloads: true});
  const page = await context.newPage();
  page.on('dialog', dialog => dialog.accept());
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base + '/ui/');
    await page.evaluate(() => window.ready);
    await page.waitForFunction(() => HMStudio.duration === 5);
    let row = await readRow(page);
    assert.equal(row.show, 'Show clock 5.00s');
    assert.equal(row.clip, 'Selected clip 0.50s');
    assert.equal(row.exportDuration, 'Export 5.00s');
    assert.match(row.together, /Show clock 5\.00s/);
    assert.match(row.together, /Selected clip 0\.50s/);
    assert.match(row.together, /Export 5\.00s/);
    await page.locator('#durationLiteracy').screenshot({path: path.join(out, 'duration-literacy-demo.png')});
    await page.locator('main.stage-well').screenshot({path: path.join(out, 'duration-literacy-stage.png')});

    await page.click('#exportOpen');
    await page.waitForFunction(() => document.getElementById('exportDialog').open);
    const interrupted = page.waitForFunction(() => /Recording interrupted because the tab was hidden/.test(document.getElementById('exportStatus').textContent), null, {timeout: 8000});
    await page.click('#exportVideo');
    await page.waitForFunction(() => /Recording /.test(document.getElementById('exportStatus').textContent));
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {configurable: true, get() { return true; }});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await interrupted;
    assert.match(await page.locator('#exportStatus').innerText(), /Recording interrupted because the tab was hidden\. Keep this tab visible and retry\./);
    row = await readRow(page);
    assert.equal(row.show, 'Show clock 5.00s');
    assert.equal(row.exportDuration, 'Export 5.00s');
    await page.getByRole('button', {name: 'Close export', exact: true}).click();

    await page.click('.timeline-clip[data-index="4"]');
    await page.waitForFunction(() => HMStudio.selectedIndex === 4);
    row = await readRow(page);
    assert.equal(row.show, 'Show clock 5.00s');
    assert.equal(row.clip, 'Selected clip 0.75s');
    assert.equal(row.exportDuration, 'Export 5.00s');

    await page.click('#longer');
    await page.waitForFunction(() => Math.abs(HMStudio.duration - 5.1) < 0.001);
    row = await readRow(page);
    assert.equal(row.show, 'Show clock 5.10s');
    assert.equal(row.clip, 'Selected clip 0.85s');
    assert.equal(row.exportDuration, 'Export 5.10s');

    await page.fill('#duration', '0.625');
    await page.locator('#duration').dispatchEvent('change');
    await page.waitForFunction(() => Math.abs(HMStudio.project.show.atoms[4].duration_s - 0.625) < 0.0001);
    row = await readRow(page);
    assert.equal(row.show, 'Show clock 4.875s');
    assert.equal(row.clip, 'Selected clip 0.625s');
    assert.equal(row.exportDuration, 'Export 4.875s');
    await page.locator('#durationLiteracy').screenshot({path: path.join(out, 'duration-literacy-edited.png')});

    await page.click('#exportOpen');
    await page.waitForFunction(() => document.getElementById('exportDialog').open);
    assert.equal(await page.locator('#exportHonesty').innerText(), 'Real-time Record still needs this tab visible. Deterministic ffmpeg stays on the local skill.');
    await page.click('#exportFrames');
    await page.waitForFunction(() => /whole number of frames/.test(document.getElementById('exportStatus').textContent));
    assert.match(await page.locator('#exportStatus').innerText(), /Duration × fps is not a whole number of frames/);
    row = await readRow(page);
    assert.equal(row.exportDuration, 'Export 4.875s');
    assert.equal(row.show, 'Show clock 4.875s');
    await page.getByRole('button', {name: 'Close export', exact: true}).click();

    await page.click('#newProject');
    await page.waitForFunction(() => HMStudio.project.show.atoms.length === 0);
    row = await readRow(page);
    assert.equal(row.show, 'Show clock 0.00s');
    assert.equal(row.clip, 'Selected clip none');
    assert.equal(row.exportDuration, 'Export 0.00s');
    await page.locator('#durationLiteracy').screenshot({path: path.join(out, 'duration-literacy-empty.png')});

    await page.setViewportSize({width: 390, height: 844});
    await page.locator('#durationLiteracy').screenshot({path: path.join(out, 'duration-literacy-mobile.png')});
    row = await readRow(page);
    assert.equal(row.show, 'Show clock 0.00s');
    assert.equal(row.clip, 'Selected clip none');
    assert.equal(row.exportDuration, 'Export 0.00s');

    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS duration literacy ' + JSON.stringify(row));
  } finally {
    await browser.close();
    if (srv) srv.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});

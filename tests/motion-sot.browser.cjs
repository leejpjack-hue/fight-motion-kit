/* HM-PF-44 browser proof. Run against `npm run dev` or this file's fallback server. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

require('../public/ui/motion-sot.js');

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
const out = path.resolve(process.env.TEST_OUTPUT || 'work/qa');
fs.mkdirSync(out, { recursive: true });
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
  const ok = await new Promise((resolve) => {
    const req = http.get(urlStr + '/ui/', (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.setTimeout(600, () => { req.destroy(); resolve(false); });
  });
  if (ok) return null;
  if (process.env.TEST_BASE_URL) throw new Error('Configured TEST_BASE_URL is unavailable: ' + urlStr);
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
  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    channel: process.env.BROWSER_CHANNEL || undefined,
    args: ['--disable-dev-shm-usage', '--disable-gpu'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  const writes = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  page.on('request', (req) => {
    const url = req.url();
    if (/\/api\/(compose|save|upload|duplicate|import)/.test(url) || /api\.teqcon\.uk/.test(url) || /:8770/.test(url)) {
      writes.push(req.method() + ' ' + url);
    }
  });
  const settle = async () => {
    await page.waitForFunction(() => !HMStudio.loading);
    return page.evaluate(() => HMStudio.compile());
  };
  try {
    await page.goto(base + '/ui/');
    await page.evaluate(() => window.ready);
    assert.equal(await page.evaluate(() => HMStudio.project.show.show_id), 'daiyu-wang-five-seconds');
    assert.equal(await page.locator('.timeline-clip').count(), 8);

    await page.click('#replaceImage');
    await page.getByRole('button', { name: 'Use P08 in selected clip', exact: true }).click();
    await settle();
    await page.selectOption('#camera', 'slow_push');
    await settle();
    await page.fill('#roll', '12');
    await page.locator('#roll').dispatchEvent('change');
    await settle();
    await page.fill('#camIntensity', '1.25');
    await page.locator('#camIntensity').dispatchEvent('change');
    await settle();
    await page.click('.timeline-clip[data-index="1"]');
    await settle();
    await page.selectOption('#camera', 'slow_push');
    await settle();
    await page.click('.timeline-clip[data-index="0"]');
    await settle();
    await page.fill('#duration', '0.8');
    await page.locator('#duration').dispatchEvent('change');
    await settle();
    await page.click('[data-effect="hit_pink"]');
    await settle();

    const before = await page.evaluate(() => HMMotionSot.fingerprint(HMStudio.project));
    assert.equal(before.atoms[0].plates[0], 'P08');
    assert.equal(before.atoms[0].camera.preset, 'slow_push');
    assert.equal(before.atoms[0].camera.nudge.r, 12);
    assert.equal(before.atoms[0].camera.intensity, 1.25);
    assert.equal(before.atoms[0].duration_s, 0.8);
    assert.equal(before.atoms[0].fx_hooks[0].type, 'hit_pink');
    assert.equal(before.atoms[1].camera.preset, 'slow_push');

    const draft = await page.evaluate(() => HMMotionSot.readDraft(localStorage, 'daiyu-wang-five-seconds'));
    assert.deepEqual(HMMotionSot.fingerprint(draft), before);
    assert.equal(await page.evaluate(() => localStorage.getItem(HMMotionSot.PIN_KEY)), null);
    assert.equal(await page.evaluate(() => localStorage.getItem(HMMotionSot.RECENT_KEY)), null);

    const baked = await page.evaluate(() => {
      const atom = HMStudio.composed.timeline.atoms[0];
      return {
        plate: HMStudio.composed.layout.S001.source_plate,
        preset: atom.cam[0].preset,
        dur: +(atom.t1 - atom.t0).toFixed(4),
        fx: atom.fx_hooks[0].type,
      };
    });
    assert.deepEqual(baked, { plate: 'P08', preset: 'slow_push', dur: 0.8, fx: 'hit_pink' });

    const lint = await page.evaluate(() => HMStudio.showLint);
    assert.equal(lint.contract, 'HM-HF-03-SHOW-JSON-LINT');
    assert.equal(lint.blocksBake, false);
    assert.ok(lint.findings.some((row) => row.code === 'adjacent_same_cam'));
    await page.waitForSelector('#showLintList [data-code="adjacent_same_cam"]');

    const downloadEvent = page.waitForEvent('download', { timeout: 90000 });
    await page.click('#saveProject');
    const download = await downloadEvent;
    assert.equal(await download.failure(), null);
    const filePath = path.join(out, 'hm-pf-44.motion.json');
    await download.saveAs(filePath);
    const file = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.deepEqual(HMMotionSot.fingerprint(file), before);
    assert.ok(Object.values(file.assets).every((value) => String(value).startsWith('data:image/')));

    await page.click('#loadDemo');
    await page.waitForFunction(() => HMStudio.project.show.atoms[0].hero.plates[0] === 'P01');
    await settle();
    await page.setInputFiles('#projectInput', filePath);
    await page.waitForFunction(() => HMStudio.project.show.atoms[0].hero.plates[0] === 'P08' && HMStudio.project.show.atoms[0].camera.nudge.r === 12);
    await settle();
    const after = await page.evaluate(() => HMMotionSot.fingerprint(HMStudio.project));
    assert.deepEqual(after, before);
    const lintAfter = await page.evaluate(() => HMStudio.showLint);
    assert.equal(lintAfter.blocksBake, false);
    assert.ok(lintAfter.findings.some((row) => row.code === 'adjacent_same_cam'));
    await page.waitForSelector('#showLintList [data-code="adjacent_same_cam"]');
    const rebaked = await page.evaluate(() => HMStudio.composed.layout.S001.source_plate);
    assert.equal(rebaked, 'P08');
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);
    console.log('PASS HM-PF-44 download→reopen round-trips cam/timing/FX/plates, draft key held, lint listed, no server write');
  } finally {
    await browser.close();
    if (srv) srv.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

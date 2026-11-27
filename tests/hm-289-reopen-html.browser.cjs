/* #289 — change timing, camera, FX, and a caption; export HTML; reopen; all four survive; export again. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
const shotDir = process.env.TEST_OUTPUT || '/opt/cursor/artifacts';
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
  const up = await new Promise(resolve => {
    const req = http.get(urlStr + '/ui/', res => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => { req.destroy(); resolve(false); });
  });
  if (up) return null;
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

async function controlClip(page, fromId, toId) {
  await page.locator('#' + fromId).scrollIntoViewIfNeeded();
  const from = await page.locator('#' + fromId).boundingBox();
  const to = await page.locator('#' + toId).boundingBox();
  const top = Math.max(0, from.y - 32);
  const bottom = Math.min(1100, to.y + to.height + 24);
  return { x: Math.max(0, from.x - 20), y: top, width: 480, height: Math.max(80, bottom - top) };
}

function clipOf(page) {
  return page.evaluate(() => {
    const a = HMStudio.project.show.atoms[0];
    return {
      show_id: HMStudio.project.show.show_id,
      duration_s: a.duration_s,
      total_s: HMStudio.duration,
      camera: a.camera,
      fx: a.fx_hooks,
      caption: Object.hasOwn(a, 'caption') ? a.caption : null,
      durationField: document.getElementById('duration').value,
      cameraField: document.getElementById('camera').value,
      intensityField: document.getElementById('camIntensity').value,
      captionField: document.getElementById('caption').value,
      fxPressed: document.querySelector('[data-effect].active')?.dataset.effect || '',
    };
  });
}

(async () => {
  fs.mkdirSync(shotDir, { recursive: true });
  const srv = await ensureServer(base);
  const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--disable-gpu'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  const htmlPath = path.join(shotDir, 'hm-289-reopen.html');
  const secondPath = path.join(shotDir, 'hm-289-second.html');
  try {
    await page.goto(base + '/ui/');
    await page.evaluate(() => window.ready);
    await page.waitForFunction(() => window.HMStudio && HMStudio.project.show.show_id === 'daiyu-wang-five-seconds' && HMStudio.duration === 5 && !HMStudio.loading);

    const before = await clipOf(page);
    assert.equal(before.duration_s, 0.5);
    assert.equal(before.camera.preset, 'static_hold');
    assert.equal(before.fx[0].type, 'shake');
    assert.equal(before.caption, null);

    await page.fill('#duration', '0.8');
    await page.dispatchEvent('#duration', 'change');
    await page.waitForFunction(() => !HMStudio.loading && HMStudio.project.show.atoms[0].duration_s === 0.8);

    await page.fill('#camIntensity', '1.5');
    await page.dispatchEvent('#camIntensity', 'change');
    await page.waitForFunction(() => HMStudio.project.show.atoms[0].camera.intensity === 1.5);
    await page.click('[data-effect="hit_orange"]');
    await page.waitForFunction(() => HMStudio.project.show.atoms[0].fx_hooks[0].type === 'hit_orange');
    await page.fill('#caption', 'REOPEN ME');
    await page.dispatchEvent('#caption', 'change');
    await page.waitForFunction(() => HMStudio.project.show.atoms[0].caption === 'REOPEN ME' && !HMStudio.loading);

    const edited = await clipOf(page);
    assert.equal(edited.duration_s, 0.8);
    assert.equal(edited.total_s, 5.3);
    assert.equal(edited.camera.preset, 'static_hold');
    assert.equal(edited.camera.intensity, 1.5);
    assert.deepEqual(edited.camera.params, before.camera.params);
    assert.equal(edited.fx[0].type, 'hit_orange');
    assert.deepEqual(edited.fx[0].params, {});
    assert.equal(edited.caption, 'REOPEN ME');
    await page.screenshot({ path: path.join(shotDir, 'hm-289-edited-timing.png'), clip: await controlClip(page, 'duration', 'duration') });
    await page.screenshot({ path: path.join(shotDir, 'hm-289-edited-camera.png'), clip: await controlClip(page, 'camera', 'camIntensity') });
    await page.locator('#caption').scrollIntoViewIfNeeded();
    await page.locator('aside.inspector').screenshot({ path: path.join(shotDir, 'hm-289-edited.png') });

    await page.click('#exportOpen');
    await page.waitForFunction(() => document.getElementById('exportDialog').open && !document.getElementById('exportHtml').disabled);
    const download = await Promise.all([
      page.waitForEvent('download', { timeout: 120000 }),
      page.click('#exportHtml'),
    ]).then(pair => pair[0]);
    assert.equal(await download.failure(), null);
    await download.saveAs(htmlPath);
    assert.ok(fs.statSync(htmlPath).size > 1000);
    await page.getByRole('button', { name: 'Close export', exact: true }).click();

    await page.setInputFiles('#projectInput', htmlPath);
    await page.waitForFunction(() => !HMStudio.loading && /AI motion HTML opened/.test(document.getElementById('exportStatus').textContent), null, { timeout: 120000 });
    const reopened = await clipOf(page);
    assert.equal(reopened.show_id, 'daiyu-wang-five-seconds');
    assert.equal(reopened.duration_s, edited.duration_s);
    assert.equal(reopened.total_s, edited.total_s);
    assert.deepEqual(reopened.camera, edited.camera);
    assert.deepEqual(reopened.fx, edited.fx);
    assert.equal(reopened.caption, 'REOPEN ME');
    assert.equal(reopened.durationField, '0.8');
    assert.equal(reopened.cameraField, 'static_hold');
    assert.equal(reopened.intensityField, '1.5');
    assert.equal(reopened.captionField, 'REOPEN ME');
    assert.equal(reopened.fxPressed, 'hit_orange');
    assert.equal(errors.length, 0, errors.join('\n'));
    await page.screenshot({ path: path.join(shotDir, 'hm-289-reopened-timing.png'), clip: await controlClip(page, 'duration', 'duration') });
    await page.screenshot({ path: path.join(shotDir, 'hm-289-reopened-camera.png'), clip: await controlClip(page, 'camera', 'camIntensity') });
    await page.locator('#caption').scrollIntoViewIfNeeded();
    await page.locator('aside.inspector').screenshot({ path: path.join(shotDir, 'hm-289-reopened.png') });

    await page.click('#exportOpen');
    await page.waitForFunction(() => document.getElementById('exportDialog').open);
    assert.equal(await page.locator('#exportHtml').isEnabled(), true);
    await page.locator('#exportDialog').screenshot({ path: path.join(shotDir, 'hm-289-second-export.png') });
    const second = await Promise.all([
      page.waitForEvent('download', { timeout: 120000 }),
      page.click('#exportHtml'),
    ]).then(pair => pair[0]);
    assert.equal(await second.failure(), null);
    await second.saveAs(secondPath);
    assert.ok(fs.statSync(secondPath).size > 1000);
    const secondHtml = fs.readFileSync(secondPath, 'utf8');
    assert.match(secondHtml, /hm-project-data/);
    assert.match(secondHtml, /REOPEN ME/);

    const proof = {
      ok: true,
      edited: { duration_s: edited.duration_s, total_s: edited.total_s, camera: edited.camera, fx: edited.fx, caption: edited.caption },
      reopened: { duration_s: reopened.duration_s, total_s: reopened.total_s, camera: reopened.camera, fx: reopened.fx, caption: reopened.caption },
      first_export_bytes: fs.statSync(htmlPath).size,
      second_export_bytes: fs.statSync(secondPath).size,
      page_errors: errors,
    };
    fs.writeFileSync(path.join(shotDir, 'hm-289-proof.json'), JSON.stringify(proof, null, 2));
    console.log('PASS #289 reopen ' + JSON.stringify({
      duration_s: reopened.duration_s,
      camera: reopened.camera.preset,
      intensity: reopened.camera.intensity,
      params_kept: JSON.stringify(reopened.camera.params) === JSON.stringify(edited.camera.params),
      fx: reopened.fx[0].type,
      caption: reopened.caption,
      second_export_bytes: proof.second_export_bytes,
    }));
  } finally {
    await browser.close();
    if (srv) srv.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

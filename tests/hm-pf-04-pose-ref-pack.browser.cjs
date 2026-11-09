/* HM-PF-04 browser check — OpenPose pose-ref plate pack (#86).
 * Open the 5.00s demo, load the kick pack, tweak one clip, and compose.
 * Wall clock for that Jack path must stay under 60s. No generation calls.
 */
'use strict';

const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
const proofDir = process.env.HM_PROOF_DIR ? path.resolve(process.env.HM_PROOF_DIR) : '';

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
  const ok = await new Promise((r) => {
    const req = http.get(urlStr + '/ui/', (res) => {
      res.resume();
      r(res.statusCode === 200);
    });
    req.on('error', () => r(false));
    req.setTimeout(600, () => {
      req.destroy();
      r(false);
    });
  });
  if (ok) return null;
  const root = path.resolve('public');
  const srv = http.createServer((req, res) => {
    const clean = decodeURIComponent(new URL(req.url, urlStr).pathname).replace(/^\/+/, '');
    let fp = path.resolve(root, clean);
    if (!fp.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
    if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
      res.writeHead(404).end();
      return;
    }
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
  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    args: ['--disable-dev-shm-usage', '--disable-gpu'],
  });
  const forbidden = [];
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', (err) => errors.push(String(err)));
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      let host = '';
      try { host = new URL(url).host; } catch (_) {}
      const originHost = new URL(base).host;
      if (host && host !== originHost) {
        forbidden.push(url);
        await route.abort();
        return;
      }
      if (/generateimage|teqcon|:8770/i.test(url)) {
        forbidden.push(url);
        await route.abort();
        return;
      }
      await route.continue();
    });
    page.on('dialog', (dialog) => dialog.accept());

    const settle = async () => {
      await page.waitForFunction(() => !HMStudio.loading);
      return page.evaluate(() => HMStudio.compile());
    };

    const tStart = Date.now();
    await page.goto(base + '/ui/');
    await page.evaluate(() => window.ready);
    await settle();

    assert.equal(await page.evaluate(() => HMStudio.project.show.show_id), 'daiyu-wang-five-seconds');
    assert.equal(await page.evaluate(() => HMStudio.duration), 5);
    assert.equal(await page.locator('.timeline-clip').count(), 8);
    assert.equal(await page.locator('#poseRefPackMeta').isHidden(), true);

    await page.click('#loadPoseRefPack');
    await page.waitForFunction(() => HMStudio.project?.show?.show_id === 'daiyu-wang-10s-kicks-pose-pack');
    await settle();

    const loaded = await page.evaluate(() => {
      const show = HMStudio.project.show;
      const slots = HMComposeClient.poseRefSlotMap(HMStudio.project);
      return {
        duration: HMStudio.duration,
        clips: show.atoms.length,
        pose0: slots[0],
        pose7: slots[6],
        pose20: slots[19],
        keyWhite: show.bg.key_white === true,
        lockL: show.chars.L.costume_id,
        lockR: show.chars.R.costume_id,
        fx: show.atoms.every((atom) => !atom.fx_hooks || atom.fx_hooks.length === 0),
        composedOk: HMStudio.composed?.ok,
        meta: document.getElementById('poseRefPackMeta').textContent,
      };
    });
    assert.equal(loaded.duration, 10.07);
    assert.equal(loaded.clips, 20);
    assert.equal(loaded.pose0.pose_id, 'P01');
    assert.equal(loaded.pose0.plate_id, 'P01');
    assert.equal(loaded.pose0.camera_preset, 'eye_push');
    assert.equal(loaded.pose7.pose_id, 'P07');
    assert.equal(loaded.pose7.camera_preset, 'upward_inside');
    assert.equal(loaded.pose20.pose_id, 'P20');
    assert.equal(loaded.pose20.camera_preset, 'pull_aftermath');
    assert.equal(loaded.keyWhite, true);
    assert.equal(loaded.lockL, 'daiyu_pale_teal_tank_v1');
    assert.equal(loaded.lockR, 'wang_black_tank_red_skirt_v1');
    assert.equal(loaded.fx, true);
    assert.equal(loaded.composedOk, true);
    assert.match(loaded.meta, /20 pose ids on camera-ready plates/);
    assert.equal(await page.locator('#charLockL').textContent(), 'daiyu_pale_teal_tank_v1');
    assert.equal(await page.locator('#charLockR').textContent(), 'wang_black_tank_red_skirt_v1');

    await page.click('#trimPlus');
    await settle();
    const tweaked = await page.evaluate(() => ({
      duration: HMStudio.duration,
      clip0: HMStudio.project.show.atoms[0].duration_s,
      cam: HMStudio.project.show.atoms[0].camera.preset,
      poseMap: HMComposeClient.poseRefSlotMap(HMStudio.project)[0].pose_id,
      composedOk: HMStudio.composed?.ok,
    }));
    assert.equal(tweaked.clip0, 0.5);
    assert.equal(tweaked.duration, 10.17);
    assert.equal(tweaked.cam, 'eye_push');
    assert.equal(tweaked.poseMap, 'P01');
    assert.equal(tweaked.composedOk, true);

    await page.click('#replaceImage');
    await page.locator('button[aria-label^="Use P07"]').click();
    await settle();
    const swapped = await page.evaluate(() => ({
      plate: HMStudio.project.show.atoms[0].hero.plates[0],
      cam: HMStudio.project.show.atoms[0].camera.preset,
      map: HMComposeClient.poseRefSlotMap(HMStudio.project)[0],
      lockL: document.getElementById('charLockL').textContent,
      lockR: document.getElementById('charLockR').textContent,
      composedOk: HMStudio.composed?.ok,
    }));
    assert.notEqual(swapped.plate, 'P01');
    assert.equal(swapped.cam, 'eye_push');
    assert.equal(swapped.map.pose_id, 'P01');
    assert.equal(swapped.map.plate_id, 'P01');
    assert.equal(swapped.lockL, 'daiyu_pale_teal_tank_v1');
    assert.equal(swapped.lockR, 'wang_black_tank_red_skirt_v1');
    assert.equal(swapped.composedOk, true);

    const elapsedMs = Date.now() - tStart;
    assert.ok(elapsedMs < 60000, 'Jack bar exceeded: took ' + elapsedMs + 'ms');
    assert.deepEqual(forbidden, []);
    assert.deepEqual(errors, []);

    const receipt = {
      cap: 'HM-PF-04',
      issue: 86,
      show_id: 'daiyu-wang-10s-kicks-pose-pack',
      path: '/ui/ → #loadPoseRefPack → trim +0.1s → replace plate → compose',
      workers_ui: base + '/ui/?show=daiyu-wang-10s-kicks-pose-pack',
      elapsed_ms: elapsedMs,
      jack_bar_ms: 60000,
      passed: true,
      plates: 20,
      duration_s_after_tweak: tweaked.duration,
      composed_ok: true,
      external_requests: forbidden.length,
      page_errors: errors.length,
    };
    const deep = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    deep.on('dialog', (dialog) => dialog.accept());
    await deep.goto(base + '/ui/?show=daiyu-wang-10s-kicks-pose-pack');
    await deep.evaluate(() => window.ready);
    await deep.waitForFunction(() => HMStudio.project?.show?.show_id === 'daiyu-wang-10s-kicks-pose-pack' && !HMStudio.loading);
    await deep.evaluate(() => HMStudio.compile());
    const deepState = await deep.evaluate(() => ({
      id: HMStudio.project.show.show_id,
      plates: HMComposeClient.poseRefSlotMap(HMStudio.project).length,
      ok: HMStudio.composed?.ok,
      duration: HMStudio.duration,
    }));
    assert.equal(deepState.id, 'daiyu-wang-10s-kicks-pose-pack');
    assert.equal(deepState.plates, 20);
    assert.equal(deepState.duration, 10.07);
    assert.equal(deepState.ok, true);
    receipt.deep_link = base + '/ui/?show=daiyu-wang-10s-kicks-pose-pack';
    receipt.deep_link_ok = true;
    await deep.close();

    if (proofDir) {
      fs.mkdirSync(proofDir, { recursive: true });
      await page.screenshot({ path: path.join(proofDir, 'hm-pf-04-pose-ref-pack.png'), fullPage: true });
      fs.writeFileSync(path.join(proofDir, 'hm-pf-04-jack-bar.json'), JSON.stringify(receipt, null, 2));
    }
    console.log('HM-PF-04 browser check passed in ' + (elapsedMs / 1000).toFixed(2) + 's');
    console.log(JSON.stringify(receipt));
  } finally {
    await browser.close();
    if (srv) srv.close();
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

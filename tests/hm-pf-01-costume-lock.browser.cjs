/* HM-PF-01 browser check — Dual-cast costume lock pack opens in composer (#83).
 * Standalone loopback check (starts static server on public/ if TEST_BASE_URL is not up).
 * Verifies:
 *  1. 5.00s eight-plate demo (daiyu-wang-five-seconds) stays intact with lock badges hidden.
 *  2. 1-click #loadCostumeLock loads sheets + pose refs as a 5.00s plate pack and shows locked costume IDs for L and R.
 *  3. Plate swap in composer updates clip hero plate while keeping both L and R costume lock IDs intact.
 *  4. #projectInput (Open project) opens a standalone costume_lock JSON + local sheet/pose PNG files completely offline of teqcon/:8770 with zero GenerateImage or external network requests.
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

const ONE_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

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
  const originHost = new URL(base).host;
  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    args: ['--disable-dev-shm-usage', '--disable-gpu'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    const forbiddenRequests = [];

    page.on('pageerror', (e) => errors.push(e.message));
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (/^(data:|blob:)/i.test(url)) {
        await route.continue();
        return;
      }
      const parsed = new URL(url);
      if (
        parsed.host !== originHost ||
        /teqcon|:8770|\/compose(?![-a-z0-9_])|GenerateImage|generate_image/i.test(url)
      ) {
        forbiddenRequests.push(url);
        await route.abort();
        return;
      }
      await route.continue();
    });

    page.on('dialog', (d) => d.accept());

    const settle = async () => {
      await page.waitForFunction(() => !HMStudio.loading);
      return page.evaluate(() => HMStudio.compile());
    };

    const tStart = Date.now();
    await page.goto(base + '/ui/');
    await page.evaluate(() => window.ready);

    // 1. Default 5.00s eight-plate demo remains 100% intact
    assert.equal(await page.evaluate(() => HMStudio.duration), 5);
    assert.equal(await page.locator('.timeline-clip').count(), 8);
    assert.equal(await page.locator('#charNameL').textContent(), 'Lin Daiyu');
    assert.equal(await page.locator('#charNameR').textContent(), 'Wang Xifeng');
    assert.equal(await page.locator('#charLockRowL').isHidden(), true);
    assert.equal(await page.locator('#charLockRowR').isHidden(), true);
    assert.equal(await page.locator('#charLockMeta').isHidden(), true);

    // 2. Open dual-cast costume lock pack in 1 click (#loadCostumeLock)
    await page.click('#loadCostumeLock');
    await page.waitForFunction(() => HMStudio.project?.show?.show_id === 'daiyu-wang-costume-lock');
    await settle();

    assert.equal(await page.evaluate(() => HMStudio.duration), 5);
    assert.equal(await page.locator('.timeline-clip').count(), 8);
    assert.equal(await page.locator('#charHonesty').isHidden(), false);
    assert.equal(await page.locator('#charHonesty').getAttribute('data-dual-locked'), 'true');
    assert.equal(await page.locator('#charNameL').textContent(), 'Lin Daiyu');
    assert.equal(await page.locator('#charNameR').textContent(), 'Wang Xifeng');
    assert.equal(await page.locator('#charLockRowL').isHidden(), false);
    assert.equal(await page.locator('#charLockRowR').isHidden(), false);
    assert.equal(await page.locator('#charLockL').textContent(), 'daiyu_celadon_tank_v1');
    assert.equal(await page.locator('#charLockR').textContent(), 'wang_crimson_jacket_v1');
    assert.match(
      await page.locator('#charLockMeta').textContent(),
      /Costume lock · L: 1 sheet, 4 pose refs · R: 1 sheet, 4 pose refs/
    );

    // 3. Swap plates via composer plate picker; lock IDs stay intact & zero GenerateImage calls
    await page.click('#replaceImage');
    assert.equal(await page.locator('#mediaGrid').isHidden(), false);
    assert.equal(await page.locator('.media-card').count(), 10);
    assert.equal(await page.locator('.media-card[data-lock-role="sheet"]').count(), 2);
    assert.equal(await page.locator('.media-card[data-lock-role="pose_ref"]').count(), 8);

    await page.click('.media-card[data-lock-role="sheet"][data-lock-side="R"] .media-image');
    await settle();

    const swappedState = await page.evaluate(() => ({
      clip0Plates: HMStudio.project.show.atoms[0].hero.plates,
      lock: HMStudio.costumeLock,
      clean: HMStudio.dirtyChecklist.clean,
      composedOk: HMStudio.composed?.ok,
    }));
    assert.deepEqual(swappedState.clip0Plates, ['R_SHEET_01']);
    assert.equal(swappedState.clean, true);
    assert.equal(swappedState.composedOk, true);
    assert.equal(swappedState.lock.L.costume_id, 'daiyu_celadon_tank_v1');
    assert.equal(swappedState.lock.R.costume_id, 'wang_crimson_jacket_v1');
    assert.equal(await page.locator('#charLockL').textContent(), 'daiyu_celadon_tank_v1');
    assert.equal(await page.locator('#charLockR').textContent(), 'wang_crimson_jacket_v1');

    if (proofDir) {
      fs.mkdirSync(proofDir, { recursive: true });
      await page.screenshot({ path: path.join(proofDir, 'hm-pf-01-costume-lock.png'), fullPage: true });
    }

    // 4. Open standalone costume_lock JSON + local sheet/pose PNG files via #projectInput offline
    const emittedPack = {
      kind: 'costume_lock',
      version: 1,
      pack_id: 'ah-lung-vs-siu-mei-lock',
      title: 'Ah Lung vs Siu Mei · Locked Pack',
      cast: {
        L: {
          name: 'Ah Lung',
          costume_id: 'ah_lung_vest_lock_v1',
          lock_refs: [{ src: 'lung_ref.png', label: 'Earlier Lung lock reference' }],
          sheets: [{ id: 'L_SHEET', label: 'Lung turnaround sheet', src: 'sheets/lung_sheet.png' }],
          pose_refs: [{ id: 'L_POSE_01', label: 'Lung guard stance', src: 'poses/lung_pose_01.png', duration_s: 0.5 }],
        },
        R: {
          name: 'Siu Mei',
          costume_id: 'siu_mei_coat_lock_v1',
          lock_refs: [{ src: 'mei_ref.png', label: 'Earlier Mei lock reference' }],
          sheets: [{ id: 'R_SHEET', label: 'Mei turnaround sheet', src: 'sheets/mei_sheet.png' }],
          pose_refs: [{ id: 'R_POSE_01', label: 'Mei roundhouse ref', src: 'poses/mei_pose_01.png', duration_s: 0.5 }],
        },
      },
    };

    await page.setInputFiles('#projectInput', [
      { name: 'ah-lung-vs-siu-mei.costume_lock.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(emittedPack)) },
      { name: 'lung_sheet.png', mimeType: 'image/png', buffer: ONE_BY_ONE_PNG },
      { name: 'mei_sheet.png', mimeType: 'image/png', buffer: ONE_BY_ONE_PNG },
      { name: 'lung_pose_01.png', mimeType: 'image/png', buffer: ONE_BY_ONE_PNG },
      { name: 'mei_pose_01.png', mimeType: 'image/png', buffer: ONE_BY_ONE_PNG },
      { name: 'lung_ref.png', mimeType: 'image/png', buffer: fs.readFileSync('public/assets/daiyu-wang-eight/P01.png') },
      { name: 'mei_ref.png', mimeType: 'image/png', buffer: fs.readFileSync('public/assets/daiyu-wang-eight/P02.png') },
    ]);
    await page.waitForSelector('#costumeDriftDialog[open]');
    await page.fill('#costumeDriftDialog .reviewer', 'Browser test operator');
    for (const checkbox of await page.locator('#costumeDriftDialog input[type="checkbox"]').all()) await checkbox.check();
    await page.waitForFunction(() => !document.querySelector('#costumeDriftDialog .approve').disabled);
    await page.click('#costumeDriftDialog .approve');
    await page.waitForFunction(() => HMStudio.project?.show?.show_id === 'ah-lung-vs-siu-mei-lock');
    await settle();

    assert.equal(await page.evaluate(() => HMStudio.duration), 1);
    assert.equal(await page.locator('.timeline-clip').count(), 2);
    assert.equal(await page.locator('#charNameL').textContent(), 'Ah Lung');
    assert.equal(await page.locator('#charNameR').textContent(), 'Siu Mei');
    assert.equal(await page.locator('#charLockL').textContent(), 'ah_lung_vest_lock_v1');
    assert.equal(await page.locator('#charLockR').textContent(), 'siu_mei_coat_lock_v1');

    // Swap clip 0 to Lung's sheet in the imported pack; verify lock IDs stay intact
    await page.click('#togglePlatePicker');
    await page.click('.media-card[data-lock-role="sheet"][data-lock-side="L"] .media-image');
    await settle();
    assert.equal(await page.locator('#charLockL').textContent(), 'ah_lung_vest_lock_v1');
    assert.equal(await page.locator('#charLockR').textContent(), 'siu_mei_coat_lock_v1');

    const elapsedMs = Date.now() - tStart;
    assert.ok(elapsedMs < 60000, `Jack bar exceeded: took ${elapsedMs}ms`);
    assert.deepEqual(forbiddenRequests, []);
    assert.deepEqual(errors, []);

    console.log(`HM-PF-01 browser check passed in ${(elapsedMs / 1000).toFixed(2)}s (0 external/gen requests, 0 errors).`);
  } finally {
    await browser.close();
    if (srv) srv.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

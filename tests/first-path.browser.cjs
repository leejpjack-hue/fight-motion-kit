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

function top(page, selector) {
  return page.locator(selector).evaluate(el => el.getBoundingClientRect().top);
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
    res.writeHead(200, {'Content-Type': MIMES[path.extname(fp)] || 'application/octet-stream'});
    fs.createReadStream(fp).pipe(res);
  });
  const u = new URL(urlStr);
  await new Promise((resolve, reject) => { srv.once('error', reject); srv.listen(+u.port || 8765, u.hostname || '127.0.0.1', resolve); });
  srv.unref();
  return srv;
}

(async () => {
  const srv = await ensureServer(base);
  const browser = await chromium.launch({headless: true, args: ['--disable-dev-shm-usage', '--disable-gpu']});
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, acceptDownloads: true});
  context.on('page', page => page.on('dialog', dialog => dialog.accept()));
  const page = await context.newPage();
  const errors = [];
  const blocked = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base + '/ui/');
    await page.evaluate(() => window.ready);
    await page.waitForFunction(() => window.HMStudio && HMStudio.project.show.show_id === 'daiyu-wang-five-seconds' && HMStudio.duration === 5);
    const film = await page.locator('#firstPathFilm').innerText();
    assert.match(film, /5\.00s eight-plate teaching film/);
    assert.match(film, /Opening clash/);
    assert.match(film, /Push kick/);
    assert.equal(await page.locator('#firstPathOpen').getAttribute('aria-current'), 'step');
    assert.ok(await top(page, '#firstPath') < await top(page, '#stage'));
    assert.ok(await top(page, '.library-bottom') < await top(page, '.background-panel'));
    assert.ok(await top(page, '.library-bottom') < await top(page, '#foregroundPanel'));
    assert.ok(await top(page, '.library-bottom') < await top(page, '#importStrip'));
    assert.ok(await top(page, '.timeline-scroll') < await top(page, '#pf09GatePanel'));
    assert.ok(await top(page, '#duration') < await top(page, '#catalogQuery'));
    assert.equal(await page.locator('#backgroundMotionDetails').count(), 1);
    assert.equal(await page.locator('#openMarketSpritegenProof').count(), 1);
    await page.screenshot({path: path.join(out, 'first-path-desktop.png')});

    await page.click('#firstPathWatch');
    await page.waitForTimeout(400);
    const watched = await page.evaluate(() => HMStudio.time);
    assert.ok(watched > 0, 'watch moved the playhead');
    await page.click('#play');
    await page.click('#firstPathEdit');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'duration');
    const before = await page.evaluate(() => HMStudio.project.show.atoms[0].duration_s);
    await page.click('#longer');
    await page.waitForFunction(() => !HMStudio.loading);
    const after = await page.evaluate(() => ({
      beat: HMStudio.project.show.atoms[0].duration_s,
      total: HMStudio.duration,
      id: HMStudio.project.show.show_id
    }));
    assert.equal(after.id, 'daiyu-wang-five-seconds');
    assert.ok(after.beat > before);
    assert.ok(Math.abs(after.total - 5.1) < 0.001);

    await page.click('#firstPathExport');
    await page.waitForFunction(() => document.getElementById('exportDialog').open);
    const honesty = await page.locator('#exportHonesty').innerText();
    const matrix = await page.locator('#exportMatrixNote').innerText();
    assert.match(honesty, /Real-time Record still needs this tab visible/);
    assert.match(matrix, /Playable HTML/);
    assert.match(matrix, /MP4 is not universal/);
    assert.equal(await page.locator('#exportHtml').isEnabled(), true);
    await page.getByRole('button', {name: 'Close export', exact: true}).click();
    await page.click('#firstPathHtml');
    await page.waitForFunction(() => document.getElementById('exportDialog').open && document.activeElement && document.activeElement.id === 'exportHtml');
    await page.screenshot({path: path.join(out, 'first-path-export.png')});

    const downloadEvent = page.waitForEvent('download', {timeout: 120000});
    await page.click('#exportHtml');
    const download = await downloadEvent;
    assert.equal(await download.failure(), null);
    const file = path.join(out, 'first-path-playable.html');
    await download.saveAs(file);
    const exported = fs.readFileSync(file, 'utf8');
    assert.match(exported, /Plays offline/);
    assert.match(exported, /data:image\//);
    assert.equal(/src="https?:/.test(exported), false);

    const player = await context.newPage();
    await player.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith('file:') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
      blocked.push(url);
      return route.abort();
    });
    await player.goto(pathToFileURL(file));
    await player.evaluate(() => window.ready);
    await player.click('#play');
    await player.waitForTimeout(350);
    await player.click('#play');
    const clock = await player.locator('#time').innerText();
    assert.match(clock, /\/ 5\.10s/);
    const seconds = Number(clock.split('/')[0]);
    assert.ok(seconds > 0, 'offline player advanced, clock ' + clock);
    await player.screenshot({path: path.join(out, 'first-path-offline.png')});
    assert.equal(errors.length, 0, errors.join('\n'));
    fs.writeFileSync(path.join(out, 'first-path-proof.json'), JSON.stringify({
      film,
      watched,
      beat: after.beat,
      total: after.total,
      honesty,
      offlineClock: clock,
      blockedDuringPlayback: blocked
    }, null, 2));
    console.log('PASS first path ' + clock);
  } finally {
    await browser.close();
    if (srv) srv.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});

function pathToFileURL(file) {
  return 'file://' + path.resolve(file);
}

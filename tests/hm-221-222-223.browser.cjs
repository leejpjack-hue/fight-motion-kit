'use strict';

const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

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
  await new Promise((resolve, reject) => { srv.once('error', reject); srv.listen(+u.port || 0, u.hostname || '127.0.0.1', resolve); });
  srv.unref();
  return srv;
}

(async () => {
  const srv = await ensureServer(base);
  const actualBase = srv ? `http://127.0.0.1:${srv.address().port}` : base;
  const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--disable-gpu'] });

  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = [], external = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('dialog', dialog => dialog.accept());
    ctx.on('request', req => {
      const u = req.url();
      if (!u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== new URL(actualBase).origin) external.push(u);
    });

    await page.goto(actualBase + '/ui/');
    await page.evaluate(() => window.ready);
    await page.waitForFunction(() => window.HMStudio && HMStudio.project?.show?.show_id === 'daiyu-wang-five-seconds' && HMStudio.duration === 5);

    // 1. Issue #221 — Impact Caption Styles (UI select, rendered pixels, save/reopen, STREET silent default)
    await page.evaluate(() => HMStudio.renderAt(0.25, { source: 'scrub' }));
    const baselineShot = await page.evaluate(() => document.getElementById('stage').toDataURL('image/png'));

    await page.fill('#caption', 'CLASH!');
    await page.locator('#caption').dispatchEvent('change');
    await page.waitForFunction(() => HMStudio.project.show.atoms[0].caption === 'CLASH!' && HMStudio.composed?.timeline?.overlays?.some(o => o.text === 'CLASH!'));
    const plainShot = await page.evaluate(() => document.getElementById('stage').toDataURL('image/png'));
    assert.notEqual(plainShot, baselineShot);

    await page.selectOption('#captionStyle', 'slam');
    await page.waitForFunction(() => HMStudio.project.show.atoms[0].caption_style === 'slam' && HMStudio.composed?.timeline?.overlays?.some(o => o.caption_style === 'slam'));
    await page.evaluate(() => HMStudio.renderAt(0.25, { source: 'scrub' }));
    const slamShot = await page.evaluate(() => document.getElementById('stage').toDataURL('image/png'));
    assert.notEqual(slamShot, plainShot, 'slam style changes stage pixels vs plain caption');

    await page.selectOption('#captionStyle', 'glitch_edge');
    await page.waitForFunction(() => HMStudio.project.show.atoms[0].caption_style === 'glitch_edge');
    await page.evaluate(() => HMStudio.renderAt(0.25, { source: 'scrub' }));
    const glitchShot = await page.evaluate(() => document.getElementById('stage').toDataURL('image/png'));
    assert.notEqual(glitchShot, slamShot, 'glitch_edge renders distinct pixels from slam');

    await page.selectOption('#captionStyle', 'clean_bar');
    await page.waitForFunction(() => HMStudio.project.show.atoms[0].caption_style === 'clean_bar');
    await page.evaluate(() => HMStudio.renderAt(0.25, { source: 'scrub' }));
    const cleanShot = await page.evaluate(() => document.getElementById('stage').toDataURL('image/png'));
    assert.notEqual(cleanShot, glitchShot, 'clean_bar renders distinct pixels from glitch_edge');

    // Verify local save / reopen round-trip keeps caption_style
    const dlSave = page.waitForEvent('download');
    await page.click('#saveProject');
    const savedFile = await dlSave;
    const saveStream = await savedFile.createReadStream();
    const saveChunks = [];
    for await (const ch of saveStream) saveChunks.push(ch);
    const savedBuf = Buffer.concat(saveChunks);
    const savedJson = JSON.parse(savedBuf.toString('utf8'));
    assert.equal(savedJson.show.atoms[0].caption_style, 'clean_bar');
    assert.equal(savedJson.show.atoms[0].caption, 'CLASH!');

    // Clear caption_style on clip 0, then reopen saved portable file and verify restoration
    await page.selectOption('#captionStyle', '');
    await page.waitForFunction(() => !HMStudio.project.show.atoms[0].caption_style);
    await page.setInputFiles('#projectInput', {
      name: 'roundtrip.motion.json',
      mimeType: 'application/json',
      buffer: savedBuf,
    });
    await page.waitForFunction(() => HMStudio.project.show.atoms[0].caption_style === 'clean_bar' && document.getElementById('captionStyle').value === 'clean_bar');

    // STREET stays silent by default unless operator opts into a style
    await page.click('#loadStreet');
    await page.waitForFunction(() => HMStudio.project?.show?.show_id === 'street-old-city');
    const streetDefault = await page.evaluate(() => ({
      captions: HMStudio.project.show.atoms.filter(a => a.caption || a.caption_style).length,
      selVal: document.getElementById('captionStyle').value,
    }));
    assert.equal(streetDefault.captions, 0);
    assert.equal(streetDefault.selVal, '');

    // 2. Issue #222 — Cam Micro-Move Catalog (UI select, scrub delta, Playable HTML export)
    await page.click('#loadDemo');
    await page.waitForFunction(() => HMStudio.project?.show?.show_id === 'daiyu-wang-five-seconds');
    await page.evaluate(() => {
      HMStudio.editProject(p => {
        p.show.atoms[0].camera = { preset: 'static_hold' };
        return 0;
      });
    });
    await page.waitForFunction(() => HMStudio.composed?.timeline?.atoms?.[0]?.cam?.[0]?.preset === 'static_hold');
    await page.evaluate(() => HMStudio.renderAt(0.15, { source: 'scrub' }));
    const holdFrame = await page.evaluate(() => ({
      img: document.getElementById('stage').toDataURL('image/png'),
      mat: HMStudio.renderer.lastLayerMatrix,
    }));

    await page.selectOption('#camMicroMove', 'punch_in');
    await page.waitForFunction(() => HMStudio.project.show.atoms[0].camera.micro_move === 'punch_in' && HMStudio.composed?.timeline?.atoms?.[0]?.cam?.[0]?.micro_move === 'punch_in');
    await page.evaluate(() => {
      const d = HMStudio.composed.timeline.atoms[0].t1;
      HMStudio.renderAt(d * 0.9, { source: 'scrub' });
    });
    const punchFrame = await page.evaluate(() => ({
      img: document.getElementById('stage').toDataURL('image/png'),
      mat: HMStudio.renderer.lastLayerMatrix,
    }));
    assert.equal(punchFrame.mat.character.micro_move, 'punch_in');
    assert.ok(punchFrame.mat.character.s > holdFrame.mat.character.s, 'punch_in scales up additively over static_hold');

    await page.selectOption('#camMicroMove', 'shake_burst');
    await page.waitForFunction(() => HMStudio.project.show.atoms[0].camera.micro_move === 'shake_burst' && HMStudio.composed?.timeline?.atoms?.[0]?.cam?.[0]?.micro_move === 'shake_burst');
    await page.evaluate(() => HMStudio.renderAt(0.08, { source: 'scrub' }));
    const burstFrame = await page.evaluate(() => ({
      img: document.getElementById('stage').toDataURL('image/png'),
      mat: HMStudio.renderer.lastLayerMatrix,
    }));
    assert.equal(burstFrame.mat.character.micro_move, 'shake_burst');
    assert.notEqual(burstFrame.mat.character.x, holdFrame.mat.character.x);
    assert.notEqual(burstFrame.img, holdFrame.img);

    // Export Playable HTML and verify offline player loads caption_style + micro_move
    await page.click('#exportOpen');
    await page.waitForSelector('#exportDialog[open]');
    const dlHtml = page.waitForEvent('download');
    await page.click('#exportHtml');
    const htmlDl = await dlHtml;
    await page.keyboard.press('Escape');
    const htmlStream = await htmlDl.createReadStream();
    const htmlParts = [];
    for await (const ch of htmlStream) htmlParts.push(ch);
    const htmlStr = Buffer.concat(htmlParts).toString('utf8');
    assert.ok(htmlStr.includes('shake_burst'), 'exported playable HTML includes micro_move data');
    assert.ok(htmlStr.includes('micro_curves'), 'exported playable HTML includes micro_curves evaluator');

    // 3. Issue #223 — Multi-Edit History Receipts (agent batch + UI batch + localStorage + 1-click Undo batch)
    const preBatchAtoms = await page.evaluate(() => JSON.parse(JSON.stringify(HMStudio.project.show.atoms)));
    const agentReceipt = await page.evaluate(() => {
      localStorage.removeItem(HMHistoryReceipts.STORAGE_KEY);
      return HMStudio.applyAgentBatch(project => {
        project.show.atoms.forEach((a, idx) => {
          if (idx < 3) {
            a.caption = 'BEAT-' + (idx + 1);
            a.caption_style = 'impact_hit';
            a.camera = { ...(a.camera || { preset: 'static_hold' }), micro_move: 'scan_gate' };
          }
        });
      }, { source: 'agent-skill', label: 'Stamp 3 clash beats' });
    });

    assert.equal(agentReceipt.atomCount, 3);
    const receiptState = await page.evaluate(() => {
      const panel = document.getElementById('historyReceiptsPanel');
      const stored = JSON.parse(localStorage.getItem(HMHistoryReceipts.STORAGE_KEY) || '[]');
      return {
        panelCount: panel.dataset.count,
        badge: document.getElementById('historyReceiptsCount').textContent,
        listItems: document.querySelectorAll('#historyReceiptsList .history-receipt-item').length,
        storedLen: stored.length,
        storedLabel: stored[0]?.label,
        atom0Cap: HMStudio.project.show.atoms[0].caption,
        atom2Micro: HMStudio.project.show.atoms[2].camera.micro_move,
      };
    });
    assert.equal(receiptState.panelCount, '1');
    assert.match(receiptState.badge, /1 receipt/);
    assert.equal(receiptState.listItems, 1);
    assert.equal(receiptState.storedLen, 1);
    assert.equal(receiptState.storedLabel, 'Stamp 3 clash beats');
    assert.equal(receiptState.atom0Cap, 'BEAT-1');
    assert.equal(receiptState.atom2Micro, 'scan_gate');

    // Reload page and confirm receipt survives via localStorage and Undo batch restores prior show slice
    await page.reload();
    await page.evaluate(() => window.ready);
    await page.click('#historyReceiptsSummary');
    assert.equal(await page.locator('#historyReceiptsList .history-receipt-item').count(), 1);
    await page.click('#undoBatchReceipt');
    await page.waitForFunction(() => {
      const recs = HMStudio.listHistoryReceipts();
      return recs.length === 1 && recs[0].restored === true;
    });
    const postUndoAtoms = await page.evaluate(() => HMStudio.project.show.atoms);
    assert.deepEqual(postUndoAtoms, preBatchAtoms);

    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log('PASS Issues #221, #222, #223 browser E2E (Caption Styles, Cam Micro-Moves, History Receipts)');
  } finally {
    await browser.close();
  }
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

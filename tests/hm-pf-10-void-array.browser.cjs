/* HM-PF-10: void-array golden story loads, scrubs, and bakes in the browser. */
'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
const out = path.resolve(process.env.HM_PROOF_DIR || 'work/qa/hm-pf-10');
const SOURCE = '/workspace/deliverables/fight-baijia-elfmage-void-array-2026-11-06/STORYBOARD-zh.md';
(async () => {
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const forbidden = [];
    const errors = [];
    await context.route('**/*', (route) => {
      const req = route.request();
      const url = req.url();
      if (/^(data:|blob:)/.test(url)) return route.continue();
      let parsed;
      try { parsed = new URL(url); } catch (_) { forbidden.push(url); return route.abort(); }
      if (parsed.origin !== new URL(base).origin || /\/api\//.test(url) || /teqcon|:8770/.test(url) || req.method() !== 'GET') {
        forbidden.push(url);
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.accept());
    await page.goto(base + '/ui/?show=fight-baijia-elfmage-void-array-2026-11-06');
    await page.evaluate(() => window.ready);
    await page.waitForFunction(() => !HMStudio.loading && HMStudio.project && HMStudio.project.show.show_id === 'baijia-elfmage-void-array');
    const opened = await page.evaluate(() => ({
      id: HMStudio.project.show.show_id,
      title: HMStudio.project.show.title,
      duration: HMStudio.duration,
      beats: HMStudio.project.show.atoms.length,
      path: document.getElementById('cantoneseBoardPath').textContent,
      label: document.getElementById('cantoneseBoardSource').textContent,
      hidden: document.getElementById('cantoneseBoardSource').hidden,
      first: HMStudio.project.show.atoms[0].label,
      last: HMStudio.project.show.atoms.at(-1).label,
      ok: HMStudio.composed && HMStudio.composed.ok,
      plates: HMStudio.composed && HMStudio.composed.timeline.plates.length,
    }));
    assert.equal(opened.id, 'baijia-elfmage-void-array');
    assert.equal(opened.duration, 30);
    assert.equal(opened.beats, 47);
    assert.equal(opened.path, SOURCE);
    assert.match(opened.label, /Cantonese board/);
    assert.equal(opened.hidden, false);
    assert.equal(opened.first, 'P01 廣角建立');
    assert.equal(opened.last, 'P47 停推漸黑');
    assert.equal(opened.ok, true);
    assert.equal(opened.plates, 47);
    await page.fill('#scrub', '15');
    await page.locator('#scrub').dispatchEvent('input');
    assert.equal(await page.evaluate(() => HMStudio.time), 15);
    await page.click('#play');
    await page.waitForFunction(() => HMStudio.playing && HMStudio.time > 15);
    await page.click('#play');
    await page.click('#openTemplates');
    await page.click('#templateList [data-template-id="baijia-elfmage-void-array"]');
    await page.waitForFunction(() => !HMStudio.loading && HMStudio.project.show.show_id === 'baijia-elfmage-void-array' && HMStudio.duration === 30);
    fs.mkdirSync(out, { recursive: true });
    await page.screenshot({ path: path.join(out, 'void-array-board.png'), fullPage: true });
    await page.click('#exportOpen');
    await page.waitForSelector('#exportDialog[open]');
    assert.equal(await page.locator('#exportHtml').isEnabled(), true);
    await page.screenshot({ path: path.join(out, 'void-array-bake.png'), fullPage: true });
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#exportHtml')]);
    assert.equal(await download.failure(), null);
    const bakedPath = path.join(out, 'baijia-elfmage-void-array.html');
    await download.saveAs(bakedPath);
    const baked = fs.readFileSync(bakedPath, 'utf8');
    assert.match(baked, /HTML Motion · Plate animation · Plays offline/);
    assert.equal(baked.includes('teqcon'), false);
    assert.equal(baked.includes(':8770'), false);
    const player = await context.newPage();
    const playerNet = [];
    await player.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith('file:') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
      playerNet.push(url);
      return route.abort();
    });
    await player.goto('file://' + bakedPath);
    await player.evaluate(() => window.ready);
    await player.evaluate(() => renderAt(12.5));
    assert.match(await player.locator('#time').textContent(), /12\.50 \/ 30\.00/);
    assert.match(await player.locator('#title').textContent(), /虛空法陣/);
    await player.click('#play');
    await player.waitForTimeout(200);
    await player.click('#play');
    assert.deepEqual(playerNet, []);
    await player.close();
    const proof = {
      base,
      show_id: opened.id,
      beats: 47,
      seconds: 30,
      cantonese_board_source: SOURCE,
      baked_html_bytes: fs.statSync(bakedPath).size,
      forbidden,
      errors,
    };
    fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(proof, null, 2));
    assert.deepEqual(forbidden, []);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify(proof));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

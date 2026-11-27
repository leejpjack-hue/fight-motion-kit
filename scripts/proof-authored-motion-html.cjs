#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const GOLD_REL = 'public/shows/daiyu-wang-five-seconds.json';
const SHOW_ID = 'hm-288-authored';
const EDITED_DURATION_S = 0.75;
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

class ProofError extends Error {
  constructor(reason, extra) {
    super(reason);
    this.reason = reason;
    this.extra = extra || {};
  }
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function parseArgs(argv) {
  const out = { via: 'skill', authorOnly: false, outDir: '' };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--author-only') out.authorOnly = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--via') out.via = argv[++i];
    else if (arg === '--out') out.outDir = argv[++i];
    else throw new ProofError('Unknown argument: ' + arg);
    if ((arg === '--via' || arg === '--out') && !argv[i]) throw new ProofError('Missing value for ' + arg);
  }
  if (out.via !== 'skill' && out.via !== 'mcp') throw new ProofError('--via must be skill or mcp');
  return out;
}

function printHelp() {
  process.stdout.write([
    'Author one motion HTML with the local skill or stdio MCP, open it in the composer, edit the first clip, and trigger Export Video.',
    '',
    '  node scripts/proof-authored-motion-html.cjs [--via skill|mcp] [--author-only] [--out DIR]',
    '',
    'COMPOSER_URL  Composer origin. Default http://127.0.0.1:8765',
    'PROOF_DIR     When set, write opened/edited/export screenshots and the video there.',
    '',
    'Exit 2 prints JSON { ok:false, reason }. The command does not deploy and does not start a skill host.',
    '',
  ].join('\n'));
}

function oneBeatShow(via) {
  const goldPath = path.join(REPO, GOLD_REL);
  const gold = JSON.parse(fs.readFileSync(goldPath, 'utf8'));
  const beat = gold.atoms && gold.atoms[0];
  if (!beat || typeof beat.duration_s !== 'number') {
    throw new ProofError('The 5.00s demo has no first beat to author from.');
  }
  return Object.assign({}, gold, {
    show_id: SHOW_ID,
    title: (via === 'mcp' ? 'MCP' : 'Skill') + '-authored one-beat film',
    duration_target_s: beat.duration_s,
    atoms: [beat],
  });
}

function assertOutDir(dir) {
  const resolved = path.resolve(dir);
  const shows = path.resolve(REPO, 'public/shows');
  const gold = path.resolve(REPO, GOLD_REL);
  if (resolved === gold || resolved === shows || resolved.startsWith(shows + path.sep)) {
    throw new ProofError('Refusing to write the proof into public/shows or the 5.00s demo.');
  }
  return resolved;
}

function authorWithSkill(work, showPath) {
  const projPath = path.join(work, 'project.motion.json');
  const htmlPath = path.join(work, 'authored.html');
  const script = path.join(REPO, 'skills/html-motion-composer/scripts/build-project.cjs');
  try {
    execFileSync(process.execPath, [
      script, '--repo', REPO, '--show', showPath, '--out', projPath, '--emit-html', htmlPath,
    ], { encoding: 'utf8' });
  } catch (error) {
    throw new ProofError('skills/html-motion-composer/scripts/build-project.cjs --emit-html failed. ' + (error.stderr || error.message));
  }
  return htmlPath;
}

async function authorWithMcp(work, showPath) {
  const htmlPath = path.join(work, 'authored.html');
  const { createToolset } = require(path.join(REPO, 'mcp/hm-studio-mcp/tools.cjs'));
  const tools = createToolset({ workspaceRoot: work, repoRoot: REPO });
  const exp = await tools.callTool('hm_export_editable_html', {
    path: path.relative(work, showPath),
    out_html: path.relative(work, htmlPath),
  });
  if (!exp || exp.ok !== true) throw new ProofError('MCP hm_export_editable_html did not return ok.');
  return htmlPath;
}

function composerPageUrl(raw) {
  const url = new URL(raw || 'http://127.0.0.1:8765');
  if (!url.pathname || url.pathname === '/') url.pathname = '/ui/';
  return url;
}

function probeComposer(pageUrl) {
  const target = new URL('/ui/', pageUrl.origin);
  const lib = target.protocol === 'https:' ? require('node:https') : http;
  const timeoutMs = target.protocol === 'https:' ? 8000 : 800;
  return new Promise(resolve => {
    const req = lib.get(target, res => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
  });
}

function startStatic(port) {
  const root = path.join(REPO, 'public');
  const server = http.createServer((req, res) => {
    let fp;
    try {
      const clean = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '');
      fp = path.resolve(root, clean);
    } catch (_) {
      res.writeHead(400).end();
      return;
    }
    if (fp !== root && !fp.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
    if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': MIMES[path.extname(fp)] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function ensureComposer(pageUrl) {
  if (await probeComposer(pageUrl)) return { server: null, started: false };
  const host = pageUrl.hostname;
  const loopback = host === '127.0.0.1' || host === 'localhost';
  if (!loopback) {
    throw new ProofError('Composer did not respond at ' + pageUrl.origin + '. Start it with npm run dev, or set COMPOSER_URL. This proof does not deploy.');
  }
  const port = Number(pageUrl.port || 80);
  try {
    const server = await startStatic(port);
    return { server, started: true };
  } catch (error) {
    if (error && error.code === 'EADDRINUSE' && await probeComposer(pageUrl)) return { server: null, started: false };
    throw new ProofError('Local composer is not running at ' + pageUrl.origin + ' and a static server could not bind. ' + error.message);
  }
}

async function shot(page, name) {
  const dir = process.env.PROOF_DIR;
  if (!dir) return null;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  await page.screenshot({ path: file });
  return file;
}

async function openAndExport(htmlPath, pageUrl) {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (error) {
    throw new ProofError('Playwright is not installed, so the composer open cannot run. ' + error.message);
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--disable-gpu'] });
  } catch (error) {
    throw new ProofError('Playwright could not launch a browser, so the composer open cannot run. ' + error.message);
  }
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    try {
      await page.goto(pageUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.evaluate(() => window.ready);
      await page.waitForFunction(() => window.HMStudio && !HMStudio.loading, null, { timeout: 60000 });
    } catch (error) {
      throw new ProofError('Composer did not become ready at ' + pageUrl.toString() + '. ' + error.message, { page_errors: pageErrors });
    }
    await page.setInputFiles('#projectInput', htmlPath);
    try {
      await page.waitForFunction(id => window.HMStudio && HMStudio.project && HMStudio.project.show && HMStudio.project.show.show_id === id, SHOW_ID, { timeout: 90000 });
      await page.waitForFunction(() => !HMStudio.loading, null, { timeout: 60000 });
      await page.evaluate(() => HMStudio.compile());
    } catch (error) {
      const status = await page.locator('#exportStatus').textContent().catch(() => '');
      throw new ProofError('Authored HTML did not open as a film. ' + (status || error.message), { page_errors: pageErrors });
    }
    const opened = await page.evaluate(() => ({
      show_id: HMStudio.project.show.show_id,
      title: HMStudio.project.show.title,
      atoms: HMStudio.project.show.atoms.length,
      duration_s: HMStudio.duration,
      film: document.getElementById('firstPathFilm') ? document.getElementById('firstPathFilm').textContent : '',
      receipt: document.getElementById('importReceiptStatus') ? document.getElementById('importReceiptStatus').textContent : '',
      status: document.getElementById('exportStatus') ? document.getElementById('exportStatus').textContent : '',
      duration_disabled: !!(document.getElementById('duration') && document.getElementById('duration').disabled),
      empty_stage_hidden: document.getElementById('emptyStage') ? document.getElementById('emptyStage').hidden : null,
      export_video_disabled: document.getElementById('exportVideo') ? document.getElementById('exportVideo').disabled : true,
    }));
    if (opened.atoms < 1 || opened.duration_disabled || opened.empty_stage_hidden !== true) {
      throw new ProofError('Opened project is not an editable film.', { opened });
    }
    await shot(page, 'hm-288-opened.png');
    await page.fill('#duration', String(EDITED_DURATION_S));
    await page.locator('#duration').dispatchEvent('change');
    try {
      await page.waitForFunction(value => HMStudio.project.show.atoms[0].duration_s === value && HMStudio.duration === value, EDITED_DURATION_S, { timeout: 15000 });
    } catch (error) {
      throw new ProofError('Clip duration edit did not stick. ' + error.message);
    }
    await shot(page, 'hm-288-edited.png');
    await page.click('#exportOpen');
    await page.waitForFunction(() => document.getElementById('exportDialog') && document.getElementById('exportDialog').open, null, { timeout: 15000 });
    const gate = await page.evaluate(() => ({
      disabled: document.getElementById('exportVideo').disabled,
      status: document.getElementById('exportStatus') ? document.getElementById('exportStatus').textContent : '',
    }));
    if (process.env.PROOF_DIR) {
      fs.mkdirSync(process.env.PROOF_DIR, { recursive: true });
      await page.locator('#exportDialog').screenshot({
        path: path.join(process.env.PROOF_DIR, 'hm-288-export-dialog.png'),
      }).catch(() => {});
    }
    if (gate.disabled) {
      throw new ProofError('Export Video stayed disabled. ' + gate.status, { opened });
    }
    const downloadPromise = page.waitForEvent('download', { timeout: 90000 });
    await page.click('#exportVideo');
    const download = await downloadPromise;
    const failure = await download.failure();
    if (failure) throw new ProofError('Export Video was triggered but the download failed. ' + failure);
    const videoPath = process.env.PROOF_DIR
      ? path.join(process.env.PROOF_DIR, download.suggestedFilename() || 'hm-288-authored.webm')
      : path.join(path.dirname(htmlPath), 'export.webm');
    if (process.env.PROOF_DIR) fs.mkdirSync(process.env.PROOF_DIR, { recursive: true });
    await download.saveAs(videoPath);
    const bytes = fs.statSync(videoPath).size;
    if (!(bytes > 100)) throw new ProofError('Export Video produced an empty file.');
    const exportStatus = await page.locator('#exportStatus').textContent();
    await shot(page, 'hm-288-exported.png');
    if (pageErrors.length) {
      throw new ProofError('Composer page error while opening the authored film. ' + pageErrors[0], { page_errors: pageErrors });
    }
    return {
      opened,
      edited_duration_s: EDITED_DURATION_S,
      export: {
        filename: download.suggestedFilename(),
        bytes,
        status: exportStatus,
      },
      page_errors: pageErrors,
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { printHelp(); return; }
  const goldBefore = sha256(path.join(REPO, GOLD_REL));
  const work = assertOutDir(args.outDir || fs.mkdtempSync(path.join(os.tmpdir(), 'hm-288-')));
  fs.mkdirSync(work, { recursive: true });
  const show = oneBeatShow(args.via);
  const showPath = path.join(work, 'show.json');
  fs.writeFileSync(showPath, JSON.stringify(show, null, 2));
  const htmlPath = args.via === 'mcp' ? await authorWithMcp(work, showPath) : authorWithSkill(work, showPath);
  if (!fs.existsSync(htmlPath)) throw new ProofError('Authoring reported success but wrote no HTML.');
  const html = fs.readFileSync(htmlPath, 'utf8');
  if (!html.includes('id="hm-project-data"')) throw new ProofError('Authored HTML is missing hm-project-data.');
  const goldAfter = sha256(path.join(REPO, GOLD_REL));
  if (goldBefore !== goldAfter) throw new ProofError('The 5.00s demo file changed during the proof.');
  const report = {
    ok: true,
    via: args.via,
    show_id: SHOW_ID,
    html: htmlPath,
    bytes: Buffer.byteLength(html),
    gold_sha256: goldAfter,
    author_only: args.authorOnly,
  };
  if (!args.authorOnly) {
    const pageUrl = composerPageUrl(process.env.COMPOSER_URL);
    const composer = await ensureComposer(pageUrl);
    try {
      const opened = await openAndExport(htmlPath, pageUrl);
      report.composer = pageUrl.toString();
      report.composer_started = composer.started;
      report.film = opened.opened.film;
      report.receipt = opened.opened.receipt;
      report.open_status = opened.opened.status;
      report.edited_duration_s = opened.edited_duration_s;
      report.export = opened.export;
      report.page_errors = opened.page_errors;
    } finally {
      if (composer.server) await new Promise(resolve => composer.server.close(resolve));
    }
  }
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

main().catch(error => {
  const reason = error instanceof ProofError ? error.reason : (error && error.message) || String(error);
  const extra = error instanceof ProofError ? error.extra : {};
  process.stdout.write(JSON.stringify(Object.assign({ ok: false, reason }, extra), null, 2) + '\n');
  process.exitCode = 2;
});

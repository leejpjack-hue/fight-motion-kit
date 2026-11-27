'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const GOLD_REL = 'public/shows/daiyu-wang-five-seconds.json';
const PROOF = path.join(REPO, 'scripts/proof-authored-motion-html.cjs');

require(path.join(REPO, 'public/ui/import-security.js'));
require(path.join(REPO, 'public/ui/html-import.js'));

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function runAuthor(via) {
  return spawnSync(process.execPath, [PROOF, '--author-only', '--via', via], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 120000,
  });
}

for (const via of ['skill', 'mcp']) {
  test('#288 ' + via + ' authors one motion HTML from the 5.00s demo beat without writing that file', () => {
    const goldPath = path.join(REPO, GOLD_REL);
    const before = sha256(goldPath);
    const gold = JSON.parse(fs.readFileSync(goldPath, 'utf8'));
    const run = runAuthor(via);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const report = JSON.parse(run.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.via, via);
    assert.equal(report.author_only, true);
    assert.equal(report.show_id, 'hm-288-authored');
    assert.equal(sha256(goldPath), before);
    assert.equal(report.gold_sha256, before);
    assert.equal(fs.existsSync(report.html), true);
    assert.equal(path.resolve(report.html).startsWith(path.resolve(REPO, 'public')), false);

    const html = fs.readFileSync(report.html, 'utf8');
    const imported = globalThis.HMHtmlImport.parseMotionHtml(html, { fileName: 'authored.html' });
    assert.equal(imported.kind, 'hm-project-data');
    assert.equal(imported.project.show.show_id, 'hm-288-authored');
    assert.equal(imported.project.show.title, (via === 'mcp' ? 'MCP' : 'Skill') + '-authored one-beat film');
    assert.equal(imported.project.show.atoms.length, 1);
    assert.equal(imported.project.show.atoms[0].id, gold.atoms[0].id);
    assert.equal(imported.project.show.atoms[0].duration_s, gold.atoms[0].duration_s);
    assert.equal(imported.project.show.atoms[0].camera.preset, gold.atoms[0].camera.preset);
    assert.deepEqual(imported.project.show.atoms[0].hero.plates, gold.atoms[0].hero.plates);
    assert.equal(imported.project.show.show_id === gold.show_id, false);
    fs.rmSync(path.dirname(report.html), { recursive: true, force: true });
  });
}

test('#288 proof rejects an unknown author and a write into public/shows', () => {
  const unknown = spawnSync(process.execPath, [PROOF, '--author-only', '--via', 'cloud'], {
    cwd: REPO,
    encoding: 'utf8',
  });
  assert.equal(unknown.status, 2);
  assert.equal(JSON.parse(unknown.stdout).ok, false);

  const shows = spawnSync(process.execPath, [PROOF, '--author-only', '--out', path.join(REPO, 'public/shows')], {
    cwd: REPO,
    encoding: 'utf8',
  });
  assert.equal(shows.status, 2);
  const refused = JSON.parse(shows.stdout);
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /public\/shows/);
});

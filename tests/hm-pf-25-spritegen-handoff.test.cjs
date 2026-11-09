const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { classifyHandoff } = require('../skills/hm-spritegen-handoff/handoff.cjs');

const repo = path.join(__dirname, '..');
const skill = fs.readFileSync(path.join(repo, 'skills/hm-spritegen-handoff/SKILL.md'), 'utf8');
const doc = fs.readFileSync(path.join(repo, 'docs/product-flow/HM-PF-25-spritegen-handoff.md'), 'utf8');
const flow = fs.readFileSync(path.join(repo, 'docs/product-flow/PRODUCT-FLOW.md'), 'utf8');
const gate = fs.readFileSync(path.join(repo, 'skills/hm-spritegen-handoff/handoff.cjs'), 'utf8');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const strip = (extra = {}) => Buffer.from(JSON.stringify({ frames: 4, w: 8, h: 16, body_h: 16, fps: 12, ...extra }));
const pair = (pngName = 'kick.strip.png', jsonName = 'kick.strip.json', json = strip(), png = PNG) => (
  [{ name: pngName, bytes: png }, { name: jsonName, bytes: json }]
);

test('HM-PF-25 skill states the outside-FE contract and cites SG-00', () => {
  assert.match(skill, /Generation stays outside the FE/);
  assert.match(skill, /File API import only/);
  assert.match(skill, /first path is strip PNG\+JSON/i);
  assert.match(skill, /Credential files and run-session files are rejected/);
  assert.match(skill, /\/workspace\/hr\/briefs\/sprite-gen-html-motion-2026-11-07\.md/);
  assert.match(skill, /SG-00 is the schema SoT/);
  assert.match(skill, /sprite-gen-html-motion-urak\.pages\.grok\.bot/);
  assert.match(doc, /SG-00/);
  assert.match(doc, /\/workspace\/hr\/briefs\/sprite-gen-html-motion-2026-11-07\.md/);
  assert.match(doc, /File API/);
  assert.match(doc, /HM-PF-05/);
  assert.match(flow, /HM-PF-25-spritegen-handoff\.md/);
  assert.match(flow, /generation stays outside the FE/i);
  assert.doesNotMatch(gate, /child_process|fetch\(|https?\.request|net\.connect|teqcon|:8770|wrangler/);
  assert.doesNotMatch(skill, /wrangler deploy|api\.teqcon\.uk|:8770/);
});

test('HM-PF-25 accepts a strip PNG+JSON pair as the first path', () => {
  const accepted = classifyHandoff(pair());
  assert.equal(accepted.ok, true);
  assert.equal(accepted.path, 'strip-png-json');
  assert.equal(accepted.generation, 'outside-fe');
  assert.equal(accepted.import, 'file-api');
  assert.deepEqual(accepted.files, ['kick.strip.png', 'kick.strip.json']);
  const generic = classifyHandoff(pair('walk.png', 'walk.json'));
  assert.equal(generic.ok, true);
  assert.equal(generic.path, 'strip-png-json');
  assert.equal(classifyHandoff(pair().reverse()).ok, true);
});

test('HM-PF-25 rejects credential and run-session files', () => {
  const names = [
    ['credentials.json', 'credential'],
    ['credential.json', 'credential'],
    ['.env', 'credential'],
    ['.env.local', 'credential'],
    ['api-key.json', 'credential'],
    ['token.json', 'credential'],
    ['secrets.txt', 'credential'],
    ['session.json', 'run-session'],
    ['run-session.json', 'run-session'],
    ['run_session.json', 'run-session'],
    ['prod.session.json', 'run-session']
  ];
  for (const [name, reason] of names) {
    const result = classifyHandoff([...pair(), { name, bytes: Buffer.from('secret-bytes') }]);
    assert.equal(result.ok, false, name);
    assert.equal(result.path, null);
    assert.ok(result.rejected.some(item => item.name === name && item.reason === reason), name);
  }
  const keyed = classifyHandoff(pair('kick.strip.png', 'kick.strip.json', strip({ api_key: 'sekret' })));
  assert.equal(keyed.ok, false);
  assert.equal(keyed.rejected[0].reason, 'credential');
  assert.match(keyed.error, /Credential files are rejected/);
  const sessionText = classifyHandoff(pair('kick.strip.png', 'kick.strip.json', strip({ warnings: ['held session'] })));
  assert.equal(sessionText.ok, false);
  assert.equal(sessionText.rejected[0].reason, 'run-session');
  assert.match(sessionText.error, /Run-session files are rejected/);
  const alone = classifyHandoff([{ name: 'credentials.json', bytes: Buffer.from('{"token":"x"}') }]);
  assert.equal(alone.ok, false);
  assert.equal(alone.rejected[0].reason, 'credential');
  assert.equal(JSON.stringify(alone).includes('sekret'), false);
  assert.equal(JSON.stringify(keyed).includes('sekret'), false);
});

test('HM-PF-25 keeps atlas, root_motion, and non-pairs off the first path', () => {
  const atlas = classifyHandoff(pair('walk.strip.png', 'manifest.json', strip()));
  assert.equal(atlas.ok, false);
  assert.equal(atlas.rejected[0].reason, 'atlas-hold');
  const root = classifyHandoff(pair('walk.strip.png', 'walk.strip.json', strip({ root_motion: { dx: 1 } })));
  assert.equal(root.ok, false);
  assert.equal(root.rejected[0].reason, 'root-motion-hold');
  assert.match(classifyHandoff(pair().slice(0, 1)).error, /strip PNG/);
  assert.equal(classifyHandoff([]).ok, false);
  assert.equal(classifyHandoff([{ name: '../secrets.json', bytes: PNG }]).rejected[0].reason, 'unsafe-name');
  assert.equal(classifyHandoff(pair('kick.strip.png', 'kick.strip.json', Buffer.from('{}'))).rejected[0].reason, 'not-strip');
  assert.equal(classifyHandoff(pair('kick.strip.png', 'kick.strip.json', strip(), Buffer.from('not-a-png'))).rejected[0].reason, 'not-png');
});

test('HM-PF-25 CLI accepts a strip pair and rejects a run directory without listing it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-pf-25-'));
  const png = path.join(dir, 'kick.strip.png');
  const json = path.join(dir, 'kick.strip.json');
  fs.writeFileSync(png, PNG);
  fs.writeFileSync(json, strip());
  const ok = spawnSync(process.execPath, ['skills/hm-spritegen-handoff/handoff.cjs', png, json], { cwd: repo, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).path, 'strip-png-json');
  const run = path.join(dir, 'run-session');
  fs.mkdirSync(run);
  fs.writeFileSync(path.join(run, 'secret-token.txt'), 'do-not-print');
  const rejected = spawnSync(process.execPath, ['skills/hm-spritegen-handoff/handoff.cjs', png, json, run], { cwd: repo, encoding: 'utf8' });
  assert.equal(rejected.status, 1);
  const body = JSON.parse(rejected.stdout);
  assert.equal(body.ok, false);
  assert.ok(body.rejected.some(item => item.name === 'run-session' && item.reason === 'run-session'));
  assert.equal(rejected.stdout.includes('do-not-print'), false);
  assert.equal(rejected.stdout.includes('secret-token.txt'), false);
  const usage = spawnSync(process.execPath, ['skills/hm-spritegen-handoff/handoff.cjs'], { cwd: repo, encoding: 'utf8' });
  assert.equal(usage.status, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

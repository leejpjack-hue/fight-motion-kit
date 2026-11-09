const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(repo, rel), 'utf8');
const pack = read('docs/product-flow/HM-PF-51-skill-pack.md');
const rows = [...pack.matchAll(/^\| (\d+) \| `([^`]+)` \| `([^`]+)` \| (shipped|stub|designed-hold) \|$/gm)]
  .map(m => ({ step: m[1], name: m[2], file: m[3], kind: m[4] }));

const HEADINGS = ['## Inputs', '## Outputs', '## FE handoff', '## Anti-jobs'];

test('HM-PF-51 indexes the Approval skill name set once', () => {
  assert.deepEqual(rows.map(r => r.name), [
    'hm-character-lock',
    'hm-storyboard-cantonese',
    'hm-rhythm-pacing',
    'hm-cam-grammar-scene',
    'hm-cam-shot-author',
    'hm-spritegen-handoff',
    'hm-bg-scene-author',
    'hm-fg-layer-author',
    'html-motion-fight-video',
    'hm-compose-fx-impact',
    'hm-voice-track',
  ]);
  assert.deepEqual(rows.map(r => r.step), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '9', '10']);
  assert.match(pack, /HOLDs are unchanged/);
  for (const id of ['HM-PF-27', 'HM-PF-28', 'HM-PF-47', 'HM-PF-48']) assert.match(pack, new RegExp(id));
  assert.match(read('docs/product-flow/PRODUCT-FLOW.md'), /HM-PF-51-skill-pack\.md/);
  assert.match(read('docs/product-flow/beat-id-bridge.md'), /HM-PF-06/);
});

test('HM-PF-51 stub files are contracts only', () => {
  const stubs = rows.filter(r => r.kind !== 'shipped');
  assert.equal(rows.find(row => row.name === 'hm-storyboard-cantonese').kind, 'shipped');
  assert.equal(rows.find(row => row.name === 'hm-bg-scene-author').kind, 'shipped');
  assert.equal(rows.find(row => row.name === 'hm-fg-layer-author').kind, 'shipped');
  assert.equal(stubs.length, 2);
  for (const row of stubs) {
    const text = read(row.file);
    assert.match(text, new RegExp('^---\\nname: ' + row.name + '\\n', 'm'));
    for (const heading of HEADINGS) assert.ok(text.includes(heading), row.name + ' missing ' + heading);
    assert.doesNotMatch(text, /```/);
    assert.doesNotMatch(text, /\b(require|import|function)\s*\(/);
    const dir = path.dirname(path.join(repo, row.file));
    assert.deepEqual(fs.readdirSync(dir).sort(), ['SKILL.md']);
  }
});

test('HM-PF-51 leaves shipped skills in place', () => {
  for (const row of rows.filter(r => r.kind === 'shipped')) {
    const text = read(row.file);
    assert.match(text, new RegExp('name: ' + row.name));
    assert.doesNotMatch(text, /HM-PF-51 contract stub/);
    assert.ok(fs.statSync(path.join(repo, row.file)).size > 800);
  }
});

test('HM-PF-51 voice stub stays DESIGNED-HOLD', () => {
  const voice = rows.find(r => r.name === 'hm-voice-track');
  assert.equal(voice.kind, 'designed-hold');
  const text = read(voice.file);
  assert.match(text, /\*\*Status:\*\* DESIGNED-HOLD/);
  assert.match(text, /\*\*Not SIGNED\.\*\*/);
  assert.match(text, /#41/);
  assert.match(text, /HM-PF-47/);
  assert.match(text, /HM-PF-48/);
  assert.doesNotMatch(text, /Status:\*\* SIGNED/);
  assert.match(text, /Do not SIGN/);
  assert.match(text, /Do not enable n8n step 10/);
  const fight = read('skills/html-motion-fight-video/SKILL.md');
  assert.match(fight, /Voice is not an output/);
  assert.match(fight, /does not replace that skill/);
  assert.match(fight, /must not fork them/);
});

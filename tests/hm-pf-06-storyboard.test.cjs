'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const board = require(path.join(root, 'public/ui/storyboard-board.js'));
const helper = path.join(root, 'skills/hm-storyboard-cantonese/scripts/board.cjs');
const sourceFixture = path.join(root, 'skills/hm-storyboard-cantonese/fixtures/source-headers.md');
const skill = fs.readFileSync(path.join(root, 'skills/hm-storyboard-cantonese/SKILL.md'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/ui/index.html'), 'utf8');
const five = fs.readFileSync(path.join(root, 'public/shows/daiyu-wang-five-seconds.json'), 'utf8');

function run(args, cwd) {
  return spawnSync(process.execPath, [helper, ...args], { cwd, encoding: 'utf8' });
}

function element() {
  const listeners = {};
  return {
    value: '', textContent: '', dataset: {}, readOnly: false, disabled: false,
    addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
    dispatch(type) { (listeners[type] || []).forEach(listener => listener({})); },
    click() { this.dispatch('click'); },
    focus() { this.focused = true; },
  };
}

test('skill flow requires Jack GO before gen or rhythm and keeps STORYBOARD-zh headers', () => {
  assert.match(skill, /2 Story · Jack GO gate/);
  assert.match(skill, /Approve/);
  assert.match(skill, /before gen or rhythm/i);
  assert.match(skill, /advance --to gen/);
  assert.match(skill, /--to rhythm/);
  assert.match(skill, /refuse to continue without/);
  assert.match(skill, /never writes PNG/);
  assert.match(skill, /STORYBOARD-zh\.md/);
  assert.match(skill, /Do not rename/);
  for (const hold of ['HM-PF-27', 'HM-PF-28', 'HM-PF-47', 'HM-PF-48', '#41', 'SG-01', '30a']) {
    assert.match(skill, new RegExp(hold.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('emit keeps source headers, second marks, and Cantonese labels without plate files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-pf-06-'));
  const out = path.join(dir, 'duel.board.md');
  const result = run([
    'emit', '--brief', '0–1 對峙\n1–2 白家衝拳\n2–3 法陣擋',
    '--show-id', 'street-duel', '--source', sourceFixture, '--out', out,
  ], dir);
  assert.equal(result.status, 0, result.stderr);
  const text = fs.readFileSync(out, 'utf8');
  const json = JSON.parse(fs.readFileSync(path.join(dir, 'duel.board.json'), 'utf8'));
  const source = board.parse(fs.readFileSync(sourceFixture, 'utf8'));
  assert.deepEqual(json.fields, source.fields);
  assert.equal(json.fields_from, 'source');
  assert.deepEqual(json.beats.map(beat => beat.second), ['0–1', '1–2', '2–3']);
  assert.deepEqual(json.beats.map(beat => beat.label), ['對峙', '白家衝拳', '法陣擋']);
  assert.equal(json.beats[0].fields['法陣'], '');
  assert.equal(json.beats[0].fields['板'], '未出板');
  assert.equal(json.plates, 'none');
  assert.equal(json.pf08.kind, 'hm-pf-08-board');
  assert.equal(json.pf08.beats[1].label, '白家衝拳');
  assert.match(text, /\| 秒 \| beat_id \| 鏡頭 \| 法陣 \| 板 \|/);
  assert.equal(fs.readdirSync(dir).some(name => /\.(png|webp|jpe?g)$/i.test(name)), false);
  const checked = run(['check', '--board', out, '--source', sourceFixture], dir);
  assert.equal(checked.status, 0, checked.stderr);
});

test('a renamed header fails the source check', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-pf-06-'));
  const out = path.join(dir, 'renamed.md');
  const source = fs.readFileSync(sourceFixture, 'utf8').replaceAll('法陣', '陣眼');
  fs.writeFileSync(path.join(dir, 'renamed-source.md'), source);
  const emitted = run([
    'emit', '--brief', '0–1 對峙', '--show-id', 'street-duel',
    '--source', path.join(dir, 'renamed-source.md'), '--out', out,
  ], dir);
  assert.equal(emitted.status, 0, emitted.stderr);
  const diverged = run(['check', '--board', out, '--source', sourceFixture], dir);
  assert.equal(diverged.status, 1);
  assert.match(diverged.stderr, /headers diverged/);
});

test('advance blocks gen and rhythm without Jack GO and writes nothing with GO', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-pf-06-'));
  const out = path.join(dir, 'duel.board.md');
  assert.equal(run(['emit', '--brief', '0–1 開場', '--show-id', 'street-duel', '--out', out], dir).status, 0);
  const before = fs.readdirSync(dir).sort();
  const blocked = run(['advance', '--to', 'gen', '--board', out], dir);
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /Jack GO gate/);
  const rhythmBlocked = run(['advance', '--to', 'rhythm', '--board', out], dir);
  assert.equal(rhythmBlocked.status, 1);
  assert.match(rhythmBlocked.stderr, /Jack GO gate/);
  const go = path.join(dir, 'go.json');
  fs.writeFileSync(go, JSON.stringify({ Decision: 'Approve', step: 2, step_id: 'story', show_id: 'street-duel' }));
  const opened = run(['advance', '--to', 'gen', '--board', out, '--go-file', go], dir);
  assert.equal(opened.status, 0, opened.stderr);
  assert.match(opened.stdout, /does not generate plates/);
  const after = fs.readdirSync(dir).sort();
  assert.deepEqual(after.filter(name => name !== 'go.json'), before);
  assert.equal(after.some(name => /\.(png|webp|jpe?g)$/i.test(name)), false);
});

test('HM board surface opens editable text and does not create plates', () => {
  assert.match(html, /<textarea id="hmBoardText"[^>]*>/);
  assert.doesNotMatch(html.match(/<textarea id="hmBoardText"[^>]*>/)[0], /readonly|disabled/);
  assert.ok(html.indexOf('src="./storyboard-board.js" defer') < html.indexOf('src="./app.js" defer'));
  const section = html.match(/<section id="hmBoardSurface"[\s\S]*?<\/section>/)[0];
  assert.match(section, /does not generate plates/);
  const nodes = Object.fromEntries([...section.matchAll(/<\w+\b[^>]*\bid="([^"]+)"[^>]*>/g)].map(match => [match[1], element()]));
  const panel = { querySelector: selector => nodes[selector.slice(1)] };
  const storage = new Map();
  const gate = { dataset: { state: 'review' }, querySelector: () => element() };
  const mounted = board.mount(panel, {
    gate,
    storage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)) },
  });
  const input = nodes.hmBoardText;
  input.value = '| 秒 | 鏡頭 |\n| --- | --- |\n| 0–1 | 改對峙 |';
  input.dispatch('input');
  assert.equal(storage.get(board.STORAGE_KEY), input.value);
  assert.equal(mounted.text(), input.value);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'public/ui/storyboard-board.js'), 'utf8'), /writeFile|composeShow|\.png/);
  gate.dataset.state = 'approved';
  mounted.refresh();
  assert.match(nodes.hmBoardStatus.textContent, /does not generate plates/);
  assert.match(nodes.hmBoardStatus.textContent, /Jack GO is saved/);
  const parsed = board.parse(input.value);
  assert.equal(parsed.beats[0].label, '改對峙');
  assert.equal(parsed.beats[0].second, '0–1');
});

test('five-second demo show stays 5.00s and this change adds no plates to it', () => {
  const show = JSON.parse(five);
  assert.equal(show.atoms.reduce((sum, atom) => sum + atom.duration_s, 0), 5);
  assert.equal(show.show_id, 'daiyu-wang-five-seconds');
});

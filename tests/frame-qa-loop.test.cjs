const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const script = path.join(repo, 'skills/html-motion-composer/scripts/frame-qa.cjs');
const fixture = path.join(repo, 'skills/html-motion-composer/fixtures/hm-hf-06-broken-slice.json');

function run(args) {
  return spawnSync(process.execPath, [script, ...args], {cwd: repo, encoding: 'utf8'});
}

function readOut(dir, name) {
  return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
}

test('HM-HF-06: lint Errors block peek and claim; a fix then peek then claim', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-hf-06-'));
  const showPath = path.join(dir, 'show.json');
  const out = path.join(dir, 'qa');
  fs.copyFileSync(fixture, showPath);

  const failed = run(['lint', '--repo', repo, '--show', showPath, '--out', out]);
  assert.equal(failed.status, 1, failed.stderr);
  assert.match(failed.stderr, /claim blocked/);
  const lint = readOut(out, 'lint.json');
  assert.equal(lint.kind, 'hm-hf-06-lint');
  assert.equal(lint.show_id, 'hm-hf-06-qa-slice');
  assert.ok(lint.error_count >= 1);
  assert.equal(lint.claim_blocked, true);
  assert.equal(lint.clean_of_errors, false);
  assert.equal(lint.panel_blocks_bake, false);
  const cam = lint.findings.find((finding) => finding.code === 'empty_cam_preset');
  assert.ok(cam);
  assert.equal(cam.severity, 'error');
  assert.equal(cam.blocksClaim, true);
  assert.equal(cam.blocksBake, false);
  assert.match(cam.fix, /^Fix: /);

  const peekBlocked = run(['peek', '--repo', repo, '--show', showPath, '--out', out]);
  assert.equal(peekBlocked.status, 1);
  assert.match(peekBlocked.stderr, /peek blocked/);
  assert.equal(fs.existsSync(path.join(out, 'frame-peek.json')), false);

  const claimBlocked = run(['claim', '--out', out]);
  assert.equal(claimBlocked.status, 1);
  assert.match(claimBlocked.stderr, /claim blocked/);
  assert.equal(fs.existsSync(path.join(out, 'claim.json')), false);

  const show = JSON.parse(fs.readFileSync(showPath, 'utf8'));
  show.atoms[0].camera = {preset: 'static_hold'};
  fs.writeFileSync(showPath, JSON.stringify(show) + '\n');

  const clean = run(['lint', '--repo', repo, '--show', showPath, '--out', out]);
  assert.equal(clean.status, 0, clean.stderr);
  const cleanLint = readOut(out, 'lint.json');
  assert.equal(cleanLint.error_count, 0);
  assert.equal(cleanLint.clean_of_errors, true);
  assert.equal(cleanLint.claim_blocked, false);
  assert.equal(fs.existsSync(path.join(out, 'frame-peek.json')), false);

  const claimEarly = run(['claim', '--out', out]);
  assert.equal(claimEarly.status, 1);
  assert.match(claimEarly.stderr, /frame-peek.json is missing/);

  const peeked = run(['peek', '--repo', repo, '--show', showPath, '--out', out]);
  assert.equal(peeked.status, 0, peeked.stderr);
  const peek = readOut(out, 'frame-peek.json');
  assert.equal(peek.kind, 'hm-hf-06-frame-peek');
  assert.equal(peek.engine, 'HMComposeClient.framePeekPlan');
  assert.equal(peek.compose, 'HMComposeClient.composeShow');
  assert.equal(peek.show_id, 'hm-hf-06-qa-slice');
  assert.equal(peek.atom_count, 1);
  assert.equal(peek.peek_count, 2);
  assert.equal(peek.peeks[0].source_plate, 'P01');
  assert.equal(peek.peeks[0].sample_kind, 'mid');
  assert.ok(peek.peeks.every((row) => row.filename.endsWith('.png')));
  assert.match(peek.png_policy, /work\/qa/);

  const claimed = run(['claim', '--out', out]);
  assert.equal(claimed.status, 0, claimed.stderr);
  const claim = readOut(out, 'claim.json');
  assert.equal(claim.ok, true);
  assert.equal(claim.error_count, 0);
  assert.deepEqual(claim.order, ['lint', 'peek', 'claim']);
  assert.equal(claim.lint_digest, peek.lint_digest);

  const relint = run(['lint', '--repo', repo, '--show', showPath, '--out', out]);
  assert.equal(relint.status, 0, relint.stderr);
  assert.equal(fs.existsSync(path.join(out, 'frame-peek.json')), false);
  assert.equal(fs.existsSync(path.join(out, 'claim.json')), false);
  const stale = run(['claim', '--out', out]);
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /claim blocked/);

  const demo = JSON.parse(fs.readFileSync(path.join(repo, 'public/shows/daiyu-wang-five-seconds.json'), 'utf8'));
  assert.equal(demo.show_id, 'daiyu-wang-five-seconds');
  assert.equal(demo.atoms.length, 8);
  assert.equal(demo.atoms.reduce((sum, atom) => sum + atom.duration_s, 0), 5);
});

test('HM-HF-06: rhythm warnings stay warnings and do not block claim', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-hf-06-rhythm-'));
  const showPath = path.join(dir, 'show.json');
  const out = path.join(dir, 'qa');
  const show = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  show.duration_target_s = 1;
  const second = JSON.parse(JSON.stringify(show.atoms[0]));
  second.id = 'beat-02';
  second.hero.plates = ['P02'];
  show.atoms.push(second);
  for (const atom of show.atoms) atom.camera = {preset: 'slow_push'};
  fs.writeFileSync(showPath, JSON.stringify(show) + '\n');

  const linted = run(['lint', '--repo', repo, '--show', showPath, '--out', out]);
  assert.equal(linted.status, 0, linted.stderr);
  const lint = readOut(out, 'lint.json');
  assert.equal(lint.error_count, 0);
  assert.ok(lint.warn_count >= 1);
  const rhythm = lint.findings.find((finding) => finding.code === 'adjacent_same_cam');
  assert.ok(rhythm);
  assert.equal(rhythm.severity, 'warn');
  assert.equal(rhythm.blocksClaim, false);

  const peeked = run(['peek', '--repo', repo, '--show', showPath, '--out', out]);
  assert.equal(peeked.status, 0, peeked.stderr);
  assert.equal(readOut(out, 'frame-peek.json').peek_count, 4);
  const claimed = run(['claim', '--out', out]);
  assert.equal(claimed.status, 0, claimed.stderr);
  assert.equal(readOut(out, 'claim.json').ok, true);
});

test('HM-HF-06: peek before lint is blocked, and the helper stays on the local engine', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-hf-06-order-'));
  const out = path.join(dir, 'qa');
  const early = run(['peek', '--repo', repo, '--show', fixture, '--out', out]);
  assert.equal(early.status, 1);
  assert.match(early.stderr, /Run lint first/);

  const src = fs.readFileSync(script, 'utf8');
  assert.match(src, /HMComposeClient\.composeShow/);
  assert.match(src, /HMComposeClient\.framePeekPlan/);
  assert.match(src, /build-project\.cjs/);
  assert.match(src, /export-project\.cjs/);
  assert.doesNotMatch(src, /remotion|gsap|heygen|api\.teqcon|:8770|wrangler/i);
  assert.match(fs.readFileSync(path.join(repo, '.gitignore'), 'utf8'), /work\/qa/);
  assert.match(fs.readFileSync(path.join(repo, 'skills/html-motion-composer/SKILL.md'), 'utf8'), /lint → peek → claim/);
});

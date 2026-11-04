#!/usr/bin/env node
/* HM-HF-06 Frame-QA loop. Order is lint → peek → claim.
 * Structural lint findings are Errors and block claim.
 * Peek reuses HMComposeClient.composeShow + framePeekPlan (the build-project engine).
 * Pixel video stays on export-project.cjs. This command writes JSON only.
 * Artifacts belong under work/qa/ and stay gitignored. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const LINT_NAME = 'lint.json';
const PEEK_NAME = 'frame-peek.json';
const CLAIM_NAME = 'claim.json';

function usage() {
  return [
    'Use:',
    '  node skills/html-motion-composer/scripts/frame-qa.cjs lint --repo REPO --show SHOW.json --out work/qa/SLICE',
    '  node skills/html-motion-composer/scripts/frame-qa.cjs peek --repo REPO --show SHOW.json --out work/qa/SLICE',
    '  node skills/html-motion-composer/scripts/frame-qa.cjs claim --out work/qa/SLICE',
  ].join('\n');
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error('Unexpected argument ' + token + '\n' + usage());
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error('Missing value for --' + key + '\n' + usage());
    out[key] = value;
    i += 1;
  }
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function unlinkIfPresent(file) {
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function digestFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function publicFile(repo, rel) {
  const root = path.join(repo, 'public');
  const full = path.resolve(root, String(rel).replace(/^\//, ''));
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error('Path leaves public/: ' + rel);
  return full;
}

function loadEngine(repo) {
  const file = path.join(repo, 'public/ui/compose-client.js');
  if (!fs.existsSync(file)) throw new Error('Missing compose engine: ' + file);
  require(file);
  if (!globalThis.HMComposeClient || typeof globalThis.HMComposeClient.lintShow !== 'function') {
    throw new Error('HMComposeClient.lintShow is not available');
  }
  return globalThis.HMComposeClient;
}

function loadPresets(repo) {
  return {
    cameraPresets: readJson(publicFile(repo, 'presets/camera_presets.json')),
    fxPresets: readJson(publicFile(repo, 'presets/fx_presets.json')),
  };
}

function loadLayouts(repo, show) {
  const layouts = {};
  const keys = new Set((show.atoms || []).map((atom) => atom && atom.hero && atom.hero.layout_source).filter(Boolean));
  for (const key of keys) {
    const file = publicFile(repo, key);
    if (!fs.existsSync(file)) continue;
    layouts[key] = readJson(file);
  }
  return layouts;
}

function classifyLint(raw) {
  const findings = (raw.findings || []).map((finding) => {
    const structural = finding.category === 'structural';
    return {
      code: finding.code,
      message: finding.message,
      fix: finding.fix,
      ...(finding.atom_id ? { atom_id: finding.atom_id } : {}),
      ...(Number.isInteger(finding.atom_index) ? { atom_index: finding.atom_index } : {}),
      category: finding.category || (structural ? 'structural' : 'rhythm'),
      severity: structural ? 'error' : 'warn',
      blocksClaim: structural,
      blocksBake: false,
    };
  });
  const errorCount = findings.filter((finding) => finding.severity === 'error').length;
  const warnCount = findings.filter((finding) => finding.severity === 'warn').length;
  return {
    kind: 'hm-hf-06-lint',
    gate: 'HM-HF-06',
    order: ['lint', 'peek', 'claim'],
    contract: raw.contract,
    show_id: raw.show_id || '',
    panel_severity: 'warn',
    panel_blocks_bake: false,
    error_count: errorCount,
    warn_count: warnCount,
    claim_blocked: errorCount > 0,
    clean_of_errors: errorCount === 0,
    by_code: raw.by_code || {},
    findings,
  };
}

function countedErrors(lint) {
  const fromFindings = (lint.findings || []).filter((finding) => finding && (finding.severity === 'error' || finding.blocksClaim === true)).length;
  const declared = Number.isFinite(+lint.error_count) ? +lint.error_count : 0;
  return Math.max(fromFindings, declared);
}

function lintPaths(outDir) {
  return {
    lint: path.join(outDir, LINT_NAME),
    peek: path.join(outDir, PEEK_NAME),
    claim: path.join(outDir, CLAIM_NAME),
  };
}

function readLintOrThrow(outDir) {
  const file = lintPaths(outDir).lint;
  if (!fs.existsSync(file)) {
    throw new Error('claim blocked: ' + file + ' is missing. Run lint first.');
  }
  const lint = readJson(file);
  if (lint.kind !== 'hm-hf-06-lint') throw new Error('claim blocked: ' + file + ' is not an HM-HF-06 lint report.');
  return { file, lint };
}

async function runLint(opt) {
  if (!opt.repo || !opt.show || !opt.out) throw new Error('--repo, --show and --out are required\n' + usage());
  const repo = path.resolve(opt.repo);
  const showPath = path.resolve(opt.show);
  const outDir = path.resolve(opt.out);
  const engine = loadEngine(repo);
  const show = readJson(showPath);
  const presets = loadPresets(repo);
  const layouts = loadLayouts(repo, show);
  const raw = engine.lintShow(
    { show, layouts, media: [], assets: {} },
    { cameraPresets: presets.cameraPresets, fxPresets: presets.fxPresets, layouts }
  );
  const report = classifyLint(raw);
  report.source_show = path.relative(repo, showPath) || showPath;
  const files = lintPaths(outDir);
  unlinkIfPresent(files.peek);
  unlinkIfPresent(files.claim);
  writeJson(files.lint, report);
  console.log(JSON.stringify(report, null, 2));
  if (report.claim_blocked) {
    console.error('lint: ' + report.error_count + ' Error(s), ' + report.warn_count + ' warning(s), claim blocked');
    process.exitCode = 1;
    return;
  }
  console.error('lint: 0 Errors, ' + report.warn_count + ' warning(s), claim allowed after peek');
}

async function runPeek(opt) {
  if (!opt.repo || !opt.show || !opt.out) throw new Error('--repo, --show and --out are required\n' + usage());
  const repo = path.resolve(opt.repo);
  const showPath = path.resolve(opt.show);
  const outDir = path.resolve(opt.out);
  const files = lintPaths(outDir);
  let lintFile;
  try {
    lintFile = readLintOrThrow(outDir);
  } catch (error) {
    throw new Error(String(error.message).replace(/^claim blocked:/, 'peek blocked:'));
  }
  const errors = countedErrors(lintFile.lint);
  if (errors > 0 || lintFile.lint.claim_blocked === true || lintFile.lint.clean_of_errors !== true) {
    unlinkIfPresent(files.peek);
    unlinkIfPresent(files.claim);
    throw new Error('peek blocked: lint reports ' + errors + ' Error(s). Frame Peek runs only after lint is clean of Errors.');
  }
  const show = readJson(showPath);
  const showId = String(show.show_id || '');
  if (lintFile.lint.show_id !== showId) {
    throw new Error('peek blocked: lint.json is for "' + lintFile.lint.show_id + '", not "' + showId + '". Run lint on this show first.');
  }
  const engine = loadEngine(repo);
  const presets = loadPresets(repo);
  const layouts = loadLayouts(repo, show);
  const composed = await engine.composeShow(show, {
    cameraPresets: presets.cameraPresets,
    fxPresets: presets.fxPresets,
    loadJson: async (key) => {
      if (!layouts[key]) throw new Error('Missing layout ' + key);
      return layouts[key];
    },
  });
  if (!composed || composed.ok !== true) {
    const reason = composed && Array.isArray(composed.errors) ? composed.errors.join('\n') : 'compose failed';
    throw new Error('peek blocked: compose failed\n' + reason);
  }
  const plan = engine.framePeekPlan(show, composed);
  const peeks = (plan.peeks || []).map((peek) => ({
    index: peek.index,
    atom_index: peek.atom_index,
    atom_id: peek.atom_id,
    source_plate: peek.source_plate,
    sample_kind: peek.sample_kind,
    t: peek.t,
    t_nominal: peek.t_nominal,
    clamped: peek.clamped === true,
    filename: peek.filename,
  }));
  const artifact = {
    kind: 'hm-hf-06-frame-peek',
    gate: 'HM-HF-06',
    show_id: plan.show_id,
    engine: 'HMComposeClient.framePeekPlan',
    compose: 'HMComposeClient.composeShow',
    pixel_export: 'skills/html-motion-composer/scripts/export-project.cjs',
    portable_project: 'skills/html-motion-composer/scripts/build-project.cjs',
    lint_digest: digestFile(files.lint),
    duration_s: plan.duration_s,
    atom_count: plan.atom_count,
    peek_count: peeks.length,
    peeks,
    png_policy: 'This file names the editor Frame Peek PNGs. It does not write PNG bytes. Pixel export stays on export-project.cjs or the editor download, under gitignored work/qa/.',
  };
  unlinkIfPresent(files.claim);
  writeJson(files.peek, artifact);
  console.log(JSON.stringify(artifact, null, 2));
  console.error('peek: ' + artifact.peek_count + ' frame(s) for ' + artifact.show_id);
}

function runClaim(opt) {
  if (!opt.out) throw new Error('--out is required\n' + usage());
  const outDir = path.resolve(opt.out);
  const files = lintPaths(outDir);
  const { file, lint } = readLintOrThrow(outDir);
  const errors = countedErrors(lint);
  if (errors > 0 || lint.claim_blocked === true || lint.clean_of_errors !== true) {
    unlinkIfPresent(files.claim);
    throw new Error('claim blocked: ' + errors + ' Error(s) remain. Fix the show, re-run lint, then peek, then claim.');
  }
  if (!fs.existsSync(files.peek)) {
    unlinkIfPresent(files.claim);
    throw new Error('claim blocked: ' + files.peek + ' is missing. Run peek after a clean lint.');
  }
  const peek = readJson(files.peek);
  if (peek.kind !== 'hm-hf-06-frame-peek') throw new Error('claim blocked: frame-peek.json is not an HM-HF-06 peek.');
  if (peek.show_id !== lint.show_id) throw new Error('claim blocked: peek show_id does not match lint.json.');
  if (!Array.isArray(peek.peeks) || peek.peeks.length < 1) throw new Error('claim blocked: frame peek has no frames.');
  if (peek.lint_digest !== digestFile(file)) {
    unlinkIfPresent(files.claim);
    throw new Error('claim blocked: frame peek does not match the current lint.json. Run peek again.');
  }
  const claim = {
    kind: 'hm-hf-06-claim',
    gate: 'HM-HF-06',
    ok: true,
    order: ['lint', 'peek', 'claim'],
    show_id: lint.show_id,
    error_count: 0,
    warn_count: lint.warn_count || 0,
    peek_count: peek.peek_count,
    lint: LINT_NAME,
    peek: PEEK_NAME,
    lint_digest: peek.lint_digest,
  };
  writeJson(files.claim, claim);
  console.log(JSON.stringify(claim, null, 2));
  console.error('claim: done ' + claim.show_id);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h') {
    console.log(usage());
    return;
  }
  const opt = parseArgs(rest);
  if (command === 'lint') await runLint(opt);
  else if (command === 'peek') await runPeek(opt);
  else if (command === 'claim') runClaim(opt);
  else throw new Error('Unknown command ' + command + '\n' + usage());
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = { classifyLint, countedErrors, usage };

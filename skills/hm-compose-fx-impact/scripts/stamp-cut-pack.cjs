#!/usr/bin/env node
/* HM-PF-43 — stamp the HF-08 gold cut-transition pack onto show atoms.
 * Reads the gold catalog shipped on tip (public/presets/cut_transitions.json,
 * kit/presets mirror as fallback) and writes show.atoms[i].cut with that
 * preset's catalog defaults — the same field the per-clip Cut-in form writes
 * (public/ui/app.js writeCutFromForm). Atom 0 never gets a cut: there is no
 * incoming boundary before the first clip. Cuts add no time (HM-HF-08).
 * Pure Node filesystem. No network, no compose HTTP, no renderer.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Cycle order is catalog order: freeze_hold → white_flash → whip_cut.
const CYCLE = 'cycle';

function fail(code, message) {
  process.stderr.write('stamp-cut-pack: ' + message + '\n');
  process.exit(code);
}

function usage() {
  return [
    'Usage: node stamp-cut-pack.cjs --show <show.json> [--repo <repo>]',
    '  [--out <file>] (default: overwrite show in place, first run saves <show>.bak)',
    '  [--atoms <ids|indices>] e.g. --atoms beat-02,beat-04 or --atoms 1,3',
    '  [--all] stamp every atom i >= 1 (the first atom has no incoming cut)',
    '  [--pack cycle] (default) cycle freeze_hold -> white_flash -> whip_cut',
    '  [--preset <id>] stamp one gold preset on all selected i >= 1 atoms:',
    '    freeze_hold, white_flash, whip_cut'
  ].join('\n');
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key === '--all') args.all = true;
    else if (key === '--help' || key === '-h') args.help = true;
    else if (key.startsWith('--')) {
      if (next == null || next.startsWith('--')) fail(1, key + ' needs a value.\n' + usage());
      args[key.slice(2)] = next;
      i++;
    } else args._.push(key);
  }
  return args;
}

function readJson(file, what) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    fail(2, 'cannot read ' + what + ': ' + file + ' (' + err.code + ')');
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    fail(2, 'invalid JSON in ' + what + ': ' + file + ' (' + err.message + ')');
  }
}

function repoRoot(args) {
  if (args.repo) return path.resolve(args.repo);
  return path.resolve(__dirname, '..', '..', '..');
}

function loadCatalog(root) {
  const candidates = [
    path.join(root, 'public', 'presets', 'cut_transitions.json'),
    path.join(root, 'kit', 'presets', 'cut_transitions.json')
  ];
  const file = candidates.find(candidate => fs.existsSync(candidate));
  if (!file) {
    fail(5, 'no cut-transition catalog under ' + root + ' (looked for public/presets/cut_transitions.json and the kit mirror)');
  }
  const doc = readJson(file, 'cut catalog');
  const presets = Array.isArray(doc && doc.presets) ? doc.presets.filter(p => p && p.id) : [];
  if (!presets.length) fail(5, 'cut catalog has no presets: ' + file);
  return { file, doc, presets };
}

// Mode: { cycle: true } or { cycle: false, preset }.
function resolveMode(catalog, args) {
  if (args['preset'] && args['pack'] !== undefined) fail(1, 'pick one of --pack or --preset, not both.\n' + usage());
  const pack = args['pack'];
  if (pack !== undefined && pack !== CYCLE) fail(3, 'unknown pack "' + pack + '". Only --pack cycle is shipped.');
  const value = args['preset'];
  if (value === undefined) return { cycle: true };
  const preset = catalog.presets.find(p => p.id === value);
  if (!preset) {
    fail(3, 'unknown cut preset "' + value + '". Known ids:\n  ' + catalog.presets.map(p => p.id).join('\n  '));
  }
  return { cycle: false, preset };
}

function cycleOrder(catalog) {
  return catalog.presets.map(p => p.id);
}

// The cut field the per-clip Cut-in form writes: catalog defaults, hold_s only
// meaningful on freeze_hold (0 elsewhere), dir ±1.
function cutFromPreset(preset) {
  const d = preset.defaults || {};
  const dur = Number.isFinite(+d.dur_s) ? +d.dur_s : 0.08;
  const hold = preset.id === 'freeze_hold' ? (Number.isFinite(+d.hold_s) ? +d.hold_s : dur) : 0;
  const dir = d.dir < 0 ? -1 : 1;
  return { preset: preset.id, dur_s: dur, hold_s: hold, dir: dir };
}

// Resolve --atoms tokens to indices; index 0 is reported as skipped, never cut.
function selectTargets(show, args) {
  const atoms = Array.isArray(show.atoms) ? show.atoms : [];
  if (args.all) {
    if (args.atoms) fail(1, 'pick one of --atoms or --all, not both.');
    const out = [];
    for (let i = 1; i < atoms.length; i++) out.push(i);
    return { picked: out, skipped: atoms.length ? [0] : [] };
  }
  if (!args.atoms) {
    fail(1, 'no atoms selected. Pass --atoms <ids|indices> or --all.\n' + usage());
  }
  const wanted = String(args.atoms).split(',').map(part => part.trim()).filter(Boolean);
  const picked = [];
  const skipped = [];
  const seen = new Set();
  for (const token of wanted) {
    let index = -1;
    if (/^\d+$/.test(token)) index = +token < atoms.length ? +token : -1;
    else index = atoms.findIndex(atom => atom && atom.id === token);
    if (index < 0) fail(4, 'no atom matches "' + token + '" in this show. Atom ids: ' + atoms.map(a => a && a.id).join(', '));
    if (seen.has(index)) continue;
    seen.add(index);
    if (index === 0) skipped.push(index);
    else picked.push(index);
  }
  return { picked, skipped };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.show) {
    process.stdout.write(usage() + '\n');
    process.exit(args.show ? 0 : 1);
  }
  const root = repoRoot(args);
  const catalog = loadCatalog(root);
  const mode = resolveMode(catalog, args);
  const order = mode.cycle ? cycleOrder(catalog) : [mode.preset.id];
  const showPath = path.resolve(root, args.show);
  const show = readJson(showPath, 'show');
  const targets = selectTargets(show, args);
  if (!targets.picked.length) {
    fail(4, 'zero targets: the first atom has no incoming cut, so cuts land on atoms i >= 1 only.');
  }

  const byId = {};
  catalog.presets.forEach(p => { byId[p.id] = p; });
  const lines = [];
  targets.skipped.forEach(i => {
    lines.push('  ' + describeAtom(show, i) + ': skipped — first atom has no incoming boundary');
  });
  targets.picked.forEach((i, k) => {
    const preset = byId[order[k % order.length]];
    show.atoms[i].cut = cutFromPreset(preset);
    lines.push('  ' + describeAtom(show, i) + ': ' + show.atoms[i].cut.preset +
      ' (dur ' + show.atoms[i].cut.dur_s + 's, hold ' + show.atoms[i].cut.hold_s + 's, dir ' + show.atoms[i].cut.dir + ')');
  });

  const outPath = args.out ? path.resolve(root, args.out) : showPath;
  let backup = null;
  if (!args.out && outPath === showPath) {
    backup = showPath + '.bak';
    if (!fs.existsSync(backup)) fs.copyFileSync(showPath, backup); // first backup wins
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(show, null, 2) + '\n');

  const modeLine = mode.cycle
    ? 'cycle (' + order.join(' -> ') + ')'
    : mode.preset.id + (mode.preset.label ? ' [' + mode.preset.label + ']' : '');
  process.stdout.write([
    'Cut catalog: ' + catalog.file,
    'Mode: ' + modeLine,
    ...lines,
    'Stamped ' + targets.picked.length + ' atom(s): ' + order.join('/') + (targets.skipped.length ? ', skipped ' + targets.skipped.length + ' (first atom)' : '') + '.',
    'Wrote: ' + outPath + (backup ? ' (backup: ' + backup + ')' : '')
  ].join('\n') + '\n');
}

function describeAtom(show, i) {
  const atom = show.atoms[i];
  return (atom && atom.id ? atom.id : 'atom') + '[' + i + ']';
}

if (require.main === module) main();

module.exports = { CYCLE, cutFromPreset, parseArgs, resolveMode, selectTargets };

#!/usr/bin/env node
/* HM-PF-41 — stamp a Wave1 pixelfx impact hook onto show atoms.
 * Reads the Wave1 catalog shipped on tip (public/presets/pixelfx_wave1.json,
 * kit/presets mirror as fallback). Adds-if-missing the same fx_hooks entry
 * the composer Catalog Query Apply writes (public/ui/catalog-query.js addFx):
 *   { type, t_rel: 0.08, source: "pixelfx", params: { x: 0, y: 0, scale: 1 } }
 * params.x/y/scale are the fields the FX LOCATION & SIZE inspector
 * (#fxLocSizeBox / #fxLocX / #fxLocY / #fxScale) edits after Apply.
 * Pure Node filesystem. No network, no compose HTTP, no renderer.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const T_REL = 0.08;
const SOURCE = 'pixelfx';
const ROLES = ['Action', 'Reaction', 'Aftermath'];
// Beats that land a hit; --all-action-beats stamps only these.
const ACTION_BEAT_CLASSES = new Set([
  'clash', 'straight', 'jab', 'hook', 'uppercut', 'elbow',
  'knee', 'front_kick', 'sweep'
]);

function fail(code, message) {
  process.stderr.write('stamp-wave1-fx: ' + message + '\n');
  process.exit(code);
}

function usage() {
  return [
    'Usage: node stamp-wave1-fx.cjs --show <show.json> [--repo <repo>]',
    '  [--out <file>] (default: overwrite show in place, first run saves <show>.bak)',
    '  [--atoms <ids|indices>] e.g. --atoms beat-01,beat-03 or --atoms 0,2',
    '  [--fx <wave1-id>|Action|Reaction|Aftermath] (default: first Action id)',
    '  [--all-action-beats] stamp every atom whose motion.beat_class is a strike:',
    '    ' + [...ACTION_BEAT_CLASSES].join(', ')
  ].join('\n');
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key === '--all-action-beats') args.allActionBeats = true;
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
    path.join(root, 'public', 'presets', 'pixelfx_wave1.json'),
    path.join(root, 'kit', 'presets', 'pixelfx_wave1.json')
  ];
  const file = candidates.find(candidate => fs.existsSync(candidate));
  if (!file) {
    fail(5, 'no Wave1 catalog under ' + root + ' (looked for public/presets/pixelfx_wave1.json and the kit mirror)');
  }
  const rows = readJson(file, 'Wave1 catalog');
  if (!Array.isArray(rows) || !rows.length) fail(5, 'Wave1 catalog is empty: ' + file);
  return { file, rows };
}

// --fx value may be an exact Wave1 id or a role name (case-insensitive).
function resolveFx(catalog, value) {
  if (value == null || value === '') value = 'Action';
  const byId = catalog.rows.find(row => row.id === value);
  if (byId) return byId;
  const role = ROLES.find(name => name.toLowerCase() === String(value).toLowerCase());
  if (role) {
    const byRole = catalog.rows.find(row => row.role === role);
    if (byRole) return byRole;
    fail(3, 'no Wave1 fx with role ' + role + ' in ' + catalog.file);
  }
  fail(3, 'unknown fx id "' + value + '". Known ids:\n  ' + catalog.rows.map(row => row.id).join('\n  '));
}

function hookKey(hook) {
  if (typeof hook === 'string') return hook;
  if (hook && typeof hook === 'object') return hook.type || hook.id || '';
  return '';
}

function selectAtoms(show, args) {
  const atoms = Array.isArray(show.atoms) ? show.atoms : [];
  if (args.allActionBeats) {
    if (args.atoms) fail(1, 'pick one of --atoms or --all-action-beats, not both.');
    return atoms.filter(atom => {
      const beat = atom && atom.motion && atom.motion.beat_class;
      return ACTION_BEAT_CLASSES.has(beat);
    });
  }
  if (!args.atoms) {
    fail(1, 'no atoms selected. Pass --atoms <ids|indices> or --all-action-beats.\n' + usage());
  }
  const wanted = String(args.atoms).split(',').map(part => part.trim()).filter(Boolean);
  const picked = [];
  for (const token of wanted) {
    const byIndex = /^\d+$/.test(token) ? atoms[+token] : null;
    const byId = atoms.find(atom => atom && atom.id === token);
    const atom = byId || byIndex;
    if (!atom) fail(4, 'no atom matches "' + token + '" in this show. Atom ids: ' + atoms.map(a => a && a.id).join(', '));
    if (!picked.includes(atom)) picked.push(atom);
  }
  return picked;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.show) {
    process.stdout.write(usage() + '\n');
    process.exit(args.show ? 0 : 1);
  }
  const root = repoRoot(args);
  const catalog = loadCatalog(root);
  const fx = resolveFx(catalog, args.fx);
  const showPath = path.resolve(root, args.show);
  const show = readJson(showPath, 'show');
  const atoms = selectAtoms(show, args);

  const added = [];
  const present = [];
  for (const atom of atoms) {
    if (!Array.isArray(atom.fx_hooks)) atom.fx_hooks = [];
    if (atom.fx_hooks.some(hook => hookKey(hook) === fx.id)) {
      present.push(atom.id);
      continue;
    }
    atom.fx_hooks.push({ type: fx.id, t_rel: T_REL, source: SOURCE, params: { x: 0, y: 0, scale: 1 } });
    added.push(atom.id);
  }

  const outPath = args.out ? path.resolve(root, args.out) : showPath;
  let backup = null;
  if (!args.out && outPath === showPath) {
    backup = showPath + '.bak';
    if (!fs.existsSync(backup)) fs.copyFileSync(showPath, backup); // first backup wins
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(show, null, 2) + '\n');

  const lines = [];
  for (const id of added) lines.push('  ' + id + ': added ' + fx.id + ' (t_rel ' + T_REL + ', ' + SOURCE + ', params x/y/scale 0/0/1)');
  for (const id of present) lines.push('  ' + id + ': ' + fx.id + ' already present, left untouched');
  process.stdout.write([
    'Wave1 catalog: ' + catalog.file,
    'Stamp fx: ' + fx.id + ' [' + fx.role + '] ' + fx.label,
    ...lines,
    'Stamped ' + atoms.length + ' atom(s): ' + added.length + ' added, ' + present.length + ' already present.',
    'Wrote: ' + outPath + (backup ? ' (backup: ' + backup + ')' : '')
  ].join('\n') + '\n');
}

if (require.main === module) main();

module.exports = { ACTION_BEAT_CLASSES, ROLES, parseArgs, resolveFx, selectAtoms, hookKey };

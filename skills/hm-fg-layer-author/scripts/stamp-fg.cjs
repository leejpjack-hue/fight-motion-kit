#!/usr/bin/env node
/* HM-PF-36 — stamp foreground props, their own camera, and break timing
 * onto a fight-motion-kit show. The written show.fg is the same object the
 * Compose FOREGROUND panel edits (public/ui/foreground-controls.js) and
 * HM-COMPOSE-FG normalizes (public/ui/compose-client.js normalizeForeground).
 * Pure Node filesystem. No network, no compose HTTP, no renderer.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FG_CAM_PRESETS = ['static', 'nudge', 'parallax', 'pan_left', 'pan_right', 'pan_up', 'pan_down', 'push_in', 'pull_out'];
const FG_CLOCKS = ['show', 'per_atom', 'legacy', 'span'];
const DEFAULT_PARALLAX = 0.45;
const GOLD_DEMO = 'public/shows/daiyu-wang-five-seconds.json';
const HOLD_KEYS = new Set(['voice', 'sfx', 'audio', 'vo', '#41']);

function coded(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function round4(v) {
  return Math.round((+v) * 10000) / 10000;
}

function usage() {
  return [
    'Usage: node stamp-fg.cjs --show <show.json> [--repo <repo>] [--out <file>]',
    '  [--brief <scene-brief.json>]',
    '  [--prop id=chair,src=props/chair.png,x=200,y=160,z=20,break=2,broken=props/chair-broken.png]',
    '  [--prop ...]            repeat for each prop. Existing ids are left untouched.',
    '  [--break chair=2]       attach a break to a prop already on the show',
    '  [--break chair=2:props/chair-broken.png]',
    '  [--cam parallax] [--amount 0.45] [--nudge 0,0,0]',
    '  [--replace]             overwrite listed prop ids (drops Jack\'s tweaks on those ids)',
    '',
    'Default camera, when the show has none: parallax, amount 0.45, nudge 0,0,0.',
    'A later run keeps show.fg.cam unless --cam, --amount, or --nudge is passed.',
    'Refuses to write the 5.00s eight-plate demo in place. Pass --out.',
    'Voice and #41 SFX are rejected. Effect type is break only.'
  ].join('\n');
}

function parseArgs(argv) {
  const args = { prop: [], break: [], _: [] };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--help' || key === '-h') args.help = true;
    else if (key === '--replace') args.replace = true;
    else if (key === '--prop' || key === '--break') {
      const next = argv[++i];
      if (next == null || next.startsWith('--')) throw coded(1, key + ' needs a value.\n' + usage());
      args[key.slice(2)].push(next);
    } else if (key.startsWith('--')) {
      const next = argv[++i];
      if (next == null || next.startsWith('--')) throw coded(1, key + ' needs a value.\n' + usage());
      args[key.slice(2)] = next;
    } else args._.push(key);
  }
  return args;
}

function rejectHold(obj, where) {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (HOLD_KEYS.has(String(key).toLowerCase())) {
      throw coded(3, where + ' includes "' + key + '". Voice and #41 SFX stay HOLD. This skill stamps foreground props only.');
    }
  }
}

function rejectRemote(src, label) {
  const text = String(src);
  if (/^https?:/i.test(text) || /teqcon/i.test(text) || text.includes(':8770')) {
    throw coded(3, label + ': image paths stay local. No teqcon or :8770.');
  }
}

function showDuration(show) {
  if (show && Array.isArray(show.atoms) && show.atoms.length) {
    const sum = show.atoms.reduce((total, atom) => {
      const dur = atom && +atom.duration_s;
      return total + (Number.isFinite(dur) && dur > 0 ? dur : 0);
    }, 0);
    if (sum > 0) return round4(sum);
  }
  if (show && Number.isFinite(+show.duration_target_s) && +show.duration_target_s > 0) return round4(+show.duration_target_s);
  return 5;
}

function unwrapShow(doc) {
  if (doc && doc.show && typeof doc.show === 'object' && !Array.isArray(doc.show) && (Array.isArray(doc.show.atoms) || typeof doc.show.show_id === 'string')) {
    return doc.show;
  }
  if (doc && typeof doc === 'object' && !Array.isArray(doc) && (Array.isArray(doc.atoms) || typeof doc.show_id === 'string')) return doc;
  throw coded(2, 'file is not a show or a saved project with show.atoms');
}

function parseNudge(text) {
  const parts = String(text).split(',').map(part => part.trim());
  if (parts.length !== 3) throw coded(1, '--nudge needs x,y,s');
  const nums = parts.map(Number);
  if (!nums.every(Number.isFinite)) throw coded(1, '--nudge needs numbers');
  return { x: round4(nums[0]), y: round4(nums[1]), s: round4(nums[2]) };
}

function parsePropSpec(spec) {
  const raw = {};
  const parts = String(spec).split(',');
  if (!parts.length) throw coded(1, '--prop needs key=value pairs');
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq < 1) throw coded(1, '--prop needs key=value pairs: ' + spec);
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (['x', 'y', 'scale', 'z', 't_start', 't_end', 'break'].includes(key)) raw[key] = Number(value);
    else raw[key] = value;
  }
  return raw;
}

function parseBreakSpec(spec) {
  const match = /^([A-Za-z0-9][A-Za-z0-9_-]*)=(\d+(?:\.\d+)?)(?::(.+))?$/.exec(String(spec).trim());
  if (!match) throw coded(1, '--break needs id=seconds or id=seconds:broken-path');
  const row = { id: match[1], t: Number(match[2]) };
  if (match[3]) row.broken_src = match[3];
  return row;
}

function camPatch(args, briefCam) {
  const patch = {};
  if (briefCam && typeof briefCam === 'object' && !Array.isArray(briefCam)) {
    rejectHold(briefCam, 'camera');
    if (briefCam.preset != null) patch.preset = briefCam.preset;
    if (briefCam.amount != null) patch.amount = briefCam.amount;
    if (briefCam.nudge != null) patch.nudge = briefCam.nudge;
    if (briefCam.clock != null) patch.clock = briefCam.clock;
    if (briefCam.span != null) patch.span = briefCam.span;
    if (briefCam.t0 != null) patch.t0 = briefCam.t0;
    if (briefCam.t1 != null) patch.t1 = briefCam.t1;
  }
  if (args && args.cam) patch.preset = args.cam;
  if (args && args.amount != null) patch.amount = Number(args.amount);
  if (args && args.nudge) patch.nudge = parseNudge(args.nudge);
  if (patch.preset != null && !FG_CAM_PRESETS.includes(patch.preset)) {
    throw coded(3, 'unknown foreground camera "' + patch.preset + '". Presets: ' + FG_CAM_PRESETS.join(', '));
  }
  if (patch.amount != null && (!Number.isFinite(+patch.amount) || +patch.amount < 0 || +patch.amount > 1)) {
    throw coded(3, 'foreground camera amount must be between 0 and 1');
  }
  if (patch.clock != null && !FG_CLOCKS.includes(patch.clock)) throw coded(3, 'unknown foreground camera clock');
  if (patch.nudge != null) {
    if (!patch.nudge || typeof patch.nudge !== 'object' || Array.isArray(patch.nudge)) throw coded(3, 'foreground nudge must be x, y, s');
    for (const key of ['x', 'y', 's']) {
      if (patch.nudge[key] != null && !Number.isFinite(+patch.nudge[key])) throw coded(3, 'foreground nudge ' + key + ' must be a number');
    }
  }
  return Object.keys(patch).length ? patch : null;
}

function finalizeCam(raw) {
  const src = raw || {};
  const preset = src.preset || 'parallax';
  if (!FG_CAM_PRESETS.includes(preset)) throw coded(3, 'unknown foreground camera "' + preset + '"');
  const fallback = preset === 'static' || preset === 'nudge' ? 0 : DEFAULT_PARALLAX;
  const amount = src.amount == null ? fallback : +src.amount;
  if (!Number.isFinite(amount) || amount < 0 || amount > 1) throw coded(3, 'foreground camera amount must be between 0 and 1');
  const nudge = src.nudge || {};
  const cam = {
    preset,
    amount: round4(amount),
    nudge: {
      x: round4(nudge.x == null ? 0 : +nudge.x),
      y: round4(nudge.y == null ? 0 : +nudge.y),
      s: round4(nudge.s == null ? 0 : +nudge.s),
    },
  };
  if (src.clock) cam.clock = src.clock;
  if (src.span != null) cam.span = src.span;
  if (src.t0 != null) cam.t0 = round4(src.t0);
  if (src.t1 != null) cam.t1 = round4(src.t1);
  return cam;
}

function normalizeEffect(raw, slot, label) {
  if (raw == null || raw === 'none' || raw === false) return null;
  const eff = typeof raw === 'string' ? { type: raw, t: 0 } : raw;
  if (!eff || typeof eff !== 'object' || Array.isArray(eff)) throw coded(3, label + ': invalid effect');
  rejectHold(eff, label + ' effect');
  if (eff.type == null || eff.type === 'none') return null;
  if (eff.type !== 'break') {
    throw coded(3, label + ': unknown effect "' + eff.type + '". Only break is attachable. No fire, debris, voice, or #41.');
  }
  if (slot === 'overlay') throw coded(3, label + ': overlay art does not break');
  const t = eff.t == null ? 0 : +eff.t;
  if (!Number.isFinite(t) || t < 0) throw coded(3, label + ': break time must be 0 or later');
  const out = { type: 'break', t: round4(t) };
  if (eff.broken_src != null && eff.broken_src !== '') {
    if (typeof eff.broken_src !== 'string') throw coded(3, label + ': broken image must be a path');
    rejectRemote(eff.broken_src, label + ' broken image');
    out.broken_src = eff.broken_src;
  }
  return out;
}

function normalizeProp(raw, index, dur) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw coded(3, 'prop ' + (index + 1) + ': invalid');
  rejectHold(raw, 'prop ' + (index + 1));
  const id = raw.id != null ? String(raw.id) : '';
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) throw coded(3, 'prop ' + (index + 1) + ': id must be a simple token');
  if (typeof raw.src !== 'string' || !raw.src) throw coded(3, id + ': missing src');
  rejectRemote(raw.src, id);
  const slot = raw.slot == null || raw.slot === 'prop' ? 'prop' : raw.slot;
  if (slot !== 'prop' && slot !== 'overlay') throw coded(3, id + ': unknown slot');
  const x = raw.x == null ? (slot === 'overlay' ? 640 : 980) : +raw.x;
  const y = raw.y == null ? (slot === 'overlay' ? 360 : 180) : +raw.y;
  const scale = raw.scale == null ? 1 : +raw.scale;
  const z = raw.z == null ? (index + 1) * 10 : +raw.z;
  if (![x, y, scale, z].every(Number.isFinite) || scale < 0.05 || scale > 8) throw coded(3, id + ': invalid placement');
  const t0 = raw.t_start == null ? 0 : +raw.t_start;
  const t1 = raw.t_end == null ? dur : +raw.t_end;
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || !(t1 > t0) || t0 < 0) throw coded(3, id + ': invalid time window');
  if (t0 >= dur) throw coded(3, id + ': starts at or after the show end (' + dur + 's)');
  const prop = {
    id,
    src: raw.src,
    x: round4(x),
    y: round4(y),
    scale: round4(scale),
    z: round4(z),
    t_start: round4(t0),
    t_end: round4(Math.min(t1, dur)),
  };
  if (slot === 'overlay') prop.slot = 'overlay';
  if (raw.kf != null) {
    if (!Array.isArray(raw.kf)) throw coded(3, id + ': keyframes must be a list');
    const kf = [];
    for (const frame of raw.kf) {
      if (!frame || typeof frame !== 'object' || Array.isArray(frame) || !Number.isFinite(+frame.t)) throw coded(3, id + ': invalid keyframe');
      const row = {
        t: round4(+frame.t),
        x: round4(frame.x == null ? x : +frame.x),
        y: round4(frame.y == null ? y : +frame.y),
        scale: round4(frame.scale == null ? scale : +frame.scale),
      };
      if (![row.x, row.y, row.scale].every(Number.isFinite) || row.scale < 0.05 || row.scale > 8) throw coded(3, id + ': invalid keyframe');
      kf.push(row);
    }
    kf.sort((a, b) => a.t - b.t);
    if (kf.length) prop.kf = kf;
  }
  const effectRaw = raw.effect != null ? raw.effect : (raw.break != null ? { type: 'break', t: raw.break, broken_src: raw.broken || raw.broken_src } : null);
  const effect = normalizeEffect(effectRaw, slot, id);
  if (effect) prop.effect = effect;
  return prop;
}

function buildRequest(args, brief) {
  const source = brief || {};
  if (source && typeof source !== 'object') throw coded(2, 'scene brief must be a JSON object');
  rejectHold(source, 'brief');
  const props = [];
  if (Array.isArray(source.props)) props.push(...source.props);
  else if (source.props != null) throw coded(3, 'brief props must be a list');
  for (const spec of (args && args.prop) || []) props.push(parsePropSpec(spec));
  const breaks = [];
  for (const spec of (args && args.break) || []) breaks.push(parseBreakSpec(spec));
  if (Array.isArray(source.breaks)) {
    for (const row of source.breaks) {
      if (!row || typeof row !== 'object') throw coded(3, 'brief break must be an object');
      breaks.push({ id: row.id, t: row.t, broken_src: row.broken_src });
    }
  }
  const cliRetune = !!(args && (args.cam || args.amount != null || args.nudge));
  const patch = camPatch(cliRetune ? args : {}, source.cam);
  const cliPatch = cliRetune ? camPatch(args, null) : null;
  return {
    props,
    breaks,
    cam: patch,
    retuneCam: cliRetune,
    cliCam: cliPatch,
    replace: !!(args && args.replace),
  };
}

function attachBreak(prop, row) {
  const effect = normalizeEffect({ type: 'break', t: row.t, broken_src: row.broken_src }, prop.slot === 'overlay' ? 'overlay' : 'prop', prop.id);
  prop.effect = effect;
}

function stampShow(show, request) {
  if (!show || typeof show !== 'object' || Array.isArray(show)) throw coded(2, 'not a show');
  const req = request || {};
  const dur = showDuration(show);
  const incoming = (req.props || []).map((raw, index) => normalizeProp(raw, index, dur));
  const seen = new Set();
  for (const prop of incoming) {
    if (seen.has(prop.id)) throw coded(3, 'duplicate prop id ' + prop.id);
    seen.add(prop.id);
  }
  const breaks = req.breaks || [];
  if (!incoming.length && !breaks.length) throw coded(1, 'type a prop list (--prop or --brief) or attach a break (--break)');
  const already = show.fg && Array.isArray(show.fg.props) ? show.fg.props : [];
  const known = new Set(already.filter(item => item && item.id).map(item => item.id));
  for (const prop of incoming) known.add(prop.id);
  for (const row of breaks) {
    if (!row || !row.id) throw coded(3, 'break is missing an id');
    if (!known.has(row.id)) throw coded(4, 'no foreground prop "' + row.id + '" to attach a break. Stamp the prop first.');
  }
  if (!show.fg || typeof show.fg !== 'object' || Array.isArray(show.fg)) show.fg = {};

  const report = {
    duration_s: dur,
    added: [],
    present: [],
    replaced: [],
    breaksAttached: [],
    breaksKept: [],
    cam: 'kept',
  };

  const hadCam = !!(show.fg.cam && typeof show.fg.cam === 'object' && !Array.isArray(show.fg.cam));
  if (!hadCam) {
    show.fg.cam = finalizeCam(req.cam || {});
    report.cam = 'wrote';
  } else if (req.retuneCam && req.cliCam) {
    const prev = show.fg.cam;
    const merged = Object.assign({}, prev, req.cliCam);
    if (req.cliCam.nudge) merged.nudge = Object.assign({}, prev.nudge, req.cliCam.nudge);
    if (prev.clock && !merged.clock) merged.clock = prev.clock;
    if (prev.span != null && merged.span == null) merged.span = prev.span;
    if (prev.t0 != null && merged.t0 == null) merged.t0 = prev.t0;
    if (prev.t1 != null && merged.t1 == null) merged.t1 = prev.t1;
    show.fg.cam = finalizeCam(merged);
    report.cam = 'retuned';
  }
  if (!Array.isArray(show.fg.props)) show.fg.props = [];

  for (const prop of incoming) {
    const index = show.fg.props.findIndex(item => item && item.id === prop.id);
    if (index < 0) {
      show.fg.props.push(prop);
      report.added.push(prop.id);
      if (prop.effect) report.breaksAttached.push(prop.id);
      continue;
    }
    if (req.replace) {
      show.fg.props[index] = prop;
      report.replaced.push(prop.id);
      if (prop.effect) report.breaksAttached.push(prop.id);
      continue;
    }
    report.present.push(prop.id);
    const existing = show.fg.props[index];
    if (prop.effect && !existing.effect) {
      if (existing.slot === 'overlay') throw coded(3, prop.id + ': overlay art does not break');
      existing.effect = prop.effect;
      report.breaksAttached.push(prop.id);
    } else if (prop.effect && existing.effect) {
      report.breaksKept.push(prop.id);
    }
  }

  for (const row of breaks) {
    if (!row || !row.id) throw coded(3, 'break is missing an id');
    const prop = show.fg.props.find(item => item && item.id === row.id);
    if (!prop) throw coded(4, 'no foreground prop "' + row.id + '" to attach a break. Stamp the prop first.');
    if (prop.effect && !req.replace) {
      report.breaksKept.push(prop.id);
      continue;
    }
    attachBreak(prop, row);
    report.breaksAttached.push(prop.id);
  }

  return report;
}

function repoRoot(args) {
  if (args && args.repo) return path.resolve(args.repo);
  return path.resolve(__dirname, '..', '..', '..');
}

function readJson(file, what) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw coded(2, 'cannot read ' + what + ': ' + file + ' (' + err.code + ')');
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw coded(2, 'invalid JSON in ' + what + ': ' + file + ' (' + err.message + ')');
  }
}

function relPosix(root, file) {
  return path.relative(root, path.resolve(file)).split(path.sep).join('/');
}

function assertNotGold(root, file) {
  if (relPosix(root, file) === GOLD_DEMO) {
    throw coded(4, 'refusing to write the 5.00s eight-plate demo (' + GOLD_DEMO + '). Pass --out to a different file.');
  }
}

function breakLabel(prop) {
  if (!prop.effect) return '';
  const broken = prop.effect.broken_src ? ', broken ' + prop.effect.broken_src : '';
  return ' (break @ ' + prop.effect.t + 's' + broken + ')';
}

function reportLines(show, report, catalogNote) {
  const cam = show.fg && show.fg.cam;
  const lines = [];
  if (catalogNote) lines.push(catalogNote);
  if (cam) {
    lines.push('Foreground camera: ' + cam.preset + ' amount ' + cam.amount + ' nudge ' + cam.nudge.x + ',' + cam.nudge.y + ',' + cam.nudge.s + ' (' + report.cam + ')');
  }
  const props = (show.fg && show.fg.props) || [];
  for (const id of report.added) {
    const prop = props.find(item => item.id === id);
    lines.push('  ' + id + ': added' + (prop ? breakLabel(prop) : ''));
  }
  for (const id of report.replaced) lines.push('  ' + id + ': replaced');
  for (const id of report.present) lines.push('  ' + id + ': already present, placement left untouched');
  for (const id of report.breaksAttached) {
    if (report.added.includes(id) || report.replaced.includes(id)) continue;
    const prop = props.find(item => item.id === id);
    lines.push('  ' + id + ': break attached' + (prop ? breakLabel(prop) : ''));
  }
  for (const id of report.breaksKept) lines.push('  ' + id + ': break already set, left untouched');
  lines.push('Stamped ' + (report.added.length + report.present.length + report.replaced.length) + ' prop(s): ' + report.added.length + ' added, ' + report.present.length + ' already present, ' + report.replaced.length + ' replaced. Breaks attached: ' + report.breaksAttached.length + '.');
  lines.push('Show length stays ' + report.duration_s + 's. Foreground camera does not follow background crop-pan or the clip camera.');
  lines.push('Handoff: open /ui/, import this show, and edit the break in the FOREGROUND panel (#fgEffect / #fgEffectT / #fgCamPreset).');
  return lines;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write('stamp-fg: ' + err.message + '\n');
    process.exit(err.code || 1);
  }
  if (args.help || !args.show) {
    process.stdout.write(usage() + '\n');
    process.exit(args.help ? 0 : 1);
  }
  try {
    const root = repoRoot(args);
    const showPath = path.resolve(args.show.startsWith('/') ? args.show : path.resolve(root, args.show));
    const doc = readJson(showPath, 'show');
    const show = unwrapShow(doc);
    let brief = null;
    if (args.brief) {
      const briefPath = path.resolve(args.brief.startsWith('/') ? args.brief : path.resolve(root, args.brief));
      brief = readJson(briefPath, 'scene brief');
    }
    const request = buildRequest(args, brief);
    const report = stampShow(show, request);
    const outPath = args.out ? path.resolve(args.out.startsWith('/') ? args.out : path.resolve(root, args.out)) : showPath;
    assertNotGold(root, outPath);
    let backup = null;
    if (!args.out && outPath === showPath) {
      backup = showPath + '.bak';
      if (!fs.existsSync(backup)) fs.copyFileSync(showPath, backup);
    }
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n');
    const lines = reportLines(show, report, args.brief ? 'Scene brief: ' + args.brief : 'Prop list: typed --prop');
    lines.push('Wrote: ' + outPath + (backup ? ' (backup: ' + backup + ')' : ''));
    process.stdout.write(lines.join('\n') + '\n');
  } catch (err) {
    if (err && err.code) {
      process.stderr.write('stamp-fg: ' + err.message + '\n');
      process.exit(err.code);
    }
    throw err;
  }
}

if (require.main === module) main();

module.exports = {
  FG_CAM_PRESETS,
  DEFAULT_PARALLAX,
  GOLD_DEMO,
  parseArgs,
  parsePropSpec,
  parseBreakSpec,
  buildRequest,
  stampShow,
  unwrapShow,
  showDuration,
  finalizeCam,
};

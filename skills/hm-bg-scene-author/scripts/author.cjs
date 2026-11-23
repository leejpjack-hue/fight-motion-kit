#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const HOLDS = ['follow_camera', 'static'];
const WINDOW = 0.7;

function repoFrom(args) {
  return path.resolve(args.repo || path.join(__dirname, '../../..'));
}

function loadEngine(repo) {
  require(path.join(repo, 'public/ui/compose-client.js'));
  require(path.join(repo, 'public/ui/motion-renderer.js'));
  return globalThis.HMComposeClient;
}

function windowWithSlack(preset, C) {
  const slack = (1 - WINDOW) / 2;
  const at = { x: slack, y: slack };
  if (preset === 'pan_right') at.x = 0;
  else if (preset === 'pan_left') at.x = 1 - WINDOW;
  else if (preset === 'pan_down') at.y = 0;
  else if (preset === 'pan_up') at.y = 1 - WINDOW;
  return C.lockBackgroundCropAspect({ x: at.x, y: at.y, w: WINDOW, h: WINDOW }, 16 / 9);
}

function applyBackgroundMotionPack(input, packId, packs, C) {
  C = C || globalThis.HMComposeClient;
  if (!C || typeof C.applyBgMotionPack !== 'function') throw new Error('Background motion helpers are not loaded.');
  const project = JSON.parse(JSON.stringify(input));
  const wrapped = !!(project && project.show && project.show.show_id);
  const show = wrapped ? project.show : project;
  if (!show || typeof show !== 'object' || Array.isArray(show) || !show.show_id) throw new Error('Project needs a show_id.');
  const next = C.applyBgMotionPack(show, packId, { packs });
  if (wrapped) {
    project.show = next;
    if (project.version == null) project.version = 1;
    return project;
  }
  return { version: 1, show: next };
}

function parseStrideBob(raw) {
  if (raw == null || raw === '') return undefined;
  let obj = raw;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return undefined;
    if (s.startsWith('{')) {
      try { obj = JSON.parse(s); } catch (e) { throw new Error('stride_bob must be amp_px,freq_hz or JSON.'); }
    } else {
      const parts = s.split(',').map(p => Number(p.trim()));
      if (parts.length !== 2 || parts.some(n => !Number.isFinite(n))) {
        throw new Error('stride_bob must be amp_px,freq_hz (e.g. 8,3.2).');
      }
      obj = { amp_px: parts[0], freq_hz: parts[1] };
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('stride_bob must be { amp_px, freq_hz }.');
  const out = {};
  if (obj.amp_px != null) {
    const amp = Number(obj.amp_px);
    if (!Number.isFinite(amp) || amp < 0 || amp > 24) throw new Error('stride_bob amp_px must be from 0 to 24.');
    out.amp_px = amp;
  }
  if (obj.freq_hz != null) {
    const freq = Number(obj.freq_hz);
    if (!Number.isFinite(freq) || freq < 0.5 || freq > 8) throw new Error('stride_bob freq_hz must be from 0.5 to 8.');
    out.freq_hz = freq;
  }
  if (!Object.keys(out).length) throw new Error('stride_bob needs amp_px or freq_hz.');
  return out;
}

function mergeRunMotionOverrides(motion, opts) {
  if (!opts || typeof opts !== 'object') return motion;
  if (opts.speed_px_s != null && opts.speed_px_s !== '') {
    const sp = Number(opts.speed_px_s);
    if (!Number.isFinite(sp) || sp < 0 || sp > 3000) throw new Error('speed_px_s must be from 0 to 3000.');
    motion.speed_px_s = sp;
  }
  if (opts.tile_mode != null && opts.tile_mode !== '') {
    if (opts.tile_mode !== 'tile' && opts.tile_mode !== 'mirror') throw new Error('tile_mode must be tile or mirror.');
    motion.tile_mode = opts.tile_mode;
  }
  if (opts.motion_blur != null && opts.motion_blur !== '') {
    const bl = Number(opts.motion_blur);
    if (!Number.isFinite(bl) || bl < 0 || bl > 1) throw new Error('motion_blur must be from 0 to 1.');
    motion.motion_blur = bl;
  }
  if (opts.parallax_ratio != null && opts.parallax_ratio !== '') {
    const pr = Number(opts.parallax_ratio);
    if (!Number.isFinite(pr) || pr < 0 || pr > 1) throw new Error('parallax_ratio must be from 0 to 1.');
    motion.parallax_ratio = pr;
  }
  if (opts.stride_bob !== undefined && opts.stride_bob !== null && opts.stride_bob !== '') {
    motion.stride_bob = parseStrideBob(opts.stride_bob);
  }
  return motion;
}

function applyBackgroundRunPreset(input, runPresetId, packs, overrides, C) {
  C = C || globalThis.HMComposeClient;
  if (!C || typeof C.applyBackgroundEdit !== 'function') throw new Error('Background motion helpers are not loaded.');
  const list = packs && Array.isArray(packs.run_presets) ? packs.run_presets : [];
  const spec = list.find(p => p && p.id === runPresetId);
  if (!spec || !spec.motion) {
    throw new Error('Unknown running preset: ' + runPresetId + (list.length ? '. Known: ' + list.map(p => p.id).join(', ') : ''));
  }
  const project = JSON.parse(JSON.stringify(input));
  const wrapped = !!(project && project.show && project.show.show_id);
  const show = wrapped ? project.show : project;
  if (!show || typeof show !== 'object' || Array.isArray(show) || !show.show_id) throw new Error('Project needs a show_id.');
  const motion = JSON.parse(JSON.stringify(spec.motion));
  if (overrides && overrides.preset != null) {
    if (!HOLDS.includes(overrides.preset) && !C.BG_TRAVEL_PRESETS.includes(overrides.preset)) {
      throw new Error('Unknown background preset: ' + overrides.preset);
    }
    motion.preset = overrides.preset;
  }
  if (overrides && overrides.amount != null) {
    const amt = Number(overrides.amount);
    if (!Number.isFinite(amt) || amt < 0 || amt > 1) throw new Error('Motion amount must be a number from 0 to 1.');
    motion.amount = amt;
  }
  if (overrides && overrides.clock != null) {
    if (overrides.clock !== 'show' && overrides.clock !== 'per_atom') {
      throw new Error('Set a t0-t1 span in Background motion after opening the project.');
    }
    motion.clock = overrides.clock;
  }
  mergeRunMotionOverrides(motion, overrides);
  if (typeof C.validBackgroundMotion === 'function' && !C.validBackgroundMotion(motion)) {
    throw new Error('Invalid background motion settings.');
  }
  if (show.bg && Array.isArray(show.bg.locations) && show.bg.locations.length) {
    for (const row of show.bg.locations) {
      C.applyBackgroundEdit(show, { op: 'update-location', id: row.id, patch: { motion } });
    }
  } else {
    C.applyBackgroundEdit(show, { op: 'set-pair-motion', motion });
  }
  if (wrapped) {
    project.show = show;
    if (project.version == null) project.version = 1;
    return project;
  }
  return { version: 1, show };
}

function authorBackgroundScene(input, brief, C) {
  C = C || globalThis.HMComposeClient;
  if (!C || typeof backgroundMotionFrame !== 'function' || typeof backgroundMotionSupport !== 'function') {
    throw new Error('Background motion helpers are not loaded.');
  }
  if (!brief || typeof brief !== 'object' || Array.isArray(brief)) throw new Error('Scene brief must be an object.');
  for (const key of ['span', 't0', 't1']) {
    if (brief[key] != null) throw new Error('Set a t0-t1 span in Background motion after opening the project.');
  }
  const allowed = new Set(['place', 'layer', 'crop', 'preset', 'amount', 'clock', 'speed_px_s', 'tile_mode', 'stride_bob', 'motion_blur', 'parallax_ratio', 'run_preset']);
  for (const key of Object.keys(brief)) {
    if (!allowed.has(key)) throw new Error('Unknown scene brief field: ' + key);
  }
  if (typeof brief.place !== 'string' || !brief.place.trim()) throw new Error('Type a scene place before stamping the background.');
  const layer = brief.layer || 'base';
  if (layer !== 'base' && layer !== 'swap') throw new Error('Layer must be base or swap.');
  const preset = brief.preset || 'pan_right';
  if (!HOLDS.includes(preset) && !C.BG_TRAVEL_PRESETS.includes(preset)) throw new Error('Unknown background preset: ' + preset);
  const amount = brief.amount == null ? 0.4 : brief.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 1) throw new Error('Motion amount must be a number from 0 to 1.');
  const clock = brief.clock || 'show';
  if (clock !== 'show' && clock !== 'per_atom') throw new Error('Set a t0-t1 span in Background motion after opening the project.');

  const project = JSON.parse(JSON.stringify(input));
  const wrapped = !!(project && project.show && project.show.show_id);
  const show = wrapped ? project.show : project;
  if (!show || typeof show !== 'object' || Array.isArray(show) || !show.show_id) throw new Error('Project needs a show_id.');
  const bg = show.bg && typeof show.bg === 'object' && !Array.isArray(show.bg) ? show.bg : null;
  if (!bg || typeof bg[layer] !== 'string' || !bg[layer]) throw new Error('The ' + layer + ' background image is missing. Choose one in Background before authoring a crop.');
  if (bg.crops != null && (typeof bg.crops !== 'object' || Array.isArray(bg.crops))) throw new Error('Project background crops are not a base/swap map.');
  if (bg.crops && bg.crops[layer]) throw new Error('This layer already has a crop. Edit it in Background, or author a copy of the project.');
  if (bg.motion) throw new Error('This project already has background motion. Edit it in Background, or author a copy of the project.');

  const isScroll = typeof C.isScrollBackgroundPreset === 'function' && C.isScrollBackgroundPreset(preset);
  let crop;
  if (brief.crop != null) {
    if (!C.validBackgroundCrop(brief.crop)) throw new Error('Crop must be {x,y,w,h} inside the image, each side at least 0.02.');
    crop = { x: brief.crop.x, y: brief.crop.y, w: brief.crop.w, h: brief.crop.h };
  } else crop = isScroll ? { x: 0, y: 0, w: 1, h: 1 } : windowWithSlack(preset, C);
  const support = backgroundMotionSupport(crop)[preset];
  if (!support || !support.ok) throw new Error(support && support.reason ? support.reason : 'This background motion is not available.');
  if (C.isTravelingBackgroundPreset(preset) && !isScroll && backgroundMotionFrame(crop, preset, amount, 1).mode !== 'window') {
    throw new Error('The crop has to leave room in the source so the window can slide.');
  }

  bg.crops = bg.crops || {};
  bg.crops[layer] = crop;
  const motion = { preset, amount };
  if (C.isTravelingBackgroundPreset(preset)) motion.clock = clock;
  mergeRunMotionOverrides(motion, brief);
  if (typeof C.validBackgroundMotion === 'function' && !C.validBackgroundMotion(motion)) {
    throw new Error('Invalid background motion settings.');
  }
  bg.motion = motion;
  if (wrapped) {
    if (project.version == null) project.version = 1;
    return project;
  }
  return { version: 1, show };
}

function parseCrop(text) {
  const parts = String(text).split(',').map(part => part.trim());
  if (parts.length !== 4) throw new Error('Crop must be x,y,w,h.');
  const nums = parts.map(Number);
  if (nums.some(n => !Number.isFinite(n))) throw new Error('Crop must be x,y,w,h.');
  return { x: nums[0], y: nums[1], w: nums[2], h: nums[3] };
}

function parseArgs(argv) {
  const allowed = new Set(['project', 'out', 'place', 'brief', 'crop', 'preset', 'amount', 'clock', 'layer', 'repo', 'pack', 'run-preset', 'speed-px-s', 'tile-mode', 'stride-bob', 'motion-blur']);
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error('Unknown or incomplete argument: ' + token);
    const key = token.slice(2);
    if (!allowed.has(key) || !argv[i + 1] || argv[i + 1].startsWith('--') || Object.hasOwn(args, key)) {
      throw new Error('Unknown or incomplete argument: ' + token);
    }
    args[key] = argv[++i];
  }
  if (!args.project || !args.out) throw new Error('--project and --out are required.');
  return args;
}

async function composeStamped(repo, show) {
  const read = rel => JSON.parse(fs.readFileSync(path.join(repo, 'public', rel), 'utf8'));
  return globalThis.HMComposeClient.composeShow(show, {
    cameraPresets: read('presets/camera_presets.json'),
    fxPresets: read('presets/fx_presets.json'),
    loadJson: async rel => read(rel),
  });
}

async function main(argv) {
  const args = parseArgs(argv);
  const repo = repoFrom(args);
  const C = loadEngine(repo);
  const projectPath = path.resolve(args.project);
  const outPath = path.resolve(args.out);
  if (!outPath.endsWith('.motion.json')) throw new Error('--out must be a new .motion.json file.');
  if (projectPath === outPath) throw new Error('--out must be a different file from --project.');
  const input = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
  if (args.pack) {
    for (const key of ['place', 'brief', 'crop', 'preset', 'amount', 'clock', 'layer', 'run-preset', 'speed-px-s', 'tile-mode', 'stride-bob', 'motion-blur']) {
      if (args[key] != null) throw new Error('A motion pack does not take scene author fields. Drop --' + key + '.');
    }
    const packs = JSON.parse(fs.readFileSync(path.join(repo, 'public/presets/bg_motion_packs.json'), 'utf8'));
    const stamped = applyBackgroundMotionPack(input, args.pack, packs, C);
    const result = await composeStamped(repo, stamped.show);
    if (!result.ok) throw new Error(result.errors.join('; '));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(stamped, null, 2) + '\n', { flag: 'wx' });
    const motion = args.pack === 'rhythm' ? 'rhythm' : stamped.show.bg && stamped.show.bg.motion && stamped.show.bg.motion.preset;
    console.log('Wrote ' + outPath + ' pack ' + args.pack + (motion && motion !== 'rhythm' ? ' ' + motion : '') + '. Character cameras unchanged. Open it and edit Background.');
    return;
  }
  if (args['run-preset']) {
    for (const key of ['place', 'brief', 'crop', 'layer']) {
      if (args[key] != null) throw new Error('A running preset does not take --' + key + '.');
    }
    const packs = JSON.parse(fs.readFileSync(path.join(repo, 'public/presets/bg_motion_packs.json'), 'utf8'));
    const overrides = {};
    if (args.preset != null) overrides.preset = args.preset;
    if (args.clock != null) overrides.clock = args.clock;
    if (args.amount != null) overrides.amount = args.amount;
    if (args['speed-px-s'] != null) overrides.speed_px_s = args['speed-px-s'];
    if (args['tile-mode'] != null) overrides.tile_mode = args['tile-mode'];
    if (args['stride-bob'] != null) overrides.stride_bob = args['stride-bob'];
    if (args['motion-blur'] != null) overrides.motion_blur = args['motion-blur'];
    const stamped = applyBackgroundRunPreset(input, args['run-preset'], packs, overrides, C);
    const result = await composeStamped(repo, stamped.show);
    if (!result.ok) throw new Error(result.errors.join('; '));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(stamped, null, 2) + '\n', { flag: 'wx' });
    const motion = (stamped.show.bg && (stamped.show.bg.motion || (stamped.show.bg.locations && stamped.show.bg.locations[0] && stamped.show.bg.locations[0].motion))) || {};
    console.log('Wrote ' + outPath + ' run preset ' + args['run-preset'] + ' ' + (motion.preset || '') + '. Character cameras unchanged. Open it and edit Background.');
    return;
  }
  const fromFile = args.brief ? JSON.parse(fs.readFileSync(path.resolve(args.brief), 'utf8')) : {};
  const brief = { ...fromFile };
  if (args.place) brief.place = args.place;
  if (args.layer) brief.layer = args.layer;
  if (args.preset) brief.preset = args.preset;
  if (args.clock) brief.clock = args.clock;
  if (args.crop) brief.crop = parseCrop(args.crop);
  if (args['speed-px-s'] != null) brief.speed_px_s = args['speed-px-s'];
  if (args['tile-mode'] != null) brief.tile_mode = args['tile-mode'];
  if (args['stride-bob'] != null) brief.stride_bob = args['stride-bob'];
  if (args['motion-blur'] != null) brief.motion_blur = args['motion-blur'];
  if (args.amount != null) {
    const amount = Number(args.amount);
    if (!Number.isFinite(amount)) throw new Error('Motion amount must be a number from 0 to 1.');
    brief.amount = amount;
  }
  const stamped = authorBackgroundScene(input, brief, C);
  const result = await composeStamped(repo, stamped.show);
  if (!result.ok) throw new Error(result.errors.join('; '));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(stamped, null, 2) + '\n', { flag: 'wx' });
  const layer = brief.layer || 'base';
  const crop = stamped.show.bg.crops[layer];
  const motion = stamped.show.bg.motion;
  console.log('Wrote ' + outPath + ' for ' + brief.place.trim() + '. Crop ' + crop.w + ' x ' + crop.h + ' at ' + crop.x + ',' + crop.y + '. Motion ' + motion.preset + ' ' + motion.amount + (motion.clock ? ' ' + motion.clock : '') + '. Open it and edit Background.');
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { main, authorBackgroundScene, applyBackgroundMotionPack, applyBackgroundRunPreset };

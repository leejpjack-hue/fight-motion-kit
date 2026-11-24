'use strict';

const fs = require('node:fs');
const path = require('node:path');

const GOLD_DEMO_REL = 'public/shows/daiyu-wang-five-seconds.json';
const HOLD_KEYS = new Set(['voice', 'sfx', 'audio', 'vo', '#41']);
const EXTRA_BLOCKED_FX = new Set(['fire', 'photo_fire', 'light', 'photo_light', 'dust', 'photo_dust', 'debris', 'pink_slash']);
const BG_SCROLL_PRESETS = ['scroll_left', 'scroll_right', 'scroll_up', 'scroll_down'];
const ALL_BG_PRESETS = ['follow_camera', 'static', 'pan_left', 'pan_right', 'pan_up', 'pan_down', 'push_in', 'pull_out', ...BG_SCROLL_PRESETS];
const BLEND_MODES = new Set(['source-over', 'screen', 'lighter', 'multiply', 'overlay']);

function assertLocalRef(ref, label) {
  const text = String(ref == null ? '' : ref);
  if (!text.trim()) throw new Error(label + ' must be a non-empty local path');
  if (text.includes('\0') || /^(?:https?:|file:|\/\/)/i.test(text.trim()) || /teqcon/i.test(text) || text.includes(':8770')) {
    throw new Error(label + ' must stay local (no remote URLs, :8770, or teqcon)');
  }
}

function rejectForbiddenKeys(value, label, depth) {
  const d = depth || 0;
  if (d > 32) throw new Error((label || 'input') + ' exceeds maximum nesting depth');
  if (value == null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) rejectForbiddenKeys(value[i], (label || 'input') + '[' + i + ']', d + 1);
    return;
  }
  for (const key of Object.keys(value)) {
    if (HOLD_KEYS.has(String(key).toLowerCase())) {
      throw new Error((label || 'input') + ' includes "' + key + '" (voice / #41 SFX stay HOLD)');
    }
    rejectForbiddenKeys(value[key], (label || 'input') + '.' + key, d + 1);
  }
}

function isValidBgMotion(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
  if (!ALL_BG_PRESETS.includes(m.preset) || !Number.isFinite(+m.amount) || +m.amount < 0 || +m.amount > 1) return false;
  if (m.clock !== undefined && !['show', 'per_atom', 'legacy', 'span'].includes(m.clock)) return false;
  if (m.parallax_ratio !== undefined && (!Number.isFinite(+m.parallax_ratio) || +m.parallax_ratio < 0 || +m.parallax_ratio > 1)) return false;
  if (m.speed_px_s !== undefined && (!Number.isFinite(+m.speed_px_s) || +m.speed_px_s < 0 || +m.speed_px_s > 3000)) return false;
  if (m.tile_mode !== undefined && m.tile_mode !== 'tile' && m.tile_mode !== 'mirror') return false;
  if (m.motion_blur !== undefined && (!Number.isFinite(+m.motion_blur) || +m.motion_blur < 0 || +m.motion_blur > 1)) return false;
  if (m.stride_bob !== undefined) {
    if (!m.stride_bob || typeof m.stride_bob !== 'object' || Array.isArray(m.stride_bob)) return false;
    if (m.stride_bob.amp_px !== undefined && (!Number.isFinite(+m.stride_bob.amp_px) || +m.stride_bob.amp_px < 0 || +m.stride_bob.amp_px > 24)) return false;
    if (m.stride_bob.freq_hz !== undefined && (!Number.isFinite(+m.stride_bob.freq_hz) || +m.stride_bob.freq_hz < 0.5 || +m.stride_bob.freq_hz > 8)) return false;
  }
  return true;
}

function resolveSandboxedPath(workspaceRoot, rawPath, opts) {
  const options = opts || {};
  if (typeof rawPath !== 'string' || !rawPath.trim()) throw new Error('path must be a non-empty string');
  if (rawPath.includes('\0') || /^(?:https?:|file:|\/\/)/i.test(rawPath.trim())) {
    throw new Error('Unsafe path rejected: ' + rawPath);
  }
  const realRoot = fs.realpathSync(path.resolve(workspaceRoot));
  const cleaned = rawPath.trim();
  const candidate = path.isAbsolute(cleaned) ? path.resolve(cleaned) : path.resolve(realRoot, cleaned);

  let probe = candidate;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  if (!fs.existsSync(probe)) throw new Error('Path escapes workspace sandbox: ' + rawPath);
  const realProbe = fs.realpathSync(probe);
  const probeRel = path.relative(realRoot, realProbe);
  if (probeRel === '..' || probeRel.startsWith('..' + path.sep) || path.isAbsolute(probeRel)) {
    throw new Error('Path escapes workspace sandbox: ' + rawPath);
  }

  const tail = path.relative(probe, candidate);
  const resolved = fs.existsSync(candidate) ? fs.realpathSync(candidate) : path.resolve(realProbe, tail);
  const resolvedRel = path.relative(realRoot, resolved);
  if (resolvedRel === '..' || resolvedRel.startsWith('..' + path.sep) || path.isAbsolute(resolvedRel)) {
    throw new Error('Path escapes workspace sandbox: ' + rawPath);
  }
  if (options.mustExist && !fs.existsSync(resolved)) {
    throw new Error('File does not exist: ' + rawPath);
  }
  return resolved;
}

function assertNotGoldDemo(targetPath, repoRoot) {
  const norm = path.resolve(targetPath).replace(/\\/g, '/');
  const demoAbs = path.resolve(repoRoot, GOLD_DEMO_REL);
  const demoReal = fs.existsSync(demoAbs) ? fs.realpathSync(demoAbs) : demoAbs;
  if (
    path.resolve(targetPath) === demoAbs ||
    path.resolve(targetPath) === demoReal ||
    norm.endsWith('/' + GOLD_DEMO_REL) ||
    norm.endsWith('/' + GOLD_DEMO_REL + '.bak')
  ) {
    throw new Error('Refusing to modify the 5.00s gold demo (' + GOLD_DEMO_REL + '). Write to a separate out_path.');
  }
}

function loadEngine(repoRoot) {
  const load = rel => require(path.join(repoRoot, rel));
  load('public/ui/import-security.js');
  load('public/ui/compose-client.js');
  load('public/ui/cut-transitions.js');
  load('public/ui/strip-sampler.js');
  load('public/ui/motion-renderer.js');
  load('public/ui/html-import.js');
  load('public/ui/import-receipt.js');
  load('public/ui/fx-stack.js');
  load('public/ui/scene-action-ui.js');
  load('public/ui/impact-studio.js');
  load('public/ui/cam-action-picker.js');
  const teachingFile = path.join(repoRoot, 'public/ui/teaching-film.js');
  if (fs.existsSync(teachingFile)) require(teachingFile);

  return {
    sec: globalThis.HMImportSecurity,
    C: globalThis.HMComposeClient,
    HTML: globalThis.HMHtmlImport,
    Receipt: globalThis.HMImportReceipt,
    FxStack: globalThis.HMFxStack,
    SceneAction: globalThis.HMSceneAction,
    ImpactStudio: globalThis.HMImpactStudio,
    CamPicker: globalThis.HMCamActionPicker,
    MotionFx: globalThis.HMMotionFx,
    TeachingFilm: globalThis.HMTeachingFilm,
  };
}

function loadPresets(repoRoot) {
  const readJson = rel => JSON.parse(fs.readFileSync(path.join(repoRoot, 'public/presets', rel), 'utf8'));
  return {
    cameraPresets: readJson('camera_presets.json'),
    fxPresets: readJson('fx_presets.json'),
    wave1Presets: readJson('pixelfx_wave1.json'),
    cutPresets: readJson('cut_transitions.json'),
    bgMotionPacks: readJson('bg_motion_packs.json'),
  };
}

function resolvePublicFile(repoRoot, relPath) {
  const pubRoot = fs.realpathSync(path.join(repoRoot, 'public'));
  const clean = String(relPath || '').replace(/^\/+/, '');
  const candidate = path.resolve(pubRoot, clean);
  if (candidate !== pubRoot && !candidate.startsWith(pubRoot + path.sep)) {
    throw new Error('Asset leaves public/: ' + relPath);
  }
  return candidate;
}

function resolveAssetDiskPath(repoRoot, workspaceRoot, key) {
  assertLocalRef(key, 'asset path');
  const tryCandidates = [resolvePublicFile(repoRoot, key)];
  try {
    tryCandidates.push(resolveSandboxedPath(workspaceRoot, key, { mustExist: false }));
  } catch (_) {}
  for (const base of tryCandidates) {
    if (fs.existsSync(base)) return base;
    if (base.endsWith('.png')) {
      const alt = [base.replace(/\.png$/i, '.webp'), base.replace(/\.png$/i, '.jpg')].find(p => fs.existsSync(p));
      if (alt) return alt;
    }
  }
  return null;
}

function hydrateLayouts(show, existingLayouts, repoRoot, workspaceRoot) {
  const layouts = Object.assign({}, existingLayouts || {});
  const keys = new Set((show.atoms || []).map(a => a && a.hero && a.hero.layout_source).filter(Boolean));
  for (const key of keys) {
    if (layouts[key]) continue;
    const diskPath = resolveAssetDiskPath(repoRoot, workspaceRoot, key);
    if (diskPath && fs.existsSync(diskPath)) {
      layouts[key] = JSON.parse(fs.readFileSync(diskPath, 'utf8'));
    }
  }
  return layouts;
}

function loadDocument(filePath, repoRoot, workspaceRoot, engine) {
  const rawText = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html' || ext === '.htm') {
    const parsed = engine.HTML.parseMotionHtml(rawText);
    const project = parsed.project;
    project.layouts = hydrateLayouts(project.show, project.layouts, repoRoot, workspaceRoot);
    return { format: 'html', project, show: project.show, warnings: parsed.warnings || [] };
  }
  const parsed = engine.sec.safeParseJson(rawText, { maxDepth: 32 });
  if (parsed && parsed.show && typeof parsed.show === 'object' && Array.isArray(parsed.show.atoms)) {
    const project = engine.sec.sanitizeProjectBounds(parsed);
    project.layouts = hydrateLayouts(project.show, project.layouts, repoRoot, workspaceRoot);
    project.media = Array.isArray(project.media) ? project.media : [];
    project.assets = project.assets && typeof project.assets === 'object' ? project.assets : {};
    return { format: 'project', project, show: project.show, warnings: [] };
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed.show_id === 'string' && Array.isArray(parsed.atoms)) {
    const project = {
      version: 1,
      show: parsed,
      layouts: hydrateLayouts(parsed, {}, repoRoot, workspaceRoot),
      media: [],
      assets: {},
    };
    engine.sec.sanitizeProjectBounds(project);
    return { format: 'show', project, show: project.show, warnings: [] };
  }
  throw new Error('File must be a valid show JSON, .motion.json project, or editable Motion HTML');
}

function buildComposeValidationShow(show) {
  const cloned = JSON.parse(JSON.stringify(show));
  let captionTime = 0;
  cloned.overlays = (cloned.overlays || []).filter(o => !o || !o.editor_caption);
  for (const a of cloned.atoms || []) {
    if (a && a.caption) {
      cloned.overlays.push({
        id: 'caption-' + a.id,
        editor_caption: true,
        kind: 'text',
        text: a.caption,
        t_start: captionTime,
        t_end: captionTime + (Number(a.duration_s) || 0),
        x: 640,
        y: 644,
        style: { fontSize: 38, fill: '#ffffff', stroke: '#17201d', strokeWidth: 7 },
      });
    }
    captionTime += Number(a && a.duration_s) || 0;
  }
  return cloned;
}

async function runCompose(show, layouts, presets, engine) {
  return engine.C.composeShow(buildComposeValidationShow(show), {
    cameraPresets: presets.cameraPresets,
    fxPresets: presets.fxPresets,
    cutPresets: presets.cutPresets,
    loadJson: async key => {
      if (!layouts[key]) throw new Error('Missing layout: ' + key);
      return layouts[key];
    },
  });
}

function collectBgRefs(bg, bucket) {
  if (!bg || typeof bg !== 'object') return;
  if (typeof bg.base === 'string' && bg.base) bucket.add(bg.base);
  if (typeof bg.swap === 'string' && bg.swap) bucket.add(bg.swap);
  if (Array.isArray(bg.locations)) {
    for (const r of bg.locations) {
      if (r && typeof r.src === 'string' && r.src) bucket.add(r.src);
    }
  }
}

function findMissingAssets(project, layouts, repoRoot, workspaceRoot, engine) {
  const receipt = engine.Receipt.auditProjectAssets({
    show: project.show,
    layouts,
    media: project.media || [],
    assets: project.assets || {},
  });
  const missing = [];
  for (const ref of receipt.missingRefs || []) {
    if (/^data:image\//i.test(ref)) continue;
    const disk = resolveAssetDiskPath(repoRoot, workspaceRoot, ref);
    if (!disk) missing.push(ref);
  }
  return missing;
}

function resolveClipIndex(show, op) {
  const atoms = show.atoms || [];
  if (op.atom_id != null && op.atom_id !== '') {
    const idx = atoms.findIndex(a => a && a.id === op.atom_id);
    if (idx < 0) throw new Error('Unknown atom_id: ' + op.atom_id);
    return idx;
  }
  if (op.clip_index != null) {
    const idx = Number(op.clip_index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= atoms.length) {
      throw new Error('clip_index out of range (0..' + Math.max(0, atoms.length - 1) + '): ' + op.clip_index);
    }
    return idx;
  }
  throw new Error('Operation requires clip_index or atom_id');
}

function standalonePlayer(data) {
  const get = id => document.getElementById(id);
  const r = createMotionRenderer(get('stage'), data.assets);
  let t = 0, playing = false, start = 0, offset = 0;
  const duration = data.timeline.duration_s;
  get('seek').max = duration;
  get('title').textContent = data.timeline.title;
  document.title = data.timeline.title;
  const updateHud = typeof HMTeachingFilm !== 'undefined' && HMTeachingFilm.mountTeachingHud(get('stage').parentElement, data, value => { playing = false; t = Math.max(0, Math.min(duration, value)); draw(); }) || null;
  function draw() {
    r.render(t, { viaSoT: true, source: 'standalone-player' });
    get('seek').value = t;
    get('time').textContent = t.toFixed(2) + ' / ' + duration.toFixed(2) + 's';
    get('play').textContent = playing ? 'Pause' : 'Play';
    if (updateHud) updateHud(t);
    const layers = get('layers');
    if (layers) {
      const row = r.lastLayerMatrix;
      layers.dataset.state = row && layerCamsIndependent(row) ? 'independent' : 'idle';
      layers.textContent = layerCamMatrixText(row);
    }
  }
  function tick(now) { if (!playing) return; t = Math.min(duration, offset + (now - start) / 1000); if (t >= duration) playing = false; draw(); if (playing) requestAnimationFrame(tick); }
  function toggle() { if (playing) playing = false; else { if (t >= duration) t = 0; offset = t; start = performance.now(); playing = true; requestAnimationFrame(tick); } draw(); }
  get('play').onclick = toggle;
  get('seek').oninput = () => { playing = false; t = +get('seek').value; draw(); };
  document.addEventListener('keydown', e => { if (e.code === 'Space' && e.target.tagName !== 'INPUT') { e.preventDefault(); toggle(); } });
  window.ready = r.load(data).then(() => { get('play').disabled = false; draw(); });
  window.renderAt = value => { playing = false; t = Math.max(0, Math.min(duration, value)); draw(); };
  window.ready.catch(e => { get('title').textContent = 'Unable to load: ' + e.message; });
}

function buildEditableHtml(repoRoot, project, result, engine) {
  const fx = engine.MotionFx;
  const wave1Path = path.join(repoRoot, 'public/presets/pixelfx_wave1.json');
  const wave1Ids = new Set(fs.existsSync(wave1Path) ? JSON.parse(fs.readFileSync(wave1Path, 'utf8')).map(r => r && r.id).filter(Boolean) : []);
  const atoms = (project.show && project.show.atoms) || [];
  const pxUsed = atoms.some(a => (a.fx_hooks || []).some(h => {
    const tp = typeof h === 'string' ? h : h && h.type;
    return (h && h.source === 'pixelfx') || wave1Ids.has(tp);
  }));
  const pxFile = path.join(repoRoot, 'public/vendor/pixelfx/wave1.global.js');
  const pxBundle = pxUsed && fs.existsSync(pxFile) ? fs.readFileSync(pxFile, 'utf8') : '';
  const pxScript = pxBundle ? `<script>${pxBundle.replace(/<\/script/gi, '<\\/script')}<\/script>` : '';
  const hmProjectScript = engine.HTML.embedProjectScript(project, { omitAssets: true });
  const rawData = JSON.stringify({ ...result, assets: project.assets || {} });
  const data = engine.sec.escapeScriptJson(rawData);
  const cspMeta = '<meta http-equiv="Content-Security-Policy" content="' +
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'" +
    '">';
  const fns = [
    globalThis.backgroundMotionFrame.toString(),
    globalThis.backgroundMotionProgress.toString(),
    globalThis.backgroundScrollState.toString(),
    globalThis.fgPassByInstances.toString(),
    globalThis.resolveMicroFrameAt.toString(),
    `const FG_CAM_PRESETS=${JSON.stringify(globalThis.FG_CAM_PRESETS)};`,
    `const FG_DEFAULT_PARALLAX=${JSON.stringify(globalThis.FG_DEFAULT_PARALLAX)};`,
    `const FG_PARALLAX_PRESETS=${JSON.stringify(globalThis.FG_PARALLAX_PRESETS)};`,
    globalThis.fgCameraFrame.toString(),
    globalThis.fgPropPose.toString(),
    globalThis.fgBrokenCutoutSrc.toString(),
    globalThis.fgBreakState.toString(),
    `const FX_FIST_PATH=${JSON.stringify(globalThis.FX_FIST_PATH)};`,
    `const FX_LEG_PATH=${JSON.stringify(globalThis.FX_LEG_PATH)};`,
    `const FX_TORNADO_PATH=${JSON.stringify(globalThis.FX_TORNADO_PATH)};`,
    `const PHOTO_FX_CHIPS=${JSON.stringify(fx.PHOTO_FX_CHIPS)};`,
    'const PHOTO_FX_CHIP_SET=new Set(PHOTO_FX_CHIPS);',
    fx.fxPathOrStock.toString(),
    fx.fxPointOnPath.toString(),
    fx.fxPlacementOf.toString(),
    fx.transformFxPath.toString(),
    fx.exposureWarmCrushPixels.toString(),
    fx.normalizeImpactOpts.toString(),
    fx.normalizeHitstopEntry.toString(),
    fx.resolveHitstopAt.toString(),
    fx.applyHitstopPixels.toString(),
    fx.impactBurstGeometry.toString(),
    fx.drawImpactBurst.toString(),
    fx.normalizeFxLayerOpts.toString(),
    fx.taperedArcPolygon.toString(),
    fx.computeCameraVelocity.toString(),
    fx.computeBgParallaxOffset.toString(),
    fx.drawSceneAtmosphereMood.toString(),
    fx.computeCameraImpactShake.toString(),
    fx.drawFistPressure.toString(),
    fx.drawLegArc.toString(),
    fx.drawTornado.toString(),
    fx.collectProceduralOverlays.toString(),
    globalThis.cameraEase.toString(),
    globalThis.cameraChannel.toString(),
    globalThis.cameraPoseOnSegment.toString(),
    globalThis.cutTransitionsBundle.toString() + '\ncutTransitionsBundle();',
    globalThis.backgroundLocationsBundle.toString() + '\nbackgroundLocationsBundle();',
    typeof globalThis.stripSamplerBundle === 'function' ? globalThis.stripSamplerBundle.toString() + '\nstripSamplerBundle();' : '',
    globalThis.layerCamMatrix.toString(),
    globalThis.layerCamsIndependent.toString(),
    globalThis.layerCamMatrixText.toString(),
    globalThis.HMMotion.toString(),
    engine.TeachingFilm && typeof engine.TeachingFilm.createHMTeachingFilm === 'function'
      ? engine.TeachingFilm.createHMTeachingFilm.toString() + '\nconst HMTeachingFilm=createHMTeachingFilm();'
      : '',
    `const DATA=${data};`,
    `(${standalonePlayer.toString()})(DATA);`,
  ].filter(Boolean).join('\n');

  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${cspMeta}<title>HTML Motion</title><style>body{margin:0;background:#101315;color:#edf1e9;font:14px system-ui;min-height:100vh;display:grid;place-content:center}main{width:min(100vw,1280px)}canvas{display:block;width:100%;height:auto;background:white}nav{display:flex;gap:16px;align-items:center;padding:16px}button{background:#ccf17b;border:0;border-radius:6px;padding:9px 18px;cursor:pointer}input{accent-color:#ccf17b;flex:1;min-width:50px}output{font-size:12px;white-space:nowrap}h1{font-size:16px;font-weight:500;padding:0 16px}p{font-size:11px;color:#98a699;padding:0 16px}</style><main><h1 id="title"></h1><canvas id="stage" width="1280" height="720"></canvas><nav><button id="play" disabled>Loading…</button><input id="seek" aria-label="Seek" type="range" min="0" step="0.01" value="0"><output id="time"></output></nav><p>HTML Motion · Plate animation · Plays offline</p><p id="layers"></p></main>${hmProjectScript}${pxScript}<script>${fns.replace(/<\/script/gi, '<\\/script')}<\/script></html>`;
}

const TOOL_DEFINITIONS = [
  {
    name: 'hm_catalog_list',
    description: 'List shipped camera, FX, PixelFX Wave1, cut transition, running BG, scene recipe, mood, impact archetype, and 1-2f motion density catalog IDs from public/presets/.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['all', 'camera', 'fx', 'pixelfx', 'cuts', 'bg', 'run_presets', 'scene_recipes', 'mood', 'density', 'impact', 'cam_cards'],
          description: 'Optional catalog subset to return (defaults to all).',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'hm_show_inspect',
    description: 'Inspect a .motion.json, show .json, or editable Motion .html file inside the workspace, returning clips, BG state, FG state, mood, duration, and missing asset references.',
    inputSchema: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string', description: 'Workspace-relative path to a .json, .motion.json, or .html file.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'hm_show_validate',
    description: 'Run the real FE composer engine (composeShow, lintShow, framePeekPlan) on a show, .motion.json, or Motion .html file without mutating disk.',
    inputSchema: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string', description: 'Workspace-relative path to inspect and compose.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'hm_show_patch',
    description: 'Atomically apply validated BG running scroll, BG locations, FG props/pass_by/cam, clip camera/cut/FX/mood/density patches and run composeShow() BEFORE writing disk. Fails closed on invalid IDs, photo fire/light/dust, voice/#41, traversal, or daiyu-wang-five-seconds.json.',
    inputSchema: {
      type: 'object',
      required: ['path', 'operations'],
      properties: {
        path: { type: 'string', description: 'Input .json, .motion.json, or .html file inside workspace.' },
        out_path: { type: 'string', description: 'Output .json or .motion.json path inside workspace (defaults to in-place .bak-guarded write if omitted; never daiyu-wang-five-seconds.json).' },
        operations: {
          type: 'array',
          minItems: 1,
          description: 'Ordered list of patch operations: set_bg_motion, set_bg_locations, upsert_fg_prop, set_fg_cam, set_clip_camera, set_clip_cut, add_clip_fx, set_mood, apply_scene_recipe, apply_motion_density.',
          items: {
            type: 'object',
            required: ['op'],
            properties: {
              op: {
                type: 'string',
                enum: ['set_bg_motion', 'set_bg_locations', 'upsert_fg_prop', 'set_fg_cam', 'set_clip_camera', 'set_clip_cut', 'add_clip_fx', 'set_mood', 'apply_scene_recipe', 'apply_motion_density'],
              },
            },
          },
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'hm_export_editable_html',
    description: 'Compose a show/project, embed local assets within HMImportSecurity budgets, and emit an offline Playable + Re-openable Motion .html file containing <script id="hm-project-data" type="application/json">.',
    inputSchema: {
      type: 'object',
      required: ['path', 'out_html'],
      properties: {
        path: { type: 'string', description: 'Input .json, .motion.json, or .html path inside workspace.' },
        out_html: { type: 'string', description: 'Output .html path inside workspace.' },
      },
      additionalProperties: false,
    },
  },
];

function createToolset(opts) {
  const options = opts || {};
  const workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '../..'));
  const engine = loadEngine(repoRoot);
  const presets = loadPresets(repoRoot);
  const { C } = engine;

  const validCamPresets = new Set((presets.cameraPresets.presets || []).map(p => p && p.id).filter(Boolean));
  const validFxHooks = new Set((presets.fxPresets.hooks || []).map(h => h && h.id).filter(Boolean));
  const validWave1Ids = new Set((presets.wave1Presets || []).map(w => w && w.id).filter(Boolean));
  const validCutsList = (presets.cutPresets.presets || []).concat(presets.cutPresets.extended_presets || []);
  const validCutsMap = new Map(validCutsList.map(c => [c.id, c]));

  function applyOp(show, op) {
    if (!op || typeof op !== 'object' || Array.isArray(op)) throw new Error('Each operation must be an object');
    rejectForbiddenKeys(op, 'operation ' + op.op);

    switch (op.op) {
      case 'set_bg_motion': {
        let motion;
        if (op.pack) {
          return C.applyBgMotionPack(show, op.pack, { packs: presets.bgMotionPacks, scope: op.scope, locationId: op.location_id, indices: op.indices });
        }
        if (op.run_preset) {
          const runList = presets.bgMotionPacks.run_presets || [];
          const spec = runList.find(p => p && p.id === op.run_preset);
          if (!spec || !spec.motion) throw new Error('Unknown run_preset: ' + op.run_preset);
          motion = JSON.parse(JSON.stringify(spec.motion));
        } else if (op.motion && typeof op.motion === 'object') {
          motion = JSON.parse(JSON.stringify(op.motion));
        } else {
          motion = { preset: op.preset || 'pan_right', amount: op.amount != null ? Number(op.amount) : 0.4, clock: op.clock || 'show' };
        }
        for (const k of ['preset', 'amount', 'clock', 'speed_px_s', 'tile_mode', 'motion_blur', 'parallax_ratio', 'stride_bob']) {
          if (op[k] !== undefined && k !== 'motion') motion[k] = op[k];
        }
        if (motion.preset && !ALL_BG_PRESETS.includes(motion.preset)) throw new Error('Unknown bg preset: ' + motion.preset);
        if (motion.amount == null) motion.amount = 0.4;
        if (!isValidBgMotion(motion)) throw new Error('Invalid background motion settings');
        if (show.bg && Array.isArray(show.bg.locations) && show.bg.locations.length) {
          if (op.location_id) {
            C.applyBackgroundEdit(show, { op: 'update-location', id: op.location_id, patch: { motion } });
          } else {
            for (const row of show.bg.locations) {
              C.applyBackgroundEdit(show, { op: 'update-location', id: row.id, patch: { motion } });
            }
          }
        } else {
          C.applyBackgroundEdit(show, { op: 'set-pair-motion', motion });
        }
        return show;
      }

      case 'set_bg_locations': {
        if (!Array.isArray(op.locations) || !op.locations.length) throw new Error('locations must be a non-empty array');
        const cleaned = op.locations.map((row, idx) => {
          if (!row || typeof row !== 'object') throw new Error('Invalid location at index ' + idx);
          const id = String(row.id || ('loc-' + (idx + 1))).trim();
          const src = row.src === null ? null : String(row.src || '').trim();
          if (src != null) assertLocalRef(src, id + '.src');
          const t0 = Number(row.t0), t1 = Number(row.t1);
          if (!Number.isFinite(t0) || !Number.isFinite(t1) || t0 < 0 || !(t1 > t0)) {
            throw new Error(id + ': invalid time window t0..t1');
          }
          if (row.crop && !C.validBackgroundCrop(row.crop)) throw new Error(id + ': invalid crop');
          if (row.motion && !isValidBgMotion(row.motion)) throw new Error(id + ': invalid motion');
          return {
            id,
            src,
            t0,
            t1,
            ...(row.crop ? { crop: row.crop } : {}),
            ...(row.motion ? { motion: row.motion } : {}),
          };
        });
        cleaned.sort((a, b) => a.t0 - b.t0);
        for (let i = 1; i < cleaned.length; i++) {
          if (cleaned[i].t0 < cleaned[i - 1].t1 - 1e-6) throw new Error('Background locations overlap at ' + cleaned[i].id);
        }
        const prevBg = show.bg && typeof show.bg === 'object' ? show.bg : {};
        show.bg = {
          ...(prevBg.key_white ? { key_white: true } : {}),
          ...(prevBg.parallax_ratio != null ? { parallax_ratio: prevBg.parallax_ratio } : {}),
          locations: cleaned,
        };
        return show;
      }

      case 'upsert_fg_prop': {
        const raw = op.prop && typeof op.prop === 'object' ? op.prop : op;
        const id = raw.id != null ? String(raw.id).trim() : '';
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) throw new Error('FG prop id must be a valid token');
        assertLocalRef(raw.src, id + '.src');
        const slot = raw.slot === 'overlay' ? 'overlay' : 'prop';
        if (raw.slot != null && raw.slot !== 'prop' && raw.slot !== 'overlay') throw new Error(id + ': unknown slot ' + raw.slot);
        const totalDur = (show.atoms || []).reduce((s, a) => s + (Number(a.duration_s) || 0), 0) || 5;
        const x = raw.x == null ? (slot === 'overlay' ? 640 : 980) : Number(raw.x);
        const y = raw.y == null ? (slot === 'overlay' ? 360 : 180) : Number(raw.y);
        const scale = raw.scale == null ? 1 : Number(raw.scale);
        const z = raw.z == null ? 10 : Number(raw.z);
        const t0 = raw.t_start == null ? 0 : Number(raw.t_start);
        const t1 = raw.t_end == null ? totalDur : Number(raw.t_end);
        if (![x, y, scale, z].every(Number.isFinite) || scale < 0.05 || scale > 8) throw new Error(id + ': invalid placement');
        if (!Number.isFinite(t0) || !Number.isFinite(t1) || t0 < 0 || !(t1 > t0)) throw new Error(id + ': invalid time window');

        const prop = { id, src: raw.src.trim(), x, y, scale, z, t_start: t0, t_end: Math.min(t1, totalDur) };
        if (slot === 'overlay') prop.slot = 'overlay';

        if (raw.effect != null && raw.effect !== 'none') {
          if (slot === 'overlay') throw new Error(id + ': overlay art does not break');
          const eff = typeof raw.effect === 'string' ? { type: raw.effect, t: 0 } : raw.effect;
          if (!eff || eff.type !== 'break') throw new Error(id + ': unknown effect "' + (eff && eff.type) + '" (only break allowed)');
          const bt = eff.t == null ? 0 : Number(eff.t);
          if (!Number.isFinite(bt) || bt < 0) throw new Error(id + ': invalid break time');
          prop.effect = { type: 'break', t: bt };
          if (eff.broken_src) {
            assertLocalRef(eff.broken_src, id + '.broken_src');
            prop.effect.broken_src = eff.broken_src.trim();
          }
        }

        if (raw.pass_by != null) {
          const pb = raw.pass_by;
          if (!pb || typeof pb !== 'object' || Array.isArray(pb)) throw new Error(id + ': invalid pass_by');
          if (pb.enabled !== false) {
            const dir = pb.direction || 'left';
            if (!['left', 'right', 'up', 'down'].includes(dir)) throw new Error(id + ': invalid pass_by direction');
            const mult = pb.parallax_mult == null ? 1.8 : Number(pb.parallax_mult);
            const spacing = pb.spacing_px == null ? 1800 : Number(pb.spacing_px);
            const phase = pb.phase_offset_px == null ? 0 : Number(pb.phase_offset_px);
            const blur = pb.motion_blur == null ? 0.35 : Number(pb.motion_blur);
            let hasSpeed = false, speed = 0;
            if (pb.speed_px_s !== undefined && pb.speed_px_s !== null && pb.speed_px_s !== '') {
              speed = Number(pb.speed_px_s);
              if (!Number.isFinite(speed) || speed < 50 || speed > 4500) throw new Error(id + ': invalid pass_by speed_px_s');
              hasSpeed = true;
            }
            if (!Number.isFinite(mult) || mult < 0.25 || mult > 4) throw new Error(id + ': invalid pass_by parallax_mult');
            if (!Number.isFinite(spacing) || spacing < 240 || spacing > 6000) throw new Error(id + ': invalid pass_by spacing_px');
            if (!Number.isFinite(phase)) throw new Error(id + ': invalid pass_by phase_offset_px');
            if (!Number.isFinite(blur) || blur < 0 || blur > 1) throw new Error(id + ': invalid pass_by motion_blur');
            prop.pass_by = {
              enabled: true,
              direction: dir,
              ...(hasSpeed ? { speed_px_s: speed } : {}),
              parallax_mult: mult,
              spacing_px: spacing,
              phase_offset_px: phase,
              motion_blur: blur,
            };
          }
        }

        show.fg = show.fg && typeof show.fg === 'object' ? show.fg : { cam: { preset: 'parallax', amount: C.FG_DEFAULT_PARALLAX, nudge: { x: 0, y: 0, s: 0 } }, props: [] };
        show.fg.cam = show.fg.cam || { preset: 'parallax', amount: C.FG_DEFAULT_PARALLAX, nudge: { x: 0, y: 0, s: 0 } };
        show.fg.props = Array.isArray(show.fg.props) ? show.fg.props.slice() : [];
        const existingIdx = show.fg.props.findIndex(p => p && p.id === id);
        if (existingIdx >= 0) show.fg.props[existingIdx] = prop;
        else show.fg.props.push(prop);
        return show;
      }

      case 'set_fg_cam': {
        const raw = op.cam && typeof op.cam === 'object' ? op.cam : op;
        if (raw.preset != null && !C.FG_CAM_PRESETS.includes(raw.preset)) {
          throw new Error('Unknown FG cam preset: ' + raw.preset);
        }
        const norm = C.normalizeFgCam(raw);
        if (!norm) throw new Error('Invalid foreground camera specification');
        show.fg = show.fg && typeof show.fg === 'object' ? show.fg : { props: [] };
        show.fg.cam = norm;
        show.fg.props = Array.isArray(show.fg.props) ? show.fg.props : [];
        return show;
      }

      case 'set_clip_camera': {
        const idx = resolveClipIndex(show, op);
        const atom = show.atoms[idx];
        if (op.card_id) {
          engine.CamPicker.applyCamActionCard(atom, op.card_id, {
            ease: op.ease,
            intensity: op.intensity,
            motion_blur: op.motion_blur,
            nudge: op.nudge,
          });
          return show;
        }
        atom.camera = atom.camera && typeof atom.camera === 'object' ? Object.assign({}, atom.camera) : {};
        if (op.preset != null) {
          if (!validCamPresets.has(op.preset)) throw new Error('Unknown camera preset: ' + op.preset);
          atom.camera.preset = op.preset;
          delete atom.camera.segments;
        }
        if (op.ease !== undefined) C.setCamEase(atom.camera, op.ease);
        if (op.intensity !== undefined) {
          const val = Number(op.intensity);
          if (!Number.isFinite(val) || val < 0.1 || val > 4) throw new Error('camera intensity must be between 0.1 and 4');
          atom.camera.intensity = Math.round(val * 1000) / 1000;
        }
        if (op.motion_blur !== undefined) {
          if (op.motion_blur) atom.camera.motion_blur = true;
          else delete atom.camera.motion_blur;
        }
        if (op.nudge && typeof op.nudge === 'object') {
          atom.camera.nudge = Object.assign({}, atom.camera.nudge || {}, op.nudge);
        }
        return show;
      }

      case 'set_clip_cut': {
        const idx = resolveClipIndex(show, op);
        if (idx === 0) throw new Error('Clip 0 has no incoming boundary; cuts apply to clip_index >= 1 only');
        const atom = show.atoms[idx];
        const preset = String(op.preset || '').trim();
        if (!preset || preset === 'none' || preset === 'hard') {
          delete atom.cut;
          return show;
        }
        const spec = validCutsMap.get(preset);
        if (!spec) throw new Error('Unknown cut preset: ' + preset);
        const def = spec.defaults || {};
        const dur_s = op.dur_s != null ? Number(op.dur_s) : (Number.isFinite(+def.dur_s) ? +def.dur_s : 0.08);
        if (!Number.isFinite(dur_s) || dur_s < 0.02 || dur_s > 0.5) throw new Error('cut dur_s must be between 0.02 and 0.5');
        let hold_s = 0;
        if (preset === 'freeze_hold') {
          hold_s = op.hold_s != null ? Number(op.hold_s) : (Number.isFinite(+def.hold_s) ? +def.hold_s : dur_s);
          if (!Number.isFinite(hold_s) || hold_s < 0 || hold_s > 0.5) throw new Error('cut hold_s must be between 0 and 0.5');
        }
        const dir = op.dir != null ? Number(op.dir) : (def.dir < 0 ? -1 : 1);
        if (dir !== -1 && dir !== 1) throw new Error('cut dir must be -1 or 1');
        atom.cut = { preset, dur_s, hold_s, dir };
        return show;
      }

      case 'add_clip_fx': {
        const idx = resolveClipIndex(show, op);
        const atom = show.atoms[idx];
        if (op.impact_archetype) {
          const hk = engine.ImpactStudio.applyImpactArchetype(atom, op.impact_archetype, op.target_pt || null);
          if (op.params && typeof op.params === 'object') Object.assign(hk.params, op.params);
          return show;
        }
        const type = String(op.type || '').trim();
        if (!type) throw new Error('add_clip_fx requires type or impact_archetype');
        const lower = type.toLowerCase();
        if (HOLD_KEYS.has(lower)) throw new Error('FX type "' + type + '" is blocked (voice / #41 HOLD)');
        if (EXTRA_BLOCKED_FX.has(lower) || C.REJECTED_PHOTO_OVERLAY_KINDS.includes(lower)) {
          throw new Error('Rejected photo fire/light/dust overlay FX: ' + type);
        }
        if (!validFxHooks.has(type) && !validWave1Ids.has(type)) {
          throw new Error('Unknown FX type: ' + type);
        }
        const nextHooks = engine.FxStack.addLayer(atom.fx_hooks || [], type, {});
        const patch = Object.assign({}, op.params && typeof op.params === 'object' ? op.params : {});
        for (const k of ['t_rel', 't_rel_end', 'x', 'y', 'scale', 'rotation', 'opacity', 'dur', 'angle', 'strength', 'color', 'blend']) {
          if (op[k] !== undefined && patch[k] === undefined) patch[k] = op[k];
        }
        if (patch.blend != null && !BLEND_MODES.has(String(patch.blend))) {
          throw new Error('Invalid blend mode: ' + patch.blend);
        }
        const updated = engine.FxStack.updateLayer(nextHooks, nextHooks.length - 1, patch);
        const added = updated[updated.length - 1];
        for (const extra of ['frames', 'hitstop_frames', 'hitstop', 'hitstop_dur', 'invert', 'contrast', 'tint', 'recoil', 'shake_dur']) {
          if (patch[extra] !== undefined) added.params[extra] = patch[extra];
        }
        atom.fx_hooks = updated;
        return show;
      }

      case 'set_mood': {
        const moodId = String(op.mood || 'neutral').trim();
        const scope = op.scope === 'clip' ? 'clip' : 'show';
        const atomIndex = scope === 'clip' ? resolveClipIndex(show, op) : 0;
        engine.SceneAction.applySceneMood(show, moodId, { scope, atomIndex, intensity: op.intensity, motes: op.motes });
        if (op.parallax_ratio !== undefined) {
          engine.SceneAction.setSceneParallax(show, atomIndex, op.parallax_ratio, { scope });
        }
        return show;
      }

      case 'apply_scene_recipe': {
        const idx = op.clip_index != null || op.atom_id != null ? resolveClipIndex(show, op) : 0;
        engine.SceneAction.applySceneRecipe(show, idx, op.recipe);
        return show;
      }

      case 'apply_motion_density': {
        if (op.profile) {
          return C.applyFilmMotionDensity(show, op.profile);
        }
        if (Array.isArray(op.micro_frames)) {
          const idx = resolveClipIndex(show, op);
          const atom = show.atoms[idx];
          const errs = [];
          const norm = C.normalizeMicroFrames(op.micro_frames, atom.id || ('clip-' + idx), errs);
          if (errs.length) throw new Error(errs.join('; '));
          if (norm) atom.micro_frames = norm;
          else delete atom.micro_frames;
          return show;
        }
        throw new Error('apply_motion_density requires profile or micro_frames');
      }

      default:
        throw new Error('Unknown patch operation: ' + op.op);
    }
  }

  const handlers = {
    async hm_catalog_list(args) {
      const kind = (args && args.kind) || 'all';
      const camPresets = (presets.cameraPresets.presets || []).map(p => ({ id: p.id, angle: p.angle, move: p.move, native_duration_s: p.native_duration_s }));
      const fxHooks = (presets.fxPresets.hooks || []).filter(h => h && !EXTRA_BLOCKED_FX.has(h.id)).map(h => ({ id: h.id, components: h.components, mode: (C.classifyFxHook({ type: h.id }, Object.fromEntries((presets.fxPresets.hooks || []).map(x => [x.id, x]))) || {}).mode }));
      const full = {
        camera: { presets: camPresets, eases: C.CAM_EASES },
        fx: fxHooks,
        pixelfx: (presets.wave1Presets || []).map(w => ({ id: w.id, role: w.role, label: w.label })),
        cuts: {
          gold: (presets.cutPresets.presets || []).map(c => ({ id: c.id, label: c.label, defaults: c.defaults })),
          extended: (presets.cutPresets.extended_presets || []).map(c => ({ id: c.id, label: c.label, defaults: c.defaults })),
        },
        bg: {
          window_presets: ALL_BG_PRESETS.filter(p => !BG_SCROLL_PRESETS.includes(p)),
          scroll_presets: BG_SCROLL_PRESETS,
          packs: presets.bgMotionPacks.packs || [],
          fg_cam_presets: C.FG_CAM_PRESETS,
        },
        run_presets: presets.bgMotionPacks.run_presets || [],
        scene_recipes: presets.bgMotionPacks.scene_recipes || [],
        mood: presets.bgMotionPacks.mood_presets || [],
        density: { profiles: C.FILM_DENSITY_PROFILES, actions: C.MICRO_FRAME_ACTIONS },
        impact: { archetypes: Object.values(engine.ImpactStudio.IMPACT_ARCHETYPES), angles: Object.values(engine.ImpactStudio.ANGLE_PRESETS) },
        cam_cards: engine.CamPicker.CAM_ACTION_CARDS.map(c => ({ id: c.id, label: c.label, preset: c.preset, ease: c.ease, intensity: c.intensity })),
      };
      if (kind === 'all') return full;
      if (!Object.prototype.hasOwnProperty.call(full, kind)) throw new Error('Unknown catalog kind: ' + kind);
      return { kind, items: full[kind] };
    },

    async hm_show_inspect(args) {
      const target = resolveSandboxedPath(workspaceRoot, args.path, { mustExist: true });
      const doc = loadDocument(target, repoRoot, workspaceRoot, engine);
      const show = doc.show;
      const totalDur = (show.atoms || []).reduce((s, a) => s + (Number(a && a.duration_s) || 0), 0);
      const missingAssets = findMissingAssets(doc.project, doc.project.layouts, repoRoot, workspaceRoot, engine);
      return {
        path: target,
        format: doc.format,
        show_id: show.show_id,
        title: show.title || show.show_id,
        duration_s: Math.round(totalDur * 10000) / 10000,
        clip_count: (show.atoms || []).length,
        clips: (show.atoms || []).map((a, idx) => ({
          index: idx,
          id: a.id,
          label: a.label || '',
          duration_s: a.duration_s,
          camera: a.camera || null,
          cut: a.cut || null,
          fx_hooks: a.fx_hooks || [],
          micro_frames: a.micro_frames || [],
        })),
        bg: show.bg || null,
        fg: show.fg || null,
        mood: show.mood || null,
        missing_assets: missingAssets,
        warnings: doc.warnings,
      };
    },

    async hm_show_validate(args) {
      const target = resolveSandboxedPath(workspaceRoot, args.path, { mustExist: true });
      const doc = loadDocument(target, repoRoot, workspaceRoot, engine);
      const composed = await runCompose(doc.show, doc.project.layouts, presets, engine);
      const rawLint = C.lintShow(
        { show: doc.show, layouts: doc.project.layouts, media: doc.project.media || [], assets: doc.project.assets || {} },
        { cameraPresets: presets.cameraPresets, fxPresets: presets.fxPresets, layouts: doc.project.layouts }
      );
      const findings = (rawLint.findings || []).map(f => ({
        code: f.code,
        severity: f.category === 'structural' ? 'error' : 'warn',
        message: f.message,
        fix: f.fix,
        atom_id: f.atom_id || null,
      }));
      const errorCount = findings.filter(f => f.severity === 'error').length;
      const warnCount = findings.filter(f => f.severity === 'warn').length;
      const plan = composed && composed.ok ? C.framePeekPlan(doc.show, composed) : null;
      return {
        ok: !!composed.ok,
        show_id: doc.show.show_id,
        duration_s: composed.duration_s || 0,
        errors: composed.errors || [],
        warnings: composed.warnings || [],
        lint: { contract: rawLint.contract, error_count: errorCount, warn_count: warnCount, findings },
        peeks: plan ? plan.peeks : [],
      };
    },

    async hm_show_patch(args) {
      const inPath = resolveSandboxedPath(workspaceRoot, args.path, { mustExist: true });
      const rawOut = args.out_path || args.path;
      const outPath = resolveSandboxedPath(workspaceRoot, rawOut, { mustExist: false });
      assertNotGoldDemo(outPath, repoRoot);

      const ops = args.operations;
      if (!Array.isArray(ops) || !ops.length) throw new Error('operations must be a non-empty array');
      rejectForbiddenKeys(ops, 'operations');

      const doc = loadDocument(inPath, repoRoot, workspaceRoot, engine);
      let nextShow = JSON.parse(JSON.stringify(doc.show));
      for (const op of ops) {
        nextShow = applyOp(nextShow, op);
      }

      const composed = await runCompose(nextShow, doc.project.layouts, presets, engine);
      if (!composed || composed.ok !== true) {
        const msg = (composed && Array.isArray(composed.errors) ? composed.errors : ['Compose validation failed']).join('; ');
        throw new Error('Patch rejected by composeShow (nothing written): ' + msg);
      }

      let payload;
      if (doc.format === 'show') {
        payload = nextShow;
      } else {
        payload = Object.assign({}, doc.project, { show: nextShow });
      }

      if (outPath === inPath) {
        const bak = inPath + '.bak';
        if (!fs.existsSync(bak)) fs.copyFileSync(inPath, bak);
      }
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');

      return {
        ok: true,
        out_path: outPath,
        show_id: nextShow.show_id,
        duration_s: composed.duration_s,
        applied_operations: ops.length,
        warnings: composed.warnings || [],
      };
    },

    async hm_export_editable_html(args) {
      const inPath = resolveSandboxedPath(workspaceRoot, args.path, { mustExist: true });
      const outHtml = resolveSandboxedPath(workspaceRoot, args.out_html, { mustExist: false });
      assertNotGoldDemo(outHtml, repoRoot);
      if (!/\.html?$/i.test(outHtml)) throw new Error('out_html must end in .html');

      const doc = loadDocument(inPath, repoRoot, workspaceRoot, engine);
      const show = doc.show;
      const layouts = doc.project.layouts;
      const composed = await runCompose(show, layouts, presets, engine);
      if (!composed || composed.ok !== true) {
        const msg = (composed && Array.isArray(composed.errors) ? composed.errors : ['Compose validation failed']).join('; ');
        throw new Error('Export aborted because composeShow failed: ' + msg);
      }

      const media = Array.isArray(doc.project.media) ? doc.project.media.slice() : [];
      if (!media.length) {
        for (const [key, layout] of Object.entries(layouts)) {
          const dir = path.posix.dirname(key);
          for (const [id, entry] of Object.entries(layout || {})) {
            const src = entry && (entry.full || (entry.parts && entry.parts[0] && entry.parts[0].src));
            if (!src) continue;
            const resolved = src.startsWith('data:') ? src : path.posix.join(dir, src);
            media.push({ id: 'media-' + media.length, name: id, src: resolved, layoutSource: key, plateId: id });
          }
        }
      }

      const paths = new Set(media.map(m => m && m.src).filter(Boolean));
      collectBgRefs(show.bg, paths);
      (show.atoms || []).forEach(a => {
        if (a && a.background && a.background.src) paths.add(a.background.src);
        ((a && a.micro_frames) || []).forEach(mf => { if (mf && mf.src) paths.add(mf.src); });
      });
      ((show.fg && show.fg.props) || []).forEach(p => {
        if (p && p.src) paths.add(p.src);
        if (p && p.effect && p.effect.broken_src) paths.add(p.effect.broken_src);
      });
      Object.values(composed.layout || {}).forEach(l => {
        if (l.full) paths.add(l.full);
        if (l.strip && l.strip.src) paths.add(l.strip.src);
        if (l.background && l.background.src) paths.add(l.background.src);
        for (const p of l.parts || []) if (p && p.src) paths.add(p.src);
        (l.micro_frames || []).forEach(mf => { if (mf && mf.src) paths.add(mf.src); });
      });
      collectBgRefs(composed.timeline.bg, paths);
      (composed.timeline.atoms || []).forEach(a => ((a && a.micro_frames) || []).forEach(mf => { if (mf && mf.src) paths.add(mf.src); }));
      ((composed.timeline.fg && composed.timeline.fg.props) || []).forEach(p => {
        if (p && p.src) paths.add(p.src);
        if (p && p.effect && p.effect.broken_src) paths.add(p.effect.broken_src);
      });
      for (const o of composed.timeline.overlays || []) if (o && o.src) paths.add(o.src);

      const assets = Object.assign({}, doc.project.assets || {});
      for (const key of paths) {
        if (/^data:image\//i.test(key) || assets[key]) continue;
        const disk = resolveAssetDiskPath(repoRoot, workspaceRoot, key);
        if (!disk) throw new Error('Missing image asset for HTML export: ' + key);
        const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[path.extname(disk).toLowerCase()];
        if (!mime) throw new Error('Unsupported image format: ' + disk);
        assets[key] = 'data:' + mime + ';base64,' + fs.readFileSync(disk).toString('base64');
      }

      engine.sec.assertProjectAssetBudget(assets);
      const exportProject = { version: 1, show, layouts, media, assets };
      const html = buildEditableHtml(repoRoot, exportProject, composed, engine);

      fs.mkdirSync(path.dirname(outHtml), { recursive: true });
      fs.writeFileSync(outHtml, html, 'utf8');

      return {
        ok: true,
        out_html: outHtml,
        show_id: show.show_id,
        duration_s: composed.duration_s,
        embedded_images: Object.keys(assets).length,
        bytes: Buffer.byteLength(html, 'utf8'),
      };
    },
  };

  async function callTool(name, args) {
    const fn = handlers[name];
    if (!fn) throw new Error('Unknown MCP tool: ' + name);
    return fn(args || {});
  }

  return {
    workspaceRoot,
    repoRoot,
    tools: TOOL_DEFINITIONS,
    handlers,
    callTool,
  };
}

module.exports = {
  GOLD_DEMO_REL,
  TOOL_DEFINITIONS,
  createToolset,
  resolveSandboxedPath,
  assertNotGoldDemo,
};

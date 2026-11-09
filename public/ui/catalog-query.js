/* Offline catalog index for HM-HF-05 and HM-PF-23.
 * Cam and FX come from static presets. Beat blocks are optional.
 * Camera presets prefer presets/camera_presets.json, then catalog presets.
 * A missing or empty camera catalog does not invent preset ids.
 * Show templates are queryable and do not write the current beat.
 * Wave 1 pixelfx rows are extra FX hits (family and source pixelfx).
 * Apply adds an FX hook if it is missing. It does not replace the hook list.
 * A pixelfx hit writes { type, t_rel: 0.08, source: "pixelfx" }.
 * Cam Apply sets the preset and drops stale curve params. Poses, duration,
 * motion timing, nudge, and existing hooks stay.
 */
(function (global) {
  'use strict';

  const KINDS = ['cam', 'fx', 'block', 'caption_style', 'template'];
  const CAPTION_STUBS = [
    {
      id: 'impact_hit',
      label: 'Impact hit',
      theme: 'clash',
      description: 'Thin caption stub until HF-09. Sets caption_style.',
      sample: 'HIT'
    },
    {
      id: 'street_mark',
      label: 'Street mark',
      theme: 'STREET',
      description: 'Thin caption stub until HF-09. Sets caption_style.',
      sample: 'STREET'
    }
  ];

  function asList(doc, keys) {
    if (!doc) return [];
    if (Array.isArray(doc)) return doc.filter(Boolean);
    if (typeof doc !== 'object') return [];
    const names = keys || [];
    for (let i = 0; i < names.length; i++) {
      const value = doc[names[i]];
      if (Array.isArray(value)) return value.filter(Boolean);
    }
    return [];
  }

  function blockList(doc) {
    if (!doc) return [];
    if (Array.isArray(doc)) return doc.filter(item => item && typeof item === 'object');
    return asList(doc, ['blocks', 'beat_blocks', 'registry', 'items']).filter(item => item && typeof item === 'object');
  }

  function uniq(values) {
    const seen = new Set();
    const out = [];
    for (const raw of values) {
      if (raw == null) continue;
      const text = String(raw).trim();
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(text);
    }
    return out;
  }

  function labelOf(item, id) {
    if (item && typeof item.label === 'string' && item.label.trim()) return item.label.trim();
    if (item && typeof item.name === 'string' && item.name.trim()) return item.name.trim();
    return String(id || '').replace(/_/g, ' ');
  }

  function hookKey(hook) {
    if (typeof hook === 'string') return hook;
    if (hook && typeof hook === 'object') return hook.type || hook.id || '';
    return '';
  }

  function presetIdOf(block) {
    if (!block || typeof block !== 'object') return '';
    if (typeof block.preset === 'string') return block.preset;
    if (typeof block.cam === 'string') return block.cam;
    const camera = block.camera;
    if (typeof camera === 'string') return camera;
    if (camera && typeof camera === 'object' && typeof camera.preset === 'string') return camera.preset;
    return '';
  }

  function cameraRecords(doc) {
    if (doc == null || typeof doc !== 'object') return null;
    const buckets = [];
    if (Array.isArray(doc)) buckets.push(doc);
    else {
      for (const key of ['presets', 'camera_presets']) {
        if (Array.isArray(doc[key])) buckets.push(doc[key]);
      }
    }
    if (!buckets.length) return null;
    const records = [];
    let bare = 0;
    for (const bucket of buckets) {
      for (const item of bucket) {
        if (item && typeof item === 'object' && typeof item.id === 'string' && item.id.trim()) records.push(item);
        else if (typeof item === 'string' && item.trim()) bare += 1;
      }
    }
    return { present: true, records, bare };
  }

  function resolveCameraCatalog(src) {
    const fromFile = cameraRecords(src.cameras);
    const fromCatalog = cameraRecords(src.catalog);
    if (fromFile && fromFile.records.length) return { records: fromFile.records, state: 'ok', message: '' };
    if (fromCatalog && fromCatalog.records.length) return { records: fromCatalog.records, state: 'ok', message: '' };
    const present = (fromFile && fromFile.present) || (fromCatalog && fromCatalog.present);
    if (!present) {
      return { records: [], state: 'missing', message: 'Camera catalog is missing. No presets to apply.' };
    }
    const bare = ((fromFile && fromFile.bare) || 0) + ((fromCatalog && fromCatalog.bare) || 0);
    return {
      records: [],
      state: 'empty',
      message: bare
        ? 'Camera catalog has no preset records. No presets to apply.'
        : 'Camera catalog is empty. No presets to apply.'
    };
  }

  function templateEntries(src) {
    const lists = [];
    if (Array.isArray(src.templates)) lists.push(src.templates);
    else if (src.templates && typeof src.templates === 'object') {
      const nested = asList(src.templates, ['templates']);
      if (nested.length) lists.push(nested);
    }
    if (src.catalog && Array.isArray(src.catalog.templates)) lists.push(src.catalog.templates);
    const out = [];
    const seen = new Set();
    for (const list of lists) {
      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const id = String(item.id || item.seed_show || '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(item);
      }
    }
    return out;
  }

  function blockFx(block) {
    const raw = block.fx_hooks || block.hooks || block.fx || [];
    const list = Array.isArray(raw) ? raw : [raw];
    const out = [];
    for (const item of list) {
      if (typeof item === 'string' && item) out.push({ type: item, id: item });
      else if (item && typeof item === 'object') {
        const id = item.type || item.id;
        if (id) out.push(item);
      }
    }
    return out;
  }

  function buildIndex(sources) {
    const src = sources || {};
    const cameraCatalog = resolveCameraCatalog(src);
    const cameras = cameraCatalog.records;
    const templates = templateEntries(src);
    const fx = asList(src.fx, ['hooks', 'fx']).length
      ? asList(src.fx, ['hooks', 'fx'])
      : asList(src.catalog, ['fx', 'hooks']);
    const fromFile = blockList(src.beatBlocks);
    const fromCatalog = blockList(src.catalog && (src.catalog.beat_blocks || src.catalog.blocks));
    const blocks = [];
    const seenBlocks = new Set();
    for (const block of fromCatalog.concat(fromFile)) {
      const id = block.id || block.block_id;
      if (!id || seenBlocks.has(id)) continue;
      seenBlocks.add(id);
      blocks.push(block);
    }
    const authoredStyles = asList(src.captionStyles, ['styles', 'caption_styles']).length
      ? asList(src.captionStyles, ['styles', 'caption_styles'])
      : asList(src.catalog, ['caption_styles', 'captionStyles']);
    const styles = authoredStyles.length ? authoredStyles : CAPTION_STUBS.map(stub => Object.assign({ stub: true }, stub));

    const camById = new Map();
    const hits = [];
    const seen = new Set();

    function pushHit(hit) {
      const key = hit.kind + ':' + hit.id;
      if (!hit.id || seen.has(key)) return;
      seen.add(key);
      hits.push(hit);
    }

    for (const preset of cameras) {
      if (!preset || !preset.id) continue;
      camById.set(preset.id, preset);
      const themes = uniq([preset.theme, preset.family, preset.angle, preset.move]);
      pushHit({
        kind: 'cam',
        id: preset.id,
        label: labelOf(preset, preset.id),
        themes,
        description: preset.comment || preset.source || '',
        meta: [preset.angle, preset.move].filter(Boolean).join(' · ') || 'cam',
        payload: preset
      });
    }

    for (const hook of fx) {
      if (!hook || !hook.id) continue;
      const themes = uniq([hook.theme, hook.family]);
      pushHit({
        kind: 'fx',
        id: hook.id,
        label: labelOf(hook, hook.id),
        themes,
        description: hook.source || hook.comment || (Array.isArray(hook.components) ? hook.components.join(' ') : ''),
        meta: (Array.isArray(hook.components) ? hook.components.slice(0, 3).join(' · ') : '') || 'fx',
        payload: hook
      });
    }

    const wave = asList(src.pixelfx, ['hooks', 'fx', 'effects']);
    for (const row of wave) {
      if (!row || !row.id) continue;
      pushHit({
        kind: 'fx',
        id: row.id,
        label: labelOf(row, row.id),
        themes: uniq([row.role, 'pixelfx']),
        description: row.notes || row.comment || '',
        meta: 'pixelfx · ' + (row.role || 'fx'),
        family: 'pixelfx',
        source: 'pixelfx',
        payload: {
          id: row.id,
          role: row.role || '',
          label: labelOf(row, row.id),
          notes: row.notes || '',
          family: 'pixelfx',
          source: 'pixelfx',
          components: ['pixelfx']
        }
      });
    }

    for (const block of blocks) {
      const id = block.id || block.block_id;
      const presetId = presetIdOf(block);
      const preset = camById.get(presetId);
      const beat = block.beat_class || (block.motion && block.motion.beat_class) || '';
      const family = block.family || (block.motion && block.motion.family) || '';
      const themes = uniq([block.theme, family, beat]);
      pushHit({
        kind: 'block',
        id,
        label: labelOf(block, id),
        themes,
        description: block.description || block.comment || '',
        meta: [block.theme, beat, presetId].filter(Boolean).join(' · ') || 'block',
        cam: preset
          ? { id: preset.id, angle: preset.angle, move: preset.move }
          : (presetId ? { id: presetId } : null),
        payload: block
      });
    }

    for (const tpl of templates) {
      const id = String(tpl.id || tpl.seed_show || '').trim();
      pushHit({
        kind: 'template',
        id,
        label: labelOf(tpl, id),
        themes: uniq([tpl.theme]),
        description: tpl.description || tpl.seed_show || tpl.path || '',
        meta: tpl.seed_show || tpl.kind || 'template',
        payload: tpl
      });
    }

    for (const style of styles) {
      if (!style || !style.id) continue;
      const themes = uniq([style.theme, style.family]);
      pushHit({
        kind: 'caption_style',
        id: style.id,
        label: labelOf(style, style.id),
        themes,
        description: style.description || style.comment || '',
        meta: style.theme || 'caption',
        payload: style
      });
    }

    const counts = { cam: 0, fx: 0, block: 0, caption_style: 0, template: 0 };
    hits.forEach(hit => { counts[hit.kind] += 1; });
    const themes = uniq(hits.flatMap(hit => hit.themes)).sort((a, b) => a.localeCompare(b));
    return {
      hits,
      themes,
      counts,
      blocks: counts.block,
      cameraCatalog: cameraCatalog.state,
      cameraCatalogMessage: cameraCatalog.message,
      stubs: styles === authoredStyles ? false : true,
      sources: {
        cameras: cameras.length,
        fx: fx.length,
        pixelfx: wave.length,
        blocks: blocks.length,
        templates: templates.length,
        caption_styles: styles.length,
        caption_stubs: !authoredStyles.length
      }
    };
  }

  function query(index, opts) {
    const options = opts || {};
    const q = String(options.q || options.text || '').trim().toLowerCase();
    const kind = String(options.kind || '').trim().toLowerCase();
    const theme = String(options.theme || '').trim().toLowerCase();
    const hits = (index && index.hits) || [];
    return hits.filter(hit => {
      if (kind && kind !== 'all' && hit.kind !== kind) return false;
      if (theme && !(hit.themes || []).some(tag => String(tag).toLowerCase() === theme)) return false;
      if (!q) return true;
      const blob = [hit.id, hit.label, hit.description, hit.meta].concat(hit.themes || []).join('\n').toLowerCase();
      return blob.indexOf(q) >= 0;
    });
  }

  function noSelection() {
    return { ok: false, code: 'no-selection', message: 'Select a clip, then Apply.' };
  }

  function applyCam(atom, preset) {
    if (!preset || !preset.id) return { ok: false, code: 'empty-hit', message: 'That camera preset has no id.' };
    const cam = atom.camera && typeof atom.camera === 'object' ? atom.camera : {};
    atom.camera = cam;
    const changed = cam.preset !== preset.id || cam.params != null;
    cam.preset = preset.id;
    if (preset.angle) cam.angle = preset.angle;
    else delete cam.angle;
    if (preset.move) cam.move = preset.move;
    else delete cam.move;
    delete cam.params;
    delete cam.impact_macro;
    if (Array.isArray(cam.segments) && cam.segments.length && cam.segments[0] && typeof cam.segments[0] === 'object') {
      cam.segments[0].preset = preset.id;
    }
    return {
      ok: true,
      code: changed ? 'applied' : 'unchanged',
      message: 'Camera preset set to ' + preset.id + '. Poses and timing kept.'
    };
  }

  function addFx(atom, spec) {
    const id = spec && (spec.type || spec.id);
    if (!id) return 'skip';
    if (!Array.isArray(atom.fx_hooks)) atom.fx_hooks = [];
    if (atom.fx_hooks.some(hook => hookKey(hook) === id)) return 'present';
    const entry = { type: id, t_rel: spec.t_rel != null && spec.t_rel !== '' ? +spec.t_rel : 0.08 };
    if (spec.t_rel_end != null && spec.t_rel_end !== '') entry.t_rel_end = +spec.t_rel_end;
    else if (spec.span) entry.t_rel_end = 0.92;
    if (spec.params && typeof spec.params === 'object' && Object.keys(spec.params).length) {
      entry.params = JSON.parse(JSON.stringify(spec.params));
    }
    if (spec.source === 'pixelfx') entry.source = 'pixelfx';
    atom.fx_hooks.push(entry);
    return 'added';
  }

  function applyFx(atom, hook) {
    const id = hook && hook.id;
    if (!id) return { ok: false, code: 'empty-hit', message: 'That FX hook has no id.' };
    const payload = hook.payload || {};
    const pix = hook.source === 'pixelfx' || payload.source === 'pixelfx' || payload.family === 'pixelfx';
    const state = addFx(atom, {
      id,
      type: id,
      span: !!payload.span,
      t_rel: 0.08,
      source: pix ? 'pixelfx' : undefined
    });
    if (state === 'present') {
      return { ok: true, code: 'unchanged', message: id + ' is already on this clip.' };
    }
    return { ok: true, code: 'applied', message: 'Added ' + id + ' to fx_hooks.' };
  }

  function applyBlock(atom, hit) {
    const block = hit.payload || {};
    const notes = [];
    if (hit.cam && hit.cam.id) {
      applyCam(atom, {
        id: hit.cam.id,
        angle: hit.cam.angle,
        move: hit.cam.move
      });
      notes.push('cam ' + hit.cam.id);
    }
    const added = [];
    for (const hook of blockFx(block)) {
      const state = addFx(atom, hook);
      if (state === 'added') added.push(hook.type || hook.id);
    }
    if (added.length) notes.push('fx ' + added.join('+'));
    const beat = block.beat_class || (block.motion && block.motion.beat_class);
    const family = block.family || (block.motion && block.motion.family);
    if (beat || family) {
      atom.motion = atom.motion && typeof atom.motion === 'object' ? atom.motion : {};
      if (beat) atom.motion.beat_class = beat;
      if (family) atom.motion.family = family;
      if (beat) notes.push('beat ' + beat);
    }
    if (block.caption_style) {
      atom.caption_style = block.caption_style;
      notes.push('caption ' + block.caption_style);
    }
    if (block.caption && !atom.caption) atom.caption = block.caption;
    return {
      ok: true,
      code: 'applied',
      message: 'Applied block ' + hit.id + (notes.length ? ' (' + notes.join(', ') + ')' : '') + '.'
    };
  }

  function applyCaption(atom, hit) {
    const style = hit.payload || {};
    atom.caption_style = hit.id;
    if (style.sample && !atom.caption) atom.caption = style.sample;
    return { ok: true, code: 'applied', message: 'Caption style set to ' + hit.id + '.' };
  }

  function applyTemplate(hit) {
    const tpl = (hit && hit.payload) || {};
    const id = (hit && hit.id) || tpl.id || 'template';
    const seed = tpl.seed_show || tpl.path || '';
    return {
      ok: false,
      code: 'template-show',
      message: 'Template ' + id + ' is a show template' + (seed ? ' (' + seed + ')' : '') + '. It does not change this beat.',
      template: { id, label: (hit && hit.label) || id, seed_show: tpl.seed_show || '' }
    };
  }

  function queryCamPresets(index, opts) {
    const options = opts || {};
    const text = options.q || options.text || '';
    const theme = options.theme || '';
    const templateHits = index ? query(index, { q: text, theme, kind: 'template' }) : [];
    const templates = templateHits.map(hit => ({ id: hit.id, label: hit.label }));
    const state = index && index.cameraCatalog;
    if (!index || state === 'missing' || !state) {
      return {
        ok: false,
        code: 'missing-catalog',
        message: (index && index.cameraCatalogMessage) || 'Camera catalog is missing. No presets to apply.',
        presets: [],
        templates
      };
    }
    if (state === 'empty') {
      return {
        ok: false,
        code: 'empty-catalog',
        message: index.cameraCatalogMessage || 'Camera catalog is empty. No presets to apply.',
        presets: [],
        templates
      };
    }
    const presets = query(index, { q: text, theme, kind: 'cam' }).map(hit => ({ id: hit.id, label: hit.label }));
    return { ok: true, code: 'ok', message: '', presets, templates };
  }

  function applyHit(atom, hit) {
    if (!hit || !hit.kind) return { ok: false, code: 'empty-hit', message: 'Pick a catalog hit, then Apply.' };
    if (hit.kind === 'template') return applyTemplate(hit);
    if (!atom || typeof atom !== 'object') return noSelection();
    if (hit.kind === 'cam') return applyCam(atom, hit.payload || { id: hit.id });
    if (hit.kind === 'fx') return applyFx(atom, hit);
    if (hit.kind === 'block') return applyBlock(atom, hit);
    if (hit.kind === 'caption_style') return applyCaption(atom, hit);
    return { ok: false, code: 'unknown-kind', message: 'Unknown catalog kind.' };
  }

  const api = {
    KINDS,
    CAPTION_STUBS,
    blockList,
    buildIndex,
    query,
    queryCamPresets,
    applyHit
  };
  global.HMCatalogQuery = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

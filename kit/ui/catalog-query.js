/* Offline catalog index for HM-HF-05.
 * Cam and FX come from static presets. Beat blocks are optional.
 * Wave 1 pixelfx rows are extra FX hits (family and source pixelfx).
 * Apply adds an FX hook if it is missing. It does not replace the hook list.
 * A pixelfx hit writes { type, t_rel: 0.08, source: "pixelfx" }.
 * Cam Apply sets the preset and drops stale curve params. Poses, duration,
 * motion timing, nudge, and existing hooks stay.
 */
(function (global) {
  'use strict';

  const KINDS = ['cam', 'fx', 'block', 'caption_style'];
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
    const cameras = asList(src.cameras, ['presets']).length
      ? asList(src.cameras, ['presets'])
      : asList(src.catalog, ['presets']);
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

    const counts = { cam: 0, fx: 0, block: 0, caption_style: 0 };
    hits.forEach(hit => { counts[hit.kind] += 1; });
    const themes = uniq(hits.flatMap(hit => hit.themes)).sort((a, b) => a.localeCompare(b));
    return {
      hits,
      themes,
      counts,
      blocks: counts.block,
      stubs: styles === authoredStyles ? false : true,
      sources: {
        cameras: cameras.length,
        fx: fx.length,
        pixelfx: wave.length,
        blocks: blocks.length,
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

  function applyHit(atom, hit) {
    if (!atom || typeof atom !== 'object') return noSelection();
    if (!hit || !hit.kind) return { ok: false, code: 'empty-hit', message: 'Pick a catalog hit, then Apply.' };
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
    applyHit
  };
  global.HMCatalogQuery = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

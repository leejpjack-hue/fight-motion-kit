/* HM-HF-07 Timeline JSON Inspector.
 * Absolute times are the prefix sum of atom.duration_s.
 * That is the same clock preview and scrub use:
 *   public/ui startOf(index) and renderStageAt atomWindow
 *   kit/ui atomBounds() t0/t1
 * The drawer only reads this clock. It never writes the show.
 */
(function (global) {
  'use strict';

  const CLOCK = 'prefix-sum duration_s';
  const SAVE_PREFIX = 'html-motion-composer:timeline-save:';

  function finiteDuration(value) {
    const n = typeof value === 'number' ? value : +value;
    return Number.isFinite(n) ? n : 0;
  }

  function cameraPreset(atom) {
    const cam = atom && atom.camera;
    if (!cam) return null;
    if (typeof cam === 'string' && cam) return cam;
    if (typeof cam.preset === 'string' && cam.preset) return cam.preset;
    if (Array.isArray(cam.segments)) {
      const ids = [];
      for (const seg of cam.segments) {
        if (seg && seg.preset) ids.push(String(seg.preset));
      }
      if (ids.length) return ids.join('+');
    }
    return null;
  }

  function fxHooks(atom) {
    const hooks = atom && atom.fx_hooks;
    if (!Array.isArray(hooks)) return [];
    const out = [];
    for (const hook of hooks) {
      if (typeof hook === 'string') {
        if (hook) out.push(hook);
      } else if (hook && typeof hook === 'object') {
        const id = hook.type || hook.id;
        if (id) out.push(String(id));
      }
    }
    return out;
  }

  function plateKeys(atom) {
    const plates = atom && atom.hero && atom.hero.plates;
    if (!Array.isArray(plates)) return [];
    const out = [];
    for (const plate of plates) {
      if (plate != null && plate !== '') out.push(String(plate));
    }
    return out;
  }

  function dump(atoms, meta) {
    const list = Array.isArray(atoms) ? atoms : [];
    const rows = [];
    let t = 0;
    for (let index = 0; index < list.length; index++) {
      const atom = list[index] && typeof list[index] === 'object' ? list[index] : {};
      const dur = finiteDuration(atom.duration_s);
      const absStart = t;
      t += dur;
      const id = atom.id != null && String(atom.id) !== '' ? String(atom.id) : String(index);
      rows.push({
        index: index,
        id: id,
        abs_start: absStart,
        abs_end: t,
        camera_preset: cameraPreset(atom),
        fx_hooks: fxHooks(atom),
        plate_keys: plateKeys(atom),
      });
    }
    const showId = meta && meta.show_id != null ? String(meta.show_id) : '';
    return {
      show_id: showId,
      clock: CLOCK,
      atom_count: rows.length,
      duration_s: t,
      atoms: rows,
    };
  }

  function serialize(payload) {
    return JSON.stringify(payload, null, 2);
  }

  function listsEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function savedAtoms(saved) {
    if (saved == null || typeof saved !== 'object') return null;
    if (Array.isArray(saved)) return saved;
    if (Array.isArray(saved.atoms)) return saved.atoms;
    if (saved.show && Array.isArray(saved.show.atoms)) return saved.show.atoms;
    return null;
  }

  function diff(atoms, saved) {
    const prior = savedAtoms(saved);
    if (!prior) return { status: 'no prior save', changed: [], added: [], removed: [] };
    const current = dump(atoms);
    const previous = dump(prior);
    const prevById = new Map();
    for (const row of previous.atoms) {
      if (!prevById.has(row.id)) prevById.set(row.id, row);
    }
    const currentIds = new Set();
    for (const row of current.atoms) currentIds.add(row.id);
    const changed = [];
    const added = [];
    for (const row of current.atoms) {
      const before = prevById.get(row.id);
      if (!before) {
        added.push({ id: row.id, index: row.index });
        continue;
      }
      const fields = [];
      if (before.abs_start !== row.abs_start || before.abs_end !== row.abs_end) fields.push('time');
      if (before.camera_preset !== row.camera_preset) fields.push('camera_preset');
      if (!listsEqual(before.fx_hooks, row.fx_hooks)) fields.push('fx_hooks');
      if (!listsEqual(before.plate_keys, row.plate_keys)) fields.push('plate_keys');
      if (before.index !== row.index) fields.push('index');
      if (fields.length) changed.push({ id: row.id, index: row.index, fields: fields });
    }
    const removed = [];
    for (const row of previous.atoms) {
      if (!currentIds.has(row.id)) removed.push({ id: row.id, index: row.index });
    }
    const count = changed.length + added.length + removed.length;
    return {
      status: count ? 'changed' : 'unchanged',
      changed: changed,
      added: added,
      removed: removed,
    };
  }

  function diffStatusText(result) {
    if (!result || result.status === 'no prior save') return 'no prior save';
    if (result.status === 'unchanged') return 'Matches last save';
    const parts = [];
    if (result.changed && result.changed.length) {
      parts.push(result.changed.map(function (row) {
        return row.id + ' (' + row.fields.join(', ') + ')';
      }).join('; '));
    }
    if (result.added && result.added.length) {
      parts.push('added ' + result.added.map(function (row) { return row.id; }).join(', '));
    }
    if (result.removed && result.removed.length) {
      parts.push('removed ' + result.removed.map(function (row) { return row.id; }).join(', '));
    }
    return 'Changed vs last save · ' + parts.join(' · ');
  }

  function saveKey(showId) {
    return SAVE_PREFIX + String(showId || 'unknown');
  }

  function writeSave(storage, show) {
    if (!storage || typeof storage.setItem !== 'function') throw new Error('No local save storage.');
    if (!show || typeof show !== 'object') throw new Error('No show to snapshot.');
    const atoms = Array.isArray(show.atoms) ? show.atoms : [];
    const payload = {
      ts: Date.now(),
      show_id: show.show_id || '',
      atoms: JSON.parse(JSON.stringify(atoms)),
    };
    storage.setItem(saveKey(payload.show_id), JSON.stringify(payload));
    return payload;
  }

  function readSave(storage, showId) {
    if (!storage || typeof storage.getItem !== 'function') return null;
    let raw = null;
    try { raw = storage.getItem(saveKey(showId)); } catch (e) { return null; }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.atoms)) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function readPrior(storage, showId, localShow) {
    const direct = readSave(storage, showId);
    if (direct) return direct;
    if (localShow && Array.isArray(localShow.atoms)) {
      return {
        show_id: showId || localShow.show_id || '',
        atoms: localShow.atoms,
        via: 'local-show',
      };
    }
    return null;
  }

  const api = {
    CLOCK: CLOCK,
    SAVE_PREFIX: SAVE_PREFIX,
    dump: dump,
    serialize: serialize,
    diff: diff,
    diffStatusText: diffStatusText,
    saveKey: saveKey,
    writeSave: writeSave,
    readSave: readSave,
    readPrior: readPrior,
  };
  global.HMTimelineJson = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

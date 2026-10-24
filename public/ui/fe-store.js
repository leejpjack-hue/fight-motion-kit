/*! HM-COMPOSE-07 — frontend-only persistence (localStorage + download / File API). */
(function (global) {
  'use strict';
  const OUT_PREFIX = 'html-motion-composer:out:';
  const SHOW_PREFIX = 'html-motion-composer:local-show:';
  const INDEX_KEY = 'html-motion-composer:local-show-index';
  const MODE_KEY = 'html-motion-composer:fe-only';
  const REF_B_KEY = 'html-motion-composer:ab-ref-b';

  function safeParse(raw, fallback) {
    try {
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function putOut(showId, timeline, layout, meta) {
    const payload = {
      show_id: showId,
      timeline,
      layout,
      meta: meta || {},
      ts: Date.now(),
      engine: 'js-fe',
    };
    localStorage.setItem(OUT_PREFIX + showId, JSON.stringify(payload));
    return payload;
  }

  function getOut(showId) {
    return safeParse(localStorage.getItem(OUT_PREFIX + showId), null);
  }

  function hasOut(showId) {
    const o = getOut(showId);
    return !!(o && o.timeline && o.layout);
  }

  function clearOut(showId) {
    try {
      localStorage.removeItem(OUT_PREFIX + showId);
    } catch (e) {}
  }

  function listLocalShowIds() {
    return safeParse(localStorage.getItem(INDEX_KEY), []) || [];
  }

  function putLocalShow(show) {
    if (!show || !show.show_id) throw new Error('show_id required');
    localStorage.setItem(SHOW_PREFIX + show.show_id, JSON.stringify(show));
    const ids = listLocalShowIds();
    if (ids.indexOf(show.show_id) < 0) {
      ids.push(show.show_id);
      localStorage.setItem(INDEX_KEY, JSON.stringify(ids));
    }
    return show.show_id;
  }

  function getLocalShow(showId) {
    return safeParse(localStorage.getItem(SHOW_PREFIX + showId), null);
  }

  function listLocalShows() {
    return listLocalShowIds()
      .map((id) => {
        const show = getLocalShow(id);
        return show ? { path: 'local:' + id + '.json', show, local: true } : null;
      })
      .filter(Boolean);
  }

  function downloadJson(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  async function saveWithFilePicker(filename, obj) {
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(JSON.stringify(obj, null, 1));
        await writable.close();
        return { ok: true, via: 'fs-access' };
      } catch (e) {
        if (e && e.name === 'AbortError') return { ok: false, aborted: true };
        // fall through to download
      }
    }
    downloadJson(filename, obj);
    return { ok: true, via: 'download' };
  }

  async function openShowFile() {
    if (typeof window.showOpenFilePicker === 'function') {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'Show JSON', accept: { 'application/json': ['.json'] } }],
          multiple: false,
        });
        const file = await handle.getFile();
        const text = await file.text();
        return { ok: true, show: JSON.parse(text), name: file.name, via: 'fs-access' };
      } catch (e) {
        if (e && e.name === 'AbortError') return { ok: false, aborted: true };
      }
    }
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.json,application/json';
      inp.onchange = async () => {
        const f = inp.files && inp.files[0];
        if (!f) return resolve({ ok: false, aborted: true });
        try {
          const show = JSON.parse(await f.text());
          resolve({ ok: true, show, name: f.name, via: 'input' });
        } catch (e) {
          resolve({ ok: false, errors: [String(e)] });
        }
      };
      inp.click();
    });
  }

  /** Read a directory (webkitdirectory) into {files: {relPath: File}}. */
  async function readDirectoryFiles(fileList) {
    const files = {};
    for (const f of fileList) {
      const rel = (f.webkitRelativePath || f.name || '').replace(/^[^/]+\//, '');
      if (rel) files[rel] = f;
      else files[f.name] = f;
    }
    return files;
  }

  /**
   * Import a plate-pack folder: expects layout.json (+ plates/, bg/, optional show.json).
   * Assets stay as object URLs in session; show is stored in localStorage.
   * Returns {ok, show, assetMap, warnings}.
   */
  async function importPackFromFiles(showId, fileList, opts) {
    opts = opts || {};
    const warnings = [];
    const files = await readDirectoryFiles(fileList);
    const names = Object.keys(files);
    if (!names.length) return { ok: false, errors: ['no files'] };

    let layoutFile =
      files['layout.json'] ||
      files[names.find((n) => /\/layout\.json$/i.test(n) || n === 'layout.json')];
    if (!layoutFile) {
      const hit = names.find((n) => /layout\.json$/i.test(n));
      if (hit) layoutFile = files[hit];
    }
    if (!layoutFile) return { ok: false, errors: ['layout.json not found in folder'] };

    const layoutText = await layoutFile.text();
    const layoutSrc = JSON.parse(layoutText);

    // Prefer an included show json; else synthesize a minimal parity show from layout plates
    let show = null;
    const showHit = names.find((n) => /(^|\/)show\.json$/i.test(n) || /(^|\/).+-show\.json$/i.test(n));
    if (showHit) {
      try {
        show = JSON.parse(await files[showHit].text());
      } catch (e) {
        warnings.push('could not parse ' + showHit);
      }
    }
    if (!show) {
      const plateIds = Object.keys(layoutSrc).sort();
      const n = plateIds.length;
      const duration_s = n / 2;
      // Split into ~1s atoms of 2 plates
      const atoms = [];
      for (let i = 0; i < n; i += 2) {
        const slice = plateIds.slice(i, i + 2);
        const dur = slice.length / 2;
        atoms.push({
          id: 'a' + String(atoms.length + 1).padStart(2, '0'),
          kind: 'duo',
          duration_s: dur,
          plates_needed: slice.length,
          pose_mode: 'hero',
          motion: { family: 'fight', beat_class: 'hero' },
          camera: { preset: 'static_hold', params: {} },
          fx_hooks: [],
          hero: {
            layout_source: 'local-pack/' + showId + '/layout.json',
            plates: slice,
          },
          source_refs: [],
        });
      }
      show = {
        show_id: showId,
        title: opts.title || showId,
        duration_target_s: duration_s,
        grounded: true,
        floor_y: 684,
        parity_mode: true,
        compose_mode: 'parity',
        plate_pack: true,
        chars: { L: { name: 'L' }, R: { name: 'R' } },
        bg: {
          base: 'local-pack/' + showId + '/bg/bg_rooftop.png',
          swap: null,
        },
        overlays: [],
        atoms,
        meta: { imported_fe: true, source: 'folder' },
      };
      // detect bg files
      const bgBase = names.find((n) => /bg\/.*rooftop(?!_dented)/i.test(n)) || names.find((n) => /bg\/.+\.png$/i.test(n));
      const bgSwap = names.find((n) => /bg\/.*dented/i.test(n));
      if (bgBase) show.bg.base = 'local-pack/' + showId + '/' + bgBase;
      if (bgSwap) show.bg.swap = 'local-pack/' + showId + '/' + bgSwap;
    } else {
      show = deepCopy(show);
      show.show_id = showId;
    }

    // Store pack blobs under localStorage is too big — use IndexedDB-lite via Cache API if available,
    // else keep object URLs in a session map and rewrite layout_source to a data-backed virtual path.
    const assetMap = {};
    for (const rel of names) {
      const f = files[rel];
      const url = URL.createObjectURL(f);
      assetMap['local-pack/' + showId + '/' + rel] = url;
      assetMap[rel] = url;
    }
    // Persist layout JSON text under show meta (small) + keep assetMap in memory session
    show.meta = Object.assign({}, show.meta || {}, {
      imported_fe: true,
      pack_id: showId,
      layout_inline: layoutSrc,
    });
    // Point hero layout_source at a virtual key the compose loader understands
    (show.atoms || []).forEach((a) => {
      if (a.hero) {
        a.hero.layout_source = 'local-pack/' + showId + '/layout.json';
      }
    });
    assetMap['local-pack/' + showId + '/layout.json'] = 'json:' + JSON.stringify(layoutSrc);

    putLocalShow(show);
    return { ok: true, show, assetMap, warnings, plate_count: Object.keys(layoutSrc).length };
  }

  function deepCopy(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function putRefB(meta) {
    const payload = Object.assign({ ts: Date.now() }, meta || {});
    try {
      localStorage.setItem(REF_B_KEY, JSON.stringify(payload));
    } catch (e) {}
    return payload;
  }

  function getRefB() {
    try {
      return safeParse(localStorage.getItem(REF_B_KEY), null);
    } catch (e) {
      return null;
    }
  }

  function clearRefB() {
    try {
      localStorage.removeItem(REF_B_KEY);
    } catch (e) {}
  }

  global.HMFeStore = {
    OUT_PREFIX,
    SHOW_PREFIX,
    REF_B_KEY,
    putOut,
    getOut,
    hasOut,
    clearOut,
    putLocalShow,
    getLocalShow,
    listLocalShows,
    putRefB,
    getRefB,
    clearRefB,
    downloadJson,
    saveWithFilePicker,
    openShowFile,
    importPackFromFiles,
    MODE_KEY,
  };
})(typeof window !== 'undefined' ? window : globalThis);

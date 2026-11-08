/*! HM-PF-44 — one .motion.json source of truth for every step.
 * Character plates, per-atom camera, and compose timing/FX edit this object.
 * localStorage draft uses the existing html-motion-composer:draft:<show_id> key.
 * The downloaded file is the portable project. No product HTTP write lives here.
 */
(function (global) {
  'use strict';

  var DRAFT_PREFIX = 'html-motion-composer:draft:';
  var PIN_KEY = 'hm.composer.pinPlatePack';
  var RECENT_KEY = 'hm.composer.recentPlatePack';

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function showOf(input) {
    if (input && input.show && typeof input.show === 'object') return input.show;
    if (input && Array.isArray(input.atoms)) return input;
    return null;
  }

  function atomAt(project, index) {
    var show = showOf(project);
    if (!show || !Array.isArray(show.atoms)) throw new Error('No show.');
    var atom = show.atoms[index];
    if (!atom) throw new Error('No clip at ' + index);
    return atom;
  }

  function draftKey(showId) {
    return DRAFT_PREFIX + (showId || 'unknown');
  }

  function fingerprint(input) {
    var show = showOf(input);
    if (!show) throw new Error('No show.');
    var fp = {
      show_id: show.show_id || '',
      chars: clone(show.chars || {}),
      atoms: (show.atoms || []).map(function (atom) {
        var hero = atom && atom.hero;
        return {
          id: atom && atom.id,
          plates: clone(hero && Array.isArray(hero.plates) ? hero.plates : []),
          layout_source: hero && hero.layout_source || '',
          camera: clone(atom && atom.camera || null),
          duration_s: atom ? atom.duration_s : null,
          timing_hold: atom && atom.timing_hold ? clone(atom.timing_hold) : null,
          fx_hooks: clone(atom && atom.fx_hooks || []),
        };
      }),
    };
    if (show.costume_lock !== undefined) fp.costume_lock = clone(show.costume_lock);
    if (show.lock_pack !== undefined) fp.lock_pack = clone(show.lock_pack);
    if (show.duration_target_s !== undefined) fp.duration_target_s = show.duration_target_s;
    if (show.rhythm !== undefined) fp.rhythm = clone(show.rhythm);
    return fp;
  }

  function sameSot(a, b) {
    return JSON.stringify(fingerprint(a)) === JSON.stringify(fingerprint(b));
  }

  // Step 1. Same hero replacement the media card writes onto the open project.
  function applyCharacterPlate(project, index, plate) {
    var atom = atomAt(project, index);
    var layout = atom.hero && atom.hero.layout_source || '';
    var plateId = plate && (plate.plateId || plate.plate) || plate;
    atom.hero = {
      layout_source: (plate && plate.layout_source) || layout,
      plates: [plateId],
    };
    atom.plates_needed = 1;
    return project;
  }

  // Step 5. Per-atom camera preset and nudge, on the same atom.
  function applyAtomCam(project, index, camera) {
    var atom = atomAt(project, index);
    var cur = atom.camera || {};
    var next = {
      preset: camera.preset,
      nudge: clone(camera.nudge || cur.nudge || {}),
    };
    if (camera.intensity != null) next.intensity = camera.intensity;
    else if (cur.intensity != null) next.intensity = cur.intensity;
    atom.camera = next;
    delete atom.timing_hold;
    return project;
  }

  // Step 9. Timing and FX the in-browser bake reads from this show.
  function applyComposeEdit(project, index, patch) {
    var atom = atomAt(project, index);
    if (patch.duration_s != null) {
      atom.duration_s = +(+patch.duration_s).toFixed(4);
      delete atom.timing_hold;
    }
    if (patch.fx_hooks) atom.fx_hooks = clone(patch.fx_hooks);
    return project;
  }

  function serialize(project) {
    if (!project || !project.show) throw new Error('No project to save.');
    return JSON.stringify(project);
  }

  function asPortableProject(parsed, opts) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (global.HMComposeClient && typeof global.HMComposeClient.isCostumeLockPackInput === 'function' && global.HMComposeClient.isCostumeLockPackInput(parsed)) {
      return global.HMComposeClient.normalizeCostumeLockPack(parsed, opts);
    }
    if (!parsed.show || typeof parsed.show !== 'object' || !parsed.show.show_id) return null;
    return clone(parsed);
  }

  function writeDraft(storage, project, scrub) {
    if (!storage || typeof storage.setItem !== 'function') throw new Error('No draft storage.');
    var show = showOf(project);
    if (!show || !show.show_id) throw new Error('No show to draft.');
    var payload = {
      ts: Date.now(),
      show: clone(show),
      scrub: Number.isFinite(+scrub) ? +scrub : 0,
    };
    storage.setItem(draftKey(show.show_id), JSON.stringify(payload));
    return payload;
  }

  function readDraft(storage, showId) {
    if (!storage || typeof storage.getItem !== 'function') return null;
    var raw = null;
    try { raw = storage.getItem(draftKey(showId)); } catch (e) { return null; }
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.show || !parsed.ts) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function applyDraftShow(project, draft) {
    if (!project || !draft || !draft.show) throw new Error('No draft show.');
    var next = clone(project);
    next.show = clone(draft.show);
    return next;
  }

  global.HMMotionSot = {
    DRAFT_PREFIX: DRAFT_PREFIX,
    PIN_KEY: PIN_KEY,
    RECENT_KEY: RECENT_KEY,
    draftKey: draftKey,
    fingerprint: fingerprint,
    sameSot: sameSot,
    applyCharacterPlate: applyCharacterPlate,
    applyAtomCam: applyAtomCam,
    applyComposeEdit: applyComposeEdit,
    serialize: serialize,
    asPortableProject: asPortableProject,
    writeDraft: writeDraft,
    readDraft: readDraft,
    applyDraftShow: applyDraftShow,
  };
})(typeof window !== 'undefined' ? window : globalThis);

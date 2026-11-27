/* HM-UX-02 & HM-UX-04: Direct-manipulation timeline trim helpers, single-key NLE shortcuts,
 * and active-clip missing-asset diagnostic detection. Pure FE module (browser + Node tests). */
(function (root) {
  'use strict';

  var DATA_IMG_RE = /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/i;

  function computeTrimmedDuration(opts) {
    var o = opts || {};
    var startDurationS = Number.isFinite(+o.startDurationS) && +o.startDurationS >= 0.1 ? +o.startDurationS : 0.5;
    var deltaPx = Number.isFinite(+o.deltaPx) ? +o.deltaPx : 0;
    var trackWidthPx = Number.isFinite(+o.trackWidthPx) && +o.trackWidthPx > 0 ? +o.trackWidthPx : 600;
    var totalDurationS = Number.isFinite(+o.totalDurationS) && +o.totalDurationS > 0 ? +o.totalDurationS : 5;
    var step = o.shiftKey ? 0.05 : 0.1;
    var pxPerSec = Math.max(24, trackWidthPx / Math.max(0.5, totalDurationS));
    var raw = startDurationS + deltaPx / pxPerSec;
    var snapped = Math.round(raw / step) * step;
    var next = Math.max(0.1, Math.min(120, +snapped.toFixed(4)));
    var deltaS = +(next - startDurationS).toFixed(4);
    var sign = deltaS >= 0 ? '+' : '';
    return {
      duration_s: next,
      delta_s: deltaS,
      label: next.toFixed(2) + 's · ' + sign + deltaS.toFixed(2) + 's',
    };
  }

  function stepFrameTime(currentTimeS, durationS, direction, fps) {
    var rate = Number.isFinite(+fps) && +fps > 0 ? +fps : 30;
    var dur = Number.isFinite(+durationS) && +durationS > 0 ? +durationS : 0;
    var cur = Number.isFinite(+currentTimeS) ? +currentTimeS : 0;
    var dir = direction < 0 ? -1 : 1;
    var next = cur + dir * (1 / rate);
    return Math.max(0, Math.min(dur, +next.toFixed(4)));
  }

  function resolveNleShortcut(evtLike) {
    var e = evtLike || {};
    if (e.recording || e.modalOpen) return null;
    if (e.ctrlKey || e.metaKey || e.altKey) return null;
    var tag = String(e.targetTagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.isContentEditable) return null;
    var rawKey = String(e.key || '');
    var lower = rawKey.toLowerCase();
    if (lower === 's') return 'split';
    if (rawKey === '[') return 'trim-minus';
    if (rawKey === ']') return 'trim-plus';
    if (rawKey === ',') return 'step-back';
    if (rawKey === '.') return 'step-forward';
    if (lower === 'e') return 'export';
    if (rawKey === '?') return 'help';
    return null;
  }

  function activeAtomIndexAt(atoms, timeS) {
    if (!Array.isArray(atoms) || !atoms.length) return -1;
    var t = Number.isFinite(+timeS) && +timeS > 0 ? +timeS : 0;
    var acc = 0;
    for (var i = 0; i < atoms.length; i++) {
      var dur = Number.isFinite(+atoms[i].duration_s) ? +atoms[i].duration_s : 0.5;
      acc += dur;
      if (t < acc - 1e-6) return i;
    }
    return atoms.length - 1;
  }

  function isResolvedRef(ref, assets, layoutSource) {
    if (!ref || typeof ref !== 'string') return true;
    var clean = ref.trim();
    if (!clean) return true;
    if (DATA_IMG_RE.test(clean)) return true;
    if (assets && typeof assets[clean] === 'string' && DATA_IMG_RE.test(assets[clean])) return true;
    if (clean.indexOf('assets/') === 0 && !(layoutSource && layoutSource.indexOf('imported-html-layout.json') >= 0)) {
      return true;
    }
    return false;
  }

  function toFailedSet(raw) {
    var set = Object.create(null);
    if (!raw) return set;
    var list = Array.isArray(raw) ? raw : (typeof raw.forEach === 'function' ? Array.from(raw) : []);
    for (var i = 0; i < list.length; i++) {
      var k = typeof list[i] === 'string' ? list[i].trim() : '';
      if (k) set[k] = true;
    }
    return set;
  }

  function missingAssetsForAtomIndex(project, idx, opts) {
    var show = project && project.show;
    var atoms = show && Array.isArray(show.atoms) ? show.atoms : [];
    if (idx < 0 || idx >= atoms.length) {
      return { atomIndex: -1, clipLabel: '', missingRefs: [], emptyPlates: [], brokenRefs: [], hasMissing: false };
    }
    var atom = atoms[idx];
    var label = (atom && (atom.label || atom.id)) || ('Clip ' + (idx + 1));
    var layouts = (project && project.layouts) || {};
    var assets = (project && project.assets) || {};
    var failedSet = toFailedSet(opts && opts.failedAssets);
    var missing = [];
    var emptyPlates = [];
    var brokenRefs = [];
    var seen = Object.create(null);

    function addMissing(ref) {
      var trimmed = typeof ref === 'string' ? ref.trim() : '';
      if (!trimmed || Object.prototype.hasOwnProperty.call(seen, trimmed)) return;
      seen[trimmed] = true;
      missing.push(trimmed);
    }

    function check(ref, lsrc) {
      if (!ref || typeof ref !== 'string') return;
      var trimmed = ref.trim();
      if (!trimmed) return;
      if (Object.prototype.hasOwnProperty.call(failedSet, trimmed)) {
        brokenRefs.push(trimmed);
        addMissing(trimmed);
        return;
      }
      if (!isResolvedRef(trimmed, assets, lsrc)) addMissing(trimmed);
    }

    var hero = atom && atom.hero;
    var plates = hero && Array.isArray(hero.plates) ? hero.plates : [];
    var need = atom && Number.isInteger(atom.plates_needed) && atom.plates_needed > 0 ? atom.plates_needed : 1;
    if (!plates.length) {
      var noPlateMsg = 'no plate assigned';
      emptyPlates.push(noPlateMsg);
      addMissing(noPlateMsg);
    } else if (!hero || !hero.layout_source) {
      var noLayoutMsg = 'plate ' + plates[0] + ' (missing layout)';
      emptyPlates.push(noLayoutMsg);
      addMissing(noLayoutMsg);
    } else {
      var lsrc = hero.layout_source;
      var slash = lsrc.lastIndexOf('/');
      var dir = slash >= 0 ? lsrc.slice(0, slash + 1) : '';
      var map = layouts[lsrc] || null;
      if (!map || typeof map !== 'object') {
        var missingMapMsg = 'layout ' + lsrc + ' (missing)';
        emptyPlates.push(missingMapMsg);
        addMissing(missingMapMsg);
      } else {
        for (var pi = 0; pi < plates.length; pi++) {
          var pid = plates[pi];
          var entry = map[pid];
          if (!entry) {
            var missEntryMsg = 'plate ' + pid + ' (missing from layout)';
            emptyPlates.push(missEntryMsg);
            addMissing(missEntryMsg);
            continue;
          }
          if (entry.pendingMotion) continue;
          var hasAnyArt = false;
          if (entry.strip && entry.strip.src) {
            hasAnyArt = true;
            var sRef = DATA_IMG_RE.test(entry.strip.src) || entry.strip.src.indexOf('/') === 0 ? entry.strip.src : dir + entry.strip.src;
            check(sRef, lsrc);
          }
          if (entry.full) {
            hasAnyArt = true;
            var fRef = DATA_IMG_RE.test(entry.full) || entry.full.indexOf('/') === 0 ? entry.full : dir + entry.full;
            check(fRef, lsrc);
          }
          if (Array.isArray(entry.parts) && entry.parts.length) {
            for (var j = 0; j < entry.parts.length; j++) {
              var part = entry.parts[j];
              if (part && part.src) {
                hasAnyArt = true;
                var pRef = DATA_IMG_RE.test(part.src) || part.src.indexOf('/') === 0 ? part.src : dir + part.src;
                check(pRef, lsrc);
              }
            }
          }
          if (!hasAnyArt) {
            var emptyEntryMsg = 'plate ' + pid + ' (empty)';
            emptyPlates.push(emptyEntryMsg);
            addMissing(emptyEntryMsg);
          }
        }
        if (plates.length < need) {
          var shortMsg = 'missing ' + (need - plates.length) + ' of ' + need + ' plate(s)';
          emptyPlates.push(shortMsg);
          addMissing(shortMsg);
        }
      }
    }
    if (atom && atom.background && atom.background.src) {
      check(atom.background.src, '');
    }
    if (atom && Array.isArray(atom.micro_frames)) {
      for (var mi = 0; mi < atom.micro_frames.length; mi++) {
        var mf = atom.micro_frames[mi];
        if (mf && mf.src) check(mf.src, '');
      }
    }
    return {
      atomIndex: idx,
      clipLabel: label,
      missingRefs: missing,
      emptyPlates: emptyPlates,
      brokenRefs: brokenRefs,
      hasMissing: missing.length > 0,
    };
  }

  function missingAssetsForActiveClip(project, timeS, opts) {
    var show = project && project.show;
    var atoms = show && Array.isArray(show.atoms) ? show.atoms : [];
    if (!atoms.length) return { atomIndex: -1, clipLabel: '', missingRefs: [], emptyPlates: [], brokenRefs: [], hasMissing: false };
    var idx = activeAtomIndexAt(atoms, timeS);
    return missingAssetsForAtomIndex(project, idx, opts);
  }

  function auditProjectMissingAssets(project, opts) {
    var show = project && project.show;
    var atoms = show && Array.isArray(show.atoms) ? show.atoms : [];
    var assets = (project && project.assets) || {};
    var failedSet = toFailedSet(opts && opts.failedAssets);
    var missingClips = [];
    var allMissing = [];
    var seen = Object.create(null);

    function addGlobal(ref) {
      var trimmed = typeof ref === 'string' ? ref.trim() : '';
      if (!trimmed || Object.prototype.hasOwnProperty.call(seen, trimmed)) return;
      seen[trimmed] = true;
      allMissing.push(trimmed);
    }

    for (var i = 0; i < atoms.length; i++) {
      var info = missingAssetsForAtomIndex(project, i, opts);
      if (info.hasMissing) {
        missingClips.push(Object.assign({ atomId: (atoms[i] && atoms[i].id) || ('clip-' + (i + 1)) }, info));
        for (var j = 0; j < info.missingRefs.length; j++) addGlobal(info.missingRefs[j]);
      }
    }

    function checkShowRef(ref) {
      if (!ref || typeof ref !== 'string') return;
      var trimmed = ref.trim();
      if (!trimmed) return;
      if (Object.prototype.hasOwnProperty.call(failedSet, trimmed) || !isResolvedRef(trimmed, assets, '')) {
        addGlobal(trimmed);
      }
    }

    var bg = (show && show.bg) || {};
    if (bg.base) checkShowRef(bg.base);
    if (bg.swap) checkShowRef(bg.swap);
    if (Array.isArray(bg.locations)) {
      for (var bi = 0; bi < bg.locations.length; bi++) {
        if (bg.locations[bi] && bg.locations[bi].src) checkShowRef(bg.locations[bi].src);
      }
    }
    var fgProps = show && show.fg && Array.isArray(show.fg.props) ? show.fg.props : [];
    for (var fi = 0; fi < fgProps.length; fi++) {
      if (fgProps[fi] && fgProps[fi].src) checkShowRef(fgProps[fi].src);
      if (fgProps[fi] && fgProps[fi].effect && fgProps[fi].effect.broken_src) checkShowRef(fgProps[fi].effect.broken_src);
    }

    return {
      hasMissing: allMissing.length > 0,
      missingClips: missingClips,
      missingRefs: allMissing,
    };
  }

  var api = {
    computeTrimmedDuration: computeTrimmedDuration,
    stepFrameTime: stepFrameTime,
    resolveNleShortcut: resolveNleShortcut,
    activeAtomIndexAt: activeAtomIndexAt,
    missingAssetsForActiveClip: missingAssetsForActiveClip,
    auditProjectMissingAssets: auditProjectMissingAssets,
  };

  root.HMUxHelpers = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

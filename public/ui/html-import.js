/* Issue #239 & #238 — FE-only AI motion HTML parser, lossless embed helper, and missing-asset relink.
 * Issue #289 — reopened motion HTML keeps authored timing, camera, FX, and captions.
 * A missing one of those fields fails closed. It is not filled with a stand-in edit. */
(function (root) {
  'use strict';

  var sec = root.HMImportSecurity || (typeof require === 'function' ? require('./import-security.js') : null);
  var DATA_IMG_RE = /^data:image\/(?:png|jpeg|webp|gif);base64,/i;
  var INLINE_DATA_IMG_RE = /data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+/gi;
  var LAYOUT_KEY = 'imported-html-layout.json';

  var FORMAT_HINT_SNIPPET = [
    'Embed inside your AI-generated motion .html:',
    '<script id="hm-project-data" type="application/json">',
    '{',
    '  "version": 1,',
    '  "show": {',
    '    "show_id": "ai-motion-fight",',
    '    "title": "AI Motion Fight",',
    '    "atoms": [',
    '      { "id": "beat-01", "label": "Beat 1", "kind": "duo", "duration_s": 0.75, "plates_needed": 1, "pose_mode": "hero", "hero": { "layout_source": "imported-html-layout.json", "plates": ["P01"] }, "camera": { "preset": "static_hold" }, "fx_hooks": [] }',
    '    ]',
    '  },',
    '  "layouts": { "imported-html-layout.json": { "P01": { "full": "plates/P01.png" } } },',
    '  "media": [{ "id": "m1", "name": "P01", "src": "plates/P01.png", "layoutSource": "imported-html-layout.json", "plateId": "P01" }],',
    '  "assets": { "plates/P01.png": "data:image/png;base64,..." }',
    '}',
    '</script>',
  ].join('\n');

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function trimStr(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function basename(p) {
    var s = trimStr(p).replace(/\\/g, '/');
    var idx = s.lastIndexOf('/');
    return idx >= 0 ? s.slice(idx + 1) : s;
  }

  function normalizeShowId(raw, fallbackFile) {
    var base = trimStr(raw);
    if (!base && fallbackFile) {
      base = basename(fallbackFile).replace(/\.[^.]+$/, '');
    }
    var slug = base
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^[^a-z0-9]+/, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || 'imported-motion-html';
  }

  function escapeJsonForScript(jsonText) {
    if (sec && typeof sec.escapeScriptJson === 'function') return sec.escapeScriptJson(jsonText);
    return String(jsonText || '')
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }

  function embedProjectScript(project, opts) {
    if (!project || !project.show || typeof project.show !== 'object') {
      throw new Error('Project with show data is required.');
    }
    var options = opts || {};
    var payload = {
      version: Number.isInteger(project.version) ? project.version : 1,
      show: clone(project.show),
      layouts: clone(project.layouts || {}),
      media: Array.isArray(project.media) ? clone(project.media) : [],
    };
    if (options.omitAssets) {
      payload.assets_ref = 'DATA.assets';
    } else {
      payload.assets = Object.assign({}, project.assets || {});
    }
    return '<script id="hm-project-data" type="application/json">' + escapeJsonForScript(JSON.stringify(payload)) + '</script>';
  }

  function extractBalancedJson(text, openBraceIndex) {
    if (typeof text !== 'string' || openBraceIndex < 0 || text[openBraceIndex] !== '{') return null;
    var maxChars = sec && sec.LIMITS ? sec.LIMITS.MAX_SCAN_CHARS : 25 * 1024 * 1024;
    var maxDepth = sec && sec.LIMITS ? sec.LIMITS.MAX_JSON_DEPTH : 32;
    var endCap = Math.min(text.length, openBraceIndex + maxChars);
    var depth = 0;
    var inString = false;
    var escaped = false;
    for (var i = openBraceIndex; i < endCap; i++) {
      var ch = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth++;
        if (depth > maxDepth + 8) return null;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) return text.slice(openBraceIndex, i + 1);
      }
    }
    return null;
  }

  function parseJsonSafe(rawText) {
    return sec && typeof sec.safeParseJson === 'function' ? sec.safeParseJson(rawText) : JSON.parse(rawText);
  }

  function extractConstData(htmlText) {
    if (typeof htmlText !== 'string' || !htmlText) return null;
    var re = /\b(?:const|let|var)\s+DATA\s*=\s*\{/g;
    var match;
    var firstParsed = null;
    while ((match = re.exec(htmlText)) !== null) {
      var braceIdx = match.index + match[0].length - 1;
      var rawObj = extractBalancedJson(htmlText, braceIdx);
      if (!rawObj) continue;
      try {
        var parsed = parseJsonSafe(rawObj);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          if (parsed.timeline || parsed.layout || parsed.assets || parsed.show) return parsed;
          if (!firstParsed) firstParsed = parsed;
        }
      } catch (e) {}
    }
    return firstParsed;
  }

  function extractJsonScripts(htmlText) {
    if (typeof htmlText !== 'string' || !htmlText) return [];
    var out = [];
    var re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    var match;
    while ((match = re.exec(htmlText)) !== null) {
      var attrs = match[1] || '';
      var idMatch = /\bid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
      var typeMatch = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
      var id = idMatch ? (idMatch[1] || idMatch[2] || idMatch[3] || '') : '';
      var type = typeMatch ? (typeMatch[1] || typeMatch[2] || typeMatch[3] || '').toLowerCase() : '';
      out.push({ id: id, type: type, content: match[2] || '' });
    }
    return out;
  }

  function mergeAssets(baseAssets, primaryAssets, localFiles) {
    var out = {};
    [baseAssets, primaryAssets, localFiles].forEach(function (src) {
      if (!src || typeof src !== 'object') return;
      var keys = Object.keys(src);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (sec && typeof sec.isDangerousKey === 'function' && sec.isDangerousKey(k)) continue;
        var cleanKey = sec && typeof sec.sanitizeAssetKey === 'function' ? sec.sanitizeAssetKey(k) : k;
        var val = src[k];
        if (typeof val === 'string' && val) {
          if (sec && typeof sec.assertSafeAssetUri === 'function') sec.assertSafeAssetUri(val, cleanKey);
          out[cleanKey] = val;
        }
      }
    });
    if (sec && typeof sec.assertProjectAssetBudget === 'function') {
      sec.assertProjectAssetBudget(out);
    }
    return out;
  }

  function uniqueAssetIds(ids) {
    var seen = Object.create(null);
    return (ids || []).map(function (raw, idx) {
      var base = trimStr(raw) || ('beat-' + String(idx + 1).padStart(2, '0'));
      var candidate = base;
      var n = 2;
      while (Object.prototype.hasOwnProperty.call(seen, candidate)) {
        candidate = base + '-' + n;
        n++;
      }
      seen[candidate] = true;
      return candidate;
    });
  }

  function findPlateForAtom(plates, tlAtom, atomIndex) {
    if (!Array.isArray(plates) || !plates.length) return null;
    var a0 = Number(tlAtom && tlAtom.t0);
    var a1 = Number(tlAtom && tlAtom.t1);
    if (Number.isFinite(a0) && Number.isFinite(a1) && a1 > a0) {
      var best = null;
      var bestOverlap = 0;
      for (var i = 0; i < plates.length; i++) {
        var pl = plates[i];
        if (!pl) continue;
        var p0 = Number(pl.t0);
        var p1 = Number(pl.t1);
        if (!Number.isFinite(p0) || !Number.isFinite(p1)) continue;
        var overlap = Math.min(a1, p1) - Math.max(a0, p0);
        if (overlap > bestOverlap + 1e-6) {
          bestOverlap = overlap;
          best = pl;
        }
      }
      if (best) return best;
    }
    return plates[atomIndex] || plates[0] || null;
  }

  var CLOSED_IMPORT = /nesting depth|Unsafe asset|blocked|decompression|memory budget|duration_s|missing a timing|missing a camera|missing FX|FX hook is missing/i;

  function cameraIsAuthored(cam) {
    if (!cam || typeof cam !== 'object') return false;
    if (trimStr(cam.preset)) return true;
    return Array.isArray(cam.segments) && cam.segments.length > 0 && cam.segments.every(function (s) {
      return s && trimStr(s.preset) && Number.isFinite(+s.dur_s) && +s.dur_s > 0;
    });
  }

  function authoringGap(show) {
    var atoms = show && Array.isArray(show.atoms) ? show.atoms : null;
    if (!atoms || !atoms.length) throw new Error('Motion HTML is missing clip timing.');
    for (var i = 0; i < atoms.length; i++) {
      var a = atoms[i];
      var id = (a && trimStr(a.id)) || ('clip ' + (i + 1));
      if (!a || !Number.isFinite(+a.duration_s) || +a.duration_s < 0.1) {
        throw new Error('Clip ' + id + ' is missing a timing duration.');
      }
      if (!cameraIsAuthored(a.camera)) throw new Error('Clip ' + id + ' is missing a camera setting.');
      if (!Array.isArray(a.fx_hooks)) throw new Error('Clip ' + id + ' is missing FX settings.');
    }
  }

  function segmentSpan(seg) {
    var d = Number(seg && seg.t1) - Number(seg && seg.t0);
    if (!Number.isFinite(d) || d <= 0) throw new Error('Clip camera segment is missing a timing duration.');
    return +d.toFixed(4);
  }

  function cameraFieldsFromSegment(seg) {
    var preset = trimStr(seg && seg.preset);
    if (!preset) throw new Error('Clip is missing a camera setting.');
    var cam = { preset: preset };
    if (seg.nudge && typeof seg.nudge === 'object') cam.nudge = clone(seg.nudge);
    if (seg.intensity != null && Number.isFinite(+seg.intensity)) cam.intensity = +seg.intensity;
    if (trimStr(seg.ease)) cam.ease = trimStr(seg.ease);
    if (seg.snap_zoom === true) cam.snap_zoom = true;
    if (trimStr(seg.micro_move)) cam.micro_move = trimStr(seg.micro_move);
    if (seg.motion_blur !== undefined && seg.motion_blur !== false) cam.motion_blur = clone(seg.motion_blur);
    if (seg.curves && typeof seg.curves === 'object') cam.params = clone(seg.curves);
    else if (seg.params && typeof seg.params === 'object') cam.params = clone(seg.params);
    return cam;
  }

  function cameraFromTimelineAtom(tlAtom) {
    var segs = Array.isArray(tlAtom && tlAtom.cam) ? tlAtom.cam : null;
    if (!segs || !segs.length) return null;
    if (segs.length === 1) return cameraFieldsFromSegment(segs[0] || {});
    var segments = segs.map(function (s) {
      var fields = cameraFieldsFromSegment(s || {});
      fields.dur_s = segmentSpan(s);
      return fields;
    });
    return { preset: segments[0].preset, segments: segments };
  }

  function fxHooksFromTimelineAtom(tlAtom) {
    if (!tlAtom || !Array.isArray(tlAtom.fx_hooks)) return null;
    return tlAtom.fx_hooks.map(function (hk) {
      if (typeof hk === 'string' || !hk || typeof hk !== 'object' || !trimStr(hk.type)) {
        throw new Error('Clip FX hook is missing its settings.');
      }
      var next = { type: trimStr(hk.type) };
      if (hk.t_rel != null) {
        if (!Number.isFinite(+hk.t_rel)) throw new Error('Clip FX hook is missing its settings.');
        next.t_rel = +hk.t_rel;
      }
      if (hk.t_rel_end != null) {
        if (!Number.isFinite(+hk.t_rel_end)) throw new Error('Clip FX hook is missing its settings.');
        next.t_rel_end = +hk.t_rel_end;
      }
      if (trimStr(hk.source)) next.source = trimStr(hk.source);
      if (hk.muted === true) next.muted = true;
      if (hk.params && typeof hk.params === 'object' && !Array.isArray(hk.params)) next.params = clone(hk.params);
      return next;
    });
  }

  function timingHoldFromTimelineAtom(tlAtom) {
    var hold = tlAtom && tlAtom.timing_hold;
    if (!hold || typeof hold !== 'object' || !trimStr(hold.pack)) return null;
    var next = { pack: trimStr(hold.pack) };
    if (trimStr(hold.kind)) next.kind = trimStr(hold.kind);
    if (hold.soft_cam === true || hold.soft_cam === false) next.soft_cam = hold.soft_cam === true;
    if (trimStr(hold.preset)) next.preset = trimStr(hold.preset);
    return next;
  }

  function reconstructProjectFromData(data, fileName, localFiles) {
    if (!data || typeof data !== 'object' || !data.timeline || !Array.isArray(data.timeline.atoms)) {
      throw new Error('DATA does not contain timeline atoms.');
    }
    var tl = data.timeline;
    var tlAtoms = tl.atoms;
    if (!tlAtoms.length) throw new Error('DATA timeline contains no clips.');
    var dataLayout = data.layout && typeof data.layout === 'object' ? data.layout : {};
    var assets = mergeAssets(null, data.assets, localFiles);
    var showId = normalizeShowId(data.show_id || tl.show_id, fileName);
    var layoutMap = {};
    var media = [];
    var mediaSeen = Object.create(null);
    var atomIds = uniqueAssetIds(tlAtoms.map(function (a) { return a && a.id; }));

    function registerMediaEntry(plateId, entry) {
      if (!entry) return;
      var src = trimStr(entry.strip && entry.strip.src) || trimStr(entry.full) || trimStr(entry.parts && entry.parts[0] && entry.parts[0].src);
      if (!src || Object.prototype.hasOwnProperty.call(mediaSeen, plateId)) return;
      mediaSeen[plateId] = true;
      var item = {
        id: 'm-' + (media.length + 1),
        name: plateId,
        src: src,
        layoutSource: LAYOUT_KEY,
        plateId: plateId,
      };
      if (entry.strip) {
        item.strip = {
          adapter: 'hm-sg01-body-strip',
          version: 1,
          status: 'playable',
          geometry: clone(entry.strip.geometry || {}),
          cadence: clone(entry.strip.cadence || {}),
          policy: clone(entry.strip.policy || {}),
          metadata: clone(entry.strip.metadata || {}),
          warnings: [],
        };
      }
      media.push(item);
    }

    var atoms = tlAtoms.map(function (a, i) {
      var plateRef = findPlateForAtom(tl.plates, a, i);
      var rawPid = plateRef && plateRef.id ? String(plateRef.id) : '';
      var rawEntry = (rawPid && dataLayout[rawPid]) ? dataLayout[rawPid] : null;
      var prefName = trimStr(rawEntry && rawEntry.source_plate) || rawPid || ('P' + String(i + 1).padStart(2, '0'));
      var plateId = prefName;
      if (rawEntry) {
        var existing = layoutMap[plateId];
        var nextLayoutEntry = {};
        if (rawEntry.strip) nextLayoutEntry.strip = clone(rawEntry.strip);
        if (rawEntry.full) nextLayoutEntry.full = rawEntry.full;
        if (Array.isArray(rawEntry.parts) && rawEntry.parts.length) nextLayoutEntry.parts = clone(rawEntry.parts);
        if (Array.isArray(rawEntry.shadows) && rawEntry.shadows.length) nextLayoutEntry.shadows = clone(rawEntry.shadows);
        if (rawEntry.floor != null) nextLayoutEntry.floor = rawEntry.floor;
        if (rawEntry.bg) nextLayoutEntry.bg = rawEntry.bg;
        if (rawEntry.bg_zoom != null) nextLayoutEntry.bg_zoom = rawEntry.bg_zoom;
        if (rawEntry.kind) nextLayoutEntry.kind = rawEntry.kind;
        if (rawEntry.background && typeof rawEntry.background === 'object') nextLayoutEntry.background = clone(rawEntry.background);
        if (existing && JSON.stringify(existing) !== JSON.stringify(nextLayoutEntry)) {
          plateId = rawPid && !layoutMap[rawPid] ? rawPid : (prefName + '_' + (i + 1));
        }
        if (!layoutMap[plateId]) {
          layoutMap[plateId] = nextLayoutEntry;
          registerMediaEntry(plateId, nextLayoutEntry);
        }
      }
      var dur = Number(a && a.t1) - Number(a && a.t0);
      if (!Number.isFinite(dur) || dur < 0.1) {
        throw new Error('Clip ' + atomIds[i] + ' is missing a timing duration.');
      }
      var cleanDur = +dur.toFixed(4);
      var cam = cameraFromTimelineAtom(a);
      if (!cam) throw new Error('Clip ' + atomIds[i] + ' is missing a camera setting.');
      var hooks = fxHooksFromTimelineAtom(a);
      if (!hooks) throw new Error('Clip ' + atomIds[i] + ' is missing FX settings.');
      var atomObj = {
        id: atomIds[i],
        label: trimStr(a && a.label) || ('Beat ' + (i + 1)),
        kind: trimStr(a && a.kind) || (rawEntry && rawEntry.kind) || 'duo',
        duration_s: cleanDur,
        plates_needed: 1,
        pose_mode: 'hero',
        motion: {
          family: trimStr(a && a.family) || 'fight',
          beat_class: trimStr(a && a.beat) || 'clash',
        },
        hero: {
          layout_source: LAYOUT_KEY,
          plates: rawEntry ? [plateId] : [],
        },
        camera: cam,
        fx_hooks: hooks,
      };
      if (a && a.caption) atomObj.caption = String(a.caption);
      if (a && a.caption_style) atomObj.caption_style = String(a.caption_style);
      var hold = timingHoldFromTimelineAtom(a);
      if (hold) atomObj.timing_hold = hold;
      if (a && a.cut) atomObj.cut = clone(a.cut);
      if (a && a.beat_id) atomObj.beat_id = String(a.beat_id);
      if (Array.isArray(a && a.micro_frames) && a.micro_frames.length) {
        atomObj.micro_frames = clone(a.micro_frames);
      } else if (rawEntry && Array.isArray(rawEntry.micro_frames) && rawEntry.micro_frames.length) {
        atomObj.micro_frames = clone(rawEntry.micro_frames);
      }
      if (a && a.mood) atomObj.mood = clone(a.mood);
      if (rawEntry && rawEntry.strip && Number.isFinite(+rawEntry.strip.clip_offset_s)) {
        atomObj.strip_offset_s = +rawEntry.strip.clip_offset_s;
      } else if (a && a.strip && Number.isFinite(+a.strip.clip_offset_s)) {
        atomObj.strip_offset_s = +a.strip.clip_offset_s;
      }
      if (rawEntry && rawEntry.background && rawEntry.background.src) {
        atomObj.background = clone(rawEntry.background);
      }
      return atomObj;
    });

    // Include remaining layout plates not referenced on the timeline so library remains complete.
    var layoutKeys = Object.keys(dataLayout);
    for (var li = 0; li < layoutKeys.length; li++) {
      var k = layoutKeys[li];
      var le = dataLayout[k];
      if (!le) continue;
      var pidName = trimStr(le.source_plate) || k;
      if (!layoutMap[pidName]) {
        var extraEntry = {};
        if (le.full) extraEntry.full = le.full;
        if (le.strip) extraEntry.strip = clone(le.strip);
        if (Array.isArray(le.parts) && le.parts.length) extraEntry.parts = clone(le.parts);
        if (Array.isArray(le.shadows) && le.shadows.length) extraEntry.shadows = clone(le.shadows);
        if (le.floor != null) extraEntry.floor = le.floor;
        if (le.kind) extraEntry.kind = le.kind;
        if (extraEntry.strip || extraEntry.full || (extraEntry.parts && extraEntry.parts.length)) {
          layoutMap[pidName] = extraEntry;
          registerMediaEntry(pidName, extraEntry);
        }
      }
    }

    var overlays = Array.isArray(tl.overlays)
      ? clone(tl.overlays.filter(function (o) { return o && !o.editor_caption; }))
      : [];
    var bgCopy = tl.bg ? clone(tl.bg) : {};
    if (!Object.prototype.hasOwnProperty.call(bgCopy, 'locations')) {
      if (bgCopy.swap == null) delete bgCopy.swap;
      if (bgCopy.swap_t == null) delete bgCopy.swap_t;
      if (bgCopy.base === undefined) delete bgCopy.base;
    }
    var show = {
      show_id: showId,
      title: trimStr(tl.title) || showId,
      atoms: atoms,
      bg: bgCopy,
      overlays: overlays,
    };
    if (tl.chars) show.chars = clone(tl.chars);
    if (tl.fg) show.fg = clone(tl.fg);
    if (tl.fx_profile) show.fx_profile = tl.fx_profile;
    if (tl.mood) show.mood = clone(tl.mood);

    var layouts = {};
    layouts[LAYOUT_KEY] = layoutMap;
    return {
      version: 1,
      show: show,
      layouts: layouts,
      media: media,
      assets: assets,
    };
  }

  function hydrateShowProject(rawShow, fallbackFile, assets) {
    var show = clone(rawShow);
    show.show_id = normalizeShowId(show.show_id, fallbackFile);
    show.title = trimStr(show.title) || show.show_id;
    show.bg = show.bg && typeof show.bg === 'object' ? show.bg : {};
    show.overlays = Array.isArray(show.overlays) ? show.overlays : [];
    var layouts = {};
    var media = [];
    var layoutMap = {};
    var assetKeys = Object.keys(assets || {});
    for (var i = 0; i < (show.atoms || []).length; i++) {
      var a = show.atoms[i];
      if (!a) continue;
      if (!a.id) a.id = 'beat-' + String(i + 1).padStart(2, '0');
      if (!Number.isFinite(+a.duration_s) || +a.duration_s < 0.1) {
        throw new Error('Clip ' + (a.id || ('clip ' + (i + 1))) + ' is missing a timing duration.');
      }
      if (!Number.isInteger(a.plates_needed) || a.plates_needed < 1) a.plates_needed = 1;
      a.pose_mode = 'hero';
      if (!a.hero || typeof a.hero !== 'object') {
        var pid = 'P' + String(i + 1).padStart(2, '0');
        a.hero = { layout_source: LAYOUT_KEY, plates: [pid] };
      }
      if (!a.hero.layout_source) a.hero.layout_source = LAYOUT_KEY;
      if (!Array.isArray(a.hero.plates)) a.hero.plates = [];
      var lsrc = a.hero.layout_source;
      if (!layouts[lsrc]) layouts[lsrc] = {};
      if (a.hero.plates.length && !layouts[lsrc][a.hero.plates[0]]) {
        var guess = assetKeys[i] || '';
        if (guess) {
          layouts[lsrc][a.hero.plates[0]] = { full: guess };
          media.push({ id: 'm-' + (media.length + 1), name: a.hero.plates[0], src: guess, layoutSource: lsrc, plateId: a.hero.plates[0] });
        }
      }
    }
    if (!Object.keys(layouts).length) layouts[LAYOUT_KEY] = layoutMap;
    return {
      version: 1,
      show: show,
      layouts: layouts,
      media: media,
      assets: assets || {},
    };
  }

  function extractInlineDataImages(htmlText, fileName, localFiles) {
    if (typeof htmlText !== 'string' || !htmlText) return null;
    var matches = htmlText.match(INLINE_DATA_IMG_RE) || [];
    var seen = Object.create(null);
    var unique = [];
    for (var i = 0; i < matches.length; i++) {
      var uri = matches[i];
      if (!uri || Object.prototype.hasOwnProperty.call(seen, uri)) continue;
      seen[uri] = true;
      unique.push(uri);
      if (unique.length >= 120) break;
    }
    if (!unique.length) return null;
    var showId = normalizeShowId('', fileName);
    var layoutMap = {};
    var media = [];
    var assets = mergeAssets(null, null, localFiles);
    var atoms = unique.map(function (uri, idx) {
      var pid = 'P' + String(idx + 1).padStart(2, '0');
      var assetKey = 'html-inline/' + pid + '.png';
      assets[assetKey] = uri;
      layoutMap[pid] = { full: assetKey };
      media.push({
        id: 'm-' + (idx + 1),
        name: pid,
        src: assetKey,
        layoutSource: LAYOUT_KEY,
        plateId: pid,
      });
      return {
        id: 'beat-' + String(idx + 1).padStart(2, '0'),
        label: 'Shot ' + (idx + 1),
        kind: 'duo',
        duration_s: 0.75,
        plates_needed: 1,
        pose_mode: 'hero',
        motion: { family: 'fight', beat_class: 'clash' },
        hero: { layout_source: LAYOUT_KEY, plates: [pid] },
        camera: { preset: 'static_hold' },
        fx_hooks: [],
      };
    });
    var layouts = {};
    layouts[LAYOUT_KEY] = layoutMap;
    return {
      version: 1,
      show: {
        show_id: showId,
        title: (fileName ? basename(fileName).replace(/\.[^.]+$/, '') : '') || 'Extracted AI HTML',
        atoms: atoms,
        bg: {},
        overlays: [],
      },
      layouts: layouts,
      media: media,
      assets: assets,
    };
  }

  function parseMotionHtml(htmlText, opts) {
    if (typeof htmlText !== 'string' || !htmlText.trim()) {
      var emptyErr = new Error('HTML file is empty.');
      emptyErr.code = 'UNSUPPORTED_HTML';
      emptyErr.formatHint = FORMAT_HINT_SNIPPET;
      throw emptyErr;
    }
    var options = opts || {};
    var fileName = trimStr(options.fileName);
    var localFiles = options.localFiles || null;
    var scripts = extractJsonScripts(htmlText);
    var dataObj = null;
    var getDataAssets = function () {
      if (!dataObj) dataObj = extractConstData(htmlText);
      return dataObj && dataObj.assets ? dataObj.assets : null;
    };

    // 1. Lossless <script id="hm-project-data" type="application/json">
    for (var i = 0; i < scripts.length; i++) {
      if (scripts[i].id === 'hm-project-data') {
        try {
          var embedded = parseJsonSafe(scripts[i].content);
          if (embedded && typeof embedded === 'object' && embedded.show && Array.isArray(embedded.show.atoms)) {
            var p1 = clone(embedded);
            var baseAssets1 = p1.assets_ref === 'DATA.assets' || !p1.assets || !Object.keys(p1.assets).length ? getDataAssets() : null;
            delete p1.assets_ref;
            p1.assets = mergeAssets(baseAssets1, p1.assets, localFiles);
            p1.layouts = p1.layouts || {};
            p1.media = Array.isArray(p1.media) ? p1.media : [];
            authoringGap(p1.show);
            return { kind: 'hm-project-data', project: sec ? sec.sanitizeProjectBounds(p1) : p1, warnings: [] };
          }
        } catch (e) {
          if (e && CLOSED_IMPORT.test(e.message)) throw e;
        }
      }
    }

    // 2. Any <script type="application/json"> matching an HTML Motion project or show
    for (var j = 0; j < scripts.length; j++) {
      var sc = scripts[j];
      if (sc.type && sc.type !== 'application/json') continue;
      if (!sc.type && sc.id !== 'hm-project-data') continue;
      try {
        var json = parseJsonSafe(sc.content);
        if (json && typeof json === 'object' && !Array.isArray(json)) {
          if (json.show && typeof json.show === 'object' && Array.isArray(json.show.atoms)) {
            var p2 = clone(json);
            var baseAssets2 = p2.assets_ref === 'DATA.assets' || !p2.assets || !Object.keys(p2.assets).length ? getDataAssets() : null;
            delete p2.assets_ref;
            p2.assets = mergeAssets(baseAssets2, p2.assets, localFiles);
            p2.layouts = p2.layouts || {};
            p2.media = Array.isArray(p2.media) ? p2.media : [];
            authoringGap(p2.show);
            return { kind: 'json-script', project: sec ? sec.sanitizeProjectBounds(p2) : p2, warnings: [] };
          }
          if (json.show_id && Array.isArray(json.atoms)) {
            var mergedAssets = mergeAssets(getDataAssets(), json.assets, localFiles);
            var hydrated = hydrateShowProject(json, fileName, mergedAssets);
            return {
              kind: 'json-script',
              project: sec ? sec.sanitizeProjectBounds(hydrated) : hydrated,
              warnings: ['Imported show JSON embedded in HTML.'],
            };
          }
        }
      } catch (e) {
        if (e && CLOSED_IMPORT.test(e.message)) throw e;
      }
    }

    // 3. Legacy standalone HTML Motion `const DATA = {...};`
    if (!dataObj) dataObj = extractConstData(htmlText);
    if (dataObj && dataObj.timeline && Array.isArray(dataObj.timeline.atoms) && dataObj.timeline.atoms.length) {
      var recon = reconstructProjectFromData(dataObj, fileName, localFiles);
      return {
        kind: 'legacy-data',
        project: sec ? sec.sanitizeProjectBounds(recon) : recon,
        warnings: ['Reconstructed editable timeline from standalone HTML DATA. Save or re-export HTML to store full project metadata.'],
      };
    }

    // Reject active SVG/HTML/JS data URI payloads before raw image fallback
    var blockedSchemes = sec && typeof sec.detectBlockedUriSchemes === 'function' ? sec.detectBlockedUriSchemes(htmlText) : [];

    // 4. Generic AI-generated HTML containing inline data:image/* assets
    var rawImagesProject = extractInlineDataImages(htmlText, fileName, localFiles);
    if (rawImagesProject) {
      var rawWarn = [
        'Extracted ' +
          rawImagesProject.show.atoms.length +
          ' inline image(s) from raw HTML into sequential 0.75s clips.',
      ];
      if (blockedSchemes.length) {
        rawWarn.push('Ignored unsafe URI scheme(s): ' + blockedSchemes.join(', ') + '.');
      }
      return {
        kind: 'raw-html-images',
        project: sec ? sec.sanitizeProjectBounds(rawImagesProject) : rawImagesProject,
        warnings: rawWarn,
      };
    }

    if (blockedSchemes.length) {
      var secErr = new Error(
        'Blocked unsafe HTML URI scheme (' + blockedSchemes.join(', ') + '). Only embedded PNG, JPG, WebP, or GIF images are allowed.'
      );
      secErr.code = 'BLOCKED_URI_SCHEME';
      secErr.formatHint = FORMAT_HINT_SNIPPET;
      throw secErr;
    }

    // 5. Fail closed with copyable format hint
    var err = new Error('This HTML file does not contain editable HTML Motion project data or embedded images. Current project kept unchanged.');
    err.code = 'UNSUPPORTED_HTML';
    err.formatHint = FORMAT_HINT_SNIPPET;
    throw err;
  }

  function fallbackMissingRefs(project) {
    var p = project || {};
    var show = p.show || {};
    var assets = p.assets || {};
    var layouts = p.layouts || {};
    var refs = [];
    var seen = Object.create(null);

    function checkRef(ref) {
      var clean = trimStr(ref);
      if (!clean || DATA_IMG_RE.test(clean) || Object.prototype.hasOwnProperty.call(seen, clean)) return;
      seen[clean] = true;
      var resolved = typeof assets[clean] === 'string' && DATA_IMG_RE.test(assets[clean]);
      if (!resolved) refs.push(clean);
    }

    (p.media || []).forEach(function (m) {
      if (m && !m.pendingMotion && m.src) checkRef(m.src);
    });
    Object.keys(layouts).forEach(function (lk) {
      var lObj = layouts[lk] || {};
      var slash = lk.lastIndexOf('/');
      var dir = slash >= 0 ? lk.slice(0, slash + 1) : '';
      Object.keys(lObj).forEach(function (pk) {
        var entry = lObj[pk];
        if (!entry || entry.pendingMotion) return;
        if (entry.strip && entry.strip.src) checkRef(DATA_IMG_RE.test(entry.strip.src) || entry.strip.src.indexOf('/') === 0 ? entry.strip.src : dir + entry.strip.src);
        if (entry.full) checkRef(DATA_IMG_RE.test(entry.full) || entry.full.indexOf('/') === 0 ? entry.full : dir + entry.full);
        (entry.parts || []).forEach(function (part) {
          if (part && part.src) checkRef(DATA_IMG_RE.test(part.src) || part.src.indexOf('/') === 0 ? part.src : dir + part.src);
        });
      });
    });
    var bg = show.bg || {};
    if (bg.base) checkRef(bg.base);
    if (bg.swap) checkRef(bg.swap);
    (bg.locations || []).forEach(function (loc) {
      if (loc && loc.src) checkRef(loc.src);
    });
    (show.atoms || []).forEach(function (a) {
      if (a && a.background && a.background.src) checkRef(a.background.src);
      (a && a.micro_frames || []).forEach(function (mf) {
        if (mf && mf.src) checkRef(mf.src);
      });
    });
    ((show.fg && show.fg.props) || []).forEach(function (prop) {
      if (prop && prop.src) checkRef(prop.src);
      if (prop && prop.effect && prop.effect.broken_src) checkRef(prop.effect.broken_src);
    });
    return refs;
  }

  function relinkMissingAssets(project, localFiles) {
    if (!project || !project.show) throw new Error('No open project to relink.');
    var next = clone(project);
    next.assets = Object.assign({}, next.assets || {});
    var missingRefs =
      root.HMImportReceipt && typeof root.HMImportReceipt.auditProjectAssets === 'function'
        ? root.HMImportReceipt.auditProjectAssets(next, { localFiles: null }).missingRefs
        : fallbackMissingRefs(next);

    var files = localFiles || {};
    var fileNames = Object.keys(files);
    var exact = Object.create(null);
    var byBase = Object.create(null);
    var byLowerBase = Object.create(null);
    for (var i = 0; i < fileNames.length; i++) {
      var fname = fileNames[i];
      var val = files[fname];
      if (typeof val !== 'string' || !val) continue;
      exact[fname] = { name: fname, data: val };
      var b = basename(fname);
      if (b && !Object.prototype.hasOwnProperty.call(byBase, b)) byBase[b] = { name: fname, data: val };
      var lb = b.toLowerCase();
      if (lb && !Object.prototype.hasOwnProperty.call(byLowerBase, lb)) byLowerBase[lb] = { name: fname, data: val };
    }

    var matched = [];
    var remainingMissing = [];
    var usedFiles = Object.create(null);

    for (var mi = 0; mi < missingRefs.length; mi++) {
      var ref = missingRefs[mi];
      var refBase = basename(ref);
      var hit =
        (Object.prototype.hasOwnProperty.call(exact, ref) && exact[ref]) ||
        (refBase && Object.prototype.hasOwnProperty.call(byBase, refBase) && byBase[refBase]) ||
        (refBase && Object.prototype.hasOwnProperty.call(byLowerBase, refBase.toLowerCase()) && byLowerBase[refBase.toLowerCase()]) ||
        null;
      if (hit) {
        next.assets[ref] = hit.data;
        matched.push({ ref: ref, file: hit.name });
        usedFiles[hit.name] = true;
      } else {
        remainingMissing.push(ref);
      }
    }

    var unmatchedFiles = fileNames.filter(function (name) {
      return !Object.prototype.hasOwnProperty.call(usedFiles, name);
    });

    return {
      project: next,
      matched: matched,
      remainingMissing: remainingMissing,
      unmatchedFiles: unmatchedFiles,
    };
  }

  function normMatchToken(str) {
    var base = basename(str).replace(/\.[^.]+$/, '').toLowerCase();
    return base
      .replace(/^(?:hero|plate|shot|frame|sprite|char|cutout|bg|fg)[_-]+/g, '')
      .replace(/[_-]+(?:final|v\d+|clean|fixed|edit|copy)$/g, '')
      .replace(/[^a-z0-9]+/g, '');
  }

  function extractPlateTag(str) {
    var m = /(?:^|[^a-z0-9])(p\d{1,3}|s\d{1,4})(?:$|[^a-z0-9])/i.exec(basename(str).replace(/\.[^.]+$/, ''));
    return m ? m[1].toLowerCase() : '';
  }

  function suggestAssetMatches(missingRefs, localFiles) {
    var refs = Array.isArray(missingRefs) ? missingRefs : [];
    var files = localFiles && typeof localFiles === 'object' ? Object.keys(localFiles) : [];
    if (!refs.length || !files.length) return [];
    var used = Object.create(null);
    var out = [];

    for (var i = 0; i < refs.length; i++) {
      var ref = refs[i];
      var refBase = basename(ref).toLowerCase();
      var refNorm = normMatchToken(ref);
      var refTag = extractPlateTag(ref);
      var best = null;
      for (var j = 0; j < files.length; j++) {
        var f = files[j];
        if (Object.prototype.hasOwnProperty.call(used, f)) continue;
        var fBase = basename(f).toLowerCase();
        var fNorm = normMatchToken(f);
        var fTag = extractPlateTag(f);
        if (refBase && fBase === refBase) {
          best = { ref: ref, file: f, reason: 'case-insensitive filename match' };
          break;
        }
        if (refTag && fTag && refTag === fTag) {
          best = { ref: ref, file: f, reason: 'plate id match (' + refTag.toUpperCase() + ')' };
          break;
        }
        if (refNorm && fNorm && (fNorm === refNorm || (refNorm.length >= 3 && (fNorm.indexOf(refNorm) >= 0 || refNorm.indexOf(fNorm) >= 0)))) {
          best = { ref: ref, file: f, reason: 'stem token match' };
        }
      }
      if (best) {
        used[best.file] = true;
        out.push(best);
      }
    }
    return out;
  }

  function analyzeImportHealth(project, opts) {
    var p = project || {};
    var show = p.show || {};
    var atoms = Array.isArray(show.atoms) ? show.atoms : [];
    var o = opts || {};
    var missingRefs = Array.isArray(o.missingRefs) ? o.missingRefs : fallbackMissingRefs(p);
    var totalDur = 0;
    var unpacedIndices = [];
    for (var i = 0; i < atoms.length; i++) {
      var a = atoms[i] || {};
      var d = Number(a.duration_s);
      if (Number.isFinite(d) && d > 0) totalDur += d;
      var hasCam = a.camera && (a.camera.preset || (Array.isArray(a.camera.segments) && a.camera.segments.length));
      if (!Number.isFinite(d) || d < 0.15 || d > 12 || !hasCam) {
        unpacedIndices.push(i);
      }
    }
    var assetKeys = Object.keys(p.assets || {});
    var suggestedMatches = suggestAssetMatches(missingRefs, o.localFiles || null);
    return {
      clipCount: atoms.length,
      imageCount: assetKeys.length,
      totalDurationS: +totalDur.toFixed(4),
      missingCount: missingRefs.length,
      exportReady: atoms.length > 0 && missingRefs.length === 0,
      suggestedMatches: suggestedMatches,
      unpacedAtomIndices: unpacedIndices,
      canNormalizePacing: unpacedIndices.length > 0,
    };
  }

  function normalizeAiPacing(project) {
    if (!project || !project.show || !Array.isArray(project.show.atoms)) {
      throw new Error('No clips available to normalize.');
    }
    var next = clone(project);
    var changed = 0;
    for (var i = 0; i < next.show.atoms.length; i++) {
      var a = next.show.atoms[i];
      if (!a) continue;
      var d = Number(a.duration_s);
      if (!Number.isFinite(d) || d < 0.15 || d > 12) {
        a.duration_s = 0.6;
        delete a.timing_hold;
        changed++;
      }
      if (!a.camera || (!a.camera.preset && !(Array.isArray(a.camera.segments) && a.camera.segments.length))) {
        a.camera = { preset: i % 2 === 0 ? 'establish' : 'slow_push' };
        changed++;
      }
    }
    return { project: next, changedCount: changed };
  }

  var api = {
    LAYOUT_KEY: LAYOUT_KEY,
    FORMAT_HINT_SNIPPET: FORMAT_HINT_SNIPPET,
    embedProjectScript: embedProjectScript,
    extractBalancedJson: extractBalancedJson,
    extractConstData: extractConstData,
    extractJsonScripts: extractJsonScripts,
    reconstructProjectFromData: reconstructProjectFromData,
    parseMotionHtml: parseMotionHtml,
    relinkMissingAssets: relinkMissingAssets,
    suggestAssetMatches: suggestAssetMatches,
    analyzeImportHealth: analyzeImportHealth,
    normalizeAiPacing: normalizeAiPacing,
  };

  root.HMHtmlImport = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/*! HM-COMPOSE-07 — in-browser compose (hero / parity / plate-pack path).
 * Port of essential composer/compose.py for Jack bar on static hosts.
 * Library-mode placement is intentionally unsupported here (fail closed).
 */
(function (global) {
  'use strict';
  const FPS_PLATES = 2;
  const DEFAULTS = { x: 0, y: 0, s: 1.12, r: 0 };

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  // Screen-space paths for parametric punch / leg FX. Preset defaults win;
  // these are only used when a hook or overlay omits a path.
  const FX_FIST_PATH = [[430, 390], [610, 300], [760, 250]];
  const FX_LEG_PATH = [[800, 560], [1020, 340], [1160, 150]];
  const FX_TORNADO_PATH = [[640, 480], [660, 300]];
  const PROCEDURAL_OVERLAYS = {
    exposure_warm_crush: 0.10,
    fist_pressure: 0.36,
    leg_arc: 0.28,
    tornado_spiral: 0.50,
  };

  // Photographic fire / light / dust chips. Comic/ink hides them.
  // Full chips shows them. They stay in presets either way.
  const PHOTO_FX_CHIPS = Object.freeze([
    'dust',
    'sparks',
    'flash_orange',
    'flash_pink',
    'bg_flash_blue',
    'bg_flash_teal',
    'exposure_warm_crush',
  ]);
  const PHOTO_FX_CHIP_SET = new Set(PHOTO_FX_CHIPS);
  // Rejected photo packs. Compose may keep an authored one. It must not insert one.
  const REJECTED_PHOTO_OVERLAY_KINDS = Object.freeze([
    'fire',
    'photo_fire',
    'light',
    'photo_light',
    'photo_dust',
    'pink_slash',
  ]);
  const REJECTED_PHOTO_OVERLAY_SET = new Set(REJECTED_PHOTO_OVERLAY_KINDS);
  const COMIC_INK_STYLE = Object.freeze({
    fill: '#f4efe4',
    stroke: '#14110e',
    strokeWidth: 11,
    fontWeight: 900,
  });
  const FX_PROFILE_HONESTY = Object.freeze({
    comic: 'Comic/ink is the default for new street and classroom projects. Photographic fire, light, and dust chips stay hidden. This profile never adds those overlays. Switch to Full chips to opt in. A show that already has those chips still opens.',
    full: 'Full chips keeps every FX chip, including photographic dust and warm light. Rejected photo fire and light overlays are never added on their own. A show that already has those chips still opens.',
  });

  function showVenue(show) {
    if (!show || typeof show !== 'object') return '';
    const meta = show.meta && typeof show.meta === 'object' ? show.meta : {};
    return String(show.venue || meta.venue || meta.seat || meta.context || '').trim().toLowerCase();
  }

  function defaultFxProfileFor(venue) {
    const v = String(venue || '').trim().toLowerCase();
    return v === 'street' || v === 'classroom' ? 'comic' : 'full';
  }

  function resolveFxProfile(show) {
    const raw = show && show.fx_profile;
    if (raw === 'comic' || raw === 'full') return raw;
    return defaultFxProfileFor(showVenue(show));
  }

  function fxProfileHonesty(profile) {
    return FX_PROFILE_HONESTY[profile === 'comic' ? 'comic' : 'full'];
  }

  function isPhotoFxChip(type) {
    return PHOTO_FX_CHIP_SET.has(String(type || ''));
  }

  function isRejectedPhotoOverlay(overlay) {
    if (!overlay || typeof overlay !== 'object') return false;
    return REJECTED_PHOTO_OVERLAY_SET.has(String(overlay.kind || '').toLowerCase());
  }

  function isPhotoFxOverlay(overlay) {
    if (!overlay || typeof overlay !== 'object') return false;
    return isRejectedPhotoOverlay(overlay) || isPhotoFxChip(overlay.kind);
  }

  function styleOverlayForProfile(overlay, profile) {
    if (profile !== 'comic' || !overlay || overlay.kind !== 'text') return overlay;
    if (overlay.style && typeof overlay.style === 'object' && Object.keys(overlay.style).length) return overlay;
    return Object.assign({}, overlay, { style: Object.assign({}, COMIC_INK_STYLE) });
  }

  function rejectedPhotoOverlaysAdded(show, overlays) {
    const authored = new Set();
    (show && show.overlays || []).forEach((overlay, i) => {
      if (isRejectedPhotoOverlay(overlay)) authored.add(overlay.id || ('ov_' + (i + 1)));
    });
    return (overlays || []).filter((overlay) => isRejectedPhotoOverlay(overlay) && !authored.has(overlay.id));
  }

  function cloneFxPath(raw) {
    if (!Array.isArray(raw)) return null;
    const pts = [];
    for (const p of raw) {
      if (Array.isArray(p) && Number.isFinite(+p[0]) && Number.isFinite(+p[1])) pts.push([round4(+p[0]), round4(+p[1])]);
      else if (p && typeof p === 'object' && Number.isFinite(+p.x) && Number.isFinite(+p.y)) pts.push([round4(+p.x), round4(+p.y)]);
    }
    return pts.length ? pts : null;
  }

  function stockFxPath(type) {
    const src = type === 'fist_pressure' ? FX_FIST_PATH : type === 'leg_arc' ? FX_LEG_PATH : type === 'tornado_spiral' ? FX_TORNADO_PATH : null;
    return src ? src.map((p) => [p[0], p[1]]) : null;
  }

  // At least two finite points. Shorter or empty input is not an authored path.
  function normalizeFxPath(raw) {
    const pts = cloneFxPath(raw);
    if (!pts || pts.length < 2) return null;
    return pts;
  }

  // Stock polyline when show fx_hooks omit params.path, or the value cannot be read.
  function resolveFxPath(type, raw) {
    return cloneFxPath(raw) || stockFxPath(type);
  }

  function fxSpanSeconds(hk, prm, atomDur) {
    const explicit = hk && hk.params && hk.params.dur;
    if (Number.isFinite(+explicit) && +explicit > 0) return round4(+explicit);
    if (hk && hk.t_rel_end != null && Number.isFinite(+hk.t_rel_end)) {
      const tRel = hk.t_rel != null ? +hk.t_rel : 0.08;
      const span = (+hk.t_rel_end - tRel) * atomDur;
      if (span > 0) return round4(span);
    }
    if (prm && Number.isFinite(+prm.dur) && +prm.dur > 0) return round4(+prm.dur);
    return 0.10;
  }

  function normalizeFxPlacement(prm) {
    const p = prm && typeof prm === 'object' ? prm : {};
    const x = Number.isFinite(+p.x) ? round4(+p.x) : 0;
    const y = Number.isFinite(+p.y) ? round4(+p.y) : 0;
    const scale = Number.isFinite(+p.scale) && +p.scale > 0 ? round4(Math.max(0.05, Math.min(8, +p.scale))) : 1;
    return { x, y, scale };
  }

  function hasFxPlacement(xf) {
    return !!(xf && (Math.abs(xf.x) > 1e-6 || Math.abs(xf.y) > 1e-6 || Math.abs(xf.scale - 1) > 1e-6));
  }

  // HM-BG-CROP: background crop rects are normalized {x,y,w,h} in 0..1 of the source image.
  const BG_CROP_MIN = 0.02;
  const BG_CROP_FULL = Object.freeze({ x: 0, y: 0, w: 1, h: 1 });
  function validBackgroundCrop(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return false;
    const { x, y, w, h } = c, eps = 1e-6;
    return [x, y, w, h].every(Number.isFinite) && x >= -eps && y >= -eps && w >= BG_CROP_MIN - eps && h >= BG_CROP_MIN - eps && x + w <= 1 + eps && y + h <= 1 + eps;
  }
  const round4 = v => Math.round(v * 10000) / 10000;
  // Clamp any rect into the image, keeping at least BG_CROP_MIN on each side.
  function clampBackgroundCrop(c) {
    const n = v => (Number.isFinite(+v) ? +v : 0);
    let w = Math.min(1, Math.max(BG_CROP_MIN, n(c && c.w))), h = Math.min(1, Math.max(BG_CROP_MIN, n(c && c.h)));
    const x = Math.min(1 - w, Math.max(0, n(c && c.x))), y = Math.min(1 - h, Math.max(0, n(c && c.y)));
    return { x: round4(x), y: round4(y), w: round4(w), h: round4(h) };
  }
  function isFullBackgroundCrop(c) {
    return !c || (Math.abs(c.x) < 1e-4 && Math.abs(c.y) < 1e-4 && Math.abs(c.w - 1) < 1e-4 && Math.abs(c.h - 1) < 1e-4);
  }
  // Fit a rect to the stage aspect (16:9 by default) around its centre, given source image pixel aspect (w/h).
  function lockBackgroundCropAspect(c, imageAspect, stageAspect = 16 / 9, anchor = 'center') {
    const r = clampBackgroundCrop(c), k = (imageAspect || stageAspect) / stageAspect; // normalized h = w * k
    let w = r.w, h = w * k;
    if (h > 1) { h = 1; w = h / k; }
    if (anchor === 'height') { h = r.h; w = h / k; if (w > 1) { w = 1; h = w * k; } }
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    return clampBackgroundCrop({ x: cx - w / 2, y: cy - h / 2, w, h });
  }
  // The crop that applies for a compiled layout entry (clip override, else project crop for its bg layer).
  function resolveBackgroundCrop(entry, timelineBg) {
    const own = (entry && entry.background) || {};
    if (own.crop) return own.crop;
    if (Object.prototype.hasOwnProperty.call(own, 'src')) return null;
    return ((timelineBg && timelineBg.crops) || {})[(entry && entry.bg) || 'base'] || null;
  }
  // HM-PAN-SPAN-UI: optional t0–t1 span helpers for continuous background pan.
  const BG_TRAVEL_PRESETS = Object.freeze(['pan_left', 'pan_right', 'pan_up', 'pan_down', 'push_in', 'pull_out']);
  function isTravelingBackgroundPreset(preset) {
    return BG_TRAVEL_PRESETS.indexOf(String(preset || 'follow_camera')) >= 0;
  }
  function readBackgroundSpan(motion) {
    if (!motion || typeof motion !== 'object') return null;
    const span = motion.span;
    const t0 = Array.isArray(span) ? span[0] : span && typeof span === 'object' ? span.t0 : motion.t0;
    const t1 = Array.isArray(span) ? span[1] : span && typeof span === 'object' ? span.t1 : motion.t1;
    return Number.isFinite(+t0) && Number.isFinite(+t1) && +t1 > +t0 ? [round4(+t0), round4(+t1)] : null;
  }
  function resolveBackgroundSpanUi(motion, showDuration, openOverride) {
    const m = motion && typeof motion === 'object' ? motion : null;
    const preset = (m && m.preset) || 'follow_camera';
    const travel = isTravelingBackgroundPreset(preset);
    const pair = readBackgroundSpan(m);
    const legacy = !!(m && (m.clock === 'per_atom' || m.clock === 'legacy'));
    const clock = legacy ? 'per_atom' : (m && (m.clock === 'span' || (pair && m.clock !== 'show'))) ? 'span' : 'show';
    const continuous = travel && clock !== 'per_atom';
    const authored = clock === 'span' && !!pair;
    const dur = round4(Number.isFinite(+showDuration) && +showDuration > 0 ? +showDuration : 0);
    const t0 = authored ? pair[0] : 0;
    const t1 = authored ? pair[1] : dur;
    const open = continuous && (openOverride === true ? true : openOverride === false ? false : authored);
    const windowText = Number(t0).toFixed(2) + '–' + Number(t1).toFixed(2) + 's';
    const valueLabel = authored ? windowText : 'Whole show';
    const toggleLabel = open ? 'Hide t0–t1 span' : 'Show t0–t1 span';
    const stateLabel = open
      ? (authored ? 't0–t1 controls shown · Active ' + windowText : 't0–t1 controls shown · Whole show')
      : (authored ? 't0–t1 controls hidden · Active ' + windowText : 'Optional t0–t1 hidden · Whole show');
    return {
      preset,
      travel,
      clock,
      continuous,
      authored,
      open,
      t0,
      t1,
      valueLabel,
      toggleLabel,
      stateLabel,
    };
  }
  function basename(p) {
    const s = String(p || '');
    const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
    return i < 0 ? s : s.slice(i + 1);
  }
  function dirname(p) {
    const s = String(p || '').replace(/\\/g, '/');
    const i = s.lastIndexOf('/');
    return i < 0 ? '' : s.slice(0, i);
  }
  function joinRel(dir, leaf) {
    if (!leaf) return dir || '';
    if (/^(https?:|blob:|data:)/i.test(leaf) || leaf.startsWith('/')) return leaf;
    const d = (dir || '').replace(/\/$/, '');
    const l = String(leaf).replace(/^\.\//, '');
    return d ? d + '/' + l : l;
  }
  function stem(p) {
    const b = basename(p);
    const i = b.lastIndexOf('.');
    return i < 0 ? b : b.slice(0, i);
  }

  const CAM_EASES = ['linear', 'smooth', 'sine', 'ease_in', 'ease_out', 'snap'];
  const SNAP_ZOOM = 0.18;

  function ease(kind, u) {
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    if (kind === 'linear') return u;
    if (kind === 'sine') return 0.5 - 0.5 * Math.cos(Math.PI * u);
    if (kind === 'ease_in') return u * u * u;
    if (kind === 'ease_out') return 1 - Math.pow(1 - u, 3);
    if (kind === 'snap') {
      const hold = 0.7;
      if (u <= hold) return 0;
      const t = (u - hold) / (1 - hold);
      return t * t * (3 - 2 * t);
    }
    return u * u * (3 - 2 * u);
  }

  function evalCurve(c, u, tl) {
    const t = c.type;
    if (t === 'const') return c.v;
    if (t === 'lerp') return c.a + (c.b - c.a) * ease(c.ease || 'smooth', u);
    if (t === 'saw') {
      const f = (tl % c.period_s) / c.period_s;
      return c.a + (c.b - c.a) * f;
    }
    if (t === 'sin') {
      const arg = ('omega' in c ? c.omega * tl : 2 * Math.PI * (c.cycles ?? 1) * u) + (c.phase || 0);
      return (c.offset || 0) + c.amp * Math.sin(arg);
    }
    if (t === 'alt_bump') {
      const k = c.n * u;
      const sign = Math.floor(k) % 2 ? 1 : -1;
      return (c.offset || 0) + sign * c.amp * Math.sin((k % 1) * Math.PI);
    }
    throw new Error('unknown curve type ' + t);
  }

  function evalCam(curves, u, tl) {
    const o = {};
    for (const ch of 'xysr') {
      o[ch] = curves[ch] ? evalCurve(curves[ch], u, tl) : DEFAULTS[ch];
    }
    const smin = 1 + Math.abs(Math.sin((o.r * Math.PI) / 180)) * 0.9;
    o.s = Math.max(o.s, smin);
    return o;
  }

  function mergeCurves(preset, params) {
    const cur = deepClone(preset.curves);
    for (const ch of Object.keys(params || {})) {
      const ov = params[ch];
      if ('type' in ov || !(ch in cur)) cur[ch] = Object.assign({}, ov);
      else Object.assign(cur[ch], ov);
    }
    return cur;
  }

  function applyCamIntensity(curves, intensity) {
    if (intensity == null) return curves;
    const k = +intensity;
    if (!isFinite(k) || Math.abs(k - 1) < 1e-12) return curves;
    const scale = Math.max(0, Math.min(2, k));
    const out = deepClone(curves);
    for (const ch of Object.keys(out)) {
      const c = out[ch];
      if (!c || typeof c !== 'object') continue;
      const base = ch === 's' ? 1 : 0;
      const t = c.type;
      if (t === 'const') {
        c.v = base + (+(c.v ?? DEFAULTS[ch]) - base) * scale;
      } else if (t === 'lerp' || t === 'saw') {
        c.a = base + (+c.a - base) * scale;
        c.b = base + (+c.b - base) * scale;
      } else if (t === 'sin' || t === 'alt_bump') {
        c.offset = base + (+(c.offset || base) - base) * scale;
        c.amp = (+c.amp || 0) * scale;
      }
    }
    return out;
  }

  function applyCamNudge(curves, nudge) {
    if (!nudge) return curves;
    const out = deepClone(curves);
    for (const ch of 'xysr') {
      if (nudge[ch] == null) continue;
      const dv = +nudge[ch];
      if (!isFinite(dv) || Math.abs(dv) < 1e-12) continue;
      if (!(ch in out)) {
        out[ch] = { type: 'const', v: DEFAULTS[ch] + dv };
        continue;
      }
      const c = out[ch];
      const t = c.type;
      if (t === 'const') c.v = +(c.v ?? DEFAULTS[ch]) + dv;
      else if (t === 'lerp' || t === 'saw') {
        c.a = +c.a + dv;
        c.b = +c.b + dv;
      } else if (t === 'sin' || t === 'alt_bump') {
        c.offset = +(c.offset || 0) + dv;
      } else {
        out[ch] = { type: 'const', v: DEFAULTS[ch] + dv };
      }
    }
    return out;
  }

  // Local ease rides a chord between the segment's own endpoints.
  // Snap-zoom's extra scale uses the chain parameter (u0..u1 across clips) so both sides of a cut share one scale.
  function poseOnSegment(seg, t) {
    if (!seg || !seg.curves) return { x: 0, y: 0, s: 1, r: 0 };
    const span = Math.max(1e-7, seg.t1 - seg.t0);
    const local = Math.min(1, Math.max(0, (t - seg.t0) / span));
    const tl = t - seg.t0;
    const u0 = seg.u0 == null ? 0 : +seg.u0;
    const u1 = seg.u1 == null ? 1 : +seg.u1;
    if (!seg.ease && !seg.snap_zoom) {
      return evalCam(seg.curves, u0 + (u1 - u0) * local, tl);
    }
    const camera = { x: 0, y: 0, s: 1, r: 0 };
    const shaped = seg.ease ? ease(seg.ease, local) : local;
    for (const ch of 'xysr') {
      const c = seg.curves[ch];
      if (!c) continue;
      if (!seg.ease) camera[ch] = evalCurve(c, u0 + (u1 - u0) * local, tl);
      else camera[ch] = evalCurve(c, u0, 0) + (evalCurve(c, u1, span) - evalCurve(c, u0, 0)) * shaped;
    }
    const smin = 1 + Math.abs(Math.sin((camera.r * Math.PI) / 180)) * 0.9;
    camera.s = Math.max(camera.s, smin);
    if (seg.snap_zoom) camera.s += SNAP_ZOOM * ease('snap', u0 + (u1 - u0) * local);
    return camera;
  }

  function scaleSegmentDurs(segs, dur) {
    const sum = segs.reduce((s, x) => s + (+x.dur_s || 0), 0);
    if (!(dur > 0) || !segs.length) return;
    if (sum <= 0) {
      const each = +(dur / segs.length).toFixed(4);
      let rem = dur;
      segs.forEach((s, i) => {
        s.dur_s = i === segs.length - 1 ? +rem.toFixed(4) : each;
        rem -= s.dur_s;
      });
      return;
    }
    let acc = 0;
    segs.forEach((s, i) => {
      if (i === segs.length - 1) s.dur_s = +(dur - acc).toFixed(4);
      else {
        s.dur_s = +((+s.dur_s / sum) * dur).toFixed(4);
        acc += s.dur_s;
      }
    });
  }

  function assignChainRanges(flat, id) {
    const total = flat.reduce((s, x) => s + +x.dur_s, 0);
    let acc = 0;
    flat.forEach((s, i) => {
      const u0 = i === 0 ? 0 : flat[i - 1].u_range[1];
      acc += +s.dur_s;
      const u1 = i === flat.length - 1 ? 1 : round4(acc / total);
      s.u_range = [u0, u1];
      s.chain = { id, index: i };
    });
  }

  function clipSegmentsForChain(atom, preset) {
    const cam = atom.camera || {};
    const raw = Array.isArray(cam.segments) ? cam.segments.filter((s) => s && s.preset) : [];
    const uniform = raw.length > 0 && raw.every((s) => s.preset === preset);
    if (uniform) {
      const segs = raw.map((s) => {
        const out = { preset: s.preset, dur_s: +s.dur_s };
        if (s.params) out.params = s.params;
        if (s.nudge) out.nudge = s.nudge;
        if (s.intensity != null) out.intensity = s.intensity;
        const easeName = s.ease || cam.ease;
        if (easeName) out.ease = easeName;
        if (s.snap_zoom === true || cam.snap_zoom === true || easeName === 'snap') out.snap_zoom = true;
        return out;
      });
      scaleSegmentDurs(segs, +atom.duration_s);
      return segs;
    }
    const out = { preset, dur_s: round4(+atom.duration_s) };
    if (cam.params && (!raw.length || cam.preset === preset)) out.params = cam.params;
    if (cam.ease) out.ease = cam.ease;
    if (cam.snap_zoom === true || cam.ease === 'snap') out.snap_zoom = true;
    return [out];
  }

  function writeChainedCamera(atom, segs, chain) {
    const prev = atom.camera || {};
    const cam = {
      preset: segs[0].preset,
      u_range: [segs[0].u_range[0], segs[segs.length - 1].u_range[1]],
      chain,
      segments: segs,
    };
    if (prev.nudge && typeof prev.nudge === 'object' && Object.keys(prev.nudge).length) cam.nudge = prev.nudge;
    if (prev.intensity != null) cam.intensity = prev.intensity;
    const names = [...new Set(segs.map((s) => s.ease).filter(Boolean))];
    if (names.length === 1) cam.ease = names[0];
    if (segs.some((s) => s.snap_zoom)) cam.snap_zoom = true;
    atom.camera = cam;
  }

  function clearChainMembership(atom, resetRange) {
    const cam = atom && atom.camera;
    if (!cam) return;
    delete cam.chain;
    if (resetRange) {
      delete cam.u_range;
      if (Array.isArray(cam.segments)) cam.segments.forEach((s) => { delete s.chain; s.u_range = [0, 1]; });
    } else if (Array.isArray(cam.segments)) cam.segments.forEach((s) => delete s.chain);
  }

  function reflowCamChain(atoms, chainId) {
    if (!chainId || !Array.isArray(atoms)) return { id: chainId || null, count: 0 };
    const indices = [];
    atoms.forEach((a, i) => { if (a.camera?.chain?.id === chainId) indices.push(i); });
    const contiguous = indices.length >= 2 && indices.every((v, i) => i === 0 || v === indices[i - 1] + 1);
    if (!contiguous) {
      indices.forEach((i) => clearChainMembership(atoms[i], true));
      return { id: chainId, count: 0 };
    }
    const head = atoms[indices[0]].camera || {};
    const preset = head.preset || head.segments?.[0]?.preset || 'static_hold';
    const groups = indices.map((i) => {
      const cam = atoms[i].camera || {};
      const segs = (cam.segments || []).map((s) => Object.assign({}, s));
      if (!segs.length) {
        const seeded = { preset: cam.preset || preset, dur_s: +atoms[i].duration_s };
        if (cam.ease) seeded.ease = cam.ease;
        if (cam.snap_zoom === true || cam.ease === 'snap') seeded.snap_zoom = true;
        segs.push(seeded);
      }
      scaleSegmentDurs(segs, +atoms[i].duration_s);
      return segs;
    });
    const flat = groups.flat();
    assignChainRanges(flat, chainId);
    indices.forEach((atomIndex, chainIndex) => {
      writeChainedCamera(atoms[atomIndex], groups[chainIndex], { id: chainId, index: chainIndex, count: indices.length });
    });
    return { id: chainId, count: indices.length, preset };
  }

  function reflowAllCamChains(atoms) {
    const ids = [];
    (atoms || []).forEach((a) => {
      const id = a.camera?.chain?.id;
      if (id && !ids.includes(id)) ids.push(id);
    });
    ids.forEach((id) => reflowCamChain(atoms, id));
  }

  function unchainClip(atoms, index) {
    const id = atoms[index]?.camera?.chain?.id;
    if (!id) return { id: null, count: 0 };
    clearChainMembership(atoms[index], true);
    return reflowCamChain(atoms, id);
  }

  function chainClipCameras(atoms, indexList) {
    if (!Array.isArray(atoms)) throw new Error('Chain needs a clip list.');
    const indices = [...new Set((indexList || []).map((n) => +n))]
      .filter((i) => Number.isInteger(i) && atoms[i])
      .sort((a, b) => a - b);
    if (indices.length < 2) throw new Error('Chain at least two adjacent clips.');
    for (let k = 1; k < indices.length; k++) {
      if (indices[k] !== indices[k - 1] + 1) throw new Error('Chain adjacent clips. Shift-click a continuous run.');
    }
    const oldIds = new Set();
    indices.forEach((i) => { const id = atoms[i].camera?.chain?.id; if (id) oldIds.add(id); });
    const firstId = atoms[indices[0]].camera?.chain?.id;
    const shared = !!firstId && indices.every((i) => atoms[i].camera?.chain?.id === firstId);
    const id = shared ? atoms[indices[0]].camera.chain.id : ('cam-' + Math.random().toString(36).slice(2, 10));
    const anchor = atoms[indices[0]].camera || {};
    const preset = anchor.preset || anchor.segments?.[0]?.preset || 'static_hold';
    const groups = indices.map((i) => clipSegmentsForChain(atoms[i], preset));
    const flat = groups.flat();
    assignChainRanges(flat, id);
    indices.forEach((atomIndex, chainIndex) => {
      writeChainedCamera(atoms[atomIndex], groups[chainIndex], { id, index: chainIndex, count: indices.length });
    });
    oldIds.forEach((old) => { if (old !== id) reflowCamChain(atoms, old); });
    return { id, count: indices.length, preset };
  }

  function setCamEase(cam, easeName) {
    if (!cam || typeof cam !== 'object') throw new Error('Choose a clip before setting camera easing.');
    const name = easeName || '';
    if (name && CAM_EASES.indexOf(name) < 0) throw new Error('Use linear, smooth, sine, ease in, ease out, or snap zoom.');
    const snap = name === 'snap';
    if (!name) {
      delete cam.ease;
      delete cam.snap_zoom;
    } else {
      cam.ease = name;
      if (snap) cam.snap_zoom = true;
      else delete cam.snap_zoom;
    }
    (cam.segments || []).forEach((s) => {
      if (!name) {
        delete s.ease;
        delete s.snap_zoom;
      } else {
        s.ease = name;
        if (snap) s.snap_zoom = true;
        else delete s.snap_zoom;
      }
    });
    return cam;
  }

  function detachCamChain(cam) {
    if (!cam) return cam;
    delete cam.chain;
    delete cam.u_range;
    if (Array.isArray(cam.segments)) cam.segments.forEach((s) => { delete s.chain; s.u_range = [0, 1]; });
    return cam;
  }

  function mergeTransform(show, atom, side) {
    const base = ((show.chars || {})[side] || {}).transform || {};
    const ov = ((atom || {}).char_overrides || {})[side] || {};
    return {
      x: +('x' in ov ? ov.x : base.x || 0) || 0,
      y: +('y' in ov ? ov.y : base.y || 0) || 0,
      scale: +('scale' in ov ? ov.scale : base.scale || 1) || 1,
    };
  }

  function applyPartTransform(part, shadow, xf, floor, warns, label) {
    const sx = xf.scale || 1;
    const dx = xf.x || 0;
    const dy = xf.y || 0;
    if (Math.abs(sx - 1) < 1e-9 && Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return;
    const cx = shadow ? shadow.cx : part.x + part.w / 2;
    const footY = floor;
    const ox = part.x - cx;
    const oy = part.y - footY;
    part.w = Math.round(part.w * sx * 10) / 10;
    part.h = Math.round(part.h * sx * 10) / 10;
    part.x = Math.round((cx + ox * sx + dx) * 10) / 10;
    part.y = Math.round((footY + oy * sx + dy) * 10) / 10;
    if (shadow) {
      shadow.cx = Math.round((cx + dx) * 10) / 10;
      shadow.cy = Math.round((footY + dy) * 10) / 10;
      shadow.rx = Math.round((shadow.rx || 60) * sx * 10) / 10;
    }
    if (Math.abs(dy) > 1e-6) {
      const msg = label + ': y transform ' + (dy >= 0 ? '+' : '') + Math.round(dy) + 'px breaks floor grounding';
      if (warns.indexOf(msg) < 0) warns.push(msg);
    }
  }

  function applyLayoutTransforms(entry, show, atom, warns) {
    const parts = entry.parts || [];
    const shadows = entry.shadows || [];
    const floor = entry.floor != null ? entry.floor : show.floor_y != null ? show.floor_y : 684;
    if (!parts.length && !entry.full) return;
    const sided = parts.filter((p) => p.side === 'L' || p.side === 'R');
    if (sided.length) {
      const sideShadow = {};
      parts.forEach((part) => {
        const side = part.side;
        if (side !== 'L' && side !== 'R') return;
        const xf = mergeTransform(show, atom, side);
        let sh = null;
        if (!(side in sideShadow)) {
          for (let j = 0; j < shadows.length; j++) {
            if (Object.values(sideShadow).indexOf(j) < 0) {
              sideShadow[side] = j;
              sh = shadows[j];
              break;
            }
          }
        } else {
          sh = shadows[sideShadow[side]];
        }
        applyPartTransform(part, sh, xf, floor, warns, (atom.id || '?') + ' ' + side);
      });
      return;
    }
    const xfL = mergeTransform(show, atom, 'L');
    const xfR = mergeTransform(show, atom, 'R');
    const xf = {
      x: xfL.x + xfR.x,
      y: Math.abs(xfL.y) > 1e-9 ? xfL.y : xfR.y,
      scale: (xfL.scale || 1) * (xfR.scale || 1),
    };
    const cscale = +(show.char_screen_scale || 1);
    if (Math.abs(cscale - 1) > 1e-9) xf.scale *= cscale;
    if (Math.abs(xf.scale - 1) < 1e-9 && Math.abs(xf.x) < 1e-9 && Math.abs(xf.y) < 1e-9) return;
    if (entry.full && !parts.length) {
      const part = { src: entry.full, x: 0, y: 0, w: 1280, h: 720 };
      const sh = { cx: 640, cy: +floor, rx: 400, ry: 10 };
      applyPartTransform(part, sh, xf, floor, warns, (atom.id || '?') + ' full');
      entry.parts = [part];
      entry.shadows = [sh];
      delete entry.full;
      return;
    }
    parts.forEach((part, i) => {
      const sh = shadows[i] || shadows[0] || null;
      applyPartTransform(part, sh, xf, floor, warns, (atom.id || '?') + ' pair');
    });
  }

  function mapLayoutBgToKey(srcBg, showBg) {
    if (!srcBg) return null;
    const token = String(srcBg).trim();
    const tokenBase = stem(token);
    if (token === 'base' || token === 'swap') return token;
    for (const key of ['base','swap']) if ((showBg.aliases?.[key] || []).includes(tokenBase)) return key;
    for (const key of ['base', 'swap']) {
      const path = showBg[key];
      if (!path) continue;
      const name = stem(path);
      if (token === name || tokenBase === name || path.indexOf(token) >= 0 || path.indexOf(tokenBase) >= 0) return key;
    }
    return null;
  }

  function isParityMode(show, atoms, nHero, nPlate, dur) {
    if (show.parity_mode === true) return true;
    if (show.compose_mode === 'parity' || show.plate_pack === true) return true;
    if (!atoms.length) return false;
    const allHero = atoms.every((a) => a.pose_mode === 'hero');
    return allHero && nHero === atoms.length && nPlate >= 50 && dur >= 30 - 1e-6 && dur <= 60 + 1e-6;
  }

  function normalizeOverlays(show, dur, warns) {
    const EFFECT_TYPES = {
      none: 1, pop: 1, slam: 1, shake: 1, flash: 1, fade: 1, bounce: 1,
      slide_left: 1, slide_right: 1, spin_in: 1, pulse: 1, impact: 1,
    };
    const out = [];
    (show.overlays || []).forEach((o, i) => {
      const oid = o.id || 'ov_' + (i + 1);
      const kind = o.kind || (o.text ? 'text' : 'image');
      const src = o.src;
      const text = o.text;
      const proceduralDur = PROCEDURAL_OVERLAYS[kind];
      if (kind === 'text') {
        if (!(text && String(text).trim())) {
          warns.push('overlay ' + oid + ': kind=text but empty text, skipped');
          return;
        }
      } else if (proceduralDur == null && !src) {
        warns.push('overlay ' + oid + ': missing src, skipped');
        return;
      }
      const t0 = +(o.t_start || 0);
      const authoredDur = Number.isFinite(+o.dur) && +o.dur > 0 ? +o.dur : proceduralDur;
      const t1 = +(o.t_end != null ? o.t_end : t0 + (proceduralDur != null ? authoredDur : 1));
      if (t1 <= t0) {
        warns.push('overlay ' + oid + ': t_end <= t_start, skipped');
        return;
      }
      if (t0 >= dur) {
        warns.push('overlay ' + oid + ': starts after show end, skipped');
        return;
      }
      const row = {
        id: oid,
        kind,
        t_start: Math.round(t0 * 10000) / 10000,
        t_end: Math.round(Math.min(t1, dur) * 10000) / 10000,
        x: +(o.x != null ? o.x : (proceduralDur != null ? 0 : 640)),
        y: +(o.y != null ? o.y : (proceduralDur != null ? 0 : 200)),
        scale: +(o.scale || 1) || 1,
        opacity: o.opacity != null ? +o.opacity : 1,
        z: +(o.z != null ? o.z : 10),
      };
      if (src) row.src = src;
      if (text != null) row.text = String(text);
      if (proceduralDur != null) {
        const path = resolveFxPath(kind, o.path);
        if (path) row.path = path;
      }
      if (o.style && typeof o.style === 'object') {
        row.style = {};
        ['fill', 'stroke', 'strokeWidth', 'fontSize', 'fontWeight', 'italic', 'fontFamily'].forEach((k) => {
          if (o.style[k] != null) row.style[k] = o.style[k];
        });
      }
      const eff = o.effect;
      if (typeof eff === 'string') {
        row.effect = { type: EFFECT_TYPES[eff] ? eff : 'none', intensity: 1 };
      } else if (eff && typeof eff === 'object') {
        let et = eff.type || 'none';
        if (!EFFECT_TYPES[et]) {
          warns.push('overlay ' + oid + ': unknown effect, using none');
          et = 'none';
        }
        let inten = +(eff.intensity != null ? eff.intensity : 1) || 1;
        inten = Math.max(0.25, Math.min(2, inten));
        row.effect = { type: et, intensity: inten };
        if (eff.hold != null) row.effect.hold = +eff.hold;
      }
      out.push(row);
    });
    out.sort((a, b) => a.z - b.z || a.t_start - b.t_start);
    return out;
  }

  // HM-COMPOSE-FG: show.fg is a prop layer with its own camera. Presets include
  // parallax/nudge, which are not background crop-window moves.
  const FG_CAM_PRESETS = ['static', 'nudge', 'parallax', 'pan_left', 'pan_right', 'pan_up', 'pan_down', 'push_in', 'pull_out'];
  const FG_DEFAULT_PARALLAX = 0.45;
  const FG_PARALLAX_PRESETS = Object.freeze([0, FG_DEFAULT_PARALLAX, 1]);
  function validFgSpan(cam) {
    const pairOk = (t0, t1) => Number.isFinite(+t0) && Number.isFinite(+t1) && +t1 > +t0;
    if (cam.clock !== undefined && !['show', 'per_atom', 'legacy', 'span'].includes(cam.clock)) return false;
    if (cam.span !== undefined) {
      const span = cam.span;
      const t0 = Array.isArray(span) ? span[0] : span && span.t0;
      const t1 = Array.isArray(span) ? span[1] : span && span.t1;
      if (!pairOk(t0, t1)) return false;
    }
    if ((cam.t0 !== undefined || cam.t1 !== undefined) && !pairOk(cam.t0, cam.t1)) return false;
    if (cam.clock === 'span' && cam.span === undefined && cam.t0 === undefined) return false;
    return true;
  }
  function validFgCam(cam) {
    if (!cam || typeof cam !== 'object' || Array.isArray(cam)) return false;
    if (cam.preset !== undefined && !FG_CAM_PRESETS.includes(cam.preset)) return false;
    if (cam.amount !== undefined && (!Number.isFinite(cam.amount) || cam.amount < 0 || cam.amount > 1)) return false;
    if (cam.nudge !== undefined) {
      if (!cam.nudge || typeof cam.nudge !== 'object' || Array.isArray(cam.nudge)) return false;
      for (const k of ['x', 'y', 's']) if (cam.nudge[k] !== undefined && !Number.isFinite(cam.nudge[k])) return false;
    }
    return validFgSpan(cam);
  }
  function normalizeFgCam(cam) {
    const c = cam || {};
    const n = c.nudge || {};
    const preset = c.preset || 'parallax';
    const fallbackAmount = preset === 'static' || preset === 'nudge' ? 0 : FG_DEFAULT_PARALLAX;
    const out = {
      preset,
      amount: round4(c.amount == null ? fallbackAmount : +c.amount),
      nudge: {
        x: round4(n.x == null ? 0 : +n.x),
        y: round4(n.y == null ? 0 : +n.y),
        s: round4(n.s == null ? 0 : +n.s),
      },
    };
    if (c.clock) out.clock = c.clock;
    if (c.span !== undefined) out.span = deepClone(c.span);
    if (c.t0 !== undefined) out.t0 = +c.t0;
    if (c.t1 !== undefined) out.t1 = +c.t1;
    return out;
  }
  function normalizeForeground(show, dur, errors, warns) {
    if (show.fg == null) return null;
    const fg = show.fg;
    if (typeof fg !== 'object' || Array.isArray(fg)) {
      errors.push('foreground: invalid layer');
      return null;
    }
    const hasCam = fg.cam != null;
    const hasProps = fg.props != null;
    if (!hasCam && !hasProps) return null;
    if (hasProps && !Array.isArray(fg.props)) {
      errors.push('foreground: props must be a list');
      return null;
    }
    if (hasCam && !validFgCam(fg.cam)) {
      errors.push('foreground: invalid camera');
      return null;
    }
    const seen = new Set();
    const props = [];
    let failed = false;
    (fg.props || []).forEach((raw, i) => {
      const label = 'foreground prop ' + ((raw && raw.id) || (i + 1));
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { errors.push(label + ': invalid'); failed = true; return; }
      const id = raw.id != null ? String(raw.id) : '';
      if (!id) { errors.push(label + ': missing id'); failed = true; return; }
      if (seen.has(id)) { errors.push(label + ': duplicate id'); failed = true; return; }
      seen.add(id);
      if (typeof raw.src !== 'string' || !raw.src) { errors.push(label + ': missing src'); failed = true; return; }
      const num = (v, d) => (v == null ? d : +v);
      const x = num(raw.x, 640), y = num(raw.y, 560), scale = num(raw.scale, 1), z = num(raw.z, 0);
      if (![x, y, scale, z].every(Number.isFinite) || scale < 0.05 || scale > 8) { errors.push(label + ': invalid placement'); failed = true; return; }
      const t0 = num(raw.t_start, 0);
      const t1 = raw.t_end == null ? dur : +raw.t_end;
      if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0 || t0 < 0) { errors.push(label + ': invalid time window'); failed = true; return; }
      if (t0 >= dur) { warns.push(label + ': starts after show end, skipped'); return; }
      const prop = {
        id, src: raw.src,
        x: round4(x), y: round4(y), scale: round4(scale), z: round4(z),
        t_start: round4(t0), t_end: round4(Math.min(t1, dur)),
      };
      if (raw.kf != null) {
        if (!Array.isArray(raw.kf)) { errors.push(label + ': keyframes must be a list'); failed = true; return; }
        const kf = [];
        for (const k of raw.kf) {
          if (!k || typeof k !== 'object' || Array.isArray(k) || !Number.isFinite(+k.t)) { errors.push(label + ': invalid keyframe'); failed = true; return; }
          const row = {
            t: round4(+k.t),
            x: round4(k.x == null ? x : +k.x),
            y: round4(k.y == null ? y : +k.y),
            scale: round4(k.scale == null ? scale : +k.scale),
          };
          if (![row.x, row.y, row.scale].every(Number.isFinite) || row.scale < 0.05 || row.scale > 8) { errors.push(label + ': invalid keyframe'); failed = true; return; }
          kf.push(row);
        }
        kf.sort((a, b) => a.t - b.t);
        const uniq = [];
        for (const row of kf) {
          if (uniq.length && Math.abs(uniq[uniq.length - 1].t - row.t) < 1e-4) uniq[uniq.length - 1] = row;
          else uniq.push(row);
        }
        if (uniq.length) prop.kf = uniq;
      }
      const slot = raw.slot == null || raw.slot === 'prop' ? 'prop' : raw.slot;
      if (slot !== 'prop' && slot !== 'overlay') { errors.push(label + ': unknown slot'); failed = true; return; }
      if (slot === 'overlay') prop.slot = 'overlay';
      if (raw.effect != null && raw.effect !== 'none') {
        if (slot === 'overlay') { errors.push(label + ': overlay art does not break'); failed = true; return; }
        const eff = typeof raw.effect === 'string' ? { type: raw.effect, t: 0 } : raw.effect;
        if (!eff || typeof eff !== 'object' || Array.isArray(eff)) { errors.push(label + ': invalid effect'); failed = true; return; }
        if (eff.type !== 'none' && eff.type != null) {
          if (eff.type !== 'break') { errors.push(label + ': unknown effect'); failed = true; return; }
          const et = eff.t == null ? 0 : +eff.t;
          if (!Number.isFinite(et) || et < 0) { errors.push(label + ': invalid break time'); failed = true; return; }
          prop.effect = { type: 'break', t: round4(et) };
          if (eff.broken_src != null) {
            if (typeof eff.broken_src !== 'string' || !eff.broken_src) { errors.push(label + ': broken image must be a path'); failed = true; return; }
            prop.effect.broken_src = eff.broken_src;
          }
        }
      }
      props.push(prop);
    });
    if (failed || errors.some(e => e.startsWith('foreground'))) return null;
    if (!props.length && !hasCam) return null;
    props.sort((a, b) => a.z - b.z || String(a.id).localeCompare(String(b.id)));
    return { cam: normalizeFgCam(hasCam ? fg.cam : { preset: 'parallax', amount: FG_DEFAULT_PARALLAX }), props };
  }

  async function fetchJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('fetch ' + url + ' → ' + r.status);
    return r.json();
  }

  const CUT_TRANSITION_IDS = ['freeze_hold', 'white_flash', 'whip_cut'];
  const CUT_TRANSITION_DEFAULTS = {
    freeze_hold: { id: 'freeze_hold', label: 'Freeze hold', dur_s: 0.12, hold_s: 0.12, dir: 1 },
    white_flash: { id: 'white_flash', label: 'White flash', dur_s: 0.08, hold_s: 0, dir: 1 },
    whip_cut: { id: 'whip_cut', label: 'Whip cut', dur_s: 0.10, hold_s: 0, dir: 1 },
  };

  function cutPresetTable(raw) {
    const list = Array.isArray(raw) ? raw : (raw && raw.presets) || [];
    const table = {};
    CUT_TRANSITION_IDS.forEach((id) => { table[id] = Object.assign({}, CUT_TRANSITION_DEFAULTS[id]); });
    list.forEach((p) => {
      if (!p || CUT_TRANSITION_IDS.indexOf(p.id) < 0) return;
      const d = p.defaults || {};
      table[p.id] = {
        id: p.id,
        label: p.label || table[p.id].label,
        dur_s: Number.isFinite(+d.dur_s) ? +d.dur_s : table[p.id].dur_s,
        hold_s: Number.isFinite(+d.hold_s) ? +d.hold_s : table[p.id].hold_s,
        dir: d.dir < 0 ? -1 : 1,
      };
    });
    return table;
  }

  function clampCutSeconds(n, fallback) {
    const v = Number.isFinite(+n) ? +n : fallback;
    return Math.round(Math.min(0.5, Math.max(0.02, v)) * 10000) / 10000;
  }

  function normalizeAtomCut(raw, table) {
    const presets = table || cutPresetTable(null);
    if (raw == null || raw === false) return null;
    const preset = typeof raw === 'string' ? raw : raw.preset;
    if (!preset || preset === 'none' || preset === 'hard') return null;
    const spec = presets[preset];
    if (!spec) return { error: 'unknown cut preset ' + preset };
    const dur_s = clampCutSeconds(typeof raw === 'object' ? raw.dur_s : undefined, spec.dur_s);
    const hold_s = preset === 'freeze_hold'
      ? clampCutSeconds(typeof raw === 'object' && raw.hold_s != null ? raw.hold_s : (typeof raw === 'object' ? raw.dur_s : undefined), spec.hold_s)
      : 0;
    const dir = typeof raw === 'object' && raw.dir < 0 ? -1 : 1;
    return { preset, dur_s, hold_s, dir };
  }

  async function composeShow(show, opts) {
    opts = opts || {};
    const allowSoftLint = opts.allowSoftLint === true;
    const errors = [];
    const warns = [];
    const loadJson = opts.loadJson || ((p) => fetchJson('/' + String(p).replace(/^\//, '')));
    const camList = Array.isArray(opts.cameraPresets)
      ? opts.cameraPresets
      : (opts.cameraPresets && opts.cameraPresets.presets) || [];
    const fxList = Array.isArray(opts.fxPresets)
      ? opts.fxPresets
      : (opts.fxPresets && opts.fxPresets.hooks) || [];
    const cams = {};
    camList.forEach((p) => { cams[p.id] = p; });
    const fallbackStaticCam = cams.static_hold || {
      id: 'static_hold',
      curves: {
        x: { type: 'const', v: 0 },
        y: { type: 'const', v: 0 },
        s: { type: 'const', v: 1 },
        r: { type: 'const', v: 0 },
      },
    };
    const fxp = {};
    fxList.forEach((h) => { fxp[h.id] = h; });
    const cutTable = cutPresetTable(opts.cutPresets);

    const atoms = [];
    for (const raw of show.atoms || []) {
      let a = raw;
      if (a.ref) {
        a = await loadJson('atoms/' + a.ref + '.json');
      }
      atoms.push(a);
    }
    if (!(show.atoms || []).length) errors.push('no atoms');

    for (const a of atoms) {
      if (a.pose_mode === 'library') {
        errors.push(
          a.id +
            ': library pose_mode needs local compose.py (FE-only ships hero/parity plate-pack path)'
        );
      }
    }
    if (errors.length) return { ok: false, errors, warnings: warns };

    const floor = show.floor_y != null ? show.floor_y : 684;
    const bg = show.bg || {};
    const backgroundMoves = ['follow_camera','static','pan_left','pan_right','pan_up','pan_down','push_in','pull_out'];
    function validBackgroundMotion(m) {
      if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
      if (!backgroundMoves.includes(m.preset) || !Number.isFinite(m.amount) || m.amount < 0 || m.amount > 1) return false;
      if (m.clock !== undefined && !['show','per_atom','legacy','span'].includes(m.clock)) return false;
      const pairOk = (t0, t1) => Number.isFinite(+t0) && Number.isFinite(+t1) && +t1 > +t0;
      if (m.span !== undefined) {
        const span = m.span;
        const t0 = Array.isArray(span) ? span[0] : span && span.t0;
        const t1 = Array.isArray(span) ? span[1] : span && span.t1;
        if (!pairOk(t0, t1)) return false;
      }
      if ((m.t0 !== undefined || m.t1 !== undefined) && !pairOk(m.t0, m.t1)) return false;
      if (m.clock === 'span' && m.span === undefined && m.t0 === undefined) return false;
      return true;
    }
    function validateBackground(value, label) {
      if (value == null) return;
      if (typeof value !== 'object' || Array.isArray(value)) { errors.push(label + ': invalid background settings'); return; }
      if (value.src !== undefined && value.src !== null && (typeof value.src !== 'string' || !value.src)) errors.push(label + ': background image must be a path or null');
      if (value.key_white !== undefined && typeof value.key_white !== 'boolean') errors.push(label + ': white-backdrop setting must be true or false');
      const m = value.motion;
      if (m !== undefined && !validBackgroundMotion(m)) errors.push(label + ': invalid background motion');
      if (value.crop !== undefined && !validBackgroundCrop(value.crop)) errors.push(label + ': invalid background crop');
      if (value.crops !== undefined) {
        if (!value.crops || typeof value.crops !== 'object' || Array.isArray(value.crops)) errors.push(label + ': invalid background crops');
        else for (const [k, c] of Object.entries(value.crops)) if (!['base', 'swap'].includes(k) || !validBackgroundCrop(c)) errors.push(label + ': invalid background crop for ' + k);
      }
    }
    validateBackground(bg, 'Project');
    const swapT = bg.swap ? bg.swap_t : null;
    const layout = {};
    const plates = [];
    const tlAtoms = [];
    const showCuts = [];
    const fx = {
      hits: [], flash: [], hitstop: [], shake: [], bgflash: [], dust: [],
      sparks: [], speed: [], fence: [], trails: [], pink_cut: null,
      exposure: [], fist: [], leg: [], tornado: [], pixelfx: [],
    };
    const fxProfile = resolveFxProfile(show);
    const heroLayouts = {};
    let t = 0;
    let nPlate = 0;
    let nHero = 0;

    for (let atomIndex = 0; atomIndex < atoms.length; atomIndex++) {
      const a = atoms[atomIndex];
      validateBackground(a.background, a.id);
      const rawD = +a.duration_s;
      const rawNpl = +a.plates_needed;
      let d = rawD;
      let npl = rawNpl;
      if (!Number.isFinite(rawD) || rawD < 0.1 || !Number.isInteger(rawNpl) || rawNpl < 1 || rawNpl > 1000) {
        if (allowSoftLint) {
          d = Number.isFinite(rawD) && rawD >= 0.1 ? rawD : 0.5;
          npl = Number.isInteger(rawNpl) && rawNpl >= 1 && rawNpl <= 1000 ? rawNpl : 1;
          warns.push(a.id + ': unsafe duration or plates_needed normalized for preview/bake');
        } else {
          errors.push(a.id + ': duration must be at least 0.1s and plates_needed a positive integer');
          continue;
        }
      }
      const plateDuration = d / npl;
      const t0 = t;
      const t1 = t + d;
      const cam = a.camera || {};
      const segs = Array.isArray(cam.segments) && cam.segments.length
        ? cam.segments.map((s) => Object.assign({}, s))
        : [{ preset: cam.preset, dur_s: d, params: cam.params, u_range: cam.u_range, nudge: cam.nudge, intensity: cam.intensity }];
      const segSum = segs.reduce((s, x) => s + +x.dur_s, 0);
      if (Math.abs(segSum - d) > 1e-6) {
        if (allowSoftLint) {
          warns.push(a.id + ': camera segments sum != duration');
          scaleSegmentDurs(segs, d);
        } else {
          errors.push(a.id + ': camera segments sum != duration');
        }
      }
      const cs = [];
      let st = t0;
      const atomNudge = cam.nudge && typeof cam.nudge === 'object' ? cam.nudge : {};
      const atomIntensity = cam.intensity != null ? +cam.intensity : 1;
      if (cam.snap_zoom != null && typeof cam.snap_zoom !== 'boolean') errors.push(a.id + ': snap_zoom must be true or false');
      const camEase = typeof cam.ease === 'string' ? cam.ease : '';
      if (camEase && CAM_EASES.indexOf(camEase) < 0) errors.push(a.id + ': unknown camera ease ' + camEase);
      for (const s of segs) {
        let camPresetObj = cams[s.preset];
        let segPresetName = s.preset;
        if (!camPresetObj) {
          if (allowSoftLint) {
            warns.push(a.id + ': unknown or empty camera preset ' + (s.preset || '(empty)') + ' (fallback static_hold)');
            camPresetObj = fallbackStaticCam;
            segPresetName = 'static_hold';
          } else {
            errors.push(a.id + ': unknown camera preset ' + s.preset);
            continue;
          }
        }
        const u0 = (s.u_range || [0, 1])[0];
        const u1 = (s.u_range || [0, 1])[1];
        const segNudge = s.nudge && typeof s.nudge === 'object' ? s.nudge : atomNudge;
        const segIntensity = s.intensity != null ? +s.intensity : atomIntensity;
        const scaled = applyCamIntensity(mergeCurves(camPresetObj, s.params), segIntensity);
        const curves = applyCamNudge(scaled, segNudge);
        const segEase = typeof s.ease === 'string' && s.ease ? s.ease : camEase;
        if (s.ease && CAM_EASES.indexOf(s.ease) < 0) errors.push(a.id + ': unknown camera ease ' + s.ease);
        if (s.snap_zoom != null && typeof s.snap_zoom !== 'boolean') errors.push(a.id + ': snap_zoom must be true or false');
        const snapZoom = s.snap_zoom === true || cam.snap_zoom === true || segEase === 'snap';
        cs.push({
          t0: Math.round(st * 10000) / 10000,
          t1: Math.round((st + s.dur_s) * 10000) / 10000,
          u0, u1, preset: segPresetName, curves,
          ...(segEase ? { ease: segEase } : {}),
          ...(snapZoom ? { snap_zoom: true } : {}),
        });
        st += +s.dur_s;
      }

      const mode = a.pose_mode;
      if (mode === 'hero') nHero += 1;
      for (let i = 0; i < npl; i++) {
        nPlate += 1;
        const pid = 'S' + String(nPlate).padStart(3, '0');
        const pt0 = t0 + i * plateDuration;
        const bgkey = swapT != null && pt0 + 1e-6 >= swapT ? 'swap' : 'base';
        const entry = {
          id: pid, t: pt0, atom: a.id, kind: a.kind, pose_mode: mode, bg: bgkey,
        };
        if (mode === 'hero') {
          const h = a.hero || {};
          const srcIds = h.plates || [];
          if (i < srcIds.length) {
            const lsrc = h.layout_source;
            if (!lsrc) {
              if (allowSoftLint) {
                entry.source_plate = srcIds[i] || ('P' + String(i + 1).padStart(2, '0'));
                entry.slate = 'MISSING PLATE · ' + entry.source_plate + ' (no layout)';
                warns.push(a.id + ': hero missing layout_source (slate)');
              } else {
                errors.push(a.id + ': hero missing layout_source');
                continue;
              }
            } else {
              if (!heroLayouts[lsrc]) {
                try {
                  heroLayouts[lsrc] = await loadJson(lsrc);
                } catch (e) {
                  if (allowSoftLint) {
                    heroLayouts[lsrc] = null;
                    warns.push(a.id + ': cannot load layout_source ' + lsrc + ' (slate)');
                  } else {
                    errors.push(a.id + ': cannot load layout_source ' + lsrc + ' — ' + e.message);
                    continue;
                  }
                }
              }
              const se = heroLayouts[lsrc] && heroLayouts[lsrc][srcIds[i]];
              if (!se) {
                if (allowSoftLint) {
                  entry.source_plate = srcIds[i];
                  entry.slate = 'MISSING PLATE · ' + srcIds[i];
                  warns.push(a.id + ': plate ' + srcIds[i] + ' not in ' + lsrc + ' (slate)');
                } else {
                  errors.push(a.id + ': plate ' + srcIds[i] + ' not in ' + lsrc);
                  continue;
                }
              } else {
                const ldir = dirname(lsrc);
                const srcBg = se.bg;
                if (srcBg) {
                  const mapped = mapLayoutBgToKey(srcBg, bg);
                  if (mapped) entry.bg = mapped;
                  else warns.push(a.id + ': layout bg ' + JSON.stringify(srcBg) + ' not in show.bg; keeping ' + entry.bg);
                }
                if (se.bg_zoom != null) entry.bg_zoom = se.bg_zoom;
                if (se.floor != null) entry.floor = se.floor;
                entry.source_plate = srcIds[i];
                entry.kind = se.kind || a.kind;
                if (se.full) entry.full = joinRel(ldir, se.full);
                else {
                  entry.parts = (se.parts || []).map((p) =>
                    Object.assign({}, p, { src: joinRel(ldir, p.src) })
                  );
                  entry.shadows = deepClone(se.shadows || []);
                }
              }
            }
          } else {
            const briefs = h.pose_briefs || [];
            entry.source_plate = 'P' + String(i + 1).padStart(2, '0');
            entry.slate =
              'HERO PENDING · ' +
              ((a.motion && a.motion.beat_class) || '?') +
              ' · plate ' +
              (i + 1) +
              '/' +
              npl +
              (i < briefs.length ? ' · ' + briefs[i] : '');
            warns.push(a.id + ': hero plate ' + (i + 1) + ' not generated yet (slate)');
          }
        }
        applyLayoutTransforms(entry, show, a, warns);
        if (a.background) entry.background = deepClone(a.background);
        layout[pid] = entry;
        plates.push({
          id: pid,
          t0: Math.round(pt0 * 10000) / 10000,
          t1: Math.round((pt0 + plateDuration) * 10000) / 10000,
        });
      }

      const atomFx = [];
      for (const rawHk of a.fx_hooks || []) {
        const hk = typeof rawHk === 'string' ? { type: rawHk, t_rel: 0.08, params: {} } : rawHk;
        let p = fxp[hk.type];
        if (!p && isPixelfxHook(hk)) p = pixelfxPreset(hk.type);
        if (!p) {
          if (allowSoftLint) {
            warns.push(a.id + ': unknown fx hook ' + hk.type);
            continue;
          }
          errors.push(a.id + ': unknown fx hook ' + hk.type);
          continue;
        }
        const rawTRel = hk.t_rel != null ? +hk.t_rel : 0.08;
        const rawTRelEnd = hk.t_rel_end != null ? +hk.t_rel_end : 1;
        const tRel = allowSoftLint
          ? (Number.isFinite(rawTRel) ? Math.min(1, Math.max(0, rawTRel)) : 0.08)
          : rawTRel;
        const tRelEnd = allowSoftLint
          ? (Number.isFinite(rawTRelEnd) && rawTRelEnd > tRel ? Math.min(1, Math.max(0, rawTRelEnd)) : Math.min(1, Math.max(tRel + 0.08, 0.92)))
          : rawTRelEnd;
        const prm = Object.assign({}, p.defaults || {}, hk.params || {});
        const ht = Math.round((t0 + tRel * d) * 10000) / 10000;
        const he = Math.round((t0 + tRelEnd * d) * 10000) / 10000;
        const col = prm.color != null ? prm.color : p.color;
        const span = fxSpanSeconds(hk, prm, d);
        const xf = normalizeFxPlacement(prm);
        if (PROCEDURAL_OVERLAYS[hk.type] != null) {
          prm.x = xf.x;
          prm.y = xf.y;
          prm.scale = xf.scale;
        }
        const paintPhoto = fxProfile !== 'comic' || !isPhotoFxChip(hk.type);
        if (paintPhoto) {
        for (const comp of p.components || []) {
          if (comp === 'impact_burst') fx.hits.push([ht, col]);
          else if (comp === 'flash' && (p.components || []).indexOf('impact_burst') < 0) fx.flash.push([ht, col]);
          else if (comp === 'hitstop_2f' && (p.components || []).indexOf('impact_burst') < 0) fx.hitstop.push(ht);
          else if (comp === 'shake' && (p.components || []).indexOf('impact_burst') < 0)
            fx.shake.push([ht, prm.amp, prm.dur]);
          else if (comp === 'tint') fx.bgflash.push([ht, col]);
          else if (comp === 'trail') fx.trails.push([ht, prm.dir]);
          else if (comp === 'dust') fx.dust.push([ht, prm.k]);
          else if (comp === 'speed') fx.speed.push([ht, he, prm.mode, prm.k0, prm.k1]);
          else if (comp === 'sparks') fx.sparks.push([ht, prm.n, prm.at]);
          else if (comp === 'fence') fx.fence.push([ht, he, prm.k]);
          else if (comp === 'pink_cut') fx.pink_cut = ht;
          else if (comp === 'exposure_warm_crush') fx.exposure.push(hasFxPlacement(xf) ? [ht, span, xf] : [ht, span]);
          else if (comp === 'fist_pressure') fx.fist.push(hasFxPlacement(xf) ? [ht, span, resolveFxPath('fist_pressure', prm.path), xf] : [ht, span, resolveFxPath('fist_pressure', prm.path)]);
          else if (comp === 'leg_arc') fx.leg.push(hasFxPlacement(xf) ? [ht, span, resolveFxPath('leg_arc', prm.path), xf] : [ht, span, resolveFxPath('leg_arc', prm.path)]);
          else if (comp === 'tornado_spiral') fx.tornado.push(hasFxPlacement(xf) ? [ht, span, resolveFxPath('tornado_spiral', prm.path), xf] : [ht, span, resolveFxPath('tornado_spiral', prm.path)]);
          else if (comp === 'pixelfx') fx.pixelfx.push([ht, hk.type]);
        }
        }
        const cls = classifyFxHook(hk, fxp);
        atomFx.push({
          type: hk.type,
          t_rel: tRel,
          ...(hk.source === 'pixelfx' || isPixelfxHook(hk) ? { source: 'pixelfx' } : {}),
          ...(hk.t_rel_end != null ? { t_rel_end: tRelEnd } : {}),
          params: prm,
          mode: cls.mode,
          compose_only: cls.composeOnly,
        });
      }

      const holdMeta = timingHoldMeta(a);
      let cutMeta = null;
      if (atomIndex === 0) {
        const named = a.cut && (typeof a.cut === 'string' ? a.cut : a.cut.preset);
        if (named && named !== 'none' && named !== 'hard') {
          warns.push(a.id + ': cut ignored on the first atom (no incoming boundary)');
        }
      } else if (a.cut) {
        const cutNorm = normalizeAtomCut(a.cut, cutTable);
        if (cutNorm && cutNorm.error) {
          errors.push(a.id + ': ' + cutNorm.error);
        } else if (cutNorm) {
          if (cutNorm.preset === 'freeze_hold') {
            cutNorm.hold_s = Math.min(cutNorm.hold_s, Math.max(0.02, Math.round((d - 0.02) * 10000) / 10000));
          }
          cutMeta = {
            t: Math.round(t0 * 10000) / 10000,
            after_id: atoms[atomIndex - 1].id,
            before_id: a.id,
            index: atomIndex,
            preset: cutNorm.preset,
            dur_s: cutNorm.dur_s,
            hold_s: cutNorm.hold_s,
            dir: cutNorm.dir,
          };
          showCuts.push(cutMeta);
        }
      }
      const bridgedBeatId = beatToken(a.beat_id);
      tlAtoms.push({
        id: a.id,
        ...(bridgedBeatId ? { beat_id: bridgedBeatId } : {}),
        t0: Math.round(t0 * 10000) / 10000,
        t1: Math.round(t1 * 10000) / 10000,
        pose_mode: mode,
        beat: (a.motion && a.motion.beat_class) || '',
        family: (a.motion && a.motion.family) || '',
        cam: cs,
        fx_hooks: atomFx,
        source_refs: a.source_refs || [],
        ...(holdMeta ? { timing_hold: holdMeta } : {}),
        ...(cutMeta ? { cut: cutMeta } : {}),
      });
      t = t1;
    }

    if (errors.length) return { ok: false, errors, warnings: warns };

    const dur = Math.round(t * 10000) / 10000;
    if (!Number.isFinite(dur) || dur < 0.1 || dur > 120) {
      errors.push('total duration must be between 0.1 and 120 seconds');
    }
    const lo = (6 * dur) / 30;
    const hi = (8 * dur) / 30;
    const parity = isParityMode(show, atoms, nHero, nPlate, dur);
    if (!parity && !(lo - 1e-6 <= nHero && nHero <= hi + 1e-6)) {
      warns.push('hero budget: ' + nHero + ' hero atoms for ' + dur + 's (target ' + lo.toFixed(1) + '-' + hi.toFixed(1) + ')');
    }
    if (errors.length) return { ok: false, errors, warnings: warns };

    const keys = [];
    for (const a of tlAtoms) {
      for (const s of a.cam) {
        let tt = s.t0;
        while (tt < s.t1 - 1e-9) {
          const c = poseOnSegment(s, tt);
          keys.push([
            Math.round(tt * 1000) / 1000,
            Math.round(c.x * 1000) / 1000,
            Math.round(c.y * 1000) / 1000,
            Math.round(c.s * 1000) / 1000,
            Math.round(c.r * 1000) / 1000,
          ]);
          tt += 0.25;
        }
      }
    }

    const overlays = normalizeOverlays(show, dur, warns).map((overlay) => {
      const styled = styleOverlayForProfile(overlay, fxProfile);
      if (fxProfile === 'comic' && isPhotoFxOverlay(styled)) return Object.assign({}, styled, { fx_paint: false });
      return styled;
    });
    const fg = normalizeForeground(show, dur, errors, warns);
    if (errors.length) return { ok: false, errors, warnings: warns };

    const timeline = {
      show_id: show.show_id,
      title: show.title || show.show_id,
      duration_s: dur,
      fps_plates: plates.every(p => Math.abs(p.t1 - p.t0 - 0.5) < 1e-6) ? FPS_PLATES : null,
      plate_timing: 'explicit',
      floor_y: floor,
      bg: {
        base: bg.base,
        swap: bg.swap || null,
        swap_t: swapT,
        key_white: bg.key_white === true,
        ...(bg.motion ? {motion: deepClone(bg.motion)} : {}),
        ...(bg.crops ? {crops: deepClone(bg.crops)} : {}),
      },
      chars: show.chars,
      atoms: tlAtoms,
      plates,
      cuts: showCuts,
      fx,
      fx_profile: fxProfile,
      overlays,
      ...(fg ? { fg } : {}),
      cam_keys_cols: ['t', 'x', 'y', 's', 'r'],
      cam_keys: keys,
      stats: {
        atoms: atoms.length,
        hero_atoms: nHero,
        library_atoms: atoms.length - nHero,
        plates: nPlate,
        hero_budget: [Math.round(lo * 100) / 100, Math.round(hi * 100) / 100],
        parity_mode: parity,
        overlays: overlays.length,
        compose_engine: 'js-fe',
      },
      warnings: warns,
    };

    return {
      ok: true,
      out: 'local:' + show.show_id,
      duration_s: dur,
      stats: timeline.stats,
      warnings: warns,
      timeline,
      layout,
    };
  }

  const PIXELFX_WAVE1_IDS = [
    'impacts/hit-spark',
    'impacts/blunt-hit',
    'impacts/crit-hit',
    'impacts/hit-flash',
    'impacts/impact-frame',
    'impacts/parry',
    'impacts/ground-slam',
    'impacts/heavy-landing',
    'melee/uppercut',
    'explosions/cartoon-pow',
    'explosions/dirt-explosion',
    'explosions/smoke-bomb',
  ];
  const PIXELFX_WAVE1_SET = new Set(PIXELFX_WAVE1_IDS);
  function isPixelfxHook(hk) {
    if (!hk) return false;
    if (typeof hk === 'string') return PIXELFX_WAVE1_SET.has(hk);
    return hk.source === 'pixelfx' || PIXELFX_WAVE1_SET.has(hk.type);
  }
  function pixelfxPreset(type) {
    return { id: type, components: ['pixelfx'], source: 'pixelfx', family: 'pixelfx' };
  }
  const LIVE_FX_COMPONENTS = [
    'impact_burst', 'flash', 'shake', 'tint', 'trail', 'dust', 'speed', 'sparks', 'pink_cut',
    'exposure_warm_crush', 'fist_pressure', 'leg_arc', 'tornado_spiral', 'pixelfx',
  ];
  const COMPOSE_ONLY_FX_COMPONENTS = ['hitstop_2f', 'fence'];
  const DEFAULT_FX_PRESETS = {
    hit_orange: { id: 'hit_orange', components: ['hitstop_2f', 'flash', 'shake', 'impact_burst'], color: '#ff8a1e' },
    hit_pink: { id: 'hit_pink', components: ['hitstop_2f', 'flash', 'shake', 'impact_burst'], color: '#ff3fa4' },
    hitstop_2f: { id: 'hitstop_2f', components: ['hitstop_2f'], source: '2-frame 24fps grayscale/contrast/invert freeze' },
    flash_orange: { id: 'flash_orange', components: ['flash'], color: '#ff8a1e' },
    flash_pink: { id: 'flash_pink', components: ['flash'], color: '#ff3fa4' },
    bg_flash_blue: { id: 'bg_flash_blue', components: ['tint'], color: '#2f7bff' },
    bg_flash_teal: { id: 'bg_flash_teal', components: ['tint'], color: '#19e0d0' },
    shake: { id: 'shake', components: ['shake'] },
    smear_trail: { id: 'smear_trail', components: ['trail'] },
    dust: { id: 'dust', components: ['dust'] },
    speed_lines: { id: 'speed_lines', components: ['speed'], span: true },
    sparks: { id: 'sparks', components: ['sparks'] },
    fence_shake: { id: 'fence_shake', components: ['fence'], span: true, source: 'DOM background-only rattle pass' },
    pink_cut: { id: 'pink_cut', components: ['pink_cut'], color: '#ff2f9a' },
    impact_white: { id: 'impact_white', components: ['hitstop_2f', 'flash', 'shake', 'impact_burst'], color: '#ffffff' },
    exposure_warm_crush: { id: 'exposure_warm_crush', components: ['exposure_warm_crush'], defaults: { dur: 0.10, x: 0, y: 0, scale: 1 }, craft_demo_times_s: [2.8, 7.3, 12.5, 17.5, 22.8, 29.7] },
    fist_pressure: { id: 'fist_pressure', components: ['fist_pressure'], color: '#e10600', defaults: { dur: 0.36, path: FX_FIST_PATH, x: 0, y: 0, scale: 1 } },
    leg_arc: { id: 'leg_arc', components: ['leg_arc'], color: '#f4fbff', defaults: { dur: 0.28, path: FX_LEG_PATH, x: 0, y: 0, scale: 1 } },
    tornado_spiral: { id: 'tornado_spiral', components: ['tornado_spiral'], color: '#e7f6ff', defaults: { dur: 0.50, path: FX_TORNADO_PATH, x: 0, y: 0, scale: 1 } },
  };

  function resolveFxMap(fxPresets) {
    if (!fxPresets) return DEFAULT_FX_PRESETS;
    if (Array.isArray(fxPresets)) {
      const m = Object.assign({}, DEFAULT_FX_PRESETS);
      fxPresets.forEach((h) => { if (h && h.id) m[h.id] = h; });
      return m;
    }
    if (Array.isArray(fxPresets.hooks)) {
      const m = Object.assign({}, DEFAULT_FX_PRESETS);
      fxPresets.hooks.forEach((h) => { if (h && h.id) m[h.id] = h; });
      return m;
    }
    if (typeof fxPresets === 'object') return Object.assign({}, DEFAULT_FX_PRESETS, fxPresets);
    return DEFAULT_FX_PRESETS;
  }

  function classifyFxHook(rawHook, fxPresets) {
    if (!rawHook) return null;
    const hk = typeof rawHook === 'string' ? { type: rawHook, t_rel: 0.08 } : rawHook;
    const type = String(hk.type || '').trim();
    if (!type || type === 'none') return null;
    const map = resolveFxMap(fxPresets);
    const p = map[type] || (isPixelfxHook(hk) ? pixelfxPreset(type) : null);
    const comps = (p && Array.isArray(p.components)) ? p.components.slice() : [];
    const canPreviewLive = comps.some((c) => LIVE_FX_COMPONENTS.indexOf(c) >= 0);
    const composeOnly = !canPreviewLive;
    const tRel = hk.t_rel != null ? +hk.t_rel : 0.08;
    const tRelEnd = hk.t_rel_end != null ? +hk.t_rel_end : (p && p.span ? 0.92 : undefined);
    return {
      type,
      t_rel: tRel,
      ...(tRelEnd !== undefined ? { t_rel_end: tRelEnd } : {}),
      mode: composeOnly ? 'compose_only' : 'live',
      canPreviewLive,
      composeOnly,
      color: (hk.params && hk.params.color) || (p && p.color) || null,
      components: comps,
      reason: composeOnly
        ? 'Compose-only (' + type + ') — cannot preview live on canvas; full effect renders on Compose / export.'
        : 'Live FX stand-in (' + type + ') — previewing on canvas.',
    };
  }

  function classifyFxHooks(hooks, fxPresets) {
    const list = (Array.isArray(hooks) ? hooks : [])
      .map((h) => classifyFxHook(h, fxPresets))
      .filter(Boolean);
    const live = list.filter((h) => h.canPreviewLive);
    const composeOnly = list.filter((h) => h.composeOnly);
    const hasLive = live.length > 0;
    const hasComposeOnly = composeOnly.length > 0;
    const mode = hasComposeOnly && hasLive
      ? 'mixed'
      : hasComposeOnly
        ? 'compose_only'
        : hasLive
          ? 'live'
          : 'none';
    const banner = hasComposeOnly
      ? 'Compose-only FX (' + composeOnly.map((h) => h.type).join(', ') + ') — cannot preview live on canvas; full pass renders on Compose / export.'
      : hasLive
        ? 'Live FX stand-in (' + live.map((h) => h.type).join(', ') + ') — visible on preview canvas before Compose.'
        : '';
    return {
      hooks: list,
      live,
      composeOnly,
      hasAny: list.length > 0,
      hasLive,
      hasComposeOnly,
      mode,
      banner,
    };
  }

  function inspectAt(composed, time) {
    if (!composed || !composed.timeline || !Array.isArray(composed.timeline.plates) || !composed.timeline.plates.length) {
      return null;
    }
    const tl = composed.timeline;
    const ly = composed.layout || {};
    const dur = +(tl.duration_s || 0);
    const rawT = Math.max(0, Number(time) || 0);
    const tc = Math.min(rawT, Math.max(0, dur - 1e-7));
    const pIdx = tl.plates.findIndex((p) => tc >= p.t0 && tc < p.t1);
    const plateIndex = pIdx >= 0 ? pIdx : tl.plates.length - 1;
    const plate = tl.plates[plateIndex] || null;
    const lEntry = plate ? ly[plate.id] : null;
    const sourcePlate = (lEntry && lEntry.source_plate) || (plate && plate.id) || null;
    const atoms = tl.atoms || [];
    const aIdx = atoms.findIndex((a) => tc >= a.t0 && tc < a.t1);
    const atomIndex = aIdx >= 0 ? aIdx : Math.max(0, atoms.length - 1);
    const atom = atoms[atomIndex] || null;
    const segs = atoms.flatMap((a) => a.cam || []);
    const seg = segs.find((s) => tc >= s.t0 && tc < s.t1) || segs[segs.length - 1] || null;
    const camPose = seg && seg.curves ? poseOnSegment(seg, tc) : { x: 0, y: 0, s: 1, r: 0 };
    const atomFx = (atom && Array.isArray(atom.fx_hooks)) ? atom.fx_hooks : [];
    return {
      show_id: tl.show_id || '',
      title: tl.title || tl.show_id || '',
      t: Math.round(rawT * 10000) / 10000,
      t_clamped: Math.round(tc * 10000) / 10000,
      duration_s: dur,
      plate_index: plateIndex,
      plate_id: plate ? plate.id : null,
      source_plate: sourcePlate,
      atom_index: atomIndex,
      atom_id: atom ? atom.id : null,
      atom_duration_s: atom ? Math.round((atom.t1 - atom.t0) * 10000) / 10000 : 0,
      cam_preset: seg ? seg.preset || 'static_hold' : 'static_hold',
      cam_pose: {
        x: Math.round(camPose.x * 1000) / 1000,
        y: Math.round(camPose.y * 1000) / 1000,
        s: Math.round(camPose.s * 1000) / 1000,
        r: Math.round(camPose.r * 1000) / 1000,
      },
      fx_hooks: atomFx,
      fx_state: classifyFxHooks(atomFx),
    };
  }

  function compareAt(composedA, composedB, time) {
    const t = Math.round(Math.max(0, Number(time) || 0) * 10000) / 10000;
    const a = inspectAt(composedA, t);
    const b = inspectAt(composedB, t);
    const plate = !!(a && b && a.source_plate !== b.source_plate);
    const cam = !!(
      a &&
      b &&
      (a.cam_preset !== b.cam_preset ||
        Math.abs(a.cam_pose.x - b.cam_pose.x) > 1e-3 ||
        Math.abs(a.cam_pose.y - b.cam_pose.y) > 1e-3 ||
        Math.abs(a.cam_pose.s - b.cam_pose.s) > 1e-3 ||
        Math.abs(a.cam_pose.r - b.cam_pose.r) > 1e-3)
    );
    const timing = !!(
      a &&
      b &&
      (Math.abs(a.atom_duration_s - b.atom_duration_s) > 1e-4 ||
        Math.abs(a.duration_s - b.duration_s) > 1e-4)
    );
    return {
      t,
      a,
      b,
      diff: {
        plate,
        cam,
        timing,
        any: plate || cam || timing,
      },
    };
  }

  function plateCatalog(composed) {
    const plates = composed && composed.timeline && composed.timeline.plates;
    if (!Array.isArray(plates) || !plates.length) return [];
    const layout = composed.layout || {};
    const atoms = composed.timeline.atoms || [];
    return plates.map((plate, index) => {
      const entry = layout[plate.id] || {};
      const atomId = entry.atom || null;
      let atomIndex = atoms.findIndex((atom) => atom.id === atomId);
      if (atomIndex < 0) {
        atomIndex = atoms.findIndex((atom) => plate.t0 >= atom.t0 && plate.t0 < atom.t1);
      }
      if (atomIndex < 0) atomIndex = 0;
      return {
        index,
        slot_id: plate.id,
        source_plate: entry.source_plate || plate.id,
        t0: plate.t0,
        t1: plate.t1,
        atom_index: atomIndex,
        atom_id: atomId || (atoms[atomIndex] && atoms[atomIndex].id) || null,
      };
    });
  }

  function plateJumpOption(mark) {
    const t0 = Math.round(Number(mark.t0) * 100) / 100;
    return mark.source_plate + ' @ ' + t0.toFixed(2);
  }

  function plateJumpChips(catalog, every) {
    const step = Number.isInteger(every) && every > 0 ? every : 10;
    const chips = [];
    if (!Array.isArray(catalog)) return chips;
    for (let i = 0; i < catalog.length; i += step) chips.push(catalog[i]);
    return chips;
  }

  function resolvePlateJump(catalog, query, currentIndex) {
    if (!Array.isArray(catalog) || !catalog.length) return null;
    if (query && typeof query === 'object') {
      if (Number.isInteger(query.index)) return catalog[query.index] || null;
      if (Number.isInteger(query.step)) {
        const cur = Number.isInteger(currentIndex) ? currentIndex : 0;
        const next = cur + query.step;
        if (next < 0 || next >= catalog.length) return null;
        return catalog[next];
      }
      if (typeof query.text === 'string') return resolvePlateJump(catalog, query.text, currentIndex);
      return null;
    }
    const text = String(query ?? '').trim();
    if (!text) return null;
    const byOption = catalog.find((mark) => plateJumpOption(mark) === text);
    if (byOption) return byOption;
    const norm = text.toUpperCase().replace(/\s+/g, '');
    const byId = catalog.find((mark) => mark.source_plate.toUpperCase() === norm || mark.slot_id.toUpperCase() === norm);
    if (byId) return byId;
    if (/^\d+$/.test(norm)) {
      const n = String(+norm);
      return catalog.find((mark) => {
        const digits = String(mark.source_plate).toUpperCase().match(/(\d+)/);
        return digits && String(+digits[1]) === n;
      }) || null;
    }
    return null;
  }

  const FRAME_PEEK_OFFSETS = Object.freeze([0, 0.3]);

  const SEEKABLE_PREVIEW_CONTRACT = Object.freeze({
    id: 'HM-HF-02-SEEKABLE-PREVIEW',
    sot: Object.freeze(['renderStageAt', 'renderStageBAt', 'renderAt', 'sampleStageFrameAt']),
    surfaces: Object.freeze(['scrub', 'ab_panes', 'frame_peek', 'bake_frame_sample', 'transport_play', 'bake_qa_dock']),
    softWarnBlocksBake: false,
  });

  function evaluateSeekPreviewCall(call, durationS) {
    const c = call && typeof call === 'object' ? call : {};
    const rawT = Number(c.t);
    const dur = Number.isFinite(+durationS) && +durationS > 0 ? +durationS : 0;
    const viaSoT = c.viaSoT === true;
    const source = String(c.source || (viaSoT ? 'renderStageAt' : 'direct-renderer.render'));
    const wallClockTimestamp = Number.isFinite(rawT) && rawT > Math.max(120, dur + 1) && rawT > 500;
    const unconstrainedRaf = c.unconstrainedRaf === true || c.wallClock === true || wallClockTimestamp || !viaSoT;
    if (!unconstrainedRaf) {
      return {
        ok: true,
        warn: false,
        blocksBake: false,
        code: 'ok',
        source,
        t: Number.isFinite(rawT) ? round4(rawT) : 0,
        message: '',
      };
    }
    const reason = wallClockTimestamp
      ? `wall-clock timestamp (${Math.round(rawT)}ms)`
      : (c.unconstrainedRaf === true || c.wallClock === true)
        ? 'unconstrained rAF / wall-clock preview call'
        : `direct renderer.render(${Number.isFinite(rawT) ? rawT.toFixed(2) : 't'}) bypassed renderStageAt(t) / renderAt(t)`;
    return {
      ok: false,
      warn: true,
      blocksBake: false,
      code: 'unconstrained-preview-pixels',
      source,
      t: Number.isFinite(rawT) ? round4(rawT) : 0,
      message: `Soft warning · Preview pixels sampled via ${reason} (${source}). Route scrub, A/B, peek, and bake sampling through renderAt(t) / renderStageAt(t). Bake and export stay enabled.`,
    };
  }

  function sanitizeFilenamePart(raw, fallback) {
    const clean = String(raw || '').trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    return clean || fallback || 'item';
  }

  function framePeekFilename(showId, peek) {
    const sid = sanitizeFilenamePart(showId || (peek && peek.show_id), 'motion');
    const atomNum = String(((peek && peek.atom_index) || 0) + 1).padStart(2, '0');
    const plate = sanitizeFilenamePart(peek && peek.source_plate, 'P' + atomNum);
    const kind = peek && peek.sample_kind === 'plus_03' ? 'plus03' : 'mid';
    const tNom = Number.isFinite(+(peek && peek.t_nominal)) ? (+peek.t_nominal).toFixed(2) : (Number.isFinite(+(peek && peek.t)) ? (+peek.t).toFixed(2) : '0.00');
    return `${sid}-peek-${atomNum}-${plate}-${kind}-${tNom}s.png`;
  }

  function framePeekPlan(showOrProject, composed) {
    const show = showOrProject && showOrProject.show ? showOrProject.show : showOrProject;
    const rawAtoms = Array.isArray(show && show.atoms)
      ? show.atoms
      : Array.isArray(composed && composed.timeline && composed.timeline.atoms)
        ? composed.timeline.atoms
        : [];
    const showId = String((show && show.show_id) || (composed && composed.timeline && composed.timeline.show_id) || 'motion');
    const atoms = [];
    const peeks = [];
    let acc = 0;
    for (let i = 0; i < rawAtoms.length; i++) {
      const a = rawAtoms[i] || {};
      const dur = round4(
        Number.isFinite(+a.duration_s) && +a.duration_s > 0
          ? +a.duration_s
          : Number.isFinite(+a.t1 - +a.t0) && +a.t1 > +a.t0
            ? +a.t1 - +a.t0
            : 0.5
      );
      const t0 = round4(acc);
      const t1 = round4(t0 + dur);
      acc = t1;
      const mid = round4(t0 + dur / 2);
      const endSeek = round4(Math.max(t0, t1 - 1e-4));
      const rawPlus = round4(mid + 0.3);
      const clamped = rawPlus >= t1 - 1e-9;
      const tNominalPlus = clamped ? t1 : rawPlus;
      const tSeekPlus = clamped ? endSeek : rawPlus;
      const heroPlates = Array.isArray(a.hero && a.hero.plates) ? a.hero.plates : [];
      const fallbackPlate = heroPlates[0] || a.id || ('P' + String(i + 1).padStart(2, '0'));
      const midInspect = composed ? inspectAt(composed, mid) : null;
      const plusInspect = composed ? inspectAt(composed, tSeekPlus) : null;
      const midPlate = (midInspect && midInspect.source_plate) || fallbackPlate;
      const plusPlate = (plusInspect && plusInspect.source_plate) || heroPlates[heroPlates.length - 1] || fallbackPlate;
      const atomId = a.id || ('atom-' + (i + 1));
      const atomLabel = a.label || atomId;
      const midPeek = {
        index: peeks.length,
        show_id: showId,
        atom_index: i,
        atom_id: atomId,
        atom_label: atomLabel,
        source_plate: midPlate,
        sample_index: 0,
        sample_kind: 'mid',
        offset_s: 0,
        offset_label: '+0.0s',
        t0,
        t1,
        duration_s: dur,
        mid_t: mid,
        raw_t: mid,
        t_nominal: mid,
        t: mid,
        clamped: false,
      };
      midPeek.filename = framePeekFilename(showId, midPeek);
      peeks.push(midPeek);
      const plusPeek = {
        index: peeks.length,
        show_id: showId,
        atom_index: i,
        atom_id: atomId,
        atom_label: atomLabel,
        source_plate: plusPlate,
        sample_index: 1,
        sample_kind: 'plus_03',
        offset_s: 0.3,
        offset_label: '+0.3s',
        t0,
        t1,
        duration_s: dur,
        mid_t: mid,
        raw_t: rawPlus,
        t_nominal: tNominalPlus,
        t: tSeekPlus,
        clamped,
      };
      plusPeek.filename = framePeekFilename(showId, plusPeek);
      peeks.push(plusPeek);
      atoms.push({
        atom_index: i,
        atom_id: atomId,
        atom_label: atomLabel,
        source_plate: midPlate,
        t0,
        t1,
        duration_s: dur,
        mid_t: mid,
        plus_03_t: tSeekPlus,
        plus_03_nominal_t: tNominalPlus,
        plus_03_clamped: clamped,
        peeks: [midPeek, plusPeek],
      });
    }
    return {
      show_id: showId,
      atom_count: atoms.length,
      peek_count: peeks.length,
      duration_s: round4(acc),
      atoms,
      peeks,
    };
  }

  function activeFramePeekAt(planOrPeeks, time) {
    const peeks = Array.isArray(planOrPeeks) ? planOrPeeks : (planOrPeeks && Array.isArray(planOrPeeks.peeks) ? planOrPeeks.peeks : []);
    if (!peeks.length) return null;
    const dur = +(peeks[peeks.length - 1].t1 || 0);
    const tc = Math.min(Math.max(0, Number(time) || 0), Math.max(0, dur - 1e-7));
    let inAtom = peeks.filter((p) => tc >= p.t0 - 1e-7 && tc < p.t1 - 1e-7);
    if (!inAtom.length) {
      const lastAtomIdx = peeks[peeks.length - 1].atom_index;
      inAtom = peeks.filter((p) => p.atom_index === lastAtomIdx);
    }
    let best = inAtom[0];
    for (let i = 1; i < inAtom.length; i++) {
      const cand = inAtom[i];
      if (Math.abs(tc - cand.t) < Math.abs(tc - best.t) - 1e-7) best = cand;
    }
    return best;
  }

  // HM-PF-45: bake QA samples this same show time. Pending strips stay not playable;
  // a cell index is a crop of the shared t, not a GIF or CSS timer.
  function stripCellAt(descriptor, time) {
    if (!descriptor || descriptor.status !== 'pending') return null;
    const cadence = descriptor.cadence;
    const geometry = descriptor.geometry;
    const spc = cadence && +cadence.secondsPerCell;
    const frames = geometry && geometry.frames;
    if (!Number.isFinite(spc) || spc <= 0 || !Number.isInteger(frames) || frames < 1) return null;
    const dur = spc * frames;
    const raw = Number(time);
    const tIn = Number.isFinite(raw) ? raw : 0;
    const t = Math.min(Math.max(0, tIn), Math.max(0, dur - 1e-9));
    const index = Math.min(frames - 1, Math.max(0, Math.floor((t / spc) + 1e-9)));
    return {
      index,
      frames,
      secondsPerCell: spc,
      duration_s: round4(dur),
      t: round4(t),
      raw_t: round4(tIn),
      clamped: tIn < 0 || tIn >= dur - 1e-9,
      w: geometry.w,
      h: geometry.h,
      not_playable: true,
      clock: 'renderAt',
    };
  }

  function pendingStripMedia(project) {
    const media = project && Array.isArray(project.media) ? project.media : [];
    return media.filter((item) => item && item.pendingMotion && item.pendingMotion.status === 'pending');
  }

  function bakeQaSnapshot(project, composed, time) {
    const show = project && project.show ? project.show : (project || null);
    const plan = framePeekPlan(project || show, composed);
    const showDur = plan.duration_s || 0;
    const raw = Number(time);
    const tIn = Number.isFinite(raw) ? raw : 0;
    const strips = pendingStripMedia(project).map((item) => {
      const cell = stripCellAt(item.pendingMotion, tIn);
      if (!cell) return null;
      return {
        id: item.id || '',
        name: item.name || 'strip.png',
        src: item.src || '',
        plate_id: item.plateId || 'P01',
        index: cell.index,
        frames: cell.frames,
        secondsPerCell: cell.secondsPerCell,
        duration_s: cell.duration_s,
        t: cell.t,
        raw_t: cell.raw_t,
        clamped: cell.clamped,
        w: cell.w,
        h: cell.h,
        not_playable: true,
        clock: 'renderAt',
      };
    }).filter(Boolean);
    const stripDur = strips.reduce((max, strip) => Math.max(max, strip.duration_s), 0);
    const span = Math.max(showDur, stripDur);
    const t = round4(Math.min(Math.max(0, tIn), span > 0 ? Math.max(0, span - 1e-9) : 0));
    const peek = plan.peeks.length
      ? activeFramePeekAt(plan, Math.min(Math.max(0, t), Math.max(0, showDur - 1e-7)))
      : null;
    const poseRef = !!(show && show.pose_ref_pack && show.pose_ref_pack.kind === 'pose_ref_plate_pack');
    return {
      clock: 'renderAt',
      separateClock: false,
      gifClock: false,
      cssClock: false,
      t,
      show_duration_s: showDur,
      duration_s: round4(span),
      plate_show: !!(show && (isPlatePackShow(show) || poseRef || show.plate_pack === true)),
      pose_ref: poseRef,
      atom_count: plan.atom_count,
      peek_count: plan.peek_count,
      peek,
      peeks: plan.peeks,
      strips,
    };
  }

  function platePackStats(show) {
    const atoms = (show && show.atoms) || [];
    let nHero = 0, nPlate = 0, dur = 0;
    for (const atom of atoms) {
      dur += +atom.duration_s || 0;
      const listed = (atom.hero && atom.hero.plates) || [];
      const npl = Number.isInteger(atom.plates_needed) && atom.plates_needed > 0 ? atom.plates_needed : listed.length;
      nPlate += npl;
      if (atom.pose_mode === 'hero') nHero += 1;
    }
    return { atoms, nHero, nPlate, dur };
  }

  function isPlatePackShow(show) {
    if (!show) return false;
    const stats = platePackStats(show);
    return isParityMode(show, stats.atoms, stats.nHero, stats.nPlate, stats.dur);
  }

  function charHonesty(show) {
    const chars = (show && show.chars) || {};
    const side = (key) => {
      const raw = chars[key] && chars[key].name;
      const name = typeof raw === 'string' ? raw.trim() : '';
      return { side: key, name };
    };
    return { L: side('L'), R: side('R'), parity: isPlatePackShow(show) };
  }

  function assetResolved(project, src) {
    if (typeof src !== 'string' || !src.trim()) return false;
    const value = src.trim();
    if (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(value)) return true;
    if (/^blob:/i.test(value)) return true;
    const embedded = project && project.assets && project.assets[value];
    if (typeof embedded === 'string') return /^data:image\/(png|jpeg|webp|gif);base64,/i.test(embedded);
    if (/^(javascript:|https?:|\/\/|data:)/i.test(value)) return false;
    if (value.includes('..') || value.includes('\\')) return false;
    return /^[A-Za-z0-9_./-]+$/.test(value);
  }

  function pushChecklist(list, item) {
    if (list.some((row) => row.kind === item.kind && row.text === item.text)) return;
    list.push(item);
  }

  function parityDirtyChecklist(project) {
    const show = project && project.show;
    if (!isPlatePackShow(show)) return { active: false, parity: false, blocks: [], warns: [], clean: true };
    const blocks = [];
    const warns = [];
    const layouts = (project && project.layouts) || {};
    const honesty = charHonesty(show);
    if (!honesty.L.name) pushChecklist(warns, { kind: 'char', level: 'warn', text: 'L name missing from show.chars' });
    if (!honesty.R.name) pushChecklist(warns, { kind: 'char', level: 'warn', text: 'R name missing from show.chars' });
    (show.atoms || []).forEach((atom, index) => {
      const where = atom.label || atom.id || ('clip ' + (index + 1));
      const hero = atom.hero || {};
      const plates = Array.isArray(hero.plates) ? hero.plates : [];
      const need = Number.isInteger(atom.plates_needed) && atom.plates_needed > 0 ? atom.plates_needed : plates.length;
      if (!plates.length || plates.length < need) {
        pushChecklist(warns, { kind: 'plate', level: 'warn', atom_id: atom.id || null, text: 'Missing plate · ' + where + ' · ' + plates.length + '/' + (need || 0) });
      }
      const layout = hero.layout_source ? layouts[hero.layout_source] : null;
      if (!hero.layout_source || !layout) {
        pushChecklist(warns, { kind: 'plate', level: 'warn', atom_id: atom.id || null, text: 'Missing plate · ' + where + ' · no layout' });
        return;
      }
      const dir = dirname(hero.layout_source);
      plates.forEach((pid) => {
        const entry = layout[pid];
        if (!entry) {
          pushChecklist(warns, { kind: 'plate', level: 'warn', atom_id: atom.id || null, text: 'Missing plate · ' + where + ' · ' + pid });
          return;
        }
        if (entry.full) {
          const src = joinRel(dir, entry.full);
          if (!assetResolved(project, src) && !assetResolved(project, entry.full)) {
            pushChecklist(blocks, { kind: 'asset', level: 'block', atom_id: atom.id || null, text: 'Unresolved asset · ' + where + ' · plate ' + pid });
          }
        } else if (Array.isArray(entry.parts) && entry.parts.length) {
          entry.parts.forEach((part, pi) => {
            if (!part || !part.src) {
              pushChecklist(blocks, { kind: 'plate', level: 'block', atom_id: atom.id || null, text: 'Missing plate · ' + where + ' · ' + pid + ' part ' + (pi + 1) });
              return;
            }
            const src = joinRel(dir, part.src);
            if (!assetResolved(project, src) && !assetResolved(project, part.src)) {
              pushChecklist(blocks, { kind: 'asset', level: 'block', atom_id: atom.id || null, text: 'Unresolved asset · ' + where + ' · ' + pid });
            }
          });
        } else {
          pushChecklist(blocks, { kind: 'plate', level: 'block', atom_id: atom.id || null, text: 'Missing plate · ' + where + ' · ' + pid + ' has no image' });
        }
        if (entry.bg) {
          const mapped = mapLayoutBgToKey(entry.bg, show.bg || {});
          if (!mapped) pushChecklist(warns, { kind: 'bg', level: 'warn', atom_id: atom.id || null, text: 'Broken BG · ' + where + ' · layout bg ' + entry.bg + ' does not match show.bg' });
        }
        if (entry.background && Object.prototype.hasOwnProperty.call(entry.background, 'src') && entry.background.src && !assetResolved(project, entry.background.src)) {
          pushChecklist(blocks, { kind: 'bg', level: 'block', atom_id: atom.id || null, text: 'Broken BG · ' + where + ' · ' + pid });
        }
      });
      if (atom.background && Object.prototype.hasOwnProperty.call(atom.background, 'src') && atom.background.src && !assetResolved(project, atom.background.src)) {
        pushChecklist(blocks, { kind: 'bg', level: 'block', atom_id: atom.id || null, text: 'Broken BG · ' + where });
      }
    });
    const bg = show.bg || {};
    ['base', 'swap'].forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(bg, key)) return;
      const src = bg[key];
      if (src == null) return;
      if (typeof src !== 'string' || !src.trim() || !assetResolved(project, src)) {
        pushChecklist(blocks, { kind: 'bg', level: 'block', text: 'Broken BG · ' + key });
      }
    });
    if (bg.swap_t != null && bg.swap_t !== '' && !bg.swap) {
      pushChecklist(blocks, { kind: 'bg', level: 'block', text: 'Broken BG · swap time without a swap image' });
    }
    (show.overlays || []).forEach((overlay, i) => {
      if (!overlay || overlay.src == null || overlay.src === '') return;
      if (!assetResolved(project, overlay.src)) {
        pushChecklist(blocks, { kind: 'asset', level: 'block', text: 'Unresolved asset · overlay ' + (overlay.id || (i + 1)) });
      }
    });
    ((show.fg && show.fg.props) || []).forEach((prop, i) => {
      if (prop && prop.src && !assetResolved(project, prop.src)) {
        pushChecklist(blocks, { kind: 'asset', level: 'block', text: 'Unresolved asset · foreground ' + (prop.id || (i + 1)) });
      }
      const broken = prop && prop.effect && prop.effect.broken_src;
      if (broken && !assetResolved(project, broken)) {
        pushChecklist(blocks, { kind: 'asset', level: 'block', text: 'Unresolved asset · foreground break image ' + (prop.id || (i + 1)) });
      }
    });
    return { active: true, parity: true, blocks, warns, clean: blocks.length === 0 && warns.length === 0 };
  }

  const DEFAULT_CAM_PRESET_IDS = Object.freeze([
    'low_rise',
    'eye_orbit',
    'eye_push',
    'ecu_jitter',
    'low_dive_under',
    'upward_inside',
    'ots_R_hold',
    'eye_lateral',
    'waist_ots_chase',
    'fence_sweep_roll',
    'floor_hold',
    'eye_hold',
    'floor_race',
    'whip_A_to_B',
    'high_dive',
    'box_side_pan',
    'face_whip',
    'pass_between',
    'dutch_spiral',
    'ecu_fist_lens',
    'low_hold',
    'high_hold',
    'ots_L_hold',
    'pull_aftermath',
    'rise_from_floor',
    'dutch_snap',
    'static_hold',
    'slow_push',
    'slow_pull',
    'slide_left',
    'slide_right',
    'gentle_orbit',
  ]);

  const SHOW_LINT_CONTRACT = Object.freeze({
    id: 'HM-HF-03-SHOW-JSON-LINT',
    absorbs: Object.freeze(['HM-RHYTHM-LINT', 'HM-HF-13']),
    blocksBake: false,
    structuralCodes: Object.freeze([
      'missing_plate',
      'atom_overrun',
      'empty_cam_preset',
      'bad_fx_t_rel',
      'unsafe_duration',
      'duration_target_invalid',
    ]),
    rhythmCodes: Object.freeze([
      'adjacent_same_cam',
      'duration_outlier',
      'duration_target_mismatch',
    ]),
    bridgeCodes: Object.freeze([
      'beat_id_conflict',
    ]),
    grammarCodes: Object.freeze([
      'scene_missing_wide',
    ]),
    rhythmWindow: Object.freeze({
      target_median_s: 0.5,
      max_s: 1.4,
      min_floor_s: 0.1,
      hard_freeze_s: 3.0,
    }),
    // Plate-pack rest camera. The 5.00s demo and street sample are authored
    // entirely as static_hold; repeating it is the baseline, not a jump-cut.
    neutralCamPreset: 'static_hold',
  });

  function resolveKnownCamSet(cameraPresets) {
    const set = new Set(DEFAULT_CAM_PRESET_IDS);
    const list = Array.isArray(cameraPresets)
      ? cameraPresets
      : (cameraPresets && Array.isArray(cameraPresets.presets) ? cameraPresets.presets : []);
    list.forEach((p) => { if (p && p.id) set.add(p.id); });
    if (cameraPresets && typeof cameraPresets === 'object' && !Array.isArray(cameraPresets) && !Array.isArray(cameraPresets.presets)) {
      Object.keys(cameraPresets).forEach((k) => set.add(k));
    }
    return set;
  }

  function effectiveAtomCamPreset(atom) {
    const cam = atom && atom.camera;
    if (!cam || typeof cam !== 'object') return '';
    const p = typeof cam.preset === 'string' ? cam.preset.trim() : '';
    if (p && p !== 'none') return p;
    if (Array.isArray(cam.segments) && cam.segments.length) {
      const s0 = cam.segments[0] && typeof cam.segments[0].preset === 'string' ? cam.segments[0].preset.trim() : '';
      return s0 && s0 !== 'none' ? s0 : '';
    }
    return '';
  }

  function medianOfNumbers(values) {
    const sorted = values.filter((n) => Number.isFinite(n) && n > 0).slice().sort((a, b) => a - b);
    if (!sorted.length) return 0.5;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : round4((sorted[mid - 1] + sorted[mid]) / 2);
  }

  function lintShow(showOrProject, opts) {
    opts = opts || {};
    const isProject = !!(showOrProject && typeof showOrProject === 'object' && showOrProject.show && typeof showOrProject.show === 'object');
    const project = isProject ? showOrProject : { show: showOrProject || {}, layouts: opts.layouts || null, media: opts.media || [], assets: opts.assets || {} };
    const show = (project && project.show) || {};
    const atoms = Array.isArray(show.atoms) ? show.atoms : [];
    const layouts = project.layouts || opts.layouts || null;
    const hasLayouts = !!(layouts && typeof layouts === 'object' && Object.keys(layouts).length > 0);
    const knownCams = resolveKnownCamSet(opts.cameraPresets);
    const knownFx = resolveFxMap(opts.fxPresets);
    const findings = [];
    const seen = new Set();

    function pushFinding(code, message, fix, atom, index, category) {
      const atomId = atom && typeof atom.id === 'string' && atom.id.trim() ? atom.id.trim() : (typeof atom === 'string' && atom ? atom : undefined);
      const atomIdx = Number.isInteger(index) && index >= 0 ? index : undefined;
      const fixText = String(fix || '').trim();
      const normalizedFix = (fixText.startsWith('Fix: ') ? fixText : 'Fix: ' + fixText.replace(/^fix:\s*/i, '')).replace(/\.*$/, '.');
      const key = code + '|' + (atomId || '') + '|' + message;
      if (seen.has(key)) return;
      seen.add(key);
      const item = {
        code,
        message,
        fix: normalizedFix,
        ...(atomId ? { atom_id: atomId } : {}),
        ...(atomIdx !== undefined ? { atom_index: atomIdx } : {}),
        category: category || (SHOW_LINT_CONTRACT.rhythmCodes.indexOf(code) >= 0 ? 'rhythm' : 'structural'),
        severity: 'warn',
        blocksBake: false,
      };
      findings.push(item);
    }

    const durations = atoms.map((a) => +a?.duration_s);
    const medianDur = medianOfNumbers(durations);
    const targetDur = Number.isFinite(+show.duration_target_s) && +show.duration_target_s > 0 ? +show.duration_target_s : null;
    let totalDur = 0;
    let overrunReported = false;

    atoms.forEach((atom, i) => {
      if (!atom || typeof atom !== 'object') return;
      const atomId = atom.id || ('atom_' + String(i + 1).padStart(2, '0'));
      const label = atom.label ? atomId + ' (' + atom.label + ')' : atomId;
      const d = +atom.duration_s;

      // 1. Structural: unsafe_duration
      if (!Number.isFinite(d) || d < SHOW_LINT_CONTRACT.rhythmWindow.min_floor_s) {
        pushFinding(
          'unsafe_duration',
          label + ': duration_s (' + String(atom.duration_s) + 's) is below the 0.10s minimum floor',
          'Fix: Set the clip duration_s to a finite value of at least 0.10 seconds.',
          atomId,
          i,
          'structural'
        );
      } else if (d > SHOW_LINT_CONTRACT.rhythmWindow.hard_freeze_s) {
        pushFinding(
          'unsafe_duration',
          label + ': duration_s (' + d.toFixed(2) + 's) exceeds the 3.00s static freeze ceiling',
          'Fix: Trim duration_s to 3.00 seconds or less, or split the hold across multiple plates.',
          atomId,
          i,
          'structural'
        );
      }

      if (Number.isFinite(d) && d > 0) {
        const prevTotal = totalDur;
        totalDur = round4(totalDur + d);
        if (targetDur != null && !overrunReported && totalDur > targetDur + 1e-3 && prevTotal <= targetDur + 1e-3) {
          overrunReported = true;
          pushFinding(
            'atom_overrun',
            label + ': cumulative runtime reaches ' + totalDur.toFixed(2) + 's and overruns duration_target_s (' + targetDur.toFixed(2) + 's)',
            'Fix: Trim clip durations or use the Fit timing chips so the total runtime stays within duration_target_s.',
            atomId,
            i,
            'structural'
          );
        }
      }

      // 2. Structural: missing_plate (hero / layout / plate ID / 404 / unresolved asset)
      const hero = atom.hero && typeof atom.hero === 'object' ? atom.hero : null;
      const plates = hero && Array.isArray(hero.plates) ? hero.plates : [];
      const need = Number.isInteger(atom.plates_needed) && atom.plates_needed > 0 ? atom.plates_needed : (plates.length || 1);
      const lsrc = hero && typeof hero.layout_source === 'string' ? hero.layout_source.trim() : '';

      if (!hero || !lsrc) {
        pushFinding(
          'missing_plate',
          label + ': missing hero.layout_source for plate lookup',
          'Fix: Set hero.layout_source to a valid layout JSON path included in the project.',
          atomId,
          i,
          'structural'
        );
      } else if (hasLayouts && !layouts[lsrc]) {
        pushFinding(
          'missing_plate',
          label + ': layout_source "' + lsrc + '" is missing or returned 404',
          'Fix: Set hero.layout_source to a valid layout JSON path included in the project.',
          atomId,
          i,
          'structural'
        );
      } else {
        if (!plates.length || plates.length < need) {
          pushFinding(
            'missing_plate',
            label + ': missing plate assignment (' + plates.length + '/' + need + ' plates assigned)',
            'Fix: Select this clip and choose a library plate so every required plate slot is filled.',
            atomId,
            i,
            'structural'
          );
        }
        const layout = hasLayouts ? layouts[lsrc] : null;
        const ldir = dirname(lsrc);
        plates.forEach((pid, slotIdx) => {
          const pidStr = String(pid || '').trim();
          if (!pidStr || /404|missing/i.test(pidStr)) {
            if (!layout || !layout[pidStr]) {
              pushFinding(
                'missing_plate',
                label + ': plate "' + (pidStr || ('slot ' + (slotIdx + 1))) + '" is missing or unresolved (404)',
                'Fix: Assign an existing plate ID from the active layout or import the missing image in the Media panel.',
                atomId,
                i,
                'structural'
              );
              return;
            }
          }
          if (layout) {
            const entry = layout[pidStr];
            if (!entry || entry.missing === true || entry.status === 404) {
              pushFinding(
                'missing_plate',
                label + ': plate "' + pidStr + '" not found in ' + lsrc + ' (missing plate / 404)',
                'Fix: Assign an existing plate ID from the active layout or import the missing image in the Media panel.',
                atomId,
                i,
                'structural'
              );
              return;
            }
            if (entry.full) {
              const src = joinRel(ldir, entry.full);
              if ((!assetResolved(project, src) && !assetResolved(project, entry.full)) || /404|missing/i.test(String(entry.full))) {
                pushFinding(
                  'missing_plate',
                  label + ': plate "' + pidStr + '" image path "' + entry.full + '" is unresolved or 404',
                  'Fix: Replace the unresolved image path with a local library plate or embedded project asset.',
                  atomId,
                  i,
                  'structural'
                );
              }
            } else if (Array.isArray(entry.parts) && entry.parts.length) {
              entry.parts.forEach((part, pi) => {
                if (!part || !part.src) {
                  pushFinding(
                    'missing_plate',
                    label + ': plate "' + pidStr + '" part ' + (pi + 1) + ' is missing an image source',
                    'Fix: Assign an existing plate ID from the active layout or import the missing image in the Media panel.',
                    atomId,
                    i,
                    'structural'
                  );
                  return;
                }
                const src = joinRel(ldir, part.src);
                if (!assetResolved(project, src) && !assetResolved(project, part.src)) {
                  pushFinding(
                    'missing_plate',
                    label + ': plate "' + pidStr + '" cutout "' + part.src + '" is unresolved',
                    'Fix: Replace the unresolved image path with a local library plate or embedded project asset.',
                    atomId,
                    i,
                    'structural'
                  );
                }
              });
            } else {
              pushFinding(
                'missing_plate',
                label + ': plate "' + pidStr + '" has no full image or cutout parts',
                'Fix: Assign an existing plate ID from the active layout or import the missing image in the Media panel.',
                atomId,
                i,
                'structural'
              );
            }
          }
        });
      }

      // 3. Structural: empty_cam_preset
      const cam = atom.camera && typeof atom.camera === 'object' ? atom.camera : null;
      const segs = cam && Array.isArray(cam.segments) ? cam.segments : null;
      const topPreset = cam && typeof cam.preset === 'string' ? cam.preset.trim() : '';
      if (!cam || (!topPreset && (!segs || !segs.length)) || topPreset === 'none') {
        pushFinding(
          'empty_cam_preset',
          label + ': camera preset is empty or missing',
          'Fix: Choose a valid camera motion preset such as static_hold or slow_push in Clip Settings.',
          atomId,
          i,
          'structural'
        );
      } else if (topPreset && !knownCams.has(topPreset)) {
        pushFinding(
          'empty_cam_preset',
          label + ': unknown camera preset "' + topPreset + '"',
          'Fix: Choose a valid camera motion preset such as static_hold or slow_push in Clip Settings.',
          atomId,
          i,
          'structural'
        );
      }
      if (segs && segs.length) {
        segs.forEach((s, si) => {
          const sp = s && typeof s.preset === 'string' ? s.preset.trim() : '';
          if (!sp || sp === 'none') {
            pushFinding(
              'empty_cam_preset',
              label + ': camera segment ' + (si + 1) + ' has an empty camera preset',
              'Fix: Choose a valid camera motion preset such as static_hold or slow_push in Clip Settings.',
              atomId,
              i,
              'structural'
            );
          } else if (!knownCams.has(sp)) {
            pushFinding(
              'empty_cam_preset',
              label + ': camera segment ' + (si + 1) + ' uses unknown preset "' + sp + '"',
              'Fix: Choose a valid camera motion preset such as static_hold or slow_push in Clip Settings.',
              atomId,
              i,
              'structural'
            );
          }
        });
      }

      // 4. Structural: atom_overrun (camera segments sum mismatch / overrun)
      if (segs && segs.length && Number.isFinite(d) && d > 0) {
        const segSum = segs.reduce((acc, s) => acc + (+(s && s.dur_s) || 0), 0);
        if (Math.abs(segSum - d) > 1e-3) {
          pushFinding(
            'atom_overrun',
            label + ': camera.segments sum (' + segSum.toFixed(2) + 's) does not match atom duration_s (' + d.toFixed(2) + 's)',
            'Fix: Rescale camera.segments durations or toggle Dual-segment cam so segment times sum to duration_s.',
            atomId,
            i,
            'structural'
          );
        }
      }

      // 5. Structural: bad_fx_t_rel & FX atom_overrun
      const hooks = Array.isArray(atom.fx_hooks) ? atom.fx_hooks : [];
      hooks.forEach((rawHk, hi) => {
        const hk = typeof rawHk === 'string' ? { type: rawHk, t_rel: 0.08, params: {} } : (rawHk || {});
        const type = typeof hk.type === 'string' ? hk.type.trim() : '';
        if (!type || (!knownFx[type] && !isPixelfxHook(hk))) {
          pushFinding(
            'bad_fx_t_rel',
            label + ': fx_hooks[' + hi + '] has invalid or unknown type "' + (type || '(empty)') + '"',
            'Fix: Pick a supported impact or atmosphere chip in Clip Settings or remove the invalid fx_hooks entry.',
            atomId,
            i,
            'structural'
          );
        }
        if (hk.t_rel !== undefined) {
          const tr = +hk.t_rel;
          if (!Number.isFinite(tr) || tr < 0 || tr > 1) {
            pushFinding(
              'bad_fx_t_rel',
              label + ': fx_hooks[' + hi + '] (' + (type || 'fx') + ') t_rel=' + String(hk.t_rel) + ' is outside [0, 1]',
              'Fix: Set fx_hooks t_rel and t_rel_end to normalized values between 0 and 1 with t_rel_end greater than t_rel.',
              atomId,
              i,
              'structural'
            );
          }
        }
        if (hk.t_rel_end !== undefined) {
          const tre = +hk.t_rel_end;
          const tr = hk.t_rel !== undefined && Number.isFinite(+hk.t_rel) ? +hk.t_rel : 0.08;
          if (!Number.isFinite(tre) || tre < 0 || tre > 1 || tre <= tr) {
            pushFinding(
              'bad_fx_t_rel',
              label + ': fx_hooks[' + hi + '] (' + (type || 'fx') + ') t_rel_end=' + String(hk.t_rel_end) + ' must be in (t_rel, 1]',
              'Fix: Set fx_hooks t_rel and t_rel_end to normalized values between 0 and 1 with t_rel_end greater than t_rel.',
              atomId,
              i,
              'structural'
            );
          }
          if (Number.isFinite(tre) && tre > 1) {
            pushFinding(
              'atom_overrun',
              label + ': fx_hooks[' + hi + '] (' + (type || 'fx') + ') t_rel_end=' + tre.toFixed(2) + ' overruns the end of the atom',
              'Fix: Shorten the FX hook duration or move t_rel earlier so the effect finishes inside the clip.',
              atomId,
              i,
              'structural'
            );
          }
        }
        const explicitDur = hk.params && hk.params.dur != null ? +hk.params.dur : null;
        const trValid = hk.t_rel !== undefined && Number.isFinite(+hk.t_rel) && +hk.t_rel >= 0 && +hk.t_rel <= 1 ? +hk.t_rel : 0.08;
        if (explicitDur != null && Number.isFinite(explicitDur) && Number.isFinite(d) && d > 0) {
          const endS = trValid * d + explicitDur;
          if (endS > d + 1e-3) {
            pushFinding(
              'atom_overrun',
              label + ': fx_hooks[' + hi + '] (' + (type || 'fx') + ') span (' + endS.toFixed(2) + 's) overruns atom duration (' + d.toFixed(2) + 's)',
              'Fix: Shorten the FX hook duration or move t_rel earlier so the effect finishes inside the clip.',
              atomId,
              i,
              'structural'
            );
          }
        }
      });

      // 6. Rhythm (#39 absorbed): adjacent_same_cam
      if (i > 0) {
        const prevAtom = atoms[i - 1];
        const prevCam = effectiveAtomCamPreset(prevAtom);
        const curCam = effectiveAtomCamPreset(atom);
        const sameChain = !!(
          prevAtom?.camera?.chain?.id &&
          atom?.camera?.chain?.id &&
          prevAtom.camera.chain.id === atom.camera.chain.id
        );
        if (prevCam && curCam && prevCam === curCam && prevCam !== SHOW_LINT_CONTRACT.neutralCamPreset && !sameChain) {
          const prevId = prevAtom.id || ('atom_' + String(i).padStart(2, '0'));
          pushFinding(
            'adjacent_same_cam',
            label + ': repeats camera preset "' + curCam + '" from previous clip ' + prevId,
            'Fix: Switch one of the adjacent clips to a contrasting camera preset or chain them intentionally.',
            atomId,
            i,
            'rhythm'
          );
        }
      }

      // 7. Rhythm (#39 absorbed): duration_outlier (sparse vs median ~0.5s / max <= 1.4s)
      if (Number.isFinite(d) && d > 0) {
        const overStreetMax = d > SHOW_LINT_CONTRACT.rhythmWindow.max_s;
        const sparseVsMedian = atoms.length >= 3 && d > 1.0 && medianDur <= 0.85 && d >= medianDur * 2.2;
        if (overStreetMax || sparseVsMedian) {
          pushFinding(
            'duration_outlier',
            label + ': duration ' + d.toFixed(2) + 's is a sparse rhythm outlier vs street density (median ' + medianDur.toFixed(2) + 's, max 1.40s)',
            'Fix: Trim this clip toward the street rhythm window (around 0.50s median, 1.40s max) or split it into faster cuts.',
            atomId,
            i,
            'rhythm'
          );
        }
      }
    });

    // Show-level duration ceiling check
    if (totalDur > 120) {
      const lastAtom = atoms[atoms.length - 1];
      pushFinding(
        'unsafe_duration',
        'show "' + (show.show_id || 'untitled') + '": total duration ' + totalDur.toFixed(2) + 's exceeds the 120.00s maximum sequence limit',
        'Fix: Shorten or remove clips so the total sequence runtime stays at or below 120 seconds.',
        lastAtom && lastAtom.id ? lastAtom.id : undefined,
        atoms.length ? atoms.length - 1 : undefined,
        'structural'
      );
    }

    // Fold any remaining project-level dirtyChecklist items (BG / overlay / FG / chars) into missing_plate so the Lint panel is the single place
    if (isProject) {
      const dirt = parityDirtyChecklist(project);
      const extraRows = [...(dirt.blocks || []), ...(dirt.warns || [])];
      extraRows.forEach((row) => {
        if (!row || !row.text) return;
        // Avoid duplicating per-atom plate messages already captured above
        if (row.kind === 'plate' && row.atom_id && findings.some((f) => f.code === 'missing_plate' && f.atom_id === row.atom_id)) {
          return;
        }
        const atomIdx = row.atom_id ? atoms.findIndex((a) => a && a.id === row.atom_id) : -1;
        const fixLine = row.kind === 'char'
          ? 'Fix: Add both L and R character names under show.chars in the show JSON.'
          : 'Fix: Replace the unresolved image path with a local library plate or embedded project asset.';
        pushFinding(
          'missing_plate',
          row.text,
          fixLine,
          row.atom_id || undefined,
          atomIdx >= 0 ? atomIdx : undefined,
          'structural'
        );
      });
    }

    lintBeatBridge(show, opts.board).forEach((c) => {
      pushFinding(
        'beat_id_conflict',
        c.message,
        c.fix,
        c.atom_id || c.beat_id,
        Number.isInteger(c.index) ? c.index : undefined,
        'bridge'
      );
    });

    lintCameraGrammar(show).forEach((g) => {
      pushFinding(
        g.code,
        g.message,
        g.fix,
        g.atom_id,
        g.atom_index,
        'grammar'
      );
    });

    const timing = rhythmTiming(show);
    if (!timing.durations_valid) pushFinding('unsafe_duration',
      'Rhythm total is unknown: missing or invalid duration on ' + timing.invalid_beats.join(', '),
      'Set every clip duration_s to a finite number of at least 0.10 seconds before bake.', undefined, undefined, 'structural');
    if (!timing.target_valid) pushFinding('duration_target_invalid', 'Rhythm target must be a finite number between 0.1 and 120 seconds.',
      'Set duration_target_s to a valid target or clear the optional target.', undefined, undefined, 'structural');
    if (timing.state === 'drift') pushFinding('duration_target_mismatch',
      'Rhythm total ' + timing.total_s.toFixed(4) + 's vs target ' + timing.target_s.toFixed(4) + 's; delta ' + (timing.delta_s > 0 ? '+' : '') + timing.delta_s.toFixed(4) + 's.',
      'Edit clip durations or regenerate the rhythm plan to match the target.', undefined, undefined, 'rhythm');

    const byCode = {};
    findings.forEach((f) => {
      byCode[f.code] = (byCode[f.code] || 0) + 1;
    });

    return {
      contract: SHOW_LINT_CONTRACT.id,
      show_id: show.show_id || '',
      count: findings.length,
      clean: findings.length === 0,
      blocksBake: false,
      median_duration_s: medianDur,
      total_duration_s: timing.total_s,
      rhythm_timing: timing,
      by_code: byCode,
      findings,
    };
  }

  function lintCameraGrammar(show) {
    const atoms = Array.isArray(show?.atoms) ? show.atoms : [];
    const roleOf = (a) => (a && (a.camera_grammar?.role || a.grammar_role || a.motion?.grammar_role)) || '';
    const hasGrammar = Boolean(
      show?.camera_authoring ||
      show?.meta?.grammar === 'Fight Camera Grammar' ||
      atoms.some((a) => roleOf(a) || a?.camera_grammar?.scene_id)
    );
    if (!hasGrammar || !atoms.length) return [];
    const scenes = new Map();
    atoms.forEach((atom, index) => {
      const sceneId = (atom && (atom.camera_grammar?.scene_id || atom.scene_id)) || 'scene-01';
      if (!scenes.has(sceneId)) scenes.set(sceneId, []);
      scenes.get(sceneId).push({ atom, index, role: roleOf(atom) });
    });
    const out = [];
    for (const [sceneId, items] of scenes) {
      if (!items.some((item) => item.role === 'Wide')) {
        const anchor = items[items.length - 1];
        out.push({
          code: 'scene_missing_wide',
          scene_id: sceneId,
          message: 'Scene "' + sceneId + '" has zero Wide beats; camera grammar requires a Wide re-establish beat.',
          fix: 'Fix: Use the Wide re-establish picker in Scene camera grammar to insert or mark a Wide beat with an existing establish preset.',
          atom_id: anchor?.atom?.id,
          atom_index: anchor?.index,
          category: 'grammar',
        });
      }
    }
    return out;
  }

  function requireHoldSeconds(value, label) {
    const n = +value;
    if (!Number.isFinite(n) || n < 0.1 || n > 120) {
      throw new Error(label + ' must be between 0.1 and 120 seconds.');
    }
    return round4(n);
  }

  function syncSegmentDurations(cam, dur) {
    if (!cam || !cam.segments || !cam.segments.length) return;
    const sum = cam.segments.reduce((s, x) => s + (+x.dur_s || 0), 0);
    if (!(sum > 0)) return;
    let acc = 0;
    cam.segments.forEach((s, i) => {
      if (i === cam.segments.length - 1) s.dur_s = round4(dur - acc);
      else {
        s.dur_s = round4((s.dur_s / sum) * dur);
        acc = round4(acc + s.dur_s);
      }
    });
  }

  function isFightImpact(atom, pack) {
    const beat = (atom && atom.motion && atom.motion.beat_class) || '';
    const classes = (pack && pack.impact_beat_classes) || [];
    if (classes.indexOf(beat) >= 0) return true;
    const fx = (pack && pack.impact_fx) || [];
    const hooks = (atom && atom.fx_hooks) || [];
    for (let i = 0; i < hooks.length; i++) {
      const hook = hooks[i];
      const type = typeof hook === 'string' ? hook : hook && hook.type;
      if (fx.indexOf(type) >= 0) return true;
    }
    return false;
  }

  function timingHoldMeta(atom) {
    const t = atom && atom.timing_hold;
    if (!t || typeof t !== 'object' || typeof t.pack !== 'string' || !t.pack) return null;
    const meta = {
      pack: t.pack,
      kind: typeof t.kind === 'string' ? t.kind : '',
      soft_cam: t.soft_cam === true,
    };
    if (typeof t.preset === 'string' && t.preset) meta.preset = t.preset;
    return meta;
  }

  function applyHoldPack(atom, pack, softCam) {
    const floor = requireHoldSeconds(pack.duration_floor_s, 'Dialogue hold floor');
    const next = deepClone(atom);
    next.duration_s = round4(Math.max(+next.duration_s || 0, floor));
    const useSoft = softCam === true;
    if (useSoft) {
      const soft = pack.soft_cam || {};
      if (!soft.preset || typeof soft.preset !== 'string') throw new Error('Soft camera needs a preset.');
      const intensity = soft.intensity == null ? 1 : +soft.intensity;
      if (!Number.isFinite(intensity) || intensity < 0 || intensity > 2) throw new Error('Soft camera intensity must be between 0 and 2.');
      next.camera = { preset: soft.preset, intensity: round4(intensity) };
    } else if (next.camera && next.camera.segments) {
      syncSegmentDurations(next.camera, next.duration_s);
    }
    next.timing_hold = { pack: pack.id, kind: 'hold', soft_cam: useSoft };
    return next;
  }

  function applyMicroPack(atom, pack, flurryIndex) {
    const next = deepClone(atom);
    if (isFightImpact(atom, pack)) {
      const hold = requireHoldSeconds(pack.impact_hold_s, 'Impact hold');
      const preset = pack.impact_preset || 'static_hold';
      next.duration_s = round4(Math.max(+next.duration_s || 0, hold));
      next.camera = { preset: preset, intensity: 1 };
      next.timing_hold = { pack: pack.id, kind: 'impact_hold', soft_cam: false, preset: preset };
      return next;
    }
    const short = requireHoldSeconds(pack.short_hold_s, 'Micro-cut hold');
    const presets = pack.flurry_presets || [];
    if (!presets.length) throw new Error('Micro-cut pack needs flurry presets.');
    const preset = presets[flurryIndex % presets.length];
    next.duration_s = short;
    next.camera = { preset: preset, intensity: 1 };
    next.timing_hold = { pack: pack.id, kind: 'micro_cut', soft_cam: false, preset: preset };
    return next;
  }

  function applyTimingPack(show, selectedIndices, pack, opts) {
    if (!show || !Array.isArray(show.atoms)) throw new Error('Timing pack needs a show.');
    if (!pack || (pack.kind !== 'hold' && pack.kind !== 'micro_cut')) throw new Error('Unknown timing pack.');
    if (!pack.id) throw new Error('Timing pack needs an id.');
    const selected = [];
    const seen = {};
    const list = selectedIndices || [];
    for (let i = 0; i < list.length; i++) {
      const idx = list[i];
      if (!Number.isInteger(idx) || idx < 0 || idx >= show.atoms.length || seen[idx]) continue;
      seen[idx] = true;
      selected.push(idx);
    }
    selected.sort((a, b) => a - b);
    if (!selected.length) throw new Error('Select a clip before applying a timing pack.');
    // Unselected clips stay byte-for-byte, so a fight impact holds only when that index was selected.
    const next = deepClone(show);
    const softCam = !!(opts && opts.softCam);
    let flurry = 0;
    for (let s = 0; s < selected.length; s++) {
      const i = selected[s];
      if (pack.kind === 'hold') next.atoms[i] = applyHoldPack(next.atoms[i], pack, softCam);
      else {
        const impact = isFightImpact(next.atoms[i], pack);
        next.atoms[i] = applyMicroPack(next.atoms[i], pack, flurry);
        if (!impact) flurry += 1;
      }
    }
    return next;
  }

  // HM-PF-11..14. One rhythm contract, shared by the local skill and composer.
  function rhythmTiming(show) {
    const atoms = Array.isArray(show?.atoms) ? show.atoms : [];
    const invalid = Array.isArray(show?.atoms) ? atoms.filter(a => !a || typeof a.duration_s !== 'number' || !Number.isFinite(a.duration_s) || a.duration_s < 0.1 || a.duration_s > 120) : [null];
    const valid = invalid.length === 0;
    const total = valid ? round4(atoms.reduce((sum, a) => sum + a.duration_s, 0)) : null;
    const raw = show?.duration_target_s;
    const targetValid = raw === undefined || (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0.1 && raw <= 120);
    const target = raw === undefined || !targetValid ? null : raw;
    const delta = valid && target !== null ? round4(total - target) : null;
    return { durations_valid: valid, target_valid: targetValid, total_s: total, target_s: target, delta_s: delta,
      state: !valid || !targetValid ? 'invalid' : target === null ? 'unset' : delta === 0 ? 'match' : 'drift',
      invalid_beats: invalid.map(a => a?.id || '(missing clip)') };
  }

  function rhythmPacks(doc) {
    const packs = doc?.packs;
    if (!Array.isArray(packs)) throw new Error('Load the shipped timing_hold_packs.json.');
    for (const id of ['dialogue_film_slow', 'micro_cut_flurry']) {
      if (packs.filter(p => p.id === id).length !== 1) throw new Error('Missing or duplicate shipped timing pack: ' + id);
    }
    return packs;
  }

  function impactBudget(show, timingPacks) {
    const micro = rhythmPacks(timingPacks).find(p => p.id === 'micro_cut_flurry');
    const impacts = (show?.atoms || []).filter(a => isFightImpact(a, micro) || a?.timing_hold?.kind === 'impact_hold' ||
      (a?.fx_hooks || []).some(h => /^impacts\//.test(typeof h === 'string' ? h : h?.type || '')));
    const budget = show?.rhythm?.impact_budget;
    const configured = Number.isInteger(budget) && budget >= 0 && budget <= 300;
    const timeValid = impacts.every(a => typeof a.duration_s === 'number' && Number.isFinite(a.duration_s) && a.duration_s >= 0.1);
    return { slots_used: impacts.length, budget: configured ? budget : null,
      remaining: configured ? budget - impacts.length : null, over_budget: configured && impacts.length > budget,
      impact_time_s: timeValid ? round4(impacts.reduce((sum, a) => sum + a.duration_s, 0)) : null };
  }

  function rhythmBoardFromShow(show) {
    const derived = boardFromShow(show);
    if (!derived.ok) throw new Error('Fix storyboard beat IDs before exporting rhythm input.');
    const board = derived.board;
    board.beats.forEach((beat, i) => {
      const atom = show.atoms[i];
      beat.duration_s = atom.duration_s;
      beat.motion = atom.motion ? deepClone(atom.motion) : null;
      beat.fx_hooks = deepClone(atom.fx_hooks || []);
      if (atom.timing_hold?.pack) {
        beat.timing_pack = atom.timing_hold.pack;
        beat.soft_cam = atom.timing_hold.soft_cam === true;
      }
    });
    return board;
  }

  function rhythmBoardSnapshot(board) {
    const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
    return JSON.stringify(sorted(board));
  }

  function requireRhythmApproval(board, approval) {
    if (approval?.Decision !== 'Approve' || approval.show_id !== board.show_id || approval.step !== 2 || approval.step_id !== 'story' ||
        approval.story_snapshot !== rhythmBoardSnapshot(board)) {
      throw new Error('Jack GO required: supply the step 2 Approve record bound to this exact board.');
    }
  }

  function rhythmBeatIds(board) {
    if (!board || typeof board.show_id !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(board.show_id) || !Array.isArray(board.beats) || !board.beats.length || board.beats.length > 300) throw new Error('Rhythm needs a board with show_id and 1–300 beats.');
    const ids = board.beats.map(b => b?.beat_id || b?.id);
    if (ids.some((id, i) => typeof id !== 'string' || !validBeatId(id) || (board.beats[i].id && board.beats[i].beat_id && board.beats[i].id !== id)) || new Set(ids).size !== ids.length) {
      throw new Error('Board beat IDs must be valid, unique, and consistent.');
    }
    return ids;
  }

  function validateRhythmTarget(target) {
    if (typeof target !== 'number' || !Number.isFinite(target) || target < 0.1 || target > 120 || Math.abs(target - round4(target)) > 1e-8) {
      throw new Error('Target must be 0.1–120 seconds, with at most four decimal places.');
    }
  }

  function rhythmMatchesShow(board, show, ids) {
    return show?.show_id === board.show_id && Array.isArray(show.atoms) && show.atoms.length === ids.length && show.atoms.every((atom, i) => {
      const beat = board.beats[i];
      return (atom.beat_id || atom.id) === ids[i] && (beat.label === undefined || (atom.label || '') === beat.label) &&
        (!Object.hasOwn(beat, 'motion') || rhythmBoardSnapshot(beat.motion) === rhythmBoardSnapshot(atom.motion || null)) &&
        (!Object.hasOwn(beat, 'fx_hooks') || rhythmBoardSnapshot(beat.fx_hooks) === rhythmBoardSnapshot(atom.fx_hooks || []));
    });
  }

  function rhythmStamp(show, entries, packs) {
    let next = deepClone(show);
    for (const pack of packs) {
      for (const softCam of [false, true]) {
        const selected = entries.filter(e => e.timing_pack === pack.id && !!e.soft_cam === softCam)
          .map(e => next.atoms.findIndex(a => (a.beat_id || a.id) === e.beat_id));
        if (selected.length) next = applyTimingPack(next, selected, pack, { softCam });
      }
    }
    return next;
  }

  function buildRhythmPlan(board, target, opts) {
    opts = opts || {};
    const ids = rhythmBeatIds(board), packs = rhythmPacks(opts.timingPacks);
    requireRhythmApproval(board, opts.approval);
    validateRhythmTarget(target);
    const source = opts.show || { show_id: board.show_id, atoms: board.beats.map((b, i) => ({ ...deepClone(b), id: ids[i],
      duration_s: b.duration_s === undefined ? 0.5 : b.duration_s })) };
    if (!rhythmMatchesShow(board, source, ids)) {
      throw new Error('Board and show must have the same ordered beat IDs, story labels, and declared motion/FX.');
    }
    if (!rhythmTiming(source).durations_valid) throw new Error('Missing or invalid source durations.');
    const mode = opts.mode || 'plan';
    if (!['plan', 'stamp'].includes(mode)) throw new Error('Unknown rhythm mode.');
    if (mode === 'stamp' && !opts.show) throw new Error('Pack stamping requires the current show/project.');
    const selected = opts.selectedBeatIds || [];
    if (selected.length && !opts.packId) throw new Error('Choose a timing pack for selected beats.');
    if (opts.softCam && packs.find(p => p.id === opts.packId)?.kind !== 'hold') throw new Error('Soft camera requires the dialogue_film_slow pack.');
    if (opts.packId && (!selected.length || selected.some(id => !ids.includes(id)))) throw new Error('Select valid board beat IDs for the timing pack.');
    if (mode === 'stamp' && !opts.packId) throw new Error('Choose a shipped timing pack to stamp.');
    const entries = board.beats.map((beat, i) => ({ beat_id: ids[i],
      timing_pack: opts.packId && selected.includes(ids[i]) ? opts.packId : mode === 'stamp' ? null : (beat.timing_pack || null),
      soft_cam: opts.packId && selected.includes(ids[i]) ? !!opts.softCam : !!beat.soft_cam }));
    for (const entry of entries) {
      if (entry.timing_pack && !packs.some(p => p.id === entry.timing_pack)) throw new Error('Unknown timing pack: ' + entry.timing_pack);
      if (entry.soft_cam && packs.find(p => p.id === entry.timing_pack)?.kind !== 'hold') throw new Error('Soft camera requires the dialogue_film_slow pack.');
    }
    const stamped = rhythmStamp(source, entries, packs);
    const durations = stamped.atoms.map(a => a.duration_s);
    if (mode === 'plan') {
      const flexible = entries.map((e, i) => e.timing_pack ? -1 : i).filter(i => i >= 0);
      const fixed = entries.reduce((sum, e, i) => sum + (e.timing_pack ? Math.round(durations[i] * 10000) : 0), 0);
      const available = Math.round(target * 10000) - fixed;
      if (durations.some((d, i) => entries[i].timing_pack && d > 3) || available < flexible.length * 1000 || available > flexible.length * 30000) {
        throw new Error('Target cannot fit the shipped holds and 0.1–3s clip window. Add/split beats or choose another target.');
      }
      if (flexible.length) {
        const share = (i, scale) => Math.max(1000, Math.min(30000, source.atoms[i].duration_s * scale));
        let low = 0, high = available / Math.min(...flexible.map(i => source.atoms[i].duration_s));
        for (let pass = 0; pass < 60; pass++) {
          const mid = (low + high) / 2;
          if (flexible.reduce((sum, i) => sum + share(i, mid), 0) <= available) low = mid; else high = mid;
        }
        flexible.forEach(i => { durations[i] = Math.floor(share(i, low)); });
        let remaining = available - flexible.reduce((sum, i) => sum + durations[i], 0);
        const order = flexible.slice().sort((a, b) => (share(b, low) - durations[b]) - (share(a, low) - durations[a]) || a - b);
        while (remaining) for (const i of order) {
          if (!remaining) break;
          if (durations[i] < 30000) { durations[i]++; remaining--; }
        }
      }
      flexible.forEach(i => { durations[i] = durations[i] / 10000; });
    }
    const budget = opts.impactBudget ?? source.rhythm?.impact_budget ?? impactBudget(stamped, opts.timingPacks).slots_used;
    if (!Number.isInteger(budget) || budget < 0 || budget > 300) throw new Error('Impact budget must be an integer between 0 and 300.');
    return { kind: 'hm-rhythm-plan', version: 1, show_id: board.show_id, mode, target_s: target, impact_budget: budget,
      board: deepClone(board), approval: deepClone(opts.approval),
      duration_map: entries.filter(e => mode === 'plan' || e.timing_pack).map(e => ({ ...e, duration_s: durations[ids.indexOf(e.beat_id)] })) };
  }

  function applyRhythmPlan(show, plan, opts) {
    opts = opts || {};
    if (plan?.kind !== 'hm-rhythm-plan' || plan.version !== 1 || !['plan', 'stamp'].includes(plan.mode) || plan.show_id !== show?.show_id) throw new Error('Choose a rhythm plan for the open show.');
    const ids = rhythmBeatIds(plan.board);
    requireRhythmApproval(plan.board, plan.approval);
    validateRhythmTarget(plan.target_s);
    const packs = rhythmPacks(opts.timingPacks), map = plan.duration_map;
    if (!Array.isArray(map) || !map.length || !map.every(e => e && typeof e === 'object' && !Array.isArray(e)) || new Set(map.map(e => e.beat_id)).size !== map.length ||
        !rhythmMatchesShow(plan.board, show, ids)) throw new Error('Rhythm plan beat IDs or story labels/motion/FX do not match the open timeline.');
    if (!rhythmTiming(show).durations_valid) throw new Error('Fix missing or invalid source durations before applying rhythm.');
    if (!Number.isInteger(plan.impact_budget) || plan.impact_budget < 0 || plan.impact_budget > 300) throw new Error('Invalid impact budget.');
    if (map.some(e => !e || !ids.includes(e.beat_id) || typeof e.duration_s !== 'number' || !Number.isFinite(e.duration_s) || e.duration_s < 0.1 || e.duration_s > 3 ||
        (e.timing_pack !== null && e.timing_pack !== undefined && !packs.some(p => p.id === e.timing_pack)) ||
        (e.soft_cam !== undefined && typeof e.soft_cam !== 'boolean') || (e.soft_cam && packs.find(p => p.id === e.timing_pack)?.kind !== 'hold') ||
        (plan.mode === 'stamp' && !e.timing_pack))) throw new Error('Invalid rhythm duration or timing pack.');
    if (plan.mode === 'plan' && (map.length !== ids.length || round4(map.reduce((sum, e) => sum + e.duration_s, 0)) !== plan.target_s)) throw new Error('Duration map must cover every beat and equal the target.');
    const next = rhythmStamp(show, map, packs);
    for (const entry of map) {
      const i = ids.indexOf(entry.beat_id), atom = next.atoms[i];
      if (entry.timing_pack && Math.abs(atom.duration_s - entry.duration_s) > 0.00005) throw new Error('Timing pack no longer matches beat ' + entry.beat_id + '. Regenerate from the current project.');
      atom.duration_s = entry.duration_s;
      if (!entry.timing_pack) delete atom.timing_hold;
      syncSegmentDurations(atom.camera, atom.duration_s);
    }
    reflowAllCamChains(next.atoms);
    next.duration_target_s = plan.target_s;
    next.rhythm = { ...(next.rhythm || {}), impact_budget: plan.impact_budget, source: 'hm-rhythm-pacing', mode: plan.mode };
    return next;
  }

  // HM-PF-43: block-pack apply for the gold HF-08 cut presets (show.atoms[i].cut).
  // Same write the per-clip Cut-in form makes; atom 0 never gets a cut (no
  // incoming boundary). Cuts add no time, so durations and plate times stay put.
  function applyCutPack(show, selectedIndices, opts) {
    if (!show || !Array.isArray(show.atoms)) throw new Error('Cut pack needs a show.');
    const options = opts || {};
    const mode = options.preset || 'cycle';
    const table = cutPresetTable(options.cutPresets);
    let order;
    if (mode === 'cycle') order = CUT_TRANSITION_IDS.slice();
    else {
      if (!table[mode]) throw new Error('Unknown cut preset: ' + mode + '.');
      order = [mode];
    }
    const selected = [];
    const seen = {};
    const list = selectedIndices || [];
    for (let i = 0; i < list.length; i++) {
      const idx = list[i];
      if (!Number.isInteger(idx) || idx < 1 || idx >= show.atoms.length || seen[idx]) continue;
      seen[idx] = true;
      selected.push(idx);
    }
    selected.sort((a, b) => a - b);
    if (!selected.length) throw new Error('Cut pack lands on entering clips (i >= 1). Select a clip after the first.');
    const next = deepClone(show);
    selected.forEach((i, k) => {
      const spec = table[order[k % order.length]];
      next.atoms[i].cut = { preset: spec.id, dur_s: spec.dur_s, hold_s: spec.id === 'freeze_hold' ? spec.hold_s : 0, dir: spec.dir };
    });
    return next;
  }

  function frameSequenceDump(composed, fps) {
    const rate = fps == null ? 24 : +fps;
    if (!Number.isFinite(rate) || rate < 1 || rate > 120) throw new Error('Frame sequence fps must be between 1 and 120.');
    const tl = composed && composed.timeline;
    if (!tl || !Array.isArray(tl.plates)) throw new Error('Frame sequence needs a composed timeline.');
    const layout = composed.layout || {};
    const atoms = tl.atoms || [];
    const cuts = tl.plates.map((plate, index) => {
      const entry = layout[plate.id] || {};
      const atom = atoms.find((a) => a.id === (entry.atom || null)) || null;
      const frame = Math.round((+plate.t0 || 0) * rate);
      const frameEnd = Math.round((+plate.t1 || 0) * rate);
      return {
        index,
        plate_id: plate.id,
        source_plate: entry.source_plate || plate.id,
        atom_id: entry.atom || (atom && atom.id) || null,
        t0: plate.t0,
        t1: plate.t1,
        dur_s: round4((+plate.t1 || 0) - (+plate.t0 || 0)),
        frame,
        frames: Math.max(0, frameEnd - frame),
        timing_hold: timingHoldMeta(atom),
      };
    });
    const duration = tl.duration_s != null ? tl.duration_s : composed.duration_s;
    return { fps: rate, duration_s: duration, frames: Math.round((+duration || 0) * rate), cuts };
  }

  function timingExport(presetDoc, composed, fps) {
    if (!presetDoc || !Array.isArray(presetDoc.packs)) throw new Error('Timing export needs the preset pack.');
    return { kind: 'hm-timing-export', presets: presetDoc, frame_seq: frameSequenceDump(composed, fps) };
  }

  // HM-HF-04: a beat block writes cam + fx_hooks (and optional caption / beat role).
  // It does not change id, duration, timing_hold, poses, or plates.
  function idSet(value) {
    if (!value) return null;
    if (value instanceof Set) return value;
    if (Array.isArray(value)) return new Set(value);
    return null;
  }

  function fxPresetMap(fxPresets) {
    const hooks = fxPresets && Array.isArray(fxPresets.hooks) ? fxPresets.hooks : (Array.isArray(fxPresets) ? fxPresets : []);
    const map = new Map();
    hooks.forEach((hook) => { if (hook && hook.id) map.set(hook.id, hook); });
    return map;
  }

  function beatFxHook(entry, fxById) {
    const id = typeof entry === 'string' ? entry : (entry && entry.type);
    if (!id || typeof id !== 'string') throw new Error('Beat block fx hook is not a tip id.');
    if (entry && typeof entry === 'object') {
      const hook = deepClone(entry);
      if (hook.t_rel == null) hook.t_rel = 0.08;
      return hook;
    }
    const spec = fxById.get(id);
    const span = !!(spec && spec.span) || id === 'speed_lines' || id === 'fence_shake';
    const params = spec && spec.defaults && typeof spec.defaults === 'object' ? deepClone(spec.defaults) : {};
    const hook = { type: id, t_rel: span ? 0 : 0.08, params: params };
    if (span) hook.t_rel_end = 1;
    return hook;
  }

  function applyBeatBlockToAtom(atom, block, ctx) {
    const preset = block && block.camera && typeof block.camera.preset === 'string' ? block.camera.preset : '';
    if (!preset) throw new Error('Beat block needs camera.preset.');
    if (ctx.cameraIds && !ctx.cameraIds.has(preset)) throw new Error('Beat block camera.preset is not on the tip kit: ' + preset);
    const next = deepClone(atom);
    const prev = next.camera && typeof next.camera === 'object' ? next.camera : {};
    const cam = { preset: preset };
    if (prev.nudge && typeof prev.nudge === 'object' && Object.keys(prev.nudge).length) cam.nudge = deepClone(prev.nudge);
    if (prev.intensity != null && prev.intensity !== 1) cam.intensity = prev.intensity;
    if (prev.ease) cam.ease = prev.ease;
    next.camera = cam;
    const raw = Array.isArray(block.fx_hooks) ? block.fx_hooks : [];
    next.fx_hooks = raw.map((entry) => {
      const hook = beatFxHook(entry, ctx.fxById);
      if (ctx.fxIds && !ctx.fxIds.has(hook.type)) throw new Error('Beat block fx hook is not on the tip kit: ' + hook.type);
      return hook;
    });
    if (typeof block.caption === 'string' && block.caption) next.caption = block.caption;
    if (typeof block.caption_style === 'string' && block.caption_style) next.caption_style = block.caption_style;
    const motion = block.motion && typeof block.motion === 'object' ? block.motion : null;
    if (motion && (motion.beat_class || motion.role || motion.grammar_role)) {
      const base = next.motion && typeof next.motion === 'object' ? next.motion : { family: 'fight', beat_class: '' };
      next.motion = base;
      if (!next.motion.family) next.motion.family = 'fight';
      if (typeof motion.beat_class === 'string' && motion.beat_class) next.motion.beat_class = motion.beat_class;
      const role = typeof motion.role === 'string' && motion.role ? motion.role : (typeof motion.grammar_role === 'string' ? motion.grammar_role : '');
      if (role) next.motion.grammar_role = role;
    }
    return next;
  }

  function applyBeatBlock(show, selectedIndices, block, opts) {
    if (!show || !Array.isArray(show.atoms)) throw new Error('Beat block needs a show.');
    if (!block || typeof block !== 'object') throw new Error('Choose a beat block.');
    const selected = [];
    const seen = {};
    const list = selectedIndices || [];
    for (let i = 0; i < list.length; i++) {
      const idx = list[i];
      if (!Number.isInteger(idx) || idx < 0 || idx >= show.atoms.length || seen[idx]) continue;
      seen[idx] = true;
      selected.push(idx);
    }
    if (!selected.length) throw new Error('Select a clip before applying a beat block.');
    const options = opts || {};
    const cameraIds = idSet(options.cameraIds) || idSet((options.cameraPresets && options.cameraPresets.presets || []).map((p) => p && p.id));
    const fxById = fxPresetMap(options.fxPresets);
    const fxIds = idSet(options.fxIds) || (fxById.size ? new Set(fxById.keys()) : null);
    const next = deepClone(show);
    selected.forEach((i) => {
      next.atoms[i] = applyBeatBlockToAtom(next.atoms[i], block, { cameraIds: cameraIds, fxIds: fxIds, fxById: fxById });
    });
    return next;
  }

  // HM-PF-08. beat_id is the storyboard id on a show atom.
  // HF-04 block ids (street_ecu_fist and the rest) are a different namespace.
  // atom.id is the alias until beat_id is stamped. A rename writes both or neither.
  const BEAT_ID_BRIDGE = Object.freeze({
    id: 'HM-PF-08-BEAT-ID-BRIDGE',
    field: 'beat_id',
    alias: 'id',
    kind: 'hm-pf-08-board',
    skill: 'hm-storyboard-cantonese',
    pf06: 'HM-PF-06',
    blocksBake: false,
  });
  const BEAT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

  function beatToken(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function validBeatId(value) {
    return BEAT_ID_RE.test(value);
  }

  function bridgeConflict(code, message, fix, extra) {
    const fixText = String(fix || '').trim();
    const normalized = (fixText.startsWith('Fix: ') ? fixText : 'Fix: ' + fixText).replace(/\.*$/, '.');
    return Object.assign({ code: code, message: message, fix: normalized }, extra || {});
  }

  function cloneJson(value) {
    if (value == null) return null;
    return deepClone(value);
  }

  function bridgeFail(show, board, conflicts) {
    return {
      ok: false,
      code: 'beat_id_conflict',
      conflicts: conflicts,
      show: cloneJson(show),
      board: cloneJson(board),
    };
  }

  function bridgeOk(show, board) {
    return {
      ok: true,
      code: 'ok',
      conflicts: [],
      show: cloneJson(show),
      board: cloneJson(board),
    };
  }

  function effectiveBeat(atom) {
    if (!atom || typeof atom !== 'object') return { id: '', split: false, atomId: '' };
    const beat = beatToken(atom.beat_id);
    const atomId = beatToken(atom.id);
    if (beat && atomId && beat !== atomId) return { id: beat, split: true, atomId: atomId };
    return { id: beat || atomId, split: false, atomId: atomId };
  }

  function readBoardBeat(beat) {
    if (!beat || typeof beat !== 'object') return { id: '', split: false, alias: '' };
    const beatId = beatToken(beat.beat_id);
    const alias = beatToken(beat.id);
    if (beatId && alias && beatId !== alias) return { id: beatId, split: true, alias: alias };
    return { id: beatId || alias, split: false, alias: alias };
  }

  function badBeatConflict(label) {
    return bridgeConflict(
      'bad_beat_id',
      label + ' is not a stable beat id.',
      'Fix: Use a beat id of letters, numbers, hyphens, underscores, or dots.'
    );
  }

  function scanShowBeats(show) {
    const conflicts = [];
    const atomIndexById = new Map();
    if (!show || typeof show !== 'object' || !Array.isArray(show.atoms)) {
      conflicts.push(bridgeConflict(
        'missing_show',
        'Show has no atoms array.',
        'Fix: Open a show whose atoms are the storyboard beats.'
      ));
      return { conflicts: conflicts, atomIndexById: atomIndexById };
    }
    show.atoms.forEach((atom, index) => {
      const eff = effectiveBeat(atom);
      if (eff.split) {
        conflicts.push(bridgeConflict(
          'id_split',
          'Clip ' + eff.atomId + ' beat_id "' + eff.id + '" does not match its id.',
          'Fix: Set the clip id to its beat_id or rename the beat so both sides keep one id.',
          { atom_id: eff.atomId, beat_id: eff.id, index: index }
        ));
        return;
      }
      if (!eff.id || !validBeatId(eff.id)) {
        const item = badBeatConflict('Clip ' + (index + 1));
        item.index = index;
        if (eff.atomId) item.atom_id = eff.atomId;
        conflicts.push(item);
        return;
      }
      if (atomIndexById.has(eff.id)) {
        conflicts.push(bridgeConflict(
          'duplicate_atom',
          'Beat id "' + eff.id + '" is on more than one clip.',
          'Fix: Give each clip a distinct beat_id before syncing the board.',
          { beat_id: eff.id, atom_id: eff.atomId || eff.id, index: index }
        ));
        return;
      }
      atomIndexById.set(eff.id, index);
    });
    return { conflicts: conflicts, atomIndexById: atomIndexById };
  }

  function scanBoardBeats(board) {
    const conflicts = [];
    const boardIds = [];
    const boardSeen = new Set();
    if (!board || typeof board !== 'object' || !Array.isArray(board.beats)) {
      conflicts.push(bridgeConflict(
        'missing_show',
        'Board has no beats array.',
        'Fix: Pass a board whose beats carry beat_id values.'
      ));
      return { conflicts: conflicts, boardIds: boardIds, boardSeen: boardSeen };
    }
    board.beats.forEach((beat, index) => {
      const read = readBoardBeat(beat);
      if (read.split) {
        conflicts.push(bridgeConflict(
          'id_split',
          'Board beat ' + (index + 1) + ' beat_id "' + read.id + '" does not match its id alias "' + read.alias + '".',
          'Fix: Set the beat id alias to beat_id or drop the alias so the board has one id.',
          { beat_id: read.id, index: index }
        ));
        return;
      }
      if (!read.id || !validBeatId(read.id)) {
        const item = badBeatConflict('Board beat ' + (index + 1));
        item.index = index;
        conflicts.push(item);
        return;
      }
      if (boardSeen.has(read.id)) {
        conflicts.push(bridgeConflict(
          'duplicate_beat',
          'Board beat id "' + read.id + '" is repeated.',
          'Fix: Give each board beat a distinct beat_id before syncing the show.',
          { beat_id: read.id, index: index }
        ));
        return;
      }
      boardSeen.add(read.id);
      boardIds.push(read.id);
    });
    return { conflicts: conflicts, boardIds: boardIds, boardSeen: boardSeen };
  }

  function showMismatch(show, board) {
    const showId = beatToken(show && show.show_id);
    const boardShow = beatToken(board && board.show_id);
    if (!showId || !boardShow || showId === boardShow) return null;
    return bridgeConflict(
      'show_mismatch',
      'Board show_id "' + boardShow + '" does not match show "' + showId + '".',
      'Fix: Use the same show_id on the board and the show before syncing beat ids.',
      { beat_id: showId }
    );
  }

  function boardFromShow(show) {
    const scanned = scanShowBeats(show);
    if (scanned.conflicts.length) return bridgeFail(show, null, scanned.conflicts);
    const beats = [];
    scanned.atomIndexById.forEach((index, id) => {
      const atom = show.atoms[index];
      beats.push({
        beat_id: id,
        label: atom && typeof atom.label === 'string' ? atom.label : '',
        index: index,
      });
    });
    beats.sort((a, b) => a.index - b.index);
    return bridgeOk(show, {
      kind: BEAT_ID_BRIDGE.kind,
      show_id: beatToken(show.show_id),
      beats: beats,
    });
  }

  function applyBoardToShow(show, board) {
    const conflicts = [];
    const mismatch = showMismatch(show, board);
    if (mismatch) conflicts.push(mismatch);
    const atoms = scanShowBeats(show);
    const beats = scanBoardBeats(board);
    conflicts.push.apply(conflicts, atoms.conflicts);
    conflicts.push.apply(conflicts, beats.conflicts);
    if (!atoms.conflicts.length && !beats.conflicts.length) {
      beats.boardIds.forEach((id, index) => {
        if (!atoms.atomIndexById.has(id)) {
          conflicts.push(bridgeConflict(
            'unmatched_beat',
            'Board beat_id "' + id + '" has no matching clip.',
            'Fix: Add a clip whose id equals this beat_id or remove the beat from the board.',
            { beat_id: id, index: index }
          ));
        }
      });
      atoms.atomIndexById.forEach((index, id) => {
        if (!beats.boardSeen.has(id)) {
          conflicts.push(bridgeConflict(
            'unbridged_atom',
            'Clip "' + id + '" has no matching board beat.',
            'Fix: Add the clip to the board or remove it from the show before syncing.',
            { beat_id: id, atom_id: id, index: index }
          ));
        }
      });
    }
    if (conflicts.length) return bridgeFail(show, board, conflicts);
    const nextShow = deepClone(show);
    atoms.atomIndexById.forEach((index, id) => {
      nextShow.atoms[index].beat_id = id;
    });
    const nextBoard = deepClone(board);
    if (!nextBoard.kind) nextBoard.kind = BEAT_ID_BRIDGE.kind;
    if (!beatToken(nextBoard.show_id) && beatToken(show.show_id)) nextBoard.show_id = beatToken(show.show_id);
    nextBoard.beats.forEach((beat) => {
      const id = readBoardBeat(beat).id;
      beat.beat_id = id;
      if (beatToken(beat.id)) beat.id = id;
    });
    return bridgeOk(nextShow, nextBoard);
  }

  function renameBeat(show, board, from, to) {
    const src = beatToken(from);
    const dst = beatToken(to);
    if (!validBeatId(src) || !validBeatId(dst)) {
      return bridgeFail(show, board, [bridgeConflict(
        'bad_beat_id',
        'Rename needs a source beat id and a destination beat id.',
        'Fix: Use beat ids of letters, numbers, hyphens, underscores, or dots.'
      )]);
    }
    let baseBoard = board;
    if (baseBoard == null) {
      const derived = boardFromShow(show);
      if (!derived.ok) return derived;
      baseBoard = derived.board;
    }
    const conflicts = [];
    const mismatch = showMismatch(show, baseBoard);
    if (mismatch) conflicts.push(mismatch);
    if (!show || typeof show !== 'object' || !Array.isArray(show.atoms) || !baseBoard || !Array.isArray(baseBoard.beats)) {
      conflicts.push(bridgeConflict(
        'missing_show',
        'Rename needs a show and a board.',
        'Fix: Open a show whose atoms are the storyboard beats.'
      ));
      return bridgeFail(show, board, conflicts);
    }
    const beatHits = [];
    baseBoard.beats.forEach((beat, index) => {
      const read = readBoardBeat(beat);
      if (read.split && (read.id === src || read.alias === src || read.id === dst || read.alias === dst)) {
        conflicts.push(bridgeConflict(
          'id_split',
          'Board beat ' + (index + 1) + ' beat_id "' + read.id + '" does not match its id alias "' + read.alias + '".',
          'Fix: Set the beat id alias to beat_id or drop the alias so the board has one id.',
          { beat_id: read.id, index: index }
        ));
        return;
      }
      if (!read.split && read.id === src) beatHits.push(index);
    });
    const atomHits = [];
    show.atoms.forEach((atom, index) => {
      const eff = effectiveBeat(atom);
      if (eff.split && (eff.id === src || eff.atomId === src || eff.id === dst || eff.atomId === dst)) {
        conflicts.push(bridgeConflict(
          'id_split',
          'Clip ' + eff.atomId + ' beat_id "' + eff.id + '" does not match its id.',
          'Fix: Set the clip id to its beat_id or rename the beat so both sides keep one id.',
          { atom_id: eff.atomId, beat_id: eff.id, index: index }
        ));
        return;
      }
      if (!eff.split && eff.id === src) atomHits.push(index);
    });
    if (!conflicts.some((item) => item.code === 'id_split' || item.code === 'show_mismatch')) {
      if (beatHits.length === 0 || atomHits.length === 0) {
        conflicts.push(bridgeConflict(
          'missing_beat',
          'Beat id "' + src + '" is not on both the board and the show.',
          'Fix: Rename a beat id that exists on both the board and the show.',
          { beat_id: src }
        ));
      } else if (beatHits.length > 1 || atomHits.length > 1) {
        conflicts.push(bridgeConflict(
          'duplicate_beat',
          'Beat id "' + src + '" is repeated on the board or the show.',
          'Fix: Give each board beat a distinct beat_id before syncing the show.',
          { beat_id: src }
        ));
      } else if (src !== dst) {
        const dstBoard = baseBoard.beats.some((beat, index) => {
          return index !== beatHits[0] && !readBoardBeat(beat).split && readBoardBeat(beat).id === dst;
        });
        const dstAtom = show.atoms.some((atom, index) => {
          return index !== atomHits[0] && !effectiveBeat(atom).split && effectiveBeat(atom).id === dst;
        });
        if (dstBoard || dstAtom) {
          conflicts.push(bridgeConflict(
            'duplicate_target',
            'Beat id "' + dst + '" is already used.',
            'Fix: Pick a beat id that no other clip or board beat already uses.',
            { beat_id: dst }
          ));
        }
      }
    }
    if (conflicts.length) return bridgeFail(show, board, conflicts);
    const nextShow = deepClone(show);
    const nextBoard = deepClone(baseBoard);
    nextShow.atoms[atomHits[0]].id = dst;
    nextShow.atoms[atomHits[0]].beat_id = dst;
    const beat = nextBoard.beats[beatHits[0]];
    beat.beat_id = dst;
    if (typeof beat.id === 'string') beat.id = dst;
    return bridgeOk(nextShow, nextBoard);
  }

  function roundTripBoard(show, board) {
    const applied = applyBoardToShow(show, board);
    if (!applied.ok) return applied;
    const back = boardFromShow(applied.show);
    if (!back.ok) return bridgeFail(show, board, back.conflicts);
    const forward = (board && Array.isArray(board.beats) ? board.beats : []).map((beat) => readBoardBeat(beat).id);
    const returned = back.board.beats.map((beat) => beat.beat_id);
    const same = forward.length === returned.length && forward.every((id, index) => id === returned[index]);
    if (!same) {
      return bridgeFail(show, board, [bridgeConflict(
        'order_drift',
        'Board beat order does not match show atom order.',
        'Fix: Order board beats the same way as show atoms before a round trip.'
      )]);
    }
    return bridgeOk(applied.show, back.board);
  }

  function assignCopiedBeatId(atom, nextId) {
    const id = beatToken(nextId);
    if (!atom || typeof atom !== 'object' || !validBeatId(id)) {
      throw new Error('Clip copy needs an atom and a beat id.');
    }
    const next = deepClone(atom);
    next.id = id;
    if (beatToken(atom.beat_id)) next.beat_id = id;
    return next;
  }

  function lintBeatBridge(show, board) {
    if (board && typeof board === 'object' && Array.isArray(board.beats)) {
      const applied = applyBoardToShow(show, board);
      return applied.ok ? [] : applied.conflicts;
    }
    return scanShowBeats(show).conflicts;
  }

  global.HMComposeClient = {
    composeShow,
    CUT_TRANSITION_IDS,
    cutPresetTable,
    normalizeAtomCut,
    applyTimingPack,
    rhythmTiming,
    impactBudget,
    rhythmBoardFromShow,
    rhythmBoardSnapshot,
    requireRhythmApproval,
    buildRhythmPlan,
    applyRhythmPlan,
    applyCutPack,
    isFightImpact,
    frameSequenceDump,
    timingExport,
    applyBeatBlock,
    BEAT_ID_BRIDGE,
    boardFromShow,
    applyBoardToShow,
    renameBeat,
    roundTripBoard,
    assignCopiedBeatId,
    inspectAt,
    compareAt,
    plateCatalog,
    plateJumpOption,
    plateJumpChips,
    resolvePlateJump,
    FRAME_PEEK_OFFSETS,
    SEEKABLE_PREVIEW_CONTRACT,
    evaluateSeekPreviewCall,
    framePeekFilename,
    framePeekPlan,
    activeFramePeekAt,
    stripCellAt,
    bakeQaSnapshot,
    classifyFxHook,
    classifyFxHooks,
    LIVE_FX_COMPONENTS,
    COMPOSE_ONLY_FX_COMPONENTS,
    FPS_PLATES,
    applyCamNudge,
    applyCamIntensity,
    isParityMode,
    isPlatePackShow,
    charHonesty,
    parityDirtyChecklist,
    SHOW_LINT_CONTRACT,
    lintShow,
    lintCameraGrammar,
    BG_CROP_MIN,
    BG_CROP_FULL,
    validBackgroundCrop,
    clampBackgroundCrop,
    isFullBackgroundCrop,
    lockBackgroundCropAspect,
    resolveBackgroundCrop,
    BG_TRAVEL_PRESETS,
    isTravelingBackgroundPreset,
    readBackgroundSpan,
    resolveBackgroundSpanUi,
    normalizeFxPlacement,
    hasFxPlacement,
    PHOTO_FX_CHIPS,
    REJECTED_PHOTO_OVERLAY_KINDS,
    COMIC_INK_STYLE,
    resolveFxProfile,
    defaultFxProfileFor,
    fxProfileHonesty,
    isPhotoFxChip,
    isRejectedPhotoOverlay,
    isPhotoFxOverlay,
    styleOverlayForProfile,
    rejectedPhotoOverlaysAdded,
    chainClipCameras,
    reflowCamChain,
    reflowAllCamChains,
    unchainClip,
    setCamEase,
    detachCamChain,
    poseOnSegment,
    CAM_EASES,
    stockFxPath,
    normalizeFxPath,
    resolveFxPath,
    FG_CAM_PRESETS,
    FG_DEFAULT_PARALLAX,
    FG_PARALLAX_PRESETS,
    normalizeFgCam,
  };
})(typeof window !== 'undefined' ? window : globalThis);

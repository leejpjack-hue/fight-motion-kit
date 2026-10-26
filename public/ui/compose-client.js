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

  function cloneFxPath(raw) {
    if (!Array.isArray(raw)) return null;
    const pts = [];
    for (const p of raw) {
      if (Array.isArray(p) && Number.isFinite(+p[0]) && Number.isFinite(+p[1])) pts.push([round4(+p[0]), round4(+p[1])]);
      else if (p && typeof p === 'object' && Number.isFinite(+p.x) && Number.isFinite(+p.y)) pts.push([round4(+p.x), round4(+p.y)]);
    }
    return pts.length ? pts : null;
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

  function ease(kind, u) {
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    if (kind === 'linear') return u;
    if (kind === 'sine') return 0.5 - 0.5 * Math.cos(Math.PI * u);
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
        const fallback = kind === 'fist_pressure' ? FX_FIST_PATH : kind === 'leg_arc' ? FX_LEG_PATH : kind === 'tornado_spiral' ? FX_TORNADO_PATH : null;
        const path = cloneFxPath(o.path) || cloneFxPath(fallback);
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
    const out = {
      preset: c.preset || 'static',
      amount: round4(c.amount == null ? 0 : +c.amount),
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
    return { cam: normalizeFgCam(hasCam ? fg.cam : { preset: 'static', amount: 0 }), props };
  }

  async function fetchJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('fetch ' + url + ' → ' + r.status);
    return r.json();
  }

  async function composeShow(show, opts) {
    opts = opts || {};
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
    const fxp = {};
    fxList.forEach((h) => { fxp[h.id] = h; });

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
    const fx = {
      hits: [], flash: [], hitstop: [], shake: [], bgflash: [], dust: [],
      sparks: [], speed: [], fence: [], trails: [], pink_cut: null,
      exposure: [], fist: [], leg: [], tornado: [],
    };
    const heroLayouts = {};
    let t = 0;
    let nPlate = 0;
    let nHero = 0;

    for (const a of atoms) {
      validateBackground(a.background, a.id);
      const d = +a.duration_s;
      const npl = +a.plates_needed;
      if (!Number.isFinite(d) || d < 0.1 || !Number.isInteger(npl) || npl < 1 || npl > 1000) {
        errors.push(a.id + ': duration must be at least 0.1s and plates_needed a positive integer');
        continue;
      }
      const plateDuration = d / npl;
      const t0 = t;
      const t1 = t + d;
      const cam = a.camera || {};
      const segs = cam.segments || [
        { preset: cam.preset, dur_s: d, params: cam.params, u_range: cam.u_range, nudge: cam.nudge, intensity: cam.intensity },
      ];
      const segSum = segs.reduce((s, x) => s + +x.dur_s, 0);
      if (Math.abs(segSum - d) > 1e-6) errors.push(a.id + ': camera segments sum != duration');
      const cs = [];
      let st = t0;
      const atomNudge = cam.nudge && typeof cam.nudge === 'object' ? cam.nudge : {};
      const atomIntensity = cam.intensity != null ? +cam.intensity : 1;
      for (const s of segs) {
        if (!cams[s.preset]) {
          errors.push(a.id + ': unknown camera preset ' + s.preset);
          continue;
        }
        const u0 = (s.u_range || [0, 1])[0];
        const u1 = (s.u_range || [0, 1])[1];
        const segNudge = s.nudge && typeof s.nudge === 'object' ? s.nudge : atomNudge;
        const segIntensity = s.intensity != null ? +s.intensity : atomIntensity;
        const scaled = applyCamIntensity(mergeCurves(cams[s.preset], s.params), segIntensity);
        const curves = applyCamNudge(scaled, segNudge);
        cs.push({
          t0: Math.round(st * 10000) / 10000,
          t1: Math.round((st + s.dur_s) * 10000) / 10000,
          u0, u1, preset: s.preset, curves,
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
              errors.push(a.id + ': hero missing layout_source');
              continue;
            }
            if (!heroLayouts[lsrc]) {
              try {
                heroLayouts[lsrc] = await loadJson(lsrc);
              } catch (e) {
                errors.push(a.id + ': cannot load layout_source ' + lsrc + ' — ' + e.message);
                continue;
              }
            }
            const se = heroLayouts[lsrc][srcIds[i]];
            if (!se) {
              errors.push(a.id + ': plate ' + srcIds[i] + ' not in ' + lsrc);
              continue;
            }
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
          } else {
            const briefs = h.pose_briefs || [];
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
        const p = fxp[hk.type];
        if (!p) {
          errors.push(a.id + ': unknown fx hook ' + hk.type);
          continue;
        }
        const tRel = hk.t_rel != null ? +hk.t_rel : 0.08;
        const tRelEnd = hk.t_rel_end != null ? +hk.t_rel_end : 1;
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
          else if (comp === 'fist_pressure') fx.fist.push(hasFxPlacement(xf) ? [ht, span, cloneFxPath(prm.path) || cloneFxPath(FX_FIST_PATH), xf] : [ht, span, cloneFxPath(prm.path) || cloneFxPath(FX_FIST_PATH)]);
          else if (comp === 'leg_arc') fx.leg.push(hasFxPlacement(xf) ? [ht, span, cloneFxPath(prm.path) || cloneFxPath(FX_LEG_PATH), xf] : [ht, span, cloneFxPath(prm.path) || cloneFxPath(FX_LEG_PATH)]);
          else if (comp === 'tornado_spiral') fx.tornado.push(hasFxPlacement(xf) ? [ht, span, cloneFxPath(prm.path) || cloneFxPath(FX_TORNADO_PATH), xf] : [ht, span, cloneFxPath(prm.path) || cloneFxPath(FX_TORNADO_PATH)]);
        }
        const cls = classifyFxHook(hk, fxp);
        atomFx.push({
          type: hk.type,
          t_rel: tRel,
          ...(hk.t_rel_end != null ? { t_rel_end: tRelEnd } : {}),
          params: prm,
          mode: cls.mode,
          compose_only: cls.composeOnly,
        });
      }

      tlAtoms.push({
        id: a.id,
        t0: Math.round(t0 * 10000) / 10000,
        t1: Math.round(t1 * 10000) / 10000,
        pose_mode: mode,
        beat: (a.motion && a.motion.beat_class) || '',
        family: (a.motion && a.motion.family) || '',
        cam: cs,
        fx_hooks: atomFx,
        source_refs: a.source_refs || [],
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
          const u = s.u0 + ((s.u1 - s.u0) * (tt - s.t0)) / (s.t1 - s.t0);
          const c = evalCam(s.curves, u, tt - s.t0);
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

    const overlays = normalizeOverlays(show, dur, warns);
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
      fx,
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

  const LIVE_FX_COMPONENTS = [
    'impact_burst', 'flash', 'shake', 'tint', 'trail', 'dust', 'speed', 'sparks', 'pink_cut',
    'exposure_warm_crush', 'fist_pressure', 'leg_arc', 'tornado_spiral',
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
    const p = map[type] || null;
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
    let camPose = { x: 0, y: 0, s: 1, r: 0 };
    if (seg && seg.curves) {
      const span = Math.max(1e-7, seg.t1 - seg.t0);
      const u = seg.u0 + (seg.u1 - seg.u0) * Math.min(1, Math.max(0, (tc - seg.t0) / span));
      camPose = evalCam(seg.curves, u, tc - seg.t0);
    }
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

  global.HMComposeClient = {
    composeShow,
    inspectAt,
    compareAt,
    plateCatalog,
    plateJumpOption,
    plateJumpChips,
    resolvePlateJump,
    classifyFxHook,
    classifyFxHooks,
    LIVE_FX_COMPONENTS,
    COMPOSE_ONLY_FX_COMPONENTS,
    FPS_PLATES,
    applyCamNudge,
    applyCamIntensity,
    isParityMode,
    BG_CROP_MIN,
    BG_CROP_FULL,
    validBackgroundCrop,
    clampBackgroundCrop,
    isFullBackgroundCrop,
    lockBackgroundCropAspect,
    resolveBackgroundCrop,
    normalizeFxPlacement,
    hasFxPlacement,
  };
})(typeof window !== 'undefined' ? window : globalThis);

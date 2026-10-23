/*! HM-COMPOSE-07 — in-browser compose (hero / parity / plate-pack path).
 * Port of essential composer/compose.py for Jack bar on static hosts.
 * Library-mode placement is intentionally unsupported here (fail closed).
 */
(function (global) {
  'use strict';
  const FPS_PLATES = 2;
  const DEFAULTS = { x: 0, y: 0, s: 1.12, r: 0 };

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
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
      if (kind === 'text') {
        if (!(text && String(text).trim())) {
          warns.push('overlay ' + oid + ': kind=text but empty text, skipped');
          return;
        }
      } else if (!src) {
        warns.push('overlay ' + oid + ': missing src, skipped');
        return;
      }
      const t0 = +(o.t_start || 0);
      const t1 = +(o.t_end != null ? o.t_end : t0 + 1);
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
        x: +(o.x != null ? o.x : 640),
        y: +(o.y != null ? o.y : 200),
        scale: +(o.scale || 1) || 1,
        opacity: o.opacity != null ? +o.opacity : 1,
        z: +(o.z != null ? o.z : 10),
      };
      if (src) row.src = src;
      if (text != null) row.text = String(text);
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

  async function fetchJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('fetch ' + url + ' → ' + r.status);
    return r.json();
  }

  /**
   * @param {object} show — show spec
   * @param {object} opts
   * @param {object} opts.cameraPresets — {presets:[...]} or array
   * @param {object} opts.fxPresets — {hooks:[...]} or array
   * @param {function(string):Promise<object>} [opts.loadJson] — resolve kit-relative JSON
   */
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

    // Library mode unsupported in FE-only essential path
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
    const swapT = bg.swap ? bg.swap_t : null;
    const layout = {};
    const plates = [];
    const tlAtoms = [];
    const fx = {
      hits: [], flash: [], hitstop: [], shake: [], bgflash: [], dust: [],
      sparks: [], speed: [], fence: [], trails: [], pink_cut: null,
    };
    const heroLayouts = {};
    let t = 0;
    let nPlate = 0;
    let nHero = 0;

    for (const a of atoms) {
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
        { preset: cam.preset, dur_s: d, params: cam.params, u_range: cam.u_range, nudge: cam.nudge },
      ];
      const segSum = segs.reduce((s, x) => s + +x.dur_s, 0);
      if (Math.abs(segSum - d) > 1e-6) errors.push(a.id + ': camera segments sum != duration');
      const cs = [];
      let st = t0;
      const atomNudge = cam.nudge && typeof cam.nudge === 'object' ? cam.nudge : {};
      for (const s of segs) {
        if (!cams[s.preset]) {
          errors.push(a.id + ': unknown camera preset ' + s.preset);
          continue;
        }
        const u0 = (s.u_range || [0, 1])[0];
        const u1 = (s.u_range || [0, 1])[1];
        const segNudge = s.nudge && typeof s.nudge === 'object' ? s.nudge : atomNudge;
        const curves = applyCamNudge(mergeCurves(cams[s.preset], s.params), segNudge);
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
        layout[pid] = entry;
        plates.push({
          id: pid,
          t0: Math.round(pt0 * 10000) / 10000,
          t1: Math.round((pt0 + plateDuration) * 10000) / 10000,
        });
      }

      for (const hk of a.fx_hooks || []) {
        const p = fxp[hk.type];
        if (!p) {
          errors.push(a.id + ': unknown fx hook ' + hk.type);
          continue;
        }
        const prm = Object.assign({}, p.defaults || {}, hk.params || {});
        const ht = Math.round((t0 + hk.t_rel * d) * 10000) / 10000;
        const he = Math.round((t0 + (hk.t_rel_end != null ? hk.t_rel_end : 1) * d) * 10000) / 10000;
        const col = prm.color != null ? prm.color : p.color;
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
        }
      }

      tlAtoms.push({
        id: a.id,
        t0: Math.round(t0 * 10000) / 10000,
        t1: Math.round(t1 * 10000) / 10000,
        pose_mode: mode,
        beat: (a.motion && a.motion.beat_class) || '',
        family: (a.motion && a.motion.family) || '',
        cam: cs,
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
    // src paths already kit-relative in show; leave as-is

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
      },
      chars: show.chars,
      atoms: tlAtoms,
      plates,
      fx,
      overlays,
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

  global.HMComposeClient = {
    composeShow,
    FPS_PLATES,
    applyCamNudge,
    isParityMode,
  };
})(typeof window !== 'undefined' ? window : globalThis);

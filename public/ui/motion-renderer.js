/* Shared deterministic renderer: the editor, player, HTML export and video use this same code.
 * Cut resolve/paint lives in cut-transitions.js. This file only calls it. */
if (typeof module === 'object' && module && module.exports && typeof require === 'function') {
  require('./cut-transitions.js');
  require('./strip-sampler.js');
}

// HM-BG-MOTION: the crop rect is a window on the source.
// Pan/zoom slide that window when the source has room outside it.
// A crop that already fills the source (no 2% margin) uses the older zoom-and-slide,
// so a full-frame background still moves. A pan into an edge with no source holds still.
// `u` is eased clock progress 0..1. Pan/zoom default to show time so the window
// keeps sliding across clips; per_atom/legacy restarts inside the current clip.
function backgroundMotionFrame(crop, preset, amount, u) {
  const MIN = 0.02, SLACK = 0.02, round4 = v => Math.round(v * 10000) / 10000;
  function clamp(rect) {
    let w = Math.min(1, Math.max(MIN, +rect.w || MIN)), h = Math.min(1, Math.max(MIN, +rect.h || MIN));
    const x = Math.min(1 - w, Math.max(0, +rect.x || 0)), y = Math.min(1 - h, Math.max(0, +rect.y || 0));
    return { x: round4(x), y: round4(y), w: round4(w), h: round4(h) };
  }
  const home = !crop || ![crop.x, crop.y, crop.w, crop.h].every(Number.isFinite) ? { x: 0, y: 0, w: 1, h: 1 } : clamp(crop);
  const slack = { left: home.x, right: round4(1 - (home.x + home.w)), up: home.y, down: round4(1 - (home.y + home.h)) };
  const inset = slack.left < SLACK && slack.right < SLACK && slack.up < SLACK && slack.down < SLACK;
  const p = preset || 'follow_camera';
  const a = Math.min(1, Math.max(0, Number.isFinite(+amount) ? +amount : 0.4));
  const t = Math.min(1, Math.max(0, Number.isFinite(+u) ? +u : 0));
  const reasons = {
    pan_left: 'Pan left needs image to the left of this crop. The crop holds still.',
    pan_right: 'Pan right needs image to the right of this crop. The crop holds still.',
    pan_up: 'Pan up needs image above this crop. The crop holds still.',
    pan_down: 'Pan down needs image below this crop. The crop holds still.',
    push_in: 'Crop is already as tight as zoom-in allows. The crop holds still.',
  };
  if (p === 'follow_camera' || p === 'static') return { mode: 'hold', crop: home, reason: '' };
  const axis = { pan_left: 'left', pan_right: 'right', pan_up: 'up', pan_down: 'down' }[p];
  if (axis && !inset && slack[axis] < SLACK) return { mode: 'still', crop: home, reason: reasons[p] };
  if (p === 'push_in' && !inset && home.w <= MIN + 0.01 && home.h <= MIN + 0.01) return { mode: 'still', crop: home, reason: reasons.push_in };
  if (inset && (axis || p === 'push_in' || p === 'pull_out')) return { mode: 'inset', crop: home, reason: '' };
  if (axis) {
    const travel = slack[axis] * a * t;
    let x = home.x, y = home.y;
    if (p === 'pan_left') x -= travel;
    if (p === 'pan_right') x += travel;
    if (p === 'pan_up') y -= travel;
    if (p === 'pan_down') y += travel;
    return { mode: 'window', crop: clamp({ x, y, w: home.w, h: home.h }), reason: '' };
  }
  if (p === 'push_in') {
    const k = 1 - 0.55 * a * t, w = Math.max(MIN, home.w * k), h = Math.max(MIN, home.h * k);
    return { mode: 'window', crop: clamp({ x: home.x + (home.w - w) / 2, y: home.y + (home.h - h) / 2, w, h }), reason: '' };
  }
  if (p === 'pull_out') return { mode: 'window', crop: clamp({ x: home.x - slack.left * a * t, y: home.y - slack.up * a * t, w: home.w + (slack.left + slack.right) * a * t, h: home.h + (slack.up + slack.down) * a * t }), reason: '' };
  return { mode: 'still', crop: home, reason: 'This background motion is not available.' };
}
// Show-time progress for pan/zoom. `clock` is {duration, atomT0, atomT1}.
// Default is one move from t=0 through the show. motion.span ({t0,t1} or [t0,t1])
// or motion.t0/t1 is an authored window. clock "per_atom" or "legacy" restarts each clip.
function backgroundMotionProgress(motion, t, clock) {
  const m = motion && typeof motion === 'object' ? motion : {};
  const c = clock && typeof clock === 'object' ? clock : {};
  const smooth = u => u * u * (3 - 2 * u);
  const clamp01 = v => Math.min(1, Math.max(0, v));
  const atomT0 = Number.isFinite(+c.atomT0) ? +c.atomT0 : 0;
  const atomT1 = Number.isFinite(+c.atomT1) ? +c.atomT1 : atomT0;
  const perAtom = () => {
    const d = atomT1 - atomT0;
    return smooth(clamp01(d > 1e-9 ? (+t - atomT0) / d : 0));
  };
  const preset = m.preset || 'follow_camera';
  if (preset === 'follow_camera' || preset === 'static') return perAtom();
  const mode = m.clock === 'per_atom' || m.clock === 'legacy' ? 'per_atom'
    : m.clock === 'show' ? 'show'
    : m.clock === 'span' || m.span != null || m.t0 != null || m.t1 != null ? 'span'
    : 'show';
  if (mode === 'per_atom') return perAtom();
  let t0 = 0, t1 = Number.isFinite(+c.duration) ? +c.duration : NaN;
  if (mode === 'span') {
    if (Array.isArray(m.span)) { t0 = +m.span[0]; t1 = +m.span[1]; }
    else if (m.span && typeof m.span === 'object') { t0 = +m.span.t0; t1 = +m.span.t1; }
    else { t0 = +m.t0; t1 = +m.t1; }
  }
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || !(t1 > t0)) return perAtom();
  return smooth(clamp01((+t - t0) / (t1 - t0)));
}
function backgroundMotionSupport(crop) {
  const out = {};
  for (const preset of ['follow_camera', 'static', 'pan_left', 'pan_right', 'pan_up', 'pan_down', 'push_in', 'pull_out']) {
    const frame = backgroundMotionFrame(crop, preset, 1, 1);
    out[preset] = { ok: frame.mode !== 'still', reason: frame.reason || '' };
  }
  return out;
}
// HM-COMPOSE-FG: foreground props are placed sprites with their own camera.
// This transform does not read show.bg.motion or the character-stage camera.
// `parallax` / pan_* slide the layer; `nudge` is a constant offset; `static` holds.
const FG_CAM_PRESETS = ['static', 'nudge', 'parallax', 'pan_left', 'pan_right', 'pan_up', 'pan_down', 'push_in', 'pull_out'];
const FG_DEFAULT_PARALLAX = 0.45;
const FG_PARALLAX_PRESETS = Object.freeze([0, FG_DEFAULT_PARALLAX, 1]);
function fgCameraFrame(cam, t, clock) {
  const c = cam && typeof cam === 'object' ? cam : {};
  // Inlined so the exported HTML player does not depend on an outer binding.
  const presets = ['static', 'nudge', 'parallax', 'pan_left', 'pan_right', 'pan_up', 'pan_down', 'push_in', 'pull_out'];
  const defaultParallax = 0.45;
  const preset = presets.includes(c.preset) ? c.preset : 'parallax';
  const fallbackAmount = preset === 'static' || preset === 'nudge' ? 0 : defaultParallax;
  const amount = c.amount == null || !Number.isFinite(+c.amount) ? fallbackAmount : Math.min(1, Math.max(0, +c.amount));
  const nudge = c.nudge && typeof c.nudge === 'object' ? c.nudge : {};
  const nx = Number.isFinite(+nudge.x) ? +nudge.x : 0;
  const ny = Number.isFinite(+nudge.y) ? +nudge.y : 0;
  const ns = Number.isFinite(+nudge.s) ? +nudge.s : 0;
  const round4 = v => Math.round(v * 10000) / 10000;
  const motionPreset = preset === 'static' || preset === 'nudge' ? 'static' : preset;
  const u = backgroundMotionProgress({ preset: motionPreset, amount, clock: c.clock, span: c.span, t0: c.t0, t1: c.t1 }, t, clock || {});
  const drift = u * 2 - 1;
  const span = 240 * amount;
  let x = nx, y = ny, s = 1 + ns;
  if (preset === 'parallax' || preset === 'pan_left') x += -span * drift;
  else if (preset === 'pan_right') x += span * drift;
  else if (preset === 'pan_up') y += -span * drift;
  else if (preset === 'pan_down') y += span * drift;
  else if (preset === 'push_in') s *= 1 + 0.35 * amount * u;
  else if (preset === 'pull_out') s *= 1 + 0.35 * amount * (1 - u);
  return { x: round4(x), y: round4(y), s: round4(Math.max(0.05, s)), preset, amount: round4(amount), u: round4(u) };
}
function fgPropPose(prop, t) {
  const base = {
    x: Number.isFinite(+prop?.x) ? +prop.x : 640,
    y: Number.isFinite(+prop?.y) ? +prop.y : 560,
    scale: Number.isFinite(+prop?.scale) ? +prop.scale : 1,
  };
  const kfs = (Array.isArray(prop?.kf) ? prop.kf : [])
    .filter(k => k && Number.isFinite(+k.t))
    .map(k => ({
      t: +k.t,
      x: Number.isFinite(+k.x) ? +k.x : base.x,
      y: Number.isFinite(+k.y) ? +k.y : base.y,
      scale: Number.isFinite(+k.scale) ? +k.scale : base.scale,
    }))
    .sort((a, b) => a.t - b.t);
  if (!kfs.length) return base;
  const time = +t || 0;
  if (kfs.length === 1 || time <= kfs[0].t) return { x: kfs[0].x, y: kfs[0].y, scale: kfs[0].scale };
  const last = kfs[kfs.length - 1];
  if (time >= last.t) return { x: last.x, y: last.y, scale: last.scale };
  let i = 1;
  while (i < kfs.length && time > kfs[i].t) i++;
  const a = kfs[i - 1], b = kfs[i], u = (time - a.t) / (b.t - a.t);
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, scale: a.scale + (b.scale - a.scale) * u };
}
function fgBrokenCutoutSrc(src) {
  if (typeof src !== 'string') return '';
  const path = src.trim();
  if (!path) return '';
  const file = path.split(/[?#]/, 1)[0];
  return /\.(png|webp)$/i.test(file) ? path : '';
}
function fgBreakState(prop, t) {
  const src = prop && prop.src;
  const effect = prop && prop.effect;
  if (prop && prop.slot === 'overlay') return { broken: false, src, age: 0, procedural: false };
  if (!effect || effect.type !== 'break' || !(+t >= +effect.t)) return { broken: false, src, age: 0, procedural: false };
  const age = +t - +effect.t;
  const cutout = fgBrokenCutoutSrc(effect.broken_src);
  return { broken: true, src: cutout || src, age, procedural: !cutout };
}
// Parametric punch / leg FX and the warm crush. Paths are 1280×720 screen points.
const FX_FIST_PATH = [[430, 390], [610, 300], [760, 250]];
const FX_LEG_PATH = [[800, 560], [1020, 340], [1160, 150]];
const FX_TORNADO_PATH = [[640, 480], [660, 300]];
const PHOTO_FX_CHIPS = ['dust', 'sparks', 'flash_orange', 'flash_pink', 'bg_flash_blue', 'bg_flash_teal', 'exposure_warm_crush'];
const PHOTO_FX_CHIP_SET = new Set(PHOTO_FX_CHIPS);
function fxPathOrStock(type, raw) {
  const stock = type === 'leg_arc' ? FX_LEG_PATH : type === 'tornado_spiral' ? FX_TORNADO_PATH : type === 'fist_pressure' ? FX_FIST_PATH : null;
  const pts = [];
  if (Array.isArray(raw)) {
    for (const p of raw) {
      if (Array.isArray(p) && Number.isFinite(+p[0]) && Number.isFinite(+p[1])) pts.push([+p[0], +p[1]]);
      else if (p && typeof p === 'object' && Number.isFinite(+p.x) && Number.isFinite(+p.y)) pts.push([+p.x, +p.y]);
    }
  }
  return pts.length ? pts : stock;
}
function fxPointOnPath(path, u) {
  const pts = Array.isArray(path) && path.length ? path : [[640, 360]];
  const t = Math.min(1, Math.max(0, Number(u) || 0));
  if (pts.length === 1) return [+pts[0][0] || 0, +pts[0][1] || 0];
  const f = t * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(f));
  const k = f - i;
  const a = pts[i], b = pts[i + 1];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}
function fxPlacementOf(xf) {
  const p = xf && typeof xf === 'object' ? xf : {};
  const x = Number.isFinite(+p.x) ? +p.x : 0;
  const y = Number.isFinite(+p.y) ? +p.y : 0;
  const scale = Number.isFinite(+p.scale) && +p.scale > 0 ? Math.max(0.05, Math.min(8, +p.scale)) : 1;
  return { x, y, scale };
}
function transformFxPath(path, xf) {
  const pts = Array.isArray(path) && path.length ? path : [[640, 360]];
  const { x: dx, y: dy, scale } = fxPlacementOf(xf);
  const norm = pts.map(p => Array.isArray(p) ? [+p[0] || 0, +p[1] || 0] : [+(p && p.x) || 0, +(p && p.y) || 0]);
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6 && Math.abs(scale - 1) < 1e-6) return norm;
  const [ax, ay] = norm[0];
  return norm.map(([px, py]) => [ax + dx + (px - ax) * scale, ay + dy + (py - ay) * scale]);
}
// Luma crush only. Strong chroma (red-black fist) and cold-white strokes are left
// unchanged — this is not hitstop's grayscale / invert.
function exposureWarmCrushPixels(data, amount, bounds) {
  const a = amount < 0 ? 0 : amount > 1 ? 1 : amount;
  if (!(a > 0) || !data) return;
  const useBounds = bounds && Number.isFinite(+bounds.w) && Number.isFinite(+bounds.h) && +bounds.w > 0 && +bounds.h > 0;
  const bw = useBounds ? +bounds.w | 0 : 0;
  const x0 = useBounds ? Math.max(0, Math.floor(+bounds.x0 || 0)) : 0;
  const y0 = useBounds ? Math.max(0, Math.floor(+bounds.y0 || 0)) : 0;
  const x1 = useBounds ? Math.min(bw, Math.ceil(+bounds.x1 || bw)) : 0;
  const y1 = useBounds ? Math.min(+bounds.h | 0, Math.ceil(+bounds.y1 || (+bounds.h | 0))) : 0;
  for (let i = 0; i < data.length; i += 4) {
    if (useBounds) {
      const pIdx = i >> 2;
      const px = pIdx % bw;
      const py = (pIdx / bw) | 0;
      if (px < x0 || px >= x1 || py < y0 || py >= y1) continue;
    }
    const r0 = data[i], g0 = data[i + 1], b0 = data[i + 2];
    const y = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;
    const max = r0 > g0 ? (r0 > b0 ? r0 : b0) : (g0 > b0 ? g0 : b0);
    const min = r0 < g0 ? (r0 < b0 ? r0 : b0) : (g0 < b0 ? g0 : b0);
    const chroma = max - min;
    if (chroma > 70) continue;
    // Cold-white blade (core and pale-blue edge). Neutral white still crushes warm.
    if (y > 185 && chroma < 90 && b0 > r0 + 4 && b0 + 1 >= g0) continue;
    const yn = y / 255;
    const crushed = yn <= 0.5 ? Math.pow(yn * 2, 1.7) * 0.5 : 1 - Math.pow((1 - yn) * 2, 1.2) * 0.5;
    const scale = y > 0.5 ? (crushed * 255) / y : 0;
    let nr = r0 * scale, ng = g0 * scale, nb = b0 * scale;
    const ny = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
    if (ny > 168) {
      const k = Math.min(1, (ny - 168) / 87);
      nr += (255 - nr) * k * 0.8;
      ng += (232 - ng) * k * 0.45;
      nb += (188 - nb) * k * 0.2;
    }
    if (ny < 64) {
      const k = 1 - ny / 64;
      nr *= 1 - k * 0.8;
      ng *= 1 - k * 0.8;
      nb *= 1 - k * 0.88;
    }
    data[i] = r0 + (nr - r0) * a;
    data[i + 1] = g0 + (ng - g0) * a;
    data[i + 2] = b0 + (nb - b0) * a;
  }
}
function normalizeImpactOpts(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const at = Array.isArray(p.at) ? p.at : null;
  const x = Number.isFinite(+p.x) ? +p.x : (at && Number.isFinite(+at[0]) ? +at[0] : 640);
  const y = Number.isFinite(+p.y) ? +p.y : (at && Number.isFinite(+at[1]) ? +at[1] : 320);
  const hasAngle = p.angle != null && p.angle !== '' && Number.isFinite(+p.angle);
  const angle = hasAngle ? +p.angle : -0.35;
  const strength = Number.isFinite(+p.strength) && +p.strength > 0 ? Math.max(0.2, Math.min(4, +p.strength)) : 1;
  const dur = Number.isFinite(+p.dur) && +p.dur > 0 ? Math.max(0.05, Math.min(2, +p.dur)) : 0.24;
  const rawFrames = p.hitstop_frames != null ? p.hitstop_frames : p.frames;
  const frames = rawFrames != null && Number.isFinite(+rawFrames) ? Math.max(0, Math.min(12, +rawFrames)) : 2;
  const hitstopDur = Number.isFinite(+p.hitstop_dur) && +p.hitstop_dur > 0 ? Math.max(0.01, Math.min(0.5, +p.hitstop_dur)) : (frames > 0 ? frames / 24 : 0);
  const hitstop = p.hitstop !== false && frames > 0 && hitstopDur > 0;
  const invert = p.invert === 'always' ? 'always' : (p.invert !== false);
  const contrast = Number.isFinite(+p.contrast) && +p.contrast >= 0 ? Math.max(0.2, Math.min(3, +p.contrast)) : 1;
  const tint = typeof p.tint === 'string' && /^#[0-9a-f]{6}$/i.test(p.tint.trim()) ? p.tint.trim() : null;
  const recoil = p.recoil != null && Number.isFinite(+p.recoil) ? Math.max(0, Math.min(80, +p.recoil)) : 12 * strength;
  const shakeDur = Number.isFinite(+p.shake_dur) && +p.shake_dur > 0 ? Math.max(0.05, Math.min(1.5, +p.shake_dur)) : 0.28;
  return { x, y, angle, hasAngle, strength, dur, frames, hitstop_dur: hitstopDur, hitstop, invert, contrast, tint, recoil, shake_dur: shakeDur };
}
function normalizeHitstopEntry(entry, fromHit) {
  if (entry == null) return null;
  if (typeof entry === 'number') {
    return Number.isFinite(entry) ? { h: entry, dur: 2 / 24, invert: true, contrast: 1, tint: null, strength: 1, explicit: true } : null;
  }
  if (!Array.isArray(entry) || !Number.isFinite(+entry[0])) return null;
  const h = +entry[0];
  if (fromHit) {
    const o = normalizeImpactOpts(entry[2]);
    if (!o.hitstop) return null;
    return { h, dur: o.hitstop_dur, invert: o.invert, contrast: o.contrast, tint: o.tint, strength: Math.min(1, o.strength), explicit: false };
  }
  const raw = entry[1];
  if (typeof raw === 'number') {
    const dur = Number.isFinite(raw) && raw > 0 ? Math.max(0.01, Math.min(0.5, raw)) : 2 / 24;
    return { h, dur, invert: true, contrast: 1, tint: null, strength: 1, explicit: true };
  }
  const p = raw && typeof raw === 'object' ? raw : {};
  if (p.hitstop === false) return null;
  const rawFrames = p.hitstop_frames != null ? p.hitstop_frames : p.frames;
  const frames = rawFrames != null && Number.isFinite(+rawFrames) ? Math.max(0, Math.min(12, +rawFrames)) : 2;
  const explicitDur = Number.isFinite(+p.hitstop_dur) && +p.hitstop_dur > 0 ? +p.hitstop_dur : (Number.isFinite(+p.dur) && +p.dur > 0 ? +p.dur : 0);
  const dur = explicitDur > 0 ? Math.max(0.01, Math.min(0.5, explicitDur)) : (frames > 0 ? frames / 24 : 0);
  if (!(dur > 0)) return null;
  const invert = p.invert === 'always' ? 'always' : (p.invert !== false);
  const contrast = Number.isFinite(+p.contrast) && +p.contrast >= 0 ? Math.max(0.2, Math.min(3, +p.contrast)) : 1;
  const tint = typeof p.tint === 'string' && /^#[0-9a-f]{6}$/i.test(p.tint.trim()) ? p.tint.trim() : null;
  const strength = Number.isFinite(+p.strength) ? Math.max(0, Math.min(1, +p.strength)) : 1;
  return { h, dur, invert, contrast, tint, strength, explicit: true };
}
function resolveHitstopAt(fxSource, clockT, opts) {
  const src = fxSource && typeof fxSource === 'object' ? fxSource : {};
  const o = opts && typeof opts === 'object' ? opts : {};
  const standIn = !!o.standIn;
  const atomT0 = o.atomT0 != null ? +o.atomT0 : -Infinity;
  const atomT1 = o.atomT1 != null ? +o.atomT1 : Infinity;
  const events = [];
  for (const raw of src.hitstop || []) {
    const item = normalizeHitstopEntry(raw, false);
    if (item) events.push(item);
  }
  for (const raw of src.hits || []) {
    const item = normalizeHitstopEntry(raw, true);
    if (item) events.push(item);
  }
  if (!events.length) return null;
  let chosen = null;
  for (const ev of events) {
    const d = clockT - ev.h;
    if (d >= -1e-6 && d < ev.dur - 1e-6) {
      if (!chosen || ev.h > chosen.h + 1e-6 || (Math.abs(ev.h - chosen.h) <= 1e-6 && ev.explicit && !chosen.explicit)) {
        chosen = ev;
      }
    }
  }
  if (chosen) {
    const d = Math.max(0, clockT - chosen.h);
    return {
      active: true,
      freeze: true,
      holdT: chosen.h,
      d,
      dur: chosen.dur,
      u: Math.min(1, Math.max(0, d / chosen.dur)),
      invert: chosen.invert,
      contrast: chosen.contrast,
      tint: chosen.tint,
      strength: chosen.strength,
      isStandIn: false,
    };
  }
  if (standIn) {
    let standEvt = null;
    for (const ev of events) {
      if (ev.h >= atomT0 - 1e-4 && ev.h <= atomT1 + 1e-4) {
        if (!standEvt || (ev.explicit && !standEvt.explicit)) standEvt = ev;
      }
    }
    if (standEvt) {
      return {
        active: true,
        freeze: false,
        holdT: clockT,
        d: standEvt.dur * 0.25,
        dur: standEvt.dur,
        u: 0.25,
        invert: standEvt.invert,
        contrast: standEvt.contrast,
        tint: standEvt.tint,
        strength: standEvt.strength,
        isStandIn: true,
      };
    }
  }
  return null;
}
function applyHitstopPixels(data, u, opts) {
  if (!data || !data.length) return;
  const o = opts && typeof opts === 'object' ? opts : {};
  const uu = u < 0 ? 0 : u > 1 ? 1 : +u || 0;
  const amount = o.strength != null && Number.isFinite(+o.strength) ? Math.max(0, Math.min(1, +o.strength)) : 1;
  if (!(amount > 0)) return;
  const invertNow = o.invert === 'always' ? true : (o.invert !== false && uu < 0.45);
  const contrast = Number.isFinite(+o.contrast) && +o.contrast > 0 ? Math.max(0.2, Math.min(3, +o.contrast)) : 1;
  const slope = 4.5 * contrast;
  let tr = 255, tg = 255, tb = 255, hasTint = false;
  if (typeof o.tint === 'string' && /^#[0-9a-f]{6}$/i.test(o.tint)) {
    const hex = parseInt(o.tint.slice(1), 16);
    tr = (hex >> 16) & 255; tg = (hex >> 8) & 255; tb = hex & 255;
    hasTint = true;
  }
  for (let i = 0; i < data.length; i += 4) {
    const r0 = data[i], g0 = data[i + 1], b0 = data[i + 2];
    const y = (0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0) / 255;
    const rawC = (y - 0.48) * slope + 0.5;
    const clampedC = rawC < 0 ? 0 : rawC > 1 ? 1 : rawC;
    const crisp = clampedC * clampedC * (3 - 2 * clampedC);
    const mono = (invertNow ? 1 - crisp : crisp) * 255;
    let nr = mono, ng = mono, nb = mono;
    if (hasTint) {
      nr = mono * 0.72 + tr * 0.28;
      ng = mono * 0.72 + tg * 0.28;
      nb = mono * 0.72 + tb * 0.28;
    }
    data[i] = Math.round(r0 + (nr - r0) * amount);
    data[i + 1] = Math.round(g0 + (ng - g0) * amount);
    data[i + 2] = Math.round(b0 + (nb - b0) * amount);
  }
}
function impactBurstGeometry(u, opts) {
  const o = normalizeImpactOpts(opts);
  const uu = Math.max(0, Math.min(1, Number(u) || 0));
  const easeOut = 1 - Math.pow(1 - uu, 3);
  const decay = 1 - uu;
  const s = o.strength;
  const seed = (idx, salt) => {
    const x = Math.sin(idx * 19.73 + salt * 7.13 + (o.hasAngle ? o.angle * 3.1 : 0)) * 43758.5453;
    return x - Math.floor(x);
  };
  const rays = [];
  const rayCount = 20;
  for (let i = 0; i < rayCount; i++) {
    const baseAngle = (i / rayCount) * Math.PI * 2 + (seed(i, 1) - 0.5) * 0.14;
    const axisBias = o.hasAngle ? (0.85 + 0.75 * Math.pow(Math.abs(Math.cos(baseAngle - o.angle)), 1.6)) : 1;
    const primary = i % 2 === 0;
    const lengthScale = (primary ? 0.92 : 0.56) * (0.78 + 0.48 * seed(i, 2)) * axisBias;
    const r0 = (6 + uu * 54) * s;
    const r1 = (46 + easeOut * 255 * lengthScale) * s;
    const halfWidth = (primary ? 10.5 : 5.5) * (0.8 + 0.35 * seed(i, 3)) * s * (0.45 + 0.65 * decay);
    rays.push({ angle: baseAngle, r0, r1, halfWidth, primary });
  }
  const shards = [];
  const shardCount = 14;
  for (let i = 0; i < shardCount; i++) {
    const spread = (seed(i, 4) - 0.5) * (o.hasAngle ? 1.55 : Math.PI * 2);
    const baseA = o.hasAngle ? o.angle + (i % 3 === 0 ? Math.PI + spread * 0.5 : spread) : (i / shardCount) * Math.PI * 2 + spread * 0.35;
    const speed = (180 + seed(i, 5) * 260) * s;
    const dist = (14 + easeOut * speed * 0.85) * (0.4 + 0.6 * seed(i, 6));
    const len = (14 + seed(i, 7) * 24) * s * (0.4 + 0.7 * decay);
    shards.push({
      x: o.x + Math.cos(baseA) * dist,
      y: o.y + Math.sin(baseA) * dist,
      angle: baseA,
      len,
      halfWidth: (2.2 + seed(i, 8) * 2.8) * s * (0.35 + 0.65 * decay),
      alpha: Math.min(1, 0.92 * Math.pow(decay, 0.85)),
    });
  }
  const u2 = Math.max(0, Math.min(1, (uu - 0.08) / 0.92));
  const ease2 = 1 - Math.pow(1 - u2, 2.5);
  return {
    cx: o.x,
    cy: o.y,
    strength: s,
    angle: o.angle,
    hasAngle: o.hasAngle,
    flashAlpha: (uu < 0.2 ? 0.24 : 0.14) * Math.pow(decay, 1.5),
    coreRadius: (28 + Math.sin(Math.min(1, uu * 1.45) * Math.PI * 0.5) * 24) * s * (0.45 + 0.55 * decay),
    coreAlpha: Math.min(1, 0.95 * Math.pow(decay, 0.7)),
    ring1: {
      radius: (22 + easeOut * 225) * s,
      width: Math.max(1.5, (11 * decay + 1.5) * s),
      alpha: 0.9 * Math.pow(decay, 1.15),
    },
    ring2: {
      radius: uu > 0.08 ? (12 + ease2 * 165) * s : 0,
      width: Math.max(1, (6.5 * (1 - u2) + 1) * s),
      alpha: uu > 0.08 ? 0.72 * Math.pow(1 - u2, 1.1) : 0,
    },
    rays,
    shards,
  };
}
function drawImpactBurst(ctx, cx, cy, u, col = '#ff8a1e', opts = {}) {
  const geom = impactBurstGeometry(u, Object.assign({}, opts, { x: cx, y: cy }));
  ctx.save();
  if (geom.flashAlpha > 0.01) {
    ctx.fillStyle = col;
    ctx.globalAlpha = geom.flashAlpha;
    ctx.fillRect(0, 0, 1280, 720);
  }
  const haloR = Math.max(40, geom.ring1.radius * 0.92);
  if (typeof ctx.createRadialGradient === 'function') {
    const g = ctx.createRadialGradient(geom.cx, geom.cy, Math.max(2, geom.coreRadius * 0.2), geom.cx, geom.cy, haloR);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = Math.min(0.65, geom.coreAlpha * 0.65);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(geom.cx, geom.cy, haloR, 0, Math.PI * 2);
    ctx.fill();
  }
  const drawSpikePoly = (ray, radiusScale, widthScale, fillStyle, alpha) => {
    const ca = Math.cos(ray.angle), sa = Math.sin(ray.angle);
    const nx = -sa, ny = ca;
    const hw = ray.halfWidth * widthScale;
    const tipR = ray.r0 + (ray.r1 - ray.r0) * radiusScale;
    const ax = geom.cx + ca * ray.r0, ay = geom.cy + sa * ray.r0;
    const tx = geom.cx + ca * tipR, ty = geom.cy + sa * tipR;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.moveTo(ax + nx * hw, ay + ny * hw);
    ctx.lineTo(tx, ty);
    ctx.lineTo(ax - nx * hw, ay - ny * hw);
    ctx.lineTo(geom.cx + ca * Math.max(0, ray.r0 - hw), geom.cy + sa * Math.max(0, ray.r0 - hw));
    ctx.closePath();
    ctx.fill();
  };
  for (const ray of geom.rays) {
    drawSpikePoly(ray, 1, 1, col, geom.ring1.alpha * (ray.primary ? 0.95 : 0.78));
    drawSpikePoly(ray, 0.72, 0.45, '#ffffff', geom.coreAlpha * 0.92);
  }
  if (geom.ring1.alpha > 0.01) {
    ctx.globalAlpha = geom.ring1.alpha;
    ctx.strokeStyle = col;
    ctx.lineWidth = geom.ring1.width;
    ctx.beginPath();
    ctx.arc(geom.cx, geom.cy, geom.ring1.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = geom.ring1.alpha * 0.85;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, geom.ring1.width * 0.35);
    ctx.beginPath();
    ctx.arc(geom.cx, geom.cy, geom.ring1.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (geom.ring2.radius > 0 && geom.ring2.alpha > 0.01) {
    ctx.globalAlpha = geom.ring2.alpha;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = geom.ring2.width;
    ctx.beginPath();
    ctx.arc(geom.cx, geom.cy, geom.ring2.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const sh of geom.shards) {
    if (sh.alpha <= 0.01) continue;
    const ca = Math.cos(sh.angle), sa = Math.sin(sh.angle);
    const nx = -sa, ny = ca;
    ctx.globalAlpha = sh.alpha;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(sh.x + ca * sh.len, sh.y + sa * sh.len);
    ctx.lineTo(sh.x + nx * sh.halfWidth, sh.y + ny * sh.halfWidth);
    ctx.lineTo(sh.x - ca * sh.len * 0.45, sh.y - sa * sh.len * 0.45);
    ctx.lineTo(sh.x - nx * sh.halfWidth, sh.y - ny * sh.halfWidth);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = geom.coreAlpha;
  ctx.beginPath();
  ctx.arc(geom.cx, geom.cy, geom.coreRadius, 0, Math.PI * 2);
  ctx.fill();
  for (let k = 0; k < 4; k++) {
    const ca = geom.angle + k * Math.PI * 0.5;
    const len = geom.coreRadius * (k % 2 === 0 ? 3.2 : 2.1);
    const cos = Math.cos(ca), sin = Math.sin(ca), nx = -sin, ny = cos;
    ctx.beginPath();
    ctx.moveTo(geom.cx + cos * len, geom.cy + sin * len);
    ctx.lineTo(geom.cx + nx * geom.coreRadius * 0.28, geom.cy + ny * geom.coreRadius * 0.28);
    ctx.lineTo(geom.cx - nx * geom.coreRadius * 0.28, geom.cy - ny * geom.coreRadius * 0.28);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
function computeCameraImpactShake(shakeList, hitList, t) {
  let dx = 0, dy = 0, dr = 0, amp = 0;
  for (const entry of shakeList || []) {
    const h = +entry[0], a = Number.isFinite(+entry[1]) ? +entry[1] : 14, d = Number.isFinite(+entry[2]) && +entry[2] > 0 ? +entry[2] : 0.32;
    const dt = t - h;
    if (dt >= 0 && dt < d) {
      const localAmp = a * Math.pow(1 - dt / d, 1.35);
      if (localAmp > amp) {
        amp = localAmp;
        dx = Math.sin(t * 157) * localAmp;
        dy = Math.cos(t * 131) * localAmp * 0.6;
      }
    }
  }
  for (let i = 0; i < (hitList || []).length; i++) {
    const entry = hitList[i];
    if (!Array.isArray(entry)) continue;
    const h = +entry[0];
    const o = normalizeImpactOpts(entry[2]);
    const dt = t - h;
    if (dt >= 0 && dt < o.shake_dur) {
      const decay = Math.pow(1 - dt / o.shake_dur, 2);
      const kick = o.recoil * decay * (dt < 0.055 ? -1 : Math.cos(dt * 92) * 0.72);
      const ortho = Math.sin(t * 173 + i * 1.9) * o.recoil * 0.35 * decay;
      const ca = Math.cos(o.angle), sa = Math.sin(o.angle);
      dx += ca * kick - sa * ortho;
      dy += sa * kick + ca * ortho * 0.75;
      dr += Math.sin(dt * 85 + o.angle) * (1.35 * o.strength * decay);
      amp = Math.max(amp, Math.hypot(dx, dy));
    }
  }
  return { dx, dy, dr, amp };
}
function drawFistPressure(ctx, x, y, u, scale = 1) {
  const s = Number.isFinite(+scale) && +scale > 0 ? +scale : 1;
  const grow = 0.84 + 0.22 * Math.sin(Math.min(1, Math.max(0, u)) * Math.PI);
  const R = 268 * grow * s;
  ctx.save();
  const g = ctx.createRadialGradient(x, y, R * 0.05, x, y, R);
  g.addColorStop(0, 'rgba(70, 0, 0, 0.2)');
  g.addColorStop(0.4, 'rgba(176, 8, 8, 0.62)');
  g.addColorStop(0.68, 'rgba(12, 0, 0, 0.82)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = '#ff1a1a';
  ctx.lineWidth = 24 * s;
  ctx.beginPath();
  ctx.arc(x, y, R * 0.56, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#120000';
  ctx.beginPath();
  ctx.arc(x, y, 58 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e10600';
  ctx.beginPath();
  ctx.arc(x - 8 * s, y - 10 * s, 36 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
function drawLegArc(ctx, path, u, xf) {
  const { scale: s } = fxPlacementOf(xf);
  const pts = transformFxPath(path, xf);
  const uu = Math.max(0.08, Math.min(1, Number(u) || 0));
  const steps = 32;
  function stroke(width, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width * s;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const p = fxPointOnPath(pts, (i / steps) * uu);
      if (i === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
    ctx.restore();
  }
  stroke(30, '#b9dcff', 0.96);
  stroke(10, '#f4fbff', 1);
}
function drawTornado(ctx, x, y, u, scale = 1) {
  const s = Number.isFinite(+scale) && +scale > 0 ? +scale : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const spin = (Number(u) || 0) * Math.PI * 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let arm = 0; arm < 2; arm++) {
    ctx.beginPath();
    ctx.globalAlpha = arm === 0 ? 0.95 : 0.8;
    ctx.strokeStyle = arm === 0 ? '#f4fbff' : '#9fd4ff';
    ctx.lineWidth = arm === 0 ? 6 : 3.5;
    const steps = 72;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ang = spin + arm * Math.PI + t * Math.PI * 2 * 3.4;
      const rad = 14 + t * 220;
      const px = Math.cos(ang) * rad;
      const py = Math.sin(ang) * rad * 0.4 - t * 210;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}
function collectProceduralOverlays(overlays, t) {
  const out = { exposure: [], fist: [], leg: [], tornado: [] };
  for (const o of overlays || []) {
    if (!(t >= o.t_start && t < o.t_end)) continue;
    const dur = Math.max(0.01, o.t_end - o.t_start);
    const xf = fxPlacementOf({ x: o.x, y: o.y, scale: o.scale });
    const hasXf = Math.abs(xf.x) > 1e-6 || Math.abs(xf.y) > 1e-6 || Math.abs(xf.scale - 1) > 1e-6;
    if (o.kind === 'exposure_warm_crush') out.exposure.push(hasXf ? [o.t_start, dur, xf] : [o.t_start, dur]);
    else if (o.kind === 'fist_pressure') out.fist.push(hasXf ? [o.t_start, dur, fxPathOrStock('fist_pressure', o.path), xf] : [o.t_start, dur, fxPathOrStock('fist_pressure', o.path)]);
    else if (o.kind === 'leg_arc') out.leg.push(hasXf ? [o.t_start, dur, fxPathOrStock('leg_arc', o.path), xf] : [o.t_start, dur, fxPathOrStock('leg_arc', o.path)]);
    else if (o.kind === 'tornado_spiral') out.tornado.push(hasXf ? [o.t_start, dur, fxPathOrStock('tornado_spiral', o.path), xf] : [o.t_start, dur, fxPathOrStock('tornado_spiral', o.path)]);
  }
  return out;
}
function cameraEase(kind, u) {
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
function cameraChannel(c, u, tl) {
  if (!c) return 0;
  if (c.type === 'const') return c.v;
  if (c.type === 'lerp') return c.a + (c.b - c.a) * cameraEase(c.ease, u);
  if (c.type === 'saw') return c.a + (c.b - c.a) * ((tl % c.period_s) / c.period_s);
  if (c.type === 'sin') return (c.offset || 0) + c.amp * Math.sin(('omega' in c ? c.omega * tl : 2 * Math.PI * (c.cycles ?? 1) * u) + (c.phase || 0));
  if (c.type === 'alt_bump') { const k = c.n * u; return (c.offset || 0) + (Math.floor(k) % 2 ? 1 : -1) * c.amp * Math.sin((k % 1) * Math.PI); }
  return 0;
}
function layerCamMatrix(timeline, t, layout) {
  const tl = timeline && typeof timeline === 'object' ? timeline : {};
  const time = Math.round((Number(t) || 0) * 10000) / 10000;
  const dur = Number.isFinite(+tl.duration_s) ? +tl.duration_s : 0;
  const atoms = Array.isArray(tl.atoms) ? tl.atoms : [];
  const plates = Array.isArray(tl.plates) ? tl.plates : [];
  const plate = plates.find(p => time >= p.t0 && time < p.t1) || plates[plates.length - 1] || null;
  const entry = plate && layout && layout[plate.id] ? layout[plate.id] : null;
  const atom = (entry && atoms.find(a => a.id === entry.atom))
    || atoms.find(a => time >= a.t0 && time < a.t1)
    || atoms[atoms.length - 1]
    || null;
  const segments = atom && Array.isArray(atom.cam) ? atom.cam : [];
  const seg = segments.find(s => time >= s.t0 && time < s.t1) || segments[segments.length - 1] || null;
  const pose = cameraPoseOnSegment(seg, time);
  const round4 = v => Math.round((+v || 0) * 10000) / 10000;
  const bgLayer = typeof backgroundAt === 'function'
    ? backgroundAt(entry, tl.bg, time)
    : { motion: tl.bg && tl.bg.motion, crop: null };
  const motion = (bgLayer && bgLayer.motion) || {};
  const preset = motion.preset || 'follow_camera';
  const amount = motion.amount == null ? 0.4 : +motion.amount;
  const clock = atom
    ? { duration: dur, atomT0: atom.t0, atomT1: atom.t1 }
    : { duration: dur, atomT0: time, atomT1: time };
  const u = backgroundMotionProgress(motion, time, clock);
  const frame = backgroundMotionFrame(bgLayer && bgLayer.crop, preset, amount, u);
  const fgCam = tl.fg && tl.fg.cam;
  const fg = fgCam ? fgCameraFrame(fgCam, time, { duration: dur, atomT0: 0, atomT1: dur }) : null;
  return {
    t: time,
    fg: fg ? { preset: fg.preset, amount: fg.amount, x: fg.x, y: fg.y, s: fg.s, u: fg.u } : null,
    bg: {
      preset,
      amount: round4(Math.min(1, Math.max(0, Number.isFinite(amount) ? amount : 0))),
      x: frame.crop.x,
      y: frame.crop.y,
      w: frame.crop.w,
      h: frame.crop.h,
      u: round4(u),
      mode: frame.mode,
    },
    character: {
      preset: (seg && seg.preset) || 'static_hold',
      ...(seg && seg.micro_move ? { micro_move: seg.micro_move } : {}),
      x: round4(pose.x),
      y: round4(pose.y),
      s: round4(pose.s),
      r: round4(pose.r),
    },
  };
}
function layerCamsIndependent(row) {
  if (!row || !row.fg || !row.bg || !row.character) return false;
  if (row.fg.preset === row.bg.preset || row.fg.preset === row.character.preset) return false;
  if (row.fg.x === row.character.x && row.fg.y === row.character.y && row.fg.s === row.character.s) return false;
  return true;
}
function layerCamMatrixText(row) {
  if (!row || !row.fg) return 'No foreground camera on this show.';
  const mark = layerCamsIndependent(row) ? 'independent' : 'coupled';
  return 't ' + row.t.toFixed(2) + 's · FG ' + row.fg.preset + ' ' + row.fg.amount
    + ' x ' + row.fg.x
    + ' · BG ' + row.bg.preset + ' ' + row.bg.amount + ' crop x ' + row.bg.x
    + ' · Character ' + row.character.preset + ' x ' + row.character.x
    + ' · ' + mark;
}
function cameraPoseOnSegment(seg, t) {
  const camera = { x: 0, y: 0, s: 1, r: 0 };
  if (!seg || !seg.curves) return camera;
  const span = Math.max(1e-7, (seg.t1 || 0) - (seg.t0 || 0));
  const local = Math.min(1, Math.max(0, ((+t || 0) - (seg.t0 || 0)) / span));
  const tl = (+t || 0) - (seg.t0 || 0);
  const u0 = seg.u0 == null ? 0 : +seg.u0;
  const u1 = seg.u1 == null ? 1 : +seg.u1;
  if (seg.ease) {
    const shaped = cameraEase(seg.ease, local);
    for (const k of 'xysr') {
      if (!seg.curves[k]) continue;
      const a = cameraChannel(seg.curves[k], u0, 0);
      const b = cameraChannel(seg.curves[k], u1, span);
      camera[k] = a + (b - a) * shaped;
    }
  } else {
    const u = u0 + (u1 - u0) * local;
    for (const k of 'xysr') if (seg.curves[k]) camera[k] = cameraChannel(seg.curves[k], u, tl);
  }
  camera.s = Math.max(camera.s, 1 + Math.abs(Math.sin(camera.r * Math.PI / 180)) * 0.9);
  // Extra scale follows the chain parameter so both sides of a cut share one zoom.
  if (seg.snap_zoom) camera.s += 0.18 * cameraEase('snap', u0 + (u1 - u0) * local);
  if (seg.micro_curves && typeof seg.micro_curves === 'object') {
    const mr = Array.isArray(seg.micro_u_range) ? seg.micro_u_range : [0, 1];
    const mu0 = mr[0] == null ? 0 : +mr[0];
    const mu1 = mr[1] == null ? 1 : +mr[1];
    if (local >= mu0 - 1e-9 && local <= mu1 + 1e-9) {
      const mu = Math.min(1, Math.max(0, (local - mu0) / Math.max(1e-7, mu1 - mu0)));
      for (const k of 'xysr') {
        if (seg.micro_curves[k]) camera[k] += cameraChannel(seg.micro_curves[k], mu, tl);
      }
      camera.s = Math.max(camera.s, 1 + Math.abs(Math.sin(camera.r * Math.PI / 180)) * 0.9);
    }
  }
  return camera;
}
function backgroundLocationsBundle() {
  function locationAt(locations, t) {
    if (!Array.isArray(locations)) return null;
    const time = +t || 0;
    for (let i = 0; i < locations.length; i++) {
      const row = locations[i];
      if (row && time >= +row.t0 && time < +row.t1) return row;
    }
    return null;
  }
  function overlappingLocationId(locations) {
    if (!Array.isArray(locations)) return null;
    for (let i = 0; i < locations.length; i++) {
      const row = locations[i];
      if (!row || !Number.isFinite(+row.t0) || !Number.isFinite(+row.t1)) continue;
      for (let j = 0; j < i; j++) {
        const prev = locations[j];
        if (!prev || !Number.isFinite(+prev.t0) || !Number.isFinite(+prev.t1)) continue;
        if (+row.t0 < +prev.t1 && +prev.t0 < +row.t1) return String(row.id || i);
      }
    }
    return null;
  }
  function backgroundAt(entry, timelineBg, t) {
    const own = (entry && entry.background) || {};
    const global = timelineBg && typeof timelineBg === 'object' ? timelineBg : {};
    const ownsSrc = Object.prototype.hasOwnProperty.call(own, 'src');
    let layerSrc;
    let layerMotion;
    let layerCrop;
    if (Array.isArray(global.locations)) {
      const loc = locationAt(global.locations, t);
      layerSrc = loc ? loc.src : null;
      layerMotion = loc && loc.motion;
      layerCrop = loc && loc.crop;
    } else {
      const key = (entry && entry.bg) || 'base';
      layerSrc = global[key];
      layerMotion = global.motion;
      layerCrop = global.crops && global.crops[key];
    }
    return {
      src: ownsSrc ? own.src : layerSrc,
      key_white: own.key_white ?? global.key_white,
      motion: own.motion ?? layerMotion,
      crop: own.crop ?? (ownsSrc ? null : layerCrop) ?? null,
    };
  }
  function backgroundImageRefs(bg) {
    const box = bg && typeof bg === 'object' ? bg : {};
    const out = [];
    if (Array.isArray(box.locations)) {
      for (let i = 0; i < box.locations.length; i++) {
        const src = box.locations[i] && box.locations[i].src;
        if (typeof src === 'string' && src) out.push(src);
      }
      return out;
    }
    if (typeof box.base === 'string' && box.base) out.push(box.base);
    if (typeof box.swap === 'string' && box.swap) out.push(box.swap);
    return out;
  }
  var root = typeof globalThis !== 'undefined' ? globalThis : this;
  root.locationAt = locationAt;
  root.overlappingLocationId = overlappingLocationId;
  root.backgroundAt = backgroundAt;
  root.backgroundImageRefs = backgroundImageRefs;
  root.backgroundLocationsBundle = backgroundLocationsBundle;
  return {
    locationAt: locationAt,
    overlappingLocationId: overlappingLocationId,
    backgroundAt: backgroundAt,
    backgroundImageRefs: backgroundImageRefs,
  };
}
backgroundLocationsBundle();
function createMotionRenderer(canvas, assets = {}) {
  const ctx = canvas.getContext('2d');
  const images = new Map(), keyedImages = new Map();
  let timeline, layout, lastTime = 0, lastRenderViaSoT = false, lastRenderSource = '', onRenderHook = null, lastPixelfx = { drawn: [], missed: [] }, lastCut = null, lastLayerMatrix = null, lastStripSample = null, lastHitstop = null;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function url(path) {
    if (assets[path]) return assets[path];
    if (/^(data:image\/|blob:)/.test(path)) return path;
    if (/^https?:/.test(path)) {
      const u = new URL(path); if (u.origin !== location.origin) throw new Error('Images must be local or embedded');
      return u.href;
    }
    return '/' + String(path).replace(/^\.?\//, '');
  }
  async function load(data) {
    timeline = data.timeline; layout = data.layout;
    const paths = new Set();
    Object.values(layout).forEach(l => { if (l.full) paths.add(l.full); if(l.strip?.src)paths.add(l.strip.src); if(l.background?.src)paths.add(l.background.src); (l.parts || []).forEach(p => paths.add(p.src)); });
    backgroundImageRefs(timeline.bg).forEach(p => paths.add(p));
    (timeline.overlays || []).forEach(o => { if (o.src) paths.add(o.src); });
    (timeline.fg?.props || []).forEach(p => { if (p.src) paths.add(p.src); if (p.effect?.broken_src) paths.add(p.effect.broken_src); });
    const imgCache = (typeof window !== 'undefined' && (window.__hmImageCache ||= new Map())) || null;
    const keyCache = (typeof window !== 'undefined' && (window.__hmKeyedCache ||= new WeakMap())) || null;
    await Promise.all([...paths].map(async path => {
      if (images.has(path)) return;
      const resolved = url(path);
      const cached = imgCache?.get(resolved);
      if (cached && cached.complete && cached.naturalWidth > 0) { images.set(path, cached); return; }
      const im = new Image(); im.src = resolved;
      try { await im.decode(); } catch (_) { throw new Error('Image could not load: ' + path.slice(0, 120)); }
      if (imgCache) { if (imgCache.size > 200) imgCache.clear(); imgCache.set(resolved, im); }
      images.set(path, im);
    }));
    for(const l of Object.values(layout)){const b=backgroundAt(l,timeline.bg,l.t||0);const owns=!!(l.background&&Object.hasOwn(l.background,'src'));const anyLoc=!owns&&Array.isArray(timeline.bg?.locations)&&timeline.bg.locations.some(row=>row&&row.src);if((b.src||anyLoc)&&b.key_white&&l.full&&!keyedImages.has(l.full)){const im=images.get(l.full);let keyed=keyCache?.get(im);if(!keyed){keyed=removeWhiteBackdrop(im);keyCache?.set(im,keyed);}keyedImages.set(l.full,keyed);}}
  }
  // Flood only edge-connected neutral whites, preserving enclosed white clothing/highlights.
  function removeWhiteBackdrop(im) {
    const c=document.createElement('canvas');c.width=im.width;c.height=im.height;
    const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0);
    const frame=g.getImageData(0,0,c.width,c.height),d=frame.data,w=c.width,h=c.height;
    const seen=new Uint8Array(w*h),queue=new Uint32Array(w*h);let head=0,tail=0;
    function add(i){if(seen[i])return;seen[i]=1;const k=i*4;const lo=Math.min(d[k],d[k+1],d[k+2]),hi=Math.max(d[k],d[k+1],d[k+2]);if(d[k+3]<8||(lo>=245&&hi-lo<=12))queue[tail++]=i;}
    for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=1;y<h-1;y++){add(y*w);add(y*w+w-1);}
    while(head<tail){const i=queue[head++],x=i%w;d[i*4+3]=0;if(x>0)add(i-1);if(x<w-1)add(i+1);if(i>=w)add(i-w);if(i<w*(h-1))add(i+w);}
    g.putImageData(frame,0,0);return c;
  }
  // HM-BG-CROP: only the normalized crop region of the source is drawn, cover-fitted to the stage.
  function backgroundImage(path,crop){const im=images.get(path);if(!im)return;const c=crop&&[crop.x,crop.y,crop.w,crop.h].every(Number.isFinite)?crop:{x:0,y:0,w:1,h:1};const sx=Math.max(0,c.x)*im.width,sy=Math.max(0,c.y)*im.height,sw=Math.max(1,Math.min(im.width-sx,c.w*im.width)),sh=Math.max(1,Math.min(im.height-sy,c.h*im.height));const s=Math.max(1280/sw,720/sh);ctx.drawImage(im,sx,sy,sw,sh,(1280-sw*s)/2,(720-sh*s)/2,sw*s,sh*s);}
  function image(path, x, y, w, h, contain = false, flip = false, keyWhite = false) {
    const im = (keyWhite&&keyedImages.get(path)) || images.get(path); if (!im) return;
    if (contain) { const s = Math.min(w / im.width, h / im.height); x += (w - im.width * s) / 2; y += (h - im.height * s) / 2; w = im.width * s; h = im.height * s; }
    ctx.save(); if (flip) {ctx.translate(x + w, y); ctx.scale(-1, 1); x = 0; y = 0;} ctx.drawImage(im, x, y, w, h); ctx.restore();
  }
  function paintBackground(path, crop, x, y, s) {
    ctx.save(); ctx.translate(640 + x, 360 + y); ctx.scale(s, s); ctx.translate(-640, -360); backgroundImage(path, crop); ctx.restore();
  }
  function drawBackground(l, t) {
    const b=backgroundAt(l,timeline.bg,t);if(!b.src)return;
    const a=timeline.atoms.find(a=>a.id===l.atom),m=b.motion||{},preset=m.preset||'follow_camera',amount=m.amount??.4,zoom=l.bg_zoom||1;
    const u=backgroundMotionProgress(m,t,a?{duration:timeline.duration_s,atomT0:a.t0,atomT1:a.t1}:{duration:timeline.duration_s,atomT0:t,atomT1:t});
    const frame=backgroundMotionFrame(b.crop,preset,amount,u);
    if(frame.mode==='inset'){
      const extra=amount*.25;let s=1,x=0,y=0;
      if(preset==='push_in')s=1+extra*u;
      if(preset==='pull_out')s=1+extra*(1-u);
      if(preset.startsWith('pan_')){s=1+extra;const v=1-2*u;if(preset==='pan_left')x=640*extra*v;if(preset==='pan_right')x=-640*extra*v;if(preset==='pan_up')y=360*extra*v;if(preset==='pan_down')y=-360*extra*v;}
      paintBackground(b.src,frame.crop,x,y,s*zoom);
    }else paintBackground(b.src,frame.crop,0,0,zoom);
  }
  function drawFgBreak(im, age) {
    const w = im.width, h = im.height, mid = Math.max(1, Math.floor(w / 2));
    const grown = Math.max(0, age);
    const gap = 14 + Math.min(22, grown * 80);
    const drop = Math.min(14, grown * 36);
    ctx.drawImage(im, 0, 0, mid, h, -w / 2 - gap, -h / 2, mid, h);
    ctx.drawImage(im, mid, 0, w - mid, h, -w / 2 + mid + gap, -h / 2 + drop, w - mid, h);
    const seam = 22 + Math.min(10, grown * 20);
    ctx.fillStyle = '#140c08';
    ctx.fillRect(-seam / 2, -h / 2, seam, h);
  }
  function drawForeground(t) {
    const fg = timeline.fg;
    if (!fg || !fg.props || !fg.props.length) return;
    const cam = fgCameraFrame(fg.cam, t, { duration: timeline.duration_s, atomT0: 0, atomT1: timeline.duration_s });
    const list = fg.props.filter(p => t >= p.t_start && t < p.t_end).sort((a, b) => (a.z || 0) - (b.z || 0) || String(a.id).localeCompare(String(b.id)));
    if (!list.length) return;
    ctx.save();
    ctx.translate(640 + cam.x, 360 + cam.y);
    ctx.scale(cam.s, cam.s);
    ctx.translate(-640, -360);
    for (const p of list) {
      const pose = fgPropPose(p, t);
      const br = fgBreakState(p, t);
      const im = images.get(br.src);
      if (!im) continue;
      ctx.save();
      ctx.translate(pose.x, pose.y);
      ctx.scale(pose.scale || 1, pose.scale || 1);
      if (br.procedural) drawFgBreak(im, br.age);
      else ctx.drawImage(im, -im.width / 2, -im.height / 2);
      ctx.restore();
    }
    ctx.restore();
  }
  function drawScene(l, sampleT) {
    const b=backgroundAt(l,timeline.bg,sampleT);
    if (l.strip && l.strip.src && typeof drawStripFrame === 'function') {
      lastStripSample = drawStripFrame(ctx, images.get(l.strip.src), l.strip, sampleT, timeline?.floor_y);
    } else if (l.full) image(l.full, 0, 0, 1280, 720, true, false, !!b.src && b.key_white);
    else {
      (l.shadows || []).forEach(s => { ctx.fillStyle = '#0b181c22'; ctx.beginPath(); ctx.ellipse(s.cx,s.cy,s.rx,s.ry,0,0,Math.PI*2);ctx.fill(); });
      (l.parts || []).forEach(p => image(p.src, p.x, p.y, p.w, p.h, false, p.flip));
      if (l.slate) {ctx.fillStyle='#1c2b30';ctx.fillRect(0,0,1280,720);ctx.fillStyle='#ccf17b';ctx.font='24px sans-serif';ctx.textAlign='center';ctx.fillText(l.slate,640,360,1100);}
    }
  }
  const PIXELFX_WAVE1_IDS = [
    'impacts/hit-spark', 'impacts/blunt-hit', 'impacts/crit-hit', 'impacts/hit-flash',
    'impacts/impact-frame', 'impacts/parry', 'impacts/ground-slam', 'impacts/heavy-landing',
    'melee/uppercut', 'explosions/cartoon-pow', 'explosions/dirt-explosion', 'explosions/smoke-bomb',
  ];
  function isPixelfxHook(raw, type) {
    if (raw && raw.source === 'pixelfx') return true;
    if (PIXELFX_WAVE1_IDS.indexOf(type) >= 0) return true;
    const api = globalThis.HMPixelFx;
    return !!(api && typeof api.has === 'function' && api.has(type));
  }
  function hooksToFx(hooks, t0, t1) {
    const d = Math.max(0.05, t1 - t0);
    const out = { hits: [], hitstop: [], flash: [], bgflash: [], shake: [], trails: [], dust: [], speed: [], sparks: [], pink_cut: null, exposure: [], fist: [], leg: [], tornado: [], pixelfx: [] };
    const hasImpactMeta = prm => prm && ['x', 'y', 'at', 'angle', 'strength', 'dur', 'frames', 'hitstop_frames', 'hitstop', 'hitstop_dur', 'invert', 'contrast', 'tint', 'recoil', 'shake_dur'].some(k => prm[k] !== undefined);
    for (const raw of hooks || []) {
      const type = typeof raw === 'string' ? raw : raw?.type;
      if (!type || type === 'none') continue;
      if (timeline && timeline.fx_profile === 'comic' && PHOTO_FX_CHIP_SET.has(type)) continue;
      const prm = (raw && raw.params) || {};
      const tRel = raw?.t_rel != null ? +raw.t_rel : 0.08;
      const tRelEnd = raw?.t_rel_end != null ? +raw.t_rel_end : 0.92;
      const ht = t0 + tRel * d;
      if (isPixelfxHook(raw, type)) {
        out.pixelfx.push([ht, type]);
        continue;
      }
      const he = t0 + tRelEnd * d;
      const span = Number.isFinite(+prm.dur) && +prm.dur > 0 ? +prm.dur : (raw?.t_rel_end != null ? Math.max(0.01, he - ht) : (type === 'exposure_warm_crush' ? 0.10 : type === 'leg_arc' ? 0.28 : type === 'tornado_spiral' ? 0.50 : 0.36));
      if (type === 'hit_orange') out.hits.push(hasImpactMeta(prm) ? [ht, prm.color || '#ff8a1e', prm] : [ht, prm.color || '#ff8a1e']);
      else if (type === 'hit_pink') out.hits.push(hasImpactMeta(prm) ? [ht, prm.color || '#ff3fa4', prm] : [ht, prm.color || '#ff3fa4']);
      else if (type === 'impact_white') out.hits.push(hasImpactMeta(prm) ? [ht, prm.color || '#ffffff', prm] : [ht, prm.color || '#ffffff']);
      else if (type === 'hitstop_2f') out.hitstop.push(hasImpactMeta(prm) ? [ht, prm] : ht);
      else if (type === 'flash_orange') out.flash.push([ht, prm.color || '#ff8a1e']);
      else if (type === 'flash_pink') out.flash.push([ht, prm.color || '#ff3fa4']);
      else if (type === 'bg_flash_blue') out.bgflash.push([ht, prm.color || '#2f7bff']);
      else if (type === 'bg_flash_teal') out.bgflash.push([ht, prm.color || '#19e0d0']);
      else if (type === 'shake') out.shake.push([ht, prm.amp ?? 14, prm.dur ?? 0.32]);
      else if (type === 'smear_trail') out.trails.push([ht, prm.dir ?? 1]);
      else if (type === 'dust') out.dust.push([ht, prm.k ?? 1]);
      else if (type === 'speed_lines') out.speed.push([ht, he, prm.mode || 'up', prm.k0 ?? 0, prm.k1 ?? 1]);
      else if (type === 'sparks') out.sparks.push([ht, prm.n ?? 40, prm.at]);
      else if (type === 'pink_cut') out.pink_cut = ht;
      else if (type === 'exposure_warm_crush') {
        const xf = fxPlacementOf(prm);
        out.exposure.push(Math.abs(xf.x) > 1e-6 || Math.abs(xf.y) > 1e-6 || Math.abs(xf.scale - 1) > 1e-6 ? [ht, span, xf] : [ht, span]);
      } else if (type === 'fist_pressure') {
        const xf = fxPlacementOf(prm);
        out.fist.push(Math.abs(xf.x) > 1e-6 || Math.abs(xf.y) > 1e-6 || Math.abs(xf.scale - 1) > 1e-6 ? [ht, span, fxPathOrStock('fist_pressure', prm.path), xf] : [ht, span, fxPathOrStock('fist_pressure', prm.path)]);
      } else if (type === 'leg_arc') {
        const xf = fxPlacementOf(prm);
        out.leg.push(Math.abs(xf.x) > 1e-6 || Math.abs(xf.y) > 1e-6 || Math.abs(xf.scale - 1) > 1e-6 ? [ht, span, fxPathOrStock('leg_arc', prm.path), xf] : [ht, span, fxPathOrStock('leg_arc', prm.path)]);
      } else if (type === 'tornado_spiral') {
        const xf = fxPlacementOf(prm);
        out.tornado.push(Math.abs(xf.x) > 1e-6 || Math.abs(xf.y) > 1e-6 || Math.abs(xf.scale - 1) > 1e-6 ? [ht, span, fxPathOrStock('tornado_spiral', prm.path), xf] : [ht, span, fxPathOrStock('tornado_spiral', prm.path)]);
      }
    }
    return out;
  }
  function drawParametric(fxSource, delta) {
    (fxSource.tornado || []).forEach(([h, dur = 0.5, path, xf]) => {
      const d = delta(h, dur);
      if (d < 0) return;
      const u = dur > 0 ? d / dur : 0;
      const p = fxPlacementOf(xf);
      const pts = transformFxPath(path, p);
      const at = fxPointOnPath(pts, u);
      drawTornado(ctx, at[0], at[1], u, p.scale);
    });
    (fxSource.leg || []).forEach(([h, dur = 0.28, path, xf]) => {
      const d = delta(h, dur);
      if (d < 0) return;
      drawLegArc(ctx, path, dur > 0 ? d / dur : 0, xf);
    });
    (fxSource.fist || []).forEach(([h, dur = 0.36, path, xf]) => {
      const d = delta(h, dur);
      if (d < 0) return;
      const u = dur > 0 ? d / dur : 0;
      const p = fxPlacementOf(xf);
      const pts = transformFxPath(path, p);
      const at = fxPointOnPath(pts, u);
      drawFistPressure(ctx, at[0], at[1], u, p.scale);
    });
  }
  function activeExposures(list, delta) {
    return (list || []).filter(([h, dur]) => delta(h, dur > 0 ? dur : 0.10) >= 0);
  }
  function exposureLive(list, delta) {
    return activeExposures(list, delta).length > 0;
  }
  function render(time, opts = {}) {
    lastTime = Math.round((Number(time) || 0) * 10000) / 10000;
    lastRenderViaSoT = opts.viaSoT === true;
    lastRenderSource = String(opts.source || (lastRenderViaSoT ? 'renderStageAt' : 'direct-renderer.render'));
    if (typeof onRenderHook === 'function') {
      try { onRenderHook(time, opts); } catch (_) {}
    }
    ctx.save(); ctx.setTransform(canvas.width / 1280, 0, 0, canvas.height / 720, 0, 0);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1280, 720);
    if (!timeline || !timeline.plates.length) { lastCut = null; lastStripSample = null; lastHitstop = null; ctx.restore(); return; }
    const clockT = clamp(time, 0, Math.max(0, timeline.duration_s - 1e-7));
    const heldCut = resolveCutTransition(timeline.cuts, clockT);
    const cutT = heldCut && heldCut.freeze ? Math.max(0, heldCut.t - 1e-4) : clockT;
    const atoms = timeline.atoms || [];
    const cutAIdx = atoms.findIndex(a => cutT >= a.t0 && cutT < a.t1);
    const cutAtom = cutAIdx >= 0 ? atoms[cutAIdx] : atoms.at(-1);
    const cutAtomT0 = opts.atomWindow ? opts.atomWindow[0] : (cutAtom ? cutAtom.t0 : 0);
    const cutAtomT1 = opts.atomWindow ? opts.atomWindow[1] : (cutAtom ? cutAtom.t1 : timeline.duration_s);
    const standIn = !!opts.fxStandIn;
    const fxSource = (standIn && Array.isArray(opts.liveHooks))
      ? hooksToFx(opts.liveHooks, cutAtomT0, cutAtomT1)
      : (standIn && cutAtom && Array.isArray(cutAtom.fx_hooks))
        ? hooksToFx(cutAtom.fx_hooks, cutAtomT0, cutAtomT1)
        : (timeline.fx || {});
    const hitstopState = (heldCut && heldCut.freeze)
      ? null
      : resolveHitstopAt(fxSource, cutT, { standIn, atomT0: cutAtomT0, atomT1: cutAtomT1 });
    lastHitstop = hitstopState;
    const t = (hitstopState && hitstopState.freeze) ? hitstopState.holdT : cutT;
    const fxT = cutT;
    lastLayerMatrix = layerCamMatrix(timeline, t, layout);
    lastCut = heldCut ? Object.assign({ pictureT: t }, heldCut) : null;
    lastStripSample = null;
    const pIdx = timeline.plates.findIndex(p => t >= p.t0 && t < p.t1);
    const plateIndex = pIdx >= 0 ? pIdx : timeline.plates.length - 1;
    const plate = timeline.plates[plateIndex];
    const l = layout[plate.id]; if (!l) {ctx.restore(); return;}
    const aIdx = atoms.findIndex(a => t >= a.t0 && t < a.t1);
    const curAtom = aIdx >= 0 ? atoms[aIdx] : atoms.at(-1);
    const atomT0 = cutAtom ? cutAtomT0 : (curAtom ? curAtom.t0 : plate.t0);
    const atomT1 = cutAtom ? cutAtomT1 : (curAtom ? curAtom.t1 : plate.t1);
    const inAtom = h => h >= atomT0 - 1e-4 && h <= atomT1 + 1e-4;
    function fxDelta(h, span) {
      const d = fxT - h;
      if (d >= 0 && d <= span) return standIn ? clamp(d, span * 0.15, span * 0.65) : d;
      if (standIn && inAtom(h)) return span * 0.25;
      return -1;
    }
    const segments = atoms.flatMap(a => a.cam);
    const seg = segments.find(s => t >= s.t0 && t < s.t1) || segments.at(-1);
    const camera = cameraPoseOnSegment(seg, t);
    const fx = timeline.fx || {};
    const shake = computeCameraImpactShake(standIn ? fxSource.shake : fx.shake, standIn ? fxSource.hits : fx.hits, fxT);
    const totalRot = camera.r + shake.dr;
    const drawScale = shake.amp > 1e-4
      ? Math.max(camera.s, 1 + Math.max(Math.abs(shake.dx) / 640, Math.abs(shake.dy) / 360) + Math.abs(Math.sin(totalRot * Math.PI / 180)) * 0.9)
      : camera.s;
    const bgMotion=backgroundAt(l,timeline.bg,t).motion,independent=bgMotion&&bgMotion.preset!=='follow_camera';
    if(independent)drawBackground(l,t);
    ctx.save(); ctx.translate(640 + camera.x + shake.dx, 360 + camera.y + shake.dy); ctx.rotate(totalRot * Math.PI / 180); ctx.scale(drawScale, drawScale); ctx.translate(-640, -360);
    if(!independent)drawBackground(l,t);
    drawScene(l,t);
    if (opts.onion) {
      const prevPlate = timeline.plates[plateIndex - 1], nextPlate = timeline.plates[plateIndex + 1];
      ctx.save(); ctx.globalAlpha = 0.25;
      if (prevPlate && layout[prevPlate.id]) drawScene(layout[prevPlate.id], t);
      if (nextPlate && layout[nextPlate.id]) drawScene(layout[nextPlate.id], t);
      ctx.restore();
    }
    ctx.restore();
    drawForeground(t);
    const pinkOnPreview = fxSource.pink_cut != null && (fxT >= fxSource.pink_cut || (standIn && inAtom(fxSource.pink_cut)));
    if (!pinkOnPreview && hitstopState && hitstopState.active) {
      if (typeof ctx.getImageData === 'function' && typeof ctx.putImageData === 'function') {
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        applyHitstopPixels(frame.data, hitstopState.u, hitstopState);
        ctx.putImageData(frame, 0, 0);
      } else {
        ctx.save();
        ctx.fillStyle = (hitstopState.invert === 'always' || (hitstopState.invert !== false && hitstopState.u < 0.45)) ? '#0b0e14' : (hitstopState.tint || '#ffffff');
        ctx.globalAlpha = 0.72 * (hitstopState.strength ?? 1);
        ctx.fillRect(0, 0, 1280, 720);
        ctx.restore();
      }
    }
    // Deterministic particles & live stand-ins avoid a different random result on every frame/export.
    (fxSource.dust || []).forEach(([h, k = 1]) => {
      const d = fxDelta(h, 0.55);
      if (d < 0) return;
      ctx.save();
      ctx.fillStyle = `rgba(120,138,134,${0.36 * (1 - d / 0.55)})`;
      for (let i = 0; i < 18; i++) {
        const v = Math.sin(i * 17.31);
        ctx.beginPath();
        ctx.arc(640 + v * (90 + d * 430) * k, 680 - Math.abs(Math.cos(i * 4.2)) * d * 110, 8 + d * 25, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
    (fxSource.hits || []).forEach(([h, col = '#ff8a1e', rawOpts]) => {
      const hitOpts = normalizeImpactOpts(rawOpts);
      const d = fxDelta(h, hitOpts.dur);
      if (d < 0) return;
      drawImpactBurst(ctx, hitOpts.x, hitOpts.y, d / hitOpts.dur, col, hitOpts);
    });
    (fxSource.flash || []).concat(fxSource.bgflash || []).forEach(([h, col = '#ff8a1e']) => {
      const d = fxDelta(h, 0.22);
      if (d < 0) return;
      const w = 1 - d / 0.22;
      ctx.save();
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.28 * w;
      ctx.fillRect(0, 0, 1280, 720);
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.6 * w;
      ctx.lineWidth = 3;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + 0.13;
        ctx.beginPath();
        ctx.moveTo(640 + Math.cos(a) * 60, 320 + Math.sin(a) * 60);
        ctx.lineTo(640 + Math.cos(a) * 240, 320 + Math.sin(a) * 240);
        ctx.stroke();
      }
      ctx.restore();
    });
    (fxSource.trails || []).forEach(([h, dir = 1]) => {
      const d = fxDelta(h, 0.18);
      if (d < 0) return;
      const w = 1 - d / 0.18;
      ctx.save();
      const a0 = dir > 0 ? Math.PI * 1.12 : -Math.PI * 0.18;
      const a1 = dir > 0 ? Math.PI * 1.72 : Math.PI * 0.42;
      for (let i = 0; i < 4; i++) {
        const r = 95 + i * 24;
        const cy = 320 + (i - 1) * 14;
        ctx.globalAlpha = 0.72 * w;
        ctx.strokeStyle = '#19e0d0';
        ctx.lineWidth = 9 - i * 1.5;
        ctx.beginPath();
        ctx.arc(640 - dir * 36, cy, r, a0, a1);
        ctx.stroke();
        ctx.globalAlpha = 0.9 * w;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4.5 - i * 0.7;
        ctx.beginPath();
        ctx.arc(640 - dir * 36, cy, r, a0, a1);
        ctx.stroke();
      }
      ctx.restore();
    });
    (fxSource.speed || []).forEach(([a, b, mode, k0 = 0, k1 = 1]) => {
      const inSpan = t >= a && t < b;
      const standInSpan = standIn && a < atomT1 + 1e-4 && b > atomT0 - 1e-4;
      if (!inSpan && !standInSpan) return;
      const u = inSpan ? (t - a) / Math.max(1e-6, b - a) : 0.5;
      const k = k0 + (k1 - k0) * u;
      ctx.save();
      for (let i = 0; i < 46; i++) {
        const angle = (i / 46) * Math.PI * 2 + t * 0.1;
        ctx.beginPath();
        if (mode === 'radial') {
          ctx.moveTo(640 + Math.cos(angle) * (420 - k * 160), 360 + Math.sin(angle) * (320 - k * 120));
          ctx.lineTo(640 + Math.cos(angle) * 780, 360 + Math.sin(angle) * 620);
        } else {
          const x = 90 + ((i * 177.3) % 1100);
          const y = 60 + ((i * 98.1 + t * 300) % 560);
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + (mode === 'up' ? -1 : 1) * (75 + k * 75));
        }
        ctx.strokeStyle = '#1b3b3699';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.strokeStyle = '#77ffddcc';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    });
    (fxSource.sparks || []).forEach(([h, n = 40, at]) => {
      const rawD = fxDelta(h, 0.4);
      if (rawD < 0) return;
      const d = Math.max(0.05, rawD);
      const w = 1 - rawD / 0.4;
      const cx = at?.[0] ?? 640, cy = at?.[1] ?? 320;
      ctx.save();
      ctx.globalAlpha = 0.55 * w;
      ctx.fillStyle = '#ff9800';
      ctx.beginPath();
      ctx.arc(cx, cy, 24, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (i % 3) * 0.14;
        const speed = 260 + ((i * 73) % 420);
        const x = cx + Math.cos(a) * d * speed;
        const y = cy + Math.sin(a) * d * speed + d * d * 360;
        const tx = x - Math.cos(a) * 22;
        const ty = y - Math.sin(a) * 22;
        ctx.globalAlpha = 0.85 * w;
        ctx.strokeStyle = '#ff6d00';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.strokeStyle = '#ffe082';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      }
      ctx.restore();
    });
    if (standIn) {
      (fxSource.shake || []).forEach(([h, a = 8, dur = 0.2]) => {
        const d = fxDelta(h, dur || 0.2);
        if (d < 0) return;
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = '#ff8a1e';
        ctx.lineWidth = 2.5;
        for (const dir of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(640, 320, 78, dir > 0 ? -0.45 : Math.PI - 0.45, dir > 0 ? 0.45 : Math.PI + 0.45);
          ctx.stroke();
        }
        ctx.restore();
      });
    }
    const paintOverlays = (timeline.overlays || []).filter(o => o.fx_paint !== false);
    const overlayFx = collectProceduralOverlays(paintOverlays, fxT);
    // Inside the authored window, follow the path with real time (scrub and play).
    // Outside it, the editor stand-in still shows one representative frame.
    const phase = (h, dur) => {
      const d = fxT - h;
      if (d >= 0 && d <= dur) return d;
      return fxDelta(h, dur);
    };
    drawParametric(fxSource, phase);
    drawParametric(overlayFx, phase);
    const pinkOn = pinkOnPreview;
    const liveExposures = activeExposures(fxSource.exposure, fxDelta).concat(activeExposures(overlayFx.exposure, fxDelta));
    if (!pinkOn && liveExposures.length) {
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const entry = liveExposures[0];
      const xf = fxPlacementOf(entry && entry[2]);
      const hasXf = Math.abs(xf.x) > 1e-6 || Math.abs(xf.y) > 1e-6 || Math.abs(xf.scale - 1) > 1e-6;
      if (hasXf) {
        const sx = canvas.width / 1280, sy = canvas.height / 720;
        const cx = (640 + xf.x) * sx, cy = (360 + xf.y) * sy;
        const rw = 1280 * xf.scale * sx, rh = 720 * xf.scale * sy;
        exposureWarmCrushPixels(frame.data, 1, {
          w: canvas.width,
          h: canvas.height,
          x0: cx - rw / 2,
          y0: cy - rh / 2,
          x1: cx + rw / 2,
          y1: cy + rh / 2,
        });
      } else {
        exposureWarmCrushPixels(frame.data, 1);
      }
      ctx.putImageData(frame, 0, 0);
    }
    const pixelfxMissed = [];
    const pixelfxDrawn = [];
    const pixelfxList = fxSource.pixelfx || [];
    for (let pi = 0; pi < pixelfxList.length; pi++) {
      const entry = pixelfxList[pi];
      const hitT = entry[0];
      const fxId = entry[1];
      if (hitT == null || !fxId) continue;
      const api = globalThis.HMPixelFx;
      const meta = api && typeof api.meta === 'function' ? api.meta(fxId) : null;
      const dur = meta && Number(meta.duration) > 0 ? Number(meta.duration) : 0.6;
      const elapsed = fxT - hitT;
      let local = -1;
      if (elapsed >= -1e-4 && elapsed <= dur + 1e-4) local = Math.min(dur, Math.max(0, elapsed));
      else if (standIn && inAtom(hitT)) local = Math.min(dur * 0.35, 0.2);
      if (local < 0) continue;
      if (!api || typeof api.paint !== 'function') {
        pixelfxMissed.push(fxId);
        continue;
      }
      try {
        const res = api.paint(fxId, local, ctx);
        if (res && res.drew) pixelfxDrawn.push(fxId);
        else pixelfxMissed.push(fxId);
      } catch (_) {
        pixelfxMissed.push(fxId);
      }
    }
    lastPixelfx = { drawn: pixelfxDrawn, missed: pixelfxMissed };
    if (typeof document !== 'undefined') {
      const pxBanner = document.getElementById('pixelfxHonesty');
      if (pxBanner) {
        if (pixelfxMissed.length) {
          pxBanner.hidden = false;
          pxBanner.textContent = 'Pixelfx did not draw: ' + pixelfxMissed.join(', ') + '. Those hooks stay on the clip and did not paint.';
        } else {
          pxBanner.hidden = true;
          pxBanner.textContent = '';
        }
      }
    }
    if (pinkOn) {
      ctx.fillStyle = '#ff2f9a';
      ctx.fillRect(0, 0, 1280, 720);
    }
    paintCutOverlay(ctx, heldCut);
    if (heldCut && heldCut.whip) drawWhipCut(ctx, heldCut.whip);
    paintOverlays.filter(o => fxT >= o.t_start && fxT < o.t_end && o.kind !== 'exposure_warm_crush' && o.kind !== 'fist_pressure' && o.kind !== 'leg_arc' && o.kind !== 'tornado_spiral').sort((a,b)=>(a.z||0)-(b.z||0)).forEach(o=>{
      ctx.save();ctx.globalAlpha=clamp(o.opacity??1,0,1);ctx.translate(o.x??640,o.y??640);ctx.scale(o.scale||1,o.scale||1);
      if(o.kind==='text'||o.text){
        const style=o.style||{};
        const fontSize=Number(style.fontSize)||38;
        ctx.font=`${style.italic?'italic ':''}${style.fontWeight||700} ${fontSize}px ${style.fontFamily||'sans-serif'}`;
        ctx.textAlign='center';
        ctx.textBaseline='middle';
        ctx.lineJoin='round';
        if(style.skewX&&typeof ctx.transform==='function')ctx.transform(1,0,Number(style.skewX)||0,1,0,0);
        if(style.boxFill||style.boxStroke||style.accentBar){
          const measured=typeof ctx.measureText==='function'?ctx.measureText(o.text).width:0;
          const tw=Math.min(1150,Math.max(40,measured||String(o.text).length*fontSize*0.6));
          const px=Number(style.padX??20),py=Number(style.padY??10),bw=tw+px*2,bh=fontSize+py*2;
          if(style.boxFill&&typeof ctx.fillRect==='function'){ctx.fillStyle=style.boxFill;ctx.fillRect(-bw/2,-bh/2,bw,bh);}
          if(style.boxStroke&&typeof ctx.strokeRect==='function'){ctx.strokeStyle=style.boxStroke;ctx.lineWidth=Number(style.boxStrokeWidth??3);ctx.strokeRect(-bw/2,-bh/2,bw,bh);}
          if(style.accentBar&&typeof ctx.fillRect==='function'){ctx.fillStyle=style.accentBar;ctx.fillRect(-bw/2,-bh/2,8,bh);}
        }
        if(style.glitchCyan){ctx.fillStyle=style.glitchCyan;ctx.fillText(o.text,-Number(style.glitchOffset||4),0,1150);}
        if(style.glitchMagenta){ctx.fillStyle=style.glitchMagenta;ctx.fillText(o.text,Number(style.glitchOffset||4),0,1150);}
        ctx.strokeStyle=style.stroke||'#15201c';
        ctx.lineWidth=style.strokeWidth??6;
        ctx.strokeText(o.text,0,0,1150);
        ctx.fillStyle=style.fill||'#ffffff';
        ctx.fillText(o.text,0,0,1150);
      }else if(o.src){const im=images.get(o.src);if(im)image(o.src,-im.width/2,-im.height/2,im.width,im.height);}ctx.restore();
    });
    ctx.restore();
  }
  return {
    load,
    render,
    images,
    get lastTime() { return lastTime; },
    get lastRenderViaSoT() { return lastRenderViaSoT; },
    get lastRenderSource() { return lastRenderSource; },
    get lastPixelfx() { return lastPixelfx; },
    get lastCut() { return lastCut; },
    get lastLayerMatrix() { return lastLayerMatrix; },
    get lastStripSample() { return lastStripSample; },
    get lastHitstop() { return lastHitstop; },
    set onRenderHook(fn) { onRenderHook = typeof fn === 'function' ? fn : null; },
    get duration() { return timeline?.duration_s || 0; }
  };
}
const hmRoot = typeof globalThis !== 'undefined' ? globalThis : window;
hmRoot.backgroundMotionFrame = backgroundMotionFrame;
hmRoot.backgroundMotionProgress = backgroundMotionProgress;
hmRoot.backgroundMotionSupport = backgroundMotionSupport;
hmRoot.FG_CAM_PRESETS = FG_CAM_PRESETS;
hmRoot.FG_DEFAULT_PARALLAX = FG_DEFAULT_PARALLAX;
hmRoot.FG_PARALLAX_PRESETS = FG_PARALLAX_PRESETS;
hmRoot.fgCameraFrame = fgCameraFrame;
hmRoot.fgPropPose = fgPropPose;
hmRoot.fgBrokenCutoutSrc = fgBrokenCutoutSrc;
hmRoot.fgBreakState = fgBreakState;
hmRoot.FX_FIST_PATH = FX_FIST_PATH;
hmRoot.FX_LEG_PATH = FX_LEG_PATH;
hmRoot.FX_TORNADO_PATH = FX_TORNADO_PATH;
hmRoot.fxPlacementOf = fxPlacementOf;
hmRoot.transformFxPath = transformFxPath;
hmRoot.HMMotionFx = {
  exposureWarmCrushPixels,
  normalizeImpactOpts,
  normalizeHitstopEntry,
  resolveHitstopAt,
  applyHitstopPixels,
  impactBurstGeometry,
  drawImpactBurst,
  computeCameraImpactShake,
  fxPathOrStock,
  fxPointOnPath,
  fxPlacementOf,
  transformFxPath,
  drawFistPressure,
  drawLegArc,
  drawTornado,
  collectProceduralOverlays,
  PHOTO_FX_CHIPS,
};
if (hmRoot.HMComposeClient) {
  hmRoot.HMComposeClient.backgroundMotionFrame = backgroundMotionFrame;
  hmRoot.HMComposeClient.backgroundMotionProgress = backgroundMotionProgress;
  hmRoot.HMComposeClient.backgroundMotionSupport = backgroundMotionSupport;
  hmRoot.HMComposeClient.fgCameraFrame = fgCameraFrame;
  hmRoot.HMComposeClient.fgPropPose = fgPropPose;
  hmRoot.HMComposeClient.fgBreakState = fgBreakState;
  hmRoot.HMComposeClient.FG_CAM_PRESETS = FG_CAM_PRESETS;
  hmRoot.HMComposeClient.FG_DEFAULT_PARALLAX = FG_DEFAULT_PARALLAX;
  hmRoot.HMComposeClient.FG_PARALLAX_PRESETS = FG_PARALLAX_PRESETS;
}
hmRoot.resolveCutTransition = resolveCutTransition;
hmRoot.drawWhipCut = drawWhipCut;
hmRoot.paintCutOverlay = paintCutOverlay;
hmRoot.cameraEase = cameraEase;
hmRoot.cameraChannel = cameraChannel;
hmRoot.layerCamMatrix = layerCamMatrix;
hmRoot.layerCamsIndependent = layerCamsIndependent;
hmRoot.layerCamMatrixText = layerCamMatrixText;
hmRoot.cameraPoseOnSegment = cameraPoseOnSegment;
hmRoot.HMMotion = createMotionRenderer;

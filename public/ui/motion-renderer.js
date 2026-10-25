/* Shared deterministic renderer: the editor, player, HTML export and video use this same code. */

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
function fgCameraFrame(cam, t, clock) {
  const c = cam && typeof cam === 'object' ? cam : {};
  // Inlined so the exported HTML player does not depend on an outer binding.
  const presets = ['static', 'nudge', 'parallax', 'pan_left', 'pan_right', 'pan_up', 'pan_down', 'push_in', 'pull_out'];
  const preset = presets.includes(c.preset) ? c.preset : 'static';
  const amount = c.amount == null || !Number.isFinite(+c.amount) ? 0 : Math.min(1, Math.max(0, +c.amount));
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
function fgBreakState(prop, t) {
  const src = prop && prop.src;
  const effect = prop && prop.effect;
  if (!effect || effect.type !== 'break' || !(+t >= +effect.t)) return { broken: false, src, age: 0, procedural: false };
  const age = +t - +effect.t;
  return { broken: true, src: effect.broken_src || src, age, procedural: !effect.broken_src };
}
function createMotionRenderer(canvas, assets = {}) {
  const ctx = canvas.getContext('2d');
  const images = new Map(), keyedImages = new Map();
  let timeline, layout, lastTime = 0;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (u, kind) => kind === 'linear' ? u : kind === 'sine' ? .5 - .5 * Math.cos(Math.PI * u) : u * u * (3 - 2 * u);
  function curve(c, u, t) {
    if (c.type === 'const') return c.v;
    if (c.type === 'lerp') return c.a + (c.b - c.a) * ease(u, c.ease);
    if (c.type === 'saw') return c.a + (c.b - c.a) * ((t % c.period_s) / c.period_s);
    if (c.type === 'sin') return (c.offset || 0) + c.amp * Math.sin(('omega' in c ? c.omega * t : 2 * Math.PI * (c.cycles ?? 1) * u) + (c.phase || 0));
    if (c.type === 'alt_bump') { const k = c.n * u; return (c.offset || 0) + (Math.floor(k) % 2 ? 1 : -1) * c.amp * Math.sin((k % 1) * Math.PI); }
    return 0;
  }
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
    Object.values(layout).forEach(l => { if (l.full) paths.add(l.full); if(l.background?.src)paths.add(l.background.src); (l.parts || []).forEach(p => paths.add(p.src)); });
    Object.values(timeline.bg || {}).filter(p => typeof p === 'string').forEach(p => paths.add(p));
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
    for(const l of Object.values(layout)){const b=backgroundFor(l);if(b.src&&b.key_white&&l.full&&!keyedImages.has(l.full)){const im=images.get(l.full);let keyed=keyCache?.get(im);if(!keyed){keyed=removeWhiteBackdrop(im);keyCache?.set(im,keyed);}keyedImages.set(l.full,keyed);}}
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
  function backgroundFor(l) {
    const own=l.background||{},global=timeline.bg||{};
    return {src:Object.hasOwn(own,'src')?own.src:global[l.bg||'base'],key_white:own.key_white??global.key_white,motion:own.motion??global.motion,crop:own.crop??(Object.hasOwn(own,'src')?null:global.crops?.[l.bg||'base'])??null};
  }
  function paintBackground(path, crop, x, y, s) {
    ctx.save(); ctx.translate(640 + x, 360 + y); ctx.scale(s, s); ctx.translate(-640, -360); backgroundImage(path, crop); ctx.restore();
  }
  function drawBackground(l, t) {
    const b=backgroundFor(l);if(!b.src)return;
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
    const gap = 10 + Math.min(16, Math.max(0, age) * 70);
    const drop = Math.min(10, Math.max(0, age) * 28);
    ctx.drawImage(im, 0, 0, mid, h, -w / 2 - gap, -h / 2, mid, h);
    ctx.drawImage(im, mid, 0, w - mid, h, -w / 2 + mid + gap, -h / 2 + drop, w - mid, h);
    ctx.fillStyle = '#140c08';
    ctx.fillRect(-5, -h / 2, 10, h);
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
  function drawScene(l) {
    const b=backgroundFor(l);
    if (l.full) image(l.full, 0, 0, 1280, 720, true, false, !!b.src && b.key_white);
    else {
      (l.shadows || []).forEach(s => { ctx.fillStyle = '#0b181c22'; ctx.beginPath(); ctx.ellipse(s.cx,s.cy,s.rx,s.ry,0,0,Math.PI*2);ctx.fill(); });
      (l.parts || []).forEach(p => image(p.src, p.x, p.y, p.w, p.h, false, p.flip));
      if (l.slate) {ctx.fillStyle='#1c2b30';ctx.fillRect(0,0,1280,720);ctx.fillStyle='#ccf17b';ctx.font='24px sans-serif';ctx.textAlign='center';ctx.fillText(l.slate,640,360,1100);}
    }
  }
  function hooksToFx(hooks, t0, t1) {
    const d = Math.max(0.05, t1 - t0);
    const out = { hits: [], flash: [], bgflash: [], shake: [], trails: [], dust: [], speed: [], sparks: [], pink_cut: null };
    for (const raw of hooks || []) {
      const type = typeof raw === 'string' ? raw : raw?.type;
      if (!type || type === 'none') continue;
      const prm = (raw && raw.params) || {};
      const tRel = raw?.t_rel != null ? +raw.t_rel : 0.08;
      const tRelEnd = raw?.t_rel_end != null ? +raw.t_rel_end : 0.92;
      const ht = t0 + tRel * d;
      const he = t0 + tRelEnd * d;
      if (type === 'hit_orange') out.hits.push([ht, prm.color || '#ff8a1e']);
      else if (type === 'hit_pink') out.hits.push([ht, prm.color || '#ff3fa4']);
      else if (type === 'impact_white') out.hits.push([ht, prm.color || '#ffffff']);
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
    }
    return out;
  }
  function render(time, opts = {}) {
    lastTime = Math.round((Number(time) || 0) * 10000) / 10000;
    ctx.save(); ctx.setTransform(canvas.width / 1280, 0, 0, canvas.height / 720, 0, 0);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1280, 720);
    if (!timeline || !timeline.plates.length) { ctx.restore(); return; }
    const t = clamp(time, 0, Math.max(0, timeline.duration_s - 1e-7));
    const pIdx = timeline.plates.findIndex(p => t >= p.t0 && t < p.t1);
    const plateIndex = pIdx >= 0 ? pIdx : timeline.plates.length - 1;
    const plate = timeline.plates[plateIndex];
    const l = layout[plate.id]; if (!l) {ctx.restore(); return;}
    const atoms = timeline.atoms || [];
    const aIdx = atoms.findIndex(a => t >= a.t0 && t < a.t1);
    const curAtom = aIdx >= 0 ? atoms[aIdx] : atoms.at(-1);
    const atomT0 = opts.atomWindow ? opts.atomWindow[0] : (curAtom ? curAtom.t0 : plate.t0);
    const atomT1 = opts.atomWindow ? opts.atomWindow[1] : (curAtom ? curAtom.t1 : plate.t1);
    const inAtom = h => h >= atomT0 - 1e-4 && h <= atomT1 + 1e-4;
    const standIn = !!opts.fxStandIn;
    const fxSource = (standIn && Array.isArray(opts.liveHooks))
      ? hooksToFx(opts.liveHooks, atomT0, atomT1)
      : (standIn && curAtom && Array.isArray(curAtom.fx_hooks))
        ? hooksToFx(curAtom.fx_hooks, atomT0, atomT1)
        : (timeline.fx || {});
    function fxDelta(h, span) {
      const d = t - h;
      if (d >= 0 && d <= span) return standIn ? clamp(d, span * 0.15, span * 0.65) : d;
      if (standIn && inAtom(h)) return span * 0.25;
      return -1;
    }
    const segments = atoms.flatMap(a => a.cam);
    const seg = segments.find(s => t >= s.t0 && t < s.t1) || segments.at(-1);
    const camera = {x:0,y:0,s:1,r:0};
    if (seg) { const u = seg.u0 + (seg.u1 - seg.u0) * clamp((t - seg.t0) / (seg.t1 - seg.t0), 0, 1); for (const k of 'xysr') if (seg.curves[k]) camera[k] = curve(seg.curves[k], u, t - seg.t0); }
    camera.s = Math.max(camera.s, 1 + Math.abs(Math.sin(camera.r * Math.PI / 180)) * .9);
    const fx = timeline.fx || {};
    let amp = 0;
    (fx.shake || []).forEach(([h, a, d]) => { if (t >= h && t < h + d) amp = Math.max(amp, a * (1 - (t - h) / d)); });
    (fx.hits || []).forEach(([h]) => { if (t >= h && t < h + .28) amp = Math.max(amp, 9 * (1 - (t - h) / .28)); });
    const bgMotion=backgroundFor(l).motion,independent=bgMotion&&bgMotion.preset!=='follow_camera';
    if(independent)drawBackground(l,t);
    ctx.save(); ctx.translate(640 + camera.x + Math.sin(t * 157) * amp, 360 + camera.y + Math.cos(t * 131) * amp * .6); ctx.rotate(camera.r * Math.PI / 180); ctx.scale(camera.s, camera.s); ctx.translate(-640, -360);
    if(!independent)drawBackground(l,t);
    drawScene(l);
    if (opts.onion) {
      const prevPlate = timeline.plates[plateIndex - 1], nextPlate = timeline.plates[plateIndex + 1];
      ctx.save(); ctx.globalAlpha = 0.25;
      if (prevPlate && layout[prevPlate.id]) drawScene(layout[prevPlate.id]);
      if (nextPlate && layout[nextPlate.id]) drawScene(layout[nextPlate.id]);
      ctx.restore();
    }
    ctx.restore();
    drawForeground(t);
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
    (fxSource.hits || []).forEach(([h, col = '#ff8a1e']) => {
      const d = fxDelta(h, 0.22);
      if (d < 0) return;
      const w = 1 - d / 0.22;
      ctx.save();
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.18 * w;
      ctx.fillRect(0, 0, 1280, 720);
      ctx.globalAlpha = 0.38 * w;
      ctx.beginPath();
      ctx.arc(640, 320, 44 + d * 240, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.65 * w;
      ctx.beginPath();
      ctx.arc(640, 320, 22 + d * 80, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.85 * w;
      ctx.strokeStyle = col;
      ctx.lineWidth = 4;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r0 = 18 + d * 360;
        const r1 = r0 + 52;
        ctx.beginPath();
        ctx.moveTo(640 + Math.cos(a) * r0, 320 + Math.sin(a) * r0);
        ctx.lineTo(640 + Math.cos(a) * r1, 320 + Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.restore();
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
    if (fxSource.pink_cut != null && (t >= fxSource.pink_cut || (standIn && inAtom(fxSource.pink_cut)))) {
      ctx.fillStyle = '#ff2f9a';
      ctx.fillRect(0, 0, 1280, 720);
    }
    (timeline.overlays || []).filter(o => t >= o.t_start && t < o.t_end).sort((a,b)=>(a.z||0)-(b.z||0)).forEach(o=>{
      ctx.save();ctx.globalAlpha=clamp(o.opacity??1,0,1);ctx.translate(o.x??640,o.y??640);ctx.scale(o.scale||1,o.scale||1);
      if(o.kind==='text'||o.text){const style=o.style||{};ctx.font=`${style.italic?'italic ':''}${style.fontWeight||700} ${style.fontSize||38}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.strokeStyle=style.stroke||'#15201c';ctx.lineWidth=style.strokeWidth??6;ctx.strokeText(o.text,0,0,1150);ctx.fillStyle=style.fill||'#ffffff';ctx.fillText(o.text,0,0,1150);}else if(o.src){const im=images.get(o.src);if(im)image(o.src,-im.width/2,-im.height/2,im.width,im.height);}ctx.restore();
    });
    ctx.restore();
  }
  return { load, render, images, get lastTime() { return lastTime; }, get duration() { return timeline?.duration_s || 0; } };
}
const hmRoot = typeof globalThis !== 'undefined' ? globalThis : window;
hmRoot.backgroundMotionFrame = backgroundMotionFrame;
hmRoot.backgroundMotionProgress = backgroundMotionProgress;
hmRoot.backgroundMotionSupport = backgroundMotionSupport;
hmRoot.FG_CAM_PRESETS = FG_CAM_PRESETS;
hmRoot.fgCameraFrame = fgCameraFrame;
hmRoot.fgPropPose = fgPropPose;
hmRoot.fgBreakState = fgBreakState;
if (hmRoot.HMComposeClient) {
  hmRoot.HMComposeClient.backgroundMotionFrame = backgroundMotionFrame;
  hmRoot.HMComposeClient.backgroundMotionProgress = backgroundMotionProgress;
  hmRoot.HMComposeClient.backgroundMotionSupport = backgroundMotionSupport;
  hmRoot.HMComposeClient.fgCameraFrame = fgCameraFrame;
  hmRoot.HMComposeClient.fgPropPose = fgPropPose;
  hmRoot.HMComposeClient.fgBreakState = fgBreakState;
  hmRoot.HMComposeClient.FG_CAM_PRESETS = FG_CAM_PRESETS;
}
hmRoot.HMMotion = createMotionRenderer;

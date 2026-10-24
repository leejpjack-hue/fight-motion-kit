/* Shared deterministic renderer: the editor, player, HTML export and video use this same code. */
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
  function drawBackground(l, t) {
    const b=backgroundFor(l);if(!b.src)return;
    const a=timeline.atoms.find(a=>a.id===l.atom),u=a?ease(clamp((t-a.t0)/(a.t1-a.t0),0,1),'smooth'):0;
    const m=b.motion||{},amount=m.amount??.4,extra=amount*.25;
    let s=1,x=0,y=0;
    if(m.preset==='push_in')s=1+extra*u;
    if(m.preset==='pull_out')s=1+extra*(1-u);
    if(m.preset?.startsWith('pan_')){s=1+extra;const v=1-2*u;if(m.preset==='pan_left')x=640*extra*v;if(m.preset==='pan_right')x=-640*extra*v;if(m.preset==='pan_up')y=360*extra*v;if(m.preset==='pan_down')y=-360*extra*v;}
    s*=l.bg_zoom||1;ctx.save();ctx.translate(640+x,360+y);ctx.scale(s,s);ctx.translate(-640,-360);backgroundImage(b.src,b.crop);ctx.restore();
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
window.HMMotion = createMotionRenderer;

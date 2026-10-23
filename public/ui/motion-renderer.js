/* Shared deterministic renderer: the editor, player, HTML export and video use this same code. */
function createMotionRenderer(canvas, assets = {}) {
  const ctx = canvas.getContext('2d');
  const images = new Map(), keyedImages = new Map();
  let timeline, layout;
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
    Object.values(layout).forEach(l => { if (l.full) paths.add(l.full); (l.parts || []).forEach(p => paths.add(p.src)); });
    Object.values(timeline.bg || {}).filter(p => typeof p === 'string').forEach(p => paths.add(p));
    (timeline.overlays || []).forEach(o => { if (o.src) paths.add(o.src); });
    await Promise.all([...paths].map(async path => {
      if (images.has(path)) return;
      const im = new Image(); im.src = url(path);
      try { await im.decode(); } catch (_) { throw new Error('Image could not load: ' + path.slice(0, 120)); }
      images.set(path, im);
    }));
    if(timeline.bg?.key_white)for(const l of Object.values(layout)){if(l.full&&!keyedImages.has(l.full))keyedImages.set(l.full,removeWhiteBackdrop(images.get(l.full)));}
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
  function backgroundImage(path){const im=images.get(path);if(!im)return;const s=Math.max(1280/im.width,720/im.height);ctx.drawImage(im,(1280-im.width*s)/2,(720-im.height*s)/2,im.width*s,im.height*s);}
  function image(path, x, y, w, h, contain = false, flip = false, keyWhite = false) {
    const im = (keyWhite&&keyedImages.get(path)) || images.get(path); if (!im) return;
    if (contain) { const s = Math.min(w / im.width, h / im.height); x += (w - im.width * s) / 2; y += (h - im.height * s) / 2; w = im.width * s; h = im.height * s; }
    ctx.save(); if (flip) {ctx.translate(x + w, y); ctx.scale(-1, 1); x = 0; y = 0;} ctx.drawImage(im, x, y, w, h); ctx.restore();
  }
  function drawScene(l, bgOnly = false) {
    const bg = (timeline.bg || {})[l.bg || 'base']; if (bg && bgOnly) {ctx.save();ctx.translate(640,360);ctx.scale(l.bg_zoom||1,l.bg_zoom||1);ctx.translate(-640,-360);backgroundImage(bg);ctx.restore();}
    if (l.full) image(l.full, 0, 0, 1280, 720, true, false, !!bg && timeline.bg?.key_white);
    else {
      (l.shadows || []).forEach(s => { ctx.fillStyle = '#0b181c22'; ctx.beginPath(); ctx.ellipse(s.cx,s.cy,s.rx,s.ry,0,0,Math.PI*2);ctx.fill(); });
      (l.parts || []).forEach(p => image(p.src, p.x, p.y, p.w, p.h, false, p.flip));
      if (l.slate) {ctx.fillStyle='#1c2b30';ctx.fillRect(0,0,1280,720);ctx.fillStyle='#ccf17b';ctx.font='24px sans-serif';ctx.textAlign='center';ctx.fillText(l.slate,640,360,1100);}
    }
  }
  function render(time, opts = {}) {
    ctx.save(); ctx.setTransform(canvas.width / 1280, 0, 0, canvas.height / 720, 0, 0);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1280, 720);
    if (!timeline || !timeline.plates.length) { ctx.restore(); return; }
    const t = clamp(time, 0, Math.max(0, timeline.duration_s - 1e-7));
    const pIdx = timeline.plates.findIndex(p => t >= p.t0 && t < p.t1);
    const plateIndex = pIdx >= 0 ? pIdx : timeline.plates.length - 1;
    const plate = timeline.plates[plateIndex];
    const l = layout[plate.id]; if (!l) {ctx.restore(); return;}
    const segments = timeline.atoms.flatMap(a => a.cam);
    const seg = segments.find(s => t >= s.t0 && t < s.t1) || segments.at(-1);
    const camera = {x:0,y:0,s:1,r:0};
    if (seg) { const u = seg.u0 + (seg.u1 - seg.u0) * clamp((t - seg.t0) / (seg.t1 - seg.t0), 0, 1); for (const k of 'xysr') if (seg.curves[k]) camera[k] = curve(seg.curves[k], u, t - seg.t0); }
    camera.s = Math.max(camera.s, 1 + Math.abs(Math.sin(camera.r * Math.PI / 180)) * .9);
    const fx = timeline.fx || {};
    let amp = 0;
    (fx.shake || []).forEach(([h, a, d]) => { if (t >= h && t < h + d) amp = Math.max(amp, a * (1 - (t - h) / d)); });
    (fx.hits || []).forEach(([h]) => { if (t >= h && t < h + .28) amp = Math.max(amp, 9 * (1 - (t - h) / .28)); });
    ctx.save(); ctx.translate(640 + camera.x + Math.sin(t * 157) * amp, 360 + camera.y + Math.cos(t * 131) * amp * .6); ctx.rotate(camera.r * Math.PI / 180); ctx.scale(camera.s, camera.s); ctx.translate(-640, -360);
    drawScene(l, true);
    if (opts.onion) {
      const prevPlate = timeline.plates[plateIndex - 1], nextPlate = timeline.plates[plateIndex + 1];
      ctx.save(); ctx.globalAlpha = 0.25;
      if (prevPlate && layout[prevPlate.id]) drawScene(layout[prevPlate.id], false);
      if (nextPlate && layout[nextPlate.id]) drawScene(layout[nextPlate.id], false);
      ctx.restore();
    }
    ctx.restore();
    // Deterministic particles avoid a different random result on every frame/export.
    (fx.dust || []).forEach(([h, k = 1]) => { const d = t - h; if (d < 0 || d > .55) return; ctx.fillStyle = `rgba(120,138,134,${.32 * (1 - d / .55)})`; for (let i=0;i<18;i++){const v=Math.sin(i*17.31);ctx.beginPath();ctx.arc(640+v*(90+d*430)*k,680-Math.abs(Math.cos(i*4.2))*d*110,8+d*25,0,Math.PI*2);ctx.fill();} });
    (fx.hits || []).forEach(([h,col]) => {const d=t-h;if(d<0||d>.2)return;ctx.save();ctx.globalAlpha=(1-d/.2)*.7;ctx.strokeStyle=col;ctx.lineWidth=3;for(let i=0;i<16;i++){const a=i/16*Math.PI*2,r=30+d*500;ctx.beginPath();ctx.moveTo(640+Math.cos(a)*r,300+Math.sin(a)*r);ctx.lineTo(640+Math.cos(a)*(r+40),300+Math.sin(a)*(r+40));ctx.stroke();}ctx.restore();});
    (fx.flash || []).concat(fx.bgflash || []).forEach(([h,col])=>{const d=t-h;if(d>=0&&d<.2){ctx.fillStyle=col;ctx.globalAlpha=.22*(1-d/.2);ctx.fillRect(0,0,1280,720);ctx.globalAlpha=1;}});
    (fx.trails || []).forEach(([h,dir=1])=>{const d=t-h;if(d<0||d>.18)return;ctx.save();ctx.globalAlpha=(1-d/.18)*.7;ctx.strokeStyle='#ffffff';ctx.lineWidth=5;ctx.beginPath();ctx.arc(640-dir*40,310,140,dir>0?Math.PI*1.15:-Math.PI*.15,dir>0?Math.PI*1.65:Math.PI*.35);ctx.stroke();ctx.restore();});
    (fx.speed || []).forEach(([a,b,mode,k0=0,k1=1])=>{if(t<a||t>=b)return;const k=k0+(k1-k0)*(t-a)/(b-a);ctx.save();ctx.strokeStyle='#d2e4df99';ctx.lineWidth=2;for(let i=0;i<46;i++){const angle=i/46*Math.PI*2+t*.1;ctx.beginPath();if(mode==='radial'){ctx.moveTo(640+Math.cos(angle)*(470-k*150),360+Math.sin(angle)*(380-k*110));ctx.lineTo(640+Math.cos(angle)*800,360+Math.sin(angle)*650);}else{const x=(i*177.3)%1280,y=(i*98.1+t*300)%720;ctx.moveTo(x,y);ctx.lineTo(x,y+(mode==='up'?-1:1)*(70+k*70));}ctx.stroke();}ctx.restore();});
    (fx.sparks || []).forEach(([h,n=12,at])=>{const d=t-h;if(d<0||d>.4)return;ctx.save();ctx.globalAlpha=1-d/.4;ctx.strokeStyle='#ffc76d';ctx.lineWidth=2;for(let i=0;i<n;i++){const a=i/n*Math.PI*2;const x=(at?.[0]??640)+Math.cos(a)*d*650,y=(at?.[1]??300)+Math.sin(a)*d*650+d*d*400;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-Math.cos(a)*15,y-Math.sin(a)*15);ctx.stroke();}ctx.restore();});
    if(fx.pink_cut!=null&&t>=fx.pink_cut){ctx.fillStyle='#ff2f9a';ctx.fillRect(0,0,1280,720);}
    (timeline.overlays || []).filter(o => t >= o.t_start && t < o.t_end).sort((a,b)=>(a.z||0)-(b.z||0)).forEach(o=>{
      ctx.save();ctx.globalAlpha=clamp(o.opacity??1,0,1);ctx.translate(o.x??640,o.y??640);ctx.scale(o.scale||1,o.scale||1);
      if(o.kind==='text'||o.text){const style=o.style||{};ctx.font=`${style.italic?'italic ':''}${style.fontWeight||700} ${style.fontSize||38}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.strokeStyle=style.stroke||'#15201c';ctx.lineWidth=style.strokeWidth??6;ctx.strokeText(o.text,0,0,1150);ctx.fillStyle=style.fill||'#ffffff';ctx.fillText(o.text,0,0,1150);}else if(o.src){const im=images.get(o.src);if(im)image(o.src,-im.width/2,-im.height/2,im.width,im.height);}ctx.restore();
    });
    ctx.restore();
  }
  return { load, render, images };
}
window.HMMotion = createMotionRenderer;

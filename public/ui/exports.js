(() => {
  const S = window.HMStudio, { $, on, safe, copy, download } = S;
  let busy = false;
  const report = (text, error = false) => { $('exportStatus').textContent = text; $('exportStatus').classList.toggle('error', error); };
  function dataUrl(blob) {return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});}
  async function embeddedAsset(path, project) {
    if (project.assets?.[path]) return project.assets[path];
    if (path.startsWith('data:image/')) return path;
    const response=await fetch(path.startsWith('/')?path:'/'+path);
    if(!response.ok)throw new Error('Missing image: '+path);
    const blob=await response.blob();if(!blob.type.startsWith('image/'))throw new Error('Not an image: '+path);
    return dataUrl(blob);
  }
  async function portable() {
    const project=S.project; const assets={...(project.assets||{})};
    // Include library images as well as timeline assets so a project is editable offline.
    const paths=new Set(project.media.map(m=>m.src));
    Object.values(project.show.bg||{}).filter(x=>typeof x==='string').forEach(p=>paths.add(p));
    project.show.atoms.forEach(a=>{if(a.background?.src)paths.add(a.background.src);});
    (project.show.fg?.props||[]).forEach(p=>{if(p.src)paths.add(p.src);if(p.effect?.broken_src)paths.add(p.effect.broken_src);});
    const result=project.show.atoms.length?await S.compile():null;
    if(result){Object.values(result.layout).forEach(l=>{if(l.full)paths.add(l.full);if(l.background?.src)paths.add(l.background.src);(l.parts||[]).forEach(p=>paths.add(p.src));});Object.values(result.timeline.bg||{}).filter(x=>typeof x==='string').forEach(p=>paths.add(p));(result.timeline.overlays||[]).forEach(o=>{if(o.src)paths.add(o.src);});(result.timeline.fg?.props||[]).forEach(p=>{if(p.src)paths.add(p.src);if(p.effect?.broken_src)paths.add(p.effect.broken_src);});}
    await Promise.all([...paths].map(async p=>{if(!p.startsWith('data:image/'))assets[p]=await embeddedAsset(p,project);}));
    project.assets=assets;
    return {project,result,assets};
  }
  async function task(fn) {
    if(busy)return;busy=true;document.querySelector('.workspace').inert=true;$('projectTitle').disabled=true;
    ['exportHtml','exportVideo','exportFrame','saveProject','openProject','loadDemo','loadExtended','loadOriginal','newProject','importImages','changeBackground'].forEach(id=>$(id).disabled=true);
    try {await fn();} catch(e){report(e.message,true);throw e;}finally{busy=false;document.querySelector('.workspace').inert=false;$('projectTitle').disabled=false;S.recording=false;S.update();['exportHtml','exportVideo','exportFrame','saveProject','openProject','loadDemo','loadExtended','loadOriginal','newProject','importImages','changeBackground'].forEach(id=>$(id).disabled=false);$('exportVideo').disabled=!videoType()||!HTMLCanvasElement.prototype.captureStream;}
  }
  on('saveProject',()=>task(async()=>{S.pause();report('Packing images and edits…');const {project}=await portable();download(project.show.show_id+'.motion.json',new Blob([JSON.stringify(project)],{type:'application/json'}));report('Project saved with embedded images.');$('saveState').textContent='Project downloaded';}));
  on('openProject',()=>$('projectInput').click());
  $('projectInput').onchange=safe(async e=>{
    const f=e.target.files[0];if(!f)return;
    try{
      const opened=await S.openProject((async()=>{
      if(f.size>100*1024*1024)throw new Error('Project exceeds the 100 MB import limit.');
      const parsed=JSON.parse(await f.text());let p=parsed;
      if(!p.show&&p.show_id){
        // Existing show JSON is supported when its layouts are shipped with this host.
        const layouts={};for(const key of new Set(p.atoms.map(a=>a.hero?.layout_source).filter(Boolean))){if(!/^assets\/[a-zA-Z0-9_./-]+\.json$/.test(key)||key.includes('..'))throw new Error('Open a portable .motion.json project to include local images.');const r=await fetch('/'+key);if(!r.ok)throw new Error('Missing layout; use a portable project JSON.');layouts[key]=await r.json();}
        const media=[];for(const [key,l] of Object.entries(layouts)){const dir=key.slice(0,key.lastIndexOf('/')+1);for(const [id,e] of Object.entries(l)){if(e.full)e.full=e.full.replace(/(plates\/[^/]+)\.png$/,'$1.jpg');for(const part of e.parts||[])part.src=part.src.replace(/(cutout\/[^/]+)\.png$/,'$1.webp');const src=e.full?dir+e.full:dir+e.parts?.[0]?.src;if(src)media.push({id:crypto.randomUUID(),name:id,src,layoutSource:key,plateId:id});}}
        p={version:1,show:p,layouts,media};
      }
      return p;
      })());if(opened)report('Project opened.');
    }finally{e.target.value='';}
  });
  on('exportOpen',()=>{S.pause();report('');$('exportDialog').showModal();});
  on('exportFrame',()=>task(async()=>{await S.compile();const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const renderer=HMMotion(canvas,S.project.assets||{});await renderer.load(S.composed);renderer.render(S.time);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Could not export frame.');download(S.project.show.show_id+'-'+S.time.toFixed(2)+'s.png',blob);report('Current frame downloaded.');}));
  on('exportHtml',()=>task(async()=>{
    report('Embedding images for offline playback…');S.pause();const {project,result,assets}=await portable();if(!result)throw new Error('Add a clip before exporting.');
    const data=JSON.stringify({...result,assets}).replace(/</g,'\\u003c');
    const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HTML Motion</title><style>body{margin:0;background:#101315;color:#edf1e9;font:14px system-ui;min-height:100vh;display:grid;place-content:center}main{width:min(100vw,1280px)}canvas{display:block;width:100%;height:auto;background:white}nav{display:flex;gap:16px;align-items:center;padding:16px}button{background:#ccf17b;border:0;border-radius:6px;padding:9px 18px;cursor:pointer}input{accent-color:#ccf17b;flex:1;min-width:50px}output{font-size:12px;white-space:nowrap}h1{font-size:16px;font-weight:500;padding:0 16px}p{font-size:11px;color:#98a699;padding:0 16px}</style><main><h1 id="title"></h1><canvas id="stage" width="1280" height="720"></canvas><nav><button id="play" disabled>Loading…</button><input id="seek" aria-label="Seek" type="range" min="0" step="0.01" value="0"><output id="time"></output></nav><p>HTML Motion · Plate animation · Plays offline</p></main><script>${backgroundMotionFrame.toString()}\n${backgroundMotionProgress.toString()}\n${fgCameraFrame.toString()}\n${fgPropPose.toString()}\n${fgBreakState.toString()}\nconst FX_FIST_PATH=${JSON.stringify(globalThis.FX_FIST_PATH)};\nconst FX_LEG_PATH=${JSON.stringify(globalThis.FX_LEG_PATH)};\nconst FX_TORNADO_PATH=${JSON.stringify(globalThis.FX_TORNADO_PATH)};\n${fxPointOnPath.toString()}\n${fxPlacementOf.toString()}\n${transformFxPath.toString()}\n${exposureWarmCrushPixels.toString()}\n${drawFistPressure.toString()}\n${drawLegArc.toString()}\n${drawTornado.toString()}\n${collectProceduralOverlays.toString()}\n${createMotionRenderer.toString()}\nconst DATA=${data};\n(${standalonePlayer.toString()})(DATA);<\/script></html>`;
    download(project.show.show_id+'.html',new Blob([html],{type:'text/html'}));report('Playable HTML downloaded. All images are embedded.');
  }));
  function standalonePlayer(data) {
    const get=id=>document.getElementById(id);const r=createMotionRenderer(get('stage'),data.assets);let t=0,playing=false,start=0,offset=0;
    const duration=data.timeline.duration_s;get('seek').max=duration;get('title').textContent=data.timeline.title;document.title=data.timeline.title;
    function draw(){r.render(t);get('seek').value=t;get('time').textContent=t.toFixed(2)+' / '+duration.toFixed(2)+'s';get('play').textContent=playing?'Pause':'Play';}
    function tick(now){if(!playing)return;t=Math.min(duration,offset+(now-start)/1000);if(t>=duration)playing=false;draw();if(playing)requestAnimationFrame(tick);}
    function toggle(){if(playing)playing=false;else{if(t>=duration)t=0;offset=t;start=performance.now();playing=true;requestAnimationFrame(tick);}draw();}
    get('play').onclick=toggle;get('seek').oninput=()=>{playing=false;t=+get('seek').value;draw();};document.addEventListener('keydown',e=>{if(e.code==='Space'&&e.target.tagName!=='INPUT'){e.preventDefault();toggle();}});
    window.ready=r.load(data).then(()=>{get('play').disabled=false;draw();});window.renderAt=value=>{playing=false;t=Math.max(0,Math.min(duration,value));draw();};
    window.ready.catch(e=>{get('title').textContent='Unable to load: '+e.message;});
  }
  function videoType() {return ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/mp4','video/webm'].find(t=>window.MediaRecorder&&MediaRecorder.isTypeSupported(t));}
  const mime=videoType();if(!mime||!HTMLCanvasElement.prototype.captureStream){$('exportVideo').disabled=true;$('videoHint').textContent='Video recording unavailable in this browser. Use playable HTML.';}else $('videoHint').textContent=(mime.includes('mp4')?'MP4':'WebM')+' · 1280 × 720 · records in real time';
  on('exportVideo',()=>task(async()=>{
    if(!mime)throw new Error('This browser cannot record canvas video. Export playable HTML instead.');
    S.pause();await S.compile();S.recording=true;
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
    const r=HMMotion(canvas,S.project.assets||{});await r.load(S.composed);r.render(0);
    const stream=canvas.captureStream(30);const chunks=[];const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6000000});
    const done=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=resolve;recorder.onerror=e=>reject(e.error||new Error('Video recorder failed'));});
    let visibilityChanged=false;const interrupted=()=>{if(document.hidden)visibilityChanged=true;};document.addEventListener('visibilitychange',interrupted);
    try{
      recorder.start();const start=performance.now(),duration=S.duration;
      await new Promise(resolve=>{const frame=now=>{const t=Math.min(duration,(now-start)/1000);r.render(t);report(`Recording ${t.toFixed(1)} / ${duration.toFixed(1)}s · Keep this tab visible`);if(t>=duration||visibilityChanged)resolve();else requestAnimationFrame(frame);};requestAnimationFrame(frame);});
      recorder.stop();await done;if(visibilityChanged)throw new Error('Recording interrupted because the tab was hidden. Keep this tab visible and retry.');
      download(S.project.show.show_id+(mime.includes('mp4')?'.mp4':'.webm'),new Blob(chunks,{type:mime}));report('Video downloaded.');
    }finally{document.removeEventListener('visibilitychange',interrupted);if(recorder.state!=='inactive')recorder.stop();stream.getTracks().forEach(t=>t.stop());}
  }));
})();

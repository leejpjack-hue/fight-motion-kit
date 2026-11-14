(() => {
  const S = window.HMStudio, { $, on, safe, copy, download } = S;
  let busy = false;
  const report = (text, error = false) => { $('exportStatus').textContent = text; $('exportStatus').classList.toggle('error', error); };
  const exportChecklist = () => HMComposeClient.parityDirtyChecklist(S.project);
  function checklistBlockMessage(list) {
    if (!list?.active || !list.blocks?.length) return '';
    return 'Checklist blocked export · ' + list.blocks.map(row => row.text).join(' · ');
  }
  function applyExportGate() {
    const list = exportChecklist();
    const timing = HMComposeClient.rhythmTiming(S.project?.show);
    const timingError = !timing.durations_valid || !timing.target_valid;
    const blocked = !!checklistBlockMessage(list) || timingError;
    if (timingError) report('Rhythm validation failed: fix missing durations or an invalid target before bake.', true);
    const warn = !blocked && list?.active && list.warns?.length ? 'Checklist warning · ' + list.warns.map(row => row.text).join(' · ') : '';
    if (blocked && !timingError) report(checklistBlockMessage(list), true);
    else if (warn) report(warn, false);
    if ($('exportHtml')) $('exportHtml').disabled = blocked;
    if ($('exportFrame')) $('exportFrame').disabled = blocked;
    if ($('exportFrames')) $('exportFrames').disabled = blocked;
    if ($('exportTiming')) $('exportTiming').disabled = blocked;
    if ($('exportVideo')) $('exportVideo').disabled = blocked || !recorderChoice() || !HTMLCanvasElement.prototype.captureStream;
    return !blocked;
  }
  function assertExportAllowed() {
    const timing = HMComposeClient.rhythmTiming(S.project?.show);
    if (!timing.durations_valid || !timing.target_valid) throw new Error('Rhythm validation failed: fix missing durations or an invalid target before bake.');
    const message = checklistBlockMessage(exportChecklist());
    if (message) throw new Error(message);
  }
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
    backgroundImageRefs(project.show.bg).forEach(p=>paths.add(p));
    project.show.atoms.forEach(a=>{if(a.background?.src)paths.add(a.background.src);});
    (project.show.fg?.props||[]).forEach(p=>{if(p.src)paths.add(p.src);if(p.effect?.broken_src)paths.add(p.effect.broken_src);});
    const result=project.show.atoms.length?await S.compile():null;
    if(result){Object.values(result.layout).forEach(l=>{if(l.full)paths.add(l.full);if(l.background?.src)paths.add(l.background.src);(l.parts||[]).forEach(p=>paths.add(p.src));});backgroundImageRefs(result.timeline.bg).forEach(p=>paths.add(p));(result.timeline.overlays||[]).forEach(o=>{if(o.src)paths.add(o.src);});(result.timeline.fg?.props||[]).forEach(p=>{if(p.src)paths.add(p.src);if(p.effect?.broken_src)paths.add(p.effect.broken_src);});}
    await Promise.all([...paths].map(async p=>{if(!p.startsWith('data:image/'))assets[p]=await embeddedAsset(p,project);}));
    project.assets=assets;
    return {project,result,assets};
  }
  const exportIds = ['exportHtml','exportVideo','exportFrames','exportFrame','exportTiming','saveProject','openProject','loadDemo','loadExtended','loadOriginal','loadStreet','loadCostumeLock','loadPoseRefPack','newProject','importImages','changeBackground'];
  async function task(fn) {
    if(busy)return;busy=true;document.querySelector('.workspace').inert=true;$('projectTitle').disabled=true;$('exportPreset').disabled=true;
    exportIds.forEach(id=>{if($(id))$(id).disabled=true;});
    try {await fn();} catch(e){report(e.message,true);throw e;}finally{busy=false;document.querySelector('.workspace').inert=false;$('projectTitle').disabled=false;$('exportPreset').disabled=false;S.recording=false;S.update();['saveProject','openProject','loadDemo','loadExtended','loadOriginal','loadStreet','loadCostumeLock','loadPoseRefPack','newProject','importImages','changeBackground'].forEach(id=>{if($(id))$(id).disabled=false;});applyExportGate();}
  }
  on('saveProject',()=>task(async()=>{S.pause();report('Packing images and edits…');const {project}=await portable();const body=window.HMMotionSot?HMMotionSot.serialize(project):JSON.stringify(project);download(project.show.show_id+'.motion.json',new Blob([body],{type:'application/json'}));try{if(window.HMMotionSot)HMMotionSot.writeDraft(localStorage,project,S.time);}catch(e){}try{if(window.HMTimelineJson)HMTimelineJson.writeSave(localStorage,project.show);}catch(e){}report('Project saved with embedded images.');$('saveState').textContent='Project downloaded';if(typeof S.renderTimelineJsonPanel==='function')S.renderTimelineJsonPanel();}));
  on('openProject',()=>$('projectInput').click());
  $('projectInput').onchange=safe(async e=>{
    const files=[...(e.target.files||[])];if(!files.length)return;
    const skippedFiles=[],localFiles={};let jsonName='',parsed=null,candidateProject=null,fetchedHostShow=false,isLockPack=false;
    try{
      const destination=S.destinationToken();
      const next=await (async()=>{
      const jsonFile=files.find(file=>/\.json$/i.test(file.name||'')||file.type==='application/json')||files[0];
      jsonName=jsonFile.name||'project.json';
      if(jsonFile.size>100*1024*1024)throw new Error('Project exceeds the 100 MB import limit.');
      for(const imgFile of files){
        if(imgFile===jsonFile)continue;
        if(!['image/png','image/jpeg','image/webp'].includes(imgFile.type)&&!/\.(png|jpe?g|webp)$/i.test(imgFile.name||'')){if(imgFile.name)skippedFiles.push(imgFile.name);continue;}
        if(imgFile.size>20*1024*1024)throw new Error(imgFile.name+' is larger than 20 MB.');
        if(Object.hasOwn(localFiles,imgFile.name))throw new Error('Duplicate image filename: '+imgFile.name+'. Use distinct filenames for sheets and locked references.');
        localFiles[imgFile.name]=await dataUrl(imgFile);
      }
      parsed=JSON.parse(await jsonFile.text());
      isLockPack=Boolean(window.HMComposeClient?.isCostumeLockPackInput?.(parsed));
      const review=isLockPack?await HMCostumeDrift.review(parsed,localFiles):null;
      let p=(window.HMMotionSot&&HMMotionSot.asPortableProject(parsed,{localFiles}))||(window.HMComposeClient&&HMComposeClient.isCostumeLockPackInput?.(parsed)?HMComposeClient.normalizeCostumeLockPack(parsed,{localFiles}):parsed);
      if(review)HMCostumeDrift.attach(p,review.plan,review.report);
      if(!p.show&&p.show_id){
        // Existing show JSON is supported when its layouts are shipped with this host.
        const layouts={};for(const key of new Set(p.atoms.map(a=>a.hero?.layout_source).filter(Boolean))){if(!/^assets\/[a-zA-Z0-9_./-]+\.json$/.test(key)||key.includes('..'))throw new Error('Open a portable .motion.json project to include local images.');const r=await fetch('/'+key);if(!r.ok)throw new Error('Missing layout; use a portable project JSON.');layouts[key]=await r.json();}
        fetchedHostShow=true;
        const media=[];for(const [key,l] of Object.entries(layouts)){const dir=key.slice(0,key.lastIndexOf('/')+1);for(const [id,e] of Object.entries(l)){if(e.full)e.full=e.full.replace(/(plates\/[^/]+)\.png$/,'$1.jpg');for(const part of e.parts||[])part.src=part.src.replace(/(cutout\/[^/]+)\.png$/,'$1.webp');const src=e.full?dir+e.full:dir+e.parts?.[0]?.src;if(src)media.push({id:crypto.randomUUID(),name:id,src,layoutSource:key,plateId:id});}}
        p={version:1,show:p,layouts,media};
      }
      return p;
      })();
      candidateProject=next;
      const current=S.destinationToken();
      if(current.revision!==destination.revision||current.request!==destination.request)throw new Error('The open project changed during import review. Select the pack again.');
      const opened=await S.openProject(Promise.resolve(next));
      if(opened){
        report('Project opened.');
        if(window.HMImportReceipt){
          const audit=HMImportReceipt.auditProjectAssets(next,{localFiles,fetchedHostShow});
          const composeErrs=Array.isArray(S.composed?.errors)?S.composed.errors:[];
          const missing=[...audit.missingRefs,...skippedFiles.map(n=>n+' (unsupported file skipped)'),...composeErrs];
          HMImportReceipt.record({action:isLockPack?'Costume lock pack':'Open project',source:next.show?.show_id||jsonName,status:missing.length?(audit.imagesLoaded||audit.clipsLoaded?'partial':'error'):'ok',filesLanded:[jsonName,...Object.keys(localFiles)],clipsLoaded:audit.clipsLoaded,imagesLoaded:audit.imagesLoaded,missing,replaceProject:true,undoable:false});
        }
      }
    }catch(err){
      if(window.HMImportReceipt){
        const activeId=S.project?.show?.show_id,candId=candidateProject?.show?.show_id;
        if(candidateProject&&activeId&&candId&&activeId===candId){
          const audit=HMImportReceipt.auditProjectAssets(candidateProject,{localFiles,fetchedHostShow});
          const missing=[...audit.missingRefs,...skippedFiles.map(n=>n+' (unsupported file skipped)'),err.message];
          HMImportReceipt.record({action:isLockPack?'Costume lock pack':'Open project',source:candId||jsonName,status:'partial',filesLanded:[jsonName,...Object.keys(localFiles)],clipsLoaded:audit.clipsLoaded,imagesLoaded:audit.imagesLoaded,missing,warnings:['Opened partially with unresolved images kept missing (0 stand-in art).'],replaceProject:true,undoable:false});
        }else{
          const refAudit=parsed?HMImportReceipt.missingFromParsedInput(parsed,localFiles):{missing:[]};
          HMImportReceipt.record({action:isLockPack?'Costume lock pack':'Open project',source:jsonName||files.map(f=>f.name).join(', ')||'Project file',status:'error',filesLanded:[],clipsLoaded:0,imagesLoaded:0,missing:[err.message,...refAudit.missing,...skippedFiles.map(n=>n+' (unsupported file skipped)')],warnings:['Import failed; existing project kept without stand-in art.'],replaceProject:false,undoable:false});
        }
      }
      throw err;
    }finally{e.target.value='';}
  });
  function selectedPreset() {return HMXExport.presetById($('exportPreset').value)||HMXExport.presets[0];}
  function paintExportHints() {
    const preset=selectedPreset();
    $('exportBitrateHint').textContent=HMXExport.bitrateHint(preset);
    $('exportHonesty').textContent=HMXExport.HONESTY;
    let seq='Optional zip at '+preset.label+'. The local skill runs ffmpeg.';
    if(S.duration>0){try{seq='Optional zip at '+preset.label+' · '+HMXExport.framePlan(S.duration,preset.fps).length+' frames. The local skill runs ffmpeg.';}catch(e){seq='Optional zip at '+preset.label+'. '+e.message;}}
    $('frameSeqHint').textContent=seq;
    const choice=recorderChoice();
    paintExportMatrix();
    if(!choice||!HTMLCanvasElement.prototype.captureStream)$('videoHint').textContent='Video recording unavailable in this browser. Use playable HTML or the frame-sequence zip.';
    else {
      const kind=choice.ext==='mp4'?'MP4 · this browser only · MP4 is not universal':choice.label;
      $('videoHint').textContent=kind+' · '+preset.label+' · '+preset.width+'×'+preset.height+' · '+preset.fps+' fps · '+HMXExport.formatMbps(preset.videoBitsPerSecond)+' · records in real time · keep this tab visible';
    }
  }
  function exportCaps(){
    return HMExportMatrix.browserCaps({
      captureStream:!!(HTMLCanvasElement.prototype&&HTMLCanvasElement.prototype.captureStream),
      isTypeSupported:mime=>!!(window.MediaRecorder&&typeof MediaRecorder.isTypeSupported==='function'&&MediaRecorder.isTypeSupported(mime))
    });
  }
  function paintExportMatrix(){
    const body=$('exportMatrixBody');
    if(!body||!window.HMExportMatrix)return;
    const matrix=HMExportMatrix.matrix(exportCaps());
    const table=$('exportMatrix');
    if(table){table.dataset.universalMp4='false';table.dataset.universalAlpha='false';}
    body.replaceChildren();
    matrix.rows.forEach(row=>{
      const tr=document.createElement('tr');
      tr.dataset.exportRow=row.id;
      tr.dataset.offered=String(row.offered);
      tr.dataset.scope=row.scope;
      tr.dataset.alpha=row.alpha;
      const name=document.createElement('th');
      name.scope='row';
      name.textContent=row.label;
      const detail=document.createElement('small');
      detail.textContent=row.note;
      name.append(detail);
      const here=document.createElement('td');
      here.textContent=row.here;
      const alpha=document.createElement('td');
      alpha.textContent=row.alphaLabel;
      tr.append(name,here,alpha);
      body.append(tr);
    });
    if($('exportMatrixNote'))$('exportMatrixNote').textContent=matrix.summary;
  }
  $('exportPreset').addEventListener('change',()=>{paintExportHints();applyExportGate();});
  const stripImages=new Map();
  let stripPaintToken=0;
  function loadStripImage(src){
    if(stripImages.has(src))return stripImages.get(src);
    const pending=new Promise((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>resolve(image);
      image.onerror=()=>reject(new Error('Could not read the pending strip.'));
      image.src=src;
    });
    stripImages.set(src,pending);
    return pending;
  }
  function paintBakeQaPeek(snapshot){
    const box=$('bakeQaPeeks');
    if(!box)return;
    box.replaceChildren();
    const active=snapshot.peek;
    const atomIndex=active?active.atom_index:0;
    const pair=(snapshot.peeks||[]).filter(peek=>peek.atom_index===atomIndex);
    for(const peek of pair){
      const button=document.createElement('button');
      button.type='button';
      button.className='bake-qa-peek';
      button.dataset.peekIndex=String(peek.index);
      button.dataset.sampleKind=peek.sample_kind;
      const tag=peek.sample_kind==='mid'?'mid +0.0s':(peek.clamped?'+0.3s end':'+0.3s');
      button.textContent=`${peek.source_plate} · ${tag} · ${peek.t_nominal.toFixed(2)}s`;
      button.title=`Seek to ${peek.source_plate} at ${peek.t_nominal.toFixed(2)}s`;
      button.setAttribute('aria-pressed',String(!!(active&&active.index===peek.index)));
      box.append(button);
    }
    if($('bakeQaPeekLabel')){
      if(!active)$('bakeQaPeekLabel').textContent=snapshot.atom_count?'':'Add a clip to peek plates.';
      else{
        const tag=active.sample_kind==='mid'?'mid +0.0s':(active.clamped?'+0.3s end':'+0.3s');
        $('bakeQaPeekLabel').textContent=`${String(active.atom_index+1).padStart(2,'0')} ${active.source_plate} · ${tag} · ${active.t_nominal.toFixed(2)}s`;
      }
    }
    if($('bakeQaPlate'))$('bakeQaPlate').textContent=snapshot.pose_ref?'Plate show · pose pack':snapshot.plate_show?'Plate show':snapshot.atom_count?'Clip show':'No clips';
  }
  async function paintBakeQaStrips(snapshot){
    const host=$('bakeQaStrips');
    if(!host)return;
    const token=++stripPaintToken;
    host.hidden=!snapshot.strips.length;
    host.replaceChildren();
    const assets=S.project?.assets||{};
    for(const strip of snapshot.strips){
      const row=document.createElement('div');
      row.className='bake-qa-strip';
      row.dataset.stripId=strip.id;
      row.dataset.cellIndex=String(strip.index);
      const canvas=document.createElement('canvas');
      canvas.width=160;canvas.height=90;canvas.className='bake-qa-strip-canvas';
      canvas.setAttribute('aria-label','Imported strip cell peek');
      const label=document.createElement('output');
      label.className='bake-qa-strip-label';
      label.textContent=`${strip.name} · cell ${strip.index+1}/${strip.frames} · ${strip.t.toFixed(2)}s · NOT PLAYABLE`;
      row.append(canvas,label);
      host.append(row);
      const data=assets[strip.src];
      if(typeof data!=='string'||!data.startsWith('data:image/png'))continue;
      try{
        const image=await loadStripImage(data);
        if(token!==stripPaintToken)return;
        const g=canvas.getContext('2d');
        g.imageSmoothingEnabled=false;
        g.fillStyle='#101315';
        g.fillRect(0,0,160,90);
        g.drawImage(image,strip.index*strip.w,0,strip.w,strip.h,0,0,160,90);
      }catch(e){}
    }
  }
  function paintBakeQa(){
    if(!window.HMComposeClient||typeof HMComposeClient.bakeQaSnapshot!=='function')return;
    const snapshot=HMComposeClient.bakeQaSnapshot(S.project,S.composed,S.time);
    const span=Math.max(snapshot.duration_s,S.duration||0);
    const scrub=$('bakeQaScrub');
    if(scrub){scrub.max=String(span||1);scrub.value=String(S.time);}
    if($('bakeQaTime'))$('bakeQaTime').textContent=`${S.time.toFixed(2)}s / ${(span||0).toFixed(2)}s`;
    if($('bakeQaClock'))$('bakeQaClock').textContent='Shared clock · renderAt';
    const stage=$('stage'),preview=$('bakeQaStage');
    if(stage&&preview){
      const g=preview.getContext('2d');
      g.clearRect(0,0,preview.width,preview.height);
      g.drawImage(stage,0,0,preview.width,preview.height);
    }
    paintBakeQaPeek(snapshot);
    void paintBakeQaStrips(snapshot);
    return snapshot;
  }
  function stepBakeAtom(dir){
    const plan=S.framePeekPlan;
    if(!plan?.peeks?.length)return;
    const snapshot=HMComposeClient.bakeQaSnapshot(S.project,S.composed,S.time);
    const current=snapshot.peek?snapshot.peek.atom_index:0;
    const next=Math.min(plan.atom_count-1,Math.max(0,current+dir));
    const mid=plan.peeks.find(peek=>peek.atom_index===next&&peek.sample_kind==='mid');
    if(mid)S.seekToPeek(mid.index);
    paintBakeQa();
  }
  function openBakeQa(){
    S.pause();report('');paintExportHints();applyExportGate();
    $('exportDialog').showModal();
    paintBakeQa();
    $('bakeQaDock')?.scrollIntoView({block:'nearest'});
    $('bakeQaScrub')?.focus();
  }
  $('bakeQaScrub')?.addEventListener('input',()=>{
    S.renderAt(+$('bakeQaScrub').value,{source:'bake-qa-dock'});
    paintBakeQa();
  });
  $('bakeQaPeeks')?.addEventListener('click',event=>{
    const button=event.target.closest('[data-peek-index]');
    if(!button)return;
    S.seekToPeek(+button.dataset.peekIndex);
    paintBakeQa();
  });
  on('bakeQaPrev',()=>stepBakeAtom(-1));
  on('bakeQaNext',()=>stepBakeAtom(1));
  on('bakeQaShowStrip',()=>{
    $('exportDialog').close();
    $('framePeekStrip')?.scrollIntoView({block:'nearest'});
    S.status('Frame peek strip · same plan as bake QA');
  });
  on('exportOpen',openBakeQa);
  on('openBakeQa',openBakeQa);
  on('exportFrame',()=>task(async()=>{assertExportAllowed();await S.compile();const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const renderer=HMMotion(canvas,S.project.assets||{});await renderer.load(S.composed);S.sampleStageFrameAt(S.time,{renderer,standIn:false,onion:false,source:'bake-export-frame'});const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Could not export frame.');download(S.project.show.show_id+'-'+S.time.toFixed(2)+'s.png',blob);report('Current frame downloaded.');}));
  on('exportTiming',()=>task(async()=>{
    assertExportAllowed();
    S.pause();await S.compile();
    if(!S.composed||S.composed.ok===false)throw new Error('Compose this edit before exporting a timing pack.');
    const presets=S.timingPacks;
    if(!presets?.packs?.length)throw new Error('Timing packs are not loaded.');
    const dump=HMComposeClient.timingExport(presets,S.composed,24);
    download(S.project.show.show_id+'-timing.json',new Blob([JSON.stringify(dump)],{type:'application/json'}));
    report('Timing presets and frame sequence downloaded.');
  }));
  async function pixelfxExportBundle(project) {
    const atoms = project && project.show && project.show.atoms || [];
    const used = atoms.some(a => (a.fx_hooks || []).some(h => {
      const type = typeof h === 'string' ? h : h && h.type;
      return (h && h.source === 'pixelfx') || (globalThis.HMPixelFx && typeof HMPixelFx.has === 'function' && HMPixelFx.has(type));
    }));
    if (!used) return '';
    const res = await fetch('/vendor/pixelfx/wave1.global.js');
    if (!res.ok) return '';
    return res.text();
  }
  on('exportHtml',()=>task(async()=>{
    assertExportAllowed();
    report('Embedding images for offline playback…');S.pause();const {project,result,assets}=await portable();if(!result)throw new Error('Add a clip before exporting.');
    const data=JSON.stringify({...result,assets}).replace(/</g,'\\u003c');
    const pxBundle=await pixelfxExportBundle(project);
    const pxScript=pxBundle?`<script>${pxBundle.replace(/<\/script/gi,'<\\/script')}<\/script>`:'';
    const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HTML Motion</title><style>body{margin:0;background:#101315;color:#edf1e9;font:14px system-ui;min-height:100vh;display:grid;place-content:center}main{width:min(100vw,1280px)}canvas{display:block;width:100%;height:auto;background:white}nav{display:flex;gap:16px;align-items:center;padding:16px}button{background:#ccf17b;border:0;border-radius:6px;padding:9px 18px;cursor:pointer}input{accent-color:#ccf17b;flex:1;min-width:50px}output{font-size:12px;white-space:nowrap}h1{font-size:16px;font-weight:500;padding:0 16px}p{font-size:11px;color:#98a699;padding:0 16px}#pixelfxHonesty{margin:0 16px 12px;padding:8px 10px;background:#2f1c0fee;border:1px solid #ff9e44;color:#ffe4bf;font:600 12px/1.4 ui-monospace,monospace}</style><main><h1 id="title"></h1><canvas id="stage" width="1280" height="720"></canvas><p id="pixelfxHonesty" hidden></p><nav><button id="play" disabled>Loading…</button><input id="seek" aria-label="Seek" type="range" min="0" step="0.01" value="0"><output id="time"></output></nav><p>HTML Motion · Plate animation · Plays offline</p><p id="layers"></p></main>${pxScript}<script>${backgroundMotionFrame.toString()}\n${backgroundMotionProgress.toString()}\n${fgCameraFrame.toString()}\n${fgPropPose.toString()}\n${fgBrokenCutoutSrc.toString()}\n${fgBreakState.toString()}\nconst FX_FIST_PATH=${JSON.stringify(globalThis.FX_FIST_PATH)};\nconst FX_LEG_PATH=${JSON.stringify(globalThis.FX_LEG_PATH)};\nconst FX_TORNADO_PATH=${JSON.stringify(globalThis.FX_TORNADO_PATH)};\n${fxPathOrStock.toString()}\n${fxPointOnPath.toString()}\n${fxPlacementOf.toString()}\n${transformFxPath.toString()}\n${exposureWarmCrushPixels.toString()}\n${drawFistPressure.toString()}\n${drawLegArc.toString()}\n${drawTornado.toString()}\n${collectProceduralOverlays.toString()}\n${cameraEase.toString()}\n${cameraChannel.toString()}\n${cameraPoseOnSegment.toString()}\n${cutTransitionsBundle.toString()}\ncutTransitionsBundle();\n${backgroundLocationsBundle.toString()}\nbackgroundLocationsBundle();\n${layerCamMatrix.toString()}\n${layerCamsIndependent.toString()}\n${layerCamMatrixText.toString()}\n${createMotionRenderer.toString()}\n${typeof createHMTeachingFilm==='function'?createHMTeachingFilm.toString()+'\nconst HMTeachingFilm=createHMTeachingFilm();\n':''}const DATA=${data};\n(${standalonePlayer.toString()})(DATA);<\/script></html>`;
    download(project.show.show_id+'.html',new Blob([html],{type:'text/html'}));report('Playable HTML downloaded. All images are embedded.');
  }));
  function standalonePlayer(data) {
    const get=id=>document.getElementById(id);const r=createMotionRenderer(get('stage'),data.assets);let t=0,playing=false,start=0,offset=0;
    const duration=data.timeline.duration_s;get('seek').max=duration;get('title').textContent=data.timeline.title;document.title=data.timeline.title;
    const updateHud=typeof HMTeachingFilm!=='undefined'&&HMTeachingFilm.mountTeachingHud(get('stage').parentElement,data,value=>{playing=false;t=Math.max(0,Math.min(duration,value));draw();})||null;
    function draw(){r.render(t,{viaSoT:true,source:'standalone-player'});get('seek').value=t;get('time').textContent=t.toFixed(2)+' / '+duration.toFixed(2)+'s';get('play').textContent=playing?'Pause':'Play';if(updateHud)updateHud(t);const layers=get('layers');if(layers){const row=r.lastLayerMatrix;layers.dataset.state=row&&layerCamsIndependent(row)?'independent':'idle';layers.textContent=layerCamMatrixText(row);}}
    function tick(now){if(!playing)return;t=Math.min(duration,offset+(now-start)/1000);if(t>=duration)playing=false;draw();if(playing)requestAnimationFrame(tick);}
    function toggle(){if(playing)playing=false;else{if(t>=duration)t=0;offset=t;start=performance.now();playing=true;requestAnimationFrame(tick);}draw();}
    get('play').onclick=toggle;get('seek').oninput=()=>{playing=false;t=+get('seek').value;draw();};document.addEventListener('keydown',e=>{if(e.code==='Space'&&e.target.tagName!=='INPUT'){e.preventDefault();toggle();}});
    window.ready=r.load(data).then(()=>{get('play').disabled=false;draw();});window.renderAt=value=>{playing=false;t=Math.max(0,Math.min(duration,value));draw();};
    window.ready.catch(e=>{get('title').textContent='Unable to load: '+e.message;});
  }
  function recorderChoice(){if(!window.MediaRecorder||typeof MediaRecorder.isTypeSupported!=='function')return null;return HMXExport.pickRecorderMime(type=>MediaRecorder.isTypeSupported(type));}
  paintExportHints();if(!recorderChoice()||!HTMLCanvasElement.prototype.captureStream)$('exportVideo').disabled=true;
  on('exportFrames',()=>task(async()=>{
    assertExportAllowed();
    S.pause();await S.compile();if(!S.composed)throw new Error('Add a clip before exporting a frame sequence.');
    const preset=selectedPreset();const duration=S.duration;const plan=HMXExport.framePlan(duration,preset.fps);
    const canvas=document.createElement('canvas');canvas.width=preset.width;canvas.height=preset.height;
    const r=HMMotion(canvas,S.project.assets||{});await r.load(S.composed);
    const files=[];
    for(let i=0;i<plan.length;i++){
      S.sampleStageFrameAt(plan[i].t,{renderer:r,standIn:false,onion:false,source:'bake-export-frames'});
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw new Error('Could not export frame '+(i+1)+'.');
      files.push({name:plan[i].file,data:new Uint8Array(await blob.arrayBuffer())});
      report('Frame '+(i+1)+' / '+plan.length+' · '+preset.label);
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    const timing=HMXExport.timingDocument({showId:S.project.show.show_id,preset,durationS:duration,frames:plan});
    files.unshift({name:'timing.json',data:new TextEncoder().encode(JSON.stringify(timing,null,2)+'\n')});
    const zip=HMXExport.zipStore(files);
    download(S.project.show.show_id+'-'+preset.id+'-frames.zip',new Blob([zip],{type:'application/zip'}));
    report('Frame sequence downloaded. Run ffmpeg on the local skill — this tab does not encode it.');
  }));
  on('exportVideo',()=>task(async()=>{
    const choice=recorderChoice();
    if(!choice)throw new Error('This browser cannot record canvas video. Export playable HTML or a frame sequence instead.');
    if(document.hidden)throw new Error('Recording needs this tab visible. Keep this tab visible and retry.');
    assertExportAllowed();
    S.pause();await S.compile();S.recording=true;const preset=selectedPreset();
    const canvas=document.createElement('canvas');canvas.width=preset.width;canvas.height=preset.height;
    const r=HMMotion(canvas,S.project.assets||{});await r.load(S.composed);S.sampleStageFrameAt(0,{renderer:r,standIn:false,onion:false,source:'bake-record-video'});
    const stream=canvas.captureStream(preset.fps);const chunks=[];const recorder=new MediaRecorder(stream,{mimeType:choice.mime,videoBitsPerSecond:preset.videoBitsPerSecond});
    const done=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=resolve;recorder.onerror=e=>reject(e.error||new Error('Video recorder failed'));});
    let visibilityChanged=false;const interrupted=()=>{if(document.hidden)visibilityChanged=true;};document.addEventListener('visibilitychange',interrupted);
    try{
      recorder.start();const start=performance.now(),duration=S.duration;
      await new Promise(resolve=>{const frame=now=>{const t=Math.min(duration,(now-start)/1000);S.sampleStageFrameAt(t,{renderer:r,standIn:false,onion:false,source:'bake-record-video'});report(`Recording ${t.toFixed(1)} / ${duration.toFixed(1)}s · Keep this tab visible`);if(t>=duration||visibilityChanged)resolve();else requestAnimationFrame(frame);};requestAnimationFrame(frame);});
      recorder.stop();await done;if(visibilityChanged)throw new Error('Recording interrupted because the tab was hidden. Keep this tab visible and retry.');
      download(S.project.show.show_id+'.'+choice.ext,new Blob(chunks,{type:choice.mime}));report('Video downloaded.');
    }finally{document.removeEventListener('visibilitychange',interrupted);if(recorder.state!=='inactive')recorder.stop();stream.getTracks().forEach(t=>t.stop());}
  }));
})();

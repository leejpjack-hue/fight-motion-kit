(() => {
  const S = window.HMStudio, { $, on, safe, copy, download } = S;
  let busy = false;
  let activeCancel = null;
  const report = (text, error = false, warn = false) => {
    const el = $('exportStatus');
    el.textContent = text;
    el.classList.toggle('error', error);
    el.classList.toggle('cadence-warning', Boolean(warn && !error));
  };
  function setProgress(fraction, text, showCancel = true) {
    const wrap = $('exportProgressWrap'), bar = $('exportProgress'), out = $('exportProgressText'), btn = $('cancelExport');
    if (bar) bar.value = Math.max(0, Math.min(1, Number(fraction) || 0));
    if (out) out.textContent = text || '';
    if (btn) { btn.hidden = !showCancel; btn.disabled = !showCancel; }
    if (wrap) wrap.hidden = false;
  }
  function clearProgress() {
    const wrap = $('exportProgressWrap'), bar = $('exportProgress'), out = $('exportProgressText'), btn = $('cancelExport');
    if (wrap) wrap.hidden = true;
    if (bar) bar.value = 0;
    if (out) out.textContent = '';
    if (btn) { btn.hidden = true; btn.disabled = true; }
  }
  const exportChecklist = () => HMComposeClient.parityDirtyChecklist(S.project);
  function checklistBlockMessage(list) {
    if (!list?.active || !list.blocks?.length) return '';
    return 'Checklist blocked export · ' + list.blocks.map(row => row.text).join(' · ');
  }
  function applyExportGate() {
    const proj = S.project;
    const emptyShow = !(proj?.show?.atoms?.length);
    const list = emptyShow ? null : HMComposeClient.parityDirtyChecklist(proj);
    const timing = emptyShow ? { durations_valid: true, target_valid: true } : HMComposeClient.rhythmTiming(proj?.show);
    const timingError = !emptyShow && (!timing.durations_valid || !timing.target_valid);
    const blocked = emptyShow || !!checklistBlockMessage(list) || timingError;
    if (emptyShow) report('Open an AI motion HTML or add a clip to export video.', false);
    else if (timingError) report('Rhythm validation failed: fix missing durations or an invalid target before bake.', true);
    const warn = !blocked && list?.active && list.warns?.length ? 'Checklist warning · ' + list.warns.map(row => row.text).join(' · ') : '';
    if (blocked && !emptyShow && !timingError) report(checklistBlockMessage(list), true);
    else if (warn) report(warn, false);
    if ($('exportHtml')) $('exportHtml').disabled = blocked;
    if ($('exportFrame')) $('exportFrame').disabled = blocked;
    if ($('exportFrames')) $('exportFrames').disabled = blocked;
    if ($('exportTiming')) $('exportTiming').disabled = blocked;
    if ($('exportVideo')) $('exportVideo').disabled = blocked || !recorderChoice() || !HTMLCanvasElement.prototype.captureStream;
    return !blocked;
  }
  function assertExportAllowed() {
    if (!(S.project?.show?.atoms?.length)) throw new Error('Open an AI motion HTML or add a clip to export video.');
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
    project.show.atoms.forEach(a=>{if(a.background?.src)paths.add(a.background.src);(a.micro_frames||[]).forEach(mf=>{if(mf?.src)paths.add(mf.src);});});
    (project.show.fg?.props||[]).forEach(p=>{if(p.src)paths.add(p.src);if(p.effect?.broken_src)paths.add(p.effect.broken_src);});
    const result=project.show.atoms.length?await S.compile():null;
    if(result){Object.values(result.layout).forEach(l=>{if(l.full)paths.add(l.full);if(l.strip?.src)paths.add(l.strip.src);if(l.background?.src)paths.add(l.background.src);(l.parts||[]).forEach(p=>paths.add(p.src));(l.micro_frames||[]).forEach(mf=>{if(mf?.src)paths.add(mf.src);});});backgroundImageRefs(result.timeline.bg).forEach(p=>paths.add(p));(result.timeline.atoms||[]).forEach(a=>(a.micro_frames||[]).forEach(mf=>{if(mf?.src)paths.add(mf.src);}));(result.timeline.overlays||[]).forEach(o=>{if(o.src)paths.add(o.src);});(result.timeline.fg?.props||[]).forEach(p=>{if(p.src)paths.add(p.src);if(p.effect?.broken_src)paths.add(p.effect.broken_src);});}
    await Promise.all([...paths].map(async p=>{if(!p.startsWith('data:image/'))assets[p]=await embeddedAsset(p,project);}));
    project.assets=assets;
    return {project,result,assets};
  }
  const exportIds = ['exportHtml','exportVideo','exportFrames','exportFrame','exportTiming','saveProject','openProject','loadDemo','loadExtended','loadOriginal','loadStreet','loadCostumeLock','loadPoseRefPack','newProject','importImages','changeBackground'];
  async function task(fn) {
    if(busy)return;busy=true;document.querySelector('.workspace').inert=true;$('projectTitle').disabled=true;$('exportPreset').disabled=true;if($('exportFormat'))$('exportFormat').disabled=true;
    exportIds.forEach(id=>{if($(id))$(id).disabled=true;});
    await new Promise(resolve=>setTimeout(resolve,25));
    try {await fn();} catch(e){hideReceipt();report(e.message,true);throw e;}finally{busy=false;activeCancel=null;clearProgress();document.querySelector('.workspace').inert=false;$('projectTitle').disabled=false;$('exportPreset').disabled=false;S.recording=false;S.update();['saveProject','openProject','loadDemo','loadExtended','loadOriginal','loadStreet','loadCostumeLock','loadPoseRefPack','newProject','importImages','changeBackground'].forEach(id=>{if($(id))$(id).disabled=false;});paintExportHints();applyExportGate();}
  }
  on('cancelExport',()=>{if(typeof activeCancel==='function')activeCancel();});
  $('exportDialog')?.addEventListener('close',()=>{if(typeof activeCancel==='function')activeCancel();});
  const safeName = (stem, suffix) => (window.HMXExport && typeof HMXExport.sanitizeDownloadName === 'function')
    ? HMXExport.sanitizeDownloadName(stem, suffix)
    : String(stem || 'motion').replace(/[^a-zA-Z0-9._-]+/g, '-') + String(suffix || '');
  let lastRelinkLocalFiles = null;
  on('saveProject',()=>task(async()=>{S.pause();report('Packing images and edits…');const {project}=await portable();const body=window.HMMotionSot?HMMotionSot.serialize(project):JSON.stringify(project);download(safeName(project.show.show_id,'.motion.json'),new Blob([body],{type:'application/json'}));try{if(window.HMMotionSot)HMMotionSot.writeDraft(localStorage,project,S.time);}catch(e){}try{if(window.HMTimelineJson)HMTimelineJson.writeSave(localStorage,project.show);}catch(e){}report('Project saved with embedded images.');$('saveState').textContent='Project downloaded';if(typeof S.renderTimelineJsonPanel==='function')S.renderTimelineJsonPanel();}));
  on('openProject',()=>$('projectInput').click());
  async function openProjectFiles(files){
    files=[...(files||[])];if(!files.length)return false;
    const skippedFiles=[],localFiles={};let primaryName='',parsed=null,candidateProject=null,fetchedHostShow=false,isLockPack=false,isHtml=false,htmlWarnings=[];
    try{
      const destination=S.destinationToken();
      const next=await (async()=>{
      const htmlFile=files.find(file=>/\.html?$/i.test(file.name||'')||file.type==='text/html');
      const jsonFile=files.find(file=>/\.json$/i.test(file.name||'')||file.type==='application/json');
      const primaryFile=htmlFile||jsonFile||files[0];
      isHtml=Boolean(htmlFile);
      primaryName=primaryFile.name||(isHtml?'motion.html':'project.json');
      if(primaryFile.size>100*1024*1024)throw new Error('Project exceeds the 100 MB import limit.');
      for(const imgFile of files){
        if(imgFile===primaryFile)continue;
        if(!['image/png','image/jpeg','image/webp'].includes(imgFile.type)&&!/\.(png|jpe?g|webp)$/i.test(imgFile.name||'')){if(imgFile.name)skippedFiles.push(imgFile.name);continue;}
        if(imgFile.size>20*1024*1024)throw new Error(imgFile.name+' is larger than 20 MB.');
        if(Object.hasOwn(localFiles,imgFile.name))throw new Error('Duplicate image filename: '+imgFile.name+'. Use distinct filenames for sheets and locked references.');
        const uri=await dataUrl(imgFile);
        if(window.HMImportSecurity&&typeof HMImportSecurity.inspectDataUrlDimensions==='function')HMImportSecurity.inspectDataUrlDimensions(uri,imgFile.name);
        localFiles[imgFile.name]=uri;
      }
      if(isHtml){
        if(!window.HMHtmlImport)throw new Error('HTML import helper is unavailable.');
        const htmlResult=HMHtmlImport.parseMotionHtml(await primaryFile.text(),{fileName:primaryName,localFiles});
        htmlWarnings=Array.isArray(htmlResult.warnings)?htmlResult.warnings.slice():[];
        parsed=htmlResult.project;
      }else{
        const rawJson=await primaryFile.text();
        parsed=(window.HMImportSecurity&&typeof HMImportSecurity.safeParseJson==='function')
          ?HMImportSecurity.safeParseJson(rawJson)
          :JSON.parse(rawJson);
      }
      if(parsed&&parsed.assets&&window.HMImportSecurity&&typeof HMImportSecurity.assertProjectAssetBudget==='function'){
        HMImportSecurity.assertProjectAssetBudget(parsed.assets);
      }
      if(typeof HMStripAdapter!=='undefined'&&HMStripAdapter.assertNotRootMotion)HMStripAdapter.assertNotRootMotion(parsed);
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
      if(isHtml&&window.HMHtmlImport&&Object.keys(localFiles).length){
        const relinked=HMHtmlImport.relinkMissingAssets(p,localFiles);
        p=relinked.project;
      }
      return p;
      })();
      candidateProject=next;
      lastRelinkLocalFiles=Object.keys(localFiles).length?{...localFiles}:null;
      const current=S.destinationToken();
      if(current.revision!==destination.revision||current.request!==destination.request)throw new Error('The open project changed during import review. Select the pack again.');
      const opened=await S.openProject(Promise.resolve(next));
      if(opened){
        report(isHtml?'AI motion HTML opened.':'Project opened.');
        if(window.HMImportReceipt){
          const audit=HMImportReceipt.auditProjectAssets(next,{localFiles,fetchedHostShow});
          const composeErrs=Array.isArray(S.composed?.errors)?S.composed.errors:[];
          const missing=[...audit.missingRefs,...skippedFiles.map(n=>n+' (unsupported file skipped)'),...composeErrs];
          const health=window.HMHtmlImport&&typeof HMHtmlImport.analyzeImportHealth==='function'
            ?HMHtmlImport.analyzeImportHealth(next,{missingRefs:audit.missingRefs,localFiles})
            :null;
          HMImportReceipt.record({action:isHtml?'Open AI HTML':(isLockPack?'Costume lock pack':'Open project'),source:next.show?.show_id||primaryName,status:missing.length?(audit.imagesLoaded||audit.clipsLoaded?'partial':'error'):'ok',filesLanded:[primaryName,...Object.keys(localFiles)],clipsLoaded:audit.clipsLoaded,imagesLoaded:audit.imagesLoaded,missing,warnings:htmlWarnings,relinkable:audit.missingRefs.length>0,exportReady:health?health.exportReady:undefined,totalDurationS:health?health.totalDurationS:undefined,suggestedMatches:health?health.suggestedMatches:undefined,canNormalizePacing:health?health.canNormalizePacing:undefined,replaceProject:true,undoable:false});
        }
      }
      return opened;
    }catch(err){
      if(window.HMImportReceipt){
        const activeId=S.project?.show?.show_id,candId=candidateProject?.show?.show_id;
        if(candidateProject&&activeId&&candId&&activeId===candId){
          const audit=HMImportReceipt.auditProjectAssets(candidateProject,{localFiles,fetchedHostShow});
          const missing=[...audit.missingRefs,...skippedFiles.map(n=>n+' (unsupported file skipped)'),err.message];
          const health=window.HMHtmlImport&&typeof HMHtmlImport.analyzeImportHealth==='function'
            ?HMHtmlImport.analyzeImportHealth(candidateProject,{missingRefs:audit.missingRefs,localFiles})
            :null;
          HMImportReceipt.record({action:isHtml?'Open AI HTML':(isLockPack?'Costume lock pack':'Open project'),source:candId||primaryName,status:'partial',filesLanded:[primaryName,...Object.keys(localFiles)],clipsLoaded:audit.clipsLoaded,imagesLoaded:audit.imagesLoaded,missing,warnings:[...htmlWarnings,'Opened partially with unresolved images kept missing (0 stand-in art).'],relinkable:audit.missingRefs.length>0,exportReady:health?health.exportReady:false,totalDurationS:health?health.totalDurationS:undefined,suggestedMatches:health?health.suggestedMatches:undefined,canNormalizePacing:health?health.canNormalizePacing:undefined,replaceProject:true,undoable:false});
        }else{
          const refAudit=parsed?HMImportReceipt.missingFromParsedInput(parsed,localFiles):{missing:[]};
          HMImportReceipt.record({action:isHtml?'Open AI HTML':(isLockPack?'Costume lock pack':'Open project'),source:primaryName||files.map(f=>f.name).join(', ')||'Project file',status:'error',filesLanded:[],clipsLoaded:0,imagesLoaded:0,missing:[err.message,...refAudit.missing,...skippedFiles.map(n=>n+' (unsupported file skipped)')],warnings:['Import failed; existing project kept without stand-in art.'],formatHint:err&&err.formatHint?err.formatHint:'',exportReady:false,replaceProject:false,undoable:false});
        }
      }
      throw err;
    }
  }
  async function relinkMissingFiles(files){
    files=[...(files||[])];if(!files.length||!S.project||!window.HMHtmlImport)return false;
    const localFiles={},skipped=[];
    for(const file of files){
      if(!['image/png','image/jpeg','image/webp'].includes(file.type)&&!/\.(png|jpe?g|webp)$/i.test(file.name||'')){if(file.name)skipped.push(file.name);continue;}
      if(file.size>20*1024*1024)throw new Error(file.name+' is larger than 20 MB.');
      if(Object.hasOwn(localFiles,file.name))throw new Error('Duplicate image filename: '+file.name+'.');
      const uri=await dataUrl(file);
      if(window.HMImportSecurity&&typeof HMImportSecurity.inspectDataUrlDimensions==='function')HMImportSecurity.inspectDataUrlDimensions(uri,file.name);
      localFiles[file.name]=uri;
    }
    lastRelinkLocalFiles={...localFiles};
    const res=HMHtmlImport.relinkMissingAssets(S.project,localFiles);
    if(!res.matched.length){
      if(window.HMImportReceipt){
        const beforeAudit=HMImportReceipt.auditProjectAssets(S.project,{localFiles:null});
        const suggested=(HMHtmlImport.suggestAssetMatches&&HMHtmlImport.suggestAssetMatches(beforeAudit.missingRefs,localFiles))||[];
        HMImportReceipt.record({action:'Relink missing images',source:S.project.show?.show_id||'Current project',status:beforeAudit.missingRefs.length?'partial':'ok',filesLanded:[],clipsLoaded:beforeAudit.clipsLoaded,imagesLoaded:beforeAudit.imagesLoaded,missing:[...beforeAudit.missingRefs,...skipped.map(n=>n+' (unsupported file skipped)')],warnings:[suggested.length?'No exact filename matched, but candidate matches are ready for 1-click Auto-match.':'No dropped files matched the missing image filenames.'],relinkable:beforeAudit.missingRefs.length>0,exportReady:beforeAudit.missingRefs.length===0,suggestedMatches:suggested,replaceProject:false,undoable:false});
      }
      S.status('No selected files matched the missing image filenames.',true);
      return false;
    }
    const patch={};res.matched.forEach(m=>{patch[m.ref]=res.project.assets[m.ref];});
    S.editProject(p=>{p.assets=Object.assign({},p.assets||{},patch);});
    try{await S.compile();}catch(e){}
    if(window.HMImportReceipt){
      const afterAudit=HMImportReceipt.auditProjectAssets(S.project,{localFiles:null});
      const warnings=[];
      if(res.unmatchedFiles.length)warnings.push('Unmatched files ignored: '+res.unmatchedFiles.join(', '));
      if(skipped.length)warnings.push('Unsupported files skipped: '+skipped.join(', '));
      const suggested=(HMHtmlImport.suggestAssetMatches&&HMHtmlImport.suggestAssetMatches(afterAudit.missingRefs,localFiles))||[];
      HMImportReceipt.record({action:'Relink missing images',source:S.project.show?.show_id||'Current project',status:afterAudit.missingRefs.length?'partial':'ok',filesLanded:res.matched.map(m=>m.file),clipsLoaded:afterAudit.clipsLoaded,imagesLoaded:afterAudit.imagesLoaded,missing:afterAudit.missingRefs,warnings,relinkable:afterAudit.missingRefs.length>0,exportReady:afterAudit.missingRefs.length===0,suggestedMatches:suggested,replaceProject:false,undoable:true});
    }
    S.status('Relinked '+res.matched.length+' missing image'+(res.matched.length===1?'':'s')+'.');
    return true;
  }
  document.addEventListener('hm:receipt-automatch',safe(async e=>{
    const matches=Array.isArray(e?.detail)?e.detail:[];
    if(!matches.length||!lastRelinkLocalFiles||!S.project)return;
    const patch={};
    const landed=[];
    for(const m of matches){
      const data=lastRelinkLocalFiles[m.file];
      if(data){patch[m.ref]=data;landed.push(m.file);}
    }
    if(!landed.length)return;
    S.editProject(p=>{p.assets=Object.assign({},p.assets||{},patch);});
    try{await S.compile();}catch(err){}
    if(window.HMImportReceipt){
      const audit=HMImportReceipt.auditProjectAssets(S.project,{localFiles:null});
      HMImportReceipt.record({action:'Auto-match images',source:S.project.show?.show_id||'Current project',status:audit.missingRefs.length?'partial':'ok',filesLanded:landed,clipsLoaded:audit.clipsLoaded,imagesLoaded:audit.imagesLoaded,missing:audit.missingRefs,warnings:['Auto-matched '+landed.length+' image(s) by stem/plate ID.'],relinkable:audit.missingRefs.length>0,exportReady:audit.missingRefs.length===0,replaceProject:false,undoable:true});
    }
    S.status('Auto-matched '+landed.length+' missing image(s).');
  }));
  document.addEventListener('hm:receipt-normalize-pacing',safe(async()=>{
    if(!S.project||!window.HMHtmlImport?.normalizeAiPacing)return;
    const res=HMHtmlImport.normalizeAiPacing(S.project);
    if(!res.changedCount){S.status('Clip pacing already looks clean.');return;}
    S.editProject(p=>{p.show.atoms=res.project.show.atoms;});
    try{await S.compile();}catch(err){}
    if(window.HMImportReceipt){
      const audit=HMImportReceipt.auditProjectAssets(S.project,{localFiles:null});
      const health=HMHtmlImport.analyzeImportHealth(S.project,{missingRefs:audit.missingRefs});
      HMImportReceipt.record({action:'Normalize AI pacing',source:S.project.show?.show_id||'Current project',status:audit.missingRefs.length?'partial':'ok',filesLanded:[],clipsLoaded:audit.clipsLoaded,imagesLoaded:audit.imagesLoaded,missing:audit.missingRefs,warnings:['Normalized clip pacing and default cameras ('+res.changedCount+' update(s)).'],relinkable:audit.missingRefs.length>0,exportReady:health.exportReady,totalDurationS:health.totalDurationS,canNormalizePacing:health.canNormalizePacing,replaceProject:false,undoable:true});
    }
    S.status('Normalized AI pacing across clips.');
  }));
  S.openProjectFiles=openProjectFiles;
  S.relinkMissingFiles=relinkMissingFiles;
  $('projectInput').onchange=safe(async e=>{
    try{await openProjectFiles(e.target.files);}
    finally{e.target.value='';}
  });
  if($('relinkAssetsInput'))$('relinkAssetsInput').onchange=safe(async e=>{
    try{await relinkMissingFiles(e.target.files);}
    finally{e.target.value='';}
  });
  const stageDropHost=document.querySelector('main.stage-well');
  const isFileDrop=e=>Array.from(e.dataTransfer?.types||[]).includes('Files');
  if(stageDropHost){
    stageDropHost.addEventListener('dragover',e=>{if(!isFileDrop(e))return;e.preventDefault();stageDropHost.classList.add('is-file-drop-target');});
    stageDropHost.addEventListener('dragleave',e=>{if(!e.relatedTarget||!stageDropHost.contains(e.relatedTarget))stageDropHost.classList.remove('is-file-drop-target');});
    stageDropHost.addEventListener('drop',safe(async e=>{
      if(!isFileDrop(e))return;
      e.preventDefault();stageDropHost.classList.remove('is-file-drop-target');
      const dropped=Array.from(e.dataTransfer?.files||[]);if(!dropped.length)return;
      if(dropped.some(f=>/\.(html?|json)$/i.test(f.name||'')||f.type==='text/html'||f.type==='application/json')){
        await openProjectFiles(dropped);
      }else if(window.HMImportReceipt&&S.project&&HMImportReceipt.auditProjectAssets(S.project).missingRefs.length){
        await relinkMissingFiles(dropped);
      }else{
        S.status('Drop an AI motion .html or .motion.json file to open it.');
      }
    }));
  }
  function selectedPreset() {return HMXExport.presetById($('exportPreset').value)||HMXExport.presets[0];}
  function isMimeSupported(type){return !!(window.MediaRecorder&&typeof MediaRecorder.isTypeSupported==='function'&&MediaRecorder.isTypeSupported(type));}
  function selectedFormatExt() {
    const sel=$('exportFormat');
    return sel&&sel.value?sel.value:'';
  }
  function refreshFormatSelect() {
    const sel=$('exportFormat');
    if(!sel)return [];
    const formats=HTMLCanvasElement.prototype.captureStream&&typeof HMXExport.availableRecorderFormats==='function'
      ?HMXExport.availableRecorderFormats(isMimeSupported)
      :[];
    const userChoice=sel.dataset.userChoice||'';
    const key=formats.map(f=>f.ext+':'+f.mime).join('|');
    if(sel.dataset.formatKey!==key){
      sel.dataset.formatKey=key;
      sel.replaceChildren();
      if(!formats.length){
        const opt=document.createElement('option');
        opt.value='';
        opt.textContent='Unavailable here';
        sel.append(opt);
      }else{
        formats.forEach(f=>{
          const opt=document.createElement('option');
          opt.value=f.ext;
          opt.textContent=f.ext==='mp4'?'MP4 (this browser only · not universal)':f.label+' (preferred)';
          sel.append(opt);
        });
      }
      if(userChoice&&formats.some(f=>f.ext===userChoice))sel.value=userChoice;
      else if(formats.length)sel.value=formats[0].ext;
    }
    if(!busy)sel.disabled=formats.length<2;
    return formats;
  }
  function currentFfmpegCommand(kind='mp4') {
    const preset=selectedPreset();
    const stem=String(S.project?.show?.show_id||'motion');
    const dur=S.duration>0?S.duration:1;
    if(kind==='mp4'&&typeof HMXExport.ffmpegMp4Argv==='function'&&typeof HMXExport.formatFfmpegCommand==='function'){
      return HMXExport.formatFfmpegCommand(HMXExport.ffmpegMp4Argv(preset,dur,stem+'.mp4'));
    }
    if(typeof HMXExport.formatFfmpegCommand==='function'){
      return HMXExport.formatFfmpegCommand(HMXExport.ffmpegArgv(preset,dur,stem+'.webm'));
    }
    return '';
  }
  function assertNonEmptyBlob(blob, label) {
    if (!blob || !(blob.size > 0)) {
      hideReceipt();
      throw new Error((label || 'Export') + ' produced an empty file (0 bytes). Nothing was saved.');
    }
    return blob;
  }
  function hideReceipt() {
    const box=$('exportReceipt');
    if(box){box.hidden=true;delete box.dataset.kind;delete box.dataset.mime;delete box.dataset.bytes;}
    if($('exportReceiptHonesty')){$('exportReceiptHonesty').hidden=true;$('exportReceiptHonesty').textContent='';}
    if($('exportReceiptCmd')){$('exportReceiptCmd').hidden=true;$('exportReceiptCmd').textContent='';}
    if($('exportReceiptCopyMp4'))$('exportReceiptCopyMp4').hidden=true;
  }
  function showReceipt(receipt) {
    const box=$('exportReceipt');
    if(!box||!receipt||(receipt.bytes!=null&&!(receipt.bytes>0))){hideReceipt();return;}
    box.dataset.kind=String(receipt.kind||'');
    box.dataset.mime=String(receipt.mime||'');
    box.dataset.bytes=receipt.bytes!=null?String(receipt.bytes):'';
    if($('exportReceiptTitle'))$('exportReceiptTitle').textContent=receipt.title||'Export ready';
    if($('exportReceiptMeta'))$('exportReceiptMeta').textContent=receipt.summary||'';
    if($('exportReceiptHonesty')){
      const h=String(receipt.honestyNote||'');
      $('exportReceiptHonesty').textContent=h;
      $('exportReceiptHonesty').hidden=!h;
    }
    if($('exportReceiptCmd')){
      const cmd=receipt.kind==='frames'?String(receipt.ffmpegCommand||receipt.mp4Command||''):'';
      $('exportReceiptCmd').textContent=cmd;
      $('exportReceiptCmd').hidden=!cmd;
    }
    if($('exportReceiptCopyMp4'))$('exportReceiptCopyMp4').hidden=receipt.kind!=='frames';
    box.hidden=false;
  }
  async function copyFfmpeg(kind='mp4') {
    const cmd=currentFfmpegCommand(kind);
    if(!cmd)throw new Error('Add a clip before copying ffmpeg command.');
    if(!navigator.clipboard||typeof navigator.clipboard.writeText!=='function')throw new Error('Clipboard unavailable; select the command text above to copy.');
    await navigator.clipboard.writeText(cmd);
    report((kind==='mp4'?'MP4':'WebM')+' ffmpeg command copied ('+selectedPreset().label+').');
  }
  on('copyFfmpegMp4',()=>copyFfmpeg('mp4'));
  on('copyFfmpegWebm',()=>copyFfmpeg('webm'));
  on('exportReceiptCopyMp4',()=>copyFfmpeg('mp4'));
  function paintExportHints() {
    const preset=selectedPreset();
    refreshFormatSelect();
    const cadence=typeof HMXExport.detectCadenceMismatch==='function'?HMXExport.detectCadenceMismatch(S.project,preset):{mismatch:false,warning:''};
    if($('exportPreflight')&&typeof HMXExport.preflightSummary==='function'){
      const pf=HMXExport.preflightSummary(S.duration,preset);
      $('exportPreflight').dataset.exact=String(Boolean(pf.frameExact||!S.duration));
      if($('exportPreflightText'))$('exportPreflightText').textContent=pf.summary;
      const snapBtn=$('snapFrameBoundary');
      if(snapBtn){
        const needsSnap=Boolean(S.duration>0&&!pf.frameExact);
        snapBtn.hidden=!needsSnap;
        if(needsSnap)snapBtn.textContent=`Snap to ${pf.exactFrames} frames (${pf.nearestDurationS.toFixed(4)}s)`;
      }
    }
    $('exportBitrateHint').textContent=HMXExport.bitrateHint(preset);
    $('exportHonesty').textContent=cadence.mismatch?HMXExport.HONESTY+' · '+cadence.warning:HMXExport.HONESTY;
    $('exportHonesty').classList.toggle('cadence-warning',Boolean(cadence.mismatch));
    let seq='Optional zip at '+preset.label+'. The local skill runs ffmpeg.';
    if(S.duration>0){try{seq='Optional zip at '+preset.label+' · '+HMXExport.framePlan(S.duration,preset.fps).length+' frames. The local skill runs ffmpeg.';}catch(e){seq='Optional zip at '+preset.label+'. '+e.message;}}
    $('frameSeqHint').textContent=seq;
    if($('exportFfmpegCmd'))$('exportFfmpegCmd').textContent=currentFfmpegCommand('mp4');
    const choice=recorderChoice();
    paintExportMatrix();
    if(!choice||!HTMLCanvasElement.prototype.captureStream)$('videoHint').textContent='Video recording unavailable in this browser. Use playable HTML or the frame-sequence zip.';
    else {
      const kind=choice.ext==='mp4'?'MP4 · this browser only · MP4 is not universal':choice.label;
      const hintWarn=cadence.mismatch?' · cadence mismatch (24 fps strip vs '+preset.fps+' fps preset)':'';
      $('videoHint').textContent=kind+' · '+preset.label+' · '+preset.width+'×'+preset.height+' · '+preset.fps+' fps · '+HMXExport.formatMbps(preset.videoBitsPerSecond)+' · records in real time · keep this tab visible'+hintWarn;
    }
  }
  on('snapFrameBoundary',()=>{
    if(!S.show?.atoms?.length||typeof HMXExport.snapShowToFrameBoundary!=='function')return;
    const preset=selectedPreset();
    const res=HMXExport.snapShowToFrameBoundary(S.show.atoms,preset.fps,S.selectedIndex);
    S.editProject(p=>{p.show.atoms=res.atoms;if(window.HMComposeClient?.reflowAllCamChains)HMComposeClient.reflowAllCamChains(p.show.atoms);});
    paintExportHints();applyExportGate();
    report('Snapped show duration to '+res.exactFrames+' exact frames ('+res.snappedDurationS.toFixed(4)+'s at '+preset.fps+' fps).');
  });
  function exportCaps(){
    return HMExportMatrix.browserCaps({
      captureStream:!!(HTMLCanvasElement.prototype&&HTMLCanvasElement.prototype.captureStream),
      isTypeSupported:isMimeSupported
    });
  }
  function paintExportMatrix(){
    const body=$('exportMatrixBody');
    if(!body||!window.HMExportMatrix)return;
    const ext=selectedFormatExt();
    const matrix=ext==='mp4'?HMExportMatrix.matrix(exportCaps(),ext):HMExportMatrix.matrix(exportCaps());
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
  if($('exportFormat'))$('exportFormat').addEventListener('change',()=>{$('exportFormat').dataset.userChoice=$('exportFormat').value||'';paintExportHints();applyExportGate();});
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
      label.textContent=`${strip.name} · cell ${strip.index+1}/${strip.frames} · ${strip.t.toFixed(2)}s · ${strip.not_playable?'NOT PLAYABLE':'PLAYABLE'}`;
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
  function openExportDialog(){
    S.pause();report('');clearProgress();hideReceipt();paintExportHints();applyExportGate();
    $('exportDialog').showModal();
    paintBakeQa();
  }
  function openBakeQa(){
    openExportDialog();
    window.HMUiLayout?.setDrawer?.('exportBake',true);
    window.HMUiLayout?.setDrawer?.('bakeQaDock',true);
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
  on('exportOpen',openExportDialog);
  on('openBakeQa',openBakeQa);
  on('exportFrame',()=>task(async()=>{
    assertExportAllowed();await S.compile();
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
    const renderer=HMMotion(canvas,S.project.assets||{});await renderer.load(S.composed);
    S.sampleStageFrameAt(S.time,{renderer,standIn:false,onion:false,source:'bake-export-frame'});
    const rawBlob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const blob=assertNonEmptyBlob(rawBlob,'Current frame PNG');
    const frameFile=safeName(S.project.show.show_id,'-'+S.time.toFixed(2)+'s.png');
    download(frameFile,blob);report('Current frame downloaded.');
    if(typeof HMXExport.buildExportReceipt==='function')showReceipt(HMXExport.buildExportReceipt({kind:'frame',filename:frameFile,format:'PNG frame',mime:blob.type||'image/png',bytes:blob.size,width:canvas.width,height:canvas.height,durationS:S.duration,showId:S.project.show.show_id,note:'at '+S.time.toFixed(2)+'s'}));
  }));
  on('exportTiming',()=>task(async()=>{
    assertExportAllowed();
    S.pause();await S.compile();
    if(!S.composed||S.composed.ok===false)throw new Error('Compose this edit before exporting a timing pack.');
    const presets=S.timingPacks;
    if(!presets?.packs?.length)throw new Error('Timing packs are not loaded.');
    const dump=HMComposeClient.timingExport(presets,S.composed,24);
    const timingFile=safeName(S.project.show.show_id,'-timing.json');
    const blob=assertNonEmptyBlob(new Blob([JSON.stringify(dump)],{type:'application/json'}),'Timing pack JSON');
    download(timingFile,blob);
    report('Timing presets and frame sequence downloaded.');
    if(typeof HMXExport.buildExportReceipt==='function')showReceipt(HMXExport.buildExportReceipt({kind:'timing',filename:timingFile,format:'Timing pack JSON',mime:blob.type||'application/json',bytes:blob.size,durationS:S.duration,showId:S.project.show.show_id,note:(dump.frames?.length||0)+' timing rows'}));
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
    const rawData=JSON.stringify({...result,assets});
    const data=(window.HMImportSecurity&&typeof HMImportSecurity.escapeScriptJson==='function')
      ?HMImportSecurity.escapeScriptJson(rawData)
      :rawData.replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
    const pxBundle=await pixelfxExportBundle(project);
    const pxScript=pxBundle?`<script>${pxBundle.replace(/<\/script/gi,'<\\/script')}<\/script>`:'';
    const hmProjectScript=window.HMHtmlImport?HMHtmlImport.embedProjectScript(project,{omitAssets:true}):'';
    const cspMeta='<meta http-equiv="Content-Security-Policy" content="'+"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"+'">';
    const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${cspMeta}<title>HTML Motion</title><style>body{margin:0;background:#101315;color:#edf1e9;font:14px system-ui;min-height:100vh;display:grid;place-content:center}main{width:min(100vw,1280px)}canvas{display:block;width:100%;height:auto;background:white}nav{display:flex;gap:16px;align-items:center;padding:16px}button{background:#ccf17b;border:0;border-radius:6px;padding:9px 18px;cursor:pointer}input{accent-color:#ccf17b;flex:1;min-width:50px}output{font-size:12px;white-space:nowrap}h1{font-size:16px;font-weight:500;padding:0 16px}p{font-size:11px;color:#98a699;padding:0 16px}#pixelfxHonesty{margin:0 16px 12px;padding:8px 10px;background:#2f1c0fee;border:1px solid #ff9e44;color:#ffe4bf;font:600 12px/1.4 ui-monospace,monospace}</style><main><h1 id="title"></h1><canvas id="stage" width="1280" height="720"></canvas><p id="pixelfxHonesty" hidden></p><nav><button id="play" disabled>Loading…</button><input id="seek" aria-label="Seek" type="range" min="0" step="0.01" value="0"><output id="time"></output></nav><p>HTML Motion · Plate animation · Plays offline</p><p id="layers"></p></main>${hmProjectScript}${pxScript}<script>${backgroundMotionFrame.toString()}\n${backgroundMotionProgress.toString()}\n${backgroundScrollState.toString()}\n${fgPassByInstances.toString()}\n${resolveMicroFrameAt.toString()}\n${fgCameraFrame.toString()}\n${fgPropPose.toString()}\n${fgBrokenCutoutSrc.toString()}\n${fgBreakState.toString()}\nconst FX_FIST_PATH=${JSON.stringify(globalThis.FX_FIST_PATH)};\nconst FX_LEG_PATH=${JSON.stringify(globalThis.FX_LEG_PATH)};\nconst FX_TORNADO_PATH=${JSON.stringify(globalThis.FX_TORNADO_PATH)};\n${fxPathOrStock.toString()}\n${fxPointOnPath.toString()}\n${fxPlacementOf.toString()}\n${transformFxPath.toString()}\n${exposureWarmCrushPixels.toString()}\n${normalizeImpactOpts.toString()}\n${normalizeHitstopEntry.toString()}\n${resolveHitstopAt.toString()}\n${applyHitstopPixels.toString()}\n${impactBurstGeometry.toString()}\n${drawImpactBurst.toString()}\n${normalizeFxLayerOpts.toString()}\n${taperedArcPolygon.toString()}\n${computeCameraVelocity.toString()}\n${computeBgParallaxOffset.toString()}\n${drawSceneAtmosphereMood.toString()}\n${computeCameraImpactShake.toString()}\n${drawFistPressure.toString()}\n${drawLegArc.toString()}\n${drawTornado.toString()}\n${collectProceduralOverlays.toString()}\n${cameraEase.toString()}\n${cameraChannel.toString()}\n${cameraPoseOnSegment.toString()}\n${cutTransitionsBundle.toString()}\ncutTransitionsBundle();\n${backgroundLocationsBundle.toString()}\nbackgroundLocationsBundle();\n${typeof stripSamplerBundle==='function'?stripSamplerBundle.toString()+'\nstripSamplerBundle();\n':''}${layerCamMatrix.toString()}\n${layerCamsIndependent.toString()}\n${layerCamMatrixText.toString()}\n${createMotionRenderer.toString()}\n${typeof createHMTeachingFilm==='function'?createHMTeachingFilm.toString()+'\nconst HMTeachingFilm=createHMTeachingFilm();\n':''}const DATA=${data};\n(${standalonePlayer.toString()})(DATA);<\/script></html>`;
    const htmlFile=safeName(project.show.show_id,'.html');
    const htmlBlob=assertNonEmptyBlob(new Blob([html],{type:'text/html'}),'Playable HTML');
    const htmlMime=htmlBlob.type||'text/html';
    download(htmlFile,htmlBlob);report('Playable HTML downloaded. All images are embedded.');
    if(typeof HMXExport.buildExportReceipt==='function')showReceipt(HMXExport.buildExportReceipt({kind:'html',filename:htmlFile,format:'Offline HTML + Project SoT',mime:htmlMime,bytes:htmlBlob.size,width:1280,height:720,durationS:result.timeline?.duration_s||S.duration,showId:project.show.show_id,note:'All images embedded'}));
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
  function recorderChoice(){if(!window.MediaRecorder||typeof MediaRecorder.isTypeSupported!=='function')return null;return HMXExport.pickRecorderMime(type=>MediaRecorder.isTypeSupported(type),selectedFormatExt());}
  paintExportHints();if(!recorderChoice()||!HTMLCanvasElement.prototype.captureStream)$('exportVideo').disabled=true;
  window.addEventListener('hm:projectchange', () => {
    if (busy || !S.show) return;
    if ($('exportDialog')?.open) {
      paintExportHints();
      applyExportGate();
    } else if (!S.show.atoms?.length) {
      applyExportGate();
    }
  });
  on('exportFrames',()=>task(async()=>{
    assertExportAllowed();
    S.pause();await S.compile();if(!S.composed)throw new Error('Add a clip before exporting a frame sequence.');
    const preset=selectedPreset();const duration=S.duration;const plan=HMXExport.framePlan(duration,preset.fps);
    const canvas=document.createElement('canvas');canvas.width=preset.width;canvas.height=preset.height;
    const r=HMMotion(canvas,S.project.assets||{});await r.load(S.composed);
    const files=[];let cancelled=false;activeCancel=()=>{cancelled=true;};
    setProgress(0,'Frame 0 / '+plan.length+' (0%)',true);
    for(let i=0;i<plan.length;i++){
      if(cancelled){hideReceipt();report('Export cancelled.');return;}
      S.sampleStageFrameAt(plan[i].t,{renderer:r,standIn:false,onion:false,source:'bake-export-frames'});
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(cancelled){hideReceipt();report('Export cancelled.');return;}
      if(!blob||!(blob.size>0))throw new Error('Could not export frame '+(i+1)+'.');
      files.push({name:plan[i].file,data:new Uint8Array(await blob.arrayBuffer())});
      const pct=(i+1)/plan.length;
      setProgress(pct,'Frame '+(i+1)+' / '+plan.length+' ('+Math.round(pct*100)+'%)',true);
      report('Frame '+(i+1)+' / '+plan.length+' · '+preset.label);
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(cancelled){hideReceipt();report('Export cancelled.');return;}
    const timing=HMXExport.timingDocument({showId:S.project.show.show_id,preset,durationS:duration,frames:plan});
    files.unshift({name:'timing.json',data:new TextEncoder().encode(JSON.stringify(timing,null,2)+'\n')});
    const zip=HMXExport.zipStore(files);
    const zipFile=safeName(S.project.show.show_id,'-'+preset.id+'-frames.zip');
    const zipBlob=assertNonEmptyBlob(new Blob([zip],{type:'application/zip'}),'Frame sequence ZIP');
    const zipMime=zipBlob.type||'application/zip';
    download(zipFile,zipBlob);
    report('Frame sequence downloaded ('+plan.length+' frames · '+preset.label+'). Copy the local ffmpeg MP4 command below to encode H.264.');
    if(typeof HMXExport.buildExportReceipt==='function')showReceipt(HMXExport.buildExportReceipt({kind:'frames',filename:zipFile,format:'PNG + timing.json',mime:zipMime,bytes:zipBlob.size,preset,width:canvas.width,height:canvas.height,durationS:duration,showId:S.project.show.show_id,ffmpegCommand:timing.ffmpeg_mp4?.command||currentFfmpegCommand('mp4'),note:plan.length+' frames'}));
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
    let resolveStop=()=>{};
    let cancelled=false,visibilityChanged=false,recorderError=null,renderedFrames=0,resolveLoop=()=>{};
    const done=new Promise(resolve=>{resolveStop=resolve;recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=resolve;});
    const stopLoop=()=>{if(recorder.state!=='inactive'){try{recorder.stop();}catch(err){resolveStop();}}else resolveStop();resolveLoop();};
    recorder.onerror=e=>{recorderError=e?.error||new Error('Video recorder failed');stopLoop();};
    activeCancel=()=>{cancelled=true;stopLoop();};
    const interrupted=()=>{if(document.hidden){visibilityChanged=true;stopLoop();}};document.addEventListener('visibilitychange',interrupted);
    try{
      recorder.start();const start=performance.now(),duration=S.duration;
      setProgress(0,'0.0 / '+duration.toFixed(1)+'s · '+choice.label+' '+preset.label,true);
      await new Promise(resolve=>{resolveLoop=resolve;const frame=now=>{if(visibilityChanged||cancelled||recorderError){resolve();return;}const t=Math.min(duration,(now-start)/1000);S.sampleStageFrameAt(t,{renderer:r,standIn:false,onion:false,source:'bake-record-video'});renderedFrames++;const pct=duration>0?Math.min(1,t/duration):1;setProgress(pct,t.toFixed(1)+' / '+duration.toFixed(1)+'s · '+choice.label+' '+preset.label,true);report(`Recording ${t.toFixed(1)} / ${duration.toFixed(1)}s · Keep this tab visible`);if(t>=duration||visibilityChanged||cancelled||recorderError)resolve();else requestAnimationFrame(frame);};requestAnimationFrame(frame);});
      const elapsedMs=performance.now()-start;
      if(recorder.state!=='inactive')recorder.stop();
      await done;if(visibilityChanged)throw new Error('Recording interrupted because the tab was hidden. Keep this tab visible and retry.');
      if(recorderError)throw recorderError;
      if(cancelled){hideReceipt();report('Export cancelled.');return;}
      const vidBlob=assertNonEmptyBlob(new Blob(chunks,{type:choice.mime}),'Video recording');
      const actualMime=vidBlob.type||choice.mime;
      const telemetry=HMXExport.cadenceTelemetry({durationS:duration,targetFps:preset.fps,renderedFrames,actualElapsedMs:elapsedMs,mime:actualMime,width:canvas.width,height:canvas.height});
      const vidFile=safeName(S.project.show.show_id,'.'+choice.ext);
      download(vidFile,vidBlob);report(telemetry.summary,false,telemetry.significant_drop);
      if(typeof HMXExport.buildExportReceipt==='function')showReceipt(HMXExport.buildExportReceipt({kind:'video',filename:vidFile,format:actualMime,mime:actualMime,bytes:vidBlob.size,preset,width:canvas.width,height:canvas.height,durationS:duration,showId:S.project.show.show_id,note:'measured '+telemetry.measured_fps.toFixed(1)+' fps'}));
    }finally{document.removeEventListener('visibilitychange',interrupted);if(recorder.state!=='inactive')recorder.stop();stream.getTracks().forEach(t=>t.stop());}
  }));
})();

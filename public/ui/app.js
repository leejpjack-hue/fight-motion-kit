/* No server mutations: editing, composing and persistence all run on this device. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const copy = x => structuredClone(x);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid = () => 'clip-' + crypto.randomUUID();
  const DEMO = 'daiyu-wang-five-seconds';
  const ORIGINAL = 'daiyu-wang-codex-import';
  const CONTINUATION = 'daiyu-wang-ten-seconds';
  let project, presets, effects, renderer, result, selected = 0, time = 0, playing = false, looping = false;
  let history = [], historyIndex = -1, compileVersion = 0, renderedVersion = -1, saveVersion = 0, replacing = false, recording = false, preparing = false, playToken = 0;
  let clockStart = 0, timeStart = 0, dragIndex = -1, playbackFrame = 0;
  const duration = () => project?.show.atoms.reduce((s,a) => s + a.duration_s, 0) || 0;
  const atom = () => project?.show.atoms[selected];
  const startOf = index => project.show.atoms.slice(0,index).reduce((s,a) => s + a.duration_s, 0);
  const format = t => `${String(Math.floor(t/60)).padStart(2,'0')}:${(t%60).toFixed(2).padStart(5,'0')}`;
  function status(text, bad = false) { $('status').textContent = text; $('status').style.color = bad ? 'var(--danger)' : ''; }
  function safe(fn) { return async (...args) => { try { await fn(...args); } catch (e) { status(e.message, true); $('exportStatus').textContent=e.message; $('exportStatus').classList.add('error'); } }; }
  function on(id, fn) { $(id).addEventListener('click', safe(fn)); }
  async function json(url) { const r=await fetch(url); if(!r.ok) throw new Error(`Could not open ${url} (${r.status})`); return r.json(); }
  function pathsSafe(value) {
    if (typeof value === 'string' && /^(javascript:|https?:|\/\/|data:(?!image\/(png|jpeg|webp|gif);base64,))/i.test(value)) throw new Error('Project contains a nonlocal asset URL. Use embedded PNG, JPG or WebP images.');
    if (value && typeof value === 'object') Object.values(value).forEach(pathsSafe);
  }
  function validate(p) {
    if (!p?.show || !Array.isArray(p.show.atoms) || !p.layouts || !Array.isArray(p.media)) throw new Error('Choose an HTML Motion project JSON file.');
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(p.show.show_id || '')) throw new Error('Project ID must use lowercase letters, numbers, hyphens or underscores.');
    if (p.show.atoms.length > 300) throw new Error('A project can contain up to 300 clips.');
    const ids = new Set();
    for (const a of p.show.atoms) {
      if (ids.has(a.id)) throw new Error('Duplicate clip ID: ' + a.id); ids.add(a.id);
      if (!Number.isFinite(a.duration_s) || a.duration_s < .1 || !Number.isInteger(a.plates_needed) || a.plates_needed < 1) throw new Error('Each clip needs a duration of at least 0.1 seconds and at least one plate.');
      if (a.pose_mode !== 'hero' || !a.hero || !p.layouts[a.hero.layout_source]) throw new Error('This editor needs a plate layout for each clip. Library pose synthesis remains a kit-only tool.');
      if (!Array.isArray(a.hero.plates) || a.hero.plates.length !== a.plates_needed || a.hero.plates.some(id => !p.layouts[a.hero.layout_source][id])) throw new Error('A clip refers to a missing plate.');
    }
    if (p.show.atoms.reduce((s,a)=>s+a.duration_s,0) > 120) throw new Error('Keep the sequence within 120 seconds.');
    if(p.assets)for(const value of Object.values(p.assets))if(typeof value!=='string'||!/^data:image\/(png|jpeg|webp|gif);base64,/.test(value))throw new Error('Embedded assets must be image data, not external URLs.');
    Object.values(p.layouts).forEach(pathsSafe); (p.media||[]).forEach(m=>pathsSafe(m.src)); Object.values(p.show.bg||{}).filter(v=>typeof v==='string').forEach(pathsSafe); (p.show.overlays||[]).forEach(o=>{if(o.src)pathsSafe(o.src);});
  }
  async function builtIn(id) {
    const show = await json('/shows/' + id + '.json'); const layouts = {};
    for (const key of new Set(show.atoms.map(a=>a.hero?.layout_source).filter(Boolean))) {
      const layout = await json('/'+key);
      // The shipped old layout references PNGs; the deployed cutouts are WebP.
      if (id === ORIGINAL) for (const l of Object.values(layout)) {if(l.full)l.full=l.full.replace(/(plates\/[^/]+)\.png$/, '$1.jpg');for (const p of l.parts||[]) p.src=p.src.replace(/(cutout\/[^/]+)\.png$/, '$1.webp');}
      layouts[key] = layout;
    }
    const media = [];
    for (const [key,l] of Object.entries(layouts)) for (const [pid,entry] of Object.entries(l)) {
      const dir=key.slice(0,key.lastIndexOf('/')+1);
      const src=entry.full ? dir+entry.full : id===ORIGINAL && !pid.includes('_') ? `assets/${ORIGINAL}/plates/${pid}.jpg` : dir+entry.parts?.[0]?.src;
      if (src) media.push({id:uid(),name:pid,src,layoutSource:key,plateId:pid});
    }
    return {version:1, show, layouts, media};
  }
  async function load(p) {
    validate(p); pause(); project=copy(p); selected=project.show.atoms.length?0:-1;time=0;
    history=[copy(project)];historyIndex=0;result=null;
    update(); await compile(); await persist();status(project.show.atoms.length?`Ready · ${duration().toFixed(2)}s · All processing stays in your browser`:'Blank project · Add a library image or import images to begin');
    const url=new URL(location.href);url.searchParams.set('show',project.show.show_id);historyReplace(url);
  }
  function historyReplace(url) { window.history.replaceState(null,'',url); }
  async function persist() {
    const v=++saveVersion; $('saveState').textContent='Saving…';
    try { await HMAssetStore.put('active', copy(project)); if(v===saveVersion)$('saveState').textContent='Saved on this device'; }
    catch(e){$('saveState').textContent='Not saved · download a project';status('Browser storage unavailable. Use Save project to keep your work.',true);}
  }
  function commit() {
    validate(project); pause();
    if(JSON.stringify(project)===JSON.stringify(history[historyIndex])){update();return;}
    history=history.slice(0,historyIndex+1);history.push(copy(project)); if(history.length>60)history.shift();historyIndex=history.length-1;
    time=Math.min(time,duration());update();void compile().catch(e=>status(e.message,true));void persist();
  }
  function edit(fn) {
    const before=copy(project);
    try {fn();validate(project);commit();} catch(e){project=before;update();throw e;}
  }
  function restore(delta) {const i=historyIndex+delta;if(i<0||i>=history.length)return;pause();historyIndex=i;project=copy(history[i]);selected=Math.min(selected,project.show.atoms.length-1);time=Math.min(time,duration());update();void compile().catch(e=>status(e.message,true));void persist();status(delta<0?'Undid last edit':'Redid last edit');}
  function captionOverlays(show) {
    show.overlays=(show.overlays||[]).filter(o=>!o.editor_caption);let t=0;
    show.atoms.forEach(a=>{if(a.caption)show.overlays.push({id:'caption-'+a.id,editor_caption:true,kind:'text',text:a.caption,t_start:t,t_end:t+a.duration_s,x:640,y:644,z:20,style:{fontSize:38,fill:'#ffffff',stroke:'#17201d',strokeWidth:7}});t+=a.duration_s;});
  }
  async function compile() {
    const v=++compileVersion;
    if(!project.show.atoms.length){result=null;renderer=null;$('stage').getContext('2d').clearRect(0,0,1280,720);updateTransport();return null;}
    const snapshot=copy(project);captionOverlays(snapshot.show);
    try {
      const r=await HMComposeClient.composeShow(snapshot.show,{cameraPresets:presets,fxPresets:effects,loadJson:async p=>{if(snapshot.layouts[p])return snapshot.layouts[p];return json('/'+p);}});
      if(!r.ok)throw new Error(r.errors.join('; '));
      const next=HMMotion($('stage'),snapshot.assets||{});await next.load(r);
      if(v!==compileVersion)return null;
      result=r;renderer=next;renderedVersion=v;draw();status(`Ready · ${r.duration_s.toFixed(2)}s · ${r.stats.plates} plates · All processing stays in your browser`);return r;
    }catch(e){if(v===compileVersion){result=null;renderer=null;status('Preview unavailable: '+e.message,true);}throw e;}
  }
  function activeAt(t) {let s=0;return project.show.atoms.findIndex(a=>{s+=a.duration_s;return t<s-1e-7;});}
  function mediaFor(a) {return project.media.find(m=>m.layoutSource===a?.hero?.layout_source&&m.plateId===a.hero.plates[0]);}
  function assetSrc(path) {return project.assets?.[path] || (/^(data:|blob:|\/)/.test(path)?path:'/'+path);}
  function thumbnail(a) {return assetSrc(mediaFor(a)?.src || '');}
  function update() {
    $('projectTitle').value=project.show.title||project.show.show_id;$('previewTitle').textContent=project.show.title||'Untitled exchange';
    $('mediaCount').textContent=project.media.length+' images';$('timelineCount').textContent=`${project.show.atoms.length} clips · ${duration().toFixed(2)}s`;
    $('emptyStage').hidden=!!project.show.atoms.length;$('stageLabel').hidden=!project.show.atoms.length;
    $('undo').disabled=historyIndex<=0;$('redo').disabled=historyIndex>=history.length-1;
    ['play','previous','next','restart','exportOpen','fitFive'].forEach(id=>$(id).disabled=!project.show.atoms.length||recording);
    ['duplicate','delete'].forEach(id=>$(id).disabled=!atom());
    renderMedia();renderTimeline();renderInspector();updateTransport();
  }
  function renderMedia() {
    const query=$('mediaSearch').value.toLowerCase();$('mediaGrid').replaceChildren();
    project.media.filter(m=>m.name.toLowerCase().includes(query)).forEach(m=>{
      const card=document.createElement('div');card.className='media-card'+(mediaFor(atom())?.id===m.id?' selected':'');
      card.innerHTML=`<button class="media-image" title="Use ${esc(m.name)} in selected clip" aria-label="Use ${esc(m.name)} in selected clip"><img src="${esc(assetSrc(m.src))}" alt="${esc(m.name)}"></button><div class="media-meta"><span>${esc(m.name)}</span><button class="media-add" title="Add ${esc(m.name)} to timeline" aria-label="Add ${esc(m.name)} to timeline">＋</button></div>`;
      card.querySelector('.media-image').onclick=safe(()=>{if(!atom())return addMedia(m);edit(()=>{atom().hero={layout_source:m.layoutSource,plates:[m.plateId]};atom().plates_needed=1;});replacing=false;document.querySelector('.inspector').dataset.replacing='false';status('Replaced selected plate with '+m.name);});
      card.querySelector('.media-add').onclick=safe(()=>addMedia(m));$('mediaGrid').append(card);
    });
  }
  function addMedia(m) {edit(()=>{project.show.atoms.push({id:uid(),label:m.name,kind:'duo',duration_s:.5,plates_needed:1,pose_mode:'hero',motion:{family:'fight',beat_class:'straight'},hero:{layout_source:m.layoutSource,plates:[m.plateId]},camera:{preset:'static_hold'},fx_hooks:[]});selected=project.show.atoms.length-1;time=startOf(selected);});}
  function renderTimeline() {
    const d=duration();$('timelineClips').replaceChildren();
    project.show.atoms.forEach((a,i)=>{
      const b=document.createElement('button');b.className='timeline-clip'+(selected===i?' active':'');b.style.flex=a.duration_s+' 0 0';b.draggable=true;b.dataset.index=i;
      b.setAttribute('aria-label',`${i+1}. ${a.label||a.id}, ${a.duration_s.toFixed(2)} seconds`);b.setAttribute('aria-pressed',String(i===selected));
      b.innerHTML=`<img src="${esc(thumbnail(a))}" alt=""><span class="clip-label">${esc(String(i+1).padStart(2,'0')+' '+(a.label||a.id))}</span><span class="clip-duration">${a.duration_s.toFixed(2)}s</span>`;
      b.onclick=()=>select(i);b.ondragstart=e=>{dragIndex=i;e.dataTransfer.setData('text/plain',String(i));e.dataTransfer.effectAllowed='move';};b.ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='move';};
      b.ondrop=safe(e=>{e.preventDefault();if(dragIndex<0||dragIndex===i)return;edit(()=>{const [a]=project.show.atoms.splice(dragIndex,1);project.show.atoms.splice(i,0,a);selected=i;time=startOf(i);});dragIndex=-1;});
      b.ondragend=()=>{dragIndex=-1;};$('timelineClips').append(b);
    });
    $('ruler').replaceChildren();for(let i=0;i<=5;i++){const s=document.createElement('span');s.textContent=(d*i/5).toFixed(d<10?1:0)+'s';s.style.left=i*20+'%';$('ruler').append(s);}
    $('scrub').max=d||1;
  }
  function renderInspector() {
    const a=atom();$('inspectorEmpty').hidden=!!a;$('inspectorContent').hidden=!a;$('clipIndex').textContent=a?`${String(selected+1).padStart(2,'0')} / ${String(project.show.atoms.length).padStart(2,'0')}`:'—';if(!a)return;
    $('clipThumbnail').src=thumbnail(a);$('clipName').value=a.label||a.id;$('duration').value=+a.duration_s.toFixed(4);$('timingHint').textContent=`${startOf(selected).toFixed(2)}s → ${(startOf(selected)+a.duration_s).toFixed(2)}s`;
    $('camera').value=a.camera?.preset||'static_hold';const n=a.camera?.nudge||{};$('zoom').value=n.s||0;$('zoomValue').textContent=Math.round((n.s||0)*100)+'%';$('panX').value=n.x||0;$('panY').value=n.y||0;$('caption').value=a.caption||'';
    const effect=a.fx_hooks?.[0]?.type||'none';document.querySelectorAll('[data-effect]').forEach(b=>{b.classList.toggle('active',b.dataset.effect===effect);b.setAttribute('aria-pressed',String(b.dataset.effect===effect));});
  }
  function select(i) {if(recording)return;pause();selected=Math.max(0,Math.min(i,project.show.atoms.length-1));time=startOf(selected);renderTimeline();renderInspector();renderMedia();draw();}
  function updateTransport() {const d=duration();$('scrub').value=time;$('playhead').style.left=(d?time/d*100:0)+'%';$('timecode').innerHTML=`${format(time)} <span>/ ${format(d)}</span>`;$('play').textContent=preparing?'…':playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',preparing?'Cancel playback preparation':playing?'Pause':'Play');const i=activeAt(Math.min(time,d-.00001));const a=project.show.atoms[i];$('stageLabel').textContent=a?`${a.hero.plates[0]} · ${a.label||a.id}`:'';}
  function draw() {renderer?.render(time);updateTransport();}
  function pause() {playing=false;preparing=false;playToken++;cancelAnimationFrame(playbackFrame);if(project)updateTransport();}
  function tick(now) {if(!playing)return;time=timeStart+(now-clockStart)/1000;const d=duration();if(time>=d){if(looping){time%=d;timeStart=time;clockStart=now;}else{time=d;playing=false;}}draw();if(playing)playbackFrame=requestAnimationFrame(tick);}
  async function play() {if(!duration()||recording)return;if(playing||preparing){pause();return;}const token=++playToken;preparing=true;updateTransport();try{if(!renderer||renderedVersion!==compileVersion)await compile();if(token!==playToken||!renderer)return;if(time>=duration()-.001)time=0;timeStart=time;clockStart=performance.now();playing=true;playbackFrame=requestAnimationFrame(tick);}finally{if(token===playToken){preparing=false;updateTransport();}}}
  function setDuration(next) {if(!Number.isFinite(next)||next<.1)throw new Error('Use a clip duration of at least 0.1 seconds.');edit(()=>{const a=atom();a.duration_s=+next.toFixed(4);if(a.camera?.segments){const sum=a.camera.segments.reduce((s,x)=>s+x.dur_s,0);a.camera.segments.forEach(s=>s.dur_s=s.dur_s/sum*next);}time=startOf(selected);});}
  function duplicate() {if(!atom())return;edit(()=>{const a=copy(atom());a.id=uid();a.label=(a.label||'Clip')+' copy';project.show.atoms.splice(selected+1,0,a);selected++;time=startOf(selected);});}
  function remove() {if(!atom())return;edit(()=>{project.show.atoms.splice(selected,1);selected=Math.min(selected,project.show.atoms.length-1);time=selected<0?0:startOf(selected);});}
  async function importImages(files) {
    if(!files.length)return;const before=copy(project);
    try {
      const items=[];
      for(const file of [...files].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}))) {
        if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Choose PNG, JPG or WebP images.');
        if(file.size>20*1024*1024)throw new Error(file.name+' is larger than 20 MB.');
        const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
        const im=new Image();im.src=data;await im.decode();const id=uid();
        items.push({id,name:file.name.replace(/\.[^.]+$/,''),src:data,layoutSource:'embedded/'+id+'/layout.json',plateId:'P01'});
      }
      edit(()=>{for(const m of items){project.media.push(m);project.layouts[m.layoutSource]={[m.plateId]:{full:m.src}};}if(!project.show.atoms.length){for(const m of items)project.show.atoms.push({id:uid(),label:m.name,kind:'duo',duration_s:.5,plates_needed:1,pose_mode:'hero',motion:{family:'fight',beat_class:'straight'},hero:{layout_source:m.layoutSource,plates:[m.plateId]},camera:{preset:'static_hold'},fx_hooks:[]});selected=0;time=0;}});
      status(`Imported ${items.length} images · Saved with this project on your device`);
    } catch(e) {project=before;update();throw e;} finally {$('imageInput').value='';}
  }
  function download(name,blob) {const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),30000);}
  async function boot() {
    [presets,effects]=await Promise.all([json('/presets/camera_presets.json'),json('/presets/fx_presets.json')]);
    $('camera').replaceChildren();for(const simple of [true,false]){const group=document.createElement('optgroup');group.label=simple?'Simple moves':'Original fight cameras';for(const p of presets.presets.filter(p=>!!p.label===simple)){const o=document.createElement('option');o.value=p.id;o.textContent=p.label||p.id.replaceAll('_',' ');group.append(o);}$('camera').append(group);}
    let saved;try{saved=await HMAssetStore.get('active');}catch(_){}
    const sid=new URLSearchParams(location.search).get('show');
    if(saved&&(!sid||sid===saved.show.show_id)){try{await load(saved);}catch(e){status('Saved draft could not load: '+e.message,true);await load(await builtIn(DEMO));}}
    else if(sid&&![DEMO,ORIGINAL,CONTINUATION].includes(sid)){await load(await builtIn(DEMO));status('Requested project is not stored here. Open its saved project JSON.',true);}
    else await load(await builtIn(sid||DEMO));
    const requestedTime=Number(new URLSearchParams(location.search).get('t'));if(Number.isFinite(requestedTime)){time=Math.min(duration(),Math.max(0,requestedTime));draw();}
  }
  on('loadDemo',async()=>load(await builtIn(DEMO)));on('loadOriginal',async()=>load(await builtIn(ORIGINAL)));on('loadExtended',async()=>load(await builtIn(CONTINUATION)));
  on('newProject',()=>load({version:1,show:{show_id:'motion-'+Date.now(),title:'Untitled exchange',compose_mode:'parity',parity_mode:true,chars:{L:{name:'Left'},R:{name:'Right'}},bg:{},atoms:[],overlays:[]},layouts:copy(project.layouts),media:copy(project.media),assets:copy(project.assets||{})}));
  on('importImages',()=>$('imageInput').click());on('emptyAdd',()=>$('imageInput').click());$('imageInput').onchange=safe(e=>importImages(e.target.files));
  $('mediaSearch').oninput=renderMedia;
  on('play',play);on('restart',()=>{pause();time=0;draw();});on('previous',()=>select(Math.max(0,(activeAt(Math.min(time,duration()-.0001))) - 1)));on('next',()=>select(Math.min(project.show.atoms.length-1,activeAt(Math.min(time,duration()-.0001))+1)));
  on('loop',()=>{looping=!looping;$('loop').setAttribute('aria-pressed',String(looping));});
  on('fullscreen',async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await $('stage').requestFullscreen();});
  $('scrub').oninput=()=>{const value=+$('scrub').value;pause();time=value;draw();};$('ruler').onclick=e=>{pause();time=duration()*Math.max(0,Math.min(1,(e.clientX-$('ruler').getBoundingClientRect().left)/$('ruler').clientWidth));draw();};
  on('undo',()=>restore(-1));on('redo',()=>restore(1));on('duplicate',duplicate);on('delete',remove);
  on('fitFive',()=>{const d=duration();if(!d)return;const factor=5/d;if(project.show.atoms.some(a=>a.duration_s*factor<.1))throw new Error('Too many short clips to fit in five seconds. Remove clips first.');edit(()=>{let total=0;project.show.atoms.forEach((a,i)=>{const next=i===project.show.atoms.length-1?5-total:+(a.duration_s*factor).toFixed(4);if(a.camera?.segments)a.camera.segments.forEach(s=>s.dur_s=s.dur_s/a.duration_s*next);a.duration_s=next;total+=next;});time=0;});status('Timeline fitted to exactly 5.00 seconds');});
  $('projectTitle').onchange=safe(()=>edit(()=>{project.show.title=$('projectTitle').value.trim()||'Untitled exchange';}));
  $('clipName').onchange=safe(()=>edit(()=>{atom().label=$('clipName').value;}));$('caption').onchange=safe(()=>edit(()=>{atom().caption=$('caption').value;}));
  $('duration').onchange=safe(()=>setDuration(+$('duration').value));on('shorter',()=>setDuration(atom().duration_s-.1));on('longer',()=>setDuration(atom().duration_s+.1));
  $('camera').onchange=safe(()=>edit(()=>{atom().camera={preset:$('camera').value,nudge:atom().camera?.nudge||{}};}));
  for(const [id,key] of [['zoom','s'],['panX','x'],['panY','y']])$(id).onchange=safe(()=>{const v=+$(id).value;if(!Number.isFinite(v)||v<+$(id).min||v>+$(id).max)throw new Error(`Use ${id} between ${$(id).min} and ${$(id).max}.`);edit(()=>{const a=atom();a.camera ||= {preset:'static_hold'};a.camera.nudge||={};a.camera.nudge[key]=v;});});
  $('zoom').oninput=()=>$('zoomValue').textContent=Math.round(+$('zoom').value*100)+'%';
  on('resetCamera',()=>edit(()=>{atom().camera={preset:'static_hold'};}));
  document.querySelectorAll('[data-effect]').forEach(b=>b.onclick=safe(()=>edit(()=>{const type=b.dataset.effect;atom().fx_hooks=type==='none'?[]:[{type,t_rel:.08,params:type==='shake'?{amp:5,dur:.15}:type==='dust'?{k:1}:{}}];})));
  on('replaceImage',()=>{replacing=!replacing;document.querySelector('.inspector').dataset.replacing=String(replacing);document.querySelector('.library').scrollIntoView({behavior:'smooth',block:'nearest'});status(replacing?'Choose a library image to replace this plate.':'Plate replacement cancelled.');});
  on('helpOpen',()=>$('helpDialog').showModal());
  document.addEventListener('keydown',safe(async e=>{
    if(recording||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||document.querySelector('dialog[open]'))return;
    const mod=e.metaKey||e.ctrlKey;
    if(e.code==='Space'){e.preventDefault();await play();}else if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();restore(e.shiftKey?1:-1);}else if(mod&&e.key.toLowerCase()==='s'){e.preventDefault();$('saveProject').click();}else if(mod&&e.key.toLowerCase()==='d'){e.preventDefault();duplicate();}else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();}else if(e.key==='ArrowLeft'){e.preventDefault();$('previous').click();}else if(e.key==='ArrowRight'){e.preventDefault();$('next').click();}else if(e.key==='Home'){e.preventDefault();$('restart').click();}else if(e.key==='?')$('helpDialog').showModal();
  }));
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&!recording)pause();});
  window.HMStudio={get project(){return copy(project);},get composed(){return copy(result);},get time(){return time;},get playing(){return playing;},compile,renderAt(t){pause();time=Math.min(duration(),Math.max(0,t));draw();},load,download,safe,on,$,copy,get renderer(){return renderer;},pause,get duration(){return duration();},get recording(){return recording;},set recording(v){recording=v;},update};
  window.ready=boot().catch(e=>{status('Could not open editor: '+e.message,true);throw e;});
})();

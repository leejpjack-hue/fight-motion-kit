/* Background images and motion can inherit project defaults or belong to a clip. */
(() => {
  const S=window.HMStudio,{$,on,safe}=S,C=window.HMComposeClient;
  let spanOpenOverride=null,lastSpanScopeKey='',lastSpanAuthored=false,packsDoc=null;
  fetch('/presets/bg_motion_packs.json').then(r=>{if(!r.ok)throw Error('missing');return r.json();}).then(doc=>{packsDoc=doc;if(S.project)refresh();}).catch(()=>{packsDoc=null;});
  const resolve=(p,src)=>p.assets?.[src]||(/^(data:|blob:|\/)/.test(src)?src:'/'+src);
  let preferPlayhead=false;
  const locationList=global=>global&&Object.prototype.hasOwnProperty.call(global,'locations')&&Array.isArray(global.locations)?global.locations:null;
  const rowAtTime=(rows,t)=>(rows||[]).find(row=>t>=row.t0&&t<row.t1)||null;
  const selected=p=>p.show.atoms[S.selectedIndex];
  const entryFor=(p,a)=>a?p.layouts[a.hero.layout_source]?.[a.hero.plates[0]]:null;
  function context(){const p=S.project;return {projectId:p.show.show_id,scope:$('backgroundScope').value,atomId:selected(p)?.id,key:$('backgroundTarget').value,locationId:$('backgroundLocation').value};}
  function edit(c,fn){
    S.editProject(p=>{
      if(p.show.show_id!==c.projectId)throw Error('Project changed. Choose the background again.');
      if(c.scope!=='clip')throw Error('Project background edits go through one writer.');
      const a=p.show.atoms.find(a=>a.id===c.atomId);if(!a)throw Error('Select a clip for this background.');
      a.background||={};fn(a.background,p,'src');if(!Object.keys(a.background).length)delete a.background;
    });
  }
  function writeProject(c,command){
    S.editProject(p=>{
      if(p.show.show_id!==c.projectId)throw Error('Project changed. Choose the background again.');
      C.applyBackgroundEdit(p.show,command);
    });
  }
  function projectLayer(p,a){
    const layout=S.composed?.layout,compiled=layout&&Object.values(layout).find(l=>l.atom===a?.id);
    const t=p.show.atoms.slice(0,S.selectedIndex).reduce((sum,a)=>sum+a.duration_s,0);
    return compiled?.bg||(p.show.bg?.swap&&t>=p.show.bg.swap_t?'swap':'base');
  }
  function projectImage(p,a){const rows=locationList(p.show.bg||{});if(rows){const row=rowAtTime(rows,S.time);return row?row.src:null;}return p.show.bg?.[projectLayer(p,a)];}
  // HM-BG-CROP: crop rect for the current scope; null means full frame.
  function currentCrop(p,c){
    const a=p.show.atoms.find(a=>a.id===c.atomId),global=p.show.bg||{},rows=locationList(global);
    if(c.scope==='clip'){
      const own=a?.background||{};
      if(own.crop)return own.crop;
      if(Object.hasOwn(own,'src'))return null;
      if(rows)return rowAtTime(rows,S.time)?.crop||null;
      return global.crops?.[projectLayer(p,a)]||null;
    }
    if(rows){const row=rows.find(r=>r.id===c.locationId)||rows[0];return row?.crop||null;}
    return global.crops?.[c.key]||null;
  }
  function fillLocations(rows){
    const sel=$('backgroundLocation'),prev=sel.value;
    sel.replaceChildren();
    rows.forEach(row=>{
      const name=row.src?'Image':'White';
      sel.add(new Option(name+' '+Number(row.t0).toFixed(2)+'-'+Number(row.t1).toFixed(2)+'s',row.id));
    });
    if(preferPlayhead){
      preferPlayhead=false;
      const hit=rowAtTime(rows,S.time);
      if(hit)sel.value=hit.id;
    }else if([...sel.options].some(o=>o.value===prev))sel.value=prev;
    else if(rows[0])sel.value=rows[0].id;
  }
  function refresh(){
    const p=S.project;if(!p)return;
    const a=selected(p),scope=$('backgroundScope');scope.options[0].disabled=!a;if(!a)scope.value='project';
    const clip=scope.value==='clip',global=p.show.bg||{},rows=locationList(global),schedule=!clip&&!!rows,target=$('backgroundTarget');
    if(schedule)fillLocations(rows);
    const loc=schedule?(rows.find(r=>r.id===$('backgroundLocation').value)||rows[0]||null):null;
    $('backgroundLocation').hidden=!schedule;
    $('backgroundLocationActions').hidden=clip;
    $('removeBackgroundLocation').hidden=!schedule;
    $('backgroundWindow').hidden=!schedule;
    target.options[1].hidden=!global.swap;target.hidden=clip||schedule||!global.swap;
    if(target.value==='swap'&&!global.swap)target.value='base';
    const settings=clip?(a?.background||{}):(schedule?(loc||{}):global);
    const inherited=clip&&!Object.hasOwn(settings,'src'),src=clip?(inherited?projectImage(p,a):settings.src):(schedule?(loc?loc.src:null):global[target.value]);
    $('backgroundClipLabel').textContent=clip?'Clip '+(S.selectedIndex+1):'All inheriting clips';
    $('backgroundThumb').hidden=!src;$('backgroundPlaceholder').hidden=!!src;
    if(src){const url=resolve(p,src);if($('backgroundThumb').getAttribute('src')!==url)$('backgroundThumb').src=url;}else $('backgroundThumb').removeAttribute('src');
    $('backgroundPlaceholder').textContent='White canvas';$('removeBackground').disabled=!src;
    $('backgroundCropControls').hidden=!src;$('backgroundCropRect').hidden=!src;
    if(src&&!drag)showCrop(currentCrop(p,context()));
    $('inheritBackground').hidden=!clip;$('inheritBackground').disabled=inherited&&settings.key_white===undefined&&!settings.crop;
    const keyWhite=(clip?settings.key_white:undefined)??global.key_white??false;
    $('backgroundKeyWhite').checked=keyWhite;$('backgroundKeyWhite').disabled=!src;
    const m=clip?(settings.motion??(locationList(global)?rowAtTime(locationList(global),S.time)?.motion:global.motion)):(schedule?loc?.motion:settings.motion),preset=m?.preset||'follow_camera',cropNow=currentCrop(p,context());
    const support=backgroundMotionSupport(cropNow),motionSel=$('backgroundMotion');
    for(const opt of motionSel.options)opt.disabled=false;
    motionSel.value=preset;
    for(const opt of motionSel.options){const info=support[opt.value];opt.disabled=!!(info&&!info.ok);opt.title=info&&!info.ok?info.reason:'';}
    $('backgroundMotionValue').textContent=Math.round((m?.amount??.4)*100)+'%';
    const amountEl=$('backgroundMotionAmount');if(document.activeElement!==amountEl)amountEl.value=String(m?.amount??.4);
    const packNote=$('backgroundMotionPackNote');if(packNote)packNote.textContent=packCopy($('backgroundMotionPack').value,clip);
    const blocked=!!(support[preset]&&!support[preset].ok);
    const cNow=context(),scopeKey=`${cNow.projectId}:${cNow.scope}:${cNow.scope==='clip'?cNow.atomId:(schedule?cNow.locationId:cNow.key)}`;
    const baseSpanUi=C.resolveBackgroundSpanUi(m,showSeconds(p),null);
    if(scopeKey!==lastSpanScopeKey||!baseSpanUi.continuous||baseSpanUi.authored!==lastSpanAuthored){
      spanOpenOverride=null;
      lastSpanScopeKey=scopeKey;
      lastSpanAuthored=baseSpanUi.authored;
    }
    const spanUi=C.resolveBackgroundSpanUi(m,showSeconds(p),spanOpenOverride);
    const travel=spanUi.travel;
    $('backgroundMotionAmount').disabled=!travel||blocked;
    const clockSel=$('backgroundMotionClock');
    clockSel.querySelector('option[value="span"]').hidden=!travel;
    clockSel.value=spanUi.clock;clockSel.disabled=!travel;
    const spanBox=$('backgroundSpanControls');
    spanBox.hidden=!spanUi.continuous;
    spanBox.dataset.spanOpen=String(spanUi.open);
    spanBox.dataset.spanMode=spanUi.clock;
    spanBox.dataset.spanOverrun=String(spanUi.exceedsShow);
    $('backgroundSpanDrawer').hidden=!spanUi.open;
    const spanToggle=$('backgroundSpanToggle');
    spanToggle.textContent=spanUi.toggleLabel;
    spanToggle.setAttribute('aria-expanded',String(spanUi.open));
    const spanState=$('backgroundSpanState');
    spanState.textContent=spanUi.stateLabel;
    spanState.dataset.spanOpen=String(spanUi.open);
    spanState.dataset.spanOverrun=String(spanUi.exceedsShow);
    ['backgroundSpanT0','backgroundSpanT1','backgroundSpanT0Range','backgroundSpanT1Range'].forEach((id,i)=>{const el=$(id);if(document.activeElement!==el)el.value=String(i%2?spanUi.t1:spanUi.t0);});
    if(schedule&&loc)['backgroundT0','backgroundT1'].forEach((id,i)=>{const el=$(id);if(document.activeElement!==el)el.value=String(i?loc.t1:loc.t0);});
    $('backgroundSpanValue').textContent=spanUi.valueLabel;
    $('resetBackgroundSpan').disabled=!spanUi.authored;
    $('resetBackgroundMotion').disabled=!settings.motion;$('resetBackgroundMotion').textContent=clip?'Use project motion':'Reset motion';
    const note=motionCopy(cropNow,preset,spanUi.honestyLabel);$('backgroundMotionNote').textContent=note.text;$('backgroundMotionNote').classList.toggle('is-blocked',note.blocked);
    const library=$('backgroundLibrary');library.replaceChildren(new Option('Use library image…',''));
    p.media.forEach(m=>library.add(new Option(m.name,m.id)));
    const prefix=clip?(inherited?'Using project image. ':'Only clip '+(S.selectedIndex+1)+'. '):(schedule?'This time window for clips without their own image. ':'Project default for clips without an override. ');
    $('backgroundNotice').textContent=prefix+(!src?'Choose an image or use a library image.':entryFor(p,a)?.full?(keyWhite?'Edge-connected white is removed in previews and exports.':'Opaque plates cover the background. Use transparent PNGs or enable white-backdrop removal for white plates.'):'Background appears behind transparent plates.');
  }
  async function read(file){
    if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose a PNG, JPG or WebP background.');
    if(file.size>20*1024*1024)throw Error('Background image must be 20 MB or smaller.');
    const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(file);});
    const im=new Image();im.src=data;await im.decode();return data;
  }
  async function hasWhiteBackdrop(p,a){
    const entry=entryFor(p,a);if(!entry?.full)return false;
    const dir=a.hero.layout_source.slice(0,a.hero.layout_source.lastIndexOf('/')+1);
    const src=/^(data:|blob:|\/)/.test(entry.full)?entry.full:dir+entry.full;
    const im=new Image();im.src=resolve(p,src);await im.decode();
    const c=document.createElement('canvas');c.width=c.height=16;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0,16,16);
    return [[0,0],[15,0],[0,15],[15,15]].every(([x,y])=>{const d=g.getImageData(x,y,1,1).data;return d[3]>250&&Math.min(d[0],d[1],d[2])>=245;});
  }
  async function setImage(c,src,data){
    const p=S.project,a=p.show.atoms.find(a=>a.id===c.atomId),autoKey=await hasWhiteBackdrop(p,a);
    if(c.scope==='clip'){
      edit(c,(settings,next)=>{
        if(data){next.assets||={};next.assets[src]=data;}settings.src=src;delete settings.crop;
        if(settings.key_white==null&&autoKey)settings.key_white=true;
      });
      return;
    }
    S.editProject(proj=>{
      if(proj.show.show_id!==c.projectId)throw Error('Project changed. Choose the background again.');
      if(data){proj.assets||={};proj.assets[src]=data;}
      const command=locationList(proj.show.bg||{})?{op:'update-location',id:c.locationId,patch:{src}}:{op:'set-pair-image',key:c.key,src};
      if(autoKey)command.ensureKeyWhite=true;
      C.applyBackgroundEdit(proj.show,command);
    });
  }
  on('changeBackground',()=>$('backgroundInput').click());
  $('backgroundInput').onchange=safe(async e=>{
    const file=e.target.files[0];if(!file)return;
    try{const c=context(),data=await read(file),ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[file.type];await setImage(c,'backgrounds/'+crypto.randomUUID()+'.'+ext,data);}
    finally{e.target.value='';}
  });
  $('backgroundLibrary').onchange=safe(async e=>{const c=context(),m=S.project.media.find(m=>m.id===e.target.value);if(m)await setImage(c,m.src);});
  on('removeBackground',()=>{const c=context();if(c.scope==='clip')edit(c,s=>{delete s.crop;s.src=null;delete s.key_white;});else if(locationList(S.project.show.bg||{}))writeProject(c,{op:'update-location',id:c.locationId,patch:{src:null}});else writeProject(c,{op:'remove-pair-image',key:c.key});});
  on('inheritBackground',()=>edit(context(),s=>{delete s.src;delete s.key_white;delete s.crop;}));
  $('backgroundKeyWhite').onchange=safe(()=>{const enabled=$('backgroundKeyWhite').checked,c=context();if(c.scope==='clip')edit(c,s=>s.key_white=enabled);else writeProject(c,{op:'set-key-white',value:enabled});});
  const traveling=preset=>!['follow_camera','static'].includes(preset);
  function showSeconds(p){return Math.round((p.show.atoms||[]).reduce((s,a)=>s+(+a.duration_s||0),0)*10000)/10000;}
  function readSpan(m){
    if(!m)return null;
    const span=m.span,t0=Array.isArray(span)?span[0]:span&&typeof span==='object'?span.t0:m.t0,t1=Array.isArray(span)?span[1]:span&&typeof span==='object'?span.t1:m.t1;
    return Number.isFinite(+t0)&&Number.isFinite(+t1)&&+t1>+t0?[+t0,+t1]:null;
  }
  function spanFromFields(){
    const t0=Math.round(Number($('backgroundSpanT0').value)*10000)/10000,t1=Math.round(Number($('backgroundSpanT1').value)*10000)/10000;
    if(!Number.isFinite(t0)||!Number.isFinite(t1)||t0<0||!(t1>t0))throw Error('Span end must be after its start.');
    return {t0,t1};
  }
  function travelNote(honestyLabel){
    const clock=$('backgroundMotionClock').value;
    if(clock==='per_atom')return ' Per clip: the move restarts at each cut.';
    if(clock==='span'){
      const t0=Number($('backgroundSpanT0').value),t1=Number($('backgroundSpanT1').value);
      const base=Number.isFinite(t0)&&t1>t0?` Continuous (span): one move from ${t0.toFixed(2)}s to ${t1.toFixed(2)}s.`:' Continuous (span): one move over the authored times.';
      return honestyLabel?base+' '+honestyLabel+'.':base;
    }
    return ' Continuous (show): one move across the whole show.';
  }
  function packCopy(id,clip){
    const where=clip?'this clip':'the project default';
    if(id==='hold')return 'Hold keeps the crop still on '+where+', aligned to a micro-cut. The clip camera stays.';
    if(id==='slow-pan')return 'Slow pan slides the crop once across the show on '+where+', aligned to a dialogue hold. The clip camera stays.';
    if(id==='accent-pan')return 'Accent pan restarts a stronger move on '+where+', aligned to an impact hold. The clip camera stays.';
    return clip?'Match rhythm writes hold, slow pan, or accent pan on this clip from its timing hold. The clip camera stays.':'Match rhythm writes hold, slow pan, or accent pan on every clip that already has a timing hold. The clip camera stays.';
  }
  function motionCopy(crop,preset,honestyLabel){
    const info=(backgroundMotionSupport(crop)||{})[preset]||{ok:false,reason:'This background motion is not available.'};
    if(!info.ok)return {blocked:true,text:info.reason};
    if(preset==='follow_camera')return {blocked:false,text:'Follows the clip camera, including shake, inside this crop.'};
    if(preset==='static')return {blocked:false,text:'Holds the crop still while the clip camera and shake move the plates.'};
    const mode=backgroundMotionFrame(crop,preset,1,1).mode,travel=travelNote(honestyLabel);
    if(mode==='inset')return {blocked:false,text:'This crop fills the source, so the move zooms in slightly and slides that view.'+travel};
    if(String(preset).startsWith('pan_'))return {blocked:false,text:'Slides the crop window across the source. Plates stay put.'+travel};
    if(preset==='push_in')return {blocked:false,text:'Zooms into the crop by tightening the window.'+travel};
    if(preset==='pull_out')return {blocked:false,text:'Zooms out by widening the window across the rest of the source.'+travel};
    return {blocked:false,text:''};
  }
  function changeMotion(){
    try{
      const preset=$('backgroundMotion').value,amount=Number($('backgroundMotionAmount').value),clock=$('backgroundMotionClock').value;
      const motion={preset,amount};
      if(traveling(preset)){
        if(clock==='per_atom')motion.clock='per_atom';
        else if(clock==='span'){motion.clock='span';motion.span=spanFromFields();}
        else motion.clock='show';
      }
      const c=context();
      if(c.scope==='clip')edit(c,s=>s.motion=motion);
      else if(locationList(S.project.show.bg||{}))writeProject(c,{op:'update-location',id:c.locationId,patch:{motion}});
      else writeProject(c,{op:'set-pair-motion',motion});
    }catch(e){refresh();throw e;}
  }
  function changeSpan(){spanOpenOverride=true;$('backgroundMotionClock').value='span';changeMotion();}
  $('backgroundMotionPack').onchange=()=>{const p=S.project;if(!p)return;const clip=$('backgroundScope').value==='clip';$('backgroundMotionPackNote').textContent=packCopy($('backgroundMotionPack').value,clip);};
  on('applyBackgroundMotionPack',()=>{
    if(!packsDoc)throw Error('Load the shipped bg_motion_packs.json.');
    const packId=$('backgroundMotionPack').value,c=context(),show=S.project&&S.project.show;
    if(!show)throw Error('Choose a project before applying a background motion pack.');
    const idx=show.atoms.findIndex(a=>a.id===c.atomId);
    const opts={packs:packsDoc};
    if(packId==='rhythm'){if(c.scope==='clip'){if(idx<0)throw Error('Select a clip before applying a background motion pack.');opts.indices=[idx];}}
    else if(c.scope==='clip'){if(idx<0)throw Error('Select a clip before applying a background motion pack.');opts.scope='clip';opts.indices=[idx];}
    else if(locationList(show.bg||{})){opts.scope='location';opts.locationId=c.locationId;}
    else opts.scope='project';
    S.editProject(project=>{
      if(project.show.show_id!==c.projectId)throw Error('Project changed. Choose the background again.');
      const next=C.applyBgMotionPack(project.show,packId,opts);
      project.show.bg=next.bg;project.show.atoms=next.atoms;
    });
  });
  $('backgroundMotion').onchange=safe(()=>{spanOpenOverride=null;changeMotion();});
  $('backgroundMotionAmount').onchange=safe(changeMotion);
  $('backgroundMotionClock').onchange=safe(()=>{spanOpenOverride=$('backgroundMotionClock').value==='span'?true:false;changeMotion();});
  $('backgroundSpanT0').onchange=safe(changeSpan);$('backgroundSpanT1').onchange=safe(changeSpan);
  function commitSpanRange(which){
    const rangeId=which==='t0'?'backgroundSpanT0Range':'backgroundSpanT1Range';
    const numId=which==='t0'?'backgroundSpanT0':'backgroundSpanT1';
    $(numId).value=$(rangeId).value;
    changeSpan();
  }
  $('backgroundSpanT0Range').onchange=safe(()=>commitSpanRange('t0'));
  $('backgroundSpanT1Range').onchange=safe(()=>commitSpanRange('t1'));
  on('backgroundSpanToggle',()=>{
    const p=S.project;if(!p)return;
    const c=context(),a=selected(p),clip=c.scope==='clip',global=p.show.bg||{},rows=locationList(global),schedule=!clip&&!!rows;
    const loc=schedule?(rows.find(r=>r.id===c.locationId)||rows[0]):null;
    const settings=clip?(a?.background||{}):(schedule?(loc||{}):global);
    const m=clip?(settings.motion??(rows?rowAtTime(rows,S.time)?.motion:global.motion)):(schedule?loc?.motion:settings.motion);
    const cur=C.resolveBackgroundSpanUi(m,showSeconds(p),spanOpenOverride);
    if(!cur.continuous)return;
    spanOpenOverride=!cur.open;
    refresh();
  });
  on('resetBackgroundSpan',()=>{spanOpenOverride=false;$('backgroundMotionClock').value='show';changeMotion();});
  on('resetBackgroundMotion',()=>{spanOpenOverride=null;const c=context();if(c.scope==='clip')edit(c,s=>delete s.motion);else if(locationList(S.project.show.bg||{}))writeProject(c,{op:'update-location',id:c.locationId,patch:{motion:null}});else writeProject(c,{op:'set-pair-motion',motion:null});});
  // ---- HM-BG-CROP: editable crop region (drag-rect, corner handles, numeric fields) ----
  const pct=v=>Math.round(v*1000)/10;
  let drag=null;
  function imageAspect(){const im=$('backgroundThumb');return im.naturalWidth&&im.naturalHeight?im.naturalWidth/im.naturalHeight:16/9;}
  const cropAspectK=()=>imageAspect()/(16/9); // normalized h = w * k for a 16:9 visible region
  function showCrop(c){
    const r=c||C.BG_CROP_FULL,box=$('backgroundCropRect').style;
    box.left=r.x*100+'%';box.top=r.y*100+'%';box.width=r.w*100+'%';box.height=r.h*100+'%';
    [['X','x'],['Y','y'],['W','w'],['H','h']].forEach(([id,k])=>{const el=$('backgroundCrop'+id);if(document.activeElement!==el)el.value=pct(r[k]);});
    $('backgroundCropValue').textContent=C.isFullBackgroundCrop(r)?'Full frame':`${pct(r.w)}% × ${pct(r.h)}% @ ${pct(r.x)}, ${pct(r.y)}`;
    $('resetBackgroundCrop').disabled=C.isFullBackgroundCrop(r);
  }
  function commitCrop(rect){
    const c=context(),r=C.clampBackgroundCrop(rect),full=C.isFullBackgroundCrop(r);
    if(c.scope==='clip'){
      edit(c,(s,p)=>{
        const a=p.show.atoms.find(a=>a.id===c.atomId),rows=locationList(p.show.bg||{});
        const inherited=Object.hasOwn(s,'src')?null:(rows?rowAtTime(rows,S.time)?.crop:p.show.bg?.crops?.[projectLayer(p,a)]);
        if(full&&C.isFullBackgroundCrop(inherited))delete s.crop;else s.crop=full?{...C.BG_CROP_FULL}:r;
      });
      return;
    }
    if(locationList(S.project.show.bg||{}))writeProject(c,{op:'update-location',id:c.locationId,patch:{crop:full?null:r}});
    else writeProject(c,{op:'set-pair-crop',key:c.key,crop:full?null:r});
  }
  function pointIn(e){const b=$('backgroundThumb').getBoundingClientRect();return {x:Math.min(1,Math.max(0,(e.clientX-b.left)/(b.width||1))),y:Math.min(1,Math.max(0,(e.clientY-b.top)/(b.height||1)))};}
  // Rect from a fixed anchor corner to the pointer, optionally locked to the stage aspect.
  function anchoredRect(ax,ay,px,py,lock){
    const dx=px>=ax?1:-1,dy=py>=ay?1:-1,maxW=dx>0?1-ax:ax,maxH=dy>0?1-ay:ay;
    let w=Math.abs(px-ax),h=Math.abs(py-ay);
    if(lock){const k=cropAspectK();w=Math.max(w,h/k);h=w*k;if(w>maxW){w=maxW;h=w*k;}if(h>maxH){h=maxH;w=h/k;}}
    w=Math.min(maxW,Math.max(C.BG_CROP_MIN,w));h=Math.min(maxH,Math.max(C.BG_CROP_MIN,h));
    return {x:dx>0?ax:ax-w,y:dy>0?ay:ay-h,w,h};
  }
  const frame=$('backgroundCropFrame');
  frame.addEventListener('pointerdown',e=>{
    if($('backgroundThumb').hidden||e.button!==0)return;
    e.preventDefault();const start=pointIn(e),r=currentCrop(S.project,context())||{...C.BG_CROP_FULL},h=e.target.dataset?.handle;
    if(h)drag={mode:'resize',ax:h.includes('w')?r.x+r.w:r.x,ay:h.includes('n')?r.y+r.h:r.y,rect:r,moved:false};
    else if(e.target.closest('#backgroundCropRect')&&!C.isFullBackgroundCrop(r))drag={mode:'move',start,origin:r,rect:r,moved:false};
    else drag={mode:'draw',ax:start.x,ay:start.y,rect:r,moved:false};
    frame.setPointerCapture?.(e.pointerId);
  });
  frame.addEventListener('pointermove',e=>{
    if(!drag)return;const pt=pointIn(e),lock=$('backgroundCropLock').checked;
    if(drag.mode==='move'){const o=drag.origin;drag.rect=C.clampBackgroundCrop({x:o.x+pt.x-drag.start.x,y:o.y+pt.y-drag.start.y,w:o.w,h:o.h});}
    else{if(drag.mode==='draw'&&!drag.moved&&Math.hypot(pt.x-drag.ax,pt.y-drag.ay)<.01)return;drag.rect=C.clampBackgroundCrop(anchoredRect(drag.ax,drag.ay,pt.x,pt.y,lock));}
    drag.moved=true;showCrop(drag.rect);
  });
  frame.addEventListener('pointerup',safe(async e=>{
    if(!drag)return;const d=drag;drag=null;frame.releasePointerCapture?.(e.pointerId);
    if(!d.moved){refresh();return;}
    commitCrop(d.rect);
  }));
  frame.addEventListener('pointercancel',()=>{drag=null;refresh();});
  const cropFromFields=safe(e=>{
    const v=id=>Number($('backgroundCrop'+id).value)/100;let r=C.clampBackgroundCrop({x:v('X'),y:v('Y'),w:v('W'),h:v('H')});
    if($('backgroundCropLock').checked)r=C.lockBackgroundCropAspect(r,imageAspect(),16/9,e?.target?.id==='backgroundCropH'?'height':'width');
    commitCrop(r);
  });
  ['X','Y','W','H'].forEach(id=>$('backgroundCrop'+id).onchange=cropFromFields);
  $('backgroundCropLock').onchange=safe(()=>{const r=currentCrop(S.project,context());if($('backgroundCropLock').checked&&r&&!C.isFullBackgroundCrop(r))commitCrop(C.lockBackgroundCropAspect(r,imageAspect()));});
  on('resetBackgroundCrop',()=>commitCrop(C.BG_CROP_FULL));
  $('backgroundThumb').addEventListener('load',()=>{if(!drag)refresh();});
  function commitWindow(){
    const c=context(),t0=Math.round(Number($('backgroundT0').value)*10000)/10000,t1=Math.round(Number($('backgroundT1').value)*10000)/10000;
    if(!Number.isFinite(t0)||!Number.isFinite(t1)||t0<0||!(t1>t0))throw Error('Location end must be after its start.');
    writeProject(c,{op:'update-location',id:c.locationId,patch:{t0,t1}});
  }
  $('backgroundT0').onchange=safe(commitWindow);$('backgroundT1').onchange=safe(commitWindow);
  on('insertBackgroundLocation',()=>{const c=context();if(c.scope!=='project')return;preferPlayhead=true;writeProject(c,{op:'insert-location',t:S.time});});
  on('removeBackgroundLocation',()=>{const c=context();if(c.scope!=='project')return;writeProject(c,{op:'remove-location',id:c.locationId});});
  $('backgroundScope').onchange=refresh;$('backgroundTarget').onchange=refresh;$('backgroundLocation').onchange=refresh;
  window.addEventListener('hm:projectchange',refresh);window.ready.then(refresh).catch(()=>{});
})();

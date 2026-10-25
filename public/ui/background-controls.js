/* Background images and motion can inherit project defaults or belong to a clip. */
(() => {
  const S=window.HMStudio,{$,on,safe}=S;
  const resolve=(p,src)=>p.assets?.[src]||(/^(data:|blob:|\/)/.test(src)?src:'/'+src);
  const stem=src=>/^data:/.test(src||'')?'':String(src||'').split('/').pop().replace(/\.[^.]+$/,'');
  const selected=p=>p.show.atoms[S.selectedIndex];
  const entryFor=(p,a)=>a?p.layouts[a.hero.layout_source]?.[a.hero.plates[0]]:null;
  function context(){const p=S.project;return {projectId:p.show.show_id,scope:$('backgroundScope').value,atomId:selected(p)?.id,key:$('backgroundTarget').value};}
  function edit(c,fn){
    S.editProject(p=>{
      if(p.show.show_id!==c.projectId)throw Error('Project changed. Choose the background again.');
      if(c.scope==='clip'){
        const a=p.show.atoms.find(a=>a.id===c.atomId);if(!a)throw Error('Select a clip for this background.');
        a.background||={};fn(a.background,p,'src');if(!Object.keys(a.background).length)delete a.background;
      }else{p.show.bg||={};fn(p.show.bg,p,c.key);}
    });
  }
  function projectLayer(p,a){
    const layout=S.composed?.layout,compiled=layout&&Object.values(layout).find(l=>l.atom===a?.id);
    const t=p.show.atoms.slice(0,S.selectedIndex).reduce((sum,a)=>sum+a.duration_s,0);
    return compiled?.bg||(p.show.bg?.swap&&t>=p.show.bg.swap_t?'swap':'base');
  }
  function projectImage(p,a){return p.show.bg?.[projectLayer(p,a)];}
  // HM-BG-CROP: crop rect for the current scope; null means full frame.
  function currentCrop(p,c){
    const a=p.show.atoms.find(a=>a.id===c.atomId),global=p.show.bg||{};
    if(c.scope==='clip'){const own=a?.background||{};return own.crop||(Object.hasOwn(own,'src')?null:global.crops?.[projectLayer(p,a)])||null;}
    return global.crops?.[c.key]||null;
  }
  function refresh(){
    const p=S.project;if(!p)return;
    const a=selected(p),scope=$('backgroundScope');scope.options[0].disabled=!a;if(!a)scope.value='project';
    const clip=scope.value==='clip',global=p.show.bg||{},settings=clip?(a?.background||{}):global,target=$('backgroundTarget');
    target.options[1].hidden=!global.swap;target.hidden=clip||!global.swap;
    if(target.value==='swap'&&!global.swap)target.value='base';
    const inherited=clip&&!Object.hasOwn(settings,'src'),src=clip?(inherited?projectImage(p,a):settings.src):global[target.value];
    $('backgroundClipLabel').textContent=clip?'Clip '+(S.selectedIndex+1):'All inheriting clips';
    $('backgroundThumb').hidden=!src;$('backgroundPlaceholder').hidden=!!src;
    if(src){const url=resolve(p,src);if($('backgroundThumb').getAttribute('src')!==url)$('backgroundThumb').src=url;}else $('backgroundThumb').removeAttribute('src');
    $('backgroundPlaceholder').textContent='White canvas';$('removeBackground').disabled=!src;
    $('backgroundCropControls').hidden=!src;$('backgroundCropRect').hidden=!src;
    if(src&&!drag)showCrop(currentCrop(p,context()));
    $('inheritBackground').hidden=!clip;$('inheritBackground').disabled=inherited&&settings.key_white===undefined&&!settings.crop;
    const keyWhite=(clip?settings.key_white:undefined)??global.key_white??false;
    $('backgroundKeyWhite').checked=keyWhite;$('backgroundKeyWhite').disabled=!src;
    const m=settings.motion??(clip?global.motion:undefined),preset=m?.preset||'follow_camera',cropNow=currentCrop(p,context());
    const support=backgroundMotionSupport(cropNow),motionSel=$('backgroundMotion');
    for(const opt of motionSel.options)opt.disabled=false;
    motionSel.value=preset;
    for(const opt of motionSel.options){const info=support[opt.value];opt.disabled=!!(info&&!info.ok);opt.title=info&&!info.ok?info.reason:'';}
    $('backgroundMotionValue').textContent=Math.round((m?.amount??.4)*100)+'%';
    const blocked=!!(support[preset]&&!support[preset].ok);
    $('backgroundMotionAmount').disabled=['follow_camera','static'].includes(preset)||blocked;
    const clockSel=$('backgroundMotionClock'),hasSpan=!!(m&&(m.span!=null||(m.t0!=null&&m.t1!=null)));
    const legacy=m?.clock==='per_atom'||m?.clock==='legacy';
    const clock=legacy?'per_atom':(m?.clock==='span'||(hasSpan&&m?.clock!=='show'))?'span':'show';
    clockSel.querySelector('option[value="span"]').hidden=clock!=='span';
    clockSel.value=clock;clockSel.disabled=['follow_camera','static'].includes(preset);
    $('resetBackgroundMotion').disabled=!settings.motion;$('resetBackgroundMotion').textContent=clip?'Use project motion':'Reset motion';
    const note=motionCopy(cropNow,preset);$('backgroundMotionNote').textContent=note.text;$('backgroundMotionNote').classList.toggle('is-blocked',note.blocked);
    const library=$('backgroundLibrary');library.replaceChildren(new Option('Use library image…',''));
    p.media.forEach(m=>library.add(new Option(m.name,m.id)));
    const prefix=clip?(inherited?'Using project image. ':'Only clip '+(S.selectedIndex+1)+'. '):'Project default for clips without an override. ';
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
    edit(c,(settings,next,key)=>{
      const previous=settings[key];
      if(c.scope==='project'&&previous&&stem(previous)){settings.aliases||={};settings.aliases[key]=[...new Set([...(settings.aliases[key]||[]),stem(previous)])];}
      if(data){next.assets||={};next.assets[src]=data;}settings[key]=src;clearCrop(settings,c,key);
      if(settings.key_white==null&&autoKey)settings.key_white=true;
    });
  }
  on('changeBackground',()=>$('backgroundInput').click());
  $('backgroundInput').onchange=safe(async e=>{
    const file=e.target.files[0];if(!file)return;
    try{const c=context(),data=await read(file),ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[file.type];await setImage(c,'backgrounds/'+crypto.randomUUID()+'.'+ext,data);}
    finally{e.target.value='';}
  });
  $('backgroundLibrary').onchange=safe(async e=>{const c=context(),m=S.project.media.find(m=>m.id===e.target.value);if(m)await setImage(c,m.src);});
  on('removeBackground',()=>{const c=context();edit(c,(s,p,key)=>{clearCrop(s,c,key);if(c.scope==='clip'){s.src=null;delete s.key_white;}else{delete s[key];if(!s.base&&!s.swap)delete s.key_white;}});});
  on('inheritBackground',()=>edit(context(),s=>{delete s.src;delete s.key_white;delete s.crop;}));
  $('backgroundKeyWhite').onchange=safe(()=>{const enabled=$('backgroundKeyWhite').checked;edit(context(),s=>s.key_white=enabled);});
  function travelNote(){
    const clock=$('backgroundMotionClock').value;
    if(clock==='per_atom')return ' Per clip: the move restarts at each cut.';
    if(clock==='span')return ' Continuous (span): one move over the authored times.';
    return ' Continuous (show): one move across the whole show.';
  }
  function motionCopy(crop,preset){
    const info=(backgroundMotionSupport(crop)||{})[preset]||{ok:false,reason:'This background motion is not available.'};
    if(!info.ok)return {blocked:true,text:info.reason};
    if(preset==='follow_camera')return {blocked:false,text:'Follows the clip camera, including shake, inside this crop.'};
    if(preset==='static')return {blocked:false,text:'Holds the crop still while the clip camera and shake move the plates.'};
    const mode=backgroundMotionFrame(crop,preset,1,1).mode,travel=travelNote();
    if(mode==='inset')return {blocked:false,text:'This crop fills the source, so the move zooms in slightly and slides that view.'+travel};
    if(String(preset).startsWith('pan_'))return {blocked:false,text:'Slides the crop window across the source. Plates stay put.'+travel};
    if(preset==='push_in')return {blocked:false,text:'Zooms into the crop by tightening the window.'+travel};
    if(preset==='pull_out')return {blocked:false,text:'Zooms out by widening the window across the rest of the source.'+travel};
    return {blocked:false,text:''};
  }
  function currentMotion(){
    const p=S.project;if(!p)return null;
    const c=context(),a=p.show.atoms.find(x=>x.id===c.atomId);
    return c.scope==='clip'?a?.background?.motion||null:p.show.bg?.motion||null;
  }
  function changeMotion(){
    const preset=$('backgroundMotion').value,amount=Number($('backgroundMotionAmount').value),clock=$('backgroundMotionClock').value,prev=currentMotion()||{};
    const motion={preset,amount};
    if(!['follow_camera','static'].includes(preset)){
      if(clock==='per_atom')motion.clock='per_atom';
      else if(clock==='span'){
        motion.clock='span';
        if(prev.span!=null)motion.span=JSON.parse(JSON.stringify(prev.span));
        else if(Number.isFinite(+prev.t0)&&Number.isFinite(+prev.t1)){motion.t0=+prev.t0;motion.t1=+prev.t1;}
      }else motion.clock='show';
    }
    edit(context(),s=>s.motion=motion);
  }
  $('backgroundMotion').onchange=safe(changeMotion);$('backgroundMotionAmount').onchange=safe(changeMotion);$('backgroundMotionClock').onchange=safe(changeMotion);
  on('resetBackgroundMotion',()=>edit(context(),s=>delete s.motion));
  // ---- HM-BG-CROP: editable crop region (drag-rect, corner handles, numeric fields) ----
  const C=window.HMComposeClient,pct=v=>Math.round(v*1000)/10;
  let drag=null;
  function clearCrop(s,c,key){if(c.scope==='clip')delete s.crop;else if(s.crops){delete s.crops[key];if(!Object.keys(s.crops).length)delete s.crops;}}
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
    edit(c,(s,p,key)=>{
      if(c.scope==='clip'){
        const a=p.show.atoms.find(a=>a.id===c.atomId),inherited=Object.hasOwn(s,'src')?null:p.show.bg?.crops?.[projectLayer(p,a)];
        if(full&&C.isFullBackgroundCrop(inherited))delete s.crop;else s.crop=full?{...C.BG_CROP_FULL}:r;
      }else if(full)clearCrop(s,c,key);else{s.crops||={};s.crops[key]=r;}
    });
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
  $('backgroundScope').onchange=refresh;$('backgroundTarget').onchange=refresh;
  window.addEventListener('hm:projectchange',refresh);window.ready.then(refresh).catch(()=>{});
})();

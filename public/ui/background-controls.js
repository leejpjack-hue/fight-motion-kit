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
  function projectImage(p,a){
    const layout=S.composed?.layout,compiled=layout&&Object.values(layout).find(l=>l.atom===a?.id);
    const t=p.show.atoms.slice(0,S.selectedIndex).reduce((sum,a)=>sum+a.duration_s,0);
    const key=compiled?.bg||(p.show.bg?.swap&&t>=p.show.bg.swap_t?'swap':'base');
    return p.show.bg?.[key];
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
    $('inheritBackground').hidden=!clip;$('inheritBackground').disabled=inherited&&settings.key_white===undefined;
    const keyWhite=(clip?settings.key_white:undefined)??global.key_white??false;
    $('backgroundKeyWhite').checked=keyWhite;$('backgroundKeyWhite').disabled=!src;
    const m=settings.motion??(clip?global.motion:undefined),preset=m?.preset||'follow_camera';
    $('backgroundMotion').value=preset;$('backgroundMotionAmount').value=m?.amount??.4;
    $('backgroundMotionValue').textContent=Math.round((m?.amount??.4)*100)+'%';
    $('backgroundMotionAmount').disabled=['follow_camera','static'].includes(preset);
    $('resetBackgroundMotion').disabled=!settings.motion;$('resetBackgroundMotion').textContent=clip?'Use project motion':'Reset motion';
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
      if(data){next.assets||={};next.assets[src]=data;}settings[key]=src;
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
  on('removeBackground',()=>{const c=context();edit(c,(s,p,key)=>{if(c.scope==='clip'){s.src=null;delete s.key_white;}else{delete s[key];if(!s.base&&!s.swap)delete s.key_white;}});});
  on('inheritBackground',()=>edit(context(),s=>{delete s.src;delete s.key_white;}));
  $('backgroundKeyWhite').onchange=safe(()=>{const enabled=$('backgroundKeyWhite').checked;edit(context(),s=>s.key_white=enabled);});
  function changeMotion(){const motion={preset:$('backgroundMotion').value,amount:Number($('backgroundMotionAmount').value)};edit(context(),s=>s.motion=motion);}
  $('backgroundMotion').onchange=safe(changeMotion);$('backgroundMotionAmount').onchange=safe(changeMotion);
  on('resetBackgroundMotion',()=>edit(context(),s=>delete s.motion));
  $('backgroundScope').onchange=refresh;$('backgroundTarget').onchange=refresh;
  window.addEventListener('hm:projectchange',refresh);window.ready.then(refresh).catch(()=>{});
})();

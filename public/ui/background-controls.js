/* Scene backgrounds are portable assets; edits use the same history/autosave as clips. */
(() => {
  const S = window.HMStudio, { $, on, safe } = S;
  const resolve = (p, src) => p.assets?.[src] || (/^(data:|blob:|\/)/.test(src) ? src : '/'+src);
  const stem = src => /^data:/.test(src||'')?'':String(src||'').split('/').pop().replace(/\.[^.]+$/, '');
  function entryFor(p) {
    const id=$('clipIndex').textContent.split('/')[0];
    const atom=p.show.atoms[Math.max(0,Number(id)-1)];
    return atom ? p.layouts[atom.hero.layout_source]?.[atom.hero.plates[0]] : null;
  }
  function refresh() {
    const p=S.project;if(!p)return;
    const bg=p.show.bg||{},target=$('backgroundTarget');
    target.options[1].hidden=!bg.swap;target.hidden=!bg.swap;
    if(target.value==='swap'&&!bg.swap)target.value='base';
    const key=target.value,src=bg[key];
    $('backgroundThumb').hidden=!src;$('backgroundPlaceholder').hidden=!!src;
    if(src){const url=resolve(p,src);if($('backgroundThumb').getAttribute('src')!==url)$('backgroundThumb').src=url;}else $('backgroundThumb').removeAttribute('src');
    $('removeBackground').disabled=!src;$('backgroundKeyWhite').checked=bg.key_white===true;
    $('backgroundKeyWhite').disabled=!bg.base&&!bg.swap;
    const entry=entryFor(p);
    $('backgroundNotice').textContent=!src?'Choose a PNG, JPG or WebP image for this scene.':entry?.full?(bg.key_white?'White connected to the image edge is removed in preview and exports. Source PNGs stay intact.':'This plate has its own background. Enable white-backdrop removal for white plates; other opaque scenes need transparent PNGs.'):'Background applies behind transparent plates and is included in project and video exports.';
  }
  async function read(file) {
    if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose a PNG, JPG or WebP background.');
    if(file.size>20*1024*1024)throw Error('Background image must be 20 MB or smaller.');
    const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(file);});
    const im=new Image();im.src=data;await im.decode();return data;
  }
  async function hasWhiteBackdrop(p) {
    const entry=entryFor(p);if(!entry?.full)return false;
    const atom=p.show.atoms[Math.max(0,Number($('clipIndex').textContent.split('/')[0])-1)];
    const dir=atom.hero.layout_source.slice(0,atom.hero.layout_source.lastIndexOf('/')+1);
    const src=/^(data:|blob:|\/)/.test(entry.full)?entry.full:dir+entry.full;
    const im=new Image();im.src=resolve(p,src);await im.decode();
    const c=document.createElement('canvas');c.width=c.height=16;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0,16,16);
    return [[0,0],[15,0],[0,15],[15,15]].every(([x,y])=>{const d=g.getImageData(x,y,1,1).data;return d[3]>250&&Math.min(d[0],d[1],d[2])>=245;});
  }
  on('changeBackground',()=>$('backgroundInput').click());
  $('backgroundInput').onchange=safe(async e=>{
    const file=e.target.files[0];if(!file)return;
    try{
      const p=S.project,target=$('backgroundTarget').value,data=await read(file);
      const autoKey=await hasWhiteBackdrop(p);
      if(S.project.show.show_id!==p.show.show_id)throw Error('Project changed while opening the image. Choose the background again.');
      S.editProject(next=>{
        const bg=next.show.bg||={};const previous=bg[target];
        if(previous&&stem(previous)){bg.aliases||={};bg.aliases[target]=[...new Set([...(bg.aliases[target]||[]),stem(previous)])];}
        const key='backgrounds/'+crypto.randomUUID()+'.'+({ 'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[file.type]);
        next.assets||={};next.assets[key]=data;bg[target]=key;
        if(bg.key_white==null&&autoKey)bg.key_white=true;
      });
    }finally{e.target.value='';}
  });
  on('removeBackground',()=>S.editProject(p=>{const bg=p.show.bg||{};delete bg[$('backgroundTarget').value];if(!bg.base&&!bg.swap)delete bg.key_white;}));
  $('backgroundKeyWhite').onchange=safe(()=>{const enabled=$('backgroundKeyWhite').checked;S.editProject(p=>{p.show.bg||={};p.show.bg.key_white=enabled;});});
  $('backgroundTarget').onchange=refresh;
  window.addEventListener('hm:projectchange',refresh);
  window.ready.then(refresh).catch(()=>{});
})();

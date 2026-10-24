/* Import selected images, with fresh asset/layout keys, without opening the source edit. */
(() => {
  const S=window.HMStudio,{$,on}=S;
  let source=null,items=[],chosen=new Set(),request=0,destination='',busy=false;
  const imageData=/^data:image\/(png|jpeg|webp|gif);base64,/;
  const notice=(text,error=false)=>{$('projectMediaStatus').textContent=text;$('projectMediaStatus').classList.toggle('error',error);};
  function update(){
    $('projectMediaCount').textContent=chosen.size+' / '+items.length+' selected';
    $('importSelectedProjectImages').disabled=busy||!chosen.size;
    $('selectAllProjectImages').disabled=busy||!items.length;$('clearProjectImages').disabled=busy||!chosen.size;
    $('projectMediaGrid').querySelectorAll('input').forEach(input=>{input.checked=chosen.has(Number(input.value));input.disabled=busy;});
  }
  function candidates(p,embedded){
    if(!p?.show||!Array.isArray(p.media)||!p.layouts||p.media.length>1000)throw Error('Choose a saved HTML Motion .motion.json project.');
    const result=[],seen=new Set();
    function add(src,name){
      if(!src||seen.has(src))return;
      if(typeof src!=='string')throw Error('Project contains an invalid image.');
      const data=p.assets?.[src]||src;
      if(embedded&&!imageData.test(data))throw Error('This project has missing embedded images. Save it with “Save project”, then try again.');
      if(!imageData.test(data)&&(!/^(?:\/?assets\/)[a-zA-Z0-9_./-]+$/.test(data)||data.includes('..')))throw Error('Project images must be embedded or shipped with this app.');
      seen.add(src);result.push({src,name:String(name||'Image '+(result.length+1)).slice(0,100),url:imageData.test(data)?data:'/'+data.replace(/^\//,'')});
    }
    p.media.forEach(m=>add(m.src,m.name));
    for(const key of ['base','swap'])add(p.show.bg?.[key],key==='base'?'Project background':'Alternate background');
    (p.show.atoms||[]).forEach((a,i)=>add(a.background?.src,'Clip '+(i+1)+' background'));
    for(const key of Object.keys(p.assets||{}))add(key,key.split('/').pop());
    if(!result.length)throw Error('No images found in this project.');
    return result;
  }
  async function showSource(promise,embedded){
    const version=++request;busy=true;source=null;items=[];chosen.clear();$('projectMediaGrid').replaceChildren();notice('Opening project images…');update();
    try{
      const p=await promise,next=candidates(p,embedded);if(version!==request)return;
      source=p;items=next;
      items.forEach((m,i)=>{
        const label=document.createElement('label');label.className='project-media-card';
        const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=i;checkbox.setAttribute('aria-label','Import '+m.name);checkbox.onchange=()=>{checkbox.checked?chosen.add(i):chosen.delete(i);update();};
        const image=document.createElement('img');image.src=m.url;image.alt=m.name;const name=document.createElement('span');name.textContent=m.name;
        label.append(checkbox,image,name);$('projectMediaGrid').append(label);
      });
      notice((p.show.title||p.show.show_id)+' · '+items.length+' images. Select the ones you want.');
    }catch(e){if(version===request)notice(e.message,true);}
    finally{if(version===request){busy=false;update();}}
  }
  function dataUrl(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});}
  async function materialize(item){
    let data=source.assets?.[item.src]||item.src;
    if(!imageData.test(data)){
      const r=await fetch(item.url);if(!r.ok)throw Error('Could not load '+item.name);const blob=await r.blob();
      if(blob.size>20*1024*1024)throw Error(item.name+' is larger than 20 MB.');data=await dataUrl(blob);
    }
    if(!imageData.test(data)||data.length>28*1024*1024)throw Error('Unsupported or oversized project image: '+item.name);
    const im=new Image();im.src=data;await im.decode();return {name:item.name,data};
  }
  on('importProjectImages',()=>{
    request++;busy=false;source=null;items=[];chosen.clear();destination=S.project.show.show_id;
    $('projectMediaSource').value='';$('projectMediaGrid').replaceChildren();notice('Open a saved .motion.json file or choose a sample.');update();$('projectMediaDialog').showModal();
  });
  $('projectMediaDialog').addEventListener('close',()=>{request++;busy=false;});
  on('chooseMediaProject',()=>$('projectMediaInput').click());
  $('projectMediaInput').onchange=async e=>{
    const f=e.target.files[0];if(!f)return;
    $('projectMediaSource').value='';
    await showSource((async()=>{if(f.size>100*1024*1024)throw Error('Project exceeds the 100 MB import limit.');return JSON.parse(await f.text());})(),true);e.target.value='';
  };
  $('projectMediaSource').onchange=()=>{const id=$('projectMediaSource').value;if(id)void showSource(S.builtIn(id),false);};
  on('selectAllProjectImages',()=>{chosen=new Set(items.map((_,i)=>i));update();});
  on('clearProjectImages',()=>{chosen.clear();update();});
  on('importSelectedProjectImages',async()=>{
    if(busy||!chosen.size)return;
    const version=request;busy=true;notice('Importing selected images…');update();
    try{
      const imported=[];let size=0;
      for(const index of chosen){const m=await materialize(items[index]);size+=m.data.length;if(size>140*1024*1024)throw Error('Import fewer images at once (100 MB limit).');imported.push(m);}
      if(version!==request)return;
      if(S.project.show.show_id!==destination)throw Error('The destination project changed. Open the importer again.');
      const folder='imports/'+crypto.randomUUID(),layoutSource=folder+'/layout.json';
      S.editProject(p=>{
        const layout={};p.assets||={};
        imported.forEach((m,i)=>{
          const id='P'+String(i+1).padStart(3,'0'),ext=m.data.match(imageData)[1].replace('jpeg','jpg'),filename=id+'.'+ext,src=folder+'/'+filename;
          p.assets[src]=m.data;layout[id]={full:filename};p.media.push({id:crypto.randomUUID(),name:m.name,src,layoutSource,plateId:id});
        });p.layouts[layoutSource]=layout;
      });
      $('projectMediaDialog').close();S.status('Imported '+imported.length+' images into the library. Use + to add a clip or choose one as a background.');
    }catch(e){notice(e.message,true);}
    finally{if(version===request){busy=false;update();}}
  });
})();

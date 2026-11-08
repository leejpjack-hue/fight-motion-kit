/* SG01 transport only. No sampler or renderer consumes this descriptor. */
((root) => {
  const limits=Object.freeze({png:33554432,json:262144,pixels:32000000,cells:1024});
  const adapter='hm-sg01-body-strip';
  const integer=(n,label)=>{if(!Number.isSafeInteger(n)||n<=0)throw Error(label+' must be a positive finite integer.');return n;};
  const positive=(n,label)=>{if(typeof n!=='number'||!Number.isFinite(n)||n<=0)throw Error(label+' must be a positive finite number.');return n;};
  const index=(n,label)=>{if(!Number.isSafeInteger(n)||n<0)throw Error(label+' must be a nonnegative integer.');};
  const localName=n=>typeof n==='string'&&n.length>0&&n.length<=255&&!/[\\/:\u0000-\u001f]/.test(n)&&n!=='.'&&n!=='..';
  const owns=(o,key)=>o!=null&&Object.prototype.hasOwnProperty.call(o,key);
  const keys=(o,allowed,label)=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!allowed.includes(k))||allowed.some(k=>!owns(o,k)))throw Error('Invalid '+label+' fields.');};
  const pixel=(n,label,min=0,max=limits.pixels)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('Invalid '+label+' pixel value.');};
  // FINAL writer diagnostics (pin 6a3f4c4 loop.py 3210-3289, held_fill.public).
  // Validate a bounded exact schema, then ignore. Never copy reports or resolve references.
  const finalFields='drawings cycle_drawings held_fill holds cell_record state steps clip_feet ghost_given_way ghost_kept wrap_blend'.split(' ');
  function finalDiagnostics(raw){
    if(!finalFields.some(k=>owns(raw,k)))return;
    const bad=()=>{throw Error('Invalid or unsafe FINAL strip diagnostics.');};
    const n=v=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>limits.pixels)bad();};
    const i=v=>{n(v);if(!Number.isSafeInteger(v))bad();};
    const pos=v=>{i(v);if(v===0)bad();};
    const bool=v=>{if(typeof v!=='boolean')bad();};
    const text=v=>{if(typeof v!=='string'||!v.length||v.length>500||/[\\/<>`$;&|\u0000-\u001f]|\.\.|%(?:2e|2f|5c|25)|(?:https?|file|data|javascript|vbscript):|\b(?:session|credentials?|password|token)\b/i.test(v))bad();};
    const one=(...values)=>v=>{if(!values.includes(v))bad();};
    const nullable=check=>v=>{if(v!==null)check(v);};
    const list=(check,max=limits.cells)=>v=>{if(!Array.isArray(v)||v.length>max)bad();v.forEach(check);};
    const shape=(required,optional={})=>v=>{
      if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(required).some(k=>!owns(v,k)))bad();
      for(const k of Object.keys(v)){const check=owns(required,k)?required[k]:owns(optional,k)?optional[k]:null;if(!check)bad();check(v[k]);}
    };
    const run=shape({start:i,length:pos}),holdKind=one('motion-hold','drawn','opening','closing');
    const beforeRun=shape({start:i,length:pos,filled:bool},{joined:pos,wrap:one(true),why:text,keep:holdKind,faults:list(text,32),made:list(i)});
    const contrast=shape({},{'2':nullable(n),'3':nullable(n)});
    const fill=depth=>shape({mode:one('auto','off'),cells:pos,poses:pos,held_runs:list(run),made:list(i),
      before:shape({cells:pos,poses:pos,held_runs:list(beforeRun)},{wrap_held:one(true),wrap:beforeRun})},
      {why:text,drawn:one(2,3),wrap_held:one(true),unmade:shape({cells:list(i)},{why:text}),
        // install is deliberately absent: operational commands are not provenance.
        out_fps:shape({asked:n,fps:n,applied:bool},{cells:pos,made:i,shown_again:i,why:text}),
        ...(depth?{again:fill(depth-1)}:{})});
    for(const k of ['drawings','cycle_drawings','held_fill','holds','cell_record','source_cut'])if(!owns(raw,k))bad();
    shape({hold:nullable(one(1,2,3)),drawings_per_second:nullable(n),contrast,frames:pos})(raw.drawings);
    shape({start:i,length:pos,steps:i,hold:nullable(one(1,2,3)),drawings_per_second:nullable(n),contrast},{why:text})(raw.cycle_drawings);
    fill(1)(raw.held_fill);
    list(shape({from:i,to:i,kind:holdKind,reason:text}))(raw.holds);
    raw.holds.forEach(h=>{if(h.from>h.to||h.to>=raw.frames)bad();});
    if(owns(raw,'state')&&(typeof raw.state!=='string'||!(/^[a-z][a-z0-9_-]{0,63}$/).test(raw.state)))bad();
    if(owns(raw,'steps'))pos(raw.steps);
    if(owns(raw,'clip_feet'))shape({length:pos,cuts:i},{why:text,same_foot:i,alternate:i,unread:i,seam_in_step:i,same_foot_at:list(i)})(raw.clip_feet);
    if(owns(raw,'ghost_kept'))list(shape({frame:i,ghost:n}))(raw.ghost_kept);
    if(owns(raw,'ghost_given_way'))list(shape({frame:i,ghost:n,taken:v=>{if(v!=='rife')shape({source:i})(v);}}))(raw.ghost_given_way);
    if(owns(raw,'wrap_blend'))shape({cells:list(i),K:pos})(raw.wrap_blend);
    const c=raw.cell_record;
    shape({strip_sha256:v=>{if(typeof v!=='string'||!(/^[a-f0-9]{64}$/).test(v))bad();},cells:list(shape({
      source_frame:i,anchor_move_px:v=>{if(!Array.isArray(v)||v.length!==2||v.some(x=>x!==0))bad();},
      scale:shape({size_hold:v=>{n(v);if(v===0)bad();},gait_fallback:v=>{n(v);if(v===0)bad();}}),as_filmed:bool}))})(c);
    if(!Array.isArray(raw.source_cut.samples)||c.cells.length!==raw.frames)bad();
    c.cells.forEach((cell,k)=>{if(cell.source_frame!==raw.source_cut.samples[k]||(cell.as_filmed&&Object.values(cell.scale).some(s=>s!==1)))bad();});
  }
  // Synchronous SHA256 keeps the same PNG integrity check at staging and sync reopen
  // validation. Integrity is byte binding only, never proof of producer authenticity.
  function pngDigest(bytes){
    const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],W=new Uint32Array(64);
    const r=(x,n)=>(x>>>n)|(x<<(32-n)),end=Math.ceil((bytes.length+9)/64)*64;
    for(let offset=0;offset<end;offset+=64){
      W.fill(0);for(let j=0;j<64;j++){const p=offset+j;const b=p<bytes.length?bytes[p]:p===bytes.length?128:0;W[j>>>2]|=b<<(24-(j%4)*8);}
      if(offset+64===end){W[14]=Math.floor(bytes.length/0x20000000);W[15]=(bytes.length*8)>>>0;}
      for(let j=16;j<64;j++){const a=W[j-15],b=W[j-2];W[j]=(W[j-16]+(r(a,7)^r(a,18)^(a>>>3))+W[j-7]+(r(b,17)^r(b,19)^(b>>>10)))>>>0;}
      let [a,b,c,d,e,f,g,h]=H;
      for(let j=0;j<64;j++){const t=(h+(r(e,6)^r(e,11)^r(e,25))+((e&f)^(~e&g))+K[j]+W[j])>>>0,u=((r(a,2)^r(a,13)^r(a,22))+((a&b)^(a&c)^(b&c)))>>>0;h=g;g=f;f=e;e=(d+t)>>>0;d=c;c=b;b=a;a=(t+u)>>>0;}
      [a,b,c,d,e,f,g,h].forEach((v,j)=>{H[j]=(H[j]+v)>>>0;});
    }
    return H.map(v=>v.toString(16).padStart(8,'0')).join('');
  }
  function integrity(raw,bytes){if(raw.cell_record&&pngDigest(bytes)!==raw.cell_record.strip_sha256)throw Error('FINAL cell_record PNG SHA256 disagrees with original bytes.');}
  function sizes(png,json){
    if(!Number.isSafeInteger(png)||png<1||png>limits.png)throw Error('PNG limit is 33554432 bytes.');
    if(!Number.isSafeInteger(json)||json<1||json>limits.json)throw Error('JSON limit is 262144 bytes.');
  }
  function normalize(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Choose an unversioned body-strip sidecar.');
    // Deliberately bounded subset of producer 6a3f4c4. No arbitrary reports/run files.
    const provenance='scale source_rect top_margin_px cell_height_cap body_height_target foot_anchor drift_px foot_sway_px foot_x anchor source_cut events'.split(' ');
    const fields=new Set(('frames w h body_h fps delay_ms cycle_frames cycle_seconds source_fps kind loop hold_last returns end_frame subsampled cell_cap sample_indices body_ref body_ref_frame body_src_h warnings').split(' ').concat(provenance,finalFields));
    for(const key of Object.keys(raw))if(!fields.has(key))throw Error('Unsupported strip field: '+key);
    const {frames,w,h,body_h}=raw;
    [frames,w,h,body_h].forEach((n,i)=>integer(n,['frames','w','h','body_h'][i]));
    if(frames>limits.cells)throw Error('Strip limit is 1024 exported cells.');
    if(w>Math.floor(Number.MAX_SAFE_INTEGER/frames)||frames*w>Math.floor(limits.pixels/h))throw Error('Strip limit is 32000000 decoded pixels.');
    if(body_h>h)throw Error('body_h must fit the cell; it is the standing-height reference.');
    for(const key of ['fps','delay_ms','cycle_seconds','source_fps','body_src_h'])if(raw[key]!==undefined)positive(raw[key],key);
    for(const key of ['cycle_frames','cell_cap'])if(raw[key]!==undefined)integer(raw[key],key);
    for(const key of ['loop','hold_last','returns','subsampled'])if(raw[key]!==undefined&&typeof raw[key]!=='boolean')throw Error(key+' must be boolean.');
    for(const key of ['end_frame','body_ref_frame'])if(raw[key]!==undefined)index(raw[key],key);
    if(raw.end_frame!==undefined&&raw.end_frame!==frames-1)throw Error('end_frame must retain the actual final exported cell.');
    if(raw.cycle_frames!==undefined&&raw.cycle_frames<frames)throw Error('cycle_frames cannot be smaller than exported frames.');
    if(raw.cell_cap!==undefined&&raw.cell_cap<frames)throw Error('cell_cap cannot be smaller than exported frames.');
    if(raw.sample_indices!==undefined){
      if(!Array.isArray(raw.sample_indices)||raw.sample_indices.length!==frames)throw Error('sample_indices must describe each exported cell.');
      raw.sample_indices.forEach((n,i)=>{index(n,'sample_indices');if((i&&n<=raw.sample_indices[i-1])||(raw.cycle_frames!==undefined&&n>=raw.cycle_frames))throw Error('Invalid sample_indices.');});
    }
    if(raw.body_ref!==undefined&&!['grounded','standing','first','cut-first','first-frame','cut-first-frame','tallest-grounded'].includes(raw.body_ref))throw Error('Unsupported body_ref.');
    if(raw.warnings!==undefined&&(!Array.isArray(raw.warnings)||raw.warnings.length>100||raw.warnings.some(s=>typeof s!=='string'||s.length>500||/https?:|[\\/]|\.\.|[\u0000-\u001f]/i.test(s))))throw Error('Warnings must be short local text, without references.');
    const kind=raw.kind===undefined?(raw.loop===false?(raw.returns?'once-return':'once'):'repeat'):raw.kind;
    if(!['periodic','repeat','loop','once','once-return','one-shot'].includes(kind))throw Error('Unsupported body-strip kind. Lifetime/additive/root motion are not supported.');
    const repeat=['periodic','repeat','loop'].includes(kind),returns=kind==='once-return',holdLast=!repeat&&!returns;
    if((raw.loop!==undefined&&raw.loop!==repeat)||(raw.returns!==undefined&&raw.returns!==returns)||(raw.hold_last!==undefined&&raw.hold_last!==holdLast))throw Error('Conflicting strip end policy.');
    if(raw.cycle_frames!==undefined){
      if((raw.subsampled!==undefined&&raw.subsampled!==(raw.cycle_frames>frames))||(raw.cell_cap!==undefined&&frames!==Math.min(raw.cycle_frames,raw.cell_cap)))throw Error('Conflicting subsampling provenance.');
      if(raw.sample_indices!==undefined&&(raw.sample_indices[0]!==0||(['once','once-return'].includes(kind)&&raw.sample_indices[frames-1]!==raw.cycle_frames-1)))throw Error('Invalid exported endpoint samples.');
    }
    // Pinned loop.py build_strip L782-892: source crop can extend sideways past the canvas.
    // Rounded scale has 0.00005 uncertainty; it is provenance, never runtime geometry.
    if(raw.scale!==undefined&&(typeof raw.scale!=='number'||!Number.isFinite(raw.scale)||raw.scale<0||raw.scale>limits.pixels))throw Error('Invalid scale.');
    if(raw.body_src_h!==undefined)pixel(raw.body_src_h,'body_src_h',1);
    for(const key of ['top_margin_px','drift_px','foot_sway_px'])if(raw[key]!==undefined)pixel(raw[key],key);
    for(const key of ['cell_height_cap','body_height_target'])if(raw[key]!==undefined&&raw[key]!==null)pixel(raw[key],key,1);
    if(raw.cell_height_cap===null||raw.cell_height_cap<h)throw Error('cell_height_cap must fit the exported cell.');
    if(raw.body_height_target!==undefined&&raw.body_height_target!==null&&body_h>raw.body_height_target)throw Error('body_h exceeds body_height_target.');
    if(raw.source_rect!==undefined&&raw.source_rect!==null){
      const r=raw.source_rect;
      if(!Array.isArray(r)||r.length!==4)throw Error('Invalid source_rect.');
      r.forEach((n,i)=>pixel(n,'source_rect',i===0?-limits.pixels:0));
      if(r[2]<=r[0]||r[3]<=r[1]||(raw.top_margin_px!==undefined&&raw.top_margin_px!==r[1]))throw Error('Invalid source_rect crop.');
      if(raw.scale!==undefined&&[[w,r[2]-r[0]],[h,r[3]-r[1]]].some(([size,src])=>Math.abs(size-Math.max(1,src*raw.scale))>.500001+src*.00005))throw Error('source_rect/scale disagree with exported geometry.');
    }
    if(raw.body_src_h!==undefined&&raw.scale!==undefined&&Math.abs(body_h-raw.body_src_h*raw.scale)>.500001+raw.body_src_h*.00005)throw Error('body_src_h/scale disagree with body_h.');
    if(raw.foot_anchor!==undefined&&!['none','feet'].includes(raw.foot_anchor))throw Error('Unsupported foot_anchor.');
    if(raw.foot_x!==undefined&&raw.foot_x!==null)pixel(raw.foot_x,'foot_x',0,w);
    if(raw.foot_anchor==='none'&&(raw.source_rect===null||(raw.foot_x!==undefined&&raw.foot_x!==null)||raw.drift_px>0||raw.foot_sway_px>0||raw.anchor!==undefined))throw Error('Conflicting unanchored provenance.');
    if(raw.foot_anchor==='feet'&&(raw.source_rect!==null||raw.foot_x==null))throw Error('Feet provenance needs source_rect null and foot_x.');
    if(raw.anchor!==undefined){
      if(raw.foot_anchor!=='feet'||!Array.isArray(raw.anchor)||raw.anchor.length!==2||raw.anchor[0]!==raw.foot_x||raw.anchor[1]!==h)throw Error('Invalid feet anchor.');
    }
    // run_loop L3210-3212 + evidence.py L14-34: exact identity, NOT a URL/path or fetch target.
    // Only original-frame samples are supported here; retimed `times` diagnostics stay rejected.
    if(raw.source_cut!==undefined){
      const c=raw.source_cut;keys(c,['source','start','length','samples'],'source_cut');
      keys(c.source,['kind','sha256','frames','fps'],'source identity');
      const s=c.source;
      if(s.kind!=='keyed-frame-sequence'||typeof s.sha256!=='string'||!(/^[a-f0-9]{64}$/).test(s.sha256))throw Error('Invalid source identity.');
      integer(s.frames,'source frames');positive(s.fps,'source fps');index(c.start,'source_cut start');integer(c.length,'source_cut length');
      if(c.start>s.frames-c.length||(raw.cycle_frames!==undefined&&c.length!==raw.cycle_frames))throw Error('source_cut bounds disagree.');
      if(!Array.isArray(c.samples)||c.samples.length!==frames)throw Error('source_cut samples must describe exported cells.');
      c.samples.forEach((n,i)=>{index(n,'source_cut sample');if(n<c.start||n-c.start>=c.length||(i&&n<=c.samples[i-1])||(raw.sample_indices!==undefined&&n-c.start!==raw.sample_indices[i]))throw Error('Invalid source_cut samples.');});
      if(raw.body_ref_frame!==undefined&&raw.body_ref_frame>=s.frames)throw Error('body_ref_frame outside source clip.');
    }
    if(raw.events!==undefined){
      if(repeat||!Array.isArray(raw.events)||raw.events.length!==1)throw Error('Unsupported strip events.');
      for(const e of raw.events){keys(e,['frame','name'],'event');index(e.frame,'event frame');if(e.frame>=frames||e.name!=='motion_peak')throw Error('Invalid motion_peak event.');}
    }
    finalDiagnostics(raw);
    let secondsPerCell,timingSource;
    if(raw.fps!==undefined){secondsPerCell=1/raw.fps;timingSource='fps';}
    else {
      const ms=positive(raw.delay_ms,'delay_ms'),rate=Math.round(1000/ms);
      const snap=!Number.isInteger(ms)&&Number.isSafeInteger(rate)&&rate>0&&Math.abs(ms-1000/rate)<=.01;
      secondsPerCell=snap?1/rate:ms/1000;timingSource=snap?'delay_ms-integer-rate-snap':'delay_ms-literal';
    }
    positive(secondsPerCell,'cell duration');positive(secondsPerCell*frames,'strip duration');
    const metadata={};for(const key of ['cycle_frames','cycle_seconds','source_fps','cell_cap','sample_indices','subsampled','body_ref','body_ref_frame','body_src_h',...provenance])if(raw[key]!==undefined)metadata[key]=structuredClone(raw[key]);
    const warnings=[...(raw.warnings||[])];
    if(raw.subsampled||raw.cycle_frames>frames)warnings.push('Subsampled export: retained cells only; missing source cells are not reconstructed.');
    return {adapter,version:1,status:'pending',geometry:{frames,w,h,body_h},cadence:{secondsPerCell,timingSource},policy:{kind:returns?'once-return':repeat?'repeat':'once',loop:repeat,returns,holdLast,endFrame:frames-1},metadata,warnings};
  }
  // HM-PF-30 QA panel model. Pure view-model over a NORMALIZED descriptor: it reports
  // cadence secondsPerCell and policy exactly as normalize computed them; it never
  // retimes or rewrites a strip. Malformed descriptors fail closed to {ok:false}.
  const rate=(n)=>Number(n.toFixed(3));
  function buildStripQaPanel(descriptor,raw){
    const fail=error=>({ok:false,error,fields:[],warnings:[],summary:'not staged'});
    if(!descriptor||typeof descriptor!=='object'||Array.isArray(descriptor))return fail('No staged strip descriptor.');
    const g=descriptor.geometry,c=descriptor.cadence,p=descriptor.policy,meta=descriptor.metadata||{};
    if(descriptor.adapter!==adapter||descriptor.version!==1||!g||!c||!p
      ||![g.frames,g.w,g.h,g.body_h].every(n=>Number.isSafeInteger(n)&&n>0)
      ||typeof c.secondsPerCell!=='number'||!Number.isFinite(c.secondsPerCell)||c.secondsPerCell<=0
      ||typeof c.timingSource!=='string'||!['repeat','once','once-return'].includes(p.kind))
      return fail('Staged descriptor is not a valid normalized body strip.');
    if(raw===undefined&&typeof descriptor.originalJsonBase64==='string'){
      try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(originalBytes(descriptor.originalJsonBase64,limits.json)));}catch{raw=null;}
    }
    const near=(a,b)=>Math.abs(a-b)<=.001*Math.max(a,b);
    const fields=[
      {key:'frames',label:'Frames',value:g.frames+' exported cells'},
      {key:'delayMs',label:'Cell delay',value:raw&&raw.delay_ms!==undefined
        ?raw.delay_ms+' ms (raw'+(raw.fps!==undefined?' · sidecar fps '+raw.fps+')':')')
        :'\u2248'+rate(1000*c.secondsPerCell)+' ms (derived from '+c.timingSource+')'},
      {key:'bodyH',label:'body_h',value:g.body_h+' px standing \u00b7 cell h '+g.h+' px'},
      {key:'policy',label:'Loop policy',value:p.kind+' \u00b7 loop '+p.loop+' \u00b7 returns '+p.returns+' \u00b7 hold-last '+p.holdLast+' \u00b7 end frame '+p.endFrame},
      {key:'timingSource',label:'Timing source',value:c.timingSource},
      {key:'duration',label:'Strip duration',value:rate(c.secondsPerCell*g.frames)+' s ('+g.frames+' \u00d7 '+rate(c.secondsPerCell)+' s/cell)'}
    ];
    if(meta.source_fps!==undefined)fields.push({key:'sourceFps',label:'Source rate',value:'source_fps '+meta.source_fps+(raw&&raw.fps!==undefined?' \u00b7 export fps '+raw.fps:'')});
    const warnings=(raw&&Array.isArray(raw.warnings)?raw.warnings:[]).map(text=>({source:'producer',text}));
    warnings.push(...descriptor.warnings.slice(warnings.length).map(text=>({source:'adapter',text})));
    if(raw&&raw.fps!==undefined&&meta.source_fps!==undefined&&!near(raw.fps,meta.source_fps))
      warnings.push({source:'qa',text:'Export fps '+raw.fps+' differs from source_fps '+meta.source_fps+'; cells do not play at the source clip rate. Playback uses '+c.timingSource+'.'});
    if(raw&&raw.fps!==undefined&&raw.delay_ms!==undefined&&!near(raw.fps,1000/raw.delay_ms))
      warnings.push({source:'qa',text:'delay_ms '+raw.delay_ms+' implies \u2248'+rate(1000/raw.delay_ms)+' fps, disagreeing with fps '+raw.fps+'. Playback uses '+c.timingSource+'.'});
    const report=[['subsampled','subsampled'],['cycle_frames','cycle_frames'],['cell_cap','cell_cap'],['body_ref','body_ref']].filter(([k])=>meta[k]!==undefined)
      .map(([k])=>({source:'metadata',text:k+' '+meta[k]}));
    if(Array.isArray(meta.sample_indices))report.push({source:'metadata',text:'sample_indices: '+meta.sample_indices.length+' retained source samples'});
    const count=warnings.filter(w=>w.source!=='metadata').length;
    const notes=report.length?report.length+' source-report note'+(report.length>1?'s':''):'';
    return {ok:true,error:null,fields,warnings:[...warnings,...report],
      summary:count?count+' warning'+(count>1?'s':'')+(notes?' \u00b7 '+notes:''):(notes||'no warnings')};
  }
  function pngHeader(bytes){
    if(bytes.length<33||![137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))throw Error('Missing or corrupt PNG signature.');
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if(v.getUint32(8)!==13||String.fromCharCode(...bytes.subarray(12,16))!=='IHDR')throw Error('Missing PNG IHDR.');
    const width=integer(v.getUint32(16),'PNG width'),height=integer(v.getUint32(20),'PNG height');
    if(width>Math.floor(limits.pixels/height))throw Error('PNG limit is 32000000 decoded pixels.');
    return {width,height};
  }
  const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
  function pngChunks(bytes){
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let offset=8,data=false,ended=false;
    while(offset+12<=bytes.length){
      const size=v.getUint32(offset),end=offset+8+size;
      if(end+4>bytes.length)throw Error('Truncated PNG.');
      const type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
      if(['acTL','fcTL','fdAT'].includes(type))throw Error('Animated PNG is not supported.');
      let crc=0xffffffff;for(let i=offset+4;i<end;i++)crc=crcTable[(crc^bytes[i])&255]^(crc>>>8);
      if(((crc^0xffffffff)>>>0)!==v.getUint32(end))throw Error('Corrupt PNG checksum.');
      if(type==='IDAT')data=true;
      offset=end+4;
      if(type==='IEND'){if(size!==0||offset!==bytes.length)throw Error('Invalid PNG end.');ended=true;break;}
    }
    if(!data||!ended)throw Error('Incomplete PNG.');
  }
  function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);}
  function originalBytes(value,limit){
    if(typeof value!=='string'||!value.length||value.length>4*Math.ceil(limit/3))throw Error('Missing or oversized original strip bytes.');
    const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
    if(bytes.length>limit||base64(bytes)!==value)throw Error('Invalid original strip bytes.');
    return bytes;
  }
  async function decodeImage(data){const image=new Image();image.src=data;await image.decode();return {width:image.naturalWidth,height:image.naturalHeight};}
  async function stage(files,{cancelled=()=>false,decode=decodeImage}={}){
    const list=Array.from(files||[]),png=list.filter(f=>/\.png$/i.test(f.name)),json=list.filter(f=>/\.json$/i.test(f.name));
    if(list.length!==2||png.length!==1||json.length!==1)throw Error('Choose exactly one local PNG and one JSON sidecar.');
    if(list.some(f=>!localName(f.name)))throw Error('Use local filenames without paths or references.');
    sizes(png[0].size,json[0].size);
    const [pb,jb]=await Promise.all([png[0].arrayBuffer(),json[0].arrayBuffer()]);
    const bytes=new Uint8Array(pb),jsonBytes=new Uint8Array(jb);sizes(bytes.length,jsonBytes.length);
    if(cancelled())throw Error('Strip import cancelled.');
    const header=pngHeader(bytes),raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(jsonBytes)),descriptor=normalize(raw),g=descriptor.geometry;
    if(header.width!==g.frames*g.w||header.height!==g.h)throw Error('PNG must be exactly frames × w by h.');
    pngChunks(bytes);integrity(raw,bytes);
    const data='data:image/png;base64,'+base64(bytes),decoded=await decode(data);
    if(cancelled())throw Error('Strip import cancelled.');
    if(decoded.width!==header.width||decoded.height!==header.height)throw Error('Decoded PNG dimensions disagree with IHDR.');
    descriptor.originalJsonBase64=base64(jsonBytes);
    return {name:png[0].name,src:data,pendingMotion:descriptor};
  }
  function append(p,staged){
    const id=crypto.randomUUID(),folder='imports/'+id,src=folder+'/strip.png',layoutSource=folder+'/layout.json';
    p.assets||={};p.assets[src]=staged.src;p.layouts[layoutSource]={P01:{pendingMotion:id}};
    p.media.push({id,name:staged.name,src,layoutSource,plateId:'P01',pendingMotion:structuredClone(staged.pendingMotion)});
  }
  function validateProject(p){
    const pending=p.media.filter(m=>owns(m,'pendingMotion')),refs=new Set(),ids=new Set();
    for(const m of pending){
      const d=m.pendingMotion,entry=p.layouts[m.layoutSource]?.[m.plateId],data=p.assets?.[m.src];
      if(!d||typeof d!=='object'||Array.isArray(d)||!localName(m.name)||typeof m.id!=='string'||!/^[a-zA-Z0-9-]+$/.test(m.id)||m.src!=='imports/'+m.id+'/strip.png'||m.layoutSource!=='imports/'+m.id+'/layout.json'||m.plateId!=='P01'||Object.keys(m).some(k=>!['id','name','src','layoutSource','plateId','pendingMotion'].includes(k)))throw Error('Invalid pending strip media or local paths.');
      if(ids.has(m.id)||p.media.filter(x=>x.id===m.id).length!==1)throw Error('Duplicate pending asset ID.');ids.add(m.id);
      if(d.adapter!==adapter||d.version!==1||d.status!=='pending'||entry?.pendingMotion!==m.id||Object.keys(entry).length!==1)throw Error('Invalid pending strip descriptor.');
      const bytes=originalBytes(d.originalJsonBase64,limits.json);
      const raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),expected=normalize(raw);
      expected.originalJsonBase64=d.originalJsonBase64;
      if(JSON.stringify(d)!==JSON.stringify(expected))throw Error('Pending descriptor disagrees with original sidecar.');
      if(typeof data!=='string'||!data.startsWith('data:image/png;base64,')||data.length>22+4*Math.ceil(limits.png/3))throw Error('Missing or oversized pending PNG.');
      const png=originalBytes(data.slice(22),limits.png),header=pngHeader(png),g=d.geometry;pngChunks(png);integrity(raw,png);
      if(header.width!==g.frames*g.w||header.height!==g.h)throw Error('Pending strip geometry changed.');
      refs.add(m.src);refs.add(m.layoutSource);refs.add(data);
      for(const [key,value] of Object.entries(p.assets||{}))if(value===data)refs.add(key);
    }
    const localPath=(value,dir='')=>{
      try{return decodeURIComponent(new URL(value,'https://hm.local/'+dir).pathname).slice(1);}catch{return value;}
    };
    function rejectUse(value,dir=''){
      if(!refs.size)return;
      if(typeof value==='string'&&(refs.has(value)||refs.has(localPath(value))||refs.has(localPath(value,dir))))throw Error('Pending strip is NOT PLAYABLE until SG02; it cannot be used as an image.');
      if(value&&typeof value==='object')Object.values(value).forEach(v=>rejectUse(v,dir));
    }
    rejectUse(p.show);
    for(const [key,layout] of Object.entries(p.layouts))for(const [plate,entry] of Object.entries(layout)){
      if(owns(entry,'pendingMotion')){
        if(!pending.some(m=>m.id===entry.pendingMotion&&m.layoutSource===key&&m.plateId===plate))throw Error('Orphan pending layout.');
        if(p.show.atoms.some(a=>a.hero?.layout_source===key&&a.hero.plates?.includes(plate)))throw Error('Pending strip is NOT PLAYABLE until SG02.');
      }else rejectUse(entry,key.slice(0,key.lastIndexOf('/')+1));
    }
    p.media.filter(m=>!m.pendingMotion).forEach(m=>rejectUse(m.src));
  }
  async function decodeProject(p){
    for(const m of p.media.filter(m=>m.pendingMotion)){
      const decoded=await decodeImage(p.assets[m.src]),g=m.pendingMotion.geometry;
      if(decoded.width!==g.frames*g.w||decoded.height!==g.h)throw Error('Decoded pending PNG dimensions disagree with the descriptor.');
    }
  }
  root.HMStripAdapter={limits,normalize,buildStripQaPanel,pngHeader,stage,append,validateProject,decodeProject};
  if(typeof module!=='undefined')module.exports=root.HMStripAdapter;
})(globalThis);

/* Import selected images, with fresh asset/layout keys, without opening the source edit. */
if(typeof window!=='undefined') window.addEventListener('DOMContentLoaded',() => {
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
    HMStripAdapter.validateProject(p);
    const result=[],seen=new Set(),pending=new Set((p.media||[]).filter(m=>m.pendingMotion).flatMap(m=>[m.src,p.assets?.[m.src]]));
    function add(src,name){
      if(!src||seen.has(src)||pending.has(src)||pending.has(p.assets?.[src]))return;
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
    request++;busy=false;source=null;items=[];chosen.clear();destination=S.destinationToken();
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
      const current=S.destinationToken();
      if(current.revision!==destination.revision||current.request!==destination.request)throw Error('The destination project changed. Open the importer again.');
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
  // A separate pair picker stages without touching the destination or its history.
  let stripRequest=0,stagedStrip=null,stripDestination=null,stripCommitting=false;
  const stripNotice=(message,error=false)=>{$('stripStatus').textContent=message;$('stripStatus').classList.toggle('error',error);};
  // Structured HM-PF-30 QA rows. Render-only: panel model comes from HMStripAdapter.buildStripQaPanel.
  function renderStripQa(panel){
    const box=$('stripQaPanel');box.hidden=false;
    const fields=$('stripQaFields'),list=$('stripQaWarnings'),errorNote=$('stripQaError');
    fields.replaceChildren();list.replaceChildren();list.hidden=true;errorNote.hidden=true;errorNote.textContent='';
    if(!panel||!panel.ok){
      $('stripQaSummary').textContent='failed · commit disabled';
      errorNote.hidden=false;errorNote.textContent=(panel&&panel.error)||'Strip did not stage; nothing will be saved.';
      return;
    }
    $('stripQaSummary').textContent=panel.summary;
    for(const f of panel.fields){
      const row=document.createElement('div');row.className='strip-qa-row';
      const dt=document.createElement('dt');dt.textContent=f.label;
      const dd=document.createElement('dd');dd.textContent=f.value;
      row.append(dt,dd);fields.append(row);
    }
    list.hidden=!panel.warnings.length;
    for(const w of panel.warnings){
      const li=document.createElement('li');li.setAttribute('data-source',w.source);
      const badge=document.createElement('span');badge.className='strip-qa-source';badge.textContent=w.source==='metadata'?'SOURCE REPORT':w.source.toUpperCase();
      li.append(badge,document.createTextNode(w.text));list.append(li);
    }
  }
  function hideStripQa(){
    $('stripQaPanel').hidden=true;$('stripQaFields').replaceChildren();$('stripQaWarnings').replaceChildren();
    $('stripQaWarnings').hidden=true;$('stripQaError').hidden=true;$('stripQaSummary').textContent='not staged';
  }
  on('importStrip',()=>{
    if(stripCommitting)return;
    stripRequest++;stagedStrip=null;stripDestination=S.destinationToken();
    $('stripInput').value='';$('commitStrip').disabled=true;hideStripQa();
    stripNotice('One PNG ≤33554432 bytes + JSON ≤262144 bytes; ≤32000000 pixels, ≤1024 cells. Body strips only. Unsupported metadata is rejected.');
    $('stripDialog').showModal();
  });
  $('stripDialog').addEventListener('cancel',e=>{if(stripCommitting)e.preventDefault();});
  $('stripDialog').addEventListener('close',()=>{stripRequest++;stagedStrip=null;hideStripQa();});
  $('stripInput').onchange=async e=>{
    if(stripCommitting)return;
    const version=++stripRequest;stagedStrip=null;$('commitStrip').disabled=true;hideStripQa();stripNotice('Validating local pair…');
    try{
      const next=await HMStripAdapter.stage(e.target.files,{cancelled:()=>version!==stripRequest});
      if(version!==stripRequest)return;
      stagedStrip=next;const d=next.pendingMotion,g=d.geometry;
      const panel=HMStripAdapter.buildStripQaPanel(d);renderStripQa(panel);
      stripNotice(next.name+' · '+g.frames+' exported cells · '+d.cadence.secondsPerCell+' s/cell ('+d.cadence.timingSource+') · '+d.policy.kind+' · body_h '+g.body_h+' (standing reference), cell h '+g.h+'. '+JSON.stringify(d.metadata)+' '+d.warnings.join(' ')+' PENDING, NOT PLAYABLE until SG02. Original PNG + JSON bytes will be saved; no motion quality or rights approval is implied.');
      $('commitStrip').disabled=!panel.ok;
    }catch(e){if(version===stripRequest){stripNotice(e.message,true);renderStripQa({ok:false,error:e.message});}}
  };
  on('commitStrip',async()=>{
    if(!stagedStrip||stripCommitting)return;
    const staged=stagedStrip;stripRequest++;
    stripCommitting=true;$('stripFields').disabled=true;stripNotice('Saving pending strip… Cancellation is disabled until the storage transaction finishes.');
    try{
      await S.commitCandidate(stripDestination,p=>HMStripAdapter.append(p,staged));
      $('stripDialog').close();S.status('Pending strip saved with original bytes. NOT PLAYABLE until SG02; unavailable for timeline, background or motion export.');
    }catch(e){stripNotice('Strip was not imported: '+e.message,true);}
    finally{stripCommitting=false;$('stripFields').disabled=false;}
  });
},{once:true});

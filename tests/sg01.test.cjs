/* Transport/gateway tests execute production functions. Image.decode, DOM and
 * HMAssetStore are controlled boundaries here, not browser/IndexedDB proof. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const zlib=require('node:zlib');
const crypto=require('node:crypto');
const A=require('../public/ui/project-media.js');
const {finalTransport,hash}=require('./fixtures/sg01-final.cjs');
const clone=x=>structuredClone(x);
const raw=(extra={})=>({frames:24,w:2,h:4,body_h:2,fps:24,...extra});
const project=()=>({version:1,show:{show_id:'sg01-test',atoms:[],bg:{},overlays:[]},layouts:{},media:[],assets:{}});
const table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(type,data){
  const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);
  let crc=0xffffffff;for(let i=4;i<b.length-4;i++)crc=table[(crc^b[i])&255]^(crc>>>8);
  b.writeUInt32BE((crc^0xffffffff)>>>0,b.length-4);return b;
}
function png(width=48,height=4,length,cellWidth=2,firstNumber=0){
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;
  // Deterministic grayscale cell numbers, no generated media on disk.
  const rows=Buffer.alloc((width+1)*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)rows[y*(width+1)+x+1]=(firstNumber+Math.floor(x/cellWidth))%256;
  const chunks=[Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(rows))];
  const end=chunk('IEND',Buffer.alloc(0)),size=chunks.reduce((s,b)=>s+b.length,0)+end.length;
  if(length){assert.ok(length>=size+12);chunks.push(chunk('npAD',Buffer.alloc(length-size-12)));}
  return Buffer.concat([...chunks,end]);
}
function file(name,bytes,size=bytes.length){return {name,size,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};}
function files(r=raw(),p=png(),j=Buffer.from(JSON.stringify(r))){return [file('strip.png',p),file('sidecar.json',j)];}
const decoded=data=>{const b=Buffer.from(data.slice(22),'base64');return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)};};
const stage=(f=files(),opts={})=>A.stage(f,{decode:async data=>decoded(data),...opts});
async function pending(){const p=project();A.append(p,await stage());return p;}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};

test('SG01 FINAL writer complete periodic sidecar stages and roundtrips exact PNG and JSON',async()=>{
  for(const feet of [false,true]){
    const f=finalTransport('periodic',feet),s=await stage(files(f.raw,f.png,f.json)),p=project();
    assert.equal(hash(f.png),f.raw.cell_record.strip_sha256);
    assert.deepEqual(f.raw.cell_record.cells.map(c=>c.source_frame),f.raw.source_cut.samples);
    A.append(p,s);const reopened=JSON.parse(JSON.stringify(p));A.validateProject(reopened);
    assert.deepEqual(Buffer.from(reopened.assets[p.media[0].src].slice(22),'base64'),f.png);
    assert.deepEqual(Buffer.from(reopened.media[0].pendingMotion.originalJsonBase64,'base64'),f.json);
    assert.equal(s.pendingMotion.policy.kind,'repeat');assert.equal(s.pendingMotion.status,'pending');
    for(const key of ['drawings','cycle_drawings','held_fill','holds','cell_record'])assert.equal(s.pendingMotion.metadata[key],undefined);
  }
});

test('SG01 FINAL inert conditional diagnostics validate then disappear from normalized metadata',async()=>{
  const f=finalTransport(),r=f.raw;
  Object.assign(r,{state:'idle',steps:2,clip_feet:{length:8,cuts:7,same_foot:0,alternate:0,unread:7,seam_in_step:0,same_foot_at:[]},
    ghost_given_way:[{frame:1,ghost:.2,taken:{source:0}},{frame:3,ghost:.1,taken:'rife'}],ghost_kept:[{frame:2,ghost:.3}],wrap_blend:{cells:[6,7],K:2}});
  r.drawings.hold=null;r.drawings.drawings_per_second=null;r.drawings.contrast={};
  r.cycle_drawings.why='7 steps, under 8: too few to read the cut\'s rhythm on its own';
  const reason='held 4 cells, longer than a drawing on threes (3): a hold the motion means, kept as filmed';
  const row={start:0,length:4,filled:false,why:reason,keep:'motion-hold'};
  Object.assign(r.held_fill,{poses:5,held_runs:[{start:0,length:4}],before:{cells:8,poses:5,held_runs:[row],wrap_held:true,wrap:{...row,start:7,length:1,joined:4}},
    wrap_held:true,drawn:2,why:'read as filmed',unmade:{cells:[1],why:'no interpolator'},out_fps:{asked:24,fps:24,applied:false,why:'already at the requested rate'},again:clone(r.held_fill)});
  r.holds=[{from:0,to:1,kind:'motion-hold',reason}];
  const d=(await stage(files(r,f.png))).pendingMotion;
  for(const k of ['state','steps','clip_feet','ghost_given_way','ghost_kept','wrap_blend','drawings','held_fill','holds','cell_record'])assert.equal(d.metadata[k],undefined);
  const p=project();A.append(p,{name:'strip.png',src:'data:image/png;base64,'+f.png.toString('base64'),pendingMotion:d});A.validateProject(p);
});

test('SG01 FINAL root_motion-bearing once/once-return/one-shot including feet remain rejected',async()=>{
  for(const kind of ['once','once-return'])for(const feet of [false,true]){
    const f=finalTransport(kind,feet);assert.ok(f.raw.root_motion);
    await assert.rejects(stage(files(f.raw,f.png,f.json)),/Unsupported strip field: root_motion/);
  }
  // One-shot exclusion probe uses the same known root shapes. This is a negative
  // field-combination test, not a claim of another authenticated producer run.
  for(const feet of [false,true]){
    const f=finalTransport('periodic',feet);
    Object.assign(f.raw,{kind:'one-shot',loop:false,root_motion:finalTransport('once',feet).raw.root_motion});
    await assert.rejects(stage(files(f.raw,f.png)),/Unsupported strip field: root_motion/);
  }
});

test('SG01 FINAL exact nested key/type/finite/array/depth/text whitelist rejects unsafe diagnostics',()=>{
  const base=finalTransport().raw,reject=fn=>{const r=clone(base);fn(r);assert.throws(()=>A.normalize(r));};
  for(const s of ['https://remote/x','/tmp/x','../x','C:\\x','x/../y','javascript:alert(1)','data:text/html,x','<script>x</script>','$(run)','%2e%2e%2fsecret','session credential','x'.repeat(501)])reject(r=>r.cycle_drawings.why=s);
  for(const key of ['path','url','script','session','credentials','constructor','__proto__']){
    for(const target of [r=>r.drawings,r=>r.held_fill.before,r=>r.cell_record.cells[0].scale])reject(r=>Object.defineProperty(target(r),key,{value:'unsafe',enumerable:true}));
  }
  for(const value of [NaN,Infinity,-Infinity,'1',{},[],true,-1,32000001])reject(r=>r.drawings.drawings_per_second=value);
  for(const value of [null,{},'1',1.5,0])reject(r=>r.held_fill.cells=value);
  reject(r=>r.held_fill.made=Array(1025).fill(0));reject(r=>r.held_fill.before.held_runs=Array(1025).fill({start:0,length:2,filled:false}));
  reject(r=>r.held_fill.again={...clone(r.held_fill),again:clone(r.held_fill)});
  reject(r=>r.held_fill.unmade={cells:[],install:'run installer'});reject(r=>r.held_fill.out_fps={asked:24,fps:24,applied:false,install:'run installer'});
  reject(r=>delete r.holds);reject(r=>r.holds=[{from:0,to:4,kind:'drawn',reason:'kept as filmed'}]);
  reject(r=>r.cell_record.cells.pop());reject(r=>r.cell_record.cells[0].source_frame++);
  reject(r=>r.cell_record.cells[0].anchor_move_px=[1,0]);reject(r=>r.cell_record.cells[0].as_filmed='true');
  reject(r=>r.cell_record.cells[0].scale.size_hold=0);reject(r=>r.cell_record.cells[0].scale.gait_fallback=2);
  reject(r=>r.cell_record.strip_sha256='f'.repeat(63));
  for(const extra of [{root_motion:{}},{air_retime:{}},{motion_anchor:{}},{out_fps:48},{foot_anchor:'body',wrap_dx_px:0,seam_ratio_after_anchor:null}])reject(r=>Object.assign(r,extra));
});

test('SG01 FINAL PNG hash binding checks padding lengths, tampering and sync reopen',async()=>{
  for(const total of [192,247,248,255,256,257,312,1000]){
    const f=finalTransport(),p=Buffer.concat([f.png.subarray(0,-12),chunk('npAD',Buffer.alloc(total-f.png.length-12,73)),f.png.subarray(-12)]);
    assert.equal(p.length,total); // includes SHA256 final-block residues55,56,63,0,1
    f.raw.cell_record.strip_sha256=hash(p);await stage(files(f.raw,p));
  }
  const f=finalTransport(),r=clone(f.raw);r.cell_record.strip_sha256='0'.repeat(64);
  await assert.rejects(stage(files(r,f.png)),/SHA256 disagrees/);
  const p=project();A.append(p,await stage(files(f.raw,f.png,f.json)));
  // Same geometry and valid CRCs, different numbered pixels: fails hash before reopen.
  const other=finalTransport('once').png;p.assets[p.media[0].src]='data:image/png;base64,'+other.toString('base64');
  assert.throws(()=>A.validateProject(p),/SHA256 disagrees/);
  const changed=clone(f.raw);changed.held_fill.before.url='https://remote';
  p.assets[p.media[0].src]='data:image/png;base64,'+f.png.toString('base64');
  p.media[0].pendingMotion.originalJsonBase64=Buffer.from(JSON.stringify(changed)).toString('base64');assert.throws(()=>A.validateProject(p),/diagnostics/);
});

// TRANSPORT fixture, not a producer run or motion-quality sample. Synthetic numbered pixels only.
// Exact pinned field/sampling evidence (source read only, never executed):
// https://github.com/aldegad/sprite-gen/blob/6a3f4c47d7f8745853cc06fe66b252636976a442/sprite_gen/video/loop.py#L782-L892
// https://github.com/aldegad/sprite-gen/blob/6a3f4c47d7f8745853cc06fe66b252636976a442/sprite_gen/video/loop.py#L647-L662
// https://github.com/aldegad/sprite-gen/blob/6a3f4c47d7f8745853cc06fe66b252636976a442/sprite_gen/video/loop.py#L3210-L3225
// https://github.com/aldegad/sprite-gen/blob/6a3f4c47d7f8745853cc06fe66b252636976a442/sprite_gen/video/nonloop.py#L190-L204
// source_cut.source is an identity OBJECT, not an invented path:
// https://github.com/aldegad/sprite-gen/blob/6a3f4c47d7f8745853cc06fe66b252636976a442/sprite_gen/video/evidence.py#L14-L34
function transport(kind='periodic',feet=false){
  const indices=kind==='periodic'?[0,2,4,6]:[0,2,5,7],start=kind==='once-return'?0:3,sourceFrames=kind==='once-return'?8:14;
  const r={frames:4,sample_indices:indices,source_rect:feet?null:[-6,2,18,26],w:24,h:24,kind,loop:kind==='periodic',
    body_h:16,body_src_h:16,body_ref:'first-frame',scale:1,delay_ms:83.33,fps:12,cycle_frames:8,cycle_seconds:.3333,
    subsampled:true,cell_cap:4,top_margin_px:2,cell_height_cap:24,body_height_target:16,
    foot_anchor:feet?'feet':'none',drift_px:0,foot_sway_px:feet?2:0,foot_x:feet?12:null};
  if(feet)r.anchor=[12,24];
  // evidence.source_identity hashes concatenated per-file SHA256 digests, not the sheet hash.
  const digests=Array.from({length:sourceFrames},(_,k)=>crypto.createHash('sha256').update(png(24,24,undefined,24,k)).digest());
  r.source_cut={source:{kind:'keyed-frame-sequence',sha256:crypto.createHash('sha256').update(Buffer.concat(digests)).digest('hex'),frames:sourceFrames,fps:24},
    start,length:8,samples:indices.map(k=>start+k)};
  if(kind!=='periodic')Object.assign(r,{hold_last:kind==='once',...(kind==='once-return'?{returns:true}:{}),end_frame:3,events:[{frame:2,name:'motion_peak'}]});
  // Tile actual retained source numbers: periodic excludes the last source cell; nonloop keeps it.
  const rows=Buffer.alloc((r.frames*r.w+1)*r.h);
  for(let y=0;y<r.h;y++)for(let x=0;x<r.frames*r.w;x++)rows[y*(r.frames*r.w+1)+x+1]=start+indices[Math.floor(x/r.w)];
  const base=png(96,24),ihdr=base.subarray(8,33);
  return {r,p:Buffer.concat([base.subarray(0,8),ihdr,chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))])};
}

test('SG01 producer compatibility: periodic maps to repeating policy',()=>{
  assert.equal(A.normalize(raw({kind:'periodic',loop:true})).policy.kind,'repeat');
});
test('SG01 producer compatibility: actual first-frame body refs',()=>{
  for(const body_ref of ['first-frame','cut-first-frame'])assert.equal(A.normalize(raw({body_ref})).metadata.body_ref,body_ref);
});
test('SG01 producer compatibility: source_cut identity and source samples',()=>{
  const {r}=transport();assert.deepEqual(A.normalize(raw({frames:4,source_cut:r.source_cut})).metadata.source_cut,r.source_cut);
});
test('SG01 intermediate build_strip + nonloop transport roundtrip (not FINAL compatibility)',async()=>{
  for(const kind of ['periodic','once','once-return'])for(const feet of [false,true]){
    const {r,p}=transport(kind,feet),bytes=Buffer.from('\uFEFF'+JSON.stringify(r,null,2)+'\n'),staged=await stage(files(r,p,bytes));
    const d=staged.pendingMotion;assert.equal(d.policy.kind,kind==='periodic'?'repeat':kind);assert.equal(d.policy.endFrame,3);
    assert.equal(d.cadence.secondsPerCell,1/12);assert.equal(d.geometry.body_h,16);assert.equal(d.geometry.h,24);
    assert.deepEqual(d.metadata.source_cut,r.source_cut);assert.deepEqual(d.metadata.sample_indices,r.sample_indices);
    if(kind!=='periodic')assert.deepEqual(d.metadata.events,[{frame:2,name:'motion_peak'}]);
    const saved=project();A.append(saved,staged);const reopened=JSON.parse(JSON.stringify(saved));A.validateProject(reopened);
    assert.deepEqual(Buffer.from(reopened.media[0].pendingMotion.originalJsonBase64,'base64'),bytes);
    assert.deepEqual(Buffer.from(reopened.assets[reopened.media[0].src].slice(22),'base64'),p);
    if(kind==='once-return'){
      assert.equal(r.sample_indices.at(-1),7);assert.equal(r.source_cut.start,0);assert.equal(r.source_cut.source.frames,8);
    } // whole clip and actual return endpoint, no pingpong
  }
});

test('SG01 producer initial build_strip supports grounded/null target, scaled crop and cut-first refs',()=>{
  const {r}=transport();delete r.source_cut;
  r.body_ref='tallest-grounded';r.body_height_target=null;
  assert.equal(A.normalize(r).metadata.body_height_target,null);
  Object.assign(r,{scale:.5,w:12,h:12,body_h:8,body_ref:'cut-first-frame',body_ref_frame:3});
  assert.equal(A.normalize(r).metadata.body_ref_frame,3);
  // Scale is rounded to 4 decimals by upstream, not an exact runtime scale.
  Object.assign(r,{scale:.3333,w:8,h:8,body_h:5});assert.equal(A.normalize(r).metadata.scale,.3333);
  Object.assign(r,{scale:0,w:1,h:1,body_h:1,body_src_h:30000,source_rect:[-6,2,18,30010],body_height_target:1,cell_height_cap:1});
  assert.equal(A.normalize(r).metadata.scale,0); // positive 1/30000 rounded to four decimals upstream
  const feet=transport('once',true).r;delete feet.source_cut;
  assert.deepEqual(A.normalize(feet).metadata.anchor,[12,24]);
});

test('SG01 provenance rejects nonfinite/types/ranges/crop and subsampling contradictions',()=>{
  const base=transport('once').r;
  const rejects=mutate=>{const r=clone(base);mutate(r);assert.throws(()=>A.normalize(r));};
  for(const key of ['scale','top_margin_px','cell_height_cap','body_height_target','body_src_h','drift_px','foot_sway_px']){
    for(const value of ['1',false,{},[],NaN,Infinity,-1,32000001])rejects(r=>r[key]=value);
    if(key!=='body_height_target')rejects(r=>r[key]=null);
  }
  for(const value of [0,Number.MIN_VALUE])rejects(r=>r.scale=value);
  for(const value of [0,1.5])rejects(r=>r.body_src_h=value);
  for(const value of [null,[],[0,0,1],[0,0,1,1,2],[0,2,0,26],[-6,-1,18,26],[-6,2,18,NaN],[-6,2,18,'26'],[-6,2,20,26],{x:1}])rejects(r=>r.source_rect=value);
  rejects(r=>r.top_margin_px=1);rejects(r=>r.cell_height_cap=23);rejects(r=>r.body_height_target=15);
  rejects(r=>r.sample_indices=[0,2,2,7]);rejects(r=>r.source_cut.samples=[3,5,7,10]);
  rejects(r=>r.subsampled=false);rejects(r=>r.cell_cap=5);rejects(r=>r.sample_indices=[1,2,5,7]);rejects(r=>r.sample_indices=[0,2,5,6]);
  for(const value of ['body','motion-auto',{},null])rejects(r=>r.foot_anchor=value);
  rejects(r=>r.anchor=[12,24]);rejects(r=>r.foot_x=12);rejects(r=>r.drift_px=1);
  for(const value of [-1,25,NaN,'12',{},null]){const r=transport('once',true).r;r.foot_x=value;assert.throws(()=>A.normalize(r));}
  for(const anchor of [[12,23],[11,24],[12,24,0],{x:12,y:24},['12',24]]){const r=transport('once',true).r;r.anchor=anchor;assert.throws(()=>A.normalize(r));}
  for(const mutate of [r=>r.source_cut.start=-1,r=>r.source_cut.start=7,r=>r.source_cut.length=9,r=>r.source_cut.length=0,
    r=>r.source_cut.source.frames=10,r=>r.source_cut.source.fps='24',r=>r.source_cut.source.fps=Infinity,
    r=>r.source_cut.source.sha256='not-a-digest',r=>r.source_cut.source.kind='session',r=>r.source_cut.samples=[3,5,8],
    r=>r.source_cut.samples=[3,5,8,11],r=>r.source_cut.samples=[3,5,8,NaN],r=>r.body_ref_frame=14])rejects(mutate);
});

test('SG01 nested provenance never admits URLs, paths, scripts, sessions or unknown diagnostics',async()=>{
  const {r,p}=transport('once');
  const reject=mutate=>{const changed=clone(r);mutate(changed);assert.throws(()=>A.normalize(changed));return changed;};
  for(const value of ['https://remote/frames','//remote/frames','/tmp/frames','../frames','C:\\frames','frames/../x','frames','javascript:alert(1)','data:text/html,<script>x</script>',{session:'credential'}]){
    reject(x=>x.source_cut.source=value);
    reject(x=>x.source_cut.source.path=value);
    reject(x=>x.source_cut.source.sha256=value);
  }
  for(const key of ['url','path','script','session','credentials','__proto__','provenance']){
    for(const target of ['source_cut','source','event'])reject(x=>Object.defineProperty(target==='source'?x.source_cut.source:target==='event'?x.events[0]:x.source_cut,key,{value:{payload:'javascript:alert(1)'},enumerable:true}));
  }
  for(const extra of [{times:[3,5,8,10]},{samples:{frame:3}},{source:{}}])reject(x=>Object.assign(x.source_cut,extra));
  for(const events of [[],[{frame:4,name:'motion_peak'}],[{frame:1.5,name:'motion_peak'}],[{frame:2,name:'javascript:alert(1)'}],[{frame:2,name:'motion_peak',url:'https://remote'}],Array(1025).fill({frame:0,name:'motion_peak'})])reject(x=>x.events=events);
  for(const key of ['out_fps','state','steps','drawings','cycle_drawings','clip_feet','held_fill','holds','air_retime','ghost_given_way','ghost_kept','wrap_blend','motion_anchor','wrap_dx_px','seam_ratio_after_anchor','cell_record','root_motion','rootmotion','lifetime','additive','session','script'])reject(x=>x[key]={});
  const saved=project();A.append(saved,await stage(files(r,p)));
  const changed=reject(x=>x.source_cut.source.session='credential');
  saved.media[0].pendingMotion.originalJsonBase64=Buffer.from(JSON.stringify(changed)).toString('base64');
  assert.throws(()=>A.validateProject(saved)); // original bytes must pass the same nested contract on reopen
  const normalized=A.normalize(r);r.source_cut.source.sha256='0'.repeat(64);r.events[0].frame=0;
  assert.notEqual(normalized.metadata.source_cut.source.sha256,r.source_cut.source.sha256);
  assert.equal(normalized.metadata.events[0].frame,2); // no retained mutable input objects
});

test('SG01 exact byte caps pass; +1 caps reject before reads/decode',async()=>{
  const bigPng=png(48,4,33554432),json=Buffer.from(JSON.stringify(raw()).padEnd(262144,' '));
  const next=await stage(files(raw(),bigPng,json));
  assert.equal(Buffer.from(next.src.slice(22),'base64').length,33554432);
  assert.deepEqual(Buffer.from(next.pendingMotion.originalJsonBase64,'base64'),json);
  for(const [index,size] of [[0,33554433],[1,262145]]){
    const f=files();f[index].size=size;f[index].arrayBuffer=()=>{throw Error('must not read');};
    await assert.rejects(stage(f),/limit/);
  }
  // A dishonest File.size is checked again against actual byte length.
  await assert.rejects(stage([file('a.png',Buffer.alloc(33554433),1),files()[1]]),/PNG limit/);
  await assert.rejects(stage([files()[0],file('a.json',Buffer.alloc(262145),1)]),/JSON limit/);
});

test('SG01 exact/+1 decoded pixels and exported cell counts',async()=>{
  const r=raw({frames:1,w:8000,h:4000,body_h:100});
  assert.equal((await stage(files(r,png(8000,4000)))).pendingMotion.geometry.h,4000);
  const plus=raw({frames:1,w:32000001,h:1,body_h:1});
  assert.throws(()=>A.normalize(plus),/32000000/);
  const header=png(1,1);header.writeUInt32BE(32000001,16);
  await assert.rejects(stage(files(raw({frames:1,w:1,h:1,body_h:1}),header)),/32000000/);
  assert.equal((await stage(files(raw({frames:1024}),png(2048,4)))).pendingMotion.geometry.frames,1024);
  await assert.rejects(stage(files(raw({frames:1025}),png(2050,4))),/1024/);
});

test('SG01 intermediate timing/endpoint policy retains cadence/body reference (not FINAL nonloop support)',()=>{
  const d=A.normalize(raw({source_fps:60,cycle_frames:48,cycle_seconds:2,subsampled:true,sample_indices:Array.from({length:24},(_,i)=>i*2)}));
  assert.equal(d.cadence.secondsPerCell,1/24);assert.equal(d.geometry.body_h,2);assert.equal(d.geometry.h,4);
  assert.equal(d.policy.kind,'repeat');assert.equal(d.policy.loop,true);assert.equal(d.metadata.source_fps,60);
  assert.equal(d.metadata.sample_indices.length,24);assert.match(d.warnings[0],/not reconstructed/);
  const legacy=raw();delete legacy.fps;
  assert.equal(A.normalize({...legacy,delay_ms:41.67}).cadence.secondsPerCell,1/24);
  assert.equal(A.normalize({...legacy,delay_ms:42}).cadence.secondsPerCell,.042);
  assert.equal(A.normalize({...legacy,delay_ms:41.69}).cadence.secondsPerCell,.04169);
  assert.equal(A.normalize(raw({delay_ms:42})).cadence.timingSource,'fps');
  for(const kind of ['once','one-shot','once-return']){
    const p=A.normalize(raw({kind,loop:false,...(kind==='once-return'?{returns:true,hold_last:false}:{hold_last:true}),end_frame:23})).policy;
    assert.equal(p.endFrame,23);assert.equal(p.loop,false);assert.equal(p.returns,kind==='once-return');
    assert.equal(p.holdLast,kind!=='once-return');
  }
});

test('SG01 rejects wrong types, nonfinite values, counts, geometry and unsafe semantics',()=>{
  for(const key of ['frames','w','h','body_h']){const r=raw();delete r[key];assert.throws(()=>A.normalize(r),undefined,'missing '+key);}
  for(const key of ['frames','w','h','body_h'])for(const value of [0,-1,.5,'24',null,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>A.normalize(raw({[key]:value})),undefined,key+'='+value);
  for(const key of ['fps','delay_ms','cycle_seconds','source_fps','body_src_h'])for(const value of [0,-1,'24',null,NaN,Infinity])assert.throws(()=>A.normalize(raw({[key]:value})),undefined,key+'='+value);
  for(const key of ['cycle_frames','cell_cap'])for(const value of [0,.5,'24',Infinity,23])assert.throws(()=>A.normalize(raw({[key]:value})));
  for(const value of [null,false,24,[],{}])assert.throws(()=>A.normalize(raw({kind:value})),/Unsupported body-strip kind/);
  for(const extra of [{body_h:5},{w:Number.MAX_SAFE_INTEGER},{fps:Number.MIN_VALUE},{sample_indices:[0]},{sample_indices:Array(24).fill(-1)},{sample_indices:Array.from({length:24},(_,i)=>24-i)},{cycle_frames:24,sample_indices:Array(24).fill(24)},{loop:'true'},{kind:'once',loop:true},{kind:'once-return',hold_last:true},{end_frame:24},{body_ref_frame:-1},{body_ref:'unknown'},{kind:'lifetime'},{blend:'additive'},{rootmotion:{}},{root_motion:{}},{sprite_sheet_alpha:'sheet.png'},{source_cut:{path:'/tmp/source.png'}},{src:'https://remote/image.png'},{src:'/absolute.png'},{src:'../image.png'},{path:'C:\\image.png'},{durations_ms:[42]},{version:1},{warnings:['https://remote/file']}])assert.throws(()=>A.normalize(raw(extra)),undefined,JSON.stringify(extra));
  for(const value of [null,[],42,'{}'])assert.throws(()=>A.normalize(value));
  const noTiming=raw();delete noTiming.fps;assert.throws(()=>A.normalize(noTiming),/delay_ms/);
});

test('SG01 missing/corrupt PNG, JSON, geometry and header/decode disagreement fail staging',async()=>{
  for(const f of [[],[files()[0]], [...files(),files()[0]],[file('strip.zip',png()),files()[1]]])await assert.rejects(stage(f),/exactly one/);
  for(const name of ['https://x.png','/absolute.png','../strip.png','C:\\strip.png'])await assert.rejects(stage([file(name,png()),files()[1]]),/filenames/);
  const ordinary=files();ordinary[0].name='動作 strip..final.png';assert.equal((await stage(ordinary)).name,ordinary[0].name);
  for(const bytes of [Buffer.alloc(50),png().subarray(0,40),Buffer.concat([png(),Buffer.from([0])])])await assert.rejects(stage(files(raw(),bytes)),/PNG/);
  const corrupt=png();corrupt[45]^=1;await assert.rejects(stage(files(raw(),corrupt)),/checksum/);
  const p=png(),animated=Buffer.concat([p.subarray(0,33),chunk('acTL',Buffer.alloc(8)),p.subarray(33)]);
  await assert.rejects(stage(files(raw(),animated)),/Animated PNG/);
  await assert.rejects(stage(files(raw(),Buffer.concat([p.subarray(0,33),chunk('IEND',Buffer.alloc(0))]))),/Incomplete PNG/);
  await assert.rejects(stage(files(raw(),png(49,4))),/exactly/);
  await assert.rejects(stage(files(raw(),png(),Buffer.from('{'))),/JSON/);
  await assert.rejects(stage(files(raw(),png(),Buffer.from([255]))));
  await assert.rejects(stage(files(),{decode:async()=>({width:49,height:4})}),/disagree/);
  await assert.rejects(stage(files(),{decode:async()=>{throw Error('decode failed');}}),/decode failed/);
});

test('SG01 cancellation before/after decode never appends',async()=>{
  let calls=0;await assert.rejects(stage(files(),{cancelled:()=>true,decode:()=>{calls++;}}),/cancelled/);assert.equal(calls,0);
  const gate=deferred();let cancelled=false;
  const work=stage(files(),{cancelled:()=>cancelled,decode:()=>gate.promise});
  await new Promise(setImmediate);cancelled=true;gate.resolve({width:48,height:4});await assert.rejects(work,/cancelled/);
});

test('SG01 original bytes + descriptor survive complete-project JSON save/reopen, fresh identities',async()=>{
  const p=project(),bytes=Buffer.from('\uFEFF'+JSON.stringify(raw(),null,2)+'\n');
  const staged=await stage(files(raw(),png(),bytes));A.append(p,staged);A.append(p,staged);
  assert.notEqual(p.media[0].id,p.media[1].id);assert.notEqual(p.media[0].src,p.media[1].src);
  const reopened=JSON.parse(JSON.stringify(p));A.validateProject(reopened);
  assert.deepEqual(reopened,p);
  assert.deepEqual(Buffer.from(reopened.media[0].pendingMotion.originalJsonBase64,'base64'),bytes);
  assert.deepEqual(Buffer.from(reopened.assets[reopened.media[0].src].slice(22),'base64'),png());
});

test('SG01 reopened descriptor cannot smuggle metadata, bytes, remote/absolute/traversal paths',async()=>{
  const original=await pending();
  const reject=mutate=>{const p=clone(original);mutate(p,p.media[0]);assert.throws(()=>A.validateProject(p));};
  reject((p,m)=>m.pendingMotion.metadata.src='https://remote/x.png');
  reject((p,m)=>m.pendingMotion.cadence.secondsPerCell='0.1');
  reject((p,m)=>m.pendingMotion.geometry.w=3);
  reject((p,m)=>m.pendingMotion.originalJsonBase64=Buffer.from(JSON.stringify(raw({src:'../strip.png'}))).toString('base64'));
  reject((p,m)=>m.pendingMotion.originalJsonBase64+='!');
  reject((p,m)=>m.pendingMotion.originalJsonBase64=Buffer.alloc(262145,32).toString('base64'));
  reject((p,m)=>{const bytes=png();bytes[45]^=1;p.assets[m.src]='data:image/png;base64,'+bytes.toString('base64');});
  reject((p,m)=>p.assets[m.src]+='!');
  reject((p,m)=>m.pendingMotion=null);
  reject((p,m)=>delete m.pendingMotion);
  reject((p,m)=>m.url='https://remote');
  for(const field of ['id','src','layoutSource','plateId'])for(const value of ['https://remote/x','/absolute','../escape'])reject((p,m)=>m[field]=value);
  reject((p,m)=>p.layouts[m.layoutSource].P01.full='https://remote');
  reject((p,m)=>p.media.push(clone(m)));
});

test('SG01 pending aliases are rejected in plate/replacement/background/foreground/overlay routes',async()=>{
  const original=await pending();
  const mutations=[
    (p,m)=>p.show.atoms.push({hero:{layout_source:m.layoutSource,plates:['P01']}}),
    (p,m)=>p.show.bg.base=m.src,
    (p,m)=>p.show.bg.base='/'+m.src,
    (p,m)=>p.show.bg.base=p.assets[m.src],
    (p,m)=>p.show.atoms.push({background:{src:m.src}}),
    (p,m)=>p.show.fg={props:[{src:m.src}]},
    (p,m)=>p.show.overlays=[{src:m.src}],
    (p,m)=>{p.assets.alias=p.assets[m.src];p.show.bg.base='alias';},
    (p,m)=>p.layouts['imports/ordinary/layout.json']={P01:{full:'../'+m.id+'/strip.png'}},
    (p,m)=>p.layouts['ordinary/layout.json']={P01:{parts:[{src:'/imports/'+m.id+'/strip.png'}]}},
    (p,m)=>p.media.push({id:'ordinary',src:p.assets[m.src]}),
  ];
  for(const mutate of mutations){const p=clone(original);mutate(p,p.media[0]);assert.throws(()=>A.validateProject(p),/NOT PLAYABLE/);}
});

// Evaluate the actual app closure through its commit gateway. The later event
// bindings/boot are omitted; render/compile/storage are explicit test boundaries.
const appSource=fs.readFileSync('public/ui/app.js','utf8');
const section=(from,to)=>appSource.slice(appSource.indexOf(from),appSource.indexOf(to));
function gateway(initial=project(),{put,Image,FileReader,confirm}={}){
  const elements=new Map(),workspace={inert:false},controls=[{disabled:false,closest:()=>null},{disabled:true,closest:()=>null}];
  const el=id=>{if(!elements.has(id))elements.set(id,{textContent:'',value:'',style:{},classList:{add(){}}});return elements.get(id);};
  const state={stored:clone(initial),writes:[],updates:0,compiles:0,pauses:0};
  class HeaderImage{set src(data){this.data=data;}async decode(){const d=decoded(this.data);this.naturalWidth=d.width;this.naturalHeight=d.height;}}
  const context=vm.createContext({structuredClone,URL,TextDecoder,Uint8Array,DataView,atob,btoa,crypto,console,
    Image:Image||HeaderImage,FileReader,
    document:{getElementById:el,querySelector:()=>workspace,querySelectorAll:()=>controls},
    window:{history:{replaceState(){}}},location:{href:'https://hm.local/ui/'},
    HMAssetStore:{put:async(key,value)=>{state.writes.push(clone(value));if(put)await put(key,value,state);state.stored=clone(value);}},
    HMComposeClient:{reflowAllCamChains(){},detachCamChain(){}},
  });
  if(confirm!==undefined)context.window.confirm=confirm;
  vm.runInContext(fs.readFileSync('public/ui/project-media.js','utf8').split('/* Import selected images')[0],context);
  const source=appSource.slice(0,appSource.indexOf('  function captionOverlays'))+
    section('  function renderMedia()', '  function beatTickMarkup')+
    section('  async function importImages(', '  function download(')+
    section('  async function compile()', '  function activeAtFor(')+`
    const realCompile=compile;
    function update(){testState.updates++;}function pause(){testState.pauses++;}
    compile=async()=>{testState.compiles++;};
    globalThis.G={initialize(p){project=copy(p);history=[copy(p)];historyIndex=0;},
      snapshot:()=>copy({project,history,historyIndex,selected,time,projectRevision,loadRequest}),
      destinationToken,commitCandidate,edit,restore,load,openProject,confirmReplaceOpenProject,persist,writeSnapshot,
      importImages,addMedia,validate,realCompile,get live(){return project;},get locked(){return snapshotCommit;}};
  })();`;
  context.testState=state;vm.runInContext(source,context,{filename:'public/ui/app.js (gateway)'});
  context.G.initialize(initial);
  return {G:context.G,state,workspace,controls,el,context};
}

test('SG01 cancelled open preserves project, history, request and storage without pausing',async()=>{
  const messages=[],g=gateway(project(),{confirm:message=>{messages.push(message);return false;}});
  g.G.edit(()=>{g.G.live.show.title='Session work';});await new Promise(setImmediate);
  const before=g.G.snapshot(),state=clone(g.state);
  const next={...project(),show:{...project().show,show_id:'replacement'}};
  assert.equal(await g.G.openProject(Promise.resolve(next)),false);
  assert.deepEqual(g.G.snapshot(),before);assert.deepEqual(g.state,state);
  assert.equal(g.el('status').textContent,'Kept the open project.');
  assert.deepEqual(messages,['Open project? This will replace the currently open project and discard its session work. Use Save project first to keep your work.']);
});

test('SG01 cancelled new-project confirmation short-circuits load',async()=>{
  const messages=[],g=gateway(project(),{confirm:message=>{messages.push(message);return false;}});
  const before=g.G.snapshot(),state=clone(g.state);
  const create=()=>g.G.confirmReplaceOpenProject('New project')&&g.G.load(project());
  assert.equal(await create(),false);
  assert.deepEqual(g.G.snapshot(),before);assert.deepEqual(g.state,state);
  assert.equal(g.el('status').textContent,'Kept the open project.');
  assert.match(messages[0],/^New project\? /);assert.equal(messages.length,1);
});

test('SG01 accepted open replaces and persists the project after one confirmation',async()=>{
  let calls=0;const g=gateway(project(),{confirm:()=>{calls++;return true;}});
  const next={...project(),show:{...project().show,show_id:'replacement'}};
  assert.equal(await g.G.openProject(Promise.resolve(next)),true);
  assert.equal(calls,1);assert.deepEqual(g.G.snapshot().project,next);
  assert.deepEqual(g.G.snapshot().history,[next]);assert.deepEqual(g.state.stored,next);
  assert.equal(g.state.writes.length,1);
});

test('SG01 boot confirmation and direct load stay silent',async()=>{
  const g=gateway(null,{confirm:()=>{throw Error('unexpected confirmation');}});
  assert.equal(g.G.confirmReplaceOpenProject('Open project'),true);
  assert.equal(await g.G.openProject(Promise.resolve(project())),true);
  assert.equal(await g.G.load(project()),true);
});

test('SG01 quota/abort/mutator errors preserve live, history, selection and stored snapshot',async()=>{
  const staged=await stage();
  for(const name of ['QuotaExceededError','AbortError']){
    const g= gateway(project(),{put:async()=>{throw Object.assign(Error(name),{name});}}),before=g.G.snapshot();
    await assert.rejects(g.G.commitCandidate(g.G.destinationToken(),p=>A.append(p,staged)),new RegExp(name));
    assert.deepEqual(g.G.snapshot(),before);assert.deepEqual(g.state.stored,project());
    assert.equal(g.workspace.inert,false);assert.deepEqual(g.controls.map(c=>c.disabled),[false,true]);assert.equal(g.state.updates,0);
  }
  const g=gateway(),before=g.G.snapshot();
  await assert.rejects(g.G.commitCandidate(g.G.destinationToken(),()=>{throw Error('prepare');}),/prepare/);
  assert.deepEqual(g.G.snapshot(),before);assert.equal(g.state.writes.length,0);assert.equal(g.G.locked,false);
});

test('SG01 candidate token errors and validation failures write nothing',async()=>{
  for(const token of [null,{}, {revision:99,request:0},{revision:0,request:99}]){
    const g=gateway(),before=g.G.snapshot();let calls=0;
    await assert.rejects(g.G.commitCandidate(token,()=>calls++),/destination changed/);
    assert.deepEqual(g.G.snapshot(),before);assert.equal(calls,0);assert.equal(g.state.writes.length,0);
  }
  const g=gateway(),before=g.G.snapshot();
  await assert.rejects(g.G.commitCandidate(g.G.destinationToken(),p=>p.show.show_id='bad ID'),/Project ID/);
  assert.deepEqual(g.G.snapshot(),before);assert.equal(g.state.writes.length,0);
});

test('SG01 delayed autosave drains before durable candidate; live/history publish only after completion',async()=>{
  const first=deferred(),second=deferred();let writes=0;
  const g=gateway(project(),{put:()=>++writes===1?first.promise:second.promise});
  const old=g.G.snapshot(),prior=g.G.persist();await new Promise(setImmediate);
  const staged=await stage(),work=g.G.commitCandidate(g.G.destinationToken(),p=>A.append(p,staged));
  assert.equal(g.G.locked,true);assert.equal(g.state.writes.length,1);assert.deepEqual(g.G.snapshot(),old);
  first.resolve();await prior;await new Promise(setImmediate);
  assert.equal(g.state.writes.length,2);assert.deepEqual(g.G.snapshot(),old);assert.deepEqual(g.state.stored,project());
  second.resolve();await work;
  assert.equal(g.G.snapshot().project.media.length,1);assert.equal(g.G.snapshot().history.length,2);
  assert.deepEqual(g.state.stored,g.G.snapshot().project);assert.equal(g.G.locked,false);
  await new Promise(setImmediate);assert.equal(g.state.writes.length,2);
});

test('SG01 lock covers callback and edit/open/new/undo/persist races; callback cannot mutate published candidate',async()=>{
  const gate=deferred(),g=gateway(project(),{put:()=>gate.promise}),staged=await stage();let retained;
  const work=g.G.commitCandidate(g.G.destinationToken(),p=>{
    retained=p;assert.throws(()=>g.G.edit(()=>{}),/transaction/);A.append(p,staged);
  });
  for(const fn of [()=>g.G.edit(()=>{}),()=>g.G.restore(-1),()=>g.G.addMedia({pendingMotion:{}})])assert.throws(fn);
  for(const work of [g.G.openProject(Promise.resolve(project())),g.G.load(project()),g.G.persist(),g.G.commitCandidate(g.G.destinationToken(),()=>{})])await assert.rejects(work,/transaction/);
  retained.media=[];await new Promise(setImmediate);gate.resolve();await work;
  assert.equal(g.G.snapshot().project.media.length,1);assert.deepEqual(g.state.stored,g.G.snapshot().project);
});

test('SG01 edit/open/new/undo invalidate staged destinations; in-flight open blocks commit',async()=>{
  const staged=await stage();
  for(const action of ['edit','open','new','undo']){
    const g=gateway(),token=g.G.destinationToken();
    if(action==='edit')g.G.edit(()=>{g.G.live.show.title='Changed title';});
    if(action==='open')await g.G.openProject(Promise.resolve(project()));
    if(action==='new')await g.G.load({...project(),show:{...project().show,show_id:'new-project'}});
    if(action==='undo'){g.G.edit(()=>{g.G.live.show.title='Changed title';});g.G.restore(-1);}
    await new Promise(setImmediate);
    const before=g.G.snapshot(),writes=g.state.writes.length;
    await assert.rejects(g.G.commitCandidate(token,p=>A.append(p,staged)),/destination changed/);
    assert.deepEqual(g.G.snapshot(),before);assert.equal(g.state.writes.length,writes);
  }
  const gate=deferred(),g=gateway(),open=g.G.openProject(gate.promise);
  await assert.rejects(g.G.commitCandidate(g.G.destinationToken(),()=>{}),/operation/);assert.equal(g.state.writes.length,0);
  gate.resolve(project());await open;
});

test('SG01 actual edit validation and compile gate stop pending before renderer/export composition',async()=>{
  const p=await pending(),g=gateway(p),m=p.media[0],before=g.G.snapshot();
  assert.throws(()=>g.G.addMedia(m),/NOT PLAYABLE/);
  for(const mutate of [p=>p.show.bg.base=m.src,p=>p.show.atoms.push({id:'plate',duration_s:.5,plates_needed:1,pose_mode:'hero',hero:{layout_source:m.layoutSource,plates:['P01']}})]){
    assert.throws(()=>g.G.edit(()=>mutate(g.G.live)),/NOT PLAYABLE/);
    assert.deepEqual(g.G.snapshot(),before);
    await assert.rejects(g.G.commitCandidate(g.G.destinationToken(),mutate),/NOT PLAYABLE/);
  }
  const invalid=clone(p);invalid.show.bg.base=m.src;g.G.initialize(invalid);
  await assert.rejects(g.G.realCompile(),/NOT PLAYABLE/);assert.equal(g.state.writes.length,0);
  g.G.initialize(p);assert.deepEqual(g.G.snapshot(),before);
});

test('SG01 old projects/images load and undo; delayed image failure cannot roll back newer project',async()=>{
  class Reader{readAsDataURL(){this.result='data:image/png;base64,'+png().toString('base64');this.onload();}}
  class Image{async decode(){}}
  const g=gateway(project(),{FileReader:Reader,Image});
  await g.G.importImages([{type:'image/png',size:100,name:'old.png'}]);
  assert.equal(g.G.snapshot().project.media.length,1);assert.equal(g.G.snapshot().project.show.atoms.length,1);
  g.G.restore(-1);assert.equal(g.G.snapshot().project.media.length,0);
  await g.G.load(project());assert.equal(g.G.snapshot().project.show.show_id,'sg01-test');
  const gate=deferred();class DelayedImage{decode(){return gate.promise;}}
  const race=gateway(project(),{FileReader:Reader,Image:DelayedImage}),importing=race.G.importImages([{type:'image/png',size:100,name:'old.png'}]);
  await new Promise(setImmediate);await race.G.load({...project(),show:{...project().show,show_id:'new-project'}});
  const before=race.G.snapshot();gate.reject(Error('bad decode'));await assert.rejects(importing,/bad decode/);assert.deepEqual(race.G.snapshot(),before);
  const delay=deferred();class SuccessfulDelay{decode(){return delay.promise;}}
  const r=gateway(project(),{FileReader:Reader,Image:SuccessfulDelay}),im=r.G.importImages([{type:'image/png',size:100,name:'old.png'}]);
  await new Promise(setImmediate);await r.G.load(project());const unchanged=r.G.snapshot();delay.resolve();await assert.rejects(im,/destination changed/);assert.deepEqual(r.G.snapshot(),unchanged);
});

test('SG01 reopen decodes before load publication, rejects disagreement and preserves bytes on success',async()=>{
  const p=await pending(),g=gateway();await g.G.load(JSON.parse(JSON.stringify(p)));assert.deepEqual(g.G.snapshot().project,p);
  class BadImage{async decode(){this.naturalWidth=1;this.naturalHeight=1;}}
  const bad=gateway(project(),{Image:BadImage}),before=bad.G.snapshot();
  await assert.rejects(bad.G.load(p),/disagree/);
  assert.deepEqual(bad.G.snapshot().project,before.project);assert.deepEqual(bad.G.snapshot().history,before.history);assert.equal(bad.state.writes.length,0);
});

function importer(g){
  const elements=new Map(),clicks={},messages=[];let init;
  function element(id){
    if(elements.has(id))return elements.get(id);
    const events={},e={id,value:'',disabled:false,textContent:'',children:[],open:false,
      classList:{toggle(){}},setAttribute(){},append(...nodes){this.children.push(...nodes);},replaceChildren(){this.children=[];},
      querySelectorAll(){return this.children.flatMap(node=>node.children||[]).filter(node=>node.type==='checkbox');},
      addEventListener(type,fn){(events[type]||=[]).push(fn);},
      showModal(){this.open=true;},close(){this.open=false;this.emit('close',{});},
      emit(type,event){for(const fn of events[type]||[])fn(event);},};
    elements.set(id,e);return e;
  }
  const S={$:element,on:(id,fn)=>{clicks[id]=fn;},destinationToken:g.G.destinationToken,commitCandidate:g.G.commitCandidate,
    editProject:fn=>g.G.edit(()=>fn(g.G.live)),status:(...args)=>messages.push(args),builtIn:async()=>project(),get project(){return clone(g.G.snapshot().project);}};
  g.context.window.HMStudio=S;g.context.window.addEventListener=(name,fn)=>{assert.equal(name,'DOMContentLoaded');init=fn;};
  g.context.document.createElement=tag=>element('created-'+tag+'-'+crypto.randomUUID());
  g.context.FileReader=class{readAsDataURL(blob){this.result=blob.data;this.onload();}};
  vm.runInContext(fs.readFileSync('public/ui/project-media.js','utf8'),g.context);init();
  return {clicks,element,messages,S};
}

test('SG01 actual dialog cancels staging, locks cancellation during commit and ignores queued picker callbacks',async()=>{
  const gate=deferred(),g=gateway(project(),{put:()=>gate.promise}),ui=importer(g),before=g.G.snapshot();
  ui.clicks.importStrip();assert.equal(ui.element('stripDialog').open,true);
  const wait=deferred(),slow=files();slow[0].arrayBuffer=()=>wait.promise;
  const reading=ui.element('stripInput').onchange({target:{files:slow}});
  ui.element('stripDialog').close();wait.resolve(Uint8Array.from(png()).buffer);await reading;
  assert.equal(ui.element('commitStrip').disabled,true);assert.deepEqual(g.G.snapshot(),before);assert.equal(g.state.writes.length,0);
  ui.clicks.importStrip();await ui.element('stripInput').onchange({target:{files:files()}});
  assert.equal(ui.element('commitStrip').disabled,false);assert.match(ui.element('stripStatus').textContent,/PENDING, NOT PLAYABLE/);
  const committing=ui.clicks.commitStrip();assert.equal(ui.element('stripFields').disabled,true);
  let prevented=false;ui.element('stripDialog').emit('cancel',{preventDefault(){prevented=true;}});assert.equal(prevented,true);
  await ui.element('stripInput').onchange({target:{files:[]}});ui.clicks.importStrip();
  assert.deepEqual(g.G.snapshot(),before);gate.resolve();await committing;
  assert.equal(ui.element('stripDialog').open,false);assert.equal(g.G.snapshot().project.media.length,1);
  assert.equal(ui.element('stripFields').disabled,false);
});

test('SG01 actual selected-project-image importer preserves old imports and excludes pending bytes/aliases',async()=>{
  const source=await pending(),old='data:image/png;base64,'+png(1,1).toString('base64');
  source.assets['old.png']=old;source.assets.alias=source.assets[source.media[0].src];
  source.media.push({id:'old',name:'Old image',src:'old.png',layoutSource:'old/layout.json',plateId:'P01'});
  source.layouts['old/layout.json']={P01:{full:'old.png'}};
  const g=gateway(),ui=importer(g);ui.clicks.importProjectImages();
  await ui.element('projectMediaInput').onchange({target:{files:[{size:100,text:async()=>JSON.stringify(source)}],value:'project'}});
  assert.equal(ui.element('projectMediaGrid').children.length,1);
  ui.clicks.selectAllProjectImages();await ui.clicks.importSelectedProjectImages();
  const saved=g.G.snapshot().project;assert.equal(saved.media.length,1);assert.equal(saved.media[0].name,'Old image');
  assert.equal(saved.media[0].pendingMotion,undefined);assert.equal(saved.assets[saved.media[0].src],old);
  assert.equal(saved.show.atoms.length,0);
  const stale=gateway(),u=importer(stale);u.clicks.importProjectImages();
  await u.element('projectMediaInput').onchange({target:{files:[{size:100,text:async()=>JSON.stringify(source)}]}});
  u.clicks.selectAllProjectImages();await stale.G.load(project());const before=stale.G.snapshot();
  await u.clicks.importSelectedProjectImages();assert.deepEqual(stale.G.snapshot(),before);assert.match(u.element('projectMediaStatus').textContent,/destination project changed/);
  const invalid=clone(source);invalid.media[0].pendingMotion.metadata.src='https://remote';
  u.clicks.importProjectImages();await u.element('projectMediaInput').onchange({target:{files:[{size:100,text:async()=>JSON.stringify(invalid)}]}});
  assert.equal(u.element('projectMediaGrid').children.length,0);assert.match(u.element('projectMediaStatus').textContent,/disagrees/);
});

test('SG01 existing portable save includes pending original bytes without claiming motion composition',async()=>{
  const p=await pending(),g=gateway(p),exportsSource=fs.readFileSync('public/ui/exports.js','utf8');
  g.context.S={get project(){return clone(g.G.snapshot().project);},compile:g.G.realCompile};
  g.context.fetch=()=>{throw Error('unexpected network');};
  const from=exportsSource.indexOf('  function dataUrl('),to=exportsSource.indexOf('  const exportIds');
  vm.runInContext(exportsSource.slice(from,to)+'\nglobalThis.pack=portable;',g.context);
  const pack=await g.context.pack();assert.equal(pack.result,null);assert.deepEqual(clone(pack.project),p);
  A.validateProject(JSON.parse(JSON.stringify(pack.project)));
  const bad=clone(p);bad.show.atoms=[{id:'bad',duration_s:.5,plates_needed:1,pose_mode:'hero',hero:{layout_source:p.media[0].layoutSource,plates:['P01']}}];
  g.G.initialize(bad);await assert.rejects(g.context.pack(),/NOT PLAYABLE/);
});

/* HM-PF-30 strip QA panel: pure model + actual dialog wiring through a vm harness.
 * No DOM library; the strip pair is the same deterministic numbered-pixel transport
 * shape as tests/sg01.test.cjs. Renderer clock (secondsPerCell) is asserted unchanged. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const zlib=require('node:zlib');
const A=require('../public/ui/project-media.js');
const raw=(extra={})=>Object.assign({frames:24,w:2,h:4,body_h:2,fps:24},extra);
const panel=extra=>{const sidecar=raw(extra);return A.buildStripQaPanel(A.normalize(sidecar),sidecar);};
const byKey=(model,key)=>model.fields.find(f=>f.key===key);
const texts=(model)=>model.warnings.map(w=>w.source+':'+w.text);

test('HM-PF-30 panel model exposes frames, delay, body_h, policy, timing source and duration',()=>{
  const model=panel({delay_ms:41.67,source_fps:24,cycle_frames:24,warnings:['held cells kept as filmed']});
  assert.equal(model.ok,true);
  assert.equal(byKey(model,'frames').value,'24 exported cells');
  assert.equal(byKey(model,'delayMs').value,'41.67 ms (raw · sidecar fps 24)');
  assert.equal(byKey(model,'bodyH').value,'2 px standing · cell h 4 px');
  assert.equal(byKey(model,'policy').value,'repeat · loop true · returns false · hold-last false · end frame 23');
  assert.equal(byKey(model,'timingSource').value,'fps');
  assert.equal(byKey(model,'duration').value,'1 s (24 × 0.042 s/cell)');
  assert.equal(byKey(model,'sourceFps').value,'source_fps 24 · export fps 24');
});

test('HM-PF-30 delay_ms falls back to a derived value from the cadence timing source',()=>{
  const model=panel({});
  assert.equal(byKey(model,'delayMs').value,'≈41.667 ms (derived from fps)');
  assert.equal(byKey(model,'sourceFps'),undefined);
  const delayed=A.normalize(raw({frames:12,fps:12,cycle_frames:24,subsampled:true,sample_indices:[0,2,4,6,8,10,12,14,16,18,20,22]}));
  delete delayed.originalJsonBase64;
  const sidecar={frames:12,w:2,h:4,body_h:2,fps:12,cycle_frames:24,subsampled:true,sample_indices:[0,2,4,6,8,10,12,14,16,18,20,22]};
  const model2=A.buildStripQaPanel(delayed,sidecar);
  assert.equal(model2.ok,true);
  assert.equal(byKey(model2,'delayMs').value,'≈83.333 ms (derived from fps)');
  assert.equal(byKey(model2,'sourceFps'),undefined);
});

test('HM-PF-30 subsampled export keeps the adapter warning and labels local source-report snippets',()=>{
  const model=panel({frames:12,fps:12,cycle_frames:24,subsampled:true,body_ref:'first-frame',sample_indices:[0,2,4,6,8,10,12,14,16,18,20,22]});
  const adapter=model.warnings.filter(w=>w.source==='adapter');
  assert.equal(adapter.length,1);assert.match(adapter[0].text,/not reconstructed/);
  const report=texts(model).filter(t=>t.startsWith('metadata:'));
  assert.ok(report.includes('metadata:subsampled true'));
  assert.ok(report.includes('metadata:cycle_frames 24'));
  assert.ok(report.includes('metadata:body_ref first-frame'));
  assert.ok(report.includes('metadata:sample_indices: 12 retained source samples'));
  assert.equal(model.summary,'1 warning · 4 source-report notes');
});

test('HM-PF-30 fps mismatch warns against source_fps and against implied delay_ms rate',()=>{
  const mismatch=panel({fps:12,source_fps:24});
  const qa=texts(mismatch).filter(t=>t.startsWith('qa:'));
  assert.equal(qa.length,1);assert.match(qa[0],/Export fps 12 differs from source_fps 24/);assert.match(qa[0],/Playback uses fps\./);
  const implied=panel({fps:24,delay_ms:100});
  const qa2=texts(implied).filter(t=>t.startsWith('qa:'));
  assert.equal(qa2.length,1);assert.match(qa2[0],/delay_ms 100 implies ≈10 fps, disagreeing with fps 24/);
  const both=panel({fps:12,source_fps:24,delay_ms:83.33});
  assert.equal(texts(both).filter(t=>t.startsWith('qa:')).length,1); // 83.33 ms ≈ 12 fps agrees, source mismatch still warns
  const agreed=panel({fps:24,delay_ms:41.67,source_fps:24});
  assert.equal(texts(agreed).filter(t=>t.startsWith('qa:')).length,0);
});

test('HM-PF-30 producer warnings survive verbatim and stay local text',()=>{
  const model=panel({warnings:['held cells kept as filmed','second note from producer']});
  const producer=model.warnings.filter(w=>w.source==='producer');
  assert.deepEqual(producer.map(w=>w.text),['held cells kept as filmed','second note from producer']);
  assert.equal(model.summary,'2 warnings'); // producer notes count in the summary pill for scanning
  for(const text of texts(model))assert.doesNotMatch(text,/https?:|[\\/]/);
});

test('HM-PF-30 malformed input still fails closed: normalize throws, panel refuses bad descriptors',()=>{
  assert.throws(()=>A.normalize(raw({frames:'24'})),/frames/);
  assert.throws(()=>A.normalize({frames:24,w:2,h:4,body_h:2}),/delay_ms/);
  for(const bad of [null,{},[],{adapter:'other',version:1},{adapter:'hm-sg01-body-strip',version:2},
    {adapter:'hm-sg01-body-strip',version:1,geometry:{frames:24,w:2,h:0,body_h:2},cadence:{secondsPerCell:1/24,timingSource:'fps'},policy:{kind:'repeat'},warnings:[],metadata:{}}])
    assert.equal(A.buildStripQaPanel(bad).ok,false);
  const descriptor=A.normalize(raw());descriptor.policy.kind='lifetime';
  assert.equal(A.buildStripQaPanel(descriptor).ok,false);
  const missing=A.normalize(raw());delete missing.warnings;
  assert.equal(A.buildStripQaPanel(missing).ok,false);
});

test('HM-PF-30 panel build never mutates the descriptor or retimes the renderer clock',()=>{
  const descriptor=A.normalize(raw({delay_ms:41.67,source_fps:60,cycle_frames:48,subsampled:true,
    sample_indices:Array.from({length:24},(_,i)=>i*2),warnings:['note']}));
  const before=structuredClone(descriptor),model=A.buildStripQaPanel(descriptor);
  assert.deepEqual(descriptor,before);
  assert.equal(descriptor.cadence.secondsPerCell,model.ok&&1/24);
  assert.equal(byKey(model,'timingSource').value,'fps'); // fps still wins over delay_ms, unchanged
});

// Same transport helpers as tests/sg01.test.cjs; numbered pixels only, no generated media.
const table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(type,data){
  const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);
  let crc=0xffffffff;for(let i=4;i<b.length-4;i++)crc=table[(crc^b[i])&255]^(crc>>>8);
  b.writeUInt32BE((crc^0xffffffff)>>>0,b.length-4);return b;
}
function png(width=48,height=4){
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;
  const rows=Buffer.alloc((width+1)*height);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
const file=(name,bytes,size=bytes.length)=>({name,size,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});
const files=(r=raw(),json=Buffer.from(JSON.stringify(r)))=>[file('strip.png',png(r.frames*r.w,r.h)),file('sidecar.json',json)];
const decoded=data=>{const b=Buffer.from(data.slice(22),'base64');return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)};};

/* Load the real dialog wiring (project-media.js DOM section) into a vm with element
 * stubs; stage() runs the real production path with a decode boundary. */
function dialog(){
  const elements=new Map(),clicks={};let init;
  function element(id){
    if(elements.has(id))return elements.get(id);
    const events={},e={id,value:'',disabled:false,textContent:'',children:[],open:false,hidden:false,
      classList:{toggle(){}},setAttribute(){},append(...nodes){this.children.push(...nodes);},replaceChildren(){this.children=[];},
      querySelectorAll(){return [];},addEventListener(type,fn){(events[type]||=[]).push(fn);},
      showModal(){this.open=true;},close(){this.open=false;this.emit('close',{});},
      emit(type,event){for(const fn of events[type]||[])fn(event);}};
    elements.set(id,e);return e;
  }
  const S={$:element,on:(id,fn)=>{clicks[id]=fn;},destinationToken:()=>({revision:0,request:0}),status(){}};
  class HeaderImage{set src(data){this.data=data;}async decode(){const d=decoded(this.data);this.naturalWidth=d.width;this.naturalHeight=d.height;}}
  const context=vm.createContext({structuredClone,TextDecoder,Uint8Array,DataView,atob,btoa,crypto,console,Image:HeaderImage,
    document:{getElementById:element,createElement:tag=>element('created-'+tag+'-'+crypto.randomUUID()),createTextNode:text=>({text})},
    window:{addEventListener(name,fn){init=fn;},HMStudio:S}});
  vm.runInContext(fs.readFileSync('public/ui/project-media.js','utf8'),context);
  init();
  const rows=()=>elements.get('stripQaFields').children.flatMap(row=>row.children.map(node=>node.textContent));
  const listed=()=>elements.get('stripQaWarnings').children.flatMap(li=>li.children.map(node=>node.textContent||node.text));
  return {clicks,element,rows,listed};
}

test('HM-PF-30 dialog renders structured rows, keeps commit gated on staging',async()=>{
  const ui=dialog();
  ui.clicks.importStrip();
  assert.equal(ui.element('stripDialog').open,true);
  assert.equal(ui.element('stripQaPanel').hidden,true); // hidden until a pair stages
  await ui.element('stripInput').onchange({target:{files:files(raw({delay_ms:41.67,source_fps:48}))}});
  const panel=ui.element('stripQaPanel');
  assert.equal(panel.hidden,false);
  const rows=ui.rows();
  for(const expected of ['Frames','body_h','Loop policy','Timing source','Strip duration','24 exported cells','fps','1 s (24 × 0.042 s/cell)'])
    assert.ok(rows.includes(expected),expected+' row missing');
  assert.ok(rows.some(row=>row.includes('cell h 4 px')),'cell h row missing');
  assert.ok(rows.some(row=>row.startsWith('repeat · loop true')),'policy row missing');
  assert.ok(rows.some(row=>row.includes('41.67 ms (raw · sidecar fps 24)')),'raw delay row missing');
  assert.equal(ui.element('commitStrip').disabled,false);
  assert.match(ui.element('stripQaSummary').textContent,/warning/); // source_fps 48 vs fps 24 mismatch
  assert.ok(ui.listed().some(t=>/differs from source_fps 48/.test(t)));
  assert.match(ui.element('stripStatus').textContent,/PENDING, NOT PLAYABLE/);
  // Malformed sidecar: fail-closed panel, commit stays disabled, no staged strip.
  await ui.element('stripInput').onchange({target:{files:files(raw({frames:'24'}))}});
  assert.equal(ui.element('stripQaPanel').hidden,false);
  assert.equal(ui.element('stripQaError').hidden,false);
  assert.equal(ui.element('stripQaError').textContent,'frames must be a positive finite integer.');
  assert.equal(ui.element('commitStrip').disabled,true);
  assert.equal(ui.rows().length,0);
  // Reopening the picker resets the panel instead of showing a stale staged strip.
  ui.clicks.importStrip();
  assert.equal(ui.element('stripQaPanel').hidden,true);
  assert.equal(ui.element('stripQaSummary').textContent,'not staged');
  ui.element('stripDialog').close();
  assert.equal(ui.element('stripQaPanel').hidden,true);
});

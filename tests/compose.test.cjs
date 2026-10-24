const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
require('../public/ui/compose-client.js');
require('../public/ui/motion-renderer.js');
const read=p=>JSON.parse(fs.readFileSync('public/'+p,'utf8'));
const demo=()=>read('shows/daiyu-wang-five-seconds.json');
const compose=show=>HMComposeClient.composeShow(show,{cameraPresets:read('presets/camera_presets.json'),fxPresets:read('presets/fx_presets.json'),loadJson:async p=>read(p)});
test('eight source images compose to exactly five seconds without gaps or repeated frames',async()=>{const r=await compose(demo());assert.equal(r.ok,true);assert.equal(r.duration_s,5);assert.equal(r.timeline.plates.length,8);assert.deepEqual(Object.values(r.layout).map(x=>x.source_plate),Array.from({length:8},(_,i)=>'P0'+(i+1)));for(let i=1;i<8;i++)assert.equal(r.timeline.plates[i].t0,r.timeline.plates[i-1].t1);assert.equal(r.timeline.plates.at(-1).t1,5);assert.equal(r.timeline.plate_timing,'explicit');});
test('fractional duration preserves continuous plate boundaries',async()=>{const s=demo();s.atoms[0].duration_s=.625;const r=await compose(s);assert.equal(r.ok,true);assert.equal(r.duration_s,5.125);assert.equal(r.timeline.plates[0].t1,.625);assert.equal(r.timeline.plates[1].t0,.625);});
test('legacy 2fps plate packs retain their exact plate timing',async()=>{const s=demo();s.atoms=s.atoms.slice(0,1);s.atoms[0].duration_s=1;s.atoms[0].plates_needed=2;s.atoms[0].hero.plates=['P01','P02'];const r=await compose(s);assert.equal(r.ok,true);assert.equal(r.timeline.fps_plates,2);assert.deepEqual(r.timeline.plates.map(p=>[p.t0,p.t1]),[[0,.5],[.5,1]]);});
test('invalid or excessive durations and invalid cameras fail explicitly',async()=>{for(const value of [0,-1,NaN,Infinity,121]){const s=demo();s.atoms[0].duration_s=value;const r=await compose(s);assert.equal(r.ok,false,String(value));assert.ok(r.errors.length);}const s=demo();s.atoms[0].camera.preset='missing';assert.equal((await compose(s)).ok,false);});
test('a missing layout or plate fails instead of composing a blank scene',async()=>{for(const field of ['layout_source','plates']){const s=demo();s.atoms[0].hero[field]=field==='plates'?['missing']:'missing.json';const r=await compose(s);assert.equal(r.ok,false);}});
test('HM-CAM-10: roll nudge (r), cam intensity scaling, dual segments, and expanded fx hooks compose accurately',async()=>{
  const s=demo();
  s.atoms[0].camera={
    preset:'eye_orbit',
    intensity:1.5,
    nudge:{x:10,y:-5,s:0.05,r:8},
    segments:[
      {preset:'eye_orbit',dur_s:0.25,u_range:[0,1]},
      {preset:'slow_push',dur_s:0.25,u_range:[0,1]}
    ]
  };
  s.atoms[1].fx_hooks=[
    {type:'hit_pink',t_rel:0.08,params:{}},
    {type:'flash_orange',t_rel:0.2,params:{}},
    {type:'speed_lines',t_rel:0.1,t_rel_end:0.9,params:{mode:'up',k0:0,k1:1}},
    {type:'smear_trail',t_rel:0.08,params:{dir:1}}
  ];
  const r=await compose(s);
  assert.equal(r.ok,true);
  assert.equal(r.timeline.atoms[0].cam.length,2);
  // eye_orbit x: -70..70 * 1.5 = -105..105, + nudge.x(10) => -95..115
  assert.equal(r.timeline.atoms[0].cam[0].curves.x.a,-95);
  assert.equal(r.timeline.atoms[0].cam[0].curves.x.b,115);
  // eye_orbit r: -3..3 * 1.5 = -4.5..4.5, + nudge.r(8) => 3.5..12.5
  assert.equal(r.timeline.atoms[0].cam[0].curves.r.a,3.5);
  assert.equal(r.timeline.atoms[0].cam[0].curves.r.b,12.5);
  assert.ok(r.timeline.fx.hits.some(h=>h[1]==='#ff3fa4'));
  assert.ok(r.timeline.fx.flash.some(f=>f[1]==='#ff8a1e'));
  assert.equal(r.timeline.fx.speed.length,1);
  assert.equal(r.timeline.fx.trails.length,1);
});

test('ten-second continuation preserves the original five-second prefix and adds layered background plates',async()=>{const original=demo(),extended=read('shows/daiyu-wang-ten-seconds.json');assert.deepEqual(extended.atoms.slice(0,8),original.atoms);const [a,b]=await Promise.all([compose(original),compose(extended)]);assert.equal(b.ok,true);assert.equal(b.duration_s,10);assert.equal(b.timeline.plates.length,16);assert.deepEqual(b.timeline.plates.slice(0,8),a.timeline.plates);assert.ok(Object.values(b.layout).slice(8).every(l=>!l.full&&l.parts?.length));assert.equal(b.timeline.bg.base,'assets/daiyu-wang-continuation/rooftop-dusk.png');});

test('replacing backgrounds preserves named base/swap layout choices and white-key preference',async()=>{
  const show=demo();show.atoms=show.atoms.slice(0,2);show.bg={base:'backgrounds/new-base.png',swap:'backgrounds/new-swap.png',swap_t:0,key_white:true,aliases:{base:['old-roof'],swap:['old-sunset']}};
  const layout=read(show.atoms[0].hero.layout_source);layout.P01.bg='old-roof.png';layout.P02.bg='old-sunset';
  const result=await HMComposeClient.composeShow(show,{cameraPresets:read('presets/camera_presets.json'),fxPresets:read('presets/fx_presets.json'),loadJson:async()=>layout});
  assert.equal(result.ok,true);assert.deepEqual(Object.values(result.layout).map(l=>l.bg),['base','swap']);assert.equal(result.timeline.bg.key_white,true);assert.equal(result.timeline.bg.base,show.bg.base);assert.equal(result.timeline.bg.swap,show.bg.swap);
  layout.P01.bg='base';layout.P02.bg='swap';const named=await HMComposeClient.composeShow(show,{cameraPresets:read('presets/camera_presets.json'),fxPresets:read('presets/fx_presets.json'),loadJson:async()=>layout});assert.deepEqual(Object.values(named.layout).map(l=>l.bg),['base','swap']);
});

test('clip backgrounds override only their own plates and keep camera curves intact',async()=>{
  const show=demo(),before=await compose(show);show.bg={base:'project.png',motion:{preset:'pan_right',amount:.4}};
  show.atoms[0].background={src:'first.png',key_white:true,motion:{preset:'push_in',amount:.8}};
  show.atoms[1].background={src:null,motion:{preset:'static',amount:0}};
  const result=await compose(show);assert.equal(result.ok,true);
  assert.deepEqual(result.layout.S001.background,show.atoms[0].background);assert.equal(result.layout.S002.background.src,null);assert.equal(result.layout.S003.background,undefined);
  assert.deepEqual(result.timeline.bg.motion,show.bg.motion);assert.deepEqual(result.timeline.atoms.map(a=>a.cam),before.timeline.atoms.map(a=>a.cam));
});
test('invalid background motion and image settings fail explicitly',async()=>{
  for(const background of [{src:42},{key_white:'true'},{motion:{preset:'missing',amount:.5}},{motion:{preset:'pan_left',amount:Infinity}},{motion:{preset:'push_in',amount:-1}}]){
    const show=demo();show.atoms[0].background=background;assert.equal((await compose(show)).ok,false);
  }
  const show=demo();show.bg.motion={preset:'push_in',amount:2};assert.equal((await compose(show)).ok,false);
});
test('HM-P1-SCRUB: compareAt and inspectAt detect plate, camera, and timing edits at linked scrub time t',async()=>{
  const gold=await compose(demo());
  const draftShow=demo();
  draftShow.atoms[0].hero.plates=['P08'];
  draftShow.atoms[1].camera={preset:'slow_push',nudge:{x:20,y:-10,s:0.05,r:5}};
  draftShow.atoms[2].duration_s=0.75;
  const draft=await compose(draftShow);
  // Identical gold vs gold at t=0.25 has no diffs
  const same=HMComposeClient.compareAt(gold,gold,0.25);
  assert.equal(same.t,0.25);
  assert.equal(same.a.show_id,'daiyu-wang-five-seconds');
  assert.equal(same.b.show_id,'daiyu-wang-five-seconds');
  assert.deepEqual(same.diff,{plate:false,cam:false,timing:false,any:false});
  // At t=0.25 (beat-01): plate differs (P08 vs P01) and total timing differs (5.25s vs 5.00s)
  const c0=HMComposeClient.compareAt(draft,gold,0.25);
  assert.equal(c0.a.source_plate,'P08');
  assert.equal(c0.b.source_plate,'P01');
  assert.equal(c0.diff.plate,true);
  assert.equal(c0.diff.cam,false);
  assert.equal(c0.diff.timing,true);
  assert.equal(c0.diff.any,true);
  // At t=0.75 (beat-02): cam preset & pose differ (slow_push vs static_hold)
  const c1=HMComposeClient.compareAt(draft,gold,0.75);
  assert.equal(c1.a.cam_preset,'slow_push');
  assert.equal(c1.b.cam_preset,'static_hold');
  assert.equal(c1.diff.cam,true);
  assert.equal(c1.diff.plate,false);
  // At t=1.60: draft is still in extended beat-03 (P03, 0.75s) while gold is in beat-04 (P04, 0.50s)
  const c2=HMComposeClient.compareAt(draft,gold,1.6);
  assert.equal(c2.a.source_plate,'P03');
  assert.equal(c2.b.source_plate,'P04');
  assert.equal(c2.a.atom_duration_s,0.75);
  assert.equal(c2.b.atom_duration_s,0.5);
  assert.equal(c2.diff.plate,true);
  assert.equal(c2.diff.timing,true);
});

test('HM-P1-FX: classifyFxHooks distinguishes live stand-in chips from Compose-only hooks with explicit honesty',async()=>{
  const fxPresets=read('presets/fx_presets.json');
  for(const liveType of ['hit_pink','flash_orange','speed_lines','smear_trail','sparks','hit_orange','dust','shake']){
    const info=HMComposeClient.classifyFxHooks([{type:liveType,t_rel:0.08}],fxPresets);
    assert.equal(info.hasLive,true,liveType);
    assert.equal(info.hasComposeOnly,false,liveType);
    assert.equal(info.mode,'live',liveType);
    assert.equal(info.live[0].type,liveType);
    assert.match(info.banner,/Live FX stand-in/);
  }
  for(const composeOnlyType of ['hitstop_2f','fence_shake']){
    const info=HMComposeClient.classifyFxHooks([{type:composeOnlyType,t_rel:0.08}],fxPresets);
    assert.equal(info.hasLive,false,composeOnlyType);
    assert.equal(info.hasComposeOnly,true,composeOnlyType);
    assert.equal(info.mode,'compose_only',composeOnlyType);
    assert.equal(info.composeOnly[0].type,composeOnlyType);
    assert.match(info.banner,/Compose-only/);
  }
  const s=demo();
  s.atoms[0].fx_hooks=[{type:'sparks',t_rel:0.08,params:{n:40}}];
  s.atoms[1].fx_hooks=[{type:'hitstop_2f',t_rel:0.08,params:{}}];
  const r=await compose(s);
  assert.equal(r.ok,true);
  assert.equal(r.timeline.fx.sparks.length,1);
  assert.equal(r.timeline.fx.hitstop.length,1);
  const at0=HMComposeClient.inspectAt(r,0.1);
  assert.equal(at0.fx_state.mode,'live');
  assert.equal(at0.fx_state.live[0].type,'sparks');
  const at1=HMComposeClient.inspectAt(r,0.6);
  assert.equal(at1.fx_state.mode,'compose_only');
  assert.equal(at1.fx_state.composeOnly[0].type,'hitstop_2f');
  assert.match(at1.fx_state.banner,/Compose-only/);
});

test('HM-P1-JUMP: plate catalog resolves ids, steps, and decade chips without moving the show',async()=>{
  const gold=await compose(demo());
  const catalog=HMComposeClient.plateCatalog(gold);
  assert.equal(catalog.length,8);
  assert.deepEqual(catalog.map(p=>p.source_plate),['P01','P02','P03','P04','P05','P06','P07','P08']);
  assert.equal(catalog[0].t0,0);
  assert.equal(catalog[6].t0,3.25);
  assert.equal(catalog[6].atom_index,6);
  assert.deepEqual(HMComposeClient.plateJumpChips(catalog).map(p=>p.source_plate),['P01']);
  assert.equal(HMComposeClient.resolvePlateJump(catalog,{step:1},0).source_plate,'P02');
  assert.equal(HMComposeClient.resolvePlateJump(catalog,{step:-1},0),null);
  assert.equal(HMComposeClient.resolvePlateJump(catalog,{step:1},7),null);
  assert.equal(HMComposeClient.resolvePlateJump(catalog,'P07').index,6);
  assert.equal(HMComposeClient.resolvePlateJump(catalog,'p07').t0,3.25);
  assert.equal(HMComposeClient.resolvePlateJump(catalog,'7').source_plate,'P07');
  assert.equal(HMComposeClient.resolvePlateJump(catalog,'S003').source_plate,'P03');
  assert.equal(HMComposeClient.resolvePlateJump(catalog,HMComposeClient.plateJumpOption(catalog[4])).source_plate,'P05');
  assert.equal(HMComposeClient.resolvePlateJump(catalog,'P99'),null);
  assert.equal(HMComposeClient.resolvePlateJump(catalog,'P4'),null);
  const repeated=demo();
  repeated.atoms[0].duration_s=1;
  repeated.atoms[0].plates_needed=2;
  repeated.atoms[0].hero.plates=['P01','P01'];
  const dup=await compose(repeated);
  const dupCatalog=HMComposeClient.plateCatalog(dup);
  assert.equal(HMComposeClient.resolvePlateJump(dupCatalog,'P01').t0,0);
  assert.equal(HMComposeClient.resolvePlateJump(dupCatalog,'P01 @ 0.50').t0,0.5);
  assert.equal(dupCatalog[1].atom_index,0);
  const rooftop=await compose(read('shows/daiyu-wang-codex-import.json'));
  assert.equal(rooftop.ok,true);
  const longCatalog=HMComposeClient.plateCatalog(rooftop);
  assert.equal(longCatalog.length,63);
  const chips=HMComposeClient.plateJumpChips(longCatalog);
  assert.deepEqual(chips.map(p=>p.index),[0,10,20,30,40,50,60]);
  const landed=HMComposeClient.resolvePlateJump(longCatalog,'P42');
  assert.equal(landed.source_plate,'P42');
  assert.ok(landed.index>1);
  assert.equal(landed.t0,22);
  assert.ok(longCatalog[landed.index-1].atom_index===landed.atom_index);
  assert.ok(longCatalog[landed.atom_index]||landed.atom_id);
  const atomStart=longCatalog.find(p=>p.atom_index===landed.atom_index);
  assert.notEqual(atomStart.index,landed.index);
  assert.ok(atomStart.t0<landed.t0);
  assert.equal(gold.timeline.plates.length,8);
});
// HM-BG-CROP
test('HM-BG-CROP: crop helpers clamp, validate, aspect-lock and resolve per clip/layer',()=>{
  const C=HMComposeClient;
  assert.equal(C.validBackgroundCrop({x:0,y:0,w:1,h:1}),true);
  for(const bad of [null,[],{x:0,y:0,w:0,h:1},{x:.5,y:0,w:.6,h:1},{x:-.1,y:0,w:.5,h:.5},{x:0,y:0,w:NaN,h:1},{x:'0',y:0,w:1,h:1}])assert.equal(C.validBackgroundCrop(bad),false,JSON.stringify(bad));
  assert.deepEqual(C.clampBackgroundCrop({x:.9,y:-1,w:.5,h:2}),{x:.5,y:0,w:.5,h:1});
  assert.deepEqual(C.clampBackgroundCrop({x:0,y:0,w:0,h:0}),{x:0,y:0,w:C.BG_CROP_MIN,h:C.BG_CROP_MIN});
  assert.equal(C.isFullBackgroundCrop(null),true);assert.equal(C.isFullBackgroundCrop({x:0,y:0,w:1,h:1}),true);assert.equal(C.isFullBackgroundCrop({x:.1,y:0,w:.9,h:1}),false);
  // Square image: a 16:9 visible region has normalized h = w * 9/16.
  const locked=C.lockBackgroundCropAspect({x:.25,y:.25,w:.5,h:.5},1);assert.ok(Math.abs(locked.h-.5*9/16)<1e-3);assert.ok(Math.abs(locked.x+locked.w/2-.5)<1e-3);
  const tl={crops:{base:{x:.1,y:.1,w:.5,h:.5},swap:{x:.5,y:.5,w:.5,h:.5}}};
  assert.deepEqual(C.resolveBackgroundCrop({bg:'base'},tl),tl.crops.base);assert.deepEqual(C.resolveBackgroundCrop({bg:'swap'},tl),tl.crops.swap);
  assert.deepEqual(C.resolveBackgroundCrop({bg:'base',background:{crop:{x:0,y:0,w:.3,h:.3}}},tl),{x:0,y:0,w:.3,h:.3});
  assert.equal(C.resolveBackgroundCrop({bg:'base',background:{src:'own.png'}},tl),null);
});
test('HM-BG-CROP: project and clip crops compile into the timeline and layout without changing plate timing',async()=>{
  const s=demo();s.bg={...(s.bg||{}),base:s.bg?.base||'backgrounds/x.png',crops:{base:{x:.2,y:.1,w:.5,h:.5}}};s.atoms[1].background={crop:{x:0,y:.5,w:.4,h:.4}};
  const r=await compose(s);assert.equal(r.ok,true,JSON.stringify(r.errors));assert.equal(r.duration_s,5);assert.equal(r.timeline.plates.length,8);
  assert.deepEqual(r.timeline.bg.crops.base,{x:.2,y:.1,w:.5,h:.5});
  const l1=Object.values(r.layout).find(l=>l.atom===s.atoms[1].id);assert.deepEqual(l1.background.crop,{x:0,y:.5,w:.4,h:.4});
  assert.deepEqual(HMComposeClient.resolveBackgroundCrop(l1,r.timeline.bg),{x:0,y:.5,w:.4,h:.4});
  const l0=Object.values(r.layout).find(l=>l.atom===s.atoms[0].id);assert.deepEqual(HMComposeClient.resolveBackgroundCrop(l0,r.timeline.bg),{x:.2,y:.1,w:.5,h:.5});
});
test('HM-BG-MOTION: pan slides the crop window across source slack and holds a flush edge',()=>{
  const frame=HMComposeClient.backgroundMotionFrame,support=HMComposeClient.backgroundMotionSupport;
  const crop={x:.3,y:.2,w:.4,h:.5};
  assert.equal(frame(crop,'pan_left',1,0).mode,'window');
  assert.deepEqual(frame(crop,'pan_left',1,0).crop,crop);
  assert.deepEqual(frame(crop,'pan_left',1,1).crop,{x:0,y:.2,w:.4,h:.5});
  assert.deepEqual(frame(crop,'pan_right',.5,1).crop,{x:.45,y:.2,w:.4,h:.5});
  assert.deepEqual(frame(crop,'pan_up',1,1).crop,{x:.3,y:0,w:.4,h:.5});
  assert.deepEqual(frame(crop,'pan_down',1,1).crop,{x:.3,y:.5,w:.4,h:.5});
  assert.equal(frame(crop,'pan_left',0,1).crop.x,.3);
  const zoomIn=frame(crop,'push_in',1,1);assert.equal(zoomIn.mode,'window');assert.ok(zoomIn.crop.w<crop.w&&zoomIn.crop.h<crop.h);
  assert.deepEqual(frame(crop,'pull_out',1,1).crop,{x:0,y:0,w:1,h:1});
  assert.equal(frame(crop,'follow_camera',1,1).mode,'hold');
  assert.equal(frame(null,'static',1,1).mode,'hold');
  assert.equal(frame(null,'pan_left',.4,.5).mode,'inset');
  assert.equal(frame({x:0,y:0,w:1,h:1},'push_in',1,1).mode,'inset');
  const flush={x:0,y:.2,w:.4,h:.4};
  const blocked=frame(flush,'pan_left',1,1);assert.equal(blocked.mode,'still');assert.equal(blocked.crop.x,0);assert.match(blocked.reason,/left/i);
  const avail=support(flush);assert.equal(avail.pan_left.ok,false);assert.match(avail.pan_left.reason,/left/i);assert.equal(avail.pan_right.ok,true);assert.equal(avail.pan_up.ok,true);
  assert.equal(support(null).pan_left.ok,true);assert.equal(support(null).pan_down.ok,true);assert.equal(support({x:0,y:0,w:.02,h:.02}).push_in.ok,false);
});
test('HM-BG-MOTION: crop and motion compile together without changing plate timing',async()=>{
  const s=demo();const before=await compose(s);s.bg={...(s.bg||{}),crops:{base:{x:.2,y:.1,w:.5,h:.5}},motion:{preset:'pan_right',amount:.8}};s.atoms[0].background={crop:{x:.1,y:.2,w:.4,h:.4},motion:{preset:'pan_left',amount:1}};
  const r=await compose(s);assert.equal(r.ok,true);assert.equal(r.duration_s,before.duration_s);assert.deepEqual(r.timeline.plates.map(p=>[p.t0,p.t1]),before.timeline.plates.map(p=>[p.t0,p.t1]));
  assert.deepEqual(r.timeline.bg.crops.base,{x:.2,y:.1,w:.5,h:.5});assert.deepEqual(r.timeline.bg.motion,{preset:'pan_right',amount:.8});
  const first=Object.values(r.layout).find(l=>l.atom===s.atoms[0].id);assert.deepEqual(first.background.crop,{x:.1,y:.2,w:.4,h:.4});assert.deepEqual(first.background.motion,{preset:'pan_left',amount:1});
});
test('HM-BG-CROP: invalid crops fail explicitly',async()=>{
  for(const background of [{crop:{x:0,y:0,w:2,h:1}},{crop:'full'},{crop:{x:.9,y:0,w:.5,h:.5}}]){const s=demo();s.atoms[0].background=background;assert.equal((await compose(s)).ok,false,JSON.stringify(background));}
  for(const crops of [{base:{x:0,y:0,w:0,h:0}},{other:{x:0,y:0,w:1,h:1}},[]]){const s=demo();s.bg={...(s.bg||{}),crops};assert.equal((await compose(s)).ok,false,JSON.stringify(crops));}
});

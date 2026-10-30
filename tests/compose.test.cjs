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

test('HM-CAM-10R: composed timeline places each fx hook at t0 + t_rel * duration',async()=>{
  const s=demo();
  s.atoms.forEach(a=>{a.fx_hooks=[];});
  s.atoms[0].fx_hooks=[
    {type:'hit_orange',t_rel:0.2},
    {type:'shake',t_rel:0.55,params:{amp:4,dur:0.1}},
    {type:'flash_orange',t_rel:0.9}
  ];
  s.atoms[1].fx_hooks=[{type:'hit_pink'}];
  s.atoms[2].fx_hooks=['shake'];
  const r=await compose(s);
  assert.equal(r.ok,true);
  const at=(rel,i)=>{
    const start=s.atoms.slice(0,i).reduce((sum,a)=>sum+a.duration_s,0);
    return Math.round((start+rel*s.atoms[i].duration_s)*10000)/10000;
  };
  assert.deepEqual(r.timeline.atoms[0].fx_hooks.map(h=>h.t_rel),[0.2,0.55,0.9]);
  assert.equal(r.timeline.atoms[1].fx_hooks[0].t_rel,0.08);
  assert.equal(r.timeline.atoms[2].fx_hooks[0].t_rel,0.08);
  assert.deepEqual(r.timeline.atoms[3].fx_hooks,[]);
  assert.ok(r.timeline.fx.hits.some(h=>h[0]===at(0.2,0)&&h[1]==='#ff8a1e'));
  assert.ok(r.timeline.fx.shake.some(h=>h[0]===at(0.55,0)));
  assert.ok(r.timeline.fx.flash.some(h=>h[0]===at(0.9,0)&&h[1]==='#ff8a1e'));
  assert.ok(r.timeline.fx.hits.some(h=>h[0]===at(0.08,1)&&h[1]==='#ff3fa4'));
  assert.ok(r.timeline.fx.shake.some(h=>h[0]===at(0.08,2)));
  assert.deepEqual(r.timeline.fx.hits.map(h=>h[0]).sort((a,b)=>a-b),[at(0.2,0),at(0.08,1)].sort((a,b)=>a-b));
});

test('ten-second continuation preserves the original five-second prefix and adds layered background plates',async()=>{const original=demo(),extended=read('shows/daiyu-wang-ten-seconds.json');assert.deepEqual(extended.atoms.slice(0,8),original.atoms);const [a,b]=await Promise.all([compose(original),compose(extended)]);assert.equal(b.ok,true);assert.equal(b.duration_s,10);assert.equal(b.timeline.plates.length,16);assert.deepEqual(b.timeline.plates.slice(0,8),a.timeline.plates);assert.ok(Object.values(b.layout).slice(8).every(l=>!l.full&&l.parts?.length));assert.equal(b.timeline.bg.base,'assets/daiyu-wang-continuation/rooftop-dusk.png');});

test('street sample opens eight existing continuation plates for five seconds without new art',async()=>{
  const street=read('shows/street-old-city.json');
  const catalog=read('catalog.json');
  const five=demo();
  assert.equal(street.show_id,'street-old-city');
  assert.equal(five.show_id,'daiyu-wang-five-seconds');
  assert.deepEqual(five.atoms.map(a=>a.hero.plates[0]),['P01','P02','P03','P04','P05','P06','P07','P08']);
  assert.ok(catalog.shows.some(s=>s.path==='shows/street-old-city.json'&&s.show?.show_id==='street-old-city'));
  const result=await compose(street);
  assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.equal(result.duration_s,5);
  assert.deepEqual(Object.values(result.layout).map(l=>l.source_plate),['P09','P10','P11','P12','P13','P14','P15','P16']);
  assert.ok(Object.values(result.layout).every(l=>!l.full&&l.parts.length&&l.parts.every(p=>p.src.startsWith('assets/daiyu-wang-continuation/P'))));
  assert.equal(result.timeline.bg.base,'assets/daiyu-wang-continuation/rooftop-dusk.png');
  const paths=new Set([street.bg.base, ...street.atoms.map(a=>a.hero.layout_source), ...Object.values(result.layout).flatMap(l=>l.parts.map(p=>p.src))]);
  for(const p of paths)assert.equal(fs.existsSync('public/'+p),true,p);
  assert.equal(fs.existsSync('public/assets/street-old-city'),false);
});

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
  for(const background of [{src:42},{key_white:'true'},{motion:{preset:'missing',amount:.5}},{motion:{preset:'pan_left',amount:Infinity}},{motion:{preset:'push_in',amount:-1}},{motion:{preset:'pan_left',amount:.5,clock:'rewind'}},{motion:{preset:'pan_right',amount:.4,span:{t0:2,t1:1}}},{motion:{preset:'pan_right',amount:.4,clock:'span'}}]){
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
test('HM-BG-PAN-CONT: show, per-clip, and span clocks compile unchanged',async()=>{
  for(const motion of [
    {preset:'pan_right',amount:.4,clock:'show'},
    {preset:'pan_left',amount:1,clock:'per_atom'},
    {preset:'push_in',amount:.2,clock:'legacy'},
    {preset:'pull_out',amount:.5,span:[1,3]},
    {preset:'pan_down',amount:.3,t0:.5,t1:2.5},
    {preset:'pan_up',amount:.6,clock:'span',span:{t0:.2,t1:1.2}}
  ]){
    const s=demo();s.bg={...(s.bg||{}),motion};const r=await compose(s);
    assert.equal(r.ok,true,JSON.stringify(motion)+' '+(r.errors||[]).join(';'));
    assert.deepEqual(r.timeline.bg.motion,motion);assert.equal(r.duration_s,5);
  }
});
test('HM-BG-PAN-CONT: pan_right crop.x stays monotonic across atom boundaries',async()=>{
  const progress=HMComposeClient.backgroundMotionProgress,frame=HMComposeClient.backgroundMotionFrame;
  const s=demo();s.bg={...(s.bg||{}),crops:{base:{x:.1,y:.15,w:.4,h:.4}},motion:{preset:'pan_right',amount:1}};
  const r=await compose(s);assert.equal(r.ok,true);assert.ok(r.timeline.atoms.length>=4);
  const crop=r.timeline.bg.crops.base,motion=r.timeline.bg.motion,dur=r.duration_s,atoms=r.timeline.atoms;
  const xAt=(m,t,a)=>frame(crop,'pan_right',1,progress(m,t,{duration:dur,atomT0:a.t0,atomT1:a.t1})).crop.x;
  const xs=[];
  for(const a of atoms)for(const t of [a.t0+.02,(a.t0+a.t1)/2,a.t1-.02])xs.push(xAt(motion,t,a));
  for(let i=1;i<xs.length;i++)assert.ok(xs[i]>=xs[i-1]-1e-6,'crop.x rewound: '+xs.join(','));
  assert.ok(xs.at(-1)>xs[0]+.05,'show travel collapsed: '+xs[0]+' -> '+xs.at(-1));
  for(let i=1;i<atoms.length;i++){
    const prev=atoms[i-1],next=atoms[i];
    const before=xAt(motion,prev.t1-1e-4,prev),after=xAt(motion,next.t0+1e-4,next);
    assert.ok(after+1e-4>=before,'boundary '+i+' rewound '+before+' -> '+after);
  }
  const legacy={...motion,clock:'per_atom'};
  const end=xAt(legacy,atoms[0].t1-.02,atoms[0]),restart=xAt(legacy,atoms[1].t0+.02,atoms[1]);
  assert.ok(restart<end-.05,'per clip should restart: '+end+' -> '+restart);
  assert.equal(progress({...motion,clock:'legacy'},atoms[0].t0+.01,{duration:dur,atomT0:atoms[0].t0,atomT1:atoms[0].t1}),progress(legacy,atoms[0].t0+.01,{duration:dur,atomT0:atoms[0].t0,atomT1:atoms[0].t1}));
  const spanned={preset:'pan_right',amount:1,span:{t0:atoms[1].t0,t1:atoms[2].t1}};
  assert.equal(progress(spanned,atoms[0].t0+.1,{duration:dur,atomT0:atoms[0].t0,atomT1:atoms[0].t1}),0);
  const mid=(atoms[1].t0+atoms[2].t1)/2;
  assert.equal(progress(spanned,mid,{duration:dur,atomT0:atoms[1].t0,atomT1:atoms[1].t1}),.5);
  assert.equal(progress(spanned,atoms[3].t0+.05,{duration:dur,atomT0:atoms[3].t0,atomT1:atoms[3].t1}),1);
  const explicit={preset:'pan_right',amount:1,clock:'show',span:{t0:0,t1:1}};
  const shown=progress(explicit,dur,{duration:dur,atomT0:0,atomT1:1});
  assert.equal(shown,1);
  assert.ok(progress(explicit,.5,{duration:dur,atomT0:0,atomT1:.5})>0);
});
test('HM-BG-SPAN-UI: authored t0–t1 holds outside the window; show clock stays the default',async()=>{
  const progress=HMComposeClient.backgroundMotionProgress,frame=HMComposeClient.backgroundMotionFrame;
  const s=demo();s.bg={...(s.bg||{}),crops:{base:{x:.1,y:.1,w:.4,h:.4}},motion:{preset:'pan_right',amount:1,clock:'span',span:{t0:1,t1:3}}};
  const r=await compose(s);assert.equal(r.ok,true,JSON.stringify(r.errors));assert.equal(r.duration_s,5);
  assert.deepEqual(r.timeline.bg.motion,s.bg.motion);
  const crop=r.timeline.bg.crops.base,dur=r.duration_s,motion=r.timeline.bg.motion;
  const clock={duration:dur,atomT0:0,atomT1:1};
  const xAt=t=>frame(crop,'pan_right',1,progress(motion,t,clock)).crop.x;
  const start=xAt(0);
  assert.equal(progress(motion,.5,clock),0);assert.equal(xAt(.5),start);
  assert.equal(progress(motion,2,clock),.5);assert.ok(xAt(2)>start+.05);
  assert.equal(progress(motion,3.5,clock),1);assert.ok(xAt(3.5)>xAt(2));
  const showDefault={preset:'pan_right',amount:1};
  assert.equal(progress(showDefault,0,clock),0);
  assert.ok(progress(showDefault,.5,clock)>0,'missing clock still travels on the show');
  assert.equal(progress(showDefault,dur,clock),1);
  const explicitShow={preset:'pan_right',amount:1,clock:'show',span:{t0:1,t1:3}};
  assert.ok(progress(explicitShow,.5,clock)>0,'clock show ignores an attached span');
  assert.ok(progress(explicitShow,3.5,clock)<1);
});
test('HM-BG-CROP: invalid crops fail explicitly',async()=>{
  for(const background of [{crop:{x:0,y:0,w:2,h:1}},{crop:'full'},{crop:{x:.9,y:0,w:.5,h:.5}}]){const s=demo();s.atoms[0].background=background;assert.equal((await compose(s)).ok,false,JSON.stringify(background));}
  for(const crops of [{base:{x:0,y:0,w:0,h:0}},{other:{x:0,y:0,w:1,h:1}},[]]){const s=demo();s.bg={...(s.bg||{}),crops};assert.equal((await compose(s)).ok,false,JSON.stringify(crops));}
});
test('HM-COMPOSE-FG: foreground props keep their own camera, keyframes and break, and shows without fg stay unchanged',async()=>{
  const fx=read('presets/fx_presets.json');
  assert.equal(fx.hooks.some(h=>/fire/i.test(h.id)),false);
  const plain=await compose(demo());
  assert.equal(plain.ok,true);
  assert.equal(plain.duration_s,5);
  assert.equal(Object.hasOwn(plain.timeline,'fg'),false);
  const show=demo();
  show.bg={...(show.bg||{}),motion:{preset:'pan_right',amount:1,clock:'show'}};
  show.atoms[0].camera={preset:'eye_orbit',nudge:{x:40,y:10,s:0.05}};
  const sameCam=await compose(JSON.parse(JSON.stringify(show)));
  show.fg={
    cam:{preset:'parallax',amount:1,nudge:{x:12,y:-4,s:0.1}},
    props:[{
      id:'chair',src:'props/chair.png',x:200,y:160,scale:1,z:20,
      t_start:0,t_end:4,
      kf:[{t:0,x:100,y:80,scale:1},{t:2,x:300,y:180,scale:2}],
      effect:{type:'break',t:2,broken_src:'props/chair-broken.png'},
    },{
      id:'desk',src:'props/desk.png',x:400,y:500,scale:0.5,z:5,t_start:1,t_end:9,
    }],
  };
  const withFg=await compose(show);
  assert.equal(withFg.ok,true,JSON.stringify(withFg.errors));
  assert.equal(withFg.duration_s,5);
  assert.deepEqual(withFg.timeline.bg.motion,sameCam.timeline.bg.motion);
  assert.deepEqual(withFg.timeline.atoms.map(a=>a.cam),sameCam.timeline.atoms.map(a=>a.cam));
  const moved=demo();
  moved.bg={...(moved.bg||{}),motion:{preset:'pan_left',amount:.2}};
  moved.atoms[0].camera={preset:'static_hold'};
  moved.fg=JSON.parse(JSON.stringify(show.fg));
  moved.fg.cam.amount=.25;
  const retuned=await compose(moved);
  assert.equal(retuned.ok,true);
  assert.notDeepEqual(retuned.timeline.bg.motion,withFg.timeline.bg.motion);
  assert.notDeepEqual(retuned.timeline.atoms[0].cam,withFg.timeline.atoms[0].cam);
  assert.equal(retuned.timeline.fg.cam.amount,.25);
  assert.deepEqual(retuned.timeline.fg.props,withFg.timeline.fg.props);
  assert.deepEqual(withFg.timeline.fg.props.map(p=>p.id),['desk','chair']);
  assert.equal(withFg.timeline.fg.props[1].effect.broken_src,'props/chair-broken.png');
  assert.equal(withFg.timeline.fg.props[0].t_end,5);
  const pose=HMComposeClient.fgPropPose(withFg.timeline.fg.props[1],1);
  assert.equal(pose.x,200);assert.equal(pose.y,130);assert.equal(pose.scale,1.5);
  const clock={duration:5,atomT0:0,atomT1:5};
  const start=HMComposeClient.fgCameraFrame(withFg.timeline.fg.cam,0,clock);
  const end=HMComposeClient.fgCameraFrame(withFg.timeline.fg.cam,5,clock);
  assert.ok(start.x>end.x+100,'parallax travels on its own: '+start.x+' -> '+end.x);
  assert.equal(start.preset,'parallax');
  const bgStart=HMComposeClient.backgroundMotionFrame({x:.1,y:.1,w:.5,h:.5},'pan_right',1,0);
  const bgEnd=HMComposeClient.backgroundMotionFrame({x:.1,y:.1,w:.5,h:.5},'pan_right',1,1);
  assert.notEqual(bgStart.crop.x,bgEnd.crop.x);
  assert.equal(HMComposeClient.fgCameraFrame(withFg.timeline.fg.cam,1,clock).x,HMComposeClient.fgCameraFrame(withFg.timeline.fg.cam,1,clock).x);
  const held=HMComposeClient.fgCameraFrame({preset:'static',amount:1,nudge:{x:8,y:-3,s:0.2}},0,clock);
  const heldEnd=HMComposeClient.fgCameraFrame({preset:'static',amount:1,nudge:{x:8,y:-3,s:0.2}},5,clock);
  assert.equal(held.x,heldEnd.x);assert.equal(held.y,heldEnd.y);assert.equal(held.s,heldEnd.s);
  assert.equal(held.x,8);assert.equal(held.s,1.2);
  const intact=HMComposeClient.fgBreakState(withFg.timeline.fg.props[1],1.99);
  const broken=HMComposeClient.fgBreakState(withFg.timeline.fg.props[1],2);
  assert.equal(intact.broken,false);assert.equal(intact.src,'props/chair.png');
  assert.equal(broken.broken,true);assert.equal(broken.src,'props/chair-broken.png');assert.equal(broken.procedural,false);
  const crack=HMComposeClient.fgBreakState({src:'props/chair.png',effect:{type:'break',t:2}},2.2);
  assert.equal(crack.procedural,true);assert.ok(crack.age>HMComposeClient.fgBreakState({src:'props/chair.png',effect:{type:'break',t:2}},2).age);
  for(const fg of [
    {cam:{preset:'orbit',amount:.2}},
    {cam:{preset:'parallax',amount:2}},
    {props:[{id:'a'}]},
    {props:[{id:'a',src:'p.png',t_start:2,t_end:1}]},
    {props:[{id:'a',src:'p.png',kf:[{t:'no'}]}]},
    {props:[{id:'a',src:'p.png',effect:{type:'fire',t:1}}]},
  ]){
    const bad=demo();bad.fg=fg;assert.equal((await compose(bad)).ok,false,JSON.stringify(fg));
  }
});

test('HM-FG-BROKEN-CUTOUT: a broken PNG or WebP replaces the crack, and overlay art shows only inside its window',async()=>{
  const fx=read('presets/fx_presets.json');
  assert.equal(fx.hooks.some(h=>/fire|debris/i.test(h.id)),false);
  const plain=await compose(demo());
  assert.equal(plain.duration_s,5);
  assert.equal(Object.hasOwn(plain.timeline,'fg'),false);
  const show=demo();
  show.fg={props:[
    {id:'rail',src:'props/rail.png',x:120,y:200,scale:1,z:1,t_start:0,t_end:5,effect:{type:'break',t:1.5}},
    {id:'cut-png',src:'props/rail.png',x:120,y:200,scale:1,z:2,t_start:0,t_end:5,effect:{type:'break',t:1.5,broken_src:'props/rail-broken.png'}},
    {id:'cut-webp',src:'props/rail.png',x:120,y:200,scale:1,z:3,t_start:0,t_end:5,effect:{type:'break',t:1.5,broken_src:'props/rail-broken.webp'}},
    {id:'speed',slot:'overlay',src:'art/speed-lines.webp',x:640,y:360,scale:1,z:30,t_start:1,t_end:2.25},
  ]};
  const out=await compose(show);
  assert.equal(out.ok,true,JSON.stringify(out.errors));
  assert.equal(out.duration_s,5);
  const [rail,png,webp,speed]=out.timeline.fg.props;
  assert.equal(Object.hasOwn(rail,'slot'),false);
  assert.equal(rail.effect.broken_src,undefined);
  const crack=HMComposeClient.fgBreakState(rail,1.5);
  assert.equal(crack.broken,true);assert.equal(crack.procedural,true);assert.equal(crack.src,'props/rail.png');
  assert.equal(HMComposeClient.fgBreakState(rail,1.49).broken,false);
  assert.equal(png.effect.broken_src,'props/rail-broken.png');
  assert.equal(webp.effect.broken_src,'props/rail-broken.webp');
  const pngAt=HMComposeClient.fgBreakState(png,1.5);
  const webpAt=HMComposeClient.fgBreakState(webp,1.5);
  assert.equal(pngAt.procedural,false);assert.equal(pngAt.src,'props/rail-broken.png');
  assert.equal(webpAt.procedural,false);assert.equal(webpAt.src,'props/rail-broken.webp');
  assert.equal(HMComposeClient.fgBreakState(png,1.49).src,'props/rail.png');
  assert.equal(speed.slot,'overlay');
  assert.equal(speed.src,'art/speed-lines.webp');
  assert.equal(speed.t_start,1);assert.equal(speed.t_end,2.25);
  assert.equal(Object.hasOwn(speed,'effect'),false);
  const held=HMComposeClient.fgBreakState(speed,1.5);
  assert.equal(held.broken,false);assert.equal(held.procedural,false);assert.equal(held.src,'art/speed-lines.webp');
  for(const fg of [
    {props:[{id:'a',src:'p.png',slot:'fire'}]},
    {props:[{id:'a',src:'p.png',slot:'overlay',effect:{type:'break',t:1}}]},
    {props:[{id:'a',src:'p.png',slot:'overlay',effect:'break'}]},
  ]){
    const bad=demo();bad.fg=fg;assert.equal((await compose(bad)).ok,false,JSON.stringify(fg));
  }
});

test('HM-EXPOSURE-PARAM-FX: warm crush duration and craft times are authorable, and colored FX stay colored',async()=>{
  const fx=read('presets/fx_presets.json');
  const warm=fx.hooks.find(h=>h.id==='exposure_warm_crush');
  const fist=fx.hooks.find(h=>h.id==='fist_pressure');
  const leg=fx.hooks.find(h=>h.id==='leg_arc');
  const tornado=fx.hooks.find(h=>h.id==='tornado_spiral');
  assert.equal(warm.defaults.dur,0.10);
  assert.deepEqual(warm.craft_demo_times_s,[2.8,7.3,12.5,17.5,22.8,29.7]);
  assert.equal(warm.components.includes('hitstop_2f'),false);
  assert.match(warm.source,/not grayscale or invert/i);
  for(const id of ['exposure_warm_crush','fist_pressure','leg_arc','tornado_spiral']){
    const info=HMComposeClient.classifyFxHooks([{type:id,t_rel:0.2}],fx);
    assert.equal(info.mode,'live',id);
    assert.equal(info.hasComposeOnly,false,id);
  }
  const infoStop=HMComposeClient.classifyFxHooks([{type:'hitstop_2f',t_rel:0.2}],fx);
  assert.equal(infoStop.mode,'compose_only');
  const plain=await compose(demo());
  assert.equal(plain.duration_s,5);
  assert.equal(plain.timeline.fx.exposure.length,0);
  assert.equal(plain.timeline.fx.fist.length,0);
  assert.equal(plain.timeline.overlays.length,0);
  const s=demo();
  s.atoms[0].fx_hooks=[
    {type:'exposure_warm_crush',t_rel:0.2,params:{dur:0.16}},
    {type:'fist_pressure',t_rel:0.2,params:{path:[[10,20],[30,40]]}},
    {type:'leg_arc',t_rel:0.2,params:{}},
    {type:'tornado_spiral',t_rel:0,t_rel_end:0.8,params:{path:[{x:100,y:200},{x:140,y:80}]}},
  ];
  const hooked=await compose(s);
  assert.equal(hooked.ok,true,JSON.stringify(hooked.errors));
  assert.equal(hooked.duration_s,5);
  assert.deepEqual(hooked.timeline.fx.exposure,[[0.1,0.16]]);
  assert.equal(hooked.timeline.fx.fist[0][0],0.1);
  assert.equal(hooked.timeline.fx.fist[0][1],0.36);
  assert.deepEqual(hooked.timeline.fx.fist[0][2],[[10,20],[30,40]]);
  assert.deepEqual(hooked.timeline.fx.leg[0][2],leg.defaults.path);
  assert.equal(hooked.timeline.fx.tornado[0][1],0.4);
  assert.deepEqual(hooked.timeline.fx.tornado[0][2],[[100,200],[140,80]]);
  const custom=demo();
  custom.overlays=[{id:'crush-custom',kind:'exposure_warm_crush',t_start:4.25,t_end:4.4}];
  const customOut=await compose(custom);
  assert.equal(customOut.ok,true,JSON.stringify(customOut.errors));
  assert.equal(customOut.timeline.overlays.length,1);
  assert.equal(customOut.timeline.overlays[0].kind,'exposure_warm_crush');
  assert.equal(customOut.timeline.overlays[0].t_start,4.25);
  assert.equal(customOut.timeline.overlays[0].t_end,4.4);
  const long=demo();
  long.atoms=[Object.assign({},long.atoms[0],{duration_s:30,plates_needed:1,hero:Object.assign({},long.atoms[0].hero,{plates:['P01']})})];
  long.overlays=warm.craft_demo_times_s.map(t=>({id:'crush-'+t,kind:'exposure_warm_crush',t_start:t,dur:0.10}));
  long.overlays.push({id:'fist-follow',kind:'fist_pressure',t_start:2.8,t_end:3.16,path:[[400,400],[700,260]]});
  long.overlays.push({id:'leg-whip',kind:'leg_arc',t_start:7.3,dur:0.28,path:[[900,500],[1100,180]]});
  const crafted=await compose(long);
  assert.equal(crafted.ok,true,JSON.stringify(crafted.errors));
  assert.equal(crafted.duration_s,30);
  const crush=crafted.timeline.overlays.filter(o=>o.kind==='exposure_warm_crush');
  assert.deepEqual(crush.map(o=>o.t_start),warm.craft_demo_times_s);
  assert.ok(crush.every(o=>Math.abs((o.t_end-o.t_start)-0.1)<1e-6));
  assert.equal(HMMotionFx.collectProceduralOverlays(crafted.timeline.overlays,2.85).exposure.length,1);
  assert.equal(HMMotionFx.collectProceduralOverlays(crafted.timeline.overlays,3).exposure.length,0);
  assert.deepEqual(HMMotionFx.collectProceduralOverlays(crafted.timeline.overlays,2.9).fist[0][2],[[400,400],[700,260]]);
  assert.equal(HMMotionFx.collectProceduralOverlays(crafted.timeline.overlays,7.4).leg.length,1);
  assert.deepEqual(HMMotionFx.fxPointOnPath(fist.defaults.path,0),[430,390]);
  assert.deepEqual(HMMotionFx.fxPointOnPath(fist.defaults.path,1),[760,250]);
  assert.ok(HMMotionFx.fxPointOnPath(leg.defaults.path,0.5)[0]>leg.defaults.path[0][0]);
  const px=new Uint8ClampedArray([220,220,220,255, 36,36,40,255, 225,6,0,255, 244,251,255,255, 185,220,255,255]);
  const before=px.slice();
  HMMotionFx.exposureWarmCrushPixels(px,0);
  assert.deepEqual(px,before);
  HMMotionFx.exposureWarmCrushPixels(px,1);
  assert.ok(px[0]>px[2]+8,'highlights go warm-white, got '+px[0]+','+px[1]+','+px[2]);
  assert.ok(px[4]<before[4]-8,'shadows crush toward black, got '+px[4]);
  assert.deepEqual([px[8],px[9],px[10]],[225,6,0]);
  assert.deepEqual([px[12],px[13],px[14]],[244,251,255]);
  assert.deepEqual([px[16],px[17],px[18]],[185,220,255]);
  assert.equal(px[3],255);
  assert.equal(tornado.components[0],'tornado_spiral');
});

test('HM-FX-LOC-SIZE: parametric FX location (x/y) and size (scale) default cleanly, persist on compose, and leave timing/colour/type unchanged',async()=>{
  const fx=read('presets/fx_presets.json');
  const kitFx=JSON.parse(fs.readFileSync('kit/presets/fx_presets.json','utf8'));
  for(const id of ['exposure_warm_crush','fist_pressure','leg_arc','tornado_spiral']){
    const pubPreset=fx.hooks.find(h=>h.id===id);
    const kitPreset=kitFx.hooks.find(h=>h.id===id);
    assert.ok(pubPreset&&kitPreset,id);
    assert.equal(pubPreset.defaults.x,0,id);
    assert.equal(pubPreset.defaults.y,0,id);
    assert.equal(pubPreset.defaults.scale,1,id);
    assert.equal(kitPreset.defaults.x,0,id);
    assert.equal(kitPreset.defaults.y,0,id);
    assert.equal(kitPreset.defaults.scale,1,id);
  }
  assert.deepEqual(HMComposeClient.normalizeFxPlacement({}),{x:0,y:0,scale:1});
  assert.deepEqual(HMComposeClient.normalizeFxPlacement({x:120,y:-45,scale:1.75}),{x:120,y:-45,scale:1.75});
  assert.equal(HMComposeClient.hasFxPlacement({x:0,y:0,scale:1}),false);
  assert.equal(HMComposeClient.hasFxPlacement({x:10,y:0,scale:1}),true);
  assert.equal(HMComposeClient.hasFxPlacement({x:0,y:0,scale:1.5}),true);

  // Missing x/y/scale keeps prior default placement
  const baseShow=demo();
  baseShow.atoms[0].fx_hooks=[
    {type:'fist_pressure',t_rel:0.2,params:{path:[[430,390],[610,300],[760,250]]}},
    {type:'leg_arc',t_rel:0.2,params:{}},
    {type:'tornado_spiral',t_rel:0.2,params:{}},
    {type:'exposure_warm_crush',t_rel:0.2,params:{dur:0.10}},
  ];
  const baseOut=await compose(baseShow);
  assert.equal(baseOut.ok,true);
  assert.equal(baseOut.duration_s,5);
  assert.equal(baseOut.timeline.fx.fist[0].length,3,'default placement omits extra xf element');
  assert.equal(baseOut.timeline.fx.leg[0].length,3);
  assert.equal(baseOut.timeline.fx.tornado[0].length,3);
  assert.equal(baseOut.timeline.fx.exposure[0].length,2);
  for(const hk of baseOut.timeline.atoms[0].fx_hooks){
    assert.equal(hk.params.x,0);
    assert.equal(hk.params.y,0);
    assert.equal(hk.params.scale,1);
  }

  // Editing x/y/scale updates placement without changing timing, colour, or type
  const movedShow=demo();
  movedShow.atoms[0].fx_hooks=[
    {type:'fist_pressure',t_rel:0.2,params:{path:[[430,390],[610,300],[760,250]],x:140,y:-60,scale:1.6}},
    {type:'leg_arc',t_rel:0.2,params:{x:-120,y:50,scale:1.4}},
    {type:'tornado_spiral',t_rel:0.2,params:{x:80,y:-40,scale:0.75}},
    {type:'exposure_warm_crush',t_rel:0.2,params:{dur:0.10,x:100,y:-30,scale:0.5}},
  ];
  const movedOut=await compose(movedShow);
  assert.equal(movedOut.ok,true);
  assert.equal(movedOut.duration_s,baseOut.duration_s);
  assert.deepEqual(movedOut.timeline.plates,baseOut.timeline.plates);
  assert.deepEqual(
    movedOut.timeline.atoms[0].fx_hooks.map(h=>({type:h.type,t_rel:h.t_rel,dur:h.params.dur,color:h.params.color,mode:h.mode})),
    baseOut.timeline.atoms[0].fx_hooks.map(h=>({type:h.type,t_rel:h.t_rel,dur:h.params.dur,color:h.params.color,mode:h.mode}))
  );
  assert.deepEqual(movedOut.timeline.fx.fist[0][3],{x:140,y:-60,scale:1.6});
  assert.deepEqual(movedOut.timeline.fx.leg[0][3],{x:-120,y:50,scale:1.4});
  assert.deepEqual(movedOut.timeline.fx.tornado[0][3],{x:80,y:-40,scale:0.75});
  assert.deepEqual(movedOut.timeline.fx.exposure[0][2],{x:100,y:-30,scale:0.5});

  // Path transform helper translates start point by (x,y) and scales span around anchor
  const rawPath=[[430,390],[610,300],[760,250]];
  assert.deepEqual(HMMotionFx.transformFxPath(rawPath,{x:0,y:0,scale:1}),rawPath);
  const shifted=HMMotionFx.transformFxPath(rawPath,{x:100,y:-50,scale:1});
  assert.deepEqual(shifted,[[530,340],[710,250],[860,200]]);
  const scaled=HMMotionFx.transformFxPath(rawPath,{x:0,y:0,scale:2});
  assert.deepEqual(scaled[0],[430,390]);
  assert.deepEqual(scaled[1],[430+(610-430)*2,390+(300-390)*2]);

  // Regional exposureWarmCrushPixels only crushes inside bounds when bounds provided
  const strip=new Uint8ClampedArray([220,220,220,255, 220,220,220,255]);
  HMMotionFx.exposureWarmCrushPixels(strip,1,{w:2,h:1,x0:1,y0:0,x1:2,y1:1});
  assert.deepEqual(Array.from(strip.slice(0,4)),[220,220,220,255],'pixel outside bounds untouched');
  assert.ok(strip[4]>strip[6]+8,'pixel inside bounds warm-crushed');
});

function projectFromShow(show){
  const layouts={};
  for(const key of new Set(show.atoms.map(a=>a.hero&&a.hero.layout_source).filter(Boolean))) layouts[key]=read(key);
  return {version:1,show,layouts,media:[],assets:{}};
}
test('HM-P2-PARITY: plate-pack shows report honest L/R names and a clean checklist',()=>{
  const five=demo();
  const names=HMComposeClient.charHonesty(five);
  assert.equal(names.L.name,'Lin Daiyu');
  assert.equal(names.R.name,'Wang Xifeng');
  assert.equal(names.parity,true);
  const fiveList=HMComposeClient.parityDirtyChecklist(projectFromShow(five));
  assert.equal(fiveList.active,true);
  assert.equal(fiveList.clean,true);
  assert.deepEqual(fiveList.blocks,[]);
  const ten=HMComposeClient.parityDirtyChecklist(projectFromShow(read('shows/daiyu-wang-ten-seconds.json')));
  assert.equal(ten.clean,true);
  const codexShow=read('shows/daiyu-wang-codex-import.json');
  const codexNames=HMComposeClient.charHonesty(codexShow);
  assert.equal(codexNames.L.name,'林黛玉');
  assert.equal(codexNames.R.name,'王熙鳳');
  assert.equal(HMComposeClient.parityDirtyChecklist(projectFromShow(codexShow)).clean,true);
});
test('HM-P2-PARITY: parity_mode, compose_mode, plate_pack, and long hero packs count as plate-pack',()=>{
  const flagged=demo();
  flagged.parity_mode=false;
  flagged.compose_mode='library';
  delete flagged.plate_pack;
  flagged.atoms=flagged.atoms.slice(0,1);
  assert.equal(HMComposeClient.isPlatePackShow(flagged),false);
  flagged.parity_mode=true;
  assert.equal(HMComposeClient.isPlatePackShow(flagged),true);
  flagged.parity_mode=false;
  flagged.compose_mode='parity';
  assert.equal(HMComposeClient.isPlatePackShow(flagged),true);
  flagged.compose_mode='library';
  flagged.plate_pack=true;
  assert.equal(HMComposeClient.isPlatePackShow(flagged),true);
  const auto=demo();
  auto.parity_mode=false;
  delete auto.compose_mode;
  delete auto.plate_pack;
  auto.atoms=[auto.atoms[0]];
  auto.atoms[0].duration_s=30;
  auto.atoms[0].plates_needed=50;
  auto.atoms[0].hero.plates=Array.from({length:50},(_,i)=>'P'+String(i+1).padStart(2,'0'));
  assert.equal(HMComposeClient.isPlatePackShow(auto),true);
  auto.atoms[0].plates_needed=8;
  auto.atoms[0].duration_s=5;
  auto.atoms[0].hero.plates=auto.atoms[0].hero.plates.slice(0,8);
  assert.equal(HMComposeClient.isPlatePackShow(auto),false);
});
test('HM-P2-PARITY: missing plate, broken BG, and unresolved asset block only parity shows',()=>{
  const show=demo();
  show.atoms=show.atoms.slice(0,1);
  show.atoms[0].plates_needed=1;
  show.atoms[0].hero.plates=['P01'];
  show.bg={base:'not a path',swap_t:1};
  show.overlays=[{id:'badge',kind:'image',src:'../secret.png',t_start:0,t_end:0.2}];
  const key=show.atoms[0].hero.layout_source;
  const layout=read(key);
  layout.P01={full:'../outside.png'};
  const missing=HMComposeClient.parityDirtyChecklist({version:1,show,layouts:{[key]:layout},assets:{}});
  assert.equal(missing.active,true);
  assert.ok(missing.blocks.some(row=>row.kind==='asset'&&row.text.includes('Unresolved asset')));
  assert.ok(missing.blocks.some(row=>row.kind==='bg'&&row.text.includes('Broken BG')));
  layout.P01={};
  const bare=HMComposeClient.parityDirtyChecklist({version:1,show,layouts:{[key]:layout},assets:{}});
  assert.ok(bare.blocks.some(row=>row.kind==='plate'&&row.text.includes('Missing plate')));
  const plain=structuredClone(show);
  plain.parity_mode=false;
  plain.compose_mode='library';
  delete plain.plate_pack;
  const skipped=HMComposeClient.parityDirtyChecklist({version:1,show:plain,layouts:{[key]:layout},assets:{}});
  assert.equal(skipped.active,false);
  assert.deepEqual(skipped.blocks,[]);
  const named=demo();
  named.chars={L:{name:'  '},R:{}};
  const warns=HMComposeClient.parityDirtyChecklist(projectFromShow(named));
  assert.equal(warns.blocks.length,0);
  assert.ok(warns.warns.some(row=>row.text==='L name missing from show.chars'));
  assert.ok(warns.warns.some(row=>row.text==='R name missing from show.chars'));
  const unmapped=projectFromShow(demo());
  const first=unmapped.show.atoms[0];
  unmapped.layouts[first.hero.layout_source].P01.bg='not-a-real-roof';
  const bgWarn=HMComposeClient.parityDirtyChecklist(unmapped);
  assert.equal(bgWarn.blocks.length,0);
  assert.ok(bgWarn.warns.some(row=>row.kind==='bg'&&row.text.includes('Broken BG')));
});

test('HM-DIALOGUE-HOLD: selected clips take a film-slow floor or a micro-cut, and unselected impacts stay put',async()=>{
  const packs=read('presets/timing_hold_packs.json');
  const kit=JSON.parse(fs.readFileSync('kit/presets/timing_hold_packs.json','utf8'));
  assert.deepEqual(packs,kit);
  assert.equal(packs.id,'street_timing');
  const hold=packs.packs.find(p=>p.id==='dialogue_film_slow');
  const micro=packs.packs.find(p=>p.id==='micro_cut_flurry');
  assert.equal(hold.kind,'hold');
  assert.equal(hold.duration_floor_s,1.5);
  assert.equal(hold.soft_cam.preset,'slow_push');
  assert.equal(micro.kind,'micro_cut');
  assert.equal(micro.short_hold_s,0.12);
  assert.equal(micro.impact_hold_s,1.2);

  const original=demo();
  assert.equal(original.atoms.reduce((s,a)=>s+a.duration_s,0),5);
  const snapshot=JSON.parse(JSON.stringify(original));
  const impactIdx=[0,4,6,7];
  const kept=(show,indices)=>show.atoms.filter((_,i)=>!indices.includes(i));

  const slow=HMComposeClient.applyTimingPack(original,[1],hold,{softCam:true});
  assert.deepEqual(original,snapshot);
  assert.deepEqual(kept(slow,[1]),kept(snapshot,[1]));
  assert.equal(slow.atoms[1].duration_s,1.5);
  assert.equal(slow.atoms[1].camera.preset,'slow_push');
  assert.equal(slow.atoms[1].camera.intensity,0.45);
  assert.equal(slow.atoms[1].camera.params,undefined);
  assert.equal(slow.atoms[1].timing_hold.kind,'hold');
  assert.equal(slow.atoms[1].timing_hold.soft_cam,true);
  assert.deepEqual(slow.atoms[1].fx_hooks,snapshot.atoms[1].fx_hooks);
  for(const i of impactIdx)assert.equal(slow.atoms[i].duration_s,snapshot.atoms[i].duration_s);
  const slowOut=await compose(slow);
  assert.equal(slowOut.ok,true,JSON.stringify(slowOut.errors));
  assert.equal(slowOut.duration_s,6);
  assert.ok(Math.abs((slowOut.timeline.plates[1].t1-slowOut.timeline.plates[1].t0)-1.5)<1e-4);
  assert.equal(slowOut.timeline.atoms[1].timing_hold.kind,'hold');
  assert.equal(slowOut.timeline.atoms[1].cam[0].preset,'slow_push');
  const softScale=slowOut.timeline.atoms[1].cam[0].curves.s;
  assert.equal(softScale.type,'lerp');
  assert.ok(softScale.b>1.02&&softScale.b<1.05,String(softScale.b));
  assert.equal(slowOut.timeline.plates[0].t1,0.5);
  const slowExport=HMComposeClient.timingExport(packs,slowOut,24);
  assert.equal(slowExport.kind,'hm-timing-export');
  assert.equal(slowExport.presets.packs.length,2);
  assert.equal(slowExport.frame_seq.fps,24);
  assert.equal(slowExport.frame_seq.duration_s,6);
  assert.equal(slowExport.frame_seq.cuts.length,8);
  assert.equal(slowExport.frame_seq.cuts[1].timing_hold.pack,'dialogue_film_slow');
  assert.ok(slowExport.frame_seq.cuts[1].frames>slowExport.frame_seq.cuts[0].frames);

  const floorOnly=HMComposeClient.applyTimingPack(original,[1],hold,{softCam:false});
  assert.equal(floorOnly.atoms[1].duration_s,1.5);
  assert.deepEqual(floorOnly.atoms[1].camera,snapshot.atoms[1].camera);
  assert.equal(floorOnly.atoms[1].timing_hold.soft_cam,false);
  const alreadyLong=JSON.parse(JSON.stringify(original));
  alreadyLong.atoms[1].duration_s=2;
  const stayed=HMComposeClient.applyTimingPack(alreadyLong,[1],hold,{softCam:false});
  assert.equal(stayed.atoms[1].duration_s,2);

  const flurry=HMComposeClient.applyTimingPack(original,[1,2,4,5],micro);
  assert.deepEqual(kept(flurry,[1,2,4,5]),kept(snapshot,[1,2,4,5]));
  assert.equal(flurry.atoms[1].duration_s,0.12);
  assert.equal(flurry.atoms[1].camera.preset,'ecu_jitter');
  assert.equal(flurry.atoms[1].timing_hold.kind,'micro_cut');
  assert.equal(flurry.atoms[2].duration_s,0.12);
  assert.equal(flurry.atoms[2].camera.preset,'dutch_snap');
  assert.equal(flurry.atoms[4].duration_s,1.2);
  assert.equal(flurry.atoms[4].camera.preset,'static_hold');
  assert.equal(flurry.atoms[4].camera.params,undefined);
  assert.equal(flurry.atoms[4].timing_hold.kind,'impact_hold');
  assert.equal(flurry.atoms[5].duration_s,0.12);
  assert.equal(flurry.atoms[5].camera.preset,'whip_A_to_B');
  for(const i of [0,6,7])assert.deepEqual(flurry.atoms[i],snapshot.atoms[i]);
  const flurryOut=await compose(flurry);
  assert.equal(flurryOut.ok,true,JSON.stringify(flurryOut.errors));
  assert.equal(flurryOut.duration_s,4.31);
  assert.ok(Math.abs((flurryOut.timeline.plates[1].t1-flurryOut.timeline.plates[1].t0)-0.12)<1e-4);
  assert.ok(Math.abs((flurryOut.timeline.plates[4].t1-flurryOut.timeline.plates[4].t0)-1.2)<1e-4);
  assert.equal(flurryOut.timeline.atoms[0].t1-flurryOut.timeline.atoms[0].t0,0.5);
  const flurryExport=HMComposeClient.timingExport(packs,flurryOut,24);
  assert.equal(flurryExport.frame_seq.cuts[1].timing_hold.kind,'micro_cut');
  assert.equal(flurryExport.frame_seq.cuts[4].timing_hold.kind,'impact_hold');
  assert.equal(flurryExport.frame_seq.cuts[0].timing_hold,null);
  assert.ok(flurryExport.frame_seq.cuts[4].frames>flurryExport.frame_seq.cuts[1].frames);

  const punched=JSON.parse(JSON.stringify(original));
  punched.atoms[1].fx_hooks=[{type:'hit_orange',t_rel:0.08,params:{}}];
  const heldImpact=HMComposeClient.applyTimingPack(punched,[1],micro);
  assert.equal(heldImpact.atoms[1].timing_hold.kind,'impact_hold');
  assert.equal(heldImpact.atoms[1].duration_s,1.2);
  assert.deepEqual(heldImpact.atoms[0],snapshot.atoms[0]);
  const longImpact=JSON.parse(JSON.stringify(original));
  longImpact.atoms[0].duration_s=2;
  const unshortened=HMComposeClient.applyTimingPack(longImpact,[0],micro);
  assert.equal(unshortened.atoms[0].duration_s,2);
  assert.equal(unshortened.atoms[0].timing_hold.kind,'impact_hold');

  assert.throws(()=>HMComposeClient.applyTimingPack(original,[],hold),/Select a clip/);
  assert.throws(()=>HMComposeClient.applyTimingPack(original,[1],{id:'nope',kind:'other'}),/Unknown timing pack/);
  assert.deepEqual(original,snapshot);
});

test('HM-FX-COMIC-PROFILE: comic/ink is the street and classroom default, photo chips stay on existing shows, and rejected fire/light overlays are never added',async()=>{
  const fx=read('presets/fx_presets.json');
  assert.equal(fx.hooks.some(h=>/fire/i.test(h.id)),false);
  assert.deepEqual(HMMotionFx.PHOTO_FX_CHIPS,Array.from(HMComposeClient.PHOTO_FX_CHIPS));
  assert.equal(HMComposeClient.resolveFxProfile(demo()),'full');
  assert.equal(HMComposeClient.defaultFxProfileFor('street'),'comic');
  assert.equal(HMComposeClient.defaultFxProfileFor('classroom'),'comic');
  assert.equal(HMComposeClient.defaultFxProfileFor(''),'full');
  const classroom=demo();
  classroom.meta={venue:'classroom'};
  assert.equal(HMComposeClient.resolveFxProfile(classroom),'comic');
  classroom.fx_profile='full';
  assert.equal(HMComposeClient.resolveFxProfile(classroom),'full');
  assert.match(HMComposeClient.fxProfileHonesty('comic'),/Comic\/ink is the default/);
  assert.match(HMComposeClient.fxProfileHonesty('comic'),/never adds those overlays/);
  assert.match(HMComposeClient.fxProfileHonesty('comic'),/still opens/);
  assert.match(HMComposeClient.fxProfileHonesty('full'),/never added on their own/);
  assert.match(HMComposeClient.fxProfileHonesty('full'),/still opens/);

  const plain=await compose(demo());
  assert.equal(plain.ok,true);
  assert.equal(plain.duration_s,5);
  assert.equal(plain.timeline.plates.length,8);
  assert.equal(plain.timeline.fx_profile,'full');
  assert.equal(plain.timeline.overlays.length,0);
  assert.deepEqual(HMComposeClient.rejectedPhotoOverlaysAdded(demo(),plain.timeline.overlays),[]);

  const show=demo();
  show.venue='street';
  show.atoms[0].fx_hooks=[
    {type:'dust',t_rel:0.1,params:{k:1}},
    {type:'speed_lines',t_rel:0.1,t_rel_end:0.9,params:{mode:'up',k0:0,k1:1}},
    {type:'exposure_warm_crush',t_rel:0.2,params:{dur:0.16,x:40,y:-20,scale:1.25}},
    {type:'fist_pressure',t_rel:0.2,params:{path:[[10,20],[30,40]],x:0,y:0,scale:1}},
    {type:'flash_orange',t_rel:0.2,params:{}},
  ];
  show.overlays=[
    {id:'fire-kept',kind:'fire',src:'assets/wording/bang_zh.png',t_start:0.2,t_end:0.8},
    {id:'light-kept',kind:'photo_light',src:'assets/wording/clash_en.png',t_start:0.2,t_end:0.9},
    {id:'word',kind:'text',text:'POW',t_start:0.2,t_end:0.8},
    {id:'styled',kind:'text',text:'BANG',t_start:0.2,t_end:0.8,style:{fill:'#ff00aa',stroke:'#000000',strokeWidth:4,fontSize:40}},
    {id:'crush-kept',kind:'exposure_warm_crush',t_start:1.2,t_end:1.3},
  ];
  const comic=await compose(show);
  assert.equal(comic.ok,true,JSON.stringify(comic.errors));
  assert.equal(comic.duration_s,5);
  assert.equal(comic.timeline.fx_profile,'comic');
  assert.equal(comic.timeline.fx.dust.length,0);
  assert.equal(comic.timeline.fx.flash.length,0);
  assert.equal(comic.timeline.fx.exposure.length,0);
  assert.equal(comic.timeline.fx.speed.length,1);
  assert.equal(comic.timeline.fx.fist.length,1);
  assert.deepEqual(comic.timeline.atoms[0].fx_hooks.map(h=>h.type),['dust','speed_lines','exposure_warm_crush','fist_pressure','flash_orange']);
  const crushHook=comic.timeline.atoms[0].fx_hooks.find(h=>h.type==='exposure_warm_crush');
  assert.equal(crushHook.params.dur,0.16);
  assert.equal(crushHook.params.x,40);
  assert.equal(crushHook.params.y,-20);
  assert.equal(crushHook.params.scale,1.25);
  for(const id of ['fire-kept','light-kept','crush-kept','word','styled'])assert.ok(comic.timeline.overlays.some(o=>o.id===id),id);
  assert.equal(comic.timeline.overlays.find(o=>o.id==='fire-kept').kind,'fire');
  assert.equal(comic.timeline.overlays.find(o=>o.id==='fire-kept').src,'assets/wording/bang_zh.png');
  assert.equal(comic.timeline.overlays.find(o=>o.id==='fire-kept').fx_paint,false);
  assert.equal(comic.timeline.overlays.find(o=>o.id==='light-kept').fx_paint,false);
  assert.equal(comic.timeline.overlays.find(o=>o.id==='crush-kept').fx_paint,false);
  assert.equal(comic.timeline.overlays.find(o=>o.id==='crush-kept').kind,'exposure_warm_crush');
  assert.equal(HMComposeClient.rejectedPhotoOverlaysAdded(show,comic.timeline.overlays).length,0);
  assert.deepEqual(comic.timeline.overlays.find(o=>o.id==='word').style,{fill:'#f4efe4',stroke:'#14110e',strokeWidth:11,fontWeight:900});
  assert.equal(comic.timeline.overlays.find(o=>o.id==='styled').style.fill,'#ff00aa');
  assert.equal(Object.hasOwn(comic.timeline.overlays.find(o=>o.id==='styled'),'fx_paint'),false);

  show.fx_profile='full';
  const full=await compose(show);
  assert.equal(full.ok,true,JSON.stringify(full.errors));
  assert.equal(full.duration_s,5);
  assert.equal(full.timeline.fx_profile,'full');
  assert.equal(full.timeline.fx.dust.length,1);
  assert.equal(full.timeline.fx.flash.length,1);
  assert.equal(full.timeline.fx.exposure.length,1);
  assert.deepEqual(full.timeline.fx.exposure[0][2],{x:40,y:-20,scale:1.25});
  assert.equal(full.timeline.fx.fist[0][2][0][0],10);
  assert.equal(Object.hasOwn(full.timeline.overlays.find(o=>o.id==='fire-kept'),'fx_paint'),false);
  assert.equal(full.timeline.overlays.find(o=>o.id==='fire-kept').kind,'fire');
  assert.equal(full.timeline.overlays.find(o=>o.id==='word').style,undefined);
  assert.equal(HMComposeClient.rejectedPhotoOverlaysAdded(show,full.timeline.overlays).length,0);

  const bare=demo();
  bare.fx_profile='comic';
  const bareOut=await compose(bare);
  assert.equal(bareOut.ok,true);
  assert.equal(bareOut.duration_s,5);
  assert.equal(bareOut.timeline.overlays.filter(o=>HMComposeClient.isRejectedPhotoOverlay(o)).length,0);
  assert.equal(HMComposeClient.rejectedPhotoOverlaysAdded(bare,bareOut.timeline.overlays).length,0);
});

test('HM-CAM-CHAIN: chained clips inherit end u as the next start and stay continuous across the cut', async () => {
  const s = demo();
  s.atoms[0].camera = { preset: 'slow_push' };
  s.atoms[1].camera = { preset: 'static_hold' };
  s.atoms[2].camera = { preset: 'eye_orbit' };
  const info = HMComposeClient.chainClipCameras(s.atoms, [0, 1, 2]);
  assert.equal(info.count, 3);
  assert.equal(info.preset, 'slow_push');
  assert.equal(s.atoms[1].camera.preset, 'slow_push');
  assert.equal(s.atoms[2].camera.preset, 'slow_push');
  const ranges = s.atoms.slice(0, 3).map(a => a.camera.segments[0].u_range);
  assert.deepEqual(ranges, [[0, 0.3333], [0.3333, 0.6667], [0.6667, 1]]);
  assert.equal(ranges[0][1], ranges[1][0]);
  assert.equal(ranges[1][1], ranges[2][0]);
  assert.equal(s.atoms[0].camera.chain.index, 0);
  assert.equal(s.atoms[2].camera.chain.count, 3);
  assert.equal(s.atoms[3].camera.chain, undefined);
  assert.throws(() => HMComposeClient.chainClipCameras(s.atoms, [0, 2]), /adjacent/);
  const r = await compose(s);
  assert.equal(r.ok, true);
  assert.equal(r.duration_s, 5);
  const before = HMComposeClient.inspectAt(r, 0.5 - 1e-4).cam_pose;
  const after = HMComposeClient.inspectAt(r, 0.5).cam_pose;
  for (const k of ['x', 'y', 's', 'r']) assert.ok(Math.abs(before[k] - after[k]) < 1e-3, k);
  HMComposeClient.setCamEase(s.atoms[0].camera, 'snap');
  HMComposeClient.setCamEase(s.atoms[1].camera, 'snap');
  HMComposeClient.setCamEase(s.atoms[2].camera, 'snap');
  const snapped = await compose(s);
  assert.equal(snapped.ok, true);
  assert.equal(snapped.timeline.atoms[0].cam[0].ease, 'snap');
  assert.equal(snapped.timeline.atoms[0].cam[0].snap_zoom, true);
  const hold = HMComposeClient.inspectAt(snapped, 0.1).cam_pose.s;
  const punch = HMComposeClient.inspectAt(snapped, 1.45).cam_pose.s;
  assert.ok(hold < 1.02, 'early snap holds, got ' + hold);
  assert.ok(punch > hold + 0.1, 'late snap punches, got ' + punch);
  const cutBefore = HMComposeClient.inspectAt(snapped, 1 - 1e-4).cam_pose;
  const cutAfter = HMComposeClient.inspectAt(snapped, 1).cam_pose;
  for (const k of ['x', 'y', 's', 'r']) assert.ok(Math.abs(cutBefore[k] - cutAfter[k]) < 1e-3, 'snap ' + k);
  const seg = snapped.timeline.atoms[2].cam[0];
  const composedPose = HMComposeClient.poseOnSegment(seg, 1.4);
  const previewPose = cameraPoseOnSegment(seg, 1.4);
  for (const k of ['x', 'y', 's', 'r']) assert.ok(Math.abs(composedPose[k] - previewPose[k]) < 1e-6, 'preview ' + k);
  HMComposeClient.unchainClip(s.atoms, 2);
  assert.equal(s.atoms[2].camera.chain, undefined);
  assert.deepEqual(s.atoms[2].camera.segments[0].u_range, [0, 1]);
  assert.equal(s.atoms[0].camera.segments[0].u_range[1], s.atoms[1].camera.segments[0].u_range[0]);
  assert.equal(s.atoms[0].camera.segments[0].u_range[0], 0);
  assert.equal(s.atoms[1].camera.segments[0].u_range[1], 1);
  s.atoms[0].duration_s = 1;
  s.atoms[0].camera.segments[0].dur_s = 1;
  HMComposeClient.reflowCamChain(s.atoms, s.atoms[0].camera.chain.id);
  assert.equal(s.atoms[0].camera.segments[0].u_range[1], s.atoms[1].camera.segments[0].u_range[0]);
  assert.equal(s.atoms[1].camera.segments[0].u_range[1], 1);
});

test('HM-CAM-CHAIN: snap zoom holds then punches, and linear drift is not the preset smoothstep', async () => {
  const linear = demo();
  linear.atoms = linear.atoms.slice(0, 1);
  linear.atoms[0].camera = { preset: 'slow_push', ease: 'linear', segments: [{ preset: 'slow_push', dur_s: 0.5, u_range: [0, 1], ease: 'linear' }] };
  const smooth = demo();
  smooth.atoms = smooth.atoms.slice(0, 1);
  smooth.atoms[0].camera = { preset: 'slow_push', ease: 'smooth', segments: [{ preset: 'slow_push', dur_s: 0.5, u_range: [0, 1], ease: 'smooth' }] };
  const snap = demo();
  snap.atoms = snap.atoms.slice(0, 1);
  snap.atoms[0].camera = { preset: 'static_hold', ease: 'snap', snap_zoom: true, segments: [{ preset: 'static_hold', dur_s: 0.5, u_range: [0, 1], ease: 'snap', snap_zoom: true }] };
  const [lr, sr, nr] = await Promise.all([compose(linear), compose(smooth), compose(snap)]);
  assert.equal(lr.ok, true);
  assert.equal(sr.ok, true);
  assert.equal(nr.ok, true);
  const at = (r, t) => HMComposeClient.inspectAt(r, t).cam_pose.s;
  assert.ok(Math.abs(at(lr, 0.125) - 1.0175) < 1e-3, at(lr, 0.125));
  assert.ok(at(sr, 0.125) < at(lr, 0.125) - 0.004, at(sr, 0.125));
  assert.ok(at(nr, 0.1) < 1.02, at(nr, 0.1));
  assert.ok(at(nr, 0.48) > 1.15, at(nr, 0.48));
  const bad = demo();
  bad.atoms[0].camera = { preset: 'slow_push', ease: 'bounce' };
  assert.equal((await compose(bad)).ok, false);
});

test('HM-FX-PATH-EDIT: authored fx path persists, omitted path uses stock, and preview resolution matches compose',async()=>{
  const stock={
    fist_pressure:[[430,390],[610,300],[760,250]],
    leg_arc:[[800,560],[1020,340],[1160,150]],
    tornado_spiral:[[640,480],[660,300]],
  };
  for(const [type,path] of Object.entries(stock)){
    assert.deepEqual(HMComposeClient.stockFxPath(type),path,type);
    assert.deepEqual(HMComposeClient.resolveFxPath(type,undefined),path,type);
    assert.deepEqual(HMComposeClient.resolveFxPath(type,[]),path,type);
    assert.equal(HMComposeClient.normalizeFxPath([]),null,type);
    assert.equal(HMComposeClient.normalizeFxPath([[10,20]]),null,type+' one point');
    assert.deepEqual(HMMotionFx.fxPathOrStock(type,null),path,type);
    assert.deepEqual(HMMotionFx.fxPathOrStock(type,[]),path,type);
  }
  const custom=[[160,560],[160,560],[240,520]];
  assert.deepEqual(HMComposeClient.normalizeFxPath(custom),custom);
  assert.deepEqual(HMComposeClient.resolveFxPath('fist_pressure',[{x:160,y:560},{x:240,y:520}]),[[160,560],[240,520]]);
  assert.deepEqual(HMMotionFx.fxPathOrStock('tornado_spiral',[{x:12,y:34},{x:56,y:78}]),[[12,34],[56,78]]);
  const plain=await compose(demo());
  assert.equal(plain.duration_s,5);
  const show=demo();
  show.atoms[0].fx_hooks=[
    {type:'fist_pressure',t_rel:0.2,params:{dur:0.36,path:custom,x:0,y:0,scale:1}},
    {type:'leg_arc',t_rel:0.2,params:{dur:0.28}},
    {type:'tornado_spiral',t_rel:0.2,params:{path:[{x:100,y:200},{x:140,y:80}]}},
  ];
  const out=await compose(show);
  assert.equal(out.ok,true,JSON.stringify(out.errors));
  assert.equal(out.duration_s,5);
  assert.deepEqual(out.timeline.plates.map(p=>[p.t0,p.t1]),plain.timeline.plates.map(p=>[p.t0,p.t1]));
  assert.equal(show.atoms[0].fx_hooks[1].params.path,undefined,'omitted leg path stays omitted on the show');
  assert.deepEqual(out.timeline.fx.fist[0][2],custom);
  assert.deepEqual(out.timeline.fx.leg[0][2],stock.leg_arc);
  assert.deepEqual(out.timeline.fx.tornado[0][2],[[100,200],[140,80]]);
  assert.deepEqual(out.timeline.atoms[0].fx_hooks[0].params.path,custom);
  assert.equal(out.timeline.atoms[0].fx_hooks[0].type,'fist_pressure');
  assert.equal(out.timeline.atoms[0].fx_hooks[0].params.dur,0.36);
  assert.equal(out.timeline.atoms[0].fx_hooks[0].params.x,0);
  assert.equal(out.timeline.atoms[0].fx_hooks[0].params.scale,1);
  assert.equal(out.timeline.fx.fist[0][0],0.1);
  assert.equal(out.timeline.fx.fist[0][1],0.36);
  assert.equal(out.timeline.fx.leg[0][1],0.28);
  const moved=demo();
  moved.atoms[0].fx_hooks=[{type:'fist_pressure',t_rel:0.2,params:{path:custom,x:40,y:-10,scale:1.25}}];
  const movedOut=await compose(moved);
  assert.deepEqual(movedOut.timeline.fx.fist[0][2],custom,'placement does not rewrite the authored path');
  assert.deepEqual(movedOut.timeline.fx.fist[0][3],{x:40,y:-10,scale:1.25});
});

test('HM-PARALLAX-DEFAULT-HONESTY: FG parallax exposes 0, 0.45 (default), and 1, and defaults to 0.45 unless changed',async()=>{
  assert.equal(HMComposeClient.FG_DEFAULT_PARALLAX,0.45);
  assert.deepEqual(HMComposeClient.FG_PARALLAX_PRESETS,[0,0.45,1]);
  const clock={duration:5,atomT0:0,atomT1:5};
  // Omitted cam or omitted amount defaults to parallax 0.45.
  const showDefault=demo();
  showDefault.fg={props:[{id:'crate',src:'props/crate.png',x:640,y:360,scale:1,z:10,t_start:0,t_end:5}]};
  const outDefault=await compose(showDefault);
  assert.equal(outDefault.ok,true,JSON.stringify(outDefault.errors));
  assert.equal(outDefault.timeline.fg.cam.preset,'parallax');
  assert.equal(outDefault.timeline.fg.cam.amount,0.45);
  const frameDef0=HMComposeClient.fgCameraFrame(outDefault.timeline.fg.cam,0,clock);
  const frameDefEnd=HMComposeClient.fgCameraFrame(outDefault.timeline.fg.cam,5,clock);
  assert.equal(frameDef0.preset,'parallax');
  assert.equal(frameDef0.amount,0.45);
  assert.equal(frameDef0.x,108);
  assert.equal(frameDefEnd.x,-108);
  // Explicit 0 holds zero parallax drift.
  const showZero=demo();
  showZero.fg={cam:{preset:'parallax',amount:0},props:showDefault.fg.props};
  const outZero=await compose(showZero);
  assert.equal(outZero.ok,true);
  assert.equal(outZero.timeline.fg.cam.preset,'parallax');
  assert.equal(outZero.timeline.fg.cam.amount,0);
  const frameZero0=HMComposeClient.fgCameraFrame(outZero.timeline.fg.cam,0,clock);
  const frameZeroEnd=HMComposeClient.fgCameraFrame(outZero.timeline.fg.cam,5,clock);
  assert.equal(frameZero0.amount,0);
  assert.equal(frameZero0.x,0);
  assert.equal(frameZeroEnd.x,0);
  // Explicit 1 runs full parallax drift.
  const showOne=demo();
  showOne.fg={cam:{preset:'parallax',amount:1},props:showDefault.fg.props};
  const outOne=await compose(showOne);
  assert.equal(outOne.ok,true);
  assert.equal(outOne.timeline.fg.cam.preset,'parallax');
  assert.equal(outOne.timeline.fg.cam.amount,1);
  const frameOne0=HMComposeClient.fgCameraFrame(outOne.timeline.fg.cam,0,clock);
  const frameOneEnd=HMComposeClient.fgCameraFrame(outOne.timeline.fg.cam,5,clock);
  assert.equal(frameOne0.amount,1);
  assert.equal(frameOne0.x,240);
  assert.equal(frameOneEnd.x,-240);
  assert.notEqual(frameZero0.x,frameDef0.x);
  assert.notEqual(frameDef0.x,frameOne0.x);
});



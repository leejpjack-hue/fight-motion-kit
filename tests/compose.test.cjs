const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
require('../public/ui/compose-client.js');
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

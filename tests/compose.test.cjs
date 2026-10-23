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

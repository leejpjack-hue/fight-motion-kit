/* HM-PF-45: bake QA uses the HF-02 clock and HF-01 frame peeks.
 * Plate shows and pending imported strips sample that same t.
 * No second clock is introduced. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
require('../public/ui/compose-client.js');
require('../public/ui/costume-lock.js');
require('../public/ui/pose-ref-pack.js');

const read=p=>JSON.parse(fs.readFileSync('public/'+p,'utf8'));
const demo=()=>read('shows/daiyu-wang-five-seconds.json');
const compose=show=>HMComposeClient.composeShow(show,{
  cameraPresets:read('presets/camera_presets.json'),
  fxPresets:read('presets/fx_presets.json'),
  loadJson:async p=>read(p),
});

function pendingStrip(extra={}){
  return {
    id:'strip-1',
    name:'body-strip.png',
    src:'imports/strip-1/strip.png',
    layoutSource:'imports/strip-1/layout.json',
    plateId:'P01',
    pendingMotion:{
      adapter:'hm-sg01-body-strip',
      version:1,
      status:'pending',
      geometry:{frames:4,w:2,h:2,body_h:1},
      cadence:{secondsPerCell:0.1,timingSource:'fps'},
      policy:{kind:'once'},
      ...extra,
    },
  };
}

test('HM-PF-45 bake QA stays on the renderAt clock',()=>{
  const contract=HMComposeClient.SEEKABLE_PREVIEW_CONTRACT;
  assert.ok(contract.surfaces.includes('bake_qa_dock'));
  assert.equal(contract.softWarnBlocksBake,false);
  const ok=HMComposeClient.evaluateSeekPreviewCall({t:1.25,viaSoT:true,source:'bake-qa-dock'},5);
  assert.equal(ok.ok,true);
  assert.equal(ok.warn,false);
  assert.equal(ok.blocksBake,false);
  const gif=HMComposeClient.evaluateSeekPreviewCall({t:1.25,viaSoT:false,source:'css-gif-clock'},5);
  assert.equal(gif.warn,true);
  assert.equal(gif.blocksBake,false);
});

test('HM-PF-45 frame peek on the five-second plate demo uses one clock',async()=>{
  const show=demo();
  const composed=await compose(show);
  assert.equal(composed.ok,true);
  assert.equal(composed.duration_s,5);
  const before=structuredClone(show);
  const snap=HMComposeClient.bakeQaSnapshot({show,media:[]},composed,1.25);
  assert.deepEqual(show,before);
  assert.equal(snap.clock,'renderAt');
  assert.equal(snap.separateClock,false);
  assert.equal(snap.gifClock,false);
  assert.equal(snap.cssClock,false);
  assert.equal(snap.show_duration_s,5);
  assert.equal(snap.peek_count,16);
  assert.equal(snap.atom_count,8);
  assert.equal(snap.plate_show,true);
  assert.ok(snap.peek);
  assert.ok(snap.peek.t>=snap.peek.t0-1e-6&&snap.peek.t<snap.peek.t1);
  assert.match(snap.peek.source_plate,/^P0[1-8]$/);
  assert.equal(snap.strips.length,0);
});

test('HM-PF-45 frame peek works on a plate show and a pose-ref pack',async()=>{
  const show=demo();
  show.plate_pack=true;
  const composed=await compose(show);
  const plate=HMComposeClient.bakeQaSnapshot({show},composed,0.2);
  assert.equal(plate.plate_show,true);
  assert.equal(plate.peek.source_plate,'P01');
  assert.equal(plate.peek.sample_kind,'mid');
  assert.equal(show.atoms.length,8);
  assert.equal(composed.duration_s,5);

  const pack=read('presets/openpose_10s_kicks_pose_pack.json');
  const project=HMPoseRefPack.normalizePoseRefPlatePack(pack);
  const posed=await HMComposeClient.composeShow(project.show,{
    cameraPresets:read('presets/camera_presets.json'),
    fxPresets:read('presets/fx_presets.json'),
    loadJson:async p=>project.layouts[p]||project.layouts[String(p).replace(/^\//,'')]||read(p),
  });
  assert.equal(posed.ok,true);
  const snap=HMComposeClient.bakeQaSnapshot(project,posed,0.2);
  assert.equal(snap.plate_show,true);
  assert.equal(snap.pose_ref,true);
  assert.equal(snap.atom_count,20);
  assert.equal(snap.peek_count,40);
  assert.equal(snap.peek.source_plate,'P01');
  assert.equal(snap.separateClock,false);
  const late=HMComposeClient.bakeQaSnapshot(project,posed,posed.duration_s-0.05);
  assert.equal(late.peek.source_plate,'P20');
  assert.ok(late.peek.t>=late.peek.t0-1e-6);
});

test('HM-PF-45 imported strip cells follow the shared scrub time and stay not playable',async()=>{
  const show=demo();
  const composed=await compose(show);
  const strip=pendingStrip();
  const before=structuredClone(strip.pendingMotion);
  const project={show,media:[strip],assets:{}};
  const snap=HMComposeClient.bakeQaSnapshot(project,composed,0.25);
  assert.deepEqual(strip.pendingMotion,before);
  assert.equal(snap.t,0.25);
  assert.equal(snap.show_duration_s,5);
  assert.equal(snap.strips.length,1);
  assert.equal(snap.strips[0].index,2);
  assert.equal(snap.strips[0].frames,4);
  assert.equal(snap.strips[0].not_playable,true);
  assert.equal(snap.strips[0].clock,'renderAt');
  assert.equal(snap.peek_count,16);
  assert.equal(show.atoms.length,8);

  const held=HMComposeClient.bakeQaSnapshot(project,composed,4.5);
  assert.equal(held.strips[0].index,3);
  assert.equal(held.strips[0].clamped,true);
  assert.equal(held.peek.atom_index>0,true);

  const direct=HMComposeClient.stripCellAt(strip.pendingMotion,0);
  assert.equal(direct.index,0);
  assert.equal(direct.clamped,false);
  assert.equal(HMComposeClient.stripCellAt({status:'ready',geometry:{frames:4,w:2,h:2},cadence:{secondsPerCell:0.1}},0.2),null);
  assert.equal(HMComposeClient.stripCellAt(null,0),null);
});
require('./hm-38-40-41-106.test.cjs');

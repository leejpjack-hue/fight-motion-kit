const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
require('../public/ui/compose-client.js');

const read=p=>JSON.parse(fs.readFileSync('public/'+p,'utf8'));
const demo=()=>read('shows/daiyu-wang-five-seconds.json');
const snap=value=>JSON.stringify(value);
function projectFromShow(show){
  const layouts={};
  for(const key of new Set(show.atoms.map(a=>a.hero&&a.hero.layout_source).filter(Boolean))) layouts[key]=read(key);
  return {version:1,show,layouts,media:[],assets:{}};
}
function beatIds(board){
  return board.beats.map(beat=>beat.beat_id);
}
const composeOpts=()=>({
  cameraPresets:read('presets/camera_presets.json'),
  fxPresets:read('presets/fx_presets.json'),
  loadJson:async p=>read(p),
});

test('HM-PF-08 beat_id stamps from the board and round-trips in show order',()=>{
  const bridge=HMComposeClient.BEAT_ID_BRIDGE;
  assert.equal(bridge.id,'HM-PF-08-BEAT-ID-BRIDGE');
  assert.equal(bridge.field,'beat_id');
  assert.equal(bridge.skill,'hm-storyboard-cantonese');
  assert.equal(bridge.pf06,'HM-PF-06');
  assert.equal(bridge.blocksBake,false);
  const schema=JSON.parse(fs.readFileSync('kit/schema/atom.schema.json','utf8'));
  assert.equal(schema.properties.beat_id.type,'string');

  const show=demo();
  const before=snap(show);
  const built=HMComposeClient.boardFromShow(show);
  assert.equal(built.ok,true);
  assert.deepEqual(beatIds(built.board),show.atoms.map(atom=>atom.id));
  assert.equal(snap(show),before);

  const applied=HMComposeClient.applyBoardToShow(show,built.board);
  assert.equal(applied.ok,true);
  assert.deepEqual(applied.show.atoms.map(atom=>atom.beat_id),show.atoms.map(atom=>atom.id));
  assert.deepEqual(applied.show.atoms.map(atom=>atom.id),show.atoms.map(atom=>atom.id));
  assert.deepEqual(applied.show.atoms.map(atom=>atom.hero.plates),show.atoms.map(atom=>atom.hero.plates));
  assert.equal(applied.show.atoms.reduce((sum,atom)=>sum+atom.duration_s,0),5);
  assert.equal(snap(show),before);

  const again=HMComposeClient.applyBoardToShow(applied.show,applied.board);
  assert.equal(again.ok,true);
  assert.deepEqual(again.show.atoms.map(atom=>atom.beat_id),applied.show.atoms.map(atom=>atom.beat_id));

  const round=HMComposeClient.roundTripBoard(show,built.board);
  assert.equal(round.ok,true);
  assert.deepEqual(beatIds(round.board),beatIds(built.board));
  assert.deepEqual(round.show.atoms.map(atom=>atom.beat_id),beatIds(built.board));
  assert.equal(snap(show),before);
});

test('HM-PF-08 rename updates the board and the show, or leaves both unchanged',()=>{
  const show=demo();
  const stamped=HMComposeClient.applyBoardToShow(show,HMComposeClient.boardFromShow(show).board);
  const plates=stamped.show.atoms[0].hero.plates.slice();
  const durations=stamped.show.atoms.map(atom=>atom.duration_s);
  const showSnap=snap(stamped.show);
  const boardSnap=snap(stamped.board);

  const renamed=HMComposeClient.renameBeat(stamped.show,stamped.board,'beat-01','beat-open');
  assert.equal(renamed.ok,true);
  assert.equal(renamed.show.atoms[0].id,'beat-open');
  assert.equal(renamed.show.atoms[0].beat_id,'beat-open');
  assert.equal(renamed.board.beats[0].beat_id,'beat-open');
  assert.equal(renamed.show.atoms[1].id,'beat-02');
  assert.equal(renamed.show.atoms[1].beat_id,'beat-02');
  assert.deepEqual(renamed.show.atoms[0].hero.plates,plates);
  assert.deepEqual(renamed.show.atoms.map(atom=>atom.duration_s),durations);
  assert.equal(snap(stamped.show),showSnap);
  assert.equal(snap(stamped.board),boardSnap);

  const round=HMComposeClient.roundTripBoard(renamed.show,renamed.board);
  assert.equal(round.ok,true);
  assert.equal(round.board.beats[0].beat_id,'beat-open');
  assert.equal(round.show.atoms[0].beat_id,'beat-open');
  assert.deepEqual(beatIds(round.board),beatIds(renamed.board));

  const clash=HMComposeClient.renameBeat(stamped.show,stamped.board,'beat-01','beat-02');
  assert.equal(clash.ok,false);
  assert.equal(clash.conflicts[0].code,'duplicate_target');
  assert.match(clash.conflicts[0].fix,/^Fix: .+\.$/);
  assert.equal(snap(stamped.show),showSnap);
  assert.equal(snap(stamped.board),boardSnap);
  assert.equal(snap(clash.show),showSnap);

  const fromShow=HMComposeClient.renameBeat(stamped.show,null,'beat-01','beat-open');
  assert.equal(fromShow.ok,true);
  assert.equal(fromShow.show.atoms[0].id,'beat-open');
  assert.equal(fromShow.show.atoms[0].beat_id,'beat-open');
  assert.equal(fromShow.board.beats[0].beat_id,'beat-open');
  assert.equal(snap(stamped.show),showSnap);
});

test('HM-PF-08 a drifted id conflicts and does not write either side',()=>{
  const show=demo();
  const stamped=HMComposeClient.applyBoardToShow(show,HMComposeClient.boardFromShow(show).board);
  const drifted=JSON.parse(snap(stamped.show));
  drifted.atoms[0].id='clip-drift';
  const driftSnap=snap(drifted);
  const blocked=HMComposeClient.renameBeat(drifted,stamped.board,'beat-01','beat-open');
  assert.equal(blocked.ok,false);
  assert.equal(blocked.conflicts[0].code,'id_split');
  assert.equal(snap(drifted),driftSnap);
  assert.equal(blocked.show.atoms[0].id,'clip-drift');
  assert.equal(blocked.show.atoms[0].beat_id,'beat-01');

  const moved=JSON.parse(snap(stamped.show));
  moved.atoms[0].id='clip-drift';
  moved.atoms[0].beat_id='clip-drift';
  const movedSnap=snap(moved);
  const unsynced=HMComposeClient.applyBoardToShow(moved,stamped.board);
  assert.equal(unsynced.ok,false);
  assert.ok(unsynced.conflicts.some(item=>item.code==='unmatched_beat'));
  assert.ok(unsynced.conflicts.some(item=>item.code==='unbridged_atom'));
  assert.equal(snap(moved),movedSnap);

  const splitBoard=JSON.parse(snap(stamped.board));
  splitBoard.beats[0].id='other-alias';
  const split=HMComposeClient.applyBoardToShow(stamped.show,splitBoard);
  assert.equal(split.ok,false);
  assert.equal(split.conflicts[0].code,'id_split');
  assert.equal(stamped.show.atoms[0].beat_id,'beat-01');
});

test('HM-PF-08 alias board ids and show order are the round-trip contract',()=>{
  const show=demo();
  const before=snap(show);
  const board={
    show_id:show.show_id,
    beats:show.atoms.map(atom=>({id:atom.id,label:atom.label,line:'pf06-prose'})),
  };
  const applied=HMComposeClient.applyBoardToShow(show,board);
  assert.equal(applied.ok,true);
  assert.equal(applied.show.atoms[3].beat_id,show.atoms[3].id);
  assert.equal(applied.board.beats[3].beat_id,show.atoms[3].id);
  assert.equal(applied.board.beats[3].line,'pf06-prose');
  const round=HMComposeClient.roundTripBoard(show,board);
  assert.equal(round.ok,true);
  assert.deepEqual(beatIds(round.board),show.atoms.map(atom=>atom.id));
  assert.equal(snap(show),before);

  const reversed=JSON.parse(snap(board));
  reversed.beats.reverse();
  const drifted=HMComposeClient.roundTripBoard(show,reversed);
  assert.equal(drifted.ok,false);
  assert.equal(drifted.conflicts[0].code,'order_drift');
  assert.equal(snap(show),before);
  const stamped=HMComposeClient.applyBoardToShow(show,reversed);
  assert.equal(stamped.ok,true);
  assert.equal(stamped.show.atoms[0].id,'beat-01');
  assert.equal(stamped.show.atoms[0].beat_id,'beat-01');
  assert.equal(stamped.show.atoms.at(-1).beat_id,show.atoms.at(-1).id);

  const mismatch=JSON.parse(snap(board));
  mismatch.show_id='other-show';
  const wrongShow=HMComposeClient.applyBoardToShow(show,mismatch);
  assert.equal(wrongShow.ok,false);
  assert.equal(wrongShow.conflicts[0].code,'show_mismatch');
  assert.equal(snap(show),before);

  const emptyShow={show_id:'empty-show',atoms:[]};
  const empty=HMComposeClient.roundTripBoard(emptyShow,{show_id:'empty-show',beats:[]});
  assert.equal(empty.ok,true);
  assert.deepEqual(empty.board.beats,[]);
});

test('HM-PF-08 lint warns on beat id conflicts and does not block bake',()=>{
  const cameraPresets=read('presets/camera_presets.json');
  const fxPresets=read('presets/fx_presets.json');
  const contract=HMComposeClient.SHOW_LINT_CONTRACT;
  assert.equal(contract.blocksBake,false);
  assert.deepEqual(contract.bridgeCodes,['beat_id_conflict']);
  assert.equal(contract.structuralCodes.includes('beat_id_conflict'),false);

  const clean=HMComposeClient.lintShow(projectFromShow(demo()),{cameraPresets,fxPresets});
  assert.equal(clean.clean,true);
  assert.equal(clean.blocksBake,false);
  assert.equal(clean.findings.some(item=>item.code==='beat_id_conflict'),false);

  const split=demo();
  split.atoms[0].beat_id='beat-other';
  const lint=HMComposeClient.lintShow(projectFromShow(split),{cameraPresets,fxPresets});
  const hits=lint.findings.filter(item=>item.code==='beat_id_conflict');
  assert.equal(hits.length,1);
  assert.equal(hits[0].category,'bridge');
  assert.equal(hits[0].severity,'warn');
  assert.equal(hits[0].blocksBake,false);
  assert.equal(hits[0].atom_id,'beat-01');
  assert.match(hits[0].fix,/^Fix: .+\.$/);
  assert.equal(/\.\s+[A-Z]/.test(hits[0].fix.slice(5,-1)),false);
  assert.equal(lint.blocksBake,false);

  const dup=demo();
  dup.atoms[0].id='same-beat';
  dup.atoms[0].beat_id='same-beat';
  dup.atoms[1].id='same-beat';
  dup.atoms[1].beat_id='same-beat';
  const duplicated=HMComposeClient.lintShow(projectFromShow(dup),{cameraPresets,fxPresets});
  assert.ok(duplicated.findings.some(item=>item.code==='beat_id_conflict'&&/more than one clip/.test(item.message)));
  assert.equal(duplicated.blocksBake,false);
});

test('HM-PF-08 compose keeps the five-second demo and copies beat_id onto timeline atoms',async()=>{
  const show=demo();
  const stamped=HMComposeClient.applyBoardToShow(show,HMComposeClient.boardFromShow(show).board);
  const composed=await HMComposeClient.composeShow(stamped.show,composeOpts());
  assert.equal(composed.ok,true);
  assert.equal(composed.duration_s,5);
  assert.equal(composed.timeline.plates.length,8);
  assert.deepEqual(composed.timeline.atoms.map(atom=>atom.beat_id),stamped.show.atoms.map(atom=>atom.beat_id));
  assert.deepEqual(composed.timeline.atoms.map(atom=>atom.id),stamped.show.atoms.map(atom=>atom.id));

  const plain=await HMComposeClient.composeShow(demo(),composeOpts());
  assert.equal(plain.ok,true);
  assert.equal(plain.duration_s,5);
  assert.equal(plain.timeline.atoms[0].beat_id,undefined);
});

test('HM-PF-08 a copied clip gets a new beat id and a beat block does not rewrite it',()=>{
  const show=demo();
  const stamped=HMComposeClient.applyBoardToShow(show,HMComposeClient.boardFromShow(show).board);
  const source=stamped.show.atoms[0];
  const copied=HMComposeClient.assignCopiedBeatId(source,'clip-copy');
  assert.equal(copied.id,'clip-copy');
  assert.equal(copied.beat_id,'clip-copy');
  assert.deepEqual(copied.hero,source.hero);
  assert.equal(source.beat_id,'beat-01');
  const unbridged=HMComposeClient.assignCopiedBeatId(demo().atoms[0],'clip-copy');
  assert.equal(unbridged.id,'clip-copy');
  assert.equal(unbridged.beat_id,undefined);

  const pub=JSON.parse(fs.readFileSync('public/blocks/beat_blocks.json','utf8'));
  const kit=JSON.parse(fs.readFileSync('kit/blocks/beat_blocks.json','utf8'));
  assert.deepEqual(pub,kit);
  assert.ok(pub.apply.keeps.includes('beat_id'));
  assert.ok(pub.apply.keeps.includes('id'));
  const fist=pub.blocks.find(block=>block.id==='street_ecu_fist');
  const cams=read('presets/camera_presets.json').presets.map(preset=>preset.id);
  const next=HMComposeClient.applyBeatBlock(stamped.show,[0],fist,{
    cameraIds:cams,
    fxPresets:read('presets/fx_presets.json'),
  });
  assert.equal(next.atoms[0].id,'beat-01');
  assert.equal(next.atoms[0].beat_id,'beat-01');
  assert.equal(next.atoms[0].camera.preset,'ecu_fist_lens');
  assert.notEqual(fist.id,next.atoms[0].beat_id);
});

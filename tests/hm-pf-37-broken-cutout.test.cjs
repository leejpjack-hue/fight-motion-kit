const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
require('../public/ui/compose-client.js');
require('../public/ui/motion-renderer.js');

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const demo=()=>read('public/shows/daiyu-wang-five-seconds.json');
const compose=show=>HMComposeClient.composeShow(show,{
  cameraPresets:read('public/presets/camera_presets.json'),
  fxPresets:read('public/presets/fx_presets.json'),
  loadJson:async p=>read('public/'+p),
});

test('HM-PF-37: compose keeps a PNG or WebP cutout and rejects any other broken image',async()=>{
  const fx=read('public/presets/fx_presets.json');
  assert.equal(fx.hooks.some(h=>/fire|debris/i.test(h.id)),false);
  const plain=await compose(demo());
  assert.equal(plain.ok,true);
  assert.equal(plain.duration_s,5);
  assert.equal(Object.hasOwn(plain.timeline,'fg'),false);
  const samples=[
    ['props/rail-broken.png','props/rail-broken.png'],
    [' props/rail-broken.WEBP ','props/rail-broken.WEBP'],
    ['props/Rail.Png','props/Rail.Png'],
    ['props/rail-broken.jpg',''],
    ['props/rail-broken.gif',''],
    ['props/rail-broken.png?v=1','props/rail-broken.png?v=1'],
    ['',''],
    [null,''],
  ];
  for(const [input,expected] of samples){
    assert.equal(HMComposeClient.fgBrokenCutoutSrc(input),expected,JSON.stringify(input));
    assert.equal(fgBrokenCutoutSrc(input),expected,JSON.stringify(input));
  }
  const show=demo();
  show.fg={props:[
    {id:'rail',src:'props/rail.png',x:120,y:200,scale:1,z:1,t_start:0,t_end:5,effect:{type:'break',t:1.5}},
    {id:'cut-png',src:'props/rail.png',x:120,y:200,scale:1,z:2,t_start:0,t_end:5,effect:{type:'break',t:1.5,broken_src:' props/rail-broken.png '}},
    {id:'cut-webp',src:'props/rail.png',x:120,y:200,scale:1,z:3,t_start:0,t_end:5,effect:{type:'break',t:1.5,broken_src:'props/rail-broken.webp'}},
    {id:'speed',slot:'overlay',src:'art/speed-lines.webp',x:640,y:360,scale:1,z:30,t_start:1,t_end:2.25},
  ]};
  const out=await compose(show);
  assert.equal(out.ok,true,JSON.stringify(out.errors));
  assert.equal(out.duration_s,5);
  const [rail,png,webp,speed]=out.timeline.fg.props;
  assert.equal(rail.effect.broken_src,undefined);
  assert.equal(png.effect.broken_src,'props/rail-broken.png');
  assert.equal(webp.effect.broken_src,'props/rail-broken.webp');
  assert.equal(speed.slot,'overlay');
  assert.equal(speed.src,'art/speed-lines.webp');
  assert.equal(Object.hasOwn(speed,'effect'),false);
  for(const broken of ['props/chair-broken.jpg','props/chair-broken.gif','   ',{src:'props/x.png'}]){
    const bad=demo();
    bad.fg={props:[{id:'a',src:'props/a.png',effect:{type:'break',t:1,broken_src:broken}}]};
    const failed=await compose(bad);
    assert.equal(failed.ok,false,JSON.stringify(broken));
    assert.ok(failed.errors.some(e=>/PNG or WebP/.test(e)),JSON.stringify(failed.errors));
  }
  for(const fg of [
    {props:[{id:'a',src:'p.png',slot:'overlay',effect:{type:'break',t:1,broken_src:'art/speed-lines.png'}}]},
    {props:[{id:'a',src:'p.png',slot:'fire'}]},
  ]){
    const bad=demo();bad.fg=fg;
    assert.equal((await compose(bad)).ok,false,JSON.stringify(fg));
  }
});

test('HM-PF-37: at the break the player uses the cutout, and an unset cutout stays a crack',()=>{
  const intact={src:'props/rail.png',effect:{type:'break',t:1.5,broken_src:'props/rail-broken.png'}};
  const before=fgBreakState(intact,1.49);
  assert.equal(before.broken,false);
  assert.equal(before.procedural,false);
  assert.equal(before.src,'props/rail.png');
  const pngAt=fgBreakState(intact,1.5);
  assert.equal(pngAt.broken,true);
  assert.equal(pngAt.procedural,false);
  assert.equal(pngAt.src,'props/rail-broken.png');
  const webpAt=fgBreakState({src:'props/rail.png',effect:{type:'break',t:1.5,broken_src:'props/rail-broken.webp'}},1.5);
  assert.equal(webpAt.procedural,false);
  assert.equal(webpAt.src,'props/rail-broken.webp');
  const crack=fgBreakState({src:'props/rail.png',effect:{type:'break',t:1.5}},1.5);
  assert.equal(crack.broken,true);
  assert.equal(crack.procedural,true);
  assert.equal(crack.src,'props/rail.png');
  const jpeg=fgBreakState({src:'props/rail.png',effect:{type:'break',t:1.5,broken_src:'props/rail-broken.jpg'}},1.8);
  assert.equal(jpeg.procedural,true);
  assert.equal(jpeg.src,'props/rail.png');
  const speed=fgBreakState({slot:'overlay',src:'art/speed-lines.webp',effect:{type:'break',t:0,broken_src:'art/speed-lines.webp'}},2);
  assert.equal(speed.broken,false);
  assert.equal(speed.procedural,false);
  assert.equal(speed.src,'art/speed-lines.webp');
});

test('HM-PF-37: show schema records the broken cutout and the overlay slot',()=>{
  const schema=read('kit/schema/show.schema.json');
  assert.equal(schema.properties.fg.additionalProperties,false);
  const prop=schema.$defs.fgProp;
  assert.deepEqual(prop.properties.slot.enum,['prop','overlay']);
  assert.equal(prop.properties.effect.$ref,'#/$defs/fgBreak');
  const br=schema.$defs.fgBreak;
  assert.equal(br.properties.type.const,'break');
  assert.match(br.properties.broken_src.pattern,/png/);
  assert.match(br.properties.broken_src.pattern,/webp/);
  assert.match(br.properties.broken_src.description,/crack/);
});

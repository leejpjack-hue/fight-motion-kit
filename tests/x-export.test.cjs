const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const X=require('../public/ui/x-export.js');

test('HM-EXPORT-X-PRESET: 720p30 and 1080p30 presets carry a ~30s WebM bitrate hint',()=>{
  assert.deepEqual(X.presets.map(p=>p.id),['720p30','1080p30']);
  const p720=X.presetById('720p30');
  const p1080=X.presetById('1080p30');
  assert.deepEqual([p720.width,p720.height,p720.fps,p720.videoBitsPerSecond],[1280,720,30,5000000]);
  assert.deepEqual([p1080.width,p1080.height,p1080.fps,p1080.videoBitsPerSecond],[1920,1080,30,8000000]);
  assert.equal(X.webmMegabytes(5000000,30),18.8);
  assert.equal(X.webmMegabytes(8000000,30),30);
  assert.equal(X.bitrateHint(p720),'720p30 · 1280×720 · 30 fps · 5.0 Mbps · ≈ 18.8 MB for a 30s WebM');
  assert.equal(X.bitrateHint(p1080),'1080p30 · 1920×1080 · 30 fps · 8.0 Mbps · ≈ 30.0 MB for a 30s WebM');
  assert.equal(X.HONESTY,'Real-time Record still needs this tab visible. Deterministic ffmpeg stays on the local skill.');
});

test('HM-EXPORT-X-PRESET: frame plan is i/fps and refuses a non-integer frame count',()=>{
  const frames=X.framePlan(5,30);
  assert.equal(frames.length,150);
  assert.equal(frames[0].file,'frames/000000.png');
  assert.equal(frames[0].t,0);
  assert.equal(frames[149].file,'frames/000149.png');
  assert.equal(frames[149].t,149/30);
  assert.equal(X.framePlan(0.1,30).length,3);
  assert.throws(()=>X.framePlan(5.125,30),/whole number of frames/);
  assert.throws(()=>X.framePlan(0,30),/Add a clip/);
  assert.throws(()=>X.framePlan(1,0),/fps must be 1/);
});

test('HM-EXPORT-X-PRESET: timing JSON points ffmpeg at the local skill and the zip round-trips',()=>{
  const preset=X.presetById('1080p30');
  const frames=X.framePlan(0.1,30);
  const doc=X.timingDocument({showId:'x-export-probe',preset,durationS:0.1,frames});
  assert.equal(doc.kind,'html-motion-frame-sequence');
  assert.equal(doc.encode,'local-skill');
  assert.equal(doc.ffmpeg.where,'local-skill');
  assert.equal(doc.honesty,X.HONESTY);
  assert.equal(doc.frame_count,3);
  assert.equal(doc.video_bits_per_second,8000000);
  assert.deepEqual(doc.ffmpeg.argv,['ffmpeg','-y','-framerate','30','-start_number','0','-i','frames/%06d.png','-an','-c:v','libvpx','-b:v','8000k','-t','0.100','x-export-probe.webm']);
  const blob=JSON.stringify(doc);
  assert.equal(/https?:\/\/|\/api\/|workers/i.test(blob),false);
  const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13]);
  const zip=X.zipStore([{name:'timing.json',data:new TextEncoder().encode(JSON.stringify(doc))},...frames.map(f=>({name:f.file,data:png}))]);
  assert.throws(()=>X.zipStore([...frames.map(f=>({name:f.file,data:png})),{name:'../timing.json',data:png}]),/Bad zip path/);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hmx-'));
  const file=path.join(dir,'frames.zip');
  fs.writeFileSync(file,zip);
  const out=execFileSync('python3',['-c',`
import json,sys,zipfile
z=zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None
names=z.namelist()
assert names==['timing.json','frames/000000.png','frames/000001.png','frames/000002.png']
doc=json.loads(z.read('timing.json'))
assert doc['preset_id']=='1080p30' and doc['width']==1920 and doc['height']==1080
assert doc['ffmpeg']['where']=='local-skill' and 'libvpx' in doc['ffmpeg']['argv']
assert 'visible' in doc['honesty'] and 'local skill' in doc['honesty']
assert z.read('frames/000001.png')[:4]==bytes([137,80,78,71])
print('ok')
`,file],{encoding:'utf8'});
  assert.match(out,/ok/);
});

test('HM-EXPORT-X-PRESET: export scripts do not add a Workers compose backend',()=>{
  const src=['public/ui/x-export.js','public/ui/exports.js','public/ui/index.html'].map(p=>fs.readFileSync(p,'utf8')).join('\n');
  assert.equal(/\/api\/compose|api\.teqcon|wrangler deploy|:8770/.test(src),false);
  assert.match(src,/720p30/);
  assert.match(src,/1080p30/);
  assert.match(src,/Frame sequence \+ timing JSON/);
  assert.match(src,/Real-time Record still needs this tab visible/);
  assert.match(src,/Deterministic ffmpeg stays on the local skill/);
});

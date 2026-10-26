/* Run against `npm run dev`. TEST_BASE_URL and BROWSER_CHANNEL are optional. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8765';
const out=path.resolve(process.env.TEST_OUTPUT||'work/qa');fs.mkdirSync(out,{recursive:true});
const syslib=path.resolve('work/sysroot/usr/lib/x86_64-linux-gnu');
if(fs.existsSync(syslib))process.env.LD_LIBRARY_PATH=syslib+(process.env.LD_LIBRARY_PATH?':'+process.env.LD_LIBRARY_PATH:'');
const fconf=path.resolve('work/sysroot/fonts.conf');
if(fs.existsSync(fconf))process.env.FONTCONFIG_FILE=fconf;
const MIMES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};
async function ensureServer(urlStr){
  const u=new URL(urlStr);
  const ok=await new Promise(r=>{const req=http.get(urlStr+'/ui/',res=>{res.resume();r(res.statusCode===200);});req.on('error',()=>r(false));req.setTimeout(600,()=>{req.destroy();r(false);});});
  if(ok)return null;
  const root=path.resolve('public');
  const srv=http.createServer((req,res)=>{
    const clean=decodeURIComponent(new URL(req.url,urlStr).pathname).replace(/^\/+/,'');
    let fp=path.resolve(root,clean);
    if(!fp.startsWith(root)){res.writeHead(403).end();return;}
    if(fs.existsSync(fp)&&fs.statSync(fp).isDirectory())fp=path.join(fp,'index.html');
    if(!fs.existsSync(fp)||!fs.statSync(fp).isFile()){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':MIMES[path.extname(fp)]||'application/octet-stream'});
    fs.createReadStream(fp).pipe(res);
  });
  await new Promise((resolve,reject)=>{srv.once('error',reject);srv.listen(+u.port||8765,u.hostname||'127.0.0.1',resolve);});
  srv.unref();
  return srv;
}
(async()=>{
  const srv=await ensureServer(base);
  const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||undefined,env:process.env,args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const p=await context.newPage(), errors=[], failed=[], checks=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)failed.push(r.status()+' '+r.url());});
  const state=()=>p.evaluate(()=>({duration:HMStudio.duration,project:HMStudio.project,composed:HMStudio.composed,time:HMStudio.time,playing:HMStudio.playing,onion:HMStudio.onion,copiedCam:HMStudio.copiedCam}));
  const settle=async()=>{await p.waitForFunction(()=>!HMStudio.loading);return p.evaluate(()=>HMStudio.compile());};
  const check=label=>{checks.push(label);console.log('PASS '+label);};
  const click=async id=>{await p.click('#'+id);await settle();};
  const change=async(id,value)=>{await p.fill('#'+id,String(value));await p.locator('#'+id).dispatchEvent('change');await settle();};
  async function downloadFrom(id,name){const event=p.waitForEvent('download');await p.click('#'+id);const d=await event;assert.equal(await d.failure(),null);const target=path.join(out,name||d.suggestedFilename());await d.saveAs(target);return target;}
  try{
    await p.goto(base+'/ui/');await p.evaluate(()=>window.ready);
    assert.equal((await state()).duration,5);assert.equal(await p.locator('.timeline-clip').count(),8);
    assert.equal(await p.locator('img[src]').evaluateAll(ims=>ims.every(im=>im.complete&&im.naturalWidth>0)),true);
    await p.screenshot({path:path.join(out,'desktop.png'),fullPage:true});check('default eight-plate, five-second project and all thumbnails load');
    const navigationCount=[];p.on('framenavigated',f=>navigationCount.push(f.url()));
    await p.click('#play');await p.waitForTimeout(250);await p.click('#play');const stopped=(await state()).time;await p.waitForTimeout(180);assert.equal((await state()).time,stopped);assert.ok(stopped>0);assert.equal(navigationCount.length,0);check('play/pause resumes in place without reloading');
    await p.fill('#scrub','3');await p.locator('#scrub').dispatchEvent('input');assert.equal((await state()).time,3);
    await p.click('#restart');assert.equal((await state()).time,0);await p.click('#next');assert.equal((await state()).time,.5);
    assert.equal(await p.locator('#onionPrev').isVisible(),true);assert.equal(await p.locator('#onionNext').isVisible(),true);check('onion plate ghost shows prev/next plate at ~25% opacity while paused/scrubbing');
    await p.click('#previous');assert.equal((await state()).time,0);await p.click('#loop');assert.equal(await p.locator('#loop').getAttribute('aria-pressed'),'true');await p.click('#loop');check('scrub, restart, previous/next and loop toggle');
    await p.click('#fullscreen');await p.waitForFunction(()=>!!document.fullscreenElement);await p.evaluate(()=>document.exitFullscreen());await p.locator('#stage').click();await p.keyboard.press('Space');await p.waitForFunction(()=>HMStudio.time>0.05);await p.keyboard.press('Space');assert.equal((await state()).playing,false);await p.click('#restart');await click('longer');assert.equal((await state()).duration,5.1);await click('shorter');assert.equal((await state()).duration,5);check('fullscreen, keyboard playback and duration stepper');
    await change('duration',.625);assert.equal((await state()).duration,5.125);await click('undo');assert.equal((await state()).duration,5);await click('redo');assert.equal((await state()).duration,5.125);await click('undo');check('fractional clip timing and undo/redo');
    // HM-CAM-10 checks:
    // 1 & 2: Roll nudge (r) + Cam intensity 0-200%
    await p.selectOption('#camera','slow_push');await change('panX',10);await change('roll',-7);await p.fill('#zoom','0.1');await p.locator('#zoom').dispatchEvent('change');await p.fill('#camIntensity','1.5');await p.locator('#camIntensity').dispatchEvent('change');await settle();
    let a=(await state()).project.show.atoms[0];assert.equal(a.camera.preset,'slow_push');assert.equal(a.camera.nudge.x,10);assert.equal(a.camera.nudge.r,-7);assert.equal(a.camera.nudge.s,.1);assert.equal(a.camera.intensity,1.5);
    // 4: Dual-segment cam strip
    await p.check('#dualCamToggle');await settle();await p.selectOption('#segAPreset','low_rise');await p.selectOption('#segBPreset','eye_push');await p.fill('#segSplit','0.4');await p.locator('#segSplit').dispatchEvent('change');await settle();
    a=(await state()).project.show.atoms[0];assert.equal(a.camera.segments.length,2);assert.equal(a.camera.segments[0].preset,'low_rise');assert.equal(a.camera.segments[1].preset,'eye_push');assert.equal(+(a.camera.segments[0].dur_s+a.camera.segments[1].dur_s).toFixed(4),a.duration_s);
    // 5: Cam copy / paste (+ paste to all) + undo
    await click('copyCam');await p.click('.timeline-clip[data-index="1"]');await click('pasteCam');
    let a1=(await state()).project.show.atoms[1];assert.equal(a1.camera.nudge.r,-7);assert.equal(a1.camera.intensity,1.5);assert.equal(a1.camera.segments.length,2);
    await click('pasteCamAll');assert.equal((await state()).project.show.atoms.every(x=>x.camera.nudge?.r===-7&&x.camera.intensity===1.5),true);
    await click('undo');await click('undo');await p.click('.timeline-clip[data-index="0"]');
    await click('resetCamera');assert.deepEqual((await state()).project.show.atoms[0].camera,{preset:'static_hold'});check('roll nudge, cam intensity, dual-segment strip, copy/paste/paste-all and reset');
    // 3: Fight-cam 8-pack + Undo
    await click('fightCamPack');assert.equal((await state()).project.show.atoms[0].camera.preset,'low_rise');assert.equal((await state()).project.show.atoms[7].camera.preset,'pull_aftermath');
    await click('undo');assert.equal((await state()).project.show.atoms[0].camera.preset,'static_hold');check('Fight-cam 8-pack one-click and Undo restores');
    // 6, 7, 9: Impact punch macro, FX chip expand, Beat ticks
    await click('impactPunch');a=(await state()).project.show.atoms[0];assert.equal(a.camera.preset,'slow_push');assert.equal(a.fx_hooks.length,2);assert.equal(await p.locator('.timeline-clip[data-index="0"] .beat-tick').count(),2);
    await p.click('[data-effect="none"]');await settle();a=(await state()).project.show.atoms[0];assert.equal(a.camera.preset,'static_hold');assert.equal(a.fx_hooks.length,0);
    for(const fxType of ['hit_pink','flash_orange','speed_lines','smear_trail','hit_orange']){await p.click(`[data-effect="${fxType}"]`);await settle();assert.equal((await state()).project.show.atoms[0].fx_hooks[0].type,fxType);}
    assert.ok(await p.locator('.beat-tick').count()>=4);
    await change('caption','CLASH');assert.equal((await state()).composed.timeline.overlays[0].text,'CLASH');assert.equal((await state()).composed.timeline.fx.hits.length,1);check('Impact punch macro, Clean, expanded FX chips, beat ticks and caption');
    // 10: Fit-to 3/5/8/10s chips + edge ripple trim ±0.1s
    await click('trimPlus');assert.equal((await state()).duration,5.1);await click('trimMinus');assert.equal((await state()).duration,5);
    for(const [id,target] of [['fitThree',3],['fitEight',8],['fitTen',10],['fitFive',5]]){await click(id);assert.equal((await state()).duration,target);}check('Fit-to 3/5/8/10s chips and edge ripple trim ±0.1s');
    // Portable round-trip of nudge.r, intensity, segments, extra fx
    await change('roll',12);await p.fill('#camIntensity','1.25');await p.locator('#camIntensity').dispatchEvent('change');await p.check('#dualCamToggle');await p.click('[data-effect="hit_pink"]');await settle();
    const hmPortablePath=await downloadFrom('saveProject','hm-cam-10.motion.json');const hmPortable=JSON.parse(fs.readFileSync(hmPortablePath));
    assert.equal(hmPortable.show.atoms[0].camera.nudge.r,12);assert.equal(hmPortable.show.atoms[0].camera.intensity,1.25);assert.equal(hmPortable.show.atoms[0].camera.segments.length,2);assert.equal(hmPortable.show.atoms[0].fx_hooks[0].type,'hit_pink');
    await p.click('#loadDemo');await p.waitForFunction(()=>HMStudio.project.show.show_id==='daiyu-wang-five-seconds');await settle();
    await p.setInputFiles('#projectInput',hmPortablePath);await p.waitForFunction(()=>HMStudio.project.show.atoms[0].camera?.nudge?.r===12);await settle();
    a=(await state()).project.show.atoms[0];assert.equal(a.camera.nudge.r,12);assert.equal(a.camera.intensity,1.25);assert.equal(a.camera.segments.length,2);assert.equal(a.fx_hooks[0].type,'hit_pink');check('portable .motion.json round-trips nudge.r, intensity, segments and extra fx');
    await p.click('#loadDemo');await p.waitForFunction(()=>HMStudio.project.show.show_id==='daiyu-wang-five-seconds');await settle();
    await click('duplicate');assert.equal(await p.locator('.timeline-clip').count(),9);await click('delete');assert.equal(await p.locator('.timeline-clip').count(),8);
    const first=(await state()).project.show.atoms[0].id;await p.dragAndDrop('.timeline-clip[data-index="0"]','.timeline-clip[data-index="1"]');await settle();assert.equal((await state()).project.show.atoms[1].id,first);check('duplicate, delete and drag reorder');
    await click('replaceImage');await p.getByRole('button',{name:'Use P08 in selected clip',exact:true}).click();await settle();assert.equal((await state()).project.show.atoms[1].hero.plates[0],'P08');
    await p.getByRole('button',{name:'Add P01 to timeline',exact:true}).click();await settle();assert.equal(await p.locator('.timeline-clip').count(),9);await p.fill('#mediaSearch','P08');assert.equal(await p.locator('.media-card').count(),1);await p.fill('#mediaSearch','');await click('fitFive');assert.equal((await state()).duration,5);check('replace plate, add clip, library search and fit-to-five');
    await p.click('#loadDemo');await p.waitForFunction(()=>HMStudio.project.show.show_id==='daiyu-wang-five-seconds');await settle();
    await p.click('#helpOpen');assert.equal(await p.locator('#helpDialog').evaluate(d=>d.open),true);await p.getByRole('button',{name:'Close shortcuts'}).click();check('keyboard shortcut dialog');
    const portablePath=await downloadFrom('saveProject','portable.motion.json');const portable=JSON.parse(fs.readFileSync(portablePath));assert.ok(Object.values(portable.assets).every(x=>x.startsWith('data:image/')));assert.equal(portable.media.length,8);
    await change('projectTitle','Changed title');await p.setInputFiles('#projectInput',portablePath);await p.waitForFunction(()=>HMStudio.project.show.title.includes('First exchange'));await settle();assert.equal((await state()).duration,5);check('portable project download and reopen with embedded images');
    await p.click('#exportOpen');
    assert.deepEqual(await p.locator('#exportPreset option').allTextContents(),['720p30','1080p30']);
    assert.equal(await p.locator('#exportPreset').inputValue(),'720p30');
    assert.equal(await p.locator('#exportBitrateHint').textContent(),'720p30 · 1280×720 · 30 fps · 5.0 Mbps · ≈ 18.8 MB for a 30s WebM');
    assert.equal(await p.locator('#exportHonesty').textContent(),'Real-time Record still needs this tab visible. Deterministic ffmpeg stays on the local skill.');
    assert.match(await p.locator('#videoHint').textContent(),/720p30 · 1280×720 · 30 fps · 5\.0 Mbps/);
    assert.match(await p.locator('#videoHint').textContent(),/keep this tab visible/);
    assert.match(await p.locator('#frameSeqHint').textContent(),/Optional zip/);
    assert.match(await p.locator('#exportFrames').innerText(),/Frame sequence \+ timing JSON/);
    await p.selectOption('#exportPreset','1080p30');
    assert.equal(await p.locator('#exportBitrateHint').textContent(),'1080p30 · 1920×1080 · 30 fps · 8.0 Mbps · ≈ 30.0 MB for a 30s WebM');
    assert.match(await p.locator('#videoHint').textContent(),/1080p30 · 1920×1080/);
    fs.mkdirSync('/opt/cursor/artifacts',{recursive:true});
    await p.locator('#exportDialog').screenshot({path:'/opt/cursor/artifacts/hm-export-x-preset-dialog.png'});
    await p.selectOption('#exportPreset','720p30');
    const htmlPath=await downloadFrom('exportHtml','daiyu-wang-five-seconds.html');const framePath=await downloadFrom('exportFrame','frame.png');assert.ok(fs.statSync(framePath).size>10000);
    const offline=await browser.newPage();const external=[];await offline.route('http://**',r=>{external.push(r.request().url());r.abort();});await offline.route('https://**',r=>{external.push(r.request().url());r.abort();});await offline.goto('file://'+htmlPath);await offline.evaluate(()=>window.ready);await offline.evaluate(()=>renderAt(4.5));assert.match(await offline.locator('#time').textContent(),/4.50 \/ 5.00/);assert.deepEqual(external,[]);await offline.close();check('self-contained HTML plays offline and PNG export works');
    const video=await downloadFrom('exportVideo','daiyu-wang-five-seconds.webm');assert.ok(fs.statSync(video).size>10000);await p.getByRole('button',{name:'Close export',exact:true}).click();check('five-second video recording downloads a nonempty video');
    await change('duration',.625);assert.equal((await state()).duration,5.125);
    await p.click('#exportOpen');await p.click('#exportFrames');
    await p.waitForFunction(()=>/whole number of frames/.test(document.getElementById('exportStatus').textContent));
    await p.getByRole('button',{name:'Close export',exact:true}).click();await click('undo');assert.equal((await state()).duration,5);check('frame sequence refuses a timeline that is not a whole number of frames');
    await p.evaluate(async()=>{
      const make=draw=>{const c=document.createElement('canvas');c.width=64;c.height=64;draw(c.getContext('2d'));return c.toDataURL('image/png');};
      const plate=make(g=>{g.fillStyle='#1eb446';g.fillRect(0,0,64,64);});
      const current=HMStudio.project,key='embedded/x-export-probe/layout.json';
      const atoms=[{id:'x-export-clip',label:'X export',kind:'duo',duration_s:0.1,plates_needed:1,pose_mode:'hero',hero:{layout_source:key,plates:['P01']},camera:{preset:'static_hold',params:{s:{type:'const',v:1},x:{type:'const',v:0},y:{type:'const',v:0}}},fx_hooks:[]}];
      await HMStudio.load({version:1,show:{...current.show,show_id:'x-export-probe',title:'X export probe',atoms,bg:{},overlays:[]},layouts:{[key]:{P01:{full:plate}}},media:[{id:'x-marker',name:'Marker',src:plate,layoutSource:key,plateId:'P01'}],assets:{}});
    });
    await settle();assert.equal((await state()).duration,0.1);
    await p.evaluate(()=>{
      const orig=HTMLCanvasElement.prototype.captureStream;
      HTMLCanvasElement.prototype.captureStream=function(fps){window.__hmCapture={width:this.width,height:this.height,fps};return orig.call(this,fps);};
      const Orig=window.MediaRecorder;
      function Wrapped(stream,opts){window.__hmRec={mimeType:opts.mimeType,videoBitsPerSecond:opts.videoBitsPerSecond};return new Orig(stream,opts);}
      Wrapped.isTypeSupported=Orig.isTypeSupported.bind(Orig);
      window.MediaRecorder=Wrapped;
    });
    await p.click('#exportOpen');await p.selectOption('#exportPreset','1080p30');
    const beforeFailed=failed.length;
    const zipPath=await downloadFrom('exportFrames','x-export-probe-1080p30-frames.zip');
    const zipListing=require('node:child_process').execFileSync('python3',['-c',`
import json,sys,zipfile
z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None
doc=json.loads(z.read('timing.json'))
assert doc['preset_id']=='1080p30' and doc['width']==1920 and doc['height']==1080 and doc['fps']==30
assert doc['frame_count']==3 and doc['video_bits_per_second']==8000000
assert doc['encode']=='local-skill' and doc['ffmpeg']['where']=='local-skill'
assert 'visible' in doc['honesty'] and 'local skill' in doc['honesty']
assert doc['frames'][0]['t']==0 and doc['frames'][2]['file']=='frames/000002.png'
png=z.read('frames/000000.png')
open(sys.argv[2],'wb').write(png)
print(doc['show_id'])
`,zipPath,path.join(out,'x-export-frame.png')],{encoding:'utf8'});
    assert.match(zipListing,/x-export-probe/);
    const png=fs.readFileSync(path.join(out,'x-export-frame.png'));
    assert.equal(png.readUInt32BE(16),1920);assert.equal(png.readUInt32BE(20),1080);
    const shortVideo=await downloadFrom('exportVideo','x-export-probe.webm');assert.ok(fs.statSync(shortVideo).size>50);
    const rec=await p.evaluate(()=>({capture:window.__hmCapture,rec:window.__hmRec}));
    assert.deepEqual(rec.capture,{width:1920,height:1080,fps:30});
    assert.equal(rec.rec.videoBitsPerSecond,8000000);
    assert.equal(failed.slice(beforeFailed).some(x=>/\/api\/compose/.test(x)),false);
    await p.getByRole('button',{name:'Close export',exact:true}).click();check('1080p30 frame sequence zip and record use the preset without a compose API');
    await p.click('#loadDemo');await p.waitForFunction(()=>HMStudio.project.show.show_id==='daiyu-wang-five-seconds');await settle();await click('newProject');assert.equal((await state()).duration,0);assert.equal(await p.locator('#emptyStage').isVisible(),true);
    await p.setInputFiles('#imageInput',path.resolve('public/assets/daiyu-wang-eight/P01.png'));await p.waitForFunction(()=>HMStudio.project.media.length===9);await settle();assert.equal((await state()).duration,.5);
    await p.reload();await p.evaluate(()=>window.ready);assert.equal((await state()).duration,.5);assert.ok((await state()).project.show.atoms[0].hero.layout_source.startsWith('embedded/'));assert.equal((await state()).composed.timeline.plates.length,1);check('blank project, image import, and image/draft persistence across reload');
    await p.setInputFiles('#projectInput',{name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"bad":true}')});await p.waitForFunction(()=>document.getElementById('status').textContent.includes('Choose an HTML Motion project'));assert.equal((await state()).duration,.5);check('invalid project JSON reports an error without losing the current edit');
    await p.click('#loadExtended');await p.waitForFunction(()=>HMStudio.project.show.show_id==='daiyu-wang-ten-seconds');await settle();
    assert.equal((await state()).duration,10);assert.equal(await p.locator('.timeline-clip').count(),16);await p.click('.timeline-clip[data-index="8"]');await settle();
    if((await state()).onion)await p.click('#onionToggle');
    const solid=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=40;const g=c.getContext('2d');g.fillStyle='#c52bb5';g.fillRect(0,0,80,40);return c.toDataURL('image/png').split(',')[1];});
    await p.selectOption('#backgroundScope','project');
    const choose=p.waitForEvent('filechooser');await p.click('#changeBackground');await (await choose).setFiles({name:'new-background.png',mimeType:'image/png',buffer:Buffer.from(solid,'base64')});
    await p.waitForFunction(()=>HMStudio.project.show.bg.base.startsWith('backgrounds/'));await settle();
    const selectedBackground=(await state()).project.show.bg.base;
    const pixel=()=>p.evaluate(()=>Array.from(document.getElementById('stage').getContext('2d').getImageData(40,40,1,1).data));
    assert.deepEqual(await pixel(),[197,43,181,255]);assert.equal((await state()).project.show.bg.key_white,undefined);
    await click('undo');assert.match((await state()).project.show.bg.base,/rooftop-dusk/);await click('redo');assert.equal((await state()).project.show.bg.base,selectedBackground);
    const backgroundProjectPath=await downloadFrom('saveProject','background.motion.json');
    const backgroundProject=JSON.parse(fs.readFileSync(backgroundProjectPath));assert.match(backgroundProject.assets[selectedBackground],/^data:image\/png;base64,/);
    await p.reload();await p.evaluate(()=>window.ready);assert.equal((await state()).project.show.bg.base,selectedBackground);
    await p.setInputFiles('#projectInput',backgroundProjectPath);await p.waitForFunction(()=>document.getElementById('exportStatus').textContent==='Project opened.');await settle();
    if((await state()).onion)await p.click('#onionToggle');
    await p.evaluate(()=>HMStudio.renderAt(5.1));assert.deepEqual(await pixel(),[197,43,181,255]);
    await p.click('#onionToggle');await p.click('#exportOpen');const backgroundHtml=await downloadFrom('exportHtml','background.html');const cleanFrame=await downloadFrom('exportFrame','background-frame.png');await p.getByRole('button',{name:'Close export',exact:true}).click();
    const framePixel=await p.evaluate(async src=>{const im=new Image();im.src=src;await im.decode();const c=document.createElement('canvas');c.width=1280;c.height=720;const g=c.getContext('2d');g.drawImage(im,0,0);return Array.from(g.getImageData(40,40,1,1).data);},'data:image/png;base64,'+fs.readFileSync(cleanFrame).toString('base64'));assert.deepEqual(framePixel,[197,43,181,255]);await p.click('#onionToggle');
    const backgroundOffline=await browser.newPage();await backgroundOffline.route('http://**',r=>r.abort());await backgroundOffline.route('https://**',r=>r.abort());await backgroundOffline.goto('file://'+backgroundHtml);await backgroundOffline.evaluate(()=>window.ready);await backgroundOffline.evaluate(()=>renderAt(5.1));
    assert.deepEqual(await backgroundOffline.evaluate(()=>Array.from(document.getElementById('stage').getContext('2d').getImageData(40,40,1,1).data)),[197,43,181,255]);await backgroundOffline.close();
    await p.selectOption('#backgroundScope','project');await click('removeBackground');assert.equal((await state()).project.show.bg.base,undefined);await click('undo');assert.equal((await state()).project.show.bg.base,selectedBackground);check('10-second continuation, background chooser, undo/redo, draft persistence, portable reopen and offline rendering');
    await p.click('#loadDemo');await p.waitForFunction(()=>HMStudio.project.show.show_id==='daiyu-wang-five-seconds');await settle();
    const originalCorner=await pixel();
    await p.selectOption('#backgroundScope','project');
    await p.setInputFiles('#backgroundInput',{name:'white-plate-background.png',mimeType:'image/png',buffer:Buffer.from(solid,'base64')});await p.waitForFunction(()=>HMStudio.project.show.bg.key_white===true);await settle();
    assert.deepEqual(await pixel(),[197,43,181,255]);await p.uncheck('#backgroundKeyWhite');await settle();assert.deepEqual(await pixel(),originalCorner);await click('undo');assert.equal((await state()).project.show.bg.key_white,true);
    const beforeInvalid=(await state()).project.show.bg.base;await p.setInputFiles('#backgroundInput',{name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('invalid')});await p.waitForFunction(()=>document.getElementById('status').textContent.includes('PNG, JPG or WebP'));assert.equal((await state()).project.show.bg.base,beforeInvalid);check('white plate backdrop removal is optional, undoable, and invalid uploads preserve the edit');
    await p.evaluate(async()=>{const previous=HMStudio.project;let release;const pending=HMStudio.openProject(new Promise(resolve=>release=resolve));document.getElementById('newProject').click();release(previous);await pending;});await settle();assert.equal((await state()).duration,0);assert.equal(await p.locator('#emptyStage').isVisible(),true);check('a slow previous project request cannot replace a newer Blank project choice');
    // A transparent foreground marker makes independent background movement measurable.
    const fixture=await p.evaluate(async()=>{
      const make=draw=>{const c=document.createElement('canvas');c.width=1280;c.height=720;draw(c.getContext('2d'));return c.toDataURL('image/png');};
      const foreground=make(g=>{g.fillStyle='#1eb446';g.fillRect(580,300,120,120);});
      const base=make(g=>{g.fillStyle='#1d86b8';g.fillRect(0,0,1280,720);});
      const gradient=make(g=>{const v=g.createLinearGradient(0,0,1280,0);v.addColorStop(0,'#ff0000');v.addColorStop(1,'#0000ff');g.fillStyle=v;g.fillRect(0,0,1280,720);});
      const current=HMStudio.project,key='embedded/background-test/layout.json';
      const atoms=[0,1].map(i=>({id:'background-'+i,label:'Background test '+(i+1),kind:'duo',duration_s:1,plates_needed:1,pose_mode:'hero',hero:{layout_source:key,plates:['P01']},camera:{preset:'static_hold',params:{s:{type:'const',v:1},x:{type:'const',v:0},y:{type:'const',v:0}}},fx_hooks:[]}));
      await HMStudio.load({version:1,show:{...current.show,show_id:'background-feature-test',title:'Background feature test',atoms,bg:{base},overlays:[]},layouts:{[key]:{P01:{full:foreground}}},media:[{id:'marker',name:'Marker',src:foreground,layoutSource:key,plateId:'P01'}],assets:{}});
      return {gradient,base};
    });
    if((await state()).onion)await p.click('#onionToggle');await p.selectOption('#backgroundScope','clip');
    await p.setInputFiles('#backgroundInput',{name:'clip-gradient.png',mimeType:'image/png',buffer:Buffer.from(fixture.gradient.split(',')[1],'base64')});
    await p.waitForFunction(()=>HMStudio.project.show.atoms[0].background?.src);await settle();
    const ownBackground=(await state()).project.show.atoms[0].background.src;
    assert.equal((await state()).project.show.bg.base,fixture.base);assert.equal((await state()).project.show.atoms[1].background,undefined);
    await p.click('.timeline-clip[data-index="1"]');await settle();assert.deepEqual(await pixel(),[29,134,184,255]);
    await p.click('.timeline-clip[data-index="0"]');await click('duplicate');assert.equal((await state()).project.show.atoms[1].background.src,ownBackground);await click('delete');await p.click('.timeline-clip[data-index="0"]');
    await click('removeBackground');assert.equal((await state()).project.show.atoms[0].background.src,null);assert.deepEqual(await pixel(),[255,255,255,255]);await click('undo');
    await click('inheritBackground');assert.equal((await state()).project.show.atoms[0].background,undefined);assert.deepEqual(await pixel(),[29,134,184,255]);await click('undo');
    check('clip backgrounds stay separate, inherit or hide explicitly, and survive duplicate/delete and undo');
    const cameraBefore=(await state()).project.show.atoms[0].camera;
    await p.locator('#backgroundMotionDetails > summary').click();
    await p.selectOption('#backgroundMotion','pan_left');await settle();
    const sample=async t=>p.evaluate(t=>{HMStudio.renderAt(t);const g=document.getElementById('stage').getContext('2d');return {background:Array.from(g.getImageData(80,40,1,1).data),foreground:Array.from(g.getImageData(640,340,1,1).data)};},t);
    const motionStart=await sample(.05),motionEnd=await sample(.95);assert.notDeepEqual(motionStart.background,motionEnd.background);assert.deepEqual(motionStart.foreground,[30,180,70,255]);assert.deepEqual(motionEnd.foreground,motionStart.foreground);
    assert.deepEqual((await state()).project.show.atoms[0].camera,cameraBefore);assert.equal((await state()).project.show.atoms[1].background,undefined);
    await p.selectOption('#backgroundMotion','static');await settle();assert.deepEqual((await sample(.05)).background,(await sample(.95)).background);await click('undo');assert.equal((await state()).project.show.atoms[0].background.motion.preset,'pan_left');
    check('background-only pan changes scenery pixels while the foreground stays fixed; still mode and undo work');
    const clipProjectPath=await downloadFrom('saveProject','clip-background.motion.json');const clipProject=JSON.parse(fs.readFileSync(clipProjectPath));assert.match(clipProject.assets[ownBackground],/^data:image\/png;/);assert.equal(clipProject.show.atoms[0].background.motion.preset,'pan_left');
    await p.reload();await p.evaluate(()=>window.ready);assert.equal((await state()).project.show.atoms[0].background.src,ownBackground);
    await p.setInputFiles('#projectInput',clipProjectPath);await p.waitForFunction(()=>document.getElementById('exportStatus').textContent==='Project opened.');await settle();if((await state()).onion)await p.click('#onionToggle');
    assert.deepEqual(await sample(.95),motionEnd);
    await p.click('#exportOpen');const clipHtml=await downloadFrom('exportHtml','clip-background.html');const clipVideo=await downloadFrom('exportVideo','clip-background.webm');assert.ok(fs.statSync(clipVideo).size>1000);await p.getByRole('button',{name:'Close export',exact:true}).click();
    const clipOffline=await browser.newPage();const network=[];await clipOffline.route(/^https?:/,r=>{network.push(r.request().url());return r.abort();});await clipOffline.goto('file://'+clipHtml);await clipOffline.evaluate(()=>window.ready);await clipOffline.evaluate(()=>renderAt(.95));
    assert.deepEqual(await clipOffline.evaluate(()=>Array.from(document.getElementById('stage').getContext('2d').getImageData(80,40,1,1).data)),motionEnd.background);assert.deepEqual(network,[]);await clipOffline.close();
    check('per-clip images and independent motion survive drafts, portable reopen, offline HTML and video export');
    // HM-BG-CROP: the background crop region is editable (drag-rect, handles, fields), persists and drives the preview.
    await p.evaluate(async()=>{
      const make=draw=>{const c=document.createElement('canvas');c.width=1280;c.height=720;draw(c.getContext('2d'));return c.toDataURL('image/png');};
      const foreground=make(g=>{g.fillStyle='#1eb446';g.fillRect(580,300,120,120);});
      const gradient=make(g=>{const v=g.createLinearGradient(0,0,1280,0);v.addColorStop(0,'#ff0000');v.addColorStop(1,'#0000ff');g.fillStyle=v;g.fillRect(0,0,1280,720);});
      const current=HMStudio.project,key='embedded/bg-crop-test/layout.json';
      const atoms=[0,1].map(i=>({id:'crop-'+i,label:'Crop test '+(i+1),kind:'duo',duration_s:1,plates_needed:1,pose_mode:'hero',hero:{layout_source:key,plates:['P01']},camera:{preset:'static_hold',params:{s:{type:'const',v:1},x:{type:'const',v:0},y:{type:'const',v:0}}},fx_hooks:[]}));
      await HMStudio.load({version:1,show:{...current.show,show_id:'bg-crop-test',title:'Background crop test',atoms,bg:{base:gradient},overlays:[]},layouts:{[key]:{P01:{full:foreground}}},media:[{id:'marker',name:'Marker',src:foreground,layoutSource:key,plateId:'P01'}],assets:{}});
    });
    await settle();if((await state()).onion)await p.click('#onionToggle');
    await p.click('.timeline-clip[data-index="0"]');await p.selectOption('#backgroundScope','project');await settle();
    const cropPx=(x,t=.5)=>p.evaluate(([x,t])=>{HMStudio.renderAt(t);return Array.from(document.getElementById('stage').getContext('2d').getImageData(x,40,1,1).data);},[x,t]);
    assert.equal(await p.locator('#backgroundCropControls').isVisible(),true);assert.equal(await p.locator('#backgroundCropValue').textContent(),'Full frame');
    const fullLeft=await cropPx(40),fullRight=await cropPx(1240);assert.ok(fullLeft[0]>200&&fullLeft[2]<60,String(fullLeft));assert.ok(fullRight[2]>200&&fullRight[0]<60,String(fullRight));
    // Drag-rect on the thumbnail over the right (blue) part of the image.
    await p.locator('#backgroundCropFrame').scrollIntoViewIfNeeded();await p.waitForFunction(()=>document.getElementById('backgroundThumb').naturalWidth>0);
    const thumb=await p.locator('#backgroundThumb').boundingBox();const at=(fx,fy)=>[thumb.x+thumb.width*fx,thumb.y+thumb.height*fy];
    await p.mouse.move(...at(.6,.2));await p.mouse.down();await p.mouse.move(...at(.8,.4),{steps:4});await p.mouse.move(...at(.95,.5),{steps:4});await p.mouse.up();await settle();
    let crop=(await state()).project.show.bg.crops.base;assert.ok(Math.abs(crop.x-.6)<.02&&Math.abs(crop.y-.2)<.02&&Math.abs(crop.w-.35)<.02,JSON.stringify(crop));
    assert.ok(Math.abs(crop.h-crop.w)<.01,'16:9 lock on a 16:9 image keeps w==h normalized: '+JSON.stringify(crop));
    const croppedLeft=await cropPx(40);assert.ok(croppedLeft[2]>croppedLeft[0],'only the cropped (bluer) region is visible: '+croppedLeft);assert.notDeepEqual(croppedLeft,fullLeft);
    assert.equal((await state()).project.show.atoms[0].background,undefined);assert.match(await p.locator('#backgroundCropValue').textContent(),/35% × 35% @ 60, 20/);
    // Corner handle resize, move-by-drag, and numeric field edit.
    const se=await p.locator('.bg-crop-handle[data-handle="nw"]').boundingBox();await p.mouse.move(se.x+4,se.y+4);await p.mouse.down();await p.mouse.move(...at(.5,.1),{steps:5});await p.mouse.up();await settle();
    crop=(await state()).project.show.bg.crops.base;assert.ok(Math.abs(crop.x+crop.w-.95)<.02&&crop.x<.55&&crop.w>.4,'nw handle keeps the se corner: '+JSON.stringify(crop));
    const box=await p.locator('#backgroundCropRect').boundingBox();const beforeMove=crop;
    await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await p.mouse.move(box.x+box.width/2-thumb.width*.2,box.y+box.height/2,{steps:5});await p.mouse.up();await settle();
    crop=(await state()).project.show.bg.crops.base;assert.ok(Math.abs(crop.x-(beforeMove.x-.2))<.02&&Math.abs(crop.w-beforeMove.w)<1e-3,'move keeps size: '+JSON.stringify(crop));
    await change('backgroundCropW',25);crop=(await state()).project.show.bg.crops.base;assert.equal(crop.w,.25);assert.ok(Math.abs(crop.h-.25)<1e-3);
    await change('backgroundCropX',70);await change('backgroundCropY',10);crop=(await state()).project.show.bg.crops.base;assert.deepEqual([crop.x,crop.y,crop.w],[.7,.1,.25]);
    const narrowLeft=await cropPx(40);assert.ok(narrowLeft[2]>narrowLeft[0]&&narrowLeft[2]>croppedLeft[2]-30,String(narrowLeft));
    await click('undo');assert.notEqual((await state()).project.show.bg.crops.base.y,.1);assert.equal((await state()).project.show.bg.crops.base.x,.7);await click('redo');assert.equal((await state()).project.show.bg.crops.base.y,.1);
    check('HM-BG-CROP: drag-rect, corner handle, move and numeric fields edit the project crop; preview shows only the cropped region');
    // Clip override stays separate from the project crop.
    await p.selectOption('#backgroundScope','clip');await settle();assert.match(await p.locator('#backgroundCropValue').textContent(),/25% × 25% @ 70, 10/);
    await p.uncheck('#backgroundCropLock');await change('backgroundCropX',0);await change('backgroundCropW',30);await change('backgroundCropH',60);
    assert.deepEqual((await state()).project.show.atoms[0].background.crop,{x:0,y:.1,w:.3,h:.6});assert.deepEqual((await state()).project.show.bg.crops.base,{x:.7,y:.1,w:.25,h:.25});
    const clipLeft=await cropPx(40);assert.ok(clipLeft[0]>clipLeft[2],'clip crop shows the red side: '+clipLeft);
    await p.click('.timeline-clip[data-index="1"]');await settle();assert.deepEqual(await cropPx(40,1.5),narrowLeft);await p.click('.timeline-clip[data-index="0"]');await settle();
    check('HM-BG-CROP: a clip crop overrides the project crop for that clip only');
    // Persist: draft reload + portable motion JSON reopen restore both crops.
    const cropProjectPath=await downloadFrom('saveProject','bg-crop.motion.json');const cropProject=JSON.parse(fs.readFileSync(cropProjectPath));
    assert.deepEqual(cropProject.show.bg.crops.base,{x:.7,y:.1,w:.25,h:.25});assert.deepEqual(cropProject.show.atoms[0].background.crop,{x:0,y:.1,w:.3,h:.6});
    await p.reload();await p.evaluate(()=>window.ready);await settle();assert.deepEqual((await state()).project.show.bg.crops.base,{x:.7,y:.1,w:.25,h:.25});
    await p.click('#loadDemo');await p.waitForFunction(()=>HMStudio.project.show.show_id==='daiyu-wang-five-seconds');await settle();
    await p.setInputFiles('#projectInput',cropProjectPath);await p.waitForFunction(()=>document.getElementById('exportStatus').textContent==='Project opened.');await settle();if((await state()).onion)await p.click('#onionToggle');
    await p.click('.timeline-clip[data-index="0"]');await p.selectOption('#backgroundScope','project');await settle();
    assert.deepEqual((await state()).project.show.bg.crops.base,{x:.7,y:.1,w:.25,h:.25});assert.match(await p.locator('#backgroundCropValue').textContent(),/25% × 25% @ 70, 10/);
    assert.equal(await p.locator('#backgroundCropRect').evaluate(e=>e.style.left),'70%');assert.deepEqual(await cropPx(40),clipLeft);
    await p.click('.timeline-clip[data-index="1"]');await settle();assert.deepEqual(await cropPx(40,1.5),narrowLeft);await p.click('.timeline-clip[data-index="0"]');await settle();
    await click('resetBackgroundCrop');assert.equal((await state()).project.show.bg.crops,undefined);assert.equal(await p.locator('#backgroundCropValue').textContent(),'Full frame');
    await p.selectOption('#backgroundScope','clip');await click('inheritBackground');assert.equal((await state()).project.show.atoms[0].background,undefined);assert.deepEqual(await cropPx(40),fullLeft);await p.check('#backgroundCropLock');
    check('HM-BG-CROP: crop rects persist through draft reload and motion JSON reopen; reset returns to full frame');
    // HM-BG-MOTION: the crop is a window. Pan slides it across the source; a flush edge is disabled; export matches the preview.
    await p.evaluate(async()=>{
      const make=draw=>{const c=document.createElement('canvas');c.width=1280;c.height=720;draw(c.getContext('2d'));return c.toDataURL('image/png');};
      const foreground=make(g=>{g.fillStyle='#1eb446';g.fillRect(580,300,120,120);});
      const gradient=make(g=>{const img=g.getImageData(0,0,1280,720),d=img.data;for(let y=0;y<720;y++)for(let x=0;x<1280;x++){const i=(y*1280+x)*4;d[i]=Math.round(255*x/1279);d[i+1]=Math.round(255*y/719);d[i+2]=255-d[i];d[i+3]=255;}g.putImageData(img,0,0);});
      const current=HMStudio.project,key='embedded/bg-motion-test/layout.json';
      const atoms=[{id:'motion-0',label:'Motion crop',kind:'duo',duration_s:1,plates_needed:1,pose_mode:'hero',hero:{layout_source:key,plates:['P01']},camera:{preset:'static_hold',params:{s:{type:'const',v:1},x:{type:'const',v:0},y:{type:'const',v:0}}},fx_hooks:[]}];
      await HMStudio.load({version:1,show:{...current.show,show_id:'bg-motion-test',title:'Background motion crop test',atoms,bg:{base:gradient,crops:{base:{x:.25,y:.25,w:.5,h:.5}}},overlays:[]},layouts:{[key]:{P01:{full:foreground}}},media:[{id:'marker',name:'Marker',src:foreground,layoutSource:key,plateId:'P01'}],assets:{}});
    });
    await settle();if((await state()).onion)await p.click('#onionToggle');
    await p.click('.timeline-clip[data-index="0"]');await p.selectOption('#backgroundScope','project');await settle();
    if(!(await p.locator('#backgroundMotionDetails').evaluate(el=>el.open)))await p.locator('#backgroundMotionDetails > summary').click();
    assert.match(await p.locator('#backgroundMotionModel').textContent(),/Window pan/);
    assert.match(await p.locator('#backgroundCropValue').textContent(),/50% × 50% @ 25, 25/);
    const motionPx=async t=>p.evaluate(t=>{HMStudio.renderAt(t);const g=document.getElementById('stage').getContext('2d');return {bg:Array.from(g.getImageData(40,40,1,1).data),fg:Array.from(g.getImageData(640,340,1,1).data)};},t);
    await p.selectOption('#backgroundMotion','pan_left');await p.fill('#backgroundMotionAmount','1');await p.locator('#backgroundMotionAmount').dispatchEvent('change');await settle();
    assert.match(await p.locator('#backgroundMotionNote').textContent(),/Slides the crop window/);
    const leftStart=await motionPx(.05),leftEnd=await motionPx(.95);
    assert.ok(leftStart.bg[0]-leftEnd.bg[0]>25,'pan left reveals the low-red side: '+leftStart.bg+' -> '+leftEnd.bg);
    assert.deepEqual(leftStart.fg,[30,180,70,255]);assert.deepEqual(leftEnd.fg,leftStart.fg);
    await p.selectOption('#backgroundMotion','pan_right');await settle();
    const rightEnd=await motionPx(.95);assert.ok(rightEnd.bg[0]-leftStart.bg[0]>25,'pan right reveals the high-red side: '+rightEnd.bg);assert.deepEqual(rightEnd.fg,leftStart.fg);
    await p.selectOption('#backgroundMotion','pan_up');await settle();
    assert.ok(leftStart.bg[1]-(await motionPx(.95)).bg[1]>25,'pan up reveals the low-green side');
    await p.selectOption('#backgroundMotion','pan_down');await settle();
    assert.ok((await motionPx(.95)).bg[1]-leftStart.bg[1]>25,'pan down reveals the high-green side');
    await p.selectOption('#backgroundMotion','pan_right');await settle();
    const exportBeat=await motionPx(.95);
    await p.click('#exportOpen');const motionHtml=await downloadFrom('exportHtml','bg-motion.html');
    assert.match(fs.readFileSync(motionHtml,'utf8'),/function backgroundMotionFrame/);assert.match(fs.readFileSync(motionHtml,'utf8'),/function backgroundMotionProgress/);
    const motionOffline=await browser.newPage();const motionNet=[];await motionOffline.route(/^https?:/,r=>{motionNet.push(r.request().url());return r.abort();});
    await motionOffline.goto('file://'+motionHtml);await motionOffline.evaluate(()=>window.ready);await motionOffline.evaluate(()=>renderAt(.95));
    assert.deepEqual(await motionOffline.evaluate(()=>Array.from(document.getElementById('stage').getContext('2d').getImageData(40,40,1,1).data)),exportBeat.bg);assert.deepEqual(motionNet,[]);await motionOffline.close();
    await p.getByRole('button',{name:'Close export',exact:true}).click();
    await p.selectOption('#backgroundMotion','pan_left');await settle();
    await p.uncheck('#backgroundCropLock');await change('backgroundCropX',0);await change('backgroundCropY',25);await change('backgroundCropW',40);await change('backgroundCropH',50);
    assert.equal(await p.locator('#backgroundMotion option[value="pan_left"]').isDisabled(),true);
    assert.match(await p.locator('#backgroundMotionNote').textContent(),/left/i);
    assert.equal(await p.locator('#backgroundMotionNote').evaluate(el=>el.classList.contains('is-blocked')),true);
    assert.equal((await state()).project.show.bg.motion.preset,'pan_left');
    assert.deepEqual((await motionPx(.05)).bg,(await motionPx(.95)).bg);
    assert.equal(await p.locator('#backgroundMotion option[value="pan_right"]').isDisabled(),false);
    await p.selectOption('#backgroundMotion','pan_right');await settle();
    const flushStart=await motionPx(.05),flushEnd=await motionPx(.95);
    assert.ok(flushEnd.bg[0]-flushStart.bg[0]>25,'pan right still slides when the left edge is flush: '+flushStart.bg+' -> '+flushEnd.bg);
    await p.check('#backgroundCropLock');
    check('HM-BG-MOTION: window pan moves inside the crop in preview and exported HTML; a flush edge is disabled and explained');
    // HM-BG-PAN-CONT: one show clock keeps pan_right sliding across clip cuts. The sprite stays planted.
    await p.evaluate(async()=>{
      const make=draw=>{const c=document.createElement('canvas');c.width=1280;c.height=720;draw(c.getContext('2d'));return c.toDataURL('image/png');};
      const sprite=make(g=>{g.fillStyle='#1eb446';g.fillRect(0,0,1280,720);});
      const gradient=make(g=>{const img=g.getImageData(0,0,1280,720),d=img.data;for(let y=0;y<720;y++)for(let x=0;x<1280;x++){const i=(y*1280+x)*4;d[i]=Math.round(255*x/1279);d[i+1]=40;d[i+2]=255-d[i];d[i+3]=255;}g.putImageData(img,0,0);});
      const current=HMStudio.project,key='embedded/bg-pan-cont/layout.json';
      const atoms=[0,1,2,3].map(i=>({id:'pan-'+i,label:'Pan '+(i+1),kind:'duo',duration_s:1,plates_needed:1,pose_mode:'hero',hero:{layout_source:key,plates:['P0'+(i+1)]},camera:{preset:'static_hold',params:{s:{type:'const',v:1},x:{type:'const',v:0},y:{type:'const',v:0}}},fx_hooks:[]}));
      const plates={};for(let i=1;i<=4;i++)plates['P0'+i]={parts:[{src:sprite,x:560,y:280,w:160,h:160}]};
      await HMStudio.load({version:1,show:{...current.show,show_id:'bg-pan-cont',title:'Continuous background pan',atoms,bg:{base:gradient,crops:{base:{x:.05,y:.2,w:.5,h:.5}}},overlays:[]},layouts:{[key]:plates},media:[],assets:{}});
    });
    await settle();if((await state()).onion)await p.click('#onionToggle');
    await p.click('.timeline-clip[data-index="0"]');await p.selectOption('#backgroundScope','project');await settle();
    if(!(await p.locator('#backgroundMotionDetails').evaluate(el=>el.open)))await p.locator('#backgroundMotionDetails > summary').click();
    await p.selectOption('#backgroundMotion','pan_right');await p.fill('#backgroundMotionAmount','1');await p.locator('#backgroundMotionAmount').dispatchEvent('change');await settle();
    assert.equal(await p.locator('#backgroundMotionClock').inputValue(),'show');
    assert.equal(await p.locator('#backgroundMotionClock').evaluate(el=>el.selectedOptions[0].textContent),'Continuous (show)');
    assert.match(await p.locator('#backgroundMotionNote').textContent(),/Slides the crop window/);
    assert.match(await p.locator('#backgroundMotionNote').textContent(),/Continuous \(show\)/);
    assert.equal((await state()).project.show.bg.motion.clock,'show');
    assert.equal(await p.locator('#backgroundMotionClock').isDisabled(),false);
    const scrub=async t=>p.evaluate(t=>{
      HMStudio.renderAt(t);
      const g=document.getElementById('stage').getContext('2d');
      const tl=HMStudio.composed.timeline,motion=tl.bg.motion;
      const atom=tl.atoms.find(a=>t>=a.t0&&t<a.t1)||tl.atoms.at(-1);
      const u=backgroundMotionProgress(motion,t,{duration:tl.duration_s,atomT0:atom.t0,atomT1:atom.t1});
      const crop=backgroundMotionFrame(tl.bg.crops.base,'pan_right',motion.amount,u).crop;
      return {bg:Array.from(g.getImageData(24,80,1,1).data),fg:Array.from(g.getImageData(640,360,1,1).data),x:crop.x,u};
    },t);
    const times=[.5,1.5,2.5,3.5],samples=[];
    for(const t of times)samples.push(await scrub(t));
    for(let i=1;i<samples.length;i++){
      assert.ok(samples[i].x>samples[i-1].x+.02,'crop.x across atoms: '+samples.map(s=>s.x).join(','));
      assert.ok(samples[i].bg[0]>samples[i-1].bg[0]+8,'red channel across atoms: '+samples.map(s=>s.bg[0]).join(','));
    }
    for(const s of samples)assert.deepEqual(s.fg,[30,180,70,255],'sprite rides pan: '+s.fg);
    for(const b of [1,2,3]){
      const before=await scrub(b-.02),after=await scrub(b+.02);
      assert.ok(after.x+1e-4>=before.x,'restart at '+b+': '+before.x+' -> '+after.x);
    }
    await p.selectOption('#backgroundMotionClock','per_atom');await settle();
    assert.equal(await p.locator('#backgroundMotionClock').evaluate(el=>el.selectedOptions[0].textContent),'Per clip');
    assert.match(await p.locator('#backgroundMotionNote').textContent(),/Per clip/);
    assert.equal((await state()).project.show.bg.motion.clock,'per_atom');
    const late=await scrub(.95),restarted=await scrub(1.05);
    assert.ok(restarted.x<late.x-.05,'per clip should restart crop.x: '+late.x+' -> '+restarted.x);
    assert.ok(restarted.bg[0]+8<late.bg[0],'per clip should restart the pixels: '+late.bg+' -> '+restarted.bg);
    assert.deepEqual(restarted.fg,[30,180,70,255]);
    await p.selectOption('#backgroundMotionClock','show');await settle();
    assert.equal((await state()).project.show.bg.motion.clock,'show');
    await p.locator('#backgroundMotionDetails').scrollIntoViewIfNeeded();
    await p.locator('#backgroundMotionDetails').screenshot({path:path.join(out,'pan-cont-travel.png')});
    for(const t of times){
      await scrub(t);
      await p.locator('#stage').screenshot({path:path.join(out,`pan-cont-${t.toFixed(1)}s.png`)});
    }
    check('HM-BG-PAN-CONT: continuous show pan keeps crop.x moving across three clip cuts; per clip restarts; sprite stays planted');
    // HM-BG-SPAN-UI: span / t0–t1 are visible on continuous pan. Default stays show-clock. Preview and export follow the authored window.
    assert.equal(await p.locator('#backgroundMotionClock option[value="span"]').evaluate(el=>el.hidden),false);
    assert.equal(await p.locator('#backgroundSpanControls').isVisible(),true);
    assert.equal(await p.locator('#backgroundSpanT0').inputValue(),'0');
    assert.equal(await p.locator('#backgroundSpanT1').inputValue(),'4');
    assert.equal(await p.locator('#backgroundSpanValue').textContent(),'Whole show');
    assert.equal((await state()).project.show.bg.motion.clock,'show');
    assert.equal((await state()).project.show.bg.motion.span,undefined);
    await p.selectOption('#backgroundMotion','static');await settle();
    assert.equal(await p.locator('#backgroundSpanControls').isVisible(),false);
    assert.equal(await p.locator('#backgroundMotionClock option[value="span"]').evaluate(el=>el.hidden),true);
    await p.selectOption('#backgroundMotion','pan_right');await p.fill('#backgroundMotionAmount','1');await p.locator('#backgroundMotionAmount').dispatchEvent('change');await settle();
    assert.equal(await p.locator('#backgroundMotionClock').inputValue(),'show');
    assert.equal((await state()).project.show.bg.motion.clock,'show');
    assert.equal((await state()).project.show.bg.motion.span,undefined);
    assert.equal(await p.locator('#backgroundSpanControls').isVisible(),true);
    await p.selectOption('#backgroundMotionClock','per_atom');await settle();
    assert.equal(await p.locator('#backgroundSpanControls').isVisible(),false);
    assert.equal(await p.locator('#backgroundMotionClock option[value="span"]').evaluate(el=>el.hidden),false);
    await p.selectOption('#backgroundMotionClock','show');await settle();
    assert.equal((await state()).project.show.bg.motion.span,undefined);
    await p.selectOption('#backgroundMotionClock','span');await settle();
    assert.deepEqual((await state()).project.show.bg.motion,{preset:'pan_right',amount:1,clock:'span',span:{t0:0,t1:4}});
    await change('backgroundSpanT0',1);await change('backgroundSpanT1',3);
    assert.equal(await p.locator('#backgroundMotionClock').inputValue(),'span');
    assert.equal(await p.locator('#backgroundMotionClock').evaluate(el=>el.selectedOptions[0].textContent),'Continuous (span)');
    assert.deepEqual((await state()).project.show.bg.motion,{preset:'pan_right',amount:1,clock:'span',span:{t0:1,t1:3}});
    assert.equal(await p.locator('#backgroundSpanValue').textContent(),'1.00–3.00s');
    assert.match(await p.locator('#backgroundMotionNote').textContent(),/Continuous \(span\): one move from 1\.00s to 3\.00s/);
    const spanAt=async t=>scrub(t);
    const beforeSpan=await spanAt(.5),midSpan=await spanAt(2),afterSpan=await spanAt(3.5);
    assert.ok(Math.abs(beforeSpan.x-.05)<1e-3,'held before t0: '+beforeSpan.x);
    assert.equal(beforeSpan.u,0);
    assert.ok(Math.abs(midSpan.u-.5)<1e-6,'mid span progress: '+midSpan.u);
    assert.ok(Math.abs(midSpan.x-.275)<1e-3,'mid span crop.x: '+midSpan.x);
    assert.equal(afterSpan.u,1);
    assert.ok(Math.abs(afterSpan.x-.5)<1e-3,'held after t1: '+afterSpan.x);
    assert.ok(afterSpan.bg[0]>midSpan.bg[0]+8&&midSpan.bg[0]>beforeSpan.bg[0]+8,'red channel follows the span: '+[beforeSpan.bg[0],midSpan.bg[0],afterSpan.bg[0]]);
    for(const sample of [beforeSpan,midSpan,afterSpan])assert.deepEqual(sample.fg,[30,180,70,255]);
    await p.locator('#backgroundMotionDetails').scrollIntoViewIfNeeded();
    await p.locator('#backgroundMotionDetails').screenshot({path:path.join(out,'pan-span-controls.png')});
    await spanAt(.5);await p.locator('#stage').screenshot({path:path.join(out,'pan-span-0.5s.png')});
    await spanAt(2);await p.locator('#stage').screenshot({path:path.join(out,'pan-span-2.0s.png')});
    await spanAt(3.5);await p.locator('#stage').screenshot({path:path.join(out,'pan-span-3.5s.png')});
    await p.click('#exportOpen');const spanHtml=await downloadFrom('exportHtml','bg-span.html');
    const spanFile=fs.readFileSync(spanHtml,'utf8');
    assert.match(spanFile,/function backgroundMotionProgress/);
    assert.match(spanFile,/"motion":\{"preset":"pan_right","amount":1,"clock":"span","span":\{"t0":1,"t1":3\}\}/);
    const spanOffline=await browser.newPage();const spanNet=[];await spanOffline.route(/^https?:/,r=>{spanNet.push(r.request().url());return r.abort();});
    await spanOffline.goto('file://'+spanHtml);await spanOffline.evaluate(()=>window.ready);
    for(const [t,sample] of [[.5,beforeSpan],[2,midSpan],[3.5,afterSpan]]){
      await spanOffline.evaluate(t=>renderAt(t),t);
      assert.deepEqual(await spanOffline.evaluate(()=>Array.from(document.getElementById('stage').getContext('2d').getImageData(24,80,1,1).data)),sample.bg,'export mismatch at '+t);
    }
    assert.deepEqual(spanNet,[]);await spanOffline.close();
    await p.getByRole('button',{name:'Close export',exact:true}).click();
    check('HM-BG-SPAN-UI: continuous pan shows span t0–t1; default stays show-clock; preview and export match the authored window');
    // Restore the clip-background project the following checks build on.
    await p.setInputFiles('#projectInput',clipProjectPath);await p.waitForFunction(()=>HMStudio.project.show.show_id==='background-feature-test');await settle();if((await state()).onion)await p.click('#onionToggle');await p.click('.timeline-clip[data-index="0"]');await settle();
    const beforeBuiltIn=(await state()).project;
    await p.click('#importProjectImages');await p.selectOption('#projectMediaSource','daiyu-wang-ten-seconds');await p.waitForFunction(()=>document.querySelectorAll('.project-media-card').length===17);
    await p.getByRole('checkbox',{name:'Import Project background',exact:true}).check();await p.click('#importSelectedProjectImages');await p.waitForFunction(()=>!document.getElementById('projectMediaDialog').open);await settle();
    const afterBuiltIn=(await state()).project;assert.equal(afterBuiltIn.media.length,beforeBuiltIn.media.length+1);assert.deepEqual(afterBuiltIn.show,beforeBuiltIn.show);assert.deepEqual(afterBuiltIn.layouts[beforeBuiltIn.media[0].layoutSource],beforeBuiltIn.layouts[beforeBuiltIn.media[0].layoutSource]);
    await click('undo');assert.equal((await state()).project.media.length,beforeBuiltIn.media.length);await click('redo');assert.equal((await state()).project.media.length,afterBuiltIn.media.length);
    check('project image picker imports selected built-in images into the library without changing the timeline, with undo/redo');
    const foreign=structuredClone(clipProject);foreign.show.show_id='foreign-project';foreign.show.title='Another project';
    const foreignData='data:image/png;base64,'+solid;foreign.assets[ownBackground]=foreignData;foreign.media=[{...foreign.media[0],id:'foreign',name:'Other project backdrop',src:ownBackground}];
    await p.click('#importProjectImages');await p.setInputFiles('#projectMediaInput',{name:'bad.motion.json',mimeType:'application/json',buffer:Buffer.from('{"bad":true}')});await p.waitForFunction(()=>document.getElementById('projectMediaStatus').classList.contains('error'));assert.deepEqual((await state()).project.show,afterBuiltIn.show);
    await p.setInputFiles('#projectMediaInput',{name:'other.motion.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(foreign))});await p.waitForFunction(()=>document.getElementById('projectMediaStatus').textContent.includes('Another project'));
    await p.getByRole('checkbox',{name:'Import Other project backdrop',exact:true}).check();await p.click('#importSelectedProjectImages');await p.waitForFunction(()=>!document.getElementById('projectMediaDialog').open);await settle();
    const imported=(await state()).project.media.at(-1);assert.notEqual(imported.src,ownBackground);assert.equal((await state()).project.assets[ownBackground],clipProject.assets[ownBackground]);assert.equal((await state()).project.assets[imported.src],foreignData);assert.deepEqual((await state()).project.show,afterBuiltIn.show);
    await p.selectOption('#backgroundScope','clip');await p.selectOption('#backgroundLibrary',imported.id);await p.waitForFunction(id=>HMStudio.project.show.atoms[0].background.src===id,imported.src);await settle();assert.deepEqual(await pixel(),[197,43,181,255]);
    const importedPath=await downloadFrom('saveProject','imported-images.motion.json');const importedPortable=JSON.parse(fs.readFileSync(importedPath));assert.equal(importedPortable.assets[imported.src],foreignData);
    await p.reload();await p.evaluate(()=>window.ready);assert.equal((await state()).project.media.at(-1).src,imported.src);assert.equal((await state()).composed.layout.S001.background.src,imported.src);
    check('saved-project images import with collision-free asset keys, work as clip backgrounds, and persist in portable projects and drafts');
    // HM-P1-SCRUB checks: A/B view, linked scrub, Beat-focus edit on A, and source pick for B without replacing A
    await p.click('#loadDemo');await p.waitForFunction(()=>HMStudio.project.show.show_id==='daiyu-wang-five-seconds');await settle();
    await p.selectOption('#abSource','daiyu-wang-five-seconds');await settle();
    assert.equal(await p.locator('#paneA').isVisible(),true);assert.equal(await p.locator('#paneB').isVisible(),true);
    assert.equal(await p.locator('#paneALabel').textContent(),'A · Current draft');
    assert.equal(await p.locator('#paneAShowId').textContent(),'daiyu-wang-five-seconds');
    assert.equal(await p.locator('#paneBLabel').textContent(),'B · Gold reference');
    assert.equal(await p.locator('#paneBShowId').textContent(),'daiyu-wang-five-seconds');
    await p.click('#abToggle');assert.equal(await p.locator('#paneB').isVisible(),false);
    await p.click('#abToggle');assert.equal(await p.locator('#paneB').isVisible(),true);
    check('HM-P1-SCRUB: A/B two-pane view displays Current draft vs Gold reference labels and show IDs and toggles cleanly');
    await p.fill('#scrub','2.25');await p.locator('#scrub').dispatchEvent('input');
    let abSync=await p.evaluate(()=>({t:HMStudio.time,tA:HMStudio.renderer.lastTime,tB:HMStudio.rendererB.lastTime,cmp:HMStudio.abComparison}));
    assert.equal(abSync.t,2.25);assert.equal(abSync.tA,2.25);assert.equal(abSync.tB,2.25);
    assert.equal(await p.locator('#stageLabel').textContent(),await p.locator('#stageLabelB').textContent());
    assert.equal(abSync.cmp.diff.any,false);
    await p.click('.timeline-clip[data-index="1"]');await settle();
    abSync=await p.evaluate(()=>({t:HMStudio.time,tA:HMStudio.renderer.lastTime,tB:HMStudio.rendererB.lastTime,sel:HMStudio.selectedIndex}));
    assert.equal(abSync.sel,1);assert.equal(abSync.t,0.5);assert.equal(abSync.tA,0.5);assert.equal(abSync.tB,0.5);
    check('HM-P1-SCRUB: linked scrub and timeline beat selection keep identical t on both panes');
    await click('replaceImage');await p.getByRole('button',{name:'Use P08 in selected clip',exact:true}).click();await settle();
    await p.selectOption('#camera','slow_push');await change('roll',9);await change('duration',0.75);
    await p.evaluate(()=>HMStudio.renderAt(0.6));
    const afterEdit=await p.evaluate(()=>{
      const gA=document.getElementById('stage').getContext('2d').getImageData(640,360,1,1).data;
      const gB=document.getElementById('stageB').getContext('2d').getImageData(640,360,1,1).data;
      return {
        tA:HMStudio.renderer.lastTime,tB:HMStudio.rendererB.lastTime,
        atomA:HMStudio.project.show.atoms[1],atomB:HMStudio.projectB.show.atoms[1],
        cmp:HMStudio.abComparison,pixA:Array.from(gA),pixB:Array.from(gB)
      };
    });
    assert.equal(afterEdit.tA,0.6);assert.equal(afterEdit.tB,0.6);
    assert.equal(afterEdit.atomA.hero.plates[0],'P08');assert.equal(afterEdit.atomB.hero.plates[0],'P02');
    assert.equal(afterEdit.atomA.camera.preset,'slow_push');assert.equal(afterEdit.atomB.camera.preset,'static_hold');
    assert.equal(afterEdit.atomA.duration_s,0.75);assert.equal(afterEdit.atomB.duration_s,0.5);
    assert.deepEqual(afterEdit.cmp.diff,{plate:true,cam:true,timing:true,any:true});
    assert.equal(await p.locator('#abDiffPlate').getAttribute('data-diff'),'changed');
    assert.equal(await p.locator('#abDiffCam').getAttribute('data-diff'),'changed');
    assert.equal(await p.locator('#abDiffTiming').getAttribute('data-diff'),'changed');
    assert.notDeepEqual(afterEdit.pixA,afterEdit.pixB);
    check('HM-P1-SCRUB: Beat-focus plate, camera, and timing edits on A prove diffs against untouched Gold reference on B');
    const draftSnapshotBeforeB=(await state()).project;
    await p.selectOption('#abSource','daiyu-wang-ten-seconds');await p.waitForFunction(()=>HMStudio.projectB?.show?.show_id==='daiyu-wang-ten-seconds');await settle();
    assert.equal(await p.locator('#paneBLabel').textContent(),'B · Gold reference');
    assert.equal(await p.locator('#paneBShowId').textContent(),'daiyu-wang-ten-seconds');
    assert.equal(await p.locator('#paneAShowId').textContent(),'daiyu-wang-five-seconds');
    assert.deepEqual((await state()).project,draftSnapshotBeforeB);
    const customB=structuredClone(hmPortable);customB.show.show_id='imported-ref-b';customB.show.title='Imported B Ref';
    await p.setInputFiles('#abInput',{name:'ref-b.motion.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(customB))});
    await p.waitForFunction(()=>HMStudio.projectB?.show?.show_id==='imported-ref-b');await settle();
    assert.equal(await p.locator('#paneBLabel').textContent(),'B · Import reference');
    assert.equal(await p.locator('#paneBShowId').textContent(),'imported-ref-b');
    assert.deepEqual((await state()).project,draftSnapshotBeforeB);
    await p.setInputFiles('#abInput',{name:'bad-b.json',mimeType:'application/json',buffer:Buffer.from('{"bad":true}')});
    await p.waitForFunction(()=>document.getElementById('status').textContent.includes('Choose an HTML Motion project'));
    assert.equal(await p.locator('#paneBShowId').textContent(),'imported-ref-b');
    assert.deepEqual((await state()).project,draftSnapshotBeforeB);
    await p.click('#abSnapshot');await settle();
    assert.equal(await p.locator('#paneBLabel').textContent(),'B · Snapshot reference');
    assert.equal(await p.evaluate(()=>HMStudio.abComparison.diff.any),false);
    await p.selectOption('#abSource','daiyu-wang-five-seconds');await settle();
    check('HM-P1-SCRUB: picking Gold, Import JSON, or Snapshot source for B never replaces A draft and rejects invalid files safely');
    // HM-P1-FX checks: live cheap visual stand-ins on preview canvas before Compose + clear Compose-only honesty banner/label
    await p.click('#loadDemo');await p.waitForFunction(()=>HMStudio.project.show.show_id==='daiyu-wang-five-seconds');await settle();
    await p.click('.timeline-clip[data-index="0"]');await settle();
    await p.click('[data-effect="none"]');
    const sampleStageHash=()=>p.evaluate(()=>{
      const d=document.getElementById('stage').getContext('2d').getImageData(480,200,320,260).data;
      let h=2166136261>>>0;
      for(let i=0;i<d.length;i+=16){h^=d[i];h=Math.imul(h,16777619)>>>0;}
      const c=document.getElementById('stage').getContext('2d').getImageData(640,320,1,1).data;
      return {hash:h,center:Array.from(c)};
    });
    const cleanSample=await sampleStageHash();
    assert.equal(await p.locator('#fxPreviewBadge').isVisible(),false);
    assert.equal(await p.locator('#fxHonestyBanner').isVisible(),false);
    assert.equal(await p.locator('#fxHonestyNote').getAttribute('data-fx-state'),'clean');
    const fxStandInSamples={};
    for(const fxType of ['hit_pink','flash_orange','speed_lines','smear_trail','sparks','hit_orange']){
      // Click chip WITHOUT awaiting settle()/compile() first to prove live visual stand-in renders immediately while editing
      await p.click(`[data-effect="${fxType}"]`);
      const liveSample=await sampleStageHash();
      assert.notEqual(liveSample.hash,cleanSample.hash,`FX chip ${fxType} must render a live visual stand-in on #stage immediately`);
      fxStandInSamples[fxType]=liveSample;
      assert.equal(await p.locator('#fxPreviewBadge').isVisible(),true);
      assert.equal(await p.locator('#fxPreviewBadge').getAttribute('data-fx-mode'),'live-standin');
      assert.match(await p.locator('#fxPreviewBadge').textContent(),new RegExp(fxType));
      assert.equal(await p.locator('#fxHonestyBanner').isVisible(),false);
      assert.equal(await p.locator('#fxHonestyNote').getAttribute('data-fx-state'),'live-standin');
      await settle();
      const postCompileSample=await sampleStageHash();
      assert.notEqual(postCompileSample.hash,cleanSample.hash,`FX chip ${fxType} stand-in remains visible after compose`);
    }
    assert.notDeepEqual(fxStandInSamples.hit_pink.center,fxStandInSamples.flash_orange.center);
    assert.notEqual(fxStandInSamples.sparks.hash,fxStandInSamples.smear_trail.hash);
    check('HM-P1-FX: live cheap visual stand-ins (hit_pink, flash_orange, speed_lines, smear_trail, sparks, hit_orange) render on #stage while editing');
    // Compose-only chip (hitstop_2f) shows clear honesty banner/label and never silent no-ops
    await p.click('[data-effect="hitstop_2f"]');
    assert.equal(await p.locator('#fxHonestyBanner').isVisible(),true);
    assert.equal(await p.locator('#fxHonestyBanner').getAttribute('data-honesty'),'compose-only');
    assert.match(await p.locator('#fxHonestyBanner').textContent(),/Compose-only.*hitstop_2f/);
    assert.equal(await p.locator('#fxPreviewBadge').isVisible(),true);
    assert.equal(await p.locator('#fxPreviewBadge').getAttribute('data-fx-mode'),'compose-only');
    assert.equal(await p.locator('#fxHonestyNote').getAttribute('data-fx-state'),'compose-only');
    assert.match(await p.locator('#fxHonestyNote').textContent(),/Compose-only/);
    await settle();
    assert.equal((await state()).composed.timeline.fx.hitstop.length,1);
    // Verify Beat-focus / Play/Pause/scrub and plate/cam/timing edits still work without blocking
    await p.click('[data-effect="sparks"]');await settle();
    await p.selectOption('#camera','slow_push');await change('duration',0.6);
    assert.equal((await state()).project.show.atoms[0].camera.preset,'slow_push');
    assert.equal((await state()).project.show.atoms[0].duration_s,0.6);
    await p.fill('#scrub','0.25');await p.locator('#scrub').dispatchEvent('input');assert.equal((await state()).time,0.25);
    await p.click('#play');await p.waitForTimeout(120);await p.click('#play');assert.equal((await state()).playing,false);
    check('HM-P1-FX: Compose-only honesty banner/label (hitstop_2f) is explicit and FX stand-ins do not block Beat-focus, Play/Pause/scrub, or plate/cam/timing edits');
    // HM-P1-JUMP: plate chips and plate-id search seek the composed plate, staying in Beat focus.
    await p.click('#loadDemo');await p.waitForFunction(()=>HMStudio.project.show.show_id==='daiyu-wang-five-seconds');await settle();
    assert.equal(await p.locator('#platePrev').isVisible(),true);
    assert.equal(await p.locator('#plateNext').isVisible(),true);
    assert.equal(await p.locator('#plateJumpSearch').isVisible(),true);
    assert.equal(await p.locator('.plate-jump-chip').count(),1);
    await p.click('#plateNext');
    let jumped=await p.evaluate(()=>({t:HMStudio.time,sel:HMStudio.selectedIndex,label:document.getElementById('stageLabel').textContent,inspector:document.getElementById('inspectorContent').hidden}));
    assert.equal(jumped.t,0.5);assert.equal(jumped.sel,1);assert.match(jumped.label,/^P02 /);assert.equal(jumped.inspector,false);
    await p.locator('#stage').click();await p.keyboard.press('Alt+ArrowRight');
    assert.equal((await state()).time,1);assert.match(await p.locator('#stageLabel').textContent(),/^P03 /);
    await p.click('#platePrev');assert.equal((await state()).time,0.5);
    const showBefore=JSON.stringify((await state()).project.show);
    await p.fill('#plateJumpSearch','P07');await p.locator('#plateJumpSearch').press('Enter');
    jumped=await p.evaluate(()=>({t:HMStudio.time,sel:HMStudio.selectedIndex,label:document.getElementById('stageLabel').textContent,search:document.getElementById('plateJumpSearch').value,inspector:document.getElementById('inspectorContent').hidden}));
    assert.equal(jumped.t,3.25);assert.equal(jumped.sel,6);assert.match(jumped.label,/^P07 /);assert.equal(jumped.search,'P07 @ 3.25');assert.equal(jumped.inspector,false);
    await p.fill('#plateJumpSearch','P99');await p.locator('#plateJumpSearch').press('Enter');
    assert.equal((await state()).time,3.25);assert.match(await p.locator('#status').textContent(),/No plate matches/);
    assert.equal(JSON.stringify((await state()).project.show),showBefore);
    await p.fill('#scrub','1.2');await p.locator('#scrub').dispatchEvent('input');assert.equal((await state()).time,1.2);
    await p.click('#play');await p.waitForTimeout(120);await p.click('#play');assert.equal((await state()).playing,false);
    await p.fill('#plateJumpSearch','P07');await p.locator('#plateJumpSearch').press('Enter');
    await p.selectOption('#camera','eye_push');await change('duration',0.7);await p.click('[data-effect="sparks"]');await settle();
    const edited=await p.evaluate(()=>({atom:HMStudio.project.show.atoms[HMStudio.selectedIndex],badge:document.getElementById('fxPreviewBadge').textContent,mode:document.getElementById('fxPreviewBadge').dataset.fxMode}));
    assert.equal(edited.atom.camera.preset,'eye_push');assert.equal(edited.atom.duration_s,0.7);assert.equal(edited.atom.fx_hooks[0].type,'sparks');
    assert.equal(edited.mode,'live-standin');assert.match(edited.badge,/sparks/);
    check('HM-P1-JUMP: prev/next plate and plate-id search stay in Beat focus and leave play, scrub, camera, timing, and FX stand-ins working');
    await p.click('#loadOriginal');await p.waitForFunction(()=>HMStudio.project.show.show_id==='daiyu-wang-codex-import'&&HMStudio.composed&&HMStudio.composed.stats.plates===63);await settle();
    assert.equal(await p.locator('.plate-jump-chip').count(),7);
    await p.locator('.plate-jump-chip',{hasText:/^P18$/}).click();
    const chipLand=await p.evaluate(()=>({t:HMStudio.time,plate:HMComposeClient.inspectAt(HMStudio.composed,HMStudio.time).source_plate,pressed:document.querySelector('.plate-jump-chip[aria-pressed="true"]').textContent,label:document.getElementById('stageLabel').textContent,inspector:document.getElementById('inspectorContent').hidden}));
    assert.equal(chipLand.t,10);assert.equal(chipLand.plate,'P18');assert.equal(chipLand.pressed,'P18');assert.match(chipLand.label,/^P18 /);assert.equal(chipLand.inspector,false);
    await p.screenshot({path:path.join(out,'hm-p1-jump-chip.png'),fullPage:true});
    await p.fill('#plateJumpSearch','P42');await p.locator('#plateJumpSearch').press('Enter');
    const searchLand=await p.evaluate(()=>{
      const catalog=HMComposeClient.plateCatalog(HMStudio.composed);
      const here=HMComposeClient.inspectAt(HMStudio.composed,HMStudio.time);
      const atomStart=catalog.find(mark=>mark.atom_index===here.atom_index);
      return {t:HMStudio.time,plate:here.source_plate,index:here.plate_index,atomStart:atomStart.t0,atomStartPlate:atomStart.source_plate,label:document.getElementById('stageLabel').textContent,search:document.getElementById('plateJumpSearch').value,inspector:document.getElementById('inspectorContent').hidden};
    });
    assert.equal(searchLand.t,22);assert.equal(searchLand.plate,'P42');assert.ok(searchLand.index>=2);
    assert.notEqual(searchLand.atomStartPlate,'P42');assert.ok(searchLand.atomStart<searchLand.t);
    assert.match(searchLand.label,/^P42 /);assert.equal(searchLand.search,'P42 @ 22.00');assert.equal(searchLand.inspector,false);
    await p.click('#abToggle');
    await p.locator('#plateJumpSearch').scrollIntoViewIfNeeded();
    await p.screenshot({path:path.join(out,'hm-p1-jump-search.png'),fullPage:true});
    await p.click('#abToggle');
    check('HM-P1-JUMP: a decade chip and a plate-id search land on non-adjacent plates in the 63-plate rooftop edit');
    await p.click('#loadDemo');await p.waitForFunction(()=>HMStudio.project.show.show_id==='daiyu-wang-five-seconds');await settle();
    // HM-COMPOSE-FG: author a foreground prop, its own camera, and a timed break from Compose.
    if((await state()).onion)await p.click('#onionToggle');
    const chairPng=await p.evaluate(()=>{
      const c=document.createElement('canvas');c.width=140;c.height=140;const g=c.getContext('2d');
      g.clearRect(0,0,140,140);g.fillStyle='#e0a15a';g.fillRect(28,28,84,84);
      g.fillStyle='#8a4e22';g.fillRect(36,18,68,16);g.fillRect(40,18,10,78);g.fillRect(90,18,10,78);g.fillRect(36,96,12,28);g.fillRect(92,96,12,28);
      return c.toDataURL('image/png').split(',')[1];
    });
    await p.locator('#foregroundPanel').scrollIntoViewIfNeeded();
    await p.setInputFiles('#fgInput',{name:'chair.png',mimeType:'image/png',buffer:Buffer.from(chairPng,'base64')});
    await p.waitForFunction(()=>HMStudio.project.show.fg?.props?.length===1);await settle();
    assert.equal((await state()).project.show.fg.cam.preset,'parallax');
    assert.equal((await state()).project.show.fg.props[0].x,980);
    await p.selectOption('#fgCamPreset','parallax');await p.fill('#fgCamAmount','0.45');await p.locator('#fgCamAmount').dispatchEvent('change');await settle();
    await p.selectOption('#fgEffect','break');await settle();await change('fgEffectT',2);
    assert.equal((await state()).project.show.fg.props[0].effect.type,'break');
    assert.equal((await state()).project.show.fg.props[0].effect.t,2);
    assert.match(await p.locator('#fgCamNote').textContent(),/does not follow background crop-pan/);
    assert.equal(await p.locator('#fgCamPreset').inputValue(),'parallax');
    assert.equal(await p.locator('#fgEffect').inputValue(),'break');
    const fgPixel=()=>p.evaluate(()=>{
      const tl=HMStudio.composed.timeline,prop=tl.fg.props[0],t=HMStudio.time;
      const cam=fgCameraFrame(tl.fg.cam,t,{duration:tl.duration_s,atomT0:0,atomT1:tl.duration_s});
      const pose=fgPropPose(prop,t);
      const x=Math.round((pose.x-640)*cam.s+640+cam.x),y=Math.round((pose.y-360)*cam.s+360+cam.y);
      HMStudio.renderAt(t);
      return {x,y,px:Array.from(document.getElementById('stage').getContext('2d').getImageData(x,y,1,1).data),plate:document.getElementById('stageLabel').textContent,broken:fgBreakState(prop,t).broken};
    });
    await p.evaluate(()=>HMStudio.renderAt(0.25));
    const runBeat=await fgPixel();
    assert.equal(runBeat.broken,false);
    assert.ok(runBeat.x>900&&runBeat.x<1200&&runBeat.y>80&&runBeat.y<280,'chair stays on the opening beat: '+JSON.stringify(runBeat));
    assert.ok(runBeat.px[0]>180&&runBeat.px[1]>120&&runBeat.px[2]<160,'intact chair reads on the run beat: '+runBeat.px);
    assert.match(runBeat.plate,/Opening clash/);
    await p.locator('#foregroundPanel').screenshot({path:path.join(out,'fg-compose-ui.png')});
    await p.locator('#paneA').screenshot({path:path.join(out,'fg-run-beat.png')});
    await p.evaluate(()=>HMStudio.renderAt(2.35));
    const fightBreak=await fgPixel();
    assert.equal(fightBreak.broken,true);
    assert.match(fightBreak.plate,/Forearm block/);
    assert.ok(fightBreak.px[0]<50&&fightBreak.px[1]<40&&fightBreak.px[2]<30,'break crack is causal on the fight beat: '+fightBreak.px+' vs '+runBeat.px);
    assert.notDeepEqual(fightBreak.px,runBeat.px);
    await p.locator('#paneA').screenshot({path:path.join(out,'fg-fight-break.png')});
    const beforeKf=(await state()).project.show.atoms.map(a=>a.camera);
    const beforeBg=(await state()).project.show.bg;
    await p.fill('#scrub','0.4');await p.locator('#scrub').dispatchEvent('input');await change('fgX',900);await click('fgAddKf');
    await p.fill('#scrub','1.6');await p.locator('#scrub').dispatchEvent('input');await change('fgX',1100);await click('fgAddKf');
    const kfProp=(await state()).project.show.fg.props[0];
    assert.equal(kfProp.kf.length,2);
    const midPose=await p.evaluate(()=>fgPropPose(HMStudio.composed.timeline.fg.props[0],1));
    assert.ok(Math.abs(midPose.x-1000)<1,'keyframe midpoint '+midPose.x);
    assert.deepEqual((await state()).project.show.atoms.map(a=>a.camera),beforeKf);
    assert.deepEqual((await state()).project.show.bg,beforeBg);
    const redPng=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=140;c.height=140;const g=c.getContext('2d');g.fillStyle='#ff2040';g.fillRect(0,0,140,140);return c.toDataURL('image/png').split(',')[1];});
    await p.setInputFiles('#fgBrokenInput',{name:'chair-broken.png',mimeType:'image/png',buffer:Buffer.from(redPng,'base64')});
    await p.waitForFunction(()=>!!HMStudio.project.show.fg.props[0].effect.broken_src);await settle();
    await p.evaluate(()=>HMStudio.renderAt(2.35));
    const swapped=await fgPixel();
    assert.ok(swapped.px[0]>200&&swapped.px[1]<80,'broken image replaces the prop after the break: '+swapped.px);
    await p.evaluate(()=>HMStudio.renderAt(1.6));
    const stillIntact=await fgPixel();
    assert.ok(stillIntact.px[0]>180&&stillIntact.px[1]>100,'before the break the prop stays intact: '+stillIntact.px);
    check('HM-COMPOSE-FG: Compose authors a foreground prop, its camera, keyframes and a timed break on the fight');
    const webp=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=140;c.height=140;const g=c.getContext('2d');g.fillStyle='#20c060';g.fillRect(0,0,140,140);return c.toDataURL('image/webp');});
    assert.match(webp,/^data:image\/webp/);
    await p.setInputFiles('#fgBrokenInput',{name:'chair-broken.webp',mimeType:'image/webp',buffer:Buffer.from(webp.split(',')[1],'base64')});
    await p.waitForFunction(()=>/\.webp$/.test(HMStudio.project.show.fg.props[0].effect.broken_src||''));await settle();
    assert.equal((await state()).project.show.fg.props[0].effect.broken_src.endsWith('.webp'),true);
    await p.evaluate(()=>HMStudio.renderAt(2.35));
    const webpSwap=await fgPixel();
    assert.equal(webpSwap.broken,true);
    assert.ok(webpSwap.px[1]>160&&webpSwap.px[0]<80,'webp cutout replaces the prop after the break: '+webpSwap.px);
    await p.evaluate(()=>HMStudio.renderAt(1.6));
    const webpIntact=await fgPixel();
    assert.ok(webpIntact.px[0]>180&&webpIntact.px[1]>100,'before the break the prop stays intact under a webp cutout: '+webpIntact.px);
    const speedPng=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=64;c.height=64;const g=c.getContext('2d');g.clearRect(0,0,64,64);g.fillStyle='#00e5ff';g.fillRect(0,0,64,64);g.fillStyle='#06343a';g.fillRect(6,0,3,64);g.fillRect(50,0,3,64);return c.toDataURL('image/png').split(',')[1];});
    await p.selectOption('#fgSlot','overlay');
    await p.setInputFiles('#fgInput',{name:'speed-lines.png',mimeType:'image/png',buffer:Buffer.from(speedPng,'base64')});
    await p.waitForFunction(()=>HMStudio.project.show.fg.props.some(prop=>prop.slot==='overlay'));await settle();
    const overlayId=(await state()).project.show.fg.props.find(prop=>prop.slot==='overlay').id;
    await p.selectOption('#fgProp',overlayId);await settle();
    await change('fgX',180);await change('fgY',560);await change('fgT0',1);await change('fgT1',1.5);await change('fgZ',40);
    assert.equal(await p.locator('#fgBreakBox').isHidden(),true);
    assert.match(await p.locator('#fgOverlayLabel').textContent(),/does not crack/);
    const overlayProp=(await state()).project.show.fg.props.find(prop=>prop.slot==='overlay');
    assert.equal(overlayProp.effect,undefined);
    assert.equal(overlayProp.t_start,1);assert.equal(overlayProp.t_end,1.5);
    assert.equal(overlayProp.src.endsWith('.png'),true);
    const composedOverlay=(await state()).composed.timeline.fg.props.find(prop=>prop.slot==='overlay');
    assert.equal(composedOverlay.t_start,1);assert.equal(composedOverlay.t_end,1.5);
    assert.equal(Object.hasOwn(composedOverlay,'effect'),false);
    const sampleOverlay=t=>p.evaluate(t=>{
      HMStudio.renderAt(t);
      const tl=HMStudio.composed.timeline,prop=tl.fg.props.find(item=>item.slot==='overlay');
      const cam=fgCameraFrame(tl.fg.cam,t,{duration:tl.duration_s,atomT0:0,atomT1:tl.duration_s});
      const pose=fgPropPose(prop,t);
      const x=Math.round((pose.x-640)*cam.s+640+cam.x),y=Math.round((pose.y-360)*cam.s+360+cam.y);
      const px=Array.from(document.getElementById('stage').getContext('2d').getImageData(x,y,1,1).data);
      return {x,y,px,shown:t>=prop.t_start&&t<prop.t_end};
    },t);
    const hiddenOverlay=await sampleOverlay(0.4),shownOverlay=await sampleOverlay(1.2);
    assert.equal(hiddenOverlay.shown,false);assert.equal(shownOverlay.shown,true);
    assert.ok(shownOverlay.px[2]>200&&shownOverlay.px[1]>180&&shownOverlay.px[0]<40,'overlay art is visible inside its window: '+shownOverlay.px);
    assert.ok(!(hiddenOverlay.px[2]>200&&hiddenOverlay.px[1]>180&&hiddenOverlay.px[0]<40),'overlay art is hidden outside its window: '+hiddenOverlay.px);
    await p.locator('#foregroundPanel').screenshot({path:path.join(out,'fg-overlay-ui.png')});
    await p.evaluate(()=>HMStudio.renderAt(1.2));
    await p.locator('#paneA').screenshot({path:path.join(out,'fg-overlay-shown.png')});
    await p.click('#exportOpen');
    const cutoutHtml=await downloadFrom('exportHtml','fg-broken-cutout.html');
    const cutoutText=fs.readFileSync(cutoutHtml,'utf8');
    assert.match(cutoutText,/function fgBreakState/);
    assert.match(cutoutText,/slot === 'overlay'/);
    const cutoutPage=await browser.newPage();const cutoutNet=[];
    await cutoutPage.route(/^https?:/,r=>{cutoutNet.push(r.request().url());return r.abort();});
    await cutoutPage.goto('file://'+cutoutHtml);await cutoutPage.evaluate(()=>window.ready);
    await cutoutPage.evaluate(()=>renderAt(1.2));
    assert.deepEqual(await cutoutPage.evaluate(xy=>Array.from(document.getElementById('stage').getContext('2d').getImageData(xy[0],xy[1],1,1).data),[shownOverlay.x,shownOverlay.y]),shownOverlay.px);
    await cutoutPage.evaluate(()=>renderAt(0.4));
    assert.deepEqual(await cutoutPage.evaluate(xy=>Array.from(document.getElementById('stage').getContext('2d').getImageData(xy[0],xy[1],1,1).data),[hiddenOverlay.x,hiddenOverlay.y]),hiddenOverlay.px);
    await cutoutPage.evaluate(()=>renderAt(2.35));
    assert.deepEqual(await cutoutPage.evaluate(xy=>Array.from(document.getElementById('stage').getContext('2d').getImageData(xy[0],xy[1],1,1).data),[webpSwap.x,webpSwap.y]),webpSwap.px);
    assert.deepEqual(cutoutNet,[]);await cutoutPage.close();
    await p.getByRole('button',{name:'Close export',exact:true}).click();
    await p.selectOption('#fgSlot','prop');
    check('HM-FG-BROKEN-CUTOUT: broken WebP replaces the crack in the player and the export, and overlay art shows only inside its window');
    await p.evaluate(async()=>{
      const make=draw=>{const c=document.createElement('canvas');c.width=1280;c.height=720;draw(c.getContext('2d'));return c.toDataURL('image/png');};
      const mark=make(g=>{g.clearRect(0,0,1280,720);g.fillStyle='#1eb446';g.fillRect(580,300,120,120);});
      const gradient=make(g=>{const img=g.getImageData(0,0,1280,720),d=img.data;for(let y=0;y<720;y++)for(let x=0;x<1280;x++){const i=(y*1280+x)*4;d[i]=Math.round(255*x/1279);d[i+1]=40;d[i+2]=80;d[i+3]=255;}g.putImageData(img,0,0);});
      const current=HMStudio.project,key='embedded/fg-cam/layout.json';
      const show={...current.show};delete show.fg;
      const atoms=[{id:'fg-cam-0',label:'FG cam',kind:'duo',duration_s:1,plates_needed:1,pose_mode:'hero',hero:{layout_source:key,plates:['P01']},camera:{preset:'static_hold',params:{s:{type:'const',v:1},x:{type:'const',v:0},y:{type:'const',v:0}}},fx_hooks:[]}];
      await HMStudio.load({version:1,show:{...show,show_id:'fg-cam-test',title:'Foreground camera test',atoms,bg:{base:gradient,crops:{base:{x:.15,y:.2,w:.5,h:.5}}},overlays:[]},layouts:{[key]:{P01:{full:mark}}},media:[{id:'marker',name:'Marker',src:mark,layoutSource:key,plateId:'P01'}],assets:{}});
    });
    await settle();if((await state()).onion)await p.click('#onionToggle');
    const bluePng=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=64;c.height=64;const g=c.getContext('2d');g.fillStyle='#2244ff';g.fillRect(0,0,64,64);return c.toDataURL('image/png').split(',')[1];});
    await p.setInputFiles('#fgInput',{name:'blue-prop.png',mimeType:'image/png',buffer:Buffer.from(bluePng,'base64')});
    await p.waitForFunction(()=>HMStudio.project.show.fg?.props?.length===1);await settle();
    await change('fgX',200);await change('fgY',160);await change('fgT1',1);
    await p.selectOption('#backgroundScope','project');
    if(!(await p.locator('#backgroundMotionDetails').evaluate(el=>el.open)))await p.locator('#backgroundMotionDetails > summary').click();
    await p.selectOption('#backgroundMotion','pan_right');await p.fill('#backgroundMotionAmount','1');await p.locator('#backgroundMotionAmount').dispatchEvent('change');await settle();
    await p.selectOption('#fgCamPreset','parallax');await p.fill('#fgCamAmount','0.35');await p.locator('#fgCamAmount').dispatchEvent('change');await settle();
    assert.equal((await state()).project.show.bg.motion.preset,'pan_right');
    assert.equal((await state()).project.show.fg.cam.preset,'parallax');
    assert.notEqual((await state()).project.show.fg.cam.preset,(await state()).project.show.bg.motion.preset);
    const camSample=t=>p.evaluate(t=>{
      HMStudio.renderAt(t);
      const tl=HMStudio.composed.timeline,prop=tl.fg.props[0];
      const cam=fgCameraFrame(tl.fg.cam,t,{duration:tl.duration_s,atomT0:0,atomT1:tl.duration_s});
      const pose=fgPropPose(prop,t);
      const x=Math.round((pose.x-640)*cam.s+640+cam.x),y=Math.round((pose.y-360)*cam.s+360+cam.y);
      const g=document.getElementById('stage').getContext('2d');
      return {x,y,prop:Array.from(g.getImageData(x,y,1,1).data),bg:Array.from(g.getImageData(40,40,1,1).data),actor:Array.from(g.getImageData(640,340,1,1).data),camX:cam.x};
    },t);
    const fgEarly=await camSample(.05),fgLate=await camSample(.95);
    assert.ok(fgEarly.x>fgLate.x+40,'foreground parallax moves on its own: '+fgEarly.x+' -> '+fgLate.x);
    assert.ok(fgEarly.prop[2]>180&&fgEarly.prop[0]<80,'early prop is the blue foreground: '+fgEarly.prop);
    assert.ok(fgLate.prop[2]>180&&fgLate.prop[0]<80,'late prop is the blue foreground: '+fgLate.prop);
    assert.notDeepEqual(fgEarly.bg,fgLate.bg,'background crop-pan changes scenery');
    assert.ok(fgLate.bg[0]>fgEarly.bg[0]+10,'background pans the other way from the foreground: '+fgEarly.bg+' -> '+fgLate.bg);
    assert.deepEqual(fgEarly.actor,fgLate.actor);
    assert.deepEqual(fgEarly.actor,[30,180,70,255]);
    await p.evaluate(()=>HMStudio.renderAt(.05));await p.locator('#paneA').screenshot({path:path.join(out,'fg-cam-early.png')});
    await p.evaluate(()=>HMStudio.renderAt(.95));await p.locator('#paneA').screenshot({path:path.join(out,'fg-cam-late.png')});
    const actorBefore=fgEarly.actor,propAt=fgEarly;
    await p.selectOption('#camera','eye_orbit');await change('panX',200);await settle();
    const afterChar=await camSample(.05);
    assert.deepEqual(afterChar.prop,propAt.prop,'clip camera does not move the foreground');
    assert.deepEqual(afterChar.bg,fgEarly.bg,'clip camera does not move an independent background');
    assert.notDeepEqual(afterChar.actor,actorBefore);
    await p.click('#exportOpen');const fgHtml=await downloadFrom('exportHtml','fg-layer.html');
    const fgHtmlText=fs.readFileSync(fgHtml,'utf8');
    assert.match(fgHtmlText,/function fgCameraFrame/);assert.match(fgHtmlText,/function fgBreakState/);assert.match(fgHtmlText,/function fgPropPose/);
    const fgOffline=await browser.newPage();const fgNet=[];await fgOffline.route(/^https?:/,r=>{fgNet.push(r.request().url());return r.abort();});
    await fgOffline.goto('file://'+fgHtml);await fgOffline.evaluate(()=>window.ready);await fgOffline.evaluate(()=>renderAt(.95));
    assert.deepEqual(await fgOffline.evaluate(()=>Array.from(document.getElementById('stage').getContext('2d').getImageData(40,40,1,1).data)),fgLate.bg);
    const offlineProp=await fgOffline.evaluate(xy=>Array.from(document.getElementById('stage').getContext('2d').getImageData(xy[0],xy[1],1,1).data),[fgLate.x,fgLate.y]);
    assert.deepEqual(offlineProp,fgLate.prop);assert.deepEqual(fgNet,[]);await fgOffline.close();
    await p.getByRole('button',{name:'Close export',exact:true}).click();
    check('HM-COMPOSE-FG: foreground camera stays independent of background crop-pan and the clip camera, including offline HTML');
    await p.click('#loadDemo');await p.waitForFunction(()=>HMStudio.project.show.show_id==='daiyu-wang-five-seconds');await settle();
    await p.click('.timeline-clip[data-index="0"]');await settle();
    for(const fxType of ['exposure_warm_crush','fist_pressure','leg_arc','tornado_spiral']){
      await p.click(`[data-effect="${fxType}"]`);
      assert.equal((await p.locator('#fxPreviewBadge').getAttribute('data-fx-mode')),'live-standin');
      assert.match(await p.locator('#fxPreviewBadge').textContent(),new RegExp(fxType));
      await settle();
      assert.equal((await state()).project.show.atoms[0].fx_hooks[0].type,fxType);
    }
    assert.equal((await state()).project.show.atoms[0].fx_hooks[0].params.dur,0.5);
    await p.click('[data-effect="exposure_warm_crush"]');await settle();
    assert.equal((await state()).project.show.atoms[0].fx_hooks[0].params.dur,0.1);
    assert.match(await p.locator('#fxHonestyNote').textContent(),/0\.10s/);
    assert.match(await p.locator('#fxHonestyNote').textContent(),/does not gray/);
    const punchPath=[[430,390],[610,300],[760,250]];
    const kickPath=[[800,560],[1020,340],[1160,150]];
    await p.evaluate(({punchPath,kickPath})=>{
      HMStudio.editProject(project=>{
        project.show.atoms[0].fx_hooks=[
          {type:'fist_pressure',t_rel:0.2,params:{dur:0.36,path:punchPath}},
          {type:'leg_arc',t_rel:0.2,params:{dur:0.28,path:kickPath}},
          {type:'exposure_warm_crush',t_rel:0.2,params:{dur:0.10}},
        ];
        project.show.overlays=(project.show.overlays||[]).filter(o=>!o.editor_caption);
      });
    },{punchPath,kickPath});
    await settle();
    const composedFx=(await state()).composed.timeline.fx;
    assert.deepEqual(composedFx.exposure,[[0.1,0.1]]);
    assert.deepEqual(composedFx.fist[0][2],punchPath);
    assert.deepEqual(composedFx.leg[0][2],kickPath);
    const sampleFx=opts=>p.evaluate(opts=>{
      const r=HMStudio.renderer;
      r.render(opts.t,{onion:false,fxStandIn:false});
      const g=document.getElementById('stage').getContext('2d');
      function scan(x,y,w,h){
        const data=g.getImageData(x,y,w,h).data;
        let red=null,redS=-1,cold=null,coldS=-1;
        for(let i=0;i<data.length;i+=4){
          const R=data[i],G=data[i+1],B=data[i+2];
          const rs=R-Math.max(G,B);
          if(R>140&&G<90&&B<90&&rs>redS){redS=rs;red=[R,G,B];}
          const cs=B-R;
          if(B>R+4&&B>220&&G>190&&cs>coldS){coldS=cs;cold=[R,G,B];}
        }
        return {red,redS,cold,coldS};
      }
      const one=(x,y)=>Array.from(g.getImageData(x,y,1,1).data);
      return {corner:one(24,24),core:one(462,360),blade:one(800,560),fist:scan(430,320,120,100),leg:scan(760,500,120,110)};
    },opts);
    const outside=await sampleFx({t:0.02});
    const hit=await sampleFx({t:0.14});
    assert.ok(hit.fist.redS>outside.fist.redS+80,'fist pressure should be redder than the plate: '+JSON.stringify({hit:hit.fist,outside:outside.fist,core:hit.core}));
    assert.ok(hit.core[0]>180&&hit.core[1]<50&&hit.core[0]>hit.core[2]+80,'fist core: '+hit.core);
    assert.ok(hit.blade[2]>220&&hit.blade[2]>hit.blade[0]+4,'leg blade: '+hit.blade);
    assert.ok(hit.leg.cold,'cold-white leg arc missing at impact: '+JSON.stringify(hit.leg));
    await p.evaluate(()=>HMStudio.editProject(project=>{project.show.atoms[0].fx_hooks=project.show.atoms[0].fx_hooks.filter(h=>h.type!=='exposure_warm_crush');}));
    await settle();
    const coloredOnly=await sampleFx({t:0.14});
    assert.ok(coloredOnly.fist.red&&coloredOnly.leg.cold);
    await p.evaluate(()=>HMStudio.editProject(project=>{
      project.show.atoms[0].fx_hooks.push({type:'exposure_warm_crush',t_rel:0.2,params:{dur:0.10}});
    }));
    await settle();
    const crushed=await sampleFx({t:0.14});
    assert.deepEqual(crushed.core,coloredOnly.core);
    assert.deepEqual(crushed.blade,coloredOnly.blade);
    assert.notDeepEqual(crushed.corner.slice(0,3),coloredOnly.corner.slice(0,3),'warm crush should move a neutral highlight: '+coloredOnly.corner+' -> '+crushed.corner);
    if(await p.locator('#onionToggle').getAttribute('aria-pressed')==='true')await p.click('#onionToggle');
    if(await p.locator('#abToggle').getAttribute('aria-pressed')==='true')await p.click('#abToggle');
    await p.evaluate(()=>HMStudio.renderAt(0.14));
    await p.screenshot({path:path.join(out,'exposure-keeps-color.png'),fullPage:true});
    await p.locator('#stage').screenshot({path:path.join(out,'exposure-fist-leg.png')});
    await p.evaluate(()=>HMStudio.editProject(project=>{
      project.show.atoms[0].fx_hooks=[
        {type:'tornado_spiral',t_rel:0.1,params:{dur:0.4,path:[[640,460],[660,280]]}},
        {type:'fist_pressure',t_rel:0.1,params:{dur:0.36,path:[[480,360],[700,280]]}},
      ];
    }));
    await settle();
    await p.evaluate(()=>HMStudio.renderAt(0.2));
    await p.locator('#stage').screenshot({path:path.join(out,'tornado-and-fist.png')});
    await p.click('#exportOpen');
    const fxHtml=await downloadFrom('exportHtml','exposure-param-fx.html');
    const fxHtmlText=fs.readFileSync(fxHtml,'utf8');
    assert.match(fxHtmlText,/function exposureWarmCrushPixels/);
    assert.match(fxHtmlText,/function drawFistPressure/);
    assert.match(fxHtmlText,/function drawLegArc/);
    assert.match(fxHtmlText,/function drawTornado/);
    assert.doesNotMatch(fxHtmlText,/grayscale\(1\) contrast\(9\) invert\(1\)/);
    await p.getByRole('button',{name:'Close export',exact:true}).click();
    if(await p.locator('#abToggle').getAttribute('aria-pressed')==='false')await p.click('#abToggle');
    check('HM-EXPOSURE-PARAM-FX: warm crush keeps the red fist and cold leg arc, and parametric FX preview in the composer');
    // HM-FX-LOC-SIZE: select parametric FX -> set x/y (preview moves) -> set scale (timing/colour/type unchanged) -> persist/reload/export match + capscreens A/B/C
    const proofDir=path.resolve('docs/proof/hm-fx-loc-size');
    fs.mkdirSync(proofDir,{recursive:true});
    const delivDir='/workspace/deliverables/hm-fx-loc-size/capscreens';
    try{fs.mkdirSync(delivDir,{recursive:true});}catch(_){}
    await p.click('#loadDemo');await p.waitForFunction(()=>HMStudio.project.show.show_id==='daiyu-wang-five-seconds');await settle();
    await p.click('.timeline-clip[data-index="0"]');await settle();
    if(await p.locator('#onionToggle').getAttribute('aria-pressed')==='true')await p.click('#onionToggle');
    if(await p.locator('#abToggle').getAttribute('aria-pressed')==='true')await p.click('#abToggle');
    await p.click('[data-effect="none"]');await settle();
    assert.equal(await p.locator('#fxLocSizeBox').isVisible(),false);
    for(const fxType of ['fist_pressure','leg_arc','tornado_spiral','exposure_warm_crush']){
      await p.click(`[data-effect="${fxType}"]`);await settle();
      assert.equal(await p.locator('#fxLocSizeBox').isVisible(),true,fxType);
      assert.equal(await p.locator('#fxLocX').inputValue(),'0',fxType);
      assert.equal(await p.locator('#fxLocY').inputValue(),'0',fxType);
      assert.equal(await p.locator('#fxScale').inputValue(),'1',fxType);
    }
    // Select fist_pressure for Capscreen A (default), B (moved x/y), C (scaled)
    await p.click('[data-effect="fist_pressure"]');await settle();
    await p.evaluate(()=>HMStudio.renderAt(0.08));
    const fistSample=()=>p.evaluate(()=>{
      const g=document.getElementById('stage').getContext('2d');
      const one=(x,y)=>Array.from(g.getImageData(x,y,1,1).data);
      // Scan opaque bright red core (#e10600 -> R === 225 && G === 6 && B === 0)
      const data=g.getImageData(0,0,1280,720).data;
      let minX=1280,maxX=0,minY=720,maxY=0,sumX=0,sumY=0,count=0;
      for(let y=0;y<720;y++){
        for(let x=0;x<1280;x++){
          const i=(y*1280+x)*4;
          if(data[i]===225&&data[i+1]===6&&data[i+2]===0){
            if(x<minX)minX=x;if(x>maxX)maxX=x;
            if(y<minY)minY=y;if(y>maxY)maxY=y;
            sumX+=x;sumY+=y;count++;
          }
        }
      }
      return {cx:count?sumX/count:0,cy:count?sumY/count:0,w:maxX-minX,h:maxY-minY,count,atDefault:one(430,390),atMoved:one(710,270)};
    });
    const sampleA=await fistSample();
    assert.ok(sampleA.count>500,'default fist renders red pressure');
    assert.ok(sampleA.atDefault[0]<50&&sampleA.atDefault[1]<20,'default fist dark center at (430,390): '+sampleA.atDefault);
    await p.screenshot({path:path.join(proofDir,'A-default.png'),fullPage:true});
    try{fs.copyFileSync(path.join(proofDir,'A-default.png'),path.join(delivDir,'A-default.png'));}catch(_){}

    // (B) Move x/y (+280, -120) -> preview moves immediately, timing/colour/type unchanged
    const hkBeforeMove=structuredClone((await state()).project.show.atoms[0].fx_hooks[0]);
    await change('fxLocX',280);
    await change('fxLocY',-120);
    await p.evaluate(()=>HMStudio.renderAt(0.08));
    const sampleB=await fistSample();
    assert.ok(Math.abs((sampleB.cx-sampleA.cx)-280)<35,'fist center X moved by ~+280: '+sampleA.cx+' -> '+sampleB.cx);
    assert.ok(Math.abs((sampleB.cy-sampleA.cy)-(-120))<35,'fist center Y moved by ~-120: '+sampleA.cy+' -> '+sampleB.cy);
    assert.ok(sampleB.atMoved[0]<50&&sampleB.atMoved[1]<20,'moved fist dark center at (710,270): '+sampleB.atMoved);
    await p.screenshot({path:path.join(proofDir,'B-moved-xy.png'),fullPage:true});
    try{fs.copyFileSync(path.join(proofDir,'B-moved-xy.png'),path.join(delivDir,'B-moved-xy.png'));}catch(_){}

    // (C) Scale same FX (scale = 1.65) -> preview scales, timing/colour/type unchanged
    await change('fxScale',1.65);
    await p.evaluate(()=>HMStudio.renderAt(0.08));
    const sampleC=await fistSample();
    assert.ok(sampleC.w>sampleB.w*1.35&&sampleC.h>sampleB.h*1.35,'scaled fist bbox grew: '+sampleB.w+'x'+sampleB.h+' -> '+sampleC.w+'x'+sampleC.h);
    assert.ok(sampleC.count>sampleB.count*1.8,'scaled fist red pixel count grew: '+sampleB.count+' -> '+sampleC.count);
    const hkAfterScale=(await state()).project.show.atoms[0].fx_hooks[0];
    assert.equal(hkAfterScale.type,hkBeforeMove.type);
    assert.equal(hkAfterScale.t_rel,hkBeforeMove.t_rel);
    assert.equal(hkAfterScale.params.dur,hkBeforeMove.params.dur);
    assert.deepEqual(hkAfterScale.params.path,hkBeforeMove.params.path);
    assert.equal(hkAfterScale.params.x,280);
    assert.equal(hkAfterScale.params.y,-120);
    assert.equal(hkAfterScale.params.scale,1.65);
    await p.screenshot({path:path.join(proofDir,'C-scaled.png'),fullPage:true});
    try{fs.copyFileSync(path.join(proofDir,'C-scaled.png'),path.join(delivDir,'C-scaled.png'));}catch(_){}

    // Persist show JSON, reload, and export HTML match
    const locSizePortablePath=await downloadFrom('saveProject','hm-fx-loc-size.motion.json');
    const locSizePortable=JSON.parse(fs.readFileSync(locSizePortablePath,'utf8'));
    assert.deepEqual(locSizePortable.show.atoms[0].fx_hooks[0].params,{dur:0.36,path:[[430,390],[610,300],[760,250]],x:280,y:-120,scale:1.65});
    await p.reload();await p.evaluate(()=>window.ready);await settle();
    if(await p.locator('#onionToggle').getAttribute('aria-pressed')==='true')await p.click('#onionToggle');
    if(await p.locator('#abToggle').getAttribute('aria-pressed')==='true')await p.click('#abToggle');
    assert.equal(await p.locator('#fxLocX').inputValue(),'280');
    assert.equal(await p.locator('#fxLocY').inputValue(),'-120');
    assert.equal(await p.locator('#fxScale').inputValue(),'1.65');
    await p.evaluate(()=>HMStudio.renderAt(0.08));
    const sampleReload=await fistSample();
    assert.equal(sampleReload.w,sampleC.w);
    assert.equal(sampleReload.h,sampleC.h);
    assert.deepEqual(sampleReload.atMoved,sampleC.atMoved);
    await p.click('#exportOpen');
    const locSizeHtml=await downloadFrom('exportHtml','hm-fx-loc-size.html');
    await p.getByRole('button',{name:'Close export',exact:true}).click();
    const locSizeOffline=await browser.newPage();
    await locSizeOffline.route(/^https?:/,r=>r.abort());
    await locSizeOffline.goto('file://'+locSizeHtml);
    await locSizeOffline.evaluate(()=>window.ready);
    await locSizeOffline.evaluate(()=>renderAt(0.08));
    const exportMovedPx=await locSizeOffline.evaluate(()=>Array.from(document.getElementById('stage').getContext('2d').getImageData(710,270,1,1).data));
    assert.deepEqual(exportMovedPx,sampleC.atMoved);
    await locSizeOffline.close();
    if(await p.locator('#abToggle').getAttribute('aria-pressed')==='false')await p.click('#abToggle');
    if(await p.locator('#onionToggle').getAttribute('aria-pressed')==='false')await p.click('#onionToggle');
    check('HM-FX-LOC-SIZE: parametric FX x/y and scale move and resize preview, preserve timing/colour/type, persist across reload, and match offline HTML export');
    // HM-DIALOGUE-HOLD: film-slow hold or micro-cut on the selected clip; unselected impacts stay; preview and undo match
    await p.click('#loadDemo');await p.waitForFunction(()=>HMStudio.project.show.show_id==='daiyu-wang-five-seconds');await settle();
    assert.equal((await state()).duration,5);
    const holdProof=path.resolve('docs/proof/hm-dialogue-hold');
    fs.mkdirSync(holdProof,{recursive:true});
    const holdDeliv='/workspace/deliverables/hm-dialogue-hold/capscreens';
    try{fs.mkdirSync(holdDeliv,{recursive:true});}catch(_){}
    const holdShot=async name=>{await p.screenshot({path:path.join(holdProof,name),fullPage:true});try{fs.copyFileSync(path.join(holdProof,name),path.join(holdDeliv,name));}catch(_){}};
    const impactDurations=atoms=>[0,4,6,7].map(i=>atoms[i].duration_s);
    await p.click('.timeline-clip[data-index="1"]');await settle();
    await p.selectOption('#timingPack','dialogue_film_slow');
    assert.equal(await p.locator('#timingSoftCam').isDisabled(),false);
    await p.check('#timingSoftCam');
    await click('applyTimingPack');
    let holdAtoms=(await state()).project.show.atoms;
    assert.equal(holdAtoms[1].duration_s,1.5);
    assert.equal(holdAtoms[1].camera.preset,'slow_push');
    assert.equal(holdAtoms[1].camera.intensity,0.45);
    assert.equal(holdAtoms[1].timing_hold.kind,'hold');
    assert.equal(holdAtoms[1].timing_hold.soft_cam,true);
    assert.deepEqual(impactDurations(holdAtoms),[0.5,0.75,0.75,1]);
    assert.equal(holdAtoms[2].duration_s,0.5);
    let holdState=await state();
    assert.equal(holdState.duration,6);
    assert.equal(holdState.composed.duration_s,6);
    assert.ok(Math.abs((holdState.composed.timeline.plates[1].t1-holdState.composed.timeline.plates[1].t0)-1.5)<1e-4);
    assert.equal(holdState.composed.timeline.atoms[1].cam[0].preset,'slow_push');
    assert.equal(await p.locator('#duration').inputValue(),'1.5');
    assert.match(await p.locator('#timelineCount').textContent(),/6\.00s/);
    assert.match(await p.locator('#stageLabel').textContent(),/Recoil/);
    assert.match(await p.locator('#timingPackHint').textContent(),/On this clip: hold/);
    assert.match(await p.locator('#status').textContent(),/6\.00s/);
    await holdShot('A-dialogue-hold.png');
    await click('undo');
    assert.equal((await state()).duration,5);
    assert.equal((await state()).project.show.atoms[1].timing_hold,undefined);
    assert.equal((await state()).project.show.atoms[1].camera.params.s.a,1.01);
    assert.match(await p.locator('#timelineCount').textContent(),/5\.00s/);
    await p.click('.timeline-clip[data-index="2"]');await settle();
    await p.selectOption('#timingPack','micro_cut_flurry');
    assert.equal(await p.locator('#timingSoftCam').isDisabled(),true);
    await click('applyTimingPack');
    let cutAtoms=(await state()).project.show.atoms;
    assert.equal(cutAtoms[2].duration_s,0.12);
    assert.equal(cutAtoms[2].camera.preset,'ecu_jitter');
    assert.equal(cutAtoms[2].timing_hold.kind,'micro_cut');
    assert.deepEqual(impactDurations(cutAtoms),[0.5,0.75,0.75,1]);
    let cutState=await state();
    assert.equal(cutState.duration,4.62);
    assert.equal(cutState.composed.duration_s,4.62);
    assert.ok(Math.abs((cutState.composed.timeline.plates[2].t1-cutState.composed.timeline.plates[2].t0)-0.12)<1e-4);
    assert.match(await p.locator('#stageLabel').textContent(),/Straight/);
    assert.match(await p.locator('#timingPackHint').textContent(),/On this clip: micro cut/);
    await holdShot('B-micro-cut.png');
    await click('undo');
    assert.equal((await state()).duration,5);
    await p.click('.timeline-clip[data-index="0"]');await settle();
    await p.selectOption('#timingPack','micro_cut_flurry');
    await click('applyTimingPack');
    let impactAtoms=(await state()).project.show.atoms;
    assert.equal(impactAtoms[0].duration_s,1.2);
    assert.equal(impactAtoms[0].camera.preset,'static_hold');
    assert.equal(impactAtoms[0].camera.params,undefined);
    assert.equal(impactAtoms[0].timing_hold.kind,'impact_hold');
    assert.equal(impactAtoms[4].duration_s,0.75);
    assert.equal(impactAtoms[6].duration_s,0.75);
    assert.equal(impactAtoms[7].duration_s,1);
    let impactState=await state();
    assert.equal(impactState.duration,5.7);
    assert.equal(impactState.composed.duration_s,5.7);
    assert.equal(impactState.composed.timeline.plates[0].t1,1.2);
    assert.match(await p.locator('#stageLabel').textContent(),/Opening clash/);
    assert.match(await p.locator('#timingPackHint').textContent(),/On this clip: impact hold/);
    await holdShot('C-impact-hold.png');
    await p.click('#exportOpen');
    const timingPath=await downloadFrom('exportTiming','hm-dialogue-hold-timing.json');
    const timingDump=JSON.parse(fs.readFileSync(timingPath,'utf8'));
    assert.equal(timingDump.kind,'hm-timing-export');
    assert.equal(timingDump.presets.id,'street_timing');
    assert.equal(timingDump.presets.packs[0].id,'dialogue_film_slow');
    assert.equal(timingDump.presets.packs[1].id,'micro_cut_flurry');
    assert.equal(timingDump.frame_seq.fps,24);
    assert.equal(timingDump.frame_seq.cuts.length,8);
    assert.equal(timingDump.frame_seq.cuts[0].dur_s,1.2);
    assert.equal(timingDump.frame_seq.cuts[0].timing_hold.kind,'impact_hold');
    assert.ok(timingDump.frame_seq.cuts[0].frames>timingDump.frame_seq.cuts[1].frames);
    await p.getByRole('button',{name:'Close export',exact:true}).click();
    await click('undo');
    assert.equal((await state()).duration,5);
    assert.equal((await state()).project.show.atoms[0].duration_s,0.5);
    check('HM-DIALOGUE-HOLD: selected clip film-slow hold and micro-cut preview match, undo restores the 5.00s fight, and unselected impacts stay put');
    await p.click('#loadDemo');await p.waitForFunction(()=>HMStudio.project.show.show_id==='daiyu-wang-five-seconds');await settle();
    // HM-CAM-10R: beat-tick marks follow fx_hooks[].t_rel and are a different UI from Fit 3/5/8/10 chips.
    {
      const crypto=require('node:crypto');
      const proofDir=path.resolve('docs/proof/hm-cam-10r');
      fs.mkdirSync(proofDir,{recursive:true});
      await p.evaluate(()=>HMStudio.editProject(project=>{project.show.atoms.forEach(a=>{a.fx_hooks=[];});}));
      await settle();
      assert.equal(await p.locator('.beat-tick').count(),0,'a clip with no hooks shows no beat ticks');
      const hooks=[
        {type:'hit_orange',t_rel:0.15},
        {type:'shake',t_rel:0.5,params:{amp:5,dur:0.1}},
        {type:'flash_orange',t_rel:0.85}
      ];
      await p.evaluate(next=>HMStudio.editProject(project=>{project.show.atoms[0].fx_hooks=next;}),hooks);
      await settle();
      const measured=await p.locator('.timeline-clip[data-index="0"]').evaluate(clip=>{
        const w=clip.clientWidth;
        return [...clip.querySelectorAll('.beat-tick')].map(el=>({
          tag:el.tagName,
          type:el.dataset.type,
          tRel:+el.dataset.tRel,
          leftPct:parseFloat(el.style.left),
          ratio:el.offsetLeft/w,
          inFit:!!el.closest('.fit-chips')
        }));
      });
      assert.equal(measured.length,hooks.length);
      hooks.forEach((hk,i)=>{
        assert.equal(measured[i].tag,'SPAN');
        assert.equal(measured[i].type,hk.type);
        assert.equal(measured[i].inFit,false);
        assert.ok(Math.abs(measured[i].tRel-hk.t_rel)<1e-9,JSON.stringify(measured[i]));
        assert.ok(Math.abs(measured[i].leftPct-hk.t_rel*100)<0.05,JSON.stringify(measured[i]));
        assert.ok(Math.abs(measured[i].ratio-hk.t_rel)<0.04,JSON.stringify(measured[i]));
      });
      const fit=await p.locator('.fit-chips button').evaluateAll(els=>els.map(el=>({id:el.id,fit:el.dataset.fit,tag:el.tagName,text:el.textContent.trim(),hasTick:!!el.querySelector('.beat-tick')})));
      assert.deepEqual(fit.map(b=>[b.id,b.fit,b.text]),[['fitThree','3','Fit 3s'],['fitFive','5','Fit to 5 seconds'],['fitEight','8','Fit 8s'],['fitTen','10','Fit 10s']]);
      assert.ok(fit.every(b=>b.tag==='BUTTON'&&b.hasTick===false));
      assert.equal(await p.locator('.fit-chips .beat-tick').count(),0);
      assert.equal(await p.locator('.beat-tick').evaluateAll(els=>els.every(el=>!!el.closest('.timeline-clip')&&!el.closest('.fit-chips'))),true);
      const tickBox=await p.locator('.timeline-clip[data-index="0"] .beat-tick').first().boundingBox();
      const fitBox=await p.locator('.fit-chips').boundingBox();
      assert.ok(tickBox&&fitBox&&tickBox.y+tickBox.height<=fitBox.y+1,'beat ticks sit on the clip, above the Fit chips');
      const composed=await p.evaluate(()=>{
        const atom=HMStudio.composed.timeline.atoms[0];
        return {t0:atom.t0,d:HMStudio.project.show.atoms[0].duration_s,rel:atom.fx_hooks.map(h=>h.t_rel),hits:HMStudio.composed.timeline.fx.hits.map(h=>h[0]),flash:HMStudio.composed.timeline.fx.flash.map(h=>h[0]),shake:HMStudio.composed.timeline.fx.shake.map(h=>h[0])};
      });
      assert.deepEqual(composed.rel,[0.15,0.5,0.85]);
      const expectT=rel=>Math.round((composed.t0+rel*composed.d)*10000)/10000;
      assert.ok(composed.hits.includes(expectT(0.15)),JSON.stringify(composed));
      assert.ok(composed.shake.includes(expectT(0.5)),JSON.stringify(composed));
      assert.ok(composed.flash.includes(expectT(0.85)),JSON.stringify(composed));
      const ticksPath=path.join(proofDir,'ticks-at-hooks.png');
      const fitPath=path.join(proofDir,'fit-chips.png');
      await p.locator('#timelineTrack').screenshot({path:ticksPath});
      await p.locator('.fit-chips').screenshot({path:fitPath});
      const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      const tickSha=sha(ticksPath),fitSha=sha(fitPath);
      assert.notEqual(tickSha,fitSha,'tick capscreen must differ from the Fit chips capscreen');
      for(const [id,target] of [['fitThree',3],['fitEight',8],['fitTen',10],['fitFive',5]]){
        await click(id);
        assert.equal((await state()).duration,target);
        const marks=await p.locator('.timeline-clip[data-index="0"] .beat-tick').evaluateAll(els=>els.map(el=>({tRel:+el.dataset.tRel,leftPct:parseFloat(el.style.left)})));
        assert.deepEqual(marks,[{tRel:0.15,leftPct:15},{tRel:0.5,leftPct:50},{tRel:0.85,leftPct:85}]);
      }
      fs.writeFileSync(path.join(proofDir,'proof.json'),JSON.stringify({story:'HM-CAM-10R',hooks,measured,fit,composedTimes:{hit:expectT(0.15),shake:expectT(0.5),flash:expectT(0.85)},tickSha256:tickSha,fitSha256:fitSha,distinct:tickSha!==fitSha},null,2));
      await p.click('#loadDemo');await p.waitForFunction(()=>HMStudio.project.show.show_id==='daiyu-wang-five-seconds');await settle();
      check('HM-CAM-10R: beat ticks follow fx_hooks t_rel and stay distinct from Fit 3/5/8/10 chips');
    }
    assert.equal(await p.locator('.library').getAttribute('data-parity'),'true');
    assert.equal(await p.locator('#mediaGrid').isHidden(),true);
    assert.equal(await p.locator('#parityPickerNote').isVisible(),true);
    assert.equal(await p.locator('#charNameL').textContent(),'Lin Daiyu');
    assert.equal(await p.locator('#charNameR').textContent(),'Wang Xifeng');
    assert.match(await p.locator('#charHonestyNote').textContent(),/unsided/);
    assert.equal(await p.locator('#dirtyChecklist').isHidden(),true);
    assert.equal(await p.evaluate(()=>HMStudio.dirtyChecklist.clean),true);
    await p.click('#togglePlatePicker');await settle();
    assert.equal(await p.locator('#mediaGrid').isHidden(),false);
    assert.equal(await p.locator('.media-card').count(),8);
    await p.click('#togglePlatePicker');
    assert.equal(await p.locator('#mediaGrid').isHidden(),true);
    check('HM-P2-PARITY: plate-pack hides the picker and inspector L/R labels match show.chars');
    await p.evaluate(async()=>{
      const current=HMStudio.project;
      const show=structuredClone(current.show);
      show.show_id='library-plain-show';
      show.parity_mode=false;
      delete show.compose_mode;
      delete show.plate_pack;
      show.atoms=show.atoms.slice(0,2);
      await HMStudio.load({version:1,show,layouts:current.layouts,media:current.media,assets:current.assets||{}});
    });
    await settle();
    assert.equal(await p.locator('.library').getAttribute('data-parity'),'false');
    assert.equal(await p.locator('#mediaGrid').isHidden(),false);
    assert.equal(await p.locator('#parityPickerNote').isHidden(),true);
    assert.equal(await p.locator('#charHonesty').isHidden(),true);
    assert.equal(await p.locator('#dirtyChecklist').isHidden(),true);
    assert.equal(await p.evaluate(()=>HMStudio.dirtyChecklist.active),false);
    check('HM-P2-PARITY: non-parity shows keep the picker and skip the parity checklist');
    const dirtyLoad=await p.evaluate(async()=>{
      const current=HMStudio.project;
      const show=structuredClone(current.show);
      show.show_id='parity-dirty-check';
      show.title='Dirty parity check';
      show.parity_mode=true;
      show.compose_mode='parity';
      show.chars={L:{name:'Left Fighter'},R:{name:'Right Fighter'}};
      show.atoms=[structuredClone(show.atoms[0])];
      show.atoms[0].plates_needed=1;
      show.atoms[0].hero.plates=['P01'];
      show.bg={swap_t:1};
      show.overlays=[{id:'badge',kind:'image',src:'../secret.png',t_start:0,t_end:0.2}];
      const key=show.atoms[0].hero.layout_source;
      const layouts=structuredClone(current.layouts);
      layouts[key]={P01:{}};
      try{
        await HMStudio.load({version:1,show,layouts,media:[],assets:{}});
        return 'loaded';
      }catch(e){return e.message;}
    });
    assert.match(String(dirtyLoad),/Compose blocked/);
    assert.equal(await p.locator('#charNameL').textContent(),'Left Fighter');
    assert.equal(await p.locator('#charNameR').textContent(),'Right Fighter');
    const dirtyText=await p.locator('#dirtyChecklist').innerText();
    assert.match(dirtyText,/Missing plate/);
    assert.match(dirtyText,/Broken BG/);
    assert.match(dirtyText,/Unresolved asset/);
    assert.equal(await p.locator('#dirtyChecklist').getAttribute('data-state'),'block');
    await p.click('#exportOpen');
    assert.equal(await p.locator('#exportHtml').isDisabled(),true);
    assert.match(await p.locator('#exportStatus').textContent(),/Checklist blocked export/);
    await p.evaluate(()=>{document.getElementById('exportHtml').disabled=false;});
    let dirtyDownloaded=false;
    const dirtyDownload=p.waitForEvent('download',{timeout:1500}).then(()=>{dirtyDownloaded=true;}).catch(()=>{});
    await p.click('#exportHtml');
    await p.waitForFunction(()=>/Checklist blocked export/.test(document.getElementById('exportStatus').textContent));
    await dirtyDownload;
    assert.equal(dirtyDownloaded,false);
    await p.getByRole('button',{name:'Close export',exact:true}).click();
    check('HM-P2-PARITY: missing plate, broken BG, and unresolved asset block export');
    await p.click('#loadDemo');await p.waitForFunction(()=>HMStudio.project.show.show_id==='daiyu-wang-five-seconds'&&HMStudio.duration===5);await settle();
    assert.match(await p.locator('#loadStreet').innerText(),/Open street sample/);
    const streetDirect=await context.newPage();
    await streetDirect.goto(base+'/ui/?show=street-old-city');
    await streetDirect.evaluate(()=>window.ready);
    await streetDirect.waitForFunction(()=>HMStudio.project.show.show_id==='street-old-city'&&HMStudio.duration===5&&HMStudio.composed&&HMStudio.composed.stats.plates===8);
    await streetDirect.close();
    await p.click('#loadStreet');await p.waitForFunction(()=>HMStudio.project.show.show_id==='street-old-city'&&HMStudio.composed&&HMStudio.composed.stats.plates===8);await settle();
    assert.equal((await state()).duration,5);
    assert.deepEqual(Object.values((await state()).composed.layout).map(l=>l.source_plate),['P09','P10','P11','P12','P13','P14','P15','P16']);
    assert.equal((await state()).composed.timeline.bg.base,'assets/daiyu-wang-continuation/rooftop-dusk.png');
    assert.deepEqual(failed.filter(x=>/teqcon|:8770/.test(x)),[]);
    await p.click('#exportOpen');
    const streetHtml=await downloadFrom('exportHtml','street-old-city.html');
    await p.getByRole('button',{name:'Close export',exact:true}).click();
    const streetOffline=await browser.newPage();
    const streetNet=[];
    await streetOffline.route('http://**',r=>{streetNet.push(r.request().url());r.abort();});
    await streetOffline.route('https://**',r=>{streetNet.push(r.request().url());r.abort();});
    await streetOffline.goto('file://'+streetHtml);
    await streetOffline.evaluate(()=>window.ready);
    await streetOffline.evaluate(()=>renderAt(2.5));
    assert.match(await streetOffline.locator('#time').textContent(),/2.50 \/ 5.00/);
    assert.match(await streetOffline.locator('#title').textContent(),/Old-city street/);
    assert.deepEqual(streetNet,[]);
    await streetOffline.close();
    check('Open street sample loads existing art on /ui/ and playable HTML works offline');
    await p.click('#loadDemo');await p.waitForFunction(()=>HMStudio.project.show.show_id==='daiyu-wang-five-seconds');await settle();
    await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(out,'mobile.png'),fullPage:true});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.click('#play');await p.waitForTimeout(100);await p.click('#play');check('mobile layout has no horizontal overflow and playback works');
    const player=await context.newPage();await player.goto(base+'/player/?show=daiyu-wang-five-seconds');await player.evaluate(()=>window.ready);await player.click('#play');await player.waitForTimeout(150);await player.click('#play');const t=await player.locator('#time').textContent();await player.waitForTimeout(150);assert.equal(await player.locator('#time').textContent(),t);await player.close();check('standalone player play/pause is a real transport');
    assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);check('zero uncaught browser errors or failed asset requests');
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors,failed},null,2));
  } finally {await browser.close();srv?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

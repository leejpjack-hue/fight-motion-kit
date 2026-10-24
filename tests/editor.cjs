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
    await p.click('#exportOpen');const htmlPath=await downloadFrom('exportHtml','daiyu-wang-five-seconds.html');const framePath=await downloadFrom('exportFrame','frame.png');assert.ok(fs.statSync(framePath).size>10000);
    const offline=await browser.newPage();const external=[];await offline.route('http://**',r=>{external.push(r.request().url());r.abort();});await offline.route('https://**',r=>{external.push(r.request().url());r.abort();});await offline.goto('file://'+htmlPath);await offline.evaluate(()=>window.ready);await offline.evaluate(()=>renderAt(4.5));assert.match(await offline.locator('#time').textContent(),/4.50 \/ 5.00/);assert.deepEqual(external,[]);await offline.close();check('self-contained HTML plays offline and PNG export works');
    const video=await downloadFrom('exportVideo','daiyu-wang-five-seconds.webm');assert.ok(fs.statSync(video).size>10000);await p.getByRole('button',{name:'Close export',exact:true}).click();check('five-second video recording downloads a nonempty video');
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
    assert.match(fs.readFileSync(motionHtml,'utf8'),/function backgroundMotionFrame/);
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
    await p.click('#loadDemo');await p.waitForFunction(()=>HMStudio.project.show.show_id==='daiyu-wang-five-seconds');await settle();await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(out,'mobile.png'),fullPage:true});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.click('#play');await p.waitForTimeout(100);await p.click('#play');check('mobile layout has no horizontal overflow and playback works');
    const player=await context.newPage();await player.goto(base+'/player/?show=daiyu-wang-five-seconds');await player.evaluate(()=>window.ready);await player.click('#play');await player.waitForTimeout(150);await player.click('#play');const t=await player.locator('#time').textContent();await player.waitForTimeout(150);assert.equal(await player.locator('#time').textContent(),t);await player.close();check('standalone player play/pause is a real transport');
    assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);check('zero uncaught browser errors or failed asset requests');
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors,failed},null,2));
  } finally {await browser.close();srv?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

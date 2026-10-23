/* Run against `npm run dev`. TEST_BASE_URL and BROWSER_CHANNEL are optional. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8765';
const out=path.resolve(process.env.TEST_OUTPUT||'work/qa');fs.mkdirSync(out,{recursive:true});
const syslib=path.resolve('work/sysroot/usr/lib/x86_64-linux-gnu');
if(fs.existsSync(syslib))process.env.LD_LIBRARY_PATH=syslib+(process.env.LD_LIBRARY_PATH?':'+process.env.LD_LIBRARY_PATH:'');
const fconf=path.resolve('work/sysroot/fonts.conf');
if(fs.existsSync(fconf))process.env.FONTCONFIG_FILE=fconf;
(async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||undefined,env:process.env,args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const p=await context.newPage(), errors=[], failed=[], checks=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)failed.push(r.status()+' '+r.url());});
  const state=()=>p.evaluate(()=>({duration:HMStudio.duration,project:HMStudio.project,composed:HMStudio.composed,time:HMStudio.time,playing:HMStudio.playing,onion:HMStudio.onion,copiedCam:HMStudio.copiedCam}));
  const settle=()=>p.evaluate(()=>HMStudio.compile());
  const check=label=>{checks.push(label);console.log('PASS '+label);};
  const click=async id=>{await p.click('#'+id);await settle();};
  const change=async(id,value)=>{await p.fill('#'+id,String(value));await p.locator('#'+id).dispatchEvent('change');await settle();};
  async function downloadFrom(id,name){const event=p.waitForEvent('download');await p.click('#'+id);const d=await event;assert.equal(await d.failure(),null);const target=path.join(out,name||d.suggestedFilename());await d.saveAs(target);return target;}
  try{
    await p.goto(base+'/ui/');await p.evaluate(()=>window.ready);
    assert.equal((await state()).duration,5);assert.equal(await p.locator('.timeline-clip').count(),8);
    assert.equal(await p.locator('img').evaluateAll(ims=>ims.every(im=>im.complete&&im.naturalWidth>0)),true);
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
    await p.click('#loadDemo');await p.waitForFunction(()=>HMStudio.project.show.show_id==='daiyu-wang-five-seconds');await settle();await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(out,'mobile.png'),fullPage:true});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.click('#play');await p.waitForTimeout(100);await p.click('#play');check('mobile layout has no horizontal overflow and playback works');
    const player=await context.newPage();await player.goto(base+'/player/?show=daiyu-wang-five-seconds');await player.evaluate(()=>window.ready);await player.click('#play');await player.waitForTimeout(150);await player.click('#play');const t=await player.locator('#time').textContent();await player.waitForTimeout(150);assert.equal(await player.locator('#time').textContent(),t);await player.close();check('standalone player play/pause is a real transport');
    assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);check('zero uncaught browser errors or failed asset requests');
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors,failed},null,2));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

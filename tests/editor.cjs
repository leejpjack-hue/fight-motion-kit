/* Run against `npm run dev`. TEST_BASE_URL and BROWSER_CHANNEL are optional. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8765';
const out=path.resolve(process.env.TEST_OUTPUT||'work/qa');fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||undefined});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const p=await context.newPage(), errors=[], failed=[], checks=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)failed.push(r.status()+' '+r.url());});
  const state=()=>p.evaluate(()=>({duration:HMStudio.duration,project:HMStudio.project,composed:HMStudio.composed,time:HMStudio.time,playing:HMStudio.playing}));
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
    await p.click('#restart');assert.equal((await state()).time,0);await p.click('#next');assert.equal((await state()).time,.5);await p.click('#previous');assert.equal((await state()).time,0);await p.click('#loop');assert.equal(await p.locator('#loop').getAttribute('aria-pressed'),'true');await p.click('#loop');check('scrub, restart, previous/next and loop toggle');
    await p.click('#fullscreen');await p.waitForFunction(()=>!!document.fullscreenElement);await p.evaluate(()=>document.exitFullscreen());await p.locator('#stage').click();await p.keyboard.press('Space');await p.waitForFunction(()=>HMStudio.time>0.05);await p.keyboard.press('Space');assert.equal((await state()).playing,false);await p.click('#restart');await click('longer');assert.equal((await state()).duration,5.1);await click('shorter');assert.equal((await state()).duration,5);check('fullscreen, keyboard playback and duration stepper');
    await change('duration',.625);assert.equal((await state()).duration,5.125);await click('undo');assert.equal((await state()).duration,5);await click('redo');assert.equal((await state()).duration,5.125);check('fractional clip timing and undo/redo');
    await p.selectOption('#camera','slow_push');await change('panX',10);await p.fill('#zoom','0.1');await p.locator('#zoom').dispatchEvent('change');await settle();let a=(await state()).project.show.atoms[0];assert.equal(a.camera.preset,'slow_push');assert.equal(a.camera.nudge.x,10);assert.equal(a.camera.nudge.s,.1);await click('resetCamera');assert.deepEqual((await state()).project.show.atoms[0].camera,{preset:'static_hold'});
    await p.click('[data-effect="hit_orange"]');await change('caption','CLASH');assert.equal((await state()).composed.timeline.overlays[0].text,'CLASH');assert.equal((await state()).composed.timeline.fx.hits.length,1);check('camera, zoom, pan, reset, effect and caption settings');
    await click('duplicate');assert.equal(await p.locator('.timeline-clip').count(),9);await click('delete');assert.equal(await p.locator('.timeline-clip').count(),8);
    const first=(await state()).project.show.atoms[0].id;await p.dragAndDrop('.timeline-clip[data-index="0"]','.timeline-clip[data-index="1"]');await settle();assert.equal((await state()).project.show.atoms[1].id,first);check('duplicate, delete and drag reorder');
    await click('replaceImage');await p.getByRole('button',{name:'Use P08 in selected clip',exact:true}).click();await settle();assert.equal((await state()).project.show.atoms[1].hero.plates[0],'P08');
    await p.getByRole('button',{name:'Add P01 to timeline',exact:true}).click();await settle();assert.equal(await p.locator('.timeline-clip').count(),9);await p.fill('#mediaSearch','P08');assert.equal(await p.locator('.media-card').count(),1);await p.fill('#mediaSearch','');await click('fitFive');assert.equal((await state()).duration,5);check('replace plate, add clip, library search and fit-to-five');
    await p.click('#loadDemo');await p.waitForFunction(()=>HMStudio.project.show.show_id==='daiyu-wang-five-seconds');await settle();
    await p.click('#helpOpen');assert.equal(await p.locator('#helpDialog').evaluate(d=>d.open),true);await p.getByRole('button',{name:'Close shortcuts'}).click();check('keyboard shortcut dialog');
    const portablePath=await downloadFrom('saveProject','portable.motion.json');const portable=JSON.parse(fs.readFileSync(portablePath));assert.ok(Object.values(portable.assets).every(x=>x.startsWith('data:image/')));assert.equal(portable.media.length,8);
    await change('projectTitle','Changed title');await p.setInputFiles('#projectInput',portablePath);await p.waitForFunction(()=>HMStudio.project.show.title.includes('First exchange'));await settle();assert.equal((await state()).duration,5);check('portable project download and reopen with embedded images');
    await p.click('#exportOpen');const htmlPath=await downloadFrom('exportHtml','daiyu-wang-five-seconds.html');const framePath=await downloadFrom('exportFrame','frame.png');assert.ok(fs.statSync(framePath).size>100000);
    const offline=await browser.newPage();const external=[];await offline.route('http://**',r=>{external.push(r.request().url());r.abort();});await offline.route('https://**',r=>{external.push(r.request().url());r.abort();});await offline.goto('file://'+htmlPath);await offline.evaluate(()=>window.ready);await offline.evaluate(()=>renderAt(4.5));assert.match(await offline.locator('#time').textContent(),/4.50 \/ 5.00/);assert.deepEqual(external,[]);await offline.close();check('self-contained HTML plays offline and PNG export works');
    const video=await downloadFrom('exportVideo','daiyu-wang-five-seconds.webm');assert.ok(fs.statSync(video).size>100000);await p.getByRole('button',{name:'Close export',exact:true}).click();check('five-second video recording downloads a nonempty video');
    await p.click('#loadOriginal');await p.waitForFunction(()=>HMStudio.project.show.show_id==='daiyu-wang-codex-import');await settle();assert.equal((await state()).duration,31.5);assert.equal((await state()).composed.timeline.plates.length,63);check('original rooftop show still loads all 63 plates');
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

/* Run against an existing loopback server with TEST_BASE_URL.
 * Uses a disposable context and requires Chromium's native sandbox. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8765';
// Complete FINAL writer shape, TRANSPORT ONLY.
const fixture=require('./fixtures/sg01-final.cjs').finalTransport();
const png=fixture.png,json=fixture.json;
const pair=[{name:'numbered.png',mimeType:'image/png',buffer:png},{name:'numbered.json',mimeType:'application/json',buffer:json}];
(async()=>{
  const browser=await chromium.launch({headless:true,chromiumSandbox:true});
  try{
    const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage(),errors=[],external=[];
    page.on('pageerror',e=>errors.push(e.message));
    context.on('request',request=>{
      if(new URL(request.url()).origin!==new URL(base).origin)external.push(request.url());
    });
    await page.goto(base+'/ui/');await page.evaluate(()=>window.ready);
    assert.equal(await page.evaluate(()=>HMStudio.duration),5);
    assert.equal(await page.locator('.timeline-clip').count(),8);
    const before=await page.evaluate(async()=>({project:HMStudio.project,saved:await HMAssetStore.get('active')}));
    async function stage(){await page.click('#importStrip');await page.setInputFiles('#stripInput',pair);await page.waitForFunction(()=>!document.getElementById('commitStrip').disabled);}
    await stage();await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(()=>HMStudio.project),before.project);
    assert.deepEqual(await page.evaluate(()=>HMAssetStore.get('active')),before.saved);
    await stage();
    // Delay the gateway's write, then let the actual IDB transaction finish.
    await page.evaluate(()=>{
      window.sgPut=HMAssetStore.put;
      HMAssetStore.put=async(...args)=>{await new Promise(resolve=>window.sgRelease=resolve);return sgPut(...args);};
    });
    await page.click('#commitStrip');await page.waitForFunction(()=>typeof window.sgRelease==='function');
    assert.equal(await page.evaluate(()=>HMStudio.pendingCommit),true);
    assert.deepEqual(await page.evaluate(()=>HMStudio.project),before.project);
    assert.deepEqual(await page.evaluate(()=>HMAssetStore.get('active')),before.saved);
    await page.keyboard.press('Escape');assert.equal(await page.locator('#stripDialog').evaluate(e=>e.open),true);
    const locked=await page.evaluate(async()=>{
      const out=[];
      for(const action of [()=>HMStudio.editProject(p=>p.show.title='race'),()=>HMStudio.load(HMStudio.project),()=>HMStudio.openProject(Promise.resolve(HMStudio.project))]){
        try{await action();out.push(false);}catch(e){out.push(/transaction/.test(e.message));}
      }
      return out;
    });
    assert.deepEqual(locked,[true,true,true]);
    await page.evaluate(()=>{HMAssetStore.put=sgPut;sgRelease();});
    await page.waitForFunction(()=>!HMStudio.pendingCommit&&!document.getElementById('stripDialog').open);
    const imported=await page.evaluate(async()=>({project:HMStudio.project,saved:await HMAssetStore.get('active')}));
    assert.deepEqual(imported.saved,imported.project);
    const m=imported.project.media.find(m=>m.pendingMotion);assert.ok(m);
    assert.equal(m.pendingMotion.policy.endFrame,3);assert.equal(m.pendingMotion.policy.loop,true);
    assert.deepEqual(Buffer.from(m.pendingMotion.originalJsonBase64,'base64'),json);
    assert.deepEqual(Buffer.from(imported.project.assets[m.src].slice(22),'base64'),png);
    assert.equal(await page.locator('[data-pending-motion="true"] button').count(),0);
    // Actual edit guard, real compose output and ordinary export entry point.
    assert.equal(await page.evaluate(()=>{
      const m=HMStudio.project.media.find(m=>m.pendingMotion);
      try{HMStudio.editProject(p=>p.show.bg.base=m.src);return false;}catch(e){return /NOT PLAYABLE/.test(e.message);}
    }),true);
    const composed=await page.evaluate(()=>HMStudio.compile());
    assert.equal(JSON.stringify(composed).includes(m.src),false);
    const downloadEvent=page.waitForEvent('download');await page.click('#saveProject');
    const download=await downloadEvent,stream=await download.createReadStream(),parts=[];
    for await(const part of stream)parts.push(part);
    const portable=JSON.parse(Buffer.concat(parts).toString('utf8'));
    assert.deepEqual(portable.media.find(x=>x.id===m.id).pendingMotion,m.pendingMotion);
    assert.equal(portable.assets[m.src],imported.project.assets[m.src]);
    await page.reload();await page.evaluate(()=>window.ready);
    assert.deepEqual(await page.evaluate(()=>HMStudio.project),imported.project);
    // Reopening the downloaded complete project exercises real File API + decode.
    await page.setInputFiles('#projectInput',{name:'roundtrip.motion.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(portable))});
    await page.waitForFunction(()=>!HMStudio.loading);
    assert.equal(await page.evaluate(()=>HMStudio.project.media.filter(m=>m.pendingMotion).length),1);
    // Abort a real IDB transaction after put. No simulated store success/failure.
    await page.evaluate(()=>{
      window.sgTransaction=IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction=function(...args){
        const tx=sgTransaction.apply(this,args);
        if(args[1]==='readwrite')queueMicrotask(()=>tx.abort());
        return tx;
      };
    });
    await stage();const old=await page.evaluate(()=>HMStudio.project);
    await page.click('#commitStrip');await page.waitForFunction(()=>document.getElementById('stripStatus').textContent.includes('was not imported'));
    await page.evaluate(()=>{IDBDatabase.prototype.transaction=sgTransaction;});
    assert.deepEqual(await page.evaluate(()=>HMStudio.project),old);
    assert.deepEqual(await page.evaluate(()=>HMAssetStore.get('active')),old);
    assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
    console.log('PASS SG01 browser: real decode/DOM, durable publication, portable reopen, IDB abort, pending guards, no external requests');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

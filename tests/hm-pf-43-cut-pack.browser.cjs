/* HM-PF-43 browser check — HF-08 cut pack apply from the rhythm/compose flow.
 * Standalone like tests/sg01-browser.cjs: runs against a loopback static
 * server (starts one against public/ if TEST_BASE_URL is not up).
 * Covers what tests/editor.cjs also asserts inline, without needing the full
 * E2E suite (which currently aborts earlier on a pre-existing cam-chain
 * assertion, present on pristine origin/main too). */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8765';
const out=path.resolve('docs/proof/hm-pf-43');
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
  const browser=await chromium.launch({headless:true,chromiumSandbox:true,args:['--disable-dev-shm-usage','--disable-gpu']});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const state=()=>page.evaluate(()=>({duration:HMStudio.duration,project:HMStudio.project,composed:HMStudio.composed}));
    const settle=async()=>{await page.waitForFunction(()=>!HMStudio.loading);return page.evaluate(()=>HMStudio.compile());};
    await page.goto(base+'/ui/');await page.evaluate(()=>window.ready);
    assert.equal((await state()).duration,5);
    assert.equal(await page.locator('.timeline-clip').count(),8);

    // Cycle mode over a shift-range selection of clips 1..3.
    await page.click('.timeline-clip[data-index="1"]');await settle();
    await page.click('.timeline-clip[data-index="3"]',{modifiers:['Shift']});await settle();
    assert.equal(await page.locator('.timeline-clip.in-range').count(),3);
    await page.selectOption('#cutPackMode','cycle');
    assert.match(await page.locator('#cutPackHint').textContent(),/freeze hold → white flash → whip cut/);
    // The apply status lands synchronously; the async compile then rewrites #status
    // ("Ready · 5.00s · …"), so click and read it in the same JS task.
    const applyStatus=await page.evaluate(()=>{
      document.getElementById('applyCutPack').click();
      return document.getElementById('status').textContent;
    });
    assert.match(applyStatus,/Cut pack · freeze_hold → white_flash → whip_cut on 3 clips · Undo restores/);
    await settle();
    let atoms=(await state()).project.show.atoms;
    assert.equal('cut' in atoms[0],false);
    assert.deepEqual(atoms[1].cut,{preset:'freeze_hold',dur_s:0.12,hold_s:0.12,dir:1});
    assert.deepEqual(atoms[2].cut,{preset:'white_flash',dur_s:0.08,hold_s:0,dir:1});
    assert.deepEqual(atoms[3].cut,{preset:'whip_cut',dur_s:0.10,hold_s:0,dir:1});
    const applied=await state();
    assert.equal(applied.duration,5); // cuts add no time
    assert.equal(applied.composed.duration_s,5);
    assert.equal(applied.composed.timeline.plates.length,8);
    assert.deepEqual(applied.composed.timeline.cuts.map(c=>[c.preset,c.index]),[['freeze_hold',1],['white_flash',2],['whip_cut',3]]);
    fs.mkdirSync(out,{recursive:true});
    await page.screenshot({path:path.join(out,'ui-apply-cut-pack.png'),fullPage:true});

    // The per-clip Cut-in form refreshes to the stamped cut.
    await page.click('.timeline-clip[data-index="2"]');await settle();
    assert.equal(await page.locator('#cutPreset').inputValue(),'white_flash');

    // Undo is a normal edit snapshot — no new undo stack.
    await page.click('#undo');await settle();
    assert.equal((await state()).project.show.atoms.some(a=>a.cut),false);
    assert.equal((await state()).duration,5);

    // Single-preset mode stamps one gold preset on the selection.
    await page.click('.timeline-clip[data-index="2"]');await settle();
    await page.selectOption('#cutPackMode','whip_cut');
    await page.click('#applyCutPack');await settle();
    atoms=(await state()).project.show.atoms;
    assert.equal(atoms.some((a,i)=>a.cut&&i!==2),false);
    assert.deepEqual(atoms[2].cut,{preset:'whip_cut',dur_s:0.10,hold_s:0,dir:1});
    assert.match(await page.locator('#cutPackHint').textContent(),/Whip cut on every selected entering clip/);
    await page.click('#undo');await settle();

    // Honest failure: the first clip has no incoming boundary. The refusal
    // status persists (no compile runs), but read it in the click task anyway.
    await page.click('.timeline-clip[data-index="0"]');await settle();
    const refusalStatus=await page.evaluate(()=>{
      document.getElementById('applyCutPack').click();
      return document.getElementById('status').textContent;
    });
    assert.match(refusalStatus,/entering clips \(i >= 1\)/);
    await settle();
    assert.equal((await state()).project.show.atoms.some(a=>a.cut),false);

    assert.deepEqual(errors,[]);
    console.log('PASS HM-PF-43: cut pack apply from compose/rhythm UI (cycle + single preset), Cut-in refresh, undo restore, first-clip refusal)');
  }finally{
    await browser.close();
  }
})().catch(e=>{console.error(e);process.exit(1);});

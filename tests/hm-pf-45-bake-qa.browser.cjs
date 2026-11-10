/* HM-PF-45 browser check — bake QA dock reuses HF-01 peek and HF-02 scrub.
 * Covers the 5.00s demo, the pose-ref plate show, and a pending imported strip.
 * Starts a loopback server when 127.0.0.1:8765 is down. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const zlib=require('node:zlib');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8765';
const out=path.resolve('docs/proof/hm-pf-45');
const MIMES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};

function chunk(type,data){
  const table=chunk.table||(chunk.table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;}));
  const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);
  let crc=0xffffffff;for(let i=4;i<b.length-4;i++)crc=table[(crc^b[i])&255]^(crc>>>8);
  b.writeUInt32BE((crc^0xffffffff)>>>0,b.length-4);return b;
}
function stripPng(){
  const width=8,height=2,colors=[[220,20,20],[20,180,40],[20,40,220],[240,240,240]];
  const rows=Buffer.alloc((width*3+1)*height);
  for(let y=0;y<height;y++){
    const row=y*(width*3+1);
    rows[row]=0;
    for(let x=0;x<width;x++){
      const rgb=colors[Math.floor(x/2)];
      const o=row+1+x*3;
      rows[o]=rgb[0];rows[o+1]=rgb[1];rows[o+2]=rgb[2];
    }
  }
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}

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
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('dialog',dialog=>dialog.accept());
    const settle=async()=>{await page.waitForFunction(()=>!HMStudio.loading);return page.evaluate(()=>HMStudio.compile());};
    await page.goto(base+'/ui/');
    await page.evaluate(()=>window.ready);
    await settle();
    assert.equal(await page.evaluate(()=>HMStudio.project.show.show_id),'daiyu-wang-five-seconds');
    assert.equal(await page.evaluate(()=>HMStudio.duration),5);

    await page.click('#openBakeQa');
    await page.waitForSelector('#exportDialog[open] #bakeQaDock');
    assert.equal(await page.locator('#bakeQaDock').getAttribute('data-clock'),'renderAt');
    assert.equal(await page.locator('#bakeQaDock img').count(),0);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('bakeQaDock')).animationName),'none');
    assert.match(await page.locator('#bakeQaNote').textContent(),/No GIF or CSS clock/);

    await page.evaluate(()=>{
      const el=document.getElementById('bakeQaScrub');
      el.value='1.25';
      el.dispatchEvent(new Event('input',{bubbles:true}));
    });
    const scrubbed=await page.evaluate(()=>({
      time:HMStudio.time,
      scrub:document.getElementById('scrub').value,
      entry:HMStudio.seekPreviewContract.lastEntry,
      via:HMStudio.renderer&&HMStudio.renderer.lastRenderViaSoT,
      duration:HMStudio.duration,
      atoms:HMStudio.project.show.atoms.length,
    }));
    assert.equal(scrubbed.time,1.25);
    assert.equal(+scrubbed.scrub,1.25);
    assert.equal(scrubbed.entry,'bake-qa-dock');
    assert.equal(scrubbed.via,true);
    assert.equal(scrubbed.duration,5);
    assert.equal(scrubbed.atoms,8);
    const pixelsMatch=await page.evaluate(()=>{
      const a=document.getElementById('stage'),b=document.getElementById('bakeQaStage');
      const c=document.createElement('canvas');c.width=32;c.height=18;
      const g=c.getContext('2d');
      g.drawImage(a,0,0,32,18);
      const pa=[...g.getImageData(16,9,1,1).data];
      g.clearRect(0,0,32,18);
      g.drawImage(b,0,0,32,18);
      const pb=[...g.getImageData(16,9,1,1).data];
      return pa.every((v,i)=>v===pb[i]);
    });
    assert.equal(pixelsMatch,true);

    const peekTarget=await page.evaluate(()=>{
      const buttons=[...document.querySelectorAll('#bakeQaPeeks button')];
      const plus=buttons.find(b=>b.dataset.sampleKind==='plus_03')||buttons[0];
      plus.click();
      const peek=HMStudio.activeFramePeek;
      return {time:HMStudio.time,peekT:peek.t,plate:peek.source_plate,kind:peek.sample_kind,label:document.getElementById('bakeQaPeekLabel').textContent};
    });
    assert.ok(Math.abs(peekTarget.time-peekTarget.peekT)<1e-4);
    assert.match(peekTarget.plate,/^P/);
    assert.match(peekTarget.label,new RegExp(peekTarget.plate));
    assert.equal(await page.evaluate(()=>HMStudio.duration),5);

    await page.click('#bakeQaShowStrip');
    await page.waitForFunction(()=>!document.getElementById('exportDialog').open);
    assert.equal(await page.locator('#framePeekStrip').isVisible(),true);
    assert.match(await page.locator('#framePeekSummary').textContent(),/8 atoms · 16 peeks/);

    fs.mkdirSync(out,{recursive:true});
    await page.click('#openBakeQa');
    await page.waitForSelector('#exportDialog[open] #bakeQaDock');
    await page.locator('#exportDialog').screenshot({path:path.join(out,'ui-bake-qa-dock.png')});

    await page.evaluate(async({pngB64,json})=>{
      const pngBytes=Uint8Array.from(atob(pngB64),c=>c.charCodeAt(0));
      const staged=await HMStripAdapter.stage([
        new File([pngBytes],'strip.png',{type:'image/png'}),
        new File([json],'sidecar.json',{type:'application/json'}),
      ]);
      HMStudio.editProject(p=>HMStripAdapter.append(p,staged));
    },{pngB64:stripPng().toString('base64'),json:JSON.stringify({frames:4,w:2,h:2,body_h:1,fps:10})});
    await settle();
    assert.equal(await page.evaluate(()=>HMStudio.project.show.atoms.length),8);
    assert.equal(await page.evaluate(()=>HMStudio.project.media.some(m=>m.pendingMotion&&m.pendingMotion.status==='pending')),true);
    await page.evaluate(()=>{
      const el=document.getElementById('bakeQaScrub');
      el.value='0.25';
      el.dispatchEvent(new Event('input',{bubbles:true}));
    });
    await page.waitForFunction(()=>{
      const canvas=document.querySelector('#bakeQaStrips canvas');
      if(!canvas)return false;
      const px=canvas.getContext('2d').getImageData(80,45,1,1).data;
      return px[2]>180&&px[0]<80;
    });
    const strip=await page.evaluate(()=>{
      const row=document.querySelector('#bakeQaStrips .bake-qa-strip');
      return {
        label:row.querySelector('output').textContent,
        cell:+row.dataset.cellIndex,
        time:HMStudio.time,
        atoms:HMStudio.project.show.atoms.length,
        playable:HMStudio.project.show.atoms.some(a=>a.hero&&a.hero.layout_source&&a.hero.layout_source.includes('/strip')),
      };
    });
    assert.equal(strip.cell,2);
    assert.equal(strip.time,0.25);
    assert.match(strip.label,/cell 3\/4/);
    assert.match(strip.label,/NOT PLAYABLE/);
    assert.equal(strip.atoms,8);
    assert.equal(strip.playable,false);
    await page.locator('#exportDialog').screenshot({path:path.join(out,'ui-bake-qa-strip.png')});

    await settle();
    await page.evaluate(()=>document.getElementById('exportDialog').close());
    await page.click('#loadPoseRefPack');
    await page.waitForFunction(()=>HMStudio.project?.show?.show_id==='daiyu-wang-10s-kicks-pose-pack',null,{timeout:90000});
    await settle();
    await page.click('#openBakeQa');
    await page.waitForSelector('#exportDialog[open] #bakeQaPlate');
    const plate=await page.evaluate(()=>{
      const plus=document.querySelector('#bakeQaPeeks button[data-sample-kind="plus_03"]');
      plus.click();
      const peek=HMStudio.activeFramePeek;
      return {
        plate:document.getElementById('bakeQaPlate').textContent,
        time:HMStudio.time,
        peekT:peek.t,
        source:peek.source_plate,
        cards:document.querySelectorAll('#framePeekTrack .peek-card').length,
        duration:HMStudio.duration,
        pose:!!HMStudio.project.show.pose_ref_pack,
      };
    });
    assert.match(plate.plate,/Plate show/);
    assert.ok(Math.abs(plate.time-plate.peekT)<1e-4);
    assert.equal(plate.source,'P01');
    assert.equal(plate.cards,40);
    assert.equal(plate.pose,true);
    assert.ok(plate.duration>10&&plate.duration<11);
    await page.locator('#exportDialog').screenshot({path:path.join(out,'ui-bake-qa-plate.png')});

    assert.deepEqual(errors,[]);
    console.log('PASS HM-PF-45 bake QA dock: scrub, frame peek, imported strip cell, pose-ref plate show');
  }finally{
    await browser.close();
    if(srv)await new Promise(r=>srv.close(r));
  }
})().catch(e=>{console.error(e);process.exit(1);});

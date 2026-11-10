/* HM-PF-46 browser check — export matrix, playable HTML, and the frame zip.
 * Starts a loopback server when 127.0.0.1:8765 is down. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8765';
const out=fs.mkdtempSync(path.join(os.tmpdir(), 'hm-pf-46-browser-'));
const shotDir='/opt/cursor/artifacts';
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

function rows(page){
  return page.evaluate(()=>[...document.querySelectorAll('#exportMatrixBody tr')].map(tr=>({
    id:tr.dataset.exportRow,
    offered:tr.dataset.offered,
    scope:tr.dataset.scope,
    alpha:tr.dataset.alpha,
    text:tr.innerText,
  })));
}

(async()=>{
  const srv=await ensureServer(base);
  const browser=await chromium.launch({headless:true,chromiumSandbox:true,args:['--disable-dev-shm-usage','--disable-gpu']});
  const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',dialog=>dialog.accept());
  const settle=async()=>{await page.waitForFunction(()=>!HMStudio.loading);return page.evaluate(()=>HMStudio.compile());};
  try{
    await page.goto(base+'/ui/');
    await page.evaluate(()=>window.ready);
    await settle();
    assert.equal(await page.evaluate(()=>HMStudio.project.show.show_id),'daiyu-wang-five-seconds');
    assert.equal(await page.evaluate(()=>HMStudio.duration),5);
    assert.equal(await page.locator('.timeline-clip').count(),8);

    await page.click('#exportOpen');
    await page.waitForSelector('#exportDialog[open] #exportMatrixBody tr');
    let matrix=await rows(page);
    const byId=Object.fromEntries(matrix.map(item=>[item.id,item]));
    assert.equal(byId.html.offered,'true');
    assert.equal(byId.html.scope,'always');
    assert.equal(byId.frames.offered,'true');
    assert.equal(byId.frames.scope,'always');
    assert.equal(byId.alpha.offered,'false');
    assert.equal(byId.alpha.scope,'never');
    assert.match(byId.alpha.text,/Alpha video is not offered/);
    assert.match(byId.frames.text,/white stage fill/);
    const flags=await page.evaluate(()=>({
      mp4:document.getElementById('exportMatrix').dataset.universalMp4,
      alpha:document.getElementById('exportMatrix').dataset.universalAlpha,
      note:document.getElementById('exportMatrixNote').textContent,
      record:HMExportMatrix.preferredRecordMime(HMExportMatrix.browserCaps({
        captureStream:!!HTMLCanvasElement.prototype.captureStream,
        isTypeSupported:type=>!!(window.MediaRecorder&&MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(type)),
      })),
    }));
    assert.equal(flags.mp4,'false');
    assert.equal(flags.alpha,'false');
    assert.match(flags.note,/MP4 is not universal\./);
    assert.match(flags.note,/Alpha video is not offered\./);
    assert.equal(flags.record.includes('alpha'),false);
    assert.equal(await page.locator('#exportHtml').isEnabled(),true);
    assert.equal(await page.locator('#exportFrames').isEnabled(),true);

    await page.evaluate(()=>{
      MediaRecorder.isTypeSupported=()=>false;
      document.getElementById('exportPreset').dispatchEvent(new Event('change'));
    });
    matrix=await rows(page);
    const blocked=Object.fromEntries(matrix.map(item=>[item.id,item]));
    assert.equal(blocked.webm.offered,'false');
    assert.equal(blocked.mp4.offered,'false');
    assert.equal(blocked.html.offered,'true');
    assert.equal(blocked.frames.offered,'true');
    assert.equal(blocked.alpha.offered,'false');
    assert.equal(await page.locator('#exportVideo').isDisabled(),true);
    assert.match(await page.locator('#videoHint').textContent(),/Playable HTML|frame-sequence zip/);

    await page.evaluate(()=>{
      MediaRecorder.isTypeSupported=type=>type==='video/mp4';
      document.getElementById('exportPreset').dispatchEvent(new Event('change'));
    });
    matrix=await rows(page);
    const mp4=Object.fromEntries(matrix.map(item=>[item.id,item]));
    assert.equal(mp4.mp4.offered,'true');
    assert.match(mp4.mp4.text,/This browser only/);
    assert.match(mp4.mp4.text,/MP4 is not universal/);
    assert.equal(mp4.webm.offered,'false');
    assert.equal(mp4.alpha.offered,'false');
    assert.match(await page.locator('#videoHint').textContent(),/MP4 is not universal/);

    await page.evaluate(()=>{
      MediaRecorder.isTypeSupported=type=>type==='video/webm;codecs=vp9'||type==='video/mp4'||type==='video/webm;codecs=vp9,alpha';
      document.getElementById('exportPreset').dispatchEvent(new Event('change'));
    });
    matrix=await rows(page);
    const preferred=Object.fromEntries(matrix.map(item=>[item.id,item]));
    assert.equal(preferred.webm.offered,'true');
    assert.equal(preferred.alpha.offered,'false');
    assert.match(preferred.alpha.text,/reports video\/webm;codecs=vp9,alpha/);
    assert.match(preferred.alpha.text,/Alpha video is not offered/);
    assert.match(preferred.mp4.text,/prefers WebM/);
    fs.mkdirSync(shotDir,{recursive:true});
    await page.locator('#exportDialog').screenshot({path:path.join(shotDir,'hm-pf-46-export-matrix.png')});
    await page.evaluate(()=>document.getElementById('exportDialog').close());

    await page.evaluate(async()=>{
      const make=draw=>{const c=document.createElement('canvas');c.width=64;c.height=64;draw(c.getContext('2d'));return c.toDataURL('image/png');};
      const plate=make(g=>{g.fillStyle='#1eb446';g.fillRect(0,0,64,64);});
      const current=HMStudio.project,key='embedded/hm-pf-46/layout.json';
      const atoms=[{id:'hm-pf-46-clip',label:'Honesty',kind:'duo',duration_s:0.1,plates_needed:1,pose_mode:'hero',hero:{layout_source:key,plates:['P01']},camera:{preset:'static_hold',params:{s:{type:'const',v:1},x:{type:'const',v:0},y:{type:'const',v:0}}},fx_hooks:[]}];
      await HMStudio.load({version:1,show:{...current.show,show_id:'hm-pf-46-probe',title:'HM-PF-46 probe',atoms,bg:{},overlays:[]},layouts:{[key]:{P01:{full:plate}}},media:[{id:'hm-pf-46-marker',name:'Marker',src:plate,layoutSource:key,plateId:'P01'}],assets:{}});
    });
    await settle();
    assert.equal(await page.evaluate(()=>HMStudio.duration),0.1);
    await page.click('#exportOpen');
    const htmlEvent=page.waitForEvent('download',{timeout:60000});
    await page.click('#exportHtml');
    const htmlDownload=await htmlEvent;
    assert.equal(await htmlDownload.failure(),null);
    const htmlPath=path.join(out,'probe.html');
    await htmlDownload.saveAs(htmlPath);
    const html=fs.readFileSync(htmlPath,'utf8');
    assert.match(html,/window\.renderAt=/);
    assert.match(html,/Plays offline/);
    assert.match(html,/standalone-player/);
    const offline=await context.newPage();
    const leaked=[];
    await offline.route('http://**',route=>{leaked.push(route.request().url());return route.abort();});
    await offline.route('https://**',route=>{leaked.push(route.request().url());return route.abort();});
    await offline.goto('file://'+htmlPath);
    await offline.evaluate(()=>window.ready);
    await offline.evaluate(()=>renderAt(0.05));
    assert.match(await offline.locator('#time').textContent(),/0\.05 \/ 0\.10/);
    assert.deepEqual(leaked,[]);
    await offline.close();

    await page.waitForFunction(()=>!document.getElementById('exportFrames').disabled);
    const zipEvent=page.waitForEvent('download',{timeout:90000});
    await page.click('#exportFrames');
    const zipDownload=await zipEvent;
    assert.equal(await zipDownload.failure(),null);
    const zipPath=path.join(out,'frames.zip');
    await zipDownload.saveAs(zipPath);
    const listed=execFileSync('python3',['-c',`
import json,sys,zipfile
z=zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None
names=z.namelist()
assert names[0]=='timing.json'
assert names[1:]==['frames/000000.png','frames/000001.png','frames/000002.png']
doc=json.loads(z.read('timing.json'))
assert doc['show_id']=='hm-pf-46-probe'
assert doc['preset_id']=='720p30' and doc['fps']==30 and doc['frame_count']==3
assert doc['encode']=='local-skill'
assert 'mp4' not in doc['ffmpeg']['argv']
png=z.read('frames/000000.png')
assert png[:8]==bytes([137,80,78,71,13,10,26,10])
print(doc['frame_count'])
`,zipPath],{encoding:'utf8'});
    assert.match(listed,/3/);
    assert.deepEqual(errors,[]);
    const demo=JSON.parse(fs.readFileSync('public/shows/daiyu-wang-five-seconds.json','utf8'));
    assert.equal(demo.atoms.length,8);
    assert.equal(demo.atoms.reduce((sum,atom)=>sum+atom.duration_s,0),5);
    console.log('PASS hm-pf-46 export matrix, playable HTML, and frame zip');
  }finally{
    await browser.close();
    if(srv)await new Promise(resolve=>srv.close(resolve));
  }
})().catch(err=>{console.error(err);process.exit(1);});

#!/usr/bin/env node
/* Export through the real editor in an isolated browser; render exact frame timestamps. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {spawn,spawnSync}=require('node:child_process');const {once}=require('node:events');
const opt={};for(let i=2;i<process.argv.length;i+=2)opt[process.argv[i].replace(/^--/,'')]=process.argv[i+1];
let playwright;try{playwright=require('playwright');}catch(_){try{playwright=require(require.resolve('playwright',{paths:[path.resolve(opt.repo||'.')]}));}catch(_){throw Error('Playwright is unavailable. Run npm install in the selected checkout or set NODE_PATH to your environment packages.');}}
const {chromium}=playwright;
const serve=root=>new Promise((resolve,reject)=>{const s=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let f=path.resolve(root,'.'+name);if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'}[path.extname(f)]||'application/octet-stream';res.setHeader('Content-Type',mime);fs.createReadStream(f).on('error',()=>res.destroy()).pipe(res);}catch(_){res.writeHead(404).end();}});s.once('error',reject);s.listen(0,'127.0.0.1',()=>resolve(s));});
(async()=>{
 if(!opt.repo||!opt.project||(!opt.html&&!opt.video))throw Error('Use --repo PATH --project PATH [--html PATH] [--video PATH.webm] [--report PATH] [--fps 30]');
 const fps=Number(opt.fps||30);if(!Number.isInteger(fps)||fps<1||fps>60)throw Error('fps must be 1–60');
 const project=JSON.parse(fs.readFileSync(path.resolve(opt.project),'utf8'));
 const ff=process.env.FFMPEG||'ffmpeg';if(opt.video){if(!opt.video.endsWith('.webm'))throw Error('This helper encodes WebM; use a .webm filename');const check=spawnSync(ff,['-version'],{encoding:'utf8'});if(check.error||check.status)throw Error('ffmpeg unavailable; set FFMPEG to a VP8-capable binary');}
 const server=await serve(path.resolve(opt.repo,'public'));let browser,encoder,encoded,encoderLog='';
 const errors=[],failed=[],checks={};const report={};
 try{
  browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||undefined});
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1,acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(r.status()+' '+r.url());});
  await page.goto(`http://127.0.0.1:${server.address().port}/ui/`);await page.evaluate(()=>window.ready);await page.evaluate(p=>HMStudio.load(p),project);await page.evaluate(()=>HMStudio.compile());
  const data=await page.evaluate(()=>({duration:HMStudio.duration,timeline:HMStudio.composed.timeline}));const duration=data.duration;
  checks.timeline_contiguous=data.timeline.plates.every((p,i,a)=>p.t1>p.t0&&(!i||Math.abs(p.t0-a[i-1].t1)<1e-6))&&Math.abs(data.timeline.plates.at(-1).t1-duration)<1e-6;
  if(!checks.timeline_contiguous)throw Error('Timeline contains gaps or wrong end');
  if(opt.html){fs.mkdirSync(path.dirname(path.resolve(opt.html)),{recursive:true});await page.click('#exportOpen');const wait=page.waitForEvent('download');await page.click('#exportHtml');const dl=await wait;if(await dl.failure())throw Error(await dl.failure());await dl.saveAs(path.resolve(opt.html));await page.getByRole('button',{name:'Close export',exact:true}).click();
   const offline=await browser.newPage();const requests=[];await offline.route(/^https?:/,r=>{requests.push(r.request().url());return r.abort();});await offline.goto('file://'+path.resolve(opt.html));await offline.evaluate(()=>window.ready);await offline.evaluate(t=>renderAt(t),Math.max(0,duration-.01));checks.html_offline=requests.length===0;if(!checks.html_offline)throw Error('Offline export requested network');await offline.close();
  }
  if(opt.video){const count=duration*fps;if(Math.abs(Math.round(count)-count)>1e-6)throw Error('Duration × fps is not an integer; choose a compatible fps');
   fs.mkdirSync(path.dirname(path.resolve(opt.video)),{recursive:true});
   await page.evaluate(()=>{const c=document.getElementById('stage');document.body.append(c);});await page.addStyleTag({content:'body>*:not(#stage){display:none!important}body{margin:0!important;padding:0!important}#stage{position:fixed!important;left:0!important;top:0!important;width:1280px!important;height:720px!important;border:0!important;border-radius:0!important;box-shadow:none!important}'});
   encoder=spawn(ff,['-y','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0','-an','-c:v','libvpx','-b:v','3500k','-t',String(duration),path.resolve(opt.video)],{stdio:['pipe','ignore','pipe']});encoder.stderr.on('data',b=>encoderLog+=b);encoded=once(encoder,'close');encoder.stdin.on('error',()=>{});
   for(let i=0;i<count;i++){await page.evaluate(t=>HMStudio.renderAt(t),i/fps);const frame=await page.locator('#stage').screenshot({type:'jpeg',quality:94});if(!encoder.stdin.write(frame))await Promise.race([once(encoder.stdin,'drain'),encoded.then(()=>{throw Error(encoderLog||'ffmpeg stopped before encoding finished');})]);if(i%fps===0)console.log(`Rendering ${i}/${count} frames`);}
   encoder.stdin.end();const[code]=await encoded;if(code!==0)throw Error(encoderLog);const meta=spawnSync(ff,['-i',path.resolve(opt.video)],{encoding:'utf8'}).stderr||'';const match=meta.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);const actual=match?+match[1]*3600+ +match[2]*60+ +match[3]:NaN;
   checks.video_duration=Math.abs(actual-duration)<=.011;checks.video_dimensions=/1280x720/.test(meta);checks.video_fps=new RegExp('\\b'+fps+' fps').test(meta);if(!checks.video_duration||!checks.video_dimensions||!checks.video_fps)throw Error('Encoded video metadata differs: '+meta);report.video={duration_s:actual,frames:Math.round(count),fps,width:1280,height:720,path:path.resolve(opt.video)};
  }
  checks.no_browser_errors=errors.length===0;checks.no_failed_requests=failed.length===0;if(errors.length||failed.length)throw Error(JSON.stringify({errors,failed}));
  Object.assign(report,{show_id:project.show.show_id,duration_s:duration,plates:data.timeline.plates.length,checks,errors,failed});if(opt.report){fs.mkdirSync(path.dirname(path.resolve(opt.report)),{recursive:true});fs.writeFileSync(path.resolve(opt.report),JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify(report,null,2));
 }finally{if(encoder&&encoder.exitCode===null)encoder.kill();if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});

/* Deterministic 30fps WebM export. Requires Playwright and ffmpeg on PATH (or FFMPEG). */
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const path=require('node:path');
(async()=>{
  const target=path.resolve(process.argv[2]||'daiyu-wang-five-seconds.webm');
  const ffmpeg=spawn(process.env.FFMPEG||'ffmpeg',['-y','-f','image2pipe','-framerate','30','-vcodec','mjpeg','-i','pipe:0','-an','-c:v','libvpx','-b:v','3500k','-t','5',target],{stdio:['pipe','ignore','pipe']});
  let log='';ffmpeg.stderr.on('data',b=>{log+=b;});const finished=once(ffmpeg,'close');
  const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||undefined});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
    await page.goto((process.env.TEST_BASE_URL||'http://127.0.0.1:8765')+'/player/?show=daiyu-wang-five-seconds&capture=1');await page.evaluate(()=>window.ready);
    for(let i=0;i<150;i++){
      await page.evaluate(t=>window.renderAt(t),i/30);
      const frame=await page.locator('#stage').screenshot({type:'jpeg',quality:94});
      if(!ffmpeg.stdin.write(frame))await once(ffmpeg.stdin,'drain');
      if(i%30===0)console.log('Rendered '+i+'/150 frames');
    }
    ffmpeg.stdin.end();const [code]=await finished;if(code!==0)throw new Error(log);
    console.log('Saved 150 frames / 30fps = 5.000 seconds to '+target);
  }finally{await browser.close();if(ffmpeg.exitCode===null)ffmpeg.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});

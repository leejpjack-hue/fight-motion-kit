(() => {
  const $=id=>document.getElementById(id),q=new URLSearchParams(location.search);
  const id=q.get('show')||'daiyu-wang-five-seconds',capture=q.has('capture');
  let renderer,duration=0,time=0,playing=false,offset=0,start=0,raf=0;
  if(capture)document.body.classList.add('capture');
  $('edit').href='/ui/?show='+encodeURIComponent(id);
  function draw(){renderer.render(time);$('seek').value=time;$('time').textContent=`${time.toFixed(2)} / ${duration.toFixed(2)}s`;$('play').textContent=playing?'Pause':'Play';}
  function pause(){playing=false;cancelAnimationFrame(raf);}
  function tick(now){if(!playing)return;time=Math.min(duration,offset+(now-start)/1000);if(time>=duration)playing=false;draw();if(playing)raf=requestAnimationFrame(tick);}
  function play(){if(playing)pause();else{if(time>=duration)time=0;offset=time;start=performance.now();playing=true;raf=requestAnimationFrame(tick);}draw();}
  $('play').onclick=play;$('seek').oninput=()=>{pause();time=+$('seek').value;draw();};
  window.renderAt=t=>{pause();time=Math.max(0,Math.min(duration,t));draw();};
  window.ready=(async()=>{
    if(!/^[a-z0-9][a-z0-9_-]*$/.test(id))throw new Error('Invalid show ID');
    const base=q.get('base')||'/out/'+id+'/';
    if(new URL(base,location.href).origin!==location.origin)throw new Error('Use a same-origin output folder');
    let data;try{data=JSON.parse(localStorage.getItem('html-motion-composer:out:'+id));}catch(_){}
    if(!data?.timeline||!data?.layout){const responses=await Promise.all(['timeline.json','layout.json'].map(p=>fetch(base+p)));if(responses.some(r=>!r.ok))throw new Error('No composed output. Open this project in the editor, or export its playable HTML.');const [timeline,layout]=await Promise.all(responses.map(r=>r.json()));data={timeline,layout};}
    renderer=HMMotion($('stage'),data.assets||{});await renderer.load(data);duration=data.timeline.duration_s;$('seek').max=duration;$('play').disabled=false;document.title=data.timeline.title;time=Math.min(duration,Math.max(0,Number(q.get('t'))||0));draw();
    if(!capture&&q.get('autoplay')==='1')play();
  })().catch(e=>{$('error').hidden=false;$('error').textContent=e.message;throw e;});
  document.addEventListener('keydown',e=>{if(e.code==='Space'&&e.target.tagName!=='INPUT'){e.preventDefault();play();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();if(renderer)draw();}});
})();

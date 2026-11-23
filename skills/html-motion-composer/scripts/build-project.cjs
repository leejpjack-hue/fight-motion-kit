#!/usr/bin/env node
/* Build a portable project using a checkout's compose engine, without backend/API writes. */
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
function args(){const out={};for(let i=2;i<process.argv.length;i+=2){if(!process.argv[i]?.startsWith('--')||!process.argv[i+1])throw Error('Use --repo PATH --show PATH --out PATH [--emit-html PATH] [--layout PATH] [--base-show PATH --append-seconds N]');out[process.argv[i].slice(2)]=process.argv[i+1];}return out;}
function collectBgRefs(bg, paths){if(!bg||typeof bg!=='object')return;if(typeof bg.base==='string'&&bg.base)paths.add(bg.base);if(typeof bg.swap==='string'&&bg.swap)paths.add(bg.swap);if(Array.isArray(bg.locations))bg.locations.forEach(r=>{if(r&&typeof r.src==='string'&&r.src)paths.add(r.src);});}
function standalonePlayer(data){const get=id=>document.getElementById(id);const r=createMotionRenderer(get('stage'),data.assets);let t=0,playing=false,start=0,offset=0;const duration=data.timeline.duration_s;get('seek').max=duration;get('title').textContent=data.timeline.title;document.title=data.timeline.title;const updateHud=typeof HMTeachingFilm!=='undefined'&&HMTeachingFilm.mountTeachingHud(get('stage').parentElement,data,value=>{playing=false;t=Math.max(0,Math.min(duration,value));draw();})||null;function draw(){r.render(t,{viaSoT:true,source:'standalone-player'});get('seek').value=t;get('time').textContent=t.toFixed(2)+' / '+duration.toFixed(2)+'s';get('play').textContent=playing?'Pause':'Play';if(updateHud)updateHud(t);const layers=get('layers');if(layers){const row=r.lastLayerMatrix;layers.dataset.state=row&&layerCamsIndependent(row)?'independent':'idle';layers.textContent=layerCamMatrixText(row);}}function tick(now){if(!playing)return;t=Math.min(duration,offset+(now-start)/1000);if(t>=duration)playing=false;draw();if(playing)requestAnimationFrame(tick);}function toggle(){if(playing)playing=false;else{if(t>=duration)t=0;offset=t;start=performance.now();playing=true;requestAnimationFrame(tick);}draw();}get('play').onclick=toggle;get('seek').oninput=()=>{playing=false;t=+get('seek').value;draw();};document.addEventListener('keydown',e=>{if(e.code==='Space'&&e.target.tagName!=='INPUT'){e.preventDefault();toggle();}});window.ready=r.load(data).then(()=>{get('play').disabled=false;draw();});window.renderAt=value=>{playing=false;t=Math.max(0,Math.min(duration,value));draw();};window.ready.catch(e=>{get('title').textContent='Unable to load: '+e.message;});}
function emitPlayableHtml(repo, project, result){
 require(path.join(repo,'public/ui/import-security.js'));
 require(path.join(repo,'public/ui/html-import.js'));
 require(path.join(repo,'public/ui/cut-transitions.js'));
 require(path.join(repo,'public/ui/strip-sampler.js'));
 require(path.join(repo,'public/ui/motion-renderer.js'));
 const teachingPath=path.join(repo,'public/ui/teaching-film.js');
 if(fs.existsSync(teachingPath))require(teachingPath);
 const sec=globalThis.HMImportSecurity, htmlImport=globalThis.HMHtmlImport, fx=globalThis.HMMotionFx;
 const wave1File=path.join(repo,'public/presets/pixelfx_wave1.json');
 const wave1Ids=new Set(fs.existsSync(wave1File)?JSON.parse(fs.readFileSync(wave1File,'utf8')).map(r=>r&&r.id).filter(Boolean):[]);
 const atoms=(project.show&&project.show.atoms)||[];
 const pxUsed=atoms.some(a=>(a.fx_hooks||[]).some(h=>{const t=typeof h==='string'?h:h&&h.type;return (h&&h.source==='pixelfx')||wave1Ids.has(t);}));
 const pxFile=path.join(repo,'public/vendor/pixelfx/wave1.global.js');
 const pxBundle=pxUsed&&fs.existsSync(pxFile)?fs.readFileSync(pxFile,'utf8'):'';
 const pxScript=pxBundle?`<script>${pxBundle.replace(/<\/script/gi,'<\\/script')}<\/script>`:'';
 const hmProjectScript=htmlImport.embedProjectScript(project,{omitAssets:true});
 const rawData=JSON.stringify({...result,assets:project.assets||{}});
 const data=sec.escapeScriptJson(rawData);
 const cspMeta='<meta http-equiv="Content-Security-Policy" content="'+"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"+'">';
 const fns=[
  globalThis.backgroundMotionFrame.toString(),
  globalThis.backgroundMotionProgress.toString(),
  globalThis.backgroundScrollState.toString(),
  globalThis.fgPassByInstances.toString(),
  globalThis.resolveMicroFrameAt.toString(),
  `const FG_CAM_PRESETS=${JSON.stringify(globalThis.FG_CAM_PRESETS)};`,
  `const FG_DEFAULT_PARALLAX=${JSON.stringify(globalThis.FG_DEFAULT_PARALLAX)};`,
  `const FG_PARALLAX_PRESETS=${JSON.stringify(globalThis.FG_PARALLAX_PRESETS)};`,
  globalThis.fgCameraFrame.toString(),
  globalThis.fgPropPose.toString(),
  globalThis.fgBrokenCutoutSrc.toString(),
  globalThis.fgBreakState.toString(),
  `const FX_FIST_PATH=${JSON.stringify(globalThis.FX_FIST_PATH)};`,
  `const FX_LEG_PATH=${JSON.stringify(globalThis.FX_LEG_PATH)};`,
  `const FX_TORNADO_PATH=${JSON.stringify(globalThis.FX_TORNADO_PATH)};`,
  `const PHOTO_FX_CHIPS=${JSON.stringify(fx.PHOTO_FX_CHIPS)};`,
  'const PHOTO_FX_CHIP_SET=new Set(PHOTO_FX_CHIPS);',
  fx.fxPathOrStock.toString(),
  fx.fxPointOnPath.toString(),
  fx.fxPlacementOf.toString(),
  fx.transformFxPath.toString(),
  fx.exposureWarmCrushPixels.toString(),
  fx.normalizeImpactOpts.toString(),
  fx.normalizeHitstopEntry.toString(),
  fx.resolveHitstopAt.toString(),
  fx.applyHitstopPixels.toString(),
  fx.impactBurstGeometry.toString(),
  fx.drawImpactBurst.toString(),
  fx.normalizeFxLayerOpts.toString(),
  fx.taperedArcPolygon.toString(),
  fx.computeCameraVelocity.toString(),
  fx.computeBgParallaxOffset.toString(),
  fx.drawSceneAtmosphereMood.toString(),
  fx.computeCameraImpactShake.toString(),
  fx.drawFistPressure.toString(),
  fx.drawLegArc.toString(),
  fx.drawTornado.toString(),
  fx.collectProceduralOverlays.toString(),
  globalThis.cameraEase.toString(),
  globalThis.cameraChannel.toString(),
  globalThis.cameraPoseOnSegment.toString(),
  globalThis.cutTransitionsBundle.toString()+'\ncutTransitionsBundle();',
  globalThis.backgroundLocationsBundle.toString()+'\nbackgroundLocationsBundle();',
  typeof globalThis.stripSamplerBundle==='function'?globalThis.stripSamplerBundle.toString()+'\nstripSamplerBundle();':'',
  globalThis.layerCamMatrix.toString(),
  globalThis.layerCamsIndependent.toString(),
  globalThis.layerCamMatrixText.toString(),
  globalThis.HMMotion.toString(),
  globalThis.HMTeachingFilm&&typeof globalThis.HMTeachingFilm.createHMTeachingFilm==='function'?globalThis.HMTeachingFilm.createHMTeachingFilm.toString()+'\nconst HMTeachingFilm=createHMTeachingFilm();':'',
  `const DATA=${data};`,
  `(${standalonePlayer.toString()})(DATA);`
 ].filter(Boolean).join('\n');
 return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${cspMeta}<title>HTML Motion</title><style>body{margin:0;background:#101315;color:#edf1e9;font:14px system-ui;min-height:100vh;display:grid;place-content:center}main{width:min(100vw,1280px)}canvas{display:block;width:100%;height:auto;background:white}nav{display:flex;gap:16px;align-items:center;padding:16px}button{background:#ccf17b;border:0;border-radius:6px;padding:9px 18px;cursor:pointer}input{accent-color:#ccf17b;flex:1;min-width:50px}output{font-size:12px;white-space:nowrap}h1{font-size:16px;font-weight:500;padding:0 16px}p{font-size:11px;color:#98a699;padding:0 16px}</style><main><h1 id="title"></h1><canvas id="stage" width="1280" height="720"></canvas><nav><button id="play" disabled>Loading…</button><input id="seek" aria-label="Seek" type="range" min="0" step="0.01" value="0"><output id="time"></output></nav><p>HTML Motion · Plate animation · Plays offline</p><p id="layers"></p></main>${hmProjectScript}${pxScript}<script>${fns.replace(/<\/script/gi,'<\\/script')}<\/script></html>`;
}
(async()=>{
 const opt=args();if(!opt.repo||!opt.show||!opt.out)throw Error('--repo, --show and --out are required');
 const repo=path.resolve(opt.repo), root=path.join(repo,'public');
 const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
 const showPath=p=>path.isAbsolute(p)?p:path.resolve(repo,p);
 const show=read(showPath(opt.show));
 if(!Array.isArray(show.atoms)||show.atoms.some(a=>!Number.isFinite(a.duration_s)||a.duration_s<.1))throw Error('Each atom needs a finite numeric duration of at least 0.1 seconds');
 const sum=s=>s.atoms.reduce((n,a)=>n+a.duration_s,0);
 let prefix=null;
 if(opt['base-show']){const original=read(showPath(opt['base-show']));assert.deepEqual(show.atoms.slice(0,original.atoms.length),original.atoms,'Original atoms/timing were changed');const previousOverlays=original.overlays||[],nextOverlays=show.overlays||[];assert.deepEqual(nextOverlays.slice(0,previousOverlays.length),previousOverlays,'Original overlays were changed');assert.ok(nextOverlays.slice(previousOverlays.length).every(o=>o.t_start>=sum(original)),'New overlays must start in the appended section');if(opt['append-seconds']!=null)assert.ok(Math.abs(sum(show)-sum(original)-Number(opt['append-seconds']))<1e-6,'Wrong extension duration');prefix={preserved_atoms:original.atoms.length,original_seconds:sum(original),added_seconds:sum(show)-sum(original)};}
 function local(p){const full=path.resolve(root,p);if(full!==root&&!full.startsWith(root+path.sep))throw Error('Asset leaves public/: '+p);return full;}
 function resolveImage(p){if(/^data:image\/(png|jpeg|webp|gif);base64,/.test(p))return p;if(/^(?:[a-z]+:|\/\/)/i.test(p))throw Error('Use embedded or checkout-local images: '+p);let f=local(p.replace(/^\//,''));if(!fs.existsSync(f)&&f.endsWith('.png')){const alternative=[f.replace(/\.png$/,'.webp'),f.replace(/\.png$/,'.jpg')].find(fs.existsSync);if(alternative)f=alternative;}if(!fs.existsSync(f))throw Error('Missing image: '+p);return f;}
 const layouts={};
 const layoutOverride=opt.layout?read(path.resolve(opt.layout)):null;
 for(const key of new Set(show.atoms.map(a=>a.hero?.layout_source))){if(!key)throw Error('Every atom needs a hero layout');layouts[key]=layoutOverride||read(local(key));}
 const media=[];
 for(const [key,layout] of Object.entries(layouts))for(const [id,l]of Object.entries(layout)){
  const dir=path.posix.dirname(key);const src=l.full||l.parts?.[0]?.src;if(!src)throw Error('No image for '+id);
  const resolved=src.startsWith('data:')?src:path.posix.join(dir,src);resolveImage(resolved);
  media.push({id:'media-'+media.length,name:id,src:resolved,layoutSource:key,plateId:id});
 }
 require(path.join(repo,'public/ui/compose-client.js'));
 const validationShow=structuredClone(show);let captionTime=0;
 validationShow.overlays=(validationShow.overlays||[]).filter(o=>!o.editor_caption);
 for(const a of validationShow.atoms){if(a.caption)validationShow.overlays.push({id:'caption-'+a.id,editor_caption:true,kind:'text',text:a.caption,t_start:captionTime,t_end:captionTime+a.duration_s,x:640,y:644,style:{fontSize:38,fill:'#ffffff',stroke:'#17201d',strokeWidth:7}});captionTime+=a.duration_s;}
 const result=await HMComposeClient.composeShow(validationShow,{cameraPresets:read(local('presets/camera_presets.json')),fxPresets:read(local('presets/fx_presets.json')),cutPresets:read(local('presets/cut_transitions.json')),loadJson:async p=>{if(!layouts[p])throw Error('Missing layout '+p);return layouts[p];}});
 if(!result.ok)throw Error(result.errors.join('\n'));
 const paths=new Set(media.map(m=>m.src));
 collectBgRefs(show.bg,paths);
 show.atoms.forEach(a=>{if(a.background?.src)paths.add(a.background.src);(a.micro_frames||[]).forEach(mf=>{if(mf?.src)paths.add(mf.src);});});
 (show.fg?.props||[]).forEach(p=>{if(p.src)paths.add(p.src);if(p.effect?.broken_src)paths.add(p.effect.broken_src);});
 Object.values(result.layout).forEach(l=>{if(l.full)paths.add(l.full);if(l.strip?.src)paths.add(l.strip.src);if(l.background?.src)paths.add(l.background.src);for(const p of l.parts||[])paths.add(p.src);(l.micro_frames||[]).forEach(mf=>{if(mf?.src)paths.add(mf.src);});});
 collectBgRefs(result.timeline.bg,paths);
 (result.timeline.atoms||[]).forEach(a=>(a.micro_frames||[]).forEach(mf=>{if(mf?.src)paths.add(mf.src);}));
 (result.timeline.fg?.props||[]).forEach(p=>{if(p.src)paths.add(p.src);if(p.effect?.broken_src)paths.add(p.effect.broken_src);});
 for(const o of result.timeline.overlays||[])if(o.src)paths.add(o.src);
 const assets={};for(const key of paths){const f=resolveImage(key);if(f.startsWith('data:'))continue;const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'}[path.extname(f).toLowerCase()];if(!mime)throw Error('Unsupported image '+f);assets[key]='data:'+mime+';base64,'+fs.readFileSync(f).toString('base64');}
 const project={version:1,show,layouts,media,assets};
 const target=path.resolve(opt.out);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(project));
 let htmlTarget=null;
 if(opt['emit-html']){htmlTarget=path.resolve(opt['emit-html']);fs.mkdirSync(path.dirname(htmlTarget),{recursive:true});fs.writeFileSync(htmlTarget,emitPlayableHtml(repo,project,result));}
 const report={show_id:show.show_id,duration_s:result.duration_s,plates:result.timeline.plates.length,images:Object.keys(assets).length,prefix,warnings:result.warnings,portable_project:target,...(htmlTarget?{playable_html:htmlTarget}:{})};
 fs.writeFileSync(target.replace(/\.json$/,'')+'.validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});

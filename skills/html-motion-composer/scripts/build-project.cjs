#!/usr/bin/env node
/* Build a portable project using a checkout's compose engine, without backend/API writes. */
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
function args(){const out={};for(let i=2;i<process.argv.length;i+=2){if(!process.argv[i]?.startsWith('--')||!process.argv[i+1])throw Error('Use --repo PATH --show PATH --out PATH [--base-show PATH --append-seconds N]');out[process.argv[i].slice(2)]=process.argv[i+1];}return out;}
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
 for(const key of new Set(show.atoms.map(a=>a.hero?.layout_source))){if(!key)throw Error('Every atom needs a hero layout');layouts[key]=read(local(key));}
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
 const result=await HMComposeClient.composeShow(validationShow,{cameraPresets:read(local('presets/camera_presets.json')),fxPresets:read(local('presets/fx_presets.json')),loadJson:async p=>{if(!layouts[p])throw Error('Missing layout '+p);return layouts[p];}});
 if(!result.ok)throw Error(result.errors.join('\n'));
 const paths=new Set(media.map(m=>m.src));Object.values(result.layout).forEach(l=>{if(l.full)paths.add(l.full);if(l.background?.src)paths.add(l.background.src);for(const p of l.parts||[])paths.add(p.src);});Object.values(result.timeline.bg||{}).filter(p=>typeof p==='string').forEach(p=>paths.add(p));for(const o of result.timeline.overlays||[])if(o.src)paths.add(o.src);
 const assets={};for(const key of paths){const f=resolveImage(key);if(f.startsWith('data:'))continue;const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'}[path.extname(f).toLowerCase()];if(!mime)throw Error('Unsupported image '+f);assets[key]='data:'+mime+';base64,'+fs.readFileSync(f).toString('base64');}
 const target=path.resolve(opt.out);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify({version:1,show,layouts,media,assets}));
 const report={show_id:show.show_id,duration_s:result.duration_s,plates:result.timeline.plates.length,images:Object.keys(assets).length,prefix,warnings:result.warnings,portable_project:target};
 fs.writeFileSync(target.replace(/\.json$/,'')+'.validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});

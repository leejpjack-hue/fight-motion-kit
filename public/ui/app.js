/* No server mutations: editing, composing and persistence all run on this device. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const copy = x => structuredClone(x);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid = () => 'clip-' + crypto.randomUUID();
  const DEMO = 'daiyu-wang-five-seconds';
  const ORIGINAL = 'daiyu-wang-codex-import';
  const CONTINUATION = 'daiyu-wang-ten-seconds';
  const DEFAULT_FIGHT_PACK = ['low_rise','eye_orbit','eye_push','ecu_fist_lens','upward_inside','whip_A_to_B','dutch_snap','pull_aftermath'];
  let project, presets, effects, fightPacks, renderer, result, selected = 0, time = 0, playing = false, looping = false, onion = true, copiedCam = null;
  let abEnabled = true, projectB = null, resultB = null, rendererB = null, sourceKindB = 'gold', sourceValueB = DEMO, importedProjectB = null;
  let history = [], historyIndex = -1, compileVersion = 0, renderedVersion = -1, compileVersionB = 0, saveVersion = 0, replacing = false, recording = false, preparing = false, playToken = 0;
  let clockStart = 0, timeStart = 0, dragIndex = -1, playbackFrame = 0, plateJumpSig = null, jumpingPlate = false;
  let loadRequest = 0, loading = false, loadRequestB = 0, loadingB = false;
  const durationOf = p => Math.round((p?.show?.atoms?.reduce((s,a) => s + a.duration_s, 0) || 0) * 10000) / 10000;
  const duration = () => durationOf(project);
  const durationB = () => projectB ? durationOf(projectB) : Math.round((resultB?.timeline?.duration_s || 0) * 10000) / 10000;
  const maxScrubDuration = () => Math.max(duration(), abEnabled ? durationB() : 0);
  const atom = () => project?.show.atoms[selected];
  const startOf = index => project.show.atoms.slice(0,index).reduce((s,a) => s + a.duration_s, 0);
  const format = t => `${String(Math.floor(t/60)).padStart(2,'0')}:${(t%60).toFixed(2).padStart(5,'0')}`;
  function status(text, bad = false) { $('status').textContent = text; $('status').style.color = bad ? 'var(--danger)' : ''; }
  function safe(fn) { return async (...args) => { try { await fn(...args); } catch (e) { status(e.message, true); $('exportStatus').textContent=e.message; $('exportStatus').classList.add('error'); } }; }
  function on(id, fn) { $(id)?.addEventListener('click', safe(fn)); }
  async function json(url) { const r=await fetch(url); if(!r.ok) throw new Error(`Could not open ${url} (${r.status})`); return r.json(); }
  function pathsSafe(value) {
    if (typeof value === 'string' && /^(javascript:|https?:|\/\/|data:(?!image\/(png|jpeg|webp|gif);base64,))/i.test(value)) throw new Error('Project contains a nonlocal asset URL. Use embedded PNG, JPG or WebP images.');
    if (value && typeof value === 'object') Object.values(value).forEach(pathsSafe);
  }
  function syncSegmentsToDuration(cam, dur) {
    if (!cam?.segments?.length) return;
    const sum = cam.segments.reduce((s, x) => s + (+x.dur_s || 0), 0);
    if (sum <= 0) {
      const each = +(dur / cam.segments.length).toFixed(4);
      let rem = dur;
      cam.segments.forEach((s, i) => { s.dur_s = i === cam.segments.length - 1 ? +rem.toFixed(4) : each; rem -= s.dur_s; });
      return;
    }
    let acc = 0;
    cam.segments.forEach((s, i) => {
      if (i === cam.segments.length - 1) s.dur_s = +(dur - acc).toFixed(4);
      else { s.dur_s = +(s.dur_s / sum * dur).toFixed(4); acc += s.dur_s; }
    });
  }
  function validate(p) {
    if (!p?.show || !Array.isArray(p.show.atoms) || !p.layouts || !Array.isArray(p.media)) throw new Error('Choose an HTML Motion project JSON file.');
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(p.show.show_id || '')) throw new Error('Project ID must use lowercase letters, numbers, hyphens or underscores.');
    if (p.show.atoms.length > 300) throw new Error('A project can contain up to 300 clips.');
    const ids = new Set();
    for (const a of p.show.atoms) {
      if (ids.has(a.id)) throw new Error('Duplicate clip ID: ' + a.id); ids.add(a.id);
      if (!Number.isFinite(a.duration_s) || a.duration_s < .1 || !Number.isInteger(a.plates_needed) || a.plates_needed < 1) throw new Error('Each clip needs a duration of at least 0.1 seconds and at least one plate.');
      if (a.pose_mode !== 'hero' || !a.hero || !p.layouts[a.hero.layout_source]) throw new Error('This editor needs a plate layout for each clip. Library pose synthesis remains a kit-only tool.');
      if (!Array.isArray(a.hero.plates) || a.hero.plates.length !== a.plates_needed || a.hero.plates.some(id => !p.layouts[a.hero.layout_source][id])) throw new Error('A clip refers to a missing plate.');
      if (a.camera?.segments?.length) syncSegmentsToDuration(a.camera, a.duration_s);
      if(a.background)pathsSafe(a.background);
    }
    if (p.show.atoms.reduce((s,a)=>s+a.duration_s,0) > 120) throw new Error('Keep the sequence within 120 seconds.');
    if(p.assets)for(const value of Object.values(p.assets))if(typeof value!=='string'||!/^data:image\/(png|jpeg|webp|gif);base64,/.test(value))throw new Error('Embedded assets must be image data, not external URLs.');
    Object.values(p.layouts).forEach(pathsSafe); (p.media||[]).forEach(m=>pathsSafe(m.src)); Object.values(p.show.bg||{}).filter(v=>typeof v==='string').forEach(pathsSafe); (p.show.overlays||[]).forEach(o=>{if(o.src)pathsSafe(o.src);}); if(p.show.fg)pathsSafe(p.show.fg);
  }
  async function builtIn(id) {
    const show = await json('/shows/' + id + '.json'); const layouts = {};
    for (const key of new Set(show.atoms.map(a=>a.hero?.layout_source).filter(Boolean))) {
      const layout = await json('/'+key);
      if (id === ORIGINAL) for (const l of Object.values(layout)) {if(l.full)l.full=l.full.replace(/(plates\/[^/]+)\.png$/, '$1.jpg');for (const p of l.parts||[]) p.src=p.src.replace(/(cutout\/[^/]+)\.png$/, '$1.webp');}
      layouts[key] = layout;
    }
    const media = [];
    for (const [key,l] of Object.entries(layouts)) for (const [pid,entry] of Object.entries(l)) {
      const dir=key.slice(0,key.lastIndexOf('/')+1);
      const src=entry.full ? dir+entry.full : id===ORIGINAL && !pid.includes('_') ? `assets/${ORIGINAL}/plates/${pid}.jpg` : dir+entry.parts?.[0]?.src;
      if (src) media.push({id:uid(),name:pid,src,layoutSource:key,plateId:pid});
    }
    return {version:1, show, layouts, media};
  }
  async function load(p) {
    const request=++loadRequest;loading=true;
    try {
    validate(p); pause(); project=copy(p); selected=project.show.atoms.length?0:-1;time=0;
    history=[copy(project)];historyIndex=0;result=null;
    update(); await compile();if(request!==loadRequest)return false;await persist();if(request!==loadRequest)return false;
    status(project.show.atoms.length?`Ready · ${duration().toFixed(2)}s · All processing stays in your browser`:'Blank project · Add a library image or import images to begin');
    const url=new URL(location.href);url.searchParams.set('show',project.show.show_id);historyReplace(url);
    return true;
    } finally {if(request===loadRequest)loading=false;}
  }
  async function openProject(source) {
    const request=++loadRequest;loading=true;pause();status('Opening project…');
    try {const next=await source;if(request===loadRequest)return await load(next);return false;}
    finally {if(request===loadRequest)loading=false;}
  }
  function historyReplace(url) { window.history.replaceState(null,'',url); }
  async function persist() {
    const v=++saveVersion; $('saveState').textContent='Saving…';
    try { await HMAssetStore.put('active', copy(project)); if(v===saveVersion)$('saveState').textContent='Saved on this device'; }
    catch(e){$('saveState').textContent='Not saved · download a project';status('Browser storage unavailable. Use Save project to keep your work.',true);}
  }
  function commit() {
    validate(project); pause();
    if(JSON.stringify(project)===JSON.stringify(history[historyIndex])){update();return;}
    history=history.slice(0,historyIndex+1);history.push(copy(project)); if(history.length>60)history.shift();historyIndex=history.length-1;
    time=Math.min(time,duration());update();void compile().catch(e=>status(e.message,true));void persist();
  }
  function edit(fn) {
    const before=copy(project);
    try {fn();validate(project);commit();} catch(e){project=before;update();throw e;}
  }
  function restore(delta) {const i=historyIndex+delta;if(i<0||i>=history.length)return;pause();historyIndex=i;project=copy(history[i]);selected=Math.min(selected,project.show.atoms.length-1);time=Math.min(time,duration());update();void compile().catch(e=>status(e.message,true));void persist();status(delta<0?'Undid last edit':'Redid last edit');}
  function captionOverlays(show) {
    show.overlays=(show.overlays||[]).filter(o=>!o.editor_caption);let t=0;
    show.atoms.forEach(a=>{if(a.caption)show.overlays.push({id:'caption-'+a.id,editor_caption:true,kind:'text',text:a.caption,t_start:t,t_end:t+a.duration_s,x:640,y:644,z:20,style:{fontSize:38,fill:'#ffffff',stroke:'#17201d',strokeWidth:7}});t+=a.duration_s;});
  }
  async function compile() {
    const v=++compileVersion;
    if(!project.show.atoms.length){result=null;renderer=null;$('stage').getContext('2d').clearRect(0,0,1280,720);updateTransport();renderPlateJump();return null;}
    const snapshot=copy(project);captionOverlays(snapshot.show);
    try {
      const r=await HMComposeClient.composeShow(snapshot.show,{cameraPresets:presets,fxPresets:effects,loadJson:async p=>{if(snapshot.layouts[p])return snapshot.layouts[p];return json('/'+p);}});
      if(!r.ok)throw new Error(r.errors.join('; '));
      const next=HMMotion($('stage'),snapshot.assets||{});await next.load(r);
      if(v!==compileVersion)return null;
      result=r;renderer=next;renderedVersion=v;draw();renderPlateJump();window.dispatchEvent(new Event('hm:projectchange'));status(`Ready · ${r.duration_s.toFixed(2)}s · ${r.stats.plates} plates · All processing stays in your browser`);return r;
    }catch(e){if(v===compileVersion){result=null;renderer=null;renderPlateJump();status('Preview unavailable: '+e.message,true);}throw e;}
  }
  function activeAtFor(p, t) {
    if (!p?.show?.atoms?.length) return 0;
    let s = 0;
    const idx = p.show.atoms.findIndex(a => { s += a.duration_s; return t < s - 1e-7; });
    return idx >= 0 ? idx : Math.max(0, p.show.atoms.length - 1);
  }
  function activeAt(t) { return activeAtFor(project, t); }
  async function normalizeReferenceInput(parsed) {
    if (!parsed || typeof parsed !== 'object') throw new Error('Choose an HTML Motion project JSON file.');
    let p = copy(parsed);
    if (!p.show && p.show_id && Array.isArray(p.atoms)) {
      const layouts = {};
      for (const key of new Set(p.atoms.map(a => a.hero?.layout_source).filter(Boolean))) {
        if (project?.layouts?.[key]) { layouts[key] = copy(project.layouts[key]); continue; }
        if (!/^assets\/[a-zA-Z0-9_./-]+\.json$/.test(key) || key.includes('..')) throw new Error('Open a portable .motion.json project to include local images.');
        const layout = await json('/' + key);
        if (p.show_id === ORIGINAL) {
          for (const l of Object.values(layout)) {
            if (l.full) l.full = l.full.replace(/(plates\/[^/]+)\.png$/, '$1.jpg');
            for (const part of l.parts || []) part.src = part.src.replace(/(cutout\/[^/]+)\.png$/, '$1.webp');
          }
        }
        layouts[key] = layout;
      }
      const media = [];
      for (const [key, l] of Object.entries(layouts)) {
        const dir = key.slice(0, key.lastIndexOf('/') + 1);
        for (const [id, e] of Object.entries(l)) {
          const src = e.full ? dir + e.full : e.parts?.[0]?.src ? dir + e.parts[0].src : null;
          if (src) media.push({ id: uid(), name: id, src, layoutSource: key, plateId: id });
        }
      }
      p = { version: 1, show: p, layouts, media, assets: copy(p.assets || {}) };
    }
    validate(p);
    return p;
  }
  function refreshAbSourceOptions() {
    const customGroup = $('abCustomGroup');
    if (!customGroup) return;
    customGroup.replaceChildren();
    const snapOpt = document.createElement('option');
    snapOpt.value = 'snapshot:current';
    snapOpt.textContent = 'Snapshot · Current A draft';
    customGroup.append(snapOpt);
    if (importedProjectB?.show?.show_id) {
      const impOpt = document.createElement('option');
      impOpt.value = 'import:' + importedProjectB.show.show_id;
      impOpt.textContent = `Import · ${importedProjectB.show.title || importedProjectB.show.show_id} (${importedProjectB.show.show_id})`;
      customGroup.append(impOpt);
    }
    const locals = window.HMFeStore?.listLocalShows?.() || [];
    for (const entry of locals) {
      const sid = entry?.show?.show_id;
      if (!sid || (importedProjectB?.show?.show_id === sid && sourceValueB === 'import:' + sid)) continue;
      const opt = document.createElement('option');
      opt.value = 'local:' + sid;
      opt.textContent = `Local · ${entry.show.title || sid} (${sid})`;
      customGroup.append(opt);
    }
    const sel = $('abSource');
    if (sel && [...sel.options].some(o => o.value === sourceValueB)) sel.value = sourceValueB;
  }
  function updateAbUI() {
    if (!$('abContainer')) return;
    $('abToggle')?.setAttribute('aria-pressed', String(abEnabled));
    $('abContainer').dataset.ab = String(abEnabled);
    if ($('paneB')) $('paneB').hidden = !abEnabled;
    if ($('abCompareBar')) $('abCompareBar').hidden = !abEnabled;
    const dA = duration(), countA = project?.show?.atoms?.length || 0;
    if ($('paneALabel')) $('paneALabel').textContent = 'A · Current draft';
    if ($('paneAShowId')) $('paneAShowId').textContent = project?.show?.show_id || '—';
    if ($('paneAMeta')) $('paneAMeta').textContent = `${countA} clips · ${dA.toFixed(2)}s`;
    const dB = durationB(), countB = projectB?.show?.atoms?.length || 0;
    if ($('paneBLabel')) {
      $('paneBLabel').textContent = sourceKindB === 'import' ? 'B · Import reference' : sourceKindB === 'snapshot' ? 'B · Snapshot reference' : 'B · Gold reference';
    }
    if ($('paneBShowId')) $('paneBShowId').textContent = projectB?.show?.show_id || '—';
    if ($('paneBMeta')) $('paneBMeta').textContent = projectB ? `${countB} clips · ${dB.toFixed(2)}s` : 'No reference';
    if ($('emptyStageB')) $('emptyStageB').hidden = !!countB;
    if ($('stageLabelB')) $('stageLabelB').hidden = !countB;
    if ($('scrub')) $('scrub').max = maxScrubDuration() || 1;
  }
  async function compileB() {
    const v = ++compileVersionB;
    if (!projectB?.show?.atoms?.length) {
      resultB = null; rendererB = null;
      $('stageB')?.getContext('2d').clearRect(0, 0, 1280, 720);
      updateAbUI(); updateTransport();
      return null;
    }
    const snapshotB = copy(projectB); captionOverlays(snapshotB.show);
    try {
      const r = await HMComposeClient.composeShow(snapshotB.show, {
        cameraPresets: presets,
        fxPresets: effects,
        loadJson: async p => { if (snapshotB.layouts[p]) return snapshotB.layouts[p]; return json('/' + p); }
      });
      if (!r.ok) throw new Error(r.errors.join('; '));
      const nextB = HMMotion($('stageB'), snapshotB.assets || {});
      await nextB.load(r);
      if (v !== compileVersionB) return null;
      resultB = r; rendererB = nextB;
      updateAbUI(); draw();
      return r;
    } catch (e) {
      if (v === compileVersionB) { resultB = null; rendererB = null; status('Reference B unavailable: ' + e.message, true); }
      throw e;
    }
  }
  async function loadB(nextProject, kind = 'gold', valueKey = '') {
    const request = ++loadRequestB; loadingB = true;
    try {
      const normalized = await normalizeReferenceInput(nextProject);
      if (request !== loadRequestB) return false;
      pause();
      projectB = copy(normalized);
      sourceKindB = kind;
      sourceValueB = valueKey || (kind === 'snapshot' ? 'snapshot:current' : kind === 'import' ? 'import:' + projectB.show.show_id : projectB.show.show_id);
      if (kind === 'import') {
        importedProjectB = copy(projectB);
        try { window.HMFeStore?.putLocalShow?.(copy(projectB.show)); } catch (_) {}
      }
      try { window.HMFeStore?.putRefB?.({ kind: sourceKindB, value: sourceValueB, show_id: projectB.show.show_id, title: projectB.show.title || projectB.show.show_id }); } catch (_) {}
      refreshAbSourceOptions();
      await compileB();
      if (request !== loadRequestB) return false;
      updateAbUI(); draw();
      return true;
    } finally {
      if (request === loadRequestB) loadingB = false;
    }
  }
  async function openReferenceB(source, kind = 'gold', valueKey = '') {
    const request = ++loadRequestB; loadingB = true; pause();
    try {
      const next = await source;
      if (request === loadRequestB) return await loadB(next, kind, valueKey);
      return false;
    } finally {
      if (request === loadRequestB) loadingB = false;
    }
  }
  async function snapshotAToB() {
    if (!project?.show?.atoms?.length) throw new Error('Add at least one clip to A before taking a snapshot.');
    abEnabled = true;
    const snap = copy(project);
    const ok = await loadB(snap, 'snapshot', 'snapshot:current');
    if (ok) status(`Snapshotted current A draft (${snap.show.show_id}) to B reference`);
    return ok;
  }
  async function selectBSource(rawValue) {
    const val = String(rawValue || '').trim();
    if (!val) return false;
    abEnabled = true;
    const cleanGold = val.replace(/^gold:/, '');
    if ([DEMO, CONTINUATION, ORIGINAL].includes(cleanGold)) {
      const ok = await openReferenceB(builtIn(cleanGold), 'gold', cleanGold);
      if (ok) status(`Reference B set to Gold · ${projectB.show.title || cleanGold} (${cleanGold}) · Draft A unchanged`);
      return ok;
    }
    if (val === 'snapshot:current') return await snapshotAToB();
    if (val.startsWith('import:') && importedProjectB) {
      const ok = await loadB(importedProjectB, 'import', val);
      if (ok) status(`Reference B set to Import · ${projectB.show.title || projectB.show.show_id} · Draft A unchanged`);
      return ok;
    }
    if (val.startsWith('local:')) {
      const sid = val.slice(6);
      const localShow = window.HMFeStore?.getLocalShow?.(sid);
      if (!localShow) throw new Error('Local show not found: ' + sid);
      const ok = await loadB(localShow, 'import', val);
      if (ok) status(`Reference B set to Local · ${projectB.show.title || sid} · Draft A unchanged`);
      return ok;
    }
    throw new Error('Unknown reference source: ' + val);
  }
  function toggleAb(force) {
    abEnabled = typeof force === 'boolean' ? force : !abEnabled;
    updateAbUI();
    draw();
  }
  function mediaFor(a) {return project.media.find(m=>m.layoutSource===a?.hero?.layout_source&&m.plateId===a.hero.plates[0]);}
  function assetSrc(path) {return project.assets?.[path] || (/^(data:|blob:|\/)/.test(path)?path:'/'+path);}
  function thumbnail(a) {return assetSrc(mediaFor(a)?.src || '');}
  function updateOnionGhost() {
    const prevEl = $('onionPrev'), nextEl = $('onionNext');
    if (!prevEl || !nextEl) return;
    if (!project?.show?.atoms?.length) { prevEl.hidden = true; nextEl.hidden = true; return; }
    const d = duration();
    const idx = activeAt(Math.min(time, Math.max(0, d - 1e-5)));
    const cur = project.show.atoms[idx] || project.show.atoms[0];
    const prev = idx > 0 ? project.show.atoms[idx - 1] : null;
    const next = idx < project.show.atoms.length - 1 ? project.show.atoms[idx + 1] : null;
    const fallbackSrc = thumbnail(cur);
    prevEl.src = prev ? thumbnail(prev) : fallbackSrc;
    nextEl.src = next ? thumbnail(next) : fallbackSrc;
    const showGhost = onion && !playing && !recording;
    prevEl.hidden = !(showGhost && prev);
    nextEl.hidden = !(showGhost && next);
  }
  function update() {
    $('projectTitle').value=project.show.title||project.show.show_id;$('previewTitle').textContent=project.show.title||'Untitled exchange';
    $('mediaCount').textContent=project.media.length+' images';$('timelineCount').textContent=`${project.show.atoms.length} clips · ${duration().toFixed(2)}s`;
    $('emptyStage').hidden=!!project.show.atoms.length;$('stageLabel').hidden=!project.show.atoms.length;
    $('undo').disabled=historyIndex<=0;$('redo').disabled=historyIndex>=history.length-1;
    ['play','previous','next','restart','exportOpen','fitThree','fitFive','fitEight','fitTen','fightCamPack'].forEach(id=>{if($(id))$(id).disabled=!project.show.atoms.length||recording;});
    ['abToggle','abSource','abImport'].forEach(id=>{if($(id))$(id).disabled=recording;});
    if($('abSnapshot'))$('abSnapshot').disabled=!project.show.atoms.length||recording;
    ['duplicate','delete','trimMinus','trimPlus'].forEach(id=>{if($(id))$(id).disabled=!atom();});
    renderMedia();renderTimeline();renderInspector();updateAbUI();updateTransport();renderPlateJump();window.dispatchEvent(new Event('hm:projectchange'));
  }
  function renderPlateJump() {
    const box=$('plateJumpChips'), list=$('plateJumpList');
    if(!box||!list) return;
    const catalog=HMComposeClient.plateCatalog(result);
    const sig=catalog.map(p=>p.slot_id+'@'+p.t0+':'+p.source_plate+':'+p.atom_index).join('|');
    if(sig!==plateJumpSig){
      plateJumpSig=sig;
      const chips=HMComposeClient.plateJumpChips(catalog);
      const names=chips.map(p=>p.source_plate);
      const dup=new Set(names.filter((name,i)=>names.indexOf(name)!==i));
      box.replaceChildren();
      for(const mark of chips){
        const b=document.createElement('button');
        b.type='button';
        b.className='plate-jump-chip';
        b.dataset.index=String(mark.index);
        b.textContent=dup.has(mark.source_plate)?HMComposeClient.plateJumpOption(mark):mark.source_plate;
        b.title=`Jump to ${mark.source_plate} at ${format(mark.t0)}`;
        b.setAttribute('aria-label', b.title);
        b.onclick=()=>jumpToPlate({index:mark.index});
        box.append(b);
      }
      list.replaceChildren();
      for(const mark of catalog){
        const o=document.createElement('option');
        o.value=HMComposeClient.plateJumpOption(mark);
        list.append(o);
      }
    }
    syncPlateJumpState();
  }
  function syncPlateJumpState() {
    const catalog=result?HMComposeClient.plateCatalog(result):[];
    const here=catalog.length?HMComposeClient.inspectAt(result,time):null;
    const idx=here?here.plate_index:-1;
    if($('platePrev')) $('platePrev').disabled=!catalog.length||idx<=0||recording;
    if($('plateNext')) $('plateNext').disabled=!catalog.length||idx<0||idx>=catalog.length-1||recording;
    if($('plateJumpSearch')) $('plateJumpSearch').disabled=!catalog.length||recording;
    let active=-1;
    document.querySelectorAll('.plate-jump-chip').forEach(b=>{const i=+b.dataset.index;if(i<=idx)active=i;});
    document.querySelectorAll('.plate-jump-chip').forEach(b=>{
      const on=+b.dataset.index===active;
      b.setAttribute('aria-pressed', String(on));
    });
  }
  function jumpToPlate(query) {
    if(recording||!result||jumpingPlate) return false;
    const catalog=HMComposeClient.plateCatalog(result);
    const here=HMComposeClient.inspectAt(result,time);
    const mark=HMComposeClient.resolvePlateJump(catalog, query, here?here.plate_index:-1);
    if(!mark){
      if(typeof query==='string'&&query.trim()) status('No plate matches "'+query.trim()+'".', true);
      return false;
    }
    jumpingPlate=true;
    try {
      pause();
      selected=Math.max(0, Math.min(mark.atom_index, Math.max(0, project.show.atoms.length-1)));
      time=mark.t0;
      renderTimeline();renderInspector();renderMedia();draw();
      const label=HMComposeClient.plateJumpOption(mark);
      if($('plateJumpSearch')&&$('plateJumpSearch').value!==label) $('plateJumpSearch').value=label;
      status(`Jumped to ${mark.source_plate} · ${format(mark.t0)}`);
      document.querySelector('.timeline-clip.active')?.scrollIntoView({block:'nearest', inline:'nearest'});
      return true;
    } finally { jumpingPlate=false; }
  }
  function renderMedia() {
    const query=$('mediaSearch').value.toLowerCase();$('mediaGrid').replaceChildren();
    project.media.filter(m=>m.name.toLowerCase().includes(query)).forEach(m=>{
      const card=document.createElement('div');card.className='media-card'+(mediaFor(atom())?.id===m.id?' selected':'');
      card.innerHTML=`<button class="media-image" title="Use ${esc(m.name)} in selected clip" aria-label="Use ${esc(m.name)} in selected clip"><img src="${esc(assetSrc(m.src))}" alt="${esc(m.name)}"></button><div class="media-meta"><span>${esc(m.name)}</span><button class="media-add" title="Add ${esc(m.name)} to timeline" aria-label="Add ${esc(m.name)} to timeline">＋</button></div>`;
      card.querySelector('.media-image').onclick=safe(()=>{if(!atom())return addMedia(m);edit(()=>{atom().hero={layout_source:m.layoutSource,plates:[m.plateId]};atom().plates_needed=1;});replacing=false;document.querySelector('.inspector').dataset.replacing='false';status('Replaced selected plate with '+m.name);});
      card.querySelector('.media-add').onclick=safe(()=>addMedia(m));$('mediaGrid').append(card);
    });
  }
  function addMedia(m) {edit(()=>{project.show.atoms.push({id:uid(),label:m.name,kind:'duo',duration_s:.5,plates_needed:1,pose_mode:'hero',motion:{family:'fight',beat_class:'straight'},hero:{layout_source:m.layoutSource,plates:[m.plateId]},camera:{preset:'static_hold'},fx_hooks:[]});selected=project.show.atoms.length-1;time=startOf(selected);});}
  function beatTickMarkup(raw) {
    const hk=typeof raw==='string'?{type:raw}:(raw&&typeof raw==='object'?raw:null);
    if(!hk||!hk.type)return '';
    const tRel=hk.t_rel!=null&&Number.isFinite(+hk.t_rel)?+hk.t_rel:0.08;
    const pct=Math.round(Math.max(0,Math.min(1,tRel))*10000)/100;
    return `<span class="beat-tick" data-type="${esc(hk.type)}" data-t-rel="${tRel}" style="left:${pct}%" title="FX: ${esc(hk.type)} @ ${pct.toFixed(0)}%"></span>`;
  }
  function renderTimeline() {
    const d=duration();$('timelineClips').replaceChildren();
    project.show.atoms.forEach((a,i)=>{
      const b=document.createElement('button');b.className='timeline-clip'+(selected===i?' active':'');b.style.flex=a.duration_s+' 0 0';b.draggable=true;b.dataset.index=i;
      b.setAttribute('aria-label',`${i+1}. ${a.label||a.id}, ${a.duration_s.toFixed(2)} seconds`);b.setAttribute('aria-pressed',String(i===selected));
      const ticks=(a.fx_hooks||[]).map(beatTickMarkup).join('');
      b.innerHTML=`${ticks}<img src="${esc(thumbnail(a))}" alt=""><span class="clip-label">${esc(String(i+1).padStart(2,'0')+' '+(a.label||a.id))}</span><span class="clip-duration">${a.duration_s.toFixed(2)}s</span>`;
      b.onclick=()=>select(i);b.ondragstart=e=>{dragIndex=i;e.dataTransfer.setData('text/plain',String(i));e.dataTransfer.effectAllowed='move';};b.ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='move';};
      b.ondrop=safe(e=>{e.preventDefault();if(dragIndex<0||dragIndex===i)return;edit(()=>{const [a]=project.show.atoms.splice(dragIndex,1);project.show.atoms.splice(i,0,a);selected=i;time=startOf(i);});dragIndex=-1;});
      b.ondragend=()=>{dragIndex=-1;};$('timelineClips').append(b);
    });
    $('ruler').replaceChildren();for(let i=0;i<=5;i++){const s=document.createElement('span');s.textContent=(d*i/5).toFixed(d<10?1:0)+'s';s.style.left=i*20+'%';$('ruler').append(s);}
    $('scrub').max=maxScrubDuration()||1;
  }
  function syncFxProfileChips() {
    const profile=HMComposeClient.resolveFxProfile(project?.show);
    document.querySelectorAll('#fxProfileToggle button[data-fx-profile]').forEach(b=>{
      const on=b.dataset.fxProfile===profile;
      b.setAttribute('aria-pressed',String(on));
      b.classList.toggle('active',on);
    });
    const note=$('fxProfileNote');
    if(note){
      note.dataset.fxProfile=profile;
      note.textContent=HMComposeClient.fxProfileHonesty(profile);
    }
    const active=atom()?.fx_hooks?.[0]?.type||'none';
    document.querySelectorAll('#effectOptions [data-effect]').forEach(b=>{
      const photo=HMComposeClient.isPhotoFxChip(b.dataset.effect);
      b.dataset.fxFamily=b.dataset.effect==='none'?'clean':photo?'photo':'ink';
      if(b.dataset.fxTitle==null)b.dataset.fxTitle=b.title||'';
      const demoted=profile==='comic'&&photo&&b.dataset.effect===active;
      b.hidden=profile==='comic'&&photo&&!demoted;
      b.classList.toggle('fx-chip-demoted',demoted);
      b.title=demoted?'Demoted in Comic/ink. The chip stays on this show. Switch to Full chips to opt in.':b.dataset.fxTitle;
    });
  }
  function renderInspector() {
    const a=atom();$('inspectorEmpty').hidden=!!a;$('inspectorContent').hidden=!a;$('clipIndex').textContent=a?`${String(selected+1).padStart(2,'0')} / ${String(project.show.atoms.length).padStart(2,'0')}`:'—';if(!a){syncFxProfileChips();return;}
    $('clipThumbnail').src=thumbnail(a);$('clipName').value=a.label||a.id;$('duration').value=+a.duration_s.toFixed(4);$('timingHint').textContent=`${startOf(selected).toFixed(2)}s → ${(startOf(selected)+a.duration_s).toFixed(2)}s`;
    const cam=a.camera||{};
    $('camera').value=cam.preset||cam.segments?.[0]?.preset||'static_hold';
    const inten=cam.intensity!=null?+cam.intensity:1;
    $('camIntensity').value=inten;$('camIntensityValue').textContent=Math.round(inten*100)+'%';
    const n=cam.nudge||{};
    $('zoom').value=n.s||0;$('zoomValue').textContent=Math.round((n.s||0)*100)+'%';
    $('panX').value=n.x||0;$('panY').value=n.y||0;$('roll').value=n.r||0;
    const segs=cam.segments;
    const isDual=Array.isArray(segs)&&segs.length>=2;
    $('dualCamToggle').checked=isDual;
    $('dualCamStrip').hidden=!isDual;
    if(isDual){
      $('segAPreset').value=segs[0].preset||'static_hold';
      $('segBPreset').value=segs[1].preset||'static_hold';
      const ratio=a.duration_s>0?Math.max(0.1,Math.min(0.9,segs[0].dur_s/a.duration_s)):0.5;
      $('segSplit').value=+ratio.toFixed(2);
      $('segSplitValue').textContent=`${Math.round(ratio*100)} / ${Math.round((1-ratio)*100)}%`;
      $('dualCamDurs').textContent=`${(+segs[0].dur_s).toFixed(2)}s + ${(+segs[1].dur_s).toFixed(2)}s`;
    } else {
      $('dualCamDurs').textContent='';
    }
    $('pasteCam').disabled=!copiedCam;$('pasteCamAll').disabled=!copiedCam;
    $('caption').value=a.caption||'';
    const effect=a.fx_hooks?.[0]?.type||'none';
    document.querySelectorAll('[data-effect]').forEach(b=>{b.classList.toggle('active',b.dataset.effect===effect);b.setAttribute('aria-pressed',String(b.dataset.effect===effect));});
    syncFxProfileChips();
    const paramHk=(a.fx_hooks||[]).find(h=>['fist_pressure','leg_arc','tornado_spiral','exposure_warm_crush'].includes(h?.type||h));
    if($('fxLocSizeBox')){
      $('fxLocSizeBox').hidden=!paramHk;
      if(paramHk){
        const prm=(typeof paramHk==='object'&&paramHk.params)||{};
        if(document.activeElement!==$('fxLocX'))$('fxLocX').value=Number.isFinite(+prm.x)?+prm.x:0;
        if(document.activeElement!==$('fxLocY'))$('fxLocY').value=Number.isFinite(+prm.y)?+prm.y:0;
        if(document.activeElement!==$('fxScale'))$('fxScale').value=Number.isFinite(+prm.scale)&&+prm.scale>0?+prm.scale:1;
      }
    }
    updateFxHonestyUI();
  }
  function paintedFxHooks(hooks) {
    const list=hooks||[];
    if(HMComposeClient.resolveFxProfile(project?.show)!=='comic')return list;
    return list.filter(h=>!HMComposeClient.isPhotoFxChip(typeof h==='string'?h:h?.type));
  }
  function updateFxHonestyUI() {
    const badge=$('fxPreviewBadge'),banner=$('fxHonestyBanner'),note=$('fxHonestyNote');
    const hasAtoms=!!project?.show?.atoms?.length;
    const d=duration();
    const activeIdx=hasAtoms?activeAt(Math.min(time,Math.max(0,d-1e-5))):-1;
    const activeClip=activeIdx>=0?project.show.atoms[activeIdx]:null;
    const stageInfo=HMComposeClient.classifyFxHooks(paintedFxHooks(activeClip?.fx_hooks),effects);
    const selClip=atom();
    const selInfo=HMComposeClient.classifyFxHooks(paintedFxHooks(selClip?.fx_hooks),effects);
    const profile=HMComposeClient.resolveFxProfile(project?.show);
    const demoted=(selClip?.fx_hooks||[]).filter(h=>profile==='comic'&&HMComposeClient.isPhotoFxChip(typeof h==='string'?h:h?.type)).map(h=>typeof h==='string'?h:h.type);
    if(badge){
      if(!hasAtoms||!stageInfo.hasAny){
        badge.hidden=true;badge.dataset.fxMode='none';badge.textContent='';
      }else if(stageInfo.hasComposeOnly&&!stageInfo.hasLive){
        badge.hidden=false;badge.dataset.fxMode='compose-only';badge.textContent=`Compose-only · ${stageInfo.composeOnly.map(h=>h.type).join(' + ')}`;
      }else{
        badge.hidden=false;badge.dataset.fxMode='live-standin';badge.textContent=`⚡ Live FX stand-in · ${stageInfo.live.map(h=>h.type).join(' + ')}`;
      }
    }
    if(banner){
      if(hasAtoms&&stageInfo.hasComposeOnly){
        banner.hidden=false;banner.dataset.honesty='compose-only';
        banner.textContent=`⚠ Compose-only FX (${stageInfo.composeOnly.map(h=>h.type).join(', ')}) — cannot preview live on canvas; full pass renders on Compose / export.`;
      }else{
        banner.hidden=true;banner.dataset.honesty=stageInfo.hasLive?'live-standin':'clean';banner.textContent='';
      }
    }
    if(note){
      const held=demoted.length?` Photographic ${demoted.join(', ')} stay on this clip and do not paint until Full chips.`:'';
      if(!selClip||(!selInfo.hasAny&&!demoted.length)){
        note.dataset.fxState='clean';note.textContent='An accent at the start of this clip.';
      }else if(!selInfo.hasAny&&demoted.length){
        note.dataset.fxState='demoted';note.textContent=held.trim();
      }else if(selInfo.hasComposeOnly){
        note.dataset.fxState='compose-only';note.textContent=`⚠ Compose-only (${selInfo.composeOnly.map(h=>h.type).join(', ')}) — no live canvas stand-in; full pass renders on Compose / export.${held}`;
      }else{
        const warm=paintedFxHooks(selClip.fx_hooks).some(h=>(h.type||h)==='exposure_warm_crush');
        note.dataset.fxState='live-standin';note.textContent=`⚡ Live FX stand-in (${selInfo.live.map(h=>h.type).join(', ')}) — previewing on canvas before Compose.${warm?' Warm crush duration is authorable (demo 0.10s / 3 frames) and does not gray the colored FX.':''}${held}`;
      }
    }
  }
  function select(i) {if(recording)return;pause();selected=Math.max(0,Math.min(i,project.show.atoms.length-1));time=startOf(selected);renderTimeline();renderInspector();renderMedia();draw();window.dispatchEvent(new Event('hm:projectchange'));}
  function updateTransport() {
    const d=duration(),maxD=maxScrubDuration();
    $('scrub').max=maxD||1;$('scrub').value=time;
    $('playhead').style.left=(d?Math.min(1,Math.max(0,time/d))*100:0)+'%';
    $('timecode').innerHTML=`${format(time)} <span>/ ${format(d)}</span>`;
    $('play').textContent=preparing?'…':playing?'Ⅱ':'▶';
    $('play').setAttribute('aria-label',preparing?'Cancel playback preparation':playing?'Pause':'Play');
    const i=activeAt(Math.min(time,Math.max(0,d-.00001)));
    const a=project?.show?.atoms?.[i];
    const here=result?HMComposeClient.inspectAt(result,time):null;
    $('stageLabel').textContent=a?`${here?.source_plate||a.hero.plates[0]} · ${a.label||a.id}`:'';
    if(projectB?.show?.atoms?.length&&$('stageLabelB')){
      const dB=durationB(),iB=activeAtFor(projectB,Math.min(time,Math.max(0,dB-.00001))),aB=projectB.show.atoms[iB];
      const hereB=resultB?HMComposeClient.inspectAt(resultB,time):null;
      $('stageLabelB').textContent=aB?`${hereB?.source_plate||aB.hero.plates[0]} · ${aB.label||aB.id}`:'';
    }else if($('stageLabelB')){$('stageLabelB').textContent='';}
    if($('abLinkedTime'))$('abLinkedTime').textContent=`Linked t = ${format(time)}`;
    const cmp=HMComposeClient.compareAt(result,resultB,time);
    if(cmp.a&&cmp.b){
      if($('abDiffPlate')){$('abDiffPlate').dataset.diff=cmp.diff.plate?'changed':'same';$('abDiffPlate').textContent=cmp.diff.plate?`Plate: ${cmp.a.source_plate} vs ${cmp.b.source_plate}`:`Plate: ${cmp.a.source_plate} = ${cmp.b.source_plate}`;}
      if($('abDiffCam')){$('abDiffCam').dataset.diff=cmp.diff.cam?'changed':'same';$('abDiffCam').textContent=cmp.diff.cam?`Cam: ${cmp.a.cam_preset} vs ${cmp.b.cam_preset}`:`Cam: ${cmp.a.cam_preset} = ${cmp.b.cam_preset}`;}
      if($('abDiffTiming')){$('abDiffTiming').dataset.diff=cmp.diff.timing?'changed':'same';$('abDiffTiming').textContent=cmp.diff.timing?`Timing: ${cmp.a.atom_duration_s.toFixed(2)}s vs ${cmp.b.atom_duration_s.toFixed(2)}s (${cmp.a.duration_s.toFixed(2)}s vs ${cmp.b.duration_s.toFixed(2)}s)`:`Timing: ${cmp.a.atom_duration_s.toFixed(2)}s = ${cmp.b.atom_duration_s.toFixed(2)}s (${cmp.a.duration_s.toFixed(2)}s)`;}
    }
    updateOnionGhost();
    updateFxHonestyUI();
    syncPlateJumpState();
  }
  function drawStageA() {
    const standIn=!playing&&!recording;
    if(project?.show?.atoms?.length){
      const d=duration(),i=activeAt(Math.min(time,Math.max(0,d-1e-5))),a=project.show.atoms[i],t0=startOf(i),t1=t0+(a?.duration_s||.5);
      renderer?.render(time,{onion:onion&&standIn,fxStandIn:standIn,liveHooks:a?.fx_hooks||[],atomWindow:[t0,t1]});
    }else{
      $('stage')?.getContext('2d').clearRect(0,0,1280,720);
    }
  }
  function draw() {
    const standIn=!playing&&!recording;
    drawStageA();
    if(abEnabled&&projectB?.show?.atoms?.length){
      const dB=durationB(),iB=activeAtFor(projectB,Math.min(time,Math.max(0,dB-1e-5))),aB=projectB.show.atoms[iB];
      const t0B=projectB.show.atoms.slice(0,iB).reduce((s,x)=>s+x.duration_s,0),t1B=t0B+(aB?.duration_s||.5);
      rendererB?.render(time,{onion:false,fxStandIn:standIn,liveHooks:aB?.fx_hooks||[],atomWindow:[t0B,t1B]});
    }else if(!projectB?.show?.atoms?.length){
      $('stageB')?.getContext('2d').clearRect(0,0,1280,720);
    }
    updateTransport();
  }
  function pause() {playing=false;preparing=false;playToken++;cancelAnimationFrame(playbackFrame);if(project){draw();}}
  function tick(now) {if(!playing)return;time=timeStart+(now-clockStart)/1000;const d=duration();if(time>=d){if(looping){time%=d;timeStart=time;clockStart=now;}else{time=d;playing=false;}}draw();if(playing)playbackFrame=requestAnimationFrame(tick);}
  async function play() {if(!duration()||recording)return;if(playing||preparing){pause();return;}const token=++playToken;preparing=true;updateTransport();try{if(!renderer||renderedVersion!==compileVersion)await compile();if(token!==playToken||!renderer)return;if(time>=duration()-.001)time=0;timeStart=time;clockStart=performance.now();playing=true;playbackFrame=requestAnimationFrame(tick);}finally{if(token===playToken){preparing=false;updateTransport();}}}
  function setDuration(next) {if(!Number.isFinite(next)||next<.1)throw new Error('Use a clip duration of at least 0.1 seconds.');edit(()=>{const a=atom();a.duration_s=+next.toFixed(4);if(a.camera?.segments)syncSegmentsToDuration(a.camera,a.duration_s);time=startOf(selected);});}
  function rippleTrim(delta) {if(!atom())return;const next=Math.max(0.1,+(atom().duration_s+delta).toFixed(4));setDuration(next);status(`Ripple trimmed clip to ${next.toFixed(2)}s · Total ${duration().toFixed(2)}s`);}
  function fitToSeconds(targetS) {
    const d=duration();if(!d)return;
    const target=+targetS;
    const factor=target/d;
    if(project.show.atoms.some(a=>a.duration_s*factor<.1))throw new Error(`Too many short clips to fit in ${target} seconds. Remove clips first.`);
    edit(()=>{
      let total=0;
      project.show.atoms.forEach((a,i)=>{
        const next=i===project.show.atoms.length-1?target-total:+(a.duration_s*factor).toFixed(4);
        a.duration_s=next;
        if(a.camera?.segments)syncSegmentsToDuration(a.camera,next);
        total+=next;
      });
      time=0;
    });
    status(`Timeline fitted to exactly ${target.toFixed(2)} seconds`);
  }
  function applyFightCamPack() {
    if(!project?.show?.atoms?.length)return;
    const packIds = fightPacks?.packs?.[0]?.presets || DEFAULT_FIGHT_PACK;
    edit(()=>{
      project.show.atoms.forEach((a,i)=>{
        const presetId = packIds[i % packIds.length];
        const prevNudge = a.camera?.nudge ? copy(a.camera.nudge) : undefined;
        const prevIntensity = a.camera?.intensity;
        a.camera = { preset: presetId };
        if (prevNudge && Object.keys(prevNudge).length) a.camera.nudge = prevNudge;
        if (prevIntensity != null && prevIntensity !== 1) a.camera.intensity = prevIntensity;
      });
    });
    status('Applied Fight-cam 8-pack across timeline');
  }
  function duplicate() {if(!atom())return;edit(()=>{const a=copy(atom());a.id=uid();a.label=(a.label||'Clip')+' copy';project.show.atoms.splice(selected+1,0,a);selected++;time=startOf(selected);});}
  function remove() {if(!atom())return;edit(()=>{project.show.atoms.splice(selected,1);selected=Math.min(selected,project.show.atoms.length-1);time=selected<0?0:startOf(selected);});}
  async function importImages(files) {
    if(!files.length)return;const before=copy(project);
    try {
      const items=[];
      for(const file of [...files].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}))) {
        if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Choose PNG, JPG or WebP images.');
        if(file.size>20*1024*1024)throw new Error(file.name+' is larger than 20 MB.');
        const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
        const im=new Image();im.src=data;await im.decode();const id=uid();
        items.push({id,name:file.name.replace(/\.[^.]+$/,''),src:data,layoutSource:'embedded/'+id+'/layout.json',plateId:'P01'});
      }
      edit(()=>{for(const m of items){project.media.push(m);project.layouts[m.layoutSource]={[m.plateId]:{full:m.src}};}if(!project.show.atoms.length){for(const m of items)project.show.atoms.push({id:uid(),label:m.name,kind:'duo',duration_s:.5,plates_needed:1,pose_mode:'hero',motion:{family:'fight',beat_class:'straight'},hero:{layout_source:m.layoutSource,plates:[m.plateId]},camera:{preset:'static_hold'},fx_hooks:[]});selected=0;time=0;}});
      status(`Imported ${items.length} images · Saved with this project on your device`);
    } catch(e) {project=before;update();throw e;} finally {$('imageInput').value='';}
  }
  function download(name,blob) {const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),30000);}
  function populateCameraSelect(sel) {
    sel.replaceChildren();
    for(const simple of [true,false]){
      const group=document.createElement('optgroup');group.label=simple?'Simple moves':'Original fight cameras';
      for(const p of presets.presets.filter(p=>!!p.label===simple)){
        const o=document.createElement('option');o.value=p.id;o.textContent=p.label||p.id.replaceAll('_',' ');group.append(o);
      }
      sel.append(group);
    }
  }
  async function boot() {
    [presets,effects,fightPacks]=await Promise.all([
      json('/presets/camera_presets.json'),
      json('/presets/fx_presets.json'),
      json('/presets/fight_cam_packs.json').catch(()=>({packs:[{id:'fight_8pack',presets:DEFAULT_FIGHT_PACK}]}))
    ]);
    ['camera','segAPreset','segBPreset'].forEach(id=>{if($(id))populateCameraSelect($(id));});
    let saved;try{saved=await HMAssetStore.get('active');}catch(_){}
    const sid=new URLSearchParams(location.search).get('show');
    const goldDefault=[DEMO,ORIGINAL,CONTINUATION].includes(sid)?sid:DEMO;
    const defaultGold=await builtIn(goldDefault);
    await loadB(defaultGold,'gold',goldDefault);
    if(saved&&(!sid||sid===saved.show.show_id)){try{await load(saved);}catch(e){status('Saved draft could not load: '+e.message,true);await load(copy(defaultGold));}}
    else if(sid&&![DEMO,ORIGINAL,CONTINUATION].includes(sid)){await load(copy(defaultGold));status('Requested project is not stored here. Open its saved project JSON.',true);}
    else await load(copy(defaultGold));
    const requestedTime=Number(new URLSearchParams(location.search).get('t'));if(Number.isFinite(requestedTime)){time=Math.min(maxScrubDuration(),Math.max(0,requestedTime));draw();}
  }
  on('loadDemo',()=>openProject(builtIn(DEMO)));on('loadOriginal',()=>openProject(builtIn(ORIGINAL)));on('loadExtended',()=>openProject(builtIn(CONTINUATION)));
  on('abToggle',()=>toggleAb());
  $('abSource')?.addEventListener('change',safe(e=>selectBSource(e.target.value)));
  on('abSnapshot',()=>snapshotAToB());
  on('abImport',()=>$('abInput').click());
  if($('abInput'))$('abInput').onchange=safe(async e=>{
    const f=e.target.files[0];if(!f)return;
    try{
      if(f.size>100*1024*1024)throw new Error('Project exceeds the 100 MB import limit.');
      let parsed;try{parsed=JSON.parse(await f.text());}catch(_){throw new Error('Choose an HTML Motion project JSON file.');}
      abEnabled=true;
      const opened=await openReferenceB(Promise.resolve(parsed),'import');
      if(opened)status(`Reference B loaded: ${projectB.show.title||projectB.show.show_id} (${projectB.show.show_id}) · Draft A unchanged`);
    }finally{e.target.value='';}
  });
  on('fightCamPack',applyFightCamPack);
  on('newProject',()=>load({version:1,show:{show_id:'motion-'+Date.now(),title:'Untitled exchange',venue:'street',fx_profile:HMComposeClient.defaultFxProfileFor('street'),compose_mode:'parity',parity_mode:true,chars:{L:{name:'Left'},R:{name:'Right'}},bg:{},atoms:[],overlays:[]},layouts:copy(project.layouts),media:copy(project.media),assets:copy(project.assets||{})}));
  on('importImages',()=>$('imageInput').click());on('emptyAdd',()=>$('imageInput').click());$('imageInput').onchange=safe(e=>importImages(e.target.files));
  $('mediaSearch').oninput=renderMedia;
  on('play',play);on('restart',()=>{pause();time=0;draw();});on('previous',()=>select(Math.max(0,(activeAt(Math.min(time,duration()-.0001))) - 1)));on('next',()=>select(Math.min(project.show.atoms.length-1,activeAt(Math.min(time,duration()-.0001))+1)));
  on('platePrev',()=>jumpToPlate({step:-1}));on('plateNext',()=>jumpToPlate({step:1}));
  if($('plateJumpSearch')){
    $('plateJumpSearch').addEventListener('input', safe(()=>{
      const value=$('plateJumpSearch').value;
      const catalog=HMComposeClient.plateCatalog(result);
      if(catalog.some(mark=>HMComposeClient.plateJumpOption(mark)===value)) jumpToPlate(value);
    }));
    $('plateJumpSearch').addEventListener('keydown', e=>{
      if(e.key!=='Enter') return;
      e.preventDefault();
      jumpToPlate($('plateJumpSearch').value);
    });
  }
  on('loop',()=>{looping=!looping;$('loop').setAttribute('aria-pressed',String(looping));});
  on('onionToggle',()=>{onion=!onion;$('onionToggle').setAttribute('aria-pressed',String(onion));draw();});
  on('fullscreen',async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await $('stage').requestFullscreen();});
  $('scrub').oninput=()=>{const value=+$('scrub').value;pause();time=value;draw();};$('ruler').onclick=e=>{pause();time=duration()*Math.max(0,Math.min(1,(e.clientX-$('ruler').getBoundingClientRect().left)/$('ruler').clientWidth));draw();};
  on('undo',()=>restore(-1));on('redo',()=>restore(1));on('duplicate',duplicate);on('delete',remove);
  on('trimMinus',()=>rippleTrim(-0.1));on('trimPlus',()=>rippleTrim(0.1));
  document.querySelectorAll('[data-fit]').forEach(b=>b.onclick=safe(()=>fitToSeconds(+b.dataset.fit)));
  $('projectTitle').onchange=safe(()=>edit(()=>{project.show.title=$('projectTitle').value.trim()||'Untitled exchange';}));
  $('clipName').onchange=safe(()=>edit(()=>{atom().label=$('clipName').value;}));$('caption').onchange=safe(()=>edit(()=>{atom().caption=$('caption').value;}));
  $('duration').onchange=safe(()=>setDuration(+$('duration').value));on('shorter',()=>rippleTrim(-0.1));on('longer',()=>rippleTrim(0.1));
  $('camera').onchange=safe(()=>edit(()=>{
    const cur=atom().camera||{};
    atom().camera={preset:$('camera').value,nudge:cur.nudge||{},...(cur.intensity!=null?{intensity:cur.intensity}:{})};
    if(cur.segments?.length){
      cur.segments[0].preset=$('camera').value;
      atom().camera.segments=copy(cur.segments);
    }
  }));
  $('camIntensity').oninput=()=>$('camIntensityValue').textContent=Math.round(+$('camIntensity').value*100)+'%';
  $('camIntensity').onchange=safe(()=>{
    const v=+$('camIntensity').value;
    if(!Number.isFinite(v)||v<0||v>2)throw new Error('Use camera intensity between 0 and 2.');
    edit(()=>{const a=atom();a.camera||={preset:'static_hold'};a.camera.intensity=v;if(a.camera.segments)a.camera.segments.forEach(s=>{s.intensity=v;});});
  });
  for(const [id,key] of [['zoom','s'],['panX','x'],['panY','y'],['roll','r']])$(id).onchange=safe(()=>{
    const v=+$(id).value;
    if(!Number.isFinite(v)||v<+$(id).min||v>+$(id).max)throw new Error(`Use ${id} between ${$(id).min} and ${$(id).max}.`);
    edit(()=>{const a=atom();a.camera||={preset:'static_hold'};a.camera.nudge||={};a.camera.nudge[key]=v;});
  });
  $('zoom').oninput=()=>$('zoomValue').textContent=Math.round(+$('zoom').value*100)+'%';
  $('dualCamToggle').onchange=safe(()=>edit(()=>{
    const a=atom();a.camera||={preset:'static_hold'};
    if($('dualCamToggle').checked){
      const d=a.duration_s, d1=+(d*0.5).toFixed(4), d2=+(d-d1).toFixed(4);
      const p1=a.camera.preset||'static_hold';
      const p2=p1==='static_hold'?'slow_push':'static_hold';
      a.camera.segments=[
        {preset:p1,dur_s:d1,u_range:[0,1]},
        {preset:p2,dur_s:d2,u_range:[0,1]}
      ];
    } else {
      delete a.camera.segments;
    }
  }));
  function updateDualSegment() {
    const a=atom();if(!a?.camera?.segments?.length)return;
    const ratio=Math.max(0.1,Math.min(0.9,+$('segSplit').value||0.5));
    const d=a.duration_s, d1=+(d*ratio).toFixed(4), d2=+(d-d1).toFixed(4);
    a.camera.preset=$('segAPreset').value;
    a.camera.segments=[
      {preset:$('segAPreset').value,dur_s:d1,u_range:[0,1]},
      {preset:$('segBPreset').value,dur_s:d2,u_range:[0,1]}
    ];
  }
  $('segAPreset').onchange=safe(()=>edit(updateDualSegment));
  $('segBPreset').onchange=safe(()=>edit(updateDualSegment));
  $('segSplit').oninput=()=>{const r=+$('segSplit').value;$('segSplitValue').textContent=`${Math.round(r*100)} / ${Math.round((1-r)*100)}%`;};
  $('segSplit').onchange=safe(()=>edit(updateDualSegment));
  on('copyCam',()=>{if(!atom())return;copiedCam=copy(atom().camera||{preset:'static_hold'});renderInspector();status('Copied camera settings');});
  on('pasteCam',()=>{
    if(!atom()||!copiedCam)return;
    edit(()=>{
      const next=copy(copiedCam);
      if(next.segments?.length)syncSegmentsToDuration(next,atom().duration_s);
      atom().camera=next;
    });
    status('Pasted camera settings to clip');
  });
  on('pasteCamAll',()=>{
    if(!copiedCam||!project?.show?.atoms?.length)return;
    edit(()=>{
      project.show.atoms.forEach(a=>{
        const next=copy(copiedCam);
        if(next.segments?.length)syncSegmentsToDuration(next,a.duration_s);
        a.camera=next;
      });
    });
    status('Pasted camera settings to all clips');
  });
  on('resetCamera',()=>edit(()=>{atom().camera={preset:'static_hold'};}));
  on('impactPunch',()=>{edit(()=>{
    const a=atom();if(!a)return;
    a.camera={...(a.camera||{}),preset:'slow_push',impact_macro:true};
    delete a.camera.segments;
    a.fx_hooks=[
      {type:'hit_orange',t_rel:0.08,params:{}},
      {type:'shake',t_rel:0.08,params:{amp:8,dur:0.2}}
    ];
    status('Applied Impact punch macro (push cam + hit/shake at 0.08)');
  });drawStageA();});
  function fxParamsFor(type) {
    if(type==='shake')return {amp:5,dur:.15};
    if(type==='dust')return {k:1};
    if(type==='smear_trail')return {dir:1};
    if(type==='speed_lines')return {mode:'up',k0:0,k1:1};
    if(type==='sparks')return {n:40};
    if(type==='fence_shake')return {k:1};
    if(type==='exposure_warm_crush')return {dur:0.10,x:0,y:0,scale:1};
    if(type==='fist_pressure')return {dur:0.36,path:[[430,390],[610,300],[760,250]],x:0,y:0,scale:1};
    if(type==='leg_arc')return {dur:0.28,path:[[800,560],[1020,340],[1160,150]],x:0,y:0,scale:1};
    if(type==='tornado_spiral')return {dur:0.50,path:[[640,480],[660,300]],x:0,y:0,scale:1};
    return {};
  }
  const PARAM_FX_TYPES=['fist_pressure','leg_arc','tornado_spiral','exposure_warm_crush'];
  function updateParamFxLocSize() {
    const a=atom();if(!a)return;
    const idx=(a.fx_hooks||[]).findIndex(h=>PARAM_FX_TYPES.includes(h?.type||h));
    if(idx<0)return;
    const x=+$('fxLocX').value, y=+$('fxLocY').value, scale=+$('fxScale').value;
    if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error('Use numbers for FX location X and Y.');
    if(!Number.isFinite(scale)||scale<0.05||scale>8)throw new Error('Use FX scale between 0.05 and 8.');
    edit(()=>{
      const cur=atom();
      const hk=typeof cur.fx_hooks[idx]==='string'?{type:cur.fx_hooks[idx],t_rel:0.08,params:fxParamsFor(cur.fx_hooks[idx])}:cur.fx_hooks[idx];
      hk.params={...(hk.params||{}),x,y,scale};
      cur.fx_hooks[idx]=hk;
    });
    drawStageA();
  }
  ['fxLocX','fxLocY','fxScale'].forEach(id=>{if($(id))$(id).onchange=safe(updateParamFxLocSize);});
  on('fxResetLocSize',()=>{
    const a=atom();if(!a)return;
    const idx=(a.fx_hooks||[]).findIndex(h=>PARAM_FX_TYPES.includes(h?.type||h));
    if(idx<0)return;
    edit(()=>{
      const cur=atom();
      const hk=typeof cur.fx_hooks[idx]==='string'?{type:cur.fx_hooks[idx],t_rel:0.08,params:fxParamsFor(cur.fx_hooks[idx])}:cur.fx_hooks[idx];
      hk.params={...(hk.params||{}),x:0,y:0,scale:1};
      cur.fx_hooks[idx]=hk;
    });
    drawStageA();
  });
  document.querySelectorAll('#fxProfileToggle button[data-fx-profile]').forEach(b=>b.onclick=safe(()=>{
    edit(()=>{project.show.fx_profile=b.dataset.fxProfile;});
    drawStageA();
  }));
  document.querySelectorAll('[data-effect]').forEach(b=>b.onclick=safe(()=>{edit(()=>{
    const type=b.dataset.effect;
    const a=atom();
    if(!a)return;
    const clipStart=startOf(selected),clipEnd=clipStart+a.duration_s;
    if(time<clipStart||time>=clipEnd)time=clipStart;
    if(type==='none'){
      a.fx_hooks=[];
      if(a.camera?.impact_macro||a.camera?.preset==='slow_push'){
        a.camera={...a.camera,preset:'static_hold'};
        delete a.camera.impact_macro;
      }
    } else {
      const hk={type,t_rel:.08,params:fxParamsFor(type)};
      if(type==='speed_lines'||type==='fence_shake')hk.t_rel_end=0.92;
      a.fx_hooks=[hk];
    }
  });drawStageA();}));
  on('replaceImage',()=>{replacing=!replacing;document.querySelector('.inspector').dataset.replacing=String(replacing);document.querySelector('.library').scrollIntoView({behavior:'smooth',block:'nearest'});status(replacing?'Choose a library image to replace this plate.':'Plate replacement cancelled.');});
  on('helpOpen',()=>$('helpDialog').showModal());
  document.addEventListener('keydown',safe(async e=>{
    if(recording||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||document.querySelector('dialog[open]'))return;
    const mod=e.metaKey||e.ctrlKey;
    if(e.code==='Space'){e.preventDefault();await play();}else if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();restore(e.shiftKey?1:-1);}else if(mod&&e.key.toLowerCase()==='s'){e.preventDefault();$('saveProject').click();}else if(mod&&e.key.toLowerCase()==='d'){e.preventDefault();duplicate();}else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();}else if(e.altKey&&e.key==='ArrowLeft'){e.preventDefault();jumpToPlate({step:-1});}else if(e.altKey&&e.key==='ArrowRight'){e.preventDefault();jumpToPlate({step:1});}else if(e.key==='ArrowLeft'){e.preventDefault();$('previous').click();}else if(e.key==='ArrowRight'){e.preventDefault();$('next').click();}else if(e.key==='Home'){e.preventDefault();$('restart').click();}else if(e.key==='?')$('helpDialog').showModal();
  }));
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&!recording)pause();});
  window.HMStudio={get project(){return copy(project);},get selectedIndex(){return selected;},get composed(){return copy(result);},get projectB(){return copy(projectB);},get composedB(){return copy(resultB);},get sourceKindB(){return sourceKindB;},get abEnabled(){return abEnabled;},get abComparison(){return HMComposeClient.compareAt(result,resultB,time);},get fxPreviewState(){return HMComposeClient.classifyFxHooks(atom()?.fx_hooks||[],effects);},get time(){return time;},get playing(){return playing;},get onion(){return onion;},get loading(){return loading||loadingB;},get copiedCam(){return copy(copiedCam);},editProject(fn){edit(()=>fn(project));},builtIn,status,compile,compileB,renderAt(t){pause();time=Math.min(maxScrubDuration(),Math.max(0,t));draw();},load,openProject,loadB,openReferenceB,selectBSource,snapshotAToB,toggleAb,download,safe,on,$,copy,get renderer(){return renderer;},get rendererB(){return rendererB;},pause,get duration(){return duration();},get durationB(){return durationB();},get recording(){return recording;},set recording(v){recording=v;},update};
  window.ready=boot().catch(e=>{status('Could not open editor: '+e.message,true);throw e;});
})();

/* Foreground props: their own camera, in front of plates, authored from Compose. */
(() => {
  const S = window.HMStudio, { $, on, safe } = S;
  let selectedId = null;
  const round = v => Math.round(v * 10000) / 10000;
  function propsOf(p) { return p?.show?.fg?.props || []; }
  function currentProp(p) {
    const list = propsOf(p);
    return list.find(prop => prop.id === selectedId) || list[0] || null;
  }
  function ensure(p) {
    p.show.fg || (p.show.fg = {});
    p.show.fg.props || (p.show.fg.props = []);
    if (!p.show.fg.cam) p.show.fg.cam = { preset: 'parallax', amount: 0.45, nudge: { x: 0, y: 0, s: 0 } };
    return p.show.fg;
  }
  function readImage(file) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw Error('Choose a PNG, JPG or WebP prop.');
    if (file.size > 20 * 1024 * 1024) throw Error('Foreground image must be 20 MB or smaller.');
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }
  function chosenSlot() {
    return $('fgSlot').value === 'overlay' ? 'overlay' : 'prop';
  }
  function addProp(p, src, data, slot) {
    const fg = ensure(p);
    if (data) { p.assets || (p.assets = {}); p.assets[src] = data; }
    const prop = {
      id: 'fg-' + crypto.randomUUID(),
      src,
      x: slot === 'overlay' ? 640 : 980,
      y: slot === 'overlay' ? 360 : 180,
      scale: 1,
      z: (fg.props.length + 1) * 10,
      t_start: 0,
      t_end: Math.max(0.1, round(S.duration || 5)),
    };
    if (slot === 'overlay') prop.slot = 'overlay';
    fg.props.push(prop);
    selectedId = prop.id;
  }
  function setField(id, value) {
    const el = $(id);
    if (document.activeElement === el) return;
    el.value = value;
  }
  function refresh() {
    const p = S.project;
    if (!p) return;
    const list = propsOf(p);
    const prop = currentProp(p);
    if (prop) selectedId = prop.id;
    const sel = $('fgProp');
    sel.replaceChildren();
    if (!list.length) sel.add(new Option('No prop yet', ''));
    if (!list.length) $('fgSlot').value = 'prop';
    list.forEach((item, i) => sel.add(new Option((i + 1) + ' · ' + (item.slot === 'overlay' ? 'overlay · ' : '') + item.id.slice(0, 14) + (item.kf ? ' · ' + item.kf.length + ' kf' : ''), item.id)));
    sel.value = prop ? prop.id : '';
    $('fgCount').textContent = list.length + (list.length === 1 ? ' prop' : ' props');
    $('fgRemove').disabled = !prop;
    $('fgFields').hidden = !prop;
    const library = $('fgLibrary');
    const libraryValue = library.value;
    library.replaceChildren(new Option('Use library image…', ''));
    (p.media || []).forEach(m => library.add(new Option(m.name, m.id)));
    library.value = libraryValue || '';
    const cam = p.show.fg?.cam || { preset: 'static', amount: 0, nudge: {} };
    $('fgCamPreset').value = cam.preset || 'static';
    const amount = cam.amount == null ? 0 : cam.amount;
    setField('fgCamAmount', amount);
    $('fgCamAmountValue').textContent = Math.round(amount * 100) + '%';
    setField('fgNudgeX', cam.nudge?.x || 0);
    setField('fgNudgeY', cam.nudge?.y || 0);
    setField('fgNudgeS', cam.nudge?.s || 0);
    if (!prop) {
      $('fgKfList').replaceChildren();
      $('fgBreakBox').hidden = false;
      $('fgOverlayLabel').hidden = true;
      $('fgBrokenLabel').textContent = 'No broken image — the prop splits on a crack at the break time.';
      return;
    }
    setField('fgX', prop.x);
    setField('fgY', prop.y);
    setField('fgScale', prop.scale);
    setField('fgZ', prop.z);
    setField('fgT0', prop.t_start);
    setField('fgT1', prop.t_end);
    const overlay = prop.slot === 'overlay';
    $('fgBreakBox').hidden = overlay;
    $('fgOverlayLabel').hidden = !overlay;
    if (overlay) {
      $('fgOverlayLabel').textContent = 'Shows from ' + prop.t_start + 's to ' + prop.t_end + 's. Overlay art does not crack.';
    }
    $('fgEffect').value = prop.effect?.type === 'break' ? 'break' : 'none';
    setField('fgEffectT', prop.effect?.t || 0);
    $('fgEffectT').disabled = prop.effect?.type !== 'break';
    $('fgBrokenAdd').disabled = prop.effect?.type !== 'break';
    $('fgBrokenClear').disabled = !prop.effect?.broken_src;
    $('fgBrokenLabel').textContent = prop.effect?.type !== 'break'
      ? 'Intact until you attach a break.'
      : prop.effect.broken_src
        ? 'Broken PNG or WebP replaces the prop at ' + prop.effect.t + 's.'
        : 'At ' + prop.effect.t + 's the prop splits on a crack.';
    const kfList = $('fgKfList');
    kfList.replaceChildren();
    (prop.kf || []).forEach(kf => {
      const row = document.createElement('button');
      row.type = 'button';
      row.textContent = kf.t.toFixed(2) + 's · ' + Math.round(kf.x) + ',' + Math.round(kf.y) + ' · ×' + kf.scale + ' · remove';
      row.onclick = safe(() => S.editProject(project => {
        const item = (project.show.fg?.props || []).find(x => x.id === prop.id);
        if (!item?.kf) return;
        item.kf = item.kf.filter(k => Math.abs(k.t - kf.t) > 1e-4);
        if (!item.kf.length) delete item.kf;
      }));
      kfList.append(row);
    });
  }
  function writeProp(fn) {
    const id = selectedId;
    S.editProject(p => {
      const prop = (p.show.fg?.props || []).find(x => x.id === id);
      if (!prop) throw Error('Select a foreground prop.');
      fn(prop, p);
    });
  }
  function writePlacement() {
    writeProp(prop => {
      const x = Number($('fgX').value), y = Number($('fgY').value), scale = Number($('fgScale').value), z = Number($('fgZ').value);
      const t0 = Number($('fgT0').value), t1 = Number($('fgT1').value);
      if (![x, y, scale, z, t0, t1].every(Number.isFinite)) throw Error('Foreground placement needs numbers.');
      if (scale < 0.05 || scale > 8) throw Error('Foreground scale must be between 0.05 and 8.');
      if (t0 < 0 || !(t1 > t0)) throw Error('Foreground end time must be after its start.');
      prop.x = x; prop.y = y; prop.scale = scale; prop.z = z; prop.t_start = t0; prop.t_end = t1;
    });
  }
  function writeEffect() {
    writeProp(prop => {
      if (prop.slot === 'overlay') { delete prop.effect; return; }
      if ($('fgEffect').value !== 'break') { delete prop.effect; return; }
      const t = Number($('fgEffectT').value);
      if (!Number.isFinite(t) || t < 0) throw Error('Break time must be 0 or later.');
      const next = { type: 'break', t };
      if (prop.effect?.broken_src) next.broken_src = prop.effect.broken_src;
      prop.effect = next;
    });
  }
  function writeCam() {
    S.editProject(p => {
      const fg = ensure(p);
      const prev = fg.cam || {};
      const amount = Number($('fgCamAmount').value);
      const nudge = { x: Number($('fgNudgeX').value), y: Number($('fgNudgeY').value), s: Number($('fgNudgeS').value) };
      if (!Number.isFinite(amount) || amount < 0 || amount > 1) throw Error('Parallax amount must be between 0 and 1.');
      if (![nudge.x, nudge.y, nudge.s].every(Number.isFinite)) throw Error('Foreground nudge must be a number.');
      fg.cam = { preset: $('fgCamPreset').value || 'static', amount, nudge };
      if (prev.clock) fg.cam.clock = prev.clock;
      if (prev.span != null) fg.cam.span = JSON.parse(JSON.stringify(prev.span));
      if (prev.t0 != null) fg.cam.t0 = prev.t0;
      if (prev.t1 != null) fg.cam.t1 = prev.t1;
    });
  }
  on('fgAdd', () => $('fgInput').click());
  $('fgInput').onchange = safe(async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = await readImage(file);
      const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[file.type];
      const slot = chosenSlot();
      S.editProject(p => addProp(p, 'foreground/' + crypto.randomUUID() + '.' + ext, data, slot));
    } finally { e.target.value = ''; }
  });
  $('fgLibrary').onchange = safe(() => {
    const id = $('fgLibrary').value;
    $('fgLibrary').value = '';
    const media = S.project.media.find(m => m.id === id);
    if (!media) return;
    const slot = chosenSlot();
    S.editProject(p => addProp(p, media.src, null, slot));
  });
  on('fgRemove', () => {
    const id = selectedId;
    S.editProject(p => {
      const props = p.show.fg?.props || [];
      const index = props.findIndex(x => x.id === id);
      if (index < 0) throw Error('Select a foreground prop.');
      props.splice(index, 1);
    });
    selectedId = null;
  });
  ['fgX', 'fgY', 'fgScale', 'fgZ', 'fgT0', 'fgT1'].forEach(id => { $(id).onchange = safe(writePlacement); });
  $('fgEffect').onchange = safe(writeEffect);
  $('fgEffectT').onchange = safe(writeEffect);
  on('fgBrokenAdd', () => $('fgBrokenInput').click());
  $('fgBrokenInput').onchange = safe(async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = await readImage(file);
      const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[file.type];
      const src = 'foreground/' + crypto.randomUUID() + '-broken.' + ext;
      writeProp((prop, p) => {
        if (prop.effect?.type !== 'break') throw Error('Attach a break before choosing its image.');
        p.assets || (p.assets = {});
        p.assets[src] = data;
        prop.effect.broken_src = src;
      });
    } finally { e.target.value = ''; }
  });
  on('fgBrokenClear', () => writeProp(prop => { if (prop.effect) delete prop.effect.broken_src; }));
  on('fgAddKf', () => writeProp(prop => {
    const t = round(S.time || 0);
    const row = { t, x: prop.x, y: prop.y, scale: prop.scale };
    const kf = (prop.kf || []).filter(k => Math.abs(k.t - t) > 0.02);
    kf.push(row);
    kf.sort((a, b) => a.t - b.t);
    prop.kf = kf;
  }));
  on('fgClearKf', () => writeProp(prop => { delete prop.kf; }));
  $('fgCamPreset').onchange = safe(writeCam);
  $('fgCamAmount').onchange = safe(writeCam);
  ['fgNudgeX', 'fgNudgeY', 'fgNudgeS'].forEach(id => { $(id).onchange = safe(writeCam); });
  $('fgProp').onchange = () => { selectedId = $('fgProp').value || null; refresh(); };
  window.addEventListener('hm:projectchange', refresh);
  window.ready.then(refresh).catch(() => {});
})();

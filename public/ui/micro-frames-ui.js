/*! HM-DENS-01: Per-clip 1-2f micro-action inserts & 1-click film motion density UI */
(function (global) {
  'use strict';

  const MICRO_FRAME_ACTION_LABELS = Object.freeze({
    anticipation: 'Anticipation dip',
    smear_lunge: 'Smear lunge',
    squash_hit: 'Impact squash',
    recoil_snap: 'Recoil snap',
    weight_shift: 'Weight shift',
    cloth_tremor: 'Cloth tremor',
    swap_plate: 'Swap library plate…',
  });

  const FILM_DENSITY_BUTTONS = Object.freeze([
    { id: 'subtle_1f', label: 'Subtle 1f' },
    { id: 'anime_2f', label: 'Anime 2f' },
    { id: 'sakuga_dense', label: 'High-Density 2f' },
    { id: 'clear', label: 'Clear' },
  ]);

  function defaultMicroFrame(existingCount) {
    const idx = Math.max(0, +existingCount || 0);
    return {
      id: 'mf-' + (idx + 1),
      at: idx === 0 ? 'start' : 'end',
      frames: 2,
      action: idx === 0 ? 'anticipation' : 'recoil_snap',
      dir: 1,
      strength: 1.0,
    };
  }

  function microFrameMarkerPct(mf, durationS) {
    const dur = Math.max(0.1, +durationS || 0.5);
    const span = Math.min((Math.max(1, Math.min(3, +mf?.frames || 2)) / 24), dur * 0.45);
    let t = 0;
    if (mf?.at === 'end') t = Math.max(0, dur - span * 0.5);
    else if (mf?.at === 'mid') t = Math.max(0, Math.min(dur, dur * 0.42));
    else if (typeof mf?.at === 'number' && Number.isFinite(mf.at)) t = Math.max(0, Math.min(dur, mf.at * dur + span * 0.5));
    else t = span * 0.5;
    return Math.round(Math.max(2, Math.min(98, (t / dur) * 100)) * 100) / 100;
  }

  function mountUi() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const S = window.HMStudio;
    const C = window.HMComposeClient;
    if (!S || !C || !C.applyFilmMotionDensity) return;
    const timingGroup = document.getElementById('timingSettingsGroup');
    if (!timingGroup || document.getElementById('microFramesGroup')) return;

    const group = document.createElement('div');
    group.className = 'settings-group';
    group.id = 'microFramesGroup';

    const heading = document.createElement('div');
    heading.className = 'group-title';
    heading.innerHTML = 'Micro-action frames <span class="small-muted">1–2f density · 24fps</span>';

    const densityLabel = document.createElement('div');
    densityLabel.className = 'field-label';
    densityLabel.textContent = '1-CLICK FILM MOTION DENSITY';

    const densityRow = document.createElement('div');
    densityRow.className = 'film-density-bar';
    densityRow.id = 'filmDensityRow';
    densityRow.setAttribute('role', 'group');
    densityRow.setAttribute('aria-label', '1-click film motion density');
    for (const btnSpec of FILM_DENSITY_BUTTONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.filmDensity = btnSpec.id;
      btn.textContent = btnSpec.label;
      densityRow.append(btn);
    }

    const slotHead = document.createElement('div');
    slotHead.className = 'dual-cam-head sub-header micro-frame-head';
    slotHead.innerHTML = '<span class="small-muted">CLIP SMALL ACTIONS</span><button type="button" class="text-button" id="addMicroFrame">＋ Add 1–2f action</button>';

    const slotList = document.createElement('div');
    slotList.id = 'microFrameList';
    slotList.className = 'micro-frame-list';

    const hint = document.createElement('p');
    hint.className = 'field-hint';
    hint.textContent = 'Adds 1–2 crisp 24fps frames (anticipation, lunge, squash, recoil, or a 1–2f plate swap) without altering clip duration.';

    group.append(heading, densityLabel, densityRow, slotHead, slotList, hint);
    timingGroup.insertAdjacentElement('afterend', group);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png,image/jpeg,image/webp';
    fileInput.hidden = true;
    fileInput.id = 'microFrameFileInput';
    group.append(fileInput);
    let pendingUploadIdx = -1;

    function readImgData(file) {
      if (file.size > 20 * 1024 * 1024) throw Error('Micro-frame plate must be 20 MB or smaller.');
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
    }

    densityRow.addEventListener('click', S.safe(e => {
      const btn = e.target.closest('[data-film-density]');
      if (!btn) return;
      const profileId = btn.dataset.filmDensity;
      S.editProject(p => {
        const next = C.applyFilmMotionDensity(p.show, profileId);
        p.show.atoms = next.atoms;
      });
      S.status(profileId === 'clear' ? 'Cleared 1–2f micro-action frames across film.' : `Applied ${btn.textContent} across film clips.`);
    }));

    group.querySelector('#addMicroFrame').onclick = S.safe(() => {
      S.editProject(p => {
        const a = p.show.atoms[S.selectedIndex];
        if (!a) return;
        const list = Array.isArray(a.micro_frames) ? a.micro_frames.slice() : [];
        if (list.length >= 4) throw Error('Maximum 4 micro-action inserts per clip.');
        list.push(defaultMicroFrame(list.length));
        a.micro_frames = list;
      });
    });

    fileInput.onchange = S.safe(async e => {
      const file = e.target.files?.[0];
      const idx = pendingUploadIdx;
      pendingUploadIdx = -1;
      e.target.value = '';
      if (!file || idx < 0) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw Error('Choose PNG, JPG or WebP.');
      const data = await readImgData(file);
      const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[file.type];
      const src = 'micro-frames/' + crypto.randomUUID() + '.' + ext;
      S.editProject(p => {
        const a = p.show.atoms[S.selectedIndex];
        const mf = a?.micro_frames?.[idx];
        if (!mf) return;
        p.assets = p.assets || {};
        p.assets[src] = data;
        mf.action = 'swap_plate';
        mf.src = src;
      });
    });

    function refresh() {
      const p = S.project;
      const a = p?.show?.atoms?.[S.selectedIndex];
      const list = Array.isArray(a?.micro_frames) ? a.micro_frames : [];
      const addBtn = document.getElementById('addMicroFrame');
      if (addBtn) addBtn.disabled = !a || list.length >= 4;

      slotList.replaceChildren();
      if (!a || !list.length) {
        const empty = document.createElement('p');
        empty.className = 'field-hint';
        empty.textContent = a ? 'No 1–2f inserts on this clip yet.' : 'Select a clip.';
        slotList.append(empty);
        return;
      }
      const media = Array.isArray(p.media) ? p.media : [];
      list.forEach((mf, idx) => {
        const card = document.createElement('div');
        card.className = 'micro-frame-slot';
        card.dataset.microIndex = String(idx);

        const rowTop = document.createElement('div');
        rowTop.className = 'micro-frame-slot-head';

        const actSel = document.createElement('select');
        actSel.setAttribute('aria-label', 'Micro-frame action');
        for (const [k, label] of Object.entries(MICRO_FRAME_ACTION_LABELS)) {
          actSel.add(new Option(label, k));
        }
        actSel.value = mf.action || 'anticipation';

        const rmBtn = document.createElement('button');
        rmBtn.type = 'button';
        rmBtn.className = 'text-button';
        rmBtn.textContent = 'Remove';
        rmBtn.onclick = S.safe(() => S.editProject(proj => {
          const cur = proj.show.atoms[S.selectedIndex];
          if (!cur?.micro_frames) return;
          cur.micro_frames.splice(idx, 1);
          if (!cur.micro_frames.length) delete cur.micro_frames;
        }));
        rowTop.append(actSel, rmBtn);

        const grid = document.createElement('div');
        grid.className = 'micro-frame-grid';

        const frSel = document.createElement('select');
        frSel.setAttribute('aria-label', 'Frame count');
        for (const n of [1, 2, 3]) frSel.add(new Option(n + 'f', String(n)));
        frSel.value = String(mf.frames || 2);

        const atSel = document.createElement('select');
        atSel.setAttribute('aria-label', 'Placement');
        [['start', 'Start'], ['mid', 'Mid'], ['end', 'End']].forEach(([v, t]) => atSel.add(new Option(t, v)));
        atSel.value = ['start', 'mid', 'end'].includes(mf.at) ? mf.at : 'start';

        const dirSel = document.createElement('select');
        dirSel.setAttribute('aria-label', 'Action direction');
        dirSel.add(new Option('→ Right', '1'));
        dirSel.add(new Option('← Left', '-1'));
        dirSel.value = String(+mf.dir < 0 ? -1 : 1);

        const strInput = document.createElement('input');
        strInput.type = 'range';
        strInput.min = '0.25';
        strInput.max = '2';
        strInput.step = '0.05';
        strInput.value = String(mf.strength != null ? mf.strength : 1);
        strInput.title = 'Strength';

        grid.append(frSel, atSel, dirSel, strInput);

        const swapRow = document.createElement('div');
        swapRow.className = 'micro-frame-swap-row';
        const showSwap = (mf.action || '') === 'swap_plate' || !!mf.src;
        swapRow.hidden = !showSwap;
        const libSel = document.createElement('select');
        libSel.setAttribute('aria-label', 'Swap plate image');
        libSel.add(new Option('Choose library plate…', ''));
        media.forEach(m => libSel.add(new Option(m.name, m.src)));
        if (mf.src && !media.some(m => m.src === mf.src)) libSel.add(new Option('Custom image', mf.src));
        libSel.value = mf.src || '';
        const upBtn = document.createElement('button');
        upBtn.type = 'button';
        upBtn.textContent = 'Image…';
        upBtn.onclick = () => { pendingUploadIdx = idx; fileInput.click(); };
        swapRow.append(libSel, upBtn);

        const commitSlot = patch => S.editProject(proj => {
          const item = proj.show.atoms[S.selectedIndex]?.micro_frames?.[idx];
          if (!item) return;
          Object.assign(item, patch);
          if (item.action === 'swap_plate' && !item.src && media[0]) item.src = media[0].src;
        });

        actSel.onchange = S.safe(() => {
          const nextAct = actSel.value;
          if (nextAct === 'swap_plate' && !mf.src && !media.length) {
            pendingUploadIdx = idx;
            fileInput.click();
            return;
          }
          commitSlot({ action: nextAct });
        });
        frSel.onchange = S.safe(() => commitSlot({ frames: +frSel.value || 2 }));
        atSel.onchange = S.safe(() => commitSlot({ at: atSel.value }));
        dirSel.onchange = S.safe(() => commitSlot({ dir: +dirSel.value < 0 ? -1 : 1 }));
        strInput.onchange = S.safe(() => commitSlot({ strength: +strInput.value || 1 }));
        libSel.onchange = S.safe(() => commitSlot({ action: 'swap_plate', src: libSel.value || null }));

        card.append(rowTop, grid, swapRow);
        slotList.append(card);
      });
    }

    window.addEventListener('hm:projectchange', refresh);
    if (window.ready && typeof window.ready.then === 'function') window.ready.then(refresh).catch(() => {});
  }

  const api = {
    MICRO_FRAME_ACTION_LABELS,
    FILM_DENSITY_BUTTONS,
    defaultMicroFrame,
    microFrameMarkerPct,
  };
  global.HMMicroFramesUi = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountUi);
    else mountUi();
  }
})(typeof window !== 'undefined' ? window : globalThis);

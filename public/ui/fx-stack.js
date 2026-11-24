/* HM-FX-01: Non-destructive FX layer stack & per-hook parameter inspector.
 * Leaves legacy [data-effect] single-click behavior intact (poteto-mode). */
(function (root) {
  'use strict';

  const CORE_FX_LIST = [
    'hit_orange', 'hit_pink', 'impact_white', 'hitstop_2f', 'shake',
    'flash_orange', 'flash_pink', 'speed_lines', 'smear_trail', 'dust', 'sparks',
    'bg_flash_blue', 'bg_flash_teal', 'exposure_warm_crush', 'fist_pressure', 'leg_arc', 'tornado_spiral',
  ];
  const PIXELFX_WAVE1_IDS = [
    'impacts/hit-spark', 'impacts/blunt-hit', 'impacts/crit-hit', 'impacts/hit-flash',
    'impacts/impact-frame', 'impacts/parry', 'impacts/ground-slam', 'impacts/heavy-landing',
    'melee/uppercut', 'explosions/cartoon-pow', 'explosions/dirt-explosion', 'explosions/smoke-bomb',
  ];
  const SPAN_FX = new Set(['speed_lines', 'fence_shake']);

  function isPixelfxType(t) {
    if (PIXELFX_WAVE1_IDS.includes(t)) return true;
    const api = root.HMPixelFx;
    return Boolean(api && typeof api.has === 'function' && api.has(t));
  }

  function normalizeHookObj(raw) {
    if (typeof raw === 'string') return { type: raw, t_rel: 0.08, params: {} };
    if (!raw || typeof raw !== 'object') return null;
    const copy = Object.assign({}, raw);
    copy.type = String(copy.type || '').trim();
    if (!copy.type || copy.type === 'none') return null;
    if (copy.t_rel == null) copy.t_rel = 0.08;
    copy.params = copy.params && typeof copy.params === 'object' ? Object.assign({}, copy.params) : {};
    return copy;
  }

  function normalizeStack(hooks) {
    const out = [];
    for (const h of hooks || []) {
      const obj = normalizeHookObj(h);
      if (obj) out.push(obj);
    }
    return out;
  }

  function addLayer(hooks, type, params) {
    const t = String(type || '').trim();
    if (!t || t === 'none') return normalizeStack(hooks);
    const list = normalizeStack(hooks);
    const isPx = isPixelfxType(t);
    const entry = {
      type: t,
      t_rel: 0.08,
      ...(SPAN_FX.has(t) ? { t_rel_end: 0.92 } : {}),
      ...(isPx ? { source: 'pixelfx' } : {}),
      params: params && typeof params === 'object' ? Object.assign({}, params) : {},
    };
    list.push(entry);
    return list;
  }

  function removeLayer(hooks, idx) {
    const list = normalizeStack(hooks);
    if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) return list;
    list.splice(idx, 1);
    return list;
  }

  function reorderLayer(hooks, idx, delta) {
    const list = normalizeStack(hooks);
    const next = idx + (delta < 0 ? -1 : 1);
    if (!Number.isInteger(idx) || idx < 0 || idx >= list.length || next < 0 || next >= list.length) return list;
    const [item] = list.splice(idx, 1);
    list.splice(next, 0, item);
    return list;
  }

  function toggleMuteLayer(hooks, idx) {
    const list = normalizeStack(hooks);
    if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) return list;
    list[idx] = Object.assign({}, list[idx], { muted: !list[idx].muted });
    return list;
  }

  function updateLayer(hooks, idx, patch) {
    const list = normalizeStack(hooks);
    if (!Number.isInteger(idx) || idx < 0 || idx >= list.length || !patch || typeof patch !== 'object') return list;
    const cur = Object.assign({}, list[idx]);
    const prm = Object.assign({}, cur.params || {});
    if (patch.t_rel != null && Number.isFinite(+patch.t_rel)) cur.t_rel = Math.max(0, Math.min(1, +patch.t_rel));
    if (patch.t_rel_end != null && Number.isFinite(+patch.t_rel_end)) cur.t_rel_end = Math.max(0, Math.min(1, +patch.t_rel_end));
    for (const k of ['x', 'y', 'scale', 'rotation', 'opacity', 'dur', 'angle', 'strength']) {
      if (patch[k] !== undefined && Number.isFinite(+patch[k])) prm[k] = +patch[k];
    }
    if (typeof patch.color === 'string') {
      if (patch.color.trim()) prm.color = patch.color.trim();
      else delete prm.color;
    }
    if (typeof patch.blend === 'string') {
      if (patch.blend && patch.blend !== 'source-over') prm.blend = patch.blend;
      else delete prm.blend;
    }
    cur.params = prm;
    list[idx] = cur;
    return list;
  }

  function availableFxIds() {
    const px = root.HMPixelFx && Array.isArray(root.HMPixelFx.ids) ? root.HMPixelFx.ids : PIXELFX_WAVE1_IDS;
    return CORE_FX_LIST.concat(px);
  }

  root.HMFxStack = {
    CORE_FX_LIST,
    normalizeHookObj,
    normalizeStack,
    addLayer,
    removeLayer,
    reorderLayer,
    toggleMuteLayer,
    updateLayer,
    availableFxIds,
  };

  if (typeof document !== 'undefined' && root.HMStudio && typeof document.getElementById === 'function') {
    const S = root.HMStudio;
    const anchor = document.getElementById('effectOptions');
    if (anchor && anchor.parentElement) {
      const panel = document.createElement('section');
      panel.id = 'fxStackPanel';
      panel.className = 'fx-stack-panel';
      panel.setAttribute('aria-label', 'Layered FX stack');
      panel.innerHTML =
        '<div class="dual-cam-head sub-header"><span class="small-muted">FX LAYER STACK</span><span id="fxStackCount" class="small-muted">0 layers</span></div>' +
        '<div class="fx-stack-add-row"><select id="fxStackAddSelect" aria-label="Choose FX layer to add"></select><button type="button" id="fxStackAddBtn" class="text-button">＋ Add layer</button></div>' +
        '<ul id="fxStackList" class="fx-stack-list" aria-label="Active FX layers"></ul>';
      const readout = document.getElementById('fxHookReadout');
      if (readout && readout.parentElement === anchor.parentElement) readout.after(panel);
      else anchor.after(panel);

      let expandedIdx = 0;
      const sel = document.getElementById('fxStackAddSelect');
      const fillOptions = () => {
        if (!sel) return;
        const prev = sel.value;
        sel.replaceChildren();
        for (const id of availableFxIds()) sel.add(new Option(id, id));
        if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
      };
      fillOptions();
      root.addEventListener('hm-pixelfx-ready', fillOptions);

      const applyMutate = (mutator) => {
        S.editProject((proj) => {
          const clip = proj.show.atoms[S.selectedIndex];
          if (!clip) return;
          clip.fx_hooks = mutator(clip.fx_hooks || []);
        });
      };

      document.getElementById('fxStackAddBtn')?.addEventListener('click', () => {
        const type = sel?.value;
        if (!type) return;
        applyMutate((hooks) => {
          const next = addLayer(hooks, type);
          expandedIdx = next.length - 1;
          return next;
        });
      });

      const listEl = document.getElementById('fxStackList');
      listEl?.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-stack-act]');
        if (!btn) return;
        const idx = +btn.dataset.stackIdx;
        const act = btn.dataset.stackAct;
        if (act === 'inspect') { expandedIdx = expandedIdx === idx ? -1 : idx; refresh(); return; }
        if (act === 'up') { applyMutate((h) => reorderLayer(h, idx, -1)); expandedIdx = Math.max(0, idx - 1); }
        else if (act === 'down') { applyMutate((h) => reorderLayer(h, idx, 1)); expandedIdx = idx + 1; }
        else if (act === 'mute') applyMutate((h) => toggleMuteLayer(h, idx));
        else if (act === 'remove') applyMutate((h) => removeLayer(h, idx));
      });
      listEl?.addEventListener('change', (e) => {
        const inp = e.target.closest('[data-stack-field]');
        if (!inp) return;
        const idx = +inp.dataset.stackIdx;
        const field = inp.dataset.stackField;
        applyMutate((h) => updateLayer(h, idx, { [field]: inp.value }));
      });

      function refresh() {
        const show = S.show;
        const clip = show?.atoms?.[S.selectedIndex];
        const hooks = normalizeStack(clip?.fx_hooks || []);
        const countEl = document.getElementById('fxStackCount');
        if (countEl) countEl.textContent = hooks.length + (hooks.length === 1 ? ' layer' : ' layers');
        if (!listEl) return;
        listEl.replaceChildren();
        hooks.forEach((hk, idx) => {
          const li = document.createElement('li');
          li.className = 'fx-stack-item' + (hk.muted ? ' is-muted' : '');
          li.dataset.stackIndex = String(idx);
          const prm = hk.params || {};
          const head = document.createElement('div');
          head.className = 'fx-stack-row';
          head.innerHTML =
            `<button type="button" class="text-button fx-stack-title" data-stack-act="inspect" data-stack-idx="${idx}">${idx + 1}. ${hk.type}${hk.muted ? ' (muted)' : ''}</button>` +
            `<div class="fx-stack-btns">` +
            `<button type="button" class="text-button" data-stack-act="mute" data-stack-idx="${idx}" title="Mute/Unmute">${hk.muted ? 'Unmute' : 'Mute'}</button>` +
            `<button type="button" class="text-button" data-stack-act="up" data-stack-idx="${idx}" ${idx === 0 ? 'disabled' : ''}>↑</button>` +
            `<button type="button" class="text-button" data-stack-act="down" data-stack-idx="${idx}" ${idx === hooks.length - 1 ? 'disabled' : ''}>↓</button>` +
            `<button type="button" class="text-button" data-stack-act="remove" data-stack-idx="${idx}">×</button>` +
            `</div>`;
          li.append(head);
          if (idx === expandedIdx) {
            const box = document.createElement('div');
            box.className = 'fx-stack-editor paired-fields paired-fields-3';
            const blend = prm.blend || 'source-over';
            box.innerHTML =
              `<label>Beat %<input type="number" step="0.05" min="0" max="1" value="${hk.t_rel ?? 0.08}" data-stack-field="t_rel" data-stack-idx="${idx}"></label>` +
              `<label>Dur(s)<input type="number" step="0.05" min="0.05" max="4" value="${prm.dur ?? ''}" placeholder="auto" data-stack-field="dur" data-stack-idx="${idx}"></label>` +
              `<label>Opacity<input type="number" step="0.1" min="0" max="1" value="${prm.opacity ?? 1}" data-stack-field="opacity" data-stack-idx="${idx}"></label>` +
              `<label>X<input type="number" step="10" min="-1280" max="1280" value="${prm.x ?? ''}" placeholder="0" data-stack-field="x" data-stack-idx="${idx}"></label>` +
              `<label>Y<input type="number" step="10" min="-720" max="720" value="${prm.y ?? ''}" placeholder="0" data-stack-field="y" data-stack-idx="${idx}"></label>` +
              `<label>Scale<input type="number" step="0.1" min="0.05" max="8" value="${prm.scale ?? 1}" data-stack-field="scale" data-stack-idx="${idx}"></label>` +
              `<label>Rot°<input type="number" step="5" min="-360" max="360" value="${prm.rotation ?? 0}" data-stack-field="rotation" data-stack-idx="${idx}"></label>` +
              `<label>Color<input type="text" placeholder="#ff8a1e" value="${prm.color || ''}" data-stack-field="color" data-stack-idx="${idx}"></label>` +
              `<label>Blend<select data-stack-field="blend" data-stack-idx="${idx}"><option value="source-over"${blend === 'source-over' ? ' selected' : ''}>Normal</option><option value="screen"${blend === 'screen' ? ' selected' : ''}>Screen</option><option value="lighter"${blend === 'lighter' ? ' selected' : ''}>Add</option><option value="multiply"${blend === 'multiply' ? ' selected' : ''}>Multiply</option></select></label>`;
            li.append(box);
          }
          listEl.append(li);
        });
      }
      root.addEventListener('hm:projectchange', refresh);
      if (root.ready && typeof root.ready.then === 'function') root.ready.then(refresh);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

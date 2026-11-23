/* HM-IMP-02: Interactive Impact Studio — click-to-place target reticle, strike angle,
 * hitstop frames & 1-click fight impact presets. Edit reticle lives in DOM overlay so it never leaks into video exports. */
(function (root) {
  'use strict';

  const IMPACT_HOOK_TYPES = new Set(['hit_orange', 'hit_pink', 'impact_white', 'hitstop_2f']);

  const IMPACT_ARCHETYPES = {
    light_jab: { id: 'light_jab', label: 'Light Jab', type: 'hit_orange', t_rel: 0.08, params: { strength: 0.75, frames: 1, recoil: 7, dur: 0.16, angle: -0.2 } },
    heavy_slam: { id: 'heavy_slam', label: 'Heavy Slam', type: 'hit_orange', t_rel: 0.12, params: { strength: 1.5, frames: 3, recoil: 20, dur: 0.28, angle: 1.25 } },
    blade_parry: { id: 'blade_parry', label: 'Blade Parry', type: 'impact_white', t_rel: 0.08, params: { strength: 1.25, frames: 2, recoil: 14, dur: 0.22, angle: -0.6 } },
    ko_finisher: { id: 'ko_finisher', label: 'KO Finisher', type: 'hit_pink', t_rel: 0.14, params: { strength: 1.85, frames: 4, recoil: 26, dur: 0.34, angle: 0.0 } },
  };

  const ANGLE_PRESETS = {
    up_cut: { id: 'up_cut', label: 'Up-Cut', angle: -1.15 },
    down_smash: { id: 'down_smash', label: 'Down-Smash', angle: 1.25 },
    horizontal: { id: 'horizontal', label: 'Horizontal', angle: 0 },
    diagonal: { id: 'diagonal', label: 'Diagonal', angle: -0.45 },
  };

  function clientPointToStage(clientX, clientY, rect) {
    const w = Math.max(1, Number(rect && rect.width) || 1280);
    const h = Math.max(1, Number(rect && rect.height) || 720);
    const left = Number(rect && rect.left) || 0;
    const top = Number(rect && rect.top) || 0;
    const nx = Math.max(0, Math.min(1, (Number(clientX) - left) / w));
    const ny = Math.max(0, Math.min(1, (Number(clientY) - top) / h));
    return {
      x: Math.round(nx * 1280),
      y: Math.round(ny * 720),
      nx: Math.round(nx * 10000) / 10000,
      ny: Math.round(ny * 10000) / 10000,
    };
  }

  function findImpactHookIndex(hooks) {
    const list = Array.isArray(hooks) ? hooks : [];
    for (let i = 0; i < list.length; i++) {
      const t = typeof list[i] === 'string' ? list[i] : list[i]?.type;
      if (t && IMPACT_HOOK_TYPES.has(t)) return i;
    }
    return -1;
  }

  function cloneHooks(hooks) {
    return (Array.isArray(hooks) ? hooks : []).map((h) => {
      if (typeof h === 'string') return { type: h, t_rel: 0.08, params: {} };
      return Object.assign({}, h, { params: Object.assign({}, (h && h.params) || {}) });
    });
  }

  function applyImpactArchetype(atom, archetypeId, targetPt) {
    if (!atom || typeof atom !== 'object') throw new Error('Select a clip before applying an impact preset.');
    const spec = IMPACT_ARCHETYPES[archetypeId];
    if (!spec) throw new Error('Unknown impact archetype: ' + archetypeId);
    const hooks = cloneHooks(atom.fx_hooks);
    const idx = findImpactHookIndex(hooks);
    const prevParams = idx >= 0 ? hooks[idx].params || {} : {};
    const pt = targetPt || (Number.isFinite(+prevParams.x) && Number.isFinite(+prevParams.y) ? { x: +prevParams.x, y: +prevParams.y } : { x: 640, y: 320 });
    const nextHook = {
      type: spec.type,
      t_rel: spec.t_rel,
      params: Object.assign({}, spec.params, { x: Math.round(pt.x), y: Math.round(pt.y) }),
    };
    if (idx >= 0) hooks[idx] = nextHook;
    else hooks.unshift(nextHook);
    atom.fx_hooks = hooks;
    return nextHook;
  }

  function updateImpactParams(atom, patch) {
    if (!atom || typeof atom !== 'object') throw new Error('Select a clip before editing impact parameters.');
    const p = patch && typeof patch === 'object' ? patch : {};
    const hooks = cloneHooks(atom.fx_hooks);
    let idx = findImpactHookIndex(hooks);
    if (idx < 0) {
      hooks.unshift({ type: 'hit_orange', t_rel: 0.08, params: { x: 640, y: 320 } });
      idx = 0;
    }
    const hk = hooks[idx];
    const prm = Object.assign({}, hk.params || {});
    if (Number.isFinite(+p.x)) prm.x = Math.max(0, Math.min(1280, Math.round(+p.x)));
    if (Number.isFinite(+p.y)) prm.y = Math.max(0, Math.min(720, Math.round(+p.y)));
    if (Number.isFinite(+p.angle)) prm.angle = Math.round(+p.angle * 1000) / 1000;
    if (Number.isFinite(+p.strength)) prm.strength = Math.max(0.2, Math.min(4, +p.strength));
    if (Number.isFinite(+p.frames)) prm.frames = Math.max(0, Math.min(8, Math.round(+p.frames)));
    if (Number.isFinite(+p.t_rel)) hk.t_rel = Math.max(0, Math.min(0.98, Math.round(+p.t_rel * 1000) / 1000));
    hk.params = prm;
    atom.fx_hooks = hooks;
    return hk;
  }

  root.HMImpactStudio = {
    IMPACT_ARCHETYPES,
    ANGLE_PRESETS,
    clientPointToStage,
    findImpactHookIndex,
    applyImpactArchetype,
    updateImpactParams,
  };

  if (typeof document !== 'undefined' && root.HMStudio) {
    const S = root.HMStudio;
    const stackHost = document.getElementById('fxStackPanel') || document.getElementById('effectOptions');
    if (stackHost && stackHost.parentElement) {
      const panel = document.createElement('section');
      panel.id = 'impactStudioPanel';
      panel.className = 'impact-studio-panel';
      panel.setAttribute('aria-label', 'Impact Studio');
      panel.innerHTML =
        '<div class="dual-cam-head"><span class="small-muted">IMPACT STUDIO</span><button type="button" id="impactPickToggle" class="macro-button" aria-pressed="false">◎ Pick target</button></div>' +
        '<div class="impact-archetypes">' +
        Object.values(IMPACT_ARCHETYPES).map((a) => `<button type="button" data-impact-archetype="${a.id}">${a.label}</button>`).join('') +
        '</div>' +
        '<div class="paired-fields paired-fields-3">' +
        '<label>Hit X<input id="impactX" type="number" min="0" max="1280" step="10" value="640"></label>' +
        '<label>Hit Y<input id="impactY" type="number" min="0" max="720" step="10" value="320"></label>' +
        '<label>Angle<select id="impactAnglePreset"><option value="">Custom</option>' + Object.values(ANGLE_PRESETS).map((g) => `<option value="${g.id}">${g.label}</option>`).join('') + '</select></label>' +
        '<label>Strength<input id="impactStrength" type="number" min="0.2" max="3" step="0.1" value="1"></label>' +
        '<label>Hitstop(f)<input id="impactFrames" type="number" min="0" max="8" step="1" value="2"></label>' +
        '<label>Beat %<input id="impactTRel" type="number" min="0" max="0.98" step="0.02" value="0.08"></label>' +
        '</div>' +
        '<p id="impactStudioHint" class="field-hint">Click <b>Pick target</b> then click/drag the preview stage to place impact sparks (edit overlay never exports).</p>';
      stackHost.after(panel);

      // Edit-mode-only DOM reticle inside .stage-surround (outside canvas pixels)
      const stageEl = document.getElementById('stage');
      let reticle = document.getElementById('impactReticleOverlay');
      if (stageEl && stageEl.parentElement && !reticle) {
        reticle = document.createElement('div');
        reticle.id = 'impactReticleOverlay';
        reticle.className = 'impact-reticle-overlay';
        reticle.hidden = true;
        reticle.setAttribute('aria-hidden', 'true');
        stageEl.parentElement.append(reticle);
      }

      let pickMode = false;
      const syncReticle = () => {
        if (!reticle) return;
        const clip = S.show?.atoms?.[S.selectedIndex];
        const idx = findImpactHookIndex(clip?.fx_hooks);
        const prm = idx >= 0 ? (clip.fx_hooks[idx]?.params || {}) : {};
        const x = Number.isFinite(+prm.x) ? +prm.x : 640;
        const y = Number.isFinite(+prm.y) ? +prm.y : 320;
        reticle.hidden = !pickMode;
        if (!pickMode) return;
        reticle.style.left = ((x / 1280) * 100).toFixed(2) + '%';
        reticle.style.top = ((y / 720) * 100).toFixed(2) + '%';
      };

      const pickBtn = document.getElementById('impactPickToggle');
      pickBtn?.addEventListener('click', () => {
        pickMode = !pickMode;
        pickBtn.setAttribute('aria-pressed', String(pickMode));
        pickBtn.classList.toggle('active', pickMode);
        if (stageEl) stageEl.style.cursor = pickMode ? 'crosshair' : '';
        syncReticle();
      });

      const writeImpactFromPointer = (ev) => {
        if (!pickMode || !stageEl) return;
        const pt = clientPointToStage(ev.clientX, ev.clientY, stageEl.getBoundingClientRect());
        S.editProject((proj) => {
          const clip = proj.show.atoms[S.selectedIndex];
          if (clip) updateImpactParams(clip, { x: pt.x, y: pt.y });
        });
      };

      let dragging = false;
      stageEl?.addEventListener('pointerdown', (e) => {
        if (!pickMode) return;
        dragging = true;
        writeImpactFromPointer(e);
      });
      stageEl?.addEventListener('pointermove', (e) => { if (pickMode && dragging) writeImpactFromPointer(e); });
      window.addEventListener('pointerup', () => { dragging = false; });

      panel.querySelectorAll('[data-impact-archetype]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.impactArchetype;
          S.editProject((proj) => {
            const clip = proj.show.atoms[S.selectedIndex];
            if (clip) applyImpactArchetype(clip, id);
          });
          S.status?.('Applied impact archetype: ' + id);
        });
      });

      const bindNum = (elId, key) => {
        document.getElementById(elId)?.addEventListener('change', (e) => {
          const v = Number(e.target.value);
          if (!Number.isFinite(v)) return;
          S.editProject((proj) => {
            const clip = proj.show.atoms[S.selectedIndex];
            if (clip) updateImpactParams(clip, { [key]: v });
          });
        });
      };
      bindNum('impactX', 'x');
      bindNum('impactY', 'y');
      bindNum('impactStrength', 'strength');
      bindNum('impactFrames', 'frames');
      bindNum('impactTRel', 't_rel');
      document.getElementById('impactAnglePreset')?.addEventListener('change', (e) => {
        const g = ANGLE_PRESETS[e.target.value];
        if (!g) return;
        S.editProject((proj) => {
          const clip = proj.show.atoms[S.selectedIndex];
          if (clip) updateImpactParams(clip, { angle: g.angle });
        });
      });

      const refresh = () => {
        const clip = S.show?.atoms?.[S.selectedIndex];
        const idx = findImpactHookIndex(clip?.fx_hooks);
        const hk = idx >= 0 ? clip.fx_hooks[idx] : null;
        const prm = (hk && typeof hk === 'object' && hk.params) || {};
        const setVal = (id, v) => {
          const el = document.getElementById(id);
          if (el && document.activeElement !== el) el.value = String(v);
        };
        setVal('impactX', Number.isFinite(+prm.x) ? +prm.x : 640);
        setVal('impactY', Number.isFinite(+prm.y) ? +prm.y : 320);
        setVal('impactStrength', Number.isFinite(+prm.strength) ? +prm.strength : 1);
        setVal('impactFrames', Number.isFinite(+prm.frames) ? +prm.frames : 2);
        setVal('impactTRel', hk && hk.t_rel != null ? hk.t_rel : 0.08);
        syncReticle();
      };
      root.addEventListener('hm:projectchange', refresh);
      if (root.ready && typeof root.ready.then === 'function') root.ready.then(refresh);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

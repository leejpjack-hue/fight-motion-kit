/* HM-SCN-01 & HM-SCN-02: Fight Cut transition buttons, coordinated Scene Action recipes,
 * depth parallax coupling & procedural Canvas atmosphere mood layer. */
(function (root) {
  'use strict';

  const EXTENDED_CUT_STYLES = [
    { id: 'slash_wipe', label: 'Slash wipe', dur_s: 0.14, hold_s: 0, dir: 1 },
    { id: 'impact_invert_cut', label: 'Impact B&W cut', dur_s: 0.10, hold_s: 0, dir: 1 },
    { id: 'zoom_smash', label: 'Zoom smash', dur_s: 0.14, hold_s: 0, dir: 1 },
    { id: 'iris_focus', label: 'Iris focus', dur_s: 0.16, hold_s: 0, dir: 1 },
  ];

  const MOOD_PRESETS = [
    { id: 'neutral', label: 'Neutral (None)', intensity: 0, motes: false },
    { id: 'sunset_clash', label: 'Sunset Clash', intensity: 0.55, motes: true },
    { id: 'night_neon', label: 'Night Neon', intensity: 0.55, motes: true },
    { id: 'crimson_fury', label: 'Crimson Fury', intensity: 0.6, motes: true },
    { id: 'cold_steel', label: 'Cold Steel', intensity: 0.5, motes: false },
  ];

  const SCENE_RECIPES = {
    high_speed_chase: {
      id: 'high_speed_chase',
      label: 'High-Speed Chase',
      bg_motion: { preset: 'pan_right', amount: 0.75, clock: 'show', parallax_ratio: 0.38 },
      parallax_ratio: 0.38,
      camera_preset: 'eye_orbit',
      camera_ease: 'whip',
      mood: 'sunset_clash',
      fx_cue: 'speed_lines',
    },
    final_standoff: {
      id: 'final_standoff',
      label: 'Final Standoff',
      bg_motion: { preset: 'push_in', amount: 0.35, clock: 'per_atom', parallax_ratio: 0.25 },
      parallax_ratio: 0.25,
      camera_preset: 'eye_push',
      camera_ease: 'smooth',
      mood: 'night_neon',
      fx_cue: null,
    },
    aerial_clash: {
      id: 'aerial_clash',
      label: 'Aerial Clash',
      bg_motion: { preset: 'pan_up', amount: 0.65, clock: 'per_atom', parallax_ratio: 0.45 },
      parallax_ratio: 0.45,
      camera_preset: 'low_rise',
      camera_ease: 'spring',
      mood: 'cold_steel',
      fx_cue: 'speed_lines',
    },
    cornered_pressure: {
      id: 'cornered_pressure',
      label: 'Cornered Pressure',
      bg_motion: { preset: 'pull_out', amount: 0.45, clock: 'per_atom', parallax_ratio: 0.22 },
      parallax_ratio: 0.22,
      camera_preset: 'ecu_jitter',
      camera_ease: 'punch_in',
      mood: 'crimson_fury',
      fx_cue: 'shake',
    },
  };

  function applyExtendedCutStyle(show, atomIndex, styleId, opts) {
    if (!show || !Array.isArray(show.atoms)) throw new Error('Cut transition requires a show.');
    if (!Number.isInteger(atomIndex) || atomIndex < 1 || atomIndex >= show.atoms.length) {
      throw new Error('Select clip 2 or later to apply an incoming cut transition.');
    }
    const spec = EXTENDED_CUT_STYLES.find((c) => c.id === styleId);
    if (!spec) throw new Error('Unknown cut style: ' + styleId);
    const o = opts && typeof opts === 'object' ? opts : {};
    const dur_s = Number.isFinite(+o.dur_s) ? Math.max(0.02, Math.min(0.5, +o.dur_s)) : spec.dur_s;
    const dir = o.dir < 0 ? -1 : 1;
    show.atoms[atomIndex].cut = { preset: spec.id, dur_s, hold_s: 0, dir };
    return show.atoms[atomIndex].cut;
  }

  function setSceneParallax(show, atomIndex, ratio, opts) {
    if (!show || typeof show !== 'object') throw new Error('Parallax requires a show.');
    const r = Math.round(Math.max(0, Math.min(1, Number(ratio) || 0)) * 10000) / 10000;
    const clip = Number.isInteger(atomIndex) && atomIndex >= 0 && Array.isArray(show.atoms) ? show.atoms[atomIndex] : null;
    if (opts?.scope === 'clip' && clip) {
      clip.background = Object.assign({}, clip.background || {});
      clip.background.motion = Object.assign({ preset: 'follow_camera', amount: 0.4 }, clip.background.motion || {}, { parallax_ratio: r });
      return r;
    }
    show.bg = Object.assign({}, show.bg || {}, { parallax_ratio: r });
    if (show.bg.parallax_ratio === 0) delete show.bg.parallax_ratio;
    return r;
  }

  function applySceneMood(show, moodId, opts) {
    if (!show || typeof show !== 'object') throw new Error('Mood requires a show.');
    const o = opts && typeof opts === 'object' ? opts : {};
    const spec = MOOD_PRESETS.find((m) => m.id === moodId);
    if (!spec) throw new Error('Unknown mood preset: ' + moodId);
    const clip = Number.isInteger(o.atomIndex) && Array.isArray(show.atoms) ? show.atoms[o.atomIndex] : null;
    const target = o.scope === 'clip' && clip ? clip : show;
    if (spec.id === 'neutral') {
      delete target.mood;
      return null;
    }
    target.mood = {
      id: spec.id,
      intensity: o.intensity != null && Number.isFinite(+o.intensity) ? Math.max(0, Math.min(1, +o.intensity)) : spec.intensity,
      motes: o.motes !== undefined ? !!o.motes : spec.motes,
    };
    return target.mood;
  }

  function applySceneRecipe(show, atomIndex, recipeId) {
    if (!show || !Array.isArray(show.atoms)) throw new Error('Scene recipe requires a show.');
    const recipe = SCENE_RECIPES[recipeId];
    if (!recipe) throw new Error('Unknown scene recipe: ' + recipeId);
    const idx = Number.isInteger(atomIndex) && atomIndex >= 0 && atomIndex < show.atoms.length ? atomIndex : 0;
    const atom = show.atoms[idx];
    if (!atom) throw new Error('Select a clip before applying a Scene Action recipe.');
    show.bg = Object.assign({}, show.bg || {}, {
      parallax_ratio: recipe.parallax_ratio,
      motion: Object.assign({}, recipe.bg_motion),
    });
    atom.camera = Object.assign({}, atom.camera || {}, {
      preset: recipe.camera_preset,
      ease: recipe.camera_ease,
    });
    delete atom.camera.segments;
    applySceneMood(show, recipe.mood, { scope: 'show' });
    if (recipe.fx_cue && root.HMFxStack && typeof root.HMFxStack.addLayer === 'function') {
      const existing = root.HMFxStack.normalizeStack(atom.fx_hooks || []);
      if (!existing.some((h) => h.type === recipe.fx_cue)) {
        atom.fx_hooks = root.HMFxStack.addLayer(atom.fx_hooks || [], recipe.fx_cue);
      }
    }
    return { recipe: recipe.id, atomIndex: idx, mood: show.mood, parallax_ratio: show.bg.parallax_ratio };
  }

  root.HMSceneAction = {
    EXTENDED_CUT_STYLES,
    MOOD_PRESETS,
    SCENE_RECIPES,
    applyExtendedCutStyle,
    setSceneParallax,
    applySceneMood,
    applySceneRecipe,
  };

  if (typeof document !== 'undefined' && root.HMStudio) {
    const S = root.HMStudio;
    // 1. Mount Fight Cut transition buttons without modifying #cutPreset <option> list (HM-PF-43 safety)
    const cutGroup = document.getElementById('cutTransitionGroup');
    const cutPresetEl = document.getElementById('cutPreset');
    if (cutGroup && cutPresetEl) {
      const extBar = document.createElement('div');
      extBar.id = 'extendedCutBar';
      extBar.className = 'extended-cut-bar';
      extBar.innerHTML =
        `<span class="small-muted">Fight cuts</span>` +
        EXTENDED_CUT_STYLES.map((c) => `<button type="button" data-ext-cut="${c.id}">${c.label}</button>`).join('');
      const cutHintEl = document.getElementById('cutHint');
      if (cutHintEl) cutHintEl.after(extBar);
      else cutGroup.append(extBar);

      extBar.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-ext-cut]');
        if (!btn || btn.disabled) return;
        const id = btn.dataset.extCut;
        const dur = Number(document.getElementById('cutDur')?.value);
        const dir = Number(document.getElementById('cutDir')?.value);
        S.editProject((proj) => { applyExtendedCutStyle(proj.show, S.selectedIndex, id, { dur_s: dur, dir }); });
        S.status?.('Applied fight cut: ' + id);
      });
    }

    // 2. Mount Scene Action Choreography + Parallax + Mood Panel inside Background group
    const bgPackEl = document.getElementById('backgroundMotionPack');
    const bgSection = bgPackEl?.closest('details, .settings-group, section') || bgPackEl?.parentElement;
    if (bgSection) {
      const panel = document.createElement('section');
      panel.id = 'sceneActionPanel';
      panel.className = 'scene-action-panel';
      panel.setAttribute('aria-label', 'Scene Action and Atmosphere');
      panel.innerHTML =
        `<div class="dual-cam-head sub-header"><span class="small-muted">Scene action &amp; mood</span></div>` +
        `<div class="scene-recipe-grid">` +
        Object.values(SCENE_RECIPES).map((r) => `<button type="button" data-scene-recipe="${r.id}">${r.label}</button>`).join('') +
        `</div>` +
        `<div class="paired-fields">` +
        `<label>Parallax <span id="sceneParallaxValue">0%</span><input id="sceneParallaxRatio" type="range" min="0" max="0.8" step="0.05" value="0"></label>` +
        `<label>Mood<select id="sceneMoodSelect">${MOOD_PRESETS.map((m) => `<option value="${m.id}">${m.label}</option>`).join('')}</select></label>` +
        `</div>` +
        `<label class="slider-label" for="sceneMoodIntensity">Mood glow <output id="sceneMoodIntensityValue">55%</output></label>` +
        `<input id="sceneMoodIntensity" type="range" min="0" max="1" step="0.05" value="0.55">`;
      bgSection.append(panel);

      panel.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-scene-recipe]');
        if (!btn) return;
        const id = btn.dataset.sceneRecipe;
        S.editProject((proj) => { applySceneRecipe(proj.show, S.selectedIndex, id); });
        S.status?.('Applied Scene Action recipe: ' + id);
      });

      document.getElementById('sceneParallaxRatio')?.addEventListener('input', (e) => {
        const v = Number(e.target.value);
        const valEl = document.getElementById('sceneParallaxValue');
        if (valEl) valEl.textContent = Math.round(v * 100) + '%';
        S.editProject((proj) => { setSceneParallax(proj.show, S.selectedIndex, v); });
      });

      const syncMoodVal = (v) => {
        const valEl = document.getElementById('sceneMoodIntensityValue');
        if (valEl) valEl.textContent = Math.round((Number.isFinite(+v) ? +v : 0.55) * 100) + '%';
      };
      const writeMood = () => {
        const id = document.getElementById('sceneMoodSelect')?.value || 'neutral';
        const intensity = Number(document.getElementById('sceneMoodIntensity')?.value);
        syncMoodVal(intensity);
        S.editProject((proj) => { applySceneMood(proj.show, id, { intensity }); });
      };
      document.getElementById('sceneMoodSelect')?.addEventListener('change', writeMood);
      document.getElementById('sceneMoodIntensity')?.addEventListener('input', (e) => syncMoodVal(e.target.value));
      document.getElementById('sceneMoodIntensity')?.addEventListener('change', writeMood);
    }

    const refresh = () => {
      const show = S.show;
      const clip = show?.atoms?.[S.selectedIndex];
      const extBar = document.getElementById('extendedCutBar');
      if (extBar) {
        const activeCut = clip?.cut?.preset || '';
        extBar.querySelectorAll('[data-ext-cut]').forEach((b) => {
          b.disabled = !clip || S.selectedIndex < 1;
          const on = b.dataset.extCut === activeCut;
          b.classList.toggle('active', on);
          b.setAttribute('aria-pressed', String(on));
        });
      }
      const pxRatio = Number(show?.bg?.parallax_ratio || 0);
      const pxEl = document.getElementById('sceneParallaxRatio');
      if (pxEl && document.activeElement !== pxEl) pxEl.value = String(pxRatio);
      const pxVal = document.getElementById('sceneParallaxValue');
      if (pxVal) pxVal.textContent = Math.round(pxRatio * 100) + '%';
      const mood = (clip?.mood && typeof clip.mood === 'object' ? clip.mood : null) || (show?.mood && typeof show.mood === 'object' ? show.mood : null);
      const moodSel = document.getElementById('sceneMoodSelect');
      if (moodSel && document.activeElement !== moodSel) moodSel.value = mood?.id || 'neutral';
      const moodInt = document.getElementById('sceneMoodIntensity');
      const mv = mood?.intensity ?? 0.55;
      if (moodInt && document.activeElement !== moodInt) moodInt.value = String(mv);
      const moodIntVal = document.getElementById('sceneMoodIntensityValue');
      if (moodIntVal) moodIntVal.textContent = Math.round(mv * 100) + '%';
    };
    root.addEventListener('hm:projectchange', refresh);
    if (root.ready && typeof root.ready.then === 'function') root.ready.then(refresh);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

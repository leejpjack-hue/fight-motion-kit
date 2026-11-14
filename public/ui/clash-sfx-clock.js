(function (root) {
  'use strict';

  var IMPACT_HOOK_TYPES = {
    hit_orange: 1.0,
    hit_pink: 0.95,
    fist_pressure: 1.0,
    leg_arc: 0.92,
    sparks: 0.82,
    exposure_warm_crush: 0.9,
    flash_orange: 0.85,
    shake: 0.78
  };

  function round4(v) {
    return Math.round((Number(v) || 0) * 10000) / 10000;
  }

  function extractShow(showOrProject) {
    if (!showOrProject || typeof showOrProject !== 'object') return { show_id: 'motion', atoms: [] };
    if (showOrProject.show && Array.isArray(showOrProject.show.atoms)) return showOrProject.show;
    return showOrProject;
  }

  function isClashAtom(atom) {
    if (!atom || typeof atom !== 'object') return false;
    var bc = atom.motion && atom.motion.beat_class;
    if (bc === 'clash' || bc === 'impact' || bc === 'counter' || bc === 'finish') return true;
    var hooks = Array.isArray(atom.fx_hooks) ? atom.fx_hooks : [];
    for (var i = 0; i < hooks.length; i++) {
      if (hooks[i] && Object.prototype.hasOwnProperty.call(IMPACT_HOOK_TYPES, hooks[i].type)) return true;
    }
    if (/clash|strike|kick|punch|parry|impact/i.test(String(atom.label || ''))) return true;
    return false;
  }

  function findHeroBeatT0(showOrProject, opts) {
    opts = opts || {};
    if (Number.isFinite(+opts.heroBeatT0)) return round4(Math.max(0, +opts.heroBeatT0));
    var show = extractShow(showOrProject);
    if (show.sfx && Number.isFinite(+show.sfx.hero_beat_t0)) return round4(Math.max(0, +show.sfx.hero_beat_t0));
    var atoms = Array.isArray(show.atoms) ? show.atoms : [];
    var acc = 0;
    for (var i = 0; i < atoms.length; i++) {
      var a = atoms[i] || {};
      var dur = Number.isFinite(+a.duration_s) && +a.duration_s > 0 ? +a.duration_s : 0.5;
      if (a.hero_beat === true || (a.motion && a.motion.beat_role === 'hero') || /\bhero\b/i.test(String(a.label || ''))) {
        return round4(acc);
      }
      acc += dur;
    }
    acc = 0;
    for (var j = 0; j < atoms.length; j++) {
      var aj = atoms[j] || {};
      var dj = Number.isFinite(+aj.duration_s) && +aj.duration_s > 0 ? +aj.duration_s : 0.5;
      if (isClashAtom(aj)) return round4(acc);
      acc += dj;
    }
    return 0;
  }

  function choosePeakHook(atom, dur) {
    var hooks = Array.isArray(atom.fx_hooks) ? atom.fx_hooks : [];
    var best = null;
    for (var i = 0; i < hooks.length; i++) {
      var hk = hooks[i];
      if (!hk || !Object.prototype.hasOwnProperty.call(IMPACT_HOOK_TYPES, hk.type)) continue;
      var tRel = Number.isFinite(+hk.t_rel) ? +hk.t_rel : 0.08;
      tRel = Math.max(0, Math.min(Math.max(0.01, dur - 0.02), tRel));
      var weight = IMPACT_HOOK_TYPES[hk.type] || 0.75;
      if (!best || tRel < best.tRel - 1e-6 || (Math.abs(tRel - best.tRel) <= 1e-6 && weight > best.gain)) {
        best = { kind: hk.type, tRel: tRel, gain: weight };
      }
    }
    if (best) return best;
    return { kind: 'clash_peak', tRel: round4(Math.min(dur * 0.5, Math.max(0.05, dur - 0.04))), gain: 0.72 };
  }

  function buildCuePlan(showOrProject, opts) {
    opts = opts || {};
    var show = extractShow(showOrProject);
    var atoms = Array.isArray(show.atoms) ? show.atoms : [];
    var heroBeatT0 = findHeroBeatT0(show, opts);
    var enabled = Boolean(opts.enabled); // strict silent default = false
    var cues = [];
    var acc = 0;
    for (var i = 0; i < atoms.length; i++) {
      var a = atoms[i] || {};
      var dur = Number.isFinite(+a.duration_s) && +a.duration_s > 0 ? +a.duration_s : 0.5;
      var t0 = round4(acc);
      var t1 = round4(t0 + dur);
      acc = t1;
      if (t1 <= heroBeatT0 + 1e-6) continue;
      if (!isClashAtom(a)) continue;
      var peak = choosePeakHook(a, dur);
      var tPeak = round4(t0 + peak.tRel);
      if (tPeak < heroBeatT0 - 1e-6) continue;
      cues.push({
        id: 'sfx-' + (a.id || ('atom-' + (i + 1))),
        atom_index: i,
        atom_id: a.id || ('atom-' + (i + 1)),
        label: a.label || a.id || ('atom-' + (i + 1)),
        kind: peak.kind,
        t0: t0,
        t1: t1,
        t_peak: tPeak,
        duration_s: 0.14,
        peak_gain: round4(peak.gain)
      });
    }
    return {
      show_id: String(show.show_id || 'motion'),
      clock: 'renderAt',
      enabled: enabled,
      hero_beat_t0: heroBeatT0,
      duration_s: round4(acc),
      audioLufsChecked: false,
      cues: cues
    };
  }

  function sampleAt(plan, t, opts) {
    opts = opts || {};
    var enabled = opts.enabled !== undefined ? Boolean(opts.enabled) : Boolean(plan && plan.enabled);
    var time = round4(Number(t) || 0);
    var heroT0 = plan && Number.isFinite(+plan.hero_beat_t0) ? +plan.hero_beat_t0 : 0;
    if (!enabled || !plan || !Array.isArray(plan.cues) || time < heroT0 - 1e-6) {
      return {
        clock: 'renderAt',
        enabled: enabled,
        t: time,
        hero_beat_t0: heroT0,
        silent: true,
        amplitude: 0,
        activeCues: []
      };
    }
    var maxAmp = 0;
    var active = [];
    for (var i = 0; i < plan.cues.length; i++) {
      var c = plan.cues[i];
      if (time < c.t_peak - 0.012 || time > c.t_peak + (c.duration_s || 0.14)) continue;
      var amp = 0;
      if (time < c.t_peak) {
        amp = c.peak_gain * Math.max(0, (time - (c.t_peak - 0.012)) / 0.012);
      } else {
        amp = c.peak_gain * Math.exp(-(time - c.t_peak) * 24);
      }
      if (amp > 0.001) {
        if (amp > maxAmp) maxAmp = amp;
        active.push({ id: c.id, atom_id: c.atom_id, kind: c.kind, t_peak: c.t_peak, amp: round4(amp) });
      }
    }
    maxAmp = round4(maxAmp);
    return {
      clock: 'renderAt',
      enabled: enabled,
      t: time,
      hero_beat_t0: heroT0,
      silent: maxAmp <= 0,
      amplitude: maxAmp,
      activeCues: active
    };
  }

  var state = {
    enabled: false,
    ctx: null,
    lastSample: null,
    lastTriggerCueId: '',
    lastTriggerT: -1
  };

  function ensureAudioContext() {
    if (!state.enabled) return null;
    if (state.ctx) {
      if (state.ctx.state === 'suspended' && typeof state.ctx.resume === 'function') {
        try { state.ctx.resume(); } catch (e) {}
      }
      return state.ctx;
    }
    var Ctor = root.AudioContext || root.webkitAudioContext;
    if (!Ctor) return null;
    try { state.ctx = new Ctor(); } catch (e) { state.ctx = null; }
    return state.ctx;
  }

  function triggerTransientWebAudio(cue) {
    var ctx = ensureAudioContext();
    if (!ctx || ctx.state === 'closed') return false;
    try {
      var now = ctx.currentTime;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = cue.kind === 'sparks' || cue.kind === 'leg_arc' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(52, now + 0.09);
      gain.gain.setValueAtTime(Math.max(0.05, Math.min(0.45, cue.peak_gain * 0.35)), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
      return true;
    } catch (e) {
      return false;
    }
  }

  function syncStudio(studio, timeOverride) {
    var S = studio || root.HMStudio;
    if (!S || !S.show) return null;
    var plan = buildCuePlan(S.show, { enabled: state.enabled });
    var t = Number.isFinite(timeOverride) ? Number(timeOverride) : Number(S.time || 0);
    var sample = sampleAt(plan, t, { enabled: state.enabled });
    state.lastSample = sample;
    if (state.enabled && sample.activeCues.length) {
      var lead = sample.activeCues[0];
      if (lead.id !== state.lastTriggerCueId || Math.abs(t - state.lastTriggerT) > 0.25) {
        if (Math.abs(t - lead.t_peak) <= 0.045) {
          triggerTransientWebAudio(lead);
          state.lastTriggerCueId = lead.id;
          state.lastTriggerT = t;
        }
      }
    }
    if (typeof document !== 'undefined') {
      var statusEl = document.getElementById('clashSfxStatus');
      if (statusEl) {
        statusEl.textContent = state.enabled
          ? ('Active (renderAt) · ' + plan.cues.length + ' clash cues · hero≥' + plan.hero_beat_t0.toFixed(2) + 's · ' + (sample.silent ? 'quiet' : 'PEAK'))
          : ('Silent default (opt-in) · ' + plan.cues.length + ' clash peaks ready (hero≥' + plan.hero_beat_t0.toFixed(2) + 's)');
      }
    }
    return { plan: plan, sample: sample };
  }

  function setEnabled(enabled) {
    state.enabled = Boolean(enabled);
    if (!state.enabled) {
      state.lastTriggerCueId = '';
      state.lastTriggerT = -1;
    }
    if (typeof document !== 'undefined') {
      var chk = document.getElementById('clashSfxToggle');
      if (chk) chk.checked = state.enabled;
    }
    return syncStudio(root.HMStudio);
  }

  function mount() {
    if (typeof document === 'undefined') return;
    var chk = document.getElementById('clashSfxToggle');
    if (chk && chk.dataset.hmBound !== '1') {
      chk.dataset.hmBound = '1';
      chk.checked = state.enabled;
      chk.addEventListener('change', function () {
        setEnabled(chk.checked);
      });
    }
    var S = root.HMStudio;
    if (S && typeof S.renderAt === 'function' && !S.renderAt.__hmClashSfxWrapped) {
      var origRenderAt = S.renderAt;
      var wrapped = function (t, opts) {
        var out = origRenderAt.apply(this, arguments);
        syncStudio(S, Number.isFinite(+out) ? +out : +t);
        return out;
      };
      wrapped.__hmClashSfxWrapped = true;
      S.renderAt = wrapped;
    }
    if (typeof root.addEventListener === 'function') {
      root.addEventListener('hm:projectchange', function () { syncStudio(root.HMStudio); });
    }
    syncStudio(S);
  }

  var api = {
    isClashAtom: isClashAtom,
    findHeroBeatT0: findHeroBeatT0,
    buildCuePlan: buildCuePlan,
    sampleAt: sampleAt,
    setEnabled: setEnabled,
    syncStudio: syncStudio,
    get enabled() { return state.enabled; },
    get lastSample() { return state.lastSample; },
    mount: mount
  };

  root.HMClashSfxClock = api;

  if (typeof document !== 'undefined') {
    var ready = root.ready;
    if (ready && typeof ready.then === 'function') ready.then(mount, mount);
    else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
    else mount();
  }

  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

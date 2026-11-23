/*! HM-TL-01 & HM-TL-02: Separate Multi-Track Timeline (FG / Character / BG)
 * Pure model/clamp helpers work in Node tests; DOM mounting attaches in browser when HMStudio is present. */
(function (global) {
  'use strict';

  const round4 = v => Math.round((+v || 0) * 10000) / 10000;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function basenameLabel(src) {
    if (!src) return '';
    if (String(src).startsWith('data:')) return 'Embedded image';
    const clean = String(src).split(/[?#]/, 1)[0];
    const idx = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
    const base = idx >= 0 ? clean.slice(idx + 1) : clean;
    return base.replace(/\.[^.]+$/, '') || base;
  }

  function formatBgMotionBadge(motion) {
    const m = motion && typeof motion === 'object' ? motion : null;
    if (!m || !m.preset || m.preset === 'follow_camera') return 'CAM';
    const p = m.preset;
    const sp = m.speed_px_s != null && Number.isFinite(+m.speed_px_s)
      ? Math.round(+m.speed_px_s)
      : Math.round(120 + (Number.isFinite(+m.amount) ? +m.amount : 0.4) * 980);
    if (p === 'scroll_left') return 'RUN ← ' + sp;
    if (p === 'scroll_right') return 'RUN → ' + sp;
    if (p === 'scroll_up') return 'RUN ↑ ' + sp;
    if (p === 'scroll_down') return 'RUN ↓ ' + sp;
    if (p === 'pan_left') return 'PAN ←';
    if (p === 'pan_right') return 'PAN →';
    if (p === 'pan_up') return 'PAN ↑';
    if (p === 'pan_down') return 'PAN ↓';
    if (p === 'push_in') return 'ZOOM +';
    if (p === 'pull_out') return 'ZOOM −';
    if (p === 'static') return 'HOLD';
    return p;
  }

  function buildTrackModel(project, durationOverride) {
    const show = (project && project.show) || {};
    const atoms = Array.isArray(show.atoms) ? show.atoms : [];
    let cursor = 0;
    const characterClips = [];
    const snapSet = new Set([0]);
    for (let i = 0; i < atoms.length; i++) {
      const a = atoms[i] || {};
      const d = Math.max(0.1, Number.isFinite(+a.duration_s) ? +a.duration_s : 0.5);
      const t0 = round4(cursor);
      const t1 = round4(cursor + d);
      cursor = t1;
      snapSet.add(t1);
      characterClips.push({
        index: i,
        id: a.id || ('atom-' + (i + 1)),
        label: a.label || a.id || ('Clip ' + (i + 1)),
        t0,
        t1,
        durationS: round4(d),
        hasBgOverride: !!(a.background && (a.background.src !== undefined || a.background.motion)),
      });
    }
    const dur = Math.max(0.1, Number.isFinite(+durationOverride) && +durationOverride > 0 ? +durationOverride : (cursor || 5));
    characterClips.forEach(c => {
      c.leftPct = round4((c.t0 / dur) * 100);
      c.widthPct = round4(((c.t1 - c.t0) / dur) * 100);
    });

    // Pack overlapping FG props onto non-colliding horizontal sub-rows
    const rawProps = Array.isArray(show.fg?.props) ? show.fg.props : [];
    const sortedProps = rawProps.slice().sort((a, b) => (+a.t_start || 0) - (+b.t_start || 0) || (+a.z || 0) - (+b.z || 0));
    const rowEnds = [];
    const fgBars = [];
    for (const prop of sortedProps) {
      if (!prop || !prop.id) continue;
      const t0 = clamp(Number.isFinite(+prop.t_start) ? +prop.t_start : 0, 0, dur);
      const t1 = clamp(Number.isFinite(+prop.t_end) ? +prop.t_end : dur, Math.min(dur, t0 + 0.05), dur);
      let row = rowEnds.findIndex(endT => endT <= t0 + 1e-4);
      if (row < 0) {
        row = rowEnds.length;
        rowEnds.push(t1);
      } else {
        rowEnds[row] = t1;
      }
      const kfMarkers = Array.isArray(prop.kf)
        ? prop.kf.map(k => ({ t: round4(+k.t || 0), pctInBar: t1 > t0 ? round4(clamp(((+k.t - t0) / (t1 - t0)) * 100, 0, 100)) : 0 }))
        : [];
      const breakT = prop.effect?.type === 'break' && Number.isFinite(+prop.effect.t) ? round4(+prop.effect.t) : null;
      const breakPct = breakT != null && t1 > t0 && breakT >= t0 && breakT <= t1
        ? round4(((breakT - t0) / (t1 - t0)) * 100)
        : null;
      fgBars.push({
        id: prop.id,
        label: basenameLabel(prop.src) || prop.id,
        src: prop.src,
        slot: prop.slot === 'overlay' ? 'overlay' : 'prop',
        z: +prop.z || 0,
        t_start: round4(t0),
        t_end: round4(t1),
        row,
        leftPct: round4((t0 / dur) * 100),
        widthPct: round4(Math.max(1.5, ((t1 - t0) / dur) * 100)),
        passBy: !!(prop.pass_by && prop.pass_by.enabled),
        kfMarkers,
        breakT,
        breakPct,
      });
    }
    const fgRows = [];
    for (let r = 0; r < Math.max(1, rowEnds.length); r++) {
      fgRows.push(fgBars.filter(b => b.row === r));
    }

    // Build BG segments from either bg.locations[] or legacy base/swap
    const bg = (show.bg && typeof show.bg === 'object') ? show.bg : {};
    const bgSegments = [];
    let bgSwapBoundaryPct = null;
    if (Array.isArray(bg.locations) && bg.locations.length) {
      const locs = bg.locations.slice().sort((a, b) => (+a.t0 || 0) - (+b.t0 || 0));
      for (const loc of locs) {
        const t0 = clamp(+loc.t0 || 0, 0, dur);
        const t1 = clamp(+loc.t1 || dur, t0, dur);
        if (t1 <= t0) continue;
        bgSegments.push({
          kind: 'location',
          id: loc.id,
          key: 'location',
          label: loc.src ? (basenameLabel(loc.src) || loc.id) : 'White canvas',
          src: loc.src || null,
          t0: round4(t0),
          t1: round4(t1),
          leftPct: round4((t0 / dur) * 100),
          widthPct: round4(((t1 - t0) / dur) * 100),
          motionBadge: formatBgMotionBadge(loc.motion),
          isScroll: String(loc.motion?.preset || '').startsWith('scroll_'),
          isWhite: !loc.src,
        });
      }
    } else if (bg.swap && Number.isFinite(+bg.swap_t) && +bg.swap_t > 0 && +bg.swap_t < dur) {
      const sw = round4(clamp(+bg.swap_t, 0.1, dur - 0.1));
      bgSwapBoundaryPct = round4((sw / dur) * 100);
      bgSegments.push({
        kind: 'pair',
        id: 'base',
        key: 'base',
        label: bg.base ? (basenameLabel(bg.base) || 'Base BG') : 'White canvas',
        src: bg.base || null,
        t0: 0,
        t1: sw,
        leftPct: 0,
        widthPct: bgSwapBoundaryPct,
        motionBadge: formatBgMotionBadge(bg.motion),
        isScroll: String(bg.motion?.preset || '').startsWith('scroll_'),
        isWhite: !bg.base,
      });
      bgSegments.push({
        kind: 'pair',
        id: 'swap',
        key: 'swap',
        label: basenameLabel(bg.swap) || 'After switch',
        src: bg.swap,
        t0: sw,
        t1: round4(dur),
        leftPct: bgSwapBoundaryPct,
        widthPct: round4(100 - bgSwapBoundaryPct),
        motionBadge: formatBgMotionBadge(bg.motion),
        isScroll: String(bg.motion?.preset || '').startsWith('scroll_'),
        isWhite: false,
      });
    } else {
      const useSwapOnly = !!(bg.swap && Number.isFinite(+bg.swap_t) && +bg.swap_t <= 0);
      const src = useSwapOnly ? bg.swap : (bg.base || null);
      const key = useSwapOnly ? 'swap' : 'base';
      bgSegments.push({
        kind: 'pair',
        id: key,
        key,
        label: src ? (basenameLabel(src) || (key === 'swap' ? 'After switch' : 'Base BG')) : 'White canvas',
        src,
        t0: 0,
        t1: round4(dur),
        leftPct: 0,
        widthPct: 100,
        motionBadge: formatBgMotionBadge(bg.motion),
        isScroll: String(bg.motion?.preset || '').startsWith('scroll_'),
        isWhite: !src,
      });
    }

    let bgSpanBracket = null;
    if (!Array.isArray(bg.locations) && bg.motion && bg.motion.clock === 'span') {
      const sp = bg.motion.span;
      const st0 = Array.isArray(sp) ? +sp[0] : (sp && typeof sp === 'object' ? +sp.t0 : +bg.motion.t0);
      const st1 = Array.isArray(sp) ? +sp[1] : (sp && typeof sp === 'object' ? +sp.t1 : +bg.motion.t1);
      if (Number.isFinite(st0) && Number.isFinite(st1) && st1 > st0) {
        const c0 = clamp(st0, 0, dur), c1 = clamp(st1, c0, dur);
        bgSpanBracket = {
          t0: round4(c0),
          t1: round4(c1),
          leftPct: round4((c0 / dur) * 100),
          widthPct: round4(((c1 - c0) / dur) * 100),
        };
      }
    }

    return {
      duration: round4(dur),
      characterClips,
      fgRows,
      fgBars,
      bgSegments,
      bgClipOverrides: characterClips.filter(c => c.hasBgOverride),
      bgSpanBracket,
      bgSwapBoundaryPct,
      snapPoints: Array.from(snapSet).sort((a, b) => a - b),
      counts: { fg: fgBars.length, character: atoms.length, bg: bgSegments.length },
    };
  }

  function snapTime(t, snapPoints, step = 0.05, threshold = 0.08, disableSnap = false) {
    const val = Number.isFinite(+t) ? +t : 0;
    if (disableSnap) return round4(val);
    if (Array.isArray(snapPoints)) {
      let best = null, bestDist = threshold;
      for (let i = 0; i < snapPoints.length; i++) {
        const d = Math.abs(snapPoints[i] - val);
        if (d <= bestDist) { bestDist = d; best = snapPoints[i]; }
      }
      if (best != null) return round4(best);
    }
    const q = Math.max(0.01, +step || 0.05);
    return round4(Math.round(val / q) * q);
  }

  function clampFgWindowMove(prop, deltaS, duration) {
    const dur = Math.max(0.1, +duration || 5);
    const orig0 = clamp(+prop?.t_start || 0, 0, dur);
    const orig1 = clamp(+prop?.t_end || dur, orig0 + 0.1, dur);
    const span = Math.max(0.1, orig1 - orig0);
    const next0 = round4(clamp(orig0 + (+deltaS || 0), 0, Math.max(0, dur - span)));
    const next1 = round4(Math.min(dur, next0 + span));
    return { t_start: next0, t_end: next1 };
  }

  function clampFgWindowTrim(prop, edge, nextT, duration, minDur = 0.1) {
    const dur = Math.max(0.1, +duration || 5);
    const minSpan = Math.max(0.05, +minDur || 0.1);
    const cur0 = clamp(+prop?.t_start || 0, 0, dur);
    const cur1 = clamp(+prop?.t_end || dur, Math.min(dur, cur0 + minSpan), dur);
    if (edge === 'left') {
      return { t_start: round4(clamp(+nextT || 0, 0, Math.max(0, cur1 - minSpan))), t_end: round4(cur1) };
    }
    return { t_start: round4(cur0), t_end: round4(clamp(+nextT || cur1, Math.min(dur, cur0 + minSpan), dur)) };
  }

  function neighborBounds(locations, id, duration) {
    const dur = Math.max(0.1, +duration || 5);
    const sorted = (Array.isArray(locations) ? locations.slice() : []).sort((a, b) => (+a.t0 || 0) - (+b.t0 || 0));
    const idx = sorted.findIndex(r => r && r.id === id);
    if (idx < 0) return null;
    const row = sorted[idx];
    const prev = idx > 0 ? sorted[idx - 1] : null;
    const next = idx < sorted.length - 1 ? sorted[idx + 1] : null;
    return {
      row,
      minT0: prev ? round4(+prev.t1 || 0) : 0,
      maxT1: next ? round4(+next.t0 || dur) : dur,
    };
  }

  function clampBgLocationTrim(locations, id, edge, nextT, duration, minDur = 0.1) {
    const bounds = neighborBounds(locations, id, duration);
    if (!bounds) return null;
    const { row, minT0, maxT1 } = bounds;
    const minSpan = Math.max(0.05, +minDur || 0.1);
    const cur0 = clamp(+row.t0 || 0, minT0, maxT1);
    const cur1 = clamp(+row.t1 || maxT1, Math.min(maxT1, cur0 + minSpan), maxT1);
    if (edge === 'left') {
      return { t0: round4(clamp(+nextT || 0, minT0, Math.max(minT0, cur1 - minSpan))), t1: round4(cur1) };
    }
    return { t0: round4(cur0), t1: round4(clamp(+nextT || cur1, Math.min(maxT1, cur0 + minSpan), maxT1)) };
  }

  function clampBgLocationMove(locations, id, deltaS, duration) {
    const bounds = neighborBounds(locations, id, duration);
    if (!bounds) return null;
    const { row, minT0, maxT1 } = bounds;
    const span = Math.max(0.1, (+row.t1 || 0) - (+row.t0 || 0));
    const next0 = round4(clamp((+row.t0 || 0) + (+deltaS || 0), minT0, Math.max(minT0, maxT1 - span)));
    return { t0: next0, t1: round4(Math.min(maxT1, next0 + span)) };
  }

  function clampBgSwapTime(nextT, duration, minEdge = 0.1) {
    const dur = Math.max(0.2, +duration || 5);
    const edge = Math.min(dur * 0.45, Math.max(0.05, +minEdge || 0.1));
    return round4(clamp(+nextT || 0, edge, dur - edge));
  }

  // ---- Browser DOM mounting & direct multi-track manipulation ----
  let activeFgId = null;
  let activeBgKey = null;
  let controlsBound = false;

  function mountBrowserTimeline() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return null;
    const S = window.HMStudio;
    const C = window.HMComposeClient;
    if (!S) return null;
    const $ = id => document.getElementById(id);

    function showDragTip(cx, rectTop, text) {
      const tip = document.createElement('div');
      tip.className = 'clip-trim-tooltip';
      tip.textContent = text;
      tip.style.left = Math.round(cx + 10) + 'px';
      tip.style.top = Math.round(rectTop - 26) + 'px';
      document.body.append(tip);
      return tip;
    }

    function timeFromClientX(clientX, container) {
      const box = (container || $('timelineTrack'))?.getBoundingClientRect();
      const d = S.duration || 5;
      if (!box || box.width <= 0) return 0;
      const frac = clamp((clientX - box.left) / box.width, 0, 1);
      return round4(frac * d);
    }

    function attachRulerScrub(el) {
      if (!el || el.dataset.hmScrubBound) return;
      el.dataset.hmScrubBound = '1';
      el.addEventListener('pointerdown', e => {
        if (e.button !== 0 || S.recording) return;
        if (e.target.closest('.track-bar, .timeline-clip, .track-trim-handle, .bg-swap-handle')) return;
        e.preventDefault();
        S.pause();
        const seekHere = cx => S.renderAt(timeFromClientX(cx, $('timelineTrack')), { source: 'timeline-scrub' });
        seekHere(e.clientX);
        const onMove = ev => seekHere(ev.clientX);
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
      });
    }

    function bindHeaderControls() {
      if (controlsBound) return;
      controlsBound = true;
      attachRulerScrub($('ruler'));
      attachRulerScrub($('timelineFgLane'));
      attachRulerScrub($('timelineBgLane'));

      $('trackMuteFg')?.addEventListener('click', () => {
        if (typeof S.setTrackMute === 'function') S.setTrackMute('fg', !(S.trackMute && S.trackMute.fg));
      });
      $('trackMuteBg')?.addEventListener('click', () => {
        if (typeof S.setTrackMute === 'function') S.setTrackMute('bg', !(S.trackMute && S.trackMute.bg));
      });
      $('trackAddFg')?.addEventListener('click', () => {
        const d = S.duration || 5;
        const t0 = round4(clamp(S.time || 0, 0, Math.max(0, d - 0.2)));
        const t1 = round4(Math.min(d, Math.max(t0 + 0.5, t0 + 2)));
        window.dispatchEvent(new CustomEvent('hm:add-fg-prop-at-playhead', { detail: { t_start: t0, t_end: t1 } }));
      });
      $('trackSplitBg')?.addEventListener('click', S.safe(() => {
        const p = S.project;
        if (!p || !C?.applyBackgroundEdit) return;
        const d = S.duration || 5;
        let t = round4(S.time || 0);
        if (t <= 0.05 || t >= d - 0.05) t = round4(d / 2);
        S.editProject(proj => {
          C.applyBackgroundEdit(proj.show, { op: 'insert-location', t, duration: d });
        });
        S.status('Split background track at ' + t.toFixed(2) + 's.');
      }));

      window.addEventListener('hm:select-fg-prop', e => {
        if (e?.detail?.id) { activeFgId = e.detail.id; syncSelectionClasses(); }
      });
      window.addEventListener('hm:select-bg-target', e => {
        const d = e?.detail || {};
        if (d.locationId) activeBgKey = d.locationId;
        else if (d.key) activeBgKey = d.key;
        syncSelectionClasses();
      });
      window.addEventListener('hm:trackmute', syncMuteUi);
    }

    function syncSelectionClasses() {
      $('timelineFgLane')?.querySelectorAll('.track-bar-fg').forEach(el => {
        el.classList.toggle('active', el.dataset.propId === activeFgId);
      });
      $('timelineBgLane')?.querySelectorAll('.track-bar-bg').forEach(el => {
        el.classList.toggle('active', el.dataset.bgId === activeBgKey);
      });
    }

    function syncMuteUi() {
      const m = S.trackMute || { fg: false, bg: false };
      const fgBtn = $('trackMuteFg'), bgBtn = $('trackMuteBg');
      if (fgBtn) { fgBtn.setAttribute('aria-pressed', String(!!m.fg)); fgBtn.classList.toggle('is-muted', !!m.fg); }
      if (bgBtn) { bgBtn.setAttribute('aria-pressed', String(!!m.bg)); bgBtn.classList.toggle('is-muted', !!m.bg); }
      $('timelineFgLane')?.classList.toggle('is-muted', !!m.fg);
      $('timelineBgLane')?.classList.toggle('is-muted', !!m.bg);
    }

    function startFgDrag(bar, item, mode, ev, snapPoints) {
      if (ev.button !== 0 || S.recording) return;
      ev.preventDefault();
      ev.stopPropagation();
      const lane = $('timelineFgLane');
      const trackW = lane?.getBoundingClientRect().width || 600;
      const d = S.duration || 5;
      const startX = ev.clientX;
      let latest = { t_start: item.t_start, t_end: item.t_end };
      let moved = false;
      const tip = showDragTip(ev.clientX, bar.getBoundingClientRect().top, `${item.t_start.toFixed(2)}–${item.t_end.toFixed(2)}s`);

      const onMove = e => {
        const deltaPx = e.clientX - startX;
        if (Math.abs(deltaPx) >= 3) moved = true;
        const deltaS = (deltaPx / Math.max(1, trackW)) * d;
        if (mode === 'move') {
          const snappedStart = snapTime(item.t_start + deltaS, snapPoints, 0.05, 0.07, e.altKey);
          latest = clampFgWindowMove(item, snappedStart - item.t_start, d);
        } else {
          const rawEdge = (mode === 'left' ? item.t_start : item.t_end) + deltaS;
          const snappedEdge = snapTime(rawEdge, snapPoints, 0.05, 0.07, e.altKey);
          latest = clampFgWindowTrim(item, mode, snappedEdge, d, 0.1);
        }
        bar.style.left = ((latest.t_start / d) * 100) + '%';
        bar.style.width = Math.max(1.5, ((latest.t_end - latest.t_start) / d) * 100) + '%';
        const durEl = bar.querySelector('.track-bar-time');
        if (durEl) durEl.textContent = `${latest.t_start.toFixed(2)}–${latest.t_end.toFixed(2)}s`;
        tip.textContent = `${latest.t_start.toFixed(2)}–${latest.t_end.toFixed(2)}s`;
        tip.style.left = Math.round(e.clientX + 10) + 'px';
      };

      const finish = S.safe(e => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        tip.remove();
        if (!moved) {
          activeFgId = item.id;
          window.dispatchEvent(new CustomEvent('hm:select-fg-prop', { detail: { id: item.id } }));
          syncSelectionClasses();
          return;
        }
        if (e?.type === 'pointercancel' || (Math.abs(latest.t_start - item.t_start) < 1e-4 && Math.abs(latest.t_end - item.t_end) < 1e-4)) {
          render();
          return;
        }
        activeFgId = item.id;
        S.editProject(p => {
          const prop = (p.show.fg?.props || []).find(x => x.id === item.id);
          if (!prop) return;
          prop.t_start = latest.t_start;
          prop.t_end = latest.t_end;
        });
        window.dispatchEvent(new CustomEvent('hm:select-fg-prop', { detail: { id: item.id } }));
      });

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    }

    function startBgLocationDrag(bar, seg, mode, ev, model) {
      if (ev.button !== 0 || S.recording) return;
      ev.preventDefault();
      ev.stopPropagation();
      const lane = $('timelineBgLane');
      const trackW = lane?.getBoundingClientRect().width || 600;
      const d = model.duration || 5;
      const startX = ev.clientX;
      const locs = S.project?.show?.bg?.locations || [];
      let latest = { t0: seg.t0, t1: seg.t1 };
      let moved = false;
      const tip = showDragTip(ev.clientX, bar.getBoundingClientRect().top, `${seg.t0.toFixed(2)}–${seg.t1.toFixed(2)}s`);

      const onMove = e => {
        const deltaPx = e.clientX - startX;
        if (Math.abs(deltaPx) >= 3) moved = true;
        const deltaS = (deltaPx / Math.max(1, trackW)) * d;
        if (mode === 'move') {
          const snapped0 = snapTime(seg.t0 + deltaS, model.snapPoints, 0.05, 0.07, e.altKey);
          latest = clampBgLocationMove(locs, seg.id, snapped0 - seg.t0, d) || latest;
        } else {
          const rawEdge = (mode === 'left' ? seg.t0 : seg.t1) + deltaS;
          const snappedEdge = snapTime(rawEdge, model.snapPoints, 0.05, 0.07, e.altKey);
          latest = clampBgLocationTrim(locs, seg.id, mode, snappedEdge, d, 0.1) || latest;
        }
        bar.style.left = ((latest.t0 / d) * 100) + '%';
        bar.style.width = Math.max(1.5, ((latest.t1 - latest.t0) / d) * 100) + '%';
        const durEl = bar.querySelector('.track-bar-time');
        if (durEl) durEl.textContent = `${latest.t0.toFixed(2)}–${latest.t1.toFixed(2)}s`;
        tip.textContent = `${latest.t0.toFixed(2)}–${latest.t1.toFixed(2)}s`;
        tip.style.left = Math.round(e.clientX + 10) + 'px';
      };

      const finish = S.safe(e => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        tip.remove();
        if (!moved) {
          activeBgKey = seg.id;
          window.dispatchEvent(new CustomEvent('hm:select-bg-target', { detail: { scope: 'project', locationId: seg.id } }));
          syncSelectionClasses();
          return;
        }
        if (e?.type === 'pointercancel' || (Math.abs(latest.t0 - seg.t0) < 1e-4 && Math.abs(latest.t1 - seg.t1) < 1e-4)) {
          render();
          return;
        }
        activeBgKey = seg.id;
        S.editProject(p => {
          C.applyBackgroundEdit(p.show, { op: 'update-location', id: seg.id, patch: { t0: latest.t0, t1: latest.t1 } });
        });
        window.dispatchEvent(new CustomEvent('hm:select-bg-target', { detail: { scope: 'project', locationId: seg.id } }));
      });

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    }

    function startSwapDrag(handle, origSwapT, ev, model) {
      if (ev.button !== 0 || S.recording) return;
      ev.preventDefault();
      ev.stopPropagation();
      const lane = $('timelineBgLane');
      const trackW = lane?.getBoundingClientRect().width || 600;
      const d = model.duration || 5;
      const startX = ev.clientX;
      let latest = origSwapT;
      const tip = showDragTip(ev.clientX, handle.getBoundingClientRect().top, `Switch @ ${origSwapT.toFixed(2)}s`);

      const onMove = e => {
        const deltaS = ((e.clientX - startX) / Math.max(1, trackW)) * d;
        const snapped = snapTime(origSwapT + deltaS, model.snapPoints, 0.05, 0.07, e.altKey);
        latest = clampBgSwapTime(snapped, d, 0.1);
        handle.style.left = ((latest / d) * 100) + '%';
        tip.textContent = `Switch @ ${latest.toFixed(2)}s`;
        tip.style.left = Math.round(e.clientX + 10) + 'px';
      };

      const finish = S.safe(e => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        tip.remove();
        if (e?.type === 'pointercancel' || Math.abs(latest - origSwapT) < 1e-4) {
          render();
          return;
        }
        S.editProject(p => {
          C.applyBackgroundEdit(p.show, { op: 'set-swap-t', swap_t: latest });
        });
      });

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    }

    function render() {
      bindHeaderControls();
      const p = S.project;
      const fgLane = $('timelineFgLane');
      const bgLane = $('timelineBgLane');
      if (!p || !fgLane || !bgLane) return;
      const model = buildTrackModel(p, S.duration);

      if ($('trackCountFg')) $('trackCountFg').textContent = model.counts.fg + (model.counts.fg === 1 ? ' prop' : ' props');
      if ($('trackCountChar')) $('trackCountChar').textContent = model.counts.character + (model.counts.character === 1 ? ' clip' : ' clips');
      if ($('trackCountBg')) $('trackCountBg').textContent = model.counts.bg + (model.counts.bg === 1 ? ' seg' : ' segs');

      fgLane.replaceChildren();
      const rowCount = model.fgRows.length;
      const rowH = 26;
      fgLane.style.height = Math.max(30, rowCount * rowH + 4) + 'px';
      if (!model.fgBars.length) {
        const empty = document.createElement('div');
        empty.className = 'track-empty-hint';
        empty.textContent = 'No foreground props — click ＋ to place one independently from character clips';
        fgLane.append(empty);
      } else {
        for (const barItem of model.fgBars) {
          const bar = document.createElement('div');
          bar.className = 'track-bar track-bar-fg' + (barItem.id === activeFgId ? ' active' : '');
          bar.dataset.propId = barItem.id;
          bar.style.left = barItem.leftPct + '%';
          bar.style.width = barItem.widthPct + '%';
          bar.style.top = (2 + barItem.row * rowH) + 'px';
          bar.style.height = (rowH - 4) + 'px';
          bar.title = `${barItem.label} (${barItem.t_start.toFixed(2)}–${barItem.t_end.toFixed(2)}s)`;

          const leftH = document.createElement('span');
          leftH.className = 'track-trim-handle track-trim-left';
          leftH.title = 'Drag to trim start';
          const rightH = document.createElement('span');
          rightH.className = 'track-trim-handle track-trim-right';
          rightH.title = 'Drag to trim end';

          const labelSpan = document.createElement('span');
          labelSpan.className = 'track-bar-label';
          labelSpan.textContent = barItem.label;
          const timeSpan = document.createElement('span');
          timeSpan.className = 'track-bar-time';
          timeSpan.textContent = `${barItem.t_start.toFixed(2)}–${barItem.t_end.toFixed(2)}s`;

          bar.append(leftH, labelSpan, timeSpan, rightH);
          if (barItem.passBy) {
            const badge = document.createElement('span');
            badge.className = 'track-bar-badge';
            badge.textContent = 'LOOP';
            bar.append(badge);
          }
          for (const kf of barItem.kfMarkers) {
            const dot = document.createElement('span');
            dot.className = 'track-kf-dot';
            dot.style.left = kf.pctInBar + '%';
            dot.title = 'Keyframe @ ' + kf.t.toFixed(2) + 's';
            bar.append(dot);
          }
          if (barItem.breakPct != null) {
            const br = document.createElement('span');
            br.className = 'track-break-tick';
            br.style.left = barItem.breakPct + '%';
            br.title = 'Break @ ' + barItem.breakT.toFixed(2) + 's';
            bar.append(br);
          }

          leftH.addEventListener('pointerdown', ev => startFgDrag(bar, barItem, 'left', ev, model.snapPoints));
          rightH.addEventListener('pointerdown', ev => startFgDrag(bar, barItem, 'right', ev, model.snapPoints));
          bar.addEventListener('pointerdown', ev => startFgDrag(bar, barItem, 'move', ev, model.snapPoints));
          fgLane.append(bar);
        }
      }

      bgLane.replaceChildren();
      for (const seg of model.bgSegments) {
        const bar = document.createElement('div');
        bar.className = 'track-bar track-bar-bg' + (seg.isScroll ? ' is-scroll' : '') + (seg.isWhite ? ' is-white' : '') + (seg.id === activeBgKey ? ' active' : '');
        bar.dataset.bgKind = seg.kind;
        bar.dataset.bgId = seg.id;
        bar.style.left = seg.leftPct + '%';
        bar.style.width = seg.widthPct + '%';
        bar.title = `${seg.label} (${seg.t0.toFixed(2)}–${seg.t1.toFixed(2)}s · ${seg.motionBadge})`;

        const labelSpan = document.createElement('span');
        labelSpan.className = 'track-bar-label';
        labelSpan.textContent = seg.label;
        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'track-bar-badge';
        badgeSpan.textContent = seg.motionBadge;
        const timeSpan = document.createElement('span');
        timeSpan.className = 'track-bar-time';
        timeSpan.textContent = `${seg.t0.toFixed(2)}–${seg.t1.toFixed(2)}s`;

        bar.append(labelSpan, badgeSpan, timeSpan);
        if (seg.kind === 'location') {
          const leftH = document.createElement('span');
          leftH.className = 'track-trim-handle track-trim-left';
          const rightH = document.createElement('span');
          rightH.className = 'track-trim-handle track-trim-right';
          bar.append(leftH, rightH);
          leftH.addEventListener('pointerdown', ev => startBgLocationDrag(bar, seg, 'left', ev, model));
          rightH.addEventListener('pointerdown', ev => startBgLocationDrag(bar, seg, 'right', ev, model));
          bar.addEventListener('pointerdown', ev => startBgLocationDrag(bar, seg, 'move', ev, model));
        } else {
          bar.addEventListener('click', ev => {
            ev.stopPropagation();
            activeBgKey = seg.id;
            window.dispatchEvent(new CustomEvent('hm:select-bg-target', { detail: { scope: 'project', key: seg.key } }));
            syncSelectionClasses();
          });
        }
        bgLane.append(bar);
      }

      if (model.bgSwapBoundaryPct != null) {
        const sw = document.createElement('div');
        sw.className = 'bg-swap-handle';
        sw.style.left = model.bgSwapBoundaryPct + '%';
        sw.title = 'Drag to adjust background swap time';
        const origSwap = +p.show?.bg?.swap_t || 0;
        sw.addEventListener('pointerdown', ev => startSwapDrag(sw, origSwap, ev, model));
        bgLane.append(sw);
      }

      if (model.bgSpanBracket) {
        const sp = document.createElement('div');
        sp.className = 'track-bg-span-bracket';
        sp.style.left = model.bgSpanBracket.leftPct + '%';
        sp.style.width = model.bgSpanBracket.widthPct + '%';
        sp.title = `Background motion span ${model.bgSpanBracket.t0.toFixed(2)}–${model.bgSpanBracket.t1.toFixed(2)}s`;
        bgLane.append(sp);
      }

      for (const ov of model.bgClipOverrides) {
        const tick = document.createElement('span');
        tick.className = 'track-bg-override-tick';
        tick.style.left = ov.leftPct + '%';
        tick.style.width = ov.widthPct + '%';
        tick.title = `Clip override on ${ov.label}`;
        bgLane.append(tick);
      }

      syncMuteUi();
    }

    return { render };
  }

  const api = {
    buildTrackModel,
    formatBgMotionBadge,
    snapTime,
    clampFgWindowMove,
    clampFgWindowTrim,
    clampBgLocationTrim,
    clampBgLocationMove,
    clampBgSwapTime,
    render() {
      const ui = mountBrowserTimeline();
      if (ui) ui.render();
    },
  };

  global.HMMultiTrackTimeline = api;
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);

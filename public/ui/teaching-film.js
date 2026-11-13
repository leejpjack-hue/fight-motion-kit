/* Issue #210 — Teaching-film HUD helpers shared by Playable HTML, /player/, and Node tests. */
function createHMTeachingFilm() {
  const CSS_ID = 'hmTeachingFilmStyles';
  const CSS = `
#teachingFilm{margin:0 16px 16px;padding:12px 14px;border:1px solid #2b3438;border-radius:10px;background:#171c1f;color:#edf1e9;display:grid;gap:10px}
body.capture #teachingFilm{display:none}
.teaching-top{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px 16px}
.teaching-clip{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 10px;min-width:0}
.teaching-clip-name{font-size:15px;font-weight:600;color:#fff}
.teaching-beat-badge{font-size:12px;color:#ccf17b;background:#222c1b;border:1px solid #41552d;border-radius:999px;padding:2px 9px}
.teaching-clock-wrap{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;font:600 12px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;color:#b7c2b9}
.teaching-clock{color:#ccf17b}
.teaching-caption{margin:0;padding:8px 10px;border-radius:7px;border:1px solid #2d383d;background:#111517;font-size:13px;line-height:1.45;color:#eef3ea}
.teaching-caption[data-has-caption="false"]{color:#98a699;font-size:12px}
.teaching-beats{display:flex;flex-wrap:wrap;gap:6px}
#teachingFilm .teaching-beat{appearance:none;border:1px solid #2f393e;border-radius:7px;background:#121619;color:#cdd6cf;padding:6px 9px;font:12px/1.25 system-ui,sans-serif;cursor:pointer;display:inline-flex;align-items:center;gap:6px;text-align:left}
#teachingFilm .teaching-beat:hover{border-color:#68804a;color:#fff}
#teachingFilm .teaching-beat.is-active{background:#232e1b;border-color:#ccf17b;color:#fff}
.teaching-beat-num{font:700 11px/1 ui-monospace,monospace;color:#98a699}
.teaching-beat.is-active .teaching-beat-num{color:#ccf17b}
.teaching-beat-sub{font-size:11px;color:#8fa093}
.teaching-beat-time{font:11px/1 ui-monospace,monospace;color:#7f8e83}
`;

  function fmt(sec) {
    const n = Number(sec);
    return (Number.isFinite(n) ? Math.max(0, n) : 0).toFixed(2);
  }

  function trimStr(v) {
    return typeof v === 'string' ? v.trim() : '';
  }

  function platesForSpan(plates, layout, t0, t1) {
    const seen = [];
    for (let i = 0; i < plates.length; i++) {
      const p = plates[i];
      if (!p) continue;
      if ((Number(p.t1) || 0) > t0 + 1e-6 && (Number(p.t0) || 0) < t1 - 1e-6) {
        const entry = layout && p.id ? layout[p.id] : null;
        const src = trimStr(entry && entry.source_plate);
        if (src && seen.indexOf(src) < 0) seen.push(src);
      }
    }
    return seen;
  }

  function overlayTextsForSpan(overlays, t0, t1, inclusiveEnd) {
    const seen = [];
    for (let i = 0; i < overlays.length; i++) {
      const ov = overlays[i];
      if (!ov) continue;
      const text = trimStr(ov.text);
      if (!text) continue;
      const ot0 = Number(ov.t_start != null ? ov.t_start : ov.t0);
      const ot1 = Number(ov.t_end != null ? ov.t_end : ov.t1);
      if (!Number.isFinite(ot0) || !Number.isFinite(ot1)) continue;
      const hit = inclusiveEnd
        ? ot1 >= t0 - 1e-6 && ot0 <= t1 + 1e-6
        : ot1 > t0 + 1e-6 && ot0 < t1 - 1e-6;
      if (hit && seen.indexOf(text) < 0) seen.push(text);
    }
    return seen;
  }

  function beatList(data) {
    const tl = (data && data.timeline) || data || {};
    const atoms = Array.isArray(tl.atoms) ? tl.atoms : [];
    const plates = Array.isArray(tl.plates) ? tl.plates : [];
    const layout =
      (data && data.layout && typeof data.layout === 'object' ? data.layout : null) ||
      (tl.layout && typeof tl.layout === 'object' ? tl.layout : {});
    const overlays = Array.isArray(tl.overlays) ? tl.overlays : [];
    const count = atoms.length;
    const out = [];
    for (let i = 0; i < count; i++) {
      const a = atoms[i] || {};
      const t0 = Number(a.t0) || 0;
      const t1 = Number(a.t1) || t0;
      const label = trimStr(a.label) || trimStr(a.id) || 'Clip ' + (i + 1);
      const beatId = trimStr(a.beat_id);
      const beat = trimStr(a.beat || (a.motion && a.motion.beat_class));
      const family = trimStr(a.family || (a.motion && a.motion.family));
      const poseMode = trimStr(a.pose_mode);
      const sourcePlates = platesForSpan(plates, layout, t0, t1);
      const spanOverlays = overlayTextsForSpan(overlays, t0, t1, false);
      const ownCaption = trimStr(a.caption);
      const mergedCaptions = [];
      if (ownCaption) mergedCaptions.push(ownCaption);
      for (let j = 0; j < spanOverlays.length; j++) {
        if (mergedCaptions.indexOf(spanOverlays[j]) < 0) mergedCaptions.push(spanOverlays[j]);
      }
      const beatParts = [];
      if (beatId) beatParts.push(beatId);
      if (beat) beatParts.push(beat);
      if (family && family !== beat) beatParts.push(family);
      if (!beatParts.length && poseMode) beatParts.push(poseMode);
      out.push({
        index: i,
        count,
        id: trimStr(a.id) || 'clip-' + (i + 1),
        label,
        beatId,
        beat,
        family,
        poseMode,
        beatLabel: beatParts.join(' · '),
        sourcePlates,
        caption: mergedCaptions.join(' · '),
        t0,
        t1,
        duration_s: Math.max(0, Math.round((t1 - t0) * 1000) / 1000),
      });
    }
    return out;
  }

  function describeTimelineAt(data, rawTime) {
    const tl = (data && data.timeline) || data || {};
    const overlays = Array.isArray(tl.overlays) ? tl.overlays : [];
    const beats = beatList(data);
    const fallbackDur = beats.length ? beats[beats.length - 1].t1 : 0;
    const duration = Math.max(0, Number(tl.duration_s != null ? tl.duration_s : fallbackDur) || 0);
    const time = Math.max(0, Math.min(duration, Number(rawTime) || 0));
    const atEnd = duration > 0 && time >= duration - 1e-6;
    let active = null;
    for (let i = 0; i < beats.length; i++) {
      const b = beats[i];
      if (atEnd && i === beats.length - 1) {
        active = b;
        break;
      }
      if (time >= b.t0 - 1e-6 && time < b.t1 - 1e-6) {
        active = b;
        break;
      }
    }
    if (!active && beats.length) active = beats[atEnd ? beats.length - 1 : 0];

    const liveTexts = [];
    if (active && active.caption) liveTexts.push(active.caption);
    for (let i = 0; i < overlays.length; i++) {
      const ov = overlays[i];
      if (!ov) continue;
      const text = trimStr(ov.text);
      if (!text) continue;
      const ot0 = Number(ov.t_start != null ? ov.t_start : ov.t0);
      const ot1 = Number(ov.t_end != null ? ov.t_end : ov.t1);
      if (!Number.isFinite(ot0) || !Number.isFinite(ot1)) continue;
      const activeAtT =
        time >= ot0 - 1e-6 &&
        (time < ot1 - 1e-6 || (atEnd && ot1 >= duration - 1e-6));
      if (activeAtT && liveTexts.indexOf(text) < 0) liveTexts.push(text);
    }

    const captionText = liveTexts.join(' · ');
    const clockText = fmt(time) + ' / ' + fmt(duration) + 's';
    const plateSuffix = active && active.sourcePlates.length ? ' · ' + active.sourcePlates.join(', ') : '';
    const beatBadgeText = active
      ? (active.beatLabel || 'clip') + plateSuffix
      : '';
    const windowText = active
      ? 'Beat ' + (active.index + 1) + ' / ' + active.count + ' · ' + fmt(active.t0) + '–' + fmt(active.t1) + 's'
      : '0 / 0 beats';
    const fallbackCaption = active
      ? active.label + (beatBadgeText ? ' · ' + beatBadgeText : '') + ' · ' + fmt(active.t0) + '–' + fmt(active.t1) + 's (no caption authored)'
      : 'No clips in timeline';

    return {
      title: trimStr(tl.title),
      time,
      duration,
      clockText,
      windowText,
      clipName: active ? active.label : 'No clips in timeline',
      beatBadgeText,
      captionText,
      displayCaption: captionText || fallbackCaption,
      hasCaption: Boolean(captionText),
      activeIndex: active ? active.index : -1,
      activeBeat: active,
      beats,
    };
  }

  function ensureStyles(doc) {
    if (doc.getElementById(CSS_ID)) return;
    const style = doc.createElement('style');
    style.id = CSS_ID;
    style.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(style);
  }

  function el(doc, tag, attrs, text) {
    const node = doc.createElement(tag);
    if (attrs) {
      const keys = Object.keys(attrs);
      for (let i = 0; i < keys.length; i++) node.setAttribute(keys[i], attrs[keys[i]]);
    }
    if (text != null) node.textContent = text;
    return node;
  }

  function mountTeachingHud(root, data, onSeek) {
    if (!root || typeof root.ownerDocument !== 'object') return () => {};
    const doc = root.ownerDocument;
    ensureStyles(doc);
    let panel = doc.getElementById('teachingFilm');
    if (!panel) {
      panel = el(doc, 'section', {
        id: 'teachingFilm',
        role: 'region',
        'aria-label': 'Teaching film guide',
      });
      const nav = root.querySelector('nav');
      if (nav && nav.nextSibling) root.insertBefore(panel, nav.nextSibling);
      else root.appendChild(panel);
    }
    panel.innerHTML = '';

    const top = el(doc, 'div', { class: 'teaching-top' });
    const clipWrap = el(doc, 'div', { class: 'teaching-clip' });
    const clipNameEl = el(doc, 'strong', {
      id: 'teachingClipName',
      class: 'teaching-clip-name',
      'data-teaching': 'clip-name',
    });
    const beatBadgeEl = el(doc, 'span', {
      id: 'teachingBeatLabel',
      class: 'teaching-beat-badge',
      'data-teaching': 'beat-label',
    });
    clipWrap.appendChild(clipNameEl);
    clipWrap.appendChild(beatBadgeEl);

    const clockWrap = el(doc, 'div', { class: 'teaching-clock-wrap' });
    const windowEl = el(doc, 'span', {
      id: 'teachingBeatWindow',
      'data-teaching': 'window',
    });
    const clockEl = el(doc, 'span', {
      id: 'teachingClock',
      class: 'teaching-clock',
      'data-teaching': 'clock',
    });
    clockWrap.appendChild(windowEl);
    clockWrap.appendChild(clockEl);
    top.appendChild(clipWrap);
    top.appendChild(clockWrap);

    const captionEl = el(doc, 'p', {
      id: 'teachingCaption',
      class: 'teaching-caption',
      'data-teaching': 'caption',
    });
    const beatsEl = el(doc, 'div', {
      id: 'teachingBeats',
      class: 'teaching-beats',
      'data-teaching': 'beats',
    });

    panel.appendChild(top);
    panel.appendChild(captionEl);
    panel.appendChild(beatsEl);

    const initial = describeTimelineAt(data, 0);
    const buttons = [];
    for (let i = 0; i < initial.beats.length; i++) {
      const b = initial.beats[i];
      const btn = el(doc, 'button', {
        type: 'button',
        class: 'teaching-beat',
        'data-beat-index': String(b.index),
        'data-beat-id': b.id,
        'data-t0': String(b.t0),
      });
      btn.appendChild(el(doc, 'span', { class: 'teaching-beat-num' }, String(b.index + 1).padStart(2, '0')));
      btn.appendChild(el(doc, 'span', { class: 'teaching-beat-label' }, b.label));
      if (b.beatLabel) btn.appendChild(el(doc, 'span', { class: 'teaching-beat-sub' }, '· ' + b.beatLabel));
      btn.appendChild(el(doc, 'span', { class: 'teaching-beat-time' }, fmt(b.t0) + 's'));
      btn.onclick = () => {
        if (typeof onSeek === 'function') onSeek(b.t0, b);
      };
      beatsEl.appendChild(btn);
      buttons.push(btn);
    }

    function update(t) {
      const info = describeTimelineAt(data, t);
      clipNameEl.textContent = info.clipName;
      beatBadgeEl.textContent = info.beatBadgeText;
      beatBadgeEl.hidden = !info.beatBadgeText;
      windowEl.textContent = info.windowText;
      clockEl.textContent = info.clockText;
      captionEl.textContent = info.displayCaption;
      captionEl.dataset.hasCaption = String(info.hasCaption);
      for (let i = 0; i < buttons.length; i++) {
        const active = i === info.activeIndex;
        buttons[i].classList.toggle('is-active', active);
        if (active) buttons[i].setAttribute('aria-current', 'step');
        else buttons[i].removeAttribute('aria-current');
      }
      return info;
    }

    update(0);
    return update;
  }

  return { beatList, describeTimelineAt, mountTeachingHud };
}

(function (root) {
  const api = createHMTeachingFilm();
  api.createHMTeachingFilm = createHMTeachingFilm;
  root.HMTeachingFilm = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

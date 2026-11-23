/* HM-CAM-12: Visual Fight-Grammar Cam Action Picker with inline SVG motion-curve & Start->End framing thumbnails. */
(function (root) {
  'use strict';

  const CAM_ACTION_CARDS = [
    {
      id: 'snap_punch_in',
      label: 'Snap Punch-In',
      desc: 'Fast zoom punch + settle',
      preset: 'eye_push',
      ease: 'punch_in',
      intensity: 1.25,
      startBox: [8, 4, 72, 40],
      endBox: [22, 11, 44, 25],
    },
    {
      id: 'whip_crash_pan',
      label: 'Whip Crash Pan',
      desc: 'Rapid horizontal snap whip',
      preset: 'eye_orbit',
      ease: 'whip',
      intensity: 1.3,
      motion_blur: true,
      startBox: [4, 6, 56, 36],
      endBox: [28, 6, 56, 36],
    },
    {
      id: 'dutch_standoff',
      label: 'Dutch Tilt Standoff',
      desc: 'Angled tension drift',
      preset: 'upward_inside',
      ease: 'smooth',
      intensity: 1.0,
      nudge: { r: -5 },
      startBox: [14, 7, 60, 34],
      endBox: [18, 9, 52, 30],
    },
    {
      id: 'slow_tension_push',
      label: 'Slow Tension Push',
      desc: 'Smooth buildup glide',
      preset: 'eye_push',
      ease: 'sine',
      intensity: 0.85,
      startBox: [10, 5, 68, 38],
      endBox: [19, 10, 50, 28],
    },
    {
      id: 'recoil_kickback',
      label: 'Recoil Kickback',
      desc: 'Dip and spring recovery',
      preset: 'low_dive_under',
      ease: 'recoil_settle',
      intensity: 1.2,
      startBox: [18, 10, 52, 30],
      endBox: [10, 4, 68, 38],
    },
    {
      id: 'handheld_scramble',
      label: 'Handheld Scramble',
      desc: 'Spring kinetic battle pulse',
      preset: 'ecu_jitter',
      ease: 'spring',
      intensity: 1.1,
      startBox: [16, 8, 56, 32],
      endBox: [20, 6, 52, 30],
    },
  ];

  function evalEaseFallback(kind, u) {
    if (typeof root.cameraEase === 'function') return root.cameraEase(kind, u);
    const t = Math.max(0, Math.min(1, u));
    return t * t * (3 - 2 * t);
  }

  function buildCamCardSvg(card) {
    const c = card || CAM_ACTION_CARDS[0];
    const [sx, sy, sw, sh] = c.startBox;
    const [ex, ey, ew, eh] = c.endBox;
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const u = i / 16;
      const v = evalEaseFallback(c.ease, u);
      const px = Math.round((8 + u * 72) * 10) / 10;
      const py = Math.round((40 - v * 28) * 10) / 10;
      pts.push(px + ',' + py);
    }
    return (
      `<svg viewBox="0 0 88 48" width="88" height="48" aria-hidden="true">` +
      `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="none" stroke="#6d7c77" stroke-width="1" stroke-dasharray="2 2"/>` +
      `<rect x="${ex}" y="${ey}" width="${ew}" height="${eh}" fill="none" stroke="#ccf17b" stroke-width="1.3"/>` +
      `<polyline fill="none" stroke="#47e6c4" stroke-width="1.8" points="${pts.join(' ')}"/>` +
      `</svg>`
    );
  }

  function applyCamActionCard(atom, cardId, overrides) {
    if (!atom || typeof atom !== 'object') throw new Error('Select a clip before applying a Cam Action card.');
    const card = CAM_ACTION_CARDS.find((c) => c.id === cardId);
    if (!card) throw new Error('Unknown Cam Action card: ' + cardId);
    const ov = overrides && typeof overrides === 'object' ? overrides : {};
    const prev = atom.camera && typeof atom.camera === 'object' ? atom.camera : {};
    const next = Object.assign({}, prev, {
      preset: card.preset,
      ease: ov.ease || card.ease,
      intensity: ov.intensity != null && Number.isFinite(+ov.intensity) ? +ov.intensity : card.intensity,
    });
    delete next.segments;
    delete next.chain;
    if (card.nudge || ov.nudge) next.nudge = Object.assign({}, prev.nudge || {}, card.nudge || {}, ov.nudge || {});
    if (card.motion_blur || ov.motion_blur) next.motion_blur = ov.motion_blur ?? card.motion_blur;
    else delete next.motion_blur;
    atom.camera = next;
    return next;
  }

  function matchesCard(atom, card) {
    const cam = atom?.camera;
    if (!cam) return false;
    return cam.preset === card.preset && (cam.ease || '') === card.ease;
  }

  root.HMCamActionPicker = {
    CAM_ACTION_CARDS,
    buildCamCardSvg,
    applyCamActionCard,
    matchesCard,
  };

  if (typeof document !== 'undefined' && root.HMStudio) {
    const S = root.HMStudio;
    const camSelect = document.getElementById('camera');
    const hostGroup = camSelect?.closest('.settings-group');
    if (hostGroup) {
      const box = document.createElement('section');
      box.id = 'camActionPicker';
      box.className = 'cam-action-picker';
      box.setAttribute('aria-label', 'Visual Cam Action Picker');
      box.innerHTML =
        `<div class="dual-cam-head"><span class="small-muted">CAM ACTION FIGHT GRAMMAR</span></div>` +
        `<div class="cam-action-grid">` +
        CAM_ACTION_CARDS.map((card) =>
          `<button type="button" class="cam-action-card" data-cam-card="${card.id}" title="${card.desc}">` +
          buildCamCardSvg(card) +
          `<strong>${card.label}</strong><small>${card.desc}</small></button>`
        ).join('') +
        `</div>`;
      const camLabel = camSelect.closest('label') || camSelect;
      camLabel.before(box);

      box.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-cam-card]');
        if (!btn) return;
        const cardId = btn.dataset.camCard;
        S.editProject((proj) => {
          const clip = proj.show.atoms[S.selectedIndex];
          if (clip) applyCamActionCard(clip, cardId);
        });
        S.status?.('Applied Cam Action: ' + cardId);
      });

      const refresh = () => {
        const clip = S.show?.atoms?.[S.selectedIndex];
        box.querySelectorAll('[data-cam-card]').forEach((btn) => {
          const card = CAM_ACTION_CARDS.find((c) => c.id === btn.dataset.camCard);
          const on = !!(clip && card && matchesCard(clip, card));
          btn.classList.toggle('active', on);
          btn.setAttribute('aria-pressed', String(on));
        });
      };
      root.addEventListener('hm:projectchange', refresh);
      if (root.ready && typeof root.ready.then === 'function') root.ready.then(refresh);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

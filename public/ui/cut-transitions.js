/* HM-HF-08 & HM-SCN-01 cut transitions.
 * This module owns resolve and paint. The motion renderer only calls it.
 * Offline HTML inlines cutTransitionsBundle() so export does not keep the bodies. */
function cutTransitionsBundle() {
  const EXTENDED_CUT_IDS = ['slash_wipe', 'impact_invert_cut', 'zoom_smash', 'iris_focus'];
  function resolveCutTransition(cuts, time) {
    const t = +time || 0;
    const list = Array.isArray(cuts) ? cuts : [];
    let best = null;
    for (let i = 0; i < list.length; i++) {
      const cut = list[i];
      if (!cut || !Number.isFinite(+cut.t)) continue;
      const preset = cut.preset;
      let t0;
      let t1;
      if (preset === 'freeze_hold') {
        const hold = Math.max(0, +cut.hold_s || +cut.dur_s || 0);
        t0 = +cut.t;
        t1 = +cut.t + hold;
      } else {
        const dur = Math.max(0.02, +cut.dur_s || 0.08);
        t0 = +cut.t - dur / 2;
        t1 = +cut.t + dur / 2;
      }
      if (t < t0 - 1e-6 || t >= t1 - 1e-9) continue;
      const u = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
      const dist = Math.abs(t - +cut.t);
      if (!best || dist < best.dist) best = { cut, u, dist };
    }
    if (!best) return null;
    const u = Math.min(1, Math.max(0, best.u));
    const peak = 1 - Math.abs(u * 2 - 1);
    const dir = best.cut.dir < 0 ? -1 : 1;
    const preset = best.cut.preset;
    return {
      preset,
      t: +best.cut.t,
      u,
      peak,
      freeze: preset === 'freeze_hold',
      white: preset === 'white_flash' ? peak : 0,
      whip: preset === 'whip_cut' ? {
        dir,
        u,
        peak,
        shift: (u - 0.5) * 520 * dir,
        barX: (dir > 0 ? u : 1 - u) * 1280 - 36,
      } : null,
      slash: preset === 'slash_wipe' ? { dir, u, peak } : null,
      invert_cut: preset === 'impact_invert_cut' ? { dir, u, peak } : null,
      zoom_smash: preset === 'zoom_smash' ? { dir, u, peak } : null,
      iris: preset === 'iris_focus' ? { dir, u, peak } : null,
      after_id: best.cut.after_id || null,
      before_id: best.cut.before_id || null,
    };
  }
  function drawWhipCut(ctx, whip) {
    if (!whip) return;
    const peak = +whip.peak || 0;
    if (!(peak > 0)) return;
    const dir = whip.dir < 0 ? -1 : 1;
    const u = Math.min(1, Math.max(0, +whip.u || 0));
    const headX = Number.isFinite(+whip.barX) ? +whip.barX + 36 : (dir > 0 ? u : 1 - u) * 1280;
    const seed = (i, s) => {
      const v = Math.sin(i * 23.17 + s * 9.31) * 43758.5453;
      return v - Math.floor(v);
    };
    ctx.save();
    // Soft ink velocity vignette behind the whip sweep
    ctx.fillStyle = '#091118';
    ctx.globalAlpha = 0.24 * peak;
    ctx.fillRect(0, 0, 1280, 720);
    // Tapered seeded speed streaks moving with dir
    const streakCount = 22;
    for (let i = 0; i < streakCount; i++) {
      const y = seed(i, 1) * 704 + 8;
      const len = 260 + seed(i, 2) * 620;
      const thick = 2 + seed(i, 3) * 11;
      const lag = (seed(i, 4) - 0.3) * 260 * dir;
      const tipX = headX - lag;
      const tailX = tipX - dir * len;
      if (typeof ctx.createLinearGradient === 'function') {
        const g = ctx.createLinearGradient(tailX, y, tipX, y);
        const col = i % 3 === 0 ? 'rgba(255,255,255,' : (i % 3 === 1 ? 'rgba(130,238,255,' : 'rgba(16,24,32,');
        g.addColorStop(0, col + '0)');
        g.addColorStop(0.7, col + (0.68 * peak).toFixed(3) + ')');
        g.addColorStop(1, col + (0.92 * peak).toFixed(3) + ')');
        ctx.fillStyle = g;
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = i % 2 ? '#82eeff' : '#ffffff';
        ctx.globalAlpha = 0.55 * peak;
      }
      ctx.beginPath();
      ctx.moveTo(tailX, y);
      ctx.lineTo(tipX, y - thick * 0.5);
      ctx.lineTo(tipX + dir * 24, y);
      ctx.lineTo(tipX, y + thick * 0.5);
      ctx.closePath();
      ctx.fill();
    }
    // Glowing diagonal whip blade smear along headX (never a flat debug bar)
    const slant = 120 * dir;
    if (typeof ctx.createLinearGradient === 'function') {
      const bladeG = ctx.createLinearGradient(headX - dir * 180, 0, headX + dir * 60, 0);
      bladeG.addColorStop(0, 'rgba(255,255,255,0)');
      bladeG.addColorStop(0.55, 'rgba(198,247,255,' + (0.65 * peak).toFixed(3) + ')');
      bladeG.addColorStop(0.85, 'rgba(255,255,255,' + Math.min(1, peak).toFixed(3) + ')');
      bladeG.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = bladeG;
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.85 * peak;
    }
    ctx.beginPath();
    ctx.moveTo(headX - dir * 160 - slant, 0);
    ctx.lineTo(headX + dir * 48 - slant, 0);
    ctx.lineTo(headX + dir * 48 + slant, 720);
    ctx.lineTo(headX - dir * 160 + slant, 720);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function paintCutOverlay(ctx, heldCut) {
    if (!heldCut) return;
    if (heldCut.white > 0) {
      const w = Math.min(1, Math.max(0, +heldCut.white));
      ctx.save();
      if (typeof ctx.createRadialGradient === 'function') {
        const rg = ctx.createRadialGradient(640, 360, 40, 640, 360, 820);
        rg.addColorStop(0, 'rgba(255,255,255,' + Math.min(1, w * 0.98).toFixed(3) + ')');
        rg.addColorStop(0.65, 'rgba(255,250,238,' + (w * 0.82).toFixed(3) + ')');
        rg.addColorStop(1, 'rgba(235,244,255,' + (w * 0.65).toFixed(3) + ')');
        ctx.fillStyle = rg;
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = w;
        ctx.fillStyle = '#ffffff';
      }
      ctx.fillRect(0, 0, 1280, 720);
      ctx.restore();
      return;
    }
    if (heldCut.freeze) {
      const peak = Math.max(0.25, +heldCut.peak || 0.5);
      ctx.save();
      if (typeof ctx.createRadialGradient === 'function') {
        const vig = ctx.createRadialGradient(640, 360, 260, 640, 360, 760);
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(1, 'rgba(10,14,20,' + (0.42 * peak).toFixed(3) + ')');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, 1280, 720);
      }
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.35 * peak;
      ctx.lineWidth = 4;
      ctx.strokeRect(14, 14, 1252, 692);
      ctx.restore();
      return;
    }
    if (heldCut.slash && heldCut.slash.peak > 0) {
      const { dir, u, peak } = heldCut.slash;
      const sweep = (dir > 0 ? u : 1 - u);
      const cutX = sweep * 1560 - 140;
      const slant = 210 * dir;
      ctx.save();
      // Trailing slash curtain fading smoothly across blade
      const bandW = 240 + 180 * peak;
      ctx.fillStyle = '#0e1621';
      ctx.globalAlpha = 0.72 * peak;
      ctx.beginPath();
      ctx.moveTo(cutX - dir * bandW + slant, 0);
      ctx.lineTo(cutX + slant, 0);
      ctx.lineTo(cutX - slant, 720);
      ctx.lineTo(cutX - dir * bandW - slant, 720);
      ctx.closePath();
      ctx.fill();
      // Razor edge core
      ctx.strokeStyle = '#8ef5ff';
      ctx.globalAlpha = 0.85 * Math.min(1, peak * 1.1);
      ctx.lineWidth = 18 * (0.4 + 0.6 * peak);
      ctx.beginPath();
      ctx.moveTo(cutX + slant, 0);
      ctx.lineTo(cutX - slant, 720);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = Math.min(1, peak * 1.2);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cutX + slant, 0);
      ctx.lineTo(cutX - slant, 720);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (heldCut.invert_cut && heldCut.invert_cut.peak > 0) {
      const { u, peak } = heldCut.invert_cut;
      const canvasW = (ctx.canvas && ctx.canvas.width) || 1280;
      const canvasH = (ctx.canvas && ctx.canvas.height) || 720;
      const pixelFn = typeof applyHitstopPixels === 'function' ? applyHitstopPixels : globalThis.HMMotionFx?.applyHitstopPixels;
      if (typeof ctx.getImageData === 'function' && typeof ctx.putImageData === 'function' && typeof pixelFn === 'function') {
        const frame = ctx.getImageData(0, 0, canvasW, canvasH);
        pixelFn(frame.data, u < 0.55 ? 0.2 : 0.7, {
          invert: u < 0.65 ? 'always' : false,
          contrast: 1.5,
          strength: Math.min(1, 0.55 + peak * 0.45),
        });
        ctx.putImageData(frame, 0, 0);
      } else {
        ctx.save();
        ctx.fillStyle = u < 0.5 ? '#0b0e14' : '#ffffff';
        ctx.globalAlpha = 0.72 * peak;
        ctx.fillRect(0, 0, 1280, 720);
        ctx.restore();
      }
      ctx.save();
      ctx.fillStyle = '#080b10';
      ctx.globalAlpha = 0.45 * peak;
      ctx.fillRect(0, 0, 1280, 26 * peak);
      ctx.fillRect(0, 720 - 26 * peak, 1280, 26 * peak);
      ctx.restore();
      return;
    }
    if (heldCut.zoom_smash && heldCut.zoom_smash.peak > 0) {
      const { u, peak } = heldCut.zoom_smash;
      ctx.save();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2 + u * 0.25;
        const rIn = 120 + (1 - peak) * 180;
        const rOut = 820;
        const w = 0.032 * (0.6 + (i % 3) * 0.28);
        ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#9feaff';
        ctx.globalAlpha = 0.48 * peak;
        ctx.beginPath();
        ctx.moveTo(640 + Math.cos(a) * rIn, 360 + Math.sin(a) * rIn);
        ctx.lineTo(640 + Math.cos(a - w) * rOut, 360 + Math.sin(a - w) * rOut);
        ctx.lineTo(640 + Math.cos(a + w) * rOut, 360 + Math.sin(a + w) * rOut);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.72 * peak;
      ctx.lineWidth = 6 * peak + 1;
      ctx.beginPath();
      ctx.arc(640, 360, 80 + (1 - u) * 260, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (heldCut.iris && heldCut.iris.peak > 0) {
      const { peak } = heldCut.iris;
      const radius = Math.max(70, 760 * (1 - 0.78 * peak));
      ctx.save();
      ctx.fillStyle = '#070a0f';
      ctx.globalAlpha = 0.88 * Math.min(1, peak * 1.15);
      // Four outer aperture bands outside center radius box + ring mask fallback
      ctx.beginPath();
      ctx.rect(0, 0, 1280, 720);
      ctx.arc(640, 360, radius, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
      ctx.strokeStyle = '#ccf17b';
      ctx.globalAlpha = 0.75 * peak;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(640, 360, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
  var root = typeof globalThis !== 'undefined' ? globalThis : this;
  root.resolveCutTransition = resolveCutTransition;
  root.drawWhipCut = drawWhipCut;
  root.paintCutOverlay = paintCutOverlay;
  root.cutTransitionsBundle = cutTransitionsBundle;
  root.HMCutTransitions = {
    EXTENDED_CUT_IDS: EXTENDED_CUT_IDS,
    resolveCutTransition: resolveCutTransition,
    drawWhipCut: drawWhipCut,
    paintCutOverlay: paintCutOverlay,
    bundle: cutTransitionsBundle,
  };
  return root.HMCutTransitions;
}
cutTransitionsBundle();

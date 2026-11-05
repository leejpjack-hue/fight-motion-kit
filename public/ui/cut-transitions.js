/* HM-HF-08 cut transitions.
 * This module owns resolve and paint. The motion renderer only calls it.
 * Offline HTML inlines cutTransitionsBundle() so export does not keep the bodies. */
function cutTransitionsBundle() {
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
      after_id: best.cut.after_id || null,
      before_id: best.cut.before_id || null,
    };
  }
  function drawWhipCut(ctx, whip) {
    const peak = whip.peak;
    if (!(peak > 0)) return;
    const dir = whip.dir < 0 ? -1 : 1;
    ctx.save();
    for (let i = 0; i < 16; i++) {
      const y = (i / 16) * 720;
      const travel = dir > 0 ? whip.u : (1 - whip.u);
      const x = travel * 1500 - 360 - (i % 4) * 28 * dir;
      ctx.globalAlpha = 0.22 * peak;
      ctx.fillStyle = i % 2 ? '#f4f7f8' : '#101820';
      ctx.fillRect(x, y, 280, 720 / 16 + 1);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(whip.barX, 0, 72, 720);
    ctx.restore();
  }
  function paintCutOverlay(ctx, heldCut) {
    if (!heldCut || !(heldCut.white > 0)) return;
    ctx.save();
    ctx.globalAlpha = heldCut.white;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.restore();
  }
  var root = typeof globalThis !== 'undefined' ? globalThis : this;
  root.resolveCutTransition = resolveCutTransition;
  root.drawWhipCut = drawWhipCut;
  root.paintCutOverlay = paintCutOverlay;
  root.cutTransitionsBundle = cutTransitionsBundle;
  root.HMCutTransitions = {
    resolveCutTransition: resolveCutTransition,
    drawWhipCut: drawWhipCut,
    paintCutOverlay: paintCutOverlay,
    bundle: cutTransitionsBundle,
  };
  return root.HMCutTransitions;
}
cutTransitionsBundle();

/* HM-SG-02A / HM-SG-02B: Shared deterministic one-state strip sampler.
 * Reused identically by the composer preview, frame peek, PNG frame export,
 * MediaRecorder video capture, and standalone offline HTML player.
 * FE-only; no second clock or white-matte knock-out. */
function stripSamplerBundle() {
  var EPS = 1e-11;
  var STAGE_W = 1280;
  var DEFAULT_FLOOR_Y = 684;
  var TARGET_BODY_H = 450;

  function round6(n) {
    return Math.round((+n || 0) * 1000000) / 1000000;
  }

  function posNum(v) {
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
  }

  function sampleStripAt(descriptor, localTime) {
    if (!descriptor || typeof descriptor !== 'object') return null;
    var g = descriptor.geometry || descriptor;
    var cad = descriptor.cadence || {};
    var pol = descriptor.policy || {};
    var frames = Number.isInteger(g.frames) && g.frames > 0 ? g.frames : null;
    var w = Number.isFinite(+g.w) && +g.w > 0 ? +g.w : null;
    var h = Number.isFinite(+g.h) && +g.h > 0 ? +g.h : null;
    var bodyH = Number.isFinite(+g.body_h) && +g.body_h > 0 ? +g.body_h : h;
    var baseSpc = posNum(+cad.secondsPerCell) || (posNum(+descriptor.fps) ? 1 / +descriptor.fps : null);
    if (!frames || !w || !h || !baseSpc) return null;

    var seq = Array.isArray(descriptor.sequence) && descriptor.sequence.length
      ? descriptor.sequence.map(function (c) {
          return Number.isInteger(c) ? Math.min(frames - 1, Math.max(0, c)) : 0;
        })
      : Array.from({ length: frames }, function (_, i) { return i; });
    var n = seq.length;
    var rawDurs = Array.isArray(descriptor.cellDurations) ? descriptor.cellDurations : null;
    var starts = new Array(n);
    var ends = new Array(n);
    var acc = 0;
    for (var i = 0; i < n; i++) {
      var d = rawDurs && posNum(+rawDurs[i]) ? +rawDurs[i] : baseSpc;
      starts[i] = acc;
      acc += d;
      ends[i] = acc;
    }
    var total = acc;
    if (!(total > 0)) return null;

    var policyKind = pol.kind === 'once-return' || pol.returns
      ? 'once-return'
      : (pol.kind === 'repeat' || pol.loop === true ? 'repeat' : 'once');
    var endFrame = Number.isInteger(pol.endFrame) && pol.endFrame >= 0 && pol.endFrame < frames
      ? pol.endFrame
      : frames - 1;

    var rawT = Number(localTime);
    var t = Number.isFinite(rawT) ? rawT : 0;
    var tau = 0;
    var instanceIndex = 0;
    var cellIndex = seq[0];
    var clamped = false;
    var atEndpoint = false;

    if (t < -EPS) {
      clamped = true;
      tau = 0;
      instanceIndex = 0;
      cellIndex = seq[0];
    } else if (policyKind === 'repeat') {
      var cycles = Math.floor((t + EPS) / total);
      tau = Math.max(0, t - cycles * total);
      if (tau + EPS >= total) tau = 0;
      instanceIndex = n - 1;
      for (var k = 0; k < n; k++) {
        if (tau + EPS < ends[k]) {
          instanceIndex = k;
          break;
        }
      }
      cellIndex = seq[instanceIndex];
    } else if (t >= total - EPS) {
      tau = total;
      instanceIndex = n - 1;
      cellIndex = policyKind === 'once-return' ? endFrame : seq[n - 1];
      atEndpoint = true;
      clamped = policyKind === 'once-return' ? t > total + EPS : true;
    } else {
      tau = Math.max(0, t);
      instanceIndex = n - 1;
      for (var j = 0; j < n; j++) {
        if (tau + EPS < ends[j]) {
          instanceIndex = j;
          break;
        }
      }
      cellIndex = seq[instanceIndex];
    }

    return {
      instanceIndex: instanceIndex,
      cellIndex: cellIndex,
      frames: frames,
      sx: cellIndex * w,
      sy: 0,
      sw: w,
      sh: h,
      w: w,
      h: h,
      body_h: bodyH,
      local_t: round6(t),
      cycle_t: round6(tau),
      duration_s: round6(total),
      interval: [round6(starts[instanceIndex]), round6(ends[instanceIndex])],
      clamped: clamped,
      atEndpoint: atEndpoint,
      policyKind: policyKind,
      clock: 'renderAt',
    };
  }

  function stripStagePlacement(strip, stageFloorY) {
    var g = (strip && strip.geometry) || strip || {};
    var meta = (strip && strip.metadata) || {};
    var w = Math.max(1, +g.w || 1);
    var h = Math.max(1, +g.h || 1);
    var bodyH = Math.max(1, +g.body_h || h);
    var floorY = Number.isFinite(+(strip && strip.floor_y))
      ? +(strip.floor_y)
      : (Number.isFinite(+stageFloorY) ? +stageFloorY : DEFAULT_FLOOR_Y);
    var scale = TARGET_BODY_H / bodyH;
    var destW = w * scale;
    var destH = h * scale;
    var footX = meta.foot_anchor === 'feet' && Number.isFinite(+meta.foot_x) ? +meta.foot_x : w / 2;
    var destX = STAGE_W / 2 - footX * scale;
    var destY = floorY - destH;
    return {
      scale: round6(scale),
      destX: round6(destX),
      destY: round6(destY),
      destW: round6(destW),
      destH: round6(destH),
      floorY: round6(floorY),
      bodyHeightStage: round6(bodyH * scale),
    };
  }

  function drawStripFrame(ctx, im, entryStrip, sampleT, stageFloorY) {
    if (!ctx || !entryStrip) return null;
    var clipOffset = Math.max(0, Number(entryStrip.clip_offset_s) || 0);
    var atomT0 = Number.isFinite(+entryStrip.atom_t0) ? +entryStrip.atom_t0 : 0;
    var localElapsed = Math.max(0, (+sampleT || 0) - atomT0);
    var sample = sampleStripAt(entryStrip, clipOffset + localElapsed);
    if (!sample) return null;
    var rect = stripStagePlacement(entryStrip, stageFloorY);
    var ready = Boolean(im && ((typeof im.naturalWidth === 'number' && im.naturalWidth > 0) || im.width > 0));
    if (ready && typeof ctx.drawImage === 'function') {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        im,
        sample.sx, sample.sy, sample.sw, sample.sh,
        rect.destX, rect.destY, rect.destW, rect.destH
      );
      ctx.restore();
    }
    return { sample: sample, rect: rect };
  }

  var root = typeof globalThis !== 'undefined' ? globalThis : this;
  var api = {
    EPS: EPS,
    TARGET_BODY_H: TARGET_BODY_H,
    sampleStripAt: sampleStripAt,
    stripStagePlacement: stripStagePlacement,
    drawStripFrame: drawStripFrame,
    stripSamplerBundle: stripSamplerBundle,
  };
  root.sampleStripAt = sampleStripAt;
  root.stripStagePlacement = stripStagePlacement;
  root.drawStripFrame = drawStripFrame;
  root.stripSamplerBundle = stripSamplerBundle;
  root.HMStripSampler = api;
  return api;
}
var hmStripApi = stripSamplerBundle();
if (typeof module === 'object' && module && module.exports) module.exports = hmStripApi;

(function (root) {
  'use strict';

  function round4(v) {
    return Math.round((Number(v) || 0) * 10000) / 10000;
  }

  function extractShow(showOrProject) {
    if (!showOrProject || typeof showOrProject !== 'object') return null;
    if (showOrProject.show && Array.isArray(showOrProject.show.atoms)) return showOrProject.show;
    if (Array.isArray(showOrProject.atoms)) return showOrProject;
    return null;
  }

  function frameStatsFromRgba(rgba, width, height) {
    var totalPixels = Math.max(1, (width | 0) * (height | 0));
    var stride = totalPixels > 64000 ? 4 : 1;
    var count = 0;
    var lumaSum = 0;
    var satSum = 0;
    var clipWhite = 0;
    var crushBlack = 0;
    for (var i = 0; i < totalPixels; i += stride) {
      var off = i * 4;
      var r = rgba[off] || 0;
      var g = rgba[off + 1] || 0;
      var b = rgba[off + 2] || 0;
      var y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      var mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
      var mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
      lumaSum += y;
      satSum += (mx - mn) / 255;
      if (r >= 245 && g >= 245 && b >= 245) clipWhite++;
      if (r <= 12 && g <= 12 && b <= 12) crushBlack++;
      count++;
    }
    count = Math.max(1, count);
    return {
      lumaMean: round4(lumaSum / count),
      satMean: round4(satSum / count),
      clipWhiteFrac: round4(clipWhite / count),
      crushBlackFrac: round4(crushBlack / count)
    };
  }

  function frameDiffStats(prevFrame, currFrame) {
    var lumaDelta = round4(Math.abs((currFrame.lumaMean || 0) - (prevFrame.lumaMean || 0)));
    var satDelta = round4(Math.abs((currFrame.satMean || 0) - (prevFrame.satMean || 0)));
    var whiteJump = round4(Math.max(0, (currFrame.clipWhiteFrac || 0) - (prevFrame.clipWhiteFrac || 0)));
    var blackJump = round4(Math.max(0, (currFrame.crushBlackFrac || 0) - (prevFrame.crushBlackFrac || 0)));
    var pixelRmsDelta = lumaDelta;
    if (prevFrame.rgba && currFrame.rgba && prevFrame.rgba.length === currFrame.rgba.length && prevFrame.rgba.length > 0) {
      var len = prevFrame.rgba.length;
      var step = len > 256000 ? 16 : 4;
      var sq = 0;
      var samples = 0;
      for (var i = 0; i < len; i += step) {
        var dr = ((currFrame.rgba[i] || 0) - (prevFrame.rgba[i] || 0)) / 255;
        var dg = ((currFrame.rgba[i + 1] || 0) - (prevFrame.rgba[i + 1] || 0)) / 255;
        var db = ((currFrame.rgba[i + 2] || 0) - (prevFrame.rgba[i + 2] || 0)) / 255;
        sq += (dr * dr + dg * dg + db * db) / 3;
        samples++;
      }
      pixelRmsDelta = round4(Math.sqrt(sq / Math.max(1, samples)));
    } else if (Number.isFinite(currFrame.pixelRmsDelta)) {
      pixelRmsDelta = round4(currFrame.pixelRmsDelta);
    }
    return {
      lumaDelta: lumaDelta,
      satDelta: satDelta,
      whiteJump: whiteJump,
      blackJump: blackJump,
      pixelRmsDelta: pixelRmsDelta
    };
  }

  function authoredFlashWindows(showOrProject) {
    var show = extractShow(showOrProject);
    var cutTimes = [];
    var flashWindows = [];
    if (!show || !Array.isArray(show.atoms)) return { cutTimes: cutTimes, flashWindows: flashWindows };
    var acc = 0;
    for (var i = 0; i < show.atoms.length; i++) {
      var a = show.atoms[i] || {};
      var dur = Number.isFinite(+a.duration_s) && +a.duration_s > 0 ? +a.duration_s : 0.5;
      var t0 = round4(acc);
      var t1 = round4(t0 + dur);
      if (i > 0) {
        cutTimes.push(t0);
        if (a.cut && a.cut.preset && a.cut.preset !== 'hard_cut') {
          var cd = Number.isFinite(+a.cut.dur_s) && +a.cut.dur_s > 0 ? +a.cut.dur_s : 0.12;
          flashWindows.push({ t0: round4(Math.max(0, t0 - 0.04)), t1: round4(t0 + cd + 0.04), source: 'cut:' + a.cut.preset });
        }
      }
      var hooks = Array.isArray(a.fx_hooks) ? a.fx_hooks : [];
      for (var h = 0; h < hooks.length; h++) {
        var hk = hooks[h] || {};
        if (hk.type === 'exposure_warm_crush' || hk.type === 'flash_orange') {
          var ht = t0 + (Number.isFinite(+hk.t_rel) ? +hk.t_rel : 0);
          var hd = Number.isFinite(+(hk.params && hk.params.dur)) ? +hk.params.dur : 0.16;
          flashWindows.push({
            t0: round4(Math.max(0, ht - 0.04)),
            t1: round4(ht + hd + 0.04),
            source: 'fx:' + hk.type
          });
        }
      }
      acc = t1;
    }
    return { cutTimes: cutTimes, flashWindows: flashWindows };
  }

  function crossesCut(prevT, currT, cutTimes, tolS) {
    for (var i = 0; i < cutTimes.length; i++) {
      var c = cutTimes[i];
      if (prevT < c - 1e-6 && currT >= c - tolS) return c;
      if (Math.abs(currT - c) <= tolS) return c;
    }
    return null;
  }

  function matchingFlashWindow(t, flashWindows) {
    for (var i = 0; i < flashWindows.length; i++) {
      var w = flashWindows[i];
      if (t >= w.t0 && t <= w.t1) return w;
    }
    return null;
  }

  function scanFrameSeries(rawFrames, opts) {
    opts = opts || {};
    var lumaPopThresh = Number.isFinite(+opts.lumaPopThresh) ? +opts.lumaPopThresh : 0.18;
    var midSpikeThresh = Number.isFinite(+opts.midSpikeThresh) ? +opts.midSpikeThresh : 0.25;
    var rmsSpikeThresh = Number.isFinite(+opts.rmsSpikeThresh) ? +opts.rmsSpikeThresh : 0.34;
    var whiteJumpThresh = Number.isFinite(+opts.whiteJumpThresh) ? +opts.whiteJumpThresh : 0.35;
    var blackJumpThresh = Number.isFinite(+opts.blackJumpThresh) ? +opts.blackJumpThresh : 0.45;
    var cutTolS = Number.isFinite(+opts.cutTolS) ? +opts.cutTolS : 0.05;

    var windows = opts.show ? authoredFlashWindows(opts.show) : {
      cutTimes: Array.isArray(opts.cutTimes) ? opts.cutTimes : [],
      flashWindows: Array.isArray(opts.flashWindows) ? opts.flashWindows : []
    };

    var frames = (Array.isArray(rawFrames) ? rawFrames : []).map(function (f, idx) {
      var stats = f.rgba ? frameStatsFromRgba(f.rgba, f.width || 1, f.height || 1) : {
        lumaMean: round4(f.lumaMean || 0),
        satMean: round4(f.satMean || 0),
        clipWhiteFrac: round4(f.clipWhiteFrac || 0),
        crushBlackFrac: round4(f.crushBlackFrac || 0)
      };
      return {
        index: idx,
        t: round4(Number.isFinite(+f.t) ? +f.t : idx * (1 / 30)),
        lumaMean: stats.lumaMean,
        satMean: stats.satMean,
        clipWhiteFrac: stats.clipWhiteFrac,
        crushBlackFrac: stats.crushBlackFrac,
        pixelRmsDelta: f.pixelRmsDelta,
        rgba: f.rgba || null
      };
    });

    var findings = [];
    var authoredIgnored = [];
    var recoveryFrameIdx = -1;
    var recoveryBaselineLuma = null;
    for (var i = 1; i < frames.length; i++) {
      var prev = frames[i - 1];
      var curr = frames[i];
      var next = i + 1 < frames.length ? frames[i + 1] : null;
      var diff = frameDiffStats(prev, curr);
      var cutAt = crossesCut(prev.t, curr.t, windows.cutTimes, cutTolS);
      var flashWin = matchingFlashWindow(curr.t, windows.flashWindows);

      if (flashWin) {
        if (diff.lumaDelta >= lumaPopThresh || diff.whiteJump >= whiteJumpThresh) {
          authoredIgnored.push({ frame_index: curr.index, t_s: curr.t, reason: flashWin.source });
        }
        recoveryFrameIdx = -1;
        continue;
      }

      var isRecovery = (recoveryFrameIdx === i - 1 && recoveryBaselineLuma !== null &&
        Math.abs(curr.lumaMean - recoveryBaselineLuma) <= 0.12 &&
        diff.whiteJump < whiteJumpThresh && diff.blackJump < blackJumpThresh &&
        curr.clipWhiteFrac < 0.55 && curr.crushBlackFrac < 0.6);
      if (isRecovery) {
        recoveryFrameIdx = -1;
        recoveryBaselineLuma = null;
        continue;
      }

      var singlePop = false;
      if (next && !crossesCut(curr.t, next.t, windows.cutTimes, cutTolS) && cutAt === null) {
        var dPrev = curr.lumaMean - prev.lumaMean;
        var dNext = next.lumaMean - curr.lumaMean;
        if (Math.abs(dPrev) >= lumaPopThresh && Math.abs(dNext) >= lumaPopThresh * 0.75 && (dPrev * dNext < 0)) {
          singlePop = true;
        }
      }

      var issueKind = null;
      var severity = 'warn';
      if (diff.whiteJump >= whiteJumpThresh || (curr.clipWhiteFrac >= 0.85 && prev.clipWhiteFrac < 0.55)) {
        issueKind = 'unauthored_white_flash';
        severity = 'error';
      } else if (diff.blackJump >= blackJumpThresh || (curr.crushBlackFrac >= 0.92 && prev.crushBlackFrac < 0.6)) {
        issueKind = 'unauthored_black_drop';
        severity = 'error';
      } else if (singlePop) {
        issueKind = 'single_frame_pop';
        severity = 'error';
      } else if (cutAt === null && (diff.lumaDelta >= midSpikeThresh || diff.pixelRmsDelta >= rmsSpikeThresh)) {
        issueKind = 'mid_beat_spike';
        severity = 'error';
      } else if (cutAt !== null) {
        authoredIgnored.push({ frame_index: curr.index, t_s: curr.t, reason: 'cut@' + cutAt.toFixed(2) + 's' });
      }
      if (issueKind) {
        recoveryFrameIdx = i;
        recoveryBaselineLuma = prev.lumaMean;
      } else {
        recoveryFrameIdx = -1;
        recoveryBaselineLuma = null;
      }

      if (issueKind) {
        findings.push({
          frame_index: curr.index,
          t_s: curr.t,
          kind: issueKind,
          severity: severity,
          luma_delta: diff.lumaDelta,
          pixel_rms_delta: diff.pixelRmsDelta,
          white_jump: diff.whiteJump,
          black_jump: diff.blackJump,
          authored: false
        });
      }
    }

    return {
      ok: true,
      clean: findings.length === 0,
      scope: 'visual-frame-delta-only',
      audioLufsChecked: false,
      framesScanned: frames.length,
      popCount: findings.length,
      findings: findings,
      authoredIgnored: authoredIgnored
    };
  }

  function scanBrowserShow(studio, opts) {
    opts = opts || {};
    var S = studio || root.HMStudio;
    if (!S || !S.project || !S.project.show) {
      return Promise.reject(new Error('Open a project before running frame spike QA.'));
    }
    var ensureCompiled = S.composed ? Promise.resolve(S.composed) : S.compile();
    return ensureCompiled.then(function (composed) {
      var activeComposed = S.composed || composed;
      if (!activeComposed) throw new Error('Add at least one clip before scanning frames.');
      var show = S.project.show;
      var canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      var renderer = root.HMMotion(canvas, S.project.assets || {});
      return renderer.load(activeComposed).then(function () {
        var sampleTimes = [];
        var acc = 0;
        var stepsPerAtom = Number.isInteger(opts.stepsPerAtom) && opts.stepsPerAtom >= 3 ? opts.stepsPerAtom : 5;
        for (var i = 0; i < show.atoms.length; i++) {
          var dur = Number.isFinite(+show.atoms[i].duration_s) ? +show.atoms[i].duration_s : 0.5;
          var t0 = acc;
          var t1 = t0 + dur;
          for (var s = 0; s < stepsPerAtom; s++) {
            var frac = stepsPerAtom === 1 ? 0.5 : s / (stepsPerAtom - 1);
            var ts = t0 + Math.max(0.015, Math.min(dur - 0.015, dur * frac));
            sampleTimes.push(round4(ts));
          }
          acc = t1;
        }
        var frames = sampleTimes.map(function (t) {
          S.sampleStageFrameAt(t, { renderer: renderer, standIn: false, onion: false, source: 'frame-spike-scan' });
          var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          return { t: t, width: canvas.width, height: canvas.height, rgba: new Uint8Array(imgData.data) };
        });
        var report = scanFrameSeries(frames, { show: show });
        report.show_id = show.show_id;
        report.duration_s = round4(acc);
        root.HMFrameSpikeScan.lastReport = report;
        var outEl = document.getElementById('spikeScanStatus');
        if (outEl) {
          outEl.textContent = report.clean
            ? ('Clean · ' + report.framesScanned + ' frames scanned · 0 unauthored pops')
            : ('POP DETECTED (' + report.popCount + ') · first at ' + report.findings[0].t_s.toFixed(2) + 's (' + report.findings[0].kind + ')');
        }
        if (typeof S.status === 'function') {
          S.status(outEl ? outEl.textContent : 'Frame spike QA complete.');
        }
        return report;
      });
    });
  }

  function mount() {
    if (typeof document === 'undefined') return;
    var btn = document.getElementById('runSpikeScan');
    if (!btn || btn.dataset.hmBound === '1') return;
    btn.dataset.hmBound = '1';
    btn.addEventListener('click', function () {
      var S = root.HMStudio;
      btn.disabled = true;
      scanBrowserShow(S).catch(function (err) {
        var outEl = document.getElementById('spikeScanStatus');
        if (outEl) outEl.textContent = err.message;
        if (S && typeof S.status === 'function') S.status(err.message, true);
      }).finally(function () {
        btn.disabled = false;
      });
    });
  }

  var api = {
    frameStatsFromRgba: frameStatsFromRgba,
    frameDiffStats: frameDiffStats,
    authoredFlashWindows: authoredFlashWindows,
    scanFrameSeries: scanFrameSeries,
    scanBrowserShow: scanBrowserShow,
    mount: mount,
    lastReport: null
  };

  root.HMFrameSpikeScan = api;

  if (typeof document !== 'undefined') {
    var ready = root.ready;
    if (ready && typeof ready.then === 'function') ready.then(mount, mount);
    else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
    else mount();
  }

  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

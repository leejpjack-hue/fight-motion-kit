/* HM-HF-11 Peek Diff Overlay (#219), HM-HF-10 Action-Safe Guides (#220),
 * and HM-PF-28 root_motion / engine-export import rejection hooks (#224).
 * Strictly FE-only; zero backend calls; preserves renderAt SoT and uncropped export. */
(function (root) {
  'use strict';

  var compose = root.HMComposeClient;
  if (!compose && typeof module === 'object' && module.exports && typeof require === 'function') {
    require('./compose-client.js');
    compose = root.HMComposeClient;
  }

  var PEEK_DIFF_CONTRACT = Object.freeze({
    id: 'HM-HF-11-PEEK-DIFF-OVERLAY',
    modes: Object.freeze(['tint', 'onion']),
    defaultMode: 'tint',
    sot: Object.freeze(['renderAt', 'renderStageAt', 'renderStageBAt', 'sampleStageFrameAt']),
    width: 1280,
    height: 720,
    threshold: 12
  });

  var SAFE_GUIDES_CONTRACT = Object.freeze({
    id: 'HM-HF-10-ACTION-SAFE-GUIDES',
    width: 1280,
    height: 720,
    actionSafe: Object.freeze({ ratio: 0.9, insetPct: 5, x: 64, y: 36, w: 1152, h: 648, right: 1216, bottom: 684 }),
    titleSafe: Object.freeze({ ratio: 0.8, insetPct: 10, x: 128, y: 72, w: 1024, h: 576, right: 1152, bottom: 648 }),
    lintCode: 'outside_title_safe',
    blocksBake: false
  });

  function round4(v) {
    return Math.round((Number(v) || 0) * 10000) / 10000;
  }

  function sanitizePart(raw, fallback) {
    var clean = String(raw || '').trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    return clean || fallback || 'item';
  }

  function peekDiffFilename(showIdA, showIdB, time, mode) {
    var sidA = sanitizePart(showIdA, 'draft-a');
    var sidB = sanitizePart(showIdB, 'ref-b');
    var cleanMode = mode === 'onion' ? 'onion' : 'tint';
    var tNum = Number.isFinite(+time) ? Math.max(0, +time) : 0;
    return sidA + '-vs-' + sidB + '-peek-diff-' + cleanMode + '-' + tNum.toFixed(2) + 's.png';
  }

  function computePeekDiffPixels(dataA, dataB, outData, opts) {
    opts = opts || {};
    var mode = opts.mode === 'onion' ? 'onion' : 'tint';
    var threshold = Number.isFinite(+opts.threshold) && +opts.threshold >= 0 ? +opts.threshold : PEEK_DIFF_CONTRACT.threshold;
    var len = Math.min(dataA ? dataA.length : 0, dataB ? dataB.length : 0);
    var out = outData || new Uint8ClampedArray(len);
    var totalPixels = Math.floor(len / 4);
    var changedPixels = 0;
    var sumDelta = 0;
    var maxDelta = 0;

    for (var i = 0; i < totalPixels * 4; i += 4) {
      var rA = dataA[i] || 0, gA = dataA[i + 1] || 0, bA = dataA[i + 2] || 0;
      var rB = dataB[i] || 0, gB = dataB[i + 1] || 0, bB = dataB[i + 2] || 0;
      var dr = Math.abs(rA - rB);
      var dg = Math.abs(gA - gB);
      var db = Math.abs(bA - bB);
      var chMax = dr > dg ? (dr > db ? dr : db) : (dg > db ? dg : db);
      var meanCh = (dr + dg + db) / 3;
      sumDelta += meanCh;
      if (chMax > maxDelta) maxDelta = chMax;
      var changed = chMax > threshold;
      if (changed) changedPixels++;

      if (mode === 'onion') {
        out[i] = (rA + rB) >> 1;
        out[i + 1] = (gA + gB) >> 1;
        out[i + 2] = (bA + bB) >> 1;
        out[i + 3] = 255;
      } else if (changed) {
        var lumA = 0.2126 * rA + 0.7152 * gA + 0.0722 * bA;
        var lumB = 0.2126 * rB + 0.7152 * gB + 0.0722 * bB;
        if (lumA >= lumB) {
          out[i] = Math.round(rA * 0.35 + 36 * 0.65);
          out[i + 1] = Math.round(gA * 0.35 + 240 * 0.65);
          out[i + 2] = Math.round(bA * 0.35 + 212 * 0.65);
        } else {
          out[i] = Math.round(rA * 0.35 + 255 * 0.65);
          out[i + 1] = Math.round(gA * 0.35 + 68 * 0.65);
          out[i + 2] = Math.round(bA * 0.35 + 132 * 0.65);
        }
        out[i + 3] = 255;
      } else {
        out[i] = Math.round(rA * 0.45);
        out[i + 1] = Math.round(gA * 0.45);
        out[i + 2] = Math.round(bA * 0.45);
        out[i + 3] = 255;
      }
    }

    var denom = Math.max(1, totalPixels);
    return {
      mode: mode,
      threshold: threshold,
      changedPixels: changedPixels,
      totalPixels: totalPixels,
      diffRatio: round4(changedPixels / denom),
      meanDelta: round4(sumDelta / denom),
      maxDelta: maxDelta,
      identical: changedPixels === 0,
      data: out
    };
  }

  function paintSafeGuides(ctx, opts) {
    if (!ctx) return;
    opts = opts || {};
    var w = Number.isFinite(+opts.width) && +opts.width > 0 ? +opts.width : SAFE_GUIDES_CONTRACT.width;
    var h = Number.isFinite(+opts.height) && +opts.height > 0 ? +opts.height : SAFE_GUIDES_CONTRACT.height;
    var act = SAFE_GUIDES_CONTRACT.actionSafe;
    var ttl = SAFE_GUIDES_CONTRACT.titleSafe;
    var scaleX = w / SAFE_GUIDES_CONTRACT.width;
    var scaleY = h / SAFE_GUIDES_CONTRACT.height;

    ctx.save();
    if (typeof ctx.setTransform === 'function') ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    ctx.lineWidth = 2;

    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([8, 6]);
    ctx.strokeStyle = 'rgba(94, 234, 212, 0.92)';
    ctx.strokeRect(act.x, act.y, act.w, act.h);

    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(255, 190, 104, 0.94)';
    ctx.strokeRect(ttl.x, ttl.y, ttl.w, ttl.h);

    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(231, 238, 246, 0.45)';
    ctx.beginPath();
    ctx.moveTo(626, 360); ctx.lineTo(654, 360);
    ctx.moveTo(640, 346); ctx.lineTo(640, 374);
    ctx.stroke();

    ctx.font = '600 13px ui-monospace, SFMono-Regular, monospace';
    ctx.fillStyle = 'rgba(10, 14, 20, 0.78)';
    ctx.fillRect(act.x + 6, act.y + 6, 128, 20);
    ctx.fillRect(ttl.x + 6, ttl.y + 6, 122, 20);
    ctx.fillStyle = '#5EEAD4';
    ctx.fillText('90% action-safe', act.x + 11, act.y + 20);
    ctx.fillStyle = '#FFBE68';
    ctx.fillText('80% title-safe', ttl.x + 11, ttl.y + 20);
    ctx.restore();
  }

  function transformPathPoints(pts, xf) {
    var p = xf && typeof xf === 'object' ? xf : {};
    var dx = Number.isFinite(+p.x) ? +p.x : 0;
    var dy = Number.isFinite(+p.y) ? +p.y : 0;
    var scale = Number.isFinite(+p.scale) && +p.scale > 0 ? Math.max(0.05, Math.min(8, +p.scale)) : 1;
    var norm = pts.map(function (pt) {
      return Array.isArray(pt) ? [+pt[0] || 0, +pt[1] || 0] : [+(pt && pt.x) || 0, +(pt && pt.y) || 0];
    });
    if (!norm.length) return [];
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6 && Math.abs(scale - 1) < 1e-6) return norm;
    var ax = norm[0][0], ay = norm[0][1];
    return norm.map(function (pt) {
      return [ax + dx + (pt[0] - ax) * scale, ay + dy + (pt[1] - ay) * scale];
    });
  }

  function pathsEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      var ax = Array.isArray(a[i]) ? +a[i][0] : +(a[i] && a[i].x);
      var ay = Array.isArray(a[i]) ? +a[i][1] : +(a[i] && a[i].y);
      var bx = Array.isArray(b[i]) ? +b[i][0] : +(b[i] && b[i].x);
      var by = Array.isArray(b[i]) ? +b[i][1] : +(b[i] && b[i].y);
      if (Math.abs(ax - bx) > 1e-4 || Math.abs(ay - by) > 1e-4) return false;
    }
    return true;
  }

  function inTitleSafe(x, y) {
    var box = SAFE_GUIDES_CONTRACT.titleSafe;
    return x >= box.x && x <= box.right && y >= box.y && y <= box.bottom;
  }

  function lintSafeGuides(showOrProject) {
    var isProject = !!(showOrProject && typeof showOrProject === 'object' && showOrProject.show && typeof showOrProject.show === 'object');
    var show = isProject ? showOrProject.show : (showOrProject || {});
    var atoms = Array.isArray(show.atoms) ? show.atoms : [];
    var overlays = Array.isArray(show.overlays) ? show.overlays : [];
    var findings = [];
    var seen = new Set();

    function push(message, fix, atomId, atomIdx) {
      var key = (atomId || '') + '|' + message;
      if (seen.has(key)) return;
      seen.add(key);
      findings.push({
        code: SAFE_GUIDES_CONTRACT.lintCode,
        message: message,
        fix: fix,
        ...(atomId ? { atom_id: atomId } : {}),
        ...(Number.isInteger(atomIdx) ? { atom_index: atomIdx } : {}),
        category: 'safe',
        severity: 'warn',
        blocksBake: false
      });
    }

    atoms.forEach(function (atom, i) {
      if (!atom || typeof atom !== 'object') return;
      var atomId = atom.id || ('atom_' + String(i + 1).padStart(2, '0'));
      var label = atom.label ? atomId + ' (' + atom.label + ')' : atomId;

      if (atom.caption && String(atom.caption).trim()) {
        var cap = String(atom.caption).trim();
        var cx = Number.isFinite(+atom.caption_x) ? +atom.caption_x : (atom.caption_pos && Number.isFinite(+atom.caption_pos.x) ? +atom.caption_pos.x : 640);
        var cy = Number.isFinite(+atom.caption_y) ? +atom.caption_y : (atom.caption_pos && Number.isFinite(+atom.caption_pos.y) ? +atom.caption_pos.y : 644);
        if (!inTitleSafe(cx, cy) || cap.length > 56) {
          push(
            label + ': caption falls outside the 80% title-safe zone (128..1152 x 72..648)',
            'Fix: Keep the caption inside the 80% title-safe frame (X 128-1152, Y 72-648) or shorten the caption text.',
            atomId,
            i
          );
        }
      }

      var hooks = Array.isArray(atom.fx_hooks) ? atom.fx_hooks : [];
      hooks.forEach(function (rawHk) {
        var hk = typeof rawHk === 'string' ? { type: rawHk, params: {} } : (rawHk || {});
        var type = typeof hk.type === 'string' ? hk.type.trim() : '';
        var prm = hk.params && typeof hk.params === 'object' ? hk.params : {};
        var dx = Number.isFinite(+prm.x) ? +prm.x : 0;
        var dy = Number.isFinite(+prm.y) ? +prm.y : 0;
        var sc = Number.isFinite(+prm.scale) && +prm.scale > 0 ? +prm.scale : 1;
        var hasUserOffset = Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6 || (prm.scale != null && Math.abs(sc - 1) > 1e-6);
        var stock = compose && typeof compose.stockFxPath === 'function' ? compose.stockFxPath(type) : null;
        var hasCustomPath = !!(Array.isArray(prm.path) && prm.path.length > 0 && (!stock || !pathsEqual(prm.path, stock)));

        if (!hasUserOffset && !hasCustomPath) return;

        if (stock || (Array.isArray(prm.path) && prm.path.length > 0)) {
          var basePts = (compose && typeof compose.resolveFxPath === 'function' ? compose.resolveFxPath(type, prm.path) : null) || prm.path || [];
          var screenPts = transformPathPoints(basePts, { x: dx, y: dy, scale: sc });
          var oob = screenPts.find(function (pt) { return !inTitleSafe(pt[0], pt[1]); });
          if (oob) {
            push(
              label + ': FX hook "' + (type || 'fx') + '" HUD point (' + Math.round(oob[0]) + ', ' + Math.round(oob[1]) + ') sits outside 80% title-safe',
              'Fix: Move the FX hook location or path inside the 80% title-safe frame (X 128-1152, Y 72-648).',
              atomId,
              i
            );
          }
        } else {
          var px = 640 + dx, py = 360 + dy;
          if (!inTitleSafe(px, py)) {
            push(
              label + ': FX hook "' + (type || 'fx') + '" offset (' + Math.round(px) + ', ' + Math.round(py) + ') sits outside 80% title-safe',
              'Fix: Move the FX hook location inside the 80% title-safe frame (X 128-1152, Y 72-648).',
              atomId,
              i
            );
          }
        }
      });
    });

    overlays.forEach(function (ov, oi) {
      if (!ov || typeof ov !== 'object' || ov.editor_caption) return;
      if (ov.x == null && ov.y == null) return;
      var ox = Number.isFinite(+ov.x) ? +ov.x : 640;
      var oy = Number.isFinite(+ov.y) ? +ov.y : 200;
      if (!inTitleSafe(ox, oy)) {
        push(
          'overlay "' + (ov.id || ('overlay_' + (oi + 1))) + '" at (' + Math.round(ox) + ', ' + Math.round(oy) + ') sits outside 80% title-safe',
          'Fix: Move the overlay inside the 80% title-safe frame (X 128-1152, Y 72-648).'
        );
      }
    });

    return findings;
  }

  if (compose && typeof compose.lintShow === 'function' && !compose.__hmSafeGuidesWrapped) {
    var baseLintShow = compose.lintShow;
    compose.PEEK_DIFF_CONTRACT = PEEK_DIFF_CONTRACT;
    compose.computePeekDiffPixels = computePeekDiffPixels;
    compose.peekDiffFilename = peekDiffFilename;
    compose.SAFE_GUIDES_CONTRACT = SAFE_GUIDES_CONTRACT;
    compose.paintSafeGuides = paintSafeGuides;
    compose.lintSafeGuides = lintSafeGuides;
    compose.__hmSafeGuidesWrapped = true;
    compose.lintShow = function (showOrProject, opts) {
      var res = baseLintShow.call(compose, showOrProject, opts);
      var safeFindings = lintSafeGuides(showOrProject);
      if (!safeFindings.length) return res;
      var findings = (res.findings || []).concat(safeFindings);
      var byCode = Object.assign({}, res.by_code || {});
      safeFindings.forEach(function (f) {
        byCode[f.code] = (byCode[f.code] || 0) + 1;
      });
      return Object.assign({}, res, {
        count: findings.length,
        clean: findings.length === 0,
        by_code: byCode,
        findings: findings
      });
    };
  }

  var api = {
    PEEK_DIFF_CONTRACT: PEEK_DIFF_CONTRACT,
    computePeekDiffPixels: computePeekDiffPixels,
    peekDiffFilename: peekDiffFilename,
    SAFE_GUIDES_CONTRACT: SAFE_GUIDES_CONTRACT,
    paintSafeGuides: paintSafeGuides,
    lintSafeGuides: lintSafeGuides
  };
  root.HMPeekDiffSafeGuides = api;

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (typeof window === 'undefined' || typeof document === 'undefined' || !window.HMStudio) return;

  var S = window.HMStudio;
  var peekDiffEnabled = false;
  var peekDiffMode = PEEK_DIFF_CONTRACT.defaultMode;
  var peekDiffStats = null;
  var safeGuidesEnabled = false;
  var diffTimer = 0;

  function injectStyles() {
    if (document.getElementById('hmHf1011Styles')) return;
    var style = document.createElement('style');
    style.id = 'hmHf1011Styles';
    style.textContent = [
      '.ab-controls{gap:4px}',
      '.ab-controls select{max-width:148px}',
      '#peekDiffMode{width:auto;max-width:106px;font-size:10px;padding:5px 7px}',
      '#peekDiffToggle,#exportPeekDiffPng,#safeGuidesToggle{font-size:10px;padding:5px 8px;white-space:nowrap}',
      '#peekDiffToggle[aria-pressed="true"],#safeGuidesToggle[aria-pressed="true"]{background:var(--shell-accent-dim);color:var(--accent);border-color:var(--accent);font-weight:650}',
      '.peek-diff-canvas{position:absolute;inset:var(--stage-pad);width:calc(100% - 2 * var(--stage-pad));height:calc(100% - 2 * var(--stage-pad));border-radius:3px;pointer-events:none;z-index:2;display:block}',
      '.safe-guides-overlay{position:absolute;inset:var(--stage-pad);width:calc(100% - 2 * var(--stage-pad));height:calc(100% - 2 * var(--stage-pad));pointer-events:none;z-index:3}',
      '.safe-guide-box{position:absolute;box-sizing:border-box;border-radius:2px;pointer-events:none}',
      '.safe-guide-action{inset:5%;border:1.5px dashed rgba(94,234,212,.92)}',
      '.safe-guide-title{inset:10%;border:1.5px dashed rgba(255,190,104,.94)}',
      '.safe-guide-box>span{position:absolute;left:4px;top:3px;padding:1px 5px;border-radius:3px;font:600 8px/1.2 ui-monospace,SFMono-Regular,monospace;background:rgba(10,14,20,.8)}',
      '.safe-guide-action>span{color:#5EEAD4}',
      '.safe-guide-title>span{color:#FFBE68}',
      '#abDiffPixels[data-diff="identical"]{border-color:var(--shell-shot-line);color:var(--accent)}',
      '.ab-compare-bar{gap:6px}',
      '.ab-diff-chip{font-size:9.5px;padding:2px 5px}',
      '@media(max-width:600px){.transport{flex-wrap:wrap;gap:4px}.transport-right{gap:3px}#safeGuidesToggle,#loop,#onionToggle{font-size:9.5px;padding:4px 5px}}'
    ].join('\n');
    document.head.append(style);
  }

  function updateDiffUiChrome() {
    var btn = document.getElementById('peekDiffToggle');
    var canvas = document.getElementById('peekDiffCanvas');
    var modeSel = document.getElementById('peekDiffMode');
    var chip = document.getElementById('abDiffPixels');
    if (btn) btn.setAttribute('aria-pressed', String(peekDiffEnabled));
    if (modeSel && modeSel.value !== peekDiffMode) modeSel.value = peekDiffMode;
    if (canvas) canvas.hidden = !peekDiffEnabled;
    if (chip) {
      if (!peekDiffEnabled) {
        chip.dataset.diff = 'same';
        chip.textContent = 'Diff: off';
      } else if (!peekDiffStats) {
        chip.dataset.diff = 'same';
        chip.textContent = 'Diff: unavailable (' + peekDiffMode + ')';
      } else if (peekDiffStats.identical) {
        chip.dataset.diff = 'identical';
        chip.textContent = 'Diff: 0.0% (' + peekDiffMode + ')';
      } else {
        chip.dataset.diff = 'changed';
        chip.textContent = 'Diff: ' + (peekDiffStats.diffRatio * 100).toFixed(1) + '% (' + peekDiffMode + ')';
      }
    }
  }

  function renderPeekDiffFromCanvases(mode) {
    var stageA = document.getElementById('stage');
    var stageB = document.getElementById('stageB');
    var diffCanvas = document.getElementById('peekDiffCanvas');
    if (!stageA || !stageB || !diffCanvas) return null;
    if (!S.projectB?.show?.atoms?.length || !S.rendererB) {
      peekDiffStats = null;
      return null;
    }
    var w = diffCanvas.width || 1280, h = diffCanvas.height || 720;
    var ctxA = stageA.getContext('2d');
    var ctxB = stageB.getContext('2d');
    var ctxDiff = diffCanvas.getContext('2d');
    var imgA = ctxA.getImageData(0, 0, w, h);
    var imgB = ctxB.getImageData(0, 0, w, h);
    var outImg = ctxDiff.createImageData(w, h);
    var stats = computePeekDiffPixels(imgA.data, imgB.data, outImg.data, { mode: mode || peekDiffMode });
    ctxDiff.putImageData(outImg, 0, 0);
    peekDiffStats = {
      t: S.time,
      mode: stats.mode,
      changedPixels: stats.changedPixels,
      totalPixels: stats.totalPixels,
      diffRatio: stats.diffRatio,
      meanDelta: stats.meanDelta,
      maxDelta: stats.maxDelta,
      identical: stats.identical
    };
    return peekDiffStats;
  }

  function sampleBothCleanAt(t, sourceTag) {
    var targetT = t != null && Number.isFinite(+t) ? Math.max(0, +t) : S.time;
    var standIn = !S.playing && !S.recording;
    S.renderStageAt(targetT, { standIn: standIn, onion: false, viaSoT: true, source: sourceTag || 'peek-diff-sample' });
    if (S.abEnabled) {
      S.renderStageBAt(targetT, { standIn: standIn, onion: false, viaSoT: true, source: sourceTag || 'peek-diff-sample' });
    } else if (S.rendererB && S.projectB?.show?.atoms?.length) {
      S.sampleStageFrameAt(targetT, { renderer: S.rendererB, standIn: standIn, onion: false, viaSoT: true, source: sourceTag || 'peek-diff-sample' });
    }
  }

  function renderPeekDiffAt(t, opts) {
    opts = opts || {};
    var targetT = t != null && Number.isFinite(+t) ? Math.max(0, +t) : S.time;
    var mode = opts.mode === 'onion' ? 'onion' : peekDiffMode;
    if (!S.project?.show?.atoms?.length || !S.projectB?.show?.atoms?.length || !S.renderer || !S.rendererB) {
      peekDiffStats = null;
      updateDiffUiChrome();
      return null;
    }
    sampleBothCleanAt(targetT, opts.source || 'peek-diff-sample');
    var stats = renderPeekDiffFromCanvases(mode);
    if (safeGuidesEnabled && !S.recording) {
      paintSafeGuides(document.getElementById('stage').getContext('2d'));
    }
    updateDiffUiChrome();
    return stats;
  }

  function scheduleDiffSync() {
    if (!peekDiffEnabled) return;
    if (diffTimer) return;
    diffTimer = 1;
    queueMicrotask(function () {
      diffTimer = 0;
      if (!peekDiffEnabled) return;
      renderPeekDiffAt(S.time, { source: 'peek-diff-sample' });
    });
  }

  function togglePeekDiff(force) {
    var next = typeof force === 'boolean' ? force : !peekDiffEnabled;
    peekDiffEnabled = next;
    if (!peekDiffEnabled) {
      peekDiffStats = null;
      updateDiffUiChrome();
      return false;
    }
    renderPeekDiffAt(S.time, { source: 'peek-diff-sample' });
    if (typeof S.status === 'function') {
      S.status(peekDiffStats
        ? ('Peek diff (' + peekDiffMode + ') at ' + S.time.toFixed(2) + 's · ' + (peekDiffStats.diffRatio * 100).toFixed(1) + '% pixels differ')
        : 'Peek diff enabled · load reference B to compare pixels.');
    }
    return true;
  }

  function setPeekDiffMode(mode) {
    peekDiffMode = mode === 'onion' ? 'onion' : 'tint';
    var sel = document.getElementById('peekDiffMode');
    if (sel) sel.value = peekDiffMode;
    if (peekDiffEnabled) renderPeekDiffAt(S.time, { source: 'peek-diff-sample' });
    else updateDiffUiChrome();
    return peekDiffMode;
  }

  async function downloadPeekDiffPng(t, mode) {
    if (S.recording) return null;
    if (!S.project?.show?.atoms?.length || !S.projectB?.show?.atoms?.length) {
      throw new Error('Open draft A and reference B before exporting a peek-diff PNG.');
    }
    S.pause();
    var targetT = t != null && Number.isFinite(+t) ? Math.max(0, +t) : S.time;
    var activeMode = mode === 'onion' ? 'onion' : (mode === 'tint' ? 'tint' : peekDiffMode);
    var stats = renderPeekDiffAt(targetT, { mode: activeMode, source: 'peek-diff-export' });
    var diffCanvas = document.getElementById('peekDiffCanvas');
    var blob = await new Promise(function (resolve) { diffCanvas.toBlob(resolve, 'image/png'); });
    if (!blob) throw new Error('Could not encode peek-diff PNG.');
    var name = peekDiffFilename(S.project.show.show_id, S.projectB.show.show_id, targetT, activeMode);
    S.download(name, blob);
    S.status('Downloaded peek-diff PNG · ' + name);
    return { filename: name, stats: stats };
  }

  function updateSafeGuidesChrome() {
    var btn = document.getElementById('safeGuidesToggle');
    var overlay = document.getElementById('safeGuidesOverlay');
    if (btn) btn.setAttribute('aria-pressed', String(safeGuidesEnabled));
    if (overlay) overlay.hidden = !safeGuidesEnabled;
  }

  function toggleSafeGuides(force) {
    var next = typeof force === 'boolean' ? force : !safeGuidesEnabled;
    safeGuidesEnabled = next;
    updateSafeGuidesChrome();
    S.renderStageAt(S.time, { standIn: !S.playing && !S.recording, viaSoT: true, source: 'safe-guides-toggle' });
    S.status(safeGuidesEnabled
      ? 'Action-safe (90%) and title-safe (80%) guides enabled · export framing unchanged.'
      : 'Action-safe and title-safe guides hidden.');
    return safeGuidesEnabled;
  }

  // Wrap HMMotion before boot() instantiates stage/stageB renderers so every
  // scrub, play tick, and edit cleanly paints safe guides and refreshes peek-diff.
  if (typeof window.HMMotion === 'function' && !window.HMMotion.__hmWrapped) {
    var origHMMotion = window.HMMotion;
    var wrappedHMMotion = function (canvas, assets) {
      var r = origHMMotion(canvas, assets);
      if (!canvas || (canvas.id !== 'stage' && canvas.id !== 'stageB') || !r || typeof r.render !== 'function') {
        return r;
      }
      var origRender = r.render;
      r.render = function (t, opts) {
        var res = origRender.call(r, t, opts);
        var src = opts && opts.source ? String(opts.source) : '';
        var cleanSample = src === 'frame-peek-strip' || src === 'frame-peek-export' || src === 'safe-guides-clean' || src === 'peek-diff-sample' || src === 'peek-diff-export';
        if (canvas.id === 'stage' && safeGuidesEnabled && !S.recording && !cleanSample) {
          paintSafeGuides(canvas.getContext('2d'));
        }
        if (peekDiffEnabled && !cleanSample) {
          scheduleDiffSync();
        }
        return res;
      };
      return r;
    };
    wrappedHMMotion.__hmWrapped = true;
    window.HMMotion = wrappedHMMotion;
  }

  // Intercept programmatic and file-input B / project imports for #224 root_motion rejection.
  var origLoad = S.load;
  var origOpenProject = S.openProject;
  var origLoadB = S.loadB;
  var origOpenReferenceB = S.openReferenceB;
  if (typeof root.HMStripAdapter !== 'undefined' && root.HMStripAdapter.assertNotRootMotion) {
    S.load = function (p) {
      root.HMStripAdapter.assertNotRootMotion(p);
      return origLoad.call(S, p);
    };
    S.openProject = function (source) {
      if (S.pendingCommit) throw new Error('Wait for the strip import transaction to finish.');
      var guarded = Promise.resolve(source).then(function (p) {
        root.HMStripAdapter.assertNotRootMotion(p);
        return p;
      });
      return origOpenProject.call(S, guarded);
    };
    S.loadB = function (nextProject, kind, valueKey) {
      root.HMStripAdapter.assertNotRootMotion(nextProject);
      return origLoadB.call(S, nextProject, kind, valueKey);
    };
    S.openReferenceB = function (source, kind, valueKey) {
      var guarded = Promise.resolve(source).then(function (p) {
        root.HMStripAdapter.assertNotRootMotion(p);
        return p;
      });
      return origOpenReferenceB.call(S, guarded, kind, valueKey);
    };
  }

  Object.defineProperties(S, {
    peekDiffEnabled: { get: function () { return peekDiffEnabled; }, enumerable: true },
    peekDiffMode: { get: function () { return peekDiffMode; }, enumerable: true },
    peekDiffStats: { get: function () { return peekDiffStats; }, enumerable: true },
    safeGuidesEnabled: { get: function () { return safeGuidesEnabled; }, enumerable: true }
  });
  S.togglePeekDiff = togglePeekDiff;
  S.setPeekDiffMode = setPeekDiffMode;
  S.renderPeekDiffAt = renderPeekDiffAt;
  S.downloadPeekDiffPng = downloadPeekDiffPng;
  S.toggleSafeGuides = toggleSafeGuides;

  function mountDom() {
    injectStyles();
    S.on('peekDiffToggle', function () { togglePeekDiff(); });
    S.on('exportPeekDiffPng', function () { return downloadPeekDiffPng(); });
    S.on('safeGuidesToggle', function () { toggleSafeGuides(); });
    var modeSel = document.getElementById('peekDiffMode');
    if (modeSel && !modeSel.dataset.hmBound) {
      modeSel.dataset.hmBound = '1';
      modeSel.addEventListener('change', S.safe(function (e) { setPeekDiffMode(e.target.value); }));
    }
    var abInput = document.getElementById('abInput');
    if (abInput && !abInput.dataset.hmRootMotionWrapped) {
      abInput.dataset.hmRootMotionWrapped = '1';
      var origOnChange = abInput.onchange;
      abInput.onchange = S.safe(async function (e) {
        var f = e && e.target && e.target.files && e.target.files[0];
        if (f && typeof root.HMStripAdapter !== 'undefined' && root.HMStripAdapter.isRootMotionPayload) {
          var parsed = null;
          try { parsed = JSON.parse(await f.text()); } catch (_) {}
          if (parsed && root.HMStripAdapter.isRootMotionPayload(parsed)) {
            e.target.value = '';
            var msg = root.HMStripAdapter.ROOT_MOTION_REASON;
            if (typeof root.HMImportReceipt !== 'undefined' && root.HMImportReceipt.record) {
              root.HMImportReceipt.record({
                action: 'Import reference B',
                source: f.name || 'Reference JSON',
                status: 'error',
                filesLanded: [],
                clipsLoaded: 0,
                imagesLoaded: 0,
                missing: [msg],
                warnings: ['Reference B unchanged; active project unchanged.'],
                replaceProject: false,
                undoable: false
              });
            }
            throw new Error(msg);
          }
        }
        if (typeof origOnChange === 'function') return origOnChange.call(abInput, e);
      });
    }
    window.addEventListener('hm:projectchange', function () {
      if (peekDiffEnabled) scheduleDiffSync();
    });
    updateDiffUiChrome();
    updateSafeGuidesChrome();
  }

  mountDom();
  if (root.ready && typeof root.ready.then === 'function') {
    root.ready.then(function () {
      if (typeof S.renderShowLintPanel === 'function') S.renderShowLintPanel();
      updateDiffUiChrome();
      updateSafeGuidesChrome();
    }).catch(function () {});
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

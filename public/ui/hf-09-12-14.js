/* Issues #221 (HM-HF-09 Impact Caption Styles), #222 (HM-HF-12 Cam Micro-Move Catalog),
 * and #223 (HM-HF-14 Multi-Edit History Receipts). Strictly local FE-only (no HTTP backend). */
(function (root) {
  'use strict';

  var CONTRACT = 'HM-HF-14-HISTORY-RECEIPTS';
  var STORAGE_KEY = 'hm.composer.historyReceipts:v1';
  var MAX_RECEIPTS = 12;
  var VALID_MICRO_MOVES = Object.freeze(['shake_burst', 'punch_in', 'scan_gate']);
  var CAPTION_STYLE_LIST = Object.freeze([
    { id: 'slam', label: 'Slam', sample: 'SLAM!', theme: 'clash' },
    { id: 'glitch_edge', label: 'Glitch edge', sample: 'CRACK', theme: 'clash' },
    { id: 'clean_bar', label: 'Clean bar', sample: 'GUARD', theme: 'hero' },
    { id: 'impact_hit', label: 'Impact hit', sample: 'HIT', theme: 'clash' },
    { id: 'street_mark', label: 'Street mark', sample: 'STREET', theme: 'STREET' },
  ]);
  var VALID_CAPTION_STYLE_SET = new Set(CAPTION_STYLE_LIST.map(function (s) { return s.id; }));
  var VALID_MICRO_MOVE_SET = new Set(VALID_MICRO_MOVES);
  var seq = 0;

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function defaultStorage(explicit) {
    if (explicit && typeof explicit.getItem === 'function' && typeof explicit.setItem === 'function') return explicit;
    try {
      if (root.localStorage && typeof root.localStorage.getItem === 'function') return root.localStorage;
    } catch (_) {}
    return null;
  }

  function diffFieldKeys(a, b) {
    if (!a && b) return ['added'];
    if (a && !b) return ['removed'];
    if (!a || !b) return [];
    var keys = ['duration_s', 'plates_needed', 'camera', 'fx_hooks', 'cut', 'timing_hold', 'caption', 'caption_style', 'label', 'hero', 'background', 'camera_grammar', 'grammar_role', 'motion'];
    var changed = [];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) changed.push(k);
    }
    return changed.length ? changed : ['atom'];
  }

  function diffShowAtoms(beforeShow, afterShow) {
    var beforeAtoms = Array.isArray(beforeShow && beforeShow.atoms) ? beforeShow.atoms : [];
    var afterAtoms = Array.isArray(afterShow && afterShow.atoms) ? afterShow.atoms : [];
    var maxLen = Math.max(beforeAtoms.length, afterAtoms.length);
    var changedAtoms = [];
    for (var i = 0; i < maxLen; i++) {
      var a = beforeAtoms[i];
      var b = afterAtoms[i];
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        changedAtoms.push({
          index: i,
          id: String((b && b.id) || (a && a.id) || ('atom-' + (i + 1))),
          fields: diffFieldKeys(a, b),
        });
      }
    }
    var n = changedAtoms.length;
    var summary = n
      ? (n + ' atom' + (n === 1 ? '' : 's') + ' changed (' + changedAtoms.slice(0, 3).map(function (c) { return c.id; }).join(', ') + (n > 3 ? ', +' + (n - 3) + ' more' : '') + ')')
      : 'No atom diffs';
    return {
      changedAtoms: changedAtoms,
      atomCountBefore: beforeAtoms.length,
      atomCountAfter: afterAtoms.length,
      summary: summary,
    };
  }

  function buildBatchReceipt(opts) {
    var o = opts || {};
    var beforeShow = o.beforeShow;
    var afterShow = o.afterShow;
    if (!beforeShow || !Array.isArray(beforeShow.atoms)) {
      throw new Error('Cannot build history receipt without a prior show slice.');
    }
    var diff = diffShowAtoms(beforeShow, afterShow || beforeShow);
    var ts = Number.isFinite(+o.ts) ? +o.ts : Date.now();
    var priorSlice = {
      atoms: clone(beforeShow.atoms || []),
    };
    if (beforeShow.duration_target_s !== undefined) priorSlice.duration_target_s = beforeShow.duration_target_s;
    if (beforeShow.rhythm !== undefined) priorSlice.rhythm = clone(beforeShow.rhythm);
    if (beforeShow.camera_authoring !== undefined) priorSlice.camera_authoring = clone(beforeShow.camera_authoring);
    if (beforeShow.overlays !== undefined) priorSlice.overlays = clone(beforeShow.overlays);
    return {
      contract: CONTRACT,
      id: 'hr-' + ts + '-' + (++seq).toString(36),
      ts: ts,
      iso: new Date(ts).toISOString(),
      show_id: String(beforeShow.show_id || (afterShow && afterShow.show_id) || 'unknown'),
      source: String(o.source || 'batch-edit'),
      label: String(o.label || ('Batch edit · ' + diff.summary)),
      atomCount: diff.changedAtoms.length,
      atomCountBefore: diff.atomCountBefore,
      atomCountAfter: diff.atomCountAfter,
      changedAtoms: diff.changedAtoms,
      summary: diff.summary,
      priorSlice: priorSlice,
      afterHistoryIndex: Number.isInteger(o.afterHistoryIndex) ? o.afterHistoryIndex : null,
      restored: false,
      restoredAt: null,
    };
  }

  function readAllReceipts(storage) {
    var store = defaultStorage(storage);
    if (!store) return [];
    try {
      var raw = store.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(function (r) { return r && typeof r === 'object' && r.id && r.priorSlice; }).slice(0, MAX_RECEIPTS) : [];
    } catch (_) {
      return [];
    }
  }

  function writeAllReceipts(list, storage) {
    var store = defaultStorage(storage);
    if (!store) return false;
    var next = (Array.isArray(list) ? list : []).slice(0, MAX_RECEIPTS);
    while (next.length >= 0) {
      try {
        store.setItem(STORAGE_KEY, JSON.stringify(next));
        return true;
      } catch (_) {
        if (!next.length) return false;
        next.pop();
      }
    }
    return false;
  }

  function recordBatch(opts) {
    var o = opts || {};
    var receipt = buildBatchReceipt(o);
    var existing = readAllReceipts(o.storage);
    var next = [receipt].concat(existing).slice(0, MAX_RECEIPTS);
    writeAllReceipts(next, o.storage);
    return receipt;
  }

  function listReceipts(showId, storage) {
    var all = readAllReceipts(storage);
    if (!showId) return all;
    return all.filter(function (r) { return r.show_id === showId; });
  }

  function clearReceipts(showId, storage) {
    if (!showId) {
      writeAllReceipts([], storage);
      return;
    }
    var kept = readAllReceipts(storage).filter(function (r) { return r.show_id !== showId; });
    writeAllReceipts(kept, storage);
  }

  function markRestored(receiptId, storage) {
    var all = readAllReceipts(storage);
    var now = Date.now();
    var updated = all.map(function (r) {
      if (r.id !== receiptId) return r;
      var copy = clone(r);
      copy.restored = true;
      copy.restoredAt = now;
      return copy;
    });
    writeAllReceipts(updated, storage);
    return updated.find(function (r) { return r.id === receiptId; }) || null;
  }

  function restoreSlice(show, receipt) {
    if (!show || typeof show !== 'object') throw new Error('No show to restore.');
    var slice = receipt && receipt.priorSlice;
    if (!slice || !Array.isArray(slice.atoms)) throw new Error('Invalid history receipt slice.');
    var next = clone(show);
    next.atoms = clone(slice.atoms);
    if (slice.duration_target_s !== undefined) next.duration_target_s = slice.duration_target_s;
    else delete next.duration_target_s;
    if (slice.rhythm !== undefined) next.rhythm = clone(slice.rhythm);
    else delete next.rhythm;
    if (slice.camera_authoring !== undefined) next.camera_authoring = clone(slice.camera_authoring);
    else delete next.camera_authoring;
    if (slice.overlays !== undefined) next.overlays = clone(slice.overlays);
    else delete next.overlays;
    return next;
  }

  var api = Object.freeze({
    CONTRACT: CONTRACT,
    STORAGE_KEY: STORAGE_KEY,
    MAX_RECEIPTS: MAX_RECEIPTS,
    CAPTION_STYLES: CAPTION_STYLE_LIST,
    MICRO_MOVES: VALID_MICRO_MOVES,
    diffShowAtoms: diffShowAtoms,
    buildBatchReceipt: buildBatchReceipt,
    readAllReceipts: readAllReceipts,
    recordBatch: recordBatch,
    listReceipts: listReceipts,
    clearReceipts: clearReceipts,
    markRestored: markRestored,
    restoreSlice: restoreSlice,
  });

  root.HMHistoryReceipts = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (typeof document === 'undefined' || !root.HMStudio) return;

  var S = root.HMStudio;
  var origEditProject = S.editProject;
  var origRestore = S.restore;
  var explicitBatchDepth = 0;
  var restoringReceipt = false;
  var lastBatchTrigger = null;

  function noteBatchTrigger(source, label) {
    lastBatchTrigger = { source: source, label: label, at: Date.now() };
  }

  function consumeBatchTrigger() {
    var cur = lastBatchTrigger;
    lastBatchTrigger = null;
    if (!cur || Date.now() - cur.at > 8000) return null;
    return cur;
  }

  function injectStyles() {
    if (document.getElementById('hmHf091214Styles')) return;
    var style = document.createElement('style');
    style.id = 'hmHf091214Styles';
    style.textContent = [
      '#camMicroMove,#captionStyle{width:100%;max-width:100%;box-sizing:border-box;margin-bottom:4px}',
      '.history-receipts-panel{margin-top:8px;border:1px solid var(--shell-line,#2a322e);border-radius:10px;background:rgba(16,20,18,.7);overflow:hidden}',
      '.history-receipts-summary{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 12px;cursor:pointer;list-style:none}',
      '.history-receipts-summary::-webkit-details-marker{display:none}',
      '.history-receipts-body{padding:8px 12px 12px;border-top:1px solid var(--shell-line,#2a322e);display:flex;flex-direction:column;gap:8px}',
      '.history-receipts-actions{display:flex;flex-wrap:wrap;gap:8px}',
      '.history-receipts-actions button{min-height:30px;padding:4px 10px;font-size:11px;border-radius:7px}',
      '.history-receipts-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto}',
      '.history-receipt-item{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:7px 9px;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);font-size:11.5px;line-height:1.35}',
      '.history-receipt-item[data-restored="true"]{opacity:.62}',
      '.history-receipt-meta{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}',
      '.history-receipt-title{font-weight:600;color:var(--fg,#edf1e9);word-break:break-word}',
      '.history-receipt-sub{font-size:10.5px;color:var(--muted,#98a699);word-break:break-word}',
      '.history-receipt-undo{flex:0 0 auto;min-height:28px;padding:3px 9px;font-size:11px;border-radius:6px}',
    ].join('\n');
    document.head.appendChild(style);
  }

  function captionSampleFor(id) {
    for (var i = 0; i < CAPTION_STYLE_LIST.length; i++) {
      if (CAPTION_STYLE_LIST[i].id === id) return CAPTION_STYLE_LIST[i].sample;
    }
    return '';
  }

  function currentAtom() {
    var show = S.show;
    return show && Array.isArray(show.atoms) ? (show.atoms[S.selectedIndex] || null) : null;
  }

  function syncInspectorControls() {
    var a = currentAtom();
    var microSel = document.getElementById('camMicroMove');
    if (microSel) {
      microSel.disabled = !a || S.recording;
      if (document.activeElement !== microSel) {
        var mm = a && a.camera && typeof a.camera.micro_move === 'string' ? a.camera.micro_move : '';
        microSel.value = VALID_MICRO_MOVE_SET.has(mm) ? mm : '';
      }
    }
    var capSel = document.getElementById('captionStyle');
    if (capSel) {
      capSel.disabled = !a || S.recording;
      if (document.activeElement !== capSel) {
        var cs = a && typeof a.caption_style === 'string' ? a.caption_style : '';
        capSel.value = VALID_CAPTION_STYLE_SET.has(cs) ? cs : '';
      }
    }
  }

  function renderHistoryReceiptsPanel() {
    var panel = document.getElementById('historyReceiptsPanel');
    var countPill = document.getElementById('historyReceiptsCount');
    var empty = document.getElementById('historyReceiptsEmpty');
    var listEl = document.getElementById('historyReceiptsList');
    var undoTop = document.getElementById('undoBatchReceipt');
    if (!panel || !listEl) return;

    var showId = S.show && S.show.show_id;
    var items = listReceipts(showId);
    panel.dataset.count = String(items.length);
    if (countPill) countPill.textContent = items.length + ' receipt' + (items.length === 1 ? '' : 's');
    var activeItem = items.find(function (r) { return !r.restored; }) || null;
    if (undoTop) undoTop.disabled = !activeItem || S.recording;
    if (empty) empty.hidden = items.length > 0;
    listEl.hidden = items.length === 0;
    listEl.replaceChildren();

    items.forEach(function (item) {
      var li = document.createElement('li');
      li.className = 'history-receipt-item';
      li.dataset.receiptId = item.id;
      li.dataset.restored = String(Boolean(item.restored));

      var meta = document.createElement('div');
      meta.className = 'history-receipt-meta';
      var title = document.createElement('span');
      title.className = 'history-receipt-title';
      title.textContent = item.label + (item.restored ? ' (undone)' : '');
      var sub = document.createElement('span');
      sub.className = 'history-receipt-sub';
      var fieldsPreview = (item.changedAtoms || []).slice(0, 4).map(function (c) {
        return c.id + ': ' + (c.fields || []).join('+');
      }).join(' · ');
      sub.textContent = (item.source || 'batch') + ' · ' + item.summary + (fieldsPreview ? ' · ' + fieldsPreview : '');
      meta.append(title, sub);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'history-receipt-undo';
      btn.dataset.undoReceipt = item.id;
      btn.disabled = Boolean(item.restored) || Boolean(S.recording);
      btn.textContent = item.restored ? 'Undone' : 'Undo batch';
      li.append(meta, btn);
      listEl.append(li);
    });
  }

  function setCaptionStyle(styleId, opts) {
    var clean = typeof styleId === 'string' ? styleId.trim() : '';
    if (clean && !VALID_CAPTION_STYLE_SET.has(clean)) {
      throw new Error('Unknown caption style: ' + clean);
    }
    var a = currentAtom();
    if (!a) throw new Error('Select a clip before choosing a caption style.');
    var fillSample = !opts || opts.fillSample !== false;
    origEditProject.call(S, function (p) {
      var clip = p.show.atoms[S.selectedIndex];
      if (!clip) return;
      if (clean) {
        clip.caption_style = clean;
        if (fillSample && !clip.caption) {
          clip.caption = captionSampleFor(clean) || clip.caption || '';
        }
      } else {
        delete clip.caption_style;
      }
    });
    if (typeof S.status === 'function') {
      S.status(clean ? ('Caption style · ' + clean) : 'Caption style cleared (plain).');
    }
    return clean;
  }

  function setCamMicroMove(microMoveId) {
    var clean = typeof microMoveId === 'string' ? microMoveId.trim() : '';
    if (clean && !VALID_MICRO_MOVE_SET.has(clean)) {
      throw new Error('Unknown camera micro-move: ' + clean);
    }
    var a = currentAtom();
    if (!a) throw new Error('Select a clip before choosing a camera micro-move.');
    origEditProject.call(S, function (p) {
      var clip = p.show.atoms[S.selectedIndex];
      if (!clip) return;
      clip.camera = clip.camera || { preset: 'static_hold' };
      if (clean) {
        clip.camera.micro_move = clean;
        if (Array.isArray(clip.camera.segments) && clip.camera.segments[0]) {
          clip.camera.segments[0].micro_move = clean;
        }
      } else {
        delete clip.camera.micro_move;
        if (Array.isArray(clip.camera.segments)) {
          clip.camera.segments.forEach(function (seg) {
            if (seg && typeof seg === 'object') delete seg.micro_move;
          });
        }
      }
      delete clip.timing_hold;
    });
    if (typeof S.status === 'function') {
      S.status(clean ? ('Camera micro-move · ' + clean + ' (additive)') : 'Camera micro-move cleared.');
    }
    return clean;
  }

  function applyAgentBatch(mutateFn, meta) {
    if (typeof mutateFn !== 'function') throw new Error('applyAgentBatch requires a mutation function.');
    var m = meta || {};
    var beforeShow = S.show;
    var receipt = null;
    explicitBatchDepth++;
    try {
      origEditProject.call(S, function (project) {
        return mutateFn(project);
      });
    } finally {
      explicitBatchDepth--;
    }
    var afterShow = S.show;
    var diff = diffShowAtoms(beforeShow, afterShow);
    var changedOther = JSON.stringify(beforeShow && beforeShow.duration_target_s) !== JSON.stringify(afterShow && afterShow.duration_target_s) ||
      JSON.stringify(beforeShow && beforeShow.overlays) !== JSON.stringify(afterShow && afterShow.overlays);
    if (diff.changedAtoms.length > 0 || changedOther) {
      receipt = recordBatch({
        beforeShow: beforeShow,
        afterShow: afterShow,
        source: m.source || 'agent-skill',
        label: m.label || ('Agent batch · ' + diff.summary),
        afterHistoryIndex: S.historyIndex,
      });
      renderHistoryReceiptsPanel();
    }
    return receipt;
  }

  function slicesEqual(showA, showB) {
    if (!showA || !showB) return false;
    return JSON.stringify(showA.atoms) === JSON.stringify(showB.atoms) &&
      JSON.stringify(showA.duration_target_s) === JSON.stringify(showB.duration_target_s) &&
      JSON.stringify(showA.rhythm) === JSON.stringify(showB.rhythm) &&
      JSON.stringify(showA.camera_authoring) === JSON.stringify(showB.camera_authoring) &&
      JSON.stringify(showA.overlays) === JSON.stringify(showB.overlays);
  }

  function undoBatchReceipt(receiptId) {
    var show = S.show;
    if (!show) throw new Error('No open show.');
    var items = listReceipts(show.show_id);
    var target = receiptId
      ? items.find(function (r) { return r.id === receiptId; })
      : items.find(function (r) { return !r.restored; });
    if (!target) throw new Error('No pending batch receipt to undo.');
    if (target.restored) return { ok: false, message: 'Batch receipt was already undone.' };

    restoringReceipt = true;
    try {
      var usedNativeRestore = false;
      if (target.afterHistoryIndex != null && target.afterHistoryIndex === S.historyIndex && S.historyIndex > 0 && typeof origRestore === 'function') {
        origRestore.call(S, -1);
        if (slicesEqual(S.show, target.priorSlice)) {
          usedNativeRestore = true;
        }
      }
      if (!usedNativeRestore) {
        origEditProject.call(S, function (p) {
          p.show = restoreSlice(p.show, target);
          return Math.min(S.selectedIndex, Math.max(0, p.show.atoms.length - 1));
        });
      }
    } finally {
      restoringReceipt = false;
    }

    var marked = markRestored(target.id);
    renderHistoryReceiptsPanel();
    if (typeof S.status === 'function') {
      S.status('Undid batch · ' + target.label + ' (' + target.atomCount + ' atom' + (target.atomCount === 1 ? '' : 's') + ' restored).');
    }
    return { ok: true, receipt: marked || target };
  }

  // Hook app.js edit() commits so both UI batch actions (Cut pack, Fit, Chain, Paste all)
  // and external HMStudio.editProject batch calls record localStorage receipts cleanly.
  root.__hmOnEdit = function (beforeShow, afterShow, afterHistIdx) {
    if (explicitBatchDepth > 0 || restoringReceipt) return;
    var trig = consumeBatchTrigger();
    var diff = diffShowAtoms(beforeShow, afterShow);
    if (diff.changedAtoms.length >= 2) {
      recordBatch({
        beforeShow: beforeShow,
        afterShow: afterShow,
        source: (trig && trig.source) || 'composer-batch',
        label: (trig && trig.label) || ('Batch edit · ' + diff.summary),
        afterHistoryIndex: Number.isInteger(afterHistIdx) ? afterHistIdx : S.historyIndex,
      });
      renderHistoryReceiptsPanel();
    }
  };

  S.setCaptionStyle = setCaptionStyle;
  S.setCamMicroMove = setCamMicroMove;
  S.applyAgentBatch = applyAgentBatch;
  S.undoBatchReceipt = undoBatchReceipt;
  S.listHistoryReceipts = function () { return listReceipts(S.show && S.show.show_id); };

  function wireBatchTriggerButtons() {
    var triggers = [
      ['applyCutPack', 'cut-pack', 'HF-08 cut pack'],
      ['pasteCamAll', 'paste-cam-all', 'Paste camera to all clips'],
      ['chainCams', 'cam-chain', 'Chain clip cameras'],
      ['camEaseChain', 'cam-ease-chain', 'Apply easing to chain'],
      ['chainFromFirst', 'cam-chain-first', 'Chain from first camera'],
      ['chainSnap', 'cam-chain-snap', 'Chain with snap zoom'],
      ['suggestGrammarUpgrade', 'grammar-upgrade', 'Grammar remap'],
    ];
    triggers.forEach(function (entry) {
      var btn = document.getElementById(entry[0]);
      if (btn && !btn.dataset.hmBatchWired) {
        btn.dataset.hmBatchWired = '1';
        btn.addEventListener('click', function () { noteBatchTrigger(entry[1], entry[2]); }, true);
      }
    });
    document.querySelectorAll('[data-fit]').forEach(function (btn) {
      if (btn.dataset.hmBatchWired) return;
      btn.dataset.hmBatchWired = '1';
      btn.addEventListener('click', function () {
        noteBatchTrigger('fit-seconds', 'Fit timeline to ' + btn.dataset.fit + 's');
      }, true);
    });
    var rhythmIn = document.getElementById('rhythmPlanInput');
    if (rhythmIn && !rhythmIn.dataset.hmBatchWired) {
      rhythmIn.dataset.hmBatchWired = '1';
      rhythmIn.addEventListener('change', function () { noteBatchTrigger('hm-rhythm-pacing', 'Apply rhythm plan'); }, true);
    }
    var camIn = document.getElementById('cameraPlanInput');
    if (camIn && !camIn.dataset.hmBatchWired) {
      camIn.dataset.hmBatchWired = '1';
      camIn.addEventListener('change', function () { noteBatchTrigger('hm-cam-grammar-scene', 'Apply camera grammar map'); }, true);
    }
  }

  function mountDom() {
    injectStyles();
    wireBatchTriggerButtons();

    var microSel = document.getElementById('camMicroMove');
    if (microSel && !microSel.dataset.hmBound) {
      microSel.dataset.hmBound = '1';
      microSel.addEventListener('change', S.safe(function (e) { setCamMicroMove(e.target.value); }));
    }

    var capSel = document.getElementById('captionStyle');
    if (capSel && !capSel.dataset.hmBound) {
      capSel.dataset.hmBound = '1';
      capSel.addEventListener('change', S.safe(function (e) { setCaptionStyle(e.target.value); }));
    }

    S.on('undoBatchReceipt', function () { undoBatchReceipt(); });
    S.on('clearHistoryReceipts', function () {
      var sid = S.show && S.show.show_id;
      clearReceipts(sid);
      renderHistoryReceiptsPanel();
      if (typeof S.status === 'function') S.status('Cleared batch history receipts for this project.');
    });

    var listEl = document.getElementById('historyReceiptsList');
    if (listEl && !listEl.dataset.hmBound) {
      listEl.dataset.hmBound = '1';
      listEl.addEventListener('click', S.safe(function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest('[data-undo-receipt]') : null;
        if (!btn) return;
        undoBatchReceipt(btn.dataset.undoReceipt);
      }));
    }

    root.addEventListener('hm:projectchange', function () {
      var curShow = S.show;
      if (!restoringReceipt && curShow) {
        var curIdx = S.historyIndex;
        listReceipts(curShow.show_id).forEach(function (r) {
          if (!r.restored && r.afterHistoryIndex != null && curIdx < r.afterHistoryIndex && slicesEqual(curShow, r.priorSlice)) {
            markRestored(r.id);
          }
        });
      }
      syncInspectorControls();
      renderHistoryReceiptsPanel();
    });

    syncInspectorControls();
    renderHistoryReceiptsPanel();
  }

  mountDom();
  if (root.ready && typeof root.ready.then === 'function') {
    root.ready.then(function () {
      wireBatchTriggerButtons();
      syncInspectorControls();
      renderHistoryReceiptsPanel();
    }).catch(function () {});
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

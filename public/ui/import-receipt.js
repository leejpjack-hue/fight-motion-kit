/* Issue #211 — Local import receipt: what landed, what stays missing, zero provider calls. */
(function (root) {
  'use strict';

  var currentReceipt = null;
  var DATA_IMG_RE = /^data:image\//i;

  function trimStr(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function uniqueList(items) {
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < (items || []).length; i++) {
      var val = trimStr(items[i]);
      if (!val || Object.prototype.hasOwnProperty.call(seen, val)) continue;
      seen[val] = true;
      out.push(val);
    }
    return out;
  }

  function basename(p) {
    var clean = trimStr(p);
    var idx = clean.lastIndexOf('/');
    return idx >= 0 ? clean.slice(idx + 1) : clean;
  }

  function isLocalSupplied(ref, localFiles) {
    if (!localFiles || typeof localFiles !== 'object') return false;
    if (Object.prototype.hasOwnProperty.call(localFiles, ref)) return Boolean(localFiles[ref]);
    var base = basename(ref);
    return Boolean(base && Object.prototype.hasOwnProperty.call(localFiles, base) && localFiles[base]);
  }

  function resolveValue(ref, assets, localFiles) {
    var clean = trimStr(ref);
    if (!clean) return '';
    if (DATA_IMG_RE.test(clean)) return clean;
    if (assets && typeof assets[clean] === 'string' && DATA_IMG_RE.test(assets[clean])) return assets[clean];
    if (isLocalSupplied(clean, localFiles)) return 'data:image/local';
    return '';
  }

  function addRef(bucket, ref, dirnamePrefix) {
    var clean = trimStr(ref);
    if (!clean) return;
    if (DATA_IMG_RE.test(clean) || clean.indexOf('/') === 0) {
      bucket.push(clean);
      return;
    }
    bucket.push(dirnamePrefix ? dirnamePrefix + clean : clean);
  }

  function auditProjectAssets(project, opts) {
    var options = opts || {};
    var p = project || {};
    var show = p.show || {};
    var assets = p.assets || {};
    var layouts = p.layouts || {};
    var localFiles = options.localFiles || null;
    var fetchedHostShow = Boolean(options.fetchedHostShow);
    var clipsLoaded = Array.isArray(show.atoms) ? show.atoms.length : 0;

    var rawRefs = [];
    var media = Array.isArray(p.media) ? p.media : [];
    var pendingAssets = Object.create(null);
    for (var i = 0; i < media.length; i++) {
      var m = media[i];
      if (!m) continue;
      if (m.pendingMotion) {
        if (m.src) pendingAssets[m.src] = true;
        continue;
      }
      if (trimStr(m.src)) rawRefs.push(trimStr(m.src));
    }
    var assetKeys = Object.keys(assets);
    for (var aki = 0; aki < assetKeys.length; aki++) {
      var aKey = assetKeys[aki];
      if (!pendingAssets[aKey] && DATA_IMG_RE.test(assets[aKey])) rawRefs.push(aKey);
    }

    var layoutKeys = Object.keys(layouts);
    for (var lk = 0; lk < layoutKeys.length; lk++) {
      var key = layoutKeys[lk];
      var lObj = layouts[key] || {};
      var slash = key.lastIndexOf('/');
      var dir = slash >= 0 ? key.slice(0, slash + 1) : '';
      var plateIds = Object.keys(lObj);
      for (var pk = 0; pk < plateIds.length; pk++) {
        var entry = lObj[plateIds[pk]];
        if (!entry || entry.pendingMotion) continue;
        if (entry.full) addRef(rawRefs, entry.full, DATA_IMG_RE.test(entry.full) ? '' : dir);
        var parts = Array.isArray(entry.parts) ? entry.parts : [];
        for (var pt = 0; pt < parts.length; pt++) {
          if (parts[pt] && parts[pt].src) addRef(rawRefs, parts[pt].src, DATA_IMG_RE.test(parts[pt].src) ? '' : dir);
        }
      }
    }

    var bg = show.bg || {};
    if (bg.base) rawRefs.push(bg.base);
    if (bg.swap) rawRefs.push(bg.swap);
    if (Array.isArray(bg.locations)) {
      for (var bi = 0; bi < bg.locations.length; bi++) {
        if (bg.locations[bi] && bg.locations[bi].src) rawRefs.push(bg.locations[bi].src);
      }
    }
    var atoms = Array.isArray(show.atoms) ? show.atoms : [];
    for (var ai = 0; ai < atoms.length; ai++) {
      if (atoms[ai] && atoms[ai].background && atoms[ai].background.src) rawRefs.push(atoms[ai].background.src);
    }
    var fgList = Array.isArray(show.fg) ? show.fg : [];
    for (var fi = 0; fi < fgList.length; fi++) {
      if (fgList[fi] && fgList[fi].src) rawRefs.push(fgList[fi].src);
      if (fgList[fi] && fgList[fi].broken_src) rawRefs.push(fgList[fi].broken_src);
    }

    var candidates = uniqueList(rawRefs);
    var resolvedRefs = [];
    var missingRefs = [];
    for (var ci = 0; ci < candidates.length; ci++) {
      var ref = candidates[ci];
      var resolvedData = resolveValue(ref, assets, localFiles);
      var shippedAsset = (fetchedHostShow || options.isBuiltIn) && /^\/?assets\//.test(ref) && ref.indexOf('..') < 0;
      if (resolvedData || shippedAsset) {
        resolvedRefs.push(DATA_IMG_RE.test(ref) ? 'embedded-image-' + (resolvedRefs.length + 1) : ref);
      } else {
        missingRefs.push(ref);
      }
    }

    return {
      clipsLoaded: clipsLoaded,
      imagesLoaded: resolvedRefs.length,
      resolvedRefs: resolvedRefs,
      missingRefs: missingRefs,
    };
  }

  function missingFromParsedInput(parsed, localFiles) {
    if (!parsed || typeof parsed !== 'object') return { referenced: [], provided: [], missing: [] };
    var assets = parsed.assets || {};
    var refs = [];
    if (parsed.kind === 'costume_lock' && parsed.cast && typeof parsed.cast === 'object') {
      var sides = ['L', 'R'];
      for (var si = 0; si < sides.length; si++) {
        var ch = parsed.cast[sides[si]];
        if (!ch || typeof ch !== 'object') continue;
        ['lock_refs', 'sheets', 'pose_refs'].forEach(function (field) {
          var arr = Array.isArray(ch[field]) ? ch[field] : [];
          for (var j = 0; j < arr.length; j++) {
            var s = typeof arr[j] === 'string' ? arr[j] : arr[j] && arr[j].src;
            if (trimStr(s)) refs.push(trimStr(s));
          }
        });
      }
    } else if (parsed.show && Array.isArray(parsed.media)) {
      for (var mi = 0; mi < parsed.media.length; mi++) {
        if (parsed.media[mi] && !parsed.media[mi].pendingMotion && trimStr(parsed.media[mi].src)) {
          refs.push(trimStr(parsed.media[mi].src));
        }
      }
    }
    var list = uniqueList(refs);
    var provided = [];
    var missing = [];
    for (var i = 0; i < list.length; i++) {
      var ref = list[i];
      if (resolveValue(ref, assets, localFiles)) provided.push(ref);
      else missing.push(ref);
    }
    return { referenced: list, provided: provided, missing: missing };
  }

  function buildReceipt(input) {
    var src = input || {};
    var filesLanded = uniqueList(src.filesLanded || []);
    var missing = uniqueList(src.missing || []);
    var warnings = uniqueList(src.warnings || []);
    var clipsLoaded = Math.max(0, Number(src.clipsLoaded) || 0);
    var imagesLoaded = Math.max(0, Number(src.imagesLoaded) || 0);
    var validStatuses = { ok: 1, partial: 1, pending: 1, blocked: 1, error: 1, ready: 1 };
    var status = src.status && validStatuses[src.status] ? src.status : (missing.length ? (imagesLoaded || filesLanded.length ? 'partial' : 'error') : 'ok');
    if (status === 'ready') status = 'ok';
    return {
      action: trimStr(src.action) || 'Local import',
      source: trimStr(src.source) || 'Local files',
      status: status,
      filesLanded: filesLanded,
      clipsLoaded: clipsLoaded,
      imagesLoaded: imagesLoaded,
      missing: missing,
      warnings: warnings,
      replaceProject: Boolean(src.replaceProject),
      undoable: Boolean(src.undoable),
      providerCalls: 0,
      artInvented: false,
      recordedAt: trimStr(src.recordedAt) || new Date().toISOString(),
    };
  }

  function statusText(status) {
    if (status === 'blocked') return 'BLOCKED · MISSING ON DISK';
    if (status === 'pending') return 'PENDING · NOT PLAYABLE';
    if (status === 'partial') return 'PARTIAL · MISSING FILES';
    if (status === 'error') return 'NOT LOADED';
    return 'LANDED';
  }

  function formatSummary(receipt) {
    var r = buildReceipt(receipt);
    return (
      r.action +
      ' (' +
      r.source +
      '): ' +
      statusText(r.status) +
      ' · ' +
      r.clipsLoaded +
      ' clips · ' +
      r.imagesLoaded +
      ' images · ' +
      r.missing.length +
      ' missing · 0 provider calls'
    );
  }

  function el(doc, tag, attrs, text) {
    var node = doc.createElement(tag);
    if (attrs) {
      var keys = Object.keys(attrs);
      for (var i = 0; i < keys.length; i++) node.setAttribute(keys[i], attrs[keys[i]]);
    }
    if (text != null) node.textContent = text;
    return node;
  }

  function renderReceipt(receipt) {
    if (typeof document === 'undefined') return;
    var box = document.getElementById('importReceipt');
    if (!box) return;
    if (!receipt) {
      box.hidden = true;
      box.replaceChildren();
      return;
    }

    var doc = box.ownerDocument || document;
    box.hidden = false;
    box.dataset.status = receipt.status;
    box.dataset.providerCalls = '0';
    box.dataset.undoable = String(Boolean(receipt.undoable));
    box.replaceChildren();

    var head = el(doc, 'div', { class: 'import-receipt-head' });
    var titleWrap = el(doc, 'div', { class: 'import-receipt-title-wrap' });
    titleWrap.appendChild(el(doc, 'strong', { id: 'importReceiptTitle' }, 'Import receipt · ' + receipt.action));
    titleWrap.appendChild(el(doc, 'span', { id: 'importReceiptStatus', class: 'import-receipt-badge' }, statusText(receipt.status)));
    head.appendChild(titleWrap);

    var dismissBtn = el(doc, 'button', {
      id: 'importReceiptDismiss',
      type: 'button',
      class: 'import-receipt-close',
      'aria-label': 'Dismiss import receipt',
    }, '×');
    dismissBtn.onclick = dismiss;
    head.appendChild(dismissBtn);

    var meta = el(doc, 'div', { id: 'importReceiptCounts', class: 'import-receipt-counts', 'data-receipt': 'counts' });
    meta.appendChild(el(doc, 'span', { 'data-receipt': 'source' }, receipt.source));
    meta.appendChild(el(doc, 'span', { 'data-receipt': 'clips' }, receipt.clipsLoaded + ' clip' + (receipt.clipsLoaded === 1 ? '' : 's')));
    meta.appendChild(el(doc, 'span', { 'data-receipt': 'images' }, receipt.imagesLoaded + ' image' + (receipt.imagesLoaded === 1 ? '' : 's')));
    meta.appendChild(el(doc, 'span', { 'data-receipt': 'missing-count' }, receipt.missing.length + ' missing'));
    meta.appendChild(el(doc, 'span', { 'data-receipt': 'provider' }, 'No provider · local only'));

    var landedWrap = el(doc, 'div', { id: 'importReceiptLanded', class: 'import-receipt-section' });
    landedWrap.appendChild(el(doc, 'div', { class: 'import-receipt-label' }, 'Landed'));
    if (receipt.filesLanded.length) {
      var landedList = el(doc, 'ul', { class: 'import-receipt-list', 'data-receipt': 'landed-list' });
      for (var li = 0; li < receipt.filesLanded.length; li++) {
        landedList.appendChild(el(doc, 'li', null, receipt.filesLanded[li]));
      }
      landedWrap.appendChild(landedList);
    } else {
      landedWrap.appendChild(el(doc, 'p', { class: 'muted import-receipt-empty' }, 'None — existing active project preserved.'));
    }

    var missingWrap = el(doc, 'div', { id: 'importReceiptMissing', class: 'import-receipt-section' });
    missingWrap.appendChild(el(doc, 'div', { class: 'import-receipt-label' }, 'Did not load / missing'));
    if (receipt.missing.length) {
      var missingList = el(doc, 'ul', { class: 'import-receipt-list is-missing', 'data-receipt': 'missing-list' });
      for (var mi = 0; mi < receipt.missing.length; mi++) {
        missingList.appendChild(el(doc, 'li', null, receipt.missing[mi]));
      }
      missingWrap.appendChild(missingList);
    } else {
      missingWrap.appendChild(el(doc, 'p', { class: 'muted import-receipt-empty' }, 'None — all selected files landed.'));
    }

    box.appendChild(head);
    box.appendChild(meta);
    box.appendChild(landedWrap);
    box.appendChild(missingWrap);

    var notes = receipt.warnings.slice();
    if (receipt.undoable) notes.push('Undo restores your previous draft.');
    if (receipt.status === 'blocked' && !receipt.replaceProject) {
      notes.push('Missing pack kept un-replaced (0 stand-in images, 0 provider calls).');
    }
    if (notes.length) {
      box.appendChild(el(doc, 'p', { id: 'importReceiptNote', class: 'import-receipt-note' }, notes.join(' ')));
    }
  }

  function record(input) {
    currentReceipt = buildReceipt(input);
    renderReceipt(currentReceipt);
    if (typeof document !== 'undefined' && typeof root.CustomEvent === 'function') {
      document.dispatchEvent(new root.CustomEvent('hm:importreceipt', { detail: currentReceipt }));
    }
    return currentReceipt;
  }

  function recordMarketSpritegen(proofReceipt) {
    var r = proofReceipt || {};
    var missing = [].concat(
      Array.isArray(r.missing) ? r.missing : [],
      Array.isArray(r.unresolvedNames)
        ? r.unresolvedNames.map(function (name) { return 'Unresolved pack artifact: ' + name; })
        : []
    );
    var ready = r.status === 'READY';
    return record({
      action: 'Market spritegen proof',
      source: r.showId || 'fight-baijia-elfmage-market-spritegen-2026-11-06',
      status: ready ? 'ok' : 'blocked',
      filesLanded: ready ? ['market-spritegen-proof.json'] : [],
      clipsLoaded: 0,
      imagesLoaded: 0,
      missing: missing,
      warnings: [r.reason || (ready ? 'Ready for handoff via Import pending strip.' : 'Pack is off-disk.')],
      replaceProject: false,
      undoable: false,
    });
  }

  function current() {
    return currentReceipt;
  }

  function dismiss() {
    currentReceipt = null;
    renderReceipt(null);
  }

  function mount() {
    var box = typeof document !== 'undefined' ? document.getElementById('importReceipt') : null;
    if (box && currentReceipt) renderReceipt(currentReceipt);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
    else mount();
  }

  var api = {
    auditProjectAssets: auditProjectAssets,
    missingFromParsedInput: missingFromParsedInput,
    buildReceipt: buildReceipt,
    formatSummary: formatSummary,
    record: record,
    recordMarketSpritegen: recordMarketSpritegen,
    current: current,
    dismiss: dismiss,
  };

  root.HMImportReceipt = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

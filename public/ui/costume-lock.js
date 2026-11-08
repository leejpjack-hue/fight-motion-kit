/*! HM-PF-01 — Dual-cast costume lock pack loader & inspector display (#83).
 * Loads dual-cast costume_lock JSON + sheet/pose refs as a hero plate-pack
 * in the browser composer without backend services or image generation calls.
 */
(function (global) {
  'use strict';

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function basename(p) {
    var s = String(p || '').replace(/\\/g, '/');
    var i = s.lastIndexOf('/');
    return i < 0 ? s : s.slice(i + 1);
  }

  function stem(p) {
    var b = basename(p);
    var i = b.lastIndexOf('.');
    return i <= 0 ? b : b.slice(0, i);
  }

  function slugLockId(raw, fallback) {
    var cleaned = String(raw || '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return /^[a-z0-9][a-z0-9_-]*$/.test(cleaned) ? cleaned : fallback;
  }

  function normalizeRefList(raw, defaultRole, side) {
    if (!raw) return [];
    var items = Array.isArray(raw) ? raw : [raw];
    var out = [];
    items.forEach(function (item, idx) {
      if (typeof item === 'string' && item.trim()) {
        out.push({ id: '', label: '', src: item.trim(), role: defaultRole, side: side || 'duo', index: idx });
      } else if (item && typeof item === 'object' && typeof item.src === 'string' && item.src.trim()) {
        out.push({
          id: typeof item.id === 'string' ? item.id.trim() : '',
          label: typeof item.label === 'string' ? item.label.trim() : (typeof item.name === 'string' ? item.name.trim() : ''),
          src: item.src.trim(),
          role: item.role === 'sheet' || item.role === 'pose_ref' ? item.role : defaultRole,
          side: item.side === 'L' || item.side === 'R' || item.side === 'duo' ? item.side : (side || 'duo'),
          duration_s: Number.isFinite(+item.duration_s) && +item.duration_s >= 0.1 ? +(+item.duration_s).toFixed(4) : null,
          camera: item.camera && typeof item.camera === 'object' ? clone(item.camera) : null,
          fx_hooks: Array.isArray(item.fx_hooks) ? clone(item.fx_hooks) : null,
          caption: typeof item.caption === 'string' ? item.caption : '',
          index: idx,
        });
      }
    });
    return out;
  }

  function extractSideLock(sideKey, charObj, topLockObj, metaLockObj) {
    var ch = (charObj && typeof charObj === 'object') ? charObj : {};
    var chLock = (ch.costume_lock && typeof ch.costume_lock === 'object') ? ch.costume_lock : null;
    var topSide = topLockObj && typeof topLockObj === 'object'
      ? (topLockObj[sideKey] || (topLockObj.cast && topLockObj.cast[sideKey]) || null)
      : null;
    var metaSide = metaLockObj && typeof metaLockObj === 'object'
      ? (metaLockObj[sideKey] || (metaLockObj.cast && metaLockObj.cast[sideKey]) || null)
      : null;
    var topObj = (topSide && typeof topSide === 'object') ? topSide : null;
    var metaObj = (metaSide && typeof metaSide === 'object') ? metaSide : null;

    var rawName = ch.name || (chLock && chLock.name) || (topObj && topObj.name) || (metaObj && metaObj.name) || '';
    var name = typeof rawName === 'string' ? rawName.trim() : '';

    var candidates = [
      ch.costume_id,
      ch.lock_id,
      typeof ch.costume_lock === 'string' ? ch.costume_lock : '',
      chLock && (chLock.costume_id || chLock.lock_id || chLock.id),
      typeof topSide === 'string' ? topSide : '',
      topObj && (topObj.costume_id || topObj.lock_id || topObj.id || (typeof topObj.costume_lock === 'string' ? topObj.costume_lock : '')),
      typeof metaSide === 'string' ? metaSide : '',
      metaObj && (metaObj.costume_id || metaObj.lock_id || metaObj.id || (typeof metaObj.costume_lock === 'string' ? metaObj.costume_lock : '')),
    ];
    var costumeId = '';
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (typeof c === 'string' && c.trim()) {
        costumeId = c.trim();
        break;
      }
    }

    var sheets = []
      .concat(normalizeRefList(ch.sheets || ch.sheet || ch.sheet_ref || (chLock && (chLock.sheets || chLock.sheet || chLock.sheet_ref)), 'sheet', sideKey))
      .concat(normalizeRefList(topObj && (topObj.sheets || topObj.sheet || topObj.sheet_ref), 'sheet', sideKey))
      .concat(normalizeRefList(metaObj && (metaObj.sheets || metaObj.sheet || metaObj.sheet_ref), 'sheet', sideKey));
    var seenSheets = new Set();
    var dedupSheets = sheets.filter(function (r) {
      var k = (r.id || '') + '|' + r.src;
      if (seenSheets.has(k)) return false;
      seenSheets.add(k);
      return true;
    });

    var poseRefs = []
      .concat(normalizeRefList(ch.pose_refs || ch.poses || (chLock && (chLock.pose_refs || chLock.poses)), 'pose_ref', sideKey))
      .concat(normalizeRefList(topObj && (topObj.pose_refs || topObj.poses), 'pose_ref', sideKey))
      .concat(normalizeRefList(metaObj && (metaObj.pose_refs || metaObj.poses), 'pose_ref', sideKey));
    var seenPoses = new Set();
    var dedupPoses = poseRefs.filter(function (r) {
      var k = (r.id || '') + '|' + r.src;
      if (seenPoses.has(k)) return false;
      seenPoses.add(k);
      return true;
    });

    return { side: sideKey, name: name, costume_id: costumeId, sheets: dedupSheets, pose_refs: dedupPoses };
  }

  function costumeLockInfo(show) {
    var s = (show && typeof show === 'object') ? show : {};
    var chars = (s.chars && typeof s.chars === 'object') ? s.chars : {};
    var topLock = (s.costume_lock && typeof s.costume_lock === 'object')
      ? s.costume_lock
      : ((s.lock_pack && typeof s.lock_pack === 'object') ? s.lock_pack : null);
    var meta = (s.meta && typeof s.meta === 'object') ? s.meta : {};
    var metaLock = (meta.costume_lock && typeof meta.costume_lock === 'object')
      ? meta.costume_lock
      : ((meta.lock_pack && typeof meta.lock_pack === 'object') ? meta.lock_pack : null);
    var L = extractSideLock('L', chars.L, topLock, metaLock);
    var R = extractSideLock('R', chars.R, topLock, metaLock);
    var rawPackId = (topLock && (topLock.pack_id || topLock.id)) || (metaLock && (metaLock.pack_id || metaLock.id)) || (typeof s.costume_lock === 'string' ? s.costume_lock : '');
    var packId = typeof rawPackId === 'string' ? rawPackId.trim() : '';
    return {
      active: Boolean(L.costume_id || R.costume_id),
      dualLocked: Boolean(L.costume_id && R.costume_id),
      pack_id: packId,
      L: L,
      R: R,
    };
  }

  function hasCastLockSignals(side) {
    if (!side) return false;
    if (typeof side === 'string') return Boolean(side.trim());
    if (typeof side !== 'object') return false;
    return Boolean(
      side.costume_id || side.lock_id || side.costume_lock || side.id ||
      side.sheet || side.sheets || side.sheet_ref || side.pose_refs || side.poses
    );
  }

  function isCostumeLockPackInput(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
    if (input.show && typeof input.show === 'object') return false;
    if (input.show_id && Array.isArray(input.atoms)) return false;
    if (input.kind === 'costume_lock' || input.kind === 'hm-costume-lock-pack' || input.schema === 'hm-costume-lock/v1') return true;
    var cast = input.cast || input.chars || input.costume_lock || input.lock_pack;
    if (!cast || typeof cast !== 'object' || Array.isArray(cast)) return false;
    if (!(cast.L || cast.R)) return false;
    return hasCastLockSignals(cast.L) || hasCastLockSignals(cast.R) || Boolean(input.sheets || input.pose_refs);
  }

  function assertLocalLockAssetPath(src, label, assets) {
    if (typeof src !== 'string' || !src.trim()) {
      throw new Error('Costume lock ' + label + ' requires a non-empty local image path.');
    }
    var v = src.trim();
    if (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(v)) return v;
    if (/^(javascript:|https?:|\/\/|data:)/i.test(v) || v.includes('..') || v.includes('\\')) {
      throw new Error('Costume lock ' + label + ' contains a nonlocal or unsafe asset URL (' + v + '). Use local or embedded PNG, JPG, or WebP images.');
    }
    if (!/^[A-Za-z0-9_./-]+$/.test(v)) {
      throw new Error('Costume lock ' + label + ' has an invalid local path: ' + v);
    }
    if (assets && Object.prototype.hasOwnProperty.call(assets, v)) {
      if (typeof assets[v] !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,/i.test(assets[v])) {
        throw new Error('Embedded costume lock asset "' + v + '" must be base64 PNG, JPG, WebP, or GIF image data.');
      }
    }
    return v;
  }

  function assertSafeLockTree(value) {
    if (typeof value === 'string' && /^(javascript:|https?:|\/\/|data:(?!image\/(png|jpeg|webp|gif);base64,))/i.test(value)) {
      throw new Error('Project contains a nonlocal asset URL. Use embedded PNG, JPG or WebP images.');
    }
    if (value && typeof value === 'object') {
      Object.values(value).forEach(assertSafeLockTree);
    }
  }

  function resolveLocalFileSrc(src, localFiles, assets) {
    var trimmed = String(src || '').trim();
    if (!localFiles || typeof localFiles !== 'object' || !trimmed || /^data:/i.test(trimmed)) return trimmed;
    var lookup = function (key) { return localFiles instanceof Map ? localFiles.get(key) : localFiles[key]; };
    var direct = lookup(trimmed);
    var leaf = basename(trimmed);
    var byLeaf = direct || lookup(leaf);
    if (typeof byLeaf === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/i.test(byLeaf)) {
      var safeKey = /^[A-Za-z0-9_./-]+$/.test(trimmed) && !trimmed.includes('..')
        ? trimmed
        : ('costume-lock/' + slugLockId(stem(leaf), 'plate') + '.png');
      assets[safeKey] = byLeaf;
      return safeKey;
    }
    return trimmed;
  }

  function normalizeCostumeLockPack(input, opts) {
    if (!isCostumeLockPackInput(input)) {
      throw new Error('Choose a valid dual-cast costume_lock pack JSON.');
    }
    var options = opts || {};
    var assets = {};
    if (input.assets && typeof input.assets === 'object') {
      for (var _i = 0, entries = Object.entries(input.assets); _i < entries.length; _i++) {
        var k = entries[_i][0], v = entries[_i][1];
        if (typeof v !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,/i.test(v)) {
          throw new Error('Embedded assets must be image data, not external URLs.');
        }
        assets[k] = v;
      }
    }

    var castMap = (input.cast && typeof input.cast === 'object') ? input.cast
      : ((input.chars && typeof input.chars === 'object') ? input.chars : {});
    var topLock = (input.costume_lock && typeof input.costume_lock === 'object') ? input.costume_lock
      : ((input.lock_pack && typeof input.lock_pack === 'object') ? input.lock_pack : castMap);

    var sideL = extractSideLock('L', castMap.L, topLock, null);
    var sideR = extractSideLock('R', castMap.R, topLock, null);

    if (!sideL.costume_id || !sideR.costume_id) {
      throw new Error('Dual-cast costume lock pack requires locked costume IDs for both L and R cast members.');
    }

    var nameL = sideL.name || 'Left Cast';
    var nameR = sideR.name || 'Right Cast';
    var showId = slugLockId(
      input.pack_id || input.show_id || input.id || (topLock && (topLock.pack_id || topLock.id)) || (nameL + '-' + nameR + '-lock'),
      'costume-lock-pack'
    );
    var title = (typeof input.title === 'string' && input.title.trim())
      ? input.title.trim()
      : (nameL + ' vs ' + nameR + ' · Costume lock');
    var venue = typeof input.venue === 'string' && input.venue.trim() ? input.venue.trim() : 'street';
    var defaultProfile = global.HMComposeClient && typeof global.HMComposeClient.defaultFxProfileFor === 'function'
      ? global.HMComposeClient.defaultFxProfileFor(venue)
      : (venue === 'street' || venue === 'classroom' ? 'comic' : 'full');
    var fxProfile = (input.fx_profile === 'comic' || input.fx_profile === 'full') ? input.fx_profile : defaultProfile;

    var sharedSheets = normalizeRefList(input.sheets || (topLock !== castMap && topLock && topLock.sheets), 'sheet', 'duo');
    var sharedPoses = normalizeRefList(input.pose_refs || input.plates || (topLock !== castMap && topLock && topLock.pose_refs), 'pose_ref', 'duo');

    var usedPlateIds = new Set();
    var registerRef = function (ref, prefix, seq) {
      var resolved = resolveLocalFileSrc(ref.src, options.localFiles, assets);
      var checkedSrc = assertLocalLockAssetPath(resolved, prefix, assets);
      var baseId = String(ref.id || '').trim().replace(/[^A-Za-z0-9_-]+/g, '_');
      if (!baseId) baseId = prefix + '_' + String(seq).padStart(2, '0');
      var pid = baseId;
      var bump = 2;
      while (usedPlateIds.has(pid)) {
        pid = baseId + '_' + bump++;
      }
      usedPlateIds.add(pid);
      return Object.assign({}, ref, {
        plateId: pid,
        src: checkedSrc,
        label: ref.label || pid,
      });
    };

    var sheetsL = sideL.sheets.map(function (r, i) { return registerRef(r, 'L_SHEET', i + 1); });
    var sheetsR = sideR.sheets.map(function (r, i) { return registerRef(r, 'R_SHEET', i + 1); });
    var sheetsShared = sharedSheets.map(function (r, i) { return registerRef(r, 'SHEET', i + 1); });
    var posesL = sideL.pose_refs.map(function (r, i) { return registerRef(r, 'L_POSE', i + 1); });
    var posesR = sideR.pose_refs.map(function (r, i) { return registerRef(r, 'R_POSE', i + 1); });
    var posesShared = sharedPoses.map(function (r, i) { return registerRef(r, 'POSE', i + 1); });

    var allSheets = sheetsL.concat(sheetsR, sheetsShared);
    var interleavedPoses = [];
    var maxSidePoses = Math.max(posesL.length, posesR.length);
    for (var pIdx = 0; pIdx < maxSidePoses; pIdx++) {
      if (posesL[pIdx]) interleavedPoses.push(posesL[pIdx]);
      if (posesR[pIdx]) interleavedPoses.push(posesR[pIdx]);
    }
    posesShared.forEach(function (p) { interleavedPoses.push(p); });

    var allRefs = allSheets.concat(interleavedPoses);
    if (!allRefs.length) {
      throw new Error('Costume lock pack needs at least one sheet or pose ref image.');
    }

    var layoutSource = 'costume-lock-' + showId + '.layout.json';
    var layoutMap = {};
    var media = [];
    allRefs.forEach(function (ref, idx) {
      layoutMap[ref.plateId] = {
        full: ref.src,
        role: ref.role,
        side: ref.side,
      };
      var sideLockId = ref.side === 'L' ? sideL.costume_id : (ref.side === 'R' ? sideR.costume_id : '');
      var displayName = ref.label && ref.label !== ref.plateId ? (ref.plateId + ' · ' + ref.label) : ref.plateId;
      var item = {
        id: 'lock-media-' + (idx + 1) + '-' + ref.plateId.toLowerCase(),
        name: displayName,
        src: ref.src,
        layoutSource: layoutSource,
        plateId: ref.plateId,
        role: ref.role,
        side: ref.side,
      };
      if (sideLockId) item.costume_id = sideLockId;
      media.push(item);
    });

    var timelineSource = interleavedPoses.length ? interleavedPoses : allSheets;
    var defaultDur = Number.isFinite(+input.default_duration_s) && +input.default_duration_s >= 0.1
      ? +(+input.default_duration_s).toFixed(4)
      : 0.625;
    var atoms = timelineSource.map(function (ref, idx) {
      var atom = {
        id: 'lock-beat-' + String(idx + 1).padStart(2, '0'),
        label: ref.label || ref.plateId,
        kind: 'duo',
        duration_s: ref.duration_s || defaultDur,
        plates_needed: 1,
        pose_mode: 'hero',
        motion: { family: 'fight', beat_class: 'straight' },
        hero: {
          layout_source: layoutSource,
          plates: [ref.plateId],
        },
        camera: ref.camera || { preset: 'static_hold' },
        fx_hooks: ref.fx_hooks || [],
      };
      if (ref.caption) atom.caption = ref.caption;
      return atom;
    });

    var bg = {};
    if (input.bg && typeof input.bg === 'object') {
      if (typeof input.bg.base === 'string' && input.bg.base.trim()) {
        var bgResolved = resolveLocalFileSrc(input.bg.base, options.localFiles, assets);
        bg.base = assertLocalLockAssetPath(bgResolved, 'bg.base', assets);
      }
      if (typeof input.bg.swap === 'string' && input.bg.swap.trim()) {
        var swapResolved = resolveLocalFileSrc(input.bg.swap, options.localFiles, assets);
        bg.swap = assertLocalLockAssetPath(swapResolved, 'bg.swap', assets);
      }
      if (input.bg.swap_t != null && Number.isFinite(+input.bg.swap_t) && bg.swap) {
        bg.swap_t = +input.bg.swap_t;
      }
    }

    var toManifestItem = function (r) { return { id: r.plateId, label: r.label, src: r.src }; };
    var charL = { name: nameL, costume_id: sideL.costume_id, costume_lock: sideL.costume_id };
    if (sheetsL[0]) charL.image = sheetsL[0].src;
    var charR = { name: nameR, costume_id: sideR.costume_id, costume_lock: sideR.costume_id };
    if (sheetsR[0]) charR.image = sheetsR[0].src;

    var lockManifest = {
      kind: 'costume_lock',
      import_review: 'required',
      version: Number.isInteger(input.version) ? input.version : 1,
      pack_id: showId,
      L: {
        name: nameL,
        costume_id: sideL.costume_id,
        sheets: sheetsL.map(toManifestItem),
        pose_refs: posesL.map(toManifestItem),
      },
      R: {
        name: nameR,
        costume_id: sideR.costume_id,
        sheets: sheetsR.map(toManifestItem),
        pose_refs: posesR.map(toManifestItem),
      },
    };
    if (sheetsShared.length) lockManifest.sheets = sheetsShared.map(toManifestItem);
    if (posesShared.length) lockManifest.pose_refs = posesShared.map(toManifestItem);

    var show = {
      show_id: showId,
      title: title,
      venue: venue,
      fx_profile: fxProfile,
      draft: true,
      grounded: true,
      compose_mode: 'parity',
      parity_mode: true,
      plate_pack: true,
      chars: { L: charL, R: charR },
      costume_lock: lockManifest,
      bg: bg,
      overlays: [],
      atoms: atoms,
    };

    var layouts = {};
    layouts[layoutSource] = layoutMap;
    return {
      version: 1,
      show: show,
      layouts: layouts,
      media: media,
      assets: assets,
    };
  }

  function installOnComposeClient(client) {
    if (!client) return;
    client.costumeLockInfo = costumeLockInfo;
    client.isCostumeLockPackInput = isCostumeLockPackInput;
    client.normalizeCostumeLockPack = normalizeCostumeLockPack;
    client.charHonesty = function charHonestyWithLocks(show) {
      var lock = costumeLockInfo(show);
      var parity = typeof client.isPlatePackShow === 'function' ? client.isPlatePackShow(show) : false;
      return {
        L: { side: 'L', name: lock.L.name, costume_id: lock.L.costume_id, sheets: lock.L.sheets.length, pose_refs: lock.L.pose_refs.length },
        R: { side: 'R', name: lock.R.name, costume_id: lock.R.costume_id, sheets: lock.R.sheets.length, pose_refs: lock.R.pose_refs.length },
        parity: parity,
        locked: lock.active,
        dualLocked: lock.dualLocked,
        pack_id: lock.pack_id,
      };
    };
  }

  if (global.HMComposeClient) {
    installOnComposeClient(global.HMComposeClient);
  }

  var COSTUME_LOCK_PRESET_ID = 'daiyu-wang-costume-lock';
  var COSTUME_LOCK_PRESET_URL = '/presets/costume_lock_dual_cast.json';

  function mountCostumeLockUi() {
    var S = global.HMStudio;
    if (!S || typeof document === 'undefined') return;
    var $ = S.$;

    if (document.head && !document.getElementById('hmCostumeLockStyle')) {
      var style = document.createElement('style');
      style.id = 'hmCostumeLockStyle';
      style.textContent = '.char-lock-row{margin-top:-2px;margin-bottom:8px}.char-lock-pill{font:600 10px/1.3 ui-monospace,SFMono-Regular,monospace;color:var(--accent);background:var(--shell-accent-dim);border:1px solid var(--shell-shot-line);padding:1px 6px;border-radius:4px;max-width:100%;overflow-wrap:anywhere;text-align:right}';
      document.head.append(style);
    }

    function syncCostumeLockInspector() {
      var box = $('charHonesty');
      if (!box) return;
      var proj = S.project;
      var show = proj && proj.show;
      var honesty = show ? global.HMComposeClient.charHonesty(show) : null;
      var visible = !!(honesty && (honesty.parity || honesty.locked));
      box.hidden = !visible;
      box.dataset.costumeLocked = String(!!(honesty && honesty.locked));
      box.dataset.dualLocked = String(!!(honesty && honesty.dualLocked));
      if (!visible) return;
      if ($('charNameL')) $('charNameL').textContent = honesty.L.name;
      if ($('charNameR')) $('charNameR').textContent = honesty.R.name;
      if ($('charLockRowL')) $('charLockRowL').hidden = !honesty.locked;
      if ($('charLockRowR')) $('charLockRowR').hidden = !honesty.locked;
      if ($('charLockL')) $('charLockL').textContent = honesty.L.costume_id || 'unlocked';
      if ($('charLockR')) $('charLockR').textContent = honesty.R.costume_id || 'unlocked';
      var meta = $('charLockMeta');
      if (meta) {
        meta.hidden = !honesty.locked;
        if (honesty.locked) {
          var fmt = function (side, info) {
            return side + ': ' + info.sheets + ' sheet' + (info.sheets === 1 ? '' : 's') + ', ' + info.pose_refs + ' pose ref' + (info.pose_refs === 1 ? '' : 's');
          };
          meta.textContent = 'Costume lock · ' + fmt('L', honesty.L) + ' · ' + fmt('R', honesty.R) + ' · Plate swap keeps lock IDs.';
        } else {
          meta.textContent = '';
        }
      }
      if (!honesty.parity && $('charHonestyNote') && !$('charHonestyNote').textContent) {
        $('charHonestyNote').textContent = 'Labels match show.chars. This plate is unsided, so the names identify who is on screen left and screen right.';
      }
    }

    function syncMediaCardRoles() {
      var grid = $('mediaGrid');
      var proj = S.project;
      if (!grid || !proj || !Array.isArray(proj.media)) return;
      var search = $('mediaSearch');
      var query = search ? String(search.value || '').toLowerCase() : '';
      var filtered = proj.media.filter(function (m) { return String(m.name || '').toLowerCase().includes(query); });
      var cards = grid.querySelectorAll('.media-card');
      cards.forEach(function (card, idx) {
        var m = filtered[idx];
        if (!m) return;
        if (m.role) card.dataset.lockRole = m.role;
        else delete card.dataset.lockRole;
        if (m.side) card.dataset.lockSide = m.side;
        else delete card.dataset.lockSide;
        if (m.costume_id) card.dataset.costumeId = m.costume_id;
        else delete card.dataset.costumeId;
      });
    }

    function refreshAll() {
      syncCostumeLockInspector();
      syncMediaCardRoles();
    }

    async function builtInCostumeLock() {
      var res = await fetch(COSTUME_LOCK_PRESET_URL);
      if (!res.ok) throw new Error('Could not open ' + COSTUME_LOCK_PRESET_URL + ' (' + res.status + ')');
      var raw = await res.json();
      var sample = normalizeCostumeLockPack(raw);
      sample.show.costume_lock.import_review = 'builtin-sample';
      return sample;
    }

    function prepareIncomingProject(p) {
      if (isCostumeLockPackInput(p)) {
        throw new Error('Costume sheet review is required before import. Use Open project and select the JSON, sheets, and locked references together.');
      }
      var next = p;
      if (next && next.show) {
        if (next.show.costume_lock && next.show.costume_lock.import_review === 'required') {
          throw new Error('Costume sheet review is required before import. Open the original standalone costume_lock JSON with its sheets and locked references.');
        }
        if (next.show.chars) assertSafeLockTree(next.show.chars);
        if (next.show.costume_lock) assertSafeLockTree(next.show.costume_lock);
        if (next.show.lock_pack) assertSafeLockTree(next.show.lock_pack);
      }
      return next;
    }

    var origLoad = S.load;
    S.load = function loadWithCostumeLock(p) {
      return origLoad(prepareIncomingProject(p));
    };

    var origOpenProject = S.openProject;
    S.openProject = function openProjectWithCostumeLock(source) {
      var wrapped = (source && typeof source.then === 'function')
        ? source.then(prepareIncomingProject)
        : Promise.resolve(source).then(prepareIncomingProject);
      return origOpenProject(wrapped);
    };

    var origOpenRefB = S.openReferenceB;
    if (typeof origOpenRefB === 'function') {
      S.openReferenceB = function openRefBWithCostumeLock(source, kind, valueKey) {
        var wrapped = (source && typeof source.then === 'function')
          ? source.then(prepareIncomingProject)
          : Promise.resolve(source).then(prepareIncomingProject);
        return origOpenRefB(wrapped, kind, valueKey);
      };
    }

    S.builtInCostumeLock = builtInCostumeLock;
    Object.defineProperty(S, 'costumeLock', {
      configurable: true,
      enumerable: true,
      get: function () {
        var proj = S.project;
        return proj && proj.show ? costumeLockInfo(proj.show) : null;
      },
    });

    S.on('loadCostumeLock', function () {
      return S.openProject(builtInCostumeLock());
    });

    global.addEventListener('hm:projectchange', refreshAll);
    if ($('mediaSearch')) {
      $('mediaSearch').addEventListener('input', syncMediaCardRoles);
    }
    if ($('mediaGrid') && typeof MutationObserver === 'function') {
      var obs = new MutationObserver(syncMediaCardRoles);
      obs.observe($('mediaGrid'), { childList: true });
    }

    refreshAll();
    if (global.ready && typeof global.ready.then === 'function') {
      global.ready = global.ready.then(async function (res) {
        var sid = new URLSearchParams(global.location ? global.location.search : '').get('show');
        if (sid === COSTUME_LOCK_PRESET_ID && (!S.project || S.project.show.show_id !== COSTUME_LOCK_PRESET_ID)) {
          await S.load(await builtInCostumeLock());
        }
        refreshAll();
        return res;
      });
    }
  }

  if (typeof document !== 'undefined') {
    if (global.HMStudio) {
      mountCostumeLockUi();
    } else {
      document.addEventListener('DOMContentLoaded', mountCostumeLockUi, { once: true });
    }
  }

  global.HMCostumeLock = {
    COSTUME_LOCK_PRESET_ID: COSTUME_LOCK_PRESET_ID,
    costumeLockInfo: costumeLockInfo,
    isCostumeLockPackInput: isCostumeLockPackInput,
    normalizeCostumeLockPack: normalizeCostumeLockPack,
    installOnComposeClient: installOnComposeClient,
  };
})(typeof window !== 'undefined' ? window : globalThis);

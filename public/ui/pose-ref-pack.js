/*! HM-PF-04 — Pose-ref plate pack from locked OpenPose WORK (#86).
 * Maps proven OpenPose pose ids onto camera-ready hero plate slots and loads
 * them through the HM-PF-01 costume-lock plate-pack path. No image generation.
 */
(function (global) {
  'use strict';

  var POSE_PACK_ID = 'daiyu-wang-10s-kicks-pose-pack';
  var POSE_PACK_URL = '/presets/openpose_10s_kicks_pose_pack.json';
  // Captured before app.js boot rewrites ?show= to whatever project it loads first.
  var INITIAL_SHOW = '';
  if (typeof location !== 'undefined' && location.search) {
    INITIAL_SHOW = new URLSearchParams(location.search).get('show') || '';
  }

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function isPoseRefPlatePack(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
    if (input.show && typeof input.show === 'object') return false;
    return input.kind === 'pose_ref_plate_pack' || input.schema === 'hm-pose-ref-plate-pack/v1';
  }

  function sideOf(input, key) {
    var cast = input && input.cast && typeof input.cast === 'object' ? input.cast : {};
    var side = cast[key] && typeof cast[key] === 'object' ? cast[key] : {};
    return {
      name: typeof side.name === 'string' ? side.name.trim() : '',
      costume_id: typeof side.costume_id === 'string' ? side.costume_id.trim() : '',
    };
  }

  function assertSlot(slot, index, seen) {
    if (!slot || typeof slot !== 'object') throw new Error('Pose-ref slot ' + (index + 1) + ' is missing.');
    var poseId = typeof slot.pose_id === 'string' ? slot.pose_id.trim() : '';
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(poseId)) {
      throw new Error('Pose id must be a plate-slot id (letters, numbers, hyphens, underscores).');
    }
    if (seen.has(poseId)) throw new Error('Duplicate pose id: ' + poseId);
    seen.add(poseId);
    var src = typeof slot.src === 'string' ? slot.src.trim() : '';
    if (!src) throw new Error('Pose ' + poseId + ' needs a local plate image.');
    var dur = +slot.duration_s;
    if (!Number.isFinite(dur) || dur < 0.1) throw new Error('Pose ' + poseId + ' needs a duration of at least 0.1 seconds.');
    var cam = slot.camera && typeof slot.camera === 'object' ? slot.camera : null;
    var preset = cam && typeof cam.preset === 'string' ? cam.preset.trim() : '';
    if (!preset) throw new Error('Pose ' + poseId + ' needs a camera preset so the plate slot is camera-ready.');
    var beat = typeof slot.beat_id === 'string' && /^[A-Za-z0-9_-]+$/.test(slot.beat_id.trim())
      ? slot.beat_id.trim()
      : ('pose-beat-' + String(index + 1).padStart(2, '0'));
    return { poseId: poseId, src: src, dur: dur, preset: preset, beat: beat, camera: clone(cam), label: typeof slot.label === 'string' && slot.label.trim() ? slot.label.trim() : poseId };
  }

  function normalizePoseRefPlatePack(input, opts) {
    if (!isPoseRefPlatePack(input)) throw new Error('Choose a valid OpenPose pose-ref plate pack JSON.');
    var client = global.HMComposeClient;
    if (!client || typeof client.normalizeCostumeLockPack !== 'function') {
      throw new Error('Pose-ref plate pack needs the costume-lock plate-pack loader.');
    }
    var left = sideOf(input, 'L');
    var right = sideOf(input, 'R');
    if (!left.costume_id || !right.costume_id) {
      throw new Error('Pose-ref plate pack requires locked costume IDs for both L and R.');
    }
    var rawSlots = Array.isArray(input.slots) ? input.slots : [];
    if (!rawSlots.length) throw new Error('Pose-ref plate pack needs at least one pose id.');
    var seen = new Set();
    var seenBeats = new Set();
    var slots = rawSlots.map(function (slot, index) {
      var row = assertSlot(slot, index, seen);
      if (seenBeats.has(row.beat)) throw new Error('Duplicate beat id: ' + row.beat);
      seenBeats.add(row.beat);
      return row;
    });

    var lockInput = {
      kind: 'costume_lock',
      version: Number.isInteger(input.version) ? input.version : 1,
      pack_id: input.pack_id || input.id || POSE_PACK_ID,
      title: typeof input.title === 'string' && input.title.trim() ? input.title.trim() : 'OpenPose pose-ref plate pack',
      venue: typeof input.venue === 'string' && input.venue.trim() ? input.venue.trim() : 'street',
      fx_profile: input.fx_profile === 'full' ? 'full' : 'comic',
      cast: {
        L: { name: left.name || 'Left', costume_id: left.costume_id },
        R: { name: right.name || 'Right', costume_id: right.costume_id },
      },
      // Shared duo plates: one cleared pose image per pose id. FX hooks from the
      // source motion are not copied (no dust / fire / light / pink-slash overlays).
      pose_refs: slots.map(function (row) {
        return {
          id: row.poseId,
          label: row.label,
          src: row.src,
          duration_s: row.dur,
          camera: { preset: row.preset, params: row.camera.params },
          role: 'pose_ref',
          side: 'duo',
        };
      }),
    };
    if (input.bg && typeof input.bg === 'object') {
      lockInput.bg = {};
      if (typeof input.bg.base === 'string') lockInput.bg.base = input.bg.base;
      if (typeof input.bg.swap === 'string') lockInput.bg.swap = input.bg.swap;
      if (input.bg.swap_t != null) lockInput.bg.swap_t = input.bg.swap_t;
    }

    var project = client.normalizeCostumeLockPack(lockInput, opts || {});
    var show = project.show;
    show.fx_profile = lockInput.fx_profile;
    if (show.costume_lock) show.costume_lock.import_review = 'reused-cleared-art';
    if (input.bg && input.bg.key_white === true) show.bg.key_white = true;
    if (input.bg && input.bg.motion && typeof input.bg.motion === 'object') show.bg.motion = clone(input.bg.motion);
    if (input.bg && input.bg.crops && typeof input.bg.crops === 'object') show.bg.crops = clone(input.bg.crops);

    var mapped = slots.map(function (row, index) {
      var atom = show.atoms[index];
      atom.id = row.beat;
      atom.label = row.label;
      atom.fx_hooks = [];
      if (!atom.hero || !Array.isArray(atom.hero.plates) || atom.hero.plates[0] !== row.poseId) {
        throw new Error('Pose ' + row.poseId + ' did not map to its plate slot.');
      }
      if (!atom.camera || atom.camera.preset !== row.preset) {
        throw new Error('Pose ' + row.poseId + ' plate slot is missing camera preset ' + row.preset + '.');
      }
      var media = (project.media || []).find(function (item) { return item.plateId === row.poseId; });
      return {
        pose_id: row.poseId,
        plate_id: atom.hero.plates[0],
        beat_id: atom.id,
        camera_preset: atom.camera.preset,
        src: media ? media.src : row.src,
        duration_s: atom.duration_s,
      };
    });

    show.pose_ref_pack = {
      kind: 'pose_ref_plate_pack',
      source: typeof input.source === 'string' ? input.source : '',
      pack_id: show.show_id,
      art: 'cleared-plates-no-regen',
      slots: mapped,
    };
    return project;
  }

  function poseRefSlotMap(project) {
    var show = project && project.show;
    var pack = show && show.pose_ref_pack;
    return pack && Array.isArray(pack.slots) ? pack.slots : [];
  }

  function installOnComposeClient(client) {
    if (!client) return;
    client.isPoseRefPlatePack = isPoseRefPlatePack;
    client.normalizePoseRefPlatePack = normalizePoseRefPlatePack;
    client.poseRefSlotMap = poseRefSlotMap;
  }

  if (global.HMComposeClient) installOnComposeClient(global.HMComposeClient);

  function mountPoseRefPackUi() {
    var S = global.HMStudio;
    if (!S || typeof document === 'undefined') return;
    var $ = S.$;

    function syncPosePackNote() {
      var meta = $('poseRefPackMeta');
      if (!meta) return;
      var slots = poseRefSlotMap(S.project);
      var pack = S.project && S.project.show && S.project.show.pose_ref_pack;
      meta.hidden = !slots.length;
      if (!slots.length) {
        meta.textContent = '';
        return;
      }
      var head = slots.slice(0, 3).map(function (slot) { return slot.pose_id + '→' + slot.camera_preset; }).join(', ');
      meta.textContent = 'OpenPose pose pack · ' + slots.length + ' pose ids on camera-ready plates'
        + (pack && pack.source ? ' · ' + pack.source : '')
        + ' · ' + head + (slots.length > 3 ? '…' : '');
    }

    async function builtInPosePack() {
      var res = await fetch(POSE_PACK_URL);
      if (!res.ok) throw new Error('Could not open ' + POSE_PACK_URL + ' (' + res.status + ')');
      return normalizePoseRefPlatePack(await res.json());
    }

    S.builtInPosePack = builtInPosePack;
    S.on('loadPoseRefPack', async function () {
      var opened = await S.openProject(builtInPosePack());
      if (opened && global.HMImportReceipt && S.project) {
        var audit = global.HMImportReceipt.auditProjectAssets(S.project, { isBuiltIn: true });
        global.HMImportReceipt.record({
          action: 'Pose-ref plate pack',
          source: S.project.show.show_id,
          status: audit.missingRefs.length ? 'partial' : 'ok',
          filesLanded: ['built-in pose-ref plate pack'],
          clipsLoaded: audit.clipsLoaded,
          imagesLoaded: audit.imagesLoaded,
          missing: audit.missingRefs,
          replaceProject: true,
          undoable: false,
        });
      }
      return opened;
    });

    global.addEventListener('hm:projectchange', syncPosePackNote);
    syncPosePackNote();
    if (global.ready && typeof global.ready.then === 'function') {
      global.ready = global.ready.then(async function (res) {
        if (INITIAL_SHOW === POSE_PACK_ID && (!S.project || S.project.show.show_id !== POSE_PACK_ID)) {
          await S.load(await builtInPosePack());
        }
        syncPosePackNote();
        return res;
      });
    }
  }

  if (typeof document !== 'undefined') {
    if (global.HMStudio) mountPoseRefPackUi();
    else document.addEventListener('DOMContentLoaded', mountPoseRefPackUi, { once: true });
  }

  global.HMPoseRefPack = {
    POSE_PACK_ID: POSE_PACK_ID,
    isPoseRefPlatePack: isPoseRefPlatePack,
    normalizePoseRefPlatePack: normalizePoseRefPlatePack,
    poseRefSlotMap: poseRefSlotMap,
    installOnComposeClient: installOnComposeClient,
  };
})(typeof window !== 'undefined' ? window : globalThis);

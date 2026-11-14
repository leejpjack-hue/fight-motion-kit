(function (root) {
  'use strict';

  var SHOW_ID = 'fight-baijia-elfmage-market-spritegen-2026-11-06';
  var ALIASES = [SHOW_ID, 'market-spritegen'];
  var PACK_ROOT = '/workspace/deliverables/fight-baijia-elfmage-market-spritegen-2026-11-06';
  var REQUIRED = [
    PACK_ROOT,
    PACK_ROOT + '/BUILD_STATUS.md',
    PACK_ROOT + '/assets'
  ];
  var UNRESOLVED_WHEN_ROOT_MISSING = ['*.motion.json', 'html'];
  var RECEIPT_URL = '/shows/market-spritegen-proof.json';

  function matchesShow(id) {
    return ALIASES.indexOf(String(id || '')) !== -1;
  }

  function assess(exists) {
    var missing = REQUIRED.filter(function (p) { return !exists(p); });
    var blocked = missing.length > 0;
    return {
      story: 'HM-PF-29',
      step: 6,
      showId: SHOW_ID,
      packRoot: PACK_ROOT,
      status: blocked ? 'BLOCKED_RUNTIME' : 'READY',
      missing: missing,
      unresolvedNames: missing.indexOf(PACK_ROOT) !== -1 ? UNRESOLVED_WHEN_ROOT_MISSING.slice() : [],
      providerCalls: 0,
      replaceProject: false,
      handoff: 'Import pending strip · PNG + JSON',
      bake: blocked ? 'blocked' : 'workers-ui-export',
      artInvented: false
    };
  }

  function statusLine(receipt) {
    if (receipt.status === 'BLOCKED_RUNTIME') {
      return 'BLOCKED_RUNTIME · step 6 market spritegen pack is not on this disk · 5.00s demo stays open · no provider call';
    }
    return 'READY · step 6 market spritegen pack is on disk · use the local strip import · no provider call';
  }

  function fill(dlg, receipt) {
    var status = dlg.querySelector('#marketSpritegenStatus');
    var list = dlg.querySelector('#marketSpritegenMissing');
    if (status) status.textContent = statusLine(receipt);
    if (!list) return;
    list.replaceChildren();
    receipt.missing.forEach(function (p) {
      var li = document.createElement('li');
      li.textContent = p;
      list.append(li);
    });
    (receipt.unresolvedNames || []).forEach(function (name) {
      var li = document.createElement('li');
      li.textContent = receipt.packRoot + '/' + name + ' (name unresolved because the pack directory is missing)';
      list.append(li);
    });
  }

  function loadReceipt() {
    return fetch(RECEIPT_URL).then(function (res) {
      if (!res.ok) throw new Error('Could not open ' + RECEIPT_URL + ' (' + res.status + ')');
      return res.json();
    }).then(function (body) {
      if (!body || body.artInvented || body.providerCalls) {
        throw new Error('Market spritegen proof refused invented art or a provider call.');
      }
      if (body.status !== 'BLOCKED_RUNTIME' && body.status !== 'READY') {
        throw new Error('Market spritegen proof status is not BLOCKED_RUNTIME or READY.');
      }
      return body;
    });
  }

  function openDialog() {
    var dlg = document.getElementById('marketSpritegenDialog');
    if (!dlg) return Promise.resolve();
    return loadReceipt().then(function (receipt) {
      fill(dlg, receipt);
      if (!dlg.open) dlg.showModal();
      var bar = document.getElementById('status');
      if (bar) bar.textContent = statusLine(receipt);
      if (root.HMImportReceipt && typeof root.HMImportReceipt.recordMarketSpritegen === 'function') {
        root.HMImportReceipt.recordMarketSpritegen(receipt);
      }
      return receipt;
    }).catch(function (err) {
      var bar = document.getElementById('status');
      if (bar) bar.textContent = err.message;
      throw err;
    });
  }

  var HANDOFF_URL = '/shows/fight-baijia-elfmage-market-spritegen-handoff.json';

  function assessHandoffProject(project) {
    if (!project || !project.show || project.show.show_id !== SHOW_ID || !Array.isArray(project.show.atoms) || project.show.atoms.length < 8) {
      throw new Error('Market spritegen handoff bundle is incomplete.');
    }
    var assetValues = project.assets ? Object.values(project.assets) : [];
    var embedded = assetValues.filter(function (v) { return typeof v === 'string' && v.indexOf('data:image/') === 0; }).length;
    if (embedded < 8) {
      throw new Error('Market spritegen handoff bundle is missing embedded plate images.');
    }
    var duration = project.show.atoms.reduce(function (s, a) { return s + (Number(a.duration_s) || 0); }, 0);
    return {
      status: 'READY',
      showId: project.show.show_id,
      plates: embedded,
      atoms: project.show.atoms.length,
      durationS: Math.round(duration * 1000) / 1000,
      providerCalls: 0,
      artInvented: false
    };
  }

  function loadLocalHandoff(studio) {
    var S = studio || root.HMStudio;
    if (!S || typeof S.load !== 'function') {
      return Promise.reject(new Error('Studio loader unavailable for local handoff bundle.'));
    }
    return fetch(HANDOFF_URL).then(function (res) {
      if (!res.ok) throw new Error('Market handoff bundle returned ' + res.status);
      return res.json();
    }).then(function (project) {
      var info = assessHandoffProject(project);
      return S.load(project).then(function (loaded) {
        if (root.HMImportReceipt && typeof root.HMImportReceipt.record === 'function') {
          try {
            root.HMImportReceipt.record({
              kind: 'market-spritegen-local-handoff',
              showId: info.showId,
              plates: info.plates,
              providerCalls: 0
            });
          } catch (e) {}
        }
        var dlg = document.getElementById('marketSpritegenDialog');
        if (dlg && dlg.open) dlg.close();
        var msg = 'READY (local handoff · ' + info.plates + ' plates · ' + info.durationS.toFixed(2) + 's · 0 provider calls)';
        var statusEl = document.getElementById('marketSpritegenStatus');
        if (statusEl) statusEl.textContent = msg;
        var bar = document.getElementById('status');
        if (bar) bar.textContent = msg;
        return { loaded: loaded, info: info, project: project };
      });
    });
  }

  function mount() {
    var btn = document.getElementById('openMarketSpritegenProof');
    var handoff = document.getElementById('marketSpritegenHandoff');
    var localBtn = document.getElementById('marketSpritegenLoadLocal');
    if (btn) btn.addEventListener('click', function () { openDialog(); });
    if (handoff) {
      handoff.addEventListener('click', function () {
        var dlg = document.getElementById('marketSpritegenDialog');
        if (dlg && dlg.open) dlg.close();
        var strip = document.getElementById('importStrip');
        if (strip) strip.click();
      });
    }
    if (localBtn) {
      localBtn.addEventListener('click', function () {
        localBtn.disabled = true;
        loadLocalHandoff().catch(function (err) {
          var statusEl = document.getElementById('marketSpritegenStatus');
          if (statusEl) statusEl.textContent = err.message;
        }).finally(function () {
          localBtn.disabled = false;
        });
      });
    }
    var ready = root.ready;
    var after = function () {
      var sid = '';
      try { sid = new URLSearchParams(root.location.search).get('show') || ''; } catch (e) { sid = ''; }
      if (matchesShow(sid)) openDialog();
    };
    if (ready && typeof ready.then === 'function') ready.then(after, after);
    else after();
  }

  root.HMMarketSpritegenProof = {
    SHOW_ID: SHOW_ID,
    ALIASES: ALIASES,
    PACK_ROOT: PACK_ROOT,
    REQUIRED: REQUIRED,
    RECEIPT_URL: RECEIPT_URL,
    HANDOFF_URL: HANDOFF_URL,
    matchesShow: matchesShow,
    assess: assess,
    assessHandoffProject: assessHandoffProject,
    loadLocalHandoff: loadLocalHandoff,
    statusLine: statusLine,
    openDialog: openDialog
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
    else mount();
  }

  if (typeof module !== 'undefined') module.exports = root.HMMarketSpritegenProof;
})(typeof globalThis !== 'undefined' ? globalThis : this);

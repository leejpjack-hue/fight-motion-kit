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
      return receipt;
    }).catch(function (err) {
      var bar = document.getElementById('status');
      if (bar) bar.textContent = err.message;
      throw err;
    });
  }

  function mount() {
    var btn = document.getElementById('openMarketSpritegenProof');
    var handoff = document.getElementById('marketSpritegenHandoff');
    if (btn) btn.addEventListener('click', function () { openDialog(); });
    if (handoff) {
      handoff.addEventListener('click', function () {
        var dlg = document.getElementById('marketSpritegenDialog');
        if (dlg && dlg.open) dlg.close();
        var strip = document.getElementById('importStrip');
        if (strip) strip.click();
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
    matchesShow: matchesShow,
    assess: assess,
    statusLine: statusLine,
    openDialog: openDialog
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
    else mount();
  }

  if (typeof module !== 'undefined') module.exports = root.HMMarketSpritegenProof;
})(typeof globalThis !== 'undefined' ? globalThis : this);

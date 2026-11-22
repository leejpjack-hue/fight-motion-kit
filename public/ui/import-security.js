/* HM-SEC-02/03/04/05: FE-only import sanitizer, image header dimension guard,
 * script/key hardening, project bounds check, and corrupt-draft quarantine. */
(function (root) {
  'use strict';

  var LIMITS = Object.freeze({
    MAX_JSON_DEPTH: 32,
    MAX_JSON_BYTES: 100 * 1024 * 1024,
    MAX_SCAN_CHARS: 25 * 1024 * 1024,
    MAX_IMAGE_DIM: 8192,
    MAX_IMAGE_PIXELS: 33554432,
    MAX_ASSET_COUNT: 150,
    MAX_TOTAL_ASSET_BYTES: 128 * 1024 * 1024,
    MAX_TITLE_LEN: 200,
    MAX_LABEL_LEN: 120,
    MAX_CAPTION_LEN: 300,
  });

  var DANGEROUS_KEYS = { __proto__: 1, constructor: 1, prototype: 1 };
  var ALLOWED_DATA_IMG_RE = /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i;
  var ALLOWED_DATA_PREFIX_RE = /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/i;
  var QUARANTINE_KEY = 'html-motion-composer:quarantine-draft';

  function isDangerousKey(k) {
    return Object.prototype.hasOwnProperty.call(DANGEROUS_KEYS, k);
  }

  function stripDangerousKeys(value, maxDepth, depth) {
    var limit = Number.isInteger(maxDepth) && maxDepth > 0 ? maxDepth : LIMITS.MAX_JSON_DEPTH;
    var cur = depth || 0;
    if (cur > limit) {
      throw new Error('JSON exceeds maximum nesting depth (' + limit + ').');
    }
    if (value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) {
      var arr = new Array(value.length);
      for (var i = 0; i < value.length; i++) {
        arr[i] = stripDangerousKeys(value[i], limit, cur + 1);
      }
      return arr;
    }
    var out = {};
    var keys = Object.keys(value);
    for (var j = 0; j < keys.length; j++) {
      var k = keys[j];
      if (isDangerousKey(k)) continue;
      out[k] = stripDangerousKeys(value[k], limit, cur + 1);
    }
    return out;
  }

  function safeParseJson(text, opts) {
    var options = opts || {};
    if (typeof text !== 'string') throw new Error('Expected JSON text.');
    var maxBytes = Number.isFinite(+options.maxBytes) && +options.maxBytes > 0 ? +options.maxBytes : LIMITS.MAX_JSON_BYTES;
    if (text.length > maxBytes) {
      throw new Error('JSON payload exceeds maximum size (' + maxBytes + ' bytes).');
    }
    var maxDepth = Number.isInteger(options.maxDepth) && options.maxDepth > 0 ? options.maxDepth : LIMITS.MAX_JSON_DEPTH;
    var parsed = JSON.parse(text, function (key, val) {
      if (key && isDangerousKey(key)) return undefined;
      return val;
    });
    return stripDangerousKeys(parsed, maxDepth, 0);
  }

  function isAllowedDataImageUri(uri) {
    return typeof uri === 'string' && ALLOWED_DATA_IMG_RE.test(uri.trim());
  }

  function detectBlockedUriSchemes(text) {
    if (typeof text !== 'string' || !text) return [];
    var checks = [
      { label: 'data:image/svg+xml', re: /data\s*:\s*image\/svg\+xml/i },
      { label: 'data:text/html', re: /data\s*:\s*text\/html/i },
      { label: 'javascript:', re: /(?:src|href|action|data)\s*=\s*["']?\s*javascript\s*:/i },
      { label: 'vbscript:', re: /(?:src|href|action|data)\s*=\s*["']?\s*vbscript\s*:/i },
    ];
    var found = [];
    for (var i = 0; i < checks.length; i++) {
      if (checks[i].re.test(text)) found.push(checks[i].label);
    }
    return found;
  }

  function assertSafeAssetUri(uri, label) {
    var name = label || 'asset';
    if (typeof uri !== 'string' || !uri.trim()) {
      throw new Error('Empty image reference on ' + name + '.');
    }
    var trimmed = uri.trim();
    if (/^(?:javascript|vbscript):/i.test(trimmed)) {
      throw new Error('Blocked unsafe URI scheme on ' + name + '.');
    }
    if (/^data\s*:/i.test(trimmed)) {
      if (/^data\s*:\s*(?:image\/svg\+xml|text\/html)/i.test(trimmed)) {
        throw new Error('Active SVG/HTML data URIs are blocked on ' + name + '; use PNG, JPG, WebP, or GIF.');
      }
      if (!ALLOWED_DATA_PREFIX_RE.test(trimmed)) {
        throw new Error('Unsupported data URI on ' + name + '; use embedded PNG, JPG, WebP, or GIF.');
      }
      return trimmed;
    }
    if (/^(?:https?:|\/\/)/i.test(trimmed)) {
      throw new Error('Nonlocal URL blocked on ' + name + '; use local or embedded images only.');
    }
    return trimmed;
  }

  function sanitizeAssetKey(key) {
    if (typeof key !== 'string') throw new Error('Invalid asset path.');
    var cleaned = key
      .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .trim();
    if (!cleaned) throw new Error('Asset key cannot be empty.');
    var segs = cleaned.split('/');
    for (var i = 0; i < segs.length; i++) {
      if (!segs[i] || segs[i] === '.' || segs[i] === '..') {
        throw new Error('Unsafe relative asset path blocked: ' + key);
      }
    }
    return segs.join('/');
  }

  function decodeBase64PrefixBytes(dataUrl, maxBytes) {
    if (typeof dataUrl !== 'string') return null;
    var comma = dataUrl.indexOf(',');
    if (comma < 0) return null;
    var b64 = dataUrl.slice(comma + 1).replace(/\s+/g, '');
    if (!b64) return null;
    var cap = Number.isInteger(maxBytes) && maxBytes > 0 ? maxBytes : 65536;
    var charLimit = Math.ceil(cap / 3) * 4;
    if (b64.length > charLimit) b64 = b64.slice(0, charLimit);
    while (b64.length % 4 !== 0 && b64.length >= 4) {
      b64 = b64.slice(0, b64.length - (b64.length % 4));
    }
    try {
      if (typeof Buffer === 'function') {
        return new Uint8Array(Buffer.from(b64, 'base64'));
      }
      if (typeof atob === 'function') {
        var bin = atob(b64);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  function u32be(b, o) {
    return ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
  }
  function u16be(b, o) {
    return (b[o] << 8) + b[o + 1];
  }
  function u16le(b, o) {
    return b[o] + (b[o + 1] << 8);
  }
  function u24le(b, o) {
    return b[o] + (b[o + 1] << 8) + (b[o + 2] << 16);
  }

  function inspectImageHeaderBytes(bytes) {
    if (!bytes || bytes.length < 10) return null;
    // PNG
    if (
      bytes.length >= 24 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a &&
      bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52
    ) {
      var pw = u32be(bytes, 16);
      var ph = u32be(bytes, 20);
      return { format: 'png', width: pw, height: ph, pixels: pw * ph };
    }
    // GIF
    if (
      bytes.length >= 10 &&
      bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 &&
      (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
    ) {
      var gw = u16le(bytes, 6);
      var gh = u16le(bytes, 8);
      return { format: 'gif', width: gw, height: gh, pixels: gw * gh };
    }
    // WebP
    if (
      bytes.length >= 30 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    ) {
      if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x58) {
        var xw = 1 + u24le(bytes, 24);
        var xh = 1 + u24le(bytes, 27);
        return { format: 'webp', width: xw, height: xh, pixels: xw * xh };
      }
      if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x4c && bytes[20] === 0x2f) {
        var b0 = bytes[21], b1 = bytes[22], b2 = bytes[23], b3 = bytes[24];
        var lw = 1 + (b0 | ((b1 & 0x3f) << 8));
        var lh = 1 + (((b1 & 0xc0) >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10));
        return { format: 'webp', width: lw, height: lh, pixels: lw * lh };
      }
      if (
        bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x20 &&
        bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a
      ) {
        var vw = u16le(bytes, 26) & 0x3fff;
        var vh = u16le(bytes, 28) & 0x3fff;
        return { format: 'webp', width: vw, height: vh, pixels: vw * vh };
      }
    }
    // JPEG SOF markers
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      var pos = 2;
      while (pos + 8 < bytes.length) {
        if (bytes[pos] !== 0xff) { pos++; continue; }
        while (pos < bytes.length && bytes[pos] === 0xff) pos++;
        if (pos >= bytes.length) break;
        var marker = bytes[pos++];
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
        if (pos + 2 > bytes.length) break;
        var segLen = u16be(bytes, pos);
        if (segLen < 2) break;
        var isSof = (marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSof && pos + 7 <= bytes.length) {
          var jh = u16be(bytes, pos + 3);
          var jw = u16be(bytes, pos + 5);
          return { format: 'jpeg', width: jw, height: jh, pixels: jw * jh };
        }
        pos += segLen;
      }
    }
    return null;
  }

  function assertImageDimensions(dims, label) {
    if (!dims) return null;
    var name = label || 'image';
    if (!Number.isFinite(dims.width) || !Number.isFinite(dims.height) || dims.width <= 0 || dims.height <= 0) {
      throw new Error(name + ' has invalid zero or negative dimensions.');
    }
    if (dims.width > LIMITS.MAX_IMAGE_DIM || dims.height > LIMITS.MAX_IMAGE_DIM || dims.pixels > LIMITS.MAX_IMAGE_PIXELS) {
      throw new Error(
        name +
          ' dimensions (' +
          dims.width +
          '×' +
          dims.height +
          ', ' +
          dims.pixels +
          ' px) exceed the ' +
          LIMITS.MAX_IMAGE_DIM +
          '×' +
          LIMITS.MAX_IMAGE_DIM +
          ' / ' +
          LIMITS.MAX_IMAGE_PIXELS +
          ' px decompression guard.'
      );
    }
    return dims;
  }

  function inspectDataUrlDimensions(dataUrl, label) {
    var safeUri = assertSafeAssetUri(dataUrl, label);
    var bytes = decodeBase64PrefixBytes(safeUri, 65536);
    var dims = inspectImageHeaderBytes(bytes);
    return assertImageDimensions(dims, label);
  }

  function assertProjectAssetBudget(assets, opts) {
    if (!assets || typeof assets !== 'object') return { count: 0, totalBytes: 0 };
    var options = opts || {};
    var maxAssets = Number.isInteger(options.maxAssets) && options.maxAssets > 0 ? options.maxAssets : LIMITS.MAX_ASSET_COUNT;
    var maxTotalBytes = Number.isFinite(+options.maxTotalBytes) && +options.maxTotalBytes > 0 ? +options.maxTotalBytes : LIMITS.MAX_TOTAL_ASSET_BYTES;
    var keys = Object.keys(assets);
    if (keys.length > maxAssets) {
      throw new Error('Project exceeds maximum embedded asset count (' + keys.length + ' > ' + maxAssets + ').');
    }
    var totalBytes = 0;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (isDangerousKey(k)) throw new Error('Unsafe asset key blocked.');
      sanitizeAssetKey(k);
      var val = assets[k];
      if (typeof val !== 'string') continue;
      totalBytes += val.length;
      if (totalBytes > maxTotalBytes) {
        throw new Error('Project embedded assets exceed total memory budget (' + maxTotalBytes + ' bytes).');
      }
      if (/^data:/i.test(val.trim())) {
        inspectDataUrlDimensions(val, k);
      } else {
        assertSafeAssetUri(val, k);
      }
    }
    return { count: keys.length, totalBytes: totalBytes };
  }

  function escapeScriptJson(jsonText) {
    return String(jsonText || '')
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }

  function clampString(val, maxLen) {
    if (typeof val !== 'string') return '';
    return val.length > maxLen ? val.slice(0, maxLen) : val;
  }

  function sanitizeProjectBounds(project) {
    if (!project || typeof project !== 'object' || Array.isArray(project)) {
      throw new Error('Project must be an object.');
    }
    var clean = stripDangerousKeys(project, LIMITS.MAX_JSON_DEPTH, 0);
    if (!clean.show || typeof clean.show !== 'object') {
      throw new Error('Project missing show object.');
    }
    var show = clean.show;
    if (typeof show.title === 'string') show.title = clampString(show.title, LIMITS.MAX_TITLE_LEN);
    var atoms = Array.isArray(show.atoms) ? show.atoms : [];
    for (var i = 0; i < atoms.length; i++) {
      var a = atoms[i];
      if (!a || typeof a !== 'object') throw new Error('Invalid clip at index ' + i + '.');
      if (!Number.isFinite(a.duration_s) || a.duration_s < 0.1 || a.duration_s > 120) {
        throw new Error('Clip ' + (a.id || i) + ' duration_s must be within 0.1–120 seconds.');
      }
      if (a.strip_offset_s !== undefined && a.strip_offset_s !== null) {
        if (!Number.isFinite(a.strip_offset_s) || a.strip_offset_s < 0 || a.strip_offset_s > 120) {
          throw new Error('Clip ' + (a.id || i) + ' strip_offset_s must be within 0–120 seconds.');
        }
      }
      if (typeof a.label === 'string') a.label = clampString(a.label, LIMITS.MAX_LABEL_LEN);
      if (typeof a.caption === 'string') a.caption = clampString(a.caption, LIMITS.MAX_CAPTION_LEN);
    }
    var overlays = Array.isArray(show.overlays) ? show.overlays : [];
    for (var oi = 0; oi < overlays.length; oi++) {
      var o = overlays[oi];
      if (!o || typeof o !== 'object') continue;
      if (o.t_start !== undefined && (!Number.isFinite(+o.t_start) || +o.t_start < 0 || +o.t_start > 120)) {
        throw new Error('Overlay ' + oi + ' has invalid t_start.');
      }
      if (o.t_end !== undefined && (!Number.isFinite(+o.t_end) || +o.t_end < (+o.t_start || 0) || +o.t_end > 120)) {
        throw new Error('Overlay ' + oi + ' has invalid t_end.');
      }
      if (o.x !== undefined && !Number.isFinite(+o.x)) throw new Error('Overlay ' + oi + ' has non-finite x.');
      if (o.y !== undefined && !Number.isFinite(+o.y)) throw new Error('Overlay ' + oi + ' has non-finite y.');
      if (o.z !== undefined && !Number.isFinite(+o.z)) throw new Error('Overlay ' + oi + ' has non-finite z.');
      if (typeof o.text === 'string') o.text = clampString(o.text, LIMITS.MAX_CAPTION_LEN);
    }
    var props = show.fg && Array.isArray(show.fg.props) ? show.fg.props : [];
    for (var fi = 0; fi < props.length; fi++) {
      var fp = props[fi];
      if (!fp || typeof fp !== 'object') continue;
      if (fp.t0 !== undefined && (!Number.isFinite(+fp.t0) || +fp.t0 < 0 || +fp.t0 > 120)) {
        throw new Error('Foreground prop ' + fi + ' has invalid t0.');
      }
      if (fp.t1 !== undefined && (!Number.isFinite(+fp.t1) || +fp.t1 < (+fp.t0 || 0) || +fp.t1 > 120)) {
        throw new Error('Foreground prop ' + fi + ' has invalid t1.');
      }
      if (fp.x !== undefined && !Number.isFinite(+fp.x)) throw new Error('Foreground prop ' + fi + ' has non-finite x.');
      if (fp.y !== undefined && !Number.isFinite(+fp.y)) throw new Error('Foreground prop ' + fi + ' has non-finite y.');
      if (fp.scale !== undefined && (!Number.isFinite(+fp.scale) || +fp.scale <= 0 || +fp.scale > 20)) {
        throw new Error('Foreground prop ' + fi + ' scale must be between 0 and 20.');
      }
    }
    if (clean.assets) assertProjectAssetBudget(clean.assets);
    return clean;
  }

  function compactForQuarantine(rawDraft) {
    if (rawDraft == null) return null;
    try {
      var text = typeof rawDraft === 'string' ? rawDraft : JSON.stringify(rawDraft);
      if (text.length <= 1500000) {
        return typeof rawDraft === 'string' ? rawDraft : JSON.parse(text);
      }
      if (typeof rawDraft === 'object') {
        var copy = Object.assign({}, rawDraft);
        if (copy.assets && typeof copy.assets === 'object') {
          var redacted = {};
          var ks = Object.keys(copy.assets);
          for (var i = 0; i < ks.length; i++) {
            redacted[ks[i]] = '[redacted ' + String(copy.assets[ks[i]] || '').length + ' chars for quarantine]';
          }
          copy.assets = redacted;
        }
        return copy;
      }
      return text.slice(0, 500000);
    } catch (e) {
      return String(rawDraft).slice(0, 20000);
    }
  }

  function quarantineCorruptDraft(storage, rawDraft, reason) {
    if (!storage || typeof storage.setItem !== 'function') return null;
    var entry = {
      ts: new Date().toISOString(),
      reason: String(reason || 'Snapshot failed validation'),
      draft: compactForQuarantine(rawDraft),
    };
    try {
      storage.setItem(QUARANTINE_KEY, JSON.stringify(entry));
    } catch (e) {}
    return entry;
  }

  function readQuarantinedDraft(storage) {
    if (!storage || typeof storage.getItem !== 'function') return null;
    try {
      var raw = storage.getItem(QUARANTINE_KEY);
      if (!raw) return null;
      return safeParseJson(raw, { maxDepth: 32 });
    } catch (e) {
      return null;
    }
  }

  function clearQuarantinedDraft(storage) {
    if (!storage || typeof storage.removeItem !== 'function') return;
    try {
      storage.removeItem(QUARANTINE_KEY);
    } catch (e) {}
  }

  var api = {
    LIMITS: LIMITS,
    QUARANTINE_KEY: QUARANTINE_KEY,
    isDangerousKey: isDangerousKey,
    stripDangerousKeys: stripDangerousKeys,
    safeParseJson: safeParseJson,
    isAllowedDataImageUri: isAllowedDataImageUri,
    detectBlockedUriSchemes: detectBlockedUriSchemes,
    assertSafeAssetUri: assertSafeAssetUri,
    sanitizeAssetKey: sanitizeAssetKey,
    decodeBase64PrefixBytes: decodeBase64PrefixBytes,
    inspectImageHeaderBytes: inspectImageHeaderBytes,
    assertImageDimensions: assertImageDimensions,
    inspectDataUrlDimensions: inspectDataUrlDimensions,
    assertProjectAssetBudget: assertProjectAssetBudget,
    escapeScriptJson: escapeScriptJson,
    sanitizeProjectBounds: sanitizeProjectBounds,
    quarantineCorruptDraft: quarantineCorruptDraft,
    readQuarantinedDraft: readQuarantinedDraft,
    clearQuarantinedDraft: clearQuarantinedDraft,
  };

  root.HMImportSecurity = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

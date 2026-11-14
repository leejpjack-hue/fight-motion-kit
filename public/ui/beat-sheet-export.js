(function (root) {
  'use strict';

  function round4(v) {
    return Math.round((Number(v) || 0) * 10000) / 10000;
  }

  function extractShow(showOrProject) {
    if (!showOrProject || typeof showOrProject !== 'object') return { show_id: 'motion', title: 'Untitled', atoms: [] };
    if (showOrProject.show && Array.isArray(showOrProject.show.atoms)) return showOrProject.show;
    return showOrProject;
  }

  function fallbackPeekPlan(showOrProject, composed) {
    if (root.HMComposeClient && typeof root.HMComposeClient.framePeekPlan === 'function') {
      return root.HMComposeClient.framePeekPlan(showOrProject, composed);
    }
    var show = extractShow(showOrProject);
    var rawAtoms = Array.isArray(show.atoms) ? show.atoms : [];
    var showId = String(show.show_id || 'motion');
    var atoms = [];
    var peeks = [];
    var acc = 0;
    for (var i = 0; i < rawAtoms.length; i++) {
      var a = rawAtoms[i] || {};
      var dur = round4(Number.isFinite(+a.duration_s) && +a.duration_s > 0 ? +a.duration_s : 0.5);
      var t0 = round4(acc);
      var t1 = round4(t0 + dur);
      acc = t1;
      var mid = round4(t0 + dur / 2);
      var endSeek = round4(Math.max(t0, t1 - 1e-4));
      var rawPlus = round4(mid + 0.3);
      var clamped = rawPlus >= t1 - 1e-9;
      var tPlus = clamped ? endSeek : rawPlus;
      var plates = Array.isArray(a.hero && a.hero.plates) ? a.hero.plates : [];
      var plate = plates[0] || a.id || ('P' + String(i + 1).padStart(2, '0'));
      var atomId = a.id || ('atom-' + (i + 1));
      var atomLabel = a.label || atomId;
      var midPeek = {
        index: peeks.length,
        show_id: showId,
        atom_index: i,
        atom_id: atomId,
        atom_label: atomLabel,
        source_plate: plate,
        sample_kind: 'mid',
        offset_label: '+0.0s',
        t0: t0,
        t1: t1,
        duration_s: dur,
        t: mid,
        clamped: false
      };
      var plusPeek = {
        index: peeks.length + 1,
        show_id: showId,
        atom_index: i,
        atom_id: atomId,
        atom_label: atomLabel,
        source_plate: plates[plates.length - 1] || plate,
        sample_kind: 'plus03',
        offset_label: '+0.3s',
        t0: t0,
        t1: t1,
        duration_s: dur,
        t: tPlus,
        clamped: clamped
      };
      atoms.push({ atom_index: i, atom_id: atomId, atom_label: atomLabel, t0: t0, t1: t1, duration_s: dur, source_plate: plate });
      peeks.push(midPeek, plusPeek);
    }
    return { show_id: showId, duration_s: round4(acc), atom_count: atoms.length, peek_count: peeks.length, atoms: atoms, peeks: peeks };
  }

  function planSheets(showOrProject, composed, opts) {
    opts = opts || {};
    var show = extractShow(showOrProject);
    var rawAtoms = Array.isArray(show.atoms) ? show.atoms : [];
    var plan = fallbackPeekPlan(showOrProject, composed);
    var duration = round4(plan.duration_s || rawAtoms.reduce(function (s, a) { return s + (+a.duration_s || 0.5); }, 0));
    var beatPairs = [];
    for (var i = 0; i < plan.atoms.length; i++) {
      var atomInfo = plan.atoms[i];
      var midPeek = plan.peeks[i * 2];
      var plusPeek = plan.peeks[i * 2 + 1];
      var rawAtom = rawAtoms[i] || {};
      beatPairs.push({
        atom_index: i,
        atom_id: atomInfo.atom_id,
        atom_label: atomInfo.atom_label || atomInfo.atom_id,
        plate: atomInfo.source_plate || '',
        camera_preset: (rawAtom.camera && rawAtom.camera.preset) || 'static_hold',
        t0: atomInfo.t0,
        t1: atomInfo.t1,
        duration_s: atomInfo.duration_s,
        mid_t: midPeek ? midPeek.t : round4((atomInfo.t0 + atomInfo.t1) / 2),
        plus_t: plusPeek ? plusPeek.t : round4(Math.max(atomInfo.t0, atomInfo.t1 - 1e-4)),
        clamped: Boolean(plusPeek && plusPeek.clamped),
        filename: 'beats/' + String(i + 1).padStart(2, '0') + '-' + String(atomInfo.atom_id).replace(/[^a-z0-9_-]+/gi, '_') + '.png'
      });
    }

    var delta = Number.isFinite(+opts.cutWindowS) && +opts.cutWindowS > 0 ? +opts.cutWindowS : 0.08;
    var maxSeek = Math.max(0, round4(duration - 1e-4));
    var transitions = [];
    for (var j = 1; j < beatPairs.length; j++) {
      var prev = beatPairs[j - 1];
      var next = beatPairs[j];
      var nextRaw = rawAtoms[j] || {};
      var cutPreset = (nextRaw.cut && nextRaw.cut.preset) || 'hard_cut';
      var boundary = round4(next.t0);
      var preT = round4(Math.max(prev.t0, boundary - delta));
      var atT = round4(Math.min(maxSeek, boundary));
      var postT = round4(Math.min(Math.max(next.t0, next.t1 - 1e-4), boundary + delta));
      transitions.push({
        index: j,
        from_id: prev.atom_id,
        to_id: next.atom_id,
        from_plate: prev.plate,
        to_plate: next.plate,
        cut_preset: cutPreset,
        boundary_t: boundary,
        samples: [
          { kind: 'pre', label: '-' + delta.toFixed(2) + 's', t: preT },
          { kind: 'cut', label: '+0.00s', t: atT },
          { kind: 'post', label: '+' + delta.toFixed(2) + 's', t: postT }
        ],
        filename: 'transitions/' + String(j).padStart(2, '0') + '-' +
          String(prev.atom_id).replace(/[^a-z0-9_-]+/gi, '_') + '-to-' +
          String(next.atom_id).replace(/[^a-z0-9_-]+/gi, '_') + '.png'
      });
    }

    var phoneSpec = {
      width: 360,
      cols: 2,
      pad: 8,
      gap: 6,
      headerH: 26,
      captionH: 18,
      tileW: 169,
      tileH: 95
    };

    return {
      show_id: plan.show_id,
      title: String(show.title || plan.show_id),
      duration_s: duration,
      beatPairs: beatPairs,
      transitions: transitions,
      phoneSpec: phoneSpec
    };
  }

  // Minimal 5x7 ASCII glyph rows (each 5 bits wide x 7 rows)
  var GLYPHS = {
    '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14],
    '2': [14, 17, 1, 2, 4, 8, 31], '3': [31, 2, 4, 2, 1, 17, 14],
    '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 30, 1, 1, 17, 14],
    '6': [6, 8, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8],
    '8': [14, 17, 17, 14, 17, 17, 14], '9': [14, 17, 17, 15, 1, 2, 12],
    'A': [14, 17, 17, 31, 17, 17, 17], 'B': [30, 17, 17, 30, 17, 17, 30],
    'C': [14, 17, 16, 16, 16, 17, 14], 'D': [28, 18, 17, 17, 17, 18, 28],
    'E': [31, 16, 16, 30, 16, 16, 31], 'F': [31, 16, 16, 30, 16, 16, 16],
    'G': [14, 17, 16, 23, 17, 17, 15], 'H': [17, 17, 17, 31, 17, 17, 17],
    'I': [14, 4, 4, 4, 4, 4, 14], 'J': [7, 2, 2, 2, 2, 18, 12],
    'K': [17, 18, 20, 24, 20, 18, 17], 'L': [16, 16, 16, 16, 16, 16, 31],
    'M': [17, 27, 21, 21, 17, 17, 17], 'N': [17, 25, 21, 19, 17, 17, 17],
    'O': [14, 17, 17, 17, 17, 17, 14], 'P': [30, 17, 17, 30, 16, 16, 16],
    'Q': [14, 17, 17, 17, 21, 18, 13], 'R': [30, 17, 17, 30, 20, 18, 17],
    'S': [15, 16, 16, 14, 1, 1, 30], 'T': [31, 4, 4, 4, 4, 4, 4],
    'U': [17, 17, 17, 17, 17, 17, 14], 'V': [17, 17, 17, 17, 17, 10, 4],
    'W': [17, 17, 17, 21, 21, 27, 17], 'X': [17, 17, 10, 4, 10, 17, 17],
    'Y': [17, 17, 10, 4, 4, 4, 4], 'Z': [31, 1, 2, 4, 8, 16, 31],
    '-': [0, 0, 0, 31, 0, 0, 0], '+': [0, 4, 4, 31, 4, 4, 0],
    '.': [0, 0, 0, 0, 0, 12, 12], ':': [0, 12, 12, 0, 12, 12, 0],
    '/': [1, 2, 2, 4, 8, 8, 16], '>': [16, 8, 4, 2, 4, 8, 16],
    '_': [0, 0, 0, 0, 0, 0, 31], ' ': [0, 0, 0, 0, 0, 0, 0]
  };

  function fillRectRgba(buf, W, H, x, y, w, h, c) {
    var x0 = Math.max(0, x | 0);
    var y0 = Math.max(0, y | 0);
    var x1 = Math.min(W, (x + w) | 0);
    var y1 = Math.min(H, (y + h) | 0);
    for (var py = y0; py < y1; py++) {
      var row = py * W * 4;
      for (var px = x0; px < x1; px++) {
        var idx = row + px * 4;
        buf[idx] = c[0];
        buf[idx + 1] = c[1];
        buf[idx + 2] = c[2];
        buf[idx + 3] = c[3] === undefined ? 255 : c[3];
      }
    }
  }

  function drawTextRgba(buf, W, H, x, y, text, color, scale) {
    scale = scale || 1;
    var s = String(text || '').toUpperCase();
    var cx = x | 0;
    for (var i = 0; i < s.length; i++) {
      var g = GLYPHS[s[i]] || GLYPHS[' '];
      for (var r = 0; r < 7; r++) {
        var bits = g[r];
        for (var col = 0; col < 5; col++) {
          if ((bits >> (4 - col)) & 1) {
            fillRectRgba(buf, W, H, cx + col * scale, y + r * scale, scale, scale, color);
          }
        }
      }
      cx += 6 * scale;
      if (cx >= W - 4) break;
    }
  }

  function crc32(buf) {
    var crc = 0xffffffff;
    for (var i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (var b = 0; b < 8; b++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function pngChunk(type, data) {
    var out = new Uint8Array(12 + data.length);
    var len = data.length >>> 0;
    out[0] = (len >>> 24) & 255;
    out[1] = (len >>> 16) & 255;
    out[2] = (len >>> 8) & 255;
    out[3] = len & 255;
    for (var i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    var c = crc32(out.subarray(4, 8 + data.length));
    out[8 + data.length] = (c >>> 24) & 255;
    out[9 + data.length] = (c >>> 16) & 255;
    out[10 + data.length] = (c >>> 8) & 255;
    out[11 + data.length] = c & 255;
    return out;
  }

  function encodeRgbaPngNode(width, height, rgba) {
    var zlib = require('zlib');
    var stride = width * 4 + 1;
    var raw = Buffer.alloc(stride * height);
    for (var y = 0; y < height; y++) {
      raw[y * stride] = 0;
      var srcOff = y * width * 4;
      raw.set(rgba.subarray(srcOff, srcOff + width * 4), y * stride + 1);
    }
    var compressed = zlib.deflateSync(raw, { level: 6 });
    var sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    var ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width >>> 0, 0);
    ihdr.writeUInt32BE(height >>> 0, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;
    return Buffer.concat([sig, Buffer.from(pngChunk('IHDR', ihdr)), Buffer.from(pngChunk('IDAT', compressed)), Buffer.from(pngChunk('IEND', new Uint8Array(0)))]);
  }

  function paeth(a, b, c) {
    var p = a + b - c;
    var pa = Math.abs(p - a);
    var pb = Math.abs(p - b);
    var pc = Math.abs(p - c);
    return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
  }

  function decodePngRgbaNode(bytes) {
    var buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    if (buf.length < 33 || buf[0] !== 137 || buf[1] !== 80 || buf[2] !== 78 || buf[3] !== 71) return null;
    var zlib = require('zlib');
    var pos = 8;
    var width = 0;
    var height = 0;
    var bitDepth = 8;
    var colorType = 6;
    var interlace = 0;
    var idats = [];
    var plte = null;
    while (pos + 8 <= buf.length) {
      var len = buf.readUInt32BE(pos);
      var type = buf.toString('ascii', pos + 4, pos + 8);
      var data = buf.subarray(pos + 8, pos + 8 + len);
      pos += 12 + len;
      if (type === 'IHDR') {
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        bitDepth = data[8];
        colorType = data[9];
        interlace = data[12];
      } else if (type === 'PLTE') {
        plte = data;
      } else if (type === 'IDAT') {
        idats.push(data);
      } else if (type === 'IEND') {
        break;
      }
    }
    if (!width || !height || bitDepth !== 8 || interlace !== 0) return null;
    var bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : colorType === 4 ? 2 : colorType === 3 ? 1 : 0;
    if (!bpp) return null;
    var raw = zlib.inflateSync(Buffer.concat(idats));
    var stride = width * bpp + 1;
    var prev = new Uint8Array(width * bpp);
    var rgba = new Uint8Array(width * height * 4);
    for (var y = 0; y < height; y++) {
      var f = raw[y * stride];
      var line = new Uint8Array(width * bpp);
      for (var i = 0; i < width * bpp; i++) {
        var x = raw[y * stride + 1 + i];
        var left = i >= bpp ? line[i - bpp] : 0;
        var up = prev[i];
        var upLeft = i >= bpp ? prev[i - bpp] : 0;
        if (f === 1) x = (x + left) & 255;
        else if (f === 2) x = (x + up) & 255;
        else if (f === 3) x = (x + ((left + up) >> 1)) & 255;
        else if (f === 4) x = (x + paeth(left, up, upLeft)) & 255;
        line[i] = x;
      }
      prev = line;
      for (var px = 0; px < width; px++) {
        var out = (y * width + px) * 4;
        if (colorType === 6) {
          rgba[out] = line[px * 4]; rgba[out + 1] = line[px * 4 + 1]; rgba[out + 2] = line[px * 4 + 2]; rgba[out + 3] = line[px * 4 + 3];
        } else if (colorType === 2) {
          rgba[out] = line[px * 3]; rgba[out + 1] = line[px * 3 + 1]; rgba[out + 2] = line[px * 3 + 2]; rgba[out + 3] = 255;
        } else if (colorType === 0) {
          var g = line[px]; rgba[out] = g; rgba[out + 1] = g; rgba[out + 2] = g; rgba[out + 3] = 255;
        } else if (colorType === 4) {
          var ga = line[px * 2]; rgba[out] = ga; rgba[out + 1] = ga; rgba[out + 2] = ga; rgba[out + 3] = line[px * 2 + 1];
        } else if (colorType === 3 && plte) {
          var pi = line[px] * 3; rgba[out] = plte[pi] || 0; rgba[out + 1] = plte[pi + 1] || 0; rgba[out + 2] = plte[pi + 2] || 0; rgba[out + 3] = 255;
        }
      }
    }
    return { width: width, height: height, data: rgba };
  }

  function blitScaledRgba(dst, dstW, dstH, dx, dy, dw, dh, srcImg, fallbackTint) {
    if (!srcImg || !srcImg.width || !srcImg.height) {
      fillRectRgba(dst, dstW, dstH, dx, dy, dw, dh, fallbackTint || [42, 54, 62, 255]);
      return;
    }
    var sxMax = srcImg.width - 1;
    var syMax = srcImg.height - 1;
    for (var y = 0; y < dh; y++) {
      var ty = Math.min(syMax, Math.floor((y / Math.max(1, dh)) * srcImg.height));
      for (var x = 0; x < dw; x++) {
        var tx = Math.min(sxMax, Math.floor((x / Math.max(1, dw)) * srcImg.width));
        var si = (ty * srcImg.width + tx) * 4;
        var di = ((dy + y) * dstW + (dx + x)) * 4;
        dst[di] = srcImg.data[si];
        dst[di + 1] = srcImg.data[si + 1];
        dst[di + 2] = srcImg.data[si + 2];
        dst[di + 3] = 255;
      }
    }
  }

  function plateTint(index) {
    var palette = [
      [52, 74, 88, 255], [78, 56, 74, 255], [46, 82, 68, 255], [90, 72, 46, 255],
      [62, 62, 92, 255], [88, 52, 52, 255], [44, 78, 86, 255], [76, 82, 50, 255]
    ];
    return palette[index % palette.length];
  }

  function renderSheetsNode(showOrProject, opts) {
    opts = opts || {};
    var fs = require('fs');
    var path = require('path');
    var assetRoot = opts.assetRoot || '';
    var projectAssets = (showOrProject && showOrProject.assets) || {};
    var layouts = (showOrProject && showOrProject.layouts) || {};
    var plan = planSheets(showOrProject, null, opts);
    var imgCache = {};

    function resolvePlateImage(atomIdx, plateId) {
      var cacheKey = atomIdx + ':' + plateId;
      if (Object.prototype.hasOwnProperty.call(imgCache, cacheKey)) return imgCache[cacheKey];
      var show = extractShow(showOrProject);
      var rawAtom = (show.atoms && show.atoms[atomIdx]) || {};
      var ls = rawAtom.hero && rawAtom.hero.layout_source;
      var candidate = null;
      if (ls && layouts[ls] && layouts[ls][plateId] && layouts[ls][plateId].full) {
        var dir = ls.indexOf('/') >= 0 ? ls.slice(0, ls.lastIndexOf('/') + 1) : '';
        var rel = dir + layouts[ls][plateId].full;
        if (projectAssets[rel] && projectAssets[rel].indexOf('data:image/png;base64,') === 0) {
          candidate = decodePngRgbaNode(Buffer.from(projectAssets[rel].slice('data:image/png;base64,'.length), 'base64'));
        } else if (assetRoot && fs.existsSync(path.join(assetRoot, rel))) {
          candidate = decodePngRgbaNode(fs.readFileSync(path.join(assetRoot, rel)));
        }
      }
      if (!candidate && assetRoot && ls) {
        var rawDir = path.dirname(ls);
        var direct = path.join(assetRoot, rawDir, plateId + '.png');
        if (fs.existsSync(direct)) candidate = decodePngRgbaNode(fs.readFileSync(direct));
      }
      imgCache[cacheKey] = candidate;
      return candidate;
    }

    var files = {};
    var sheetMeta = [];
    // 1. beat-plus-0.3s sheet (1280px wide, 2 columns of (mid + plus) pairs)
    var cols = 2;
    var pairW = 616;
    var tileW = 298;
    var tileH = 168;
    var gap = 12;
    var pad = 16;
    var rowH = 198;
    var headerH = 40;
    var rows = Math.max(1, Math.ceil(plan.beatPairs.length / cols));
    var beatW = 1280;
    var beatH = headerH + rows * rowH + pad;
    var beatBuf = new Uint8Array(beatW * beatH * 4);
    fillRectRgba(beatBuf, beatW, beatH, 0, 0, beatW, beatH, [18, 22, 26, 255]);
    drawTextRgba(beatBuf, beatW, beatH, pad, 14, 'BEAT SHEETS +0.3S  ' + plan.show_id + '  ' + plan.duration_s.toFixed(2) + 'S', [204, 241, 123, 255], 2);
    for (var i = 0; i < plan.beatPairs.length; i++) {
      var bp = plan.beatPairs[i];
      var r = Math.floor(i / cols);
      var c = i % cols;
      var rx = pad + c * (pairW + pad);
      var ry = headerH + r * rowH;
      fillRectRgba(beatBuf, beatW, beatH, rx, ry, pairW, rowH - 8, [28, 34, 40, 255]);
      var plateImg = resolvePlateImage(bp.atom_index, bp.plate);
      blitScaledRgba(beatBuf, beatW, beatH, rx + 6, ry + 20, tileW, tileH, plateImg, plateTint(bp.atom_index));
      blitScaledRgba(beatBuf, beatW, beatH, rx + 6 + tileW + gap, ry + 20, tileW, tileH, plateImg, plateTint(bp.atom_index));
      drawTextRgba(beatBuf, beatW, beatH, rx + 8, ry + 6, bp.atom_id + ' ' + bp.plate + ' MID ' + bp.mid_t.toFixed(2) + 'S', [237, 241, 233, 255], 1);
      drawTextRgba(beatBuf, beatW, beatH, rx + 8 + tileW + gap, ry + 6, '+0.3S ' + bp.plus_t.toFixed(2) + 'S' + (bp.clamped ? ' CLAMP' : ''), [255, 212, 120, 255], 1);

      // Individual beat panel PNG
      var oneW = tileW * 2 + gap + 12;
      var oneH = tileH + 28;
      var oneBuf = new Uint8Array(oneW * oneH * 4);
      fillRectRgba(oneBuf, oneW, oneH, 0, 0, oneW, oneH, [24, 29, 34, 255]);
      blitScaledRgba(oneBuf, oneW, oneH, 4, 22, tileW, tileH, plateImg, plateTint(bp.atom_index));
      blitScaledRgba(oneBuf, oneW, oneH, 8 + tileW, 22, tileW, tileH, plateImg, plateTint(bp.atom_index));
      drawTextRgba(oneBuf, oneW, oneH, 6, 7, bp.atom_id + ' +0.0S=' + bp.mid_t.toFixed(2) + 'S  +0.3S=' + bp.plus_t.toFixed(2) + 'S', [237, 241, 233, 255], 1);
      files[bp.filename] = encodeRgbaPngNode(oneW, oneH, oneBuf);
    }
    files['sheets/beat-plus-0.3s.png'] = encodeRgbaPngNode(beatW, beatH, beatBuf);
    sheetMeta.push({ path: 'sheets/beat-plus-0.3s.png', kind: 'beat-plus-0.3s', width: beatW, height: beatH, panels: plan.beatPairs.length * 2 });

    // 2. transition-strips sheet (1280px wide, 3 frames per boundary)
    var trTileW = 394;
    var trTileH = 140;
    var trRows = Math.max(1, plan.transitions.length);
    var trW = 1280;
    var trH = headerH + trRows * (trTileH + 30) + pad;
    var trBuf = new Uint8Array(trW * trH * 4);
    fillRectRgba(trBuf, trW, trH, 0, 0, trW, trH, [16, 20, 24, 255]);
    drawTextRgba(trBuf, trW, trH, pad, 14, 'TRANSITION STRIPS  ' + plan.show_id + '  CUTS=' + plan.transitions.length, [132, 214, 255, 255], 2);
    for (var ti = 0; ti < plan.transitions.length; ti++) {
      var tr = plan.transitions[ti];
      var ty = headerH + ti * (trTileH + 30);
      fillRectRgba(trBuf, trW, trH, pad, ty, trW - pad * 2, trTileH + 22, [28, 34, 40, 255]);
      drawTextRgba(trBuf, trW, trH, pad + 8, ty + 6, tr.from_id + ' -> ' + tr.to_id + '  T=' + tr.boundary_t.toFixed(2) + 'S  ' + tr.cut_preset, [237, 241, 233, 255], 1);
      var fromImg = resolvePlateImage(tr.index - 1, tr.from_plate);
      var toImg = resolvePlateImage(tr.index, tr.to_plate);
      for (var si = 0; si < tr.samples.length; si++) {
        var sx = pad + 8 + si * (trTileW + 24);
        var sImg = si === 0 ? fromImg : toImg;
        var tintIdx = si === 0 ? tr.index - 1 : tr.index;
        blitScaledRgba(trBuf, trW, trH, sx, ty + 20, trTileW, trTileH - 8, sImg, plateTint(tintIdx));
        drawTextRgba(trBuf, trW, trH, sx + 4, ty + 24, tr.samples[si].label + ' ' + tr.samples[si].t.toFixed(2) + 'S', [255, 255, 255, 255], 1);
      }
      var oneTrW = 1248;
      var oneTrH = trTileH + 24;
      var oneTrBuf = new Uint8Array(oneTrW * oneTrH * 4);
      fillRectRgba(oneTrBuf, oneTrW, oneTrH, 0, 0, oneTrW, oneTrH, [24, 29, 34, 255]);
      drawTextRgba(oneTrBuf, oneTrW, oneTrH, 8, 6, tr.from_id + ' -> ' + tr.to_id + '  T=' + tr.boundary_t.toFixed(2) + 'S', [237, 241, 233, 255], 1);
      for (var sj = 0; sj < tr.samples.length; sj++) {
        blitScaledRgba(oneTrBuf, oneTrW, oneTrH, 8 + sj * (trTileW + 24), 20, trTileW, trTileH - 8, sj === 0 ? fromImg : toImg, plateTint(sj === 0 ? tr.index - 1 : tr.index));
      }
      files[tr.filename] = encodeRgbaPngNode(oneTrW, oneTrH, oneTrBuf);
    }
    files['sheets/transition-strips.png'] = encodeRgbaPngNode(trW, trH, trBuf);
    sheetMeta.push({ path: 'sheets/transition-strips.png', kind: 'transition-strips', width: trW, height: trH, panels: plan.transitions.length * 3 });

    // 3. phone-360w sheet (exact 360px width)
    var ps = plan.phoneSpec;
    var pRows = Math.max(1, plan.beatPairs.length);
    var pW = ps.width; // 360
    var pH = ps.headerH + pRows * (ps.tileH + ps.captionH + ps.gap) + ps.pad;
    var pBuf = new Uint8Array(pW * pH * 4);
    fillRectRgba(pBuf, pW, pH, 0, 0, pW, pH, [16, 19, 22, 255]);
    drawTextRgba(pBuf, pW, pH, ps.pad, 9, 'PHONE 360W  ' + plan.show_id.slice(0, 26), [204, 241, 123, 255], 1);
    for (var pi = 0; pi < plan.beatPairs.length; pi++) {
      var pb = plan.beatPairs[pi];
      var py = ps.headerH + pi * (ps.tileH + ps.captionH + ps.gap);
      var pImg = resolvePlateImage(pb.atom_index, pb.plate);
      fillRectRgba(pBuf, pW, pH, ps.pad - 2, py - 2, pW - ps.pad * 2 + 4, ps.tileH + ps.captionH, [28, 34, 40, 255]);
      blitScaledRgba(pBuf, pW, pH, ps.pad, py, ps.tileW, ps.tileH, pImg, plateTint(pb.atom_index));
      blitScaledRgba(pBuf, pW, pH, ps.pad + ps.tileW + ps.gap, py, ps.tileW, ps.tileH, pImg, plateTint(pb.atom_index));
      drawTextRgba(pBuf, pW, pH, ps.pad + 2, py + ps.tileH + 4, pb.atom_id + ' +0.0 ' + pb.mid_t.toFixed(2) + 'S / +0.3 ' + pb.plus_t.toFixed(2) + 'S', [237, 241, 233, 255], 1);
    }
    files['sheets/phone-360w.png'] = encodeRgbaPngNode(pW, pH, pBuf);
    sheetMeta.push({ path: 'sheets/phone-360w.png', kind: 'phone-360w', width: pW, height: pH, panels: plan.beatPairs.length * 2 });

    var manifest = {
      show_id: plan.show_id,
      title: plan.title,
      duration_s: plan.duration_s,
      sheets: sheetMeta,
      beats: plan.beatPairs,
      transitions: plan.transitions
    };
    files['sheets/manifest.json'] = Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    return { plan: plan, manifest: manifest, files: files };
  }

  function canvasToPngBytes(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) return reject(new Error('Could not encode sheet PNG.'));
        blob.arrayBuffer().then(function (ab) { resolve(new Uint8Array(ab)); }, reject);
      }, 'image/png');
    });
  }

  function renderSheetsInBrowser(studio, opts) {
    opts = opts || {};
    var S = studio || root.HMStudio;
    if (!S || !S.project || !S.project.show) return Promise.reject(new Error('Open a project before exporting beat sheets.'));
    var ensureCompiled = S.composed ? Promise.resolve(S.composed) : S.compile();
    return ensureCompiled.then(function (composed) {
      var activeComposed = S.composed || composed;
      if (!activeComposed) throw new Error('Add at least one clip before exporting sheets.');
      var plan = planSheets(S.project, activeComposed, opts);
      var stageCanvas = document.createElement('canvas');
      stageCanvas.width = 1280;
      stageCanvas.height = 720;
      var renderer = root.HMMotion(stageCanvas, S.project.assets || {});
      return renderer.load(activeComposed).then(function () {
        var uniqueTimes = [];
        var seenT = {};
        function pushT(t) {
          var key = Number(t).toFixed(4);
          if (!seenT[key]) { seenT[key] = true; uniqueTimes.push(Number(t)); }
        }
        plan.beatPairs.forEach(function (bp) { pushT(bp.mid_t); pushT(bp.plus_t); });
        plan.transitions.forEach(function (tr) { tr.samples.forEach(function (s) { pushT(s.t); }); });

        var frameMap = {};
        uniqueTimes.forEach(function (t) {
          S.sampleStageFrameAt(t, { renderer: renderer, standIn: false, onion: false, source: 'beat-sheet-export' });
          var snap = document.createElement('canvas');
          snap.width = 400;
          snap.height = 225;
          snap.getContext('2d').drawImage(stageCanvas, 0, 0, snap.width, snap.height);
          frameMap[Number(t).toFixed(4)] = snap;
        });

        function drawTile(ctx, t, x, y, w, h, label) {
          var src = frameMap[Number(t).toFixed(4)];
          ctx.fillStyle = '#181e24';
          ctx.fillRect(x, y, w, h);
          if (src) ctx.drawImage(src, x, y, w, h);
          ctx.fillStyle = 'rgba(16, 20, 24, 0.78)';
          ctx.fillRect(x, y, w, 18);
          ctx.fillStyle = '#edf1e9';
          ctx.font = '600 11px ui-monospace, monospace';
          ctx.fillText(label, x + 6, y + 13);
        }

        // 1. beat-plus-0.3s.png
        var cols = 2, pairW = 616, tileW = 298, tileH = 168, gap = 12, pad = 16, rowH = 198, headerH = 40;
        var rows = Math.max(1, Math.ceil(plan.beatPairs.length / cols));
        var beatCanvas = document.createElement('canvas');
        beatCanvas.width = 1280;
        beatCanvas.height = headerH + rows * rowH + pad;
        var bctx = beatCanvas.getContext('2d');
        bctx.fillStyle = '#12161a';
        bctx.fillRect(0, 0, beatCanvas.width, beatCanvas.height);
        bctx.fillStyle = '#ccf17b';
        bctx.font = '700 15px system-ui, sans-serif';
        bctx.fillText('Beat +0.3s sheet · ' + plan.show_id + ' · ' + plan.duration_s.toFixed(2) + 's', pad, 25);
        plan.beatPairs.forEach(function (bp, idx) {
          var r = Math.floor(idx / cols), c = idx % cols;
          var rx = pad + c * (pairW + pad), ry = headerH + r * rowH;
          bctx.fillStyle = '#1c2228';
          bctx.fillRect(rx, ry, pairW, rowH - 8);
          drawTile(bctx, bp.mid_t, rx + 6, ry + 14, tileW, tileH, bp.atom_id + ' · ' + bp.plate + ' +0.0s (' + bp.mid_t.toFixed(2) + 's)');
          drawTile(bctx, bp.plus_t, rx + 6 + tileW + gap, ry + 14, tileW, tileH, '+0.3s (' + bp.plus_t.toFixed(2) + 's)' + (bp.clamped ? ' · clamped' : ''));
        });

        // 2. transition-strips.png
        var trTileW = 394, trTileH = 140;
        var trCanvas = document.createElement('canvas');
        trCanvas.width = 1280;
        trCanvas.height = headerH + Math.max(1, plan.transitions.length) * (trTileH + 34) + pad;
        var tctx = trCanvas.getContext('2d');
        tctx.fillStyle = '#101418';
        tctx.fillRect(0, 0, trCanvas.width, trCanvas.height);
        tctx.fillStyle = '#84d6ff';
        tctx.font = '700 15px system-ui, sans-serif';
        tctx.fillText('Transition strips across cuts · ' + plan.show_id + ' (' + plan.transitions.length + ' boundaries)', pad, 25);
        plan.transitions.forEach(function (tr, idx) {
          var ty = headerH + idx * (trTileH + 34);
          tctx.fillStyle = '#1c2228';
          tctx.fillRect(pad, ty, 1280 - pad * 2, trTileH + 26);
          tctx.fillStyle = '#edf1e9';
          tctx.font = '600 12px ui-monospace, monospace';
          tctx.fillText(tr.from_id + ' -> ' + tr.to_id + ' · t=' + tr.boundary_t.toFixed(2) + 's · ' + tr.cut_preset, pad + 8, ty + 16);
          tr.samples.forEach(function (s, si) {
            drawTile(tctx, s.t, pad + 8 + si * (trTileW + 24), ty + 22, trTileW, trTileH - 8, s.label + ' (' + s.t.toFixed(2) + 's)');
          });
        });

        // 3. phone-360w.png (exact 360px width)
        var ps = plan.phoneSpec;
        var phoneCanvas = document.createElement('canvas');
        phoneCanvas.width = ps.width; // 360
        phoneCanvas.height = ps.headerH + Math.max(1, plan.beatPairs.length) * (ps.tileH + ps.captionH + ps.gap) + ps.pad;
        var pctx = phoneCanvas.getContext('2d');
        pctx.fillStyle = '#101316';
        pctx.fillRect(0, 0, phoneCanvas.width, phoneCanvas.height);
        pctx.fillStyle = '#ccf17b';
        pctx.font = '700 12px ui-monospace, monospace';
        pctx.fillText('Phone 360w · ' + plan.show_id, ps.pad, 17);
        plan.beatPairs.forEach(function (bp, idx) {
          var py = ps.headerH + idx * (ps.tileH + ps.captionH + ps.gap);
          pctx.fillStyle = '#1c2228';
          pctx.fillRect(ps.pad - 2, py - 2, ps.width - ps.pad * 2 + 4, ps.tileH + ps.captionH);
          var left = frameMap[Number(bp.mid_t).toFixed(4)];
          var right = frameMap[Number(bp.plus_t).toFixed(4)];
          if (left) pctx.drawImage(left, ps.pad, py, ps.tileW, ps.tileH);
          if (right) pctx.drawImage(right, ps.pad + ps.tileW + ps.gap, py, ps.tileW, ps.tileH);
          pctx.fillStyle = '#edf1e9';
          pctx.font = '600 10px ui-monospace, monospace';
          pctx.fillText(bp.atom_id + ' +0.0 ' + bp.mid_t.toFixed(2) + 's · +0.3 ' + bp.plus_t.toFixed(2) + 's', ps.pad + 2, py + ps.tileH + 13);
        });

        return Promise.all([
          canvasToPngBytes(beatCanvas),
          canvasToPngBytes(trCanvas),
          canvasToPngBytes(phoneCanvas)
        ]).then(function (pngs) {
          var sheetMeta = [
            { path: 'sheets/beat-plus-0.3s.png', kind: 'beat-plus-0.3s', width: beatCanvas.width, height: beatCanvas.height, panels: plan.beatPairs.length * 2 },
            { path: 'sheets/transition-strips.png', kind: 'transition-strips', width: trCanvas.width, height: trCanvas.height, panels: plan.transitions.length * 3 },
            { path: 'sheets/phone-360w.png', kind: 'phone-360w', width: phoneCanvas.width, height: phoneCanvas.height, panels: plan.beatPairs.length * 2 }
          ];
          var manifest = {
            show_id: plan.show_id,
            title: plan.title,
            duration_s: plan.duration_s,
            sheets: sheetMeta,
            beats: plan.beatPairs,
            transitions: plan.transitions
          };
          var enc = new TextEncoder();
          var files = [
            { name: 'sheets/manifest.json', data: enc.encode(JSON.stringify(manifest, null, 2) + '\n') },
            { name: 'sheets/beat-plus-0.3s.png', data: pngs[0] },
            { name: 'sheets/transition-strips.png', data: pngs[1] },
            { name: 'sheets/phone-360w.png', data: pngs[2] }
          ];
          var zipBytes = root.HMXExport.zipStore(files);
          var blob = new Blob([zipBytes], { type: 'application/zip' });
          var result = {
            filename: plan.show_id + '-sheets.zip',
            manifest: manifest,
            fileNames: files.map(function (f) { return f.name; }),
            widths: {
              beat: beatCanvas.width,
              transition: trCanvas.width,
              phone: phoneCanvas.width
            },
            blobSize: blob.size
          };
          root.HMBeatSheetExport.lastResult = result;
          if (opts.download !== false && typeof S.download === 'function') {
            S.download(result.filename, blob);
          }
          if (typeof S.status === 'function') {
            S.status('Downloaded beat +0.3s, transition & 360px sheets (.zip).');
          }
          return result;
        });
      });
    });
  }

  function mount() {
    if (typeof document === 'undefined') return;
    var btn = document.getElementById('downloadBeatSheets');
    if (!btn || btn.dataset.hmBound === '1') return;
    btn.dataset.hmBound = '1';
    btn.addEventListener('click', function () {
      var S = root.HMStudio;
      btn.disabled = true;
      renderSheetsInBrowser(S, { download: true }).catch(function (err) {
        if (S && typeof S.status === 'function') S.status(err.message, true);
      }).finally(function () {
        btn.disabled = false;
      });
    });
  }

  var api = {
    planSheets: planSheets,
    encodeRgbaPngNode: encodeRgbaPngNode,
    decodePngRgbaNode: decodePngRgbaNode,
    renderSheetsNode: renderSheetsNode,
    renderSheetsInBrowser: renderSheetsInBrowser,
    mount: mount,
    lastResult: null
  };

  root.HMBeatSheetExport = api;

  if (typeof document !== 'undefined') {
    var ready = root.ready;
    if (ready && typeof ready.then === 'function') ready.then(mount, mount);
    else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
    else mount();
  }

  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

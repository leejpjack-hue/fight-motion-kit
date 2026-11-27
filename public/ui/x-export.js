/* HM-EXPORT-X-PRESET — street bake presets and a frame-sequence zip.
 * Browser-only. Deterministic ffmpeg stays on the local skill.
 * There is no Workers compose on this path. */
(function (root) {
  'use strict';
  const HINT_SECONDS = 30;
  const HONESTY = 'Real-time Record still needs this tab visible. Deterministic ffmpeg stays on the local skill.';
  const RECORDER_MIME = [
    { mime: 'video/webm;codecs=vp9', ext: 'webm', label: 'WebM' },
    { mime: 'video/webm;codecs=vp8', ext: 'webm', label: 'WebM' },
    { mime: 'video/mp4;codecs=avc1.42E01E', ext: 'mp4', label: 'MP4' },
    { mime: 'video/mp4', ext: 'mp4', label: 'MP4' },
    { mime: 'video/webm', ext: 'webm', label: 'WebM' },
  ];
  const presets = [
    { id: '720p30', label: '720p30', width: 1280, height: 720, fps: 30, videoBitsPerSecond: 5000000 },
    { id: '1080p30', label: '1080p30', width: 1920, height: 1080, fps: 30, videoBitsPerSecond: 8000000 },
    { id: '720p24', label: '720p24', width: 1280, height: 720, fps: 24, videoBitsPerSecond: 4000000 },
    { id: '1080p24', label: '1080p24', width: 1920, height: 1080, fps: 24, videoBitsPerSecond: 6400000 },
  ];
  function presetById(id) { return presets.find(p => p.id === id) || null; }
  function availableRecorderFormats(isTypeSupported) {
    if (typeof isTypeSupported !== 'function') return [];
    const seen = new Set();
    const out = [];
    for (let i = 0; i < RECORDER_MIME.length; i++) {
      const entry = RECORDER_MIME[i];
      if (seen.has(entry.ext)) continue;
      let ok = false;
      try { ok = !!isTypeSupported(entry.mime); } catch (e) {}
      if (ok) {
        seen.add(entry.ext);
        out.push(entry);
      }
    }
    return out;
  }
  function pickRecorderMime(isTypeSupported, preferredExt) {
    const formats = availableRecorderFormats(isTypeSupported);
    if (!formats.length) return null;
    if (preferredExt) {
      const match = formats.find(entry => entry.ext === preferredExt);
      if (match) return match;
    }
    return formats[0];
  }
  function positiveNum(n) { return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null; }
  function stripFpsOf(item) {
    if (!item || typeof item !== 'object') return null;
    const direct = positiveNum(item.fps) || positiveNum(item.strip_fps) || positiveNum(item.source_fps) || positiveNum(item.cadence && item.cadence.fps);
    if (direct) return direct;
    const spc = positiveNum(item.cadence && item.cadence.secondsPerCell);
    if (spc) return 1 / spc;
    const pm = item.strip || item.pendingMotion;
    if (pm && typeof pm === 'object') {
      const pmSpc = positiveNum(pm.cadence && pm.cadence.secondsPerCell);
      if (pmSpc) return 1 / pmSpc;
      const pmSrc = positiveNum(pm.metadata && pm.metadata.source_fps);
      if (pmSrc) return pmSrc;
    }
    return null;
  }
  function detectCadenceMismatch(project, preset) {
    const targetFps = preset && positiveNum(preset.fps) ? preset.fps : 30;
    const names = [];
    const addIf24 = (item, fallbackName) => {
      const fps = stripFpsOf(item);
      if (fps && Math.abs(fps - 24) < 0.05) {
        const label = (item && (item.name || item.label || item.id)) || fallbackName || 'motion strip';
        if (!names.includes(label)) names.push(label);
      }
    };
    const media = Array.isArray(project && project.media) ? project.media : [];
    const strips = Array.isArray(project && project.strips) ? project.strips : [];
    const showStrips = Array.isArray(project && project.show && project.show.strips) ? project.show.strips : [];
    const atoms = Array.isArray(project && project.show && project.show.atoms) ? project.show.atoms : [];
    media.forEach(item => addIf24(item, 'imported strip'));
    strips.forEach(item => addIf24(item, 'motion strip'));
    showStrips.forEach(item => addIf24(item, 'motion strip'));
    atoms.forEach(atom => {
      addIf24(atom && atom.strip, atom && (atom.label || atom.id));
      if (positiveNum(atom && atom.strip_fps) && Math.abs(atom.strip_fps - 24) < 0.05) {
        const label = (atom.label || atom.id || 'clip strip');
        if (!names.includes(label)) names.push(label);
      }
    });
    const mismatch = names.length > 0 && targetFps !== 24;
    const warning = mismatch
      ? 'Cadence warning: 24 fps strip (' + names.join(', ') + ') with ' + targetFps + ' fps preset will duplicate frames in real-time video; pick 720p24 or 1080p24 to match cadence.'
      : '';
    return {
      mismatch,
      stripFps: names.length ? 24 : null,
      targetFps,
      stripNames: names,
      warning,
    };
  }
  function cadenceTelemetry(opts) {
    const o = opts || {};
    const durationS = Math.max(0.001, positiveNum(o.durationS) || 0.1);
    const targetFps = positiveNum(o.targetFps) || 30;
    const renderedFrames = Math.max(0, Math.round(Number(o.renderedFrames) || 0));
    const expectedFrames = Math.max(1, Math.round(durationS * targetFps));
    const elapsedS = positiveNum(o.actualElapsedMs) ? Math.max(0.001, o.actualElapsedMs / 1000) : durationS;
    const measuredFps = Math.round((renderedFrames / elapsedS) * 10) / 10;
    const droppedFrames = Math.max(0, expectedFrames - renderedFrames);
    const dropRatio = expectedFrames > 0 ? droppedFrames / expectedFrames : 0;
    const significantDrop = droppedFrames >= 2 && dropRatio > 0.15;
    const mime = String(o.mime || 'video/webm');
    const res = (positiveNum(o.width) || 1280) + '×' + (positiveNum(o.height) || 720);
    const droppedWarning = significantDrop
      ? ' Cadence warning: dropped ' + droppedFrames + ' of ' + expectedFrames + ' expected frames (real-time lossy capture); use PNG frames for deterministic timing.'
      : '';
    const summary = 'Video downloaded · ' + mime + ' · ' + res + ' · target ' + targetFps + ' fps · measured ' + measuredFps.toFixed(1) + ' fps (' + renderedFrames + '/' + expectedFrames + ' frames).' + droppedWarning;
    return {
      mime,
      width: positiveNum(o.width) || 1280,
      height: positiveNum(o.height) || 720,
      target_fps: targetFps,
      expected_frames: expectedFrames,
      rendered_frames: renderedFrames,
      dropped_frames: droppedFrames,
      measured_fps: measuredFps,
      significant_drop: significantDrop,
      dropped_warning: droppedWarning,
      summary,
    };
  }
  function formatMbps(bps) { return (Math.round(bps / 1e5) / 10).toFixed(1) + ' Mbps'; }
  function webmMegabytes(bps, seconds) { return Math.round((bps * seconds / 8 / 1e6) * 10) / 10; }
  function bitrateHint(preset) {
    const mb = webmMegabytes(preset.videoBitsPerSecond, HINT_SECONDS).toFixed(1);
    return preset.label + ' · ' + preset.width + '×' + preset.height + ' · ' + preset.fps + ' fps · ' + formatMbps(preset.videoBitsPerSecond) + ' · ≈ ' + mb + ' MB for a 30s WebM';
  }
  function framePlan(durationS, fps) {
    if (!Number.isFinite(durationS) || durationS <= 0) throw new Error('Add a clip before exporting a frame sequence.');
    if (!Number.isInteger(fps) || fps < 1 || fps > 60) throw new Error('fps must be 1–60.');
    const count = durationS * fps;
    if (Math.abs(Math.round(count) - count) > 1e-6) throw new Error('Duration × fps is not a whole number of frames. Adjust the timeline or choose another preset.');
    const n = Math.round(count);
    const frames = [];
    for (let i = 0; i < n; i++) frames.push({ index: i, file: 'frames/' + String(i).padStart(6, '0') + '.png', t: i / fps });
    return frames;
  }
  function sanitizeDownloadName(stem, suffix) {
    var s = String(stem == null ? '' : stem)
      .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '')
      .replace(/\.\./g, '-')
      .replace(/[\\/]+/g, '-')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^[.-]+/, '')
      .replace(/-+/g, '-')
      .slice(0, 96);
    if (!s) s = 'motion';
    var ext = String(suffix || '').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069\\/]+/g, '');
    return s + ext;
  }
  function safeShowStem(showId) {
    return sanitizeDownloadName(showId, '');
  }
  function ffmpegArgv(preset, durationS, outName) {
    const kbps = Math.round(preset.videoBitsPerSecond / 1000);
    const stem = String(outName || 'motion').replace(/\.(webm|mp4)$/i, '');
    const webmName = sanitizeDownloadName(stem, '.webm');
    return ['ffmpeg', '-y', '-framerate', String(preset.fps), '-start_number', '0', '-i', 'frames/%06d.png', '-an', '-c:v', 'libvpx', '-b:v', kbps + 'k', '-t', Number(durationS).toFixed(3), webmName];
  }
  function ffmpegMp4Argv(preset, durationS, outName) {
    const kbps = Math.round(preset.videoBitsPerSecond / 1000);
    const stem = String(outName || 'motion').replace(/\.(webm|mp4)$/i, '');
    const mp4Name = sanitizeDownloadName(stem, '.mp4');
    return ['ffmpeg', '-y', '-framerate', String(preset.fps), '-start_number', '0', '-i', 'frames/%06d.png', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-b:v', kbps + 'k', '-movflags', '+faststart', '-t', Number(durationS).toFixed(3), mp4Name];
  }
  function exactFrameQuantum(fps) {
    for (let k = 1; k <= fps; k++) {
      const dur = Math.round((k / fps) * 10000) / 10000;
      if (dur > 0 && Math.abs(Math.round(dur * fps) - dur * fps) <= 1e-6) return k;
    }
    return fps;
  }
  function preflightSummary(durationS, preset) {
    const p = preset || presets[0];
    const dur = Number.isFinite(+durationS) && +durationS > 0 ? +durationS : 0;
    if (!dur) {
      return {
        presetId: p.id,
        presetLabel: p.label,
        width: p.width,
        height: p.height,
        fps: p.fps,
        durationS: 0,
        rawFrames: 0,
        frameExact: false,
        exactFrames: 0,
        nearestDurationS: 0,
        deltaS: 0,
        estWebmMB: 0,
        estMp4MB: 0,
        summary: p.label + ' · ' + p.width + '×' + p.height + ' · ' + p.fps + ' fps · Add a clip to check export frame budget.',
      };
    }
    const rawFrames = dur * p.fps;
    const frameExact = Math.abs(Math.round(rawFrames) - rawFrames) <= 1e-6;
    const q = exactFrameQuantum(p.fps);
    const exactFrames = frameExact
      ? Math.max(1, Math.round(rawFrames))
      : Math.max(q, Math.round(rawFrames / q) * q);
    const nearestDurationS = +(exactFrames / p.fps).toFixed(4);
    const deltaS = +(nearestDurationS - dur).toFixed(4);
    const estWebmMB = webmMegabytes(p.videoBitsPerSecond, dur);
    const estMp4MB = estWebmMB;
    const frameText = frameExact
      ? exactFrames + ' exact frames'
      : rawFrames.toFixed(2) + ' frames (snap to ' + exactFrames + 'f = ' + nearestDurationS.toFixed(4) + 's)';
    return {
      presetId: p.id,
      presetLabel: p.label,
      width: p.width,
      height: p.height,
      fps: p.fps,
      durationS: +dur.toFixed(4),
      rawFrames: +rawFrames.toFixed(4),
      frameExact,
      exactFrames,
      nearestDurationS,
      deltaS,
      estWebmMB,
      estMp4MB,
      summary: p.label + ' · ' + p.width + '×' + p.height + ' · ' + p.fps + ' fps · ' + frameText + ' · ≈ ' + estWebmMB.toFixed(1) + ' MB',
    };
  }
  function snapShowToFrameBoundary(atoms, fps, preferredIndex) {
    if (!Array.isArray(atoms) || !atoms.length) throw new Error('Add a clip before snapping duration.');
    if (!Number.isInteger(fps) || fps < 1 || fps > 60) throw new Error('fps must be 1–60.');
    const next = JSON.parse(JSON.stringify(atoms));
    const total = next.reduce((s, a) => s + (Number.isFinite(+a.duration_s) ? +a.duration_s : 0), 0);
    const minTotal = Math.max(0.1, total);
    let idx = Number.isInteger(preferredIndex) && preferredIndex >= 0 && preferredIndex < next.length ? preferredIndex : next.length - 1;
    const otherDur = total - (+next[idx].duration_s || 0);
    const q = exactFrameQuantum(fps);
    const minSteps = Math.max(1, Math.ceil(((otherDur + 0.1) * fps - 1e-9) / q));
    const exactFrames = Math.max(minSteps * q, Math.round((minTotal * fps) / q) * q);
    const snappedTotal = +(exactFrames / fps).toFixed(4);
    const newAtomDur = +(snappedTotal - otherDur).toFixed(4);
    if (newAtomDur < 0.1 || snappedTotal > 120) {
      throw new Error('Cannot snap selected clip cleanly within 0.1s–120s bounds.');
    }
    next[idx].duration_s = newAtomDur;
    delete next[idx].timing_hold;
    return {
      atoms: next,
      snappedDurationS: snappedTotal,
      exactFrames,
      deltaS: +(snappedTotal - total).toFixed(4),
      adjustedIndex: idx,
    };
  }
  function formatFfmpegCommand(argv) {
    if (!Array.isArray(argv)) return '';
    return argv.map(tok => {
      const s = String(tok);
      return /^[a-zA-Z0-9._/:%+-]+$/.test(s) ? s : "'" + s.replace(/'/g, "'\\''") + "'";
    }).join(' ');
  }
  function formatBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return '0 B';
    if (n < 1024) return Math.round(n) + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(2) + ' MB';
    return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }
  function buildExportReceipt(opts) {
    const o = opts || {};
    const preset = o.preset || presets[0];
    const kind = String(o.kind || 'video');
    const filename = String(o.filename || '');
    const format = String(o.format || '');
    const hasBytes = o.bytes !== undefined && o.bytes !== null;
    if (hasBytes && (!Number.isFinite(+o.bytes) || +o.bytes <= 0)) {
      throw new Error('Export produced an empty file (0 bytes).');
    }
    const bytes = hasBytes ? Math.round(+o.bytes) : null;
    const sizeLabel = bytes != null ? formatBytes(bytes) : '';
    const defaultMime = kind === 'frames'
      ? 'application/zip'
      : kind === 'html'
        ? 'text/html'
        : kind === 'frame'
          ? 'image/png'
          : kind === 'timing'
            ? 'application/json'
            : (format || '');
    const mime = String(o.mime || '').trim() || defaultMime;
    const dur = Number.isFinite(+o.durationS) && +o.durationS > 0 ? +o.durationS : 0;
    const width = positiveNum(o.width) || (preset && preset.width) || 1280;
    const height = positiveNum(o.height) || (preset && preset.height) || 720;
    const resolution = kind === 'timing' ? '' : (width + '×' + height);
    const fps = positiveNum(o.fps) || (preset && preset.fps) || 30;
    const stem = safeShowStem(o.showId);
    const mp4Cmd = formatFfmpegCommand(ffmpegMp4Argv(preset, dur || 1, stem + '.mp4'));
    const webmCmd = formatFfmpegCommand(ffmpegArgv(preset, dur || 1, stem + '.webm'));
    const ffmpegCommand = kind === 'frames' ? (String(o.ffmpegCommand || '').trim() || mp4Cmd) : '';
    const title = kind === 'frames'
      ? 'PNG frame sequence ready'
      : kind === 'html'
        ? 'Playable HTML exported'
        : kind === 'frame'
          ? 'Current frame PNG exported'
          : kind === 'timing'
            ? 'Timing pack JSON exported'
            : 'Video exported (' + (format || mime || 'video') + ')';
    const honestyNote = kind === 'frames'
      ? 'PNG frame ZIP + timing.json. Run local ffmpeg below for H.264 MP4 or WebM (browser MP4 is not universal).'
      : kind === 'html'
        ? 'Offline HTML with embedded images and project source (not a video file; MP4 is not universal).'
        : kind === 'frame'
          ? 'Single PNG frame sampled from the live canvas at the current playhead.'
          : kind === 'timing'
            ? 'Timing preset and frame-sequence JSON for local verification.'
            : (/mp4/i.test(mime || format)
              ? 'Recorded as ' + (mime || format) + ' in this browser only (MP4 is not universal).'
              : 'Recorded as WebM (' + (mime || format || 'video/webm') + '). For H.264 MP4, export PNG frames and run local ffmpeg (MP4 is not universal).');
    const formatDisplay = format && mime && format !== mime ? (format + ' (' + mime + ')') : (mime || format || kind.toUpperCase());
    const timingLabel = kind === 'html'
      ? 'canvas renderAt'
      : kind === 'frame'
        ? 'single PNG'
        : kind === 'timing'
          ? 'timing JSON'
          : (fps + ' fps');
    const parts = [filename, formatDisplay, sizeLabel, resolution, timingLabel, dur.toFixed(2) + 's'];
    if (o.note) parts.push(String(o.note));
    return {
      kind,
      filename,
      format: format || mime,
      mime,
      bytes,
      size_label: sizeLabel,
      width,
      height,
      resolution,
      fps,
      duration_s: dur,
      title,
      summary: parts.filter(Boolean).join(' · '),
      honestyNote,
      ffmpegCommand,
      mp4Command: mp4Cmd,
      webmCommand: webmCmd,
    };
  }
  function timingDocument(opts) {
    const preset = opts.preset;
    const frames = opts.frames;
    const showId = String(opts.showId || 'motion');
    const stem = safeShowStem(showId);
    const outName = stem + '.webm';
    const webmArgv = ffmpegArgv(preset, opts.durationS, outName);
    const mp4Argv = ffmpegMp4Argv(preset, opts.durationS, stem + '.mp4');
    return {
      kind: 'html-motion-frame-sequence',
      version: 1,
      show_id: showId,
      preset_id: preset.id,
      label: preset.label,
      width: preset.width,
      height: preset.height,
      fps: preset.fps,
      duration_s: opts.durationS,
      frame_count: frames.length,
      video_bits_per_second: preset.videoBitsPerSecond,
      bitrate_hint: bitrateHint(preset),
      honesty: HONESTY,
      encode: 'local-skill',
      frames,
      ffmpeg_webm_command: formatFfmpegCommand(webmArgv),
      ffmpeg_mp4: {
        where: 'local-skill',
        note: 'Run locally after extracting frames for H.264 MP4 output (browser MP4 is not universal).',
        argv: mp4Argv,
        command: formatFfmpegCommand(mp4Argv),
      },
      ffmpeg: {
        where: 'local-skill',
        note: HONESTY + ' This zip is frames plus timing JSON, not a video.',
        argv: webmArgv,
      },
    };
  }
  function crc32(bytes) {
    let c = ~0;
    for (let i = 0; i < bytes.length; i++) {
      c ^= bytes[i];
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (~c) >>> 0;
  }
  function zipStore(files) {
    if (!files.length) throw new Error('Nothing to zip.');
    const enc = new TextEncoder();
    const seen = new Set();
    const locals = [];
    const centrals = [];
    let offset = 0;
    files.forEach(file => {
      const name = String(file.name || '');
      if (!name || name.length > 200 || /\\|\0/.test(name) || name.startsWith('/') || name.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Bad zip path: ' + name);
      if (seen.has(name)) throw new Error('Duplicate zip path: ' + name);
      seen.add(name);
      const nameBytes = enc.encode(name);
      const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
      const crc = crc32(data);
      const local = new Uint8Array(30 + nameBytes.length);
      const view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(8, 0, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, data.length, true);
      view.setUint32(22, data.length, true);
      view.setUint16(26, nameBytes.length, true);
      local.set(nameBytes, 30);
      locals.push(local, data);
      const central = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint32(42, offset, true);
      central.set(nameBytes, 46);
      centrals.push(central);
      offset += local.length + data.length;
    });
    const centralSize = centrals.reduce((n, b) => n + b.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    const parts = locals.concat(centrals, [eocd]);
    const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
    let p = 0;
    parts.forEach(part => { out.set(part, p); p += part.length; });
    return out;
  }
  const api = { presets, presetById, HINT_SECONDS, HONESTY, RECORDER_MIME, availableRecorderFormats, pickRecorderMime, detectCadenceMismatch, cadenceTelemetry, formatMbps, formatBytes, webmMegabytes, bitrateHint, framePlan, sanitizeDownloadName, safeShowStem, ffmpegArgv, ffmpegMp4Argv, formatFfmpegCommand, preflightSummary, snapShowToFrameBoundary, buildExportReceipt, timingDocument, zipStore, crc32 };
  root.HMXExport = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

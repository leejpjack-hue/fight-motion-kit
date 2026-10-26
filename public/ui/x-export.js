/* HM-EXPORT-X-PRESET — street bake presets and a frame-sequence zip.
 * Browser-only. Deterministic ffmpeg stays on the local skill.
 * There is no Workers compose on this path. */
(function (root) {
  'use strict';
  const HINT_SECONDS = 30;
  const HONESTY = 'Real-time Record still needs this tab visible. Deterministic ffmpeg stays on the local skill.';
  const presets = [
    { id: '720p30', label: '720p30', width: 1280, height: 720, fps: 30, videoBitsPerSecond: 5000000 },
    { id: '1080p30', label: '1080p30', width: 1920, height: 1080, fps: 30, videoBitsPerSecond: 8000000 },
  ];
  function presetById(id) { return presets.find(p => p.id === id) || null; }
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
  function ffmpegArgv(preset, durationS, outName) {
    const kbps = Math.round(preset.videoBitsPerSecond / 1000);
    return ['ffmpeg', '-y', '-framerate', String(preset.fps), '-start_number', '0', '-i', 'frames/%06d.png', '-an', '-c:v', 'libvpx', '-b:v', kbps + 'k', '-t', Number(durationS).toFixed(3), outName];
  }
  function timingDocument(opts) {
    const preset = opts.preset;
    const frames = opts.frames;
    const showId = String(opts.showId || 'motion');
    const outName = showId.replace(/[^a-zA-Z0-9._-]+/g, '-') + '.webm';
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
      ffmpeg: {
        where: 'local-skill',
        note: HONESTY + ' This zip is frames plus timing JSON, not a video.',
        argv: ffmpegArgv(preset, opts.durationS, outName),
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
  const api = { presets, presetById, HINT_SECONDS, HONESTY, formatMbps, webmMegabytes, bitrateHint, framePlan, ffmpegArgv, timingDocument, zipStore, crc32 };
  root.HMXExport = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

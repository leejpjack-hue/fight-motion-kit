/* HM-PF-46 — what this browser can export.
 * Probes MediaRecorder. Does not encode video.
 * HM-EXPORT-X-PRESET presets stay in x-export.js.
 * Playable HTML and PNG frames are ready here.
 * WebM and MP4 are this browser only. MP4 is not universal.
 * Alpha video is not offered. The bake fills the stage white. */
(function (root) {
  'use strict';
  const WEBM_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const MP4_TYPES = ['video/mp4'];
  const ALPHA_TYPES = ['video/webm;codecs=vp9,alpha', 'video/webm;codecs=vp8,alpha'];
  const RECORD_ORDER = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/mp4', 'video/webm'];
  const DENIAL_MP4 = 'MP4 is not universal.';
  const DENIAL_ALPHA = 'Alpha video is not offered.';
  const SUMMARY = 'Playable HTML and PNG frames are ready here. WebM and MP4 depend on this browser. ' + DENIAL_MP4 + ' ' + DENIAL_ALPHA;

  function listed(types, ask) {
    const out = [];
    for (let i = 0; i < types.length; i++) {
      try { if (ask(types[i])) out.push(types[i]); } catch (e) {}
    }
    return out;
  }

  function browserCaps(env) {
    const ask = env && typeof env.isTypeSupported === 'function' ? env.isTypeSupported : function () { return false; };
    return {
      captureStream: !!(env && env.captureStream),
      webm: listed(WEBM_TYPES, ask),
      mp4: listed(MP4_TYPES, ask),
      alphaMime: listed(ALPHA_TYPES, ask),
    };
  }

  function normalize(caps) {
    caps = caps || {};
    return {
      captureStream: !!caps.captureStream,
      webm: Array.isArray(caps.webm) ? caps.webm.filter(Boolean) : [],
      mp4: Array.isArray(caps.mp4) ? caps.mp4.filter(Boolean) : [],
      alphaMime: Array.isArray(caps.alphaMime) ? caps.alphaMime.filter(Boolean) : [],
    };
  }

  function preferredRecordMime(caps) {
    const c = normalize(caps);
    if (!c.captureStream) return '';
    const have = new Set(c.webm.concat(c.mp4));
    return RECORD_ORDER.find(type => have.has(type)) || '';
  }

  function matrix(caps) {
    const c = normalize(caps);
    const record = preferredRecordMime(c);
    const webm = !!(c.captureStream && c.webm.length);
    const mp4 = !!(c.captureStream && c.mp4.length);
    const webmNote = webm
      ? 'This browser can record ' + c.webm[0] + '. Real time. Keep this tab visible. Other browsers may not. The file has no alpha.'
      : 'This browser cannot record WebM. Use playable HTML or the PNG frame zip.';
    let mp4Note;
    if (!mp4) mp4Note = 'This browser does not report video/mp4. Record video will not write an MP4 file here. ' + DENIAL_MP4;
    else if (record.indexOf('webm') !== -1) mp4Note = 'This browser reports ' + c.mp4[0] + '. Record video still prefers WebM. ' + DENIAL_MP4;
    else mp4Note = 'Record video uses ' + c.mp4[0] + ' on this browser only. ' + DENIAL_MP4;
    const alphaNote = (c.alphaMime.length
      ? 'This browser reports ' + c.alphaMime[0] + '. '
      : '') + DENIAL_ALPHA + ' No transparent WebM or MP4 is written. Frame PNGs stay composited on the white stage fill.';
    const rows = [
      {
        id: 'html',
        label: 'Playable HTML',
        offered: true,
        scope: 'always',
        alpha: 'composited',
        alphaLabel: 'Composited',
        here: 'Ready',
        note: 'One offline file. Plays in a browser with no network. Plate animation on a canvas. Not a video file and not an alpha export.',
      },
      {
        id: 'frames',
        label: 'PNG frames',
        offered: true,
        scope: 'always',
        alpha: 'composited',
        alphaLabel: 'Composited',
        here: 'Ready',
        note: 'Zip of PNG frames plus timing JSON. Each frame is the composited picture on the white stage fill. Not a transparent plate and not a video. ffmpeg stays on the local skill.',
      },
      {
        id: 'webm',
        label: 'WebM',
        offered: webm,
        scope: 'this-browser',
        alpha: 'none',
        alphaLabel: 'No',
        here: webm ? 'This browser' : 'Unavailable here',
        note: webmNote,
      },
      {
        id: 'mp4',
        label: 'MP4',
        offered: mp4,
        scope: 'this-browser',
        alpha: 'none',
        alphaLabel: 'No',
        here: mp4 ? 'This browser only' : 'Unavailable here',
        note: mp4Note,
      },
      {
        id: 'alpha',
        label: 'Alpha video',
        offered: false,
        scope: 'never',
        alpha: 'refused',
        alphaLabel: 'Not offered',
        here: 'Not offered',
        note: alphaNote,
      },
    ];
    return {
      kind: 'hm-pf-46-export-honesty',
      version: 1,
      universal_mp4: false,
      universal_alpha: false,
      record_mime: record,
      summary: SUMMARY,
      rows: rows,
    };
  }

  const api = {
    WEBM_TYPES: WEBM_TYPES,
    MP4_TYPES: MP4_TYPES,
    ALPHA_TYPES: ALPHA_TYPES,
    RECORD_ORDER: RECORD_ORDER,
    DENIAL_MP4: DENIAL_MP4,
    DENIAL_ALPHA: DENIAL_ALPHA,
    SUMMARY: SUMMARY,
    browserCaps: browserCaps,
    preferredRecordMime: preferredRecordMime,
    matrix: matrix,
  };
  root.HMExportMatrix = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

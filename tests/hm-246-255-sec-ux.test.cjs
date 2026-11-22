const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const Sec = require('../public/ui/import-security.js');
const Ux = require('../public/ui/ux-helpers.js');
const HtmlImport = require('../public/ui/html-import.js');
const XExport = require('../public/ui/x-export.js');
require('../public/ui/motion-sot.js');
const Sot = globalThis.HMMotionSot;
require('../public/ui/import-receipt.js');
const Receipt = globalThis.HMImportReceipt;

function makePngHeaderDataUri(w, h) {
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(w, 16);
  buf.writeUInt32BE(h, 20);
  return 'data:image/png;base64,' + buf.toString('base64');
}

function makeMemoryStorage() {
  const m = new Map();
  return {
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
  };
}

test('HM-SEC-01 (#246): Composer & exported Playable HTML include strict offline CSP policies', () => {
  const indexHtml = fs.readFileSync('public/ui/index.html', 'utf8');
  assert.match(indexHtml, /<meta http-equiv="Content-Security-Policy"/);
  assert.match(indexHtml, /default-src 'self'/);
  assert.match(indexHtml, /object-src 'none'/);
  assert.match(indexHtml, /form-action 'none'/);
  assert.equal(/<script(?![^>]*\bsrc=)[^>]*>/i.test(indexHtml), false, 'Composer index.html uses external deferred scripts only');

  const exportsSrc = fs.readFileSync('public/ui/exports.js', 'utf8');
  assert.match(exportsSrc, /http-equiv="Content-Security-Policy"/);
  assert.match(exportsSrc, /default-src 'none'/);
  assert.match(exportsSrc, /connect-src 'none'/);
  assert.match(exportsSrc, /form-action 'none'/);
  assert.equal(/api\.teqcon\.uk|:8770|wrangler deploy/.test(exportsSrc), false);
});

test('HM-SEC-02 (#247): safeParseJson & parseMotionHtml strip prototype pollution, cap nesting depth, and block unsafe data URIs', () => {
  const polluted = '{"ok":1,"__proto__":{"pwn":"yes"},"nested":{"constructor":{"prototype":{"x":1}}}}';
  const clean = Sec.safeParseJson(polluted);
  assert.equal({}.pwn, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(clean, '__proto__'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(clean.nested, 'constructor'), false);

  let deep = '1';
  for (let i = 0; i < 40; i++) deep = `{"a":${deep}}`;
  assert.throws(() => Sec.safeParseJson(deep, { maxDepth: 32 }), /maximum nesting depth/);

  const svgHtml = '<!doctype html><html><body><img src="data:image/svg+xml;base64,PHN2Zy8+"></body></html>';
  assert.throws(() => HtmlImport.parseMotionHtml(svgHtml, { fileName: 'evil.html' }), /Blocked unsafe HTML URI scheme/);

  const jsHtml = '<!doctype html><html><body><a href="javascript:alert(1)">x</a></body></html>';
  assert.throws(() => HtmlImport.parseMotionHtml(jsHtml, { fileName: 'evil-js.html' }), /Blocked unsafe HTML URI scheme/);
});

test('HM-SEC-03 (#248): decompression bomb & asset count quotas reject oversized images before canvas decode', () => {
  const okPng = makePngHeaderDataUri(1280, 720);
  const okDims = Sec.inspectDataUrlDimensions(okPng, 'ok.png');
  assert.deepEqual({ w: okDims.width, h: okDims.height }, { w: 1280, h: 720 });

  const bombPng = makePngHeaderDataUri(16384, 16384);
  assert.throws(() => Sec.inspectDataUrlDimensions(bombPng, 'bomb.png'), /decompression guard/);

  const bombHtml = `<!doctype html><html><body><img src="${bombPng}"></body></html>`;
  assert.throws(() => HtmlImport.parseMotionHtml(bombHtml, { fileName: 'bomb.html' }), /decompression guard/);

  const manyAssets = {};
  for (let i = 0; i < 151; i++) manyAssets[`p-${i}.png`] = okPng;
  assert.throws(() => Sec.assertProjectAssetBudget(manyAssets), /maximum embedded asset count/);
});

test('HM-SEC-04 (#249): download filenames, asset keys, and embedded JSON script payloads escape breakouts & traversal', () => {
  assert.equal(XExport.sanitizeDownloadName('../../evil\u202ecmd;rm', '.mp4'), 'evilcmd-rm.mp4');
  assert.equal(XExport.sanitizeDownloadName('.../', '.html'), 'motion.html');
  assert.equal(XExport.safeShowStem('../../../etc/passwd'), 'etc-passwd');

  const doc = XExport.timingDocument({
    showId: '../../bad\u202ename',
    preset: XExport.presetById('720p30'),
    durationS: 0.1,
    frames: XExport.framePlan(0.1, 30),
  });
  assert.equal(doc.ffmpeg_mp4.argv.at(-1), 'badname.mp4');
  assert.equal(doc.ffmpeg.argv.at(-1), 'badname.webm');
  assert.equal(doc.ffmpeg.argv.some(tok => String(tok).includes('mp4')), false);

  assert.throws(() => Sec.sanitizeAssetKey('../secret.png'), /Unsafe relative asset path/);
  assert.equal(Sec.sanitizeAssetKey('\\plates\\P01.png'), 'plates/P01.png');

  const embedded = HtmlImport.embedProjectScript({
    version: 1,
    show: { show_id: 's1', title: '</script><!--&test', atoms: [] },
    layouts: {},
    media: [],
    assets: {},
  });
  assert.equal(embedded.includes('</script><!--'), false);
  assert.match(embedded, /\\u003c\/script\\u003e\\u003c!--\\u0026test/);
});

test('HM-SEC-05 (#250): schema bounds reject invalid numbers/lengths and corrupt drafts quarantine cleanly', () => {
  const validPng = makePngHeaderDataUri(64, 64);
  const badDur = {
    version: 1,
    show: {
      show_id: 'b1',
      title: 'T',
      atoms: [{ id: 'a1', duration_s: NaN, plates_needed: 1, pose_mode: 'hero', hero: { layout_source: 'k', plates: [] } }],
    },
    layouts: {},
    media: [],
    assets: {},
  };
  assert.throws(() => Sec.sanitizeProjectBounds(badDur), /duration_s/);

  const longTitle = 'A'.repeat(350);
  const clamped = Sec.sanitizeProjectBounds({
    version: 1,
    show: {
      show_id: 's1',
      title: longTitle,
      atoms: [{ id: 'a1', label: 'L'.repeat(200), caption: 'C'.repeat(400), duration_s: 0.5, plates_needed: 1, pose_mode: 'hero', hero: { layout_source: 'k', plates: [] } }],
      overlays: [{ id: 'o1', t_start: 0, t_end: 0.5, x: 10, y: 20 }],
    },
    layouts: {},
    media: [],
    assets: { 'p1.png': validPng },
  });
  assert.equal(clamped.show.title.length, Sec.LIMITS.MAX_TITLE_LEN);
  assert.equal(clamped.show.atoms[0].label.length, Sec.LIMITS.MAX_LABEL_LEN);
  assert.equal(clamped.show.atoms[0].caption.length, Sec.LIMITS.MAX_CAPTION_LEN);

  const store = makeMemoryStorage();
  Sot.quarantineCorruptDraft(store, badDur, 'Corrupt duration_s');
  const read = Sot.readQuarantinedDraft(store);
  assert.equal(read.reason, 'Corrupt duration_s');
  assert.equal(read.draft.show.show_id, 'b1');
  Sot.clearQuarantinedDraft(store);
  assert.equal(Sot.readQuarantinedDraft(store), null);
});

test('HM-UX-01 (#251): import health check, fuzzy auto-match, pacing normalization & receipt badges work cohesively', () => {
  const validPng = makePngHeaderDataUri(64, 64);
  const proj = {
    version: 1,
    show: {
      show_id: 'ai-raw',
      title: 'Raw AI Show',
      atoms: [
        { id: 'a1', duration_s: 20, camera: {} },
        { id: 'a2', duration_s: 0.6, camera: { preset: 'slow_push' } },
      ],
    },
    layouts: { 'imported-html-layout.json': { P01: { full: 'plates/P01.png' }, P02: { full: 'plates/P02.png' } } },
    media: [],
    assets: { 'plates/P01.png': validPng },
  };
  const health = HtmlImport.analyzeImportHealth(proj, {
    missingRefs: ['plates/P02.png'],
    localFiles: { 'hero_P02_final.png': validPng, 'unrelated.png': validPng },
  });
  assert.equal(health.exportReady, false);
  assert.equal(health.suggestedMatches.length, 1);
  assert.equal(health.suggestedMatches[0].ref, 'plates/P02.png');
  assert.equal(health.suggestedMatches[0].file, 'hero_P02_final.png');
  assert.equal(health.canNormalizePacing, true);

  const norm = HtmlImport.normalizeAiPacing(proj);
  assert.equal(norm.project.show.atoms[0].duration_s, 0.6);
  assert.equal(norm.project.show.atoms[0].camera.preset, 'establish');

  const receipt = Receipt.buildReceipt({
    action: 'Open AI HTML',
    source: 'ai-raw',
    status: 'partial',
    missing: ['plates/P02.png'],
    exportReady: health.exportReady,
    totalDurationS: health.totalDurationS,
    suggestedMatches: health.suggestedMatches,
    canNormalizePacing: health.canNormalizePacing,
  });
  assert.equal(receipt.exportReady, false);
  assert.equal(receipt.suggestedMatches.length, 1);
  assert.equal(receipt.canNormalizePacing, true);
});

test('HM-UX-02 (#252): direct-manipulation timeline trim math, single-frame step, and NLE shortcut guardrails', () => {
  const trimNormal = Ux.computeTrimmedDuration({
    startDurationS: 0.5,
    deltaPx: 60,
    trackWidthPx: 600,
    totalDurationS: 5,
    shiftKey: false,
  });
  assert.equal(trimNormal.duration_s, 1);
  assert.match(trimNormal.label, /^1\.00s · \+0\.50s$/);

  const trimFine = Ux.computeTrimmedDuration({
    startDurationS: 0.5,
    deltaPx: 12,
    trackWidthPx: 600,
    totalDurationS: 5,
    shiftKey: true,
  });
  assert.equal(trimFine.duration_s, 0.6);

  assert.equal(Ux.stepFrameTime(0, 1, 1, 30), 0.0333);
  assert.equal(Ux.stepFrameTime(0.0333, 1, -1, 30), 0);

  assert.equal(Ux.resolveNleShortcut({ key: 's', targetTagName: 'BODY' }), 'split');
  assert.equal(Ux.resolveNleShortcut({ key: '[', targetTagName: 'BUTTON' }), 'trim-minus');
  assert.equal(Ux.resolveNleShortcut({ key: ']', targetTagName: 'BODY' }), 'trim-plus');
  assert.equal(Ux.resolveNleShortcut({ key: ',', targetTagName: 'BODY' }), 'step-back');
  assert.equal(Ux.resolveNleShortcut({ key: '.', targetTagName: 'BODY' }), 'step-forward');
  assert.equal(Ux.resolveNleShortcut({ key: 'e', targetTagName: 'BODY' }), 'export');
  assert.equal(Ux.resolveNleShortcut({ key: '?', targetTagName: 'BODY' }), 'help');
  assert.equal(Ux.resolveNleShortcut({ key: 's', targetTagName: 'INPUT' }), null);
  assert.equal(Ux.resolveNleShortcut({ key: 's', targetTagName: 'BODY', modalOpen: true }), null);
});

test('HM-UX-03 (#253): preflight summary detects fractional frame boundaries & snaps cleanly to exact integer frames', () => {
  const preset30 = XExport.presetById('720p30');
  const bad = XExport.preflightSummary(0.55, preset30);
  assert.equal(bad.frameExact, false);
  assert.equal(bad.exactFrames, 18);

  const snapped = XExport.snapShowToFrameBoundary([{ id: 'c1', duration_s: 0.55 }], 30, 0);
  assert.equal(snapped.exactFrames, 18);
  assert.equal(snapped.snappedDurationS, 0.6);
  const plan = XExport.framePlan(snapped.snappedDurationS, 30);
  assert.equal(plan.length, 18);
  const good = XExport.preflightSummary(snapped.snappedDurationS, preset30);
  assert.equal(good.frameExact, true);
  assert.match(good.summary, /18 exact frames/);

  const preset24 = XExport.presetById('720p24');
  const snapped24 = XExport.snapShowToFrameBoundary([{ id: 'c1', duration_s: 0.61 }], 24, 0);
  assert.equal(snapped24.exactFrames, 15);
  assert.equal(snapped24.snappedDurationS, 0.625);
  assert.equal(XExport.framePlan(snapped24.snappedDurationS, 24).length, 15);
  assert.equal(XExport.preflightSummary(snapped24.snappedDurationS, preset24).frameExact, true);
});

test('HM-UX-04 (#254): missing-asset diagnostic detects unresolved imported plate at playhead without false-positiving built-ins', () => {
  const proj = {
    show: {
      show_id: 'relink-probe',
      atoms: [
        { id: 'c1', label: 'Intro', duration_s: 0.5, hero: { layout_source: 'imported-html-layout.json', plates: ['P01'] } },
        { id: 'c2', label: 'Strike', duration_s: 0.5, hero: { layout_source: 'imported-html-layout.json', plates: ['P02'] } },
      ],
    },
    layouts: {
      'imported-html-layout.json': {
        P01: { full: 'plates/P01.png' },
        P02: { full: 'plates/P02.png' },
      },
    },
    assets: {
      'plates/P01.png': makePngHeaderDataUri(64, 64),
    },
  };
  assert.deepEqual(Ux.missingAssetsForActiveClip(proj, 0.25).missingRefs, []);
  const hit = Ux.missingAssetsForActiveClip(proj, 0.75);
  assert.equal(hit.atomIndex, 1);
  assert.equal(hit.clipLabel, 'Strike');
  assert.deepEqual(hit.missingRefs, ['plates/P02.png']);
});

test('HM-UX-05 (#255): Stitch DESIGN.md covers all 6 canonical sections matching styles.css tokens & help shortcuts', () => {
  const designMd = fs.readFileSync('DESIGN.md', 'utf8');
  for (const heading of [
    '## 1. Visual Theme and Atmosphere',
    '## 2. Color Palette and Roles',
    '## 3. Typography Rules',
    '## 4. Component Stylings',
    '## 5. Layout Principles',
    '## 6. Stitch Generation Notes',
  ]) {
    assert.ok(designMd.includes(heading), `DESIGN.md missing ${heading}`);
  }
  const styles = fs.readFileSync('public/ui/styles.css', 'utf8');
  for (const token of ['--shell-bg', '--shell-panel', '--shell-text', '--shell-accent', '#0A0E14', '#5EEAD4', 'textarea:focus-visible']) {
    assert.ok(styles.includes(token), `styles.css missing ${token}`);
    if (!token.includes(':focus-visible')) {
      assert.ok(designMd.includes(token), `DESIGN.md missing ${token}`);
    }
  }
  const indexHtml = fs.readFileSync('public/ui/index.html', 'utf8');
  assert.match(indexHtml, /<dt>Split clip at playhead<\/dt><dd>S<\/dd>/);
  assert.match(indexHtml, /<dt>Open Export Video<\/dt><dd>E<\/dd>/);
  assert.match(indexHtml, /id="stageMissingOverlay"/);
  assert.match(indexHtml, /id="playheadPill"/);
  assert.match(indexHtml, /id="snapFrameBoundary"/);
});

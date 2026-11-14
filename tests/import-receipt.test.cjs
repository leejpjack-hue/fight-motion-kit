'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HMImportReceipt = require('../public/ui/import-receipt.js');
const HMMarketSpritegenProof = require('../public/ui/market-spritegen-proof.js');

const ROOT = path.resolve(__dirname, '..');

test('Issue #211: buildReceipt normalizes landed counts, missing items, undoability, and zero provider calls', () => {
  const ok = HMImportReceipt.buildReceipt({
    action: 'Import images',
    source: 'Local image upload',
    filesLanded: ['p01.png', 'p02.png', 'p01.png'],
    clipsLoaded: 2,
    imagesLoaded: 2,
    missing: [],
    undoable: true,
  });
  assert.equal(ok.status, 'ok');
  assert.deepEqual(ok.filesLanded, ['p01.png', 'p02.png']);
  assert.equal(ok.clipsLoaded, 2);
  assert.equal(ok.imagesLoaded, 2);
  assert.equal(ok.missing.length, 0);
  assert.equal(ok.undoable, true);
  assert.equal(ok.providerCalls, 0);
  assert.equal(ok.artInvented, false);

  const partial = HMImportReceipt.buildReceipt({
    action: 'Open project',
    source: 'partial.motion.json',
    filesLanded: ['partial.motion.json'],
    clipsLoaded: 2,
    imagesLoaded: 1,
    missing: ['custom/missing.png', 'notes.txt (unsupported file skipped)'],
  });
  assert.equal(partial.status, 'partial');
  assert.match(HMImportReceipt.formatSummary(partial), /PARTIAL · MISSING FILES/);
  assert.match(HMImportReceipt.formatSummary(partial), /2 clips · 1 images · 2 missing · 0 provider calls/);

  const pending = HMImportReceipt.buildReceipt({
    action: 'Import pending strip',
    source: 'strip.png',
    status: 'pending',
    filesLanded: ['strip.png', 'strip.json'],
    clipsLoaded: 0,
    imagesLoaded: 1,
    missing: ['Playable timeline clips blocked until SG-02'],
    undoable: true,
  });
  assert.equal(pending.status, 'pending');
  assert.match(HMImportReceipt.formatSummary(pending), /PENDING · NOT PLAYABLE/);
});

test('Issue #211: auditProjectAssets counts landed vs missing images without stand-in art', () => {
  const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const partialProject = {
    version: 1,
    show: {
      show_id: 'partial-audit',
      title: 'Partial audit',
      atoms: [
        { id: 'c1', duration_s: 0.5, hero: { layout_source: 'custom/layout.json', plates: ['P01'] } },
        { id: 'c2', duration_s: 0.5, hero: { layout_source: 'custom/layout.json', plates: ['P02'] } },
      ],
      bg: { base: dataUri, swap: 'custom/missing-bg.jpg' },
    },
    layouts: {
      'custom/layout.json': {
        P01: { full: 'P01.png' },
        P02: { full: 'P02.png' },
      },
    },
    media: [
      { id: 'm1', name: 'P01', src: 'custom/P01.png', layoutSource: 'custom/layout.json', plateId: 'P01' },
      { id: 'm2', name: 'P02', src: 'custom/P02.png', layoutSource: 'custom/layout.json', plateId: 'P02' },
    ],
    assets: {
      'custom/P01.png': dataUri,
    },
  };

  const audit = HMImportReceipt.auditProjectAssets(partialProject);
  assert.equal(audit.clipsLoaded, 2);
  assert.equal(audit.imagesLoaded, 2); // custom/P01.png + dataUri bg.base
  assert.deepEqual(audit.missingRefs, ['custom/P02.png', 'custom/missing-bg.jpg']);

  const demoShow = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/shows/daiyu-wang-five-seconds.json'), 'utf8'));
  const demoLayout = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/daiyu-wang-eight/layout.json'), 'utf8'));
  const builtInAudit = HMImportReceipt.auditProjectAssets({
    version: 1,
    show: demoShow,
    layouts: { 'assets/daiyu-wang-eight/layout.json': demoLayout },
    media: [],
  }, { isBuiltIn: true });
  assert.equal(builtInAudit.clipsLoaded, 8);
  assert.equal(builtInAudit.imagesLoaded >= 8, true);
  assert.deepEqual(builtInAudit.missingRefs, []);
});

test('Issue #211: missingFromParsedInput reports unsupplied costume_lock local images', () => {
  const dataUri = 'data:image/png;base64,AAAA';
  const pack = {
    kind: 'costume_lock',
    version: 1,
    cast: {
      L: {
        lock_refs: [{ src: 'lung_ref.png' }],
        sheets: [{ src: 'sheets/lung_sheet.png' }],
        pose_refs: [{ src: 'poses/lung_pose_01.png' }],
      },
      R: {
        lock_refs: [{ src: 'mei_ref.png' }],
        sheets: [{ src: 'sheets/mei_sheet.png' }],
        pose_refs: [],
      },
    },
  };
  const checked = HMImportReceipt.missingFromParsedInput(pack, {
    'lung_sheet.png': dataUri,
    'lung_ref.png': dataUri,
  });
  assert.deepEqual(checked.provided, ['lung_ref.png', 'sheets/lung_sheet.png']);
  assert.deepEqual(checked.missing, ['poses/lung_pose_01.png', 'mei_ref.png', 'sheets/mei_sheet.png']);
});

test('Issue #211: recordMarketSpritegen aligns with HMMarketSpritegenProof BLOCKED_RUNTIME without provider or stand-in art', () => {
  const proof = HMMarketSpritegenProof.assess(p => fs.existsSync(p));
  const receipt = HMImportReceipt.recordMarketSpritegen(proof);
  assert.equal(receipt.status, 'blocked');
  assert.equal(receipt.source, 'fight-baijia-elfmage-market-spritegen-2026-11-06');
  assert.equal(receipt.clipsLoaded, 0);
  assert.equal(receipt.imagesLoaded, 0);
  assert.deepEqual(receipt.filesLanded, []);
  assert.equal(receipt.replaceProject, false);
  assert.equal(receipt.providerCalls, 0);
  assert.equal(receipt.artInvented, false);
  assert.equal(receipt.missing.includes('/workspace/deliverables/fight-baijia-elfmage-market-spritegen-2026-11-06'), true);
  assert.equal(receipt.missing.some(m => m.includes('*.motion.json')), true);
});

test('Issue #211: import-receipt stays FE-only with zero external network or compose calls', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public/ui/import-receipt.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'public/ui/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'public/ui/styles.css'), 'utf8');

  assert.equal(/https?:\/\//.test(src), false);
  assert.equal(src.includes('fetch('), false);
  assert.equal(src.includes('api.teqcon'), false);
  assert.equal(src.includes('8770'), false);
  assert.equal(html.includes('id="importReceipt"'), true);
  assert.equal(html.includes('./import-receipt.js'), true);
  assert.equal(css.includes('.library>#importReceipt'), true);
});

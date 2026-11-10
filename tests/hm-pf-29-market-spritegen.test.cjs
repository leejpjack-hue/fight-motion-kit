'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const proof = require('../public/ui/market-spritegen-proof.js');

const ROOT = path.resolve(__dirname, '..');
const RECEIPT = path.join(ROOT, 'public/shows/market-spritegen-proof.json');

test('HM-PF-29: this disk has no market spritegen pack, so the receipt is BLOCKED_RUNTIME', () => {
  const live = proof.assess(p => fs.existsSync(p));
  const committed = JSON.parse(fs.readFileSync(RECEIPT, 'utf8'));
  assert.deepEqual(committed, live);
  assert.equal(live.status, 'BLOCKED_RUNTIME');
  assert.equal(live.step, 6);
  assert.equal(live.showId, 'fight-baijia-elfmage-market-spritegen-2026-11-06');
  assert.equal(live.providerCalls, 0);
  assert.equal(live.replaceProject, false);
  assert.equal(live.artInvented, false);
  assert.equal(live.bake, 'blocked');
  assert.deepEqual(live.missing, [
    '/workspace/deliverables/fight-baijia-elfmage-market-spritegen-2026-11-06',
    '/workspace/deliverables/fight-baijia-elfmage-market-spritegen-2026-11-06/BUILD_STATUS.md',
    '/workspace/deliverables/fight-baijia-elfmage-market-spritegen-2026-11-06/assets',
  ]);
  assert.deepEqual(live.unresolvedNames, ['*.motion.json', 'html']);
  assert.equal(JSON.stringify(live).includes('data:image'), false);
});

test('HM-PF-29: a present pack is READY and still makes no provider call and replaces no project', () => {
  const live = proof.assess(() => true);
  assert.equal(live.status, 'READY');
  assert.deepEqual(live.missing, []);
  assert.deepEqual(live.unresolvedNames, []);
  assert.equal(live.providerCalls, 0);
  assert.equal(live.replaceProject, false);
  assert.equal(live.artInvented, false);
  assert.equal(live.bake, 'workers-ui-export');
  assert.equal(live.handoff, 'Import pending strip · PNG + JSON');
});

test('HM-PF-29: the proof module fetches only the local receipt', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public/ui/market-spritegen-proof.js'), 'utf8');
  assert.equal(src.includes(proof.RECEIPT_URL), true);
  assert.equal(/https?:\/\//.test(src), false);
  assert.equal(src.includes('api.teqcon'), false);
  assert.equal(src.includes('8770'), false);
});

test('HM-PF-29: Workers UI documents the step 6 proof and leaves SG-01 not playable', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/ui/index.html'), 'utf8');
  const flow = fs.readFileSync(path.join(ROOT, 'public/product-flow.html'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'public/ui/app.js'), 'utf8');
  const strip = fs.readFileSync(path.join(ROOT, 'public/ui/project-media.js'), 'utf8');
  assert.equal(html.includes('id="openMarketSpritegenProof"'), true);
  assert.equal(html.includes('id="marketSpritegenDialog"'), true);
  assert.equal(html.includes('market-spritegen-proof.js'), true);
  assert.equal(flow.includes('fight-baijia-elfmage-market-spritegen-2026-11-06'), true);
  assert.equal(flow.includes('market-spritegen-proof.json'), true);
  assert.equal(app.includes('HMMarketSpritegenProof.matchesShow(sid)'), true);
  assert.equal(strip.includes('NOT PLAYABLE'), true);
  assert.equal(html.includes('PENDING, NOT PLAYABLE until SG02'), true);
});

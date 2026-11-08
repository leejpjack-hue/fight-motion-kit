'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
require('../public/ui/compose-client.js');
require('../public/ui/costume-lock.js');
require('../public/ui/costume-drift.js');
const qa = HMCostumeDrift;
const image = value => 'data:image/png;base64,' + Buffer.from(value).toString('base64');
function fixture() {
  return { kind: 'costume_lock', version: 1, pack_id: 'test-lock', cast: Object.fromEntries(['L', 'R'].map(side => [side, {
    name: side + ' cast', costume_id: side + '_outfit_v1',
    sheets: [{ id: side + '_SHEET', src: side + '-sheet.png' }],
    lock_refs: [{ src: side + '-ref.png', label: 'Earlier approved ' + side }],
  }])) };
}
function images() { return Object.fromEntries(['L', 'R'].flatMap(side => ['sheet', 'ref'].map(role => [side + '-' + role + '.png', image(side + role)]))); }
function checked() { return Object.fromEntries(['L', 'R'].map(side => [side, Object.fromEntries(Object.keys(qa.CHECKS).map(key => [key, true]))])); }

test('sheet review fails closed on missing locks, missing local images, unsafe paths, and self-comparison', () => {
  const pack = fixture(), local = images();
  assert.equal(qa.plan(pack, local).cast.L.costume_id, 'L_outfit_v1');
  delete pack.cast.L.lock_refs;
  assert.throws(() => qa.plan(pack, local), /Missing L lock_refs/);
  pack.cast.L.lock_refs = [{ src: 'absent.png' }];
  assert.throws(() => qa.plan(pack, local), /Missing local review image: absent.png/);
  for (const src of ['https://provider/image.png', '//host/ref.png', '../ref.png', '/ref.png', 'C:\\ref.png']) {
    pack.cast.L.lock_refs = [{ src }];
    assert.throws(() => qa.plan(pack, local), /safe local image paths/);
  }
  pack.cast.L.lock_refs = [{ src: 'copy.png' }];
  local['copy.png'] = local['L-sheet.png'];
  assert.throws(() => qa.plan(pack, local), /cannot serve as its own locked reference/);
});

test('every side/check and a reviewer are required; an incoming approval claim has no effect', async () => {
  const pack = fixture();
  pack.drift_review = { decision: 'Approve', reviewer: 'Untrusted file claim' };
  const plan = qa.plan(pack, images());
  await assert.rejects(qa.receipt(plan, {}, 'Operator'), /review pending/);
  await assert.rejects(qa.receipt(plan, checked(), '  '), /reviewer name/);
  for (const side of ['L', 'R']) for (const key of Object.keys(qa.CHECKS)) {
    const checks = checked(); checks[side][key] = false;
    await assert.rejects(qa.receipt(plan, checks, 'Operator'), new RegExp(side + ': review pending'));
  }
});

test('review receipt binds actual candidate/reference data and locks; portable project retains evidence', async () => {
  const pack = fixture(), local = images(), plan = qa.plan(pack, local), checks = checked();
  const report = await qa.receipt(plan, checks, ' QA operator ');
  assert.equal(report.reviewer, 'QA operator');
  assert.equal(report.sha256, createHash('sha256').update(JSON.stringify(plan)).digest('hex'));
  checks.L.costume = false;
  assert.equal(report.checks.L.costume, true);
  local['L-sheet.png'] = image('a replacement candidate');
  assert.notEqual((await qa.receipt(qa.plan(pack, local), checked(), 'QA')).sha256, report.sha256);
  const project = qa.attach(HMComposeClient.normalizeCostumeLockPack(pack, { localFiles: images() }), plan, report);
  const reopened = JSON.parse(JSON.stringify(project));
  assert.equal(reopened.assets['L-ref.png'], images()['L-ref.png']);
  assert.equal(reopened.show.costume_lock.drift_review.sha256, report.sha256);
  assert.equal(reopened.show.costume_lock.import_review, 'approved');
  assert.equal(reopened.show.chars.R.costume_id, 'R_outfit_v1');
  assert.equal(reopened.media.length, 2, 'QA refs do not become timeline plates');
});

test('pure normalization marks newly generated projects as requiring import review', () => {
  const pack = fixture();
  pack.drift_review = { decision: 'Approve' };
  pack.import_review = 'approved';
  const project = HMComposeClient.normalizeCostumeLockPack(pack);
  assert.equal(project.show.costume_lock.import_review, 'required');
  assert.equal(project.show.costume_lock.drift_review, undefined);
});

test('receipt snapshots checks before asynchronous hashing', async () => {
  const plan = qa.plan(fixture(), images()), checks = checked();
  const pending = qa.receipt(plan, checks, 'Operator');
  checks.R.identity = false;
  plan.cast.R.costume_id = 'changed_after_click';
  const report = await pending;
  assert.equal(report.checks.R.identity, true);
  assert.equal(report.cast.R.costume_id, 'R_outfit_v1');
});

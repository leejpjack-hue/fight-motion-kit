'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const sheetExport = require('../public/ui/beat-sheet-export.js');
const spikeScan = require('../public/ui/frame-spike-scan.js');
const clashSfx = require('../public/ui/clash-sfx-clock.js');
const marketProof = require('../public/ui/market-spritegen-proof.js');

const DAIYU_PATH = path.join(ROOT, 'public/shows/daiyu-wang-five-seconds.json');
const HANDOFF_PATH = path.join(ROOT, 'public/shows/fight-baijia-elfmage-market-spritegen-handoff.json');

test('HM-38: beat +0.3s, transition strips, and phone 360px sheets plan + CLI output', () => {
  const show = JSON.parse(fs.readFileSync(DAIYU_PATH, 'utf8'));
  const plan = sheetExport.planSheets(show);
  assert.equal(plan.show_id, 'daiyu-wang-five-seconds');
  assert.equal(plan.duration_s, 5);
  assert.equal(plan.beatPairs.length, 8);
  assert.equal(plan.transitions.length, 7);
  assert.equal(plan.phoneSpec.width, 360);
  assert.ok(plan.beatPairs[0].plus_t > plan.beatPairs[0].mid_t);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-38-sheets-'));
  try {
    const res = spawnSync(
      process.execPath,
      [path.join(ROOT, 'scripts/contact-sheet-export.cjs'), DAIYU_PATH, '--out', tmpDir, '--assets', path.join(ROOT, 'public')],
      { encoding: 'utf8' }
    );
    assert.equal(res.status, 0, res.stderr || res.stdout);
    const out = JSON.parse(res.stdout);
    assert.equal(out.ok, true);
    assert.equal(out.beat_files, 8);
    assert.equal(out.transition_files, 7);

    const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, 'sheets/manifest.json'), 'utf8'));
    assert.equal(manifest.sheets.length, 3);
    assert.equal(manifest.sheets[2].width, 360);

    const phonePng = fs.readFileSync(path.join(tmpDir, 'sheets/phone-360w.png'));
    assert.equal(phonePng.subarray(0, 4).toString('hex'), '89504e47');
    assert.equal(phonePng.readUInt32BE(16), 360, 'phone sheet width must be 360px');

    assert.equal(fs.existsSync(path.join(tmpDir, 'sheets/beat-plus-0.3s.png')), true);
    assert.equal(fs.existsSync(path.join(tmpDir, 'sheets/transition-strips.png')), true);
    assert.equal(fs.readdirSync(path.join(tmpDir, 'beats')).length, 8);
    assert.equal(fs.readdirSync(path.join(tmpDir, 'transitions')).length, 7);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  assert.equal(fs.existsSync(path.join(ROOT, 'docs/product-flow/HM-CONTACT-SHEET-EXPORT.md')), true);
});

test('HM-40: frame spike scan passes clean/authored flash fixtures and fails loudly on unauthored pops', () => {
  const cleanFixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/pop-scan-clean.json'), 'utf8'));
  const spikeFixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/pop-scan-spike.json'), 'utf8'));

  const cleanRes = spikeScan.scanFrameSeries(cleanFixture.frames, { show: cleanFixture.show });
  assert.equal(cleanRes.clean, true);
  assert.equal(cleanRes.popCount, 0);
  assert.equal(cleanRes.audioLufsChecked, false);
  assert.ok(cleanRes.authoredIgnored.length >= 2);

  const spikeRes = spikeScan.scanFrameSeries(spikeFixture.frames, { show: spikeFixture.show });
  assert.equal(spikeRes.clean, false);
  assert.equal(spikeRes.popCount, 2);
  assert.equal(spikeRes.findings[0].t_s, 0.8);
  assert.equal(spikeRes.findings[0].kind, 'unauthored_white_flash');
  assert.equal(spikeRes.findings[1].t_s, 1.4);
  assert.equal(spikeRes.findings[1].kind, 'unauthored_black_drop');

  // Direct RGBA pixel scan test
  const dark = new Uint8Array(16 * 4);
  for (let i = 0; i < 16; i++) { dark[i * 4] = 40; dark[i * 4 + 1] = 44; dark[i * 4 + 2] = 48; dark[i * 4 + 3] = 255; }
  const white = new Uint8Array(16 * 4).fill(255);
  const rgbaScan = spikeScan.scanFrameSeries([
    { t: 0.1, width: 4, height: 4, rgba: dark },
    { t: 0.2, width: 4, height: 4, rgba: white },
    { t: 0.3, width: 4, height: 4, rgba: dark }
  ], { cutTimes: [] });
  assert.equal(rgbaScan.clean, false);
  assert.equal(rgbaScan.findings[0].t_s, 0.2);

  const cliClean = spawnSync(process.execPath, [path.join(ROOT, 'scripts/bake-pop-scan.cjs'), path.join(ROOT, 'tests/fixtures/pop-scan-clean.json'), '--json'], { encoding: 'utf8' });
  assert.equal(cliClean.status, 0, cliClean.stderr);

  const cliSpike = spawnSync(process.execPath, [path.join(ROOT, 'scripts/bake-pop-scan.cjs'), path.join(ROOT, 'tests/fixtures/pop-scan-spike.json')], { encoding: 'utf8' });
  assert.equal(cliSpike.status, 2);
  assert.match(cliSpike.stderr, /0\.80s/);
  assert.match(cliSpike.stderr, /1\.40s/);

  const doc = fs.readFileSync(path.join(ROOT, 'docs/product-flow/HM-BAKE-POP-SCAN.md'), 'utf8');
  assert.equal(/visual frame-delta QA only/i.test(doc), true);
  assert.equal(/never claims.*-14 LUFS/i.test(doc), true);
});

test('HM-106: market spritegen offline proof bundle assesses READY with 0 provider calls', () => {
  const handoff = JSON.parse(fs.readFileSync(HANDOFF_PATH, 'utf8'));
  const assessed = marketProof.assessHandoffProject(handoff);
  assert.equal(assessed.status, 'READY');
  assert.equal(assessed.showId, 'fight-baijia-elfmage-market-spritegen-2026-11-06');
  assert.equal(assessed.plates, 8);
  assert.equal(assessed.atoms, 8);
  assert.equal(assessed.durationS, 5);
  assert.equal(assessed.providerCalls, 0);
  assert.equal(assessed.artInvented, false);

  const cli = spawnSync(process.execPath, [path.join(ROOT, 'skills/hm-spritegen-handoff/market-proof-handoff.cjs'), '--check'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  const cliOut = JSON.parse(cli.stdout);
  assert.equal(cliOut.ok, true);
  assert.equal(cliOut.provider_calls, 0);
});

test('HM-41: clash SFX clock stays silent by default and strictly silent before hero beat', () => {
  const daiyu = JSON.parse(fs.readFileSync(DAIYU_PATH, 'utf8'));
  const defaultPlan = clashSfx.buildCuePlan(daiyu);
  assert.equal(defaultPlan.enabled, false);
  assert.equal(defaultPlan.clock, 'renderAt');
  assert.ok(defaultPlan.cues.length >= 4);
  assert.equal(clashSfx.sampleAt(defaultPlan, defaultPlan.cues[0].t_peak).silent, true);
  assert.equal(clashSfx.sampleAt(defaultPlan, defaultPlan.cues[0].t_peak).amplitude, 0);

  const stagedShow = {
    show_id: 'pre-hero-silence-check',
    atoms: [
      { id: 'intro', label: 'Quiet bow', duration_s: 0.5, motion: { beat_class: 'straight' }, fx_hooks: [] },
      { id: 'clash-1', label: 'First clash', duration_s: 0.6, motion: { beat_class: 'clash' }, fx_hooks: [{ type: 'hit_orange', t_rel: 0.12 }] }
    ]
  };
  const optIn = clashSfx.buildCuePlan(stagedShow, { enabled: true });
  assert.equal(optIn.hero_beat_t0, 0.5);
  assert.equal(optIn.cues.length, 1);
  assert.equal(optIn.cues[0].t_peak, 0.62);

  // Strict silence before hero_beat_t0 even when enabled=true
  const preSample = clashSfx.sampleAt(optIn, 0.25, { enabled: true });
  assert.equal(preSample.silent, true);
  assert.equal(preSample.amplitude, 0);
  assert.equal(preSample.activeCues.length, 0);

  const peakSample = clashSfx.sampleAt(optIn, 0.62, { enabled: true });
  assert.equal(peakSample.silent, false);
  assert.ok(peakSample.amplitude > 0.5);
  assert.equal(peakSample.activeCues[0].atom_id, 'clash-1');

  const tmpWav = path.join(os.tmpdir(), 'hm-41-clash-' + process.pid + '.wav');
  try {
    const cli = spawnSync(
      process.execPath,
      [path.join(ROOT, 'scripts/clash-sfx-clock.cjs'), DAIYU_PATH, '--enabled', '--hero-beat', '0.5', '--out', tmpWav],
      { encoding: 'utf8' }
    );
    assert.equal(cli.status, 0, cli.stderr);
    const wav = fs.readFileSync(tmpWav);
    assert.equal(wav.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(wav.subarray(8, 12).toString('ascii'), 'WAVE');
    // First 0.45s at 22050Hz must be exact zero PCM before hero_beat_t0=0.5s
    const preSamples = Math.floor(0.45 * 22050);
    let nonZeroBeforeHero = 0;
    for (let i = 0; i < preSamples; i++) {
      if (wav.readInt16LE(44 + i * 2) !== 0) nonZeroBeforeHero++;
    }
    assert.equal(nonZeroBeforeHero, 0);
  } finally {
    fs.rmSync(tmpWav, { force: true });
  }
  assert.equal(fs.existsSync(path.join(ROOT, 'docs/product-flow/HM-SFX-SAME-CLOCK.md')), true);
});

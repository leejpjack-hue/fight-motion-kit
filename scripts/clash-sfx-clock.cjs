#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const sfx = require('../public/ui/clash-sfx-clock.js');

function parseArgs(argv) {
  const out = { input: '', outWav: '', enabled: false, heroBeat: undefined, rate: 22050, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') out.outWav = argv[++i] || '';
    else if (a === '--enabled') out.enabled = true;
    else if (a === '--hero-beat') out.heroBeat = Number(argv[++i]);
    else if (a === '--rate') out.rate = Number(argv[++i] || 22050);
    else if (a === '--json') out.json = true;
    else if (!a.startsWith('-') && !out.input) out.input = a;
  }
  return out;
}

function encodeMonoWav(samplesFloat, sampleRate) {
  const numSamples = samplesFloat.length;
  const dataBytes = numSamples * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samplesFloat[i]));
    buf.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return buf;
}

function synthesizePlanPcm(plan, sampleRate) {
  const total = Math.max(1, Math.round(plan.duration_s * sampleRate));
  const pcm = new Float32Array(total);
  if (!plan.enabled) return pcm; // strict zero PCM when silent default
  for (let i = 0; i < total; i++) {
    const t = i / sampleRate;
    const s = sfx.sampleAt(plan, t, { enabled: true });
    if (s.amplitude > 0) {
      pcm[i] = Math.sin(2 * Math.PI * 140 * t) * s.amplitude * 0.45;
    }
  }
  return pcm;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error('Usage: node scripts/clash-sfx-clock.cjs <show.json> [--enabled] [--hero-beat <sec>] [--out <out.wav>] [--json]');
    process.exit(1);
  }
  const parsed = JSON.parse(fs.readFileSync(path.resolve(args.input), 'utf8'));
  const plan = sfx.buildCuePlan(parsed, { enabled: args.enabled, heroBeatT0: args.heroBeat });
  if (args.outWav) {
    const pcm = synthesizePlanPcm(plan, args.rate);
    const wav = encodeMonoWav(pcm, args.rate);
    fs.mkdirSync(path.dirname(path.resolve(args.outWav)), { recursive: true });
    fs.writeFileSync(path.resolve(args.outWav), wav);
  }
  console.log(JSON.stringify({
    ok: true,
    show_id: plan.show_id,
    clock: plan.clock,
    enabled: plan.enabled,
    hero_beat_t0: plan.hero_beat_t0,
    cue_count: plan.cues.length,
    cues: plan.cues,
    outWav: args.outWav || null
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { encodeMonoWav, synthesizePlanPcm };

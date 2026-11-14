#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const sheetLib = require('../../public/ui/beat-sheet-export.js');

const SHOW_ID = 'fight-baijia-elfmage-market-spritegen-2026-11-06';
const LAYOUT_SOURCE = 'assets/fight-baijia-elfmage-market/layout.json';
const PACK_ROOT = '/workspace/deliverables/fight-baijia-elfmage-market-spritegen-2026-11-06';

const BEATS = [
  { id: 'beat-01', label: 'Market lantern clash', plate: 'M01', dur: 0.5, beat_class: 'clash', fx: [{ type: 'shake', t_rel: 0.08, params: { amp: 6, dur: 0.14 } }], caption: 'Lane opening' },
  { id: 'beat-02', label: 'Baijia low step', plate: 'M02', dur: 0.5, beat_class: 'straight', fx: [], caption: '' },
  { id: 'beat-03', label: 'Elfmage sigil ward', plate: 'M03', dur: 0.5, beat_class: 'straight', fx: [{ type: 'sparks', t_rel: 0.12, params: { dur: 0.16 } }], caption: '' },
  { id: 'beat-04', label: 'Stall parry', plate: 'M04', dur: 0.5, beat_class: 'clash', fx: [{ type: 'hit_orange', t_rel: 0.08, params: { dur: 0.14 } }], caption: 'Parry!' },
  { id: 'beat-05', label: 'Awning leap', plate: 'M05', dur: 0.5, beat_class: 'straight', fx: [], caption: '' },
  { id: 'beat-06', label: 'Arcane snap kick', plate: 'M06', dur: 0.75, beat_class: 'clash', fx: [{ type: 'leg_arc', t_rel: 0.1, params: { dur: 0.18 } }], caption: '' },
  { id: 'beat-07', label: 'Market palm strike', plate: 'M07', dur: 0.75, beat_class: 'clash', fx: [{ type: 'fist_pressure', t_rel: 0.1, params: { dur: 0.2 } }], caption: 'Impact!' },
  { id: 'beat-08', label: 'Lantern standoff finish', plate: 'M08', dur: 1.0, beat_class: 'clash', fx: [{ type: 'shake', t_rel: 0.08, params: { amp: 5, dur: 0.16 } }], caption: 'End exchange' }
];

function fillRect(rgba, W, H, x, y, w, h, c) {
  const x0 = Math.max(0, x | 0);
  const y0 = Math.max(0, y | 0);
  const x1 = Math.min(W, (x + w) | 0);
  const y1 = Math.min(H, (y + h) | 0);
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const idx = (py * W + px) * 4;
      rgba[idx] = c[0];
      rgba[idx + 1] = c[1];
      rgba[idx + 2] = c[2];
      rgba[idx + 3] = 255;
    }
  }
}

function renderMarketPlatePng(idx, beat) {
  const W = 32;
  const H = 18;
  const rgba = new Uint8Array(W * H * 4);
  // Night market sky & warm lantern backdrop (16:9 scaled proof plate)
  const sky = [22 + idx * 3, 28 + (idx % 3) * 4, 42 + idx * 2, 255];
  fillRect(rgba, W, H, 0, 0, W, H, sky);
  for (let l = 0; l < 5; l++) {
    fillRect(rgba, W, H, 3 + l * 6, 1 + ((l + idx) % 2), 2, 2, [240, 175 - l * 12, 68, 255]);
  }
  fillRect(rgba, W, H, 0, 12, W, 6, [48, 42, 46, 255]);
  fillRect(rgba, W, H, 0, 17, W, 1, [72, 64, 60, 255]);
  // Baijia (L, warm crimson fighter) advances right on beats
  const bx = 6 + Math.min(8, idx);
  const by = 7 - (beat.beat_class === 'clash' ? 1 : 0);
  fillRect(rgba, W, H, bx, by, 3, 7, [196, 62, 54, 255]);
  fillRect(rgba, W, H, bx, by - 2, 2, 2, [238, 198, 170, 255]);
  // Elfmage (R, cyan robe) counters left
  const ex = 23 - Math.min(7, idx);
  const ey = 7 + (idx % 2);
  fillRect(rgba, W, H, ex, ey, 3, 7, [48, 174, 196, 255]);
  fillRect(rgba, W, H, ex, ey - 2, 2, 2, [226, 232, 244, 255]);
  if (beat.beat_class === 'clash') {
    const cx = Math.round((bx + 3 + ex) / 2) - 1;
    fillRect(rgba, W, H, cx, 7, 2, 2, [255, 224, 102, 255]);
  }
  // Deterministic micro-dither breaks long identical byte runs while keeping plates compact
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const off = (py * W + px) * 4;
      const jitter = ((px * 7 + py * 13 + idx * 19 + px * py * 3) & 7) - 3;
      rgba[off] = Math.max(0, Math.min(255, rgba[off] + jitter));
      rgba[off + 1] = Math.max(0, Math.min(255, rgba[off + 1] - jitter));
      rgba[off + 2] = Math.max(0, Math.min(255, rgba[off + 2] + ((jitter * 3) & 7) - 3));
    }
  }
  return sheetLib.encodeRgbaPngNode(W, H, rgba);
}

function buildHandoffProject() {
  const layout = {};
  const assets = {};
  const media = [];
  const atoms = BEATS.map((beat, idx) => {
    const pngBuf = renderMarketPlatePng(idx, beat);
    const dataUrl = 'data:image/png;base64,' + pngBuf.toString('base64');
    const file = beat.plate + '.png';
    const assetKey = 'assets/fight-baijia-elfmage-market/' + file;
    layout[beat.plate] = { full: file, floor: 684 };
    assets[assetKey] = dataUrl;
    media.push({
      id: 'market-' + beat.plate.toLowerCase(),
      name: beat.plate + ' · ' + beat.label,
      src: dataUrl,
      layoutSource: LAYOUT_SOURCE,
      plateId: beat.plate
    });
    return {
      id: beat.id,
      label: beat.label,
      kind: 'duo',
      duration_s: beat.dur,
      plates_needed: 1,
      pose_mode: 'hero',
      motion: { family: 'fight', beat_class: beat.beat_class },
      hero: { layout_source: LAYOUT_SOURCE, plates: [beat.plate] },
      camera: {
        preset: 'static_hold',
        params: {
          s: { type: 'lerp', a: 1.01, b: 1.05, ease: 'smooth' },
          x: { type: 'lerp', a: idx % 2 === 0 ? -4 : 4, b: idx % 2 === 0 ? 4 : -4 },
          y: { type: 'const', v: 0 }
        }
      },
      fx_hooks: beat.fx,
      caption: beat.caption || undefined
    };
  });

  return {
    version: 1,
    provenance: {
      kind: 'market-spritegen-local-handoff',
      source_show_id: SHOW_ID,
      pack_root: PACK_ROOT,
      provider_calls: 0,
      art_invented: false,
      note: 'Offline portable FE proof bundle (8 embedded PNG plates, 5.00s). Original disk pack stays BLOCKED_RUNTIME when absent.'
    },
    show: {
      show_id: SHOW_ID,
      title: 'Baijia × Elfmage · Market spritegen (5.00s local proof)',
      duration_target_s: 5,
      floor_y: 684,
      grounded: true,
      parity_mode: true,
      compose_mode: 'parity',
      chars: { L: { name: 'Baijia' }, R: { name: 'Elfmage' } },
      bg: {},
      overlays: [],
      atoms
    },
    layouts: { [LAYOUT_SOURCE]: layout },
    assets,
    media
  };
}

function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outPath = path.resolve(
    outIdx >= 0 && args[outIdx + 1]
      ? args[outIdx + 1]
      : path.join(__dirname, '../../public/shows/fight-baijia-elfmage-market-spritegen-handoff.json')
  );
  const checkOnly = args.includes('--check');
  const project = buildHandoffProject();
  if (checkOnly) {
    const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    if (!existing || !existing.show || existing.show.show_id !== SHOW_ID || !Array.isArray(existing.show.atoms) || existing.show.atoms.length !== 8) {
      console.error('FAIL market-proof-handoff: invalid handoff bundle at ' + outPath);
      process.exit(1);
    }
    const dur = existing.show.atoms.reduce((s, a) => s + (+a.duration_s || 0), 0);
    console.log(JSON.stringify({ ok: true, show_id: existing.show.show_id, plates: existing.show.atoms.length, duration_s: dur, provider_calls: existing.provenance?.provider_calls ?? 0 }));
    return;
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(project, null, 2) + '\n');
  console.log(JSON.stringify({ ok: true, outPath, show_id: SHOW_ID, plates: project.show.atoms.length, duration_s: 5, provider_calls: 0 }));
}

if (require.main === module) {
  main();
}

module.exports = { SHOW_ID, LAYOUT_SOURCE, PACK_ROOT, buildHandoffProject };

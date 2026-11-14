#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const scanLib = require('../public/ui/frame-spike-scan.js');
const sheetLib = require('../public/ui/beat-sheet-export.js');

function parseArgs(argv) {
  const out = { framesJson: '', dir: '', video: '', show: '', fps: 30, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--frames-json') out.framesJson = argv[++i] || '';
    else if (a === '--dir') out.dir = argv[++i] || '';
    else if (a === '--video') out.video = argv[++i] || '';
    else if (a === '--show') out.show = argv[++i] || '';
    else if (a === '--fps') out.fps = Number(argv[++i] || 30);
    else if (a === '--json') out.json = true;
    else if (!a.startsWith('-')) {
      if (fs.existsSync(a) && fs.statSync(a).isDirectory()) out.dir = a;
      else if (/\.(mp4|webm|mov|mkv)$/i.test(a)) out.video = a;
      else out.framesJson = a;
    }
  }
  return out;
}

function loadFramesFromPngDir(dirPath, fps) {
  const names = fs.readdirSync(dirPath).filter((f) => /\.png$/i.test(f)).sort();
  if (!names.length) throw new Error('No .png frames found in ' + dirPath);
  const dt = 1 / (fps > 0 ? fps : 30);
  return names.map((name, idx) => {
    const decoded = sheetLib.decodePngRgbaNode(fs.readFileSync(path.join(dirPath, name)));
    if (!decoded) throw new Error('Unsupported PNG frame: ' + name);
    return { t: idx * dt, width: decoded.width, height: decoded.height, rgba: decoded.data };
  });
}

function extractVideoToTempPngs(videoPath, fps) {
  const check = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  if (check.error || check.status !== 0) {
    const err = new Error('ffmpeg not found on PATH; pass --dir <png_frames_dir> or --frames-json <frames.json> instead of raw video.');
    err.exitCode = 1;
    throw err;
  }
  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-pop-scan-'));
  const vfFps = fps > 0 ? fps : 30;
  const res = spawnSync('ffmpeg', ['-v', 'error', '-i', path.resolve(videoPath), '-vf', 'fps=' + vfFps, path.join(tmpDir, 'frame_%05d.png')], { encoding: 'utf8' });
  if (res.status !== 0) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error('ffmpeg failed to decode video: ' + (res.stderr || res.status));
  }
  try {
    return loadFramesFromPngDir(tmpDir, vfFps);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.framesJson && !args.dir && !args.video) {
    console.error('Usage: node scripts/bake-pop-scan.cjs (<frames.json> | --dir <png_dir> | --video <file.mp4>) [--show <show.json>] [--fps 30] [--json]');
    process.exit(1);
  }
  try {
    let show = args.show ? JSON.parse(fs.readFileSync(path.resolve(args.show), 'utf8')) : null;
    let frames = [];
    if (args.framesJson) {
      const payload = JSON.parse(fs.readFileSync(path.resolve(args.framesJson), 'utf8'));
      if (!show && payload.show) show = payload.show;
      frames = Array.isArray(payload) ? payload : (payload.frames || []);
    } else if (args.dir) {
      frames = loadFramesFromPngDir(path.resolve(args.dir), args.fps);
    } else if (args.video) {
      frames = extractVideoToTempPngs(args.video, args.fps);
    }

    const report = scanLib.scanFrameSeries(frames, { show: show && (show.show || show) });
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else if (report.clean) {
      console.log(`PASS bake-pop-scan: ${report.framesScanned} frames scanned · 0 unauthored pops (${report.authoredIgnored.length} authored transitions/fx ignored)`);
    } else {
      console.error(`FAIL bake-pop-scan: ${report.popCount} unauthored pop(s) detected across ${report.framesScanned} frames:`);
      for (const f of report.findings) {
        console.error(`  - t=${f.t_s.toFixed(2)}s frame#${f.frame_index} [${f.kind}] luma_delta=${f.luma_delta} rms=${f.pixel_rms_delta}`);
      }
    }
    process.exit(report.clean ? 0 : 2);
  } catch (err) {
    console.error('ERROR bake-pop-scan: ' + err.message);
    process.exit(err.exitCode || 1);
  }
}

if (require.main === module) {
  main();
}

#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const sheetExport = require('../public/ui/beat-sheet-export.js');

function parseArgs(argv) {
  const out = { input: '', outDir: '', assetRoot: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' || a === '-o') out.outDir = argv[++i] || '';
    else if (a === '--assets' || a === '--asset-root') out.assetRoot = argv[++i] || '';
    else if (!out.input && !a.startsWith('-')) out.input = a;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error('Usage: node scripts/contact-sheet-export.cjs <show.json|.motion.json> --out <dir> [--assets <public_dir>]');
    process.exit(1);
  }
  const inputPath = path.resolve(args.input);
  const parsed = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const show = parsed.show || parsed;
  const outDir = path.resolve(args.outDir || path.join('out', String(show.show_id || 'motion') + '-sheets'));
  const defaultAssetRoot = path.resolve(__dirname, '../public');
  const assetRoot = args.assetRoot ? path.resolve(args.assetRoot) : (fs.existsSync(defaultAssetRoot) ? defaultAssetRoot : path.dirname(inputPath));

  const built = sheetExport.renderSheetsNode(parsed, { assetRoot });
  fs.mkdirSync(outDir, { recursive: true });
  for (const [relPath, buf] of Object.entries(built.files)) {
    const dest = path.join(outDir, relPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
  }

  console.log(JSON.stringify({
    ok: true,
    show_id: built.manifest.show_id,
    outDir,
    sheets: built.manifest.sheets,
    beat_files: built.manifest.beats.length,
    transition_files: built.manifest.transitions.length
  }, null, 2));
}

if (require.main === module) {
  main();
}

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SHOW_ID = 'baijia-elfmage-void-array';
const ASSET_REL = path.join('public', 'assets', SHOW_ID);

function imageRefs(plate) {
  const refs = [];
  if (plate && typeof plate.full === 'string') refs.push(plate.full);
  for (const part of (plate && plate.parts) || []) {
    if (part && typeof part.src === 'string') refs.push(part.src);
  }
  return refs;
}

function isSlate(ref) {
  return /(^|\/)board-slate\.png$/i.test(String(ref));
}

function readLayout(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function platesOf(layout) {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) return [];
  return Object.values(layout).filter((plate) => plate && typeof plate === 'object');
}

function fileExists(roots, ref) {
  const rel = String(ref).replace(/^\/+/, '');
  const base = path.basename(rel);
  for (const root of roots) {
    if (!root) continue;
    const candidates = [
      path.resolve(root, rel),
      path.resolve(root, base),
      path.resolve(root, 'cutout', base),
      path.resolve(root, 'assets', SHOW_ID, rel),
      path.resolve(root, 'public', 'assets', SHOW_ID, rel),
    ];
    if (candidates.some((file) => fs.existsSync(file) && fs.statSync(file).isFile())) return true;
  }
  return false;
}

function assessLayout(layout, roots) {
  const plates = platesOf(layout);
  const refs = plates.flatMap(imageRefs);
  if (!refs.length) return { ok: false, reason: 'no-plate-images', plates: plates.length };
  const heroes = refs.filter((ref) => !isSlate(ref));
  if (!heroes.length) {
    return { ok: false, reason: 'slate-stub', plates: plates.length, refs: refs.length };
  }
  const missing = [...new Set(heroes.filter((ref) => !fileExists(roots, ref)))];
  if (missing.length) {
    return {
      ok: false,
      reason: 'missing-cutouts',
      plates: plates.length,
      heroes: heroes.length,
      missing: missing.length,
      sample: missing[0],
    };
  }
  return { ok: true, reason: 'pack-ready', plates: plates.length, heroes: heroes.length };
}

function candidateRoots(repo) {
  const roots = [
    process.env.HM_PACK_DIR,
    process.env.HM_UPLOADS_DIR,
    path.join(repo, ASSET_REL),
    path.join(repo, 'work', 'packs', SHOW_ID),
    path.join(repo, 'uploads'),
  ];
  return roots.filter(Boolean);
}

function assessRepo(repo) {
  const roots = candidateRoots(repo);
  const layoutFiles = [];
  for (const root of roots) {
    for (const rel of ['layout.json', path.join('assets', SHOW_ID, 'layout.json'), path.join('public', 'assets', SHOW_ID, 'layout.json')]) {
      const file = path.resolve(root, rel);
      if (fs.existsSync(file) && fs.statSync(file).isFile()) layoutFiles.push(file);
    }
  }
  if (!layoutFiles.length) return { ok: false, reason: 'no-layout', roots };
  let best = null;
  for (const file of layoutFiles) {
    const verdict = assessLayout(readLayout(file), roots);
    verdict.layout = file;
    if (verdict.ok) return verdict;
    if (!best || verdict.reason === 'missing-cutouts') best = verdict;
  }
  return best;
}

module.exports = { SHOW_ID, assessLayout, assessRepo, imageRefs, isSlate };

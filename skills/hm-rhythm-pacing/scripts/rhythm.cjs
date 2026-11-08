#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
function main(argv) {
  const mode = argv.shift();
  if (!['plan', 'stamp'].includes(mode)) throw new Error('Use: rhythm.cjs plan|stamp --board INPUT.json --out PLAN.json [--target-s N] [--project FILE] [--pack ID --beats id,id] [--impact-budget N] [--go-file APPROVAL.json] [--repo PATH] [--soft-cam]');
  const args = {};
  const allowed = new Set(['board', 'out', 'target-s', 'project', 'pack', 'beats', 'impact-budget', 'go-file', 'repo']);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--soft-cam') { args.softCam = true; continue; }
    const key = argv[i].slice(2);
    if (!argv[i].startsWith('--') || !allowed.has(key) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('Unknown or incomplete argument: ' + argv[i]);
    args[key] = argv[++i];
  }
  if (!args.board || !args.out) throw new Error('--board and --out are required.');
  const repo = path.resolve(args.repo || path.join(__dirname, '../../..'));
  require(path.join(repo, 'public/ui/compose-client.js'));
  const C = globalThis.HMComposeClient;
  const read = file => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const input = read(args.board), board = input.kind === 'hm-rhythm-input' ? input.board : input;
  const approval = args['go-file'] ? read(args['go-file']) : input.approval;
  const project = args.project ? read(args.project) : null, show = project?.show || project;
  const target = args['target-s'] !== undefined ? Number(args['target-s']) : mode === 'stamp' ? show?.duration_target_s ?? C.rhythmTiming(show).total_s : NaN;
  const plan = C.buildRhythmPlan(board, target, { mode, show, approval,
    timingPacks: read(path.join(repo, 'public/presets/timing_hold_packs.json')),
    packId: args.pack, selectedBeatIds: args.beats?.split(',').filter(Boolean), softCam: args.softCam,
    impactBudget: args['impact-budget'] === undefined ? undefined : Number(args['impact-budget']) });
  if (show) C.applyRhythmPlan(show, plan, { timingPacks: read(path.join(repo, 'public/presets/timing_hold_packs.json')) });
  const out = path.resolve(args.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
  console.log('Wrote ' + out + ': ' + plan.duration_map.length + ' beat(s), target ' + plan.target_s + 's, impact budget ' + plan.impact_budget + '. Import with Apply rhythm plan in HM.');
}
if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { main };

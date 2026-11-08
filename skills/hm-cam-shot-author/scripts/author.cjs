#!/usr/bin/env node
'use strict';
const { args, read, engine, write } = require('../../hm-cam-grammar-scene/scripts/grammar.cjs');
function main(argv) {
  const opt = args(argv, ['grammar', 'out', 'clauses', 'repo']);
  if (!opt.grammar || !opt.out) throw Error('Use: author.cjs --grammar GRAMMAR.json --out CAMERA-MAP.json [--clauses CLAUSES.txt] [--repo PATH]');
  const { A, catalog } = engine(opt.repo), plan = A.author(read(opt.grammar), catalog);
  const outputs = [[opt.out, JSON.stringify(plan, null, 2) + '\n']];
  if (opt.clauses) outputs.push([opt.clauses, plan.shots.map(shot => shot.beat_id + '\n' + shot.camera_clause).join('\n\n') + '\n']);
  write(outputs);
  console.log('Wrote camera map: ' + plan.shots.length + ' beats. Apply grammar / camera map in HM; each preset remains editable.');
}
if (require.main === module) try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
module.exports = { main };

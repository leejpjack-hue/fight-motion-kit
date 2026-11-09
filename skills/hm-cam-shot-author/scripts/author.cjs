#!/usr/bin/env node
'use strict';
const { args, read, engine, write } = require('../../hm-cam-grammar-scene/scripts/grammar.cjs');
function main(argv) {
  const opt = args(argv, ['grammar', 'out', 'clauses', 'clauses-json', 'repo']);
  if (!opt.grammar || !opt.out) throw Error('Use: author.cjs --grammar GRAMMAR.json --out CAMERA-MAP.json [--clauses CLAUSES.txt] [--clauses-json CLAUSES.json] [--repo PATH]');
  const { A, catalog } = engine(opt.repo), plan = A.author(read(opt.grammar), catalog);
  const outputs = [[opt.out, JSON.stringify(plan, null, 2) + '\n']];
  if (opt.clauses) {
    const body = /\.json$/i.test(opt.clauses) ? JSON.stringify(A.clauseMap(plan, catalog), null, 2) + '\n' : A.clausesText(plan, catalog);
    outputs.push([opt.clauses, body]);
  }
  if (opt['clauses-json']) outputs.push([opt['clauses-json'], JSON.stringify(A.clauseMap(plan, catalog), null, 2) + '\n']);
  write(outputs);
  console.log('Wrote camera map: ' + plan.shots.length + ' beats. Apply grammar / camera map in HM; each preset remains editable.');
}
if (require.main === module) try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
module.exports = { main };

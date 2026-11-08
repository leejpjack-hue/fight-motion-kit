#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
function args(argv, allowed) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].slice(2);
    if (!argv[i].startsWith('--') || !allowed.includes(key) || !argv[i + 1] || argv[i + 1].startsWith('--') || result[key] !== undefined) throw Error('Unknown, duplicate or incomplete argument: ' + argv[i]);
    result[key] = argv[++i];
  }
  return result;
}
const read = file => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
function engine(repo) {
  repo = path.resolve(repo || path.join(__dirname, '../../..'));
  require(path.join(repo, 'public/ui/compose-client.js'));
  require(path.join(repo, 'public/ui/camera-authoring.js'));
  return { A: globalThis.HMCameraAuthor, catalog: read(path.join(repo, 'public/presets/camera_presets.json')) };
}
function write(outputs) {
  // Check every destination before creating the first output. Never overwrite.
  const names = outputs.map(([file]) => path.resolve(file));
  if (new Set(names).size !== names.length) throw Error('Choose distinct output paths.');
  for (const name of names) if (fs.existsSync(name)) throw Error('Output already exists: ' + name);
  outputs.forEach(([file, content]) => { fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); fs.writeFileSync(file, content, { flag: 'wx' }); });
}
function main(argv) {
  const opt = args(argv, ['board', 'design', 'intent', 'out', 'markdown', 'go-file', 'repo']);
  if (!opt.board || !opt.out) throw Error('Use: grammar.cjs --board APPROVED.camera-input.json --out GRAMMAR.json [--design DESIGN.json] [--intent TEXT] [--markdown SHEET.md] [--go-file GO.json] [--repo PATH]');
  const { A, catalog } = engine(opt.repo), source = read(opt.board);
  const input = source.board ? source : { board: source };
  if (opt['go-file']) input.approval = read(opt['go-file']);
  const sheet = A.build(input, catalog, { design: opt.design ? read(opt.design) : undefined, intent: opt.intent });
  const outputs = [[opt.out, JSON.stringify(sheet, null, 2) + '\n']];
  if (opt.markdown) outputs.push([opt.markdown, A.markdown(sheet, catalog)]);
  write(outputs);
  console.log('Wrote scene grammar: ' + sheet.rows.length + ' beats. Review the editable sheet, then use hm-cam-shot-author or Apply grammar / camera map in HM.');
}
if (require.main === module) try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
module.exports = { args, read, engine, write, main };

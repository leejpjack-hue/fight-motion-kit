#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const board = require('../../../public/ui/storyboard-board.js');

function argsOf(argv, allowed) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].slice(2);
    if (!argv[i].startsWith('--') || !allowed.has(key) || !argv[i + 1] || argv[i + 1].startsWith('--')) {
      throw new Error('Unknown or incomplete argument: ' + argv[i]);
    }
    args[key] = argv[++i];
  }
  return args;
}

function readText(file) {
  return fs.readFileSync(path.resolve(file), 'utf8');
}

function writeNew(file, text) {
  const out = path.resolve(file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text, { flag: 'wx' });
  return out;
}

function resolveSource(explicit) {
  if (explicit) return { path: path.resolve(explicit), text: readText(explicit) };
  if (fs.existsSync(board.SOT_PATH)) return { path: board.SOT_PATH, text: readText(board.SOT_PATH) };
  return null;
}

function emit(argv) {
  const args = argsOf(argv, new Set(['brief', 'brief-file', 'out', 'seconds', 'show-id', 'source', 'title']));
  if (!args.out || (!args.brief && !args['brief-file'])) throw new Error('emit needs --brief or --brief-file, and --out.');
  const brief = args['brief-file'] ? readText(args['brief-file']) : args.brief;
  const source = resolveSource(args.source);
  const seconds = args.seconds === undefined ? undefined : Number(args.seconds);
  if (args.seconds !== undefined && (!Number.isInteger(seconds) || seconds < 1 || seconds > 120)) {
    throw new Error('--seconds must be an integer from 1 to 120.');
  }
  const emitted = board.emit({
    brief,
    seconds,
    showId: args['show-id'],
    title: args.title,
    sourceText: source && source.text,
    sourcePath: source && source.path,
  });
  const checked = board.check(emitted.text, source && source.text);
  if (!checked.ok) throw new Error(checked.errors.join(' '));
  const markdown = writeNew(args.out, emitted.text);
  const jsonPath = markdown.replace(/\.md$/i, '') + '.json';
  writeNew(jsonPath, JSON.stringify(emitted, null, 2) + '\n');
  console.log('Wrote ' + markdown + ' and ' + jsonPath + '. ' + emitted.beats.length + ' Cantonese beat(s). Plates: none. Jack GO is still required before gen or rhythm.');
}

function check(argv) {
  const args = argsOf(argv, new Set(['board', 'source']));
  if (!args.board) throw new Error('check needs --board.');
  const source = resolveSource(args.source);
  const result = board.check(readText(args.board), source && source.text);
  if (!result.ok) throw new Error(result.errors.join(' '));
  console.log('Board ok: ' + result.board.beats.length + ' beat(s), fields ' + result.board.fields.join(' | ') + '. No plates generated.');
}

function advance(argv) {
  const args = argsOf(argv, new Set(['to', 'board', 'go-file']));
  if (!args.to || !args.board) throw new Error('advance needs --to rhythm|gen and --board.');
  board.parse(readText(args.board));
  const approval = args['go-file'] ? JSON.parse(readText(args['go-file'])) : null;
  const result = board.advance(args.to, approval);
  console.log(result.message);
}

function main(argv) {
  const command = argv[0];
  if (command === 'emit') return emit(argv.slice(1));
  if (command === 'check') return check(argv.slice(1));
  if (command === 'advance') return advance(argv.slice(1));
  throw new Error('Use: board.cjs emit|check|advance. emit writes a Cantonese board only. advance refuses gen and rhythm without Jack GO and never writes plates.');
}

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { main };

#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { query } = require(path.join(__dirname, '..', 'public', 'boards', 'narrative-catalog.js'));

const USAGE = 'Use: narrative-catalog.cjs list | id <show_id> | archetype <word> | text <words...>';

function specFromArgv(argv) {
  if (argv.length === 1 && argv[0] === 'list') return { by: 'list' };
  if (argv.length === 2 && argv[0] === 'id') return { by: 'id', show_id: argv[1] };
  if (argv.length === 2 && argv[0] === 'archetype') return { by: 'archetype', archetype: argv[1] };
  if (argv.length >= 2 && argv[0] === 'text') return { by: 'text', text: argv.slice(1).join(' ') };
  return null;
}

function main(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const spec = specFromArgv(args);
  if (!spec) throw new Error(USAGE);
  const file = path.join(__dirname, '..', 'public', 'boards', 'narrative-boards.json');
  const raw = fs.readFileSync(file, 'utf8');
  const result = query(raw, spec);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exitCode = result.ok ? 0 : 1;
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  }
}

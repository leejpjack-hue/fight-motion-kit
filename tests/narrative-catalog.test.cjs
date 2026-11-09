const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const boardFile = path.join(repo, 'public', 'boards', 'narrative-boards.json');
const script = path.join(repo, 'scripts', 'narrative-catalog.cjs');
const api = require(path.join(repo, 'public', 'boards', 'narrative-catalog.js'));
const { query } = api;

const EXPECTED = [
  ['cold-open-rain-alley', 'cold-open', 'Rain alley'],
  ['cold-open-neon-door', 'cold-open', 'Neon door'],
  ['cold-open-rooftop-still', 'cold-open', 'Rooftop still'],
  ['cold-open-market-dawn', 'cold-open', 'Market dawn'],
  ['duel-schoolyard-line', 'duel', 'Schoolyard line'],
  ['duel-rooftop-circle', 'duel', 'Rooftop circle'],
  ['duel-teahouse-table', 'duel', 'Teahouse table'],
  ['duel-tram-platform', 'duel', 'Tram platform'],
  ['chase-night-market', 'chase', 'Night market'],
  ['chase-stairwell-drop', 'chase', 'Stairwell drop'],
  ['chase-tram-gap', 'chase', 'Tram gap'],
  ['chase-harbour-containers', 'chase', 'Harbour containers']
];

const CHASE_IDS = [
  'chase-night-market',
  'chase-stairwell-drop',
  'chase-tram-gap',
  'chase-harbour-containers'
];

const DUEL_IDS = [
  'duel-schoolyard-line',
  'duel-rooftop-circle',
  'duel-teahouse-table',
  'duel-tram-platform'
];

const MISS = {
  'bad-query': 'Query spec is not a list, id, archetype, or text query.',
  'bad-show-id': 'show_id must be a cold-open, duel, or chase board id.',
  'unknown-board': 'No narrative board has that show_id.',
  'unknown-archetype': 'Archetype must be cold-open, duel, or chase.',
  'empty-text': 'Text query is empty.'
};

function shippedText() {
  return fs.readFileSync(boardFile, 'utf8');
}

function beatAt(index) {
  const second = index + 1;
  return {
    beat_id: 's' + String(second).padStart(2, '0'),
    second: second,
    yue: '第' + second + '秒仍未出手。',
    en: 'Second ' + second + ' still holds.'
  };
}

function beats(count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(beatAt(i));
  return out;
}

function sampleBoard(showId, archetype, title, beatCount) {
  return {
    kind: 'narrative_board',
    show_id: showId,
    archetype: archetype,
    title: title,
    beats: beats(beatCount)
  };
}

function tenBoards() {
  return EXPECTED.slice(0, 10).map(function (row) {
    return sampleBoard(row[0], row[1], row[2], 30);
  });
}

function registry(boards) {
  return JSON.stringify({ kind: 'narrative_board_registry', boards: boards });
}

function assertMiss(result, code) {
  assert.equal(result.ok, false);
  assert.equal(result.code, code);
  assert.equal(result.message, MISS[code]);
  assert.deepEqual(result.boards, []);
}

function runCli(args, cwd) {
  return spawnSync(process.execPath, [script].concat(args), {
    cwd: cwd || repo,
    encoding: 'utf8'
  });
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function jsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push.apply(out, jsonFiles(full));
    else if (name.endsWith('.json')) out.push(full);
  }
  return out;
}

function diskIds() {
  const ids = new Set();
  for (const root of ['public/shows', 'kit/shows']) {
    for (const file of jsonFiles(path.join(repo, root))) {
      ids.add(path.basename(file, '.json'));
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data && typeof data === 'object' && !Array.isArray(data) && typeof data.show_id === 'string') {
        ids.add(data.show_id);
      }
    }
  }
  for (const file of ['public/presets/camera_presets.json', 'kit/presets/camera_presets.json']) {
    const data = JSON.parse(fs.readFileSync(path.join(repo, file), 'utf8'));
    for (const preset of data.presets || []) {
      if (preset && typeof preset.id === 'string') ids.add(preset.id);
    }
  }
  for (const file of ['public/blocks/beat_blocks.json', 'kit/blocks/beat_blocks.json']) {
    const data = JSON.parse(fs.readFileSync(path.join(repo, file), 'utf8'));
    for (const block of data.blocks || []) {
      if (block && typeof block.id === 'string') ids.add(block.id);
    }
  }
  return ids;
}

test('the catalog module exports query only', () => {
  assert.deepEqual(Object.keys(api), ['query']);
  assert.equal(globalThis.HMNarrativeCatalog, api);
});

test('list returns the twelve shipped boards in file order', () => {
  const shipped = shippedText();
  const doc = JSON.parse(shipped);
  assert.deepEqual(Object.keys(doc).sort(), ['boards', 'kind']);
  assert.equal(doc.kind, 'narrative_board_registry');
  assert.equal(doc.boards.length, 12);

  const listed = query(shipped, { by: 'list' });
  assert.equal(listed.ok, true);
  assert.equal(listed.code, 'ok');
  assert.equal(listed.message, '');
  assert.equal(listed.boards.length, 12);

  const yue = new Set();
  const en = new Set();
  for (let i = 0; i < EXPECTED.length; i++) {
    const raw = doc.boards[i];
    const board = listed.boards[i];
    assert.deepEqual(Object.keys(raw).sort(), ['archetype', 'beats', 'kind', 'show_id', 'title']);
    assert.equal(board.kind, 'narrative_board');
    assert.equal(board.show_id, EXPECTED[i][0]);
    assert.equal(board.archetype, EXPECTED[i][1]);
    assert.equal(board.title, EXPECTED[i][2]);
    assert.equal(board.duration_s, 30);
    assert.equal(board.beats.length, 30);
    assert.equal(Object.hasOwn(board, 'seed_show'), false);
    assert.equal(Object.hasOwn(board, 'atoms'), false);
    assert.equal(Object.hasOwn(board, 'plates'), false);
    for (let b = 0; b < board.beats.length; b++) {
      const beat = board.beats[b];
      const second = b + 1;
      assert.deepEqual(Object.keys(raw.beats[b]).sort(), ['beat_id', 'en', 'second', 'yue']);
      assert.equal(beat.beat_id, 's' + String(second).padStart(2, '0'));
      assert.equal(beat.second, second);
      assert.equal(beat.label, beat.en);
      assert.match(beat.yue, /\p{Script=Han}/u);
      assert.match(beat.en, /[A-Za-z]/);
      assert.equal(yue.has(beat.yue), false, beat.yue);
      assert.equal(en.has(beat.en), false, beat.en);
      yue.add(beat.yue);
      en.add(beat.en);
    }
  }
  assert.equal(yue.size, 360);
  assert.equal(en.size, 360);
});

test('id, archetype, and text answer the catalog questions', () => {
  const shipped = shippedText();
  const named = query(shipped, { by: 'id', show_id: 'chase-stairwell-drop' });
  assert.equal(named.ok, true);
  assert.equal(named.code, 'ok');
  assert.equal(named.boards.length, 1);
  assert.equal(named.boards[0].show_id, 'chase-stairwell-drop');
  assert.equal(named.boards[0].beats[0].beat_id, 's01');
  assert.equal(named.boards[0].beats[0].second, 1);
  assert.equal(named.boards[0].beats[29].beat_id, 's30');

  const chase = query(shipped, { by: 'archetype', archetype: 'Chase' });
  assert.deepEqual(chase.boards.map(board => board.show_id), CHASE_IDS);

  const duels = query(shipped, { by: 'archetype', archetype: 'duel' });
  assert.deepEqual(duels.boards.map(board => board.show_id), DUEL_IDS);

  const found = query(shipped, { by: 'text', text: 'rooftop' });
  assert.deepEqual(found.boards.map(board => board.show_id), [
    'cold-open-rooftop-still',
    'duel-rooftop-circle'
  ]);
  const folded = query(shipped, { by: 'text', text: '  ROOFTOP  ' });
  assert.deepEqual(folded.boards.map(board => board.show_id), [
    'cold-open-rooftop-still',
    'duel-rooftop-circle'
  ]);

  const rain = query(shipped, { by: 'list' }).boards[0];
  const byLine = query(shipped, { by: 'text', text: rain.beats[0].yue });
  assert.equal(byLine.ok, true);
  assert.equal(byLine.code, 'ok');
  assert.ok(byLine.boards.some(board => board.show_id === 'cold-open-rain-alley'));
});

test('miss codes stay on the query result', () => {
  const shipped = shippedText();
  assertMiss(query(shipped, { by: 'id', show_id: 'daiyu-wang-five-seconds' }), 'bad-show-id');
  assertMiss(query(shipped, { by: 'id', show_id: 'Duel-rooftop-circle' }), 'bad-show-id');
  assertMiss(query(shipped, { by: 'id', show_id: 'classroom' }), 'bad-show-id');
  assertMiss(query(shipped, { by: 'id', show_id: 'void-array' }), 'bad-show-id');
  assertMiss(query(shipped, { by: 'id', show_id: 'low_rise' }), 'bad-show-id');
  assertMiss(query(shipped, { by: 'id', show_id: 'street_wide_open' }), 'bad-show-id');
  assertMiss(query(shipped, { by: 'id', show_id: 'cold-open-no-such-board' }), 'unknown-board');
  assertMiss(query(shipped, { by: 'archetype', archetype: 'classroom' }), 'unknown-archetype');
  assertMiss(query(shipped, { by: 'text', text: '   ' }), 'empty-text');
  const empty = query(shipped, { by: 'text', text: 'zzzz-no-such-gloss' });
  assert.equal(empty.ok, true);
  assert.equal(empty.code, 'ok');
  assert.equal(empty.message, '');
  assert.equal(empty.boards.length, 0);
  assertMiss(query(shipped, null), 'bad-query');
  assertMiss(query(shipped, { q: 'duel' }), 'bad-query');
  assertMiss(query(shipped, { by: 'id', show_id: 'duel-rooftop-circle', archetype: 'duel' }), 'bad-query');
  assertMiss(query(shipped, { by: 'id', show_id: 1 }), 'bad-query');
  assertMiss(query(shipped, { by: 'list', extra: true }), 'bad-query');
});

test('a broken registry throws bad-registry before the spec is answered', () => {
  const base = tenBoards();
  assert.equal(query(registry(base), { by: 'list' }).boards.length, 10);

  const withSeed = structuredClone(base);
  withSeed[0].seed_show = 'daiyu-wang-five-seconds';
  const short = structuredClone(base);
  short[0].beats.pop();
  const wrong = structuredClone(base);
  wrong[0].archetype = 'duel';
  const cases = [
    [withSeed, 'seed_show'],
    [short, 'beats'],
    [wrong, 'archetype']
  ];
  for (const row of cases) {
    assert.throws(
      () => query(registry(row[0]), { by: 'list' }),
      (error) => {
        assert.equal(error.code, 'bad-registry');
        assert.match(error.message, /cold-open-rain-alley/);
        assert.match(error.message, new RegExp(row[1]));
        return true;
      }
    );
  }

  assert.throws(
    () => query(registry(base.slice(0, 9)), { by: 'list' }),
    (error) => error.code === 'bad-registry'
  );
  const onlyCold = base.map(function (board, index) {
    const copy = structuredClone(board);
    copy.show_id = 'cold-open-fixture-' + String(index + 1);
    copy.archetype = 'cold-open';
    copy.title = 'Fixture ' + String(index + 1);
    return copy;
  });
  assert.throws(
    () => query(registry(onlyCold), null),
    (error) => error.code === 'bad-registry'
  );
  assert.throws(
    () => query('{', { by: 'list' }),
    (error) => error.code === 'bad-registry'
  );
  assert.throws(
    () => query(null, { by: 'list' }),
    (error) => error.code === 'bad-registry'
  );
});

test('a result is frozen and a later query keeps the original text', () => {
  const shipped = shippedText();
  const first = query(shipped, { by: 'id', show_id: 'duel-rooftop-circle' });
  const line = first.boards[0].beats[0].en;
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.boards), true);
  assert.equal(Object.isFrozen(first.boards[0]), true);
  assert.equal(Object.isFrozen(first.boards[0].beats), true);
  assert.equal(Object.isFrozen(first.boards[0].beats[0]), true);
  const draft = structuredClone(first.boards[0]);
  draft.beats[0].en = 'Jack rewrote this gloss.';
  const second = query(shipped, { by: 'id', show_id: 'duel-rooftop-circle' });
  assert.equal(second.boards[0].beats[0].en, line);
  assert.notEqual(second.boards[0], first.boards[0]);
  assert.equal(draft.beats[0].en, 'Jack rewrote this gloss.');
  assert.equal(fs.readFileSync(boardFile, 'utf8'), shipped);
});

test('shipped show ids are disjoint from show, camera, and beat-block ids', () => {
  const ids = diskIds();
  assert.equal(ids.has('daiyu-wang-five-seconds'), true);
  assert.equal(ids.has('low_rise'), true);
  assert.equal(ids.has('street_wide_open'), true);
  const listed = query(shippedText(), { by: 'list' });
  for (const board of listed.boards) {
    assert.equal(ids.has(board.show_id), false, board.show_id);
  }
});

test('the list command reads the registry and writes no file', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'narrative-catalog-'));
  const boardsDir = path.join(repo, 'public', 'boards');
  const before = fs.readdirSync(boardsDir).sort();
  const beforeHash = sha256(boardFile);
  const listed = runCli(['list'], temp);
  assert.equal(listed.status, 0);
  assert.equal(listed.stderr, '');
  assert.equal(listed.stdout, JSON.stringify(query(shippedText(), { by: 'list' }), null, 2) + '\n');
  assert.equal(sha256(boardFile), beforeHash);
  assert.deepEqual(fs.readdirSync(temp), []);
  assert.deepEqual(fs.readdirSync(boardsDir).sort(), before);

  const byId = runCli(['id', 'cold-open-rain-alley']);
  assert.equal(byId.status, 0);
  assert.deepEqual(JSON.parse(byId.stdout).boards.map(board => board.show_id), ['cold-open-rain-alley']);

  const byArchetype = runCli(['archetype', 'duel']);
  assert.equal(byArchetype.status, 0);
  assert.deepEqual(JSON.parse(byArchetype.stdout).boards.map(board => board.show_id), DUEL_IDS);

  const byText = runCli(['text', 'rooftop']);
  assert.equal(byText.status, 0);
  assert.deepEqual(JSON.parse(byText.stdout).boards.map(board => board.show_id), [
    'cold-open-rooftop-still',
    'duel-rooftop-circle'
  ]);

  const badId = runCli(['id', 'daiyu-wang-five-seconds']);
  assert.equal(badId.status, 1);
  assert.equal(badId.stderr, '');
  assert.equal(JSON.parse(badId.stdout).code, 'bad-show-id');

  const usageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'narrative-catalog-usage-'));
  const usage = runCli(['--help'], usageDir);
  assert.equal(usage.status, 1);
  assert.equal(usage.stdout, '');
  assert.equal(usage.stderr, 'Use: narrative-catalog.cjs list | id <show_id> | archetype <word> | text <words...>\n');
  assert.deepEqual(fs.readdirSync(usageDir), []);
  assert.equal(sha256(boardFile), beforeHash);
});

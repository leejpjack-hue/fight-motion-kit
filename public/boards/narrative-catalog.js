(function (global) {
  'use strict';

  const ARCHETYPES = ['cold-open', 'duel', 'chase'];
  const BOARD_ID = new RegExp('^(' + ARCHETYPES.join('|') + ')-[a-z0-9][a-z0-9-]*$');
  const HAN = /\p{Script=Han}/u;
  const LATIN = /[A-Za-z]/;
  const MESSAGES = {
    'bad-query': 'Query spec is not a list, id, archetype, or text query.',
    'bad-show-id': 'show_id must be a cold-open, duel, or chase board id.',
    'unknown-board': 'No narrative board has that show_id.',
    'unknown-archetype': 'Archetype must be cold-open, duel, or chase.',
    'empty-text': 'Text query is empty.'
  };

  function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function badRegistry(field, showId) {
    const message = showId
      ? 'bad-registry: board ' + showId + ' field ' + field
      : 'bad-registry: field ' + field;
    const error = new Error(message);
    error.code = 'bad-registry';
    throw error;
  }

  function keyProblem(value, expected) {
    if (Object.getOwnPropertySymbols(value).length > 0) return 'symbol';
    const keys = Object.keys(value);
    const allowed = new Set(expected);
    for (let i = 0; i < keys.length; i++) {
      if (!allowed.has(keys[i])) return keys[i];
    }
    for (let i = 0; i < expected.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(value, expected[i])) return expected[i];
    }
    return '';
  }

  function parseBeat(beat, index, showId) {
    const second = index + 1;
    const beatId = 's' + String(second).padStart(2, '0');
    if (!isPlainObject(beat)) badRegistry('beats', showId);
    const problem = keyProblem(beat, ['beat_id', 'second', 'yue', 'en']);
    if (problem) badRegistry(problem, showId);
    if (beat.beat_id !== beatId) badRegistry('beat_id', showId);
    if (beat.second !== second) badRegistry('second', showId);
    if (typeof beat.yue !== 'string') badRegistry('yue', showId);
    if (typeof beat.en !== 'string') badRegistry('en', showId);
    const yue = beat.yue.trim();
    const en = beat.en.trim();
    if (!yue || !HAN.test(yue)) badRegistry('yue', showId);
    if (!en || !LATIN.test(en)) badRegistry('en', showId);
    return {
      beat_id: beatId,
      second: second,
      yue: yue,
      en: en,
      label: en
    };
  }

  function parseBoard(raw, byId) {
    const named = isPlainObject(raw) && typeof raw.show_id === 'string' ? raw.show_id : '';
    if (!isPlainObject(raw)) badRegistry('boards');
    const problem = keyProblem(raw, ['kind', 'show_id', 'archetype', 'title', 'beats']);
    if (problem) badRegistry(problem, named);
    if (raw.kind !== 'narrative_board') badRegistry('kind', named);
    const match = typeof raw.show_id === 'string' ? BOARD_ID.exec(raw.show_id) : null;
    if (!match) badRegistry('show_id', named);
    const id = match[0];
    if (raw.archetype !== match[1]) badRegistry('archetype', id);
    if (byId.has(id)) badRegistry('show_id', id);
    if (typeof raw.title !== 'string' || /[\r\n]/.test(raw.title)) badRegistry('title', id);
    const title = raw.title.trim();
    if (!title) badRegistry('title', id);
    if (!Array.isArray(raw.beats) || raw.beats.length !== 30) badRegistry('beats', id);
    const beats = [];
    for (let i = 0; i < raw.beats.length; i++) beats.push(parseBeat(raw.beats[i], i, id));
    return {
      kind: 'narrative_board',
      show_id: id,
      archetype: match[1],
      title: title,
      duration_s: 30,
      beats: beats
    };
  }

  function parseRegistry(rawText) {
    if (typeof rawText !== 'string') badRegistry('raw');
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      badRegistry('json');
    }
    if (!isPlainObject(data)) badRegistry('kind');
    const top = keyProblem(data, ['kind', 'boards']);
    if (top) badRegistry(top);
    if (data.kind !== 'narrative_board_registry') badRegistry('kind');
    if (!Array.isArray(data.boards) || data.boards.length < 10) badRegistry('boards');

    const boards = [];
    const byId = new Map();
    const byArchetype = new Map();
    for (let i = 0; i < ARCHETYPES.length; i++) byArchetype.set(ARCHETYPES[i], []);
    for (let i = 0; i < data.boards.length; i++) {
      const board = parseBoard(data.boards[i], byId);
      boards.push(board);
      byId.set(board.show_id, board);
      byArchetype.get(board.archetype).push(board);
    }
    for (let i = 0; i < ARCHETYPES.length; i++) {
      if (byArchetype.get(ARCHETYPES[i]).length === 0) badRegistry('archetype');
    }
    return { boards: boards, byId: byId, byArchetype: byArchetype };
  }

  function readSpec(spec) {
    if (!isPlainObject(spec) || Object.getOwnPropertySymbols(spec).length > 0) return null;
    const keys = Object.keys(spec);
    if (typeof spec.by !== 'string') return null;
    if (spec.by === 'list') return keys.length === 1 ? { by: 'list' } : null;
    if (spec.by === 'id' && keys.length === 2 && Object.prototype.hasOwnProperty.call(spec, 'show_id') && typeof spec.show_id === 'string') {
      return { by: 'id', show_id: spec.show_id };
    }
    if (spec.by === 'archetype' && keys.length === 2 && Object.prototype.hasOwnProperty.call(spec, 'archetype') && typeof spec.archetype === 'string') {
      return { by: 'archetype', archetype: spec.archetype };
    }
    if (spec.by === 'text' && keys.length === 2 && Object.prototype.hasOwnProperty.call(spec, 'text') && typeof spec.text === 'string') {
      return { by: 'text', text: spec.text };
    }
    return null;
  }

  function haystack(board) {
    let text = board.show_id + '\n' + board.archetype + '\n' + board.title;
    for (let i = 0; i < board.beats.length; i++) {
      text += '\n' + board.beats[i].yue + '\n' + board.beats[i].en;
    }
    return text.toLowerCase();
  }

  function freezeBoard(board) {
    for (let i = 0; i < board.beats.length; i++) Object.freeze(board.beats[i]);
    Object.freeze(board.beats);
    return Object.freeze(board);
  }

  function hit(boards) {
    const frozen = [];
    for (let i = 0; i < boards.length; i++) frozen.push(freezeBoard(boards[i]));
    return Object.freeze({
      ok: true,
      code: 'ok',
      message: '',
      boards: Object.freeze(frozen)
    });
  }

  function miss(code) {
    return Object.freeze({
      ok: false,
      code: code,
      message: MESSAGES[code],
      boards: Object.freeze([])
    });
  }

  function query(rawText, spec) {
    const parsed = parseRegistry(rawText);
    const read = readSpec(spec);
    if (!read) return miss('bad-query');
    if (read.by === 'list') return hit(parsed.boards);
    if (read.by === 'id') {
      if (!BOARD_ID.test(read.show_id)) return miss('bad-show-id');
      const board = parsed.byId.get(read.show_id);
      if (!board) return miss('unknown-board');
      return hit([board]);
    }
    if (read.by === 'archetype') {
      const name = read.archetype.trim().toLowerCase();
      const found = parsed.byArchetype.get(name);
      if (!found) return miss('unknown-archetype');
      return hit(found);
    }
    const text = read.text.trim().toLowerCase();
    if (!text) return miss('empty-text');
    const found = [];
    for (let i = 0; i < parsed.boards.length; i++) {
      if (haystack(parsed.boards[i]).includes(text)) found.push(parsed.boards[i]);
    }
    return hit(found);
  }

  const api = { query: query };
  global.HMNarrativeCatalog = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

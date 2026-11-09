/* HM-PF-06: Cantonese second-by-second board. Editable text only. No plates. */
(function (global) {
  'use strict';

  const KIND = 'hm-pf-06-board';
  const SOT_PATH = '/workspace/deliverables/fight-baijia-elfmage-void-array-2026-11-06/STORYBOARD-zh.md';
  const STORAGE_KEY = 'hm.pf06.board.text';
  const DEFAULT_FIELDS = Object.freeze(['秒', 'beat_id', '鏡頭']);
  const UNGENERATED = '未出板';

  function han(value) {
    return /[\u4e00-\u9fff]/.test(String(value || ''));
  }

  function splitRow(line) {
    return String(line).trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
  }

  function isSeparator(line) {
    if (!String(line).includes('|')) return false;
    const cells = splitRow(line);
    return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
  }

  function roleOf(header) {
    const name = String(header || '').trim();
    if (/^beat_id$/i.test(name) || name === '#' || /^id$/i.test(name)) return 'beat_id';
    if (/秒|^t(?:\s*\(s\))?$|^second$|^時間$/i.test(name)) return 'second';
    if (/鏡頭|^label$|^標$|動作|^beat$/i.test(name)) return 'label';
    if (/板|\bplate\b/i.test(name)) return 'plate';
    return '';
  }

  function rolesFor(fields) {
    const roles = {};
    fields.forEach(header => {
      const role = roleOf(header);
      if (role && !roles[role]) roles[role] = header;
    });
    return roles;
  }

  function findTable(text) {
    const lines = String(text).split(/\r?\n/);
    for (let i = 0; i < lines.length - 1; i++) {
      if (!lines[i].includes('|') || !isSeparator(lines[i + 1])) continue;
      const fields = splitRow(lines[i]).filter(Boolean);
      const rows = [];
      for (let j = i + 2; j < lines.length; j++) {
        if (!lines[j].trim() || !lines[j].includes('|')) break;
        rows.push(splitRow(lines[j]));
      }
      return { fields, rows };
    }
    return null;
  }

  function validSecond(value) {
    return /^\d+(?:\.\d+)?(?:\s*[–—-]\s*\d+(?:\.\d+)?)?$/.test(String(value || '').trim());
  }

  function parse(text) {
    const raw = String(text == null ? '' : text);
    let source = raw;
    if (raw.trim().startsWith('{')) {
      const json = JSON.parse(raw);
      if (!json || typeof json.text !== 'string') throw new Error('Board JSON needs the editable text field.');
      source = json.text;
    }
    const table = findTable(source);
    if (!table) throw new Error('Board text needs a markdown table with second marks and Cantonese beat labels.');
    const roles = rolesFor(table.fields);
    if (!roles.second) throw new Error('STORYBOARD-zh table needs a second-mark column. Headers stay unchanged.');
    if (!roles.label) throw new Error('STORYBOARD-zh table needs a Cantonese beat-label column. Headers stay unchanged.');
    if (!table.rows.length) throw new Error('Board table needs at least one beat.');
    const beats = table.rows.map((cells, index) => {
      const fields = {};
      table.fields.forEach((header, column) => { fields[header] = cells[column] == null ? '' : String(cells[column]).trim(); });
      const second = fields[roles.second];
      const label = fields[roles.label];
      const beatId = roles.beat_id && fields[roles.beat_id] ? fields[roles.beat_id] : 'beat-' + String(index + 1).padStart(2, '0');
      if (!validSecond(second)) throw new Error('Row ' + (index + 1) + ' is missing a second mark.');
      if (!han(label)) throw new Error('Row ' + (index + 1) + ' beat label must be Cantonese.');
      return { beat_id: beatId, second, label, fields };
    });
    return {
      kind: KIND,
      version: 1,
      text: source,
      fields: table.fields.slice(),
      beats,
    };
  }

  function cuesFromBrief(brief, seconds) {
    const lines = String(brief || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const explicit = [];
    lines.forEach(line => {
      const match = line.match(/^(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)\s+(.+)$/);
      if (match) explicit.push({ second: match[1] + '–' + match[2], label: match[3].trim() });
    });
    if (explicit.length) return explicit;
    const clauses = lines.flatMap(line => line.split(/[。；;]/)).map(part => part.trim()).filter(part => part && !part.startsWith('#'));
    const count = Number.isInteger(seconds) && seconds > 0 ? seconds : Math.max(clauses.length, 1);
    const cues = [];
    for (let i = 0; i < count; i++) {
      const written = clauses[i] || '';
      cues.push({ second: i + '–' + (i + 1), label: han(written) ? written : '第' + (i + 1) + '拍' });
    }
    return cues;
  }

  function formatTable(fields, beats) {
    const head = '| ' + fields.join(' | ') + ' |';
    const rule = '| ' + fields.map(() => '---').join(' | ') + ' |';
    const body = beats.map(beat => '| ' + fields.map(header => beat.fields[header] == null ? '' : beat.fields[header]).join(' | ') + ' |');
    return [head, rule].concat(body).join('\n');
  }

  function emit({ brief, seconds, showId, title, sourceText, sourcePath }) {
    const show_id = String(showId || 'cantonese-board').trim();
    if (!show_id) throw new Error('show_id is required.');
    let fields = DEFAULT_FIELDS.slice();
    let fields_from = 'v1-fallback';
    let source_path = null;
    if (sourceText) {
      fields = parse(sourceText).fields.slice();
      fields_from = 'source';
      source_path = sourcePath || SOT_PATH;
    }
    const roles = rolesFor(fields);
    if (!roles.second || !roles.label) throw new Error('Source STORYBOARD-zh headers need a second mark and a Cantonese beat label. Refusing to rename them.');
    const cues = cuesFromBrief(brief, seconds);
    const beats = cues.map((cue, index) => {
      const beat_id = 'beat-' + String(index + 1).padStart(2, '0');
      const row = {};
      fields.forEach(header => { row[header] = ''; });
      row[roles.second] = cue.second;
      row[roles.label] = cue.label;
      if (roles.beat_id) row[roles.beat_id] = beat_id;
      if (roles.plate) row[roles.plate] = UNGENERATED;
      if (!han(cue.label)) throw new Error('Beat label must be Cantonese.');
      return { beat_id, second: cue.second, label: cue.label, fields: row };
    });
    const heading = String(title || '粵語逐秒分鏡').trim();
    const text = [
      '# ' + heading,
      '',
      'show_id: ' + show_id,
      'fields_from: ' + fields_from,
      'source: ' + (source_path || 'absent'),
      'Jack GO：未批。出板同 rhythm／gen 要等 2 Story · Jack GO gate Approve。本板唔會自動出板。',
      '',
      formatTable(fields, beats),
      '',
    ].join('\n');
    return {
      kind: KIND,
      version: 1,
      show_id,
      title: heading,
      fields,
      fields_from,
      source_path,
      plates: 'none',
      go: 'required',
      text,
      beats,
      pf08: {
        kind: 'hm-pf-08-board',
        show_id,
        beats: beats.map(beat => ({ beat_id: beat.beat_id, label: beat.label })),
      },
    };
  }

  function sameFields(left, right) {
    if (!left || !right || left.length !== right.length) return false;
    return left.every((header, index) => header === right[index]);
  }

  function check(boardText, sourceText) {
    const board = typeof boardText === 'string' || (boardText && boardText.text) ? parse(typeof boardText === 'string' ? boardText : JSON.stringify(boardText)) : boardText;
    const errors = [];
    if (!board.beats || !board.beats.length) errors.push('Board has no beats.');
    (board.beats || []).forEach((beat, index) => {
      if (!validSecond(beat.second)) errors.push('Row ' + (index + 1) + ' is missing a second mark.');
      if (!han(beat.label)) errors.push('Row ' + (index + 1) + ' beat label must be Cantonese.');
    });
    if (sourceText) {
      const source = parse(sourceText);
      if (!sameFields(source.fields, board.fields)) {
        errors.push('STORYBOARD-zh headers diverged. Source: ' + source.fields.join(' | ') + '. Board: ' + board.fields.join(' | ') + '.');
      }
    }
    return { ok: errors.length === 0, errors, board };
  }

  function goAllows(approval) {
    return !!(approval && approval.Decision === 'Approve' && approval.step === 2 && approval.step_id === 'story');
  }

  function advance(target, approval) {
    const where = String(target || '');
    if (where !== 'rhythm' && where !== 'gen') throw new Error('Advance target must be rhythm or gen.');
    if (!goAllows(approval)) {
      throw new Error('Jack GO gate: Approve step 2 Story before ' + where + '. This skill does not generate plates.');
    }
    return {
      ok: true,
      advanced: false,
      target: where,
      plates: 'none',
      message: 'Jack GO is recorded. This skill does not generate plates and does not run ' + where + '.',
    };
  }

  function mount(root, opts) {
    if (!root || !root.querySelector) return null;
    const options = opts || {};
    const q = id => root.querySelector('#' + id);
    const box = q('hmBoardText');
    const status = q('hmBoardStatus');
    const file = q('hmBoardFile');
    const storage = options.storage || global.localStorage;
    if (!box) throw new Error('HM board surface needs an editable text area.');
    if (box.readOnly || box.disabled) throw new Error('HM board text must be editable.');
    function say(message) {
      if (status) status.textContent = message;
    }
    function gateApproved() {
      const gate = options.gate;
      return gate && gate.dataset && gate.dataset.state === 'approved';
    }
    function refresh() {
      const waiting = 'Editable board. Jack GO is required before gen or rhythm. No plates are generated here.';
      const saved = 'Jack GO is saved for this show. This board still does not generate plates.';
      say(gateApproved() ? saved : waiting);
    }
    try {
      const saved = storage && storage.getItem && storage.getItem(STORAGE_KEY);
      if (saved && !box.value) box.value = saved;
    } catch (_) { /* A full local store still leaves the text editable. */ }
    function remember() {
      try { if (storage && storage.setItem) storage.setItem(STORAGE_KEY, box.value); } catch (_) {}
      refresh();
    }
    box.addEventListener('input', remember);
    const open = q('hmBoardOpen');
    if (open && file) open.addEventListener('click', () => file.click());
    if (file) file.addEventListener('change', () => {
      const chosen = file.files && file.files[0];
      if (!chosen || !chosen.text) return;
      chosen.text().then(text => {
        const loaded = text.trim().startsWith('{') ? parse(text).text : text;
        box.value = loaded;
        remember();
      }).catch(error => say(error.message));
    });
    const copy = q('hmBoardCopy');
    if (copy) copy.addEventListener('click', () => {
      const done = () => say('Copied the editable board. Plates stay off until Jack GO.');
      if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
        global.navigator.clipboard.writeText(box.value).then(done).catch(() => say(box.value));
      } else done();
    });
    if (options.gate) {
      const approve = options.gate.querySelector && options.gate.querySelector('#pf09Approve');
      const rework = options.gate.querySelector && options.gate.querySelector('#pf09Rework');
      if (approve) approve.addEventListener('click', () => setTimeout(refresh, 0));
      if (rework) rework.addEventListener('click', () => setTimeout(refresh, 0));
    }
    refresh();
    return {
      focus() { box.focus(); root.open = true; },
      text() { return box.value; },
      refresh,
    };
  }

  const api = Object.freeze({
    KIND, SOT_PATH, STORAGE_KEY, DEFAULT_FIELDS, UNGENERATED,
    parse, emit, check, goAllows, advance, mount, sameFields, roleOf,
  });
  global.HMStoryboardBoard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

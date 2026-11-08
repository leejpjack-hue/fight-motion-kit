/* HM-PF-15/18/19. Template planning and preset maps; the shipped engine renders. */
(function (global) {
  'use strict';
  const C = global.HMComposeClient;
  const clone = value => JSON.parse(JSON.stringify(value));
  const TEMPLATE = Object.freeze({
    url: 'https://app.notion.com/p/40b9565776c68154a978edfd92c62652',
    title: 'Fight Camera Grammar Template', last_edited_at: '2026-11-01T11:46:06.416Z',
    fields: ['#', 't (s)', 'Role (Intent/Action/Reaction/Wide)', 'Shot size', 'Angle', 'Function / move', 'Preset id', 'Beat / action', 'FX (full / hitstop / none)', 'Camera clause (draft)'],
    formula: 'Camera: {angle}, {lens_mm}; camera {move} {direction} at {speed}, {purpose/end composition}.',
  });
  const ROLES = Object.freeze(['Wide', 'Intent', 'Action', 'Reaction']);
  const SIZES = Object.freeze(['EWS', 'WS', 'MWS', 'MS', 'MCU', 'CU', 'OTS', 'ECU', 'INS', 'POV', 'RXN', 'CUT']);
  const DEFAULTS = Object.freeze({
    Wide: { preset_id: 'eye_orbit', shot_size: 'WS', lens_mm: '28mm', purpose: 're-establish both fighters and the geography' },
    Intent: { preset_id: 'eye_hold', shot_size: 'MCU', lens_mm: '50mm', purpose: 'show the attacker finding an opening' },
    Action: { preset_id: 'eye_push', shot_size: 'CU', lens_mm: '85mm', purpose: 'follow the committed action' },
    Reaction: { preset_id: 'pull_aftermath', shot_size: 'RXN', lens_mm: '85mm', purpose: 'show the receiver and the consequence' },
  });
  const MOVES = Object.freeze({
    hold: ['holds', 'steady', 'zero speed'], rise: ['rises', 'upward', 'a deliberate pace'],
    push_in: ['pushes in', 'forward', 'a brisk pace'], pull_out: ['pulls out', 'backward', 'a deliberate pace'],
    orbit: ['orbits', 'around the pair', 'a slow deliberate pace'], lateral: ['tracks', 'laterally', 'a deliberate pace'],
    whip_pan: ['whip-pans', 'toward the opposing fighter', 'high speed'], dive: ['dives', 'downward', 'a brisk pace'],
    spiral: ['spirals', 'around the pair', 'a brisk pace'], snap: ['snaps', 'into the action', 'high speed'],
    fence_sweep: ['sweeps', 'across the scene', 'a brisk pace'],
  });
  function registry(catalog) {
    if (!Array.isArray(catalog?.presets)) throw Error('Load the current camera_presets.json.');
    const map = new Map();
    for (const preset of catalog.presets) {
      if (!preset?.id || map.has(preset.id)) throw Error('Missing or duplicate preset ID in camera catalog.');
      map.set(preset.id, preset);
    }
    return map;
  }
  function presetFor(id, catalog) {
    const preset = registry(catalog).get(id);
    if (!preset) throw Error('Missing camera preset: ' + id + '. Choose an ID in the current camera_presets.json.');
    if (!preset.angle || !MOVES[preset.move]) throw Error('Preset lacks planning angle/move metadata: ' + id);
    return preset;
  }
  function text(value, label) {
    if (typeof value !== 'string' || !value.trim() || /[\r\n]/.test(value)) throw Error('Fill a single-line ' + label + '.');
    return value.trim();
  }
  function clause(row, catalog) {
    const preset = presetFor(row.preset_id, catalog), move = MOVES[preset.move];
    const angle = { eye: 'eye level', ecu: 'extreme close-up', floor: 'floor level', waist_ots_L: 'waist OTS-L', waist_ots_R: 'waist OTS-R' }[preset.angle] || preset.angle.replaceAll('_', ' ');
    return 'Camera: ' + text(row.shot_size, 'shot size') + ' framing at ' + angle + ', ' + text(row.lens_mm, 'lens') +
      '; camera ' + move[0] + ' ' + text(row.direction, 'direction') + ' at ' + text(row.speed, 'speed') + ', to ' + text(row.purpose, 'purpose') + '.';
  }
  function boardIds(board, approval) {
    if (!board?.show_id || !Array.isArray(board.beats) || !board.beats.length || board.beats.length > 300) throw Error('Supply the approved PF-08 board with 1–300 beats.');
    const ids = board.beats.map(beat => beat?.beat_id || beat?.id);
    if (ids.some((id, i) => typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(id) ||
      (board.beats[i].beat_id && board.beats[i].id && board.beats[i].beat_id !== board.beats[i].id)) || new Set(ids).size !== ids.length) throw Error('Board beat IDs must be unique and consistent.');
    C.requireRhythmApproval(board, approval);
    return ids;
  }
  function matchShow(show, board, ids) {
    if (show?.show_id !== board.show_id || !Array.isArray(show.atoms) || show.atoms.length !== ids.length) throw Error('Camera plan does not match the open show.');
    const motion = value => { const result = clone(value || {}); delete result.grammar_role; return result; };
    show.atoms.forEach((atom, i) => {
      const beat = board.beats[i];
      if ((atom.beat_id || atom.id) !== ids[i] || (beat.label !== undefined && (atom.label || '') !== beat.label) ||
        (Object.hasOwn(beat, 'motion') && C.rhythmBoardSnapshot(motion(beat.motion)) !== C.rhythmBoardSnapshot(motion(atom.motion))) ||
        (Object.hasOwn(beat, 'fx_hooks') && C.rhythmBoardSnapshot(beat.fx_hooks) !== C.rhythmBoardSnapshot(atom.fx_hooks || []))) throw Error('Story changed at ' + ids[i] + '. Review the current board and export new input.');
    });
    if (!C.rhythmTiming(show).durations_valid) throw Error('Camera planning needs valid beat durations.');
  }
  function actualPreset(atom) {
    const segments = atom?.camera?.segments;
    if (segments?.length > 1 && new Set(segments.map(segment => segment.preset)).size > 1) throw Error('Camera clauses need one preset per beat. Disable Dual-segment cam or use one preset throughout this beat.');
    return segments?.[0]?.preset || (atom?.camera?.preset !== 'none' ? atom?.camera?.preset : undefined);
  }
  function rowFor(atom, index, t, catalog) {
    const saved = atom.camera_grammar || {}, role = saved.role || atom.grammar_role || atom.motion?.grammar_role;
    if (!ROLES.includes(role)) throw Error('Assign a grammar role to ' + atom.id + '.');
    const presetId = actualPreset(atom), preset = presetFor(presetId, catalog), def = DEFAULTS[role], move = MOVES[preset.move];
    const changed = saved.authored_preset_id && saved.authored_preset_id !== presetId;
    const row = { beat_id: atom.beat_id || atom.id, scene_id: saved.scene_id || 'scene-01', triplet: saved.triplet || (/^t(\d+)_/.exec(atom.id)?.[1] ? 'T' + /^t(\d+)_/.exec(atom.id)[1] : ''),
      t_s: t, role, shot_size: saved.shot_size || def.shot_size, angle: preset.angle, function_move: preset.move, preset_id: presetId,
      beat_action: saved.beat_action || atom.label || atom.id, fx: saved.fx || 'none', lens_mm: saved.lens_mm || def.lens_mm,
      direction: changed ? preset.direction || move[1] : saved.direction || preset.direction || move[1], speed: changed ? move[2] : saved.speed || move[2], purpose: saved.purpose || def.purpose };
    row.camera_clause = clause(row, catalog); return row;
  }
  function validate(sheet, catalog) {
    const ids = boardIds(sheet.board, sheet.approval);
    if (sheet.kind !== 'hm-scene-grammar' || sheet.version !== 1 || sheet.show_id !== sheet.board.show_id || !Array.isArray(sheet.rows) || sheet.rows.length !== ids.length) throw Error('Choose a complete scene grammar sheet.');
    const scenes = new Map();
    sheet.rows.forEach((row, i) => {
      if (!row || row.beat_id !== ids[i] || !ROLES.includes(row.role) || !SIZES.includes(row.shot_size) || !['none', 'hitstop', 'full'].includes(row.fx)) throw Error('Invalid or out-of-order grammar row ' + (i + 1));
      text(row.scene_id, 'scene ID'); text(row.triplet, 'triplet'); text(row.beat_action, 'beat/action');
      if (typeof row.t_s !== 'number' || !Number.isFinite(row.t_s) || row.t_s < 0) throw Error('Invalid beat-sheet time.');
      clause(row, catalog);
      if (!scenes.has(row.scene_id)) scenes.set(row.scene_id, []);
      scenes.get(row.scene_id).push(row);
    });
    for (const [scene, rows] of scenes) {
      const groups = new Map();
      const sequence = rows.filter(row => row.role !== 'Wide');
      for (let i = 0; i < sequence.length; i += 3) {
        const triplet = sequence.slice(i, i + 3);
        if (triplet.map(row => row.role).join(',') !== 'Intent,Action,Reaction' || new Set(triplet.map(row => row.triplet)).size !== 1) throw Error(scene + ' needs consecutive Intent → Action → Reaction triplets.');
      }
      rows.filter(row => row.role !== 'Wide').forEach(row => { if (!groups.has(row.triplet)) groups.set(row.triplet, []); groups.get(row.triplet).push(row); });
      if (!groups.size) throw Error(scene + ' needs an Intent → Action → Reaction triplet.');
      for (const [triplet, group] of groups) if (group.map(row => row.role).join(',') !== 'Intent,Action,Reaction') throw Error(scene + ' / ' + triplet + ' must be Intent → Action → Reaction exactly once.');
      if (!rows.some((row, i) => row.role === 'Wide' && rows.slice(0, i).some(before => before.role === 'Reaction'))) throw Error(scene + ' needs a Wide re-establish after a triplet.');
      for (const [triplet, group] of groups) if (group.filter(row => row.fx === 'full').length > 1) throw Error(scene + ' / ' + triplet + ' exceeds one full impact per triplet.');
    }
    return sheet;
  }
  function build(input, catalog, options = {}) {
    const board = input.board || input, approval = input.approval || options.approval, ids = boardIds(board, approval);
    const show = options.show || input.show;
    if (show) matchShow(show, board, ids);
    const design = options.design || input.design || {};
    if (design.rows && (!Array.isArray(design.rows) || new Set(design.rows.map(row => row.beat_id)).size !== design.rows.length || design.rows.some(row => !ids.includes(row.beat_id)))) throw Error('Design rows must name unique existing beat IDs.');
    const counters = new Map(); let t = 0;
    const rows = board.beats.map((beat, i) => {
      const atom = show?.atoms[i] || { ...beat, id: ids[i] }, saved = atom.camera_grammar || {};
      const override = design.rows?.find(row => row.beat_id === ids[i]) || {};
      const role = override.role || saved.role || beat.grammar_role || beat.motion?.grammar_role;
      if (!ROLES.includes(role)) throw Error('Assign Intent/Action/Reaction/Wide to ' + ids[i] + ' in the scene design.');
      const duration = show?.atoms[i].duration_s ?? beat.duration_s;
      if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0.1 || duration > 120) throw Error('Missing or invalid duration for ' + ids[i]);
      const def = DEFAULTS[role], scene = override.scene_id || saved.scene_id || beat.scene_id || 'scene-01';
      const n = counters.get(scene) || 1;
      const presetId = override.preset_id || def.preset_id, preset = presetFor(presetId, catalog), move = MOVES[preset.move];
      const row = { beat_id: ids[i], scene_id: scene, triplet: override.triplet || saved.triplet || (role === 'Wide' ? 'W' + (i + 1) : 'T' + n),
        t_s: +t.toFixed(4), role, shot_size: override.shot_size || def.shot_size, angle: preset.angle, function_move: preset.move, preset_id: presetId,
        beat_action: override.beat_action || beat.label || ids[i], fx: override.fx || 'none', lens_mm: override.lens_mm || def.lens_mm,
        direction: override.direction || preset.direction || move[1], speed: override.speed || move[2], purpose: override.purpose || def.purpose };
      row.camera_clause = clause(row, catalog); t += duration;
      if (role === 'Reaction') counters.set(scene, n + 1);
      return row;
    });
    const fightMeta = { 'Fight / show id': board.show_id, 'Duration (s)': +t.toFixed(4), 'Plate count': show ? show.atoms.reduce((sum, atom) => sum + (atom.hero?.plates?.length || 0), 0) : null,
      'Screen-LEFT fighter': show?.chars?.L?.name || null, 'Screen-RIGHT fighter': show?.chars?.R?.name || null, 'Geography / set': show?.venue || null,
      'Target triplet count': rows.filter(row => row.role === 'Intent').length, 'Full-impact budget': show?.rhythm?.impact_budget ?? null,
      'Finisher FX': null, 'Composer / kit tip': null, Notes: options.intent || design.intent || '' , ...(design.fight_meta || {}) };
    return validate({ kind: 'hm-scene-grammar', version: 1, show_id: board.show_id, source_template: clone(TEMPLATE), board: clone(board), approval: clone(approval), fight_meta: fightMeta, rows }, catalog);
  }
  function fromShow(show, catalog, approval) {
    const board = C.rhythmBoardFromShow(show); let source = { board, approval };
    try { C.requireRhythmApproval(board, approval); }
    catch (error) { if (!show.camera_authoring) throw error; source = show.camera_authoring; }
    const ids = boardIds(source.board, source.approval); matchShow(show, source.board, ids);
    const rows = []; let t = 0; const counters = new Map();
    show.atoms.forEach((atom, i) => {
      const row = rowFor(atom, i, +t.toFixed(4), catalog), n = counters.get(row.scene_id) || 1;
      if (!row.triplet) row.triplet = row.role === 'Wide' ? 'W' + (i + 1) : 'T' + n;
      if (row.role === 'Reaction') counters.set(row.scene_id, n + 1);
      rows.push(row); t += atom.duration_s;
    });
    const sheet = build({ board: source.board, approval: source.approval, show }, catalog, { design: { rows, fight_meta: source.fight_meta } });
    sheet.rows = rows; sheet.fight_meta['Duration (s)'] = +t.toFixed(4);
    return validate(sheet, catalog);
  }
  function author(sheet, catalog) {
    validate(sheet, catalog);
    const grammar = clone(sheet);
    grammar.rows.forEach(row => { const preset = presetFor(row.preset_id, catalog); row.angle = preset.angle; row.function_move = preset.move; row.camera_clause = clause(row, catalog); });
    return { kind: 'hm-camera-map', version: 1, show_id: sheet.show_id, grammar,
      shots: grammar.rows.map(row => ({ beat_id: row.beat_id, camera: { preset: row.preset_id }, camera_clause: clause(row, catalog) })) };
  }
  function apply(show, plan, catalog) {
    if (plan?.kind === 'hm-scene-grammar') plan = author(plan, catalog);
    if (plan?.kind !== 'hm-camera-map' || plan.version !== 1 || plan.show_id !== show?.show_id) throw Error('Choose a camera map for the open show.');
    const sheet = validate(plan.grammar, catalog), ids = boardIds(sheet.board, sheet.approval);
    matchShow(show, sheet.board, ids);
    if (!Array.isArray(plan.shots) || plan.shots.length !== ids.length || plan.shots.some((shot, i) => shot?.beat_id !== ids[i] || shot.camera?.preset !== sheet.rows[i].preset_id || shot.camera_clause !== clause(sheet.rows[i], catalog))) throw Error('Camera map and grammar rows disagree. Re-author the map.');
    const next = clone(show); let t = 0;
    next.atoms.forEach((atom, i) => {
      const row = sheet.rows[i], old = atom.camera || {}, camera = { preset: plan.shots[i].camera.preset };
      for (const key of ['nudge', 'intensity', 'params', 'ease', 'snap_zoom']) if (old[key] !== undefined) camera[key] = clone(old[key]);
      atom.camera = camera; delete atom.timing_hold;
      atom.grammar_role = row.role; atom.motion = { ...(atom.motion || {}), grammar_role: row.role };
      atom.camera_grammar = { ...clone(row), t_s: +t.toFixed(4), authored_preset_id: row.preset_id };
      for (const key of ['angle', 'function_move', 'preset_id', 'camera_clause']) delete atom.camera_grammar[key];
      t += atom.duration_s;
    });
    next.camera_authoring = { board: clone(sheet.board), approval: clone(sheet.approval), fight_meta: clone(sheet.fight_meta), source_template: clone(TEMPLATE) };
    return next;
  }
  function markdown(sheet, catalog) {
    validate(sheet, catalog);
    const escape = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');
    const lines = ['# Fight Camera Grammar · ' + sheet.show_id, '', 'Source: ' + TEMPLATE.url, '', '## Fight meta', '', '| Field | Value |', '| --- | --- |'];
    for (const [key, value] of Object.entries(sheet.fight_meta)) lines.push('| ' + escape(key) + ' | ' + escape(value) + ' |');
    for (const scene of new Set(sheet.rows.map(row => row.scene_id))) {
      lines.push('', '## Scene ' + escape(scene), '', '| ' + TEMPLATE.fields.join(' | ') + ' |', '| ' + TEMPLATE.fields.map(() => '---').join(' | ') + ' |');
      for (const row of sheet.rows.filter(row => row.scene_id === scene)) lines.push('| ' + [row.triplet, row.t_s, row.role, row.shot_size, presetFor(row.preset_id, catalog).angle, presetFor(row.preset_id, catalog).move, row.preset_id, row.beat_action, row.fx, clause(row, catalog)].map(escape).join(' | ') + ' |');
    }
    lines.push('', 'Wide is a coverage/framing role. Existing curves cannot turn a tight source plate into a genuine wide shot. Inspect the actual plate framing.', '');
    return lines.join('\n');
  }
  function chainFromFirst(show, indices, catalog, ease) {
    if (!Array.isArray(indices) || indices.length < 2 || new Set(indices).size !== indices.length || indices.some((i, n) => !Number.isInteger(i) || !show.atoms[i] || (n && i !== indices[n - 1] + 1))) throw Error('Select at least two adjacent clips.');
    const next = clone(show), head = next.atoms[indices[0]].camera || {}, preset = actualPreset(next.atoms[indices[0]]);
    presetFor(preset, catalog);
    const profile = { preset };
    for (const key of ['params', 'nudge', 'intensity', 'ease', 'snap_zoom']) if (head[key] !== undefined) profile[key] = clone(head[key]);
    indices.forEach(i => { next.atoms[i].camera = clone(profile); delete next.atoms[i].timing_hold; });
    const info = C.chainClipCameras(next.atoms, indices);
    if (ease !== undefined) indices.forEach(i => C.setCamEase(next.atoms[i].camera, ease));
    C.reflowAllCamChains(next.atoms);
    return { show: next, info };
  }
  global.HMCameraAuthor = Object.freeze({ TEMPLATE, ROLES, SIZES, DEFAULTS, registry, presetFor, clause, rowFor, validate, build, fromShow, author, apply, markdown, chainFromFirst });
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* Local camera grammar/maps; all movement still uses the shipped composer. */
(() => {
  'use strict';
  const S = window.HMStudio, C = window.HMComposeClient, A = window.HMCameraAuthor;
  const { $, on, safe } = S;
  const panel = document.createElement('details');
  panel.id = 'cameraGrammar'; panel.className = 'camera-grammar';
  panel.innerHTML = `<summary>Scene camera grammar</summary>
    <p class="field-hint">Edit Intent → Action → Reaction and a Wide re-establish per scene. The camera menu above overrides the preset. Clauses follow the current catalog move.</p>
    <div class="paired-fields"><label>Role<select id="grammarRole"><option value="">Assign role…</option>${A.ROLES.map(role => `<option>${role}</option>`).join('')}</select></label><label>Shot size<select id="grammarSize">${A.SIZES.map(size => `<option>${size}</option>`).join('')}</select></label></div>
    <div class="paired-fields wide-picker-row"><label>Wide establish preset<select id="widePresetPicker" aria-label="Wide establish preset"></select></label><div class="rhythm-actions wide-picker-actions"><button id="insertWideBeat" type="button">＋ Insert Wide re-establish</button><button id="markWideBeat" type="button">Mark beat as Wide</button></div></div>
    <div class="paired-fields"><label>Scene<input id="grammarScene" maxlength="80"></label><label>Triplet<input id="grammarTriplet" maxlength="80" placeholder="T1 / W1"></label></div>
    <label>Beat / action<input id="grammarAction" maxlength="240"></label>
    <div class="paired-fields"><label>Lens<input id="grammarLens" maxlength="40" placeholder="50mm"></label><label>Planned FX<select id="grammarFx"><option value="none">none</option><option value="hitstop">hitstop</option><option value="full">full</option></select></label></div>
    <label>Direction<input id="grammarDirection" maxlength="120"></label>
    <label>Speed<input id="grammarSpeed" maxlength="120"></label>
    <label>Purpose / end composition<input id="grammarPurpose" maxlength="240"></label>
    <p id="grammarPreset" class="field-hint"></p>
    <label>Camera clause (draft)<textarea id="grammarClause" rows="5" readonly></textarea></label>
    <p class="field-hint">Planned shot size, lens and FX describe the prompt; inspect actual plate framing. Existing curves cannot create a wide plate or change the rendered FX.</p>
    <div class="rhythm-actions"><button id="exportCameraInput" type="button">Export approved camera input</button><button id="importCameraPlan" type="button">Apply grammar / camera map…</button><button id="exportCameraGrammar" type="button">Export grammar JSON</button><button id="exportCameraSheet" type="button">Export editable beat sheet</button><button id="exportCameraClauses" type="button">Export Camera: clauses</button><button id="exportCameraClausesJson" type="button">Export Camera: clauses JSON</button></div>
    <p id="cameraGrammarValidation" class="field-hint" role="status"></p>
    <p id="cameraPlanStatus" class="field-hint" role="status" aria-live="polite"></p>
    <input id="cameraPlanInput" type="file" accept=".json,.txt,application/json,text/plain" hidden>`;
  $('camEase').closest('.settings-group').append(panel);
  const chain = document.createElement('div'); chain.className = 'camera-chain-author';
  chain.innerHTML = `<p id="cameraChainSelection" class="field-hint"></p><div class="rhythm-actions"><button id="chainFromFirst" type="button">Chain from first camera</button><button id="chainSnap" type="button">Chain + snap zoom</button></div><p class="field-hint">Shift-click adjacent clips. Both actions replace their moves and framing with the first camera, joined end → start. Snap zoom applies to the whole run. Undo restores all cameras.</p><p id="cameraChainStatus" class="field-hint" role="status"></p>`;
  $('camChainHint').before(chain);
  const fields = { grammarRole: 'role', grammarSize: 'shot_size', grammarScene: 'scene_id', grammarTriplet: 'triplet', grammarAction: 'beat_action', grammarLens: 'lens_mm', grammarFx: 'fx', grammarDirection: 'direction', grammarSpeed: 'speed', grammarPurpose: 'purpose' };
  function available() { if (S.loading || S.recording) throw Error('Wait for the current project operation to finish.'); }
  function approval() { return JSON.parse(localStorage.getItem(HMProductFlowGate.STORAGE_PREFIX + S.show.show_id) || 'null'); }
  function notRework() { if ($('pf09GatePanel').dataset.state === 'editing') throw Error('Story is in Rework. Review and Approve before camera authoring.'); }
  function input() {
    notRework();
    if ($('pf09GatePanel').dataset.state !== 'approved') throw Error('Approve the current story in the 2 Story gate first.');
    const show = S.show, board = C.rhythmBoardFromShow(show), go = approval();
    C.requireRhythmApproval(board, go);
    return { kind: 'hm-camera-input', version: 1, board, approval: go, show };
  }
  function sheet() { notRework(); return A.fromShow(S.show, S.cameraPresets, approval()); }
  function run() {
    const indices = S.selectedIndices;
    return indices.length > 1 ? indices : S.show.atoms[S.selectedIndex + 1] ? [S.selectedIndex, S.selectedIndex + 1] : [];
  }
  function refresh() {
    const show = S.show, atom = show?.atoms[S.selectedIndex]; if (!atom) return;
    const picker = $('widePresetPicker');
    if (picker && !picker.options.length && S.cameraPresets?.presets?.length) {
      for (const id of A.wideEstablishPresets(S.cameraPresets)) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = id === 'eye_orbit' ? 'eye_orbit · Wide re-establish' : id === 'low_rise' ? 'low_rise · Wide open' : id;
        picker.append(opt);
      }
      picker.value = A.widePresetFor(S.cameraPresets, { mode: 'reestablish' });
    }
    $('insertWideBeat').disabled = $('markWideBeat').disabled = !show?.atoms?.length || S.recording;
    let row;
    try { row = A.rowFor(atom, S.selectedIndex, 0, S.cameraPresets); }
    catch (_) {
      row = { ...atom.camera_grammar, role: atom.camera_grammar?.role || atom.grammar_role || atom.motion?.grammar_role || '', scene_id: atom.camera_grammar?.scene_id || 'scene-01', beat_action: atom.camera_grammar?.beat_action || atom.label || atom.id };
    }
    for (const [id, key] of Object.entries(fields)) if (document.activeElement !== $(id)) $(id).value = row[key] || '';
    $('grammarClause').value = row.camera_clause || 'Assign a role and choose a shipped camera preset to draft a clause.';
    $('grammarPreset').textContent = row.preset_id ? row.preset_id + ' · ' + row.angle + ' · ' + row.function_move : 'Choose a shipped camera preset above.';
    try { input(); $('exportCameraInput').disabled = false; } catch (_) { $('exportCameraInput').disabled = true; }
    let valid = false;
    const grammarLint = A.lintGrammar(show);
    try { const value = sheet(); valid = true; $('cameraGrammarValidation').textContent = value.rows.length + ' beat(s) · complete triplets and Wide coverage. Ready to export.'; }
    catch (error) {
      $('cameraGrammarValidation').textContent = grammarLint.findings.length && !error.message.includes('Wide')
        ? error.message + ' · ' + grammarLint.findings[0].message
        : error.message;
    }
    for (const id of ['exportCameraGrammar', 'exportCameraSheet', 'exportCameraClauses', 'exportCameraClausesJson']) $(id).disabled = !valid;
    const indices = run();
    $('chainFromFirst').disabled = $('chainSnap').disabled = indices.length < 2 || S.recording;
    $('cameraChainSelection').textContent = indices.length ? 'Clips ' + (indices[0] + 1) + '–' + (indices.at(-1) + 1) + ' · ' + indices.length + ' adjacent cameras' : 'Select a clip with a following neighbor, or Shift-click a run.';
  }
  for (const [id, key] of Object.entries(fields)) $(id).addEventListener('change', safe(() => {
    available(); const show = S.show, index = S.selectedIndex, atom = show.atoms[index];
    const value = $(id).value.trim();
    let row;
    try { row = A.rowFor(atom, index, 0, S.cameraPresets); }
    catch (_) {
      // Partial sheets remain editable; only complete, approved sheets export.
      const role = key === 'role' ? value : atom.camera_grammar?.role;
      row = A.rowFor({ ...atom, camera_grammar: { ...atom.camera_grammar, role } }, index, 0, S.cameraPresets);
    }
    row[key] = value;
    if (key === 'role') {
      const def = A.DEFAULTS[value]; if (!def) throw Error('Choose a grammar role.');
      row.shot_size = def.shot_size; row.lens_mm = def.lens_mm; row.purpose = def.purpose;
    }
    row.authored_preset_id = row.preset_id;
    for (const derived of ['angle', 'function_move', 'preset_id', 'camera_clause']) delete row[derived];
    let baseline;
    if (!show.camera_authoring && $('pf09GatePanel').dataset.state === 'approved') {
      const board = C.rhythmBoardFromShow(show), go = approval();
      try { C.requireRhythmApproval(board, go); baseline = { board, approval: go }; } catch (_) { /* Partial, unapproved sheets stay editable. */ }
    }
    S.editProject(project => {
      if (baseline) project.show.camera_authoring = baseline;
      const target = project.show.atoms[index]; target.camera_grammar = row;
      if (key === 'role') { target.grammar_role = value; target.motion = { ...(target.motion || {}), grammar_role: value }; }
    });
    $('cameraPlanStatus').textContent = 'Grammar updated. Save project retains these fields; Undo restores the previous edit.';
  }));
  const download = (suffix, value, type = 'application/json') => S.download(S.show.show_id + suffix, new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, 2)], { type }));
  on('insertWideBeat', () => {
    available();
    const preset_id = $('widePresetPicker')?.value || undefined;
    const result = A.insertWideBeat(S.show, S.selectedIndex, S.cameraPresets, { preset_id });
    S.editProject(project => { project.show = result.show; return result.index; });
    $('cameraPlanStatus').textContent = 'Inserted Wide re-establish beat (' + result.atom.id + ' · ' + result.preset_id + '). Undo restores the previous timeline.';
  });
  on('markWideBeat', () => {
    available();
    const preset_id = $('widePresetPicker')?.value || undefined;
    const result = A.markWideBeat(S.show, S.selectedIndex, S.cameraPresets, { preset_id });
    S.editProject(project => { project.show = result.show; });
    $('cameraPlanStatus').textContent = 'Marked ' + result.atom.id + ' as Wide (' + result.preset_id + '). Undo restores the previous beat.';
  });
  on('exportCameraInput', () => { available(); download('.camera-input.json', input()); $('cameraPlanStatus').textContent = 'Approved board and GO downloaded. Run hm-cam-grammar-scene locally.'; });
  on('exportCameraGrammar', () => { available(); download('.grammar.json', sheet()); });
  on('exportCameraSheet', () => { available(); download('.grammar.md', A.markdown(sheet(), S.cameraPresets), 'text/markdown'); });
  on('exportCameraClauses', () => { available(); download('.camera-clauses.txt', A.clausesText(sheet(), S.cameraPresets), 'text/plain'); $('cameraPlanStatus').textContent = 'Camera: clauses text downloaded locally.'; });
  on('exportCameraClausesJson', () => { available(); download('.camera-clauses.json', A.clauseMap(sheet(), S.cameraPresets)); $('cameraPlanStatus').textContent = 'Camera: clause map JSON downloaded locally.'; });
  on('importCameraPlan', () => { available(); notRework(); $('cameraPlanInput').click(); });
  $('cameraPlanInput').addEventListener('change', safe(async event => {
    const file = event.target.files[0]; if (!file) return;
    const token = S.destinationToken();
    try {
      available(); notRework();
      if (file.size > 1024 * 1024) throw Error('Camera plan exceeds 1 MiB.');
      const rawText = await file.text();
      const plan = /^\s*\{/.test(rawText) ? JSON.parse(rawText) : A.build(input(), S.cameraPresets, { design: rawText });
      const candidate = A.apply(S.show, plan, S.cameraPresets);
      if (!window.confirm('Apply camera grammar to ' + candidate.atoms.length + ' beats? This replaces their camera moves and chains. Timing, plates and rendered FX stay. Undo restores the current cameras.')) { $('cameraPlanStatus').textContent = 'Kept the current cameras.'; return; }
      const current = S.destinationToken(); available(); notRework();
      if (current.revision !== token.revision || current.request !== token.request) throw Error('The project changed. Select the camera plan again.');
      S.editProject(project => { project.show = candidate; });
      $('cameraPlanStatus').textContent = 'Camera grammar applied. Edit any field or override a preset above. Undo restores the previous cameras.';
    } catch (error) { $('cameraPlanStatus').textContent = 'Plan rejected: ' + error.message; throw error; }
    finally { event.target.value = ''; }
  }));
  for (const [id, ease] of [['chainFromFirst', undefined], ['chainSnap', 'snap']]) on(id, () => {
    available(); const indices = run(), candidate = A.chainFromFirst(S.show, indices, S.cameraPresets, ease);
    S.editProject(project => { project.show = candidate.show; });
    $('cameraChainStatus').textContent = indices.length + ' cameras chained using ' + candidate.info.preset + (ease ? ' · snap zoom' : '') + '. Preview the cuts; Undo restores the previous moves.';
  });
  window.addEventListener('hm:projectchange', refresh);
  $('pf09Approve').addEventListener('click', refresh); $('pf09Rework').addEventListener('click', refresh);
  window.ready.then(refresh);
})();

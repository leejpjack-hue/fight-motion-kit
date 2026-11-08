/* HM-PF-09: browser-local storyboard gate; n8n owns the Wait form. */
(function (global) {
  'use strict';
  const STEP2 = Object.freeze({
    step: 2,
    step_id: 'story',
    step_label: '2 Story',
    hm_ui_instruction: 'HM UI: atom sequence editor + HM-HF-07 timeline JSON',
  });
  const BOARD_INSTRUCTION = 'Atom sequence + HM-HF-07 timeline JSON';
  const STORAGE_PREFIX = 'hm.pf09.gate.';
  const clone = value => JSON.parse(JSON.stringify(value));
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function showOf(project) {
    if (!project?.show) throw new Error('Open a show before using the story gate.');
    return project.show;
  }
  function getLockPackSnapshot(project) {
    const show = showOf(project), snapshot = {};
    for (const key of ['chars', 'costume_lock', 'lock_pack']) {
      if (Object.hasOwn(show, key)) snapshot[key] = clone(show[key]);
    }
    for (const key of ['costume_lock', 'lock_pack']) {
      if (show.meta && Object.hasOwn(show.meta, key)) {
        (snapshot.meta ||= {})[key] = clone(show.meta[key]);
      }
    }
    return freeze(snapshot);
  }
  function restoreLockPack(project, snapshot) {
    const show = showOf(project);
    for (const key of ['chars', 'costume_lock', 'lock_pack']) {
      if (Object.hasOwn(snapshot, key)) show[key] = clone(snapshot[key]);
    }
    for (const key of ['costume_lock', 'lock_pack']) {
      if (snapshot.meta && Object.hasOwn(snapshot.meta, key)) {
        (show.meta ||= {})[key] = clone(snapshot.meta[key]);
      }
    }
    return project;
  }
  function buildGatePayload({ decision, notes = '', show_id = '', resume_form_url = '' }) {
    if (!['Approve', 'Rework'].includes(decision)) throw new Error('Choose Approve or Rework.');
    const payload = { Decision: decision, Notes: String(notes), show_id: String(show_id), ...STEP2 };
    if (resume_form_url) payload.resume_form_url = String(resume_form_url);
    return payload;
  }
  function recordDecision(showId, payload, storage = global.localStorage) {
    if (!showId || payload.show_id !== showId) throw new Error('A matching open show_id is required.');
    if (!storage?.setItem) throw new Error('Local storage unavailable; decision was not saved.');
    storage.setItem(STORAGE_PREFIX + showId, JSON.stringify(payload));
    return payload;
  }
  function resumeInstruction(payload) {
    return `${payload.hm_ui_instruction}\nOpen the PF-49 Wait S2 resume form: ${payload.resume_form_url || '{resumeFormUrl}'}\nDecision: ${payload.Decision}\nNotes: ${payload.Notes}\nshow_id: ${payload.show_id}\nstep: 2; step_id: story; step_label: 2 Story\nSubmit the form manually to resume n8n.`;
  }
  function applyApprove(project, notes = '', resumeFormUrlHint = '', storage = global.localStorage) {
    const payload = buildGatePayload({ decision: 'Approve', notes, show_id: showOf(project).show_id, resume_form_url: resumeFormUrlHint });
    if (global.HMComposeClient?.rhythmBoardFromShow) {
      payload.story_snapshot = global.HMComposeClient.rhythmBoardSnapshot(global.HMComposeClient.rhythmBoardFromShow(showOf(project)));
    }
    recordDecision(payload.show_id, payload, storage);
    return { ...payload, resume_instruction: resumeInstruction(payload) };
  }
  function applyRework(project, opts = {}) {
    // Capture current locks so edits made since the gate opened remain authoritative.
    const snapshot = getLockPackSnapshot(project);
    restoreLockPack(project, snapshot);
    const lockPackPreserved = JSON.stringify(getLockPackSnapshot(project)) === JSON.stringify(snapshot);
    if (!lockPackPreserved) throw new Error('Story lock pack could not be preserved.');
    const payload = buildGatePayload({ decision: 'Rework', notes: opts.notes, show_id: showOf(project).show_id, resume_form_url: opts.resume_form_url });
    const state = { ...payload, state: 'editing', lockPackPreserved, resume_instruction: resumeInstruction(payload) };
    opts.focusStoryboard?.(state);
    return state;
  }
  function mountGatePanel(rootEl, api) {
    const el = id => rootEl.querySelector('#' + id);
    const approveButton = el('pf09Approve'), reworkButton = el('pf09Rework');
    const notes = el('pf09GateNotes'), resume = el('pf09ResumeHint'), status = el('pf09GateStatus');
    const output = el('pf09ResumeInstruction');
    let openProject;
    el('pf09GateInstruction').textContent = STEP2.hm_ui_instruction;
    rootEl.dataset.step = String(STEP2.step);
    rootEl.dataset.stepId = STEP2.step_id;
    function refresh() {
      const project = api.getProject();
      const showId = project?.show?.show_id || '';
      approveButton.disabled = reworkButton.disabled = !showId;
      el('pf09GateShowId').textContent = showId || 'Open a show';
      if (project !== openProject) {
        openProject = project;
        notes.value = resume.value = output.value = '';
        output.hidden = true;
        rootEl.dataset.state = 'review';
        status.textContent = 'Choose Approve or Rework for step 2.';
        try {
          const saved = JSON.parse((api.storage || global.localStorage)?.getItem(STORAGE_PREFIX + showId) || 'null');
          if (saved?.Decision === 'Approve') status.textContent = 'Saved local Approve decision. Review again after editing; n8n resumes via its form.';
        } catch (_) { /* Saving reports storage errors when Approve is clicked. */ }
      }
    }
    function decide(decision) {
      try {
        refresh();
        api.beforeDecision?.();
        const project = api.getProject();
        const result = decision === 'Approve'
          ? applyApprove(project, notes.value, resume.value, api.storage || global.localStorage)
          : applyRework(project, { notes: notes.value, resume_form_url: resume.value, focusStoryboard: api.focusStoryboard });
        rootEl.dataset.state = decision === 'Approve' ? 'approved' : result.state;
        output.value = result.resume_instruction;
        output.hidden = false;
        status.textContent = decision === 'Approve'
          ? 'Approve saved on this device. Copy the instructions below to resume via the form.'
          : 'Rework: editing step 2 storyboard. Character and costume locks preserved.';
        return result;
      } catch (error) {
        status.textContent = 'Gate decision failed: ' + error.message;
        return null;
      }
    }
    approveButton.addEventListener('click', () => decide('Approve'));
    reworkButton.addEventListener('click', () => decide('Rework'));
    output.addEventListener('click', () => output.select());
    refresh();
    return { refresh, approve: () => decide('Approve'), rework: () => decide('Rework') };
  }
  global.HMProductFlowGate = Object.freeze({ STEP2, BOARD_INSTRUCTION, STORAGE_PREFIX, getLockPackSnapshot, restoreLockPack, buildGatePayload, recordDecision, applyRework, applyApprove, mountGatePanel });
})(typeof globalThis !== 'undefined' ? globalThis : this);

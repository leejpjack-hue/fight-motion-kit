/* HM-PF-11..14 and PF-17: local rhythm plans and the existing cold-open sample. */
(() => {
  'use strict';
  const S = window.HMStudio, C = window.HMComposeClient, { $, on, safe } = S;
  function approvedInput() {
    const show = S.project?.show;
    if (!show?.atoms?.length || $('pf09GatePanel').dataset.state !== 'approved') throw new Error('Approve the current story in the 2 Story gate first.');
    const board = C.rhythmBoardFromShow(show);
    const approval = JSON.parse(localStorage.getItem(HMProductFlowGate.STORAGE_PREFIX + show.show_id) || 'null');
    C.requireRhythmApproval(board, approval);
    return { kind: 'hm-rhythm-input', version: 1, board, approval };
  }
  function refresh() {
    const show = S.project?.show;
    const timing = C.rhythmTiming(show);
    const impact = C.impactBudget(show, S.timingPacks);
    $('rhythmTarget').value = show?.duration_target_s ?? '';
    $('impactBudget').value = impact.budget ?? '';
    const meter = $('impactMeter');
    meter.max = Math.max(impact.budget ?? 0, impact.slots_used, 1);
    meter.low = 0; meter.high = impact.budget ?? meter.max; meter.optimum = 0;
    meter.value = impact.slots_used;
    meter.setAttribute('aria-valuetext', impact.slots_used + ' impact slots used; budget ' + (impact.budget ?? 'unset'));
    $('impactReadout').textContent = impact.slots_used + ' / ' + (impact.budget ?? 'unset') + ' impact slots · ' +
      (impact.impact_time_s === null ? 'unknown' : impact.impact_time_s.toFixed(2) + 's') + ' impact time';
    $('impactWarning').textContent = impact.over_budget
      ? 'Over budget by ' + (-impact.remaining) + ' slot(s). Warning only; bake remains available.'
      : impact.budget === null ? 'Set an impact budget or import the skill plan.' : impact.remaining + ' impact slot(s) remaining.';
    $('rhythmPanel').dataset.budgetState = impact.over_budget ? 'warn' : 'ok';
    $('rhythmTiming').dataset.state = timing.state;
    $('rhythmTiming').textContent = timing.state === 'invalid' ? 'Timing invalid: fix missing clip durations or an invalid target before bake.'
      : timing.target_s === null ? 'Total ' + timing.total_s.toFixed(4) + 's · target unset.'
      : 'Total ' + timing.total_s.toFixed(4) + 's / target ' + timing.target_s.toFixed(4) + 's · Δ ' + (timing.delta_s > 0 ? '+' : '') + timing.delta_s.toFixed(4) + 's';
    try { approvedInput(); $('exportRhythmInput').disabled = false; }
    catch (_) { $('exportRhythmInput').disabled = true; }
    $('importRhythmPlan').disabled = !show?.atoms?.length || S.recording;
    $('rhythmTarget').disabled = $('impactBudget').disabled = !show;
  }
  $('rhythmTarget').addEventListener('change', safe(() => {
    if (S.loading || S.recording) throw new Error('Wait for the current project operation to finish.');
    const value = $('rhythmTarget').value;
    if (value && (!Number.isFinite(+value) || +value < 0.1 || +value > 120)) throw new Error('Target must be 0.1–120 seconds.');
    S.editProject(project => { if (value) project.show.duration_target_s = +value; else delete project.show.duration_target_s; });
  }));
  $('impactBudget').addEventListener('change', safe(() => {
    if (S.loading || S.recording) throw new Error('Wait for the current project operation to finish.');
    const value = $('impactBudget').value;
    if (value && (!Number.isInteger(+value) || +value < 0 || +value > 300)) throw new Error('Impact budget must be an integer between 0 and 300.');
    S.editProject(project => {
      project.show.rhythm ||= {};
      if (value) project.show.rhythm.impact_budget = +value; else delete project.show.rhythm.impact_budget;
    });
  }));
  on('exportRhythmInput', () => {
    const input = approvedInput();
    S.download(input.board.show_id + '.rhythm-input.json', new Blob([JSON.stringify(input, null, 2)], { type: 'application/json' }));
    S.status('Approved board + GO record downloaded. Run hm-rhythm-pacing locally.');
  });
  on('importRhythmPlan', () => $('rhythmPlanInput').click());
  $('rhythmPlanInput').addEventListener('change', safe(async event => {
    const file = event.target.files[0]; if (!file) return;
    const token = S.destinationToken();
    $('rhythmPlanStatus').textContent = 'Validating rhythm plan…';
    try {
      if (S.loading || S.recording) throw new Error('Wait for the current project operation to finish.');
      if (file.size > 1024 * 1024) throw new Error('Rhythm plan exceeds 1 MiB.');
      const plan = JSON.parse(await file.text());
      const candidate = C.applyRhythmPlan(S.project.show, plan, { timingPacks: S.timingPacks });
      if (!window.confirm('Apply ' + plan.mode + ' rhythm plan to ' + plan.duration_map.length + ' beat(s)? Target: ' + plan.target_s + 's. Undo restores the current timing.')) {
        $('rhythmPlanStatus').textContent = 'Kept the current timing.'; return;
      }
      const current = S.destinationToken();
      if (current.revision !== token.revision || current.request !== token.request || S.loading || S.recording) throw new Error('The project changed. Select the rhythm plan again.');
      S.editProject(project => { project.show = candidate; });
      $('rhythmPlanStatus').textContent = 'Rhythm plan applied. Edit clip durations or Undo to restore.';
      S.status('Rhythm plan applied. Edit clip durations or Undo to restore.');
    } catch (error) {
      $('rhythmPlanStatus').textContent = 'Plan rejected: ' + error.message;
      throw error;
    } finally { event.target.value = ''; }
  }));
  on('loadGrammarSample', () => S.openProject(S.builtIn('fight-cam-grammar-starter')));
  $('pf09Approve').addEventListener('click', refresh);
  $('pf09Rework').addEventListener('click', refresh);
  window.addEventListener('hm:projectchange', refresh);
  window.ready.then(refresh);
})();

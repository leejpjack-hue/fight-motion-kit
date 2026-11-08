/* HM-PF-53: browser-local Jack notify bridge. Renders the GATE-UX notify text;
   n8n owns Slack/form delivery and the Wait resume. No transport lives here. */
(function (global) {
  'use strict';
  const DECISIONS = Object.freeze(['Approve', 'Rework']);
  const RESUME_PLACEHOLDER = '{resumeFormUrl}';
  const NOTES_PLACEHOLDER = '{Notes}';
  // Step 2 mirrors HM-PF-09 STEP2 exactly; other gates follow PRODUCT-FLOW.md 1..9.
  const STEPS = Object.freeze([
    { step: 1, step_id: 'character', label: 'Character creation', anchor: 'plateJumpList', hm_ui_instruction: 'HM UI: plate + character edit (plate library / chars)' },
    { step: 2, step_id: 'story', label: 'Story', anchor: 'timelineJsonPanel', hm_ui_instruction: 'HM UI: atom sequence editor + HM-HF-07 timeline JSON' },
    { step: 3, step_id: 'rhythm', label: 'Rhythm', anchor: 'framePeekStrip', hm_ui_instruction: 'HM UI: duration, frame peek, scrub + beat blocks' },
    { step: 4, step_id: 'scene_cam_design', label: 'Scene cam-shot design', anchor: 'cutTransitionGroup', hm_ui_instruction: 'HM UI: camera-grammar templates + cut blocks' },
    { step: 5, step_id: 'per_scene_cam', label: 'Per-scene cam shots', anchor: 'camera', hm_ui_instruction: 'HM UI: per-atom camera presets' },
    { step: 6, step_id: 'sprite_gen', label: 'Sprite gen', anchor: 'importStrip', hm_ui_instruction: 'HM UI: staged strip picker (sprite-gen stays external; NOT PLAYABLE until SG-02)' },
    { step: 7, step_id: 'background', label: 'Background scene', anchor: 'backgroundMotionDetails', hm_ui_instruction: 'HM UI: background plates (crop, pan, span, parallax)' },
    { step: 8, step_id: 'foreground', label: 'Foreground', anchor: 'foregroundPanel', hm_ui_instruction: 'HM UI: foreground cutouts + IMPACT / COMPOSER-FX' },
    { step: 9, step_id: 'hm_compose', label: 'HTML Motion cam-shot compose', anchor: 'stage', hm_ui_instruction: 'HM UI: FE compose + 1280x720 canvas preview' },
  ].map(s => Object.freeze({ ...s, step_label: `${s.step} ${s.label}` })));
  const HOLD_STEP = Object.freeze({ step: 10, step_id: 'voice', step_label: '10 Voice', hold: 'HOLD / #41' });

  function stepOf(n) {
    const num = Number(n);
    if (num === HOLD_STEP.step) throw new Error('Step 10 Voice is HOLD (#41); no notify.');
    const found = STEPS.find(s => s.step === num);
    if (!found) throw new Error('Unknown gate step: ' + n);
    return found;
  }
  function deepLink(step, showId, origin = '') {
    const s = stepOf(step);
    const id = showId ? encodeURIComponent(String(showId)) : '{show_id}';
    return `${origin || ''}/ui/?show=${id}#${s.anchor}`;
  }
  function buildNotify({ step = 2, show_id = '', notes = '', resume_form_url = '', origin = '' } = {}) {
    const s = stepOf(step);
    const show = String(show_id || '') || '{show_id}';
    const link = deepLink(s.step, show_id, origin);
    const resume = String(resume_form_url || '') || RESUME_PLACEHOLDER;
    const noteText = String(notes || '') || NOTES_PLACEHOLDER;
    const title = `HM gate — Step ${s.step} ${s.label} — show ${show}`;
    const lines = [
      s.hm_ui_instruction,
      `HM UI location: ${link}`,
      `Resume form: ${resume}`,
      `Decision: ${DECISIONS.join('|')}`,
      `Notes: ${noteText}`,
      `show_id: ${show}`,
      `step: ${s.step}; step_id: ${s.step_id}; step_label: ${s.step_label}`,
      'Open HM UI, review/edit, then submit Approve or Rework in the n8n form to resume.',
    ];
    return Object.freeze({
      title, body: lines.join('\n'), text: `${title}\n${lines.join('\n')}`,
      fields: Object.freeze({
        step: s.step, step_id: s.step_id, step_label: s.step_label,
        decisions: DECISIONS, hm_ui_instruction: s.hm_ui_instruction,
        hm_ui_deep_link: link, resume_form_url: resume, Notes: noteText, show_id: show,
      }),
    });
  }
  async function copyText(text, nav = global.navigator) {
    if (!nav?.clipboard?.writeText) throw new Error('Clipboard unavailable; select the preview text to copy.');
    await nav.clipboard.writeText(text);
    return text;
  }
  function mountNotifyPanel(rootEl, api) {
    const el = id => rootEl.querySelector('#' + id);
    const select = el('pf53Step'), copyButton = el('pf53CopyNotify');
    const title = el('pf53Title'), body = el('pf53Body'), status = el('pf53Status');
    let last = null;
    if (select && !select.options?.length && global.document) {
      for (const s of STEPS) select.add(new global.Option(`S${s.step} · ${s.label}`, String(s.step)));
      const hold = new global.Option('S10 · Voice — HOLD #41', '10');
      hold.disabled = true;
      select.add(hold);
      select.value = '2';
    }
    function render() {
      const project = api.getProject?.();
      const showId = project?.show?.show_id || '';
      last = buildNotify({
        step: select?.value || 2, show_id: showId,
        notes: api.getNotes?.() || '', resume_form_url: api.getResumeHint?.() || '',
        origin: api.origin || '',
      });
      title.textContent = last.title;
      body.textContent = last.body;
      rootEl.dataset.step = String(last.fields.step);
      rootEl.dataset.stepId = last.fields.step_id;
      copyButton.disabled = !showId;
      status.textContent = showId
        ? 'Paste into Slack or the n8n form; decisions resume in n8n.'
        : 'Open a show to copy the notify.';
      return last;
    }
    async function copy() {
      try {
        const payload = render();
        await copyText(payload.text, api.navigator || global.navigator);
        status.textContent = `Notify copied for step ${payload.fields.step} — paste into Slack or the form. Nothing was sent.`;
        return payload;
      } catch (error) {
        status.textContent = 'Copy notify failed: ' + error.message;
        return null;
      }
    }
    select?.addEventListener('change', render);
    copyButton.addEventListener('click', copy);
    render();
    return { refresh: render, copy, get payload() { return last; } };
  }
  global.HMProductFlowNotify = Object.freeze({ STEPS, HOLD_STEP, DECISIONS, RESUME_PLACEHOLDER, stepOf, deepLink, buildNotify, copyText, mountNotifyPanel });
})(typeof globalThis !== 'undefined' ? globalThis : this);

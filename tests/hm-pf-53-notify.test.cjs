const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const source = read('public/ui/product-flow-notify.js');
const gateSource = read('public/ui/product-flow-gate.js');
const html = read('public/ui/index.html');
const app = read('public/ui/app.js');
const workflow = JSON.parse(read('docs/product-flow/hm-pf-53-notify-workflow.json'));
const plain = value => JSON.parse(JSON.stringify(value));
const FORBIDDEN = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|\/compose|\/api\/setup|api\.teqcon|:8770/;

function runtime() {
  let networkCalls = 0;
  const forbidden = () => { networkCalls++; throw new Error('Notify must stay local'); };
  const context = vm.createContext({ fetch: forbidden, XMLHttpRequest: forbidden, navigator: { sendBeacon: forbidden } });
  vm.runInContext(gateSource, context);
  vm.runInContext(source, context);
  return { notify: context.HMProductFlowNotify, gate: context.HMProductFlowGate, calls: () => networkCalls };
}
function element() {
  const listeners = {};
  return {
    value: '', textContent: '', dataset: {}, disabled: false,
    addEventListener(type, listener) { listeners[type] = listener; },
    click() { if (!this.disabled) return listeners.click?.({ preventDefault() {} }); },
    fire(type) { return listeners[type]?.({}); },
  };
}
function panelDOM() {
  const markup = html.match(/<section id="pf53NotifyPanel"[\s\S]*?<\/section>/)[0];
  const nodes = Object.fromEntries([...markup.matchAll(/<\w+\b[^>]*\bid="([^"]+)"[^>]*>/g)].map(m => {
    const node = element();
    node.disabled = /\bdisabled\b/.test(m[0]);
    return [m[1], node];
  }));
  nodes.pf53Step.value = '2';
  nodes.pf53Step.options = [1];
  nodes.pf53NotifyPanel.querySelector = selector => nodes[selector.slice(1)];
  return { root: nodes.pf53NotifyPanel, nodes, markup };
}

test('step 2 notify carries step id, Approve/Rework, deep-link and PF-09 instruction', () => {
  const { notify, gate } = runtime();
  const payload = notify.buildNotify({ step: 2, show_id: 'daiyu-wang-five-seconds', notes: 'Tighten beat two', resume_form_url: 'https://n8n.local/form/s2' });
  assert.equal(payload.title, 'HM gate — Step 2 Story — show daiyu-wang-five-seconds');
  assert.deepEqual(plain(payload.fields), {
    step: 2, step_id: 'story', step_label: '2 Story', decisions: ['Approve', 'Rework'],
    hm_ui_instruction: gate.STEP2.hm_ui_instruction,
    hm_ui_deep_link: '/ui/?show=daiyu-wang-five-seconds#timelineJsonPanel',
    resume_form_url: 'https://n8n.local/form/s2', Notes: 'Tighten beat two', show_id: 'daiyu-wang-five-seconds',
  });
  for (const line of [
    'HM UI: atom sequence editor + HM-HF-07 timeline JSON',
    'HM UI location: /ui/?show=daiyu-wang-five-seconds#timelineJsonPanel',
    'Resume form: https://n8n.local/form/s2',
    'Decision: Approve|Rework',
    'Notes: Tighten beat two',
    'show_id: daiyu-wang-five-seconds',
    'step: 2; step_id: story; step_label: 2 Story',
  ]) assert.ok(payload.body.split('\n').includes(line), line);
  assert.equal(payload.text, payload.title + '\n' + payload.body);
  // PF-09 step 2 contract stays the single source for id/label/instruction.
  for (const key of ['step', 'step_id', 'step_label', 'hm_ui_instruction']) assert.equal(payload.fields[key], gate.STEP2[key]);
});

test('S1..S9 each have unique step ids, Approve/Rework and an HM UI anchor; S10 Voice is HOLD', () => {
  const { notify } = runtime();
  assert.deepEqual(plain(notify.STEPS.map(s => s.step)), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(new Set(notify.STEPS.map(s => s.step_id)).size, 9);
  for (const s of notify.STEPS) {
    const p = notify.buildNotify({ step: s.step, show_id: 'x y', origin: 'http://127.0.0.1:8765' });
    assert.match(p.title, new RegExp(`^HM gate — Step ${s.step} `));
    assert.equal(p.fields.hm_ui_deep_link, `http://127.0.0.1:8765/ui/?show=x%20y#${s.anchor}`);
    assert.match(html, new RegExp(`id="${s.anchor}"`), `anchor ${s.anchor} exists in HM UI`);
    assert.match(p.body, /^HM UI: /);
    assert.match(p.body, /Decision: Approve\|Rework/);
    assert.match(p.body, new RegExp(`step_id: ${s.step_id};`));
  }
  assert.throws(() => notify.buildNotify({ step: 10 }), /HOLD/);
  assert.throws(() => notify.buildNotify({ step: 11 }), /Unknown gate step/);
  const blank = notify.buildNotify({ step: 3 });
  assert.match(blank.body, /Resume form: \{resumeFormUrl\}/);
  assert.match(blank.body, /show_id: \{show_id\}/);
  assert.match(blank.body, /Notes: \{Notes\}/);
});

test('panel renders preview, copies to clipboard only, and makes zero network calls', async () => {
  const { notify, calls } = runtime();
  const { root, nodes } = panelDOM();
  let project = null, clip = null;
  const panel = notify.mountNotifyPanel(root, {
    getProject: () => project, getNotes: () => 'fix beat', getResumeHint: () => '',
    navigator: { clipboard: { writeText: async text => { clip = text; } } },
  });
  assert.equal(nodes.pf53CopyNotify.disabled, true);
  assert.match(nodes.pf53Status.textContent, /Open a show/);
  project = { show: { show_id: 'story-one' } };
  panel.refresh();
  assert.equal(nodes.pf53CopyNotify.disabled, false);
  assert.equal(nodes.pf53Title.textContent, 'HM gate — Step 2 Story — show story-one');
  assert.match(nodes.pf53Body.textContent, /Notes: fix beat/);
  assert.equal(root.dataset.stepId, 'story');
  await nodes.pf53CopyNotify.click();
  assert.equal(clip, panel.payload.text);
  assert.match(nodes.pf53Status.textContent, /Nothing was sent/);
  nodes.pf53Step.value = '7';
  nodes.pf53Step.fire('change');
  assert.equal(root.dataset.stepId, 'background');
  assert.match(nodes.pf53Title.textContent, /Step 7 Background scene/);
  const failing = notify.mountNotifyPanel(panelDOM().root, { getProject: () => project, navigator: {} });
  assert.equal(await failing.copy(), null);
  assert.equal(calls(), 0);
});

test('panel is wired after the PF-09 gate and refreshed by update()', () => {
  assert.ok(html.indexOf('src="./product-flow-gate.js" defer') < html.indexOf('src="./product-flow-notify.js" defer'));
  assert.ok(html.indexOf('src="./product-flow-notify.js" defer') < html.indexOf('src="./app.js" defer'));
  assert.ok(html.indexOf('id="pf09GatePanel"') < html.indexOf('id="pf53NotifyPanel"'));
  assert.match(html, /PREVIEW · not sent/);
  assert.match(app, /function update\(\) \{\s*productFlowGatePanel\?\.refresh\(\);\s*productFlowNotifyPanel\?\.refresh\(\)/);
  assert.match(app, /HMProductFlowNotify\.mountNotifyPanel\(\$\('pf53NotifyPanel'\)/);
});

test('no compose/save API or transport in new notify source', () => {
  assert.doesNotMatch(source, FORBIDDEN);
  const panel = html.match(/<section id="pf53NotifyPanel"[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(panel, FORBIDDEN);
  assert.doesNotMatch(panel, /<form\b|action=/);
});

test('n8n workflow: notify between Gate prep and Wait for S1..S9, Slack stubbed, no HTTP/compose, S10 HOLD', () => {
  const { notify } = runtime();
  const byName = Object.fromEntries(workflow.nodes.map(n => [n.name, n]));
  const next = name => (workflow.connections[name]?.main || []).map(out => (out || []).map(c => c.node));
  assert.equal(workflow.nodes.some(n => /httpRequest|webhook$|executeCommand|writeBinaryFile|readWriteFile/i.test(n.type)), false);
  assert.doesNotMatch(JSON.stringify(workflow), FORBIDDEN);
  for (const s of notify.STEPS) {
    const n = `S${s.step}`;
    const prep = byName[`${n} Gate prep`], render = byName[`${n} Render notify`], slack = byName[`${n} Slack notify (stub)`];
    const wait = byName[`${n} Wait — Jack form`], gate = byName[`${n} Approve?`];
    assert.ok(prep && render && slack && wait && gate, n);
    const prepValues = Object.fromEntries(prep.parameters.assignments.assignments.map(a => [a.name, a.value]));
    assert.equal(prepValues.step_id, s.step_id);
    assert.equal(prepValues.hm_ui_instruction, s.hm_ui_instruction);
    assert.equal(prepValues.hm_anchor, s.anchor);
    assert.deepEqual(next(prep.name), [[render.name]]);
    assert.deepEqual(next(render.name), [[slack.name]]);
    assert.deepEqual(next(slack.name), [[wait.name]]);
    assert.deepEqual(next(wait.name), [[gate.name]]);
    assert.equal(next(gate.name)[1][0], prep.name, 'Rework loops to same gate');
    assert.match(render.parameters.jsCode, /HM gate — Step \$\{g\.step\} \$\{g\.label\} — show/);
    assert.match(render.parameters.jsCode, /Decision: Approve\|Rework/);
    assert.match(render.parameters.jsCode, /\$execution\.resumeFormUrl/);
    assert.equal(slack.disabled, true);
    assert.match(slack.credentials.slackApi.id, /PLACEHOLDER/);
    assert.equal(wait.parameters.resume, 'form');
    assert.deepEqual(wait.parameters.formFields.values.map(f => f.fieldLabel), ['Decision', 'Notes', 'show_id']);
    assert.deepEqual(wait.parameters.formFields.values[0].fieldOptions.values.map(o => o.option), ['Approve', 'Rework']);
  }
  const hold = byName['S10 Voice — HOLD #41'];
  assert.equal(hold.disabled, true);
  assert.equal(workflow.active, false);
});

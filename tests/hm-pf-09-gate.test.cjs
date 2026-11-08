const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const source = read('public/ui/product-flow-gate.js');
const html = read('public/ui/index.html');
const app = read('public/ui/app.js');
const plain = value => JSON.parse(JSON.stringify(value));
function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, String(value)) };
}
function runtime(storage = memoryStorage()) {
  let networkCalls = 0;
  const forbidden = () => { networkCalls++; throw new Error('Gate must stay local'); };
  const context = vm.createContext({ localStorage: storage, fetch: forbidden, XMLHttpRequest: forbidden, navigator: { sendBeacon: forbidden } });
  vm.runInContext(source, context);
  return { gate: context.HMProductFlowGate, context, storage, calls: () => networkCalls };
}
function fixture(id = 'story-one') {
  return { version: 1, show: {
    show_id: id, title: 'Current story',
    chars: { L: { name: 'Daiyu', costume: { color: 'blue' } }, R: { name: 'Wang' } },
    costume_lock: { palette: ['blue', 'white'] },
    lock_pack: { revision: 2, faces: ['left', 'right'] },
    meta: { costume_lock: { L: 'coat', R: 'vest' }, lock_pack: { seed: 42 }, unrelated: 'keep me' },
    atoms: [{ id: 'story-beat', duration_s: 1 }],
  }, layouts: { keep: true } };
}

// Minimal DOM for the actual static panel: no browser or external DOM package.
function element() {
  const listeners = {};
  return {
    value: '', textContent: '', dataset: {}, hidden: false, disabled: false,
    addEventListener(type, listener) { listeners[type] = listener; },
    click() { if (!this.disabled) return listeners.click?.({ preventDefault() {} }); },
    focus() { this.focused = true; },
    select() { this.selected = true; },
    scrollIntoView() { this.scrolled = true; },
  };
}
function panelDOM() {
  const markup = html.match(/<section id="pf09GatePanel"[\s\S]*?<\/section>/)[0];
  const nodes = Object.fromEntries([...markup.matchAll(/<\w+\b[^>]*\bid="([^"]+)"[^>]*>/g)].map(match => {
    const node = element();
    node.hidden = /\bhidden\b/.test(match[0]);
    node.disabled = /\bdisabled\b/.test(match[0]);
    return [match[1], node];
  }));
  const root = nodes.pf09GatePanel;
  root.querySelector = selector => nodes[selector.slice(1)];
  return { root, nodes, markup };
}

test('Wait S2 payload uses Decision/Notes/show_id and exact step 2 instructions', () => {
  const { gate } = runtime();
  const payload = gate.buildGatePayload({ decision: 'Rework', notes: 'Tighten beat two', show_id: 'story-one' });
  assert.deepEqual(plain(payload), {
    Decision: 'Rework', Notes: 'Tighten beat two', show_id: 'story-one',
    step: 2, step_id: 'story', step_label: '2 Story',
    hm_ui_instruction: 'HM UI: atom sequence editor + HM-HF-07 timeline JSON',
  });
  assert.equal(gate.BOARD_INSTRUCTION, 'Atom sequence + HM-HF-07 timeline JSON');
  assert.equal(gate.buildGatePayload({ decision: 'Approve' }).Notes, '');
  assert.throws(() => gate.buildGatePayload({ decision: 'approve' }), /Approve or Rework/);
});

test('lock snapshot is detached and recursively frozen; restore keeps unrelated show state', () => {
  const { gate } = runtime(), project = fixture();
  const before = plain(project), snapshot = gate.getLockPackSnapshot(project);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.chars.L.costume));
  assert.ok(Object.isFrozen(snapshot.meta.costume_lock));
  assert.ok(Object.isFrozen(snapshot.lock_pack.faces));
  project.show.chars.L.name = 'changed';
  project.show.meta.costume_lock.L = 'changed';
  project.show.atoms.push({ id: 'new-beat' });
  project.show.meta.unrelated = 'new metadata';
  gate.restoreLockPack(project, snapshot);
  assert.deepEqual(plain(project.show.chars), before.show.chars);
  assert.deepEqual(plain(project.show.meta.costume_lock), before.show.meta.costume_lock);
  assert.equal(project.show.meta.unrelated, 'new metadata');
  assert.equal(project.show.atoms.length, 2);
  project.show.chars.L.costume.color = 'red';
  assert.equal(snapshot.chars.L.costume.color, 'blue');
});

test('Rework preserves the whole current project and returns focus/state to step 2', () => {
  const { gate, calls } = runtime(), project = fixture();
  // A lock edit made after opening the gate must survive Rework.
  gate.getLockPackSnapshot(project);
  project.show.meta.lock_pack.seed = 99;
  const before = plain(project);
  let focused;
  const result = gate.applyRework(project, { notes: 'More intent', focusStoryboard: state => { focused = state; } });
  assert.deepEqual(plain(project), before);
  assert.equal(result.step, 2);
  assert.equal(result.step_id, 'story');
  assert.equal(result.Decision, 'Rework');
  assert.equal(result.state, 'editing');
  assert.equal(result.lockPackPreserved, true);
  assert.equal(focused, result);
  assert.equal(calls(), 0);
});

test('absent optional locks stay absent; a partial restore never clears existing chars', () => {
  const { gate } = runtime();
  const project = { show: { show_id: 'minimal', chars: { L: { name: 'Left' }, R: { name: 'Right' } }, atoms: [] } };
  const before = plain(project);
  gate.applyRework(project);
  gate.restoreLockPack(project, {});
  assert.deepEqual(plain(project), before);
  assert.equal(Object.hasOwn(project.show, 'meta'), false);
});

test('Approve persists an isolated local decision and leaves the project untouched with zero network', () => {
  const { gate, storage, calls } = runtime(), project = fixture();
  const before = plain(project);
  const result = gate.applyApprove(project, 'Jack GO', '{resumeFormUrl}');
  const saved = JSON.parse(storage.getItem('hm.pf09.gate.story-one'));
  assert.equal(saved.Decision, 'Approve');
  assert.equal(saved.Notes, 'Jack GO');
  assert.equal(saved.show_id, 'story-one');
  assert.equal(saved.step, 2);
  assert.equal(saved.step_id, 'story');
  assert.equal(saved.step_label, '2 Story');
  assert.equal(saved.resume_form_url, '{resumeFormUrl}');
  assert.match(result.resume_instruction, /Submit the form manually to resume n8n/);
  assert.match(result.resume_instruction, /Decision: Approve/);
  gate.applyApprove(fixture('story-two'), 'Other show');
  assert.equal(JSON.parse(storage.getItem('hm.pf09.gate.story-one')).Notes, 'Jack GO');
  assert.equal(JSON.parse(storage.getItem('hm.pf09.gate.story-two')).Notes, 'Other show');
  assert.deepEqual(plain(project), before);
  assert.equal(calls(), 0);
  assert.throws(() => gate.applyApprove({ show: {} }), /show_id/);
});

test('mount wires visible Approve/Rework controls, notes, instruction and copyable resume text', () => {
  const { gate, storage, calls } = runtime(), { root, nodes, markup } = panelDOM();
  let project = fixture();
  const mounted = gate.mountGatePanel(root, { getProject: () => project });
  for (const [id, label] of [['pf09Approve', 'Approve'], ['pf09Rework', 'Rework']]) {
    assert.match(markup, new RegExp('<button[^>]*id="' + id + '"[^>]*>' + label + '</button>'));
    assert.equal(nodes[id].hidden, false);
    assert.equal(nodes[id].disabled, false);
  }
  assert.doesNotMatch(markup.slice(0, markup.indexOf('<details')), /\bhidden\b/);
  assert.equal(nodes.pf09GateInstruction.textContent, gate.STEP2.hm_ui_instruction);
  assert.equal(nodes.pf09GateShowId.textContent, project.show.show_id);
  nodes.pf09GateNotes.value = 'Use this cut';
  nodes.pf09ResumeHint.value = '{resumeFormUrl}';
  nodes.pf09Approve.click();
  assert.equal(JSON.parse(storage.getItem('hm.pf09.gate.story-one')).Notes, 'Use this cut');
  assert.equal(root.dataset.state, 'approved');
  assert.equal(nodes.pf09ResumeInstruction.hidden, false);
  nodes.pf09ResumeInstruction.click();
  assert.equal(nodes.pf09ResumeInstruction.selected, true);
  const before = plain(project);
  nodes.pf09Rework.click();
  assert.equal(root.dataset.state, 'editing');
  assert.deepEqual(plain(project), before);
  assert.match(nodes.pf09ResumeInstruction.value, /Decision: Rework/);
  project = fixture('story-two');
  mounted.refresh();
  assert.equal(nodes.pf09GateShowId.textContent, 'story-two');
  assert.equal(nodes.pf09GateNotes.value, '');
  assert.equal(nodes.pf09ResumeHint.value, '');
  assert.equal(nodes.pf09ResumeInstruction.hidden, true);
  assert.equal(calls(), 0);
});

test('storage failure cannot claim approval and does not block Rework', () => {
  const { gate, calls } = runtime({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } });
  const { root, nodes } = panelDOM(), project = fixture();
  let focused = false;
  gate.mountGatePanel(root, { getProject: () => project, focusStoryboard: () => { focused = true; } });
  nodes.pf09Approve.click();
  assert.match(nodes.pf09GateStatus.textContent, /failed: quota/);
  assert.notEqual(root.dataset.state, 'approved');
  assert.equal(nodes.pf09ResumeInstruction.hidden, true);
  nodes.pf09Rework.click();
  assert.equal(focused, true);
  assert.equal(root.dataset.state, 'editing');
  assert.equal(calls(), 0);
});

test('panel disables decisions without an open show and reads saved approval on remount', () => {
  const { gate } = runtime(), { root, nodes } = panelDOM();
  let project;
  const mounted = gate.mountGatePanel(root, { getProject: () => project });
  assert.equal(nodes.pf09Approve.disabled, true);
  assert.equal(nodes.pf09Rework.disabled, true);
  project = fixture();
  mounted.refresh();
  nodes.pf09Approve.click();
  const next = panelDOM();
  gate.mountGatePanel(next.root, { getProject: () => project });
  assert.match(next.nodes.pf09GateStatus.textContent, /Saved local Approve decision/);
});

test('actual app hooks open JSON and focus atom editing without reload or compile', () => {
  const { context, calls } = runtime(), { nodes } = panelDOM();
  const project = fixture(), before = plain(project), clip = element(), summary = element();
  nodes.timelineJsonPanel = element();
  nodes.timelineJsonPanel.querySelector = () => summary;
  nodes.timelineClips = { querySelector: () => clip };
  nodes.shellFocusTimeline = element();
  let paused = 0, rendered = 0;
  Object.assign(context, {
    window: context, project, loading: false,
    $: id => nodes[id], safe: fn => fn,
    requireEditable() {}, pause() { paused++; }, renderTimelineJsonPanel() { rendered++; },
  });
  // Run the exact thin integration block, avoiding boot and any browser runtime.
  const hook = app.slice(app.indexOf('  function focusStoryboard() {'), app.indexOf("  on('timelineJsonCopy'"));
  vm.runInContext(hook, context);
  nodes.pf09Rework.click();
  assert.equal(nodes.timelineJsonPanel.open, true);
  assert.equal(nodes.shellFocusTimeline.checked, true);
  assert.equal(clip.focused, true);
  assert.equal(clip.scrolled, true);
  assert.equal(paused, 1);
  assert.equal(rendered, 1);
  assert.deepEqual(plain(project), before);
  nodes.timelineClips.querySelector = () => null;
  nodes.pf09OpenStory.click();
  assert.equal(summary.focused, true);
  assert.equal(calls(), 0);
  assert.match(app, /function update\(\) \{\s*productFlowGatePanel\?\.refresh\(\)/);
  assert.ok(html.indexOf('src="./product-flow-gate.js" defer') < html.indexOf('src="./app.js" defer'));
});

test('gate source contains no transport or compose API tokens', () => {
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|\/compose|\/api\/setup/);
});

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'public/ui/index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public/ui/styles.css'), 'utf8');
const uiLayout = fs.readFileSync(path.join(ROOT, 'public/ui/ui-layout.js'), 'utf8');

test('HM-UI-REDESIGN: studio focus rail includes Media, Preview, Timeline, Clip, and QA modes', () => {
  const nav = html.match(/<nav class="shell-rail"[\s\S]*?<\/nav>/);
  assert.ok(nav, 'shell-rail nav present');
  for (const id of ['shellFocusDeck', 'shellFocusMedia', 'shellFocusPreview', 'shellFocusTimeline', 'shellFocusClip', 'shellFocusQa']) {
    assert.match(nav[0], new RegExp(`id="${id}"`), `${id} radio present`);
  }
  assert.ok(html.includes('<script src="/ui/ui-layout.js" defer></script>'), 'ui-layout.js loaded');
});

test('HM-UI-REDESIGN: inspector separates core tweak groups from advanced drawers without breaking IDs', () => {
  for (const id of [
    'clipIdentityCard',
    'timingSettingsGroup',
    'cameraSettingsGroup',
    'camAdvancedDrawer',
    'fxSettingsGroup',
    'captionSettingsGroup',
    'rhythmTimingGroup',
    'cutTransitionGroup',
    'beatBlockGroup',
    'catalogQuery',
    'starterSamplesDrawer'
  ]) {
    assert.ok(html.includes(`id="${id}"`), `${id} exists in index.html`);
  }
  // Core inspector groups are ordered ahead of advanced rhythm, cut-in, and beat-block groups
  assert.match(css, /#timingSettingsGroup\{order:3\}/);
  assert.match(css, /#cameraSettingsGroup\{order:4\}/);
  assert.match(css, /#fxSettingsGroup\{order:5\}/);
  assert.match(css, /#captionSettingsGroup\{order:6\}/);
  assert.match(css, /#rhythmTimingGroup\{order:8\}/);
  assert.match(css, /#cutTransitionGroup\{order:9\}/);
  assert.match(css, /#beatBlockGroup\{order:10\}/);
});

test('HM-UI-REDESIGN: mobile shell styles provide sticky stage, bottom tab bar, and bottom-sheet dialogs', () => {
  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(css, /main\.stage-well\{[^}]*position:sticky;top:0/);
  assert.match(css, /nav\.shell-rail\{[^}]*position:fixed;left:0;right:0;bottom:0/);
  assert.match(css, /@media\(max-width:600px\)/);
  assert.match(css, /#exportDialog\[open\]>\\.export-options\{order:1|#exportDialog\[open\]>\.export-options\{order:1/);
});

test('HM-UI-REDESIGN: ui-layout.js stays strictly local FE-only with zero backend calls', () => {
  assert.doesNotMatch(uiLayout, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|api\.teqcon|wrangler|:8770/);
  assert.match(uiLayout, /window\.HMUiLayout\s*=/);
});

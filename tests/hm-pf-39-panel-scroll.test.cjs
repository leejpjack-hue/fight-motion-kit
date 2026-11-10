const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('public/ui/index.html', 'utf8');
const css = fs.readFileSync('public/ui/styles.css', 'utf8');
const controls = fs.readFileSync('public/ui/foreground-controls.js', 'utf8');
const skill = fs.readFileSync('skills/hm-fg-layer-author/SKILL.md', 'utf8');

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, startMarker + ' .. ' + endMarker);
  return source.slice(start, end);
}

test('HM-PF-39: break and camera jumps reuse the HM-FG-PANEL-SCROLL panel', () => {
  const sticky = sliceBetween(html, 'id="fgStickyTop"', 'id="fgCamNote"');
  assert.match(sticky, /id="fgAdd"/);
  assert.match(sticky, /id="fgProp"/);
  assert.match(sticky, /id="fgJumpBreak"/);
  assert.match(sticky, /id="fgJumpCam"/);
  assert.match(sticky, /Jump to foreground controls/);
  assert.doesNotMatch(sticky, /id="fgSlot"/);
  assert.doesNotMatch(sticky, /id="fgSlotNote"/);
  assert.ok(html.indexOf('id="fgCamNote"') < html.indexOf('id="fgSlot"'));
  assert.ok(html.indexOf('id="fgSlotNote"') < html.indexOf('id="fgPropList"'));
  assert.ok(html.indexOf('id="fgCamBox"') < html.indexOf('id="fgSkillHint"'));
  assert.match(html, /id="fgEffect"/);
  assert.match(html, /id="fgEffectT"/);
  assert.match(html, /id="fgCamPreset"/);
  assert.match(html, /id="loadClassroomDense"/);
  assert.doesNotMatch(html, /stitch/i);

  assert.match(css, /\.foreground-panel\{[^}]*overflow-y:auto/);
  assert.match(css, /\.fg-sticky-top\{[^}]*position:sticky/);
  assert.match(css, /\.fg-break-box\{[^}]*position:sticky;bottom:0/);
  assert.match(css, /\.fg-prop-list\{[^}]*overflow-y:auto/);
  assert.match(css, /\.fg-jump\{display:flex/);

  assert.match(controls, /function scrollFgTarget/);
  assert.match(controls, /panel\.scrollTop/);
  assert.match(controls, /preventScroll:\s*true/);
  assert.match(controls, /fgJumpBreak/);
  assert.match(controls, /fgJumpCam/);
  assert.doesNotMatch(controls, /scrollIntoView/);
  assert.doesNotMatch(controls, /voice|sfx|#41|stitch/i);

  assert.match(skill, /HM-FG-PANEL-SCROLL-2026-10-30/);
  assert.match(skill, /#fgJumpBreak/);
  assert.match(skill, /#fgJumpCam/);
  assert.match(skill, /outside the\nsticky header/);
});

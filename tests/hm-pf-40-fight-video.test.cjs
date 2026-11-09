const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.join(__dirname, '..');
const skillDir = path.join(repo, 'skills/html-motion-fight-video');
const skillPath = path.join(skillDir, 'SKILL.md');

test('HM-PF-40 fight-video skill sequences FE compose and Jack GO gates', () => {
  const text = fs.readFileSync(skillPath, 'utf8');
  assert.match(text, /^---\nname: html-motion-fight-video\ndescription: .+\n---\n/);
  assert.deepEqual(fs.readdirSync(skillDir).sort(), ['SKILL.md']);
  assert.match(text, /Do not add `agents\/openai\.yaml`/);

  const links = [...text.matchAll(/\]\(([^)]+)\)/g)].map(match => match[1]);
  assert.ok(links.length >= 6);
  for (const link of links) {
    assert.equal(link.startsWith('http'), false, link);
    const target = path.resolve(path.dirname(skillPath), link.split('#')[0]);
    assert.equal(fs.existsSync(target), true, link);
  }

  const sequence = text.split('## Sequence')[1].split('## Jack GO gates')[0];
  const order = [
    '../hm-character-lock/SKILL.md',
    'skills/hm-storyboard-cantonese/SKILL.md',
    '../hm-rhythm-pacing/SKILL.md',
    '../hm-cam-grammar-scene/SKILL.md',
    '../hm-cam-shot-author/SKILL.md',
    '../hm-spritegen-handoff/SKILL.md',
    'skills/hm-bg-scene-author/SKILL.md',
    'skills/hm-fg-layer-author/SKILL.md',
    '../hm-compose-fx-impact/SKILL.md',
    '../html-motion-composer/SKILL.md',
    'skills/hm-voice-track/SKILL.md',
  ];
  let cursor = -1;
  for (const name of order) {
    const at = sequence.indexOf(name);
    assert.ok(at > cursor, name);
    cursor = at;
  }

  for (const script of [
    'skills/html-motion-composer/scripts/build-project.cjs',
    'skills/html-motion-composer/scripts/export-project.cjs',
    'skills/html-motion-composer/scripts/frame-qa.cjs',
  ]) {
    assert.match(text, new RegExp(script.replaceAll('.', '\\.')));
    assert.equal(fs.existsSync(path.join(repo, script)), true, script);
  }

  assert.match(text, /2 Story · Jack GO gate/);
  assert.match(text, /Never manufacture a GO file/);
  assert.match(text, /NOT PLAYABLE/);
  assert.match(text, /issue #41/);
  assert.match(text, /Do not create `skills\/hm-voice-track\/SKILL\.md`/);
  assert.match(text, /api\.teqcon\.uk/);
  assert.match(text, /:8770/);
  assert.match(text, /wrangler deploy/);
  assert.match(text, /Do not add strip-import code/);
  assert.match(sequence, /Do not invent `wide_\*` camera curves/);
});

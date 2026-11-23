'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

require('../public/ui/compose-client.js');
require('../public/ui/motion-renderer.js');

const C = HMComposeClient;
const read = rel => JSON.parse(fs.readFileSync(rel, 'utf8'));
const street = () => read('public/shows/street-old-city.json');
const compose = show => C.composeShow(show, {
  cameraPresets: read('public/presets/camera_presets.json'),
  fxPresets: read('public/presets/fx_presets.json'),
  loadJson: async rel => read('public/' + rel),
});

test('HM-RUN-02: normalizeForeground validates pass_by options and preserves them through composeShow', async () => {
  const show = street();
  show.fg = {
    cam: { preset: 'parallax', amount: 0.45, nudge: { x: 0, y: 0, s: 0 } },
    props: [
      {
        id: 'pole-1',
        src: 'public/shows/street-old-city.json',
        x: 900,
        y: 360,
        scale: 1,
        z: 20,
        t_start: 0.5,
        t_end: 4.5,
        pass_by: {
          enabled: true,
          direction: 'left',
          parallax_mult: 2.2,
          spacing_px: 1600,
          phase_offset_px: 120,
          motion_blur: 0.5,
        },
      },
      {
        id: 'legacy-prop',
        src: 'public/shows/street-old-city.json',
        x: 200,
        y: 500,
        scale: 1,
        z: 10,
        t_start: 0,
        t_end: 5,
      },
    ],
  };
  const out = await compose(show);
  assert.equal(out.ok, true, JSON.stringify(out.errors));
  const pbProp = out.timeline.fg.props.find(p => p.id === 'pole-1');
  const legacy = out.timeline.fg.props.find(p => p.id === 'legacy-prop');
  assert.equal(pbProp.pass_by.enabled, true);
  assert.equal(pbProp.pass_by.parallax_mult, 2.2);
  assert.equal(pbProp.pass_by.spacing_px, 1600);
  assert.equal(legacy.pass_by, undefined);

  const badDir = street();
  badDir.fg = { props: [{ id: 'p1', src: 'a.png', t_start: 0, t_end: 5, pass_by: { enabled: true, direction: 'diagonal' } }] };
  assert.equal((await compose(badDir)).ok, false);

  const badSpacing = street();
  badSpacing.fg = { props: [{ id: 'p1', src: 'a.png', t_start: 0, t_end: 5, pass_by: { enabled: true, spacing_px: 40 } }] };
  assert.equal((await compose(badSpacing)).ok, false);
});

test('HM-RUN-02: fgPassByInstances loops deterministically inside [t_start, t_end] and empties outside', () => {
  const prop = {
    id: 'rail-1',
    x: 900,
    y: 520,
    scale: 1.2,
    t_start: 1.0,
    t_end: 4.0,
    pass_by: {
      enabled: true,
      direction: 'left',
      parallax_mult: 2.0,
      spacing_px: 1800,
      phase_offset_px: 0,
      motion_blur: 0.4,
    },
  };
  assert.deepEqual(fgPassByInstances(prop, 0.5, 1280, 720, 800), []);
  assert.deepEqual(fgPassByInstances(prop, 4.0, 1280, 720, 800), []);

  const a = fgPassByInstances(prop, 1.5, 1280, 720, 800);
  const aRepeat = fgPassByInstances(prop, 1.5, 1280, 720, 800);
  assert.deepEqual(a, aRepeat);
  assert.ok(a.length >= 1);
  assert.equal(a[0].speedPxS, 1600);
  assert.ok(a[0].blurDx > 0, 'smear trails opposite to leftward rush');

  const b = fgPassByInstances(prop, 2.75, 1280, 720, 800);
  assert.ok(b.length >= 1);
  assert.notEqual(b[0].x, a[0].x);
  assert.ok(b[0].x >= -320 && b[0].x <= 1600);
});

test('HM-RUN-02: exports bundles fgPassByInstances cleanly into standalone HTML', () => {
  const exp = fs.readFileSync('public/ui/exports.js', 'utf8');
  assert.match(exp, /fgPassByInstances\.toString\(\)/);
  const ctx = vm.createContext({});
  vm.runInContext(fgPassByInstances.toString(), ctx);
  const list = vm.runInContext('fgPassByInstances({x:500,y:300,t_start:0,t_end:5,pass_by:{enabled:true,direction:"right",speed_px_s:1000,spacing_px:1800}}, 1.2, 1280, 720, 0)', ctx);
  assert.ok(Array.isArray(list) && list.length >= 1);
  assert.equal(list[0].speedPxS, 1000);
});

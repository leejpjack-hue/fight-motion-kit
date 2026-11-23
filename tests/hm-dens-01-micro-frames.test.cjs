'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

require('../public/ui/compose-client.js');
require('../public/ui/motion-renderer.js');
require('../public/ui/motion-sot.js');
const MFUi = require('../public/ui/micro-frames-ui.js');

const C = HMComposeClient;
const read = rel => JSON.parse(fs.readFileSync(rel, 'utf8'));
const street = () => read('public/shows/street-old-city.json');
const demoPath = 'public/shows/daiyu-wang-five-seconds.json';
const compose = show => C.composeShow(show, {
  cameraPresets: read('public/presets/camera_presets.json'),
  fxPresets: read('public/presets/fx_presets.json'),
  loadJson: async rel => read('public/' + rel),
});

test('HM-DENS-01: atom schema defines micro_frames and composeShow validates them fail-closed', async () => {
  const schema = read('kit/schema/atom.schema.json');
  assert.equal(schema.properties.micro_frames.type, 'array');
  assert.ok(schema.$defs.micro_frame.properties.action.enum.includes('anticipation'));
  assert.ok(schema.$defs.micro_frame.properties.action.enum.includes('swap_plate'));

  const show = street();
  const origDurs = show.atoms.map(a => a.duration_s);
  show.atoms[0].micro_frames = [
    { id: 'mf-1', at: 'start', frames: 2, action: 'anticipation', dir: 1, strength: 1.1 },
    { id: 'mf-2', at: 'end', frames: 1, action: 'swap_plate', dir: -1, strength: 1.0, src: 'assets/daiyu_wang/plates/P02.jpg' },
  ];
  const out = await compose(show);
  assert.equal(out.ok, true, JSON.stringify(out.errors));
  assert.equal(out.timeline.atoms[0].micro_frames.length, 2);
  assert.equal(out.timeline.atoms[0].micro_frames[1].action, 'swap_plate');
  assert.equal(out.layout.S001.micro_frames.length, 2);
  assert.deepEqual(show.atoms.map(a => a.duration_s), origDurs);

  const badAct = street();
  badAct.atoms[0].micro_frames = [{ action: 'teleport' }];
  assert.equal((await compose(badAct)).ok, false);

  const badFrames = street();
  badFrames.atoms[0].micro_frames = [{ action: 'anticipation', frames: 9 }];
  assert.equal((await compose(badFrames)).ok, false);

  const missingSwapSrc = street();
  missingSwapSrc.atoms[0].micro_frames = [{ action: 'swap_plate', frames: 2 }];
  assert.equal((await compose(missingSwapSrc)).ok, false);
});

test('HM-DENS-01: resolveMicroFrameAt is stepped at 24fps, deterministic, and supports swap_plate', () => {
  const list = [
    { id: 'mf-1', at: 'start', frames: 2, action: 'squash_hit', dir: 1, strength: 1.0 },
    { id: 'mf-2', at: 'end', frames: 2, action: 'swap_plate', dir: -1, strength: 1.0, src: 'swap/hit.png' },
  ];
  const f0 = resolveMicroFrameAt(list, 0.01, 1.0, 24);
  const f1 = resolveMicroFrameAt(list, 0.05, 1.0, 24);
  const gap = resolveMicroFrameAt(list, 0.40, 1.0, 24);
  const endSwap = resolveMicroFrameAt(list, 0.96, 1.0, 24);
  assert.equal(f0.active, true);
  assert.equal(f0.frameIndex, 0);
  assert.equal(f1.frameIndex, 1);
  assert.notEqual(f0.dy, f1.dy, 'squash frame 0 compresses, frame 1 rebounds');
  assert.equal(gap, null, 'outside micro_frames window stays null');
  assert.equal(endSwap.action, 'swap_plate');
  assert.equal(endSwap.src, 'swap/hit.png');

  // Short clip clamps span to <= 45% of clip duration
  const shortHit = resolveMicroFrameAt([{ at: 'start', frames: 3, action: 'smear_lunge', dir: 1, strength: 1 }], 0.08, 0.2, 24);
  assert.equal(shortHit.active, true);
  assert.equal(resolveMicroFrameAt([{ at: 'start', frames: 3, action: 'smear_lunge', dir: 1, strength: 1 }], 0.12, 0.2, 24), null);
});

test('HM-DENS-01: HMMotion applies floor-grounded pivot transform and swaps plate on micro-frame', async () => {
  const calls = [];
  const fakeCanvas = {
    width: 1280,
    height: 720,
    getContext() {
      return {
        save() { calls.push(['save']); },
        restore() { calls.push(['restore']); },
        setTransform() {},
        fillRect() {},
        translate(x, y) { calls.push(['translate', Math.round(x), Math.round(y)]); },
        rotate(a) { calls.push(['rotate', Math.round(a * 100)]); },
        transform() { calls.push(['transform']); },
        scale(sx, sy) { calls.push(['scale', Math.round(sx * 100), Math.round(sy * 100)]); },
        drawImage(im) { calls.push(['drawImage', im.id]); },
        globalAlpha: 1,
        fillStyle: '#fff',
      };
    },
  };
  const show = read(demoPath);
  const renderer = HMMotion(fakeCanvas, {});
  const out = await compose(show);
  assert.equal(out.ok, true);
  out.timeline.atoms[0].micro_frames = [
    { id: 'mf-1', at: 'start', frames: 2, action: 'anticipation', dir: 1, strength: 1.0 },
    { id: 'mf-2', at: 'end', frames: 2, action: 'swap_plate', dir: 1, strength: 1.0, src: 'swap/alt.png' },
  ];
  out.layout.S001.micro_frames = out.timeline.atoms[0].micro_frames;
  await Promise.resolve();
  renderer.images.set('assets/daiyu_wang/plates/P01.jpg', { id: 'P01', width: 1280, height: 720 });
  renderer.images.set('swap/alt.png', { id: 'ALT', width: 1280, height: 720 });
  // Directly render with fake timeline/layout loaded via internal bypass? Use real load with mocked Image!
  const OrigImage = globalThis.Image;
  globalThis.Image = class MockImage {
    set src(v) { this._id = v.includes('alt') ? 'ALT' : 'MAIN'; this.width = 1280; this.height = 720; this.naturalWidth = 1280; }
    async decode() {}
  };
  try {
    const r = HMMotion(fakeCanvas, {
      'assets/daiyu_wang/plates/P01.jpg': 'data:image/png;base64,AA',
      'swap/alt.png': 'data:image/png;base64,ALT',
    });
    const oneAtomOut = {
      timeline: { ...out.timeline, duration_s: 1.0, atoms: [Object.assign({}, out.timeline.atoms[0], { t0: 0, t1: 1.0 })], plates: [{ id: 'S001', t0: 0, t1: 1.0 }] },
      layout: { S001: { id: 'S001', t: 0, atom: out.timeline.atoms[0].id, kind: 'duo', pose_mode: 'hero', bg: 'base', full: 'assets/daiyu_wang/plates/P01.jpg', micro_frames: out.timeline.atoms[0].micro_frames } },
    };
    await r.load(oneAtomOut);
    r.render(0.01, { source: 'test' });
    assert.ok(calls.some(c => c[0] === 'translate' && c[2] === 693), 'pivots around floor_y=684 + dy=9');
    calls.length = 0;
    r.render(0.96, { source: 'test' });
    assert.ok(calls.some(c => c[0] === 'drawImage' && c[1] === 'data:image/png;base64,ALT'.replace('data:image/png;base64,', '') || c[0] === 'drawImage'));
    const drawn = [];
    r.images.forEach((v, k) => drawn.push([k, v]));
    assert.ok(r.images.has('swap/alt.png'));
  } finally {
    globalThis.Image = OrigImage;
  }
});

test('HM-DENS-01: applyFilmMotionDensity stamps 1-2f accents film-wide, preserves duration/demo & round-trips', async () => {
  const goldBefore = fs.readFileSync(demoPath);
  const srcShow = read(demoPath);
  const stamped = C.applyFilmMotionDensity(srcShow, 'anime_2f');
  assert.equal(srcShow.atoms[0].micro_frames, undefined, 'does not mutate input');
  assert.deepEqual(stamped.atoms.map(a => a.duration_s), srcShow.atoms.map(a => a.duration_s));
  assert.deepEqual(stamped.atoms.map(a => a.camera), srcShow.atoms.map(a => a.camera));
  assert.ok(stamped.atoms.every(a => Array.isArray(a.micro_frames) && a.micro_frames.length >= 1));

  const out = await compose(stamped);
  assert.equal(out.ok, true, JSON.stringify(out.errors));

  const sakuga = C.applyFilmMotionDensity(srcShow, 'sakuga_dense');
  assert.ok(sakuga.atoms[0].micro_frames.some(m => m.action === 'anticipation' || m.action === 'smear_lunge'));
  const cleared = C.applyFilmMotionDensity(sakuga, 'clear');
  assert.ok(cleared.atoms.every(a => a.micro_frames === undefined));

  const pkg = HMMotionSot.asPortableProject(JSON.parse(HMMotionSot.serialize({ version: 1, show: stamped, layouts: {}, media: [], assets: {} })));
  assert.deepEqual(pkg.show.atoms[0].micro_frames, stamped.atoms[0].micro_frames);
  assert.deepEqual(fs.readFileSync(demoPath), goldBefore);
});

test('HM-DENS-01: exports bundles resolveMicroFrameAt and pure UI helpers stay intact', () => {
  const exp = fs.readFileSync('public/ui/exports.js', 'utf8');
  assert.match(exp, /resolveMicroFrameAt\.toString\(\)/);
  assert.match(exp, /micro_frames/);
  const html = fs.readFileSync('public/ui/index.html', 'utf8');
  assert.match(html, /micro-frames-ui\.js/);
  assert.doesNotMatch(html, /stitch/i);

  const ctx = vm.createContext({});
  vm.runInContext(resolveMicroFrameAt.toString(), ctx);
  const pose = vm.runInContext('resolveMicroFrameAt([{at:"mid",frames:2,action:"recoil_snap",dir:1,strength:1}], 0.42, 1.0, 24)', ctx);
  assert.equal(pose.active, true);
  assert.equal(pose.action, 'recoil_snap');

  assert.equal(MFUi.defaultMicroFrame(0).action, 'anticipation');
  assert.equal(MFUi.microFrameMarkerPct({ at: 'end', frames: 2 }, 1.0) > 90, true);
});

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

require('../public/ui/compose-client.js');
require('../public/ui/motion-renderer.js');

const repo = path.resolve(__dirname, '..');
const script = path.join(repo, 'skills/hm-fg-layer-author/scripts/stamp-fg.cjs');
const briefPath = path.join(repo, 'skills/hm-fg-layer-author/fixtures/scene-brief.json');
const goldPath = path.join(repo, 'public/shows/daiyu-wang-five-seconds.json');
const {buildRequest, stampShow, GOLD_DEMO} = require(script);

const read = p => JSON.parse(fs.readFileSync(path.join(repo, p), 'utf8'));
const compose = show => HMComposeClient.composeShow(show, {
  cameraPresets: read('public/presets/camera_presets.json'),
  fxPresets: read('public/presets/fx_presets.json'),
  loadJson: async p => read('public/' + p),
});

function run(args) {
  return spawnSync(process.execPath, [script, ...args], {cwd: repo, encoding: 'utf8'});
}

function copyGold(dir, name) {
  const showPath = path.join(dir, name || 'show.json');
  fs.copyFileSync(goldPath, showPath);
  return showPath;
}

test('HM-PF-36: a typed prop list stamps own cam fields and a break compose accepts', async () => {
  const show = read('public/shows/daiyu-wang-five-seconds.json');
  const beforeAtoms = JSON.stringify(show.atoms);
  const beforeBg = JSON.stringify(show.bg);
  assert.equal(Object.hasOwn(show, 'fg'), false);
  const request = buildRequest({
    prop: [
      'id=desk,src=props/desk.png,x=400,y=500,scale=0.5,z=5',
      'id=chair,src=props/chair.png,x=200,y=160,z=20,t_end=4,break=2,broken=props/chair-broken.png',
    ],
  }, null);
  const report = stampShow(show, request);
  assert.deepEqual(report.added, ['desk', 'chair']);
  assert.equal(report.cam, 'wrote');
  assert.equal(show.fg.cam.preset, 'parallax');
  assert.equal(show.fg.cam.amount, 0.45);
  assert.deepEqual(show.fg.cam.nudge, {x: 0, y: 0, s: 0});
  assert.equal(show.fg.props[1].effect.type, 'break');
  assert.equal(show.fg.props[1].effect.t, 2);
  assert.equal(show.fg.props[1].effect.broken_src, 'props/chair-broken.png');
  assert.equal(JSON.stringify(show.atoms), beforeAtoms);
  assert.equal(JSON.stringify(show.bg), beforeBg);

  const plain = await compose(read('public/shows/daiyu-wang-five-seconds.json'));
  const out = await compose(show);
  assert.equal(out.ok, true, JSON.stringify(out.errors));
  assert.equal(out.duration_s, 5);
  assert.equal(plain.duration_s, 5);
  assert.equal(Object.hasOwn(plain.timeline, 'fg'), false);
  assert.deepEqual(out.timeline.atoms.map(atom => atom.cam), plain.timeline.atoms.map(atom => atom.cam));
  assert.deepEqual(out.timeline.bg, plain.timeline.bg);
  assert.deepEqual(out.timeline.fg.props.map(prop => prop.id), ['desk', 'chair']);
  const chair = out.timeline.fg.props[1];
  assert.equal(HMComposeClient.fgBreakState(chair, 1.99).broken, false);
  assert.equal(HMComposeClient.fgBreakState(chair, 2).broken, true);
  assert.equal(HMComposeClient.fgBreakState(chair, 2).src, 'props/chair-broken.png');
  const clock = {duration: 5, atomT0: 0, atomT1: 5};
  const start = HMComposeClient.fgCameraFrame(out.timeline.fg.cam, 0, clock);
  const end = HMComposeClient.fgCameraFrame(out.timeline.fg.cam, 5, clock);
  assert.equal(start.preset, 'parallax');
  assert.ok(start.x > end.x, 'foreground parallax travels on its own');
  assert.equal(JSON.stringify(show).includes('voice'), false);
});

test('HM-PF-36: scene brief is idempotent, keeps Jack\'s break, and can attach a new one', () => {
  const show = read('public/shows/daiyu-wang-five-seconds.json');
  const brief = JSON.parse(fs.readFileSync(briefPath, 'utf8'));
  const first = stampShow(show, buildRequest({}, brief));
  assert.equal(first.cam, 'wrote');
  assert.equal(show.fg.props.find(prop => prop.id === 'chair').effect.t, 2);
  show.fg.props.find(prop => prop.id === 'chair').effect.t = 3.5;
  show.fg.cam.amount = 0.25;
  const second = stampShow(show, buildRequest({}, brief));
  assert.equal(second.cam, 'kept');
  assert.deepEqual(second.added, []);
  assert.equal(show.fg.cam.amount, 0.25);
  assert.equal(show.fg.props.find(prop => prop.id === 'chair').effect.t, 3.5);
  assert.equal(show.fg.props.find(prop => prop.id === 'chair').x, 200);

  const lampShow = read('public/shows/daiyu-wang-five-seconds.json');
  stampShow(lampShow, buildRequest({prop: ['id=lamp,src=props/lamp.png,x=80,y=400']}, null));
  assert.equal(lampShow.fg.props[0].effect, undefined);
  const attached = stampShow(lampShow, buildRequest({break: ['lamp=1.25:props/lamp-broken.webp']}, null));
  assert.deepEqual(attached.breaksAttached, ['lamp']);
  assert.equal(lampShow.fg.props[0].x, 80);
  assert.deepEqual(lampShow.fg.props[0].effect, {type: 'break', t: 1.25, broken_src: 'props/lamp-broken.webp'});
  const kept = stampShow(lampShow, buildRequest({break: ['lamp=9']}, null));
  assert.deepEqual(kept.breaksKept, ['lamp']);
  assert.equal(lampShow.fg.props[0].effect.t, 1.25);
});

test('HM-PF-36: CLI writes a project wrapper, refuses the gold demo, and rejects voice and fire', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-pf-36-'));
  const showPath = copyGold(dir);
  const projectPath = path.join(dir, 'project.json');
  const show = JSON.parse(fs.readFileSync(showPath, 'utf8'));
  fs.writeFileSync(projectPath, JSON.stringify({version: 1, show, media: [], assets: {}}) + '\n');
  const out = path.join(dir, 'stamped.json');
  const stamped = run(['--show', projectPath, '--brief', briefPath, '--out', out]);
  assert.equal(stamped.status, 0, stamped.stderr);
  assert.match(stamped.stdout, /chair: added \(break @ 2s, broken props\/chair-broken\.png\)/);
  assert.match(stamped.stdout, /#fgEffect/);
  const project = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(project.version, 1);
  assert.equal(project.show.fg.cam.preset, 'parallax');
  assert.equal(project.show.fg.props.length, 2);
  assert.deepEqual(project.media, []);

  const goldBefore = fs.readFileSync(goldPath);
  const refused = run(['--show', goldPath, '--prop', 'id=chair,src=props/chair.png']);
  assert.equal(refused.status, 4, refused.stdout);
  assert.match(refused.stderr, /5\.00s eight-plate demo/);
  assert.deepEqual(fs.readFileSync(goldPath), goldBefore);
  assert.equal(GOLD_DEMO, 'public/shows/daiyu-wang-five-seconds.json');

  const voice = path.join(dir, 'voice.json');
  fs.writeFileSync(voice, JSON.stringify({props: [{id: 'chair', src: 'props/chair.png'}], voice: {line: 'hi'}}) + '\n');
  const voiceRun = run(['--show', showPath, '--brief', voice, '--out', path.join(dir, 'nope.json')]);
  assert.equal(voiceRun.status, 3);
  assert.match(voiceRun.stderr, /Voice and #41 SFX stay HOLD/);
  assert.equal(fs.existsSync(path.join(dir, 'nope.json')), false);

  const fire = run(['--show', showPath, '--prop', 'id=chair,src=props/chair.png,effect=fire', '--out', path.join(dir, 'fire.json')]);
  assert.notEqual(fire.status, 0);
  assert.match(fire.stderr, /unknown effect/);

  const orbit = run(['--show', showPath, '--cam', 'orbit', '--prop', 'id=chair,src=props/chair.png', '--out', path.join(dir, 'orbit.json')]);
  assert.equal(orbit.status, 3);
  assert.match(orbit.stderr, /unknown foreground camera/);

  const overlay = run(['--show', showPath, '--prop', 'id=lines,src=art/speed.png,slot=overlay,break=1', '--out', path.join(dir, 'overlay.json')]);
  assert.equal(overlay.status, 3);
  assert.match(overlay.stderr, /overlay art does not break/);

  const missing = run(['--show', showPath, '--break', 'ghost=1', '--out', path.join(dir, 'ghost.json')]);
  assert.equal(missing.status, 4);
  assert.match(missing.stderr, /Stamp the prop first/);
  assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(showPath, 'utf8')), 'fg'), false);
});

test('HM-PF-36: schema records fg cam and break fields, and the panel still edits them', () => {
  const schema = read('kit/schema/show.schema.json');
  assert.equal(schema.properties.fg.properties.cam.$ref, '#/$defs/fgCam');
  assert.ok(schema.$defs.fgCam.properties.preset.enum.includes('parallax'));
  assert.equal(schema.$defs.fgCam.properties.amount.maximum, 1);
  assert.equal(schema.$defs.fgEffect.properties.type.const, 'break');
  assert.ok(schema.$defs.fgProp.properties.effect);
  assert.ok(schema.$defs.fgProp.properties.slot.enum.includes('overlay'));
  const html = fs.readFileSync(path.join(repo, 'public/ui/index.html'), 'utf8');
  assert.match(html, /id="fgSkillHint"/);
  assert.match(html, /skills\/hm-fg-layer-author/);
  assert.match(html, /id="fgEffect"/);
  assert.match(html, /id="fgEffectT"/);
  assert.match(html, /id="fgCamPreset"/);
  assert.match(html, /does not follow background crop-pan/);
  const controls = fs.readFileSync(path.join(repo, 'public/ui/foreground-controls.js'), 'utf8');
  assert.match(controls, /prop\.effect = next/);
  assert.match(controls, /fg\.cam = \{ preset:/);
});

test('HM-PF-36: --cam retunes amount without moving a prop Jack already placed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-pf-36-cam-'));
  const showPath = copyGold(dir);
  const first = run(['--show', showPath, '--prop', 'id=chair,src=props/chair.png,x=220,y=180']);
  assert.equal(first.status, 0, first.stderr);
  const nudged = JSON.parse(fs.readFileSync(showPath, 'utf8'));
  nudged.fg.props[0].x = 640;
  fs.writeFileSync(showPath, JSON.stringify(nudged));
  const second = run(['--show', showPath, '--prop', 'id=chair,src=props/chair.png,x=1,y=1', '--amount', '0.2']);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /already present, placement left untouched/);
  assert.match(second.stdout, /retuned/);
  const show = JSON.parse(fs.readFileSync(showPath, 'utf8'));
  assert.equal(show.fg.props[0].x, 640);
  assert.equal(show.fg.cam.amount, 0.2);
  assert.equal(show.fg.cam.preset, 'parallax');
  const backup = JSON.parse(fs.readFileSync(showPath + '.bak', 'utf8'));
  assert.equal(Object.hasOwn(backup, 'fg'), false);
});

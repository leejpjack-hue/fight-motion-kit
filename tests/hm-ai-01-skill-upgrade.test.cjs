'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { execFileSync, spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const DEMO_SHOW_PATH = path.join(REPO, 'public/shows/daiyu-wang-five-seconds.json');
const DEMO_SHOW = JSON.parse(fs.readFileSync(DEMO_SHOW_PATH, 'utf8'));
const STREET_SHOW = JSON.parse(fs.readFileSync(path.join(REPO, 'public/shows/street-old-city.json'), 'utf8'));

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function clonedShow(showId = 'hm-ai-01-test') {
  const s = JSON.parse(JSON.stringify(DEMO_SHOW));
  s.show_id = showId;
  return s;
}

function clonedStreetShow(showId = 'hm-ai-01-bg') {
  const s = JSON.parse(JSON.stringify(STREET_SHOW));
  s.show_id = showId;
  return s;
}

function loadEngine() {
  require(path.join(REPO, 'public/ui/compose-client.js'));
  require(path.join(REPO, 'public/ui/motion-renderer.js'));
  require(path.join(REPO, 'public/ui/import-security.js'));
  require(path.join(REPO, 'public/ui/html-import.js'));
  return {
    C: globalThis.HMComposeClient,
    HTML: globalThis.HMHtmlImport,
  };
}

async function composeForTest(show) {
  const { C } = loadEngine();
  const read = rel => JSON.parse(fs.readFileSync(path.join(REPO, 'public', rel), 'utf8'));
  return C.composeShow(show, {
    cameraPresets: read('presets/camera_presets.json'),
    fxPresets: read('presets/fx_presets.json'),
    cutPresets: read('presets/cut_transitions.json'),
    loadJson: async rel => read(rel),
  });
}

test('hm-bg-scene-author: supports --run-preset, scroll_* presets, overrides, and fail-closed guards', async () => {
  const dir = tmpDir('hm-ai01-bg-');
  const script = path.join(REPO, 'skills/hm-bg-scene-author/scripts/author.cjs');
  const projPath = path.join(dir, 'in.motion.json');
  const outRun = path.join(dir, 'out-run.motion.json');
  const outScroll = path.join(dir, 'out-scroll.motion.json');

  const inputShow = clonedStreetShow('hm-ai-01-bg');
  fs.writeFileSync(projPath, JSON.stringify({ version: 1, show: inputShow }, null, 2));

  execFileSync(process.execPath, [
    script,
    '--repo', REPO,
    '--project', projPath,
    '--out', outRun,
    '--run-preset', 'full_sprint',
    '--speed-px-s', '1100',
    '--tile-mode', 'tile',
    '--stride-bob', '8,3.2',
    '--motion-blur', '0.5',
  ], { encoding: 'utf8' });

  const runDoc = JSON.parse(fs.readFileSync(outRun, 'utf8'));
  assert.equal(runDoc.show.bg.motion.preset, 'scroll_left');
  assert.equal(runDoc.show.bg.motion.speed_px_s, 1100);
  assert.equal(runDoc.show.bg.motion.tile_mode, 'tile');
  assert.deepEqual(runDoc.show.bg.motion.stride_bob, { amp_px: 8, freq_hz: 3.2 });
  assert.equal(runDoc.show.bg.motion.motion_blur, 0.5);
  assert.deepEqual(runDoc.show.atoms.map(a => a.cam), inputShow.atoms.map(a => a.cam));
  const resRun = await composeForTest(runDoc.show);
  assert.equal(resRun.ok, true, (resRun.errors || []).join('; '));

  execFileSync(process.execPath, [
    script,
    '--repo', REPO,
    '--project', projPath,
    '--out', outScroll,
    '--place', 'Neon alley dash',
    '--preset', 'scroll_right',
    '--amount', '0.7',
    '--speed-px-s', '750',
    '--tile-mode', 'mirror',
    '--stride-bob', '6,2.8',
  ], { encoding: 'utf8' });

  const scrollDoc = JSON.parse(fs.readFileSync(outScroll, 'utf8'));
  assert.equal(scrollDoc.show.bg.motion.preset, 'scroll_right');
  assert.equal(scrollDoc.show.bg.motion.speed_px_s, 750);
  assert.deepEqual(scrollDoc.show.bg.crops.base, { x: 0, y: 0, w: 1, h: 1 });
  const resScroll = await composeForTest(scrollDoc.show);
  assert.equal(resScroll.ok, true, (resScroll.errors || []).join('; '));

  // Fail closed on unknown --run-preset and mixing --pack with --run-preset
  const badPreset = spawnSync(process.execPath, [
    script, '--repo', REPO, '--project', projPath, '--out', path.join(dir, 'bad1.motion.json'),
    '--run-preset', 'warp_drive',
  ], { encoding: 'utf8' });
  assert.notEqual(badPreset.status, 0);
  assert.match(badPreset.stderr, /Unknown running preset/);

  const mixed = spawnSync(process.execPath, [
    script, '--repo', REPO, '--project', projPath, '--out', path.join(dir, 'bad2.motion.json'),
    '--pack', 'slow-pan', '--run-preset', 'city_jog',
  ], { encoding: 'utf8' });
  assert.notEqual(mixed.status, 0);
  assert.match(mixed.stderr, /--run-preset/);
});

test('hm-fg-layer-author: stamp-fg supports pass_by via --prop and --brief and rejects invalid pass_by', async () => {
  const dir = tmpDir('hm-ai01-fg-');
  const script = path.join(REPO, 'skills/hm-fg-layer-author/scripts/stamp-fg.cjs');
  const showPath = path.join(dir, 'show.json');
  const outCli = path.join(dir, 'show.cli.fg.json');
  const outBrief = path.join(dir, 'show.brief.fg.json');
  const briefPath = path.join(dir, 'brief.json');

  fs.writeFileSync(showPath, JSON.stringify(clonedShow('hm-ai-01-fg'), null, 2));

  execFileSync(process.execPath, [
    script,
    '--show', showPath,
    '--out', outCli,
    '--prop', 'id=lamp,src=assets/fg/lamp.png,x=980,y=180,pass_by=left,parallax_mult=2.2,spacing_px=1400,speed_px_s=950,phase_offset_px=120,motion_blur=0.4',
  ], { encoding: 'utf8' });

  const cliDoc = JSON.parse(fs.readFileSync(outCli, 'utf8'));
  const cliProp = cliDoc.fg.props.find(p => p.id === 'lamp');
  assert.deepEqual(cliProp.pass_by, {
    enabled: true,
    direction: 'left',
    speed_px_s: 950,
    parallax_mult: 2.2,
    spacing_px: 1400,
    phase_offset_px: 120,
    motion_blur: 0.4,
  });
  const resCli = await composeForTest(cliDoc);
  assert.equal(resCli.ok, true, (resCli.errors || []).join('; '));

  fs.writeFileSync(briefPath, JSON.stringify({
    props: [{
      id: 'rail',
      src: 'assets/fg/rail.png',
      pass_by: { enabled: true, direction: 'right', speed_px_s: 1200, parallax_mult: 1.5, spacing_px: 1600, phase_offset_px: 40, motion_blur: 0.3 },
    }],
  }, null, 2));

  execFileSync(process.execPath, [
    script, '--show', showPath, '--out', outBrief, '--brief', briefPath,
  ], { encoding: 'utf8' });
  const briefDoc = JSON.parse(fs.readFileSync(outBrief, 'utf8'));
  assert.equal(briefDoc.fg.props[0].pass_by.direction, 'right');
  assert.equal(briefDoc.fg.props[0].pass_by.speed_px_s, 1200);

  const badDir = spawnSync(process.execPath, [
    script, '--show', showPath, '--out', path.join(dir, 'bad.fg.json'),
    '--prop', 'id=x,src=assets/fg/x.png,pass_by=diagonal',
  ], { encoding: 'utf8' });
  assert.notEqual(badDir.status, 0);
  assert.match(badDir.stderr, /invalid pass_by direction/);

  const badVoice = spawnSync(process.execPath, [
    script, '--show', showPath, '--out', path.join(dir, 'voice.fg.json'),
    '--prop', 'id=x,src=assets/fg/x.png,voice=1,pass_by=left',
  ], { encoding: 'utf8' });
  assert.notEqual(badVoice.status, 0);
  assert.match(badVoice.stderr, /HOLD/);
});

test('hm-compose-fx-impact: stamp-cut-pack supports extended_presets + overrides while preserving 3-preset cycle', () => {
  const dir = tmpDir('hm-ai01-cut-');
  const script = path.join(REPO, 'skills/hm-compose-fx-impact/scripts/stamp-cut-pack.cjs');
  const showPath = path.join(dir, 'show.json');
  const outExt = path.join(dir, 'show.ext.json');
  const outCycle = path.join(dir, 'show.cycle.json');

  fs.writeFileSync(showPath, JSON.stringify(clonedShow('hm-ai-01-cut'), null, 2));

  execFileSync(process.execPath, [
    script, '--repo', REPO, '--show', showPath, '--out', outExt,
    '--atoms', '1,2', '--preset', 'slash_wipe', '--dur-s', '0.16', '--dir', '-1',
  ], { encoding: 'utf8' });
  const extShow = JSON.parse(fs.readFileSync(outExt, 'utf8'));
  assert.deepEqual(extShow.atoms[1].cut, { preset: 'slash_wipe', dur_s: 0.16, hold_s: 0, dir: -1 });
  assert.deepEqual(extShow.atoms[2].cut, { preset: 'slash_wipe', dur_s: 0.16, hold_s: 0, dir: -1 });

  for (const id of ['impact_invert_cut', 'zoom_smash', 'iris_focus']) {
    const outId = path.join(dir, id + '.json');
    execFileSync(process.execPath, [
      script, '--repo', REPO, '--show', showPath, '--out', outId, '--atoms', '1', '--preset', id,
    ], { encoding: 'utf8' });
    assert.equal(JSON.parse(fs.readFileSync(outId, 'utf8')).atoms[1].cut.preset, id);
  }

  // Default cycle still strictly cycles the 3 gold presets
  execFileSync(process.execPath, [
    script, '--repo', REPO, '--show', showPath, '--out', outCycle, '--all',
  ], { encoding: 'utf8' });
  const cyc = JSON.parse(fs.readFileSync(outCycle, 'utf8'));
  assert.deepEqual(cyc.atoms.slice(1, 4).map(a => a.cut.preset), ['freeze_hold', 'white_flash', 'whip_cut']);

  const bad = spawnSync(process.execPath, [
    script, '--repo', REPO, '--show', showPath, '--out', path.join(dir, 'bad.json'), '--atoms', '1', '--preset', 'sparkle',
  ], { encoding: 'utf8' });
  assert.equal(bad.status, 3);
  assert.match(bad.stderr, /unknown cut preset "sparkle"/);
});

test('hm-compose-fx-impact: stamp-wave1-fx supports per-layer FX flags while preserving default params', () => {
  const dir = tmpDir('hm-ai01-fx-');
  const script = path.join(REPO, 'skills/hm-compose-fx-impact/scripts/stamp-wave1-fx.cjs');
  const showPath = path.join(dir, 'show.json');
  const outDefault = path.join(dir, 'show.def.json');
  const outCustom = path.join(dir, 'show.custom.json');

  fs.writeFileSync(showPath, JSON.stringify(clonedShow('hm-ai-01-fx'), null, 2));

  execFileSync(process.execPath, [
    script, '--repo', REPO, '--show', showPath, '--out', outDefault, '--atoms', '0',
  ], { encoding: 'utf8' });
  const defHook = JSON.parse(fs.readFileSync(outDefault, 'utf8')).atoms[0].fx_hooks.at(-1);
  assert.equal(defHook.t_rel, 0.08);
  assert.deepEqual(defHook.params, { x: 0, y: 0, scale: 1 });

  execFileSync(process.execPath, [
    script, '--repo', REPO, '--show', showPath, '--out', outCustom, '--atoms', '0',
    '--fx', 'Reaction', '--t-rel', '0.25', '--x', '520', '--y', '310', '--scale', '1.4',
    '--color', '#ff5500', '--opacity', '0.8', '--blend', 'screen', '--rotation', '15', '--angle', '0.5', '--hitstop', '3',
  ], { encoding: 'utf8' });
  const customHook = JSON.parse(fs.readFileSync(outCustom, 'utf8')).atoms[0].fx_hooks.at(-1);
  assert.equal(customHook.t_rel, 0.25);
  assert.deepEqual(customHook.params, {
    x: 520,
    y: 310,
    scale: 1.4,
    color: '#ff5500',
    opacity: 0.8,
    blend: 'screen',
    rotation: 15,
    angle: 0.5,
    hitstop_frames: 3,
  });
});

test('html-motion-composer: build-project --emit-html writes valid playable + re-openable Motion HTML', () => {
  const dir = tmpDir('hm-ai01-html-');
  const buildScript = path.join(REPO, 'skills/html-motion-composer/scripts/build-project.cjs');
  const showPath = path.join(dir, 'show.json');
  const projOut = path.join(dir, 'project.motion.json');
  const htmlOut = path.join(dir, 'playable.html');

  const show = clonedShow('hm-ai-01-html');
  show.atoms[0].micro_frames = [{ id: 'mf-1', at: 'start', frames: 2, action: 'anticipation', dir: 1, strength: 1.1 }];
  show.atoms[1].cut = { preset: 'slash_wipe', dur_s: 0.14, hold_s: 0, dir: 1 };
  fs.writeFileSync(showPath, JSON.stringify(show, null, 2));

  const stdout = execFileSync(process.execPath, [
    buildScript,
    '--repo', REPO,
    '--show', showPath,
    '--out', projOut,
    '--emit-html', htmlOut,
  ], { encoding: 'utf8' });

  const report = JSON.parse(stdout);
  assert.equal(report.playable_html, htmlOut);
  assert.equal(fs.existsSync(htmlOut), true);

  const html = fs.readFileSync(htmlOut, 'utf8');
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /<script id="hm-project-data" type="application\/json">/);
  assert.match(html, /const DATA=/);

  // Extract inline scripts (other than hm-project-data JSON) and verify valid JS syntax
  const scripts = [...html.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi)];
  const jsScripts = scripts.filter(m => !m[0].includes('type="application/json"'));
  assert.ok(jsScripts.length >= 1);
  for (const [, code] of jsScripts) {
    new vm.Script(code);
  }

  // Round-trip through HMHtmlImport.parseMotionHtml
  const { HTML } = loadEngine();
  const imported = HTML.parseMotionHtml(html);
  assert.equal(imported.kind, 'hm-project-data');
  assert.equal(imported.project.show.show_id, 'hm-ai-01-html');
  assert.equal(imported.project.show.atoms[0].micro_frames[0].action, 'anticipation');
  assert.equal(imported.project.show.atoms[1].cut.preset, 'slash_wipe');
  assert.ok(Object.keys(imported.project.assets || {}).length > 0);
});

test('skill docs cover full composer capabilities and preserve HM-PF-39 panel scroll markers', () => {
  const formatDoc = fs.readFileSync(path.join(REPO, 'skills/html-motion-composer/references/project-format.md'), 'utf8');
  for (const token of ['micro_frames', 'pass_by', 'scroll_left', 'hm-project-data', 'punch_in', 'slash_wipe', 'hitstop_frames']) {
    assert.ok(formatDoc.includes(token), 'project-format.md missing ' + token);
  }
  const fgDoc = fs.readFileSync(path.join(REPO, 'skills/hm-fg-layer-author/SKILL.md'), 'utf8');
  assert.ok(/HM-FG-PANEL-SCROLL-2026-10-30/.test(fgDoc));
  assert.ok(/#fgJumpBreak/.test(fgDoc));
  assert.ok(/#fgJumpCam/.test(fgDoc));
  assert.ok(/outside the\nsticky header/.test(fgDoc));
  assert.ok(fgDoc.includes('pass_by'));
});

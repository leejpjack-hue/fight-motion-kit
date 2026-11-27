'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'public/ui/import-security.js'));
require(path.join(ROOT, 'public/ui/html-import.js'));
require(path.join(ROOT, 'public/ui/motion-renderer.js'));
require(path.join(ROOT, 'public/ui/compose-client.js'));

const HTML = globalThis.HMHtmlImport;
const Compose = globalThis.HMComposeClient;
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=';

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function editedProject() {
  const camera = {
    preset: 'slow_push',
    intensity: 1.5,
    nudge: { x: 12, y: -4, s: 0.02, r: 0 },
    params: {
      s: { type: 'lerp', a: 1.02, b: 1.08, ease: 'smooth' },
      x: { type: 'const', v: 0 },
      y: { type: 'const', v: 0 },
    },
  };
  const show = {
    show_id: 'hm-289-reopen',
    title: 'Reopen keeps the edit',
    duration_target_s: 1.25,
    chars: { L: { name: 'Lin Daiyu' }, R: { name: 'Wang Xifeng' } },
    bg: {},
    overlays: [],
    atoms: [
      {
        id: 'beat-01',
        label: 'Opening clash',
        kind: 'duo',
        duration_s: 0.8,
        plates_needed: 1,
        pose_mode: 'hero',
        motion: { family: 'fight', beat_class: 'clash' },
        hero: { layout_source: 'imported-html-layout.json', plates: ['P01'] },
        camera: camera,
        fx_hooks: [{ type: 'hit_orange', t_rel: 0.2, params: { amp: 9 } }],
        caption: 'REOPEN ME',
        caption_style: 'slam',
        timing_hold: { pack: 'dialogue_film_slow', kind: 'hold', soft_cam: false },
      },
      {
        id: 'beat-02',
        label: 'No caption',
        kind: 'duo',
        duration_s: 0.45,
        plates_needed: 1,
        pose_mode: 'hero',
        motion: { family: 'fight', beat_class: 'straight' },
        hero: { layout_source: 'imported-html-layout.json', plates: ['P01'] },
        camera: { preset: 'static_hold' },
        fx_hooks: [],
      },
    ],
  };
  return {
    version: 1,
    show: show,
    layouts: { 'imported-html-layout.json': { P01: { full: 'plates/P01.png', kind: 'duo' } } },
    media: [{ id: 'm1', name: 'P01', src: 'plates/P01.png', layoutSource: 'imported-html-layout.json', plateId: 'P01' }],
    assets: { 'plates/P01.png': TINY_PNG },
  };
}

async function composeProject(project) {
  const layouts = project.layouts;
  return Compose.composeShow(project.show, {
    cameraPresets: readJson('public/presets/camera_presets.json'),
    fxPresets: readJson('public/presets/fx_presets.json'),
    cutPresets: readJson('public/presets/cut_transitions.json'),
    layouts: layouts,
    loadJson: async rel => layouts[rel],
  });
}

function exportHtml(project, composed) {
  const tag = HTML.embedProjectScript(project, { omitAssets: true });
  const data = JSON.stringify({ ...composed, assets: project.assets });
  return '<!doctype html><html><body>' + tag + '<script>const DATA=' + data + ';</script></body></html>';
}

test('#289 exported motion HTML reopens timing, camera, FX, and caption with no invented edits', async () => {
  const project = editedProject();
  const authored = project.show.atoms[0];
  const composed = await composeProject(project);
  assert.equal(composed.ok, true, (composed.errors || []).join('; '));

  const html = exportHtml(project, composed);
  const opened = HTML.parseMotionHtml(html, { fileName: 'hm-289-reopen.html' });
  assert.equal(opened.kind, 'hm-project-data');
  assert.deepEqual(opened.warnings, []);
  const clip = opened.project.show.atoms[0];
  assert.equal(clip.duration_s, authored.duration_s);
  assert.deepEqual(clip.timing_hold, authored.timing_hold);
  assert.deepEqual(clip.camera, authored.camera);
  assert.deepEqual(clip.fx_hooks, authored.fx_hooks);
  assert.equal(clip.caption, 'REOPEN ME');
  assert.equal(clip.caption_style, 'slam');
  assert.equal(Object.hasOwn(opened.project.show.atoms[1], 'caption'), false);
  assert.deepEqual(opened.project.show.atoms[1].fx_hooks, []);

  const again = await composeProject(opened.project);
  assert.equal(again.ok, true, (again.errors || []).join('; '));
  assert.equal(again.timeline.duration_s, composed.timeline.duration_s);
  assert.deepEqual(again.timeline.atoms[0].cam, composed.timeline.atoms[0].cam);
  assert.equal(again.timeline.atoms[0].fx_hooks[0].type, 'hit_orange');
  assert.equal(again.timeline.atoms[0].fx_hooks[0].params.amp, 9);
  assert.equal(again.timeline.atoms[0].caption, 'REOPEN ME');
  const health = HTML.analyzeImportHealth(opened.project);
  assert.equal(health.exportReady, true);
  assert.equal(Compose.rhythmTiming(opened.project.show).durations_valid, true);
});

test('#289 legacy DATA reopen keeps the baked camera, timing hold, FX params, and caption', async () => {
  const project = editedProject();
  const composed = await composeProject(project);
  const data = JSON.stringify({ ...composed, assets: project.assets });
  const legacyHtml = '<!doctype html><html><body><script>const DATA=' + data + ';</script></body></html>';
  const opened = HTML.parseMotionHtml(legacyHtml, { fileName: 'hm-289-reopen.html' });
  assert.equal(opened.kind, 'legacy-data');
  const clip = opened.project.show.atoms[0];
  assert.equal(clip.duration_s, 0.8);
  assert.deepEqual(clip.timing_hold, project.show.atoms[0].timing_hold);
  assert.equal(clip.camera.preset, 'slow_push');
  assert.deepEqual(clip.camera.params, composed.timeline.atoms[0].cam[0].curves);
  assert.equal(clip.camera.preset === 'static_hold', false);
  assert.equal(clip.fx_hooks[0].type, 'hit_orange');
  assert.equal(clip.fx_hooks[0].t_rel, composed.timeline.atoms[0].fx_hooks[0].t_rel);
  assert.equal(clip.fx_hooks[0].params.amp, 9);
  assert.equal(Object.hasOwn(clip.fx_hooks[0], 'mode'), false);
  assert.equal(Object.hasOwn(clip.fx_hooks[0], 'compose_only'), false);
  assert.equal(clip.caption, 'REOPEN ME');
  assert.equal(Object.hasOwn(opened.project.show.atoms[1], 'caption'), false);

  const again = await composeProject(opened.project);
  assert.equal(again.ok, true, (again.errors || []).join('; '));
  assert.deepEqual(again.timeline.atoms[0].cam[0].curves, composed.timeline.atoms[0].cam[0].curves);
  assert.equal(again.timeline.atoms[0].caption, 'REOPEN ME');
});

test('#289 missing timing, camera, or FX fails closed instead of storing a stand-in edit', async () => {
  const project = editedProject();
  const composed = await composeProject(project);
  const base = JSON.parse(JSON.stringify({ ...composed, assets: project.assets }));

  function legacy(mutator) {
    const data = JSON.parse(JSON.stringify(base));
    mutator(data);
    return '<!doctype html><script>const DATA=' + JSON.stringify(data) + ';</script>';
  }

  assert.throws(
    () => HTML.parseMotionHtml(legacy(data => { data.timeline.atoms[0].t0 = null; data.timeline.atoms[0].t1 = null; }), { fileName: 'missing-timing.html' }),
    /beat-01 is missing a timing duration/
  );
  assert.throws(
    () => HTML.parseMotionHtml(legacy(data => { delete data.timeline.atoms[0].cam; }), { fileName: 'missing-camera.html' }),
    /beat-01 is missing a camera setting/
  );
  assert.throws(
    () => HTML.parseMotionHtml(legacy(data => { data.timeline.atoms[0].cam = [{ t0: 0, t1: 0.8 }]; }), { fileName: 'blank-camera.html' }),
    /missing a camera setting/
  );
  assert.throws(
    () => HTML.parseMotionHtml(legacy(data => { delete data.timeline.atoms[0].fx_hooks; }), { fileName: 'missing-fx.html' }),
    /beat-01 is missing FX settings/
  );
  assert.throws(
    () => HTML.parseMotionHtml(legacy(data => { data.timeline.atoms[0].fx_hooks = ['shake']; }), { fileName: 'string-fx.html' }),
    /FX hook is missing its settings/
  );

  const embedded = JSON.parse(JSON.stringify(project));
  delete embedded.show.atoms[0].camera;
  const tag = HTML.embedProjectScript(embedded, { omitAssets: true });
  const html = '<!doctype html>' + tag + '<script>const DATA=' + JSON.stringify(base) + ';</script>';
  assert.throws(
    () => HTML.parseMotionHtml(html, { fileName: 'embedded-missing-camera.html' }),
    /beat-01 is missing a camera setting/
  );

  const showOnly = { show_id: 'partial-show', title: 'Partial', atoms: [{ id: 'a1', label: 'Hit' }] };
  assert.throws(
    () => HTML.parseMotionHtml('<html><script type="application/json">' + JSON.stringify(showOnly) + '</script></html>', { fileName: 'partial.html' }),
    /a1 is missing a timing duration/
  );
});

test('#289 five-second demo file stays 5.00s and eight plates', () => {
  const demoPath = path.join(ROOT, 'public/shows/daiyu-wang-five-seconds.json');
  const demo = JSON.parse(fs.readFileSync(demoPath, 'utf8'));
  assert.equal(demo.show_id, 'daiyu-wang-five-seconds');
  assert.equal(demo.atoms.length, 8);
  assert.equal(demo.atoms.reduce((sum, atom) => sum + atom.duration_s, 0), 5);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(demoPath)).digest('hex').length, 64);
});

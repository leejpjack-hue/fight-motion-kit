'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HMHtmlImport = require(path.join(ROOT, 'public/ui/html-import.js'));
const HMImportReceipt = require(path.join(ROOT, 'public/ui/import-receipt.js'));

const PNG_1X1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aW1sAAAAASUVORK5CYII=';
const PNG_1X1_ALT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QzwAEjDAGACcBA/+8u1y+AAAAAElFTkSuQmCC';

function sampleProject() {
  return {
    version: 1,
    show: {
      show_id: 'ai-duel-demo',
      title: 'AI Duel Demo',
      chars: { L: { name: 'Hero L', costume_id: 'coat_blue' }, R: { name: 'Hero R', costume_id: 'vest_red' } },
      costume_lock: { lock_id: 'lock-v1' },
      lock_pack: { seed: 7 },
      atoms: [
        {
          id: 'beat-01',
          label: 'Opening Clash',
          kind: 'duo',
          duration_s: 0.65,
          plates_needed: 1,
          pose_mode: 'hero',
          motion: { family: 'fight', beat_class: 'clash' },
          hero: { layout_source: 'imported-html-layout.json', plates: ['P01'] },
          camera: { preset: 'slow_push', nudge: { r: -6 } },
          fx_hooks: [{ type: 'hit_pink', t_rel: 0.08, params: {} }],
          caption: 'BOOM </script>!',
        },
      ],
      bg: {},
      overlays: [],
    },
    layouts: {
      'imported-html-layout.json': {
        P01: { full: 'plates/P01.png' },
      },
    },
    media: [
      { id: 'm1', name: 'P01', src: 'plates/P01.png', layoutSource: 'imported-html-layout.json', plateId: 'P01' },
    ],
    assets: {
      'plates/P01.png': PNG_1X1,
    },
  };
}

test('#239 embedProjectScript safely escapes </script and round-trips via DATA.assets', () => {
  const project = sampleProject();
  const tag = HMHtmlImport.embedProjectScript(project, { omitAssets: true });
  assert.match(tag, /^<script id="hm-project-data" type="application\/json">[\s\S]*<\/script>$/);
  // Must not contain raw unescaped closing script inside JSON payload (only the single outer closing tag).
  assert.equal(tag.split('</script>').length, 2);
  assert.match(tag, /"assets_ref":"DATA\.assets"/);

  const html = `<!doctype html><html><body>${tag}<script>const DATA=${JSON.stringify({ timeline: { show_id: 'ai-duel-demo', title: 'AI Duel Demo', atoms: [], plates: [], bg: {}, overlays: [] }, layout: {}, assets: project.assets })};</script></body></html>`;
  const parsed = HMHtmlImport.parseMotionHtml(html, { fileName: 'ai-duel-demo.html' });
  assert.equal(parsed.kind, 'hm-project-data');
  assert.equal(parsed.project.show.show_id, 'ai-duel-demo');
  assert.equal(parsed.project.show.atoms[0].caption, 'BOOM </script>!');
  assert.equal(parsed.project.show.atoms[0].camera.nudge.r, -6);
  assert.equal(parsed.project.assets['plates/P01.png'], PNG_1X1);
  assert.equal(Object.hasOwn(parsed.project, 'assets_ref'), false);
});

test('#239 parseMotionHtml supports generic <script type="application/json"> show or project', () => {
  const project = sampleProject();
  const safeJson = JSON.stringify(project).replace(/</g, '\\u003c');
  const htmlProj = `<!doctype html><html><body><script type="application/json">${safeJson}</script></body></html>`;
  const r1 = HMHtmlImport.parseMotionHtml(htmlProj, { fileName: 'generic.html' });
  assert.equal(r1.kind, 'json-script');
  assert.equal(r1.project.show.atoms[0].duration_s, 0.65);

  const showOnly = {
    show_id: 'ai-show-only',
    title: 'Show Only',
    atoms: [{ id: 'a1', label: 'Hit', duration_s: 0.8 }],
  };
  const htmlShow = `<!doctype html><html><body><script type="application/json">${JSON.stringify(showOnly)}</script><script>const DATA={"assets":{"shot.png":"${PNG_1X1}"}};</script></body></html>`;
  const r2 = HMHtmlImport.parseMotionHtml(htmlShow, { fileName: 'show-only.html' });
  assert.equal(r2.kind, 'json-script');
  assert.equal(r2.project.show.show_id, 'ai-show-only');
  assert.equal(r2.project.show.atoms[0].pose_mode, 'hero');
  assert.equal(r2.project.assets['shot.png'], PNG_1X1);
});

test('#239 parseMotionHtml reconstructs legacy standalone const DATA={...} with tricky strings', () => {
  const legacyData = {
    timeline: {
      show_id: 'legacy-fight',
      title: 'Legacy Fight {brace in title}',
      bg: { base: 'bg.png' },
      atoms: [
        {
          id: 'beat-01',
          label: 'Jab {1}',
          t0: 0,
          t1: 0.5,
          beat: 'clash',
          family: 'fight',
          cam: [{ preset: 'slow_push', t0: 0, t1: 0.5, nudge: { r: 4 } }],
          fx_hooks: [{ type: 'shake', t_rel: 0.08, params: {} }],
          caption: 'KAPOW',
          caption_style: 'slam',
        },
      ],
      plates: [{ id: 'p1', t0: 0, t1: 0.5 }],
      overlays: [
        { id: 'caption-beat-01', editor_caption: true, kind: 'text', text: 'KAPOW' },
        { id: 'custom-ov', kind: 'text', text: 'Keep me', t_start: 0, t_end: 0.5 },
      ],
    },
    layout: {
      p1: { source_plate: 'P01', full: 'plates/P01.png' },
    },
    assets: {
      'plates/P01.png': PNG_1X1,
      'bg.png': PNG_1X1_ALT,
    },
  };
  const html = `<!doctype html><html><script>function helper(){return {a:1};}\nconst DATA=${JSON.stringify(legacyData)};\n</script></html>`;
  const res = HMHtmlImport.parseMotionHtml(html, { fileName: 'legacy.html' });
  assert.equal(res.kind, 'legacy-data');
  assert.equal(res.project.show.show_id, 'legacy-fight');
  assert.equal(res.project.show.atoms[0].duration_s, 0.5);
  assert.equal(res.project.show.atoms[0].camera.preset, 'slow_push');
  assert.equal(res.project.show.atoms[0].camera.nudge.r, 4);
  assert.equal(res.project.show.atoms[0].caption, 'KAPOW');
  assert.equal(res.project.show.atoms[0].hero.layout_source, 'imported-html-layout.json');
  assert.equal(res.project.show.overlays.length, 1);
  assert.equal(res.project.show.overlays[0].id, 'custom-ov');
  assert.equal(res.project.assets['plates/P01.png'], PNG_1X1);
});

test('#239 parseMotionHtml extracts unique inline data:image/* from raw AI HTML and rejects empty HTML with formatHint', () => {
  const rawHtml = `<!doctype html><html><body><img src="${PNG_1X1}"><img src="${PNG_1X1}"><img src="${PNG_1X1_ALT}"></body></html>`;
  const res = HMHtmlImport.parseMotionHtml(rawHtml, { fileName: 'My Raw AI Fight!.html' });
  assert.equal(res.kind, 'raw-html-images');
  assert.equal(res.project.show.show_id, 'my-raw-ai-fight');
  assert.equal(res.project.show.atoms.length, 2);
  assert.equal(res.project.show.atoms[0].duration_s, 0.75);
  assert.equal(res.project.show.atoms[1].duration_s, 0.75);
  assert.match(res.warnings[0], /Extracted 2 inline image/);

  assert.throws(
    () => HMHtmlImport.parseMotionHtml('<html><body><p>Hello world</p></body></html>', { fileName: 'bad.html' }),
    err => err.code === 'UNSUPPORTED_HTML' && typeof err.formatHint === 'string' && err.formatHint.includes('hm-project-data')
  );
});

test('#238 relinkMissingAssets matches exact, basename, and case-insensitive basename while preserving edits and locks', () => {
  const p = sampleProject();
  p.assets = {};
  p.layouts['imported-html-layout.json'].P02 = { full: 'plates/Second_Shot.PNG' };
  p.media.push({ id: 'm2', name: 'P02', src: 'plates/Second_Shot.PNG', layoutSource: 'imported-html-layout.json', plateId: 'P02' });
  p.show.bg = { base: 'bg/Rooftop.png' };

  const relink = HMHtmlImport.relinkMissingAssets(p, {
    'P01.png': PNG_1X1,
    'second_shot.png': PNG_1X1_ALT,
    'extra-unused.png': PNG_1X1,
  });

  assert.equal(relink.matched.length, 2);
  assert.deepEqual(relink.remainingMissing, ['bg/Rooftop.png']);
  assert.deepEqual(relink.unmatchedFiles, ['extra-unused.png']);
  assert.equal(relink.project.assets['plates/P01.png'], PNG_1X1);
  assert.equal(relink.project.assets['plates/Second_Shot.PNG'], PNG_1X1_ALT);
  assert.equal(Object.hasOwn(relink.project.assets, 'bg/Rooftop.png'), false);
  // Clip edits and costume locks stay completely intact
  assert.equal(relink.project.show.atoms[0].duration_s, 0.65);
  assert.equal(relink.project.show.atoms[0].caption, 'BOOM </script>!');
  assert.deepEqual(relink.project.show.costume_lock, { lock_id: 'lock-v1' });
  assert.deepEqual(relink.project.show.chars, p.show.chars);
  // Check HMImportReceipt integration
  const receipt = HMImportReceipt.buildReceipt({
    action: 'Relink missing images',
    status: 'partial',
    filesLanded: relink.matched.map(m => m.file),
    missing: relink.remainingMissing,
    relinkable: true,
    undoable: true,
  });
  assert.equal(receipt.relinkable, true);
});

test('#239 / #238 / #235 static HTML, FE-only boundary, video-first dialog, and 5.00s demo integrity', () => {
  const indexHtml = fs.readFileSync(path.join(ROOT, 'public/ui/index.html'), 'utf8');
  const htmlImportSrc = fs.readFileSync(path.join(ROOT, 'public/ui/html-import.js'), 'utf8');
  const stylesCss = fs.readFileSync(path.join(ROOT, 'public/ui/styles.css'), 'utf8');
  const demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/shows/daiyu-wang-five-seconds.json'), 'utf8'));

  assert.match(indexHtml, /id="projectInput"[^>]*accept="[^"]*\.html[^"]*\.htm/);
  assert.match(indexHtml, /id="relinkAssetsInput"/);
  assert.match(indexHtml, /<script src="\.\/html-import\.js" defer><\/script>/);

  const nav = indexHtml.match(/<nav id="firstPath"[\s\S]*?<\/nav>/)[0];
  assert.match(nav, /id="firstPathImportHtml"[^>]*data-first-path="import-html"/);
  assert.match(nav, /id="firstPathVideo"[^>]*data-first-path="video"/);

  const exportOpts = indexHtml.match(/<div class="export-options">[\s\S]*?<\/div>/)[0];
  assert.match(exportOpts, /<button id="exportVideo"[^>]*class="primary"/);
  assert.ok(exportOpts.indexOf('id="exportVideo"') < exportOpts.indexOf('id="exportFrames"'));
  assert.ok(exportOpts.indexOf('id="exportFrames"') < exportOpts.indexOf('id="exportHtml"'));

  assert.match(stylesCss, /#pf09GatePanel\[data-ui-collapsed="true"\]/);
  assert.match(stylesCss, /#bakeQaDock\[data-ui-collapsed="true"\]/);

  // Strictly FE-only: zero backend API / provider calls
  assert.doesNotMatch(htmlImportSrc, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|api\.teqcon|:8770|wrangler|\/api\/|\/compose/);

  // Preserve 5.00s eight-plate demo intact
  assert.equal(demo.show_id, 'daiyu-wang-five-seconds');
  assert.equal(demo.atoms.length, 8);
  assert.equal(demo.atoms.reduce((s, a) => s + a.duration_s, 0), 5);
});

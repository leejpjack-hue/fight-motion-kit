'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');

const { createToolset, resolveSandboxedPath, assertNotGoldDemo } = require('../mcp/hm-studio-mcp/tools.cjs');
const { createFrameParser, encodeFrame } = require('../mcp/hm-studio-mcp/server.cjs');

const REPO = path.resolve(__dirname, '..');
const DEMO_REL = 'public/shows/daiyu-wang-five-seconds.json';

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeClonedShow(dir, filename, showId, baseShowRel = DEMO_REL) {
  const doc = JSON.parse(fs.readFileSync(path.join(REPO, baseShowRel), 'utf8'));
  doc.show_id = showId;
  const target = path.join(dir, filename);
  fs.writeFileSync(target, JSON.stringify(doc, null, 2));
  return { target, doc };
}

test('hm_catalog_list exposes real presets across camera, fx, pixelfx, cuts, bg, run_presets, recipes, mood, density', async () => {
  const ws = mkTmp('hm-ai02-cat-');
  const tools = createToolset({ workspaceRoot: ws, repoRoot: REPO });

  const all = await tools.callTool('hm_catalog_list', {});
  assert.ok(all.camera.presets.some(p => p.id === 'eye_push'));
  assert.ok(all.camera.eases.includes('punch_in'));
  assert.ok(all.camera.eases.includes('recoil_settle'));
  assert.ok(all.fx.some(f => f.id === 'hit_orange'));
  assert.equal(all.fx.some(f => f.id === 'dust' || f.id === 'fire'), false);
  assert.ok(all.pixelfx.some(w => w.id === 'impacts/hit-spark'));
  assert.ok(all.cuts.gold.some(c => c.id === 'freeze_hold'));
  assert.ok(all.cuts.extended.some(c => c.id === 'slash_wipe'));
  assert.ok(all.bg.scroll_presets.includes('scroll_left'));
  assert.ok(all.run_presets.some(r => r.id === 'full_sprint'));
  assert.ok(all.scene_recipes.some(r => r.id === 'high_speed_chase'));
  assert.ok(all.mood.some(m => m.id === 'night_neon'));
  assert.ok(all.density.profiles.includes('anime_2f'));
  assert.ok(all.impact.archetypes.some(a => a.id === 'heavy_slam'));
  assert.ok(all.cam_cards.some(c => c.id === 'snap_punch_in'));

  const sub = await tools.callTool('hm_catalog_list', { kind: 'run_presets' });
  assert.equal(sub.kind, 'run_presets');
  assert.ok(sub.items.length >= 4);
  await assert.rejects(() => tools.callTool('hm_catalog_list', { kind: 'bogus' }), /Unknown catalog kind/);
});

test('hm_show_inspect & hm_show_validate inspect JSON/HTML shows and return compose/lint/peek results', async () => {
  const ws = mkTmp('hm-ai02-val-');
  const tools = createToolset({ workspaceRoot: ws, repoRoot: REPO });
  writeClonedShow(ws, 'street.json', 'hm-ai-02-street', 'public/shows/street-old-city.json');

  const inspected = await tools.callTool('hm_show_inspect', { path: 'street.json' });
  assert.equal(inspected.format, 'show');
  assert.equal(inspected.show_id, 'hm-ai-02-street');
  assert.ok(inspected.clip_count >= 1);
  assert.deepEqual(inspected.missing_assets, []);

  const validated = await tools.callTool('hm_show_validate', { path: 'street.json' });
  assert.equal(validated.ok, true, (validated.errors || []).join('; '));
  assert.ok(validated.duration_s > 0);
  assert.equal(validated.lint.error_count, 0);
  assert.ok(Array.isArray(validated.peeks) && validated.peeks.length > 0);
});

test('hm_show_patch applies running BG, pass_by FG, camera/cut/FX/mood/density atomically and fails closed without writes', async () => {
  const ws = mkTmp('hm-ai02-patch-');
  const tools = createToolset({ workspaceRoot: ws, repoRoot: REPO });
  const { target: inPath } = writeClonedShow(ws, 'in.show.json', 'hm-ai-02-patch', 'public/shows/street-old-city.json');
  const outPath = path.join(ws, 'out.show.json');

  const res = await tools.callTool('hm_show_patch', {
    path: 'in.show.json',
    out_path: 'out.show.json',
    operations: [
      { op: 'set_bg_motion', run_preset: 'full_sprint', speed_px_s: 1050, tile_mode: 'tile', motion_blur: 0.45 },
      { op: 'set_fg_cam', cam: { preset: 'parallax', amount: 0.6 } },
      { op: 'upsert_fg_prop', id: 'lamp', src: 'assets/fg/lamp.png', pass_by: { enabled: true, direction: 'left', speed_px_s: 900, parallax_mult: 2.1, spacing_px: 1500, motion_blur: 0.35 } },
      { op: 'set_clip_camera', clip_index: 0, preset: 'eye_push', ease: 'punch_in', intensity: 1.25 },
      { op: 'set_clip_cut', clip_index: 1, preset: 'slash_wipe', dur_s: 0.16, dir: -1 },
      { op: 'add_clip_fx', clip_index: 0, type: 'hit_orange', t_rel: 0.12, color: '#ff8a1e', strength: 1.4, hitstop_frames: 2 },
      { op: 'set_mood', mood: 'night_neon', scope: 'show', intensity: 0.65, parallax_ratio: 0.32 },
      { op: 'apply_motion_density', profile: 'anime_2f' },
    ],
  });

  assert.equal(res.ok, true);
  assert.equal(res.applied_operations, 8);
  const patched = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  assert.equal(patched.bg.motion.preset, 'scroll_left');
  assert.equal(patched.bg.motion.speed_px_s, 1050);
  assert.equal(patched.fg.cam.amount, 0.6);
  assert.equal(patched.fg.props[0].pass_by.direction, 'left');
  assert.equal(patched.atoms[0].camera.ease, 'punch_in');
  assert.deepEqual(patched.atoms[1].cut, { preset: 'slash_wipe', dur_s: 0.16, hold_s: 0, dir: -1 });
  assert.equal(patched.atoms[0].fx_hooks.at(-1).type, 'hit_orange');
  assert.equal(patched.mood.id, 'night_neon');
  assert.equal(patched.bg.parallax_ratio, 0.32);
  assert.ok(Array.isArray(patched.atoms[0].micro_frames) && patched.atoms[0].micro_frames.length >= 1);

  // Input source must remain untouched when out_path !== path
  const orig = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  assert.equal(orig.mood, undefined);

  // Fail-closed guards must write nothing
  const badOut = path.join(ws, 'bad-out.json');
  await assert.rejects(
    () => tools.callTool('hm_show_patch', { path: 'in.show.json', out_path: 'bad-out.json', operations: [{ op: 'set_clip_camera', clip_index: 0, preset: 'wide_establish' }] }),
    /Unknown camera preset/
  );
  await assert.rejects(
    () => tools.callTool('hm_show_patch', { path: 'in.show.json', out_path: 'bad-out.json', operations: [{ op: 'add_clip_fx', clip_index: 0, type: 'fire' }] }),
    /Rejected photo/
  );
  await assert.rejects(
    () => tools.callTool('hm_show_patch', { path: 'in.show.json', out_path: 'bad-out.json', operations: [{ op: 'add_clip_fx', clip_index: 0, type: 'hit_orange', voice: true }] }),
    /HOLD/
  );
  await assert.rejects(
    () => tools.callTool('hm_show_patch', { path: 'in.show.json', out_path: '../outside.json', operations: [{ op: 'set_mood', mood: 'night_neon' }] }),
    /sandbox/i
  );
  assert.equal(fs.existsSync(badOut), false);

  // Symlink escape inside workspace must also fail
  const outsideDir = mkTmp('hm-ai02-out-');
  const outsideFile = path.join(outsideDir, 'secret.json');
  fs.writeFileSync(outsideFile, '{}');
  const linkPath = path.join(ws, 'escape-link.json');
  fs.symlinkSync(outsideFile, linkPath);
  assert.throws(() => resolveSandboxedPath(ws, 'escape-link.json', { mustExist: true }), /sandbox/i);

  // Refusing 5.00s gold demo mutation
  assert.throws(() => assertNotGoldDemo(path.join(REPO, DEMO_REL), REPO), /daiyu-wang-five-seconds\.json/);
});

test('hm_export_editable_html builds CSP-hardened HTML that round-trips cleanly via HMHtmlImport.parseMotionHtml', async () => {
  const ws = mkTmp('hm-ai02-html-');
  const tools = createToolset({ workspaceRoot: ws, repoRoot: REPO });
  writeClonedShow(ws, 'demo-clone.json', 'hm-ai-02-html', DEMO_REL);

  await tools.callTool('hm_show_patch', {
    path: 'demo-clone.json',
    out_path: 'patched.json',
    operations: [{ op: 'apply_motion_density', profile: 'subtle_1f' }],
  });

  const exp = await tools.callTool('hm_export_editable_html', {
    path: 'patched.json',
    out_html: 'editable.html',
  });
  assert.equal(exp.ok, true);
  assert.ok(exp.embedded_images > 0);
  const html = fs.readFileSync(exp.out_html, 'utf8');
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /<script id="hm-project-data" type="application\/json">/);
  assert.match(html, /const DATA=/);

  // Validate inline JS scripts parse cleanly
  const scripts = [...html.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi)].filter(m => !m[0].includes('type="application/json"'));
  assert.ok(scripts.length >= 1);
  for (const [, code] of scripts) new vm.Script(code);

  // Inspect exported HTML back through MCP tool & HMHtmlImport
  const inspected = await tools.callTool('hm_show_inspect', { path: 'editable.html' });
  assert.equal(inspected.format, 'html');
  assert.equal(inspected.show_id, 'hm-ai-02-html');
  assert.equal(inspected.clips[0].micro_frames[0].frames, 1);
  assert.deepEqual(inspected.missing_assets, []);
});

test('server.cjs handles NDJSON and Content-Length stdio JSON-RPC cleanly over real child_process pipes', async () => {
  const ws = mkTmp('hm-ai02-stdio-');
  writeClonedShow(ws, 'show.json', 'hm-ai-02-stdio', 'public/shows/street-old-city.json');

  const child = spawn(process.execPath, [
    path.join(REPO, 'mcp/hm-studio-mcp/server.cjs'),
    '--workspace', ws,
    '--repo', REPO,
  ], { stdio: ['pipe', 'pipe', 'pipe'] });

  const responses = [];
  const parser = createFrameParser(raw => {
    responses.push(JSON.parse(raw));
  });
  child.stdout.on('data', chunk => parser.push(chunk));

  const nextResponse = (expectedId) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for response id ' + expectedId)), 5000);
    const check = () => {
      const idx = responses.findIndex(r => r.id === expectedId);
      if (idx >= 0) {
        clearTimeout(timer);
        resolve(responses.splice(idx, 1)[0]);
      } else {
        setTimeout(check, 10);
      }
    };
    check();
  });

  try {
    // 1. NDJSON initialize + notification + ping + tools/list + tools/call
    child.stdin.write(encodeFrame({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } }, 'ndjson'));
    const initRes = await nextResponse(1);
    assert.equal(initRes.result.serverInfo.name, 'fight-motion-kit-mcp');

    child.stdin.write(encodeFrame({ jsonrpc: '2.0', method: 'notifications/initialized' }, 'ndjson'));
    child.stdin.write(encodeFrame({ jsonrpc: '2.0', id: 2, method: 'ping' }, 'ndjson'));
    const pingRes = await nextResponse(2);
    assert.deepEqual(pingRes.result, {});

    child.stdin.write(encodeFrame({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, 'ndjson'));
    const listRes = await nextResponse(3);
    assert.deepEqual(listRes.result.tools.map(t => t.name), [
      'hm_catalog_list', 'hm_show_inspect', 'hm_show_validate', 'hm_show_patch', 'hm_export_editable_html',
    ]);

    child.stdin.write(encodeFrame({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'hm_show_validate', arguments: { path: 'show.json' } } }, 'ndjson'));
    const valRes = await nextResponse(4);
    assert.equal(valRes.result.isError, false);
    assert.equal(JSON.parse(valRes.result.content[0].text).ok, true);

    // Fail-closed error returned via isError: true without crashing server
    child.stdin.write(encodeFrame({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'hm_show_inspect', arguments: { path: '../outside.json' } } }, 'ndjson'));
    const errRes = await nextResponse(5);
    assert.equal(errRes.result.isError, true);
    assert.match(errRes.result.content[0].text, /sandbox/i);

    // 2. Content-Length framed request round-trip
    child.stdin.write(encodeFrame({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'hm_catalog_list', arguments: { kind: 'cuts' } } }, 'content-length'));
    const clRes = await nextResponse(6);
    assert.equal(clRes.result.isError, false);
    assert.ok(JSON.parse(clRes.result.content[0].text).items.extended.some(c => c.id === 'iris_focus'));
  } finally {
    child.kill();
  }
});

test('mcp server stays strictly offline FE-only with zero HTTP listeners or backend URLs', () => {
  const srv = fs.readFileSync(path.join(REPO, 'mcp/hm-studio-mcp/server.cjs'), 'utf8');
  const tls = fs.readFileSync(path.join(REPO, 'mcp/hm-studio-mcp/tools.cjs'), 'utf8');
  for (const src of [srv, tls]) {
    assert.equal(/(?:http|https|net|tls|dgram)\.(?:createServer|createSocket)/.test(src), false);
    assert.equal(/\bfetch\s*\(/.test(src), false);
    assert.equal(/api\.teqcon\.uk/.test(src), false);
    assert.equal(/wrangler/.test(src), false);
  }
  assert.equal(/api\.teqcon\.uk/.test(srv), false);
});

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { assessRepo } = require('./pack.cjs');

const REPO = path.resolve(__dirname, '../../..');
const SHOW_ID = 'baijia-elfmage-void-array';
const SHOW_REL = 'public/shows/baijia-elfmage-void-array.json';
const WORK = path.join(REPO, 'work/skill-invoke', SHOW_ID);

const ROUTES = {
  'character-openpose': character,
  'storyboard-draft': story,
  'rhythm-frame-qa': rhythm,
  'cam-grammar-plan': cameraGrammar,
  'cam-preset-tune': cameraShots,
  'sprite-gen-cli': sprite,
  'bg-frame': background,
  'fg-fx': foreground,
  'hm-composer-assist': compose,
};

function loadShow(showId) {
  const requested = !showId || showId === 'SHOW-PLACEHOLDER' ? SHOW_ID : showId;
  if (requested !== SHOW_ID) {
    const error = new Error('This invoke server only reads the existing void-array pack.');
    error.status = 404;
    throw error;
  }
  const show = JSON.parse(fs.readFileSync(path.join(REPO, SHOW_REL), 'utf8'));
  if (show.show_id !== SHOW_ID) throw new Error('Show file id drifted.');
  return show;
}

function envelope(body, extra) {
  return {
    step: body.step,
    step_id: body.step_id,
    show_id: SHOW_ID,
    requested_show_id: body.show_id || null,
    mode: 'assist',
    product_compose_api: false,
    writes_source_show: false,
    ...extra,
  };
}

function runNode(script, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: REPO,
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      stderr += '\nkilled: timeout';
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code,
        stdout: stdout.slice(-4000),
        stderr: stderr.slice(-4000),
      });
    });
  });
}

async function character(body) {
  const show = loadShow(body.show_id);
  return envelope(body, {
    ok: false,
    outcome: 'incomplete',
    tool: 'skills/hm-character-lock/SKILL.md',
    honest: 'No character-lock CLI is in this checkout. Read the existing cast names only. Did not write a costume_lock pack, sheets, or pose JSON.',
    inspected: {
      L: show.chars && show.chars.L && show.chars.L.name,
      R: show.chars && show.chars.R && show.chars.R.name,
    },
    missing: ['hm-character-lock script', 'prompt-sheets', 'json-pose-from-image'],
  });
}

async function story(body) {
  loadShow(body.show_id);
  return envelope(body, {
    ok: false,
    outcome: 'incomplete',
    tool: 'skills/hm-storyboard-cantonese/scripts/board.cjs',
    honest: 'No approved board file was supplied for this pack. Did not emit a new Cantonese board and did not invent beats. The show JSON already carries its 47 beat labels for the human to edit in HM.',
    missing: ['approved hm-pf-08 board path'],
  });
}

async function rhythm(body) {
  loadShow(body.show_id);
  return envelope(body, {
    ok: false,
    outcome: 'incomplete',
    tool: 'skills/hm-rhythm-pacing/scripts/rhythm.cjs',
    honest: 'rhythm.cjs plan/stamp requires an approved board and a human GO file. This request has neither. Did not manufacture GO and did not write a rhythm plan.',
    missing: ['hm-rhythm-input board', 'step-2 GO file'],
  });
}

async function cameraGrammar(body) {
  loadShow(body.show_id);
  return envelope(body, {
    ok: false,
    outcome: 'incomplete',
    tool: 'skills/hm-cam-grammar-scene/scripts/grammar.cjs',
    honest: 'grammar.cjs needs an exported approved camera-input board. None was supplied. Did not manufacture GO and did not write a grammar sheet.',
    missing: ['approved camera-input JSON'],
  });
}

async function cameraShots(body) {
  loadShow(body.show_id);
  return envelope(body, {
    ok: false,
    outcome: 'incomplete',
    tool: 'skills/hm-cam-shot-author/scripts/author.cjs',
    honest: 'author.cjs needs a grammar JSON from step 4. Step 4 did not produce one. Did not write a camera map.',
    missing: ['grammar JSON'],
  });
}

async function sprite(body) {
  loadShow(body.show_id);
  return envelope(body, {
    ok: false,
    outcome: 'incomplete',
    tool: 'skills/hm-spritegen-handoff/handoff.cjs',
    honest: 'No strip PNG and strip JSON were supplied. Did not classify a handoff. SG-01 stays NOT PLAYABLE until SG-02. Generation stays outside this server.',
    missing: ['strip.png', 'strip.json'],
    not_playable: true,
  });
}

async function background(body) {
  const show = loadShow(body.show_id);
  const out = path.join(WORK, 'bg-attempt.motion.json');
  fs.mkdirSync(WORK, { recursive: true });
  if (fs.existsSync(out)) fs.unlinkSync(out);
  const result = await runNode(
    path.join(REPO, 'skills/hm-bg-scene-author/scripts/author.cjs'),
    ['--repo', REPO, '--project', path.join(REPO, SHOW_REL), '--place', show.title || SHOW_ID, '--out', out],
    120000,
  );
  return envelope(body, {
    ok: result.code === 0,
    outcome: result.code === 0 ? 'ran' : 'tool_refused',
    tool: 'skills/hm-bg-scene-author/scripts/author.cjs',
    honest: result.code === 0
      ? 'Background author wrote a new portable project under work/. The source show was not modified.'
      : 'The existing pack already has background motion or a crop. The author refused to overwrite it. Edit Background in HM. Source show was not modified.',
    exit_code: result.code,
    stderr: result.stderr.trim(),
    wrote_out: result.code === 0,
  });
}

async function foreground(body) {
  const show = loadShow(body.show_id);
  return envelope(body, {
    ok: false,
    outcome: 'incomplete',
    tool: 'skills/hm-fg-layer-author/SKILL.md',
    honest: 'hm-fg-layer-author is a contract stub with no script. Did not write show.fg or generate cutouts.',
    inspected: { has_fg: Object.hasOwn(show, 'fg') },
    missing: ['foreground author script'],
  });
}

function linkCutouts(cutoutDir) {
  const dest = path.join(REPO, 'public/assets', SHOW_ID, 'cutout');
  if (!fs.existsSync(cutoutDir)) return null;
  if (fs.existsSync(dest)) {
    const current = fs.lstatSync(dest);
    if (current.isSymbolicLink() && fs.realpathSync(dest) === fs.realpathSync(cutoutDir)) return dest;
    return dest;
  }
  fs.symlinkSync(cutoutDir, dest);
  return dest;
}

async function compose(body) {
  loadShow(body.show_id);
  const pack = assessRepo(REPO);
  if (!pack.ok) {
    return envelope(body, {
      ok: false,
      outcome: 'missing_plates',
      tool: 'ops/n8n/skill-invoke/pack.cjs',
      honest: 'Hero cutouts are missing, or the layout still points only at board-slate.png. Refused to encode an empty stage. Source show was not modified.',
      pack: { reason: pack.reason, plates: pack.plates, missing: pack.missing, sample: pack.sample, layout: pack.layout },
    });
  }
  const cutoutDir = path.join(path.dirname(pack.layout), 'cutout');
  if (fs.existsSync(cutoutDir)) linkCutouts(cutoutDir);
  fs.mkdirSync(WORK, { recursive: true });
  const project = path.join(WORK, 'portable.motion.json');
  const video = path.join(WORK, SHOW_ID + '.mp4');
  const report = path.join(WORK, 'export-report.json');
  const fps = String(process.env.HM_EXPORT_FPS || '24');
  const buildArgs = ['--repo', REPO, '--show', SHOW_REL, '--out', project];
  if (path.resolve(pack.layout) !== path.resolve(REPO, 'public/assets', SHOW_ID, 'layout.json')) {
    buildArgs.push('--layout', pack.layout);
  }
  const built = await runNode(
    path.join(REPO, 'skills/html-motion-composer/scripts/build-project.cjs'),
    buildArgs,
    180000,
  );
  if (built.code !== 0) {
    return envelope(body, {
      ok: false,
      outcome: 'tool_failed',
      tool: 'skills/html-motion-composer/scripts/build-project.cjs',
      honest: 'The existing build-project helper failed. No video was encoded. Source show was not modified.',
      exit_code: built.code,
      stderr: built.stderr.trim(),
      pack: { reason: pack.reason, layout: pack.layout },
    });
  }
  const exported = await runNode(
    path.join(REPO, 'skills/html-motion-composer/scripts/export-project.cjs'),
    ['--repo', REPO, '--project', project, '--video', video, '--report', report, '--fps', fps],
    1200000,
  );
  if (exported.code !== 0 || !fs.existsSync(video)) {
    return envelope(body, {
      ok: false,
      outcome: 'tool_failed',
      tool: 'skills/html-motion-composer/scripts/export-project.cjs',
      honest: 'build-project wrote a portable project under work/. export-project did not encode an H.264 MP4. Source show was not modified.',
      exit_code: exported.code,
      stderr: exported.stderr.trim(),
      stdout: exported.stdout.trim(),
    });
  }
  const bytes = fs.readFileSync(video);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  let copied = null;
  const artifactDir = process.env.HM_ARTIFACT_DIR;
  if (artifactDir) {
    fs.mkdirSync(artifactDir, { recursive: true });
    copied = path.join(artifactDir, SHOW_ID + '-skill-invoke.mp4');
    fs.copyFileSync(video, copied);
  }
  return envelope(body, {
    ok: true,
    outcome: 'ran',
    tool: 'skills/html-motion-composer/scripts/export-project.cjs',
    honest: 'Encoded the approved void-array pack with the existing composer export helper as 1280x720 H.264 MP4 (+faststart). This is not a new compose API. Source show was not modified.',
    fps: Number(fps),
    video_path: video,
    artifact_path: copied,
    sha256,
    bytes: bytes.length,
    stderr: exported.stderr.trim().slice(-500),
  });
}

async function invoke(route, body) {
  const handler = ROUTES[route];
  if (!handler) {
    const error = new Error('Unknown skill route.');
    error.status = 404;
    throw error;
  }
  return handler(body || {});
}

module.exports = { ROUTES, SHOW_ID, invoke, envelope };

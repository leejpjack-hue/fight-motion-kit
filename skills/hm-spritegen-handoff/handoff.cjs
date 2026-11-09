'use strict';

// HM-PF-25 file-class gate. Local names and bytes only.
// Generation stays outside the FE. This module does not spawn, fetch, or upload.
// SG-00 in the sprite-gen brief is the schema SoT. HMStripAdapter is the import subset.

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const STRIP_KEYS = ['frames', 'w', 'h', 'body_h'];
const CREDENTIAL_KEYS = new Set([
  'credential', 'credentials', 'password', 'passwd', 'secret', 'secrets',
  'api_key', 'apikey', 'access_token', 'accesstoken', 'refresh_token', 'refreshtoken',
  'token', 'authorization', 'private_key', 'privatekey'
]);
const SESSION_KEYS = new Set([
  'session', 'session_id', 'sessionid', 'run_session', 'runsession', 'run_id', 'runid'
]);

function localName(name) {
  if (typeof name !== 'string' || name.length < 1 || name.length > 255) return null;
  if (/[\\/:\u0000-\u001f]/.test(name) || name === '.' || name === '..') return null;
  return name;
}

function credentialName(name) {
  const n = name.toLowerCase();
  if (n === '.env' || n.startsWith('.env.')) return true;
  return /(?:^|[^a-z0-9])(?:credentials?|secrets?|passwords?|api[-_]?keys?|access[-_]?tokens?|refresh[-_]?tokens?|tokens?)(?:[^a-z0-9]|$)/.test(n);
}

function runSessionName(name) {
  const n = name.toLowerCase();
  return /(?:^|[^a-z0-9])(?:run[-_]?sessions?|sessions?)(?:[^a-z0-9]|$)/.test(n);
}

function nameVerdict(name) {
  const base = localName(name);
  if (!base) return { name: String(name ?? ''), reason: 'unsafe-name' };
  if (credentialName(base)) return { name: base, reason: 'credential' };
  if (runSessionName(base)) return { name: base, reason: 'run-session' };
  if (base.toLowerCase() === 'manifest.json') return { name: base, reason: 'atlas-hold' };
  return null;
}

function bytesOf(entry) {
  if (!entry || entry.bytes == null) return null;
  return Buffer.isBuffer(entry.bytes) ? entry.bytes : Buffer.from(entry.bytes);
}

function scan(value, hit) {
  if (typeof value === 'string') {
    if (/\b(?:credentials?|password|token)\b/i.test(value)) hit.credential = hit.credential || 'text';
    else if (/\bsession\b/i.test(value)) hit.session = hit.session || 'text';
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(item => scan(item, hit));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const id = key.toLowerCase().replace(/-/g, '_');
    if (CREDENTIAL_KEYS.has(id)) hit.credential = hit.credential || key;
    else if (SESSION_KEYS.has(id)) hit.session = hit.session || key;
    scan(child, hit);
  }
}

function lead(rejected) {
  const reasons = new Set(rejected.map(item => item.reason));
  if (reasons.has('credential')) return 'Credential files are rejected. They never enter HM.';
  if (reasons.has('run-session')) return 'Run-session files are rejected. They never enter HM.';
  if (reasons.has('atlas-hold')) return 'Atlas manifest is DESIGNED-HOLD (HM-PF-27). The first path is strip PNG+JSON.';
  if (reasons.has('root-motion-hold')) return 'root_motion is rejected. The first path remains strip PNG+JSON.';
  if (reasons.has('unsafe-name')) return 'Use local filenames without paths or references.';
  if (reasons.has('not-png')) return 'Strip PNG is missing a PNG signature.';
  if (reasons.has('not-json')) return 'Strip JSON must parse as an object sidecar.';
  if (reasons.has('not-strip')) return 'Strip JSON is missing frames, w, h, or body_h. SG-00 in the sprite-gen brief is the schema SoT.';
  if (reasons.has('missing-bytes')) return 'Read the local strip PNG and strip JSON before import.';
  return 'Handoff rejected.';
}

function fail(error, rejected) {
  return {
    ok: false,
    path: null,
    generation: 'outside-fe',
    import: 'file-api',
    files: [],
    error,
    rejected
  };
}

function classifyHandoff(entries) {
  const list = Array.from(entries || []);
  const rejected = [];
  const named = [];
  for (const entry of list) {
    const verdict = nameVerdict(entry && entry.name);
    if (verdict) {
      rejected.push(verdict);
      continue;
    }
    const name = localName(entry.name);
    const bytes = bytesOf(entry);
    if (!bytes) {
      rejected.push({ name, reason: 'missing-bytes' });
      continue;
    }
    if (/\.json$/i.test(name)) {
      let parsed;
      try {
        parsed = JSON.parse(bytes.toString('utf8'));
      } catch {
        rejected.push({ name, reason: 'not-json' });
        continue;
      }
      const hit = {};
      scan(parsed, hit);
      if (hit.credential) rejected.push({ name, reason: 'credential' });
      else if (hit.session) rejected.push({ name, reason: 'run-session' });
      else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
        (Object.prototype.hasOwnProperty.call(parsed, 'root_motion') || Object.prototype.hasOwnProperty.call(parsed, 'rootmotion'))) {
        rejected.push({ name, reason: 'root-motion-hold' });
      } else named.push({ name, bytes, parsed });
    } else if (/\.png$/i.test(name)) {
      if (bytes.length < PNG_SIG.length || !bytes.subarray(0, PNG_SIG.length).equals(PNG_SIG)) {
        rejected.push({ name, reason: 'not-png' });
      } else named.push({ name, bytes });
    } else named.push({ name, bytes });
  }
  if (rejected.length) return fail(lead(rejected), rejected);

  const png = named.filter(item => /\.png$/i.test(item.name));
  const json = named.filter(item => /\.json$/i.test(item.name));
  if (named.length !== 2 || png.length !== 1 || json.length !== 1) {
    return fail('First path is one strip PNG and one strip JSON. Generation stays outside the FE. File API import only.', []);
  }
  const parsed = json[0].parsed;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || STRIP_KEYS.some(key => !Object.prototype.hasOwnProperty.call(parsed, key))) {
    return fail(lead([{ reason: 'not-strip' }]), [{ name: json[0].name, reason: 'not-strip' }]);
  }
  return {
    ok: true,
    path: 'strip-png-json',
    generation: 'outside-fe',
    import: 'file-api',
    files: [png[0].name, json[0].name],
    error: null,
    rejected: []
  };
}

function main(argv) {
  if (!argv.length) {
    process.stderr.write('Usage: node skills/hm-spritegen-handoff/handoff.cjs <strip.png> <strip.json>\n');
    process.exit(2);
  }
  const fs = require('fs');
  const path = require('path');
  const rejected = [];
  const entries = [];
  for (const file of argv) {
    let stat;
    try {
      stat = fs.lstatSync(file);
    } catch (error) {
      process.stdout.write(JSON.stringify(fail(error.message, [{ name: path.basename(file), reason: 'missing' }])) + '\n');
      process.exit(1);
    }
    const name = path.basename(file);
    if (stat.isDirectory()) {
      rejected.push({ name, reason: 'run-session' });
      continue;
    }
    const verdict = nameVerdict(name);
    if (verdict) {
      rejected.push(verdict);
      continue;
    }
    entries.push({ name, bytes: fs.readFileSync(file) });
  }
  const result = rejected.length ? fail(lead(rejected), rejected) : classifyHandoff(entries);
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(result.ok ? 0 : 1);
}

module.exports = { classifyHandoff, nameVerdict };

if (require.main === module) main(process.argv.slice(2));

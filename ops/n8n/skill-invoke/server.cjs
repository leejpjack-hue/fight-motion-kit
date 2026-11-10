#!/usr/bin/env node
'use strict';

const http = require('node:http');
const { invoke } = require('./handlers.cjs');

const port = Number(process.env.HM_SKILL_PORT || 8787);
const host = process.env.HM_SKILL_HOST || '0.0.0.0';

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(Object.assign(new Error('Body too large.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('JSON body required.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"status":"ok"}\n');
    return;
  }
  const match = /^\/skills\/([a-z0-9-]+)$/.exec((req.url || '').split('?')[0]);
  if (!match || req.method !== 'POST') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{"ok":false,"honest":"Unknown route."}\n');
    return;
  }
  try {
    const body = await readBody(req);
    const result = await invoke(match[1], body);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result) + '\n');
  } catch (error) {
    const status = error.status || 500;
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, outcome: 'error', honest: error.message }) + '\n');
  }
});

if (require.main === module) {
  server.listen(port, host, () => {
    console.log('skill-invoke listening on ' + host + ':' + port);
  });
}

module.exports = { server };

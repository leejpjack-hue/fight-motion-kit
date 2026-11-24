#!/usr/bin/env node
'use strict';

/* Strict offline zero-network stdio JSON-RPC 2.0 MCP server for Fight Motion Kit.
 * Zero HTTP listeners, zero network sockets, zero external npm dependencies. */
const path = require('node:path');
const { createToolset } = require('./tools.cjs');

const PROTOCOL_DEFAULT = '2024-11-05';
const SERVER_INFO = { name: 'fight-motion-kit-mcp', version: '1.0.0' };

function parseCliArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--workspace' || token === '--repo') {
      const val = argv[++i];
      if (!val || val.startsWith('--')) throw new Error(token + ' requires a directory path');
      out[token.slice(2)] = val;
    } else if (token === '--help' || token === '-h') {
      out.help = true;
    } else {
      throw new Error('Unknown argument: ' + token);
    }
  }
  return out;
}

function createFrameParser(onFrame) {
  let buf = Buffer.alloc(0);
  let lastMode = 'ndjson';

  function push(chunk) {
    const add = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8');
    buf = Buffer.concat([buf, add]);
    while (buf.length > 0) {
      let lead = 0;
      while (lead < buf.length && (buf[lead] === 0x0d || buf[lead] === 0x0a || buf[lead] === 0x20 || buf[lead] === 0x09)) {
        lead++;
      }
      if (lead > 0) {
        buf = buf.subarray(lead);
        if (!buf.length) break;
      }

      const preview = buf.subarray(0, Math.min(buf.length, 32)).toString('ascii');
      if (/^Content-Length:/i.test(preview) || /^Content-Type:/i.test(preview)) {
        let sepIdx = buf.indexOf('\r\n\r\n');
        let sepLen = 4;
        if (sepIdx < 0) {
          sepIdx = buf.indexOf('\n\n');
          sepLen = 2;
        }
        if (sepIdx < 0) break;
        const headerText = buf.subarray(0, sepIdx).toString('ascii');
        const match = /Content-Length:\s*(\d+)/i.exec(headerText);
        if (!match) {
          buf = buf.subarray(sepIdx + sepLen);
          continue;
        }
        const byteLen = parseInt(match[1], 10);
        const bodyStart = sepIdx + sepLen;
        if (buf.length < bodyStart + byteLen) break;
        const payload = buf.subarray(bodyStart, bodyStart + byteLen).toString('utf8');
        buf = buf.subarray(bodyStart + byteLen);
        lastMode = 'content-length';
        onFrame(payload, 'content-length');
      } else {
        const nl = buf.indexOf('\n');
        if (nl < 0) break;
        const line = buf.subarray(0, nl).toString('utf8').replace(/\r$/, '').trim();
        buf = buf.subarray(nl + 1);
        if (!line) continue;
        lastMode = 'ndjson';
        onFrame(line, 'ndjson');
      }
    }
  }

  return { push, getMode: () => lastMode };
}

function encodeFrame(obj, mode) {
  const json = JSON.stringify(obj);
  if (mode === 'content-length') {
    const body = Buffer.from(json, 'utf8');
    return Buffer.concat([Buffer.from('Content-Length: ' + body.length + '\r\n\r\n', 'ascii'), body]);
  }
  return json + '\n';
}

function createServer(options) {
  const opts = options || {};
  const toolset = createToolset({
    workspaceRoot: opts.workspaceRoot || process.cwd(),
    repoRoot: opts.repoRoot || path.resolve(__dirname, '../..'),
  });
  const write = typeof opts.write === 'function' ? opts.write : (out => process.stdout.write(out));

  function send(obj, mode) {
    write(encodeFrame(obj, mode));
  }

  async function handleMessage(rawText, mode) {
    let msg;
    try {
      msg = JSON.parse(rawText);
    } catch (err) {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: ' + err.message } }, mode);
      return;
    }
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') {
      send({ jsonrpc: '2.0', id: msg && msg.id != null ? msg.id : null, error: { code: -32600, message: 'Invalid JSON-RPC 2.0 request' } }, mode);
      return;
    }

    const id = msg.id;
    const isRequest = id !== undefined && id !== null;
    const method = msg.method;
    const params = msg.params || {};

    try {
      if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
        return;
      }
      if (!isRequest) return;

      if (method === 'initialize') {
        send({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: params.protocolVersion || PROTOCOL_DEFAULT,
            capabilities: { tools: { listChanged: false } },
            serverInfo: SERVER_INFO,
          },
        }, mode);
        return;
      }
      if (method === 'ping') {
        send({ jsonrpc: '2.0', id, result: {} }, mode);
        return;
      }
      if (method === 'tools/list') {
        send({ jsonrpc: '2.0', id, result: { tools: toolset.tools } }, mode);
        return;
      }
      if (method === 'tools/call') {
        try {
          const out = await toolset.callTool(params.name, params.arguments || {});
          send({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
              isError: false,
            },
          }, mode);
        } catch (toolErr) {
          send({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify({ ok: false, error: toolErr.message }, null, 2) }],
              isError: true,
            },
          }, mode);
        }
        return;
      }

      send({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: 'Method not found: ' + method },
      }, mode);
    } catch (err) {
      if (isRequest) {
        send({
          jsonrpc: '2.0',
          id,
          error: { code: -32603, message: 'Internal error: ' + err.message },
        }, mode);
      }
    }
  }

  let queue = Promise.resolve();
  const parser = createFrameParser((payload, mode) => {
    queue = queue.then(() => handleMessage(payload, mode)).catch(err => {
      process.stderr.write('hm-studio-mcp error: ' + err.message + '\n');
    });
  });

  function attachStdio(stdinStream) {
    const input = stdinStream || process.stdin;
    input.on('data', chunk => parser.push(chunk));
    input.resume();
    return () => queue;
  }

  return { toolset, parser, handleMessage, attachStdio };
}

if (require.main === module) {
  let cli;
  try {
    cli = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(err.message + '\n');
    process.exit(1);
  }
  if (cli.help) {
    process.stderr.write('Usage: node mcp/hm-studio-mcp/server.cjs [--workspace <dir>] [--repo <dir>]\n');
    process.exit(0);
  }
  const server = createServer({
    workspaceRoot: cli.workspace || process.cwd(),
    repoRoot: cli.repo || path.resolve(__dirname, '../..'),
  });
  server.attachStdio(process.stdin);
}

module.exports = {
  SERVER_INFO,
  createFrameParser,
  encodeFrame,
  createServer,
  parseCliArgs,
};

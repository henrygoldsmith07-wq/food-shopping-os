/**
 * A local stand-in for Upstash Redis, for previews only.
 *
 * The app's document store speaks the Upstash REST protocol, which normally
 * means a cloud account. In a preview the real thing is not available, so
 * this bridge exposes the same protocol in front of a plain local Redis —
 * started here too when one is not already running — which keeps every
 * command, including the Lua evals, behaving exactly as it would upstream.
 *
 * In-memory by design: a preview's data is disposable, and nothing here is a
 * substitute for the real database in production.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import net from 'node:net';

const PORT = Number(process.env.DEV_BACKEND_PORT || 23001);
const REDIS_PORT = Number(process.env.DEV_BACKEND_REDIS_PORT || 6379);
const TOKEN = process.env.DEV_BACKEND_TOKEN || 'dev-local-preview';

// --- RESP ----------------------------------------------------------------

/** Encode a command array as a RESP array of bulk strings. */
const encodeCommand = (command) => {
  const args = command.map((arg) => (arg === null || arg === undefined ? '' : String(arg)));
  let out = `*${args.length}\r\n`;
  for (const arg of args) out += `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`;
  return out;
};

const NEED_MORE = Symbol('need-more');

/**
 * Incremental parser for RESP replies (+simple, -error, :int, $bulk, *array).
 * Each read() consumes exactly one reply; a truncated buffer yields
 * NEED_MORE so the caller can feed it the next chunk.
 */
const createReplyParser = () => {
  let buffer = Buffer.alloc(0);
  const readLine = () => {
    const end = buffer.indexOf('\r\n');
    if (end < 0) throw NEED_MORE;
    const line = buffer.slice(0, end).toString();
    buffer = buffer.slice(end + 2);
    return line;
  };
  const readReply = () => {
    const line = readLine();
    const type = line[0];
    const body = line.slice(1);
    if (type === '+') return body;
    if (type === ':') return Number(body);
    if (type === '-') {
      const error = new Error(body);
      error.redis = true;
      throw error;
    }
    if (type === '$') {
      const length = Number(body);
      if (length < 0) return null;
      if (buffer.length < length + 2) throw NEED_MORE;
      const data = buffer.slice(0, length).toString();
      buffer = buffer.slice(length + 2);
      return data;
    }
    if (type === '*') {
      const count = Number(body);
      if (count < 0) return null;
      const items = [];
      for (let index = 0; index < count; index += 1) items.push(readReply());
      return items;
    }
    throw new Error(`Unexpected Redis reply: ${line}`);
  };
  return {
    push(chunk) { buffer = Buffer.concat([buffer, chunk]); },
    read() {
      try {
        return readReply();
      } catch (error) {
        if (error === NEED_MORE) return undefined;
        throw error;
      }
    },
  };
};

const redisRequest = async (command) => new Promise((resolve, reject) => {
  const socket = net.createConnection({ port: REDIS_PORT, host: '127.0.0.1' });
  const parser = createReplyParser();
  let settled = false;
  const finish = (error, reply) => {
    if (settled) return;
    settled = true;
    socket.destroy();
    if (error) reject(error); else resolve(reply);
  };
  socket.on('error', (error) => finish(error));
  socket.on('data', (chunk) => {
    parser.push(chunk);
    try {
      const reply = parser.read();
      if (reply !== undefined) finish(null, reply);
    } catch (error) {
      finish(error);
    }
  });
  socket.on('close', () => finish(new Error('Redis closed the connection mid-reply.')));
  socket.write(encodeCommand(command));
});

// --- Local Redis lifecycle ----------------------------------------------

const portHasListener = (port) => new Promise((resolve) => {
  const socket = net.createConnection({ port, host: '127.0.0.1' });
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
});

const spawnRedis = async () => {
  if (await portHasListener(REDIS_PORT)) {
    console.log(`[dev-backend] Redis already listening on ${REDIS_PORT}.`);
    return;
  }
  const child = spawn('redis-server', [
    '--port', String(REDIS_PORT),
    '--save', '',
    '--appendonly', 'no',
    '--bind', '127.0.0.1',
  ], { stdio: 'ignore' });
  child.on('exit', () => console.log('[dev-backend] Redis exited.'));
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await portHasListener(REDIS_PORT)) {
      console.log(`[dev-backend] Redis started on ${REDIS_PORT} (in-memory, preview only).`);
      return;
    }
    await new Promise((resolve) => { setTimeout(resolve, 100); });
  }
  throw new Error('Local Redis did not start.');
};

// --- The REST surface ----------------------------------------------------

const server = createServer(async (request, response) => {
  try {
    if (request.headers.authorization !== `Bearer ${TOKEN}`) {
      response.writeHead(401, { 'content-type': 'application/json' });
      return response.end(JSON.stringify({ error: 'Invalid token.' }));
    }
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const command = JSON.parse(raw);
    if (!Array.isArray(command) || !command.length) {
      response.writeHead(400, { 'content-type': 'application/json' });
      return response.end(JSON.stringify({ error: 'Expected a command array.' }));
    }
    // A pipeline arrives as an array of command arrays and is answered with
    // one { result } envelope per command, matching the Upstash contract.
    if (command.some((entry) => Array.isArray(entry))) {
      const replies = [];
      for (const entry of command) {
        try {
          replies.push({ result: await redisRequest(entry) });
        } catch (error) {
          replies.push({ error: error.message });
        }
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      return response.end(JSON.stringify(replies));
    }
    const result = await redisRequest(command);
    response.writeHead(200, { 'content-type': 'application/json' });
    return response.end(JSON.stringify({ result }));
  } catch (error) {
    response.writeHead(400, { 'content-type': 'application/json' });
    return response.end(JSON.stringify({ error: error.message || 'Redis command failed.' }));
  }
});

await spawnRedis();
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[dev-backend] Upstash-compatible bridge on http://127.0.0.1:${PORT} (preview only).`);
});

/**
 * The preview dev stack: the local Upstash-compatible backend plus
 * `next dev`, one supervisor so the platform can start and stop them as a
 * unit. Everything here is development-only — production deploys run
 * `next start` against a real Upstash database and never touch this file.
 */

import { spawn } from 'node:child_process';

const ENV = {
  ...process.env,
  AUTH_SECRET: process.env.AUTH_SECRET || 'dev-preview-secret',
  AUTH_DEV_LOGIN: 'true',
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || 'http://127.0.0.1:23001',
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || 'dev-local-preview',
};

const shim = spawn('node', ['scripts/dev-backend.mjs'], { env: ENV, stdio: 'inherit' });
shim.on('exit', (code) => {
  if (code !== 0) console.error(`[dev-preview] backend shim exited with ${code}.`);
});

// Give the bridge a moment to bind before Next starts answering requests.
await new Promise((resolve) => { setTimeout(resolve, 1200); });

const next = spawn('npm', ['run', 'dev'], { env: ENV, stdio: 'inherit' });

const stop = (code = 0) => {
  shim.kill('SIGTERM');
  next.kill('SIGTERM');
  process.exit(code);
};
process.on('SIGTERM', () => stop());
process.on('SIGINT', () => stop());
next.on('exit', (code) => {
  shim.kill('SIGTERM');
  process.exit(code ?? 0);
});

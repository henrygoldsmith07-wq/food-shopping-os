import { spawn } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';

/**
 * Run a command to completion, streaming its output to a file.
 *
 * Vitest's startup is slower than the shell this runs under, so a bare
 * invocation can be cut off before the first test reports. This keeps the
 * process alive for as long as the command needs, whatever that is, and
 * appends as it goes so a long run's progress survives even if the runner is
 * stopped part way through.
 *
 *   node scripts/run.mjs <file-to-write> <command> [args...]
 */
const [outFile, command, ...args] = process.argv.slice(2);

if (outFile) writeFileSync(outFile, '');

const child = spawn(command, args, {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, FORCE_COLOR: '0', CI: '1' },
  // Windows: .cmd shims (tsc, eslint, vitest) only resolve through a shell.
  shell: process.platform === 'win32',
});

let tail = '';
const note = (chunk) => {
  if (outFile) appendFileSync(outFile, chunk);
  // Only the last few KB is echoed, so a long run doesn't drown the console.
  tail = (tail + chunk).slice(-6000);
};

child.stdout.on('data', note);
child.stderr.on('data', note);

child.on('close', (code) => {
  process.stdout.write(tail);
  process.exit(code ?? 0);
});

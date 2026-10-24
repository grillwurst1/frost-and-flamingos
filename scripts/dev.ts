#!/usr/bin/env bun
/**
 * Starts the authoritative Bun server and the Vite client together and tears
 * both down on Ctrl+C. This is the only command a player needs.
 */
const root = `${import.meta.dir}/..`;
const bun = process.execPath;

console.log('');
console.log('  Frost & Flamingos — dev stack');
console.log('  client   http://localhost:5173');
console.log('  server   http://127.0.0.1:3000/api/health');
console.log('  stop     Ctrl+C');
console.log('');

const server = Bun.spawn({
  cmd: [bun, 'run', 'dev'],
  cwd: `${root}/apps/server`,
  stdout: 'inherit',
  stderr: 'inherit',
  env: { ...process.env, FORCE_COLOR: '1' },
});

const client = Bun.spawn({
  cmd: [bun, 'run', 'dev'],
  cwd: `${root}/apps/client`,
  stdout: 'inherit',
  stderr: 'inherit',
  env: { ...process.env, FORCE_COLOR: '1' },
});

let shuttingDown = false;

function releasePorts(): void {
  Bun.spawnSync({
    cmd: ['sh', '-c', 'lsof -ti:5173,3000,4173 2>/dev/null | xargs kill -9 2>/dev/null || true'],
    stdout: 'ignore',
    stderr: 'ignore',
  });
}

function shutdown(code: number): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n  Closing the resort...\n');
  server.kill();
  client.kill();
  releasePorts();
  setTimeout(() => process.exit(code), 80);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const firstExit = await Promise.race([
  server.exited.then((code) => ({ service: 'server' as const, code })),
  client.exited.then((code) => ({ service: 'client' as const, code })),
]);

if (!shuttingDown) {
  console.error(`  ${firstExit.service} stopped unexpectedly (exit ${firstExit.code}).`);
  shutdown(firstExit.code === 0 ? 1 : firstExit.code);
}

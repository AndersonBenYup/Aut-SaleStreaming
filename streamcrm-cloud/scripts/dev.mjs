// Levanta la API (:3000) y el panel (:5173) a la vez. Ctrl+C detiene ambos.
import { spawn } from 'node:child_process';

const procs = [
  ['api', ['run', 'dev', '-w', '@streamcrm/api']],
  ['web', ['run', 'dev', '-w', '@streamcrm/web']],
].map(([name, args]) => {
  const p = spawn('npm', args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  const prefix = name === 'api' ? '\x1b[36m[api]\x1b[0m ' : '\x1b[35m[web]\x1b[0m ';
  const out = (stream) => (chunk) =>
    chunk
      .toString()
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.startsWith('npm notice'))
      .forEach((l) => stream.write(prefix + l + '\n'));
  p.stdout.on('data', out(process.stdout));
  p.stderr.on('data', out(process.stderr));
  p.on('exit', (code) => {
    console.log(`${prefix}terminó (${code})`);
    stop();
  });
  return p;
});

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const p of procs) {
    if (p.exitCode !== null) continue;
    // En Windows hay que matar el árbol (npm → node → tsx/vite).
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
    else p.kill('SIGINT');
  }
  setTimeout(() => process.exit(0), 1500);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

console.log('\n  Panel: http://localhost:5173   (API en http://localhost:3000)\n');

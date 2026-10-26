import { createServer, connect } from 'node:net';
import { spawn } from 'node:child_process';

// The seed guard deliberately accepts only loopback database connections. This
// private, container-only proxy reaches the existing Compose PostgreSQL service.
const proxy = createServer((socket) => {
  const upstream = connect(5432, 'postgres');
  socket.on('error', () => upstream.destroy());
  upstream.on('error', () => socket.destroy());
  socket.pipe(upstream).pipe(socket);
});
await new Promise((resolve, reject) => {
  proxy.once('error', reject);
  proxy.listen(5432, '127.0.0.1', resolve);
});
const child = spawn('pnpm', ['test:redesign'], {
  stdio: 'inherit',
  env: process.env,
});
child.once('error', (error) => {
  console.error(error.message);
  proxy.close();
  process.exitCode = 1;
});
child.once('exit', (code) => {
  proxy.close();
  process.exitCode = code ?? 1;
});

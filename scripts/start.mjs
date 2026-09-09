import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = join(root, 'node_modules', 'vinext', 'dist', 'cli.js');
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error('Node.js 22.13+ is required. Node.js 24 LTS is recommended.');
  process.exit(1);
}
if (!existsSync(cli)) {
  console.error(
    'Dependencies are missing. Run "pnpm install --frozen-lockfile" in the project root first.',
  );
  process.exit(1);
}
console.log(
  'Starting Evening Bell. Open the Local URL below and keep this window open.',
);
const child = spawn(process.execPath, [cli, 'dev'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 0;
});
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));

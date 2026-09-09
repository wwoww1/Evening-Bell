import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const cli = resolve(root, 'node_modules/@anna-ai/cli/dist/cli.js');
const args = process.argv.slice(2);
const result = spawnSync(process.execPath, [cli, ...args], {
  cwd: resolve(root, 'anna'),
  stdio: 'inherit',
  env: { ...process.env },
});
if (result.error) console.error(result.error.message);
process.exit(result.status || (result.error ? 1 : 0));

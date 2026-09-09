import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const build = spawnSync(
  process.execPath,
  [
    resolve(root, 'node_modules/vite/bin/vite.js'),
    'build',
    '--config',
    'anna/vite.config.ts',
  ],
  { cwd: root, stdio: 'inherit' },
);
if (build.status !== 0) process.exit(build.status || 1);
const bundle = resolve(root, 'anna/bundle');
copyFileSync(resolve(root, 'public/icon.svg'), resolve(bundle, 'icon.svg'));
copyFileSync(
  resolve(root, 'anna/privacy.html'),
  resolve(bundle, 'privacy.html'),
);
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = resolve(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(path);
  }
}
walk(bundle);
if (!existsSync(resolve(bundle, 'index.html')))
  throw new Error('Missing ANNA entry HTML.');
if (
  files.length > 2000 ||
  files.reduce((n, p) => n + statSync(p).size, 0) > 50 * 1024 * 1024 ||
  files.some((p) => statSync(p).size > 10 * 1024 * 1024)
)
  throw new Error('ANNA bundle size limit exceeded.');
const html = readFileSync(resolve(bundle, 'index.html'), 'utf8');
if (/<script(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(html))
  throw new Error('Inline script violates ANNA CSP.');
if (files.some((p) => /\.(map|env|pem|key)$/.test(p)))
  throw new Error('Unexpected private/build file in ANNA bundle.');
console.log(
  `ANNA bundle ready: ${files.length} files, ${Math.ceil(files.reduce((n, p) => n + statSync(p).size, 0) / 1024)} KiB.`,
);

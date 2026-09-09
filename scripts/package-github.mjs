import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  lstatSync,
  rmSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const releases = join(root, 'releases');
const output = join(releases, 'evening-bell-github');
const zipPath = join(releases, 'evening-bell-github.zip');
const rootFiles = [
  'README.md',
  'README.zh-CN.md',
  'GITHUB.md',
  'ANNA.md',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
  'vite.config.ts',
  'next.config.ts',
  'components.json',
  '.gitignore',
  '.gitattributes',
  '.editorconfig',
  '.npmrc',
  '.oxfmtrc.json',
  '.oxlintrc.json',
  '.env.example',
  '.dev.vars.example',
  '.openai/hosting.json',
  'start.cmd',
  '启动.cmd',
];
const directories = [
  'anna',
  'app',
  'components',
  'hooks',
  'lib',
  'public',
  'scripts',
  'tests',
  'docs',
];
const forbidden =
  /(?:^|\/)(?:node_modules|\.git|\.anna|bundle|\.pnpm-store|\.wrangler|\.next|\.vinext|dist|releases|outputs|work|coverage)(?:\/|$)|(?:^|\/)\.env(?!\.example$)|(?:^|\/)\.dev\.vars(?!\.example$)|\.(?:pem|key|log|tsbuildinfo|zip)$/i;
const allowedExtension =
  /\.(?:ts|tsx|js|mjs|css|html|json|yaml|yml|md|txt|svg|webmanifest|png|jpg|jpeg|webp|ico|woff|woff2|cmd)$/i;
function walk(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((item) => {
      const name = (directory + '/' + item.name).replaceAll('\\', '/');
      if (item.isSymbolicLink() || forbidden.test(name)) return [];
      if (item.isDirectory()) return walk(name);
      return allowedExtension.test(name) ? [name] : [];
    });
}
const names = [...rootFiles, ...directories.flatMap(walk)].sort();
const seen = new Set();
const entries = names.map((name) => {
  if (seen.has(name)) throw new Error('Duplicate package path: ' + name);
  seen.add(name);
  const file = resolve(root, name);
  if (
    !file.startsWith(root + sep) ||
    !existsSync(file) ||
    lstatSync(file).isSymbolicLink()
  )
    throw new Error('Missing or unsafe package path: ' + name);
  const data = readFileSync(file);
  if (/\.(?:ts|tsx|js|mjs|json|md|txt|yaml|yml|example)$/.test(name)) {
    const content = data.toString('utf8');
    if (content.includes('\0'))
      throw new Error('Unexpected binary content in text file: ' + name);
    if (
      /\b(?:sk-[a-zA-Z0-9_-]{24,}|ghp_[a-zA-Z0-9]{30,}|github_pat_[a-zA-Z0-9_]{40,})\b/.test(
        content,
      )
    )
      throw new Error(
        'Possible credential in ' + name + '. Remove it before packaging.',
      );
  }
  return {
    name,
    data,
    sha256: createHash('sha256').update(data).digest('hex'),
  };
});

// Only this script's generated snapshot may be replaced. Resolve and verify
// the exact path before a recursive removal; reject symlinks.
if (
  dirname(resolve(output)) !== resolve(releases) ||
  relative(releases, output) !== 'evening-bell-github'
)
  throw new Error('Invalid output directory');
if (existsSync(releases) && lstatSync(releases).isSymbolicLink())
  throw new Error('Release directory cannot be a symlink');
if (existsSync(output)) {
  if (lstatSync(output).isSymbolicLink())
    throw new Error('Output directory cannot be a symlink');
  rmSync(output, { recursive: true });
}
mkdirSync(output, { recursive: true });
for (const entry of entries) {
  const destination = join(output, entry.name);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(root, entry.name), destination);
}

// ZIP creation uses only Node's standard library and preserves dotfiles on
// Windows. File names are UTF-8, and all content is compressed with deflate.
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(data) {
  let crc = 0xffffffff;
  for (const value of data) crc = crcTable[(crc ^ value) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
const localParts = [],
  centralParts = [];
let offset = 0;
for (const entry of entries) {
  const name = Buffer.from('evening-bell-github/' + entry.name, 'utf8');
  const compressed = deflateRawSync(entry.data);
  const crc = crc32(entry.data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(0x21, 12); // 1980-01-01; reproducible archive timestamps.
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(entry.data.length, 22);
  header.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(0x21, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(entry.data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  localParts.push(header, name, compressed);
  centralParts.push(central, name);
  offset += header.length + name.length + compressed.length;
}
const centralDirectory = Buffer.concat(centralParts);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(centralDirectory.length, 12);
end.writeUInt32LE(offset, 16);
writeFileSync(zipPath, Buffer.concat([...localParts, centralDirectory, end]));
writeFileSync(
  join(releases, 'evening-bell-github-manifest.json'),
  JSON.stringify(
    {
      files: entries.map(({ name, data, sha256 }) => ({
        path: name,
        bytes: data.length,
        sha256,
      })),
      archive: {
        path: 'evening-bell-github.zip',
        sha256: createHash('sha256')
          .update(readFileSync(zipPath))
          .digest('hex'),
      },
    },
    null,
    2,
  ) + '\n',
);
console.log('Prepared ' + entries.length + ' source files.');
console.log('Folder: ' + output);
console.log('ZIP: ' + zipPath);

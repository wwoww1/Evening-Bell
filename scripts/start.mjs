import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const cli=join(root,'node_modules','vinext','dist','cli.js');
if(Number(process.versions.node.split('.')[0])<22){console.error('Node.js 22.13+ is required.');process.exit(1);}
if(!existsSync(cli)){console.error('Dependencies are not installed. Run "pnpm install" in the Code folder first.');process.exit(1);}
console.log('Starting Evening Bell (晚钟). Open the Local URL shown below. Keep this window open.');
const child=spawn(process.execPath,[cli,'dev'],{cwd:root,stdio:'inherit',env:process.env});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??0;});
process.on('SIGINT',()=>child.kill('SIGINT'));
process.on('SIGTERM',()=>child.kill('SIGTERM'));

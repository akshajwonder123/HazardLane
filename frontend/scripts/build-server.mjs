import { build } from 'esbuild';
import { mkdir, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const frontend=fileURLToPath(new URL('..',import.meta.url));
const root=resolve(frontend,'..');
export async function buildServer(copyAssets=false){
  await mkdir(resolve(root,'dist/server'),{recursive:true});
  await mkdir(resolve(root,'dist/node'),{recursive:true});
  await build({entryPoints:[resolve(frontend,'server/runtime-worker.ts')],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:resolve(root,'dist/server/index.js'),minify:true});
  await build({entryPoints:[resolve(frontend,'server/runtime-node.ts')],bundle:true,format:'esm',platform:'node',target:'node22',outfile:resolve(root,'dist/node/server.mjs')});
  if(copyAssets){
    await cp(resolve(frontend,'out'),resolve(root,'dist/client'),{recursive:true});
    await mkdir(resolve(root,'dist/.openai'),{recursive:true});
    await cp(resolve(root,'.openai/hosting.json'),resolve(root,'dist/.openai/hosting.json'));
  }
}
if(process.argv.includes('--production'))await buildServer(true);

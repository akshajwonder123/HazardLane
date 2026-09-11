import { build } from 'esbuild';
import { mkdir, cp, lstat, realpath, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, isAbsolute, sep } from 'node:path';
const frontend=fileURLToPath(new URL('..',import.meta.url));
const root=resolve(frontend,'..');
async function freshClientAssets(){
  const output=resolve(root,'dist'),client=resolve(output,'client');
  const realRoot=await realpath(root);
  // Refuse links/junctions and verify resolved paths before removing generated
  // output. A redirected dist directory must never erase another directory.
  for(const target of [output,client]){
    let info;
    try{info=await lstat(target);}catch(error){if(error.code==='ENOENT')continue;throw error;}
    if(info.isSymbolicLink())throw new Error(`Generated output must not be a link: ${target}`);
    const inside=relative(realRoot,await realpath(target));
    if(!inside||isAbsolute(inside)||inside==='..'||inside.startsWith(`..${sep}`))throw new Error('Generated output is outside the repository.');
  }
  await rm(client,{recursive:true,force:true});
  await cp(resolve(frontend,'out'),client,{recursive:true});
}
export async function buildServer(copyAssets=false){
  await mkdir(resolve(root,'dist/server'),{recursive:true});
  await mkdir(resolve(root,'dist/node'),{recursive:true});
  await build({entryPoints:[resolve(frontend,'server/runtime-worker.ts')],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:resolve(root,'dist/server/index.js'),minify:true});
  await build({entryPoints:[resolve(frontend,'server/runtime-node.ts')],bundle:true,format:'esm',platform:'node',target:'node22',outfile:resolve(root,'dist/node/server.mjs')});
  if(copyAssets){
    await freshClientAssets();
    await mkdir(resolve(root,'dist/.openai'),{recursive:true});
    await cp(resolve(root,'.openai/hosting.json'),resolve(root,'dist/.openai/hosting.json'));
  }
}
if(process.argv.includes('--production'))await buildServer(true);

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { buildServer } from './build-server.mjs';
const cwd=fileURLToPath(new URL('..',import.meta.url));
await buildServer();
const processes=[
  spawn(process.execPath,[resolve(cwd,'../dist/node/server.mjs')],{cwd,env:{...process.env,STORMROUTE_DEV:'1',PORT:'8788'},stdio:'inherit',windowsHide:true}),
  spawn(process.execPath,[resolve(cwd,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1'],{cwd,stdio:'inherit',windowsHide:true}),
];
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of processes)child.kill();setTimeout(()=>process.exit(code),250);}
processes.forEach(child=>{child.on('error',error=>{console.error(error.message);stop(1);});child.on('exit',code=>stop(code??0));});
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());

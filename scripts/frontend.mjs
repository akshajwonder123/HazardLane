import { spawn } from 'node:child_process';
const npm=process.env.npm_execpath;
if(!npm)throw new Error('Run this helper through npm run setup, dev, test, or build.');
const child=spawn(process.execPath,[npm,'--prefix','frontend',...process.argv.slice(2)],{stdio:'inherit',windowsHide:true});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>process.exit(code??1));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));

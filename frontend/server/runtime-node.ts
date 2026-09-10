import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { createServices, ProviderSettings } from './service';

const dev=process.env.STORMROUTE_DEV==='1';
const settings:ProviderSettings=Object.fromEntries(Object.entries({geocoder:process.env.GEOCODER_URL,router:process.env.ROUTER_URL,weather:process.env.WEATHER_URL,alerts:process.env.NWS_URL,alertGis:process.env.NWS_GIS_URL,roads:process.env.OVERPASS_URL,events:process.env.WZDX_URL}).filter(([,value])=>value));
const {handle}=createServices(settings,dev?['http://localhost:3000','http://127.0.0.1:3000']:[]);
const port=Number(process.env.PORT||(dev?8788:3000));
const staticRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../client');
const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
const server=createServer(async(req,res)=>{
  try{
    const host=req.headers.host??`localhost:${port}`;
    if(!/^[a-zA-Z0-9.:[\]-]+$/.test(host)){res.writeHead(400).end();return;}
    const address=new URL(req.url??'/',`http://${host}`);
    if(address.pathname.startsWith('/api/')){
      const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
      // Stream the body so the API's 4KB cap applies before buffering arbitrary input.
      const init:RequestInit & {duplex?:string}={method:req.method,headers};
      if(req.method!=='GET'&&req.method!=='HEAD'){init.body=Readable.toWeb(req) as ReadableStream<Uint8Array>;init.duplex='half';}
      const response=await handle(new Request(address,init),req.socket.remoteAddress??'unknown');
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if(dev){res.writeHead(404).end();return;}
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
    let path:string;
    try{path=decodeURIComponent(address.pathname);}catch{res.writeHead(400).end();return;}
    if(path.includes('\0')||path.includes('\\')){res.writeHead(400).end();return;}
    let filename=resolve(staticRoot,`.${path}`);
    const inside=(p:string)=>{const r=relative(staticRoot,p);return r!== '..'&&!r.startsWith(`..${sep}`)&&!r.startsWith(sep);};
    if(!inside(filename)){res.writeHead(403).end();return;}
    let found=false;
    for(const candidate of [filename,resolve(filename,'index.html'),`${filename}.html`]){
      try{const actual=await realpath(candidate);if(inside(actual)&&(await stat(actual)).isFile()){filename=actual;found=true;break;}}catch{/* Try the next static export path. */}
    }
    if(!found){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('Page not found.');return;}
    const content=await readFile(filename);
    res.writeHead(200,{'Content-Type':types[extname(filename)]??'application/octet-stream','Content-Length':content.length,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':path.startsWith('/_next/static/')?'public, max-age=31536000, immutable':'public, max-age=300'});
    res.end(req.method==='HEAD'?undefined:content);
  }catch{if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end('{"error":"The request could not be completed."}');}
});
server.requestTimeout=70000;server.headersTimeout=10000;server.maxHeadersCount=60;
server.listen(port,process.env.HOST??'127.0.0.1',()=>console.log(`StormRoute ${dev?'API':'website'}: http://localhost:${port}`));
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>server.close(()=>process.exit(0)));

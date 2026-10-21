import type { Location, RouteAnalysis } from '../lib/domain';
import { haversine } from '../lib/geometry';
import { GeocodingProvider, ProviderError } from './contracts';
import { record, safeText } from './validation';

export interface Analyzer { analyze(origin: Location, destination: Location): Promise<RouteAnalysis> }
interface ApiOptions { geocoder: GeocodingProvider; analyzer: Analyzer; allowedOrigins?: string[]; now?: () => number }
interface Window { start: number; count: number }

function location(value: unknown): Location | null {
  const item=record(value);if(!item) return null;
  if(typeof item.lat!=='number'||typeof item.lon!=='number'||!Number.isFinite(item.lat)||!Number.isFinite(item.lon)||Math.abs(item.lat)>85||Math.abs(item.lon)>180) return null;
  const label=safeText(item.label,300).trim();if(!label || typeof item.label!=='string' || item.label.length>300) return null;
  return {id:safeText(item.id,160)||`${item.lon},${item.lat}`,label,lat:item.lat,lon:item.lon,
    ...(typeof item.countryCode==='string'&&/^[A-Z]{2}$/.test(item.countryCode)?{countryCode:item.countryCode}:{})};
}
async function boundedBody(request: Request): Promise<unknown> {
  if(!request.body) throw new Error('Missing JSON');
  const reader=request.body.getReader(),decoder=new TextDecoder();let bytes=0,body='';
  while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>4096){await reader.cancel();throw new Error('Body too large');}body+=decoder.decode(part.value,{stream:true});}
  body+=decoder.decode();return JSON.parse(body);
}
/** Runtime adapters supply a trusted client ID; the handler never trusts forwarded IP headers. */
export function createApi(options: ApiOptions) {
  const now=options.now??Date.now, clients=new Map<string,Window>(), globals=new Map<string,Window>();
  let analyses=0;
  function quota(map:Map<string,Window>,key:string,limit:number,period:number):number {
    const current=now();let window=map.get(key);
    if(!window||current-window.start>=period){window={start:current,count:0};map.set(key,window);}
    if(window.count>=limit)return Math.max(1,Math.ceil((window.start+period-current)/1000));
    window.count++;return 0;
  }
  return async function handle(request:Request, clientId='unknown'):Promise<Response> {
    const url=new URL(request.url),origin=request.headers.get('origin');
    const allowed=!origin||origin===url.origin||(options.allowedOrigins??[]).includes(origin);
    const headers:Record<string,string>={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
    if(origin&&allowed){headers['Access-Control-Allow-Origin']=origin;headers.Vary='Origin';}
    const json=(value:unknown,status=200,extra:Record<string,string>={})=>Response.json(value,{status,headers:{...headers,...extra}});
    if(!allowed)return json({error:'This origin is not allowed.'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'}});
    if(url.pathname==='/api/health'&&request.method==='GET')return json({status:'ok'});
    if(!['/api/search','/api/analyze'].includes(url.pathname))return json({error:'Not found.'},404);
    if((url.pathname==='/api/search'&&request.method!=='GET')||(url.pathname==='/api/analyze'&&request.method!=='POST'))return json({error:'Method not allowed.'},405);
    const analyzing=url.pathname==='/api/analyze';
    // Retain only a bounded, transient per-client window. A separate global budget cannot be evicted by new client IDs.
    for(const [key,window] of clients)if(now()-window.start>=60000)clients.delete(key);
    if(clients.size>=2048&&!clients.has(`${clientId}:${analyzing}`))return json({error:'HazardLane is busy. Please try again shortly.'},429,{'Retry-After':'60'});
    const retry=quota(clients,`${clientId}:${analyzing}`,analyzing?4:40,60000)||quota(globals,analyzing?'analysis-minute':'search-minute',analyzing?2:120,60000);
    if(retry)return json({error:'Too many requests. Please wait before trying again.'},429,{'Retry-After':String(retry)});
    try {
      if(!analyzing){
        const query=url.searchParams.get('q')?.trim()??'';
        if(query.length<3||query.length>160||/[\u0000-\u001f]/.test(query))return json({error:'Enter a location using 3–160 characters.'},400);
        return json({locations:await options.geocoder.search(query)});
      }
      if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return json({error:'Send route locations as JSON.'},415);
      let body:Record<string,unknown>|null;
      try{body=record(await boundedBody(request));}catch{return json({error:'The route request is invalid or too large.'},400);}
      const from=location(body?.origin),to=location(body?.destination);
      if(!from||!to)return json({error:'Choose a valid origin and destination from the location suggestions.'},400);
      const distance=haversine([from.lon,from.lat],[to.lon,to.lat]);
      if(distance<0.1)return json({error:'Choose locations at least 100 metres apart.'},400);
      if(distance>6000)return json({error:'This preview supports journeys with endpoints up to 6,000 km apart. Split this trip into shorter journeys.'},400);
      const budget=quota(globals,'analysis-hour',20,3600000)||quota(globals,'analysis-day',40,86400000);
      if(budget)return json({error:'The preview has reached its free-provider analysis budget. Please try again after the limit resets.'},429,{'Retry-After':String(budget)});
      if(analyses>=2)return json({error:'Other routes are being checked. Please try again shortly.'},429,{'Retry-After':'15'});
      analyses++;
      try{return json(await options.analyzer.analyze(from,to));}finally{analyses--;}
    }catch(error){
      if(error instanceof ProviderError)return json({error:error.message},error.code==='no-route'?422:error.code==='rate-limited'?429:503,error.code==='rate-limited'&&error.retryAt?{'Retry-After':String(Math.max(1,Math.ceil((error.retryAt-now())/1000)))}:{});
      return json({error:'Route data could not be loaded. Please try again.'},503);
    }
  };
}

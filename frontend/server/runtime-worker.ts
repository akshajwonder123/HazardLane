import { createServices } from './service';
import {createD1WeatherBudget,type D1Database,type WeatherBudget} from './weather-budget';
import {ProviderError} from './contracts';
interface Environment { ASSETS: { fetch(request:Request):Promise<Response> }; DB?:D1Database; WEATHER_NOT_BEFORE?:string }

export function hostedWeatherBudget(db:D1Database|undefined,hold:string|undefined,now=Date.now):WeatherBudget {
  const budget=db?createD1WeatherBudget(db,now):undefined;
  const until=hold?Date.parse(hold):0;
  let initialized:Promise<void>|undefined;
  const ready=async()=>{
    if(!budget||!Number.isFinite(until))throw new ProviderError('unavailable','The shared weather budget is unavailable.');
    if(until>now()){
      // Preserve an already observed cooldown through migration/deployment without probing upstream.
      initialized??=budget.block(until).catch(error=>{initialized=undefined;throw error;});
      await initialized;
    }
    return budget;
  };
  return {reserve:async units=>(await ready()).reserve(units),block:async deadline=>(await ready()).block(deadline)};
}
let service:ReturnType<typeof createServices>|undefined,cachedDb:D1Database|undefined,cachedHold:string|undefined;
export default {async fetch(request:Request,env:Environment):Promise<Response>{
  if(new URL(request.url).pathname.startsWith('/api/')){
    if(!service||cachedDb!==env.DB||cachedHold!==env.WEATHER_NOT_BEFORE){
      cachedDb=env.DB;cachedHold=env.WEATHER_NOT_BEFORE;
      service=createServices({},[],hostedWeatherBudget(env.DB,env.WEATHER_NOT_BEFORE));
    }
    // Cloudflare supplies this header at its ingress; Node uses the socket address.
    return service.handle(request,request.headers.get('CF-Connecting-IP')??'unknown');
  }
  return env.ASSETS.fetch(request);
}};

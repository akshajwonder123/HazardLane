import type { AssessedRoute, Coordinate, DrivingRoute, Location, RiskSegment, RoadEvent, RouteAnalysis, Sample } from '../lib/domain';
import { areaIntervals, routeDistances, sampleRoute, sliceGeometry } from '../lib/geometry';
import { aggregateRisk, recommendRoute, scoreConditions } from '../lib/risk-engine';
import type { Analyzer } from './api';
import type { AlertProvider, ProviderResult, RoadEventProvider, RoadProvider, RoutingProvider, WeatherProvider } from './contracts';
import { ProviderError } from './contracts';

export interface AnalysisProviders { router:RoutingProvider; weather:WeatherProvider; alerts:AlertProvider; roads:RoadProvider; events:RoadEventProvider }
const missing=<T>(value:T,name:string):ProviderResult<T>=>({value,status:{state:'unavailable',detail:`${name} could not be checked; coverage is unknown.`}});
async function optional<T>(task:()=>Promise<ProviderResult<T>>,fallback:T,name:string):Promise<ProviderResult<T>> {try{return await task();}catch{return missing(fallback,name);}}
interface Interval<T> {startKm:number;endKm:number;value:T}
/** Retain provider-validated road/direction matches and clip each report to its matched edge. */
function eventIntervals(route:DrivingRoute,distances:number[],events:RoadEvent[]):Interval<RoadEvent>[] {
  const result:Interval<RoadEvent>[]=[];
  for(const event of events){
    if(event.routeMatch?.routeId!==route.id)continue;
    for(const {edgeIndex,fraction} of event.routeMatch.points){
      if(!Number.isInteger(edgeIndex)||edgeIndex<0||edgeIndex>=distances.length-1||!Number.isFinite(fraction)||fraction<0||fraction>1)continue;
      const start=distances[edgeIndex],end=distances[edgeIndex+1],position=start+fraction*(end-start);
      result.push({startKm:Math.max(start,position-.035),endKm:Math.min(end,position+.035),value:event});
    }
  }
  return result;
}
function majorHazards(segments:RiskSegment[]):AssessedRoute['hazards'] {
  const result:AssessedRoute['hazards']=[];
  for(const s of segments)for(const h of s.hazards.filter(h=>h.score>=12||h.critical)){
    const previous=result.findLast(item=>item.kind===h.kind&&item.title===h.title&&Math.abs(item.endKm-s.startKm)<1e-6);
    if(previous){previous.endKm=s.endKm;previous.score=Math.max(previous.score,h.score);}
    else result.push({...h,startKm:s.startKm,endKm:s.endKm,roadName:s.roadName});
  }
  return result.sort((a,b)=>Number(b.critical)-Number(a.critical)||b.score-a.score||a.startKm-b.startKm).slice(0,16);
}
export function createAnalyzer(providers:AnalysisProviders,now:()=>number=Date.now):Analyzer {
  return {async analyze(origin:Location,destination:Location):Promise<RouteAnalysis>{
    const departureTime=new Date(now()).toISOString();
    const routes=(await providers.router.routes(origin,destination)).slice(0,3);
    if(!routes.length)throw new ProviderError('no-route','No driving route was found.');
    if(routes.some(r=>r.distanceKm<=0||r.durationSeconds<=0||r.coordinates.length<2||r.coordinates.length>20000))throw new ProviderError('invalid-response','The route geometry could not be analyzed.');
    const samples=routes.map(r=>sampleRoute(r,departureTime,64));
    if(samples.some(s=>s.length<2))throw new ProviderError('invalid-response','The route could not be sampled.');
    const allSamples=samples.flat();
    const weatherPromise=optional(()=>providers.weather.forecast(allSamples),allSamples.map(()=>null),'Forecast weather');
    const ancillary=routes.map((r,i)=>Promise.all([
      optional(()=>providers.alerts.alerts(r),[],'Official alerts'),
      optional(()=>providers.roads.attributes(r,samples[i]),samples[i].map(()=>null),'Road metadata'),
      optional(()=>providers.events.events(r),[],'Road events'),
    ]));
    const [weather,other]=await Promise.all([weatherPromise,Promise.all(ancillary)]);
    let weatherOffset=0;
    const assessed=routes.map((route,index):AssessedRoute=>{
      const points=samples[index],forecasts=weather.value.slice(weatherOffset,weatherOffset+points.length);weatherOffset+=points.length;
      const [alerts,roads,events]=other[index];
      const distances=routeDistances(route.coordinates,route.distanceKm);
      const warnings=alerts.value.flatMap(alert=>areaIntervals(route.coordinates,distances,alert.geometry).map(interval=>({...interval,value:alert})));
      const work=eventIntervals(route,distances,events.value);
      const cuts=new Set<number>([0,route.distanceKm]);
      for(let i=1;i<points.length;i++)cuts.add((points[i-1].distanceKm+points[i].distanceKm)/2);
      for(const interval of [...warnings,...work]){cuts.add(interval.startKm);cuts.add(interval.endKm);}
      points.forEach((p,i)=>{if(roads.value[i]){cuts.add(Math.max(0,p.distanceKm-.02));cuts.add(Math.min(route.distanceKm,p.distanceKm+.02));}});
      const boundaries=[...cuts].filter(Number.isFinite).sort((a,b)=>a-b),segments:RiskSegment[]=[];
      for(let i=1;i<boundaries.length;i++){
        const startKm=boundaries[i-1],endKm=boundaries[i];if(endKm-startKm<1e-8)continue;
        const middle=(startKm+endKm)/2;
        let nearest=0;points.forEach((p,j)=>{if(Math.abs(p.distanceKm-middle)<Math.abs(points[nearest].distanceKm-middle))nearest=j;});
        const arrivalTime=new Date(Date.parse(departureTime)+1000*route.durationSeconds*middle/route.distanceKm).toISOString();
        const arrival=Date.parse(arrivalTime);
        const localAlerts=warnings.filter(w=>middle>=w.startKm&&middle<w.endKm&&(!w.value.onset||Date.parse(w.value.onset)<=arrival)).map(w=>{
          const a=w.value;
          return a.expires&&Date.parse(a.expires)<arrival?{...a,headline:`${a.headline} This current alert expires before estimated arrival; check for updates before travel.`}:a;
        });
        const localEvents=work.filter(e=>middle>=e.startKm&&middle<e.endKm&&Date.parse(e.value.start)<=arrival&&Date.parse(e.value.end)>arrival).map(e=>e.value);
        const attributes=Math.abs(points[nearest].distanceKm-middle)<=.02?roads.value[nearest]??null:null;
        let vertex=0;while(vertex<distances.length-2&&distances[vertex+1]<=middle)vertex++;
        const roadName=route.maneuvers.find(m=>m.startIndex<=vertex&&m.endIndex>vertex)?.name||attributes?.name||'Along the route';
        const conditions=forecasts[nearest]??null;
        segments.push({...scoreConditions(conditions,localAlerts,attributes,localEvents),id:`${route.id}:segment:${segments.length}`,startKm,endKm,coordinates:sliceGeometry(route.coordinates,distances,startKm,endKm),roadName,weather:conditions,roads:attributes,arrivalTime});
      }
      const aggregate=aggregateRisk(segments);
      const complete=forecasts.filter(w=>w&&[w.temperatureC,w.precipitationMm,w.snowfallCm,w.windKmh,w.gustKmh,w.visibilityM,w.code].every(n=>n!==null)).length;
      const weatherStatus={...weather.status,state:complete===points.length?'available' as const:complete>0?'partial' as const:'unavailable' as const,detail:`Complete forecasts at ${complete} of ${points.length} sampled locations; arrival times and conditions are approximate.`};
      return{...route,segments,score:aggregate.score,level:aggregate.level,summary:aggregate.summary,peakScore:aggregate.peakScore,highRiskKm:aggregate.highRiskKm,knownWeatherPercent:aggregate.knownWeatherPercent,sampleCount:points.length,hazards:majorHazards(segments),data:{weather:weatherStatus,alerts:alerts.status,roads:roads.status,events:events.status}};
    });
    return{origin,destination,departureTime,analyzedAt:new Date(now()).toISOString(),routes:assessed,...recommendRoute(assessed),limitations:[
      'This experimental risk index is not a safety guarantee or a crash probability. Follow official guidance and local signs.',
      'Travel times exclude live traffic. Forecasts are sampled at estimated arrival; long trips have wider gaps between samples.',
      'NWS alerts describe the current US outlook. Alerts may change before arrival; other countries do not have official alert coverage here.',
      'Road attributes are sparse static OSM observations. Work-zone reports cover parts of Iowa only, at approximate reported locations; other closures may exist.',
    ]};
  }};
}

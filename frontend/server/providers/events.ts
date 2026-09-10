import type { Coordinate, DrivingRoute, RoadEvent } from '../../lib/domain';
import type { JsonClient, RoadEventProvider } from '../contracts';
import { coordinate, isoTime, record, safeText } from '../validation';

const FEED='https://iowa-atms.cloud-q-free.com/api/rest/dataprism/wzdx/wzdxfeed';
const SOURCE='https://iowadot.gov/travel-tools/iowa-511/511-data-feeds';
const DIRECTIONS:Record<string,Coordinate>={northbound:[0,1],southbound:[0,-1],eastbound:[1,0],westbound:[-1,0]};
/** Match a reported point to actual route geometry; never join WZDx MultiPoint endpoints. */
function nearRoute(point:Coordinate,route:DrivingRoute,direction:string,names:string[]):boolean {
  const normalize=(s:string)=>s.toUpperCase().replace(/INTERSTATE/g,'I').replace(/HIGHWAY|ROUTE|\bHWY\b/g,'').replace(/[^A-Z0-9]/g,'');
  const wanted=names.map(normalize).filter(Boolean);
  const scale=Math.cos(point[1]*Math.PI/180);
  for(let i=1;i<route.coordinates.length;i++){
    const a=route.coordinates[i-1],b=route.coordinates[i];
    const ax=(a[0]-point[0])*111320*scale,ay=(a[1]-point[1])*110574;
    const dx=(b[0]-a[0])*111320*scale,dy=(b[1]-a[1])*110574,length=Math.hypot(dx,dy);
    if(length<.1)continue;
    const t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(length*length)));
    if(Math.hypot(ax+t*dx,ay+t*dy)>35)continue;
    const heading=DIRECTIONS[direction];
    if(heading&&(dx*heading[0]+dy*heading[1])/length<.25)continue;
    // A nearby parallel road or interchange ramp can otherwise receive a false closure.
    const road=route.maneuvers.find(m=>m.startIndex<=i-1&&m.endIndex>=i)?.name;
    const actual=road?normalize(road):'';
    if(!actual||!wanted.some(name=>name===actual || (name.length>=4&&actual.length>=4&&(name.includes(actual)||actual.includes(name)))))continue;
    return true;
  }
  return false;
}
function mightCrossIowa(route:DrivingRoute):boolean {
  if(!route.coordinates.length)return false;
  const xs=route.coordinates.map(c=>c[0]),ys=route.coordinates.map(c=>c[1]);
  return Math.max(...xs)>=-96.65&&Math.min(...xs)<=-90.1&&Math.max(...ys)>=40.35&&Math.min(...ys)<=43.55;
}
export function createRoadEventProvider(client:JsonClient,feedUrl=FEED,now:()=>number=Date.now):RoadEventProvider {
  return {async events(route){
    if(!mightCrossIowa(route))return{value:[],status:{state:'outside-coverage',detail:'Work-zone reports cover Iowa only. Closures elsewhere have not been checked.'}};
    let raw:unknown;
    try{raw=await client.json(feedUrl,{ttlMs:300000,timeoutMs:10000,maxBytes:4*1024*1024});}
    catch{return{value:[],status:{state:'unavailable',detail:'The Iowa work-zone feed could not be reached. Closure status is unknown.'}};}
    const root=record(raw),info=record(root?.road_event_feed_info),updated=isoTime(info?.update_date),current=now();
    if(!root||!Array.isArray(root.features)||root.features.length>5000||!updated||current-Date.parse(updated)>15*60000||Date.parse(updated)-current>5*60000)
      return{value:[],status:{state:'unavailable',detail:'The Iowa work-zone feed is stale or invalid. Closure status is unknown.'}};
    const events:RoadEvent[]=[];
    for(const rawFeature of root.features){
      const feature=record(rawFeature),properties=record(feature?.properties),core=record(properties?.core_details),geometry=record(feature?.geometry);
      if(!feature||!properties||!core||!geometry||core.event_type!=='work-zone')continue;
      const start=isoTime(properties.start_date),end=isoTime(properties.end_date);
      if(!start||!end||Date.parse(start)>current||Date.parse(end)<=current||Date.parse(end)<=Date.parse(start))continue;
      const impact=safeText(properties.vehicle_impact,80);
      if(!['all-lanes-closed','some-lanes-closed','all-lanes-open-reduced-speed','all-lanes-open-shift-left','all-lanes-open-shift-right','some-lanes-closed-merge-left','some-lanes-closed-merge-right'].includes(impact))continue;
      const direction=safeText(core.direction,40);
      if(!DIRECTIONS[direction]&&!['both-directions','undefined','unknown'].includes(direction))continue;
      const names=Array.isArray(core.road_names)?core.road_names.map(n=>safeText(n,160)).filter(Boolean):[];
      const id=safeText(feature.id,180),description=safeText(core.description,700);
      if(!id||!names.length||!['LineString','MultiPoint'].includes(String(geometry.type))||!Array.isArray(geometry.coordinates)||geometry.coordinates.length>2000||!geometry.coordinates.every(coordinate))continue;
      const coords=geometry.coordinates as Coordinate[];
      // Preserve only reported points that can be tied to the named route road.
      // For LineString, retaining matched vertices as points avoids inventing the extent of a partly matched line.
      const matched=coords.filter(p=>nearRoute(p,route,direction,names));
      const unique=[...new Map(matched.map(p=>[p.join(','),p])).values()];
      if(!unique.length)continue;
      const scheduled=/schedule|nightly|weekdays|weekends|intermittent|daily|overnight/i.test(description);
      const closed=impact==='all-lanes-closed'&&!scheduled&&direction!=='unknown'&&direction!=='undefined';
      events.push({id,name:names.join(' / '),description:`${description}${scheduled?' Restrictions may follow a recurring schedule; an active closure is not confirmed.':''} Reported locations are approximate; affected extent may be longer.`,closed,coordinates:unique,geometryType:'MultiPoint',start,end,direction,source:SOURCE});
      if(events.length>=100)break;
    }
    return{value:events,status:{state:'partial',updatedAt:updated,detail:`Iowa construction reports only: ${events.length} spatially matched reports. Point locations and schedules may be approximate. This does not cover all closures, incidents, or roads.`}};
  }};
}

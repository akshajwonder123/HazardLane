import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnalyzer, AnalysisProviders } from '../server/analyzer';
import { createRoadEventProvider } from '../server/providers/events';
import type { DrivingRoute, RoadEvent, Weather, WeatherAlert } from '../lib/domain';
const time='2026-09-10T00:00:00Z',now=()=>Date.parse(time);
const origin={id:'a',label:'A',lat:0,lon:0},destination={id:'b',label:'B',lat:0,lon:10};
const route:DrivingRoute={id:'main',name:'Standard route',coordinates:[[0,0],[10,0]],distanceKm:1000,durationSeconds:36000,provider:'fixture',maneuvers:[{startIndex:0,endIndex:1,name:'Test road'}]};
const weather:Weather={time,temperatureC:20,precipitationMm:0,snowfallCm:0,windKmh:10,gustKmh:15,visibilityM:20000,code:0};
const status={state:'available' as const,detail:'Fixture data'};
const warning:WeatherAlert={id:'tornado',event:'Tornado Warning',headline:'Tornado Warning',severity:'Extreme',onset:time,expires:'2026-09-10T01:00:00Z',url:'https://www.weather.gov/',geometry:{type:'Polygon',coordinates:[[[4,-1],[4.01,-1],[4.01,1],[4,1],[4,-1]]]}};
function providers(overrides:Partial<AnalysisProviders>={}):AnalysisProviders{return{router:{routes:async()=>[route]},weather:{forecast:async samples=>({value:samples.map(s=>({...weather,time:s.arrivalTime})),status})},alerts:{alerts:async()=>({value:[],status})},roads:{attributes:async(_r,s)=>({value:s.map(()=>null),status})},events:{events:async()=>({value:[],status})},...overrides};}
test('splits at exact warning boundaries between forecasts and retains the critical risk floor',async()=>{
  const result=await createAnalyzer(providers({alerts:{alerts:async()=>({value:[warning],status})}}),now).analyze(origin,destination);
  const r=result.routes[0];assert.equal(r.score,100);assert.ok(Math.abs(r.highRiskKm-1)<1e-5);
  assert.ok(r.segments.some(s=>Math.abs(s.startKm-400)<1e-5));assert.ok(r.segments.some(s=>Math.abs(s.endKm-401)<1e-5));
  assert.ok(r.hazards[0].detail.includes('expires before estimated arrival'));
});
test('batches forecasts across alternatives and compares through the same engine',async()=>{
  let requests=0,count=0;
  const alternate={...route,id:'alt',name:'Alternate',coordinates:[[0,2],[10,2]] as [number,number][],durationSeconds:39000};
  const p=providers({router:{routes:async()=>[route,alternate]},weather:{forecast:async samples=>{requests++;count=samples.length;return{value:samples.map(()=>weather),status};}},alerts:{alerts:async()=>({value:[warning],status})}});
  const result=await createAnalyzer(p,now).analyze(origin,destination);assert.equal(requests,1);assert.equal(count,128);assert.equal(result.recommendedId,'alt');assert.equal(result.routes[1].level,'Low Risk');
});
test('total provider outages preserve route geometry and unknown risk, while an alert can establish danger',async()=>{
  const down=async()=>{throw new Error('offline');};
  const p=providers({weather:{forecast:down},roads:{attributes:down},events:{events:down},alerts:{alerts:down}});
  const first=await createAnalyzer(p,now).analyze(origin,destination);assert.equal(first.routes[0].score,null);assert.equal(first.routes[0].data.alerts.state,'unavailable');assert.ok(first.routes[0].segments.length>0);
  p.alerts={alerts:async()=>({value:[warning],status})};const second=await createAnalyzer(p,now).analyze(origin,destination);assert.equal(second.routes[0].score,100);assert.equal(second.routes[0].knownWeatherPercent,0);
});
test('a mapped bridge is restricted to its measured sample area, not an entire forecast interval',async()=>{
  const p=providers({weather:{forecast:async s=>({value:s.map(()=>({...weather,temperatureC:1,precipitationMm:1})),status})},roads:{attributes:async(_r,s)=>({value:s.map((_x,i)=>i===20?{bridge:'yes'}:null),status})}});
  const result=await createAnalyzer(p,now).analyze(origin,destination);const r=result.routes[0];
  const mappedKm=r.segments.filter(s=>s.roads).reduce((sum,s)=>sum+s.endKm-s.startKm,0);assert.ok(mappedKm>0&&mappedKm<=.040001);assert.ok(r.segments.some(s=>s.hazards.some(h=>h.kind==='bridge-ice')));
});
test('reported MultiPoint closures do not color the unreported road between endpoints',async()=>{
  const event:RoadEvent={id:'event',name:'Test road',description:'Reported closure',closed:true,coordinates:[[4,0],[6,0]],routeMatch:{routeId:route.id,points:[{edgeIndex:0,fraction:.4},{edgeIndex:0,fraction:.6}]},geometryType:'MultiPoint',start:time,end:'2026-09-11T00:00:00Z',direction:'eastbound',source:'https://iowadot.gov/'};
  const result=await createAnalyzer(providers({events:{events:async()=>({value:[event],status})}}),now).analyze(origin,destination);
  const r=result.routes[0];assert.equal(r.score,95);assert.ok(r.highRiskKm<.141);assert.equal(r.segments.find(s=>s.startKm<=500&&s.endKm>500)?.level,'Low Risk');
});
test('a work-zone period ending before arrival does not become an active closure',async()=>{
  const event:RoadEvent={id:'event',name:'Test road',description:'Reported closure',closed:true,coordinates:[[5,0]],routeMatch:{routeId:route.id,points:[{edgeIndex:0,fraction:.5}]},start:time,end:'2026-09-10T00:05:00Z',direction:'eastbound',source:'https://iowadot.gov/'};
  const r=(await createAnalyzer(providers({events:{events:async()=>({value:[event],status})}}),now).analyze(origin,destination)).routes[0];assert.equal(r.score,0);assert.equal(r.hazards.length,0);
});
test('no route is an actionable failure rather than an empty successful analysis',async()=>{
  await assert.rejects(createAnalyzer(providers({router:{routes:async()=>[]}}),now).analyze(origin,destination),/No driving route/);
});

test('Iowa closure retains its validated road and direction through analysis and arrival filtering',async()=>{
  const parallel:DrivingRoute={...route,coordinates:[[-93.7,41.6],[-93.5,41.6],[-93.5,41.6001],[-93.7,41.6001]],distanceKm:34,durationSeconds:600,maneuvers:[
    {startIndex:0,endIndex:1,name:'Road B'}, {startIndex:1,endIndex:2,name:'Connector'}, {startIndex:2,endIndex:3,name:'Road A'},
  ]};
  const makeEvents=(end:string)=>createRoadEventProvider({json:async()=>({road_event_feed_info:{update_date:time},features:[{
    id:'parallel-closure',properties:{start_date:'2026-09-09T00:00:00Z',end_date:end,vehicle_impact:'all-lanes-closed',core_details:{event_type:'work-zone',road_names:['Road A'],direction:'westbound',description:'Construction'}},
    geometry:{type:'MultiPoint',coordinates:[[-93.6,41.60001]]},
  }]})},undefined,now);
  const p=providers({router:{routes:async()=>[parallel]},events:makeEvents('2026-09-11T00:00:00Z')});
  const eventResult=await p.events.events(parallel);
  assert.deepEqual(eventResult.value[0].routeMatch.points.map(p=>p.edgeIndex),[2]);
  const result=(await createAnalyzer(p,now).analyze(origin,destination)).routes[0];
  assert.equal(result.score,95);
  const affected=result.segments.filter(s=>s.hazards.some(h=>h.kind==='event:parallel-closure'));
  assert.ok(affected.length>0);
  assert.ok(affected.every(s=>s.startKm>17&&s.roadName==='Road A'));
  assert.ok(affected.every(s=>s.coordinates.every(c=>Math.abs(c[1]-41.6001)<1e-8)));
  // The incompatible first pass arrives before six minutes, the matched pass after.
  p.events=makeEvents('2026-09-10T00:06:00Z');
  assert.equal((await createAnalyzer(p,now).analyze(origin,destination)).routes[0].score,0);
});

test('event positions from another route or outside valid edges cannot create hazards',async()=>{
  const base:RoadEvent={id:'event',name:'Test road',description:'Closure',closed:true,coordinates:[[5,0]],routeMatch:{routeId:'other',points:[{edgeIndex:0,fraction:.5}]},start:time,end:'2026-09-11T00:00:00Z',direction:'eastbound',source:'https://iowadot.gov/'};
  for(const routeMatch of [base.routeMatch,{routeId:route.id,points:[{edgeIndex:99,fraction:.5},{edgeIndex:0,fraction:2}]}]){
    const result=await createAnalyzer(providers({events:{events:async()=>({value:[{...base,routeMatch}],status})}}),now).analyze(origin,destination);
    assert.equal(result.routes[0].score,0);
  }
});

test('warning onset during a narrow crossing preserves the active final second',async()=>{
  const short={...route,distanceKm:10,durationSeconds:600};
  const alert:WeatherAlert={...warning,onset:'2026-09-10T00:04:05Z',geometry:{type:'Polygon',coordinates:[[[4,-1],[4.1,-1],[4.1,1],[4,1],[4,-1]]]}};
  const result=(await createAnalyzer(providers({router:{routes:async()=>[short]},alerts:{alerts:async()=>({value:[alert],status})}}),now).analyze(origin,destination)).routes[0];
  assert.equal(result.score,100);
  assert.ok(Math.abs(result.highRiskKm-1/60)<1e-7);
  assert.ok(result.hazards.every(h=>h.startKm>=245/60-1e-8&&h.endKm<=4.1+1e-8));
});

test('event start and end inside a reported section produce only the active extent',async()=>{
  const short={...route,distanceKm:10,durationSeconds:600};
  const event:RoadEvent={id:'timed',name:'Test road',description:'Timed closure',closed:true,coordinates:[[4.05,0]],routeMatch:{routeId:route.id,points:[{edgeIndex:0,fraction:.405}]},start:'2026-09-10T00:04:04Z',end:'2026-09-10T00:04:05Z',direction:'eastbound',source:'https://iowadot.gov/'};
  const result=(await createAnalyzer(providers({router:{routes:async()=>[short]},events:{events:async()=>({value:[event],status})}}),now).analyze(origin,destination)).routes[0];
  assert.equal(result.score,95);
  assert.ok(Math.abs(result.highRiskKm-1/60)<1e-7);
  assert.ok(result.hazards.every(h=>Math.abs(h.startKm-244/60)<1e-7&&Math.abs(h.endKm-245/60)<1e-7));
});

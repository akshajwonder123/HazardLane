import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnalyzer, AnalysisProviders } from '../server/analyzer';
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
  const event:RoadEvent={id:'event',name:'Test road',description:'Reported closure',closed:true,coordinates:[[4,0],[6,0]],geometryType:'MultiPoint',start:time,end:'2026-09-11T00:00:00Z',direction:'eastbound',source:'https://iowadot.gov/'};
  const result=await createAnalyzer(providers({events:{events:async()=>({value:[event],status})}}),now).analyze(origin,destination);
  const r=result.routes[0];assert.equal(r.score,95);assert.ok(r.highRiskKm<.141);assert.equal(r.segments.find(s=>s.startKm<=500&&s.endKm>500)?.level,'Low Risk');
});
test('a work-zone period ending before arrival does not become an active closure',async()=>{
  const event:RoadEvent={id:'event',name:'Test road',description:'Reported closure',closed:true,coordinates:[[5,0]],start:time,end:'2026-09-10T00:05:00Z',direction:'eastbound',source:'https://iowadot.gov/'};
  const r=(await createAnalyzer(providers({events:{events:async()=>({value:[event],status})}}),now).analyze(origin,destination)).routes[0];assert.equal(r.score,0);assert.equal(r.hazards.length,0);
});
test('no route is an actionable failure rather than an empty successful analysis',async()=>{
  await assert.rejects(createAnalyzer(providers({router:{routes:async()=>[]}}),now).analyze(origin,destination),/No driving route/);
});

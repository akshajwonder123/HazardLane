import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssessedRoute, RiskSegment, Weather, WeatherAlert } from '../lib/domain';
import { aggregateRisk, boundedScore, recommendRoute, scoreConditions } from '../lib/risk-engine';
import { areaIntervals, routeDistances } from '../lib/geometry';

const dry: Weather = {time:'2026-09-09T12:00:00Z',temperatureC:20,precipitationMm:0,snowfallCm:0,windKmh:10,gustKmh:20,visibilityM:20000,code:0};
const alert = (event:string):WeatherAlert => ({id:event,event,headline:`${event} in effect`,severity:'Severe',onset:null,expires:null,geometry:{type:'Polygon',coordinates:[]},url:'https://www.weather.gov/'});
const cases: [string,Partial<Weather>,string][] = [
  ['clear ordinary trip',{},'Low Risk'], ['light rain',{precipitationMm:1},'Low Risk'],
  ['moderate rain alone',{precipitationMm:5},'Low Risk'],
  ['moderate rain with reduced visibility',{precipitationMm:5,visibilityM:1000},'Medium Risk'],
  ['heavy rain and low visibility',{precipitationMm:15,visibilityM:400},'High Risk'],
  ['ordinary breeze',{windKmh:25,gustKmh:35},'Low Risk'],
  ['strong gusts',{gustKmh:80},'Medium Risk'], ['extreme gusts',{gustKmh:120},'High Risk'],
  ['freezing but dry',{temperatureC:-8},'Low Risk'],
  ['near-freezing precipitation',{temperatureC:1,precipitationMm:1},'Medium Risk'],
  ['freezing precipitation',{temperatureC:-1,precipitationMm:1},'High Risk'],
  ['freezing rain code',{code:67},'High Risk'], ['heavy snowfall',{snowfallCm:4},'High Risk'],
  ['extremely poor visibility',{visibilityM:50},'High Risk'],
];
for (const [name,changes,level] of cases) test(`calibration: ${name}`, () => {
  const risk=scoreConditions({...dry,...changes}); assert.equal(risk.level,level); assert.ok(risk.score!==null&&risk.score>=0&&risk.score<=100);
});
test('normalization is finite and bounded; invalid weather is unknown',()=>{
  assert.equal(boundedScore(200),100);assert.equal(boundedScore(-10),0);
  const risk=scoreConditions({...dry,precipitationMm:NaN,gustKmh:Infinity});
  assert.equal(risk.weatherComplete,false);assert.equal(risk.score,null);
});
test('precipitation and gust risk are monotone and nonlinear',()=>{
  const rain=[0,1,2.5,5,10,20,35].map(precipitationMm=>scoreConditions({...dry,precipitationMm}).score!);
  assert.ok(rain.every((v,i)=>i===0||v>=rain[i-1]));assert.ok(rain[5]-rain[4]>rain[1]-rain[0]);
  const wind=[20,35,50,65,80,100,120].map(gustKmh=>scoreConditions({...dry,gustKmh}).score!);
  assert.ok(wind.every((v,i)=>i===0||v>=wind[i-1]));assert.equal(wind[0],wind[1]);
});
test('missing road attributes never add risk; dry bridges do not add risk',()=>{
  assert.equal(scoreConditions(dry,[],null).score,scoreConditions(dry,[],{}).score);
  assert.equal(scoreConditions(dry,[],{bridge:'yes',surface:'gravel'}).score,0);
  const icy={...dry,temperatureC:1,precipitationMm:1};
  assert.equal(scoreConditions(icy,[],{bridge:'yes'}).score!-scoreConditions(icy).score!,8);
});
test('rain and visibility interact beyond their maximum individual effects',()=>{
  const combined=scoreConditions({...dry,precipitationMm:10,visibilityM:500});
  assert.ok(combined.score!>Math.max(scoreConditions({...dry,precipitationMm:10}).score!,scoreConditions({...dry,visibilityM:500}).score!));
});
test('severe official alerts dominate; unrelated alerts do not inflate risk',()=>{
  assert.equal(scoreConditions(dry,[alert('Tornado Warning')]).score,100);
  assert.equal(scoreConditions(dry,[alert('Flash Flood Warning')]).level,'High Risk');
  assert.equal(scoreConditions(dry,[alert('Heat Advisory'),alert('Rip Current Statement')]).score,0);
  assert.equal(scoreConditions(dry,[alert('Flood Watch'),alert('Flood Watch')]).score,35);
});
test('total weather outage is unknown but an official warning still creates risk',()=>{
  assert.equal(scoreConditions(null).score,null);assert.equal(scoreConditions(null).level,null);
  assert.equal(scoreConditions(null,[alert('Tornado Warning')]).score,100);
  assert.equal(scoreConditions({...dry,visibilityM:null}).score,null);
});
function segment(startKm:number,endKm:number,changes:Partial<Weather>={},alerts:WeatherAlert[]=[]):RiskSegment {
  return {...scoreConditions({...dry,...changes},alerts),id:`${startKm}`,startKm,endKm,coordinates:[[0,0],[1,0]],roadName:'Test road',weather:{...dry,...changes},roads:null,arrivalTime:dry.time};
}
test('a five-mile dangerous section cannot disappear in a 1,000 km trip',()=>{
  const result=aggregateRisk([segment(0,400),segment(400,408.04672,{gustKmh:100}),segment(408.04672,1000)]);
  assert.equal(result.level,'High Risk');assert.ok(result.score!>=60);assert.ok(result.mean!<1);assert.ok(Math.abs(result.highRiskKm-8.04672)<1e-6);
});
test('critical section overrides survive aggregation',()=>{
  const result=aggregateRisk([segment(0,999),segment(999,1000,{},[alert('Tornado Warning')])]);assert.equal(result.score,100);
});
test('a narrow warning between forecast samples still produces a critical route section',()=>{
  const coordinates: [number,number][] = [[0,0],[10,0]];
  const warning=alert('Tornado Warning');
  warning.geometry={type:'Polygon',coordinates:[[[4,-1],[4.01,-1],[4.01,1],[4,1],[4,-1]]]};
  const intervals=areaIntervals(coordinates,routeDistances(coordinates,1000),warning.geometry);
  assert.equal(intervals.length,1);
  const {startKm,endKm}=intervals[0];
  assert.ok(Math.abs(endKm-startKm-1)<1e-5);
  const result=aggregateRisk([segment(0,startKm),segment(startKm,endKm,{},[warning]),segment(endKm,1000)]);
  assert.equal(result.score,100);assert.equal(result.level,'High Risk');
});
test('distance-weighting ignores how often clear geometry is subdivided',()=>{
  const one=aggregateRisk([segment(0,90),segment(90,100,{precipitationMm:5})]);
  const many=aggregateRisk([...Array.from({length:90},(_,i)=>segment(i,i+1)),segment(90,100,{precipitationMm:5})]);
  assert.equal(one.score,many.score);assert.equal(one.mean,many.mean);
});
test('partial or empty weather coverage cannot yield a reassuring route score',()=>{
  const missing={...segment(50,100),...scoreConditions(null),weather:null};
  const partial=aggregateRisk([segment(0,50),missing]);assert.equal(partial.score,null);assert.equal(partial.knownWeatherPercent,50);
  assert.equal(aggregateRisk([]).score,null);assert.equal(aggregateRisk([segment(0,0)]).score,null);
});
function route(id:string,score:number,minutes=60,km=100):AssessedRoute {
  const data={state:'available' as const,detail:'Fixture'};
  return {id,name:id,score,level:score<30?'Low Risk':score<60?'Medium Risk':'High Risk',durationSeconds:minutes*60,distanceKm:km,coordinates:[[0,0],[1,0]],provider:'fixture',maneuvers:[],segments:[],summary:'',peakScore:score,highRiskKm:0,knownWeatherPercent:100,sampleCount:20,hazards:[],data:{weather:data,alerts:data,roads:data,events:data}};
}
test('all Low routes keep the efficient standard route',()=>assert.equal(recommendRoute([route('standard',20),route('detour',0,75)]).recommendedId,'standard'));
test('meaningfully lower risk wins within sensible detour limits',()=>{
  assert.equal(recommendRoute([route('standard',50),route('alternate',25,70,110)]).recommendedId,'alternate');
  assert.equal(recommendRoute([route('standard',90),route('alternate',30,90,150)]).recommendedId,'alternate');
});
test('tiny reductions and absurd detours do not win',()=>{
  assert.equal(recommendRoute([route('standard',50),route('tiny',45,65)]).recommendedId,'standard');
  assert.equal(recommendRoute([route('standard',50),route('absurd',0,200,350)]).recommendedId,'standard');
});
test('unknown forecasts or alert gaps prevent lower-risk claims',()=>{
  const alternate=route('alternate',10,65);alternate.knownWeatherPercent=80;
  assert.equal(recommendRoute([route('standard',75),alternate]).recommendedId,'standard');
  alternate.knownWeatherPercent=100;alternate.data.alerts={state:'partial',detail:'Missing zones'};
  assert.equal(recommendRoute([route('standard',75),alternate]).recommendedId,'standard');
});

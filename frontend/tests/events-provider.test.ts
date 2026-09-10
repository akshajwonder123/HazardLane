import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoadEventProvider } from '../server/providers/events';
import type { DrivingRoute } from '../lib/domain';
const now=Date.parse('2026-09-10T01:00:00Z');
const route:DrivingRoute={id:'r',name:'R',coordinates:[[-93.7,41.6],[-93.6,41.6]],distanceKm:8,durationSeconds:500,provider:'fixture',maneuvers:[{startIndex:0,endIndex:1,name:'I 80'}]};
const event=(changes:Record<string,unknown>={},core:Record<string,unknown>={})=>({id:'work1',properties:{start_date:'2026-09-09T00:00:00Z',end_date:'2026-09-11T00:00:00Z',vehicle_impact:'all-lanes-closed',...changes,core_details:{event_type:'work-zone',road_names:['I-80'],direction:'eastbound',description:'Construction.',...core}},geometry:{type:'MultiPoint',coordinates:[[-93.65,41.6],[-93.64,41.6]]}});
const provider=(features:unknown[],update='2026-09-10T00:59:00Z')=>createRoadEventProvider({json:async()=>({road_event_feed_info:{update_date:update},features})},undefined,()=>now);
test('fresh active explicit closure matches named road and preserves MultiPoints without a connecting line',async()=>{
  const r=await provider([event()]).events(route);assert.equal(r.status.state,'partial');assert.equal(r.value.length,1);assert.equal(r.value[0].closed,true);assert.equal(r.value[0].geometryType,'MultiPoint');assert.equal(r.value[0].coordinates.length,2);
});
test('stale feeds, expired/future events and all-open impacts cannot establish closures',async()=>{
  assert.equal((await provider([event()],'2026-09-09T00:00:00Z').events(route)).status.state,'unavailable');
  for(const properties of [{start_date:'2026-09-11T00:00:00Z'},{end_date:'2026-09-09T00:00:00Z'},{vehicle_impact:'all-lanes-open'}])assert.equal((await provider([event(properties)]).events(route)).value.length,0);
});
test('wrong direction, nearby different road and unmatched points do not receive a closure',async()=>{
  for(const core of [{direction:'westbound'},{road_names:['I-35']}])assert.equal((await provider([event({},core)]).events(route)).value.length,0);
  const far=event();far.geometry.coordinates=[[-93.65,41.61]];assert.equal((await provider([far]).events(route)).value.length,0);
});
test('recurring schedules and unknown direction retain work-zone evidence but not active-closure claims',async()=>{
  for(const core of [{description:'Overnight work. Full schedule below.'},{direction:'unknown'}]){const r=await provider([event({},core)]).events(route);assert.equal(r.value.length,1);assert.equal(r.value[0].closed,false);}
});
test('outside Iowa skips the feed, missing feed is unknown',async()=>{
  let calls=0;const p=createRoadEventProvider({json:async()=>{calls++;throw new Error('offline');}});
  assert.equal((await p.events({...route,coordinates:[[-77,39],[-76,39]]})).status.state,'outside-coverage');assert.equal(calls,0);
  assert.equal((await p.events(route)).status.state,'unavailable');
});

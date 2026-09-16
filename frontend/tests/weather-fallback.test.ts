import test from 'node:test';
import assert from 'node:assert/strict';
import {withWeatherFallback} from '../server/providers/weather-fallback';
import type {Weather,Sample} from '../lib/domain';
const sample:Sample={coordinate:[-77,39],distanceKm:0,arrivalTime:'2026-09-16T01:30:00Z'};
const full:Weather={time:sample.arrivalTime,temperatureC:20,windKmh:10,gustKmh:20,visibilityM:10000,precipitationMm:0,snowfallCm:0,code:0};
const status={state:'available' as const,detail:'Primary'};
test('healthy primary does not call fallback',async()=>{
  const p=withWeatherFallback({forecast:async()=>({value:[full],status})},{forecast:async()=>{throw new Error('must not call');}});
  assert.deepEqual((await p.forecast([sample])).value,[full]);
});
test('fallback fills empty rows without overwriting or stitching useful primary models',async()=>{
  const partial={...full,code:null,visibilityM:null}; let count=0;
  const p=withWeatherFallback({forecast:async()=>({value:[full,partial,null],status:{state:'partial',detail:'Primary gap'}})},
    {forecast:async samples=>{count=samples.length;return{value:[{...full,code:null}],status:{state:'partial',detail:'NWS'}};}});
  const r=await p.forecast([sample,sample,sample]);assert.equal(count,1);assert.deepEqual(r.value,[full,partial,{...full,code:null}]);assert.equal(r.status.state,'partial');
});
test('fallback outage preserves primary evidence and never fabricates data',async()=>{
  const p=withWeatherFallback({forecast:async()=>({value:[null],status:{state:'unavailable',detail:'Primary down'}})},{forecast:async()=>{throw new Error('offline');}});
  const r=await p.forecast([sample]);assert.deepEqual(r.value,[null]);assert.equal(r.status.state,'unavailable');
});

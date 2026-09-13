import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/runtime-worker';
import {hostedWeatherBudget} from '../server/runtime-worker';

test('hosted weather fails closed without its shared database or with invalid hold configuration',async()=>{
  await assert.rejects(hostedWeatherBudget(undefined,undefined).reserve(1),/shared weather budget/);
  const db={prepare(){throw new Error('must not access database for invalid configuration');}};
  await assert.rejects(hostedWeatherBudget(db,'invalid').reserve(1),/shared weather budget/);
});
test('Worker serves API requests through the service and delegates static assets',async()=>{
  let calls=0;const env={ASSETS:{fetch:async()=>{calls++;return new Response('<html>StormRoute</html>');}}};
  const health=await worker.fetch(new Request('https://stormroute.example/api/health'),env);assert.equal(health.status,200);assert.deepEqual(await health.json(),{status:'ok'});assert.equal(calls,0);
  const page=await worker.fetch(new Request('https://stormroute.example/'),env);assert.ok((await page.text()).includes('StormRoute'));assert.equal(calls,1);
});

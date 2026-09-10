import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/runtime-worker';
test('Worker serves API requests through the service and delegates static assets',async()=>{
  let calls=0;const env={ASSETS:{fetch:async()=>{calls++;return new Response('<html>StormRoute</html>');}}};
  const health=await worker.fetch(new Request('https://stormroute.example/api/health'),env);assert.equal(health.status,200);assert.deepEqual(await health.json(),{status:'ok'});assert.equal(calls,0);
  const page=await worker.fetch(new Request('https://stormroute.example/'),env);assert.ok((await page.text()).includes('StormRoute'));assert.equal(calls,1);
});

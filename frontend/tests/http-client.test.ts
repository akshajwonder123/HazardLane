import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpClient } from '../server/http-client';

const origin='https://provider.example';
test('default fetch resolves the request-time runtime binding with its global receiver',async()=>{
  const original=globalThis.fetch;
  const client=createHttpClient({allowedOrigins:[origin]});
  try {
    globalThis.fetch=async function(this:unknown){assert.equal(this,globalThis);return Response.json({ok:true});};
    assert.deepEqual(await client.json(origin,{ttlMs:0}),{ok:true});
  } finally {globalThis.fetch=original;}
});
test('coalesces concurrent requests, isolates caller mutations, expires and evicts cache',async()=>{
  let calls=0, now=0;
  const client=createHttpClient({allowedOrigins:[origin],now:()=>now,maxEntries:1,fetcher:async()=>{calls++;return Response.json({calls});}});
  const [a,b]=await Promise.all([client.json(origin+'/a',{ttlMs:100}),client.json(origin+'/a',{ttlMs:100})]);
  assert.deepEqual(a,b);assert.equal(calls,1);(a as {calls:number}).calls=9;
  assert.deepEqual(await client.json(origin+'/a',{ttlMs:100}),{calls:1});
  now=101;await client.json(origin+'/a',{ttlMs:100});assert.equal(calls,2);
  await client.json(origin+'/b',{ttlMs:100});await client.json(origin+'/a',{ttlMs:100});assert.equal(calls,4);
});
test('rejects arbitrary hosts, credentials, protocols and changed ports before fetching',async()=>{
  let calls=0;const client=createHttpClient({allowedOrigins:[origin],fetcher:async()=>{calls++;return Response.json({});}});
  for(const url of ['http://127.0.0.1','https://provider.example.attacker.test','https://user:pw@provider.example/','http://provider.example/','https://provider.example:8443/']) await assert.rejects(client.json(url,{ttlMs:0}));
  assert.equal(calls,0);
});
test('limits response bytes even when content length is absent and does not cache failures',async()=>{
  let calls=0;const client=createHttpClient({allowedOrigins:[origin],fetcher:async()=>{calls++;return new Response('123456789');}});
  await assert.rejects(client.json(origin,{ttlMs:100,maxBytes:4}),/size limit/);
  await assert.rejects(client.json(origin,{ttlMs:100,maxBytes:4}),/size limit/);assert.equal(calls,2);
});
test('respects host cooldown after rate limiting, then retries after expiry',async()=>{
  let calls=0,now=0;const client=createHttpClient({allowedOrigins:[origin],now:()=>now,fetcher:async()=>{calls++;return calls===1?new Response('',{status:429,headers:{'Retry-After':'5'}}):Response.json({ok:true});}});
  await assert.rejects(client.json(origin+'/a',{ttlMs:0}),/rate limit/);
  await assert.rejects(client.json(origin+'/b',{ttlMs:0}),/rate limit/);assert.equal(calls,1);
  now=5001;assert.deepEqual(await client.json(origin+'/b',{ttlMs:0}),{ok:true});assert.equal(calls,2);
});
test('a long Retry-After blocks different URLs, but fresh cached data is still usable',async()=>{
  let now=0,calls=0;
  const client=createHttpClient({allowedOrigins:[origin],now:()=>now,fetcher:async()=>++calls===1?Response.json({ok:true}):new Response('',{status:429,headers:{'Retry-After':'7200'}})});
  await client.json(origin+'/cached',{ttlMs:10000000});
  await assert.rejects(client.json(origin+'/limited',{ttlMs:0}),error=>!!error&&typeof error==='object'&&'retryAt'in error&&error.retryAt===7200000);
  now=600000;
  assert.deepEqual(await client.json(origin+'/cached',{ttlMs:10000000}),{ok:true});
  await assert.rejects(client.json(origin+'/another',{ttlMs:0}),/rate limit/);assert.equal(calls,2);
});
test('bounds concurrency and rejects malformed JSON without poisoning later requests',async()=>{
  let active=0,peak=0,calls=0;
  const client=createHttpClient({allowedOrigins:[origin],concurrency:2,fetcher:async()=>{
    active++;peak=Math.max(peak,active);calls++;await new Promise(resolve=>setTimeout(resolve,5));active--;return new Response(calls<=2?'broken':'{}');
  }});
  const results=await Promise.allSettled(Array.from({length:8},(_,i)=>client.json(origin+'/'+i,{ttlMs:0})));
  assert.equal(peak,2);assert.ok(results.some(r=>r.status==='rejected'));assert.ok(results.some(r=>r.status==='fulfilled'));
});
test('passes manual redirect policy and aborts a slow provider',async()=>{
  const client=createHttpClient({allowedOrigins:[origin],fetcher:async(_url,init)=>{
    assert.equal(init?.redirect,'manual');
    return new Promise<Response>((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new Error('aborted'))));
  }});
  await assert.rejects(client.json(origin,{ttlMs:0,timeoutMs:100}),/timed out/);
});
test('rejects redirect responses without fetching their destinations or caching them',async()=>{
  let calls=0;
  const client=createHttpClient({allowedOrigins:[origin],fetcher:async(url,init)=>{
    calls++;assert.equal(new URL(String(url)).origin,origin);assert.equal(init?.redirect,'manual');
    return new Response(null,{status:302,headers:{Location:'http://127.0.0.1/private'}});
  }});
  await assert.rejects(client.json(origin,{ttlMs:100}),/HTTP 302/);
  await assert.rejects(client.json(origin,{ttlMs:100}),/HTTP 302/);
  assert.equal(calls,2);
});

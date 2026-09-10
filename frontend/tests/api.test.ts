import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../server/api';
import { ProviderError } from '../server/contracts';
import type { RouteAnalysis } from '../lib/domain';
const from={id:'a',label:'A',lat:39,lon:-77},to={...from,id:'b',label:'B',lat:40};
const routeRequest=(body:unknown,headers:Record<string,string>={})=>new Request('http://localhost/api/analyze',{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json',...headers}});
function setup(){let searches=0,analyses=0;const api=createApi({geocoder:{search:async q=>{searches++;return[{...from,label:q}];}},analyzer:{analyze:async()=>{analyses++;return {origin:from,destination:to,routes:[]} as unknown as RouteAnalysis;}}});return{api,calls:()=>({searches,analyses})};}
test('valid requests use only normalized location data and return search results',async()=>{
  const {api,calls}=setup();const res=await api(new Request('http://localhost/api/search?q=Boston'),'a');assert.equal(res.status,200);assert.equal((await res.json()).locations[0].label,'Boston');
  assert.equal((await api(routeRequest({origin:from,destination:to,providerUrl:'http://127.0.0.1'}),'a')).status,200);assert.deepEqual(calls(),{searches:1,analyses:1});
});
test('invalid coordinates, oversized JSON and unsupported methods never reach analysis',async()=>{
  for(const body of [{origin:{...from,lat:100},destination:to},{origin:from,destination:from},{origin:from,destination:to,padding:'x'.repeat(5000)}]){
    const {api,calls}=setup();assert.equal((await api(routeRequest(body))).status,400);assert.equal(calls().analyses,0);
  }
  assert.equal((await setup().api(new Request('http://localhost/api/analyze'))).status,405);
});
test('cross-origin access is explicit and does not create a wildcard proxy',async()=>{
  const {api,calls}=setup();assert.equal((await api(routeRequest({origin:from,destination:to},{Origin:'https://attacker.example'}))).status,403);assert.equal(calls().analyses,0);
  const allowed=createApi({allowedOrigins:['http://localhost:3000'],geocoder:{search:async()=>[]},analyzer:{analyze:async()=>{throw new Error('unused');}}});
  const res=await allowed(new Request('http://localhost:8788/api/search?q=Boston',{headers:{Origin:'http://localhost:3000'}}));assert.equal(res.headers.get('Access-Control-Allow-Origin'),'http://localhost:3000');
});
test('global analysis rate limit is shared across client IDs',async()=>{
  const {api,calls}=setup();for(let i=0;i<2;i++)assert.equal((await api(routeRequest({origin:from,destination:to}),String(i))).status,200);
  const limited=await api(routeRequest({origin:from,destination:to}),'new-client');assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('Retry-After'))>0);assert.equal(calls().analyses,2);
});
test('known no-route and unexpected provider errors produce useful bounded responses',async()=>{
  const api=createApi({geocoder:{search:async()=>{throw new Error('private internals');}},analyzer:{analyze:async()=>{throw new ProviderError('no-route','No driving route was found.');}}});
  const res=await api(routeRequest({origin:from,destination:to}));assert.equal(res.status,422);
  const failed=await api(new Request('http://localhost/api/search?q=Boston'));assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('private internals'));
});

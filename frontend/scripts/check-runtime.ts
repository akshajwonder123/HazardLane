import assert from 'node:assert/strict';
async function main(){
  const origin=process.argv[2]??'http://localhost:3000';
  const page=await fetch(origin);assert.equal(page.status,200);assert.ok((await page.text()).includes('StormRoute'));
  const health=await fetch(`${origin}/api/health`);assert.deepEqual(await health.json(),{status:'ok'});
  const worker=await fetch(`${origin}/vendor/maplibre/maplibre-gl-worker.mjs`);assert.equal(worker.status,200);assert.match(worker.headers.get('content-type')??'',/javascript/);
  for(const path of ['/server/index.js','/.env','/..%2f..%2fAGENTS.md']){const r=await fetch(origin+path);assert.ok([400,403,404].includes(r.status));}
  assert.equal((await fetch(`${origin}/api/search`,{method:'POST'})).status,405);
  assert.equal((await fetch(`${origin}/api/analyze`,{method:'POST',headers:{'Content-Type':'application/json'},body:'null'})).status,400);
  console.log('Production runtime: page, map worker, API health, input/method validation and static path isolation passed.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

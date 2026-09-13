import test from 'node:test';
import assert from 'node:assert/strict';
import {rateLimitEvidence,retryDeadline} from '../server/rate-limit';

test('honors long delta seconds and HTTP dates without shortening the provider delay',()=>{
  const now=Date.parse('2026-09-12T12:00:00Z');
  assert.equal(retryDeadline('7200',null,now,1),now+7200000);
  assert.equal(retryDeadline('Sat, 12 Sep 2026 15:00:00 GMT',null,now,1),now+10800000);
});
test('backs off repeated unqualified429s and respects known quota windows',()=>{
  assert.equal(retryDeadline(null,null,0,1),60000);
  assert.equal(retryDeadline(null,null,60000,2),180000);
  assert.equal(retryDeadline(null,'Daily API request limit exceeded. Please try again tomorrow.',0,1),86400000);
  assert.equal(retryDeadline(null,'Hourly API request limit exceeded.',0,1),3600000);
  assert.equal(retryDeadline('1','Daily API request limit exceeded.',0,1),86400000);
});
test('429 diagnostics retain only recognized response reasons and bound body reads',async()=>{
  const reason='Daily API request limit exceeded. Please try again tomorrow.';
  assert.deepEqual(await rateLimitEvidence(Response.json({error:true,reason})),{reason,format:'json'});
  assert.equal((await rateLimitEvidence(Response.json({reason:'secret http://private/path?token=value'}))).reason,null);
  assert.equal((await rateLimitEvidence(new Response('x'.repeat(5000)))).reason,null);
});

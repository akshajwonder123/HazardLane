import test from 'node:test';
import assert from 'node:assert/strict';
import health from '../api/health';
import search from '../api/search';
import analyze from '../api/analyze';

test('Vercel entrypoints preserve API validation without provider requests', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Unexpected upstream request'); };
  try {
    const response = await health.fetch(new Request('https://demo.vercel.app/api/health'));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await search.fetch(new Request('https://demo.vercel.app/api/search?q=x'))).status, 400);
    assert.equal((await analyze.fetch(new Request('https://demo.vercel.app/api/analyze'))).status, 405);
    assert.equal((await analyze.fetch(new Request('https://demo.vercel.app/api/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    }))).status, 400);
    assert.equal((await health.fetch(new Request('https://demo.vercel.app/api/health', {
      headers: { origin: 'https://untrusted.example' }
    }))).status, 403);
  } finally { globalThis.fetch = previous; }
});

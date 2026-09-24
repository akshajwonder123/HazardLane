import assert from 'node:assert/strict';
import test from 'node:test';
import { createNwsWeatherProvider } from '../server/providers/nws-weather';
import { ProviderError, type JsonClient } from '../server/contracts';
import type { Sample } from '../lib/domain';

const sample = (lon: number, lat: number, arrivalTime = '2026-09-16T13:20:00Z'): Sample => ({ coordinate: [lon, lat], distanceKm: 0, arrivalTime });
const point = (link = 'https://api.weather.gov/gridpoints/LWX/97,71') => ({ properties: { forecastGridData: link } });
const field = (uom: string, values: unknown[]) => ({ uom, values });
const grid = (overrides: Record<string, unknown> = {}) => ({ properties: {
  temperature: field('wmoUnit:degC', [{ validTime: '2026-09-16T13:00:00Z/PT1H', value: 4 }]),
  windSpeed: field('wmoUnit:km_h-1', [{ validTime: '2026-09-16T13:00:00Z/PT1H', value: 55 }]),
  windGust: field('wmoUnit:km_h-1', [{ validTime: '2026-09-16T13:00:00Z/PT1H', value: 75 }]),
  visibility: field('wmoUnit:m', [{ validTime: '2026-09-16T13:00:00Z/PT1H', value: 700 }]),
  quantitativePrecipitation: field('wmoUnit:mm', [{ validTime: '2026-09-16T12:00:00Z/PT6H', value: 0 }]),
  snowfallAmount: field('wmoUnit:mm', [{ validTime: '2026-09-16T12:00:00Z/PT6H', value: 0 }]), ...overrides } });

test('maps strictly contained NWS values, known-zero coverage, and never invents a code', async () => {
  const client: JsonClient = { json: async url => url.includes('/points/') ? point() : grid() };
  const result = await createNwsWeatherProvider(client).forecast([sample(-77, 38.9)]);
  assert.equal(result.status.state, 'partial'); assert.deepEqual(result.value[0], { source: 'NWS', time: '2026-09-16T13:20:00.000Z', temperatureC: 4, precipitationMm: 0, snowfallCm: 0, windKmh: 55, gustKmh: 75, visibilityM: 700, code: null });
});

test('keeps positive, gapped, wrong-unit and overlapping accumulation or fields unknown', async () => {
  const bad = grid({ windSpeed: field('wmoUnit:km_h-1', [{ validTime: '2026-09-16T13:00:00Z/PT1H', value: 5 }, { validTime: '2026-09-16T13:30:00Z/PT1H', value: 6 }]), quantitativePrecipitation: field('wmoUnit:mm', [{ validTime: '2026-09-16T13:00:00Z/PT30M', value: 0 }, { validTime: '2026-09-16T14:00:00Z/PT30M', value: 0 }]), snowfallAmount: field('wmoUnit:cm', [{ validTime: '2026-09-16T13:00:00Z/PT1H', value: 0 }]) });
  const client: JsonClient = { json: async url => url.includes('/points/') ? point() : bad };
  const value = (await createNwsWeatherProvider(client).forecast([sample(-77, 38.9)])).value[0]!;
  assert.equal(value.windKmh, null); assert.equal(value.precipitationMm, null); assert.equal(value.snowfallCm, null); assert.equal(value.code, null);
});

test('does not divide positive NWS accumulation, but accepts adjoining known-zero intervals covering the preceding hour', async () => {
  const positive = grid({
    quantitativePrecipitation: field('wmoUnit:mm', [{ validTime: '2026-09-16T12:00:00Z/PT1H', value: 2 }]),
    snowfallAmount: field('wmoUnit:mm', [{ validTime: '2026-09-16T12:00:00Z/PT6H', value: 2 }]),
  });
  const positiveClient: JsonClient = { json: async url => url.includes('/points/') ? point() : positive };
  const positiveValue = (await createNwsWeatherProvider(positiveClient).forecast([sample(-77, 38.9)])).value[0]!;
  assert.equal(positiveValue.precipitationMm, null); assert.equal(positiveValue.snowfallCm, null);
  const zeroes = grid({
    quantitativePrecipitation: field('wmoUnit:mm', [{ validTime: '2026-09-16T12:00:00-00:00/PT30M', value: 0 }, { validTime: '2026-09-16T12:30:00-00:00/PT30M', value: 0 }, { validTime: '2026-09-16T13:00:00Z/PT6H', value: 3 }]),
    snowfallAmount: field('wmoUnit:mm', [{ validTime: '2026-09-16T12:00:00Z/P1DT1H', value: 0 }]),
  });
  const client: JsonClient = { json: async url => url.includes('/points/') ? point() : zeroes };
  const value = (await createNwsWeatherProvider(client).forecast([sample(-77, 38.9)])).value[0]!;
  assert.equal(value.precipitationMm, 0); assert.equal(value.snowfallCm, 0);
});

test('uses half-open intervals: an exact end timestamp has no instantaneous field', async () => {
  const client: JsonClient = { json: async url => url.includes('/points/') ? point() : grid({ temperature: field('wmoUnit:degC', [{ validTime: '2026-09-16T12:00:00Z/PT1H', value: 4 }]) }) };
  const value = (await createNwsWeatherProvider(client).forecast([sample(-77, 38.9, '2026-09-16T13:00:00Z')])).value[0]!;
  assert.equal(value.temperatureC, null);
});

test('rejects malformed or credentialed grid links and treats 404 points as outside coverage', async () => {
  const malformed: JsonClient = { json: async () => point('https://evil.example/gridpoints/LWX/97,71') };
  assert.equal((await createNwsWeatherProvider(malformed).forecast([sample(-77, 38.9)])).status.state, 'unavailable');
  let gridCalls = 0; const credentialed: JsonClient = { json: async url => { if (url.includes('/gridpoints/')) gridCalls++; return point('https://user:pass@api.weather.gov/gridpoints/LWX/97,71'); } };
  await createNwsWeatherProvider(credentialed).forecast([sample(-77, 38.9)]); assert.equal(gridCalls, 0);
  const outside: JsonClient = { json: async () => { throw new ProviderError('unavailable', 'The data provider returned HTTP 404.'); } };
  assert.equal((await createNwsWeatherProvider(outside).forecast([sample(-77, 38.9)])).status.state, 'outside-coverage');
});

test('caps processing at 32 evenly spread coordinates and uses the client cache/coalescing options', async () => {
  const urls: string[] = []; const client: JsonClient = { json: async (url, options) => { urls.push(`${url}:${options.ttlMs}:${options.timeoutMs}`); return url.includes('/points/') ? point() : grid(); } };
  const result = await createNwsWeatherProvider(client).forecast(Array.from({ length: 40 }, (_, index) => sample(-100 + index, 30)));
  assert.equal(urls.filter(url => url.includes('/points/')).length, 32); assert.ok(urls.some(url => url.includes('/points/30,-100'))); assert.ok(urls.some(url => url.includes('/points/30,-61'))); assert.equal(result.value.filter(Boolean).length, 32); assert.match(result.status.detail, /8 coordinate lookups were skipped/);
});

test('stops unsent point requests after a 429 while retaining already in-flight work', async () => {
  let calls = 0, gridCalls = 0; const client: JsonClient = { json: async url => { if (url.includes('/points/')) { calls++; if (calls === 1) throw new ProviderError('rate-limited', 'quota'); return point(); } gridCalls++; return grid(); } };
  const result = await createNwsWeatherProvider(client).forecast(Array.from({ length: 32 }, (_, index) => sample(-100 + index, 30)));
  assert.ok(calls <= 2); assert.equal(gridCalls, 0); assert.equal(result.status.state, 'unavailable'); assert.match(result.status.detail, /request budget/);
});

test('deadline prevents a grid request after slow point discovery; grid404 is unavailable',async()=>{
  let now=0,grids=0;
  const slow:JsonClient={json:async url=>{if(url.includes('/points/')){now=12000;return point();}grids++;return grid();}};
  const result=await createNwsWeatherProvider(slow,undefined,()=>now).forecast([sample(-77,39)]);
  assert.equal(grids,0);assert.equal(result.value[0],null);
  const missingGrid:JsonClient={json:async url=>{if(url.includes('/points/'))return point();throw new ProviderError('unavailable','The data provider returned HTTP 404.');}};
  assert.equal((await createNwsWeatherProvider(missingGrid).forecast([sample(-77,39)])).status.state,'unavailable');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createWeatherProvider } from '../server/providers/weather';
import { ProviderError, type JsonClient } from '../server/contracts';
import type { Sample } from '../lib/domain';

const sample = (lon: number, lat: number, arrivalTime = '2026-09-09T12:20:00Z'): Sample => ({ coordinate: [lon, lat], distanceKm: 0, arrivalTime });
const hourly = (lat: number, lon: number, overrides: Record<string, unknown> = {}) => ({
  latitude: lat, longitude: lon,
  hourly_units: { temperature_2m: '°C', precipitation: 'mm', snowfall: 'cm', wind_speed_10m: 'km/h', wind_gusts_10m: 'km/h', visibility: 'm', weather_code: 'wmo code' },
  hourly: { time: ['2026-09-09T12:00', '2026-09-09T13:00', '2026-09-09T14:00'], temperature_2m: [4, 5, 6], precipitation: [0, 1.2, 7.5], snowfall: [0, 0, 1], wind_speed_10m: [20, 21, 22], wind_gusts_10m: [30, 31, 45], visibility: [8000, 9000, 10000], weather_code: [61, 3, 2], ...overrides },
});

test('batches rounded duplicate coordinates and preserves original sample order', async () => {
  const urls: string[] = [];
  const client: JsonClient = { json: async url => { urls.push(url); return [hourly(40.7, -74), hourly(41, -75)]; } };
  const result = await createWeatherProvider(client).forecast([sample(-74.00001, 40.70001), sample(-74.00002, 40.70002), sample(-75, 41)]);
  assert.equal(urls.length, 1);
  assert.match(urls[0], /latitude=40.7%2C41/);
  assert.equal(result.status.state, 'available');
  assert.deepEqual(result.value.map(value => value?.temperatureC), [4, 4, 4]);
  assert.equal(result.value[0]?.time, '2026-09-09T12:20:00.000Z');
});

test('uses preceding-hour aggregates and closest instantaneous conditions at arrival', async () => {
  const client: JsonClient = { json: async () => hourly(40, -74) };
  const result = await createWeatherProvider(client).forecast([sample(-74, 40, '2026-09-09T13:20:00Z')]);
  assert.equal(result.value[0]?.time, '2026-09-09T13:20:00.000Z');
  assert.equal(result.value[0]?.temperatureC, 5, '13:00 is closest instantaneous timestamp');
  assert.equal(result.value[0]?.precipitationMm, 7.5, '14:00 labels precipitation for 13:00-14:00');
  assert.equal(result.value[0]?.snowfallCm, 1);
  assert.equal(result.value[0]?.gustKmh, 45);
});

test('uses no nearest forecast outside the hourly horizon and preserves partial batch failures', async () => {
  let calls = 0;
  const client: JsonClient = { json: async () => {
    calls++;
    if (calls === 2) throw new Error('timeout');
    return Array.from({ length: 32 }, (_, index) => hourly(index, index));
  } };
  const many = Array.from({ length: 33 }, (_, index) => sample(index, index, index === 0 ? '2026-09-20T12:00:00Z' : '2026-09-09T12:01:00Z'));
  const result = await createWeatherProvider(client).forecast(many);
  assert.equal(calls, 2);
  assert.equal(result.status.state, 'partial');
  assert.equal(result.value[0], null);
  assert.equal(result.value[1]?.time, '2026-09-09T12:01:00.000Z');
  assert.equal(result.value.at(-1), null);
});

test('limits independent forecast batches to two concurrent requests', async () => {
  let active = 0;
  let maximumActive = 0;
  const client: JsonClient = { json: async url => {
    active++;
    maximumActive = Math.max(maximumActive, active);
    const parsed = new URL(url);
    const latitudes = parsed.searchParams.get('latitude')!.split(',').map(Number);
    const longitudes = parsed.searchParams.get('longitude')!.split(',').map(Number);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    return latitudes.map((latitude, index) => hourly(latitude, longitudes[index]));
  } };
  const result = await createWeatherProvider(client).forecast(Array.from({ length: 65 }, (_, index) => sample(index, index)));
  assert.equal(maximumActive, 2);
  assert.equal(result.status.state, 'available');
});

test('rejects bad response order and units, but retains valid fields from a partial row', async () => {
  const client: JsonClient = { json: async () => [
    hourly(41, -74),
    hourly(41, -75, { precipitation: [0, Number.NaN, 0], wind_gusts_10m: [30, -1, 45], visibility: [-1, 9000, 10000] }),
    { ...hourly(42, -76), hourly_units: { ...hourly(42, -76).hourly_units, temperature_2m: '°F' } },
  ] };
  const result = await createWeatherProvider(client).forecast([sample(-74, 40), sample(-75, 41), sample(-76, 42)]);
  assert.equal(result.status.state, 'partial');
  assert.equal(result.value[0], null, 'coordinate order mismatch cannot be trusted');
  assert.equal(result.value[1]?.precipitationMm, null);
  assert.equal(result.value[1]?.gustKmh, null);
  assert.equal(result.value[1]?.visibilityM, null);
  assert.equal(result.value[2], null, 'a declared wrong unit invalidates the row');
});

test('invalid timestamps are aligned as null and oversized requests are rejected', async () => {
  let calls = 0;
  const client: JsonClient = { json: async () => { calls++; return hourly(40, -74); } };
  const provider = createWeatherProvider(client);
  const result = await provider.forecast([sample(-74, 40), { coordinate: [200, 0], distanceKm: 0, arrivalTime: '2026-09-09T12:00:00Z' }, sample(-73, 40, '2026-09-09T12:99:00Z'), sample(-73, 40, '2026-02-30T12:00:00Z')]);
  assert.equal(calls, 1);
  assert.deepEqual(result.value.map(value => value === null), [false, true, true, true]);
  assert.equal(result.status.state, 'partial');
  await assert.rejects(() => provider.forecast(Array.from({ length: 193 }, () => sample(-74, 40))), /at most 192/);
});

test('never uses a nearest row beyond the returned forecast horizon', async () => {
  const urls: string[] = [];
  const client: JsonClient = { json: async url => { urls.push(url); return hourly(40, -74); } };
  const result = await createWeatherProvider(client).forecast([sample(-74, 40, '2026-09-09T14:20:00Z')]);
  assert.equal(result.value[0], null);
  assert.equal(result.status.state, 'unavailable');
  assert.doesNotMatch(urls[0], /past_days/);
});

test('keeps a safe rate-limit reason when a forecast batch fails beside usable data', async () => {
  let calls = 0;
  const client: JsonClient = { json: async () => {
    calls++;
    if (calls === 2) throw new ProviderError('rate-limited', 'https://private.example/?token=secret');
    return Array.from({ length: 32 }, (_, index) => hourly(index, index));
  } };
  const result = await createWeatherProvider(client).forecast(Array.from({ length: 33 }, (_, index) => sample(index, index)));
  assert.equal(result.status.state, 'partial');
  assert.match(result.status.detail, /temporarily rate limited/i);
  assert.doesNotMatch(result.status.detail, /private\.example|secret/);
  assert.equal(result.value.filter(Boolean).length, 32);
});

test('a total forecast outage keeps values unknown and distinguishes safe failure reasons', async () => {
  for (const [code,message,reason] of [
    ['rate-limited','upstream quota','rate limited'],
    ['unavailable','The data provider timed out.','timed out'],
    ['unavailable','upstream HTTP 503','unavailable'],
    ['invalid-response','private provider body','unusable'],
  ] as const) {
    const client: JsonClient={json:async()=>{throw new ProviderError(code,message);}};
    const result=await createWeatherProvider(client).forecast([sample(0,0)]);
    assert.deepEqual(result.value,[null]);assert.equal(result.status.state,'unavailable');
    assert.ok(result.status.detail.includes(reason));
    assert.doesNotMatch(result.status.detail,/private provider body|upstream/);
  }
});

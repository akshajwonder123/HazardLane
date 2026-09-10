import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoadProvider } from '../server/providers/roads';
import type { JsonClient } from '../server/contracts';
import type { DrivingRoute, Sample } from '../lib/domain';

const route: DrivingRoute = { id: 'r', name: 'R', coordinates: [[-77, 38.9], [-76.99, 38.9]], distanceKm: .87, durationSeconds: 120, provider: 'test', maneuvers: [] };
const sample = (lon: number, lat = 38.9, distanceKm = 0): Sample => ({ coordinate: [lon, lat], distanceKm, arrivalTime: '2026-09-09T12:00:00Z' });
const way = (coordinates: number[][], tags: Record<string, unknown> = { highway: 'primary', bridge: 'yes', surface: 'asphalt' }) => ({ type: 'way', tags, geometry: coordinates.map(([lon, lat]) => ({ lon, lat })) });
const response = (...elements: unknown[]) => ({ elements });

test('uses one bounded POST query with at most twelve spread, deduplicated locations', async () => {
  const calls: Array<{ url: string; options: { body?: string; method?: string; timeoutMs?: number; maxBytes?: number; ttlMs?: number } }> = [];
  const client: JsonClient = { json: async (url, options) => { calls.push({ url, options }); return response(way([[-77.001, 38.9], [-76.98, 38.9]])); } };
  const samples = Array.from({ length: 30 }, (_, index) => sample(-77 + index / 3000, 38.9, index / 30)); samples.push(sample(-77, 38.9, 0));
  await createRoadProvider(client, 'https://overpass.example').attributes(route, samples);
  assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://overpass.example/api/interpreter'); assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.timeoutMs, 8_000); assert.equal(calls[0].options.maxBytes, 2 * 1024 * 1024); assert.equal(calls[0].options.ttlMs, 86_400_000);
  const data = new URLSearchParams(calls[0].options.body).get('data')!;
  const areas = data.match(/way\(around:60[^)]*\)/g) ?? [];
  assert.ok(areas.length > 0 && areas.length <= 12); assert.equal(new Set(areas).size, areas.length);
  assert.match(data, /\[timeout:8\]\[maxsize:2097152\]/); assert.match(data, /highway!~/);
});

test('matches only a nearby, direction-consistent road segment', async () => {
  const client: JsonClient = { json: async () => response(way([[-77, 38.90008], [-76.99, 38.90008]], { highway: 'primary', lanes: '2', operator: 'not allowed' })) };
  const result = await createRoadProvider(client).attributes(route, [sample(-76.995, 38.9, .44)]);
  assert.equal(result.status.state, 'partial'); assert.deepEqual(result.value[0], { highway: 'primary', lanes: '2' });
});

test('rejects close perpendicular bridge geometry rather than smearing bridge tags', async () => {
  const client: JsonClient = { json: async () => response(way([[-76.995, 38.8998], [-76.995, 38.9002]])) };
  const result = await createRoadProvider(client).attributes(route, [sample(-76.995, 38.9, .44)]);
  assert.equal(result.value[0], null); assert.equal(result.status.state, 'unavailable');
});

test('returns null for ambiguous parallel roads with differing relevant tags', async () => {
  const client: JsonClient = { json: async () => response(way([[-77, 38.90002], [-76.99, 38.90002]], { highway: 'primary', bridge: 'yes' }), way([[-77, 38.89998], [-76.99, 38.89998]], { highway: 'primary', bridge: 'no' })) };
  const result = await createRoadProvider(client).attributes(route, [sample(-76.995, 38.9, .44)]);
  assert.equal(result.value[0], null); assert.equal(result.status.state, 'unavailable');
});

test('keeps unknown tags absent and reports provider failures as unavailable', async () => {
  const known: JsonClient = { json: async () => response(way([[-77, 38.9], [-76.99, 38.9]], { highway: 'residential', weird: 'value' })) };
  const attrs = await createRoadProvider(known).attributes(route, [sample(-76.995, 38.9, .44)]);
  assert.deepEqual(attrs.value[0], { highway: 'residential' });
  const failed: JsonClient = { json: async () => { throw new Error('down'); } };
  const unavailable = await createRoadProvider(failed).attributes(route, [sample(-76.995, 38.9, .44)]);
  assert.deepEqual(unavailable.value, [null]); assert.equal(unavailable.status.state, 'unavailable');
});

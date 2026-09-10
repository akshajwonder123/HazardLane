import assert from 'node:assert/strict';
import test from 'node:test';
import { createGeocoder, createRouter } from '../server/providers/routing';
import { ProviderError, type JsonClient } from '../server/contracts';

function client(payload: unknown): JsonClient & { calls: { url: string; options: unknown }[] } {
  const calls: { url: string; options: unknown }[] = [];
  return { calls, async json(url, options) { calls.push({ url, options }); return payload; } };
}
function polyline6(points: [number, number][]): string {
  let lastLat = 0; let lastLon = 0; let output = '';
  for (const [lon, lat] of points) for (const [next, last, set] of [[Math.round(lat * 1e6), lastLat, (n:number) => { lastLat = n; }], [Math.round(lon * 1e6), lastLon, (n:number) => { lastLon = n; }]] as const) {
    let value = (next - last) << 1; if (next - last < 0) value = ~value;
    while (value >= 0x20) { output += String.fromCharCode((0x20 | (value & 0x1f)) + 63); value >>= 5; }
    output += String.fromCharCode(value + 63); set(next);
  }
  return output;
}
const origin = { id: 'a', label: 'A', lat: 38.9, lon: -77.0 };
const destination = { id: 'b', label: 'B', lat: 39.2, lon: -76.6 };
function valhalla(primary: unknown, alternatives: unknown[] = []) { return { trip: primary, alternates: alternatives.map(trip => ({ trip })) }; }
function route(points: [number, number][], length = 60, time = 3600) { return { summary: { length, time }, legs: [{ shape: polyline6(points), maneuvers: [{ begin_shape_index: 0, end_shape_index: 1, street_names: ['Main Street'] }] }] }; }

test('Photon normalizes valid autocomplete features and bounds the request', async () => {
  const http = client({ features: [{ geometry: { type: 'Point', coordinates: [-77.0369, 38.9072] }, properties: { name: 'Washington', state: 'District of Columbia', country: 'United States', countrycode: 'us', osm_type: 'N', osm_id: 5391959 } }, { geometry: { type: 'Point', coordinates: [999, 20] }, properties: { name: 'Bad' } }] });
  const locations = await createGeocoder(http, 'https://geocode.example.test').search(' Washington  DC ');
  assert.deepEqual(locations, [{ id: 'photon:N:5391959', label: 'Washington, District of Columbia, United States', lon: -77.0369, lat: 38.9072, countryCode: 'US' }]);
  assert.equal(http.calls[0].url, 'https://geocode.example.test/api?q=Washington+DC&limit=6&lang=en');
  assert.deepEqual(http.calls[0].options, { ttlMs: 86400000, timeoutMs: 5000, maxBytes: 524288 });
});

test('Photon accepts malformed or empty feature lists safely', async () => {
  assert.deepEqual(await createGeocoder(client({ features: [{ geometry: { type: 'LineString', coordinates: [] }, properties: {} }] })).search('ok'), []);
  await assert.rejects(() => createGeocoder(client({ nope: [] })).search('ok'), (error: unknown) => error instanceof ProviderError && error.code === 'invalid-response');
});

test('Valhalla decodes polyline6 and maps maneuvers to geometry indexes', async () => {
  const http = client(valhalla(route([[-77, 38.9], [-76.8, 39.0], [-76.6, 39.2]])));
  const routes = await createRouter(http, 'https://route.example.test').routes(origin, destination);
  assert.equal(routes[0].coordinates.length, 3); assert.deepEqual(routes[0].coordinates[1], [-76.8, 39]);
  assert.deepEqual(routes[0].maneuvers, [{ startIndex: 0, endIndex: 1, name: 'Main Street' }]);
  const options = http.calls[0].options as { body: string };
  assert.deepEqual(JSON.parse(options.body).costing_options.auto.speed_types, ['freeflow', 'constrained']);
  assert.equal(http.calls[0].url, 'https://route.example.test/route');
});

test('Valhalla keeps only distinct routes and caps alternatives at two', async () => {
  const standard = [[-77, 38.9], [-76.8, 39], [-76.6, 39.2]] as [number, number][];
  const routes = await createRouter(client(valhalla(route(standard), [route(standard), route([[-77, 38.9], [-76.9, 39.3], [-76.6, 39.2]], 70), route([[-77, 38.9], [-76.7, 38.85], [-76.6, 39.2]], 80)]) )).routes(origin, destination);
  assert.equal(routes.length, 3); assert.deepEqual(routes.map(item => item.name), ['Standard route', 'Alternate route 1', 'Alternate route 2']);
});

test('Valhalla distinguishes no route from malformed upstream results', async () => {
  await assert.rejects(() => createRouter(client({ trip: { status: 171, status_message: 'No path could be found' } })).routes(origin, destination), (error: unknown) => error instanceof ProviderError && error.code === 'no-route');
  await assert.rejects(() => createRouter(client(valhalla({ summary: { length: 1, time: 1 }, legs: [{ shape: '!' }] }, [route([[-77, 38.9], [-76.6, 39.2]])]))).routes(origin, destination), (error: unknown) => error instanceof ProviderError && error.code === 'invalid-response');
});

test('Valhalla preserves short local detours that can avoid a narrow hazard', async () => {
  const standard: [number, number][] = [[-94, 41], [-93, 41]];
  const detour: [number, number][] = [[-94, 41], [-93.81, 41], [-93.8, 41.01], [-93.79, 41], [-93, 41]];
  const result = await createRouter(client(valhalla(route(standard), [route(detour)]))).routes(origin, destination);
  assert.equal(result.length, 2);
  assert.deepEqual(result[1].coordinates, detour);
});

test('Valhalla compares every bend even when alternate lengths are equal', async () => {
  const north: [number, number][] = [[-94, 0], [-93.81, 0], [-93.8, 0.01], [-93.79, 0], [-93, 0]];
  const south: [number, number][] = north.map(([lon, lat]) => [lon, -lat]);
  const result = await createRouter(client(valhalla(route(north), [route(south)]))).routes(origin, destination);
  assert.equal(result.length, 2);
});

test('Valhalla removes identical paths with extra or repeated vertices, including the dateline', async () => {
  for (const [standard, dense] of [
    [[[-94, 0], [-93, 0]], [[-94, 0], [-94, 0], [-93.5, 0], [-93, 0]]],
    [[[179, 0], [-179, 0]], [[179, 0], [180, 0], [-179, 0]]],
  ] as [number, number][][][]) {
    const result = await createRouter(client(valhalla(route(standard), [route(dense)]))).routes(origin, destination);
    assert.equal(result.length, 1);
  }
});

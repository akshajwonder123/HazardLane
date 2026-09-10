import assert from 'node:assert/strict';
import test from 'node:test';
import { createAlertProvider } from '../server/providers/alerts';
import type { JsonClient } from '../server/contracts';
import type { DrivingRoute } from '../lib/domain';

const route: DrivingRoute = { id: 'r', name: 'Route', coordinates: [[0, 0], [2, 0]], distanceKm: 222, durationSeconds: 7200, provider: 'test', maneuvers: [] };
const polygon = (west: number, east: number) => ({ type: 'Polygon', coordinates: [[[west, -1], [east, -1], [east, 1], [west, 1], [west, -1]]] });
const alert = (overrides: Record<string, unknown> = {}) => ({ id: 'alert-1', properties: { event: 'Flash Flood Warning', headline: 'Flooding', severity: 'Severe', onset: '2026-09-09T10:00:00Z', expires: '2026-09-09T20:00:00Z', '@id': 'https://api.weather.gov/alerts/alert-1', ...overrides }, geometry: polygon(.9, 1.1) });
const active = (...items: unknown[]) => ({ updated: '2026-09-09T12:00:00Z', features: items });

test('uses exact polygon intersections, including narrow alerts between samples', async () => {
  const client: JsonClient = { json: async () => active(alert()) };
  const result = await createAlertProvider(client, 'https://nws.example', 'https://gis.example', () => Date.parse('2026-09-09T12:00:00Z')).alerts(route);
  assert.equal(result.status.state, 'available');
  assert.equal(result.value.length, 1);
  assert.equal(result.value[0].event, 'Flash Flood Warning');
});

test('resolves null geometry through conservative county zones', async () => {
  const calls: string[] = [];
  const nullAlert = alert({ affectedZones: ['https://api.weather.gov/zones/county/DCC001'] }); delete (nullAlert as { geometry?: unknown }).geometry;
  const client: JsonClient = { json: async url => {
    calls.push(url);
    if (url.includes('/alerts/active')) return active(nullAlert);
    if (url.includes('/2/query')) return { features: [{ attributes: { state: 'DC', fips: '11001' } }] };
    if (url.includes('/8/query')) return { features: [] };
    if (url.includes('/zones/county/DCC001')) return { id: 'DCC001', properties: {}, geometry: polygon(.9, 1.1) };
    throw new Error('unexpected URL');
  } };
  const result = await createAlertProvider(client, 'https://nws.example', 'https://gis.example', () => Date.parse('2026-09-09T12:00:00Z')).alerts(route);
  assert.equal(result.status.state, 'available');
  assert.equal(result.value[0]?.id, 'alert-1:DCC001');
  assert.ok(calls.some(url => url.includes('geometryType=esriGeometryEnvelope')));
});

test('supports county watches and rejects arbitrary affected-zone URLs', async () => {
  const county = alert({ event: 'Tornado Watch', affectedZones: ['https://evil.example/zones/county/DCC001?next=https://evil.example', 'https://api.weather.gov/zones/county/DCC001'] }); delete (county as { geometry?: unknown }).geometry;
  const urls: string[] = [];
  const client: JsonClient = { json: async url => {
    urls.push(url);
    if (url.includes('/alerts/active')) return active(county);
    if (url.includes('/2/query')) return { features: [{ attributes: { state: 'DC', fips: '11001' } }] };
    if (url.includes('/8/query')) return { features: [] };
    if (url.includes('/zones/county/DCC001')) return { id: 'DCC001', properties: {}, geometry: polygon(.9, 1.1) };
    throw new Error('bad request');
  } };
  const result = await createAlertProvider(client, 'https://nws.example', 'https://gis.example', () => Date.parse('2026-09-09T12:00:00Z')).alerts(route);
  assert.equal(result.value[0]?.event, 'Tornado Watch');
  assert.ok(urls.every(url => !url.includes('evil.example')));
});

test('filters expired alerts and reports zone failures or truncated GIS as partial', async () => {
  const expired = alert({ expires: '2026-09-09T11:00:00Z' });
  const unresolved = alert({ id: 'unresolved', affectedZones: ['https://api.weather.gov/zones/forecast/DCZ001'] }); delete (unresolved as { geometry?: unknown }).geometry;
  const client: JsonClient = { json: async url => {
    if (url.includes('/alerts/active')) return active(expired, unresolved);
    if (url.includes('/2/query')) return { features: [], exceededTransferLimit: true };
    if (url.includes('/8/query')) return { features: [{ attributes: { state: 'DC', zone: '001' } }] };
    throw new Error('zone down');
  } };
  const result = await createAlertProvider(client, 'https://nws.example', 'https://gis.example', () => Date.parse('2026-09-09T12:00:00Z')).alerts(route);
  assert.equal(result.value.length, 0);
  assert.equal(result.status.state, 'partial');
});

test('uses geocode UGC fallback and marks stale or malformed active data partial', async () => {
  const zoneOnly = alert({ geocode: { UGC: ['DCZ001'] } }); delete (zoneOnly as { geometry?: unknown }).geometry;
  const client: JsonClient = { json: async url => {
    if (url.includes('/alerts/active')) return { updated: '2026-09-09T11:40:00Z', features: [zoneOnly, { malformed: true }] };
    if (url.includes('/2/query')) return { features: [] };
    if (url.includes('/8/query')) return { features: [{ attributes: { state: 'DC', zone: '001', state_zone: 'DC001' } }] };
    if (url.includes('/zones/forecast/DCZ001')) return { id: 'DCZ001', properties: {}, geometry: polygon(.9, 1.1) };
    throw new Error('unexpected URL');
  } };
  const result = await createAlertProvider(client, 'https://nws.example', 'https://gis.example', () => Date.parse('2026-09-09T12:00:00Z')).alerts(route);
  assert.equal(result.value[0]?.id, 'alert-1:DCZ001');
  assert.equal(result.status.state, 'partial');
});

test('keeps a relevant alert with a missing expiry conservatively but marks confidence partial', async () => {
  const noExpiry = alert({ expires: 'not-a-time', '@id': 'javascript:alert(1)' });
  const client: JsonClient = { json: async () => active(noExpiry) };
  const result = await createAlertProvider(client, 'https://nws.example', 'https://gis.example', () => Date.parse('2026-09-09T12:00:00Z')).alerts(route);
  assert.equal(result.value.length, 1);
  assert.equal(result.value[0].url, 'https://www.weather.gov');
  assert.equal(result.status.state, 'partial');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { areaIntervals, haversine, pointInArea, pointAt, routeDistances, sampleRoute, sliceGeometry } from '../lib/geometry';
import type { AreaGeometry, DrivingRoute } from '../lib/domain';

const curved: [[number, number], [number, number], [number, number]] = [[-73.99, 40.75], [-73.98, 40.76], [-73.95, 40.76]];
const route: DrivingRoute = { id: 'r', name: 'r', coordinates: curved, distanceKm: 10, durationSeconds: 3600, provider: 'test', maneuvers: [] };

test('distances retain non-uniform geometry and scale to provider distance', () => {
  assert.ok(haversine(curved[0], curved[1]) > 1);
  const distances = routeDistances(curved, 10);
  assert.equal(distances[0], 0);
  assert.equal(distances.at(-1), 10);
  assert.ok(distances[1] < 4, 'first short bend must not be treated as half the route');
  assert.deepEqual(pointAt(curved, distances, 0), curved[0]);
  assert.deepEqual(pointAt(curved, distances, 10), curved[2]);
});

test('slice has interpolated exact endpoints and preserves interior vertices', () => {
  const distances = routeDistances(curved, 10);
  const slice = sliceGeometry(curved, distances, 1, 8);
  assert.equal(slice.length, 3);
  assert.deepEqual(slice[1], curved[1]);
  assert.ok(Math.abs(haversine(slice[0], curved[0]) - (1 / 10) * (haversine(curved[0], curved[1]) + haversine(curved[1], curved[2]))) < 0.03);
  assert.ok(slice[2][0] < curved[2][0]);
});

test('sampling includes endpoints, follows route duration, and respects caps', () => {
  const samples = sampleRoute(route, '2026-09-09T12:00:00Z', 4);
  assert.equal(samples.length, 4);
  assert.deepEqual(samples[0].coordinate, curved[0]);
  assert.deepEqual(samples.at(-1)?.coordinate, curved[2]);
  assert.equal(samples.at(-1)?.arrivalTime, '2026-09-09T13:00:00.000Z');
  assert.equal(sampleRoute(route, 'not-a-date').length, 0);
  assert.equal(sampleRoute(route, '2026-09-09T12:00:00Z', 1).length, 0);
});

test('duplicate and zero-length geometry are handled without artificial samples', () => {
  const duplicate = [[0, 0], [0, 0], [0, 0]] as [[number, number], [number, number], [number, number]];
  assert.deepEqual(routeDistances(duplicate), [0, 0, 0]);
  assert.equal(sampleRoute({ ...route, coordinates: duplicate, distanceKm: 0 }, '2026-09-09T12:00:00Z').length, 1);
  assert.deepEqual(routeDistances([[200, 0] as [number, number]]), []);
});

test('invalid distance arrays are rejected instead of producing arbitrary geometry', () => {
  assert.deepEqual(pointAt([[0, 0], [1, 0]], [1, 2], 1), [Number.NaN, Number.NaN]);
  assert.deepEqual(sliceGeometry([[0, 0], [1, 0]], [0, 3, 2], 1, 2), []);
  assert.deepEqual(areaIntervals([[0, 0], [1, 0]], [0, 2, 1], { type: 'Polygon', coordinates: [] }), []);
});

test('area intervals find a narrow crossing between samples and preserve holes', () => {
  const line: [[number, number], [number, number]] = [[0, 0], [10, 0]];
  const distances = [0, 100];
  const narrow: AreaGeometry = { type: 'Polygon', coordinates: [[[4.9, -1], [5.1, -1], [5.1, 1], [4.9, 1], [4.9, -1]]] };
  const crossing = areaIntervals(line, distances, narrow);
  assert.equal(crossing.length, 1);
  assert.ok(Math.abs(crossing[0].startKm - 49) < 0.001);
  assert.ok(Math.abs(crossing[0].endKm - 51) < 0.001);
  const withHole: AreaGeometry = { type: 'Polygon', coordinates: [
    [[2, -1], [8, -1], [8, 1], [2, 1], [2, -1]],
    [[4, -1], [6, -1], [6, 1], [4, 1], [4, -1]],
  ] };
  const holeIntervals = areaIntervals(line, distances, withHole);
  assert.equal(holeIntervals.length, 2);
  assert.ok(Math.abs(holeIntervals[0].startKm - 20) < 1e-6 && Math.abs(holeIntervals[0].endKm - 40) < 1e-6);
  assert.ok(Math.abs(holeIntervals[1].startKm - 60) < 1e-6 && Math.abs(holeIntervals[1].endKm - 80) < 1e-6);
  assert.equal(pointInArea([3, 0], withHole), true);
  assert.equal(pointInArea([5, 0], withHole), false);
  assert.deepEqual(areaIntervals(line, distances, { type: 'Polygon', coordinates: [[[20, 0], [21, 0], [21, 1], [20, 0]]] }), []);
});

test('area validation supports multipolygons and practical antimeridian crossings', () => {
  const malformed = { type: 'Polygon', coordinates: [[], [[-1, -1], [1, -1], [1, 1], [-1, -1]]] } as unknown as AreaGeometry;
  assert.equal(pointInArea([0, 0], malformed), false, 'a valid hole cannot become an exterior ring');
  const multi: AreaGeometry = { type: 'MultiPolygon', coordinates: [
    [[[0, -1], [1, -1], [1, 1], [0, 1], [0, -1]]],
    [[[3, -1], [4, -1], [4, 1], [3, 1], [3, -1]]],
  ] };
  assert.equal(pointInArea([3.5, 0], multi), true);
  const dateline: AreaGeometry = { type: 'Polygon', coordinates: [[[179.5, -1], [-179.5, -1], [-179.5, 1], [179.5, 1], [179.5, -1]]] };
  const intervals = areaIntervals([[179, 0], [-179, 0]], [0, 100], dateline);
  assert.equal(intervals.length, 1);
  assert.ok(Math.abs(intervals[0].startKm - 25) < 1e-6 && Math.abs(intervals[0].endKm - 75) < 1e-6);
});

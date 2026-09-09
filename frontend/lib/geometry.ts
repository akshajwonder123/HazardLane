import type { AreaGeometry, Coordinate, DrivingRoute, Sample } from './domain';

const EARTH_RADIUS_KM = 6371.0088;
const EPSILON = 1e-9;

/** Coordinates use GeoJSON order: [longitude, latitude]. Invalid input returns NaN or an empty result. */
function validCoordinate(value: Coordinate | undefined): value is Coordinate {
  return !!value && Number.isFinite(value[0]) && Number.isFinite(value[1]) &&
    value[0] >= -180 && value[0] <= 180 && value[1] >= -90 && value[1] <= 90;
}

function validDistances(distances: number[]): boolean {
  return distances.length > 0 && distances[0] === 0 && distances.every(Number.isFinite) &&
    distances.every((distance, index) => index === 0 || distance >= distances[index - 1]);
}

const radians = (degrees: number) => degrees * Math.PI / 180;

export function haversine(a: Coordinate, b: Coordinate): number {
  if (!validCoordinate(a) || !validCoordinate(b)) return Number.NaN;
  const dLat = radians(b[1] - a[1]);
  const dLon = radians((((b[0] - a[0]) + 540) % 360) - 180);
  const q = Math.max(0, Math.min(1, Math.sin(dLat / 2) ** 2 + Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(dLon / 2) ** 2));
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}

export function routeDistances(coords: Coordinate[], totalKm?: number): number[] {
  if (!Array.isArray(coords) || coords.length === 0 || !coords.every(validCoordinate) ||
    (totalKm !== undefined && (!Number.isFinite(totalKm) || totalKm < 0))) return [];
  const values = [0];
  for (let index = 1; index < coords.length; index++) values.push(values[index - 1] + haversine(coords[index - 1], coords[index]));
  const geometricTotal = values[values.length - 1];
  if (totalKm !== undefined && geometricTotal > EPSILON) return values.map(value => value * totalKm / geometricTotal);
  return values;
}

function interpolate(a: Coordinate, b: Coordinate, fraction: number): Coordinate {
  const lonDelta = (((b[0] - a[0]) + 540) % 360) - 180;
  let lon = a[0] + lonDelta * fraction;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return [lon, a[1] + (b[1] - a[1]) * fraction];
}

export function pointAt(coords: Coordinate[], distances: number[], distanceKm: number): Coordinate {
  if (coords.length === 0 || coords.length !== distances.length || !coords.every(validCoordinate) ||
    !validDistances(distances) || !Number.isFinite(distanceKm)) return [Number.NaN, Number.NaN];
  if (distanceKm <= distances[0]) return [...coords[0]] as Coordinate;
  const final = distances.length - 1;
  if (distanceKm >= distances[final]) return [...coords[final]] as Coordinate;
  for (let index = 1; index < distances.length; index++) {
    if (distanceKm <= distances[index]) {
      const span = distances[index] - distances[index - 1];
      if (span <= EPSILON) return [...coords[index]] as Coordinate;
      return interpolate(coords[index - 1], coords[index], (distanceKm - distances[index - 1]) / span);
    }
  }
  return [...coords[final]] as Coordinate;
}

export function sliceGeometry(coords: Coordinate[], distances: number[], startKm: number, endKm: number): Coordinate[] {
  if (coords.length === 0 || coords.length !== distances.length || !coords.every(validCoordinate) ||
    !validDistances(distances) || !Number.isFinite(startKm) || !Number.isFinite(endKm) || endKm < startKm) return [];
  const start = Math.max(distances[0], startKm);
  const end = Math.min(distances[distances.length - 1], endKm);
  if (end < start - EPSILON) return [];
  const result: Coordinate[] = [pointAt(coords, distances, start)];
  for (let index = 1; index < coords.length - 1; index++) {
    if (distances[index] > start + EPSILON && distances[index] < end - EPSILON) result.push([...coords[index]] as Coordinate);
  }
  if (end > start + EPSILON) result.push(pointAt(coords, distances, end));
  return result;
}

export function sampleRoute(route: DrivingRoute, departureTime: string, maxSamples = 64): Sample[] {
  if (!Number.isInteger(maxSamples) || maxSamples < 2 || !Number.isFinite(route.durationSeconds) || route.durationSeconds < 0 ||
    !Number.isFinite(route.distanceKm) || route.distanceKm < 0) return [];
  const departure = new Date(departureTime);
  if (!Number.isFinite(departure.getTime())) return [];
  const distances = routeDistances(route.coordinates, route.distanceKm);
  if (distances.length === 0) return [];
  const total = distances[distances.length - 1];
  if (total <= EPSILON) return [{ coordinate: [...route.coordinates[0]] as Coordinate, distanceKm: 0, arrivalTime: departure.toISOString() }];
  // About 2 km spacing captures local changes; the cap controls upstream batch size.
  const count = Math.min(maxSamples, Math.max(4, Math.ceil(total / 2) + 1));
  return Array.from({ length: count }, (_, index) => {
    const distanceKm = index === count - 1 ? total : total * index / (count - 1);
    return {
      coordinate: pointAt(route.coordinates, distances, distanceKm), distanceKm,
      arrivalTime: new Date(departure.getTime() + route.durationSeconds * 1000 * distanceKm / total).toISOString(),
    };
  });
}

function unwrap(lon: number, reference: number): number {
  return lon + 360 * Math.round((reference - lon) / 360);
}

function normalizedRing(ring: Coordinate[], referenceLon: number): Array<[number, number]> {
  if (!Array.isArray(ring) || ring.length === 0 || !ring.every(validCoordinate)) return [];
  const result: Array<[number, number]> = [];
  let prior = unwrap(ring[0][0], referenceLon);
  result.push([prior, ring[0][1]]);
  for (let index = 1; index < ring.length; index++) {
    prior = unwrap(ring[index][0], prior);
    result.push([prior, ring[index][1]]);
  }
  return result;
}

function onSegment(point: [number, number], a: [number, number], b: [number, number]): boolean {
  const cross = (point[0] - a[0]) * (b[1] - a[1]) - (point[1] - a[1]) * (b[0] - a[0]);
  return Math.abs(cross) < EPSILON && point[0] >= Math.min(a[0], b[0]) - EPSILON && point[0] <= Math.max(a[0], b[0]) + EPSILON &&
    point[1] >= Math.min(a[1], b[1]) - EPSILON && point[1] <= Math.max(a[1], b[1]) + EPSILON;
}

function inRing(point: [number, number], ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (onSegment(point, a, b)) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function polygonContains(point: Coordinate, polygon: Coordinate[][]): boolean {
  if (!validCoordinate(point) || !Array.isArray(polygon) || polygon.length === 0) return false;
  const exterior = normalizedRing(polygon[0], point[0]);
  if (exterior.length < 3 || !inRing([point[0], point[1]], exterior)) return false;
  return !polygon.slice(1).map(ring => normalizedRing(ring, point[0])).filter(ring => ring.length >= 3)
    .some(ring => inRing([point[0], point[1]], ring));
}

export function pointInArea(point: Coordinate, geometry: AreaGeometry): boolean {
  if (!validCoordinate(point) || !geometry || !Array.isArray(geometry.coordinates)) return false;
  return geometry.type === 'Polygon' ? polygonContains(point, geometry.coordinates) :
    geometry.type === 'MultiPolygon' && geometry.coordinates.some(polygon => polygonContains(point, polygon));
}

function edgeCrossingParameters(a: Coordinate, b: Coordinate, c: [number, number], d: [number, number]): number[] {
  const ax = a[0], ay = a[1], bx = unwrap(b[0], ax), by = b[1];
  const rx = bx - ax, ry = by - ay, sx = d[0] - c[0], sy = d[1] - c[1];
  if (Math.max(ax, bx) + EPSILON < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) + EPSILON < Math.min(ax, bx) ||
    Math.max(ay, by) + EPSILON < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) + EPSILON < Math.min(ay, by)) return [];
  const denominator = rx * sy - ry * sx;
  const qpx = c[0] - ax, qpy = c[1] - ay;
  if (Math.abs(denominator) < EPSILON) {
    if (Math.abs(qpx * ry - qpy * rx) >= EPSILON) return [];
    const lengthSquared = rx * rx + ry * ry;
    if (lengthSquared < EPSILON) return [];
    return [((c[0] - ax) * rx + (c[1] - ay) * ry) / lengthSquared, ((d[0] - ax) * rx + (d[1] - ay) * ry) / lengthSquared]
      .filter(t => t >= -EPSILON && t <= 1 + EPSILON).map(t => Math.max(0, Math.min(1, t)));
  }
  const t = (qpx * sy - qpy * sx) / denominator;
  const u = (qpx * ry - qpy * rx) / denominator;
  return t >= -EPSILON && t <= 1 + EPSILON && u >= -EPSILON && u <= 1 + EPSILON ? [Math.max(0, Math.min(1, t))] : [];
}

/** Exact in a local longitude/latitude plane; for very large polar polygons, use a geodesic GIS engine upstream. */
export function areaIntervals(coords: Coordinate[], distances: number[], geometry: AreaGeometry): Array<{ startKm: number; endKm: number }> {
  if (coords.length < 2 || coords.length !== distances.length || !coords.every(validCoordinate) || !validDistances(distances) ||
    !geometry || !Array.isArray(geometry.coordinates)) return [];
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  const intervals: Array<{ startKm: number; endKm: number }> = [];
  for (let index = 1; index < coords.length; index++) {
    const a = coords[index - 1], b = coords[index], length = distances[index] - distances[index - 1];
    if (length <= EPSILON) continue;
    const parameters = [0, 1];
    for (const polygon of polygons) for (const rawRing of polygon) {
      const ring = normalizedRing(rawRing, a[0]);
      for (let edge = 1; edge < ring.length; edge++) parameters.push(...edgeCrossingParameters(a, b, ring[edge - 1], ring[edge]));
    }
    const unique = [...new Set(parameters.map(t => Math.round(t / EPSILON) * EPSILON))].sort((x, y) => x - y);
    for (let p = 1; p < unique.length; p++) {
      const start = unique[p - 1], end = unique[p];
      if (end - start <= EPSILON || !pointInArea(interpolate(a, b, (start + end) / 2), geometry)) continue;
      const startKm = distances[index - 1] + start * length, endKm = distances[index - 1] + end * length;
      const previous = intervals[intervals.length - 1];
      if (previous && Math.abs(previous.endKm - startKm) < 1e-7) previous.endKm = endKm;
      else intervals.push({ startKm, endKm });
    }
  }
  return intervals;
}

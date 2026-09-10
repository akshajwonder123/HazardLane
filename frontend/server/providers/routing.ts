import type { Coordinate, DrivingRoute, Location, Maneuver } from '../../lib/domain';
import type { GeocodingProvider, JsonClient, RoutingProvider } from '../contracts';
import { ProviderError } from '../contracts';

const GEOCODE_OPTIONS = { ttlMs: 24 * 60 * 60 * 1000, timeoutMs: 5_000, maxBytes: 512 * 1024 } as const;
const ROUTE_OPTIONS = { ttlMs: 6 * 60 * 60 * 1000, timeoutMs: 10_000, maxBytes: 2 * 1024 * 1024, method: 'POST' as const };
const MAX_QUERY_LENGTH = 160;
const MAX_GEOMETRY_POINTS = 20_000;
const MAX_DISTANCE_KM = 20_000;
const MAX_DURATION_SECONDS = 7 * 24 * 60 * 60;

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function coordinate(value: unknown): Coordinate | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lon = finite(value[0]); const lat = finite(value[1]);
  return lon === null || lat === null || lon < -180 || lon > 180 || lat < -90 || lat > 90 ? null : [lon, lat];
}

function providerFailure(error: unknown, fallback: string): ProviderError {
  return error instanceof ProviderError ? error : new ProviderError('unavailable', error instanceof Error && error.message ? error.message : fallback);
}

function endpoint(baseUrl: string, path: string): string {
  let url: URL;
  try { url = new URL(baseUrl); } catch { throw new ProviderError('invalid-response', 'Routing provider base URL is invalid.'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ProviderError('invalid-response', 'Routing provider base URL is invalid.');
  url.pathname = `${url.pathname.replace(/\/$/, '')}${path}`;
  return url.toString();
}

function displayName(properties: UnknownRecord): string | null {
  const parts = ['name', 'housenumber', 'street', 'district', 'city', 'county', 'state', 'postcode', 'country']
    .map(key => typeof properties[key] === 'string' ? properties[key].trim() : '')
    .filter((part, index, all) => part && all.indexOf(part) === index);
  return parts.length ? parts.join(', ') : null;
}

/** Photon forward-search adapter. Query URLs are formed here rather than from browser input. */
export function createGeocoder(client: JsonClient, baseUrl = 'https://photon.komoot.io'): GeocodingProvider {
  const api = endpoint(baseUrl, '/api');
  return {
    async search(query: string): Promise<Location[]> {
      const normalized = query.trim().replace(/\s+/g, ' ');
      if (normalized.length < 2 || normalized.length > MAX_QUERY_LENGTH) return [];
      const url = new URL(api); url.searchParams.set('q', normalized); url.searchParams.set('limit', '6'); url.searchParams.set('lang', 'en');
      let payload: unknown;
      try { payload = await client.json(url.toString(), GEOCODE_OPTIONS); } catch (error) { throw providerFailure(error, 'Location search is unavailable.'); }
      const features = record(payload)?.features;
      if (!Array.isArray(features)) throw new ProviderError('invalid-response', 'Location search returned an invalid response.');
      const seen = new Set<string>(); const results: Location[] = [];
      for (const feature of features) {
        if (results.length === 6) break;
        const item = record(feature); const properties = item && record(item.properties); const geometry = item && record(item.geometry);
        const point = geometry && geometry.type === 'Point' ? coordinate(geometry.coordinates) : null;
        const label = properties && displayName(properties);
        if (!point || !label) continue;
        const country = typeof properties.countrycode === 'string' && /^[a-z]{2}$/i.test(properties.countrycode) ? properties.countrycode.toUpperCase() : undefined;
        const sourceId = typeof properties.osm_id === 'number' || typeof properties.osm_id === 'string' ? String(properties.osm_id) : `${point[0].toFixed(6)},${point[1].toFixed(6)}`;
        const sourceType = typeof properties.osm_type === 'string' ? properties.osm_type : 'photon';
        const id = `photon:${sourceType}:${sourceId}`;
        const key = `${point[0].toFixed(5)},${point[1].toFixed(5)}:${label.toLocaleLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key); results.push({ id, label, lon: point[0], lat: point[1], countryCode: country });
      }
      return results;
    }
  };
}

function decodePolyline6(encoded: string): Coordinate[] | null {
  const coordinates: Coordinate[] = []; let index = 0; let lat = 0; let lon = 0;
  while (index < encoded.length) {
    const decode = (): number | null => {
      let result = 0; let shift = 0;
      while (index < encoded.length) {
        const byte = encoded.charCodeAt(index++) - 63;
        if (byte < 0 || byte > 63 || shift > 30) return null;
        result |= (byte & 0x1f) << shift; shift += 5;
        if (byte < 0x20) return (result & 1) ? ~(result >> 1) : result >> 1;
      }
      return null;
    };
    const deltaLat = decode(); const deltaLon = decode();
    if (deltaLat === null || deltaLon === null) return null;
    lat += deltaLat; lon += deltaLon;
    const point: Coordinate = [lon / 1e6, lat / 1e6];
    if (point[0] < -180 || point[0] > 180 || point[1] < -90 || point[1] > 90) return null;
    coordinates.push(point);
    if (coordinates.length > MAX_GEOMETRY_POINTS) return null;
  }
  return coordinates.length >= 2 ? coordinates : null;
}

function nearlySame(a: Coordinate, b: Coordinate): boolean { return Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7; }
function haversineKm(a: Coordinate, b: Coordinate): number {
  const radians = Math.PI / 180; const dLat = (b[1] - a[1]) * radians; const dLon = (b[0] - a[0]) * radians;
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}
function geometriesAreSimilar(a: Coordinate[], b: Coordinate[]): boolean {
  // Only remove effectively identical geometry. A short local deviation can avoid
  // a warning, even when its separation averaged over the whole trip is tiny.
  const cumulative = (points: Coordinate[]) => {
    const distances = [0];
    for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + haversineKm(points[i - 1], points[i]));
    return distances;
  };
  const ad = cumulative(a); const bd = cumulative(b);
  const al = ad[ad.length - 1]; const bl = bd[bd.length - 1];
  const toleranceKm = 0.001;
  if (!al || !bl || Math.abs(al - bl) > toleranceKm) return false;
  let ai = 1; let bi = 1;
  const interpolate = (points: Coordinate[], distances: number[], index: number, target: number): Coordinate => {
    const length = distances[index] - distances[index - 1];
    const ratio = length > 0 ? Math.max(0, Math.min(1, (target - distances[index - 1]) / length)) : 0;
    const start = points[index - 1]; const end = points[index];
    const longitudeDelta = ((end[0] - start[0] + 540) % 360) - 180;
    return [((start[0] + longitudeDelta * ratio + 540) % 360) - 180, start[1] + (end[1] - start[1]) * ratio];
  };
  if (haversineKm(a[0], b[0]) > toleranceKm) return false;
  // Merge both vertex-distance sequences, visiting every local bend in O(n+m).
  while (ai < a.length && bi < b.length) {
    const fraction = Math.min(ad[ai] / al, bd[bi] / bl);
    if (haversineKm(interpolate(a, ad, ai, fraction * al), interpolate(b, bd, bi, fraction * bl)) > toleranceKm) return false;
    const advanceA = ad[ai] / al <= fraction;
    const advanceB = bd[bi] / bl <= fraction;
    if (advanceA) ai++;
    if (advanceB) bi++;
  }
  return true;
}

function maneuverName(raw: UnknownRecord): string {
  const names = raw.street_names;
  if (Array.isArray(names)) {
    const name = names.find(value => typeof value === 'string' && value.trim());
    if (typeof name === 'string') return name.trim();
  }
  return typeof raw.instruction === 'string' && raw.instruction.trim() ? raw.instruction.trim() : 'Unnamed road';
}

function parseRoute(raw: unknown): Omit<DrivingRoute, 'id' | 'name'> | null {
  const route = record(raw); const summary = route && record(route.summary); const legs = route && route.legs;
  const distanceKm = summary && finite(summary.length); const durationSeconds = summary && finite(summary.time);
  if (!route || !Array.isArray(legs) || distanceKm === null || durationSeconds === null || distanceKm <= 0 || distanceKm > MAX_DISTANCE_KM || durationSeconds <= 0 || durationSeconds > MAX_DURATION_SECONDS) return null;
  const coordinates: Coordinate[] = []; const maneuvers: Maneuver[] = [];
  for (const rawLeg of legs) {
    const leg = record(rawLeg); const shape = leg && typeof leg.shape === 'string' ? decodePolyline6(leg.shape) : null;
    if (!leg || !shape) return null;
    const joinsPrevious = coordinates.length > 0 && nearlySame(coordinates[coordinates.length - 1], shape[0]);
    const offset = joinsPrevious ? coordinates.length - 1 : coordinates.length;
    if (joinsPrevious) coordinates.push(...shape.slice(1)); else coordinates.push(...shape);
    const rawManeuvers = leg.maneuvers;
    if (!Array.isArray(rawManeuvers)) continue;
    for (const rawManeuver of rawManeuvers) {
      const maneuver = record(rawManeuver); if (!maneuver) continue;
      const start = finite(maneuver.begin_shape_index); const end = finite(maneuver.end_shape_index);
      if (start === null || end === null || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= shape.length) continue;
      maneuvers.push({ startIndex: offset + start, endIndex: offset + end, name: maneuverName(maneuver) });
    }
  }
  if (coordinates.length < 2 || coordinates.length > MAX_GEOMETRY_POINTS) return null;
  return { coordinates, distanceKm, durationSeconds, provider: 'valhalla', maneuvers };
}

/** Valhalla automobile routing with static/free-flow speed types and at most two distinct alternatives. */
export function createRouter(client: JsonClient, baseUrl = 'https://valhalla1.openstreetmap.de'): RoutingProvider {
  const api = endpoint(baseUrl, '/route');
  return {
    async routes(origin: Location, destination: Location): Promise<DrivingRoute[]> {
      if (![origin, destination].every(location => Number.isFinite(location.lat) && Number.isFinite(location.lon) && location.lat >= -90 && location.lat <= 90 && location.lon >= -180 && location.lon <= 180)) throw new ProviderError('invalid-response', 'Route locations must have valid coordinates.');
      const body = JSON.stringify({ locations: [{ lat: origin.lat, lon: origin.lon }, { lat: destination.lat, lon: destination.lon }], costing: 'auto', alternates: 2, units: 'kilometers', shape_format: 'polyline6', costing_options: { auto: { speed_types: ['freeflow', 'constrained'] } } });
      let payload: unknown;
      try { payload = await client.json(api, { ...ROUTE_OPTIONS, body, headers: { 'content-type': 'application/json' } }); } catch (error) { throw providerFailure(error, 'Routing is unavailable.'); }
      const response = record(payload); const trip: UnknownRecord | null = response ? record(response.trip) : null;
      const errorCode = finite(response?.error_code) ?? finite(trip?.status);
      const errorText = typeof response?.error === 'string' ? response.error : typeof trip?.status_message === 'string' ? trip.status_message : '';
      if (!trip) {
        if (errorCode === 171 || /no (route|path)|could not.*path/i.test(errorText)) throw new ProviderError('no-route', 'No driving route was found between these locations.');
        throw new ProviderError('invalid-response', 'Routing returned an invalid response.');
      }
      if (errorCode === 171 || /no (route|path)|could not.*path/i.test(errorText)) throw new ProviderError('no-route', 'No driving route was found between these locations.');
      const primary = parseRoute(trip);
      // Do not silently promote an alternate when the primary response is malformed.
      if (!primary) throw new ProviderError('invalid-response', 'Routing returned no usable primary road geometry.');
      const routes: DrivingRoute[] = [{ ...primary, id: 'valhalla:1', name: 'Standard route' }];
      const alternatives = Array.isArray(response?.alternates) ? response.alternates : [];
      for (let index = 0; index < alternatives.length && routes.length < 3; index++) {
        const alternateWrapper = record(alternatives[index]); const parsed = alternateWrapper ? parseRoute(alternateWrapper.trip) : null;
        if (parsed && !routes.some(existing => geometriesAreSimilar(existing.coordinates, parsed.coordinates))) {
          const outputIndex = routes.length;
          routes.push({ ...parsed, id: `valhalla:${outputIndex + 1}`, name: `Alternate route ${outputIndex}` });
        }
      }
      return routes;
    }
  };
}

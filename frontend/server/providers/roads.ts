import type { JsonClient, ProviderResult, RoadProvider } from '../contracts';
import type { Coordinate, DrivingRoute, RoadAttributes, Sample } from '../../lib/domain';
import { routeDistances } from '../../lib/geometry';

const ROAD_OPTIONS = { ttlMs: 24 * 60 * 60 * 1000, timeoutMs: 8_000, maxBytes: 2 * 1024 * 1024, method: 'POST' as const, headers: { 'content-type': 'application/x-www-form-urlencoded' } };
const MAX_SAMPLES = 12;
const SEARCH_RADIUS_M = 60;
const MATCH_DISTANCE_M = 20;
const AMBIGUITY_M = 5;
const MIN_DIRECTION_DOT = .85;
const TAGS = ['highway', 'surface', 'smoothness', 'maxspeed', 'lanes', 'bridge', 'tunnel', 'width', 'name'] as const;
const EXCLUDED_HIGHWAYS = 'footway|path|cycleway|bridleway|steps|pedestrian|corridor|construction|proposed|platform|elevator';
type UnknownRecord = Record<string, unknown>;
interface Candidate { tags: RoadAttributes; distanceM: number; directionDot: number }

function record(value: unknown): UnknownRecord | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null; }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function coordinate(value: unknown): Coordinate | null {
  if (!Array.isArray(value) || value.length < 2 || !finite(value[0]) || !finite(value[1]) || value[0] < -180 || value[0] > 180 || value[1] < -90 || value[1] > 90) return null;
  return [value[0], value[1]];
}
function key(point: Coordinate): string { return `${point[0].toFixed(5)},${point[1].toFixed(5)}`; }
function cleanTag(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed && trimmed.length <= 160 ? trimmed : undefined;
}
function attributes(value: unknown): RoadAttributes | null {
  const source = record(value); if (!source) return null;
  const output: RoadAttributes = {};
  for (const tag of TAGS) { const tagValue = cleanTag(source[tag]); if (tagValue) output[tag] = tagValue; }
  return output.highway ? output : null;
}
function endpoint(baseUrl: string): string | null {
  try { const url = new URL(baseUrl); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null; url.pathname = `${url.pathname.replace(/\/$/, '')}/api/interpreter`; return url.toString(); } catch { return null; }
}
function selectedSamples(samples: Sample[]): Array<{ index: number; point: Coordinate }> {
  const valid = samples.map((sample, index) => ({ index, point: coordinate(sample.coordinate) })).filter((item): item is { index: number; point: Coordinate } => !!item.point);
  if (!valid.length) return [];
  const spread = Array.from({ length: Math.min(MAX_SAMPLES, valid.length) }, (_, index) => valid[Math.round(index * (valid.length - 1) / (Math.min(MAX_SAMPLES, valid.length) - 1 || 1))]);
  const seen = new Set<string>();
  return spread.filter(item => { const value = key(item.point); if (seen.has(value)) return false; seen.add(value); return true; });
}
function query(points: Coordinate[]): string {
  const around = points.map(point => `way(around:${SEARCH_RADIUS_M},${point[1].toFixed(5)},${point[0].toFixed(5)})[highway][highway!~\"${EXCLUDED_HIGHWAYS}\"];`).join('');
  return `[out:json][timeout:8][maxsize:2097152];(${around});out tags geom;`;
}
function metres(point: Coordinate, origin: Coordinate): [number, number] {
  const latitude = origin[1] * Math.PI / 180;
  return [(point[0] - origin[0]) * 111_320 * Math.cos(latitude), (point[1] - origin[1]) * 110_574];
}
function segmentMatch(point: Coordinate, a: Coordinate, b: Coordinate): { distanceM: number; tangent: [number, number] } | null {
  const [ax, ay] = metres(a, point), [bx, by] = metres(b, point); const dx = bx - ax, dy = by - ay; const length = Math.hypot(dx, dy);
  if (length < .1) return null;
  const fraction = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (length * length)));
  return { distanceM: Math.hypot(ax + fraction * dx, ay + fraction * dy), tangent: [dx / length, dy / length] };
}
function routeTangent(route: DrivingRoute, sample: Sample): [number, number] | null {
  const distances = routeDistances(route.coordinates, route.distanceKm);
  if (distances.length !== route.coordinates.length || route.coordinates.length < 2) return null;
  const target = Number.isFinite(sample.distanceKm) ? Math.max(0, Math.min(distances.at(-1)!, sample.distanceKm)) : 0;
  let segment = 1; while (segment < distances.length - 1 && distances[segment] < target) segment++;
  const point = coordinate(sample.coordinate); const a = route.coordinates[Math.max(0, segment - 1)], b = route.coordinates[Math.min(route.coordinates.length - 1, segment)];
  if (!point || !a || !b) return null;
  const [x, y] = metres(b, a); const length = Math.hypot(x, y); return length < .1 ? null : [x / length, y / length];
}
function candidates(payload: unknown, point: Coordinate, tangent: [number, number] | null): Candidate[] {
  const elements = record(payload)?.elements; if (!Array.isArray(elements)) return [];
  const output: Candidate[] = [];
  for (const raw of elements) {
    const item = record(raw); const tags = item && attributes(item.tags);
    // Overpass geometry uses {lat, lon} objects, not GeoJSON coordinate arrays.
    const points = item && Array.isArray(item.geometry) ? item.geometry.map(rawPoint => {
      const p = record(rawPoint); return p ? coordinate([p.lon, p.lat]) : null;
    }) : [];
    if (!tags || item?.type !== 'way' || points.length < 2 || points.some(p => p === null) || !tangent || new RegExp(`^(?:${EXCLUDED_HIGHWAYS})$`).test(tags.highway!)) continue;
    const geometry = points as Coordinate[];
    let best: Candidate | null = null;
    for (let index = 1; index < geometry.length; index++) {
      const match = segmentMatch(point, geometry[index - 1], geometry[index]); if (!match || match.distanceM > MATCH_DISTANCE_M) continue;
      const dot = Math.abs(match.tangent[0] * tangent[0] + match.tangent[1] * tangent[1]);
      if (dot < MIN_DIRECTION_DOT || (best && best.distanceM <= match.distanceM)) continue;
      best = { tags, distanceM: match.distanceM, directionDot: dot };
    }
    if (best) output.push(best);
  }
  return output;
}
function signature(tags: RoadAttributes): string { return TAGS.map(tag => `${tag}:${tags[tag] ?? ''}`).join('|'); }
function match(payload: unknown, route: DrivingRoute, sample: Sample): RoadAttributes | null {
  const point = coordinate(sample.coordinate), tangent = routeTangent(route, sample); if (!point || !tangent) return null;
  const nearby = candidates(payload, point, tangent).sort((a, b) => a.distanceM - b.distanceM || b.directionDot - a.directionDot);
  const first = nearby[0]; if (!first) return null;
  if (nearby.some(candidate => candidate !== first && candidate.distanceM - first.distanceM <= AMBIGUITY_M && signature(candidate.tags) !== signature(first.tags))) return null;
  return first.tags;
}

/** Bounded static OSM tags, matched by both proximity and direction. They do not describe current pavement conditions. */
export function createRoadProvider(client: JsonClient, baseUrl = 'https://overpass-api.de'): RoadProvider {
  const api = endpoint(baseUrl);
  return { async attributes(route, samples): Promise<ProviderResult<(RoadAttributes | null)[]>> {
    const value: (RoadAttributes | null)[] = samples.map(() => null);
    const selected = selectedSamples(samples);
    if (!api || !selected.length) return { value, status: { state: 'unavailable', detail: 'Static OSM road metadata is unavailable for this route.' } };
    let payload: unknown;
    try { payload = await client.json(api, { ...ROAD_OPTIONS, body: new URLSearchParams({ data: query(selected.map(item => item.point)) }).toString() }); }
    catch { return { value, status: { state: 'unavailable', detail: 'Static OSM road metadata is unavailable.' } }; }
    const root = record(payload); if (!root || !Array.isArray(root.elements)) return { value, status: { state: 'unavailable', detail: 'Static OSM road metadata returned no usable evidence.' } };
    let matched = 0;
    for (const item of selected) { const found = match(payload, route, samples[item.index]); value[item.index] = found; if (found) matched++; }
    if (!matched) return { value, status: { state: 'unavailable', detail: 'No spatially matched OSM road metadata was available; static OSM tags do not describe pavement conditions.' } };
    return { value, status: { state: 'partial', detail: `Static OSM road metadata matched ${matched} of ${samples.length} route samples; it does not describe pavement conditions.` } };
  } };
}

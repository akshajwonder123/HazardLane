import type { JsonClient, ProviderResult, AlertProvider } from '../contracts';
import type { AreaGeometry, Coordinate, DrivingRoute, WeatherAlert } from '../../lib/domain';
import { areaIntervals, routeDistances } from '../../lib/geometry';
import { ALERT_SCORES } from '../../lib/risk-engine';
import { areaGeometry, isoTime, record, safeText } from '../validation';

const ACTIVE_TTL = 60_000;
const ZONE_TTL = 86_400_000;
const MAX_ZONES = 32;
const GIS_LAYERS = [2, 8] as const;
const UGC = /^[A-Z]{2}[CZ]\d{3}$/;

type Feature = { id: string; properties: Record<string, unknown>; geometry: AreaGeometry | null; hasGeometry: boolean };

function validCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number' &&
    Number.isFinite(value[0]) && Number.isFinite(value[1]) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}

function feature(value: unknown): Feature | null {
  const item = record(value); const properties = item && record(item.properties);
  if (!item || !properties) return null;
  const id = safeText(item.id || properties.id, 200);
  if (!id) return null;
  return { id, properties, geometry: areaGeometry(item.geometry), hasGeometry: item.geometry !== null && item.geometry !== undefined };
}

function features(value: unknown): { items: Feature[]; malformed: boolean } | null {
  const root = record(value);
  if (!root || !Array.isArray(root.features)) return null;
  const parsed = root.features.map(feature);
  return { items: parsed.filter((item): item is Feature => item !== null), malformed: parsed.some(item => item === null) };
}

function zoneIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  for (const item of value) if (typeof item === 'string') {
    // NWS usually supplies URLs. Extract only a canonical identifier, never reuse its URL.
    const match = /(?:^|\/)([A-Z]{2}[CZ]\d{3})(?:$|[/?#])/i.exec(item);
    if (match) ids.add(match[1].toUpperCase());
  }
  return [...ids].filter(id => UGC.test(id));
}

function geocodeIds(value: unknown): string[] {
  const geocode = record(value); const raw = geocode?.UGC;
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((id): id is string => typeof id === 'string').map(id => id.toUpperCase()))].filter(id => UGC.test(id));
}

function trustedAlertUrl(value: unknown, baseUrl: string): string {
  const text = safeText(value, 500); if (!text) return 'https://www.weather.gov';
  try {
    const url = new URL(text); const configured = new URL(baseUrl);
    if (url.protocol !== 'https:') return 'https://www.weather.gov';
    if (url.origin === configured.origin || ['api.weather.gov', 'weather.gov', 'www.weather.gov'].includes(url.hostname)) return url.toString();
  } catch { /* fall through */ }
  return 'https://www.weather.gov';
}

function normalizedAlert(source: Feature, geometry: AreaGeometry, baseUrl: string, suffix = ''): WeatherAlert | null {
  const event = safeText(source.properties.event, 160);
  if (!Object.prototype.hasOwnProperty.call(ALERT_SCORES, event)) return null;
  const onset = isoTime(source.properties.onset);
  const expires = isoTime(source.properties.expires);
  return {
    id: `${source.id}${suffix}`, event, headline: safeText(source.properties.headline, 500),
    severity: safeText(source.properties.severity, 100), onset, expires, geometry,
    url: trustedAlertUrl(source.properties['@id'] || source.properties.id, baseUrl),
  };
}

function envelopes(route: DrivingRoute): string[] | null {
  if (!route.coordinates.length || !route.coordinates.every(validCoordinate)) return null;
  const lons = route.coordinates.map(point => point[0]); const lats = route.coordinates.map(point => point[1]);
  const south = Math.min(...lats), north = Math.max(...lats);
  const normal = Math.max(...lons) - Math.min(...lons);
  if (normal <= 180) return [`${Math.min(...lons)},${south},${Math.max(...lons)},${north}`];
  // A route crossing the date line is represented by two valid Esri envelopes.
  const east = lons.filter(lon => lon >= 0), west = lons.filter(lon => lon < 0);
  if (!east.length || !west.length) return null;
  return [`${Math.min(...east)},${south},180,${north}`, `-180,${south},${Math.max(...west)},${north}`];
}

function gisIds(value: unknown, layer: 2 | 8): { ids: string[]; partial: boolean } {
  const root = record(value); if (!root || !Array.isArray(root.features)) return { ids: [], partial: true };
  const ids = new Set<string>();
  for (const raw of root.features) {
    const attrs = record(record(raw)?.attributes); if (!attrs) return { ids: [...ids], partial: true };
    const state = safeText(attrs.state, 2).toUpperCase();
    const code = safeText(layer === 2 ? attrs.fips : attrs.zone, 12);
    if (!/^[A-Z]{2}$/.test(state) || !/^\d{1,5}$/.test(code)) return { ids: [...ids], partial: true };
    const id = `${state}${layer === 2 ? 'C' : 'Z'}${code.slice(-3).padStart(3, '0')}`;
    if (UGC.test(id)) ids.add(id);
  }
  return { ids: [...ids], partial: root.exceededTransferLimit === true || !!root.error };
}

function isExpired(alert: WeatherAlert, now: number): boolean { return !!alert.expires && Date.parse(alert.expires) <= now; }

export function createAlertProvider(
  client: JsonClient,
  baseUrl = 'https://api.weather.gov',
  gisBase = 'https://mapservices.weather.noaa.gov/static/rest/services/nws_reference_maps/nws_reference_map/MapServer',
  now: () => number = Date.now,
): AlertProvider {
  return {
    async alerts(route: DrivingRoute): Promise<ProviderResult<WeatherAlert[]>> {
      const distances = routeDistances(route.coordinates, route.distanceKm);
      if (distances.length !== route.coordinates.length || route.coordinates.length < 2) {
        return { value: [], status: { state: 'unavailable', detail: 'The route geometry is invalid for alert intersection.' } };
      }
      let active: Feature[];
      let updatedAt: string | undefined;
      let partial = false;
      try {
        const payload = await client.json(`${baseUrl}/alerts/active?status=actual&region_type=land`, { ttlMs: ACTIVE_TTL });
        const parsed = features(payload); if (!parsed) throw new Error('Invalid active-alert response');
        active = parsed.items;
        const root = record(payload); const updated = root && isoTime(root.updated); if (updated) updatedAt = updated;
        if (parsed.malformed) partial = true;
      } catch {
        return { value: [], status: { state: 'unavailable', detail: 'US official alerts are unavailable.' } };
      }
      const current = now();
      if (!updatedAt || Math.abs(Date.parse(updatedAt) - current) > (Date.parse(updatedAt) > current ? 5 : 15) * 60_000) partial = true;
      const direct: WeatherAlert[] = [];
      const unresolved: Feature[] = [];
      for (const source of active) {
        const event = safeText(source.properties.event, 160);
        if (!Object.prototype.hasOwnProperty.call(ALERT_SCORES, event)) continue;
        const expiry = isoTime(source.properties.expires);
        if (!expiry) partial = true;
        const status = safeText(source.properties.status, 30).toLowerCase();
        const messageType = safeText(source.properties.messageType, 30).toLowerCase();
        if ((status && status !== 'actual') || ['test', 'exercise', 'cancel', 'cancellation'].includes(messageType)) continue;
        if (source.geometry) {
          const alert = normalizedAlert(source, source.geometry, baseUrl);
          if (!alert || isExpired(alert, current)) continue;
          if (areaIntervals(route.coordinates, distances, alert.geometry).length) direct.push(alert);
        } else if (source.hasGeometry) {
          partial = true;
        } else {
          // A missing geometry cannot be treated as a whole-state alert.
          unresolved.push(source);
        }
      }
      // Query coverage even on a day with no zone alerts. An empty national feed
      // must not make a route outside the United States look covered by NWS.

      const bbox = envelopes(route);
      if (!bbox) return { value: direct, status: { state: 'partial', detail: 'US alert zone lookup is incomplete for this route.', ...(updatedAt ? { updatedAt } : {}) } };
      const candidates = new Set<string>();
      try {
        const requests = GIS_LAYERS.flatMap(layer => bbox.map(async envelope => {
          const query = new URLSearchParams({ f: 'json', geometry: envelope, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: '*', returnGeometry: 'false' });
          const result = gisIds(await client.json(`${gisBase}/${layer}/query?${query}`, { ttlMs: ZONE_TTL }), layer);
          result.ids.forEach(id => candidates.add(id)); if (result.partial) partial = true;
        }));
        const settled = await Promise.allSettled(requests);
        if (settled.some(result => result.status === 'rejected')) partial = true;
      } catch { partial = true; }

      if (!candidates.size && !partial) {
        return { value: direct, status: { state: 'outside-coverage', detail: 'US alerts cover only the United States; this route has no supported US alert zones.', ...(updatedAt ? { updatedAt } : {}) } };
      }

      const needed = new Set<string>();
      for (const source of unresolved) {
        const canonical = [...new Set([...zoneIds(source.properties.affectedZones), ...geocodeIds(source.properties.geocode)])];
        const matches = canonical.filter(id => candidates.has(id));
        if (canonical.length && !matches.length) continue;
        matches.forEach(id => needed.add(id));
        if (!canonical.length) partial = true;
      }
      const ids = [...needed]; if (ids.length > MAX_ZONES) { ids.length = MAX_ZONES; partial = true; }
      const zoneGeometry = new Map<string, AreaGeometry>();
      await Promise.all(ids.map(async id => {
        const kind = id[2] === 'C' ? 'county' : 'forecast';
        try {
          const response = await client.json(`${baseUrl}/zones/${kind}/${id}`, { ttlMs: ZONE_TTL });
          const parsed = feature(response); if (!parsed?.geometry) { partial = true; return; }
          zoneGeometry.set(id, parsed.geometry);
        } catch { partial = true; }
      }));
      const resolved: WeatherAlert[] = [];
      for (const source of unresolved) {
        const canonical = [...new Set([...zoneIds(source.properties.affectedZones), ...geocodeIds(source.properties.geocode)])];
        for (const id of canonical) {
        const geometry = zoneGeometry.get(id); if (!geometry) continue;
        const alert = normalizedAlert(source, geometry, baseUrl, `:${id}`);
        if (alert && !isExpired(alert, current) && areaIntervals(route.coordinates, distances, geometry).length) resolved.push(alert);
        }
      }
      return {
        value: [...new Map([...direct, ...resolved].map(alert => [alert.id, alert])).values()],
        status: { state: partial ? 'partial' : 'available', detail: partial ? 'US alerts checked; some route alert zones could not be resolved.' : 'US official alerts checked.', ...(updatedAt ? { updatedAt } : {}) },
      };
    },
  };
}

import type { JsonClient, ProviderResult, WeatherProvider } from '../contracts';
import { ProviderError } from '../contracts';
import type { Coordinate, DataStatus, Sample, Weather } from '../../lib/domain';

const MAX_SAMPLES = 192;
const MAX_COORDINATES = 32;
const POINT_TTL = 24 * 60 * 60_000;
const GRID_TTL = 10 * 60_000;
const REQUEST_TIMEOUT = 4_000;
const DEADLINE_MS = 12_000;
const HOUR = 60 * 60_000;
type ObjectRecord = Record<string, unknown>;
type Interval = { start: number; end: number; value: number | null };

function object(value: unknown): ObjectRecord | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectRecord : null; }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function coordinate(value: unknown): value is Coordinate { return Array.isArray(value) && value.length === 2 && finite(value[0]) && finite(value[1]) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90; }
function rounded(value: Coordinate): Coordinate { return [Math.round(value[0] * 10_000) / 10_000, Math.round(value[1] * 10_000) / 10_000]; }
function key(value: Coordinate): string { return `${value[1]},${value[0]}`; }

function timestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(part => Number(part ?? 0));
  const offset = match[7];
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || hour > 23 || minute > 59 || second > 59 || (offset !== 'Z' && (Number(offset!.slice(1, 3)) > 23 || Number(offset!.slice(4, 6)) > 59))) return null;
  const result = Date.parse(value); return Number.isFinite(result) ? result : null;
}

function duration(value: string): number | null {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(value);
  if (!match || value.endsWith('T') || !match.slice(1).some(Boolean)) return null;
  const [days, hours, minutes] = match.slice(1).map(part => part === undefined ? 0 : Number(part));
  if (![days, hours, minutes].every(Number.isSafeInteger)) return null;
  const result = ((days * 24 + hours) * 60 + minutes) * 60_000;
  return result > 0 && result <= 8 * 24 * 60 * 60_000 ? result : null;
}

function intervals(field: unknown, unit: string): Interval[] | null {
  const source = object(field); if (!source || typeof source.uom !== 'string' || source.uom !== unit || !Array.isArray(source.values) || source.values.length > 500) return null;
  const output: Interval[] = [];
  for (const raw of source.values) {
    const item = object(raw); const validTime = item?.validTime;
    if (!item || typeof validTime !== 'string' || (!finite(item.value) && item.value !== null)) return null;
    const slash = validTime.indexOf('/'); if (slash <= 0 || validTime.indexOf('/', slash + 1) !== -1) return null;
    const start = timestamp(validTime.slice(0, slash)), span = duration(validTime.slice(slash + 1));
    if (start === null || span === null || start + span <= start) return null;
    output.push({ start, end: start + span, value: item.value as number | null });
  }
  output.sort((a, b) => a.start - b.start);
  return output.some((item, index) => index > 0 && item.start < output[index - 1].end) ? null : output;
}

function containing(items: Interval[] | null, at: number, minimum: number, maximum: number): number | null {
  if (!items) return null;
  const item = items.find(candidate => candidate.start <= at && at < candidate.end);
  return item && finite(item.value) && item.value >= minimum && item.value <= maximum ? item.value : null;
}

function knownZero(items: Interval[] | null, at: number): number | null {
  if (!items) return null;
  // The existing normalized forecast convention labels an aggregate at the end
  // of its hour. At 13:20, the applicable window is [12:00, 13:00), never a
  // made-up share of the interval currently in progress.
  const end = Math.floor(at / HOUR) * HOUR, start = end - HOUR;
  let covered = start;
  for (const item of items) {
    if (item.end <= covered || item.start >= end || item.value !== 0) continue;
    if (item.start > covered) return null;
    covered = Math.max(covered, Math.min(end, item.end));
    if (covered >= end) return 0;
  }
  return null;
}

function gridUrl(payload: unknown, origin: string): string | null {
  const properties = object(object(payload)?.properties); const link = properties?.forecastGridData;
  if (typeof link !== 'string') return null;
  try {
    const url = new URL(link), configured = new URL(origin);
    return url.origin === configured.origin && !url.username && !url.password && /^\/gridpoints\/[A-Z]{3}\/\d+,\d+$/.test(url.pathname) && !url.search && !url.hash ? url.toString() : null;
  } catch { return null; }
}

function weather(payload: unknown, at: number): Weather | null {
  const properties = object(object(payload)?.properties); if (!properties) return null;
  const temperature = containing(intervals(properties.temperature, 'wmoUnit:degC'), at, -100, 70);
  const wind = containing(intervals(properties.windSpeed, 'wmoUnit:km_h-1'), at, 0, 500);
  const gust = containing(intervals(properties.windGust, 'wmoUnit:km_h-1'), at, 0, 500);
  const visibility = containing(intervals(properties.visibility, 'wmoUnit:m'), at, 0, 200_000);
  const precipitation = knownZero(intervals(properties.quantitativePrecipitation, 'wmoUnit:mm'), at);
  // NWS snowfall is millimetres in the raw grid. Positive totals are intentionally
  // unknown, so only a unit-validated full zero interval can be represented here.
  const snowfall = knownZero(intervals(properties.snowfallAmount, 'wmoUnit:mm'), at);
  if ([temperature, wind, gust, visibility, precipitation, snowfall].every(value => value === null)) return null;
  return { source: 'NWS', time: new Date(at).toISOString(), temperatureC: temperature, precipitationMm: precipitation, snowfallCm: snowfall, windKmh: wind, gustKmh: gust, visibilityM: visibility, code: null };
}

function selectedIndexes(length: number): Set<number> {
  if (length <= MAX_COORDINATES) return new Set(Array.from({ length }, (_, index) => index));
  return new Set(Array.from({ length: MAX_COORDINATES }, (_, index) => Math.round(index * (length - 1) / (MAX_COORDINATES - 1))));
}

async function limited<T>(items: T[], deadline: number, now: () => number, work: (item: T) => Promise<void>): Promise<{ skipped: number; rateLimited: boolean }> {
  let next = 0, stopped = false;
  const worker = async () => { while (true) {
    if (stopped || now() >= deadline) return;
    const index = next++; if (index >= items.length) return;
    try { await work(items[index]); } catch (error) { if (error instanceof ProviderError && error.code === 'rate-limited') stopped = true; }
  } };
  await Promise.all([worker(), worker()]);
  return { skipped: Math.max(0, items.length - Math.min(next, items.length)), rateLimited: stopped };
}

/** Conservative US-only NWS grid fallback. It never fabricates a weather code or hourly accumulation. */
export function createNwsWeatherProvider(client: JsonClient, endpoint = 'https://api.weather.gov', now: () => number = Date.now): WeatherProvider {
  return { async forecast(samples: Sample[]): Promise<ProviderResult<Array<Weather | null>>> {
    if (!Array.isArray(samples)) throw new ProviderError('invalid-response', 'Weather samples must be an array.');
    if (samples.length > MAX_SAMPLES) throw new ProviderError('invalid-response', `A weather request may contain at most ${MAX_SAMPLES} route samples.`);
    const values: Array<Weather | null> = Array.from({ length: samples.length }, () => null);
    const groups = new Map<string, { coordinate: Coordinate; indexes: number[]; arrivals: number[] }>();
    samples.forEach((sample, index) => { if (!sample || !coordinate(sample.coordinate)) return; const at = timestamp(sample.arrivalTime); if (at === null) return; const point = rounded(sample.coordinate), id = key(point); const group = groups.get(id) ?? { coordinate: point, indexes: [], arrivals: [] }; group.indexes.push(index); group.arrivals.push(at); groups.set(id, group); });
    const all = [...groups.values()], selected = selectedIndexes(all.length), chosen = all.filter((_, index) => selected.has(index));
    const deadline = now() + DEADLINE_MS;
    const gridRequests = new Map<string, Promise<unknown>>();
    let outside = 0, pointFailures = 0, gridFailures = 0, stopped = false, postPointSkipped = 0;
    // Each worker takes one coordinate from discovery through its grid lookup.
    // This avoids spending the full wall-time budget on point discovery alone.
    const scheduled = await limited(chosen, deadline, now, async group => {
      let url: string | null = null;
      try {
        const point = await client.json(new URL(`/points/${group.coordinate[1]},${group.coordinate[0]}`, endpoint).toString(), { ttlMs: POINT_TTL, timeoutMs: REQUEST_TIMEOUT, maxBytes: 500_000 });
        url = gridUrl(point, endpoint); if (!url) { pointFailures++; return; }
        // A point completion may race a 429 from the other worker. Do not start a
        // new grid request after that shared host cooldown has been observed.
        if (stopped || now() >= deadline) { postPointSkipped++; return; }
        let request = gridRequests.get(url);
        if (!request) { request = client.json(url, { ttlMs: GRID_TTL, timeoutMs: REQUEST_TIMEOUT, maxBytes: 4_000_000 }); gridRequests.set(url, request); }
        const payload = await request;
        group.indexes.forEach((sampleIndex, itemIndex) => { values[sampleIndex] = weather(payload, group.arrivals[itemIndex]); });
      } catch (error) {
        if (url === null && error instanceof ProviderError && error.code === 'unavailable' && /HTTP 404/.test(error.message)) outside++;
        else if (url === null) pointFailures++; else gridFailures++;
        if (error instanceof ProviderError && error.code === 'rate-limited') stopped = true;
        throw error;
      }
    });
    const resolved = values.filter((value): value is Weather => value !== null).length;
    const capped = all.length - chosen.length;
    const skipped = capped + scheduled.skipped + postPointSkipped;
    let status: DataStatus;
    if (!resolved && chosen.length > 0 && outside === chosen.length && !pointFailures && !skipped) status = { state: 'outside-coverage', detail: 'NWS grid forecasts cover only supported US locations; all requested samples were outside that coverage.' };
    else if (!resolved) status = { state: 'unavailable', detail: `NWS partial grid forecasts produced no usable route samples${skipped ? `; ${skipped} coordinate lookups were skipped by the request budget` : ''}.` };
    else status = { state: 'partial', detail: `NWS partial grid forecasts supplied ${resolved} of ${samples.length} route samples; weather codes and non-zero accumulation totals remain unknown${skipped ? `; ${skipped} coordinate lookups were skipped by the request budget` : ''}${pointFailures || gridFailures ? '; some NWS requests failed' : ''}.` };
    return { value: values, status };
  } };
}

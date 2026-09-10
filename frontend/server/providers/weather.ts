import type { JsonClient, ProviderResult, WeatherProvider } from '../contracts';
import { ProviderError } from '../contracts';
import type { Coordinate, DataStatus, Sample, Weather } from '../../lib/domain';

const MAX_SAMPLES = 192;
const COORDINATE_BATCH_SIZE = 32;
const COORDINATE_PRECISION = 10_000;
const RESPONSE_COORDINATE_TOLERANCE = 0.1;
const HOUR_MS = 60 * 60 * 1000;
const HOURLY_FIELDS = [
  'temperature_2m', 'precipitation', 'snowfall', 'wind_speed_10m',
  'wind_gusts_10m', 'visibility', 'weather_code',
] as const;

type HourlyField = typeof HOURLY_FIELDS[number];
type UnknownRecord = Record<string, unknown>;

interface CoordinateGroup {
  coordinate: Coordinate;
  sampleIndexes: number[];
  arrivalTimes: number[];
}

function record(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as UnknownRecord : null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) && value.length === 2 && finite(value[0]) && finite(value[1]) &&
    value[0] >= -180 && value[0] <= 180 && value[1] >= -90 && value[1] <= 90;
}

function validCalendarDate(year: number, month: number, day: number, hour: number, minute: number, second = 0): boolean {
  return year >= 0 && month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate() &&
    hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59;
}

/** Requires an explicit UTC offset so a route arrival is never interpreted in the server's local timezone. */
function arrivalTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(part => Number(part ?? 0));
  const offset = match[7];
  if (!validCalendarDate(year, month, day, hour, minute, second) || (offset !== 'Z' && (!offset || Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4, 6)) > 59))) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

/** Open-Meteo timezone=GMT hourly labels are UTC hour endpoints such as 2026-09-09T13:00. */
function providerHourTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):00(?::00(?:\.\d{1,3})?)?Z?$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour] = match.slice(1, 5).map(Number);
  return validCalendarDate(year, month, day, hour, 0) ? Date.UTC(year, month - 1, day, hour) : null;
}

function coordinateKey(coordinate: Coordinate): string {
  const longitude = Math.round(coordinate[0] * COORDINATE_PRECISION) / COORDINATE_PRECISION;
  const latitude = Math.round(coordinate[1] * COORDINATE_PRECISION) / COORDINATE_PRECISION;
  return `${latitude},${longitude}`;
}

function roundedCoordinate(coordinate: Coordinate): Coordinate {
  return [
    Math.round(coordinate[0] * COORDINATE_PRECISION) / COORDINATE_PRECISION,
    Math.round(coordinate[1] * COORDINATE_PRECISION) / COORDINATE_PRECISION,
  ];
}

function validNumber(value: unknown, minimum: number, maximum: number, integer = false): number | null {
  return finite(value) && value >= minimum && value <= maximum && (!integer || Number.isInteger(value)) ? value : null;
}

function expectedUnit(field: HourlyField, value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.toLowerCase().replaceAll(' ', '');
  switch (field) {
    case 'temperature_2m': return ['°c', 'c', 'celsius'].includes(normalized);
    case 'precipitation': return normalized === 'mm';
    case 'snowfall': return normalized === 'cm';
    case 'wind_speed_10m':
    case 'wind_gusts_10m': return ['km/h', 'kmh', 'kilometresperhour', 'kilometersperhour'].includes(normalized);
    case 'visibility': return ['m', 'metre', 'metres', 'meter', 'meters'].includes(normalized);
    case 'weather_code': return ['wmocode', 'wmo', 'code'].includes(normalized);
  }
}

function responseMatchesCoordinate(response: UnknownRecord, requested: Coordinate): boolean {
  const latitude = response.latitude;
  const longitude = response.longitude;
  return finite(latitude) && finite(longitude) && Math.abs(latitude - requested[1]) <= RESPONSE_COORDINATE_TOLERANCE &&
    Math.abs((((longitude - requested[0]) + 540) % 360) - 180) <= RESPONSE_COORDINATE_TOLERANCE;
}

function weatherAt(response: unknown, requested: Coordinate, arrivalTime: number): Weather | null {
  const root = record(response);
  if (!root || !responseMatchesCoordinate(root, requested)) return null;
  const hourly = record(root.hourly);
  const units = record(root.hourly_units);
  if (!hourly || !Array.isArray(hourly.time) || (units && !HOURLY_FIELDS.every(field => expectedUnit(field, units[field])))) return null;
  const parsedTimes = hourly.time.map(providerHourTimestamp);
  if (parsedTimes.some(time => time === null)) return null;
  const times = parsedTimes as number[];
  if (times.some((time, index) => index > 0 && time <= times[index - 1])) return null;
  // Open-Meteo labels precipitation, snowfall and wind gusts by the END of the
  // preceding hour. At 13:20, use their 14:00 values (13:00-14:00). Temperature,
  // sustained wind, visibility and code are instantaneous, so use the closest
  // returned hour inside the response horizon. `time` records the actual arrival.
  const first = times[0], last = times[times.length - 1];
  if (first === undefined || last === undefined || arrivalTime < first || arrivalTime > last) return null;
  const aggregateTime = Math.ceil(arrivalTime / HOUR_MS) * HOUR_MS;
  const aggregateIndex = times.indexOf(aggregateTime);
  if (aggregateIndex < 0) return null;
  let instantIndex = 0;
  for (let index = 1; index < times.length; index++) {
    if (Math.abs(times[index] - arrivalTime) < Math.abs(times[instantIndex] - arrivalTime)) instantIndex = index;
  }
  const valueAt = (field: HourlyField, index: number) => Array.isArray(hourly[field]) ? hourly[field][index] : undefined;
  const instant = (field: HourlyField) => valueAt(field, instantIndex);
  const aggregate = (field: HourlyField) => valueAt(field, aggregateIndex);
  const wind = validNumber(instant('wind_speed_10m'), 0, 500);
  return {
    time: new Date(arrivalTime).toISOString(),
    temperatureC: validNumber(instant('temperature_2m'), -100, 70),
    precipitationMm: validNumber(aggregate('precipitation'), 0, 500),
    snowfallCm: validNumber(aggregate('snowfall'), 0, 500),
    windKmh: wind,
    gustKmh: validNumber(aggregate('wind_gusts_10m'), 0, 500),
    visibilityM: validNumber(instant('visibility'), 0, 200_000),
    code: validNumber(instant('weather_code'), 0, 99, true),
  };
}

function responseList(value: unknown, expectedLength: number): unknown[] | null {
  if (expectedLength === 1 && record(value)) return [value];
  return Array.isArray(value) && value.length === expectedLength ? value : null;
}

function statusFor(values: Array<Weather | null>, failedBatches: number): DataStatus {
  const resolved = values.filter((value): value is Weather => value !== null);
  const complete = resolved.filter(weather => [weather.temperatureC, weather.precipitationMm, weather.snowfallCm, weather.windKmh, weather.gustKmh, weather.visibilityM, weather.code].every(value => value !== null)).length;
  if (resolved.length === values.length && complete === values.length && values.length > 0) return { state: 'available', detail: `Hourly forecast coverage is available for all ${values.length} route samples.` };
  if (resolved.length === 0) return {
    state: 'unavailable',
    detail: failedBatches ? 'Open-Meteo did not return usable forecasts for the route samples.' : 'No route samples matched the returned three-day hourly forecast horizon.',
  };
  const missing = values.length - resolved.length;
  return {
    state: 'partial',
    detail: `Hourly forecast coverage is available for ${resolved.length} of ${values.length} route samples; ${missing} remain unknown${failedBatches ? ' because one or more forecast batches failed or were invalid' : ''}${complete < resolved.length ? '; some available rows have unknown fields' : ''}.`,
  };
}

/** Open-Meteo adapter. The client owns origin restrictions, caching and network timeouts. */
export function createWeatherProvider(client: JsonClient, baseUrl = 'https://api.open-meteo.com'): WeatherProvider {
  return {
    async forecast(samples: Sample[]): Promise<ProviderResult<Array<Weather | null>>> {
      if (!Array.isArray(samples)) throw new ProviderError('invalid-response', 'Weather samples must be an array.');
      if (samples.length > MAX_SAMPLES) throw new ProviderError('invalid-response', `A weather request may contain at most ${MAX_SAMPLES} route samples.`);
      const values: Array<Weather | null> = Array.from({ length: samples.length }, () => null);
      const groups = new Map<string, CoordinateGroup>();
      for (let index = 0; index < samples.length; index++) {
        const sample = samples[index];
        if (!sample || !validCoordinate(sample.coordinate)) continue;
        const arrivalTime = arrivalTimestamp(sample.arrivalTime);
        if (arrivalTime === null) continue;
        const coordinate = roundedCoordinate(sample.coordinate);
        const key = coordinateKey(coordinate);
        const group = groups.get(key) ?? { coordinate, sampleIndexes: [], arrivalTimes: [] };
        group.sampleIndexes.push(index);
        group.arrivalTimes.push(arrivalTime);
        groups.set(key, group);
      }

      let failedBatches = 0;
      const allGroups = [...groups.values()];
      const batches = Array.from({ length: Math.ceil(allGroups.length / COORDINATE_BATCH_SIZE) }, (_, index) => allGroups.slice(index * COORDINATE_BATCH_SIZE, (index + 1) * COORDINATE_BATCH_SIZE));
      const fetchBatch = async (batch: CoordinateGroup[]) => {
        const parameters = new URLSearchParams({
          latitude: batch.map(group => String(group.coordinate[1])).join(','),
          longitude: batch.map(group => String(group.coordinate[0])).join(','),
          hourly: HOURLY_FIELDS.join(','),
          timezone: 'GMT', forecast_days: '3', temperature_unit: 'celsius', precipitation_unit: 'mm', wind_speed_unit: 'kmh',
        });
        let payload: unknown;
        try {
          payload = await client.json(new URL(`/v1/forecast?${parameters.toString()}`, baseUrl).toString(), {
            ttlMs: 10 * 60 * 1000, timeoutMs: 8_000, maxBytes: 1_500_000,
          });
        } catch {
          failedBatches++;
          return;
        }
        const responses = responseList(payload, batch.length);
        if (!responses) {
          failedBatches++;
          return;
        }
        for (let groupIndex = 0; groupIndex < batch.length; groupIndex++) {
          const group = batch[groupIndex];
          for (let sampleIndex = 0; sampleIndex < group.sampleIndexes.length; sampleIndex++) {
            values[group.sampleIndexes[sampleIndex]] = weatherAt(responses[groupIndex], group.coordinate, group.arrivalTimes[sampleIndex]);
          }
        }
      };
      // Two concurrent upstream batches keep long routes responsive without making
      // a burst of six requests to a free shared provider.
      for (let start = 0; start < batches.length; start += 2) await Promise.all(batches.slice(start, start + 2).map(fetchBatch));
      return { value: values, status: statusFor(values, failedBatches) };
    },
  };
}

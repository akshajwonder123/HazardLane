import type { DataStatus, DrivingRoute, Location, RoadAttributes, RoadEvent, Sample, Weather, WeatherAlert } from '../lib/domain';

export interface JsonOptions {
  ttlMs: number;
  timeoutMs?: number;
  maxBytes?: number;
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
}
/** URLs are built only by server adapters. The shared client restricts them to configured origins. */
export interface JsonClient { json(url: string, options: JsonOptions): Promise<unknown> }
export interface ProviderResult<T> { value: T; status: DataStatus }
export interface GeocodingProvider { search(query: string): Promise<Location[]> }
export interface RoutingProvider { routes(origin: Location, destination: Location): Promise<DrivingRoute[]> }
/** Values have the same order and length as input samples. Missing values must be null. */
export interface WeatherProvider { forecast(samples: Sample[]): Promise<ProviderResult<(Weather | null)[]>> }
export interface AlertProvider { alerts(route: DrivingRoute): Promise<ProviderResult<WeatherAlert[]>> }
/** Attributes are spatially matched to each sample, never inferred from an arbitrary nearest road. */
export interface RoadProvider { attributes(route: DrivingRoute, samples: Sample[]): Promise<ProviderResult<(RoadAttributes | null)[]>> }
export interface RoadEventProvider { events(route: DrivingRoute): Promise<ProviderResult<RoadEvent[]>> }
export class ProviderError extends Error {
  constructor(public readonly code: 'unavailable' | 'rate-limited' | 'invalid-response' | 'no-route', message: string, public readonly retryAt?: number) { super(message); this.name = 'ProviderError'; }
}

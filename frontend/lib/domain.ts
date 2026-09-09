export type Coordinate = [number, number];
export type RiskLevel = 'Low Risk' | 'Medium Risk' | 'High Risk';
export type Availability = 'available' | 'partial' | 'unavailable' | 'outside-coverage';
export interface Location { id: string; label: string; lat: number; lon: number; countryCode?: string }
export interface DataStatus { state: Availability; detail: string; updatedAt?: string }
export interface Maneuver { startIndex: number; endIndex: number; name: string }
export interface DrivingRoute {
  id: string; name: string; coordinates: Coordinate[]; distanceKm: number; durationSeconds: number;
  provider: string; maneuvers: Maneuver[];
}
export interface Sample { coordinate: Coordinate; distanceKm: number; arrivalTime: string }
export interface Weather {
  time: string; temperatureC: number | null; precipitationMm: number | null; snowfallCm: number | null;
  windKmh: number | null; gustKmh: number | null; visibilityM: number | null; code: number | null;
}
export interface RoadAttributes {
  highway?: string; surface?: string; smoothness?: string; maxspeed?: string; lanes?: string;
  bridge?: string; tunnel?: string; width?: string; name?: string;
}
export type AreaGeometry = { type: 'Polygon'; coordinates: Coordinate[][] } | { type: 'MultiPolygon'; coordinates: Coordinate[][][] };
export interface WeatherAlert {
  id: string; event: string; headline: string; severity: string; onset: string | null; expires: string | null;
  geometry: AreaGeometry; url: string;
}
export interface RoadEvent {
  id: string; name: string; description: string; closed: boolean; coordinates: Coordinate[];
  start: string; end: string; direction: string; source: string;
}
export interface Hazard { kind: string; title: string; detail: string; score: number; critical: boolean; url?: string }
export interface LocalRisk { score: number | null; level: RiskLevel | null; hazards: Hazard[]; weatherComplete: boolean }
export interface RiskSegment extends LocalRisk {
  id: string; startKm: number; endKm: number; coordinates: Coordinate[]; roadName: string;
  weather: Weather | null; roads: RoadAttributes | null; arrivalTime: string;
}
export interface AssessedRoute extends DrivingRoute {
  segments: RiskSegment[]; score: number | null; level: RiskLevel | null; summary: string;
  peakScore: number | null; highRiskKm: number; knownWeatherPercent: number; sampleCount: number;
  hazards: (Hazard & { startKm: number; endKm: number; roadName: string })[];
  data: { weather: DataStatus; alerts: DataStatus; roads: DataStatus; events: DataStatus };
}
export interface RouteAnalysis {
  origin: Location; destination: Location; departureTime: string; analyzedAt: string;
  routes: AssessedRoute[]; recommendedId: string; recommendation: string; limitations: string[];
}
export const riskLevel = (score: number): RiskLevel => score < 30 ? 'Low Risk' : score < 60 ? 'Medium Risk' : 'High Risk';
export const riskColor = (level: RiskLevel | null) => level === 'Low Risk' ? '#16855c' : level === 'Medium Risk' ? '#d6a017' : level === 'High Risk' ? '#d74b48' : '#7b8893';
export const miles = (km: number) => km * 0.621371;
export const duration = (s: number) => s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : `${Math.floor(s / 3600)} hr ${Math.round(s % 3600 / 60)} min`;

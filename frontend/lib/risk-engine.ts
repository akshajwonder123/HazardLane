import { AssessedRoute, Hazard, LocalRisk, RiskSegment, RoadAttributes, RoadEvent, Weather, WeatherAlert, riskLevel } from './domain';

/** Experimental relative hazard index, never a crash probability. Calibration: docs/RISK_MODEL.md. */
export function boundedScore(value: number): number { return Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value))) : 0; }
const valid = (n: number | null | undefined) => typeof n === 'number' && Number.isFinite(n);
function curve(value: number, points: [number, number][]): number {
  if (value <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) if (value <= points[i][0]) {
    const [x0,y0] = points[i-1], [x1,y1] = points[i];
    return y0 + (y1-y0) * (value-x0)/(x1-x0);
  }
  return points.at(-1)![1];
}
export const ALERT_SCORES: Record<string, number> = {
  'Tornado Warning': 100, 'Flash Flood Warning': 90, 'Extreme Wind Warning': 100,
  'Blizzard Warning': 90, 'Ice Storm Warning': 90, 'Hurricane Warning': 95,
  'Snow Squall Warning': 90, 'Dust Storm Warning': 85,
  'Severe Thunderstorm Warning': 80, 'Winter Storm Warning': 80,
  'Flood Warning': 70, 'High Wind Warning': 75, 'Tropical Storm Warning': 80,
  'Tornado Watch': 45, 'Severe Thunderstorm Watch': 35, 'Flash Flood Watch': 40,
  'Flood Watch': 35, 'Winter Storm Watch': 40, 'Hurricane Watch': 55,
  'Tropical Storm Watch': 45, 'Winter Weather Advisory': 45, 'Freezing Rain Advisory': 55,
  'Dense Fog Advisory': 45, 'Dense Smoke Advisory': 45, 'Wind Advisory': 35,
  'Flood Advisory': 35, 'Blowing Dust Advisory': 40, 'Avalanche Warning': 80,
};
export function scoreConditions(weather: Weather | null, alerts: WeatherAlert[] = [], roads: RoadAttributes | null = null, events: RoadEvent[] = []): LocalRisk {
  const hazards: Hazard[] = [];
  const add = (kind: string, title: string, detail: string, score: number, critical = false, url?: string) => {
    if (score > 0) hazards.push({ kind, title, detail, score: boundedScore(score), critical, ...(url ? {url} : {}) });
  };
  const complete = weather !== null && [weather.temperatureC,weather.precipitationMm,weather.snowfallCm,weather.windKmh,weather.gustKmh,weather.visibilityM,weather.code].every(valid);
  let rain = 0, wind = 0, visibility = 0, snow = 0, ice = 0;
  if (weather) {
    if (valid(weather.precipitationMm)) {
      rain = curve(Math.max(0,weather.precipitationMm!), [[0,0],[.2,1],[1,5],[2.5,12],[5,25],[10,45],[20,68],[35,88]]);
      if (rain >= 5) add('rain', weather.precipitationMm! >= 10 ? 'Heavy precipitation' : weather.precipitationMm! >= 2.5 ? 'Rain along the route' : 'Light precipitation', `${weather.precipitationMm!.toFixed(1)} mm of precipitation forecast in this hour. Wet roads may reduce traction.`, rain);
    }
    if (valid(weather.gustKmh)) wind = curve(weather.gustKmh!, [[0,0],[35,0],[50,8],[65,22],[80,42],[100,65],[120,85]]);
    if (valid(weather.windKmh)) wind = Math.max(wind, curve(weather.windKmh!, [[0,0],[30,0],[50,15],[70,35],[90,65],[120,90]]));
    if (wind > 0) add('wind', wind >= 60 ? 'Damaging wind potential' : 'Strong wind gusts', `${valid(weather.gustKmh) ? `Gusts near ${Math.round(weather.gustKmh! / 1.609344)} mph` : 'Strong sustained winds'} can affect vehicle handling, especially on exposed roads.`, wind, wind >= 85);
    if (valid(weather.visibilityM)) {
      visibility = curve(Math.max(0,weather.visibilityM!), [[0,95],[50,90],[200,68],[500,48],[1000,28],[2000,12],[5000,3],[10000,0]]);
      if (visibility >= 12) add('visibility', visibility >= 60 ? 'Very poor visibility' : 'Reduced visibility', `Forecast visibility is about ${weather.visibilityM! >= 1000 ? `${(weather.visibilityM! / 1000).toFixed(1)} km` : `${Math.round(weather.visibilityM!)} m`}. Allow extra stopping distance.`, visibility, visibility >= 85);
    }
    if (valid(weather.snowfallCm)) {
      snow = curve(Math.max(0,weather.snowfallCm!), [[0,0],[.1,5],[.5,20],[1,35],[2,55],[4,75],[8,90]]);
      if (snow > 0) add('snow', snow >= 55 ? 'Heavy snowfall' : 'Snowfall', `${weather.snowfallCm!.toFixed(1)} cm of snow forecast in this hour. Accumulation can reduce traction.`, snow, snow >= 85);
    }
    const freezingCode = weather.code !== null && [56,57,66,67].includes(weather.code);
    if (freezingCode) ice = weather.code === 67 || weather.code === 57 ? 85 : 75;
    else if (valid(weather.temperatureC) && valid(weather.precipitationMm) && weather.precipitationMm! >= .2 && weather.temperatureC! <= 2) {
      ice = weather.temperatureC! <= 0 ? 65 : 48;
      if (weather.precipitationMm! >= 2) ice += 8;
    }
    if (ice) add('ice', freezingCode ? 'Freezing precipitation' : 'Possible icy surfaces', freezingCode ? 'The forecast indicates freezing precipitation. Roads may develop ice.' : `Precipitation near ${weather.temperatureC!.toFixed(1)}°C may freeze on some surfaces. Air temperature does not measure road temperature.`, ice, ice >= 85);
  }
  // Take the dominant physical hazard; reinforce distinct hazards without adding correlated rain/snow/ice repeatedly.
  const precipitation = Math.max(rain, snow, ice);
  const ranked = [precipitation, wind, visibility].sort((a,b) => b-a);
  let physical = ranked[0] + .2 * ranked[1] + .1 * ranked[2];
  if (rain >= 25 && visibility >= 28) { physical += 8; add('rain-visibility', 'Rain and limited sight distance', 'Rainfall and low visibility combine to make stopping and spotting standing water more difficult.', 8); }
  if (snow >= 20 && wind >= 22) { physical += 8; add('blowing-snow', 'Wind-driven snow', 'Snowfall with strong wind may further obscure the road.', 8); }
  let modifier = 0;
  if (roads?.bridge && !['no','false','0'].includes(roads.bridge)) {
    if (ice > 0) { modifier += 8; add('bridge-ice', 'Bridge icing exposure', 'A mapped bridge in freezing precipitation may ice before nearby ground-level roads.', 8); }
    if (wind >= 22) { modifier += 5; add('bridge-wind', 'Wind exposure on a bridge', 'A mapped bridge may be more exposed to the forecast gusts.', 5); }
  }
  if (roads?.surface && ['unpaved','gravel','dirt','ground','mud','sand'].includes(roads.surface) && rain >= 12) {
    modifier += 5; add('wet-unpaved', 'Wet unpaved road', 'Mapped unpaved surface may lose traction in this precipitation. Current surface condition is unknown.', 5);
  }
  physical += Math.min(12, modifier);
  let alertFloor = 0;
  for (const alert of alerts) {
    const score = ALERT_SCORES[alert.event]; if (!score) continue;
    alertFloor = Math.max(alertFloor, score);
    add(`alert:${alert.id}`, alert.event, alert.headline || 'An official weather alert intersects this section. Follow the issuing authority’s instructions.', score, score >= 85, alert.url);
  }
  let eventFloor = 0;
  for (const event of events) {
    const score = event.closed ? 95 : 20; eventFloor = Math.max(eventFloor,score);
    add(`event:${event.id}`, event.closed ? 'Reported road closure' : 'Mapped work zone', `${event.name}: ${event.description} Check local signage and direction-specific restrictions.`, score, event.closed);
  }
  const hasEvidence = complete || hazards.length > 0;
  const score = hasEvidence ? boundedScore(Math.max(physical,alertFloor,eventFloor)) : null;
  hazards.sort((a,b) => b.score-a.score || a.kind.localeCompare(b.kind));
  return { score, level: score !== null && (complete || score >= 30) ? riskLevel(score) : null, hazards, weatherComplete: complete };
}

export interface AggregatedRisk {
  score: number | null; level: AssessedRoute['level']; peakScore: number | null; highRiskKm: number;
  knownWeatherPercent: number; mean: number | null; percentile90: number | null; summary: string;
}
export function aggregateRisk(segments: RiskSegment[]): AggregatedRisk {
  const positive = segments.filter(s => Number.isFinite(s.endKm-s.startKm) && s.endKm > s.startKm);
  const total = positive.reduce((sum,s) => sum+s.endKm-s.startKm,0);
  const knownWeatherPercent = total ? Math.round(100*positive.reduce((sum,s)=>sum+(s.weatherComplete?s.endKm-s.startKm:0),0)/total) : 0;
  const observed = positive.filter(s => s.score !== null && valid(s.score));
  const observedLength = observed.reduce((sum,s) => sum+s.endKm-s.startKm,0);
  const peakScore = observed.length ? Math.max(...observed.map(s => s.score!)) : null;
  const highRiskKm = positive.reduce((sum,s) => sum + (s.score !== null && s.score>=60 ? s.endKm-s.startKm : 0),0);
  if (!observed.length || !total) return {score:null,level:null,peakScore:null,highRiskKm:0,knownWeatherPercent,mean:null,percentile90:null,summary:'Weather coverage is insufficient to assess this route.'};
  const mean = observed.reduce((sum,s) => sum+s.score!*(s.endKm-s.startKm),0)/observedLength;
  const ordered = [...observed].sort((a,b) => a.score!-b.score!);
  let accumulated = 0, percentile90 = ordered.at(-1)!.score!;
  for (const s of ordered) { accumulated += s.endKm-s.startKm; if (accumulated >= observedLength*.9) { percentile90=s.score!;break; } }
  const peak = peakScore!;
  // Every High section creates at least a High route; critical hazards keep their entire floor.
  const criticalFloor = Math.max(0,...observed.flatMap(s => s.hazards.filter(h=>h.critical).map(h=>h.score)));
  const peakFloor = peak >=60 ? Math.max(60,.9*peak) : .85*peak;
  const score = boundedScore(Math.max(.45*mean + .35*percentile90 + .2*peak, peakFloor, criticalFloor));
  const material = observed.flatMap(s => s.hazards).filter(h => h.score>=12).sort((a,b) => b.score-a.score)[0];
  const incomplete = knownWeatherPercent < 95;
  const assessed = score >=30 || !incomplete;
  const summary = !assessed ? 'Weather coverage is incomplete; overall risk is unknown.' : material ? `${material.title}${highRiskKm>0 ? ` affects ${highRiskKm<1 ? 'a short section' : `about ${(highRiskKm*.621371).toFixed(1)} miles`}` : ' is the main detected concern'}.${incomplete ? ' Weather coverage is limited.' : ''}` : 'No significant weather hazards detected in the available data.';
  return {score:assessed?score:null,level:assessed?riskLevel(score):null,peakScore,highRiskKm,knownWeatherPercent,mean,percentile90,summary};
}

export function recommendRoute(routes: AssessedRoute[]): {recommendedId:string;recommendation:string} {
  if (!routes.length) throw new Error('No routes to compare.');
  const primary = routes[0];
  const enoughData = (r:AssessedRoute) => r.score !== null && r.knownWeatherPercent >=95 && ['available','outside-coverage'].includes(r.data.alerts.state);
  if (!enoughData(primary)) return {recommendedId:primary.id,recommendation:'Showing the standard route. Data gaps prevent a reliable risk comparison.'};
  if (primary.level === 'Low Risk') return {recommendedId:primary.id,recommendation:'The standard route has Low Risk in the available data; extra travel is not justified.'};
  const high = primary.level === 'High Risk';
  const eligible = routes.slice(1).filter(r => {
    if(!enoughData(r) || primary.score!-r.score! < (high?12:10)) return false;
    const extraMinutes = (r.durationSeconds-primary.durationSeconds)/60;
    return r.durationSeconds/Math.max(primary.durationSeconds,1) <= (high?1.6:1.3)
      && extraMinutes <= (high?90:30) && r.distanceKm/Math.max(primary.distanceKm,.1) <= (high?1.65:1.35);
  });
  // Utility is used only after hard travel budgets and a material risk improvement pass.
  const utility = (r:AssessedRoute) => (primary.score!-r.score!)*(high?2:1) - Math.max(0,(r.durationSeconds-primary.durationSeconds)/60)*.25 - Math.max(0,r.distanceKm-primary.distanceKm)*.025;
  eligible.sort((a,b)=>utility(b)-utility(a)||a.durationSeconds-b.durationSeconds||a.id.localeCompare(b.id));
  const best = eligible[0];
  if (!best) return {recommendedId:primary.id,recommendation:high?'No materially lower-risk practical alternate was found. Consider delaying travel and follow official guidance.':'No alternate offers enough risk reduction within a reasonable detour.'};
  const extra = Math.max(0,Math.round((best.durationSeconds-primary.durationSeconds)/60));
  return {recommendedId:best.id,recommendation:`${best.name} has a ${primary.score!-best.score!}-point lower risk index for ${extra ? `${extra} extra minutes` : 'no extra travel time'}.${best.level === 'High Risk' ? ' It still contains High Risk conditions; consider delaying travel.' : ''}`};
}

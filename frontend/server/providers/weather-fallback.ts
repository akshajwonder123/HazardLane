import type { Weather } from '../../lib/domain';
import type { WeatherProvider } from '../contracts';

export function hasWeatherValues(weather: Weather | null | undefined): boolean {
  return !!weather && [weather.temperatureC,weather.precipitationMm,weather.snowfallCm,weather.windKmh,weather.gustKmh,weather.visibilityM,weather.code]
    .some(value => typeof value === 'number' && Number.isFinite(value));
}

/** Keep useful primary rows intact; never splice forecasts from different models. */
export function withWeatherFallback(primary: WeatherProvider, fallback: WeatherProvider): WeatherProvider {
  return { async forecast(samples) {
    const first = await primary.forecast(samples);
    const missing = samples.map((sample,index)=>({sample,index})).filter(({index})=>!hasWeatherValues(first.value[index]));
    if (!missing.length) return first;
    let second;
    try { second = await fallback.forecast(missing.map(item=>item.sample)); }
    catch { return {...first,status:{...first.status,detail:`${first.status.detail} The independent NWS forecast fallback is unavailable.`}}; }
    const value = samples.map((_,index)=>first.value[index]??null);
    let recovered = 0;
    missing.forEach(({index},position)=>{
      const row = second.value[position];
      if (hasWeatherValues(row)) {value[index]=row; recovered++;}
    });
    return {value,status:{state:value.some(hasWeatherValues)?'partial' as const:'unavailable' as const,
      detail:`${first.status.detail} NWS supplied partial forecast evidence for ${recovered} missing locations. ${second.status.detail}`}};
  }};
}

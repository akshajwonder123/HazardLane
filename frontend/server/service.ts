import { createApi } from './api';
import { createAnalyzer } from './analyzer';
import { createHttpClient } from './http-client';
import { createGeocoder, createRouter } from './providers/routing';
import { createWeatherProvider } from './providers/weather';
import { createAlertProvider } from './providers/alerts';
import { createRoadProvider } from './providers/roads';
import { createRoadEventProvider } from './providers/events';

export interface ProviderSettings { geocoder?:string; router?:string; weather?:string; alerts?:string; alertGis?:string; roads?:string; events?:string }
/** Settings are trusted server configuration, never request parameters. */
export function createServices(settings:ProviderSettings={},allowedOrigins:string[]=[]){
  const endpoints={geocoder:'https://photon.komoot.io',router:'https://valhalla1.openstreetmap.de',weather:'https://api.open-meteo.com',alerts:'https://api.weather.gov',alertGis:'https://mapservices.weather.noaa.gov/static/rest/services/nws_reference_maps/nws_reference_map/MapServer',roads:'https://overpass-api.de',events:'https://iowa-atms.cloud-q-free.com/api/rest/dataprism/wzdx/wzdxfeed',...settings};
  const client=createHttpClient({allowedOrigins:Object.values(endpoints)});
  const geocoder=createGeocoder(client,endpoints.geocoder);
  const providers={router:createRouter(client,endpoints.router),weather:createWeatherProvider(client,endpoints.weather),alerts:createAlertProvider(client,endpoints.alerts,endpoints.alertGis),roads:createRoadProvider(client,endpoints.roads),events:createRoadEventProvider(client,endpoints.events)};
  const analyzer=createAnalyzer(providers);
  return{geocoder,providers,analyzer,handle:createApi({geocoder,analyzer,allowedOrigins})};
}

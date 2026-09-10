/** Explicit live smoke check; never part of the offline unit-test suite. */
import { createHttpClient } from '../server/http-client';
import { createGeocoder, createRouter } from '../server/providers/routing';
import { createWeatherProvider } from '../server/providers/weather';
import { createAlertProvider } from '../server/providers/alerts';
import { createRoadProvider } from '../server/providers/roads';
import { sampleRoute } from '../lib/geometry';
async function main() {
  const client=createHttpClient({allowedOrigins:['https://photon.komoot.io','https://valhalla1.openstreetmap.de','https://api.open-meteo.com','https://api.weather.gov','https://mapservices.weather.noaa.gov','https://overpass-api.de']});
  const from={id:'dc',label:'Washington',lat:38.9072,lon:-77.0369};
  const to={id:'baltimore',label:'Baltimore',lat:39.2904,lon:-76.6122};
  const [locations,routes]=await Promise.all([createGeocoder(client).search('Washington DC'),createRouter(client).routes(from,to)]);
  if(!locations.length||!routes.length)throw new Error('Live geocoding/routing returned no results');
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),locations:locations.length,routes:routes.map(r=>({km:r.distanceKm,seconds:r.durationSeconds,vertices:r.coordinates.length}))}));
  const samples=sampleRoute(routes[0],new Date().toISOString(),8);
  const results=await Promise.allSettled([createWeatherProvider(client).forecast(samples),createAlertProvider(client).alerts(routes[0]),createRoadProvider(client).attributes(routes[0],samples)]);
  results.forEach((r,i)=>console.log(JSON.stringify({provider:['weather','alerts','roads'][i],...(r.status==='fulfilled'?{status:r.value.status,items:r.value.value.filter(v=>v!==null).length}:{error:String(r.reason)})})));
  if(results.some(r=>r.status==='rejected'||r.value.status.state==='unavailable'))process.exitCode=1;
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Provider smoke check failed');process.exitCode=1;});

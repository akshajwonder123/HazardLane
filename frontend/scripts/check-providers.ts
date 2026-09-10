/** Explicit live smoke check; never part of the offline unit-test suite. */
import { createHttpClient } from '../server/http-client';
import { createGeocoder, createRouter } from '../server/providers/routing';
import { createWeatherProvider } from '../server/providers/weather';
import { createAlertProvider } from '../server/providers/alerts';
import { createRoadProvider } from '../server/providers/roads';
import { createRoadEventProvider } from '../server/providers/events';
import { sampleRoute } from '../lib/geometry';
import { createServices } from '../server/service';
async function main() {
  const client=createHttpClient({allowedOrigins:['https://photon.komoot.io','https://valhalla1.openstreetmap.de','https://api.open-meteo.com','https://api.weather.gov','https://mapservices.weather.noaa.gov','https://overpass-api.de','https://iowa-atms.cloud-q-free.com']});
  const iowa=process.argv.includes('--iowa');
  const from=iowa?{id:'desmoines',label:'Des Moines',lat:41.5868,lon:-93.625}:{id:'dc',label:'Washington',lat:38.9072,lon:-77.0369};
  const to=iowa?{id:'iowacity',label:'Iowa City',lat:41.6611,lon:-91.5302}:{id:'baltimore',label:'Baltimore',lat:39.2904,lon:-76.6122};
  if(process.argv.includes('--analysis')){
    const started=Date.now();const result=await createServices().analyzer.analyze(from,to);
    console.log(JSON.stringify({checkedAt:result.analyzedAt,elapsedMs:Date.now()-started,recommendedId:result.recommendedId,recommendation:result.recommendation,routes:result.routes.map(r=>({id:r.id,km:r.distanceKm,score:r.score,level:r.level,segments:r.segments.length,samples:r.sampleCount,weather:r.knownWeatherPercent,hazards:r.hazards.length,data:r.data}))}));
    if(!result.routes.length||result.routes.some(r=>!r.segments.length||r.data.weather.state==='unavailable'))process.exitCode=1;
    return;
  }
  const [locations,routes]=await Promise.all([createGeocoder(client).search(from.label),createRouter(client).routes(from,to)]);
  if(!locations.length||!routes.length)throw new Error('Live geocoding/routing returned no results');
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),locations:locations.length,routes:routes.map(r=>({km:r.distanceKm,seconds:r.durationSeconds,vertices:r.coordinates.length}))}));
  const samples=sampleRoute(routes[0],new Date().toISOString(),8);
  const results=await Promise.allSettled([createWeatherProvider(client).forecast(samples),createAlertProvider(client).alerts(routes[0]),createRoadProvider(client).attributes(routes[0],samples),createRoadEventProvider(client).events(routes[0])]);
  results.forEach((r,i)=>console.log(JSON.stringify({provider:['weather','alerts','roads','events'][i],...(r.status==='fulfilled'?{status:r.value.status,items:r.value.value.filter(v=>v!==null).length}:{error:String(r.reason)})})));
  if(results.some(r=>r.status==='rejected'||r.value.status.state==='unavailable'))process.exitCode=1;
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Provider smoke check failed');process.exitCode=1;});

/** Explicit live check of route geometry versus official alert coverage; not an offline test. */
import assert from 'node:assert/strict';
import { createHttpClient } from '../server/http-client';
import { createRouter } from '../server/providers/routing';
import { createAlertProvider } from '../server/providers/alerts';
import type { Availability, Location } from '../lib/domain';

const location=(label:string,lon:number,lat:number):Location=>({id:label,label,lon,lat});
const cases:{from:Location;to:Location;expected:Availability}[]=[
  {from:location('Washington DC',-77.0369,38.9072),to:location('Baltimore',-76.6122,39.2904),expected:'available'},
  {from:location('Toronto',-79.3832,43.6532),to:location('Montreal',-73.5673,45.5017),expected:'outside-coverage'},
  {from:location('Detroit',-83.0458,42.3314),to:location('Windsor',-83.0364,42.3149),expected:'partial'},
];
async function main(){
  const client=createHttpClient({allowedOrigins:['https://valhalla1.openstreetmap.de','https://api.weather.gov','https://mapservices.weather.noaa.gov']});
  const router=createRouter(client),alerts=createAlertProvider(client);
  for(const scenario of cases){
    const started=Date.now();
    const [route]=await router.routes(scenario.from,scenario.to);
    assert.ok(route,'A real driving route is required');
    const result=await alerts.alerts(route);
    console.log(JSON.stringify({checkedAt:new Date().toISOString(),from:scenario.from.label,to:scenario.to.label,distanceKm:route.distanceKm,vertices:route.coordinates.length,elapsedMs:Date.now()-started,alerts:result.value.length,status:result.status}));
    assert.equal(result.status.state,scenario.expected);
  }
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Coverage validation failed');process.exitCode=1;});

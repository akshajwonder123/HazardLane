# Third-party data and software

Keep visible map attribution and dependency notices when redistributing the application. The repository does not assign a new license to the owner's pre-existing source; contact the owner for source reuse permissions.

## Data and hosted services

- [OpenStreetMap contributors](https://www.openstreetmap.org/copyright): ODbL geographic data used by routing, Photon and Overpass. The UI includes the required map attribution; derived-data redistribution has separate obligations under the source license.
- [OpenFreeMap](https://openfreemap.org/) and [OpenMapTiles](https://openmaptiles.org/): road-map style/tiles; visible attribution remains enabled. No API key is required.
- [Open-Meteo](https://open-meteo.com/en/licence): weather data licensed CC BY 4.0. HazardLane samples and transforms the forecasts; computed risk is HazardLane's experimental interpretation. Hosted free-service use must also comply with [its noncommercial service terms](https://open-meteo.com/en/terms).
- [NWS API](https://www.weather.gov/documentation/services-web-api) and [NOAA reference maps](https://mapservices.weather.noaa.gov/static/rest/services/nws_reference_maps/nws_reference_map/MapServer): official US alerts and county/zone boundaries. [Alert geolocation guide](https://www.weather.gov/media/documentation/docs/NWS_Geolocation.pdf).
- [Iowa DOT 511 data feeds](https://iowadot.gov/travel-tools/iowa-511/511-data-feeds): construction-only WZDx reports. This is not a complete closure or winter-road-condition feed.
- [Valhalla](https://valhalla.github.io/valhalla/) and [Photon](https://photon.komoot.io/): replaceable open routing and geocoding software/public instances, with hosted-service capacity and availability limits.
- [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API): bounded access to OSM tags, not a pavement inspection service.

## Principal software dependencies

Exact versions are locked in frontend/package-lock.json. Their own license files in installed packages are authoritative.

| Component | License |
|---|---|
| Next.js, React, React DOM | MIT |
| MapLibre GL JS | BSD-3-Clause |
| Lucide icons | ISC |
| TypeScript | Apache-2.0 |
| Tailwind CSS, PostCSS, Autoprefixer | MIT |
| esbuild, tsx | MIT |

The build copies MapLibre's standalone worker, shared module, and LICENSE to the public vendor directory. Next/esbuild-generated license notices are retained. Transitive dependencies retain their respective licenses; inspect the lockfile and installed packages when preparing a redistribution. Provider names identify sources and do not imply endorsement of HazardLane's scores.

Schema generation uses Drizzle Kit (MIT) and Drizzle ORM (Apache-2.0) as development dependencies; their installed license files are authoritative.

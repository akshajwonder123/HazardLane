# StormRoute

A map-first weather-aware driving planner. Choose an origin and destination, compare real road routes, and see Low, Medium, or High Risk along the journey. Scores are a transparent experimental hazard index—not a crash probability or a guarantee of safe travel.

StormRoute uses public, keyless services and does not call a generative-AI API at runtime. The default configuration is intended for a small noncommercial demonstration, not high-volume navigation.

## Run locally

Prerequisites: **Node.js 22 or newer with npm**, and an internet connection for maps and live data. No Python, Docker, database, API key, account registration, or geographic download is required.

From the repository root:

```sh
npm run setup
npm run dev
```

Open **http://localhost:3000**. The development command starts both Next.js and the API on port 8788. The first page compilation can take longer than later requests. Frontend changes reload automatically; restart development after changing server code. Stop with Ctrl+C.

For the production-style build and server:

```sh
npm run build
npm start
```

This serves the built website and API together at **http://localhost:3000**. Stop development before starting production on the same port. `PORT` changes the production port; `HOST=0.0.0.0` permits connections beyond the local machine when intentionally hosting it.

## What it does

- Photon search-as-you-type with keyboard selection, cancellation of stale searches, and origin/destination swap.
- Valhalla automobile routes and up to two distinct alternatives using static speeds, without live traffic ETA.
- Adaptive sampling at roughly 2 km spacing, capped at 64 points per route. Forecast requests are deduplicated and batched across routes.
- Open-Meteo hourly forecasts selected for estimated arrival. Precipitation, snowfall, and gusts use the enclosing hour-ending aggregate; instantaneous variables use the nearest in-horizon hour.
- Exact route intersections with NWS warning polygons. County/forecast-zone alerts with no polygon are resolved through NOAA GIS candidate areas and NWS zone boundaries.
- Localized risk colors, hazard explanations and approximate locations, route comparison, and explicit data-coverage details.
- Sparse OSM road attributes and fresh Iowa work-zone reports. Missing information stays unknown.

## Method and limitations

The deterministic model emphasizes precipitation intensity, damaging gusts, low visibility, snow, and precipitation near freezing. Dry cold alone adds no risk. Mapped bridges and unpaved roads can modestly amplify relevant weather hazards; unknown road tags never add a penalty. Official driving-related warnings and verified reported closures establish strong score floors.

Scores are bounded 0–100: **Low <30**, **Medium 30–59**, **High ≥60**. Route aggregation combines distance-weighted exposure, the 90th percentile, and peak/critical floors. A short High Risk section cannot disappear in a long clear route. Alternatives must offer a material improvement within explicit time/distance budgets; Low Risk normally retains the standard route. See [the full mathematical model and calibration](docs/RISK_MODEL.md).

Forecast samples do not measure every metre of pavement. Longer routes have coarser spacing, arrival times are estimates, and conditions may change. NWS describes the current US outlook; a warning expiring before estimated arrival remains visible with a reminder to check updates. Non-US official-alert coverage is unavailable. Polygon intersections use a local longitude/latitude plane, not a polar geodesic engine.

OSM describes static mapped attributes, not present pavement, potholes, treatment, flooding depth, or inspection results. Only a small number of roadway locations are checked, and effects are restricted to those locations.

The Iowa WZDx feed includes construction projects, not all incidents or closures. Reports must be fresh and within their stated period. Geometry often contains reported points rather than a road centerline; points are not connected into invented affected segments. Direction and road identity must match. Recurring schedules do not establish a confirmed active closure. An empty report list never proves that no closures exist.

Weather failures preserve routes with unknown coverage; available warnings can still establish danger. Routing failure prevents analysis. Follow official warnings, signs, road closures, and local authorities regardless of the score. This is not turn-by-turn navigation or an emergency decision system.

## Architecture

```text
frontend/app, components     Next.js static UI, MapLibre map
frontend/lib                 normalized models, geometry, risk and recommendations
frontend/server/providers    replaceable geocoding/routing/weather/alerts/roads/events
frontend/server/analyzer.ts  spatial/time assembly and deterministic explanations
frontend/server/api.ts       bounded API requests, rate limits and response handling
frontend/server/http-client.ts  caching, coalescing, timeouts and origin restrictions
frontend/server/runtime-*    Node server and portable Worker adapters
```

`npm run build` produces `dist/client`, the Worker at `dist/server/index.js`, and the Node server at `dist/node/server.mjs`. The Node runtime uses no separate backend installation. The original single-location Python implementation is preserved in Git history (`40c1458`) and in the owner's original source folder; it is no longer the active application.

API endpoints:

| Method and path | Purpose |
|---|---|
| `GET /api/search?q=...` | 3–160 character query; returns normalized `locations` |
| `POST /api/analyze` | JSON `{origin, destination}` using selected locations; returns route geometry, segments, scores, hazards and coverage |
| `GET /api/health` | Runtime health without upstream requests |

Coordinates use longitude/latitude order in geometry. Selected locations contain `id`, `label`, `lat`, `lon`, and optional `countryCode`. Analysis requests are limited to 4 KB; endpoints must be at least 100 m and at most 6,000 km apart. Provider responses, geometry sizes and durations are independently bounded. Long/out-of-horizon weather remains unknown.

## Configuration and public-service limits

Defaults work without configuration. The Node server accepts optional server-side environment variables: `GEOCODER_URL`, `ROUTER_URL`, `WEATHER_URL`, `NWS_URL`, `NWS_GIS_URL`, `OVERPASS_URL`, and `WZDX_URL`. These must implement the existing adapter's protocol; changing a URL does not translate a different API schema. No provider URL is accepted from the browser. `.env` files are not loaded automatically; use environment variables or Node's `--env-file` option when needed. No environment file is required for the default setup.

The Worker uses the same provider factory and defaults; platform-specific configuration can be passed to that factory by its runtime adapter. It requires an `ASSETS` binding for `dist/client`. Sites metadata is in `.openai/hosting.json`; private hosting must be validated before treating a local build as deployed.

| Data | Cache lifetime |
|---|---:|
| Location search | 24 hours |
| Driving route | 6 hours |
| Hourly forecast | 10 minutes |
| Active alerts | 60 seconds |
| Zone boundaries and road metadata | 24 hours |
| Iowa work-zone feed | 5 minutes; reject feed snapshots over 15 minutes old |

The in-memory upstream cache holds at most 256 entries / 24 MB and coalesces identical concurrent requests. Six upstream requests run at once, with a bounded queue and provider-specific timeouts. Redirects are prohibited and requests can reach only configured provider origins. HTTP 429 responses trigger a short host cooldown.

The demonstration API permits at most 2 analyses per minute, 20 per hour, and 40 per day per process, plus bounded per-client requests. These are **not distributed quotas**: multiple processes, restarts, or Worker instances have independent state. Keep deployment small/private; use shared rate enforcement and suitable self-hosted/open infrastructure before scaling. Public endpoints can throttle or fail and have no service guarantee. They are replaceable interfaces, not permanent infrastructure commitments.

Open-Meteo's free hosted API is for noncommercial use and has upstream limits of fewer than 10,000 calls/day, 5,000/hour and 600/minute; coordinate batching does not imply unlimited use. See its [current terms](https://open-meteo.com/en/terms). Photon asks for fair usage and may throttle; see [Photon's service terms](https://photon.komoot.io/). No paid plan is required by this project.

## Tests and live checks

```sh
npm test
npm run build
```

Offline tests cover scenario calibration, short dangerous sections, warning intersections and holes, date-line geometry, missing data, alternate utility, batching/timestamps, malformed providers, road/event matching, API validation and cache restrictions. Build performs TypeScript and Next validation.

Optional explicit live checks from `frontend` (these contact public providers):

```sh
node --import tsx scripts/check-providers.ts
node --import tsx scripts/check-providers.ts --iowa --analysis
node --import tsx scripts/check-runtime.ts
```

The last check expects the production-style website already running on port 3000. Live checks can legitimately report provider outages; do not replace those failures with mock production results. Verified milestones and remaining acceptance checks are recorded in [STORMROUTE_STATE.md](STORMROUTE_STATE.md).

## Privacy and attribution

No account, journey-history database, advertising, analytics SDK, or runtime AI service is included. Search text and coordinates go to relevant providers. Responses are temporarily cached in server memory; providers and hosting infrastructure have their own logging/retention practices. Map tiles are fetched by the browser. Do not infer that third-party requests are anonymous or never logged.

The map displays OpenFreeMap, OpenMapTiles, and OpenStreetMap attribution. Weather is provided by Open-Meteo (CC BY 4.0); StormRoute transforms those forecasts into an experimental index. NWS/NOAA provides US alerts and reference boundaries. Iowa DOT provides regional construction reports. See [THIRD_PARTY.md](THIRD_PARTY.md) for links and dependency notices. No endorsement by a data provider is implied.

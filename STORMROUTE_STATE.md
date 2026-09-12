# StormRoute working state

Updated 2026-09-12T21:48:50Z. **Goal blocked by hosted weather availability; MVP incomplete.** Resume only the unfinished hosted-weather and final-acceptance gates. Full objective: docs/GOAL_OBJECTIVE.md. Operating policy: docs/OPERATING_POLICY.md and AGENTS.md. Previous turn made concrete progress: clearer provider failure details, verified production build, private version6 and browser validation. Do not redo completed risk fixes, coverage checks or clean installation.

## Current release gate and exact next task

Private site: https://stormroute.akshajwonder.chatgpt.site. Owner-only audience verified (one owner, no groups or external visitors). Hosting works, but Open-Meteo returns HTTP429 from the hosted server and Overpass returns HTTP521. On 2026-09-12T21:35:40Z, hosted DC–Baltimore returned3 real routes (62.262/71.227/65.221km),33/37/34samples,0%weather and unknown risk. Primary NWS coverage available; alternate alert coverage partial. The failures also occurred September11; this is an external availability gate, not evidence of safe weather. Do not bypass upstream rate limits or substitute fabricated results.

Weather-failure-detail work integrated and privately deployed: adapter maps errors to fixed safe explanations, analyzer preserves material reasons with per-route counts and labels combined-route status clearly. Root reviewed the worker changes and added total-outage reason checks. Focused weather/analyzer21tests pass; TypeScript and full documented production build passed September12. Hosted browser visibly confirms the explicit rate-limit explanation and unknown risk; screenshot inspected. OSM recovered in that browser request (12of33samples, partial), so only hosted weather remains the live blocker. No risk calculations or provider substitutions changed. Next: once providers allow legitimate requests again, verify hosted complete forecasts/risk/map/alternate interaction, update docs/RELEASE_AUDIT.md and this file, then perform final full-objective acceptance. Only mark MVP complete after every release gate passes. No broad reimplementation, redeploy or repeated clean install is needed.

Continuity: prior turn made progress (clearer safe failure reasons, tests, production build, version6 and browser verification). The next continuation revalidated the clean checkpoint and unchanged live version6, then made one legitimate hosted check after cooldown at21:48:50Z: all3routes still have0%weather with explicit Open-Meteo rate-limit reason. This is the third consecutive goal turn with the same external blocker; no independent release work remains that can establish complete hosted weather. Goal marked blocked under the three-turn rule. Resume when provider availability changes, then verify the remaining full-weather/browser/final-acceptance gates. Do not run rapid quota retries, rebuild, redeploy or substitute fake weather. Current owner preview tab providerTabId browser-use:b22cfc20-edc0-44ac-973e-ef63d2e32d5c was marked handoff; revalidate before use. open_in_codex restored normal owner authentication when a direct CUA navigation showed sign-in; no credentials entered or access changed.

## Deployment and checkpoint recovery

Latest deployed source:49dc47c1b02a80a962ae02262faa5cf159aa14ac, version6. Project:appgprj_6aa0d6b6a8e881918055225955eaf259. Version:appgprj_6aa0d6b6a8e881918055225955eaf259~appgver_c339dc96c7cc8191bcf5046691342e22. Deployment:appgdep_6aa5c7b848f0819199d9cdb1a228fdcf succeeded2026-09-12T21:44:46Z. Do not repoll/redeploy a terminal unchanged version or create another Site. Authenticated hosted analysis21:46:06Z returned3routes with explicit Open-Meteo rate-limit detail and0%weather. Refresh the browser after a new deployment settles; immediate requests can hit the preceding script. Archive .artifacts/stormroute-release-v6.tar.gz validated31files,sha256:ffa9b64f59b1b92dedbe3d60e753535451bec7cadfc087d798ece22aa0cbc4e0.

Hosted defect fixed at c8a7104: this edge rejected redirect:error before any network request. manual redirects plus rejection of all non-OK responses preserve the no-redirect security invariant. Earlier db55742 additionally resolves globalThis.fetch inside requests. Transport diagnostics log origin/error metadata without request paths, queries or payloads. Credentials only ephemeral tool memory; never write them to files/config/output. Deployment archives in ignored .artifacts contain only generated output/hosting metadata.

## Product and architecture

Map-first weather-aware driving planner; real locations and routes, localized Low/Medium/High or unknown risk, practical alternative comparison and plain-language causes. Informational heuristic, not crash probability or guaranteed road safety. No runtime generative AI.

- frontend/app and components: Next15/React19/TypeScript static export, Tailwind, MapLibre6/OpenFreeMap; autocomplete, swap, cancel, route cards, hazard focus, coverage, methodology and privacy.
- frontend/lib: nullable domain models, distance-indexed geometry/sampling/intersections, provider-independent deterministic risk engine.
- frontend/server/providers: normalized Photon, Valhalla, Open-Meteo, NWS/NOAA GIS, OSM Overpass and Iowa WZDx adapters. contracts.ts separates payloads from engine/UI.
- analyzer.ts: parallel ancillary data, shared batched forecasts, spatial and temporal hazard cuts, route aggregation/recommendation. service.ts composes API/providers.
- runtime-node.ts serves production API/static files; runtime-worker.ts delegates assets to ASSETS and API to the same service. API defaults same-origin, trusted runtime client IDs, bounded inputs and quotas.
- scripts/frontend.mjs supplies root setup/dev/test/build/start; frontend scripts prepare MapLibre assets, run dev servers and bundle Node/Worker. Production output is dist/client, dist/node/server.mjs and dist/server/index.js. Generated output/cache ignored.

Original source C:\Users\aksha\OneDrive\Desktop\Pyhton\StormRoute was inspected and left untouched. Sanitized baseline40c1458 preserves original files. Existing Next/React retained; obsolete Python backend retired only after replacement validation. Working repository is C:\Users\aksha\OneDrive\Documents\ChatGPT\Stormroute.

## Models, math and provider decisions

Coordinates are lon/lat. Location, DrivingRoute with maneuver indices, Sample with distance/arrival, nullable seven-field Weather, geographic WeatherAlert, RoadAttributes, validated RoadEvent routeMatch positions, RiskSegment and AssessedRoute are internal normalized contracts. Events retain validated road/direction/edge positions through analysis.

Sampling targets roughly2km, max64points/route192total. Arrival uses proportional distance/static-speed ETA. Hour-ending rain/snow/gust aggregates and nearest in-horizon instantaneous forecasts; no out-of-range substitution. Geometry cuts preserve warnings between samples, short onset/event windows and holes/multipolygons; localized road evidence is not smeared along routes. Road match influence about20m and reported-event points35m clipped to validated edges.

Risk math and calibration: docs/RISK_MODEL.md. Nonlinear rain/wind/visibility/snow curves, near-freezing precipitation interaction, capped roadway modifiers12, explicit severe-alert/closure floors. Route exposure=.45distance-weightedMean+.35P90+.20peak with protected peak/critical floor; any positive High section retains High. Thresholds Low<30, Medium30–59, High>=60. Less than95%complete weather without material hazards stays unknown. Comparison requires reliable weather/alert coverage, meaningful10/12point improvement and bounded added time/distance; Low primary retained. Five-mile danger cannot vanish inside1000km clear road.

Public keyless providers are replaceable: Photon search, Valhalla auto routes up to2alternatives, Open-Meteo forecasts, NWS current actual land alerts plus NOAA forecast/county boundaries, sparse static OSM tags, fresh Iowa work-zone reports. NWS coverage uses actual route/boundary union, not bounding-box country guesses. Iowa is regional/partial; endpoints are not invented closure centerlines. Unknown tags never add danger. No paid API, account, large geographic download or runtime AI key required for local use.

## Cache, limits, security and privacy

Cache TTLs: search24h, routes6h, weather10min, active alerts60s, zones/road tags24h, Iowa5min with15min freshness ceiling. Max256entries/24MB, six upstream requests, queue48, cloned coalesced results, bounded bodies/timeouts,429cooldown and no success-cached failures. Origin allowlist and no redirects prevent arbitrary proxying. API JSON max4KB; strict coordinates/query/location bounds; two concurrent analyses; global2/min20/hr40/day plus client quotas. Limits are per process, not distributed.

No app account/history database, analytics SDK or ads. Provider responses are temporarily cached and providers/hosting may log requests. Private Sites access itself requires the owner's ChatGPT session. Diagnostics omit journey queries/coordinates. Never commit credentials.

## Verified completed gates

- Final risk/geometry/event audit fixes: localized distinct alternates, preserved road/direction positions, exact temporal cuts and actual NWS coverage. All95offline tests passed; no repeats needed without changes.
- Live provider/analysis routes: DC–Baltimore3routes; Iowa184.246km/64complete forecasts/actual I-80 reports; London–Oxford3routes/53complete forecasts. Dedicated real coverage test DCavailable, Torontooutside, Detroit–Windsorpartial passed.
- UI/privacy/source polish:12pxminimum metadata, Photon/Iowa attribution, precise cache privacy, time rounding, tiny positive High distance, mobile focus/controls and root MapLibre stylesheet. Production screenshots390x844,768x1024,1280x800 inspected; no horizontal overflow or console errors. Keyboard, swap, cancel, dialog/Escape, alternate, fit and hazard navigation passed; same-location100metre error passed.
- Isolated clean gate:fbcf4b3 git archive to .artifacts/clean-fbcf4b3, no dependencies/output before setup. Documented root setup installed131packages;95tests passed; complete production build passed; npm start on3002; runtime page/health/mapworker/method/input/static isolation passed from clean copy. Only Node24/npm/internet prerequisites. esbuild needed normal sandbox filesystem escalation, not a project workaround. No borrowed dependencies. Record in clean-copy clean-install-verification.txt.
- Hosted checks: owner-private publication; Photon200/6results, real3routes/markers/map, primary USalerts. APIhealth200, mapworker200JavaScript, /server/index.js and /.env404; unauthenticated requests401. Complete hosted weather/risk remains unverified because429.
- Edge correction: focused HTTP/Worker9tests passed, including request-time fetch binding and302rejection/no follow/no success cache; TypeScript and changed server production bundle passed. These tests add2cases to the previously verified95; no claim of a fresh97-test full run.

## Setup and environment

Prerequisites Node22+ with npm and internet. At repository root: npm run setup; npm run dev (UI3000/API8788); npm test; npm run build; npm start (production3000). PORT/HOST configure production. Restart development after server changes. README has complete instructions. This host has Node24; npm.cmd is under original .tools/node-v24.18.0-win-x64. Git writes/native esbuild need sandbox escalation here. Revalidate old process handles before using; never restart solely for observation timeout.

Node optional trusted server configuration: GEOCODER_URL, ROUTER_URL, WEATHER_URL, NWS_URL, NWS_GIS_URL, OVERPASS_URL, WZDX_URL; defaults work locally, no .env required or automatically loaded. URLs must implement adapter protocols; browser cannot select providers. Worker uses defaults/ASSETS. Sites0.1.62 profile script selected portable/configured:false; Windows custom Next/Worker output retained. Its build helper could not find npm; the documented root build succeeded with installed npm.cmd. Its plugin path then disappeared; existing0.1.57 package-site.sh was found and successfully reused via Git Bash with /c/... paths. These are tooling-environment issues, not developer setup changes.

## Known limitations and remaining work

Hosted Open-Meteo429 is the current release blocker; Overpass521 is gracefully degraded optional data. No other known blocking code defect after completed audits. Free services have caps/no SLA; free Open-Meteo intended noncommercial. Shared edge egress may be involved but cause of quota exhaustion is not established. Respect provider cooldown; no quota bypass.

Forecasts are finite samples, not measured pavement; no traffic ETA; official alerts US/current outlook only; static tags sparse; Iowa events approximate and incomplete; geometry is not designed for polar navigation. Shared enforcement/self-hosting needed before broad scale. README/THIRD_PARTY/RISK_MODEL document limits and licenses. docs/RELEASE_AUDIT.md tracks requirement evidence; hosted complete weather, final hosted screenshot/interaction confirmation and final acceptance/state signoff remain. All earlier detailed chronology is recoverable from Git; this concise state supersedes it.

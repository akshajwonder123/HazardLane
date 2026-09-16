# StormRoute working state

Updated September14,2026 at22:16UTC. **MVP incomplete; final live acceptance remains open.** Read docs/GOAL_OBJECTIVE.md and docs/OPERATING_POLICY.md. Completed work must not be restarted. Historical detail is preserved in Git.

## Current release and next action

Version9 is privately live at https://stormroute.akshajwonder.chatgpt.site. Source ec1cc9e57b6ad4da04051a7b9ebb9f7b7973733e; project appgprj_6aa0d6b6a8e881918055225955eaf259; version appgprj_6aa0d6b6a8e881918055225955eaf259~appgver_efbac037984c8191bb71a8d92c71a375; deployment appgdep_6aa871d82ff08191b8596887595d9081 succeeded2026-09-14T22:14:58.648665Z, environment revision1. Owner role, oneviewer, nogroups verified. No unchanged redeploy or terminal status polling needed. Archive .artifacts/stormroute-release-v9.tar.gz:34files, sha256:4a2c1bcc54214b54aac258f25a6092336ce24236de1ded29790139a9416b655a.

Remaining gates: real hosted routing/weather with shared quota behavior; hosted known-risk map/alternate/browser checks; final requirement-by-requirement acceptance and documentation signoff. Do not mark complete on a lucky weather retry alone. docs/WEATHER_RELIABILITY.md records actual429evidence and resilience changes. docs/RELEASE_AUDIT.md records completed objective coverage.

September14 hosted checks returned routerHTTP502 then routing timeout. Live D1weather_budget table remained empty after both, proving no forecast admission. A further proposed check at22:15UTC was rejected by automatic approval review for too-short retry interval; that command did NOT execute. Do not bypass this rejection with another route/tool or immediate retry. Let the provider settle before the next bounded hosted analysis. No useful running provider job exists to poll. Local verification and deployment are finished; do not repeat them merely while waiting.

## Weather reliability and quota preservation

Actual September13T17:55:23.578Z hosted Open-Meteo429JSON: Daily API request limit exceeded. Please try again tomorrow. No usable Retry-After captured. Conservative hold endedSeptember14T17:55:23.578Z; it has elapsed, but new429must establish a new respected deadline. Cause of quota exhaustion (app versus shared edge IP) is unproven.

Forecast cache is per-coordinate, exactrounded0.0001degree,256entries/8MB/10minutes, coalesced misses with fresh arrival selection and no stale success. Max192locations per analysis =>6HTTP batches but192weighted provider calls.32locations/batch,2inflight per forecast operation. HTTP supports full delta/date Retry-After, conservative hourly/daily body-based cooldowns, bounded safe diagnostics and no automatic retries.

Hosted singleton D1binding DB/table weather_budget persists atomic weighted quotas500/minute,4000/hour,8000/day and monotonic provider cooldowns across Worker instances. Reserve only uncached batch coordinates; denial/storage failure sends no weather request. Exact exhausted-window deadlines; no memory fallback in hosted mode. Table stores counters/deadlines only, no journey/coordinate/forecast data. Migration was provisioned successfully. Local Node use remains database/key-free. WEATHER_NOT_BEFORE is configured as2026-09-14T17:55:23.578Z. Shared accounting cannot prevent unrelated apps exhausting a shared provider IP quota.

Verification:23 HTTP/backoff/SQLitebudget/Worker tests plus15forecast tests passed; typecheck/production bundles passed. Do not repeat these unless code changes. New live shared-row/cooldown behavior still requires evidence once routing succeeds.

## Latest clean installation and dependency evidence

Next patched15.5.19->15.5.25; full root build passed. docs/DEPENDENCY_REVIEW.md assesses remaining6moderate/4high build-tool/unused-image advisory chains; no critical remains. Static export and independent Node/Worker mean no Next runtime, ServerActions or imageoptimizer. No untrusted build assets accepted.

Isolated source5be1357 archived to .artifacts/clean-5be1357 with no node_modules/dist. Documented setup74028exit0 installed145packages; build89598exit0 generated static export and Node/Worker; npm start69991serves port3002. Startup89537exit0: page200/StormRoute text, health200/exact okJSON, mapworker200JavaScript, server source404 and .env404. Evidence startup-verification.json in clean folder. No install/build remains running. Original95risk/coverage tests remain valid and were not repeated for dependency-only patch.

## Publishing recovery

Use the existing Sites project only. Source credentials are ephemeral, never persisted. Native ownership/repository evidence resolved an automatic trust rejection of the source push; reviewed retry succeeded. Current0.1.62package launcher failed tolaunch; installed compatible0.1.57package-site.sh worked with Git Bash and /c paths. Include unchanged root drizzle migrations in packaged metadata. Never edit already-applied migration SQL. Original Desktop repository remains untouched.
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

Cache TTLs: search24h, routes6h, weather10min, active alerts60s, zones/road tags24h, Iowa5min with15min freshness ceiling. Max256entries/24MB, six upstream requests, queue48, cloned coalesced results, bounded bodies/timeouts,429cooldown and no success-cached failures. Origin allowlist and no redirects prevent arbitrary proxying. API JSON max4KB; strict coordinates/query/location bounds; two concurrent analyses; global2/min20/hr40/day plus client quotas. General API limits are per process; hosted weather additionally has the shared D1budget described above.

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

## Resumed single live check — September15 evening

Single authorized hosted analysis2026-09-16T01:36:29Z: app200, realValhalla1.026km route,0/4weather. Exact native upstreamlog Open-Meteo429JSON at01:36:30.246Z; cooldown01:37:30.246Z, Overpass521. D1counter61->65 confirms4weighted locations and persisted new block. Preexisting61locations came from other browser activity. No repeated provider retry. Full upstreamheaders are unavailable in old diagnostics; appheaders inspected, do not confuse them. docs/WEATHER_FALLBACK_EVALUATION.md records findings and independent NWS/METNorway evaluation. Next independent work: bounded NWS raw-grid feasibility (interval/unit/category/null semantics), then implement only if faithful; safe header diagnostics if needed for a future authorized observation. Do not mark blocked immediately in this freshly resumed run: meaningful fallback work remains. No code changes this checkpoint; version9stilllive. Browser/fullacceptance remain incomplete.

## NWS feasibility checkpoint — September16UTC

NWS point and returned LWX97,71grid both200; captured real temp/wind/gust/visibility and zero6hourQPF/snow. Read-only risk audit confirms safe partialfallback feasible with existing nullablefields: code staysnull, positive multihour totalsnull, zero only for full hour coverage, calmrouteunknown and meaningful wind/visibility hazards retained. Analyzer partial-vs-unavailable status needs correction on integration. Details docs/WEATHER_FALLBACK_EVALUATION.md. No Open-Meteo retry was made.

Diagnostic-only edits now capture bounded date/retry-after/content-type/server/cf-ray on HTTPerrors, explicit absent/redacted markers; cookies/auth/location never collected.16focused HTTP/rate-limit tests passed. Typecheck and Node/Worker serverbuild session69155 completed exit0. Diagnostic milestone verified locally. Next implement bounded cached NWS partialfallback with stated tests, then integrate/publish; do not claim full forecast coverage or completed acceptance from partialfallback. Current deployedversion9 lacks newheaders; no new liveprobe authorized in this step.

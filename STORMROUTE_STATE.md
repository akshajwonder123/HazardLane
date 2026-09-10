# StormRoute working state

Updated: 2026-09-09 local / 2026-09-10 UTC. Goal ACTIVE and incomplete. Latest completed work: core provider adapters, bounded HTTP/cache and API validation shell. Read docs/GOAL_OBJECTIVE.md for full acceptance criteria and docs/OPERATING_POLICY.md for delegation/continuity policy. Do not restart verified work.

## Starting codebase and preserved checkpoints

Starting source: C:\Users\aksha\OneDrive\Desktop\Pyhton\StormRoute, inspected and left untouched. Sanitized 52 source files copied into this workspace. Baseline 40c1458; original Python tests 29/29 pass. Retained Next15/React19/TypeScript. Separate old FastAPI single-location backend remains baseline only, to retire after replacement validation.

Milestone1 UI: 72b2192. Milestone2 geometry/risk: e7e796b with final build record c087fc9. Operating policy and full goal saved at 6742144. New provider checkpoint follows this state update; find it with git log.

## Current architecture and functionality

- frontend/components: responsive map-first planner, From/To/swap, MapLibre6/OpenFreeMap, autocomplete/results shell, localized route rendering, error/loading/cancel/coverage views and methodology dialog. MapLibre worker/shared modules copied by scripts/prepare-assets.mjs before build/dev. next.config.ts static export; separate .next-dev avoids concurrent build corruption.
- frontend/lib/domain.ts: nullable normalized models. geometry.ts: adaptive sampling, distance-indexed interpolation/slicing, exact planar polygon/ring route intervals (holes/multipolygons/dateline). risk-engine.ts: deterministic nonlinear weather/ice interactions, limited road modifiers, explicit warning floors, distance-weighted mean/P90/peak protection, practical detour recommendations. Exact math/calibration in docs/RISK_MODEL.md. Experimental relative hazard index, not crash probability.
- frontend/server/contracts.ts: stable JsonClient and geocoding/routing/weather/alert/road/event provider interfaces.
- http-client.ts: configured origin allowlist, redirects prohibited, bounded request/response sizes, timeouts, concurrency6/queue48, coalescing, cloned cache values, max256 entries/24MB, host429 cooldown, no success-cached failures. Cache/rate limits are per-process, not distributed infrastructure.
- api.ts: injectable API factory with bounded JSON input, normalized locations, methods/CORS, trusted adapter-supplied client identity, per-client and global quotas. It is NOT wired to a runtime or analyzer yet. Public demonstration defaults: max2 analyses/minute,20/hour,40/day per process; search120/minute globally. Browser supplied provider URLs are ignored and never proxied. Free-provider aggregate budgets require shared/edge enforcement before scaling across instances.
- providers/routing.ts: Photon normalized real autocomplete; Valhalla primary plus <=2 distinct alternates, native trip + top-level alternates schema, polyline6 and maneuver indexing; static freeflow/constrained speed types, no traffic. Query24h/route6h cache. Live POST works; /api Photon did not redirect.
- providers/weather.ts: max192 samples, rounded-coordinate dedupe, <=32 coordinate batches run in pairs, 3-day Open-Meteo hourly forecast,10min cache. Strict ISO arrivals and units/range/order checks. For13:20, precipitation/snowfall/gust use14:00 hour-ending aggregate; instantaneous fields use nearest hourly timestamp. No out-of-horizon substitution; missing fields stay null.
- providers/alerts.ts: active actual land alerts60s; geographically intersects direct warning polygons. Null geometry uses NOAA GIS route-envelope county/forecast-zone candidate IDs, then trusted NWS zone boundary URLs, exact local intersection,24h cache,32zone cap. UGC fallback, stale/invalid/truncated/failed data yield partial. No point-sampling discovery hole for narrow polygons. County layer2 fields state/fips; public-zone layer8 state/zone (state_zone is DC001, not DCZ001). Unknown boundary candidates must never imply clear alerts.
- providers/roads.ts: one bounded Overpass POST, <=12 deduped areas radius60m,8s query/2MB,24h cache. Parses actual Overpass {lat,lon} geometry. Matches within20m and aligned tangent; rejects perpendicular bridge and ambiguous parallel-way tags. Always sparse/partial static-data status. IMPORTANT assembly must apply attributes only locally (~20m around matched sample), not smear a bridge along an entire weather interval.

## Latest verification

Root reviewed provider code, corrected native Valhalla schema, precipitation timestamps, malformed/unsafe NWS handling and interrupted Overpass object-geometry parsing. 71/71 automated tests pass, including provider failures/partial data, API validation/CORS/rate limits, cache/SSRF/timeouts, road matching, weather timing, severe alert geography and original risk/geometry fixtures. TypeScript noEmit passed. Production build outcome appended below.

Live command from frontend: node --import tsx scripts/check-providers.ts (requires network; intentionally separate from offline tests). Root run 2026-09-10T01:32Z: Photon6locations; DC->Baltimore3routes (62.262km/3055.703s/1145vertices;71.227km/3312.794s/1314vertices;65.221km/3530.319s/1366vertices). Weather8/8 available; NWS available updated01:31:37Z,0intersecting alerts; OSM8/8 sampled matches with partial/static status. This is real adapter integration verification, NOT application/browser end-to-end verification.

Previous UI verification: production build; real roads at1440x900 and390x844, dialog open/close, no horizontal overflow. Actual full search/analyze browser journey, tablet and final accessibility checks remain undone. Browser tab1/providerTab7519625c-427b-404f-840e-0af7706c06d3 atlocalhost:3000. Dev process old handle97875 must be checked before reuse. Viewport override390x844 may still be active and should be reset at final handoff.

## Exact next task / unfinished work

1. Finish provider milestone: road-events adapter was assigned but worker hit account usage limit before writing any events.ts. Implement RoadEventProvider and fixtures; preserve coverage honesty. Review NWS outside-US classification when no null-geometry alerts exist (early direct-only return currently says US alerts checked); improve if needed. Audit geometry intersection performance on long routes/complex zones. Existing adapters pass tests/live check; do not reimplement them.
2. Implement route-analysis orchestration using all providers: batch weather across route samples, split segments at forecast midpoints AND exact alert entry/exit distances, time relevance at arrival, narrowly matched road/event evidence, aggregate/recommend/deterministic explanations. Add meaningful cross-system fixtures including narrow warnings, partial failures and no-alt cases.
3. Wire API to Node development adapter (port8788) and portable Worker Request/Response entry; create reproducible startup/build scripts and static serving. UI currently calls /api/search and /api/analyze but no running replacement API exists. Root API factory is not a production service until injected/wired.
4. Real browser search/select/analyze/map/routes/hazards, several live journeys and phone/tablet/desktop/keyboard/error checks. Review small text and final polish.
5. Replace old README with accurate installation/architecture/data/cache/math/licensing/limitations; remove obsolete Python only after replacement verified. Clean documented startup, no manual hacks. Build/package/deploy private Sites and audit full acceptance criteria. No version deployed yet.

## Road-event research preserved

Official IowaDOT page https://iowadot.gov/travel-tools/iowa-511/511-data-feeds links https://iowa-atms.cloud-q-free.com/api/rest/dataprism/wzdx/wzdxfeed. Prior probe version4.0 HTTP200, many MultiPoint duplicated endpoints. Root must reverify freshness and field semantics before adoption. Require fresh root timestamp, currently active dates and meaningful vehicle impact; all-lanes-open/future/expired records do not establish active closure. Only explicit all-lanes-closed, spatially matched and direction-compatible events can create closure floor. Coincident MultiPoints indicate a localized reported point, not a centerline; noncoincident MultiPoints cannot simply be connected. Do not invent statewide/nationwide closure coverage. A Utah feed was stale2023 and rejected. Never print raw USDOT registry rows; some URLs contain keys.

## Setup and deployment context

From frontend: npm ci; npm run dev; npm test; npm run build. npm executable on machine: C:\Users\aksha\OneDrive\Desktop\Pyhton\StormRoute\.tools\node-v24.18.0-win-x64\npm.cmd. Node24 on PATH. Node22+ intended prereq; no Docker found previously. esbuild platform binary installed but postinstall approval policy must not be bypassed; runtime bundling still needs verification. npm start currently inherited next start is incompatible with static export and must be replaced by the planned runtime start. No keys needed.

Sites project already registered in .openai/hosting.json: appgprj_6aa0d6b6a8e881918055225955eaf259. Expected https://stormroute.fabled-brush-2155.chatgpt.site, unpublished. Do not create duplicate project. Sites building/hosting skill applies. Future Worker dist/server/index.js + dist/client packaging; inspect hosting script contract before build. Prior remote credential expired; refresh securely at deployment, never write token to repo or output. No runtime MCP/paid AI dependency.

Workers routing/weather finished; NWS followup and road metadata workers hit usage limit after edits, root inspected/fixed/tested saved files. Event worker failed before writing. No active workers need to be resumed to recover work. Root owns this state file and must checkpoint verified milestones before beginning the next.

Final checkpoint verification: all71 tests pass; TypeScript passes; Next production compile/type/lint/static export completed successfully. Live provider smoke exit0. Full MVP remains incomplete as enumerated above.

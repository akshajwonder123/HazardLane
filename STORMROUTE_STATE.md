# StormRoute working state

Updated: 2026-09-09. Status: milestones 1 and 2 implemented; see the latest milestone-2 checkpoint at the end for verification and next task.

## Product definition
Map-first weather-aware driving route comparison, with real road routes, multipoint forecasts, US official alerts, optional mapped road attributes and road events. Deterministic localized Low/Medium/High risk; never a safety guarantee. No paid API or generative AI dependency.

## Starting state / repository structure
Owner supplied `C:\Users\aksha\OneDrive\Desktop\Pyhton\StormRoute`. Inspected all app source, configuration, docs and tests. Copied 52 source files into selected workspace, excluding environments, credentials, dependencies and generated output. Original remains available; local Git baseline `40c1458` preserves inspected source. No pre-existing Git history/AGENTS.md. Original backend: 29/29 tests pass.

## Current architecture / normalized models
Original: Next.js 15, React 19, TypeScript, Tailwind 3; FastAPI single-location API. Retain Next/React and lockfile. New route service uses TypeScript and standard Request/Response for one Node deployment or Sites Worker, removing the separate Python hosting prerequisite. Most old provider/domain/scoring code needs replacement for geometry, batching and severe-alert logic regardless of runtime. Retire old runtime after replacement validation. Frontend lib holds domain/geometry/risk, server holds providers/cache/API/runtime adapters. Sites registered privately in .openai/hosting.json; no deployment yet.

## Data-provider decisions
Evaluate MapLibre + OpenFreeMap; Photon autocomplete; Valhalla with OSRM fallback; batched Open-Meteo forecasts; NWS official alerts; bounded Overpass metadata; configured legitimate WZDx feeds. Verify documentation and live behavior before adopting.

## Risk algorithm / thresholds
To implement and calibrate: nonlinear precipitation/gust/visibility hazards, precipitation + freezing interactions, geographically intersecting alert overrides, limited evidence-based roadway modifiers. Bounded 0–100 scores; aggregation combining weighted exposure, percentile and critical segment floors. Unknown coverage remains unknown. Thresholds pending scenario calibration.

## Cache policies
Planned: short weather/alerts caching, longer geocoding/routing and road metadata caching, deduplicated concurrent requests, bounded sizes and timeouts. Final durations pending implementation.

## Completed functionality
- Milestone 1: Next map-first responsive interface, route entry shell, swap, methodology dialog, planned result rendering and nullable normalized domain models. Removed obsolete Mapbox dependency and location-only UI. Search/analysis API deliberately not connected yet; no production mock results.
- Verified milestone 1: frontend production build succeeds; threshold test passes; real OpenFreeMap roads render in browser at 1440×900 and 390×844; methodology opens/closes, no horizontal overflow. Browser tab id `1` (provider tab `7519625c-427b-404f-840e-0af7706c06d3`).
- MapLibre 6 requires a separate module worker + shared module. `scripts/prepare-assets.mjs` copies these and their license automatically before dev/build. Fixed canvas sizing and separate `.next-dev` output to avoid concurrent preview/build corruption.
- Read full supplied goal objective.
- Inspected selected workspace and registered project; confirmed empty.

## Incomplete functionality / known bugs
Route functionality pending. Old defects: missing weather coerced to zero; minimum one-hour analysis cache; generic watch/warning counts; weak tree/elevation proxies; Safe terminology; paid Mapbox autocomplete; no ice, snow or route model.

## Test status
Verified: original Python baseline 29/29; new frontend threshold test 1/1; production build succeeds; desktop and phone map/interface checks pass. Not yet implemented: geometry, provider failure/partial data, cache, hazard interactions, severe geographic alerts, aggregation, recommendation tests or live application end-to-end analysis. Provider probes alone are not application end-to-end verification.

## Setup / environment
In `frontend`: `npm ci`, `npm run dev`, `npm test`, `npm run build`. Node 22+ recommended. Active preview http://localhost:3000, retained exec session 97875. npm on this machine: `C:\Users\aksha\OneDrive\Desktop\Pyhton\StormRoute\.tools\node-v24.18.0-win-x64\npm.cmd`. API/startup scripts still pending; old Python service is baseline only. No keys required. Source installation succeeded; esbuild postinstall is pending npm allow-scripts review but optional platform binary may suffice. Do not bypass package security policy.

## Provider limitations / technical decisions
Never use public Nominatim for autocomplete. Hosted community services are replaceable and have limits/no uptime guarantee. Missing road metadata is unknown, never a penalty. OSM is static mapped data, not pavement inspection. Road event coverage must be explicit and cannot imply nationwide closure knowledge.

## Implementation plan / current next task
Checkpoint: `72b2192` contains the verified milestone-1 source. Working tree was clean when checked after the usage-limit warning. Full objective and new model-efficiency/continuity policy are saved in `docs/GOAL_OBJECTIVE.md` and `docs/OPERATING_POLICY.md`; `AGENTS.md` directs future sessions to them. Do not restart the goal. Root owns this file and integration. Use cheaper bounded workers where useful; no concurrent coding against unsettled interfaces.
USER REQUIREMENT: finish and verify each major step, keep valid runnable source, checkpoint Git and update this file before starting the next step. Current next: geometry sampling/intersection and calibrated deterministic risk/route comparison with automated fixtures. Do not redo milestone 1. Then provider/API integration, end-to-end UI validation, docs/startup and private deployment. Sites project is registered but unpublished.
1. DONE: inspect supplied original source, preserve Git baseline and run its 29 passing backend tests.
2. Build normalized providers and bounded cache; geometry sampling and calibrated risk/comparison engine with fixtures/tests.
3. Build map-first responsive UI, autocomplete, route analysis, localized risks, explanations and confidence states.
4. Validate several live journeys and phone/tablet/desktop behavior; fix failures.
5. Finish README, reproducible startup/deployment, attribution and limitations; publish validated MVP.

## Milestone 2 checkpoint (2026-09-09)

Supersedes the milestone-1-only status above. Geometry and deterministic risk modules are implemented and root-reviewed. Geometry worker corrections include malformed rings, distance ordering, antipodal rounding and antimeridian fixtures. Risk calculation supports nonlinear precipitation, wind, visibility, snow/freezing interactions, bounded road modifiers, explicit official-alert severity floors, closure evidence, distance-weighted exposure/P90/peak floors, missing-data states and practical detour recommendations. Exact mathematics and calibration assumptions: docs/RISK_MODEL.md.

Verification: 37 automated tests pass, including a narrow warning polygon between weather samples producing a critical route result, a five-mile dangerous stretch inside a 1,000 km journey, unknown weather, geometry edge cases and detour limits. TypeScript check passed before the final integration fixture; final production build outcome recorded below. These are deterministic fixture checks, not live end-to-end verification or a scientifically validated crash probability model.

Current files: frontend/lib/geometry.ts, frontend/lib/risk-engine.ts, their test files, docs/RISK_MODEL.md. No provider/API implementation exists yet. Frontend remains a runnable map/entry shell; /api/search and /api/analyze still require implementation. Original Python runtime remains baseline only.

Exact next task: establish server provider/result and shared bounded HTTP/cache interfaces, then independently implement routing/geocoding, weather/NWS, and road metadata/events providers with explicit file ownership. Root integrates geographically split route segments, arrival-time forecasts, API input constraints and Node/Worker adapters. Never give a missing provider a clear-data status. After API integration, perform actual live route/browser checks, rewrite setup/README and publish the validated application. Do not redo milestones 1 or 2 unless a concrete defect is found.

Provider findings to preserve: Photon public autocomplete returned real coordinates; Valhalla returned real primary/alternate routes but shape was polyline6 despite shape_format:geojson (decode or request format:osrm). Disable predicted/current traffic costing. Open-Meteo supports batched coordinates and hourly driving variables (C, mm, cm, km/h, metres). NWS active land alerts included many null geometries, so affectedZones resolution and exact intersections are necessary; never assign whole-state alerts to a route. Cache alerts at least 60 seconds, weather short, OSM longer. Bound Overpass queries to a few route sample areas and match nearby roadway geometry before using modifiers. Public hosted services have limits and no SLA.

Road-event research candidate: official Iowa DOT 511 page https://iowadot.gov/travel-tools/iowa-511/511-data-feeds links public WZDx https://iowa-atms.cloud-q-free.com/api/rest/dataprism/wzdx/wzdxfeed. Research observed HTTP 200/version 4.0. Root must independently verify freshness, dates, impacts and geometry before adoption. MultiPoint duplicated endpoints are common and cannot be treated as a precise centerline. Filter all-lanes-open and inactive events. Represent partial jurisdiction/work-zone-only coverage honestly. A Utah feed was stale (2023) and rejected. Avoid printing raw USDOT registry rows: some URLs contain provider keys.

User model-efficiency instructions are preserved in docs/OPERATING_POLICY.md and AGENTS.md. Full acceptance criteria remain docs/GOAL_OBJECTIVE.md. Root owns integration/state. Completed independent workers: geometry (terra/medium) and road-event research (luna/low); do not depend on their live sessions to resume.


Milestone-2 final verification: production build completed successfully (compile, type/lint checks, static export). All 37 tests pass. Integrated source checkpoint: e7e796b. Working tree checked clean immediately after that checkpoint; this final build record is the only follow-up documentation change. No new milestone started during the usage-limit save request.

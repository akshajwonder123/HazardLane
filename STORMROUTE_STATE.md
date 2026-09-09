# StormRoute working state

Updated: 2026-09-09. Status: milestone 1 complete and verified; begin geometry/risk subsystem next.

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

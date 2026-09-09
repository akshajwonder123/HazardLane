# StormRoute working state

Updated: 2026-09-08. Status: initial inspection.

## Product definition
Map-first weather-aware driving route comparison, with real road routes, multipoint forecasts, US official alerts, optional mapped road attributes and road events. Deterministic localized Low/Medium/High risk; never a safety guarantee. No paid API or generative AI dependency.

## Starting state / repository structure
The selected workspace `C:\Users\aksha\OneDrive\Documents\ChatGPT\Stormroute` was empty (including hidden files), with no Git repository, code, configuration, tests, or project instructions. The requested existing repository has not been provided. Repository location requested from owner; continue independent provider verification meanwhile.

## Current architecture / normalized models
No existing implementation available. Planned separation: API input validation, replaceable providers, cache, geometry sampling, normalized forecasts/alerts/roads/events, deterministic segment risk, route aggregation/comparison, accessible responsive map UI. Models and exact stack pending source inspection.

## Data-provider decisions
Evaluate MapLibre + OpenFreeMap; Photon autocomplete; Valhalla with OSRM fallback; batched Open-Meteo forecasts; NWS official alerts; bounded Overpass metadata; configured legitimate WZDx feeds. Verify documentation and live behavior before adopting.

## Risk algorithm / thresholds
To implement and calibrate: nonlinear precipitation/gust/visibility hazards, precipitation + freezing interactions, geographically intersecting alert overrides, limited evidence-based roadway modifiers. Bounded 0–100 scores; aggregation combining weighted exposure, percentile and critical segment floors. Unknown coverage remains unknown. Thresholds pending scenario calibration.

## Cache policies
Planned: short weather/alerts caching, longer geocoding/routing and road metadata caching, deduplicated concurrent requests, bounded sizes and timeouts. Final durations pending implementation.

## Completed functionality
- Read full supplied goal objective.
- Inspected selected workspace and registered project; confirmed empty.

## Incomplete functionality / known bugs
All application functionality remains to implement or recover from source. No code yet to assess for bugs.

## Test status
Not started. Required suites: geometry sampling; provider normalization/failure/partial data; cache; hazard calibration and interactions; severe geographic alerts; aggregation protecting short dangerous segments; route comparison; real provider and responsive browser validation.

## Setup / environment
Windows PowerShell. Node, Python 3.13 and Git available. npm command and Docker not presently on PATH. No keys required by intended MVP. Setup commands will be recorded after framework selection.

## Provider limitations / technical decisions
Never use public Nominatim for autocomplete. Hosted community services are replaceable and have limits/no uptime guarantee. Missing road metadata is unknown, never a penalty. OSM is static mapped data, not pavement inspection. Road event coverage must be explicit and cannot imply nationwide closure knowledge.

## Implementation plan / current next task
1. Locate existing source or confirm empty-workspace initialization; inspect all source before architectural changes.
2. Build normalized providers and bounded cache; geometry sampling and calibrated risk/comparison engine with fixtures/tests.
3. Build map-first responsive UI, autocomplete, route analysis, localized risks, explanations and confidence states.
4. Validate several live journeys and phone/tablet/desktop behavior; fix failures.
5. Finish README, reproducible startup/deployment, attribution and limitations; publish validated MVP.

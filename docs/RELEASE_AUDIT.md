# StormRoute MVP acceptance audit

Audit updated: 2026-09-12. Scope: every requirement in GOAL_OBJECTIVE.md, including clean developer startup. Prior completed audits and coverage verification are accepted from their recorded checkpoints. Hosted transport incompatibility was fixed and verified. **Hosted weather is rate-limited, so full end-to-end release acceptance is incomplete. MVP is not declared complete.**

| Acceptance area | Implementation and evidence | Result |
|---|---|---|
| Preserve and improve existing code | Original Desktop repository inspected and untouched; sanitized baseline40c1458; retained Next/React/TypeScript; obsolete Python removed only after replacement passed | Pass |
| Real location search and selection | Photon adapter; keyboard autocomplete, stale-request cancellation, swap; real DC/Iowa/London browser selection; hosted Baltimore search200/6results | Pass |
| Driving routes and alternatives | Valhalla native geometry/maneuvers, primary plus up to2 distinct alternatives; local route-shape dedupe regression; real DC3routes and Iowa2routes; hosted DC62.262/71.227/65.221km routes | Pass |
| Route sampling and arrival forecasts | Adaptive max64samples/route,192total; batched Open-Meteo hourly data; temporal alignment/range/unit tests; Iowa64complete forecasts, London53 | Pass |
| Official US warnings and coverage | Direct polygons and resolved zones; exact spatial and temporal cuts; real DC available, Toronto outside, Detroit–Windsor partial | Pass |
| Road metadata and closures | Sparse Overpass evidence restricted to matched road; Iowa WZDx freshness/name/direction/arrival validation; MultiPoint does not invent centerlines; actual Iowa reports | Pass |
| Unknown data and failures | Nullable normalized fields, partial coverage UI; outage/malformed/rate-limit/timeout fixtures; real Photon and OSM failures surfaced | Pass |
| Defensible calibrated risk | Piecewise nonlinear physical hazards, explicit interaction/floor rules and0–100 bounds; RISK_MODEL.md; representative calibration fixtures | Pass |
| Short dangerous sections | Distance-weighted aggregation plus peak/critical floors; five-mile danger inside1000km and narrow tornado regressions | Pass |
| Practical safer alternatives | Same risk engine for every route; meaningful improvement, coverage and travel budgets; Low primary retained; trivial/absurd detours rejected | Pass |
| Localized map and explanation | Colored route sections, text risk labels, deterministic causes, hazard focus, route switching/fit; mobile hazard navigation verified; hosted geometry/markers and honest unknown risk render | Pass locally; hosted known-risk confirmation pending |
| Responsive accessible controls | Semantic labels, keyboard selection/Escape, text+color risk, loading/cancel/errors; screenshots390x844,768x1024,1280x800; no horizontal overflow | Pass |
| UI/source/privacy polish | Readable metadata, MapLibre CSS at root, visible attribution, Photon/Iowa links, precise transient-cache privacy, duration and tiny-distance formatting | Pass |
| Performance and robustness | Batched parallel requests, bounded concurrency/queue/cache, coalescing, no failure caching, timeouts and host cooldown; automated HTTP tests | Pass |
| API security | Constrained bodies/locations/methods/origins, quotas, origin allowlist, no arbitrary proxy, manual redirect rejection, static path isolation | Pass |
| Provider-independent architecture | Domain contracts, adapters, analyzer, engine, API and separate Node/Worker runtime; no provider payloads in risk engine | Pass |
| Keyless/no paid or AI runtime | Public replaceable endpoints; no generative model calls, key/account/database/geodata prerequisites for local use; provider limits documented | Pass |
| Documentation and attribution | README, RISK_MODEL, THIRD_PARTY, operating policy, persistent state and checkpoint history in Git | Pass; final state update pending |
| Meaningful offline tests |95/95 full suite in clean source; subsequent focused transport/Worker suite9/9 with two new regressions; TypeScript passes | Pass |
| Actionable hosted forecast failures | Sanitized rate-limit/timeout/unavailable/invalid-data reasons preserved from adapter through analyzer; partial and total outage tests;21focused checks and September12production build pass; version6hosted API/browser/screenshot show explicit rate-limit reason with unknown risk | Pass |
| Clean install/build/start | Git archive fbcf4b3 with no dependencies/output; root setup/test/build/start successful; runtime checks from clean copy on3002; later server-only change rebuilt | Pass |
| Private Sites runtime | Owner-only audience retained; page/map load; authenticated health200/mapworker200JS/source and env404; unauthenticated401; version4 fixes edge redirect incompatibility; version5 logs provider failure statuses | Deployment pass; full hosted weather gate incomplete |

## Current hosted evidence

On September11 and again2026-09-12T21:35:40Z, legitimate hosted DC–Baltimore analysis returned3routes and real US alerts. Weather coverage was0of33/37/34samples. Sanitized Worker diagnostics confirm Open-MeteoHTTP429 and OverpassHTTP521; the UI correctly avoids assigning Low Risk to missing forecasts. Provider quota exhaustion cause is not established. Do not bypass quotas or count this degraded response as a successful complete-weather release check. The remaining gate is real hosted forecasts, risk rendering/selection verification and final documentation signoff once legitimate requests can succeed.

## Scope and interpretation

Live journeys exercised real public services on US, Canadian, cross-border and UK routes. Severe-weather and alternative-selection scenarios are deterministic fixtures, not fabricated live observations. A live tornado trip is neither necessary nor claimed. Calibration establishes plausible heuristic behavior, not measured crash prediction.

The index cannot guarantee safe roads. Forecast sampling is finite, ETAs use static speeds, road tags are sparse/static, Iowa events are approximate reported positions, official alerts cover the US and current outlook, and missing data remains unknown. Public endpoints have quotas and no uptime guarantee. Per-process caches/rate limits need shared enforcement before broad public scaling. The default use is a small noncommercial demonstration.

Version6(49dc47c) privately deployed2026-09-12T21:44:46Z. Hosted API21:46:06Z and subsequent browser confirm explicit forecast throttling. Browser OSM recovered with12of33matched samples; NWSavailable and Iowaoutside remain honest. Coverage screenshot inspected. This completes the failure-message release step, not the blocked complete-weather acceptance gate.

Final continuation check2026-09-12T21:48:50Z: unchanged version6 still returns0%weather with explicit rate limiting on all3routes. Same external blocker verified for a third consecutive goal turn. Goal is blocked pending provider availability; final full-objective acceptance remains unproven. Repository source/build and completed tests are preserved; no additional redeployment is needed to recheck weather later.

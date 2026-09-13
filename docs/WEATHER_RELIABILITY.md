# Weather service reliability review

Status: in progress, September13,2026. A successful retry alone does not close this review. The hosted429body and Retry-After must be inspected; shared-instance enforcement and upstream availability remain acceptance questions.

Hosted evidence captured2026-09-13T17:55:23.578Z: one342metre route used4weather locations and received HTTP429 JSON reason exactly `Daily API request limit exceeded. Please try again tomorrow.` No usable Retry-After value was captured. The conservative next eligible request time is2026-09-14T17:55:23.578Z. Do not probe again before this deadline, including after deployment/restart. This confirms daily quota exhaustion, not a short transient outage. Its cause (this app versus shared upstream egress usage) is not established. One eventual success cannot prove normal service reliability.

## Request cost

The analyzer requests at most3routes and64samples per route,192total. Identical coordinates rounded to0.0001degree are deduplicated without changing the sampling geometry. Up to32coordinates form each HTTP batch, at most6requests per cold analysis, with2batches in flight per forecast operation. Open-Meteo counts each location toward quota; batching is not a6-call quota budget. With7hourly variables and3days, the maximum is192weighted calls per uncached analysis. [Maintainer explanation](https://github.com/open-meteo/open-meteo/discussions/804), [pricing](https://open-meteo.com/en/pricing).

The existing per-process2analyses/minute,20/hour,40/day bounds imply at most384,3840,7680coordinate calls respectively, below free limits600/minute,5000/hour,10000/day for a single process. Other users sharing an upstream egress address and multiple Worker instances are outside those counters. Two simultaneous analyses may each have two weather batches in flight. No claim of globally enforced quotas is made.

## Confirmed weaknesses and changes

- Previous JSON cache keys included the entire ordered batch URL. Reordered/overlapping routes lost reusable data. The provider now stores validated raw hourly rows per exact rounded coordinate for10minutes, bounded to256entries/8MB, and coalesces simultaneous coordinate misses. Each caller selects data for its own arrival; no cached score is reused.
- The provider owns forecast freshness. The underlying batch-cache TTL is disabled for weather to avoid restarting the age of already cached rows. Stale rows and failed requests are never served as weather.
- A429stops later unsent network batches, while already in-flight responses and fresh cached rows remain usable. There is no automatic retry loop.
- Previous backoff ignored HTTP-date Retry-After and shortened values over5minutes. Both forms now retain the full provider delay. Known daily/hourly quota reasons impose conservative24h/1hcooldowns; repeated unqualified429s use increasing60second-to1hourbackoff. Fresh successful cache entries remain usable during cooldown.
- ProviderErrors carry retry deadlines; APIs that directly return429include Retry-After. A partially successful route analysis remains200with explicit weather-unavailable detail, not a false Low Risk score.
- Bounded429diagnostics read at most4096bytes and retain only recognized fixed quota reasons, safe Retry-After metadata and the computed deadline. They omit journey coordinates, query strings, response payloads and secrets.

## Verification

Focused HTTP/API/rate-limit/weather/analyzer42tests passed after integration; additional3edge cases passed in the21-test weather/API run. These include reordered/overlapping cache reuse, arrival-time selection, coalescing, expiry, entry bounds, cached later-batch preservation during429, undefined-payload settlement, long/date Retry-After, daily/hourly fallback and safe diagnostic filtering. TypeScript and Node/Worker production server build passed. Previously verified risk/calibration/coverage checks were not repeated.

## Limits still requiring evidence

In-memory cache/cooldown/admission state is isolated by process/Worker instance and disappears on restart. It reduces waste but does not establish a shared production budget or prevent other applications exhausting a shared upstream IP quota. No rate-limit workaround, alternate egress, paid endpoint, API key, sampling reduction or fabricated weather was introduced. Hosted response inspection and a justified decision about these limits are required before final acceptance.

## Shared quota implementation (local verification complete; deployment pending)

Hosted Worker weather now requires a platform-provisioned D1 binding DB. A single row stores only weighted counters, window start times and blocked_until. Atomic admission caps cold coordinate calls at500/minute,4000/hour,8000/day across app instances. Requests denied by storage/quota never contact Open-Meteo. Failed requests retain their reservation conservatively. A recognized provider cooldown persists monotonically; denied calls return the full applicable deadline. The existing ten-minute coordinate cache remains per-instance; no distributed forecast cache is claimed.

The generated migration is packaged with the site. Local Node startup remains database-free. Missing/malformed hosted storage fails weather closed, retaining honest unknown results and other application functions. This shared budget cannot reserve capacity against unrelated users of a shared upstream IP and public providers still have no SLA. No quota bypass or required paid weather service/key was introduced. Sites D1 provisioning/free-tier compatibility and updated clean setup remain deployment acceptance gates.

Integration verification:23 HTTP/backoff/SQLite-budget/Worker tests and15 forecast-provider tests passed, plus TypeScript and Node/Worker bundles. SQLite tests use actual atomic SQL shared by two helper instances. HTTP tests prove weighted deduplication/cache behavior, zero upstream requests on budget denial/storage failure, and persistence of the full daily cooldown. WEATHER_NOT_BEFORE is configured in Sites as2026-09-14T17:55:23.578Z to preserve the observed hold through the first migration deployment.

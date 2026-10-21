# HazardLane risk model — experimental MVP

This deterministic index expresses relative driving hazards, not accident probability or a guarantee of safe travel. Scenario calibration is a plausibility check; it is not validation against crash outcomes. The engine is provider-independent and uses no generative AI.

## Input contract

Weather uses °C, hourly precipitation in mm, hourly snowfall in cm, sustained wind/gusts in km/h, and visibility in metres. Values are nullable. The provider layer must validate units, physical ranges, timestamps and geometry before scoring. Callers must pass only geographically intersecting alerts and temporally relevant, spatially matched road events. Weather is selected for estimated arrival along the route. Active official alerts describe the current official outlook; they cannot guarantee conditions at a future arrival.

The analyzer splits hazard sections at spatial entry/exit and at warning onset or event start/end times converted to route distance using the same proportional-distance ETA model. This preserves short active portions that midpoint-only filtering would miss. Current warnings remain visible after their stated expiry with a check-for-updates explanation; expiry is not evidence of future safety. Road-event positions retain the provider-validated route edge and travel direction, with approximate point influence clipped to that edge rather than projected onto a nearby incompatible road.

## Local physical hazards

Each row below defines a piecewise-linear curve between anchors. Slopes are deliberately unequal; heavy precipitation and damaging gusts have much more influence than light rain or an ordinary breeze.

| Variable | Input → component score anchors |
|---|---|
| Precipitation mm/hour | 0→0, 0.2→1, 1→5, 2.5→12, 5→25, 10→45, 20→68, 35→88 |
| Gust km/h | 0→0, 35→0, 50→8, 65→22, 80→42, 100→65, 120→85 |
| Sustained wind km/h | 0→0, 30→0, 50→15, 70→35, 90→65, 120→90 |
| Visibility m | 0→95, 50→90, 200→68, 500→48, 1000→28, 2000→12, 5000→3, 10000→0 |
| Snow cm/hour | 0→0, 0.1→5, 0.5→20, 1→35, 2→55, 4→75, 8→90 |

Wind is the larger of sustained/gust components, avoiding double-counting. Dry cold alone adds nothing. At least 0.2 mm/hour precipitation with air temperature ≤2°C creates a possible-ice component of 48; at ≤0°C it is 65. Precipitation ≥2 mm/hour adds 8. WMO freezing-precipitation codes create 75 or 85. These signals indicate potential surface ice, not measured road temperature.

Take the largest rain/snow/ice component as precipitation risk. Sort precipitation, wind and visibility into `a ≥ b ≥ c`. The physical score is `a + 0.20b + 0.10c`. This preserves a dominant hazard without equally weighting correlated variables. Add 8 when rain≥25 and visibility≥28, and 8 when snow≥20 and wind≥22.

Mapped road modifiers total at most 12: bridge with possible ice +8, bridge with wind≥22 +5, unpaved surface with rain≥12 +5. Missing tags add zero and remain unknown. These are static OSM attributes, not pavement or pothole observations.

## Alert and event floors

An explicit event table avoids treating every advisory as equally severe. Examples: Tornado Warning 100, Flash Flood Warning 90, Blizzard/Ice Storm Warning 90, Severe Thunderstorm/Winter Storm Warning 80, Flood Warning 70, High Wind Warning 75. Watches/advisories generally create 35–55. Unrelated heat or marine rip-current statements add nothing. Multiple alerts use the maximum floor, not a count multiplier. A verified matched road closure creates 95; a nonclosure work zone creates 20.

Local score is rounded and clamped to 0–100 after taking the maximum of physical risk, alert floor and event floor. Critical flags include major alert floors≥85, very poor visibility, extreme wind/snow and reported closures.

## Missing data

Complete weather requires all seven normalized variables. With no complete weather and no hazard evidence, the local score is null. A partial forecast with only low-level evidence has an unknown local category. An official warning can still establish High Risk during a weather outage. Unknown weather never becomes zero precipitation or zero wind.

## Route aggregation

Use segment lengths, not vertex counts. For segments with observed risk, compute distance-weighted mean `M`, distance-weighted 90th percentile `P90`, and peak `P`.

`exposure = 0.45M + 0.35P90 + 0.20P`

`peakFloor = P≥60 ? max(60,0.90P) : 0.85P`

`routeScore = round(clamp(max(exposure, peakFloor, criticalHazardFloor), 0, 100))`

Any positive-length High Risk section therefore produces at least a High Risk route, regardless of the clear distance around it. Critical hazards retain their full floor. The UI also reports High Risk distance and colors each section. If complete weather covers less than 95% and no Medium/High hazard is detected, overall risk is unknown. Known hazards with incomplete coverage remain visible as a lower-bound assessment.

Thresholds: Low Risk <30; Medium Risk 30–59; High Risk ≥60. These categories were chosen with the scenarios below, not to force a balanced category distribution.

## Route recommendation

Keep the standard efficient route when its risk is Low. Risk comparison requires ≥95% complete weather and available official-alert coverage (or a documented outside-coverage state) on both routes. A Medium primary needs at least 10 points improvement, ≤30% extra duration, ≤30 added minutes, and ≤35% extra distance. A High primary needs ≥12 points improvement and permits ≤60% extra duration, ≤90 added minutes, and ≤65% extra distance.

Among qualifying alternatives, maximize `riskReduction × emphasis − 0.25 × addedMinutes − 0.025 × addedKm`, where emphasis is 2 for High primary risk and 1 otherwise. Tie-break by time and stable ID. Travel budgets prevent absurd detours; the improvement threshold prevents calling trivial numerical differences safer. A lower-risk alternative that remains High explicitly says so. Coverage gaps prevent a lower-risk recommendation.

## Automated calibration

`frontend/tests/risk-engine.test.ts` covers clear/light/moderate/heavy precipitation; ordinary/strong/extreme winds; dry cold versus near-freezing precipitation; freezing codes; heavy snowfall; poor visibility; hazard interactions; severe and unrelated alerts; unknown weather/roads; and comparison budgets.

Expected scenarios: dry/ordinary breeze/light rain → Low; 5 mm/hour alone → Low; 5 mm/hour with 1 km visibility → Medium; 15 mm/hour with 400 m visibility → High; 80 km/h gust → Medium; 120 km/h gust → High; dry −8°C → Low; 1°C with 1 mm/hour → Medium; −1°C with precipitation → High; 4 cm/hour snow → High; Tornado Warning → 100.

The short-section regression places 8.04672 km (five miles) of strong wind inside a 1,000 km clear route: the weighted mean is below 1, but the route remains High. A 1 km tornado section remains 100. Subdividing a clear section into extra vertices cannot change distance-weighted results.

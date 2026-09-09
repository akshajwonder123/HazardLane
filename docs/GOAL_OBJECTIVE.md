Build StormRoute into a complete, polished, publishable MVP: a responsive weather-aware driving route safety website that works well on both desktop and mobile. Treat the existing StormRoute repository as the starting point. Inspect and understand the entire existing codebase before making architectural changes. Preserve good working components where appropriate, but refactor or replace weak or obsolete implementations when doing so materially improves the final product.



PRODUCT DEFINITION



StormRoute is a route-safety navigation application, not simply a weather lookup application.



A user enters an origin and destination. StormRoute calculates a normal practical driving route plus reasonable alternate routes, samples conditions along those routes, gathers real weather alerts, forecast data and available roadway metadata, computes risk spatially along the journey, and communicates which route is the safest practical option.



The application must not claim to guarantee that a road is safe. Use Low Risk, Medium Risk and High Risk terminology rather than absolute claims of safety.



CORE USER EXPERIENCE



Opening the website should immediately expose the main application.



Create a clean responsive header containing the StormRoute name/branding and minimal useful navigation such as methodology/about if appropriate.



The majority of the viewport should be the routing interface and map.



Provide two prominent route inputs:



From

To



Support search-as-you-type location/address suggestions. Include a convenient origin/destination swap control.



Include an Analyze Route action.



Desktop should feel similar in interaction quality to a modern mapping application, with route controls placed cleanly over or beside the map.



Mobile must be genuinely responsive and usable rather than merely shrinking the desktop interface.



MAP



Use a modern interactive road-focused map.



Prefer MapLibre GL JS with OpenFreeMap/OpenStreetMap-compatible vector data unless the existing project contains an equally strong completely free/open implementation.



Avoid unnecessary building and POI clutter. Roads, road names, geographic context, origin, destination and route geometry should be prominent.



Automatically fit the map viewport around the analyzed journey.



Render primary and alternate routes cleanly.



GEOCODING



Implement location search/autocomplete through a provider abstraction.



Do not implement client-side autocomplete against the public Nominatim server because its public usage policy prohibits this use.



Prefer Photon or another legitimate free/open solution that supports search-as-you-type.



The architecture must permit the geocoder to be replaced or self-hosted later.



Normalize selected locations into coordinates and useful display names before routing.



ROUTING



Use a proper routing engine based on actual road-network data.



Prefer Valhalla. OSRM is an acceptable fallback or secondary provider.



Retrieve a primary practical driving route and, when supported and meaningfully distinct, one or more alternate driving routes.



Do not implement traffic-aware ETA or live traffic optimization in this MVP.



Store route geometry, distance, expected travel duration and enough segment information to perform spatial risk analysis.



Do not blindly trust or depend permanently on a public demonstration routing server. Encapsulate routing behind a provider interface so a self-hosted Valhalla or OSRM instance can replace it without rewriting application logic.



ROUTE SAMPLING



Do not analyze weather only at the origin, destination or midpoint.



Build a multipoint route-sampling system.



Sample coordinates along route geometry at an adaptive spacing appropriate to route length. Include the endpoints and enough intermediate points to capture localized weather changes without issuing an excessive number of API calls.



Where upstream APIs allow multiple coordinates in a single request, batch requests.



Preserve distance/position along the route for every sampled point so local risks can later be mapped back onto route segments.



WEATHER



Use real weather information.



Prefer Open-Meteo as the primary forecast/current-condition source.



For US routes, integrate the National Weather Service API for official active watches, warnings and advisories affecting sampled sections of the route.



Collect only variables useful to driving risk. Candidate variables include:



precipitation

precipitation intensity

rain

snowfall

temperature

apparent temperature only if useful

wind speed

wind gusts

visibility

weather code

freezing conditions

relevant accumulated precipitation or snowfall where useful



Do not make excessive or redundant API requests.



Weather data must be cached for an appropriate short duration.



SEVERE WEATHER



Official severe-weather alerts should have substantial influence on risk.



Examples include:



Tornado Warning

Flash Flood Warning

Severe Thunderstorm Warning

Winter Storm Warning

Blizzard Warning

Ice Storm Warning

Flood Warning

High Wind Warning

other directly relevant NWS alerts



Map alerts geographically to the route rather than treating an alert hundreds of miles away as relevant.



ROAD DATA



Use available OpenStreetMap roadway metadata where technically useful.



Potential attributes include:



highway classification

surface

smoothness

maxspeed

lanes

bridge

tunnel

width

access/restriction information

other relevant mapped roadway characteristics



Use Overpass or an appropriate OSM data workflow carefully and efficiently.



Do not assume that missing metadata means poor road quality. Missing data should be represented as unknown.



Do not claim that static OSM metadata represents current pavement or pothole conditions.



Cache relatively static roadway metadata substantially longer than weather data.



ROAD CLOSURES / ROAD EVENTS



Implement road-event support opportunistically without inventing information.



Create a RoadEventProvider abstraction.



Support legitimate public data sources where reasonably available, potentially including WZDx work-zone feeds and jurisdiction/state 511 feeds.



Nationwide live closure coverage is not a requirement if there is no reliable free nationwide source.



If closure/event information is unavailable for part of a route, the UI and data model must represent that honestly rather than claiming that no closures exist.



Avoid traffic APIs or services requiring paid plans.



RISK ENGINE



Design a transparent deterministic risk-scoring system.



Do not use an LLM to calculate route risk.



Do not assign simplistic equal weights to rain, wind and road metadata.



Risk must reflect actual driving relevance and interactions between hazards.



General principles:



Light rain should normally have a small impact.



Moderate rain should have a meaningful but not extreme impact.



Heavy or extreme precipitation should rise nonlinearly.



Ordinary wind should not heavily penalize a route.



Wind gusts should matter more than normal sustained wind.



Very strong or damaging gusts should escalate sharply.



Temperature alone should not create major risk.



Near-freezing/freezing temperatures combined with precipitation should create substantially more risk because of potential ice.



Poor visibility should receive substantial weight.



Heavy snow, freezing rain, ice, flash flooding, tornado/severe weather and extremely poor visibility can produce major risk.



Road characteristics may modify weather risk where justified rather than overwhelming the weather model.



Bridge/exposure conditions may amplify ice or wind risk if the underlying information supports the inference.



Use interaction terms where appropriate rather than simply summing independent hazard points.



Keep the final internal score bounded from 0 to 100.



Create explicit, documented Low/Medium/High thresholds after calibrating the scoring behavior with representative scenarios. The precise thresholds may differ from the old StormRoute values if the new model behaves better.



SEGMENT RISK



Compute localized risk along route segments.



Map sampled weather/road information back onto portions of the route.



Each meaningful segment should receive a local risk level.



Allow the rendered route to show local risk spatially:



green = Low

yellow = Medium

red = High



Do not only color the entire polyline one color if local conditions vary significantly.



ROUTE-LEVEL AGGREGATION



Do not compute route risk using a naive arithmetic average.



A mostly safe trip containing a short but genuinely dangerous section must not appear harmless.



Create an aggregation approach that considers:



distance-weighted overall exposure

high-percentile segment risk

maximum or critical segment risk

duration/length of dangerous sections

official severe-weather alerts

critical-condition overrides where justified



Document the mathematical reasoning.



ALTERNATE ROUTE SELECTION



Evaluate the primary and alternate routes using the same risk engine.



Keep travel efficiency and safety as separate concepts.



When all routes are Low Risk, normally recommend the standard efficient route.



When the primary route is Medium Risk, identify a safer alternate when one exists and its added travel cost is reasonable.



When the primary route is High Risk, place greater emphasis on meaningful risk reduction and clearly surface a safer alternate if available.



Do not call an alternate safer unless its computed route risk is materially lower.



Do not recommend absurd detours to avoid minor hazards.



Create a deterministic route-utility/recommendation system balancing travel time, distance and risk.



RESULTS



After analysis, show:



recommended route

distance

estimated duration without live traffic

overall Low/Medium/High risk level

concise reason for that level

major detected hazards

location or approximate section of important hazards

alternate route when appropriate

added time/distance of alternate

risk difference between routes

closure/road-event information if actually available

data-confidence/availability states where useful



Generate explanations deterministically from structured risk-engine output.



Do not require OpenAI or any paid generative-AI API at runtime.



A Low Risk result could communicate that no significant weather or mapped roadway hazards were detected while still reminding users that StormRoute does not guarantee road safety.



A Medium or High result should identify the actual dominant causes rather than returning generic text.



ERROR STATES



Handle gracefully:



invalid addresses

ambiguous locations

no route found

routing provider unavailable

weather provider unavailable

partial weather data

road metadata unavailable

road-event data unavailable

API timeout

rate limiting

network failure

routes outside NWS coverage

unexpected provider responses



Partial information should not unnecessarily cause the entire application to fail.



Track provider/data confidence and surface material limitations honestly.



PERFORMANCE



This must feel responsive enough to use as a real website.



Parallelize independent network operations where safe.



Batch route weather coordinates where possible.



Debounce autocomplete.



Cancel stale autocomplete requests.



Cache data with durations appropriate to volatility.



Avoid enormous Overpass queries.



Avoid requesting road metadata individually for every tiny route point.



Avoid serial network request waterfalls when parallel execution is possible.



Use reasonable request timeouts and retry policies.



Deduplicate identical upstream requests.



ARCHITECTURE



Keep third-party integrations behind provider/service interfaces so providers can be swapped without rewriting the risk engine or UI.



Separate concerns clearly:



geocoding

routing

route sampling

weather

weather alerts

road metadata

road events

risk calculation

route comparison

caching

API layer

UI rendering



Do not tightly couple the risk engine to provider response formats. Normalize external data into internal domain models first.



Prefer the existing language/framework when it is sound. Do not rewrite the entire application solely to use a fashionable framework.



ZERO-COST REQUIREMENT



Do not add any required paid API, credit-card-gated provider or usage-billed service.



Prefer open-source/self-hostable components and public/open government data.



If a currently free hosted service has usage limitations or no uptime guarantee, document that and keep it replaceable.



No OpenAI API key is required for the deployed StormRoute application.



Do not introduce Mapbox, Google Maps Platform, HERE or another paid/credit-based map dependency merely for convenience if a legitimate free/open alternative satisfies the MVP.



SECURITY



Never commit credentials or secrets.



Use environment variables when a provider eventually requires configuration.



Validate and constrain API inputs.



Prevent arbitrary backend proxying or SSRF-style provider URLs.



Apply reasonable request and input limits.



Avoid exposing sensitive backend configuration to the frontend.



ACCESSIBILITY AND RESPONSIVENESS



Support keyboard navigation for essential controls.



Use semantic labels.



Maintain adequate text contrast.



Ensure risk state is communicated by text/iconography in addition to color so red/green color alone is not necessary.



Make map controls and route cards usable on touch devices.



Test at common phone, tablet and desktop dimensions.



METHODOLOGY / DISCLAIMER



Provide a concise methodology or information panel explaining at a high level that StormRoute combines route geometry, forecast/weather-alert information and available mapped roadway characteristics.



Clearly state limitations.



StormRoute is informational and does not guarantee safe travel.



Users should obey official authorities, road closures and emergency guidance.



DOCUMENTATION / PROJECT MEMORY



Immediately create or update:



STORMROUTE\_STATE.md



Treat this file as persistent project working memory intended to keep long autonomous sessions efficient and reduce rediscovery/token usage.



At minimum maintain:



1\. Product definition

2\. Current architecture

3\. Repository structure

4\. Data-provider decisions

5\. Internal normalized data models

6\. Risk algorithm and mathematical reasoning

7\. Risk thresholds

8\. Cache policies

9\. Completed functionality

10\. Incomplete functionality

11\. Known bugs

12\. Test status

13\. Setup/run commands

14\. Environment/configuration

15\. Provider limitations/usage policies

16\. Important technical decisions and rationale

17\. Current next task



Read STORMROUTE\_STATE.md whenever resuming substantial work.



Update it after each meaningful implementation milestone and whenever architecture, provider choices, risk behavior or project status changes.



Keep documentation concise and factual. Do not turn it into a verbose development diary.



TESTING



Build automated tests around the important logic.



At minimum include tests for:



route geometry sampling

risk normalization

hazard interactions

light versus heavy precipitation

ordinary versus extreme winds

freezing precipitation

low visibility

severe alerts

missing roadway metadata

route-level aggregation

dangerous short segment not being hidden by safe averages

alternate-route comparison

provider failures

partial provider data

cache behavior where appropriate



Create representative integration fixtures/mocks for third-party responses so automated tests do not depend entirely on live APIs.



Also perform actual end-to-end manual/live validation against legitimate provider endpoints before claiming the MVP works.



Test several routes of different lengths and weather situations.



CALIBRATION



Risk scoring must be calibrated rather than merely made capable of reaching High Risk.



Create documented test scenarios corresponding roughly to:



clear dry ordinary trip -> Low

light rain -> generally Low

moderate rain -> Low or Medium depending on other conditions

heavy rain and reduced visibility -> Medium or potentially High

ordinary breezy conditions -> Low

strong gusts -> increasing risk

freezing temperature while dry -> not automatically High

near-freezing precipitation -> substantial risk

heavy snow -> substantial risk

flash flood warning intersecting route -> potentially High

tornado warning intersecting route -> High/critical behavior

dangerous five-mile segment inside a long otherwise-clear trip -> route must visibly reflect that danger



Tune the model until these behaviors are sensible.



Do not artificially manipulate thresholds simply so every category appears frequently.



UI QUALITY



Make the application visually polished enough to place directly in a GitHub portfolio.



Avoid generic AI-generated-dashboard styling.



Prioritize:



map-first layout

clean typography

restrained use of cards

strong information hierarchy

subtle responsive interaction

clear route/risk indicators

professional loading states

skeleton/progress state during route analysis

useful empty/error states



Do not overload the screen with every piece of raw API data.



Users should understand the route's risk within seconds and be able to investigate details if desired.



GITHUB / PROJECT QUALITY



Clean obsolete files and dead code only when safely understood.



Keep dependencies minimal and justified.



Maintain a useful .gitignore.



Do not commit caches, generated geographic databases, secrets or local environment files.



Update the README to accurately explain:



what StormRoute is

screenshots/demo placeholders if appropriate

architecture

major data sources

risk methodology at a useful high level

local installation

configuration

testing

known limitations

attribution/licensing requirements



Do not exaggerate users, adoption, accuracy or impact.



EXECUTION STRATEGY



First inspect the repository completely enough to understand:



existing frontend

existing backend

current routing/location implementation

current APIs

risk system

tests

configuration

known broken functionality



Then create/update STORMROUTE\_STATE.md with the observed starting state and an implementation plan.



Proceed autonomously through the implementation.



Work incrementally.



After each major subsystem, run the relevant tests and fix regressions before continuing.



Do not replace working code solely because you would have designed it differently.



Do replace fragile/hard-coded code when necessary to meet this specification.



Do not leave fake implementations, placeholder risk results, mocked production data, silently swallowed errors or TODOs for required MVP functionality.



If an external provider proves unsuitable after verifying its actual documentation/behavior, select the strongest legitimate zero-cost/open alternative and document the decision in STORMROUTE\_STATE.md.



Do not repeatedly stop to ask me about small engineering decisions. Make sensible decisions consistent with the product specification and document important ones.



COMPLETION CRITERIA



The StormRoute MVP is complete only when:



A user can open the deployed-style responsive website.



A user can search for and select an origin and destination.



StormRoute can calculate a real driving route.



The route is visibly rendered on the map.



StormRoute samples multiple locations along the route.



Real weather information is retrieved and normalized.



US official NWS alerts are incorporated where applicable.



Available roadway metadata is incorporated without treating missing values as danger.



Road-event/closure information is incorporated where legitimately available and missing coverage is represented honestly.



Localized route segments receive risk assessments.



The map visibly communicates localized Low/Medium/High risk.



A defensible 0-100 internal route-risk calculation exists.



The route-level calculation cannot hide short dangerous sections through naive averaging.



Reasonable alternate routes are analyzed.



Medium/High primary routes surface a safer practical alternative when one actually exists.



The UI explains major risk causes in plain language.



Provider/API failures are handled gracefully.



Desktop and phone layouts are genuinely usable.



No required paid service exists.



No generative-AI API is required at runtime.



Core risk/routing-support logic has meaningful automated tests.



Actual live end-to-end tests have been performed.



STORMROUTE\_STATE.md accurately reflects the finished state.



README documentation is current.



The codebase can be run from documented instructions without undocumented manual hacks.



Continue working toward these acceptance criteria rather than stopping after merely creating the UI or implementing individual endpoints. DEVELOPER SETUP / AUTOMATION

Minimize manual setup required from the project owner.

Do not ask the user to manually create accounts, obtain API keys, download geographic datasets, install individual packages, or configure external services unless there is no reasonable automated or keyless alternative.

Before requesting any manual action:

1. Determine whether the requirement can be automated.
2. Determine whether an existing installed dependency already satisfies it.
3. Determine whether a legitimate keyless/open endpoint can support MVP development.
4. Prefer repository-managed dependencies and scripts.
5. Prefer Docker-based reproducible infrastructure where self-hosting becomes necessary.

The initial MVP should preferably require no API keys.

Use direct HTTP integrations for Open-Meteo, NWS, routing, geocoding and OSM-related providers rather than introducing MCP servers into production unless there is a concrete architectural justification.

If Valhalla or Photon must eventually be self-hosted, make the setup reproducible through Docker/configuration committed to the repository rather than requiring undocumented manual installation.

Do not require the user to manually perform actions that the development environment can perform safely itself.

Record every genuine manual prerequisite in STORMROUTE\_STATE.md and README.

Before declaring setup complete, verify from a clean documented startup path that a developer can launch the application using only the documented prerequisites.
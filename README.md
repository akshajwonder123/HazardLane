# StormRoute

> **Route MVP in progress.** The maintained frontend now opens a responsive road map and route planner. Run `npm ci` and `npm run dev` in `frontend`. Route services are being implemented incrementally; see [STORMROUTE_STATE.md](STORMROUTE_STATE.md) for the verified milestone and exact next task. The single-location documentation below describes the preserved starting implementation and will be replaced before release.

StormRoute is a U.S.-focused MVP for estimating **weather-related road hazard risk** at either ZIP-code or street-address level. It combines public weather and environmental signals, keeps the scoring logic transparent, and explains why a location landed in a given travel-risk category.

## MVP Scope

1. U.S.-only geocoding and NOAA alert enrichment.
2. One backend analysis route: `POST /analyze`.
3. No accounts, databases, maps, or saved searches in v1.
4. Server-side public API calls only.
5. Address-level tree coverage is optional enrichment, not a hard dependency.
6. Responses include a confidence score and source notes.

## Architecture

- `frontend/`
  - Next.js + TypeScript + TailwindCSS MVP
  - Home page for location entry and a dedicated `/results` page for analysis output
- `backend/`
  - FastAPI service with explainable scoring
  - Geocoding, weather fetch, NOAA alert enrichment, and Overpass tree-coverage enrichment

## Public Data Sources

- **Open-Meteo Weather API**
  - Current precipitation
  - Past 24h and next 12h hourly forecast data
  - Wind speed, gusts, visibility, humidity, and dew point
- **U.S. Census Geocoder**
  - Primary address geocoder for full U.S. street addresses
- **Open-Meteo Geocoding**
  - ZIP-code lookup and postal-area resolution
- **NOAA / NWS API**
  - Active zone-based alerts to reinforce flood and wind context
- **OpenStreetMap Overpass API**
  - Optional nearby green-feature lookup for address-level tree-fall context

## Scoring Model

StormRoute keeps internal `0-100` risk values for:

- `floodRisk`
- `treeRisk`
- `windRisk`
- `visibilityRisk`

### Overall weighting

ZIP searches:

```text
overallRisk =
floodRisk * 0.38 +
windRisk * 0.24 +
visibilityRisk * 0.20 +
treeRisk * 0.18
```

Address searches:

```text
overallRisk =
treeRisk * 0.34 +
floodRisk * 0.32 +
windRisk * 0.20 +
visibilityRisk * 0.15
```

### Component logic

- **Flood risk**
  - Rainfall intensity
  - Recent + near-term rainfall accumulation
  - Elevation as a lighter proxy
  - Relevant NWS flood or severe-weather alerts as meaningful reinforcement signals
- **Tree-fall risk**
  - Wind gusts
  - Sustained wind
  - Wet-ground proxy from rainfall
  - Address-only nearby mapped green coverage when Overpass succeeds
- **Wind risk**
  - Wind gusts weighted more than sustained wind
  - Relevant NWS wind or severe-weather alerts as meaningful reinforcement signals
- **Visibility risk**
  - Forecast visibility when available
  - Rainfall intensity
  - Fog proxy from humidity and dew point spread

### Risk categories

- `0-24` = Safe
- `25-54` = Slight Risk
- `55-100` = High Risk

## Fallback Behavior

- If a **U.S. street address** cannot be matched at address level, StormRoute returns a clear error instead of silently degrading to a broader place match.
- If **NOAA** alerts fail, StormRoute still returns a score using weather data only.
- If **Overpass** fails, address tree risk still works using wind + rainfall signals, but confidence is reduced.
- If visibility is missing from the weather payload, StormRoute uses rain and fog proxies with a source note.

## Project Structure

```text
StormRoute/
|-- backend/
|   |-- app/
|   |   |-- api/
|   |   |-- core/
|   |   |-- services/
|   |   |-- domain.py
|   |   |-- main.py
|   |   `-- schemas.py
|   |-- tests/
|   |-- .env.example
|   `-- requirements.txt
|-- frontend/
|   |-- app/
|   |-- components/
|   |-- lib/
|   |-- .env.example
|   |-- package.json
|   `-- tailwind.config.ts
`-- README.md
```

## Backend Setup

```powershell
cd StormRoute\backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

The backend loads `.env` automatically from the `backend/` folder.

For reproducible production or CI installs, use:

```powershell
pip install -r requirements.lock.txt
```

Keep `requirements.txt` for lightweight local dependency bootstrapping and `requirements.lock.txt` for pinned deployments.

### Backend environment variables

```text
FRONTEND_ORIGIN=http://localhost:3000,http://127.0.0.1:3000
REQUEST_TIMEOUT_SECONDS=8
CACHE_TTL_SECONDS=3600
CACHE_MAX_ENTRIES=1024
OVERPASS_RADIUS_METERS=350
OVERPASS_TIMEOUT_SECONDS=2.5
ENABLE_OVERPASS=true
ENABLE_NOAA_ALERTS=true
DEFAULT_USER_AGENT=StormRoute/0.1 (contact: your-email@example.com)
NOAA_USER_AGENT=StormRoute/0.1 (contact: your-email@example.com)
OVERPASS_URL=https://overpass-api.de/api/interpreter
```

The API runs at `http://127.0.0.1:8000`.

## Frontend Setup

Install Node.js first if it is not already installed.

```powershell
cd StormRoute\frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

Set `VITE_MAPBOX_TOKEN=your-public-mapbox-token` in `frontend/.env.local` to enable Mapbox AddressAutofill for street-address mode. `NEXT_PUBLIC_MAPBOX_TOKEN` also works directly, and the Next config bridges `VITE_MAPBOX_TOKEN` into the browser build automatically.

The frontend home page runs at `http://localhost:3000`, ZIP searches route to `/results?type=zip&location=20105`, and address searches route to `/results?type=address&location=1600%20Pennsylvania%20Avenue%20NW%20Washington%20DC%2020500`.

## API Contract

### Request

```json
{
  "location": "20105",
  "type": "zip"
}
```

or

```json
{
  "location": "123 Main Street Fairfax VA",
  "type": "address"
}
```

### Response

```json
{
  "inputType": "address",
  "resolvedLocation": "123 Main St, Fairfax, VA",
  "latitude": 38.85,
  "longitude": -77.3,
  "overallRisk": 67,
  "category": "High Risk",
  "floodRisk": 74,
  "treeRisk": 63,
  "windRisk": 70,
  "visibilityRisk": 28,
  "confidence": 78,
  "confidenceLevel": "medium",
  "summary": "High-risk weather conditions may affect travel. The strongest signals point to rainfall-driven flooding with added wind exposure pressure.",
  "factors": [
    "Heavy rain intensity reaches about 0.42 in per hour.",
    "Recent plus near-term rainfall adds up to roughly 1.65 in."
  ],
  "unavailableDataSources": [
    "OpenStreetMap Overpass"
  ],
  "sourceNotes": [
    "Resolved with the U.S. Census geocoder for U.S. address-level matching.",
    "NOAA/NWS active alerts were used to reinforce flood and wind context."
  ]
}
```

## Local Verification

Backend checks that do not require live API access:

```powershell
cd StormRoute\backend
.venv\Scripts\python.exe -m unittest discover -s tests
.venv\Scripts\python.exe -m pip check
cd ..
python -m compileall backend\app backend\tests
```

Frontend production build:

```powershell
cd StormRoute\frontend
npm run test
npm run typecheck
npm run build
```

Live endpoint smoke test:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8000/analyze -Method Post -ContentType "application/json" -Body '{"location":"20105","type":"zip"}'
```

## Notes

- StormRoute estimates **road hazard pressure**, not official closures or emergency instructions.
- ZIP-code scores are broader and less spatially precise than address scores.
- Overpass vegetation data is a useful proxy, but it is not a direct measure of tree health or road overhang.
- This MVP analyzes one location at a time. It does not yet evaluate full routes or turn-by-turn road segments.

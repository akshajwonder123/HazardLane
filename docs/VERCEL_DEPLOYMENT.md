# Vercel release deployment

This deployment preserves release baseline `6b16c03` and adds only Vercel runtime entrypoints/configuration. The static Next export is served from `frontend/out`; three Node functions forward `/api/search`, `/api/analyze`, and `/api/health` to the existing service. NWS fallback and risk semantics are unchanged. No Sites tooling or D1 binding is used.

## Push to GitHub

Create an empty GitHub repository named `StormRoute` (do not initialize README, license, or gitignore). In PowerShell:

```powershell
Set-Location 'C:\Users\aksha\OneDrive\Documents\ChatGPT\Stormroute'
git remote add origin https://github.com/YOUR_USERNAME/StormRoute.git
git push -u origin master
```

Replace YOUR_USERNAME with your GitHub username. Authenticate through Git's normal sign-in prompt. No remote was configured when this release was prepared.

## Import into Vercel

Choose Add New > Project, connect GitHub, and import StormRoute into your personal account.

| Setting | Value |
| --- | --- |
| Root Directory | `frontend` |
| Framework Preset | **Other** (not Next.js) |
| Install Command | `npm ci` |
| Build Command | `npm run build:vercel` |
| Output Directory | `out` |
| Node.js Version | `24.x` |
| Production Branch | `master` |
| Environment Variables | **None** |

The committed `frontend/vercel.json` supplies framework/build/output and the 60-second function duration. Keep Fluid Compute enabled. No start command, API keys, database, provider URL overrides, or NEXT_PUBLIC variables are needed. Click Deploy.

Once Ready, visit `/api/health` on the deployment URL and expect `{"status":"ok"}`. Open the main page and perform one U.S. journey using autocomplete, then select an alternate if offered. If a provider fails, inspect Vercel runtime logs before retrying; do not repeatedly analyze to chase an Open-Meteo success.

## Demo limits

Caches, cooldowns and quotas persist only within warm function instances; Vercel does not use the Sites D1 shared budget. This is a small personal demo, not a production-scale guarantee. Public provider availability remains external. NWS fallback uses trustworthy partial fields and preserves unknown risk rather than inventing missing forecasts. Vercel deployment and live provider acceptance must be checked after the owner imports the GitHub repository; local checks do not prove hosted availability.

Runtime format: https://vercel.com/docs/functions/runtimes/node-js
Duration configuration: https://vercel.com/docs/functions/configuring-functions/duration

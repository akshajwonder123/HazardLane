# Vercel release deployment

Current branding: **HazardLane**. Repository: https://github.com/akshajwonder123/HazardLane. The existing Vercel project is `storm-route`; current public URL is https://storm-route-two.vercel.app. Keep that address until a new address has been assigned and verified.

This deployment preserves release baseline `6b16c03` and adds only Vercel runtime entrypoints/configuration. The static Next export is served from `frontend/out`; three Node functions forward `/api/search`, `/api/analyze`, and `/api/health` to the existing service. NWS fallback and risk semantics are unchanged. No Sites tooling or D1 binding is used.

## Push to GitHub

The existing repository has been renamed with history and `master` preserved. From the existing checkout, push releases with:

```powershell
Set-Location 'C:\Users\aksha\OneDrive\Documents\ChatGPT\Stormroute'
git push origin master
```

The origin remote is https://github.com/akshajwonder123/HazardLane.git. Authenticate through Git's normal sign-in prompt if required.

## Import into Vercel

The repository is already connected to the existing Vercel project. Preserve its settings; do not create another project. For reference, its deployment settings are:

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

The committed `frontend/vercel.json` supplies framework/build/output and the 60-second function duration. Keep Fluid Compute enabled. No start command, API keys, database, provider URL overrides, or NEXT_PUBLIC variables are needed. Pushes to master trigger the existing integration.

## Assign the HazardLane address

Open the existing `storm-route` project in Vercel, then Settings > Domains > Add Domain. Enter `hazardlane.vercel.app` and assign it to Production without redirecting or removing `storm-route-two.vercel.app`. If Vercel reports that it is taken, try `hazard-lane.vercel.app`. An unauthenticated DEPLOYMENT_NOT_FOUND response is not proof that either name is available to claim. Account-side assignment and verification remain required.

After the branded deployment is Ready, confirm the new URL shows HazardLane, `/api/health` returns 200, search works, and a single route analysis works. Keep the old address until those checks pass. The existing API returned HTTP500 before this branding update; inspect Vercel runtime logs if it persists. Branding checks are not evidence that this separate runtime failure is resolved.

Once Ready, visit `/api/health` on the deployment URL and expect `{"status":"ok"}`. Open the main page and perform one U.S. journey using autocomplete, then select an alternate if offered. If a provider fails, inspect Vercel runtime logs before retrying; do not repeatedly analyze to chase an Open-Meteo success.

## Demo limits

Caches, cooldowns and quotas persist only within warm function instances; Vercel does not use the Sites D1 shared budget. This is a small personal demo, not a production-scale guarantee. Public provider availability remains external. NWS fallback uses trustworthy partial fields and preserves unknown risk rather than inventing missing forecasts. Vercel deployment and live provider acceptance must be checked after the owner imports the GitHub repository; local checks do not prove hosted availability.

Runtime format: https://vercel.com/docs/functions/runtimes/node-js
Duration configuration: https://vercel.com/docs/functions/configuring-functions/duration

# Dependency review — September 14, 2026

Next.js was updated within its existing major version from15.5.19 to15.5.25, verified against the npm registry. The critical direct Next.js advisory is no longer reported. Audit output is retained locally in ignored .artifacts/dependency-audit-2026-09-14.json.

The remaining audit reports6moderate and4high package entries (including transitive advisory chains). They are not evidence that deployed user input reaches those affected functions:

- Next uses static export. Production runs independently bundled Node/Worker APIs, not the Next server. No Server Actions, next/image, or runtime image optimizer is used.
- PostCSS/Browserslist process repository-owned CSS/configuration only during compilation; users cannot upload CSS, source maps or browser statistics. Their source-map disclosure/cache growth advisories are build-input risks, not public route API paths.
- sharp is Next's unused image-processing dependency. No image uploads or server image transformations exist.
- nanoid is transitive build tooling; route API code does not invoke its custom/negative-size generators.
- Drizzle Kit's transitive old esbuild advisory concerns its development HTTP server. Schema generation runs locally without that server; the application bundles with its separate current esbuild dependency. No esbuild development server is exposed.

These limitations are accepted for this private MVP with trusted source/build inputs, not a claim that dependencies are vulnerability-free. Reassess before accepting untrusted build assets, enabling Next runtime/image processing, or exposing development tooling. Do not apply an unrelated framework-major upgrade or downgrade the migration tool merely to make audit counts zero.

Evidence: frontend/next.config.ts, server/runtime-node.ts, server/runtime-worker.ts, scripts/build-server.mjs and scripts/dev.mjs; source search found no next/image, Server Actions, sharp, nanoid or PostCSS runtime use in app/components/server/scripts. Production build and isolated setup results are recorded in STORMROUTE_STATE.md.

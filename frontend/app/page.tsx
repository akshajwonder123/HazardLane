import { SearchForm } from "@/components/search-form";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-10 px-4 py-6 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-[2.5rem] border border-white/10 bg-storm-fade shadow-glow">
        <div className="grid gap-8 p-6 lg:grid-cols-[1.1fr_0.9fr] lg:p-10">
          <div className="flex flex-col justify-between gap-8">
            <div className="space-y-5">
              <span className="storm-badge">Weather-driven road hazard scoring</span>
              <div className="space-y-4">
                <h1 className="max-w-3xl font-display text-4xl leading-tight text-white md:text-6xl">
                  Check Road Safety Risk Before You Drive
                </h1>
                <p className="max-w-2xl text-base leading-7 text-storm-200 md:text-lg">
                  StormRoute turns public weather and environmental data into an explainable road hazard outlook so you
                  can gauge flood exposure, tree-fall pressure, wind handling risk, and visibility loss before a trip.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="panel-surface">
                <p className="text-xs uppercase tracking-[0.22em] text-storm-300">Built For</p>
                <p className="mt-3 text-lg text-white">Bad-weather route sanity checks</p>
              </div>
              <div className="panel-surface">
                <p className="text-xs uppercase tracking-[0.22em] text-storm-300">Data Blend</p>
                <p className="mt-3 text-lg text-white">Open-Meteo, Census, NOAA, and OSM</p>
              </div>
              <div className="panel-surface">
                <p className="text-xs uppercase tracking-[0.22em] text-storm-300">Output</p>
                <p className="mt-3 text-lg text-white">Clear safety badge with reasons, not a black box</p>
              </div>
            </div>
          </div>

          <div className="panel-surface self-stretch">
            <div className="space-y-6">
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-storm-300">Analyze a location</p>
                <h2 className="mt-3 font-display text-3xl text-white">Start on the home page</h2>
                <p className="mt-3 text-sm leading-6 text-storm-200">
                  Submit a location here, then review the full risk breakdown on a dedicated results page.
                </p>
              </div>

              <SearchForm submitLabel="Open Results" />

              <div className="rounded-3xl border border-dashed border-white/10 bg-black/10 p-4 text-sm leading-6 text-storm-200">
                Public-data scoring only. No paid AI API, no hidden model, and each risk comes back with source notes
                and factor bullets.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="panel-surface">
          <p className="text-xs uppercase tracking-[0.24em] text-storm-300">Flood Logic</p>
          <p className="mt-3 text-sm leading-6 text-storm-100">
            Weighted toward rainfall intensity and accumulation, with elevation used only as a lighter proxy signal.
          </p>
        </div>
        <div className="panel-surface">
          <p className="text-xs uppercase tracking-[0.24em] text-storm-300">Tree Logic</p>
          <p className="mt-3 text-sm leading-6 text-storm-100">
            Gusts and wet-ground conditions lead the tree-fall score, while address searches optionally add nearby
            mapped green coverage.
          </p>
        </div>
        <div className="panel-surface">
          <p className="text-xs uppercase tracking-[0.24em] text-storm-300">Visibility Logic</p>
          <p className="mt-3 text-sm leading-6 text-storm-100">
            Visibility uses direct forecast visibility when available, then supplements it with rainfall and fog
            signals from humidity and dew point spread.
          </p>
        </div>
      </section>
    </main>
  );
}

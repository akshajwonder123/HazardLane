import { AnalysisResponse } from "@/lib/types";

import { RiskBar } from "./risk-bar";
import { RiskBadge } from "./risk-badge";

function FloodIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.7]">
      <path d="M7 15c.8 1.2 2 2 3.5 2S13.2 16.2 14 15c.8 1.2 2 2 3.5 2S20.2 16.2 21 15" />
      <path d="M3 11c.8 1.2 2 2 3.5 2S9.2 12.2 10 11c.8 1.2 2 2 3.5 2S16.2 12.2 17 11c.8 1.2 2 2 3.5 2S23.2 12.2 24 11" />
      <path d="M12 3c-1 1.8-2.5 3.6-2.5 5.7a2.5 2.5 0 0 0 5 0C14.5 6.6 13 4.8 12 3Z" />
    </svg>
  );
}

function TreeIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.7]">
      <path d="M12 20v-6" />
      <path d="m12 4 4 4h-2.3l3.8 4H14l3 4H7l3-4H6.5l3.8-4H8z" />
    </svg>
  );
}

function WindIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.7]">
      <path d="M3 9h11a3 3 0 1 0-3-3" />
      <path d="M3 14h15a2.5 2.5 0 1 1-2.5 2.5" />
      <path d="M3 19h9a2 2 0 1 0-2 2" />
    </svg>
  );
}

function VisibilityIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.7]">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function ResultPanel({ result }: { result: AnalysisResponse }) {
  const confidenceLabel = result.confidenceLevel[0].toUpperCase() + result.confidenceLevel.slice(1);

  return (
    <section
      id="results"
      aria-labelledby="results-heading"
      className="rounded-[2rem] border border-white/10 bg-storm-900/70 p-5 shadow-glow backdrop-blur xl:p-6"
    >
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="panel-surface flex flex-col gap-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="storm-badge">{result.inputType === "zip" ? "ZIP analysis" : "Address analysis"}</span>
                <span className="storm-badge">Confidence {confidenceLabel}</span>
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-storm-300">Resolved Location</p>
                <h2 id="results-heading" className="mt-2 font-display text-2xl text-white md:text-3xl">{result.resolvedLocation}</h2>
              </div>
              <p className="max-w-xl text-sm leading-6 text-storm-200">{result.summary}</p>
            </div>
            <RiskBadge category={result.category} score={result.overallRisk} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-black/15 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-storm-300">Coordinates</p>
              <p className="mt-2 text-sm text-white">
                {result.latitude}, {result.longitude}
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/15 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-storm-300">Interpretation</p>
              <p className="mt-2 text-sm text-white">
                StormRoute estimates road hazard pressure, not official closure or emergency guidance.
              </p>
            </div>
          </div>
        </div>

        <div className="panel-surface">
          <div className="grid gap-4 md:grid-cols-2">
            <RiskBar label="Flood Risk" score={result.floodRisk} accent="#6ac4ff" icon={<FloodIcon />} />
            <RiskBar label="Tree-Fall Risk" score={result.treeRisk} accent="#6fd6a1" icon={<TreeIcon />} />
            <RiskBar label="Wind Risk" score={result.windRisk} accent="#ffb45c" icon={<WindIcon />} />
            <RiskBar
              label="Visibility Risk"
              score={result.visibilityRisk}
              accent="#f36b6b"
              icon={<VisibilityIcon />}
            />
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-storm-300">Primary Factors</p>
              <ul className="mt-4 space-y-3">
                {result.factors.map((factor) => (
                  <li key={factor} className="flex items-start gap-3 text-sm leading-6 text-storm-100">
                    <span aria-hidden="true" className="mt-2 h-2 w-2 rounded-full bg-surge-400" />
                    <span>{factor}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-storm-300">Data Notes</p>
              {result.unavailableDataSources.length ? (
                <div className="mt-4 rounded-2xl border border-warning/35 bg-warning/10 px-4 py-3 text-sm text-storm-100">
                  Unavailable data sources: {result.unavailableDataSources.join(", ")}
                </div>
              ) : null}
              <ul className="mt-4 space-y-3">
                {result.sourceNotes.map((note) => (
                  <li key={note} className="flex items-start gap-3 text-sm leading-6 text-storm-100">
                    <span aria-hidden="true" className="mt-2 h-2 w-2 rounded-full bg-warning" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

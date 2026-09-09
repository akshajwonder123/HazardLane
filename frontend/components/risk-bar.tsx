import { riskCategoryFromScore } from "@/lib/risk";

interface RiskBarProps {
  label: string;
  score: number;
  accent: string;
  icon: React.ReactNode;
}

export function RiskBar({ label, score, accent, icon }: RiskBarProps) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const visualWidth = clampedScore === 0 ? 0 : Math.max(clampedScore, 6);
  const riskLabel = riskCategoryFromScore(clampedScore);

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-storm-900/80"
            style={{ color: accent }}
          >
            {icon}
          </span>
          <p className="text-sm font-medium text-storm-100">{label}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs uppercase tracking-[0.2em] text-storm-100">
          {riskLabel}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} score`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clampedScore}
        aria-valuetext={riskLabel}
        className="h-2 overflow-hidden rounded-full bg-white/10"
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${visualWidth}%`,
            background: `linear-gradient(90deg, ${accent}, rgba(255,255,255,0.85))`,
          }}
        />
      </div>
    </div>
  );
}

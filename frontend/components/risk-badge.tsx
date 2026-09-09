import { normalizeRiskCategory } from "@/lib/risk";

const THEMES = {
  Safe: {
    accent: "text-emerald-300",
    border: "border-emerald-400/35",
    surface: "bg-emerald-400/12",
  },
  "Slight Risk": {
    accent: "text-warning",
    border: "border-warning/35",
    surface: "bg-warning/10",
  },
  "High Risk": {
    accent: "text-danger",
    border: "border-danger/35",
    surface: "bg-danger/12",
  },
} as const;

interface RiskBadgeProps {
  category: string;
  score: number;
}

export function RiskBadge({ category, score }: RiskBadgeProps) {
  const normalizedCategory = normalizeRiskCategory(category, score);
  const theme = THEMES[normalizedCategory];

  return (
    <div
      role="status"
      aria-label={`Overall outlook: ${normalizedCategory}`}
      className={`min-w-[15rem] rounded-[2rem] border px-6 py-5 text-center shadow-glow ${theme.border} ${theme.surface}`}
    >
      <p className="text-xs uppercase tracking-[0.22em] text-storm-300">Overall Outlook</p>
      <p className={`mt-4 font-display text-4xl md:text-5xl ${theme.accent}`}>{normalizedCategory}</p>
    </div>
  );
}

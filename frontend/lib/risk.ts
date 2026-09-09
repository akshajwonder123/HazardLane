export type RiskCategory = "Safe" | "Slight Risk" | "High Risk";

export function riskCategoryFromScore(score: number): RiskCategory {
  if (score <= 24) {
    return "Safe";
  }
  if (score <= 54) {
    return "Slight Risk";
  }
  return "High Risk";
}

export function normalizeRiskCategory(category: string, fallbackScore: number): RiskCategory {
  if (category === "Safe" || category === "Slight Risk" || category === "High Risk") {
    return category;
  }
  return riskCategoryFromScore(fallbackScore);
}

import { RiskCategory } from "./risk";

export type InputMode = "zip" | "address";
export type ConfidenceLevel = "high" | "medium" | "low";

export interface AnalysisResponse {
  inputType: "zip" | "address";
  resolvedLocation: string;
  latitude: number;
  longitude: number;
  overallRisk: number;
  category: RiskCategory;
  floodRisk: number;
  treeRisk: number;
  windRisk: number;
  visibilityRisk: number;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  summary: string;
  factors: string[];
  unavailableDataSources: string[];
  sourceNotes: string[];
}

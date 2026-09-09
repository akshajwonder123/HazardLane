from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


InputType = Literal["zip", "address"]
ResolvedInputType = Literal["zip", "address"]
ConfidenceLevel = Literal["high", "medium", "low"]


class AnalyzeRequest(BaseModel):
    location: str = Field(..., min_length=3, max_length=160)
    type: InputType

    @field_validator("location")
    @classmethod
    def clean_location(cls, value: str) -> str:
        normalized = " ".join(value.strip().split())
        if len(normalized) < 3:
            raise ValueError("Enter a valid ZIP code or full street address.")
        return normalized


class AnalyzeResponse(BaseModel):
    inputType: ResolvedInputType
    resolvedLocation: str
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    overallRisk: int = Field(..., ge=0, le=100)
    category: str
    floodRisk: int = Field(..., ge=0, le=100)
    treeRisk: int = Field(..., ge=0, le=100)
    windRisk: int = Field(..., ge=0, le=100)
    visibilityRisk: int = Field(..., ge=0, le=100)
    confidence: int = Field(..., ge=0, le=100)
    confidenceLevel: ConfidenceLevel
    summary: str
    factors: list[str]
    unavailableDataSources: list[str]
    sourceNotes: list[str]

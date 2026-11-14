"""Request models of the API."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from ..services.area_search import MAX_CENTER_LAT, AreaQuery


class AreaSearchRequest(BaseModel):
    lat: float = Field(..., ge=-90.0, le=MAX_CENTER_LAT, description="Area center latitude [deg]")
    lon: float = Field(..., ge=-180.0, le=360.0, description="Area center longitude [deg, east-positive]")
    size_km: float = Field(15.0, ge=1.0, le=30.0, description="Side of the square area [km]")
    cell_m: float = Field(250.0, ge=40.0, le=2000.0, description="Candidate cell size [m] (1 candidate per cell)")
    candidates: int = Field(150, ge=1, le=600, description="Number of candidates evaluated (highest cells first)")
    mast_m: float = Field(2.0, ge=0.0, le=20.0, description="Height of panels / antenna above the ground [m]")
    start: datetime | None = Field(None, description="Start of the period (UTC). Default: ephemeris start")
    end: datetime | None = Field(None, description="End of the period (UTC). Default: ephemeris end")
    rank_by: Literal["sun_and_dte", "sun", "dte"] = "sun_and_dte"

    def to_query(self) -> AreaQuery:
        return AreaQuery(**self.model_dump())

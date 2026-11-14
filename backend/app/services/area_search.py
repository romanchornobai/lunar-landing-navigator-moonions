"""Best landing point inside a square area (default 15 x 15 km) of the South Pole cap.

Pipeline (timed on a 12-core laptop: ~6 s for 150 candidates, ~11.5 s for 300):
  1. Candidates: the area is split in cells (default 250 m); the highest LOLA pixel of each cell is a candidate
     (illumination and Earth visibility favour local highs). The N highest candidates are kept.
  2. For every candidate, in a process pool: horizon H(theta) every 1 deg with 100 km rays (terrain.py, adaptive ray
     sampling), Sun / Earth tracks at that point over the requested dates (ephemeris.py) and the step-4 visibility
     statistics (visibility.py).
  3. Ranking by the chosen criterion (default: share of time with Sun AND Earth visible at once).
"""

from __future__ import annotations

import asyncio
import time
from concurrent.futures import Executor
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import AsyncIterator

import numpy as np

from . import ephemeris, terrain
from .visibility import SUN_RADIUS_DEG, visibility_stats

AZ_STEP_DEG = 1.0
AZIMUTHS = np.arange(0.0, 360.0, AZ_STEP_DEG)
RAY_DISTANCES = terrain.adaptive_ray_distances(max_m=100_000.0)
MAX_CENTER_LAT = -84.0  # LOLA 80S grid must cover area + 100 km rays (lat -84 -> r 182 km; 80S grid to 304 km)

RANK_KEYS = {"sun_and_dte": "sun_and_dte", "sun": "sun_mean_fraction", "dte": "dte"}


@dataclass
class AreaQuery:
    lat: float
    lon: float
    size_km: float = 15.0
    cell_m: float = 250.0
    candidates: int = 150
    mast_m: float = 2.0
    start: datetime | None = None
    end: datetime | None = None
    rank_by: str = "sun_and_dte"

    def validate(self) -> None:
        if not (-90.0 <= self.lat <= MAX_CENTER_LAT):
            raise ValueError(f"area center latitude must be between -90 and {MAX_CENTER_LAT} (DEM coverage)")
        if self.rank_by not in RANK_KEYS:
            raise ValueError(f"rank_by must be one of {sorted(RANK_KEYS)}")
        ephemeris.hour_range(self.start, self.end)  # raises if outside the ephemeris coverage


# ---- worker process state (one copy per process, set by worker_init) ----
_DEMS: list[terrain.PolarDem] | None = None
_EPH: np.ndarray | None = None


def worker_init() -> None:
    global _DEMS, _EPH
    _DEMS = terrain.open_dems()
    _EPH = ephemeris.load_ephemerides()


def worker_ping(_: int = 0) -> bool:
    return _DEMS is not None


def evaluate_candidate(args: tuple) -> dict:
    """Horizon + visibility statistics of one point. Runs inside a pool worker."""
    lat, lon, mast_m, h0, h1 = args
    h_ground, prof, n_missing = terrain.horizon_profile(_DEMS, lat, lon, AZIMUTHS, RAY_DISTANCES, (mast_m,))
    horizon, dist = prof[mast_m]
    tr = ephemeris.tracks_at(_EPH, lat, lon, h0, h1)
    stats = visibility_stats(horizon, tr.sun_az, tr.sun_el, tr.earth_az, tr.earth_el)
    return {
        "lat": round(lat, 5),
        "lon": round(lon, 5),
        "ground_height_m": round(h_ground, 1),
        "slope_deg": round(terrain.ground_slope_deg(_DEMS, lat, lon), 2),
        **{k: (round(v, 4) if isinstance(v, float) else v) for k, v in stats.items()},
        "horizon_deg": [round(float(v), 3) for v in horizon],
        "horizon_distance_m": [int(round(float(v), -1)) for v in dist],
        "ray_samples_outside_dem": n_missing,
        "ephemeris_source": tr.source_site,
        "earth_parallax_bound_deg": round(tr.earth_parallax_bound_deg, 4),
    }


# ---- main process ----
def find_candidates(dems: list[terrain.PolarDem], q: AreaQuery) -> list[dict]:
    """Highest DEM pixel of each cell of the area, sorted by height, first q.candidates."""
    cx, cy = terrain.polar_xy(q.lat, q.lon)
    half = q.size_km * 500.0
    step = terrain.DEM_SPECS[0].scale_m
    xs = np.arange(cx - half, cx + half, step)
    ys = np.arange(cy - half, cy + half, step)
    k = max(1, int(round(q.cell_m / step)))
    n = (len(xs) // k) * k
    xs, ys = xs[:n], ys[:n]
    X, Y = np.meshgrid(xs, ys)
    H = terrain.sample_terrain(dems, X.ravel(), Y.ravel()).reshape(X.shape)
    H = np.where(np.isnan(H), -np.inf, H)
    nb = n // k
    blocks = H.reshape(nb, k, nb, k).transpose(0, 2, 1, 3).reshape(nb, nb, k * k)
    idx, top = blocks.argmax(axis=2).ravel(), blocks.max(axis=2).ravel()
    order = [i for i in np.argsort(-top) if np.isfinite(top[i])][: q.candidates]
    out = []
    for i in order:
        bi, bj = divmod(int(i), nb)
        ii, jj = divmod(int(idx[i]), k)
        r, c = bi * k + ii, bj * k + jj
        lat, lon = terrain.polar_latlon(X[r, c], Y[r, c])
        out.append({"lat": float(lat), "lon": float(lon), "ground_height_m": round(float(H[r, c]), 1)})
    return out


def area_corners(q: AreaQuery) -> list[list[float]]:
    cx, cy = terrain.polar_xy(q.lat, q.lon)
    half = q.size_km * 500.0
    pts = [(cx - half, cy - half), (cx + half, cy - half), (cx + half, cy + half), (cx - half, cy + half)]
    return [[round(float(v), 5) for v in terrain.polar_latlon(x, y)] for x, y in pts]


def _summary(c: dict) -> dict:
    return {k: v for k, v in c.items() if k not in ("horizon_deg", "horizon_distance_m")}


async def run_area_search(pool: Executor, dems: list[terrain.PolarDem], q: AreaQuery,
                          top_n: int = 10) -> AsyncIterator[dict]:
    """Yields events: 'start' (area + candidate list), 'candidate' (one per evaluated point, in completion order)
    and 'result' (ranking, best point with its horizon)."""
    q.validate()
    t0 = time.perf_counter()
    loop = asyncio.get_running_loop()
    h0, h1 = ephemeris.hour_range(q.start, q.end)
    cands = await loop.run_in_executor(None, find_candidates, dems, q)
    yield {
        "event": "start",
        "data": {
            "area": {"center": [q.lat, q.lon], "size_km": q.size_km, "corners_latlon": area_corners(q)},
            "period_utc": [(ephemeris.START_UTC + timedelta(hours=h0)).isoformat(),
                           (ephemeris.START_UTC + timedelta(hours=h1 - 1)).isoformat()],
            "candidates": cands,
            "total": len(cands),
        },
    }

    futures = [loop.run_in_executor(pool, evaluate_candidate, (c["lat"], c["lon"], q.mast_m, h0, h1)) for c in cands]
    results: list[dict] = []
    try:
        for done, fut in enumerate(asyncio.as_completed(futures), start=1):
            res = await fut
            results.append(res)
            yield {"event": "candidate", "data": {"done": done, "total": len(cands), "candidate": _summary(res)}}
    finally:
        for f in futures:  # client gone or error: drop the work not started yet
            f.cancel()

    key = RANK_KEYS[q.rank_by]
    results.sort(key=lambda r: (r[key], r["sun_mean_fraction"]), reverse=True)
    yield {
        "event": "result",
        "data": {
            "rank_by": q.rank_by,
            "rank_key": key,
            "best": results[0] if results else None,
            "top": [_summary(r) for r in results[:top_n]],
            "all": [_summary(r) for r in results],
            "model": {
                "mast_m": q.mast_m,
                "sun_radius_deg": SUN_RADIUS_DEG,
                "azimuth_step_deg": AZ_STEP_DEG,
                "ray_max_m": float(RAY_DISTANCES[-1]),
                "time_step_h": 1,
                "sources": [
                    "LRO LOLA GDR LDEM_85S_20M / LDEM_80S_40M (NASA PDS Geosciences Node)",
                    "JPL Horizons hourly Sun (10) / Earth (399) directions, 2026-11-14..2029-11-14",
                ],
            },
            "elapsed_s": round(time.perf_counter() - t0, 2),
        },
    }

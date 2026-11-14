"""LRO LOLA polar DEM access and the topographic horizon model (steps 2 and 3 of the visibility model).

Data: NASA PDS Geosciences Node, LRO LOLA GDR polar products (DATA_SET_ID LRO-L-LOLA-4-GDR-V1.0):
  - LDEM_85S_20M.IMG: 20 m/px, lat -90..-85 (near field)
  - LDEM_80S_40M.IMG: 40 m/px, lat -90..-80 (far field)
  16-bit LSB integers, height [m] = DN * 0.5 relative to the sphere R = 1737.4 km, polar stereographic (spherical)
  projection true at the pole, frame "MEAN EARTH/POLAR AXIS OF DE421", pixel registration.
  Pixel (line l, sample s), 0-based:  x = (s - S0) * scale,  y = (L0 - l) * scale  [m],
  with x = r sin(lon), y = r cos(lon), r = 2 R tan((90 + lat) / 2).
  Files are git-ignored in data/dem/ (see DATA_SOURCES.md).

Step 2, observer height:   h_obs = h_terrain(lat, lon) + h_mast
Step 3, horizon:           along each azimuth theta (clockwise from local north, same convention as the JPL
                           Horizons ephemerides) a great-circle ray is sampled at ground distances d:
                               dh_eff(d) = (h_m - h_obs) - d^2 / (2 R)
                               alpha(d)  = atan(dh_eff(d) / d)            [deg]
                               H(theta)  = max_d alpha(d)
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np

R_MOON_M = 1_737_400.0  # LOLA reference sphere (label OFFSET / A_AXIS_RADIUS)
REPO_ROOT = Path(__file__).resolve().parents[3]
DEM_DIR = REPO_ROOT / "data" / "dem"


@dataclass(frozen=True)
class DemSpec:
    name: str
    size: int  # LINES = LINE_SAMPLES
    scale_m: float  # MAP_SCALE
    offset_px: float  # LINE/SAMPLE_PROJECTION_OFFSET
    max_lat_deg: float  # MAXIMUM_LATITUDE (nominal cap edge)


# Finest first: sample_terrain uses the first grid that covers each point.
DEM_SPECS = (
    DemSpec("ldem_85s_20m", 15168, 20.0, 7583.5, -85.0),
    DemSpec("ldem_80s_40m", 15200, 40.0, 7599.5, -80.0),
)


class PolarDem:
    """One LOLA polar stereographic DEM, memory-mapped (values read on demand)."""

    def __init__(self, spec: DemSpec, dem_dir: Path = DEM_DIR):
        path = dem_dir / f"{spec.name}.img"
        if not path.exists():
            raise FileNotFoundError(f"{path} not found. See DATA_SOURCES.md to download the LOLA DEMs.")
        expected = spec.size * spec.size * 2
        if path.stat().st_size != expected:
            raise ValueError(f"{path} has {path.stat().st_size} bytes, expected {expected} (incomplete download?)")
        self.name = spec.name
        self.size = spec.size
        self.scale = spec.scale_m
        self.offset = spec.offset_px
        # Only trust the grid inside its nominal cap (label MAXIMUM_LATITUDE), not in the square's corners.
        self.max_r = 2 * R_MOON_M * math.tan(math.radians(90 + spec.max_lat_deg) / 2)
        self.dn = np.memmap(path, dtype="<i2", mode="r", shape=(spec.size, spec.size))

    def pixel(self, x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Polar (x, y) m -> fractional 0-based (sample, line)."""
        return x / self.scale + self.offset, self.offset - y / self.scale

    def covers(self, x: np.ndarray, y: np.ndarray) -> np.ndarray:
        s, l = self.pixel(x, y)
        inside = (s >= 0) & (s <= self.size - 1) & (l >= 0) & (l <= self.size - 1)
        return inside & (np.hypot(x, y) <= self.max_r)

    def height(self, x: np.ndarray, y: np.ndarray) -> np.ndarray:
        """Bilinear height [m] relative to R = 1737.4 km. Points must be covered (see covers)."""
        s, l = self.pixel(x, y)
        s0 = np.clip(np.floor(s).astype(np.int64), 0, self.size - 2)
        l0 = np.clip(np.floor(l).astype(np.int64), 0, self.size - 2)
        fs, fl = s - s0, l - l0
        z00 = self.dn[l0, s0].astype(np.float64)
        z01 = self.dn[l0, s0 + 1].astype(np.float64)
        z10 = self.dn[l0 + 1, s0].astype(np.float64)
        z11 = self.dn[l0 + 1, s0 + 1].astype(np.float64)
        top = z00 + (z01 - z00) * fs
        bottom = z10 + (z11 - z10) * fs
        return (top + (bottom - top) * fl) * 0.5  # SCALING_FACTOR = 0.5 m/DN


def open_dems(dem_dir: Path = DEM_DIR) -> list[PolarDem]:
    return [PolarDem(spec, dem_dir) for spec in DEM_SPECS]


def polar_xy(lat_deg, lon_deg):
    """South polar stereographic (spherical, true at the pole): lat/lon [deg] -> x, y [m]."""
    r = 2 * R_MOON_M * np.tan(np.radians(90 + np.asarray(lat_deg, dtype=float)) / 2)
    lon = np.radians(np.asarray(lon_deg, dtype=float))
    return r * np.sin(lon), r * np.cos(lon)


def polar_latlon(x, y):
    """Inverse of polar_xy: x, y [m] -> lat, lon [deg] (lon in -180..180)."""
    r = np.hypot(x, y)
    return -90 + np.degrees(2 * np.arctan(r / (2 * R_MOON_M))), np.degrees(np.arctan2(x, y))


def destination(lat_deg: float, lon_deg: float, az_deg: np.ndarray, d_m: np.ndarray):
    """Point reached on the sphere from (lat, lon) along azimuth az (clockwise from north) after arc d.
    Broadcasts az (column) against d (row). Returns lat, lon in degrees."""
    phi1, lam1 = math.radians(lat_deg), math.radians(lon_deg)
    th = np.radians(az_deg)[:, None]
    delta = (d_m / R_MOON_M)[None, :]
    sin_phi2 = math.sin(phi1) * np.cos(delta) + math.cos(phi1) * np.sin(delta) * np.cos(th)
    phi2 = np.arcsin(np.clip(sin_phi2, -1, 1))
    lam2 = lam1 + np.arctan2(np.sin(th) * np.sin(delta) * math.cos(phi1), np.cos(delta) - math.sin(phi1) * sin_phi2)
    return np.degrees(phi2), np.degrees(lam2)


def sample_terrain(dems: list[PolarDem], x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Height [m] from the first (finest) DEM that covers each point; NaN where none does."""
    h = np.full(np.shape(x), np.nan)
    todo = np.ones(np.shape(x), dtype=bool)
    for dem in dems:
        m = todo & dem.covers(x, y)
        if m.any():
            h[m] = dem.height(x[m], y[m])
            todo &= ~m
    return h


def ground_height(dems: list[PolarDem], lat: float, lon: float) -> float:
    x, y = polar_xy(np.array([lat]), np.array([lon]))
    return float(sample_terrain(dems, x, y)[0])


def ground_slope_deg(dems: list[PolarDem], lat: float, lon: float, step_m: float = 20.0) -> float:
    """Local terrain slope [deg] from central differences of the DEM (one 20 m pixel each side)."""
    x, y = polar_xy(np.array([lat]), np.array([lon]))
    xs = x + np.array([step_m, -step_m, 0, 0])
    ys = y + np.array([0, 0, step_m, -step_m])
    h = sample_terrain(dems, xs, ys)
    if np.isnan(h).any():
        return float("nan")
    gx, gy = (h[0] - h[1]) / (2 * step_m), (h[2] - h[3]) / (2 * step_m)
    return float(np.degrees(np.arctan(np.hypot(gx, gy))))


def full_ray_distances(min_m: float = 20.0, max_m: float = 100_000.0, step_m: float = 20.0) -> np.ndarray:
    """Uniform ray sampling (the reference used by compute_horizon.py)."""
    return np.arange(min_m, max_m + 0.5 * step_m, step_m)


def adaptive_ray_distances(min_m: float = 20.0, max_m: float = 100_000.0, near_step_m: float = 20.0,
                           rel_step: float = 0.005) -> np.ndarray:
    """20 m steps near the observer, then steps of 0.5 % of the distance (845 samples instead of 5000 to 100 km).
    Benchmarked against the uniform 20 m sampling on 5 sites: max |dH| 0.04 deg, mean 0.002 deg
    (well below the 0.27 deg solar radius)."""
    out, d = [], min_m
    while d <= max_m:
        out.append(d)
        d += max(near_step_m, rel_step * d)
    return np.array(out)


def horizon_profile(dems: list[PolarDem], lat: float, lon: float, az: np.ndarray, d: np.ndarray, masts):
    """Returns (ground height [m], {mast: (H(theta) [deg], distance of the terrain point setting it [m])},
    number of ray samples outside DEM coverage)."""
    h_ground = ground_height(dems, lat, lon)

    rlat, rlon = destination(lat, lon, az, d)  # (n_az, n_d)
    x, y = polar_xy(rlat, rlon)
    h_m = sample_terrain(dems, x, y)
    n_missing = int(np.isnan(h_m).sum())

    curvature = d**2 / (2 * R_MOON_M)  # m, drop of the surface below the local tangent plane
    out = {}
    for mast in masts:
        h_obs = h_ground + mast
        dh_eff = (h_m - h_obs) - curvature[None, :]
        alpha = np.degrees(np.arctan(dh_eff / d[None, :]))
        alpha = np.where(np.isnan(alpha), -np.inf, alpha)
        k = np.argmax(alpha, axis=1)
        out[mast] = (alpha[np.arange(len(az)), k], d[k])
    return h_ground, out, n_missing

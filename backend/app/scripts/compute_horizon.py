"""Compute the 360-degree topographic horizon profile H(theta) of each candidate landing site from LRO LOLA DEMs.

Steps 2 and 3 of the visibility model (see README / DATA_SOURCES.md):

  Step 2, observer height:
      h_obs = h_terrain(lat, lon) + h_mast
  h_terrain is read from the DEM (bilinear) at the site; h_mast is the height of the solar panels / antenna
  above the ground (several values are baked, the UI picks one).

  Step 3, horizon with lunar curvature correction. Rays are cast every AZ_STEP degrees of azimuth
  (clockwise from local north, same convention as the JPL Horizons ephemerides) and marched along the
  ground from D_MIN to D_MAX in steps of D_STEP. For each sample at ground distance d with height h_m:
      dh_eff(d)   = (h_m - h_obs) - d^2 / (2 * R_moon)
      alpha(d)    = atan(dh_eff(d) / d)                [deg]
      H(theta)    = max over d of alpha(d)
  Each ray follows the great circle that leaves the site with azimuth theta, so d is the true ground
  (arc) distance and theta the true azimuth (no polar-stereographic distortion).

Data (NASA PDS Geosciences Node, LRO LOLA GDR polar products, DATA_SET_ID LRO-L-LOLA-4-GDR-V1.0):
  - LDEM_85S_20M.IMG: 20 m/px, lat -90..-85, used wherever it covers the sample (near field).
  - LDEM_80S_40M.IMG: 40 m/px, lat -90..-80, used outside the 85S grid (far field of Malapert and Nobile).
  Both: 16-bit LSB integers, height [m] = DN * 0.5 relative to the sphere R = 1737.4 km,
  polar stereographic (spherical) projection true at the pole, frame "MEAN EARTH/POLAR AXIS OF DE421",
  pixel registration. Pixel (line l, sample s), 0-based:  x = (s - S0) * scale,  y = (L0 - l) * scale  [m],
  with x = r sin(lon), y = r cos(lon), r = 2 R tan((90 + lat) / 2).

Download (git-ignored, ~920 MB) into data/dem/, see DATA_SOURCES.md.

Usage (from repo root):  python backend/app/scripts/compute_horizon.py [--az-step 1] [--max-km 100]
Output: frontend/src/data/horizonProfiles.json
"""

from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
DEM_DIR = ROOT / "data" / "dem"
OUT_JSON = ROOT / "frontend" / "src" / "data" / "horizonProfiles.json"
MODELS_DIR = ROOT / "frontend" / "public" / "models"

R_MOON_M = 1_737_400.0  # LOLA reference sphere (label OFFSET / A_AXIS_RADIUS)
MAST_HEIGHTS_M = (2.0, 4.0, 6.0)  # sensor height above the ground (typical lander mast 2-6 m)

# Site keys follow the ephemeris buffer order (frontend/src/utils/ephemerisClient.ts).
# lat / lon (planetocentric, east-positive) and the folder of the 15 km scene, whose *_meta.json has the
# DEM elevation at the site center (used as a cross-check).
SITES = {
    "shackleton": {"id": "shackleton-connecting-ridge", "lat": -89.54, "lon": 129.20, "model": "shackleton_rim"},
    "malapert": {"id": "malapert-massif", "lat": -85.99, "lon": 2.93, "model": "malapert_massif"},
    "nobile": {"id": "nobile-rim-1", "lat": -85.25, "lon": 35.80, "model": "nobile_rim_1"},
    "degerlache": {"id": "de-gerlache-rim", "lat": -88.71, "lon": -68.70, "model": "de_gerlache_rim"},
}


class PolarDem:
    """One LOLA polar stereographic DEM, memory-mapped (values read on demand)."""

    def __init__(self, name: str, size: int, scale_m: float, offset_px: float, max_lat_deg: float):
        path = DEM_DIR / f"{name}.img"
        if not path.exists():
            raise FileNotFoundError(f"{path} not found. See DATA_SOURCES.md to download the LOLA DEMs.")
        expected = size * size * 2
        if path.stat().st_size != expected:
            raise ValueError(f"{path} has {path.stat().st_size} bytes, expected {expected} (incomplete download?)")
        self.name = name
        self.size = size
        self.scale = scale_m
        self.offset = offset_px
        # Only trust the grid inside its nominal cap (label MAXIMUM_LATITUDE), not in the square's corners.
        self.max_r = 2 * R_MOON_M * math.tan(math.radians(90 + max_lat_deg) / 2)
        self.dn =np.memmap(path, dtype="<i2", mode="r", shape=(size, size))

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


def polar_xy(lat_deg: np.ndarray, lon_deg: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """South polar stereographic (spherical, true at the pole): lat/lon [deg] -> x, y [m]."""
    r = 2 * R_MOON_M * np.tan(np.radians(90 + lat_deg) / 2)
    lon = np.radians(lon_deg)
    return r * np.sin(lon), r * np.cos(lon)


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
    h = np.full(x.shape, np.nan)
    todo = np.ones(x.shape, dtype=bool)
    for dem in dems:
        m = todo & dem.covers(x, y)
        if m.any():
            h[m] = dem.height(x[m], y[m])
            todo &= ~m
    return h


def horizon_for_site(dems, lat, lon, az, d, masts):
    """Returns ground height at the site and, per mast height, H(theta) [deg] and the distance [m] of the
    terrain point that sets it."""
    x0, y0 = polar_xy(np.array([lat]), np.array([lon]))
    h_ground = float(sample_terrain(dems, x0, y0)[0])

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


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--az-step", type=float, default=1.0, help="azimuth step [deg] (default 1 -> 360 rays)")
    ap.add_argument("--min-m", type=float, default=20.0, help="first ray sample [m] (default 20)")
    ap.add_argument("--max-km", type=float, default=100.0, help="ray length [km] (default 100)")
    ap.add_argument("--step-m", type=float, default=20.0, help="ray step [m] (default 20 = finest DEM pixel)")
    args = ap.parse_args()

    dems = [
        PolarDem("ldem_85s_20m", 15168, 20.0, 7583.5, -85.0),
        PolarDem("ldem_80s_40m", 15200, 40.0, 7599.5, -80.0),
    ]
    az = np.arange(0.0, 360.0, args.az_step)
    d = np.arange(args.min_m, args.max_km * 1000 + 0.5 * args.step_m, args.step_m)

    result = {
        "description": "Topographic horizon H(theta) of each landing site: max terrain elevation angle per azimuth, "
        "with lunar curvature correction dh_eff = (h_m - h_obs) - d^2/(2R). Generated by "
        "backend/app/scripts/compute_horizon.py.",
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sources": [
            "NASA PDS Geosciences Node, LRO LOLA GDR LDEM_85S_20M (20 m/px) and LDEM_80S_40M (40 m/px), "
            "LRO-L-LOLA-4-GDR-V1.0, heights relative to R = 1737.4 km, frame MEAN EARTH/POLAR AXIS OF DE421"
        ],
        "units": {"azimuth": "deg, clockwise from local north", "horizon": "deg above the local horizontal plane",
                  "distance": "m along the ground", "height": "m relative to R = 1737.4 km"},
        "r_moon_m": R_MOON_M,
        "az_step_deg": args.az_step,
        "ray": {"min_m": float(d[0]), "max_m": float(d[-1]), "step_m": args.step_m},
        "mast_heights_m": list(MAST_HEIGHTS_M),
        "sites": {},
    }

    for key, site in SITES.items():
        h_ground, prof, n_missing = horizon_for_site(dems, site["lat"], site["lon"], az, d, MAST_HEIGHTS_M)
        meta_path = MODELS_DIR / site["model"] / f"{site['model']}_meta.json"
        meta_elev = json.loads(meta_path.read_text())["elevation"]["center_abs_meters"]
        print(f"\n== {key}  lat {site['lat']}  lon {site['lon']}")
        print(f"   ground height {h_ground:9.1f} m  (15 km scene meta: {meta_elev} m, diff {h_ground - meta_elev:+.1f} m)")
        sx, sy = polar_xy(np.array([site["lat"]]), np.array([site["lon"]]))
        for dem in dems:  # consistency between the two grids (checks the pixel <-> x, y mapping of each)
            if dem.covers(sx, sy)[0]:
                print(f"   {dem.name}: {dem.height(sx, sy)[0]:9.1f} m")
        if n_missing:
            print(f"   WARNING: {n_missing} ray samples outside DEM coverage (ignored)")
        entry = {"id": site["id"], "lat": site["lat"], "lon": site["lon"], "ground_height_m": round(h_ground, 1),
                 "profiles": {}}
        for mast, (h, dist) in prof.items():
            i = int(np.argmax(h))
            print(f"   mast {mast:g} m: H min {h.min():6.2f}  mean {h.mean():6.2f}  max {h.max():6.2f} deg "
                  f"(az {az[i]:g}, at {dist[i] / 1000:.1f} km)  far (>20 km) share {np.mean(dist > 20000):.0%}")
            entry["profiles"][f"{mast:g}"] = {
                "horizon_deg": [round(float(v), 3) for v in h],
                "distance_m": [int(round(float(v), -1)) for v in dist],
            }
        result["sites"][key] = entry

    OUT_JSON.write_text(json.dumps(result, separators=(",", ":")) + "\n")
    print(f"\nWrote {OUT_JSON.relative_to(ROOT)} ({OUT_JSON.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()

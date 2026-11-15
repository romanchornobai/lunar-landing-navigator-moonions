"""Step 4 of the visibility model: Sun disc against the horizon and Direct-to-Earth (DTE) line of sight.

Sun (disc of apparent radius R_sun, with H = H(Az_sun)):
    fully visible   El_sun - R_sun >= H
    fully hidden    El_sun + R_sun <= H
    partial         f = visible area of the disc above a straight horizon (circular segment):
                    s = clip((El_sun - H) / R_sun, -1, 1),  f = 1 - (acos(s) - s sqrt(1 - s^2)) / pi
                    (the horizon is locally a straight line across the 0.53 deg disc)
DTE link active  <=>  El_earth > H(Az_earth)   (Earth centre above the terrain)
"""

from __future__ import annotations

import numpy as np

SUN_RADIUS_DEG = 0.266  # apparent solar radius seen from the Moon (~0.2666 deg at 1 AU; +-1.7 % over the year)

def horizon_at(profile_deg: np.ndarray, az_deg: np.ndarray) -> np.ndarray:
    """Linear interpolation of a horizon sampled every 360/len(profile) deg from azimuth 0 (wraps at 360)."""
    n = len(profile_deg)
    p = (np.asarray(az_deg) % 360.0) * n / 360.0
    i0 = np.floor(p).astype(int) % n
    t = p - np.floor(p)
    return profile_deg[i0] * (1 - t) + profile_deg[(i0 + 1) % n] * t


def sun_visible_fraction(sun_el_deg: np.ndarray, horizon_deg: np.ndarray) -> np.ndarray:
    """Exact visible area fraction of the solar disc (0..1). f > 0 <=> any part of the disc above the terrain."""
    s = np.clip((np.asarray(sun_el_deg) - horizon_deg) / SUN_RADIUS_DEG, -1.0, 1.0)
    return 1.0 - (np.arccos(s) - s * np.sqrt(1.0 - s * s)) / np.pi


def dte_visible(earth_el_deg: np.ndarray, horizon_deg: np.ndarray) -> np.ndarray:
    return earth_el_deg > horizon_deg


def longest_run(mask: np.ndarray) -> int:
    """Length of the longest run of True values."""
    m = np.concatenate(([False], np.asarray(mask, dtype=bool), [False]))
    edges = np.flatnonzero(np.diff(m.astype(np.int8)))
    return int((edges[1::2] - edges[::2]).max()) if edges.size else 0


def visibility_stats(profile_deg: np.ndarray, sun_az, sun_el, earth_az, earth_el, step_hours: float = 1.0) -> dict:
    """Summary over the sampled period. Percentages are fractions of the samples (0..1)."""
    f = sun_visible_fraction(sun_el, horizon_at(profile_deg, sun_az))
    dte = dte_visible(earth_el, horizon_at(profile_deg, earth_az))
    sun = f > 0
    return {
        "sun_any": float(sun.mean()),  # any part of the solar disc above the terrain
        "sun_full": float((f >= 1).mean()),  # whole disc visible
        "sun_mean_fraction": float(f.mean()),  # time-averaged visible fraction of the disc (energy proxy)
        "dte": float(dte.mean()),  # Earth centre above the terrain
        "sun_and_dte": float((sun & dte).mean()),  # power and direct link at the same time
        "longest_dark_h": longest_run(~sun) * step_hours,
        "longest_dte_blackout_h": longest_run(~dte) * step_hours,
        "samples": int(f.size),
    }
